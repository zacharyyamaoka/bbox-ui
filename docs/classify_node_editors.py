#!/usr/bin/env python3
"""Classify the harvested corpus by FOLDER PHILOSOPHY, and answer Zach's question
empirically: inside a components/ directory, does the industry use one file per
component or one folder per component?

Reads docs/node-editor-corpus.json (written by harvest_node_editors.py).
Writes docs/node-editor-findings.json for the report builder.

WHY classify from paths rather than reading code: the question is about SHAPE.
A repo's top two directory levels are the whole answer, and they are the one
thing a tree listing gives perfectly.

Every repo gets exactly one PRIMARY philosophy (the strongest signal) and any
number of secondary traits, because real repos mix.
"""
from __future__ import annotations

import collections
import json
import pathlib
import re

HERE = pathlib.Path(__file__).parent
CACHE = HERE / "node-editor-corpus.json"
OUT = HERE / "node-editor-findings.json"

# Directory names that mean "split by artifact TYPE" rather than by domain.
TYPE_DIRS = {
    "components", "hooks", "utils", "util", "helpers", "types", "constants",
    "styles", "assets", "services", "models", "views", "controllers", "store",
    "stores", "actions", "reducers", "selectors", "api", "lib", "common",
}
# Directory names that mean "split by architectural LAYER".
LAYER_DIRS = {
    "core", "model", "view", "render", "renderer", "engine", "runtime", "kernel",
    "domain", "infra", "infrastructure", "adapter", "adapters", "backend",
    "frontend", "ui", "shared", "platform", "host", "hosts", "scene", "graph",
}
# Names that mean the repo ships extension points.
PLUGIN_DIRS = {"plugins", "plugin", "extensions", "extension", "contrib",
               "addons", "addon", "integrations", "nodes"}



# --- domain tagging -------------------------------------------------------
# WHY: the corpus deliberately includes UI kits and text editors as a control
# group. Mixing them with real node editors would make the headline percentages
# meaningless, so every repo carries a domain and the report can filter.
NODE_EDITOR = {
 "xyflow/xyflow","wbkd/react-flow","retejs/rete","newcat/baklavajs","jagenjo/litegraph.js",
 "comfyanonymous/comfyui","comfy-org/litegraph.js","langflow-ai/langflow","logspace-ai/langflow",
 "flowiseai/flowise","projectstorm/react-diagrams","nodl-app/nodl","paolo-rechia/flume",
 "siumauricio/rete-studio","jchanvfx/nodegraphqt","setzer22/egui_node_graph","nelarius/imnodes",
 "thedmd/imgui-node-editor","sequential-workflow-designer/sequential-workflow-designer",
}
GRAPH_ENGINE = {
 "maxgraph/maxgraph","jgraph/drawio","cytoscape/cytoscape.js","dagrejs/dagre","dagrejs/dagre-d3",
 "eclipse-elk/elk","kieler/elkjs","vasturiano/force-graph","anvaka/ngraph","d3/d3-hierarchy",
 "erikbrinkman/d3-dag","magjac/d3-graphviz","mdaines/viz.js","clientio/joint","bpmn-io/bpmn-js",
 "bpmn-io/diagram-js","ivis-at-bilkent/cytoscape.js-expand-collapse","aksem/libavoid-js",
 "hpcc-systems/hpcc-js-wasm",
}
WHITEBOARD = {"excalidraw/excalidraw","tldraw/tldraw","konvajs/konva","fabricjs/fabric.js"}
UI_KIT = {
 "shadcn-ui/ui","radix-ui/primitives","ariakit/ariakit","chakra-ui/chakra-ui","mui/material-ui",
 "mantinedev/mantine","tailwindlabs/headlessui","adobe/react-spectrum","microsoft/fluentui",
 "primefaces/primereact",
}
WORKFLOW = {
 "n8n-io/n8n","windmill-labs/windmill","activepieces/activepieces","automatisch/automatisch",
 "prefecthq/prefect","apache/airflow","kestra-io/kestra","appsmithorg/appsmith","tooljet/tooljet",
 "budibase/budibase",
}
TEXT_EDITOR = {"microsoft/vscode","codemirror/dev","prosemirror/prosemirror","ueberdosis/tiptap",
 "outline/outline","blockly/blockly","google/blockly-samples","scratchfoundation/scratch-blocks"}

