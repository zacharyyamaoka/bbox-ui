#!/usr/bin/env python3
"""Launch the NEW SystemSketch — apps/systemsketch, bbox-ui + stock tldraw — as a desktop app.

  (default)  --open   Serve the pinned Stable build on :4341 and open its window
                      (or bring the open one forward).
  --update            Rebuild Stable from this checkout's HEAD, then serve it.
                      Refuses a tree with uncommitted app or trunk changes, so a
                      build always names the commit it came from.
  --old               Open the archived SystemSketch (/home/bam/systemsketch) in
                      its own window, through its own launcher.
  <file>              A .systemsketch/.tldr double-clicked in the file manager
                      goes to the archived app: the new one cannot open a path
                      yet (it opens .tldr through its ☰ menu).
  --status / --stop   Report or stop the Stable server this launcher owns.

Zach, 2026-09-19: "update my dock app to launch the new system sketch and then
just have a button to switch to the old one". The dock icon runs this; the
button is the ☰ row "Switch to old SystemSketch" (apps/systemsketch/src/chrome/
legacyApp.ts) and the dock's right-click action of the same name.

WHY a pinned build and not `vite dev`: the archived app taught this the hard
way — the thing in the dock is the build Zach trusts, and a dev server shows
whatever half-edit a peer session has on disk at that second. Live work stays
one command away: `pnpm --dir /home/bam/bbox-ui --filter systemsketch dev`
(:4340). Stable moves only when he says so (--update, or the dock's
"Update to latest main").

WHY the window opens in the OLD app's Chrome profile, with its window class
and DevTools port: the in-app switch navigates the same window to the old
app's origin, and in that profile the old origin still has its own storage;
the shared class keeps both under the one dock icon; and the DevTools port is
how this launcher finds an already-open new-app window to bring forward
instead of stacking a second one (a window-class search cannot tell the two
apps apart — they share the class on purpose).
"""

from __future__ import annotations

import argparse
import functools
import http.server
import json
import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

PRODUCT = "systemsketch-next"
REPO = Path(__file__).resolve().parents[1]
APP_DIR = REPO / "apps" / "systemsketch"
PORT = int(os.environ.get("SYSTEMSKETCH_NEXT_PORT", "4341"))
HOME = Path.home()
RELEASE_HOME = Path(os.environ.get("SYSTEMSKETCH_NEXT_RELEASE_HOME", HOME / ".local/share/systemsketch-next"))
STATE_HOME = Path(os.environ.get("SYSTEMSKETCH_NEXT_STATE_HOME", HOME / ".local/state/systemsketch-next"))

# The archived app: its launcher, its install, and the Chrome profile its Stable window uses.
LEGACY_LAUNCHER = HOME / ".local/share/systemsketch/runtime/bin/launch_systemsketch.py"
LEGACY_RELEASE_HOME = HOME / ".local/share/systemsketch/runtime"
LEGACY_PROFILE = HOME / ".local/state/systemsketch/desktop-v2/stable/browser-profile"
PROFILE = Path(os.environ.get("SYSTEMSKETCH_NEXT_PROFILE", LEGACY_PROFILE))
APP_ID = os.environ.get("SYSTEMSKETCH_NEXT_APP_ID", "systemsketch")
CDP_PORT = int(os.environ.get("SYSTEMSKETCH_NEXT_CDP_PORT", "4325"))

# Paths that decide what a build contains. A dirty file here means the build
# would not be the commit it claims to be.
BUILD_INPUTS = ["apps/systemsketch", "apps/storybook-basics/src", "pnpm-lock.yaml", "package.json"]


class LaunchError(RuntimeError):
    pass


# --------------------------------------------------------------- the build

def stable_record() -> dict | None:
    try:
        return json.loads((RELEASE_HOME / "stable.json").read_text())
    except (OSError, ValueError):
        return None


def tool_environment() -> dict[str, str]:
    """A PATH that finds pnpm and node when the dock starts this with no shell."""
    environment = dict(os.environ)
    extra = [str(HOME / ".local/bin"), "/usr/local/bin", "/usr/bin", "/bin"]
    environment["PATH"] = os.pathsep.join(extra + [environment.get("PATH", "")])
    return environment


