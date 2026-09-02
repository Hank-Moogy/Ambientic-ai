import test from 'node:test'
import assert from 'node:assert/strict'
import {
  approvalProfileDetails,
  claudePermissionMode,
  codexApprovalSettings,
  hermesAutoApproval,
  normalizeApprovalProfile
} from '../src/main/approval-profile.mjs'

test('approval profiles normalize to the safe routine-work default', () => {
  assert.equal(normalizeApprovalProfile('ask'), 'ask')
  assert.equal(normalizeApprovalProfile('project'), 'project')
  assert.equal(normalizeApprovalProfile('auto'), 'auto')
  assert.equal(normalizeApprovalProfile('unknown'), 'auto')
  assert.match(approvalProfileDetails('auto').summary, /Sensitive, destructive/)
})

test('Codex receives an explicit sandbox and reviewer for every profile', () => {
  assert.deepEqual(codexApprovalSettings('ask', { cwd: '/tmp/project' }), {
    approvalPolicy: 'on-request',
    approvalsReviewer: 'user',
    sandboxPolicy: { type: 'readOnly' }
  })
  assert.deepEqual(codexApprovalSettings('project', { cwd: '/tmp/project' }), {
    approvalPolicy: 'on-request',
    approvalsReviewer: 'user',
    sandboxPolicy: { type: 'workspaceWrite', writableRoots: ['/tmp/project'], networkAccess: false }
  })
  assert.deepEqual(codexApprovalSettings('auto', { cwd: '/tmp/project' }), {
    approvalPolicy: 'on-request',
    approvalsReviewer: 'auto_review',
    sandboxPolicy: { type: 'workspaceWrite', writableRoots: ['/tmp/project'], networkAccess: false }
  })
  assert.deepEqual(codexApprovalSettings('auto', { cwd: '/tmp/project', mode: 'plan' }), {
    approvalPolicy: 'on-request',
    approvalsReviewer: 'user',
    sandboxPolicy: { type: 'readOnly' }
  })
  assert.deepEqual(codexApprovalSettings('auto', { cwd: '/tmp/project', thread: true }), {
    approvalPolicy: 'on-request',
    approvalsReviewer: 'auto_review',
    sandbox: 'workspaceWrite'
  })
})

test('Claude maps the same intent to native permission modes', () => {
  assert.equal(claudePermissionMode('ask'), 'manual')
  assert.equal(claudePermissionMode('project'), 'acceptEdits')
  assert.equal(claudePermissionMode('auto'), 'auto')
  assert.equal(claudePermissionMode('auto', 'plan'), 'plan')
})

test('Hermes quietly approves only proven in-project edits', () => {
  const request = (path, kind = 'edit') => ({
    params: {
      toolCall: { kind, rawInput: { arguments: { file_path: path } } },
      options: [
        { optionId: 'allow_once', kind: 'allow_once', name: 'Allow edit' },
        { optionId: 'deny', kind: 'reject_once', name: 'Deny' }
      ]
    }
  })
  assert.deepEqual(hermesAutoApproval('auto', request('/tmp/project/src/app.js'), '/tmp/project'), {
    outcome: 'selected',
    optionId: 'allow_once'
  })
  assert.equal(hermesAutoApproval('project', request('/tmp/other/app.js'), '/tmp/project'), null)
  assert.equal(hermesAutoApproval('ask', request('/tmp/project/app.js'), '/tmp/project'), null)
  assert.equal(hermesAutoApproval('auto', request('/tmp/project', 'execute'), '/tmp/project'), null)
})
