import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { readdir, readFile, stat } from 'node:fs/promises'
import { canInspectProjectRoot } from './project-scope.mjs'

const MAX_TRANSCRIPT_BYTES = 384 * 1024
const MAX_CONTEXT_CHARS = 48_000

function run (file, args, timeout = 4000) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      resolve(error ? '' : String(stdout || ''))
    })
  })
}

async function readTail (path, maxBytes = MAX_TRANSCRIPT_BYTES) {
  try {
    const data = await readFile(path)
    return data.subarray(Math.max(0, data.length - maxBytes)).toString('utf8')
  } catch {
    return ''
  }
}

function usefulStrings (value, key = '', depth = 0, result = []) {
  if (depth > 7 || result.length > 500) return result
  if (typeof value === 'string') {
    const clean = value.replace(/\s+/g, ' ').trim()
    const usefulKey = /content|text|prompt|message|title|summary|command|cmd|input|argument|path|file|url|output|result/i.test(key)
    if (clean && clean.length < 12_000 && (usefulKey || depth <= 2)) result.push(clean)
    return result
  }
  if (Array.isArray(value)) {
    for (const item of value) usefulStrings(item, key, depth + 1, result)
    return result
  }
  if (value && typeof value === 'object') {
    for (const [childKey, child] of Object.entries(value)) {
      if (/^(id|uuid|hash|signature|token|usage|cache|metadata)$/i.test(childKey)) continue
      usefulStrings(child, childKey, depth + 1, result)
    }
  }
  return result
}

export function transcriptContext (text) {
  const chunks = []
  for (const line of String(text || '').split('\n').slice(-240)) {
    try {
      const record = JSON.parse(line)
      chunks.push(...usefulStrings(record))
    } catch {}
  }
  return chunks.join(' ').slice(-MAX_CONTEXT_CHARS)
}

function claudeProjectDirectory (cwd) {
  const encoded = String(cwd || '').replace(/[^a-zA-Z0-9-]/g, '-')
  return join(homedir(), '.claude', 'projects', encoded)
}

async function newestFile (directory, predicate) {
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    const files = await Promise.all(entries
      .filter((entry) => entry.isFile() && predicate(entry.name))
      .map(async (entry) => {
        const path = join(directory, entry.name)
        return { path, modified: (await stat(path)).mtimeMs }
      }))
    return files.sort((left, right) => right.modified - left.modified)[0]?.path || ''
  } catch {
    return ''
  }
}

async function claudeContext (session) {
  const direct = String(session.transcriptPath || '')
  const path = direct || await newestFile(claudeProjectDirectory(session.terminalCwd || session.cwd), (name) => name.endsWith('.jsonl'))
  return path ? transcriptContext(await readTail(path)) : ''
}

async function codexContext (session) {
  if (!Number.isInteger(session.agent_pid)) return ''
  const openFiles = await run('/usr/sbin/lsof', ['-p', String(session.agent_pid), '-Fn'], 3500)
  const path = openFiles.split('\n').flatMap((line) => {
    const value = line.startsWith('n') ? line.slice(1) : ''
    return value.includes('/.codex/sessions/') && basename(value).startsWith('rollout-') && value.endsWith('.jsonl') ? [value] : []
  })[0]
  return path ? transcriptContext(await readTail(path)) : ''
}

async function kimiContext (session) {
  const indexPath = join(homedir(), '.kimi-code', 'session_index.jsonl')
  const cwd = String(session.terminalCwd || session.cwd || '')
  const matches = String(await readTail(indexPath, 512 * 1024)).split('\n').flatMap((line) => {
    try {
      const record = JSON.parse(line)
      return record.workDir === cwd && record.sessionDir ? [record.sessionDir] : []
    } catch {
      return []
    }
  })
  const records = await Promise.all([...new Set(matches)].map(async (directory) => {
    const path = join(directory, 'state.json')
    try {
      const info = await stat(path)
      const state = JSON.parse(await readFile(path, 'utf8'))
      const wire = await readTail(join(directory, 'agents', 'main', 'wire.jsonl'))
      return {
        modified: info.mtimeMs,
        context: `${state.title || ''} ${state.lastPrompt || ''} ${transcriptContext(wire)}`.trim()
      }
    } catch {
      return null
    }
  }))
  return records.filter(Boolean).sort((left, right) => right.modified - left.modified)[0]?.context || ''
}

export async function terminalContext (session) {
  const base = [session.contextText, session.task, session.summary].filter(Boolean).join(' ')
  const cwd = String(session.terminalCwd || session.cwd || '')
  let transcript = ''
  if (session.agent === 'claude') transcript = await claudeContext(session)
  else if (session.agent === 'codex') transcript = await codexContext(session)
  else if (session.agent === 'kimi') transcript = await kimiContext(session)
  const changedFiles = cwd && canInspectProjectRoot(cwd)
    ? await run('/usr/bin/git', ['-C', cwd, 'status', '--porcelain=v1'], 3500)
    : ''
  return {
    // Keep these signals separate. A route word in the current prompt or in a
    // changed filename is much stronger than an old mention buried in a long
    // agent transcript, and merging everything into one string loses that
    // distinction.
    direct: base.slice(-8_000),
    transcript: transcript.slice(-MAX_CONTEXT_CHARS),
    changedFiles: changedFiles.slice(-12_000)
  }
}

export async function terminalContexts (sessions) {
  const pairs = await Promise.all(sessions.map(async (session) => [session.id, await terminalContext(session)]))
  return new Map(pairs)
}
