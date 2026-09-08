// Turns a repository into coordinates for the commit graph.
//
// Rows come from how far a commit is from the root, so history always reads
// top (oldest) to bottom (newest). Columns come from branches: each branch
// claims the commits only it can reach, which is what makes a merge look like
// two lines joining back together.
//
// Rows and columns are sized from their contents rather than being a fixed
// grid, because the `main` / `origin/main` labels hang off each commit and
// would otherwise sit on top of the neighbouring one.

import { commitsInOrder, currentBranch, generation } from '../engine/model.js'

export const NODE_RADIUS = 17
const MIN_COLUMN_WIDTH = 72
const MIN_ROW_HEIGHT = 62
const PADDING = 22
const CHIP_HEIGHT = 22
const CHIP_GAP = 4
// The gaps leave room for the radius of the node in the next row or column,
// so a label can never touch the circle beside or below it.
const COLUMN_GAP = NODE_RADIUS + 18
const ROW_GAP = NODE_RADIUS + 10
export const CHIP_STEP = CHIP_HEIGHT + CHIP_GAP
const CHIP_OFFSET = NODE_RADIUS + 12

/** Width of a ref chip, kept here so the layout and the view agree on it. */
export function chipWidth(name) {
  return name.length * 7.5 + 16
}

/** Branches in a stable order, with `main` first so it keeps the left column. */
function branchOrder(repo) {
  const names = Object.keys(repo.branches).sort()
  return names.sort((a, b) => (a === 'main' ? -1 : b === 'main' ? 1 : 0))
}

function assignLanes(repo) {
  const lanes = new Map()
  let nextLane = 0

  const claim = (startId) => {
    const chain = []
    let id = startId
    while (id && !lanes.has(id)) {
      chain.push(id)
      id = repo.commits[id]?.parents[0]
    }
    if (chain.length === 0) return
    for (const commitId of chain) lanes.set(commitId, nextLane)
    nextLane += 1
  }

  for (const name of branchOrder(repo)) claim(repo.branches[name])
  // Commits reachable only through a merge's second parent, or through a
  // remote-tracking branch, still need a column of their own.
  for (const commitId of Object.values(repo.remoteTracking)) claim(commitId)
  for (const commit of commitsInOrder(repo)) claim(commit.id)

  return lanes
}

/** The labels attached to a commit: branches, `origin/*` and `HEAD`. */
function refsFor(repo, commitId) {
  const refs = []
  const head = currentBranch(repo)
  for (const name of branchOrder(repo)) {
    if (repo.branches[name] === commitId) {
      refs.push({ name, kind: name === head ? 'head' : 'branch' })
    }
  }
  for (const name of Object.keys(repo.remoteTracking).sort()) {
    if (repo.remoteTracking[name] === commitId) refs.push({ name, kind: 'remote' })
  }
  if (repo.head?.type === 'detached' && repo.head.commit === commitId) {
    refs.unshift({ name: 'HEAD', kind: 'head' })
  }
  return refs
}

/** How far the labels of a commit reach to the right and downwards. */
function extent(refs) {
  if (refs.length === 0) return { right: NODE_RADIUS, down: NODE_RADIUS }
  return {
    right: CHIP_OFFSET + Math.max(...refs.map((ref) => chipWidth(ref.name))),
    down: refs.length * CHIP_STEP - CHIP_GAP - CHIP_HEIGHT / 2,
  }
}

/** Turns per-cell sizes into cumulative offsets. */
function offsets(sizes, minimum, gap = 0) {
  const positions = [PADDING]
  for (let i = 1; i < sizes.length; i += 1) {
    positions.push(positions[i - 1] + Math.max(minimum, sizes[i - 1] + gap))
  }
  return positions
}

export function layoutGraph(repo) {
  if (!repo) return null
  const commits = commitsInOrder(repo)
  if (commits.length === 0) return { nodes: [], edges: [], width: 0, height: 0 }

  const lanes = assignLanes(repo)
  const cache = new Map()
  const rows = new Map(commits.map((commit) => [commit.id, generation(repo, commit.id, cache)]))
  const refs = new Map(commits.map((commit) => [commit.id, refsFor(repo, commit.id)]))

  const laneCount = Math.max(...lanes.values()) + 1
  const rowCount = Math.max(...rows.values()) + 1
  const laneExtents = Array.from({ length: laneCount }, () => 0)
  const rowExtents = Array.from({ length: rowCount }, () => 0)
  for (const commit of commits) {
    const { right, down } = extent(refs.get(commit.id))
    const lane = lanes.get(commit.id)
    const row = rows.get(commit.id)
    laneExtents[lane] = Math.max(laneExtents[lane], right)
    rowExtents[row] = Math.max(rowExtents[row], down)
  }

  const laneX = offsets(laneExtents, MIN_COLUMN_WIDTH, COLUMN_GAP)
  const rowY = offsets(rowExtents, MIN_ROW_HEIGHT, ROW_GAP)

  const position = (commitId) => ({
    x: laneX[lanes.get(commitId)],
    y: rowY[rows.get(commitId)],
  })

  const nodes = commits.map((commit) => ({
    id: commit.id,
    message: commit.message,
    isMerge: commit.parents.length > 1,
    refs: refs.get(commit.id),
    ...position(commit.id),
  }))

  const edges = []
  for (const commit of commits) {
    for (const parent of commit.parents) {
      if (!repo.commits[parent]) continue
      edges.push({
        key: `${commit.id}-${parent}`,
        from: position(commit.id),
        to: position(parent),
      })
    }
  }

  let right = 0
  let bottom = 0
  for (const node of nodes) {
    const reach = extent(node.refs)
    right = Math.max(right, node.x + reach.right)
    bottom = Math.max(bottom, node.y + reach.down)
  }

  return { nodes, edges, width: right + PADDING, height: bottom + PADDING }
}
