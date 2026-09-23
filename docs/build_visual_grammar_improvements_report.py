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
import re
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

# The measured findings worth reading before the ranking, keyed by a substring
# of the complaint title that carries them. Rendered as a highlight band with
# the verbatim re-fetched quote, because these are the rows that should change
# how the list is read rather than merely support one item in it.
#
# WHY keyed by title substring and rendered only on a hit: the numbers live in
# the corpus, not in this file, so the band cannot state a figure the run did
# not verify. A corpus that no longer carries one of these silently drops the
# card instead of printing a stale number.
MEASURED = [
    ("Adding one line of logic took 8x longer",
     "8×", "slower to make one small edit",
     "Green &amp; Petre timed the same change into three implementations: LabVIEW "
     "508.3s, Prograph 193.6s, BASIC 63.3s. <strong>Viscosity, not density, is the "
     "measured weakness</strong> — and the same paper found diffuseness "
     "“less of a liability than we had supposed”."),
    ("Visual conditional notations took twice as long",
     "2×", "slower to comprehend a conditional",
     "Green, Petre &amp; Bellamy set LabVIEW’s two visual conditional forms "
     "against two textual ones. The match-mismatch effect appeared but was smaller "
     "than expected; response times doubled. This is the empirical refutation of "
     "“graphics inherently beat text”."),
    ("Nesting does not reduce a program's entity count",
     "104", "graphic entities for a 22-line program",
     "The same rocket program: BASIC 22 lines / 140 words on one screen; LabVIEW 45 "
     "icons + 59 wires = 104 entities; Prograph 131 entities across 11 windows with "
     "no way to see it at once. <strong>Nesting redistributes entities, it does not "
     "remove them.</strong>"),
    ("figure is folklore",
     "50", "primitives — a number that was never measured",
     "The famous ceiling is one remark in one conference Q&amp;A, not a result. "
     "Worth knowing before designing against it: a surveyed corpus of deployed "
     "dataflow graphs runs well past it anyway."),
    ("proven graveyard",
     "3", "funded attempts at lossless graph-to-text sync",
     "MPS, Enso/Luna and Intentional Software each spent years keeping an editable "
     "graph in sync with canonical text, and shipped little. This is the strongest "
     "argument against the premise, and it is from your own vault — which is "
     "why several recommendations below are about keeping the text canonical and "
     "the graph derived."),
]

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


def clip(s, n: int) -> str:
    """Trim to roughly n characters, preferring a sentence end.

    The agents wrote 1,000-1,500 words per recommendation. The card shows the
    conclusion and the <details> block carries the rest verbatim, so this only
    ever shortens what is ALSO printed in full one click away — never the only
    copy of a fact.
    """
    t = str(s or "").strip()
    if len(t) <= n:
        return t
    cut = t[:n]
    for stop in (". ", "; ", " \u2014 "):
        i = cut.rfind(stop)
        if i > n * 0.55:
            return cut[:i + 1].rstrip()
    i = cut.rfind(" ")
    return (cut[:i] if i > 0 else cut).rstrip() + "\u2026"


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
    t = "".join(out)
    # Single-asterisk italics, AFTER the ** pass so a bold run is already gone.
    # The critic writes *"quoted"* constantly; leaving the asterisks in made its
    # quotes look like typos.
    return re.sub(r"\*([^*\n]+)\*", r"<em>\1</em>", t)


