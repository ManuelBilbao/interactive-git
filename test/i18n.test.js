import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { COURSE_REPO_URL, LESSONS } from '../src/lessons/index.js'

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

test('hints escalate: every lesson has more than one', () => {
  for (const lesson of LESSONS) {
    const hints = messages.lessons[lesson.id].hints
    assert.ok(
      hints.length >= 2,
      `lesson "${lesson.id}" has a single hint, so asking for help hands over the answer at once`,
    )
  }
})

test('the exact command is kept for the last hint, and no earlier', () => {
  for (const lesson of LESSONS) {
    const hints = messages.lessons[lesson.id].hints
    const last = hints.at(-1)
    assert.ok(
      lesson.commands.some((command) => last.includes(command)),
      `the last hint of "${lesson.id}" names none of its commands, so it is not concrete enough`,
    )
  }
})

test('the lesson text never lists the commands as an answer key', () => {
  // The intro teaches a command by name, which is the point; what must not
  // come back is a bare list of them sitting above the hints.
  assert.equal(messages.lesson.commands, undefined)
})

test('lesson prose never writes the repository URL out by hand', () => {
  // It interpolates `{repoUrl}` instead, so the URL in the prose cannot drift
  // from the one the simulated server answers to.
  const prose = JSON.stringify(messages.lessons)
  assert.equal(
    prose.includes('github.com'),
    false,
    'a lesson text has a URL written out; use `{repoUrl}`',
  )
  assert.ok(prose.includes('{repoUrl}'), 'no lesson quotes the repository URL at all')
})

test('the URL the lessons quote is the one the server answers to', () => {
  const clone = LESSONS.find((lesson) => lesson.id === 'clone').setup()
  assert.equal(clone.remoteUrl, COURSE_REPO_URL)
})

test('the last lesson reminds you of the URL', () => {
  // Cloning happened many lessons earlier, so the final challenge repeats it.
  const final = messages.lessons.final
  assert.ok(
    [...final.intro, final.goal].some((text) => text.includes('{repoUrl}')),
    'the final lesson asks for a clone without saying what to clone',
  )
})

test('no lesson translation is left over', () => {
  const ids = new Set(LESSONS.map((lesson) => lesson.id))
  const extra = Object.keys(messages.lessons).filter((id) => !ids.has(id))
  assert.deepEqual(extra, [])
})
