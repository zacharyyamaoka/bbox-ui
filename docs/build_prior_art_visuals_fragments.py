#!/usr/bin/env python3
"""
Draw the 26 "Also surfaced" ideas from the node-editor prior-art report.

Zach, 2026-09-18: "this was a good report. can you please make another report
that adds the visuals for the other 26 ideas" — pointing at
reports/media/node-editor-prior-art-2026-09-17.html, whose 13 featured
entries each lead with a picture while the remaining 26 ideas live as
one-line table rows under "Also surfaced — real, cited, lower priority".

This script generates the FIGURES: four HTML fragments (one per bucket of
the original table), each a stack of cards — number, title, source chip,
verification chip, our-status chip, an inline-SVG mechanism diagram, and a
two-line caption with the exact file:line the drawing was checked against.
docs/lane_report_manifest.prior-art-visuals.json feeds them to
docs/build_lane_report.py (`sections[].html_file`), which wraps them in the
shared report chrome:

    python3 docs/build_prior_art_visuals_fragments.py
    python3 docs/build_lane_report.py \
        docs/lane_report_manifest.prior-art-visuals.json --skip-capture \
        --out /home/bam/bbox-ui/reports/media/node-editor-prior-art-visuals-2026-09-18.html

EVERY figure was re-verified against real source before drawing (repo rule:
algorithms carry citations, never from memory). The four sources were read
in a scratch checkout OUTSIDE this repo:
  - vyuh_node_flow  (MIT)        github.com/vyuh-tech/vyuh_node_flow @ main 2026-09-18
  - maxGraph        (Apache-2.0) github.com/maxGraph/maxGraph        @ main 2026-09-18
  - litegraph.js    (MIT)        github.com/jagenjo/litegraph.js     @ master 2026-09-18
  - JointJS         (MPL-2.0)    read and cited only — no source copied into
    this repo, the same line held for LGPL libavoid (elbow/nudge.ts:63-68).
Citations name file:line in those checkouts. Where a sub-claim could only
be grounded in documentation or maintainer statements, the card's chip says
"as documented" and the caption says exactly which half that covers.

VISUAL LANGUAGE: the five SVG primitives below (box / label / arrow / dot /
svg+DEFS) and the palette re-state the kit used by the visual pass of
docs/build_node_editor_prior_art_report.py — the rebuild Zach rated good —
so this companion page reads as the same drawn hand, not a second style.
That visual pass is uncommitted in a peer lane at the time of writing, so
the primitives are re-stated here rather than imported.
"""
from __future__ import annotations

import pathlib

REPO = pathlib.Path(__file__).resolve().parent.parent
FRAG_DIR = REPO / "docs" / "fragments"

# Palette — matches build_lane_report.py's CSS variables so hand-drawn SVG
# and the report chrome sit in one visual system.
BG = "#0e0f12"
PANEL = "#15171c"
PANEL2 = "#1b1e25"
LINE = "#282d38"
FG = "#e6e8ee"
DIM = "#9aa3b2"
DIM2 = "#6b7383"
ACCENT = "#f0883e"
ACCENT2 = "#5aa9f8"
OK = "#3fb950"
WARN = "#e5534b"
AMBER = "#e8c06a"
PURPLE = "#bc8cff"
MONO = "ui-monospace,Menlo,Consolas,monospace"
SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif"


