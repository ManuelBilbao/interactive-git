// `git diff`: what changed, as opposed to `git status`, which says which files
// changed.
//
// Which two things get compared is the whole subtlety of the command, and the
// reason a beginner runs it after `git add` and thinks it is broken:
//
//   git diff                   the folder against the staging area
//   git diff --staged          the staging area against the last commit
//   git diff <ref>             a commit or branch against the folder
//   git diff <ref> <ref>       one commit or branch against another

import { diffTrees } from '../diff.js'
import { gitError } from '../errors.js'
import { msg } from '../messages.js'
import { headTree, resolveRef, treeOf } from '../model.js'

function treeAtRef(repo, ref) {
  const commitId = resolveRef(repo, ref)
  if (!commitId) {
    throw gitError(
      [
        msg(
          "fatal: ambiguous argument '{name}': unknown revision or path not in the working tree.",
          { name: ref },
        ),
      ].join('\n'),
      'hint.diffUnknownRef',
      { name: ref },
    )
  }
  return treeOf(repo, commitId)
}

export function gitDiff(world, args) {
  const repo = world.repo
  const staged = args.includes('--staged') || args.includes('--cached')
  const refs = args.filter((arg) => !arg.startsWith('-'))

  let before
  let after
  if (refs.length >= 2) {
    before = treeAtRef(repo, refs[0])
    after = treeAtRef(repo, refs[1])
  } else if (refs.length === 1) {
    before = treeAtRef(repo, refs[0])
    after = staged ? repo.index : world.files
  } else if (staged) {
    before = headTree(repo)
    after = repo.index
  } else {
    before = repo.index
    after = world.files
  }

  const lines = diffTrees(before, after)

  // git prints nothing when there is nothing to show, which reads as a broken
  // command until somebody explains it. This is that somebody.
  if (lines.length === 0) {
    world.notice = {
      key: refs.length === 0 && !staged ? 'hint.diffNoChanges' : 'hint.diffNoDifferences',
    }
  }
  return lines
}
