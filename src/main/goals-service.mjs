import { EventEmitter } from 'node:events'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname } from 'node:path'

const VERSION = 1
const GOAL_STATUSES = new Set(['draft', 'active', 'paused', 'achieved', 'abandoned'])
const TASK_STATUSES = new Set(['backlog', 'ready', 'in_progress', 'blocked', 'review', 'done'])
const OWNER_TYPES = new Set(['human', 'agent', 'mixed'])
const MAX_EVENTS = 1000

function cleanText (value, max = 4000) {
  return String(value || '').replace(/\r\n/g, '\n').trim().slice(0, max)
}

function cleanDate (value) {
  const date = cleanText(value, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ''
}

function cleanId (value) {
  return cleanText(value, 120).replace(/[^a-zA-Z0-9._:-]/g, '')
}

function emptyState () {
  return { version: VERSION, goals: [], tasks: [], events: [], updatedAt: null }
}

function copy (value) {
  return JSON.parse(JSON.stringify(value))
}

function taskSummary (tasks) {
  const total = tasks.length
  const done = tasks.filter((task) => task.status === 'done').length
  const blocked = tasks.filter((task) => task.status === 'blocked').length
  const active = tasks.filter((task) => ['ready', 'in_progress', 'review'].includes(task.status)).length
  return {
    total,
    done,
    blocked,
    active,
    progress: total ? Math.round((done / total) * 100) : 0
  }
}

export class GoalsService extends EventEmitter {
  constructor ({ file, now = () => Date.now(), id = () => randomUUID() }) {
    super()
    this.file = file
    this.now = now
    this.id = id
    this.state = this.load()
  }

  load () {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'))
      return {
        ...emptyState(),
        ...parsed,
        goals: Array.isArray(parsed.goals) ? parsed.goals : [],
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        events: Array.isArray(parsed.events) ? parsed.events.slice(-MAX_EVENTS) : []
      }
    } catch {
      return emptyState()
    }
  }

  persist () {
    mkdirSync(dirname(this.file), { recursive: true })
    const temporary = `${this.file}.tmp`
    writeFileSync(temporary, `${JSON.stringify(this.state, null, 2)}\n`, { mode: 0o600 })
    renameSync(temporary, this.file)
  }

  record (entityType, entityId, action, changes = {}) {
    const at = this.now()
    this.state.events = [...this.state.events, {
      id: this.id(),
      at,
      actor: 'human',
      source: 'ambientic',
      entityType,
      entityId,
      action,
      changes
    }].slice(-MAX_EVENTS)
    this.state.updatedAt = at
    this.persist()
    const snapshot = this.list()
    this.emit('change', snapshot)
    return snapshot
  }

  list () {
    const goals = this.state.goals
      .map((goal) => {
        const tasks = this.state.tasks
          .filter((task) => task.goalId === goal.id)
          .sort((left, right) => (left.order || 0) - (right.order || 0) || right.updatedAt - left.updatedAt)
        return { ...goal, tasks: copy(tasks), summary: taskSummary(tasks) }
      })
      .sort((left, right) => {
        const statusRank = { active: 0, draft: 1, paused: 2, achieved: 3, abandoned: 4 }
        return (statusRank[left.status] ?? 5) - (statusRank[right.status] ?? 5) || right.updatedAt - left.updatedAt
      })
    return {
      version: this.state.version,
      goals: copy(goals),
      events: copy(this.state.events.slice(-100).reverse()),
      updatedAt: this.state.updatedAt
    }
  }

  createGoal (input = {}) {
    const title = cleanText(input.title, 100)
    if (!title) throw new Error('Give this goal a name.')
    const now = this.now()
    const goal = {
      id: this.id(),
      projectId: cleanId(input.projectId),
      title,
      outcome: cleanText(input.outcome, 600),
      why: cleanText(input.why, 1000),
      successCriteria: cleanText(input.successCriteria, 1200),
      status: GOAL_STATUSES.has(input.status) ? input.status : 'active',
      priority: ['low', 'normal', 'high'].includes(input.priority) ? input.priority : 'normal',
      targetDate: cleanDate(input.targetDate),
      createdAt: now,
      updatedAt: now
    }
    this.state.goals.push(goal)
    this.record('goal', goal.id, 'created', { title: goal.title })
    return copy(goal)
  }

  updateGoal (goalId, patch = {}) {
    const goal = this.state.goals.find((candidate) => candidate.id === goalId)
    if (!goal) throw new Error('Goal not found.')
    const allowed = {}
    if ('title' in patch) {
      allowed.title = cleanText(patch.title, 100)
      if (!allowed.title) throw new Error('A goal needs a name.')
    }
    if ('outcome' in patch) allowed.outcome = cleanText(patch.outcome, 600)
    if ('why' in patch) allowed.why = cleanText(patch.why, 1000)
    if ('successCriteria' in patch) allowed.successCriteria = cleanText(patch.successCriteria, 1200)
    if ('status' in patch && GOAL_STATUSES.has(patch.status)) allowed.status = patch.status
    if ('priority' in patch && ['low', 'normal', 'high'].includes(patch.priority)) allowed.priority = patch.priority
    if ('targetDate' in patch) allowed.targetDate = cleanDate(patch.targetDate)
    if ('projectId' in patch) allowed.projectId = cleanId(patch.projectId)
    Object.assign(goal, allowed, { updatedAt: this.now() })
    this.record('goal', goal.id, 'updated', allowed)
    return copy(goal)
  }

  createTask (goalId, input = {}) {
    const goal = this.state.goals.find((candidate) => candidate.id === goalId)
    if (!goal) throw new Error('Goal not found.')
    const title = cleanText(input.title, 140)
    if (!title) throw new Error('Give this task a name.')
    const now = this.now()
    const siblings = this.state.tasks.filter((task) => task.goalId === goalId && task.status === (input.status || 'backlog'))
    const task = {
      id: this.id(),
      goalId,
      projectId: cleanId(input.projectId) || goal.projectId || '',
      title,
      description: cleanText(input.description, 1600),
      milestone: cleanText(input.milestone, 120),
      acceptanceCriteria: cleanText(input.acceptanceCriteria, 1200),
      status: TASK_STATUSES.has(input.status) ? input.status : 'backlog',
      ownerType: OWNER_TYPES.has(input.ownerType) ? input.ownerType : 'human',
      ownerName: cleanText(input.ownerName, 80),
      order: siblings.length,
      createdAt: now,
      updatedAt: now
    }
    this.state.tasks.push(task)
    goal.updatedAt = now
    this.record('task', task.id, 'created', { goalId, title: task.title, status: task.status })
    return copy(task)
  }

  updateTask (taskId, patch = {}) {
    const task = this.state.tasks.find((candidate) => candidate.id === taskId)
    if (!task) throw new Error('Task not found.')
    const goal = this.state.goals.find((candidate) => candidate.id === task.goalId)
    const allowed = {}
    if ('title' in patch) {
      allowed.title = cleanText(patch.title, 140)
      if (!allowed.title) throw new Error('A task needs a name.')
    }
    if ('description' in patch) allowed.description = cleanText(patch.description, 1600)
    if ('milestone' in patch) allowed.milestone = cleanText(patch.milestone, 120)
    if ('acceptanceCriteria' in patch) allowed.acceptanceCriteria = cleanText(patch.acceptanceCriteria, 1200)
    if ('status' in patch && TASK_STATUSES.has(patch.status)) {
      allowed.status = patch.status
      allowed.order = this.state.tasks.filter((candidate) => candidate.goalId === task.goalId && candidate.status === patch.status && candidate.id !== task.id).length
    }
    if ('ownerType' in patch && OWNER_TYPES.has(patch.ownerType)) allowed.ownerType = patch.ownerType
    if ('ownerName' in patch) allowed.ownerName = cleanText(patch.ownerName, 80)
    if ('projectId' in patch) allowed.projectId = cleanId(patch.projectId)
    Object.assign(task, allowed, { updatedAt: this.now() })
    if (goal) goal.updatedAt = task.updatedAt
    this.record('task', task.id, 'updated', allowed)
    return copy(task)
  }
}

export function createGoalsService (options) {
  return new GoalsService(options)
}
