import { useEffect, useRef, useState } from 'react'
import type { Photo } from '../content/types'
import { formatDay } from '../lib/dates'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from './Icons'
import PhotoImage from './PhotoImage'
import { useDialogMotion } from '../lib/useDialogMotion'
import { IconButton } from './Ui'

/**
 * Built on a native `<dialog>` opened with `showModal()`, which is what gives
 * us the focus trap, Escape-to-close, focus return to the thumbnail, top-layer
 * stacking and an inert background — all of it correct, none of it hand-rolled.
 *
 * What the platform does not give us and this adds: arrow-key and swipe
 * navigation, body scroll lock (the backdrop does not stop the page behind it
 * scrolling), click-outside-to-close, and the open/close motion (see
 * `useDialogMotion`).
 */
/** How much of the viewport a photo may take, leaving room for the caption bar
 *  and the dialog's own padding. */
const MAX_HEIGHT = 'var(--lightbox-photo-height)'

/** Below this the caption has nowhere to go, so a very tall photo in a very
 *  short window gets a caption bar wider than itself rather than an unreadable
 *  one the same width. */
// Fixed so the caption bar holds still while browsing photos of different shapes.
const CAPTION_WIDTH = '32rem'

type Track = {
  id: string | null
  open: boolean
  /** The photo that is fading out, only while a user navigation is in flight. */
  ghost: Photo | null
  /** Whether the current photo should fade in (navigation only, never on open). */
  animate: boolean
  last: Photo | null
}

