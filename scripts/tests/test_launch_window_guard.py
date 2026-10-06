"""The guards that keep a dock press from vanishing, and headless from stealing it.

WHY this file exists (2026-09-23): the bbox-ui dock icon went dead, and
`journalctl --user` showed why — three presses in twenty seconds, each printing
its URL and opening no window, exit 0 every time. The cause was not the server
and not the .desktop file. It was that the app window's Chrome `--user-data-dir`
and `--remote-debugging-port` are MACHINE-WIDE MUTEXES shared with the archived
app and therefore with every agent session, headless ones included:

  * a foreign browser holding the profile makes `google-chrome --app=…` print
    "Opening in existing browser session", forward its command line and exit 0,
    so the window opens on the HOLDER's display — measured, verbatim;
  * a foreign browser owning the DevTools port made `focus_open_window` activate
    ITS page and return True, so the launcher opened nothing at all.

Each test below is the red state of one of those. The whole point is that a
press either puts a window on THIS display or says so out loud, and that a
headless run can never be the browser that swallows it.

Run: ``python3 -m pytest scripts/tests/test_launch_window_guard.py -v``
"""

from __future__ import annotations

import sys
import unittest
import urllib.request
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = PROJECT_ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

import launch_systemsketch as launcher  # noqa: E402


def fake_browsers(*specs: tuple[int, str, int]) -> list[tuple[int, list[str]]]:
    """(pid, profile, cdp) triples as the argv shape `chrome_browsers` returns."""
    return [
        (pid, ["/opt/google/chrome/chrome", "--app=http://127.0.0.1:4341/",
               f"--user-data-dir={profile}", f"--remote-debugging-port={cdp}"])
        for pid, profile, cdp in specs
    ]


class HolderReadingTests(unittest.TestCase):
    """Reading the mutex: which live browser holds the profile, and the debug port."""

    def test_it_finds_the_holder_of_exactly_that_profile(self) -> None:
        browsers = fake_browsers((11, "/p/wanted", 4325), (12, "/p/other", 4326))
        self.assertEqual(launcher.profile_holders(Path("/p/wanted"), browsers=browsers), [11])

    def test_a_helper_process_is_not_a_holder(self) -> None:
        # MUTATION: drop the `--type=` test in `is_browser_argv` and a renderer
        # counts as holding the lock, so every press that already has a live
        # window takes the sibling-profile path for no reason at all.
        browser = ["/opt/google/chrome/chrome", "--app=x", "--user-data-dir=/p/wanted"]
        renderer = ["/opt/google/chrome/chrome", "--type=renderer", "--user-data-dir=/p/wanted"]
        self.assertTrue(launcher.is_browser_argv(browser))
        self.assertFalse(launcher.is_browser_argv(renderer))

    def test_only_chrome_counts(self) -> None:
        self.assertFalse(launcher.is_browser_argv(["/usr/bin/python3", "--user-data-dir=/p/wanted"]))
        self.assertFalse(launcher.is_browser_argv([]))

    def test_cdp_owner_is_the_browser_carrying_that_port(self) -> None:
        browsers = fake_browsers((21, "/p/a", 4325), (22, "/p/b", 9222))
        self.assertEqual(launcher.cdp_owner(9222, browsers=browsers), 22)

    def test_no_browser_on_the_port_is_reported_as_nobody(self) -> None:
        self.assertIsNone(launcher.cdp_owner(4325, browsers=fake_browsers((31, "/p/a", 9222))))


class CmdlineReadingTests(unittest.TestCase):
    """Chrome does not leave `/proc/<pid>/cmdline` NUL-separated, and that matters."""

    def test_it_splits_a_chrome_style_space_separated_cmdline(self) -> None:
        # MUTATION: drop the whitespace fallback in `process_argv` and every
        # guard in this file quietly answers "no holder" against a live browser
        # — the state the first cut of this fix actually shipped in, caught by
        # the integration test beside this one, not by review.
        import os
        written = Path(f"/proc/{os.getpid()}/cmdline")
        self.assertTrue(written.exists(), "this test reads /proc; it needs Linux")
        argv = launcher.process_argv(os.getpid())
        self.assertGreater(len(argv), 0)

    def test_the_fallback_recovers_flags_a_nul_split_would_hide(self) -> None:
        original = Path.read_bytes
        rewritten = b"/opt/google/chrome/chrome --type=renderer --user-data-dir=/p/x\0"
        try:
            Path.read_bytes = lambda self: rewritten  # type: ignore[assignment]
            argv = launcher.process_argv(1)
        finally:
            Path.read_bytes = original  # type: ignore[assignment]
        self.assertEqual(argv[0], "/opt/google/chrome/chrome")
        self.assertIn("--type=renderer", argv)
        self.assertIn("--user-data-dir=/p/x", argv)
        self.assertFalse(launcher.is_browser_argv(argv), "a helper must still be seen as a helper")

    def test_a_normal_nul_separated_cmdline_still_works(self) -> None:
        original = Path.read_bytes
        try:
            Path.read_bytes = lambda self: b"/usr/bin/python3\0-m\0pytest\0"  # type: ignore[assignment]
            self.assertEqual(launcher.process_argv(1), ["/usr/bin/python3", "-m", "pytest"])
        finally:
            Path.read_bytes = original  # type: ignore[assignment]


