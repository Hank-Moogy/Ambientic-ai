import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { privateSetupSummary, sanitizePackSetup, validateWorkflowPack } from '../shared/workflow-pack.mjs'

const VERSION = 2
const MAX_RUNS = 200
const ACTIVE_RUN_STATUSES = new Set(['queued', 'running', 'awaiting_approval', 'needs_attention'])
const EXECUTABLE_KINDS = new Set(['web', 'agent', 'inbox', 'calendar', 'tool'])
const CONSEQUENTIAL_KINDS = new Set(['inbox', 'calendar'])

function copy (value) {
  return JSON.parse(JSON.stringify(value))
}

function publicPack (pack) {
  const { privateContext, setup, ...safe } = pack
  return copy(safe)
}

function cleanText (value, max = 4000) {
  return String(value || '').replace(/\r\n/g, '\n').trim().slice(0, max)
}

function emptyState () {
  return { version: VERSION, workflows: [], runs: [], packs: [], updatedAt: null }
}

function safeTimestamp (value, fallback = null) {
  const timestamp = Number(value)
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : fallback
}

function configuredScheduleNodes (workflow, setup) {
  const schedule = workflow?.schedule
  if (!schedule?.fromSetup) return workflow.nodes
  const match = String(setup[schedule.fromSetup] || '').match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  if (!match) return workflow.nodes
  const minutesInDay = 24 * 60
  const shifted = (Number(match[1]) * 60 + Number(match[2]) + Number(schedule.offsetMinutes || 0) + minutesInDay) % minutesInDay
  const time = `${String(Math.floor(shifted / 60)).padStart(2, '0')}:${String(shifted % 60).padStart(2, '0')}`
  return workflow.nodes.map((node) => node.kind === 'schedule' ? { ...node, detail: `${cleanText(schedule.recurrence, 80) || 'Every day'} · ${time}` } : node)
}

function sanitizeNode (node, index) {
  const kind = ['schedule', 'web', 'agent', 'approval', 'inbox', 'calendar', 'tool'].includes(node?.kind) ? node.kind : 'tool'
  return {
    id: cleanText(node?.id, 120) || `step-${index + 1}-${kind}`,
    kind,
    label: cleanText(node?.label, 120) || 'Untitled step',
    detail: cleanText(node?.detail, 2000),
    action: cleanText(node?.action, 160) || `tool.${kind}`,
    x: Number.isFinite(Number(node?.x)) ? Number(node.x) : 100 + index * 30,
    y: Number.isFinite(Number(node?.y)) ? Number(node.y) : 120 + index * 24,
    provider: kind === 'agent' ? (cleanText(node?.provider, 40) || 'auto') : ''
  }
}

function sanitizeWorkflow (input, { id, createdAt, now }) {
  const nodes = (Array.isArray(input?.nodes) ? input.nodes : []).slice(0, 100).map(sanitizeNode)
  const nodeIds = new Set(nodes.map((node) => node.id))
  const edges = (Array.isArray(input?.edges) ? input.edges : [])
    .filter((edge) => nodeIds.has(edge?.from) && nodeIds.has(edge?.to))
    .slice(0, 200)
    .map((edge, index) => ({
      id: cleanText(edge.id, 180) || `edge-${index + 1}`,
      from: cleanText(edge.from, 120),
      to: cleanText(edge.to, 120)
    }))
  return {
    version: 1,
    id,
    name: cleanText(input?.name, 120) || 'Untitled workflow',
    description: cleanText(input?.description, 2000),
    packId: cleanText(input?.packId, 120),
    packRole: cleanText(input?.packRole, 80),
    nodes,
    edges,
    enabled: Boolean(input?.enabled),
    nextRunAt: safeTimestamp(input?.nextRunAt),
    createdAt,
    updatedAt: now
  }
}

function timeParts (text) {
  const match = String(text || '').match(/\b([01]?\d|2[0-3])(?::([0-5]\d))?\b/)
  return match ? { hours: Number(match[1]), minutes: Number(match[2] || 0) } : { hours: 8, minutes: 30 }
}

