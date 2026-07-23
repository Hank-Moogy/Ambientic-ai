#!/bin/sh
# AgentBase hook installer.
# Registers the lifecycle hook into every coding agent found on this machine:
#   Claude Code (~/.claude/settings.json), Codex CLI (~/.codex/hooks.json),
#   Kimi Code CLI (~/.kimi-code/config.toml), and Hermes Agent
#   (~/.hermes/plugins/agentbase).
# Override auto-detection with CC_AGENTS=claude,codex,kimi,hermes (comma list).
set -e

command -v python3 >/dev/null 2>&1 || { echo "✗ needs python3 on PATH"; exit 1; }

AGENTBASE_DIR="$HOME/.agentbase"
mkdir -p "$AGENTBASE_DIR"

# Copy the hook next to a stable home so it survives the repo moving.
SRC_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cp "$SRC_DIR/controller-hook.py" "$AGENTBASE_DIR/hook.py"
chmod +x "$AGENTBASE_DIR/hook.py"

# Hermes loads a small, explicit local plugin so its native lifecycle callbacks
# feed the same normalized hook used by Claude and Codex.
mkdir -p "$HOME/.hermes/plugins/agentbase"
cp "$SRC_DIR/hermes-plugin/plugin.yaml" "$HOME/.hermes/plugins/agentbase/plugin.yaml"
cp "$SRC_DIR/hermes-plugin/__init__.py" "$HOME/.hermes/plugins/agentbase/__init__.py"

# ── which agents to hook up ──────────────────────────────────────────────────
if [ -z "${CC_AGENTS:-}" ]; then
  CC_AGENTS=""
  if [ -d "$HOME/.claude" ] || command -v claude >/dev/null 2>&1; then
    CC_AGENTS="claude"
  fi
  if [ -d "$HOME/.codex" ] || command -v codex >/dev/null 2>&1; then
    CC_AGENTS="${CC_AGENTS:+$CC_AGENTS,}codex"
  fi
  # Kimi remains supported when explicitly requested through CC_AGENTS, but
  # the personal AgentBase setup is intentionally Claude + Codex + Hermes.
  if [ -d "$HOME/.hermes" ] || /bin/zsh -lic 'command -v hermes >/dev/null 2>&1'; then
    CC_AGENTS="${CC_AGENTS:+$CC_AGENTS,}hermes"
  fi
  [ -n "$CC_AGENTS" ] || CC_AGENTS="claude"
fi

CC_AGENTS="$CC_AGENTS" python3 - <<'PYEOF'
import json, os, shutil

agentbase_dir = os.path.join(os.path.expanduser("~"), ".agentbase")
hook = os.path.join(agentbase_dir, "hook.py")
legacy_hook = os.path.join(os.path.expanduser("~"), ".claude-controller", "hook.py")
quoted = '"%s"' % hook

agents = [a.strip().lower() for a in os.environ.get("CC_AGENTS", "claude").split(",") if a.strip()]

# Events the controller consumes. PreToolUse is intentionally NOT registered —
# UserPromptSubmit turns the pad green and PostToolUse keeps it green, so we
# avoid putting a hook on the front of every single tool call.
EVENTS = ["SessionStart", "UserPromptSubmit", "PostToolUse", "Notification",
          "Stop", "SessionEnd"]


def backup(path):
    if os.path.exists(path) and not os.path.exists(path + ".cc-backup"):
        shutil.copy(path, path + ".cc-backup")


