// The staging area: `git status`, `git add` and `git restore`.

import { green, red } from '../../ansi.js'
import { gitError } from '../errors.js'
import { ancestors, currentBranch, headCommitId, headTree } from '../model.js'
import { computeStatus, formatEntry } from '../status.js'

function branchHeadline(repo) {
  if (repo.head.type === 'detached') return `HEAD detached at ${repo.head.commit}`
  return `On branch ${repo.head.name}`
}

/** "Your branch is ahead of 'origin/main' by 2 commits." and friends. */
function upstreamHeadline(repo) {
  const branch = currentBranch(repo)
  const upstream = branch ? repo.upstream[branch] : null
  if (!upstream) return null
  const local = repo.branches[branch]
  const remote = repo.remoteTracking[upstream]
  if (!local || !remote) return null

  const fromLocal = ancestors(repo, local)
  const fromRemote = ancestors(repo, remote)
  const ahead = [...fromLocal].filter((id) => !fromRemote.has(id)).length
  const behind = [...fromRemote].filter((id) => !fromLocal.has(id)).length
  const plural = (n) => (n === 1 ? 'commit' : 'commits')

  if (ahead === 0 && behind === 0) return `Your branch is up to date with '${upstream}'.`
  if (behind === 0) {
    return [
      `Your branch is ahead of '${upstream}' by ${ahead} ${plural(ahead)}.`,
      '  (use "git push" to publish your local commits)',
    ].join('\n')
  }
  if (ahead === 0) {
    return [
      `Your branch is behind '${upstream}' by ${behind} ${plural(behind)}, and can be fast-forwarded.`,
      '  (use "git pull" to update your local branch)',
    ].join('\n')
  }
  return [
    `Your branch and '${upstream}' have diverged,`,
    `and have ${ahead} and ${behind} different ${plural(2)} each, respectively.`,
    '  (use "git pull" to merge the remote branch into yours)',
  ].join('\n')
}

export function gitStatus(world, args) {
  const repo = world.repo
  const status = computeStatus(world)
  const onlyStaged = args.includes('--staged')
  const lines = []

  if (!onlyStaged) {
    lines.push(branchHeadline(repo))
    const upstream = upstreamHeadline(repo)
    if (upstream) lines.push(upstream)
    if (!headCommitId(repo) && repo.head.type === 'branch') {
      lines.push('', 'No commits yet')
    }
  }

  if (status.staged.length > 0) {
    lines.push('', 'Changes to be committed:')
    lines.push('  (use "git restore --staged <file>..." to unstage)')
    lines.push(...status.staged.map((entry) => green(formatEntry(entry))))
  }

  if (onlyStaged) {
    if (status.staged.length === 0) {
      lines.push('No changes staged for commit.')
      lines.push('  (use "git add <file>..." to stage changes)')
    }
    return lines
  }

  if (status.conflicted.length > 0) {
    lines.push('', 'Unmerged paths:')
    lines.push('  (use "git add <file>..." to mark resolution)')
    lines.push(...status.conflicted.map((name) => red(`\tboth modified:   ${name}`)))
  }

  if (status.notStaged.length > 0) {
    lines.push('', 'Changes not staged for commit:')
    lines.push('  (use "git add <file>..." to update what will be committed)')
    lines.push('  (use "git restore <file>..." to discard changes in working directory)')
    lines.push(...status.notStaged.map((entry) => red(formatEntry(entry))))
  }

  if (status.untracked.length > 0) {
    lines.push('', 'Untracked files:')
    lines.push('  (use "git add <file>..." to include in what will be committed)')
    lines.push(...status.untracked.map((name) => red(`\t${name}`)))
  }

  lines.push('')
  if (status.conflicted.length > 0) {
    lines.push('You have unmerged paths.')
  } else if (status.staged.length > 0) {
    lines.pop()
  } else if (status.notStaged.length > 0) {
    lines.push('no changes added to commit (use "git add" and/or "git commit -a")')
  } else if (status.untracked.length > 0) {
    lines.push('nothing added to commit but untracked files present (use "git add" to track)')
  } else {
    lines.push('nothing to commit, working tree clean')
  }
  return lines
}

function expandPaths(world, paths) {
  const all = new Set([...Object.keys(world.files), ...Object.keys(world.repo.index)])
  if (paths.some((path) => path === '.' || path === '-A' || path === '--all')) {
    return [...all].sort()
  }
  return paths
}

export function gitAdd(world, args) {
  const repo = world.repo
  const paths = args.filter((arg) => !arg.startsWith('-') || arg === '-A')
  const flagged = args.includes('-A') || args.includes('--all')

  if (paths.length === 0 && !flagged) {
    throw gitError(
      ['Nothing specified, nothing added.', "hint: Maybe you wanted to say 'git add .'?"].join('\n'),
      'hint.addNeedsPath',
    )
  }

  const targets = expandPaths(world, flagged ? ['.'] : paths)
  for (const name of targets) {
    if (!Object.hasOwn(world.files, name) && !Object.hasOwn(repo.index, name)) {
      throw gitError(
        `fatal: pathspec '${name}' did not match any files`,
        'hint.pathspecNotFound',
        { name },
      )
    }
  }

  for (const name of targets) {
    if (Object.hasOwn(world.files, name)) repo.index[name] = world.files[name]
    else delete repo.index[name]
    // Staging a file is also how you declare a merge conflict resolved.
    if (repo.merge) {
      repo.merge.conflicts = repo.merge.conflicts.filter((file) => file !== name)
    }
  }
  return []
}

export function gitRestore(world, args) {
  const repo = world.repo
  const staged = args.includes('--staged')
  const paths = expandPaths(
    world,
    args.filter((arg) => !arg.startsWith('-')),
  )

  if (paths.length === 0) {
    throw gitError(
      [
        'fatal: you must specify path(s) to restore',
        '',
        'usage: git restore [--staged] <pathspec>...',
      ].join('\n'),
      'hint.restoreNeedsPath',
    )
  }

  const head = headTree(repo)
  for (const name of paths) {
    if (staged) {
      if (Object.hasOwn(head, name)) repo.index[name] = head[name]
      else delete repo.index[name]
    } else {
      if (!Object.hasOwn(repo.index, name)) {
        throw gitError(
          `error: pathspec '${name}' did not match any file(s) known to git`,
          'hint.restoreUntracked',
          { name },
        )
      }
      world.files[name] = repo.index[name]
    }
  }
  return []
}
