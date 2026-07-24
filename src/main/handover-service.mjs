import { EventEmitter } from 'node:events'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { access, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

const execFileAsync = promisify(execFile)
export const HANDOVER_THRESHOLD = 85
const MAX_CONTEXT_MESSAGES = 6
const MAX_MESSAGE_CHARS = 700

function clean (value, max = 1200) {
  return String(value || '').replace(/\0/g, '').trim().slice(0, max)
}

function section (markdown, heading, max = 1800) {
  const pattern = new RegExp(`^##+\\s+${heading}\\s*$([\\s\\S]*?)(?=^##+\\s|(?![\\s\\S]))`, 'im')
  return clean(markdown.match(pattern)?.[1], max)
}

async function readable (path) {
  try { await access(path); return true } catch { return false }
}

async function gitContext (cwd) {
  const run = async (args) => clean((await execFileAsync('git', args, { cwd, timeout: 5000, maxBuffer: 512 * 1024 })).stdout, 2400)
  try {
    return {
      branch: await run(['branch', '--show-current']),
      recent: await run(['log', '-5', '--oneline']),
      status: await run(['status', '--short']),
      diff: await run(['diff', '--stat'])
    }
  } catch {
    return { branch: '', recent: '', status: '', diff: '' }
  }
}

export function providerRisk (usage, provider) {
  const windows = usage?.providers?.[provider]?.windows || []
  const highest = windows.reduce((best, window) => Number(window.usedPercent) > Number(best?.usedPercent ?? -1) ? window : best, null)
  return {
    provider,
    usedPercent: Number.isFinite(Number(highest?.usedPercent)) ? Number(highest.usedPercent) : null,
    label: highest?.period === 'week' ? 'Weekly limit' : highest?.label || 'Provider limit',
    resetAt: highest?.resetAt || null,
    nearLimit: Number(highest?.usedPercent) >= HANDOVER_THRESHOLD
  }
}

export function renderHandover ({ session, snapshot, readme, git, risk, generatedAt }) {
  const recentMessages = (snapshot.messages || [])
    .filter((item) => ['user', 'assistant'].includes(item.role) && clean(item.text))
    .slice(-MAX_CONTEXT_MESSAGES)
    .map((item) => `- **${item.role === 'user' ? 'User direction' : 'Agent result'}:** ${clean(item.text, MAX_MESSAGE_CHARS).replace(/\n+/g, ' ')}`)
  const artifacts = (snapshot.artifacts || []).slice(-12).map((item) => `- \`${item.path}\``)
  const direction = section(readme, 'Long-term vision') || clean(snapshot.title)
  const remaining = section(readme, 'Not included yet') || 'Review the current objective and working tree before choosing the next implementation step.'
  const architecture = section(readme, 'Architecture') || 'Inspect the project entry points and README before editing.'
  const limit = risk?.usedPercent === null || risk?.usedPercent === undefined ? 'Manual handover' : `${Math.round(risk.usedPercent)}% used · ${risk.label}`

  return `<!-- agentbase-handover -->
# ${session.project || basename(session.cwd || '') || 'Project'} handover

Generated: ${new Date(generatedAt).toISOString()}  
Source provider: ${session.agent}  
Source task: ${clean(snapshot.title || session.task, 160)}  
Reason: ${limit}

## Continue from here

Work in \`${session.cwd}\`. Read this file, inspect the working tree, and continue the current objective. Preserve existing uncommitted work. Do not ask for the prior chat, and do not spend a turn re-summarizing this handover unless the repository contradicts it.

## Product direction

${direction}

## Current objective

${clean(snapshot.title || session.task || session.summary, 500)}

## Completed and material state

${git.recent ? `Recent commits:\n\n\`\`\`text\n${git.recent}\n\`\`\`` : 'No Git history was available.'}

${git.status ? `Current working tree (preserve these changes):\n\n\`\`\`text\n${git.status}\n\`\`\`` : 'The working tree is clean or unavailable.'}

${git.diff ? `Change footprint:\n\n\`\`\`text\n${git.diff}\n\`\`\`` : ''}

## Remaining direction

${remaining}

## Architecture

${architecture}

## Recent decision context

${recentMessages.length ? recentMessages.join('\n') : '- No canonical recent messages were available. Use the task title, README, and working tree as the source of truth.'}

## Material artifacts

${artifacts.length ? artifacts.join('\n') : '- No task artifacts were recorded. Inspect the working tree.'}

## First action

Run \`git status --short\`, read the directly relevant files, and continue the current objective with the smallest verifiable increment.
`
}

