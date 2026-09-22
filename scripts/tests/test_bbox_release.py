"""bbox_release.py's channel/build model, exercised against a throwaway
fixture product — never the real bbox-ui.com or Storybook build (both take
minutes; this suite has to run in seconds to be worth running).

The fixture's `build_command` is a tiny Node script instead of a real
Next/Storybook build, so these tests are hermetic and fast while still going
through the exact same `build_from_source`/`promote`/`rollback` code path
`launch_bboxui.py` and `launch_bbox_storybook.py` use for real — the only
thing that differs between the fixture and a real product is what
`build_command` shells out to.

Run: ``python3 -m pytest scripts/tests/test_bbox_release.py -v`` or
``python3 -m unittest discover -s scripts/tests -t scripts/tests -v``
"""

from __future__ import annotations

import dataclasses
import json
import shutil
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = PROJECT_ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

import bbox_release as br  # noqa: E402


PNPM = shutil.which("pnpm")


def _write_fixture_source(root: Path, content: str) -> None:
    """A package.json + build script standing in for a real product's
    Next/Storybook build — `pnpm install` (no dependencies, so it never
    touches the network) then `node build.mjs`, writing `out/index.html`
    from `content.txt` so two builds are byte-identical iff `content`
    matches.
    """
    root.mkdir(parents=True, exist_ok=True)
    (root / "package.json").write_text(
        json.dumps(
            {
                "name": "bbox-release-fixture",
                "private": True,
                "version": "0.0.0",
                "scripts": {"build": "node build.mjs"},
            }
        )
    )
    (root / "build.mjs").write_text(
        textwrap.dedent(
            """
            import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
            mkdirSync("out", { recursive: true });
            const content = readFileSync("content.txt", "utf8");
            writeFileSync("out/index.html", "<!doctype html><title>fixture</title>" + content);
            """
        ).lstrip()
    )
    (root / "content.txt").write_text(content)


def _fixture_config(**overrides) -> br.ProductConfig:
    base = dict(
        slug="fixture",
        product="bbox-release-fixture",
        display_name="bbox-release fixture",
        build_command=("run", "build"),
        output_dir="out",
        preview_command=lambda pnpm, port: [pnpm, "--version"],
        preview_env=lambda stable_port: {},
        preview_port=0,
        stable_port=0,
        release_home_env="BBOX_RELEASE_FIXTURE_HOME_UNUSED",
        release_home_subdir="fixture",
        state_home_env="BBOX_STATE_FIXTURE_HOME_UNUSED",
        state_home_subdir="fixture",
        deployed_url=None,
        app_id="bbox-release-fixture",
        inject_badge=False,
    )
    base.update(overrides)
    return br.ProductConfig(**base)


@unittest.skipIf(PNPM is None, "pnpm is required to run the fixture build")
class BuildFromSourceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.project_root = self.root / "project"
        self.release_home = self.root / "release-home"
        self.config = _fixture_config()

    def test_content_hash_identity_and_dedupe(self) -> None:
        _write_fixture_source(self.project_root, "hello")
        build_a, manifest_a = br.build_from_source(self.project_root, self.release_home, self.config)

        # Rebuilding identical content must return the SAME build id and
        # must not re-run the build — proven by the manifest's builtAt
        # timestamp staying byte-identical (a real rebuild writes a fresh
        # one), not just by re-reading whatever is on disk.
        build_again, manifest_again = br.build_from_source(self.project_root, self.release_home, self.config)
        self.assertEqual(build_a, build_again)
        self.assertEqual(manifest_a["builtAt"], manifest_again["builtAt"])

        # Only one release directory exists for the identical content.
        self.assertEqual(len(list(br.releases_dir(self.release_home).iterdir())), 1)

    def test_different_content_produces_a_different_build_and_keeps_the_old_one(self) -> None:
        _write_fixture_source(self.project_root, "version one")
        build_a, _ = br.build_from_source(self.project_root, self.release_home, self.config)

        _write_fixture_source(self.project_root, "version two")
        build_b, _ = br.build_from_source(self.project_root, self.release_home, self.config)

        self.assertNotEqual(build_a, build_b)
        # Immutability: promoting past a build never deletes it.
        self.assertTrue(br.release_root(self.release_home, build_a).is_dir())
        self.assertTrue(br.release_root(self.release_home, build_b).is_dir())
        site_a = (br.release_site_dir(self.release_home, build_a) / "index.html").read_text()
        site_b = (br.release_site_dir(self.release_home, build_b) / "index.html").read_text()
        self.assertIn("version one", site_a)
        self.assertIn("version two", site_b)

    def test_manifest_records_product_and_rejects_a_foreign_product(self) -> None:
        _write_fixture_source(self.project_root, "hello")
        build, manifest = br.build_from_source(self.project_root, self.release_home, self.config)
        self.assertEqual(manifest["product"], "bbox-release-fixture")

        other = dataclasses.replace(self.config, product="a-different-product")
        with self.assertRaises(br.ReleaseError):
            br.read_manifest(self.release_home, build, other)

    def test_build_produced_no_entry_file_raises(self) -> None:
        self.project_root.mkdir(parents=True)
        (self.project_root / "package.json").write_text(
            json.dumps({"name": "empty", "private": True, "version": "0.0.0", "scripts": {"build": "true"}})
        )
        with self.assertRaisesRegex(br.ReleaseError, "no out/index.html"):
            br.build_from_source(self.project_root, self.release_home, self.config)


