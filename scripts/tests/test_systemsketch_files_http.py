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
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = PROJECT_ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

import systemsketch_files  # noqa: E402
from systemsketch_files import (  # noqa: E402
    LISTENING_BANNER,
    PRODUCT,
    RecordingDesktop,
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


# --------------------------------------------------------------- the CSRF fence
# ADDED 2026-09-19 by the judge-fix lane `host-and-locks`, after an independent
# Codex judge reproduced a force-overwrite of a board from a foreign origin.
# NEW CASES ONLY — nothing above this line was weakened, skipped or reworded.
#
# The attack these cases pin, measured against the tree before the fix:
#
#     POST /api/workspace/file
#     Origin: http://localhost:31337
#     Content-Type: text/plain;charset=UTF-8
#     {"path": "<a board>", "source": "<theirs>", "force": true}
#
#     -> 200, and the board on disk was replaced.
#
# ``text/plain`` makes it a CORS *simple* request, so no preflight ever runs and
# ``handle_options`` never gets a say; ``force: true`` walks straight past the
# SHA-256 revision fence. The dock's Stable server mounts these routes on a
# KNOWN port (:4341) over the REAL home directory, so the file at stake is one
# of Zach's boards. The plan weights "His files are never damaged" at 25% and
# says why: a lost board is unrecoverable, a missing feature is not.
#
# These cases build their requests with ``urllib`` directly rather than through
# ``Http`` above, because ``Http.request`` re-stamps ``Content-Type:
# application/json`` on every body — which is exactly the header under test.


class GuardedHostTestCase(HostTestCase):
    def raw(self, method: str, route: str, body: object | None, **headers: str):
        """One request with EXACTLY the headers given — no json Content-Type
        added behind the test's back."""
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(self.http.origin + route, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                raw = response.read()
                return response.status, dict(response.headers), (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as error:
            raw = error.read()
            return error.code, dict(error.headers), (json.loads(raw) if raw else None)

    def create_board(self, name: str = "Zach.tldr") -> tuple[str, dict]:
        path = str(self.workspace / name)
        status, _, created = self.http.post("/api/workspace/file", {"path": path, "source": tldr("real"), "baseDigest": None})
        self.assertEqual(status, 200)
        return path, created


class StateChangingRequestGuardTests(GuardedHostTestCase):
    """A POST may change files only when the caller is provably not a foreign page."""

    def test_a_foreign_origin_text_plain_force_post_cannot_touch_a_board(self) -> None:
        path, _ = self.create_board()
        status, _, body = self.raw(
            "POST", "/api/workspace/file",
            {"path": path, "source": tldr("stolen"), "baseDigest": None, "force": True},
            **{"Content-Type": "text/plain;charset=UTF-8", "Origin": "http://localhost:31337"},
        )
        self.assertEqual(status, 403)
        self.assertIn("error", body)
        self.assertIn('"shape:real"', Path(path).read_text())

    def test_a_foreign_origin_json_post_is_refused_too(self) -> None:
        path, created = self.create_board()
        for origin in ("http://localhost:31337", "http://127.0.0.1:31337", "http://evil.example", "null"):
            status, _, body = self.raw(
                "POST", "/api/workspace/file",
                {"path": path, "source": tldr("stolen"), "baseDigest": created["digest"]},
                **{"Content-Type": "application/json", "Origin": origin},
            )
            self.assertEqual(status, 403, origin)
            self.assertIn("error", body)
        self.assertIn('"shape:real"', Path(path).read_text())

    def test_a_same_origin_save_still_works_fenced_and_forced(self) -> None:
        path, created = self.create_board()
        same = self.http.origin
        status, _, updated = self.raw(
            "POST", "/api/workspace/file",
            {"path": path, "source": tldr("next"), "baseDigest": created["digest"]},
            **{"Content-Type": "application/json", "Origin": same},
        )
        self.assertEqual(status, 200)
        self.assertIn('"shape:next"', Path(path).read_text())
        status, _, forced = self.raw(
            "POST", "/api/workspace/file",
            {"path": path, "source": tldr("forced"), "baseDigest": None, "force": True},
            **{"Content-Type": "application/json; charset=utf-8", "Origin": same},
        )
        self.assertEqual(status, 200)
        self.assertIn('"shape:forced"', Path(path).read_text())
        self.assertNotEqual(forced["digest"], updated["digest"])

    def test_a_save_with_no_origin_header_at_all_still_works(self) -> None:
        """The dock's own page is same-origin; curl, the smoke suite and a
        server-side proxy send no Origin at all. Only a browser page does."""
        path = str(self.workspace / "Headless.tldr")
        status, _, _ = self.raw(
            "POST", "/api/workspace/file",
            {"path": path, "source": tldr("plain"), "baseDigest": None},
            **{"Content-Type": "application/json"},
        )
        self.assertEqual(status, 200)
        self.assertTrue(Path(path).exists())

    def test_a_same_origin_post_that_is_not_json_is_refused(self) -> None:
        path, created = self.create_board()
        for content_type in ("text/plain;charset=UTF-8", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x"):
            status, _, body = self.raw(
                "POST", "/api/workspace/file",
                {"path": path, "source": tldr("stolen"), "baseDigest": created["digest"]},
                **{"Content-Type": content_type, "Origin": self.http.origin},
            )
            self.assertEqual(status, 403, content_type)
            self.assertIn("error", body)
        self.assertIn('"shape:real"', Path(path).read_text())

    def test_a_post_with_no_content_type_is_refused(self) -> None:
        path, created = self.create_board()
        status, _, body = self.raw(
            "POST", "/api/workspace/file",
            {"path": path, "source": tldr("stolen"), "baseDigest": created["digest"]},
        )
        self.assertEqual(status, 403)
        self.assertIn("error", body)
        self.assertIn('"shape:real"', Path(path).read_text())

    def test_every_state_changing_route_is_fenced_not_just_save(self) -> None:
        """A route left out of the fence is a route that still damages files."""
        path, created = self.create_board("Family.tldr")
        foreign = {"Content-Type": "text/plain;charset=UTF-8", "Origin": "http://localhost:31337"}
        attacks = (
            ("/api/workspace/file", {"path": path, "source": tldr("stolen"), "baseDigest": None, "force": True}),
            ("/api/workspace/directory", {"parent": str(self.workspace), "name": "Injected"}),
            ("/api/workspace/rename", {"path": path, "destination": str(self.workspace / "Gone.tldr"), "baseDigest": created["digest"]}),
            ("/api/workspace/trash", {"path": path, "baseDigest": created["digest"]}),
            ("/api/workspace/reveal", {"path": path}),
        )
        for route, body in attacks:
            status, _, answer = self.raw("POST", route, body, **foreign)
            self.assertEqual(status, 403, route)
            self.assertIn("error", answer)
        self.assertIn('"shape:real"', Path(path).read_text())
        self.assertFalse((self.workspace / "Injected").exists())
        self.assertFalse((self.workspace / "Gone.tldr").exists())
        self.assertFalse((self.trash_dir / "Family.tldr").exists())
        self.assertEqual(self.desktop_calls(), [])

    def test_an_unknown_post_route_is_still_a_404_not_a_403(self) -> None:
        """The fence sits INSIDE the route check, so an unknown path keeps the
        donor's 404 instead of leaking which paths this host answers."""
        status, _, body = self.raw(
            "POST", "/api/workspace/pick", {},
            **{"Content-Type": "text/plain", "Origin": "http://localhost:31337"},
        )
        self.assertEqual(status, 404)
        self.assertEqual(body, {"error": "not found"})


class LoopbackCorsGuardTests(GuardedHostTestCase):
    """``--cors-loopback`` widens who may READ a response; it must not widen
    who may WRITE without passing a preflight the browser would have run."""

    cors_loopback = True

    def test_a_loopback_origin_may_save_with_json_but_never_as_a_simple_request(self) -> None:
        path = str(self.workspace / "Dev.tldr")
        status, _, created = self.raw(
            "POST", "/api/workspace/file",
            {"path": path, "source": tldr("dev"), "baseDigest": None},
            **{"Content-Type": "application/json", "Origin": "http://localhost:5173"},
        )
        self.assertEqual(status, 200)
        status, _, _ = self.raw(
            "POST", "/api/workspace/file",
            {"path": path, "source": tldr("stolen"), "baseDigest": None, "force": True},
            **{"Content-Type": "text/plain;charset=UTF-8", "Origin": "http://localhost:5173"},
        )
        self.assertEqual(status, 403)
        self.assertIn('"shape:dev"', Path(path).read_text())
        self.assertEqual(created["digest"], self.http.get("/api/workspace/stat", path=path)[2]["digest"])

    def test_a_non_loopback_origin_may_never_save_even_with_json(self) -> None:
        path = str(self.workspace / "Dev.tldr")
        self.http.post("/api/workspace/file", {"path": path, "source": tldr("dev"), "baseDigest": None})
        for origin in ("http://evil.example", "https://localhost.evil.example", "http://127.0.0.1.evil.example:80"):
            status, _, _ = self.raw(
                "POST", "/api/workspace/file",
                {"path": path, "source": tldr("stolen"), "baseDigest": None, "force": True},
                **{"Content-Type": "application/json", "Origin": origin},
            )
            self.assertEqual(status, 403, origin)
        self.assertIn('"shape:dev"', Path(path).read_text())


if __name__ == "__main__":
    import unittest.mock  # noqa: F401 — ANY in the missing-document test

    unittest.main()
