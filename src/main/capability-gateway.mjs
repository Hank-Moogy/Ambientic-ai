import { EventEmitter } from 'node:events'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { chmodSync, existsSync, unlinkSync } from 'node:fs'
import { createServer, createConnection } from 'node:net'
import { JsonRpcProcess } from './json-rpc-process.mjs'
import { AMBIENTIC_TOOL_SCHEMAS } from '../shared/context-contract.mjs'

function cleanText (value, max = 4000) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max)
}

function digest (value) {
  return createHash('sha256').update(JSON.stringify(value ?? {})).digest('hex')
}

function hashToken (token) {
  return createHash('sha256').update(String(token || '')).digest('hex')
}

function permissionFor (tool = {}) {
  const text = `${tool.name || ''} ${tool.description || ''}`.toLocaleLowerCase()
  if (/delete|destroy|remove|revoke|purge|erase|cancel subscription|drop /.test(text)) return 'destructive'
  if (/create|send|write|update|edit|post|publish|move|upload|invite|approve|schedule/.test(text)) return 'write'
  return 'read'
}

function safeConfig (input = {}) {
  const config = input && typeof input === 'object' ? { ...input } : {}
  delete config.token
  delete config.secret
  delete config.password
  delete config.apiKey
  delete config.bearerToken
  // Connection metadata may name an environment variable, but Ambientic never
  // persists a credential value or forwards raw authorization configuration to
  // an agent. Authentication remains in the tool's own store or Keychain-backed
  // launcher environment.
  delete config.env
  if (config.headers && typeof config.headers === 'object') {
    config.headers = Object.fromEntries(Object.entries(config.headers).filter(([name]) => !/authorization|cookie|api[-_]?key|token|secret|password/i.test(name)))
  }
  return config
}

const TOOL_SCOPES = Object.freeze({
  ambientic_context_get: 'context:read',
  ambientic_recall: 'memory:read',
  ambientic_remember: 'memory:write',
  ambientic_goals: 'goals:read',
  ambientic_task_update: 'tasks:write',
  ambientic_capability: 'capabilities:invoke'
})

function parseCommandLine (value) {
  const parts = []
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^']*)'|([^\s]+)/g
  let match
  while ((match = pattern.exec(String(value || '')))) parts.push((match[1] ?? match[2] ?? match[3]).replace(/\\(["\\])/g, '$1'))
  return { command: parts[0] || '', args: parts.slice(1) }
}

class ExternalMcpClient {
  constructor (connection) {
    this.connection = connection
    this.rpc = null
    this.httpSessionId = ''
    this.sequence = 1
  }

  async initialize () {
    if (this.connection.transport === 'stdio') {
      if (this.rpc) return this.rpc
      const config = this.connection.config || {}
      if (!cleanText(config.command, 2000)) throw new Error('A stdio MCP connection needs a command.')
      this.rpc = new JsonRpcProcess(config.command, Array.isArray(config.args) ? config.args.map(String) : [], {
        cwd: cleanText(config.cwd, 2000) || undefined,
        env: config.env && typeof config.env === 'object' ? config.env : {}
      })
      this.rpc.start()
      await this.rpc.request('initialize', {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'ambientic', version: '0.8.1' }
      }, 15_000)
      this.rpc.notify('notifications/initialized')
      return this.rpc
    }
    if (this.connection.transport !== 'http') throw new Error('Unsupported MCP transport.')
    if (!cleanText(this.connection.config?.url, 3000)) throw new Error('An HTTP MCP connection needs a URL.')
    if (!this.httpSessionId) {
      await this.httpRequest('initialize', {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'ambientic', version: '0.8.1' }
      })
      await this.httpNotify('notifications/initialized', {})
    }
    return this
  }

  headers () {
    const config = this.connection.config || {}
    const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(config.headers || {}) }
    if (config.bearerTokenEnv && process.env[config.bearerTokenEnv]) headers.authorization = `Bearer ${process.env[config.bearerTokenEnv]}`
    if (this.httpSessionId) headers['mcp-session-id'] = this.httpSessionId
    return headers
  }

  async httpRequest (method, params) {
    const response = await fetch(this.connection.config.url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: '2.0', id: String(this.sequence++), method, params }),
      signal: AbortSignal.timeout(20_000)
    })
    if (!response.ok) throw new Error(`MCP server returned HTTP ${response.status}.`)
    const session = response.headers.get('mcp-session-id')
    if (session) this.httpSessionId = session
    const type = response.headers.get('content-type') || ''
    const body = await response.text()
    let payload
    if (type.includes('text/event-stream')) {
      const data = body.split('\n').findLast((line) => line.startsWith('data:'))?.slice(5).trim()
      payload = data ? JSON.parse(data) : {}
    } else payload = body ? JSON.parse(body) : {}
    if (payload.error) throw new Error(payload.error.message || JSON.stringify(payload.error))
    return payload.result
  }

  async httpNotify (method, params) {
    const response = await fetch(this.connection.config.url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: '2.0', method, params }),
      signal: AbortSignal.timeout(10_000)
    })
    if (!response.ok && response.status !== 202) throw new Error(`MCP server returned HTTP ${response.status}.`)
  }

  async request (method, params, timeout = 60_000) {
    await this.initialize()
    return this.rpc ? this.rpc.request(method, params, timeout) : this.httpRequest(method, params)
  }

  stop () {
    this.rpc?.stop()
    this.rpc = null
    this.httpSessionId = ''
  }
}

