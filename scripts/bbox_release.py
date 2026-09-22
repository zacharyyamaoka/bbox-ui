"""Immutable local Stable builds and the channel pointer for bbox-ui products.

Three separate things, kept separate (Zach, 2026-09-12):

- **Stable** — a pinned local build, unaffected by anything anyone pushes or
  edits until someone explicitly promotes again. This module.
- **Preview** — a real local dev server with HMR, rooted at this checkout
  (`PROJECT_ROOT`), reflecting whatever is on disk right now — committed or
  not. Managed by the launcher; nothing to build or pin.
- **Remote** — the actual deployed site (bbox-ui.com only — Storybook has no
  public deploy), which redeploys itself on every push to `main` (Cloudflare
  Workers Builds). No local state at all; the launcher just opens it.

"Promote" turns whatever Preview is showing right now into the new Stable —
so this module builds from a **snapshot of the live working tree**
(`PROJECT_ROOT` as it currently sits, uncommitted edits included), not from
a resolved git ref. A build's identity is a content hash of what actually got
built, the same way SystemSketch content-addresses a release
(`release_build_id` in its release_lib.py) — two promotes of the same tree
produce the same build and are deduplicated; git commit/branch/dirty state is
recorded for provenance display, but does not decide identity, because the
tree can be dirty.

Earlier version of this module built bbox-ui.com's Stable by `wget --mirror`-
ing the rendered site. A peer session caught that it produced a dead HTML
shell: `window.React` was `undefined` and no element in the DOM carried a
`__reactFiber*` key — wget's `--convert-links` rewrites URLs in tag
attributes but not inside the inline bootstrap `<script>` Next/Turbopack
depends on for hydration, so every click was silently a no-op. This version
runs the real build command instead, so that class of corruption cannot
happen.

**Two products, one model (2026-09-22).** Everything above is true for the
Storybook workbench (`apps/storybook-basics`) as much as it is for the
website — same three channels, same content-hash identity, same reasons.
What differs between them (build command, output directory, ports, where
state lives, whether a Remote channel even exists) is exactly the shape of
`ProductConfig` below: a second product is a table entry (`STORYBOOK`), not
a fork of this file. `bboxui_server.py` and `launch_bbox_common.py` take the
same config and stay product-agnostic too.
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
from typing import Callable


CHANNELS_SCHEMA_VERSION = 1
MANIFEST_SCHEMA_VERSION = 3
# What the build snapshot excludes: build/dependency output that must be
# regenerated fresh in the staging copy, never carried over from the live
# checkout (it could be stale, or from a different pnpm store layout).
SNAPSHOT_EXCLUDES = (
    "node_modules",
    ".next",
    "out",
    "dist",
    "storybook-static",
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


@dataclass(frozen=True)
class ProductConfig:
    """The product-specific table entry: what bbox_release.py, bboxui_server.py
    and launch_bbox_common.py need to know to run one product's three
    channels. `project_root` is deliberately NOT a field — both products
    are built from the same monorepo checkout (`PROJECT_ROOT`), a pnpm
    workspace install has to see the whole tree either way.
    """

    slug: str  # cache/state directory namespace, and the launcher's own name
    product: str  # discriminator stamped in manifest.json / channels.json / /api/health
    display_name: str  # what the badge shows
    build_command: tuple[str, ...]  # argv after `pnpm`, run with cwd = the staged snapshot root
    output_dir: str  # relative to the staged snapshot root, e.g. "apps/docs/out"
    preview_command: Callable[[str, int], list[str]]  # (pnpm_path, port) -> argv
    preview_env: Callable[[int], dict[str, str]]  # (stable_port) -> extra env for the preview process
    preview_port: int
    stable_port: int
    release_home_env: str
    release_home_subdir: str  # "" reproduces bbox-ui.com's original, subdir-less path
    state_home_env: str
    state_home_subdir: str
    deployed_url: str | None  # None ⇒ no Remote channel (Storybook has no public deploy)
    app_id: str  # Chrome --class/--name prefix, kept apart so app windows don't collide
    inject_badge: bool  # server-side bboxui_badge.js injection into Stable's static HTML


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def _cache_dir(env_name: str, subdir: str, leaf: str) -> Path:
    configured = os.environ.get(env_name)
    if configured:
        return Path(configured).expanduser().resolve()
    cache_home = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache"))
    root = cache_home / "bbox-ui"
    if subdir:
        root = root / subdir
    return (root / leaf).resolve()


def default_release_home(config: ProductConfig) -> Path:
    return _cache_dir(config.release_home_env, config.release_home_subdir, "runtime")


def default_state_home(config: ProductConfig) -> Path:
    return _cache_dir(config.state_home_env, config.state_home_subdir, "state")


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


def read_channels(release_home: Path, config: ProductConfig) -> ReleaseChannels:
    try:
        payload = json.loads(channels_path(release_home).read_text(encoding="utf-8"))
    except FileNotFoundError:
        return ReleaseChannels()
    except (OSError, ValueError) as cause:
        raise ReleaseError(f"could not read release channels: {cause}") from cause
    if (
        not isinstance(payload, dict)
        or payload.get("product") != config.product
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


def write_channels(release_home: Path, channels: ReleaseChannels, config: ProductConfig) -> None:
    _atomic_json(
        channels_path(release_home),
        {"product": config.product, "schemaVersion": CHANNELS_SCHEMA_VERSION, **asdict(channels)},
    )


def read_manifest(release_home: Path, build: str, config: ProductConfig) -> dict:
    path = release_root(release_home, build) / "manifest.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as cause:
        raise ReleaseError(f"release {build} has no readable manifest: {cause}") from cause
    if (
        not isinstance(payload, dict)
        or payload.get("product") != config.product
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


def commits_ahead_of_stable(manifest: dict, project_root: Path) -> int | None:
    """How many commits HEAD has beyond the pinned Stable build's commit —
    the "N commits behind your checkout" the badge shows, so Zach doesn't
    have to guess (the problem he actually reported: "right now I am not
    sure I am on the latest"). `git rev-list --count <commit>..HEAD` counts
    commits reachable from HEAD but not from the pinned commit; on a
    rebased/force-pushed branch that can overcount (the pinned commit's
    history diverged rather than being a strict ancestor), but that is still
    an honest "not what Stable was built from," not a wrong answer dressed
    up as precise. None (not 0) whenever it can't be computed at all — no
    recorded commit, or git can't answer — so the badge can tell "unknown"
    apart from "caught up" instead of fabricating the reassuring case.
    """
    commit = manifest.get("commit")
    if not commit:
        return None
    output = _git(project_root, "rev-list", "--count", f"{commit}..HEAD")
    if output is None:
        return None
    try:
        return int(output.strip())
    except ValueError:
        return None


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


def build_from_source(project_root: Path, release_home: Path, config: ProductConfig) -> tuple[str, dict]:
    """Snapshot `project_root` right now and build it (the same command the
    real deploy — or, for Storybook, `pnpm run build-storybook` — runs),
    storing the result immutably under a content hash of what actually got
    built.
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
            raise ReleaseError(f"pnpm is required to build {config.display_name}")
        try:
            subprocess.run([pnpm, "install"], cwd=staging, check=True, timeout=600)
            subprocess.run([pnpm, *config.build_command], cwd=staging, check=True, timeout=600)
        except subprocess.CalledProcessError as cause:
            raise ReleaseError(f"build failed: {cause}") from cause
        except subprocess.TimeoutExpired as cause:
            raise ReleaseError(f"build timed out: {cause}") from cause

        out_dir = staging / config.output_dir
        if not (out_dir / "index.html").is_file():
            raise ReleaseError(f"build produced no {config.output_dir}/index.html")

        build = _content_hash(out_dir)
        destination = release_root(release_home, build)
        if destination.is_dir():
            return build, read_manifest(release_home, build, config)

        file_count = sum(1 for path in out_dir.rglob("*") if path.is_file())
        byte_count = sum(path.stat().st_size for path in out_dir.rglob("*") if path.is_file())
        build_staging = Path(tempfile.mkdtemp(prefix=f".{build}.", dir=releases_dir(release_home)))
        try:
            shutil.copytree(out_dir, build_staging / "site")
            manifest = {
                "product": config.product,
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
        return build, read_manifest(release_home, build, config)
    finally:
        if staging.exists():
            shutil.rmtree(staging)


def promote(release_home: Path, project_root: Path, config: ProductConfig) -> tuple[str, dict]:
    """Snapshot Preview's current tree right now and make it the new Stable."""
    build, manifest = build_from_source(project_root, release_home, config)
    channels = read_channels(release_home, config)
    previous = channels.previous if channels.stable == build else channels.stable
    write_channels(release_home, ReleaseChannels(stable=build, previous=previous), config)
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


def rollback(release_home: Path, config: ProductConfig) -> ReleaseChannels:
    channels = read_channels(release_home, config)
    if channels.previous is None:
        raise ReleaseError("no previous Stable release is available")
    read_manifest(release_home, channels.previous, config)
    rolled_back = ReleaseChannels(stable=channels.previous, previous=channels.stable)
    write_channels(release_home, rolled_back, config)
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


def ensure_preview_server(state_home: Path, config: ProductConfig) -> str:
    pid_path = state_home / "preview" / "dev.pid"
    port = config.preview_port
    url = f"http://127.0.0.1:{port}/"
    if port_responds(port, timeout=0.4):
        return url  # already up, ours or not — nothing to do either way

    pnpm = shutil.which("pnpm")
    if pnpm is None:
        raise ReleaseError("pnpm is required to run the Preview dev server")
    env = {**os.environ, **config.preview_env(config.stable_port)}
    pid = spawn_logged(
        config.preview_command(pnpm, port),
        cwd=PROJECT_ROOT,
        log=state_home / "preview" / "dev.log",
        env=env,
    )
    write_pid(pid_path, pid)
    deadline = time.monotonic() + 60.0
    while time.monotonic() < deadline:
        if port_responds(port, timeout=1.0):
            return url
        time.sleep(0.5)
    raise ReleaseError(f"Preview dev server did not come up on {port} (see {state_home / 'preview' / 'dev.log'})")


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


# ------------------------------------------------------------- product table

def _docs_preview_command(pnpm: str, port: int) -> list[str]:
    return [pnpm, "--filter", "@bbox-ui/docs", "exec", "next", "dev", "--port", str(port)]


def _docs_preview_env(stable_port: int) -> dict[str, str]:
    # WHY these two vars and not more: preview-channel-badge.tsx no-ops in
    # every real build (Stable's static export, the deployed Cloudflare
    # site) by checking NEXT_PUBLIC_BBOXUI_CHANNEL at the top of the module —
    # it's only ever set here, for the one process that actually is the
    # local dev server. NEXT_PUBLIC_BBOXUI_STABLE_PORT rides along so the
    # badge polls and promotes against the Stable server this launcher
    # actually started, not a hardcoded default.
    return {
        "NEXT_PUBLIC_BBOXUI_CHANNEL": "preview",
        "NEXT_PUBLIC_BBOXUI_STABLE_PORT": str(stable_port),
    }


def _storybook_preview_command(pnpm: str, port: int) -> list[str]:
    return [pnpm, "--filter", "bbox-storybook-basics", "exec", "storybook", "dev", "-p", str(port), "--ci"]


def _storybook_preview_env(stable_port: int) -> dict[str, str]:
    # WHY no channel env var, unlike docs: Storybook's manager UI is
    # Storybook's own packaged shell, not our app source — there is no
    # React tree of ours to env-gate a component into. The channel badge
    # (apps/storybook-basics/.storybook/manager-head.html) instead tells
    # Preview from Stable purely from `window.location.port`, which needs
    # nothing threaded through the process environment.
    return {}


DOCS = ProductConfig(
    slug="docs",
    product="bbox-ui",
    display_name="bbox-ui.com",
    build_command=("docs:build",),
    output_dir="apps/docs/out",
    preview_command=_docs_preview_command,
    preview_env=_docs_preview_env,
    # WHY read once at import time, same as before this module supported a
    # second product: env doesn't change mid-process, and every caller in
    # this process should agree on the same port.
    preview_port=int(os.environ.get("BBOXUI_PREVIEW_PORT", "5196")),
    stable_port=int(os.environ.get("BBOXUI_STABLE_PORT", "5194")),
    release_home_env="BBOXUI_RELEASE_HOME",
    release_home_subdir="",
    state_home_env="BBOXUI_STATE_HOME",
    state_home_subdir="",
    deployed_url="https://bbox-ui.com/",
    app_id="bbox-ui",
    inject_badge=True,
)

# WHY these ports and not the next free-looking numbers: Zach's own review
# Storybook is :5421 (apps/storybook-basics/package.json), demos/inspector
# and demos/port-inspector already claim :5420-5422, and docs already owns
# :5194/:5196. 5430/5431 sit clear of every one of those, confirmed against
# `ss -ltnp` and a repo-wide grep before picking them.
STORYBOOK = ProductConfig(
    slug="storybook",
    product="bbox-ui-storybook",
    display_name="bbox-ui Storybook",
    build_command=("--filter", "bbox-storybook-basics", "run", "build-storybook"),
    output_dir="apps/storybook-basics/storybook-static",
    preview_command=_storybook_preview_command,
    preview_env=_storybook_preview_env,
    preview_port=int(os.environ.get("BBOXUI_SB_PREVIEW_PORT", "5431")),
    stable_port=int(os.environ.get("BBOXUI_SB_STABLE_PORT", "5430")),
    release_home_env="BBOXUI_SB_RELEASE_HOME",
    release_home_subdir="storybook",
    state_home_env="BBOXUI_SB_STATE_HOME",
    state_home_subdir="storybook",
    deployed_url=None,  # Storybook has no public deploy — no Remote channel
    app_id="bbox-ui-storybook",
    # WHY False, unlike docs: manager-head.html already renders a badge on
    # BOTH channels (it's baked into `storybook build`'s output same as
    # `storybook dev`'s manager shell) by reading window.location.port —
    # server-side injection here would draw a second, redundant badge on
    # top of it.
    inject_badge=False,
)

PRODUCTS: dict[str, ProductConfig] = {DOCS.slug: DOCS, STORYBOOK.slug: STORYBOOK}