# ---------------------------------------------------------------------------
# SVG kit — same five primitives as the prior-art report's diagrams.
# ---------------------------------------------------------------------------
def box(x, y, w, h, text="", sub="", fill=PANEL2, stroke=LINE, tc=FG, fs=11,
        rx=6, dash=None, mono=True, sw=1.2):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    out = (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" '
           f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{d}/>')
    fam = MONO if mono else SANS
    if text:
        cy = y + h / 2 + fs * 0.36 - (6 if sub else 0)
        out += (f'<text x="{x + w / 2}" y="{cy:.1f}" fill="{tc}" font-size="{fs}" '
                f'text-anchor="middle" font-family="{fam}">{text}</text>')
    if sub:
        out += (f'<text x="{x + w / 2}" y="{y + h / 2 + 14}" fill="{DIM2}" font-size="9" '
                f'text-anchor="middle" font-family="{SANS}">{sub}</text>')
    return out


def label(x, y, s, color=DIM, fs=10, anchor="middle", weight="400", mono=False):
    fam = MONO if mono else SANS
    return (f'<text x="{x}" y="{y}" fill="{color}" font-size="{fs}" '
            f'text-anchor="{anchor}" font-weight="{weight}" font-family="{fam}">{s}</text>')


def arrow(x1, y1, x2, y2, color=DIM2, sw=1.6, dash=None, marker="mA"):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return (f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" '
            f'stroke-width="{sw}"{d} marker-end="url(#{marker})"/>')


def curve(x1, y1, cx, cy, x2, y2, color=DIM2, sw=1.6, dash=None, marker="mA"):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    m = f' marker-end="url(#{marker})"' if marker else ""
    return (f'<path d="M {x1} {y1} Q {cx} {cy} {x2} {y2}" fill="none" '
            f'stroke="{color}" stroke-width="{sw}"{d}{m}/>')


def dot(x, y, r, color, stroke="none", sw=1.2):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{color}" stroke="{stroke}" stroke-width="{sw}"/>'


def cross(x, y, size=7, color=WARN, sw=2.2):
    s = size
    return (f'<line x1="{x - s}" y1="{y - s}" x2="{x + s}" y2="{y + s}" stroke="{color}" stroke-width="{sw}"/>'
            f'<line x1="{x + s}" y1="{y - s}" x2="{x - s}" y2="{y + s}" stroke="{color}" stroke-width="{sw}"/>')


DEFS = f"""<defs>
  <marker id="mA" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" fill="{DIM2}"/></marker>
  <marker id="mW" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" fill="{WARN}"/></marker>
  <marker id="mG" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" fill="{OK}"/></marker>
  <marker id="mB" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" fill="{ACCENT2}"/></marker>
  <marker id="mO" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" fill="{ACCENT}"/></marker>
</defs>"""


def svg(w, h, body):
    return (f'<svg viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg" '
            f'role="img">{DEFS}{body}</svg>')


# ---------------------------------------------------------------------------
# Card machinery
# ---------------------------------------------------------------------------
VERIFY_CHIPS = {
    "source": ("verified in source", "#12301d", OK),
    "callgraph": ("read in source — not exercised", "#2c2a14", AMBER),
    "mixed": ("core verified · one half as documented", "#2c2a14", AMBER),
}
STATUS_CHIPS = {
    "open": ("we don't have this", "#20242d", DIM),
    "partial": ("half landed here", "#241a3a", PURPLE),
    "landed": ("already landed here", "#12301d", OK),
    "inflight": ("in flight — a lane owns it", "#122a3d", ACCENT2),
    "design": ("host-owned by design", "#122a3d", ACCENT2),
}

STYLE = f"""
<style>
.pa-card {{ background:var(--panel); border:1px solid var(--line); border-radius:10px;
  padding:16px 18px 12px; margin:0 0 14px }}
.pa-hd {{ display:flex; align-items:baseline; gap:9px; flex-wrap:wrap; margin-bottom:10px }}
.pa-num {{ font-family:var(--mono); font-size:12px; color:{DIM2}; min-width:26px }}
.pa-title {{ font-size:14.5px; font-weight:650; color:var(--fg) }}
.pa-chip {{ font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.06em;
  padding:2px 8px; border-radius:99px; white-space:nowrap }}
.pa-src {{ font-size:10.5px; color:{DIM2}; background:var(--panel2); border:1px solid var(--line);
  padding:2px 8px; border-radius:99px; white-space:nowrap }}
.pa-fig {{ background:var(--panel2); border:1px solid var(--line); border-radius:8px;
  padding:8px; margin:0 0 9px }}
.pa-fig svg {{ width:100%; height:auto; display:block }}
.pa-cap {{ font-size:12.5px; color:{DIM}; line-height:1.55; margin:0 0 4px }}
.pa-cap b {{ color:var(--fg) }}
.pa-cite {{ font-family:var(--mono); font-size:10.5px; color:{DIM2}; line-height:1.6 }}
.pa-us {{ font-size:12.5px; color:{DIM}; line-height:1.55; margin:5px 0 0 }}
.pa-us b {{ color:{ACCENT} }}
</style>
"""


def card(num, title, source, verify, status, fig_svg, mechanism, cite, forus):
    v_text, v_bg, v_fg = VERIFY_CHIPS[verify]
    s_text, s_bg, s_fg = STATUS_CHIPS[status]
    return f"""
<div class="pa-card" id="pa-{num}">
  <div class="pa-hd">
    <span class="pa-num">{num:02d}</span>
    <span class="pa-title">{title}</span>
    <span class="pa-src">{source}</span>
    <span class="pa-chip" style="background:{v_bg};color:{v_fg}">{v_text}</span>
    <span class="pa-chip" style="background:{s_bg};color:{s_fg}">{s_text}</span>
  </div>
  <div class="pa-fig">{fig_svg}</div>
  <p class="pa-cap">{mechanism}</p>
  <p class="pa-cite">{cite}</p>
  <p class="pa-us"><b>For us:</b> {forus}</p>
</div>"""


# ===========================================================================
# BUCKET 1 — Container behavior (10 figures)
# ===========================================================================

# --- 01 · membership is three axes -----------------------------------------
def fig01():
    cols = [
        ("bounds", "spatial, at drag", "manual (resizable)", "can escape", ACCENT2),
        ("explicit", "ID-set", "auto-fit + padding", "cannot — box follows", OK),
        ("parent", "ID-set", "manual (resizable)", "can be dragged out", PURPLE),
    ]
    rows = ["membership", "sizing", "escape rule"]
    b = []
    for i, r in enumerate(rows):
        b.append(label(24, 78 + i * 40, r, DIM, 10.5, "start", "600"))
    for c, (name, m, s, e, col) in enumerate(cols):
        x = 128 + c * 152
        b.append(box(x, 34, 140, 24, name, fill="#122a3d" if c == 0 else PANEL2,
                     stroke=col, tc=col, fs=11))
        for i, val in enumerate((m, s, e)):
            b.append(box(x, 64 + i * 40, 140, 28, val, fs=9.5, tc=FG, mono=False))
    b.append(box(24, 192, 560, 26, "", fill="#3d1f1c", stroke=WARN, rx=8))
    b.append(label(304, 209, "Region today: one conflated knob — the three columns above are one enum value each",
                   "#ff9a8f", 10, "middle"))
    return svg(608, 232, "".join(b))


# --- 02 · PortType.both -----------------------------------------------------
def fig02():
    b = []
    b.append(label(140, 22, "ONE PORT, TWO MEMBERSHIPS", DIM2, 10, "middle", "700"))
    b.append(dot(60, 78, 7, PURPLE))
    b.append(label(60, 100, "type: both", PURPLE, 9.5, "middle", "600"))
    b.append(box(140, 40, 130, 30, "inputPorts[]", sub="…contains it", fs=10))
    b.append(box(140, 88, 130, 30, "outputPorts[]", sub="…contains it too", fs=10))
    b.append(arrow(70, 72, 136, 55))
    b.append(arrow(70, 84, 136, 103))
    b.append(label(140, 148, "every union of the two lists counts it twice —", DIM, 9.5))
    b.append(label(140, 162, "the renderer dodges it with its own comment", DIM, 9.5))
    b.append(f'<line x1="300" y1="18" x2="300" y2="170" stroke="{LINE}" stroke-width="1"/>')
    b.append(label(455, 22, "POLARITY LOCKS AT PRESS", DIM2, 10, "middle", "700"))
    b.append(box(322, 44, 84, 28, "press", fs=10, mono=False))
    b.append(arrow(408, 58, 438, 58))
    b.append(box(442, 44, 158, 28, "isStartFromOutput", fill="#122a3d", stroke=ACCENT2, tc=ACCENT2, fs=10))
    b.append(label(521, 88, "frozen for the whole drag;", DIM, 9.5))
    b.append(label(521, 102, "every validity check keys off it", DIM, 9.5))
    b.append(arrow(521, 76, 521, 112, DIM2, dash="3 3"))
    b.append(box(442, 118, 158, 26, "allow / deny", fs=10, mono=False))
    return svg(608, 178, "".join(b))


# --- 03 · nesting needs a cycle guard --------------------------------------
def fig03():
    b = []
    b.append(box(50, 48, 120, 40, "Region A", sub="nodeIds: [B]"))
    b.append(box(50, 122, 120, 40, "Region B", sub="nodeIds: [A]"))
    b.append(curve(172, 62, 215, 105, 172, 140, WARN, marker="mW"))
    b.append(curve(48, 148, 8, 105, 48, 70, WARN, marker="mW"))
    b.append(label(110, 30, "a plain ID list happily stores this", "#ff9a8f", 10, "middle", "600"))
    b.append(label(110, 182, "addNode(): no ancestor check", DIM2, 9.5, "middle"))
    b.append(f'<line x1="270" y1="18" x2="270" y2="185" stroke="{LINE}" stroke-width="1"/>')
    b.append(label(440, 30, "the only defense ships at drag time", DIM, 10, "middle", "600"))
    b.append(box(300, 44, 280, 30, 'movedNodes — "prevent infinite loops"', fs=9.5))
    b.append(label(440, 92, "the recursion defends against the cycle", DIM, 9.5))
    b.append(label(440, 106, "the model never refused to store", DIM, 9.5))
    b.append(box(300, 122, 280, 30, "guard membership edits instead:", fs=9.5, mono=False, fill="#12301d", stroke=OK, tc=OK))
    b.append(box(300, 156, 280, 26, "addNode(x): walk ancestors, refuse x∈chain", fs=9.5, tc=OK, fill=PANEL2, stroke=OK, dash="4 3"))
    return svg(608, 196, "".join(b))


# --- 04 · one z invariant, three moments -----------------------------------
def fig04():
    b = []
    y = 44
    moments = [("addNode()", 70), ("onDragStart()", 260), ("load / attach", 450)]
    b.append(f'<line x1="40" y1="{y}" x2="568" y2="{y}" stroke="{LINE}" stroke-width="1.4"/>')
    for name, x in moments:
        b.append(dot(x + 35, y, 4, ACCENT))
        b.append(label(x + 35, y - 12, name, FG, 10, "middle", "600"))
        b.append(arrow(x + 35, y + 6, x + 35, y + 30, DIM2))
    b.append(box(110, 80, 388, 30, "child.z ≤ parent.z  →  child.z = parent.z + 1",
                 fill="#122a3d", stroke=ACCENT2, tc=ACCENT2, fs=11))
    b.append(label(304, 128, "the same invariant, re-enforced at three separate call sites — budget for the repetition", DIM, 10, "middle"))
    b.append(box(150, 144, 190, 62, "", fill=PANEL2, stroke=DIM2))
    b.append(label(170, 160, "parent  z:2", DIM, 9.5, "start", mono=True))
    b.append(box(240, 158, 88, 40, "", fill=PANEL, stroke=OK))
    b.append(label(284, 174, "nested", DIM, 9, "middle"))
    b.append(label(284, 188, "z:1 → 3", OK, 9.5, "middle", "700", mono=True))
    b.append(label(430, 176, "nested group bumped above", DIM, 9.5))
    b.append(label(430, 190, "its parent — stays clickable", DIM, 9.5))
    return svg(608, 216, "".join(b))


# --- 05 · membership frozen at drag-start ----------------------------------
def fig05():
    b = []
    b.append(box(30, 30, 112, 28, "press", fs=10, mono=False))
    b.append(arrow(144, 44, 172, 44))
    b.append(box(176, 24, 250, 40, "capture once:", sub="bounds→findNodesInBounds · else copy ID-set", fs=10, mono=False))
    b.append(arrow(428, 44, 456, 44))
    b.append(box(460, 30, 120, 28, "each move:", fs=10, mono=False))
    b.append(box(390, 76, 190, 28, "captured − selected", fill="#12301d", stroke=OK, tc=OK, fs=10.5))
    b.append(arrow(520, 60, 520, 74, OK, marker="mG"))
    b.append(f'<line x1="30" y1="122" x2="580" y2="122" stroke="{LINE}" stroke-width="1"/>')
    b.append(label(110, 144, "without the subtraction:", "#ff9a8f", 10, "start", "600"))
    b.append(box(110, 156, 150, 52, "", fill=PANEL2, stroke=ACCENT))
    b.append(box(130, 168, 60, 30, "▢", sub="", fill=PANEL, stroke=ACCENT2))
    b.append(label(160, 224, "selected AND inside", DIM, 9.5))
    b.append(arrow(265, 182, 320, 182, DIM2))
    b.append(label(292, 172, "δ", DIM, 10, "middle", mono=True))
    b.append(box(330, 156, 150, 52, "", fill=PANEL2, stroke=ACCENT, dash="4 3"))
    b.append(box(410, 168, 60, 30, "▢", fill=PANEL, stroke=WARN, dash="3 2"))
    b.append(label(440, 224, "block lands at 2·δ — moved by the", DIM, 9.5))
    b.append(label(440, 238, "selection drag AND the group drag", DIM, 9.5))
    b.append(cross(497, 183, 6))
    return svg(608, 250, "".join(b))


# --- 06 · auto-fit needs a reentrancy latch --------------------------------
def fig06():
    b = []
    cx, cy, r = 150, 108, 66
    pts = [(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)]
    names = ["child moves", "reaction fires", "fitToNodes()", "group resizes"]
    for (x, y), n in zip(pts, names):
        b.append(box(x - 52, y - 13, 104, 26, n, fs=9.5, mono=False))
    for i in range(4):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % 4]
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        fx, fy = cx + (mx - cx) * 1.42, cy + (my - cy) * 1.42
        b.append(curve(x1 + (x2 - x1) * 0.28, y1 + (y2 - y1) * 0.28, fx, fy,
                       x1 + (x2 - x1) * 0.74, y1 + (y2 - y1) * 0.74, WARN, marker="mW"))
    b.append(label(150, 108, "∞", WARN, 22, "middle", "700"))
    b.append(f'<line x1="300" y1="20" x2="300" y2="196" stroke="{LINE}" stroke-width="1"/>')
    b.append(label(455, 34, "THE LATCH", DIM2, 10, "middle", "700"))
    b.append(box(330, 48, 250, 30, "_isMovingGroupNodes = true", fill="#122a3d", stroke=ACCENT2, tc=ACCENT2, fs=10.5))
    b.append(arrow(455, 80, 455, 96, DIM2))
    b.append(box(330, 100, 250, 30, "move all children (one pass)", fs=10, mono=False))
    b.append(arrow(455, 132, 455, 148, DIM2))
    b.append(box(330, 152, 250, 30, "reactions check shouldSkipUpdates()", fs=9.5))
    b.append(label(455, 196, "→ skip while latched · cleared in finally", OK, 9.5, "middle"))
    return svg(608, 208, "".join(b))


