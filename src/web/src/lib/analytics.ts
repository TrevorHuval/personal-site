import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

declare global {
  interface Window {
    /** Set by the snippet the build injects; absent in dev and for Do Not Track. */
    gaEnabled?: boolean
    gtag?: (...args: unknown[]) => void
  }
}

/** The owner's editing area is not a page anyone should see in the numbers. */
const UNTRACKED = /^\/studio(\/|$)/

/**
 * Reports a page view per route change.
 *
 * GA4's automatic page view is switched off in the injected snippet: on a
 * client-side navigation it would fire before `usePageMeta` has updated the
 * title, filing every page under the previous page's name. Declared after the
 * page's own effects run (Layout sits above the pages), so `document.title` is
 * already right. A no-op whenever the tag was not injected.
 */
export function usePageViews() {
  const { pathname, search } = useLocation()

  useEffect(() => {
    if (window.gaEnabled !== true || window.gtag === undefined || UNTRACKED.test(pathname)) return

    window.gtag('event', 'page_view', {
      page_path: pathname + search,
      page_location: window.location.href,
      page_title: document.title,
    })
  }, [pathname, search])
}
