"""ACCEPTANCE for lane L-REG — every registry item installs.

docs/finish-2026-09-29/lanes.json, lane L-REG, acceptance:
  "npx shadcn@latest build, then docs/verify_registry_install.py installs EVERY
   item into a throwaway project and tsc passes"
Brief: docs/lanes/finish-L-REG.md. Committed RED by the acceptance author
before the builder existed; the builder may not edit this file.

WHY a consumer-shaped test and not a source scan: CLAUDE.md, "The registry is
the product" — `npx shadcn add` exiting 0 proves nothing, and this repo has
already shipped a registry that installed cleanly and then failed to compile.
The static half (the pin, CLAUDE.md, payload imports, collisions, the donor,
the presets) is `packages/bbox-ui/test/registryInstallable.test.ts`, which
rides `pnpm -r test`; this half needs npm and a few minutes (3–6 min, by
machine load), which is why it is NOT under `scripts/tests` — that folder runs
five times in W5's G2, and this check belongs once, in G5, after every trunk
change has merged (lanes.json L-REG extra: "W5 re-runs the generator and the
install check after every trunk change has merged").

WHY each item ALONE as well as all together: one project holding every item
hides an item that only compiles because ANOTHER item dropped the sibling it
forgot to ship (or a registryDependency that never resolved). A consumer
installs one item. Measured 2026-10-06 on BASE 61e26e6: 36 of 42 items
install alone and type-check; exactly the six EXPECTED_UNINSTALLABLE fail
(`port`, `block`, `block-region`, `labeled-group` 404 on an unpublished
`@bbox-ui/*` package; `block-node-reactflow`, `block-shape-tldraw` TS2307 on
`@bbox-ui/core`). ~3.5 s per item with a warm npm cache.

WHY the test re-runs `tsc` itself and checks the landed files instead of
trusting verify_registry_install.py's exit code: that script is in the
builder's write set. Its exit code is the acceptance line's literal wording;
the re-check is the independent half (feedback: "an oracle from outside your
implementation").

Needs the network (npm registry; ui.shadcn.com for a stock `utils`
registryDependency, if any item still declares one). A network failure is a
red, never a skip — a skipped install check is a silent pass.

Run:  python3 -m pytest -q docs/acceptance/registry/test_registry_installs.py
      (at the L-REG merge, and again in W5's G5)
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
REGISTRY = json.loads((REPO / "registry.json").read_text())
ITEMS = REGISTRY["items"]
ITEM_NAMES = [item["name"] for item in ITEMS]
VERIFY = REPO / "docs/verify_registry_install.py"
GENERATOR = REPO / "docs/build_menu_registry_items.py"


def run(cmd: list[str], cwd: Path = REPO, timeout: int = 600) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)


def tail(proc: subprocess.CompletedProcess[str], lines: int = 25) -> str:
    return "\n".join((proc.stdout + proc.stderr).strip().splitlines()[-lines:])


def landed_path(project: Path, target: str) -> Path:
    # shadcn's `~/` prefix means the project root; plain targets already are.
    return project / (target[2:] if target.startswith("~/") else target)


class Throwaway:
    """A fresh empty project dir, deleted when the test passed and KEPT (path
    printed in the failure) when it did not — each one holds ~80 MB of
    node_modules, so 42 kept dirs would be 3 GB."""

    def __init__(self, label: str) -> None:
        self.path = Path(tempfile.mkdtemp(prefix=f"l-reg-{label}-"))
        self.keep = True

    def done(self) -> None:
        self.keep = False
        shutil.rmtree(self.path, ignore_errors=True)


def assert_consumer_compiles(project: Path, names: list[str]) -> None:
    """The independent re-check: every file the named items ship landed, and
    `tsc` over the project as the consumer has it exits 0."""
    by_name = {item["name"]: item for item in ITEMS}
    missing = [
        f"{name}: {f.get('target') or f['path']}"
        for name in names
        for f in by_name[name]["files"]
        if not landed_path(project, f.get("target") or f["path"]).is_file()
    ]
    assert not missing, f"never landed in {project}:\n  " + "\n  ".join(missing)
    tsconfig = json.loads((project / "tsconfig.json").read_text())
    assert tsconfig["compilerOptions"].get("strict") is True, "the throwaway tsconfig is no longer strict"
    tsc = run(["npx", "tsc", "-p", "tsconfig.json"], cwd=project)
    assert tsc.returncode == 0, f"tsc in {project} exit {tsc.returncode}:\n{tail(tsc)}"


def test_L_REG_shadcn_build_reproduces_the_committed_payloads() -> None:
    """The acceptance line's first half: `npx shadcn@latest build`. Built into a
    scratch dir (never over public/r) and compared byte for byte, so what
    verify_registry_install.py installs from public/r IS the build output."""
    out = Path(tempfile.mkdtemp(prefix="l-reg-build-"))
    try:
        build = run(["npx", "--yes", "shadcn@latest", "build", "-o", str(out)])
        assert build.returncode == 0, tail(build)
        built = {p.name: p.read_bytes() for p in out.glob("*.json")}
        committed = {p.name: p.read_bytes() for p in (REPO / "public/r").glob("*.json")}
        assert sorted(built) == sorted(committed), (
            f"built-but-uncommitted {sorted(set(built) - set(committed))}, "
            f"committed-but-not-built {sorted(set(committed) - set(built))}"
        )
        stale = sorted(name for name in built if built[name] != committed[name])
        assert not stale, f"public/r is not the build output — rebuild and commit: {stale}"
    finally:
        shutil.rmtree(out, ignore_errors=True)


def test_L_REG_generator_check_is_clean() -> None:
    """registry.json is generated (never hand-edited) and the generator's own
    gates — sibling rule, payload freshness, shadcn schema, unpublished
    dependencies — all pass with nothing left to warn about. Today it exits 1
    on block-region/labeled-group and warns on port/block."""
    check = run([sys.executable, str(GENERATOR), "--check"])
    out = check.stdout + check.stderr
    assert check.returncode == 0, tail(check)
    assert "WARNING" not in out and "UNINSTALLABLE" not in out, tail(check)


def test_L_REG_every_item_installs_together_and_type_checks() -> None:
    """The acceptance line as written: verify_registry_install.py with no item
    names installs EVERY item into one throwaway project and tsc passes."""
    box = Throwaway("all")
    proc = run([sys.executable, str(VERIFY), "--dir", str(box.path)], timeout=900)
    assert proc.returncode == 0, f"{box.path}\n{tail(proc)}"
    assert_consumer_compiles(box.path, ITEM_NAMES)
    box.done()


@pytest.mark.parametrize("name", ITEM_NAMES)
def test_L_REG_item_installs_alone_and_type_checks(name: str) -> None:
    """What a consumer actually does: `shadcn add` ONE item into an empty
    project (its registryDependencies must resolve on their own), then tsc."""
    box = Throwaway(name)
    proc = run([sys.executable, str(VERIFY), "--dir", str(box.path), name])
    assert proc.returncode == 0, f"{name} alone, in {box.path}:\n{tail(proc)}"
    assert_consumer_compiles(box.path, [name])
    box.done()
