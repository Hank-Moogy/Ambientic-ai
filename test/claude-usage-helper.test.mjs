import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const helperPath = fileURLToPath(new URL('../resources/claude_usage.py', import.meta.url))

async function callHelperFunction (expression) {
  const program = [
    'import importlib.util, json, sys',
    'spec = importlib.util.spec_from_file_location("claude_usage", sys.argv[1])',
    'module = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(module)',
    `print(json.dumps(${expression}))`
  ].join(';')
  const { stdout } = await execFileAsync('/usr/bin/python3', ['-c', program, helperPath])
  return JSON.parse(stdout)
}

test('Claude usage helper parses subscription windows and ignores extra-usage copy', async () => {
  const windows = await callHelperFunction('module.parse("API Usage Billing for extra usage Current session 18% used Resets 7:09pm (Europe/Paris) Current week 42% used Resets Jul 30 (Europe/Paris)")')
  assert.deepEqual(windows.map(({ id, usedPercent }) => ({ id, usedPercent })), [
    { id: 'five-hour', usedPercent: 18 },
    { id: 'seven-day', usedPercent: 42 }
  ])
})

test('Claude usage helper only navigates the legacy three-tab Settings screen', async () => {
  assert.equal(await callHelperFunction('module.tab_navigation_count("Settings Status Config Usage Stats")'), 0)
  assert.equal(await callHelperFunction('module.tab_navigation_count("Settings Status Config Usage")'), 2)
  assert.equal(await callHelperFunction('module.tab_navigation_count("Claude prompt")'), null)
})
