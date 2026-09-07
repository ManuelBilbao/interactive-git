// `git push` and `git pull`: talking to the simulated server, `origin`.

import { gitError } from '../errors.js'
import {
  REMOTE_NAME,
  ancestors,
  copyCommits,
  currentBranch,
  isAncestor,
} from '../model.js'
import { gitMerge } from './branching.js'

function requireRemote(world) {
  if (!world.remote || !world.remoteUrl) {
    throw gitError(
      [
        'fatal: No configured push destination.',
        'Please specify either a URL or a remote name from which',
        'new revisions should be fetched.',
      ].join('\n'),
      'hint.noRemote',
    )
  }
  return world.remote
}

function requireBranch(world) {
  const branch = currentBranch(world.repo)
  if (!branch) {
    throw gitError(
      'fatal: You are not currently on a branch.',
      'hint.pushDetached',
    )
  }
  return branch
}

/** Downloads everything the server has and updates the `origin/*` labels. */
function fetch(world) {
  const repo = world.repo
  const remote = world.remote
  const updates = []
  for (const [name, commitId] of Object.entries(remote.branches)) {
    const ref = `${REMOTE_NAME}/${name}`
    const before = repo.remoteTracking[ref]
    if (before === commitId) continue
    copyCommits(remote, repo, commitId)
    repo.remoteTracking[ref] = commitId
    updates.push({ name, ref, before, after: commitId })
  }
  return updates
}

export function gitPush(world, args) {
  const repo = world.repo
  const remote = requireRemote(world)
  const setUpstream = args.includes('-u') || args.includes('--set-upstream')
  const positional = args.filter((arg) => !arg.startsWith('-'))
  const branch = positional[1] ?? requireBranch(world)

  if (!Object.hasOwn(repo.branches, branch)) {
    throw gitError(
      [
        `error: src refspec ${branch} does not match any`,
        `error: failed to push some refs to '${world.remoteUrl}'`,
      ].join('\n'),
      'hint.pushNothingToPush',
      { name: branch },
    )
  }

  const local = repo.branches[branch]
  const onServer = remote.branches[branch]

  if (onServer === local) return ['Everything up-to-date']

  // The server only accepts history that already contains what it has.
  if (onServer && !ancestors(repo, local).has(onServer)) {
    throw gitError(
      [
        `To ${world.remoteUrl}`,
        ` ! [rejected]        ${branch} -> ${branch} (fetch first)`,
        `error: failed to push some refs to '${world.remoteUrl}'`,
        'hint: Updates were rejected because the remote contains work that you do',
        'hint: not have locally. You may want to first integrate the remote changes',
        "hint: (e.g., 'git pull') before pushing again.",
      ].join('\n'),
      'hint.pushRejected',
    )
  }

  copyCommits(repo, remote, local)
  remote.branches[branch] = local
  repo.remoteTracking[`${REMOTE_NAME}/${branch}`] = local
  if (setUpstream || !repo.upstream[branch]) {
    repo.upstream[branch] = `${REMOTE_NAME}/${branch}`
  }

  const lines = [
    `Enumerating objects: ${ancestors(repo, local).size}, done.`,
    `To ${world.remoteUrl}`,
    onServer
      ? `   ${onServer}..${local}  ${branch} -> ${branch}`
      : ` * [new branch]      ${branch} -> ${branch}`,
  ]
  if (setUpstream) {
    lines.push(`branch '${branch}' set up to track '${REMOTE_NAME}/${branch}'.`)
  }
  return lines
}

export function gitPull(world, args) {
  const repo = world.repo
  requireRemote(world)
  const branch = requireBranch(world)
  const positional = args.filter((arg) => !arg.startsWith('-'))
  const remoteBranch = positional[1] ?? branch
  const ref = `${REMOTE_NAME}/${remoteBranch}`

  if (positional.length === 0 && !repo.upstream[branch]) {
    throw gitError(
      [
        'There is no tracking information for the current branch.',
        'Please specify which branch you want to merge with.',
        '',
        `    git pull ${REMOTE_NAME} <branch>`,
      ].join('\n'),
      'hint.pullNoUpstream',
      { name: branch },
    )
  }

  const updates = fetch(world)
  const lines = []
  if (updates.length > 0) {
    lines.push(
      `remote: Enumerating objects: ${updates.length}, done.`,
      `From ${world.remoteUrl}`,
      ...updates.map((update) =>
        update.before
          ? `   ${update.before}..${update.after}  ${update.name} -> ${update.ref}`
          : ` * [new branch]      ${update.name} -> ${update.ref}`,
      ),
    )
  }

  if (!Object.hasOwn(repo.remoteTracking, ref)) {
    throw gitError(
      [
        `fatal: couldn't find remote ref ${remoteBranch}`,
      ].join('\n'),
      'hint.pullUnknownBranch',
      { name: remoteBranch },
    )
  }

  const before = repo.branches[branch]
  const merged = gitMerge(world, [ref])
  if (merged.length === 1 && merged[0] === 'Already up to date.' && lines.length === 0) {
    return ['Already up to date.']
  }
  // `git pull` names the merge after the remote branch it integrated.
  const head = repo.branches[branch]
  if (head && head !== before && repo.commits[head]?.parents.length > 1) {
    repo.commits[head].message = `Merge branch '${remoteBranch}' of ${world.remoteUrl}`
  }
  return [...lines, ...merged]
}

export { isAncestor }
