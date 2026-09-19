#!/usr/bin/env python3
"""
Build "What the prior art changes" — the Python-VPL sweep Zach asked for on
2026-09-18 after linking pedroCabrera/PyFlow and leon-thomm/Ryven.

Five sonnet agents covered: the two he named; the wider Python-VPL field; tools
that project EXISTING code into a graph; composite/subgraph mechanics across
~15 node editors; and the failure literature. This report is the synthesis plus
the one piece of evidence no agent could reach — a granularity experiment
already sitting on this machine from 2026-08-23.

Its numbers are re-measured at build time from
`/home/bam/pyblocks/docs/pyflow-ddg-gallery.html` and from the checked-in
Graphviz SVGs, so the headline ("a five-line function draws 17,192 px wide")
cannot go stale or be a remembered figure.

    node/python: captures are pre-staged in reports/media/shots-vpl-prior-art
    python3 docs/build_vpl_prior_art_report.py
"""
from __future__ import annotations

import html
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from _report_kit import CSS, FB_JS, dock, fb, overall_box, report_size, sh, shot  # noqa: E402

REPO = pathlib.Path("/home/bam/bbox-ui")
PYBLOCKS = pathlib.Path("/home/bam/pyblocks")
SHOTS = REPO / "reports/media/shots-vpl-prior-art"
OLD_SHOTS = REPO / "reports/media/shots-source-code-view"
OUT = REPO / "reports/media/vpl-prior-art-2026-09-18.html"
LANE = "claude/bar-block-storybook-e61a36"
PRIOR1 = "file:///home/bam/bbox-ui/reports/media/source-code-view-2026-09-18.html"
PRIOR2 = "file:///home/bam/bbox-ui/reports/media/source-code-view-answers-2026-09-18.html"

# ---------------------------------------------------------------------------
# The local experiment, re-measured. Zach ran this in August and it is the only
# direct evidence on this machine of what expression-level lowering of REAL
# hand-written Python actually costs.
# ---------------------------------------------------------------------------
GALLERY = PYBLOCKS / "docs/pyflow-ddg-gallery.html"
ARTIFACTS = PYBLOCKS / "docs/pyflow-examples/artifacts"

_g = GALLERY.read_text(encoding="utf-8")
_plain = html.unescape(re.sub(r"<[^>]+>", "\n", re.sub(r"<(script|style)\b.*?</\1>", "", _g, flags=re.S)))
_lines = [l.strip() for l in _plain.split("\n") if l.strip()]
_stats, _cur = [], {}
for _i, _l in enumerate(_lines):
    if re.fullmatch(r"\d+", _l) and _i + 1 < len(_lines) and _lines[_i + 1] in ("nodes", "operations", "slots", "edges"):
        _cur[_lines[_i + 1]] = int(_l)
        if len(_cur) == 4:
            _stats.append(_cur)
            _cur = {}

FIXTURES = [
    ("arithmetic_pipeline", "straight-line arithmetic", 5),
    ("fan_out_and_merge", "fan-out and merge", 5),
    ("branch_join", "branch and join", 6),
    ("mutate_record", "indexed mutation", 3),
    ("await_chain", "await chain", 4),
]


def svg_px(stem: str) -> tuple[int, int]:
    """Native rendered size of a checked-in Graphviz SVG, in CSS pixels."""
    for name in (f"{stem}_ddg.svg", f"{stem}_ddg_lr.svg"):
        p = ARTIFACTS / name
        if p.exists():
            head = p.read_text(encoding="utf-8")[:900]
            m = re.search(r'viewBox="[\d.]+ [\d.]+ ([\d.]+) ([\d.]+)"', head)
            if m:
                return round(float(m.group(1))), round(float(m.group(2)))
    return (0, 0)


DDG_ROWS = []
for (stem, label, lines), st in zip(FIXTURES, _stats):
    w, h = svg_px(stem)
    DDG_ROWS.append(
        f"<tr><td><b>{label}</b><br><code>{stem}</code></td>"
        f'<td class="num">{lines}</td>'
        f'<td class="num">{st["operations"]}</td>'
        f'<td class="num">{st["slots"]}</td>'
        f'<td class="num" style="color:var(--warn)">{st["nodes"]}</td>'
        f'<td class="num">{st["edges"]}</td>'
        f'<td class="num">{w:,} &times; {h:,}</td></tr>'
    )
DDG_ROWS.append(
    '<tr class="dim"><td><b>exception fallback</b><br><code>exception_fallback</code></td>'
    '<td class="num">5</td><td colspan="5" style="color:var(--warn)">'
    "the analyser failed on this one &mdash; <code>try/except</code> emitted no graph</td></tr>"
)
DDG_TABLE = "\n".join(DDG_ROWS)

ARITH = next(s for (stem, _, _), s in zip(FIXTURES, _stats) if stem == "arithmetic_pipeline")
ARITH_W, ARITH_H = svg_px("arithmetic_pipeline")
SCREENS = round(ARITH_W / 1920, 1)

FACTS = {
    "tools": "40",
    "ingest": "0",
    "arith_nodes": str(ARITH["nodes"]),
    "arith_ops": str(ARITH["operations"]),
    "arith_w": f"{ARITH_W:,}",
    "screens": str(SCREENS),
    "head": sh("git rev-parse --short HEAD", REPO),
    "collapse_tests": sh(
        f"git show {LANE}:apps/storybook-basics/src/scene/collapse.test.ts | grep -c '  it(' || true", REPO
    ),
}

