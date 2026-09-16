"""Immutable local Stable builds and the channel pointer for bbox-ui.

Three separate things, kept separate (Zach, 2026-09-12):

- **Stable** — a pinned local build, unaffected by anything anyone pushes or
  edits until someone explicitly promotes again. This module.
- **Preview** — a real local `next dev` server with HMR, rooted at this
  checkout (`PROJECT_ROOT`), reflecting whatever is on disk right now —
  committed or not. Managed by launch_bboxui.py; nothing to build or pin.
- **Remote** — the actual deployed https://bbox-ui.com, which redeploys
  itself on every push to `main` (Cloudflare Workers Builds). No local state
  at all; launch_bboxui.py just opens it.

"Promote" turns whatever Preview is showing right now into the new Stable —
so this module builds from a **snapshot of the live working tree**
(`PROJECT_ROOT` as it currently sits, uncommitted edits included), not from
a resolved git ref. A build's identity is a content hash of what actually got
built, the same way SystemSketch content-addresses a release
(`release_build_id` in its release_lib.py) — two promotes of the same tree
produce the same build and are deduplicated; git commit/branch/dirty state is
recorded for provenance display, but does not decide identity, because the
tree can be dirty.

Earlier version of this module built Stable by `wget --mirror`-ing the
rendered site. A peer session caught that it produced a dead HTML shell:
`window.React` was `undefined` and no element in the DOM carried a
`__reactFiber*` key — wget's `--convert-links` rewrites URLs in tag
attributes but not inside the inline bootstrap `<script>` Next/Turbopack
depends on for hydration, so every click was silently a no-op. This version
runs the real build (`pnpm docs:build`, the same command Cloudflare runs)
instead, so that class of corruption cannot happen.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path


PRODUCT = "bbox-ui"
CHANNELS_SCHEMA_VERSION = 1
MANIFEST_SCHEMA_VERSION = 3
DEPLOYED_URL = "https://bbox-ui.com/"
# WHY here and not launch_bboxui.py: bboxui_server.py needs this too (to set
# the CORS allow-origin for Preview's badge fetches) and importing it from
# launch_bboxui.py would pull the Chrome-launching CLI module into the server
# and risk a circular import back the other way.
PREVIEW_PORT = int(os.environ.get("BBOXUI_PREVIEW_PORT", "5196"))
# What the build snapshot excludes: build/dependency output that must be
# regenerated fresh in the staging copy, never carried over from the live
# checkout (it could be stale, or from a different pnpm store layout).
SNAPSHOT_EXCLUDES = (
    "node_modules",
    ".next",
    "out",
    "dist",
    ".git",
    ".wrangler",
    ".vite",
    ".claude",
    ".turbo",
)


SCRIPTS_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPTS_DIR.parent


class ReleaseError(RuntimeError):
    """A release, build, or channel transition is unavailable or invalid."""


@dataclass(frozen=True)
class ReleaseChannels:
    stable: str | None = None
    previous: str | None = None


@dataclass(frozen=True)
class SourceProvenance:
    """Which tree state a build came from — display-only, not identity.

    Every field is `None`/empty when `project_root` is not a readable git
    checkout: an honest "unknown" beats a fabricated clean, matching
    SystemSketch's release_lib.py of the same name.
    """

    commit: str | None = None
    branch: str | None = None
    dirty: bool | None = None
    dirty_paths: tuple[str, ...] = ()


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def default_release_home() -> Path:
    configured = os.environ.get("BBOXUI_RELEASE_HOME")
    if configured:
        return Path(configured).expanduser().resolve()
    cache_home = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache"))
    return (cache_home / "bbox-ui" / "runtime").resolve()


def default_state_home() -> Path:
    configured = os.environ.get("BBOXUI_STATE_HOME")
    if configured:
        return Path(configured).expanduser().resolve()
    cache_home = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache"))
    return (cache_home / "bbox-ui" / "state").resolve()


def releases_dir(release_home: Path) -> Path:
    return release_home / "releases"


def release_root(release_home: Path, build: str) -> Path:
    return releases_dir(release_home) / build


def release_site_dir(release_home: Path, build: str) -> Path:
    return release_root(release_home, build) / "site"


def channels_path(release_home: Path) -> Path:
    return release_home / "channels.json"


def _atomic_write(path: Path, content: bytes, mode: int = 0o644) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        temporary.chmod(mode)
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def _atomic_json(path: Path, payload: dict) -> None:
    content = (json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode()
    _atomic_write(path, content)


def read_channels(release_home: Path) -> ReleaseChannels:
    try:
        payload = json.loads(channels_path(release_home).read_text(encoding="utf-8"))
    except FileNotFoundError:
        return ReleaseChannels()
    except (OSError, ValueError) as cause:
        raise ReleaseError(f"could not read release channels: {cause}") from cause
    if (
        not isinstance(payload, dict)
        or payload.get("product") != PRODUCT
        or payload.get("schemaVersion") != CHANNELS_SCHEMA_VERSION
    ):
        raise ReleaseError("release channels belong to an unsupported product or schema")
    values: dict[str, str | None] = {}
    for name in ("stable", "previous"):
        value = payload.get(name)
        if value is not None and (not isinstance(value, str) or not value):
            raise ReleaseError(f"release channel {name!r} is invalid")
        values[name] = value
    return ReleaseChannels(**values)


def write_channels(release_home: Path, channels: ReleaseChannels) -> None:
    _atomic_json(
        channels_path(release_home),
        {"product": PRODUCT, "schemaVersion": CHANNELS_SCHEMA_VERSION, **asdict(channels)},
    )


def read_manifest(release_home: Path, build: str) -> dict:
    path = release_root(release_home, build) / "manifest.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as cause:
        raise ReleaseError(f"release {build} has no readable manifest: {cause}") from cause
    if (
        not isinstance(payload, dict)
        or payload.get("product") != PRODUCT
        or payload.get("schemaVersion") != MANIFEST_SCHEMA_VERSION
        or payload.get("build") != build
    ):
        raise ReleaseError(f"release {build} has an invalid manifest")
    return payload


def _git(project_root: Path, *arguments: str) -> str | None:
    """One git command's raw stdout, or None if git cannot answer — a missing
    git, a non-checkout, and a failing command are all "no provenance to
    record", so this never blocks a build."""
    try:
        completed = subprocess.run(
            ["git", "-C", str(project_root), *arguments],
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return completed.stdout if completed.returncode == 0 else None


def source_provenance(project_root: Path) -> SourceProvenance:
    commit = _git(project_root, "rev-parse", "HEAD")
    if commit is None:
        return SourceProvenance()
    commit = commit.strip()
    branch = (_git(project_root, "rev-parse", "--abbrev-ref", "HEAD") or "").strip() or None
    status = _git(project_root, "status", "--porcelain")
    if status is None:
        return SourceProvenance(commit=commit, branch=branch)
    paths = sorted({line[3:].strip().strip('"') for line in status.splitlines() if line[3:].strip()})
    return SourceProvenance(
        commit=commit,
        branch=branch if branch != "HEAD" else None,
        dirty=bool(paths),
        dirty_paths=tuple(paths[:12]),
    )


def _hash_file(digest: "hashlib._Hash", root: Path, path: Path) -> None:
    digest.update(path.relative_to(root).as_posix().encode())
    digest.update(b"\0")
    digest.update(path.read_bytes())
    digest.update(b"\0")


def _content_hash(out_dir: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(path for path in out_dir.rglob("*") if path.is_file()):
        _hash_file(digest, out_dir, path)
    return digest.hexdigest()[:16]


def _snapshot_tree(project_root: Path, destination: Path) -> None:
    """Copy the live working tree as-is (committed and uncommitted alike)
    into `destination`, so a build reflects exactly what Preview is showing.
    """
    excludes: list[str] = []
    for name in SNAPSHOT_EXCLUDES:
        excludes += ["--exclude", name]
    rsync = shutil.which("rsync")
    if rsync is None:
        raise ReleaseError("rsync is required to snapshot the working tree")
    result = subprocess.run(
        [rsync, "-a", *excludes, f"{project_root}/", f"{destination}/"],
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        raise ReleaseError(f"snapshotting {project_root} failed: {result.stderr.strip()}")


def build_from_source(project_root: Path, release_home: Path) -> tuple[str, dict]:
    """Snapshot `project_root` right now and build it (`pnpm docs:build`,
    the same command Cloudflare runs), storing the result immutably under a
    content hash of what actually got built.
    """
    project_root = project_root.resolve()
    release_home = release_home.resolve()
    provenance = source_provenance(project_root)

    releases_dir(release_home).mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".snapshot.", dir=releases_dir(release_home)))
    try:
        _snapshot_tree(project_root, staging)
        pnpm = shutil.which("pnpm")
        if pnpm is None:
            raise ReleaseError("pnpm is required to build bbox-ui.com")
        try:
            subprocess.run([pnpm, "install"], cwd=staging, check=True, timeout=600)
            subprocess.run([pnpm, "docs:build"], cwd=staging, check=True, timeout=600)
        except subprocess.CalledProcessError as cause:
            raise ReleaseError(f"build failed: {cause}") from cause
        except subprocess.TimeoutExpired as cause:
            raise ReleaseError(f"build timed out: {cause}") from cause

        out_dir = staging / "apps" / "docs" / "out"
        if not (out_dir / "index.html").is_file():
            raise ReleaseError("build produced no apps/docs/out/index.html")

        build = _content_hash(out_dir)
        destination = release_root(release_home, build)
        if destination.is_dir():
            return build, read_manifest(release_home, build)

        file_count = sum(1 for path in out_dir.rglob("*") if path.is_file())
        byte_count = sum(path.stat().st_size for path in out_dir.rglob("*") if path.is_file())
        build_staging = Path(tempfile.mkdtemp(prefix=f".{build}.", dir=releases_dir(release_home)))
        try:
            shutil.copytree(out_dir, build_staging / "site")
            manifest = {
                "product": PRODUCT,
                "schemaVersion": MANIFEST_SCHEMA_VERSION,
                "build": build,
                "commit": provenance.commit,
                "branch": provenance.branch,
                "dirty": provenance.dirty,
                "dirtyPaths": list(provenance.dirty_paths),
                "builtAt": utc_now(),
                "fileCount": file_count,
                "bytes": byte_count,
            }
            _atomic_json(build_staging / "manifest.json", manifest)
            os.replace(build_staging, destination)
        finally:
            if build_staging.exists():
                shutil.rmtree(build_staging)
        return build, read_manifest(release_home, build)
    finally:
        if staging.exists():
            shutil.rmtree(staging)


def promote(release_home: Path, project_root: Path) -> tuple[str, dict]:
    """Snapshot Preview's current tree right now and make it the new Stable."""
    build, manifest = build_from_source(project_root, release_home)
    channels = read_channels(release_home)
    previous = channels.previous if channels.stable == build else channels.stable
    write_channels(release_home, ReleaseChannels(stable=build, previous=previous))
    return build, manifest


def live_matches(manifest: dict, project_root: Path) -> bool:
    """Cheap "does the live tree already match the pinned Stable build" check
    for the badge, without re-running the actual build/content-hash.

    Compares commit/dirty/dirty-paths only. This is a heuristic, not a
    guarantee: two dirty trees with the same set of changed paths but
    different file *content* would false-positive as "matching". That's an
    accepted trade-off for a fast, synchronous badge check on every
    /api/health call — a stale-looking "matches" label after a real edit is a
    UI-staleness question, not a broken promote (the actual promote always
    re-snapshots and content-hashes for real).
    """
    live = source_provenance(project_root)
    return (
        live.commit == manifest.get("commit")
        and live.dirty == manifest.get("dirty")
        and sorted(live.dirty_paths) == sorted(manifest.get("dirtyPaths") or [])
    )


def rollback(release_home: Path) -> ReleaseChannels:
    channels = read_channels(release_home)
    if channels.previous is None:
        raise ReleaseError("no previous Stable release is available")
    read_manifest(release_home, channels.previous)
    rolled_back = ReleaseChannels(stable=channels.previous, previous=channels.stable)
    write_channels(release_home, rolled_back)
    return rolled_back


def process_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except (OSError, ProcessLookupError):
        return False
    return True


def read_pid(path: Path) -> int | None:
    try:
        pid = int(path.read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        return None
    return pid if process_alive(pid) else None


def write_pid(path: Path, pid: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"{pid}\n", encoding="utf-8")


def spawn_logged(command: list[str], *, cwd: Path, log: Path, env: dict[str, str] | None = None) -> int:
    log.parent.mkdir(parents=True, exist_ok=True)
    output = log.open("ab", buffering=0)
    process = subprocess.Popen(
        command,
        cwd=cwd,
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=output,
        stderr=subprocess.STDOUT,
        start_new_session=True,
        close_fds=True,
    )
    output.close()
    return process.pid


def port_responds(port: int, timeout: float = 1.0) -> bool:
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=timeout)
        return True
    except urllib.error.HTTPError:
        return True  # any HTTP response at all means something is listening
    except (OSError, urllib.error.URLError):
        return False


def ensure_preview_server(state_home: Path) -> str:
    pid_path = state_home / "preview" / "dev.pid"
    url = f"http://127.0.0.1:{PREVIEW_PORT}/"
    if port_responds(PREVIEW_PORT, timeout=0.4):
        return url  # already up, ours or not — nothing to do either way

    pnpm = shutil.which("pnpm")
    if pnpm is None:
        raise ReleaseError("pnpm is required to run the Preview dev server")
    # WHY the env var: preview-channel-badge.tsx no-ops in every real build
    # (Stable's static export, the deployed Cloudflare site) by checking this
    # at the top of the module — it's only ever set here, for the one process
    # that actually is the local dev server.
    # NEXT_PUBLIC_BBOXUI_STABLE_PORT rides along so the badge polls and promotes
    # against the Stable server that launch_bboxui.py actually started, not a
    # hardcoded 5194 — same default, same env var name it reads.
    env = {
        **os.environ,
        "NEXT_PUBLIC_BBOXUI_CHANNEL": "preview",
        "NEXT_PUBLIC_BBOXUI_STABLE_PORT": os.environ.get("BBOXUI_STABLE_PORT", "5194"),
    }
    pid = spawn_logged(
        [pnpm, "--filter", "@bbox-ui/docs", "exec", "next", "dev", "--port", str(PREVIEW_PORT)],
        cwd=PROJECT_ROOT,
        log=state_home / "preview" / "dev.log",
        env=env,
    )
    write_pid(pid_path, pid)
    deadline = time.monotonic() + 60.0
    while time.monotonic() < deadline:
        if port_responds(PREVIEW_PORT, timeout=1.0):
            return url
        time.sleep(0.5)
    raise ReleaseError(f"Preview dev server did not come up on {PREVIEW_PORT} (see {state_home / 'preview' / 'dev.log'})")


def stop_pid(path: Path) -> bool:
    import signal
    import time

    pid = read_pid(path)
    if pid is None:
        try:
            path.unlink()
        except FileNotFoundError:
            pass
        return False
    try:
        os.killpg(pid, signal.SIGTERM)
    except (OSError, ProcessLookupError):
        try:
            os.kill(pid, signal.SIGTERM)
        except (OSError, ProcessLookupError):
            pass
    deadline = time.monotonic() + 5.0
    while time.monotonic() < deadline and process_alive(pid):
        time.sleep(0.1)
    try:
        path.unlink()
    except FileNotFoundError:
        pass
    return True