export function nextScheduleAt (recurrence, from = Date.now()) {
  const text = cleanText(recurrence, 200).toLocaleLowerCase()
  if (!text || text.includes('choose a recurrence') || text.includes('manual')) return null
  const { hours, minutes } = timeParts(text)
  const next = new Date(from)
  next.setSeconds(0, 0)
  next.setHours(hours, minutes, 0, 0)

  if (text.includes('month')) {
    if (next.getTime() <= from) next.setMonth(next.getMonth() + 1)
    return next.getTime()
  }
  if (text.includes('week') && !text.includes('weekday')) {
    if (next.getTime() <= from) next.setDate(next.getDate() + 7)
    return next.getTime()
  }

  if (next.getTime() <= from) next.setDate(next.getDate() + 1)
  if (text.includes('weekday')) {
    while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1)
  }
  return next.getTime()
}

export function workflowExecutionPrompt ({ workflow, node, previousOutputs = [], privateContext = '' }) {
  const context = previousOutputs
    .filter(Boolean)
    .slice(-3)
    .map((output, index) => `Previous result ${index + 1}:\n${cleanText(output, 2400)}`)
    .join('\n\n')
  const actionGuidance = CONSEQUENTIAL_KINDS.has(node.kind)
    ? 'Use the connected provider tool needed to perform this action. Do not claim success unless the tool confirms the action. If no suitable tool is connected, explain exactly which connection is missing and stop.'
    : node.kind === 'web'
        ? 'Use live web access where available and cite the sources used.'
        : node.kind === 'tool'
            ? 'Use the appropriate connected tool. Do not simulate a tool result.'
            : 'Complete this step and return a concise result for the next workflow step.'
  return [
    `You are executing the Ambientic workflow “${workflow.name}”.`,
    `Current step: ${node.label}`,
    `Instruction: ${node.detail || node.label}`,
    `Capability: ${node.action}`,
    workflow.packId === 'ambientic.career-os' ? 'Use ambientic_jobs_discover for supported public ATS and remote-job feeds, ambientic_career_read for the current private pipeline and daily queue, and ambientic_career_update to persist every normalized opportunity, market-scan total, status change, interview, or explicit pass reason instead of leaving Career OS state only in prose. Prefer canonical ATS results; retain attribution and mark unresolved aggregator links clearly.' : '',
    privateContext ? `Private local setup supplied by the user for this workflow pack:\n${cleanText(privateContext, 16000)}\n\nUse this only to complete the current workflow. Do not include private setup values in portable workflow definitions or public output.` : '',
    actionGuidance,
    context
  ].filter(Boolean).join('\n\n')
}

export class WorkflowService extends EventEmitter {
  constructor ({
    file,
    now = () => Date.now(),
    id = () => randomUUID(),
    connectors = () => [],
    executeAgentStep,
    schedule = setInterval,
    cancelSchedule = clearInterval
  }) {
    super()
    this.file = file
    this.now = now
    this.id = id
    this.connectors = connectors
    this.executeAgentStep = executeAgentStep
    this.schedule = schedule
    this.cancelSchedule = cancelSchedule
    this.timer = null
    this.state = this.load()
  }

