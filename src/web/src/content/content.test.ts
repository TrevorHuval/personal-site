import { describe, expect, it } from 'vitest'
import photosRaw from './photos.json?raw'
import profileRaw from './profile.json?raw'
import projectsRaw from './projects.json?raw'
import resumeRaw from './resume.json?raw'
import skillsRaw from './skills.json?raw'
import presentationRaw from './presentation.json?raw'
import { photos, profile, projects, resume, skills } from './index'

/**
 * The content lint. This is the port of the xUnit suite that used to run against
 * `src/Api/Data` before the site went static, and it exists for the same reason:
 * these files are edited by hand, and a bad edit should fail a build rather than
 * appear as a blank panel on a live page.
 *
 * `tsc` already covers *shape*. What it cannot see is a value that is the right
 * type and still wrong — a date typed `2023-5`, two photos sharing an id, an
 * AVIF path pointing at a file the pipeline never wrote. That is this file's
 * job.
 */

/* The files as text rather than as objects, so these two checks see comments,
   keys and values alike — anything a scraper or a crawler would see. */
const FILES = [
  ['profile.json', profileRaw],
  ['resume.json', resumeRaw],
  ['skills.json', skillsRaw],
  ['projects.json', projectsRaw],
  ['photos.json', photosRaw],
  ['presentation.json', presentationRaw],
] as const

describe.each(FILES)('%s', (_name, raw) => {
  /**
   * The site carries real content, not a scaffold. A leftover placeholder would
   * ship straight to a page, a link preview, or a search result.
   */
  it('has no placeholder text left in it', () => {
    expect(raw).not.toMatch(/\bTODO\b/)
  })

  /**
   * Trevor's email belongs in the résumé PDF and nowhere else: an address in the
   * content is an address in the markup, and the markup is what gets scraped.
   * This is the guard on that decision, not a style preference.
   */
  it('carries no email address', () => {
    expect(raw).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/)
  })
})

describe('profile', () => {
  it('has every field the pages and the build-time meta need', () => {
    expect(profile.name.trim()).not.toBe('')
    expect(profile.headline.trim()).not.toBe('')
    expect(profile.location.trim()).not.toBe('')
    expect(profile.bio.length).toBeGreaterThan(0)
    expect(profile.bio.every((paragraph) => paragraph.trim() !== '')).toBe(true)
  })

  /** Both end up in the JSON-LD `sameAs` block, which drops anything that is not
   * an absolute URL — so a relative one would vanish silently. */
  it('links out with absolute URLs', () => {
    expect(profile.links.gitHub).toMatch(/^https:\/\//)
    expect(profile.links.linkedIn).toMatch(/^https:\/\//)
    for (const link of profile.quickLinks) {
      expect(link.label.trim()).not.toBe('')
      expect(link.href).toMatch(/^https:\/\//)
    }
  })
})

describe('resume', () => {
  it('has entries with the fields the timeline renders', () => {
    expect(resume.experience.length).toBeGreaterThan(0)
    expect(resume.education.length).toBeGreaterThan(0)

    for (const entry of resume.experience) {
      expect(entry.company.trim()).not.toBe('')
      expect(entry.title.trim()).not.toBe('')
      expect(entry.highlights.length).toBeGreaterThan(0)
    }
  })

  /** A null end date is how "present" is expressed. An empty string would render
   * as a role that ended at an unknown time. */
  it('marks the current role with a null end date', () => {
    expect(resume.experience[0].endDate).toBeNull()
  })

  it('uses month precision on every date', () => {
    const dates = resume.experience.flatMap((entry) => [entry.startDate, entry.endDate])

    for (const date of dates) {
      if (date === null) continue
      expect(date).toMatch(/^\d{4}-\d{2}$/)
    }
  })
})

describe('skills', () => {
  it('has non-empty, uniquely named groups', () => {
    expect(skills.length).toBeGreaterThan(0)

    for (const group of skills) {
      expect(group.name.trim()).not.toBe('')
      expect(group.items.length).toBeGreaterThan(0)
    }

    const names = skills.map((group) => group.name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('projects', () => {
  it('has the fields every card renders', () => {
    expect(projects.length).toBeGreaterThan(0)

    for (const project of projects) {
      expect(project.id.trim()).not.toBe('')
      expect(project.name.trim()).not.toBe('')
      expect(project.summary.trim()).not.toBe('')
      expect(project.tech.length).toBeGreaterThan(0)
    }
  })

  /** Ids are the React keys; `order` is what `content/index.ts` sorts on. */
  it('has unique ids and comes out in display order', () => {
    const ids = projects.map((project) => project.id)
    expect(new Set(ids).size).toBe(ids.length)

    const orders = projects.map((project) => project.order)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
  })

  /** The join key against a repo's `full_name`, so it has to be `owner/name`. */
  it('uses owner/name repo slugs', () => {
    for (const project of projects) {
      if (project.repoSlug === null) continue
      expect(project.repoSlug).toMatch(/^[\w.-]+\/[\w.-]+$/)
    }
  })
})

describe('photos', () => {
  it('has unique ids and the fields the grid needs', () => {
    expect(photos.length).toBeGreaterThan(0)

    for (const photo of photos) {
      expect(photo.src.startsWith('/')).toBe(true)
      expect(photo.thumbnail.startsWith('/')).toBe(true)
      expect(photo.caption.trim()).not.toBe('')
      expect(photo.album.trim()).not.toBe('')
      expect(photo.width).toBeGreaterThan(0)
      expect(photo.height).toBeGreaterThan(0)
    }

    const ids = photos.map((photo) => photo.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  /**
   * A <picture> will not fall back to its <img> when a source it accepts fails
   * to load, so an AVIF path that does not lead to a real file is a broken photo
   * rather than a slow one. The pipeline writes these in lockstep with the
   * JPEGs; this catches a hand edit that breaks the pair.
   */
  it('pairs every AVIF path with its JPEG', () => {
    for (const photo of photos) {
      for (const [jpeg, avif] of [
        [photo.src, photo.srcAvif],
        [photo.thumbnail, photo.thumbnailAvif],
      ] as const) {
        if (avif === null) continue
        expect(jpeg).toMatch(/\.jpg$/)
        expect(avif).toBe(jpeg.replace(/\.jpg$/, '.avif'))
      }
    }
  })

  it('has parseable dates where a date is given', () => {
    for (const photo of photos) {
      if (photo.date === null) continue
      expect(photo.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isNaN(Date.parse(photo.date))).toBe(false)
    }
  })
})
