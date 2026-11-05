export const PAD_PROVIDERS = ['claude', 'codex', 'hermes', 'kimi']
const LABELS = { claude: 'Claude', codex: 'Codex', hermes: 'Hermes', kimi: 'Kimi' }

export function connectedPadProviders (connectors = []) {
  return PAD_PROVIDERS.filter((id) => connectors.some((provider) => provider.id === id && !provider.checking && provider.installed && provider.manageable === true && provider.taskCapable !== false))
}

export function validColumnWidths (providers, widths) {
  return Boolean(providers.length && widths && typeof widths === 'object' && !Array.isArray(widths) &&
    Object.keys(widths).length === providers.length &&
    providers.every((id) => Number.isInteger(widths[id]) && widths[id] >= 1) &&
    providers.reduce((sum, id) => sum + widths[id], 0) === 8)
}

export function providerColumnLayout (providers = [], widths = null) {
  const ids = PAD_PROVIDERS.filter((id) => providers.includes(id))
  const manual = validColumnWidths(ids, widths)
  let start = 0
  return ids.map((id, index) => {
    const columns = manual ? widths[id] : Math.floor(8 / ids.length) + (index < 8 % ids.length ? 1 : 0)
    const group = { id, label: LABELS[id], start, columns }
    start += columns
    return group
  })
}

// Moving a divider transfers whole columns between its two neighbours.
export function resizeProviderColumns (layout, boundary, delta) {
  const widths = Object.fromEntries(layout.map((group) => [group.id, group.columns]))
  const left = layout[boundary]
  const right = layout[boundary + 1]
  if (!left || !right || !Number.isFinite(delta)) return widths
  const change = Math.max(1 - left.columns, Math.min(right.columns - 1, Math.round(delta)))
  widths[left.id] += change
  widths[right.id] -= change
  return widths
}

export function recentThreadGrid (sessions = [], padCount = 40, layout = []) {
  const grid = Array.from({ length: Math.max(0, padCount) }, () => null)
  const seen = new Set()
  const threads = sessions.filter((session) => {
    if (!session?.id || session.discovered || session.archived || seen.has(session.id)) return false
    seen.add(session.id)
    return true
  })
  for (const group of layout) {
    const recent = threads.filter((session) => (session.agent || session.provider) === group.id)
      .sort((a, b) => Number(b.updatedAt || b.activityAt || b.lastSeen || 0) - Number(a.updatedAt || a.activityAt || a.lastSeen || 0) || String(a.id).localeCompare(String(b.id)))
      .slice(0, Math.floor(padCount / 8) * group.columns)
    recent.forEach((session, rank) => {
      const index = Math.floor(rank / group.columns) * 8 + group.start + rank % group.columns
      if (index < grid.length) grid[index] = { ...session, padIndex: index }
    })
  }
  return grid
}
