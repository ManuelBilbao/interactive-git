// `git <command> --help`: what the command does, and which of its options this
// simulator actually understands.
//
// Real git opens a man page; there is none here, so what gets printed is the
// shape of `git <command> -h` — a usage line and the options — plus a one-line
// summary, which a beginner needs more than a beginner needs completeness.
//
// The list is deliberately short: it covers what works here and nothing else.
// Saying so is not git's job, so the caveat travels as a hint key and the UI
// shows it beside the output, in the student's language.

import { msg } from './messages.js'

/**
 * Pads the flag column the way git's own short help does. Kept narrow, and the
 * descriptions kept short, because this terminal is a column in a page: a line
 * that wraps continues at the left edge, as it would in a real terminal, and
 * the alignment is lost when it does.
 */
function option(flags, description) {
  return `    ${flags.padEnd(20, ' ')}${description}`
}

// Thunks, so every string is translated at the moment it is printed and the
// message extractor can still see the literals.
const HELP = {
  init: () => ({
    usage: msg('usage: git init'),
    summary: msg('Turn the folder you are in into a git repository.'),
    options: [],
  }),

  clone: () => ({
    usage: msg('usage: git clone <url>'),
    summary: msg('Copy a repository from a server, with all of its history.'),
    options: [],
  }),

  status: () => ({
    usage: msg('usage: git status'),
    summary: msg('Show what is staged, what is not, and which files git is not tracking.'),
    options: [],
  }),

  add: () => ({
    usage: msg('usage: git add [-A | --all] <pathspec>...'),
    summary: msg('Copy the current state of a file into the staging area. Use . for all of them.'),
    options: [option('-A, --all', msg('every change in the folder'))],
  }),

  restore: () => ({
    usage: msg('usage: git restore [--staged] <pathspec>...'),
    summary: msg('Undo changes to a file, in the folder or in the staging area.'),
    options: [
      option('--staged', msg('only take it out of the staging area')),
    ],
  }),

  commit: () => ({
    usage: msg('usage: git commit -m <message>'),
    summary: msg('Record everything in the staging area as a new commit.'),
    options: [option('-m, --message <msg>', msg('what changed, in one line'))],
  }),

  log: () => ({
    usage: msg('usage: git log [--oneline]'),
    summary: msg('Show the history reachable from where you are, newest first.'),
    options: [option('--oneline', msg('one line per commit'))],
  }),

  branch: () => ({
    usage: msg('usage: git branch [-a] [-d <name>] [<name>]'),
    summary: msg('List branches, or create one at the commit you are on.'),
    options: [
      option('-a, --all', msg('also the ones on the server')),
      option('-d, --delete', msg('delete a merged branch')),
      option('-D', msg('delete an unmerged branch')),
    ],
  }),

  checkout: () => ({
    usage: msg('usage: git checkout [-b] <branch>'),
    summary: msg('Move to another branch or commit, and update the files to match.'),
    options: [option('-b <name>', msg('create the branch and move to it'))],
  }),

  merge: () => ({
    usage: msg('usage: git merge <branch>'),
    summary: msg('Bring the commits of another branch into the one you are on.'),
    options: [],
  }),

  push: () => ({
    usage: msg('usage: git push [-u] [<remote> <branch>]'),
    summary: msg('Send the commits of your branch to the server.'),
    options: [option('-u, --set-upstream', msg('track the server branch'))],
  }),

  pull: () => ({
    usage: msg('usage: git pull [<remote> <branch>]'),
    summary: msg('Bring down what is on the server and join it with your branch.'),
    options: [],
  }),
}

/** True when the arguments are asking for help rather than for work. */
export function isHelpRequest(args) {
  return args.includes('--help') || args.includes('-h')
}

export function hasHelp(command) {
  return Object.hasOwn(HELP, command)
}

/** The printed help for one command, or null when there is none. */
export function helpFor(command) {
  if (!hasHelp(command)) return null
  const { usage, summary, options } = HELP[command]()
  return [usage, '', `    ${summary}`, ...(options.length > 0 ? ['', ...options] : [])]
}

export const HELP_COMMANDS = Object.keys(HELP)
