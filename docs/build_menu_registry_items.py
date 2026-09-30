#!/usr/bin/env python3
"""
Generate registry.json items for the menu kit, from the real import graph.

WHY generated and not hand-written: CLAUDE.md's "The registry is the product"
section records that this repo has ALREADY shipped a registry that installed
cleanly and then failed to compile — `npx shadcn@latest build` exited 0 while
twelve files could not resolve `cn`, because `shadcn add` copies source
verbatim and rewrites only the `@/` alias, never a relative specifier. So every
file a component imports relatively has to land as its SIBLING, and getting
that right by hand across twenty new items is exactly the kind of bookkeeping
that looks done and is not.

The two target rules this encodes, both from CLAUDE.md:

  src/components/X  ->  components/bbox/X
  src/lib/X         ->  components/lib/X      (a SIBLING of bbox/, not inside it)

The second is the subtle one. The trunk lays `components/` and `lib/` out as
siblings, so every trunk component writes `../lib/utils` — up-and-over. Flatten
`components/*` into `components/bbox/*` and every file moves down a level, so
`lib/utils.ts` must land beside `bbox/` for `../lib/utils` to still resolve.
Landing it at `components/bbox/lib/utils.ts` is right for the OLD
`packages/bbox-ui` lineage (whose source writes `./lib/utils`) and wrong here.

Items are self-contained by design: no `registryDependencies` between bbox
items, and a file two items share is simply re-listed by both with its own
target. That is the existing convention — see `port-v2` / `labeled-port`.

    python3 docs/build_menu_registry_items.py          # rewrite registry.json
    python3 docs/build_menu_registry_items.py --check   # diff only, exit 1 if stale
"""
from __future__ import annotations

import json
import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent
APP = REPO / "apps/storybook-basics"
SRC = APP / "src"
LEGACY_SRC = REPO / "packages/bbox-ui/src"
REGISTRY = REPO / "registry.json"

# Bare specifiers that a consumer's app already provides, so they never become
# an item `dependencies` entry.
AMBIENT = {"react", "react-dom", "react/jsx-runtime"}