@unittest.skipIf(PNPM is None, "pnpm is required to run the fixture build")
class ChannelTransitionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.project_root = self.root / "project"
        self.release_home = self.root / "release-home"
        self.config = _fixture_config()

    def test_promote_then_rollback_swaps_stable_and_previous(self) -> None:
        _write_fixture_source(self.project_root, "one")
        build_a, _ = br.promote(self.release_home, self.project_root, self.config)
        channels = br.read_channels(self.release_home, self.config)
        self.assertEqual(channels.stable, build_a)
        self.assertIsNone(channels.previous)

        _write_fixture_source(self.project_root, "two")
        build_b, _ = br.promote(self.release_home, self.project_root, self.config)
        channels = br.read_channels(self.release_home, self.config)
        self.assertEqual(channels.stable, build_b)
        self.assertEqual(channels.previous, build_a)

        rolled_back = br.rollback(self.release_home, self.config)
        self.assertEqual(rolled_back.stable, build_a)
        self.assertEqual(rolled_back.previous, build_b)

    def test_rollback_with_no_previous_release_refuses(self) -> None:
        _write_fixture_source(self.project_root, "one")
        br.promote(self.release_home, self.project_root, self.config)
        with self.assertRaises(br.ReleaseError):
            br.rollback(self.release_home, self.config)

    def test_promoting_identical_content_twice_does_not_fabricate_a_previous(self) -> None:
        # Re-promoting the SAME tree must not treat the build as its own
        # "previous" — rollback would then swap to itself.
        _write_fixture_source(self.project_root, "one")
        build_a, _ = br.promote(self.release_home, self.project_root, self.config)
        build_again, _ = br.promote(self.release_home, self.project_root, self.config)
        self.assertEqual(build_a, build_again)
        channels = br.read_channels(self.release_home, self.config)
        self.assertEqual(channels.stable, build_a)
        self.assertIsNone(channels.previous)


class CommitsAheadOfStableTests(unittest.TestCase):
    """`commits_ahead_of_stable` — the "N commits behind your checkout" the
    badge shows. Needs a real git repo (not the fixture build above, which
    never runs inside a checkout), so this constructs one directly with
    `subprocess` — the same way `bbox_release._git` itself shells out.
    """

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.repo = Path(self.tmp.name)
        self._git("init", "-q")
        self._git("config", "user.email", "test@example.com")
        self._git("config", "user.name", "bbox-release tests")

    def _git(self, *arguments: str) -> str:
        completed = subprocess.run(
            ["git", "-C", str(self.repo), *arguments],
            capture_output=True,
            text=True,
            check=True,
        )
        return completed.stdout

    def _commit(self, name: str) -> str:
        (self.repo / name).write_text(name)
        self._git("add", name)
        self._git("commit", "-q", "-m", name)
        return self._git("rev-parse", "HEAD").strip()

    def test_zero_when_head_is_the_pinned_commit(self) -> None:
        commit = self._commit("a.txt")
        self.assertEqual(br.commits_ahead_of_stable({"commit": commit}, self.repo), 0)

    def test_counts_commits_made_since_the_pinned_build(self) -> None:
        pinned = self._commit("a.txt")
        self._commit("b.txt")
        self._commit("c.txt")
        self.assertEqual(br.commits_ahead_of_stable({"commit": pinned}, self.repo), 2)

    def test_none_when_the_manifest_has_no_commit(self) -> None:
        self.assertIsNone(br.commits_ahead_of_stable({"commit": None}, self.repo))
        self.assertIsNone(br.commits_ahead_of_stable({}, self.repo))

    def test_none_when_the_pinned_commit_cannot_be_resolved(self) -> None:
        self.assertIsNone(br.commits_ahead_of_stable({"commit": "0" * 40}, self.repo))


class DefaultHomesTests(unittest.TestCase):
    """Products must never collide on their default cache directories —
    this is what keeps `promote`ing Storybook from ever touching bbox-ui.com's
    channels.json or vice versa.
    """

    def test_docs_and_storybook_default_to_different_release_homes(self) -> None:
        self.assertNotEqual(br.default_release_home(br.DOCS), br.default_release_home(br.STORYBOOK))
        self.assertNotEqual(br.default_state_home(br.DOCS), br.default_state_home(br.STORYBOOK))

    def test_docs_release_home_has_no_subdir_for_backward_compatibility(self) -> None:
        # bbox-ui.com predates the multi-product config; its default path
        # must stay exactly what it was before this module supported a
        # second product.
        home = br.default_release_home(br.DOCS)
        self.assertTrue(str(home).endswith("bbox-ui/runtime"))
        self.assertNotIn("docs", home.parts)

    def test_storybook_release_home_is_namespaced(self) -> None:
        home = br.default_release_home(br.STORYBOOK)
        self.assertIn("storybook", home.parts)

    def test_products_use_distinct_ports(self) -> None:
        used = [br.DOCS.preview_port, br.DOCS.stable_port, br.STORYBOOK.preview_port, br.STORYBOOK.stable_port]
        self.assertEqual(len(used), len(set(used)))
        # Never collide with ports Zach runs himself.
        reserved = {5421, 4572, 4340, 63315}
        self.assertFalse(reserved & set(used))


if __name__ == "__main__":
    unittest.main()
