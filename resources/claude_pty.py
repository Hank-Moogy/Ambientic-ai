#!/usr/bin/python3
"""Small stdio-to-PTY relay for Ambientic's provider-owned Claude login."""

import fcntl
import os
import pty
import select
import signal
import struct
import sys
import termios


def main():
    if len(sys.argv) < 2:
        raise SystemExit("usage: claude_pty.py command [args...]")

    pid, master = pty.fork()
    if pid == 0:
        os.chdir(os.environ.get("HOME", "/"))
        os.execvpe(sys.argv[1], sys.argv[1:], os.environ)

    # A wide PTY keeps long OAuth URLs intact if Claude prints a manual link.
    # Ambientic still validates required OAuth parameters before opening it.
    fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack("HHHH", 32, 500, 0, 0))

    def terminate(_signum, _frame):
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass

    signal.signal(signal.SIGTERM, terminate)
    signal.signal(signal.SIGINT, terminate)

    stdin_open = True
    while True:
        readers = [master]
        if stdin_open:
            readers.append(sys.stdin.fileno())
        try:
            ready, _, _ = select.select(readers, [], [])
        except InterruptedError:
            continue

        if master in ready:
            try:
                data = os.read(master, 8192)
            except OSError:
                break
            if not data:
                break
            os.write(sys.stdout.fileno(), data)

        if stdin_open and sys.stdin.fileno() in ready:
            data = os.read(sys.stdin.fileno(), 8192)
            if data:
                os.write(master, data)
            else:
                stdin_open = False

    _, status = os.waitpid(pid, 0)
    raise SystemExit(os.waitstatus_to_exitcode(status))


if __name__ == "__main__":
    main()
