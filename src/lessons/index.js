// The course: an ordered list of levels.
//
// A lesson is three things:
//   - `setup`, which builds the world the student starts from,
//   - `check`, which decides whether the goal was reached,
//   - `commands`, the commands it introduces.
//
// `commands` is metadata, not something the student sees: listing the answer
// above the hints defeated them. It records what each lesson teaches, which is
// what lets the tests prove no lesson needs a command taught later, and what
// the last hint of each lesson has to name.
//
// All of its text lives in the locale files under `lessons.<id>.*`, so a new
// language never requires touching this file.

import {
  createRepo,
  createWorld,
  currentBranch,
  folderFromUrl,
  headCommitId,
  writeCommit,
} from '../engine/model.js'
import { computeStatus, isClean } from '../engine/status.js'

/**
 * The real repository this site is built from, so the URL they type is one
 * they can actually open rather than a placeholder.
 *
 * Exported because the lesson texts quote it: they interpolate `{repoUrl}`
 * instead of writing it out, so the URL in the prose cannot drift from the one
 * the simulated server will answer to.
 */
export const COURSE_REPO_URL = 'https://github.com/ManuelBilbao/interactive-git.git'

/** Adds a commit to a repository and moves the branch that points at it. */
function seed(world, repo, branch, message, tree) {
  const parents = repo.branches[branch] ? [repo.branches[branch]] : []
  const id = writeCommit(world, repo, { parents, message, tree })
  repo.branches[branch] = id
  return id
}

/** A local repository with `main` checked out and the given commits applied. */
function localRepo(world, commits) {
  const repo = createRepo({ head: { type: 'branch', name: 'main' } })
  world.repo = repo
  for (const [message, tree] of commits) seed(world, repo, 'main', message, tree)
  const tree = commits.length > 0 ? commits.at(-1)[1] : {}
  repo.index = { ...tree }
  world.files = { ...tree }
  return repo
}

/** A world whose server already holds a repository, ready to be cloned. */
function remoteRepo(world, commits) {
  const repo = createRepo({ head: { type: 'branch', name: 'main' } })
  world.remote = repo
  world.remoteUrl = COURSE_REPO_URL
  for (const [message, tree] of commits) seed(world, repo, 'main', message, tree)
  return repo
}

/** True when the student ran a command matching `pattern`. */
function ran(history, pattern) {
  return history.some((line) => pattern.test(line))
}

const RECIPE = '# Recetas\n\nTortilla de papas'
const RECIPE_V2 = '# Recetas\n\nTortilla de papas\nÑoquis del 29'

