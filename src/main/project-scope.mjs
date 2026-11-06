import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'

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

export function projectLaunchAccess (cwd, home = homedir()) {
  const broad = isBroadProjectRoot(cwd, home)
  const protectedCollection = broad ? '' : protectedHomeChild(cwd, home)
  return {
    broad,
    protectedCollection,
    ambienticCanInspect: !broad && !protectedCollection,
    providerRunsInWorkspace: !broad,
    warning: protectedCollection
      ? `This project is inside ${protectedCollection}. macOS may show file-access requests under Ambientic's name because Ambientic launches the agent.`
      : broad
        ? 'Choose a specific project folder instead of your whole home or filesystem.'
        : ''
  }
}

// A tool root is a directory the provider may read and write for one turn. It is
// a narrower question than `canInspectProjectRoot`: Ambientic declines to *index*
// a protected folder on its own initiative, but a folder the user attached by
// hand is already consented to, so refusing to grant it just makes the agent
// report that it cannot open the file the user just handed it.
export function canGrantToolRoot (path, home = homedir()) {
  const target = resolve(String(path || ''))
  if (!target || isBroadProjectRoot(target, home)) return false
  // The protected folder itself is still too broad to hand over wholesale; a
  // real project inside it is not.
  const child = protectedHomeChild(target, home)
  return !(child && target === join(resolve(home), child))
}

// A handoff is an explicit user action, so a real project inside Documents or
// another protected collection is eligible in the same way as a folder the
// user attaches by hand. Prefer the canonical Ambientic project binding when
// the provider session itself was launched from an overly broad directory.
export function handoverProjectRoot ({ cwd = '', boundRoot = '' } = {}, home = homedir()) {
  for (const candidate of [boundRoot, cwd]) {
    const path = String(candidate || '').trim()
    if (!isAbsolute(path) || !canGrantToolRoot(path, home)) continue
    return resolve(path)
  }
  return ''
}

function reachableFrom (base, root) {
  return Boolean(base) && (root === base || root.startsWith(`${base}${sep}`))
}

// Directories a turn needs beyond its project root. An attachment outside the
// project is otherwise announced to the agent as a path it has no permission to
// open, which is how "the file I attached is unreadable" happens.
export function additionalToolRoots (cwd, attachments = [], home = homedir()) {
  const base = String(cwd || '') ? resolve(String(cwd)) : ''
  const roots = new Set()
  for (const item of attachments) {
    const path = String(item?.path || '')
    if (!isAbsolute(path)) continue
    const resolved = resolve(path)
    const root = item?.kind === 'folder' ? resolved : dirname(resolved)
    if (reachableFrom(base, root)) continue
    if (!canGrantToolRoot(root, home)) continue
    roots.add(root)
  }
  return [...roots]
}

// The projects an agent may look through on its own. Discovery is not a prompt
// instruction — an agent cannot find what it has no permission to read, so the
// roots it is told about have to be the roots it was actually granted.
//
// This bound is not a policy. Every root becomes one argument on the provider
// command line, and the ceiling that matters is the operating system's, which is
// orders of magnitude above any plausible number of local projects. It exists so
// a corrupted or runaway project list cannot produce an unspawnable command, and
// should never be the reason an agent cannot see a project the user works in.
export const DISCOVERY_ROOT_LIMIT = 256

export function discoveryToolRoots (cwd, projects = [], home = homedir(), limit = DISCOVERY_ROOT_LIMIT) {
  const base = String(cwd || '') ? resolve(String(cwd)) : ''
  const roots = new Set()
  for (const project of projects) {
    const path = String(project?.cwd || project?.rootPath || '')
    if (!isAbsolute(path)) continue
    const root = resolve(path)
    if (reachableFrom(base, root) || !canGrantToolRoot(root, home)) continue
    roots.add(root)
    if (roots.size >= limit) break
  }
  return [...roots]
}
