import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Photo } from '../content/types'
import { ArrowUpRightIcon, ChevronLeftIcon, ChevronRightIcon } from './Icons'
import PhotoImage from './PhotoImage'
import { IconButton } from './Ui'

/** Dwell per slide. Long enough to look, short enough to notice it moves. */
const INTERVAL_MS = 5000

/**
 * One frame in the hero that cycles through the gallery. Every slide is
 * rendered and stacked and cross-fade once the slide changes. The first slide shows
 * with no animation. Only opacity animates; the frame never resizes between photos.
 *
 * Auto-advance pauses while the pointer or keyboard focus is on it, and is
 * off entirely under `prefers-reduced-motion`; the arrows and dots always
 * work. The frame itself is a link into the gallery, since a photo you can
 * see but not open is a tease.
 */
export default function HeroCarousel({ photos }: { photos: Photo[] }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  // Flips on the first slide change so the initial photo never fades in on load.
  const [changed, setChanged] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const count = photos.length

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(preference.matches)
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])

  const select = (next: number) => {
    setChanged(true)
    setIndex(next)
  }
  const go = (delta: number) => {
    setChanged(true)
    setIndex((current) => (current + delta + count) % count)
  }

  useEffect(() => {
    if (count < 2 || paused || reducedMotion) return
    const timer = window.setInterval(() => go(1), INTERVAL_MS)
    return () => window.clearInterval(timer)
    // `go` is stable in behaviour; re-arming on index keeps the dwell even after
    // a manual step so a click does not cut the next slide short.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, paused, index, reducedMotion])

  if (count === 0) return null
  const current = photos[index]!

  return (
    <section
      className="hero-carousel"
      data-animate={changed}
      aria-roledescription="carousel"
      aria-label="Photos from life and travels"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Link to="/photos" className="hero-carousel-frame" aria-label={`Open the photo gallery at ${current.caption}`}>
        {photos.map((photo, i) => (
          <PhotoImage
            key={photo.id}
            src={photo.src}
            avif={photo.srcAvif}
            alt={photo.caption}
            width={photo.width}
            height={photo.height}
            crop
            eager={i === 0}
            className={`hero-slide ${i === index ? 'is-current' : ''}`}
          />
        ))}
        <span className="photo-label glass-high">
          <span key={current.id} className="carousel-caption">{current.location ?? current.album}</span>
          <ArrowUpRightIcon className="size-4" />
        </span>
      </Link>

      {count > 1 && (
        <div className="hero-carousel-controls">
          <IconButton label="Previous photo" onClick={() => go(-1)}>
            <ChevronLeftIcon className="size-4" />
          </IconButton>
          <div className="hero-carousel-dots" role="tablist" aria-label="Choose a photo">
            {photos.map((photo, i) => (
              <button
                key={photo.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={photo.location ?? photo.caption}
                className={`hero-carousel-dot ${i === index ? 'is-current' : ''}`}
                onClick={() => select(i)}
              />
            ))}
          </div>
          <IconButton label="Next photo" onClick={() => go(1)}>
            <ChevronRightIcon className="size-4" />
          </IconButton>
        </div>
      )}
    </section>
  )
}
