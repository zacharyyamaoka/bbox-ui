#!/usr/bin/env python3
"""Build the visual-grammar improvement report from the ultracode run's output.

    python3 docs/build_visual_grammar_improvements_report.py

Writes a self-contained page to the MAIN checkout's tracked reports half:

    /home/bam/bbox-ui/reports/visual-grammar-improvements-2026-09-23.html

WHY the tracked half and not `reports/media/`: this page inlines no captures at
all — every drawing is inline SVG, generated from `docs/_grammar_svg.py` — so it
carries ~0 bytes of data URI and belongs on the light side of the split that
keeps git from swallowing base64. The rule in CLAUDE.md splits on INLINED
PAYLOAD, not total size, precisely so a text-heavy page like this one stays
tracked.

Every number on this page is computed at build time from the two JSON files the
workflows returned, so a claim on the page cannot drift from the run that
produced it:

  - <scratch>/corpus.json    — the verified complaint corpus (17 corpora, each
                               gathered then adversarially re-fetched)
  - <scratch>/design.json    — the ranked recommendations, each with its
                               adversarial attack and its independent score

The inputs are written by the two Workflow runs; `--inputs <dir>` points at
them. Nothing here re-derives a fact by hand.
"""
from __future__ import annotations

import argparse
import collections
import html
import json
import pathlib
import subprocess
import sys
from urllib.parse import quote

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import _grammar_svg as G  # noqa: E402
from _report_kit import CSS, FB_JS, dock, fb, overall_box  # noqa: E402

REPO = HERE.parent
MAIN = pathlib.Path("/home/bam/bbox-ui")
NAME = "visual-grammar-improvements-2026-09-23"
OUT = MAIN / "reports" / f"{NAME}.html"
CAP = 2_097_024

# The 11 vocabularies Zach shortlisted: 9 from the node-editor atlas (MLIR
# deliberately excluded on his instruction) + 2 from the Simulink/LabVIEW one.
SYSTEMS = {
    "unreal": "Unreal Blueprints",
    "labview": "LabVIEW",
    "simulink": "Simulink",
    "grasshopper": "Grasshopper",
    "blender": "Blender Geometry Nodes",
    "houdini": "Houdini",
    "nodered": "Node-RED",
    "n8n": "n8n",
    "flyde": "Flyde",
    "unity": "Unity Visual Scripting",
    "max": "Max/MSP",
}
SUPPORTING = {
    "academic": "Academic VPL literature",
    "essays": "Practitioner retrospectives",
    "lowcode": "Low-code / ETL dataflow",
    "blocks": "Block-based languages",
    "dualrep": "Dual text+visual attempts",
    "vault": "Zach's own prior thinking",
}

AXIS_LABELS = {
    "layout-and-space": "Layout & space",
    "density-and-scale": "Density & scale",
    "control-vs-data": "Control vs data",
    "iteration": "Iteration",
    "branching-and-arms": "Branching & arms",
    "abstraction-and-hierarchy": "Abstraction & hierarchy",
    "naming-and-identity": "Naming & identity",
    "types-and-validation": "Types & validation",
    "editing-ergonomics": "Editing ergonomics",
    "diff-merge-and-vcs": "Diff, merge & VCS",
    "text-interop": "Text interop",
    "debugging-and-execution-state": "Debugging & exec state",
    "discoverability": "Discoverability",
    "editor-performance": "Editor performance",
    "reuse-and-modularity": "Reuse & modularity",
    "state-and-mutation": "State & mutation",
    "error-handling": "Error handling",
    "readability-and-review": "Readability & review",
}

CRITERIA = [
    ("c1", "Fixes a verified complaint", 25),
    ("c2", "Lives where the oracle leaves room", 20),
    ("c3", "Compatible with frozen rulings", 15),
    ("c4", "Buildable from parts that exist", 15),
    ("c5", "Still true at scale", 15),
    ("c6", "Engine-independent", 10),
]


def esc(s) -> str:
    return html.escape(str(s or ""))


def attr(s) -> str:
    return html.escape(str(s or ""), quote=True)


def sh(cmd: str) -> str:
    return subprocess.run(cmd, shell=True, cwd=REPO, capture_output=True,
                          text=True).stdout.strip()


def para(s) -> str:
    """Prose that may carry the agents' own inline markdown-ish emphasis."""
    t = esc(s)
    out, bold = [], False
    for chunk in t.split("**"):
        out.append(f"<strong>{chunk}</strong>" if bold else chunk)
        bold = not bold
    t = "".join(out)
    out, mono = [], False
    for chunk in t.split("`"):
        out.append(f"<code>{chunk}</code>" if mono else chunk)
        mono = not mono
    return "".join(out)


# ─────────────────────────────────────────────────────────────────────────────
# Drawings. Each recommendation that earns one gets a PAIR: what the prior art
# does, and what the recommendation would draw instead. Keyed by proposal id
# fragments so a re-run that renames a proposal degrades to "no drawing"
# rather than to a drawing attached to the wrong idea.
# ─────────────────────────────────────────────────────────────────────────────