def git(*arguments: str) -> str:
    return subprocess.run(["git", "-C", str(REPO), *arguments], check=True, capture_output=True, text=True).stdout.strip()


def build_stable() -> dict:
    dirty = git("status", "--porcelain", "--", *BUILD_INPUTS)
    if dirty:
        raise LaunchError(
            "refusing to build: uncommitted changes in the app or the trunk —\n" + dirty
            + "\ncommit or set them aside, then run --update again"
        )
    commit = git("rev-parse", "HEAD")
    target = RELEASE_HOME / "releases" / commit
    if not (target / "index.html").exists():
        staging = RELEASE_HOME / "releases" / f".{commit}.building"
        shutil.rmtree(staging, ignore_errors=True)
        staging.parent.mkdir(parents=True, exist_ok=True)
        log = STATE_HOME / "build.log"
        log.parent.mkdir(parents=True, exist_ok=True)
        pnpm = shutil.which("pnpm", path=tool_environment()["PATH"])
        if pnpm is None:
            raise LaunchError("pnpm is not installed where the launcher can find it")
        with log.open("ab") as output:
            result = subprocess.run(
                [pnpm, "--dir", str(REPO), "--filter", "systemsketch", "exec",
                 "vite", "build", "--outDir", str(staging), "--emptyOutDir"],
                cwd=REPO, env=tool_environment(), stdout=output, stderr=subprocess.STDOUT,
            )
        if result.returncode != 0 or not (staging / "index.html").exists():
            raise LaunchError(f"vite build failed — see {log}")
        shutil.rmtree(target, ignore_errors=True)
        staging.rename(target)
    record = {"build": commit, "subject": git("log", "-1", "--format=%s", commit), "built": time.strftime("%Y-%m-%d %H:%M:%S")}
    (RELEASE_HOME / "stable.json").write_text(json.dumps(record, indent=2) + "\n")
    return record


# -------------------------------------------------------------- the server