# ---------------------------------------------------------------------------
# The kit's own surfaces. Stock shadcn copies (popover, breadcrumb, tabs,
# toggle-group, button-group, context-menu, separator) deliberately get NO item
# of their own — CLAUDE.md's rule is that a consumer takes those from the stock
# shadcn registry. They still travel INSIDE the items that import them, because
# a relative `./popover` has to resolve after the copy; the transitive walk
# below puts them there without anyone having to remember.
# ---------------------------------------------------------------------------
ITEMS = [
    ("menu-toolbar", "editor/toolbar.tsx", "Menu Toolbar",
     "Roving-focus bar container over Base UI's Toolbar — the strip the floating pill, the tool "
     "dock, the chrome bar and the status strip all sit in. Consumes the trunk's ambient size cascade."),
    ("split-button", "editor/splitButton.tsx", "Split Button",
     "One primary action plus a chevron opening its alternates. Backs the tool dock's family cells "
     "and the draft bar's Merge control."),
    ("inline-rename", "components/inlineRename.tsx", "Inline Rename",
     "A text field that commits on Enter or blur and reverts on Escape. Controlled only — the host "
     "owns the keybinding that starts a rename."),
    ("control-registry", "editor/controlRegistry.ts", "Control Registry",
     "Declare a value-bound control once, then compose it into many surfaces by recipe. A factory, "
     "so palettes and vocabularies are injected rather than imported."),
    ("control-strip", "editor/controlStrip.tsx", "Control Strip",
     "The one renderer for every registered control: trigger shape chosen by `trigger`, panel shape "
     "by `layout`, value preview by `glyph` family — all lookups, never per-kind conditionals."),
    ("floating-toolbar", "editor/floatingToolbar.tsx", "Floating Toolbar",
     "The positioned shell a control strip sits in, over FigJam's above/pinned/below placement "
     "policy. The host measures; the component never does."),
    ("tool-dock", "editor/toolDock.tsx", "Tool Dock",
     "A bottom tool bar whose families are declared as data, each remembering its last-used member."),
    ("chrome-bar", "editor/chromeBar.tsx", "Chrome Bar",
     "Burger menu, back/forward, home and an eliding breadcrumb with a status dot — the editor's "
     "top-left identity strip."),
    ("branch-chip", "editor/branchChip.tsx", "Branch Chip",
     "The branch or draft selector: current name, a count badge, and a popover of alternates with "
     "inline rename."),
    ("panel-shell", "editor/panelShell.tsx", "Panel Shell",
     "The side-panel frame — eyebrow, title, close, scrollable body. The shell is the component; "
     "each panel is one instance of it."),
    ("frames-panel", "editor/framesPanel.tsx", "Frames Panel",
     "Reorderable board-navigation rows with host-rendered previews, plus a save-this-view row."),
    ("problems-panel", "editor/problemsPanel.tsx", "Problems Panel",
     "A diagnostics list in VS Code's shape: severity counts, a severity filter, grouped rows "
     "carrying a rule code. Severities are config, not a hardcoded three."),
    ("status-strip", "editor/statusStrip.tsx", "Status Strip",
     "The corner cluster of panel launchers with badges and a zoom readout."),
    ("history-list", "editor/historyList.tsx", "History List",
     "A version rail where selecting an entry sets it as the BEFORE side of a comparison."),
    ("property-table", "editor/propertyTable.tsx", "Property Table",
     "Per-element and flat-table views of a property diff, with optional Figma-style word-level "
     "highlighting."),
    ("code-view", "editor/codeView.tsx", "Code View",
     "A line-diff view of two text versions."),
    ("compare-review", "editor/compareReview.tsx", "Compare Review",
     "The whole diff-review surface — history rail, two version panes, a properties/code rail, and "
     "side-by-side or overlay. Headless: the host supplies the modal and both renderers."),
    ("draft-bar", "editor/draftBar.tsx", "Draft Bar",
     "The draft-mode strip: exit, draft name, and a change-gated compare/merge pair."),
    # ── The control-flow kit's ONE distributable surface ────────────────
    # WHY `block-region` is an item and the `loop` / `branch` PRESETS are not,
    # even though a consumer plainly wants a for-loop: an item is a file
    # tree this script can target, and `target_for` above has exactly two
    # rules — `src/components/X -> components/bbox/X` and
    # `src/lib/X -> components/lib/X`. A preset lives at
    # `src/scene/region.<kind>.ts` (beside the region MODEL since 2026-09-22;
    # it was `src/presets/<kind>/`) and would raise "unexpected trunk
    # location, no target rule" on the spot. That is the shallow reason.
    # The deep one is that the presets are not components at all: they are
    # pure scene-node factories over a HOST (`forLoopNode` returns a
    # `SceneNode<HostNodeData>`, `branchNode` an array of them), so they
    # import `hosts/hostScene` and `scene/region` — the scene kit, which a
    # `components/bbox/` install has no counterpart for. Shipping them
    # would mean shipping the whole scene+host lineage under a component
    # target, which is a different distribution decision than this script
    # makes. `docs/CONTROL-FLOW-PLAN.md` §11 item 6 owns that follow-up (a
    # `presets/` target rule); until it lands, a consumer installs
    # `block-region` and writes the three fields (`region.kind`, `ports`,
    # arms) itself — which is all a preset ever was.
    #
    # `labeled-group` IS an item, and that is the same rule, not an exception:
    # it is a COMPONENT preset (`components/blockRegion.labeledGroup.tsx`,
    # BlockRegion given only a title), so it lands under the component target
    # like any other component. Renamed from `region` on 2026-09-22 with the
    # component (Zach: "Block Region is stanadlone component that composes the
    # Block with a 'region'"); `region` could not build on main before
    # 2026-09-22, so no consumer ever installed the old name.
    ("block-region", "components/blockRegion.tsx", "Block Region",
     "A control-flow frame with a real Block integral to its top-left corner — the frame carries "
     "scope and no value ports; arms stack under the corner block with a fold chevron each. Loops "
     "and branches are data presets over it."),
    ("labeled-group", "components/blockRegion.labeledGroup.tsx", "Labeled Group",
     "A Block Region with only a title: a thin frame and a title card in its top-left corner, "
     "square where the card meets the frame. React Flow UI's Labeled Group Node, as a preset."),
]

