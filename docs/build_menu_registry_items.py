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
    ("menu-toolbar", "components/toolbar.tsx", "Menu Toolbar",
     "Roving-focus bar container over Base UI's Toolbar — the strip the floating pill, the tool "
     "dock, the chrome bar and the status strip all sit in. Consumes the trunk's ambient size cascade."),
    ("split-button", "components/splitButton.tsx", "Split Button",
     "One primary action plus a chevron opening its alternates. Backs the tool dock's family cells "
     "and the draft bar's Merge control."),
    ("inline-rename", "components/inlineRename.tsx", "Inline Rename",
     "A text field that commits on Enter or blur and reverts on Escape. Controlled only — the host "
     "owns the keybinding that starts a rename."),
    ("control-registry", "components/controlRegistry.ts", "Control Registry",
     "Declare a value-bound control once, then compose it into many surfaces by recipe. A factory, "
     "so palettes and vocabularies are injected rather than imported."),
    ("control-strip", "components/controlStrip.tsx", "Control Strip",
     "The one renderer for every registered control: trigger shape chosen by `trigger`, panel shape "
     "by `layout`, value preview by `glyph` family — all lookups, never per-kind conditionals."),
    ("floating-toolbar", "components/floatingToolbar.tsx", "Floating Toolbar",
     "The positioned shell a control strip sits in, over FigJam's above/pinned/below placement "
     "policy. The host measures; the component never does."),
    ("tool-dock", "components/toolDock.tsx", "Tool Dock",
     "A bottom tool bar whose families are declared as data, each remembering its last-used member."),
    ("chrome-bar", "components/chromeBar.tsx", "Chrome Bar",
     "Burger menu, back/forward, home and an eliding breadcrumb with a status dot — the editor's "
     "top-left identity strip."),
    ("branch-chip", "components/branchChip.tsx", "Branch Chip",
     "The branch or draft selector: current name, a count badge, and a popover of alternates with "
     "inline rename."),
    ("panel-shell", "components/panelShell.tsx", "Panel Shell",
     "The side-panel frame — eyebrow, title, close, scrollable body. The shell is the component; "
     "each panel is one instance of it."),
    ("frames-panel", "components/framesPanel.tsx", "Frames Panel",
     "Reorderable board-navigation rows with host-rendered previews, plus a save-this-view row."),
    ("problems-panel", "components/problemsPanel.tsx", "Problems Panel",
     "A diagnostics list in VS Code's shape: severity counts, a severity filter, grouped rows "
     "carrying a rule code. Severities are config, not a hardcoded three."),
    ("status-strip", "components/statusStrip.tsx", "Status Strip",
     "The corner cluster of panel launchers with badges and a zoom readout."),
    ("history-list", "components/historyList.tsx", "History List",
     "A version rail where selecting an entry sets it as the BEFORE side of a comparison."),
    ("property-table", "components/propertyTable.tsx", "Property Table",
     "Per-element and flat-table views of a property diff, with optional Figma-style word-level "
     "highlighting."),
    ("code-view", "components/codeView.tsx", "Code View",
     "A line-diff view of two text versions."),
    ("compare-review", "components/compareReview.tsx", "Compare Review",
     "The whole diff-review surface — history rail, two version panes, a properties/code rail, and "
     "side-by-side or overlay. Headless: the host supplies the modal and both renderers."),
    ("draft-bar", "components/draftBar.tsx", "Draft Bar",
     "The draft-mode strip: exit, draft name, and a change-gated compare/merge pair."),
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


def target_for(f: pathlib.Path) -> str:
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
        if rel.parts[0] == "components":
            return "components/bbox/" + "/".join(rel.parts[1:])
        if rel.parts[0] == "lib":
            return "components/lib/" + "/".join(rel.parts[1:])
        raise SystemExit(f"unexpected trunk location, no target rule: {rel}")
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
    return "registry:component" if f.relative_to(SRC).parts[0] == "components" else "registry:lib"


def build_item(name: str, entry_rel: str, title: str, desc: str,
               root: pathlib.Path = SRC) -> dict:
    entry = root / entry_rel
    if not entry.is_file():
        raise SystemExit(f"{name}: entry does not exist: {entry}")
    files, deps = walk(entry)
    files = {f for f in files if ".test." not in f.name and ".stories." not in f.name}
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
            {"path": str(f.relative_to(REPO)), "type": file_type(f), "target": target_for(f)}
            for f in sorted(files, key=lambda p: str(p))
        ],
        "dependencies": sorted(deps),
    }


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

    reg["items"] = [existing[n] for n in order]
    out = json.dumps(reg, indent=2) + "\n"

    if check:
        if out != REGISTRY.read_text():
            print("registry.json is STALE — re-run without --check")
            raise SystemExit(1)
        print("registry.json is up to date")
        return

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
