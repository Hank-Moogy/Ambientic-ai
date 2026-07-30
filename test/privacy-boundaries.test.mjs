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
  // Reading Claude's plan limits requires launching its interactive TUI, because
  // current builds send no rate_limits to the status line. That is now allowed on
  // the periodic refresh, so the boundary that must hold is WHERE it runs: from
  // Ambientic's private runtime directory, never the user's home, so macOS never
  // attributes a Documents/Desktop/Photos scan to Ambientic.
  assert.match(usage, /collectClaudeUsageWindows/)
  const scrape = await readFile(new URL('../src/main/claude-usage-scrape.mjs', import.meta.url), 'utf8')
  assert.match(scrape, /const cwd = providerRuntimeDirectory\(\)/)
  // Passed to execFile as the child's cwd (shorthand) and to the helper argv, so
  // both the python process and the Claude TUI it forks run in the private dir.
  assert.match(scrape, /^\s*cwd,$/m)
  assert.match(scrape, /claudePath, cwd\]/)
  assert.doesNotMatch(scrape, /cwd:\s*homedir\(\)/)
  assert.doesNotMatch(auth, /cwd:\s*this\.env\.HOME/)
})
