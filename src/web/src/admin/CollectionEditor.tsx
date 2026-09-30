import { SaveBar } from './controls'
import type { CollectionName, ContentSet } from '../content'
import JsonForm, { type Json } from './JsonForm'
import { useCollection } from './useCollection'
import { useUnsavedGuard } from './useUnsavedGuard'

/**
 * `null` is how the form says "left out", but the server treats an absent
 * optional page description and a null one differently: the former is valid.
 */
function dropNulls<T>(value: T): T {
  if (Array.isArray(value)) return value.map(dropNulls) as T
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== null)
      .map(([key, child]) => [key, dropNulls(child)]),
  ) as T
}

/** Edits any collection through a form generated from its own data. */
export default function CollectionEditor<N extends Exclude<CollectionName, 'photos'>>({
  name,
  initial,
  intro,
}: {
  name: N
  initial: ContentSet[N]
  intro: string
}) {
  // Only `presentation` has optional keys; for every other collection a null is
  // meaningful and must reach the server as written.
  const collection = useCollection(name, initial, name === 'presentation' ? dropNulls : undefined)
  useUnsavedGuard(collection.dirty)

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-[60ch] text-ink-muted">{intro}</p>
      <JsonForm value={collection.draft as unknown as Json} onChange={(next) => collection.edit(next as unknown as ContentSet[N])} />
      <SaveBar
        dirty={collection.dirty}
        busy={collection.busy}
        overridden={collection.overridden}
        notice={collection.notice}
        onSave={collection.save}
        onDiscard={collection.discard}
        onReset={collection.reset}
      />
    </div>
  )
}