# --- 07 · empty-container lifecycle ----------------------------------------
def fig07():
    b = []
    b.append(label(150, 24, "EXPLICIT GROUP", DIM2, 10, "middle", "700"))
    b.append(box(70, 36, 160, 58, "", fill=PANEL2, stroke=DIM2))
    b.append(label(150, 60, "last member", DIM, 9.5))
    b.append(label(150, 74, "removed", DIM, 9.5))
    b.append(arrow(150, 98, 150, 118, DIM2))
    b.append(box(70, 122, 160, 40, "", fill="none", stroke=WARN, dash="4 3"))
    b.append(label(150, 146, "auto-removed", WARN, 10.5, "middle", "600"))
    b.append(f'<line x1="300" y1="20" x2="300" y2="170" stroke="{LINE}" stroke-width="1"/>')
    b.append(label(455, 24, "LOOP BODY", DIM2, 10, "middle", "700"))
    b.append(box(375, 36, 160, 58, "", fill=PANEL2, stroke=DIM2))
    b.append(label(455, 60, "last member", DIM, 9.5))
    b.append(label(455, 74, "removed", DIM, 9.5))
    b.append(arrow(455, 98, 455, 118, DIM2))
    b.append(box(375, 122, 160, 40, "", fill=PANEL2, stroke=OK))
    b.append(label(455, 146, "persists, waiting", OK, 10.5, "middle", "600"))
    b.append(box(70, 184, 465, 26, "shouldRemoveWhenEmpty = explicit && !preserveWhenEmpty", fs=10.5, tc=AMBER, fill="#2c2a14", stroke=AMBER))
    b.append(label(304, 228, "one constructor boolean per container kind — never a universal rule", DIM, 10, "middle"))
    return svg(608, 240, "".join(b))


# --- 08 · containment is three independent policies ------------------------
def fig08():
    def mini(x, title, col, body):
        out = [label(x + 90, 30, title, col, 10, "middle", "700", mono=True)]
        out.extend(body(x))
        return out

    b = []

    def extend_body(x):
        return [
            box(x + 18, 44, 110, 66, "", fill=PANEL2, stroke=DIM2),
            box(x + 92, 66, 52, 26, "▢", fill=PANEL, stroke=ACCENT2),
            arrow(x + 130, 79, x + 168, 79, ACCENT2, marker="mB"),
            box(x + 18, 44, 150, 66, "", fill="none", stroke=OK, dash="4 3"),
            label(x + 90, 128, "parent grows to keep it", DIM, 9),
        ]

    def constrain_body(x):
        return [
            box(x + 18, 44, 110, 66, "", fill=PANEL2, stroke=DIM2),
            box(x + 96, 66, 52, 26, "▢", fill=PANEL, stroke=WARN, dash="3 2"),
            box(x + 66, 66, 52, 26, "▢", fill=PANEL, stroke=OK),
            arrow(x + 122, 60, x + 96, 60, OK, marker="mG"),
            label(x + 90, 128, "child clamped back inside", DIM, 9),
        ]

    def overlap_body(x):
        return [
            box(x + 18, 44, 110, 66, "", fill=PANEL2, stroke=DIM2),
            box(x + 102, 66, 52, 26, "▢", fill=PANEL, stroke=PURPLE),
            label(x + 90, 128, "child may straddle the edge", DIM, 9),
        ]

    b.extend(mini(10, "extendParent", OK, extend_body))
    b.extend(mini(212, "constrainChild", ACCENT2, constrain_body))
    b.extend(mini(414, "allowOverlap", PURPLE, overlap_body))
    b.append(f'<line x1="205" y1="24" x2="205" y2="136" stroke="{LINE}" stroke-width="1"/>')
    b.append(f'<line x1="407" y1="24" x2="407" y2="136" stroke="{LINE}" stroke-width="1"/>')
    b.append(box(30, 152, 548, 26, "three per-cell predicates — a swimlane clamps children while a group grows", fs=10, mono=False))
    return svg(608, 190, "".join(b))


# --- 09 · judgeContainment mirrors judgeConnection -------------------------
def fig09():
    b = []
    b.append(label(150, 24, "WIRING — SHIPPED HERE", OK, 10, "middle", "700"))
    b.append(box(40, 38, 220, 30, "(source, target) candidate", fs=10, mono=False))
    b.append(arrow(150, 70, 150, 86, DIM2))
    b.append(box(40, 90, 220, 30, "validateConnection()", fill="#12301d", stroke=OK, tc=OK, fs=10.5))
    b.append(arrow(150, 122, 150, 138, DIM2))
    b.append(box(40, 142, 220, 26, "allow / deny + reason", fs=10, mono=False))
    b.append(f'<line x1="304" y1="22" x2="304" y2="176" stroke="{LINE}" stroke-width="1" stroke-dasharray="5 4"/>')
    b.append(label(304, 192, "same predicate shape, one gesture apart", DIM2, 9.5, "middle"))
    b.append(label(458, 24, "CONTAINMENT — THE MISSING TWIN", DIM, 10, "middle", "700"))
    b.append(box(348, 38, 220, 30, "(child, candidateParent)", fs=10, mono=False))
    b.append(arrow(458, 70, 458, 86, DIM2))
    b.append(box(348, 90, 220, 30, "judgeContainment()", fill="none", stroke=ACCENT, tc=ACCENT, fs=10.5, dash="5 4"))
    b.append(arrow(458, 122, 458, 138, DIM2))
    b.append(box(348, 142, 220, 26, "valid drop target? + why not", fs=10, mono=False))
    return svg(608, 204, "".join(b))


# --- 10 · foldability is derived, never stored -----------------------------
def fig10():
    b = []
    b.append(label(150, 24, "STORED FLAG", "#ff9a8f", 10, "middle", "700"))
    b.append(box(60, 38, 180, 56, "", fill=PANEL2, stroke=DIM2))
    b.append(label(150, 58, "node", DIM, 9.5))
    b.append(box(84, 66, 132, 20, "foldable: true", fs=9.5, tc="#ff9a8f", fill="#3d1f1c", stroke=WARN))
    b.append(label(150, 112, "…still true after the last child", DIM, 9.5))
    b.append(label(150, 126, "was deleted — a stale lie", DIM, 9.5))
    b.append(cross(232, 48, 6))
    b.append(f'<line x1="300" y1="20" x2="300" y2="136" stroke="{LINE}" stroke-width="1"/>')
    b.append(label(455, 24, "DERIVED PREDICATE", OK, 10, "middle", "700"))
    b.append(box(330, 38, 250, 30, "childCount > 0 && style.foldable ≠ false", fs=9.5, tc=OK, fill="#12301d", stroke=OK))
    b.append(label(455, 88, "asked live, every time —", DIM, 9.5))
    b.append(label(455, 102, "cannot go stale", DIM, 9.5))
    b.append(box(330, 112, 250, 24, "foldAll = shapes.filter(isFoldable)", fs=9.5, tc=ACCENT2, fill="#122a3d", stroke=ACCENT2))
    b.append(label(455, 152, "…and a fold-all command is one filter", DIM, 9.5))
    return svg(608, 162, "".join(b))


# ===========================================================================
# BUCKET 2 — Layout & serialization (3 figures)
# ===========================================================================

# --- 11 · layout is per-container and re-entrant ---------------------------
def fig11():
    b = []
    b.append(label(150, 24, "TODAY — GLOBAL PASSES", "#ff9a8f", 10, "middle", "700"))
    b.append(box(40, 38, 220, 110, "", fill=PANEL2, stroke=DIM2))
    for i, (x, y) in enumerate([(60, 58), (130, 58), (200, 58), (95, 100), (165, 100)]):
        b.append(box(x, y, 44, 24, "▢", fill=PANEL, stroke=DIM2))
    b.append(box(40, 156, 220, 24, "one ELK pass over everything", fs=9.5, mono=False, tc="#ff9a8f", fill="#3d1f1c", stroke=WARN))
    b.append(f'<line x1="300" y1="20" x2="300" y2="186" stroke="{LINE}" stroke-width="1"/>')
    b.append(label(455, 24, "PER-CONTAINER, NESTED", OK, 10, "middle", "700"))
    b.append(box(330, 38, 250, 110, "", fill=PANEL2, stroke=OK))
    b.append(label(352, 54, "tree", OK, 9, "start", mono=True))
    b.append(box(348, 62, 100, 74, "", fill=PANEL, stroke=ACCENT2))
    b.append(label(366, 76, "grid", ACCENT2, 9, "start", mono=True))
    b.append(box(360, 84, 76, 44, "", fill=PANEL2, stroke=PURPLE))
    b.append(label(378, 98, "stack", PURPLE, 9, "start", mono=True))
    b.append(box(462, 62, 100, 74, "", fill=PANEL, stroke=ACCENT2))
    b.append(label(482, 76, "grid", ACCENT2, 9, "start", mono=True))
    b.append(box(330, 156, 250, 24, "change → getLayout(parent) → execute(parent)", fs=9, tc=OK, fill="#12301d", stroke=OK))
    return svg(608, 196, "".join(b))