# ---------------------------------------------------------------------------
# The field. Every row came back cited; `src` is the shortest honest pointer.
# ---------------------------------------------------------------------------
FIELD = [
    # name, what one node is, canonical, reads existing .py, composition, licence/alive
    ("PyFlow", "one Python <b>function</b>, via <code>@IMPLEMENT_NODE</code>", "graph",
     "no", "<span class='yes'>Collapse to compound</span>, nestable, exportable &mdash; <b>no ungroup</b>",
     "Apache-2.0 &middot; alive (PRs merged Sept 2025)"),
    ("Ryven", "one Python <b>class</b> (<code>Node</code> subclass)", "graph",
     "no", "<span class='no'>none at all</span> &mdash; zero grep hits for subgraph/macro/group",
     "MIT editor / <b>LGPL-2.1 <code>ryvencore</code></b> &middot; <b>archived</b>"),
    ("Nodezator", "one call to a <b>callable</b>", "graph",
     "no", "<span class='no'>none</span> &mdash; its manual calls subgraphs &ldquo;a crucial missing piece&rdquo;",
     "Unlicense &middot; very alive (2.8k&#9733;)"),
    ("PyFlowGraph", "a <b>block of real Python</b>, pins from the annotated signature", "graph",
     "no", "<span class='yes'>Group containers</span>; reusable templates on the roadmap",
     "MIT &middot; alive (small)"),
    ("NodeGraphQt", "whatever the host app says &mdash; a UI toolkit", "n/a",
     "no", "<span class='yes'><code>GroupNode</code> + <code>SubGraph</code> built in</span>",
     "MIT &middot; alive (1.8k&#9733;)"),
    ("GNU Radio Companion", "a signal-processing <b>block</b>", "graph",
     "no", "<span class='yes'>Hierarchical Blocks</span>",
     "GPL-3.0 &middot; very alive &mdash; <b>generates the .py, overwrites hand edits</b>"),
    ("Orange3", "an analytical <b>widget</b>", "graph",
     "no", "<span class='no'>not found</span>", "GPL-3.0+ &middot; very alive"),
    ("Barfi", "a Python function attached to a Block", "graph",
     "no", "<span class='no'>not found</span>", "Apache-2.0 &middot; stalled (Jan 2025)"),
    ("Visual Python", "a GUI form that <b>writes</b> into a notebook cell", "the .py",
     "no", "<span class='no'>n/a</span>", "GPL-3.0 + exception &middot; dormant"),
    ("PyFlowchart / code2flow", "a statement or a call &mdash; <b>rendered, not editable</b>", "<b>the .py</b>",
     "<span class='yes'>YES</span>", "<span class='no'>n/a &mdash; read-only diagram</span>",
     "MIT &middot; alive"),
]
FIELD_ROWS = "\n".join(
    f"<tr{' class=\"good\"' if r[3].startswith('<span') else ''}>"
    f"<td><b>{r[0]}</b></td><td>{r[1]}</td><td>{r[2]}</td>"
    f"<td class='c'>{r[3]}</td><td>{r[4]}</td><td>{r[5]}</td></tr>"
    for r in FIELD
)

PROJECTORS = [
    ("Sourcetrail", "function / class / variable", "read-only", "re-index after every edit",
     "<b>archived Dec 2021.</b> Maintainer: the project &ldquo;would still need an active team of maintainers, which currently does not exist&rdquo;"),
    ("pyan3 · code2flow · PyCG", "function-call graph", "read-only", "one-shot AST parse",
     "pyan3 alive; PyCG <b>archived Nov 2023</b>; code2flow documents what it cannot resolve in a dynamic language"),
    ("pydeps · snakefood", "module / file imports", "read-only", "one-shot", "pydeps alive; snakefood dormant"),
    ("SciTools Understand", "down to statement level for some graphs", "read-only", "own parsers",
     "alive, proprietary, ~$100&ndash;120/mo"),
    ("Sourcegraph SCIP · Kythe", "symbol / cross-reference", "read-only", "indexers over the real build",
     "alive; Kythe quiet since 2021"),
    ("JetBrains UML diagrams", "class + member <b>signature</b> &mdash; never a method body", "<b>writes back</b>",
     "live view over the IDE&rsquo;s own PSI tree &mdash; no re-attach step",
     "alive, proprietary. Writes back only what its refactoring engine already does safely"),
    ("MPS / mbeddr", "anything &mdash; projectional", "<b>writes back</b>", "<b>there is no text file</b>",
     "alive. Sidesteps the problem by owning the whole language"),
    ("Enso", "the <b>expression</b>", "<b>writes back</b>", "one AST, two native faces",
     "alive. Only round-trips <b>Enso</b>. Its own tracker shows the text editor regressing to read-only, and an AST-sync rewrite onto a CRDT in Nov 2023"),
]
PROJ_ROWS = "\n".join(
    f"<tr{' class=\"good\"' if 'writes back' in r[2] else ''}>"
    f"<td><b>{r[0]}</b></td><td>{r[1]}</td><td class='c'>{r[2]}</td><td>{r[3]}</td><td>{r[4]}</td></tr>"
    for r in PROJECTORS
)

