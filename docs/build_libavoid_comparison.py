#!/usr/bin/env python3
"""Builds the libavoid vs Tidy-edges algorithm comparison report (2026-09-17).

Zach's ask (PROJECT - Black Box UI.md ~line 1951): read libavoid properly —
"it seems we have been AVOIDING reading lib avoid because its LGPL … Can you
please start a fable agent to read through libavoid, and compare it to our
current implementation of tidy, and see what algorithms we can reference in
it?" — plus evaluate https://github.com/Aksem/libavoid-js as a dependency.

Everything in this report was read from primary sources on 2026-09-17:
  * libavoid C++ (adaptagrams/cola/libavoid, 27,288 lines) — read for
    ALGORITHMS ONLY.  No libavoid code is reproduced here or anywhere in our
    tree; identifiers are quoted at most one symbol at a time, and every
    algorithmic claim cites the paper that describes it plus the file:line
    where it lives so a future reader can go look.
  * The four Adaptagrams papers (GD'05, GD'09, Diagrams'12, Diagrams'14).
  * Our router: /home/bam/systemsketch/src/blocks/elbow + connections.
  * libavoid-js v0.4.5 (typings, webidl_definitions, dist payloads measured
    with gzip; runtime measured with the bench.mjs harness reproduced in the
    appendix, Node 22.18 on the Ryzen 9 7900X).

The SVG diagrams are COMPUTED by this script, not drawn by hand: the
orthogonal-visibility-graph panel implements the GD'09 §3 definition
(interesting points + clipped visibility segments + intersections); the
"our A*" panel implements our own elbowRouter's grid recipe (midline
keep-outs, dongle clamp, collapsed rails, full lattice); the nudge panel uses
the real measured route coordinates recorded in nudge.ts's header comment and
our real spreading maths; the hyperedge panel computes Manhattan wire totals.

Writes /home/bam/bbox-ui/reports/libavoid-vs-tidy-2026-09-17.html (text +
inline SVG only, no rasters — well under the tracked-reports 256 KB line).
"""
from __future__ import annotations

import html
import pathlib

OUT = pathlib.Path("/home/bam/bbox-ui/reports/libavoid-vs-tidy-2026-09-17.html")

# =========================================================================
# Diagram 1a — the orthogonal visibility graph, per Wybrow GD'09 §3.
# =========================================================================

RECTS = [  # (x, y, w, h)
    (40, 70, 110, 70),    # A
    (250, 40, 100, 60),   # B
    (200, 190, 110, 60),  # C
    (430, 120, 100, 80),  # D
]
PORTS = [(150, 105), (430, 160)]  # right-centre of A, left-centre of D
CW, CH = 560, 300


def h_extent(px: float, py: float) -> tuple[float, float]:
    lo, hi = 0.0, float(CW)
    for (rx, ry, rw, rh) in RECTS:
        if ry < py < ry + rh:
            if rx + rw <= px:
                lo = max(lo, rx + rw)
            elif rx >= px:
                hi = min(hi, rx)
            elif px == rx:            # on the left edge: only leftward
                hi = min(hi, rx)
            elif px == rx + rw:       # on the right edge: only rightward
                lo = max(lo, rx + rw)
    return lo, hi


def v_extent(px: float, py: float) -> tuple[float, float]:
    lo, hi = 0.0, float(CH)
    for (rx, ry, rw, rh) in RECTS:
        if rx < px < rx + rw:
            if ry + rh <= py:
                lo = max(lo, ry + rh)
            elif ry >= py:
                hi = min(hi, ry)
            elif py == ry:
                hi = min(hi, ry)
            elif py == ry + rh:
                lo = max(lo, ry + rh)
    return lo, hi


def interesting_points() -> list[tuple[float, float]]:
    pts = list(PORTS)
    for (rx, ry, rw, rh) in RECTS:
        pts += [(rx, ry), (rx + rw, ry), (rx, ry + rh), (rx + rw, ry + rh)]
    return pts


def merged(segs: list[tuple[float, float, float]]) -> list[tuple[float, float, float]]:
    """Merge collinear overlapping (pos, lo, hi) segments."""
    by_pos: dict[float, list[tuple[float, float]]] = {}
    for pos, lo, hi in segs:
        by_pos.setdefault(pos, []).append((lo, hi))
    out = []
    for pos, spans in by_pos.items():
        spans.sort()
        cur_lo, cur_hi = spans[0]
        for lo, hi in spans[1:]:
            if lo <= cur_hi:
                cur_hi = max(cur_hi, hi)
            else:
                out.append((pos, cur_lo, cur_hi))
                cur_lo, cur_hi = lo, hi
        out.append((pos, cur_lo, cur_hi))
    return out


def build_ovg():
    hsegs, vsegs = [], []
    for (px, py) in interesting_points():
        lo, hi = h_extent(px, py)
        if hi - lo > 1e-9:
            hsegs.append((py, lo, hi))
        lo, hi = v_extent(px, py)
        if hi - lo > 1e-9:
            vsegs.append((px, lo, hi))
    hsegs, vsegs = merged(hsegs), merged(vsegs)
    nodes = set()
    for (y, x0, x1) in hsegs:
        for (x, y0, y1) in vsegs:
            if x0 - 1e-9 <= x <= x1 + 1e-9 and y0 - 1e-9 <= y <= y1 + 1e-9:
                nodes.add((round(x, 3), round(y, 3)))
    edges = 0
    for (y, x0, x1) in hsegs:
        row = sorted(x for (x, yy) in nodes if yy == round(y, 3) and x0 - 1e-9 <= x <= x1 + 1e-9)
        edges += max(0, len(row) - 1)
    for (x, y0, y1) in vsegs:
        col = sorted(yy for (xx, yy) in nodes if xx == round(x, 3) and y0 - 1e-9 <= yy <= y1 + 1e-9)
        edges += max(0, len(col) - 1)
    return hsegs, vsegs, sorted(nodes), edges


# =========================================================================
# Diagram 1b — the same scene as OUR router sees it for the one cable
# port(A,right) -> port(D,left).  Reimplements the recipe of our own
# MIT-derived elbowRouter.ts (dynamic keep-outs to the midline, dongle
# clamped before obstacles, candidate rails collapsed, full lattice).
# =========================================================================

PAD = 24
SNAP = 0.5


def bounds(r):  # (x,y,w,h) -> [x0,y0,x1,y1]
    return [r[0], r[1], r[0] + r[2], r[1] + r[3]]


def build_our_grid():
    a, d = bounds(RECTS[0]), bounds(RECTS[3])
    b_inf = [v + s * PAD for v, s in zip(bounds(RECTS[1]), (-1, -1, 1, 1))]
    c_inf = [v + s * PAD for v, s in zip(bounds(RECTS[2]), (-1, -1, 1, 1))]
    common = [min(a[0], d[0]), min(a[1], d[1]), max(a[2], d[2]), max(a[3], d[3])]
    mid_x = (a[2] + d[0]) / 2  # gap midline between the two endpoint boxes

    # keep-outs: grow by PAD away from the partner, to the midline toward it
    start_ko = [common[0] - PAD, common[1] - PAD, mid_x, a[3] + PAD]
    end_ko = [mid_x, common[1] - PAD, common[2] + PAD, d[3] + PAD]

    # dongles on the keep-out walls at port height, clamped before obstacles
    start_dongle = [start_ko[2], PORTS[0][1]]
    for ob in (b_inf, c_inf):
        if ob[1] < start_dongle[1] < ob[3] and PORTS[0][0] < ob[0] < start_dongle[0]:
            start_dongle[0] = ob[0]
    end_dongle = [end_ko[0], PORTS[1][1]]
    for ob in (b_inf, c_inf):
        if ob[1] < end_dongle[1] < ob[3] and end_dongle[0] < ob[2] < PORTS[1][0]:
            end_dongle[0] = ob[2]

    keepouts = [start_ko, end_ko, b_inf, c_inf]
    outer = [min(k[0] for k in keepouts + [common]) - PAD,
             min(k[1] for k in keepouts + [common]) - PAD,
             max(k[2] for k in keepouts + [common]) + PAD,
             max(k[3] for k in keepouts + [common]) + PAD]

    xs = [start_dongle[0], end_dongle[0], (a[2] + d[0]) / 2, (a[0] + d[2]) / 2]
    ys = [start_dongle[1], end_dongle[1], (a[3] + d[1]) / 2, (a[1] + d[3]) / 2]
    for k in keepouts:
        xs += [k[0], k[2]]
        ys += [k[1], k[3]]
    xs += [outer[0], outer[2]]
    ys += [outer[1], outer[3]]

    def collapse(vals, pinned):
        keep = []
        for v in sorted(vals):
            if not keep or abs(v - keep[-1]) > SNAP:
                keep.append(v)
            elif any(abs(v - p) < 1e-9 for p in pinned):
                keep[-1] = v
        return keep

    cols = collapse(xs, [start_dongle[0], end_dongle[0]])
    rows = collapse(ys, [start_dongle[1], end_dongle[1]])
    return cols, rows, keepouts, (start_dongle, end_dongle), (b_inf, c_inf), outer


# =========================================================================
# Diagram 2 — channel nudging, using the REAL measured routes recorded in
# nudge.ts's header (two parallel cables between the same block pair, both
# verticals landing on the deterministic midline x=460).
# =========================================================================

NUDGE_BEFORE = [
    [(320, 150), (460, 150), (460, 0), (600, 0)],
    [(320, 185), (460, 185), (460, 35), (600, 35)],
]
NUDGE_SPACING = 14


def nudged_routes():
    centre = 460.0
    first = -((len(NUDGE_BEFORE) - 1) / 2) * NUDGE_SPACING
    # The constraint pass (orderBundle, worked by hand in the report text)
    # puts cable 0 on the lower-x side; ranks are [cable0, cable1].
    out = []
    for rank, route in enumerate(NUDGE_BEFORE):
        target = centre + first + rank * NUDGE_SPACING
        pts = [list(p) for p in route]
        pts[1][0] = target
        pts[2][0] = target
        out.append([tuple(p) for p in pts])
    return out


# =========================================================================
# Diagram 3 — hyperedge: one output fanning to three inputs.
# =========================================================================

