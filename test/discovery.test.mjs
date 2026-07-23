import test from 'node:test'
import assert from 'node:assert/strict'
import { agentForCommand } from '../src/main/discovery.js'

test('detects the personal AgentBase provider commands', () => {
  assert.equal(agentForCommand('/opt/homebrew/bin/claude'), 'claude')
  assert.equal(agentForCommand('/Applications/Codex.app/Contents/Resources/codex'), 'codex')
  assert.equal(agentForCommand('/Users/test/.local/bin/hermes'), 'hermes')
})

test('does not turn a headless Hermes gateway into a terminal pad', () => {
  assert.equal(agentForCommand('/Users/test/.local/bin/hermes gateway start'), '')
})
