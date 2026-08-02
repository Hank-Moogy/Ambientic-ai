import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const sdkRoot = execFileSync('/usr/bin/xcrun', ['--show-sdk-path'], { encoding: 'utf8' }).trim()
const libcxx = join(sdkRoot, 'usr', 'include', 'c++', 'v1')
if (!sdkRoot || !existsSync(join(libcxx, 'climits'))) {
  throw new Error('The active macOS SDK is missing libc++ headers. Reinstall Xcode Command Line Tools before testing Ambientic.')
}

const includeFlag = `-isystem ${libcxx}`
const env = {
  ...process.env,
  SDKROOT: sdkRoot,
  CPPFLAGS: [process.env.CPPFLAGS, includeFlag].filter(Boolean).join(' '),
  CXXFLAGS: [process.env.CXXFLAGS, includeFlag].filter(Boolean).join(' ')
}
const result = spawnSync('npm', ['rebuild', 'better-sqlite3'], { cwd: process.cwd(), env, stdio: 'inherit' })
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status || 1)
