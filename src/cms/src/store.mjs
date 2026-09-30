import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { COLLECTIONS } from './schema.mjs'

/** How many superseded copies of each collection are kept for manual recovery. */
const HISTORY_KEEP = 30

export class ConflictError extends Error {}

const revisionOf = (text) => createHash('sha256').update(text).digest('hex').slice(0, 12)

/**
 * The saved overrides for the site's content, one JSON file per collection.
 *
 * A collection with no file here simply is not overridden, and the site falls
 * back to the copy bundled into its build. Writes are serialised and atomic
 * (temp file, then rename), so a crash leaves the old file or the new one and
 * never half of either. Every replaced or removed file is copied to `history/`.
 */
export class ContentStore {
  #dir
  #cache = new Map()
  #chain = Promise.resolve()

  constructor(dataDir) {
    this.#dir = path.join(dataDir, 'content')
  }

  async load() {
    await mkdir(path.join(this.#dir, 'history'), { recursive: true })
    for (const name of COLLECTIONS) {
      try {
        const text = await readFile(this.#file(name), 'utf8')
        this.#cache.set(name, { value: JSON.parse(text), revision: revisionOf(text) })
      } catch (error) {
        if (error.code !== 'ENOENT') throw new Error(`Could not read saved ${name}: ${error.message}`)
      }
    }
  }

  /** What the public endpoint serves: only the collections that are overridden. */
  snapshot() {
    const content = {}
    const revisions = {}
    for (const [name, { value, revision }] of this.#cache) {
      content[name] = value
      revisions[name] = revision
    }
    return { content, revisions }
  }

  /** The current revision, or `"none"` when the collection is not overridden. */
  revision(name) {
    return this.#cache.get(name)?.revision ?? 'none'
  }

  /**
   * Replaces a collection. `expected` is the revision the editor last saw, so a
   * stale second tab gets a conflict instead of silently overwriting newer work.
   */
  write(name, value, expected) {
    return this.#exclusive(async () => {
      this.#assertFresh(name, expected)
      const text = `${JSON.stringify(value, null, 2)}\n`
      await this.#archive(name)
      await this.#atomicWrite(this.#file(name), text)
      const revision = revisionOf(text)
      this.#cache.set(name, { value, revision })
      return revision
    })
  }

  /** Drops the override, so the site returns to its bundled copy. */
  remove(name, expected) {
    return this.#exclusive(async () => {
      this.#assertFresh(name, expected)
      await this.#archive(name)
      await rm(this.#file(name), { force: true })
      this.#cache.delete(name)
    })
  }

  #assertFresh(name, expected) {
    if (expected !== undefined && expected !== this.revision(name)) {
      throw new ConflictError(`${name} was changed somewhere else since you loaded it. Reload and try again.`)
    }
  }

  #file(name) {
    return path.join(this.#dir, `${name}.json`)
  }

  async #archive(name) {
    let text
    try {
      text = await readFile(this.#file(name), 'utf8')
    } catch (error) {
      if (error.code === 'ENOENT') return
      throw error
    }

    const historyDir = path.join(this.#dir, 'history')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    await writeFile(path.join(historyDir, `${name}-${stamp}.json`), text, 'utf8')

    const mine = (await readdir(historyDir)).filter((file) => file.startsWith(`${name}-`)).sort()
    for (const stale of mine.slice(0, Math.max(0, mine.length - HISTORY_KEEP))) {
      await rm(path.join(historyDir, stale), { force: true })
    }
  }

  async #atomicWrite(file, text) {
    const temp = `${file}.${process.pid}.tmp`
    await writeFile(temp, text, 'utf8')
    await rename(temp, file)
  }

  #exclusive(work) {
    const run = this.#chain.then(work, work)
    this.#chain = run.catch(() => {})
    return run
  }
}