def md(text: str) -> str:
    """Render the critic's markdown.

    The completeness critic writes real markdown — ## headings, > blockquotes,
    - bullets. Dumping it into one <div> produced a 20,000-character wall with
    literal "###" in it, which is the opposite of reproducing a critic
    faithfully: unreadable is not the same as unedited. This converts the
    structure and changes not one word.
    """
    out, para_buf, list_buf, quote_buf = [], [], [], []

    def flush():
        if para_buf:
            out.append(f"<p>{para(' '.join(para_buf))}</p>")
            para_buf.clear()
        if list_buf:
            out.append("<ul>" + "".join(f"<li>{para(x)}</li>" for x in list_buf) + "</ul>")
            list_buf.clear()
        if quote_buf:
            out.append(f'<blockquote class="cq">{para(" ".join(quote_buf))}</blockquote>')
            quote_buf.clear()

    for raw in str(text or "").split("\n"):
        line = raw.rstrip()
        stripped = line.lstrip()
        if not stripped:
            flush()
            continue
        if stripped.startswith("---"):
            flush()
            out.append('<hr style="border:0;border-top:1px solid var(--line);margin:26px 0">')
        elif stripped.startswith("#"):
            flush()
            level = len(stripped) - len(stripped.lstrip("#"))
            body = stripped.lstrip("#").strip()
            tag = "h3" if level <= 2 else "h4"
            out.append(f"<{tag}>{para(body)}</{tag}>")
        elif stripped.startswith(">"):
            if para_buf or list_buf:
                flush()
            quote_buf.append(stripped.lstrip(">").strip())
        elif stripped.startswith(("- ", "* ")):
            if para_buf or quote_buf:
                flush()
            list_buf.append(stripped[2:].strip())
        else:
            if list_buf or quote_buf:
                flush()
            para_buf.append(stripped)
    flush()
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
    b.append(G.tag(16, 18, "positional documents"))
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
    b.append(G.tag(16, 18, "proposed · keyed to the AST"))
    right = G.svg("".join(b), 240, 350, label="Stable layout after the same edit")

    return _pair(
        left, right,
        "**The prior art's shared failure.** A node's position lives in the document, so "
        "an edit — or a formatter — reshuffles the board and the review is lost.",
        "**Proposed.** Keying a position to a stable identity derived from the source means "
        "adding a line adds a box. This is the one requirement that makes the graph "
        "reviewable at all.",
    )


def draw_alias() -> str:
    """The silent ordinal alias — the critic's G1 — vs a fifth computed state."""
    b = [G.arrowhead(G.BLUE)]
    b.append(G.code(18, 44, ["def f():   # f#0", "    ...", "", "def f():   # f#1",
                             "    ..."], size=10, gap=13.5))
    b.append(G.text(18, 132, "delete the first, then undo ↓", size=9.5, fill=G.DIM))
    b.append(G.block(18, 148, 118, 30, "box A → f#0", header=0, fill=G.PANEL,
                     stroke=G.WARN))
    b.append(G.block(148, 148, 118, 30, "box B → f#1", header=0, fill=G.PANEL,
                     stroke=G.WARN))
    b.append(G.badge(18, 188, "synced", fill=G.OK, text_fill="#0e0f12"))
    b.append(G.badge(148, 188, "synced", fill=G.OK, text_fill="#0e0f12"))
    b.append(G.text(142, 226, "both resolve. both hash-match.", size=9.5,
                    fill=G.WARN, anchor="middle"))
    b.append(G.text(142, 240, "each is bound to the OTHER function.", size=9.5,
                    fill=G.WARN, anchor="middle"))
    b.append(G.tag(18, 32, "today · four-state machine"))
    left = G.svg("".join(b), 284, 254, label="Silent anchor aliasing reported as synced")

    b = [G.arrowhead(G.BLUE)]
    b.append(G.code(18, 44, ["def f():   # f#0", "    ...", "", "def f():   # f#1",
                             "    ..."], size=10, gap=13.5))
    b.append(G.text(18, 132, "delete the first, then undo ↓", size=9.5, fill=G.DIM))
    b.append(G.block(18, 148, 118, 30, "box A", header=0, fill=G.PANEL, stroke=G.GOLD))
    b.append(G.block(148, 148, 118, 30, "box B", header=0, fill=G.PANEL, stroke=G.LINE))
    b.append(G.badge(18, 188, "re-seated", fill=G.GOLD, text_fill="#0e0f12"))
    b.append(G.badge(148, 188, "synced", fill=G.OK, text_fill="#0e0f12"))
    b.append(G.text(142, 226, "the span's hash matches a DIFFERENT", size=9.5,
                    fill=G.OK, anchor="middle"))
    b.append(G.text(142, 240, "cell's previous hash — so say so.", size=9.5,
                    fill=G.OK, anchor="middle"))
    b.append(G.tag(18, 32, "proposed · a fifth computed state"))
    right = G.svg("".join(b), 284, 254, label="A fifth state naming the re-seat")

    return _pair(
        left, right,
        "**The hazard, verified on disk.** The anchor is qualname + ordinal. Delete one of two "
        "same-named defs and the survivor re-ordinals; it still resolves and still hash-matches, "
        "so the state machine says **synced** while both boxes point at the wrong function.",
        "**Proposed.** `origin` already carries `contentHash`, so the shift is detectable — "
        "an anchor that resolves to a span whose hash was another cell's is a fifth state, not "
        "`synced`. Ordinary Python hits this: `@overload` families and property getter/setter "
        "pairs share a qualname.",
    )