# --- 12 · named inheritable stylesheet -------------------------------------
def fig12():
    b = []
    b.append(label(304, 22, "maxGraph resolve order — later wins, 'none' unsets", DIM2, 10, "middle", "700"))
    b.append(box(30, 34, 150, 30, "defaultStyle", fs=10))
    b.append(arrow(182, 49, 208, 49))
    b.append(box(212, 34, 190, 30, "baseStyleNames: ['rounded']", sub="", fs=9.5))
    b.append(arrow(404, 49, 430, 49))
    b.append(box(434, 34, 144, 30, "cell's own style", fs=10, mono=False))
    b.append(f'<line x1="30" y1="86" x2="578" y2="86" stroke="{LINE}" stroke-width="1"/>')
    b.append(label(304, 106, "ours, already shipped — same merge, different resolver", DIM2, 10, "middle", "700"))
    b.append(box(30, 118, 150, 30, "15 skin tokens", sub="closed set", fs=10, mono=False))
    b.append(arrow(182, 133, 208, 133))
    b.append(box(212, 118, 190, 30, "skin preset", sub="default · plain · sketch", fs=10, mono=False))
    b.append(arrow(404, 133, 430, 133))
    b.append(box(434, 118, 144, 30, "component override", fs=9.5, mono=False))
    b.append(box(30, 168, 548, 26, "the gap: styles a USER names and registers at runtime — putCellStyle('warn', …)", fs=9.5, tc=ACCENT, fill="none", stroke=ACCENT, dash="5 4"))
    return svg(608, 208, "".join(b))


# --- 13 · definitions flat by id, instances by reference -------------------
def fig13():
    b = []
    b.append(label(150, 22, "INLINED — upstream litegraph", "#ff9a8f", 10, "middle", "700"))
    b.append(box(50, 34, 200, 76, "", fill=PANEL2, stroke=DIM2))
    b.append(label(70, 52, "node json", DIM, 9.5, "start", mono=True))
    b.append(box(66, 60, 168, 40, "data.subgraph = {…whole graph…}", fs=8.5, tc="#ff9a8f", fill="#3d1f1c", stroke=WARN))
    b.append(arrow(150, 114, 150, 132, DIM2))
    b.append(label(150, 148, "clone() reassigns every UUID —", DIM, 9.5))
    b.append(label(150, 162, "two copies diverge instantly", DIM, 9.5))
    b.append(f'<line x1="300" y1="18" x2="300" y2="170" stroke="{LINE}" stroke-width="1"/>')
    b.append(label(455, 22, "FLAT — reuse stays possible", OK, 10, "middle", "700"))
    b.append(box(330, 34, 120, 66, "definitions", sub="d1: {…}", fs=10))
    b.append(box(480, 34, 100, 28, "{ref: d1}", fs=10))
    b.append(box(480, 72, 100, 28, "{ref: d1}", fs=10))
    b.append(arrow(478, 48, 454, 55, OK, marker="mG"))
    b.append(arrow(478, 86, 454, 79, OK, marker="mG"))
    b.append(label(455, 130, "instances hold a reference;", DIM, 9.5))
    b.append(label(455, 144, "the definition exists once", DIM, 9.5))
    return svg(608, 178, "".join(b))


# ===========================================================================
# BUCKET 3 — Runtime & interaction polish (7 figures)
# ===========================================================================

# --- 14 · wire-drop opens a type-filtered search ---------------------------
def fig14():
    b = []
    b.append(box(30, 40, 110, 54, "", fill=PANEL2, stroke=DIM2))
    b.append(label(85, 62, "Block A", FG, 10))
    b.append(dot(140, 78, 5, ACCENT2))
    b.append(label(85, 108, "out: number", ACCENT2, 8.5, "middle", mono=True))
    b.append(curve(145, 78, 240, 60, 330, 96, ACCENT, marker="mO"))
    b.append(label(240, 52, "drag → release on empty canvas", DIM, 9.5))
    b.append(box(340, 84, 200, 104, "", fill=PANEL, stroke=ACCENT))
    b.append(box(352, 96, 176, 22, "search…", fs=9.5, tc=DIM2, fill=PANEL2, stroke=LINE))
    b.append(box(352, 124, 176, 18, "Scale        (number)", fs=8.5, tc=FG, fill="#122a3d", stroke=ACCENT2))
    b.append(box(352, 146, 176, 18, "Clamp        (number)", fs=8.5, tc=DIM, fill=PANEL2, stroke=LINE))
    b.append(box(352, 168, 176, 14, "…only type-compatible nodes", fs=8, tc=DIM2, fill="none", stroke="none", mono=False))
    b.append(label(440, 208, "picked node lands pre-wired to the dropped cable", DIM, 9.5))
    b.append(label(190, 130, "type_filter_in:", DIM2, 8.5, "middle", mono=True))
    b.append(label(190, 142, "output.type", DIM2, 8.5, "middle", mono=True))
    return svg(608, 222, "".join(b))


# --- 15 · a cable that just fired glows for ~1s ----------------------------
def fig15():
    b = []
    b.append(box(30, 36, 100, 44, "", fill=PANEL2, stroke=DIM2))
    b.append(box(470, 36, 100, 44, "", fill=PANEL2, stroke=DIM2))
    b.append(curve(130, 58, 300, 30, 470, 58, DIM2, sw=2, marker=None))
    b.append(curve(130, 58, 300, 30, 470, 58, "#ffffff", sw=4, marker=None) .replace('stroke-width="4"', 'stroke-width="4" opacity="0.55"'))
    b.append(label(300, 24, "overlay re-render, white, fading", DIM, 9.5))
    ax, ay, aw, ah = 90, 120, 420, 70
    b.append(f'<line x1="{ax}" y1="{ay + ah}" x2="{ax + aw}" y2="{ay + ah}" stroke="{LINE}" stroke-width="1.2"/>')
    b.append(f'<line x1="{ax}" y1="{ay}" x2="{ax}" y2="{ay + ah}" stroke="{LINE}" stroke-width="1.2"/>')
    b.append(f'<path d="M {ax} {ay + 8} L {ax + aw * 0.5} {ay + 8} L {ax + aw} {ay + ah - 4}" fill="none" stroke="{ACCENT}" stroke-width="2"/>')
    b.append(dot(ax, ay + 8, 4, ACCENT))
    b.append(label(ax, ay - 8, "event: _last_time = now", ACCENT, 9, "start", mono=True))
    b.append(label(ax + aw + 6, ay + ah, "t", DIM2, 9.5, "start", mono=True))
    b.append(label(ax - 10, ay + 10, "α", DIM2, 9.5, "end", mono=True))
    b.append(label(ax + aw * 0.24, ay + 42, "α = 2 − 0.002·Δt", DIM, 9.5, "middle", mono=True))
    b.append(label(ax + aw, ay + ah + 16, "cutoff at 1000 ms", DIM2, 9, "end"))
    return svg(608, 212, "".join(b))


# --- 16 · promote one field, reject the widget farm ------------------------
def fig16():
    b = []
    b.append(label(140, 24, "REJECTED — widgets in the node", "#ff9a8f", 10, "middle", "700"))
    b.append(box(50, 36, 180, 108, "", fill=PANEL2, stroke=DIM2))
    for i, n in enumerate(["gain   [slider]", "mode   [dropdown]", "seed   [number]", "path   [file…]"]):
        b.append(box(64, 48 + i * 24, 152, 18, n, fs=8.5, tc=DIM, fill=PANEL, stroke=LINE))
    b.append(cross(230, 46, 8))
    b.append(label(140, 162, "every node re-implements a form", DIM, 9.5))
    b.append(f'<line x1="290" y1="20" x2="290" y2="170" stroke="{LINE}" stroke-width="1"/>')
    b.append(label(450, 24, "TAKEN — promote one field", OK, 10, "middle", "700"))
    b.append(box(320, 36, 110, 90, "", fill=PANEL2, stroke=DIM2))
    b.append(box(332, 64, 86, 18, "gain", fs=9, tc=OK, fill="#12301d", stroke=OK))
    b.append(box(470, 36, 110, 108, "", fill=PANEL, stroke=ACCENT2))
    b.append(label(525, 52, "Inspector", ACCENT2, 9.5, "middle", "600"))
    b.append(box(480, 62, 90, 18, "title", fs=8.5, tc=DIM, fill=PANEL2, stroke=LINE))
    b.append(box(480, 84, 90, 18, "gain ←", fs=8.5, tc=OK, fill="#12301d", stroke=OK))
    b.append(box(480, 106, 90, 18, "notes", fs=8.5, tc=DIM, fill=PANEL2, stroke=LINE))
    b.append(curve(420, 73, 452, 73, 478, 92, OK, marker="mG"))
    b.append(label(450, 162, "the node stays calm; one field surfaces", DIM, 9.5))
    return svg(608, 176, "".join(b))


