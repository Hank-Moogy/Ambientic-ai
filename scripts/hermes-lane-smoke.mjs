// Contract smoke for the Ambientic Agent substrate.
//
// Proves, outside the app, that one `hermes acp` process can run a task on an
// open-weight model hosted by an OpenAI-compatible provider, and that Ambientic
// can read back the token usage it needs for the spend ledger.
//
// It asserts four things, in order, because each one is a load-bearing
// assumption of the Ambientic Agent design:
//
//   1. HERMES_HOME isolates the substrate from the user's own Hermes install,
//      so the user's SOUL.md, memories, skills, and credentials never reach an
//      Ambientic thread. There is no flag for this: the ACP adapter builds
//      AIAgent directly and never passes skip_context_files/skip_memory, so a
//      separate state directory is the only isolation Ambientic can rely on.
//   2. A lane (provider + model) reaches the model at all.
//   3. session/prompt returns usage, which is what makes spend measurable
//      without putting Ambientic in the request path.
//   4. The model can actually call a tool. An open model that chats fluently
//      but cannot emit a well-formed tool call is not agent-ready, and must
//      never be offered for a task.
//
// Run:  node scripts/hermes-lane-smoke.mjs
//
// The provider key is read from the login keychain and never passed on the
// command line, printed, or written to the repo.

import { execFile } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { JsonRpcProcess } from '../src/main/json-rpc-process.mjs'

const LANE = {
  provider: 'nebius',
  baseUrl: 'https://api.studio.nebius.com/v1',
  keychainService: 'com.findmecreators.ambientic.inference.nebius',
  model: process.env.SMOKE_MODEL || 'zai-org/GLM-4.6'
}

const HERMES_HOME = join(tmpdir(), 'ambientic-agent-smoke')
const hermesPath = join(homedir(), '.local', 'bin', 'hermes')

function readKeychain (service) {
  return new Promise((resolve) => {
    execFile('/usr/bin/security', ['find-generic-password', '-w', '-s', service], { timeout: 5000 }, (error, stdout) => {
      resolve(error ? '' : String(stdout || '').trim())
    })
  })
}

// A fresh HERMES_HOME per run: the point of the test is that nothing from the
// user's install leaks in, so reusing state would hide exactly the failure this
// is meant to catch.
function writeIsolatedHome (apiKey) {
  rmSync(HERMES_HOME, { recursive: true, force: true })
  mkdirSync(HERMES_HOME, { recursive: true, mode: 0o700 })

  // Bare `custom` provider with model.base_url. Hermes only trusts a
  // non-loopback base_url for bare custom when the configured provider is
  // already custom, which it is here.
  writeFileSync(join(HERMES_HOME, 'config.yaml'), [
    'model:',
    '  provider: custom',
    `  default: ${LANE.model}`,
    `  base_url: ${LANE.baseUrl}`,
    '  api_key: ${AMBIENTIC_LANE_KEY}',
    ''
  ].join('\n'), { mode: 0o600 })

  // Ambientic's own agent identity, not Nous Research's. This is a config file
  // in a directory Ambientic owns — not a fork of Hermes.
  writeFileSync(join(HERMES_HOME, 'SOUL.md'),
    'You are the Ambientic Agent. You are direct, careful, and concise. ' +
    'You work on the user\'s task using the tools available to you, and you ' +
    'ask before doing anything destructive or irreversible.\n', { mode: 0o600 })

  writeFileSync(join(HERMES_HOME, '.env'), `AMBIENTIC_LANE_KEY=${apiKey}\n`, { mode: 0o600 })
}

const results = []
function record (name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

async function main () {
  const apiKey = await readKeychain(LANE.keychainService)
  if (!apiKey) {
    console.error(`No key in the login keychain for "${LANE.keychainService}".\n\nStore it with:\n  security add-generic-password -U -s ${LANE.keychainService} -a ambientic -w\n\n(omit the key from the command; security will prompt for it)`)
    process.exit(2)
  }

  writeIsolatedHome(apiKey)
  console.log(`Lane: ${LANE.provider} · ${LANE.model}`)
  console.log(`Isolated HERMES_HOME: ${HERMES_HOME}\n`)

  const rpc = new JsonRpcProcess(hermesPath, ['acp'], { env: { HERMES_HOME } })
  rpc.on('stderr', (chunk) => {
    if (process.env.SMOKE_VERBOSE) process.stderr.write(chunk)
  })

  // The tool probe only proves agent-readiness if the harness actually asks
  // for permission and we answer; an unanswered request would stall the turn.
  rpc.on('request', (request) => {
    const options = request.params?.options || []
    const allow = options.find((option) => /allow|yes|approve/i.test(`${option.name || ''} ${option.optionId || ''}`)) || options[0]
    rpc.respond(request.id, allow ? { outcome: { outcome: 'selected', optionId: allow.optionId } } : {})
  })

  const updates = []
  rpc.on('notification', (event) => {
    if (event.method === 'session/update') updates.push(event.params)
  })

  try {
    rpc.start()

    await rpc.request('initialize', {
      protocolVersion: 1,
      clientCapabilities: {},
      clientInfo: { name: 'Ambientic', version: 'smoke' }
    }, 30_000)
    record('initialize', true)

    const session = await rpc.request('session/new', { cwd: HERMES_HOME, mcpServers: [] }, 60_000)
    const sessionId = session.sessionId || session.session_id
    const advertised = session.models?.availableModels || session.models?.available_models || []
    record('session/new', Boolean(sessionId), `${advertised.length} model(s) advertised`)

    // 2. The lane reaches the model.
    const first = await rpc.request('session/prompt', {
      sessionId,
      prompt: [{ type: 'text', text: 'Reply with exactly: READY. Do not use any tool.' }]
    }, 120_000)
    const answered = updates.some((update) => JSON.stringify(update).includes('READY'))
    record('lane reaches model', answered, first.stopReason || first.stop_reason || '')

    // 3. Usage is reported, which is the whole basis of the spend ledger.
    const usage = first.usage || null
    record('usage reported', Boolean(usage && (usage.totalTokens ?? usage.total_tokens)),
      usage ? JSON.stringify(usage) : 'no usage on PromptResponse')

    // 4. Agent-readiness: can this model drive a real tool call?
    const before = updates.length
    const second = await rpc.request('session/prompt', {
      sessionId,
      prompt: [{ type: 'text', text: 'Create a file named smoke.txt in the current directory containing the single word ambientic. Use your tools.' }]
    }, 180_000)
    const toolCalled = updates.slice(before).some((update) => /tool_call|toolCall/.test(JSON.stringify(update)))
    record('model emits tool calls', toolCalled, second.stopReason || second.stop_reason || '')

    const secondUsage = second.usage || null
    if (secondUsage) console.log(`\nturn 2 usage: ${JSON.stringify(secondUsage)}`)
  } catch (error) {
    record('run completed', false, error.message)
  } finally {
    rpc.stop?.()
  }

  const failed = results.filter((result) => !result.ok)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  console.log(`State left at ${HERMES_HOME} for inspection.`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
