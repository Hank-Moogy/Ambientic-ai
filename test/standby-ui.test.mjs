import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const workspace = readFileSync(new URL('../src/renderer/Workspace.jsx', import.meta.url), 'utf8')
const compact = readFileSync(new URL('../src/renderer/App.jsx', import.meta.url), 'utf8')
const preload = readFileSync(new URL('../src/preload/index.js', import.meta.url), 'utf8')
const main = readFileSync(new URL('../src/main/index.js', import.meta.url), 'utf8')

test('threads expose one canonical stand by control in the header and compact controller', () => {
  assert.match(workspace, /setThreadStandby\(selectedId, !selectedSession\?\.standby\)/)
  assert.match(workspace, /aria-pressed=\{Boolean\(selectedSession\?\.standby\)\}/)
  assert.match(compact, /setThreadStandby\(id, enabled\)/)
  assert.doesNotMatch(compact, /standby-terminals-v1/)
})

test('Overview pads open the stand by context menu through the IPC boundary', () => {
  assert.match(workspace, /onContextMenu=\{\(event\) => \{[\s\S]{0,180}onStandbyMenu\(session\.id\)/)
  assert.match(preload, /showThreadMenu: \(id\) => ipcRenderer\.invoke\('show-thread-menu', id\)/)
  assert.match(main, /ipcMain\.handle\('show-thread-menu'/)
  assert.match(main, /Put on stand by/)
})
