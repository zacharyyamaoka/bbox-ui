#!/usr/bin/env python3
"""Launch the NEW SystemSketch — apps/systemsketch, bbox-ui + stock tldraw — as a desktop app.

  (default)  --open   Serve the pinned Stable build on :4341 and open its window
                      (or bring the open one forward).
  --update            Rebuild Stable from this checkout's HEAD, then serve it.
                      Refuses a tree with uncommitted app or trunk changes, so a
                      build always names the commit it came from.
  --old               Open the archived SystemSketch (/home/bam/systemsketch) in
                      its own window, through its own launcher.
  <file>              A board double-clicked in the file manager. A .bbox or
                      .tldr opens HERE, on `?board=<path>`; a .systemsketch is
                      the archived app's envelope and goes to the archived app.
  --status / --stop   Report or stop the Stable server this launcher owns.

Zach, 2026-09-19: "update my dock app to launch the new system sketch and then
just have a button to switch to the old one". The dock icon runs this; the
button is the ☰ row "Switch to old SystemSketch" (apps/systemsketch/src/chrome/
legacyApp.ts) and the dock's right-click action of the same name.

Zach, 2026-09-21: "connect the bbox whiteboard app to open when I press
bbox-ui, and then somewhere in that whiteboard app in a drop down menu
somewhere give the option to open the bbox-ui.com site and the storybook
site". So assets/bbox-ui.desktop now runs THIS launcher, and --open also
brings Storybook up on :5421 — the ☰ rows in apps/systemsketch/src/chrome/
sites.ts are links, and a page cannot start a process. Same division of
labour as the old-app row above: the menu navigates, the launcher is what
makes sure there is something at the other end.

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

# WHY same module, not a package import: systemsketch_files.py lives beside
# this file in scripts/, and both the CLI (script-dir on sys.path[0]) and the
# test suite (which inserts scripts/ itself) resolve it as a plain top-level
# module — see scripts/tests/test_systemsketch_files_http.py's DockMountTests.
from systemsketch_files import (
    BBOX_SUFFIX,
    GioDesktop,
    SYSTEMSKETCH_SUFFIX,
    TLDRAW_SUFFIX,
    WorkspaceApi,
    default_lock_root,
    document_suffix,
)
from systemsketch_recordings import RecordingApi

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

# The Storybook the ☰ "Open Storybook" row points at. Its default port is
# apps/storybook-basics/package.json's own (`storybook dev -p ${STORYBOOK_PORT:-5421}`).
STORYBOOK_PORT = int(os.environ.get("STORYBOOK_PORT", "5421"))
STORYBOOK_PACKAGE = "bbox-storybook-basics"


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


def files_root_from(environment: dict[str, str]) -> Path:
    """The folder the file host reads and writes real ``.bbox``/``.tldr``/``.systemsketch``
    documents under. ``SYSTEMSKETCH_FILES_ROOT`` overrides it (matching the
    dev-file-host lane and the smoke tests); by default it's the real home
    folder, same as the archived app."""
    override = environment.get("SYSTEMSKETCH_FILES_ROOT")
    return Path(override) if override else HOME


# -------------------------------------------------------------- the server

class StableHandler(http.server.SimpleHTTPRequestHandler):
    build = ""
    # WHY mounted here rather than a second server/port: Zach, 2026-09-19,
    # "we need to be able to save real files to the system" — the dock's one
    # Stable server on :4341 now answers both the built app and
    # /api/workspace/*, same origin, so the browser needs no second host to
    # trust. None until `serve()` (or a test) sets it; with no workspace
    # mounted this handler behaves exactly as it did before this changed.
    workspace: "WorkspaceApi | None" = None
    # The recorder's own routes, on the SAME origin and for the same reason.
    #
    # WHY not a second server: a recording carries a full store snapshot of
    # whatever board is open, so `RecordingApi._refuse_state_change` rejects
    # any POST whose Origin is not this page's. A second port would be a
    # second origin this one has to trust, which is exactly the fence that
    # check exists to hold. None until `serve()` (or a test) sets it.
    recordings: "RecordingApi | None" = None

    def do_GET(self) -> None:  # noqa: N802 — the stdlib's spelling
        if self.path.split("?")[0] == "/api/health":
            body = json.dumps({"product": PRODUCT, "build": self.build, "channel": "stable"}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.workspace is not None and self.workspace.handle_get(self):
            return
        if self.recordings is not None and self.recordings.handle_get(self):
            return
        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802 — the stdlib's spelling
        if self.workspace is not None and self.workspace.handle_post(self):
            return
        if self.recordings is not None and self.recordings.handle_post(self):
            return
        self.send_error(501, f"Unsupported method ({self.command!r})")

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
    # Mount the file host on this same handler/origin — see the WHY on
    # StableHandler.workspace above. Real desktop Trash/reveal (GioDesktop);
    # the archived app's own lock folder when it exists, so a save from
    # either app excludes the other on the same file (default_lock_root).
    files_root = files_root_from(os.environ)
    StableHandler.workspace = WorkspaceApi(
        files_root, default_lock_root(HOME), GioDesktop()
    )
    # The recorder writes its folders under the SAME files root the workspace
    # serves, so a recording lands beside the boards it recorded rather than
    # in a second place a person has to know about. `source_root` is this
    # checkout: `state_index` reads it to name tldraw's own states, and it is
    # a read of source files, never of a board.
    StableHandler.recordings = RecordingApi(
        files_root, source_root=REPO, channel="stable", build=build
    )
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


def storybook_responds(timeout: float = 0.6) -> bool:
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{STORYBOOK_PORT}/", timeout=timeout)
        return True
    except urllib.error.HTTPError:
        return True
    except (OSError, urllib.error.URLError):
        return False


def ensure_storybook() -> None:
    """Start Storybook on :STORYBOOK_PORT if nothing is already answering there.

    WHY a DEV server, when everything else this launcher owns is a pinned
    build: Storybook here IS the live trunk by design — it is the surface the
    lanes deliver into and the one Zach watches change — so pinning it would
    show him the one thing it exists not to show.

    WHY it leaves a server it did not start alone, rather than checking whose
    it is: a peer session's Storybook on that port is serving the same trunk
    from a sibling worktree, which is exactly as good an answer for a link,
    and this tree shares its git index with those sessions (CLAUDE.md,
    "Several agent sessions edit this tree at once"). Never contest the port.

    WHY failure here is silent: this runs off the critical path, after the
    board's own server is healthy. A missing pnpm must not cost him the
    window he actually pressed the icon for — it costs him one menu row,
    and the log below says why.
    """
    if storybook_responds():
        return
    pnpm = shutil.which("pnpm", path=tool_environment()["PATH"])
    if pnpm is None:
        return
    environment = tool_environment()
    environment["STORYBOOK_PORT"] = str(STORYBOOK_PORT)
    STATE_HOME.mkdir(parents=True, exist_ok=True)
    with (STATE_HOME / "storybook.log").open("ab") as output:
        subprocess.Popen(
            [pnpm, "--dir", str(REPO), "--filter", STORYBOOK_PACKAGE, "run", "storybook"],
            cwd=REPO, env=environment, stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT,
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

#: The suffixes THIS app can open. ``.systemsketch`` is deliberately absent:
#: it is the archived app's envelope, a different format rather than a
#: different name, and this build reads plain tldraw documents only
#: (apps/systemsketch/src/files/session.tsx makes the same split in the ☰
#: navigator).
OWN_SUFFIXES = (BBOX_SUFFIX, TLDRAW_SUFFIX)


def opens_here(file: Path) -> bool:
    """Does a double-clicked board belong to THIS app?

    WHY this function exists at all: before the file type was renamed to
    ``.bbox`` (Zach, 2026-09-21) every ``<file>`` argument went to the archived
    app unconditionally, which was harmless only because every board on disk
    was one the archived app could read. The moment this build starts WRITING
    ``.bbox``, that unconditional hand-off becomes a double-click that opens
    the wrong application on a file it cannot parse — a regression the rename
    would have caused silently.
    """
    return document_suffix(file.name) in OWN_SUFFIXES


def board_url(file: Path) -> str:
    """The URL that opens ``file`` in this app.

    `?board=<absolute path>` is the app's own contract — "the URL is the
    document" (apps/systemsketch/src/files/launchConfig.ts). The path is passed
    RAW, not percent-encoded: that is the spelling the app parses and the one
    Zach is handed everywhere else.
    """
    return f"http://127.0.0.1:{PORT}/?board={file}"


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
        own_file = arguments.file.expanduser().resolve() if arguments.file is not None else None
        if own_file is not None and opens_here(own_file):
            record = build_stable() if stable_record() is None else stable_record()
            ensure_server(record)
            # The ☰ "Switch to old SystemSketch" row needs the old Stable up.
            legacy("--no-open", wait=False)
            print(board_url(own_file))
            open_window(board_url(own_file))
            return 0
        if arguments.old or arguments.file is not None:
            # WHY --new-window: the old launcher focuses any window of class
            # "systemsketch" and stops — which is now THIS app's window.
            extra = [str(own_file)] if own_file is not None else []
            return legacy("--open", "--new-window", *extra, wait=True)
        if arguments.stop:
            print("Stopped the new SystemSketch." if stop_server() else "No server owned by this launcher was running.")
            return 0
        if arguments.status:
            record, current = stable_record(), health()
            print(f"Stable build: {record['build'][:9]} — {record['subject']} (built {record['built']})" if record else "Stable build: none yet (run --update)")
            print(f"Server: healthy on :{PORT}, serving {current['build'][:9]}" if current else f"Server: stopped (:{PORT})")
            print(f"Storybook: {'up' if storybook_responds() else 'not running'} (:{STORYBOOK_PORT})")
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
            # Same deal for the ☰ "Open Storybook" row. Also off the critical
            # path — Storybook takes ~20s to serve, the window opens now.
            ensure_storybook()
            open_window(url)
        return 0
    except (OSError, LaunchError, subprocess.SubprocessError) as cause:
        print(f"SystemSketch launch error: {cause}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
