const PROVIDERS = {
  claude: 'Claude Code',
  codex: 'Codex',
  kimi: 'Kimi Code',
  hermes: 'Hermes'
}

function clean (value, max = 80) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

export function sessionSurface (session) {
  if (session?.term_program === 'codex-desktop' || session?.term_app === 'codex-desktop') return 'Codex Desktop'
  if (session?.agent === 'codex') return 'Codex CLI'
  return PROVIDERS[session?.agent] || clean(session?.agent) || 'Agent'
}

export function meaningfulProject (session) {
  const project = clean(session?.project, 60)
  const cwd = String(session?.terminalCwd || session?.cwd || '').replace(/\/+$/g, '')
  if (!project) return ''

  // A provider launched directly from the user's home folder otherwise turns
  // every card into the macOS account name (for example, "samori").
  if (cwd === `/Users/${project}` || cwd === `/home/${project}`) return ''
  if (/^(session|terminal|shell)$/i.test(project)) return ''
  if (/^v?\d+(?:\.\d+){1,3}(?:[-+][a-z0-9.-]+)?$/i.test(project)) return ''
  return project
}

export function sessionLabels (session) {
  const provider = sessionSurface(session)
  const project = meaningfulProject(session)
  const task = clean(session?.task, 80)

  if (task) {
    return {
      primary: task,
      secondary: project ? `${provider} · ${project}` : provider,
      provider,
      placeholder: false
    }
  }

  return {
    primary: project || provider,
    secondary: project ? provider : 'Terminal session',
    provider,
    placeholder: !project
  }
}
