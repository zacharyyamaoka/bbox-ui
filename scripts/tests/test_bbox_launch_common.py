"""bbox_launch_common.py's Stable-server guard rails — port occupation and
channel identity — exercised against a hand-seeded release_home so these
tests never run a real pnpm build or spawn the real bboxui_server.py.

Run: ``python3 -m pytest scripts/tests/test_bbox_launch_common.py -v`` or
``python3 -m unittest discover -s scripts/tests -t scripts/tests -v``
"""

from __future__ import annotations

import json
import socket
import sys
import tempfile
import threading
import unittest
from contextlib import closing
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = PROJECT_ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

import bbox_launch_common as blc  # noqa: E402
import bbox_release as br  # noqa: E402


def _free_port() -> int:
    with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class _JSONServer(HTTPServer):
    payload: dict | None = None  # None ⇒ answer every GET with 200 "not json"


def _make_handler():
    class Handler(BaseHTTPRequestHandler):
        server: _JSONServer

        def do_GET(self):  # noqa: N802
            if self.server.payload is None:
                body = b"plain text, not this protocol"
                self.send_response(200)
                self.send_header("Content-Type", "text/plain")
            else:
                body = json.dumps(self.server.payload).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):  # silence
            pass

    return Handler


class _FakeServer:
    """A minimal stand-in for a running bboxui_server.py (or any other
    process) bound to one port, answering a fixed /api/health payload."""

    def __init__(self, port: int, payload: dict | None):
        self.server = _JSONServer(("127.0.0.1", port), _make_handler())
        self.server.payload = payload
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def stop(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)


def _fixture_config(**overrides) -> br.ProductConfig:
    base = dict(
        slug="storybook",  # must be a real PRODUCTS key — ensure_stable_server
        # only ever needs this to spawn bboxui_server.py, which these tests
        # never reach (the guard raises first in every case below).
        product="bbox-launch-fixture",
        display_name="bbox-launch fixture",
        build_command=("run", "build"),
        output_dir="out",
        preview_command=lambda pnpm, port: [pnpm, "--version"],
        preview_env=lambda stable_port: {},
        preview_port=0,
        stable_port=0,
        release_home_env="BBOX_LAUNCH_FIXTURE_HOME_UNUSED",
        release_home_subdir="launch-fixture",
        state_home_env="BBOX_LAUNCH_FIXTURE_STATE_UNUSED",
        state_home_subdir="launch-fixture",
        deployed_url=None,
        app_id="bbox-launch-fixture",
        inject_badge=False,
    )
    base.update(overrides)
    return br.ProductConfig(**base)


def _seed_stable_channel(release_home: Path, config: br.ProductConfig, build: str) -> None:
    site_dir = br.release_site_dir(release_home, build)
    site_dir.mkdir(parents=True)
    (site_dir / "index.html").write_text("<html>fixture</html>")
    manifest = {
        "product": config.product,
        "schemaVersion": br.MANIFEST_SCHEMA_VERSION,
        "build": build,
        "commit": None,
        "branch": None,
        "dirty": None,
        "dirtyPaths": [],
        "builtAt": br.utc_now(),
        "fileCount": 1,
        "bytes": 20,
    }
    (br.release_root(release_home, build) / "manifest.json").write_text(json.dumps(manifest))
    br.write_channels(release_home, br.ReleaseChannels(stable=build), config)


class EnsureStableServerGuardTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.release_home = self.root / "release-home"
        self.state_home = self.root / "state-home"
        self.port = _free_port()
        self.config = _fixture_config(stable_port=self.port)
        self.build = "deadbeefcafefeed"
        _seed_stable_channel(self.release_home, self.config, self.build)
        self._fake_server: _FakeServer | None = None

    def tearDown(self) -> None:
        if self._fake_server is not None:
            self._fake_server.stop()

    def _occupy(self, payload: dict | None) -> None:
        self._fake_server = _FakeServer(self.port, payload)

    def test_refuses_a_port_held_by_something_that_is_not_bboxui(self) -> None:
        self._occupy(None)  # answers 200, but not our JSON protocol at all
        with self.assertRaisesRegex(br.ReleaseError, "not bbox-launch fixture"):
            blc.ensure_stable_server(self.release_home, self.state_home, self.config)

    def test_refuses_a_port_held_by_a_different_bboxui_channel(self) -> None:
        self._occupy({"product": self.config.product, "channel": "preview", "build": "whatever"})
        with self.assertRaisesRegex(br.ReleaseError, "occupied by another"):
            blc.ensure_stable_server(self.release_home, self.state_home, self.config)

    def test_returns_immediately_when_the_running_server_already_matches(self) -> None:
        self._occupy({"product": self.config.product, "channel": "stable", "build": self.build})
        url, payload = blc.ensure_stable_server(self.release_home, self.state_home, self.config)
        self.assertEqual(url, f"http://127.0.0.1:{self.port}/")
        self.assertEqual(payload["build"], self.build)

    def test_refuses_a_port_answering_a_different_product_entirely(self) -> None:
        # health() filters on `product`, so a real bboxui server for the
        # OTHER product (docs vs storybook) on this port must be refused
        # exactly like a stranger process — never mistaken for "already up".
        self._occupy({"product": "some-other-product", "channel": "stable", "build": "x"})
        with self.assertRaisesRegex(br.ReleaseError, "not bbox-launch fixture"):
            blc.ensure_stable_server(self.release_home, self.state_home, self.config)


class HealthTests(unittest.TestCase):
    def setUp(self) -> None:
        self.port = _free_port()
        self.config = _fixture_config(stable_port=self.port)
        self._fake_server: _FakeServer | None = None
        self.addCleanup(lambda: self._fake_server and self._fake_server.stop())

    def test_health_returns_none_for_a_foreign_product(self) -> None:
        self._fake_server = _FakeServer(self.port, {"product": "not-this-one", "channel": "stable"})
        self.assertIsNone(blc.health(self.port, self.config))

    def test_health_returns_none_for_a_non_json_response(self) -> None:
        self._fake_server = _FakeServer(self.port, None)
        self.assertIsNone(blc.health(self.port, self.config))

    def test_health_returns_the_payload_for_a_matching_product(self) -> None:
        self._fake_server = _FakeServer(self.port, {"product": self.config.product, "channel": "stable"})
        payload = blc.health(self.port, self.config)
        self.assertIsNotNone(payload)
        self.assertEqual(payload["channel"], "stable")

    def test_health_returns_none_when_nothing_is_listening(self) -> None:
        # No _FakeServer started at all.
        self.assertIsNone(blc.health(self.port, self.config, timeout=0.3))


if __name__ == "__main__":
    unittest.main()
