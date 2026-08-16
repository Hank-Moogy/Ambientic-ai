import { createHash } from 'node:crypto'

const WORKLOAD = 'thread-label'
// An explicit override still wins, so a developer can pin one model without
// touching the configured route.
const MODEL_OVERRIDE = process.env.AMBIENTIC_SUMMARY_MODEL || process.env.AGENTBASE_SUMMARY_MODEL || process.env.CLAUDE_CONTROLLER_SUMMARY_MODEL || ''

function sourceText (value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000)
}

function tidyLabel (value, fallback) {
  const clean = String(value || '')
    .replace(/^[\s"'`*#-]+|[\s"'`*#.,:;!?-]+$/g, '')
    .replace(/^(task|summary|title)\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!clean) return fallback
  const words = clean.split(' ').slice(0, 5)
  let label = words.join(' ')
  if (label.length > 42) label = label.slice(0, 42).replace(/\s+\S*$/, '')
  return label || fallback
}

function localLabel (text) {
  const simplified = sourceText(text)
    .replace(/^(please\s+|can you\s+|could you\s+|would you\s+|i want (?:you )?to\s+|we need to\s+|let(?:'s| us)\s+)/i, '')
    .replace(/^\d+\s*[/.):~-]?\s*/, '')
  const words = simplified.match(/[\p{L}\p{N}][\p{L}\p{N}'’+_.-]*/gu) || []
  const label = words.slice(0, 4).join(' ')
  if (!label) return 'Current task'
  return label.charAt(0).toUpperCase() + label.slice(1)
}

async function remoteLabel (inference, text, fallback) {
  const result = await inference.complete({
    workload: WORKLOAD,
    temperature: 0,
    maxTokens: 18,
    timeout: 8000,
    model: MODEL_OVERRIDE || undefined,
    messages: [
      {
        role: 'system',
        content: 'Name the coding task in 2 to 5 concrete words. Return only the label, no punctuation, quotes, or explanation. Prefer an action plus object, for example: Fix terminal focus, Add voice option, Audit payment flow.'
      },
      { role: 'user', content: sourceText(text) }
    ]
  })
  return { label: tidyLabel(result.text, fallback), model: `${result.provider}/${result.model}` }
}

export function createTaskSummarizer (store, { inference = null } = {}) {
  const lastBySession = new Map()
  const cache = new Map()
  let queue = Promise.resolve()

  function enqueue (sessionId, rawText) {
    const text = sourceText(rawText)
    if (!sessionId || !text) return

    const fingerprint = createHash('sha1').update(text).digest('hex')
    if (store.taskFingerprint(sessionId) === fingerprint) return
    if (lastBySession.get(sessionId) === fingerprint) return
    lastBySession.set(sessionId, fingerprint)

    const fallback = localLabel(text)
    store.updateTask(sessionId, fallback, fingerprint, 'local')

    if (cache.has(fingerprint)) {
      store.updateTask(sessionId, cache.get(fingerprint), fingerprint, 'model')
      return
    }

    if (!inference) return

    queue = queue
      .catch(() => {})
      .then(async () => {
        try {
          const { label, model } = await remoteLabel(inference, text, fallback)
          cache.set(fingerprint, label)
          store.updateTask(sessionId, label, fingerprint, 'model')
          console.log(`[summary] ${model} -> "${label}"`)
        } catch (error) {
          console.warn(`[summary] using local label: ${error.message}`)
        }
      })
  }

  return { enqueue, workload: WORKLOAD }
}
