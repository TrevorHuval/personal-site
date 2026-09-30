# Studio API

The backend for the owner-only editor at `trevorhuval.com/studio`. Visitors never
see it: the site works without it, and the editor is not linked anywhere (five
quick taps on the footer's copyright line open it).

It does three things: checks one password, stores edited copies of the site's
content, and turns uploaded photos into the same four files the build's photo
pipeline makes (`2000px` and `800px`, JPEG and AVIF, EXIF orientation applied,
metadata such as GPS stripped).

## How edits reach visitors

`src/web/src/content/index.ts` asks `GET /api/cms/content` once, before the app
renders, and prefers any saved collection over the JSON bundled in the build. If
the request fails, times out (2 s) or returns something that is not JSON, the
bundled copy is used. So an edit is live on the next page load with no commit,
CI run or deploy, and an API that is down costs only the edits. (An API that
accepts the connection but never answers would delay first paint by up to the
2 s timeout.)

Uploaded photos are served by this service at `/media/photos/…` with a
year-long immutable cache; each upload gets a fresh random id, so a URL never
changes meaning. Saved JSON and photos live in `DATA_DIR` (the `site-data`
volume). Every replaced or reset collection is copied to
`DATA_DIR/content/history/` (last 30 per collection). That history is JSON only:
photo files that no saved list refers to are deleted an hour after they stop
being referenced, so restoring an old photo list by hand can point at images
that are gone.

## Security model

- **Login**: one password, stored only as a scrypt hash (64 MiB per guess; the
  hash script requires 16+ characters). Five wrong guesses lock a client out for
  15 minutes; IPv6 clients are counted by /64. Attempts are charged before the
  password is checked, inside a queue that holds at most three waiting checks, so
  a burst of parallel guesses cannot slip past the limit and a flood cannot build
  a backlog. There is deliberately **no site-wide lockout**: it would let anyone
  lock the owner out. The cost of that choice is that guessing spread across many
  addresses is limited only by scrypt speed (about 10/s), so the password must be
  a long passphrase. If `ADMIN_PASSWORD_HASH` or `SESSION_SECRET` is missing, the
  studio endpoints answer 404 as if they did not exist.
- **Session**: a signed cookie, 12 hours, `HttpOnly; Secure; SameSite=Strict`,
  scoped to `Path=/api/cms` so the browser does not send it with requests to
  Plannit, Heardit or MusiQL pages. Logging out revokes it, and the revocation is
  saved in `DATA_DIR`, so a restart does not revive it. Changing the password
  invalidates every session.
- **Known limitation: sibling apps share the origin.** The cookie path does not
  stop *script* running on `trevorhuval.com/plannit` (or heardit/musiql) from
  calling `/api/cms/…`: the browser attaches the cookie to any same-origin
  request to that path. An XSS or compromised dependency in one of those apps,
  during a live session, could publish content as you. The real fix is serving
  the studio from its own origin (for example `studio.trevorhuval.com`); sign out
  when you finish editing to shrink the window.
- **Writes** additionally require an `Origin` header from the site's own origin,
  and a content write must carry the revision the editor last saw (`If-Match`),
  so a stale tab cannot overwrite newer work.
- **Validation** mirrors `content/types.ts` and `content.test.ts`: exact
  shapes, `https://` links only, no email addresses, no `TODO`, photo paths
  limited to the two photo folders, uploads must exist before a gallery can
  reference them.
- **Uploads** are decoded only if they are JPEG, PNG, WebP, TIFF, AVIF or HEIC
  (SVG is refused), capped at 60 megapixels and 25 MB, and processed one at a
  time. Metadata, including GPS, is stripped. A photo file is reachable by its
  URL as soon as it is uploaded, before you save; the URL contains 64 random bits,
  so it is unguessable, but do not treat an unsaved draft as confidential.

### HEIC

iPhone photos are HEIC (HEVC video codec). sharp's bundled libheif cannot decode
HEVC, so HEIC files are detected by their bytes and converted with libheif's
`heif-convert` (installed by the Dockerfile with `libde265`) to a PNG that then
takes the normal path. It runs without a shell, on a private temp directory, with
a 30 s timeout and a minimal environment. Where `heif-convert` is not installed
(a plain local `npm run dev`), a HEIC upload answers a clear error instead.
HEVC decoding carries patent-licensing terms in some jurisdictions; for a
personal site that decodes files you took yourself this is normally a non-issue.
- Being unlinked and `noindex` is a convenience. The protection is the password.

## Configuration

| Variable | Purpose |
| --- | --- |
| `ADMIN_PASSWORD_HASH` | From `npm run hash-password`. Required. |
| `SESSION_SECRET` | 32+ random characters. Required. `npm run hash-password -- --secret` prints one. |
| `PUBLIC_ORIGIN` | Site origin allowed to write, default `https://trevorhuval.com` (the `www.` form is added). |
| `DATA_DIR` | Default `/data`. |
| `ALLOWED_ORIGINS` | Extra comma-separated origins, for local development. |
| `INSECURE_COOKIES=1` | Drops `Secure` from the cookie; plain-http local development only. |
| `TRUST_PROXY=0` | Ignore `X-Forwarded-For`. Leave on behind Caddy. |
| `SESSION_HOURS`, `MAX_UPLOAD_MB`, `PORT` | 12, 25, 8080. |

## Local development

```bash
cd src/cms
npm install
STUDIO_PASSWORD='a passphrase of 16+ characters' npm run hash-password -- --secret
```

Put the two printed lines in `src/cms/.env.local` (gitignored) together with:

```text
PORT=8787
DATA_DIR=./.data
INSECURE_COOKIES=1
PUBLIC_ORIGIN=http://localhost:5173
TRUST_PROXY=0
```

Then run `npm run dev` here and `npm run dev` in `src/web`; Vite proxies
`/api/cms` and `/media` to port 8787. Without the API running the site simply
shows its bundled content.

```bash
npm test     # hashing, sessions, limiter, validators, HTTP API, hardening
npm run lint
```

The validators are tested against the real bundled JSON, so a change to
`types.ts` that the validators do not follow fails here.

## When you change a content type

Adding a field to `src/web/src/content/types.ts` means adding it to the matching
validator in `src/schema.mjs`; the schema rejects unknown fields on purpose.
The bundled-content tests fail until both agree.
