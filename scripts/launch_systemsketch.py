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
  --headless          Open it on a PRIVATE X display with a throwaway Chrome
                      profile and port, prove the page rendered, tear it down.
                      This is how an AGENT opens this app — never the visible
                      window: that steals Zach's screen AND takes the profile
                      mutex his dock icon needs. `--screenshot <png>` captures
                      the real render; `--hold <seconds>` keeps it up to drive
                      over the DevTools endpoint it prints.
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
import socket
import subprocess
import sys
import tempfile
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
import dock_icon
# WHY this launcher imports the OTHER product family's release module: one
# function, `checkout_id`. Two surfaces comparing "are we the same tree?"
# have to compute the id the same way or the comparison silently answers
# "different" forever — so there is exactly one implementation of it in
# Python, imported rather than copied. bbox_release imports stdlib only.
import bbox_release

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
# WHY this is `bbox-ui` and no longer `systemsketch`: the class is what GNOME
# groups a window under, and BOTH installed entries used to claim
# `systemsketch`. GNOME breaks that tie for the entry whose id equals the class
# (gnome-shell 46.0, `shell-app-system.c:142-144`), so pressing **bbox-ui** lit
# the **SystemSketch** slot and the window presented itself as SystemSketch —
# Zach, 2026-09-24: "When I press the bbox-ui icon it opens system sketch which
# is not desired!" The old sharing was deliberate, to keep the in-app "Switch
# to old SystemSketch" row under one dock icon; that reason is gone now that
# the SystemSketch entry launches the archived app and only the archived app.
# The Chrome PROFILE stays shared (see below) — that is what the switch row
# actually needs, and it is a different thing from the window class.
APP_ID = os.environ.get("SYSTEMSKETCH_NEXT_APP_ID", "bbox-ui")
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

def health_document(build: str) -> dict:
    """What `/api/health` answers on the dock's pinned Stable server.

    WHY `commit` and `checkoutId` are here now, when this used to answer
    `{product, build, channel}` alone (judge finding, 2026-09-22 — HIGH):
    apps/systemsketch/src/chrome/siteStatus.ts's `statusMismatchesOwn`
    compares `commit` and the checkout id, and this document carried neither.
    So the ONE configuration Zach actually gets by pressing the dock icon —
    Stable whiteboard, Storybook somewhere else — could never report a
    mismatch: the comparison had nothing to compare and returned `false`, and
    the "different from this board" warning was unreachable by construction.
    Whatever the badge said, it was not measured.

    `commit` is the same value as `build` and that is not redundancy: this
    launcher's build id IS a commit sha (`build_stable` uses `git rev-parse
    HEAD` verbatim), while bbox_release.py's build id is a content hash of
    the OUTPUT, so a consumer must not infer one from the other. Naming the
    commit explicitly is what lets a product-agnostic comparison work without
    knowing which launcher produced the document.
    """
    return {
        "product": PRODUCT,
        "displayName": "SystemSketch",
        "build": build,
        "commit": build or None,
        # Computed by bbox_release.checkout_id so this value is comparable
        # with every other bbox-ui surface's — see that function's docstring
        # for why one shared algorithm is load-bearing here.
        "checkoutId": bbox_release.checkout_id(REPO),
        "channel": "stable",
    }


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
            body = json.dumps(health_document(self.build)).encode()
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


# ------------------------------------------- the shared Chrome singleton
#
# WHY this whole section exists — the dock icon went dead and this is the
# mechanism (measured 2026-09-23; `journalctl --user` recorded three presses in
# twenty seconds that each printed the URL and opened no window at all).
#
# A Chrome `--user-data-dir` is a MACHINE-WIDE MUTEX, and so is a fixed
# `--remote-debugging-port`. This launcher shares both with the archived app on
# purpose (see the module docstring) — which means it also shares them with
# every agent session that launches either app, including the headless ones.
# Two independent ways a press then vanishes:
#
#   1. Another Chrome holds the profile. `google-chrome --app=…` prints
#      "Opening in existing browser session", hands its command line to that
#      holder and exits 0. The window opens on the HOLDER's display — a hidden
#      Xvfb, another seat, nowhere — and this launcher reports success.
#   2. Another Chrome owns the DevTools port. `focus_open_window` finds ITS
#      page on this URL, activates it, returns True, and this launcher opens
#      nothing whatsoever.
#
# Both failed silently because a dock icon has no terminal to print to. So
# every function below answers one of two questions: is that browser MINE (same
# display), and did a window actually appear? A press now either puts a window
# on this display or says out loud why it could not.

