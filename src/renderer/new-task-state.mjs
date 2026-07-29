const IPC_ERROR_PREFIX = /^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i

export function taskCreationError (error) {
  const message = String(error?.message || error || '').replace(IPC_ERROR_PREFIX, '').trim()
  return message || 'Ambientic could not start this task. Check the provider connection and try again.'
}
