"""ACCEPTANCE for the pyblocks side of the pyblocks → SystemSketch contract.

docs/PYBLOCKS-BACKEND-PLAN.md, lane ``pyblocks-scene-projection``. Committed
BEFORE the implementation exists and EXPECTED TO FAIL until that lane lands.
Off-limits to the builder: if an assertion cannot be met, report it as a
finding — never edit this file or the fixtures beside it.

Run from the pyblocks lane worktree (the package under test is whatever
``pyblocks`` resolves to on ``sys.path``; ``PYBLOCKS_ROOT`` overrides)::

    cd /home/bam/pyblocks/.claude/worktrees/<lane>
    python3 /home/bam/bbox-ui/.claude/worktrees/<bbox-plan-worktree>/docs/fixtures/pyblocks-scene/test_systemsketch_scene_acceptance.py -v

The fixtures beside this file are the contract both repos test against:
``*.blockview.json`` is the INPUT (a valid BlockView v1), ``*.scene.json``
is the exact projection this test demands, ``events_edit_session.json`` is
the edit-event batch the events route must classify.
"""

from __future__ import annotations

import http.client
import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, os.environ.get("PYBLOCKS_ROOT", os.getcwd()))

from pyblocks.blockview import block_view_from_dict, validate_block_view  # noqa: E402


def _load(name: str):
    return json.loads((HERE / name).read_text(encoding="utf-8"))


def _view(name: str):
    return block_view_from_dict(_load(name))


LINEAR_BOUNDARY = "function:run@3:0/boundary:selected-function"
LINEAR_DECODE = "function:run@3:0/transform:call@4:12-4:23"
FOR_REGION = "function:sort_frame@4:0/region:for@8:4-14:44"


class FixturesAreValidBlockViews(unittest.TestCase):
    """Sanity on the inputs themselves — if these fail, the fixture is wrong, not the lane."""

    def test_inputs_validate(self) -> None:
        for name in ("linear_chain.blockview.json", "region_for_if.blockview.json"):
            self.assertEqual(validate_block_view(_view(name)), [], name)


class ProjectionMatchesFrozenFixtures(unittest.TestCase):
    def setUp(self) -> None:
        from pyblocks.systemsketch_scene import SCENE_SCHEMA_VERSION, block_view_to_scene  # noqa: F401

        self.project = block_view_to_scene
        self.schema_version = SCENE_SCHEMA_VERSION

    def test_schema_version_is_one(self) -> None:
        self.assertEqual(self.schema_version, 1)

    def test_linear_chain_projection_equals_frozen_bytes(self) -> None:
        produced = self.project(_view("linear_chain.blockview.json"))
        self.assertEqual(produced, _load("linear_chain.scene.json"))

    def test_region_for_if_projection_equals_frozen_bytes(self) -> None:
        produced = self.project(_view("region_for_if.blockview.json"))
        self.assertEqual(produced, _load("region_for_if.scene.json"))

    def test_projection_is_deterministic(self) -> None:
        view = _view("region_for_if.blockview.json")
        first = json.dumps(self.project(view), sort_keys=False)
        second = json.dumps(self.project(view), sort_keys=False)
        self.assertEqual(first, second)

    def test_control_edges_never_become_wires(self) -> None:
        """Zach: 'I didn't want to mix data lines and control lines.'"""
        produced = self.project(_view("region_for_if.blockview.json"))
        for edge in produced["scene"]["edges"]:
            self.assertIn(edge["data"]["pyblocks"]["kind"], {"data", "state"}, edge["id"])
        self.assertEqual(
            [edge["id"] for edge in produced["controlEdges"]],
            ["y-bins-fallback", "y-bins-lookup"],
        )

    def test_inner_twins_fold_onto_one_hierarchical_pin(self) -> None:
        produced = self.project(_view("region_for_if.blockview.json"))
        for edge in produced["scene"]["edges"]:
            self.assertFalse(edge["sourceHandle"].endswith("__inner"), edge["id"])
            self.assertFalse(edge["targetHandle"].endswith("__inner"), edge["id"])
        region = next(node for node in produced["scene"]["nodes"] if node["id"] == FOR_REGION)
        self.assertEqual(region["data"]["ports"], {"left": ["in-bins", "in-detections", "in-routed"], "right": ["out-routed"]})
        inner = next(edge for edge in produced["scene"]["edges"] if edge["id"] == "x-detections-classify")
        self.assertTrue(inner["data"]["pyblocks"].get("innerSource"))

    def test_everything_is_a_block_the_function_is_the_root_region(self) -> None:
        produced = self.project(_view("linear_chain.blockview.json"))
        by_id = {node["id"]: node for node in produced["scene"]["nodes"]}
        self.assertEqual(by_id[LINEAR_BOUNDARY]["type"], "region")
        self.assertNotIn("parentId", by_id[LINEAR_BOUNDARY])
        self.assertEqual(by_id[LINEAR_DECODE]["parentId"], LINEAR_BOUNDARY)
        for node in produced["scene"]["nodes"]:
            self.assertNotIn("definitionId", node, "regions are isolated; nothing here is linked")

    def test_flat_projection_is_the_reversible_default(self) -> None:
        produced = self.project(_view("linear_chain.blockview.json"), root_as_region=False)
        by_id = {node["id"]: node for node in produced["scene"]["nodes"]}
        self.assertNotIn("parentId", by_id[LINEAR_DECODE])
        self.assertEqual(by_id[LINEAR_BOUNDARY]["type"], "region")

    def test_invalid_block_view_is_refused_not_projected(self) -> None:
        from pyblocks.systemsketch_scene import SystemSketchSceneError

        view = _view("linear_chain.blockview.json")
        view.content.edges[0].source = type(view.content.edges[0].source)("nope", "out")
        with self.assertRaises(SystemSketchSceneError):
            self.project(view)


