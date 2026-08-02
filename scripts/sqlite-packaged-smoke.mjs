import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const appRoot = resolve(process.argv[2] || 'release/mac-arm64/Ambientic.app')
const resources = join(appRoot, 'Contents', 'Resources')
const executable = join(appRoot, 'Contents', 'MacOS', 'Ambientic')
const nodePath = join(resources, 'app.asar', 'node_modules')
const nativeBinary = join(resources, 'app.asar.unpacked', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node')
const shim = join(resources, 'ambientic-mcp-shim.mjs')
for (const path of [executable, join(resources, 'app.asar'), nativeBinary, shim]) {
  if (!existsSync(path)) throw new Error(`Packaged Ambientic resource is missing: ${path}`)
}

const program = `
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.exec('CREATE VIRTUAL TABLE smoke USING fts5(content)');
  db.prepare('INSERT INTO smoke(content) VALUES (?)').run('packaged context gateway');
  const row = db.prepare("SELECT content FROM smoke WHERE smoke MATCH 'gateway'").get();
  if (!row) process.exit(2);
  console.log('[ambientic] packaged SQLite + FTS5 passed from ' + require.resolve('better-sqlite3'));
  db.close();
`
const result = spawnSync(executable, ['-e', program], {
  cwd: tmpdir(),
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_PATH: nodePath },
  encoding: 'utf8'
})
if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status || 1)
