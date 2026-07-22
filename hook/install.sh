#!/bin/sh
# Vibe Controller hook installer.
# Registers the lifecycle hook into every coding agent found on this machine:
#   Claude Code (~/.claude/settings.json), Codex CLI (~/.codex/hooks.json),
#   Kimi Code CLI (~/.kimi-code/config.toml).
# Override auto-detection with CC_AGENTS=claude,codex,kimi (comma list).
set -e

command -v python3 >/dev/null 2>&1 || { echo "✗ needs python3 on PATH"; exit 1; }

CC_DIR="$HOME/.claude-controller"
mkdir -p "$CC_DIR"

# Copy the hook next to a stable home so it survives the repo moving.
SRC_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cp "$SRC_DIR/controller-hook.py" "$CC_DIR/hook.py"
chmod +x "$CC_DIR/hook.py"

# ── which agents to hook up ──────────────────────────────────────────────────
if [ -z "${CC_AGENTS:-}" ]; then
  CC_AGENTS=""
  if [ -d "$HOME/.claude" ] || command -v claude >/dev/null 2>&1; then
    CC_AGENTS="claude"
  fi
  if [ -d "$HOME/.codex" ] || command -v codex >/dev/null 2>&1; then
    CC_AGENTS="${CC_AGENTS:+$CC_AGENTS,}codex"
  fi
  if [ -d "${KIMI_CODE_HOME:-$HOME/.kimi-code}" ] || command -v kimi >/dev/null 2>&1; then
    CC_AGENTS="${CC_AGENTS:+$CC_AGENTS,}kimi"
  fi
  [ -n "$CC_AGENTS" ] || CC_AGENTS="claude"
fi

CC_AGENTS="$CC_AGENTS" python3 - <<'PYEOF'
import json, os, shutil

cc_dir = os.path.join(os.path.expanduser("~"), ".claude-controller")
hook = os.path.join(cc_dir, "hook.py")
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
    if added:
        backup(path)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=2)
    return added


def kimi_missing(existing):
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
        missing = kimi_missing(existing)
        if missing:
            backup(cfg)
            blocks = ["\n# Vibe Controller hooks"]
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

print("")
print("✅ installed for: %s" % (", ".join(ok) if ok else "(none — see errors above)"))
print("   restart any running agent sessions to pick up the hooks")
PYEOF