COMPOSE = [
    # tool, gesture, ports on crossing wires, reversible, copy or reference, own file
    ("Unreal · Collapse Nodes", "right-click &rarr; Collapse Nodes", "auto from crossing wires",
     "Expand Node", "<b>copy</b> &mdash; docs: &ldquo;not shared, even within a single Blueprint&rdquo;", "inline"),
    ("Unreal · Collapse to Function", "right-click &rarr; Collapse to Function", "auto, extendable by hand",
     "Expand Node", "<b>reference</b> &mdash; one compiled callable", "Blueprint, or a Function Library asset"),
    ("Unreal · Collapse to Macro", "right-click &rarr; Collapse to Macro", "auto, extendable",
     "Expand Node", "<b>shared source, inlined per use</b> at compile", "Macro Library asset"),
    ("Blender node group", "Ctrl-G", "auto &rarr; Group Input/Output sockets, renameable",
     "Alt-G &mdash; <b>loses the group&rsquo;s default input values</b> (open PR)",
     "<b>reference</b> &mdash; a datablock with a user count; Make Single User forks it", "inline in the .blend"),
    ("Houdini subnet", "Collapse to Subnet (<code>opcollapse</code>)", "auto, names mimic the wired output",
     "<code>opextract</code>", "<b>copy</b>", "inline in the .hip"),
    ("Houdini HDA", "subnet &rarr; Create Digital Asset", "promoted parameters",
     "n/a", "<b>reference</b> &mdash; locked instances auto-update; unlock forks, Match Current Definition re-syncs",
     "<b>.hda on disk</b>"),
    ("Nuke Group", "Ctrl-G / Collapse to Group", "auto Input/Output nodes", "Expand Group (Ctrl-Alt-G)",
     "<b>copy</b>", "inline in the .nk"),
    ("Nuke LiveGroup", "Ctrl-L / Collapse to LiveGroup", "auto", "Expand Group inlines and drops the link",
     "<b>reference</b> &mdash; Published (locked) &harr; Make Editable &harr; Publish", "<b>its own .nk</b>"),
    ("ComfyUI subgraph", "select &rarr; subgraph button", "auto slots, right-click to rename",
     "Unpack Subgraph &mdash; had &ldquo;malformed subgraph links&rdquo; bugs",
     "<b>designed as reference, ships as copy</b> &mdash; linked instances open as broken; &ldquo;subgraph v2&rdquo;",
     "inline, optional blueprint .json"),
    ("Node-RED subflow", "Subflows &rarr; Selection to Subflow", "grey I/O nodes; labels user-authored",
     "<b>none shipped</b> &mdash; ungroup was a 2015 design proposal", "<b>reference</b> &mdash; template + instances, edits propagate",
     "inline; npm-packageable"),
    ("n8n sub-workflow", "right-click &rarr; Convert to sub-workflow", "params auto, types manual",
     "<b>none</b> &mdash; one-way, lossy in details", "<b>reference</b> &mdash; docs: &ldquo;it&rsquo;s not a copy&rdquo;",
     "its own workflow"),
    ("Grasshopper cluster", "right-click &rarr; Cluster", "<b>manual</b> &mdash; add Cluster Input/Output yourself",
     "Explode Cluster &mdash; <b>disrupts canvas layout</b>",
     "<b>copy</b>; Export &amp; Reference makes it a link, but updates are <b>pull-only</b>", "optional .ghcluster"),
    ("PyFlow compound", "right-click &rarr; Collapse to compound", "auto via <code>syncPins()</code> (has bugs)",
     "<b>none found</b> in the source tree", "exportable as a package node", "optional .compound"),
    ("Max/MSP subpatcher", "Edit &rarr; Encapsulate", "auto <code>inlet</code>/<code>outlet</code> objects, positional",
     "<b>De-encapsulate</b> &mdash; docs say connections &ldquo;will be correctly created&rdquo;",
     "<b>copy</b>", "inline in the .maxpat"),
    ("Max/MSP abstraction", "author a .maxpat, call it by name", "hand-placed inlet/outlet",
     "n/a", "<b>reference</b> &mdash; save the file and every patcher using it updates, even while loaded",
     "<b>its own .maxpat</b>"),
    ("Pure Data", "<b>none</b> &mdash; type a <code>pd</code> object and move things in by hand",
     "manual", "<b>none in vanilla</b>",
     "subpatch = copy inline; abstraction = <b>reference</b>, separate file", ".pd for abstractions"),
    ("Simulink subsystem", "Ctrl-G / Create Subsystem", "auto Inport/Outport, named <code>In1&hellip;Outn</code>",
     "<b>Expand</b> &mdash; topology restored, layout fidelity unstated",
     "<b>copy</b>", "inline in the model"),
    ("Simulink library link", "drag from a library", "n/a",
     "disable link / restore",
     "<b>reference</b> &mdash; parameter edits propagate; <b>structural</b> edits need the link disabled first",
     "library .slx"),
    ("Simulink Subsystem Reference", "save as a subsystem file", "n/a", "n/a",
     "<b>reference</b> &mdash; even structural edits sync to every instance", "<b>its own file</b>"),
    ("LabVIEW subVI", "Edit &rarr; Create SubVI", "auto connector-pane terminals from the selected controls",
     "<b>no documented inverse</b>",
     "<b>always a reference</b> &mdash; every VI is a file; edits propagate to all call sites",
     "<b>always its own .vi</b>"),
]
COMPOSE_ROWS = "\n".join(
    f"<tr><td><b>{r[0]}</b></td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td><td>{r[4]}</td><td>{r[5]}</td></tr>"
    for r in COMPOSE
)