# The sixteen items that publish the design trunk's own components (CLAUDE.md,
# "Sixteen items now publish the trunk directly"). WHY they are built here too:
# their file lists were set by hand once and then drifted — block.tsx, port.tsx,
# trace.tsx and friends gained imports (highlighter, hitRegion, paintOrder,
# skin/portVariants) the published items never picked up, so on 2026-09-22
# eleven of them installed and failed to compile, and the sibling check below
# said so the first time it was run over them. Names, titles and descriptions
# stay exactly as published; only the file lists come from the import graph.
TRUNK_ITEMS = [
    ("badge", "components/badge.tsx"),
    ("bar", "components/bar.tsx"),
    ("text", "components/text.tsx"),
    ("editable-text", "components/editableText.tsx"),
    ("folding-chevron", "components/foldingChevron.tsx"),
    ("block-card", "components/block.tsx"),
    ("port-dot", "components/port.tsx"),
    ("code-editor", "components/codeEditor.tsx"),
    ("labeled-port", "components/labeledPort.tsx"),
    ("port-edge", "components/portEdge.tsx"),
    ("block-port", "components/blockPort.tsx"),
    ("trace", "components/trace.tsx"),
    ("trace-badge", "components/traceBadge.tsx"),
    ("trace-editor", "components/traceEditor.tsx"),
    ("trace-tidy", "components/trace.tidy.ts"),
    ("wire-layer", "components/wireLayer.tsx"),
]

# Names this script used to build and no longer does. Removed from
# registry.json on the next run (see `main`). Keep a name here only while an
# old registry.json could still carry it.
RETIRED_ITEMS = [
    "region",  # renamed `block-region` with the component, 2026-09-22
]

LEGACY_ITEMS = [
    ("port", "port.tsx", "Port",
     "A port dot with its optional label and code field, over the frozen v1 lineage."),
    ("block", "block.tsx", "Block",
     "A block body with its header, footer and sketch outline, over the frozen v1 lineage."),
]

# Files an item must ship that NO source file imports, so the transitive walk
# cannot find them. `packages/bbox-ui/src/index.ts:56` states the case plainly:
# `codeField.css` ships as its own package export and "no host import here at
# all" — the host is expected to import it deliberately, the way it imports
# `theme.css`. A component whose stylesheet is a separate export is exactly the
# thing an import graph is blind to, so it is declared instead of derived.
# Keep this list SHORT: an entry here is an assertion that the file genuinely
# cannot be reached, not a place to paper over a resolver gap.
EXTRA_FILES: dict[str, list[str]] = {
    "port": ["packages/bbox-ui/src/codeField.css"],
}

IMPORT_RE = re.compile(r"""^\s*(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]""", re.M)
SIDE_EFFECT_RE = re.compile(r"""^\s*import\s+['"]([^'"]+)['"]""", re.M)


def resolve(spec: str, importer: pathlib.Path) -> pathlib.Path | None:
    """Resolve a relative specifier to a real file under src/, or None."""
    if not spec.startswith("."):
        return None
    base = (importer.parent / spec).resolve()
    if base.suffix in {".css", ".json"} and base.exists():
        return base
    # WHY `name + ".ts"` and NOT `with_suffix(".ts")`: this codebase names
    # modules `port.layout.ts`, `glyph.layout.ts`, `trace.bends.ts` — dots are
    # part of the NAME, not an extension. `with_suffix` replaces everything
    # from the last dot, so `./port.layout` resolved to `port.ts`, which then
    # silently failed to resolve and dropped the file from the item. The
    # sibling-rule assertion at the bottom is what surfaced it.
    for cand in (
        base.parent / (base.name + ".ts"), base.parent / (base.name + ".tsx"),
        base / "index.ts", base / "index.tsx", base,
    ):
        if cand.is_file():
            return cand
    return None


