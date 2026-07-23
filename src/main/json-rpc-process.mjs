import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

export class JsonRpcProcess extends EventEmitter {
  constructor (command, args = [], options = {}) {
    super()
    this.command = command
    this.args = args
    this.options = options
    this.child = null
    this.sequence = 1
    this.pending = new Map()
    this.stderr = ''
  }

  start () {
    if (this.child) return
    this.child = spawn(this.command, this.args, {
      cwd: this.options.cwd,
      env: { ...process.env, ...this.options.env },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    createInterface({ input: this.child.stdout }).on('line', (line) => this.receive(line))
    this.child.stderr.on('data', (chunk) => {
      this.stderr = (this.stderr + chunk.toString()).slice(-12_000)
      this.emit('stderr', chunk.toString())
    })
    this.child.on('error', (error) => this.failAll(error))
    this.child.on('exit', (code, signal) => {
      const detail = this.stderr.trim().split('\n').at(-1)
      this.failAll(new Error(detail || `${this.command} exited (${signal || code})`))
      this.child = null
      this.emit('exit', { code, signal, detail })
    })
  }

  receive (line) {
    let message
    try { message = JSON.parse(line) } catch { return }
    if (message.id !== undefined && (message.result !== undefined || message.error)) {
      const pending = this.pending.get(String(message.id))
      if (!pending) return
      this.pending.delete(String(message.id))
      if (message.error) pending.reject(new Error(message.error.message || JSON.stringify(message.error)))
      else pending.resolve(message.result)
      return
    }
    if (message.id !== undefined && message.method) this.emit('request', message)
    else if (message.method) this.emit('notification', message)
  }

  send (message) {
    if (!this.child?.stdin?.writable) throw new Error(`${this.command} is not running`)
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
  }

  request (method, params = {}, timeoutMs = 60_000) {
    this.start()
    const id = String(this.sequence++)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`${method} timed out`))
      }, timeoutMs)
      if (timer.unref) timer.unref()
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value) },
        reject: (error) => { clearTimeout(timer); reject(error) }
      })
      this.send({ id, method, params })
    })
  }

  notify (method, params = {}) { this.send({ method, params }) }
  respond (id, result) { this.send({ id, result }) }
  respondError (id, code, message) { this.send({ id, error: { code, message } }) }

  failAll (error) {
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }

  stop () {
    if (!this.child) return
    this.child.kill('SIGTERM')
    this.child = null
  }
}
