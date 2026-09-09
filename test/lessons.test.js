import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { run } from '../src/engine/commands/index.js'
import { COURSE_REPO_URL, LESSONS } from '../src/lessons/index.js'

const REPO = COURSE_REPO_URL

/** One known-good solution per lesson, in the same order as the course. */
const SOLUTIONS = {
  init: ['git init'],
  status: ['git status'],
  add: ['git add .'],
  commit: ['git commit -m "primer commit"'],
  cycle: [
    'echo "Milanesas" >> recetas.md',
    'git add recetas.md',
    'git status',
    'git commit -m "agrego milanesas"',
  ],
  diff: ['git diff', 'git add recetas.md', 'git diff', 'git diff --staged'],
  restore: ['git restore --staged recetas.md', 'git restore recetas.md'],
  log: ['git log', 'git log --oneline'],
  branch: ['git branch postres'],
  checkout: ['git checkout postres'],
  checkoutB: [
    'git checkout -b bebidas',
    'echo "Limonada" > bebidas.md',
    'git add bebidas.md',
    'git commit -m "limonada"',
  ],
  diffBranches: ['git diff main postres'],
  merge: ['git merge postres'],
  mergeDiverged: ['git merge postres'],
  mergeConflict: [
    'git merge postres',
    // The Files panel is the natural way to do this; the terminal is the one
    // a test can type.
    'echo "# Recetas" > recetas.md',
    'echo "Tortilla de papas" >> recetas.md',
    'echo "Milanesas" >> recetas.md',
    'echo "Flan casero" >> recetas.md',
    'git add recetas.md',
    'git commit -m "junto postres con main"',
  ],
  branchDelete: ['git branch -d postres'],
  clone: [`git clone ${REPO}`, 'cd interactive-git'],
  push: [
    'echo "Milanesas" >> recetas.md',
    'git add recetas.md',
    'git commit -m "agrego milanesas"',
    'git push',
  ],
  pull: ['git pull'],
  pushRejected: ['git pull', 'git push'],
  branchAll: ['git push -u origin postres', 'git branch -a'],
  final: [
    `git clone ${REPO}`,
    'cd interactive-git',
    'git checkout -b bebidas',
    'echo "Limonada" > bebidas.md',
    'git add bebidas.md',
    'git commit -m "agrego bebidas"',
    'git checkout main',
    'git merge bebidas',
    'git push',
  ],
}

test('every lesson has a solution and every solution is a lesson', () => {
  assert.deepEqual(
    LESSONS.map((lesson) => lesson.id).sort(),
    Object.keys(SOLUTIONS).sort(),
  )
})

for (const lesson of LESSONS) {
  test(`lesson "${lesson.id}" can be solved`, () => {
    let world = lesson.setup()
    const history = []
    assert.equal(
      lesson.check(world, history),
      false,
      'the goal must not be satisfied before the student types anything',
    )

    for (const line of SOLUTIONS[lesson.id]) {
      const step = run(world, line)
      assert.equal(
        step.output.error,
        false,
        `"${line}" failed:\n${step.output.lines.join('\n')}`,
      )
      world = step.world
      history.push(line)
    }

    assert.equal(lesson.check(world, history), true, 'the goal was not reached')
  })
}

test('the diff lesson needs the look before the `git add`, not only after', () => {
  // The whole lesson is the contrast between the two, so seeing only the
  // second half of it is not the goal, however many commands were typed.
  const lesson = LESSONS.find((item) => item.id === 'diff')
  const solve = (lines) => {
    let world = lesson.setup()
    const history = []
    for (const line of lines) {
      world = run(world, line).world
      history.push(line)
    }
    return lesson.check(world, history)
  }

  assert.equal(solve(['git add recetas.md', 'git diff', 'git diff --staged']), false)
  assert.equal(solve(SOLUTIONS.diff), true)
})

test('resolving the conflict by dropping one side is not resolving it', () => {
  // Deleting the other branch's line also makes the markers go away, and it is
  // the mistake the lesson is there to catch.
  const lesson = LESSONS.find((item) => item.id === 'mergeConflict')
  let world = lesson.setup()
  const history = []
  for (const line of [
    'git merge postres',
    'echo "# Recetas" > recetas.md',
    'echo "Tortilla de papas" >> recetas.md',
    'echo "Milanesas" >> recetas.md',
    'git add recetas.md',
    'git commit -m "me quedo con lo mio"',
  ]) {
    const step = run(world, line)
    assert.equal(step.output.error, false, `"${line}" failed`)
    world = step.world
    history.push(line)
  }

  const head = world.repo.commits[world.repo.branches.main]
  assert.equal(head.parents.length, 2, 'the merge itself did go through')
  assert.equal(lesson.check(world, history), false, 'but the goal must not count it')
})

test('the push lesson rejects a push that skipped the pull', () => {
  const lesson = LESSONS.find((item) => item.id === 'pushRejected')
  const step = run(lesson.setup(), 'git push')
  assert.equal(step.output.error, true)
  assert.equal(step.output.hintKey, 'hint.pushRejected')
})

test('the course order covers every lesson exactly once', () => {
  const ids = LESSONS.map((lesson) => lesson.id)
  assert.equal(new Set(ids).size, ids.length, 'a lesson appears twice in the order')
  assert.equal(ids.length, Object.keys(SOLUTIONS).length)
})

test('remotes are taught before merging', () => {
  const at = (id) => LESSONS.findIndex((lesson) => lesson.id === id)

  for (const id of ['clone', 'push', 'pull']) {
    assert.ok(at(id) < at('merge'), `${id} should come before merge`)
  }
  // The rejected push is a push and a merge colliding, so it needs both.
  assert.ok(at('pushRejected') > at('mergeDiverged'))
  assert.ok(at('pushRejected') > at('push'))
})

test('no lesson needs a command that a later lesson introduces', () => {
  const introduced = new Map()
  for (const [position, lesson] of LESSONS.entries()) {
    for (const command of lesson.commands) {
      // `git commit -m` introduces `git commit`; compare on the first two words.
      const name = command.split(' ').slice(0, 2).join(' ')
      if (!introduced.has(name)) introduced.set(name, position)
    }
  }

  for (const [position, lesson] of LESSONS.entries()) {
    for (const line of SOLUTIONS[lesson.id]) {
      const name = line.split(' ').slice(0, 2).join(' ')
      if (!name.startsWith('git ')) continue
      const taught = introduced.get(name)
      assert.ok(
        taught !== undefined && taught <= position,
        `lesson "${lesson.id}" uses ${name}, which no earlier lesson introduces`,
      )
    }
  }
})

test('the course table in the docs matches the course', () => {
  // It has drifted every single time the order changed, so it is checked here.
  const doc = readFileSync(new URL('../docs/lessons.md', import.meta.url), 'utf8')
  const rows = [...doc.matchAll(/^\| (\d+) \| `([\w]+)` \|/gm)].map((match) => ({
    number: Number(match[1]),
    id: match[2],
  }))

  assert.deepEqual(
    rows.map((row) => row.id),
    LESSONS.map((lesson) => lesson.id),
    'docs/lessons.md lists the lessons in a different order than the course',
  )
  assert.deepEqual(
    rows.map((row) => row.number),
    LESSONS.map((_lesson, index) => index + 1),
    'the numbers in docs/lessons.md are not 1..n in order',
  )
})
