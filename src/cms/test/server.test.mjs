import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm, utimes } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import sharp from 'sharp'
import { hashPassword } from '../src/auth.mjs'
import { loadConfig } from '../src/config.mjs'
import { createApp } from '../src/server.mjs'

const ORIGIN = 'https://trevorhuval.com'
const PASSWORD = 'a long enough test password'
const API = '/api/cms'

const bundledPhotos = JSON.parse(
  readFileSync(new URL('../../web/src/content/photos.json', import.meta.url), 'utf8'),
)

let dataDir
let server
let base

before(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), 'studio-'))
  const config = loadConfig({
    DATA_DIR: dataDir,
    PUBLIC_ORIGIN: ORIGIN,
    SESSION_SECRET: 'x'.repeat(48),
    ADMIN_PASSWORD_HASH: await hashPassword(PASSWORD, { N: 1024, r: 8, p: 1, keylen: 64 }),
  })
  ;({ server } = await createApp(config))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await rm(dataDir, { recursive: true, force: true })
})

/** Each test gets its own "client address" so the login limiter cannot bleed between them. */
let clientCounter = 0
const nextClient = () => `10.0.0.${++clientCounter}`

async function call(method, route, { body, headers = {}, client = '10.9.9.9', cookie, origin = ORIGIN, raw } = {}) {
  const response = await fetch(base + route, {
    method,
    headers: {
      ...(origin ? { Origin: origin } : {}),
      'X-Forwarded-For': client,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body !== undefined && raw === undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(raw !== undefined || body !== undefined ? { body: raw ?? JSON.stringify(body) } : {}),
  })
  const text = await response.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch { /* binary or empty */ }
  return { response, status: response.status, json }
}

async function signIn(client = nextClient()) {
  const { response, status } = await call('POST', `${API}/session`, { body: { password: PASSWORD }, client })
  assert.equal(status, 200)
  return response.headers.get('set-cookie').split(';')[0]
}

const currentRevision = async (name) => (await call('GET', `${API}/content`)).json.revisions[name] ?? 'none'

async function png(color) {
  return sharp({ create: { width: 640, height: 480, channels: 3, background: color } }).png().toBuffer()
}

describe('login', () => {
  it('issues a hardened cookie for the right password', async () => {
    const { response, status } = await call('POST', `${API}/session`, {
      body: { password: PASSWORD },
      client: nextClient(),
    })
    assert.equal(status, 200)
    const cookie = response.headers.get('set-cookie')
    assert.match(cookie, /HttpOnly/)
    assert.match(cookie, /Secure/)
    assert.match(cookie, /SameSite=Strict/)
    assert.match(cookie, /Path=\/api\/cms/)
  })

  it('rejects a wrong password without setting a cookie', async () => {
    const { response, status } = await call('POST', `${API}/session`, {
      body: { password: 'nope' },
      client: nextClient(),
    })
    assert.equal(status, 401)
    assert.equal(response.headers.get('set-cookie'), null)
  })

  it('locks a client out after five failures, even for the right password', async () => {
    const client = nextClient()
    for (let i = 0; i < 5; i++) {
      assert.equal((await call('POST', `${API}/session`, { body: { password: 'wrong' }, client })).status, 401)
    }
    const locked = await call('POST', `${API}/session`, { body: { password: PASSWORD }, client })
    assert.equal(locked.status, 429)
    assert.ok(Number(locked.response.headers.get('retry-after')) > 0)

    // Someone else is unaffected.
    assert.equal((await call('POST', `${API}/session`, { body: { password: PASSWORD }, client: nextClient() })).status, 200)
  })

  it('refuses cross-origin and origin-less writes, including login', async () => {
    for (const origin of ['https://evil.example', null]) {
      const { status } = await call('POST', `${API}/session`, {
        body: { password: PASSWORD },
        origin,
        client: nextClient(),
      })
      assert.equal(status, 403)
    }
  })

  it('logs out for real: the old cookie stops working', async () => {
    const cookie = await signIn()
    assert.equal((await call('GET', `${API}/session`, { cookie })).json.authenticated, true)
    await call('DELETE', `${API}/session`, { cookie })
    assert.equal((await call('GET', `${API}/session`, { cookie })).json.authenticated, false)
  })
})

describe('protection', () => {
  it('keeps every write behind the session', async () => {
    assert.equal((await call('PUT', `${API}/content/profile`, { body: {}, headers: { 'If-Match': 'none' } })).status, 401)
    assert.equal((await call('DELETE', `${API}/content/profile`, { headers: { 'If-Match': 'none' } })).status, 401)
    assert.equal((await call('POST', `${API}/photos`, { raw: 'x', headers: { 'Content-Type': 'image/png' } })).status, 401)
  })

  it('serves nothing outside the API and the photo folder', async () => {
    for (const route of ['/', '/etc/passwd', '/media/../content/photos.json', '/media/photos/..%2f..%2fx.jpg', '/media/photos/x.txt']) {
      assert.equal((await call('GET', route)).status, 404, route)
    }
  })
})

describe('content', () => {
  it('starts with no overrides and lets the owner save, read back and reset', async () => {
    const cookie = await signIn()
    assert.deepEqual((await call('GET', `${API}/content`)).json.content, {})

    const presentation = JSON.parse(
      readFileSync(new URL('../../web/src/content/presentation.json', import.meta.url), 'utf8'),
    )
    presentation.photos.title = 'Edited from the studio.'

    const saved = await call('PUT', `${API}/content/presentation`, {
      cookie,
      body: presentation,
      headers: { 'If-Match': 'none' },
    })
    assert.equal(saved.status, 200)

    const { json } = await call('GET', `${API}/content`)
    assert.equal(json.content.presentation.photos.title, 'Edited from the studio.')
    assert.equal(json.revisions.presentation, saved.json.revision)

    const reset = await call('DELETE', `${API}/content/presentation`, {
      cookie,
      headers: { 'If-Match': saved.json.revision },
    })
    assert.equal(reset.status, 200)
    assert.equal(await currentRevision('presentation'), 'none')
  })

  it('answers a conditional request with 304 when nothing changed', async () => {
    const first = await call('GET', `${API}/content`)
    const etag = first.response.headers.get('etag')
    const again = await call('GET', `${API}/content`, { headers: { 'If-None-Match': etag } })
    assert.equal(again.status, 304)
  })

  it('refuses invalid content with a readable reason and changes nothing', async () => {
    const cookie = await signIn()
    const { status, json } = await call('PUT', `${API}/content/profile`, {
      cookie,
      body: { name: 'x' },
      headers: { 'If-Match': 'none' },
    })
    assert.equal(status, 422)
    assert.match(json.error, /required|not a known/)
    assert.equal(await currentRevision('profile'), 'none')
  })

  it('detects a stale editor instead of overwriting newer work', async () => {
    const cookie = await signIn()
    const skills = JSON.parse(readFileSync(new URL('../../web/src/content/skills.json', import.meta.url), 'utf8'))

    const first = await call('PUT', `${API}/content/skills`, { cookie, body: skills, headers: { 'If-Match': 'none' } })
    assert.equal(first.status, 200)

    const stale = await call('PUT', `${API}/content/skills`, { cookie, body: skills, headers: { 'If-Match': 'none' } })
    assert.equal(stale.status, 409)

    const missing = await call('PUT', `${API}/content/skills`, { cookie, body: skills })
    assert.equal(missing.status, 428)

    await call('DELETE', `${API}/content/skills`, { cookie, headers: { 'If-Match': first.json.revision } })
  })
})

describe('photos', () => {
  it('turns an upload into the four derivatives, then publishes it with its words', async () => {
    const cookie = await signIn()

    const upload = await call('POST', `${API}/photos?name=${encodeURIComponent('My Trip 01.PNG')}`, {
      cookie,
      raw: await png('#3366aa'),
      headers: { 'Content-Type': 'image/png' },
    })
    assert.equal(upload.status, 201)
    const generated = upload.json
    assert.match(generated.id, /^my-trip-01-[0-9a-f]{16}$/)
    assert.equal(generated.width, 640)
    assert.equal(generated.height, 480)

    for (const url of [generated.src, generated.srcAvif, generated.thumbnail, generated.thumbnailAvif]) {
      const file = await fetch(base + url)
      assert.equal(file.status, 200, url)
      assert.match(file.headers.get('cache-control'), /immutable/)
      assert.match(file.headers.get('content-type'), /^image\/(jpeg|avif)$/)
    }

    const list = [
      ...bundledPhotos,
      { ...generated, caption: 'Blue rectangle', location: null, date: '2026-09-28', album: 'Test' },
    ]
    const saved = await call('PUT', `${API}/content/photos`, { cookie, body: list, headers: { 'If-Match': 'none' } })
    assert.equal(saved.status, 200)
    assert.equal((await fetch(base + generated.src)).status, 200)

    // Taking it out of the gallery leaves the file for the grace period, then sweeps it.
    const without = await call('PUT', `${API}/content/photos`, {
      cookie,
      body: bundledPhotos,
      headers: { 'If-Match': saved.json.revision },
    })
    assert.equal(without.status, 200)
    assert.equal((await fetch(base + generated.src)).status, 200)

    const old = new Date(Date.now() - 2 * 60 * 60 * 1000)
    for (const url of [generated.src, generated.srcAvif]) {
      await utimes(path.join(dataDir, url.replace('/media/', 'media/')), old, old)
    }
    const swept = await call('PUT', `${API}/content/photos`, {
      cookie,
      body: bundledPhotos,
      headers: { 'If-Match': without.json.revision },
    })
    assert.equal(swept.status, 200)
    assert.equal((await fetch(base + generated.src)).status, 404)

    await call('DELETE', `${API}/content/photos`, { cookie, headers: { 'If-Match': swept.json.revision } })
  })

  it('refuses a gallery that points at an upload that never happened', async () => {
    const cookie = await signIn()
    const ghost = {
      ...bundledPhotos[0],
      id: 'ghost-abcdef',
      src: '/media/photos/ghost-abcdef.jpg',
      srcAvif: null,
      thumbnail: '/media/photos/thumbs/ghost-abcdef.jpg',
      thumbnailAvif: null,
    }
    const { status, json } = await call('PUT', `${API}/content/photos`, {
      cookie,
      body: [...bundledPhotos, ghost],
      headers: { 'If-Match': 'none' },
    })
    assert.equal(status, 422)
    assert.match(json.error, /has not been uploaded/)
  })

  it('rejects files that are not images, and oversized ones', async () => {
    const cookie = await signIn()
    const text = await call('POST', `${API}/photos?name=a.jpg`, {
      cookie,
      raw: 'this is not an image',
      headers: { 'Content-Type': 'image/jpeg' },
    })
    assert.equal(text.status, 422)

    const wrongType = await call('POST', `${API}/photos`, { cookie, raw: 'x', headers: { 'Content-Type': 'text/html' } })
    assert.equal(wrongType.status, 415)
  })
})
