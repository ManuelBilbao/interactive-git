// A handful of shell commands, just enough to create and change files without
// leaving the terminal. Files can also be edited from the side panel.

import { gitError } from '../errors.js'
import { msg } from '../messages.js'

export function ls(world) {
  // Folders keep their slash, so a directory `git clone` just made is obvious.
  const names = [
    ...Object.keys(world.subdirs).map((name) => `${name}/`),
    ...Object.keys(world.files),
  ].sort()
  return names.length > 0 ? [names.join('  ')] : []
}

export function pwd(world) {
  const above = world.parent ? `/${world.parent.folder}` : ''
  return [`${above}/${world.folder}`]
}

/**
 * Walks into a folder, or back out of one.
 *
 * Only one level deep, which is all `git clone` ever creates here. Going in
 * carries the repository of that folder with it: that is the whole point of the
 * command as far as this course is concerned.
 */
export function cd(world, args) {
  const target = args.filter((arg) => !arg.startsWith('-'))[0]
  if (!target) throw gitError(msg('usage: cd <directory>'), 'hint.cdNeedsName')
  if (target === '.') return []

  if (target === '..' || target === '../') {
    // At the top there is nowhere further up, so it stays put, as a shell does.
    if (!world.parent) return []
    const { folder, files, repo, subdirs } = world.parent
    world.subdirs = { ...subdirs, [world.folder]: { repo: world.repo, files: world.files } }
    world.folder = folder
    world.files = files
    world.repo = repo
    world.parent = null
    return []
  }

  const name = target.replace(/\/+$/, '')
  if (!Object.hasOwn(world.subdirs, name)) {
    if (Object.hasOwn(world.files, name)) {
      throw gitError(msg('cd: {name}: Not a directory', { name }), 'hint.cdNotADirectory', { name })
    }
    throw gitError(
      msg('cd: {name}: No such file or directory', { name }),
      'hint.cdNoSuchDirectory',
      { name },
    )
  }

  const { repo, files } = world.subdirs[name]
  const { [name]: _entered, ...siblings } = world.subdirs
  world.parent = {
    folder: world.folder,
    files: world.files,
    repo: world.repo,
    subdirs: siblings,
  }
  world.folder = name
  world.files = files
  world.repo = repo
  world.subdirs = {}
  return []
}

export function cat(world, args) {
  const name = args[0]
  if (!name) throw gitError(msg('usage: cat <file>'), 'hint.catNeedsFile')
  if (!Object.hasOwn(world.files, name)) {
    throw gitError(
      msg('cat: {name}: No such file or directory', { name }),
      'hint.noSuchFile',
      { name },
    )
  }
  const content = world.files[name]
  return content === '' ? [] : content.split('\n')
}

export function touch(world, args) {
  if (args.length === 0) throw gitError(msg('usage: touch <file>'), 'hint.touchNeedsFile')
  for (const name of args) {
    if (!Object.hasOwn(world.files, name)) world.files[name] = ''
  }
  return []
}

export function rm(world, args) {
  const names = args.filter((arg) => !arg.startsWith('-'))
  if (names.length === 0) throw gitError(msg('usage: rm <file>'), 'hint.rmNeedsFile')
  for (const name of names) {
    if (!Object.hasOwn(world.files, name)) {
      throw gitError(
        msg('rm: {name}: No such file or directory', { name }),
        'hint.noSuchFile',
        { name },
      )
    }
    delete world.files[name]
  }
  return []
}

export function echo(world, args) {
  const redirectIndex = args.findIndex((arg) => arg === '>' || arg === '>>')
  const text = args.slice(0, redirectIndex === -1 ? args.length : redirectIndex).join(' ')
  if (redirectIndex === -1) return [text]

  const name = args[redirectIndex + 1]
  if (!name) {
    throw gitError(
      msg('bash: syntax error near unexpected token `newline\''),
      'hint.redirectNeedsFile',
    )
  }
  if (args[redirectIndex] === '>>') {
    const previous = world.files[name]
    world.files[name] = previous ? `${previous}\n${text}` : text
  } else {
    world.files[name] = text
  }
  return []
}
