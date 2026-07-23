export const APC40_ACTIONS = [
  { id: 'focus-next-attention', label: 'Next agent needing attention' },
  { id: 'focus-next', label: 'Next agent' },
  { id: 'focus-previous', label: 'Previous agent' },
  { id: 'focus-selected', label: 'Focus selected agent' },
  { id: 'acknowledge-selected', label: 'Mark selected as seen' },
  { id: 'capture-selected', label: 'Capture selected preview' },
  { id: 'launch-claude', label: 'Open new Claude Code terminal' },
  { id: 'launch-codex', label: 'Open new Codex terminal' },
  { id: 'launch-hermes', label: 'Open new Hermes terminal' },
  { id: 'toggle-controller', label: 'Show or hide AgentBase' }
]

const ACTION_IDS = new Set(APC40_ACTIONS.map((action) => action.id))

export function midiControlForMessage (message) {
  if (!Array.isArray(message) || message.length < 3) return null
  const [status, number, value] = message.map(Number)
  const type = status & 0xF0
  const channel = status & 0x0F
  if (!Number.isInteger(number) || number < 0 || number > 127) return null
  if (type === 0x90 && value > 0) return { key: `note:${channel}:${number}`, type: 'note', channel: channel + 1, number }
  if (type === 0xB0) return { key: `cc:${channel}:${number}`, type: 'cc', channel: channel + 1, number, value }
  return null
}

export function normalizeMappings (mappings = {}) {
  const result = {}
  if (!mappings || typeof mappings !== 'object' || Array.isArray(mappings)) return result
  for (const [key, action] of Object.entries(mappings)) {
    if (/^(?:note|cc):\d{1,2}:\d{1,3}$/.test(key) && ACTION_IDS.has(action)) result[key] = action
  }
  return result
}

export function bindingLabel (key) {
  const [type, channel, number] = String(key || '').split(':')
  if (!['note', 'cc'].includes(type)) return ''
  return `${type === 'note' ? 'Note' : 'CC'} ${number} · Ch ${Number(channel) + 1}`
}
