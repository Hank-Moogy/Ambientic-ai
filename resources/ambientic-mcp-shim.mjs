import { createInterface } from 'node:readline'
import { createConnection } from 'node:net'
import { randomUUID } from 'node:crypto'

const socketPath = process.env.AMBIENTIC_GATEWAY_SOCKET || ''
const token = process.env.AMBIENTIC_GATEWAY_TOKEN || ''

function respond (id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`)
}

function respondError (id, error) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message: error.message || String(error) } })}\n`)
}

function gateway (method, params = {}, timeoutMs = 120_000) {
  if (!socketPath || !token) return Promise.reject(new Error('Ambientic gateway session is not configured.'))
  return new Promise((resolve, reject) => {
    const id = randomUUID()
    const socket = createConnection(socketPath)
    let buffer = ''
    const timer = setTimeout(() => { socket.destroy(); reject(new Error(`${method} timed out`)) }, timeoutMs)
    socket.setEncoding('utf8')
    socket.on('connect', () => socket.write(`${JSON.stringify({ id, token, method, params })}\n`))
    socket.on('data', (chunk) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        let response
        try { response = JSON.parse(line) } catch { continue }
        if (response.id !== id) continue
        clearTimeout(timer)
        socket.end()
        if (response.error) reject(new Error(response.error.message || 'Gateway call failed.'))
        else resolve(response.result)
      }
    })
    socket.on('error', (error) => { clearTimeout(timer); reject(error) })
  })
}

createInterface({ input: process.stdin }).on('line', async (line) => {
  let message
  try { message = JSON.parse(line) } catch { return }
  if (message.id === undefined) return
  try {
    if (message.method === 'initialize') {
      return respond(message.id, {
        protocolVersion: message.params?.protocolVersion || '2025-03-26',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'ambientic', version: '0.8.1' }
      })
    }
    if (message.method === 'ping') return respond(message.id, {})
    if (message.method === 'tools/list') return respond(message.id, await gateway('tools/list'))
    if (message.method === 'tools/call') {
      try {
        const result = await gateway('tools/call', message.params || {})
        return respond(message.id, { content: [{ type: 'text', text: JSON.stringify(result) }], isError: false })
      } catch (error) {
        return respond(message.id, { content: [{ type: 'text', text: error.message }], isError: true })
      }
    }
    respondError(message.id, new Error(`Unsupported MCP method: ${message.method}`))
  } catch (error) {
    respondError(message.id, error)
  }
})
