import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import sharp from 'sharp'

const execFileAsync = promisify(execFile)

/**
 * The same derivatives `src/web/scripts/photos.mjs` writes for the bundled
 * photos, produced from an upload instead of a file on Trevor's disk:
 *
 *   <id>.jpg / .avif             long edge 2000px
 *   thumbs/<id>.jpg / .avif      long edge 800px
 *
 * Keep the sizes and encoder settings in step with that script.
 */
const FULL_EDGE = 2000
const THUMB_EDGE = 800
const JPEG = { quality: 82, mozjpeg: true, chromaSubsampling: '4:4:4' }
const AVIF = { quality: 55, effort: 5 }

/** A decompression-bomb guard. 60 MP covers a 48 MP phone sensor; the decoded
 *  pixels (~3 bytes each) are what has to fit in the container's memory. */
const MAX_PIXELS = 60_000_000

/** What sharp may decode. Notably not SVG: it would expose the librsvg parser. */
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'tiff', 'heif'])

/** Major brands of an ISO-BMFF file that is HEIC/HEIF rather than AVIF. */
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'])

const HEIF_CONVERT_TIMEOUT_MS = 30_000

/** Files younger than this are never swept, so an upload still being captioned survives. */
const ORPHAN_GRACE_MS = 60 * 60 * 1000

sharp.cache(false)
sharp.concurrency(1)

export class UnsupportedImageError extends Error {}

/** True for HEIC/HEIF (what iPhones write). Decided from the file's own bytes,
 *  never from its name or the browser's claimed type. */
export function isHeif(buffer) {
  return buffer.length >= 12 && buffer.toString('latin1', 4, 8) === 'ftyp' && HEIF_BRANDS.has(buffer.toString('latin1', 8, 12))
}

/**
 * sharp's bundled libheif can decode AV1 (AVIF) but not HEVC, which is what
 * HEIC contains, so HEIC goes through libheif's own `heif-convert` (installed in
 * the Docker image) and comes back as a PNG that sharp can read. It is run
 * without a shell, on a private temp file, with a timeout and a scrubbed
 * environment.
 */
export async function convertHeif(buffer) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'heic-'))
  try {
    await writeFile(path.join(dir, 'in.heic'), buffer)
    await execFileAsync('heif-convert', ['in.heic', 'out.png'], {
      cwd: dir,
      timeout: HEIF_CONVERT_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
    })

    // A file holding several images is written as out-1.png, out-2.png, …
    const produced = (await readdir(dir)).filter((name) => /^out(-\d+)?\.png$/.test(name)).sort()
    if (produced.length === 0) throw new Error('no output')
    return await readFile(path.join(dir, produced[0]))
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new UnsupportedImageError(
        'This server cannot convert HEIC photos. Export the photo as JPEG and upload that instead.',
        { cause: error },
      )
    }
    throw new UnsupportedImageError('That HEIC file could not be read.', { cause: error })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** `IMG_2041 Final.JPG` -> `img-2041-final`. */
export function slugify(name) {
  const base = name.replace(/\.[^.]*$/, '').toLowerCase()
  const slug = base.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return slug === '' ? 'photo' : slug
}

/**
 * Writes the four derivatives and returns the generated half of a photo entry.
 * The words (caption, album, …) are the editor's to add.
 */
export async function processPhoto(buffer, originalName, mediaDir) {
  // 64 random bits: the file is reachable by URL from the moment it is uploaded,
  // so the id is also what keeps an unsaved draft from being guessable.
  const id = `${slugify(originalName)}-${randomBytes(8).toString('hex')}`
  const full = path.join(mediaDir, 'photos')
  const thumbs = path.join(full, 'thumbs')
  await mkdir(thumbs, { recursive: true })

  const source = isHeif(buffer) ? await convertHeif(buffer) : buffer

  try {
    // rotate() applies the EXIF orientation and, like all sharp output, drops
    // the metadata: no GPS coordinates leave the server inside a published photo.
    const input = sharp(source, { limitInputPixels: MAX_PIXELS, failOn: 'error', sequentialRead: true }).rotate()
    const { width, height, format } = await input.metadata()
    if (!width || !height) throw new Error('no dimensions')
    if (!ALLOWED_FORMATS.has(format)) throw new Error(`unsupported format ${format}`)

    const landscape = width >= height
    const resize = (edge) =>
      input.clone().resize({
        width: landscape ? edge : null,
        height: landscape ? null : edge,
        withoutEnlargement: true,
        fit: 'inside',
      })

    // One encode at a time: four in parallel each hold their own copy of a
    // large decode, which is what pushes a small container over its memory limit.
    const fullJpeg = await resize(FULL_EDGE).jpeg(JPEG).toFile(path.join(full, `${id}.jpg`))
    await resize(FULL_EDGE).avif(AVIF).toFile(path.join(full, `${id}.avif`))
    await resize(THUMB_EDGE).jpeg(JPEG).toFile(path.join(thumbs, `${id}.jpg`))
    await resize(THUMB_EDGE).avif(AVIF).toFile(path.join(thumbs, `${id}.avif`))

    return {
      id,
      src: `/media/photos/${id}.jpg`,
      srcAvif: `/media/photos/${id}.avif`,
      thumbnail: `/media/photos/thumbs/${id}.jpg`,
      thumbnailAvif: `/media/photos/thumbs/${id}.avif`,
      width: fullJpeg.width,
      height: fullJpeg.height,
    }
  } catch (error) {
    await removePhotoFiles(mediaDir, id)
    throw new UnsupportedImageError(
      'That file could not be read as an image. JPEG, PNG, WebP, AVIF and TIFF are supported.',
      { cause: error },
    )
  }
}

async function removePhotoFiles(mediaDir, id) {
  const full = path.join(mediaDir, 'photos')
  await Promise.all(
    ['jpg', 'avif'].flatMap((ext) => [
      rm(path.join(full, `${id}.${ext}`), { force: true }),
      rm(path.join(full, 'thumbs', `${id}.${ext}`), { force: true }),
    ]),
  )
}

/** The `/media/photos/...` files a saved photo list points at, as absolute paths. */
export function mediaFilesFor(photos, mediaDir) {
  const files = []
  for (const photo of photos) {
    for (const url of [photo.src, photo.srcAvif, photo.thumbnail, photo.thumbnailAvif]) {
      if (typeof url === 'string' && url.startsWith('/media/photos/')) {
        files.push(path.join(mediaDir, url.slice('/media/'.length)))
      }
    }
  }
  return files
}

export async function exists(file) {
  try {
    await stat(file)
    return true
  } catch {
    return false
  }
}

/**
 * Deletes uploaded files that no saved photo refers to, once they are older
 * than the grace period. Covers both a photo removed from the gallery and an
 * upload that was abandoned before it was ever saved.
 */
export async function sweepOrphans(photos, mediaDir, now = Date.now()) {
  const keep = new Set(mediaFilesFor(photos, mediaDir))
  const root = path.join(mediaDir, 'photos')

  for (const dir of [root, path.join(root, 'thumbs')]) {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const file = path.join(dir, entry.name)
      if (keep.has(file)) continue
      if (now - (await stat(file)).mtimeMs < ORPHAN_GRACE_MS) continue
      await rm(file, { force: true })
    }
  }
}
