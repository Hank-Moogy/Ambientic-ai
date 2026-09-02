import { execFileSync } from 'node:child_process'

// Finding the running installed app is what makes a release safe: it drives the
// guard against releasing from inside Ambientic, and the wait for the old
// process to exit before its bundle is replaced. `pgrep -f` was not dependable
// for it. From a Claude session that Ambientic itself spawned it reported no
// match while the app was demonstrably running, and because both callers read
// "no match" as "not running", the guard never fired and the wait returned
// immediately -- precisely the half-replaced bundle both exist to prevent.
// `ps -axo pid=,command=` reports the same process from every session, so ask
// it instead and match the executable here.
export function parseInstalledAppPids (psOutput, executable) {
  const pids = []
  for (const line of String(psOutput || '').split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(.*)$/)
    if (!match) continue
    // Match the executable exactly, with no arguments, exactly as the old
    // fully anchored pattern did. The MCP shim runs this same binary under
    // ELECTRON_RUN_AS_NODE with a script path, and a helper carries its own
    // flags; neither is the app whose bundle is about to be replaced, and
    // quitting or waiting on one would be wrong.
    if (match[2].trim() !== executable) continue
    const pid = Number(match[1])
    if (Number.isInteger(pid) && pid > 0) pids.push(pid)
  }
  return pids
}

export function installedAppPids (executable, exec = execFileSync) {
  try {
    return parseInstalledAppPids(exec('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' }), executable)
  } catch {
    return []
  }
}
