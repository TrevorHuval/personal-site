import { Button, Field, INPUT, TextField } from './controls'

/**
 * A form generated from the data itself, so every collection is editable
 * without a bespoke screen per file: strings become inputs, lists get
 * add/remove/reorder, objects become groups. Types are preserved — a number
 * stays a number — and the server still validates the whole result.
 */

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

/** Fields whose "not set" state is `null` rather than an empty string. */
const NULLABLE = new Set(['description', 'liveUrl', 'repoSlug', 'location', 'notes', 'field', 'endDate', 'date'])

const LONG = new Set(['bio', 'highlights', 'description', 'summary', 'headline', 'notes'])

const humanise = (key: string) =>
  key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())

export default function JsonForm({ value, onChange }: { value: Json; onChange: (next: Json) => void }) {
  return <Node label="" name="" value={value} onChange={onChange} />
}

function Node({
  label,
  name,
  value,
  onChange,
}: {
  label: string
  name: string
  value: Json
  onChange: (next: Json) => void
}) {
  if (Array.isArray(value)) return <List label={label} name={name} items={value} onChange={onChange} />

  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
    const body = (
      <div className="flex flex-col gap-4">
        {entries.map(([key, child]) => (
          <Node
            key={key}
            label={humanise(key)}
            name={key}
            value={child}
            onChange={(next) => onChange({ ...value, [key]: next })}
          />
        ))}
      </div>
    )
    return label === '' ? body : <Group label={label}>{body}</Group>
  }

  if (typeof value === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />
        {label}
      </label>
    )
  }

  if (typeof value === 'number') {
    return (
      <TextField
        label={label}
        type="number"
        value={String(value)}
        onChange={(text) => onChange(text === '' ? 0 : Number(text))}
      />
    )
  }

  const text = value ?? ''
  return (
    <TextField
      label={label}
      value={text}
      multiline={LONG.has(name) || text.length > 90}
      hint={NULLABLE.has(name) ? 'Leave empty to leave this out.' : undefined}
      onChange={(next) => onChange(next === '' && NULLABLE.has(name) ? null : next)}
    />
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-card border border-hairline p-4">
      <legend className="px-2 font-mono text-caption tracking-[0.1em] text-ink-muted uppercase">{label}</legend>
      {children}
    </fieldset>
  )
}

function List({
  label,
  name,
  items,
  onChange,
}: {
  label: string
  name: string
  items: Json[]
  onChange: (next: Json) => void
}) {
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return
    const next = [...items]
    next.splice(to, 0, next.splice(from, 1)[0]!)
    onChange(next)
  }
  const replace = (index: number, item: Json) => onChange(items.map((existing, i) => (i === index ? item : existing)))
  const remove = (index: number) => onChange(items.filter((_, i) => i !== index))

  const scalar = items.every((item) => typeof item === 'string')
  const blank: Json = scalar ? '' : blankLike(items.at(-1) ?? {})

  const rows = items.map((item, index) => {
    const controls = (
      <div className="flex shrink-0 gap-1">
        <Button aria-label="Move up" onClick={() => move(index, index - 1)} disabled={index === 0} className="!px-3">↑</Button>
        <Button aria-label="Move down" onClick={() => move(index, index + 1)} disabled={index === items.length - 1} className="!px-3">↓</Button>
        <Button aria-label="Remove" onClick={() => remove(index)} className="!px-3">✕</Button>
      </div>
    )

    if (scalar) {
      return (
        <li key={index} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <Field label={`${label} ${index + 1}`}>
              {(id) =>
                LONG.has(name) ? (
                  <textarea
                    id={id}
                    rows={Math.min(10, Math.max(2, Math.ceil(String(item).length / 70)))}
                    value={String(item)}
                    onChange={(event) => replace(index, event.target.value)}
                    className={`${INPUT} resize-y`}
                  />
                ) : (
                  <input id={id} value={String(item)} onChange={(event) => replace(index, event.target.value)} className={INPUT} />
                )
              }
            </Field>
          </div>
          <div className="mt-6">{controls}</div>
        </li>
      )
    }

    return (
      <li key={index} className="flex flex-col gap-3 rounded-card bg-veil p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-caption tracking-[0.1em] text-ink-muted uppercase">
            {label} {index + 1}
          </p>
          {controls}
        </div>
        <Node label="" name="" value={item} onChange={(next) => replace(index, next)} />
      </li>
    )
  })

  return (
    <Group label={label || 'Items'}>
      <ul className="flex flex-col gap-3">{rows}</ul>
      <div>
        <Button onClick={() => onChange([...items, blank])}>Add {label.toLowerCase() || 'item'}</Button>
      </div>
    </Group>
  )
}

/** A new list entry shaped like an existing one, with the words emptied out. */
function blankLike(sample: Json): Json {
  if (typeof sample === 'string') return ''
  if (typeof sample === 'number') return 0
  if (typeof sample === 'boolean') return false
  if (sample === null) return null
  if (Array.isArray(sample)) return []
  return Object.fromEntries(Object.entries(sample).map(([key, child]) => [key, blankLike(child)]))
}
