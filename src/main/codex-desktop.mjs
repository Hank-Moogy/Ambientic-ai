import { execFile } from 'node:child_process'
import { open, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { humanThreadTitle } from './summarizer.js'

const MAX_DESKTOP_THREADS = 8
const ACTIVE_LOOKBACK_DAYS = 7
const ROLLOUT_TAIL_BYTES = 256 * 1024
const RECENT_COMPLETION_MS = 15 * 60 * 1000

function run (file, args, timeout = 4000) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error)
      else resolve(String(stdout || ''))
    })
  })
}

async function tailFile (path, bytes = ROLLOUT_TAIL_BYTES) {
  if (!path) return ''
  let handle
  try {
    const info = await stat(path)
    const size = Math.min(info.size, bytes)
    const buffer = Buffer.alloc(size)
    handle = await open(path, 'r')
    await handle.read(buffer, 0, size, Math.max(0, info.size - size))
    const text = buffer.toString('utf8')
    return info.size > size ? text.slice(text.indexOf('\n') + 1) : text
  } catch {
    return ''
  } finally {
    await handle?.close().catch(() => {})
  }
}

export function codexDesktopState (rolloutText, now = Date.now(), activityMs = 0) {
  let startedAt = 0
  let completedAt = 0
  let approvalAt = 0

  for (const line of String(rolloutText || '').split('\n')) {
    if (!line.trim()) continue
    try {
      const event = JSON.parse(line)
      const type = event?.payload?.type
      const timestamp = Date.parse(event?.timestamp || '') || 0
      if (type === 'task_started') startedAt = Math.max(startedAt, timestamp)
      if (type === 'task_complete') completedAt = Math.max(completedAt, timestamp)
      if (/approval_request|request_approval/i.test(String(type || ''))) approvalAt = Math.max(approvalAt, timestamp)
    } catch {}
  }

  if (approvalAt > completedAt && approvalAt >= startedAt) return 'attention'
  // A long active turn can push its task_started event beyond the bounded tail
  // read. The Codex index is updated continuously, so newer recent activity is
  // a safe fallback that still avoids reading multi-megabyte rollouts every 5s.
  const lastLifecycleAt = Math.max(startedAt, completedAt)
  if (activityMs > lastLifecycleAt + 2000 && now - activityMs < 60 * 1000) return 'running'
  if (startedAt > completedAt) return 'running'
  if (completedAt && now - completedAt <= RECENT_COMPLETION_MS) return 'waiting'
  return 'idle'
}

export function parseCodexDesktopRows (text) {
  let rows
  try {
    rows = JSON.parse(String(text || '[]'))
  } catch {
    return []
  }
  if (!Array.isArray(rows)) return []

  return rows.filter((row) => row?.id).map((row) => ({
    id: `codex-desktop:${row.id}`,
    threadId: String(row.id),
    agent: 'codex',
    project: basename(String(row.cwd || '')) || 'Codex',
    cwd: String(row.cwd || ''),
    task: humanThreadTitle(row.title, '') || humanThreadTitle(row.preview, '') || 'Codex task',
    summary: String(row.preview || '').replace(/\s+/g, ' ').trim().slice(0, 200),
    rolloutPath: String(row.rollout_path || ''),
    updatedAt: Number(row.activity_ms) || 0,
    deepLink: `codex://threads/${encodeURIComponent(String(row.id))}`,
    term_program: 'codex-desktop',
    term_app: 'codex-desktop'
  }))
}

export async function discoverCodexDesktopSessions ({ now = Date.now() } = {}) {
  const database = join(homedir(), '.codex', 'state_5.sqlite')
  const cutoff = now - ACTIVE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  const query = `
    SELECT id, rollout_path, cwd, title, preview,
      MAX(COALESCE(updated_at_ms, 0), COALESCE(recency_at_ms, 0), COALESCE(updated_at, 0) * 1000) AS activity_ms
    FROM threads
    WHERE archived = 0
      AND source = 'vscode'
      AND COALESCE(thread_source, 'user') = 'user'
      AND MAX(COALESCE(updated_at_ms, 0), COALESCE(recency_at_ms, 0), COALESCE(updated_at, 0) * 1000) >= ${Math.floor(cutoff)}
    ORDER BY activity_ms DESC
    LIMIT ${MAX_DESKTOP_THREADS};
  `

  const rows = parseCodexDesktopRows(await run('/usr/bin/sqlite3', ['-readonly', '-json', database, query]))
  return Promise.all(rows.map(async (session) => ({
    ...session,
    state: codexDesktopState(await tailFile(session.rolloutPath), now, session.updatedAt)
  })))
}
