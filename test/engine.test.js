import assert from 'node:assert/strict'
import { test } from 'node:test'

import { stripAnsi } from '../src/ansi.js'
import { run } from '../src/engine/commands/index.js'
import { createRepo, createWorld, headCommitId, writeCommit } from '../src/engine/model.js'
import { computeStatus } from '../src/engine/status.js'

/** Runs a script of commands, asserting that none of them fails. */
function play(world, ...lines) {
  let current = world
  for (const line of lines) {
    const step = run(current, line)
    assert.equal(step.output.error, false, `"${line}" failed: ${step.output.lines.join('\n')}`)
    current = step.world
  }
  return current
}

function fails(world, line) {
  const step = run(world, line)
  assert.equal(step.output.error, true, `"${line}" should have failed`)
  return step.output
}

test('git commands need a repository first', () => {
  const output = fails(createWorld(), 'git status')
  assert.match(output.lines[0], /not a git repository/)
  assert.equal(output.hintKey, 'hint.notARepo')
})

test('init, add and commit build the first commit', () => {
  let world = createWorld()
  world = play(world, 'git init', 'echo "hola" > README.md', 'git add README.md', 'git commit -m "primer commit"')
  const head = headCommitId(world.repo)
  assert.equal(head, 'C1')
  assert.equal(world.repo.branches.main, 'C1')
  assert.deepEqual(world.repo.commits.C1.tree, { 'README.md': 'hola' })
  assert.equal(computeStatus(world).staged.length, 0)
})

test('status reports untracked, staged and modified files', () => {
  let world = play(createWorld(), 'git init', 'touch a.txt')
  assert.deepEqual(computeStatus(world).untracked, ['a.txt'])

  world = play(world, 'git add a.txt')
  assert.deepEqual(computeStatus(world).staged, [{ name: 'a.txt', change: 'added' }])

  world = play(world, 'git commit -m "a"', 'echo "cambio" > a.txt')
  assert.deepEqual(computeStatus(world).notStaged, [{ name: 'a.txt', change: 'modified' }])

  const staged = run(world, 'git status --staged').output.lines.join('\n')
  assert.match(staged, /No changes staged for commit/)
})

test('restore unstages and discards changes', () => {
  let world = play(
    createWorld(),
    'git init',
    'echo "uno" > a.txt',
    'git add a.txt',
    'git commit -m "uno"',
    'echo "dos" > a.txt',
    'git add a.txt',
  )
  assert.equal(computeStatus(world).staged.length, 1)

  world = play(world, 'git restore --staged a.txt')
  assert.equal(computeStatus(world).staged.length, 0)
  assert.equal(computeStatus(world).notStaged.length, 1)

  world = play(world, 'git restore a.txt')
  assert.equal(world.files['a.txt'], 'uno')
  assert.equal(computeStatus(world).notStaged.length, 0)
})

test('committing with nothing staged explains itself', () => {
  const world = play(createWorld(), 'git init', 'touch a.txt')
  const output = fails(world, 'git commit -m "vacio"')
  assert.equal(output.hintKey, 'hint.commitNothingStaged')
})

test('checkout -b creates a branch and switches to it', () => {
  const world = play(
    createWorld(),
    'git init',
    'touch a.txt',
    'git add .',
    'git commit -m "uno"',
    'git checkout -b feature',
  )
  assert.equal(world.repo.head.name, 'feature')
  assert.deepEqual(Object.keys(world.repo.branches).sort(), ['feature', 'main'])
})

test('checkout restores the files of the target branch', () => {
  let world = play(
    createWorld(),
    'git init',
    'echo "base" > a.txt',
    'git add .',
    'git commit -m "base"',
    'git checkout -b feature',
    'echo "feature" > a.txt',
    'git add .',
    'git commit -m "feature"',
  )
  assert.equal(world.files['a.txt'], 'feature')
  world = play(world, 'git checkout main')
  assert.equal(world.files['a.txt'], 'base')
})

test('checkout refuses to throw away uncommitted work', () => {
  const world = play(
    createWorld(),
    'git init',
    'echo "base" > a.txt',
    'git add .',
    'git commit -m "base"',
    'git checkout -b feature',
    'echo "feature" > a.txt',
    'git add .',
    'git commit -m "feature"',
    'echo "sin guardar" > a.txt',
  )
  const output = fails(world, 'git checkout main')
  assert.equal(output.hintKey, 'hint.dirtyTree')
})

test('merge fast-forwards when the branch only moved ahead', () => {
  const world = play(
    createWorld(),
    'git init',
    'echo "base" > a.txt',
    'git add .',
    'git commit -m "base"',
    'git checkout -b feature',
    'echo "mas" > b.txt',
    'git add .',
    'git commit -m "b"',
    'git checkout main',
    'git merge feature',
  )
  assert.equal(world.repo.branches.main, world.repo.branches.feature)
  assert.ok(world.files['b.txt'] !== undefined)
})

