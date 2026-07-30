export const WORKFLOW_STORAGE_KEY = 'ambientic-workflow-draft-v2'

export const NODE_KINDS = {
  schedule: {
    eyebrow: 'Trigger',
    title: 'On a schedule',
    detail: 'Every weekday · 08:30',
    action: 'trigger.schedule',
    icon: '↻',
    tone: 'mint',
    permission: 'None'
  },
  web: {
    eyebrow: 'Research',
    title: 'Check the web',
    detail: 'Find fresh, relevant signals',
    action: 'web.search',
    icon: '⌕',
    tone: 'blue',
    permission: 'Web access'
  },
  agent: {
    eyebrow: 'Agent',
    title: 'Ask the best agent',
    detail: 'Summarize what changed',
    action: 'agent.run',
    icon: '✦',
    tone: 'violet',
    permission: 'Provider context'
  },
  approval: {
    eyebrow: 'Human',
    title: 'Let me review',
    detail: 'Pause before taking action',
    action: 'human.approval',
    icon: '◇',
    tone: 'amber',
    permission: 'User approval'
  },
  inbox: {
    eyebrow: 'Inbox',
    title: 'Send an email',
    detail: 'Use the approved result',
    action: 'inbox.send',
    icon: '↗',
    tone: 'coral',
    permission: 'Inbox · write'
  },
  calendar: {
    eyebrow: 'Calendar',
    title: 'Create an event',
    detail: 'Add time to the calendar',
    action: 'calendar.create',
    icon: '□',
    tone: 'cyan',
    permission: 'Calendar · write'
  },
  tool: {
    eyebrow: 'Tool',
    title: 'Call a tool',
    detail: 'Choose a capability',
    action: 'tool.invoke',
    icon: '⌁',
    tone: 'slate',
    permission: 'Depends on tool'
  }
}

const DEFAULT_TYPES = ['schedule', 'web', 'agent', 'approval', 'inbox']

function makeNode (kind, index, overrides = {}) {
  const definition = NODE_KINDS[kind]
  const row = Math.floor(index / 3)
  const columnInRow = index % 3
  const column = row % 2 === 0 ? columnInRow : 2 - columnInRow
  return {
    id: `step-${index + 1}-${kind}`,
    kind,
    label: definition.title,
    detail: definition.detail,
    action: definition.action,
    x: 70 + column * 282,
    y: 115 + row * 190 + (column === 1 ? 38 : 0),
    provider: kind === 'agent' ? 'auto' : '',
    ...overrides
  }
}

function connectNodes (nodes) {
  return nodes.slice(1).map((node, index) => ({
    id: `edge-${nodes[index].id}-${node.id}`,
    from: nodes[index].id,
    to: node.id
  }))
}

export function createStarterWorkflow () {
  const nodes = DEFAULT_TYPES.map((kind, index) => makeNode(kind, index))
  return {
    version: 1,
    id: 'morning-signal-brief',
    name: 'Morning signal brief',
    description: 'Find fresh signals, ask an available agent for a concise brief, then send only after review.',
    nodes,
    edges: connectNodes(nodes),
    updatedAt: new Date().toISOString()
  }
}

export function draftWorkflowFromPrompt (prompt) {
  const normalized = String(prompt || '').trim()
  const lower = normalized.toLocaleLowerCase()
  const types = ['schedule']

  if (/\b(web|website|news|research|search|browse|competitor|signal)\b/.test(lower)) types.push('web')
  if (/\b(agent|summari[sz]e|analy[sz]e|draft|write|compare|provider)\b/.test(lower) || types.length === 1) types.push('agent')
  const usesInbox = /\b(inbox|email|mail|message|reply)\b/.test(lower)
  const usesCalendar = /\b(calendar|event|meeting|schedule time|book time)\b/.test(lower)
  if (/\b(review|approve|approval|confirm|before sending|ask me)\b/.test(lower) || usesInbox || usesCalendar) types.push('approval')
  if (usesInbox) types.push('inbox')
  if (usesCalendar) types.push('calendar')
  if (/\b(tool|api|connector|integration)\b/.test(lower)) types.push('tool')

  const uniqueTypes = [...new Set(types)]
  const nodes = uniqueTypes.map((kind, index) => makeNode(kind, index, kind === 'schedule'
    ? { detail: recurrenceFromPrompt(lower) }
    : {}))

  return {
    version: 1,
    id: `draft-${slugify(normalized).slice(0, 36) || 'workflow'}`,
    name: workflowName(normalized),
    description: normalized,
    nodes,
    edges: connectNodes(nodes),
    updatedAt: new Date().toISOString()
  }
}