export class CapabilityGateway extends EventEmitter {
  constructor ({ store, contextEngine, goals, workflows = () => null, socketPath, requestApproval = async () => false, now = () => Date.now(), id = () => randomUUID() }) {
    super()
    this.store = store
    this.contextEngine = contextEngine
    this.goals = goals
    this.workflows = workflows
    this.socketPath = socketPath
    this.requestApproval = requestApproval
    this.now = now
    this.id = id
    this.server = null
    this.clients = new Map()
    this.rememberedApprovals = new Set()
  }

  issueSession (bindingId, { scopes = ['context:read', 'memory:read', 'memory:write', 'goals:read', 'tasks:write', 'capabilities:invoke'], ttlMs = 24 * 60 * 60 * 1000 } = {}) {
    const token = randomBytes(32).toString('base64url')
    this.store.createGatewaySession({ tokenHash: hashToken(token), bindingId, scopes, expiresAt: this.now() + ttlMs })
    return { token, socketPath: this.socketPath, bindingId, expiresAt: this.now() + ttlMs }
  }

  revokeBinding (bindingId) {
    for (const key of this.rememberedApprovals) if (key.startsWith(`${bindingId}:`)) this.rememberedApprovals.delete(key)
    return this.store.revokeGatewaySessions(bindingId)
  }

  authenticate (token) {
    const session = this.store.gatewaySessionByHash(hashToken(token))
    if (!session) throw new Error('Ambientic gateway session is invalid, expired, or revoked.')
    const binding = this.contextEngine.enrichBinding(this.store.getBinding(session.bindingId))
    if (!binding) throw new Error('Ambientic context binding is no longer available.')
    return { session, binding }
  }

  authorizeScope (session, tool) {
    const required = TOOL_SCOPES[tool]
    if (required && !session.scopes.includes(required)) throw new Error(`Ambientic gateway session is not authorized for ${required}.`)
  }

  async authorize ({ binding, tool, connection = null, permission = 'write', arguments: args = {}, title = '' }) {
    const approvalKey = `${binding.id}:${connection?.id || 'ambientic'}:${tool}`
    if (permission !== 'destructive' && this.rememberedApprovals.has(approvalKey)) return true
    const response = await this.requestApproval({ binding, tool, connection, permission, arguments: args, title })
    const decision = typeof response === 'object' && response !== null
      ? { allowed: Boolean(response.allowed), remember: Boolean(response.remember), outcome: response.outcome || (response.allowed ? 'approved' : 'rejected') }
      : { allowed: Boolean(response), remember: false, outcome: response ? 'approved' : 'rejected' }
    if (!decision.allowed) throw new Error(`Capability invocation was ${decision.outcome}.`)
    if (decision.remember && permission !== 'destructive') this.rememberedApprovals.add(approvalKey)
    return true
  }

