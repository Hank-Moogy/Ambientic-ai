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
