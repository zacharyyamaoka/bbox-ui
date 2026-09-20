"""Acceptance for scripts/systemsketch_recordings.py.

The body of ``RecordingStoreTests`` is
``/home/bam/systemsketch/tests/test_recording_store.py`` (256 lines, read on
disk 2026-09-19), ported with exactly these changes and no others:

  * ``recording_store`` -> ``systemsketch_recordings`` (the module's name here);
  * ``PROJECT_ROOT`` is ``parents[2]`` — this file sits in ``scripts/tests/``;
  * ``test_the_state_map_points_at_the_files_that_define_the_states`` is
    rewritten. The donor's version asserted the archive's OWN file names
    (``src/blocks/ports/…``, ``node_modules/tldraw/dist-esm/…``), which this
    repo does not have and never will. It is replaced by two tests that are
    strictly stronger: one drives the resolution RULE over a synthetic source
    tree in a temp directory (so it cannot pass by accident of layout), and
    one proves the search roots really find THIS repo's ``apps/*/src`` — the
    failure the donor's version would have masked by simply not applying.

WHY the donor's suite at all: it is an INDEPENDENT oracle, written against
the archive's writer before this port existed, so it cannot have been shaped
to whatever the port happens to do — the same reasoning
``scripts/tests/test_systemsketch_files.py`` gives for its own donor suite.

``RecordingBundleTests``, ``RecordingApiTests`` and ``SafetyTests`` are new:
the read-back route the in-app modal needs, the mountable route object, and
the two rules this lane is under.

SAFETY. Every test writes inside a ``tempfile.TemporaryDirectory``. Nothing
here reads, writes or renames anything under ``/home/bam/SystemSketch`` (31
real boards), and ``SafetyTests`` asserts that mechanically: the module names
no home-directory default, and the bundle route refuses a path that escapes
the recordings folder. Every server binds port 0.

Run: ``python3 -m unittest discover -s scripts/tests -t scripts/tests -v``
"""

from __future__ import annotations

import ast
import base64
import json
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from systemsketch_recordings import (  # noqa: E402
    FrameSidecar,
    RecordingApi,
    RecordingError,
    build_packet,
    last_recording,
    prune_recordings,
    read_recording_bundle,
    recording_stamp,
    recordings_dir,
    resolve_recording,
    state_sources,
    write_recording,
)

PNG = base64.b64encode(b"\x89PNG\r\n\x1a\nfake").decode("ascii")


def payload(note: str = "", started: str = "2026-09-01T20:41:03.000Z") -> dict:
    return {
        "header": {
            "mode": "last",
            "startedAt": started,
            "endedAt": "2026-09-01T20:41:15.400Z",
            "startedAtWall": 1_756_759_263_000,
            "endedAtWall": 1_756_759_275_400,
            "durationMs": 12_400,
            "windowMs": 30_000,
            "note": note,
            "url": "http://127.0.0.1:4322/?board=%2Ftmp%2Fx.systemsketch",
            "viewport": {"w": 1440, "h": 960},
            "devicePixelRatio": 1,
            "pathAtStart": "select.idle",
            "pathAtEnd": "select.idle",
            "shapeCount": 2,
            "recorderCostMs": 2.1,
            "recorderUptimeMs": 40_000,
        },
        "rows": [
            {"t": 0, "lane": "input", "name": "pointer_down", "screen": [10, 10]},
            {"t": 5, "lane": "state", "from": "select.idle", "to": "block.pointing", "trigger": "pointer_down"},
            {"t": 12.5, "lane": "state", "from": "select.idle", "to": "select.pointing_block_port", "trigger": "pointer_down"},
            {"t": 40, "lane": "state", "from": "select.pointing_block_port", "to": "select.dragging_handle", "trigger": "pointer_move"},
            {"t": 900, "lane": "store", "source": "user", "detail": "store-1", "ops": [{"op": "add", "id": "shape:c", "type": "connection"}]},
            {"t": 950, "lane": "console", "level": "error", "args": ["boom </script>"], "detail": "error-1"},
            {"t": 975, "lane": "workspace", "name": "autosave-error", "summary": "autosave conflict", "level": "error", "detail": "workspace-1"},
            {"t": 1000, "lane": "mark", "text": "here it broke"},
        ],
        "details": [
            {"id": "error-1", "t": 950, "lane": "console", "kind": "uncaught-error", "data": {"message": "boom", "stack": "Error: boom\n at x.ts:4"}},
            {"id": "workspace-1", "t": 975, "lane": "workspace", "kind": "autosave-error", "data": {"path": "/tmp/x.systemsketch", "phase": "conflict"}},
        ],
        "storeDiffs": [
            {"id": "store-1", "t": 900, "source": "user", "changes": {
                "added": {"shape:c": {"id": "shape:c", "typeName": "shape", "type": "connection", "props": {"label": "complete"}}},
                "removed": {},
                "updated": {},
            }},
        ],
        "startSnapshot": {"store": {}, "schema": {}},
        "endSnapshot": {"store": {"shape:c": {"id": "shape:c", "typeName": "shape", "type": "connection"}}, "schema": {}},
    }


