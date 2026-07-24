import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Claude Code does NOT expose subscription rate-limit windows (the 5-hour /
// weekly "% used" that /usage shows) to any local, non-interactive surface:
// `claude -p` results carry no rate limits, and the status-line payload has no
// `rate_limits` field (its keys are context_window, cost, cwd,
// exceeds_200k_tokens, model, output_style, session_id, transcript_path,
// version, workspace). The only place local usage is available is Claude's own
// stats cache, which records real message/session/token activity per day. This
// module reads that cache so AgentBase can show honest Claude *activity* instead
// of a quota meter it cannot obtain.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export function claudeStatsCachePath (home = homedir()) {
  return join(home, '.claude', 'stats-cache.json')
}

function dayTime (date) {
  const value = Date.parse(`${date}T00:00:00`)
  return Number.isFinite(value) ? value : NaN
}

// Normalize Claude's stats-cache JSON into a windowed activity summary. Pure
// function so it is trivially testable; `now` is injectable.
export function parseClaudeActivity (raw, now = Date.now()) {
  const cache = typeof raw === 'string' ? JSON.parse(raw) : (raw || {})
  const since = now - WEEK_MS
  const inWindow = (date) => {
    const time = dayTime(date)
    return Number.isFinite(time) && time >= since
  }

  const days = Array.isArray(cache.dailyActivity) ? cache.dailyActivity : []
  const tokenDays = Array.isArray(cache.dailyModelTokens) ? cache.dailyModelTokens : []

  let messages = 0
  let sessions = 0
  let toolCalls = 0
  for (const day of days) {
    if (!inWindow(day?.date)) continue
    messages += Number(day.messageCount) || 0
    sessions += Number(day.sessionCount) || 0
    toolCalls += Number(day.toolCallCount) || 0
  }

  const byModel = {}
  let tokens = 0
  for (const day of tokenDays) {
    if (!inWindow(day?.date)) continue
    for (const [model, value] of Object.entries(day.tokensByModel || {})) {
      const amount = Number(value) || 0
      byModel[model] = (byModel[model] || 0) + amount
      tokens += amount
    }
  }

  return {
    available: days.length > 0 || tokenDays.length > 0,
    period: 'week',
    lastComputedDate: cache.lastComputedDate || null,
    weekly: { messages, sessions, toolCalls, tokens, byModel }
  }
}

// Read and summarize Claude's local usage activity for the last 7 days. Returns
// { available: false } when the stats cache does not exist yet (fresh install
// or Claude never run) rather than throwing.
export async function collectClaudeActivity (path = claudeStatsCachePath(), now = Date.now()) {
  let raw
  try {
    raw = await readFile(path, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return { available: false, reason: 'Claude has not recorded local usage yet.' }
    throw error
  }
  return parseClaudeActivity(raw, now)
}