  configurationFor (gatewaySession, { executable, shimPath }) {
    return {
      command: executable,
      args: [shimPath],
      env: {
        ELECTRON_RUN_AS_NODE: '1',
        AMBIENTIC_GATEWAY_SOCKET: gatewaySession.socketPath,
        AMBIENTIC_GATEWAY_TOKEN: gatewaySession.token
      }
    }
  }

  async invokeNative (tool, args, binding) {
    if (tool === 'ambientic_context_get') return binding
    if (tool === 'ambientic_recall') return this.contextEngine.recall(args, binding)
    if (tool === 'ambientic_remember') {
      await this.authorize({ binding, tool, permission: 'write', arguments: args, title: 'Save a durable Ambientic memory' })
      return this.contextEngine.remember(args, binding)
    }
    if (tool === 'ambientic_goals') {
      const snapshot = this.goals?.list?.() || { goals: [] }
      if (args.action === 'list') return snapshot.goals
      const goalId = cleanText(args.goalId, 120) || binding.goalId
      if (binding.goalId && goalId !== binding.goalId) throw new Error('This session can reconcile only its linked goal.')
      const goal = snapshot.goals.find((item) => item.id === goalId)
      if (!goal) throw new Error('Goal not found.')
      if (args.action === 'reconcile') return this.contextEngine.confirmGoalReconciliation(binding, args.note)
      if (args.action === 'get') this.contextEngine.recordGoalRead(binding)
      return goal
    }
    if (tool === 'ambientic_task_update') {
      const snapshot = this.goals?.list?.() || { goals: [] }
      const linkedGoal = binding.goalId ? snapshot.goals.find((item) => item.id === binding.goalId) : null
      if (binding.goalId && !linkedGoal?.tasks?.some((item) => item.id === args.taskId)) {
        throw new Error('This session can update only tickets in its linked goal.')
      }
      if (binding.goalId && binding.taskId && !this.contextEngine.hasCurrentGoalRead(binding)) {
        throw new Error('Read the latest linked goal before updating its tickets.')
      }
      await this.authorize({ binding, tool, permission: 'write', arguments: args, title: 'Update an Ambientic task' })
      const patch = {}
      if (args.status) patch.status = args.status
      if (args.ownerName !== undefined) patch.ownerName = args.ownerName
      return this.goals.updateTask(args.taskId, patch)
    }
    if (tool === 'ambientic_capability') {
      if (args.action === 'search') return this.listCapabilities(binding.id, args.query)
      return this.invokeCapability({ binding, capabilityId: args.capabilityId, arguments: args.arguments || {}, idempotencyKey: args.idempotencyKey })
    }
    throw new Error(`Unknown Ambientic tool: ${tool}`)
  }

  async invoke ({ token, tool, arguments: args = {}, idempotencyKey = '' }) {
    const started = this.now()
    const { session, binding } = this.authenticate(token)
    tool = cleanText(tool, 160)
    this.authorizeScope(session, tool)
    const suppliedKey = cleanText(idempotencyKey || args.idempotencyKey, 160)
    // A provider-selected key is only idempotent inside one binding and tool.
    // Namespacing prevents one session from observing another session's result.
    const key = suppliedKey ? digest(`${binding.id}:${tool}:${suppliedKey}`) : ''
    const previous = key ? this.store.auditByIdempotency(key) : null
    if (previous) return { duplicate: true, result: previous.result_summary }
    let result
    let error
    try {
      result = await this.invokeNative(tool, args && typeof args === 'object' ? args : {}, binding)
      return result
    } catch (caught) {
      error = caught
      throw caught
    } finally {
      this.store.audit({
        eventType: 'gateway.call',
        actor: 'agent',
        provider: binding.provider,
        providerSessionId: binding.providerSessionId,
        bindingId: binding.id,
        tool,
        permission: tool === 'ambientic_task_update' || tool === 'ambientic_remember' ? 'write' : 'read',
        argumentsDigest: digest(args),
        approval: tool === 'ambientic_task_update' ? (error ? 'rejected_or_failed' : 'approved') : 'automatic',
        resultSummary: error ? `Error: ${error.message}` : cleanText(JSON.stringify(result), 1000),
        durationMs: this.now() - started,
        idempotencyKey: key
      })
      this.emit('change', this.getState())
    }
  }

