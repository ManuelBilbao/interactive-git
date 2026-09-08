// Progress lives in localStorage. Every access is guarded because private
// windows and blocked site data make these calls throw.

const KEY = 'git-interactivo:progress'

export function loadProgress() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { completed: [], lesson: 0 }
    const parsed = JSON.parse(raw)
    return {
      completed: Array.isArray(parsed.completed) ? parsed.completed : [],
      lesson: Number.isInteger(parsed.lesson) ? parsed.lesson : 0,
    }
  } catch {
    return { completed: [], lesson: 0 }
  }
}

export function saveProgress(progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress))
  } catch {
    // Losing the progress is a nuisance, never a reason to break the page.
  }
}

const PARAM = 'leccion'

/** Reads `?leccion=3` so a lesson can be linked to directly. */
export function lessonFromUrl(total) {
  if (typeof window === 'undefined') return null
  const raw = new URLSearchParams(window.location.search).get(PARAM)
  const parsed = Number.parseInt(raw ?? '', 10)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > total) return null
  return parsed - 1
}

/** Keeps that URL in sync as the student moves through the course. */
export function writeLessonToUrl(index) {
  if (typeof window === 'undefined' || !window.history?.replaceState) return
  const url = new URL(window.location.href)
  url.searchParams.set(PARAM, String(index + 1))
  window.history.replaceState(null, '', url)
}

const TOUR_KEY = 'git-interactivo:tour-seen'

/** The tour runs itself once, on a first visit, and then stays out of the way. */
export function hasSeenTour() {
  try {
    return localStorage.getItem(TOUR_KEY) === 'true'
  } catch {
    // If storage is blocked, better to skip the tour than to show it forever.
    return true
  }
}

export function markTourSeen() {
  try {
    localStorage.setItem(TOUR_KEY, 'true')
  } catch {
    // Nothing worth failing over.
  }
}