def this_display() -> str:
    return os.environ.get("DISPLAY", "")


def process_argv(pid: int) -> list[str]:
    """A process's arguments — including Chrome's, which are not NUL-separated.

    WHY the fallback: Chrome rewrites its own `/proc/<pid>/cmdline`, replacing
    the NUL separators with spaces, so the textbook `split("\\0")` returns ONE
    giant string and every `--flag in argv` test below silently answers False.
    Measured 2026-09-23 against a live browser: the holder scan reported "0
    processes hold this profile" while Chrome was demonstrably holding it —
    i.e. the guard would have shipped doing nothing at all. Splitting on
    whitespace is safe for the arguments this file asks about (a profile path
    or a port), none of which contain spaces.
    """
    try:
        text = Path(f"/proc/{pid}/cmdline").read_bytes().decode("utf8", "replace")
    except OSError:
        return []
    arguments = [part for part in text.split("\0") if part]
    return arguments if len(arguments) > 1 else text.replace("\0", " ").split()


def app_window_pids(app_id: str = APP_ID) -> set[int] | None:
    """PIDs owning a window of this app ON THIS DISPLAY, or None when we cannot ask.

    This is the whole discrimination the fix rests on: a browser holding the
    profile is MINE when it owns a window I can see, and somebody else's when it
    does not. Asking the display is the only way to know — two earlier routes are
    recorded here so nobody walks them again:

      * `/proc/<pid>/environ` — Chrome rewrites its own process title, and that
        rewrite clobbers the environ block sitting right after argv, so a live
        browser reads back with no DISPLAY at all (measured 2026-09-23).
      * `/proc/net/unix` socket inodes — only the SERVER side of an X connection
        carries the `@/tmp/.X11-unix/X<n>` name. The client fd a browser holds is
        unnamed, so it never matches (measured the same day).

    `xdotool search` only reads; it never raises or focuses a window. The
    archived launcher already depends on it for the same job.
    """
    xdotool = shutil.which("xdotool")
    if not xdotool or not this_display():
        return None
    found = subprocess.run([xdotool, "search", "--class", f"^{app_id}$"],
                           check=False, capture_output=True, text=True)
    if found.returncode != 0:
        return set()  # xdotool exits non-zero when nothing matches — that is an answer
    pids: set[int] = set()
    for window in found.stdout.split():
        owner = subprocess.run([xdotool, "getwindowpid", window],
                               check=False, capture_output=True, text=True)
        if owner.returncode == 0 and owner.stdout.strip().isdigit():
            pids.add(int(owner.stdout.strip()))
    return pids


#: Basenames of a Chrome BROWSER process. A `--type=` argument marks a helper
#: (renderer, GPU, zygote); only the browser holds the profile lock.
CHROME_NAMES = ("chrome", "google-chrome", "google-chrome-stable", "chromium", "chromium-browser")


def is_browser_argv(argv: list[str]) -> bool:
    """A Chrome BROWSER command line, not one of its helpers.

    WHY the `--type=` test: a renderer, GPU or zygote process carries the same
    `--user-data-dir` as its browser but holds no lock. Counting one as a holder
    would send every press to a sibling profile while the real window sits there.
    """
    if not argv or not argv[0]:
        return False
    if os.path.basename(argv[0]) not in CHROME_NAMES:
        return False
    return not any(argument.startswith("--type=") for argument in argv)


def chrome_browsers() -> list[tuple[int, list[str]]]:
    """Every live Chrome browser process on this machine, as (pid, argv)."""
    found: list[tuple[int, list[str]]] = []
    try:
        entries = os.listdir("/proc")
    except OSError:
        return found
    for entry in entries:
        if not entry.isdigit():
            continue
        argv = process_argv(int(entry))
        if is_browser_argv(argv):
            found.append((int(entry), argv))
    return found


