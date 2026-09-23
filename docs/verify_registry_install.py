#!/usr/bin/env python3
"""Install the built registry into a throwaway project and type-check it.

    npx shadcn@latest build                      # refresh public/r/*.json first
    python3 docs/verify_registry_install.py --dir /tmp/somewhere [item ...]

WHY this exists: CLAUDE.md, "The registry is the product" — `npx shadcn add`
exiting 0 proves nothing; this repo already shipped a registry that installed
cleanly and then failed to compile. The only honest check is the consumer's:
copy every item into a fresh project exactly as shadcn does, then run `tsc`.
With no item names it installs every item except the ones that are uninstallable
by construction — they import an unpublished, `private: true` `@bbox-ui/*`
package, so `npm install` 404s before shadcn writes a single file. That set is
DERIVED from the built items and asserted against the pin below, so an item that
newly acquires such an import fails this gate by name instead of silently
joining the skip list.
"""
from __future__ import annotations

import json
import pathlib
import re
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parents[1]
BUILT = REPO / "public/r"
# WHY pinned rather than merely derived: the previous spelling was a hand-written
# set, and a hand-written set goes stale the moment an item picks up a new
# import — the gate would then skip the newly-broken item and report green.
# Deriving alone has the opposite failure: it would make ANY new breakage
# invisible. So derive, then compare against what CLAUDE.md records, and fail on
# the delta in either direction.
#   port, block                              — packages/bbox-ui (frozen v1) -> @bbox-ui/schema
#   block-node-reactflow, block-shape-tldraw — the two adapters -> @bbox-ui/core
#   block-region, labeled-group              — blockRegion.tsx -> ./glyph -> @bbox-ui/glyph-content,
#                                              added by 069e418 (BlockRegion Port/Expanded/Expanded
#                                              Opaque), which put a Glyph in the corner tab.
EXPECTED_UNINSTALLABLE = {
    "port",
    "block",
    "block-node-reactflow",
    "block-shape-tldraw",
    "block-region",
    "labeled-group",
}

args = sys.argv[1:]
if "--dir" not in args:
    raise SystemExit("usage: verify_registry_install.py --dir <empty scratch dir> [item ...]")
at = args.index("--dir")
project = pathlib.Path(args[at + 1]).resolve()
names = args[:at] + args[at + 2:]

registry = json.loads((REPO / "registry.json").read_text())


# WHY read the SHIPPED CONTENT and not just `dependencies`: the two adapters
# import `@bbox-ui/core` in their source and never declare it, so a check that
# trusts the manifest calls them installable and then watches npm 404. What
# breaks a consumer is the import specifier shadcn copies verbatim, so that is
# what this reads.
# Line-anchored on purpose: `skin.css` documents the token import in a doc
# comment (`*   @import "@bbox-ui/core/skin.css";`), which is prose, not a
# dependency. A statement-shaped match over TS sources only keeps prose out.
BBOX_IMPORT = re.compile(
    r"""^\s*(?:import|export)\b[^;]*?["'](@bbox-ui/[^"']+)["']""", re.MULTILINE
)
CODE_SUFFIXES = (".ts", ".tsx", ".js", ".jsx", ".mts", ".cts")


def unpublished_imports(name: str) -> set[str]:
    built = BUILT / f"{name}.json"
    if not built.is_file():
        return set()
    payload = json.loads(built.read_text())
    found = {d for d in payload.get("dependencies", []) if d.startswith("@bbox-ui/")}
    for f in payload.get("files", []):
        if not f.get("path", "").endswith(CODE_SUFFIXES):
            continue
        found |= {"/".join(m.split("/")[:2]) for m in BBOX_IMPORT.findall(f.get("content", ""))}
    return found


uninstallable = {it["name"] for it in registry["items"] if unpublished_imports(it["name"])}
if not names and uninstallable != EXPECTED_UNINSTALLABLE:
    grew = sorted(uninstallable - EXPECTED_UNINSTALLABLE)
    shrank = sorted(EXPECTED_UNINSTALLABLE - uninstallable)
    raise SystemExit(
        "the uninstallable set moved — registry.json and this pin disagree.\n"
        + (f"  newly uninstallable (an unpublished @bbox-ui/* import crept in): {grew}\n" if grew else "")
        + (f"  no longer uninstallable (drop these from the pin): {shrank}\n" if shrank else "")
        + "Fix the import or update EXPECTED_UNINSTALLABLE and CLAUDE.md together."
    )
items = names or [it["name"] for it in registry["items"] if it["name"] not in uninstallable]

project.mkdir(parents=True, exist_ok=True)
(project / "package.json").write_text(json.dumps({"name": "bbox-registry-check", "private": True, "type": "module"}))
(project / "tsconfig.json").write_text(json.dumps({
    "compilerOptions": {
        "target": "ES2022", "lib": ["ES2022", "DOM", "DOM.Iterable"], "module": "ESNext",
        "moduleResolution": "bundler", "jsx": "react-jsx", "strict": True, "skipLibCheck": True,
        "noEmit": True, "paths": {"@/*": ["./*"]},
        "allowImportingTsExtensions": True, "resolveJsonModule": True, "isolatedModules": True,
    },
    "include": ["components/**/*.ts", "components/**/*.tsx", "lib/**/*.ts", "css.d.ts"],
}, indent=1))
(project / "components.json").write_text(json.dumps({
    "$schema": "https://ui.shadcn.com/schema.json", "style": "new-york", "rsc": False, "tsx": True,
    "tailwind": {"config": "", "css": "app.css", "baseColor": "neutral", "cssVariables": True},
    "aliases": {"components": "@/components", "utils": "@/lib/utils", "ui": "@/components/ui", "lib": "@/lib", "hooks": "@/hooks"},
    "iconLibrary": "lucide",
}, indent=1))
(project / "app.css").write_text('@import "tailwindcss";\n')
# WHY: every real consumer (Vite's `vite/client`, Next's `next-env.d.ts`) declares
# CSS modules; TS 7 rejects a side-effect `import "./x.css"` without one. The
# CSS files themselves must still LAND — `shadcn add` copies them, and a
# missing one would still fail below, since the declaration covers types only.
(project / "css.d.ts").write_text('declare module "*.css";\n')


def run(cmd: list[str]) -> int:
    print("$", " ".join(cmd if len(cmd) < 8 else cmd[:6] + ["…"]), flush=True)
    return subprocess.run(cmd, cwd=project).returncode


paths = [str(BUILT / f"{n}.json") for n in items]
missing = [p for p in paths if not pathlib.Path(p).is_file()]
if missing:
    raise SystemExit(f"not built — run `npx shadcn@latest build` first: {missing}")
if run(["npx", "--yes", "shadcn@latest", "add", *paths, "--yes", "--overwrite"]) != 0:
    raise SystemExit("shadcn add failed")
if run(["npm", "install", "--no-audit", "--no-fund", "react", "react-dom", "@types/react", "@types/react-dom", "typescript"]) != 0:
    raise SystemExit("npm install failed")
code = run(["npx", "tsc", "-p", "tsconfig.json"])
print(f"{len(items)} items installed into {project}; tsc exit {code}")
raise SystemExit(code)
