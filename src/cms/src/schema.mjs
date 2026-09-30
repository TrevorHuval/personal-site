/**
 * Validators for the six content collections.
 *
 * These mirror `src/web/src/content/types.ts` and the rules in
 * `content.test.ts`, because content saved from the studio bypasses both the
 * TypeScript compiler and the test suite that guard hand-edited JSON. A value
 * that would have failed the build must be refused here instead.
 */

export class ValidationError extends Error {}

const bad = (path, message) => {
  throw new ValidationError(`${path || 'value'}: ${message}`)
}

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

const string =
  ({ max = 2000, pattern, hint } = {}) =>
  (v, p) => {
    if (typeof v !== 'string') bad(p, 'must be text')
    if (v.trim() === '') bad(p, 'must not be empty')
    if (v.length > max) bad(p, `is longer than ${max} characters`)
    if (pattern && !pattern.test(v)) bad(p, hint ?? 'has the wrong format')
    return v
  }

const nullable = (inner) => (v, p) => (v === null ? null : inner(v, p))

const optional = (inner) => Object.assign((v, p) => inner(v, p), { optional: true })

const integer =
  ({ min = 0, max = 1_000_000 } = {}) =>
  (v, p) => {
    if (!Number.isInteger(v)) bad(p, 'must be a whole number')
    if (v < min || v > max) bad(p, `must be between ${min} and ${max}`)
    return v
  }

const array =
  (inner, { min = 0, max = 500 } = {}) =>
  (v, p) => {
    if (!Array.isArray(v)) bad(p, 'must be a list')
    if (v.length < min) bad(p, `needs at least ${min} item${min === 1 ? '' : 's'}`)
    if (v.length > max) bad(p, `has more than ${max} items`)
    return v.map((item, i) => inner(item, `${p}[${i}]`))
  }

/** Exact shape: an unknown key is as much a mistake as a missing one. */
const object = (shape) => (v, p) => {
  if (!isPlainObject(v)) bad(p, 'must be an object')
  for (const key of Object.keys(v)) {
    if (!Object.hasOwn(shape, key)) bad(`${p}.${key}`, 'is not a known field')
  }

  const out = {}
  for (const [key, validate] of Object.entries(shape)) {
    const at = p ? `${p}.${key}` : key
    if (v[key] === undefined) {
      if (validate.optional) continue
      bad(at, 'is required')
    }
    out[key] = validate(v[key], at)
  }
  return out
}

const httpsUrl = string({ max: 500, pattern: /^https:\/\/[^\s]+$/, hint: 'must be an https:// link' })
const monthDate = string({ max: 7, pattern: /^\d{4}-(0[1-9]|1[0-2])$/, hint: 'must look like 2024-06' })
const slug = string({ max: 64, pattern: /^[a-z0-9][a-z0-9-]*$/, hint: 'may only use a-z, 0-9 and hyphens' })

const photoPath = (ext) =>
  string({
    max: 200,
    pattern: new RegExp(`^/(?:photos|media/photos)/(?:thumbs/)?[a-z0-9][a-z0-9._-]*\\.${ext}$`),
    hint: `must be a /photos or /media/photos ${ext} path`,
  })

const photo = object({
  id: slug,
  src: photoPath('jpg'),
  srcAvif: nullable(photoPath('avif')),
  thumbnail: photoPath('jpg'),
  thumbnailAvif: nullable(photoPath('avif')),
  caption: string({ max: 300 }),
  location: nullable(string({ max: 200 })),
  date: nullable(string({ max: 10, pattern: /^\d{4}-\d{2}-\d{2}$/, hint: 'must look like 2024-06-15' })),
  album: string({ max: 60 }),
  width: integer({ min: 1, max: 20000 }),
  height: integer({ min: 1, max: 20000 }),
})

const pagePresentation = object({
  eyebrow: string({ max: 120 }),
  title: string({ max: 200 }),
  description: optional(string({ max: 500 })),
})

const uniqueBy = (list, pick, path, label) => {
  const seen = new Set()
  for (const item of list) {
    const key = pick(item).toLowerCase()
    if (seen.has(key)) bad(path, `has two entries with the ${label} "${pick(item)}"`)
    seen.add(key)
  }
}

