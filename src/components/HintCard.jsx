import { useI18n } from '../i18n/index.jsx'
import RichText from './RichText.jsx'

/**
 * The friendly half of an error. It sits in the terminal transcript, directly
 * under the command it explains: git's own wording above, what to do about it
 * right below, and both scroll away together as the session goes on.
 */
export default function HintCard({ hintKey, params }) {
  const { t } = useI18n()
  const text = t(hintKey, params ?? {})

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
