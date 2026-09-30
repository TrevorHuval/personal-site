# Site content

Every piece of copy on the site lives in this folder. `index.ts` imports all six
files at build time and annotates them with the interfaces in `types.ts`, so a
renamed key or a missing field is a `tsc` error rather than a blank panel on a
live page. Editing a file hot-reloads the app like any other source change.

Two further rules are enforced by `content.test.ts` rather than left to
discipline: no file may contain the string `TODO`, and **no file may contain an
email address**. Trevor's email belongs in the résumé PDF and nowhere else — an
address in the content is an address in the markup, and the markup is what gets
scraped.

| File | Shape | Exported as |
| --- | --- | --- |
| `profile.json` | object | `profile` |
| `resume.json` | object with `experience`, `education` | `resume` |
| `skills.json` | array of groups | `skills` |
| `projects.json` | array of projects | `projects`, sorted by `order` |
| `photos.json` | array of photos | `photos` |
| `presentation.json` | navigation, page headings, home photo selection | `presentation` |

`presentation.home.photoIds` selects the home masthead photos by their IDs in
`photos.json`. Navigation and editorial headings live alongside that selection.
Colors, typography, spacing, radii, and glass surfaces are centralized in
`../index.css`. Dark is the default; the navigation toggle selects the light
token overrides and remembers the preference when browser storage is available.

To change the accent, edit `--olive-light` (dark theme) and `--olive-dark`
(light theme) in `index.css`. Buttons, selected navigation, focus outlines, and
timeline markers follow those tokens. `npm run test` includes contrast checks
against the actual palette, including translucent surfaces over photos.

## Edits made in the studio

The owner-only editor at `/studio` (see [`src/cms`](../../../cms/README.md)) can
save an edited copy of any of these six collections on the server. `index.ts`
loads those copies once before the app renders and prefers them over the JSON
here; if the server is unreachable the JSON in this folder is what visitors see.
The JSON files therefore remain the shipped defaults and the fallback, not
necessarily what is live. The server applies the same shape and content rules as
`types.ts` and `content.test.ts`, so a new field must also be added to
`src/cms/src/schema.mjs`.

## Conventions

- **Dates** are strings, not timestamps: `"2024-06"` for month precision
  (experience, education) and `"2024-06-15"` for photos. The frontend decides
  how to display them. A `null` `endDate` means "present".
- **Fields typed as nullable in `types.ts`** (`description`, `liveUrl`,
  `location`, `notes`, …) can be set to `null` and the UI will drop the
  corresponding element rather than render an empty one. Every other field is
  required.
- **Property names are camelCase** and must match `types.ts`. Adding a field
  means changing the interface too — and `tsc` will tell you so.

## Photos

`src`, `srcAvif`, `thumbnail`, `thumbnailAvif`, `width` and `height` are all
**generated** — do not hand-edit them. The pipeline owns the files, you own the
words (`caption`, `location`, `date`, `album`):

```bash
npm run photos --prefix src/web
```

It reads the originals named in `src/web/scripts/photo-sources.json` (from
`~/Pictures/personalSitePics`, or wherever `PHOTOS_SRC` points), writes a
2000px JPEG and AVIF plus an 800px thumbnail of each into
`src/web/public/photos/`, and updates the six generated fields here to match.
Adding a photo means adding an entry with the words filled in, mapping its id to
a source file in `photo-sources.json`, and running the script. Anything with no
mapping is left alone, so a hand-added photo keeps working.

`width` and `height` are the intrinsic pixel dimensions of the **full-size**
image; the gallery reserves space from them before the image loads, so a wrong
value means layout shift. `npm run photos -- --check` verifies them against
what is actually on disk without re-encoding anything.

The AVIF paths must lead to real files: a `<picture>` does **not** fall back to
its `<img>` when a source it accepts fails to load. Set them to `null` for a
photo the pipeline did not produce, and it will serve the JPEG alone.

## Projects and GitHub

`repoSlug` (`"owner/name"`) is the join key between a curated project here and
the live repository data that `lib/useGitHubRepos.ts` fetches from the browser.
Set it to pull stars, language, and last-pushed date onto the project card;
leave it `null` for projects with no public repo.

`order` decides both the position of a card and the frame number printed on it,
so reordering the projects renumbers them — the numbers are an index, not a
ranking.

The match is case-insensitive, but the slug still has to name a repo the account
in `profile.links.gitHub` actually owns and has made public — the request is
unauthenticated. A slug that matches nothing simply gets no stats row, which is
also what every card shows when GitHub rate-limits the visitor.
