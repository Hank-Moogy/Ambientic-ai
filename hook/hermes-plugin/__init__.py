"""Hermes lifecycle bridge for the local Ambientic app."""
import json
from pathlib import Path
import subprocess
import sys

HOOK = Path.home() / ".ambientic" / "hook.py"


def _callback(event_name):
    def emit(*args, **kwargs):
        del args
        if not HOOK.exists():
            return
        payload = dict(kwargs)
        payload["hook_event_name"] = event_name
        try:
            subprocess.Popen(
                [sys.executable, str(HOOK), "--agent", "hermes"],
                stdin=subprocess.PIPE,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            ).communicate(json.dumps(payload, default=str).encode("utf-8"), timeout=1)
        except Exception:
            pass
    return emit


def register(ctx):
    for event_name in (
        "on_session_start",
        "pre_llm_call",
        "post_tool_call",
        "pre_approval_request",
        "on_session_end",
        "on_session_finalize",
    ):
        ctx.register_hook(event_name, _callback(event_name))
