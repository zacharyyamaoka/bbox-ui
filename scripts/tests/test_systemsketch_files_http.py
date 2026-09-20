"""Acceptance for the file host's HTTP surface: the routes, the standalone CLI, and the dock mount.

ACCEPTANCE committed by the planning lane (docs/CHROME-FILES-SETTINGS-PLAN.md)
BEFORE any builder; off-limits to lane ``file-host``.

The shapes asserted here are the donor's (``/home/bam/systemsketch/scripts/
server.py:530-760``) — the same JSON the archived app's client already parses,
so ``apps/storybook-basics/src/files/workspaceClient.ts`` ports unchanged.

Every server here binds 127.0.0.1 on an EPHEMERAL port over a
``tempfile.TemporaryDirectory`` and is shut down in ``tearDown``/``finally``.
Nothing touches ``/home/bam/SystemSketch``, the desktop Trash (a
``RecordingDesktop`` stands in), a file manager, or any of the reserved ports.

Run: ``python3 -m unittest discover -s scripts/tests -t scripts/tests -v``
"""

from __future__ import annotations

import functools
import json
import os
import signal
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import unittest.mock
import urllib.error
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = PROJECT_ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

import systemsketch_files  # noqa: E402
from systemsketch_files import (  # noqa: E402
    LISTENING_BANNER,
    PRODUCT,
    RecordingDesktop,
    WorkspaceApi,
    make_server,
)


def tldr(marker: str = "a") -> str:
    """A plain tldraw file, the only kind this app writes."""
    return json.dumps(
        {
            "tldrawFileFormatVersion": 1,
            "schema": {"schemaVersion": 2, "sequences": {}},
            "records": [{"id": f"shape:{marker}", "typeName": "shape", "type": "ss-block"}],
        }
    )