def profile_holders(profile: Path, browsers: list[tuple[int, list[str]]] | None = None) -> list[int]:
    """Every live browser holding `profile` — the mutex itself, read straight from /proc."""
    wanted = f"--user-data-dir={profile}"
    return [
        pid
        for pid, argv in (chrome_browsers() if browsers is None else browsers)
        if wanted in argv
    ]


def cdp_owner(port: int, browsers: list[tuple[int, list[str]]] | None = None) -> int | None:
    """The browser listening on `port`, or None when no browser is."""
    wanted = f"--remote-debugging-port={port}"
    for pid, argv in (chrome_browsers() if browsers is None else browsers):
        if wanted in argv:
            return pid
    return None


def port_in_use(port: int) -> bool:
    with socket.socket() as probe:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            probe.bind(("127.0.0.1", port))
        except OSError:
            return True
    return False


def free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def notify(summary: str, body: str) -> None:
    """Say it where a dock press can be seen. A dock icon has no terminal."""
    print(f"{summary}: {body}", file=sys.stderr)
    if send := shutil.which("notify-send"):
        subprocess.run([send, "--app-name=bbox-ui", "--icon=bbox-ui", summary, body], check=False)


def clear_stale_singletons(profile: Path) -> bool:
    """Drop a lock no live browser holds — a SIGKILLed Chrome leaves one behind.

    WHY the holder check first: these three files ARE the mutex. Removing them
    while a browser is up lets a second browser corrupt the same profile.
    """
    if profile_holders(profile):
        return False
    removed = False
    for name in ("SingletonLock", "SingletonSocket", "SingletonCookie"):
        path = profile / name
        # A dangling symlink is the normal shape here, and `exists()` is False
        # for one — so ask about the link itself before asking about the target.
        if path.is_symlink() or path.exists():
            path.unlink(missing_ok=True)
            removed = True
    return removed


def holder_is_visible_here(holders: list[int]) -> bool:
    """Is one of these browsers showing a window on this display?

    WHY it answers True when the display cannot be questioned (no xdotool, no
    DISPLAY): stepping aside on a guess would open a SECOND window in a SECOND
    profile on every press, which is worse than the bug being fixed. Unknown
    keeps today's behaviour and lets `confirm_window` do the complaining.
    """
    visible = app_window_pids()
    if visible is None:
        return True
    return any(pid in visible for pid in holders)


def launch_profile() -> Path:
    """The profile this press may safely use — never one an unseen browser holds."""
    holders = profile_holders(PROFILE)
    if not holders:
        if clear_stale_singletons(PROFILE):
            print(f"Cleared a stale Chrome lock in {PROFILE.name} — no live browser held it")
        return PROFILE
    if holder_is_visible_here(holders):
        return PROFILE
    # WHY a sibling profile rather than waiting, or killing the holder: that
    # browser is somewhere this display cannot see — an agent session's hidden
    # Xvfb, or another seat. Handing Chrome the shared profile forwards this
    # press to it and opens the window where nobody is looking, which IS the
    # bug. Killing it would destroy someone else's run. The sibling costs only
    # the archived app's cookies (the ☰ "Switch to old SystemSketch" row opens
    # signed out) and is the one option that still puts a window on the display
    # that actually asked for one.
    suffix = this_display().lstrip(":") or "nodisplay"
    alternate = PROFILE.with_name(f"{PROFILE.name}-{suffix}")
    listed = ", ".join(str(pid) for pid in holders)
    print(f"Chrome {listed} holds {PROFILE.name} with no window here — this one uses {alternate.name}")
    return alternate


def launch_cdp_port() -> int:
    """`CDP_PORT` when it is ours to take, otherwise a free one.

    Binding is first-come: if a foreign browser already listens there, our Chrome
    silently gets no DevTools at all, and then we cannot tell whether the window
    we asked for ever appeared.
    """
    owner = cdp_owner(CDP_PORT)
    if owner is not None:
        return CDP_PORT if holder_is_visible_here([owner]) else free_port()
    return free_port() if port_in_use(CDP_PORT) else CDP_PORT


# -------------------------------------------------------------- the window

