"""ACCEPTANCE for lane `scv-definitions-partition` — the grain-1 definitions
view (bbox-ui docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md §5).

Authored in the bbox-ui plan commit (docs/acceptance/pyblocks/) because the
planner may not write to /home/bam/pyblocks. The DISPATCHER copies, before
dispatch, byte for byte:

    docs/acceptance/pyblocks/test_definition_graph.py
        -> <pyblocks lane>/tests/test_definition_graph.py
    docs/acceptance/pyblocks/stereo_fixture.py
        -> <pyblocks lane>/tests/fixtures/definition_graph/stereo.py
    docs/acceptance/pyblocks/stereo_definitions.expected.json
        -> <pyblocks lane>/tests/fixtures/definition_graph/stereo_definitions.expected.json

and the builder may NOT edit any of the three. The expected JSON is the
cross-repo contract: bbox-ui's `scene/definitionsToScene.test.ts` reads the
same bytes. Run: `python3 -m unittest tests.test_definition_graph -v`.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import textwrap
import unittest
from pathlib import Path

from pyblocks.definition_graph import definitions_view

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).resolve().parent / "fixtures" / "definition_graph"
STEREO = FIXTURES / "stereo.py"
EXPECTED = FIXTURES / "stereo_definitions.expected.json"


def sha(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


def by_anchor(view: dict) -> dict[str, dict]:
    return {record["anchor"]: record for record in view["definitions"]}


def refs(view: dict) -> list[tuple]:
    return [(r["from"], r["to"], r["kind"], tuple(r["lines"])) for r in view["references"]]


class StereoGolden(unittest.TestCase):
    """The frozen fixture, byte for byte — the contract both repos hold."""

    def test_matches_the_frozen_expected_json_exactly(self):
        source = STEREO.read_text(encoding="utf-8")
        actual = definitions_view(source, "stereo.py")
        expected = json.loads(EXPECTED.read_text(encoding="utf-8"))
        self.assertEqual(actual, expected)

    def test_envelope_and_order(self):
        view = definitions_view(STEREO.read_text(encoding="utf-8"), "stereo.py")
        self.assertEqual(view["schemaVersion"], 1)
        self.assertEqual(view["kind"], "definitions")
        self.assertEqual(
            [r["anchor"] for r in view["definitions"]],
            ["<module>", "EstimatePairOut", "rectify", "estimate_pair", "Pipeline", "Pipeline.__init__", "Pipeline.run"],
        )
        self.assertEqual(list(view.keys()), ["schemaVersion", "kind", "source", "definitions", "references", "diagnostics"])
        self.assertEqual(
            list(view["definitions"][0].keys()),
            ["anchor", "name", "kind", "parent", "ordinal", "span", "signature", "parameters", "outputs", "contentHash", "text"],
        )

    def test_spans_follow_pyblocks_own_policy_and_hashes_cover_the_exact_bytes(self):
        source = STEREO.read_text(encoding="utf-8")
        view = definitions_view(source, "stereo.py")
        records = by_anchor(view)
        # Same numbers pyblocks' views[] already reports for this file
        # (analyzer.py:344-357: decorated line, column 0, AST end).
        self.assertEqual((records["rectify"]["span"]["startLine"], records["rectify"]["span"]["endLine"], records["rectify"]["span"]["endColumn"]), (13, 17, 33))
        self.assertEqual((records["estimate_pair"]["span"]["startLine"], records["estimate_pair"]["span"]["endLine"], records["estimate_pair"]["span"]["endColumn"]), (20, 23, 82))
        self.assertEqual((records["Pipeline.run"]["span"]["startLine"], records["Pipeline.run"]["span"]["endLine"], records["Pipeline.run"]["span"]["endColumn"]), (30, 31, 41))
        self.assertEqual(records["<module>"]["span"], {"startLine": 1, "startColumn": 0, "endLine": 32, "endColumn": 0, "columnEncoding": "utf8-bytes"})
        for record in view["definitions"]:
            self.assertEqual(record["contentHash"], sha(record["text"]), record["anchor"])
            self.assertEqual(record["span"]["startColumn"], 0)
        self.assertEqual(records["<module>"]["text"], source)
        self.assertEqual(records["<module>"]["contentHash"], "sha256:" + view["source"]["sha256"])
        self.assertTrue(records["Pipeline.run"]["text"].startswith("    def run(self, left, right):"))

    def test_parents_kinds_signatures_ports(self):
        records = by_anchor(definitions_view(STEREO.read_text(encoding="utf-8"), "stereo.py"))
        self.assertIsNone(records["<module>"]["parent"])
        self.assertEqual(records["Pipeline"]["parent"], "<module>")
        self.assertEqual(records["Pipeline.run"]["parent"], "Pipeline")
        self.assertEqual(records["Pipeline"]["kind"], "class")
        self.assertEqual(records["rectify"]["kind"], "function")
        self.assertEqual(records["Pipeline.run"]["signature"], "def Pipeline.run(self, left, right)")
        self.assertEqual(records["Pipeline"]["signature"], "class Pipeline")
        self.assertEqual(records["<module>"]["signature"], "module")
        self.assertEqual([p["name"] for p in records["estimate_pair"]["parameters"]], ["left", "right"])
        self.assertEqual(records["estimate_pair"]["parameters"][0]["annotation"], "Frame")
        self.assertEqual(records["estimate_pair"]["outputs"], [{"name": "depth", "dataType": "Depth"}, {"name": "confidence", "dataType": "float"}])
        self.assertEqual(records["Pipeline"]["parameters"], [])
        self.assertEqual(records["Pipeline"]["outputs"], [])

    def test_references_are_the_call_graph_between_definitions(self):
        view = definitions_view(STEREO.read_text(encoding="utf-8"), "stereo.py")
        self.assertEqual(
            refs(view),
            [
                ("estimate_pair", "EstimatePairOut", "call", (23,)),
                ("estimate_pair", "EstimatePairOut", "name", (20,)),
                ("estimate_pair", "rectify", "call", (21,)),
                ("Pipeline.run", "estimate_pair", "call", (31,)),
            ],
        )
        self.assertEqual(view["diagnostics"], [])


class Rules(unittest.TestCase):
    def test_duplicate_definitions_get_ordinal_anchors_and_a_warning_never_a_refusal(self):
        source = textwrap.dedent(
            """
            def f():
                return 1


            def f():
                return 2
            """
        ).lstrip()
        view = definitions_view(source, "dup.py")
        records = by_anchor(view)
        self.assertEqual([r["anchor"] for r in view["definitions"]], ["<module>", "f", "f#1"])
        self.assertEqual((records["f"]["ordinal"], records["f#1"]["ordinal"]), (0, 1))
        self.assertEqual(records["f#1"]["name"], "f")
        self.assertEqual(len(view["diagnostics"]), 1)
        self.assertEqual((view["diagnostics"][0]["severity"], view["diagnostics"][0]["code"], view["diagnostics"][0]["anchor"]), ("warning", "duplicate-definition", "f#1"))

    def test_decorators_are_inside_the_span_and_the_hash(self):
        source = "import functools\n\n\n@functools.lru_cache\ndef g(x):\n    return x\n"
        records = by_anchor(definitions_view(source, "dec.py"))
        self.assertEqual(records["g"]["span"]["startLine"], 4)
        self.assertTrue(records["g"]["text"].startswith("@functools.lru_cache\ndef g(x):"))
        self.assertEqual(records["g"]["contentHash"], sha(records["g"]["text"]))

    def test_self_attribute_calls_resolve_to_sibling_methods(self):
        source = textwrap.dedent(
            """
            class C:
                def a(self):
                    return self.b()

                def b(self):
                    return 1
            """
        ).lstrip()
        view = definitions_view(source, "attr.py")
        self.assertEqual(refs(view), [("C.a", "C.b", "attribute", (3,))])

    def test_nested_definitions_nest_and_reference(self):
        source = textwrap.dedent(
            """
            def outer():
                def inner():
                    return 1
                return inner()
            """
        ).lstrip()
        view = definitions_view(source, "nest.py")
        records = by_anchor(view)
        self.assertEqual(records["outer.inner"]["parent"], "outer")
        self.assertEqual(records["outer.inner"]["kind"], "function")
        self.assertEqual(refs(view), [("outer", "outer.inner", "call", (4,))])

    def test_module_remainder_references_definitions(self):
        source = 'def main():\n    return 0\n\n\nif __name__ == "__main__":\n    main()\n'
        view = definitions_view(source, "main.py")
        self.assertEqual(refs(view), [("<module>", "main", "call", (6,))])

    def test_class_scope_is_skipped_for_names_inside_methods(self):
        # `helper` at class scope is not visible as a bare name inside `m`
        # (Python scoping) — no reference is invented.
        source = textwrap.dedent(
            """
            class K:
                def helper(self):
                    return 1

                def m(self):
                    return helper()
            """
        ).lstrip()
        self.assertEqual(refs(definitions_view(source, "scope.py")), [])

    def test_names_that_are_not_definitions_produce_no_edge(self):
        source = "import os\n\nCONST = 1\n\n\ndef f():\n    return os.getcwd() + str(CONST)\n"
        self.assertEqual(refs(definitions_view(source, "free.py")), [])

    def test_async_def_is_a_definition(self):
        source = "async def fetch():\n    return 1\n"
        records = by_anchor(definitions_view(source, "a.py"))
        self.assertEqual(records["fetch"]["kind"], "async-function")
        self.assertEqual(records["fetch"]["signature"], "async def fetch()")

    def test_syntax_error_is_total_never_a_refusal(self):
        source = "def broken(:\n    pass\n"
        view = definitions_view(source, "broken.py")
        self.assertEqual([r["anchor"] for r in view["definitions"]], ["<module>"])
        self.assertEqual(view["definitions"][0]["text"], source)
        self.assertEqual(view["definitions"][0]["contentHash"], sha(source))
        self.assertEqual(view["references"], [])
        self.assertEqual(len(view["diagnostics"]), 1)
        self.assertEqual((view["diagnostics"][0]["severity"], view["diagnostics"][0]["code"]), ("error", "syntax-error"))

    def test_deterministic_bytes(self):
        source = STEREO.read_text(encoding="utf-8")
        first = json.dumps(definitions_view(source, "stereo.py"), ensure_ascii=False, indent=2)
        second = json.dumps(definitions_view(source, "stereo.py"), ensure_ascii=False, indent=2)
        self.assertEqual(first, second)


class Cli(unittest.TestCase):
    def test_analyze_view_kind_definitions_emits_the_view(self):
        completed = subprocess.run(
            [sys.executable, "-m", "pyblocks", "analyze", "--view-kind", "definitions", str(STEREO)],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        payload = json.loads(completed.stdout)
        self.assertEqual(payload["kind"], "definitions")
        self.assertEqual(payload["source"]["name"], str(STEREO))
        expected = json.loads(EXPECTED.read_text(encoding="utf-8"))
        payload["source"]["name"] = "stereo.py"
        self.assertEqual(payload, expected)

    def test_default_view_kind_is_unchanged(self):
        completed = subprocess.run(
            [sys.executable, "-m", "pyblocks", "analyze", "--view", "module", str(STEREO)],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        payload = json.loads(completed.stdout)
        self.assertIn("views", payload)
        self.assertNotIn("kind", payload)


if __name__ == "__main__":
    unittest.main()
