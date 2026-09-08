import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { useI18n } from '../i18n/index.jsx'
import RichText from './RichText.jsx'

/**
 * The guided tour: a spotlight over one region at a time.
 *
 * Steps name a region by selector rather than by ref, so the tour stays a leaf
 * component that no other component has to know about. A step whose element is
 * missing is skipped, which is what lets the same list work on the lessons that
 * have no server panel.
 */
const STEPS = [
  { id: 'welcome', selector: null },
  { id: 'lesson', selector: '.lesson-panel' },
  { id: 'terminal', selector: '.terminal' },
  { id: 'history', selector: '.graph-panel' },
  { id: 'files', selector: '.files-panel' },
  // Both reference panels at once: the habit being taught is to read the
  // situation before typing, and every lesson starts from a different one.
  { id: 'check', selector: '.rail' },
  { id: 'nav', selector: '.lesson-nav' },
]

const MARGIN = 14

/** Where to put the card: beside the region if it is tall, otherwise below. */
function place(target, card) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const clamp = (value, max) => Math.min(Math.max(MARGIN, value), Math.max(MARGIN, max))

  if (!target) {
    return { top: clamp((vh - card.height) / 2, vh - card.height - MARGIN), left: clamp((vw - card.width) / 2, vw - card.width - MARGIN) }
  }

  const below = target.top + target.height + MARGIN
  const above = target.top - card.height - MARGIN
  if (below + card.height + MARGIN <= vh) {
    return { top: below, left: clamp(target.left, vw - card.width - MARGIN) }
  }
  if (above >= MARGIN) {
    return { top: above, left: clamp(target.left, vw - card.width - MARGIN) }
  }

  // The region is too tall to sit above or below, so the card goes beside it.
  const right = target.left + target.width + MARGIN
  const left = right + card.width + MARGIN <= vw ? right : target.left - card.width - MARGIN
  return {
    top: clamp(target.top, vh - card.height - MARGIN),
    left: clamp(left, vw - card.width - MARGIN),
  }
}

function measure(selector) {
  if (!selector || typeof document === 'undefined') return null
  const element = document.querySelector(selector)
  if (!element) return null
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
}

export default function Tour({ onClose }) {
  const { t, tList } = useI18n()
  const [index, setIndex] = useState(0)
  const [layout, setLayout] = useState({ target: null, card: null })
  const cardRef = useRef(null)

  const steps = STEPS.filter((step) => step.selector === null || measure(step.selector))
  const step = steps[Math.min(index, steps.length - 1)]
  const isLast = index >= steps.length - 1

  const reposition = useCallback(() => {
    const target = measure(step.selector)
    const card = cardRef.current
    if (!card) return
    const size = { width: card.offsetWidth, height: card.offsetHeight }
    setLayout({ target, card: place(target, size) })
  }, [step])

  // useLayoutEffect so the card is measured and placed before the first paint.
  useLayoutEffect(() => {
    reposition()
    cardRef.current?.focus()
  }, [reposition])

  useEffect(() => {
    window.addEventListener('resize', reposition)
    return () => window.removeEventListener('resize', reposition)
  }, [reposition])

  const back = useCallback(() => setIndex((current) => Math.max(0, current - 1)), [])
  const next = useCallback(
    () => (isLast ? onClose() : setIndex((current) => current + 1)),
    [isLast, onClose],
  )

  // On the window rather than on the card: the tour is modal, so the keys
  // should work wherever focus happens to have landed.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (!['Escape', 'ArrowRight', 'ArrowLeft'].includes(event.key)) return
      event.preventDefault()
      if (event.key === 'Escape') onClose()
      else if (event.key === 'ArrowRight') next()
      else back()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, next, back])

  const key = `tour.steps.${step.id}`

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {/* Swallows every click without doing anything with it. The tour is left
          on purpose, through its own buttons, and not by clicking past it. */}
      <div className="tour-catcher" aria-hidden="true" />
      {layout.target ? (
        <div
          className="tour-hole"
          style={{
            top: layout.target.top - 4,
            left: layout.target.left - 4,
            width: layout.target.width + 8,
            height: layout.target.height + 8,
          }}
        />
      ) : (
        <div className="tour-veil" />
      )}

      <div
        className="tour-card"
        ref={cardRef}
        tabIndex={-1}
        style={layout.card ? { top: layout.card.top, left: layout.card.left } : { visibility: 'hidden' }}
      >
        <p className="tour-step">{t('tour.step', { current: index + 1, total: steps.length })}</p>
        <h2 className="tour-title" id="tour-title">
          {t(`${key}.title`)}
        </h2>
        {tList(`${key}.body`).map((paragraph) => (
          <RichText key={paragraph} text={paragraph} className="tour-body" />
        ))}

        <div className="tour-actions">
          <button type="button" className="ghost" onClick={onClose}>
            {t('tour.skip')}
          </button>
          <span className="tour-spacer" />
          {index > 0 && (
            <button type="button" onClick={back}>
              ← {t('tour.back')}
            </button>
          )}
          <button type="button" className="primary" onClick={next}>
            {isLast ? t('tour.done') : `${t('tour.next')} →`}
          </button>
        </div>
      </div>
    </div>
  )
}
