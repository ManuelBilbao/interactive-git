import assert from 'node:assert/strict'
import { test } from 'node:test'

import { layoutGraph } from '../src/components/graphLayout.js'
import { run } from '../src/engine/commands/index.js'
import { LESSONS } from '../src/lessons/index.js'

function play(world, lines) {
  return lines.reduce((current, line) => run(current, line).world, world)
}

const lesson = (id) => LESSONS.find((item) => item.id === id)

test('the drawing is big enough for every node and every ref chip', () => {
  const world = play(lesson('mergeDiverged').setup(), ['git merge postres'])
  const layout = layoutGraph(world.repo)

  for (const node of layout.nodes) {
    assert.ok(node.x <= layout.width, `${node.id} sticks out to the right`)
    assert.ok(
      node.y + node.refs.length * 26 <= layout.height,
      `the refs of ${node.id} fall outside the drawing`,
    )
  }
})

test('two ref chips on one commit both fit vertically', () => {
  // A freshly cloned repository stacks `main` and `origin/main` on one commit.
  const world = lesson('push').setup()
  const layout = layoutGraph(world.repo)
  const node = layout.nodes.at(-1)

  assert.equal(node.refs.length, 2)
  assert.ok(node.y + 2 * 26 <= layout.height)
})

test('a merge shows as a commit with two parents and two edges', () => {
  const world = play(lesson('mergeDiverged').setup(), ['git merge postres'])
  const layout = layoutGraph(world.repo)
  const merge = layout.nodes.find((node) => node.isMerge)

  assert.ok(merge, 'no merge commit was drawn')
  assert.equal(layout.edges.filter((edge) => edge.from.x === merge.x && edge.from.y === merge.y).length, 2)
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

/** Bounding box of a commit and the labels hanging off it. */
function boxOf(node) {
  const widest = Math.max(0, ...node.refs.map((ref) => ref.name.length * 7.5 + 16))
  return {
    left: node.x - 17,
    right: node.refs.length > 0 ? node.x + 29 + widest : node.x + 17,
    top: node.y - 17,
    bottom: node.refs.length > 0 ? node.y - 11 + node.refs.length * 26 : node.y + 17,
  }
}

function overlap(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

test('no commit is drawn on top of another commit or its labels', () => {
  const worlds = LESSONS.map((item) => item.setup()).filter((world) => world.repo)
  worlds.push(play(lesson('mergeDiverged').setup(), ['git merge postres']))
  worlds.push(play(lesson('branchAll').setup(), ['git push -u origin postres']))

  for (const world of worlds) {
    const boxes = layoutGraph(world.repo).nodes.map((node) => ({ id: node.id, box: boxOf(node) }))
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        assert.equal(
          overlap(boxes[i].box, boxes[j].box),
          false,
          `${boxes[i].id} and ${boxes[j].id} overlap`,
        )
      }
    }
  }
})
