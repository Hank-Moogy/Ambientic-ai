export function padOpenTarget (value) { return value === 'ambientic' ? 'ambientic' : 'native' }

export function padDestination (session, preference, pendingInAmbientic = false) {
  if (!session) return 'unavailable'
  // A request owned by Ambientic cannot be answered in a separate native runtime.
  if (pendingInAmbientic || padOpenTarget(preference) === 'ambientic') return 'ambientic'
  return session.deepLink || session.tty ? 'native' : 'ambientic'
}
