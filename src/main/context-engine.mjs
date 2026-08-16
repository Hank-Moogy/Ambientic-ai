import { createHash, randomUUID } from 'node:crypto'
import { basename, resolve, sep } from 'node:path'
import { EventEmitter } from 'node:events'
import { CAPSULE_MAX_TOKENS, CAPSULE_TARGET_TOKENS } from '../shared/context-contract.mjs'

const SECRET_PATTERNS = [
  /\b(?:sk|pk|rk)-[a-z0-9_-]{16,}\b/gi,
  /\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|password)\s*[:=]\s*[^\s,;]{8,}/gi,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi,
  /\bgh[opusr]_[a-zA-Z0-9]{20,}\b/g
]

function cleanText (value, max = 4000) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max)
}

function words (value) {
  return new Set(cleanText(value, 10_000).toLocaleLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter((item) => item.length > 2))
}

function lexicalScore (query, candidate) {
  const left = words(query)
  const right = words(candidate)
  if (!left.size || !right.size) return 0
  let matches = 0
  for (const word of left) if (right.has(word)) matches += 1
  return matches / Math.sqrt(left.size * right.size)
}

function pathContains (rootPath, workingDirectory) {
  if (!rootPath || !workingDirectory) return false
  const root = resolve(String(rootPath))
  const cwd = resolve(String(workingDirectory))
  return cwd === root || cwd.startsWith(`${root}${sep}`)
}

export function estimateTokens (value) {
  return Math.ceil(String(value || '').length / 4)
}

export function redactSecrets (value) {
  let text = String(value || '')
  let sensitive = false
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, () => {
      sensitive = true
      return '[REDACTED SECRET]'
    })
  }
  return { text, sensitive }
}

export function looksSecret (value) {
  return redactSecrets(value).sensitive
}

export function looksSensitivePersonal (value) {
  return /\b(?:medical|diagnos(?:is|ed)|disability|religion|religious|politic(?:s|al)|sexual orientation|ethnicity|race|pregnan(?:t|cy)|mental health|therapy|bankruptcy|criminal record)\b/i.test(String(value || ''))
}

function truncateCapsule (sections, maxTokens = CAPSULE_MAX_TOKENS) {
  const maxChars = maxTokens * 4
  const output = []
  let used = 0
  for (const section of sections.filter(Boolean)) {
    if (used >= maxChars) break
    const remaining = maxChars - used
    const value = section.length > remaining ? `${section.slice(0, Math.max(0, remaining - 1)).trimEnd()}…` : section
    if (value.trim()) output.push(value)
    used += value.length + 2
  }
  return output.join('\n\n')
}

function goalCollections (goalsService) {
  const snapshot = goalsService?.list?.() || { goals: [] }
  return Array.isArray(snapshot.goals) ? snapshot.goals : []
}

