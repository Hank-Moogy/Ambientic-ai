import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { looksSecret, looksSensitivePersonal } from './context-engine.mjs'

const SUPPORTED_PROVIDERS = new Set(['claude', 'codex', 'hermes'])
const VALID_KINDS = new Set(['preference', 'constraint', 'fact', 'decision', 'outcome', 'gotcha'])

export const MEMORY_BOOTSTRAP_PROMPT = `Ambientic is setting up the user's private, local memory with their explicit permission.

Share only durable context about this user that is already available to this provider runtime through its native persistent memory or standing user instructions. Do not inspect project files, browse the web, call tools, or infer facts from this prompt. Do not include credentials, account identifiers, contact details, sensitive personal data, or temporary task details. If this runtime has no durable user memory, return an empty memories array.

Return only valid JSON with this shape:
{"summary":"One short high-level sentence","memories":[{"kind":"preference|constraint|fact|decision|outcome|gotcha","content":"A concise third-person durable statement","confidence":0.0,"basis":"explicit_memory|standing_instruction|inferred"}]}

Limit the response to 12 memories. Mark uncertain material as inferred and use confidence below 0.8.`

function cleanText (value, max = 1000) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim().slice(0, max)
}

function jsonCandidate (value) {
  const text = String(value || '').trim()
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  const candidate = fenced || text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  if (!candidate || !candidate.startsWith('{')) return null
  try { return JSON.parse(candidate) } catch { return null }
}

export function parseProviderMemoryResponse (value, provider = '') {
  const parsed = jsonCandidate(value)
  if (!parsed || !Array.isArray(parsed.memories)) return { summary: '', memories: [], invalid: true }
  const seen = new Set()
  const memories = []
  for (const input of parsed.memories.slice(0, 24)) {
    const content = cleanText(input?.content, 500)
    const normalized = content.toLocaleLowerCase()
    if (!content || seen.has(normalized) || looksSecret(content) || looksSensitivePersonal(content)) continue
    seen.add(normalized)
    const confidence = Number(input?.confidence)
    memories.push({
      id: randomUUID(),
      provider: cleanText(provider, 24),
      kind: VALID_KINDS.has(input?.kind) ? input.kind : 'fact',
      content,
      confidence: Math.max(0.1, Math.min(1, Number.isFinite(confidence) ? confidence : 0.7)),
      basis: ['explicit_memory', 'standing_instruction', 'inferred'].includes(input?.basis) ? input.basis : 'inferred'
    })
    if (memories.length >= 12) break
  }
  return { summary: cleanText(parsed.summary, 300), memories, invalid: false }
}

export function summarizeImportedMemory (items = [], providers = []) {
  if (!items.length) return providers.length
    ? 'Your connected agents did not expose any safe, durable user memory to import.'
    : 'No connected agent was available to share memory.'
  const kinds = new Set(items.map((item) => item.kind))
  const themes = [
    kinds.has('preference') && 'how you prefer to work',
    kinds.has('constraint') && 'your standing constraints',
    kinds.has('decision') && 'decisions you want carried forward',
    kinds.has('fact') && 'stable background about you',
    kinds.has('outcome') && 'outcomes you care about',
    kinds.has('gotcha') && 'pitfalls your agents should remember'
  ].filter(Boolean)
  const sourceLabel = providers.length === 1 ? providers[0] : `${providers.length} connected agents`
  return `I found ${items.length} durable ${items.length === 1 ? 'memory' : 'memories'} from ${sourceLabel}, covering ${themes.slice(0, 3).join(', ') || 'useful working context'}.`
}

function copy (value) {
  return JSON.parse(JSON.stringify(value))
}

export class MemoryBootstrapService extends EventEmitter {
  constructor ({ workspace, contextEngine, contextStore, connectors = () => [], timeoutMs = 180_000, now = () => Date.now() } = {}) {
    super()
    this.workspace = workspace
    this.contextEngine = contextEngine
    this.contextStore = contextStore
    this.connectors = connectors
    this.timeoutMs = timeoutMs
    this.now = now
    this.state = { status: 'idle', runId: '', providers: [], items: [], summary: '', error: '', savedCount: 0 }
  }

  getState () { return copy(this.state) }

  reset () {
    if (this.state.status === 'running') throw new Error('Memory setup is still running.')
    this.state = { status: 'idle', runId: '', providers: [], items: [], summary: '', error: '', savedCount: 0 }
    this.emitState()
    return this.getState()
  }

  eligibleProviders () {
    return (this.connectors() || [])
      .filter((item) => SUPPORTED_PROVIDERS.has(item.id) && item.installed && item.manageable !== false && item.taskCapable !== false)
      .map((item) => ({ id: item.id, label: item.label || item.id }))
  }

