import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Packaging rebuilds better-sqlite3 against Electron's ABI, which leaves the
// system Node test runner unable to load it (ERR_DLOPEN_FAILED). The failure
// looks alarming and unrelated to whatever you were testing, so flip the ABI
// back automatically instead of making every caller remember to.
const require = createRequire(import.meta.url)
try {
  const Database = require('better-sqlite3')
  new Database(':memory:').close()
  process.exit(0)
} catch (error) {
  if (error?.code !== 'ERR_DLOPEN_FAILED') throw error
}

console.log('[ambientic] better-sqlite3 is built for Electron; restoring the Node ABI for tests')
const here = dirname(fileURLToPath(import.meta.url))
const result = spawnSync(process.execPath, [join(here, 'rebuild-sqlite-node.mjs')], { stdio: 'inherit' })
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status || 1)
