import { isAbsolute, resolve, sep } from 'node:path'

export const APPROVAL_PROFILE_IDS = Object.freeze(['ask', 'project', 'auto'])
export const DEFAULT_APPROVAL_PROFILE = 'auto'

const PROFILE_SET = new Set(APPROVAL_PROFILE_IDS)

export function normalizeApprovalProfile (value) {
  const id = String(value || '').trim()
  return PROFILE_SET.has(id) ? id : DEFAULT_APPROVAL_PROFILE
}

export function approvalProfileDetails (value) {
  const id = normalizeApprovalProfile(value)
  if (id === 'ask') {
    return {
      id,
      label: 'Ask me',
      summary: 'Reads stay quiet. Changes, commands, network access, and external actions wait for you.'
    }
  }
  if (id === 'project') {
    return {
      id,
      label: 'Work in project',
      summary: 'Agents may read and edit the selected project. Boundary crossings and risky commands wait for you.'
    }
  }
  return {
    id,
    label: 'Approve routine work',
    summary: 'Routine project work is handled automatically. Sensitive, destructive, or unsupported actions still wait for you.'
  }
}

function codexSandboxPolicy (profile, cwd) {
  if (profile === 'ask') return { type: 'readOnly' }
  return {
    type: 'workspaceWrite',
    ...(cwd ? { writableRoots: [resolve(cwd)] } : {}),
    networkAccess: false
  }
}

export function codexApprovalSettings (value, { cwd = '', mode = 'build', thread = false } = {}) {
  const profile = normalizeApprovalProfile(value)
  const readOnly = mode !== 'build' || profile === 'ask'
  const sandboxType = readOnly ? 'readOnly' : 'workspaceWrite'
  return {
    approvalPolicy: 'on-request',
    approvalsReviewer: profile === 'auto' && !readOnly ? 'auto_review' : 'user',
    ...(thread
      ? { sandbox: sandboxType }
      : { sandboxPolicy: readOnly ? { type: 'readOnly' } : codexSandboxPolicy(profile, cwd) })
  }
}

export function claudePermissionMode (value, mode = 'build') {
  if (mode !== 'build') return 'plan'
  const profile = normalizeApprovalProfile(value)
  if (profile === 'ask') return 'manual'
  if (profile === 'project') return 'acceptEdits'
  return 'auto'
}

function within (root, target) {
  return target === root || target.startsWith(`${root}${sep}`)
}

function hermesRawInput (request = {}) {
  const input = request.params?.toolCall?.rawInput
  return input && typeof input === 'object' ? input : {}
}

// Hermes ACP asks about edits and commands, but it does not expose a native
// automatic safety reviewer. Quiet only the decision we can prove locally:
// an edit whose every target remains inside the selected project. Dangerous
// commands and unknown requests still go to the person.
export function hermesAutoApproval (value, request = {}, cwd = '') {
  const profile = normalizeApprovalProfile(value)
  if (profile === 'ask' || !isAbsolute(String(cwd || ''))) return null
  const kind = String(request.params?.toolCall?.kind || '').toLowerCase()
  if (kind !== 'edit') return null
  const input = hermesRawInput(request)
  const args = input.arguments && typeof input.arguments === 'object' ? input.arguments : {}
  const values = [args.file_path, args.path, input.path]
    .concat(Array.isArray(args.edits) ? args.edits.map((item) => item?.file_path) : [])
    .filter((item) => typeof item === 'string' && isAbsolute(item))
    .map((item) => resolve(item))
  if (!values.length) return null
  const root = resolve(cwd)
  if (!values.every((target) => within(root, target))) return null
  const option = (request.params?.options || []).find((item) => /allow/i.test(`${item?.kind || ''} ${item?.name || ''}`))
  return option ? { outcome: 'selected', optionId: option.optionId } : null
}
