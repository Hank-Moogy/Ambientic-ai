import { execFileSync, spawnSync } from 'node:child_process'
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { createConnection } from 'node:net'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { signAsync } from '@electron/osx-sign'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const root = resolve(scriptDirectory, '..')
const manifestPath = join(root, 'resources', 'build-info.json')
const lockPath = join(tmpdir(), 'ambientic-local-release.lock')
const lockOwnerPath = join(lockPath, 'owner.json')
const installedApp = '/Applications/Ambientic.app'

function run (command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    ...options
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
}

function output (command, args) {
  return execFileSync(command, args, { cwd: root, encoding: 'utf8' }).trim()
}

function outputWithStderr (command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
  return `${result.stdout || ''}\n${result.stderr || ''}`.trim()
}

function localSigningIdentity () {
  const configured = String(process.env.AMBIENTIC_SIGNING_IDENTITY || process.env.CSC_NAME || '').trim()
  if (configured) return configured
  const identities = outputWithStderr('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning'])
  const matches = [...identities.matchAll(/"((?:Apple Development|Developer ID Application):[^"]+)"/g)]
  return matches[0]?.[1] || ''
}

function processIsAlive (pid) {
  if (!Number.isInteger(pid) || pid < 1) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function clearLock () {
  try { unlinkSync(lockOwnerPath) } catch {}
  try { rmdirSync(lockPath) } catch {}
}

function acquireLock () {
  try {
    mkdirSync(lockPath)
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    let owner = {}
    try { owner = JSON.parse(readFileSync(lockOwnerPath, 'utf8')) } catch {}
    if (processIsAlive(Number(owner.pid))) {
      throw new Error(`Another Ambientic release is running (PID ${owner.pid}, started ${owner.startedAt || 'recently'}).`)
    }
    clearLock()
    mkdirSync(lockPath)
  }
  writeFileSync(lockOwnerPath, `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }, null, 2)}\n`)
}

function findPackagedApp (directory, depth = 0) {
  if (depth > 3) return ''
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const candidate = join(directory, entry.name)
    if (entry.isDirectory() && entry.name === 'Ambientic.app') return candidate
    if (entry.isDirectory()) {
      const nested = findPackagedApp(candidate, depth + 1)
      if (nested) return nested
    }
  }
  return ''
}

function waitForPort (port, attempts = 30) {
  return new Promise((resolvePromise, rejectPromise) => {
    let remaining = attempts
    const attempt = () => {
      const socket = createConnection({ host: '127.0.0.1', port })
      socket.setTimeout(500)
      socket.once('connect', () => {
        socket.destroy()
        resolvePromise()
      })
      const retry = () => {
        socket.destroy()
        remaining -= 1
        if (remaining <= 0) rejectPromise(new Error(`Ambientic did not become healthy on port ${port}.`))
        else setTimeout(attempt, 500)
      }
      socket.once('error', retry)
      socket.once('timeout', retry)
    }
    attempt()
  })
}

function sleep (milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))
}

function installedAppPids () {
  try {
    return output('pgrep', ['-f', '^/Applications/Ambientic\\.app/Contents/MacOS/Ambientic$'])
      .split(/\s+/)
      .map(Number)
      .filter((pid) => Number.isInteger(pid) && pid > 0)
  } catch {
    return []
  }
}

async function waitForInstalledAppExit (attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (!installedAppPids().length) return true
    await sleep(100)
  }
  return false
}

async function stopInstalledApp () {
  try { execFileSync('osascript', ['-e', 'tell application "Ambientic" to quit']) } catch {}
  if (await waitForInstalledAppExit()) return

  // Native MIDI/PTY teardown can outlive the normal AppleScript request. A
  // release must never copy over a running bundle or health-check the old
  // process, so terminate only the exact installed Ambientic executable.
  for (const pid of installedAppPids()) {
    try { process.kill(pid, 'SIGTERM') } catch {}
  }
  if (await waitForInstalledAppExit()) return
  throw new Error('The previous installed Ambientic process did not exit; the release was not replaced.')
}

