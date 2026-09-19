#!/usr/bin/env python3
"""
Draw the three prior-art cards Zach asked to have EXPLAINED, not proposed.

Zach, 2026-09-18, on reports/media/node-editor-prior-art-2026-09-17.html
(feedback block in PROJECT - Black Box UI.md under "Feedback on Node-editor
prior art"): he ruled on nine cards and asked to be taught three —

  #4  "Collapse needs a generalized edge-promotion resolver, and nobody's
      built the whole thing"            — "Please explain this more"
  #6  "A container's ports are a manifest; the shapes inside are just
      placements"                       — "I don't understand this"
  #11 "A shipped library of 14 parametric drag-handles, one a ready-made
      donor"                            — "I would be curious to see what
                                          this looks like"

This script generates the FIGURES for that teaching page: three HTML
fragments (one per card), fed to docs/build_lane_report.py by
docs/lane_report_manifest.prior-art-explained.json:

    python3 docs/build_prior_art_explained_fragments.py
    python3 docs/build_lane_report.py \
        docs/lane_report_manifest.prior-art-explained.json --skip-capture \
        --out /home/bam/bbox-ui/reports/media/prior-art-explained-2026-09-18.html

EVERY mechanism drawn below was re-read in real source before drawing
(repo rule: algorithms carry citations, never from memory). Checkouts live
OUTSIDE this repo, in the session scratchpad:
  - maxGraph      (Apache-2.0) github.com/maxGraph/maxGraph      @ 1559b37 (2026-09-12)
  - litegraph.js  (MIT)        github.com/jagenjo/litegraph.js   @ 0555a2f (2024-01-08, upstream tip)
  - JointJS       (MPL-2.0)    github.com/clientIO/joint         @ 881e49d (2026-09-16)
    — read and CITED only; no MPL source is copied into this repo, the same
    line held for LGPL libavoid (elbow/nudge.ts:63-68).
  - SystemSketch  read-only at /home/bam/systemsketch @ 10748b8c.
Citations name file:line in those trees. Where the original card's claim
did NOT survive re-reading (the "14" count; the Grid-divider donor), the
card here says so plainly — that was the brief.

VISUAL LANGUAGE: imports the SVG kit from
docs/build_prior_art_visuals_fragments.py — the drawn hand Zach already
approved — rather than restating a second style.
"""
from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from build_prior_art_visuals_fragments import (  # noqa: E402
    ACCENT, ACCENT2, AMBER, DIM, DIM2, FG, FRAG_DIR, LINE, MONO, OK, PANEL,
    PANEL2, PURPLE, SANS, STYLE, WARN, arrow, box, card, cross, curve, dot,
    label, svg,
)

# Lead-paragraph style for the per-section teaching prose, appended once.
LEAD_STYLE = """
<style>
.pa-lead { font-size:13.5px; color:#c7cdd8; line-height:1.65; margin:2px 0 14px; max-width:78ch }
.pa-lead b { color:var(--fg) }
.pa-lead code { font-family:ui-monospace,Menlo,Consolas,monospace; font-size:12px;
  background:var(--panel2); border:1px solid var(--line); border-radius:4px; padding:0 4px }
</style>
"""


def lead(text: str) -> str:
    return f'<p class="pa-lead">{text}</p>'


# ===========================================================================
# SECTION 1 — Card #4: the generalized edge-promotion resolver
# ===========================================================================

def fig41():
    """maxGraph's mechanism: promotion is a render-time projection."""
    b = []
    # -- left panel: the document ------------------------------------------
    b.append(label(160, 20, "THE DOCUMENT — never edited", DIM2, 10, "middle", "700"))
    b.append(box(28, 34, 70, 34, "A", sub="outside", fs=12))
    # group G expanded, child c inside
    b.append(box(150, 34, 150, 120, "", fill=PANEL, stroke=ACCENT2, rx=8))
    b.append(label(225, 50, "G — expanded", ACCENT2, 10, "middle", "600"))
    b.append(box(186, 76, 78, 34, "c", sub="inner child", fs=12))
    b.append(arrow(98, 51, 182, 90, ACCENT))
    b.append(label(128, 44, "A → c", ACCENT, 9.5, "middle", "600", mono=True))
    b.append(label(160, 176, "the edge stores its true ends, forever", DIM, 9.5, "middle"))
    # divider
    b.append(f'<line x1="322" y1="14" x2="322" y2="186" stroke="{LINE}" stroke-width="1"/>')
    # -- right panel: the render -------------------------------------------
    b.append(label(470, 20, "THE RENDER — G collapsed", DIM2, 10, "middle", "700"))
    b.append(box(346, 60, 70, 34, "A", fs=12))
    b.append(box(482, 52, 104, 50, "G", sub="collapsed", fill=PANEL, stroke=ACCENT2, tc=ACCENT2, fs=12))
    b.append(arrow(416, 77, 476, 77, ACCENT))
    b.append(dot(482, 77, 5, ACCENT, stroke=FG, sw=1.2))
    b.append(label(482, 118, "landing point: PerimeterFunction,", DIM, 9.2, "middle"))
    b.append(label(482, 131, "aimed at the OTHER end", DIM, 9.2, "middle"))
    # the walk
    b.append(label(470, 156, "the walk:  c → G(collapsed) → render terminal = G", AMBER, 9.5, "middle", "600", mono=True))
    b.append(label(470, 172, "re-asked on every render · the stored edge never changes", DIM2, 9, "middle"))
    return svg(620, 196, "".join(b))


def _mini_panel(b, x, y, w, h, title, col=DIM2):
    b.append(box(x, y, w, h, "", fill=PANEL, stroke=LINE, rx=8))
    b.append(label(x + w / 2, y + 16, title, col, 9.5, "middle", "700"))


