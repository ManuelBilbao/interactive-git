// `git commit` and `git log`: writing history and reading it back.

import { gitError } from '../errors.js'
import {
  currentBranch,
  headCommitId,
  headTree,
  logFrom,
  treeOf,
  writeCommit,
} from '../model.js'
import { readOption } from '../parser.js'
import { computeStatus } from '../status.js'
import { gitStatus } from './staging.js'

function countChanges(before, after) {
  const names = new Set([...Object.keys(before), ...Object.keys(after)])
  let changed = 0
  for (const name of names) {
    if (before[name] !== after[name]) changed += 1
  }
  return changed
}

export function gitCommit(world, args) {
  const repo = world.repo
  const status = computeStatus(world)

  if (status.conflicted.length > 0) {
    throw gitError(
      [
        'error: Committing is not possible because you have unmerged files.',
        'hint: Fix them up in the work tree, and then use \'git add <file>\'',
        'hint: as appropriate to mark resolution and make a commit.',
        'fatal: Exiting because of an unresolved conflict.',
      ].join('\n'),
      'hint.commitWithConflicts',
    )
  }

  const message = readOption(args, '-m', '--message')
  if (message === undefined) {
    throw gitError(
      ['Aborting commit due to empty commit message.'].join('\n'),
      'hint.commitNeedsMessage',
    )
  }
  if (message === null || message.trim() === '') {
    throw gitError("error: switch `m' requires a value", 'hint.commitEmptyMessage')
  }

  const parentId = headCommitId(repo)
  const isMerge = Boolean(repo.merge)
  if (status.staged.length === 0 && !isMerge) {
    throw gitError(gitStatus(world, []).join('\n'), 'hint.commitNothingStaged')
  }

  const parents = parentId ? [parentId] : []
  if (isMerge) parents.push(repo.merge.fromCommit)

  const commitId = writeCommit(world, repo, {
    parents,
    message,
    tree: repo.index,
  })

  const branch = currentBranch(repo)
  if (branch) repo.branches[branch] = commitId
  else repo.head = { type: 'detached', commit: commitId }

  const changed = countChanges(treeOf(repo, parentId), repo.index)
  const label = branch ?? `HEAD detached at ${commitId}`
  const rootMark = parents.length === 0 ? ' (root-commit)' : ''
  repo.merge = null

  return [
    `[${label}${rootMark} ${commitId}] ${message}`,
    ` ${changed} ${changed === 1 ? 'file' : 'files'} changed`,
  ]
}

/** Every ref that points at a commit, rendered as git's `(HEAD -> main)`. */
function decorations(repo, commitId) {
  const refs = []
  for (const [name, id] of Object.entries(repo.branches)) {
    if (id !== commitId) continue
    refs.push(currentBranch(repo) === name ? `HEAD -> ${name}` : name)
  }
  for (const [name, id] of Object.entries(repo.remoteTracking)) {
    if (id === commitId) refs.push(name)
  }
  if (repo.head.type === 'detached' && repo.head.commit === commitId) refs.unshift('HEAD')
  return refs.length > 0 ? ` (${refs.join(', ')})` : ''
}

export function gitLog(world, args) {
  const repo = world.repo
  const head = headCommitId(repo)
  if (!head) {
    throw gitError(
      `fatal: your current branch '${currentBranch(repo)}' does not have any commits yet`,
      'hint.logWithoutCommits',
    )
  }
  const oneline = args.includes('--oneline')
  const commits = logFrom(repo, head)
  const lines = []
  for (const commit of commits) {
    if (oneline) {
      lines.push(`${commit.id}${decorations(repo, commit.id)} ${commit.message}`)
    } else {
      lines.push(`commit ${commit.id}${decorations(repo, commit.id)}`)
      if (commit.parents.length > 1) lines.push(`Merge: ${commit.parents.join(' ')}`)
      lines.push('', `    ${commit.message}`, '')
    }
  }
  return lines
}

export { headTree }
