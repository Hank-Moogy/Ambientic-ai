import { homedir } from 'node:os'
import { isAbsolute, resolve, sep } from 'node:path'
import { canGrantToolRoot } from './project-scope.mjs'
import { matchingGrant } from './permission-grants.mjs'
import { normalizeApprovalProfile } from './approval-profile.mjs'

// One policy for every provider. A Claude PreToolUse hook, a Codex JSON-RPC
// permission request, and a Hermes one all describe the same thing — a tool is
// about to touch something — so they resolve through here rather than each
// growing its own rules and drifting apart.

// Tools that only observe. Reading inside somewhere the user already works is
// not a decision worth interrupting them for.
//
// `BashOutput` and `KillShell` act on a shell this agent already started, and
// starting it was the approved decision: asking again to read that command's
// output, or to stop it, is a prompt with no choice left in it. `WebSearch`
// returns results and cannot reach the machine — unlike `WebFetch`, which takes
// a URL the agent chose and so is still confirmed.
const READ_ONLY_TOOLS = new Set(['Read', 'Glob', 'Grep', 'NotebookRead', 'LS', 'TodoWrite', 'BashOutput', 'KillShell', 'WebSearch'])

// Tools whose reach cannot be read off their arguments. A shell command can
// touch anything, so its path arguments prove nothing about its scope.
const OPAQUE_TOOLS = new Set(['Bash', 'WebFetch', 'Task'])

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

// `grants` are the standing answers the user has already given — for this
// thread or for good. They are checked before anything else except the refusals
// nothing should ever override, because re-asking a question already answered is
// what turns a permission prompt into noise people click through.
export function decideToolPermission ({
  tool = '',
  input = {},
  cwd = '',
  projectRoots = [],
  grants = [],
  approvalProfile = 'ask',
  home = homedir()
} = {}) {
  const profile = normalizeApprovalProfile(approvalProfile)
  const trusted = [cwd, ...projectRoots].filter(Boolean)
  const paths = toolPaths(input)

  // A path nothing should ever hold is refused even with a grant behind it, so a
  // standing permission cannot widen into the home folder by accident.
  const forbidden = paths.find((target) => !canGrantToolRoot(target, home))
  if (forbidden) {
    return { decision: 'deny', reason: `${forbidden} is your home folder or a whole protected collection, which Ambientic never grants.`, scope: '' }
  }

  const granted = matchingGrant(grants, { tool, paths, cwd })
  if (granted) {
    return {
      decision: 'allow',
      reason: granted.scope === 'always' ? 'You allowed this permanently.' : 'You allowed this for this thread.',
      scope: ''
    }
  }

  if (OPAQUE_TOOLS.has(tool)) {
    // In Approve routine mode, Claude's native auto reviewer has substantially
    // more command context than this path-only broker. Returning `defer` lets
    // that reviewer decide while Ambientic retains the protected-path ceiling.
    if (profile === 'auto') return { decision: 'defer', reason: 'Use the provider safety reviewer for this action.', scope: '' }
    // Anchored to where it runs, not to nothing: without a scope the approval
    // card could offer no way to remember the answer, so a shell command asked
    // again on every single call.
    return { decision: 'ask', reason: `${tool || 'This tool'} can reach outside the project, so it is confirmed before it runs.`, scope: cwd || '' }
  }

  if (!paths.length) {
    // Nothing to locate. Reads are harmless; anything else is the caller's own
    // native permission behaviour, not ours to widen.
    return READ_ONLY_TOOLS.has(tool)
      ? { decision: 'allow', reason: 'Read-only tool with no filesystem target.', scope: '' }
      : profile === 'auto'
        ? { decision: 'defer', reason: 'Use the provider safety reviewer for this action.', scope: '' }
        : { decision: 'ask', reason: `${tool || 'This tool'} was not recognised, so it is not granted automatically.`, scope: '' }
  }

  const outside = paths.filter((target) => !grantedBy(trusted, target))
  if (outside.length) {
    // Refusing outright is worse than asking: the user can still say yes, and an
    // unanswerable denial is the failure mode this whole broker exists to remove.
    return { decision: 'ask', reason: `${outside[0]} is outside this task's project.`, scope: outside[0] }
  }

  if (READ_ONLY_TOOLS.has(tool)) {
    return { decision: 'allow', reason: 'Reading inside a project you already work in.', scope: '' }
  }
  if (profile !== 'ask') return { decision: 'allow', reason: 'Changing files inside the selected project.', scope: '' }
  return { decision: 'ask', reason: `${tool || 'This tool'} changes files, so it is confirmed before it runs.`, scope: paths[0] }
}
