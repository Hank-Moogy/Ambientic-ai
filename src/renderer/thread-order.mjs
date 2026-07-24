const RECENT_PROVIDER_MS = 48 * 60 * 60 * 1000
const RECENT_INTERACTION_MS = 7 * 24 * 60 * 60 * 1000
const ACTIONABLE_STATES = new Set(['running', 'waiting', 'attention'])

export function sessionActivityAt (session, interactions = {}) {
  return Math.max(
    Number(interactions[session.id] || 0),
    Number(session.updatedAt || session.lastSeen || session.since || 0)
  )
}

export function organizeThreads (sessions, {
  interactions = {},
  now = Date.now(),
  provider = 'all',
  query = ''
} = {}) {
  const needle = query.trim().toLowerCase()
  const visible = sessions.filter((session) => {
    if (provider !== 'all' && session.agent !== provider) return false
    return !needle || `${session.task || ''} ${session.project || ''} ${session.agent || ''}`.toLowerCase().includes(needle)
  })
  const latestInteractedId = Object.entries(interactions)
    .filter(([id]) => visible.some((session) => session.id === id))
    .sort((left, right) => Number(right[1]) - Number(left[1]))[0]?.[0] || ''
  const sorted = [...visible].sort((left, right) => {
    if (left.id === latestInteractedId && right.id !== latestInteractedId) return -1
    if (right.id === latestInteractedId && left.id !== latestInteractedId) return 1
    return sessionActivityAt(right, interactions) - sessionActivityAt(left, interactions)
  })
  const recent = []
  const earlier = []
  for (const session of sorted) {
    const providerAt = Number(session.updatedAt || session.lastSeen || session.since || 0)
    const interactedAt = Number(interactions[session.id] || 0)
    const isRecent = ACTIONABLE_STATES.has(session.state) ||
      now - providerAt <= RECENT_PROVIDER_MS ||
      now - interactedAt <= RECENT_INTERACTION_MS
    ;(isRecent ? recent : earlier).push(session)
  }
  return { recent, earlier, latestInteractedId }
}