def draw_fanin() -> str:
    """A hub's starburst vs named stubs with a count."""
    b = [G.arrowhead(G.DIM2)]
    cx, cy = 150.0, 108.0
    b.append(G.block(108, 92, 84, 32, "CONFIG", header=0, fill=G.PANEL))
    import math
    for i in range(11):
        ang = math.pi * (0.5 + i / 10.0)
        x = cx + 128 * math.cos(ang)
        y = cy + 92 * math.sin(ang)
        b.append(G.wire([(x, y), (cx, cy)], stroke=G.DIM2, width=1.2, arrow=False,
                        radius=0))
    b.append(G.text(150, 214, "11 readers, 11 crossings, no names", size=9.5,
                    fill=G.WARN, anchor="middle"))
    b.append(G.tag(22, 26, "every system · the hub starburst"))
    left = G.svg("".join(b), 300, 228, label="A hub node with eleven crossing wires")

    b = [G.arrowhead(G.BLUE)]
    b.append(G.block(96, 88, 100, 34, "CONFIG", header=0, fill=G.PANEL))
    b.append(G.port(196, 105, fill=G.ACCENT, square=True, size=4))
    for i, nm in enumerate(["calibrate", "run", "report"]):
        y = 70 + i * 34
        b.append(G.wire([(200, 105), (224, 105), (224, y + 10), (244, y + 10)],
                        stroke=G.BLUE, width=1.5))
        b.append(f'<rect x="244" y="{y}" width="72" height="20" rx="4"'
                 f' fill="{G.PANEL2}" stroke="{G.LINE}"/>')
        b.append(G.text(280, y + 14, nm, size=9, fill=G.DIM, anchor="middle"))
    b.append(G.badge(244, 174, "+8 more", fill=G.PANEL2, text_fill=G.GOLD))
    b.append(G.text(158, 214, "named stubs; the count is the rest", size=9.5,
                    fill=G.OK, anchor="middle"))
    b.append(G.tag(22, 26, "proposed · stubs and a count badge"))
    right = G.svg("".join(b), 330, 228, label="Named stubs replacing the starburst")

    return _pair(
        left, right,
        "**The shared failure.** A value many things read becomes a starburst whose crossings "
        "carry no information at all — the reader must trace each line to learn anything.",
        "**Proposed.** The line stops at a named stub, and the readers that do not fit become a "
        "count. Nothing is hidden that was legible before; the crossings were never legible.",
    )


# id → drawing. Explicit, because keyword-matching free prose bound a drawing to the
# wrong recommendation in testing: "anchor" contains no "arm", but a proposal's
# `mechanism` paragraph easily mentions one while being about something else. An id is
# stable within a run and a miss degrades to no drawing, which is the safe failure.
DRAWINGS_BY_ID = {
    "anchor-keyed-position": draw_layout_stability,
    "derived-layout-tidy": draw_layout_stability,
    "anchor-alias-fifth-state": draw_alias,
    "arm-row-vocabulary": draw_arms,
    "arm-juxtaposition": draw_arms,
    "opaque-face-names": draw_granularity,
    "folded-face-interface": draw_granularity,
    "derive-openness": draw_granularity,
    "name-where-lines-stop": draw_names,
    "draw-every-name": draw_names,
    "fan-in-stubs": draw_fanin,
    "reference-lane": draw_fanin,
}