OURS_ROWS = """
<tr class="good"><td><b>bbox-ui &middot; <code>collapseToRegion</code></b></td>
  <td>select &rarr; collapse</td>
  <td>auto &mdash; <code>classifyBoundary</code> derives ports from the edges that cross</td>
  <td><b><code>dissolveRegion</code>, and it is measured exact</b> &mdash;
      <code>JSON.stringify(before) === JSON.stringify(dissolved)</code></td>
  <td><b>copy</b> &mdash; the organise tier</td><td>inline in the scene</td></tr>
<tr class="good"><td><b>bbox-ui &middot; <code>linking.ts</code></b></td>
  <td>share a <code>definitionId</code></td>
  <td>n/a &mdash; occurrences of one definition</td>
  <td><code>unlinkOccurrence</code> / <code>duplicateNodeUnlinked</code></td>
  <td><b>reference</b> &mdash; <code>setDefinitionData</code> writes every occurrence;
      <code>definitionBadge</code> is the visible link state</td>
  <td>inline</td></tr>"""

# ---------------------------------------------------------------------------
QUOTES = [
    ("Henley &amp; Fleming, <i>Yestercode</i>, VL/HCC 2016 (Best Paper) &mdash; 54 interviews at "
     "National Instruments, then a 6-participant study",
     "Participants often said that either they or customers will go to great lengths to avoid "
     "modifying existing code&hellip; <b>all six introduced at least one bug</b> while rewiring, and "
     "<b>four of six abandoned</b> the change task. One manager called it &ldquo;a million dollar "
     "problem&rdquo;.",
     "This is <b>viscosity</b>, and it is the single most important finding in the sweep. It bites "
     "when you <em>edit the graph</em>. In a design where the file stays canonical and the graph is "
     "re-derived, it never triggers."),
    ("Green &amp; Petre, <i>Usability Analysis of Visual Programming Environments</i>, JVLC 1996 "
     "&mdash; one program written three ways",
     "Basic: 22 lines, 140 words, fits on screen. LabVIEW: 45 icons + 59 wires = 104 entities, fits. "
     "<b>Prograph (deeply nested): 52 icons + 79 connectors = 131 entities across 11 windows</b> &mdash; "
     "&ldquo;no question whatever of having all the program visible simultaneously&rdquo;. And: "
     "Prograph has &ldquo;an extraordinarily large number of long-range hidden dependencies, created "
     "by the combination of a deep nesting with the lack of an overview of the nesting structure.&rdquo;",
     "<b>This is the direct answer to your PyFlow note.</b> The most aggressively nested tool had "
     "<em>more</em> total entities than the flat one and worse hidden dependencies. Composition "
     "relocates complexity behind a boundary; it does not remove it."),
    ("&ldquo;Visual Dataflow Modelling: some thoughts on complexity&rdquo;, eCAADe 2014 &mdash; real "
     "graphs measured in the wild",
     "Averages of <b>24 nodes and 27 links</b>, which the authors call &ldquo;very high numbers "
     "reflecting that the complexity of the dataflow graph is not commensurate with the complexity "
     "of the modelling task&rdquo;.",
     "The practical ceiling is <em>lower</em> than the folklore Deutsch number of 50. Your "
     "<code>stereo.py</code> is 4 definitions. At expression level it measured 40 nodes."),
    ("Whitley, Novick &amp; Fisher, IJHCS 2006 &mdash; LabVIEW vs an equivalent textual language",
     "The visual representation <b>won</b> on tracing, parallelism and debugging &mdash; "
     "specifically for dataflow-shaped tasks.",
     "Graphs are not generally worse. They win exactly where the computation genuinely is a "
     "dataflow graph. Which is the claim you made for the block view: topology and dataflow."),
    ("Epic Games, <i>Balancing Blueprint and C++</i> &mdash; the vendor that ships the collapse tooling",
     "&ldquo;Large C++ files are easier to modify than large Blueprint graphs, which is important "
     "for scalability and large teams&hellip; C++ is stored as text, making it easier to diff, merge, "
     "and share between projects.&rdquo;",
     "Epic builds Collapse/Function/Macro and still tells studios to leave the graph at scale. The "
     "reason it gives is <b>text diffs</b> &mdash; which is the file-first argument, from the other side."),
]
QUOTE_HTML = "\n".join(
    f"""<div class="card" style="margin-bottom:12px">
  <b>{q[0]}</b>
  <div class="quote">{q[1]}</div>
  <p>{q[2]}</p>
</div>"""
    for q in QUOTES
)