def fig42():
    """The five cases 'generalized' actually means."""
    b = []
    # (a) fan-in ------------------------------------------------------------
    _mini_panel(b, 10, 8, 296, 130, "A · MANY CROSSINGS, ONE LANDING")
    b.append(box(196, 46, 96, 56, "G", sub="collapsed", stroke=ACCENT2, tc=ACCENT2, fs=11))
    for i, yy in enumerate((40, 72, 104)):
        b.append(box(26, yy - 9, 44, 20, f"m{i + 1}", fs=9))
        b.append(curve(70, yy + 1, 140, yy + 1, 192, 73, ACCENT, 1.4))
    b.append(dot(196, 74, 5, ACCENT, stroke=FG, sw=1.1))
    b.append(label(158, 128, "maxGraph fans N points; a port model converges on ONE", DIM, 8.8, "middle"))
    # (b) both ends folded ---------------------------------------------------
    _mini_panel(b, 314, 8, 296, 130, "B · THE FAR END IS FOLDED TOO")
    b.append(box(334, 52, 100, 48, "P", sub="collapsed", stroke=ACCENT2, tc=ACCENT2, fs=11))
    b.append(box(488, 52, 100, 48, "Q", sub="collapsed", stroke=ACCENT2, tc=ACCENT2, fs=11))
    b.append(arrow(434, 76, 484, 76, ACCENT))
    b.append(dot(434, 76, 4.5, ACCENT, stroke=FG, sw=1.1))
    b.append(dot(488, 76, 4.5, ACCENT, stroke=FG, sw=1.1))
    b.append(label(461, 118, "stored: p → q, both hidden. Resolve EACH end", DIM, 8.8, "middle"))
    b.append(label(461, 130, "independently — one walk per end", DIM, 8.8, "middle"))
    # (c) nesting ------------------------------------------------------------
    _mini_panel(b, 10, 150, 296, 132, "C · FOLD INSIDE A FOLD: OUTERMOST WINS")
    b.append(box(30, 174, 180, 84, "", fill=PANEL2, stroke=AMBER, rx=8, dash="4 3"))
    b.append(label(120, 188, "F — folded (outer)", AMBER, 9, "middle", "600"))
    b.append(box(52, 198, 120, 50, "", fill=PANEL, stroke=ACCENT2, rx=6, dash="4 3"))
    b.append(label(112, 212, "G — folded", ACCENT2, 8.8, "middle"))
    b.append(box(76, 222, 52, 20, "c", fs=9))
    b.append(arrow(240, 234, 240, 192, AMBER, marker="mA"))
    b.append(label(250, 218, "walk c→G→F,", DIM, 8.8, "start"))
    b.append(label(250, 230, "land on F", DIM, 8.8, "start"))
    b.append(label(158, 272, "the loop runs to the root — the OUTERMOST folded wins", DIM, 8.8, "middle"))
    # (d) declared port -------------------------------------------------------
    _mini_panel(b, 314, 150, 296, 132, "D · CROSSING ALREADY OWNS A PORT")
    b.append(box(334, 196, 60, 30, "A", fs=11))
    b.append(box(462, 184, 126, 66, "G", sub="collapsed", stroke=ACCENT2, tc=ACCENT2, fs=11))
    b.append(dot(462, 210, 5.5, OK, stroke=FG, sw=1.2))
    b.append(label(452, 200, "declared", OK, 8.2, "end"))
    b.append(arrow(394, 211, 455, 210, OK))
    b.append(label(461, 266, "the cable already ends on G's own port —", DIM, 8.8, "middle"))
    b.append(label(461, 278, "promotion is a NO-OP; only tunneling cables promote", DIM, 8.8, "middle"))
    # (e) wholly inside -------------------------------------------------------
    _mini_panel(b, 10, 294, 600, 118, "E · WHOLLY INSIDE: HIDE IT (your rule) — NOT maxGraph's self-loop")
    b.append(box(40, 328, 130, 62, "", fill=PANEL, stroke=ACCENT2, rx=8, dash="4 3"))
    b.append(label(105, 342, "G — folded", ACCENT2, 8.8, "middle"))
    b.append(box(56, 352, 40, 20, "p", fs=9))
    b.append(box(116, 352, 40, 20, "q", fs=9))
    b.append(arrow(96, 362, 112, 362, DIM2, 1.2, dash="2 3"))
    b.append(cross(105, 400, 6, WARN, 2))
    b.append(label(122, 404, "hidden — inside→inside cables vanish with the fold", DIM, 8.8, "start"))
    # maxGraph's alternative: self loop on the shell
    b.append(box(400, 330, 100, 46, "G", sub="collapsed", stroke=ACCENT2, tc=ACCENT2, fs=11))
    b.append(curve(500, 344, 556, 322, 500, 366, DIM2, 1.4))
    b.append(label(452, 398, "maxGraph: both ends resolve to G → a rendered", DIM, 8.8, "middle"))
    b.append(label(452, 410, "self-loop on the shell (CellState.isLoop compares them)", DIM, 8.8, "middle"))
    return svg(620, 424, "".join(b))


def fig43():
    """Zach's v1 vs the general resolver."""
    b = []
    # left column — covered
    b.append(box(10, 10, 292, 176, "", fill="#12301d", stroke=OK, rx=10, sw=1))
    b.append(label(156, 30, "YOUR V1 + ITS MIRROR COVERS", OK, 10, "middle", "700"))
    rows_ok = [
        "one level of fold — completely",
        "any number of crossing cables",
        "outbound → right header port (DAG rule)",
        "inbound → the port edge / left (the mirror)",
        "inside→inside → hidden (you ruled it)",
    ]
    for i, r in enumerate(rows_ok):
        b.append(dot(30, 51 + i * 26, 3.5, OK))
        b.append(label(42, 55 + i * 26, r, FG, 10, "start", mono=False))
    # right column — first breaks
    b.append(box(318, 10, 292, 176, "", fill="#3d1f1c", stroke=WARN, rx=10, sw=1))
    b.append(label(464, 30, "WHERE IT FIRST BREAKS", "#ff9a8f", 10, "middle", "700"))
    b.append(label(334, 54, "1. an edge between TWO folded regions:", FG, 10, "start", "600", mono=False))
    b.append(label(346, 68, "“is the far end an outside member's input?”", DIM, 9.2, "start"))
    b.append(label(346, 81, "asks about a port that is itself hidden —", DIM, 9.2, "start"))
    b.append(label(346, 94, "resolve the far end FIRST, then ask (case B)", DIM, 9.2, "start"))
    b.append(label(334, 118, "2. a fold inside a fold:", FG, 10, "start", "600", mono=False))
    b.append(label(346, 132, "needs outermost-wins on EVERY shape kind;", DIM, 9.2, "start"))
    b.append(label(346, 145, "today's resolver returns null for anything", DIM, 9.2, "start"))
    b.append(label(346, 158, "that is not a Branch — the verified-bug card", DIM, 9.2, "start"))
    # bottom strip — the whole thing, sized
    b.append(box(10, 198, 600, 68, "", fill="#122a3d", stroke=ACCENT2, rx=10, sw=1))
    b.append(label(310, 218, "the “whole thing” for YOUR design, sized honestly (~40 lines):", ACCENT2, 10, "middle", "700"))
    b.append(label(310, 238, "visibleEndpoint(end, side) = outermost folded ancestor →", FG, 9.6, "middle", "500", mono=True))
    b.append(label(310, 254, "its declared port if the crossing owns one, else the header port for that side", FG, 9.6, "middle", "500", mono=True))
    return svg(620, 276, "".join(b))


