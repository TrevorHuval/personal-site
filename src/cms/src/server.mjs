import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { readFile, rename, writeFile } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { pipeline } from 'node:stream'
import { pathToFileURL } from 'node:url'
import {
  MAX_PASSWORD_LENGTH,
  QueueFullError,
  clientKey,
  createLimiter,
  createQueue,
  createSessions,
  verifyPassword,
} from './auth.mjs'
import { loadConfig } from './config.mjs'
import { exists, mediaFilesFor, processPhoto, sweepOrphans, UnsupportedImageError } from './photos.mjs'
import { COLLECTIONS, ValidationError, validateCollection } from './schema.mjs'
import { ConflictError, ContentStore } from './store.mjs'

const API = '/api/cms'
const COOKIE = 'studio_session'
const MEDIA_PATH = /^\/media\/photos\/(?:thumbs\/)?[a-z0-9][a-z0-9._-]*\.(?:jpg|avif)$/
const JSON_LIMIT = 2 * 1024 * 1024
const MIME = { '.jpg': 'image/jpeg', '.avif': 'image/avif' }

class HttpError extends Error {
  constructor(status, message, headers = {}) {
    super(message)
    this.status = status
    this.headers = headers
  }
}

/**
 * Builds the server without listening, so tests can drive it on a random port.
 * Public surface: the content overrides and the uploaded photos. Everything
 * else needs the session cookie issued by a successful password login.
 */