function recurrenceFromPrompt (prompt) {
  if (prompt.includes('weekday')) return 'Every weekday'
  if (prompt.includes('daily') || prompt.includes('every day')) return 'Every day'
  if (prompt.includes('weekly') || prompt.includes('every week')) return 'Every week'
  if (prompt.includes('monthly') || prompt.includes('every month')) return 'Every month'
  return 'Choose a recurrence'
}

function workflowName (prompt) {
  const compact = prompt
    .replace(/^(please\s+)?(every|each|on)\s+(weekday|day|week|month|morning|monday|tuesday|wednesday|thursday|friday|saturday|sunday)[,\s]*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!compact) return 'Untitled workflow'
  const name = compact.split(/\b(and then|then|after that|before)\b/i)[0].trim()
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}`.slice(0, 52)
}

function slugify (value) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function addWorkflowNode (workflow, kind, position) {
  const index = workflow.nodes.length
  const node = makeNode(kind, index, {
    id: `step-${Date.now()}-${kind}`,
    x: position?.x ?? 100 + index * 36,
    y: position?.y ?? 130 + index * 28
  })
  const previous = workflow.nodes.at(-1)
  return {
    ...workflow,
    nodes: [...workflow.nodes, node],
    edges: previous
      ? [...workflow.edges, { id: `edge-${previous.id}-${node.id}`, from: previous.id, to: node.id }]
      : workflow.edges,
    updatedAt: new Date().toISOString()
  }
}

export function removeWorkflowNode (workflow, nodeId) {
  const nodeIndex = workflow.nodes.findIndex((node) => node.id === nodeId)
  if (nodeIndex < 0) return workflow
  const previous = workflow.nodes[nodeIndex - 1]
  const next = workflow.nodes[nodeIndex + 1]
  const edges = workflow.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId)
  if (previous && next) edges.push({ id: `edge-${previous.id}-${next.id}`, from: previous.id, to: next.id })
  return {
    ...workflow,
    nodes: workflow.nodes.filter((node) => node.id !== nodeId),
    edges,
    updatedAt: new Date().toISOString()
  }
}

export function zoomViewportAtPoint (viewport, point, deltaY) {
  const scale = Math.max(0.35, Math.min(1.7, viewport.scale * Math.exp(-deltaY * 0.006)))
  const worldX = (point.x - viewport.x) / viewport.scale
  const worldY = (point.y - viewport.y) / viewport.scale
  return {
    x: point.x - worldX * scale,
    y: point.y - worldY * scale,
    scale
  }
}

export function panViewport (viewport, deltaX, deltaY) {
  return {
    ...viewport,
    x: viewport.x - deltaX,
    y: viewport.y - deltaY
  }
}

export function toPortableManifest (workflow) {
  return {
    schema: 'ambientic.workflow',
    schemaVersion: 1,
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    visibility: 'private',
    runtime: {
      providerPolicy: 'best_available',
      resumable: true
    },
    trigger: workflow.nodes.find((node) => node.kind === 'schedule')
      ? { action: 'trigger.schedule', recurrence: workflow.nodes.find((node) => node.kind === 'schedule').detail }
      : { action: 'trigger.manual' },
    steps: workflow.nodes
      .filter((node) => node.kind !== 'schedule')
      .map((node, index) => ({
        id: node.id,
        order: index + 1,
        action: node.action,
        label: node.label,
        config: {
          instruction: node.detail,
          ...(node.provider ? { providerPolicy: node.provider } : {})
        },
        provider: node.provider || undefined,
        permission: NODE_KINDS[node.kind]?.permission
      })),
    edges: workflow.edges.map(({ from, to }) => ({ from, to })),
    requirements: {
      actions: [...new Set(workflow.nodes.map((node) => node.action))],
      permissions: [...new Set(workflow.nodes.map((node) => NODE_KINDS[node.kind]?.permission).filter((permission) => permission && permission !== 'None'))]
    },
    privacy: {
      containsCredentials: false,
      containsPersonalPaths: false,
      containsTranscriptContent: false
    }
  }
}
