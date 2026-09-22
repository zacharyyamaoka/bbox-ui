"""The Stable/Preview/Remote launcher CLI, shared by every bbox-ui product.

Extracted 2026-09-22 out of launch_bboxui.py so a second product's launcher
(launch_bbox_storybook.py) is a five-line wrapper around the same `run()`,
not a second copy of the argument parser, the health polling, or the Chrome
window management. Each product's own launch_*.py script exists only so
Zach types a name he already knows for that product — `run()` itself never
mentions bbox-ui.com or Storybook by name; everything product-specific comes
in through the `ProductConfig` (see bbox_release.py's module docstring).
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
    ProductConfig,
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


# --------------------------------------------------------------------- Stable

def health(port: int, config: ProductConfig, timeout: float = 1.2) -> dict | None:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=timeout) as response:
            payload = json.load(response)
    except (OSError, ValueError, urllib.error.URLError):
        return None
    if not isinstance(payload, dict) or payload.get("product") != config.product:
        return None
    return payload


def wait_for_health(port: int, channel: str, config: ProductConfig, timeout: float = 20.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        payload = health(port, config)
        if payload and payload.get("channel") == channel:
            return payload
        time.sleep(0.2)
    raise ReleaseError(f"{config.display_name} {channel} did not become healthy on port {port}")


def build_release(release_home: Path, config: ProductConfig) -> tuple[str, dict]:
    return promote(release_home, config_project_root(), config)


def config_project_root() -> Path:
    from bbox_release import PROJECT_ROOT

    return PROJECT_ROOT


def ensure_stable_server(release_home: Path, state_home: Path, config: ProductConfig) -> tuple[str, dict]:
    channels = read_channels(release_home, config)
    if channels.stable is None:
        print(f"{config.display_name}: no Stable snapshot yet — building from this checkout...")
        build_release(release_home, config)
        channels = read_channels(release_home, config)

    stable_port = config.stable_port
    pid_path = state_home / "stable" / "server.pid"
    current = health(stable_port, config)
    if current:
        if current.get("channel") != "stable":
            raise ReleaseError(f"port {stable_port} is occupied by another {config.display_name} channel")
        if current.get("build") == channels.stable:
            return f"http://127.0.0.1:{stable_port}/", current
        if read_pid(pid_path) is None:
            raise ReleaseError(
                f"Stable build {current.get('build')} is outdated but its server is not owned by this launcher"
            )
        stop_pid(pid_path)
        if health(stable_port, config, timeout=0.4) is not None:
            raise ReleaseError(f"outdated Stable server on port {stable_port} did not stop")
    elif health(stable_port, config, timeout=0.2) is not None:
        raise ReleaseError(f"port {stable_port} is already occupied")
    elif port_responds(stable_port, timeout=0.2):
        # Something is listening that never answers /api/health at all —
        # refuse rather than silently trying to bind a port we don't own.
        raise ReleaseError(f"port {stable_port} is already occupied by something that is not {config.display_name}")

    pid = spawn_logged(
        [
            sys.executable,
            str(SCRIPTS_DIR / "bboxui_server.py"),
            "--port", str(stable_port),
            "--release-home", str(release_home),
            "--state-home", str(state_home),
            "--build", channels.stable,
            "--channel", "stable",
            "--product", config.slug,
        ],
        cwd=SCRIPTS_DIR,
        log=state_home / "stable" / "server.log",
    )
    write_pid(pid_path, pid)
    return f"http://127.0.0.1:{stable_port}/", wait_for_health(stable_port, "stable", config)


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

def build_arg_parser(config: ProductConfig) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            f"Launch {config.display_name}: Stable (default, a pinned local build), "
            f"--preview (a real local dev server with HMR, this checkout's disk), "
            + (f"--remote (the deployed {config.deployed_url})." if config.deployed_url else "no Remote channel.")
        )
    )
    parser.add_argument("--release-home", type=Path, default=None)
    parser.add_argument("--state-home", type=Path, default=None)
    parser.add_argument("--preview", action="store_true", help="Open the local Preview dev server (HMR)")
    parser.add_argument("--remote", action="store_true", help="Open the actual deployed site")
    parser.add_argument("--promote", action="store_true", help="Snapshot Preview's current tree as the new Stable")
    parser.add_argument("--rollback", action="store_true", help="Restore the previous Stable snapshot")
    parser.add_argument("--list", dest="list_status", action="store_true", help="Alias for --status")
    parser.add_argument("--status", action="store_true")
    parser.add_argument("--stop", action="store_true")
    parser.add_argument("--all", action="store_true", help="With --stop: stop Stable and Preview both")
    parser.add_argument("--open", dest="open_window", action="store_true")
    parser.add_argument("--no-open", dest="open_window", action="store_false")
    parser.set_defaults(open_window=True)
    return parser


def run(config: ProductConfig, argv: list[str]) -> int:
    arguments = build_arg_parser(config).parse_args(argv)
    release_home = (arguments.release_home or default_release_home(config)).expanduser().resolve()
    state_home = (arguments.state_home or default_state_home(config)).expanduser().resolve()

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
            channels = rollback(release_home, config)
            print(f"{config.display_name} Stable rolled back to {channels.stable[:12]}")
            if health(config.stable_port, config):
                ensure_stable_server(release_home, state_home, config)
            return 0

        if arguments.promote:
            build, manifest = build_release(release_home, config)
            dirty = " (+uncommitted)" if manifest.get("dirty") else ""
            print(
                f"{config.display_name} Stable promoted: {build[:12]}, "
                f"from commit {(manifest.get('commit') or '?')[:12]}{dirty}"
            )
            if health(config.stable_port, config) or read_pid(state_home / "stable" / "server.pid") is not None:
                ensure_stable_server(release_home, state_home, config)
                print(f"Stable server refreshed on http://127.0.0.1:{config.stable_port}/")
            return 0

        if arguments.status or arguments.list_status:
            channels = read_channels(release_home, config)
            stable_health = health(config.stable_port, config)
            if stable_health:
                print(f"Stable: healthy on {config.stable_port}, build {stable_health.get('build', '')[:12]}")
            elif channels.stable:
                print(f"Stable: stopped (last promoted build {channels.stable[:12]})")
            else:
                print("Stable: never promoted")
            print(
                f"Preview: {'running on ' + str(config.preview_port) if port_responds(config.preview_port, 0.3) else 'stopped'}"
                f" (local dev server, this checkout: {config_project_root()})"
            )
            if config.deployed_url:
                print(f"Remote: {config.deployed_url} (always live — no local state)")
            else:
                print("Remote: none (no public deploy for this product)")
            return 0

        if arguments.remote:
            if not config.deployed_url:
                print(f"{config.display_name} has no Remote channel.", file=sys.stderr)
                return 1
            print(f"{config.display_name} Remote (deployed): {config.deployed_url}")
            if arguments.open_window:
                open_app(config.deployed_url, state_home / "remote" / "browser-profile", f"{config.app_id}-remote")
            return 0

        if arguments.preview:
            url = ensure_preview_server(state_home, config)
            print(f"{config.display_name} Preview (local, HMR): {url}")
            if arguments.open_window:
                open_app(url, state_home / "preview" / "browser-profile", f"{config.app_id}-preview")
            return 0

        url, payload = ensure_stable_server(release_home, state_home, config)
        print(f"{config.display_name} Stable: {payload.get('build', '')[:12]}")
        print(url)
        if arguments.open_window:
            open_app(url, state_home / "stable" / "browser-profile", config.app_id)
        return 0
    except (OSError, ReleaseError, subprocess.SubprocessError) as cause:
        print(f"{config.display_name} launch error: {cause}", file=sys.stderr)
        return 1
