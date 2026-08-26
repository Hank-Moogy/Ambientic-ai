import { homedir } from 'node:os'
import { isAbsolute, resolve, sep } from 'node:path'
import { canGrantToolRoot } from './project-scope.mjs'

// One policy for every provider. A Claude PreToolUse hook, a Codex JSON-RPC
// permission request, and a Hermes one all describe the same thing — a tool is
// about to touch something — so they resolve through here rather than each
// growing its own rules and drifting apart.

// Tools that only observe. Reading inside somewhere the user already works is
// not a decision worth interrupting them for.
const READ_ONLY_TOOLS = new Set(['Read', 'Glob', 'Grep', 'NotebookRead', 'LS', 'TodoWrite'])

// Tools whose reach cannot be read off their arguments. A shell command can
// touch anything, so its path arguments prove nothing about its scope.
const OPAQUE_TOOLS = new Set(['Bash', 'BashOutput', 'KillShell', 'WebFetch', 'WebSearch', 'Task'])

const PATH_KEYS = ['file_path', 'path', 'notebook_path', 'edit_file_path']

export function toolPaths (input = {}) {
  const paths = []
  for (const key of PATH_KEYS) {
    const value = input?.[key]
    if (typeof value === 'string' && isAbsolute(value)) paths.push(resolve(value))
  }
  for (const item of Array.isArray(input?.edits) ? input.edits : []) {
    const value = item?.file_path
    if (typeof value === 'string' && isAbsolute(value)) paths.push(resolve(value))
  }
  return paths
}

function within (root, target) {
  return target === root || target.startsWith(`${root}${sep}`)
}

export function grantedBy (roots = [], target = '') {
  if (!target) return ''
  return roots.map((root) => resolve(String(root || ''))).find((root) => root && within(root, target)) || ''
}

// `remembered` holds roots the user already approved for this thread, so a
// second file in a folder they just allowed does not ask again.
export function decideToolPermission ({
  tool = '',
  input = {},
  cwd = '',
  projectRoots = [],
  remembered = [],
  home = homedir()
} = {}) {
  const trusted = [cwd, ...projectRoots].filter(Boolean)
  const paths = toolPaths(input)

  // A remembered root is a full grant: the user said yes to this folder for
  // this thread, so reads and writes inside it both stop asking. Without this,
  // "remember" would silence the first prompt and then ask again on the next
  // file, which is the behaviour that makes people turn approvals off.
  if (paths.length && paths.every((target) => grantedBy(remembered, target))) {
    return { decision: 'allow', reason: 'You already approved this folder for this thread.', scope: '' }
  }

  if (OPAQUE_TOOLS.has(tool)) {
    return { decision: 'ask', reason: `${tool || 'This tool'} can reach outside the project, so it is not granted automatically.`, scope: '' }
  }

  if (!paths.length) {
    // Nothing to locate. Reads are harmless; anything else is the caller's own
    // native permission behaviour, not ours to widen.
    return READ_ONLY_TOOLS.has(tool)
      ? { decision: 'allow', reason: 'Read-only tool with no filesystem target.', scope: '' }
      : { decision: 'ask', reason: `${tool || 'This tool'} was not recognised, so it is not granted automatically.`, scope: '' }
  }

  const outside = paths.filter((target) => !grantedBy(trusted, target))
  if (outside.length) {
    const target = outside[0]
    // Refusing outright is worse than asking: the user can still say yes, and
    // an unanswerable denial is the failure mode this whole broker exists to
    // remove. Only a root nothing should ever hold is refused.
    if (!canGrantToolRoot(target, home)) {
      return { decision: 'deny', reason: `${target} is your home folder or a whole protected collection, which Ambientic never grants.`, scope: '' }
    }
    return { decision: 'ask', reason: `${target} is outside this task's project.`, scope: target }
  }

  if (READ_ONLY_TOOLS.has(tool)) {
    return { decision: 'allow', reason: 'Reading inside a project you already work in.', scope: '' }
  }
  return { decision: 'ask', reason: `${tool || 'This tool'} changes files, so it is confirmed before it runs.`, scope: paths[0] }
}
