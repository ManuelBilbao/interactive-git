import { useState } from 'react'

import { headTree } from '../engine/model.js'
import { computeStatus } from '../engine/status.js'
import { useI18n } from '../i18n/index.jsx'
import RichText from './RichText.jsx'

/** The badges each file carries: untracked, staged, modified, conflict... */
function describeFiles(world) {
  const names = new Set(Object.keys(world.files))
  const badges = new Map([...names].map((name) => [name, []]))

  if (world.repo) {
    const status = computeStatus(world)
    for (const name of Object.keys(headTree(world.repo))) names.add(name)
    for (const name of Object.keys(world.repo.index)) names.add(name)
    for (const name of names) if (!badges.has(name)) badges.set(name, [])

    for (const name of status.untracked) badges.get(name).push('untracked')
    for (const entry of status.staged) badges.get(entry.name).push('staged')
    for (const entry of status.notStaged) badges.get(entry.name).push('modified')
    for (const name of status.conflicted) badges.get(name).push('conflict')
    for (const [name, list] of badges) if (list.length === 0) list.push('committed')
  }

  return [...names].sort().map((name) => ({
    name,
    exists: Object.hasOwn(world.files, name),
    content: world.files[name] ?? '',
    badges: badges.get(name) ?? [],
  }))
}

export default function FilesPanel({ world, onEdit, onCreate, onDelete }) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState('')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)

  const files = describeFiles(world)

  const startEditing = (file) => {
    setEditing(file.name)
    setDraft(file.content)
  }

  const save = () => {
    onEdit(editing, draft)
    setEditing(null)
  }

  const create = (event) => {
    event.preventDefault()
    const name = newName.trim()
    if (name === '') return
    if (Object.hasOwn(world.files, name)) {
      setError(t('files.duplicate'))
      return
    }
    onCreate(name)
    setNewName('')
    setCreating(false)
    setError(null)
  }

  return (
    <section className="panel files-panel">
      <h2 className="panel-title">{t('files.title')}</h2>

      {files.length === 0 && <p className="empty">{t('files.empty')}</p>}

      <ul className="file-list">
        {files.map((file) => (
          <li key={file.name} className="file">
            <div className="file-head">
              <span className="file-name">{file.name}</span>
              <span className="file-badges">
                {file.badges.map((badge) => (
                  <span key={badge} className={`badge badge-${badge}`}>
                    {t(`state.${badge}`)}
                  </span>
                ))}
                {!file.exists && <span className="badge badge-deleted">{t('state.deleted')}</span>}
              </span>
            </div>

            {editing === file.name ? (
              <div className="file-editor">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={t('files.contentPlaceholder')}
                  rows={Math.min(10, Math.max(3, draft.split('\n').length + 1))}
                  aria-label={file.name}
                />
                <div className="file-actions">
                  <button type="button" className="primary" onClick={save}>
                    {t('files.save')}
                  </button>
                  <button type="button" onClick={() => setEditing(null)}>
                    {t('files.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {file.exists && file.content !== '' && <pre className="file-preview">{file.content}</pre>}
                {file.exists && (
                  <div className="file-actions">
                    <button type="button" onClick={() => startEditing(file)}>
                      {t('files.edit')}
                    </button>
                    <button type="button" onClick={() => onDelete(file.name)}>
                      {t('files.delete')}
                    </button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      {creating ? (
        <form className="file-create" onSubmit={create}>
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder={t('files.namePlaceholder')}
            aria-label={t('files.new')}
            autoFocus
          />
          <button type="submit" className="primary">
            {t('files.create')}
          </button>
          <button type="button" onClick={() => { setCreating(false); setError(null) }}>
            {t('files.cancel')}
          </button>
          {error && <p className="warning">{error}</p>}
        </form>
      ) : (
        <button type="button" className="block ghost" onClick={() => setCreating(true)}>
          + {t('files.new')}
        </button>
      )}

      <RichText className="legend" text={t('files.legend')} />
    </section>
  )
}
