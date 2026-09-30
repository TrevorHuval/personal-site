/**
 * The site's content, resolved before the app renders.
 *
 * Every word on this site starts life in one of the JSON files in this folder.
 * They are imported, so TypeScript checks them against `types.ts` — a typo in a
 * key name fails `tsc` instead of rendering a blank panel in production.
 *
 * On top of that sits an optional layer: the studio (`/studio`, see
 * `src/cms`) can save an edited copy of any collection on the server. This
 * module asks for those copies once, before anything renders, and prefers them
 * over the bundled files. Every failure path lands on the bundled copy — the
 * server being down, slow, absent (local dev), or answering with something
 * that is not JSON (nginx's SPA fallback returns index.html for unknown paths).
 * A visitor cannot tell the difference, and the site never depends on the
 * server to work.
 *
 * The annotations below are load-bearing. Without them these would be inferred
 * as their own literal shapes and nothing would ever be validated.
 */

import photosJson from './photos.json'
import profileJson from './profile.json'
import projectsJson from './projects.json'
import resumeJson from './resume.json'
import skillsJson from './skills.json'
import presentationJson from './presentation.json'
import type { Photo, Presentation, Profile, Project, Resume, SkillGroup } from './types'

/** The editable collections, keyed by the names the studio API uses. */
export interface ContentSet {
  photos: Photo[]
  profile: Profile
  resume: Resume
  skills: SkillGroup[]
  projects: Project[]
  presentation: Presentation
}

export type CollectionName = keyof ContentSet

/** What shipped in this build, untouched by any saved edit. */
export const bundled: ContentSet = {
  photos: photosJson,
  profile: profileJson,
  resume: resumeJson,
  skills: skillsJson,
  projects: projectsJson,
  presentation: presentationJson,
}

/** Revision of each collection's saved override; absent means "not overridden". */
export type Revisions = Partial<Record<CollectionName, string>>

const LOAD_TIMEOUT_MS = 2000

async function loadOverrides(): Promise<{ content: Partial<ContentSet>; revisions: Revisions }> {
  const none = { content: {}, revisions: {} }
  // Tests and the build-time plugins run in Node, where there is no server to ask.
  if (typeof window === 'undefined') return none

  try {
    const response = await fetch('/api/cms/content', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(LOAD_TIMEOUT_MS),
    })
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return none

    const body: unknown = await response.json()
    if (typeof body !== 'object' || body === null) return none
    const { content, revisions } = body as { content?: Partial<ContentSet>; revisions?: Revisions }
    // The server validated every collection when it was saved; this only guards
    // against an unexpected top-level shape taking the whole site down.
    const usable: Partial<ContentSet> = {}
    for (const name of ['photos', 'skills', 'projects'] as const) {
      if (Array.isArray(content?.[name])) (usable as Record<string, unknown>)[name] = content[name]
    }
    for (const name of ['profile', 'resume', 'presentation'] as const) {
      const value = content?.[name]
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        (usable as Record<string, unknown>)[name] = value
      }
    }
    return { content: usable, revisions: revisions ?? {} }
  } catch {
    return none
  }
}

const overrides = await loadOverrides()

/** Revisions the studio needs to save without clobbering a newer edit. */
export const revisions: Revisions = overrides.revisions

export const profile: Profile = overrides.content.profile ?? bundled.profile
export const resume: Resume = overrides.content.resume ?? bundled.resume
export const skills: SkillGroup[] = overrides.content.skills ?? bundled.skills
export const photos: Photo[] = overrides.content.photos ?? bundled.photos
export const presentation: Presentation = overrides.content.presentation ?? bundled.presentation

/**
 * Display order is content, not code — `order` in the JSON decides it, the way
 * it did when the API sorted these on the way out. Sorted once here so no page
 * has to remember to.
 */
export const projects: Project[] = [...(overrides.content.projects ?? bundled.projects)].sort(
  (a, b) => a.order - b.order,
)
