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

// A leftover headless Chrome from an earlier run holds the port and serves its
// own pages on it, which otherwise shows up as a confusing "never served a
// page" further down.
try {
  const response = await fetch(`http://127.0.0.1:${PORT}/json/version`, {
    signal: AbortSignal.timeout(700),
  })
  if (response.ok) {
    console.error(
      `Something is already debugging on port ${PORT}, probably a headless Chrome`,
      `left over from an earlier run.\n  Close it with:  pkill -f "remote-debugging-port=${PORT}"`,
      `\n  Or use another port:  npm run check:browser -- --port=9444`,
    )
    process.exit(1)
  }
} catch {
  // Nothing listening, which is what we want.
}

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
  throw new Error(
    `Chrome never served a page from ${BASE_URL}. Is \`npm run dev\` running there?`,
  )
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
  await check(
    `the tour stays closed on lesson ${number}`,
    await evaluate("return document.querySelector('.tour-card') === null"),
  )
  await evaluate(
    `if (!document.querySelector('.lesson-counter').innerText.includes('${number}')) {
       throw new Error('lesson ${number} did not open')
     }`,
  )
}

const terminal = () => evaluate("return document.querySelector('.terminal').innerText")
/** The newest hint in the transcript: hints accumulate, they do not replace. */
const hint = () =>
  evaluate("return [...document.querySelectorAll('.hint-card')].at(-1)?.innerText ?? ''")
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

/** Clicks a button by the text on it, anywhere in a container. */
async function clickButton(container, label) {
  await evaluate(
    `const button = [...document.querySelectorAll(${JSON.stringify(container)} + ' button')]
       .find((candidate) => candidate.textContent.includes(${JSON.stringify(label)}))
     if (!button) throw new Error('no button matching ${label}')
     button.click()`,
  )
  await wait(180)
}

try {
  await waitFor('.terminal-input input')

  // The guided tour shows itself on a first visit, so it is the first thing
  // here too: check it, walk a step, then get it out of the way.
  await waitFor('.tour-card')
  await check(
    'the tour opens on a first visit',
    (await evaluate("return document.querySelector('.tour-title').innerText")).length > 0,
  )
  await clickButton('.tour-actions', 'Siguiente')
  await check(
    'it spotlights a region as you go',
    await evaluate("return document.querySelector('.tour-hole') !== null"),
  )
  // Clicking past the tour must not dismiss it: only its own buttons do.
  await evaluate("document.querySelector('.tour-catcher').click()")
  await wait(150)
  await check(
    'a click outside leaves it open',
    await evaluate("return document.querySelector('.tour-card') !== null"),
  )

  await clickButton('.tour-actions', 'Saltar')
  await check(
    'and closes when skipped',
    await evaluate("return document.querySelector('.tour-card') === null"),
  )

  // Re-openable from the header, and not shown again on its own.
  await clickButton('.header-actions', 'Cómo funciona')
  await check(
    'the header button reopens it',
    await evaluate("return document.querySelector('.tour-card') !== null"),
  )
  await clickButton('.tour-actions', 'Saltar')

  await check('the four panels rendered', (await evaluate("return document.querySelectorAll('.panel').length")) === 4)

  // git speaks the language of the site, the way it follows LANG for real.
  await type('git status')
  await check(
    'a git command before `git init` fails',
    (await terminal()).includes('no es un repositorio git'),
    terminal,
  )
  await check('the hint card explains what to do', (await hint()).includes('git init'), hint)

  // Help needs no repository, and asking for it must not trip over the option
  // checking of the command itself.
  await type('git commit --help')
  await check('--help prints a usage line', (await terminal()).includes('uso: git commit'), terminal)
  await check('and lists the options that work here', (await terminal()).includes('-m, --message'), terminal)
  await check('and says so, that the help is reduced', (await hint()).includes('reducida'), hint)
  await check(
    'and is labelled as information, not as an error',
    await evaluate("return [...document.querySelectorAll('.hint-card')].at(-1).classList.contains('hint-info')"),
  )

  await type('git init')
  await check('git init succeeds', (await terminal()).includes('Inicializado un repositorio Git'), terminal)
  await check('the goal is detected', await solved())

  await openLesson(4)
  await type('git commit')
  await check(
    'a commit without a message is refused',
    (await terminal()).includes('mensaje está vacío'),
    terminal,
  )
  await type('git commit -m "primer commit"')
  await check('the commit is created', (await terminal()).includes('commit-raíz'), terminal)
  await check('the graph drew the commit', (await evaluate("return document.querySelectorAll('.graph .node').length")) === 1)
  await check('lesson 4 is solved', await solved())

  // The whole remote round trip, including the rejected push.
  await openLesson(15)
  await type('git push')
  await check('the push is rejected', (await terminal()).includes('[rechazado]'), terminal)
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
  await check(
    'an edit from the files panel shows as modified',
    (await terminal()).includes('modificado:'),
    terminal,
  )

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
  await check(
    '`git status --staged` is refused',
    (await terminal()).includes('opción desconocida'),
    terminal,
  )
  await check('and the hint points at the green section', (await hint()).includes('stage'), hint)

  await type('git status')
  const spanish = await terminal()
  await check('status is translated', spanish.includes('En la rama main'), terminal)
  await check('so are its sections', spanish.includes('Cambios listos para el commit:'), terminal)

  // Layout, last so it does not disturb the lesson above: a code block has to
  // show every line it holds. The lesson panel is a flex column, and a flex
  // child that shrinks below its content clips whatever it cannot fit.
  await openLesson(10)
  await check(
    'the repository URL block shows all of its lines',
    await evaluate(
      `const pre = document.querySelector('.commands')
       if (!pre) throw new Error('lesson 10 shows no command block')
       return pre.scrollHeight <= pre.clientHeight + 1`,
    ),
    () =>
      evaluate(
        `const pre = document.querySelector('.commands')
         return \`clientHeight ${pre.clientHeight}, scrollHeight ${pre.scrollHeight}\``,
      ),
  )
} finally {
  socket.close()
  await cleanUp()
}

console.log(failures === 0 ? '\nall browser checks passed' : `\n${failures} browser check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
