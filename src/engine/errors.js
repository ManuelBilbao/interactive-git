/**
 * An error that reads exactly like the one real git prints.
 *
 * `message` stays in English on purpose: it is what the student will see in a
 * real terminal, and learning to read it is half of learning git. The
 * translated, friendly explanation travels next to it as `hintKey`, and the UI
 * renders it as a separate card.
 */
export class GitError extends Error {
  constructor(message, hintKey, hintParams = {}) {
    super(message)
    this.name = 'GitError'
    this.hintKey = hintKey
    this.hintParams = hintParams
  }
}

export function gitError(message, hintKey, hintParams) {
  return new GitError(message, hintKey, hintParams)
}