HOST_EVENTS = [
    {"t": 0, "method": "POST", "path": "/api/workspace/file", "status": 409, "summary": "WorkspaceConflictError"},
]


def synthetic_source_root(directory: Path) -> Path:
    """A tiny source tree with the exact declaration shapes the map resolves.

    Replaces the donor's dependence on the archive's own file names. It
    carries all four cases the rule distinguishes: an app-owned state, a name
    declared by many tools, a tool id living in a CONSTANT, and a state
    inherited from tldraw's base tools under pnpm's store.
    """
    root = directory / "source"
    if root.is_dir():
        return root
    (root / "apps" / "systemsketch" / "src" / "blocks").mkdir(parents=True)
    (root / "apps" / "systemsketch" / "src" / "blocks" / "BlockTool.ts").write_text(
        "const BLOCK_TOOL_ID = 'block'\nexport class BlockTool { static override id = BLOCK_TOOL_ID }\n",
        encoding="utf-8",
    )
    (root / "apps" / "systemsketch" / "src" / "blocks" / "PointingBlockPort.ts").write_text(
        "export class PointingBlockPort { static override id = 'pointing_block_port' }\n", encoding="utf-8"
    )
    # A nested install must be skipped, not indexed as ours.
    (root / "apps" / "systemsketch" / "src" / "node_modules" / "junk").mkdir(parents=True)
    (root / "apps" / "systemsketch" / "src" / "node_modules" / "junk" / "Idle.ts").write_text(
        "export class Idle { static override id = 'pointing_block_port' }\n", encoding="utf-8"
    )
    pnpm = root / "node_modules" / ".pnpm"
    select = pnpm / "tldraw@5.3.2" / "node_modules" / "tldraw" / "dist-esm" / "lib" / "tools" / "SelectTool" / "childStates"
    select.mkdir(parents=True)
    (select / "Idle.mjs").write_text("class Idle { static id = 'idle' }\n", encoding="utf-8")
    crop = pnpm / "tldraw@5.3.2" / "node_modules" / "tldraw" / "dist-esm" / "lib" / "tools" / "CropTool" / "childStates"
    crop.mkdir(parents=True)
    (crop / "Idle.mjs").write_text("class Idle { static id = 'idle' }\n", encoding="utf-8")
    editor = pnpm / "@tldraw+editor@5.3.2" / "node_modules" / "@tldraw" / "editor" / "dist-esm" / "lib" / "editor" / "tools" / "BaseBoxShapeTool" / "children"
    editor.mkdir(parents=True)
    (editor / "Pointing.mjs").write_text("class Pointing { static id = 'pointing' }\n", encoding="utf-8")
    return root


