import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkspaceService } from '../src/main/workspace-service.mjs'
import { ContextStore } from '../src/main/context-store.mjs'
import { ContextEngine } from '../src/main/context-engine.mjs'
import { CapabilityGateway } from '../src/main/capability-gateway.mjs'

function setup (provider) {
  const root = mkdtempSync(join(tmpdir(), 'ambientic-provider-context-'))
  const project = join(root, 'project')
  const store = new ContextStore({ file: ':memory:' })
  const goals = { list: () => ({ goals: [] }), updateTask: () => null }
  const contextEngine = new ContextEngine({ store, goals })
  const gateway = new CapabilityGateway({ store, contextEngine, goals, socketPath: join(root, 'gateway.sock') })
  const sessions = []
  const lifecycle = {
    list: () => sessions,
    ingest: (event) => {
      if (event.event === 'session_start') sessions.push({ id: event.session_id, agent: event.agent, cwd: event.cwd, project: event.project, state: 'idle' })
    },
    updateTask: () => {}
  }
  const service = new WorkspaceService(lifecycle, () => [{ id: provider, path: provider, installed: true, manageable: true }], {
    contextEngine,
    capabilityGateway: gateway,
    gatewayExecutable: process.execPath,
    gatewayShimPath: join(process.cwd(), 'resources', 'ambientic-mcp-shim.mjs'),
    contextArtifactRoot: join(root, 'contexts')
  })
  return { root, project, store, contextEngine, gateway, service, sessions }
}

test('Codex receives one frozen capsule and the Ambientic MCP server on start', async () => {
  const value = setup('codex')
  try {
    const requests = []
    value.service.codexClient = async () => ({ request: async (method, params) => {
      requests.push({ method, params })
      if (method === 'thread/start') return { thread: { id: 'codex-context-thread' } }
      return {}
    } })
    value.service.send = async () => null
    const id = await value.service.create({ provider: 'codex', cwd: value.project, prompt: 'Build memory.' }).catch(async (error) => {
      // create() validates the directory before reaching the provider.
      if (/not available/.test(error.message)) {
        const { mkdirSync } = await import('node:fs'); mkdirSync(value.project)
        return value.service.create({ provider: 'codex', cwd: value.project, prompt: 'Build memory.' })
      }
      throw error
    })
    assert.equal(id, 'codex-context-thread')
    assert.match(requests[0].params.developerInstructions, /ambientic-memory/)
    assert.equal(requests[0].params.config.mcp_servers.ambientic.env.ELECTRON_RUN_AS_NODE, '1')
    assert.equal(value.contextEngine.bindingFor('codex', id).capsuleHash.length, 64)
  } finally {
    value.store.close(); rmSync(value.root, { recursive: true, force: true })
  }
})

test('Hermes receives the Ambientic MCP server at session creation', async () => {
  const value = setup('hermes')
  try {
    const { mkdirSync } = await import('node:fs'); mkdirSync(value.project)
    let params
    value.service.hermesClient = async () => ({ request: async (method, input) => {
      if (method === 'session/new') { params = input; return { sessionId: 'hermes-context-session' } }
      return {}
    } })
    value.service.send = async () => null
    await value.service.create({ provider: 'hermes', cwd: value.project, prompt: 'Recall the goal.' })
    assert.equal(params.mcpServers[0].name, 'ambientic')
    assert.match(params.mcpServers[0].args[0], /ambientic-mcp-shim/)
    assert.ok(params.mcpServers[0].env.AMBIENTIC_GATEWAY_TOKEN)
  } finally {
    value.store.close(); rmSync(value.root, { recursive: true, force: true })
  }
})

test('Claude receives stable capsule and strict MCP config flags', async () => {
  const value = setup('claude')
  try {
    const { mkdirSync } = await import('node:fs'); mkdirSync(value.project)
    const session = { id: 'claude-context-session', agent: 'claude', cwd: value.project, project: 'project' }
    value.sessions.push(session)
    const context = value.service.prepareContext({ provider: 'claude', providerSessionId: session.id, cwd: value.project, prompt: 'Use memory.' })
    let launch
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => {}
    value.service.spawnProcess = (command, args, options) => { launch = { command, args, options }; return child }
    value.service.runClaude(session, 'Use memory.', { context })
    assert.ok(launch.args.includes('--append-system-prompt-file'))
    assert.ok(launch.args.includes('--mcp-config'))
    assert.ok(launch.args.includes('--strict-mcp-config'))
    assert.equal(value.contextEngine.bindingFor('claude', session.id).capsuleHash, context.binding.capsuleHash)
    assert.equal(createHash('sha256').update(readFileSync(context.capsulePath)).digest('hex'), context.binding.capsuleHash)
    child.emit('exit', 0)
  } finally {
    value.store.close(); rmSync(value.root, { recursive: true, force: true })
  }
})
