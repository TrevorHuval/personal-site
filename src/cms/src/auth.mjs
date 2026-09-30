import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)

/** Memory-hard on purpose: 64 MiB per guess. Parameters are stored in the hash,
 *  so they can be raised later without invalidating existing hashes. */
const DEFAULTS = { N: 65536, r: 8, p: 1, keylen: 64 }
const maxmem = (N, r) => 128 * N * r * 2

export const MAX_PASSWORD_LENGTH = 256

export async function hashPassword(password, params = DEFAULTS) {
  const { N, r, p, keylen } = params
  const salt = randomBytes(16)
  const derived = await scryptAsync(password, salt, keylen, { N, r, p, maxmem: maxmem(N, r) })
  return ['scrypt', N, r, p, salt.toString('base64url'), derived.toString('base64url')].join(':')
}

export async function verifyPassword(password, stored) {
  const parts = stored.split(':')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false

  const [N, r, p] = parts.slice(1, 4).map(Number)
  if (![N, r, p].every((n) => Number.isInteger(n) && n > 0)) return false

  const salt = Buffer.from(parts[4], 'base64url')
  const expected = Buffer.from(parts[5], 'base64url')
  if (expected.length === 0) return false

  const actual = await scryptAsync(password, salt, expected.length, { N, r, p, maxmem: maxmem(N, r) })
  return timingSafeEqual(actual, expected)
}

/**
 * Stateless signed sessions: `<expires>.<nonce>.<signature>`. The signing key
 * is derived from the secret *and* the password hash, so changing the password
 * signs everything out. Logging out revokes the nonce for the rest of its life.
 */
export function createSessions({ passwordHash, secret, ttlMs, now = Date.now, revoked: saved = {}, onRevoke = () => {} }) {
  const key = createHmac('sha256', secret).update(passwordHash).digest()
  // nonce -> expiry. Seeded from disk so a restart does not resurrect a logged-out cookie.
  const revoked = new Map(Object.entries(saved))

  const sign = (payload) => createHmac('sha256', key).update(payload).digest('base64url')

  function parse(token) {
    if (typeof token !== 'string') return null
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [expires, nonce, signature] = parts
    const expected = Buffer.from(sign(`${expires}.${nonce}`))
    const given = Buffer.from(signature)
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

    const expiresAt = Number(expires)
    if (!Number.isFinite(expiresAt) || expiresAt <= now()) return null
    return { nonce, expiresAt }
  }

  return {
    issue() {
      const expiresAt = now() + ttlMs
      const payload = `${expiresAt}.${randomBytes(16).toString('base64url')}`
      return { token: `${payload}.${sign(payload)}`, expiresAt }
    },

    verify(token) {
      const session = parse(token)
      return session !== null && !revoked.has(session.nonce)
    },

    revoke(token) {
      const session = parse(token)
      if (session === null) return
      revoked.set(session.nonce, session.expiresAt)
      for (const [nonce, expiresAt] of revoked) {
        if (expiresAt <= now()) revoked.delete(nonce)
      }
      onRevoke(Object.fromEntries(revoked))
    },
  }
}

const MAX_TRACKED_KEYS = 10_000

/**
 * The key a client is limited under. An IPv6 user controls a whole /64, so
 * keying on the full address would hand an attacker unlimited "clients".
 */
export function clientKey(address) {
  const plain = address.replace(/^::ffff:/i, '')
  if (!plain.includes(':')) return plain

  // Expand "::" so the first four groups are the /64 network prefix.
  const [left, right = ''] = plain.split('::')
  const head = left === '' ? [] : left.split(':')
  const tail = right === '' ? [] : right.split(':')
  const groups = plain.includes('::') ? [...head, ...Array(Math.max(0, 8 - head.length - tail.length)).fill('0'), ...tail] : head
  return `${groups.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, '')).join(':')}::/64`
}

/** Counts failures per key inside a sliding window. */
export function createLimiter({ max, windowMs, now = Date.now }) {
  const failures = new Map()

  const recent = (key) => {
    const cutoff = now() - windowMs
    const kept = (failures.get(key) ?? []).filter((at) => at > cutoff)
    if (kept.length === 0) failures.delete(key)
    else failures.set(key, kept)
    return kept
  }

  return {
    /** Milliseconds until another attempt is allowed; 0 when it already is. */
    retryAfterMs(key) {
      const kept = recent(key)
      return kept.length < max ? 0 : kept[0] + windowMs - now()
    },
    fail(key) {
      failures.set(key, [...recent(key), now()])
      // Entries are otherwise only pruned when their own key is touched again.
      if (failures.size > MAX_TRACKED_KEYS) for (const stale of failures.keys()) recent(stale)
    },
    clear(key) {
      failures.delete(key)
    },
  }
}

export class QueueFullError extends Error {}

/**
 * Runs async work one at a time. With `maxPending` set, work arriving while
 * that many jobs are already waiting is refused instead of queued, so a flood
 * cannot build a backlog the owner's own request would sit behind.
 */
export function createQueue({ maxPending = Infinity } = {}) {
  let tail = Promise.resolve()
  let pending = 0
  return (work) => {
    if (pending >= maxPending) return Promise.reject(new QueueFullError('busy'))
    pending += 1
    const run = tail.then(work, work)
    tail = run.catch(() => {})
    return run.finally(() => {
      pending -= 1
    })
  }
}
