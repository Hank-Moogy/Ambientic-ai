import Database from 'better-sqlite3'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

const VALID_SCOPES = new Set(['user', 'project', 'goal', 'task', 'session'])
const VALID_KINDS = new Set(['preference', 'constraint', 'fact', 'decision', 'outcome', 'gotcha'])
const VALID_STATUSES = new Set(['candidate', 'active', 'conflicted', 'superseded'])
const VALID_PERMISSIONS = new Set(['read', 'write', 'destructive'])

const MIGRATIONS = [
  `
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      root_path TEXT UNIQUE,
      name TEXT NOT NULL,
      brief TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT 'active',
      exclusions_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE session_bindings (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      provider_session_id TEXT NOT NULL,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      goal_id TEXT,
      task_id TEXT,
      inference_source TEXT NOT NULL DEFAULT 'project_only',
      corrected_by_user INTEGER NOT NULL DEFAULT 0,
      capsule_text TEXT NOT NULL DEFAULT '',
      capsule_hash TEXT NOT NULL DEFAULT '',
      capsule_tokens INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(provider, provider_session_id)
    );

    CREATE TABLE memory_records (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      scope_id TEXT,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'candidate',
      sensitive INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER,
      supersedes_id TEXT REFERENCES memory_records(id) ON DELETE SET NULL,
      corroboration_count INTEGER NOT NULL DEFAULT 1,
      use_count INTEGER NOT NULL DEFAULT 0,
      last_used_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE memory_provenance (
      id TEXT PRIMARY KEY,
      memory_id TEXT NOT NULL REFERENCES memory_records(id) ON DELETE CASCADE,
      provider TEXT NOT NULL DEFAULT '',
      provider_session_id TEXT NOT NULL DEFAULT '',
      source_type TEXT NOT NULL DEFAULT 'manual',
      source_id TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE session_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      provider_session_id TEXT NOT NULL,
      provider_message_id TEXT NOT NULL,
      binding_id TEXT REFERENCES session_bindings(id) ON DELETE SET NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      sensitive INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      UNIQUE(provider, provider_session_id, provider_message_id)
    );

    CREATE VIRTUAL TABLE session_messages_fts USING fts5(
      content,
      content='session_messages',
      content_rowid='id',
      tokenize='unicode61 remove_diacritics 2'
    );
    CREATE TRIGGER session_messages_ai AFTER INSERT ON session_messages BEGIN
      INSERT INTO session_messages_fts(rowid, content) VALUES (new.id, new.content);
    END;
    CREATE TRIGGER session_messages_ad AFTER DELETE ON session_messages BEGIN
      INSERT INTO session_messages_fts(session_messages_fts, rowid, content) VALUES ('delete', old.id, old.content);
    END;
    CREATE TRIGGER session_messages_au AFTER UPDATE OF content ON session_messages BEGIN
      INSERT INTO session_messages_fts(session_messages_fts, rowid, content) VALUES ('delete', old.id, old.content);
      INSERT INTO session_messages_fts(rowid, content) VALUES (new.id, new.content);
    END;

    CREATE TABLE connections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      transport TEXT NOT NULL,
      config_json TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      health TEXT NOT NULL DEFAULT 'unknown',
      last_error TEXT NOT NULL DEFAULT '',
      last_checked_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE capabilities (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      input_schema_json TEXT NOT NULL DEFAULT '{}',
      permission TEXT NOT NULL DEFAULT 'read',
      enabled INTEGER NOT NULL DEFAULT 1,
      dependencies_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(connection_id, name)
    );

    CREATE TABLE gateway_sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      binding_id TEXT NOT NULL REFERENCES session_bindings(id) ON DELETE CASCADE,
      scopes_json TEXT NOT NULL DEFAULT '[]',
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE gateway_audit (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      actor TEXT NOT NULL DEFAULT 'agent',
      provider TEXT NOT NULL DEFAULT '',
      provider_session_id TEXT NOT NULL DEFAULT '',
      binding_id TEXT,
      tool TEXT NOT NULL DEFAULT '',
      permission TEXT NOT NULL DEFAULT 'read',
      arguments_digest TEXT NOT NULL DEFAULT '',
      approval TEXT NOT NULL DEFAULT 'automatic',
      result_summary TEXT NOT NULL DEFAULT '',
      duration_ms INTEGER NOT NULL DEFAULT 0,
      idempotency_key TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX gateway_audit_idempotency ON gateway_audit(idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key != '';

    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );

    CREATE INDEX memory_scope_status ON memory_records(scope, scope_id, status);
    CREATE INDEX messages_session ON session_messages(provider, provider_session_id, created_at);
    CREATE INDEX audit_created ON gateway_audit(created_at DESC);
  `
]

