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
import http.server
import json
import os
import shutil
import subprocess
import sys
import tempfile
import textwrap
import threading
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
            import { mkdirSync, writeFileSync, readFileSync, appendFileSync } from "node:fs";
            mkdirSync("out", { recursive: true });
            const content = readFileSync("content.txt", "utf8");
            writeFileSync("out/index.html", "<!doctype html><title>fixture</title>" + content);
            // One "x" per real invocation, appended to an ABSOLUTE path the
            // test owns. WHY absolute and outside the tree: the build runs in
            // `build_from_source`'s throwaway staging snapshot, which is
            // deleted in its `finally` — a relative counter would vanish with
            // it. WHY it exists at all: without an observable side effect,
            // "the build was not re-run" is unfalsifiable from the outside,
            // which is exactly how the dedupe test came to assert something
            // that had never been true.
            if (process.env.BBOX_FIXTURE_BUILD_LOG) {
              appendFileSync(process.env.BBOX_FIXTURE_BUILD_LOG, "x");
            }
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

    def test_content_hash_identity_and_release_dedupe(self) -> None:
        """Identical source produces one immutable RELEASE, not two — and the
        build command really does run again on the way there.

        WHY the claim is worded that way now (judge finding, 2026-09-22): this
        test used to say the build "must not re-run", proven by `builtAt`
        staying byte-identical. That was vacuous. `pnpm install` and the build
        both execute BEFORE the existing-destination check, because the build
        id is a hash of the build's OUTPUT and there is nothing to compare
        until the output exists. The unchanged timestamp only ever proved the
        old manifest was re-read.

        WHY the build is deliberately NOT skipped now that
        `source_fingerprint` could key a pre-build lookup: the fingerprint
        covers SOURCE only — not the pnpm store, not the Node version, not
        anything else the toolchain contributes. Returning an earlier release
        because the source matched would mean serving a build produced by a
        different toolchain while claiming it is this one, which is the exact
        class of lie the rest of this pass exists to remove. Paying for the
        rebuild and deduplicating on the real output hash is the honest
        trade.
        """
        _write_fixture_source(self.project_root, "hello")
        # Outside `project_root` so it is neither snapshotted nor able to
        # perturb what is being measured.
        counter = self.root / "build-count.txt"
        counter.write_text("")
        os.environ["BBOX_FIXTURE_BUILD_LOG"] = str(counter)
        self.addCleanup(os.environ.pop, "BBOX_FIXTURE_BUILD_LOG", None)
        build_a, manifest_a = br.build_from_source(self.project_root, self.release_home, self.config)
        self.assertEqual(counter.read_text().count("x"), 1)

        build_again, manifest_again = br.build_from_source(self.project_root, self.release_home, self.config)
        # Same content, same build id, and the SAME release directory — the
        # second build's output was discarded rather than written twice.
        self.assertEqual(build_a, build_again)
        self.assertEqual(manifest_a["builtAt"], manifest_again["builtAt"])
        self.assertEqual(len(list(br.releases_dir(self.release_home).iterdir())), 1)
        # ...and the build DID run a second time. Without this line the two
        # assertions above are equally satisfied by a cached no-op, which is
        # what made the previous version of this test unfalsifiable.
        self.assertEqual(counter.read_text().count("x"), 2)

    def test_the_manifest_records_a_source_fingerprint_when_there_is_a_checkout(self) -> None:
        """`stable_relation` degrades to "unknown" without this key, so a
        promote that silently stopped recording it would take the badge's
        whole freshness answer with it."""
        _write_fixture_source(self.project_root, "hello")
        subprocess.run(["git", "-C", str(self.project_root), "init", "-q"], check=True)
        subprocess.run(["git", "-C", str(self.project_root), "config", "user.email", "t@e.com"], check=True)
        subprocess.run(["git", "-C", str(self.project_root), "config", "user.name", "t"], check=True)
        # Explicit pathspecs, never `add -A` (CLAUDE.md) — a habit worth
        # keeping even in a throwaway repo nobody else shares.
        subprocess.run(
            ["git", "-C", str(self.project_root), "add", "package.json", "build.mjs", "content.txt"],
            check=True,
        )
        subprocess.run(["git", "-C", str(self.project_root), "commit", "-q", "-m", "fixture"], check=True)
        _, manifest = br.build_from_source(self.project_root, self.release_home, self.config)
        self.assertIsNotNone(manifest["sourceFingerprint"])
        self.assertEqual(manifest["sourceFingerprint"], br.source_fingerprint(self.project_root))

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


