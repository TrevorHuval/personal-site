import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createLimiter, createSessions, hashPassword, verifyPassword } from '../src/auth.mjs'

const CHEAP = { N: 1024, r: 8, p: 1, keylen: 64 }

describe('passwords', () => {
  it('verifies the right password and only the right password', async () => {
    const stored = await hashPassword('correct horse battery', CHEAP)
    assert.equal(await verifyPassword('correct horse battery', stored), true)
    assert.equal(await verifyPassword('correct horse batter', stored), false)
  })

  it('treats a malformed stored hash as a failed login, not a crash', async () => {
    for (const stored of ['', 'plain', 'scrypt:x:8:1:aa:bb', 'scrypt:1024:8:1:aa:']) {
      assert.equal(await verifyPassword('anything', stored), false)
    }
  })
})

describe('sessions', () => {
  const secret = 's'.repeat(40)
  const make = (overrides = {}) =>
    createSessions({ passwordHash: 'hash-a', secret, ttlMs: 1000, ...overrides })

  it('accepts what it issued, and rejects tampering', () => {
    const sessions = make()
    const { token } = sessions.issue()
    assert.equal(sessions.verify(token), true)
    assert.equal(sessions.verify(`${token}x`), false)
    assert.equal(sessions.verify(token.replace(/^\d+/, '99999999999999')), false)
    assert.equal(sessions.verify(''), false)
    assert.equal(sessions.verify(undefined), false)
  })

  it('expires', () => {
    let clock = 1_000_000
    const sessions = make({ now: () => clock })
    const { token } = sessions.issue()
    clock += 999
    assert.equal(sessions.verify(token), true)
    clock += 2
    assert.equal(sessions.verify(token), false)
  })

  it('is revoked by logout and by changing the password', () => {
    const sessions = make()
    const { token } = sessions.issue()
    sessions.revoke(token)
    assert.equal(sessions.verify(token), false)

    const other = make({ passwordHash: 'hash-b' })
    assert.equal(other.verify(sessions.issue().token), false)
  })
})

describe('limiter', () => {
  it('blocks after the maximum, then recovers when the window passes', () => {
    let clock = 0
    const limiter = createLimiter({ max: 3, windowMs: 1000, now: () => clock })

    for (let i = 0; i < 3; i++) {
      assert.equal(limiter.retryAfterMs('a'), 0)
      limiter.fail('a')
    }
    assert.ok(limiter.retryAfterMs('a') > 0)
    assert.equal(limiter.retryAfterMs('b'), 0)

    clock = 1001
    assert.equal(limiter.retryAfterMs('a'), 0)
  })
})
