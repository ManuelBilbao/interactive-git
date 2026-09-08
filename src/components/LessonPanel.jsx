import { useI18n } from '../i18n/index.jsx'
import { LESSONS } from '../lessons/index.js'
import RichText from './RichText.jsx'

function LessonList({ current, completed, onSelect }) {
  const { t } = useI18n()

  return (
    <details className="lesson-list">
      <summary>{t('nav.lessons')}</summary>
      <ol>
        {LESSONS.map((lesson, index) => (
          <li key={lesson.id}>
            <button
              type="button"
              className={index === current ? 'lesson-link current' : 'lesson-link'}
              onClick={() => onSelect(index)}
            >
              <span className="lesson-number">{index + 1}</span>
              <span>{t(`lessons.${lesson.id}.title`)}</span>
              {completed.has(lesson.id) && <span className="check">✓</span>}
            </button>
          </li>
        ))}
      </ol>
    </details>
  )
}

export default function LessonPanel({
  lesson,
  index,
  completed,
  solved,
  hintsShown,
  onHint,
  onSelect,
  onReset,
}) {
  const { t, tList, has } = useI18n()
  const key = `lessons.${lesson.id}`
  const hints = tList(`${key}.hints`)
  const isLast = index === LESSONS.length - 1
  // The last hint spells out the command, so it is offered as what it is.
  const solutionAt = hints.length - 1
  const nextIsSolution = hintsShown === solutionAt

  return (
    <section className="panel lesson-panel">
      <LessonList current={index} completed={completed} onSelect={onSelect} />

      <p className="lesson-counter">
        {t('nav.lesson', { number: index + 1, total: LESSONS.length })}
      </p>
      <h2 className="lesson-title">{t(`${key}.title`)}</h2>

      {tList(`${key}.intro`).map((paragraph) => (
        <RichText key={paragraph} text={paragraph} className="lesson-intro" />
      ))}

      <div className="lesson-goal">
        <h3>{t('lesson.goal')}</h3>
        <RichText text={t(`${key}.goal`)} />
      </div>

      {has(`${key}.note`) && (
        <div className="lesson-note">
          <h3>{t('lesson.note')}</h3>
          <RichText text={t(`${key}.note`)} />
        </div>
      )}

      <div className="lesson-hints">
        {hints.slice(0, hintsShown).map((hint, position) => (
          <div key={hint} className={position === solutionAt ? 'hint solution' : 'hint'}>
            <span className="hint-title">
              {position === solutionAt
                ? t('lesson.solutionTitle')
                : t('lesson.hintTitle', { number: position + 1 })}
            </span>
            <RichText text={hint} />
          </div>
        ))}
        {hintsShown < hints.length ? (
          <button
            type="button"
            className={nextIsSolution ? 'block solution' : 'block'}
            onClick={onHint}
          >
            {/* The solution counts towards the total: it is the last hint, not
                something extra hiding behind them. */}
            {`${nextIsSolution ? t('lesson.solution') : t('lesson.hint')} (${
              hintsShown + 1
            }/${hints.length})`}
          </button>
        ) : (
          <p className="legend">{t('lesson.noMoreHints')}</p>
        )}
        <button type="button" className="block ghost reset" onClick={onReset}>
          {t('nav.reset')}
        </button>
      </div>

      {/* The footer is pinned, so when the goal is reached the banner and the
          way onwards are both in view without scrolling back down. */}
      <div className={solved ? 'lesson-nav solved' : 'lesson-nav'}>
        {solved && (
          <div className="lesson-solved">
            <h3>{isLast ? t('lesson.finished') : t('lesson.solved')}</h3>
            {isLast && <p>{t('lesson.finishedBody')}</p>}
          </div>
        )}
        <div className="lesson-steps">
          <button type="button" disabled={index === 0} onClick={() => onSelect(index - 1)}>
            ← {t('nav.previous')}
          </button>
          <button
            type="button"
            className={solved && !isLast ? 'primary' : undefined}
            disabled={isLast}
            onClick={() => onSelect(index + 1)}
          >
            {t('nav.next')} →
          </button>
        </div>
      </div>
    </section>
  )
}
