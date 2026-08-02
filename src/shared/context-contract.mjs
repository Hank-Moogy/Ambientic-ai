export const CONTEXT_SCOPES = Object.freeze(['user', 'project', 'goal', 'task', 'session'])
export const MEMORY_KINDS = Object.freeze(['preference', 'constraint', 'fact', 'decision', 'outcome', 'gotcha'])
export const MEMORY_STATUSES = Object.freeze(['candidate', 'active', 'conflicted', 'superseded'])

export const CAPSULE_TARGET_TOKENS = 900
export const CAPSULE_MAX_TOKENS = 1200

export const AMBIENTIC_TOOL_SCHEMAS = Object.freeze([
  {
    name: 'ambientic_context_get',
    description: 'Read the Ambientic project, goal, task, and frozen context bound to this agent session.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'ambientic_recall',
    description: 'Search relevant Ambientic memories and consented session history without loading all history into the prompt.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 500 },
        scope: { type: 'string', enum: CONTEXT_SCOPES },
        limit: { type: 'integer', minimum: 1, maximum: 20 }
      },
      required: ['query'],
      additionalProperties: false
    }
  },
  {
    name: 'ambientic_remember',
    description: 'Store an explicit durable fact, preference, constraint, decision, outcome, or gotcha in Ambientic.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', minLength: 1, maxLength: 2000 },
        kind: { type: 'string', enum: MEMORY_KINDS },
        scope: { type: 'string', enum: CONTEXT_SCOPES }
      },
      required: ['content'],
      additionalProperties: false
    }
  },
  {
    name: 'ambientic_goals',
    description: 'List Ambientic goals, read one goal and its tasks, or confirm that the linked goal was reconciled at the end of a work turn.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'get', 'reconcile'] },
        goalId: { type: 'string', maxLength: 120 },
        note: { type: 'string', maxLength: 1000 }
      },
      required: ['action'],
      additionalProperties: false
    }
  },
  {
    name: 'ambientic_task_update',
    description: 'Request an audited update to an Ambientic goal task.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', minLength: 1, maxLength: 120 },
        status: { type: 'string', enum: ['backlog', 'ready', 'in_progress', 'blocked', 'review', 'done'] },
        ownerName: { type: 'string', maxLength: 80 },
        note: { type: 'string', maxLength: 1000 },
        idempotencyKey: { type: 'string', maxLength: 160 }
      },
      required: ['taskId'],
      additionalProperties: false
    }
  },
  {
    name: 'ambientic_capability',
    description: 'Search connected tool capabilities or invoke one through Ambientic permissions and audit.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['search', 'invoke'] },
        query: { type: 'string', maxLength: 500 },
        capabilityId: { type: 'string', maxLength: 160 },
        arguments: { type: 'object' },
        idempotencyKey: { type: 'string', maxLength: 160 }
      },
      required: ['action'],
      additionalProperties: false
    }
  }
])

export function emptyContextState () {
  return {
    projects: [],
    memories: [],
    conflicts: [],
    recentActivity: [],
    indexing: false,
    consentRequired: false,
    error: ''
  }
}

export function emptyToolsState () {
  return { connections: [], capabilities: [], error: '' }
}
