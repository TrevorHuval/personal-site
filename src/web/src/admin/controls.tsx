import { useId } from 'react'

/**
 * The small set of form parts the studio is built from. Kept apart from the
 * public site's components: this is a tool, not a page, so it borrows the
 * site's tokens but not its editorial layout.
 */

export const INPUT =
  'w-full rounded-control border border-hairline-strong bg-inset px-3 py-2 text-sm text-ink placeholder:text-ink-faint'

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: (id: string) => React.ReactNode
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-mono text-caption tracking-[0.1em] text-ink-faint uppercase">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-caption text-ink-faint">{hint}</p>}
    </div>
  )
}

export function TextField({
  label,
  value,
  onChange,
  hint,
  list,
  type = 'text',
  multiline = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
  list?: string
  type?: 'text' | 'date' | 'number'
  multiline?: boolean
}) {
  return (
    <Field label={label} hint={hint}>
      {(id) =>
        multiline ? (
          <textarea
            id={id}
            value={value}
            rows={Math.min(12, Math.max(3, Math.ceil(value.length / 70)))}
            onChange={(event) => onChange(event.target.value)}
            className={`${INPUT} resize-y`}
          />
        ) : (
          <input
            id={id}
            type={type}
            value={value}
            list={list}
            onChange={(event) => onChange(event.target.value)}
            className={INPUT}
          />
        )
      }
    </Field>
  )
}

export function Button({
  children,
  variant = 'quiet',
  className = '',
  ...rest
}: {
  variant?: 'primary' | 'quiet' | 'danger'
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const tone =
    variant === 'primary' ? 'action-primary' : variant === 'danger' ? 'action-quiet text-ink-muted hover:text-ink' : 'action-quiet'
  return (
    <button type="button" className={`action ${tone} disabled:pointer-events-none disabled:opacity-50 ${className}`} {...rest}>
      {children}
    </button>
  )
}

export type Notice = { tone: 'ok' | 'error'; text: string } | null

/** Announces to screen readers as well as showing, so a save is never silent. */
export function StatusLine({ notice, errorLabel = 'Not saved' }: { notice: Notice; errorLabel?: string }) {
  return (
    <p
      role={notice?.tone === 'error' ? 'alert' : 'status'}
      className={`min-h-6 text-sm ${notice?.tone === 'error' ? 'text-ink' : 'text-ink-muted'}`}
    >
      {notice?.tone === 'error' && <span className="mr-2 font-mono text-caption uppercase">{errorLabel}</span>}
      {notice?.text}
    </p>
  )
}

export function SaveBar({
  dirty,
  busy,
  overridden,
  notice,
  onSave,
  onDiscard,
  onReset,
}: {
  dirty: boolean
  busy: boolean
  overridden: boolean
  notice: Notice
  onSave: () => void
  onDiscard: () => void
  onReset: () => void
}) {
  return (
    <div className="glass-high sticky bottom-4 z-30 flex flex-wrap items-center gap-3 rounded-panel px-5 py-3">
      <Button variant="primary" onClick={onSave} disabled={!dirty || busy}>
        {busy ? 'Saving…' : 'Save changes'}
      </Button>
      <Button onClick={onDiscard} disabled={!dirty || busy}>
        Discard
      </Button>
      <div className="min-w-0 flex-1">
        {dirty && !notice ? <p className="text-sm text-ink-muted">Unsaved changes</p> : <StatusLine notice={notice} />}
      </div>
      {overridden && (
        <Button variant="danger" onClick={onReset} disabled={busy}>
          Reset to shipped version
        </Button>
      )}
    </div>
  )
}
