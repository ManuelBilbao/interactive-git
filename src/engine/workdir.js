// Moving the working directory from one snapshot to another, with the same
// safety checks real git performs before it overwrites your work.

import { gitError } from './errors.js'
import { headTree } from './model.js'
import { computeStatus } from './status.js'

/** Files whose content differs between two trees. */
export function changedBetween(from, to) {
  const names = new Set([...Object.keys(from), ...Object.keys(to)])
  return [...names].filter((name) => from[name] !== to[name]).sort()
}

/**
 * Refuses the operation when it would silently destroy work: a modified file
 * that the new snapshot also changes, or an untracked file it would overwrite.
 */
export function assertSafeToSwitch(world, targetTree, operation) {
  const repo = world.repo
  const current = headTree(repo)
  const affected = new Set(changedBetween(current, targetTree))
  const status = computeStatus(world)

  const endangered = [...status.staged, ...status.notStaged]
    .map((entry) => entry.name)
    .filter((name) => affected.has(name))
  if (endangered.length > 0) {
    throw gitError(
      [
        `error: Your local changes to the following files would be overwritten by ${operation}:`,
        ...[...new Set(endangered)].sort().map((name) => `\t${name}`),
        `Please commit your changes or stash them before you ${operation}.`,
        'Aborting',
      ].join('\n'),
      'hint.dirtyTree',
      { operation },
    )
  }

  const clobbered = status.untracked.filter((name) => Object.hasOwn(targetTree, name))
  if (clobbered.length > 0) {
    throw gitError(
      [
        `error: The following untracked working tree files would be overwritten by ${operation}:`,
        ...clobbered.map((name) => `\t${name}`),
        'Please move or remove them before you continue.',
        'Aborting',
      ].join('\n'),
      'hint.untrackedClobber',
      { operation },
    )
  }
}

/** Applies a snapshot to both the staging area and the working directory. */
export function applyTree(world, targetTree) {
  const repo = world.repo
  const current = headTree(repo)
  for (const name of Object.keys(current)) {
    if (!Object.hasOwn(targetTree, name)) {
      delete world.files[name]
      delete repo.index[name]
    }
  }
  for (const [name, content] of Object.entries(targetTree)) {
    world.files[name] = content
    repo.index[name] = content
  }
}
