// Computes the difference between the three places a file can live:
// the last commit (HEAD), the staging area (index) and the working directory.

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

const LABEL = {
  [ADDED]: 'new file:',
  [MODIFIED]: 'modified:',
  [DELETED]: 'deleted:',
}

export function formatEntry(entry) {
  return `\t${LABEL[entry.change].padEnd(12, ' ')}${entry.name}`
}