  listCapabilities (_bindingId, query = '') {
    return this.store.listCapabilities({ query, limit: 100 })
  }

  async invokeCapability ({ binding, capabilityId, arguments: args = {}, idempotencyKey = '' }) {
    const capability = this.store.getCapability(capabilityId)
    if (!capability) throw new Error('Connected capability not found.')
    if (capability.permissionMode === 'deny') throw new Error('This capability is disabled by its Ambientic permission policy.')
    const connection = this.store.getConnection(capability.connectionId)
    if (!connection?.enabled) throw new Error('Connected tool is disabled.')
    if (capability.permissionMode === 'ask' || capability.permission !== 'read') {
      await this.authorize({ binding, tool: capability.name, connection, permission: capability.permission, arguments: args, title: `${connection.name}: ${capability.name}` })
    }
    const client = await this.clientFor(connection)
    return client.request('tools/call', { name: capability.name, arguments: args }, 120_000)
  }

  async clientFor (connection) {
    let client = this.clients.get(connection.id)
    if (!client) {
      client = new ExternalMcpClient(connection)
      this.clients.set(connection.id, client)
    }
    await client.initialize()
    return client
  }

  async upsertConnection (input = {}) {
    const existing = input.id ? this.store.getConnection(input.id) : null
    const parsedCommand = input.transport === 'stdio' && input.command ? parseCommandLine(input.command) : null
    const inlineConfig = input.transport === 'stdio'
      ? { command: parsedCommand?.command || input.command, args: Array.isArray(input.args) ? input.args : (parsedCommand?.args || []) }
      : input.transport === 'http' ? { url: input.url } : {}
    const connection = this.store.upsertConnection({
      ...existing,
      ...input,
      config: safeConfig({ ...(existing?.config || {}), ...(input.config || {}), ...inlineConfig })
    })
    for (const [capabilityId, policy] of Object.entries(input.capabilityPermissions || {})) {
      this.store.updateCapabilityPolicy(capabilityId, policy)
    }
    if (input.capabilityPermissions && !input.transport && existing) {
      this.emit('change', this.getState())
      return this.store.getConnection(connection.id)
    }
    await this.testConnection(connection.id)
    this.emit('change', this.getState())
    return this.store.getConnection(connection.id)
  }

