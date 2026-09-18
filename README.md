# personalSite

Trevor Huval's personal website: an About Me, resume (HTML + PDF download), a
projects showcase, a skills/experience timeline, and a photo gallery.

**Stack:** React 19 + TypeScript + Vite + Tailwind v4, built to static files and
served by nginx in a Docker container on trevorhuval.com. There is no backend.

See [the deployment guide](DEPLOYMENT.md) for the personal site, Heardit,
Plannit, and MusiQL: release branches, image publishing, EC2 updates, verification,
backups, and rollback. Builds/publishing are automatic; deploying to EC2 is manual.

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

The build also writes `404.html` as a byte-for-byte copy of `index.html` for
compatibility with static hosts. Production uses nginx on EC2: its SPA fallback
serves `index.html` for routes such as `/resume`, rather than relying on GitHub Pages.
