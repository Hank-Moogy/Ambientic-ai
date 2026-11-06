import { realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve, sep } from 'node:path'

// One spelling per directory.
//
// A project is identified by where it is, so two spellings of one folder must
// never become two projects. On macOS both ways of spelling one happen
// constantly: `/tmp` is a symlink to `/private/tmp`, and the default filesystem
// is case-insensitive, so `AgentBase` and `agentbase` are the same directory.
// Codex keys its trust on an absolute path and Claude keys its transcripts on
// an escaped one, so a mismatched spelling here is also a project that fails to
// line up with the harnesses.
//
// `realpathSync.native` settles both at once: it follows symlinks and returns
// the real on-disk casing, so no case folding is needed and a case-sensitive
// filesystem keeps two genuinely different folders apart.
export function canonicalPath (input, home = homedir()) {
  let value = String(input || '').trim()
  if (!value) return ''
  if (value === '~') value = home
  else if (value.startsWith(`~${sep}`)) value = join(home, value.slice(2))
  if (!isAbsolute(value)) return ''
  const resolved = resolve(value)
  // A path that does not exist yet cannot be resolved against the disk, and is
  // still the best answer available — a folder about to be created.
  try {
    return realpathSync.native(resolved)
  } catch {
    return resolved
  }
}

export function samePath (left, right) {
  const a = canonicalPath(left)
  return Boolean(a) && a === canonicalPath(right)
}

// Claude stores a session under its working directory with the separators
// replaced. The escaping is lossy — `/a/b-c` and `/a/b/c` both become
// `-a-b-c` — so it must only ever be produced from a path, never parsed back
// into one.
export function claudeProjectDirName (input) {
  const path = canonicalPath(input)
  return path ? path.replace(/[/.]/g, '-') : ''
}
