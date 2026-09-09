// Analytics: four numbers, and deliberately no more.
//
//   - how many people use the site, which is the page view GoatCounter sends
//     by itself on load;
//   - how many of them finish each lesson,
//   - how many hints they opened first,
//   - and how long the lesson took them.
//
// The last three are one event each, sent together the first time a person
// reaches a goal. GoatCounter events are paths and nothing else — there is no
// numeric property to put a duration in — so the value travels in the path:
// `pistas/03-add/2-de-4`, `tiempo/03-add/4-2-5m`. That is what decides the
// shape of everything below.
//
// GoatCounter sets no cookies and stores nothing that identifies a person, so
// the site needs no consent banner, and the script is ~3KB. Nothing here ever
// sends what a student typed, which files they wrote or which commands failed.
//
// Every call is guarded. A blocked script, a private window or a locked-down
// localStorage must cost the student nothing.

/**
 * The subdomain of the GoatCounter site, the `xxx` of `https://xxx.goatcounter.com`.
 *
 * Empty turns analytics off entirely — no script, no requests — which is what a
 * fork of this repository wants, and what `npm run dev` gets for free anyway:
 * GoatCounter's own script refuses to count on localhost.
 */
const SITE = 'manuelbilbao'

const SCRIPT = 'https://gc.zgo.at/count.js'

/** The lessons this browser has already been counted for, across visits. */
const SENT_KEY = 'git-interactivo:analytics-sent'

function readSent() {
  try {
    const raw = localStorage.getItem(SENT_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeSent(paths) {
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify([...paths]))
  } catch {
    // Not remembering means one lesson gets counted twice for this person.
    // That is a rounding error; a thrown exception is a broken page.
  }
}

// Held in memory as well as in storage, so a lesson cannot be sent twice within
// a session while the script is still loading.
const sent = new Set(readSent())

let state = 'idle' // idle | loading | ready | off
let pending = []

/**
 * Loads GoatCounter and lets it send the page view.
 *
 * The page view is what counts unique visitors, so this runs once when the site
 * opens, not when a lesson is finished.
 */
export function initAnalytics() {
  if (state !== 'idle') return
  if (!SITE || typeof window === 'undefined' || typeof document === 'undefined') {
    state = 'off'
    return
  }
  state = 'loading'

  // `?leccion=N` is a deep link into the same page, not twenty-two pages. Left
  // alone, GoatCounter would count the query string as part of the path and the
  // dashboard would open on one row per lesson instead of one row per site.
  window.goatcounter = { path: () => window.location.pathname }

  const script = document.createElement('script')
  script.async = true
  script.src = SCRIPT
  script.dataset.goatcounter = `https://${SITE}.goatcounter.com/count`
  script.addEventListener('load', () => {
    state = 'ready'
    const queued = pending
    pending = []
    for (const vars of queued) dispatch(vars)
  })
  script.addEventListener('error', () => {
    // An ad blocker, an offline machine, a school firewall. All fine.
    state = 'off'
    pending = []
  })
  document.head.append(script)
}

function dispatch({ remember, ...vars }) {
  try {
    window.goatcounter.count(vars)
    // Only the completion path is written down, and only once it has actually
    // been handed over: an event lost to a blocked script has to be sent again
    // on the next visit, not silently marked as counted.
    if (remember) {
      sent.add(vars.path)
      writeSent(sent)
    }
  } catch {
    // Analytics is never a reason to break the page.
  }
}

function send(vars) {
  initAnalytics()
  if (state === 'off') return
  if (state === 'ready') dispatch(vars)
  else pending.push(vars)
}

/**
 * How long the current lesson has been open, ignoring time the tab spent in the
 * background.
 *
 * A wall clock would answer "how long does lesson 3 take?" with the lunch break
 * of whoever left the tab open, and that is the one question this metric exists
 * to answer.
 */
let elapsedMs = 0
let startedAt = null // null while the clock is paused
let watching = false

function hidden() {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

function pause() {
  if (startedAt === null) return
  elapsedMs += Math.max(0, Date.now() - startedAt)
  startedAt = null
}

function watchVisibility() {
  if (watching || typeof document === 'undefined' || !document.addEventListener) return
  watching = true
  document.addEventListener('visibilitychange', () => {
    if (hidden()) pause()
    else if (startedAt === null) startedAt = Date.now()
  })
}

/** Restarts the clock: a new lesson, or the same one started over. */
export function startLessonTimer() {
  watchVisibility()
  elapsedMs = 0
  startedAt = hidden() ? null : Date.now()
}

function activeMs() {
  return elapsedMs + (startedAt === null ? 0 : Math.max(0, Date.now() - startedAt))
}

/**
 * The buckets a duration is reported in.
 *
 * A duration cannot be a path, so it has to land in one of these. They are
 * numbered because the label is all GoatCounter stores: without the number the
 * rows would sort `1-2m`, `10-20m`, `2-5m` and read as nonsense.
 */
const BUCKETS = [
  [30, '1-hasta-30s'],
  [60, '2-30s-1m'],
  [120, '3-1-2m'],
  [300, '4-2-5m'],
  [600, '5-5-10m'],
  [1200, '6-10-20m'],
]
const LONGEST = '7-mas-20m'

export function timeBucket(ms) {
  const seconds = Math.max(0, ms) / 1000
  for (const [limit, label] of BUCKETS) if (seconds < limit) return label
  return LONGEST
}

/**
 * The lesson's own part of a path, for example `03-add`.
 *
 * The number goes first so an exported CSV sorts into the order the course is
 * taught, and the id goes after it so a row stays readable — and stays
 * recognisable — if the course is ever reordered.
 */
function slug(id, position) {
  return `${String(position + 1).padStart(2, '0')}-${id}`
}

/** Exported so a test can assert that no two lessons share a row. */
export function lessonPath(id, position) {
  return `leccion/${slug(id, position)}`
}

/**
 * `pistas/03-add/2-de-4`.
 *
 * The total is part of the label because the count alone does not mean anything
 * on its own: two hints is halfway through a lesson that has four and the
 * revealed solution in a lesson that has two.
 */
export function hintsPath(id, position, shown, available) {
  return `pistas/${slug(id, position)}/${shown}-de-${available}`
}

/** `tiempo/03-add/4-2-5m`. */
export function timePath(id, position, ms) {
  return `tiempo/${slug(id, position)}/${timeBucket(ms)}`
}

/**
 * Records that this person finished a lesson, once and only once, along with
 * what it cost them to get there.
 *
 * The metric asked for is how many people got this far, not how many times
 * somebody replayed a lesson, so a repeat is dropped here rather than counted
 * and divided out later. That gate covers the hints and the time too: a second
 * run through a lesson already answers a different question, and averaging it
 * in would flatter every one of them. Resetting the progress does not clear
 * this either: they did reach it.
 */
export function trackLessonCompleted(id, position, { hints, hintsAvailable } = {}) {
  const path = lessonPath(id, position)
  if (sent.has(path)) return
  // Claimed up front: two commands can solve a lesson before the script lands.
  sent.add(path)

  const ms = activeMs()
  send({ path, event: true, remember: true })
  if (Number.isInteger(hints) && Number.isInteger(hintsAvailable)) {
    send({ path: hintsPath(id, position, hints, hintsAvailable), event: true })
  }
  send({ path: timePath(id, position, ms), event: true })
}
