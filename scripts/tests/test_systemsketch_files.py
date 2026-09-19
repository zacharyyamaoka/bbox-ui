"""Acceptance for scripts/systemsketch_files.py — the archive's own store suite, ported.

ACCEPTANCE committed by the planning lane (docs/CHROME-FILES-SETTINGS-PLAN.md)
BEFORE any builder; off-limits to lane ``file-host``. The body is
``/home/bam/systemsketch/tests/test_workspace_store.py`` (916 lines, read on
disk), copied with exactly these changes and no others:

  * the module name ``workspace_store`` -> ``systemsketch_files`` everywhere
    (imports and every ``patch("...")`` target), because that is the ported
    module's name here;
  * ``PROJECT_ROOT`` is ``parents[2]`` (this file sits one folder deeper, in
    ``scripts/tests/``), so ``PROJECT_ROOT / "scripts"`` still names the
    folder holding the module;
  * the last test reads ``scripts/systemsketch_files.py`` where the donor
    read ``scripts/server.py`` — the routes live in the ported module now.

WHY the donor's suite and not a fresh one: it is an INDEPENDENT oracle,
written against the archive's store before this port existed, so it cannot
have been shaped to whatever the port happens to do (the same reasoning
``apps/storybook-basics/vitest.config.ts`` gives for the elbow suite).

Every test runs in a ``tempfile.TemporaryDirectory`` — nothing here reads,
writes, renames or trashes anything under ``/home/bam/SystemSketch``; the one
trash test patches ``subprocess.run`` exactly as the donor did.

Run: ``python3 -m unittest discover -s scripts/tests -t scripts/tests -v``
"""

from __future__ import annotations

import json
import multiprocessing
import os
import stat as stat_module
import tempfile
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import sys


PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

import systemsketch_files  # noqa: E402

from systemsketch_files import (  # noqa: E402
    SYSTEMSKETCH_FORMAT_VERSION,
    WorkspaceConflictError,
    WorkspaceFormatError,
    WorkspacePathError,
    WorkspaceStorageError,
    create_directory,
    default_document_path,
    document_digest,
    document_locks,
    list_documents,
    load_document,
    rename_document,
    save_document,
    stat_document,
    trash_document,
)


def tldraw_source(marker: int = 1) -> str:
    """A plain tldraw file — what a `.tldr` document holds."""
    return json.dumps(
        {
            "tldrawFileFormatVersion": 1,
            "schema": {"schemaVersion": 2, "sequences": {}},
            "records": [{"id": f"shape:{marker}", "typeName": "shape", "type": "block"}],
        }
    )


def document_source(marker: int = 1, *, format_version: int = SYSTEMSKETCH_FORMAT_VERSION) -> str:
    """The same file wrapped as `.systemsketch`, envelope first."""
    document = {
        "systemSketch": {
            "formatVersion": format_version,
            "application": "SystemSketch",
            "shapes": {"block": 1},
            "bindings": {},
        }
    }
    document.update(json.loads(tldraw_source(marker)))
    return json.dumps(document)


def acquire_document_lock_in_child(
    lock_root: str,
    path: str,
    started: multiprocessing.synchronize.Event,
    acquired: multiprocessing.synchronize.Event,
) -> None:
    """Spawn-safe probe proving the runtime lock crosses process boundaries."""
    started.set()
    with document_locks(Path(lock_root), Path(path)):
        acquired.set()


class WorkspaceStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.lock_root = self.root / "runtime" / "locks" / "workspace"
        self.path = self.root / "SystemSketch" / "Architecture.systemsketch"
        self.legacy = self.root / "SystemSketch" / "Legacy.tldr"

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_atomic_save_read_stat_and_listing_carry_both_document_types(self) -> None:
        saved = save_document(
            str(self.path), document_source(), self.root, lock_root=self.lock_root
        )
        save_document(
            str(self.legacy), tldraw_source(), self.root, lock_root=self.lock_root
        )
        loaded = load_document(str(self.path), self.root)
        stat = stat_document(str(self.path), self.root)
        listing = list_documents(None, self.root)

        self.assertEqual(saved["digest"], loaded["digest"])
        self.assertEqual(stat["size"], saved["size"])
        self.assertEqual(stat["digest"], saved["digest"])
        self.assertEqual(
            [(item["title"], item["kind"]) for item in listing["documents"]],
            [("Architecture", "systemsketch"), ("Legacy", "tldraw")],
        )
        self.assertEqual(
            listing["defaultDocument"],
            str(self.root / "SystemSketch" / "Untitled.systemsketch"),
        )
        self.assertTrue(self.path.read_text(encoding="utf-8").endswith("\n"))

    def test_staged_save_retries_two_mismatched_readbacks_then_publishes(self) -> None:
        staged_paths: list[Path] = []

        def readback(staged_path: Path) -> bytes:
            staged_paths.append(staged_path)
            exact = staged_path.read_bytes()
            return exact + b"mismatch" if len(staged_paths) < 3 else exact

        with patch("systemsketch_files._read_staged_bytes", side_effect=readback):
            saved = save_document(
                str(self.path), document_source(1), self.root, lock_root=self.lock_root
            )

        self.assertEqual(len(staged_paths), 3)
        self.assertEqual(len(set(staged_paths)), 3, "each retry must use a fresh inode")
        self.assertEqual(saved["digest"], stat_document(str(self.path), self.root)["digest"])
        self.assertEqual(list(self.path.parent.glob(f".{self.path.stem}.*.tmp")), [])

    def test_all_staged_readback_mismatches_preserve_canonical_and_clean_temps(self) -> None:
        base = save_document(
            str(self.path), document_source(1), self.root, lock_root=self.lock_root
        )
        original = self.path.read_bytes()
        staged_paths: list[Path] = []

        def mismatched_readback(staged_path: Path) -> bytes:
            staged_paths.append(staged_path)
            return staged_path.read_bytes() + b"mismatch"

        with patch("systemsketch_files._read_staged_bytes", side_effect=mismatched_readback):
            with self.assertRaisesRegex(WorkspaceStorageError, "after 3 attempts"):
                save_document(
                    str(self.path),
                    document_source(2),
                    self.root,
                    base_digest=base["digest"],
                    lock_root=self.lock_root,
                )

        self.assertEqual(len(staged_paths), 3)
        self.assertEqual(len(set(staged_paths)), 3, "a mismatched inode must not be reused")
        self.assertEqual(self.path.read_bytes(), original)
        self.assertEqual(list(self.path.parent.glob(f".{self.path.stem}.*.tmp")), [])

    def test_save_returns_metadata_from_the_confirmed_canonical_readback(self) -> None:
        base = save_document(
            str(self.path), document_source(1), self.root, lock_root=self.lock_root
        )

        with patch(
            "systemsketch_files._read_identity", wraps=systemsketch_files._read_identity
        ) as read_identity:
            saved = save_document(
                str(self.path),
                document_source(2),
                self.root,
                base_digest=base["digest"],
                lock_root=self.lock_root,
            )

        self.assertEqual(
            read_identity.call_count,
            2,
            "an update must read once for CAS and once after atomic publication",
        )
        self.assertEqual(saved, stat_document(str(self.path), self.root))

    def test_atomic_replace_preserves_existing_mode_but_new_files_stay_private(self) -> None:
        base = save_document(
            str(self.path), document_source(1), self.root, lock_root=self.lock_root
        )
        self.path.chmod(0o640)

        save_document(
            str(self.path),
            document_source(2),
            self.root,
            base_digest=base["digest"],
            lock_root=self.lock_root,
        )

        self.assertEqual(stat_module.S_IMODE(self.path.stat().st_mode), 0o640)
        fresh = self.path.with_name("Fresh.systemsketch")
        save_document(str(fresh), document_source(3), self.root, lock_root=self.lock_root)
        self.assertEqual(stat_module.S_IMODE(fresh.stat().st_mode), 0o600)

        privileged = self.path.with_name("Privileged.systemsketch")
        privileged_base = save_document(
            str(privileged), document_source(1), self.root, lock_root=self.lock_root
        )
        privileged.chmod(0o6755)
        save_document(
            str(privileged),
            document_source(2),
            self.root,
            base_digest=privileged_base["digest"],
            lock_root=self.lock_root,
        )
        self.assertEqual(stat_module.S_IMODE(privileged.stat().st_mode), 0o755)

    def test_atomic_replace_preserves_an_existing_alternate_group_for_0660(self) -> None:
        base = save_document(
            str(self.path), document_source(1), self.root, lock_root=self.lock_root
        )
        original_gid = self.path.stat().st_gid
        alternate_gid = next(
            (gid for gid in os.getgroups() if gid != original_gid),
            None,
        )
        if alternate_gid is None:
            self.skipTest("the test account has no alternate supplementary group")
        try:
            os.chown(self.path, -1, alternate_gid)
        except OSError as error:
            self.skipTest(f"the test account cannot select its supplementary group: {error}")
        self.path.chmod(0o660)

        save_document(
            str(self.path),
            document_source(2),
            self.root,
            base_digest=base["digest"],
            lock_root=self.lock_root,
        )

        saved_stat = self.path.stat()
        self.assertEqual(saved_stat.st_gid, alternate_gid)
        self.assertEqual(stat_module.S_IMODE(saved_stat.st_mode), 0o660)

    def test_permission_preservation_sets_alternate_gid_before_0660_mode(self) -> None:
        staged = self.root / "staged.tmp"
        staged.write_bytes(b"candidate")
        initial_gid = staged.stat().st_gid
        target_gid = initial_gid + 1
        disk_stat = SimpleNamespace(st_mode=0o660, st_gid=target_gid)
        operations: list[tuple[object, ...]] = []
        real_fchmod = os.fchmod

        def record_fchown(descriptor: int, uid: int, gid: int) -> None:
            operations.append(("gid", uid, gid))

        def record_fchmod(descriptor: int, mode: int) -> None:
            operations.append(("mode", mode))
            real_fchmod(descriptor, mode)

        with (
            patch(
                "systemsketch_files.os.fstat",
                side_effect=[
                    SimpleNamespace(st_gid=initial_gid),
                    SimpleNamespace(st_gid=target_gid),
                ],
            ),
            patch("systemsketch_files.os.fchown", side_effect=record_fchown),
            patch("systemsketch_files.os.fchmod", side_effect=record_fchmod),
        ):
            systemsketch_files._preserve_existing_mode(staged, disk_stat)

        self.assertEqual(
            operations,
            [("gid", -1, target_gid), ("mode", 0o660)],
            "the replacement must establish its group before granting group access",
        )
        self.assertEqual(stat_module.S_IMODE(staged.stat().st_mode), 0o660)

    def test_permission_fallback_never_grants_group_bits_to_the_wrong_gid(self) -> None:
        staged = self.root / "staged.tmp"
        staged.write_bytes(b"candidate")
        staged_gid = staged.stat().st_gid
        disk_stat = SimpleNamespace(st_mode=0o660, st_gid=staged_gid + 1)

        with patch(
            "systemsketch_files.os.fchown",
            side_effect=PermissionError("group cannot be preserved"),
        ):
            systemsketch_files._preserve_existing_mode(staged, disk_stat)

        saved_stat = staged.stat()
        self.assertEqual(saved_stat.st_gid, staged_gid)
        self.assertEqual(stat_module.S_IMODE(saved_stat.st_mode), 0o600)

    def test_replayed_save_after_a_lost_http_response_is_idempotent(self) -> None:
        base = save_document(
            str(self.path), document_source(1), self.root, lock_root=self.lock_root
        )
        committed = save_document(
            str(self.path),
            document_source(2),
            self.root,
            base_digest=base["digest"],
            lock_root=self.lock_root,
        )
        committed_stat = self.path.stat()

        replayed = save_document(
            str(self.path),
            document_source(2),
            self.root,
            base_digest=base["digest"],
            lock_root=self.lock_root,
        )
        replayed_stat = self.path.stat()

        self.assertEqual(replayed, committed)
        self.assertEqual(replayed_stat.st_ino, committed_stat.st_ino)
        self.assertEqual(replayed_stat.st_mtime_ns, committed_stat.st_mtime_ns)
        self.assertEqual(list(self.path.parent.glob(f".{self.path.stem}.*.tmp")), [])

    def test_same_bytes_do_not_bypass_create_only_no_clobber(self) -> None:
        save_document(
            str(self.path), document_source(1), self.root, lock_root=self.lock_root
        )
        original_stat = self.path.stat()

        with self.assertRaisesRegex(WorkspaceConflictError, "already exists"):
            save_document(
                str(self.path), document_source(1), self.root, lock_root=self.lock_root
            )

        current_stat = self.path.stat()
        self.assertEqual(current_stat.st_ino, original_stat.st_ino)
        self.assertEqual(current_stat.st_mtime_ns, original_stat.st_mtime_ns)

    def test_replayed_save_retries_directory_durability_before_acknowledging(self) -> None:
        base = save_document(
            str(self.path), document_source(1), self.root, lock_root=self.lock_root
        )
        committed = save_document(
            str(self.path),
            document_source(2),
            self.root,
            base_digest=base["digest"],
            lock_root=self.lock_root,
        )

        with patch(
            "systemsketch_files._fsync_directory",
            wraps=systemsketch_files._fsync_directory,
        ) as sync_directory:
            replayed = save_document(
                str(self.path),
                document_source(2),
                self.root,
                base_digest=base["digest"],
                lock_root=self.lock_root,
            )

        self.assertEqual(replayed, committed)
        sync_directory.assert_called_once_with(self.path.parent)

    def test_external_replace_after_publication_is_reported_without_blind_retry(self) -> None:
        base = save_document(
            str(self.path), document_source(1), self.root, lock_root=self.lock_root
        )
        external = systemsketch_files.normalize_document_source(
            document_source(9), suffix=".systemsketch"
        )

        def external_write(_directory: Path) -> None:
            self.path.write_text(external, encoding="utf-8")

        with patch("systemsketch_files._fsync_directory", side_effect=external_write):
            with self.assertRaisesRegex(
                WorkspaceConflictError, "changed before the save could be confirmed"
            ):
                save_document(
                    str(self.path),
                    document_source(2),
                    self.root,
                    base_digest=base["digest"],
                    lock_root=self.lock_root,
                )

        self.assertEqual(self.path.read_text(encoding="utf-8"), external)

    def test_stat_digest_hashes_exact_bytes_before_newline_decoding(self) -> None:
        self.path.parent.mkdir(parents=True)
        first = b"alpha\r\nbeta\ngamma\n"
        second = b"alpha\nbeta\r\ngamma\n"
        self.assertEqual(len(first), len(second))
        fixed_ns = 1_700_000_000_123_456_789

        self.path.write_bytes(first)
        os.utime(self.path, ns=(fixed_ns, fixed_ns))
        before = stat_document(str(self.path), self.root)

        self.path.write_bytes(second)
        os.utime(self.path, ns=(fixed_ns, fixed_ns))
        after = stat_document(str(self.path), self.root)

        self.assertEqual(before["size"], after["size"])
        self.assertEqual(before["mtime"], after["mtime"])
        self.assertNotEqual(before["digest"], after["digest"])
        self.assertEqual(before["digest"], document_digest(first.decode("utf-8")))
        self.assertEqual(after["digest"], document_digest(second.decode("utf-8")))

    def test_stat_refuses_to_poll_beyond_the_document_size_limit(self) -> None:
        self.path.parent.mkdir(parents=True)
        self.path.write_bytes(b"123456789")

        with patch("systemsketch_files.MAX_DOCUMENT_BYTES", 8):
            with self.assertRaisesRegex(WorkspacePathError, "too large"):
                stat_document(str(self.path), self.root)
            with self.assertRaisesRegex(WorkspacePathError, "too large"):
                load_document(str(self.path), self.root)

    def test_document_lock_is_shared_across_processes_and_kept_out_of_the_workspace(self) -> None:
        context = multiprocessing.get_context("spawn")
        started = context.Event()
        acquired = context.Event()
        process = context.Process(
            target=acquire_document_lock_in_child,
            args=(str(self.lock_root), str(self.path), started, acquired),
        )
        try:
            with document_locks(self.lock_root, self.path):
                process.start()
                self.assertTrue(started.wait(3), "child never attempted the document lock")
                self.assertFalse(
                    acquired.wait(0.2),
                    "a second process acquired a canonical path that was already locked",
                )
            self.assertTrue(acquired.wait(3), "child did not acquire the released document lock")
            process.join(3)
            self.assertEqual(process.exitcode, 0)
        finally:
            if process.is_alive():
                process.terminate()
                process.join(3)

        self.assertEqual(list(self.path.parent.glob("*.lock")), [])
        self.assertEqual(len(list(self.lock_root.glob("*.lock"))), 1)

    def test_the_suffix_decides_the_encoding_in_both_directions(self) -> None:
        """A `.systemsketch` must carry the envelope; a `.tldr` must not."""
        with self.assertRaisesRegex(WorkspaceFormatError, "must carry a systemSketch envelope"):
            save_document(
                str(self.path), tldraw_source(), self.root, lock_root=self.lock_root
            )
        with self.assertRaisesRegex(WorkspaceFormatError, "must stay a plain tldraw file"):
            save_document(
                str(self.legacy), document_source(), self.root, lock_root=self.lock_root
            )

        # Reading is the lenient direction: a hand-renamed file still opens.
        renamed_by_hand = self.root / "SystemSketch" / "ByHand.systemsketch"
        renamed_by_hand.parent.mkdir(parents=True, exist_ok=True)
        renamed_by_hand.write_text(tldraw_source(), encoding="utf-8")
        self.assertEqual(load_document(str(renamed_by_hand), self.root)["title"], "ByHand")

    def test_a_legacy_pyblocks_systemsketch_is_readable_but_never_writable(self) -> None:
        legacy = self.root / "SystemSketch" / "Golden.systemsketch"
        legacy.parent.mkdir(parents=True, exist_ok=True)
        source = json.dumps({
            "version": 1,
            "nodes": [],
            "edges": [],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
            "metadata": {"pyblocks.golden": {"version": 1}},
        })
        legacy.write_text(source, encoding="utf-8")

        self.assertEqual(load_document(str(legacy), self.root)["source"], source)
        with self.assertRaisesRegex(WorkspaceFormatError, "tldrawFileFormatVersion"):
            save_document(
                str(legacy),
                source,
                self.root,
                base_digest=document_digest(source),
                lock_root=self.lock_root,
            )

    def test_a_document_from_a_newer_systemsketch_loads_exactly_but_cannot_be_overwritten(self) -> None:
        future = self.root / "SystemSketch" / "Future.systemsketch"
        future.parent.mkdir(parents=True, exist_ok=True)
        source = document_source(format_version=SYSTEMSKETCH_FORMAT_VERSION + 1)
        future.write_text(source, encoding="utf-8")
        loaded = load_document(str(future), self.root)
        self.assertEqual(loaded["source"], source)
        with self.assertRaisesRegex(WorkspaceFormatError, "written by a newer SystemSketch"):
            save_document(
                str(future),
                source,
                self.root,
                base_digest=loaded["digest"],
                lock_root=self.lock_root,
            )

    def test_create_directory_is_visible_nested_and_preserves_unicode(self) -> None:
        parent = self.root / "SystemSketch"
        parent.mkdir()
        created = create_directory(str(parent), "  Architecture Ω  ", self.root)
        nested = create_directory(created["path"], "Drafts", self.root)

        self.assertEqual(created, {
            "name": "Architecture Ω",
            "path": str(parent / "Architecture Ω"),
        })
        self.assertEqual(nested["path"], str(parent / "Architecture Ω" / "Drafts"))
        self.assertIn(created, list_documents(str(parent), self.root)["directories"])

    def test_create_directory_rejects_invisible_unsafe_and_colliding_names(self) -> None:
        parent = self.root / "SystemSketch"
        parent.mkdir()
        for name in ("", " ", ".", "..", ".hidden", "a/b", "a\\b", "bad\nname"):
            with self.subTest(name=repr(name)), self.assertRaises(WorkspacePathError):
                create_directory(str(parent), name, self.root)

        occupied_file = parent / "Taken"
        occupied_file.write_text("occupied", encoding="utf-8")
        with self.assertRaisesRegex(WorkspacePathError, "already exists"):
            create_directory(str(parent), "Taken", self.root)
        occupied_file.unlink()
        (parent / "Taken").mkdir()
        with self.assertRaisesRegex(WorkspacePathError, "already exists"):
            create_directory(str(parent), "Taken", self.root)

    def test_create_directory_requires_a_real_confined_parent(self) -> None:
        missing = self.root / "missing"
        with self.assertRaisesRegex(WorkspacePathError, "does not exist"):
            create_directory(str(missing), "Folder", self.root)
        file_parent = self.root / "file"
        file_parent.write_text("not a folder", encoding="utf-8")
        with self.assertRaisesRegex(WorkspacePathError, "not a directory"):
            create_directory(str(file_parent), "Folder", self.root)
        with self.assertRaisesRegex(WorkspacePathError, "stay under"):
            create_directory(str(self.root.parent), "Outside", self.root)

    def test_zero_byte_documents_open_blank_and_save_their_first_real_revision(self) -> None:
        """Standalone matches the IDE's intentional zero-byte new-file state."""
        for path, first_revision in (
            (self.path, document_source()),
            (self.legacy, tldraw_source()),
        ):
            with self.subTest(suffix=path.suffix):
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"")

                loaded = load_document(str(path), self.root)
                self.assertEqual(loaded["source"], "")
                self.assertEqual(loaded["size"], 0)
                self.assertEqual(loaded["digest"], document_digest(""))

                saved = save_document(
                    str(path),
                    first_revision,
                    self.root,
                    base_digest=loaded["digest"],
                    lock_root=self.lock_root,
                )
                self.assertGreater(saved["size"], 0)
                self.assertEqual(load_document(str(path), self.root)["digest"], saved["digest"])

    def test_an_existing_legacy_untitled_board_stays_the_default_document(self) -> None:
        legacy_default = self.root / "SystemSketch" / "Untitled.tldr"
        legacy_default.parent.mkdir(parents=True, exist_ok=True)
        legacy_default.write_text(tldraw_source(), encoding="utf-8")
        self.assertEqual(default_document_path(self.root), legacy_default)

        current_default = self.root / "SystemSketch" / "Untitled.systemsketch"
        current_default.write_text(document_source(), encoding="utf-8")
        self.assertEqual(default_document_path(self.root), current_default)

    def test_paths_are_confined_to_the_configured_root(self) -> None:
        outside = self.root.parent / "outside.systemsketch"
        with self.assertRaisesRegex(WorkspacePathError, "stay under"):
            save_document(
                str(outside), document_source(), self.root, lock_root=self.lock_root
            )
        with self.assertRaisesRegex(WorkspacePathError, "end with .systemsketch or .tldr"):
            save_document(
                str(self.root / "board.json"),
                document_source(),
                self.root,
                lock_root=self.lock_root,
            )

    def test_allow_any_path_bypasses_the_root_fence_for_every_operation(self) -> None:
        with tempfile.TemporaryDirectory() as outside_directory:
            outside = Path(outside_directory) / "Elsewhere.systemsketch"
            renamed = Path(outside_directory) / "Renamed.systemsketch"

            # Off by default: the fence still refuses a path outside the root.
            with self.assertRaisesRegex(WorkspacePathError, "stay under an allowed root"):
                save_document(str(outside), document_source(), self.root, lock_root=self.lock_root)
            with self.assertRaisesRegex(WorkspacePathError, "stay under an allowed root"):
                list_documents(outside_directory, self.root)
            with self.assertRaisesRegex(WorkspacePathError, "stay under an allowed root"):
                create_directory(outside_directory, "Nested", self.root)

            saved = save_document(
                str(outside),
                document_source(),
                self.root,
                lock_root=self.lock_root,
                allow_any_path=True,
            )
            loaded = load_document(str(outside), self.root, allow_any_path=True)
            self.assertEqual(loaded["digest"], saved["digest"])
            self.assertEqual(
                stat_document(str(outside), self.root, allow_any_path=True)["size"],
                saved["size"],
            )
            self.assertEqual(
                [item["title"] for item in list_documents(outside_directory, self.root, allow_any_path=True)["documents"]],
                ["Elsewhere"],
            )
            nested = create_directory(outside_directory, "Nested", self.root, allow_any_path=True)
            self.assertTrue(Path(nested["path"]).is_dir())

            renamed_result = rename_document(
                str(outside),
                str(renamed),
                self.root,
                base_digest=saved["digest"],
                lock_root=self.lock_root,
                allow_any_path=True,
            )
            self.assertEqual(renamed_result["path"], str(renamed))

            trash_document(
                str(renamed),
                self.root,
                base_digest=renamed_result["digest"],
                lock_root=self.lock_root,
                allow_any_path=True,
            )
            self.assertFalse(renamed.exists())

            # A relative path is still refused even with the fence bypassed.
            with self.assertRaisesRegex(WorkspacePathError, "path must be absolute"):
                load_document("relative.systemsketch", self.root, allow_any_path=True)

    def test_an_explicit_additional_root_allows_a_worktree_board_only(self) -> None:
        with (
            tempfile.TemporaryDirectory() as development_directory,
            tempfile.TemporaryDirectory() as outside_directory,
        ):
            development_root = Path(development_directory)
            review = development_root / "sketches" / "review" / "Feature.systemsketch"
            saved = save_document(
                str(review),
                document_source(),
                self.root,
                additional_roots=(development_root,),
                lock_root=self.lock_root,
            )
            loaded = load_document(
                str(review),
                self.root,
                additional_roots=(development_root,),
            )

            self.assertEqual(loaded["digest"], saved["digest"])
            self.assertEqual(
                stat_document(
                    str(review),
                    self.root,
                    additional_roots=(development_root,),
                )["size"],
                saved["size"],
            )
            self.assertEqual(list_documents(None, self.root)["root"], str(self.root))
            # Extra roots authorize a direct document, not a second browser.
            # Save As and New Folder must remain rooted in the user's primary
            # workspace even while a review fixture is open from a worktree.
            with self.assertRaisesRegex(WorkspacePathError, "stay under an allowed root"):
                list_documents(str(review.parent), self.root)
            with self.assertRaisesRegex(WorkspacePathError, "stay under an allowed root"):
                create_directory(str(review.parent), "Escaped", self.root)
            self.assertFalse((review.parent / "Escaped").exists())
            with self.assertRaisesRegex(WorkspacePathError, "stay under an allowed root"):
                load_document(
                    str(Path(outside_directory) / "Other.systemsketch"),
                    self.root,
                    additional_roots=(development_root,),
                )

    def test_digest_fence_refuses_external_edits_and_missing_updates(self) -> None:
        first = save_document(
            str(self.path), document_source(1), self.root, lock_root=self.lock_root
        )
        self.path.write_text(document_source(2), encoding="utf-8")
        with self.assertRaisesRegex(WorkspaceConflictError, "changed on disk"):
            save_document(
                str(self.path),
                document_source(3),
                self.root,
                base_digest=first["digest"],
                lock_root=self.lock_root,
            )

        latest = load_document(str(self.path), self.root)
        self.path.unlink()
        with self.assertRaisesRegex(WorkspaceConflictError, "removed from disk"):
            save_document(
                str(self.path),
                document_source(4),
                self.root,
                base_digest=latest["digest"],
                lock_root=self.lock_root,
            )

    def test_two_concurrent_same_base_saves_have_one_winner_and_one_conflict(self) -> None:
        base = save_document(
            str(self.path), document_source(0), self.root, lock_root=self.lock_root
        )
        start = threading.Barrier(3)

        def attempt(marker: int) -> dict[str, object]:
            start.wait(timeout=3)
            try:
                saved = save_document(
                    str(self.path),
                    document_source(marker),
                    self.root,
                    base_digest=base["digest"],
                    lock_root=self.lock_root,
                )
            except WorkspaceConflictError as error:
                return {
                    "kind": "conflict",
                    "marker": marker,
                    "disk_digest": error.disk_digest,
                }
            return {"kind": "saved", "marker": marker, "digest": saved["digest"]}

        with ThreadPoolExecutor(max_workers=2) as pool:
            # Queue both writers behind the same already-held path lock. Once it
            # opens, the first writer replaces the base and the second must make
            # its digest decision against that winner rather than the old file.
            with document_locks(self.lock_root, self.path):
                futures = [pool.submit(attempt, marker) for marker in (1, 2)]
                start.wait(timeout=3)
                time.sleep(0.05)
                self.assertFalse(any(future.done() for future in futures))
            outcomes = [future.result(timeout=3) for future in futures]

        saved = [outcome for outcome in outcomes if outcome["kind"] == "saved"]
        conflicts = [outcome for outcome in outcomes if outcome["kind"] == "conflict"]
        self.assertEqual(len(saved), 1, outcomes)
        self.assertEqual(len(conflicts), 1, outcomes)
        final_source = self.path.read_text(encoding="utf-8")
        self.assertEqual(document_digest(final_source), saved[0]["digest"])
        self.assertEqual(conflicts[0]["disk_digest"], saved[0]["digest"])
        self.assertIn(
            f'shape:{saved[0]["marker"]}',
            final_source,
            "the disk document is not the successful writer's revision",
        )

    def test_save_and_rename_from_one_base_resolve_to_one_sequential_result(self) -> None:
        base = save_document(
            str(self.path), document_source(1), self.root, lock_root=self.lock_root
        )
        destination = self.path.with_name("Renamed.systemsketch")
        start = threading.Barrier(3)

        def attempt_save() -> str:
            start.wait(timeout=3)
            try:
                save_document(
                    str(self.path),
                    document_source(2),
                    self.root,
                    base_digest=base["digest"],
                    lock_root=self.lock_root,
                )
            except WorkspaceConflictError:
                return "save-conflict"
            return "save"

        def attempt_rename() -> str:
            start.wait(timeout=3)
            try:
                rename_document(
                    str(self.path),
                    str(destination),
                    self.root,
                    base_digest=base["digest"],
                    lock_root=self.lock_root,
                )
            except (FileNotFoundError, WorkspaceConflictError):
                return "rename-conflict"
            return "rename"

        with ThreadPoolExecutor(max_workers=2) as pool:
            # Holding both paths also proves reverse-sized lock sets share the
            # same sorted acquisition order rather than deadlocking.
            with document_locks(self.lock_root, destination, self.path):
                futures = [pool.submit(attempt_save), pool.submit(attempt_rename)]
                start.wait(timeout=3)
                time.sleep(0.05)
                self.assertFalse(any(future.done() for future in futures))
            outcomes = {future.result(timeout=3) for future in futures}

        self.assertIn(outcomes, ({"save", "rename-conflict"}, {"rename", "save-conflict"}))
        if "save" in outcomes:
            self.assertTrue(self.path.is_file())
            self.assertFalse(destination.exists())
            self.assertIn("shape:2", self.path.read_text(encoding="utf-8"))
        else:
            self.assertFalse(self.path.exists())
            self.assertTrue(destination.is_file())
            self.assertIn("shape:1", destination.read_text(encoding="utf-8"))

    def test_rename_is_no_clobber_revision_checked_and_type_preserving(self) -> None:
        first = save_document(
            str(self.path), document_source(1), self.root, lock_root=self.lock_root
        )
        destination = self.path.with_name("Renamed.systemsketch")
        renamed = rename_document(
            str(self.path),
            str(destination),
            self.root,
            base_digest=first["digest"],
            lock_root=self.lock_root,
        )
        self.assertFalse(self.path.exists())
        self.assertEqual(renamed["path"], str(destination))

        occupied = self.path.with_name("Occupied.systemsketch")
        save_document(
            str(occupied), document_source(2), self.root, lock_root=self.lock_root
        )
        with self.assertRaisesRegex(WorkspaceConflictError, "already exists"):
            rename_document(
                str(destination),
                str(occupied),
                self.root,
                base_digest=renamed["digest"],
                lock_root=self.lock_root,
            )

        # A rename that changed the extension would relabel the bytes without
        # rewriting them, so it is refused rather than silently corrupting.
        with self.assertRaisesRegex(WorkspacePathError, "cannot change a document's type"):
            rename_document(
                str(destination),
                str(destination.with_name("Renamed.tldr")),
                self.root,
                base_digest=renamed["digest"],
                lock_root=self.lock_root,
            )

    def test_rename_cannot_expand_into_a_cross_directory_move(self) -> None:
        saved = save_document(
            str(self.path), document_source(1), self.root, lock_root=self.lock_root
        )
        destination = self.root / "Archive" / "Architecture.systemsketch"
        destination.parent.mkdir()

        with patch("systemsketch_files._fsync_directory") as fsync_directory:
            with self.assertRaisesRegex(WorkspacePathError, "current folder"):
                rename_document(
                    str(self.path),
                    str(destination),
                    self.root,
                    base_digest=saved["digest"],
                    lock_root=self.lock_root,
                )

        self.assertTrue(self.path.is_file())
        self.assertFalse(destination.exists())
        fsync_directory.assert_not_called()

    def test_delete_moves_the_exact_loaded_revision_to_desktop_trash(self) -> None:
        saved = save_document(
            str(self.path), document_source(), self.root, lock_root=self.lock_root
        )
        completed = type("Completed", (), {"returncode": 0, "stdout": "", "stderr": ""})()
        with patch("systemsketch_files.shutil.which", return_value="/usr/bin/gio"), patch(
            "systemsketch_files.subprocess.run", return_value=completed
        ) as run:
            trash_document(
                str(self.path),
                self.root,
                base_digest=saved["digest"],
                lock_root=self.lock_root,
            )
        self.assertEqual(run.call_args.args[0], ["/usr/bin/gio", "trash", str(self.path)])

    def test_the_host_never_shells_out_to_a_desktop_file_chooser(self) -> None:
        """The in-app browser is the only chooser.

        A GUI subprocess run inside an HTTP handler makes a second application
        a hard dependency of File > Open: when zenity wedged, the request never
        returned and the whole Open path wedged with it.
        """
        scripts = PROJECT_ROOT / "scripts"
        for module in sorted(scripts.glob("*.py")):
            source = module.read_text(encoding="utf-8")
            for chooser in ("zenity", "kdialog", "yad", "--file-selection"):
                self.assertNotIn(chooser, source, f"{module.name} reintroduced {chooser}")

    def test_no_workspace_endpoint_spawns_a_chooser(self) -> None:
        server = (PROJECT_ROOT / "scripts" / "systemsketch_files.py").read_text(encoding="utf-8")
        self.assertNotIn("/api/workspace/pick", server)
        self.assertIn("/api/workspace/list", server)

if __name__ == "__main__":
    unittest.main()
