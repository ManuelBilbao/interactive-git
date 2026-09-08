import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { LESSONS } from '../src/lessons/index.js'

const messages = JSON.parse(readFileSync(new URL('../src/i18n/locales/es-AR.json', import.meta.url)))

/** Every `hint.*` key the engine can produce, read straight from the source. */
function hintKeysUsedInEngine() {
  const sources = [
    'commands/branching.js',
    'commands/history.js',
    'commands/index.js',
    'commands/remote.js',
    'commands/repoSetup.js',
    'commands/shell.js',
    'commands/staging.js',
    'parser.js',
    'workdir.js',
  ]
  const keys = new Set()
  for (const file of sources) {
    const text = readFileSync(new URL(`../src/engine/${file}`, import.meta.url), 'utf8')
    for (const match of text.matchAll(/'hint\.(\w+)'/g)) keys.add(match[1])
  }
  return keys
}

test('every hint the engine can produce has a translation', () => {
  const missing = [...hintKeysUsedInEngine()].filter((key) => !(key in messages.hint)).sort()
  assert.deepEqual(missing, [])
})

test('no translated hint is left unused', () => {
  const used = hintKeysUsedInEngine()
  const unused = Object.keys(messages.hint)
    .filter((key) => !used.has(key) && !['gitHelp', 'shellHelp'].includes(key))
    .sort()
  assert.deepEqual(unused, [])
})

test('every lesson has title, intro, goal and hints', () => {
  for (const lesson of LESSONS) {
    const text = messages.lessons[lesson.id]
    assert.ok(text, `lesson "${lesson.id}" has no translation`)
    assert.equal(typeof text.title, 'string')
    assert.ok(Array.isArray(text.intro) && text.intro.length > 0)
    assert.equal(typeof text.goal, 'string')
    assert.ok(Array.isArray(text.hints) && text.hints.length > 0)
  }
})

test('no lesson translation is left over', () => {
  const ids = new Set(LESSONS.map((lesson) => lesson.id))
  const extra = Object.keys(messages.lessons).filter((id) => !ids.has(id))
  assert.deepEqual(extra, [])
})