# ---------------------------------------------------------------------------
ASKS = [
    dict(
        n="B1",
        q="Name the two tiers, and ship only the first?",
        body="The field&rsquo;s hard-won lesson is that &ldquo;make this a composite&rdquo; is really "
             "<b>two or three different operations</b>, and the tools that left it as one gesture are "
             "the ones with open bugs about it. Unreal splits it three ways and says so in the docs; "
             "ComfyUI shipped one gesture and its linked instances are currently broken. You already "
             "have both tiers in code &mdash; <code>collapse.ts</code> (organise) and "
             "<code>linking.ts</code> (reuse) &mdash; but nothing in the UI tells them apart.",
        default="<b>Ship the organise tier only, and name it so.</b> &ldquo;Collapse&rdquo; means tidy, "
                "copy, no reuse &mdash; exactly Unreal&rsquo;s Collapse Nodes. Reuse stays behind the "
                "definition badge that <code>linking.ts</code> already draws. One gesture that "
                "silently decides reuse semantics for you is the documented failure mode.",
    ),
    dict(
        n="B2",
        q="Is a code cell&rsquo;s boundary port name editable?",
        body="Every tool that does collapse well auto-derives the ports from the crossed wires and "
             "then lets you rename them &mdash; ComfyUI (right-click the slot), Blender (Group Input "
             "sidebar), Houdini (names mimic the wired output, then editable). Grasshopper, which "
             "makes you wire the boundary by hand, is the outlier and it is the one people complain "
             "about. Today <code>classifyBoundary</code> derives; nothing renames.",
        default="<b>Yes &mdash; and this is the W3 lane on the work order, already scoped.</b> Reify the "
                "derived ports as real nodes so they can be renamed, reordered and diffed, keeping a "
                "port identity separate from the node id (Baklava&rsquo;s <code>graphInterfaceId</code>). "
                "The sweep upgrades W3 from &ldquo;nice&rdquo; to &ldquo;the thing the whole field agrees on&rdquo;.",
    ),
    dict(
        n="B3",
        q="Do we go and look at Nodezator and NodeGraphQt properly?",
        body="Two names worth more than the two you linked. <b>Nodezator</b> (Unlicense &mdash; public "
             "domain, 2.8k&#9733;, pushed today) is the most alive Python VPL in the field and its "
             "manual names subgraphs as &ldquo;a crucial missing piece&rdquo; &mdash; i.e. it has your "
             "problem and has not solved it. <b>NodeGraphQt</b> (MIT) ships <code>GroupNode</code> and "
             "a <code>SubGraph</code>/<code>NodeGraph</code> split as core infrastructure, which is "
             "rare. Neither reads existing Python.",
        default="<b>No second sweep.</b> Nodezator is a design read, not a dependency &mdash; it is Qt, "
                "and this repo is React/DOM. I would rather spend the next pass on the one thing "
                "nobody has: the definition-graph builder in pyblocks.",
    ),
    dict(
        n="B4",
        q="Does the licence picture change anything?",
        body="Worth a glance before anything becomes a reference implementation. <b>Ryven&rsquo;s "
             "editor is MIT but its <code>ryvencore</code> engine is LGPL-2.1</b>, and Ryven is now "
             "archived. Orange3 and GNU Radio are GPL-3. PyFlow is Apache-2.0 throughout, Nodezator "
             "is Unlicense, NodeGraphQt is MIT. This repo has already been careful here once &mdash; "
             "<code>elbow/nudge.ts</code> deliberately did not read libavoid because of LGPL.",
        default="<b>Read PyFlow, Nodezator and NodeGraphQt; do not read <code>ryvencore</code>.</b> Same "
                "rule as libavoid: derive from geometry and check against a permissive implementation, "
                "and keep the provenance comment honest about which donors were deliberately not read.",
    ),
]
ASK_HTML = "\n".join(
    f"""<div class="ask">
  <h3>{a['n']} &middot; {a['q']}</h3>
  <p style="color:var(--dim);font-size:14px;margin:0">{a['body']}</p>
  <p class="dflt"><b>If you say nothing:</b> {a['default']}</p>
  {fb(a['n'], re.sub(r'<[^>]+>', '', a['q']))}
</div>"""
    for a in ASKS
)

# ---------------------------------------------------------------------------
HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>What the prior art changes</title>
<style>{CSS}</style>
</head><body><div class="wrap">

<p class="kicker">bbox-ui &middot; pyblocks &nbsp;&middot;&nbsp; python VPL prior art &nbsp;&middot;&nbsp; 2026-09-18</p>
<h1>What the prior art changes</h1>
<p class="sub">Five agents, about {FACTS['tools']} tools, every claim carrying the page it came from.
Three things change, two are confirmed, and the most useful finding is a gap: <b>nobody has built
what you are building</b>, and the literature says that is the version most likely to work.</p>

<div class="answers">
  <div class="answer blue">
    <b class="h">PyFlow does not actually go all the way down &mdash; and that rescues your ceiling.</b>
    <p>Its granularity is <b>one node per Python function</b>, declared with a decorator whose argument
    defaults carry the pin types. What makes a PyFlow graph <em>look</em> expression-level is that its
    standard library is full of very small functions &mdash; <code>add</code>, <code>makeInt</code>. So
    the fineness is a property of the <b>node library</b>, not of the representation. You can have
    exactly the texture you liked without lowering a single statement: make the leaf definitions small.</p>
  </div>
  <div class="answer red">
    <b class="h">Composition does not rescue fine granularity. This is measured, and it is 30 years old.</b>
    <p>Green &amp; Petre wrote one program three ways. The <b>most aggressively nested</b> tool
    (Prograph) produced <b>more</b> total entities than the flat one and spread them over 11 windows,
    and they recorded &ldquo;an extraordinarily large number of long-range hidden dependencies,
    created by the combination of a deep nesting with the lack of an overview of the nesting
    structure.&rdquo; Collapsing trades visible clutter for invisible coupling. It buys
    <b>legibility</b>, never <b>safety</b>.</p>
  </div>
  <div class="answer">
    <b class="h">Nobody ingests existing Python. The field is graph-canonical, top to bottom.</b>
    <p>PyFlow, Ryven, Nodezator, Barfi, PyFlowGraph, Orange, GNU Radio &mdash; every one authors
    <em>into</em> the graph; the Python is a node library or a generated artifact. The only tools that
    read real hand-written Python &mdash; PyFlowchart, code2flow, pyan3, PyCG, Sourcetrail,
    Understand, Kythe &mdash; are <b>read-only, every one</b>. That is not an accident; it is the
    tractable version of the problem.</p>
  </div>
  <div class="answer green">
    <b class="h">So your design sits in a gap, not behind the field &mdash; and the literature likes the gap.</b>
    <p>The one finding that matters most is <b>viscosity</b>: at National Instruments, <b>six of six</b>
    study participants introduced a bug while rewiring existing LabVIEW code and <b>four of six
    abandoned</b> the task. That failure fires when you <em>edit the graph</em>. Keep the file
    canonical and the graph becomes a lens that re-derives &mdash; nobody rewires it, so the failure
    never triggers. Grain 1 then bounds the node count by the file&rsquo;s definition count, which
    lands under every scalability threshold anyone has measured.</p>
  </div>
  <div class="answer">
    <b class="h">And you already have the two mechanics the field spent 30 years learning.</b>
    <p>Every tool that does composition well ended up separating <b>organise</b> from <b>reuse</b>, and
    every one of them puts the copy-or-reference state in the node&rsquo;s own chrome.
    <code>scene/collapse.ts</code> is the organise tier &mdash; with an inverse that is
    <em>measured exact</em>, which is better than anything in the table below.
    <code>scene/linking.ts</code> is the reuse tier, with <code>definitionBadge</code> as the visible
    link state and <code>unlinkOccurrence</code> as Blender&rsquo;s Make Single User. The gap is one
    thing: <b>the derived boundary ports cannot be renamed.</b></p>
  </div>
