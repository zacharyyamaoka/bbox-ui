"""The dock-press bug, reproduced against real Chrome — on hidden displays only.

WHY a heavier test than the unit guards beside it: the failure was never in our
logic, it was in Chrome's. `google-chrome --app=… --user-data-dir=X` does not
fail when another browser holds X — it prints "Opening in existing browser
session", hands its command line over and exits 0, so the window opens on the
HOLDER's screen and the launcher reports success. No amount of stubbing proves
that is fixed; only a second live browser does.

So this file stands up a real foreign holder on its own Xvfb, then asks the
launcher to open a window on a DIFFERENT display, and insists the window lands
where it was asked for. `test_the_bug_is_real` pins Chrome's actual behaviour,
so if a future Chrome stops forwarding, this file says so instead of quietly
guarding nothing.

Nothing here ever touches `:0`. That is the rule this repo now runs on, and it
is also the bug: an agent that opens the app on Zach's display, or on the shared
profile, becomes the holder that swallows his next press.

Run: ``python3 -m pytest scripts/tests/test_window_guard_integration.py -v``
"""

from __future__ import annotations

import http.server
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = PROJECT_ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

import launch_systemsketch as launcher  # noqa: E402

PAGE = b"<!doctype html><title>guard fixture</title><h1>guard fixture</h1>"


class _Fixture(http.server.BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(PAGE)))
        self.end_headers()
        self.wfile.write(PAGE)

    def log_message(self, *_: object) -> None:
        pass


def chrome_or_none() -> str | None:
    try:
        return launcher.chrome_executable()
    except launcher.LaunchError:
        return None


@unittest.skipUnless(shutil.which("Xvfb") and chrome_or_none(), "needs Xvfb and Chrome")
class ForeignHolderTests(unittest.TestCase):
    """A browser on another display must not be able to absorb this press."""

    def setUp(self) -> None:
        self.cleanup: list = []
        self.chrome = chrome_or_none()
        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Fixture)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.shutdown)
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}/"
        # Stand in for the shared desktop profile and its fixed DevTools port.
        self.shared = Path(tempfile.mkdtemp(prefix="guard-shared-"))
        self.addCleanup(shutil.rmtree, self.shared, ignore_errors=True)
        self._patch(launcher, "PROFILE", self.shared)
        self._patch(launcher, "CDP_PORT", launcher.free_port())

    def _patch(self, module: object, name: str, value: object) -> None:
        original = getattr(module, name)
        setattr(module, name, value)
        self.addCleanup(setattr, module, name, original)

    def _display(self) -> str:
        """A private X display, torn down with the test. Never `:0`."""
        number = launcher.free_display()
        process = subprocess.Popen(
            [shutil.which("Xvfb"), f":{number}", "-screen", "0", "1280x800x24"],
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        self.addCleanup(self._stop, process)
        for _ in range(60):
            if Path(f"/tmp/.X11-unix/X{number}").exists():
                break
            time.sleep(0.1)
        else:
            self.fail(f"Xvfb :{number} never came up")
        return f":{number}"

    def _stop(self, process: subprocess.Popen) -> None:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                process.kill()

    def _browser(self, display: str, profile: Path, cdp: int) -> subprocess.Popen:
        import os
        environment = {**os.environ, "DISPLAY": display}
        environment.pop("WAYLAND_DISPLAY", None)
        process = subprocess.Popen(
            launcher.window_command(self.chrome, self.url, profile, cdp),
            env=environment, stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        self.addCleanup(self._stop, process)
        return process

    def _wait_for_page(self, cdp: int, timeout: float = 40.0) -> dict:
        deadline = time.time() + timeout
        while time.time() < deadline:
            if (target := launcher.cdp_page(self.url, cdp)) is not None:
                return target
            time.sleep(0.3)
        self.fail(f"no page for {self.url} on DevTools :{cdp} within {timeout:g}s")

    # ------------------------------------------------------------------

    def test_the_bug_is_real(self) -> None:
        """Chrome really does hand a second invocation to the first holder.

        This is the mechanism, pinned. If it ever stops being true the guards
        below are guarding nothing, and this test is how we find out.
        """
        hidden = self._display()
        self._browser(hidden, self.shared, launcher.CDP_PORT)
        self._wait_for_page(launcher.CDP_PORT)
        other = self._display()
        import os
        environment = {**os.environ, "DISPLAY": other}
        second = subprocess.run(
            launcher.window_command(self.chrome, self.url, self.shared, launcher.free_port()),
            env=environment, capture_output=True, text=True, timeout=60,
        )
        self.assertEqual(second.returncode, 0)
        self.assertIn("existing browser session", second.stderr + second.stdout)

    def test_a_press_opens_on_the_display_that_asked(self) -> None:
        """The fix, end to end: a foreign holder no longer swallows the window."""
        hidden = self._display()
        self._browser(hidden, self.shared, launcher.CDP_PORT)
        self._wait_for_page(launcher.CDP_PORT)

        desktop = self._display()          # stands in for Zach's seat
        self._patch(launcher, "this_display", lambda: desktop)
        import os
        original = os.environ.get("DISPLAY")
        os.environ["DISPLAY"] = desktop
        self.addCleanup(
            lambda: os.environ.__setitem__("DISPLAY", original) if original is not None
            else os.environ.pop("DISPLAY", None)
        )

        # MUTATION: make `launch_profile` return PROFILE and `focus_open_window`
        # skip its display check — i.e. the shipped code — and this fails exactly
        # the way the dock icon did: no browser of ours on `desktop`.
        self.assertFalse(launcher.focus_open_window(self.url), "a foreign page must not answer the press")
        chosen = launcher.launch_profile()
        self.assertNotEqual(chosen, self.shared, "it must step aside from a foreign-held profile")

        launcher.open_window(self.url)
        self.addCleanup(self._kill_holders, chosen)

        # The assertion that matters: a window for this app now exists on the
        # display that asked, owned by the browser holding the sibling profile.
        deadline = time.time() + 45
        holders: list[int] = []
        visible: set[int] | None = set()
        while time.time() < deadline:
            holders = launcher.profile_holders(chosen)
            visible = launcher.app_window_pids()
            if holders and visible and set(holders) & visible:
                break
            time.sleep(0.5)
        self.assertTrue(holders, "nothing took the sibling profile")
        self.assertIsNotNone(visible, "xdotool could not question the display")
        self.assertTrue(
            set(holders) & (visible or set()),
            f"no window on {desktop} owned by our browser; holders={holders} windows={visible}",
        )

    def _kill_holders(self, profile: Path) -> None:
        import os, signal
        for pid in launcher.profile_holders(profile):
            try:
                os.kill(pid, signal.SIGTERM)
            except OSError:
                pass
        shutil.rmtree(profile, ignore_errors=True)

    def test_headless_never_touches_the_shared_profile(self) -> None:
        """An agent's run must be incapable of becoming the holder."""
        before = launcher.profile_holders(self.shared)
        code = launcher.open_window_headless(self.url, None, 0.0)
        self.assertEqual(code, 0)
        self.assertEqual(
            launcher.profile_holders(self.shared),
            before,
            "a headless run added a holder to the shared profile",
        )


if __name__ == "__main__":
    unittest.main()