  async testConnection (id) {
    const connection = this.store.getConnection(id)
    if (!connection) throw new Error('Connection not found.')
    this.clients.get(id)?.stop()
    this.clients.delete(id)
    try {
      const client = await this.clientFor(connection)
      const result = await client.request('tools/list', {}, 20_000)
      const tools = Array.isArray(result?.tools) ? result.tools : []
      this.store.replaceCapabilities(id, tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema || {},
        permission: permissionFor(tool)
      })))
      return this.store.upsertConnection({ ...connection, health: 'healthy', lastError: '', lastCheckedAt: this.now() })
    } catch (error) {
      this.store.upsertConnection({ ...connection, health: 'error', lastError: error.message, lastCheckedAt: this.now() })
      throw error
    }
  }

  disableConnection (id, disabled = true) {
    const connection = this.store.getConnection(id)
    if (!connection) throw new Error('Connection not found.')
    if (disabled) { this.clients.get(id)?.stop(); this.clients.delete(id) }
    const result = this.store.upsertConnection({ ...connection, enabled: !disabled })
    this.emit('change', this.getState())
    return result
  }

  disconnect (id) {
    this.clients.get(id)?.stop()
    this.clients.delete(id)
    const result = this.store.deleteConnection(id)
    this.emit('change', this.getState())
    return result
  }

  getState () {
    return { connections: this.listConnections(), capabilities: this.store.listCapabilities({ limit: 500 }), error: '' }
  }

  listConnections () {
    const activeSessions = this.store.listActiveGatewaySessions()
    const workflows = this.workflows?.()?.workflows || []
    return this.store.listConnections().map((connection) => {
      const capabilities = this.store.listCapabilities({ connectionId: connection.id, limit: 500 })
      const identifiers = capabilities.flatMap((item) => [item.id, item.name]).filter(Boolean)
      const dependentWorkflows = workflows.filter((workflow) => {
        const serialized = JSON.stringify(workflow)
        return identifiers.some((identifier) => serialized.includes(identifier))
      }).map((workflow) => ({ id: workflow.id, name: workflow.name || workflow.title || 'Workflow' }))
      return {
        ...connection,
        disabled: !connection.enabled,
        capabilityCount: capabilities.length,
        dependents: { sessions: activeSessions.length, workflows: dependentWorkflows }
      }
    })
  }

  async handleRequest (request) {
    if (request.method === 'tools/list') {
      const { session } = this.authenticate(request.token)
      return { tools: AMBIENTIC_TOOL_SCHEMAS.filter((tool) => session.scopes.includes(TOOL_SCOPES[tool.name])) }
    }
    if (request.method === 'tools/call') return this.invoke({ token: request.token, tool: request.params?.name, arguments: request.params?.arguments || {}, idempotencyKey: request.params?.arguments?.idempotencyKey })
    if (request.method === 'ping') return { ok: true }
    throw new Error(`Unsupported gateway method: ${request.method}`)
  }

  start () {
    if (this.server) return
    if (existsSync(this.socketPath)) {
      try { unlinkSync(this.socketPath) } catch {}
    }
    this.server = createServer((socket) => {
      let buffer = ''
      socket.setEncoding('utf8')
      socket.on('data', (chunk) => {
        buffer += chunk
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.trim()) continue
          let request
          try { request = JSON.parse(line) } catch { continue }
          Promise.resolve(this.handleRequest(request)).then(
            (result) => socket.write(`${JSON.stringify({ id: request.id, result })}\n`),
            (error) => socket.write(`${JSON.stringify({ id: request.id, error: { message: error.message } })}\n`)
          )
        }
      })
    })
    this.server.on('error', (error) => {
      console.error(`[ambientic] capability gateway socket failed: ${error.message}`)
      this.server = null
      this.emit('gateway-error', error)
    })
    this.server.listen(this.socketPath, () => {
      try { chmodSync(this.socketPath, 0o600) } catch {}
    })
  }

  stop () {
    for (const client of this.clients.values()) client.stop()
    this.clients.clear()
    this.rememberedApprovals.clear()
    this.server?.close()
    this.server = null
    if (existsSync(this.socketPath)) {
      try { unlinkSync(this.socketPath) } catch {}
    }
  }
}

export function createCapabilityGateway (options) { return new CapabilityGateway(options) }

export function callGatewaySocket ({ socketPath, token, method, params = {}, timeoutMs = 120_000 }) {
  return new Promise((resolve, reject) => {
    const id = randomUUID()
    const socket = createConnection(socketPath)
    let buffer = ''
    const timer = setTimeout(() => { socket.destroy(); reject(new Error(`${method} timed out`)) }, timeoutMs)
    socket.setEncoding('utf8')
    socket.on('connect', () => socket.write(`${JSON.stringify({ id, token, method, params })}\n`))
    socket.on('data', (chunk) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        let message
        try { message = JSON.parse(line) } catch { continue }
        if (message.id !== id) continue
        clearTimeout(timer)
        socket.end()
        if (message.error) reject(new Error(message.error.message || 'Gateway call failed.'))
        else resolve(message.result)
      }
    })
    socket.on('error', (error) => { clearTimeout(timer); reject(error) })
  })
}
