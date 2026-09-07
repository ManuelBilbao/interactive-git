// Core data model for the simulated git world.
//
// A "world" holds everything the student can see: the files in the folder, the
// local repository (once `git init` or `git clone` created it) and the
// simulated server-side repository we call `origin`.
//
// Every structure here is a plain JSON-serialisable object so that a whole
// world can be copied with `structuredClone` before a command mutates it.

export const DEFAULT_BRANCH = 'main'
export const REMOTE_NAME = 'origin'

export function createWorld(overrides = {}) {
  return {
    nextId: 1, // commits are named C1, C2, C3... like on the graph
    folder: 'proyecto', // name of the folder the student is standing in
    files: {}, // working directory: { filename: content }
    repo: null, // local repository
    remote: null, // repository living on the "server"
    remoteUrl: null,
    ...overrides,
  }
}

export function createRepo(overrides = {}) {
  return {
    commits: {}, // id -> { id, parents, message, tree }
    branches: {}, // branch name -> commit id
    head: null, // { type: 'branch', name } | { type: 'detached', commit }
    index: {}, // staging area: a full snapshot { filename: content }
    remoteTracking: {}, // 'origin/main' -> commit id
    upstream: {}, // 'main' -> 'origin/main'
    merge: null, // { from, fromCommit, conflicts: [filename] } while merging
    ...overrides,
  }
}

export function nextCommitId(world) {
  const id = `C${world.nextId}`
  world.nextId += 1
  return id
}

/** Creates a commit object and stores it in the repo. Does not move any ref. */
export function writeCommit(world, repo, { parents, message, tree }) {
  const id = nextCommitId(world)
  repo.commits[id] = {
    id,
    parents: [...parents],
    message,
    tree: { ...tree },
  }
  return id
}

export function headCommitId(repo) {
  if (!repo || !repo.head) return null
  if (repo.head.type === 'detached') return repo.head.commit
  return repo.branches[repo.head.name] ?? null
}

export function currentBranch(repo) {
  return repo && repo.head && repo.head.type === 'branch' ? repo.head.name : null
}

export function treeOf(repo, commitId) {
  if (!commitId) return {}
  const commit = repo.commits[commitId]
  return commit ? { ...commit.tree } : {}
}

export function headTree(repo) {
  return treeOf(repo, headCommitId(repo))
}

/**
 * Resolves a user-typed reference: a branch, a remote-tracking branch
 * (`origin/main`) or a raw commit id (`C2`). Returns null when unknown.
 */
export function resolveRef(repo, ref) {
  if (!ref) return null
  if (ref === 'HEAD') return headCommitId(repo)
  if (Object.hasOwn(repo.branches, ref)) return repo.branches[ref]
  if (Object.hasOwn(repo.remoteTracking, ref)) return repo.remoteTracking[ref]
  if (Object.hasOwn(repo.commits, ref)) return ref
  return null
}

/** Every commit reachable from `commitId`, including itself. */
export function ancestors(repo, commitId) {
  const seen = new Set()
  const stack = commitId ? [commitId] : []
  while (stack.length > 0) {
    const id = stack.pop()
    if (!id || seen.has(id)) continue
    seen.add(id)
    const commit = repo.commits[id]
    if (commit) stack.push(...commit.parents)
  }
  return seen
}

export function isAncestor(repo, maybeAncestor, commitId) {
  if (!maybeAncestor) return true // the empty history is an ancestor of anything
  return ancestors(repo, commitId).has(maybeAncestor)
}

/** Distance from the root, used to place commits on the graph. */
export function generation(repo, commitId, cache = new Map()) {
  if (!commitId) return -1
  if (cache.has(commitId)) return cache.get(commitId)
  const commit = repo.commits[commitId]
  if (!commit || commit.parents.length === 0) {
    cache.set(commitId, 0)
    return 0
  }
  // Placeholder guards against cycles, which a well-formed history never has.
  cache.set(commitId, 0)
  const value = Math.max(...commit.parents.map((p) => generation(repo, p, cache))) + 1
  cache.set(commitId, value)
  return value
}

/** Best common ancestor of two commits, or null when histories are unrelated. */
export function mergeBase(repo, a, b) {
  if (!a || !b) return null
  const fromA = ancestors(repo, a)
  const common = [...ancestors(repo, b)].filter((id) => fromA.has(id))
  if (common.length === 0) return null
  const cache = new Map()
  return common.reduce((best, id) =>
    generation(repo, id, cache) > generation(repo, best, cache) ? id : best,
  )
}

/** Commits in a stable order: oldest first, following the C1, C2... numbering. */
export function commitsInOrder(repo) {
  return Object.values(repo.commits).sort(
    (a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)),
  )
}

/** History of a commit, newest first, as `git log` shows it. */
export function logFrom(repo, commitId) {
  const reachable = ancestors(repo, commitId)
  return commitsInOrder(repo)
    .filter((commit) => reachable.has(commit.id))
    .reverse()
}

export function copyCommits(fromRepo, toRepo, commitId) {
  for (const id of ancestors(fromRepo, commitId)) {
    if (!toRepo.commits[id]) {
      toRepo.commits[id] = structuredClone(fromRepo.commits[id])
    }
  }
}
