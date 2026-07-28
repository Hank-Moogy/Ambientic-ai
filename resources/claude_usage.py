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


def tab_navigation_count(text):
    """Return legacy tab moves, or zero when /usage already opens Usage."""
    lower = text.lower()
    if not all(label in lower for label in ("status", "config", "usage")):
        return None
    # Claude 2.1.220 added Stats and opens /usage directly on Usage. The older
    # three-tab Settings screen opened on Status and required two right arrows.
    return 0 if "stats" in lower else 2


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
    opened = submitted = confirmed = usage_tab_selected = False
    usage_tab_steps = 0
    last_tab_step_at = 0.0

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
        screen = clean(bytes(buf[-180_000:]))
        lower = screen.lower()
        # Claude first opens slash-command completion, so `/usage` needs one
        # Enter to select the command and (on current builds) a second Enter to
        # execute it. Legacy Settings opens on Status and needs two right arrows;
        # current four-tab Settings opens /usage directly on Usage.
        if not opened and elapsed > 2.0 and ("❯" in screen or "try \"" in lower):
            os.write(master, b"/usage")
            opened = True
        elif opened and not submitted and ("show plan usage limits" in lower or elapsed > 3.0):
            os.write(master, b"\r")
            submitted = True
        elif submitted and not confirmed and elapsed > 3.7:
            os.write(master, b"\r")
            confirmed = True
        elif confirmed and ("current session" in lower or "current week" in lower) and elapsed > 4.5:
            # Give the final percentages/reset labels a moment to finish drawing.
            time.sleep(0.7)
            try:
                while True:
                    ready, _, _ = select.select([master], [], [], 0.05)
                    if master not in ready:
                        break
                    buf.extend(os.read(master, 65536))
            except OSError:
                pass
            break
        elif confirmed and not usage_tab_selected and tab_navigation_count(screen) == 0:
            # Claude Code 2.1.220+ opens /usage on the Usage tab directly. Its
            # fourth Stats tab makes the older two-arrow workaround wrap through
            # Stats and back to Status, hiding the limits we came to read.
            usage_tab_selected = True
        elif (confirmed and not usage_tab_selected and elapsed > 5.5 and
              tab_navigation_count(screen) == 2):
            # Some Claude builds open Settings on Status even when /usage was
            # requested. Move to Usage one tab at a time: sending both arrows in
            # one write is occasionally coalesced or dropped while the panel is
            # still mounting.
            if usage_tab_steps == 0 or elapsed - last_tab_step_at >= 0.35:
                os.write(master, b"\x1b[C")
                usage_tab_steps += 1
                last_tab_step_at = elapsed
                usage_tab_selected = usage_tab_steps >= 2
        elif confirmed and elapsed > 10.5:
            break

    kill(pid)
    try:
        os.close(master)
    except OSError:
        pass

    windows = parse(clean(bytes(buf)))
    # Do not infer the account type from the words "API usage billing". Current
    # Claude Code versions show that label for optional extra usage on valid Pro
    # accounts too. Only the presence of actual quota windows is authoritative.
    failure = {
        "code": "CLAUDE_USAGE_UNAVAILABLE",
        "error": "Claude /usage opened, but its subscription limit windows did not render.",
        "diagnostic": {
            "commandOpened": opened,
            "commandSubmitted": submitted,
            "commandConfirmed": confirmed,
            "usageTabSelected": usage_tab_selected,
            "usageTabSteps": usage_tab_steps,
            "sawStatus": "status" in lower,
            "sawConfig": "config" in lower,
            "sawUsage": "usage" in lower,
            "sawCurrentSession": "current session" in lower,
            "sawCurrentWeek": "current week" in lower,
            "sawFiveHour": "five hour" in lower or "5-hour" in lower or "5 hour" in lower,
            "sawWeekly": "weekly" in lower or "week" in lower,
            "sawAllModels": "all models" in lower,
            "sawLimit": "limit" in lower,
            "sawResets": "reset" in lower,
            "sawExtraUsage": "extra usage" in lower,
            "sawIncludedUsage": "included usage" in lower,
        },
    }
    print(json.dumps({"plan": "subscription", "windows": windows} if windows else failure))


if __name__ == "__main__":
    main()
