import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { installedAppPids, parseInstalledAppPids } from '../scripts/installed-app-pids.mjs'

const source = readFileSync(new URL('../scripts/release-local.mjs', import.meta.url), 'utf8')

const EXECUTABLE = '/Applications/Ambientic.app/Contents/MacOS/Ambientic'

test('local release waits for the exact installed Ambientic process to exit', () => {
  assert.match(source, /async function stopInstalledApp/)
  assert.match(source, /waitForInstalledAppExit/)
  assert.match(source, /process\.kill\(pid, 'SIGTERM'\)/)
  assert.match(source, /await stopInstalledApp\(\)/)
  assert.doesNotMatch(source, /await sleep\(800\)/)
})

// `pgrep -f` reported no match for a demonstrably running app when the release
// was started from a Claude session Ambientic had spawned. Both callers read an
// empty list as "not running", so the self-release guard never fired and the
// wait for the old process returned at once -- the bundle would have been
// replaced underneath a live app.
test('the installed app is found through ps rather than pgrep', () => {
  assert.doesNotMatch(source, /pgrep/)
  assert.match(source, /findInstalledAppPids\(installedAppExecutable\)/)
})

test('a running installed app is found in real ps output', () => {
  const ps = [
    '  501 /sbin/launchd',
    '93504 /Applications/Ambientic.app/Contents/MacOS/Ambientic',
    ' 1234 /Applications/Safari.app/Contents/MacOS/Safari'
  ].join('\n')
  assert.deepEqual(parseInstalledAppPids(ps, EXECUTABLE), [93504])
})

// The shim and the renderer helpers run the very same binary. Quitting one, or
// waiting on it as though it were the app, would be wrong in both directions.
test('helpers running the same binary are not mistaken for the app', () => {
  const ps = [
    '13989 /Applications/Ambientic.app/Contents/MacOS/Ambientic /Applications/Ambientic.app/Contents/Resources/ambientic-mcp-shim.mjs',
    '13990 /Applications/Ambientic.app/Contents/Frameworks/Ambientic Helper.app/Contents/MacOS/Ambientic Helper --type=renderer',
    '13991 /Users/samori/AgentBase/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .'
  ].join('\n')
  assert.deepEqual(parseInstalledAppPids(ps, EXECUTABLE), [])
})

test('every instance is reported, so none is left holding the old bundle', () => {
  const ps = [
    '93504 /Applications/Ambientic.app/Contents/MacOS/Ambientic',
    '93777 /Applications/Ambientic.app/Contents/MacOS/Ambientic'
  ].join('\n')
  assert.deepEqual(parseInstalledAppPids(ps, EXECUTABLE), [93504, 93777])
})

// A lookup that throws must not read as "the app is not running": that is the
// failure mode this replaced.
test('a failing ps is reported as no answer rather than as an empty machine', () => {
  assert.deepEqual(installedAppPids(EXECUTABLE, () => { throw new Error('ps unavailable') }), [])
  assert.deepEqual(parseInstalledAppPids('', EXECUTABLE), [])
})

test('local release preserves a stable macOS signing identity', () => {
  assert.match(source, /function localSigningIdentity/)
  assert.match(source, /AMBIENTIC_SIGNING_IDENTITY/)
  assert.match(source, /CSC_IDENTITY_AUTO_DISCOVERY: 'false'/)
  assert.match(source, /signAsync/)
  assert.match(source, /ignore: 'Versions\/Current'/)
  assert.match(source, /identity: signingIdentity/)
  assert.match(source, /timestamp: 'none'/)
  assert.match(source, /hardenedRuntime: false/)
  assert.match(source, /Signature=adhoc\|TeamIdentifier=not set/)
  assert.doesNotMatch(source, /'--sign', '-'/)
})