def chrome_executable() -> str:
    for name in CHROME_NAMES:
        if path := shutil.which(name):
            return path
    raise LaunchError("Google Chrome or Chromium is required for the desktop window")


def window_command(chrome: str, url: str, profile: Path, cdp_port: int, app_id: str = APP_ID) -> list[str]:
    """The app-window command line, as a value so a test can read it without a display."""
    return [
        chrome, f"--app={url}", f"--class={app_id}", f"--name={app_id}",
        f"--user-data-dir={profile}", "--no-first-run", "--no-default-browser-check",
        f"--remote-debugging-port={cdp_port}",
    ]


def cdp_page(url: str, port: int, timeout: float = 0.8) -> dict | None:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=timeout) as response:
            targets = json.load(response)
    except (OSError, ValueError, urllib.error.URLError):
        return None
    for target in targets:
        if target.get("type") == "page" and str(target.get("url", "")).startswith(url):
            return target
    return None


def raise_window(app_id: str = APP_ID) -> bool:
    """Actually put an existing app window in front, and say whether it worked.

    WHY this is not `/json/activate`, which is what used to do the raising:
    CDP's activate selects the right TAB and asks Chrome to bring its own window
    up — and a window manager is free to refuse that. GNOME's mutter does refuse
    it: a client raising itself with no user-interaction timestamp is denied and
    merely flagged "demands attention". So the press returned True, the window
    never moved, and from a seat in front of the screen that is indistinguishable
    from an icon that does nothing (measured 2026-09-24: two mapped, viewable
    `systemsketch` windows sitting on the current workspace while a fresh press
    printed its URL and changed nothing).

    A window tool sends `_NET_ACTIVE_WINDOW` with the PAGER source indication,
    which mutter honours by design — that is the whole difference, and it is why
    the archived app's launcher has always raised its window this way
    (`~/.local/share/systemsketch/runtime/bin/launch_systemsketch.py:304`,
    `focus_existing`). Returning False when it cannot is what lets the caller
    fall through and open a real window instead of reporting a raise that never
    happened.
    """
    tool = shutil.which("xdotool")
    if not tool or not this_display():
        return False
    # APP_ID is ours and always a plain identifier; keep the regex anchored so a
    # stray value can never widen the match to another app's windows.
    if not app_id.replace("-", "").replace("_", "").isalnum():
        return False
    found = subprocess.run([tool, "search", "--onlyvisible", "--class", f"^{app_id}$"],
                           check=False, capture_output=True, text=True)
    windows = found.stdout.split() if found.returncode == 0 else []
    for window in reversed(windows):  # most recently mapped first
        activated = subprocess.run([tool, "windowactivate", window], check=False, capture_output=True)
        if activated.returncode == 0:
            return True
    return False


def focus_open_window(url: str) -> bool:
    """Bring forward a window already showing the new app — only ever OUR window.

    WHY the window check: a page on this URL inside a browser with no window on
    THIS display belongs to somebody else (an agent's hidden Xvfb). Activating
    it answers a dock press with success and leaves this screen empty — reason 2
    in the section comment above, and half of why the icon went dead.
    """
    owner = cdp_owner(CDP_PORT)
    if owner is None or not holder_is_visible_here([owner]):
        return False
    target = cdp_page(url, CDP_PORT)
    if target is None:
        return False
    try:
        # Selects the right tab inside the window; on its own it does NOT raise.
        urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json/activate/{target['id']}", timeout=0.8).close()
    except (OSError, urllib.error.URLError):
        return False
    # The raise is the thing the press is actually for. If it fails, say so, so
    # `open_window` opens a window rather than calling a no-op a success.
    return raise_window()