# --- 17 · visual Groups ≠ semantic Regions ---------------------------------
def fig17():
    b = []
    b.append(label(150, 24, "GROUP — geometric, transient", ACCENT2, 10, "middle", "700"))
    b.append(box(50, 36, 200, 90, "", fill="none", stroke=ACCENT2, dash="5 4"))
    b.append(box(70, 54, 50, 26, "▢", fill=PANEL2, stroke=DIM2))
    b.append(box(140, 54, 50, 26, "▢", fill=PANEL2, stroke=DIM2))
    b.append(box(105, 90, 50, 26, "▢", fill=PANEL2, stroke=DIM2))
    b.append(label(150, 142, "membership recomputed from geometry", DIM, 9.5))
    b.append(label(150, 156, "at every press — nothing persists", DIM, 9.5))
    b.append(f'<line x1="300" y1="20" x2="300" y2="168" stroke="{LINE}" stroke-width="1.6"/>')
    b.append(label(455, 24, "REGION — semantic, persisted", OK, 10, "middle", "700"))
    b.append(box(355, 36, 200, 90, "", fill=PANEL2, stroke=OK))
    b.append(dot(355, 62, 4.5, ACCENT2))
    b.append(dot(355, 96, 4.5, ACCENT2))
    b.append(dot(555, 79, 4.5, ACCENT2))
    b.append(box(385, 54, 50, 26, "▢", fill=PANEL, stroke=DIM2))
    b.append(box(455, 54, 50, 26, "▢", fill=PANEL, stroke=DIM2))
    b.append(box(420, 90, 50, 26, "▢", fill=PANEL, stroke=DIM2))
    b.append(label(455, 142, "ID-set membership + a ports manifest,", DIM, 9.5))
    b.append(label(455, 156, "serialized with the document", DIM, 9.5))
    return svg(608, 172, "".join(b))


# --- 18 · named taps before reroute dots -----------------------------------
def fig18():
    b = []
    b.append(label(304, 22, "same long cable, two ways to touch it mid-span", DIM2, 10, "middle", "700"))
    b.append(dot(40, 66, 5, ACCENT2))
    b.append(f'<path d="M 45 66 C 150 66 200 66 300 66 C 400 66 460 66 566 66" fill="none" stroke="{DIM2}" stroke-width="2"/>')
    b.append(dot(568, 66, 5, ACCENT2))
    b.append(dot(220, 66, 6, PANEL2, stroke=WARN, sw=2))
    b.append(label(220, 46, "reroute dot", "#ff9a8f", 9.5, "middle", "600"))
    b.append(label(220, 92, "carries no name, no type —", DIM, 9))
    b.append(label(220, 104, "pure geometry", DIM, 9))
    b.append(box(370, 52, 96, 28, "temp:number", fs=9.5, tc=OK, fill="#12301d", stroke=OK))
    b.append(label(418, 42, "named tap", OK, 9.5, "middle", "600"))
    b.append(curve(418, 82, 418, 110, 480, 128, OK, marker="mG"))
    b.append(box(484, 120, 84, 24, "▢ consumer", fs=8.5, mono=False, fill=PANEL2, stroke=DIM2))
    b.append(label(370, 140, "a tap is joinable, lintable,", DIM, 9))
    b.append(label(370, 152, "and survives re-routing", DIM, 9))
    return svg(608, 166, "".join(b))


# --- 19 · the 7-boolean LOD ladder -----------------------------------------
def fig19():
    bools = [
        ("showNodeContent", 0.62),
        ("showPorts", 0.52),
        ("showPortLabels", 0.72),
        ("showConnectionLines", 0.28),
        ("showConnectionLabels", 0.78),
        ("showConnectionEndpoints", 0.58),
        ("showResizeHandles", 0.85),
    ]
    b = []
    ax, aw = 230, 330
    b.append(label(ax + aw / 2, 22, "zoom →", DIM2, 10, "middle", "700"))
    for i, (name, t) in enumerate(bools):
        y = 40 + i * 24
        b.append(label(ax - 8, y + 12, name, DIM, 9, "end", mono=True))
        b.append(f'<rect x="{ax}" y="{y}" width="{aw * t:.0f}" height="16" rx="3" fill="{PANEL2}" stroke="{LINE}"/>')
        b.append(f'<rect x="{ax + aw * t:.0f}" y="{y}" width="{aw - aw * t:.0f}" height="16" rx="3" fill="#12301d" stroke="{OK}" stroke-width="1"/>')
        b.append(label(ax + aw * t + (aw - aw * t) / 2, y + 12, "on", OK, 8.5, "middle"))
    b.append(box(ax, 216, aw, 24, "seven independent thresholds — not one 'simple/expanded' flip", fs=9, mono=False))
    return svg(608, 252, "".join(b))


# --- 20 · a minimap that cannot drift --------------------------------------
def fig20():
    b = []
    b.append(box(240, 30, 128, 34, "one model", fill="#122a3d", stroke=ACCENT2, tc=ACCENT2, fs=11))
    b.append(arrow(268, 66, 170, 96, ACCENT2, marker="mB"))
    b.append(arrow(340, 66, 448, 96, ACCENT2, marker="mB"))
    b.append(box(60, 100, 220, 110, "", fill=PANEL2, stroke=DIM2))
    b.append(label(170, 118, "main canvas", DIM, 9.5))
    for x, y in [(90, 130), (160, 130), (220, 160), (100, 170)]:
        b.append(box(x, y, 44, 22, "▢", fill=PANEL, stroke=DIM2))
    b.append(box(430, 100, 110, 70, "", fill=PANEL2, stroke=DIM2))
    b.append(label(485, 116, "outline", DIM, 9.5))
    for x, y in [(444, 124), (476, 124), (502, 140), (448, 144)]:
        b.append(box(x, y, 18, 10, "", fill=PANEL, stroke=DIM2))
    b.append(box(438, 120, 52, 30, "", fill="none", stroke=ACCENT, sw=1.6))
    b.append(label(485, 186, "viewport rect, draggable", DIM2, 8.5))
    b.append(label(304, 232, "a second graph view over the SAME model + stylesheet — there is no copy to drift", DIM, 10, "middle"))
    return svg(608, 244, "".join(b))


# ===========================================================================
# BUCKET 4 — Element-tool mechanics (6 figures)
# ===========================================================================

# --- 21 · one overlay boolean drives three behaviors -----------------------
def fig21():
    b = []
    b.append(box(30, 66, 190, 32, "relative = !isOverlay()", fill="#122a3d", stroke=ACCENT2, tc=ACCENT2, fs=10.5))
    fan = [("coordinate space: element-local", 34), ("useModelGeometry ∥= relative", 82), ("rotate ∥= relative", 130)]
    for text, y in fan:
        b.append(arrow(222, 82, 258, y + 14, DIM2))
        b.append(box(262, y, 200, 28, text, fs=9.5))
    b.append(f'<line x1="476" y1="24" x2="476" y2="168" stroke="{LINE}" stroke-width="1"/>')
    b.append(label(540, 34, "get it wrong:", "#ff9a8f", 9.5, "middle", "600"))
    b.append(f'<g transform="rotate(18 540 96)">{box(510, 76, 60, 40, "", fill=PANEL2, stroke=DIM2)}</g>')
    b.append(f'<g transform="rotate(36 540 96)"><rect x="562" y="70" width="13" height="13" rx="3" fill="{WARN}"/></g>')
    b.append(f'<rect x="563" y="71" width="13" height="13" rx="3" fill="none" stroke="{OK}" stroke-width="1.4"/>')
    b.append(label(540, 152, "embedded handle told to rotate", DIM, 8))
    b.append(label(540, 164, "rotates TWICE on nested shapes", DIM, 8))
    return svg(608, 178, "".join(b))


# --- 22 · model geometry vs view geometry ----------------------------------
def fig22():
    b = []
    b.append(box(70, 40, 300, 130, "", fill="none", stroke=ACCENT2, dash="6 4", sw=1.6))
    b.append(label(220, 32, "model.getBBox() — declared extent", ACCENT2, 9.5, "middle", mono=True))
    b.append(box(120, 84, 170, 66, "", fill=PANEL2, stroke=DIM2))
    b.append(box(136, 98, 50, 24, "▢", fill=PANEL, stroke=DIM2))
    b.append(box(206, 108, 50, 24, "▢", fill=PANEL, stroke=DIM2))
    b.append(label(205, 164, "rendered node hugs the children", DIM2, 9, "middle"))
    b.append(box(120, 84, 170, 66, "", fill="none", stroke=WARN, sw=1.8))
    b.append(label(438, 70, "a Region boundary tool on view", DIM, 9.5, "start"))
    b.append(label(438, 84, "geometry hugs the WRONG box —", DIM, 9.5, "start"))
    b.append(label(438, 98, "the container's declared extent", DIM, 9.5, "start"))
    b.append(label(438, 112, "is model data, not pixels", DIM, 9.5, "start"))
    b.append(dot(420, 66, 4, WARN))
    b.append(dot(420, 130, 4, ACCENT2))
    b.append(label(438, 134, "boundary from model bbox: right", DIM, 9.5, "start"))
    return svg(608, 186, "".join(b))