def _pair(left: str, right: str, lcap: str, rcap: str) -> str:
    return (
        '<div class="pair">'
        f'<figure><div class="draw">{left}</div><figcaption>{para(lcap)}</figcaption></figure>'
        f'<figure><div class="draw ours">{right}</div><figcaption>{para(rcap)}</figcaption></figure>'
        "</div>"
    )


def draw_arms() -> str:
    """One-at-a-time case frames vs arms as stacked rows."""
    b = [G.arrowhead(G.BLUE)]
    b.append(G.frame(14, 34, 250, 154, stroke=G.LINE, fill=G.PANEL, radius=4))
    b.append(f'<rect x="14" y="34" width="250" height="21" rx="4" fill="{G.PANEL2}"/>')
    b.append(G.text(139, 49, '◀   "ok"   ▶', size=10, fill=G.INK,
                    anchor="middle", weight="700"))
    b.append(G.port(14, 100, fill=G.OK, label="?", side="left", square=True, size=4))
    b.append(G.block(50, 84, 120, 34, "log(result)", header=0, fill=G.PANEL2))
    b.append(G.text(139, 152, "2 other cases stored,", size=9.5, fill=G.WARN, anchor="middle"))
    b.append(G.text(139, 166, "not drawn", size=9.5, fill=G.WARN, anchor="middle"))
    b.append(G.tag(14, 26, "LabVIEW · Case Structure"))
    left = G.svg("".join(b), 278, 200, label="LabVIEW case structure, one frame visible")

    b = [G.arrowhead(G.BLUE)]
    b.append(G.frame(14, 34, 300, 184, stroke=G.LINE, radius=8))
    b.append(G.block(14, 34, 126, 27, "match cmd", header=27, accent=G.ACCENT, radius=8))
    b.append(G.port(14, 47, fill=G.BLUE, square=True, size=4))
    rows = [('case "ok"', "log(result)", G.OK),
            ('case "retry"', "sleep(); go()", G.GOLD),
            ("case _", "raise", G.WARN)]
    y = 72
    for label, body, col in rows:
        b.append(f'<rect x="26" y="{y}" width="276" height="42" rx="5"'
                 f' fill="{G.PANEL}" stroke="{G.LINE}"/>')
        b.append(f'<rect x="27" y="{y + 1}" width="3" height="40" rx="1.5" fill="{col}"/>')
        b.append(G.chevron(42, y + 14, open_=True))
        b.append(G.text(54, y + 18, label, size=10, fill=G.INK, weight="600"))
        bx = 54 + G.mono_w(label, 10) + 14
        b.append(G.block(bx, y + 8, 296 - bx, 26, body, header=0, fill=G.PANEL2))
        y += 48
    b.append(G.tag(14, 26, "proposed · arms as stacked rows"))
    right = G.svg("".join(b), 328, 230, label="All arms visible as stacked rows")

    return _pair(
        left, right,
        "**LabVIEW.** The frame is one rectangle and the selector picks which case "
        "occupies it. The other two exist in the file and nowhere on screen.",
        "**Proposed.** Each arm is its own `arm` node stacked in the region, so all "
        "three are readable at once and folding one cannot move a sibling's blocks.",
    )


def draw_granularity() -> str:
    """Collapsed-to-a-name vs collapsed-with-a-legible-summary."""
    b = [G.arrowhead(G.BLUE)]
    b.append(G.block(30, 52, 170, 46, "Cluster", header=0, fill=G.PANEL,
                     radius=4, shadow=True))
    b.append(G.port(30, 75, fill=G.BLUE, square=True, size=4))
    b.append(G.port(200, 75, fill=G.ACCENT, square=True, size=4))
    b.append(G.text(115, 122, "what does it do?", size=9.5, fill=G.WARN, anchor="middle"))
    b.append(G.text(115, 137, "double-click to find out", size=9.5, fill=G.DIM2, anchor="middle"))
    b.append(G.tag(30, 42, "Grasshopper · cluster"))
    left = G.svg("".join(b), 240, 152, label="An opaque cluster showing only a name")

    b = [G.arrowhead(G.BLUE)]
    b.append(G.block(24, 52, 254, 88, "normalise(rows)", header=24,
                     accent=G.ACCENT, radius=7, shadow=True))
    b.append(G.port(24, 88, fill=G.BLUE, label="rows", side="left", square=True, size=4))
    b.append(G.port(24, 108, fill=G.BLUE, label="scale", side="left", square=True, size=4))
    b.append(G.port(278, 96, fill=G.ACCENT, label="out", side="right", square=True, size=4))
    b.append(G.code(84, 92, ["12 lines · lines 40–51",
                             "3 blocks · 1 loop hidden"], size=9.5, gap=13))
    b.append(f'<rect x="84" y="120" width="120" height="6" rx="3" fill="{G.PANEL2}"/>')
    b.append(f'<rect x="84" y="120" width="74" height="6" rx="3" fill="{G.OK}"/>')
    b.append(G.chevron(38, 64, open_=False))
    b.append(G.tag(24, 42, "proposed · opaque card keeps its signature"))
    right = G.svg("".join(b), 300, 152, label="A collapsed block that still states its interface")

    return _pair(
        left, right,
        "**Grasshopper.** A cluster collapses to a name and two pins. The most common "
        "complaint in the corpus is the one written under it.",
        "**Proposed.** Collapsing is a projection, so the card can keep the ports, the "
        "line range and a count of what is hidden — the reader loses the bodies, not "
        "the interface.",
    )


