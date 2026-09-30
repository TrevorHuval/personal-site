import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { COLLECTIONS, ValidationError, validateCollection } from '../src/schema.mjs'

const contentDir = new URL('../../web/src/content/', import.meta.url)
const bundled = (name) => JSON.parse(readFileSync(new URL(`${name}.json`, contentDir), 'utf8'))

describe('the content bundled with the site', () => {
  // The strongest check on the validators: the real files must be accepted as
  // they are, or the studio could not save an untouched collection.
  for (const name of COLLECTIONS) {
    it(`${name} passes its own validator`, () => {
      assert.deepEqual(validateCollection(name, bundled(name)), bundled(name))
    })
  }
})

describe('validation', () => {
  const photos = () => bundled('photos')
  const reject = (name, value, pattern) =>
    assert.throws(() => validateCollection(name, value), (error) => {
      assert.ok(error instanceof ValidationError)
      assert.match(error.message, pattern)
      return true
    })

  it('rejects unknown and missing fields', () => {
    const list = photos()
    list[0].surprise = true
    reject('photos', list, /surprise.*not a known field/)

    const missing = photos()
    delete missing[0].album
    reject('photos', missing, /album.*required/)
  })

  it('rejects duplicate photo ids and paths outside the photo folders', () => {
    const dup = photos()
    dup[1].id = dup[0].id
    reject('photos', dup, /two entries with the id/)

    const escape = photos()
    escape[0].src = '/photos/../secrets.jpg'
    reject('photos', escape, /src/)
  })

  it('requires each AVIF to be the twin of its JPEG', () => {
    const list = photos()
    list[0].srcAvif = '/photos/other.avif'
    reject('photos', list, /twin/)
  })

  it('refuses email addresses and placeholders anywhere in the content', () => {
    const profile = bundled('profile')
    profile.bio[0] = 'Write to me at someone@example.com'
    reject('profile', profile, /email/)

    const todo = bundled('profile')
    todo.headline = 'TODO write a headline'
    reject('profile', todo, /TODO/)
  })

  it('accepts only https links, so a link cannot smuggle in javascript:', () => {
    const profile = bundled('profile')
    profile.links.gitHub = 'javascript:alert(1)'
    reject('profile', profile, /https/)
  })

  it('rejects an unknown collection', () => {
    reject('secrets', {}, /not an editable collection/)
  })
})
