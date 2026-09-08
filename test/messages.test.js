import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, beforeEach, test } from 'node:test'

import { stripAnsi } from '../src/ansi.js'
import { run } from '../src/engine/commands/index.js'
import { setMessages, translateWith } from '../src/engine/messages.js'
import { createWorld } from '../src/engine/model.js'
import { extractMessages } from '../scripts/extract-messages.mjs'

const locale = JSON.parse(readFileSync(new URL('../src/i18n/locales/es-AR.json', import.meta.url)))
const catalogue = locale.git

// The catalogue is process-wide, like git's locale, so every test starts from
// git's own English and the file leaves it that way.
beforeEach(() => setMessages(null))
after(() => setMessages(null))

function play(world, ...lines) {
  return lines.reduce((current, line) => {
    const step = run(current, line)
    assert.equal(step.output.error, false, `"${line}" failed`)
    return step.world
  }, world)
}

const output = (world, line) => run(world, line).output.lines.map(stripAnsi)

test('every message the engine can print has a translation', () => {
  const missing = extractMessages().filter((msgid) => !Object.hasOwn(catalogue, msgid))
  assert.deepEqual(missing, [])
})

test('no translation is left over', () => {
  const used = new Set(extractMessages())
  const stale = Object.keys(catalogue).filter((msgid) => !used.has(msgid))
  assert.deepEqual(stale, [])
})

test('no translation loses a placeholder', () => {
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
  for (const [msgid, translated] of Object.entries(catalogue)) {
    assert.deepEqual(
      placeholders(translated),
      placeholders(msgid),
      `"${msgid}" and its translation do not use the same placeholders`,
    )
  }
})

test('the keywords the course keeps in English are not translated away', () => {
  // The course says commit, stage, push, pull and merge in English on purpose.
  const forbidden = [
    [/\bconfirmaci[óo]n\b/i, 'commit'],
    [/\bempujar\b/i, 'push'],
    [/\bjalar\b/i, 'pull'],
    [/\b[áa]rea de preparaci[óo]n\b/i, 'stage'],
    [/\bfusion(ar|ado|a)\b/i, 'merge'],
  ]
  for (const [pattern, keyword] of Object.entries(catalogue).flatMap(([, text]) =>
    forbidden.filter(([regex]) => regex.test(text)).map(([, word]) => [text, word]),
  )) {
    assert.fail(`"${pattern}" should keep the English keyword "${keyword}"`)
  }
})

test('status speaks Spanish once the catalogue is set', () => {
  const world = play(createWorld(), 'git init', 'echo "hola" > a.txt')

  assert.deepEqual(output(world, 'git status').slice(0, 3), [
    'On branch main',
    '',
    'No commits yet',
  ])

  setMessages(catalogue)
  const spanish = output(world, 'git status')
  assert.deepEqual(spanish.slice(0, 3), ['En la rama main', '', 'Todavía no hay commits'])
  assert.ok(spanish.includes('Archivos sin trackear:'))
  assert.ok(spanish.some((line) => line.includes('no agregaste nada al commit')))
})

test('errors are translated too, and keep carrying their hint', () => {
  setMessages(catalogue)
  const step = run(createWorld(), 'git status')

  assert.equal(step.output.error, true)
  assert.equal(step.output.lines[0], 'fatal: no es un repositorio git (ni ninguno de los directorios superiores): .git')
  assert.equal(step.output.hintKey, 'hint.notARepo')
})

test('file names still line up when the labels get longer', () => {
  setMessages(catalogue)
  const world = play(createWorld(), 'git init', 'echo "hola" > a.txt', 'git add a.txt')
  const [line] = output(world, 'git status').filter((entry) => entry.includes('a.txt'))

  assert.equal(line, '\tarchivo nuevo:   a.txt')
})

test('commit messages stay in English, because they are stored data', () => {
  setMessages(catalogue)
  const world = play(
    createWorld(),
    'git init',
    'echo "base" > a.txt',
    'git add .',
    'git commit -m "base"',
    'git checkout -b otra',
    'echo "otra" > b.txt',
    'git add .',
    'git commit -m "b"',
    'git checkout main',
    'echo "main" > c.txt',
    'git add .',
    'git commit -m "c"',
    'git merge otra',
  )
  const head = world.repo.commits[world.repo.branches.main]
  assert.equal(head.message, "Merge branch 'otra'")
})

test('an untranslated catalogue falls back to English, not to a blank line', () => {
  assert.equal(translateWith({}, 'On branch {branch}', { branch: 'main' }), 'On branch main')
  assert.equal(translateWith(null, 'Fast-forward'), 'Fast-forward')
})
