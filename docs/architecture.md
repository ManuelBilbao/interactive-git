# Architecture

This document describes the code. The course itself is described in
[lessons.md](lessons.md), in Spanish.

The site is a Vite + React app with no runtime dependencies beyond React. It
never talks to a server and never runs real git: a small engine simulates a
repository, and the UI draws it.

```
a typed line
     │
     ▼
 engine/parser.js ──► engine/commands/index.js ──► one command module
                            │                            │
                            │                    mutates a copy of the world
                            ▼                            │
                     { lines, error, hintKey } ◄─────────┘
                            │
        ┌───────────────────┴───────────────────┐
        ▼                                       ▼
  terminal output                    HintCard: t(hintKey)
  (git's English)                    (translated explanation)
```

## The world

`engine/model.js` defines everything the student can see:

```js
world = {
  nextId,       // commits are numbered C1, C2, C3...
  folder,       // the folder the student is standing in
  files,        // the working directory: { filename: content }
  repo,         // the local repository, null before `git init` / `git clone`
  remote,       // the repository on the "server", null when the lesson has none
  remoteUrl,
}

repo = {
  commits,         // id -> { id, parents, message, tree }
  branches,        // name -> commit id
  head,            // { type: 'branch', name } | { type: 'detached', commit }
  index,           // the staging area: a full snapshot { filename: content }
  remoteTracking,  // 'origin/main' -> commit id
  upstream,        // 'main' -> 'origin/main'
  merge,           // { from, fromCommit, conflicts } while a merge is unresolved
}
```

Three decisions keep this simple:

- **A commit stores a whole snapshot**, not a diff. `tree` is the complete set
  of files as of that commit. Checkout, merge and diff all become plain object
  comparisons, and the student's mental model ("a commit is a photo") matches
  the implementation.
- **The index is a full snapshot too**, exactly as in real git. `git add` copies
  a file from `files` into `index`; `git commit` freezes `index` into a tree.
  That is what makes the three-way `git status` fall out naturally.
- **The remote is just another `repo`.** `push` and `pull` copy commit objects
  between two repositories, which is close enough to the real thing that the
  rejected-push lesson behaves correctly without any special casing.

Every structure is plain JSON, so `structuredClone` copies a world in one call.

## Running a command

`engine/commands/index.js` is the only entry point:

```js
const { world: next, output } = run(world, 'git commit -m "hola"')
```

It clones the world, tokenises the line, dispatches to a command module and
returns the new world plus what to print. Commands mutate the clone directly and
throw `GitError` on failure. **A failed command returns the original world**, so
a half-applied change can never leak out.

Command modules are grouped by topic: `repoSetup.js` (init, clone),
`staging.js` (status, add, restore), `history.js` (commit, log),
`branching.js` (branch, checkout, merge), `remote.js` (push, pull) and
`shell.js` (ls, cat, touch, rm, echo, pwd).

## Errors, in two voices

`GitError` carries two things:

```js
throw gitError(
  'fatal: not a git repository (or any of the parent directories): .git',
  'hint.notARepo',
)
```

The message is git's own wording, in English, and goes to the terminal
unchanged. The `hintKey` is looked up in the locale file and rendered as a card
below the terminal, in the student's language.

This split is deliberate. Students will meet these exact strings in a real
terminal, and a translated simulator would teach them to recognise text they
will never see again. `test/i18n.test.js` walks the engine source for
`'hint.*'` literals and fails when one has no translation, or when a
translation is no longer used.

## Colour

Real git colours its output, and the colours carry meaning: in `git status`,
green is "already staged", red is "not staged yet". Teaching the difference
between the two is most of what lessons 3 to 6 are about, so the simulator emits
the colour the same way git does — as ANSI escape codes inside the output
string.

`src/ansi.js` has both halves: `paint()` and its shorthands for the engine,
`parseAnsi()` for the terminal component, which turns the codes back into
spans, and `stripAnsi()` for tests that want the bare text.

Keeping the codes inside plain strings means the engine's contract does not
change: a command still returns `string[]`, and most assertions still read
naturally. Where a test needs an exact match, it strips first.

