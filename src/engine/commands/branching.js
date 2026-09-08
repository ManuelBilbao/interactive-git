// `git branch`, `git checkout` and `git merge`: everything about moving and
// joining lines of work.

import { green, red } from '../../ansi.js'
import { gitError } from '../errors.js'
import {
  ancestors,
  currentBranch,
  headCommitId,
  headTree,
  isAncestor,
  mergeBase,
  resolveRef,
  treeOf,
  writeCommit,
} from '../model.js'
import { computeStatus } from '../status.js'
import { applyTree, assertSafeToSwitch, changedBetween } from '../workdir.js'

export function gitBranch(world, args) {
  const repo = world.repo
  const showAll = args.includes('-a') || args.includes('--all')
  const deleting = args.includes('-d') || args.includes('-D') || args.includes('--delete')
  const names = args.filter((arg) => !arg.startsWith('-'))

  if (deleting) return deleteBranch(world, names[0], args.includes('-D'))

  if (names.length === 0) {
    const lines = Object.keys(repo.branches)
      .sort()
      .map((name) => (name === currentBranch(repo) ? green(`* ${name}`) : `  ${name}`))
    if (showAll) {
      lines.push(
        ...Object.keys(repo.remoteTracking)
          .sort()
          .map((name) => red(`  remotes/${name}`)),
      )
    }
    if (lines.length === 0) return []
    return lines
  }

  const name = names[0]
  if (Object.hasOwn(repo.branches, name)) {
    throw gitError(`fatal: a branch named '${name}' already exists`, 'hint.branchExists', { name })
  }
  const target = headCommitId(repo)
  if (!target) {
    throw gitError(
      `fatal: not a valid object name: '${currentBranch(repo)}'`,
      'hint.branchWithoutCommits',
    )
  }
  repo.branches[name] = target
  return []
}

function deleteBranch(world, name, force) {
  const repo = world.repo
  if (!name) throw gitError('fatal: branch name required', 'hint.branchDeleteNeedsName')
  if (!Object.hasOwn(repo.branches, name)) {
    throw gitError(`error: branch '${name}' not found.`, 'hint.branchNotFound', { name })
  }
  if (currentBranch(repo) === name) {
    throw gitError(
      [
        `error: Cannot delete branch '${name}' checked out at '/${world.folder}'`,
      ].join('\n'),
      'hint.branchDeleteCurrent',
      { name },
    )
  }
  if (!force && !isAncestor(repo, repo.branches[name], headCommitId(repo))) {
    throw gitError(
      [
        `error: The branch '${name}' is not fully merged.`,
        `If you are sure you want to delete it, run 'git branch -D ${name}'.`,
      ].join('\n'),
      'hint.branchNotMerged',
      { name },
    )
  }
  const commitId = repo.branches[name]
  delete repo.branches[name]
  delete repo.upstream[name]
  return [`Deleted branch ${name} (was ${commitId}).`]
}

export function gitCheckout(world, args) {
  const repo = world.repo
  const create = args.includes('-b')
  const targets = args.filter((arg) => !arg.startsWith('-'))
  const target = targets[0]

  if (!target) {
    throw gitError(
      'error: you must specify a branch or commit to checkout',
      'hint.checkoutNeedsTarget',
    )
  }

  if (create) {
    if (Object.hasOwn(repo.branches, target)) {
      throw gitError(
        `fatal: a branch named '${target}' already exists`,
        'hint.branchExists',
        { name: target },
      )
    }
    const head = headCommitId(repo)
    if (!head) {
      throw gitError(
        `fatal: not a valid object name: '${currentBranch(repo)}'`,
        'hint.branchWithoutCommits',
      )
    }
    repo.branches[target] = head
    repo.head = { type: 'branch', name: target }
    return [`Switched to a new branch '${target}'`]
  }

  const commitId = resolveRef(repo, target)
  if (!commitId) {
    throw gitError(
      `error: pathspec '${target}' did not match any file(s) known to git`,
      'hint.checkoutUnknownRef',
      { name: target },
    )
  }

  const targetTree = treeOf(repo, commitId)
  assertSafeToSwitch(world, targetTree, 'checkout')
  applyTree(world, targetTree)

  if (Object.hasOwn(repo.branches, target)) {
    repo.head = { type: 'branch', name: target }
    const upstream = repo.upstream[target]
    const lines = [`Switched to branch '${target}'`]
    if (upstream && repo.remoteTracking[upstream] === repo.branches[target]) {
      lines.push(`Your branch is up to date with '${upstream}'.`)
    }
    return lines
  }

  repo.head = { type: 'detached', commit: commitId }
  return [
    `Note: switching to '${target}'.`,
    '',
    "You are in 'detached HEAD' state. You can look around, make experimental",
    'changes and commit them, and you can discard any commits you make in this',
    'state without impacting any branches by switching back to a branch.',
    '',
    `HEAD is now at ${commitId} ${repo.commits[commitId].message}`,
  ]
}

