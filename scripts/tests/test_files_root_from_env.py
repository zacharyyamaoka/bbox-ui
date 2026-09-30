"""``systemsketch_files.py serve --files-root-from-env`` — Stable's file host
resolves its roots the way Preview's ``apps/systemsketch/devFileHost.ts`` does.

WHY this file exists (Codex audit, 2026-09-29): the dock's Stable runs this CLI
as a process with ``--files-root {home}``; without the flag, an isolated or
agent run that set ``SYSTEMSKETCH_FILES_ROOT`` would write into the real home,
while Preview (``resolveDevFileHostRoots``) honoured the override.

Every server binds 127.0.0.1 on an ephemeral port over a temporary directory;
the "home" each case names is a temp folder, never the real one.

Run: ``python3 -m pytest scripts/tests/test_files_root_from_env.py -v``
"""

from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import tempfile
import unittest
import urllib.request
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = PROJECT_ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

import systemsketch_files  # noqa: E402
from systemsketch_files import LISTENING_BANNER, RootOverrideError, roots_from_environment  # noqa: E402


class RootsFromEnvironmentTests(unittest.TestCase):
    """devFileHost.ts's `resolveDevFileHostRoots`, minus its VITEST row: empty is unset, relative is refused."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.home = Path(self._tmp.name)
        self.shared = systemsketch_files.default_lock_root(self.home)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def resolve(self, environment: dict[str, str], lock_root: Path | None = None) -> tuple[Path, Path]:
        return roots_from_environment(environment, self.home, lock_root, self.home)

    def test_no_override_keeps_the_named_root_and_the_shared_lock_root(self) -> None:
        self.assertEqual(self.resolve({}), (self.home, self.shared))

    def test_no_override_keeps_an_explicit_lock_root(self) -> None:
        self.assertEqual(self.resolve({}, Path("/l")), (self.home, Path("/l")))

    def test_the_override_wins_with_the_shared_lock_root(self) -> None:
        self.assertEqual(self.resolve({"SYSTEMSKETCH_FILES_ROOT": "/scratch/boards"}), (Path("/scratch/boards"), self.shared))

    def test_the_override_wins_with_its_own_lock_root(self) -> None:
        environment = {"SYSTEMSKETCH_FILES_ROOT": "/scratch/boards", "SYSTEMSKETCH_LOCK_ROOT": "/scratch/locks"}
        self.assertEqual(self.resolve(environment, Path("/l")), (Path("/scratch/boards"), Path("/scratch/locks")))

    def test_an_empty_lock_root_is_unset_and_means_the_shared_one(self) -> None:
        # Round 2: Path("") is the cwd — Stable's release snapshot, Preview's checkout. Never that.
        environment = {"SYSTEMSKETCH_FILES_ROOT": "/scratch/boards", "SYSTEMSKETCH_LOCK_ROOT": ""}
        self.assertEqual(self.resolve(environment), (Path("/scratch/boards"), self.shared))

    def test_an_empty_files_root_is_unset(self) -> None:
        self.assertEqual(self.resolve({"SYSTEMSKETCH_FILES_ROOT": "", "SYSTEMSKETCH_LOCK_ROOT": "/x"}), (self.home, self.shared))

    def test_a_lock_root_alone_changes_nothing(self) -> None:
        # devFileHost.ts reads SYSTEMSKETCH_LOCK_ROOT only beside SYSTEMSKETCH_FILES_ROOT.
        self.assertEqual(self.resolve({"SYSTEMSKETCH_LOCK_ROOT": "locks"}), (self.home, self.shared))

    def test_a_relative_override_is_refused_naming_it(self) -> None:
        # Round 3: no base is shared by Stable (release snapshot), Preview (main checkout) and an
        # `sps dev` lane (its worktree), so a relative value cannot name one folder — refused.
        for environment, named in (
            ({"SYSTEMSKETCH_FILES_ROOT": "boards"}, 'SYSTEMSKETCH_FILES_ROOT="boards"'),
            ({"SYSTEMSKETCH_FILES_ROOT": "/scratch/boards", "SYSTEMSKETCH_LOCK_ROOT": "locks"}, 'SYSTEMSKETCH_LOCK_ROOT="locks"'),
            ({"SYSTEMSKETCH_FILES_ROOT": "/scratch/boards", "SYSTEMSKETCH_LOCK_ROOT": "./"}, 'SYSTEMSKETCH_LOCK_ROOT="./"'),
        ):
            with self.assertRaises(RootOverrideError) as caught:
                self.resolve(environment)
            self.assertIn(named, str(caught.exception))
            self.assertIn("must be an absolute path", str(caught.exception))


class ServeTests(unittest.TestCase):
    """The real CLI: where a save actually lands, and where its lock does."""

    def serve(self, base: Path, *flags: str, environment: dict[str, str], cwd: Path | None = None) -> tuple[subprocess.Popen, str]:
        process = subprocess.Popen(
            [sys.executable, str(SCRIPTS / "systemsketch_files.py"), "serve", "--files-root", str(base / "home"),
             "--port", "0", "--desktop", f"record:{base / 'desktop.jsonl'}", *flags],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=cwd,
            env={key: value for key, value in {**os.environ, "HOME": str(base / "home"), **environment}.items()
                 if not (key in ("SYSTEMSKETCH_FILES_ROOT", "SYSTEMSKETCH_LOCK_ROOT") and key not in environment)},
        )
        line = process.stdout.readline().strip()
        self.assertTrue(line.startswith(LISTENING_BANNER), line)
        return process, line.split(" ", 1)[1]

    def stop(self, process: subprocess.Popen) -> None:
        process.send_signal(signal.SIGTERM)
        try:
            process.wait(timeout=10)
        finally:
            if process.poll() is None:
                process.kill()
            process.stdout.close()
            process.stderr.close()

    def save(self, origin: str, path: Path) -> int:
        body = json.dumps({"path": str(path), "baseDigest": None, "source": json.dumps(
            {"tldrawFileFormatVersion": 1, "schema": {"schemaVersion": 2, "sequences": {}}, "records": []})}).encode()
        request = urllib.request.Request(origin + "/api/workspace/file", data=body, method="POST",
                                         headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status

    def health(self, origin: str) -> dict:
        with urllib.request.urlopen(origin + "/api/health", timeout=10) as response:
            return json.load(response)

    def test_the_flag_moves_files_and_locks_to_the_override(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary).resolve()
            (base / "home" / "SystemSketch").mkdir(parents=True)
            (base / "boards" / "SystemSketch").mkdir(parents=True)
            process, origin = self.serve(base, "--files-root-from-env", environment={
                "SYSTEMSKETCH_FILES_ROOT": str(base / "boards"), "SYSTEMSKETCH_LOCK_ROOT": str(base / "locks")})
            try:
                self.assertEqual(self.health(origin)["filesRoot"], str(base / "boards"))
                self.assertEqual(self.save(origin, base / "boards" / "SystemSketch" / "B.tldr"), 200)
                self.assertTrue((base / "boards" / "SystemSketch" / "B.tldr").is_file())
                self.assertTrue(any((base / "locks").glob("*.lock")))
                self.assertEqual(list((base / "home" / "SystemSketch").iterdir()), [])
            finally:
                self.stop(process)

    def test_the_flag_without_an_override_serves_the_named_root(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary).resolve()
            (base / "home" / "SystemSketch").mkdir(parents=True)
            process, origin = self.serve(base, "--files-root-from-env", environment={})
            try:
                self.assertEqual(self.health(origin)["filesRoot"], str(base / "home"))
            finally:
                self.stop(process)

    def test_an_empty_lock_root_is_the_same_folder_from_any_cwd(self) -> None:
        """Measured through real saves: two hosts started from two different cwds (Stable's release
        snapshot vs Preview's checkout) lock in ONE folder — the shared one — for an empty value."""
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary).resolve()
            for directory in ("home/SystemSketch", "boards/SystemSketch", "snapshot", "checkout"):
                (base / directory).mkdir(parents=True)
            environment = {"SYSTEMSKETCH_FILES_ROOT": str(base / "boards"), "SYSTEMSKETCH_LOCK_ROOT": ""}
            folders = []
            for index, cwd in enumerate((base / "snapshot", base / "checkout")):
                process, origin = self.serve(base, "--files-root-from-env", environment=environment, cwd=cwd)
                try:
                    self.assertEqual(self.save(origin, base / "boards" / "SystemSketch" / f"B{index}.tldr"), 200)
                finally:
                    self.stop(process)
                folders.append({lock.parent for lock in base.rglob("*.lock")})
            wanted = systemsketch_files.default_lock_root(base / "home")
            self.assertEqual(folders, [{wanted}, {wanted}])
            self.assertFalse(any((base / "snapshot").iterdir()) or any((base / "checkout").iterdir()))

    def test_a_relative_override_stops_the_host_naming_it(self) -> None:
        for environment, named in (
            ({"SYSTEMSKETCH_FILES_ROOT": "boards"}, 'SYSTEMSKETCH_FILES_ROOT="boards"'),
            ({"SYSTEMSKETCH_FILES_ROOT": "/tmp/boards", "SYSTEMSKETCH_LOCK_ROOT": "locks"}, 'SYSTEMSKETCH_LOCK_ROOT="locks"'),
        ):
            completed = subprocess.run(
                [sys.executable, str(SCRIPTS / "systemsketch_files.py"), "serve", "--files-root", "/tmp",
                 "--port", "0", "--files-root-from-env"],
                capture_output=True, text=True, timeout=30, env={**os.environ, **environment},
            )
            self.assertEqual(completed.returncode, 2, environment)
            self.assertIn(named, completed.stderr)
            self.assertNotIn(LISTENING_BANNER, completed.stdout)

    def test_without_the_flag_the_override_is_ignored(self) -> None:
        # Plain CLI use is unchanged: only the root it was given, never an environment's.
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary).resolve()
            (base / "home" / "SystemSketch").mkdir(parents=True)
            process, origin = self.serve(base, environment={"SYSTEMSKETCH_FILES_ROOT": str(base / "boards")})
            try:
                self.assertEqual(self.health(origin)["filesRoot"], str(base / "home"))
            finally:
                self.stop(process)


if __name__ == "__main__":
    unittest.main()
