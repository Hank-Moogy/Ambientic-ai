#!/usr/bin/env python3
"""Capture Claude Code subscription limits for AgentBase.

Claude invokes status-line commands with a JSON snapshot on stdin after agent
activity. Only the normalized rate-limit fields are persisted; prompts,
messages, credentials, and the rest of Claude's status payload are discarded.
The command intentionally prints nothing so it does not add a visible status
line when the user did not already configure one.
"""
import json
import os
from pathlib import Path
import tempfile
import time


TARGET = Path.home() / ".agentbase" / "claude-usage.json"


def normalize_window(rate_limits, key, window_id, label, period, duration):
    value = rate_limits.get(key)
    if not isinstance(value, dict):
        return None
    used = value.get("used_percentage")
    if not isinstance(used, (int, float)):
        return None
    reset_at = value.get("resets_at")
    return {
        "id": window_id,
        "label": label,
        "period": period,
        "durationMins": duration,
        "usedPercent": max(0, min(100, float(used))),
        "resetAt": int(reset_at) if isinstance(reset_at, (int, float)) else None,
        "resetText": None,
    }


def main():
    try:
        payload = json.load(__import__("sys").stdin)
        rate_limits = payload.get("rate_limits")
        if not isinstance(rate_limits, dict):
            return
        windows = [
            normalize_window(rate_limits, "five_hour", "five-hour",
                             "All models", "short", 300),
            normalize_window(rate_limits, "seven_day", "seven-day",
                             "All models", "week", 7 * 24 * 60),
        ]
        windows = [window for window in windows if window]
        if not windows:
            return

        TARGET.parent.mkdir(parents=True, exist_ok=True)
        document = {
            "version": 1,
            "provider": "claude",
            "observedAt": int(time.time() * 1000),
            "plan": "subscription",
            "windows": windows,
        }
        fd, temporary = tempfile.mkstemp(
            prefix=".claude-usage-", suffix=".json", dir=str(TARGET.parent)
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(document, handle, separators=(",", ":"))
            os.replace(temporary, TARGET)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    except Exception:
        # A status line must never interfere with a Claude session.
        return


if __name__ == "__main__":
    main()
