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
    'git status --staged',
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