HYP_S = (40, 150)
HYP_SINKS = [(420, 60), (420, 150), (420, 260)]
HYP_OBST = (200, 60, 80, 60)
HYP_OB_INF = (176, 36, 128, 108)  # inflated by 24


def manhattan_len(route):
    return sum(abs(route[i + 1][0] - route[i][0]) + abs(route[i + 1][1] - route[i][1])
               for i in range(len(route) - 1))


HYP_INDEP = [
    [(40, 150), (304, 150), (304, 60), (420, 60)],   # dodges the inflated box
    [(40, 150), (420, 150)],
    [(40, 150), (230, 150), (230, 260), (420, 260)],
]
HYP_TREE_TRUNK = [(40, 150), (304, 150)]
HYP_TREE_BRANCHES = [
    [(304, 150), (304, 60), (420, 60)],
    [(304, 150), (420, 150)],
    [(304, 150), (304, 260), (420, 260)],
]


# =========================================================================
# SVG rendering helpers
# =========================================================================

INK = "#233043"
FAINT = "#9fb0c4"
ACCENT = "#0b69c7"
ACCENT2 = "#c7410b"
GOOD = "#0c7a43"
NODE = "#5f7391"
BLOCK_FILL = "#e7ecf3"
BLOCK_EDGE = "#8194ab"


def svg_rect(r, fill=BLOCK_FILL, stroke=BLOCK_EDGE, dash="", opacity="1", rx=3):
    x, y, w, h = r
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" '
            f'fill="{fill}" stroke="{stroke}" stroke-width="1.2"{d} opacity="{opacity}"/>')


def svg_line(x1, y1, x2, y2, stroke=FAINT, width=0.8, dash="", opacity="1"):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return (f'<line x1="{x1:g}" y1="{y1:g}" x2="{x2:g}" y2="{y2:g}" '
            f'stroke="{stroke}" stroke-width="{width}"{d} opacity="{opacity}"/>')


def svg_dot(x, y, r=2.0, fill=INK, stroke="none"):
    return f'<circle cx="{x:g}" cy="{y:g}" r="{r}" fill="{fill}" stroke="{stroke}"/>'


def svg_path(points, stroke=ACCENT, width=2.2, dash="", opacity="1"):
    d = "M " + " L ".join(f"{x:g} {y:g}" for x, y in points)
    dd = f' stroke-dasharray="{dash}"' if dash else ""
    return (f'<path d="{d}" fill="none" stroke="{stroke}" stroke-width="{width}" '
            f'stroke-linejoin="round" stroke-linecap="round"{dd} opacity="{opacity}"/>')


def svg_text(x, y, s, size=11, fill="#5a6b80", anchor="start", weight="normal"):
    return (f'<text x="{x:g}" y="{y:g}" font-size="{size}" fill="{fill}" '
            f'text-anchor="{anchor}" font-weight="{weight}" '
            f'font-family="ui-sans-serif, system-ui, sans-serif">{html.escape(s)}</text>')


def wrap_svg(body, w, h, title, x0=0.0, y0=0.0):
    return (f'<svg viewBox="{x0:g} {y0:g} {w:g} {h:g}" role="img" '
            f'aria-label="{html.escape(title)}" '
            f'style="width:100%;height:auto;background:#fbfcfe;border:1px solid #e3e9f1;'
            f'border-radius:8px">{body}</svg>')


def render_ovg_panel():
    hsegs, vsegs, nodes, edges = build_ovg()
    parts = []
    for (y, x0, x1) in hsegs:
        parts.append(svg_line(x0, y, x1, y))
    for (x, y0, y1) in vsegs:
        parts.append(svg_line(x, y0, x, y1))
    for i, r in enumerate(RECTS):
        parts.append(svg_rect(r))
        parts.append(svg_text(r[0] + r[2] / 2, r[1] + r[3] / 2 + 4, "ABCD"[i],
                              size=13, fill="#5a6b80", anchor="middle", weight="600"))
    for (x, y) in nodes:
        parts.append(svg_dot(x, y, 1.7, INK))
    for (x, y) in PORTS:
        parts.append(svg_dot(x, y, 4, ACCENT))
    parts.append(svg_text(8, CH - 8,
                          f"{len(nodes)} nodes · {edges} edges · shared by every connector",
                          size=11.5, fill="#40506a", weight="600"))
    return wrap_svg("".join(parts), CW, CH, "Orthogonal visibility graph"), len(nodes), edges


def render_our_grid_panel():
    cols, rows, keepouts, dongles, obst_inf, outer = build_our_grid()
    parts = []
    for x in cols:
        parts.append(svg_line(x, min(rows), x, max(rows), opacity="0.55"))
    for y in rows:
        parts.append(svg_line(min(cols), y, max(cols), y, opacity="0.55"))
    for ob in obst_inf:
        parts.append(svg_rect((ob[0], ob[1], ob[2] - ob[0], ob[3] - ob[1]),
                              fill="#fdeee7", stroke="#e0b39e", dash="4 3", rx=4))
    for ko in keepouts[:2]:
        parts.append(svg_rect((ko[0], ko[1], ko[2] - ko[0], ko[3] - ko[1]),
                              fill="none", stroke="#b5c4d8", dash="6 4", rx=4))
    for i, r in enumerate(RECTS):
        parts.append(svg_rect(r))
        parts.append(svg_text(r[0] + r[2] / 2, r[1] + r[3] / 2 + 4, "ABCD"[i],
                              size=13, fill="#5a6b80", anchor="middle", weight="600"))
    for x in cols:
        for y in rows:
            parts.append(svg_dot(x, y, 1.6, NODE))
    for (x, y) in dongles:
        parts.append(svg_dot(x, y, 4.2, "none", ACCENT2))
        parts.append(svg_dot(x, y, 2.2, ACCENT2))
    for (x, y) in PORTS:
        parts.append(svg_dot(x, y, 4, ACCENT))
    x0 = min(min(cols), outer[0]) - 10
    y0 = min(min(rows), outer[1]) - 10
    x1 = max(max(cols), outer[2]) + 10
    y1 = max(max(rows), outer[3]) + 24
    parts.append(svg_text(x0 + 8, y1 - 8,
                          f"{len(cols)}×{len(rows)} = {len(cols) * len(rows)} lattice nodes "
                          f"· built for THIS cable only, then discarded",
                          size=11.5, fill="#40506a", weight="600"))
    return (wrap_svg("".join(parts), x1 - x0, y1 - y0, "Our per-edge A* lattice", x0, y0),
            len(cols), len(rows))


def render_nudge_panels():
    after = nudged_routes()
    OFF = 40  # routes shifted down so the y=0 rail is visible
    left_block = (240, 150 + OFF - 30, 80, 90)
    right_block = (600, 0 + OFF - 30, 80, 90)

    def panel(routes, caption, highlight_overlap, show_gap):
        parts = [svg_rect(left_block), svg_rect(right_block)]
        if highlight_overlap:
            parts.append('<rect x="455" y="75" width="10" height="115" fill="#c7410b22"/>')
            parts.append(svg_text(472, 135, "115 px drawn as one line", size=11, fill=ACCENT2))
        for i, r in enumerate(routes):
            parts.append(svg_path([(x, y + OFF) for (x, y) in r],
                                  stroke=ACCENT if i == 0 else GOOD))
        if show_gap:
            x0 = after[0][1][0]
            x1 = after[1][1][0]
            parts.append(svg_line(x0, 245, x1, 245, stroke="#40506a", width=1))
            parts.append(svg_text((x0 + x1) / 2, 259, f"gap {x1 - x0:g} px", size=11,
                                  fill="#40506a", anchor="middle"))
        parts.append(svg_text(8, 20, caption, size=11.5, fill="#40506a", weight="600"))
        return wrap_svg("".join(parts), 700, 270, caption)

    before = panel(NUDGE_BEFORE,
                   "before — both verticals on the deterministic midline x=460", True, False)
    after_p = panel(after,
                    "after nudgeRoutes — constraint order, then centre ± spacing/2", False, True)
    return before, after_p


def render_hyperedge_panels():
    indep_len = sum(manhattan_len(r) for r in HYP_INDEP)
    tree_len = manhattan_len(HYP_TREE_TRUNK) + sum(manhattan_len(b) for b in HYP_TREE_BRANCHES)

    def blockrects(parts):
        parts.append(svg_rect((0, 120, 40, 60)))
        for (sx, sy) in HYP_SINKS:
            parts.append(svg_rect((420, sy - 30, 40, 60)))
        parts.append(svg_rect(HYP_OB_INF, fill="#fdeee7", stroke="#e0b39e", dash="4 3"))
        parts.append(svg_rect(HYP_OBST))

    p1 = []
    blockrects(p1)
    for r, off in zip(HYP_INDEP, (-2.5, 0, 2.5)):
        p1.append(svg_path([(x, y + off) for (x, y) in r], stroke=ACCENT, width=2, opacity="0.75"))
    p1.append(svg_dot(*HYP_S, 4, ACCENT2))
    p1.append(svg_text(8, 18, "3 cables pile on the trunk — first segments are port-pinned,",
                       size=11))
    p1.append(svg_text(8, 31, "so the nudger may not spread them (nudge.ts:245)", size=11))
    p1.append(svg_text(8, 292, f"three independent routes — total wire {indep_len:g} px",
                       size=11.5, fill="#40506a", weight="600"))
    panel1 = wrap_svg("".join(p1), 470, 300, "Independent cables today")

    p2 = []
    blockrects(p2)
    p2.append(svg_path(HYP_TREE_TRUNK, stroke=GOOD, width=3))
    for b in HYP_TREE_BRANCHES:
        p2.append(svg_path(b, stroke=GOOD, width=2))
    p2.append(svg_dot(304, 150, 4.5, "#fff", GOOD))
    p2.append(svg_dot(304, 150, 2.5, GOOD))
    p2.append(svg_text(312, 170, "junction", size=11, fill=GOOD))
    p2.append(svg_dot(*HYP_S, 4, ACCENT2))
    p2.append(svg_text(8, 292,
                       f"one hyperedge tree — total wire {tree_len:g} px "
                       f"({100 - round(100 * tree_len / indep_len)}% less ink)",
                       size=11.5, fill="#40506a", weight="600"))
    panel2 = wrap_svg("".join(p2), 470, 300, "MTST hyperedge route")
    return panel1, panel2, indep_len, tree_len