SEC_PROMOTION = [
    lead(
        "When a container collapses, every cable that crossed its boundary still has two real ends in the "
        "document — but one of them is no longer on screen. An <b>edge-promotion resolver</b> is the function that "
        "answers, per cable end: <i>“you cannot attach where you are attached — attach here instead.”</i> "
        "You already designed the answer for your cases: expanded→simple converges every port to one centred "
        "point, and a folded region lands its crossings on a port on the right side of the header, reusing the "
        "reserved header-port position (<code>functionPortCenterPx</code>, blockPort.layout.ts:456). "
        "<b>“Generalized”</b> is what the card was pointing at: the same function answering for every shape "
        "kind, at every nesting depth, for both ends of the cable at once. The three figures show what maxGraph "
        "actually built, the five concrete cases the general version must answer, and exactly where your v1 rule "
        "holds and first breaks."
    ),
    card(
        41,
        "What maxGraph built: promotion is a projection, not an edit",
        "maxGraph · Apache-2.0", "source", "partial", fig41(),
        "The edge's stored terminals never change. At render time <code>getVisibleTerminal</code> walks from the "
        "stored end up the parent chain — whenever the candidate is collapsed (or the current best invisible) the "
        "candidate becomes the rendered terminal — and the collapsed shape's <code>PerimeterFunction</code> then "
        "computes the landing point, aimed at the cable's other end. Collapse is therefore always reversible and "
        "always consistent: expand again and the cable simply re-resolves to the real port. SystemSketch already "
        "does exactly this projection for one shape kind — <code>branchFoldAttachPoint</code> is read inside "
        "<code>getBlockConnectionPortPagePoint</code>, never written into the document.",
        "maxgraph/packages/core/src/view/GraphView.ts:1656-1679 (the walk) · :1391-1444 (floating terminal → "
        "perimeter) · style/perimeter/RectanglePerimeter.ts:31 · clone @1559b37 · systemsketch "
        "src/branch/branchScope.ts:101-113 + src/blocks/connections/blockPorts.ts:367 @10748b8c",
        "your header-port ruling deletes the geometric half of this machinery. maxGraph needs perimeter functions "
        "because its collapsed shapes have no ports — a landing point must be computed from angles. You ruled the "
        "landing point IS a port. What remains to generalize is only the walk plus a port-picker.",
    ),
    card(
        42,
        "The five cases “generalized” actually means",
        "maxGraph + litegraph.js + systemsketch", "source", "open", fig42(),
        "<b>A</b> — N crossings must share one landing: maxGraph fans N separate perimeter points; your port model "
        "converges them on one dot, which Branch fold already does (every cable in a folded arm gets the SAME "
        "header-edge point). <b>B</b> — the far end may be folded too, so the resolver runs per end, against the "
        "other end's <i>visible proxy</i>. <b>C</b> — folds nest, and the outermost folded ancestor wins; maxGraph's "
        "walk just keeps climbing, and SystemSketch's <code>outermostFoldedLevel</code> is the same rule, Branch-only. "
        "<b>D</b> — a crossing that already ends on the container's own declared port needs no promotion at all; in "
        "litegraph this is the <i>only</i> legal crossing (the subgraph boundary is airtight), while your regions are "
        "deliberately transparent (“no tunnel”), so tunneling cables exist and are precisely the ones that "
        "promote. <b>E</b> — a cable wholly inside the fold: you ruled hide; SystemSketch hides; maxGraph instead "
        "renders a degenerate self-loop on the shell.",
        "maxgraph GraphView.ts:1656-1679 · CellState.ts:384 (isLoop) · systemsketch "
        "src/blocks/blockVisibility.ts:30-37 (drops wholly-inside cables) · "
        "src/blocks/connections/connectionScope.ts:161-175 (regions are transparent, “no tunnel”) · "
        "litegraph src/nodes/base.js:100-126 (every crossing routes through the manifest)",
        "cases A and E you have already ruled; C exists for Branch and needs to lose its Branch-only guard; B and D "
        "are the two genuinely new behaviours a general resolver adds.",
    ),
    card(
        43,
        "Your v1 against the general thing — it holds further than the card implied",
        "your feedback · 2026-09-18", "source", "open", fig43(),
        "The v1 rule (“connecting to an input port of an outside member → out the right side of the header; "
        "assumes functional DAG”) plus its inbound mirror is <i>complete</i> for a single-level fold of a DAG — "
        "that is most of your boards. It first breaks when both ends of a cable are folded (the rule inspects a port "
        "that is itself off screen) and second when folds nest (the resolver must be shape-agnostic and "
        "outermost-wins; today's returns <code>null</code> for anything but a Branch arm — the report's verified-bug "
        "card). Neither library built the whole: maxGraph shipped the walk + landing but has no ports to land on; "
        "litegraph has the ports but its collapse-to-subgraph rewiring is commented-out pseudocode ending in a TODO "
        "(<code>buildFromNodes</code> declares half a manifest and reconnects nothing).",
        "litegraph src/nodes/base.js:391-477 (the abandoned rewire; :470-477 is the pseudocode) · "
        "src/litegraph.js:13101-13119 (the menu item that calls it) · systemsketch src/branch/branchScope.ts:101 "
        "(returns null off-Branch) · your v1: PROJECT - Black Box UI.md, feedback item 1",
        "the card survives but shrinks. For your design — landing points are declared ports, inside→inside "
        "hides — the “whole thing nobody built” is one ~40-line pure function, not a subsystem: the per-end "
        "walk, then “declared port if the crossing owns one, else the header port for that side.”",
    ),
]


