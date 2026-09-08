import { useI18n } from '../i18n/index.jsx'
import RichText from './RichText.jsx'

/**
 * The friendly half of an error: git's own wording stays in the terminal, and
 * the explanation of what to do about it shows up here.
 */
export default function HintCard({ hint }) {
  const { t } = useI18n()
  if (!hint) return null

  const text = t(hint.key, hint.params ?? {})
  return (
    <aside className="hint-card">
      <span className="hint-card-title">{t('terminal.hintTitle')}</span>
      {text.split('\n').map((line, index) =>
        line === '' ? (
          // eslint-disable-next-line react/no-array-index-key
          <br key={`br-${index}`} />
        ) : (
          <RichText key={line} text={line} />
        ),
      )}
    </aside>
  )
}