DOMAIN_WORDS = [
 ("node editor", ("node editor","node-based","node graph","nodegraph","visual scripting",
                  "flow editor","node-red","dataflow")),
 ("graph engine", ("graph librar","graph layout","diagram","layout algorithm","graph theory",
                   "graph visual","flowchart")),
 ("whiteboard", ("whiteboard","canvas librar","drawing")),
 ("workflow tool", ("workflow","automation","low-code","no-code","pipeline")),
 ("ui kit", ("component librar","ui librar","design system","components for react",
             "accessible component")),
]

def domain_of(repo: dict) -> str:
    n = repo["name"].lower()
    for s, lab in ((NODE_EDITOR,"node editor"),(GRAPH_ENGINE,"graph engine"),
                   (WHITEBOARD,"whiteboard"),(UI_KIT,"ui kit"),(WORKFLOW,"workflow tool"),
                   (TEXT_EDITOR,"text/block editor")):
        if n in s: return lab
    d = ((repo.get("desc") or "") + " " + n).lower()
    for lab, words in DOMAIN_WORDS:
        if any(w in d for w in words): return lab
    return "other"


def top_levels(paths: list[str]) -> collections.Counter:
    """Top-level directory names."""
    c = collections.Counter()
    for p in paths:
        if "/" in p:
            c[p.split("/", 1)[0]] += 1
    return c


def second_levels(paths: list[str], parent: str) -> collections.Counter:
    c = collections.Counter()
    pre = parent + "/"
    for p in paths:
        if p.startswith(pre):
            rest = p[len(pre):]
            if "/" in rest:
                c[rest.split("/", 1)[0]] += 1
    return c


def find_component_dirs(paths: list[str]) -> list[str]:
    """Every directory literally named components/ at any depth."""
    out = set()
    for p in paths:
        parts = p.split("/")
        for i, seg in enumerate(parts[:-1]):
            if seg in ("components", "component"):
                out.add("/".join(parts[: i + 1]))
    return sorted(out)


def component_style(paths: list[str], cdir: str) -> tuple[int, int]:
    """Inside a components dir: (files_directly_in_it, subdirectories).

    One file per component  -> many files, few dirs.
    One folder per component -> few files, many dirs.
    """
    pre = cdir + "/"
    files, dirs = set(), set()
    for p in paths:
        if not p.startswith(pre):
            continue
        rest = p[len(pre):]
        if "/" in rest:
            dirs.add(rest.split("/", 1)[0])
        elif re.search(r"\.(t|j)sx?$|\.vue$|\.svelte$|\.py$", rest):
            # ignore barrels and manifests — they are not components
            if not re.match(r"^(index|types?|utils?|constants?|styles?)\.", rest):
                files.add(rest)
    return len(files), len(dirs)