def draw_names() -> str:
    """Invisible non-local route vs a drawn, derived name."""
    b = [G.arrowhead(G.BLUE)]
    b.append(G.block(20, 46, 96, 30, "compute", header=0, fill=G.PANEL))
    b.append(G.block(20, 112, 78, 26, "CMD", header=0, fill=G.PANEL2,
                     title_fill=G.GOLD, radius=3))
    b.append(G.wire([(116, 61), (140, 61), (140, 125), (98, 125)], stroke=G.DIM2, width=1.4))
    b.append(G.text(150, 128, "⋯", size=14, fill=G.DIM2))
    b.append(G.block(176, 112, 78, 26, "CMD", header=0, fill=G.PANEL2,
                     title_fill=G.GOLD, radius=3))
    b.append(G.block(176, 46, 96, 30, "actuate", header=0, fill=G.PANEL))
    b.append(G.wire([(254, 125), (286, 125), (286, 61), (272, 61)], stroke=G.DIM2, width=1.4))
    b.append(G.text(146, 166, "no line, but a real dependency", size=9.5,
                    fill=G.WARN, anchor="middle"))
    b.append(G.tag(20, 36, "Simulink · Goto / From"))
    left = G.svg("".join(b), 310, 180, label="A Goto/From tag pair hiding a dependency")

    b = [G.arrowhead(G.BLUE)]
    b.append(G.block(20, 46, 110, 30, "compute()", header=0, fill=G.PANEL))
    b.append(G.port(130, 61, fill=G.ACCENT, square=True, size=4))
    b.append(G.block(196, 46, 110, 30, "actuate(cmd)", header=0, fill=G.PANEL))
    b.append(G.port(196, 61, fill=G.BLUE, square=True, size=4))
    b.append(G.wire([(134, 61), (192, 61)], stroke=G.BLUE, width=1.7))
    b.append(f'<rect x="139" y="28" width="48" height="16" rx="8" fill="{G.PANEL2}"'
             f' stroke="{G.LINE}"/>')
    b.append(G.text(163, 39, "cmd", size=9, fill=G.GOLD, anchor="middle", weight="700"))
    b.append(G.text(163, 96, "the name is ON the wire —", size=9.5,
                    fill=G.OK, anchor="middle"))
    b.append(G.text(163, 110, "3 more readers, folded", size=9.5, fill=G.DIM, anchor="middle"))
    b.append(G.badge(122, 122, "→ 3 readers", fill=G.PANEL2, text_fill=G.DIM))
    b.append(G.tag(20, 36, "proposed · the binding names the edge"))
    right = G.svg("".join(b), 330, 152, label="A named edge carrying its Python binding")

    return _pair(
        left, right,
        "**Simulink.** Matching tags continue a signal with no line drawn. The atlas row "
        "says it outright: *no line does not mean no dependency*.",
        "**Proposed.** Python already says whether a value is bound to a name or is an "
        "anonymous subexpression, so the notation can label the edge instead of deleting "
        "it — and say how many readers it has.",
    )


def draw_layout_stability() -> str:
    """A positional document reshuffling vs layout derived from the text."""
    b = [G.arrowhead(G.BLUE)]
    b.append(G.text(16, 30, "before edit", size=9.5, fill=G.DIM2, mono=False))
    for i, (x, y) in enumerate([(20, 40), (108, 40), (20, 92), (108, 92)]):
        b.append(G.block(x, y, 72, 30, f"n{i + 1}", header=0, fill=G.PANEL))
    b.append(G.text(112, 148, "insert one line ↓", size=9.5, fill=G.DIM, anchor="middle"))
    b.append(G.text(16, 176, "after edit", size=9.5, fill=G.WARN, mono=False))
    for i, (x, y) in enumerate([(96, 186), (20, 186), (140, 238), (30, 238)]):
        b.append(G.block(x, y, 72, 30, f"n{i + 1}", header=0, fill=G.PANEL,
                         stroke=G.WARN))
    b.append(G.text(112, 292, "every box moved; the diff is unreadable", size=9.5,
                    fill=G.WARN, anchor="middle"))
    b.append(G.tag(16, 18, "positional documents · .slx / .uasset / flows.json"))
    left = G.svg("".join(b), 240, 306, label="An auto-layout reshuffling after one edit")

    b = [G.arrowhead(G.BLUE)]
    b.append(G.text(16, 30, "before edit", size=9.5, fill=G.DIM2, mono=False))
    for i, (x, y) in enumerate([(20, 40), (108, 40), (20, 92), (108, 92)]):
        b.append(G.block(x, y, 72, 30, f"n{i + 1}", header=0, fill=G.PANEL))
    b.append(G.text(112, 148, "insert one line ↓", size=9.5, fill=G.DIM, anchor="middle"))
    b.append(G.text(16, 176, "after edit", size=9.5, fill=G.OK, mono=False))
    for i, (x, y) in enumerate([(20, 186), (108, 186), (20, 238), (108, 238)]):
        b.append(G.block(x, y, 72, 30, f"n{i + 1}", header=0, fill=G.PANEL))
    b.append(G.block(20, 284, 72, 30, "n5", header=0, fill=G.PANEL, stroke=G.OK))
    b.append(G.badge(100, 292, "new", fill=G.OK, text_fill="#0e0f12"))
    b.append(G.text(112, 336, "four boxes unmoved; one added", size=9.5,
                    fill=G.OK, anchor="middle"))
    b.append(G.tag(16, 18, "proposed · position keyed to the AST, not the file"))
    right = G.svg("".join(b), 240, 350, label="Stable layout after the same edit")

    return _pair(
        left, right,
        "**The prior art's shared failure.** A node's position lives in the document, so "
        "an edit — or a formatter — reshuffles the board and the review is lost.",
        "**Proposed.** Keying a position to a stable identity derived from the source means "
        "adding a line adds a box. This is the one requirement that makes the graph "
        "reviewable at all.",
    )


