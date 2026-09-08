import { Fragment, useEffect, useRef, useState } from 'react'

import { parseAnsi } from '../ansi.js'
import { useI18n } from '../i18n/index.jsx'
import HintCard from './HintCard.jsx'
import RichText from './RichText.jsx'

/** Renders one line of command output, honouring the colours git asked for. */
function AnsiLine({ text }) {
  const segments = parseAnsi(text)
  // A non-breaking space keeps git's blank separator lines visible.
  if (segments.length === 0) return '\u00a0'

  return segments.map((segment, position) => {
    const classes = [segment.color && `ansi-${segment.color}`, segment.bold && 'ansi-bold']
      .filter(Boolean)
      .join(' ')
    // Segments have no identity of their own, so position is the only key.
    const key = `${position}-${segment.text}`
    return classes === '' ? (
      <Fragment key={key}>{segment.text}</Fragment>
    ) : (
      <span key={key} className={classes}>
        {segment.text}
      </span>
    )
  })
}

export default function Terminal({ entries, folder, branch, onSubmit, onClear }) {
  const { t, tList } = useI18n()
  const [draft, setDraft] = useState('')
  const [recalled, setRecalled] = useState(null)
  const inputRef = useRef(null)
  const bottomRef = useRef(null)

  const typed = entries.filter((entry) => entry.type === 'command').map((entry) => entry.text)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [entries])

  const submit = (event) => {
    event.preventDefault()
    if (draft.trim() === '') return
    onSubmit(draft)
    setDraft('')
    setRecalled(null)
  }

  /** Up and down walk through what was typed before, like a real shell. */
  const recall = (event) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    if (typed.length === 0) return
    event.preventDefault()
    const position = recalled === null ? typed.length : recalled
    const next =
      event.key === 'ArrowUp'
        ? Math.max(0, position - 1)
        : Math.min(typed.length, position + 1)
    setRecalled(next)
    setDraft(next === typed.length ? '' : typed[next])
  }

  return (
    <section className="panel terminal-panel">
      <h2 className="panel-title">
        {t('terminal.title')}
        <span className="terminal-meta">
          <span className="terminal-where">
            {folder}
            {branch && (
              <>
                {' '}
                <b>⎇ {branch}</b>
              </>
            )}
          </span>
          {entries.length > 0 && (
            <button type="button" className="tiny ghost" onClick={onClear}>
              {t('terminal.clear')}
            </button>
          )}
        </span>
      </h2>
      <div className="terminal" onClick={() => inputRef.current?.focus()} role="presentation">
        <div className="terminal-welcome">
          {tList('terminal.welcome').map((line) => (
            <RichText key={line} text={line} />
          ))}
        </div>
        {entries.map((entry) =>
          entry.type === 'hint' ? (
            <HintCard
              key={entry.key}
              hintKey={entry.hintKey}
              params={entry.hintParams}
              kind={entry.hintKind}
            />
          ) : (
            <pre key={entry.key} className={`terminal-line terminal-${entry.type}`}>
              {entry.type === 'command' ? `$ ${entry.text}` : <AnsiLine text={entry.text} />}
            </pre>
          ),
        )}
        <form className="terminal-input" onSubmit={submit}>
          <span className="prompt">$</span>
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={recall}
            placeholder={t('terminal.placeholder')}
            aria-label={t('terminal.title')}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </form>
        <div ref={bottomRef} />
      </div>
    </section>
  )
}