# =========================================================================
# The page
# =========================================================================

def code(s):
    return f"<code>{html.escape(s)}</code>"


CSS = """
:root { --ink:#1c2839; --mut:#5a6b80; --line:#e3e9f1; --bg:#ffffff;
        --card:#f7f9fc; --acc:#0b69c7; --warn:#b54708; --good:#0c7a43; }
* { box-sizing:border-box }
body { margin:0; background:var(--bg); color:var(--ink);
       font:15px/1.55 ui-sans-serif, system-ui, "Segoe UI", sans-serif; }
main { max-width:1060px; margin:0 auto; padding:34px 26px 90px; }
h1 { font-size:27px; line-height:1.2; margin:6px 0 4px }
h2 { font-size:20px; margin:46px 0 10px; padding-top:14px; border-top:1px solid var(--line) }
h3 { font-size:16px; margin:26px 0 8px }
p, li { max-width:80ch }
code { background:#eef2f7; border-radius:4px; padding:1px 5px;
       font:12.5px/1.4 ui-monospace, "SF Mono", Menlo, monospace; color:#243a56 }
sup { color:var(--acc); font-weight:600; font-size:10.5px }
a { color:var(--acc); text-decoration:none } a:hover { text-decoration:underline }
.kicker { color:var(--mut); font-size:12.5px; letter-spacing:.06em; text-transform:uppercase }
.lede { color:var(--mut); font-size:15.5px; max-width:86ch }
.tldr { background:var(--card); border:1px solid var(--line); border-radius:10px;
        padding:16px 20px; margin:22px 0 }
.grid2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; align-items:start }
@media (max-width:900px){ .grid2 { grid-template-columns:1fr } }
figure { margin:14px 0 }
figcaption { font-size:12.5px; color:var(--mut); margin-top:6px; max-width:80ch }
table { border-collapse:collapse; width:100%; font-size:13.5px; margin:12px 0 }
th { text-align:left; font-size:12px; text-transform:uppercase; letter-spacing:.04em;
     color:var(--mut); border-bottom:2px solid var(--line); padding:7px 10px 5px;
     vertical-align:bottom }
td { border-bottom:1px solid var(--line); padding:7px 10px; vertical-align:top }
tr:hover td { background:#fafcff }
.wide { overflow-x:auto }
.v-match { color:var(--good); font-weight:600; white-space:nowrap }
.v-port { color:var(--acc); font-weight:600; white-space:nowrap }
.v-dep { color:#7a3fb8; font-weight:600; white-space:nowrap }
.v-ours { color:var(--warn); font-weight:600; white-space:nowrap }
.algo { border:1px solid var(--line); border-radius:10px; padding:16px 20px 8px;
        margin:16px 0; background:#fff }
.algo h3 { margin-top:0 }
.meta { font-size:12.5px; color:var(--mut); margin:-2px 0 10px }
.buy { border-left:3px solid var(--good); padding:2px 0 2px 12px; margin:10px 0;
       font-size:14px; color:#274a38; background:#f2faf6; border-radius:0 6px 6px 0 }
.flag { border-left:3px solid var(--warn); padding:2px 0 2px 12px; margin:10px 0;
        font-size:14px; color:#5c3617; background:#fdf6ee; border-radius:0 6px 6px 0 }
.cols { display:grid; grid-template-columns:1fr 1fr; gap:0; border:1px solid var(--line);
        border-radius:10px; overflow:hidden; margin:14px 0 }
.col { padding:14px 18px } .col + .col { border-left:1px solid var(--line) }
.col h4 { margin:0 0 8px; font-size:14px }
.col ol { margin:0; padding-left:20px; font-size:13.5px }
.col li { margin:5px 0 }
.col.lft { background:#f8f6ff } .col.rgt { background:#f4faf7 }
details { margin:10px 0; border:1px solid var(--line); border-radius:8px; padding:8px 14px }
summary { cursor:pointer; font-weight:600; font-size:13.5px; color:var(--mut) }
pre { overflow-x:auto; background:#f4f6fa; padding:12px; border-radius:8px;
      font:12px/1.5 ui-monospace, Menlo, monospace }
.srcs { font-size:13px; color:var(--mut) } .srcs li { margin:4px 0 }
.num { display:inline-block; min-width:20px; color:var(--acc); font-weight:700 }
.pill { display:inline-block; font-size:11px; font-weight:700; letter-spacing:.03em;
        border-radius:99px; padding:1px 9px; vertical-align:2px }
.pill.g { background:#e5f5ec; color:var(--good) }
.pill.o { background:#fdeee0; color:var(--warn) }
.pill.b { background:#e5effb; color:var(--acc) }
.quiet { color:var(--mut); font-size:13px }
"""