  start ({ providers = [] } = {}) {
    if (this.state.status === 'running') return this.getState()
    const requested = new Set((providers || []).map(String))
    const eligible = this.eligibleProviders().filter((item) => !requested.size || requested.has(item.id))
    const runId = randomUUID()
    this.state = {
      status: 'running',
      runId,
      providers: eligible.map((item) => ({ ...item, status: 'queued', sessionId: '', count: 0, summary: '', error: '' })),
      items: [],
      summary: '',
      error: eligible.length ? '' : 'No connected provider can share memory yet.',
      savedCount: 0
    }
    this.emitState()
    void this.execute(runId)
    return this.getState()
  }

  async execute (runId) {
    const selected = this.state.providers.map((item) => item.id)
    if (!selected.length) {
      this.state.status = 'review'
      this.state.summary = summarizeImportedMemory([], [])
      this.emitState()
      return
    }
    const results = await Promise.all(selected.map((provider) => this.runProvider(runId, provider)))
    if (this.state.runId !== runId) return
    const items = results.flatMap((result) => result.memories || [])
    const successful = results.filter((result) => !result.error).map((result) => result.provider)
    this.state.items = items
    this.state.summary = summarizeImportedMemory(items, successful)
    this.state.status = 'review'
    this.state.error = results.every((result) => result.error) ? 'None of the connected providers completed memory sharing. You can retry or continue without importing.' : ''
    this.emitState()
  }

  async runProvider (runId, provider) {
    this.updateProvider(runId, provider, { status: 'running' })
    try {
      const sessionId = await this.workspace.create({ provider, prompt: MEMORY_BOOTSTRAP_PROMPT, mode: 'ask', skipAmbienticContext: true })
      this.updateProvider(runId, provider, { sessionId })
      const snapshot = await this.waitForThread(sessionId)
      const response = [...(snapshot.messages || [])].reverse().find((item) => item.role === 'assistant' && String(item.text || '').trim())?.text || ''
      const parsed = parseProviderMemoryResponse(response, provider)
      if (parsed.invalid) throw new Error('The provider did not return a readable memory export.')
      this.updateProvider(runId, provider, { status: 'complete', count: parsed.memories.length, summary: parsed.summary })
      return { provider, sessionId, ...parsed }
    } catch (error) {
      this.updateProvider(runId, provider, { status: 'error', error: cleanText(error.message, 300) })
      return { provider, memories: [], error: error.message }
    }
  }

  waitForThread (sessionId) {
    return new Promise((resolve, reject) => {
      let settled = false
      const finish = (error, snapshot) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        clearInterval(poll)
        this.workspace.off?.('change', onChange)
        if (error) reject(error); else resolve(snapshot)
      }
      const inspect = (snapshot) => {
        if (!snapshot || snapshot.id !== sessionId) return
        if (snapshot.error) return finish(new Error(snapshot.error))
        const hasAnswer = (snapshot.messages || []).some((item) => item.role === 'assistant' && String(item.text || '').trim())
        if (!snapshot.running && hasAnswer) finish(null, snapshot)
      }
      const onChange = (snapshot) => inspect(snapshot)
      this.workspace.on?.('change', onChange)
      const read = () => Promise.resolve(this.workspace.read(sessionId)).then(inspect).catch(() => {})
      const poll = setInterval(read, 750)
      const timeout = setTimeout(() => finish(new Error('Timed out waiting for this provider to share memory.')), this.timeoutMs)
      if (poll.unref) poll.unref()
      if (timeout.unref) timeout.unref()
      void read()
    })
  }

  commit ({ itemIds } = {}) {
    if (this.state.status !== 'review') throw new Error('Memory setup is not ready for review.')
    const selected = Array.isArray(itemIds) ? new Set(itemIds.map(String)) : null
    const items = this.state.items.filter((item) => !selected || selected.has(item.id))
    const saved = []
    for (const item of items) {
      const providerState = this.state.providers.find((provider) => provider.id === item.provider)
      saved.push(this.contextEngine.remember({
        scope: 'user',
        kind: item.kind,
        content: item.content,
        status: 'active',
        confidence: item.confidence,
        actor: 'human',
        provenance: { provider: item.provider, providerSessionId: providerState?.sessionId || '', sourceType: 'provider_import', sourceId: this.state.runId }
      }))
    }
    this.contextStore?.audit?.({ eventType: 'memory.bootstrap.completed', actor: 'human', resultSummary: `Imported ${saved.length} reviewed memories from ${this.state.providers.length} provider(s)` })
    this.state.status = 'completed'
    this.state.savedCount = saved.length
    this.state.summary = saved.length
      ? `${this.state.summary} ${saved.length === 1 ? 'It is' : 'They are'} now available to your agents through Ambientic.`
      : 'No provider memories were added. Ambientic can still learn from future sessions if you enabled that option.'
    this.emitState()
    return this.getState()
  }

  updateProvider (runId, provider, patch) {
    if (this.state.runId !== runId) return
    this.state.providers = this.state.providers.map((item) => item.id === provider ? { ...item, ...patch } : item)
    this.emitState()
  }

  emitState () { this.emit('change', this.getState()) }
}

export function createMemoryBootstrapService (options) { return new MemoryBootstrapService(options) }