export async function createApp(config) {
  const store = new ContentStore(config.dataDir)
  await store.load()
  const mediaDir = path.join(config.dataDir, 'media')

  const configured = config.passwordHash !== '' && config.sessionSecret.length >= 32
  // Logged-out cookies stay dead across restarts.
  const revokedFile = path.join(config.dataDir, 'revoked-sessions.json')
  let revoked = {}
  try {
    revoked = JSON.parse(await readFile(revokedFile, 'utf8'))
  } catch {
    /* first run, or nothing revoked yet */
  }

  const sessions = configured
    ? createSessions({
        passwordHash: config.passwordHash,
        secret: config.sessionSecret,
        ttlMs: config.sessionTtlMs,
        revoked,
        onRevoke: (map) => {
          const temp = `${revokedFile}.tmp`
          void writeFile(temp, JSON.stringify(map), 'utf8')
            .then(() => rename(temp, revokedFile))
            .catch((error) => console.error('Could not persist revoked sessions:', error))
        },
      })
    : null
  const perClient = createLimiter({ max: 5, windowMs: 15 * 60 * 1000 })
  // Password checks run one at a time and at most three may wait, so a flood
  // is refused instead of building a backlog the owner's own login sits behind.
  const oneAtATime = createQueue({ maxPending: 3 })
  // Image decoding is the other memory-hungry job; one at a time as well.
  const oneUploadAtATime = createQueue({ maxPending: 4 })

  // The photo sweep must judge against what is saved *now*, not against the
  // list one particular request carried.
  const sweep = () => sweepOrphans(store.snapshot().content.photos ?? [], mediaDir)

  let contentCache = { key: '', body: '', etag: '' }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      if (error instanceof HttpError) {
        return send(res, error.status, { error: error.message }, error.headers)
      }
      console.error('Unhandled error:', error)
      send(res, 500, { error: 'Something went wrong on the server.' })
    })
  })
  // Slow-loris protection: a photo upload has to finish within a couple of minutes.
  server.requestTimeout = 120_000
  server.headersTimeout = 15_000

  async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://internal')
    const route = `${req.method} ${url.pathname}`

    if (req.method === 'GET' && MEDIA_PATH.test(url.pathname)) return serveMedia(url.pathname, res)
    if (!url.pathname.startsWith(`${API}/`)) throw new HttpError(404, 'Not found')

    if (route === `GET ${API}/health`) return send(res, 200, { ok: true })
    if (route === `GET ${API}/content`) return sendContent(req, res)

    // Unconfigured means the studio does not exist, rather than "exists but locked".
    if (!configured) throw new HttpError(404, 'Not found')

    if (req.method !== 'GET' && req.method !== 'HEAD') requireSameOrigin(req)

    if (route === `POST ${API}/session`) return login(req, res)
    if (route === `GET ${API}/session`) return send(res, 200, { authenticated: isAuthenticated(req) })
    if (route === `DELETE ${API}/session`) return logout(req, res)

    requireSession(req)

    const collection = url.pathname.match(new RegExp(`^${API}/content/([a-z]+)$`))?.[1]
    if (collection !== undefined) {
      if (!COLLECTIONS.includes(collection)) throw new HttpError(404, 'Not found')
      if (req.method === 'PUT') return saveCollection(req, res, collection)
      if (req.method === 'DELETE') return resetCollection(req, res, collection)
    }

    if (route === `POST ${API}/photos`) return uploadPhoto(req, res, url)

    throw new HttpError(404, 'Not found')
  }

  // ---- public ---------------------------------------------------------------

  function sendContent(req, res) {
    const snapshot = store.snapshot()
    const key = JSON.stringify(snapshot.revisions)
    if (contentCache.key !== key) {
      const text = JSON.stringify(snapshot)
      contentCache = { key, body: text, etag: `"${createHash('sha1').update(text).digest('base64url')}"` }
    }
    const { body, etag } = contentCache
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache' })
      return res.end()
    }
    send(res, 200, body, { ETag: etag, 'Cache-Control': 'no-cache' }, true)
  }

  function serveMedia(pathname, res) {
    const file = path.join(mediaDir, pathname.slice('/media/'.length))
    const stream = createReadStream(file)
    stream.once('open', () => {
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)],
        // Every upload gets a fresh random id, so a given URL never changes.
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      })
      // pipeline() closes the file when the client disconnects mid-download;
      // a bare pipe() would leak one descriptor per aborted request.
      pipeline(stream, res, () => {})
    })
    stream.once('error', () => {
      if (res.headersSent) res.destroy()
      else send(res, 404, { error: 'Not found' })
    })
  }

  // ---- session --------------------------------------------------------------

  async function login(req, res) {
    const ip = clientKey(clientAddress(req))
    const tooMany = (wait) =>
      new HttpError(429, 'Too many attempts. Try again later.', { 'Retry-After': String(Math.ceil(wait / 1000)) })

    if (perClient.retryAfterMs(ip) > 0) throw tooMany(perClient.retryAfterMs(ip))

    const body = await readJson(req, 1024)
    const password = isPlainObject(body) ? body.password : undefined
    if (typeof password !== 'string' || password === '' || password.length > MAX_PASSWORD_LENGTH) {
      perClient.fail(ip)
      throw new HttpError(400, 'Send the password as JSON.')
    }

    let ok
    try {
      ok = await oneAtATime(async () => {
        // Re-checked and charged inside the queue. Checking only on arrival lets
        // a burst all pass before the first failure is counted, so the attempt is
        // recorded up front and cleared again on success.
        const wait = perClient.retryAfterMs(ip)
        if (wait > 0) throw tooMany(wait)
        perClient.fail(ip)
        return verifyPassword(password, config.passwordHash)
      })
    } catch (error) {
      if (error instanceof QueueFullError) {
        perClient.fail(ip) // flooding counts against the flooder
        throw new HttpError(429, 'Busy. Try again in a moment.', { 'Retry-After': '5' })
      }
      throw error
    }

    if (!ok) {
      console.warn(`Failed studio login from ${ip}`)
      throw new HttpError(401, 'Incorrect password.')
    }

    perClient.clear(ip)
    const { token, expiresAt } = sessions.issue()
    send(res, 200, { authenticated: true }, { 'Set-Cookie': cookie(token, expiresAt) })
  }

  function logout(req, res) {
    sessions.revoke(cookieValue(req))
    send(res, 200, { authenticated: false }, { 'Set-Cookie': cookie('', 0) })
  }

  const isAuthenticated = (req) => sessions.verify(cookieValue(req))

  function requireSession(req) {
    if (!isAuthenticated(req)) throw new HttpError(401, 'Sign in required.')
  }

  /** SameSite=Strict already stops cross-site requests; this makes it two locks. */
  function requireSameOrigin(req) {
    const origin = req.headers.origin
    if (origin === undefined || !config.origins.has(origin)) throw new HttpError(403, 'Origin not allowed.')
  }

  function cookie(value, expiresAt) {
    const parts = [
      `${COOKIE}=${value}`,
      `Path=${API}`,
      'HttpOnly',
      'SameSite=Strict',
      value === '' ? 'Max-Age=0' : `Expires=${new Date(expiresAt).toUTCString()}`,
    ]
    if (config.secureCookies) parts.push('Secure')
    return parts.join('; ')
  }

  function cookieValue(req) {
    for (const part of (req.headers.cookie ?? '').split(';')) {
      const [name, ...rest] = part.trim().split('=')
      if (name === COOKIE) return rest.join('=')
    }
    return ''
  }

  function clientAddress(req) {
    if (config.trustProxy) {
      // Caddy appends the address it saw, so the last entry is the one to trust.
      const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',').at(-1)?.trim()
      if (forwarded) return forwarded
    }
    return req.socket.remoteAddress ?? 'unknown'
  }

  // ---- content --------------------------------------------------------------

  async function saveCollection(req, res, name) {
    const expected = requireRevision(req)
    const value = await readJson(req, JSON_LIMIT)

    let clean
    try {
      clean = validateCollection(name, value)
      if (name === 'photos') await assertUploadsExist(clean)
    } catch (error) {
      if (error instanceof ValidationError) throw new HttpError(422, error.message)
      throw error
    }

    const revision = await mapStoreErrors(() => store.write(name, clean, expected))
    if (name === 'photos') await sweep()
    send(res, 200, { revision })
  }

  async function resetCollection(req, res, name) {
    const expected = requireRevision(req)
    await mapStoreErrors(() => store.remove(name, expected))
    if (name === 'photos') await sweep()
    send(res, 200, { revision: 'none' })
  }

  function requireRevision(req) {
    const header = req.headers['if-match']
    if (typeof header !== 'string' || header === '') {
      throw new HttpError(428, 'If-Match revision is required.')
    }
    return header.replaceAll('"', '')
  }

  async function assertUploadsExist(photos) {
    for (const file of mediaFilesFor(photos, mediaDir)) {
      if (!(await exists(file))) {
        throw new ValidationError(`photos: ${path.basename(file)} has not been uploaded`)
      }
    }
  }

  async function mapStoreErrors(work) {
    try {
      return await work()
    } catch (error) {
      if (error instanceof ConflictError) throw new HttpError(409, error.message)
      throw error
    }
  }

  async function uploadPhoto(req, res, url) {
    const type = String(req.headers['content-type'] ?? '')
    if (!type.startsWith('image/')) throw new HttpError(415, 'Send the image file as the request body.')

    const body = await readBody(req, config.maxUploadBytes)
    if (body.length === 0) throw new HttpError(400, 'The file was empty.')

    try {
      const name = url.searchParams.get('name') ?? 'photo'
      const generated = await oneUploadAtATime(() => processPhoto(body, name, mediaDir))
      send(res, 201, generated)
    } catch (error) {
      if (error instanceof UnsupportedImageError) throw new HttpError(422, error.message)
      if (error instanceof QueueFullError) {
        throw new HttpError(429, 'Another upload is still processing. Try again in a moment.')
      }
      throw error
    }
  }

  return { server, store }
}

