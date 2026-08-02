import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter, once } from 'node:events'
import {
  MemoryBootstrapService,
  parseProviderMemoryResponse,
  summarizeImportedMemory
} from '../src/main/memory-bootstrap-service.mjs'

test('provider memory exports are bounded, normalized, and safety filtered', () => {
  const parsed = parseProviderMemoryResponse(`\`\`\`json
  {"summary":"Concise builder","memories":[
    {"kind":"preference","content":"User prefers concise implementation updates.","confidence":0.95,"basis":"explicit_memory"},
    {"kind":"fact","content":"api_key=secret-value-123456789","confidence":1,"basis":"standing_instruction"},
    {"kind":"fact","content":"The user has a medical diagnosis.","confidence":1,"basis":"standing_instruction"}
  ]}
  \`\`\``, 'claude')
  assert.equal(parsed.invalid, false)
  assert.equal(parsed.memories.length, 1)
  assert.equal(parsed.memories[0].kind, 'preference')
  assert.equal(parsed.memories[0].provider, 'claude')
  assert.match(summarizeImportedMemory(parsed.memories, ['claude']), /how you prefer to work/)
})

test('memory bootstrap asks connected providers and saves only reviewed items', async () => {
  class Workspace extends EventEmitter {
    constructor () { super(); this.snapshots = new Map(); this.requests = [] }
    async create (request) {
      this.requests.push(request)
      const { provider } = request
      const id = `${provider}-memory`
      const snapshot = {
        id,
        running: false,
        messages: [{ role: 'assistant', text: JSON.stringify({ summary: 'A working preference.', memories: [{ kind: 'preference', content: `User prefers ${provider} for focused work.`, confidence: 0.9, basis: 'explicit_memory' }] }) }]
      }
      this.snapshots.set(id, snapshot)
      queueMicrotask(() => this.emit('change', snapshot))
      return id
    }
    async read (id) { return this.snapshots.get(id) }
  }
  const workspace = new Workspace()
  const saved = []
  const audits = []
  const service = new MemoryBootstrapService({
    workspace,
    contextEngine: { remember: (item) => { saved.push(item); return item } },
    contextStore: { audit: (event) => audits.push(event) },
    connectors: () => [
      { id: 'claude', label: 'Claude Code', installed: true, manageable: true },
      { id: 'codex', label: 'Codex', installed: true, manageable: true },
      { id: 'hermes', label: 'Hermes', installed: false, manageable: false }
    ],
    timeoutMs: 1000
  })
  service.start({})
  while (service.getState().status !== 'review') await once(service, 'change')
  const review = service.getState()
  assert.equal(review.items.length, 2)
  assert.match(review.summary, /2 connected agents/)
  assert.equal(workspace.requests.length, 2)
  assert.ok(workspace.requests.every((request) => request.skipAmbienticContext === true))
  const completed = service.commit({ itemIds: [review.items[0].id] })
  assert.equal(completed.savedCount, 1)
  assert.equal(saved[0].status, 'active')
  assert.equal(saved[0].provenance.sourceType, 'provider_import')
  assert.equal(audits[0].eventType, 'memory.bootstrap.completed')
})

test('an explicit empty review selection imports nothing', () => {
  const saved = []
  const service = new MemoryBootstrapService({
    contextEngine: { remember: (item) => { saved.push(item); return item } },
    contextStore: { audit: () => {} }
  })
  service.state = {
    status: 'review', runId: 'review', providers: [], summary: 'Review ready.', error: '', savedCount: 0,
    items: [{ id: 'memory-1', provider: 'claude', kind: 'preference', content: 'Keep updates short.', confidence: 1, basis: 'explicit_memory' }]
  }
  const completed = service.commit({ itemIds: [] })
  assert.equal(completed.savedCount, 0)
  assert.equal(saved.length, 0)
})

test('memory bootstrap reports when connected runtimes expose no durable memory', () => {
  assert.equal(
    summarizeImportedMemory([], ['codex']),
    'Your connected agents did not expose any safe, durable user memory to import.'
  )
})
