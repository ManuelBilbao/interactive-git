// Splits a command line into tokens, honouring single and double quotes so
// that `git commit -m "mi primer commit"` arrives as four tokens.

import { gitError } from './errors.js'

export function tokenize(line) {
  const tokens = []
  let current = ''
  let quote = null
  let started = false

  const push = () => {
    if (started) tokens.push(current)
    current = ''
    started = false
  }

  for (const char of line) {
    if (quote) {
      if (char === quote) quote = null
      else current += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      started = true
      continue
    }
    if (/\s/.test(char)) {
      push()
      continue
    }
    // Redirections are their own tokens even without surrounding spaces.
    if (char === '>') {
      if (current === '>') {
        current = '>>'
        continue
      }
      push()
      current = '>'
      started = true
      continue
    }
    if (started && (current === '>' || current === '>>')) push()
    current += char
    started = true
  }
  if (quote) {
    throw gitError('bash: unexpected EOF while looking for matching quote', 'hint.unclosedQuote')
  }
  push()
  return tokens
}

/** Separates `-a --long` style flags from positional arguments. */
export function parseFlags(args) {
  const flags = new Set()
  const positional = []
  for (const arg of args) {
    if (arg.startsWith('--')) flags.add(arg)
    else if (arg.startsWith('-') && arg.length > 1) {
      // `-am` means the same as `-a -m` in git, so short flags are split.
      for (const letter of arg.slice(1)) flags.add(`-${letter}`)
    } else positional.push(arg)
  }
  return { flags, positional }
}

/** Reads the value of `-m`/`--message` from the raw argument list. */
export function readOption(args, ...names) {
  for (let i = 0; i < args.length; i += 1) {
    if (names.includes(args[i])) return args[i + 1] ?? null
  }
  return undefined
}
