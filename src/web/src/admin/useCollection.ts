import { useState } from 'react'
import { bundled, revisions, type CollectionName, type ContentSet } from '../content'
import { ApiError, resetCollection, saveCollection } from './api'
import type { Notice } from './controls'

/**
 * Draft/saved state for one collection, shared by every editor.
 *
 * `saved` is what the server holds (or the shipped copy when nothing is
 * overridden); `draft` is what is on screen. `revision` is what the server
 * needs to see again to accept a write — it is how a stale second tab gets
 * refused instead of silently winning.
 */
export function useCollection<N extends CollectionName>(
  name: N,
  initial: ContentSet[N],
  /** Removes anything the form can only express in a way the server refuses. */
  prepare: (draft: ContentSet[N]) => ContentSet[N] = (draft) => draft,
) {
  const [saved, setSaved] = useState(initial)
  const [draft, setDraft] = useState(initial)
  const [revision, setRevision] = useState(revisions[name] ?? 'none')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)

  const edit = (next: ContentSet[N]) => {
    setNotice(null)
    setDraft(next)
  }

  async function run(work: () => Promise<void>) {
    setBusy(true)
    setNotice(null)
    try {
      await work()
    } catch (error) {
      const text = error instanceof ApiError ? error.message : 'Something unexpected went wrong.'
      setNotice({ tone: 'error', text })
    } finally {
      setBusy(false)
    }
  }

  return {
    draft,
    edit,
    dirty,
    busy,
    notice,
    overridden: revision !== 'none',

    save: () =>
      run(async () => {
        const clean = prepare(draft)
        const next = await saveCollection(name, clean, revision)
        setSaved(clean)
        setDraft(clean)
        setRevision(next)
        setNotice({ tone: 'ok', text: 'Saved. It is live now; reload the site to see it.' })
      }),

    discard: () => {
      setDraft(saved)
      setNotice(null)
    },

    reset: () => {
      const confirmed = window.confirm(
        'Throw away every edit made here and go back to the version that shipped with the site?',
      )
      if (!confirmed) return Promise.resolve()

      return run(async () => {
        await resetCollection(name, revision)
        setSaved(bundled[name])
        setDraft(bundled[name])
        setRevision('none')
        setNotice({ tone: 'ok', text: 'Back to the shipped version.' })
      })
    },
  }
}
