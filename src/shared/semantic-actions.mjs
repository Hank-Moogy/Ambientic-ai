export const SEMANTIC_ACTION_SCHEMA = 'ambientic.semantic-action'
export const SEMANTIC_ACTION_VERSION = 1

export const SEMANTIC_ACTIONS = [
  { id: 'hardware.view.open', label: 'Open view', category: 'navigation', target: 'view', permission: 'none', feedback: 'violet' },
  { id: 'hardware.view.back', label: 'Previous view', category: 'navigation', target: 'none', permission: 'none', feedback: 'violet' },
  { id: 'hardware.view.home', label: 'Home view', category: 'navigation', target: 'none', permission: 'none', feedback: 'violet' },
  { id: 'thread.open', label: 'Open thread', category: 'threads', target: 'thread', permission: 'none', feedback: 'target-state' },
  { id: 'thread.open-latest-provider', label: 'Open latest provider thread', category: 'providers', target: 'provider', permission: 'none', feedback: 'target-state' },
  { id: 'thread.open-next-attention', label: 'Open next thread needing input', category: 'threads', target: 'none', permission: 'none', feedback: 'attention' },
  { id: 'thread.send-prompt', label: 'Send saved prompt', category: 'turns', target: 'thread', permission: 'confirm', feedback: 'target-state', inputs: ['prompt'] },
  { id: 'thread.interrupt', label: 'Interrupt turn', category: 'turns', target: 'thread', permission: 'confirm', feedback: 'attention' },
  { id: 'thread.approve-pending', label: 'Approve pending request', category: 'turns', target: 'thread', permission: 'confirm', feedback: 'green' },
  { id: 'thread.deny-pending', label: 'Deny pending request', category: 'turns', target: 'thread', permission: 'confirm', feedback: 'red' },
  { id: 'provider.start-thread', label: 'Start provider task', category: 'providers', target: 'provider', permission: 'confirm', feedback: 'cyan', inputs: ['prompt'] },
  { id: 'goal.open', label: 'Open goal', category: 'goals', target: 'goal', permission: 'none', feedback: 'cyan' },
  { id: 'workflow.open', label: 'Open workflow', category: 'workflows', target: 'workflow', permission: 'none', feedback: 'cyan' },
  { id: 'workflow.run', label: 'Run workflow', category: 'workflows', target: 'workflow', permission: 'confirm', feedback: 'green' },
  { id: 'skill.start-thread', label: 'Start task with skill', category: 'skills', target: 'skill', permission: 'confirm', feedback: 'cyan', inputs: ['provider', 'prompt'] },
  { id: 'ambientic.overview', label: 'Open Overview', category: 'ambientic', target: 'none', permission: 'none', feedback: 'blue' },
  { id: 'ambientic.hardware', label: 'Open Hardware', category: 'ambientic', target: 'none', permission: 'none', feedback: 'violet' },
  { id: 'ambientic.toggle-window', label: 'Show or hide Ambientic', category: 'ambientic', target: 'none', permission: 'none', feedback: 'blue' },
  { id: 'ambientic.vibe', label: 'Play Vibe', category: 'ambientic', target: 'none', permission: 'none', feedback: 'cyan' },
  { id: 'session.focus-next', label: 'Next agent', category: 'threads', target: 'none', permission: 'none', feedback: 'target-state' },
  { id: 'session.focus-previous', label: 'Previous agent', category: 'threads', target: 'none', permission: 'none', feedback: 'target-state' },
  { id: 'session.capture-selected', label: 'Capture selected preview', category: 'threads', target: 'none', permission: 'none', feedback: 'cyan' }
]

const ACTIONS_BY_ID = new Map(SEMANTIC_ACTIONS.map((action) => [action.id, action]))

export function semanticAction (id) {
  return ACTIONS_BY_ID.get(String(id || '')) || null
}

export function normalizeActionAssignment (input = {}) {
  const definition = semanticAction(input.actionId)
  if (!definition) return null
  const targetId = String(input.targetId || '').trim().slice(0, 512)
  const prompt = String(input.prompt || '').trim().slice(0, 4000)
  const missingTarget = definition.target !== 'none' && !targetId
  const missingRequiredPrompt = definition.id === 'thread.send-prompt' && !prompt
  return {
    schema: SEMANTIC_ACTION_SCHEMA,
    version: SEMANTIC_ACTION_VERSION,
    actionId: definition.id,
    label: String(input.label || definition.label).replace(/\s+/g, ' ').trim().slice(0, 80),
    targetId,
    targetLabel: String(input.targetLabel || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    prompt,
    provider: String(input.provider || '').trim().slice(0, 40),
    trigger: ['press', 'release', 'hold', 'value'].includes(input.trigger) ? input.trigger : 'press',
    feedback: String(input.feedback || definition.feedback || 'cyan').slice(0, 24),
    needsSetup: Boolean(input.needsSetup || missingTarget || missingRequiredPrompt)
  }
}