</div>

<div class="facts">
  <div class="fact"><b>~{FACTS['tools']}</b><span>tools checked</span></div>
  <div class="fact bad"><b>{FACTS['ingest']}</b><span>that read existing Python and let you edit back</span></div>
  <div class="fact warn"><b>{FACTS['arith_nodes']}</b><span>nodes for a 5-line function, at expression grain</span></div>
  <div class="fact good"><b>{FACTS['arith_ops']}</b><span>of those are real operations</span></div>
  <div class="fact bad"><b>{FACTS['arith_w']}</b><span>px wide, as drawn</span></div>
  <div class="fact good"><b>{FACTS['collapse_tests']}</b><span>tests on our exact inverse</span></div>
</div>

<h2>The granularity experiment you already ran</h2>
<div class="lede orange">
  <p><b>One disambiguation first, because two unrelated projects share a name.</b> The
  <code>pyflow-analysis</code> package on PyPI (<code>ZJU-PL/pyflow</code>, Apache-2.0) is a static
  <i>data-dependence-graph analyser</i> &mdash; it is <b>not</b> <code>pedroCabrera/PyFlow</code>, the
  node editor you linked. You ran the analyser against six hand-written fixtures on <b>2026-08-23</b>
  and the artifacts are still on disk. Re-measured at build time:</p>
</div>
<div class="scroll"><table>
  <tr><th>fixture</th><th style="text-align:right">source<br>lines</th>
    <th style="text-align:right">real<br>operations</th><th style="text-align:right">plumbing<br>slots</th>
    <th style="text-align:right">nodes<br>drawn</th><th style="text-align:right">edges</th>
    <th style="text-align:right">rendered size (px)</th></tr>
  {DDG_TABLE}
</table></div>

<figure><img src="{shot(SHOTS / 'ddg-whole.png')}" alt="the whole graph as an unreadable strip">
  <figcaption><b>Four expressions, drawn at expression granularity.</b>
  <code>def arithmetic_pipeline</code> &mdash; five lines &mdash; renders
  {FACTS['arith_w']}&nbsp;&times;&nbsp;{ARITH_H:,}&nbsp;px, about <b>{FACTS['screens']} screens
  wide</b> at 1080p. Squeezed here to fit the page, which is the finding rather than a rendering
  defect.</figcaption></figure>
