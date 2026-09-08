import assert from 'node:assert/strict'
import { test } from 'node:test'

import { green, paint, parseAnsi, stripAnsi } from '../src/ansi.js'
import { run } from '../src/engine/commands/index.js'
import { createWorld } from '../src/engine/model.js'

function play(world, ...lines) {
  return lines.reduce((current, line) => {
    const step = run(current, line)
    assert.equal(step.output.error, false, `"${line}" failed`)
    return step.world
  }, world)
}

const output = (world, line) => run(world, line).output.lines

test('painted text survives a round trip through the parser', () => {
  const line = `${green('verde')} normal ${paint('HEAD', 'bold', 'cyan')}`
  assert.deepEqual(parseAnsi(line), [
    { text: 'verde', color: 'green', bold: false },
    { text: ' normal ', color: null, bold: false },
    { text: 'HEAD', color: 'cyan', bold: true },
  ])
  assert.equal(stripAnsi(line), 'verde normal HEAD')
})

test('a line without colour is a single plain segment', () => {
  assert.deepEqual(parseAnsi('On branch main'), [
    { text: 'On branch main', color: null, bold: false },
  ])
})

test('status paints staged files green and everything else red', () => {
  // c.txt is committed first, because a commit freezes the whole index.
  const world = play(
    createWorld(),
    'git init',
    'echo "y" > c.txt',
    'git add c.txt',
    'git commit -m "c"',
    'echo "hola" > a.txt',
    'git add a.txt',
    'echo "x" > b.txt',
    'echo "z" > c.txt',
  )
  const lines = output(world, 'git status')
  const colourOf = (name) => {
    const line = lines.find((entry) => stripAnsi(entry).includes(name))
    assert.ok(line, `${name} is missing from the status output`)
    return parseAnsi(line)[0].color
  }

  assert.equal(colourOf('a.txt'), 'green', 'a staged file should be green')
  assert.equal(colourOf('b.txt'), 'red', 'an untracked file should be red')
  assert.equal(colourOf('c.txt'), 'red', 'an unstaged change should be red')
})

test('section headers stay uncoloured, as in real git', () => {
  const world = play(createWorld(), 'git init', 'touch a.txt', 'git add a.txt')
  const header = output(world, 'git status').find((line) => line.includes('Changes to be committed'))
  assert.equal(parseAnsi(header)[0].color, null)
})

test('branch paints the current branch green and the server ones red', () => {
  const world = play(createWorld(), 'git init', 'touch a.txt', 'git add .', 'git commit -m "a"', 'git branch otra')
  const lines = output(world, 'git branch')

  assert.deepEqual(lines.map(stripAnsi), ['* main', '  otra'])
  assert.equal(parseAnsi(lines[0])[0].color, 'green')
  assert.equal(parseAnsi(lines[1])[0].color, null)
})

test('log paints the commit id yellow and HEAD cyan', () => {
  const world = play(createWorld(), 'git init', 'touch a.txt', 'git add .', 'git commit -m "a"')
  const [line] = output(world, 'git log --oneline')
  const segments = parseAnsi(line)

  assert.equal(stripAnsi(line), 'C1 (HEAD -> main) a')
  assert.equal(segments[0].color, 'yellow')
  assert.ok(segments.some((segment) => segment.text === 'HEAD' && segment.color === 'cyan'))
  assert.ok(segments.some((segment) => segment.text === 'main' && segment.color === 'green'))
})
