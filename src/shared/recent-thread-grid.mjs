// Two columns per provider, newest first within each pair (top to bottom).
export const PAD_PROVIDERS = ['claude', 'codex', 'hermes', 'kimi']
export function recentThreadGrid (sessions = [], padCount = 40) {
  const grid = Array.from({ length: Math.max(0, padCount) }, () => null)
  const seen = new Set()
  const threads = sessions.filter((session) => {
    if (!session?.id || session.discovered || session.archived || seen.has(session.id)) return false
    seen.add(session.id)
    return true
  })
  for (const [providerIndex, provider] of PAD_PROVIDERS.entries()) {
    const recent = threads.filter((session) => (session.agent || session.provider) === provider)
      .sort((a, b) => Number(b.updatedAt || b.activityAt || b.lastSeen || 0) - Number(a.updatedAt || a.activityAt || a.lastSeen || 0) || String(a.id).localeCompare(String(b.id)))
      .slice(0, 10)
    recent.forEach((session, rank) => {
      const index = Math.floor(rank / 2) * 8 + providerIndex * 2 + rank % 2
      if (index < grid.length) grid[index] = { ...session, padIndex: index }
    })
  }
  return grid
}
