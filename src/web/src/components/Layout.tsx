import { useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import Nav from './Nav'
import { GitHubIcon, LinkedInIcon } from './Icons'
import { profile } from '../content'

/**
 * Shared page width and navigation clearance come from the layout tokens.
 * Editorial sections keep long-form content to a narrower reading column.
 */
export default function Layout() {
  useScrollToTopOnNavigate()

  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <Nav links={profile.links} quickLinks={profile.quickLinks} />

      {/* tabIndex -1 so the skip link actually lands focus here rather than
          only moving the scroll position. */}
      <main
        id="content"
        tabIndex={-1}
        className="site-main site-width"
      >
        <Outlet />
      </main>

      <SiteFooter />
    </div>
  )
}

/**
 * A client-side route change does not reset the scroll position the way a real
 * navigation does, so without this you land halfway down the next page.
 * `instant` rather than smooth: the browser's own back/forward feel is instant,
 * and animating it makes navigation feel laggy.
 */
function useScrollToTopOnNavigate() {
  const { pathname } = useLocation()
  const previousPath = useRef(pathname)

  useEffect(() => {
    if (previousPath.current !== pathname) {
      document.getElementById('content')?.focus({ preventScroll: true })
      previousPath.current = pathname
    }
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])
}

/**
 * The first stop on a keyboard tab through the site. It parks off-screen rather
 * than being display:none, so it stays focusable; landing focus drops it into
 * place as the same glass pill the nav is made of.
 *
 * Keyed to `:focus` rather than `:focus-visible`: parked off-screen it can only
 * ever be reached by keyboard, and the one keyboard affordance on the page is
 * not worth betting on a heuristic.
 */
function SkipLink() {
  return (
    <a
      href="#content"
      className="glass-high fixed top-4 left-4 z-50 -translate-y-24 rounded-full px-5 py-2.5 text-meta font-medium text-ink transition-transform duration-200 ease-out-quint focus:translate-y-0"
    >
      Skip to content
    </a>
  )
}

/**
 * The studio's front door: five quick taps on the copyright line. There is no
 * visible affordance, and no link anywhere for a crawler or a visitor to find.
 * The gesture only saves typing /studio on a phone; the protection is the
 * password behind it.
 */
const SECRET_TAPS = 5
const SECRET_WINDOW_MS = 2000

function useStudioGesture() {
  const navigate = useNavigate()
  const taps = useRef<number[]>([])

  return () => {
    const now = Date.now()
    taps.current = [...taps.current.filter((at) => now - at < SECRET_WINDOW_MS), now]
    if (taps.current.length >= SECRET_TAPS) {
      taps.current = []
      navigate('/studio')
    }
  }
}

function SiteFooter() {
  const year = new Date().getFullYear()
  const tap = useStudioGesture()

  return (
    <footer className="site-width pb-10">
      <div className="flex flex-col items-center gap-5 border-t border-hairline pt-8 sm:flex-row sm:justify-between">
        <p className="numeric text-meta text-ink-soft" onClick={tap}>
          © {year} {profile.name}
        </p>

        <ul className="flex items-center gap-1">
          <FooterLink href={profile.links.gitHub} label="GitHub">
            <GitHubIcon className="size-[1.05rem]" />
          </FooterLink>
          <FooterLink href={profile.links.linkedIn} label="LinkedIn">
            <LinkedInIcon className="size-[1.05rem]" />
          </FooterLink>
        </ul>
      </div>
    </footer>
  )
}

function FooterLink({
  href,
  label,
  children,
}: {
  href: string
  label: string
  children: React.ReactNode
}) {
  return (
    <li>
      <a
        href={href}
        aria-label={label}
        target="_blank"
        rel="me noreferrer"
        className="icon-button"
      >
        {children}
      </a>
    </li>
  )
}
