// Comparing two snapshots, printed the way `git diff` prints it.
//
// The files here are a handful of lines each, so the plainest correct
// algorithm is the right one: a longest-common-subsequence table, walked back
// into a list of edits. No heuristics, no shortcuts to explain later.

import { cyan, green, paint, red } from '../ansi.js'

const CONTEXT = 3

/**
 * The edits that turn `before` into `after`, one per line.
 *
 * @returns {{sign: ' '|'-'|'+', text: string}[]}
 */
export function diffLines(before, after) {
  const n = before.length
  const m = after.length

  // lengths[i][j] is the LCS length of before[i..] and after[j..].
  const lengths = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lengths[i][j] =
        before[i] === after[j]
          ? lengths[i + 1][j + 1] + 1
          : Math.max(lengths[i + 1][j], lengths[i][j + 1])
    }
  }

  const edits = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      edits.push({ sign: ' ', text: before[i] })
      i += 1
      j += 1
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      edits.push({ sign: '-', text: before[i] })
      i += 1
    } else {
      edits.push({ sign: '+', text: after[j] })
      j += 1
    }
  }
  while (i < n) {
    edits.push({ sign: '-', text: before[i] })
    i += 1
  }
  while (j < m) {
    edits.push({ sign: '+', text: after[j] })
    j += 1
  }
  return edits
}

/** Line numbers each edit lands on, in the old file and in the new one. */
function numbered(edits) {
  let oldLine = 0
  let newLine = 0
  return edits.map((edit) => {
    if (edit.sign !== '+') oldLine += 1
    if (edit.sign !== '-') newLine += 1
    return { ...edit, oldLine, newLine }
  })
}

/** Runs of changed lines, each padded with up to CONTEXT unchanged ones. */
function hunkRanges(edits) {
  const changed = edits.reduce((all, edit, index) => {
    if (edit.sign !== ' ') all.push(index)
    return all
  }, [])
  if (changed.length === 0) return []

  const last = edits.length - 1
  const ranges = []
  let start = Math.max(0, changed[0] - CONTEXT)
  let end = Math.min(last, changed[0] + CONTEXT)
  for (const index of changed.slice(1)) {
    // Runs closer than twice the context are read as one hunk.
    if (index - CONTEXT <= end + 1) {
      end = Math.min(last, index + CONTEXT)
    } else {
      ranges.push([start, end])
      start = Math.max(0, index - CONTEXT)
      end = Math.min(last, index + CONTEXT)
    }
  }
  ranges.push([start, end])
  return ranges
}

function hunkHeader(edits, [start, end]) {
  const slice = edits.slice(start, end + 1)
  const count = (side) => slice.filter((edit) => edit.sign !== side).length
  const first = (side) => slice.find((edit) => edit.sign !== side)

  const oldCount = count('+')
  const newCount = count('-')
  // A hunk that only adds lines starts *after* the line it follows, which is
  // what git's `-0,0` for a brand new file comes from.
  const oldStart = oldCount > 0 ? first('+').oldLine : edits[start].oldLine
  const newStart = newCount > 0 ? first('-').newLine : edits[start].newLine
  // git leaves the count off when it is exactly one line.
  const range = (start, count) => (count === 1 ? `${start}` : `${start},${count}`)
  return `@@ -${range(oldStart, oldCount)} +${range(newStart, newCount)} @@`
}

const asLines = (content) => (content === undefined ? [] : content.split('\n'))

/** The diff of one file, headers included, or nothing when it is unchanged. */
function diffFile(name, before, after) {
  if (before === after) return []

  const edits = numbered(diffLines(asLines(before), asLines(after)))
  const lines = [paint(`diff --git a/${name} b/${name}`, 'bold')]
  if (before === undefined) lines.push(paint('new file mode 100644', 'bold'))
  if (after === undefined) lines.push(paint('deleted file mode 100644', 'bold'))
  lines.push(
    paint(before === undefined ? '--- /dev/null' : `--- a/${name}`, 'bold'),
    paint(after === undefined ? '+++ /dev/null' : `+++ b/${name}`, 'bold'),
  )

  for (const range of hunkRanges(edits)) {
    lines.push(cyan(hunkHeader(edits, range)))
    for (const edit of edits.slice(range[0], range[1] + 1)) {
      const line = `${edit.sign}${edit.text}`
      if (edit.sign === '+') lines.push(green(line))
      else if (edit.sign === '-') lines.push(red(line))
      else lines.push(line)
    }
  }
  return lines
}

/** The diff between two snapshots, file by file, in name order. */
export function diffTrees(before, after) {
  const names = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
  return names.flatMap((name) => diffFile(name, before[name], after[name]))
}