class GitFixtureTestCase(unittest.TestCase):
    """A throwaway git checkout, built with `subprocess` the same way
    `bbox_release._git` itself shells out — the build fixture above never runs
    inside a checkout, and these questions are all about history."""

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

    def _commit(self, name: str, content: str | None = None) -> str:
        (self.repo / name).write_text(content if content is not None else name)
        self._git("add", name)
        self._git("commit", "-q", "-m", name)
        return self._git("rev-parse", "HEAD").strip()

    def _diverge(self) -> tuple[str, str]:
        """Two tips that each hold a commit the other does not — the exact
        shape this repo was in when the judge caught the bug (`e2c19af` vs
        `ced0360`, merge-base `92c2c22`). Returns (stable_tip, head_tip) with
        HEAD checked out at head_tip.
        """
        self._commit("base.txt")
        self._git("checkout", "-q", "-b", "stable-line")
        stable_tip = self._commit("only-on-stable.txt")
        self._git("checkout", "-q", "-")
        head_tip = self._commit("only-on-head.txt")
        return stable_tip, head_tip


class CommitsAheadOfStableTests(GitFixtureTestCase):
    """`commits_ahead_of_stable` — the count the badge is allowed to print as
    "N commits behind your checkout", and nothing else."""

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

    def test_refuses_to_count_when_the_histories_DIVERGED(self) -> None:
        """The judge's HIGH finding, hermetically.

        MUTATION: drop the `_is_ancestor(...) is not True` gate from
        `commits_ahead_of_stable` and this returns 1 — which the badge renders
        as "1 commit behind your checkout" for a Stable that holds a commit
        the checkout has never seen. Measured on the real repo the same day:
        Stable e2c19af against HEAD ced0360, merge-base 92c2c22,
        `rev-list --count e2c19af..ced0360` = 5, printed as "5 commits
        behind".
        """
        stable_tip, head_tip = self._diverge()
        # The raw number the old body would have returned is non-zero, so this
        # test cannot pass by the range simply being empty.
        self.assertGreater(int(self._git("rev-list", "--count", f"{stable_tip}..{head_tip}").strip()), 0)
        self.assertIsNone(br.commits_ahead_of_stable({"commit": stable_tip}, self.repo))

    def test_refuses_to_count_when_stable_is_AHEAD_of_the_checkout(self) -> None:
        """Stable built from a commit this checkout has not reached yet:
        `stable..HEAD` is empty, so the old body returned 0 — indistinguishable
        from "caught up" while Stable was strictly newer."""
        self._commit("a.txt")
        head_tip = self._git("rev-parse", "HEAD").strip()
        stable_tip = self._commit("b.txt")
        self._git("checkout", "-q", head_tip)
        self.assertIsNone(br.commits_ahead_of_stable({"commit": stable_tip}, self.repo))


