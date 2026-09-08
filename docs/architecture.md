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
  (git's words, msg())               (translated explanation)
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

The message is git's own wording; the `hintKey` is looked up in the locale file
and rendered as a card below the terminal, in the student's language.

The two are different things and stay separate. The message is what git says —
the same sentence, in the same shape, that a real terminal prints. The hint is
what *this course* says about it: which command to reach for next, and why. One
is a fact about git, the other is teaching.

Each hint carries the kind of note it is, so the card can say which: **Error**
for something git refused, **Ojo** for something half-done, **Info** for plain
information, **Tip** for a suggestion, each in the terminal's own colour.
`src/engine/hints.js` holds that mapping in one table — an unlisted hint is an
error when the command failed and information when it did not, which is right
often enough that only six of them need naming.

The one that earns "Ojo" is worth pointing out: a merge ending in conflicts is
**not** a failed command, so nothing was flagging it. It leaves the student
mid-operation with work to do, and now says so.

`test/i18n.test.js` walks the engine source for `'hint.*'` literals and fails
when one has no translation, or when a translation is no longer used.

## Translating git's output

git itself is localised: every message goes through gettext's `_()`, and the
catalogue is picked from the `LANG` environment variable. The simulator copies
that design rather than inventing one.

`src/engine/messages.js` is the whole mechanism:

```js
lines.push(msg('On branch {branch}', { branch }))
```

The **English text is the key**. That has three consequences worth knowing:

- a missing translation degrades to English, never to a blank line or a raw
  identifier;
- the source stays readable — you see the sentence, not `status.onBranch`;
- extracting the catalogue is a matter of scanning for `msg(`, which is what
  `scripts/extract-messages.mjs` does, in the spirit of `xgettext`.

The catalogue is process-wide, exactly like git's locale: `setMessages()` swaps
it and `setMessages(null)` goes back to English. The React side sets it from the
locale the site is running in — there is no separate switch, the same way git
takes its language from the environment and not from a flag. The tests leave it
unset, so they assert against git's own English wording.

Three things are deliberately **not** translated:

- **Commit messages.** `Merge branch 'postres'` is stored in the repository, so
  it is data, not output. Real git does not translate it either, and if it did,
  toggling the language would rewrite history.
- **Refs, file names, URLs and commit ids.** They travel as parameters.
- **Anything the student typed.**

`test/messages.test.js` checks that every extracted msgid has a translation,
that none is stale, that no translation drops or renames a `{placeholder}`, and
that the words the course keeps in English — commit, stage, push, pull, merge —
were not translated away.

Two details fall out of translating a terminal. Status labels are padded to the
longest label *in the active language*, so `archivo nuevo:` lines up the same
way `new file:` does. And lesson hints that quote a section of `git status` do
not hardcode the English: `t()` supplies the quoted lines as parameters, so
`` `{gitUntracked}` `` reads as `Untracked files` or `Archivos sin trackear`
depending on the switch.

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

## Help

`src/engine/help.js` answers `git <command> --help`, `-h` and
`git help <command>`. Real git opens a man page; there is none here, so what
gets printed has the shape of `git <command> -h` — a usage line and the options
— plus a one-line summary, which a beginner needs more than completeness.

Two things about it are deliberate:

- **The list covers only what works here.** Saying so is not git's job, so the
  caveat travels as `hint.reducedHelp` and the UI shows it beside the output,
  in the student's language, pointing them at the real help in a terminal.
- **Help is answered before anything else** — before the repository check and
  before the command's own option parsing. `git status` rejects every option,
  but not when the option is `--help`.

A test asserts that every command in `GIT_COMMANDS` has an entry and that no
entry lacks a command, so a command cannot be added without documenting it. A
second one asserts every option line fits the terminal column: it is a column
in a page, not a full-width shell, and a line that wraps continues at the left
edge and loses the alignment.

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

## Look and feel

`src/styles/app.css` is the whole design, in one file with no framework. Five
decisions carry it, and they are worth keeping if you extend the interface:

- **Three surfaces, deliberately different.** Paper white for the lesson you
  read, near-black for the terminal you work in, white panels for the reference
  views. The terminal is the one region with no card around it — the dark
  surface sits straight on the page, which is what separates working from
  reading. Uniform cards everywhere was what made an earlier pass look like a
  bootstrapped admin panel.
- **Hairlines, not shadows.** Panels are a 1px warm line and a 4px radius.
  Callouts — the goal, a hint, the note — are a 2px rule down the left rather
  than a tinted box.
- **Monospace is the chrome.** Panel titles, buttons, badges, commit ids, file
  names, the lesson counter. The proportional face is kept for prose. It reads
  as a developer tool, and it puts the interface in the same voice as the
  commands being taught.
- **One accent.** git's orange marks what is live: the current lesson, the goal,
  the hint, the merge commit. Primary buttons are ink-black instead, so orange,
  green and red stay free to mean something — live, staged, not staged.
- **Progress is one tick per lesson**, not a percentage bar, so the shape of the
  course is visible at a glance.

The terminal's title doubles as a shell prompt — `proyecto ⎇ main` — which
keeps the current branch on screen even when the graph is scrolled away.

## Drawing the graph

`components/graphLayout.js` turns a repo into coordinates.

- **Rows** are the distance from the root, so history reads oldest to newest,
  top to bottom.
- **Columns** come from branches. Walking back from each branch head along first
  parents, each branch claims the commits nothing before it claimed. `main` goes
  first so it keeps the left column; commits reachable only through a merge's
  second parent get a column of their own.
- **Each commit carries two labels.** Its message sits on the commit's own
  line, right after the circle — the order `git log --oneline` prints them in —
  and the refs pointing at it stack on the lines below, tucked under the circle.
- **Rows and columns are sized from their contents**, not on a fixed grid, or a
  label would land on the neighbouring commit. Each column is as wide as its
  widest label plus clearance for the next node's radius.

The label arrangement is also what keeps the drawing inside the rail it lives
in. Message and chips take a line each rather than competing for one, and the
chips stack rather than sitting side by side, because `main` and `origin/main`
together are wider than the rail; only two commits in the course carry two refs,
so stacking costs almost no height. Messages longer than 18 characters are cut
with an ellipsis and kept whole in the tooltip — in practice that is only the
`Merge branch ...` messages git generates itself.

Every node exposes its `bounds`, so `test/graph.test.js` can assert that no two
commits overlap and that everything fits inside the drawing, across every
lesson, without repeating the geometry.

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