const SCHEMAS = {
  photos: (v) => {
    const photos = array(photo, { min: 1, max: 500 })(v, 'photos')
    uniqueBy(photos, (p) => p.id, 'photos', 'id')

    // A <picture> does not fall back when an AVIF it accepts is missing, so the
    // two variants must always travel as a pair (see content.test.ts).
    photos.forEach((p, i) => {
      for (const [jpeg, avif, name] of [
        [p.src, p.srcAvif, 'srcAvif'],
        [p.thumbnail, p.thumbnailAvif, 'thumbnailAvif'],
      ]) {
        if (avif !== null && avif !== jpeg.replace(/\.jpg$/, '.avif')) {
          bad(`photos[${i}].${name}`, 'must be the .avif twin of its .jpg')
        }
      }
      if (p.date !== null && Number.isNaN(Date.parse(p.date))) bad(`photos[${i}].date`, 'is not a real date')
    })
    return photos
  },

  profile: object({
    name: string({ max: 100 }),
    headline: string({ max: 400 }),
    location: string({ max: 120 }),
    bio: array(string({ max: 2000 }), { min: 1, max: 12 }),
    links: object({ gitHub: httpsUrl, linkedIn: httpsUrl }),
    quickLinks: array(object({ label: string({ max: 40 }), href: httpsUrl }), { max: 4 }),
  }),

  resume: object({
    experience: array(
      object({
        company: string({ max: 200 }),
        title: string({ max: 200 }),
        location: string({ max: 120 }),
        startDate: monthDate,
        endDate: nullable(monthDate),
        highlights: array(string({ max: 1500 }), { min: 1, max: 20 }),
        tech: array(string({ max: 60 }), { max: 40 }),
      }),
      { min: 1, max: 40 },
    ),
    education: array(
      object({
        institution: string({ max: 200 }),
        degree: string({ max: 200 }),
        field: nullable(string({ max: 200 })),
        startDate: monthDate,
        endDate: nullable(monthDate),
        notes: nullable(string({ max: 500 })),
      }),
      { min: 1, max: 20 },
    ),
  }),

  skills: (v) => {
    const groups = array(object({ name: string({ max: 80 }), items: array(string({ max: 80 }), { min: 1, max: 60 }) }), {
      min: 1,
      max: 30,
    })(v, 'skills')
    uniqueBy(groups, (g) => g.name, 'skills', 'name')
    return groups
  },

  projects: (v) => {
    const projects = array(
      object({
        id: slug,
        name: string({ max: 100 }),
        summary: string({ max: 400 }),
        description: nullable(string({ max: 3000 })),
        tech: array(string({ max: 60 }), { min: 1, max: 30 }),
        repoSlug: nullable(string({ max: 140, pattern: /^[\w.-]+\/[\w.-]+$/, hint: 'must look like owner/name' })),
        liveUrl: nullable(httpsUrl),
        order: integer({ min: 0, max: 1000 }),
      }),
      { min: 1, max: 60 },
    )(v, 'projects')
    uniqueBy(projects, (p) => p.id, 'projects', 'id')
    return projects
  },

  presentation: object({
    navigation: array(
      object({
        to: string({ max: 100, pattern: /^\/(?![/\\])[^\s\\]*$/, hint: 'must be a path starting with /' }),
        label: string({ max: 40 }),
      }),
      { min: 1, max: 10 },
    ),
    home: object({
      eyebrow: string({ max: 120 }),
      aboutTitle: string({ max: 120 }),
      skillsTitle: string({ max: 120 }),
      experienceTitle: string({ max: 120 }),
    }),
    projects: pagePresentation,
    photos: pagePresentation,
  }),
}

export const COLLECTIONS = Object.keys(SCHEMAS)

/**
 * Validates one collection and returns the cleaned value. Throws
 * {@link ValidationError} with a message safe to show to the editor.
 */
export function validateCollection(name, value) {
  const schema = SCHEMAS[name]
  if (schema === undefined) throw new ValidationError(`${name} is not an editable collection`)

  const clean = schema(value, name)

  // The same two guards content.test.ts puts on the JSON files: no leftover
  // placeholders, and no email address anywhere in what gets scraped.
  // Checked string by string with bounded quantifiers: one unbounded pattern
  // over the whole document is quadratic on a long run of address characters.
  for (const text of strings(clean)) {
    if (/TODO/i.test(text)) throw new ValidationError('Content may not contain the placeholder text "TODO"')
    if (/[\w.+-]{1,64}@[\w-]{1,255}\.[\w.]{1,255}/.test(text)) {
      throw new ValidationError('Content may not contain an email address; it belongs in the résumé PDF only')
    }
  }
  return clean
}

function* strings(value) {
  if (typeof value === 'string') yield value
  else if (Array.isArray(value)) for (const item of value) yield* strings(item)
  else if (isPlainObject(value)) for (const item of Object.values(value)) yield* strings(item)
}
