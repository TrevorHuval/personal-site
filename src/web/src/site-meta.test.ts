import { describe, expect, it } from 'vitest'
import { jsonForScript } from '../scripts/site-meta'

describe('JSON embedded in a <script> element', () => {
  it('cannot close the element it sits in', () => {
    const out = jsonForScript({ name: '</script><script>alert(1)</script>', note: '<!--' })

    expect(out).not.toContain('<')
    expect(JSON.parse(out)).toEqual({ name: '</script><script>alert(1)</script>', note: '<!--' })
  })

  it('escapes the line separators that end a JavaScript string', () => {
    const out = jsonForScript({ text: 'a\u2028b\u2029c' })

    expect(out).not.toMatch(/[\u2028\u2029]/)
    expect(JSON.parse(out)).toEqual({ text: 'a\u2028b\u2029c' })
  })
})
