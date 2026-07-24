import test from 'node:test'
import assert from 'node:assert/strict'
import { agentForCommand } from '../src/main/discovery.js'
import { providerConnectionCommand, providerExecutableCandidates } from '../src/main/connectors.js'

test('detects the personal AgentBase provider commands', () => {
  assert.equal(agentForCommand('/opt/homebrew/bin/claude'), 'claude')
  assert.equal(agentForCommand('/Applications/Codex.app/Contents/Resources/codex'), 'codex')
  assert.equal(agentForCommand('/Users/test/.local/bin/hermes'), 'hermes')
})

test('does not turn a headless Hermes gateway into a terminal pad', () => {
  assert.equal(agentForCommand('/Users/test/.local/bin/hermes gateway start'), '')
})

test('uses provider-owned account login commands', () => {
  assert.equal(providerConnectionCommand('claude'), 'claude /login')
  assert.equal(providerConnectionCommand('codex'), 'codex login')
  assert.equal(providerConnectionCommand('hermes'), 'hermes login')
  assert.equal(providerConnectionCommand('unknown'), '')
})

test('detects Codex from the bundled desktop app without relying on PATH', () => {
  assert.ok(providerExecutableCandidates('codex').includes('/Applications/ChatGPT.app/Contents/Resources/codex'))
})
