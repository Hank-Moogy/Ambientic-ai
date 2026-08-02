import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../scripts/release-local.mjs', import.meta.url), 'utf8')

test('local release waits for the exact installed Ambientic process to exit', () => {
  assert.match(source, /async function stopInstalledApp/)
  assert.match(source, /waitForInstalledAppExit/)
  assert.match(source, /\^\/Applications\/Ambientic\\\\\.app\/Contents\/MacOS\/Ambientic\$/)
  assert.match(source, /process\.kill\(pid, 'SIGTERM'\)/)
  assert.match(source, /await stopInstalledApp\(\)/)
  assert.doesNotMatch(source, /await sleep\(800\)/)
})

test('local release preserves a stable macOS signing identity', () => {
  assert.match(source, /function localSigningIdentity/)
  assert.match(source, /AMBIENTIC_SIGNING_IDENTITY/)
  assert.match(source, /CSC_IDENTITY_AUTO_DISCOVERY: 'false'/)
  assert.match(source, /electron-osx-sign/)
  assert.match(source, /--ignore=Versions\/Current/)
  assert.match(source, /`--identity=\$\{signingIdentity\}`/)
  assert.match(source, /Signature=adhoc\|TeamIdentifier=not set/)
  assert.doesNotMatch(source, /'--sign', '-'/)
})
