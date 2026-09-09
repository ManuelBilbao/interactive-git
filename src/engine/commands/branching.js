// `git branch`, `git checkout` and `git merge`: everything about moving and
// joining lines of work.

import { green, red } from '../../ansi.js'
import { gitError } from '../errors.js'
import { threeWayMerge } from '../merge.js'
import { msg } from '../messages.js'
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

/** " 2 files changed", in whichever language and plural form fits. */
function changedLine(count) {
  return count === 1
    ? ` ${msg('{count} file changed', { count })}`
    : ` ${msg('{count} files changed', { count })}`
}

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
    throw gitError(
      msg("fatal: a branch named '{name}' already exists", { name }),
      'hint.branchExists',
      { name },
    )
  }
  const target = headCommitId(repo)
  if (!target) {
    throw gitError(
      msg("fatal: not a valid object name: '{name}'", { name: currentBranch(repo) }),
      'hint.branchWithoutCommits',
    )
  }
  repo.branches[name] = target
  return []
}

function deleteBranch(world, name, force) {
  const repo = world.repo
  if (!name) throw gitError(msg('fatal: branch name required'), 'hint.branchDeleteNeedsName')
  if (!Object.hasOwn(repo.branches, name)) {
    throw gitError(msg("error: branch '{name}' not found.", { name }), 'hint.branchNotFound', {
      name,
    })
  }
  if (currentBranch(repo) === name) {
    throw gitError(
      msg("error: Cannot delete branch '{name}' checked out at '/{folder}'", {
        name,
        folder: world.folder,
      }),
      'hint.branchDeleteCurrent',
      { name },
    )
  }
  if (!force && !isAncestor(repo, repo.branches[name], headCommitId(repo))) {
    throw gitError(
      [
        msg("error: The branch '{name}' is not fully merged.", { name }),
        msg("If you are sure you want to delete it, run 'git branch -D {name}'.", { name }),
      ].join('\n'),
      'hint.branchNotMerged',
      { name },
    )
  }
  const commitId = repo.branches[name]
  delete repo.branches[name]
  delete repo.upstream[name]
  return [msg('Deleted branch {name} (was {commit}).', { name, commit: commitId })]
}

export function gitCheckout(world, args) {
  const repo = world.repo
  const create = args.includes('-b')
  const targets = args.filter((arg) => !arg.startsWith('-'))
  const target = targets[0]

  if (!target) {
    throw gitError(
      msg('error: you must specify a branch or commit to checkout'),
      'hint.checkoutNeedsTarget',
    )
  }

  if (create) {
    if (Object.hasOwn(repo.branches, target)) {
      throw gitError(
        msg("fatal: a branch named '{name}' already exists", { name: target }),
        'hint.branchExists',
        { name: target },
      )
    }
    const head = headCommitId(repo)
    if (!head) {
      throw gitError(
        msg("fatal: not a valid object name: '{name}'", { name: currentBranch(repo) }),
        'hint.branchWithoutCommits',
      )
    }
    repo.branches[target] = head
    repo.head = { type: 'branch', name: target }
    return [msg("Switched to a new branch '{name}'", { name: target })]
  }

  const commitId = resolveRef(repo, target)
  if (!commitId) {
    throw gitError(
      msg("error: pathspec '{name}' did not match any file(s) known to git", { name: target }),
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
    const lines = [msg("Switched to branch '{name}'", { name: target })]
    if (upstream && repo.remoteTracking[upstream] === repo.branches[target]) {
      lines.push(msg("Your branch is up to date with '{upstream}'.", { upstream }))
    }
    return lines
  }

  repo.head = { type: 'detached', commit: commitId }
  return [
    msg("Note: switching to '{name}'.", { name: target }),
    '',
    msg("You are in 'detached HEAD' state. You can look around, make experimental"),
    msg('changes and commit them, and you can discard any commits you make in this'),
    msg('state without impacting any branches by switching back to a branch.'),
    '',
    msg('HEAD is now at {commit} {message}', {
      commit: commitId,
      message: repo.commits[commitId].message,
    }),
  ]
}

const OUR_LABEL = 'HEAD'

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
    else if (o === undefined || t === undefined) {
      // One side deleted the file while the other was editing it. There is no
      // line to compare against a file that is not there, so the whole thing
      // goes to the student.
      conflicts.push(name)
      result = [
        `<<<<<<< ${OUR_LABEL}`,
        o ?? '',
        '=======',
        t ?? '',
        `>>>>>>> ${theirLabel}`,
      ].join('\n')
    } else {
      // Both sides edited it: only the pieces they disagree on are a conflict.
      const merged = threeWayMerge(
        b === undefined ? [] : b.split('\n'),
        o.split('\n'),
        t.split('\n'),
        OUR_LABEL,
        theirLabel,
      )
      if (merged.conflicted) conflicts.push(name)
      result = merged.lines.join('\n')
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
        msg('fatal: You have not concluded your merge (MERGE_HEAD exists).'),
        msg('Please, commit your changes before you merge.'),
      ].join('\n'),
      'hint.mergeInProgress',
    )
  }
  if (!target) {
    throw gitError(
      msg('fatal: No commit specified and merge.defaultToUpstream not set.'),
      'hint.mergeNeedsBranch',
    )
  }

  const theirCommit = resolveRef(repo, target)
  if (!theirCommit) {
    throw gitError(
      msg('merge: {name} - not something we can merge', { name: target }),
      'hint.mergeUnknownBranch',
      { name: target },
    )
  }

  const ourCommit = headCommitId(repo)
  if (!ourCommit) {
    throw gitError(
      msg('fatal: Non-fast-forward commit does not make sense into an empty head'),
      'hint.mergeWithoutCommits',
    )
  }
  if (ourCommit === theirCommit || isAncestor(repo, theirCommit, ourCommit)) {
    return [msg('Already up to date.')]
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
      msg('Updating {from}..{to}', { from: ourCommit, to: theirCommit }),
      msg('Fast-forward'),
      changedLine(changed),
    ]
  }

  assertSafeToSwitch(world, theirTree, 'merge')

  const base = mergeBase(repo, ourCommit, theirCommit)
  if (!base) {
    throw gitError(
      msg('fatal: refusing to merge unrelated histories'),
      'hint.unrelatedHistories',
    )
  }

  const { tree, conflicts } = mergeTrees(
    treeOf(repo, base),
    headTree(repo),
    theirTree,
    target,
  )
  const touched = changedBetween(headTree(repo), tree)
  const lines = touched.map((name) => msg('Auto-merging {name}', { name }))

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
      ...conflicts.map((name) => msg('CONFLICT (content): Merge conflict in {name}', { name })),
      msg('Automatic merge failed; fix conflicts and then commit the result.'),
    )
    return lines
  }

  // The commit message is stored in the repository, so it stays in English
  // whatever language the output is in — git does not translate it either.
  const message = `Merge branch '${target}'`
  const commitId = writeCommit(world, repo, {
    parents: [ourCommit, theirCommit],
    message,
    tree,
  })
  const branch = currentBranch(repo)
  if (branch) repo.branches[branch] = commitId
  else repo.head = { type: 'detached', commit: commitId }

  lines.push(msg("Merge made by the 'ort' strategy."), changedLine(touched.length))
  return lines
}

export { ancestors, computeStatus }