# ===========================================================================
# SECTION 2 — Card #6: ports are a manifest
# ===========================================================================

def fig61():
    b = []
    # LEFT — manifest model
    b.append(label(160, 20, "MANIFEST — the container OWNS a port table", OK, 10, "middle", "700"))
    b.append(box(24, 34, 272, 150, "", fill=PANEL, stroke=OK, rx=10, sw=1))
    b.append(label(160, 52, "G", ACCENT2, 11, "middle", "700", mono=True))
    # the table
    b.append(box(44, 64, 110, 22, "pose · vec3", fill="#12301d", stroke=OK, tc=FG, fs=9.5))
    b.append(box(44, 90, 110, 22, "gain · number", fill="#12301d", stroke=OK, tc=FG, fs=9.5))
    b.append(label(99, 126, "ports[] — the contract", OK, 9, "middle", "600"))
    # outer face dot mirrors row
    b.append(dot(24, 75, 5.5, OK, stroke=FG, sw=1.2))
    b.append(dot(24, 101, 5.5, OK, stroke=FG, sw=1.2))
    b.append(label(16, 78, "outer face", DIM2, 8.2, "end"))
    # inner taps
    b.append(box(196, 60, 84, 22, "tap “pose”", fs=8.8, mono=False))
    b.append(box(196, 110, 84, 22, "tap “pose”", fs=8.8, mono=False))
    b.append(arrow(194, 71, 158, 74, DIM2, 1.2))
    b.append(arrow(194, 120, 158, 78, DIM2, 1.2))
    b.append(label(238, 98, "N taps, one row", DIM2, 8.4, "middle"))
    b.append(label(160, 172, "children are placements — moving or deleting one never edits the contract", DIM, 8.6, "middle"))
    # divider
    b.append(f'<line x1="310" y1="14" x2="310" y2="196" stroke="{LINE}" stroke-width="1"/>')
    # RIGHT — derived model
    b.append(label(464, 20, "DERIVED — the face is computed from the children", AMBER, 10, "middle", "700"))
    b.append(box(328, 34, 272, 150, "", fill=PANEL, stroke=AMBER, rx=10, sw=1, dash="5 4"))
    b.append(box(360, 70, 64, 24, "child a", fs=9, mono=False))
    b.append(box(360, 120, 64, 24, "child b", fs=9, mono=False))
    b.append(curve(330, 82, 300, 82, 358, 82, DIM2, 1.2, marker=None))
    b.append(curve(330, 132, 300, 132, 358, 132, DIM2, 1.2, marker=None))
    b.append(dot(328, 82, 5, AMBER, stroke=FG, sw=1))
    b.append(dot(328, 132, 5, AMBER, stroke=FG, sw=1))
    b.append(label(500, 86, "face = f(whatever crosses", DIM, 9, "middle"))
    b.append(label(500, 99, "the boundary right now)", DIM, 9, "middle"))
    b.append(label(500, 124, "edit an inner wire →", WARN, 9, "middle"))
    b.append(label(500, 137, "the public interface changes", WARN, 9, "middle"))
    b.append(label(464, 172, "no bookkeeping, can never drift — and no identity to promise anyone", DIM, 8.6, "middle"))
    return svg(620, 208, "".join(b))


def fig62():
    b = []
    rows = [
        ("a public port can exist before any wire", True, False,
         "your API-first toggle needs this"),
        ("collapsed face is stable while children churn", True, False,
         "your #7: port view already shows the contract"),
        ("delete a child, cables stay on parent ports", True, False,
         "your unwire-helper ruling depends on it"),
        ("an isolated copy carries its interface with it", True, False,
         "your #3: regions are isolated"),
        ("zero bookkeeping · cannot drift from reality", False, True,
         "manifest answer: the wire-helper GESTURE writes the row"),
    ]
    b.append(label(238, 20, "MANIFEST", OK, 10, "middle", "700"))
    b.append(label(330, 20, "DERIVED", AMBER, 10, "middle", "700"))
    for i, (text, man, der, note) in enumerate(rows):
        y = 40 + i * 30
        b.append(label(16, y + 4, text, FG, 10, "start", "500", mono=False))
        if man:
            b.append(dot(238, y, 4, OK))
        else:
            b.append(cross(238, y, 4.5, WARN, 1.8))
        if der:
            b.append(dot(330, y, 4, OK))
        else:
            b.append(cross(330, y, 4.5, WARN, 1.8))
        b.append(label(372, y + 4, note, DIM2, 8.8, "start"))
    return svg(620, 196, "".join(b))


def fig63():
    b = []
    b.append(label(310, 18, "THE TRAP IN THE SHIPPED ONE — ROWS KEYED BY NAME", "#ff9a8f", 10, "middle", "700"))
    # before
    b.append(box(24, 36, 130, 24, 'inputs["pose"]', fill="#12301d", stroke=OK, fs=9.5))
    b.append(box(196, 30, 84, 20, "tap “pose”", fs=8.6, mono=False))
    b.append(box(196, 56, 84, 20, "tap “pose”", fs=8.6, mono=False))
    b.append(arrow(194, 40, 158, 46, DIM2, 1.1))
    b.append(arrow(194, 66, 158, 52, DIM2, 1.1))
    # rename event
    b.append(arrow(296, 48, 344, 48, ACCENT, 1.8))
    b.append(label(320, 38, "rename", ACCENT, 8.8, "middle", "600"))
    # after
    b.append(box(354, 36, 148, 24, 'inputs["pose_in"]', fill="#12301d", stroke=OK, fs=9.5))
    b.append(box(524, 22, 88, 20, "tap “pose_in”", fs=8.2, mono=False))
    b.append(arrow(522, 32, 504, 44, DIM2, 1.1))
    b.append(label(568, 56, "the initiator followed", DIM2, 8.2, "middle"))
    b.append(box(524, 74, 88, 20, "tap “pose”", fill="#3d1f1c", stroke=WARN, tc="#ff9a8f", fs=8.6, mono=False))
    b.append(cross(516, 84, 5, WARN, 2))
    b.append(label(562, 108, "orphaned — reads undefined,", "#ff9a8f", 8.4, "middle"))
    b.append(label(562, 120, "silently emits its default", "#ff9a8f", 8.4, "middle"))
    b.append(label(310, 146, "one declared port, N taps: a rename orphans N−1 of them. The fix is not “don't rename” —", DIM, 9.2, "middle"))
    b.append(label(310, 160, "it is keying the row by a stable portId and letting the display name change freely.", DIM, 9.2, "middle"))
    return svg(620, 176, "".join(b))