def add_json_hooks(path, cmd):
    """Merge into a Claude-style hooks JSON file (Claude settings.json and
    Codex hooks.json share this shape)."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    settings = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            settings = json.load(f)  # raises on bad JSON — we won't clobber it
    original = settings
    def migrate(value):
        if isinstance(value, dict):
            return {k: migrate(v) for k, v in value.items()}
        if isinstance(value, list):
            return [migrate(v) for v in value]
        if isinstance(value, str):
            return value.replace(legacy_hook, hook)
        return value
    settings = migrate(settings)
    migrated = settings != original
    hooks = settings.setdefault("hooks", {})
    if not isinstance(hooks, dict):
        raise RuntimeError('"hooks" is not an object — fix %s and re-run' % path)
    added = 0
    for ev in EVENTS:
        groups = hooks.setdefault(ev, [])
        if not isinstance(groups, list):
            continue
        already = any(
            hook in str(h.get("command", ""))
            for g in groups if isinstance(g, dict)
            for h in (g.get("hooks") if isinstance(g.get("hooks"), list) else [])
            if isinstance(h, dict)
        )
        if not already:
            groups.append({"hooks": [{"type": "command", "command": cmd}]})
            added += 1
    if added or migrated:
        backup(path)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=2)
    return added


def kimi_missing(existing):
    existing = existing.replace(legacy_hook, hook)
    try:
        import tomllib
        ours = {h.get("event") for h in tomllib.loads(existing).get("hooks", [])
                if hook in str(h.get("command", ""))}
    except Exception:
        ours = set()
        for chunk in existing.split("[[hooks]]"):
            if hook not in chunk:
                continue
            for ev in EVENTS:
                if ('event = "%s"' % ev) in chunk or ("event = '%s'" % ev) in chunk:
                    ours.add(ev)
    return [ev for ev in EVENTS if ev not in ours]


ok = []

if "claude" in agents:
    try:
        add_json_hooks(os.path.expanduser("~/.claude/settings.json"), quoted)
        print("  ✓ Claude Code — ~/.claude/settings.json")
        ok.append("claude")
    except Exception as e:
        print("  ✗ Claude Code — %s" % e)

if "codex" in agents:
    try:
        add_json_hooks(os.path.expanduser("~/.codex/hooks.json"), quoted + " --agent codex")
        print("  ✓ Codex CLI — ~/.codex/hooks.json")
        ok.append("codex")
    except Exception as e:
        print("  ✗ Codex CLI — %s" % e)

if "kimi" in agents:
    try:
        home = os.environ.get("KIMI_CODE_HOME") or os.path.expanduser("~/.kimi-code")
        cfg = os.path.join(home, "config.toml")
        os.makedirs(home, exist_ok=True)
        existing = ""
        if os.path.exists(cfg):
            with open(cfg, encoding="utf-8") as f:
                existing = f.read()
        migrated = existing.replace(legacy_hook, hook)
        if migrated != existing:
            backup(cfg)
            with open(cfg, "w", encoding="utf-8") as f:
                f.write(migrated)
            existing = migrated
        missing = kimi_missing(existing)
        if missing:
            backup(cfg)
            blocks = ["\n# AgentBase hooks"]
            for ev in missing:
                blocks.append("\n[[hooks]]\nevent = \"%s\"\ncommand = '%s --agent kimi'\ntimeout = 5"
                              % (ev, hook))
            with open(cfg, "a", encoding="utf-8") as f:
                if existing and not existing.endswith("\n"):
                    f.write("\n")
                f.write("\n".join(blocks) + "\n")
            print("  ✓ Kimi Code — %s" % cfg)
        else:
            print("  ✓ Kimi Code — already registered")
        ok.append("kimi")
    except Exception as e:
        print("  ✗ Kimi Code — %s" % e)

if "hermes" in agents:
    try:
        plugin = os.path.expanduser("~/.hermes/plugins/agentbase/plugin.yaml")
        if not os.path.exists(plugin):
            raise RuntimeError("AgentBase Hermes plugin was not copied")
        print("  ✓ Hermes — ~/.hermes/plugins/agentbase")
        ok.append("hermes")
    except Exception as e:
        print("  ✗ Hermes — %s" % e)

print("")
print("✅ installed for: %s" % (", ".join(ok) if ok else "(none — see errors above)"))
print("   restart any running agent sessions to pick up the hooks")
PYEOF

# Enabling through Hermes' own CLI lets Hermes update its YAML configuration
# without AgentBase attempting to parse or rewrite unrelated user settings.
if printf '%s' "$CC_AGENTS" | grep -q 'hermes' && /bin/zsh -lic 'command -v hermes >/dev/null 2>&1'; then
  /bin/zsh -lic 'hermes plugins enable agentbase' >/dev/null 2>&1 || true
fi
