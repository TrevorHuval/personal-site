import { useEffect, useState } from 'react'
import { presentation, profile, projects, resume, skills } from '../content'
import { usePageMeta } from '../lib/usePageMeta'
import { ApiError, isSignedIn, signIn, signOut } from './api'
import CollectionEditor from './CollectionEditor'
import { Button, Field, INPUT, StatusLine, type Notice } from './controls'
import PhotosEditor from './PhotosEditor'

/**
 * The owner-only editing area, mounted at /studio. It is not linked from
 * anywhere; the footer's hidden gesture is the front door. Being unlinked is a
 * convenience, not the protection: every request it makes is refused by the
 * server without the session cookie a correct password earns.
 */
export default function Studio() {
  usePageMeta({ title: 'Studio', description: 'Private.' })
  useNoIndex()

  const [state, setState] = useState<'checking' | 'out' | 'in'>('checking')

  useEffect(() => {
    let live = true
    void isSignedIn().then((signedIn) => live && setState(signedIn ? 'in' : 'out'))
    return () => {
      live = false
    }
  }, [])

  if (state === 'checking') return <p role="status" className="text-ink-muted">Checking…</p>
  if (state === 'out') return <Login onSignedIn={() => setState('in')} />
  return <Workspace onSignedOut={() => setState('out')} />
}

/** The page is out of the sitemap and robots policy already; this covers a direct link. */
function useNoIndex() {
  useEffect(() => {
    const tag = document.createElement('meta')
    tag.name = 'robots'
    tag.content = 'noindex, nofollow'
    document.head.appendChild(tag)
    return () => tag.remove()
  }, [])
}

function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      await signIn(password)
      onSignedIn()
    } catch (error) {
      const wait = error instanceof ApiError && error.retryAfter !== null ? ` Wait ${Math.ceil(error.retryAfter / 60)} min.` : ''
      setNotice({ tone: 'error', text: error instanceof ApiError ? `${error.message}${wait}` : 'Sign-in failed.' })
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="glass-high mx-auto flex w-full max-w-sm flex-col gap-5 rounded-panel p-8">
      <h1 className="text-2xl font-semibold">Studio</h1>
      <Field label="Password">
        {(id) => (
          <input
            id={id}
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={INPUT}
          />
        )}
      </Field>
      <Button type="submit" variant="primary" disabled={busy || password === ''}>
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
      <StatusLine notice={notice} errorLabel="Refused" />
    </form>
  )
}

const TABS = [
  { id: 'photos', label: 'Photos' },
  { id: 'profile', label: 'Profile' },
  { id: 'presentation', label: 'Page headings' },
  { id: 'projects', label: 'Projects' },
  { id: 'skills', label: 'Skills' },
  { id: 'resume', label: 'Résumé' },
] as const

type TabId = (typeof TABS)[number]['id']

function Workspace({ onSignedOut }: { onSignedOut: () => void }) {
  const [tab, setTab] = useState<TabId>('photos')

  async function leave() {
    await signOut().catch(() => {})
    onSignedOut()
  }

  // Every editor stays mounted (hidden, not unmounted) so switching tabs never
  // discards a draft.
  const panel = (id: TabId, children: React.ReactNode) => (
    <section id={`panel-${id}`} role="tabpanel" aria-labelledby={`tab-${id}`} hidden={tab !== id}>
      {children}
    </section>
  )

  return (
    <div className="flex flex-col gap-8">
      <header className="page-heading">
        <p className="gutter-date">Owner only</p>
        <h1>Studio</h1>
        <div className="flex flex-wrap gap-2">
          {/* A plain link on purpose: the public pages read their content once
              at load, so a full navigation is what shows a saved edit. */}
          <a href="/" className="action action-quiet">
            View site
          </a>
          <Button onClick={() => void leave()}>Sign out</Button>
        </div>
      </header>

      <div role="tablist" aria-label="Content" className="album-filters">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            id={`tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => setTab(id)}
            className="album-filter"
          >
            {label}
          </button>
        ))}
      </div>

      {panel('photos', <PhotosEditor />)}
      {panel(
        'profile',
        <CollectionEditor
          name="profile"
          initial={profile}
          intro="Name, headline, bio and the links in the navigation. No email addresses: the résumé PDF is the only place for one."
        />,
      )}
      {panel(
        'presentation',
        <CollectionEditor
          name="presentation"
          initial={presentation}
          intro="Navigation labels and the headings on the home, projects and photos pages."
        />,
      )}
      {panel(
        'projects',
        <CollectionEditor
          name="projects"
          initial={projects}
          intro="Project cards. Order sets both position and the frame number printed on each card."
        />,
      )}
      {panel(
        'skills',
        <CollectionEditor name="skills" initial={skills} intro="Skill groups on the home and résumé pages." />,
      )}
      {panel(
        'resume',
        <CollectionEditor
          name="resume"
          initial={resume}
          intro="Experience and education. Dates use year and month, like 2024-06; leave the end date empty for a current role."
        />,
      )}
    </div>
  )
}
