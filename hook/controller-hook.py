#!/usr/bin/env python3
"""Ambientic hook — Claude Code, Codex CLI, Kimi, and Hermes.

All three CLIs fire near-identical lifecycle hooks with JSON on stdin. This
script maps each event to a pad state and fires a detached, best-effort curl to
the local controller (127.0.0.1:47600). It NEVER blocks or fails the agent
session: on any error it simply exits 0.

Registered per agent via install.sh with `--agent claude|codex|kimi`.
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

PORT = int(os.environ.get("AMBIENTIC_PORT", os.environ.get("AGENTBASE_PORT", os.environ.get("CLAUDE_CONTROLLER_PORT", "47600"))))
URL = "http://127.0.0.1:%d/event" % PORT

# Lifecycle event name -> canonical pad event the controller understands.
EVENT_MAP = {
    "SessionStart": "session_start",
    "UserPromptSubmit": "prompt",
    "PostToolUse": "tool",
    "Notification": "notification",
    "PermissionRequest": "notification",
    "Stop": "stop",
    "SessionEnd": "session_end",
    # Hermes plugin hook names. Hermes fires on_session_end after every turn;
    # on_session_finalize is the actual lifecycle end for the terminal session.
    "on_session_start": "session_start",
    "pre_llm_call": "prompt",
    "post_tool_call": "tool",
    "pre_approval_request": "notification",
    "on_session_end": "stop",
    "on_session_finalize": "session_end",
}

# Claude's PermissionRequest hook fires as soon as an approval dialog appears.
# AskUserQuestion is different: it is a tool invocation that blocks for a human
# response, so Ambientic installs a narrow PreToolUse matcher for that tool.
# Ignore any unmatched PreToolUse event in case another integration invokes the
# shared hook without the matcher.
CLAUDE_INPUT_TOOLS = {"AskUserQuestion", "ExitPlanMode"}


def event_for_hook(hook):
    name = hook.get("hook_event_name", "")
    if name == "PreToolUse":
        return "notification" if hook.get("tool_name") in CLAUDE_INPUT_TOOLS else None
    return EVENT_MAP.get(name)

# Terminal GUI apps we walk the process tree looking for (comm -> app label).
TERMINALS = {
    "iterm2": "iTerm.app",
    "iterm": "iTerm.app",
    "terminal": "Apple_Terminal",
    "wezterm-gui": "WezTerm",
    "wezterm": "WezTerm",
    "kitty": "kitty",
    "alacritty": "Alacritty",
    "warp": "Warp",
    "warpterminal": "Warp",
    "hyper": "Hyper",
    "tabby": "Tabby",
    "electron": "vscode",  # VS Code integrated terminal
    "code helper": "vscode",
    "code": "vscode",
}

# Agent CLIs sometimes mix system reminders and background task notifications
# into UserPromptSubmit. Keep only the human-authored prompt before sending it
# to the local controller for its short task label.
META_BLOCK = re.compile(
    r"<(system-reminder|task-notification|local-command-caveat|"
    r"local-command-stdout|command-message|command-args|"
    r"ambientic-context|agentbase-context)(?=[\s/>])[^>]*>.*?</\1>",
    re.DOTALL,
)
META_OPEN = re.compile(
    r"<(system-reminder|task-notification|local-command-caveat|"
    r"local-command-stdout|ambientic-context|agentbase-context)(?=[\s/>])[^>]*>.*",
    re.DOTALL,
)
CMD_NAME = re.compile(r"<command-name>\s*(.*?)\s*</command-name>", re.DOTALL)
SYS_NOTICE = re.compile(r"\[SYSTEM NOTIFICATION[^\]]*\][\s\S]*", re.IGNORECASE)
HARNESS_NOTE = re.compile(r"^\s*\[harness:[^\]]*\]\s*", re.IGNORECASE)


def clean_prompt(text):
    if not text:
        return ""
    value = CMD_NAME.sub(lambda match: match.group(1), text)
    value = SYS_NOTICE.sub("", value)
    value = META_BLOCK.sub("", value)
    value = META_OPEN.sub("", value)
    value = HARNESS_NOTE.sub("", value)
    return value.strip()


def prompt_text(hook):
    """Claude/Codex use a string; Kimi may provide text content blocks."""
    for key in ("prompt", "text", "user_message", "message"):
        value = hook.get(key)
        if isinstance(value, list):
            value = "\n".join(
                block.get("text", "") for block in value
                if isinstance(block, dict) and block.get("type") == "text"
            )
        if isinstance(value, str) and value.strip():
            return clean_prompt(value)
    return ""


def _ps(pid):
    """Return (ppid, comm) for a pid, or None."""
    try:
        out = subprocess.run(
            ["ps", "-o", "ppid=,comm=", "-p", str(pid)],
            capture_output=True, text=True, timeout=2,
        ).stdout.strip()
        if not out:
            return None
        ppid_str, _, comm = out.partition(" ")
        return int(ppid_str), comm.strip()
    except Exception:
        return None


def terminal_info(agent_pid):
    """Walk up from the agent process to find the owning terminal app + tty."""
    info = {"term_pid": None, "term_app": "", "tty": ""}
    # tty of the agent process (its controlling terminal).
    try:
        tty = subprocess.run(
            ["ps", "-o", "tty=", "-p", str(agent_pid)],
            capture_output=True, text=True, timeout=2,
        ).stdout.strip()
        if tty and tty not in ("??", "-"):
            info["tty"] = tty
    except Exception:
        pass

    pid = agent_pid
    for _ in range(24):  # bounded walk up the tree
        row = _ps(pid)
        if not row:
            break
        ppid, comm = row
        base = os.path.basename(comm).lower()
        if base in TERMINALS:
            info["term_pid"] = pid
            info["term_app"] = TERMINALS[base]
            break
        if ppid <= 1 or ppid == pid:
            break
        pid = ppid
    return info


def post(body):
    """Fire-and-forget: detached curl, short timeout, no output, never waits."""
    try:
        subprocess.Popen(
            ["curl", "-m", "2", "-s", "-o", "/dev/null", "-X", "POST",
             "-H", "Content-Type: application/json", "-d", body, URL],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    except Exception:
        pass


def request_permission(body):
    """Wait for an Ambientic approval decision.

    PermissionRequest hooks are allowed to return a structured decision to
    Claude. If Ambientic is unavailable or the request expires, return nothing
    so Claude falls back to its own native permission dialog.
    """
    try:
        request = urllib.request.Request(
            URL.replace("/event", "/approval/claude"),
            data=body.encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=590) as response:
            value = json.loads(response.read(256 * 1024).decode("utf-8"))
            return value if isinstance(value, dict) else None
    except Exception:
        return None


def main(agent):
    try:
        hook = json.load(sys.stdin)
    except Exception:
        return

    event = event_for_hook(hook)
    if not event:
        return

    cwd = hook.get("cwd") or os.getcwd()
    payload = {
        "event": event,
        "agent": agent,
        "session_id": (hook.get("session_id") or "")[:120],
        "cwd": cwd,
        "project": os.path.basename(cwd.rstrip("/")) or cwd,
        "term_program": os.environ.get("TERM_PROGRAM", ""),
        "transcript_path": str(hook.get("transcript_path") or "")[:1000],
        "ts": int(time.time() * 1000),
    }

    # Resolve the owning terminal (a few fast `ps` calls, ~15ms). Done on every
    # event — a pad first seen via a PostToolUse still needs its pid so clicking
    # it can jump to the window. The cost is negligible next to a real tool call.
    info = terminal_info(os.getppid())
    payload.update(info)
    payload["agent_pid"] = os.getppid()

    # Only new human prompts trigger the tiny OpenRouter summarizer. Tool events
    # never do, which keeps both latency and cost effectively zero.
    if event == "prompt":
        task = prompt_text(hook)
        if task:
            payload["task_text"] = task[:4000]

    # A short reason on Stop/Notification makes the pad tooltip useful.
    if event == "stop":
        msg = hook.get("last_assistant_message") or hook.get("response")
        if isinstance(msg, str) and msg.strip():
            payload["summary"] = msg.strip()[:180]
    elif event == "notification":
        msg = (hook.get("message") or hook.get("description") or
               hook.get("command") or hook.get("tool_name"))
        if isinstance(msg, str) and msg.strip():
            payload["summary"] = msg.strip()[:180]

    if hook.get("hook_event_name") == "PermissionRequest":
        payload["tool_name"] = str(hook.get("tool_name") or "")[:200]
        payload["tool_input"] = hook.get("tool_input") if isinstance(hook.get("tool_input"), dict) else {}
        payload["permission_suggestions"] = hook.get("permission_suggestions") if isinstance(hook.get("permission_suggestions"), list) else []
        decision = request_permission(json.dumps(payload))
        if decision:
            print(json.dumps(decision))
        return

    post(json.dumps(payload))


def parse_agent(argv):
    agent = "claude"
    i = 1
    while i < len(argv):
        if argv[i] == "--agent" and i + 1 < len(argv):
            agent = argv[i + 1]
            i += 2
        elif argv[i].startswith("--agent="):
            agent = argv[i].split("=", 1)[1]
            i += 1
        else:
            i += 1
    return agent


if __name__ == "__main__":
    try:
        main(parse_agent(sys.argv))
    except Exception:
        pass
    sys.exit(0)
