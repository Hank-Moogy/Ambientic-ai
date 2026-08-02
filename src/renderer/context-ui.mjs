export function contextApi (host = globalThis.window) {
  const api = host?.ambientic || {}
  return {
    context: api.context || {},
    memory: api.memory || {},
    tools: api.tools || {},
    audit: api.audit || {}
  }
}

export function asList (value, keys = []) {
  if (Array.isArray(value)) return value
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key]
  }
  return []
}

export function contextLabel (binding = {}) {
  const project = binding.project?.name || binding.projectName || binding.project?.brief || ''
  const goal = binding.goal?.outcome || binding.goal?.title || binding.goalName || ''
  const task = binding.task?.title || binding.task?.description || binding.taskName || ''
  return [project, goal, task].filter(Boolean).join(' · ') || 'No linked context yet'
}

export function bindingInput (binding = {}) {
  return {
    projectId: binding.projectId || binding.project?.id || '',
    goalId: binding.goalId || binding.goal?.id || '',
    taskId: binding.taskId || binding.task?.id || ''
  }
}

export function memoryOrigin (record = {}) {
  if (record.origin === 'explicit' || record.explicit) return 'Explicit'
  if (record.origin === 'deterministic') return 'Observed'
  if (record.status === 'candidate') return 'Inferred candidate'
  return record.origin || 'Learned'
}

export function riskLabel (value) {
  return value === 'destructive' ? 'Destructive' : value === 'write' ? 'Changes data' : 'Read only'
}

export function formatRelativeTime (value, now = Date.now()) {
  const timestamp = typeof value === 'number' ? value : Date.parse(value || '')
  if (!Number.isFinite(timestamp)) return ''
  const minutes = Math.max(0, Math.round((now - timestamp) / 60000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`
  return `${Math.round(minutes / 1440)}d ago`
}
