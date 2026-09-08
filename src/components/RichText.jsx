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
