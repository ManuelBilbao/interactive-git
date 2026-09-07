// `git init` and `git clone`: the two ways a repository comes into existence.

import { gitError } from '../errors.js'
import {
  DEFAULT_BRANCH,
  REMOTE_NAME,
  ancestors,
  createRepo,
  treeOf,
} from '../model.js'

export function gitInit(world) {
  if (world.repo) {
    return [`Reinitialized existing Git repository in /${world.folder}/.git/`]
  }
  world.repo = createRepo({ head: { type: 'branch', name: DEFAULT_BRANCH } })
  return [
    `Initialized empty Git repository in /${world.folder}/.git/`,
    '',
    `hint: Using '${DEFAULT_BRANCH}' as the name for the initial branch.`,
  ]
}

export function gitClone(world, args) {
  const url = args[0]
  if (!url) {
    throw gitError(
      'fatal: You must specify a repository to clone.',
      'hint.cloneNeedsUrl',
    )
  }
  if (world.repo) {
    throw gitError(
      `fatal: destination path '${world.folder}' already exists and is not an empty directory.`,
      'hint.cloneOverExisting',
    )
  }
  if (!world.remote || (world.remoteUrl && url !== world.remoteUrl)) {
    throw gitError(
      [
        `fatal: repository '${url}' does not exist`,
        '',
        'Please make sure you have the correct access rights',
        'and the repository exists.',
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

  const objects = Object.keys(repo.commits).length
  return [
    `Cloning into '${world.folder}'...`,
    `remote: Enumerating objects: ${objects}, done.`,
    `remote: Counting objects: 100% (${objects}/${objects}), done.`,
    `Receiving objects: 100% (${objects}/${objects}), done.`,
  ]
}
