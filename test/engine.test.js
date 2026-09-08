import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseAnsi, stripAnsi } from '../src/ansi.js'
import { readFileSync } from 'node:fs'

import { GIT_COMMANDS, run } from '../src/engine/commands/index.js'
import { setMessages } from '../src/engine/messages.js'
import { HELP_COMMANDS } from '../src/engine/help.js'
import { HINT_KINDS } from '../src/engine/hints.js'

const SPANISH_UI = JSON.parse(
  readFileSync(new URL('../src/i18n/locales/es-AR.json', import.meta.url)),
)
const SPANISH = SPANISH_UI.git
import { createRepo, createWorld, headCommitId, writeCommit } from '../src/engine/model.js'
import { computeStatus } from '../src/engine/status.js'

/** Runs a script of commands, asserting that none of them fails. */
function play(world, ...lines) {
  let current = world
  for (const line of lines) {
    const step = run(current, line)
    assert.equal(step.output.error, false, `"${line}" failed: ${step.output.lines.join('\n')}`)
    current = step.world
  }
  return current
}

function fails(world, line) {
  const step = run(world, line)
  assert.equal(step.output.error, true, `"${line}" should have failed`)
  return step.output
}

test('git commands need a repository first', () => {
  const output = fails(createWorld(), 'git status')
  assert.match(output.lines[0], /not a git repository/)
  assert.equal(output.hintKey, 'hint.notARepo')
})

test('init, add and commit build the first commit', () => {
  let world = createWorld()
  world = play(world, 'git init', 'echo "hola" > README.md', 'git add README.md', 'git commit -m "primer commit"')
  const head = headCommitId(world.repo)
  assert.equal(head, 'C1')
  assert.equal(world.repo.branches.main, 'C1')
  assert.deepEqual(world.repo.commits.C1.tree, { 'README.md': 'hola' })
  assert.equal(computeStatus(world).staged.length, 0)
})

test('status reports untracked, staged and modified files', () => {
  let world = play(createWorld(), 'git init', 'touch a.txt')
  assert.deepEqual(computeStatus(world).untracked, ['a.txt'])

  world = play(world, 'git add a.txt')
  assert.deepEqual(computeStatus(world).staged, [{ name: 'a.txt', change: 'added' }])

  world = play(world, 'git commit -m "a"', 'echo "cambio" > a.txt')
  assert.deepEqual(computeStatus(world).notStaged, [{ name: 'a.txt', change: 'modified' }])

  // `--staged` is not a real `git status` flag, so it is refused like git does.
  const refused = fails(world, 'git status --staged')
  assert.match(refused.lines[0], /unknown option/)
  assert.equal(refused.hintKey, 'hint.statusUnknownOption')
})

test('restore unstages and discards changes', () => {
  let world = play(
    createWorld(),
    'git init',
    'echo "uno" > a.txt',
    'git add a.txt',
    'git commit -m "uno"',
    'echo "dos" > a.txt',
    'git add a.txt',
  )
  assert.equal(computeStatus(world).staged.length, 1)

  world = play(world, 'git restore --staged a.txt')
  assert.equal(computeStatus(world).staged.length, 0)
  assert.equal(computeStatus(world).notStaged.length, 1)

  world = play(world, 'git restore a.txt')
  assert.equal(world.files['a.txt'], 'uno')
  assert.equal(computeStatus(world).notStaged.length, 0)
})

test('committing with nothing staged explains itself', () => {
  const world = play(createWorld(), 'git init', 'touch a.txt')
  const output = fails(world, 'git commit -m "vacio"')
  assert.equal(output.hintKey, 'hint.commitNothingStaged')
})

test('checkout -b creates a branch and switches to it', () => {
  const world = play(
    createWorld(),
    'git init',
    'touch a.txt',
    'git add .',
    'git commit -m "uno"',
    'git checkout -b feature',
  )
  assert.equal(world.repo.head.name, 'feature')
  assert.deepEqual(Object.keys(world.repo.branches).sort(), ['feature', 'main'])
})

test('checkout restores the files of the target branch', () => {
  let world = play(
    createWorld(),
    'git init',
    'echo "base" > a.txt',
    'git add .',
    'git commit -m "base"',
    'git checkout -b feature',
    'echo "feature" > a.txt',
    'git add .',
    'git commit -m "feature"',
  )
  assert.equal(world.files['a.txt'], 'feature')
  world = play(world, 'git checkout main')
  assert.equal(world.files['a.txt'], 'base')
})

