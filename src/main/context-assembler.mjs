export function assembleProviderPrompt (text, { mode = 'build', attachments = [], projectContext = null, knownProjects = [] } = {}) {
  const guidance = mode === 'plan'
    ? 'Planning mode: inspect and reason, but do not modify files or run destructive commands. Return a concise implementation plan.'
    : mode === 'ask'
        ? 'Ask mode: answer and explain only. Do not modify files or run destructive commands.'
        : ''
  const project = projectContext
    ? `Project context: you are working on ${projectContext.name || 'this project'} at ${projectContext.cwd}. Treat that directory as the project root. Before changing files, orient yourself by reading the nearest AGENTS.md and relevant README or project manifests, then inspect the current working tree. Do not treat this as an empty scratch workspace.`
    : ''
  // Naming the other projects is what makes them discoverable. They are already
  // granted, so the agent should open them rather than report that a request
  // falls outside its folder — which is what it does when it is told nothing.
  const discovery = knownProjects.length
    ? `Other local projects on this machine you can open — read them directly, do not ask first:\n${knownProjects.map((item) => `- ${item.name}: ${item.cwd}`).join('\n')}\nIf the request is about one of these, work there. Changing files, and reaching anywhere not listed here, prompts the user for permission and then proceeds — so attempt the work rather than declining it. Only report a path as unavailable after actually trying to read it.`
    : ''
  if (!guidance && !attachments.length && !project && !discovery) return text
  const paths = attachments.length
    ? `\nAttached local context:\n${attachments.map((item) => `- ${item.kind}: ${item.path}`).join('\n')}`
    : ''
  return `<ambientic-context mode="${mode}">\n${[guidance, project, discovery].filter(Boolean).join('\n')}${paths}\n</ambientic-context>\n${text}`
}

// Ambientic's own wrapper is not part of what the user asked for. Anything that
// reads a prompt back — thread labels, transcript reconciliation — must strip it
// first, or it reads Ambientic's preamble as if it were the request.
const AMBIENTIC_CONTEXT = /<(?:ambientic|agentbase)-context\b[^>]*>[\s\S]*?<\/(?:ambientic|agentbase)-context>\s*/i

export function stripAmbienticContext (text) {
  const value = String(text || '')
  const stripped = value.replace(AMBIENTIC_CONTEXT, '').trim()
  if (stripped !== value.trim()) return stripped
  // Provider indexes often truncate the first prompt before the closing tag.
  // In that form there is no user request we can safely recover, and treating
  // the remaining preamble as a title produces labels such as
  // "<ambientic-context mode=build> Project context…". Prefer no title so the
  // caller can use a human fallback or another provider preview.
  if (/^\s*<(?:ambientic|agentbase)-context\b/i.test(value)) return ''
  return stripped
}
