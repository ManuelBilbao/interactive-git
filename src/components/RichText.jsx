import { Fragment } from 'react'

// The lesson texts use two bits of markdown and nothing else: `code` and
// **bold**. Rendering them by hand keeps the project dependency-free.
const PATTERN = /(`[^`]+`|\*\*[^*]+\*\*)/g

export default function RichText({ text, as: Tag = 'p', className }) {
  const parts = String(text).split(PATTERN).filter((part) => part !== '')

  return (
    <Tag className={className}>
      {parts.map((part, index) => {
        const key = `${index}-${part}`
        if (part.startsWith('`') && part.endsWith('`')) {
          return <code key={key}>{part.slice(1, -1)}</code>
        }
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={key}>{part.slice(2, -2)}</strong>
        }
        return <Fragment key={key}>{part}</Fragment>
      })}
    </Tag>
  )
}
