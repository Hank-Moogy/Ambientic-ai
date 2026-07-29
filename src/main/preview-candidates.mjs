import { basename, normalize, sep } from 'node:path'

function cleanPath (value) {
  const path = normalize(String(value || '').trim())
  return path === '.' ? '' : path.replace(new RegExp(`${sep}+$`), '')
}

export function localUrl (raw) {
  try {
    const url = new URL(raw)
    const host = url.hostname.toLowerCase()
    if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) return null
    const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80))
    return Number.isFinite(port) ? { url, port } : null
  } catch {
    return null
  }
}

function sessionPageUrl (raw) {
  const local = localUrl(raw)
  if (!local) return ''
  const url = local.url
  if (/^\/(?:api|_next|sockjs-node|__vite|assets)(?:\/|$)/i.test(url.pathname)) return ''
  if (/\.(?:js|css|map|json|png|jpe?g|gif|svg|ico|woff2?|ttf)(?:$|\?)/i.test(url.pathname)) return ''
  const sensitive = /^(?:code|token|access_token|refresh_token|id_token|state|key|api_key|session)$/i
  for (const key of [...url.searchParams.keys()]) if (sensitive.test(key)) url.searchParams.delete(key)
  url.hash = ''
  return url.toString()
}

export function localPreviewCandidates (sessions, contexts) {
  const candidates = new Map()
  for (const session of sessions || []) {
    const context = contexts?.get?.(session.id) || {}
    const text = typeof context === 'string'
      ? context
      : [context.direct, context.transcript].filter(Boolean).join(' ')
    const matches = String(text).match(/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\/[A-Za-z0-9\-._~%!$&'()*+,;=:@/?#]*/g) || []
    const projectCwd = cleanPath(session.terminalCwd || session.cwd)
    for (const match of matches) {
      const url = sessionPageUrl(match)
      const local = localUrl(url)
      if (!url || !local) continue
      const route = local.url.pathname !== '/' ? local.url.pathname.replace(/\/$/, '') : ''
      const key = `${projectCwd}\n${url}`
      candidates.set(key, {
        id: `browser:${local.port}:${encodeURIComponent(url)}:${encodeURIComponent(projectCwd)}`,
        type: 'browser',
        label: `localhost:${local.port}${route}`,
        detail: session.task || session.project || basename(projectCwd) || 'Agent preview',
        url,
        port: local.port,
        priority: 1500,
        lastActivatedAt: session.lastSeen || 0,
        source: 'agent-context',
        chromeProfile: 'Default',
        projectCwd
      })
    }
  }
  return [...candidates.values()]
}