SEC_MANIFEST = [
    lead(
        "The card is one sentence about <b>where a container's port list lives</b>. Either the container owns a "
        "little table — <i>the manifest</i>: each row a port with an id, a name, a type — and everything else "
        "(the dots on the collapsed face, the taps inside, the wire-validity checks) just <i>reads</i> that table; "
        "or there is no table, and the container's interface is recomputed from whatever its children happen to "
        "expose. litegraph shipped the manifest model and it is worth seeing because it makes the idea concrete: "
        "<code>LGraph.addInput</code> writes a row, the collapsed node's slots mirror the rows through eight sync "
        "hooks, and any number of bridge nodes inside tap one row. Your Block is <i>already</i> a manifest "
        "(<code>getBlockConnectionPorts(props,…)</code> reads props, never children) — the card's real content "
        "is: <b>keep that invariant when containers grow children</b>, because the derived model is the tempting "
        "refactor that quietly breaks four things you have already ruled for."
    ),
    card(
        61,
        "The two places a container's ports could live",
        "litegraph.js · MIT", "source", "partial", fig61(),
        "Left is what litegraph shipped: <code>LGraph.inputs</code> is a table of "
        "<code>{name, type, value}</code> rows; the Subgraph node's outer slots mirror the table through sync hooks "
        "(row added → slot added, row renamed → slot renamed, …); inside, each <code>GraphInput</code> "
        "bridge holds a row name and reads that row at run time — N bridges can tap one row. The children are "
        "placements: rearranging or deleting them never touches the table. Right is the alternative the card warns "
        "about — no table, the face recomputed from crossings — which is exactly what litegraph's abandoned "
        "collapse-to-subgraph tried to do once at collapse time, and what maxGraph lives with permanently (no port "
        "objects at all; its collapsed face is wherever promoted edges hit the perimeter — see card 41).",
        "litegraph src/litegraph.js:1817-1836 (addInput writes the row) · src/nodes/base.js:36-43 + :206-260 "
        "(the sync hooks) · :623-633 (a tap reads its row) · :191-196 (computeSize: the collapsed face is "
        "sized purely by row count) · clone @0555a2f",
        "Block already lives in the left panel — src/components/blockPort.tsx renders from props, and systemsketch's "
        "getBlockConnectionPorts(props,…) resolves ports from the shape record. The card asks one thing: when "
        "Region gains members, its ports stay a <code>ports[]</code> prop keyed by portId — never a scan of the "
        "children.",
    ),
    card(
        62,
        "What each model buys — and which one your rulings already picked",
        "your feedback · 2026-09-18", "source", "landed", fig62(),
        "Every green check in the manifest column is something you have already ruled for, this week, in other "
        "words: a port that exists before any wire is your API-first toggle (“having it off is nice cause then "
        "you think in terms of public api first”); a stable collapsed face is your #7 (“we have this "
        "exactly already with port view”); cables surviving a deleted child is your unwire-helper; and an "
        "isolated Region copy carrying its own interface is your #3. The derived model's one genuine advantage — it "
        "cannot drift, because there is nothing to maintain — your wire-helper ruling gets back a different way: the "
        "gesture that wires a child to the boundary <i>writes the manifest row itself</i> (with the right datatype, "
        "placed where the wire crosses). Drift is authored away, not derived away.",
        "your rulings: PROJECT - Black Box UI.md, feedback items 3, 5, 6, 7 · the wire-helper list under item 5",
        "nothing new to build for this card — it is the invariant to protect. The one implementation note it adds "
        "is fig 63's: key the rows by id.",
    ),
    card(
        63,
        "The trap in the shipped one: rows keyed by display name",
        "litegraph.js · MIT", "source", "landed", fig63(),
        "litegraph keys the table by name. <code>renameInput</code> moves the row to a new key and notifies the "
        "outer slot and the tap that initiated the rename — but any <i>other</i> tap holding the old name now reads "
        "<code>inputs[“pose”]</code>, gets <code>undefined</code>, and silently emits its configured "
        "default instead. No error, no visual change: the graph just computes wrong. One declared port with N taps "
        "means a rename orphans N−1 of them.",
        "litegraph src/litegraph.js:1872-1896 (renameInput re-keys) · src/nodes/base.js:582-599 (only the "
        "initiating tap follows) · :623-633 (the orphan's silent default fallback)",
        "already the rule here — ports resolve by stable id (systemsketch getBlockConnectionPort(props, portId); "
        "this kit's port ids in port.layout.ts) with the label free to change. Keep it that way when the manifest "
        "grows an editing UI.",
    ),
]


# ===========================================================================
# SECTION 3 — Card #11: the parametric drag-handles
# ===========================================================================

def _cell(b, cx, cy, name, param):
    """Frame + caption for one gallery cell; cx,cy is the cell's top-left."""
    b.append(box(cx, cy, 144, 120, "", fill=PANEL, stroke=LINE, rx=8))
    b.append(label(cx + 72, cy + 96, name, FG, 8, "middle", "650", mono=True))
    b.append(label(cx + 72, cy + 109, param, DIM2, 8, "middle"))


def _handle(b, x, y):
    b.append(dot(x, y, 4.5, ACCENT, stroke=FG, sw=1.2))