# --- 23 · the Connect tool skips the magnet gate ---------------------------
def fig23():
    b = []
    b.append(label(120, 30, "ordinary magnet press", DIM, 10, "middle", "600"))
    b.append(box(40, 40, 160, 28, "pointerdown on magnet", fs=9.5, mono=False))
    b.append(arrow(202, 54, 238, 54))
    b.append(f'<polygon points="242,54 302,30 362,54 302,78" fill="{PANEL2}" stroke="{AMBER}"/>')
    b.append(label(302, 58, "validateMagnet?", AMBER, 9, "middle", mono=True))
    b.append(arrow(364, 54, 428, 54, OK, marker="mG"))
    b.append(label(395, 44, "pass", OK, 8.5, "middle"))
    b.append(box(432, 40, 146, 28, "dragLinkStart()", fs=10))
    b.append(label(120, 116, "Connect tool press", DIM, 10, "middle", "600"))
    b.append(box(40, 126, 160, 28, "Connect.dragstart", fs=9.5))
    b.append(curve(202, 140, 320, 140, 470, 74, WARN, dash="5 4", marker="mW"))
    b.append(label(330, 158, "…straight into dragLinkStart — no gate on this path", "#ff9a8f", 9.5, "middle"))
    return svg(608, 178, "".join(b))


# --- 24 · tool placement is a tiny expression language ---------------------
def fig24():
    b = []
    b.append(box(80, 44, 260, 120, "", fill=PANEL2, stroke=DIM2))
    b.append(label(210, 106, "element bbox (w × h)", DIM2, 9.5))
    pts = [
        (340, 44, "x:'100%', y:0", ACCENT2, 14, 4),
        (330, 104, "x:'calc(w-10)', y:'calc(h/2)'", ACCENT, 14, 4),
        (80, 164, "x:0, y:'100%'", PURPLE, 14, 22),
    ]
    for x, y, t, c, dx, dy in pts:
        b.append(f'<rect x="{x - 7}" y="{y - 7}" width="14" height="14" rx="3" fill="{c}"/>')
        b.append(label(x + dx, y + dy, t, c, 9.5, "start", mono=True))
    b.append(label(304, 208, "strings evaluated against the live bbox — serializable, themeable, host-independent", DIM, 9.5, "middle"))
    return svg(608, 222, "".join(b))


# --- 25 · every tool gesture is one stamped undo step ----------------------
def fig25():
    b = []
    y = 52
    b.append(f'<line x1="36" y1="{y}" x2="572" y2="{y}" stroke="{LINE}" stroke-width="1.4"/>')
    b.append(dot(60, y, 4, ACCENT))
    b.append(label(60, y - 12, "pointerdown", FG, 9.5, "middle"))
    b.append(label(60, y + 20, "startBatch({tool: cid})", ACCENT, 8.5, "middle", mono=True))
    for i, x in enumerate([180, 260, 340]):
        b.append(dot(x, y, 3.5, ACCENT2))
        b.append(label(x, y + 20, "{tool: cid}", DIM2, 8, "middle", mono=True))
    b.append(label(260, y - 12, "mutations, each stamped", DIM, 9))
    b.append(dot(470, y, 4, ACCENT))
    b.append(label(470, y - 12, "pointerup", FG, 9.5, "middle"))
    b.append(label(470, y + 20, "stopBatch", ACCENT, 8.5, "middle", mono=True))
    b.append(arrow(500, y + 34, 500, y + 52, DIM2))
    b.append(box(430, y + 56, 140, 26, "ONE undo step", fs=10, mono=False, fill="#12301d", stroke=OK, tc=OK))
    b.append(box(36, y + 56, 360, 40, "", fill=PANEL2, stroke=LINE))
    b.append(label(216, y + 72, "update loop:  opt.tool !== tool.cid  →  update()", DIM, 9, "middle", mono=True))
    b.append(label(216, y + 87, "a handle never re-renders from its own mid-drag writes", DIM2, 8.5, "middle"))
    return svg(608, 168, "".join(b))


# --- 26 · tool sets swap wholesale via one paper event ---------------------
def fig26():
    b = []
    b.append(box(230, 30, 148, 32, "paper.removeTools()", fs=10, fill="#122a3d", stroke=ACCENT2, tc=ACCENT2))
    b.append(box(238, 74, 132, 22, "'tools:event'", fs=9.5, tc=PURPLE, fill="#241a3a", stroke=PURPLE))
    b.append(arrow(304, 62, 304, 72, DIM2))
    targets = [(80, 130), (250, 130), (420, 130)]
    for i, (x, y) in enumerate(targets):
        b.append(arrow(304, 98, x + 60, y - 4, PURPLE, marker="mA"))
        b.append(box(x, y, 120, 44, "", fill=PANEL2, stroke=DIM2))
        b.append(label(x + 60, y + 18, f"ToolsView {i + 1}", DIM, 9.5))
        b.append(label(x + 60, y + 34, "listens, clears", DIM2, 8.5))
    b.append(label(304, 200, "every mounted tools view subscribes to one paper-wide channel — 'clear every handle' is one call", DIM, 9.5, "middle"))
    return svg(608, 214, "".join(b))


# ===========================================================================
# The 26 cards
# ===========================================================================
V = "vyuh_node_flow/packages/vyuh_node_flow"
MG = "maxGraph/packages/core/src"
LG = "litegraph.js/src"
JJ = "joint-core/src"

