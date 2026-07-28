import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { chmod, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ClaudeAuthService,
  claudeAuthPhase,
  cleanClaudeAuthOutput,
  parseClaudeAccountState,
  parseClaudeCliAuthStatus,
  prepareClaudeAuthorizationCode,
  validClaudeAuthUrl
} from '../src/main/claude-auth-service.mjs'

const execFileAsync = promisify(execFile)
const helperPath = fileURLToPath(new URL('../resources/claude_pty.py', import.meta.url))

test('cleans Claude login terminal output for the in-app wizard', () => {
  const value = cleanClaudeAuthOutput('\u001b[32mSign in\u001b[0m\r\nOpen https://claude.ai/login\u0007')
  assert.equal(value, 'Sign in\n\nOpen https://claude.ai/login')
})

test('bounds Claude login output retained by Ambientic', () => {
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

test('treats the Claude CLI live auth result as authoritative', () => {
  assert.deepEqual(parseClaudeCliAuthStatus('{"loggedIn":false,"authMethod":"none","apiProvider":"firstParty"}'), {
    connected: false,
    authMethod: '',
    detail: 'Claude Code reports that it is signed out.'
  })
  assert.deepEqual(parseClaudeCliAuthStatus({ loggedIn: true, authMethod: 'claude.ai' }), {
    connected: true,
    authMethod: 'claude.ai',
    detail: 'Claude Code confirmed claude.ai authentication.'
  })
  assert.equal(parseClaudeCliAuthStatus('error: unknown option --json'), null)
})

function waitFor (predicate, timeout = 5000, label = 'Claude auth test state') {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const check = () => {
      const value = predicate()
      if (value) return resolve(value)
      if (Date.now() - started >= timeout) return reject(new Error(`Timed out waiting for ${label}`))
      setTimeout(check, 20)
    }
    check()
  })
}

test('keeps Claude OAuth callback alive until live auth verification succeeds', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'ambientic-claude-auth-'))
  const marker = join(directory, 'authenticated')
  const fakeClaude = join(directory, 'claude.mjs')
  const source = `#!/usr/bin/env node
import { existsSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
const marker = process.env.FAKE_CLAUDE_AUTH_MARKER
const args = process.argv.slice(2)
if (args.join(' ') === 'auth status --json') {
  const loggedIn = existsSync(marker)
  process.stdout.write(JSON.stringify({ loggedIn, authMethod: loggedIn ? 'claude.ai' : 'none', apiProvider: 'firstParty' }))
  process.exit(loggedIn ? 0 : 1)
}
if (args.join(' ') !== 'auth login --claudeai') process.exit(2)
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1')
  if (url.pathname !== '/callback' || url.searchParams.get('state') !== 'ambientic-state') {
    response.writeHead(400); response.end('invalid callback'); return
  }
  writeFileSync(marker, 'connected')
  response.writeHead(200, { 'content-type': 'text/plain' })
  response.end('Connected. Return to Ambientic.', () => server.close())
})
server.listen(0, '127.0.0.1', () => {
  const redirect = encodeURIComponent('http://127.0.0.1:' + server.address().port + '/callback')
  process.stdout.write('Welcome back\\nOpening browser to sign in…\\nhttps://claude.ai/oauth/authorize?client_id=test&response_type=code&redirect_uri=' + redirect + '&state=ambientic-state\\n')
})
`
  await writeFile(fakeClaude, source)
  await chmod(fakeClaude, 0o755)

  let openedUrl = ''
  const states = []
  const service = new ClaudeAuthService({
    path: fakeClaude,
    helperPath,
    env: { ...process.env, FAKE_CLAUDE_AUTH_MARKER: marker },
    onUrl: async (url) => { openedUrl = url }
  })
  context.after(() => service.stop())
  service.on('change', (state) => states.push(state))

  await service.start()
  await waitFor(() => openedUrl, 15_000, `OAuth URL; last state: ${JSON.stringify(service.getState())}`)
  assert.notEqual(service.getState().status, 'connected', 'generic Welcome back text must not finish authentication')
  assert.ok(service.child, 'OAuth callback owner must remain alive while the browser is open')

  const authorization = new URL(openedUrl)
  const callback = new URL(authorization.searchParams.get('redirect_uri'))
  callback.searchParams.set('code', 'one-time-code')
  callback.searchParams.set('state', authorization.searchParams.get('state'))
  const response = await fetch(callback)
  assert.equal(response.status, 200)
  assert.match(await response.text(), /Return to Ambientic/)

  await waitFor(() => service.getState().status === 'connected', 15_000, `verified connection; last state: ${JSON.stringify(service.getState())}`)
  assert.equal(service.getState().phase, 'connected')
  assert.ok(states.some((state) => state.phase === 'browser'))
})
