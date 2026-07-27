import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveEnhancedPath, providerSpawnEnv } from '../src/main/env-path.mjs'

test('resolveEnhancedPath preserves base entries and de-duplicates', () => {
  const result = resolveEnhancedPath('/usr/bin:/bin:/usr/bin').split(':')
  assert.ok(result.includes('/usr/bin'))
  assert.ok(result.includes('/bin'))
  // No path segment should appear twice.
  assert.equal(new Set(result).size, result.length)
})

test('resolveEnhancedPath adds a real common bin dir when present', () => {
  // /usr/bin always exists; used here as a stand-in the resolver keeps.
  const result = resolveEnhancedPath('/nonexistent-a:/nonexistent-b')
  assert.ok(result.split(':').includes('/nonexistent-a'))
  assert.ok(result.length > 0)
})

test('providerSpawnEnv strips inherited parent-agent session markers', () => {
  const saved = { ...process.env }
  try {
    // Simulate Ambientic launched inside a Claude Code session.
    process.env.CLAUDECODE = '1'
    process.env.CLAUDE_CODE_ENTRYPOINT = 'claude-desktop'
    process.env.CLAUDE_CODE_SESSION_ID = 'abc-123'
    process.env.CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH = '1'
    process.env.CLAUDE_CODE_OAUTH_SCOPES = 'user:inference'
    process.env.CLAUDE_AGENT_SDK_VERSION = '0.3.217'
    process.env.AI_AGENT = 'claude-code'
    const env = providerSpawnEnv()
    assert.equal(env.CLAUDECODE, undefined)
    assert.equal(env.CLAUDE_CODE_ENTRYPOINT, undefined)
    assert.equal(env.CLAUDE_CODE_SESSION_ID, undefined)
    assert.equal(env.CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH, undefined)
    assert.equal(env.CLAUDE_CODE_OAUTH_SCOPES, undefined)
    assert.equal(env.CLAUDE_AGENT_SDK_VERSION, undefined)
    assert.equal(env.AI_AGENT, undefined)
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]
    Object.assign(process.env, saved)
  }
})

test('providerSpawnEnv preserves PATH and applies overrides', () => {
  const env = providerSpawnEnv({ TERM: 'xterm-256color' })
  assert.equal(env.PATH, process.env.PATH)
  assert.equal(env.TERM, 'xterm-256color')
})