CONTAINER = [
    card(1, "Region membership is three independent axes", "Vyuh Flow", "source", "open", fig01(),
         "Vyuh ships the axes fused into three presets — <code>GroupBehavior.bounds / explicit / parent</code> — "
         "but its own enum docs decompose each preset into exactly the three decisions above. The 2×2×2 space has "
         "eight corners; only three ship.",
         f"{V}/lib/src/nodes/group_node.dart:20-42 (enum docs name membership, sizing, escape per value)",
         "The scene kit has no container model yet (lint.ts's own header: no branch/region/arm concept exists). "
         "When Region lands here, make each axis a named field from day one instead of one enum that fuses them."),
    card(2, "PortType.both: take the type, not the resolution", "Vyuh Flow", "source", "open", fig02(),
         "A <code>both</code> port satisfies <code>isInput</code> AND <code>isOutput</code>, so it appears in both "
         "port lists — the node renderer dodges the double-render with a comment admitting it. Drag polarity is "
         "then frozen into <code>isStartFromOutput</code> the moment the press starts.",
         f"{V}/lib/src/ports/port.dart:71-86 · nodes/node.dart:364,369 (both lists) · "
         "nodes/node_container.dart:143-145 (the dodge) · connections/temporary_connection.dart:101",
         "Our ports carry no polarity vocabulary at all yet (lint.ts grepped for portType/dataType: zero hits). "
         "Adopt the three-value type; keep membership single (one list, two predicates) so no consumer can double-count."),
    card(3, "An ID-set nesting model needs an explicit cycle guard", "Vyuh Flow", "source", "partial", fig03(),
         "Verified by absence: <code>addNode()</code> asserts the behavior kind and inserts — no ancestor walk. The "
         "only cycle defense in the codebase is a <code>movedNodes</code> set inside drag recursion, commented "
         "“to prevent infinite loops” — the symptom patched where it explodes, not where it enters.",
         f"{V}/lib/src/nodes/group_node.dart:229-246 (no check) · editor/controller/group_api.dart:127-129 (drag guard)",
         "Half landed: <code>findCycles</code> (scene.ts:288, SCC-based) already powers the wire-graph cycle lint. "
         "Point the same machinery at the containment relation the day a container model exists — guard the WRITE, not the drag."),
    card(4, "Nested-container z-order is one invariant enforced at three moments", "Vyuh Flow", "source", "design", fig04(),
         "The invariant “a nested group renders above its parent” is re-enforced at membership-add, at "
         "drag-start, and at load/attach — three separate call sites in one file, all writing "
         "<code>child.z = parent.z + 1</code>. The repetition is the finding: no single choke point exists.",
         f"{V}/lib/src/nodes/group_node.dart:229-246 (addNode) · :654-668 (onDragStart) · :670-703 (onContextAttached)",
         "bbox-ui's core deliberately owns no z-index (CLAUDE.md: interaction geometry is host-owned and never travels). "
         "So this lands as a host checklist: every host's reparent, drag-start and load seams must re-assert the same "
         "one-line invariant — three moments, per host."),
    card(5, "Freeze a dragged container's membership at drag-start", "Vyuh Flow", "source", "open", fig05(),
         "<code>onDragStart</code> captures the member set once (spatial query or ID-set copy); every "
         "<code>onDragMove</code> then moves <code>captured − selectedNodeIds</code> — the code's own comment: "
         "“excluding nodes that are already selected (they're being moved by selection drag)”. Without the "
         "subtraction, a block that is both selected and contained moves at 2×δ.",
         f"{V}/lib/src/nodes/group_node.dart:654-663 (capture) · :725-737 (difference + comment) · :739-743 (clear on end)",
         "dragPolicy.ts landed who OWNS a press; this is the next layer up — what a container drag DOES. The "
         "capture-once-subtract-selected pair is the spec for our hosts' container drag, verbatim."),
    card(6, "Auto-fit-on-child-move needs a reentrancy latch", "Vyuh Flow", "source", "inflight", fig06(),
         "Child positions are watched by reactions that call <code>fitToNodes()</code>; moving a group moves its "
         "children, which would re-fire the reactions mid-move. The latch: <code>_isMovingGroupNodes</code> is set "
         "before the batch move, checked by every reaction through <code>shouldSkipUpdates()</code>, cleared in a finally.",
         f"{V}/lib/src/editor/controller/group_api.dart:106 (wire-up), :124,:161 (set/clear) · "
         "nodes/mixins/groupable_mixin.dart:193,215 (checks) · nodes/group_node.dart:337-345 (fit on child move)",
         "A fit-to-content lane is implementing exactly this behavior here right now (dispatched 2026-09-17, unmerged "
         "as this is written). This latch is that lane's acceptance test: drag a fitted container and prove no oscillation."),
    card(7, "Decide the empty-container lifecycle per kind, explicitly", "Vyuh Flow", "source", "open", fig07(),
         "One derived boolean answers it: <code>shouldRemoveWhenEmpty = behavior == explicit && "
         "!preserveWhenEmpty</code>. An emptied ad-hoc group auto-deletes; a container whose emptiness is "
         "meaningful (a loop body awaiting content) passes <code>preserveWhenEmpty</code> and persists.",
         f"{V}/lib/src/nodes/group_node.dart:330-334 · nodes/mixins/groupable_mixin.dart:150-166 (the hook pair)",
         "When Region lands: an emptied selection-promoted Region should evaporate; an emptied Branch arm should not. "
         "Make it a per-kind constructor flag from the start — retrofitting the distinction later means data migration."),
    card(8, "Containment is three policies, not one behavior", "maxGraph", "source", "open", fig08(),
         "maxGraph's own code comment says it: “Extends the parent or constrains the child.” Three per-cell "
         "predicates — <code>isExtendParent</code> (parent grows), <code>isConstrainChild</code> (child clamps), "
         "<code>isAllowOverlapParent</code> (child may straddle) — compose per container kind instead of one global rule.",
         f"{MG}/view/mixin/CellsMixin.ts:672-681 (compose on add) · :1077-1081 (on resize) · "
         "view/AbstractGraph.ts:1159-1175 (overlap feeds getOverlap)",
         "The same decomposition Region needs the day it can hold blocks: a swimlane-like lane wants clamp, a "
         "grow-to-fit Region wants extend, an annotation overlay wants overlap. Three predicates on the container "
         "kind, resolved per cell — never one boolean on the canvas."),
    card(9, "Route reparenting through one judgeContainment predicate", "maxGraph", "source", "partial", fig09(),
         "maxGraph answers “may this land here?” in one overridable predicate per gesture: "
         "<code>isValidDropTarget(cell, cells, evt)</code> for containment, <code>isValidConnection(source, target)</code> "
         "for wiring — the same shape, one gesture apart.",
         f"{MG}/view/mixin/SwimlaneMixin.ts:219-226 · view/mixin/ConnectionsMixin.ts:530-532",
         "The wiring twin already landed here: <code>validateConnection</code> (scene/edgeValidation.ts) gates a "
         "candidate edge with a reasoned verdict. Containment gets the mirror — same verdict vocabulary, same "
         "pure-function shape — the day drops can reparent."),
    card(10, "Foldability is a derived predicate, never a stored flag", "maxGraph", "source", "open", fig10(),
         "The whole implementation is one line: <code>cell.getChildCount() > 0 && (style.foldable ?? true)</code>. "
         "Because nothing is stored, nothing goes stale — and fold-all is just "
         "<code>getFoldableCells = cells.filter(isCellFoldable)</code>.",
         f"{MG}/view/mixin/FoldingMixin.ts:73-75 (the predicate) · :67-71 (fold-all as a filter)",
         "foldingChevron.tsx renders the affordance but folded/foldable arrive as props — correct for a presentational "
         "kit. The rule lands on whoever computes those props: derive <code>foldable</code> from live child count; "
         "never persist it."),
]

LAYOUT = [
    card(11, "Layout is per-container and re-entrant", "maxGraph", "source", "open", fig11(),
         "A layout is resolved PER PARENT — <code>getLayout(cell, eventName)</code> — and executed against that "
         "container alone when its children change, nesting naturally: a tree layout can hold a grid holding a "
         "stack. The manager walks changed cells to their layout-owning ancestors and runs each.",
         f"{MG}/view/layout/LayoutManager.ts:203 (per-cell resolve) · :267-345 (changes→owning parents) · :348-370 (execute)",
         "SystemSketch's ELK and d3-hierarchy passes are global sweeps; this kit's layout.ts files are per-component. "
         "The missing middle is exactly this: a per-container layout slot, so one Region can be tree-laid while its "
         "sibling stays hand-placed."),
    card(12, "A named, inheritable stylesheet is our token cascade with user-defined names", "maxGraph", "source", "partial", fig12(),
         "Resolution is a documented merge: default style, then each named base style in array order, then the "
         "cell's own props — with <code>'none'</code> as an explicit unset. Styles are registered at runtime under "
         "user-chosen names (<code>putCellStyle('rounded', …)</code>) and referenced by name from any cell.",
         f"{MG}/view/style/Stylesheet.ts:152-154 (register) · :157-172 (merge order, none-unsets)",
         "Our half exists: skin.ts ships a closed 15-token, three-preset cascade with per-component overrides. What "
         "we lack is the user-named tier — a runtime-registered style a board can define once and reference "
         "everywhere. One resolver should serve both."),
    card(13, "Store definitions flat by id; instances hold a reference", "litegraph.js", "source", "partial", fig13(),
         "Upstream litegraph inlines: a subgraph node's serialized form embeds the whole child graph "
         "(<code>data.subgraph = this.subgraph.serialize()</code>), and cloning deep-copies with fresh UUIDs — two "
         "copies diverge instantly, which is precisely what forecloses reuse later.",
         f"{LG}/nodes/base.js:29 (owns an LGraph) · :293 (serializes inline) — the counter-example, verified",
         "linking.ts already made the right identity move: groups key on <code>definitionId</code>, names are labels "
         "(rename detaches rather than silently re-keying). Extend the same split to reusable containers when they "
         "arrive: definitions in a flat table, instances by reference."),
]

