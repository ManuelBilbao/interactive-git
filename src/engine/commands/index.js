// The command dispatcher: turns a typed line into output plus, when something
// goes wrong, the key of a friendly explanation the UI shows beside the error.

import { GitError, gitError } from '../errors.js'
import { helpFor, isHelpRequest } from '../help.js'
import { hintKind } from '../hints.js'
import { msg } from '../messages.js'
import { tokenize } from '../parser.js'
import { gitBranch, gitCheckout, gitMerge } from './branching.js'
import { gitCommit, gitLog } from './history.js'
import { gitPull, gitPush } from './remote.js'
import { gitClone, gitInit } from './repoSetup.js'
import { cat, echo, ls, pwd, rm, touch } from './shell.js'
import { gitAdd, gitRestore, gitStatus } from './staging.js'

/** Git subcommands that work without an existing repository. */
const WITHOUT_REPO = new Set(['init', 'clone'])

/** The subcommands that can leave a merge half-finished. */
const MERGING = new Set(['merge', 'pull'])

const GIT_COMMANDS = {
  init: gitInit,
  clone: gitClone,
  status: gitStatus,
  add: gitAdd,
  restore: gitRestore,
  commit: gitCommit,
  log: gitLog,
  branch: gitBranch,
  checkout: gitCheckout,
  merge: gitMerge,
  push: gitPush,
  pull: gitPull,
}

const SHELL_COMMANDS = { ls, cat, touch, rm, echo, pwd }

/** Edit distance, used to answer "did you mean...?". */
function distance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
  }
  return rows[a.length][b.length]
}

function closest(word, candidates) {
  let best = null
  let bestScore = Infinity
  for (const candidate of candidates) {
    const score = distance(word, candidate)
    if (score < bestScore) {
      bestScore = score
      best = candidate
    }
  }
  return bestScore <= 3 ? best : null
}

function result(lines, extra = {}) {
  const output = { lines, error: false, hintKey: null, hintParams: {}, clear: false, ...extra }
  return { ...output, hintKind: hintKind(output.hintKey, output.error) }
}

/**
 * The reduced help for one command, with the caveat about it being reduced
 * carried as a hint rather than printed as if git had said it.
 */
function helpResult(command) {
  return result(helpFor(command), {
    hintKey: 'hint.reducedHelp',
    hintParams: { command },
  })
}

function runGit(world, args) {
  const [subcommand, ...rest] = args

  // `git help <command>` is the same as `git <command> --help`.
  if (subcommand === 'help' && rest.length > 0 && helpFor(rest[0])) {
    return helpResult(rest[0])
  }
  if (!subcommand || subcommand === '--help' || subcommand === 'help') {
    return result([], { hintKey: 'hint.gitHelp' })
  }
  const command = GIT_COMMANDS[subcommand]
  if (!command) {
    const suggestion = closest(subcommand, Object.keys(GIT_COMMANDS))
    throw gitError(
      [
        msg("git: '{name}' is not a git command. See 'git --help'.", { name: subcommand }),
        ...(suggestion ? ['', msg('The most similar command is'), `\t${suggestion}`] : []),
      ].join('\n'),
      suggestion ? 'hint.unknownGitCommandDidYouMean' : 'hint.unknownGitCommand',
      { name: subcommand, suggestion },
    )
  }
  // Help comes before everything else: it needs no repository, and asking for
  // it must never trip over the option checking of the command itself.
  if (isHelpRequest(rest) && helpFor(subcommand)) return helpResult(subcommand)

  if (!world.repo && !WITHOUT_REPO.has(subcommand)) {
    throw gitError(
      msg('fatal: not a git repository (or any of the parent directories): .git'),
      'hint.notARepo',
    )
  }

  const lines = command(world, rest)

  // A merge that ends in conflicts is not a failure, but it leaves the student
  // mid-operation with something to do and no error to read about it.
  if (world.repo?.merge && MERGING.has(subcommand)) {
    return result(lines, { hintKey: 'hint.mergeConflict' })
  }
  return result(lines)
}

/**
 * Runs `line` against a copy of `world`.
 *
 * @returns {{world: object, output: object}} the new world and what to print.
 */
export function run(world, line) {
  const next = structuredClone(world)
  const trimmed = line.trim()
  if (trimmed === '') return { world: next, output: result([]) }

  try {
    const tokens = tokenize(trimmed)
    const [name, ...args] = tokens

    if (name === 'clear') return { world: next, output: result([], { clear: true }) }
    if (name === 'help') return { world: next, output: result([], { hintKey: 'hint.shellHelp' }) }
    if (name === 'git') return { world: next, output: runGit(next, args) }

    const shellCommand = SHELL_COMMANDS[name]
    if (shellCommand) return { world: next, output: result(shellCommand(next, args)) }

    const suggestion = closest(name, [...Object.keys(SHELL_COMMANDS), 'git', 'clear', 'help'])
    throw gitError(
      msg('bash: {name}: command not found', { name }),
      suggestion ? 'hint.unknownCommandDidYouMean' : 'hint.unknownCommand',
      { name, suggestion },
    )
  } catch (error) {
    if (error instanceof GitError) {
      return {
        // A failed command must not leave half-applied changes behind.
        world,
        output: {
          lines: error.message.split('\n'),
          error: true,
          hintKey: error.hintKey,
          hintParams: error.hintParams,
          hintKind: hintKind(error.hintKey, true),
          clear: false,
        },
      }
    }
    throw error
  }
}

export { GIT_COMMANDS, SHELL_COMMANDS }
