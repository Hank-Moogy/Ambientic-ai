import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { SessionStore } from '../src/main/sessions.js'
import { APC40, ledForSession } from '../src/main/apc40.mjs'

const hookPath = fileURLToPath(new URL('../hook/controller-hook.py', import.meta.url))

function hookEvent (payload) {
  const script = [
    'import importlib.util, json, sys',
    'spec = importlib.util.spec_from_file_location("ambientic_hook", sys.argv[1])',
    'module = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(module)',
    'print(json.dumps(module.event_for_hook(json.loads(sys.argv[2]))))'
  ].join('; ')
  return JSON.parse(execFileSync('python3', ['-c', script, hookPath, JSON.stringify(payload)], { encoding: 'utf8' }))
}

test('Claude approvals and input questions become immediate attention events', () => {
  assert.equal(hookEvent({ hook_event_name: 'PermissionRequest' }), 'notification')
  assert.equal(hookEvent({ hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion' }), 'notification')
  assert.equal(hookEvent({ hook_event_name: 'PreToolUse', tool_name: 'ExitPlanMode' }), 'notification')

  const store = new SessionStore()
  const session = store.ingest({
    event: hookEvent({ hook_event_name: 'PermissionRequest' }),
    session_id: 'claude-approval',
    agent: 'claude',
    cwd: '/tmp/project'
  })
  assert.equal(session.state, 'attention')
  assert.deepEqual(ledForSession(session), { channel: 14, color: APC40.COLOR.RED })
})

test('ordinary Claude PreToolUse events do not falsely request attention', () => {
  assert.equal(hookEvent({ hook_event_name: 'PreToolUse', tool_name: 'Read' }), null)
})