  load () {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'))
      return {
        ...emptyState(),
        ...parsed,
        version: VERSION,
        workflows: Array.isArray(parsed.workflows) ? parsed.workflows : [],
        runs: Array.isArray(parsed.runs) ? parsed.runs.slice(-MAX_RUNS) : [],
        packs: Array.isArray(parsed.packs) ? parsed.packs : []
      }
    } catch {
      return emptyState()
    }
  }

  persist ({ emit = true } = {}) {
    this.state.updatedAt = this.now()
    mkdirSync(dirname(this.file), { recursive: true })
    const temporary = `${this.file}.tmp`
    writeFileSync(temporary, `${JSON.stringify(this.state, null, 2)}\n`, { mode: 0o600 })
    renameSync(temporary, this.file)
    if (emit) this.emit('change', this.list())
  }

  list () {
    const recentRuns = [...this.state.runs].sort((left, right) => right.createdAt - left.createdAt)
    return {
      version: this.state.version,
      workflows: copy([...this.state.workflows]
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .map((workflow) => ({
          ...workflow,
          lastRun: recentRuns.find((run) => run.workflowId === workflow.id) || null,
          runCount: recentRuns.filter((run) => run.workflowId === workflow.id).length
        }))),
      runs: copy(recentRuns.slice(0, 100)),
      packs: this.state.packs.map(publicPack),
      updatedAt: this.state.updatedAt
    }
  }

  workflow (workflowId) {
    return this.state.workflows.find((workflow) => workflow.id === workflowId)
  }

  packSetup (packId) {
    return copy(this.state.packs.find((pack) => pack.id === packId)?.setup || null)
  }

  installPack (pack, setupValues = {}) {
    validateWorkflowPack(pack)
    const setup = sanitizePackSetup(pack, setupValues)
    const now = this.now()
    const existing = this.state.packs.find((candidate) => candidate.id === pack.id)

    if (existing) {
      existing.version = cleanText(pack.version, 40)
      existing.setup = setup
      existing.privateContext = privateSetupSummary(pack, setup)
      existing.summary = Object.fromEntries((pack.setup.summaryFields || []).map((fieldId) => [fieldId, setup[fieldId]]))
      existing.updatedAt = now
      this.persist()
      return publicPack(existing)
    }

    const workflowIds = []
    for (const input of pack.workflows) {
      const edges = Array.isArray(input.edges) && input.edges.length
        ? input.edges
        : input.nodes.slice(1).map((candidate, index) => ({ id: `edge-${input.nodes[index].id}-${candidate.id}`, from: input.nodes[index].id, to: candidate.id }))
      const workflow = sanitizeWorkflow(
        { ...input, nodes: configuredScheduleNodes(input, setup), edges, packId: pack.id, packRole: input.role },
        { id: this.id(), createdAt: now, now }
      )
      const scheduleNode = workflow.nodes.find((candidate) => candidate.kind === 'schedule')
      workflow.nextRunAt = workflow.enabled ? nextScheduleAt(scheduleNode?.detail, now) : null
      this.state.workflows.push(workflow)
      workflowIds.push(workflow.id)
    }

    const installed = {
      id: cleanText(pack.id, 120),
      version: cleanText(pack.version, 40),
      name: cleanText(pack.name, 120),
      description: cleanText(pack.description, 2000),
      workflowIds,
      setup,
      privateContext: privateSetupSummary(pack, setup),
      summary: Object.fromEntries((pack.setup.summaryFields || []).map((fieldId) => [fieldId, setup[fieldId]])),
      installedAt: now,
      updatedAt: now
    }
    this.state.packs.push(installed)
    this.persist()
    return publicPack(installed)
  }

  create (input = {}) {
    const now = this.now()
    const workflow = sanitizeWorkflow({ ...input, packId: '', packRole: '' }, { id: this.id(), createdAt: now, now })
    const scheduleNode = workflow.nodes.find((node) => node.kind === 'schedule')
    workflow.nextRunAt = workflow.enabled ? nextScheduleAt(scheduleNode?.detail, now) : null
    this.state.workflows.push(workflow)
    this.persist()
    return copy(workflow)
  }

  update (workflowId, input = {}) {
    const index = this.state.workflows.findIndex((workflow) => workflow.id === workflowId)
    if (index < 0) throw new Error('Workflow not found.')
    const existing = this.state.workflows[index]
    const workflow = sanitizeWorkflow(
      { ...existing, ...input, packId: existing.packId, packRole: existing.packRole },
      { id: existing.id, createdAt: existing.createdAt, now: this.now() }
    )
    const scheduleNode = workflow.nodes.find((node) => node.kind === 'schedule')
    workflow.nextRunAt = workflow.enabled ? nextScheduleAt(scheduleNode?.detail, this.now()) : null
    this.state.workflows[index] = workflow
    this.persist()
    return copy(workflow)
  }

  duplicate (workflowId) {
    const workflow = this.workflow(workflowId)
    if (!workflow) throw new Error('Workflow not found.')
    return this.create({ ...workflow, packId: '', packRole: '', name: `${workflow.name} copy`, enabled: false })
  }

  remove (workflowId) {
    const workflow = this.workflow(workflowId)
    if (!workflow) return false
    for (const run of this.state.runs) {
      if (run.workflowId === workflowId && ACTIVE_RUN_STATUSES.has(run.status)) {
        run.status = 'cancelled'
        run.finishedAt = this.now()
      }
    }
    this.state.workflows = this.state.workflows.filter((candidate) => candidate.id !== workflowId)
    this.persist()
    return true
  }

  setEnabled (workflowId, enabled) {
    return this.update(workflowId, { enabled: Boolean(enabled) })
  }

  chooseProvider (preferred = 'auto') {
    const available = this.connectors().filter((connector) =>
      connector.installed &&
      connector.manageable !== false &&
      connector.taskCapable !== false &&
      ['codex', 'claude', 'hermes'].includes(connector.id)
    )
    if (preferred && preferred !== 'auto') return available.find((connector) => connector.id === preferred)?.id || ''
    return ['codex', 'claude', 'hermes'].find((id) => available.some((connector) => connector.id === id)) || ''
  }

  async startRun (workflowId, { source = 'manual' } = {}) {
    const workflow = this.workflow(workflowId)
    if (!workflow) throw new Error('Workflow not found.')
    const active = this.state.runs.find((run) => run.workflowId === workflowId && ACTIVE_RUN_STATUSES.has(run.status))
    if (active) return copy(active)
    const now = this.now()
    const run = {
      id: this.id(),
      workflowId,
      workflowName: workflow.name,
      source,
      status: 'queued',
      currentStepId: '',
      createdAt: now,
      startedAt: now,
      finishedAt: null,
      error: '',
      steps: workflow.nodes.map((node) => ({
        nodeId: node.id,
        kind: node.kind,
        label: node.label,
        status: 'pending',
        startedAt: null,
        finishedAt: null,
        output: '',
        error: '',
        sessionId: '',
        provider: '',
        approvedAt: null
      }))
    }
    this.state.runs.push(run)
    this.state.runs = this.state.runs.slice(-MAX_RUNS)
    workflow.lastRunAt = now
    this.persist()
    queueMicrotask(() => void this.advance(run.id))
    return copy(run)
  }

  async advance (runId) {
    const run = this.state.runs.find((candidate) => candidate.id === runId)
    const workflow = run && this.workflow(run.workflowId)
    if (!run || !workflow || !ACTIVE_RUN_STATUSES.has(run.status)) return
    const stepIndex = run.steps.findIndex((step) => step.status === 'pending')
    if (stepIndex < 0) {
      run.status = 'completed'
      run.currentStepId = ''
      run.finishedAt = this.now()
      this.persist()
      return
    }

    const step = run.steps[stepIndex]
    const node = workflow.nodes.find((candidate) => candidate.id === step.nodeId)
    if (!node) return this.failRun(run, step, new Error('A workflow step is missing.'))
    run.currentStepId = node.id
    run.status = 'running'

    if (node.kind === 'schedule') {
      step.status = 'completed'
      step.startedAt = step.finishedAt = this.now()
      step.output = run.source === 'schedule' ? 'Scheduled trigger fired.' : 'Manual run.'
      this.persist()
      return queueMicrotask(() => void this.advance(run.id))
    }

    if (node.kind === 'approval' || (CONSEQUENTIAL_KINDS.has(node.kind) && !step.approvedAt)) {
      step.status = 'awaiting_approval'
      step.startedAt ||= this.now()
      step.approvalForAction = node.kind !== 'approval'
      run.status = 'awaiting_approval'
      this.persist()
      return
    }

    if (!EXECUTABLE_KINDS.has(node.kind)) {
      return this.failRun(run, step, new Error(`Unsupported workflow step: ${node.kind}`))
    }

    const provider = this.chooseProvider(node.provider)
    if (!provider) {
      return this.failRun(run, step, new Error(node.provider && node.provider !== 'auto'
        ? `${node.provider} is not connected and available.`
        : 'Connect Codex, Claude Code, or Hermes to run this workflow.'))
    }

    step.status = 'running'
    step.startedAt ||= this.now()
    step.provider = provider
    this.persist()
    try {
      if (!this.executeAgentStep) throw new Error('Workflow agent execution is not configured.')
      const result = await this.executeAgentStep({
        workflow: copy(workflow),
        run: copy(run),
        node: copy(node),
        provider,
        prompt: workflowExecutionPrompt({
          workflow,
          node,
          previousOutputs: run.steps.slice(0, stepIndex).map((candidate) => candidate.output),
          privateContext: this.state.packs.find((pack) => pack.id === workflow.packId)?.privateContext || ''
        })
      })
      step.sessionId = cleanText(result?.sessionId, 160)
      if (result?.output && !step.sessionId) {
        step.status = 'completed'
        step.output = cleanText(result.output, 12000)
        step.finishedAt = this.now()
        this.persist()
        queueMicrotask(() => void this.advance(run.id))
      } else if (!step.sessionId) {
        throw new Error('The provider did not return a managed task.')
      } else {
        this.persist()
      }
    } catch (error) {
      this.failRun(run, step, error)
    }
  }

  approve (runId, allow) {
    const run = this.state.runs.find((candidate) => candidate.id === runId)
    if (!run || run.status !== 'awaiting_approval') return false
    const step = run.steps.find((candidate) => candidate.status === 'awaiting_approval')
    if (!step) return false
    if (!allow) {
      step.status = 'denied'
      step.error = 'Denied by user.'
      step.finishedAt = this.now()
      run.status = 'denied'
      run.finishedAt = this.now()
      this.persist()
      return true
    }
    step.approvedAt = this.now()
    if (step.approvalForAction) {
      step.status = 'pending'
    } else {
      step.status = 'completed'
      step.output = 'Approved by user.'
      step.finishedAt = this.now()
    }
    run.status = 'running'
    this.persist()
    queueMicrotask(() => void this.advance(run.id))
    return true
  }

  cancel (runId) {
    const run = this.state.runs.find((candidate) => candidate.id === runId)
    if (!run || !ACTIVE_RUN_STATUSES.has(run.status)) return false
    run.status = 'cancelled'
    run.finishedAt = this.now()
    this.persist()
    return true
  }

  handleThread (snapshot) {
    const run = this.state.runs.find((candidate) =>
      ACTIVE_RUN_STATUSES.has(candidate.status) &&
      candidate.steps.some((step) => step.status === 'running' && step.sessionId === snapshot?.id)
    )
    if (!run) return false
    const step = run.steps.find((candidate) => candidate.status === 'running' && candidate.sessionId === snapshot.id)
    if (snapshot.error) {
      this.failRun(run, step, new Error(snapshot.error))
      return true
    }
    if (snapshot.approvals?.length || snapshot.state === 'attention') {
      run.status = 'needs_attention'
      this.persist()
      return true
    }
    if (snapshot.running || snapshot.state === 'running') {
      if (run.status !== 'running') {
        run.status = 'running'
        this.persist()
      }
      return true
    }
    if (!snapshot.turnStateKnown) return false
    const output = [...(snapshot.messages || [])].reverse().find((message) => message.role === 'assistant' || message.type === 'assistant')?.content || ''
    step.status = 'completed'
    step.output = cleanText(output, 12000) || 'Provider step completed.'
    step.finishedAt = this.now()
    run.status = 'running'
    this.persist()
    queueMicrotask(() => void this.advance(run.id))
    return true
  }

  failRun (run, step, error) {
    step.status = 'failed'
    step.error = cleanText(error?.message || error, 1000)
    step.finishedAt = this.now()
    run.status = 'failed'
    run.error = step.error
    run.finishedAt = this.now()
    this.persist()
  }

  async tick (at = this.now()) {
    for (const workflow of this.state.workflows) {
      if (!workflow.enabled) continue
      const scheduleNode = workflow.nodes.find((node) => node.kind === 'schedule')
      if (!scheduleNode) continue
      if (!workflow.nextRunAt) workflow.nextRunAt = nextScheduleAt(scheduleNode.detail, at)
      if (workflow.nextRunAt && workflow.nextRunAt <= at) {
        workflow.nextRunAt = nextScheduleAt(scheduleNode.detail, at + 1000)
        this.persist()
        await this.startRun(workflow.id, { source: 'schedule' })
      }
    }
  }

  startScheduler () {
    if (this.timer) return
    void this.tick()
    this.timer = this.schedule(() => void this.tick(), 30_000)
    if (this.timer?.unref) this.timer.unref()
  }

  stopScheduler () {
    if (!this.timer) return
    this.cancelSchedule(this.timer)
    this.timer = null
  }
}

export function createWorkflowService (options) {
  return new WorkflowService(options)
}
