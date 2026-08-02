export function assembleProviderPrompt (text, { mode = 'build', attachments = [], projectContext = null } = {}) {
  const guidance = mode === 'plan'
    ? 'Planning mode: inspect and reason, but do not modify files or run destructive commands. Return a concise implementation plan.'
    : mode === 'ask'
        ? 'Ask mode: answer and explain only. Do not modify files or run destructive commands.'
        : ''
  const project = projectContext
    ? `Project context: you are working on ${projectContext.name || 'this project'} at ${projectContext.cwd}. Treat that directory as the project root. Before changing files, orient yourself by reading the nearest AGENTS.md and relevant README or project manifests, then inspect the current working tree. Do not treat this as an empty scratch workspace.`
    : ''
  if (!guidance && !attachments.length && !project) return text
  const paths = attachments.length
    ? `\nAttached local context:\n${attachments.map((item) => `- ${item.kind}: ${item.path}`).join('\n')}`
    : ''
  return `<ambientic-context mode="${mode}">\n${[guidance, project].filter(Boolean).join('\n')}${paths}\n</ambientic-context>\n${text}`
}
