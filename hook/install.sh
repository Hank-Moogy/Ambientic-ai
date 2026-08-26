#!/bin/sh
# Ambientic hook installer.
# Registers the lifecycle hook into every coding agent found on this machine:
#   Claude Code (~/.claude/settings.json), Codex CLI (~/.codex/hooks.json),
#   Kimi Code CLI (~/.kimi-code/config.toml), and Hermes Agent
#   (~/.hermes/plugins/agentbase).
# Override auto-detection with CC_AGENTS=claude,codex,kimi,hermes (comma list).
set -e

command -v python3 >/dev/null 2>&1 || { echo "✗ needs python3 on PATH"; exit 1; }

AMBIENTIC_DIR="$HOME/.ambientic"
mkdir -p "$AMBIENTIC_DIR"

# Copy the hook next to a stable home so it survives the repo moving.
SRC_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cp "$SRC_DIR/controller-hook.py" "$AMBIENTIC_DIR/hook.py"
chmod +x "$AMBIENTIC_DIR/hook.py"
cp "$SRC_DIR/claude-statusline.py" "$AMBIENTIC_DIR/claude-statusline.py"
chmod +x "$AMBIENTIC_DIR/claude-statusline.py"

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
  # the personal Ambientic setup is intentionally Claude + Codex + Hermes.
  if [ -d "$HOME/.hermes" ] || /bin/zsh -lic 'command -v hermes >/dev/null 2>&1'; then
    CC_AGENTS="${CC_AGENTS:+$CC_AGENTS,}hermes"
  fi
  [ -n "$CC_AGENTS" ] || CC_AGENTS="claude"
fi

CC_AGENTS="$CC_AGENTS" python3 - <<'PYEOF'
import json, os, shutil

ambientic_dir = os.path.join(os.path.expanduser("~"), ".ambientic")
hook = os.path.join(ambientic_dir, "hook.py")
claude_statusline = os.path.join(ambientic_dir, "claude-statusline.py")
legacy_hooks = [
    os.path.join(os.path.expanduser("~"), ".agentbase", "hook.py"),
    os.path.join(os.path.expanduser("~"), ".claude-controller", "hook.py"),
]
legacy_statuslines = [
    os.path.join(os.path.expanduser("~"), ".agentbase", "claude-statusline.py"),
]
quoted = '"%s"' % hook

agents = [a.strip().lower() for a in os.environ.get("CC_AGENTS", "claude").split(",") if a.strip()]

# Common lifecycle events consumed across providers. Claude receives two extra,
# narrowly-scoped attention hooks below so approvals and questions turn red at
# the moment its UI blocks for the user.
EVENTS = ["SessionStart", "UserPromptSubmit", "PostToolUse", "Notification",
          "Stop", "SessionEnd"]
CLAUDE_ATTENTION_HOOKS = [
    ("PermissionRequest", None),
    # Every tool, not just the two that block for input: Ambientic answers
    # PreToolUse to broker file and shell access for managed threads. Sessions
    # it does not manage get an immediate empty answer and are unaffected.
    ("PreToolUse", None),
]


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
            for legacy_hook in legacy_hooks:
                value = value.replace(legacy_hook, hook)
            for legacy_statusline in legacy_statuslines:
                value = value.replace(legacy_statusline, claude_statusline)
            return value
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


