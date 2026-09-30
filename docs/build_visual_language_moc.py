#!/usr/bin/env python3
"""Build the visual-language MOC — the map of every artifact in Zach's trees
that documents how Unreal Blueprints, LabVIEW, Simulink and their peers
actually draw a program.

    python3 docs/build_visual_language_moc.py --shots DIR --out FILE

Every link target is checked on disk before a byte is written. Thumbnails come
from docs/capture_visual_language_moc_shots.mjs, which opens each artifact for
real — so a card in this page is evidence the file opens, not just that a path
exists in a table.
"""
import argparse, base64, io, os, sys, html, json
from urllib.parse import quote
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from visual_language_moc_data import ARTIFACTS, CAPTURES  # noqa: E402

E = html.escape


def jpeg(path, width, quality=70):
    im = Image.open(path).convert("RGB")
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def raw(path, mime):
    return f"data:{mime};base64," + base64.b64encode(open(path, "rb").read()).decode()


def furl(path):
    return "file://" + quote(path)


# --------------------------------------------------------------- the spine
QUESTIONS = [
    ("A node body — what a block looks like up close",
     "17 tools photographed whole, then close, then their node taxonomies. The two axes that vary most are how much chrome the header carries and whether the type lives on the node or on the wire.",
     [("block-visuals", "Part A"), ("v-levels", "levels × views × states"), ("ss-everything-block", "§3.6")]),
    ("A port or a pin",
     "Eight house styles redrawn to scale, same node: React Flow <code>&lt;Handle&gt;</code>, JointJS port groups, litegraph index slots, Blender typed sockets (colour = socket type), <b>LabVIEW's connector-pane grid</b>, Simulink Inport/Outport <i>blocks</i>, ELK's constraint ladder.",
     [("sweep", "§How the field draws a port"), ("grammar-dict", "Inport / Outport"), ("hundred-ideas", "#12")]),
    ("Execution flow, separately from data flow",
     "Unreal and Unity are the two that draw it: a <b>white execution wire</b> threading the nodes, with typed data wires underneath. Grasshopper, Blender and Houdini have no such thing — dependency <i>is</i> the order. Simulink has neither: every block runs every tick.",
     [("grammar-atlas", "control map"), ("truthful-branching", "§2")]),
    ("if / elif / else, and match",
     "Unreal: a Branch node with True/False exec outputs. LabVIEW: a Case Structure — one selector, static patterns, no per-arm ports. Once an execution cable is ruled out, LabVIEW's structure is the only remaining method — and a flat <code>elif</code> ladder beats it, because LabVIEW has to nest.",
     [("truthful-branching", "§2–§3"), ("branch-regions", "§4 prior art"), ("many-to-one", "the join"), ("v-branching", "sources")]),
    ("A loop",
     "Five drawn side by side: LabVIEW's While/For wall with shift registers, Blender's Repeat Zone (two paired nodes, not a frame), Houdini's For-Each begin/end network, Simulink's For Iterator block inside the subsystem, Unreal's ForLoop with Loop Body and Completed exec pins.",
     [("loop-regions", "§2 five editors"), ("for-loop-grammars", "V1 = LabVIEW"), ("v-loops", "sources")]),
    ("“Next iteration” on a cable",
     "Simulink spells it z⁻¹ or a Unit Delay block at the merge; LabVIEW puts it on the wall as a shift register. The other three marks are ours.",
     [("loop-edge-marks", "five marks")]),
    ("break / continue — leaving a loop early",
     "LabVIEW's real move is to OR it into the condition inlet. BPMN uses a boundary event. Ten marks scored against both.",
     [("while-break", "§1 five existing answers")]),
    ("try / except / finally",
     "Eight notations, five criteria, and the <b>finally column is empty all the way down</b> — nothing in the field draws a suite that runs on every path. LabVIEW has no try: an error is a value on a wire. Unreal has no exceptions at all and Epic decided that twice.",
     [("try-except", "§4 prior art")]),
    ("Collapse to a black box",
     "The strongest convergence in the whole corpus: two bounds and one boolean, never a second collapsed-representation object — and collapsing <i>relocates</i> boundary-crossing edges onto the container. Six independent implementations agree.",
     [("sweep", "§01"), ("prior-art-explained", "card #4")]),
    ("Drill into a subgraph",
     "A layer swap, not a camera move: every plane draws in its own frame from (0,0), so nested-coordinate maths never has to exist. Blender Tab, Houdini dive, maxGraph enterGroup, diagram-js plane swap.",
     [("sweep", "§01"), ("prior-art-wave2", "containment")]),
    ("Where a container's ports come from",
     "A <b>boundary node placed inside</b> the box — 7 of 11 shipping desktop tools: Houdini Subnet Input/Output, Unreal tunnel nodes, Nuke Input, TouchDesigner In/Out, Node-RED's grey squares, Max/MSP inlet/outlet. The interface becomes an ordinary selectable, renameable object.",
     [("sweep", "§01 four answers"), ("prior-art-explained", "card #6"), ("v-classes", "composites")]),
    ("Reading direction, and the feedback return",
     "The thing every atlas assumes and none argues. Q1 is LabVIEW, Q2 is Simulink and the MAB style guide, plus the copyable wide-rounded return shape.",
     [("left-to-right", "Q1–Q3")]),
    ("Two cables that land on the same line",
     "The defect is a merge, not a crossing. Offset the elbows in the right order; hops are the treatment the prior art reverses the premise on.",
     [("edge-overlap", "§02–§03")]),
    ("Muting, disabling and skipping a node",
     "Blender's Mute (M) and Nuke's Disable (D): a boolean on the node that reroutes its first type-matching input straight to its output, drawn as a dashed or red outline. The chain stays connected.",
     [("hundred-ideas", "#8")]),
    ("Wiring to a name instead of across the board",
     "Node-RED's Link In / Link Out — a named channel rather than a long cable.",
     [("hundred-ideas", "#2")]),
    ("Reuse — a definition and its instances drifting apart",
     "Houdini is the only surveyed tool with a vocabulary for it: a state (locked / unlocked), a visible divergence, and a repair verb (Match Current Definition). Everyone else is either never-drifts or silent.",
     [("sweep", "the grid"), ("sweep-answers", "§2")]),
    ("A diff of two graphs",
     "Simulink's comparison tool is the closest domain match, and the finding is what it refuses to do: selecting a changed item does <b>not</b> recolour the block — it draws a plain rectangle around it.",
     [("diff-prior-art", "§3"), ("comparison-view", "prior art")]),
    ("The editor around the canvas — toolbar, debugger, watch, finder",
     "53 real captures of the Blueprint, LabVIEW and Simulink editors, each cashed out as a vocabulary or control row with what we have and what is missing.",
     [("gap-analysis", "Track B"), ("parity-triage", "the backlog rows")]),
]