// ---- helpers ------------------------------------------------------------------

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

function send(res, status, body, headers = {}, preSerialised = false) {
  const text = preSerialised ? body : JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'X-Content-Type-Options': 'nosniff',
    // Only the public content route overrides this; nothing else may be cached.
    'Cache-Control': 'no-store',
    ...headers,
  })
  res.end(text)
}

async function readBody(req, limit) {
  const declared = Number(req.headers['content-length'] ?? 0)
  if (declared > limit) throw new HttpError(413, `That file is larger than ${Math.round(limit / 1024 / 1024)} MB.`)

  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new HttpError(413, `That file is larger than ${Math.round(limit / 1024 / 1024)} MB.`)
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function readJson(req, limit) {
  const body = await readBody(req, limit)
  try {
    return JSON.parse(body.toString('utf8'))
  } catch {
    throw new HttpError(400, 'The request body was not valid JSON.')
  }
}

// ---- entry point --------------------------------------------------------------

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const config = loadConfig()

  if (config.passwordHash === '' || config.sessionSecret.length < 32) {
    console.warn(
      'ADMIN_PASSWORD_HASH and a SESSION_SECRET of 32+ characters are not both set: ' +
        'the studio is disabled and only the public content endpoints will answer.',
    )
  }
  if (!config.secureCookies) console.warn('INSECURE_COOKIES=1: session cookies are not marked Secure.')

  const { server } = await createApp(config)
  server.listen(config.port, () => console.log(`Studio API listening on :${config.port}, data in ${config.dataDir}`))

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, () => server.close(() => process.exit(0)))
  }
}
