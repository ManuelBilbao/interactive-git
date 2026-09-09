// Analytics is a page view plus three events per finished lesson. What matters
// here is that the counters are distinct and readable, that nobody is counted
// twice, and that a browser which never loads the script is left alone.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { LESSONS } from '../src/lessons/index.js'

const source = readFileSync(new URL('../src/analytics.js', import.meta.url), 'utf8')

const SENT_KEY = 'git-interactivo:analytics-sent'

// A module instance of its own for the pure path helpers, imported before any
// browser is faked: reading them must not depend on there being a page.
const { lessonPath } = await import('../src/analytics.js?paths')
const lessonPathOf = (lesson, position) => lessonPath(lesson.id, position)

/**
 * A fresh copy of the module, with a browser built around it.
 *
 * The module keeps its loading state and its "already counted" set in module
 * scope, exactly as it does in a page, so each scenario needs its own import.
 * `store` is passed in when a test wants a second visit from the same browser.
 */
let instances = 0
async function open({ store = new Map(), blocked = false } = {}) {
  const counted = []
  const listeners = {}

  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
  }
  globalThis.window = { location: { pathname: '/interactive-git/', search: '' } }
  globalThis.document = {
    visibilityState: 'visible',
    addEventListener() {},
    createElement: () => ({
      dataset: {},
      addEventListener(type, fn) {
        listeners[type] = fn
      },
    }),
    head: { append: (node) => (globalThis.document.script = node) },
  }

  instances += 1
  const analytics = await import(`../src/analytics.js?instance=${instances}`)
  analytics.initAnalytics()

  return {
    ...analytics,
    counted,
    store,
    script: () => globalThis.document.script,
    /** The CDN answers — or an ad blocker eats the request. */
    settle() {
      if (blocked) return listeners.error()
      globalThis.window.goatcounter.count = (vars) => counted.push(vars.path)
      listeners.load()
    },
  }
}

test('the site is a bare subdomain, not a URL that would be requested twice', () => {
  const site = source.match(/^const SITE = '([^']*)'$/m)
  assert.ok(site, 'SITE is not declared as a plain string constant')
  assert.ok(site[1], 'SITE is empty, so nothing is being counted')
  assert.doesNotMatch(site[1], /[:/]/, 'SITE takes the subdomain alone, without a scheme or a path')
})

test('the page view is counted for the bare path, without ?leccion=N', async () => {
  const analytics = await open()
  assert.equal(analytics.script().dataset.goatcounter, 'https://manuelbilbao.goatcounter.com/count')
  globalThis.window.location.search = '?leccion=12'
  assert.equal(globalThis.window.goatcounter.path(), '/interactive-git/')
})

test('every lesson reports under its own path', () => {
  const paths = LESSONS.map((lesson, position) => lessonPathOf(lesson, position))
  assert.equal(new Set(paths).size, LESSONS.length)
})

test('the paths sort into the order the course is taught', () => {
  const paths = LESSONS.map((lesson, position) => lessonPathOf(lesson, position))
  assert.deepEqual([...paths].sort(), paths)
})

test('a finished lesson sends completion, hints and time', async () => {
  const analytics = await open()
  analytics.trackLessonCompleted('add', 2, { hints: 2, hintsAvailable: 4 })
  analytics.settle()
  assert.deepEqual(analytics.counted, [
    'leccion/03-add',
    'pistas/03-add/2-de-4',
    'tiempo/03-add/1-hasta-30s',
  ])
})

test('events raised before the script lands are not lost', async () => {
  const analytics = await open()
  analytics.trackLessonCompleted('init', 0, { hints: 0, hintsAvailable: 2 })
  assert.deepEqual(analytics.counted, [], 'nothing can be sent before the script exists')
  analytics.settle()
  assert.equal(analytics.counted.length, 3)
})

test('replaying a lesson counts nobody twice', async () => {
  const analytics = await open()
  analytics.settle()
  analytics.trackLessonCompleted('add', 2, { hints: 0, hintsAvailable: 4 })
  analytics.trackLessonCompleted('add', 2, { hints: 4, hintsAvailable: 4 })
  assert.deepEqual(analytics.counted, [
    'leccion/03-add',
    'pistas/03-add/0-de-4',
    'tiempo/03-add/1-hasta-30s',
  ])
})

test('coming back another day counts nobody twice either', async () => {
  const first = await open()
  first.settle()
  first.trackLessonCompleted('add', 2, { hints: 1, hintsAvailable: 4 })
  assert.deepEqual(JSON.parse(first.store.get(SENT_KEY)), ['leccion/03-add'])

  const second = await open({ store: first.store })
  second.settle()
  second.trackLessonCompleted('add', 2, { hints: 1, hintsAvailable: 4 })
  second.trackLessonCompleted('commit', 3, { hints: 0, hintsAvailable: 3 })
  assert.deepEqual(second.counted, [
    'leccion/04-commit',
    'pistas/04-commit/0-de-3',
    'tiempo/04-commit/1-hasta-30s',
  ])
})

test('a blocked script records nothing, so the next visit still counts', async () => {
  const analytics = await open({ blocked: true })
  analytics.settle()
  analytics.trackLessonCompleted('add', 2, { hints: 1, hintsAvailable: 4 })
  assert.deepEqual(analytics.counted, [])
  assert.equal(analytics.store.get(SENT_KEY), undefined)
})

test('a duration lands in the bucket it belongs to', async () => {
  const { timeBucket } = await open()
  const cases = [
    [0, '1-hasta-30s'],
    [29_999, '1-hasta-30s'],
    [30_000, '2-30s-1m'],
    [60_000, '3-1-2m'],
    [120_000, '4-2-5m'],
    [300_000, '5-5-10m'],
    [600_000, '6-10-20m'],
    [1_200_000, '7-mas-20m'],
    [9_000_000, '7-mas-20m'],
  ]
  for (const [ms, label] of cases) assert.equal(timeBucket(ms), label, `${ms}ms`)
  // A clock that jumped backwards must not invent a negative duration.
  assert.equal(timeBucket(-5000), '1-hasta-30s')
})

test('the buckets read in ascending order once sorted', async () => {
  const { timeBucket } = await open()
  const labels = [0, 30_000, 60_000, 120_000, 300_000, 600_000, 1_200_000].map(timeBucket)
  assert.deepEqual([...labels].sort(), labels)
})

test('a path names the lesson it counts', () => {
  assert.equal(lessonPath('add', 2), 'leccion/03-add')
  assert.equal(lessonPath('final', 21), 'leccion/22-final')
})
