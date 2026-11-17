# personalSite

Trevor Huval's personal website: an About Me, resume (HTML + PDF download), a
projects showcase, a skills/experience timeline, and a photo gallery.

**Stack:** React 19 + TypeScript + Vite + Tailwind v4, built to static files and
served by nginx in a Docker container on trevorhuval.com. The public site is static.
The only server-side piece is the optional owner-only `/studio` editor, whose API lives in
[`src/cms`](src/cms/README.md) and is deployed as its own service; the site works without it.

The portfolio apps are not part of this repo: MusiQL, Heardit, Plannit and FlightWall
run from their own repos on subdomains (`musiql.`, `heardit.`, `plannit.`, `flightwall.trevorhuval.com`),
and the project cards link to them there. Only the studio stays on the main site, at `/studio`.

Deployment and server operations (including deploys, backups and hardening) are documented in
the private `trevorhuval-infra` repo, not here.

## Layout

```
src/web/                Vite + React + TypeScript + Tailwind
  public/               favicon, og image, resume PDF, photos/
  scripts/              build-time meta plugin + the image/OG authoring scripts
  src/
    content/            every word on the site, as JSON — see its README
    components/
    pages/
    lib/
```

## Prerequisites

[Node.js 22+](https://nodejs.org). That is the whole list.

## Running in development

```bash
npm install --prefix src/web && npm run dev --prefix src/web
```

Open <http://localhost:5173>. Content is imported at build time, so editing a
file in `src/web/src/content/` hot-reloads the page like any other source
change.

## Content

Every piece of copy lives in `src/web/src/content/*.json` — nothing is hardcoded
in a component. The files are imported by `src/content/index.ts` and type-checked
against `src/content/types.ts`, so a renamed key or a missing field fails `tsc`
rather than rendering an empty panel. See
[the content README](src/web/src/content/README.md) for the shapes and
conventions.

The one thing fetched at runtime is repository stats, which the browser reads
straight from `api.github.com` (unauthenticated, cached in `sessionStorage` for
an hour). It has no error state on purpose: a rate-limited visitor sees the
project cards without a stats row, which is the correct outcome.

## Testing

```bash
npm run test --prefix src/web
```

A content lint over the real JSON: no placeholder text, no email address, dates
in the right shape, unique ids, and every AVIF path paired with a real JPEG.
`tsc` covers the shapes; these are the things a type cannot catch.

## Media

Gallery images and the social card are generated, not hand-made. Both scripts
are authoring steps — their output is committed, so a normal build never runs
them.

```bash
npm run photos --prefix src/web   # resize originals, refresh photos.json
npm run og --prefix src/web       # og.png, apple-touch-icon.png, site.webmanifest
```

See [the content README](src/web/src/content/README.md) for what `npm run photos`
takes as input and what it writes.

## Building

```bash
npm run build --prefix src/web    # tsc -b && vite build → src/web/dist
npm run preview --prefix src/web  # serve dist locally
```

Set `SITE_URL` to bake absolute Open Graph URLs and emit a `sitemap.xml` plus a
`Sitemap:` line in `robots.txt`:

```bash
SITE_URL=https://trevorhuval.com npm run build --prefix src/web
```

Without it the build still succeeds — Open Graph paths stay root-relative and no
sitemap is written, which is the honest output for a build that does not know
where it will live.

Set `GA_MEASUREMENT_ID` (a GA4 `G-XXXXXXXXXX` ID, public by design) to inject the
Google Analytics tag. Unset, no tag is emitted. The tag is skipped for Do Not
Track visitors, runs with Google Signals and ad personalization off, and the
`/studio` route is never reported. In CI the ID is set in the image workflow's build args.

Production uses nginx on EC2: its SPA fallback serves `index.html` for routes
such as `/resume`.

## CI and the resume PDF

`.github/workflows/image.yml` runs on every push to `main`: lint, tests and
`npm run check:pdfs` for the site, then publishes multi-arch images to GHCR
(`personal-site` and `personal-site-cms`, the studio API built from `src/cms`).

`src/web/public/trevor_huval_resume.pdf` is the public (contact-free) PDF built
from the separate Resume repo and committed here by a sync from that repo, not
edited by hand. `npm run check:pdfs` fails the build if any PDF in `public/`
contains an email address or phone number.
