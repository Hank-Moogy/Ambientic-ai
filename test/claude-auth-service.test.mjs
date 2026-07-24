import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import {
  ClaudeAuthService,
  claudeAuthPhase,
  cleanClaudeAuthOutput,
  parseClaudeAccountState,
  prepareClaudeAuthorizationCode,
  validClaudeAuthUrl
} from '../src/main/claude-auth-service.mjs'

const execFileAsync = promisify(execFile)
const helperPath = fileURLToPath(new URL('../resources/claude_pty.py', import.meta.url))

test('cleans Claude login terminal output for the in-app wizard', () => {
  const value = cleanClaudeAuthOutput('\u001b[32mSign in\u001b[0m\r\nOpen https://claude.ai/login\u0007')
  assert.equal(value, 'Sign in\n\nOpen https://claude.ai/login')
})

test('bounds Claude login output retained by AgentBase', () => {
  assert.ok(cleanClaudeAuthOutput('x'.repeat(20_000)).length <= 12_000)
})

test('relays a child process through a real PTY without requiring parent stdin to be a terminal', async () => {
  const { stdout } = await execFileAsync('/usr/bin/python3', [helperPath, '/bin/echo', 'PTY ready'])
  assert.match(stdout, /PTY ready/)
  assert.doesNotMatch(stdout, /tcgetattr|Operation not supported/)
})

test('rejects a wrapped or truncated Claude OAuth URL missing redirect_uri', () => {
  assert.equal(validClaudeAuthUrl('https://claude.ai/oauth/authorize?client_id=agentbase'), '')
  assert.equal(
    validClaudeAuthUrl('https://claude.ai/oauth/authorize?client_id=agentbase&redirect_uri=http%3A%2F%2Flocalhost%3A1234%2Fcallback'),
    'https://claude.ai/oauth/authorize?client_id=agentbase&redirect_uri=http%3A%2F%2Flocalhost%3A1234%2Fcallback'
  )
})

test('recognizes Claude browser and code phases even when the TUI removes spaces', () => {
  assert.equal(claudeAuthPhase('Opening browser to sign in…'), 'browser')
  assert.equal(claudeAuthPhase('Pastecodehereifprompted>'), 'code')
  assert.equal(claudeAuthPhase('spinner redraw only', 'verifying'), 'verifying')
})

test('normalizes a one-time Claude authorization code without retaining line breaks', () => {
  assert.equal(prepareClaudeAuthorizationCode('  code-part#state-part\n'), 'code-part#state-part')
  assert.equal(prepareClaudeAuthorizationCode('x'.repeat(5000)).length, 4096)
})

test('submits a Claude authorization code once without adding it to UI state', () => {
  let written = ''
  const service = new ClaudeAuthService({ path: '/not-used', helperPath: '/not-used' })
  service.state = { ...service.state, status: 'waiting', phase: 'code', output: 'Paste code here if prompted>' }
  service.child = { stdin: { writable: true, write: (value) => { written += value } } }
  service.verify = async () => false
  assert.equal(service.input({ text: 'secret-code#state' }), true)
  assert.equal(written, 'secret-code#state\r')
  assert.equal(service.state.phase, 'verifying')
  assert.doesNotMatch(service.state.output, /secret-code/)
})

test('reads only non-secret Claude account metadata for login verification', () => {
  assert.deepEqual(
    parseClaudeAccountState({ oauthAccount: { accountUuid: 'account-id', emailAddress: 'person@example.com', accessToken: 'must-not-leak' } }),
    { connected: true, email: 'person@example.com', detail: 'Claude subscription account is present in Claude Code.' }
  )
  assert.equal(parseClaudeAccountState({ oauthAccount: { emailAddress: 'person@example.com' } }).connected, false)
})
