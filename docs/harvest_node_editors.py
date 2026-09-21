#!/usr/bin/env python3
"""Harvest real node-editor / graph-editor repos and READ their folder layouts.

Zach: "I think its really cheap to just like look at the source code and just see
the folder layout... I would expect to a report with like 50-100 examples, and
thoose examples then goruped together by their philsophy... what has the indstury
learned? ... lets learn from others scar tissue and save our selves a refactor."

WHY the GitHub trees API and not cloning: we need the SHAPE of ~100 repos, not
their contents. `git/trees?recursive=1` returns the whole path list in one
authenticated call, so a repo costs 2 calls instead of a multi-megabyte clone.
Rate limit is 5,000/hr authenticated via gh, so ~100 repos is ~4% of budget.

Seeds come from Zach's own project page first (vault-first rule), then GitHub
search expands to the wider body of 2D node editors.

  python3 docs/harvest_node_editors.py --harvest    # network, writes the cache
  python3 docs/harvest_node_editors.py --classify   # offline, reads the cache
"""
from __future__ import annotations

import argparse
import json
import pathlib
import subprocess
import sys
import time

CACHE = pathlib.Path(__file__).parent / "node-editor-corpus.json"

# --- seeds: every GitHub repo Zach already named on his own project page -----
FROM_ZACH = [
    "xyflow/xyflow", "clientio/joint", "comfy-org/comfyui", "excalidraw/excalidraw",
    "jagenjo/litegraph.js", "langflow-ai/langflow", "newcat/baklavajs",
    "tldraw/tldraw", "iVis-at-Bilkent/cytoscape.js-expand-collapse",
    "Aksem/libavoid-js", "maxGraph/maxGraph",
]

# --- the wider body, by category. Named explicitly so the corpus is auditable
#     rather than whatever search happened to return today.
KNOWN = [
    # graph / diagram engines
    "maxGraph/maxGraph", "jgraph/drawio", "cytoscape/cytoscape.js", "dagrejs/dagre",
    "dagrejs/dagre-d3", "eclipse-elk/elk", "kieler/elkjs", "vasturiano/force-graph",
    "anvaka/ngraph", "d3/d3-hierarchy", "erikbrinkman/d3-dag", "magjac/d3-graphviz",
    "mdaines/viz.js", "hpcc-systems/hpcc-js-wasm",
    # node editors (JS/TS)
    "retejs/rete", "newcat/baklavajs", "jagenjo/litegraph.js", "wbkd/react-flow",
    "Siumauricio/rete-studio", "nodl-app/nodl", "paolo-rechia/flume",
    "chrvadala/react-svg-pan-zoom", "projectstorm/react-diagrams",
    "sequential-workflow-designer/sequential-workflow-designer",
    "bpmn-io/bpmn-js", "bpmn-io/diagram-js", "GoogleChromeLabs/comlink",
    # AI / ML node UIs
    "comfyanonymous/ComfyUI", "comfy-org/litegraph.js", "langflow-ai/langflow",
    "FlowiseAI/Flowise", "logspace-ai/langflow", "PrefectHQ/prefect",
    "apache/airflow", "kestra-io/kestra", "n8n-io/n8n", "windmill-labs/windmill",
    "activepieces/activepieces", "automatisch/automatisch", "Kozea/pygal",
    # whiteboard / canvas
    "excalidraw/excalidraw", "tldraw/tldraw", "konvajs/konva", "fabricjs/fabric.js",
    "BoardOS/whiteboard", "lukasbach/react-complex-tree",
    # game / shader / audio node editors
    "Nadrin/PBR", "MrKevinWeiss/nodegraph", "thomasloven/hass-config",
    # python node editors
    "jchanvfx/NodeGraphQt", "Kanaries/pygwalker", "pyqtgraph/pyqtgraph",
    "wxWidgets/wxWidgets", "openai/openai-python",
    # rust / cpp node editors
    "setzer22/egui_node_graph", "Nelarius/imnodes", "thedmd/imgui-node-editor",
    "ocornut/imgui", "emilk/egui",
    # visual programming / low-code
    "blockly/blockly", "google/blockly-samples", "scratchfoundation/scratch-blocks",
    "NodeBB/NodeBB", "appsmithorg/appsmith", "ToolJet/ToolJet", "budibase/budibase",
    "nocodb/nocodb", "baserow/baserow",
    # UI kits that ship a registry (the distribution model bbox-ui uses)
    "shadcn-ui/ui", "radix-ui/primitives", "ariakit/ariakit", "chakra-ui/chakra-ui",
    "mui/material-ui", "mantinedev/mantine", "tailwindlabs/headlessui",
    "adobe/react-spectrum", "microsoft/fluentui", "primefaces/primereact",
    # editors / IDE-shaped, for the contribution-point comparison
    "microsoft/vscode", "obsidianmd/obsidian-releases", "codemirror/dev",
    "ProseMirror/prosemirror", "ueberdosis/tiptap", "outline/outline",
]