const DEFINITIONS = [
  {
    id: 'init',
    commands: ['git init'],
    setup: () => createWorld({ files: { 'recetas.md': RECIPE } }),
    check: (world) => world.repo !== null,
  },
  {
    id: 'status',
    commands: ['git status'],
    setup: () => {
      const world = createWorld({ files: { 'recetas.md': RECIPE } })
      localRepo(world, [])
      world.files = { 'recetas.md': RECIPE }
      return world
    },
    check: (_world, history) => ran(history, /^git\s+status\s*$/),
  },
  {
    id: 'add',
    commands: ['git add'],
    setup: () => {
      const world = createWorld()
      localRepo(world, [])
      world.files = { 'recetas.md': RECIPE, 'compras.md': 'papas\nhuevos' }
      return world
    },
    check: (world) => {
      const status = computeStatus(world)
      return status.untracked.length === 0 && status.staged.length === 2
    },
  },
  {
    id: 'commit',
    commands: ['git commit -m'],
    setup: () => {
      const world = createWorld()
      const repo = localRepo(world, [])
      world.files = { 'recetas.md': RECIPE, 'compras.md': 'papas\nhuevos' }
      repo.index = { ...world.files }
      return world
    },
    check: (world) => headCommitId(world.repo) !== null && isClean(world),
  },
  {
    id: 'cycle',
    commands: ['git status', 'git add', 'git commit -m'],
    setup: () => {
      const world = createWorld()
      localRepo(world, [['primeras recetas', { 'recetas.md': RECIPE }]])
      return world
    },
    check: (world, history) =>
      Object.keys(world.repo.commits).length >= 2 &&
      isClean(world) &&
      ran(history, /^git\s+status\s*$/),
  },
  {
    id: 'diff',
    commands: ['git diff', 'git diff --staged'],
    setup: () => {
      const world = createWorld()
      localRepo(world, [['primeras recetas', { 'recetas.md': RECIPE }]])
      // A change already made and not staged, so there is something to look at.
      world.files = { 'recetas.md': `${RECIPE}\nMilanesas` }
      return world
    },
    // The point of the lesson is what `git diff` says *after* `git add`, so the
    // order matters here: look, stage, look again, then ask for the stage.
    check: (_world, history) => {
      const added = history.findIndex((line) => /^git\s+add\b/.test(line))
      if (added === -1) return false
      const bare = /^git\s+diff\s*$/
      const looked = (first) =>
        history.some(
          (line, position) => (first ? position < added : position > added) && bare.test(line),
        )
      return looked(true) && looked(false) && ran(history, /^git\s+diff\s+--(staged|cached)\s*$/)
    },
  },
  {
    id: 'restore',
    commands: ['git restore', 'git restore --staged'],
    setup: () => {
      const world = createWorld()
      const repo = localRepo(world, [['primeras recetas', { 'recetas.md': RECIPE }]])
      // The student arrives with a change already staged and another one not.
      repo.index = { 'recetas.md': `${RECIPE}\nAsado (sin receta todavía)` }
      world.files = { 'recetas.md': `${RECIPE}\nAsado (sin receta todavía)\nfsdklfjsd` }
      return world
    },
    check: (world, history) =>
      isClean(world) &&
      Object.keys(world.repo.commits).length === 1 &&
      ran(history, /^git\s+restore\b/),
  },
  {
    id: 'log',
    commands: ['git log', 'git log --oneline'],
    setup: () => {
      const world = createWorld()
      localRepo(world, [
        ['primeras recetas', { 'recetas.md': RECIPE }],
        ['agrego ñoquis', { 'recetas.md': RECIPE_V2 }],
        ['lista de compras', { 'recetas.md': RECIPE_V2, 'compras.md': 'papas\nhuevos' }],
      ])
      return world
    },
    check: (_world, history) =>
      ran(history, /^git\s+log\s*$/) && ran(history, /^git\s+log\s+--oneline\s*$/),
  },
  {
    id: 'branch',
    commands: ['git branch'],
    setup: () => {
      const world = createWorld()
      localRepo(world, [
        ['primeras recetas', { 'recetas.md': RECIPE }],
        ['agrego ñoquis', { 'recetas.md': RECIPE_V2 }],
      ])
      return world
    },
    check: (world) =>
      Object.hasOwn(world.repo.branches, 'postres') && currentBranch(world.repo) === 'main',
  },
  {
    id: 'checkout',
    commands: ['git checkout'],
    setup: () => {
      const world = createWorld()
      const repo = localRepo(world, [['primeras recetas', { 'recetas.md': RECIPE }]])
      repo.branches.postres = repo.branches.main
      seed(world, repo, 'postres', 'flan', {
        'recetas.md': RECIPE,
        'postres.md': 'Flan casero',
      })
      return world
    },
    check: (world) => currentBranch(world.repo) === 'postres',
  },
  {
    id: 'checkoutB',
    commands: ['git checkout -b'],
    setup: () => {
      const world = createWorld()
      localRepo(world, [['primeras recetas', { 'recetas.md': RECIPE }]])
      return world
    },
    check: (world) => {
      const repo = world.repo
      return (
        currentBranch(repo) === 'bebidas' &&
        repo.branches.bebidas !== undefined &&
        repo.branches.bebidas !== repo.branches.main
      )
    },
  },
  {
    id: 'diffBranches',
    commands: ['git diff'],
    setup: () => {
      const world = createWorld()
      const repo = localRepo(world, [['primeras recetas', { 'recetas.md': RECIPE }]])
      repo.branches.postres = repo.branches.main
      seed(world, repo, 'postres', 'flan', {
        'recetas.md': RECIPE_V2,
        'postres.md': 'Flan casero',
      })
      return world
    },
    check: (_world, history) => ran(history, /^git\s+diff\s+main\s+postres\s*$/),
  },
  {
    id: 'merge',
    commands: ['git merge'],
    setup: () => {
      const world = createWorld()
      const repo = localRepo(world, [['primeras recetas', { 'recetas.md': RECIPE }]])
      repo.branches.postres = repo.branches.main
      seed(world, repo, 'postres', 'flan', {
        'recetas.md': RECIPE,
        'postres.md': 'Flan casero',
      })
      return world
    },
    check: (world) =>
      world.repo.branches.main === world.repo.branches.postres &&
      currentBranch(world.repo) === 'main',
  },
  {
    id: 'mergeDiverged',
    commands: ['git merge'],
    setup: () => {
      const world = createWorld()
      const repo = localRepo(world, [['primeras recetas', { 'recetas.md': RECIPE }]])
      repo.branches.postres = repo.branches.main
      seed(world, repo, 'postres', 'flan', {
        'recetas.md': RECIPE,
        'postres.md': 'Flan casero',
      })
      seed(world, repo, 'main', 'lista de compras', {
        'recetas.md': RECIPE,
        'compras.md': 'papas\nhuevos',
      })
      world.files = { ...repo.commits[repo.branches.main].tree }
      repo.index = { ...world.files }
      return world
    },
    check: (world) => {
      const head = world.repo.commits[headCommitId(world.repo)]
      return Boolean(head) && head.parents.length === 2
    },
  },
  {
    id: 'branchDelete',
    commands: ['git branch -d'],
    setup: () => {
      const world = createWorld()
      const repo = localRepo(world, [['primeras recetas', { 'recetas.md': RECIPE }]])

      // `postres` was merged into main: main was fast-forwarded onto it, so
      // its commit is already part of the main history and the label is spare.
      repo.branches.postres = repo.branches.main
      seed(world, repo, 'postres', 'flan', {
        'recetas.md': RECIPE,
        'postres.md': 'Flan casero',
      })
      repo.branches.main = repo.branches.postres
      world.files = { ...repo.commits[repo.branches.main].tree }
      repo.index = { ...world.files }

      // `experimento` has a commit nothing else has, so git will refuse to
      // delete it — which is the other half of the lesson.
      repo.branches.experimento = repo.branches.main
      seed(world, repo, 'experimento', 'probando algo', {
        ...world.files,
        'experimento.md': 'a medio hacer',
      })
      return world
    },
    check: (world) => !Object.hasOwn(world.repo.branches, 'postres'),
  },
  {
    id: 'clone',
    commands: ['git clone'],
    setup: () => {
      // Standing in a folder where projects go, not inside one.
      const world = createWorld({ folder: 'proyectos' })
      remoteRepo(world, [
        ['primeras recetas', { 'recetas.md': RECIPE }],
        ['agrego ñoquis', { 'recetas.md': RECIPE_V2 }],
      ])
      return world
    },
    check: (world) => world.repo !== null && Object.hasOwn(world.files, 'recetas.md'),
  },
  {
    id: 'push',
    commands: ['git push'],
    setup: () => {
      const world = createWorld()
      const remote = remoteRepo(world, [['primeras recetas', { 'recetas.md': RECIPE }]])
      cloneInto(world, remote)
      return world
    },
    check: (world) =>
      Object.keys(world.remote.commits).length > 1 &&
      world.remote.branches.main === world.repo.branches.main,
  },
  {
    id: 'pull',
    commands: ['git pull'],
    setup: () => {
      const world = createWorld()
      const remote = remoteRepo(world, [['primeras recetas', { 'recetas.md': RECIPE }]])
      cloneInto(world, remote)
      // A teammate pushed while the student was away.
      seed(world, remote, 'main', 'agrego ñoquis', { 'recetas.md': RECIPE_V2 })
      return world
    },
    check: (world) =>
      world.repo.branches.main === world.remote.branches.main &&
      world.files['recetas.md'] === RECIPE_V2,
  },
  {
    id: 'pushRejected',
    commands: ['git pull', 'git push'],
    setup: () => {
      const world = createWorld()
      const remote = remoteRepo(world, [['primeras recetas', { 'recetas.md': RECIPE }]])
      cloneInto(world, remote)
      seed(world, remote, 'main', 'agrego ñoquis', { 'recetas.md': RECIPE_V2 })
      // ...and the student already committed something of their own.
      const repo = world.repo
      seed(world, repo, 'main', 'lista de compras', {
        'recetas.md': RECIPE,
        'compras.md': 'papas\nhuevos',
      })
      world.files = { ...repo.commits[repo.branches.main].tree }
      repo.index = { ...world.files }
      return world
    },
    check: (world) => world.remote.branches.main === world.repo.branches.main,
  },
  {
    id: 'branchAll',
    commands: ['git push -u', 'git branch -a'],
    setup: () => {
      const world = createWorld()
      const remote = remoteRepo(world, [['primeras recetas', { 'recetas.md': RECIPE }]])
      cloneInto(world, remote)
      const repo = world.repo
      repo.branches.postres = repo.branches.main
      seed(world, repo, 'postres', 'flan', {
        'recetas.md': RECIPE,
        'postres.md': 'Flan casero',
      })
      return world
    },
    check: (world, history) =>
      Object.hasOwn(world.remote.branches, 'postres') && ran(history, /^git\s+branch\s+-a\s*$/),
  },
  {
    id: 'final',
    commands: ['git clone', 'git checkout -b', 'git add', 'git commit -m', 'git merge', 'git push'],
    setup: () => {
      const world = createWorld({ folder: 'proyectos' })
      remoteRepo(world, [['primeras recetas', { 'recetas.md': RECIPE }]])
      return world
    },
    check: (world) => {
      const repo = world.repo
      if (!repo || !world.remote) return false
      const head = repo.branches.main
      const bebidas = repo.branches.bebidas
      return (
        Boolean(bebidas) &&
        Object.hasOwn(world.files, 'bebidas.md') &&
        currentBranch(repo) === 'main' &&
        world.remote.branches.main === head &&
        Object.keys(repo.commits).length >= 2 &&
        isClean(world)
      )
    },
  },
]