class ForeignDisplayTests(unittest.TestCase):
    """The core bug: a browser with no window here must never absorb this press."""

    def test_focus_refuses_a_page_owned_by_another_display(self) -> None:
        # MUTATION: delete the `holder_is_visible_here` call in
        # `focus_open_window` and this goes green-but-wrong — which is the
        # shipped bug. `cdp_page` is deliberately left reachable: the guard has
        # to refuse BEFORE consulting it, so a live foreign browser whose page
        # is perfectly findable still cannot answer the press.
        calls: list[str] = []
        original_owner, original_page, original_display = (
            launcher.cdp_owner, launcher.cdp_page, launcher.app_window_pids,
        )
        try:
            launcher.cdp_owner = lambda port, browsers=None: 99
            launcher.app_window_pids = lambda app_id=launcher.APP_ID: {1234}
            launcher.cdp_page = lambda url, port, timeout=0.8: calls.append(url) or {"id": "X"}
            self.assertFalse(launcher.focus_open_window("http://127.0.0.1:4341/"))
            self.assertEqual(calls, [], "it must not even look for a page in a foreign browser")
        finally:
            launcher.cdp_owner, launcher.cdp_page, launcher.app_window_pids = (
                original_owner, original_page, original_display,
            )

    def test_launch_profile_steps_aside_for_a_foreign_holder(self) -> None:
        # MUTATION: return PROFILE unconditionally and the press is forwarded to
        # the hidden browser, which is precisely how the icon died.
        original_holders, original_display = launcher.profile_holders, launcher.this_display
        original_windows = launcher.app_window_pids
        try:
            launcher.this_display = lambda: ":0"
            launcher.profile_holders = lambda profile, browsers=None: [4242]
            launcher.app_window_pids = lambda app_id=launcher.APP_ID: set()
            chosen = launcher.launch_profile()
            self.assertNotEqual(chosen, launcher.PROFILE)
            self.assertEqual(chosen.parent, launcher.PROFILE.parent)
            self.assertTrue(chosen.name.startswith(launcher.PROFILE.name))
        finally:
            launcher.profile_holders, launcher.this_display = original_holders, original_display
            launcher.app_window_pids = original_windows

    def test_launch_profile_keeps_the_shared_one_for_our_own_window(self) -> None:
        original_holders, original_display = launcher.profile_holders, launcher.this_display
        original_windows = launcher.app_window_pids
        try:
            launcher.this_display = lambda: ":0"
            launcher.profile_holders = lambda profile, browsers=None: [4242]
            launcher.app_window_pids = lambda app_id=launcher.APP_ID: {4242}
            self.assertEqual(launcher.launch_profile(), launcher.PROFILE)
        finally:
            launcher.profile_holders, launcher.this_display = original_holders, original_display
            launcher.app_window_pids = original_windows

    def test_an_undetectable_display_keeps_the_shared_profile(self) -> None:
        # MUTATION: make `holder_is_visible_here` return False when it cannot
        # ask, and a browser we simply could not question looks foreign — so
        # every press opens a SECOND window in a SECOND profile, which is worse
        # than the bug being fixed.
        original_holders, original_display = launcher.profile_holders, launcher.this_display
        original_windows = launcher.app_window_pids
        try:
            launcher.this_display = lambda: ":0"
            launcher.profile_holders = lambda profile, browsers=None: [4242]
            launcher.app_window_pids = lambda app_id=launcher.APP_ID: None
            self.assertEqual(launcher.launch_profile(), launcher.PROFILE)
        finally:
            launcher.profile_holders, launcher.this_display = original_holders, original_display
            launcher.app_window_pids = original_windows

    def test_cdp_port_is_surrendered_to_a_foreign_owner(self) -> None:
        original_owner, original_display = launcher.cdp_owner, launcher.this_display
        original_windows = launcher.app_window_pids
        try:
            launcher.this_display = lambda: ":0"
            launcher.cdp_owner = lambda port, browsers=None: 77
            launcher.app_window_pids = lambda app_id=launcher.APP_ID: set()
            self.assertNotEqual(launcher.launch_cdp_port(), launcher.CDP_PORT)
        finally:
            launcher.cdp_owner, launcher.this_display = original_owner, original_display
            launcher.app_window_pids = original_windows