test('merge creates a merge commit when both branches moved', () => {
  const world = play(
    createWorld(),
    'git init',
    'echo "base" > a.txt',
    'git add .',
    'git commit -m "base"',
    'git checkout -b feature',
    'echo "feature" > b.txt',
    'git add .',
    'git commit -m "b"',
    'git checkout main',
    'echo "main" > c.txt',
    'git add .',
    'git commit -m "c"',
    'git merge feature',
  )
  const head = world.repo.commits[headCommitId(world.repo)]
  assert.equal(head.parents.length, 2)
  assert.deepEqual(Object.keys(head.tree).sort(), ['a.txt', 'b.txt', 'c.txt'])
})

test('a conflict is reported and resolved by add + commit', () => {
  let world = play(
    createWorld(),
    'git init',
    'echo "base" > a.txt',
    'git add .',
    'git commit -m "base"',
    'git checkout -b feature',
    'echo "feature" > a.txt',
    'git add .',
    'git commit -m "f"',
    'git checkout main',
    'echo "main" > a.txt',
    'git add .',
    'git commit -m "m"',
  )
  const merge = run(world, 'git merge feature')
  world = merge.world
  assert.match(merge.output.lines.join('\n'), /CONFLICT/)
  assert.deepEqual(world.repo.merge.conflicts, ['a.txt'])
  assert.match(world.files['a.txt'], /<<<<<<< HEAD/)

  assert.equal(fails(world, 'git commit -m "x"').hintKey, 'hint.commitWithConflicts')

  world = play(world, 'echo "resuelto" > a.txt', 'git add a.txt', 'git commit -m "merge"')
  assert.equal(world.repo.merge, null)
  assert.equal(world.repo.commits[headCommitId(world.repo)].parents.length, 2)
})

/** A world whose server already holds one commit, as if a teammate created it. */
function worldWithRemote() {
  const world = createWorld({ remoteUrl: 'https://github.com/curso/proyecto.git' })
  const remote = createRepo({ head: { type: 'branch', name: 'main' } })
  const id = writeCommit(world, remote, {
    parents: [],
    message: 'commit inicial',
    tree: { 'README.md': 'proyecto del curso' },
  })
  remote.branches.main = id
  world.remote = remote
  return world
}

test('clone brings the server history down', () => {
  const world = play(worldWithRemote(), 'git clone https://github.com/curso/proyecto.git')
  assert.equal(world.files['README.md'], 'proyecto del curso')
  assert.equal(world.repo.branches.main, 'C1')
  assert.equal(world.repo.remoteTracking['origin/main'], 'C1')
  assert.equal(world.repo.upstream.main, 'origin/main')
})

test('clone rejects an unknown url', () => {
  assert.equal(fails(worldWithRemote(), 'git clone https://otro.git').hintKey, 'hint.cloneUnknownUrl')
})

test('push moves the branch on the server', () => {
  const world = play(
    worldWithRemote(),
    'git clone https://github.com/curso/proyecto.git',
    'echo "nota" > notas.txt',
    'git add .',
    'git commit -m "notas"',
    'git push',
  )
  assert.equal(world.remote.branches.main, world.repo.branches.main)
  assert.equal(world.repo.remoteTracking['origin/main'], world.repo.branches.main)
})

test('push is rejected when the server moved ahead', () => {
  let world = play(worldWithRemote(), 'git clone https://github.com/curso/proyecto.git')
  const serverCommit = writeCommit(world, world.remote, {
    parents: [world.remote.branches.main],
    message: 'trabajo de otra persona',
    tree: { 'README.md': 'proyecto del curso', 'otro.txt': 'x' },
  })
  world.remote.branches.main = serverCommit
  world = play(world, 'echo "nota" > notas.txt', 'git add .', 'git commit -m "notas"')
  assert.equal(fails(world, 'git push').hintKey, 'hint.pushRejected')
})

test('pull brings the server commits and merges them', () => {
  let world = play(worldWithRemote(), 'git clone https://github.com/curso/proyecto.git')
  const serverCommit = writeCommit(world, world.remote, {
    parents: [world.remote.branches.main],
    message: 'trabajo de otra persona',
    tree: { 'README.md': 'proyecto del curso', 'otro.txt': 'x' },
  })
  world.remote.branches.main = serverCommit
  world = play(world, 'git pull')
  assert.equal(world.repo.branches.main, serverCommit)
  assert.equal(world.files['otro.txt'], 'x')
})

test('branch -a lists remote-tracking branches', () => {
  const world = play(worldWithRemote(), 'git clone https://github.com/curso/proyecto.git')
  const listed = run(world, 'git branch -a').output.lines.map(stripAnsi)
  assert.deepEqual(listed, ['* main', '  remotes/origin/main'])
})

test('an unknown subcommand suggests the closest one', () => {
  const output = fails(play(createWorld(), 'git init'), 'git comit -m "x"')
  assert.equal(output.hintKey, 'hint.unknownGitCommandDidYouMean')
  assert.equal(output.hintParams.suggestion, 'commit')
})

test('a failed command leaves the world untouched', () => {
  const world = play(createWorld(), 'git init', 'touch a.txt')
  const step = run(world, 'git add inexistente.txt')
  assert.equal(step.output.error, true)
  assert.equal(step.world, world)
})