function json (value, fallback) {
  try { return JSON.parse(value) } catch { return fallback }
}

function cleanText (value, max = 4000) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max)
}

function rowProject (row) {
  return row && {
    id: row.id,
    rootPath: row.root_path || '',
    name: row.name,
    brief: row.brief,
    state: row.state,
    exclusions: json(row.exclusions_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function rowBinding (row) {
  return row && {
    id: row.id,
    provider: row.provider,
    providerSessionId: row.provider_session_id,
    projectId: row.project_id || '',
    goalId: row.goal_id || '',
    taskId: row.task_id || '',
    inferenceSource: row.inference_source,
    correctedByUser: Boolean(row.corrected_by_user),
    capsuleText: row.capsule_text,
    capsuleHash: row.capsule_hash,
    capsuleTokens: row.capsule_tokens,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function rowMemory (row) {
  return row && {
    id: row.id,
    scope: row.scope,
    scopeId: row.scope_id || '',
    kind: row.kind,
    content: row.content,
    confidence: row.confidence,
    status: row.status,
    sensitive: Boolean(row.sensitive),
    expiresAt: row.expires_at,
    supersedesId: row.supersedes_id || '',
    corroborationCount: row.corroboration_count,
    useCount: row.use_count,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function rowConnection (row) {
  return row && {
    id: row.id,
    name: row.name,
    transport: row.transport,
    config: json(row.config_json, {}),
    enabled: Boolean(row.enabled),
    health: row.health,
    lastError: row.last_error,
    lastCheckedAt: row.last_checked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function rowCapability (row) {
  return row && {
    id: row.id,
    connectionId: row.connection_id,
    name: row.name,
    description: row.description,
    inputSchema: json(row.input_schema_json, {}),
    permission: row.permission,
    enabled: Boolean(row.enabled),
    dependencies: json(row.dependencies_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class ContextStore {
  constructor ({ file, now = () => Date.now(), id = () => randomUUID(), databaseFactory = (path) => new Database(path) }) {
    if (!file) throw new Error('Context database path is required.')
    this.file = file
    this.now = now
    this.id = id
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
    this.db = databaseFactory(file)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('busy_timeout = 5000')
    this.migrate()
  }

  migrate () {
    const hasMigrations = this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get()
    const applied = hasMigrations
      ? new Set(this.db.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version))
      : new Set()
    const pending = MIGRATIONS.map((_, index) => index + 1).filter((version) => !applied.has(version))
    if (!pending.length) return
    if (existsSync(this.file) && this.file !== ':memory:') {
      try { copyFileSync(this.file, `${this.file}.pre-migration`) } catch {}
    }
    this.db.transaction(() => {
      for (const version of pending) {
        this.db.exec(MIGRATIONS[version - 1])
        this.db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(version, this.now())
      }
    })()
  }

  close () { this.db.close() }

  upsertProject (input = {}) {
    const now = this.now()
    const rootPath = cleanText(input.rootPath, 2000) || null
    const existing = input.id
      ? this.db.prepare('SELECT * FROM projects WHERE id = ?').get(input.id)
      : (rootPath ? this.db.prepare('SELECT * FROM projects WHERE root_path = ?').get(rootPath) : null)
    const id = existing?.id || cleanText(input.id, 120) || this.id()
    const name = cleanText(input.name, 120) || (rootPath?.split('/').filter(Boolean).at(-1)) || 'Untitled project'
    this.db.prepare(`
      INSERT INTO projects(id, root_path, name, brief, state, exclusions_json, created_at, updated_at)
      VALUES (@id, @rootPath, @name, @brief, @state, @exclusions, @createdAt, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET root_path=excluded.root_path, name=excluded.name, brief=excluded.brief,
        state=excluded.state, exclusions_json=excluded.exclusions_json, updated_at=excluded.updated_at
    `).run({
      id,
      rootPath,
      name,
      brief: cleanText(input.brief ?? existing?.brief, 2000),
      state: ['active', 'archived'].includes(input.state) ? input.state : (existing?.state || 'active'),
      exclusions: JSON.stringify(Array.isArray(input.exclusions) ? input.exclusions.slice(0, 100) : json(existing?.exclusions_json, [])),
      createdAt: existing?.created_at || now,
      updatedAt: now
    })
    return this.getProject(id)
  }

  getProject (id) { return rowProject(this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id)) }
  projectByRoot (rootPath) { return rowProject(this.db.prepare('SELECT * FROM projects WHERE root_path = ?').get(rootPath)) }
  listProjects () { return this.db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all().map(rowProject) }

  createBinding (input = {}) {
    const now = this.now()
    const existing = this.bindingFor(input.provider, input.providerSessionId)
    if (existing) return existing
    const binding = {
      id: cleanText(input.id, 120) || this.id(),
      provider: cleanText(input.provider, 24),
      providerSessionId: cleanText(input.providerSessionId, 200),
      projectId: cleanText(input.projectId, 120) || null,
      goalId: cleanText(input.goalId, 120) || null,
      taskId: cleanText(input.taskId, 120) || null,
      inferenceSource: cleanText(input.inferenceSource, 80) || 'project_only',
      correctedByUser: input.correctedByUser ? 1 : 0,
      capsuleText: String(input.capsuleText || '').slice(0, 12_000),
      capsuleHash: cleanText(input.capsuleHash, 128),
      capsuleTokens: Math.max(0, Number(input.capsuleTokens) || 0),
      createdAt: now,
      updatedAt: now
    }
    this.db.prepare(`INSERT INTO session_bindings(
      id, provider, provider_session_id, project_id, goal_id, task_id, inference_source, corrected_by_user,
      capsule_text, capsule_hash, capsule_tokens, created_at, updated_at
    ) VALUES (@id, @provider, @providerSessionId, @projectId, @goalId, @taskId, @inferenceSource,
      @correctedByUser, @capsuleText, @capsuleHash, @capsuleTokens, @createdAt, @updatedAt)`).run(binding)
    return this.getBinding(binding.id)
  }

  getBinding (id) { return rowBinding(this.db.prepare('SELECT * FROM session_bindings WHERE id = ?').get(id)) }
  bindingFor (provider, providerSessionId) { return rowBinding(this.db.prepare('SELECT * FROM session_bindings WHERE provider = ? AND provider_session_id = ?').get(provider, providerSessionId)) }

  updateBinding (id, patch = {}) {
    const current = this.getBinding(id)
    if (!current) throw new Error('Context binding not found.')
    const next = {
      providerSessionId: cleanText(patch.providerSessionId ?? current.providerSessionId, 200),
      projectId: cleanText(patch.projectId ?? current.projectId, 120) || null,
      goalId: cleanText(patch.goalId ?? current.goalId, 120) || null,
      taskId: cleanText(patch.taskId ?? current.taskId, 120) || null,
      inferenceSource: cleanText(patch.inferenceSource ?? current.inferenceSource, 80),
      correctedByUser: patch.correctedByUser === undefined ? Number(current.correctedByUser) : Number(Boolean(patch.correctedByUser)),
      capsuleText: String(patch.capsuleText ?? current.capsuleText).slice(0, 12_000),
      capsuleHash: cleanText(patch.capsuleHash ?? current.capsuleHash, 128),
      capsuleTokens: Math.max(0, Number(patch.capsuleTokens ?? current.capsuleTokens) || 0),
      updatedAt: this.now(),
      id
    }
    this.db.prepare(`UPDATE session_bindings SET provider_session_id=@providerSessionId, project_id=@projectId,
      goal_id=@goalId, task_id=@taskId, inference_source=@inferenceSource, corrected_by_user=@correctedByUser,
      capsule_text=@capsuleText, capsule_hash=@capsuleHash, capsule_tokens=@capsuleTokens, updated_at=@updatedAt WHERE id=@id`).run(next)
    return this.getBinding(id)
  }

  remember (input = {}) {
    const scope = VALID_SCOPES.has(input.scope) ? input.scope : 'user'
    const kind = VALID_KINDS.has(input.kind) ? input.kind : 'fact'
    const status = VALID_STATUSES.has(input.status) ? input.status : 'active'
    const content = cleanText(input.content, 2000)
    if (!content) throw new Error('Memory content is required.')
    const now = this.now()
    const normalized = content.toLocaleLowerCase()
    const duplicate = this.db.prepare(`SELECT * FROM memory_records WHERE scope=? AND coalesce(scope_id,'')=? AND lower(content)=? AND status != 'superseded'`).get(scope, cleanText(input.scopeId, 120), normalized)
    if (duplicate) {
      const corroboration = duplicate.corroboration_count + (input.independent ? 1 : 0)
      const promoted = duplicate.status === 'candidate' && corroboration >= 2 && Number(input.confidence ?? duplicate.confidence) >= 0.85 && !duplicate.sensitive
      this.db.prepare('UPDATE memory_records SET corroboration_count=?, confidence=max(confidence, ?), status=?, updated_at=? WHERE id=?')
        .run(corroboration, Number(input.confidence ?? duplicate.confidence), promoted ? 'active' : duplicate.status, now, duplicate.id)
      if (input.provenance) this.addProvenance(duplicate.id, input.provenance)
      return this.getMemory(duplicate.id)
    }
    const record = {
      id: cleanText(input.id, 120) || this.id(),
      scope,
      scopeId: cleanText(input.scopeId, 120) || null,
      kind,
      content,
      confidence: Math.max(0, Math.min(1, Number(input.confidence ?? 1))),
      status,
      sensitive: input.sensitive ? 1 : 0,
      expiresAt: input.expiresAt ? Number(input.expiresAt) : null,
      supersedesId: cleanText(input.supersedesId, 120) || null,
      corroborationCount: Math.max(1, Number(input.corroborationCount) || 1),
      createdAt: now,
      updatedAt: now
    }
    this.db.prepare(`INSERT INTO memory_records(id,scope,scope_id,kind,content,confidence,status,sensitive,expires_at,
      supersedes_id,corroboration_count,created_at,updated_at) VALUES (@id,@scope,@scopeId,@kind,@content,@confidence,
      @status,@sensitive,@expiresAt,@supersedesId,@corroborationCount,@createdAt,@updatedAt)`).run(record)
    if (input.provenance) this.addProvenance(record.id, input.provenance)
    return this.getMemory(record.id)
  }

  addProvenance (memoryId, input = {}) {
    this.db.prepare(`INSERT INTO memory_provenance(id,memory_id,provider,provider_session_id,source_type,source_id,created_at)
      VALUES (?,?,?,?,?,?,?)`).run(this.id(), memoryId, cleanText(input.provider, 24), cleanText(input.providerSessionId, 200), cleanText(input.sourceType, 40) || 'manual', cleanText(input.sourceId, 200), this.now())
  }

  getMemory (id) {
    const record = rowMemory(this.db.prepare('SELECT * FROM memory_records WHERE id = ?').get(id))
    if (!record) return null
    record.provenance = this.db.prepare('SELECT provider,provider_session_id,source_type,source_id,created_at FROM memory_provenance WHERE memory_id=? ORDER BY created_at DESC').all(id).map((row) => ({
      provider: row.provider, providerSessionId: row.provider_session_id, sourceType: row.source_type, sourceId: row.source_id, createdAt: row.created_at
    }))
    return record
  }

  listMemory ({ scope, scopeId, status, limit = 200 } = {}) {
    const clauses = []
    const args = []
    if (VALID_SCOPES.has(scope)) { clauses.push('scope = ?'); args.push(scope) }
    if (scopeId) { clauses.push("coalesce(scope_id,'') = ?"); args.push(cleanText(scopeId, 120)) }
    if (VALID_STATUSES.has(status)) { clauses.push('status = ?'); args.push(status) }
    clauses.push('(expires_at IS NULL OR expires_at > ?)'); args.push(this.now())
    const rows = this.db.prepare(`SELECT * FROM memory_records WHERE ${clauses.join(' AND ')} ORDER BY status='active' DESC, updated_at DESC LIMIT ?`).all(...args, Math.max(1, Math.min(500, Number(limit) || 200)))
    return rows.map((row) => this.getMemory(row.id))
  }

  searchMemory (query, { projectId = '', limit = 12 } = {}) {
    const term = `%${cleanText(query, 500).replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
    const rows = this.db.prepare(`SELECT * FROM memory_records WHERE content LIKE ? ESCAPE '\\' AND status IN ('active','candidate')
      AND (scope='user' OR scope_id=? OR ?='') AND (expires_at IS NULL OR expires_at>?) ORDER BY status='active' DESC, confidence DESC, updated_at DESC LIMIT ?`)
      .all(term, projectId, projectId, this.now(), Math.max(1, Math.min(50, Number(limit) || 12)))
    return rows.map((row) => this.getMemory(row.id))
  }

  supersedeMemory (id, input = {}) {
    const current = this.getMemory(id)
    if (!current) throw new Error('Memory not found.')
    const replacement = this.remember({ ...current, ...input, id: undefined, status: 'active', supersedesId: id })
    this.db.prepare("UPDATE memory_records SET status='superseded', updated_at=? WHERE id=?").run(this.now(), id)
    return replacement
  }

  forgetMemory (id) {
    const current = this.getMemory(id)
    if (!current) return false
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM memory_records WHERE id=?').run(id)
      this.audit({ eventType: 'memory.forgotten', actor: 'human', resultSummary: `Forgot ${current.scope}/${current.kind}` })
    })()
    return true
  }

  observeMessage (input = {}) {
    const content = cleanText(input.content, 30_000)
    if (!content) return false
    return this.db.prepare(`INSERT OR IGNORE INTO session_messages(provider,provider_session_id,provider_message_id,binding_id,role,content,sensitive,created_at)
      VALUES (?,?,?,?,?,?,?,?)`).run(cleanText(input.provider, 24), cleanText(input.providerSessionId, 200), cleanText(input.providerMessageId, 200) || this.id(), cleanText(input.bindingId, 120) || null, cleanText(input.role, 24) || 'unknown', content, input.sensitive ? 1 : 0, Number(input.createdAt) || this.now()).changes > 0
  }

  searchMessages (query, { bindingId = '', projectId = '', limit = 12 } = {}) {
    const raw = cleanText(query, 500)
    if (!raw) return []
    const fts = raw.split(/\s+/).filter(Boolean).slice(0, 12).map((token) => `"${token.replaceAll('"', '""')}"`).join(' OR ')
    if (!fts) return []
    return this.db.prepare(`SELECT m.id,m.provider,m.provider_session_id,m.role,m.content,m.created_at,b.project_id,
      bm25(session_messages_fts) AS rank FROM session_messages_fts
      JOIN session_messages m ON m.id=session_messages_fts.rowid
      LEFT JOIN session_bindings b ON b.id=m.binding_id
      WHERE session_messages_fts MATCH ? AND m.sensitive=0
        AND (?='' OR m.binding_id=?) AND (?='' OR b.project_id=?)
      ORDER BY rank LIMIT ?`).all(fts, bindingId, bindingId, projectId, projectId, Math.max(1, Math.min(50, Number(limit) || 12))).map((row) => ({
        id: `message:${row.id}`, type: 'episode', provider: row.provider, providerSessionId: row.provider_session_id,
        role: row.role, content: row.content, projectId: row.project_id || '', createdAt: row.created_at, score: -Number(row.rank || 0)
      }))
  }

  upsertConnection (input = {}) {
    const now = this.now()
    const id = cleanText(input.id, 120) || this.id()
    const existing = this.getConnection(id)
    this.db.prepare(`INSERT INTO connections(id,name,transport,config_json,enabled,health,last_error,last_checked_at,created_at,updated_at)
      VALUES (@id,@name,@transport,@config,@enabled,@health,@lastError,@lastCheckedAt,@createdAt,@updatedAt)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,transport=excluded.transport,config_json=excluded.config_json,
      enabled=excluded.enabled,health=excluded.health,last_error=excluded.last_error,last_checked_at=excluded.last_checked_at,updated_at=excluded.updated_at`).run({
      id,
      name: cleanText(input.name, 120) || existing?.name || 'Connected tool',
      transport: ['stdio', 'http'].includes(input.transport) ? input.transport : (existing?.transport || 'stdio'),
      config: JSON.stringify(input.config && typeof input.config === 'object' ? input.config : (existing?.config || {})),
      enabled: Number(input.enabled ?? existing?.enabled ?? true),
      health: cleanText(input.health ?? existing?.health, 40) || 'unknown',
      lastError: cleanText(input.lastError ?? existing?.lastError, 1000),
      lastCheckedAt: input.lastCheckedAt ?? existing?.lastCheckedAt ?? null,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    })
    return this.getConnection(id)
  }

  getConnection (id) { return rowConnection(this.db.prepare('SELECT * FROM connections WHERE id=?').get(id)) }
  listConnections () { return this.db.prepare('SELECT * FROM connections ORDER BY updated_at DESC').all().map(rowConnection) }
  deleteConnection (id) { return this.db.prepare('DELETE FROM connections WHERE id=?').run(id).changes > 0 }

  replaceCapabilities (connectionId, capabilities = []) {
    const now = this.now()
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM capabilities WHERE connection_id=?').run(connectionId)
      const insert = this.db.prepare(`INSERT INTO capabilities(id,connection_id,name,description,input_schema_json,permission,enabled,dependencies_json,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`)
      for (const item of capabilities.slice(0, 500)) {
        const name = cleanText(item.name, 160)
        if (!name) continue
        insert.run(`${connectionId}:${name}`, connectionId, name, cleanText(item.description, 1000), JSON.stringify(item.inputSchema || {}), VALID_PERMISSIONS.has(item.permission) ? item.permission : 'read', 1, JSON.stringify(item.dependencies || []), now, now)
      }
    })()
    return this.listCapabilities({ connectionId })
  }

  listCapabilities ({ connectionId = '', query = '', limit = 100 } = {}) {
    const term = `%${cleanText(query, 500)}%`
    return this.db.prepare(`SELECT * FROM capabilities WHERE enabled=1 AND (?='' OR connection_id=?)
      AND (?='' OR name LIKE ? OR description LIKE ?) ORDER BY permission='read' DESC,name LIMIT ?`)
      .all(connectionId, connectionId, query, term, term, Math.max(1, Math.min(500, Number(limit) || 100))).map(rowCapability)
  }

  getCapability (id) { return rowCapability(this.db.prepare('SELECT * FROM capabilities WHERE id=?').get(id)) }

  createGatewaySession ({ id = this.id(), tokenHash, bindingId, scopes = [], expiresAt }) {
    this.db.prepare('INSERT INTO gateway_sessions(id,token_hash,binding_id,scopes_json,expires_at,created_at) VALUES (?,?,?,?,?,?)')
      .run(id, tokenHash, bindingId, JSON.stringify(scopes), Number(expiresAt), this.now())
    return { id, bindingId, scopes, expiresAt: Number(expiresAt) }
  }

  gatewaySessionByHash (tokenHash) {
    const row = this.db.prepare(`SELECT g.*,b.provider,b.provider_session_id FROM gateway_sessions g JOIN session_bindings b ON b.id=g.binding_id
      WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?`).get(tokenHash, this.now())
    return row && { id: row.id, bindingId: row.binding_id, provider: row.provider, providerSessionId: row.provider_session_id, scopes: json(row.scopes_json, []), expiresAt: row.expires_at }
  }

  revokeGatewaySessions (bindingId) { return this.db.prepare('UPDATE gateway_sessions SET revoked_at=? WHERE binding_id=? AND revoked_at IS NULL').run(this.now(), bindingId).changes }

  audit (input = {}) {
    const id = cleanText(input.id, 120) || this.id()
    try {
      this.db.prepare(`INSERT INTO gateway_audit(id,event_type,actor,provider,provider_session_id,binding_id,tool,permission,arguments_digest,
        approval,result_summary,duration_ms,idempotency_key,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, cleanText(input.eventType, 80) || 'gateway.call', cleanText(input.actor, 40) || 'agent', cleanText(input.provider, 24),
        cleanText(input.providerSessionId, 200), cleanText(input.bindingId, 120) || null, cleanText(input.tool, 160),
        VALID_PERMISSIONS.has(input.permission) ? input.permission : 'read', cleanText(input.argumentsDigest, 128), cleanText(input.approval, 40) || 'automatic',
        cleanText(input.resultSummary, 1000), Math.max(0, Number(input.durationMs) || 0), cleanText(input.idempotencyKey, 160) || null, this.now()
      )
    } catch (error) {
      if (!/UNIQUE constraint failed: gateway_audit.idempotency_key/.test(error.message)) throw error
      return this.db.prepare('SELECT * FROM gateway_audit WHERE idempotency_key=?').get(input.idempotencyKey)
    }
    return this.db.prepare('SELECT * FROM gateway_audit WHERE id=?').get(id)
  }

  listAudit ({ limit = 200, eventType = '' } = {}) {
    return this.db.prepare(`SELECT * FROM gateway_audit WHERE (?='' OR event_type=?) ORDER BY created_at DESC LIMIT ?`)
      .all(eventType, eventType, Math.max(1, Math.min(1000, Number(limit) || 200))).map((row) => ({
        id: row.id, eventType: row.event_type, actor: row.actor, provider: row.provider, providerSessionId: row.provider_session_id,
        bindingId: row.binding_id || '', tool: row.tool, permission: row.permission, approval: row.approval,
        resultSummary: row.result_summary, durationMs: row.duration_ms, idempotencyKey: row.idempotency_key || '', createdAt: row.created_at
      }))
  }
}

export function createContextStore (options) { return new ContextStore(options) }