def walk(entry: pathlib.Path) -> tuple[set[pathlib.Path], set[str]]:
    """Transitive closure of relative imports, plus the bare specifiers met."""
    seen: set[pathlib.Path] = set()
    bare: set[str] = set()
    stack = [entry]
    while stack:
        f = stack.pop()
        if f in seen or not f.is_file():
            continue
        seen.add(f)
        if f.suffix == ".css":
            continue
        text = f.read_text()
        for spec in set(IMPORT_RE.findall(text)) | set(SIDE_EFFECT_RE.findall(text)):
            target = resolve(spec, f)
            if target is not None:
                stack.append(target)
            elif not spec.startswith("."):
                # "@codemirror/view" -> "@codemirror/view"; "lucide-react/x" -> "lucide-react"
                parts = spec.split("/")
                pkg = "/".join(parts[:2]) if spec.startswith("@") else parts[0]
                if pkg not in AMBIENT:
                    bare.add(pkg)
    return seen, bare


def unresolved(files: list[pathlib.Path], targets: dict[pathlib.Path, str]) -> list[tuple[str, str, str]]:
    """Every relative import in `files` that lands on no file of the item once
    installed at `targets` — (target, specifier, where it would look)."""
    landed = set(targets.values())
    out = []
    for f in files:
        if f.suffix == ".css":
            continue
        here = pathlib.PurePosixPath(targets[f]).parent
        for spec in set(IMPORT_RE.findall(f.read_text())):
            if not spec.startswith("."):
                continue
            parts: list[str] = []
            for p in (here / spec).as_posix().split("/"):
                if p == "..":
                    parts and parts.pop()
                elif p not in (".", ""):
                    parts.append(p)
            want = "/".join(parts)
            if not any(t == want or t.rsplit(".", 1)[0] == want for t in landed):
                out.append((targets[f], spec, want))
    return out


def target_for(f: pathlib.Path, mirrored: bool = False) -> str:
    """Where a source file must land so its own relative imports still resolve.

    The rule is LINEAGE-dependent, which is the whole trap. `packages/bbox-ui`
    writes `./lib/utils` — utils nested one level BELOW the component — so its
    files flatten straight into `components/bbox/` and utils lands nested at
    `components/bbox/lib/utils.ts`. The trunk lays `components/` and `lib/` out
    as siblings and writes `../lib/utils`, so flattening moves every file down
    a level and utils must land BESIDE `bbox/`, at `components/lib/utils.ts`.
    Applying either lineage's rule to the other is the "build stays green,
    install breaks" failure CLAUDE.md records.
    """
    if SRC in f.parents:
        rel = f.relative_to(SRC)
        if mirrored:
            # WHY: an editor file imports `../components/button`. Flattening
            # would break that; mirroring the trunk tree under one root keeps
            # every relative import valid. See build_item.
            return "components/bbox/" + rel.as_posix()
        if rel.parts[0] == "components":
            return "components/bbox/" + "/".join(rel.parts[1:])
        # lib/, skin/, … land as SIBLINGS of bbox/: a component reaches them
        # up-and-over (`../lib/utils`, `../skin/regionVariants`). Whether the
        # item then compiles is not assumed here — build_item checks every
        # import against these targets and mirrors the item when one fails.
        # (skin/ joined lib/ on 2026-09-22: region.tsx reads its drawing from
        # skin/ since 2026-09-19, and the region item could not build at all.)
        return f"components/{rel.parts[0]}/" + "/".join(rel.parts[1:])
    if LEGACY_SRC in f.parents:
        return "components/bbox/" + f.relative_to(LEGACY_SRC).as_posix()
    raise SystemExit(f"unexpected source location, no target rule: {f}")


def file_type(f: pathlib.Path) -> str:
    if f.suffix == ".css":
        return "registry:style"
    if f.suffix != ".tsx":
        return "registry:lib"
    if LEGACY_SRC in f.parents:
        return "registry:component"
    return "registry:component" if f.relative_to(SRC).parts[0] in ("components", "editor") else "registry:lib"


