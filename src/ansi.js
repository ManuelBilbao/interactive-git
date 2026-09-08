// Colour, carried the way a terminal actually carries it: ANSI escape codes.
//
// The engine emits them exactly where git does — the file names in
// `git status`, the branch list, the commit ids in `git log` — and the terminal
// component turns them back into spans. Command output stays a plain string, so
// it is still comparable in tests; `stripAnsi` gives the bare text back.

const ESC = ''

const CODES = {
  bold: 1,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
}

// A fresh regex per call, so a shared `lastIndex` can never surprise us.
const pattern = () => new RegExp(`${ESC}\\[([0-9;]*)m`, 'g')

/** Wraps text in one escape sequence. Combine names rather than nesting calls. */
export function paint(text, ...names) {
  const codes = names.map((name) => CODES[name]).join(';')
  return `${ESC}[${codes}m${text}${ESC}[m`
}

export const red = (text) => paint(text, 'red')
export const green = (text) => paint(text, 'green')
export const yellow = (text) => paint(text, 'yellow')
export const cyan = (text) => paint(text, 'cyan')

export function stripAnsi(text) {
  return text.replace(pattern(), '')
}

const RESET = { color: null, bold: false }

function applyCodes(state, raw) {
  let next = { ...state }
  for (const part of (raw === '' ? '0' : raw).split(';')) {
    const code = Number(part)
    if (code === 0) next = { ...RESET }
    else if (code === 1) next.bold = true
    else if (code === 22) next.bold = false
    else if (code === 39) next.color = null
    else {
      const name = Object.keys(CODES).find((key) => key !== 'bold' && CODES[key] === code)
      if (name) next.color = name
    }
  }
  return next
}

/**
 * Splits a line into runs that share the same colour.
 *
 * @returns {{text: string, color: string|null, bold: boolean}[]}
 */
export function parseAnsi(line) {
  const segments = []
  let state = { ...RESET }
  let index = 0

  for (const match of line.matchAll(pattern())) {
    if (match.index > index) {
      segments.push({ text: line.slice(index, match.index), ...state })
    }
    index = match.index + match[0].length
    state = applyCodes(state, match[1])
  }
  if (index < line.length) segments.push({ text: line.slice(index), ...state })
  return segments
}
