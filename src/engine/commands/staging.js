// The staging area: `git status`, `git add` and `git restore`.

import { green, red } from '../../ansi.js'
import { gitError } from '../errors.js'
import { msg } from '../messages.js'
import { ancestors, currentBranch, headCommitId, headTree } from '../model.js'
import { computeStatus, formatConflict, formatEntry } from '../status.js'

function branchHeadline(repo) {
  if (repo.head.type === 'detached') {
    return msg('HEAD detached at {commit}', { commit: repo.head.commit })
  }
  return msg('On branch {branch}', { branch: repo.head.name })
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

  if (ahead === 0 && behind === 0) {
    return msg("Your branch is up to date with '{upstream}'.", { upstream })
  }
  if (behind === 0) {
    return [
      ahead === 1
        ? msg("Your branch is ahead of '{upstream}' by {count} commit.", { upstream, count: ahead })
        : msg("Your branch is ahead of '{upstream}' by {count} commits.", { upstream, count: ahead }),
      msg('  (use "git push" to publish your local commits)'),
    ].join('\n')
  }
  if (ahead === 0) {
    return [
      behind === 1
        ? msg(
            "Your branch is behind '{upstream}' by {count} commit, and can be fast-forwarded.",
            { upstream, count: behind },
          )
        : msg(
            "Your branch is behind '{upstream}' by {count} commits, and can be fast-forwarded.",
            { upstream, count: behind },
          ),
      msg('  (use "git pull" to update your local branch)'),
    ].join('\n')
  }
  return [
    msg("Your branch and '{upstream}' have diverged,", { upstream }),
    msg('and have {ahead} and {behind} different commits each, respectively.', { ahead, behind }),
    msg('  (use "git pull" to merge the remote branch into yours)'),
  ].join('\n')
}

export function gitStatus(world, args) {
  const repo = world.repo
  const unknown = args.find((arg) => arg.startsWith('-'))
  if (unknown) {
    throw gitError(
      [
        msg("error: unknown option `{name}'", { name: unknown.replace(/^-+/, '') }),
        msg('usage: git status [--] <pathspec>...'),
      ].join('\n'),
      'hint.statusUnknownOption',
      { name: unknown },
    )
  }

  const status = computeStatus(world)
  const lines = [branchHeadline(repo)]
  const upstream = upstreamHeadline(repo)
  if (upstream) lines.push(upstream)
  if (!headCommitId(repo) && repo.head.type === 'branch') {
    lines.push('', msg('No commits yet'))
  }

  if (status.staged.length > 0) {
    lines.push('', msg('Changes to be committed:'))
    lines.push(msg('  (use "git restore --staged <file>..." to unstage)'))
    lines.push(...status.staged.map((entry) => green(formatEntry(entry))))
  }

  if (status.conflicted.length > 0) {
    lines.push('', msg('Unmerged paths:'))
    lines.push(msg('  (use "git add <file>..." to mark resolution)'))
    lines.push(...status.conflicted.map((name) => red(formatConflict(name))))
  }

  if (status.notStaged.length > 0) {
    lines.push('', msg('Changes not staged for commit:'))
    lines.push(msg('  (use "git add <file>..." to update what will be committed)'))
    lines.push(msg('  (use "git restore <file>..." to discard changes in working directory)'))
    lines.push(...status.notStaged.map((entry) => red(formatEntry(entry))))
  }

  if (status.untracked.length > 0) {
    lines.push('', msg('Untracked files:'))
    lines.push(msg('  (use "git add <file>..." to include in what will be committed)'))
    lines.push(...status.untracked.map((name) => red(`\t${name}`)))
  }

  lines.push('')
  if (status.conflicted.length > 0) {
    lines.push(msg('You have unmerged paths.'))
  } else if (status.staged.length > 0) {
    lines.pop()
  } else if (status.notStaged.length > 0) {
    lines.push(msg('no changes added to commit (use "git add" and/or "git commit -a")'))
  } else if (status.untracked.length > 0) {
    lines.push(
      msg('nothing added to commit but untracked files present (use "git add" to track)'),
    )
  } else {
    lines.push(msg('nothing to commit, working tree clean'))
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
      [
        msg('Nothing specified, nothing added.'),
        msg("hint: Maybe you wanted to say 'git add .'?"),
      ].join('\n'),
      'hint.addNeedsPath',
    )
  }

  const targets = expandPaths(world, flagged ? ['.'] : paths)
  for (const name of targets) {
    if (!Object.hasOwn(world.files, name) && !Object.hasOwn(repo.index, name)) {
      throw gitError(
        msg("fatal: pathspec '{name}' did not match any files", { name }),
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
        msg('fatal: you must specify path(s) to restore'),
        '',
        msg('usage: git restore [--staged] <pathspec>...'),
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
          msg("error: pathspec '{name}' did not match any file(s) known to git", { name }),
          'hint.restoreUntracked',
          { name },
        )
      }
      world.files[name] = repo.index[name]
    }
  }
  return []
}