def build_item(name: str, entry_rel: str, title: str, desc: str,
               root: pathlib.Path = SRC) -> dict:
    entry = root / entry_rel
    if not entry.is_file():
        raise SystemExit(f"{name}: entry does not exist: {entry}")
    files, deps = walk(entry)
    files = {f for f in files if ".test." not in f.name and ".stories." not in f.name}
    # WHY two layouts (2026-09-22, when the chrome moved to src/editor/ on Zach's
    # word — "most of these should belong in editor"): an item that is only
    # components/ + lib/ keeps the flat `components/bbox/X` install it always
    # had, so nobody's existing paths move. An item that reaches into editor/
    # imports across folders (`../components/button`), which flattening cannot
    # keep, so that item installs as a mirror of the trunk tree —
    # `components/bbox/{components,editor,lib}/X`. The sibling check in main()
    # proves every relative import resolves against whichever layout applied.
    # So: flat when every import still resolves flat, mirrored otherwise. The
    # rule is the resolution itself, not a list of folders — skin/portVariants
    # importing `../components/port.layout` needed it just as editor/ does.
    flat = {f: target_for(f) for f in files}
    mirrored = all(SRC in f.parents for f in files) and bool(unresolved(sorted(files), flat))
    for extra in EXTRA_FILES.get(name, []):
        f = REPO / extra
        if not f.is_file():
            raise SystemExit(f"{name}: EXTRA_FILES names a file that does not exist: {extra}")
        files.add(f)
    return {
        "name": name,
        "type": "registry:component",
        "title": title,
        "description": desc,
        "files": [
            {"path": str(f.relative_to(REPO)), "type": file_type(f), "target": target_for(f, mirrored)}
            for f in sorted(files, key=lambda p: str(p))
        ],
        "dependencies": sorted(deps),
    }



