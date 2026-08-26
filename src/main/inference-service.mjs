import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Inference providers are OpenAI-compatible hosted endpoints that Ambientic can
// use for its own small internal workloads (thread labels today). They are not
// agent runtimes: they never own a thread, a project, or a tool grant. Keys stay
// in the macOS keychain — Ambientic's configuration file only records which
// provider and model a workload should use, plus a masked hint of the key.
export const INFERENCE_PROVIDERS = [
  {
    id: 'nebius',
    label: 'Nebius Token Factory',
    summary: 'Open-weight models hosted by Nebius on an OpenAI-compatible endpoint.',
    baseUrl: 'https://api.studio.nebius.com/v1',
    consoleUrl: 'https://studio.nebius.com/settings/api-keys',
    keyPrefix: 'nebius_',
    environmentKeys: ['NEBIUS_API_KEY', 'NEBIUS_TOKEN_FACTORY_API_KEY'],
    keychainService: 'com.findmecreators.ambientic.inference.nebius',
    // Ambientic's internal workloads are short and frequent, so the auto-pick
    // prefers the smallest instruction-tuned model the account actually lists.
    preferredModels: [/qwen.*(4b|8b).*instruct/i, /llama.*3\.?1.*8b.*instruct/i, /instruct/i]
  },
  {
    id: 'fireworks',
    label: 'Fireworks AI',
    summary: 'Fast serverless inference for open models on an OpenAI-compatible endpoint.',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    consoleUrl: 'https://app.fireworks.ai/settings/users/api-keys',
    keyPrefix: 'fw_',
    environmentKeys: ['FIREWORKS_API_KEY'],
    keychainService: 'com.findmecreators.ambientic.inference.fireworks',
    preferredModels: [/llama.*v3p1.*8b.*instruct/i, /8b.*instruct/i, /instruct/i]
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    summary: 'A single account routed across many model vendors.',
    baseUrl: 'https://openrouter.ai/api/v1',
    consoleUrl: 'https://openrouter.ai/keys',
    keyPrefix: 'sk-or-',
    environmentKeys: ['OPENROUTER_API_KEY'],
    keychainService: 'com.findmecreators.ambientic.inference.openrouter',
    // Ambientic used OpenRouter for thread labels before inference providers were
    // configurable. Keep reading that keychain entry so existing installs stay
    // connected without asking for the key again.
    legacyKeychainServices: ['com.findmecreators.claudecontroller.openrouter'],
    preferredModels: [/amazon\/nova-micro/i, /nova-micro/i, /haiku|mini|micro|flash/i]
  }
]

// Ambientic-owned work that a hosted model can do. Provider CLIs keep running
// the actual agent threads; these are the small local jobs around them.
export const INFERENCE_WORKLOADS = [
  {
    id: 'thread-label',
    label: 'Thread labels',
    description: 'Names each running thread in two to five words. Falls back to a local label when no provider answers.',
    maxTokens: 24
  }
]

const KEYCHAIN_ACCOUNT = 'ambientic'
const AUTO = 'auto'
const OFF = 'off'

function catalogEntry (providerId) {
  return INFERENCE_PROVIDERS.find((provider) => provider.id === providerId) || null
}

