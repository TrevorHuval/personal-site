import { useEffect, useLayoutEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRightIcon } from './Icons'

/**
 * The handful of shapes that repeat across every page. They exist so the
 * spacing, radii and type tiers are decided once — a page that needs a
 * different heading rhythm is a page that has drifted.
 */

/** A page-level band. `Section` owns the vertical rhythm between blocks so no
 * page has to guess at a margin. */
export function Section({
  id,
  eyebrow,
  title,
  children,
  className = '',
}: {
  id?: string
  eyebrow?: string
  title?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section id={id} className={`content-section ${className}`}>
      {(eyebrow ?? title) && (
        <header className="flex flex-col gap-1.5">
          {eyebrow && (
            /* Same mono, tracked, faint treatment as the date gutter — section
               labels and date stamps read as one family of margin notes. */
            <p className="font-mono text-caption tracking-[0.14em] text-ink-faint uppercase">
              {eyebrow}
            </p>
          )}
          {title && <h2 className="text-2xl font-semibold text-ink">{title}</h2>}
        </header>
      )}
      {children}
    </section>
  )
}

/** A tech tag. Deliberately borderless — a grid of outlined pills turns into a
 * fence, and these are metadata, not controls. */
export function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-inset px-2 py-1 text-caption font-medium text-ink-muted">
      {children}
    </span>
  )
}

type ActionProps = {
  children: React.ReactNode
  /** `primary` is the one call to action per view; everything else is `quiet`. */
  variant?: 'primary' | 'quiet'
  className?: string
} & (
  | { to: string; href?: never; external?: never; download?: never }
  | { href: string; to?: never; external?: boolean; download?: boolean }
)

const ACTION_BASE = 'action'

const ACTION_VARIANTS = {
  primary: 'action-primary',
  quiet: 'action-quiet',
} as const

/** The same shape as `ActionLink`, for an action that stays on the page
 * (opening a dialog) rather than going somewhere. */
export function ActionButton({
  children,
  variant = 'quiet',
  className = '',
  ...rest
}: {
  children: React.ReactNode
  variant?: 'primary' | 'quiet'
  className?: string
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>) {
  return (
    <button type="button" className={`${ACTION_BASE} ${ACTION_VARIANTS[variant]} ${className}`} {...rest}>
      {children}
    </button>
  )
}

/**
 * Shared action geometry is defined in styles/controls.css.
 * Pass `to` for an in-app route (client-side navigation) or `href` for anything
 * that leaves the app.
 */
export function ActionLink({ children, variant = 'quiet', className = '', ...rest }: ActionProps) {
  const classes = `${ACTION_BASE} ${ACTION_VARIANTS[variant]} ${className}`

  if (rest.to !== undefined) {
    return (
      <Link to={rest.to} className={classes}>
        {children}
      </Link>
    )
  }

  return (
    <a
      href={rest.href}
      {...(rest.external ? { target: '_blank', rel: 'noreferrer' } : {})}
      {...(rest.download ? { download: '' } : {})}
      className={classes}
    >
      {children}
      {rest.external && <ArrowUpRightIcon className="size-4 opacity-60" />}
    </a>
  )
}

/** A round icon-only button. `label` is required because there is no visible text. */
export function IconButton({
  label,
  size = 'md',
  className = '',
  children,
  ...rest
}: {
  /** Accessible name (becomes aria-label). */
  label: string
  size?: 'md' | 'sm'
  className?: string
  children: React.ReactNode
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children' | 'aria-label'>) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`icon-button ${size === 'sm' ? 'icon-button-sm' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

function placePill(bar: HTMLElement, animate: boolean) {
  const pill = bar.querySelector<HTMLElement>('.segmented-pill')
  const selected = bar.querySelector<HTMLElement>('[aria-checked="true"]')
  if (!pill || !selected) return
  const move = () => {
    pill.style.width = `${selected.offsetWidth}px`
    pill.style.transform = `translateX(${selected.offsetLeft}px)`
  }
  if (animate) {
    move()
    return
  }
  // Jump straight there (first paint, resize): suppress the transition for one write.
  pill.style.transition = 'none'
  move()
  void pill.offsetWidth
  pill.style.transition = ''
}

/**
 * A single-choice control with a pill that slides to the selected option.
 * Semantics: a radiogroup of radio buttons with a roving tabindex. Arrow keys move
 * and select, Home/End jump to the ends. The pill never animates on mount or resize.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className = '',
}: {
  /** Accessible name for the group. */
  label: string
  value: T
  options: { value: T; label: React.ReactNode; ariaLabel?: string }[]
  onChange: (value: T) => void
  className?: string
}) {
  const bar = useRef<HTMLDivElement>(null)
  const painted = useRef(false)

  useLayoutEffect(() => {
    const el = bar.current
    if (!el) return
    placePill(el, painted.current)
    if (!painted.current) {
      painted.current = true
      // Enable the slide only after the first position is in the style tree.
      void el.offsetWidth
      el.dataset.ready = 'true'
    }
  }, [value])

  useEffect(() => {
    const el = bar.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let first = true
    const observer = new ResizeObserver(() => {
      // The observer fires once right after observe(); a jump then would cancel a slide.
      if (first) first = false
      else placePill(el, false)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const move = (to: number) => {
    const next = options[(to + options.length) % options.length]
    onChange(next.value)
    bar.current?.querySelectorAll<HTMLElement>('[role="radio"]')[(to + options.length) % options.length]?.focus()
  }

  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value))

  return (
    <div ref={bar} role="radiogroup" aria-label={label} className={`segmented ${className}`}>
      <span className="segmented-pill" aria-hidden="true" />
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          aria-label={option.ariaLabel}
          tabIndex={index === selectedIndex ? 0 : -1}
          className="segmented-option press"
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            if (event.altKey || event.metaKey || event.ctrlKey) return
            const keys: Record<string, number> = {
              ArrowRight: index + 1,
              ArrowDown: index + 1,
              ArrowLeft: index - 1,
              ArrowUp: index - 1,
              Home: 0,
              End: options.length - 1,
            }
            if (event.key in keys) {
              event.preventDefault()
              move(keys[event.key])
            }
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
