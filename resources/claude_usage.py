#!/usr/bin/python3
"""Scrape Claude Code's interactive /usage panel into JSON for Ambientic.

Claude Code exposes subscription limits (5-hour session + weekly windows) only
through the interactive `/usage` TUI — never through `claude -p`, the status
line, or any cache file. This helper runs Claude in a pseudo-terminal, opens
/usage, reads the rendered percentages and reset times, and prints JSON. It uses
only the Python standard library (no dependencies).

Usage: claude_usage.py <claude-binary> [cwd]
Prints: {"plan":"subscription","windows":[...]} or {"error":"..."}
Reset strings are emitted verbatim; the Node side turns them into timestamps.
"""

import fcntl
import json
import os
import pty
import re
import select
import signal
import struct
import sys
import termios
import time

# Strip ANSI escapes and control bytes so the panel text is searchable.
ANSI = re.compile(rb"\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*(?:\x07|\x1b\\)|\x1b[=>()][A-Za-z0-9]?|[\x00-\x08\x0b-\x1f]")


def clean(raw):
    text = ANSI.sub(b" ", raw).decode("utf-8", "replace")
    # Drop the block-drawing bar glyphs, then collapse whitespace. All bounded.
    text = re.sub(r"[▀-▟─-╿]+", " ", text)
    return re.sub(r"\s+", " ", text)


def _pct_after(text, label):
    i = text.lower().find(label)
    if i < 0:
        return None
    # Search only a small bounded window after the label — no backtracking.
    m = re.search(r"(\d{1,3})% used", text[i:i + 220])
    return int(m.group(1)) if m else None


# The reset value follows "% used". The literal word "Resets" is unreliable —
# the TUI sometimes repositions the cursor mid-word, so ANSI stripping leaves
# "Rese s". Key off the time itself instead ("7:09pm (Tz)" or "Jul 30 at 4:59am
# (Tz)"). All quantifiers are bounded so there is no catastrophic backtracking.
_RESET = re.compile(r"(\d{1,2}:\d{2}\s*[ap]m|[A-Z][a-z]{2}\s+\d{1,2}\b)[\s\S]{0,30}?\([^)]{1,40}\)", re.I)


def _reset_after(text, label):
    i = text.lower().find(label)
    if i < 0:
        return ""
    seg = text[i:i + 320]
    j = seg.find("% used")
    if j < 0:
        return ""
    tail = seg[j + 6:]
    for keyword in ("Current ", "Extra ", "Esc "):  # stop before the next section
        cut = tail.find(keyword)
        if cut >= 0:
            tail = tail[:cut]
    m = _RESET.search(tail)
    return m.group(0).strip() if m else ""


def parse(text):
    windows = []
    session = _pct_after(text, "current session")
    if session is not None:
        windows.append({
            "id": "five-hour", "label": "Current session", "period": "short",
            "durationMins": 300, "usedPercent": session,
            "resetText": _reset_after(text, "current session"),
        })
    week = _pct_after(text, "current week")
    if week is not None:
        windows.append({
            "id": "seven-day", "label": "all models", "period": "week",
            "durationMins": 7 * 24 * 60, "usedPercent": week,
            "resetText": _reset_after(text, "current week"),
        })
    return windows


def kill(pid):
    for target in (lambda: os.killpg(os.getpgid(pid), signal.SIGKILL),
                   lambda: os.kill(pid, signal.SIGKILL)):
        try:
            target()
            return
        except (ProcessLookupError, OSError):
            continue


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: claude_usage.py <claude> [cwd]"}))
        return
    claude = sys.argv[1]
    cwd = sys.argv[2] if len(sys.argv) > 2 and os.path.isdir(sys.argv[2]) else os.environ.get("HOME", "/")

    pid, master = pty.fork()
    if pid == 0:  # child becomes its own session leader (pty.fork calls setsid)
        os.chdir(cwd)
        os.environ["TERM"] = "xterm-256color"
        os.execvpe(claude, [claude], os.environ)
    fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack("HHHH", 50, 140, 0, 0))

    buf = bytearray()
    start = time.time()
    opened = submitted = False

    while time.time() - start < 12:
        try:
            ready, _, _ = select.select([master], [], [], 0.2)
        except InterruptedError:
            continue
        if master in ready:
            try:
                data = os.read(master, 65536)
            except OSError:
                break
            if not data:
                break
            buf.extend(data)
            if len(buf) > 400_000:  # keep only the recent screen state; bound regex cost
                del buf[:-300_000]
        elapsed = time.time() - start
        # The TUI needs a few seconds before it accepts input. Type /usage, then
        # submit it a beat later, then let the panel render.
        if not opened and elapsed > 5:
            os.write(master, b"/usage")
            opened = True
        elif opened and not submitted and elapsed > 6:
            os.write(master, b"\r")
            submitted = True
        elif submitted and elapsed > 8.5:
            break

    kill(pid)
    try:
        os.close(master)
    except OSError:
        pass

    windows = parse(clean(bytes(buf)))
    print(json.dumps({"plan": "subscription", "windows": windows} if windows
                     else {"error": "Claude /usage panel did not render any limits"}))


if __name__ == "__main__":
    main()
