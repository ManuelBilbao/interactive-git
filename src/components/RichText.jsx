import { Fragment } from 'react'

// The lesson texts use two bits of markdown and nothing else: `code` and
// **bold**, and a bold run may contain code. Rendering them by hand keeps the
// project dependency-free.
const BOLD = /(\*\*[^*]+\*\*)/g
const CODE = /(`[^`]+`)/g

function renderCode(text, prefix) {
  return text
    .split(CODE)
    .filter((part) => part !== '')
    .map((part, index) => {
      const key = `${prefix}-${index}`
      return part.startsWith('`') && part.endsWith('`') ? (
        <code key={key}>{part.slice(1, -1)}</code>
      ) : (
        <Fragment key={key}>{part}</Fragment>
      )
    })
}

// A ```fenced``` block, with an optional language tag that is ignored.
const FENCE = /```(?:\w+)?\n?([\s\S]*?)```/g

/**
 * Marks the slashes in a line as places it may wrap.
 *
 * A URL has no spaces, so without this the browser either overflows it or
 * splits it mid-word, and where exactly depends on the engine. Breaking after a
 * path separator is predictable and still reads as one URL.
 */
function withBreaks(line) {
  const parts = line.split('/')
  return parts.flatMap((part, index) =>
    index < parts.length - 1 ? [`${part}/`, <wbr key={index} />] : [part],
  )
}

/**
 * The block-level renderer: prose becomes paragraphs, and a fenced block
 * becomes a code block. A solution made of several commands reads as a list to
 * type, one per line, rather than as a run of inline snippets in a sentence.
 *
 * It returns siblings rather than wrapping them, so the caller keeps control of
 * the layout around them.
 */
export function RichBlocks({ text, className }) {
  return String(text)
    .split(FENCE)
    .map((part, index) => {
      const body = part.replace(/^\n+|\n+$/g, '')
      if (body === '') return null
      const key = `${index}-${body.slice(0, 16)}`
      // Odd positions are the capture groups, which are the fenced blocks.
      // One element per command, so a command too long for the column wraps
       // under itself instead of looking like a separate command.
      return index % 2 === 1 ? (
        <pre key={key} className="commands">
          {body.split('\n').map((line) => (
            <code key={line}>{withBreaks(line)}</code>
          ))}
        </pre>
      ) : (
        <RichText key={key} text={body} className={className} />
      )
    })
}

export default function RichText({ text, as: Tag = 'p', className }) {
  const parts = String(text)
    .split(BOLD)
    .filter((part) => part !== '')

  return (
    <Tag className={className}>
      {parts.map((part, index) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={`b-${index}`}>{renderCode(part.slice(2, -2), `b-${index}`)}</strong>
        ) : (
          <Fragment key={`t-${index}`}>{renderCode(part, `t-${index}`)}</Fragment>
        ),
      )}
    </Tag>
  )
}