Colour is emitted in the three places git emits it: `git status` (staged green,
unstaged and untracked red), `git branch` (current branch green, the server's
branches red) and `git log` (commit ids yellow, `HEAD` cyan, branches green,
remote branches red). Section headers stay uncoloured, as in real git.

## The working directory

`engine/workdir.js` holds the checks git performs before it overwrites your
work, shared by `checkout` and `merge`:

- `assertSafeToSwitch` refuses when a modified file is one the new snapshot also
  changes, or when an untracked file would be clobbered.
- `applyTree` then moves both the working directory and the index to the target
  snapshot.

Files the operation does not touch keep their modifications, as in real git.

## Merging

`gitMerge` covers the three cases a beginner meets:

1. the other branch is already an ancestor → `Already up to date.`
2. our branch is an ancestor of it → fast-forward, no merge commit
3. otherwise → find the merge base (the deepest common ancestor) and merge the
   three trees file by file

`mergeTrees` decides per file: if both sides agree, take it; if one side matches
the base, take the other; otherwise it is a conflict, and the file gets the
familiar `<<<<<<<` / `=======` / `>>>>>>>` markers. `repo.merge` then holds the
unresolved paths until `git add` clears them and `git commit` writes the merge
commit with two parents.

Conflicts are not part of any lesson goal, but they are fully implemented, so a
student who wanders into one can get out the same way they would in real life.

## Drawing the graph

`components/graphLayout.js` turns a repo into coordinates.

- **Rows** are the distance from the root, so history reads oldest to newest,
  top to bottom.
- **Columns** come from branches. Walking back from each branch head along first
  parents, each branch claims the commits nothing before it claimed. `main` goes
  first so it keeps the left column; commits reachable only through a merge's
  second parent get a column of their own.
- **Rows and columns are sized from their contents.** The `main` and
  `origin/main` chips hang off a commit to the right and stack downwards, so a
  fixed grid would put them on top of the neighbouring commit. Each column is as
  wide as its widest label, plus clearance for the next node's radius.

`test/graph.test.js` asserts that no two commit boxes (circle plus labels)
overlap, across every lesson.

## i18n

`i18n/index.jsx` provides `t(key, params)`, `tList(key)` for arrays and
`has(key)` for optional sections, with `{name}` interpolation and a fallback to
the default locale. `i18n/locales/index.js` is the registry; adding a language
means adding a JSON file and one line there. The language selector renders only
when more than one locale exists.

Lesson text lives entirely in the locale files under `lessons.<id>`, so
`lessons/index.js` holds behaviour and no prose.

## Lessons

A lesson is a `setup` that builds a starting world and a `check` that decides
when the goal is reached:

```js
{
  id: 'push',
  commands: ['git push'],
  setup: () => { /* returns a world */ },
  check: (world, history) => /* boolean */,
}
```

`history` is the list of commands that ran successfully, which is how lessons
whose goal is "run this command and read the output" are checked. `check` runs
after every command and after every edit made in the files panel; App wraps it
in a try/catch so a lesson that trips over an unexpected state cannot take the
page down.

## Testing

Five layers, all of them cheap:

| File | What it protects |
| --- | --- |
| `test/engine.test.js` | command behaviour, including the errors |
| `test/lessons.test.js` | every lesson is solvable, via a known-good solution |
| `test/i18n.test.js` | no hint or lesson text is missing or orphaned |
| `test/graph.test.js` | the drawing has no overlaps and fits its bounds |
| `scripts/render-check.mjs` | components render for empty, merged, detached, conflicted and remote worlds |
| `scripts/browser-check.mjs` | the real page in headless Chrome, driven by keystrokes |

`npm test` runs the first five. The browser check needs a dev server and is run
on demand.

## Known simplifications

These are deliberate, and worth knowing before extending the project:

- There is one folder and no subdirectories; file names are flat strings.
- Merging compares whole file contents, not lines, so any two different versions
  of a file conflict. Good enough to teach what a conflict *is*.
- `git log` supports `--oneline` and nothing else. No `stash`, `rebase`,
  `reset`, `remote add`, `fetch` on its own, or tags.
- A remote exists only when a lesson seeds one; there is no `git remote add`.
- Commit ids are `C1`, `C2`... rather than hashes, so they can be read aloud.