test('checkout refuses to throw away uncommitted work', () => {
  const world = play(
    createWorld(),
    'git init',
    'echo "base" > a.txt',
    'git add .',
    'git commit -m "base"',
    'git checkout -b feature',
    'echo "feature" > a.txt',
    'git add .',
    'git commit -m "feature"',
    'echo "sin guardar" > a.txt',
  )
  const output = fails(world, 'git checkout main')
  assert.equal(output.hintKey, 'hint.dirtyTree')
})

test('merge fast-forwards when the branch only moved ahead', () => {
  const world = play(
    createWorld(),
    'git init',
    'echo "base" > a.txt',
    'git add .',
    'git commit -m "base"',
    'git checkout -b feature',
    'echo "mas" > b.txt',
    'git add .',
    'git commit -m "b"',
    'git checkout main',
    'git merge feature',
  )
  assert.equal(world.repo.branches.main, world.repo.branches.feature)
  assert.ok(world.files['b.txt'] !== undefined)
})

test('merge creates a merge commit when both branches moved', () => {
  const world = play(
    createWorld(),
    'git init',
    'echo "base" > a.txt',
    'git add .',
    'git commit -m "base"',
    'git checkout -b feature',
    'echo "feature" > b.txt',
    'git add .',
    'git commit -m "b"',
    'git checkout main',
    'echo "main" > c.txt',
    'git add .',
    'git commit -m "c"',
    'git merge feature',
  )
  const head = world.repo.commits[headCommitId(world.repo)]
  assert.equal(head.parents.length, 2)
  assert.deepEqual(Object.keys(head.tree).sort(), ['a.txt', 'b.txt', 'c.txt'])
})

test('a conflict is reported and resolved by add + commit', () => {
  let world = play(
    createWorld(),
    'git init',
    'echo "base" > a.txt',
    'git add .',
    'git commit -m "base"',
    'git checkout -b feature',
    'echo "feature" > a.txt',
    'git add .',
    'git commit -m "f"',
    'git checkout main',
    'echo "main" > a.txt',
    'git add .',
    'git commit -m "m"',
  )
  const merge = run(world, 'git merge feature')
  world = merge.world
  assert.match(merge.output.lines.join('\n'), /CONFLICT/)
  assert.deepEqual(world.repo.merge.conflicts, ['a.txt'])
  assert.match(world.files['a.txt'], /<<<<<<< HEAD/)

  assert.equal(fails(world, 'git commit -m "x"').hintKey, 'hint.commitWithConflicts')

  world = play(world, 'echo "resuelto" > a.txt', 'git add a.txt', 'git commit -m "merge"')
  assert.equal(world.repo.merge, null)
  assert.equal(world.repo.commits[headCommitId(world.repo)].parents.length, 2)
})

/** A world whose server already holds one commit, as if a teammate created it. */
function worldWithRemote() {
  const world = createWorld({ remoteUrl: 'https://github.com/curso/recetas.git' })
  const remote = createRepo({ head: { type: 'branch', name: 'main' } })
  const id = writeCommit(world, remote, {
    parents: [],
    message: 'commit inicial',
    tree: { 'README.md': 'proyecto del curso' },
  })
  remote.branches.main = id
  world.remote = remote
  return world
}

test('clone brings the server history down', () => {
  const cloned = play(worldWithRemote(), 'git clone https://github.com/curso/recetas.git')
  // The folder is there, but you are still outside it.
  assert.equal(cloned.repo, null)
  assert.deepEqual(Object.keys(cloned.subdirs), ['recetas'])

  const world = play(cloned, 'cd recetas')
  assert.equal(world.folder, 'recetas')
  assert.equal(world.files['README.md'], 'proyecto del curso')
  assert.equal(world.repo.branches.main, 'C1')
  assert.equal(world.repo.remoteTracking['origin/main'], 'C1')
  assert.equal(world.repo.upstream.main, 'origin/main')
})

test('clone rejects an unknown url', () => {
  assert.equal(fails(worldWithRemote(), 'git clone https://otro.git').hintKey, 'hint.cloneUnknownUrl')
})

test('push moves the branch on the server', () => {
  const world = play(
    worldWithRemote(),
    'git clone https://github.com/curso/recetas.git',
    'cd recetas',
    'echo "nota" > notas.txt',
    'git add .',
    'git commit -m "notas"',
    'git push',
  )
  assert.equal(world.remote.branches.main, world.repo.branches.main)
  assert.equal(world.repo.remoteTracking['origin/main'], world.repo.branches.main)
})

