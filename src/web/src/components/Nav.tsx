import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ArrowUpRightIcon, GitHubIcon, LinkedInIcon } from './Icons'
import { presentation, profile } from '../content'
import { IconButton } from './Ui'
import type { ProfileLinks, QuickLink } from '../content/types'

/** Inline desktop navigation becomes a compact disclosure on smaller screens. */
export default function Nav({ links, quickLinks }: { links: ProfileLinks; quickLinks: QuickLink[] }) {
  const [light, setLight] = useState(() => document.documentElement.dataset.theme === 'light')
  const [open, setOpen] = useState(false)
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 1199px)').matches)
  const nav = useRef<HTMLElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const pages = useRef<HTMLUListElement>(null)
  const everOpened = useRef(false)
  const location = useLocation()

  useEffect(() => { setOpen(false) }, [location])
  if (open) everOpened.current = true

  // Sliding indicator under the current page. It jumps into place on first paint and on
  // resize, and only glides when the route changes (the user navigated).
  useLayoutEffect(() => {
    const list = pages.current
    if (!list) return
    const place = (animate: boolean) => {
      const pill = list.querySelector<HTMLElement>('.nav-pill')
      const active = list.querySelector<HTMLElement>('.nav-link.is-active')
      if (!pill) return
      if (!active) {
        list.dataset.active = 'false'
        return
      }
      list.dataset.active = 'true'
      if (!animate) pill.style.transition = 'none'
      pill.style.width = `${active.offsetWidth}px`
      pill.style.height = `${active.offsetHeight}px`
      pill.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`
      if (!animate) {
        void pill.offsetWidth
        pill.style.transition = ''
      }
    }
    const ready = list.dataset.ready === 'true'
    place(ready)
    if (!ready) {
      void list.offsetWidth
      list.dataset.ready = 'true'
    }
    if (typeof ResizeObserver === 'undefined') return
    let first = true
    const observer = new ResizeObserver(() => {
      if (first) first = false
      else place(false)
    })
    observer.observe(list)
    return () => observer.disconnect()
  }, [location.pathname, mobile])

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1200px)')
    const close = () => {
      setMobile(!desktop.matches)
      setOpen(false)
    }
    desktop.addEventListener('change', close)
    return () => desktop.removeEventListener('change', close)
  }, [])

  useEffect(() => {
    if (!open) return
    function dismiss(event: PointerEvent) {
      if (!nav.current?.contains(event.target as Node)) setOpen(false)
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        toggle.current?.focus()
      }
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  function toggleTheme() {
    const next = !light
    setLight(next)
    document.documentElement.dataset.theme = next ? 'light' : 'dark'
    try {
      localStorage.setItem('site-theme', next ? 'light' : 'dark')
    } catch { /* Storage is optional. */ }
  }

  return (
    <header className="site-header">
      <nav ref={nav} className="site-nav" aria-label="Primary" onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}>
        <Link to="/" className="wordmark" aria-label={`${profile.name}, home`}>
          {profile.name.split(' ').map((part) => part[0]).join('')}<span aria-hidden="true">.</span>
        </Link>
        <button ref={toggle} type="button" className="icon-button press nav-toggle" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} aria-controls="navigation-links" onClick={() => setOpen(!open)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" className="size-5">
            <path className="menu-line menu-line-top" d="M4 7h16" />
            <path className="menu-line menu-line-middle" d="M4 12h16" />
            <path className="menu-line menu-line-bottom" d="M4 17h16" />
          </svg>
        </button>
        <div id="navigation-links" className={mobile ? `nav-content menu-motion ${open ? 'is-open' : everOpened.current ? 'is-closing' : ''}` : 'nav-content'} data-origin="top-right" data-open={open} inert={mobile && !open} aria-hidden={mobile && !open ? true : undefined} onClick={(event) => {
          if ((event.target as Element).closest('a')) setOpen(false)
        }}>
          <ul ref={pages} className="nav-pages">
            <li aria-hidden="true" className="nav-pill" />
            {presentation.navigation.map((page) => (
              <li key={page.to}>
                <NavLink to={page.to} end={page.to === '/'} className={({ isActive }) => `nav-link press ${isActive ? 'is-active' : ''}`}>
                  {page.label}
                </NavLink>
              </li>
            ))}
          </ul>
          {quickLinks.length > 0 && (
            <ul className="nav-apps" aria-label="Live projects">
              {quickLinks.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="nav-link nav-app press">
                    {link.label}
                    <ArrowUpRightIcon className="size-3.5 opacity-60" />
                  </a>
                </li>
              ))}
            </ul>
          )}
          <div className="nav-tools">
            <a href={links.gitHub} target="_blank" rel="me noreferrer" className="icon-button press nav-social" aria-label="GitHub"><GitHubIcon className="size-4" /></a>
            <a href={links.linkedIn} target="_blank" rel="me noreferrer" className="icon-button press nav-social" aria-label="LinkedIn"><LinkedInIcon className="size-4" /></a>
            <IconButton label={light ? 'Use dark theme' : 'Use light theme'} onClick={toggleTheme}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="size-4">
                {light ? <path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z" /> : <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>}
              </svg>
            </IconButton>
          </div>
        </div>
      </nav>
    </header>
  )
}
