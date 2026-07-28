export function claudeAuthPresentation (auth) {
  if (!auth || auth.status === 'idle') return 'none'
  if (auth.status === 'connected') return 'success'
  return 'wizard'
}