test('push is rejected when the server moved ahead', () => {
  let world = play(worldWithRemote(), 'git clone https://github.com/curso/recetas.git', 'cd recetas')
  const serverCommit = writeCommit(world, world.remote, {
    parents: [world.remote.branches.main],
    message: 'trabajo de otra persona',
    tree: { 'README.md': 'proyecto del curso', 'otro.txt': 'x' },
  })
  world.remote.branches.main = serverCommit
  world = play(world, 'echo "nota" > notas.txt', 'git add .', 'git commit -m "notas"')
  assert.equal(fails(world, 'git push').hintKey, 'hint.pushRejected')
})

test('pull brings the server commits and merges them', () => {
  let world = play(worldWithRemote(), 'git clone https://github.com/curso/recetas.git', 'cd recetas')
  const serverCommit = writeCommit(world, world.remote, {
    parents: [world.remote.branches.main],
    message: 'trabajo de otra persona',
    tree: { 'README.md': 'proyecto del curso', 'otro.txt': 'x' },
  })
  world.remote.branches.main = serverCommit
  world = play(world, 'git pull')
  assert.equal(world.repo.branches.main, serverCommit)
  assert.equal(world.files['otro.txt'], 'x')
})

test('branch -a lists remote-tracking branches', () => {
  const world = play(worldWithRemote(), 'git clone https://github.com/curso/recetas.git', 'cd recetas')
  const listed = run(world, 'git branch -a').output.lines.map(stripAnsi)
  assert.deepEqual(listed, ['* main', '  remotes/origin/main'])
})

test('an unknown subcommand suggests the closest one', () => {
  const output = fails(play(createWorld(), 'git init'), 'git comit -m "x"')
  assert.equal(output.hintKey, 'hint.unknownGitCommandDidYouMean')
  assert.equal(output.hintParams.suggestion, 'commit')
})

test('a failed command leaves the world untouched', () => {
  const world = play(createWorld(), 'git init', 'touch a.txt')
  const step = run(world, 'git add inexistente.txt')
  assert.equal(step.output.error, true)
  assert.equal(step.world, world)
})

test('clone makes a folder named after the repository, and leaves you outside', () => {
  const cloned = play(worldWithRemote(), 'git clone https://github.com/curso/recetas.git')

  assert.equal(cloned.folder, 'proyecto', 'clone must not move you')
  assert.equal(cloned.repo, null, 'you are not in the repository yet')
  assert.deepEqual(Object.keys(cloned.subdirs), ['recetas'])
  assert.match(run(worldWithRemote(), 'git clone https://github.com/curso/recetas.git').output.lines[0], /recetas/)

  // Which is why a git command still says there is no repository here...
  const refused = run(cloned, 'git status')
  assert.equal(refused.output.error, true)
  assert.equal(refused.output.hintKey, 'hint.notARepo')

  // ...and why clone itself says nothing about it: finding that out is the
  // lesson, and the hints are there for whoever gets stuck.
  const step = run(worldWithRemote(), 'git clone https://github.com/curso/recetas.git')
  assert.equal(step.output.error, false)
  assert.equal(step.output.hintKey, null)
})

