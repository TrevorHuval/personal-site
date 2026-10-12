import { useState } from 'react'
import { ImageIcon } from './Icons'

/**
 * An image that knows how to not exist.
 *
 * `photos.json` is metadata, and metadata can outrun the files it points at —
 * during content authoring, or if a filename is mistyped. A grid of browser
 * broken-image glyphs makes a finished page look broken, so a failed load
 * degrades to a frosted tile at the photo's own aspect ratio. Layout is
 * identical either way.
 */
export default function PhotoImage({
  src,
  avif = null,
  alt,
  width,
  height,
  className = '',
  sizes,
  eager = false,
  crop = false,
}: {
  src: string
  /**
   * AVIF twin of `src`, roughly 40% of the bytes. Offered as a `<source>` only
   * when the pipeline actually wrote one: `<picture>` does not fall back to the
   * `<img>` if a source it accepts fails to load, so guessing here would be a
   * broken image rather than a big one.
   */
  avif?: string | null
  alt: string
  width: number
  height: number
  className?: string
  sizes?: string
  eager?: boolean
  /**
   * Let the caller own the box instead of the photo owning it. The masonry
   * grid wants each photo's true shape; the Home strip wants a uniform row of
   * squares. An inline `aspect-ratio` would beat any utility class the caller
   * passed, so reserving space from the intrinsic size has to be opt-out.
   */
  crop?: boolean
}) {
  const [status, setStatus] = useState<'pending' | 'loaded' | 'failed'>('pending')

  // Reserving space from the real dimensions is what stops the grid reflowing
  // as images arrive — but only when this component is the one sizing the box.
  const reserveSpace = crop ? undefined : { aspectRatio: `${width} / ${height}` }

  if (status === 'failed') {
    return (
      <div
        role="img"
        aria-label={`${alt} (image unavailable)`}
        style={reserveSpace}
        className={`flex flex-col items-center justify-center gap-2 bg-inset text-ink-faint image-edge ${className}`}
      >
        <ImageIcon className="size-6" />
        <span className="font-mono text-caption tracking-[0.08em] uppercase">Not yet added</span>
      </div>
    )
  }

  const image = (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      loading={eager ? 'eager' : 'lazy'}
      // The first thing a visitor sees on the Photos page should not wait in
      // the queue behind six lazy thumbnails.
      fetchPriority={eager ? 'high' : undefined}
      decoding="async"
      data-loaded={status === 'loaded'}
      // A cached image can finish before React attaches onLoad; catch it here.
      ref={(el) => {
        if (el?.complete && el.naturalWidth > 0 && status === 'pending') setStatus('loaded')
      }}
      onLoad={() => setStatus('loaded')}
      onError={() => setStatus('failed')}
      className={`photo-fade bg-inset image-edge ${className}`}
      style={reserveSpace}
    />
  )

  if (avif === null) return image

  return (
    // `display: contents` so the wrapper is invisible to layout and the <img>
    // stays a direct child of whatever box the caller built for it.
    <picture className="contents">
      <source type="image/avif" srcSet={avif} sizes={sizes} />
      {image}
    </picture>
  )
}