def fig111():
    """The gallery: all 13 Control subclasses, drawn from source."""
    b = []
    P = PANEL2
    S = DIM2

    def cell_origin(i):
        col, row = i % 4, i // 4
        return 10 + col * 151, 8 + row * 128

    # 0 · RadiusControl
    x, y = cell_origin(0)
    _cell(b, x, y, "RadiusControl", "corner radius")
    b.append(f'<rect x="{x+34}" y="{y+22}" width="76" height="54" rx="14" fill="{P}" stroke="{S}" stroke-width="1.2"/>')
    b.append(f'<line x1="{x+34}" y1="{y+22}" x2="{x+34}" y2="{y+40}" stroke="{ACCENT}" stroke-width="1" stroke-dasharray="2 2"/>')
    _handle(b, x + 34, y + 40)
    # 1 · CylinderTiltControl
    x, y = cell_origin(1)
    _cell(b, x, y, "CylinderTiltControl", "ellipse tilt")
    b.append(f'<path d="M {x+40} {y+30} v 38 a 32 9 0 0 0 64 0 v -38" fill="{P}" stroke="{S}" stroke-width="1.2"/>')
    b.append(f'<ellipse cx="{x+72}" cy="{y+30}" rx="32" ry="9" fill="{P}" stroke="{S}" stroke-width="1.2"/>')
    _handle(b, x + 72, y + 39)
    # 2 · ParallelogramOffsetControl
    x, y = cell_origin(2)
    _cell(b, x, y, "ParallelogramOffsetControl", "side slant")
    b.append(f'<polygon points="{x+52},{y+26} {x+116},{y+26} {x+96},{y+74} {x+32},{y+74}" fill="{P}" stroke="{S}" stroke-width="1.2"/>')
    _handle(b, x + 45, y + 42)
    # 3 · HexagonOffsetControl
    x, y = cell_origin(3)
    _cell(b, x, y, "HexagonOffsetControl", "corner inset")
    b.append(f'<polygon points="{x+46},{y+24} {x+98},{y+24} {x+116},{y+50} {x+98},{y+76} {x+46},{y+76} {x+28},{y+50}" fill="{P}" stroke="{S}" stroke-width="1.2"/>')
    _handle(b, x + 46, y + 50)
    # 4 · StepOffsetControl
    x, y = cell_origin(4)
    _cell(b, x, y, "StepOffsetControl", "notch depth")
    b.append(f'<polygon points="{x+30},{y+26} {x+100},{y+26} {x+116},{y+50} {x+100},{y+74} {x+30},{y+74} {x+46},{y+50}" fill="{P}" stroke="{S}" stroke-width="1.2"/>')
    _handle(b, x + 46, y + 50)
    # 5 · TrapezoidOffsetControl
    x, y = cell_origin(5)
    _cell(b, x, y, "TrapezoidOffsetControl", "side slant")
    b.append(f'<polygon points="{x+52},{y+28} {x+92},{y+28} {x+114},{y+74} {x+30},{y+74}" fill="{P}" stroke="{S}" stroke-width="1.2"/>')
    _handle(b, x + 47, y + 40)
    # 6 · DocumentOffsetControl
    x, y = cell_origin(6)
    _cell(b, x, y, "DocumentOffsetControl", "wave depth")
    b.append(f'<path d="M {x+34} {y+24} h 76 v 42 q -19 14 -38 0 q -19 -14 -38 0 z" fill="{P}" stroke="{S}" stroke-width="1.2"/>')
    _handle(b, x + 72, y + 73)
    # 7 · PlusOffsetControl
    x, y = cell_origin(7)
    _cell(b, x, y, "PlusOffsetControl", "arm thickness")
    b.append(f'<polygon points="{x+62},{y+22} {x+82},{y+22} {x+82},{y+40} {x+100},{y+40} {x+100},{y+60} {x+82},{y+60} {x+82},{y+78} {x+62},{y+78} {x+62},{y+60} {x+44},{y+60} {x+44},{y+40} {x+62},{y+40}" fill="{P}" stroke="{S}" stroke-width="1.2"/>')
    _handle(b, x + 82, y + 40)
    # 8 · ArrowOffsetControl
    x, y = cell_origin(8)
    _cell(b, x, y, "ArrowOffsetControl", "head + thickness")
    b.append(f'<polygon points="{x+30},{y+40} {x+84},{y+40} {x+84},{y+26} {x+116},{y+50} {x+84},{y+74} {x+84},{y+60} {x+30},{y+60}" fill="{P}" stroke="{S}" stroke-width="1.2"/>')
    _handle(b, x + 84, y + 40)
    b.append(label(x + 72, y + 86, "one drag, two params", AMBER, 7.4, "middle"))
    # 9 · NoteOffsetControl
    x, y = cell_origin(9)
    _cell(b, x, y, "NoteOffsetControl", "corner fold")
    b.append(f'<path d="M {x+36} {y+24} h 56 l 18 18 v 34 h -74 z" fill="{P}" stroke="{S}" stroke-width="1.2"/>')
    b.append(f'<path d="M {x+92} {y+24} v 18 h 18" fill="none" stroke="{S}" stroke-width="1.2"/>')
    _handle(b, x + 92, y + 42)
    # 10 · CardOffsetControl
    x, y = cell_origin(10)
    _cell(b, x, y, "CardOffsetControl", "corner cut")
    b.append(f'<path d="M {x+36} {y+24} h 56 l 18 14 v 38 h -74 z" fill="{P}" stroke="{S}" stroke-width="1.2"/>')
    _handle(b, x + 92, y + 24)
    # 11 · CubeCornerTool
    x, y = cell_origin(11)
    _cell(b, x, y, "CubeCornerTool", "depth corner x+y")
    b.append(f'<polygon points="{x+38},{y+38} {x+92},{y+38} {x+92},{y+78} {x+38},{y+78}" fill="{P}" stroke="{S}" stroke-width="1.2"/>')
    b.append(f'<polygon points="{x+38},{y+38} {x+56},{y+24} {x+110},{y+24} {x+92},{y+38}" fill="{P}" stroke="{S}" stroke-width="1.2"/>')
    b.append(f'<polygon points="{x+92},{y+38} {x+110},{y+24} {x+110},{y+64} {x+92},{y+78}" fill="{P}" stroke="{S}" stroke-width="1.2"/>')
    _handle(b, x + 110, y + 24)
    # 12 · TableDividerTool — centered on the last row
    x, y = cell_origin(12)
    _cell(b, x, y, "TableDividerTool", "both dividers, one handle")
    b.append(f'<rect x="{x+34}" y="{y+24}" width="76" height="52" fill="{P}" stroke="{S}" stroke-width="1.2"/>')
    b.append(f'<line x1="{x+56}" y1="{y+24}" x2="{x+56}" y2="{y+76}" stroke="{S}" stroke-width="1.1"/>')
    b.append(f'<line x1="{x+34}" y1="{y+42}" x2="{x+110}" y2="{y+42}" stroke="{S}" stroke-width="1.1"/>')
    _handle(b, x + 56, y + 42)
    return svg(620, 528, "".join(b))


