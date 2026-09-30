import { useRef, useState } from 'react'
import { photos as initial } from '../content'
import type { Photo } from '../content/types'
import { ApiError, uploadPhoto } from './api'
import { Button, SaveBar, StatusLine, TextField, type Notice } from './controls'
import { useCollection } from './useCollection'
import { useUnsavedGuard } from './useUnsavedGuard'

const ALBUM_LIST = 'studio-albums'

/** `IMG_2041-final.JPG` -> `IMG 2041 final`, a caption the editor can improve on. */
const captionFromFileName = (name: string) =>
  name
    .replace(/\.[^.]*$/, '')
    .replace(/[-_]+/g, ' ')
    .trim() || 'Untitled'

/**
 * The gallery: upload, caption, reorder, remove. Uploads are processed on the
 * server the same way the build's photo pipeline processes the bundled ones
 * (resized, EXIF orientation applied, metadata stripped, AVIF twin written),
 * and appear here immediately; nothing is public until Save.
 */
export default function PhotosEditor() {
  const collection = useCollection('photos', initial)
  const [uploading, setUploading] = useState<string[]>([])
  const [uploadNotice, setUploadNotice] = useState<Notice>(null)
  const [dragging, setDragging] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  useUnsavedGuard(collection.dirty)

  const photos = collection.draft
  const albums = [...new Set(photos.map((photo) => photo.album))]

  const update = (index: number, patch: Partial<Photo>) =>
    collection.edit(photos.map((photo, i) => (i === index ? { ...photo, ...patch } : photo)))

  const move = (from: number, to: number) => {
    if (to < 0 || to >= photos.length) return
    const next = [...photos]
    next.splice(to, 0, next.splice(from, 1)[0]!)
    collection.edit(next)
  }

  const remove = (index: number) => {
    const photo = photos[index]!
    if (!window.confirm(`Remove "${photo.caption}" from the gallery? It stays until you save.`)) return
    collection.edit(photos.filter((_, i) => i !== index))
  }

  async function upload(files: File[]) {
    // Windows reports no MIME type for .heic, so the extension counts too. The
    // server decides what a file really is from its bytes.
    const images = files.filter((file) => file.type.startsWith('image/') || /\.hei[cf]$/i.test(file.name))
    setUploadNotice(
      images.length < files.length ? { tone: 'error', text: 'Skipped files that are not images.' } : null,
    )

    const added: Photo[] = []
    // One at a time: each is resized and re-encoded on a small server.
    for (const file of images) {
      setUploading((current) => [...current, file.name])
      try {
        const generated = await uploadPhoto(file)
        added.push({
          ...generated,
          caption: captionFromFileName(file.name),
          location: null,
          date: null,
          album: albums[0] ?? 'Photos',
        })
      } catch (error) {
        const text = error instanceof ApiError ? error.message : 'The upload failed.'
        setUploadNotice({ tone: 'error', text: `${file.name}: ${text}` })
      } finally {
        setUploading((current) => current.filter((name) => name !== file.name))
      }
    }

    // New photos go first: the gallery and the home carousel both lead with them.
    if (added.length > 0) collection.edit([...added, ...photos])
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-[60ch] text-ink-muted">
        Upload, caption, reorder and remove gallery photos. Order here is the order on the site. Changes are
        private until you save.
      </p>

      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          void upload([...event.dataTransfer.files])
        }}
        className={`flex flex-col items-center gap-3 rounded-panel border border-dashed p-8 text-center transition-colors ${
          dragging ? 'border-accent bg-accent-soft' : 'border-hairline-strong bg-veil'
        }`}
      >
        <p className="text-ink-muted">Drop photos here, or</p>
        <Button onClick={() => picker.current?.click()} disabled={uploading.length > 0}>
          {uploading.length > 0 ? `Processing ${uploading[0]}…` : 'Choose photos'}
        </Button>
        <input
          ref={picker}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,image/tiff,image/heic,image/heif,.heic,.heif"
          multiple
          hidden
          onChange={(event) => {
            void upload([...(event.target.files ?? [])])
            event.target.value = ''
          }}
        />
        <p className="text-caption text-ink-faint">JPEG, HEIC, PNG, WebP, AVIF or TIFF, up to 25 MB each.</p>
        <StatusLine notice={uploadNotice} errorLabel="Upload" />
      </div>

      <datalist id={ALBUM_LIST}>
        {albums.map((album) => (
          <option key={album} value={album} />
        ))}
      </datalist>

      <ol className="flex flex-col gap-4">
        {photos.map((photo, index) => (
          <li key={photo.id} className="glass grid gap-5 rounded-card p-4 sm:grid-cols-[10rem_1fr]">
            <img
              src={photo.thumbnail}
              alt=""
              width={photo.width}
              height={photo.height}
              className="image-edge max-h-48 w-full rounded-control bg-inset object-cover sm:h-40"
            />
            <div className="flex flex-col gap-4">
              <TextField label="Caption" value={photo.caption} onChange={(caption) => update(index, { caption })} />
              <div className="grid gap-4 sm:grid-cols-3">
                <TextField
                  label="Location"
                  value={photo.location ?? ''}
                  onChange={(location) => update(index, { location: location === '' ? null : location })}
                />
                <TextField
                  label="Date"
                  type="date"
                  value={photo.date ?? ''}
                  onChange={(date) => update(index, { date: date === '' ? null : date })}
                />
                <TextField
                  label="Album"
                  list={ALBUM_LIST}
                  value={photo.album}
                  onChange={(album) => update(index, { album })}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => move(index, index - 1)} disabled={index === 0}>
                  Move up
                </Button>
                <Button onClick={() => move(index, index + 1)} disabled={index === photos.length - 1}>
                  Move down
                </Button>
                <Button variant="danger" onClick={() => remove(index)} className="sm:ml-auto">
                  Remove
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <SaveBar
        dirty={collection.dirty}
        busy={collection.busy}
        overridden={collection.overridden}
        notice={collection.notice}
        onSave={collection.save}
        onDiscard={collection.discard}
        onReset={collection.reset}
      />
    </div>
  )
}
