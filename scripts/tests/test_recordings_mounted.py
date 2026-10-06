"""Acceptance for MOUNTING the recording API — the routes reaching a real server.

ACCEPTANCE committed by the wiring lane BEFORE the builder; off-limits to it.

Lane ``devtools-2026-09-19`` wrote ``systemsketch_recordings.RecordingApi``
with the same ``handle_get``/``handle_post`` shape ``WorkspaceApi`` uses, and
said so in its own docstring: "so the same code serves the dock's server, a
vite dev proxy and the tests". Then nothing mounted it. Measured 2026-09-20:
``grep -rn RecordingApi scripts/ apps/`` finds the class definition and its
own tests, and no other reference anywhere — so every ``/api/recordings/*``
fetch from the app 404s, in dev and on the dock's Stable server alike.

``test_systemsketch_recordings.py`` already covers what the API DOES. This
file covers only that it is REACHABLE, which is the part that was missing.

Every server binds 127.0.0.1 on an ephemeral port over a temporary directory.
Nothing touches /home/bam/SystemSketch or any reserved port.

Run: ``python3 -m unittest discover -s scripts/tests -t scripts/tests -v``
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = PROJECT_ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

import systemsketch_files  # noqa: E402
from systemsketch_files import LISTENING_BANNER, RecordingDesktop, make_server  # noqa: E402
from systemsketch_recordings import RecordingApi  # noqa: E402


def get_json(origin: str, route: str) -> tuple[int, dict]:
    try:
        with urllib.request.urlopen(f"{origin}{route}", timeout=5) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:  # a 404 is an answer we assert on
        return error.code, {}


class RecordingRoutesOnTheDevHost(unittest.TestCase):
    """``systemsketch_files.make_server`` is what the vite dev proxy spawns."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.files_root = root / "files"
        self.files_root.mkdir()
        self.recordings = RecordingApi(self.files_root, source_root=PROJECT_ROOT)
        self.server = make_server(
            self.files_root,
            root / "locks",
            RecordingDesktop(root / "desktop.log", root / "trash"),
            recordings=self.recordings,
        )
        self.origin = f"http://127.0.0.1:{self.server.server_address[1]}"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        self.tmp.cleanup()

    def test_last_answers_200_with_null_rather_than_404(self) -> None:
        # The donor's own decision, and RecordingApi's docstring quotes the
        # reason: a 404 here prints a console error on every mount, into the
        # very lane the recorder captures.
        status, payload = get_json(self.origin, "/api/recordings/last")
        self.assertEqual(status, 200)
        self.assertIsNone(payload["recording"])

    def test_status_answers_the_sidecar_availability(self) -> None:
        status, payload = get_json(self.origin, "/api/recordings/status")
        self.assertEqual(status, 200)
        self.assertIsInstance(payload, dict)

    def test_bundle_answers_200_with_null_rather_than_404(self) -> None:
        status, payload = get_json(self.origin, "/api/recordings/bundle")
        self.assertEqual(status, 200)
        self.assertIsNone(payload["recording"])

    def test_the_workspace_routes_still_answer_beside_it(self) -> None:
        # Mounting a second API must not shadow the first.
        status, payload = get_json(self.origin, "/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(payload["product"], systemsketch_files.PRODUCT)

    def test_an_unmounted_server_is_unchanged(self) -> None:
        # `recordings` is optional: a host that passes nothing behaves exactly
        # as it did before this parameter existed.
        with tempfile.TemporaryDirectory() as other:
            root = Path(other)
            (root / "files").mkdir()
            server = make_server(
                root / "files", root / "locks", RecordingDesktop(root / "desktop.log", root / "trash")
            )
            origin = f"http://127.0.0.1:{server.server_address[1]}"
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                status, _ = get_json(origin, "/api/recordings/last")
                self.assertEqual(status, 404)
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=5)


class RecordingRoutesOnTheDockStableServer(unittest.TestCase):
    """``launch_systemsketch.StableHandler`` is the dock's one Stable origin."""

    def test_the_handler_dispatches_recordings_the_way_it_dispatches_workspace(self) -> None:
        import launch_systemsketch

        handler = launch_systemsketch.StableHandler
        self.assertTrue(
            hasattr(handler, "recordings"),
            "StableHandler needs a `recordings` mount beside `workspace` — "
            "the dock serves the built app and its API from ONE origin, so a "
            "second port for recordings would need a second trusted origin.",
        )
        self.assertIsNone(handler.recordings, "unmounted by default, like `workspace`")

        source = Path(launch_systemsketch.__file__).read_text(encoding="utf-8")
        self.assertIn(
            "self.recordings.handle_get(self)",
            source,
            "do_GET must delegate to the recordings mount",
        )
        self.assertIn(
            "self.recordings.handle_post(self)",
            source,
            "do_POST must delegate to the recordings mount",
        )


class RecordingRoutesThroughTheStandaloneCli(unittest.TestCase):
    """What the vite dev plugin actually spawns: ``serve … --recordings``."""

    def run_host(self, *extra: str) -> tuple[subprocess.Popen, str]:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name)
        (root / "files").mkdir()
        child = subprocess.Popen(
            [
                sys.executable,
                str(SCRIPTS / "systemsketch_files.py"),
                "serve",
                "--files-root",
                str(root / "files"),
                "--lock-root",
                str(root / "locks"),
                "--host",
                "127.0.0.1",
                "--port",
                "0",
                "--desktop",
                f"record:{root / 'desktop.log'}",
                *extra,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        self.addCleanup(lambda: (child.kill(), child.wait(timeout=5)))
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            line = child.stdout.readline()
            if line.startswith(LISTENING_BANNER):
                return child, line.split(" ", 1)[1].strip()
        raise AssertionError("the host never printed its listening banner")

    def test_with_the_flag_the_recording_routes_answer(self) -> None:
        _, origin = self.run_host("--recordings")
        status, payload = get_json(origin, "/api/recordings/last")
        self.assertEqual(status, 200)
        self.assertIsNone(payload["recording"])

    def test_without_the_flag_they_do_not_exist(self) -> None:
        _, origin = self.run_host()
        status, _ = get_json(origin, "/api/recordings/last")
        self.assertEqual(status, 404)

    def test_the_vite_dev_plugin_spawns_it_with_the_flag_and_proxies_the_prefix(self) -> None:
        # The dev proxy and the child it spawns have to agree, or the app's
        # fetch reaches a host that does not serve the route.
        source = (PROJECT_ROOT / "apps" / "systemsketch" / "devFileHost.ts").read_text(encoding="utf-8")
        self.assertIn('"--recordings"', source, "the spawned host must mount the recording API")
        self.assertIn('"/api/recordings"', source, "the proxy must forward the recording prefix")


if __name__ == "__main__":
    unittest.main()
