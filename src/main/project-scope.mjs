import { homedir } from 'node:os'
import { resolve, sep } from 'node:path'

const PROTECTED_HOME_CHILDREN = new Set([
  'Desktop',
  'Documents',
  'Downloads',
  'Library',
  'Movies',
  'Music',
  'Pictures',
  'Public'
])

export function isBroadProjectRoot (cwd, home = homedir()) {
  if (!cwd) return true
  const target = resolve(String(cwd))
  const userHome = resolve(home)
  if (target === '/' || target === userHome) return true
  return userHome.startsWith(`${target}${sep}`)
}

export function protectedHomeChild (path, home = homedir()) {
  const target = resolve(String(path || ''))
  const userHome = resolve(home)
  if (!target.startsWith(`${userHome}${sep}`)) return ''
  const child = target.slice(userHome.length + 1).split(sep)[0]
  return PROTECTED_HOME_CHILDREN.has(child) ? child : ''
}

export function canInspectProjectRoot (cwd, home = homedir()) {
  return !isBroadProjectRoot(cwd, home) && !protectedHomeChild(cwd, home)
}
