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
    # The same-origin path this product's PREVIEW server answers its identity
    # on, or None when it has none. `ensure_preview_server` refuses to hand
    # over an occupied Preview port whose identity it cannot verify against
    # this checkout — see `preview_identity_error`. Defaulted so a product
    # table entry (and the test fixture) can leave it out.
    preview_health_path: str | None = None


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


def _git_exit(project_root: Path, *arguments: str) -> int | None:
    """One git command's EXIT STATUS, or None if git could not run at all.

    WHY this exists beside `_git`: the predicate commands this module needs —
    `merge-base --is-ancestor` above all — answer with their exit code (0 yes,
    1 no) and print nothing at all. `_git` collapses "git said no" into the
    same `None` as "git broke", and for an ancestry question that is exactly
    the conflation that let the badge lie: a *failed* check was
    indistinguishable from an *absent* one, so the caller counted commits
    anyway.
    """
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
    return completed.returncode


def _is_ancestor(project_root: Path, ancestor: str, descendant: str) -> bool | None:
    """Is `ancestor` reachable from `descendant`? None when git cannot say."""
    exit_code = _git_exit(project_root, "merge-base", "--is-ancestor", ancestor, descendant)
    if exit_code == 0:
        return True
    if exit_code == 1:
        return False
    return None


def _rev_count(project_root: Path, range_expression: str) -> int | None:
    output = _git(project_root, "rev-list", "--count", range_expression)
    if output is None:
        return None
    try:
        return int(output.strip())
    except ValueError:
        return None


def checkout_id(project_root: Path) -> str:
    """An opaque, stable id for WHICH checkout this is — sha256 of the
    resolved absolute path, first 12 hex characters.

    WHY opaque rather than the absolute path it replaces in every /api/health
    payload: two surfaces only ever need to know whether they are the SAME
    tree, and an equality-comparable digest answers that exactly as well —
    while a page that reaches a loopback dev server learns
    `/home/<user>/<private project>/…` from a path and nothing whatsoever
    from a digest.

    `apps/systemsketch/statusEndpoint.ts` and
    `apps/storybook-basics/.storybook/statusEndpoint.ts` recompute the SAME
    value in TypeScript, and both `realpath` first exactly as `Path.resolve`
    does here — a symlinked spelling of one tree must not read as two
    different checkouts. One shared literal is pinned on both sides (see
    `scripts/tests/test_bbox_release.py` and `statusEndpointCors.test.ts`)
    because a silent drift between the two implementations would turn every
    cross-surface "same checkout?" answer into a permanent "no".
    """
    return hashlib.sha256(str(Path(project_root).resolve()).encode("utf-8")).hexdigest()[:12]


def _excluded_from_snapshot(path: str) -> bool:
    """Mirrors `_snapshot_tree`'s rsync `--exclude <name>` semantics, which
    match a component at ANY depth — so `packages/x/node_modules/y` is out
    just as `node_modules/y` is. The fingerprint below has to describe
    exactly what a build would contain, or it reports a difference the build
    could never have."""
    return any(component in SNAPSHOT_EXCLUDES for component in path.split("/"))


