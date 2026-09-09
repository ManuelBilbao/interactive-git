// Merging two versions of a file line by line, the way git does it.
//
// The comparison in `diff.js` answers "what changed between these two". A
// merge has three versions to weigh instead of two: the common ancestor, our
// side and theirs. The algorithm is diff3, and the whole idea fits in one
// sentence: line up both sides against the ancestor, and wherever the three of
// them stop agreeing, look at that piece alone.
//
// A piece only becomes a conflict when *both* sides changed it and changed it
// differently. Two people editing far apart in the same file merge cleanly,
// which is the behaviour that makes a conflict mean something.

import { diffLines } from './diff.js'

/**
 * Where each line of `base` ended up in `side`, or -1 when it is gone.
 *
 * @returns {number[]} one entry per line of `base`
 */
function alignment(base, side) {
  const map = new Array(base.length).fill(-1)
  let b = 0
  let s = 0
  for (const edit of diffLines(base, side)) {
    if (edit.sign === ' ') {
      map[b] = s
      b += 1
      s += 1
    } else if (edit.sign === '-') {
      b += 1
    } else {
      s += 1
    }
  }
  return map
}

const same = (a, b) => a.length === b.length && a.every((line, index) => line === b[index])

/**
 * One disagreement, resolved. Only a piece both sides rewrote differently is
 * left for the student to settle.
 */
function resolve(baseSlice, ourSlice, theirSlice, ourLabel, theirLabel) {
  if (same(ourSlice, baseSlice)) return { lines: theirSlice, conflicted: false }
  if (same(theirSlice, baseSlice)) return { lines: ourSlice, conflicted: false }
  if (same(ourSlice, theirSlice)) return { lines: ourSlice, conflicted: false }
  return {
    lines: [
      `<<<<<<< ${ourLabel}`,
      ...ourSlice,
      '=======',
      ...theirSlice,
      `>>>>>>> ${theirLabel}`,
    ],
    conflicted: true,
  }
}

/**
 * Three-way merge of one file.
 *
 * @returns {{lines: string[], conflicted: boolean}}
 */
export function threeWayMerge(base, ours, theirs, ourLabel, theirLabel) {
  const toOurs = alignment(base, ours)
  const toTheirs = alignment(base, theirs)

  const lines = []
  let conflicted = false
  let b = 0
  let o = 0
  let t = 0

  const settle = (baseSlice, ourSlice, theirSlice) => {
    const piece = resolve(baseSlice, ourSlice, theirSlice, ourLabel, theirLabel)
    lines.push(...piece.lines)
    conflicted = conflicted || piece.conflicted
  }

  while (b < base.length) {
    // A line both sides kept, in step with where we are in each of them: it
    // needs no decision, and it is what separates one disagreement from the next.
    if (toOurs[b] === o && toTheirs[b] === t) {
      lines.push(base[b])
      b += 1
      o += 1
      t += 1
      continue
    }

    // Otherwise, run to the next line the three of them can agree on again.
    // Everything up to it is one piece to settle.
    let next = b
    while (
      next < base.length &&
      !(toOurs[next] >= o && toTheirs[next] >= t && toOurs[next] !== -1 && toTheirs[next] !== -1)
    ) {
      next += 1
    }

    const stop = next < base.length
    const ourEnd = stop ? toOurs[next] : ours.length
    const theirEnd = stop ? toTheirs[next] : theirs.length
    settle(base.slice(b, next), ours.slice(o, ourEnd), theirs.slice(t, theirEnd))
    b = next
    o = ourEnd
    t = theirEnd
  }

  // Whatever either side added past the last shared line.
  if (o < ours.length || t < theirs.length) {
    settle([], ours.slice(o), theirs.slice(t))
  }

  return { lines, conflicted }
}