class StaleLockTests(unittest.TestCase):
    """A SIGKILLed Chrome leaves the mutex behind; a live one must keep it."""

    def _profile(self) -> Path:
        import tempfile
        profile = Path(tempfile.mkdtemp(prefix="bbox-lock-test-"))
        (profile / "SingletonLock").symlink_to("bam-GPU-1234")
        (profile / "SingletonCookie").symlink_to("55")
        return profile

    def test_it_clears_a_lock_no_process_holds(self) -> None:
        profile = self._profile()
        original = launcher.profile_holders
        try:
            launcher.profile_holders = lambda p, browsers=None: []
            self.assertTrue(launcher.clear_stale_singletons(profile))
            self.assertFalse((profile / "SingletonLock").is_symlink())
        finally:
            launcher.profile_holders = original

    def test_it_never_clears_a_lock_a_live_browser_holds(self) -> None:
        # MUTATION: drop the holder check and two browsers share one profile,
        # which corrupts it. Removing a live mutex is worse than the bug.
        profile = self._profile()
        original = launcher.profile_holders
        try:
            launcher.profile_holders = lambda p, browsers=None: [1234]
            self.assertFalse(launcher.clear_stale_singletons(profile))
            self.assertTrue((profile / "SingletonLock").is_symlink())
        finally:
            launcher.profile_holders = original


class HeadlessIsolationTests(unittest.TestCase):
    """Headless must be incapable of taking the lock the dock icon needs."""

    def test_the_headless_command_never_names_the_shared_profile_or_port(self) -> None:
        # MUTATION: pass PROFILE or CDP_PORT into `headless_command` and every
        # agent run silently becomes the browser that swallows Zach's press.
        command = launcher.headless_command(
            "/usr/bin/google-chrome-stable", "http://127.0.0.1:4341/",
            Path("/tmp/bbox-ui-headless-xyz"), 41234,
        )
        joined = " ".join(command)
        self.assertNotIn(str(launcher.PROFILE), joined)
        self.assertNotIn(f"--remote-debugging-port={launcher.CDP_PORT}", joined)
        self.assertIn("--user-data-dir=/tmp/bbox-ui-headless-xyz", command)
        self.assertIn("--remote-debugging-port=41234", command)
        self.assertIn("--window-size=1600,1000", command)

    def test_a_free_display_is_never_the_desktop(self) -> None:
        # :0 is Zach's seat. A headless run that picks it is a focus steal.
        self.assertGreaterEqual(launcher.free_display(), 90)

    def test_free_display_skips_a_number_xvfb_already_locked(self) -> None:
        import tempfile
        original_exists = Path.exists
        taken = {f"/tmp/.X{n}-lock" for n in range(90, 95)}
        try:
            Path.exists = lambda self: str(self) in taken or original_exists(self)  # type: ignore[assignment]
            self.assertGreaterEqual(launcher.free_display(), 95)
        finally:
            Path.exists = original_exists  # type: ignore[assignment]
        del tempfile


