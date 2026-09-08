// How each hint should be presented.
//
// A hint most often accompanies something git refused to do, so an unlisted
// one is an error when the command failed and information when it did not.
// The exceptions are worth naming: help is information, a "did you mean" is a
// suggestion, and a conflicted merge is neither — it worked, and it left work
// to do.

const KINDS = {
  'hint.gitHelp': 'info',
  'hint.shellHelp': 'info',
  'hint.reducedHelp': 'info',
  'hint.unknownGitCommandDidYouMean': 'tip',
  'hint.unknownCommandDidYouMean': 'tip',
  'hint.mergeConflict': 'warn',
}

export const HINT_KINDS = ['error', 'warn', 'info', 'tip']

export function hintKind(key, failed) {
  if (!key) return null
  return KINDS[key] ?? (failed ? 'error' : 'info')
}
