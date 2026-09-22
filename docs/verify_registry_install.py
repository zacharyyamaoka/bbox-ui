#!/usr/bin/env python3
"""Install the built registry into a throwaway project and type-check it.

    npx shadcn@latest build                      # refresh public/r/*.json first
    python3 docs/verify_registry_install.py --dir /tmp/somewhere [item ...]

WHY this exists: CLAUDE.md, "The registry is the product" — `npx shadcn add`
exiting 0 proves nothing; this repo already shipped a registry that installed
cleanly and then failed to compile. The only honest check is the consumer's:
copy every item into a fresh project exactly as shadcn does, then run `tsc`.
With no item names it installs every item except the four CLAUDE.md records as
uninstallable by construction (they import unpublished `@bbox-ui/*` packages).
"""
from __future__ import annotations

import json
import pathlib
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parents[1]
BUILT = REPO / "public/r"
UNINSTALLABLE = {"port", "block", "block-node-reactflow", "block-shape-tldraw"}

args = sys.argv[1:]
if "--dir" not in args:
    raise SystemExit("usage: verify_registry_install.py --dir <empty scratch dir> [item ...]")
at = args.index("--dir")
project = pathlib.Path(args[at + 1]).resolve()
names = args[:at] + args[at + 2:]

registry = json.loads((REPO / "registry.json").read_text())
items = names or [it["name"] for it in registry["items"] if it["name"] not in UNINSTALLABLE]

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
