import type { Photo } from '../content/types'
import { formatDay } from '../lib/dates'
import PhotoImage from './PhotoImage'

/**
 * A CSS-columns masonry. Real masonry (rather than a fixed-ratio grid) is the
 * point of a photo gallery — cropping someone's portrait orientation into a
 * square to make the rows line up is the tell of a developer's photo page.
 *
 * Reading order runs down each column rather than across, which is the accepted
 * trade for `columns`; captions carry the metadata, so nothing depends on the
 * visual sequence.
 */
export default function PhotoGrid({
  className = '',
  photos,
  onSelect,
}: {
  className?: string
  photos: Photo[]
  onSelect: (index: number) => void
}) {
  return (
    <ul className={`gallery-grid ${className}`}>
      {photos.map((photo, index) => (
        <li key={photo.id} className="break-inside-avoid">
          <button
            type="button"
            aria-label={`View photo: ${photo.caption}`}
            aria-haspopup="dialog"
            onClick={() => onSelect(index)}
            className="gallery-photo press"
          >
            <PhotoImage
              src={photo.thumbnail}
              avif={photo.thumbnailAvif}
              alt={photo.caption}
              width={photo.width}
              height={photo.height}
              sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw"
              className="w-full"
              eager={index < 3}
            />

            <span className="gallery-caption">
              <span className="gallery-caption-copy">
                <span className="gallery-caption-title">{photo.location ?? photo.album}</span>
                {photo.date && <span className="gutter-date">{formatDay(photo.date)}</span>}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
