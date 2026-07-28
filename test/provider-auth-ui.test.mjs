import test from 'node:test'
import assert from 'node:assert/strict'
import { claudeAuthPresentation } from '../src/renderer/provider-auth-ui.mjs'

test('Claude authentication success becomes a toast instead of reopening the modal', () => {
  assert.equal(claudeAuthPresentation(null), 'none')
  assert.equal(claudeAuthPresentation({ status: 'idle' }), 'none')
  assert.equal(claudeAuthPresentation({ status: 'connected' }), 'success')
  assert.equal(claudeAuthPresentation({ status: 'waiting' }), 'wizard')
  assert.equal(claudeAuthPresentation({ status: 'failed' }), 'wizard')
})