function trimBaseUrl (value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function maskKey (key) {
  const value = String(key || '').trim()
  if (!value) return ''
  return `…${value.slice(-4)}`
}

function securityKeychain () {
  const run = (args, input) => new Promise((resolve, reject) => {
    const child = execFile('/usr/bin/security', args, { timeout: 5000 }, (error, stdout) => {
      if (error) reject(error)
      else resolve(String(stdout || '').trim())
    })
    if (input !== undefined) {
      child.stdin.end(input)
    }
  })

  return {
    async read (service) {
      try {
        return await run(['find-generic-password', '-w', '-s', service])
      } catch {
        return ''
      }
    },
    async write (service, key) {
      // `security` reads the password from stdin when `-w` carries no value, which
      // keeps the key out of the process list. Older releases need the argument
      // form, so fall back rather than losing the credential.
      try {
        await run(['add-generic-password', '-U', '-s', service, '-a', KEYCHAIN_ACCOUNT, '-w'], `${key}\n`)
      } catch {
        await run(['add-generic-password', '-U', '-s', service, '-a', KEYCHAIN_ACCOUNT, '-w', key])
      }
    },
    async remove (service) {
      try {
        await run(['delete-generic-password', '-s', service])
      } catch {
        // A missing entry is the desired end state.
      }
    }
  }
}

export function createInferenceService ({
  stateDirectory = '',
  keychain = securityKeychain(),
  fetchImpl = globalThis.fetch,
  environment = process.env,
  now = () => new Date().toISOString()
} = {}) {
  const configPath = stateDirectory ? join(stateDirectory, 'inference.json') : ''
  const runtime = new Map(INFERENCE_PROVIDERS.map((provider) => [provider.id, { models: [], lastError: '', lastCheckedAt: '' }]))
  let config = readConfig()

  function readConfig () {
    if (!configPath) return { providers: {}, routes: {} }
    try {
      const parsed = JSON.parse(readFileSync(configPath, 'utf8'))
      return { providers: parsed?.providers || {}, routes: parsed?.routes || {} }
    } catch {
      return { providers: {}, routes: {} }
    }
  }

  function writeConfig () {
    if (!configPath) return
    try {
      mkdirSync(stateDirectory, { recursive: true })
      writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
    } catch (error) {
      console.warn(`[inference] configuration not saved: ${error.message}`)
    }
  }

  function settingsFor (providerId) {
    return config.providers[providerId] || {}
  }

  function patchSettings (providerId, patch) {
    config.providers[providerId] = { ...settingsFor(providerId), ...patch }
    writeConfig()
  }

  function baseUrlFor (provider) {
    return trimBaseUrl(settingsFor(provider.id).baseUrl) || provider.baseUrl
  }

  function environmentKey (provider) {
    for (const name of provider.environmentKeys || []) {
      const value = String(environment[name] || '').trim()
      if (value) return value
    }
    return ''
  }

  // Environment first so a developer can override a stored key for one launch,
  // then this provider's keychain entry, then any pre-rename entry it inherits.
  async function resolveKey (provider) {
    const fromEnvironment = environmentKey(provider)
    if (fromEnvironment) return { key: fromEnvironment, source: 'environment' }
    for (const service of [provider.keychainService, ...(provider.legacyKeychainServices || [])]) {
      const stored = await keychain.read(service)
      if (stored) return { key: stored, source: 'keychain' }
    }
    return { key: '', source: '' }
  }

  async function request (provider, path, { method = 'GET', body, timeout = 15_000 } = {}) {
    const { key } = await resolveKey(provider)
    if (!key) throw new Error(`${provider.label} has no API key on this Mac.`)
    const response = await fetchImpl(`${baseUrlFor(provider)}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        'x-title': 'Ambientic'
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout)
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      const reason = response.status === 401 || response.status === 403
        ? 'the API key was rejected'
        : response.status === 429
            ? 'the account is rate limited or out of credit'
            : detail.slice(0, 120) || `HTTP ${response.status}`
      throw new Error(`${provider.label}: ${reason}`)
    }
    return response.json()
  }

  function pickModel (provider, models) {
    for (const pattern of provider.preferredModels || []) {
      const match = models.find((model) => pattern.test(model))
      if (match) return match
    }
    return models[0] || ''
  }

  async function refreshModels (providerId) {
    const provider = catalogEntry(providerId)
    if (!provider) throw new Error('Unknown inference provider.')
    const state = runtime.get(providerId)
    try {
      const payload = await request(provider, '/models')
      const models = (Array.isArray(payload?.data) ? payload.data : [])
        .map((model) => String(model?.id || '')).filter(Boolean).sort()
      state.models = models
      state.lastError = ''
      state.lastCheckedAt = now()
      // Only auto-pick when the user has not chosen, and never keep a stored model
      // the account can no longer serve.
      const chosen = settingsFor(providerId).model
      if (!chosen || (models.length && !models.includes(chosen))) {
        patchSettings(providerId, { model: pickModel(provider, models) })
      }
      return models
    } catch (error) {
      state.models = []
      state.lastError = error.message
      state.lastCheckedAt = now()
      throw error
    }
  }

  async function describeProvider (provider) {
    const settings = settingsFor(provider.id)
    const state = runtime.get(provider.id)
    const { key, source } = await resolveKey(provider)
    return {
      id: provider.id,
      label: provider.label,
      summary: provider.summary,
      consoleUrl: provider.consoleUrl,
      keyPrefix: provider.keyPrefix || '',
      baseUrl: baseUrlFor(provider),
      defaultBaseUrl: provider.baseUrl,
      connected: Boolean(key),
      keySource: source,
      keyHint: key ? maskKey(key) : '',
      model: settings.model || '',
      models: state.models,
      lastError: state.lastError,
      lastCheckedAt: state.lastCheckedAt,
      connectedAt: settings.connectedAt || ''
    }
  }

  async function snapshot () {
    const providers = await Promise.all(INFERENCE_PROVIDERS.map(describeProvider))
    return {
      providers,
      workloads: INFERENCE_WORKLOADS.map((workload) => ({
        id: workload.id,
        label: workload.label,
        description: workload.description,
        route: config.routes[workload.id] || AUTO,
        resolved: resolveRoute(workload.id, providers)
      }))
    }
  }

  // `auto` is the shipped default: use the first connected provider with a model,
  // in catalog order. `off` keeps the workload entirely local.
  function resolveRoute (workloadId, providers) {
    const route = config.routes[workloadId] || AUTO
    if (route === OFF) return ''
    const eligible = providers.filter((provider) => provider.connected && provider.model)
    if (route === AUTO) return eligible[0]?.id || ''
    return eligible.some((provider) => provider.id === route) ? route : ''
  }

  // Returns the provider id a workload would use right now, or '' when the
  // workload should stay local.
  async function routeFor (workloadId) {
    let providers = await Promise.all(INFERENCE_PROVIDERS.map(describeProvider))
    const configured = config.routes[workloadId] || AUTO
    const candidates = configured === AUTO
      ? providers
      : providers.filter((provider) => provider.id === configured)

    // Existing Ambientic installs may already have an OpenRouter key in the
    // legacy keychain entry but no inference.json model choice yet. Discover a
    // model lazily on the first routed workload so upgrading does not silently
    // turn remote labels off. A failed discovery is attempted only once per app
    // launch; the explicit connection check remains available for later retries.
    for (const candidate of candidates) {
      const state = runtime.get(candidate.id)
      if (candidate.connected && !candidate.model && !state.lastCheckedAt) {
        try {
          await refreshModels(candidate.id)
        } catch {
          // The workload will use its local fallback.
        }
        providers = await Promise.all(INFERENCE_PROVIDERS.map(describeProvider))
        if (resolveRoute(workloadId, providers)) break
      }
    }
    return resolveRoute(workloadId, providers)
  }

  return {
    snapshot,
    routeFor,
    listModels: refreshModels,

    async saveKey (providerId, key) {
      const provider = catalogEntry(providerId)
      if (!provider) throw new Error('Unknown inference provider.')
      const value = String(key || '').trim()
      if (!value) throw new Error(`Enter a ${provider.label} API key.`)
      await keychain.write(provider.keychainService, value)
      patchSettings(providerId, { connectedAt: now() })
      try {
        await refreshModels(providerId)
      } catch (error) {
        // Keep the key so the user can correct a base URL or retry offline, but
        // report the failure rather than showing a false connection.
        return { ...(await describeProvider(provider)), lastError: error.message }
      }
      return describeProvider(provider)
    },

    async removeKey (providerId) {
      const provider = catalogEntry(providerId)
      if (!provider) throw new Error('Unknown inference provider.')
      for (const service of [provider.keychainService, ...(provider.legacyKeychainServices || [])]) {
        await keychain.remove(service)
      }
      delete config.providers[providerId]
      runtime.set(providerId, { models: [], lastError: '', lastCheckedAt: '' })
      writeConfig()
      const described = await describeProvider(provider)
      if (described.connected) {
        return { ...described, lastError: `${provider.label} is still supplied by an environment variable in this session.` }
      }
      return described
    },

    async test (providerId) {
      const provider = catalogEntry(providerId)
      if (!provider) throw new Error('Unknown inference provider.')
      try {
        const models = await refreshModels(providerId)
        return { ok: true, message: `${provider.label} answered with ${models.length} available ${models.length === 1 ? 'model' : 'models'}.`, provider: await describeProvider(provider) }
      } catch (error) {
        return { ok: false, message: error.message, provider: await describeProvider(provider) }
      }
    },

    async updateProvider (providerId, patch = {}) {
      const provider = catalogEntry(providerId)
      if (!provider) throw new Error('Unknown inference provider.')
      const next = {}
      if (typeof patch.model === 'string') next.model = patch.model.trim()
      if (typeof patch.baseUrl === 'string') next.baseUrl = trimBaseUrl(patch.baseUrl)
      patchSettings(providerId, next)
      return describeProvider(provider)
    },

    async setRoute (workloadId, providerId) {
      if (!INFERENCE_WORKLOADS.some((workload) => workload.id === workloadId)) throw new Error('Unknown workload.')
      const route = String(providerId || AUTO)
      if (![AUTO, OFF].includes(route) && !catalogEntry(route)) throw new Error('Unknown inference provider.')
      config.routes[workloadId] = route
      writeConfig()
      return snapshot()
    },

    async complete ({ workload, messages, maxTokens, temperature = 0, timeout = 12_000, model: modelOverride = '' }) {
      const providerId = await routeFor(workload)
      if (!providerId) throw new Error('No inference provider is routed to this workload.')
      const provider = catalogEntry(providerId)
      const model = modelOverride || settingsFor(providerId).model
      const definition = INFERENCE_WORKLOADS.find((item) => item.id === workload)
      const payload = await request(provider, '/chat/completions', {
        method: 'POST',
        timeout,
        body: {
          model,
          temperature,
          max_tokens: maxTokens || definition?.maxTokens || 256,
          messages
        }
      })
      return {
        provider: providerId,
        model,
        text: String(payload?.choices?.[0]?.message?.content || '').trim(),
        usage: payload?.usage || null
      }
    }
  }
}
