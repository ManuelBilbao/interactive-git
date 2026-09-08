// Lists every string the engine passes to `msg()`, the way gettext's `xgettext`
// scans source for `_()`. Used by the tests to prove the catalogue is complete,
// and runnable on its own when adding a language:
//
//   node scripts/extract-messages.mjs
//
// prints the msgids, one per line, in the order they appear.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ENGINE = new URL('../src/engine', import.meta.url).pathname

// `msg('...')` or `msg("...")`, allowing escaped quotes inside.
const CALL = /\bmsg\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g

function sources(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) return sources(path)
    return path.endsWith('.js') ? [path] : []
  })
}

/**
 * Drops comment lines, so that a `msg('...')` written inside a comment is not
 * mistaken for a real one. Every comment in the engine sits on its own line.
 */
function withoutComments(text) {
  return text
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart()
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*')
    })
    .join('\n')
}

/** Turns a JS string literal body back into the string it denotes. */
function unescape(raw) {
  return raw.replace(/\\(.)/g, (match, char) => (char === 'n' ? '\n' : char))
}

export function extractMessages() {
  const found = []
  for (const path of sources(ENGINE).sort()) {
    const text = withoutComments(readFileSync(path, 'utf8'))
    for (const match of text.matchAll(CALL)) {
      const raw = match[1] ?? match[2]
      const msgid = unescape(raw)
      if (!found.includes(msgid)) found.push(msgid)
    }
  }
  return found
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  for (const msgid of extractMessages()) console.log(msgid)
}