def fig112():
    b = []
    # base class panel
    b.append(box(10, 10, 350, 208, "", fill=PANEL, stroke=ACCENT2, rx=10, sw=1))
    b.append(label(185, 30, "Control — THE SHARED BASE (joint-core)", ACCENT2, 10, "middle", "700"))
    steps = [
        ("pointerdown", "capture · startBatch(“control-move”)"),
        ("pointermove", "client → local → relative → setPosition()"),
        ("pointerup", "release · stopBatch — drag = ONE undo step"),
        ("dblclick", "resetPosition() — reset comes for free"),
        ("chrome", "dot + dashed extras, shown only mid-drag"),
    ]
    for i, (evt, what) in enumerate(steps):
        y = 52 + i * 32
        b.append(box(28, y - 13, 92, 22, evt, fill=PANEL2, stroke=LINE, tc=AMBER, fs=9))
        b.append(label(132, y + 2, what, DIM, 9, "start"))
    # subclass panel
    b.append(box(376, 10, 234, 208, "", fill="#12301d", stroke=OK, rx=10, sw=1))
    b.append(label(493, 30, "A CONCRETE TOOL — 3 PURE METHODS", OK, 9.5, "middle", "700"))
    b.append(label(392, 58, "getPosition(view)", FG, 10, "start", "600", mono=True))
    b.append(label(404, 72, "model → where the handle sits", DIM, 8.8, "start"))
    b.append(label(392, 98, "setPosition(view, point)", FG, 10, "start", "600", mono=True))
    b.append(label(404, 112, "dragged point → clamped model write", DIM, 8.8, "start"))
    b.append(label(392, 138, "resetPosition(view)", FG, 10, "start", "600", mono=True))
    b.append(label(404, 152, "double-click → the default value", DIM, 8.8, "start"))
    b.append(label(493, 186, "13 tools average ~45 lines each", AMBER, 9.5, "middle", "600"))
    b.append(label(493, 200, "because the base absorbs everything else", DIM2, 8.6, "middle"))
    return svg(620, 230, "".join(b))


def fig113():
    b = []
    # left: what the donor actually is
    b.append(label(160, 20, "THE DONOR AS SHIPPED — A 2×2 TABLE", DIM2, 10, "middle", "700"))
    b.append(f'<rect x="60" y="36" width="200" height="120" fill="{PANEL2}" stroke="{DIM2}" stroke-width="1.3"/>')
    b.append(f'<line x1="118" y1="36" x2="118" y2="156" stroke="{DIM2}" stroke-width="1.1"/>')
    b.append(f'<line x1="60" y1="80" x2="260" y2="80" stroke="{DIM2}" stroke-width="1.1"/>')
    b.append(dot(118, 80, 5.5, ACCENT, stroke=FG, sw=1.2))
    b.append(label(160, 178, "ONE handle at (dividerX, dividerY) — the pair", DIM, 9, "middle"))
    b.append(label(160, 191, "moves together, clamped to [0,w] × [0,h]", DIM, 9, "middle"))
    b.append(f'<line x1="310" y1="14" x2="310" y2="200" stroke="{LINE}" stroke-width="1"/>')
    # right: what an N×M grid needs
    b.append(label(465, 20, "WHAT AN N×M GRID WOULD NEED", DIM2, 10, "middle", "700"))
    b.append(f'<rect x="360" y="36" width="210" height="120" fill="{PANEL2}" stroke="{DIM2}" stroke-width="1.3"/>')
    for fx in (0.28, 0.55, 0.8):
        xx = 360 + 210 * fx
        b.append(f'<line x1="{xx:.0f}" y1="36" x2="{xx:.0f}" y2="156" stroke="{DIM2}" stroke-width="1"/>')
        b.append(dot(xx, 36, 4, ACCENT, stroke=FG, sw=1))
    for fy in (0.4, 0.72):
        yy = 36 + 120 * fy
        b.append(f'<line x1="360" y1="{yy:.0f}" x2="570" y2="{yy:.0f}" stroke="{DIM2}" stroke-width="1"/>')
        b.append(dot(360, yy, 4, ACCENT, stroke=FG, sw=1))
    b.append(label(465, 178, "N+M independent handles — one ~20-line Control", DIM, 9, "middle"))
    b.append(label(465, 191, "subclass per divider; the donor shows the pattern, not the code", DIM, 9, "middle"))
    return svg(620, 206, "".join(b))


def fig114():
    b = []
    rows = [
        ("getPosition — model → point, pure",
         "trace.handles.ts:50 traceHandles() — pure, unit-tested", OK),
        ("setPosition — point → clamped write",
         "inline in traceEditor.tsx pointer-move (grow / collapse) — fused", AMBER),
        ("shared lifecycle: capture · batch · convert",
         "hand-rolled per editor (traceEditor.tsx:380-384) — no shared base", WARN),
        ("resetPosition on double-click",
         "nothing — no reset gesture anywhere yet", WARN),
        ("who owns the press",
         "dragPolicy.ts “owns-pointer” (:76) — ours, on both engines", OK),
        ("hit chrome + reveal policy",
         "hitRegion.ts + hitRegions/hitPolicy.ts — ours, already shared", OK),
    ]
    b.append(label(118, 20, "JOINTJS Control CONTRACT", ACCENT2, 9.5, "middle", "700"))
    b.append(label(430, 20, "THIS REPO TODAY", ACCENT, 9.5, "middle", "700"))
    for i, (theirs, ours, colr) in enumerate(rows):
        y = 44 + i * 34
        b.append(box(12, y - 14, 216, 26, "", fill=PANEL, stroke=LINE, rx=6))
        b.append(label(20, y + 3, theirs, FG, 8.8, "start", "500", mono=False))
        b.append(arrow(232, y - 1, 252, y - 1, DIM2, 1.2))
        b.append(box(256, y - 14, 352, 26, "", fill=PANEL, stroke=colr, rx=6, sw=1))
        b.append(label(264, y + 3, ours, FG, 8.6, "start", "500", mono=True))
    return svg(620, 258, "".join(b))


