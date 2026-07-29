import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { localPreviewCandidates } from '../src/main/preview-candidates.mjs'

test('derives project-linked localhost previews from agent context without inspecting browser data', () => {
  const sessions = [{
    id: 'task-1',
    project: 'AgentBase',
    cwd: '/Users/person/AgentBase',
    task: 'Fix overview',
    lastSeen: 42
  }]
  const contexts = new Map([['task-1', {
    direct: 'Preview http://localhost:3000/dashboard?token=secret&view=grid',
    transcript: 'Ignore https://example.com and http://localhost:3000/assets/app.js'
  }]])

  assert.deepEqual(localPreviewCandidates(sessions, contexts), [{
    id: 'browser:3000:http%3A%2F%2Flocalhost%3A3000%2Fdashboard%3Fview%3Dgrid:%2FUsers%2Fperson%2FAgentBase',
    type: 'browser',
    label: 'localhost:3000/dashboard',
    detail: 'Fix overview',
    url: 'http://localhost:3000/dashboard?view=grid',
    port: 3000,
    priority: 1500,
    lastActivatedAt: 42,
    source: 'agent-context',
    chromeProfile: 'Default',
    projectCwd: '/Users/person/AgentBase'
  }])
})

test('background discovery contains no browser, terminal-window, or legacy terminal automation', async () => {
  const discovery = await readFile(new URL('../src/main/discovery.js', import.meta.url), 'utf8')
  const companions = await readFile(new URL('../src/main/companions.js', import.meta.url), 'utf8')
  const usage = await readFile(new URL('../src/main/usage.js', import.meta.url), 'utf8')
  const auth = await readFile(new URL('../src/main/claude-auth-service.mjs', import.meta.url), 'utf8')

  assert.doesNotMatch(discovery, /osascript/i)
  assert.doesNotMatch(companions, /scanChromeTabs|chromeSessionTabs|CHROME_DATA_PATH|lsof['"], \['-nP', '-iTCP'/)
  assert.match(usage, /if \(!force\)[\s\S]*CLAUDE_PASSIVE_REFRESH/)
  assert.doesNotMatch(auth, /cwd:\s*this\.env\.HOME/)
})
