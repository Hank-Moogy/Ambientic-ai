import { createHash } from 'node:crypto'
import { stripAmbienticContext } from './context-assembler.mjs'

const WORKLOAD = 'thread-label'
// An explicit override still wins, so a developer can pin one model without
// touching the configured route.
const MODEL_OVERRIDE = process.env.AMBIENTIC_SUMMARY_MODEL || process.env.AGENTBASE_SUMMARY_MODEL || process.env.CLAUDE_CONTROLLER_SUMMARY_MODEL || ''

function sourceText (value) {
  // Managed tasks reach here as the assembled provider prompt, which opens with
  // Ambientic's own context block. Strip that whole element first: dropping only
  // its tags would leave the preamble behind, and every task launched into the
  // same project would then be labelled from identical boilerplate.
  return stripAmbienticContext(value)
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

// "go", "ok", "continue", "yes do it" carry no signal about what the thread is
// for. Naming a thread from one of those is how a workspace fills up with
// unreadable labels, so hold the existing name and wait for a prompt that says
// something. A thread with no name yet still takes one, since an unnamed thread
// is worse than a vague one.
// Anchored at both ends on purpose: the whole message has to be filler. A
// prefix match would swallow "Please fix the terminal focus bug", which is
// exactly the kind of prompt a thread should be named after.
const LOW_SIGNAL = /^(?:go|ok(?:ay)?|yes|no|nope|sure|thanks?|thank you|hi|hey|next|continue|carry on|keep going|do it|try again|again|status|please|proceed|run it|fix it|and|\?+)[\s!.?]*$/i

export function namesThread (text, existingName = '') {
  // Named once, and it holds from there. Only an explicit user rename replaces
  // it — that path does not come through here.
  if (String(existingName || '').trim()) return false
  const value = String(text || '').trim()
  if (!value) return false
  const words = value.split(/\s+/).filter(Boolean)
  return words.length >= 2 && !LOW_SIGNAL.test(value)
}

export function humanThreadTitle (text, fallback = 'Current task') {
  const simplified = sourceText(text)
    .replace(/^(please\s+|can you\s+|could you\s+|would you\s+|i want (?:you )?to\s+|we need to\s+|let(?:'s| us)\s+)/i, '')
    .replace(/^\d+\s*[/.):~-]?\s*/, '')
  const words = simplified.match(/[\p{L}\p{N}][\p{L}\p{N}'’+_.-]*/gu) || []
  const label = words.slice(0, 4).join(' ').replace(/[.,:;!?-]+$/, '')
  if (!label) return fallback
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
    // A thread is named once, from the prompt that establishes what it is for.
    // Re-labelling on every message is what made names look random: one thread
    // became "Pick up the task", then "Go", then "What do you mean".
    if (!namesThread(text, store.taskName?.(sessionId) || '')) return

    const fingerprint = createHash('sha1').update(text).digest('hex')
    if (store.taskFingerprint(sessionId) === fingerprint) return
    if (lastBySession.get(sessionId) === fingerprint) return
    lastBySession.set(sessionId, fingerprint)

    const fallback = humanThreadTitle(text)
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
          // The user may have renamed the thread while inference was running.
          // A changed fingerprint means the original naming request no longer
          // owns the title and its late result must be discarded.
          if (store.taskFingerprint(sessionId) !== fingerprint) return
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