class Http:
    def __init__(self, origin: str):
        self.origin = origin

    def request(self, method: str, path: str, body: object | None = None, headers: dict[str, str] | None = None):
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(self.origin + path, data=data, method=method, headers=headers or {})
        if data is not None:
            request.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                raw = response.read()
                return response.status, dict(response.headers), (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as error:
            raw = error.read()
            return error.code, dict(error.headers), (json.loads(raw) if raw else None)

    def get(self, route: str, **query: str):
        # The first parameter is `route`, NOT `path`: these routes take a query
        # parameter literally called `path`, and `get("/api/workspace/file",
        # path=p)` would otherwise raise TypeError before any request is made.
        suffix = ("?" + urllib.parse.urlencode(query)) if query else ""
        return self.request("GET", route + suffix)

    def post(self, path: str, body: object):
        return self.request("POST", path, body)


class HostTestCase(unittest.TestCase):
    cors_loopback = False

    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        base = Path(self.temporary.name).resolve()
        self.files_root = base / "home"
        self.workspace = self.files_root / "SystemSketch"
        self.workspace.mkdir(parents=True)
        self.lock_root = base / "locks"
        self.desktop_log = base / "desktop.jsonl"
        self.trash_dir = base / "trash"
        self.server = make_server(
            self.files_root,
            self.lock_root,
            RecordingDesktop(self.desktop_log, self.trash_dir),
            host="127.0.0.1",
            port=0,
            cors_loopback=self.cors_loopback,
        )
        host, port = self.server.server_address[:2]
        self.http = Http(f"http://{host}:{port}")
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        self.temporary.cleanup()

    def desktop_calls(self) -> list[dict]:
        if not self.desktop_log.exists():
            return []
        return [json.loads(line) for line in self.desktop_log.read_text().splitlines() if line.strip()]


class RoutesTests(HostTestCase):
    def test_health_names_the_product_and_the_roots_it_serves(self) -> None:
        status, _, body = self.http.get("/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(body["product"], PRODUCT)
        self.assertEqual(body["filesRoot"], str(self.files_root))
        self.assertEqual(body["workspace"], str(self.workspace))

    def test_list_defaults_to_the_workspace_folder_and_carries_both_kinds(self) -> None:
        (self.workspace / "Robotics").mkdir()
        self.assertEqual(self.http.post("/api/workspace/file", {"path": str(self.workspace / "Arm.tldr"), "source": tldr(), "baseDigest": None})[0], 200)
        status, _, listing = self.http.get("/api/workspace/list")
        self.assertEqual(status, 200)
        self.assertEqual(listing["dir"], str(self.workspace))
        self.assertTrue(listing["exists"])
        self.assertEqual(listing["root"], str(self.files_root))
        self.assertEqual(listing["parent"], str(self.files_root))
        self.assertEqual([d["name"] for d in listing["directories"]], ["Robotics"])
        self.assertEqual([(d["title"], d["kind"]) for d in listing["documents"]], [("Arm", "tldraw")])
        for key in ("name", "path", "mtime", "size"):
            self.assertIn(key, listing["documents"][0])

    def test_list_refuses_a_folder_outside_the_files_root(self) -> None:
        status, _, body = self.http.get("/api/workspace/list", dir="/etc")
        self.assertEqual(status, 400)
        self.assertIn("error", body)

    def test_a_missing_document_reads_as_null_source_not_404(self) -> None:
        path = str(self.workspace / "Nothing.tldr")
        self.assertEqual(self.http.get("/api/workspace/file", path=path), (200, unittest.mock.ANY, {"path": path, "source": None}))
        self.assertEqual(self.http.get("/api/workspace/stat", path=path)[2], {"path": path, "mtime": None})

    def test_create_only_save_then_digest_fenced_updates(self) -> None:
        path = str(self.workspace / "Board.tldr")
        status, _, created = self.http.post("/api/workspace/file", {"path": path, "source": tldr("1"), "baseDigest": None})
        self.assertEqual(status, 200)
        self.assertEqual(set(created), {"path", "title", "digest", "mtime", "size"})
        self.assertEqual(created["title"], "Board")

        # A second create-only save of the same path is a conflict, never an overwrite.
        status, _, conflict = self.http.post("/api/workspace/file", {"path": path, "source": tldr("2"), "baseDigest": None})
        self.assertEqual(status, 409)
        self.assertIs(conflict["conflict"], True)
        self.assertEqual(conflict["digest"], created["digest"])
        self.assertIsInstance(conflict["mtime"], (int, float))
        self.assertIsInstance(conflict["error"], str)

        status, _, loaded = self.http.get("/api/workspace/file", path=path)
        self.assertEqual(status, 200)
        self.assertEqual(loaded["digest"], created["digest"])
        self.assertIn('"shape:1"', loaded["source"])

        status, _, updated = self.http.post("/api/workspace/file", {"path": path, "source": tldr("3"), "baseDigest": created["digest"]})
        self.assertEqual(status, 200)
        self.assertNotEqual(updated["digest"], created["digest"])

        # The client still holding the OLD digest is refused, and the disk keeps the newer bytes.
        status, _, stale = self.http.post("/api/workspace/file", {"path": path, "source": tldr("4"), "baseDigest": created["digest"]})
        self.assertEqual(status, 409)
        self.assertIs(stale["conflict"], True)
        self.assertIn('"shape:3"', Path(path).read_text())

        # Only an explicit force replaces.
        status, _, forced = self.http.post("/api/workspace/file", {"path": path, "source": tldr("5"), "baseDigest": None, "force": True})
        self.assertEqual(status, 200)
        self.assertIn('"shape:5"', Path(path).read_text())
        self.assertEqual(self.http.get("/api/workspace/stat", path=path)[2]["digest"], forced["digest"])

    def test_writes_are_fenced_to_the_files_root_and_to_known_suffixes(self) -> None:
        outside = tempfile.mkdtemp()
        try:
            status, _, body = self.http.post("/api/workspace/file", {"path": os.path.join(outside, "x.tldr"), "source": tldr(), "baseDigest": None})
            self.assertEqual(status, 409)
            self.assertIn("error", body)
            self.assertFalse(Path(outside, "x.tldr").exists())
        finally:
            os.rmdir(outside)
        status, _, body = self.http.post("/api/workspace/file", {"path": str(self.workspace / "notes.json"), "source": tldr(), "baseDigest": None})
        self.assertEqual(status, 409)
        self.assertFalse((self.workspace / "notes.json").exists())

    def test_a_tldr_is_held_to_the_plain_tldraw_contract(self) -> None:
        envelope = json.loads(tldr())
        envelope["systemSketch"] = {"formatVersion": 2}
        status, _, body = self.http.post("/api/workspace/file", {"path": str(self.workspace / "Wrapped.tldr"), "source": json.dumps(envelope), "baseDigest": None})
        self.assertEqual(status, 409)
        self.assertIn("plain tldraw", body["error"])

    def test_create_directory(self) -> None:
        status, _, created = self.http.post("/api/workspace/directory", {"parent": str(self.workspace), "name": "Robotics Ω"})
        self.assertEqual(status, 200)
        self.assertEqual(created, {"name": "Robotics Ω", "path": str(self.workspace / "Robotics Ω")})
        self.assertTrue((self.workspace / "Robotics Ω").is_dir())
        status, _, again = self.http.post("/api/workspace/directory", {"parent": str(self.workspace), "name": "Robotics Ω"})
        self.assertEqual(status, 409)
        self.assertIn("already exists", again["error"])

    def test_rename_is_revision_checked_and_stays_in_its_folder(self) -> None:
        path = self.workspace / "Old.tldr"
        _, _, created = self.http.post("/api/workspace/file", {"path": str(path), "source": tldr(), "baseDigest": None})
        status, _, body = self.http.post("/api/workspace/rename", {"path": str(path), "destination": str(self.workspace / "New.tldr")})
        self.assertEqual(status, 409)
        self.assertIn("baseDigest must be a non-empty string", body["error"])
        status, _, body = self.http.post("/api/workspace/rename", {"path": str(path), "destination": str(self.workspace / "New.tldr"), "baseDigest": "stale"})
        self.assertEqual(status, 409)
        self.assertIs(body["conflict"], True)
        status, _, renamed = self.http.post("/api/workspace/rename", {"path": str(path), "destination": str(self.workspace / "New.tldr"), "baseDigest": created["digest"]})
        self.assertEqual(status, 200)
        self.assertEqual(renamed["path"], str(self.workspace / "New.tldr"))
        self.assertEqual(renamed["title"], "New")
        self.assertFalse(path.exists())
        self.assertTrue((self.workspace / "New.tldr").exists())

    def test_trash_goes_through_the_injected_desktop_and_is_revision_checked(self) -> None:
        path = self.workspace / "Doomed.tldr"
        _, _, created = self.http.post("/api/workspace/file", {"path": str(path), "source": tldr(), "baseDigest": None})
        status, _, body = self.http.post("/api/workspace/trash", {"path": str(path), "baseDigest": "stale"})
        self.assertEqual(status, 409)
        self.assertTrue(path.exists())
        status, _, body = self.http.post("/api/workspace/trash", {"path": str(path), "baseDigest": created["digest"]})
        self.assertEqual(status, 200)
        self.assertEqual(body, {"path": str(path), "trashed": True})
        self.assertFalse(path.exists())
        self.assertTrue((self.trash_dir / "Doomed.tldr").exists())
        self.assertEqual(self.desktop_calls(), [{"action": "trash", "path": str(path)}])

    def test_reveal_opens_the_parent_folder_through_the_injected_desktop(self) -> None:
        path = self.workspace / "Shown.tldr"
        self.http.post("/api/workspace/file", {"path": str(path), "source": tldr(), "baseDigest": None})
        status, _, body = self.http.post("/api/workspace/reveal", {"path": str(path)})
        self.assertEqual(status, 200)
        self.assertEqual(body, {"path": str(path), "revealed": True})
        self.assertEqual(self.desktop_calls(), [{"action": "reveal", "path": str(self.workspace)}])

    def test_unknown_routes_and_bad_bodies_answer_json_errors(self) -> None:
        status, _, body = self.http.post("/api/workspace/pick", {})
        self.assertEqual(status, 404)
        self.assertEqual(body, {"error": "not found"})
        request = urllib.request.Request(self.http.origin + "/api/workspace/file", data=b"{not json", method="POST", headers={"Content-Type": "application/json"})
        with self.assertRaises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(request, timeout=10)
        self.assertEqual(caught.exception.code, 409)
        self.assertIn("error", json.loads(caught.exception.read()))

    def test_json_answers_are_never_cached(self) -> None:
        _, headers, _ = self.http.get("/api/workspace/list")
        lowered = {key.lower(): value for key, value in headers.items()}
        self.assertEqual(lowered.get("cache-control"), "no-store")
        self.assertTrue(lowered.get("content-type", "").startswith("application/json"))

    def test_no_cors_headers_unless_asked_for(self) -> None:
        _, headers, _ = self.http.request("GET", "/api/workspace/list", headers={"Origin": "http://localhost:5173"})
        self.assertNotIn("access-control-allow-origin", {key.lower() for key in headers})


class LoopbackCorsTests(HostTestCase):
    cors_loopback = True

    def test_a_loopback_origin_is_echoed_and_preflight_answers(self) -> None:
        for origin in ("http://localhost:63315", "http://127.0.0.1:4999"):
            _, headers, _ = self.http.request("GET", "/api/workspace/list", headers={"Origin": origin})
            lowered = {key.lower(): value for key, value in headers.items()}
            self.assertEqual(lowered.get("access-control-allow-origin"), origin)
        status, headers, _ = self.http.request(
            "OPTIONS",
            "/api/workspace/file",
            headers={"Origin": "http://localhost:63315", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"},
        )
        lowered = {key.lower(): value for key, value in headers.items()}
        self.assertEqual(status, 204)
        self.assertEqual(lowered.get("access-control-allow-origin"), "http://localhost:63315")
        self.assertIn("POST", lowered.get("access-control-allow-methods", ""))
        self.assertIn("content-type", lowered.get("access-control-allow-headers", "").lower())

    def test_a_non_loopback_origin_is_never_echoed(self) -> None:
        for origin in ("http://evil.example", "https://localhost.evil.example", "http://127.0.0.1.evil.example:80"):
            _, headers, _ = self.http.request("GET", "/api/workspace/list", headers={"Origin": origin})
            self.assertNotIn("access-control-allow-origin", {key.lower() for key in headers}, origin)


class CliTests(unittest.TestCase):
    def test_serve_refuses_to_start_without_naming_its_files_root(self) -> None:
        completed = subprocess.run(
            [sys.executable, str(SCRIPTS / "systemsketch_files.py"), "serve", "--port", "0"],
            capture_output=True, text=True, timeout=30,
        )
        self.assertEqual(completed.returncode, 2)
        self.assertIn("--files-root", completed.stderr)

    def test_serve_prints_its_banner_serves_and_exits_cleanly_on_sigterm(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary).resolve()
            (base / "home" / "SystemSketch").mkdir(parents=True)
            process = subprocess.Popen(
                [sys.executable, str(SCRIPTS / "systemsketch_files.py"), "serve",
                 "--files-root", str(base / "home"), "--lock-root", str(base / "locks"),
                 "--port", "0", "--desktop", f"record:{base / 'desktop.jsonl'}"],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
            )
            try:
                line = process.stdout.readline().strip()
                self.assertTrue(line.startswith(LISTENING_BANNER + " http://127.0.0.1:"), line)
                origin = line.split(" ", 1)[1]
                status, _, body = Http(origin).get("/api/health")
                self.assertEqual(status, 200)
                self.assertEqual(body["filesRoot"], str(base / "home"))
            finally:
                process.send_signal(signal.SIGTERM)
                try:
                    returncode = process.wait(timeout=10)
                finally:
                    if process.poll() is None:
                        process.kill()
                    process.stdout.close()
                    process.stderr.close()
            self.assertEqual(returncode, 0)

    def test_default_lock_root_shares_the_archived_apps_lock_folder_when_it_exists(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary)
            self.assertEqual(
                systemsketch_files.default_lock_root(home),
                home / ".local/state/systemsketch-next/locks/workspace",
            )
            legacy = home / ".local/share/systemsketch/runtime/locks/workspace"
            legacy.mkdir(parents=True)
            self.assertEqual(systemsketch_files.default_lock_root(home), legacy)


class DockMountTests(unittest.TestCase):
    """The dock's Stable server serves the app AND the routes, same origin."""

    def test_the_stable_handler_delegates_workspace_routes_and_still_serves_the_build(self) -> None:
        import launch_systemsketch  # noqa: E402 — scripts/ is on sys.path above

        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary).resolve()
            dist = base / "dist"
            dist.mkdir()
            (dist / "index.html").write_text("<!doctype html><title>SystemSketch</title>")
            files_root = base / "home"
            (files_root / "SystemSketch").mkdir(parents=True)
            api = WorkspaceApi(files_root, base / "locks", RecordingDesktop(base / "desktop.jsonl", base / "trash"))
            previous = getattr(launch_systemsketch.StableHandler, "workspace", None)
            launch_systemsketch.StableHandler.workspace = api
            server = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(launch_systemsketch.StableHandler, directory=str(dist)))
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                host, port = server.server_address[:2]
                http = Http(f"http://{host}:{port}")
                path = str(files_root / "SystemSketch" / "Dock.tldr")
                self.assertEqual(http.post("/api/workspace/file", {"path": path, "source": tldr(), "baseDigest": None})[0], 200)
                status, _, listing = http.get("/api/workspace/list")
                self.assertEqual(status, 200)
                self.assertEqual([d["title"] for d in listing["documents"]], ["Dock"])
                with urllib.request.urlopen(http.origin + "/", timeout=10) as response:
                    self.assertIn(b"SystemSketch", response.read())
                # /api/health stays the launcher's own (the build it serves), not the file host's.
                self.assertEqual(http.get("/api/health")[2]["product"], launch_systemsketch.PRODUCT)
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=5)
                launch_systemsketch.StableHandler.workspace = previous

    def test_the_launcher_serves_the_real_home_folder_by_default_and_honours_an_override(self) -> None:
        import launch_systemsketch  # noqa: E402

        self.assertEqual(launch_systemsketch.files_root_from({}), Path.home())
        self.assertEqual(launch_systemsketch.files_root_from({"SYSTEMSKETCH_FILES_ROOT": "/tmp/elsewhere"}), Path("/tmp/elsewhere"))


if __name__ == "__main__":
    import unittest.mock  # noqa: F401 — ANY in the missing-document test

    unittest.main()
