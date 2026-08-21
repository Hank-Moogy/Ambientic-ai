const MAX_TEXT = 12000

function cleanText (value, max = MAX_TEXT) {
  return String(value || '').replace(/\r\n/g, '\n').trim().slice(0, max)
}

function copy (value) {
  return JSON.parse(JSON.stringify(value))
}

export function validateWorkflowPack (input) {
  if (!input || input.schema !== 'ambientic.workflow-pack') throw new Error('This is not an Ambientic workflow pack.')
  if (Number(input.schemaVersion) !== 1) throw new Error('This workflow pack version is not supported.')
  if (!cleanText(input.id, 120) || !cleanText(input.name, 120)) throw new Error('The workflow pack is missing its identity.')
  if (!Array.isArray(input.workflows) || !input.workflows.length) throw new Error('The workflow pack contains no workflows.')
  if (!Array.isArray(input.setup?.stages) || !input.setup.stages.length) throw new Error('The workflow pack contains no setup schema.')

  const workflowIds = new Set()
  for (const workflow of input.workflows) {
    const id = cleanText(workflow?.id, 120)
    if (!id || workflowIds.has(id)) throw new Error('The workflow pack has an invalid workflow identity.')
    workflowIds.add(id)
    if (!Array.isArray(workflow.nodes) || !workflow.nodes.length) throw new Error(`“${workflow.name || id}” has no steps.`)
  }
  return true
}

export function setupFields (pack) {
  validateWorkflowPack(pack)
  return pack.setup.stages.flatMap((stage) => stage.fields || [])
}

function sanitizeFieldValue (field, value) {
  if (field.type === 'multi-select') {
    const allowed = new Set((field.options || []).map((option) => String(option.value)))
    return [...new Set((Array.isArray(value) ? value : []).map(String).filter((item) => allowed.has(item)))].slice(0, 30)
  }
  if (field.type === 'select') {
    const allowed = new Set((field.options || []).map((option) => String(option.value)))
    const selected = String(value || field.defaultValue || '')
    return allowed.has(selected) ? selected : ''
  }
  if (field.type === 'number') {
    const number = Number(value)
    if (!Number.isFinite(number)) return field.defaultValue ?? null
    return Math.max(Number(field.min ?? number), Math.min(Number(field.max ?? number), number))
  }
  if (field.type === 'time') {
    const selected = String(value || field.defaultValue || '')
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(selected) ? selected : ''
  }
  return cleanText(value, ['textarea', 'memory-import'].includes(field.type) ? MAX_TEXT : 1000)
}

export function sanitizePackSetup (pack, values = {}, { requireComplete = true } = {}) {
  const result = {}
  const missing = []
  for (const field of setupFields(pack)) {
    const value = sanitizeFieldValue(field, values[field.id])
    result[field.id] = value
    if (requireComplete && field.required && (Array.isArray(value) ? !value.length : value === '' || value == null)) missing.push(field.label)
  }
  if (missing.length) throw new Error(`Complete the required setup: ${missing.join(', ')}.`)
  return result
}

export function privateSetupSummary (pack, values) {
  const clean = sanitizePackSetup(pack, values, { requireComplete: false })
  return setupFields(pack)
    .map((field) => {
      const value = clean[field.id]
      if (value === '' || value == null || (Array.isArray(value) && !value.length)) return ''
      const labels = new Map((field.options || []).map((option) => [String(option.value), option.label]))
      const display = (Array.isArray(value) ? value.map((item) => labels.get(String(item)) || item).join(', ') : labels.get(String(value)) || value).slice(0, field.type === 'textarea' ? 4000 : 1000)
      return `${field.label}: ${display}`
    })
    .filter(Boolean)
    .join('\n')
    .slice(0, 16000)
}

export function portableWorkflowPack (pack) {
  validateWorkflowPack(pack)
  const portable = copy(pack)
  delete portable.privateState
  delete portable.setupValues
  delete portable.installedAt
  if (portable.setup) delete portable.setup.values
  return portable
}
