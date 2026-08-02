import http from 'node:http'

// Loopback-only ingest server. The hook fires detached `curl` POSTs here; we
// keep it dead simple and permissive (any parse error just 400s, never throws).
export const PORT = 47600

export function startServer (store, { focusById, onTaskText, onApprovalRequest, port = PORT } = {}) {
  const server = http.createServer((req, res) => {
    // Loopback only — never accept anything off-box.
    const ra = req.socket.remoteAddress || ''
    if (!(ra === '127.0.0.1' || ra === '::1' || ra === '::ffff:127.0.0.1')) {
      res.writeHead(403).end()
      return
    }

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, sessions: store.list().length }))
      return
    }

    if (req.method === 'GET' && req.url === '/debug') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(store.list(), null, 2))
      return
    }

    // Focus a session by id from outside the app (dev verification, scripts,
    // Raycast, etc.):  curl http://127.0.0.1:47600/focus/<id>
    if (req.method === 'GET' && req.url.startsWith('/focus/')) {
      const id = decodeURIComponent(req.url.slice('/focus/'.length))
      Promise.resolve(focusById ? focusById(id) : { ok: false, reason: 'no-handler' })
        .then((r) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(r)) })
        .catch((e) => { res.writeHead(500).end(JSON.stringify({ ok: false, error: String(e) })) })
      return
    }

    if (req.method === 'POST' && req.url === '/approval/claude') {
      let body = ''
      let tooBig = false
      req.on('data', (chunk) => {
        body += chunk
        if (body.length > 256 * 1024) { tooBig = true; req.destroy() }
      })
      req.on('end', () => {
        if (tooBig) { res.writeHead(413).end(); return }
        try {
          const event = JSON.parse(body)
          const session = store.ingest({ ...event, event: 'notification', agent: 'claude' })
          Promise.resolve(session && onApprovalRequest ? onApprovalRequest(event, session.id) : null)
            .then((decision) => {
              res.writeHead(200, { 'content-type': 'application/json' })
              res.end(JSON.stringify(decision || {}))
            })
            .catch(() => {
              res.writeHead(200, { 'content-type': 'application/json' })
              res.end('{}')
            })
        } catch {
          res.writeHead(400).end('{"ok":false}')
        }
      })
      return
    }

    if (req.method === 'POST' && req.url === '/event') {
      let body = ''
      let tooBig = false
      req.on('data', (c) => {
        body += c
        if (body.length > 256 * 1024) { tooBig = true; req.destroy() }
      })
      req.on('end', () => {
        if (tooBig) { res.writeHead(413).end(); return }
        try {
          const evt = JSON.parse(body)
          const session = store.ingest(evt)
          if (session && evt.task_text && onTaskText) onTaskText(session.id, evt.task_text)
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end('{"ok":true}')
        } catch {
          res.writeHead(400).end('{"ok":false}')
        }
      })
      return
    }

    res.writeHead(404).end()
  })

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[ambientic] port ${port} already in use — another instance running?`)
    } else {
      console.error('[ambientic] server error:', err.message)
    }
  })

  server.listen(port, '127.0.0.1', () => {
    const address = server.address()
    const activePort = typeof address === 'object' && address ? address.port : port
    console.log(`[ambientic] ingest listening on http://127.0.0.1:${activePort}`)
  })

  return server
}
