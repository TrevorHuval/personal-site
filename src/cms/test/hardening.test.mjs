import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { clientKey, createQueue, hashPassword } from '../src/auth.mjs'
import { loadConfig } from '../src/config.mjs'
import { isHeif } from '../src/photos.mjs'
import { ValidationError, validateCollection } from '../src/schema.mjs'
import { createApp } from '../src/server.mjs'

const ORIGIN = 'https://trevorhuval.com'
const PASSWORD = 'a long enough test password'
const API = '/api/cms'

const dirs = []
const running = []

async function start(dataDir) {
  const dir = dataDir ?? (await mkdtemp(path.join(os.tmpdir(), 'studio-h-')))
  if (!dataDir) dirs.push(dir)
  const config = loadConfig({
    DATA_DIR: dir,
    PUBLIC_ORIGIN: ORIGIN,
    SESSION_SECRET: 'y'.repeat(48),
    ADMIN_PASSWORD_HASH: await hashPassword(PASSWORD, { N: 1024, r: 8, p: 1, keylen: 64 }),
  })
  const { server } = await createApp(config)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  running.push(server)
  const base = `http://127.0.0.1:${server.address().port}`

  const call = (method, route, { body, client = '10.1.1.1', cookie, raw, headers = {} } = {}) =>
    fetch(base + route, {
      method,
      headers: {
        Origin: ORIGIN,
        'X-Forwarded-For': client,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      ...(raw !== undefined || body !== undefined ? { body: raw ?? JSON.stringify(body) } : {}),
    })

  const close = () => new Promise((resolve) => server.close(resolve))
  return { call, dir, close }
}

after(async () => {
  for (const server of running) server.close()
  for (const dir of dirs) await rm(dir, { recursive: true, force: true })
})

describe('login under concurrency', () => {
  it('counts a burst of parallel guesses against the limit instead of letting them all through', async () => {
    const { call } = await start()
    const results = await Promise.all(
      Array.from({ length: 30 }, () => call('POST', `${API}/session`, { body: { password: 'wrong' }, client: '10.2.2.2' })),
    )
    const statuses = results.map((r) => r.status)

    assert.ok(statuses.filter((s) => s === 401).length <= 5, `too many guesses evaluated: ${statuses.join(',')}`)
    assert.ok(statuses.includes(429))

    // The correct password from the locked-out address is refused too.
    assert.equal((await call('POST', `${API}/session`, { body: { password: PASSWORD }, client: '10.2.2.2' })).status, 429)
  })

  it('does not let one address lock the owner out from another', async () => {
    const { call } = await start()
    await Promise.all(
      Array.from({ length: 30 }, () => call('POST', `${API}/session`, { body: { password: 'wrong' }, client: '10.3.3.3' })),
    )
    assert.equal((await call('POST', `${API}/session`, { body: { password: PASSWORD }, client: '10.4.4.4' })).status, 200)
  })

  it('answers a malformed body with 400, not a server error', async () => {
    const { call } = await start()
    for (const raw of ['null', '"text"', '42', '[]', '{}']) {
      const response = await call('POST', `${API}/session`, { raw, headers: { 'Content-Type': 'application/json' }, client: `10.5.5.${raw.length}` })
      assert.equal(response.status, 400, raw)
    }
  })
})

describe('logout', () => {
  it('survives a restart: a logged-out cookie stays dead', async () => {
    const first = await start()
    const login = await first.call('POST', `${API}/session`, { body: { password: PASSWORD }, client: '10.6.6.6' })
    const cookie = login.headers.get('set-cookie').split(';')[0]
    await first.call('DELETE', `${API}/session`, { cookie })
    await new Promise((resolve) => setTimeout(resolve, 100))
    await first.close()

    const second = await start(first.dir)
    const state = await (await second.call('GET', `${API}/session`, { cookie })).json()
    assert.equal(state.authenticated, false)
  })
})

describe('uploads', () => {
  async function signedIn(app) {
    const login = await app.call('POST', `${API}/session`, { body: { password: PASSWORD }, client: '10.7.7.7' })
    return login.headers.get('set-cookie').split(';')[0]
  }

  it('refuses SVG even though it is an image type', async () => {
    const app = await start()
    const cookie = await signedIn(app)
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'
    const response = await app.call('POST', `${API}/photos?name=x.svg`, {
      cookie,
      raw: svg,
      headers: { 'Content-Type': 'image/svg+xml' },
    })
    assert.equal(response.status, 422)
  })

  it('answers a HEIC it cannot convert with a clear 422, never a crash', async () => {
    const app = await start()
    const cookie = await signedIn(app)
    // A valid ISO-BMFF "heic" header followed by nothing: routed to the converter,
    // which is either absent (local dev) or rejects it.
    const fake = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(20)])
    const response = await app.call('POST', `${API}/photos?name=IMG_0001.HEIC`, {
      cookie,
      raw: fake,
      headers: { 'Content-Type': 'image/heic' },
    })
    assert.equal(response.status, 422)
    assert.match((await response.json()).error, /HEIC/)
  })

  it('recognises HEIC by content, not by name, and leaves AVIF to sharp', () => {
    const header = (brand) => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from(`ftyp${brand}`), Buffer.alloc(12)])
    assert.equal(isHeif(header('heic')), true)
    assert.equal(isHeif(header('mif1')), true)
    assert.equal(isHeif(header('avif')), false)
    assert.equal(isHeif(Buffer.from('not an image at all')), false)
    assert.equal(isHeif(Buffer.alloc(4)), false)
  })
})