class EventClassification(unittest.TestCase):
    def test_classify_scene_events_follows_the_fixture_table(self) -> None:
        from pyblocks.systemsketch_scene import classify_scene_events

        fixture = _load("events_edit_session.json")
        batch = {
            "id": "b1",
            "author": "tldraw",
            "label": "edit session",
            "at": "2026-09-18T21:00:00Z",
            "documentUri": "workspace:linear_chain.py",
            "events": fixture["events"],
        }
        classified = classify_scene_events(batch)
        self.assertEqual(len(classified), len(fixture["events"]))
        for index, (event, verdict) in enumerate(zip(fixture["events"], classified)):
            self.assertEqual(verdict["eventIndex"], index)
            self.assertEqual(verdict["type"], event["type"])
            self.assertEqual(verdict["class"], fixture["expectedClasses"][event["type"]], event["type"])
            self.assertIsInstance(verdict["reason"], str)
            self.assertTrue(verdict["reason"])


class CommandLine(unittest.TestCase):
    def test_to_systemsketch_emits_a_document_for_a_real_file(self) -> None:
        root = Path(os.environ.get("PYBLOCKS_ROOT", os.getcwd())).resolve()
        showcase = root / "examples" / "v1_showcase.py"
        self.assertTrue(showcase.is_file(), showcase)
        completed = subprocess.run(
            [sys.executable, "-m", "pyblocks", "to-systemsketch", str(showcase), "--view", "build_report"],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=60,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        document = json.loads(completed.stdout)
        self.assertEqual(document["schemaVersion"], 1)
        self.assertEqual(document["kind"], "pyblocks-scene")
        self.assertTrue(document["scene"]["nodes"])
        self.assertTrue(document["views"], "the CLI must list every selectable view")
        self.assertTrue(document["source"]["selectedViewId"])
        self.assertTrue(document["source"]["sha256"])
        for node in document["scene"]["nodes"]:
            self.assertIn("pyblocks", node["data"])
            self.assertIn("authoredPosition", node["data"]["pyblocks"])


class HttpRoutes(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from pyblocks.server import PyblocksServer

        cls.dist = tempfile.TemporaryDirectory()
        (Path(cls.dist.name) / "index.html").write_text("<!doctype html>", encoding="utf-8")
        cls.server = PyblocksServer(("127.0.0.1", 0), Path(cls.dist.name))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.server.server_port

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.dist.cleanup()

    def _request(self, method: str, path: str, body: dict | None = None, origin: str | None = "http://127.0.0.1:5199"):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=30)
        headers = {"Content-Type": "application/json"}
        if origin:
            headers["Origin"] = origin
        connection.request(method, path, body=None if body is None else json.dumps(body), headers=headers)
        response = connection.getresponse()
        payload = json.loads(response.read().decode("utf-8"))
        cors = response.getheader("Access-Control-Allow-Origin")
        connection.close()
        return response.status, payload, cors

    def test_health_advertises_the_systemsketch_capabilities(self) -> None:
        status, payload, cors = self._request("GET", "/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(payload["analyzer"], "pyblocks-blockview-v1")
        self.assertEqual(payload["systemsketch"], {"scene": 1, "events": 1})
        self.assertEqual(cors, "http://127.0.0.1:5199", "a localhost app origin must be allowed")

    def test_scene_route_projects_source_text(self) -> None:
        source = "def run(raw: bytes) -> bytes:\n    frame = decode(raw)\n    return scale(frame, 2.0)\n"
        status, payload, _ = self._request(
            "POST", "/api/systemsketch/scene", {"source": source, "filename": "linear.py", "viewId": None},
        )
        self.assertEqual(status, 200, payload)
        self.assertEqual(payload["kind"], "pyblocks-scene")
        self.assertEqual(payload["schemaVersion"], 1)
        self.assertTrue(payload["scene"]["nodes"])
        self.assertTrue(payload["views"])
        self.assertIsInstance(payload["diagnostics"], list)
        self.assertEqual(len(payload["source"]["sha256"]), 64)

    def test_scene_route_rejects_a_non_string_source(self) -> None:
        status, payload, _ = self._request("POST", "/api/systemsketch/scene", {"source": 5})
        self.assertEqual(status, 400)
        self.assertIn("error", payload)

    def test_events_route_logs_and_echoes_with_classification(self) -> None:
        fixture = _load("events_edit_session.json")
        batch = {
            "id": "b1",
            "author": "tldraw",
            "label": "edit session",
            "at": "2026-09-18T21:00:00Z",
            "documentUri": "workspace:linear_chain.py",
            "events": fixture["events"],
        }
        status, payload, _ = self._request("POST", "/api/systemsketch/events", {"batches": [batch]})
        self.assertEqual(status, 200, payload)
        self.assertEqual(payload["accepted"], 1)
        self.assertEqual(len(payload["classified"]), 1)
        verdicts = payload["classified"][0]["events"]
        self.assertEqual(len(verdicts), len(fixture["events"]))
        for event, verdict in zip(fixture["events"], verdicts):
            self.assertEqual(verdict["class"], fixture["expectedClasses"][event["type"]], event["type"])
        # Nothing is written back tonight: the echo says so explicitly.
        self.assertEqual(payload["applied"], 0)

    def test_events_route_refuses_a_malformed_batch(self) -> None:
        status, payload, _ = self._request("POST", "/api/systemsketch/events", {"batches": "nope"})
        self.assertEqual(status, 400)
        self.assertIn("error", payload)


if __name__ == "__main__":
    unittest.main()
