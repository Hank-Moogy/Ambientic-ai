import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { INFERENCE_PROVIDERS, createInferenceService } from '../src/main/inference-service.mjs'
import { createTaskSummarizer } from '../src/main/summarizer.js'

function fakeKeychain (initial = {}) {
  const entries = new Map(Object.entries(initial))
  return {
    entries,
    read: async (service) => entries.get(service) || '',
    write: async (service, key) => { entries.set(service, key) },
    remove: async (service) => { entries.delete(service) }
  }
}

function jsonResponse (payload, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => payload, text: async () => JSON.stringify(payload) }
}

function harness ({ keychain = fakeKeychain(), environment = {}, handler } = {}) {
  const calls = []
  const directory = mkdtempSync(join(tmpdir(), 'ambientic-inference-'))
  const service = createInferenceService({
    stateDirectory: directory,
    keychain,
    environment,
    fetchImpl: async (url, options) => {
      calls.push({ url, options, body: options?.body ? JSON.parse(options.body) : null })
      return handler(url, options)
    },
    now: () => '2026-08-16T00:00:00.000Z'
  })
  return { service, calls, directory, keychain, cleanup: () => rmSync(directory, { recursive: true, force: true }) }
}

const modelList = jsonResponse({ data: [{ id: 'Qwen/Qwen3-4B-instruct' }, { id: 'meta-llama/Llama-3.1-70B' }] })