export class HandoverService extends EventEmitter {
  constructor ({ workspace, usage }) {
    super()
    this.workspace = workspace
    this.usage = usage
    this.records = new Map()
    this.generatedForWindow = new Set()
  }

  async list () {
    const sessions = await this.workspace.list()
    for (const session of sessions) {
      if (!session.cwd) continue
      const path = join(session.cwd, 'HANDOVER.md')
      if (this.records.has(path)) continue
      if (await readable(path)) {
        this.records.set(path, {
          id: session.id, sessionId: session.id, project: session.project || basename(session.cwd),
          cwd: session.cwd, sourceProvider: session.agent, path, generatedAt: null, reason: 'existing'
        })
      }
    }
    return [...this.records.values()].sort((a, b) => Number(b.generatedAt || 0) - Number(a.generatedAt || 0))
  }

  async generate (sessionId, reason = 'manual') {
    const session = this.workspace.sessionFor(sessionId)
    if (!session?.cwd) throw new Error('This task does not have a project folder.')
    const snapshot = await this.workspace.read(sessionId)
    const readmePath = join(session.cwd, 'README.md')
    const readme = await readFile(readmePath, 'utf8').catch(() => '')
    const git = await gitContext(session.cwd)
    const risk = providerRisk(this.usage.getState(), session.agent)
    const generatedAt = Date.now()
    const body = renderHandover({ session, snapshot, readme, git, risk, generatedAt })
    const path = join(session.cwd, 'HANDOVER.md')
    const temporary = `${path}.agentbase-${process.pid}.tmp`
    await writeFile(temporary, body, { mode: 0o600 })
    await rename(temporary, path)
    const record = {
      id: session.id, sessionId: session.id, project: session.project || basename(session.cwd),
      cwd: session.cwd, title: snapshot.title, sourceProvider: session.agent, path, generatedAt,
      reason, usedPercent: risk.usedPercent
    }
    this.records.set(path, record)
    this.emit('change', await this.list())
    return record
  }

  async continueWith (sessionId, targetProvider) {
    const source = this.workspace.sessionFor(sessionId)
    const record = this.records.get(join(source?.cwd || '', 'HANDOVER.md')) || await this.generate(sessionId, 'provider switch')
    if (source?.agent === targetProvider) throw new Error('Choose a different provider for the handover.')
    const prompt = `Take over this project from ${source?.agent || 'another provider'}. Read ${record.path}, inspect the working tree, and continue the Current objective / First action. Treat the handover and repository as the source of truth; do not ask for the prior chat or repeat the handover back to me.`
    const targetSessionId = await this.workspace.create({ provider: targetProvider, cwd: source.cwd, prompt })
    return { ...record, targetProvider, targetSessionId }
  }

  async evaluate (usageState) {
    const byProject = new Map()
    for (const session of (await this.workspace.list()).filter((item) => !item.history && item.cwd)) {
      if (!byProject.has(session.cwd)) byProject.set(session.cwd, session)
    }
    const sessions = [...byProject.values()]
    for (const session of sessions) {
      const risk = providerRisk(usageState, session.agent)
      if (!risk.nearLimit) continue
      const windowKey = `${session.id}:${risk.resetAt || 'current'}`
      if (this.generatedForWindow.has(windowKey)) continue
      this.generatedForWindow.add(windowKey)
      await this.generate(session.id, 'rate limit').catch((error) => {
        this.generatedForWindow.delete(windowKey)
        console.error(`[agentbase] handover generation failed: ${error.message}`)
      })
    }
  }
}