class RecordingStoreTests(unittest.TestCase):
    """The archive's own suite, ported. See the module docstring."""

    def test_a_recording_is_a_folder_under_the_workspace_with_the_packet_first(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            files_root = Path(directory)
            source_root = synthetic_source_root(files_root)
            result = write_recording(
                payload("here it broke"),
                files_root,
                source_root=source_root,
                channel="preview",
                build="b",
                version="0.1.0",
                host_events=HOST_EVENTS,
            )
            folder = Path(result["path"])
            self.assertTrue(folder.is_dir())
            self.assertEqual(folder.parent, recordings_dir(files_root))
            self.assertTrue(folder.name.endswith("-here-it-broke"))
            self.assertTrue(result["packet"].startswith("SystemSketch interaction recording"))

            header = json.loads((folder / "header.json").read_text(encoding="utf-8"))
            self.assertEqual(header["channel"], "preview")
            self.assertEqual(header["framesSource"], "none")
            self.assertEqual(header["detailCounts"], {"details": 2, "store": 1, "host": 1})

            timeline = [json.loads(line) for line in (folder / "timeline.jsonl").read_text().splitlines()]
            self.assertEqual(len(timeline), 8)
            self.assertEqual(timeline[-1]["text"], "here it broke")

            manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["format"], "systemsketch-recording-v2")
            self.assertIn("networkBodies", manifest["privacy"])

            self.assertIn("/tmp/x.systemsketch", (folder / "workspace.jsonl").read_text())
            self.assertIn("/api/workspace/file", (folder / "host.jsonl").read_text())
            self.assertIn("WorkspaceConflictError", (folder / "host.jsonl").read_text())

            playback = (folder / "playback.html").read_text(encoding="utf-8")
            self.assertIn("here it broke", playback)
            self.assertIn('"lane": "state"', playback)
            # The escaping that keeps a captured `</script>` from ending the
            # viewer's own script block (`_script_json`).
            self.assertNotIn('"boom </script>"', playback)
            self.assertIn("boom \\u003c/script\\u003e", playback)

    def test_the_state_map_follows_the_donors_resolution_rule(self) -> None:
        """Replaces the donor's layout-bound version — see the module docstring."""
        with tempfile.TemporaryDirectory() as directory:
            source_root = synthetic_source_root(Path(directory))
            sources = state_sources(payload()["rows"], source_root)
            # The app's own definition wins, and a nested install is not it.
            self.assertEqual(
                sources["pointing_block_port"], "apps/systemsketch/src/blocks/PointingBlockPort.ts"
            )
            # A shared name resolves under the tool it was seen in, not Crop's.
            self.assertIn("SelectTool", sources["idle"])
            self.assertNotIn("CropTool", sources["idle"])
            # An id declared through a CONSTANT is still found.
            self.assertTrue(sources["block"].endswith("BlockTool.ts"), sources["block"])
            # An inherited state resolves into tldraw's base editor tools.
            self.assertIn("/@tldraw/editor/", sources["pointing"])

    def test_the_search_roots_find_this_repos_own_app_sources(self) -> None:
        """The failure the donor's version would have hidden by not applying."""
        from systemsketch_recordings import _state_search_roots

        roots = [str(root) for root, _suffixes in _state_search_roots(PROJECT_ROOT) if root.is_dir()]
        self.assertTrue(
            any(root.endswith("apps/storybook-basics/src") for root in roots),
            roots,
        )
        self.assertTrue(any(root.endswith("apps/systemsketch/src") for root in roots), roots)

    def test_canvas_frames_are_written_when_no_screencast_was_available(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            files_root = Path(directory)
            data = payload()
            data["canvasFrames"] = [{"t": 0, "png": PNG}, {"t": 12_400, "png": PNG}]
            result = write_recording(
                data, files_root, source_root=synthetic_source_root(files_root), channel="preview", build="b", version="v"
            )
            self.assertEqual(result["framesSource"], "canvas")
            self.assertEqual(result["frames"], 2)
            self.assertTrue((Path(result["path"]) / "frames" / "f-012400.png").is_file())
            self.assertIn("Canvas-only frames", result["packet"])

    def test_canvas_frames_win_when_screencast_is_available_but_empty(self) -> None:
        def empty_dump(_frames_dir: Path, _header: dict) -> dict:
            return {"ok": True, "frames": [], "targets": 0}

        with tempfile.TemporaryDirectory() as directory:
            files_root = Path(directory)
            data = payload()
            data["canvasFrames"] = [{"t": 0, "png": PNG}, {"t": 12_400, "png": PNG}]
            result = write_recording(
                data,
                files_root,
                source_root=synthetic_source_root(files_root),
                channel="preview",
                build="b",
                version="v",
                frame_dump=empty_dump,
            )
            self.assertEqual(result["framesSource"], "canvas")
            self.assertEqual(result["frames"], 2)
            self.assertTrue((Path(result["path"]) / "frames" / "f-000000.png").is_file())

    def test_a_frame_dump_makes_the_recording_a_screencast_one(self) -> None:
        def dump(frames_dir: Path, header: dict) -> dict:
            (frames_dir / "f-000300.jpg").write_bytes(b"jpeg")
            return {"ok": True, "frames": [{"t": 300, "bytes": 4, "file": "frames/f-000300.jpg"}]}

        with tempfile.TemporaryDirectory() as directory:
            files_root = Path(directory)
            result = write_recording(
                payload(),
                files_root,
                source_root=synthetic_source_root(files_root),
                channel="preview",
                build="b",
                version="v",
                frame_dump=dump,
            )
            self.assertEqual(result["framesSource"], "screencast")
            self.assertIn("f-000300.jpg = +0.30 s", result["packet"])
            frames = [json.loads(line) for line in (Path(result["path"]) / "frames.jsonl").read_text().splitlines()]
            self.assertEqual(frames, [{"t": 300, "bytes": 4, "file": "frames/f-000300.jpg"}])

    def test_last_recording_and_pruning_keep_the_folder_a_buffer(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            files_root = Path(directory)
            source_root = synthetic_source_root(files_root)
            self.assertIsNone(last_recording(files_root))
            for index in range(4):
                write_recording(
                    payload(f"take {index}", started=f"2026-09-01T20:4{index}:00.000Z"),
                    files_root,
                    source_root=source_root,
                    channel="preview",
                    build="b",
                    version="v",
                )
            newest = last_recording(files_root)
            self.assertIsNotNone(newest)
            self.assertTrue(newest["path"].endswith("-take-3"))
            removed = prune_recordings(recordings_dir(files_root), keep=2)
            self.assertEqual(len(removed), 2)
            remaining = sorted(path.name for path in recordings_dir(files_root).iterdir())
            self.assertEqual([name[-6:] for name in remaining], ["take-2", "take-3"])

    def test_bad_payloads_are_refused_before_anything_is_written(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            files_root = Path(directory)
            with self.assertRaises(RecordingError):
                write_recording(
                    {"header": {}, "rows": "nope"},
                    files_root,
                    source_root=synthetic_source_root(files_root),
                    channel="p",
                    build="b",
                    version="v",
                )
            root = recordings_dir(files_root)
            self.assertFalse(root.exists() and list(root.iterdir()))

    def test_stamp_uses_local_time_and_the_note(self) -> None:
        stamp = recording_stamp({"startedAt": "2026-09-01T20:41:03Z", "note": "Cable Jumped!! twice"})
        self.assertRegex(stamp, r"^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-cable-jumped-twice$")
        self.assertTrue(recording_stamp({"startedAt": "nonsense", "mode": "take"}).endswith("-take"))

    def test_the_packet_names_frames_and_files_in_reading_order(self) -> None:
        data = payload()
        text = build_packet(
            {**data["header"], "framesSource": "screencast", "channel": "preview", "build": "b"},
            data["rows"],
            [{"t": 0, "file": "frames/f-000000.jpg"}, {"t": 310, "file": "frames/f-000310.jpg"}],
            Path("/tmp/rec"),
            {"pointing_block_port": "src/blocks/ports/PointingBlockPort.ts"},
        )
        order = [text.index(marker) for marker in (
            "1. /tmp/rec/README.md", "2. /tmp/rec/manifest.json", "3. /tmp/rec/moments.json",
            "4. /tmp/rec/timeline.jsonl", "5. /tmp/rec/frames/", "6. /tmp/rec/store.full.jsonl",
            "7. /tmp/rec/start.snapshot.json", "8. /tmp/rec/workspace.jsonl", "9. /tmp/rec/playback.html",
        )]
        self.assertEqual(order, sorted(order))
        self.assertIn("pointing_block_port          src/blocks/ports/PointingBlockPort.ts", text)
        self.assertNotIn("No note was typed.", text)
        minimal = build_packet(
            {**data["header"], "framesSource": "none", "channel": "preview", "build": "b"},
            [],
            [],
            Path("/tmp/rec"),
            {},
        )
        self.assertIn("2 shapes at the end\n\nState-chart transitions", minimal)

    def test_the_sidecar_reports_why_frames_are_unavailable(self) -> None:
        sidecar = FrameSidecar(PROJECT_ROOT / "scripts" / "recorder_frames.mjs", cdp_port=None)
        self.assertEqual(sidecar.window_ms, 60_000)
        available, reason = sidecar.availability()
        self.assertFalse(available)
        self.assertIn("debugging port", reason)
        self.assertEqual(sidecar.arm(True, "http://127.0.0.1:4322/?x=1")["screencast"], False)
        self.assertIsNone(sidecar.dump(Path("/tmp"), {}))
        with_port = FrameSidecar(PROJECT_ROOT / "scripts" / "recorder_frames.mjs", cdp_port=1, node="/definitely/not/node")
        self.assertIn("node", with_port.availability()[1])

    def test_the_screencast_sidecar_script_is_present_beside_the_host(self) -> None:
        """Without it `availability()` is permanently false and nothing says why."""
        script = PROJECT_ROOT / "scripts" / "recorder_frames.mjs"
        self.assertTrue(script.is_file(), script)
        self.assertIn("Page.startScreencast", script.read_text(encoding="utf-8"))


class RecordingBundleTests(unittest.TestCase):
    """New: the read-back the in-app viewer needs (module docstring, change 4)."""

    def _write(self, files_root: Path, note: str = "a take", frames: int = 2) -> Path:
        data = payload(note)
        if frames:
            data["canvasFrames"] = [{"t": index * 1_000, "png": PNG} for index in range(frames)]
        result = write_recording(
            data,
            files_root,
            source_root=synthetic_source_root(files_root),
            channel="preview",
            build="b",
            version="v",
            host_events=HOST_EVENTS,
        )
        return Path(result["path"])

    def test_details_jsonl_carries_every_detail_record(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            folder = self._write(Path(directory))
            written = [json.loads(line) for line in (folder / "details.jsonl").read_text().splitlines()]
            self.assertEqual([detail["id"] for detail in written], ["error-1", "workspace-1"])
            # The per-lane files remain the donor's SUBSET: `error-1` is a
            # console detail, so it reaches browser-errors.jsonl but no lane file.
            manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
            listed = {artifact["file"]: artifact for artifact in manifest["artifacts"]}
            self.assertEqual(listed["details.jsonl"]["rows"], 2)
            self.assertIn("complete", listed["details.jsonl"]["description"])

    def test_the_bundle_is_the_written_pages_own_four_inputs(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            files_root = Path(directory)
            folder = self._write(files_root)
            bundle = read_recording_bundle(files_root)
            self.assertIsNotNone(bundle)
            self.assertEqual(bundle["path"], str(folder))
            self.assertEqual(bundle["header"]["channel"], "preview")
            self.assertEqual(len(bundle["rows"]), 8)
            self.assertEqual([detail["id"] for detail in bundle["details"]], ["error-1", "workspace-1"])
            self.assertTrue(bundle["packet"].startswith("SystemSketch interaction recording"))
            self.assertFalse(bundle["truncated"])
            # Frames are data: URLs, because a modal has no folder to resolve
            # a relative `frames/f-000000.png` against.
            self.assertEqual([frame["t"] for frame in bundle["frames"]], [0, 1_000])
            for frame in bundle["frames"]:
                self.assertTrue(frame["file"].startswith("data:image/png;base64,"), frame["file"][:40])
                self.assertEqual(base64.b64decode(frame["file"].split(",", 1)[1]), b"\x89PNG\r\n\x1a\nfake")

    def test_the_newest_recording_is_the_default_and_a_path_picks_one(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            files_root = Path(directory)
            first = self._write(files_root, "first")
            second = self._write(files_root, "second")
            self.assertEqual(read_recording_bundle(files_root)["path"], str(max(first, second, key=lambda p: p.name)))
            self.assertEqual(read_recording_bundle(files_root, str(first))["path"], str(first))
            # A folder name relative to the recordings root works too.
            self.assertEqual(read_recording_bundle(files_root, first.name)["path"], str(first))

    def test_nothing_saved_yet_is_none_not_an_error(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            self.assertIsNone(read_recording_bundle(Path(directory)))
            self.assertIsNone(resolve_recording(Path(directory)))

    def test_a_path_that_escapes_the_recordings_root_is_refused(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            files_root = Path(directory)
            self._write(files_root)
            for escape in ("/etc/passwd", "../../..", str(Path.home()), "../SystemSketch"):
                with self.assertRaises(RecordingError, msg=escape):
                    read_recording_bundle(files_root, escape)
            with self.assertRaises(RecordingError):
                read_recording_bundle(files_root, 17)
            # A path that stays inside but names nothing is simply None.
            self.assertIsNone(read_recording_bundle(files_root, "not-a-recording"))

    def test_a_folder_written_before_details_jsonl_still_reads_back(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            files_root = Path(directory)
            folder = self._write(files_root)
            (folder / "details.jsonl").unlink()
            bundle = read_recording_bundle(files_root)
            # The per-lane fallback: workspace.jsonl and browser-errors.jsonl
            # between them still carry both records.
            self.assertEqual(sorted(detail["id"] for detail in bundle["details"]), ["error-1", "workspace-1"])

    def test_every_answer_is_bounded_and_says_when_it_was_cut(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            files_root = Path(directory)
            self._write(files_root, frames=3)
            self.assertTrue(read_recording_bundle(files_root, max_rows=2)["truncated"])
            self.assertEqual(len(read_recording_bundle(files_root, max_rows=2)["rows"]), 2)
            tight = read_recording_bundle(files_root, max_frame_bytes=20)
            self.assertTrue(tight["truncated"])
            self.assertLess(len(tight["frames"]), 3)
            self.assertTrue(read_recording_bundle(files_root, max_frames=1)["truncated"])


class RecordingApiTests(unittest.TestCase):
    """New: the routes, over a real loopback server bound to port 0."""

    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.files_root = Path(self.directory.name)
        self.api = RecordingApi(
            self.files_root,
            source_root=synthetic_source_root(self.files_root),
            channel="preview",
            build="b",
            version="0.1.0",
        )
        api = self.api

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:  # noqa: N802
                if not api.handle_get(self):
                    self.send_error(404)

            def do_POST(self) -> None:  # noqa: N802
                if not api.handle_post(self):
                    self.send_error(404)

            def log_message(self, *_args) -> None:
                return

        # Port 0: the lane must never bind 4321/4322/4323/4325/4340-4342/5421.
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.addCleanup(self.server.server_close)
        thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(self.server.shutdown)
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"

    def get(self, route: str) -> dict:
        with urllib.request.urlopen(f"{self.base}{route}") as response:
            return json.loads(response.read())

    def post(self, route: str, body: dict, origin: str | None = None) -> dict:
        request = urllib.request.Request(
            f"{self.base}{route}",
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json", **({"Origin": origin} if origin else {})},
            method="POST",
        )
        with urllib.request.urlopen(request) as response:
            return json.loads(response.read())

    def test_last_and_bundle_answer_null_rather_than_404(self) -> None:
        self.assertEqual(self.get("/api/recordings/last"), {"recording": None})
        self.assertEqual(self.get("/api/recordings/bundle"), {"recording": None})

    def test_a_posted_buffer_becomes_a_folder_a_bundle_reads_back(self) -> None:
        data = payload("through the routes")
        data["canvasFrames"] = [{"t": 0, "png": PNG}]
        saved = self.post("/api/recordings", data)
        self.assertEqual(saved["framesSource"], "canvas")
        self.assertTrue(saved["path"].startswith(str(recordings_dir(self.files_root))))

        self.assertEqual(self.get("/api/recordings/last")["recording"]["path"], saved["path"])
        bundle = self.get("/api/recordings/bundle")["recording"]
        self.assertEqual(bundle["path"], saved["path"])
        self.assertEqual(len(bundle["rows"]), 8)
        self.assertTrue(bundle["frames"][0]["file"].startswith("data:image/png;base64,"))

        by_path = self.get(f"/api/recordings/bundle?path={urllib.parse.quote(saved['path'], safe='')}")
        self.assertEqual(by_path["recording"]["path"], saved["path"])

    def test_a_bad_bundle_path_is_a_400_with_a_reason(self) -> None:
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.get("/api/recordings/bundle?path=/etc")
        self.assertEqual(caught.exception.code, 400)
        self.assertIn("must stay under", json.loads(caught.exception.read())["error"])

    def test_a_refused_payload_is_a_409_and_writes_nothing(self) -> None:
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.post("/api/recordings", {"header": {}, "rows": "nope"})
        self.assertEqual(caught.exception.code, 409)
        self.assertEqual(self.get("/api/recordings/last"), {"recording": None})

    def test_a_page_on_another_origin_cannot_trigger_a_save(self) -> None:
        """A saved recording carries a full store snapshot of the open board."""
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.post("/api/recordings", payload(), origin="http://evil.example")
        self.assertEqual(caught.exception.code, 403)
        self.assertEqual(self.get("/api/recordings/last"), {"recording": None})

    def test_arm_and_status_answer_even_with_no_sidecar_wired(self) -> None:
        self.assertEqual(self.get("/api/recordings/status")["screencast"], False)
        self.assertEqual(self.post("/api/recordings/arm", {"enabled": True, "url": self.base})["screencast"], False)

    def test_an_unknown_recordings_route_is_not_claimed(self) -> None:
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.get("/api/recordings/nope")
        self.assertEqual(caught.exception.code, 404)


class SafetyTests(unittest.TestCase):
    """The two rules this lane is under, asserted rather than promised."""

    def test_the_module_names_no_home_directory_default(self) -> None:
        source = (PROJECT_ROOT / "scripts" / "systemsketch_recordings.py").read_text(encoding="utf-8")
        # Real CODE only: the module docstring SAYS "Nothing in this module may
        # fall back to Path.home()", and a substring search over raw text would
        # fail on its own rule being written down.
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
                body = getattr(node, "body", [])
                if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant) and isinstance(body[0].value.value, str):
                    node.body = body[1:] or [ast.Pass()]
        code = ast.unparse(tree)
        # `Path.home()` / `expanduser()` on a ROOT is how a test ends up writing
        # into /home/bam/SystemSketch, which holds 31 real boards.
        self.assertNotIn("Path.home()", code)
        self.assertNotIn("os.path.expanduser", code)
        # `files_root` is a required positional on every entry point.
        for name in ("def recordings_dir(files_root: Path)", "def last_recording(files_root: Path)"):
            self.assertIn(name, source)
        self.assertIn("def write_recording(\n    payload: dict,\n    files_root: Path,", source)

    def test_recordings_land_under_the_given_root_and_nowhere_else(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            files_root = Path(directory)
            root = recordings_dir(files_root)
            self.assertEqual(root, files_root.resolve() / "SystemSketch" / "recordings")
            result = write_recording(
                payload(),
                files_root,
                source_root=synthetic_source_root(files_root),
                channel="p",
                build="b",
                version="v",
            )
            self.assertTrue(Path(result["path"]).is_relative_to(files_root.resolve()))


if __name__ == "__main__":
    unittest.main()