def drawing_for(proposal: dict, used: set) -> str:
    """Attach a drawing by proposal id, at most once per drawing.

    WHY by id and not by rank or keyword: a re-run reorders the ranking, so a
    drawing bound to "whatever landed at #1" would illustrate the wrong idea
    while looking authoritative; and keyword-matching a proposal's prose is
    loose enough to do the same thing by accident. An unknown id simply gets no
    drawing.
    """
    fn = DRAWINGS_BY_ID.get(str(proposal.get("id", "")))
    if fn is None or fn in used:
        return ""
    used.add(fn)
    return fn()


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
  .critic {{ border-left:2px solid var(--warn); padding:2px 0 2px 20px; color:#cfd4de }}
  .critic h3 {{ font-size:17px; margin:30px 0 10px; color:var(--fg); letter-spacing:-.01em }}
  .critic h4 {{ font-size:14px; margin:22px 0 8px; color:var(--gold) }}
  .critic p {{ font-size:14px; line-height:1.68; margin:0 0 12px }}
  .critic ul {{ margin:0 0 14px; padding-left:20px }}
  .critic li {{ font-size:14px; line-height:1.62; margin:0 0 7px }}
  .critic .cq {{ margin:0 0 14px; padding:11px 14px; background:#0a0b0e; border-radius:8px;
                 border-left:2px solid var(--line2); font-size:13.5px; line-height:1.6;
                 color:var(--dim) }}
  .mgrid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(248px,1fr));
            gap:14px; margin:20px 0 26px }}
  .mcard {{ background:var(--panel); border:1px solid var(--line); border-radius:12px;
            padding:18px 18px 16px }}
  .mcard b {{ display:block; font:700 38px/1 var(--mono); color:var(--gold);
              letter-spacing:-.03em }}
  .mcard > span {{ display:block; font-size:12px; color:var(--dim2); margin:7px 0 12px;
                   line-height:1.4; text-transform:uppercase; letter-spacing:.06em;
                   font-weight:600 }}
  .mcard p {{ margin:0; font-size:13.5px; line-height:1.6; color:#cfd4de }}
  .mcard blockquote {{ margin:13px 0 0; padding:10px 12px; background:#0a0b0e;
                       border-radius:8px; border-left:2px solid var(--line2);
                       font:11.5px/1.55 var(--mono); color:var(--dim) }}
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
  <div><b>{counts.get('gaps', 0)}</b><span>added by the completeness critic</span></div>
  <div><b>{counts.get('refuted', 0)}</b><span>dropped head-to-head</span></div>
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

    # ── the measured band ─────────────────────────────────────────────────
    cards = []
    for needle, big, cap, body in MEASURED:
        hit = next((c for c in complaints
                    if needle.lower() in str(c.get("title", "")).lower()), None)
        if not hit:
            continue
        ev = [e for e in (hit.get("evidence") or []) if e.get("quote")]
        q = ev[0].get("quote") if ev else ""
        url = ev[0].get("url") if ev else ""
        src = ""
        if url:
            short = (pathlib.Path(url).name if url.startswith("/")
                     else url.replace("https://", "").replace("http://", "").split("/")[0])
            src = (f'<a class="ev" href="{attr(url)}">{esc(short[:40])}</a>'
                   if url.startswith("http") else f'<span class="ev">{esc(short[:40])}</span>')
        cards.append(
            f'<div class="mcard"><b>{big}</b><span>{cap}</span><p>{body}</p>'
            + (f'<blockquote>“{esc(str(q)[:190])}”<br>{src}</blockquote>'
               if q else "")
            + "</div>")
    if cards:
        P.append(f"<h2>{len(cards)} numbers worth having first</h2>")
        P.append('<p class="sub" style="font-size:15px">Every figure below is a verbatim '
                 'quote the verification pass re-fetched from a primary source. Two of them '
                 'point away from the problem people assume.</p>')
        P.append(f'<div class="mgrid">{"".join(cards)}</div>')
        P.append("""<div class="note warn">
<p><strong>The reframe these force.</strong> The density complaint is the loudest one in the
corpus and it is <em>not</em> the one with the strongest evidence behind it — Green &amp;
Petre measured diffuseness as a smaller liability than they expected, and measured
<strong>editing</strong> as an 8:1 catastrophe. Meanwhile the academic corpus’ own blocking
finding is that “rewiring existing code is where visual programming actually breaks —
editing, not reading”, and NI’s engineers were found going to great lengths to avoid
modifying their own LabVIEW code.</p>
<p>Your architecture already answers this in a way none of the eleven can: <strong>the text is
canonical, so a text edit is always available as the editing gesture.</strong> That converts the
prior art’s worst measured failure into a non-problem — provided the graph never becomes
the only way to make a change. Several recommendations below exist to protect exactly that.</p>
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
             'fixes in the corpus, then open the trunk files it names. Each was scored by an '
             'agent that did not attack it, then ranked <em>against the others</em> — '
             'absolute scores clustered between 4.15 and 4.70 and discriminated nothing, so the '
             'order below comes from comparative ranking, and the score is shown only as '
             'supporting detail.</p>')
    P.append("""<div class="note">
<p><strong>Two honesty notes about the labels.</strong> <em>Lenses</em> counts how many of eight
independent design passes reached the same idea — but each lens was given an exclusive brief
and told not to hedge into the others’, so <strong>low agreement is by construction and is not
weak support</strong>. Treat a high count as a positive signal and a low one as no signal.
Items marked <em>from the critic</em> came from the completeness pass rather than the eight
lenses, and were attacked and scored on the same bar afterwards.</p>
<p>And the <em>Costs you</em> line is not a disclaimer — it is the part most worth reading.
Every notation choice trades something, and a proposal whose cost is unstated has an unexamined
one rather than none.</p>
</div>""")
    if design.get("cutLine"):
        P.append(f'<div class="note gold"><p><strong>Why the line falls at twenty.</strong> '
                 f'{para(design.get("cutLine"))}</p></div>')

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
        tier = str(r.get("tier") or "")
        if tier:
            tcls = {"do-first": "gold", "strong": "ok", "worth-it": "",
                    "narrow": "", "drop": "warn"}.get(tier, "")
            P.append(f'<span class="chip {tcls}">{esc(tier.replace("-", " "))}</span>')
        w = score.get("weighted")
        if w is not None:
            P.append(f'<span class="chip">score {float(w):.2f} / 5</span>')
        P.append(f'<span class="chip">{esc(AXIS_LABELS.get(r.get("axis"), r.get("axis")))}</span>')
        cls = "ok" if agree >= 4 else ""
        lens_txt = f"{agree}/8 lenses" if agree else "from the critic"
        P.append(f'<span class="chip {cls}">{lens_txt}</span>')
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

        if r.get("mergedIn"):
            items = "".join(
                f"<li><strong>{esc(m.get('title'))}</strong> — {para(m.get('oneLiner'))}</li>"
                for m in r["mergedIn"])
            P.append(f'<div class="note" style="margin:16px 0 4px"><p><strong>Folds in '
                     f'{len(r["mergedIn"])} proposal'
                     f'{"s" if len(r["mergedIn"]) > 1 else ""} on the same axis:</strong></p>'
                     f"<ul>{items}</ul></div>")
        # ── the part he always sees ───────────────────────────────────────
        # WHY this is split rather than printed whole: the agents returned
        # 1,000-1,500 words per recommendation, and twenty of those is a
        # 30,000-word document. Zach's review time is the bottleneck on
        # everything, so the card leads with the conclusion — the rule, where
        # it ranks, what it fixes, what it costs — and the evidence that
        # supports it opens on demand. Nothing is deleted; the long-form
        # rationale, the disk checks and the refutation are all one click away.
        P.append("<dl>")
        if r.get("rankWhy"):
            P.append(f"<dt>Why here</dt><dd>{para(clip(r.get('rankWhy'), 300))}</dd>")
        if r.get("relatedTo"):
            rel = ", ".join(f"<strong>{esc(x.get('title'))}</strong>" for x in r["relatedTo"])
            P.append(f"<dt>Related</dt><dd>Close to {rel} — kept separate because they sit "
                     f"on different axes and draw different things.</dd>")
        # The proposal's own `problem` is a STATEMENT of what it fixes; the
        # attacker's `complaintCheck` is an AUDIT of whether that holds ("I
        # checked all eight index-to-title pairs…"). The audit is the more
        # trustworthy of the two and belongs in the report — but it is not what
        # a reader scanning twenty cards needs on the surface, so the statement
        # leads and the audit opens underneath it.
        P.append(f"<dt>Fixes</dt><dd>{para(clip(r.get('problem') or attack.get('complaintCheck'), 330))}</dd>")
        cost = str(attack.get("unpaidCost") or "").strip()
        if cost:
            P.append(f"<dt>Costs you</dt><dd>{para(clip(cost, 300))}</dd>")
        P.append(f"<dt>Build</dt><dd>{para(clip(r.get('buildNotes'), 300))}</dd>")
        P.append("</dl>")

        # ── the evidence, one click away ──────────────────────────────────
        more = []
        sharp = str(attack.get("sharpened") or "").strip()
        if sharp:
            more.append(("The form to build", sharp))
        more.append(("What a reader sees", r.get("mechanism")))
        more.append(("Prior art", r.get("priorArt")))
        if r.get("whyBetter"):
            more.append(("Why ours beats it", r.get("whyBetter")))
        if attack.get("complaintCheck"):
            more.append(("Checked against the corpus", attack.get("complaintCheck")))
        bc = str(attack.get("buildabilityCheck") or "").strip()
        if bc:
            more.append(("Checked on disk", bc))
        ref = str(attack.get("refutation") or "").strip()
        if ref:
            more.append(("The best case against it", ref))
        sc_ = str(attack.get("scaleCheck") or "").strip()
        if sc_:
            more.append(("At 500 nodes", sc_))
        rc_full = str(attack.get("rulingConflict") or "").strip()
        if rc_full and rc_full.lower() not in ("none", "none.", "n/a"):
            more.append(("Against the frozen rulings", rc_full))
        body = "".join(f"<dt>{esc(k)}</dt><dd>{para(v)}</dd>" for k, v in more if v)
        P.append(f'<details><summary>The full case · evidence, disk checks and the '
                 f'rebuttal</summary><dl>{body}')
        if score:
            bars = []
            for key, label, _w in CRITERIA:
                v = score.get(key) or 0
                col = G.OK if v >= 4 else (G.GOLD if v == 3 else G.WARN)
                bars.append(f'<i style="height:{max(4, float(v) / 5 * 34):.0f}px;'
                            f'background:{col}"><b>{key.upper()}</b></i>')
            P.append(f'<dt>Scores</dt><dd><div class="sc">{"".join(bars)}</div></dd>')
        P.append("</dl></details>")
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
        P.append(f'<div class="critic">{md(critic)}</div>')

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

    ranker_dropped = design.get("droppedByRanker") or []
    if ranker_dropped:
        P.append("<h2>Dropped on comparison</h2>")
        P.append('<p class="sub" style="font-size:15px">These survived the adversarial pass but '
                 'lost head-to-head. That is the whole reason the ranking is comparative: scoring '
                 'each one on its own refuted nothing out of 33, which is not credible — '
                 'ranking them against each other dropped these seven.</p>')
        P.append("<table><thead><tr><th>Proposal</th><th>Why it lost</th></tr></thead><tbody>")
        for r in ranker_dropped:
            P.append(f"<tr><td><strong>{esc(r.get('title'))}</strong><br>"
                     f"<span class='q'>{esc(r.get('oneLiner'))}</span></td>"
                     f"<td>{para(r.get('rankWhy'))}</td></tr>")
        P.append("</tbody></table>")

    if refuted:
        P.append("<h2>Refuted on attack</h2>")
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
