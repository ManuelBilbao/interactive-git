// Computes the difference between the three places a file can live:
// the last commit (HEAD), the staging area (index) and the working directory.

import { msg } from './messages.js'
import { headTree } from './model.js'

const ADDED = 'added'
const MODIFIED = 'modified'
const DELETED = 'deleted'

function namesOf(...maps) {
  return [...new Set(maps.flatMap((map) => Object.keys(map)))].sort()
}

/**
 * @returns {{
 *   staged: {name: string, change: string}[],
 *   notStaged: {name: string, change: string}[],
 *   untracked: string[],
 *   conflicted: string[],
 * }}
 */
export function computeStatus(world) {
  const repo = world.repo
  const head = headTree(repo)
  const index = repo.index
  const files = world.files
  const conflicted = repo.merge ? [...repo.merge.conflicts].sort() : []

  const staged = []
  for (const name of namesOf(head, index)) {
    if (conflicted.includes(name)) continue
    const inHead = Object.hasOwn(head, name)
    const inIndex = Object.hasOwn(index, name)
    if (!inHead && inIndex) staged.push({ name, change: ADDED })
    else if (inHead && !inIndex) staged.push({ name, change: DELETED })
    else if (head[name] !== index[name]) staged.push({ name, change: MODIFIED })
  }

  const notStaged = []
  const untracked = []
  for (const name of namesOf(index, files)) {
    if (conflicted.includes(name)) continue
    const inIndex = Object.hasOwn(index, name)
    const inFiles = Object.hasOwn(files, name)
    if (!inIndex && inFiles) untracked.push(name)
    else if (inIndex && !inFiles) notStaged.push({ name, change: DELETED })
    else if (index[name] !== files[name]) notStaged.push({ name, change: MODIFIED })
  }

  return { staged, notStaged, untracked, conflicted }
}

export function isClean(world) {
  const { staged, notStaged, untracked, conflicted } = computeStatus(world)
  return (
    staged.length === 0 &&
    notStaged.length === 0 &&
    untracked.length === 0 &&
    conflicted.length === 0
  )
}

/** Files whose working-directory content differs from the staging area. */
export function dirtyFiles(world) {
  const { staged, notStaged } = computeStatus(world)
  return new Set([...staged, ...notStaged].map((entry) => entry.name))
}

// Written as thunks so that the message extractor, which scans the source for
// `msg('...')`, can still see the literals behind this lookup table.
const LABEL = {
  [ADDED]: () => msg('new file:'),
  [MODIFIED]: () => msg('modified:'),
  [DELETED]: () => msg('deleted:'),
}

const bothModified = () => msg('both modified:')

/** Leaves room for the longest label, so file names line up in any language. */
function pad(label, width) {
  return label.padEnd(width + 3, ' ')
}

export function formatEntry(entry) {
  const width = Math.max(...Object.values(LABEL).map((label) => label().length))
  return `\t${pad(LABEL[entry.change](), width)}${entry.name}`
}

export function formatConflict(name) {
  const label = bothModified()
  return `\t${pad(label, label.length)}${name}`
}