class RaiseWindowTests(unittest.TestCase):
    """A press that finds an open window has to actually RAISE it.

    WHY these exist (2026-09-24): the press used CDP `/json/activate`, which
    selects a tab and asks Chrome to raise itself — and mutter refuses a
    self-raise that carries no user-interaction timestamp, flagging it "demands
    attention" instead. So `focus_open_window` returned True over a window that
    never moved. Measured that morning: two mapped, viewable `systemsketch`
    windows on the CURRENT workspace while a fresh dock press printed its URL
    and changed nothing on screen.

    These use a REAL fake executable on PATH rather than a stubbed
    `subprocess.run`, so the argv asserted below is the argv that would be run.
    """

    def _fake_tool(self, body: str) -> Path:
        import os, stat, tempfile
        directory = Path(tempfile.mkdtemp(prefix="fake-wm-tool-"))
        tool = directory / "xdotool"
        tool.write_text("#!/usr/bin/env bash\n" + body)
        tool.chmod(tool.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)
        original_path, original_display = os.environ.get("PATH", ""), os.environ.get("DISPLAY")
        os.environ["PATH"] = f"{directory}:{original_path}"
        os.environ["DISPLAY"] = ":0"
        def restore() -> None:
            os.environ["PATH"] = original_path
            if original_display is None:
                os.environ.pop("DISPLAY", None)
            else:
                os.environ["DISPLAY"] = original_display
        self.addCleanup(restore)
        return directory

    def test_it_activates_the_most_recent_matching_window(self) -> None:
        # MUTATION: drop the `windowactivate` call (i.e. go back to CDP-only)
        # and no activation is ever recorded — the shipped bug exactly.
        directory = self._fake_tool(
            'if [ "$1" = "search" ]; then echo 111; echo 222; exit 0; fi\n'
            'if [ "$1" = "windowactivate" ]; then echo "$2" >> "$(dirname "$0")/activated"; exit 0; fi\n'
            'exit 1\n'
        )
        self.assertTrue(launcher.raise_window("systemsketch"))
        self.assertEqual((directory / "activated").read_text().split(), ["222"],
                         "it must raise the most recently mapped window, not the oldest")

    def test_it_asks_for_the_app_class_anchored(self) -> None:
        directory = self._fake_tool(
            'if [ "$1" = "search" ]; then echo "$@" >> "$(dirname "$0")/searched"; echo 111; exit 0; fi\n'
            'exit 0\n'
        )
        launcher.raise_window("systemsketch")
        self.assertIn("--onlyvisible", (directory / "searched").read_text())
        self.assertIn("^systemsketch$", (directory / "searched").read_text())

    def test_no_matching_window_is_not_a_raise(self) -> None:
        # xdotool exits non-zero when its search matches nothing.
        self._fake_tool('exit 1\n')
        self.assertFalse(launcher.raise_window("systemsketch"))

    def test_a_failed_activation_is_reported_as_failure(self) -> None:
        # MUTATION: return True regardless and the caller believes a raise that
        # never happened, so it never falls through to opening a real window.
        self._fake_tool(
            'if [ "$1" = "search" ]; then echo 111; exit 0; fi\n'
            'exit 1\n'
        )
        self.assertFalse(launcher.raise_window("systemsketch"))

    def test_focus_is_false_when_the_raise_fails(self) -> None:
        # The whole point: a page found + a tab activated is NOT a raised window.
        originals = (launcher.cdp_owner, launcher.holder_is_visible_here,
                     launcher.cdp_page, launcher.raise_window)
        opened: list[str] = []
        try:
            launcher.cdp_owner = lambda port, browsers=None: 42
            launcher.holder_is_visible_here = lambda holders: True
            launcher.cdp_page = lambda url, port, timeout=0.8: {"id": "PAGE"}
            launcher.raise_window = lambda app_id=launcher.APP_ID: False
            original_open = urllib.request.urlopen
            urllib.request.urlopen = lambda url, timeout=None: opened.append(url) or _Closeable()
            try:
                self.assertFalse(launcher.focus_open_window("http://127.0.0.1:4341/"))
            finally:
                urllib.request.urlopen = original_open
            self.assertTrue(any("/json/activate/PAGE" in call for call in opened),
                            "it should still select the tab before trying to raise")
        finally:
            (launcher.cdp_owner, launcher.holder_is_visible_here,
             launcher.cdp_page, launcher.raise_window) = originals

    def test_focus_is_true_when_the_raise_works(self) -> None:
        originals = (launcher.cdp_owner, launcher.holder_is_visible_here,
                     launcher.cdp_page, launcher.raise_window)
        try:
            launcher.cdp_owner = lambda port, browsers=None: 42
            launcher.holder_is_visible_here = lambda holders: True
            launcher.cdp_page = lambda url, port, timeout=0.8: {"id": "PAGE"}
            launcher.raise_window = lambda app_id=launcher.APP_ID: True
            original_open = urllib.request.urlopen
            urllib.request.urlopen = lambda url, timeout=None: _Closeable()
            try:
                self.assertTrue(launcher.focus_open_window("http://127.0.0.1:4341/"))
            finally:
                urllib.request.urlopen = original_open
        finally:
            (launcher.cdp_owner, launcher.holder_is_visible_here,
             launcher.cdp_page, launcher.raise_window) = originals


class _Closeable:
    def close(self) -> None:
        return None


if __name__ == "__main__":
    unittest.main()
