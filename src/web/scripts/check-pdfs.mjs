#!/usr/bin/env node
/**
 * Fails if any PDF in `public/` contains an email address or a phone number.
 *
 * The site's content files are linted for this already, but a PDF is a binary
 * the content lint cannot see into — and a résumé is exactly the kind of file
 * that arrives with a contact block at the top. One did: a version carrying a
 * personal email and phone number reached a public repository, and taking it
 * out meant rewriting published history.
 *
 * Text in a PDF is usually inside a Flate-compressed stream, so scanning the
 * raw bytes proves almost nothing. This inflates every stream first, then scans
 * the decompressed text along with the raw file and its metadata.
 *
 *   npm run check:pdfs
 */

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.resolve(scriptDir, '..', 'public')

/* Deliberately generic. The point is to catch *a* contact detail, not to write
   Trevor's own details into a file in a public repository.

   The phone pattern requires punctuation — `(555) 555-0123` or `555-555-0123`,
   not three space-separated runs of digits. A PDF content stream is full of
   space-separated numbers (positions, kerning, font metrics) and a looser
   pattern matches page coordinates on every well-formed file. */
const PATTERNS = [
  { article: 'an', name: 'email address', re: /[\w.+-]+@[\w-]+\.[a-z]{2,}/i },
  { article: 'a', name: 'phone number', re: /\(\d{3}\)\s?\d{3}[-.]\d{4}|\b\d{3}[-.]\d{3}[-.]\d{4}\b/ },
]

/** Every Flate stream in the file, inflated. Anything that will not inflate is
 * an image or a font and is skipped. */
function inflateStreams(buffer) {
  const chunks = []
  let index = 0

  while ((index = buffer.indexOf('stream', index)) !== -1) {
    let start = index + 'stream'.length
    if (buffer[start] === 0x0d) start++
    if (buffer[start] === 0x0a) start++

    const end = buffer.indexOf('endstream', start)
    if (end === -1) break

    try {
      chunks.push(inflateSync(buffer.subarray(start, end)).toString('latin1'))
    } catch {
      // Not Flate, or not a stream we can read. Images and fonts land here.
    }

    index = end + 'endstream'.length
  }

  return chunks
}

const ESCAPES = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }

/**
 * Undo the escaping inside a PDF string literal.
 *
 * The octal form matters more than it looks: TeX writes the parentheses of a
 * phone number as `\050` and `\051`, so a decoder that only understands `\(`
 * and `\)` leaves `(555) 555-0123` looking like `\050555\051555-0123` and no
 * phone pattern will ever match it.
 */
function unescapePdfString(raw) {
  return raw.replace(/\\(\d{1,3}|.)/gs, (_, code) =>
    /^\d+$/.test(code)
      ? String.fromCharCode(parseInt(code, 8))
      : (ESCAPES[code] ?? code),
  )
}

/**
 * The visible words, pulled out of a content stream's string literals.
 *
 * Everything outside `(...)` in a stream is operators and numbers, which is
 * what produced false positives when this scanned raw stream text. Joining the
 * literals with nothing also repairs the split a kerned line leaves behind —
 * `[(T) -30 (revor)] TJ` becomes `Trevor` — so a detail broken across several
 * literals is still found.
 */
function visibleText(stream) {
  let text = ''

  for (const match of stream.matchAll(/\((?:\\.|[^\\)])*\)/gs)) {
    text += unescapePdfString(match[0].slice(1, -1))
  }

  return text
}

const files = (await readdir(publicDir)).filter((name) => name.toLowerCase().endsWith('.pdf'))
const failures = []

for (const name of files) {
  const buffer = await readFile(path.join(publicDir, name))
  const streams = inflateStreams(buffer)

  // The raw bytes catch metadata and any uncompressed text; the extracted
  // strings catch the words actually printed on the page.
  const haystacks = [buffer.toString('latin1'), ...streams.map(visibleText)]

  const hits = PATTERNS.filter(({ re }) => haystacks.some((text) => re.test(text))).map(
    ({ article, name: what }) => `${article} ${what}`,
  )

  if (hits.length > 0) {
    failures.push(`${name} contains ${hits.join(' and ')}`)
  }

  console.log(`  ${hits.length > 0 ? '✗' : '✓'} ${name}`)
}

if (files.length === 0) {
  console.log('  no PDFs in public/ — nothing to check')
}

if (failures.length > 0) {
  console.error(`\n${failures.join('\n')}`)
  console.error('\nPublishing this would put personal contact details in a public repository.')
  process.exit(1)
}