test('catalogs Nebius Token Factory first and keeps every provider OpenAI-compatible', () => {
  assert.equal(INFERENCE_PROVIDERS[0].id, 'nebius')
  assert.equal(INFERENCE_PROVIDERS[0].label, 'Nebius Token Factory')
  assert.deepEqual(INFERENCE_PROVIDERS.map((provider) => provider.id), ['nebius', 'fireworks', 'openrouter'])
  for (const provider of INFERENCE_PROVIDERS) {
    assert.match(provider.baseUrl, /^https:\/\//)
    assert.ok(provider.keychainService.startsWith('com.findmecreators.ambientic.inference.'))
  }
})

test('connecting a provider stores the key in the keychain and never in local settings', async () => {
  const { service, directory, keychain, cleanup } = harness({ handler: async () => modelList })
  try {
    const result = await service.saveKey('nebius', '  nebius_secret_value  ')
    assert.equal(result.connected, true)
    assert.equal(result.keySource, 'keychain')
    assert.equal(result.keyHint, '…alue')
    assert.equal(keychain.entries.get('com.findmecreators.ambientic.inference.nebius'), 'nebius_secret_value')

    const saved = readFileSync(join(directory, 'inference.json'), 'utf8')
    assert.equal(saved.includes('nebius_secret_value'), false)
    assert.equal(JSON.parse(saved).providers.nebius.model, 'Qwen/Qwen3-4B-instruct')
  } finally {
    cleanup()
  }
})

test('auto-selects a small instruct model and lets the user override it', async () => {
  const { service, cleanup } = harness({ handler: async () => modelList })
  try {
    await service.saveKey('nebius', 'nebius_key')
    let snapshot = await service.snapshot()
    assert.equal(snapshot.providers[0].model, 'Qwen/Qwen3-4B-instruct')

    await service.updateProvider('nebius', { model: 'meta-llama/Llama-3.1-70B' })
    snapshot = await service.snapshot()
    assert.equal(snapshot.providers[0].model, 'meta-llama/Llama-3.1-70B')
  } finally {
    cleanup()
  }
})

test('reports a rejected key without pretending the provider is usable', async () => {
  const { service, cleanup } = harness({ handler: async () => jsonResponse({ error: 'bad key' }, { ok: false, status: 401 }) })
  try {
    const result = await service.saveKey('fireworks', 'fw_wrong')
    assert.match(result.lastError, /the API key was rejected/)
    const check = await service.test('fireworks')
    assert.equal(check.ok, false)
    assert.match(check.message, /Fireworks AI/)
  } finally {
    cleanup()
  }
})

test('routes a workload to the first connected provider and honours an explicit choice', async () => {
  const { service, calls, cleanup } = harness({
    handler: async (url) => url.endsWith('/models') ? modelList : jsonResponse({ choices: [{ message: { content: 'Fix terminal focus' } }] })
  })
  try {
    assert.equal(await service.routeFor('thread-label'), '')
    await service.saveKey('fireworks', 'fw_key')
    assert.equal(await service.routeFor('thread-label'), 'fireworks')

    await service.saveKey('nebius', 'nebius_key')
    assert.equal(await service.routeFor('thread-label'), 'nebius', 'auto follows catalog order')

    await service.setRoute('thread-label', 'fireworks')
    const completion = await service.complete({ workload: 'thread-label', messages: [{ role: 'user', content: 'hi' }] })
    assert.equal(completion.provider, 'fireworks')
    assert.equal(completion.text, 'Fix terminal focus')

    const request = calls.at(-1)
    assert.equal(request.url, 'https://api.fireworks.ai/inference/v1/chat/completions')
    assert.equal(request.options.headers.authorization, 'Bearer fw_key')
    assert.equal(request.body.max_tokens, 24)

    await service.setRoute('thread-label', 'off')
    assert.equal(await service.routeFor('thread-label'), '')
    await assert.rejects(service.complete({ workload: 'thread-label', messages: [] }), /No inference provider is routed/)
  } finally {
    cleanup()
  }
})

test('falls back when the routed provider is disconnected again', async () => {
  const { service, cleanup } = harness({ handler: async () => modelList })
  try {
    await service.saveKey('nebius', 'nebius_key')
    await service.setRoute('thread-label', 'nebius')
    await service.removeKey('nebius')
    const snapshot = await service.snapshot()
    assert.equal(snapshot.providers[0].connected, false)
    assert.equal(snapshot.workloads[0].route, 'nebius')
    assert.equal(snapshot.workloads[0].resolved, '', 'a disconnected route degrades to local handling')
  } finally {
    cleanup()
  }
})

test('inherits the pre-rename OpenRouter keychain entry and prefers an environment key', async () => {
  const keychain = fakeKeychain({ 'com.findmecreators.claudecontroller.openrouter': 'sk-or-legacy' })
  const { service, calls, cleanup } = harness({
    keychain,
    handler: async (url) => url.endsWith('/models') ? modelList : jsonResponse({ choices: [{ message: { content: 'ok' } }] })
  })
  try {
    const snapshot = await service.snapshot()
    const openrouter = snapshot.providers.find((provider) => provider.id === 'openrouter')
    assert.equal(openrouter.connected, true)
    assert.equal(openrouter.keySource, 'keychain')

    await service.listModels('openrouter')
    assert.equal(calls.at(-1).options.headers.authorization, 'Bearer sk-or-legacy')
  } finally {
    cleanup()
  }

  const withEnvironment = harness({ keychain, environment: { OPENROUTER_API_KEY: 'sk-or-session' }, handler: async () => modelList })
  try {
    const snapshot = await withEnvironment.service.snapshot()
    const openrouter = snapshot.providers.find((provider) => provider.id === 'openrouter')
    assert.equal(openrouter.keySource, 'environment')
  } finally {
    withEnvironment.cleanup()
  }
})

test('a legacy OpenRouter key lazily discovers its model before the first routed workload', async () => {
  const keychain = fakeKeychain({ 'com.findmecreators.claudecontroller.openrouter': 'sk-or-legacy' })
  const { service, calls, cleanup } = harness({
    keychain,
    handler: async (url) => url.endsWith('/models')
      ? modelList
      : jsonResponse({ choices: [{ message: { content: 'Keep legacy labels' } }] })
  })
  try {
    assert.equal(await service.routeFor('thread-label'), 'openrouter')
    const result = await service.complete({ workload: 'thread-label', messages: [{ role: 'user', content: 'hi' }] })
    assert.equal(result.provider, 'openrouter')
    assert.equal(calls.filter((call) => call.url.endsWith('/models')).length, 1)
    assert.equal(calls.at(-1).options.headers.authorization, 'Bearer sk-or-legacy')
  } finally {
    cleanup()
  }
})

test('thread labels use the routed provider and stay local when it fails', async () => {
  const updates = []
  const fingerprints = new Map()
  const names = new Map()
  const store = {
    taskName: (sessionId) => names.get(sessionId) || '',
    taskFingerprint: (sessionId) => fingerprints.get(sessionId) || '',
    updateTask: (sessionId, label, fingerprint, origin) => {
      names.set(sessionId, label)
      fingerprints.set(sessionId, fingerprint)
      updates.push({ label, origin })
    }
  }
  const failing = createTaskSummarizer(store, {
    inference: { complete: async () => { throw new Error('provider offline') } }
  })
  failing.enqueue('session-1', 'Please fix the terminal focus bug')
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.deepEqual(updates.map((item) => item.origin), ['local'])
  assert.equal(updates[0].label, 'Fix the terminal focus')

  const working = createTaskSummarizer(store, {
    inference: {
      complete: async ({ workload }) => {
        assert.equal(workload, 'thread-label')
        return { provider: 'nebius', model: 'Qwen/Qwen3-4B-instruct', text: '"Fix terminal focus"' }
      }
    }
  })
  working.enqueue('session-2', 'Please fix the terminal focus bug in the workspace')
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(updates.at(-1).origin, 'model')
  assert.equal(updates.at(-1).label, 'Fix terminal focus')
})

// `security add-generic-password -w` prompts twice and exits 0 even when the two
// entries disagree, so the store can report success and keep nothing. The UI must
// never call that a connection: the user would leave Settings believing a provider
// was ready and only meet the failure later, inside a task.
test('a keychain that reports success but stores nothing is not reported as connected', async () => {
  const silentlyFailing = {
    read: async () => '',
    write: async () => {},
    remove: async () => {}
  }
  const { service, cleanup } = harness({ keychain: silentlyFailing, handler: async () => modelList })
  try {
    const result = await service.saveKey('nebius', 'nebius_secret_value')
    assert.equal(result.connected, false)
    assert.equal(result.keyHint, '')
    assert.match(result.lastError, /no API key/i)
  } finally {
    cleanup()
  }
})