def _check_published_payloads(reg: dict) -> None:
    """Is what we SERVE current, complete, and nothing more?"""
    published = REPO / "public/r"
    stale: list[str] = []
    if not published.is_dir():
        # WHY this is an error and not a skip: the guard used to be
        # `if published.is_dir():`, so deleting or never building public/r
        # made --check print "published payloads match source" and exit 0 —
        # a checker that passes hardest when there is nothing to check.
        # Fault-injected by a judge, 2026-09-18. Unpublished is a state to
        # report, never one to pass.
        print(f"\nNOT PUBLISHED: {published} does not exist — run `npx shadcn@latest build`")
        raise SystemExit(1)
    if True:
        for it in reg["items"]:
            payload = published / f"{it['name']}.json"
            if not payload.is_file():
                stale.append(f"{it['name']}: never published")
                continue
            data = json.loads(payload.read_text())
            by_target = {f.get("target") or f["path"]: f.get("content") for f in data.get("files", [])}

            # WHY the file SET and the dependencies are compared, not just the
            # bytes of files we expect: checking only "every file I expect is
            # present and matches" passes a payload that ALSO ships files
            # nobody declared, and passes one whose `dependencies` have been
            # emptied — so `shadcn add` would copy source needing packages it
            # never installs. Both were fault-injected into
            # public/r/control-strip.json and both exited 0 (judge, 2026-09-18).
            # A payload is a contract in three parts: which files, their
            # contents, and what they need installed.
            expected_targets = {f["target"] for f in it["files"]}
            for extra in sorted(set(by_target) - expected_targets):
                stale.append(f"{it['name']}: published payload ships an undeclared file {extra}")
            # Schema-valid but WRONG: shadcn accepts any member of its type
            # enum and any string name, so a payload could declare itself
            # `registry:lib`, or carry a different `name` entirely, and pass
            # both the schema and the content comparison while contradicting
            # the item it claims to be (judge fault injection, 2026-09-18).
            # The schema says "is this a registry item"; only this says "is
            # it THIS registry item".
            if data.get("name") != it["name"]:
                stale.append(f"{it['name']}: published name is {data.get('name')!r}")
            if data.get("type") != it["type"]:
                stale.append(f"{it['name']}: published type {data.get('type')!r} != declared {it['type']!r}")
            declared_types = {f["target"]: f["type"] for f in it["files"]}
            for f in data.get("files", []):
                target = f.get("target") or f.get("path")
                if target in declared_types and f.get("type") != declared_types[target]:
                    stale.append(
                        f"{it['name']}: {target} published as {f.get('type')!r} != declared "
                        f"{declared_types[target]!r}"
                    )

            declared_deps = sorted(it.get("dependencies", []))
            if sorted(data.get("dependencies", [])) != declared_deps:
                stale.append(
                    f"{it['name']}: published dependencies {data.get('dependencies', [])} "
                    f"!= declared {declared_deps}"
                )

            for f in it["files"]:
                src = REPO / f["path"]
                if not src.is_file():
                    continue
                shipped = by_target.get(f["target"])
                if shipped is None:
                    stale.append(f"{it['name']}: {f['target']} missing from the published payload")
                elif shipped != src.read_text():
                    stale.append(f"{it['name']}: {f['target']} published content differs from source")
    # Two more ways a publication can be wrong that per-item checks cannot see.
    #
    # ORPHANS: a payload whose item was removed from registry.json keeps being
    # SERVED — `npx shadcn add .../old-item` still installs it, from bytes
    # nothing in this repo describes any more. Iterating items can never find
    # a file no item names, so the directory is enumerated too.
    #
    # registryDependencies: these are the OTHER registry items shadcn pulls in
    # transitively. Only npm `dependencies` were compared, so an undeclared
    # one in a payload went unnoticed — and this repo's items are deliberately
    # self-contained (no registryDependencies between bbox items; a shared
    # file is re-listed with its own target instead), so ANY value here is a
    # drift from that design, not merely a mismatch.
    # Both fault-injected by a judge, 2026-09-18.
    known = {f"{it['name']}.json" for it in reg["items"]} | {"registry.json", "index.json"}
    for orphan in sorted(p.name for p in published.glob("*.json") if p.name not in known):
        stale.append(f"published payload {orphan} has no item in registry.json — it would still install")
    for it in reg["items"]:
        payload = published / f"{it['name']}.json"
        if not payload.is_file():
            continue
        declared = sorted(it.get("registryDependencies", []))
        served = sorted(json.loads(payload.read_text()).get("registryDependencies", []))
        if served != declared:
            stale.append(f"{it['name']}: published registryDependencies {served} != declared {declared}")

    if stale:
        print("\nPUBLISHED PAYLOADS ARE STALE — re-run `npx shadcn@latest build`:")
        for line in sorted(set(stale))[:20]:
            print("  " + line)
        if len(set(stale)) > 20:
            print(f"  … and {len(set(stale)) - 20} more")
        raise SystemExit(1)
    print("published payloads match source")

    # And the payloads must satisfy shadcn's OWN schema, not merely the
    # fields this script thought to compare. Everything above is a
    # re-derivation of the format, and a re-derivation is only as good as its
    # author's memory: it approved a payload with `name` deleted and with a
    # corrupted item `type`, both of which shadcn rejects outright (judge
    # fault injection, 2026-09-18). Delegating to the installed schema makes
    # this an independent oracle instead of a second opinion from the same
    # source as the mistake.
    schema_check = subprocess.run(
        ["node", str(HERE / "validate_registry_payloads.mjs"), str(published)],
        cwd=REPO, capture_output=True, text=True,
    )
    print((schema_check.stdout or schema_check.stderr).strip())
    if schema_check.returncode != 0:
        raise SystemExit(1)