def classify(repo: dict) -> dict:
    paths = repo["paths"]
    tl = top_levels(paths)
    traits = []

    # --- monorepo?
    pkg_children = second_levels(paths, "packages") or second_levels(paths, "libs")
    is_mono = len(pkg_children) >= 2
    if is_mono:
        traits.append("monorepo")

    # --- where is the source root
    src_root = None
    for cand in ("src", "lib", "source"):
        if tl.get(cand, 0) > 3:
            src_root = cand
            break
    if is_mono and not src_root:
        src_root = "packages"

    inner = second_levels(paths, src_root) if src_root else tl
    inner_names = {k.lower() for k in inner}

    n_type = len(inner_names & TYPE_DIRS)
    n_layer = len(inner_names & LAYER_DIRS)
    n_plugin = len(inner_names & PLUGIN_DIRS)

    if n_plugin:
        traits.append("plugin-host")

    # --- primary philosophy: strongest signal wins, ties broken toward layer
    if is_mono and len(pkg_children) >= 3:
        primary = "monorepo by package"
    elif n_layer >= 2 and n_layer >= n_type:
        primary = "layer-first"
    elif n_type >= 2:
        primary = "type-first"
    elif src_root and len(inner_names) <= 2:
        primary = "flat source"
    elif len(inner_names) >= 6:
        primary = "domain/feature-first"
    else:
        primary = "flat source"

    # --- the question Zach actually asked
    comp_style, comp_files, comp_dirs, comp_dir = None, 0, 0, None
    for cdir in find_component_dirs(paths):
        f, d = component_style(paths, cdir)
        if f + d < 4:
            continue                      # too small to be evidence
        if f + d > comp_files + comp_dirs:
            comp_files, comp_dirs, comp_dir = f, d, cdir
    if comp_files or comp_dirs:
        total = comp_files + comp_dirs
        if comp_dirs / total >= 0.7:
            comp_style = "folder per component"
        elif comp_files / total >= 0.7:
            comp_style = "file per component"
        else:
            comp_style = "mixed"

    return {
        "domain": domain_of(repo),
        "name": repo["name"], "stars": repo.get("stars", 0),
        "created": (repo.get("created") or "")[:4],
        "pushed": (repo.get("pushed") or "")[:4],
        "lang": repo.get("lang"), "archived": repo.get("archived", False),
        "license": repo.get("license"), "desc": (repo.get("desc") or "")[:180],
        "n_paths": len(paths),
        "src_root": src_root,
        "top": [k for k, _ in tl.most_common(12)],
        "inner": [k for k, _ in inner.most_common(14)],
        "primary": primary, "traits": traits,
        "component_dir": comp_dir,
        "component_files": comp_files, "component_dirs": comp_dirs,
        "component_style": comp_style,
    }


def main() -> None:
    corpus = json.loads(CACHE.read_text(encoding="utf-8"))
    rows = [classify(r) for r in corpus if r.get("paths")]
    rows.sort(key=lambda r: -r["stars"])

    doms = collections.Counter(r["domain"] for r in rows)
    CORE = {"node editor","graph engine","whiteboard"}
    core = [r for r in rows if r["domain"] in CORE]
    phil = collections.Counter(r["primary"] for r in rows)
    phil_core = collections.Counter(r["primary"] for r in core)
    styles_core = collections.Counter(r["component_style"] for r in core if r["component_style"])
    styles = collections.Counter(r["component_style"] for r in rows if r["component_style"])

    # timeline: philosophy share by repo creation year
    by_year = collections.defaultdict(collections.Counter)
    for r in rows:
        if r["created"]:
            by_year[r["created"]][r["primary"]] += 1

    # component style by year, the sharper trend
    style_year = collections.defaultdict(collections.Counter)
    for r in rows:
        if r["created"] and r["component_style"]:
            style_year[r["created"]][r["component_style"]] += 1

    findings = {
        "n_repos": len(rows),
        "n_core": len(core),
        "domains": dict(doms.most_common()),
        "philosophy_core": dict(phil_core.most_common()),
        "component_style_core": dict(styles_core.most_common()),
        "philosophy": dict(phil.most_common()),
        "component_style": dict(styles.most_common()),
        "by_year": {y: dict(c) for y, c in sorted(by_year.items())},
        "style_by_year": {y: dict(c) for y, c in sorted(style_year.items())},
        "repos": rows,
    }
    OUT.write_text(json.dumps(findings, indent=1), encoding="utf-8")

    print(f"{len(rows)} repos classified  ({len(core)} in the core domains)\n")
    print("DOMAIN MIX")
    for k, v in doms.most_common(): print(f"  {v:4d}  {k}")
    print()
    print("PRIMARY PHILOSOPHY")
    for k, v in phil.most_common():
        print(f"  {v:4d}  {v/len(rows)*100:5.1f}%  {k}")
    n_cs = sum(styles.values())
    print(f"\nCOMPONENTS DIR STYLE  (of {n_cs} repos that have one big enough to judge)")
    for k, v in styles.most_common():
        print(f"  {v:4d}  {v/n_cs*100:5.1f}%  {k}")
    print("\nBY YEAR CREATED")
    for y, c in sorted(by_year.items()):
        if int(y) >= 2013:
            tot = sum(c.values())
            top = ", ".join(f"{k} {v}" for k, v in c.most_common(3))
            print(f"  {y}  n={tot:3d}   {top}")


if __name__ == "__main__":
    main()