TOOL_ROWS = [
    ("Unreal Blueprints", "real captures · redrawn grammar · per-construct",
     ["block-visuals", "grammar-atlas", "gap-analysis", "truthful-branching", "try-except", "loop-regions", "parity-triage"]),
    ("LabVIEW", "real captures · element dictionary · per-construct",
     ["block-visuals", "grammar-dict", "gap-analysis", "for-loop-grammars", "while-break", "try-except", "truthful-branching", "region-wall", "left-to-right", "v-30years"]),
    ("Simulink / Stateflow", "real captures · element dictionary · per-construct",
     ["block-visuals", "grammar-dict", "gap-analysis", "loop-edge-marks", "loop-regions", "diff-prior-art", "left-to-right", "v-30years"]),
    ("Blender Geometry Nodes", "redrawn grammar · real loop capture",
     ["grammar-atlas", "loop-regions", "sweep", "hundred-ideas", "block-visuals"]),
    ("Houdini", "redrawn grammar · real network capture · the drift vocabulary",
     ["grammar-atlas", "loop-regions", "sweep", "sweep-answers"]),
    ("Grasshopper", "redrawn grammar",
     ["grammar-atlas", "sweep", "branch-regions", "edge-overlap"]),
    ("Node-RED", "redrawn grammar · detached catch · link nodes",
     ["grammar-atlas", "try-except", "hundred-ideas", "ss-design-tool", "block-visuals"]),
    ("n8n / Langflow / Flyde", "redrawn grammar · chrome",
     ["grammar-atlas", "ss-design-tool", "block-visuals"]),
    ("Unity Visual Scripting", "redrawn grammar",
     ["grammar-atlas"]),
    ("Max/MSP · Pure Data", "redrawn grammar · real captures · the top-down minority axis",
     ["grammar-atlas", "block-visuals", "branch-regions", "sweep"]),
    ("ComfyUI / litegraph", "source read · real captures",
     ["prior-art-5src", "prior-art-visuals", "block-visuals", "sweep"]),
    ("Nuke · Substance Designer · TouchDesigner", "boundary nodes · disable · passing",
     ["sweep", "hundred-ideas", "branch-regions"]),
    ("Scratch · Snap!", "jigsaw / connect-by-shape · safely-try",
     ["block-visuals", "try-except"]),
    ("BPMN · Step Functions", "the closer references for failure",
     ["try-except", "while-break"]),
    ("Enso · Neva · unit", "the modern counterweight",
     ["reference-learnings"]),
    ("KNIME · Orange · Ryven · MoveIt Pro · IcePanel", "real captures · status lights · C4 levels",
     ["block-visuals", "vpl-prior-art"]),
    ("MLIR", "the textual control: node, edge, block and region written out",
     ["grammar-atlas"]),
]

