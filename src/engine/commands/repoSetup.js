// `git init` and `git clone`: the two ways a repository comes into existence.

import { gitError } from '../errors.js'
import { msg } from '../messages.js'
import {
  DEFAULT_BRANCH,
  REMOTE_NAME,
  ancestors,
  createRepo,
  treeOf,
} from '../model.js'

export function gitInit(world) {
  if (world.repo) {
    return [msg('Reinitialized existing Git repository in /{folder}/.git/', { folder: world.folder })]
  }
  world.repo = createRepo({ head: { type: 'branch', name: DEFAULT_BRANCH } })
  return [
    msg('Initialized empty Git repository in /{folder}/.git/', { folder: world.folder }),
    '',
    msg("hint: Using '{branch}' as the name for the initial branch.", { branch: DEFAULT_BRANCH }),
  ]
}

export function gitClone(world, args) {
  const url = args[0]
  if (!url) {
    throw gitError(
      msg('fatal: You must specify a repository to clone.'),
      'hint.cloneNeedsUrl',
    )
  }
  if (world.repo) {
    throw gitError(
      msg("fatal: destination path '{folder}' already exists and is not an empty directory.", {
        folder: world.folder,
      }),
      'hint.cloneOverExisting',
    )
  }
  if (!world.remote || (world.remoteUrl && url !== world.remoteUrl)) {
    throw gitError(
      [
        msg("fatal: repository '{url}' does not exist", { url }),
        '',
        msg('Please make sure you have the correct access rights'),
        msg('and the repository exists.'),
      ].join('\n'),
      'hint.cloneUnknownUrl',
      { url },
    )
  }

  const remote = world.remote
  const defaultBranch = remote.head?.name ?? DEFAULT_BRANCH
  const repo = createRepo({ head: { type: 'branch', name: defaultBranch } })

  // Cloning downloads every commit reachable from every branch on the server.
  for (const commitId of Object.values(remote.branches)) {
    for (const id of ancestors(remote, commitId)) {
      repo.commits[id] = structuredClone(remote.commits[id])
    }
    // ...but only remote-tracking branches are created locally.
  }
  for (const [name, commitId] of Object.entries(remote.branches)) {
    repo.remoteTracking[`${REMOTE_NAME}/${name}`] = commitId
  }
  repo.branches[defaultBranch] = remote.branches[defaultBranch]
  repo.upstream[defaultBranch] = `${REMOTE_NAME}/${defaultBranch}`

  const tree = treeOf(repo, repo.branches[defaultBranch])
  repo.index = { ...tree }
  world.files = { ...tree }
  world.repo = repo
  world.remoteUrl = url

  const count = Object.keys(repo.commits).length
  return [
    msg("Cloning into '{folder}'...", { folder: world.folder }),
    msg('remote: Enumerating objects: {count}, done.', { count }),
    msg('remote: Counting objects: 100% ({count}/{count}), done.', { count }),
    msg('Receiving objects: 100% ({count}/{count}), done.', { count }),
  ]
}
