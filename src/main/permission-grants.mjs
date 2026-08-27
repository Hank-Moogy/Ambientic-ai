import { randomUUID } from 'node:crypto'
import { dirname, isAbsolute, resolve, sep } from 'node:path'

// What the user said yes to, and how far that yes reaches.
//
//   once    — not a grant at all; the answer covers this request and nothing more
//   session — every thread in this run of the app, forgotten on restart
//   always  — every thread, every provider, persisted until revoked
//
// A grant is deliberately coarser than the request that produced it. Approving
// one file in a folder and then being asked about its neighbour is what teaches
// people to stop reading these prompts, and a permission nobody reads is worse
// than no permission at all.
export const GRANT_SCOPES = new Set(['session', 'always'])

const READ_ONLY_TOOLS = new Set(['Read', 'Glob', 'Grep', 'NotebookRead', 'LS'])

function within (root, target) {
  if (!root || !target) return false
  return target === root || target.startsWith(`${root}${sep}`)
}

export function grantMatches (grant, { tool = '', paths = [], cwd = '' } = {}) {
  if (!grant) return false
  if (grant.tool && grant.tool !== tool) return false
  // A read-only grant must not quietly authorise a change.
  if (!grant.write && !READ_ONLY_TOOLS.has(tool)) return false
  if (!grant.root) return true
  const root = resolve(grant.root)
  // A tool that names no path is judged by where it runs, which is how a grant
  // like "allow Bash in this project" can mean anything at all.
  if (!paths.length) return within(root, resolve(String(cwd || '')))
  return paths.every((target) => within(root, resolve(target)))
}

export function matchingGrant (grants = [], request = {}) {
  return grants.find((grant) => grantMatches(grant, request)) || null
}

// Turns an answered request into the grant it implies. `scope` is the button the
// user pressed, so the shape of the grant follows what they were actually
// looking at when they pressed it.
export function grantForRequest ({ tool = '', paths = [], cwd = '', scope = 'session', threadId = '', isDirectory = () => false } = {}) {
  if (!GRANT_SCOPES.has(scope)) return null
  const write = !READ_ONLY_TOOLS.has(tool)
  const target = paths[0] || ''
  if (target && isAbsolute(target)) {
    const root = isDirectory(target) ? resolve(target) : dirname(resolve(target))
    // A path grant covers the folder for any tool: the user approved a place,
    // not one way of touching it.
    return { id: randomUUID(), scope, threadId: scope === 'session' ? threadId : '', tool: '', root, write }
  }
  // No path to anchor to — a shell command, a fetch. Bind it to the tool inside
  // the folder it runs in, so "always allow Bash here" cannot become "allow Bash
  // anywhere" the next time the agent moves.
  const root = isAbsolute(String(cwd || '')) ? resolve(String(cwd)) : ''
  return { id: randomUUID(), scope, threadId: scope === 'session' ? threadId : '', tool: String(tool || ''), root, write: true }
}

export function applicableGrants (grants = [], threadId = '') {
  return grants.filter((grant) => grant.scope === 'always' || (grant.scope === 'session' && grant.threadId === threadId))
}

export function describeGrant (grant) {
  if (!grant) return ''
  const where = grant.root ? grant.root.split('/').filter(Boolean).at(-1) || grant.root : 'anywhere'
  const what = grant.tool ? grant.tool : (grant.write ? 'Read and change files' : 'Read files')
  return `${what} in ${where}`
}

// Persisted grants only. Session grants are deliberately not written to disk:
// "for this session" that survived a restart would be a promise the app broke.
export function persistableGrants (grants = []) {
  return grants.filter((grant) => grant.scope === 'always')
}