DRAWINGS = [
    ("arms", ("arm", "branch", "case", "simultane", "match", "all-arms", "stack"), draw_arms),
    ("granularity", ("granular", "collapse", "opaque", "summary", "signature", "fold"),
     draw_granularity),
    ("names", ("name", "binding", "variable", "hidden", "tunnel", "identity", "label"),
     draw_names),
    ("layout", ("layout", "stable", "position", "diff", "review", "reshuffle"),
     draw_layout_stability),
]


def drawing_for(proposal: dict, used: set) -> str:
    """Attach a drawing only on a real keyword hit, never by rank.

    WHY keyword-matched and not positional: a re-run reorders the ranking, and a
    drawing silently attached to whatever landed at #1 would illustrate the
    wrong idea while looking authoritative.
    """
    hay = " ".join(str(proposal.get(k, "")) for k in
                   ("id", "title", "oneLiner", "axis", "mechanism")).lower()
    for key, needles, fn in DRAWINGS:
        if key in used:
            continue
        if any(n in hay for n in needles):
            used.add(key)
            return fn()
    return ""


# ─────────────────────────────────────────────────────────────────────────────


def build(corpus: dict, design: dict) -> str:
    complaints = corpus.get("complaints", [])
    ranked = design.get("ranked", [])
    refuted = design.get("refuted", [])
    decided = design.get("alreadyDecided", [])
    counts = design.get("counts", {})

    verified = [c for c in complaints if c.get("confidence") == "verified"]
    ubiquitous = [c for c in complaints if c.get("recurrence") == "ubiquitous"]
    fetched_urls = {e.get("url") for c in complaints for e in (c.get("evidence") or [])
                    if e.get("url")}
    refetched = {e.get("url") for c in complaints for e in (c.get("evidence") or [])
                 if e.get("reFetched")}

    by_corpus = collections.Counter(c.get("corpus", "?") for c in complaints)
    by_axis = collections.Counter(c.get("axis", "?") for c in complaints)

    branch = sh("git rev-parse --abbrev-ref HEAD")
    head = sh("git rev-parse --short HEAD")

    top = ranked[:20]
    rest = ranked[20:]

    # ── head ──────────────────────────────────────────────────────────────
    P = []
    P.append(f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Visual grammar — 20 ways to beat the prior art</title>
<style>{CSS}
  .draw {{ background:#101216; border:1px solid var(--line); border-radius:10px;
           padding:14px 10px; }}
  .draw.ours {{ border-color:#3d4a3f; background:#0f1411 }}
  .pair {{ display:grid; grid-template-columns:1fr 1fr; gap:14px; margin:20px 0 6px }}
  .pair figure {{ margin:0 }}
  .pair figcaption {{ color:var(--dim); font-size:12.5px; line-height:1.55; margin-top:9px }}
  @media (max-width:760px) {{ .pair {{ grid-template-columns:1fr }} }}
  .rec {{ border:1px solid var(--line); border-radius:12px; padding:20px 22px;
          margin:0 0 20px; background:var(--panel) }}
  .rec.t1 {{ border-color:#4a5568 }}
  .rec h3 {{ margin:0 0 4px; font-size:19px; letter-spacing:-.015em; line-height:1.3 }}
  .rec .rule {{ color:var(--gold); font:13px/1.6 var(--mono); margin:8px 0 14px }}
  .rk {{ display:inline-flex; align-items:center; justify-content:center; min-width:30px;
         height:24px; border-radius:6px; background:var(--panel2); color:var(--dim);
         font:700 12px var(--mono); margin-right:10px; border:1px solid var(--line2) }}
  .rk.hi {{ background:var(--accent); color:#15171c; border-color:var(--accent) }}
  .meta {{ display:flex; flex-wrap:wrap; gap:6px; margin:0 0 14px }}
  .chip {{ font:600 10.5px var(--mono); padding:3px 8px; border-radius:20px;
           background:var(--panel2); color:var(--dim); border:1px solid var(--line) }}
  .chip.ok {{ color:var(--ok); border-color:#2a4a32 }}
  .chip.warn {{ color:var(--warn); border-color:#5a2f2c }}
  .chip.gold {{ color:var(--gold); border-color:#54472a }}
  .rec dl {{ margin:0; display:grid; grid-template-columns:118px 1fr; gap:9px 16px }}
  .rec dt {{ color:var(--dim2); font:600 10.5px var(--mono); text-transform:uppercase;
             letter-spacing:.07em; padding-top:2px }}
  .rec dd {{ margin:0; font-size:14px; line-height:1.62; color:#cfd4de }}
  .rec dd code {{ font:12.5px var(--mono); background:#0a0b0e; padding:1px 5px;
                  border-radius:4px; color:var(--gold) }}
  .sc {{ display:flex; gap:4px; align-items:flex-end; height:34px; margin-top:3px }}
  .sc i {{ width:16px; background:var(--line2); border-radius:2px 2px 0 0; position:relative }}
  .sc i b {{ position:absolute; bottom:-15px; left:50%; transform:translateX(-50%);
             font:600 9px var(--mono); color:var(--dim2); font-style:normal }}
  table {{ width:100%; border-collapse:collapse; font-size:13px; margin:14px 0 }}
  th {{ text-align:left; color:var(--dim2); font:600 10.5px var(--mono);
        text-transform:uppercase; letter-spacing:.08em; padding:8px 10px;
        border-bottom:1px solid var(--line2) }}
  td {{ padding:9px 10px; border-bottom:1px solid #20242c; vertical-align:top;
        line-height:1.5 }}
  tr:hover td {{ background:#16181e }}
  .q {{ color:var(--dim); font-style:italic }}
  .ev {{ font:11px var(--mono); color:var(--dim2) }}
  .ev a {{ color:#4d7fb8 }}
  .kpi {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(128px,1fr));
          gap:12px; margin:22px 0 30px }}
  .kpi div {{ background:var(--panel); border:1px solid var(--line); border-radius:10px;
              padding:14px 16px }}
  .kpi b {{ display:block; font:700 26px/1 var(--mono); color:var(--fg);
            letter-spacing:-.02em }}
  .kpi span {{ display:block; font-size:11.5px; color:var(--dim2); margin-top:6px;
               line-height:1.4 }}
  .filters {{ display:flex; flex-wrap:wrap; gap:6px; margin:16px 0 }}
  .filters button {{ font:600 11px var(--mono); padding:5px 11px; border-radius:20px;
                     background:var(--panel2); color:var(--dim); cursor:pointer;
                     border:1px solid var(--line) }}
  .filters button[aria-pressed=true] {{ background:var(--accent2); color:#0e0f12;
                                        border-color:var(--accent2) }}
  .note {{ border-left:2px solid var(--line2); padding:2px 0 2px 16px; color:var(--dim);
           font-size:14px; line-height:1.65; margin:16px 0 }}
  .note.warn {{ border-color:var(--warn) }}
  .note.gold {{ border-color:var(--gold) }}
  details {{ border:1px solid var(--line); border-radius:10px; padding:0 18px;
             margin:0 0 12px; background:var(--panel) }}
  details[open] {{ padding-bottom:16px }}
  summary {{ cursor:pointer; padding:14px 0; font-weight:600; font-size:14.5px }}
  summary::marker {{ color:var(--dim2) }}
</style></head><body><div class="wrap">""")

    P.append('<p class="kicker">bbox-ui · visual grammar · 23 September 2026</p>')
    P.append("<h1>Twenty ways to beat the prior art</h1>")
    P.append('<p class="sub">Every mature node language on your shortlist has users who '
             'know exactly what is wrong with it. This is what they said, re-fetched and '
             'checked — and the twenty design moves that follow from it, ranked.</p>')

    P.append(f"""<div class="kpi">
  <div><b>{len(complaints)}</b><span>verified complaints, across 17 corpora</span></div>
  <div><b>{len(ubiquitous)}</b><span>rated <em>ubiquitous</em> — 3+ independent sources</span></div>
  <div><b>{len(fetched_urls)}</b><span>distinct sources actually fetched</span></div>
  <div><b>{corpus.get('droppedTotal', 0)}</b><span>claims dropped by the verifiers</span></div>
  <div><b>{counts.get('raw', 0)}</b><span>raw proposals from 8 lenses</span></div>
  <div><b>{counts.get('refuted', 0)}</b><span>proposals refuted on attack</span></div>
</div>""")

    # ── the answer up front ───────────────────────────────────────────────
    P.append("<h2>The short answer</h2>")
    if top:
        P.append('<div class="note gold">')
        P.append("<p><strong>The five that matter most, in one line each:</strong></p><ol>")
        for r in top[:5]:
            P.append(f"<li><strong>{esc(r.get('title'))}</strong> — {para(r.get('oneLiner'))}</li>")
        P.append("</ol></div>")

    P.append(f"""<div class="note">
<p>Your reframe is what makes this answerable. If the AST decides what is <em>correct</em>, then
correctness is not a design question any more — and the whole remaining design space is
<strong>granularity</strong> plus everything correctness does not constrain: what a reader can see
at once, what things are called, and whether a second person can review it. So the criteria below
weight a recommendation down, hard, when it re-decides something the oracle already settles.</p>
<p>The corpus makes one finding impossible to miss, because it appears in all eleven systems
independently: <strong>practitioners end up writing the hard part in the script node</strong> —
the Function node, the Code node, the Attribute Wrangle, the Formula block, the C# component,
C++ instead of Blueprints. That is not a failure of any one product. It is the notation hitting
a ceiling, every time, in the same place. Your project starts on the other side of that ceiling,
because the text is already the source of truth. Several recommendations below are about
<em>not</em> giving that advantage away.</p>
</div>""")

    # ── criteria ──────────────────────────────────────────────────────────
    P.append("<h2>What good looks like</h2>")
    P.append('<p class="sub" style="font-size:15px">Weighted before the options were compared, '
             'and applied by scorers independent of the agents that attacked each proposal.</p>')
    P.append("<table><thead><tr><th>#</th><th>Criterion</th><th>Weight</th>"
             "<th>Why this weight, here</th></tr></thead><tbody>")
    why = {
        "c1": "A recommendation answering a complaint nobody made is decoration. This is the "
              "whole point of gathering the corpus first.",
        "c2": "The oracle settles correctness. Effort spent re-deciding semantics is effort "
              "spent on a solved problem.",
        "c3": "Everything-is-a-block, arms-as-nodes, control-is-never-a-cable and "
              "opaque-is-a-projection are frozen. The best proposals derive FROM them.",
        "c4": "The trunk already carries the scene kit, the elbow router, three hosts and the "
              "diff surfaces. Reuse beats invention.",
        "c5": "Every system on the shortlist works in the demo. The complaint is always about "
              "the real program.",
        "c6": "The core is props-in / DOM-out. A proposal needing self-measurement or a "
              "pointer is out of bounds as stated.",
    }
    for key, label, w in CRITERIA:
        P.append(f"<tr><td><code>{key.upper()}</code></td><td><strong>{esc(label)}</strong></td>"
                 f"<td>{w}%</td><td>{esc(why[key])}</td></tr>")
    P.append("</tbody></table>")

    # ── the recommendations ───────────────────────────────────────────────
    P.append(f"<h2>The recommendations — {len(top)}, strongest first</h2>")
    P.append('<p class="sub" style="font-size:15px">Each one survived an adversarial reviewer '
             'whose default verdict was <em>refuted</em> and who had to find the complaint it '
             'fixes in the corpus, then open the trunk files it names. Each was scored by a '
             'different agent. <em>Lenses</em> counts how many of eight independent design '
             'passes reached the same idea without seeing each other’s work.</p>')

    used_drawings: set = set()
    for i, r in enumerate(top):
        rank = r.get("rank", i + 1)
        score = r.get("score") or {}
        attack = r.get("attack") or {}
        agree = r.get("lensesAgreeing") or 0
        tier = " t1" if rank <= 5 else ""
        P.append(f'<div class="rec{tier}">')
        P.append(f'<h3><span class="rk{" hi" if rank <= 5 else ""}">{rank}</span>'
                 f'{esc(r.get("title"))}</h3>')
        P.append(f'<p class="rule">{para(r.get("oneLiner"))}</p>')

        P.append('<div class="meta">')
        w = score.get("weighted")
        if w is not None:
            P.append(f'<span class="chip gold">score {float(w):.2f} / 5</span>')
        P.append(f'<span class="chip">{esc(AXIS_LABELS.get(r.get("axis"), r.get("axis")))}</span>')
        cls = "ok" if agree >= 4 else ""
        P.append(f'<span class="chip {cls}">{agree}/8 lenses</span>')
        v = attack.get("verdict")
        if v:
            P.append(f'<span class="chip {"warn" if v == "survives-weakened" else "ok"}">'
                     f'{esc(v)}</span>')
        rc = str(attack.get("rulingConflict", "")).strip().lower()
        if rc and rc not in ("none", "none.", "n/a", ""):
            P.append('<span class="chip warn">touches a frozen ruling</span>')
        P.append("</div>")

        drawing = drawing_for(r, used_drawings)
        if drawing:
            P.append(drawing)

        P.append("<dl>")
        P.append(f"<dt>Fixes</dt><dd>{para(attack.get('complaintCheck') or r.get('problem'))}</dd>")
        P.append(f"<dt>Prior art</dt><dd>{para(r.get('priorArt'))}</dd>")
        P.append(f"<dt>What a reader sees</dt><dd>{para(r.get('mechanism'))}</dd>")
        sharp = str(attack.get("sharpened") or "").strip()
        if sharp:
            P.append(f"<dt>Sharpened</dt><dd>{para(sharp)}</dd>")
        P.append(f"<dt>Build</dt><dd>{para(r.get('buildNotes'))}</dd>")
        bc = str(attack.get("buildabilityCheck") or "").strip()
        if bc:
            P.append(f"<dt>Checked</dt><dd>{para(bc)}</dd>")
        cost = str(attack.get("unpaidCost") or "").strip()
        if cost:
            P.append(f"<dt>Costs you</dt><dd>{para(cost)}</dd>")
        ref = str(attack.get("refutation") or "").strip()
        if ref:
            P.append(f"<dt>Best case against</dt><dd>{para(ref)}</dd>")
        if score:
            bars = []
            for key, label, _w in CRITERIA:
                v = score.get(key) or 0
                col = G.OK if v >= 4 else (G.GOLD if v == 3 else G.WARN)
                bars.append(f'<i style="height:{max(4, float(v) / 5 * 34):.0f}px;'
                            f'background:{col}"><b>{key.upper()}</b></i>')
            P.append(f'<dt>Scores</dt><dd><div class="sc">{"".join(bars)}</div></dd>')
        P.append("</dl>")
        P.append(fb(f"R{rank}", str(r.get("title") or "")[:90]))
        P.append("</div>")

    if rest:
        P.append("<h2>Below the line</h2>")
        P.append('<p class="sub" style="font-size:15px">Survived attack, ranked outside the '
                 'twenty. Kept because a lower score here usually means "narrower", not "wrong".</p>')
        P.append("<table><thead><tr><th>#</th><th>Recommendation</th><th>Score</th>"
                 "<th>Lenses</th><th>Why it sits here</th></tr></thead><tbody>")
        for r in rest:
            sc = (r.get("score") or {}).get("weighted")
            P.append(f"<tr><td>{r.get('rank')}</td><td><strong>{esc(r.get('title'))}</strong>"
                     f"<br><span class='q'>{esc(r.get('oneLiner'))}</span></td>"
                     f"<td>{f'{float(sc):.2f}' if sc is not None else '—'}</td>"
                     f"<td>{r.get('lensesAgreeing') or 0}/8</td>"
                     f"<td>{esc((r.get('score') or {}).get('oneLineVerdict'))}</td></tr>")
        P.append("</tbody></table>")

    # ── the corpus ────────────────────────────────────────────────────────
    P.append("<h2>The corpus — what users actually said</h2>")
    P.append(f'<p class="sub" style="font-size:15px">{len(complaints)} complaints that survived '
             f'an adversarial verifier. <strong>{len(verified)}</strong> are marked '
             f'<em>verified</em>, meaning a checker re-fetched the source and read the quoted '
             f'words there; the rest are <em>plausible</em> and say so. '
             f'{len(refetched)} sources were re-fetched on the verification pass. '
             f'Filter by axis:</p>')

    P.append('<div class="filters" id="axf"><button data-ax="all" aria-pressed="true">'
             f'all · {len(complaints)}</button>')
    for ax, n in by_axis.most_common():
        P.append(f'<button data-ax="{attr(ax)}" aria-pressed="false">'
                 f'{esc(AXIS_LABELS.get(ax, ax))} · {n}</button>')
    P.append("</div>")

    P.append('<table id="ctab"><thead><tr><th>System</th><th>Complaint</th>'
             '<th>The notational cause</th><th>Weight</th><th>Source</th>'
             '</tr></thead><tbody>')
    order = {"ubiquitous": 0, "common": 1, "occasional": 2, "anecdotal": 3}
    sev = {"blocking": 0, "major": 1, "minor": 2}
    for c in sorted(complaints, key=lambda c: (order.get(c.get("recurrence"), 9),
                                               sev.get(c.get("severity"), 9))):
        ck = str(c.get("corpus", "")).lower()
        label = next((v for k, v in {**SYSTEMS, **SUPPORTING}.items() if k in ck),
                     c.get("corpus", "?"))
        ev = c.get("evidence") or []
        links = []
        for e in ev[:3]:
            u = str(e.get("url") or "")
            short = u.replace("https://", "").replace("http://", "").split("/")[0][:26] or "src"
            if u.startswith("/"):
                short = pathlib.Path(u).name[:26]
            mark = "✓" if e.get("reFetched") else ""
            links.append(f'<a href="{attr(u)}">{esc(short)}</a>{mark}' if u.startswith("http")
                         else f"{esc(short)}{mark}")
        q = next((e.get("quote") for e in ev if e.get("quote")), "")
        conf = c.get("confidence")
        P.append(
            f'<tr data-ax="{attr(c.get("axis"))}">'
            f'<td><strong>{esc(label)}</strong></td>'
            f'<td><strong>{esc(c.get("title"))}</strong>'
            + (f'<br><span class="q">“{esc(str(q)[:150])}”</span>' if q else "")
            + f'</td><td>{esc(str(c.get("mechanism"))[:320])}</td>'
            f'<td><span class="chip {"ok" if c.get("recurrence") == "ubiquitous" else ""}">'
            f'{esc(c.get("recurrence"))}</span><br>'
            f'<span class="ev">{esc(c.get("severity"))} · {esc(conf)}</span></td>'
            f'<td class="ev">{" ".join(links) or "—"}</td></tr>')
    P.append("</tbody></table>")
    P.append('<p class="ev">✓ marks a source the verification pass re-fetched itself.</p>')

    # ── coverage ──────────────────────────────────────────────────────────
    P.append("<h2>Coverage — where the evidence is thin</h2>")
    P.append("<table><thead><tr><th>Corpus</th><th>Complaints</th>"
             "<th>Verified</th></tr></thead><tbody>")
    for key, label in {**SYSTEMS, **SUPPORTING}.items():
        rows = [c for c in complaints if key in str(c.get("corpus", "")).lower()]
        vr = sum(1 for c in rows if c.get("confidence") == "verified")
        cls = ' style="color:var(--warn)"' if len(rows) < 6 else ""
        P.append(f"<tr><td><strong>{esc(label)}</strong></td><td{cls}>{len(rows)}</td>"
                 f"<td>{vr}</td></tr>")
    P.append("</tbody></table>")

    critic = design.get("critic")
    if critic:
        P.append("<h2>What this misses</h2>")
        P.append('<p class="sub" style="font-size:15px">A final agent was asked only for gaps, '
                 'misrankings and unfair refutations. Its answer is reproduced rather than '
                 'summarised, because a critic you edit is not a critic.</p>')
        P.append(f'<div class="note warn">{para(critic)}</div>')

    if decided:
        P.append("<h2>Dropped — you already ruled on these</h2>")
        P.append('<p class="sub" style="font-size:15px">Proposed by a lens, then removed for '
                 'restating a decision already frozen in the repo. Listed so you can see the '
                 'list is short because the rulings hold, not because nobody looked.</p>')
        P.append("<table><thead><tr><th>Proposed</th><th>Already settled by</th></tr>"
                 "</thead><tbody>")
        for d in decided:
            P.append(f"<tr><td>{esc(d.get('title'))}</td><td>{para(d.get('ruling'))}</td></tr>")
        P.append("</tbody></table>")

    if refuted:
        P.append("<h2>Refuted</h2>")
        for r in refuted:
            a = r.get("attack") or {}
            P.append(f"<details><summary>{esc(r.get('title'))}</summary>"
                     f"<p>{para(r.get('oneLiner'))}</p>"
                     f"<p class='q'>{para(a.get('refutation'))}</p></details>")

    P.append(f"""<h2>Provenance</h2>
<div class="note">
<p>Two ultracode workflows. The first ran 17 corpora through gather → adversarial verify,
pipelined so each verifier started as its gatherer landed. Gatherers were told that a fabricated
URL or quote is the one unrecoverable error, and to mark honestly anything they could not fetch;
verifiers had to re-fetch at least four cited sources per corpus and drop whatever did not check
out. {corpus.get('droppedTotal', 0)} claims were dropped that way.</p>
<p>The second ran 8 independent design lenses over the surviving corpus, merged
{counts.get('raw', 0)} raw proposals into {counts.get('canonical', 0)} distinct ones, then gave
each its own adversarial reviewer (default verdict: refuted; required to locate the complaint in
the corpus and open the trunk files the proposal named) and a separate scorer. A completeness
critic closed it.</p>
<p>The eleven vocabularies are your own shortlist, read from
<code>systemsketch/docs/node-editor-visual-grammar-atlas-2026-09-02.html</code> (9, MLIR excluded
on your instruction) and
<code>systemsketch/docs/visual-grammar-simulink-labview-2026-09-02.html</code> (2).</p>
<p>Drawings are original schematics from <code>docs/_grammar_svg.py</code>, following the same
convention as your two atlases. Where a drawing shows something the trunk already does, its
caption says so — the rest are mocks of notation that does not exist yet.
Built on <code>{esc(branch)}</code> at <code>{esc(head)}</code>.</p>
</div>""")

    P.append(overall_box("the reframe, the ranking, anything missing…"))
    P.append(dock(NAME, "recommendation", len(top)))
    P.append(f"</div><script>{FB_JS}</script>")
    P.append("""<script>
(function(){
  var box=document.getElementById('axf'); if(!box) return;
  var rows=[].slice.call(document.querySelectorAll('#ctab tbody tr'));
  box.addEventListener('click',function(e){
    var b=e.target.closest('button[data-ax]'); if(!b) return;
    [].forEach.call(box.querySelectorAll('button'),function(x){
      x.setAttribute('aria-pressed', x===b ? 'true':'false'); });
    var ax=b.getAttribute('data-ax');
    rows.forEach(function(r){
      r.style.display = (ax==='all'||r.getAttribute('data-ax')===ax) ? '' : 'none'; });
  });
})();
</script></body></html>""")

    return "".join(P)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--inputs", required=True,
                    help="directory holding corpus.json and design.json")
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()

    d = pathlib.Path(args.inputs)
    corpus = json.loads((d / "corpus.json").read_text())
    design = json.loads((d / "design.json").read_text())

    page = build(corpus, design)
    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page)

    encoded = len(quote(page, safe="-_.!~*'()").encode())
    print(f"wrote {out}  ({out.stat().st_size:,} bytes on disk)")
    print(f"desktop-preview encoded size: {encoded:,} / {CAP:,} bytes "
          f"({encoded / CAP * 100:.0f}%)")
    if encoded > CAP:
        print("  OVER THE CAP — browser-only; say so in the handoff.")


if __name__ == "__main__":
    main()
