// Registry of available translations.
//
// Adding a language is a two-step job: drop a JSON file next to this one with
// the same keys as `es-AR.json`, then add it to the map below. Everything that
// reaches the student's eyes goes through `t()`, except the terminal output,
// which stays in git's own English on purpose (see docs/architecture.md).

import esAR from './es-AR.json'

export const DEFAULT_LOCALE = 'es-AR'

export const LOCALES = {
  'es-AR': { name: 'Español (rioplatense)', messages: esAR },
}

export const AVAILABLE_LOCALES = Object.keys(LOCALES)