function explicitMemoryFrom (text) {
  const value = cleanText(text, 2000)
  const remember = value.match(/\b(?:remember|please remember|keep in mind)\s+(?:that\s+)?(.{4,})/i)
  if (remember) return { content: remember[1], kind: 'fact', explicit: true }
  const prefer = value.match(/\bI (?:strongly )?(?:prefer|like|want)\s+(.{4,})/i)
  if (prefer) return { content: `User prefers ${prefer[1]}`, kind: 'preference', explicit: true }
  const constraint = value.match(/\b(?:never|always|do not|don't)\s+(.{4,})/i)
  if (constraint) return { content: value, kind: 'constraint', explicit: false }
  return null
}

export class ContextEngine extends EventEmitter {
  constructor ({ store, goals, now = () => Date.now(), id = () => randomUUID(), consent = () => true }) {
    super()
    this.store = store
    this.goals = goals
    this.now = now
    this.id = id
    this.consent = consent
  }

  inferLaunch ({ cwd = '', prompt = '', projectId = '', goalId = '', taskId = '' } = {}) {
    const goals = goalCollections(this.goals)
    let goal = goalId ? goals.find((item) => item.id === goalId) : null
    let task = taskId ? goals.flatMap((item) => item.tasks || []).find((item) => item.id === taskId) : null
    if (goalId && !goal) throw new Error('The selected Ambientic goal is no longer available.')
    if (taskId && !task) throw new Error('The selected Ambientic task is no longer available.')
    if (task && goal && task.goalId !== goal.id) throw new Error('The selected task does not belong to the selected goal.')
    if (task && !goal) goal = goals.find((item) => item.id === task.goalId) || null

    const impliedProjectId = projectId || task?.projectId || goal?.projectId || ''
    let project = impliedProjectId ? this.store.getProject(impliedProjectId) : null
    if (impliedProjectId && !project) throw new Error('The selected Ambientic project is no longer available.')
    let source = projectId || goalId || taskId ? 'explicit' : ''
    if (!project && cwd) {
      project = this.store.projectByRoot(cwd)
      if (project) source = 'working_directory'
    }

    if (project?.rootPath && cwd && !pathContains(project.rootPath, cwd)) {
      throw new Error(`“${project.name}” is linked to ${project.rootPath}. Choose that project workspace instead of mixing its context with another folder.`)
    }
    if (goal?.projectId && project && goal.projectId !== project.id) throw new Error('The selected goal belongs to a different Ambientic project.')
    if (task?.projectId && project && task.projectId !== project.id) throw new Error('The selected task belongs to a different Ambientic project.')

    const projectGoals = goals.filter((item) => {
      const tasks = item.tasks || []
      return item.projectId === project?.id || tasks.some((candidate) => candidate.projectId === project?.id)
    })
    if (!task && project) {
      const active = projectGoals.flatMap((item) => (item.tasks || []).map((candidate) => ({ ...candidate, goal: item })))
        .filter((item) => ['in_progress', 'review'].includes(item.status))
        .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))[0]
      if (active) {
        task = active
        goal = active.goal
        source ||= 'recent_active_task'
      }
    }
    if (!goal && projectGoals.length) {
      goal = projectGoals.filter((item) => item.status === 'active').sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))[0] || null
      if (goal) source ||= 'recent_active_goal'
    }
    if (!goal && prompt) {
      // A prompt may refine direction inside the selected project, but must
      // never pull a goal (and its memory) across project boundaries. When no
      // project is selected, only explicitly folderless goals are eligible.
      const eligibleGoals = project ? projectGoals : goals.filter((item) => !item.projectId)
      const ranked = eligibleGoals.map((item) => ({
        goal: item,
        score: lexicalScore(prompt, [item.title, item.outcome, item.successCriteria, ...(item.tasks || []).map((candidate) => `${candidate.title} ${candidate.description}`)].join(' '))
      })).sort((left, right) => right.score - left.score)
      if (ranked[0]?.score >= 0.18) {
        goal = ranked[0].goal
        source ||= 'prompt_match'
        const taskRank = (goal.tasks || []).map((item) => ({ task: item, score: lexicalScore(prompt, `${item.title} ${item.description} ${item.acceptanceCriteria}`) })).sort((left, right) => right.score - left.score)
        if (taskRank[0]?.score >= 0.2) task = taskRank[0].task
      }
    }
    return {
      project: project || null,
      goal: goal || null,
      task: task || null,
      inferenceSource: source || (project ? 'project_only' : 'none'),
      confidence: source === 'explicit' ? 1 : source === 'prompt_match' ? 0.7 : project ? 0.85 : 0
    }
  }

  backfillProjects (sessions = []) {
    const projects = []
    for (const session of sessions) {
      const rootPath = cleanText(session?.cwd, 2000)
      if (!rootPath) continue
      const existing = this.store.projectByRoot(rootPath)
      projects.push(existing || this.store.upsertProject({ rootPath, name: cleanText(session?.project, 120) || basename(rootPath) || 'Local project' }))
    }
    return projects
  }

  buildCapsule ({ project, goal, task } = {}) {
    const userMemory = this.store.listMemory({ scope: 'user', status: 'active', limit: 20 })
    const projectMemory = project ? this.store.listMemory({ scope: 'project', scopeId: project.id, status: 'active', limit: 20 }) : []
    const prioritized = [...userMemory, ...projectMemory]
      .filter((item) => !item.sensitive)
      .sort((left, right) => right.confidence - left.confidence || right.updatedAt - left.updatedAt)

    const sections = [
      '<ambientic-memory>',
      'Ambientic supplied this frozen session context. Use it as durable background, and use Ambientic recall/goals tools when deeper or current context is needed.',
      userMemory.length ? `User profile:\n${userMemory.slice(0, 8).map((item) => `- ${item.content}`).join('\n')}` : '',
      project ? `Project: ${project.name}${project.rootPath ? `\nRoot: ${project.rootPath}` : ''}${project.brief ? `\nBrief: ${project.brief}` : ''}` : '',
      goal ? `Active goal: ${goal.title}${goal.outcome ? `\nOutcome: ${goal.outcome}` : ''}${goal.why ? `\nWhy: ${goal.why}` : ''}${goal.successCriteria ? `\nSuccess criteria: ${goal.successCriteria}` : ''}` : '',
      task ? `Current task: ${task.title}${task.description ? `\nDescription: ${task.description}` : ''}${task.acceptanceCriteria ? `\nAcceptance criteria: ${task.acceptanceCriteria}` : ''}` : '',
      goal && task ? `Goal closeout protocol (required before finishing a meaningful work turn):
1. Call ambientic_goals with action "get" and goalId "${goal.id}" to read the latest goal and tickets.
2. Compare the work actually completed with each affected ticket's acceptance criteria. Never infer completion from intent alone.
3. Call ambientic_task_update for every affected ticket whose status should change. Use done only when its acceptance criteria are met; review when implementation is complete but verification or human review remains; blocked when progress cannot continue; otherwise keep it in_progress.
4. Call ambientic_goals with action "reconcile", goalId "${goal.id}", and a short note, even when no ticket needed a change. The linked task is "${task.id}".
Do this before the final user-facing response. Ambientic audits missing reconciliation but never guesses ticket status.` : '',
      projectMemory.length ? `Project memory:\n${projectMemory.slice(0, 10).map((item) => `- [${item.kind}] ${item.content}`).join('\n')}` : '',
      prioritized.length ? 'Do not repeat this context to the user unless it is directly relevant.' : '',
      '</ambientic-memory>'
    ]
    const text = truncateCapsule(sections, CAPSULE_MAX_TOKENS)
    const hash = createHash('sha256').update(text).digest('hex')
    return { text, hash, tokens: estimateTokens(text), targetTokens: CAPSULE_TARGET_TOKENS, maxTokens: CAPSULE_MAX_TOKENS }
  }

  prepareSession ({ provider, providerSessionId = `pending:${this.id()}`, cwd = '', prompt = '', projectId = '', goalId = '', taskId = '' } = {}) {
    const existing = this.store.bindingFor(provider, providerSessionId)
    if (existing) return { binding: this.enrichBinding(existing), capsule: { text: existing.capsuleText, hash: existing.capsuleHash, tokens: existing.capsuleTokens } }
    const inferred = this.inferLaunch({ cwd, prompt, projectId, goalId, taskId })
    const capsule = this.buildCapsule(inferred)
    const binding = this.store.createBinding({
      provider,
      providerSessionId,
      projectId: inferred.project?.id,
      goalId: inferred.goal?.id,
      taskId: inferred.task?.id,
      inferenceSource: inferred.inferenceSource,
      correctedByUser: Boolean(projectId || goalId || taskId),
      capsuleText: capsule.text,
      capsuleHash: capsule.hash,
      capsuleTokens: capsule.tokens
    })
    this.store.audit({ eventType: 'context.capsule.created', actor: 'ambientic', provider, providerSessionId, bindingId: binding.id, resultSummary: `Frozen capsule ${capsule.tokens} tokens` })
    this.emit('change', this.getState())
    return { binding: this.enrichBinding(binding), capsule, inferred }
  }

  bindProviderSession (bindingId, providerSessionId) {
    const binding = this.store.updateBinding(bindingId, { providerSessionId })
    return this.enrichBinding(binding)
  }

  bindingFor (provider, providerSessionId) {
    return this.enrichBinding(this.store.bindingFor(provider, providerSessionId))
  }

  enrichBinding (binding) {
    if (!binding) return null
    const goals = goalCollections(this.goals)
    const goal = goals.find((item) => item.id === binding.goalId) || null
    const task = goals.flatMap((item) => item.tasks || []).find((item) => item.id === binding.taskId) || null
    return { ...binding, project: binding.projectId ? this.store.getProject(binding.projectId) : null, goal, task }
  }

  rebind (bindingId, patch = {}) {
    const current = this.store.getBinding(bindingId)
    if (!current) throw new Error('Context binding not found.')
    const next = this.store.updateBinding(bindingId, { ...patch, inferenceSource: 'explicit', correctedByUser: true })
    this.store.audit({ eventType: 'context.binding.updated', actor: 'human', provider: current.provider, providerSessionId: current.providerSessionId, bindingId, resultSummary: 'Binding corrected; frozen capsule retained for session stability' })
    this.emit('change', this.getState())
    return this.enrichBinding(next)
  }

  remember (input = {}, binding = null) {
    const content = cleanText(input.content, 2000)
    if (!content) throw new Error('Say what Ambientic should remember.')
    if (looksSecret(content)) throw new Error('Ambientic will not save content that looks like a credential or secret.')
    const scope = input.scope || (binding?.projectId ? 'project' : 'user')
    const scopeId = input.scopeId || (scope === 'project' ? binding?.projectId : scope === 'goal' ? binding?.goalId : scope === 'task' ? binding?.taskId : scope === 'session' ? binding?.id : '')
    if (input.supersedesId) {
      const record = this.store.supersedeMemory(input.supersedesId, {
        content,
        kind: input.kind,
        scope,
        scopeId,
        confidence: input.confidence ?? 1,
        provenance: input.provenance || (binding ? { provider: binding.provider, providerSessionId: binding.providerSessionId, sourceType: 'agent_tool' } : { sourceType: 'manual' })
      })
      this.store.audit({ eventType: 'memory.superseded', actor: input.actor || 'human', provider: binding?.provider, providerSessionId: binding?.providerSessionId, bindingId: binding?.id, tool: 'ambientic_remember', permission: 'write', resultSummary: `Superseded ${record.scope}/${record.kind}` })
      this.emit('change', this.getState())
      return record
    }
    const sensitive = Boolean(input.sensitive || looksSensitivePersonal(content))
    const record = this.store.remember({
      content,
      kind: input.kind,
      scope,
      scopeId,
      status: sensitive ? 'candidate' : (input.status || 'active'),
      sensitive,
      confidence: input.confidence ?? 1,
      independent: Boolean(input.independent),
      expiresAt: input.expiresAt,
      provenance: input.provenance || (binding ? { provider: binding.provider, providerSessionId: binding.providerSessionId, sourceType: 'agent_tool' } : { sourceType: 'manual' })
    })
    this.store.audit({ eventType: 'memory.saved', actor: input.actor || 'agent', provider: binding?.provider, providerSessionId: binding?.providerSessionId, bindingId: binding?.id, tool: 'ambientic_remember', permission: 'write', resultSummary: `Saved ${record.scope}/${record.kind}` })
    this.emit('change', this.getState())
    return record
  }

  recall ({ query, scope = '', limit = 12 } = {}, binding = null) {
    const text = cleanText(query, 500)
    if (!text) throw new Error('Recall query is required.')
    const memories = this.store.searchMemory(text, { projectId: binding?.projectId || '', limit })
      .filter((item) => item.status === 'active' && !item.sensitive && (!scope || item.scope === scope))
      .map((item) => ({ ...item, type: 'memory' }))
    const messages = this.store.searchMessages(text, { projectId: binding?.projectId || '', limit })
    const hits = [...memories, ...messages].slice(0, Math.max(1, Math.min(20, Number(limit) || 12)))
    for (const item of memories) this.store.db.prepare('UPDATE memory_records SET use_count=use_count+1,last_used_at=? WHERE id=?').run(this.now(), item.id)
    this.store.audit({ eventType: 'memory.recalled', actor: 'agent', provider: binding?.provider, providerSessionId: binding?.providerSessionId, bindingId: binding?.id, tool: 'ambientic_recall', resultSummary: `${hits.length} result(s)` })
    return hits
  }

  searchAll ({ query, limit = 50 } = {}) {
    const memories = this.store.searchMemory(query, { limit }).map((item) => ({ ...item, type: 'memory' }))
    const episodes = this.store.searchMessages(query, { limit }).map((item) => ({
      ...item,
      scope: 'session',
      scopeId: item.providerSessionId,
      kind: 'episode',
      status: 'episodic',
      confidence: 1,
      provenance: [{ provider: item.provider, providerSessionId: item.providerSessionId, sourceType: 'turn', createdAt: item.createdAt }]
    }))
    return [...memories, ...episodes].slice(0, Math.max(1, Math.min(100, Number(limit) || 50)))
  }

  observeTurn ({ provider, providerSessionId, messages = [] } = {}) {
    if (!this.consent()) return { observed: 0, learned: 0, skipped: 'consent' }
    const binding = this.store.bindingFor(provider, providerSessionId)
    const project = binding?.projectId ? this.store.getProject(binding.projectId) : null
    const exclusions = new Set(project?.exclusions || [])
    if (exclusions.has('all') || exclusions.has('transcripts') || exclusions.has(provider) || exclusions.has(`provider:${provider}`)) {
      return { observed: 0, learned: 0, skipped: 'project_exclusion' }
    }
    let observed = 0
    let learned = 0
    for (const item of messages) {
      if (!['user', 'assistant', 'tool'].includes(item.role)) continue
      const redacted = redactSecrets(item.text ?? item.content)
      if (this.store.observeMessage({
        provider,
        providerSessionId,
        providerMessageId: item.id || createHash('sha256').update(`${item.role}:${redacted.text}`).digest('hex'),
        bindingId: binding?.id,
        role: item.role,
        content: redacted.text,
        sensitive: redacted.sensitive,
        createdAt: item.createdAt
      })) observed += 1
      if (item.role === 'user' && !redacted.sensitive) {
        const candidate = explicitMemoryFrom(redacted.text)
        if (candidate) {
          try {
            this.remember({
              content: candidate.content,
              kind: candidate.kind,
              status: candidate.explicit ? 'active' : 'candidate',
              confidence: candidate.explicit ? 1 : 0.7,
              independent: !candidate.explicit,
              expiresAt: candidate.explicit ? null : this.now() + 30 * 24 * 60 * 60 * 1000,
              provenance: { provider, providerSessionId, sourceType: 'turn', sourceId: item.id || '' },
              actor: candidate.explicit ? 'human' : 'ambientic'
            }, binding)
            learned += 1
          } catch {}
        }
      }
    }
    if (observed) this.emit('change', this.getState())
    return { observed, learned }
  }

  finalizeSession (provider, providerSessionId, messages = []) {
    const observed = this.observeTurn({ provider, providerSessionId, messages })
    return { ...observed, goalReconciliation: this.finishGoalReconciliation(provider, providerSessionId, 'session ended') }
  }

  beginGoalReconciliation (provider, providerSessionId) {
    const binding = this.store.bindingFor(provider, providerSessionId)
    if (!binding?.goalId || !binding?.taskId) return null
    const event = this.store.audit({
      eventType: 'goal.reconciliation.required',
      actor: 'ambientic',
      provider,
      providerSessionId,
      bindingId: binding.id,
      tool: 'ambientic_goals',
      resultSummary: `Closeout required for linked goal ${binding.goalId} and task ${binding.taskId}`
    })
    this.emit('change', this.getState())
    return event
  }

  confirmGoalReconciliation (binding, note = '') {
    if (!binding?.goalId || !binding?.taskId) throw new Error('This session is not linked to both a goal and a task.')
    if (!this.hasCurrentGoalRead(binding)) throw new Error('Read the latest linked goal before confirming reconciliation.')
    const summary = cleanText(note, 1000) || 'Agent checked the linked goal; no additional closeout note was supplied.'
    this.store.audit({
      eventType: 'goal.reconciliation.completed',
      actor: 'agent',
      provider: binding.provider,
      providerSessionId: binding.providerSessionId,
      bindingId: binding.id,
      tool: 'ambientic_goals',
      resultSummary: summary
    })
    this.emit('change', this.getState())
    return { reconciled: true, goalId: binding.goalId, taskId: binding.taskId, note: summary }
  }

  recordGoalRead (binding) {
    if (!binding?.goalId || !binding?.taskId) return null
    const event = this.store.audit({
      eventType: 'goal.reconciliation.checked',
      actor: 'agent',
      provider: binding.provider,
      providerSessionId: binding.providerSessionId,
      bindingId: binding.id,
      tool: 'ambientic_goals',
      resultSummary: `Read latest linked goal ${binding.goalId}`
    })
    this.emit('change', this.getState())
    return event
  }

  hasCurrentGoalRead (binding) {
    if (!binding?.goalId || !binding?.taskId) return false
    const events = this.store.listAudit({ bindingId: binding.id, limit: 200 })
    const requiredIndex = events.findIndex((event) => event.eventType === 'goal.reconciliation.required')
    const checkedIndex = events.findIndex((event) => event.eventType === 'goal.reconciliation.checked')
    return checkedIndex >= 0 && (requiredIndex < 0 || checkedIndex < requiredIndex)
  }

  finishGoalReconciliation (provider, providerSessionId, reason = 'work turn finished') {
    const binding = this.store.bindingFor(provider, providerSessionId)
    if (!binding?.goalId || !binding?.taskId) return { required: false }
    const events = this.store.listAudit({ bindingId: binding.id, limit: 200 })
    const requiredIndex = events.findIndex((event) => event.eventType === 'goal.reconciliation.required')
    if (requiredIndex < 0) return { required: false }
    const afterRequirement = events.slice(0, requiredIndex)
    if (afterRequirement.some((event) => event.eventType === 'goal.reconciliation.completed')) return { required: true, completed: true }
    if (afterRequirement.some((event) => event.eventType === 'goal.reconciliation.missing')) return { required: true, completed: false }
    this.store.audit({
      eventType: 'goal.reconciliation.missing',
      actor: 'ambientic',
      provider,
      providerSessionId,
      bindingId: binding.id,
      tool: 'ambientic_goals',
      approval: 'attention',
      resultSummary: `The ${reason} without a confirmed goal and ticket reconciliation.`
    })
    this.emit('change', this.getState())
    return { required: true, completed: false }
  }

  forget (id) {
    const result = this.store.forgetMemory(id)
    if (result) this.emit('change', this.getState())
    return result
  }

  supersede (id, input) {
    if (looksSecret(input?.content)) throw new Error('Ambientic will not save content that looks like a credential or secret.')
    const result = this.store.supersedeMemory(id, input)
    this.emit('change', this.getState())
    return result
  }

  resolveConflict (id, { action = 'keep' } = {}) {
    if (action === 'forget' || action === 'reject') return this.forget(id)
    const record = this.store.updateMemoryStatus(id, 'active')
    this.store.audit({ eventType: 'memory.conflict.resolved', actor: 'human', resultSummary: `Kept ${record.scope}/${record.kind}` })
    this.emit('change', this.getState())
    return record
  }

  getState ({ query = '' } = {}) {
    const memories = query ? this.store.searchMemory(query, { limit: 200 }) : this.store.listMemory({ limit: 200 })
    return {
      projects: this.store.listProjects(),
      memories,
      conflicts: memories.filter((item) => item.status === 'conflicted' || item.sensitive),
      recentActivity: this.store.listAudit({ limit: 100 }),
      indexing: false,
      consentRequired: !this.consent(),
      error: ''
    }
  }
}

export function createContextEngine (options) { return new ContextEngine(options) }
