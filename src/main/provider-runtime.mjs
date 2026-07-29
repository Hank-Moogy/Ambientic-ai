import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Provider CLIs inherit responsibility attribution from Ambientic on macOS.
// Never launch a background probe from the user's home directory: some CLIs
// enumerate their cwd on startup, which can make macOS interpret the probe as
// an attempt to read Music, Photos, Documents, Desktop, or Downloads.
export function providerRuntimeDirectory (home = homedir()) {
  const directory = join(home, '.ambientic', 'provider-runtime')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  return directory
}
