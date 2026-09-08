// End-to-end smoke test: opens the site in a real (headless) Chrome and types
// commands into the terminal the same way a student would, then reads the page
// back. Run `npm run dev` first, then `npm run check:browser`.
//
// Set CHROME_PATH if your browser lives somewhere else, and pass --url to
// point at a different dev server.

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const argument = (name, fallback) => {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`))
  return found ? found.slice(name.length + 3) : fallback
}

const BASE_URL = argument('url', 'http://localhost:5173')
const PORT = Number(argument('port', '9333'))
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const profile = mkdtempSync(join(tmpdir(), 'git-interactivo-'))
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    `${BASE_URL}/?leccion=1`,
  ],
  { stdio: 'ignore' },
)

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function cleanUp() {
  chrome.kill()
  // Chrome keeps writing to its profile for a moment after the signal, so wait
  // for it to exit before deleting; a leftover temp directory is harmless.
  await Promise.race([
    new Promise((resolve) => chrome.once('exit', resolve)),
    wait(3000),
  ])
  try {
    rmSync(profile, { recursive: true, force: true })
  } catch {
    // Nothing worth failing the run over.
  }
}

async function connect() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = targets.find((target) => target.type === 'page' && target.url.startsWith(BASE_URL))
      if (page) return page
    } catch {
      // Chrome has not opened the port yet.
    }
    await wait(500)
  }
  throw new Error(`Chrome never served a page from ${BASE_URL}. Is \`npm run dev\` running?`)
}

const page = await connect()
const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve)
  socket.addEventListener('error', reject)
})

let id = 0
const pending = new Map()
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  const resolve = pending.get(message.id)
  if (resolve) {
    pending.delete(message.id)
    resolve(message)
  }
})

function send(method, params = {}) {
  id += 1
  const current = id
  return new Promise((resolve, reject) => {
    pending.set(current, resolve)
    setTimeout(() => reject(new Error(`${method} timed out`)), 10000)
    socket.send(JSON.stringify({ id: current, method, params }))
  })
}

async function evaluate(expression) {
  const reply = await send('Runtime.evaluate', {
    expression: `(() => { ${expression} })()`,
    returnByValue: true,
    awaitPromise: true,
  })
  const details = reply.result?.exceptionDetails
  if (details) throw new Error(details.exception?.description ?? JSON.stringify(details))
  return reply.result?.result?.value
}

/** Polls until the app has actually mounted, instead of guessing a delay. */
async function waitFor(selector) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const found = await evaluate(`return Boolean(document.querySelector(${JSON.stringify(selector)}))`)
    if (found) return
    await wait(250)
  }
  throw new Error(`"${selector}" never appeared`)
}

/** Types into the terminal through the same events a keystroke produces. */
async function type(command) {
  await evaluate(`
    const input = document.querySelector('.terminal-input input')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, ${JSON.stringify(command)})
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.form.requestSubmit()
  `)
  await wait(150)
}

async function openLesson(number) {
  await evaluate(`history.replaceState(null, '', '?leccion=${number}'); location.reload()`)
  await wait(300)
  await waitFor('.terminal-input input')
  await evaluate(
    `if (!document.querySelector('.lesson-counter').innerText.includes('${number}')) {
       throw new Error('lesson ${number} did not open')
     }`,
  )
}

const terminal = () => evaluate("return document.querySelector('.terminal').innerText")
const hint = () => evaluate("return document.querySelector('.hint-card')?.innerText ?? ''")
const solved = () => evaluate("return Boolean(document.querySelector('.lesson-solved'))")

let failures = 0
async function check(label, condition, detail) {
  if (condition) {
    console.log(`ok   ${label}`)
    return
  }
  failures += 1
  const extra = typeof detail === 'function' ? await detail() : detail
  console.error(`FAIL ${label}${extra ? `\n     ${String(extra).replaceAll('\n', '\n     ')}` : ''}`)
}

try {
  await waitFor('.terminal-input input')
  await check('the four panels rendered', (await evaluate("return document.querySelectorAll('.panel').length")) === 4)

  // A command that fails must show git's wording and the translated hint.
  await type('git status')
  await check('a git command before `git init` fails', (await terminal()).includes('not a git repository'), terminal)
  await check('the hint card explains it in Spanish', (await hint()).includes('git init'), hint)

  await type('git init')
  await check('git init succeeds', (await terminal()).includes('Initialized empty Git repository'), terminal)
  await check('the goal is detected', await solved())

  await openLesson(4)
  await type('git commit')
  await check('a commit without a message is refused', (await terminal()).includes('empty commit message'), terminal)
  await type('git commit -m "primer commit"')
  await check('the commit is created', (await terminal()).includes('root-commit'), terminal)
  await check('the graph drew the commit', (await evaluate("return document.querySelectorAll('.graph .node').length")) === 1)
  await check('lesson 4 is solved', await solved())

  // The whole remote round trip, including the rejected push.
  await openLesson(15)
  await type('git push')
  await check('the push is rejected', (await terminal()).includes('[rejected]'), terminal)
  await check('the rejection is explained', (await hint()).includes('git pull'), hint)
  await type('git pull')
  await type('git push')
  await check('the push works after the pull', (await terminal()).includes('main -> main'), terminal)
  await check('lesson 15 is solved', await solved())
  await check(
    'both repositories are drawn',
    (await evaluate("return document.querySelectorAll('.graph-column').length")) === 2,
  )

  // Editing a file from the panel is what `git add` should then pick up.
  await openLesson(5)
  await evaluate(`
    document.querySelectorAll('.file-actions button')[0].click()
  `)
  await wait(120)
  await evaluate(`
    const area = document.querySelector('.file-editor textarea')
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(area, 'milanesas')
    area.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector('.file-editor .primary').click()
  `)
  await wait(150)
  await type('git status')
  await check('an edit from the files panel shows as modified', (await terminal()).includes('modified:'), terminal)

  // Colour carries the meaning lessons 3 to 6 are built on, so check it lands
  // in the DOM and not just in the output string.
  const painted = (colour) =>
    evaluate(
      `return [...document.querySelectorAll('.ansi-${colour}')].some(
         (node) => node.textContent.includes('recetas.md'))`,
    )
  await check('an unstaged change is red', await painted('red'))
  await type('git add recetas.md')
  await type('git status')
  await check('a staged change is green', await painted('green'))

  await type('git status --staged')
  await check('`git status --staged` is refused', (await terminal()).includes('unknown option'), terminal)
  await check('and the hint points at the green section', (await hint()).includes('stage'), hint)
} finally {
  socket.close()
  await cleanUp()
}

console.log(failures === 0 ? '\nall browser checks passed' : `\n${failures} browser check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