async function main () {
  if (process.platform !== 'darwin') throw new Error('The local Ambientic installer currently supports macOS only.')
  acquireLock()

  const originalManifest = readFileSync(manifestPath)
  try {
    const dirty = output('git', ['status', '--porcelain'])
    if (dirty) {
      throw new Error('Refusing to package a dirty working tree. Commit or stash every change first.')
    }

    const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    const commit = output('git', ['rev-parse', 'HEAD'])
    const branch = output('git', ['branch', '--show-current']) || 'detached'
    const buildInfo = {
      version: packageJson.version,
      commit,
      branch,
      builtAt: new Date().toISOString(),
      dirty: false
    }

    writeFileSync(manifestPath, `${JSON.stringify(buildInfo, null, 2)}\n`)
    console.log(`\nAmbientic ${buildInfo.version} · ${commit.slice(0, 8)} · ${branch}\n`)
    // A previous package leaves better-sqlite3 compiled for Electron. Restore
    // the system Node ABI for unit tests; `npm run pack` rebuilds it for the
    // target Electron version immediately afterward.
    run('npm', ['run', 'rebuild:sqlite:node'])
    if (process.env.AMBIENTIC_SKIP_CLAUDE_OAUTH_TEST === '1') {
      console.warn('⚠ Local release override: skipping only the simulated Claude OAuth callback lifecycle test.')
      run('npm', ['run', 'test:local-release'])
    } else {
    run('npm', ['test'])
    }
    const signingIdentity = localSigningIdentity()
    if (!signingIdentity) {
      throw new Error('A stable Apple Development or Developer ID signing identity is required for a local release. Set AMBIENTIC_SIGNING_IDENTITY or install a code-signing certificate.')
    }
    run('npm', ['run', 'pack'], {
      // Sign exactly once below. electron-builder 25 delegates to
      // @electron/osx-sign 1.3, whose default walker can traverse both a
      // framework's version directory and its Versions/Current symlink on
      // newer macOS releases, invalidating its own sealed resources.
      env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' }
    })

    const packagedApp = findPackagedApp(join(root, 'release'))
    if (!packagedApp) throw new Error('Packaging completed, but release/Ambientic.app was not found.')
    await signAsync({
      app: packagedApp,
      identity: signingIdentity,
      type: 'development',
      ignore: 'Versions/Current',
      // Secure timestamps and hardened runtime are distribution concerns. A
      // local Apple Development build keeps its stable team identity without
      // either, avoiding network-dependent timestamp failures on resources.
      timestamp: 'none',
      hardenedRuntime: false
    })
    run('codesign', ['--verify', '--deep', '--strict', packagedApp])
    const signature = outputWithStderr('codesign', ['-dv', '--verbose=4', packagedApp])
    if (/Signature=adhoc|TeamIdentifier=not set/.test(signature)) {
      throw new Error('The packaged Ambientic app was ad-hoc signed; refusing to install a build that would lose existing macOS permission grants.')
    }
    const packagedManifest = join(packagedApp, 'Contents', 'Resources', 'build-info.json')
    const packagedInfo = JSON.parse(readFileSync(packagedManifest, 'utf8'))
    if (packagedInfo.commit !== commit) throw new Error('Packaged build metadata does not match the release commit.')

    await stopInstalledApp()
    run('ditto', [packagedApp, installedApp], { cwd: '/' })

    const installedManifest = join(installedApp, 'Contents', 'Resources', 'build-info.json')
    const installedInfo = JSON.parse(readFileSync(installedManifest, 'utf8'))
    if (installedInfo.commit !== commit) throw new Error('Installed build metadata does not match the release commit.')

    run('open', [installedApp], { cwd: '/' })
    await waitForPort(47600)
    console.log(`\n✓ Installed and healthy: ${basename(installedApp)} ${buildInfo.version} (${commit.slice(0, 8)})`)
    console.log(`  Built ${buildInfo.builtAt}`)
  } finally {
    writeFileSync(manifestPath, originalManifest)
    clearLock()
  }
}

main().catch((error) => {
  console.error(`\nLocal release failed: ${error.message}`)
  process.exitCode = 1
})