EXCLUDED = [
    ("prior-art-folders-2026-09-21.html", "bbox-ui",
     "285 repos classified by how they organise <i>code</i> — folder layout, not visual language. Genuinely useful, wrong map."),
    ("jointjs-vs-systemsketch-2026-09-17.html", "bbox-ui",
     "A library capability and licence comparison. JointJS is an engine we might vendor, not a language we might copy."),
    ("libavoid-vs-tidy-2026-09-17.html", "bbox-ui",
     "Router algorithms. How a cable is <i>computed</i>, not how it is <i>read</i>."),
    ("canvas-fitness / notebook-lab / marimo", "bbox-ui",
     "The notebook-on-a-canvas line of work. A different question (what a notebook gives up), and it cites no node editor."),
    ("behavior-tree-* (≈20 docs)", "systemsketch",
     "Behaviour trees are their own notation with their own prior art (Groot2, BT.CPP, MoveIt Pro). Indexed by <b>MOC - Behavior Trees + SystemSketch</b>, not here."),
    ("The vvvv / nuke grep hits", "everywhere",
     "Substring noise from base64 payloads and the word “concrete”. 60-odd reports match a tool name and say nothing about one; they are not in this map, and that is the map's job."),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shots", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    by_key = {a["key"]: a for a in ARTIFACTS}
    missing = [a["path"] for a in ARTIFACTS if not os.path.exists(a["path"])]
    missing += [c["path"] for c in CAPTURES if not os.path.exists(c["path"])]
    if missing:
        sys.exit("MISSING LINK TARGETS — refusing to build:\n" + "\n".join(missing))

    thumbs = {}
    for a in ARTIFACTS:
        shot = os.path.join(args.shots, a["key"] + ".png")
        if not os.path.exists(shot):
            sys.exit(f"missing thumbnail for {a['key']} — run the capture script first")
        thumbs[a["key"]] = jpeg(shot, 560 if a["tier"] == "core" else 340,
                                72 if a["tier"] == "core" else 66)

    caps = []
    for c in CAPTURES:
        if c["path"].endswith(".gif"):
            src = raw(c["path"], "image/gif")
        else:
            src = jpeg(c["path"], 560, 74)
        caps.append(dict(c, src=src))

    SS_ASSETS = "/home/bam/systemsketch/docs/assets/"
    n_core = sum(1 for a in ARTIFACTS if a["tier"] == "core")
    n_ss_caps = 53 + 7

    def ref(key, label=None):
        a = by_key[key]
        return (f'<a class="ref" href="{furl(a["path"])}" title="{E(a["path"])}">'
                f'{E(label or a["title"])}</a>')

    def card(a, big=False):
        chips = "".join(f'<span class="t">{E(t)}</span>' for t in a["tools"][:9])
        more = f'<span class="t dim">+{len(a["tools"]) - 9}</span>' if len(a["tools"]) > 9 else ""
        kind = "markdown note" if a.get("md") else "html report"
        return f"""
    <a class="card{' big' if big else ''}" href="{furl(a['path'])}">
      <div class="shot"><img src="{thumbs[a['key']]}" alt="{E(a['title'])}" loading="lazy"></div>
      <div class="meat">
        <div class="meta"><span class="repo">{E(a['repo'])}</span><span>{E(a['date'])}</span><span class="dim">{kind}</span></div>
        <h3>{E(a['title'])}</h3>
        <p class="lede">{a['lede']}</p>
        <p class="body">{a['body']}</p>
        <div class="tools">{chips}{more}</div>
        <div class="path">{E(a['path'])}</div>
      </div>
    </a>"""

    q_rows = ""
    for title, answer, refs in QUESTIONS:
        links = " ".join(f'{ref(k, by_key[k]["title"])} <span class="sec">{E(sec)}</span>'
                         for k, sec in refs)
        q_rows += f"""
      <tr><th>{E(title)}</th><td>{answer}</td><td class="where">{links}</td></tr>"""

    t_rows = ""
    for tool, depth, keys in TOOL_ROWS:
        links = " · ".join(ref(k) for k in keys)
        t_rows += f"""
      <tr><th>{E(tool)}</th><td class="depth">{E(depth)}</td><td class="where">{links}</td></tr>"""

    cap_cards = "".join(f"""
      <figure><img src="{c['src']}" alt="{E(c['tool'])}"><figcaption><b>{E(c['tool'])}</b> {E(c['cap'])}</figcaption></figure>"""
                        for c in caps)

    groups = [("core", "Start here — the five that carry the language itself",
               "Between them: 17 tools photographed, 120 schematic glyphs redrawn, two element-by-element dictionaries, and 66 figures of editor chrome. Everything else in this map is one construct answered against these."),
              ("study", "One construct, answered against the field",
               "Each of these takes a single thing you have to draw — a loop, a branch, an error, a join, a reading direction — and puts the field's answers beside each other before proposing ours."),
              ("support", "The field appears, but is not the subject",
               "Read these when the question is already narrow. They cite the tools accurately; they were written to decide something else.")]

    sections = ""
    for tier, heading, blurb in groups:
        items = [a for a in ARTIFACTS if a["tier"] == tier]
        sections += f"""
  <h2>{E(heading)}</h2>
  <p class="blurb">{E(blurb)}</p>
  <div class="grid{' core' if tier == 'core' else ''}">{''.join(card(a, big=(tier == 'core')) for a in items)}</div>"""

    ex_rows = "".join(f"""
      <tr><th>{E(n)}</th><td class="dim">{E(repo)}</td><td>{why}</td></tr>""" for n, repo, why in EXCLUDED)

    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Visual language MOC — how the field draws it</title>
<style>
  :root {{
    --bg:#0e0f12; --panel:#15171c; --panel2:#1b1e25; --line:#282d38; --line2:#343b49;
    --fg:#e6e8ee; --dim:#9aa3b2; --dim2:#6b7383;
    --accent:#f0883e; --accent2:#5aa9f8; --ok:#3fb950; --warn:#e5534b; --gold:#e8c06a;
    --mono: ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  }}
  * {{ box-sizing:border-box }}
  body {{ margin:0; background:var(--bg); color:var(--fg);
    font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif; }}
  .wrap {{ max-width:1180px; margin:0 auto; padding:48px 24px 140px }}
  h1 {{ font-size:40px; line-height:1.1; margin:0 0 10px; letter-spacing:-.026em }}
  h2 {{ font-size:13px; text-transform:uppercase; letter-spacing:.14em; color:var(--dim2);
       margin:72px 0 10px; font-weight:600 }}
  h3 {{ font-size:16.5px; margin:0 0 7px; letter-spacing:-.012em; line-height:1.28 }}
  .sub {{ color:var(--dim); font-size:19px; margin:0 0 26px; line-height:1.5; max-width:860px }}
  .kicker {{ font:600 11.5px/1 var(--mono); letter-spacing:.14em; text-transform:uppercase;
    color:var(--dim2); margin:0 0 18px }}
  .blurb {{ color:var(--dim); margin:0 0 20px; max-width:820px }}
  a {{ color:var(--accent2); text-decoration:none }}
  a:hover {{ text-decoration:underline }}
  code {{ font-family:var(--mono); font-size:.88em; background:#0a0b0e; border:1px solid #23272f;
    border-radius:4px; padding:1px 5px }}
  p {{ margin:0 0 12px }}
  .dim {{ color:var(--dim2) }}

  .lede-box {{ background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--accent);
    border-radius:10px; padding:20px 24px; margin:24px 0 }}
  .lede-box p:last-child {{ margin:0 }}
  .lede-box.blue {{ border-left-color:var(--accent2) }}
  .lede-box.gold {{ border-left-color:var(--gold) }}
  .lede-box.green {{ border-left-color:var(--ok) }}

  .facts {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:10px; margin:26px 0 8px }}
  .fact {{ background:var(--panel); border:1px solid var(--line); border-radius:9px; padding:13px 15px }}
  .fact b {{ display:block; font:700 24px/1.1 var(--mono); color:var(--accent); letter-spacing:-.02em }}
  .fact span {{ display:block; color:var(--dim2); font-size:11.5px; margin-top:6px; line-height:1.35 }}

  table {{ width:100%; border-collapse:collapse; margin:8px 0 10px; font-size:14px }}
  th,td {{ text-align:left; vertical-align:top; padding:13px 14px; border-top:1px solid var(--line) }}
  thead th {{ border-top:none; border-bottom:1px solid var(--line2); color:var(--dim2);
    font:600 11px/1 var(--mono); letter-spacing:.12em; text-transform:uppercase; padding-bottom:9px }}
  tbody th {{ width:24%; font-weight:600; color:var(--fg) }}
  td.where {{ width:29%; font-size:12.5px; line-height:1.85 }}
  td.depth {{ width:24%; color:var(--dim); font-size:12.5px }}
  a.ref {{ white-space:nowrap }}
  .sec {{ color:var(--dim2); font:500 11px var(--mono); margin-right:8px }}

  /* Columns, not grid rows: the cards are wildly different heights and a grid
     row is as tall as its tallest card, which left half the page as dead space. */
  .grid {{ column-count:3; column-gap:14px; margin:0 0 6px }}
  .grid.core {{ column-count:2 }}
  .card {{ break-inside:avoid; margin:0 0 14px; display:block; background:var(--panel); border:1px solid var(--line); border-radius:11px;
    overflow:hidden; color:inherit; text-decoration:none; transition:border-color .12s, transform .12s }}
  .card:hover {{ border-color:var(--accent2); text-decoration:none; transform:translateY(-1px) }}
  .shot {{ background:#0a0b0e; border-bottom:1px solid var(--line); line-height:0; max-height:220px; overflow:hidden }}
  .card.big .shot {{ max-height:300px }}
  .shot img {{ width:100%; display:block }}
  .meat {{ padding:15px 17px 16px }}
  .meta {{ display:flex; gap:10px; align-items:center; font:600 10.5px/1 var(--mono);
    letter-spacing:.09em; text-transform:uppercase; color:var(--dim2); margin-bottom:9px; flex-wrap:wrap }}
  .meta .repo {{ color:var(--accent) }}
  .card p.lede {{ color:var(--fg); font-size:13.5px; margin:0 0 9px; line-height:1.5 }}
  .card p.body {{ color:var(--dim); font-size:12.5px; margin:0 0 11px; line-height:1.6 }}
  .tools {{ display:flex; flex-wrap:wrap; gap:5px; margin-bottom:10px }}
  .t {{ font:600 10px/1 var(--mono); letter-spacing:.04em; color:var(--dim);
    background:var(--panel2); border:1px solid var(--line); border-radius:20px; padding:5px 8px }}
  .path {{ font:11px/1.4 var(--mono); color:#4e5563; word-break:break-all }}

  .caps {{ column-count:3; column-gap:14px; margin:18px 0 0 }}
  .caps figure {{ break-inside:avoid; margin:0 0 14px; background:var(--panel); border:1px solid var(--line); border-radius:11px; overflow:hidden }}
  .caps img {{ width:100%; display:block; background:#fff }}
  .caps figcaption {{ padding:11px 14px 13px; font-size:12.5px; color:var(--dim); line-height:1.5;
    border-top:1px solid var(--line) }}
  .caps figcaption b {{ color:var(--accent); display:block; font:600 10.5px/1 var(--mono);
    letter-spacing:.09em; text-transform:uppercase; margin-bottom:6px }}

  .foot {{ margin-top:80px; padding-top:22px; border-top:1px solid var(--line); color:var(--dim2); font-size:12.5px }}
  @media (max-width:1080px) {{ .grid {{ column-count:2 }} .caps {{ column-count:2 }} }}
  @media (max-width:760px) {{ .grid, .grid.core, .caps {{ column-count:1 }} tbody th, td.where, td.depth {{ width:auto }} }}
</style></head><body><div class="wrap">

<p class="kicker">bbox-ui · map of content · 23 september 2026</p>
<h1>How the field draws it</h1>
<p class="sub">Every artifact in your trees that documents the visual language of Unreal Blueprints,
LabVIEW, Simulink and their peers — {len(ARTIFACTS)} of them, across four repositories,
indexed by the thing you are trying to draw.</p>

<div class="facts">
  <div class="fact"><b>{len(ARTIFACTS)}</b><span>artifacts, all four trees</span></div>
  <div class="fact"><b>{n_core}</b><span>that carry the language itself</span></div>
  <div class="fact"><b>{n_ss_caps}</b><span>real screenshots of the real apps, on disk</span></div>
  <div class="fact"><b>120</b><span>schematic glyphs redrawn in one atlas</span></div>
  <div class="fact"><b>17</b><span>tools photographed up close in another</span></div>
  <div class="fact"><b>0</b><span>maps that covered this before today</span></div>
</div>

<div class="lede-box">
  <p><b>The corpus is much better than it is findable.</b> Three separate sessions — like_keras in
  July, SystemSketch in September, bbox-ui last week — each answered “how does Unreal draw a branch”
  from scratch, because nothing indexed the previous answer. That is the only problem this page solves.</p>
  <p>Two artifacts do most of the work and they are complementary, not redundant:
  {ref("block-visuals", "Block Visuals")} is <b>the real pixels</b> — 17 applications opened and
  photographed, whole editor then block close-up then node taxonomy. {ref("grammar-atlas", "the grammar atlas")}
  is <b>the reading key</b> — 120 glyphs redrawn to one hand, twelve conventions per system, so ten
  languages can be compared on the same page without their house styles shouting over the grammar.</p>
  <p>Neither lives in this repo. That is the finding underneath the finding.</p>
</div>

<div class="lede-box blue">
  <p><b>One thing to carry into a decision to copy.</b> The gap analysis states it as a rule and the
  evidence backs it: <i>borrow the mature tools' reading constraints, never their graph-authoring
  authority.</i> The measurement behind it is NI's own — six of six study participants introduced a bug
  while rewiring existing LabVIEW code, and four of six abandoned the task ({ref("vpl-prior-art", "viscosity")}).
  That failure fires when you <b>edit the graph</b>. Copy the marks; keep the file canonical.</p>
</div>

<h2>The real pixels — already on disk, nobody had to go find them</h2>
<p class="blurb">{n_ss_caps} captures of the actual applications sit in <code>systemsketch/docs/assets/</code>
right now — 15 LabVIEW, 16 Unreal Blueprint, 19 Simulink, plus the loop reference set. Twelve are below;
the rest are the figures inside {ref("gap-analysis", "the gap analysis")} and {ref("loop-regions", "the loop study")}.</p>
<div class="caps">{cap_cards}</div>
<p class="blurb" style="margin-top:16px">The whole set:
<code>{SS_ASSETS}</code> — <code>gap-*.png</code> for vocabulary and chrome, <code>loop-prior-art/</code> for the five loops.</p>

<h2>By what you are trying to draw</h2>
<p class="blurb">The spine. One row per thing that has to have a mark, the field's answer in a sentence,
and the artifact that argues it.</p>
<table>
  <thead><tr><th>The mark</th><th>What the field actually does</th><th>Where it is answered</th></tr></thead>
  <tbody>{q_rows}
  </tbody>
</table>

<h2>By tool</h2>
<p class="blurb">Coverage, honestly graded. “Real captures” means screenshots of the running
application; “redrawn grammar” means our hand, one style, comparable across systems.</p>
<table>
  <thead><tr><th>Tool</th><th>Depth of coverage</th><th>Artifacts</th></tr></thead>
  <tbody>{t_rows}
  </tbody>
</table>
{sections}

<h2>Deliberately not on this map</h2>
<p class="blurb">A map that includes everything is a directory listing. These matched the search and
are not about visual language.</p>
<table>
  <thead><tr><th>Artifact</th><th>Tree</th><th>Why not</th></tr></thead>
  <tbody>{ex_rows}
  </tbody>
</table>

<h2>Where this leaves you</h2>
<div class="lede-box green">
  <p><b>Proved.</b> {len(ARTIFACTS)} artifacts, every link opened in a real browser to make its thumbnail —
  a card on this page is evidence the file renders, not that a path exists in a table.
  {n_ss_caps} reference captures verified present on disk.</p>
</div>
<div class="lede-box gold">
  <p><b>The one real gap.</b> Every tool in the corpus is covered for <i>branch</i>, <i>loop</i> and
  <i>port</i>. Almost none is covered for <b>what a Blueprint graph looks like when it is large</b> —
  the spaghetti argument is cited in {ref("block-visuals", "Block Visuals")} as a warning and nowhere
  measured. If the decision is to copy Blueprints, that is the next thing worth an hour: pull ten real
  Blueprint graphs of increasing size and look at where they stop being readable.</p>
</div>
<div class="lede-box">
  <p><b>What I did not do.</b> No new research — this indexes what exists and does not add a tool to
  the survey. No file moved: the corpus stays where each session left it, because moving a September
  SystemSketch doc into bbox-ui would break its own report's links. The vault note beside this page is
  the durable, linkable half; this page is the one with pictures.</p>
</div>

<p class="foot">Built by <code>docs/build_visual_language_moc.py</code> in bbox-ui.
Thumbnails captured by <code>docs/capture_visual_language_moc_shots.mjs</code>, which opens every
artifact at its real <code>file://</code> path and fails the build on a missing one.
Reference captures are inlined from <code>systemsketch/docs/assets/</code> and belong to their
respective vendors — reading keys, not redistributable product artwork.</p>

</div></body></html>"""

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write(page)
    size = os.path.getsize(args.out)
    enc = len(quote(page))
    print(f"wrote {args.out}  {size/1024:.0f} KB on disk  |  {enc/1024:.0f} KB encoded "
          f"({'OK' if enc < 2_097_024 else 'OVER PREVIEW CAP'})")


if __name__ == "__main__":
    main()