class SourceFingerprintTests(GitFixtureTestCase):
    """`source_fingerprint` — the content hash that replaced comparing dirty
    path NAMES. Every test here is a case the old comparison got wrong."""

    def test_editing_an_already_dirty_file_changes_the_fingerprint(self) -> None:
        """MUTATION: this is the false-green the judge named. The old check
        compared commit + dirty-bool + dirty PATH NAMES, all three of which
        are identical across these two edits — so the badge kept saying "up
        to date" for a checkout that had moved."""
        self._commit("a.txt", "one")
        (self.repo / "a.txt").write_text("two")
        first = br.source_fingerprint(self.repo)
        (self.repo / "a.txt").write_text("three")
        second = br.source_fingerprint(self.repo)
        self.assertIsNotNone(first)
        self.assertNotEqual(first, second)
        # And the signals the OLD comparison used really were identical.
        self.assertEqual(br.source_provenance(self.repo).dirty_paths, ("a.txt",))

    def test_committing_an_unchanged_tree_keeps_the_same_fingerprint(self) -> None:
        """The converse half of the same finding: identical built content read
        as "1 commit behind" because `commit` moved. Content-addressing makes
        committing a no-op."""
        self._commit("a.txt", "one")
        (self.repo / "a.txt").write_text("two")
        dirty = br.source_fingerprint(self.repo)
        self._git("add", "a.txt")
        self._git("commit", "-q", "-m", "commit the same bytes")
        self.assertEqual(br.source_fingerprint(self.repo), dirty)

    def test_a_whole_new_untracked_DIRECTORY_changes_the_fingerprint(self) -> None:
        """MUTATION: drop `-uall` from the `status` call and this goes red.

        Found by reading rather than reported: bare `git status --porcelain`
        collapses an untracked directory to a single `?? apps/` entry, which
        is not a file — so the overlay dropped it and a brand-new source
        folder was invisible. Measured before the fix: a clean repo and the
        same repo plus `apps/newthing/index.ts` fingerprinted identically,
        which would have rendered "up to date".
        """
        self._commit("a.txt", "one")
        before = br.source_fingerprint(self.repo)
        nested = self.repo / "apps" / "newthing"
        nested.mkdir(parents=True)
        (nested / "index.ts").write_text("export const real = 1")
        self.assertEqual(self._git("status", "--porcelain").strip(), "?? apps/")
        self.assertNotEqual(br.source_fingerprint(self.repo), before)

    def test_untracked_files_count_and_deletions_count(self) -> None:
        self._commit("a.txt", "one")
        clean = br.source_fingerprint(self.repo)
        (self.repo / "new.txt").write_text("added")
        self.assertNotEqual(br.source_fingerprint(self.repo), clean)
        (self.repo / "new.txt").unlink()
        self.assertEqual(br.source_fingerprint(self.repo), clean)
        (self.repo / "a.txt").unlink()
        self.assertNotEqual(br.source_fingerprint(self.repo), clean)

    def test_a_STAGED_rename_is_not_a_copy(self) -> None:
        """MUTATION: set the `record[0] in "RC"` branch of
        `source_fingerprint` to `False` and this goes red — `a` renamed to `b`
        fingerprints identically to `a` COPIED to `b`, because the source path
        is never dropped from the HEAD listing.

        WHY the rename has to be STAGED for this to be the real test: measured
        2026-09-22, `git status --porcelain=v1 -z` emits an UNSTAGED rename as
        two ordinary records (` D a.txt`, `?? b.txt`) and only a staged one as
        the two-path form `R  b.txt\\0a.txt\\0` — new path in the status slot,
        source as the NEXT record. An unstaged rename is therefore handled by
        the disk check alone and proves nothing about the record parsing; the
        first version of this test made exactly that mistake and stayed green
        under the mutation.
        """
        self._commit("a.txt", "payload")
        self._git("mv", "a.txt", "b.txt")
        status = self._git("status", "--porcelain=v1", "-z")
        self.assertTrue(status.startswith("R"), f"expected a staged rename record, got {status!r}")
        renamed = br.source_fingerprint(self.repo)

        self._git("mv", "b.txt", "a.txt")
        shutil.copyfile(self.repo / "a.txt", self.repo / "b.txt")
        self._git("add", "b.txt")
        copied = br.source_fingerprint(self.repo)
        self.assertNotEqual(renamed, copied)

    def test_an_unstaged_rename_is_not_a_copy_either(self) -> None:
        """The other spelling of the same move — two plain records, resolved
        off the disk rather than off the letter."""
        self._commit("a.txt", "payload")
        os.rename(self.repo / "a.txt", self.repo / "b.txt")
        renamed = br.source_fingerprint(self.repo)
        os.rename(self.repo / "b.txt", self.repo / "a.txt")
        shutil.copyfile(self.repo / "a.txt", self.repo / "b.txt")
        self.assertNotEqual(renamed, br.source_fingerprint(self.repo))

    def test_snapshot_excluded_paths_are_outside_the_fingerprint(self) -> None:
        """The fingerprint must describe what a build WOULD contain — rsync
        excludes these at any depth, so a change inside one is not a source
        change."""
        self._commit("a.txt", "one")
        clean = br.source_fingerprint(self.repo)
        nested = self.repo / "packages" / "x" / "node_modules"
        nested.mkdir(parents=True)
        (nested / "junk.js").write_text("whatever")
        self.assertEqual(br.source_fingerprint(self.repo), clean)

    def test_none_outside_a_git_checkout(self) -> None:
        with tempfile.TemporaryDirectory() as plain:
            self.assertIsNone(br.source_fingerprint(Path(plain)))


