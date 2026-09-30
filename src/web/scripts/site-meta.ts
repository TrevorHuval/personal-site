import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

/**
 * Builds the parts of the site a crawler sees before React runs.
 *
 * `index.html` is the one file no component owns, which makes it the natural
 * place for someone to paste a name and a description and let them rot. So it
 * carries placeholders instead, and this plugin fills them from
 * `src/content/profile.json` — the same file the rendered page imports, so the
 * tab title, the link preview and the hero cannot disagree.
 *
 * The absolute site URL is not content, it is deployment: it comes from the
 * `SITE_URL` environment variable. Without it, Open Graph paths stay
 * root-relative and no sitemap is emitted, which is the honest output for a
 * build that does not yet know where it will live.
 */

/** Structurally the same as `src/content/types.ts`, declared separately because
 * this runs in the Vite config's Node context, not the app's. */
interface Profile {
  name: string
  headline: string
  location: string
  bio: string[]
  links: { gitHub: string; linkedIn: string }
}

interface Resume {
  experience: { title: string; endDate: string | null }[]
}

/** Pages a crawler should know about, mirroring the routes in `App.tsx`. */
const ROUTES = ['/', '/resume', '/projects', '/photos'] as const

export function siteMeta(options: { dataDir: string; publicDir: string }): Plugin {
  let siteUrl = ''
  let measurementId = ''

  return {
    name: 'site-meta',

    configResolved() {
      siteUrl = (process.env.SITE_URL ?? '').replace(/\/+$/, '')
      measurementId = (process.env.GA_MEASUREMENT_ID ?? '').trim()

      if (measurementId !== '' && !/^G-[A-Z0-9]{6,12}$/.test(measurementId)) {
        throw new Error(`GA_MEASUREMENT_ID must look like G-XXXXXXXXXX, got "${measurementId}"`)
      }
    },

    transformIndexHtml(html) {
      const profile = readJson<Profile>(options.dataDir, 'profile.json')
      const resume = readJson<Resume>(options.dataDir, 'resume.json')
      const description = describe(profile)

      return html
        .replace(
          '</head>',
          `  <script type="application/ld+json">${personSchema(profile, resume, description, siteUrl)}</script>${analyticsTag(measurementId)}\n  </head>`,
        )
        .replace(/%SITE_([A-Z_]+)%/g, (match, key: string) => {
          switch (key) {
            case 'NAME':
              return escapeHtml(profile.name)
            case 'DESCRIPTION':
              return escapeHtml(description)
            case 'URL':
              // A relative og:url says nothing, so it collapses to the site
              // root until a real origin is known.
              return siteUrl || '/'
            case 'IMAGE':
              return `${siteUrl}/og.png`
            default:
              return match
          }
        })
    },

    generateBundle() {
      if (measurementId !== '') {
        this.emitFile({ type: 'asset', fileName: GA_INIT_FILE, source: analyticsInit(measurementId) })
      }

      if (siteUrl === '') return

      const today = new Date().toISOString().slice(0, 10)
      const urls = ROUTES.map(
        (route) =>
          `  <url>\n    <loc>${siteUrl}${route}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`,
      ).join('\n')

      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      })

      // public/robots.txt is copied verbatim; this overwrites it with a copy
      // that can point at the sitemap it now knows the address of.
      const robots = readFileSync(path.join(options.publicDir, 'robots.txt'), 'utf8').trimEnd()
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `${robots}\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
      })
    },
  }
}

/**
 * A `Person` graph, so a search engine can tie the name to the two profiles
 * that prove it is the same person. `sameAs` is the whole point of the block;
 * a placeholder URL in there would be worse than no block at all, so anything
 * still unfilled is dropped.
 */
function personSchema(
  profile: Profile,
  resume: Resume,
  description: string,
  siteUrl: string,
): string {
  const sameAs = [profile.links.gitHub, profile.links.linkedIn].filter(
    (link) => link.startsWith('http'),
  )

  // `jobTitle` wants a job title, not a sentence — the headline is prose and
  // reads as nonsense in a knowledge panel. The current role is the real
  // answer, and the résumé already knows it.
  const jobTitle = real(resume.experience.find((role) => role.endDate === null)?.title ?? '')

  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: profile.name,
    description,
    ...(jobTitle === null ? {} : { jobTitle }),
    ...(real(profile.location) === null ? {} : { address: profile.location }),
    ...(sameAs.length === 0 ? {} : { sameAs }),
    ...(siteUrl === '' ? {} : { url: siteUrl, image: `${siteUrl}/og.png` }),
  })
}

/**
 * Google Analytics 4 (the free tier), or nothing. The tag loads `ga-init.js`
 * (emitted at build) rather than inlining, because production serves a strict CSP.
 *
 * The measurement ID is public by design — it ships in every visitor's page
 * source — so it is deployment config like `SITE_URL`, not a secret. Without
 * `GA_MEASUREMENT_ID` (local dev, tests) no tag is emitted at all.
 *
 * The privacy posture lives here rather than in a cookie banner:
 * - a visitor sending Do Not Track never loads `gtag.js`;
 * - Google Signals and ad personalization are off, so this is measurement only;
 * - `send_page_view` is off because the SPA reports its own page views from
 *   `lib/analytics.ts` once the route's title is set (and skips `/studio`).
 */
const GA_INIT_FILE = 'ga-init.js'

/** The page tag: a same-origin script, so the site's CSP needs no `unsafe-inline`. */
function analyticsTag(id: string): string {
  return id === '' ? '' : `
  <script src="/${GA_INIT_FILE}"></script>`
}

/** The body of `ga-init.js`. */
function analyticsInit(id: string): string {
  return `window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
if (navigator.doNotTrack !== '1' && window.doNotTrack !== '1') {
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=${id}';
  document.head.appendChild(s);
  gtag('js', new Date());
  gtag('config', '${id}', {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  });
  window.gaEnabled = true;
}
`
}

/** Placeholder content must never reach a crawler. */
function real(value: string): string | null {
  return value !== '' && !value.startsWith('TODO:') ? value : null
}

function readJson<T>(dataDir: string, fileName: string): T {
  return JSON.parse(readFileSync(path.join(dataDir, fileName), 'utf8')) as T
}

/**
 * The meta description a search result shows. The headline is the one-liner
 * written for exactly this job; the bio's opening sentence is the fallback, and
 * unfilled placeholder content is skipped rather than published.
 */
function describe(profile: Profile): string {
  const chosen = [profile.headline, profile.bio[0] ?? ''].map(real).find((v) => v !== null)

  if (chosen === undefined || chosen === null) {
    return `${profile.name} — resume, projects and photography.`
  }

  return chosen.length <= 160 ? chosen : `${chosen.slice(0, 157).trimEnd()}…`
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  )
}
