// Turns a repository into coordinates for the commit graph.
//
// Rows come from how far a commit is from the root, so history always reads
// top (oldest) to bottom (newest). Columns come from branches: each branch
// claims the commits only it can reach, which is what makes a merge look like
// two lines joining back together.
//
// Each commit carries two labels. The message sits on the commit's own line,
// right after the circle, which is the order `git log --oneline` prints them
// in. The refs pointing at it go on the line below, tucked under the circle.
//
// That split is also the narrowest arrangement: the message and the chips each
// take a line of their own instead of competing for one, and the chips stack
// rather than sitting side by side, because `main` and `origin/main` together
// are wider than the rail. Only two commits in the whole course carry two
// refs, so stacking costs almost no height. Rows and columns are sized from
// that content rather than being a fixed grid, because otherwise a label
// lands on its neighbour.

import { commitsInOrder, currentBranch, generation } from '../engine/model.js'

export const NODE_RADIUS = 17
export const CHIP_HEIGHT = 22

const MIN_COLUMN_WIDTH = 72
const MIN_ROW_HEIGHT = 62
const PADDING = 18
const CHIP_OFFSET = NODE_RADIUS + 12
const MESSAGE_BASELINE = 4
const CHIP_TOP = 12
const CHIP_STEP = CHIP_HEIGHT + 4
// 18 characters shows every message the course writes in full except the two
// `Merge branch ...` ones, which git generates and which the tooltip carries.
const MESSAGE_MAX_CHARS = 18

// Rough advance widths. They only have to be close enough to reserve space.
const CHIP_CHAR_WIDTH = 7
const MESSAGE_CHAR_WIDTH = 5.95

// The gaps leave room for the radius of the node in the next row or column,
// so a label can never touch the circle beside or below it.
const COLUMN_GAP = NODE_RADIUS + 18
const ROW_GAP = NODE_RADIUS + 10

/** Width of a ref chip, kept here so the layout and the view agree on it. */
export function chipWidth(name) {
  return name.length * CHIP_CHAR_WIDTH + 16
}

/** Commit messages are shown in full in the tooltip, so here they can be cut. */
function shorten(message) {
  if (message.length <= MESSAGE_MAX_CHARS) return message
  return `${message.slice(0, MESSAGE_MAX_CHARS - 1).trimEnd()}…`
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

/** How far a commit's labels reach to the right of it, and below it. */
function extent(refs, messageWidth) {
  const widest = Math.max(0, ...refs.map((ref) => chipWidth(ref.name)))
  return {
    right: Math.max(
      NODE_RADIUS,
      CHIP_OFFSET + messageWidth,
      // Chips start under the circle's left edge, so only the part that runs
      // past the node counts towards the column width.
      widest - NODE_RADIUS,
    ),
    down:
      refs.length > 0
        ? CHIP_TOP + refs.length * CHIP_STEP - (CHIP_STEP - CHIP_HEIGHT) + 3
        : NODE_RADIUS,
  }
}

/** Turns per-cell sizes into cumulative offsets. */
function offsets(sizes, minimum, gap) {
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
  const messages = new Map(commits.map((commit) => [commit.id, shorten(commit.message)]))
  const messageWidth = (commitId) => messages.get(commitId).length * MESSAGE_CHAR_WIDTH

  const laneCount = Math.max(...lanes.values()) + 1
  const rowCount = Math.max(...rows.values()) + 1
  const laneExtents = Array.from({ length: laneCount }, () => 0)
  const rowExtents = Array.from({ length: rowCount }, () => 0)
  for (const commit of commits) {
    const { right, down } = extent(refs.get(commit.id), messageWidth(commit.id))
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

  const nodes = commits.map((commit) => {
    const { x, y } = position(commit.id)
    // Chips stack downwards on the lines below the commit.
    const placed = refs.get(commit.id).map((ref, position) => ({
      ...ref,
      x: x - NODE_RADIUS,
      y: y + CHIP_TOP + position * CHIP_STEP,
      width: chipWidth(ref.name),
    }))
    const reach = extent(refs.get(commit.id), messageWidth(commit.id))

    return {
      id: commit.id,
      message: {
        text: messages.get(commit.id),
        full: commit.message,
        x: x + CHIP_OFFSET,
        y: y + MESSAGE_BASELINE,
      },
      isMerge: commit.parents.length > 1,
      refs: placed,
      x,
      y,
      bounds: {
        left: x - NODE_RADIUS,
        right: x + reach.right,
        top: y - NODE_RADIUS,
        bottom: y + reach.down,
      },
    }
  })

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

  return {
    nodes,
    edges,
    width: Math.max(...nodes.map((node) => node.bounds.right)) + PADDING,
    height: Math.max(...nodes.map((node) => node.bounds.bottom)) + PADDING,
  }
}
