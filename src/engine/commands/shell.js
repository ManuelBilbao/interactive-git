// A handful of shell commands, just enough to create and change files without
// leaving the terminal. Files can also be edited from the side panel.

import { gitError } from '../errors.js'
import { msg } from '../messages.js'

export function ls(world) {
  const names = Object.keys(world.files).sort()
  return names.length > 0 ? [names.join('  ')] : []
}

export function pwd(world) {
  return [`/${world.folder}`]
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
