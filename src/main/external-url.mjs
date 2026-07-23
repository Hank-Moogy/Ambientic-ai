const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

export function normalizeExternalUrl (value) {
  const raw = String(value || '').trim()
  if (!raw || raw.length > 4096) return ''
  try {
    const url = new URL(raw)
    if (!ALLOWED_PROTOCOLS.has(url.protocol)) return ''
    if ((url.protocol === 'http:' || url.protocol === 'https:') && (url.username || url.password)) return ''
    return url.href
  } catch {
    return ''
  }
}
