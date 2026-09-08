import { createContext, useCallback, useContext, useMemo, useState } from 'react'

import { AVAILABLE_LOCALES, DEFAULT_LOCALE, LOCALES } from './locales/index.js'

const STORAGE_KEY = 'git-interactivo:locale'
const I18nContext = createContext(null)

function readStoredLocale() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && AVAILABLE_LOCALES.includes(stored)) return stored
  } catch {
    // Private windows and blocked storage simply fall back to the default.
  }
  return DEFAULT_LOCALE
}

/** Walks a dotted key such as `lesson.goal` through the messages object. */
function lookup(messages, key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), messages)
}

function interpolate(text, params) {
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  )
}

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(readStoredLocale)

  const setLocale = useCallback((next) => {
    setLocaleState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Not being able to remember the choice is not worth an error.
    }
  }, [])

  const value = useMemo(() => {
    const messages = LOCALES[locale]?.messages ?? LOCALES[DEFAULT_LOCALE].messages
    const fallback = LOCALES[DEFAULT_LOCALE].messages

    const resolve = (key) => lookup(messages, key) ?? lookup(fallback, key)

    /** Translates a key. Missing keys surface as the key itself, never blank. */
    const t = (key, params = {}) => {
      const found = resolve(key)
      if (typeof found === 'string') return interpolate(found, params)
      if (found === undefined) return key
      return found
    }

    /** Translates a key whose value is a list of strings. */
    const tList = (key, params = {}) => {
      const found = resolve(key)
      if (!Array.isArray(found)) return []
      return found.map((item) => interpolate(item, params))
    }

    /** True when the key exists, so callers can skip optional sections. */
    const has = (key) => resolve(key) !== undefined

    return { locale, setLocale, t, tList, has, locales: LOCALES, available: AVAILABLE_LOCALES }
  }, [locale, setLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used inside <I18nProvider>')
  return context
}