/**
 * Reproduces `git clone` followed by `cd`, for the lessons that start with the
 * student already working inside the clone.
 */
function cloneInto(world, remote) {
  const repo = createRepo({ head: { type: 'branch', name: 'main' } })
  repo.commits = structuredClone(remote.commits)
  repo.branches.main = remote.branches.main
  for (const [name, id] of Object.entries(remote.branches)) {
    repo.remoteTracking[`origin/${name}`] = id
  }
  repo.upstream.main = 'origin/main'
  const tree = repo.commits[repo.branches.main].tree
  repo.index = { ...tree }
  world.files = { ...tree }
  world.repo = repo
  world.folder = folderFromUrl(COURSE_REPO_URL)
  return repo
}

/**
 * The order the course runs in. Reordering the course means editing this list
 * and nothing else; the lessons themselves do not care where they sit.
 *
 * Remotes come before merging on purpose. `git pull` on an untouched branch is
 * only a fast-forward, so clone/push/pull can be taught without merges — and
 * once merging is understood, the rejected push at the end lands as what it
 * really is: a push and a merge colliding.
 */
const ORDER = [
  // A repository of your own
  'init',
  'status',
  'add',
  'commit',
  'cycle',
  'diff',
  'restore',
  'log',
  // Branches
  'branch',
  'checkout',
  'checkoutB',
  // The server
  'clone',
  'push',
  'pull',
  // Joining work back together
  'diffBranches',
  'merge',
  'mergeDiverged',
  'branchDelete',
  // Both at once
  'pushRejected',
  'branchAll',
  'final',
]

export const LESSONS = ORDER.map((id) => {
  const lesson = DEFINITIONS.find((definition) => definition.id === id)
  if (!lesson) throw new Error(`ORDER names a lesson that does not exist: ${id}`)
  return lesson
})

export const LESSON_IDS = LESSONS.map((lesson) => lesson.id)

export function lessonAt(index) {
  return LESSONS[Math.min(Math.max(index, 0), LESSONS.length - 1)]
}