RUNTIME = [
    card(14, "Dropping a wire on empty canvas opens a type-filtered node search", "litegraph.js", "source", "partial", fig14(),
         "On link release over empty space, litegraph opens its search box seeded with the dragged slot's type — "
         "<code>type_filter_in: connecting_output.type</code> — so only compatible nodes appear, and the pick lands "
         "pre-wired. Typed ports become an affordance, not just a validation nag.",
         f"{LG}/litegraph.js:139 (option) · :6878-6893 (release handler, both filter directions)",
         "The menu half exists — <code>completionMenu</code> (branch claude/autocomplete-menu, unmerged, pre-reset "
         "lineage) is a type-filterable completion popup. The gesture half (wire-drop → seeded search → pre-wired "
         "node) is untouched, and needs port types (card 02) to filter on."),
    card(15, "A cable that just carried a value glows for ~1 second", "litegraph.js", "source", "open", fig15(),
         "On trigger the link is stamped <code>_last_time = now</code>; for the next 1000 ms the renderer re-draws "
         "it white on top with <code>alpha = 2 − 0.002·Δt</code> — a linear fade, computed from one timestamp. "
         "The cheapest honest “this fired” signal: no animation system, one number per link.",
         f"{LG}/litegraph.js:3347 (stamp) · :9459-9470 (fade + overlay re-render)",
         "This kit is presentational — nothing executes, so nothing fires yet. The port is one optional "
         "<code>lastActiveAt</code> timestamp on a wire's data and a host-side overlay pass. Worth taking the day "
         "wires carry live values; meaningless before."),
    card(16, "Reject widgets-in-node; take “promote one field”", "litegraph.js", "mixed", "partial", fig16(),
         "litegraph embeds full form widgets in every node (<code>addWidget(type, name, value, callback)</code> — "
         "verified), and every graph grows a hundred tiny forms. The keeper is the inverse, from ComfyUI's later "
         "practice (as documented, not read in source): expose ONE chosen inner field on the parent's inspector.",
         f"{LG}/litegraph.js:3813 (addWidget, verified) · promote-one-field: ComfyUI docs, as documented",
         "We already hold the right end: packages/inspector is the form surface, nodes stay calm. The addition is a "
         "<code>promoted</code> marker so a member's field can surface one level up — the inspector reads it; "
         "components never grow widgets."),
    card(17, "Visual Groups and semantic Regions are different animals — keep the wall", "litegraph.js", "source", "open", fig17(),
         "A litegraph group is pure geometry: membership is recomputed from bounds at every press "
         "(<code>recomputeInsideNodes()</code> called at group drag-start), nothing persists, nothing is addressable. "
         "A Region is the opposite: ID-set membership, a ports manifest, document data.",
         f"{LG}/litegraph.js:5072 (recompute from geometry) · :6272 (called at press)",
         "Neither exists in the scene kit yet — which is the moment to draw the wall: ship Group as a throwaway "
         "visual convenience and Region as document structure, never one component with a mode flag. (blockMembers.tsx "
         "is already on the Region side: authored membership, persisted.)"),
    card(18, "Named port taps before reroute dots", "litegraph.js", "source", "open", fig18(),
         "litegraph's bridge nodes carry <code>properties: {name, type, value}</code> — a mid-graph touch point with "
         "an identity. Upstream has no reroute dots at all (grep: zero hits); the dots are ComfyUI-fork vocabulary, "
         "and each one carries nothing — pure geometry a lint can't see and a rename can't find.",
         f"{LG}/nodes/base.js:484-491 (GraphInput: name+type+value) · reroute absent upstream, verified by grep",
         "When cable-touching arrives here, ship the named tap first: it is joinable (card 13's definitionId logic "
         "applies), lintable (many-to-one sees through it), and survives re-routing. Dots can come later as sugar."),
    card(19, "A 7-boolean zoom ladder, shipped opt-in", "Vyuh Flow", "mixed", "open", fig19(),
         "Verified: <code>DetailVisibility</code> is exactly seven independent booleans — content, ports, port "
         "labels, connection lines/labels/endpoints, resize handles — each with its own zoom threshold, packaged as "
         "an opt-in <code>LodPlugin</code>. That it was once default-on and reverted is the source agents' report "
         "(as documented); its opt-in packaging today is fact.",
         f"{V}/lib/src/plugins/lod/detail_visibility.dart:42-77 (the seven) · plugins/lod/lod_plugin.dart (opt-in plugin)",
         "Richer than a simple/expanded flip, and orthogonal to it: our Block views are semantic states; this ladder "
         "is a render veto per element class. Keep it opt-in exactly as Vyuh concluded — boards under ~200 visible "
         "blocks don't need it, and hitRegions' zoom work already covers the hit-target half."),
    card(20, "A minimap that shares the model cannot drift", "maxGraph", "source", "partial", fig20(),
         "maxGraph's Outline is a second Graph constructed over the SAME data model and stylesheet — "
         "<code>new BaseGraph({model: source.getDataModel(), stylesheet: source.getStylesheet()})</code> — updating "
         "off the source's own change events. There is no mirror copy, so there is nothing to reconcile.",
         f"{MG}/view/other/Outline.ts:311-322 (shared model+stylesheet) · :111 (updates from source CHANGE)",
         "Two of our three hosts get this stock: @xyflow/react ships MiniMap (verified on disk, "
         "additional-components/MiniMap) and tldraw's UI has one built in. The DOM-canvas host is the real gap — "
         "and the fix is maxGraph's shape: render HOST_SCENE twice, never maintain a second scene."),
]

TOOLS = [
    card(21, "getToolOptions derives three behaviors from one overlay boolean", "JointJS — element tools", "source", "open", fig21(),
         "<code>relative = !toolView.isOverlay()</code>, then two option overrides follow for free: "
         "<code>useModelGeometry ||= relative</code>, <code>rotate ||= relative</code>. Boundary's own comment names "
         "why: “With relative positioning, rotation is implicit” — an embedded tool already rotates with its "
         "element; telling it to rotate again is the classic double-transform on nested shapes.",
         "joint-core/src/cellTools/helpers.mjs:33-47 (the derivation) · cellTools/Boundary.mjs:34-46 (implicit-rotation comment)",
         "traceEditor's handles live in SVG overlay today; the moment any handle mounts inside a Block's own DOM "
         "(both spaces exist in our hosts), this one boolean must drive space, geometry-source and rotation together — "
         "deriving three from one is what makes the bug unrepresentable."),
    card(22, "Container tools need model geometry, not view geometry", "JointJS — element tools", "source", "open", fig22(),
         "One helper, two sources: <code>useModelGeometry ? model.getBBox() : view.getNodeUnrotatedBBox(el)</code>. "
         "They diverge exactly on containers, where the rendered node hugs the children while the model declares the "
         "container's own extent — a boundary tool on view geometry hugs the wrong box.",
         "joint-core/src/cellTools/helpers.mjs:8-31 (getViewBBox, both branches)",
         "Our split makes this sharp: layout geometry is core data, rendered pixels are host-side. Any future Region "
         "boundary/resize tool must read the scene's declared bounds, never measure the DOM — measuring is exactly "
         "what CLAUDE.md's no-self-measurement rule already forbids components to do."),
    card(23, "JointJS's own Connect tool skips the validateMagnet gate", "JointJS — element tools", "callgraph", "open", fig23(),
         "Now read in source (the first report flagged it unverified): the ordinary press path gates on "
         "<code>paper.options.validateMagnet(…)</code> and only then reaches <code>dragLinkStart</code>; "
         "Connect.dragstart calls <code>relatedView.dragLinkStart(…)</code> directly — no validateMagnet call exists "
         "in the tool. Read from both call sites; still not exercised at runtime.",
         "joint-core/src/dia/ElementView.mjs:785-802 (gated path) · cellTools/Connect.mjs:60-68 (ungated path)",
         "The lesson for our hover-connect affordance (portDotSightings → any future connect button): route the "
         "convenience gesture through the SAME validateConnection gate as the raw press — a second entry point that "
         "skips the judge is how “validated” graphs grow invalid edges."),
    card(24, "Tool placement as a tiny serializable expression language", "JointJS — element tools", "source", "partial", fig24(),
         "A tool's position is a string evaluated against the element's live bbox: percentages and "
         "<code>calc(w-10)</code>-style expressions (<code>isCalcExpression → evalCalcExpression(x, bbox)</code>). "
         "Placement travels as data — themeable, serializable, identical across hosts.",
         "joint-core/src/cellTools/Button.mjs:27-51 (percentage + calc branches)",
         "port.layout.ts already speaks a placement vocabulary — <code>(origin, offsetX, offsetY)</code> presets — "
         "but as TypeScript values, not strings. The expression form is what lets a board file or a skin position an "
         "affordance without shipping code; worth adopting when tool placement becomes user-configurable."),
    card(25, "Every tool gesture is one undo step, stamped with the tool's id", "JointJS — element tools", "source", "open", fig25(),
         "Pointer-down opens <code>startBatch('control-move', {ui: true, tool: this.cid})</code>; every mutation in "
         "the drag carries the same stamp; pointer-up closes the batch — one undo step. The stamp's second job: the "
         "tools-update loop skips the tool whose own write triggered it (<code>opt.tool !== tool.cid</code>), so a "
         "handle never fights its own update mid-drag.",
         "joint-core/src/cellTools/Control.mjs:151,168 (batch open/close) · dia/ToolsView.mjs:55 (self-skip) · "
         "dia/CellView.mjs:164 (tool writes render sync)",
         "The scene kit has no undo yet — hosts own history today. This is the contract to hand them: one gesture = "
         "one batch, every write stamped with its author. The self-skip alone justifies the stamp; we re-derived "
         "that bug independently in traceEditor's drag handling."),
    card(26, "Tool sets swap wholesale; one paper-wide event clears every handle", "JointJS — element tools", "source", "open", fig26(),
         "Every mounted ToolsView subscribes to a single channel — <code>toolsView.listenTo(paper, "
         "'tools:event', …)</code> — and <code>paper.removeTools() / hideTools() / showTools()</code> broadcast to "
         "all of them. “Clear every handle before opening a menu” is one call, not a walk over views.",
         "joint-core/src/dia/Paper.mjs:3170-3187 (broadcast trio) · dia/CellView.mjs:1153 (every view subscribes)",
         "As our editors multiply (trace handles, member drag, future Region resize), the same primitive keeps hosts "
         "sane: one host-level channel every affordance layer subscribes to, so modes can't strand a stray handle. "
         "Cheap to add to hostGestures.ts when a second handle kind ships."),
]


# ---------------------------------------------------------------------------
# Write the four fragments
# ---------------------------------------------------------------------------
def main() -> None:
    FRAG_DIR.mkdir(parents=True, exist_ok=True)
    buckets = [
        ("prior-art-visuals-container.html", STYLE, CONTAINER),
        ("prior-art-visuals-layout.html", "", LAYOUT),
        ("prior-art-visuals-runtime.html", "", RUNTIME),
        ("prior-art-visuals-tools.html", "", TOOLS),
    ]
    for name, prefix, cards in buckets:
        path = FRAG_DIR / name
        path.write_text(prefix + "\n".join(cards))
        print(f"wrote {path} ({path.stat().st_size:,} bytes, {len(cards)} cards)")
    total = sum(len(c) for _, _, c in buckets)
    print(f"total cards: {total} (expected 26)")


if __name__ == "__main__":
    main()
