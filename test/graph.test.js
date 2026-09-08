import assert from 'node:assert/strict'
import { test } from 'node:test'

import { layoutGraph } from '../src/components/graphLayout.js'
import { run } from '../src/engine/commands/index.js'
import { LESSONS } from '../src/lessons/index.js'

function play(world, lines) {
  return lines.reduce((current, line) => run(current, line).world, world)
}

const lesson = (id) => LESSONS.find((item) => item.id === id)

/** Every repository the course can put on screen, including mid-merge ones. */
function everyRepo() {
  const worlds = LESSONS.flatMap((item) => {
    const world = item.setup()
    return [world, world.remote && { ...world, repo: world.remote }].filter(Boolean)
  })
  worlds.push(play(lesson('mergeDiverged').setup(), ['git merge postres']))
  worlds.push(play(lesson('branchAll').setup(), ['git push -u origin postres']))
  worlds.push(play(lesson('pushRejected').setup(), ['git pull']))
  worlds.push(play(lesson('branch').setup(), ['git checkout C1']))
  return worlds.filter((world) => world.repo).map((world) => world.repo)
}

function overlaps(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

test('no commit is drawn on top of another commit or its labels', () => {
  for (const repo of everyRepo()) {
    const nodes = layoutGraph(repo).nodes
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        assert.equal(
          overlaps(nodes[i].bounds, nodes[j].bounds),
          false,
          `${nodes[i].id} and ${nodes[j].id} overlap`,
        )
      }
    }
  }
})

test('the drawing is big enough for everything in it', () => {
  for (const repo of everyRepo()) {
    const layout = layoutGraph(repo)
    for (const node of layout.nodes) {
      assert.ok(node.bounds.right <= layout.width, `${node.id} sticks out to the right`)
      assert.ok(node.bounds.bottom <= layout.height, `${node.id} sticks out of the bottom`)
      assert.ok(node.bounds.left >= 0 && node.bounds.top >= 0, `${node.id} starts off-canvas`)
    }
  }
})

test('every commit shows its message', () => {
  const world = lesson('branch').setup()
  const messages = layoutGraph(world.repo).nodes.map((node) => node.message.text)

  assert.deepEqual(messages, ['primeras recetas', 'agrego ñoquis'])
})

test('a long message is cut short but kept whole in the tooltip', () => {
  const world = play(lesson('pushRejected').setup(), ['git pull'])
  const merge = layoutGraph(world.repo).nodes.at(-1)

  assert.ok(merge.message.full.startsWith('Merge branch'))
  assert.ok(merge.message.full.length > merge.message.text.length)
  assert.ok(merge.message.text.endsWith('…'))
  assert.ok(merge.message.full.startsWith(merge.message.text.slice(0, -1).trimEnd()))
})

test('refs stack below the commit without touching each other', () => {
  // A freshly cloned repository puts `main` and `origin/main` on one commit.
  const node = layoutGraph(lesson('push').setup().repo).nodes.at(-1)

  assert.deepEqual(
    node.refs.map((ref) => ref.name),
    ['main', 'origin/main'],
  )
  assert.equal(node.refs[0].x, node.refs[1].x, 'both chips share a left edge')
  assert.ok(node.refs[0].y + 22 <= node.refs[1].y, 'the chips overlap each other')
  assert.ok(node.refs[0].y > node.y, 'the chips should sit below the commit')
})

test('the message sits on the commit line, clear of the chips', () => {
  const node = layoutGraph(lesson('push').setup().repo).nodes.at(-1)

  assert.ok(Math.abs(node.message.y - node.y) < 10, 'the message left the commit line')
  assert.ok(node.message.y < node.refs[0].y, 'the message runs into the chips')
  assert.ok(node.message.x > node.x + 17, 'the message runs into the circle')
})

test('a merge shows as a commit with two parents and two edges', () => {
  const world = play(lesson('mergeDiverged').setup(), ['git merge postres'])
  const layout = layoutGraph(world.repo)
  const merge = layout.nodes.find((node) => node.isMerge)

  assert.ok(merge, 'no merge commit was drawn')
  assert.equal(
    layout.edges.filter((edge) => edge.from.x === merge.x && edge.from.y === merge.y).length,
    2,
  )
})

test('branches get their own column', () => {
  const layout = layoutGraph(lesson('mergeDiverged').setup().repo)
  const columns = new Set(layout.nodes.map((node) => node.x))
  assert.equal(columns.size, 2)
})

test('an empty repository lays out without blowing up', () => {
  const layout = layoutGraph(lesson('status').setup().repo)
  assert.deepEqual(layout.nodes, [])
})

test('a ref chip clears the circle it belongs to', () => {
  for (const repo of everyRepo()) {
    for (const node of layoutGraph(repo).nodes) {
      for (const ref of node.refs) {
        assert.ok(
          ref.y > node.y + 17,
          `the ${ref.name} chip on ${node.id} overlaps the commit circle`,
        )
      }
    }
  }
})