class StableHandler(http.server.SimpleHTTPRequestHandler):
    build = ""

    def do_GET(self) -> None:  # noqa: N802 — the stdlib's spelling
        if self.path.split("?")[0] == "/api/health":
            body = json.dumps({"product": PRODUCT, "build": self.build, "channel": "stable"}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def end_headers(self) -> None:
        # The build is immutable per commit, but index.html names the build;
        # never let a cached index point at a previous build's assets.
        if self.path.split("?")[0] in ("/", "/index.html"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        sys.stderr.write("%s - %s\n" % (self.address_string(), format % args))


def serve(port: int, root: Path, build: str) -> None:
    StableHandler.build = build
    handler = functools.partial(StableHandler, directory=str(root))
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as server:
        server.serve_forever()


def health(timeout: float = 1.0) -> dict | None:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/health", timeout=timeout) as response:
            payload = json.load(response)
    except (OSError, ValueError, urllib.error.URLError):
        return None
    return payload if isinstance(payload, dict) and payload.get("product") == PRODUCT else None


def port_taken() -> bool:
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{PORT}/", timeout=0.4)
        return True
    except urllib.error.HTTPError:
        return True
    except (OSError, urllib.error.URLError):
        return False


def read_pid() -> int | None:
    try:
        pid = int((STATE_HOME / "server.pid").read_text().strip())
        os.kill(pid, 0)
        return pid
    except (OSError, ValueError):
        return None


def stop_server() -> bool:
    pid = read_pid()
    if pid is None:
        return False
    os.kill(pid, signal.SIGTERM)
    for _ in range(40):
        if health(timeout=0.2) is None:
            break
        time.sleep(0.1)
    (STATE_HOME / "server.pid").unlink(missing_ok=True)
    return True


def ensure_server(record: dict) -> None:
    current = health()
    if current and current.get("build") == record["build"]:
        return
    if current:
        if read_pid() is None:
            raise LaunchError(f"an outdated SystemSketch server holds :{PORT} and this launcher did not start it")
        stop_server()
    elif port_taken():
        raise LaunchError(f"port {PORT} is taken by something that is not SystemSketch")
    STATE_HOME.mkdir(parents=True, exist_ok=True)
    root = RELEASE_HOME / "releases" / record["build"]
    with (STATE_HOME / "server.log").open("ab") as output:
        process = subprocess.Popen(
            [sys.executable, str(Path(__file__).resolve()), "--serve", "--root", str(root), "--build", record["build"]],
            stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT,
            start_new_session=True, close_fds=True,
        )
    (STATE_HOME / "server.pid").write_text(f"{process.pid}\n")
    for _ in range(100):
        if (payload := health(timeout=0.3)) and payload.get("build") == record["build"]:
            return
        time.sleep(0.1)
    raise LaunchError(f"the Stable server did not come up on :{PORT} — see {STATE_HOME / 'server.log'}")


# -------------------------------------------------------------- the window

def focus_open_window(url: str) -> bool:
    """Bring forward a window already showing the new app, via the profile's DevTools."""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json/list", timeout=0.8) as response:
            targets = json.load(response)
    except (OSError, ValueError, urllib.error.URLError):
        return False
    for target in targets:
        if target.get("type") == "page" and str(target.get("url", "")).startswith(url):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json/activate/{target['id']}", timeout=0.8).close()
                return True
            except (OSError, urllib.error.URLError):
                return False
    return False


def open_window(url: str) -> None:
    if focus_open_window(url):
        return
    chrome = next((path for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser") if (path := shutil.which(name))), None)
    if chrome is None:
        raise LaunchError("Google Chrome or Chromium is required for the desktop window")
    PROFILE.mkdir(parents=True, exist_ok=True)
    subprocess.Popen(
        [chrome, f"--app={url}", f"--class={APP_ID}", f"--name={APP_ID}", f"--user-data-dir={PROFILE}",
         "--no-first-run", "--no-default-browser-check", f"--remote-debugging-port={CDP_PORT}"],
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        start_new_session=True, close_fds=True,
    )


def legacy(*arguments: str, wait: bool) -> int:
    if not LEGACY_LAUNCHER.exists():
        raise LaunchError(f"the archived SystemSketch is not installed at {LEGACY_LAUNCHER}")
    python = shutil.which("python3.12") or sys.executable
    command = [python, str(LEGACY_LAUNCHER), "--release-home", str(LEGACY_RELEASE_HOME), *arguments]
    if wait:
        return subprocess.run(command, check=False).returncode
    subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                     start_new_session=True, close_fds=True)
    return 0


# ---------------------------------------------------------------- the CLI

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("file", nargs="?", type=Path)
    parser.add_argument("--open", dest="open_window", action="store_true")
    parser.add_argument("--update", action="store_true")
    parser.add_argument("--old", action="store_true")
    parser.add_argument("--status", action="store_true")
    parser.add_argument("--stop", action="store_true")
    parser.add_argument("--serve", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--root", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--build", help=argparse.SUPPRESS)
    arguments = parser.parse_args()
    try:
        if arguments.serve:
            serve(PORT, arguments.root, arguments.build)
            return 0
        if arguments.old or arguments.file is not None:
            # WHY --new-window: the old launcher focuses any window of class
            # "systemsketch" and stops — which is now THIS app's window.
            extra = [str(arguments.file.expanduser().resolve())] if arguments.file is not None else []
            return legacy("--open", "--new-window", *extra, wait=True)
        if arguments.stop:
            print("Stopped the new SystemSketch." if stop_server() else "No server owned by this launcher was running.")
            return 0
        if arguments.status:
            record, current = stable_record(), health()
            print(f"Stable build: {record['build'][:9]} — {record['subject']} (built {record['built']})" if record else "Stable build: none yet (run --update)")
            print(f"Server: healthy on :{PORT}, serving {current['build'][:9]}" if current else f"Server: stopped (:{PORT})")
            return 0
        record = build_stable() if arguments.update or stable_record() is None else stable_record()
        ensure_server(record)
        url = f"http://127.0.0.1:{PORT}/"
        print(f"SystemSketch (new): {record['build'][:9]} — {record['subject']}")
        print(url)
        if arguments.open_window:
            # The ☰ "Switch to old SystemSketch" row needs the old Stable up;
            # its launcher reuses a healthy one or starts it. Off the critical path.
            legacy("--no-open", wait=False)
            open_window(url)
        return 0
    except (OSError, LaunchError, subprocess.SubprocessError) as cause:
        print(f"SystemSketch launch error: {cause}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
