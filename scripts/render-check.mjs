// Renders the React components on the server for a handful of worlds.
//
// The engine has unit tests; this catches the other half: a component that
// throws on an empty repository, a graph with a merge commit, a conflict, or
// a remote panel. Run it with `npm run check:render`.

import { mkdirSync } from 'node:fs'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import esbuild from 'esbuild'

const root = new URL('..', import.meta.url).pathname
const outdir = `${root}node_modules/.render-check`
mkdirSync(outdir, { recursive: true })

// A DOM-free stand-in, so the storage helpers behave as in a locked-down browser.
globalThis.localStorage = {
  store: new Map(),
  getItem(key) {
    return this.store.get(key) ?? null
  },
  setItem(key, value) {
    this.store.set(key, String(value))
  },
}

await esbuild.build({
  stdin: {
    contents: `
      export { default as App } from './src/App.jsx'
      export { default as GraphView } from './src/components/GraphView.jsx'
      export { default as FilesPanel } from './src/components/FilesPanel.jsx'
      export { default as Terminal } from './src/components/Terminal.jsx'
      export { default as RichText } from './src/components/RichText.jsx'
      export { I18nProvider } from './src/i18n/index.jsx'
      export { run } from './src/engine/commands/index.js'
      export { LESSONS } from './src/lessons/index.js'
    `,
    resolveDir: root,
    loader: 'js',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react-dom/server', 'react/jsx-runtime'],
  outfile: `${outdir}/bundle.mjs`,
  logLevel: 'error',
})

const bundle = await import(`${outdir}/bundle.mjs`)
const { App, GraphView, FilesPanel, Terminal, RichText, I18nProvider, run, LESSONS } = bundle

const wrap = (element) => renderToString(h(I18nProvider, null, element))

/** Plays a script of commands and returns the resulting world. */
function play(world, lines) {
  return lines.reduce((current, line) => {
    const step = run(current, line)
    if (step.output.error) {
      throw new Error(`"${line}" failed: ${step.output.lines.join('\n')}`)
    }
    return step.world
  }, world)
}

const lesson = (id) => LESSONS.find((item) => item.id === id)

const cases = [
  ['empty folder', () => lesson('init').setup()],
  ['fresh repository', () => lesson('status').setup()],
  ['linear history', () => lesson('branch').setup()],
  ['two branches', () => lesson('mergeDiverged').setup()],
  [
    'merge commit',
    () => play(lesson('mergeDiverged').setup(), ['git merge postres']),
  ],
  ['detached HEAD', () => play(lesson('branch').setup(), ['git checkout C1'])],
  ['cloned repository with a remote', () => lesson('push').setup()],
  [
    'conflict in progress',
    () => {
      const world = play(lesson('checkoutB').setup(), [
        'git checkout -b bebidas',
        'echo "limonada" > recetas.md',
        'git add .',
        'git commit -m "b"',
        'git checkout main',
        'echo "otra cosa" > recetas.md',
        'git add .',
        'git commit -m "m"',
      ])
      return run(world, 'git merge bebidas').world
    },
  ],
]

let failures = 0
for (const [name, build] of cases) {
  try {
    const world = build()
    const html = [
      wrap(h(GraphView, { world })),
      wrap(h(FilesPanel, { world, onEdit() {}, onCreate() {}, onDelete() {} })),
      wrap(h(Terminal, { entries: [], hint: { key: 'hint.notARepo', params: {} }, onSubmit() {} })),
    ].join('')
    if (html.length === 0) throw new Error('rendered nothing')
    console.log(`ok   ${name} (${html.length} chars)`)
  } catch (error) {
    failures += 1
    console.error(`FAIL ${name}: ${error.message}`)
  }
}

// Lesson prose mixes the two bits of markdown the renderer supports, including
// code inside a bold run.
try {
  const html = renderToString(h(RichText, { text: 'el ciclo: **editás → `git add`**, y listo' }))
  if (!html.includes('<strong>')) throw new Error('bold was not rendered')
  if (!html.includes('<code>git add</code>')) throw new Error('code inside bold was not rendered')
  if (html.includes('`')) throw new Error('a backtick leaked into the output')
  console.log('ok   rich text with code inside bold')
} catch (error) {
  failures += 1
  console.error(`FAIL rich text: ${error.message}`)
}

try {
  const html = wrap(h(App, null))
  if (!html.includes('lesson-title')) throw new Error('the lesson panel is missing')
  console.log(`ok   full page (${html.length} chars)`)
} catch (error) {
  failures += 1
  console.error(`FAIL full page: ${error.message}`)
}

if (failures > 0) {
  console.error(`\n${failures} render check(s) failed`)
  process.exit(1)
}
console.log('\nall render checks passed')
