import assert from 'node:assert/strict'
import { test } from 'node:test'

import { run } from '../src/engine/commands/index.js'
import { LESSONS } from '../src/lessons/index.js'

const URL = 'https://github.com/curso/recetas.git'

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
  restore: ['git restore --staged recetas.md', 'git restore recetas.md'],
  branch: ['git branch postres'],
  checkout: ['git checkout postres'],
  checkoutB: [
    'git checkout -b bebidas',
    'echo "Limonada" > bebidas.md',
    'git add bebidas.md',
    'git commit -m "limonada"',
  ],
  merge: ['git merge postres'],
  mergeDiverged: ['git merge postres'],
  clone: [`git clone ${URL}`],
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
    `git clone ${URL}`,
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
