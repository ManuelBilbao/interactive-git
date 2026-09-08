import { useCallback, useEffect, useRef, useState } from 'react'

import FilesPanel from './components/FilesPanel.jsx'
import GraphView from './components/GraphView.jsx'
import LessonPanel from './components/LessonPanel.jsx'
import Terminal from './components/Terminal.jsx'
import { run } from './engine/commands/index.js'
import { useI18n } from './i18n/index.jsx'
import { LESSONS } from './lessons/index.js'
import { lessonFromUrl, loadProgress, saveProgress, writeLessonToUrl } from './storage.js'

const stored = loadProgress()
const initialLesson = lessonFromUrl(LESSONS.length) ?? Math.min(stored.lesson, LESSONS.length - 1)

export default function App() {
  const { t, locale, setLocale, locales, available, translateOutput, setTranslateOutput } =
    useI18n()

  const [index, setIndex] = useState(initialLesson)
  const [world, setWorld] = useState(() => LESSONS[initialLesson].setup())
  const [entries, setEntries] = useState([])
  const [history, setHistory] = useState([])
  const [hint, setHint] = useState(null)
  const [solved, setSolved] = useState(false)
  const [hintsShown, setHintsShown] = useState(0)
  const [completed, setCompleted] = useState(() => new Set(stored.completed))
  const entryId = useRef(0)

  const lesson = LESSONS[index]

  useEffect(() => {
    saveProgress({ completed: [...completed], lesson: index })
    writeLessonToUrl(index)
  }, [completed, index])

  const makeEntry = (type, text) => {
    entryId.current += 1
    return { key: entryId.current, type, text }
  }

  /** Re-checks the goal after anything that can change the world. */
  const evaluate = useCallback(
    (nextWorld, nextHistory) => {
      let reached = false
      try {
        reached = Boolean(lesson.check(nextWorld, nextHistory))
      } catch {
        // A half-built world must never take the whole page down.
        reached = false
      }
      if (!reached) return
      setSolved(true)
      setCompleted((previous) => new Set(previous).add(lesson.id))
    },
    [lesson],
  )

  const startLesson = useCallback((nextIndex) => {
    const target = Math.min(Math.max(nextIndex, 0), LESSONS.length - 1)
    setIndex(target)
    setWorld(LESSONS[target].setup())
    setEntries([])
    setHistory([])
    setHint(null)
    setSolved(false)
    setHintsShown(0)
  }, [])

  const handleCommand = (line) => {
    const step = run(world, line)
    const { output } = step

    if (output.clear) {
      setEntries([])
      setHint(null)
      return
    }

    setEntries((previous) => [
      ...previous,
      makeEntry('command', line),
      ...output.lines.map((text) => makeEntry(output.error ? 'error' : 'out', text)),
    ])
    setHint(output.hintKey ? { key: output.hintKey, params: output.hintParams } : null)

    if (output.error) return

    const nextHistory = [...history, line.trim()]
    setHistory(nextHistory)
    setWorld(step.world)
    evaluate(step.world, nextHistory)
  }

  /** Edits made from the Files panel, the equivalent of using a text editor. */
  const changeFiles = (change) => {
    const next = structuredClone(world)
    change(next.files)
    setWorld(next)
    evaluate(next, history)
  }

  const resetProgress = () => {
    setCompleted(new Set())
    startLesson(0)
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>{t('app.title')}</h1>
          <p>{t('app.subtitle')}</p>
        </div>
        <div className="header-actions">
          {available.length > 1 && (
            <label>
              {t('app.language')}{' '}
              <select value={locale} onChange={(event) => setLocale(event.target.value)}>
                {available.map((code) => (
                  <option key={code} value={code}>
                    {locales[code].name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="toggle">
            <input
              type="checkbox"
              checked={translateOutput}
              onChange={(event) => setTranslateOutput(event.target.checked)}
            />
            {t('app.translateOutput')}
          </label>
          <button type="button" onClick={resetProgress}>
            {t('nav.resetProgress')}
          </button>
        </div>
      </header>

      <main className="workspace">
        <LessonPanel
          lesson={lesson}
          index={index}
          completed={completed}
          solved={solved}
          hintsShown={hintsShown}
          onHint={() => setHintsShown((shown) => shown + 1)}
          onSelect={startLesson}
          onReset={() => startLesson(index)}
        />

        <div className="center">
          <GraphView world={world} />
          <Terminal entries={entries} hint={hint} onSubmit={handleCommand} />
        </div>

        <FilesPanel
          world={world}
          onEdit={(name, content) => changeFiles((files) => { files[name] = content })}
          onCreate={(name) => changeFiles((files) => { files[name] = '' })}
          onDelete={(name) => changeFiles((files) => { delete files[name] })}
        />
      </main>
    </div>
  )
}