SEC_HANDLES = [
    lead(
        "The real thing behind the card is <code>@joint/shapes-general-tools</code>: a package of small classes "
        "that each turn <b>one property of a shape into a point you can grab</b>. Drag the point, the property "
        "changes, clamped to what is legal; double-click it, the property resets. “Parametric drag-handle” "
        "means exactly that — the handle does not move or resize the shape, it drives one named parameter "
        "(a corner radius, a slant, a fold, a divider). All of them subclass one base, <code>Control</code>, whose "
        "whole contract is three pure methods; the base owns the pointer lifecycle, the coordinate conversion, the "
        "undo batching and the reset gesture. Two corrections to the card now that the source is open on disk: the "
        "count is <b>13, not 14</b>, and the “ready-made donor” reading did not survive contact — figure "
        "113 shows why. What DID survive is better than a donor: this repo already split its one existing handle "
        "editor exactly where JointJS split theirs."
    ),
    card(
        111,
        "The gallery — all 13, drawn from their getPosition/setPosition pairs",
        "@joint/shapes-general-tools · MPL-2.0, read not copied", "source", "open", fig111(),
        "Each cell is one exported class, drawn from what its <code>getPosition</code>/<code>setPosition</code> "
        "pair actually reads and writes — the orange dot is the handle, sitting where the class computes it. "
        "Ten drive a single offset with a clamp (<code>Math.max(0, Math.min(coord, limit))</code> is the entire "
        "“algorithm” of most); ArrowOffsetControl drives two parameters from one drag (head length from x, "
        "shaft thickness from y); CubeCornerTool drives the two depth coordinates with an optional locked-angle "
        "mode; TableDividerTool moves a divider pair. The load-bearing observation: none of these is clever — they "
        "are cheap BECAUSE the base class exists.",
        "jointjs/packages/joint-shapes-general-tools/src/*.ts — 13 files, 13 `export class … extends "
        "elementTools.Control` (verified by grep; the original card said 14) · clone @881e49d",
        "this is what “a library of parametric handles” looks like when the contract is right: a new "
        "handle is ~45 lines, of which ~6 matter.",
    ),
    card(
        112,
        "The contract that makes them cheap: 3 pure methods over a shared lifecycle",
        "joint-core cellTools/Control.mjs · MPL-2.0", "source", "partial", fig112(),
        "The base owns everything stateful: pointer capture, client→local→shape-relative conversion, "
        "showing the drag chrome, and — the part worth stealing — wrapping the whole drag in "
        "<code>startBatch(“control-move”)…stopBatch</code> so any parametric drag is exactly one undo "
        "step, stamped with the tool's id. A concrete tool overrides three pure methods and nothing else: where the "
        "handle sits (a projection of the model), what a dragged point writes back (with the clamp), and what "
        "double-click restores. That is the whole API.",
        "jointjs/packages/joint-core/src/cellTools/Control.mjs:49-56 (the three stubs) · :142-168 "
        "(lifecycle + batch) · :170-173 (dblclick reset) · TableDividerTool.ts:27-47 (a complete tool)",
        "MPL-2.0 means the code never travels — the CONTRACT is what's portable, re-expressed in this repo's own "
        "props-in/DOM-out terms. And half of it already is: see fig 114.",
    ),
    card(
        113,
        "The “ready-made donor” claim, checked — weaker than the card implied",
        "TableDividerTool + Table · read on disk", "source", "open", fig113(),
        "The card called TableDividerTool “a direct donor for dragging a Grid primitive's row/column "
        "dividers.” On disk it is 51 lines driving a 2×2 Table whose model has exactly one "
        "<code>dividerX</code> and one <code>dividerY</code> — a single corner handle moves both at once. An "
        "N×M grid needs N+M independent handles, which the donor does not contain; and there is no Grid "
        "primitive in this trunk to donate to anyway (grep: the only “grid” in "
        "<code>src/components/</code> is bar.tsx's CSS <code>gridTemplateColumns</code>). Being MPL-2.0, the 51 "
        "lines could not be copied even if they fit.",
        "jointjs/packages/joint-shapes-general-tools/src/TableDividerTool.ts:27-47 · "
        "joint-shapes-general/src/table/table.ts:6-46 (the single divider pair) · grep -rn grid "
        "apps/storybook-basics/src/components/ → bar.tsx only",
        "downgrade the donor, keep the demonstration: the per-divider version is a ~20-line Control subclass, and "
        "writing N of them is exactly what the 13-tool gallery proves is cheap once the base exists.",
    ),
    card(
        114,
        "Beside our own editor — we already split where JointJS split",
        "this repo · apps/storybook-basics", "source", "partial", fig114(),
        "The genuinely useful comparison: <code>trace.handles.ts</code> is a pure model→handles projection, "
        "unit-tested with no DOM — that is <code>getPosition</code>, discovered independently. "
        "<code>traceEditor.tsx</code> fuses the other two roles: the setPosition writes (bend drag, virtual-handle "
        "grow, collapse-below-threshold) and the entire hand-rolled lifecycle (window pointer listeners, capture, "
        "thresholds). What this repo does NOT have is the shared base — the next parametric handle (a Bar/band "
        "divider, a Region resize affordance, a port-spread control) would re-write that lifecycle from scratch — "
        "and no reset-to-default gesture exists anywhere. Undo batching, unlike JointJS's, is host-owned here by "
        "design: the dragPolicy “owns-pointer” seam is where a host decides what a drag commits.",
        "apps/storybook-basics/src/components/trace.handles.ts:50 · traceEditor.tsx:287-384 · "
        "src/interaction/dragPolicy.ts:76 · src/hitRegions/hitPolicy.ts",
        "no action owed now. The day a SECOND handle kind ships, extract the base (lifecycle + reset + one-undo-step "
        "batching hook) and let both editors subclass it — that is the card's lasting value, and it is a pattern "
        "confirmation, not a donor.",
    ),
]


# ---------------------------------------------------------------------------
# Write the three fragments
# ---------------------------------------------------------------------------
def main() -> None:
    FRAG_DIR.mkdir(parents=True, exist_ok=True)
    buckets = [
        ("prior-art-explained-promotion.html", STYLE + LEAD_STYLE, SEC_PROMOTION),
        ("prior-art-explained-manifest.html", "", SEC_MANIFEST),
        ("prior-art-explained-handles.html", "", SEC_HANDLES),
    ]
    for name, prefix, parts in buckets:
        path = FRAG_DIR / name
        path.write_text(prefix + "\n".join(parts))
        print(f"wrote {path} ({path.stat().st_size:,} bytes, {len(parts)} blocks)")


if __name__ == "__main__":
    main()