SEARCHES = [
    "topic:node-editor", "topic:node-based", "topic:flowchart", "topic:graph-editor",
    "topic:diagram-editor", "topic:workflow-engine stars:>2000",
    "topic:visual-programming", "topic:dataflow", "node editor canvas in:name,description stars:>800",
    "flow editor react in:name,description stars:>800",
]


def gh(endpoint: str, jq: str | None = None) -> str | None:
    cmd = ["gh", "api", endpoint]
    if jq:
        cmd += ["--jq", jq]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        return r.stdout.strip() if r.returncode == 0 else None
    except Exception:
        return None


def search(query: str, limit: int = 30) -> list[str]:
    out = gh(f"search/repositories?q={query.replace(' ', '+')}&sort=stars&per_page={limit}",
             ".items[].full_name")
    return out.splitlines() if out else []


def repo_meta(full: str) -> dict | None:
    out = gh(f"repos/{full}",
             '{name:.full_name,stars:.stargazers_count,created:.created_at,'
             'pushed:.pushed_at,lang:.language,archived:.archived,desc:.description,'
             'branch:.default_branch,license:.license.spdx_id}')
    if not out:
        return None
    try:
        return json.loads(out)
    except Exception:
        return None


def repo_tree(full: str, branch: str) -> list[str] | None:
    """Full recursive path list. One call. Truncated on giant repos, which is fine
    — we only read the first two levels anyway."""
    out = gh(f"repos/{full}/git/trees/{branch}?recursive=1", ".tree[].path")
    return out.splitlines() if out else None


def harvest() -> None:
    names: list[str] = []
    seen: set[str] = set()

    def add(n: str) -> None:
        k = n.lower()
        if k not in seen:
            seen.add(k)
            names.append(n)

    for n in FROM_ZACH:
        add(n)
    for n in KNOWN:
        add(n)
    print(f"seeded {len(names)} from Zach's page + known corpus", flush=True)

    for q in SEARCHES:
        found = search(q)
        for n in found:
            add(n)
        print(f"  search {q!r:52} +{len(found):3d}  total {len(names)}", flush=True)
        time.sleep(2)

    print(f"\nfetching metadata + trees for {len(names)} repos\n", flush=True)
    corpus = []
    for i, full in enumerate(names, 1):
        meta = repo_meta(full)
        if not meta or not meta.get("name"):
            print(f"  {i:3d}/{len(names)} {full:46} SKIP (no metadata)", flush=True)
            continue
        tree = repo_tree(meta["name"], meta.get("branch") or "main")
        if tree is None:
            print(f"  {i:3d}/{len(names)} {full:46} SKIP (no tree)", flush=True)
            continue
        meta["paths"] = tree
        corpus.append(meta)
        print(f"  {i:3d}/{len(names)} {meta['name']:46} {meta['stars']:>7} ★  "
              f"{len(tree):>6} paths", flush=True)

    CACHE.write_text(json.dumps(corpus, indent=1), encoding="utf-8")
    print(f"\nwrote {CACHE} — {len(corpus)} repos", flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--harvest", action="store_true")
    a = ap.parse_args()
    if a.harvest:
        harvest()
    else:
        print(__doc__)
        sys.exit(0)
