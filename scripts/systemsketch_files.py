#!/usr/bin/env python3
"""The new SystemSketch's local file host: safe, digest-fenced .tldr files on disk.

CONTRACT committed by the planning lane (docs/CHROME-FILES-SETTINGS-PLAN.md).
Constants and exception classes are final; every function and method below
raises NotImplementedError until lane ``file-host`` ports its body. The
acceptance is ``scripts/tests/test_systemsketch_files.py`` (the archive's own
store suite, ported) and ``scripts/tests/test_systemsketch_files_http.py``
(the routes) — both off-limits to the builder.

Donor, read on disk and ported VERBATIM (stdlib only, no new dependency):
``/home/bam/systemsketch/scripts/workspace_store.py:1-797`` (the store) and the
``/api/workspace/*`` branches of ``/home/bam/systemsketch/scripts/server.py``
(GET :530-581, POST :594-760, ``_post_failure_status`` :91-100,
``reveal_document`` :855-875). Zach, 2026-09-19: "we need to be able to save
real files to the system so I can start working on this: Please copy over the
code from system sketch for the file navigator here. its working good enough
for now".

What changes from the donor, and why:
  * The routes live in ``WorkspaceApi`` — a mixin-free object any
    ``BaseHTTPRequestHandler`` can delegate to — so the SAME code serves the
    dock's Stable server (``scripts/launch_systemsketch.py`` mounts it on
    :4341, same origin as the app) and this file's own standalone server (the
    vite dev proxy and the smoke tests).
  * ``Desktop`` is injected. The donor shelled out to ``gio trash`` and
    ``xdg-open`` directly; a test run must never move a real file to the
    desktop Trash or open a file manager on Zach's screen, so tests pass
    ``RecordingDesktop`` and the real one is ``GioDesktop``.
  * ``--files-root`` has NO default. A host started without naming its root
    must fail, never fall back to ``~`` — the archive's hardest rule is
    "Never point a test at Zach's real board".
  * No ``/api/settings/file-access`` ("allow opening files anywhere"): the
    fence is the files root. ``allow_any_path``/``additional_roots`` stay on
    the store functions only because the ported suite exercises them.
  * CORS only with ``--cors-loopback``, and then only for an http origin on
    127.0.0.1/localhost/[::1]. Production is same-origin and sends none.

The file host never spawns a desktop file-chooser process: the "native"
navigation mode uses the BROWSER's File System Access pickers, with no
process of ours in the request path. ``test_the_host_never_shells_out_to_a_
desktop_file_chooser`` scans this folder for the chooser names, so do not
even write them in a comment here.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from typing import Any, Protocol


SYSTEMSKETCH_SUFFIX = ".systemsketch"
TLDRAW_SUFFIX = ".tldr"
DOCUMENT_SUFFIXES = (SYSTEMSKETCH_SUFFIX, TLDRAW_SUFFIX)
DOCUMENT_KINDS = {SYSTEMSKETCH_SUFFIX: "systemsketch", TLDRAW_SUFFIX: "tldraw"}
SYSTEMSKETCH_ENVELOPE_KEY = "systemSketch"
SYSTEMSKETCH_FORMAT_VERSION = 2
DEFAULT_WORKSPACE_DIRNAME = "SystemSketch"
DEFAULT_DOCUMENT_STEM = "Untitled"
DEFAULT_DOCUMENT_NAME = f"{DEFAULT_DOCUMENT_STEM}{SYSTEMSKETCH_SUFFIX}"
MAX_DOCUMENT_BYTES = 64 * 1024 * 1024
MAX_API_REQUEST_BYTES = 64 * 1024 * 1024
SAVE_VERIFY_ATTEMPTS = 3

#: The one line the standalone server prints on stdout once it is accepting
#: connections, followed by its origin: ``SYSTEMSKETCH_FILES_LISTENING
#: http://127.0.0.1:43127``. The vite dev plugin and the smoke tests' global
#: setup wait for exactly this line.
LISTENING_BANNER = "SYSTEMSKETCH_FILES_LISTENING"

PRODUCT = "systemsketch-files"


class WorkspacePathError(ValueError):
    """A requested path escaped the workspace root or was not usable."""


class WorkspaceFormatError(ValueError):
    """The supplied text was not a portable tldraw document."""


class WorkspaceStorageError(RuntimeError):
    """A valid workspace operation could not complete because storage failed."""


class WorkspaceConflictError(RuntimeError):
    """The disk document no longer matches the revision the client loaded."""

    def __init__(self, message: str, disk_mtime: float | None, disk_digest: str | None):
        super().__init__(message)
        self.disk_mtime = disk_mtime
        self.disk_digest = disk_digest


def _todo(name: str) -> NotImplementedError:
    return NotImplementedError(f"{name}: not implemented (lane file-host)")


# ------------------------------------------------------------------ the store
# Every signature below is the donor's (workspace_store.py), verbatim.

def document_suffix(name: object) -> str | None:
    raise _todo("document_suffix")


def document_kind(path: Path) -> str:
    raise _todo("document_kind")


def default_workspace_dir(files_root: Path) -> Path:
    raise _todo("default_workspace_dir")


def default_document_path(files_root: Path) -> Path:
    raise _todo("default_document_path")


def resolve_directory(raw_path: object, files_root: Path, *, allow_any_path: bool = False) -> Path:
    raise _todo("resolve_directory")


def resolve_document_path(
    raw_path: object,
    files_root: Path,
    *,
    additional_roots: tuple[Path, ...] = (),
    allow_any_path: bool = False,
) -> Path:
    raise _todo("resolve_document_path")


def document_title(path: Path) -> str:
    raise _todo("document_title")


def document_digest(text: str) -> str:
    raise _todo("document_digest")


@contextmanager
def document_locks(lock_root: Path, *paths: Path) -> Iterator[None]:
    raise _todo("document_locks")
    yield  # pragma: no cover — keeps this a generator for @contextmanager


def create_directory(
    raw_parent: object,
    raw_name: object,
    files_root: Path,
    *,
    allow_any_path: bool = False,
) -> dict[str, str]:
    raise _todo("create_directory")


def normalize_document_source(source: object, *, suffix: str | None = None) -> str:
    raise _todo("normalize_document_source")


def list_documents(raw_dir: object, files_root: Path, *, allow_any_path: bool = False) -> dict[str, Any]:
    raise _todo("list_documents")


def load_document(
    raw_path: object,
    files_root: Path,
    *,
    additional_roots: tuple[Path, ...] = (),
    allow_any_path: bool = False,
) -> dict[str, Any]:
    raise _todo("load_document")


def stat_document(
    raw_path: object,
    files_root: Path,
    *,
    additional_roots: tuple[Path, ...] = (),
    allow_any_path: bool = False,
) -> dict[str, Any]:
    raise _todo("stat_document")


def save_document(
    raw_path: object,
    source: object,
    files_root: Path,
    *,
    additional_roots: tuple[Path, ...] = (),
    base_digest: str | None = None,
    force: bool = False,
    lock_root: Path,
    allow_any_path: bool = False,
) -> dict[str, Any]:
    raise _todo("save_document")


def rename_document(
    raw_path: object,
    raw_destination: object,
    files_root: Path,
    *,
    additional_roots: tuple[Path, ...] = (),
    base_digest: str,
    lock_root: Path,
    allow_any_path: bool = False,
) -> dict[str, Any]:
    raise _todo("rename_document")


def trash_document(
    raw_path: object,
    files_root: Path,
    *,
    additional_roots: tuple[Path, ...] = (),
    base_digest: str,
    lock_root: Path,
    allow_any_path: bool = False,
    desktop: "Desktop | None" = None,
) -> dict[str, object]:
    """Donor :765-797. ``desktop`` None → ``GioDesktop()`` (the donor's
    ``gio trash``, byte for byte: ``shutil.which("gio")`` then
    ``subprocess.run([gio, "trash", str(path)], check=False,
    capture_output=True, text=True, timeout=30)``)."""
    raise _todo("trash_document")


# ------------------------------------------------------------------ desktop

class Desktop(Protocol):
    """The two operations that leave the process: Trash and a file manager."""

    def trash(self, path: Path) -> None: ...

    def reveal(self, directory: Path) -> None: ...


class GioDesktop:
    """The real desktop: ``gio trash`` (donor workspace_store.py:781-790) and
    ``xdg-open``/``gio open`` detached (donor server.py:864-874)."""

    def trash(self, path: Path) -> None:
        raise _todo("GioDesktop.trash")

    def reveal(self, directory: Path) -> None:
        raise _todo("GioDesktop.reveal")


class RecordingDesktop:
    """For tests: appends one JSON line per call to ``log`` —
    ``{"action": "trash"|"reveal", "path": "<abs>"}`` — and for ``trash``
    MOVES the file into ``trash_dir`` (so the document really leaves the
    folder, as it would for a person, without touching the desktop Trash)."""

    def __init__(self, log: Path, trash_dir: Path):
        self.log = log
        self.trash_dir = trash_dir

    def trash(self, path: Path) -> None:
        raise _todo("RecordingDesktop.trash")

    def reveal(self, directory: Path) -> None:
        raise _todo("RecordingDesktop.reveal")


def reveal_document(raw_path: object, files_root: Path, desktop: Desktop) -> dict[str, object]:
    """Donor server.py:855-875: resolve (fenced, suffix-checked), reveal the
    PARENT folder, answer ``{"path": <abs>, "revealed": True}``."""
    raise _todo("reveal_document")


def default_lock_root(home: Path) -> Path:
    """Where document locks live when ``--lock-root`` is not given.

    The ARCHIVED app's own lock directory
    (``<home>/.local/share/systemsketch/runtime/locks/workspace``, its
    ``release_home / "locks" / "workspace"``) when that directory exists, else
    ``<home>/.local/state/systemsketch-next/locks/workspace``.

    WHY share the old app's directory: both apps edit files in the same
    ``~/SystemSketch``, and ``document_locks`` names a lock by the SHA-256 of
    the canonical path — so with one directory, a save from either app
    excludes a save from the other for the same file, instead of each
    locking only against itself. The digest fence still refuses a clobber
    either way; the shared lock closes the compare-and-replace window too.
    """
    raise _todo("default_lock_root")


# ------------------------------------------------------------------ the routes

class WorkspaceApi:
    """The ``/api/workspace/*`` routes over one files root, mountable in any handler.

    GET  /api/workspace/list[?dir=]   → list_documents (400 {error} on a path error)
    GET  /api/workspace/file?path=    → load_document; a missing file → 200
                                        {"path": p, "source": null}; 400 on path/format error
    GET  /api/workspace/stat?path=    → stat_document; missing → 200 {"path": p, "mtime": null}
    POST /api/workspace/file          {path, source, baseDigest, force} → save_document
    POST /api/workspace/directory     {parent, name} → create_directory
    POST /api/workspace/rename        {path, destination, baseDigest} → rename_document
    POST /api/workspace/trash         {path, baseDigest} → trash_document
    POST /api/workspace/reveal        {path} → reveal_document

    Error mapping, verbatim from the donor's do_POST: WorkspaceConflictError →
    409 ``{"error", "conflict": true, "mtime", "digest"}``; FileNotFoundError →
    404 ``{"error": "the document no longer exists"}``; storage/OS faults →
    503, every other validation fault (ValueError, path, format) → 409
    (``_post_failure_status``); a body over MAX_API_REQUEST_BYTES → refused
    before it is read; rename/trash without a non-empty string baseDigest →
    the donor's "baseDigest must be a non-empty string". JSON responses carry
    ``Cache-Control: no-store`` and ``Content-Type: application/json;
    charset=utf-8``.
    """

    def __init__(self, files_root: Path, lock_root: Path, desktop: Desktop, *, cors_loopback: bool = False):
        self.files_root = files_root
        self.lock_root = lock_root
        self.desktop = desktop
        self.cors_loopback = cors_loopback

    def handle_get(self, handler: BaseHTTPRequestHandler) -> bool:
        """Answer ``handler``'s GET if its path is one of ours; False otherwise."""
        raise _todo("WorkspaceApi.handle_get")

    def handle_post(self, handler: BaseHTTPRequestHandler) -> bool:
        """Answer ``handler``'s POST if its path is one of ours; False otherwise."""
        raise _todo("WorkspaceApi.handle_post")

    def handle_options(self, handler: BaseHTTPRequestHandler) -> bool:
        """CORS preflight for our paths when ``cors_loopback`` is on (204 with
        Allow-Origin echoing a loopback Origin, Allow-Methods ``GET, POST,
        OPTIONS``, Allow-Headers ``Content-Type``); False otherwise."""
        raise _todo("WorkspaceApi.handle_options")


def make_server(
    files_root: Path,
    lock_root: Path,
    desktop: Desktop,
    *,
    host: str = "127.0.0.1",
    port: int = 0,
    cors_loopback: bool = False,
):
    """A ``ThreadingHTTPServer`` bound but not yet serving, whose handler
    delegates to ``WorkspaceApi`` and answers ``GET /api/health`` with
    ``{"product": PRODUCT, "filesRoot": <abs>, "workspace": <abs default dir>}``;
    every other path → 404 JSON. Port 0 = ephemeral (read it back from
    ``server.server_address``)."""
    raise _todo("make_server")


def main(argv: list[str] | None = None) -> int:
    """``systemsketch_files.py serve --files-root DIR [--lock-root DIR] [--host H]
    [--port N] [--cors-loopback] [--desktop gio|record:LOGFILE]``.

    ``--files-root`` is REQUIRED. ``--lock-root`` defaults to
    ``default_lock_root(Path.home())``. ``record:LOGFILE`` →
    ``RecordingDesktop(LOGFILE, LOGFILE.parent / "trash")``. Once listening,
    prints ``f"{LISTENING_BANNER} http://{host}:{port}"`` on stdout, flushes,
    and serves until SIGTERM/SIGINT (exit 0)."""
    raise _todo("main")


if __name__ == "__main__":
    raise SystemExit(main())