def confirm_window(url: str, cdp_port: int, profile: Path, timeout: float = 25.0) -> bool:
    """Wait for the window to really exist. A press that opened nothing must not look green."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if cdp_page(url, cdp_port) is not None:
            return True
        time.sleep(0.4)
    # Last resort: Chrome can be alive with no DevTools (something else bound
    # the port). A window of ours on this display is weaker evidence than a
    # page, but it is still evidence, and it beats crying wolf at a real window.
    return holder_is_visible_here(profile_holders(profile)) and bool(profile_holders(profile))


def open_window(url: str) -> None:
    if focus_open_window(url):
        return
    chrome = chrome_executable()
    profile = launch_profile()
    cdp_port = launch_cdp_port()
    profile.mkdir(parents=True, exist_ok=True)
    subprocess.Popen(
        window_command(chrome, url, profile, cdp_port),
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        start_new_session=True, close_fds=True,
    )
    if not confirm_window(url, cdp_port, profile):
        notify(
            "bbox-ui did not open",
            f"Chrome started but no window appeared on {this_display() or 'this session'}. "
            f"Run `{Path(__file__).name} --status`; the server log is {STATE_HOME / 'server.log'}.",
        )


# ---------------------------------------------------------- headless (agents)
#
# WHY headless is how an AGENT opens this app, and the visible window is only
# ever for Zach: he works while agents run in the background, so a window on his
# screen costs him the sentence he was typing. And — the harder reason — the
# desktop profile and DevTools port are machine-wide mutexes (see above), so an
# agent that opens the app on the shared profile TAKES THE LOCK HIS DOCK ICON
# NEEDS and breaks the very thing it is verifying. That is not hypothetical: it
# is what this file was fixed for. Everything below is private to the run —
# its own X display, its own throwaway profile, its own port — so a headless
# check cannot collide with his desktop, or with another agent's.

def free_display() -> int:
    """A display number nothing has claimed. `/tmp/.X<n>-lock` is Xvfb's own interlock."""
    for number in range(90, 160):
        if Path(f"/tmp/.X{number}-lock").exists() or Path(f"/tmp/.X11-unix/X{number}").exists():
            continue
        return number
    raise LaunchError("no free X display number between :90 and :159")


def headless_command(chrome: str, url: str, profile: Path, cdp_port: int, size: str = "1600,1000") -> list[str]:
    """Same app window, private profile and port — as a value, so a test can read it."""
    return [*window_command(chrome, url, profile, cdp_port), f"--window-size={size}"]


def capture_display(display: str, path: Path, size: str = "1600x1000") -> bool:
    """One frame of the real X display, via ffmpeg's x11grab. No ImageMagick on this box."""
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        print("no ffmpeg — skipping the screenshot", file=sys.stderr)
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [ffmpeg, "-y", "-loglevel", "error", "-f", "x11grab", "-video_size", size,
         "-i", display, "-frames:v", "1", str(path)],
        check=False, capture_output=True, text=True,
    )
    if result.returncode != 0:
        print(f"screenshot failed: {result.stderr.strip()}", file=sys.stderr)
        return False
    return True


