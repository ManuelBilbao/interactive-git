import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { setMessages, translateWith } from '../engine/messages.js'
import { AVAILABLE_LOCALES, DEFAULT_LOCALE, LOCALES } from './locales/index.js'

const LOCALE_KEY = 'git-interactivo:locale'
const I18nContext = createContext(null)

function read(key, fallback) {
  try {
    const stored = localStorage.getItem(key)
    return stored === null ? fallback : stored
  } catch {
    // Private windows and blocked storage simply fall back to the default.
    return fallback
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Not being able to remember the choice is not worth an error.
  }
}

function readStoredLocale() {
  const stored = read(LOCALE_KEY, null)
  return stored && AVAILABLE_LOCALES.includes(stored) ? stored : DEFAULT_LOCALE
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

/**
 * Lines of git output that the lesson texts quote. They are available to every
 * `t()` call as parameters, so a hint that points at a section of `git status`
 * quotes it in the same words the terminal just used, in any locale.
 */
function gitQuotes(catalogue) {
  const quote = (text) => translateWith(catalogue, text).replace(/:$/, '')
  return {
    gitUntracked: quote('Untracked files:'),
    gitToBeCommitted: quote('Changes to be committed:'),
    gitNotStaged: quote('Changes not staged for commit:'),
    gitClean: quote('nothing to commit, working tree clean'),
  }
}

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(readStoredLocale)

  const setLocale = useCallback((next) => {
    setLocaleState(next)
    write(LOCALE_KEY, next)
  }, [])

  const messages = LOCALES[locale]?.messages ?? LOCALES[DEFAULT_LOCALE].messages
  const gitCatalogue = messages.git ?? null

  // git picks its language from the environment; this is that environment.
  // Here the environment is simply the locale the site is running in.
  useEffect(() => {
    setMessages(gitCatalogue)
  }, [gitCatalogue])

  const value = useMemo(() => {
    const fallback = LOCALES[DEFAULT_LOCALE].messages
    const resolve = (key) => lookup(messages, key) ?? lookup(fallback, key)
    const quotes = gitQuotes(gitCatalogue)

    /** Translates a key. Missing keys surface as the key itself, never blank. */
    const t = (key, params = {}) => {
      const found = resolve(key)
      if (typeof found === 'string') return interpolate(found, { ...quotes, ...params })
      if (found === undefined) return key
      return found
    }

    /** Translates a key whose value is a list of strings. */
    const tList = (key, params = {}) => {
      const found = resolve(key)
      if (!Array.isArray(found)) return []
      return found.map((item) => interpolate(item, { ...quotes, ...params }))
    }

    /** True when the key exists, so callers can skip optional sections. */
    const has = (key) => resolve(key) !== undefined

    return {
      locale,
      setLocale,
      t,
      tList,
      has,
      locales: LOCALES,
      available: AVAILABLE_LOCALES,
    }
  }, [locale, setLocale, messages, gitCatalogue])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used inside <I18nProvider>')
  return context
}