export default function Lightbox({
  photos,
  index,
  onClose,
  onNavigate,
}: {
  photos: Photo[]
  /** `null` when closed. */
  index: number | null
  onClose: () => void
  /** `-1` for previous, `1` for next. The caller wraps around. */
  onNavigate: (delta: number) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const touchStartX = useRef<number | null>(null)
  const isOpen = index !== null

  // showModal(), the exit animation, and following the user agent's own
  // close/Escape all live in the shared hook.
  useDialogMotion(dialogRef, isOpen, onClose)

  useEffect(() => {
    if (!isOpen) return

    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previous
    }
  }, [isOpen])

  // The dialog stays mounted so it can animate out; the photo it last showed is
  // held until it has finished closing, so the exit does not flash empty.
  const [heldIndex, setHeldIndex] = useState<number | null>(index)
  if (index !== null && heldIndex !== index) setHeldIndex(index)
  const shownIndex = index ?? heldIndex
  const photo = shownIndex === null ? undefined : photos[shownIndex]

  // Dissolve between photos. Only a user navigation sets `ghost`; opening the
  // lightbox never animates the photo.
  const [track, setTrack] = useState<Track>({ id: null, open: false, ghost: null, animate: false, last: null })
  const photoId = photo?.id ?? null
  if (track.id !== photoId || track.open !== isOpen) {
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const navigated = isOpen && track.open && track.last !== null && photo !== undefined && track.id !== photoId && !reduced
    setTrack({
      id: photoId,
      open: isOpen,
      ghost: navigated ? track.last : null,
      animate: navigated,
      last: photo ?? track.last,
    })
  }

  const hasSiblings = photos.length > 1
  const frameWidth = photo ? `calc(${MAX_HEIGHT} * ${photo.width} / ${photo.height})` : undefined

  return (
    <dialog
      ref={dialogRef}
      aria-label={photo && shownIndex !== null ? `Photo ${shownIndex + 1} of ${photos.length}: ${photo.caption}` : undefined}
      onClick={(event) => {
        // Only a click on the dialog box itself — the padding around the
        // figure — counts as clicking out.
        if (event.target === dialogRef.current) onClose()
      }}
      onKeyDown={(event) => {
        // Keep Tab on the viewer controls at both ends of the sequence;
        // some embedded browsers otherwise move focus into their own chrome.
        if (event.key === 'Tab') {
          const controls = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
          const first = controls[0]
          const last = controls[controls.length - 1]
          if (first && last && event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last.focus({ preventScroll: true })
          } else if (first && last && !event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus({ preventScroll: true })
          }
        }

        // Take Escape over from the user agent so the exit animation runs; the
        // hook also handles a native `cancel` for paths that skip this.
        if (event.key === 'Escape') {
          event.preventDefault()
          onClose()
          return
        }

        if (!hasSiblings) return

        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          onNavigate(-1)
        } else if (event.key === 'ArrowRight') {
          event.preventDefault()
          onNavigate(1)
        }
      }}
      onTouchStart={(event) => {
        touchStartX.current = event.changedTouches[0]?.clientX ?? null
      }}
      onTouchEnd={(event) => {
        const start = touchStartX.current
        touchStartX.current = null
        if (start === null || !hasSiblings) return

        const delta = (event.changedTouches[0]?.clientX ?? start) - start
        if (Math.abs(delta) > 50) onNavigate(delta < 0 ? 1 : -1)
      }}
      className="dialog dialog-motion"
    >
      {photo && shownIndex !== null && (
        <div className="pointer-events-none flex h-full w-full items-center justify-center">
          {/* The frame and the caption bar hug the photo instead of stranding it
              in a wide slab — a portrait shot and a panorama each get chrome cut
              to their own shape.

              The width is computed rather than left to `w-fit`, because
              shrink-to-fit sizes a replaced element from its intrinsic width and
              never hears about the height cap: a tall photo in a short viewport
              would leave the frame at full width with the picture stranded down
              one edge. Deriving the width from the height cap and the photo's own
              ratio is the same answer in both directions. */}
          <figure
            className="flex w-full max-h-full flex-col items-center gap-3"
            onClick={(event) => {
              event.stopPropagation()
            }}
          >
            <div style={{ width: `min(100%, ${frameWidth})` }} className="lightbox-frame pointer-events-auto">
              <div className="relative">
                <div key={photo.id} className={track.animate ? 'lightbox-photo-in' : undefined}>
                  <PhotoImage
                    src={photo.src}
                    avif={photo.srcAvif}
                    alt={photo.caption}
                    width={photo.width}
                    height={photo.height}
                    eager
                    className="lightbox-photo w-full"
                  />
                </div>
                {track.ghost && (
                  <img
                    key={track.ghost.id}
                    src={track.ghost.src}
                    alt=""
                    aria-hidden="true"
                    className="lightbox-photo lightbox-photo-out"
                    onAnimationEnd={() => setTrack((current) => ({ ...current, ghost: null }))}
                  />
                )}
              </div>
            </div>

            <figcaption style={{ width: `min(100%, ${CAPTION_WIDTH})` }} className="lightbox-caption pointer-events-auto">
              <div className="lightbox-caption-copy">
                <p className="text-meta font-medium text-ink">{photo.location ?? photo.album}</p>
                {photo.date && <p className="gutter-date mt-0.5">{formatDay(photo.date)}</p>}
              </div>

              {hasSiblings && (
                <span className="numeric shrink-0 font-mono text-caption text-ink-faint">
                  {shownIndex + 1} / {photos.length}
                </span>
              )}

              <div className="flex shrink-0 items-center gap-1">
                {hasSiblings && (
                  <>
                    <IconButton label="Previous photo" onClick={() => onNavigate(-1)}>
                      <ChevronLeftIcon className="size-[1.15rem]" />
                    </IconButton>
                    <IconButton label="Next photo" onClick={() => onNavigate(1)}>
                      <ChevronRightIcon className="size-[1.15rem]" />
                    </IconButton>
                  </>
                )}
                <IconButton label="Close" onClick={onClose}>
                  <CloseIcon className="size-[1.15rem]" />
                </IconButton>
              </div>
            </figcaption>
          </figure>
        </div>
      )}
    </dialog>
  )
}
