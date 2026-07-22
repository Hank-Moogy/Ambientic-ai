import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = process.env.CLAUDE_CONTROLLER_SUMMARY_MODEL || 'amazon/nova-micro-v1'
const KEYCHAIN_SERVICE = 'com.findmecreators.claudecontroller.openrouter'

let keyPromise = null

function keyFromKeychain () {
  return new Promise((resolve) => {
    execFile(
      '/usr/bin/security',
      ['find-generic-password', '-w', '-s', KEYCHAIN_SERVICE],
      { timeout: 3000 },
      (err, stdout) => resolve(err ? '' : String(stdout || '').trim())
    )
  })
}

function openRouterKey () {
  if (!keyPromise) {
    keyPromise = Promise.resolve(process.env.OPENROUTER_API_KEY || '').then(
      (key) => key.trim() || keyFromKeychain()
    )
  }
  return keyPromise
}

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

async function remoteLabel (text, fallback) {
  const key = await openRouterKey()
  if (!key) return fallback

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      'x-title': 'Claude Controller'
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      max_tokens: 18,
      messages: [
        {
          role: 'system',
          content: 'Name the coding task in 2 to 5 concrete words. Return only the label, no punctuation, quotes, or explanation. Prefer an action plus object, for example: Fix terminal focus, Add voice option, Audit payment flow.'
        },
        { role: 'user', content: sourceText(text) }
      ]
    }),
    signal: AbortSignal.timeout(8000)
  })

  if (!response.ok) throw new Error(`OpenRouter ${response.status}`)
  const payload = await response.json()
  return tidyLabel(payload?.choices?.[0]?.message?.content, fallback)
}

export function createTaskSummarizer (store) {
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

    queue = queue
      .catch(() => {})
      .then(async () => {
        try {
          const label = await remoteLabel(text, fallback)
          cache.set(fingerprint, label)
          store.updateTask(sessionId, label, fingerprint, 'model')
          console.log(`[summary] ${MODEL} -> "${label}"`)
        } catch (error) {
          console.warn(`[summary] using local label: ${error.message}`)
        }
      })
  }

  return { enqueue, model: MODEL }
}