def source_fingerprint(project_root: Path) -> str | None:
    """A content hash of the source a build WOULD be made from, right now —
    committed and uncommitted alike, invariant to whether it is committed.

    WHY this replaces the old `commit + dirty + dirty-path-NAMES` equality
    check (the judge's finding, 2026-09-22): that comparison could not see
    file *bytes*, so editing an already-dirty file again left every input
    identical and the badge kept saying "up to date" — the single worst thing
    this badge can do, because it is the exact question Zach built it to
    answer ("I am not sure I am on the latest"). It also failed the other
    way: committing an unchanged tree moved `commit` and made byte-identical
    source read as "1 commit behind".

    The construction fixes both by being addressed on CONTENT, never on
    history: take every blob git already has at HEAD (`ls-tree -r`), then
    overlay the working tree for the handful of paths `status` reports as
    changed (re-hashing each with `hash-object`, dropping the ones that are
    gone). Commit a dirty tree and the base moves while the overlay empties —
    to the same map, so the same fingerprint. Edit that same dirty file once
    more and its blob id moves, so the fingerprint does too.

    Measured cost on this repo (1,739 tracked files, 2026-09-22): `ls-tree
    -r HEAD` and `status --porcelain` both under 10 ms, which is what makes
    this affordable on a badge that polls /api/health every 5 seconds.

    None — never a fabricated value — whenever git cannot answer, or a path
    contains a newline (`hash-object --stdin-paths` cannot express one).
    `stable_relation` degrades to an honest "unknown" on None.
    """
    listing = _git(project_root, "ls-tree", "-r", "-z", "HEAD")
    if listing is None:
        return None
    blobs: dict[str, str] = {}
    for record in listing.split("\0"):
        if not record:
            continue
        metadata, _, path = record.partition("\t")
        fields = metadata.split()
        if not path or len(fields) < 3:
            return None
        if _excluded_from_snapshot(path):
            continue
        blobs[path] = fields[2]

    # WHY `-uall` and not bare `status`: by default git COLLAPSES an untracked
    # directory into a single `?? apps/` entry, and a collapsed directory name
    # is not a file — the loop below would find nothing on disk at that path
    # and simply drop it, so an entire new source folder was invisible to the
    # fingerprint. Measured while writing this (a clean repo plus a new
    # `apps/newthing/index.ts` fingerprinted IDENTICALLY), which is the same
    # false-green class as everything else this pass removes: the badge would
    # have said "up to date" for a tree that had gained a whole directory.
    # `-uall` lists each untracked file; ignored files stay excluded.
    status = _git(project_root, "status", "--porcelain=v1", "-z", "-uall")
    if status is None:
        return None
    # WHY the status LETTER is read only to find a rename's second path, and
    # never to decide what happened: the letters that mean "gone from the
    # worktree" differ between the index column and the worktree column, and
    # `??`/`!!`/`AM`/`RM` each need their own reading. Asking the DISK
    # instead is correct for every letter without enumerating any of them —
    # a path that is there contributes its current content, a path that is
    # not is dropped. The one thing the disk cannot tell us is that a
    # rename's SOURCE existed at HEAD and is now gone, which is why `-z`'s
    # extra record has to be consumed rather than mis-parsed as a status
    # line: miss it and `a` renamed to `b` fingerprints identically to `a`
    # copied to `b`, a false match.
    changed: set[str] = set()
    records = [record for record in status.split("\0")]
    index = 0
    while index < len(records):
        record = records[index]
        index += 1
        if len(record) <= 3:
            continue
        changed.add(record[3:])
        if record[0] in "RC" or record[1] in "RC":
            if index < len(records) and records[index]:
                changed.add(records[index])
            index += 1
    root = Path(project_root)
    rehash: list[str] = []
    for path in sorted(changed):
        if not path or _excluded_from_snapshot(path):
            continue
        if "\n" in path:
            return None
        candidate = root / path
        if candidate.is_symlink():
            # A symlink's content IS its target text. Recorded as an explicit
            # marker rather than a hand-rolled git blob id — these values only
            # ever have to be consistent with themselves, and pretending to
            # compute git's own hash would be a claim this does not need.
            blobs[path] = f"symlink:{os.readlink(candidate)}"
        elif candidate.is_file():
            rehash.append(path)
        else:
            blobs.pop(path, None)
    if rehash:
        try:
            completed = subprocess.run(
                ["git", "-C", str(project_root), "hash-object", "--stdin-paths"],
                input="\n".join(rehash) + "\n",
                capture_output=True,
                text=True,
                timeout=60,
                check=False,
            )
        except (OSError, subprocess.SubprocessError):
            return None
        identifiers = completed.stdout.split()
        if completed.returncode != 0 or len(identifiers) != len(rehash):
            return None
        blobs.update(zip(rehash, identifiers))

    digest = hashlib.sha256()
    for path in sorted(blobs):
        digest.update(path.encode())
        digest.update(b"\0")
        digest.update(blobs[path].encode())
        digest.update(b"\0")
    return digest.hexdigest()[:16]


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
    but ONLY when Stable's commit is genuinely an ancestor of HEAD, so this
    number can never be presented as "N commits behind" for a history that
    actually diverged.

    WHY the ancestry gate (the judge's HIGH finding, 2026-09-22, and this
    repo was itself the counter-example): `rev-list --count <commit>..HEAD`
    counts what HEAD has and the pinned commit does not, and says nothing
    about what the pinned commit has and HEAD does not. Measured on this very
    checkout: Stable's `e2c19af` against a then-HEAD of `ced0360` diverge at
    `92c2c22`, and the old body returned 5 — printed as "5 commits behind
    your checkout" while Stable held commits the checkout had never seen. The
    earlier docstring called that "an honest 'not what Stable was built
    from'", which it is not: it is a precise-looking number for a
    relationship that is not "behind" at all. Divergence is now its own state
    (`stable_relation`), and this counter refuses to answer outside the one
    case where the word "behind" is true.

    None (not 0) whenever it cannot be computed — no recorded commit, git
    can't answer, the commit isn't in this checkout, or the histories
    diverged — so the badge can tell "unknown" from "caught up" instead of
    fabricating the reassuring case.
    """
    commit = manifest.get("commit")
    if not commit:
        return None
    if _is_ancestor(project_root, commit, "HEAD") is not True:
        return None
    return _rev_count(project_root, f"{commit}..HEAD")


#: Every state `stable_relation` can report. Named here so both badges and
#: the tests share one closed vocabulary rather than matching on strings.
RELATION_STATES = ("match", "behind", "stable-ahead", "diverged", "different", "unknown")


def _relation(
    state: str,
    *,
    detail: str,
    behind: int | None = None,
    stable_ahead: int | None = None,
) -> dict:
    assert state in RELATION_STATES, state
    return {"state": state, "behind": behind, "stableAhead": stable_ahead, "detail": detail}


def stable_relation(manifest: dict, project_root: Path) -> dict:
    """What the live checkout is, RELATIVE to the pinned Stable build — the
    one answer both badges render, and the only place the words "up to date"
    are allowed to come from.

    Five honest states instead of the old two (`liveMatchesStable` plus a
    commit count), because the old pair had no way to say the two true things
    that were actually happening:

    - ``match``        — proven identical source. Content, not history: a
                         checkout that committed its edits without changing a
                         byte still matches.
    - ``behind``       — Stable's commit IS an ancestor of HEAD; `behind` is
                         how many commits ahead the checkout is.
    - ``stable-ahead`` — the other direction: HEAD is an ancestor of Stable's
                         commit, so Stable is NEWER than what is on disk.
                         Previously indistinguishable from "up to date".
    - ``diverged``     — neither contains the other. Previously printed as a
                         clean "N commits behind", the worst kind of wrong:
                         precise and false.
    - ``different``    — same commit, different bytes (uncommitted edits).
    - ``unknown``      — anything that cannot be established. Never inferred
                         to be the reassuring case.

    `detail` is a short human sentence; the badges show it as-is so this
    module stays the single author of the claim.
    """
    stable_commit = manifest.get("commit") or None
    stable_fingerprint = manifest.get("sourceFingerprint") or None
    live_fingerprint = source_fingerprint(project_root)

    if stable_fingerprint and live_fingerprint and stable_fingerprint == live_fingerprint:
        return _relation("match", detail="this checkout's source is identical to Stable's")

    if stable_commit is None:
        return _relation("unknown", detail="Stable recorded no commit to compare against")
    head = (_git(project_root, "rev-parse", "HEAD") or "").strip() or None
    if head is None:
        return _relation("unknown", detail="this directory is not a readable git checkout")
    if _git(project_root, "cat-file", "-e", f"{stable_commit}^{{commit}}") is None:
        return _relation(
            "unknown",
            detail=f"Stable's commit {stable_commit[:7]} is not in this checkout",
        )

    stable_is_ancestor = _is_ancestor(project_root, stable_commit, head)
    head_is_ancestor = _is_ancestor(project_root, head, stable_commit)
    if stable_is_ancestor is None or head_is_ancestor is None:
        return _relation("unknown", detail="git could not compare the two commits")

    if stable_is_ancestor and head_is_ancestor:
        # The same commit. Whether the SOURCE matches now rests on the tree.
        if stable_fingerprint and live_fingerprint:
            return _relation(
                "different",
                detail="same commit as Stable, but the working tree has changed since it was built",
            )
        live = source_provenance(project_root)
        if live.dirty is False and manifest.get("dirty") is False:
            return _relation("match", detail="clean checkout at the same commit Stable was built from")
        return _relation(
            "unknown",
            detail="same commit as Stable, but uncommitted changes mean the source cannot be verified",
        )

    if stable_is_ancestor:
        behind = _rev_count(project_root, f"{stable_commit}..{head}")
        if behind == 0:
            return _relation("unknown", detail="git reported no commits between Stable and HEAD")
        return _relation(
            "behind",
            behind=behind,
            detail=f"Stable was built {behind} commit{'' if behind == 1 else 's'} before this checkout",
        )

    if head_is_ancestor:
        ahead = _rev_count(project_root, f"{head}..{stable_commit}")
        return _relation(
            "stable-ahead",
            stable_ahead=ahead,
            detail=f"Stable is {ahead} commit{'' if ahead == 1 else 's'} NEWER than this checkout",
        )

    behind = _rev_count(project_root, f"{stable_commit}..{head}")
    ahead = _rev_count(project_root, f"{head}..{stable_commit}")
    return _relation(
        "diverged",
        behind=behind,
        stable_ahead=ahead,
        detail=f"histories diverged — {behind} commit(s) here Stable lacks, {ahead} there this checkout lacks",
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
                # WHY an OPTIONAL key at the SAME MANIFEST_SCHEMA_VERSION
                # rather than a bump to 4: `read_manifest` rejects a
                # mismatched schemaVersion outright, and `bboxui_server.py`
                # calls it at startup — so bumping would make Zach's already
                # pinned Stable build unreadable and its server refuse to
                # start until he promoted again, to gain nothing. Adding a
                # field is a compatible change; a manifest written before
                # this simply has no fingerprint, and `stable_relation`
                # degrades to an honest "unknown" (never to "match") until
                # the next promote records one.
                "sourceFingerprint": source_fingerprint(project_root),
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
    """Does the live tree already match the pinned Stable build? True ONLY
    when that is provable — never as a fallback.

    WHY this is now one line over `stable_relation` instead of its own
    comparison: the old body compared the commit, the dirty *boolean*, and up
    to twelve dirty path NAMES, and the docstring called the resulting
    false-positive "a UI-staleness question". It is not. Editing an
    already-dirty file leaves all three inputs identical, so the badge kept
    rendering "up to date" for a checkout that had moved — the one failure
    this badge exists to prevent (Zach: "I want to make sure I am getting the
    latest version"). A badge that can say "up to date" when it is not is
    worse than no badge, so the only `True` left is a proven-identical source
    fingerprint, or a clean checkout sitting on the exact commit a clean
    Stable was built from.

    `apps/docs/src/components/dev/preview-channel-badge.tsx` still reads this
    as the boolean `liveMatchesStable`; keeping the shape means that badge
    simply stops false-greening, with no change of its own.
    """
    return stable_relation(manifest, project_root)["state"] == "match"


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


def probe_health(port: int, path: str, timeout: float = 1.0) -> dict | None:
    """One loopback server's health document, or None if it does not serve
    one. Never raises — an absent endpoint and a foreign service are both
    simply "no identity to read"."""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}{path}", timeout=timeout) as response:
            payload = json.load(response)
    except (OSError, ValueError, urllib.error.URLError, urllib.error.HTTPError):
        return None
    return payload if isinstance(payload, dict) else None


def preview_identity_error(port: int, config: ProductConfig, project_root: Path) -> str | None:
    """Why the server currently holding the Preview port must NOT be handed
    over as this checkout's Preview — or None when it may be.

    WHY this check exists (the judge's HIGH finding, 2026-09-22): the old code
    was `if port_responds(port): return url`, so ANY HTTP listener on 5431 was
    accepted and its URL handed to the badge, which then labelled whatever it
    was "Preview · live, following disk". A peer worktree's Storybook, a
    leftover static build, an unrelated dev server — all three were reported
    as this checkout's live source. That is the same class of lie as a badge
    claiming "up to date": the launcher's answer names a checkout it never
    verified.

    `preview_health_path` is None for products whose Preview genuinely cannot
    identify itself (see DOCS below), and for those this returns None — there
    is nothing to validate, and inventing a refusal would break a working
    flow. Every product that CAN identify itself must.
    """
    if config.preview_health_path is None:
        return None
    payload = probe_health(port, config.preview_health_path, timeout=1.0)
    if payload is None:
        return (
            f"something is listening on :{port} that does not answer "
            f"{config.preview_health_path} — it is not this checkout's {config.display_name} Preview"
        )
    if payload.get("product") != config.product:
        return (
            f":{port} is held by {payload.get('product') or 'an unidentified service'}, "
            f"not {config.product}"
        )
    expected = checkout_id(project_root)
    actual = payload.get("checkoutId")
    if actual != expected:
        return (
            f":{port} is serving a DIFFERENT checkout ({actual or 'unidentified'}, "
            f"expected {expected}) — refusing to present it as this one"
        )
    return None


def ensure_preview_server(state_home: Path, config: ProductConfig) -> str:
    pid_path = state_home / "preview" / "dev.pid"
    port = config.preview_port
    url = f"http://127.0.0.1:{port}/"
    if port_responds(port, timeout=0.4):
        # Already up — but only OURS may be handed back. Never contest the
        # port (CLAUDE.md, "Several agent sessions edit this tree at once"):
        # refuse loudly instead, so the caller reports a mismatch rather than
        # a stranger's server dressed up as this checkout's Preview.
        problem = preview_identity_error(port, config, PROJECT_ROOT)
        if problem is not None:
            raise ReleaseError(problem)
        return url

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
    # WHY these vars exist now, when this used to return `{}`: the badge used
    # to tell Preview from Stable by comparing `window.location.port` against
    # a hardcoded 5430, so a static build on any other port (6006, say) was
    # declared "Preview · live, following disk" outright, and setting
    # BBOXUI_SB_STABLE_PORT broke the badge instead of moving it. The channel
    # now comes from the page's OWN /api/health — which the dev server can
    # only answer truthfully if it knows the ports this launcher chose.
    #
    # WHY they are plain (not NEXT_PUBLIC_*-style) names: nothing bakes these
    # into a bundle. `.storybook/statusEndpoint.ts` reads them in Node at
    # request time and puts the answer in the health document, which is why
    # a rebuilt bundle is never needed to move a port.
    return {
        "BBOXUI_SB_STABLE_PORT": str(stable_port),
        "BBOXUI_SB_CHANNEL": "preview",
    }


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
    # WHY None: bbox-ui.com's Preview is `next dev`, which serves no
    # /api/health of its own — preview-channel-badge.tsx only ever fetches
    # STABLE's. There is therefore no identity to validate on this port, and
    # refusing a `next dev` Zach started himself would break a working flow
    # to prove nothing. Give docs' Preview a health route and this becomes
    # "/api/health" and the refusal starts applying here too.
    preview_health_path=None,
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
    # `storybook dev` answers this through
    # apps/storybook-basics/.storybook/statusEndpoint.ts, so an occupied
    # :5431 can be — and is — checked against this checkout before it is
    # handed over as Preview.
    preview_health_path="/api/health",
)

PRODUCTS: dict[str, ProductConfig] = {DOCS.slug: DOCS, STORYBOOK.slug: STORYBOOK}
