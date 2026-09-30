#!/usr/bin/env node
/**
 * Prints the value for ADMIN_PASSWORD_HASH. The password is read from a hidden
 * prompt (or STUDIO_PASSWORD for scripting) so it never lands in shell history.
 *
 *   npm run hash-password            hash only
 *   npm run hash-password -- --secret  also generate SESSION_SECRET
 */

import { randomBytes } from 'node:crypto'
import { hashPassword } from '../src/auth.mjs'

const MIN_LENGTH = 16

async function readHidden(prompt) {
  if (!process.stdin.isTTY) throw new Error('No terminal to prompt on. Set STUDIO_PASSWORD instead.')

  process.stdout.write(prompt)
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.setEncoding('utf8')

  return new Promise((resolve, reject) => {
    let value = ''
    const done = () => {
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdin.off('data', onData)
      process.stdout.write('\n')
    }
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          done()
          return resolve(value)
        }
        if (char === '\u0003') {
          done()
          return reject(new Error('Cancelled'))
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1)
        else value += char
      }
    }
    process.stdin.on('data', onData)
  })
}

async function main() {
  let password = process.env.STUDIO_PASSWORD
  if (password === undefined) {
    password = await readHidden('New password: ')
    if (password !== (await readHidden('Repeat it:   '))) throw new Error('Passwords do not match.')
  }
  if (password.length < MIN_LENGTH) throw new Error(`Use at least ${MIN_LENGTH} characters.`)

  // The value has no shell or Compose metacharacters, but quoting is harmless.
  console.log(`\nADMIN_PASSWORD_HASH='${await hashPassword(password)}'`)
  if (process.argv.includes('--secret')) {
    console.log(`SESSION_SECRET='${randomBytes(48).toString('base64url')}'`)
  } else {
    console.log('\nAlso needed once: SESSION_SECRET. Rerun with --secret to generate one.')
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