const CONFLICT_TOP = '<<<<<<< HEAD'
const CONFLICT_MIDDLE = '======='

/** Three-way merge of file trees. Returns the merged tree plus conflicts. */
export function mergeTrees(base, ours, theirs, theirLabel) {
  const names = new Set([
    ...Object.keys(base),
    ...Object.keys(ours),
    ...Object.keys(theirs),
  ])
  const tree = {}
  const conflicts = []

  for (const name of [...names].sort()) {
    const b = base[name]
    const o = ours[name]
    const t = theirs[name]
    let result
    if (o === t) result = o
    else if (o === b) result = t
    else if (t === b) result = o
    else {
      conflicts.push(name)
      result = [
        CONFLICT_TOP,
        o ?? '',
        CONFLICT_MIDDLE,
        t ?? '',
        `>>>>>>> ${theirLabel}`,
      ].join('\n')
    }
    if (result !== undefined) tree[name] = result
  }
  return { tree, conflicts }
}

export function gitMerge(world, args) {
  const repo = world.repo
  const target = args.filter((arg) => !arg.startsWith('-'))[0]

  if (repo.merge) {
    throw gitError(
      [
        'fatal: You have not concluded your merge (MERGE_HEAD exists).',
        'Please, commit your changes before you merge.',
      ].join('\n'),
      'hint.mergeInProgress',
    )
  }
  if (!target) {
    throw gitError(
      ['fatal: No commit specified and merge.defaultToUpstream not set.'].join('\n'),
      'hint.mergeNeedsBranch',
    )
  }

  const theirCommit = resolveRef(repo, target)
  if (!theirCommit) {
    throw gitError(
      `merge: ${target} - not something we can merge`,
      'hint.mergeUnknownBranch',
      { name: target },
    )
  }

  const ourCommit = headCommitId(repo)
  if (!ourCommit) {
    throw gitError(
      'fatal: Non-fast-forward commit does not make sense into an empty head',
      'hint.mergeWithoutCommits',
    )
  }
  if (ourCommit === theirCommit || isAncestor(repo, theirCommit, ourCommit)) {
    return ['Already up to date.']
  }

  const theirTree = treeOf(repo, theirCommit)

  // Fast-forward: our branch has nothing the other one lacks, so the label
  // simply slides forward. No merge commit is created.
  if (isAncestor(repo, ourCommit, theirCommit)) {
    assertSafeToSwitch(world, theirTree, 'merge')
    const changed = changedBetween(headTree(repo), theirTree).length
    applyTree(world, theirTree)
    const branch = currentBranch(repo)
    if (branch) repo.branches[branch] = theirCommit
    else repo.head = { type: 'detached', commit: theirCommit }
    return [
      `Updating ${ourCommit}..${theirCommit}`,
      'Fast-forward',
      ` ${changed} ${changed === 1 ? 'file' : 'files'} changed`,
    ]
  }

  assertSafeToSwitch(world, theirTree, 'merge')

  const base = mergeBase(repo, ourCommit, theirCommit)
  if (!base) {
    throw gitError('fatal: refusing to merge unrelated histories', 'hint.unrelatedHistories')
  }

  const { tree, conflicts } = mergeTrees(
    treeOf(repo, base),
    headTree(repo),
    theirTree,
    target,
  )
  const touched = changedBetween(headTree(repo), tree)
  const lines = touched.map((name) => `Auto-merging ${name}`)

  // Both the working directory and the index receive the merged content;
  // conflicted files carry the markers until the student fixes them.
  for (const name of Object.keys(headTree(repo))) {
    if (!Object.hasOwn(tree, name)) {
      delete world.files[name]
      delete repo.index[name]
    }
  }
  for (const [name, content] of Object.entries(tree)) {
    world.files[name] = content
    repo.index[name] = content
  }

  if (conflicts.length > 0) {
    repo.merge = { from: target, fromCommit: theirCommit, conflicts }
    lines.push(
      ...conflicts.map((name) => `CONFLICT (content): Merge conflict in ${name}`),
      'Automatic merge failed; fix conflicts and then commit the result.',
    )
    return lines
  }

  const message = `Merge branch '${target}'`
  const commitId = writeCommit(world, repo, {
    parents: [ourCommit, theirCommit],
    message,
    tree,
  })
  const branch = currentBranch(repo)
  if (branch) repo.branches[branch] = commitId
  else repo.head = { type: 'detached', commit: commitId }

  lines.push(
    "Merge made by the 'ort' strategy.",
    ` ${touched.length} ${touched.length === 1 ? 'file' : 'files'} changed`,
  )
  return lines
}

export { ancestors, computeStatus }
