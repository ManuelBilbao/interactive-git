// Translating what git prints, the way git itself does it.
//
// Real git wraps every message in gettext's `_()` and looks it up in a
// catalogue chosen by the LANG environment variable. This is the same idea:
// `msg()` takes the English text, and the English text *is* the key, so a
// missing translation degrades to English instead of to a raw identifier.
//
// The catalogue is process-wide, exactly like git's locale. `setMessages`
// swaps it; passing `null` goes back to git's own English.

let catalogue = null

export function setMessages(messages) {
  catalogue = messages ?? null
}

export function currentMessages() {
  return catalogue
}

/** Looks `text` up in `messages` and fills in `{name}` placeholders. */
export function translateWith(messages, text, params = {}) {
  const template = messages?.[text] ?? text
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  )
}

/** One line of git output, in whatever language the catalogue is in. */
export function msg(text, params = {}) {
  return translateWith(catalogue, text, params)
}
