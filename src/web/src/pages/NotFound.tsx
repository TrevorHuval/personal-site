import { ActionLink } from '../components/Ui'
import { usePageMeta } from '../lib/usePageMeta'

export default function NotFound() {
  usePageMeta({
    title: 'Page not found',
    description: 'That address does not lead anywhere on this site.',
  })

  return (
    <div className="flex min-h-[50vh] flex-col items-start justify-center gap-5">
      <p className="gutter-date">Error 404</p>
      <h1 className="text-3xl font-semibold tracking-tight text-ink">This page doesn't exist</h1>
      <p className="max-w-[52ch] text-base text-[var(--text-secondary)]">
        The link may be out of date, or the address may have a typo in it.
      </p>
      <ActionLink to="/" variant="primary" className="mt-2">
        Back home
      </ActionLink>
    </div>
  )
}