test('cd walks into the clone, and back out of it', () => {
  const cloned = play(worldWithRemote(), 'git clone https://github.com/curso/recetas.git')

  // `ls` shows the folder with a slash, which is how you learn its name.
  assert.match(run(cloned, 'ls').output.lines[0], /recetas\//)
  assert.deepEqual(run(cloned, 'pwd').output.lines, ['/proyecto'])

  const inside = play(cloned, 'cd recetas')
  assert.ok(inside.repo, 'cd should carry the repository of the folder')
  assert.deepEqual(run(inside, 'pwd').output.lines, ['/proyecto/recetas'])
  assert.deepEqual(Object.keys(inside.subdirs), [])

  const back = play(inside, 'cd ..')
  assert.equal(back.folder, 'proyecto')
  assert.equal(back.repo, null)
  assert.deepEqual(Object.keys(back.subdirs), ['recetas'], 'the folder is still there')
})

test('cd says so when the folder is not there', () => {
  const cloned = play(worldWithRemote(), 'git clone https://github.com/curso/recetas.git')

  assert.equal(fails(cloned, 'cd recetitas').hintKey, 'hint.cdNoSuchDirectory')
  assert.equal(fails(cloned, 'cd').hintKey, 'hint.cdNeedsName')

  const withFile = play(cloned, 'touch notas.txt')
  assert.equal(fails(withFile, 'cd notas.txt').hintKey, 'hint.cdNotADirectory')

  // At the top there is nowhere further up, so it stays put rather than erroring.
  assert.equal(run(cloned, 'cd ..').output.error, false)
})

test('every git command answers --help', () => {
  for (const name of Object.keys(GIT_COMMANDS)) {
    const step = run(createWorld(), `git ${name} --help`)
    assert.equal(step.output.error, false, `git ${name} --help failed`)
    assert.match(step.output.lines[0], /^usage: git /, `git ${name} --help printed no usage`)
    assert.equal(step.output.hintKey, 'hint.reducedHelp')
    assert.equal(step.output.hintParams.command, name)
  }
})

test('help works without a repository and before any option checking', () => {
  // `git status` rejects every option, but not when the option is --help.
  const asked = run(createWorld(), 'git status --help')
  assert.equal(asked.output.error, false)
  assert.match(asked.output.lines.join('\n'), /uso|usage/)

  // And -h is the same thing, as it is in git.
  assert.equal(run(createWorld(), 'git add -h').output.error, false)
  assert.deepEqual(
    run(createWorld(), 'git add -h').output.lines,
    run(createWorld(), 'git add --help').output.lines,
  )
})

test('help lists the options the command really accepts', () => {
  const shown = (name) => run(createWorld(), `git ${name} --help`).output.lines.join('\n')

  assert.match(shown('restore'), /--staged/)
  assert.match(shown('branch'), /-a, --all/)
  assert.match(shown('branch'), /-d, --delete/)
  assert.match(shown('checkout'), /-b <name>/)
  assert.match(shown('push'), /-u, --set-upstream/)
  // Nothing invented: merge takes no options here, so none are listed.
  assert.equal(/^ {4}-/m.test(shown('merge')), false)
})

test('an option line fits the terminal without wrapping', () => {
  // The terminal is a column in a page, not a full-width shell: a line that
  // wraps continues at the left edge and the flag column stops lining up.
  setMessages(SPANISH)
  try {
    for (const name of Object.keys(GIT_COMMANDS)) {
      for (const line of run(createWorld(), `git ${name} --help`).output.lines) {
        if (!/^ {4}-/.test(line)) continue
        assert.ok(line.length <= 56, `too long for the terminal: "${line}" (${line.length})`)
      }
    }
  } finally {
    setMessages(null)
  }
})

test('`git help <command>` is the same as `git <command> --help`', () => {
  assert.deepEqual(
    run(createWorld(), 'git help merge').output.lines,
    run(createWorld(), 'git merge --help').output.lines,
  )
  // `git help` on its own still lists the commands.
  assert.equal(run(createWorld(), 'git help').output.hintKey, 'hint.gitHelp')
})

test('a command with no help entry cannot slip in', () => {
  const documented = new Set(HELP_COMMANDS)
  const missing = Object.keys(GIT_COMMANDS).filter((name) => !documented.has(name))
  assert.deepEqual(missing, [], 'these commands have no --help')
  const extra = HELP_COMMANDS.filter((name) => !Object.hasOwn(GIT_COMMANDS, name))
  assert.deepEqual(extra, [], 'these help entries have no command')
})

test('every hint is labelled with the kind of note it is', () => {
  const kindOf = (line) => run(createWorld(), line).output.hintKind

  assert.equal(kindOf('git status'), 'error', 'a refusal is an error')
  assert.equal(kindOf('git comit'), 'tip', 'a "did you mean" is a suggestion')
  assert.equal(kindOf('git commit --help'), 'info', 'help is information')
  assert.equal(kindOf('git'), 'info', 'the command list is information')
  assert.equal(kindOf('git init'), null, 'nothing to say, no note')
})

test('a conflicted merge warns, without being an error', () => {
  const world = play(
    createWorld(),
    'git init',
    'echo "base" > a.txt',
    'git add .',
    'git commit -m "base"',
    'git checkout -b otra',
    'echo "otra" > a.txt',
    'git add .',
    'git commit -m "o"',
    'git checkout main',
    'echo "main" > a.txt',
    'git add .',
    'git commit -m "m"',
  )
  const step = run(world, 'git merge otra')

  assert.equal(step.output.error, false, 'a conflict is not a failed command')
  assert.equal(step.output.hintKey, 'hint.mergeConflict')
  assert.equal(step.output.hintKind, 'warn')

  // And it stops warning once the conflict is dealt with.
  const fixed = play(step.world, 'echo "resuelto" > a.txt', 'git add a.txt')
  assert.equal(run(fixed, 'git status').output.hintKey, null)
})

test('every kind a hint can carry has a name to show', () => {
  const titles = SPANISH_UI.terminal.hint
  for (const kind of HINT_KINDS) {
    assert.equal(typeof titles[kind], 'string', `no title for a "${kind}" note`)
  }
  assert.deepEqual(Object.keys(titles).sort(), [...HINT_KINDS].sort())
})

test('diff compares the folder with the staging area', () => {
  const world = play(
    createWorld(),
    'git init',
    'echo "uno" > a.txt',
    'git add .',
    'git commit -m "a"',
    'echo "dos" >> a.txt',
  )
  const shown = run(world, 'git diff').output.lines.map(stripAnsi)

  assert.deepEqual(shown, [
    'diff --git a/a.txt b/a.txt',
    '--- a/a.txt',
    '+++ b/a.txt',
    '@@ -1 +1,2 @@',
    ' uno',
    '+dos',
  ])
})

test('diff finds nothing once the change is staged, and says why', () => {
  const world = play(
    createWorld(),
    'git init',
    'echo "uno" > a.txt',
    'git add .',
    'git commit -m "a"',
    'echo "dos" >> a.txt',
    'git add a.txt',
  )

  // The confusion this lesson exists for: nothing to show, because the change
  // moved to the other side of the comparison.
  const plain = run(world, 'git diff').output
  assert.deepEqual(plain.lines, [])
  assert.equal(plain.hintKey, 'hint.diffNoChanges')
  assert.equal(plain.hintKind, 'info')

  const staged = run(world, 'git diff --staged').output.lines.map(stripAnsi)
  assert.ok(staged.includes('+dos'))
  assert.equal(run(world, 'git diff --cached').output.lines.length, staged.length)
})

test('diff marks a new file and a deleted one as git does', () => {
  const world = play(
    createWorld(),
    'git init',
    'echo "uno" > a.txt',
    'git add .',
    'git commit -m "a"',
    'echo "nuevo" > b.txt',
    'rm a.txt',
  )
  const shown = run(world, 'git diff').output.lines.map(stripAnsi).join('\n')

  assert.match(shown, /deleted file mode 100644\n--- a\/a\.txt\n\+\+\+ \/dev\/null/)
  assert.match(shown, /new file mode 100644\n--- \/dev\/null\n\+\+\+ b\/b\.txt/)
  assert.match(shown, /@@ -0,0 \+1 @@/)
})

test('diff compares two branches', () => {
  const world = play(
    createWorld(),
    'git init',
    'echo "base" > a.txt',
    'git add .',
    'git commit -m "base"',
    'git checkout -b otra',
    'echo "suma" > b.txt',
    'git add .',
    'git commit -m "b"',
    'git checkout main',
  )

  // Two names read from the first to the second, so what `otra` adds is new.
  const forward = run(world, 'git diff main otra').output.lines.map(stripAnsi).join('\n')
  assert.match(forward, /new file mode/)
  assert.match(forward, /\+suma/)

  // One name compares *that* point against the working tree, so the same
  // change reads backwards: from `otra`, arriving here, the file is gone.
  const backward = run(world, 'git diff otra').output.lines.map(stripAnsi).join('\n')
  assert.match(backward, /deleted file mode/)
  assert.match(backward, /-suma/)

  // Comparing a branch with itself has nothing to say, and says that.
  const same = run(world, 'git diff main main').output
  assert.deepEqual(same.lines, [])
  assert.equal(same.hintKey, 'hint.diffNoDifferences')

  assert.equal(fails(world, 'git diff rama-inventada').hintKey, 'hint.diffUnknownRef')
})

test('diff paints additions green and removals red', () => {
  const world = play(
    createWorld(),
    'git init',
    'echo "uno\ndos" > a.txt',
    'git add .',
    'git commit -m "a"',
    'echo "uno\ntres" > a.txt',
  )
  const lines = run(world, 'git diff').output.lines
  const colourOf = (text) => {
    const line = lines.find((entry) => stripAnsi(entry) === text)
    assert.ok(line, `no line reading "${text}"`)
    return parseAnsi(line)[0].color
  }

  assert.equal(colourOf('+tres'), 'green')
  assert.equal(colourOf('-dos'), 'red')
  assert.equal(colourOf(' uno'), null, 'context lines are not painted')
  assert.equal(colourOf('@@ -1,2 +1,2 @@'), 'cyan')
})