class StableRelationTests(GitFixtureTestCase):
    """`stable_relation` — the one place the words "up to date" may come from."""

    def _manifest(self, commit: str, *, fingerprint: str | None, dirty: bool | None = False) -> dict:
        return {"commit": commit, "sourceFingerprint": fingerprint, "dirty": dirty}

    def test_identical_source_is_a_match_even_after_committing_it(self) -> None:
        self._commit("a.txt", "one")
        (self.repo / "a.txt").write_text("two")
        manifest = self._manifest(
            self._git("rev-parse", "HEAD").strip(),
            fingerprint=br.source_fingerprint(self.repo),
            dirty=True,
        )
        self._git("add", "a.txt")
        self._git("commit", "-q", "-m", "same bytes, now committed")
        relation = br.stable_relation(manifest, self.repo)
        self.assertEqual(relation["state"], "match")
        self.assertTrue(br.live_matches(manifest, self.repo))

    def test_divergence_is_its_own_state_and_never_behind(self) -> None:
        """MUTATION: the pre-fix code had no divergence state at all — this
        exact input produced `commitsAheadOfStable: 1` and the badge printed
        "1 commit behind your checkout"."""
        stable_tip, _ = self._diverge()
        relation = br.stable_relation(self._manifest(stable_tip, fingerprint="deadbeefdeadbeef"), self.repo)
        self.assertEqual(relation["state"], "diverged")
        self.assertGreaterEqual(relation["behind"], 1)
        self.assertGreaterEqual(relation["stableAhead"], 1)
        self.assertFalse(br.live_matches(self._manifest(stable_tip, fingerprint="deadbeefdeadbeef"), self.repo))

    def test_stable_newer_than_the_checkout_says_so(self) -> None:
        self._commit("a.txt")
        head_tip = self._git("rev-parse", "HEAD").strip()
        stable_tip = self._commit("b.txt")
        self._git("checkout", "-q", head_tip)
        relation = br.stable_relation(self._manifest(stable_tip, fingerprint="deadbeefdeadbeef"), self.repo)
        self.assertEqual(relation["state"], "stable-ahead")
        self.assertEqual(relation["stableAhead"], 1)

    def test_behind_only_when_stable_is_a_true_ancestor(self) -> None:
        pinned = self._commit("a.txt")
        self._commit("b.txt")
        relation = br.stable_relation(self._manifest(pinned, fingerprint="deadbeefdeadbeef"), self.repo)
        self.assertEqual(relation["state"], "behind")
        self.assertEqual(relation["behind"], 1)

    def test_same_commit_with_edited_bytes_is_different_not_match(self) -> None:
        commit = self._commit("a.txt", "one")
        built = br.source_fingerprint(self.repo)
        (self.repo / "a.txt").write_text("edited after the build")
        manifest = self._manifest(commit, fingerprint=built)
        self.assertEqual(br.stable_relation(manifest, self.repo)["state"], "different")
        self.assertFalse(br.live_matches(manifest, self.repo))

    def test_a_dirty_tree_with_no_recorded_fingerprint_is_unknown_never_match(self) -> None:
        """A manifest written before `sourceFingerprint` existed. The honest
        answer is "cannot verify" — the old code answered `True` here whenever
        the dirty path names happened to line up."""
        commit = self._commit("a.txt", "one")
        (self.repo / "a.txt").write_text("edited")
        manifest = {"commit": commit, "dirty": True, "dirtyPaths": ["a.txt"]}
        self.assertEqual(br.stable_relation(manifest, self.repo)["state"], "unknown")
        self.assertFalse(br.live_matches(manifest, self.repo))

    def test_a_clean_tree_at_stables_commit_matches_without_a_fingerprint(self) -> None:
        """The compatible half: an old manifest is still useful when nothing
        is dirty on either side, so upgrading does not blind the badge."""
        commit = self._commit("a.txt", "one")
        manifest = {"commit": commit, "dirty": False}
        self.assertEqual(br.stable_relation(manifest, self.repo)["state"], "match")
        self.assertTrue(br.live_matches(manifest, self.repo))

    def test_unknown_when_stables_commit_is_absent_from_this_checkout(self) -> None:
        self._commit("a.txt")
        relation = br.stable_relation({"commit": "0" * 40, "sourceFingerprint": "x"}, self.repo)
        self.assertEqual(relation["state"], "unknown")
        self.assertIn("not in this checkout", relation["detail"])

    def test_every_state_is_in_the_declared_vocabulary(self) -> None:
        # The badge switches on these strings; a typo here would render as
        # "freshness unknown" forever without failing anything.
        self._commit("a.txt")
        for manifest in ({}, {"commit": "0" * 40}, {"commit": self._git("rev-parse", "HEAD").strip()}):
            self.assertIn(br.stable_relation(manifest, self.repo)["state"], br.RELATION_STATES)