def open_window_headless(url: str, screenshot: Path | None, hold: float) -> int:
    """Bring the app up on a private display, prove it rendered, tear it all down."""
    xvfb = shutil.which("Xvfb")
    if xvfb is None:
        raise LaunchError("Xvfb is required for --headless (apt install xvfb)")
    chrome = chrome_executable()
    number = free_display()
    display = f":{number}"
    size = "1600x1000"
    profile = Path(tempfile.mkdtemp(prefix="bbox-ui-headless-"))
    cdp_port = free_port()
    server = subprocess.Popen(
        [xvfb, display, "-screen", "0", f"{size}x24"],
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    browser: subprocess.Popen | None = None
    try:
        for _ in range(50):
            if Path(f"/tmp/.X11-unix/X{number}").exists():
                break
            if server.poll() is not None:
                raise LaunchError(f"Xvfb {display} exited before it was ready")
            time.sleep(0.1)
        else:
            raise LaunchError(f"Xvfb {display} did not come up")
        environment = {**os.environ, "DISPLAY": display}
        environment.pop("WAYLAND_DISPLAY", None)
        browser = subprocess.Popen(
            headless_command(chrome, url, profile, cdp_port, size.replace("x", ",")),
            env=environment, stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, close_fds=True,
        )
        deadline = time.time() + 40
        target = None
        while time.time() < deadline and (target := cdp_page(url, cdp_port)) is None:
            if browser.poll() is not None:
                raise LaunchError(f"the browser exited before the page loaded (see {url})")
            time.sleep(0.4)
        if target is None:
            raise LaunchError(f"{url} never rendered on {display} — nothing to verify")
        # WHY flush: an agent reads these lines to learn the display and the
        # endpoint WHILE the run is still up. Python block-buffers a redirected
        # stdout, so without this they arrive only after the run has torn
        # itself down — measured: a recorder polled for the display for sixty
        # seconds, got it at exit, and grabbed a display that no longer existed.
        print(f"Headless: {url} rendered on {display} — {target.get('title', '')!r}", flush=True)
        print(f"DevTools: http://127.0.0.1:{cdp_port} (attach with CDP to drive it)", flush=True)
        if screenshot is not None:
            # Give tldraw a beat to paint its first frame before grabbing one.
            time.sleep(2.0)
            if capture_display(display, screenshot, size):
                print(f"Screenshot: {screenshot}", flush=True)
        if hold > 0:
            print(f"Holding {display} for {hold:g}s — then it is torn down.", flush=True)
            time.sleep(hold)
        return 0
    finally:
        for process, label in ((browser, "browser"), (server, f"Xvfb {display}")):
            if process is None or process.poll() is not None:
                continue
            process.terminate()
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                process.kill()
            print(f"Stopped the headless {label}")
        shutil.rmtree(profile, ignore_errors=True)


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


def refresh_dock_icon() -> None:
    """Re-sync the dock icon from the site's mark — scripts/dock_icon.py says why it is needed.

    WHY on every window open: pressing the icon is the one thing that reliably
    happens after the mark changes on main, so the dock can no longer lag the
    site the way it did for four redesigns running. WHY it never raises: a
    cosmetic file must not be able to stop the window opening.
    """
    try:
        changed = dock_icon.sync()
    except Exception as cause:  # noqa: BLE001 — see WHY above
        print(f"dock icon not refreshed: {cause}", file=sys.stderr)
        return
    if changed:
        print(f"Dock icons: refreshed {len(changed)} files from their artwork")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("file", nargs="?", type=Path)
    parser.add_argument("--open", dest="open_window", action="store_true")
    parser.add_argument("--update", action="store_true")
    parser.add_argument("--old", action="store_true")
    parser.add_argument("--status", action="store_true")
    parser.add_argument("--stop", action="store_true")
    parser.add_argument(
        "--headless", action="store_true",
        help="open the app on a private X display with a throwaway profile — how an agent verifies it",
    )
    parser.add_argument("--screenshot", type=Path, help="with --headless: write one PNG of the rendered app")
    parser.add_argument("--hold", type=float, default=0.0, help="with --headless: keep it up this many seconds")
    parser.add_argument("--serve", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--root", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--build", help=argparse.SUPPRESS)
    arguments = parser.parse_args()
    # WHY an env var beside the flag: an agent's harness sets it once for a whole
    # session, so no individual call can forget and put a window on Zach's screen.
    headless = arguments.headless or os.environ.get("SYSTEMSKETCH_NEXT_HEADLESS", "") not in ("", "0")
    try:
        if arguments.serve:
            serve(PORT, arguments.root, arguments.build)
            return 0
        own_file = arguments.file.expanduser().resolve() if arguments.file is not None else None
        if own_file is not None and opens_here(own_file):
            record = build_stable() if stable_record() is None else stable_record()
            ensure_server(record)
            print(board_url(own_file))
            if headless:
                return open_window_headless(board_url(own_file), arguments.screenshot, arguments.hold)
            # The ☰ "Switch to old SystemSketch" row needs the old Stable up.
            # Headless skipped it above on purpose: that launcher opens ITS window
            # on the same shared profile, which is the mutex this fix protects.
            legacy("--no-open", wait=False)
            refresh_dock_icon()
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
        if headless:
            return open_window_headless(url, arguments.screenshot, arguments.hold)
        if arguments.open_window:
            # The ☰ "Switch to old SystemSketch" row needs the old Stable up;
            # its launcher reuses a healthy one or starts it. Off the critical path.
            legacy("--no-open", wait=False)
            # Same deal for the ☰ "Open Storybook" row. Also off the critical
            # path — Storybook takes ~20s to serve, the window opens now.
            ensure_storybook()
            refresh_dock_icon()
            open_window(url)
        return 0
    except (OSError, LaunchError, subprocess.SubprocessError) as cause:
        print(f"SystemSketch launch error: {cause}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
