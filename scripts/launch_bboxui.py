#!/usr/bin/env python3
"""Launch bbox-ui: three separate things, kept separate (Zach, 2026-09-12).

  Stable   default. A pinned local build. Never changes until you promote.
  Preview  --preview. A real local `next dev` server with HMR, showing
           whatever is on this checkout's disk right now — committed or not.
  Remote   --remote. The actual deployed https://bbox-ui.com, which
           redeploys itself on every push to `main` (Cloudflare Workers
           Builds). No local state at all.

Copied from SystemSketch's Stable/Preview desktop launcher
(scripts/launch_systemsketch.py). "Promote" (--promote, or the badge in the
Stable window) snapshots whatever Preview's tree currently has — see
bbox_release.py's module docstring for why that's a snapshot of the live
checkout, not a resolved git ref.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from bbox_release import (
    DEPLOYED_URL,
    PREVIEW_PORT,
    PRODUCT,
    PROJECT_ROOT,
    ReleaseError,
    default_release_home,
    default_state_home,
    ensure_preview_server,
    port_responds,
    promote,
    read_channels,
    read_pid,
    rollback,
    spawn_logged,
    stop_pid,
    write_pid,
)


SCRIPTS_DIR = Path(__file__).resolve().parent
STABLE_PORT = int(os.environ.get("BBOXUI_STABLE_PORT", "5194"))


# --------------------------------------------------------------------- Stable

def health(port: int, timeout: float = 1.2) -> dict | None:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=timeout) as response:
            payload = json.load(response)
    except (OSError, ValueError, urllib.error.URLError):
        return None
    if not isinstance(payload, dict) or payload.get("product") != PRODUCT:
        return None
    return payload


def wait_for_health(port: int, channel: str, timeout: float = 20.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        payload = health(port)
        if payload and payload.get("channel") == channel:
            return payload
        time.sleep(0.2)
    raise ReleaseError(f"bbox-ui {channel} did not become healthy on port {port}")


def build_release(release_home: Path) -> tuple[str, dict]:
    return promote(release_home, PROJECT_ROOT)


def ensure_stable_server(release_home: Path, state_home: Path) -> tuple[str, dict]:
    channels = read_channels(release_home)
    if channels.stable is None:
        print("bbox-ui: no Stable snapshot yet — building apps/docs from this checkout...")
        build_release(release_home)
        channels = read_channels(release_home)

    pid_path = state_home / "stable" / "server.pid"
    current = health(STABLE_PORT)
    if current:
        if current.get("channel") != "stable":
            raise ReleaseError(f"port {STABLE_PORT} is occupied by another bbox-ui channel")
        if current.get("build") == channels.stable:
            return f"http://127.0.0.1:{STABLE_PORT}/", current
        if read_pid(pid_path) is None:
            raise ReleaseError(
                f"Stable build {current.get('build')} is outdated but its server is not owned by this launcher"
            )
        stop_pid(pid_path)
        if health(STABLE_PORT, timeout=0.4) is not None:
            raise ReleaseError(f"outdated Stable server on port {STABLE_PORT} did not stop")
    elif health(STABLE_PORT, timeout=0.2) is not None:
        raise ReleaseError(f"port {STABLE_PORT} is already occupied")

    pid = spawn_logged(
        [
            sys.executable,
            str(SCRIPTS_DIR / "bboxui_server.py"),
            "--port", str(STABLE_PORT),
            "--release-home", str(release_home),
            "--state-home", str(state_home),
            "--build", channels.stable,
            "--channel", "stable",
        ],
        cwd=SCRIPTS_DIR,
        log=state_home / "stable" / "server.log",
    )
    write_pid(pid_path, pid)
    return f"http://127.0.0.1:{STABLE_PORT}/", wait_for_health(STABLE_PORT, "stable")


# ----------------------------------------------------------------- Chrome app

def chrome_executable() -> str | None:
    for candidate in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
        executable = shutil.which(candidate)
        if executable:
            return executable
    return None


def focus_existing(app_id: str) -> bool:
    xdotool = shutil.which("xdotool")
    if not xdotool or not os.environ.get("DISPLAY"):
        return False
    result = subprocess.run(
        [xdotool, "search", "--onlyvisible", "--class", f"^{re.escape(app_id)}$"],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return False
    for window_id in reversed(result.stdout.split()):
        subprocess.run([xdotool, "windowactivate", window_id], check=False)
        return True
    return False


def open_app(url: str, profile_dir: Path, app_id: str) -> None:
    if focus_existing(app_id):
        return
    chrome = chrome_executable()
    if chrome is None:
        raise ReleaseError("Google Chrome or Chromium is required for the desktop window")
    profile_dir.mkdir(parents=True, exist_ok=True)
    subprocess.Popen(
        [
            chrome,
            f"--app={url}",
            f"--class={app_id}",
            f"--name={app_id}",
            f"--user-data-dir={profile_dir}",
            "--no-first-run",
            "--no-default-browser-check",
            "--window-size=1440,960",
        ],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
        close_fds=True,
    )


# --------------------------------------------------------------------- CLI

def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release-home", type=Path, default=None)
    parser.add_argument("--state-home", type=Path, default=None)
    parser.add_argument("--preview", action="store_true", help="Open the local Preview dev server (HMR)")
    parser.add_argument("--remote", action="store_true", help="Open the actual deployed bbox-ui.com")
    parser.add_argument("--promote", action="store_true", help="Snapshot Preview's current tree as the new Stable")
    parser.add_argument("--rollback", action="store_true", help="Restore the previous Stable snapshot")
    parser.add_argument("--status", action="store_true")
    parser.add_argument("--stop", action="store_true")
    parser.add_argument("--all", action="store_true", help="With --stop: stop Stable and Preview both")
    parser.add_argument("--open", dest="open_window", action="store_true")
    parser.add_argument("--no-open", dest="open_window", action="store_false")
    parser.set_defaults(open_window=True)
    return parser.parse_args()


def main() -> int:
    arguments = parse_arguments()
    release_home = (arguments.release_home or default_release_home()).expanduser().resolve()
    state_home = (arguments.state_home or default_state_home()).expanduser().resolve()

    try:
        if arguments.stop:
            stopped: list[str] = []
            if arguments.all or not arguments.preview:
                if stop_pid(state_home / "stable" / "server.pid"):
                    stopped.append("Stable")
            if arguments.all or arguments.preview:
                if stop_pid(state_home / "preview" / "dev.pid"):
                    stopped.append("Preview")
            print("Stopped " + " and ".join(stopped) if stopped else "Nothing owned by this launcher was running.")
            return 0

        if arguments.rollback:
            channels = rollback(release_home)
            print(f"bbox-ui Stable rolled back to {channels.stable[:12]}")
            if health(STABLE_PORT):
                ensure_stable_server(release_home, state_home)
            return 0

        if arguments.promote:
            build, manifest = build_release(release_home)
            dirty = " (+uncommitted)" if manifest.get("dirty") else ""
            print(f"bbox-ui Stable promoted: {build[:12]}, from commit {(manifest.get('commit') or '?')[:12]}{dirty}")
            if health(STABLE_PORT) or read_pid(state_home / "stable" / "server.pid") is not None:
                ensure_stable_server(release_home, state_home)
                print(f"Stable server refreshed on http://127.0.0.1:{STABLE_PORT}/")
            return 0

        if arguments.status:
            channels = read_channels(release_home)
            stable_health = health(STABLE_PORT)
            if stable_health:
                print(f"Stable: healthy on {STABLE_PORT}, build {stable_health.get('build', '')[:12]}")
            elif channels.stable:
                print(f"Stable: stopped (last promoted build {channels.stable[:12]})")
            else:
                print("Stable: never promoted")
            print(
                f"Preview: {'running on ' + str(PREVIEW_PORT) if port_responds(PREVIEW_PORT, 0.3) else 'stopped'}"
                f" (local `next dev`, this checkout: {PROJECT_ROOT})"
            )
            print(f"Remote: {DEPLOYED_URL} (always live — no local state)")
            return 0

        if arguments.remote:
            print(f"bbox-ui Remote (deployed): {DEPLOYED_URL}")
            if arguments.open_window:
                open_app(DEPLOYED_URL, state_home / "remote" / "browser-profile", "bbox-ui-remote")
            return 0

        if arguments.preview:
            url = ensure_preview_server(state_home)
            print(f"bbox-ui Preview (local, HMR): {url}")
            if arguments.open_window:
                open_app(url, state_home / "preview" / "browser-profile", "bbox-ui-preview")
            return 0

        url, payload = ensure_stable_server(release_home, state_home)
        print(f"bbox-ui Stable: {payload.get('build', '')[:12]}")
        print(url)
        if arguments.open_window:
            open_app(url, state_home / "stable" / "browser-profile", "bbox-ui")
        return 0
    except (OSError, ReleaseError, subprocess.SubprocessError) as cause:
        print(f"bbox-ui launch error: {cause}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