class CheckoutIdTests(unittest.TestCase):
    """The cross-language contract. `apps/systemsketch/statusEndpoint.ts`,
    `apps/storybook-basics/.storybook/statusEndpoint.ts` and
    `apps/storybook-basics/src/channelBadge.test.ts` pin the SAME literal —
    if the two implementations ever drift, every cross-surface "same
    checkout?" answer silently becomes "no" and nothing else would notice.
    """

    #: sha256("/home/bam/bbox-ui")[:12]. Verified against Node's own
    #: createHash on 2026-09-22.
    PINNED = "574a7e5872fd"

    def test_matches_the_literal_the_typescript_side_pins(self) -> None:
        self.assertEqual(br.checkout_id(Path("/home/bam/bbox-ui")), self.PINNED)

    def test_two_worktrees_of_one_repo_get_different_ids(self) -> None:
        self.assertNotEqual(
            br.checkout_id(Path("/home/bam/bbox-ui")),
            br.checkout_id(Path("/home/bam/bbox-ui/.claude/worktrees/lane-a")),
        )

    def test_it_never_contains_the_path_it_describes(self) -> None:
        identifier = br.checkout_id(Path("/home/bam/bbox-ui"))
        self.assertNotIn("bam", identifier)
        self.assertNotIn("bbox", identifier)


class PreviewIdentityTests(unittest.TestCase):
    """`preview_identity_error` — what the launcher must refuse to hand over
    as this checkout's Preview.

    Every case runs against a REAL loopback HTTP server on an EPHEMERAL port
    (bound to 0 and read back), never a fixed one: Zach has a Storybook on
    :5421 and a whiteboard on :4321 live while this suite runs.
    """

    def _serve(self, payload: object | None, status: int = 200):
        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self) -> None:  # noqa: N802
                if payload is None:
                    self.send_error(404, "no health here")
                    return
                body = json.dumps(payload).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *arguments: object) -> None:  # noqa: A002
                pass

        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.shutdown)
        self.addCleanup(server.server_close)
        return server.server_address[1]

    def test_a_matching_preview_is_accepted(self) -> None:
        config = _fixture_config(product="bbox-ui-storybook", preview_health_path="/api/health")
        root = Path(__file__).resolve().parents[2]
        port = self._serve({"product": "bbox-ui-storybook", "checkoutId": br.checkout_id(root)})
        self.assertIsNone(br.preview_identity_error(port, config, root))

    def test_a_DIFFERENT_checkout_on_the_port_is_refused(self) -> None:
        """The judge's finding: the old body was `if port_responds(port):
        return url`, so a peer worktree's Storybook was handed over and the
        badge labelled it "Preview · live, following disk" for THIS
        checkout."""
        config = _fixture_config(product="bbox-ui-storybook", preview_health_path="/api/health")
        root = Path(__file__).resolve().parents[2]
        port = self._serve({"product": "bbox-ui-storybook", "checkoutId": "ffffffffffff"})
        problem = br.preview_identity_error(port, config, root)
        self.assertIsNotNone(problem)
        self.assertIn("DIFFERENT checkout", problem)

    def test_a_foreign_product_on_the_port_is_refused(self) -> None:
        config = _fixture_config(product="bbox-ui-storybook", preview_health_path="/api/health")
        root = Path(__file__).resolve().parents[2]
        port = self._serve({"product": "something-else", "checkoutId": br.checkout_id(root)})
        problem = br.preview_identity_error(port, config, root)
        self.assertIsNotNone(problem)
        self.assertIn("something-else", problem)

    def test_a_server_with_no_health_route_is_refused(self) -> None:
        config = _fixture_config(product="bbox-ui-storybook", preview_health_path="/api/health")
        root = Path(__file__).resolve().parents[2]
        port = self._serve(None)
        problem = br.preview_identity_error(port, config, root)
        self.assertIsNotNone(problem)
        self.assertIn("does not answer", problem)

    def test_a_product_whose_preview_cannot_identify_itself_is_left_alone(self) -> None:
        """bbox-ui.com's Preview is `next dev`, which serves no health route —
        refusing it would break a working flow to prove nothing, so the
        launcher only enforces where enforcement is possible."""
        self.assertIsNone(br.DOCS.preview_health_path)
        port = self._serve(None)
        self.assertIsNone(br.preview_identity_error(port, br.DOCS, Path.cwd()))

    def test_storybook_enforces_and_docs_does_not(self) -> None:
        self.assertEqual(br.STORYBOOK.preview_health_path, "/api/health")
        self.assertIsNone(br.DOCS.preview_health_path)

    def test_the_storybook_preview_env_publishes_both_ports(self) -> None:
        """The badge stops hardcoding 5430 only if the dev server is told
        which port Stable is on — see `.storybook/statusEndpoint.ts`."""
        env = br.STORYBOOK.preview_env(br.STORYBOOK.stable_port)
        self.assertEqual(env["BBOXUI_SB_STABLE_PORT"], str(br.STORYBOOK.stable_port))


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