def add_claude_attention_hooks(path, cmd):
    """Install Claude-only immediate attention signals without putting the
    Ambientic hook in front of every ordinary tool call."""
    with open(path, encoding="utf-8") as f:
        settings = json.load(f)
    hooks = settings.setdefault("hooks", {})
    changed = 0
    # These wait on a person, so they need far longer than the default hook
    # timeout and a line explaining why the agent has stopped.
    waits_for_user = {"PermissionRequest", "PreToolUse"}
    for event, matcher in CLAUDE_ATTENTION_HOOKS:
        groups = hooks.setdefault(event, [])
        if not isinstance(groups, list):
            continue
        # Earlier versions registered PreToolUse only for the two tools that
        # block for input. Widen that group in place rather than adding a second
        # one, which would run the hook twice for those tools.
        if matcher is None:
            for group in groups:
                if not isinstance(group, dict) or "matcher" not in group:
                    continue
                if any(isinstance(item, dict) and hook in str(item.get("command", ""))
                       for item in (group.get("hooks") if isinstance(group.get("hooks"), list) else [])):
                    del group["matcher"]
                    changed += 1
        # Match the intended matcher exactly: a group scoped to some tools is
        # not the same registration as one that covers all of them.
        existing = next((
            item
            for group in groups if isinstance(group, dict) and group.get("matcher") == matcher
            for item in (group.get("hooks") if isinstance(group.get("hooks"), list) else [])
            if isinstance(item, dict) and hook in str(item.get("command", ""))
        ), None)
        if existing:
            if event in waits_for_user:
                if existing.get("timeout") != 600:
                    existing["timeout"] = 600
                    changed += 1
                if existing.get("statusMessage") != "Waiting for approval in Ambientic…":
                    existing["statusMessage"] = "Waiting for approval in Ambientic…"
                    changed += 1
            continue
        hook_spec = {"type": "command", "command": cmd}
        if event in waits_for_user:
            hook_spec["timeout"] = 600
            hook_spec["statusMessage"] = "Waiting for approval in Ambientic…"
        group = {"hooks": [hook_spec]}
        if matcher is not None:
            group["matcher"] = matcher
        groups.append(group)
        changed += 1
    if changed:
        backup(path)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=2)
    return changed


def kimi_missing(existing):
    for legacy_hook in legacy_hooks:
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
        claude_settings_path = os.path.expanduser("~/.claude/settings.json")
        add_json_hooks(claude_settings_path, quoted)
        add_claude_attention_hooks(claude_settings_path, quoted)
        with open(claude_settings_path, encoding="utf-8") as f:
            claude_settings = json.load(f)
        current_statusline = claude_settings.get("statusLine")
        if current_statusline is None:
            claude_settings["statusLine"] = {
                "type": "command",
                "command": '"%s"' % claude_statusline,
            }
            backup(claude_settings_path)
            with open(claude_settings_path, "w", encoding="utf-8") as f:
                json.dump(claude_settings, f, indent=2)
            statusline_note = "quota bridge installed"
        elif (isinstance(current_statusline, dict) and
              claude_statusline in str(current_statusline.get("command", ""))):
            statusline_note = "quota bridge active"
        else:
            statusline_note = "existing status line preserved; quota bridge skipped"
        print("  ✓ Claude Code — ~/.claude/settings.json (%s)" % statusline_note)
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
        migrated = existing
        for legacy_hook in legacy_hooks:
            migrated = migrated.replace(legacy_hook, hook)
        if migrated != existing:
            backup(cfg)
            with open(cfg, "w", encoding="utf-8") as f:
                f.write(migrated)
            existing = migrated
        missing = kimi_missing(existing)
        if missing:
            backup(cfg)
            blocks = ["\n# Ambientic hooks"]
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
            raise RuntimeError("Ambientic Hermes plugin was not copied")
        print("  ✓ Hermes — ~/.hermes/plugins/agentbase")
        ok.append("hermes")
    except Exception as e:
        print("  ✗ Hermes — %s" % e)

print("")
print("✅ installed for: %s" % (", ".join(ok) if ok else "(none — see errors above)"))
print("   restart any running agent sessions to pick up the hooks")
PYEOF

# Enabling through Hermes' own CLI lets Hermes update its YAML configuration
# without Ambientic attempting to parse or rewrite unrelated user settings.
if printf '%s' "$CC_AGENTS" | grep -q 'hermes' && /bin/zsh -lic 'command -v hermes >/dev/null 2>&1'; then
  /bin/zsh -lic 'hermes plugins enable agentbase' >/dev/null 2>&1 || true
fi
