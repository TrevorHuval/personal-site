import { useEffect, useMemo, useRef, useState } from 'react'
import { photos, presentation } from '../content'
import Lightbox from '../components/Lightbox'
import PhotoGrid from '../components/PhotoGrid'
import { Segmented } from '../components/Ui'
import { usePageMeta } from '../lib/usePageMeta'

const ALL = 'All'

const ALBUMS = [ALL, ...new Set(photos.map((photo) => photo.album))]

const countIn = (name: string) =>
  name === ALL ? photos.length : photos.filter((photo) => photo.album === name).length

/** Old tiles fade out for this long before the new set is swapped in. */
const FADE_OUT_MS = 100
/** 30ms delay + 150ms fade-in, after which the in-class is dropped. */
const FADE_IN_MS = 190

export default function Photos() {
  usePageMeta({
    title: 'Photos',
    description: 'A gallery of photographs from travels and from home.',
  })

  // `album` is the selected filter (drives the control and moves its pill);
  // `shownAlbum` is what the grid currently displays. They differ only for the
  // 100ms the old tiles take to fade out.
  const [album, setAlbum] = useState(ALL)
  const [shownAlbum, setShownAlbum] = useState(ALL)
  const [phase, setPhase] = useState<'idle' | 'out' | 'in'>('idle')
  const [selected, setSelected] = useState<number | null>(null)
  const timers = useRef<number[]>([])

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
  }
  useEffect(() => clearTimers, [])

  const visible = useMemo(
    () => (shownAlbum === ALL ? photos : photos.filter((photo) => photo.album === shownAlbum)),
    [shownAlbum],
  )

  // The lightbox indexes into the filtered list, so switching albums while it
  // is open would point at the wrong photo. Closing is the honest fix.
  const selectAlbum = (next: string) => {
    if (next === album) return
    setSelected(null)
    setAlbum(next)
    clearTimers()

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShownAlbum(next)
      setPhase('idle')
      return
    }

    // Dissolve: old out fast, then the new set in.
    setPhase('out')
    timers.current.push(
      window.setTimeout(() => {
        setShownAlbum(next)
        setPhase('in')
        timers.current.push(window.setTimeout(() => setPhase('idle'), FADE_IN_MS))
      }, FADE_OUT_MS),
    )
  }

  const navigate = (delta: number) => {
    setSelected((current) => {
      if (current === null || visible.length === 0) return current
      return (current + delta + visible.length) % visible.length
    })
  }

  return (
    <div className="flex flex-col gap-10">
      <header className="page-heading">
        <p className="gutter-date">{presentation.photos.eyebrow}</p>
        <h1>{presentation.photos.title}</h1>
        <p className="max-w-[60ch] text-lg text-ink-muted">
          {presentation.photos.description}
        </p>
      </header>

      {ALBUMS.length > 2 && (
        <Segmented
          label="Filter by album"
          value={album}
          onChange={selectAlbum}
          className="max-w-full self-start overflow-x-auto"
          options={ALBUMS.map((name) => ({
            value: name,
            ariaLabel: `${name}: ${countIn(name)} photos`,
            label: (
              <>
                {name}
                <span className="ml-2 numeric">{countIn(name)}</span>
              </>
            ),
          }))}
        />
      )}

      <p className="sr-only" role="status">{visible.length} {visible.length === 1 ? 'photo' : 'photos'} shown</p>
      <PhotoGrid
        photos={visible}
        onSelect={setSelected}
        className={phase === 'out' ? 'is-out' : phase === 'in' ? 'is-in' : ''}
      />

      <Lightbox
        photos={visible}
        index={selected}
        onClose={() => setSelected(null)}
        onNavigate={navigate}
      />
    </div>
  )
}