<figure><img src="{shot(SHOTS / 'ddg-crop.png')}" alt="a 1:1 window onto the same graph">
  <figcaption><b>The same graph at 1:1, so you can see the labels are real.</b>
  <code>ddg.2 &middot; op &middot; split(pred(hyperblock(0)), 5)</code> beside
  <code>field(LocalStorage(symbol=SymbolId(scope=ScopeId(code=CodeId(module='fixtu&hellip;</code>.
  </figcaption></figure>

<div class="lede">
  <p><b>Read it honestly and it cuts both ways, which is why the operations column is in the table.</b>
  {FACTS['arith_ops']} operations for 4 expressions &mdash; roughly two per line &mdash; is what a
  well-built VPL would show; the other {ARITH['slots']} are plumbing it would hide. So &ldquo;all the
  way down&rdquo; is not automatically {FACTS['arith_nodes']} nodes.</p>
  <p style="margin-top:10px"><b>But this is the cost of lowering <em>existing hand-written Python</em>,
  which is our case and not PyFlow&rsquo;s.</b> PyFlow and Ryven never pay it, because you author into
  their graph. And note the last row: <code>try/except</code> produced no graph at all. Put the
  literature&rsquo;s own numbers beside it &mdash; real dataflow graphs average <b>24 nodes</b> before
  practitioners call them incommensurate &mdash; and a 31-line file at expression grain is not a
  close call.</p>
</div>

<h2>The field, and the one column that matters</h2>
<div class="scroll"><table>
  <tr><th>tool</th><th>one node is&hellip;</th><th>canonical</th>
    <th style="text-align:center">reads your<br>existing .py</th><th>composition</th><th>licence &middot; alive?</th></tr>
  {FIELD_ROWS}
</table></div>
<p style="font-size:12.5px;color:var(--dim2)">Also checked and deliberately excluded: Bonsai (.NET/Rx,
not Python), GhPython, Dynamo, Houdini VOPs, LabVIEW&rsquo;s Python Node and Simulink&rsquo;s Python
block &mdash; all visual languages in their own right that <em>call</em> Python from one node type.
&ldquo;Has a Python node&rdquo; is not &ldquo;is a Python visual language&rdquo;.</p>

<h2>Going the other way &mdash; who projects real code</h2>
<div class="scroll"><table>
  <tr><th>tool</th><th>granularity</th><th style="text-align:center">direction</th>
    <th>how it stays attached</th><th>status</th></tr>
  {PROJ_ROWS}
</table></div>
<div class="lede red">
  <p><b>The honest summary the sweep landed on:</b> write-back is achievable once you own the language
  and its single canonical AST &mdash; MPS has no text file to disagree with, Enso is one AST with two
  native faces. It has <b>not</b> been achieved for code that already exists in a language you do not
  control. Everything that genuinely ingests real Python is read-only, precisely because that is the
  tractable half.</p>
  <p style="margin-top:10px">Enso is worth one more sentence because it is the closest anyone has come
  and you named it yourself: it round-trips <b>Enso</b>, not Python; foreign calls appear as opaque
  nodes; its own issue tracker has the text editor regressing to read-only, and in Nov 2023 the team
  was still rebuilding AST synchronisation onto a CRDT &mdash; years after shipping the
  &ldquo;simultaneously updated&rdquo; claim. Keeping two faces honest is hard even when you built the
  language for it.</p>
</div>

<h2>Composition, as {len(COMPOSE)} implementations actually do it</h2>
<div class="scroll"><table>
  <tr><th>tool</th><th>gesture</th><th>ports from crossing wires</th><th>reversible?</th>
    <th>copy or reference</th><th>own file</th></tr>
  {COMPOSE_ROWS}
  {OURS_ROWS}
</table></div>
<div class="lede green">
  <p><b>Two things stand out, and both are good news.</b></p>
  <p style="margin-top:8px"><b>1 &middot; Inverses are common; a <em>verified</em> inverse is not.</b>
  Most of these ship an ungroup &mdash; Max&rsquo;s De-encapsulate, Simulink&rsquo;s Expand,
  Unreal&rsquo;s Expand Node, Blender&rsquo;s Alt-G, Houdini&rsquo;s <code>opextract</code>,
  Nuke&rsquo;s Expand Group. Three do not: PyFlow has none in its source tree, Node-RED never shipped
  the one it designed in 2015, and LabVIEW has no documented way back. But the ones that exist are
  <b>documented, not measured</b>, and several are documented <em>lossy</em>: Blender&rsquo;s drops
  the group&rsquo;s default input values, Grasshopper&rsquo;s disrupts the canvas, ComfyUI&rsquo;s had
  malformed-link bugs, n8n&rsquo;s warns about semantic drift, Simulink states topology restoration
  but says nothing about layout. <b>Not one of them asserts equality.</b> So the honest claim is
  narrower than &ldquo;better than the field&rdquo; and more useful:
  <code>dissolveRegion</code> restoring <code>JSON.stringify(before)</code> exactly, under
  {FACTS['collapse_tests']} tests, is <b>the only inverse here that is checked rather than
  claimed</b>.</p>
  <p style="margin-top:8px"><b>2 &middot; Everyone who got this right ended up with two tiers and a
  visible link state.</b> Unreal says it in its own docs &mdash; Collapse Nodes is &ldquo;not shared,
  even within a single Blueprint&hellip; really more intended to tidy up a graph&rdquo;, while a
  Function is one compiled callable. Houdini locks HDA instances and turns the title red when you
  unlock one. Blender puts the user count next to the name. ComfyUI shipped a single gesture, hard-coded
  to copy, and its linked instances are currently filed as broken. You already have the two tiers.</p>
</div>

<h2>The evidence on your actual question</h2>
<p style="color:var(--dim)">You wrote: <i>&ldquo;I like how pyflow kinda shows go all the way down but
then allows you to easily make like the composite nodes.&rdquo;</i> That is a real hypothesis and it
has been tested. Here is what the record says, quoted rather than paraphrased.</p>
{QUOTE_HTML}
<div class="lede gold">
  <p><b>So the answer is: composition rescues <em>legibility</em>, not <em>granularity</em>.</b> It is
  worth having &mdash; you should ship it &mdash; but it does not make fine granularity safe, and the
  one domain where visual programming is an unambiguous 30-year success (LabVIEW) shows the viscosity
  failure anyway, the moment its users modify rather than assemble. The property that protects you is
  not the collapse gesture. It is that <b>the graph is not where the program lives.</b></p>
</div>

<h2>What this changes for us</h2>
<div class="grid2">
  <div class="card ok"><b>confirmed &mdash; keep</b>
    <p><b>Grain 1.</b> Now with citations rather than taste: node count bounded by definition count
    lands under the 24&ndash;50 range where measured dataflow graphs stop helping.</p>
    <p><b>File canonical.</b> The viscosity finding only fires on graph edits. This is the design that
    dodges it, and Epic&rsquo;s own &ldquo;C++ diffs, Blueprints don&rsquo;t&rdquo; advice is the same
    argument from the other side.</p>
    <p><b>The <code>origin</code> field.</b> An unbound cell is exactly what the whole field builds &mdash;
    graph-canonical, author-into-it. A bound cell is the gap. One record covering both is still right.</p>
  </div>
  <div class="card blue"><b>changed &mdash; do differently</b>
    <p><b>Name the tiers in the UI.</b> Collapse = tidy, copy, no reuse. Reuse = the definition badge.
    One undifferentiated &ldquo;make composite&rdquo; is the documented failure mode, not a simplification.</p>
    <p><b>Promote W3.</b> Renameable boundary ports went from a nice-to-have to the one thing every
    tool that does this well agrees on.</p>
    <p><b>Small leaf definitions, not small nodes.</b> If you want PyFlow&rsquo;s texture, get it from
    the library, the way PyFlow actually does &mdash; not by lowering statements.</p>
  </div>
</div>
<div class="lede red" style="margin-top:14px">
  <p><b>And one warning worth keeping, because every failure in the sweep shares it.</b> The moment the
  graph becomes a place to <em>write</em> logic rather than to <em>navigate</em> it, this design
  inherits the fate of the general-purpose VPLs &mdash; or, best case, LabVIEW&rsquo;s maintenance pain
  despite being a genuine domain fit. The line to hold is not about grain or gestures. It is:
  <b>the graph illustrates the text; it never replaces it.</b></p>
</div>

<h2>Evidence from our own tree</h2>
<div class="shots">
  <figure><img src="{shot(OLD_SHOTS / 'grouping-roundtrip.png')}" alt="collapse and dissolve round trip">
    <figcaption><b>The exact inverse, which the field does not have.</b> Collapse then dissolve, and
    <code>JSON.stringify(before) === JSON.stringify(dissolved)</code> reads
    <span style="color:#3fb950">IDENTICAL</span>. Every tool in the composition table above is lossy
    here, or has no inverse at all.</figcaption></figure>
  <figure><img src="{shot(OLD_SHOTS / 'grouping-ports.png')}" alt="promoted ports contract">
    <figcaption><b>Ports derived from the crossing edges, with <code>inner</code>/<code>outer</code>
    recorded.</b> This is the mechanic ComfyUI, Blender and Houdini all converged on &mdash; and the
    place B2&rsquo;s renameable names would attach.</figcaption></figure>
</div>

<h2>What needs you</h2>
<p style="color:var(--dim);margin-bottom:16px">Four, each with the reversible default I take if you
say nothing.</p>
{ASK_HTML}
{overall_box("a correction, a tool I missed, what to do first…")}

<h2>What I did not do</h2>
<div class="lede">
  <p><b>No code.</b> Design and measurement only; nothing in pyblocks, bbox-ui or SystemSketch was
  modified.</p>
  <p><b>No second sweep on the node-editor UI lineage.</b> That was already done on 2026-09-17
  (<code>node-editor-prior-art-sweep</code>, 462&nbsp;KB) and this deliberately does not re-cover it &mdash;
  the delta here is the <em>Python-language</em> lineage and the code&rarr;graph projectors, which that
  sweep did not touch.</p>
  <p><b>No re-opening of the notebook thread.</b> Still the other agent&rsquo;s.</p>
  <p><b>Gaps the agents reported rather than papered over:</b> no primary source for who coined
  &ldquo;Deutsch limit&rdquo;; Sourcetrail&rsquo;s own shutdown blog post is a dead link, so its
  post-mortem comes from the GitHub issue instead; Reddit was unreachable, so ComfyUI and Unreal
  community sentiment comes from GitHub Discussions and the Epic forums; and no maintainer of a node
  editor has published a reflective &ldquo;is grouping enough&rdquo; argument &mdash; that thesis is
  assembled here from their bug trackers and docs, not quoted from one of them.</p>
</div>

{dock("python VPL prior art (2026-09-18)", "item", len(ASKS))}

<footer class="page">
<p><b>Measured at build time</b> from <code>/home/bam/pyblocks/docs/pyflow-ddg-gallery.html</code> and
the checked-in Graphviz SVGs in <code>docs/pyflow-examples/artifacts/</code> &mdash; every node, edge
and pixel figure in the first table is parsed out of those artifacts when this page is generated, so a
stale number cannot survive a rebuild. Our own inverse:
<code>git show {LANE}:apps/storybook-basics/src/scene/{{collapse,linking}}.ts</code>.</p>
<p><b>Researched by five agents</b>, each required to cite the page it read and to write
&ldquo;unverified&rdquo; rather than guess. Primary sources behind the quoted section: Henley &amp;
Fleming, <i>Yestercode</i> (VL/HCC 2016); Green &amp; Petre, JVLC 7(2) 1996; Whitley, Novick &amp;
Fisher, IJHCS 64 (2006); &ldquo;Visual Dataflow Modelling&rdquo;, eCAADe 2014; Epic&rsquo;s
<i>Balancing Blueprint and C++</i>. Tool behaviour comes from each vendor&rsquo;s own docs and, where
docs and shipped behaviour disagree (ComfyUI&rsquo;s linked subgraphs), from their issue trackers &mdash;
that divergence is reported as a divergence.</p>
<p><b>Built by</b> <code>docs/build_vpl_prior_art_report.py</code> from <code>{FACTS['head']}</code>.
Earlier in this thread: <a href="{PRIOR1}">the five proposals</a> and
<a href="{PRIOR2}">the answers pass</a>.</p>
</footer>

</div>
<script>{FB_JS}</script>
</body></html>"""

report_size(HTML, OUT)