def main() -> None:
    check = "--check" in sys.argv
    reg = json.loads(REGISTRY.read_text())
    existing = {it["name"]: it for it in reg["items"]}
    order = [it["name"] for it in reg["items"]]

    built = []
    for name, entry, title, desc in ITEMS:
        item = build_item(name, entry, title, desc)
        built.append(item)
        if name in existing:
            existing[name] = item
        else:
            existing[name] = item
            order.append(name)

    for name, entry in TRUNK_ITEMS:
        prev = existing[name]
        existing[name] = build_item(name, entry, prev["title"], prev["description"])
        added = len(existing[name]["files"]) - len(prev["files"])
        if added:
            print(f"  repaired trunk item {name}: {added:+d} files")

    # WHY the two legacy items get rebuilt here rather than left alone: the
    # sibling-rule assertion below found them LIVE-broken. `port.tsx` imports
    # ./appearance, ./port.fields, ./port.presets and ./port.layout and the
    # item shipped none of the four; `block.tsx` imports ./pill and
    # ./block.fields and shipped neither. So `npx shadcn@latest add
    # zacharyyamaoka/bbox-ui/port` — the install README and CLAUDE.md both
    # advertise as working today — lands a file with four unresolvable
    # imports. That is the exact "installs clean, then fails to compile"
    # failure this repo already shipped once. Rebuilding their file lists from
    # the real import graph is a registry.json fix only; `packages/bbox-ui` is
    # frozen v1 and is NOT edited here.
    for name, entry, title, desc in LEGACY_ITEMS:
        prev = existing[name]
        existing[name] = build_item(name, entry, title, desc, root=LEGACY_SRC)
        added = len(existing[name]["files"]) - len(prev["files"])
        if added:
            print(f"  repaired legacy item {name}: +{added} missing files")

    # WHY retirement is explicit: this script MERGES into registry.json (it
    # keeps hand-authored items it does not build), so renaming an item in
    # ITEMS used to leave the old entry behind, pointing at files that no
    # longer exist. `--check` still said "up to date" and only
    # `npx shadcn build` failed (2026-09-22, `region` -> `block-region`).
    for name in RETIRED_ITEMS:
        if name in existing:
            del existing[name]
            order.remove(name)
            print(f"  retired item {name}")

    reg["items"] = [existing[n] for n in order]

    # Every file every item ships must exist. This is the same failure as the
    # stale entry above, caught on ANY item, generated or hand-authored,
    # before shadcn does.
    missing = [(it["name"], f["path"]) for it in reg["items"] for f in it["files"] if not (REPO / f["path"]).is_file()]
    if missing:
        for name, path in missing:
            print(f"  MISSING  {name}: {path}")
        raise SystemExit("registry items list files that do not exist — rename or retire them")

    out = json.dumps(reg, indent=2) + "\n"

    # WHY --check no longer returns here: it used to, which meant the freshness
    # test PASSED and the two safety assertions below — the sibling rule and
    # the unpublished-dependency check, the whole reason this generator exists
    # — never ran at all. A stale-but-broken registry and a fresh-but-broken
    # one both reported "up to date". Caught by an independent judge, 2026-09-18.
    # Freshness is the cheapest of the three checks, not a substitute for them.
    if check:
        if out != REGISTRY.read_text():
            print("registry.json is STALE — re-run without --check")
            raise SystemExit(1)
        print("registry.json is up to date; verifying its contents too")
    else:
        REGISTRY.write_text(out)
        print(f"registry.json: {len(reg['items'])} items ({len(built)} from the menu kit)")
        for it in built:
            n_comp = sum(1 for f in it["files"] if f["type"] == "registry:component")
            print(f"  {it['name']:<18} {len(it['files']):>2} files ({n_comp} components)  "
                  f"deps: {', '.join(it['dependencies']) or '—'}")

    # The sibling rule, asserted rather than trusted: every relative import in
    # every shipped file must resolve against its own TARGET layout, not its
    # source layout. This is the check that would have caught the TS2307 the
    # repo already shipped once.
    bad = []
    for it in reg["items"]:
        targets = {f["target"] for f in it["files"]}
        for f in it["files"]:
            src_file = REPO / f["path"]
            if src_file.suffix == ".css" or not src_file.is_file():
                continue
            here = pathlib.PurePosixPath(f["target"]).parent
            for spec in set(IMPORT_RE.findall(src_file.read_text())):
                if not spec.startswith("."):
                    continue
                want = str((here / spec).as_posix())
                want = re.sub(r"/\./", "/", want)
                # normalise ".." segments
                parts: list[str] = []
                for p in want.split("/"):
                    if p == "..":
                        parts and parts.pop()
                    elif p not in (".", ""):
                        parts.append(p)
                want = "/".join(parts)
                if not any(t == want or t.rsplit(".", 1)[0] == want for t in targets):
                    bad.append(f"{it['name']}: {f['target']} imports '{spec}' "
                               f"-> no file lands at '{want}'")
    if bad:
        print("\nSIBLING RULE VIOLATIONS — this registry would install and then fail to compile:")
        for b in bad:
            print("  " + b)
        raise SystemExit(1)
    print("\nsibling rule: every relative import resolves against its target layout")

    # The OTHER way an item can be un-consumable, and the one the sibling rule
    # cannot see: a dependency nobody can install. Every `packages/*` here is
    # `private: true`, so an item listing one is dead on arrival — `npm install`
    # 404s before a single file is written. Measured 2026-09-18 against a real
    # throwaway project: `shadcn add .../port.json` fails on
    # `@bbox-ui/schema@*`, "not found".
    #
    # Trunk items HARD FAIL, because they are the lineage under active work and
    # a private import there is a mistake to fix now. The two legacy items only
    # WARN: `packages/bbox-ui` is frozen v1, its dependency on `@bbox-ui/schema`
    # is structural, and un-breaking it means regenerating the package from the
    # trunk — P7-class work, not a drive-by. Warning keeps the fact visible on
    # every run instead of letting it go quiet again.
    # THIRD failure mode, and the one that shipped: `npx shadcn@latest build`
    # embeds each file's CONTENT into public/r/<item>.json. So the published
    # payload is a SNAPSHOT — edit a source file afterwards and the registry
    # keeps serving the old bytes, silently. Measured 2026-09-18: eight items
    # were serving pre-fix source, so a consumer installing `inline-rename`
    # got the version that silently ate line breaks and one installing
    # `tool-dock` got the one that passed Object.prototype to onArm, while
    # every source-level check here passed. Freshness of registry.json says
    # nothing about freshness of what is actually served.
    # WHY only in --check: regenerating registry.json necessarily leaves the
    # published payloads stale until `npx shadcn@latest build` re-embeds
    # them, so running this on the WRITE path made the documented sequence
    # (`generate && build`) impossible — the generator exited 1 for a
    # condition its own next step fixes. --check is where "is what we serve
    # current?" is the question being asked.
    # WHY the payload block is guarded rather than the function returning
    # here: the early `return` that used to sit at this line skipped
    # EVERYTHING below it, including the unpublished-dependency guard — so
    # generation silently accepted an item depending on a private package,
    # which the same script refuses at 565fb78. A judge injected an
    # `@bbox-ui/schema` import and watched exit 0 (2026-09-18). Skipping one
    # check must never mean skipping the rest.
    if check:
        _check_published_payloads(reg)
    else:
        print("\n(payload freshness is checked by --check; run `npx shadcn@latest build` next)")

    trunk_names = {name for name, *_ in ITEMS}
    legacy_names = {name for name, *_ in LEGACY_ITEMS}
    hard, soft = [], []
    for it in reg["items"]:
        private = [d for d in it.get("dependencies", []) if d.startswith("@bbox-ui/")]
        if not private:
            continue
        (hard if it["name"] in trunk_names else soft).append((it["name"], private))
    for name, private in soft:
        where = "legacy (frozen v1)" if name in legacy_names else "pre-existing"
        print(f"  WARNING  {name} [{where}] depends on unpublished "
              f"{', '.join(private)} — `shadcn add` will 404 before writing a file")
    if hard:
        print("\nUNINSTALLABLE TRUNK ITEMS — every packages/* here is private:true:")
        for name, private in hard:
            print(f"  {name} -> {', '.join(private)}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