def build_page() -> str:
    ovg_svg, ovg_nodes, ovg_edges = render_ovg_panel()
    grid_svg, gcols, grows = render_our_grid_panel()
    nudge_before_svg, nudge_after_svg = render_nudge_panels()
    hyp1, hyp2, indep_len, tree_len = render_hyperedge_panels()

    parts: list[str] = []
    parts.append(f"<style>{CSS}</style><main>")
    parts.append('<div class="kicker">SystemSketch · Tidy edges · research report · 2026-09-17</div>')
    parts.append("<h1>libavoid vs our elbow router — what to take, what to keep, what to skip</h1>")
    parts.append(
        '<p class="lede">First deliberate read of libavoid (27,288 lines of C++), its four '
        'papers, and the libavoid-js WASM port, against the full Tidy pipeline in '
        '<code>src/blocks/elbow</code> + <code>src/blocks/connections</code>. '
        'Read for <b>algorithms, not code</b>: nothing here is transcribed from LGPL source; '
        'every algorithm is described at the level of the papers, and every claim carries the '
        'paper section <i>and</i> the <code>file:line</code> where the code disambiguates '
        'it.</p>')

    parts.append("""
<div class="tldr">
<p style="margin:6px 0"><b>Top recommendation.</b> Port three <i>ideas</i> from libavoid's
nudging stage into <code>nudge.ts</code> — channel walls from a scanline sweep, per-bundle
spacing back-off, and alley centring — about a week of work, no licensing exposure, and it
targets the one defect class Tidy still visibly has (whole-channel nudge reverts and uneven
gaps). Do <b>not</b> swap the router for libavoid-js: the WASM payload and speed are fine
(measured below), but the binding cannot express an authored immovable route
(<code>setFixedRoute</code> is not exposed), and libavoid has no analogue of our soft-clearance
cost at all — the two invariants Tidy is built on. Keep libavoid-js as a
<i>dev-only differential-testing oracle</i> instead.</p>
<p style="margin:6px 0"><b>Five most valuable finds.</b>
<b>1)</b> Orthogonal visibility graph built by sweepline — one shared search space for all
cables<sup>2</sup>.
<b>2)</b> A* states keyed by (vertex, entry direction) with a minimum-remaining-bends
heuristic — bend-optimal, unlike a visited-per-cell grid search<sup>2</sup>.
<b>3)</b> Channel walls by scanline + weighted 1-D constraint solve (VPSC) + spacing back-off
for nudging<sup>2,5</sup>.
<b>4)</b> Minimum-terminal-spanning-tree hyperedge routing — one trunk for
one-source-to-N-sinks, the dataflow common case we have no answer for<sup>3</sup>.
<b>5)</b> A self-check suite (<code>existsOrthogonalSegmentOverlap</code> &amp; friends) that
is a ready-made list of invariant tests for our nudger<sup>5</sup>.</p>
</div>""")

    parts.append("<h2>0 · Provenance and the licence line</h2>")
    parts.append(
        '<p>libavoid is LGPL-2.1-or-later (dual-licensed commercially by Monash)<sup>5</sup>. '
        'Our <code>nudge.ts</code> was derived independently <i>before</i> anyone here read '
        'libavoid — its header says so explicitly and cites only MIT/Apache/EPL relatives'
        '<sup>21</sup>. This report is the first deliberate read, at Zach\'s request'
        '<sup>0</sup>. The line held throughout: <b>ideas and maths are free; expression is '
        'not</b>. Anything ported from this report into SystemSketch gets written fresh from '
        'the paper description, cites the paper, and never line-translates the C++. Where the '
        'paper and the code disagree, that is called out — twice below the code is the truth '
        'and the paper is wrong or silent.</p>')

    parts.append("<h2>1 · The two pipelines, side by side</h2>")
    parts.append(
        '<p>Both systems converged on the same macro shape — <i>route each edge, then fix the '
        'ensemble</i> — which is worth noticing: our pipeline is not architecturally naive, it '
        'is a smaller instance of the published one, with two extra stages libavoid does not '
        'have (soft clearance, authored-route stability) and one whole stage we lack (a shared '
        'visibility structure).</p>')
    parts.append(f"""
<div class="cols">
<div class="col lft"><h4>libavoid transaction — 7 phases<sup>5</sup> ({code("router.h:299-321")})</h4>
<ol>
<li>Orthogonal visibility graph, X then Y sweep ({code("orthogonal.cpp:1730")})</li>
<li>A* route search per connector needing it ({code("makepath.cpp:967")})</li>
<li>Crossing detection over all pairs ({code("router.cpp:1409")})</li>
<li>Reroute crossing sets, cheapest first ({code("router.cpp:1500-1546")})</li>
<li>Hyperedge reroute (MTST) + improver ({code("mtst.cpp:282")}, {code("hyperedgeimprover.cpp:787")})</li>
<li>Nudging X: simplify → unify → order → channel walls → VPSC ({code("orthogonal.cpp:2533")})</li>
<li>Nudging Y, then repaint callbacks ({code("router.cpp:1013-1030")})</li>
</ol></div>
<div class="col rgt"><h4>Our Tidy edges ({code("tidyEdges.ts:130-271")})</h4>
<ol>
<li>Scope: selection, incident blocks, container interiors ({code("tidyEdges.ts:274-298")})</li>
<li>Scene per movable edge: blocks, Branch arms, port-label text ({code("routingObstacles.ts:239")})</li>
<li>Baseline A* per edge, midline + tight regimes ({code("elbowRouter.ts:859-903")})</li>
<li>Soft-clearance re-plan in deterministic priority order ({code("tidyEdges.ts:179-213")})</li>
<li>Stability: keep the old corridor while it is still valid ({code("collisionAwareRouting.ts:153")})</li>
<li>Bundle nudge + collision veto + soft-cost veto ({code("nudge.ts:553")}, {code("collisionAwareRouting.ts:197")}, {code("tidyEdges.ts:222-233")})</li>
<li>Persist in the endpoint-frame authored model ({code("elbowAuthoredRoute.ts:385")})</li>
</ol></div>
</div>""")

    # ============================================================ catalog
    parts.append("<h2>2 · The algorithm catalog — what libavoid has that we can reference</h2>")

    parts.append(f"""
<div class="algo">
<h3>2.1 · Orthogonal visibility graph by sweepline <span class="pill b">the big structural
difference</span></h3>
<div class="meta">Wybrow, Marriott &amp; Stuckey, GD 2009, §3<sup>2</sup> ·
{code("orthogonal.cpp:1730")} ({code("generateStaticOrthogonalVisGraph")}),
{code("orthogonal.cpp:1368")}/{code(":1551")} (event handlers), {code("orthogonal.cpp:1276")}
(segment intersection), {code("scanline.cpp:165")} (scanline neighbour queries)</div>
<p>Take the <i>interesting points</i> — every shape corner and every connector point — and
draw through each the maximal horizontal and vertical visibility segment that touches no
obstacle interior. Nodes are the intersections of those segments; edges join neighbouring
nodes along a segment. Every optimal orthogonal route can be reshaped onto this graph without
getting longer or gaining bends (GD'09's Observation, p.&nbsp;4), so one graph serves
<b>every</b> connector. The segments come from a vertical sweep then a horizontal sweep
(events: shape open, shape close, connector point — processed in multiple passes per position
so same-position events see each other), which is the O(n·log&nbsp;n) part; intersecting the
O(n) segments then costs O(n²)<sup>2</sup>. Directional visibility of endpoints (a port that
may only leave rightward) is baked in at construction: a connector point only spawns segments
in its declared directions ({code("orthogonal.cpp:1461-1511")}).</p>
<div class="grid2">
<figure>{ovg_svg}<figcaption><b>(a)</b> The orthogonal visibility graph for four blocks and two
ports, computed here from the GD'09 §3 definition: {ovg_nodes} nodes, {ovg_edges} edges —
built once, shared by every cable.</figcaption></figure>
<figure>{grid_svg}<figcaption><b>(b)</b> The same scene as <i>our</i> router sees it for the
one cable A→D ({code("elbowRouter.ts:195")}): endpoint keep-outs grown to the midline
(dashed), obstacles inflated by 24&nbsp;px (red), candidate rails collapsed at 0.5&nbsp;px,
then a <b>full {gcols}×{grows} lattice = {gcols * grows} nodes</b> — built for this one cable,
searched, thrown away. A second cable builds its own.</figcaption></figure>
</div>
<p>GD'09 §7 classifies our style of router precisely: it is <i>maze running</i> over a
non-uniform grid whose mesh is tailored to the endpoint pair<sup>2</sup>. That is the right
trade at our scale — the lattice stays small because only two boxes and local obstacles
contribute rails — but it means (i) N cables do N full grid constructions with zero sharing,
(ii) routes can only turn on rails derived from the endpoint pair and obstacle bounds, and
(iii) no shared structure is left over for the ensemble passes (libavoid's nudging orders fall
out of crossing detection over routes in the shared graph).</p>
<div class="buy"><b>What it buys us:</b> nothing urgent at 10–50 cables — and libavoid itself
rebuilds this graph from scratch on every transaction ({code("router.cpp:653")},
{code("router.cpp:933")}), so it is not an incremental miracle either. The idea to file away:
when boards reach hundreds of edges, one shared interesting-points graph turns N per-edge grid
constructions into one construction + N cheap searches.</div>
</div>""")

    parts.append(f"""
<div class="algo">
<h3>2.2 · A* with (vertex, entry-direction) states and a minimum-bends heuristic
<span class="pill g">port the two small ideas</span></h3>
<div class="meta">GD 2009 §4<sup>2</sup> · {code("makepath.cpp:967")} (search),
{code("makepath.cpp:648")} ({code("bends")}), {code("makepath.cpp:153-178")} (tie-break),
{code("makepath.cpp:1333-1388")} (turn pruning)</div>
<p>Three details separate their search from our Excalidraw-derived one
({code("elbowRouter.ts:366-439")}):</p>
<p><b>(i) The search state is (vertex, direction of entry), not the vertex.</b> Priority-queue
entries have the form (v, D, length, bends, parent, cost), one popped per (v,&nbsp;D)
pair<sup>2</sup>; the code keys its done/pending checks on the (vertex, previous-vertex) pair
({code("makepath.cpp:1479-1481")}, {code(":1506-1508")}). With bend costs, the cheapest way
<i>into</i> a node depends on the direction you leave it, so a router that marks a cell
visited once — ours does: {code("elbowRouter.ts:425-435")} keys on the grid node alone — is
not bend-optimal by construction. Ours re-scores nodes when g improves, which papers over
most cases, but not all; theirs is optimal by state design.</p>
<p><b>(ii) The heuristic adds minimum-remaining-bends × segmentPenalty.</b> A small
case-analysis gives the minimum bends (0–4) to reach the target entering along an allowed
direction, from the relative quadrant and the two directions<sup>2</sup>. We carry the same
idea via Excalidraw's estimator ({code("elbowRouter.ts:296-356")}), so this is a match — with
one delicious footnote: the comment above libavoid's implementation says the geometry "was
described in the 'Orthogonal Connector Routing' paper, although the version described there is
<b>incorrect</b>" ({code("makepath.cpp:644-646")}). The published case table (GD'09
Fig.&nbsp;2a) and the shipped one disagree; the code is the trustworthy artefact. If we ever
re-derive our estimator, validate against code behaviour, not the paper figure.</p>
<p><b>(iii) Deterministic tie-breaking with an epsilon.</b> Costs are compared with a 1e-7
epsilon, and ties fall to a timestamp that prefers the most recently extended (straightest)
path, neighbours explored straight-first ({code("makepath.cpp:159-178")}; GD'09 §4 explains
the intent: stable, predictable routes). Our heap breaks f-ties by insertion accident
({code("elbowRouter.ts:376-386")}); float jitter between two symmetric routes can flip the
winner between frames. A two-line epsilon + straightness tie-break is the cheapest stability
win in this whole report.</p>
<p><b>Bonus pruning (the 2014 idea, half-implemented).</b> The "Seeing Around Corners" paper
introduces canonical <i>obstacle-hugging</i> routes and a 1-bend visibility graph to kill
topologically-equivalent duplicates, reporting ~10× routing speedups on large
diagrams<sup>4</sup>. The full 1-bend graph never landed in libavoid (no trace in the source;
the paper says "we plan to include"), but its spirit did: during the sweep each vertex learns
whether an obstacle edge lies ahead in each direction ({code("orthogonal.cpp:867")}), and the
A* refuses to <i>turn</i> at a vertex unless it is passing an obstacle edge or is aligned with
a possible endpoint ({code("makepath.cpp:1333-1388")}). The same trick applies to our lattice:
only rails touching an obstacle bound or an endpoint deserve a turn.</p>
<div class="flag"><b>Correction to the brief:</b> the task sheet attributed nudging to
Marriott Diagrams'14 ("Seeing Around Corners"). Wrong paper — nudging is GD 2009 §5.
Diagrams'14 is obstacle-hugging / 1-bend-graph search speed, and it is <i>not</i> in shipped
libavoid.</div>
</div>""")

    parts.append(f"""
<div class="algo">
<h3>2.3 · The cost function and its penalty family <span class="pill b">reference
table</span></h3>
<div class="meta">GD 2009 §2, §8<sup>2</sup> · {code("makepath.cpp:310-486")} ({code("cost")}),
{code("router.cpp:90-92")} (defaults), {code("router.cpp:1996-2035")} ("sensible"
activations)</div>
<p>Cost of extending a path = edge length + penalties. Everything is a scalar knob on the
router<sup>5</sup>; the interesting structure is <i>when</i> each term applies:</p>
<div class="wide"><table>
<tr><th>parameter</th><th>default</th><th>"sensible"</th><th>where it actually applies</th></tr>
<tr><td>{code("segmentPenalty")}</td><td>10</td><td>50</td><td>every non-collinear bend; ×2 for
a double-back ({code("makepath.cpp:346-356")}); also scales the heuristic's bend
estimate</td></tr>
<tr><td>{code("anglePenalty")}</td><td>0</td><td>50</td><td>polyline routing only, log-scaled
so slight bends cost little ({code("makepath.cpp:334-344")})</td></tr>
<tr><td>{code("crossingPenalty")}</td><td>0</td><td>200</td><td><b>not during initial
routing</b> — only in a post-stage where crossing pairs are detected and re-searched
({code("makepath.cpp:436-440")}, {code("router.cpp:1409")})</td></tr>
<tr><td>{code("clusterCrossingPenalty")}</td><td>4000</td><td>4000</td><td>crossing a cluster
boundary ({code("makepath.cpp:360-398")})</td></tr>
<tr><td>{code("fixedSharedPathPenalty")}</td><td>0</td><td>110</td><td>sharing a segment with
an <i>immovable</i> piece of another route (port stubs, fixed routes), post-stage
({code("makepath.cpp:443-480")})</td></tr>
<tr><td>{code("portDirectionPenalty")}</td><td>0</td><td>100</td><td>pin choice whose
visibility cone does not face the partner ({code("router.h:133-142")})</td></tr>
<tr><td>{code("shapeBufferDistance")}</td><td>0</td><td>—</td><td>global obstacle inflation
({code("router.h:144-149")}); ours is per-obstacle
({code("routingObstacles.ts:46-52")}: 24&nbsp;px blocks, 4&nbsp;px labels, 0&nbsp;px terminal
labels) — libavoid cannot express that without pre-inflated polygons</td></tr>
<tr><td>{code("idealNudgingDistance")}</td><td>4</td><td>4</td><td>channel separation in
nudging ({code("orthogonal.cpp:2604")}); ours is 14 ({code("nudge.ts:105-108")})</td></tr>
<tr><td>{code("reverseDirectionPenalty")}</td><td>0</td><td>50</td><td>heading away from the
target in either axis ({code("makepath.cpp:400-434")})</td></tr>
</table></div>
<p>The crossing machinery is the part worth studying: rather than poisoning every search with
O(conns) crossing tests, initial routes are computed cheaply, crossing pairs detected once
({code("router.cpp:1428-1483")}), a minimal removal set computed per interacting group, and
only those connectors re-searched inside the penalty regime, cheapest first
({code("router.cpp:1490-1546")}, estimator at {code(":1056")}). Compare our soft clearance
({code("softClearance.ts:149-173")}): we charge near-miss (0.4 bend-equivalents inside a
32&nbsp;px gap) and crossing (3) <i>during</i> the search, but only against a small explicit
reference set, chosen per edge in deterministic priority order
({code("tidyEdges.ts:179-213")}). Same intent, opposite ends of the global-vs-local spectrum;
ours is the right shape for interactive scope, theirs for whole-board minimisation.</p>
<div class="buy"><b>What it buys us:</b> the two-stage "route cheap, then re-route only
detected offenders under a stricter cost" pattern would drop straight into Tidy if
soft-clearance passes ever get slow: run the baseline with weights at zero, score, re-plan
only edges whose pairwise cost is non-zero.</div>
</div>""")

    parts.append(f"""
<div class="algo">
<h3>2.4 · Nudging: ordering, channel walls, weighted solve, back-off
<span class="pill g">the head-to-head that matters</span></h3>
<div class="meta">GD 2009 §5.1–5.2<sup>2</sup> · order info {code("orthogonal.cpp:3148")},
crossing/shared-path analysis {code("connector.cpp:1748")}, walls {code("scanline.cpp:462")},
solve {code("orthogonal.cpp:2597-3129")}, VPSC {code("vpsc.h:17-25")}<sup>5</sup></div>
<p>Both nudgers answer the same two questions. <b>Which order do cables sharing a channel
take?</b> libavoid traces each shared path to its two divergence points and asks which side
each fork leaves on ({code("cornerSide")} at both ends of the traced shared path,
{code("connector.cpp:2106-2145")}); a shared path whose forks exit on different sides is a
true crossing, and GD'09 Theorem&nbsp;3 guarantees crossings happen only at shared-path ends.
Our {code("orderBundle")} ({code("nudge.ts:371-443")}) is the <b>depth-1 specialisation</b> —
compare only the immediately adjacent legs — which its own header proves equivalent for
fork-at-once bundles and concedes is information-free for cables sharing several consecutive
segments (<i>coincident sub-paths</i>). libavoid's full walk handles exactly that case. Ours
adds two things theirs lacks: a <b>cycle detector</b> whose output is the set of crossings no
ordering can remove — precisely where SystemSketch should draw a crossover hop
({code("nudge.ts:411-417")}) — and an <b>identity tie-break</b> so unconstrained order never
flips during a drag ({code("nudge.ts:419-441")}; the header records draw.io shipping libavoid
nudging in 2026 and documenting live-preview oscillation — recorded there, not re-verified
here<sup>21</sup>).</p>
<p><b>Where exactly does each channel go?</b> Here they are simply ahead:</p>
<ul>
<li><b>Channel walls from a sweep.</b> A scanline pass computes, for every shiftable segment,
the nearest obstacle edge on each side — its private [min,&nbsp;max] corridor
({code("scanline.cpp:388-461")}, {code("buildOrthogonalChannelInfo")} at {code(":462")}). Our
nudger has no walls; a nudged route that would hit an obstacle is <i>reverted whole</i>
({code("collisionAwareRouting.ts:197-222")}, surfaced as {code("revertedNudges")}).</li>
<li><b>Weighted 1-D solve.</b> Each segment becomes a variable with a weight class — free
1e-5, "stay put" 0.001, centred single-segment 1.0, immovable 1e5
({code("orthogonal.cpp:58-62")}, {code(":183-233")}) — with separation constraints of
{code("idealNudgingDistance")} between ordered neighbours and boundary variables at the walls,
solved by VPSC ({code("IncSolver")}, Dwyer's solver consolidated into {code("vpsc.cpp")})
<sup>5</sup>. S/Z-bend middles get their <i>ideal</i> position set to the channel centre
({code("orthogonal.cpp:216")}) — the "pass down the middle of alleys" behaviour<sup>2</sup>.</li>
<li><b>Spacing back-off.</b> If the solve is unsatisfiable at the ideal spacing, the gap
shrinks by tenths — rewriting only the constraints inside the unsatisfied wall-to-wall range —
until it fits or reaches zero ({code("orthogonal.cpp:3030-3091")}). Our
{code("assignBundleChannels")} places fixed ±14&nbsp;px slots and has no squeeze — a narrow
corridor either fits the full cadence or the shift reverts.</li>
<li><b>Unify first.</b> Before nudging, a greedy pass equality-constrains nearby free segments
to the <i>same</i> position, closest pairs first, keeping each merge only while satisfiable
({code("orthogonal.cpp:2838-3027")}) — segments that can share a rail do, and then get ordered
as one shared path. Default on ({code("router.cpp:98")}).</li>
</ul>
<div class="grid2">
<figure>{nudge_before_svg}<figcaption><b>(c)</b> The defect both nudgers exist for, drawn with
the real coordinates from {code("nudge.ts:8-18")}'s measured example: two parallel cables both
put their vertical on the deterministic midline x=460 and coincide for 115&nbsp;px.
</figcaption></figure>
<figure>{nudge_after_svg}<figcaption>After our {code("nudgeRoutes")}: the constraint pass
orders blue left of green (both of green's legs cross blue's span from the x=600 side), then
free channels sit at centre&nbsp;±&nbsp;spacing/2 → x=453 and x=467, gap exactly 14&nbsp;px,
zero crossings. libavoid differs only in <i>placement</i>: walls from the sweep, 4&nbsp;px
ideal gaps, VPSC, squeeze when the corridor is tight.</figcaption></figure>
</div>
<p>One more behaviour worth knowing: nudging <b>final segments</b> (port stubs) is off by
default ({code("router.cpp:94")}) — when on, end segments may shift within their shape's
bounds, and collinear end-segments of one connector get merged and moved together
({code("orthogonal.cpp:2112-2196")}, merge inside {code("linesort")} at
{code(":2378-2409")}). Our first/last segments are simply immovable ({code("nudge.ts:245")}),
which matches their default and our port semantics.</p>
<div class="buy"><b>What it buys us:</b> replace the all-or-nothing collision veto with
per-bundle walls + clamp; squeeze spacing instead of reverting; centre lone S/Z rails in their
alley. All three are afternoon-sized, measurable (the {code("revertedNudges")} and
{code("spacingDefects")} counters already report the defects), and describable entirely from
GD'09 §5.2 prose — no LGPL expression involved.</div>
</div>""")

    parts.append(f"""
<div class="algo">
<h3>2.5 · Incrementality: what "fast, incremental" actually means there
<span class="pill o">the brief's premise needed correcting</span></h3>
<div class="meta">Wybrow, Marriott &amp; Stuckey, GD 2005<sup>1</sup> ·
{code("router.cpp:641-657")} (transactions), {code("connector.cpp:923-1057")}
({code("generatePath")}), {code("router.cpp:1768-1900")} (reroute pruning),
{code("graph.cpp")} / {code("visibility.cpp")} (visibility + invisibility graphs)</div>
<p>The famous incremental machinery is <b>polyline-only</b>. For polyline routing there are
two graphs — visibility, and an "invisibility" graph remembering <i>which obstacle blocks
each non-edge</i> — so deleting a shape retests only the edges that shape was blocking (GD'05
§2.3)<sup>1</sup>; each visibility edge also carries the connectors routed over it, so an
invalidated edge flags exactly those ({code("connector.cpp:991-994")},
{code("router.h:332-341")}). After a deletion, a connector is reconsidered only if a
closed-form lower bound on a detour through the vacated region beats its current length
(GD'05 §2.3, Fig.&nbsp;2; {code("router.cpp:1768-1900")}).</p>
<p><b>Orthogonal routing has none of that.</b> Every {code("processTransaction")} invalidates
the whole orthogonal visibility graph ({code("router.cpp:653")}), rebuilds it
({code("router.cpp:933")}), and re-runs every orthogonal connector — an orthogonal route
always reports itself stale ({code("connector.cpp:996-999")}). The incremental story for
orthogonal routing is <i>transaction batching</i> plus per-connector <i>skip if fixed</i>
({code("router.cpp:966-970")}), not selective reroute. The WASM measurements in §4.2 confirm
it: moving one shape costs almost as much as the first full route.</p>
<div class="buy"><b>What it buys us:</b> honestly — validation of our own choice. During a
drag we reroute exactly one edge against a locally collected scene, and
{code("stabilizeOrthogonalRoute")} ({code("collisionAwareRouting.ts:153-186")}) keeps
yesterday's corridor when it still clears — a <i>route-level</i> stability device libavoid
does not have. The GD'05 lower-bound pruning trick ("could this edge possibly improve?") is
the one to remember if we ever add whole-board auto-tidy-on-move: a cheap closed-form test per
(moved shape × cable) before re-planning anything.</div>
</div>""")

    parts.append(f"""
<div class="algo">
<h3>2.6 · Hyperedge routing — minimum terminal spanning trees
<span class="pill b">the capability we simply do not have</span></h3>
<div class="meta">Wybrow, Marriott &amp; Stuckey, Diagrams 2012<sup>3</sup> ·
{code("mtst.cpp:282")} (sequential heuristic), {code("mtst.cpp:633")} (interleaved
heuristic), {code("hyperedgetree.cpp")} (tree structure),
{code("hyperedgeimprover.cpp:787")} (local improvement), {code("junction.cpp")}
(junctions)</div>
<p>A hyperedge is one logical edge with N endpoints, drawn as a tree with junctions. Optimal
is NP-hard (rectilinear Steiner), so: grow a <b>shortest-path terminal forest</b> from all
terminals at once with an extended Dijkstra — bend costs handled by giving each vertex a
penalty-priced twin for the other dimension (the <i>separated</i> OVG, Diagrams'12 §4; dummy
dimension-change vertices at {code("mtst.cpp:369-407")}) — then join the trees with an
extended Kruskal over the discovered bridging edges, cheapest first
({code("mtst.cpp:461-512")})<sup>3</sup>. The interleaved variant (their Heuristic&nbsp;2)
grows and bridges simultaneously, producing routes "closer to what a human would
draw"<sup>3</sup>. A separate <b>improver</b> then shifts tree segments and migrates junctions
toward recommended positions — optionally adding/removing junctions — as batched local
transformations ({code("hyperedgeimprover.cpp:555")}, options at
{code("router.h:190-275")}).</p>
<div class="grid2">
<figure>{hyp1}<figcaption>One output feeding three inputs today: three independent cables.
The trunk out of the port is triple-drawn, and our nudger is <i>forbidden</i> to spread it —
those are terminal segments ({code("nudge.ts:245")}). Total wire: {indep_len:g}&nbsp;px.
</figcaption></figure>
<figure>{hyp2}<figcaption>The same net as an MTST hyperedge: one trunk, one junction, three
branches — {tree_len:g}&nbsp;px, {100 - round(100 * tree_len / indep_len)}% less ink, and the
trunk reads as one wire because it <i>is</i> one wire. This is the dataflow fan-out case (one
named value consumed by N blocks) SystemSketch hits constantly.</figcaption></figure>
</div>
<div class="buy"><b>What it buys us:</b> a real feature, not a tuning: shared trunks for
fan-out nets, with a junction dot the user can drag (libavoid junctions expose a recommended
position and can be position-locked). Nothing in our tree does this. It is also the strongest
argument for keeping libavoid-js reachable: reimplementing forest-growing + bridging +
improvement honestly is weeks, not days.</div>
</div>""")

    parts.append(f"""
<div class="algo">
<h3>2.7 · Connection pins and endpoint direction — port selection inside the search
<span class="pill g">our model matches; theirs adds one trick</span></h3>
<div class="meta">{code("connectionpin.h:68-96")}, {code("connend.h:60-80")},
{code("connector.cpp:948-954")}, {code("makepath.cpp:995-1035")}<sup>5</sup></div>
<p>A pin sits at a proportional or absolute offset on its shape, moves with it, and declares
visibility directions (a boundary pin auto-faces outward). Pins share a <i>class id</i>; a
connector targets a class, and the router picks the concrete pin <b>during pathfinding</b> by
bridging a dummy endpoint vertex to every candidate ({code("connector.cpp:948-954")}); pins
carry a preference cost and can be exclusive — directional pins default exclusive, the gotcha
our benchmark hit (§4.2). Our equivalent is the port's {code("elbowSide")} riding through
{code("portElbowSideForFace")} ({code("routingObstacles.ts:249-266")},
{code("connectionRouting.ts:149-183")}) — the same "leave perpendicular to the wall you sit
on", but the port is <i>chosen by the user</i>, never by the router. That is a product
decision in SystemSketch (ports are named semantics, not interchangeable sockets), so
in-search pin selection is deliberately not ours — until something like "attach to whichever
side faces the source" shows up in the Communication lens.</p>
</div>""")

    parts.append(f"""
<div class="algo">
<h3>2.8 · libvpsc — the 1-D separation-constraint solver <span class="pill b">know it
exists</span></h3>
<div class="meta">{code("vpsc.h:17-25")} (provenance: Tim Dwyer's IncSolver, consolidated),
{code("vpsc.cpp")} (1,500 lines)<sup>5</sup> · used at {code("orthogonal.cpp:2877")}</div>
<p>Given variables with desired positions + weights, and constraints "left + gap ≤ right"
(optionally equality), VPSC finds the weighted-least-squares feasible placement by merging
violating variables into blocks and splitting on negative Lagrange multipliers. In libavoid
it is used <i>only</i> for nudging (and hyperedge segment shifting). Relevance to us: our
{code("assignBundleChannels")} multi-anchor fallback ({code("nudge.ts:520-539")}) is a
hand-rolled special case of exactly this problem — free rails packed around immovable
authored rails. If that code grows one more case, the answer is the tiny projection solver
from Dwyer's papers, not more branches. MSAGL made the same move (per
{code("nudge.ts:64-79")}'s provenance notes)<sup>21</sup>.</p>
</div>""")

    parts.append(f"""
<div class="algo">
<h3>2.9 · The self-check suite <span class="pill g">steal the test list (as specs)</span></h3>
<div class="meta">{code("router.cpp:2175-2335")}, declared "testing and debugging" at
{code("router.h:802-807")}<sup>5</sup></div>
<p>libavoid ships five machine-checkable output invariants, used by its regression tests:</p>
<ul>
<li>{code("existsOrthogonalSegmentOverlap")} — no two routes share a collinear span
(optionally ignoring shared ends);</li>
<li>{code("existsOrthogonalFixedSegmentOverlap")} — no route overlaps an <i>immovable</i>
segment of another (port stubs, fixed routes);</li>
<li>{code("existsOrthogonalTouchingPaths")} — no two routes touch without properly
crossing;</li>
<li>{code("existsCrossings")} — count of transversal crossings (our
{code("countCrossings")}, {code("nudge.ts:209-233")}, is the same measure);</li>
<li>{code("existsInvalidOrthogonalPaths")} — every segment is axis-aligned (ours:
{code("routeIsOrthogonal")}, {code("collisionAwareRouting.ts:38-45")}).</li>
</ul>
<p>We already assert pieces of this ({code("overlapBefore")}/{code("overlapAfter")},
{code("spacingDefects")}, {code("forcedCrossings")} in {code("NudgeReport")}) — but as
<i>metrics</i>, not universally-quantified post-conditions. Turning the five statements into
vitest properties over Tidy's output — for every scenario fixture, after tidy: no coincident
overlap except locked/locked, no segment through an inflated obstacle, no non-orthogonal
segment, crossings == forced crossings — is an afternoon and would have caught every nudge
regression we have hand-debugged.</p>
</div>""")

    # ==================================================== head-to-head
    parts.append("<h2>3 · Head-to-head: libavoid vs Tidy, capability by capability</h2>")
    parts.append(
        '<p class="quiet">Verdicts: <span class="v-match">match</span> = we already have the '
        'equivalent · <span class="v-port">port idea</span> = re-derive from the paper into '
        'our code · <span class="v-dep">depend</span> = worth using their binary · '
        '<span class="v-ours">ours</span> = deliberately different, keep ours.</p>')

    rows = [
        ("Search space",
         "One shared orthogonal visibility graph over all shapes, rebuilt per transaction "
         "(orthogonal.cpp:1730)",
         "Per-edge sparse lattice from the two endpoint boxes + local obstacles "
         "(elbowRouter.ts:195)",
         "v-ours", "ours at our scale — file the OVG idea for 200+ edge boards"),
        ("Search state",
         "(vertex, entry direction); one pop per pair (GD'09 §4; makepath.cpp:1479)",
         "Grid node only, re-scored on improvement (elbowRouter.ts:425-435)",
         "v-port", "port idea — direction-keyed visited set makes bends optimal"),
        ("Bend cost",
         "Constant segmentPenalty per bend; monotonic f(length, bends) (GD'09 §2)",
         "bendPenalty³ where bendPenalty = endpoint manhattan distance (elbowRouter.ts:419) — "
         "bends dominate lexicographically",
         "v-match", "match in effect; ours is scale-dependent by design (Excalidraw aesthetic)"),
        ("Heuristic",
         "manhattan + min-remaining-bends × penalty (makepath.cpp:782-851; paper's version "
         "wrong per code comment)",
         "manhattan + estimateBendCount × bendPenalty² (elbowRouter.ts:431)",
         "v-match", "match"),
        ("Determinism under float jitter",
         "1e-7 epsilon compare + straightest-path timestamp tie-break (makepath.cpp:159-178)",
         "Raw float f-compare, heap-order ties (elbowRouter.ts:376)",
         "v-port", "port idea — two lines, kills route flicker"),
        ("Obstacle semantics",
         "Rectangles/polygons + one global shapeBufferDistance; free junctions are not "
         "obstacles (orthogonal.cpp:1743)",
         "Blocks, Branch arm interiors, painted port-label text, per-obstacle clearance "
         "24/4/0 px (routingObstacles.ts:46-236)",
         "v-ours", "ours — semantic obstacles are half of what Tidy is"),
        ("Endpoint / port model",
         "ConnDir visibility; pin classes, per-pin cost, exclusivity, chosen in-search "
         "(connectionpin.h:68)",
         "User-chosen port with an elbowSide; route leaves perpendicular "
         "(connectionRouting.ts:149-183)",
         "v-match", "match for our product; their in-search choice noted for later"),
        ("Authored / fixed routes",
         "setFixedRoute: skipped for reroute, kept as immovable nudging constraint "
         "(connector.cpp:621; router.cpp:966; orthogonal.cpp:2164)",
         "routeMode 'authored' + endpoint-frame corners; locked cables anchor nudging "
         "(elbowAuthoredRoute.ts:270-301; nudge.ts:545-552)",
         "v-match", "match — nudge.ts's previously-uncited hasFixedRoute claim is verified true"),
        ("Route stability on drag",
         "Deterministic search + transaction batching; every orthogonal conn re-routed per "
         "transaction (connector.cpp:996)",
         "Only the dragged edge re-routes; previous corridor kept while valid "
         "(collisionAwareRouting.ts:153)",
         "v-ours", "ours — genuinely better fit for live canvas editing"),
        ("Channel ordering",
         "Full shared-path walk to both forks; crossings only at ends (GD'09 Thm 3; "
         "connector.cpp:1748-2145)",
         "Depth-1 adjacent-leg constraints + cycle → forcedCrossings + identity tie-break "
         "(nudge.ts:371-443)",
         "v-port", "port idea — depth-k walk for coincident sub-paths; keep our cycles + "
         "tie-break"),
        ("Channel placement",
         "Scanline walls, VPSC weighted solve, spacing back-off, unify, alley centring "
         "(scanline.cpp:462; orthogonal.cpp:2597-3129)",
         "Fixed ±14 slots around centre/anchors; collision → revert whole shift "
         "(nudge.ts:475-539; collisionAwareRouting.ts:197)",
         "v-port", "port idea — the top recommendation of this report"),
        ("Crossing minimisation",
         "Post-stage: detect pairs, re-route minimal sets under crossingPenalty "
         "(router.cpp:1409)",
         "In-search soft crossingWeight vs local references (softClearance.ts:160-168)",
         "v-match", "different philosophies, both valid; the two-stage pattern noted"),
        ("Soft clearance / near-miss preference",
         "— none. Separation is nudging's job; no 'prefer a 32 px gap' concept",
         "Zeroable near-miss + crossing weights, guide rails fed to the grid "
         "(softClearance.ts:34-195)",
         "v-ours", "ours — does not exist in libavoid at all"),
        ("Hyperedges / junctions",
         "MTST heuristics + tree improver + draggable junctions (mtst.cpp; "
         "hyperedgeimprover.cpp)",
         "— none. Fan-out = N independent cables piling on the trunk",
         "v-dep", "depend (or long-term port) — the one real capability gap"),
        ("Checkpoints / forced via-points",
         "Per-connector checkpoints with arrival/departure directions "
         "(connector.cpp:1059-1153)",
         "User pins on auto-route segments; whole authored polylines "
         "(elbowRouter.ts:614-649)",
         "v-match", "same intent, different gesture; nothing to do"),
        ("Output self-checks",
         "Five exists* invariants used by regression tests (router.cpp:2175-2335)",
         "NudgeReport metrics + scenario tests (nudge.ts:134-158)",
         "v-port", "port idea — write the five invariants as vitest properties"),
        ("Progress / cancellation",
         "shouldContinueTransactionWithProgress across 7 phases (router.h:705-745)",
         "— sync and local, fast enough not to need it",
         "v-ours", "ours"),
    ]
    verdict_label = {"v-match": "match", "v-port": "port idea", "v-dep": "depend",
                     "v-ours": "ours"}
    tr = []
    for cap, them, us, cls, note in rows:
        tr.append(
            f"<tr><td><b>{html.escape(cap)}</b></td>"
            f"<td>{html.escape(them)}</td><td>{html.escape(us)}</td>"
            f'<td><span class="{cls}">{verdict_label[cls]}</span><br>'
            f'<span class="quiet">{html.escape(note)}</span></td></tr>')
    parts.append(
        '<div class="wide"><table><tr><th style="width:12%">capability</th>'
        '<th style="width:33%">libavoid</th><th style="width:33%">our Tidy today</th>'
        '<th style="width:22%">verdict</th></tr>' + "".join(tr) + "</table></div>")

    # ==================================================== libavoid-js
    parts.append("<h2>4 · Should we just use libavoid-js?</h2>")
    parts.append(f"""
<p>Off-the-shelf-first taken seriously: <b>libavoid-js v0.4.5</b> (Aksem / Vladyslav Hnatiuk,
LGPL-2.1-or-later, started at TU Wien) wraps unmodified libavoid behind Emscripten WebIDL
bindings<sup>6</sup>. Everything below is measured or read from the package, not guessed.</p>

<h3>4.1 · Payload and load story (measured)</h3>
<ul>
<li>{code("dist/libavoid.wasm")}: <b>485,460&nbsp;B raw, 174.7&nbsp;KB gzipped</b>; JS glue
{code("dist/index.js")}: 76,321&nbsp;B raw, 18.6&nbsp;KB gzipped → ≈&nbsp;<b>193&nbsp;KB over
the wire</b>, ≈&nbsp;562&nbsp;KB in memory. Loaded asynchronously via
{code("AvoidLib.load(wasmPath)")} — the .wasm ships as a separate asset you must serve (their
README's #1 FAQ is the broken-path error)<sup>6</sup>. Load + instantiate measured at
~5–6&nbsp;ms from disk in Node 22 (a browser adds the network fetch).</li>
</ul>

<h3>4.2 · Speed (measured, this machine, Node 22 WASM)</h3>
<p>Grid of 120×70 blocks, one orthogonal connector to each right/down neighbour, left/right
directional pins, segmentPenalty 50, buffer 24, nudging 14 — Tidy-shaped input. Harness in
the appendix<sup>9</sup>:</p>
<div class="wide"><table>
<tr><th>scene</th><th>shapes</th><th>connectors</th><th>first full transaction</th>
<th>move 1 block + retransact (median of 20)</th></tr>
<tr><td>3×3</td><td>9</td><td>12</td><td>6.0 ms</td><td>0.7 ms</td></tr>
<tr><td>5×5</td><td>25</td><td>40</td><td>7.4 ms</td><td>2.0 ms</td></tr>
<tr><td>8×8</td><td>64</td><td>112</td><td>20.3 ms</td><td>9.6 ms</td></tr>
<tr><td>12×12</td><td>144</td><td>264</td><td>65.0 ms</td><td>45.4 ms</td></tr>
</table></div>
<p>Two readings. <b>Fast enough on commit</b> at any board size we have. <b>Not a per-frame
drag router</b> beyond ~60 shapes: the move case costs nearly as much as the first route
because orthogonal transactions rebuild the visibility graph and re-route every connector
(§2.5) — 45&nbsp;ms per move at 144 shapes is ~20&nbsp;fps with zero budget left. (Their own
2014 paper reports the C++ OVG router at 1.96&nbsp;s for a 508-shape diagram<sup>4</sup>;
WASM tracks that.) Our per-edge router does not degrade with board size during a drag at
all.</p>

<h3>4.3 · Can the API express what Tidy needs?</h3>
<div class="wide"><table>
<tr><th style="width:38%">Tidy requirement</th><th>libavoid-js answer</th></tr>
<tr><td>Obstacles (blocks, branch zones, label boxes)</td><td><span class="v-match">yes</span>
— {code("ShapeRef")} + {code("Rectangle")}/{code("Polygon")}; but clearance is one global
{code("shapeBufferDistance")}, so our 24/4/0&nbsp;px per-class clearances must be baked in by
pre-inflating each polygon ourselves</td></tr>
<tr><td>Per-port sides</td><td><span class="v-match">yes</span> — {code("ShapeConnectionPin")}
with {code("visDirs")}; mind the exclusive-by-default trap for directional pins
({code("connectionpin.h")} doc; it bit our benchmark)</td></tr>
<tr><td>Free endpoint with a direction (unbound cable being dragged)</td>
<td><span class="v-ours">no</span> — the {code("ConnEnd(point, visDirs)")} constructor exists
in C++ but is <b>commented out</b> in the binding
({code("webidl_definitions/libavoid/connend.idl:24")})</td></tr>
<tr><td><b>Authored routes as immovable constraints</b></td>
<td><span class="v-ours">no — decisive</span>. {code("ConnRef::setFixedRoute")} /
{code("hasFixedRoute")} are <b>not exposed</b> anywhere in the WebIDL surface (grepped all 17
.idl files). Without it, every authored cable is re-routed out from under the user on every
transaction — the opposite of Tidy's contract ({code("tidyEdges.ts:100-104")})</td></tr>
<tr><td>User pins on auto routes ({code("ElbowPin")})</td>
<td><span class="v-ours">no</span> — C++ checkpoints could approximate them, but
{code("setRoutingCheckpoints")} is unbound (a {code("Checkpoint")} type exists with nothing
accepting it)</td></tr>
<tr><td>Soft clearance (prefer 32&nbsp;px, never forbid)</td>
<td><span class="v-ours">no</span> — no such concept in libavoid (§3, row 13)</td></tr>
<tr><td>Incremental reroute on drag</td><td><span class="v-ours">partial</span> —
transactions batch, but orthogonal = whole-board reroute (measured above); fine on commit,
wrong shape for our drag loop</td></tr>
<tr><td>Hyperedges / junctions</td><td><span class="v-match">mostly</span> —
{code("JunctionRef")} and the improver options are bound; the {code("HyperedgeRerouter")}
registration path is not reachable from the bound {code("Router")} surface</td></tr>
</table></div>

<h3>4.4 · Licensing postures — facts only, explicitly not legal advice; Zach decides</h3>
<ul>
<li><b>Posture A — unmodified npm dependency.</b> LGPL-2.1-or-later consumed as a separate,
user-replaceable WASM artefact, licence text preserved, our code calling its public API. This
is the posture draw.io takes for the same library (as recorded in
{code("nudge.ts:421-424")})<sup>21</sup>. The obligations attach to the library, not to
SystemSketch's own code.</li>
<li><b>Posture B — translating libavoid source into our TypeScript.</b> A translation is a
derivative work of the LGPL code; the translated file inherits LGPL obligations — a different
posture entirely, and incompatible with how bbox-ui/SystemSketch code ships today. This is why
the report and any porting work stay at the algorithm/paper level: the papers are the
unencumbered description, written to be cited and reimplemented.</li>
<li>A dev-only dependency (test oracle, §6) distributes nothing — the least-exposure way to
keep libavoid's routing quality in the loop.</li>
</ul>

<h3>4.5 · Verdict</h3>
<p><b>Not as the router.</b> The two invariants Tidy is built on — authored routes are
immovable constraints, and separation is a <i>preference</i> before it is a rule — have no
expression in the binding (one is unbound C++, the other does not exist in libavoid). Speed
and size would have been acceptable. <b>Yes as an oracle, and as the hyperedge escape
hatch</b>: if shared trunks become a product feature, upstreaming the two missing bindings
({code("setFixedRoute")}, the hyperedge surface) to the actively maintained port is far
cheaper than reimplementing MTST.</p>""")

    # ==================================================== stock parts
    parts.append("<h2>5 · Stock-part mapping (house table — nothing built yet; plan only)</h2>")
    stock_rows = [
        ("Channel walls for nudging",
         "none — collision veto reverts whole shifts (collisionAwareRouting.ts:197-222)",
         "idea of buildOrthogonalChannelInfo (scanline sweep), re-derived from GD'09 §5.2",
         "authored rails stay anchors; veto only when even the clamped placement collides"),
        ("Bundle spacing under pressure",
         "fixed ±14 px slots (nudge.ts:475-539)",
         "idea of the sepDist back-off loop (orthogonal.cpp:3030), re-derived",
         "spacing 14 preferred; degrade evenly, never overlap, never move locked cables"),
        ("Alley centring",
         "midline rails offered to A* only (elbowRouter.ts:775)",
         "idea of zigzag ideal-position = channel centre (orthogonal.cpp:216)",
         "identity tie-break keeps order stable during drags (nudge.ts:419-441)"),
        ("Nudge output invariants",
         "NudgeReport metrics (nudge.ts:134-158)",
         "the five exists* checks (router.cpp:2175-2335) as vitest properties",
         "forcedCrossings stays the crossover-hop signal"),
        ("A* determinism",
         "raw float compare (elbowRouter.ts:376)",
         "epsilon + straightest tie-break idea (makepath.cpp:159; GD'09 §4)",
         "pure routeElbow contract: same input, same output"),
        ("Differential test oracle",
         "hand-written expectations in *.test.ts",
         "libavoid-js@0.4.5 as devDependency (Avoid.Router, Avoid.ConnRef)",
         "LGPL stays out of the shipped bundle; oracle compares invariants and length/bends "
         "tolerance, not exact polylines"),
        ("Hyperedge trunks (future)",
         "— none",
         "libavoid-js JunctionRef + upstream-PR'd setFixedRoute / HyperedgeRerouter bindings",
         "junction draggable; authored branches lockable; graceful fallback to N cables"),
    ]
    unchanged_rows = [
        ("unchanged (stock seam) — one-edge A* router",
         "routeElbow (elbowRouter.ts:971), Excalidraw-derived, MIT",
         "—",
         "midline-Z aesthetics, dynamic keep-outs, self-loop, deterministic fallback"),
        ("unchanged (stock seam) — semantic obstacle collection",
         "collectConnectionRoutingScene (routingObstacles.ts:239)",
         "—",
         "lens-dependent labels, Branch arm access, per-class clearances"),
        ("unchanged (stock seam) — soft clearance",
         "softClearanceCost (softClearance.ts:149)",
         "—",
         "zeroable weights; a cost, never a wall"),
        ("unchanged (stock seam) — authored model & tldraw binding",
         "elbowAuthoredRoute.ts + ConnectionShapeUtil",
         "—",
         "endpoint-frame persistence; segment-drag stub growth"),
    ]
    tr = []
    for el, today, part, survive in stock_rows + unchanged_rows:
        tr.append(f"<tr><td><b>{html.escape(el)}</b></td><td>{html.escape(today)}</td>"
                  f"<td>{html.escape(part)}</td><td>{html.escape(survive)}</td></tr>")
    parts.append(
        '<div class="wide"><table><tr><th style="width:20%">element</th>'
        '<th style="width:30%">today (ours)</th>'
        '<th style="width:26%">off-the-shelf part (exact name)</th>'
        '<th style="width:24%">behaviour that must survive</th></tr>'
        + "".join(tr) + "</table></div>")

    # ==================================================== recommendation
    parts.append("<h2>6 · Recommendation — ranked, sized</h2>")
    parts.append(f"""
<ol>
<li><b>Nudging upgrade trio in {code("nudge.ts")} <span class="pill g">top pick · ~1 week
total</span></b> — (a) per-segment channel walls via a scanline over obstacles + segments (an
afternoon), replacing the whole-route nudge veto with a clamp; (b) per-bundle spacing back-off
when 14&nbsp;px doesn't fit (an afternoon); (c) alley centring for lone S/Z rails (a day).
Why top: it attacks the defects Tidy already measures on itself ({code("revertedNudges")},
{code("spacingDefects")}), each piece is independently testable, the source of truth is GD'09
§5.2 prose, and licensing exposure is zero.</li>
<li><b>The five output invariants as vitest properties <span class="pill g">an
afternoon</span></b> — §2.9's list over every Tidy scenario fixture. Land this <i>before</i>
item 1 so the upgrade arrives against a hardened net.</li>
<li><b>A* determinism + direction-keyed states <span class="pill b">a day</span></b> —
epsilon tie-break with straight preference (two lines), then visited-per-(node, entry side)
in {code("search")} for bend-optimality.</li>
<li><b>libavoid-js as a differential oracle <span class="pill b">an afternoon</span></b> —
devDependency; for each routing fixture assert our route passes the same invariants and its
length/bends land within tolerance of the oracle's. Twenty years of routing taste in CI
without shipping LGPL.</li>
<li><b>Hyperedge trunks <span class="pill o">a week+, only when fan-out pain is
real</span></b> — product-gate first; then prefer upstreaming the two missing bindings to
libavoid-js over reimplementing MTST.</li>
</ol>""")

    parts.append("<h2>7 · Deliberately not done</h2>")
    parts.append(f"""
<ul>
<li><b>No code was ported anywhere</b> — this is a reading + decision report; items 1–5 above
are proposals, not landed work.</li>
<li><b>No browser-side benchmark</b> — the libavoid-js numbers are Node/WASM on this
workstation; a browser adds the 174.7&nbsp;KB fetch and typically runs the same WASM within
~1–2×. Good enough for go/no-go; re-measure in-app before any real integration.</li>
<li><b>draw.io / ELK / MSAGL claims not re-verified</b> — cited only as recorded in
{code("nudge.ts")}'s provenance notes<sup>21</sup>.</li>
<li><b>No vault note filed</b> — the deliverable was scoped to this repo report; the
dispatcher decides whether a <i>C&nbsp;-</i> concept note (orthogonal visibility graph, MTST)
should be cut from it.</li>
<li><b>Diagrams'12 Heuristic-2 fine detail and cluster routing</b>
({code("viscluster.cpp")}) read for orientation only — neither changes any verdict here.</li>
</ul>""")

    bench_src = pathlib.Path(
        "/tmp/claude-1000/-home-bam-bbox-ui--claude-worktrees-libavoid-routing-comparison-"
        "e5175e/ef0c0d62-d8f7-44a8-8a02-22fc42afd3ed/scratchpad/bench/bench.mjs")
    bench_code = (bench_src.read_text() if bench_src.exists()
                  else "(bench.mjs not found at build time — results quoted in §4.2 were "
                       "measured 2026-09-17)")
    parts.append(f"""
<details><summary>Appendix — the benchmark harness behind §4.2 (our code, reproducible)</summary>
<pre>{html.escape(bench_code)}</pre></details>""")

    parts.append("""
<h2>Source index</h2>
<ol class="srcs">
<li><span class="num">0</span> Zach's ask — /home/bam/zach_brain/Projects/bbox-ui/PROJECT - Black Box UI.md (~line 1951), 2026-09-17.</li>
<li><span class="num">1</span> M. Wybrow, K. Marriott, P. J. Stuckey — <i>Incremental Connector Routing</i>, Graph Drawing 2005, LNCS 3843, pp. 446–457. Read as PDF (scratchpad/papers/wybrow-gd-2005.pdf).</li>
<li><span class="num">2</span> M. Wybrow, K. Marriott, P. J. Stuckey — <i>Orthogonal Connector Routing</i>, Graph Drawing 2009, LNCS 5849, pp. 219–231. (wybrow-gd-2009.pdf)</li>
<li><span class="num">3</span> M. Wybrow, K. Marriott, P. J. Stuckey — <i>Orthogonal Hyperedge Routing</i>, Diagrams 2012. (wybrow-diagrams-2012.pdf)</li>
<li><span class="num">4</span> K. Marriott, P. J. Stuckey, M. Wybrow — <i>Seeing Around Corners: Fast Orthogonal Connector Routing</i>, Diagrams 2014. (marriott-diagrams-2014.pdf)</li>
<li><span class="num">5</span> libavoid C++ source, Adaptagrams (LGPL-2.1+, © 2004–2015 Monash University, author Michael Wybrow) — snapshot read in full 2026-09-17; all <code>file:line</code> references are into adaptagrams/cola/libavoid/. Largest files: orthogonal.cpp 3,259 · router.cpp 3,139 · connector.cpp 2,487 · makepath.cpp 1,556 · vpsc.cpp 1,500 · hyperedgeimprover.cpp 1,232 · mtst.cpp 1,094 · scanline.cpp 562.</li>
<li><span class="num">6</span> libavoid-js v0.4.5 — package.json, typings/libavoid.d.ts, webidl_definitions/libavoid/*.idl (17 files), dist/ payloads (sizes via gzip -c | wc -c), examples/. LGPL-2.1-or-later, author Vladyslav Hnatiuk. github.com/Aksem/libavoid-js.</li>
<li><span class="num">7</span> Our router — /home/bam/systemsketch/src/blocks/elbow/ (elbowRouter.ts 1,028 · nudge.ts 606 · softClearance.ts 195 · boundaryCrossing.ts 247) and /home/bam/systemsketch/src/blocks/connections/ (tidyEdges.ts 332 · collisionAwareRouting.ts 222 · routingObstacles.ts 272 · elbowAuthoredRoute.ts 399 · connectionRouting.ts 248), read in full 2026-09-17.</li>
<li><span class="num">8</span> Excalidraw provenance of our A* — THIRD-PARTY NOTICE, elbowRouter.ts:1-34 (MIT, upstream revision e1bb9ff8, fetched 2026-08-26).</li>
<li><span class="num">9</span> WASM benchmark — appendix harness, Node v22.18.0, Ryzen 9 7900X, 2026-09-17; JSON results quoted verbatim in §4.2.</li>
<li><span class="num">21</span> nudge.ts provenance header (nudge.ts:44-90, :419-429) — the ELK / MSAGL / mermaid / Pupyrev / draw.io claims are recorded there and were not independently re-verified for this report.</li>
</ol>
<p class="quiet">Built by docs/build_libavoid_comparison.py · read-only research; no
production code changed · agent: Claude (Fable 5, claude-fable-5) for Zach Yamaoka.</p>
""")
    parts.append("</main>")

    return ("<!doctype html><html lang='en'><head><meta charset='utf-8'>"
            "<meta name='viewport' content='width=device-width,initial-scale=1'>"
            "<title>libavoid vs Tidy — algorithm comparison</title></head><body>"
            + "".join(parts) + "</body></html>")


def main() -> None:
    page = build_page()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(page)
    print(f"wrote {OUT} ({len(page):,} bytes)")


if __name__ == "__main__":
    main()