describe('helpers', () => {
  it('limits an IPv6 client by its /64, not its full address', () => {
    assert.equal(clientKey('203.0.113.9'), '203.0.113.9')
    assert.equal(clientKey('::ffff:203.0.113.9'), '203.0.113.9')
    assert.equal(clientKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), clientKey('2001:db8:1:2::1'))
    assert.notEqual(clientKey('2001:db8:1:2::1'), clientKey('2001:db8:1:3::1'))
  })

  it('refuses work beyond the queue depth instead of building a backlog', async () => {
    const queue = createQueue({ maxPending: 2 })
    const slow = () => new Promise((resolve) => setTimeout(resolve, 30))
    const jobs = [queue(slow), queue(slow), queue(slow)]
    const outcomes = await Promise.allSettled(jobs)
    assert.deepEqual(outcomes.map((o) => o.status), ['fulfilled', 'fulfilled', 'rejected'])
  })
})

describe('content rules', () => {
  const profile = () => ({
    name: 'A',
    headline: 'B',
    location: 'C',
    bio: ['D'],
    links: { gitHub: 'https://github.com/x', linkedIn: 'https://linkedin.com/in/x' },
    quickLinks: [],
  })

  it('still finds an email address inside any string', () => {
    const value = profile()
    value.quickLinks = [{ label: 'a', href: 'https://x.example/?to=me@example.com' }]
    assert.throws(() => validateCollection('profile', value), ValidationError)
  })

  it('validates a very long run of address characters quickly', () => {
    const value = profile()
    value.bio = ['a.'.repeat(1000)]
    const started = performance.now()
    validateCollection('profile', value)
    assert.ok(performance.now() - started < 200)
  })

  it('rejects navigation targets that browsers read as another site', () => {
    const presentation = {
      navigation: [{ to: '/\\evil.example', label: 'x' }],
      home: { eyebrow: 'a', aboutTitle: 'b', skillsTitle: 'c', experienceTitle: 'd' },
      projects: { eyebrow: 'a', title: 'b' },
      photos: { eyebrow: 'a', title: 'b' },
    }
    assert.throws(() => validateCollection('presentation', presentation), /path starting with/)
  })

  it('does not treat inherited names like constructor as known fields', () => {
    const value = profile()
    value.constructor = {}
    assert.throws(() => validateCollection('profile', value), /not a known field/)
  })
})
