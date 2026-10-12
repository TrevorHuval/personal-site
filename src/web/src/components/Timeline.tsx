import type { ExperienceEntry } from '../content/types'
import { formatDuration, formatRange } from '../lib/dates'

/**
 * The rail. Roles hang off a single hairline with their dates set in the
 * left-hand margin — a contact sheet's frame numbers applied to a career.
 *
 * Each role is a sheet card hanging off the rail; the dates stay in the margin.
 *
 * `maxHighlights` is what stops the home page from being the résumé. The current
 * role carries nine bullets, and printing all of them twice — once on the way
 * down the home page and again on /resume — makes the home page a wall and the
 * résumé link pointless. Home takes the top few; /resume passes nothing and gets
 * everything.
 */
export default function Timeline({
  entries,
  maxHighlights,
}: {
  entries: ExperienceEntry[]
  maxHighlights?: number
}) {
  return (
    <ol className="flex flex-col">
      {entries.map((entry, index) => {
        const isLast = index === entries.length - 1
        const isCurrent = entry.endDate === null
        const range = formatRange(entry.startDate, entry.endDate)
        const duration = formatDuration(entry.startDate, entry.endDate)
        const highlights =
          maxHighlights === undefined ? entry.highlights : entry.highlights.slice(0, maxHighlights)
        const hidden = entry.highlights.length - highlights.length

        return (
          <li
            key={`${entry.company}-${entry.startDate}`}
            className="grid gap-x-6 md:grid-cols-[8.5rem_1fr]"
          >
            {/* The gutter — margin notes, right-aligned against the rail. */}
            <div className="hidden md:block md:pt-1 md:text-right">
              <p className="gutter-date">{range}</p>
              {duration && <p className="gutter-date mt-1.5">{duration}</p>}
            </div>

            <div
              className={`relative pl-6 md:pl-8 ${
                isLast ? 'pb-1' : 'border-l border-hairline pb-6'
              }`}
            >
              {/* The rail stops at the last node rather than trailing into
                  nothing, so the timeline reads as finished. */}
              {isLast && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 left-0 h-3 w-px bg-hairline"
                />
              )}

              <span
                aria-hidden="true"
                className={`timeline-node ${isCurrent ? 'is-current' : ''}`}
              />

              <p className="gutter-date mb-2 md:hidden">
                {range}
                {duration && ` · ${duration}`}
              </p>

              <div className="timeline-card">
              <h3 className="card-title">{entry.title}</h3>
              <p className="card-body mt-0.5">
                {entry.company}
                <span aria-hidden="true" className="mx-1.5 text-ink-faint">
                  ·
                </span>
                <span className="text-ink-soft">{entry.location}</span>
              </p>

              {highlights.length > 0 && (
                <ul className="mt-4 flex flex-col gap-2">
                  {highlights.map((highlight) => (
                    <li key={highlight} className="card-body flex gap-3">
                      <span
                        aria-hidden="true"
                        className="bullet-dot"
                      />
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Says the truncation out loud rather than letting a trimmed list
                  read as the whole role. */}
              {hidden > 0 && (
                <p className="gutter-date mt-3">
                  + {hidden} more on the resume
                </p>
              )}

              {entry.tech.length > 0 && (
                <ul className="chip-list mt-4">
                  {entry.tech.map((tech) => (
                    <li key={tech}>
                      <span className="chip">{tech}</span>
                    </li>
                  ))}
                </ul>
              )}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
