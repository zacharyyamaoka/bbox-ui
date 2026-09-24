#!/usr/bin/env python3
"""The bbox-ui idiom drawn by the SAME board engine as the 705 field boards.

`docs/vocab_board.py` is the renderer the vocab-boards React Flow kit was
ported from (apps/vocab-boards/src/layout.ts is its layout, verify.mjs
pixel-diffs the two at 0 px on 5 of 6 sample boards). It knows the field's
marks — exec pins, tunnels, walls, paired zones — and none of bbox-ui's. This
module keeps its palette, sizing and column/row layout and adds the marks a
bbox-ui board is made of, so a "today" or "proposed" drawing reads in the same
hand as the field board beside it:

  node shapes   bbox     a Block card: header band, rule, ring dots straddling
                         the walls, labels inside, chips/marks in the header,
                         optional footer. `fw`/`fh` hold an explicit footprint.
                simple   the simple face: one centred dot per wall, "+N ports"
                opaque   port content at an expanded footprint: the held card,
                         "N members hidden" centred, ports on its own walls
  frame style   region   a bbox-ui region: thin frame, the CORNER CARD that
                         owns the id and the ports (`corner`), stacked ARMS
                         (`arms`), the blackbox toggle, crossing RINGS where a
                         cable enters (`rings`), DERIVED ports on the wall
                         (`dports`), and `face: "opaque"` for the held frame
  wire kinds    cable    the one data cable — grey, elbow-routed, no arrowhead
                         (bbox-ui's DEFAULT_TRACE_MARKER_END is "none")
                delayed  dotted + a z⁻¹ pill: the loop-carried back cable
                mut      dotted red: the mutation line off a top-wall port
                named    a cable wearing a pill (`t`) — V2/V6's name or `.path`
  wire extras   end:"x"  the end-of-lifetime × (V12 del, temporal sketch)
                cross    a red ✗ over the wire — the "never" cards
  endpoints     f.cin.p / f.cout.p   a corner-card port on frame f
                f.lt.p  / f.rt.p     a derived port on frame f's wall

Every drawing in the proposal is a spec into `render()`; nothing here is
drawn by hand per figure, which is what keeps fifty boards one hand.
"""
from __future__ import annotations

import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vocab_board import (  # noqa: E402
    ACCENT, ACCENT2, AMBER, BG, COL_GAP, DIM, DIM2, FG, KIND, LINE, LINE2, OK, PAD,
    PANEL, PANEL2, PORT_H, PURPLE, ROW_GAP, TITLE_H, WARN, Board, E, _w)

# bbox-ui's own ink, translated to the report's dark palette. The port ring is
# amber because that is what the trunk paints (the :5421 captures: golden
# rings, grey cables); the field boards keep the kit's blue so a reader never
# mistakes which column is ours.
RING = AMBER
CABLE = "#a8b0bd"
CABLE_W = 1.8
DOT_R = 4.0
CHIP_H = 14
CORNER_W = 112
ARM_HEAD = 20
ELBOW_R = 6

CHIP_TONE = {
    "": (PANEL, LINE2, DIM),
    "muted": (PANEL, LINE2, DIM),
    "warn": ("#3a2a12", "#8a6a2a", AMBER),
    "bad": ("#3a1a18", "#7a2c28", WARN),
    "ok": ("#14301c", "#2a6a3a", OK),
    "blue": ("#10233a", "#2a4a7a", ACCENT2),
}

MARK_GLYPH = {"break": "⊘", "continue": "↻", "pass": "·", "mut": "≠", "del": "×", "assert": "⊨", "yield": "⇉"}


def _pill(x, y, text, tone="", fs=9.2, mono=True):
    """A TraceBadge / Badge pill centred on (x, y)."""
    fill, stroke, ink = CHIP_TONE.get(tone, CHIP_TONE[""])
    w = _w(text, fs) + 12
    cls = "m" if mono else "s"
    return (f'<rect x="{x-w/2:.1f}" y="{y-CHIP_H/2:.1f}" width="{w:.1f}" height="{CHIP_H}" rx="7" '
            f'fill="{fill}" stroke="{stroke}" stroke-width="1"/>'
            f'<text x="{x:.1f}" y="{y+3.3:.1f}" fill="{ink}" font-size="{fs}" text-anchor="middle" class="{cls}">{E(text)}</text>'), w


def _dot(x, y, state="wired", r=DOT_R):
    """A bbox-ui port dot straddling a wall: hollow ring when unwired, filled
    amber when wired, filled grey when a value is set (`PortState`)."""
    if state == "wired":
        return (f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="{BG}" stroke="{RING}" stroke-width="1.6"/>'
                f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r-1.9:.1f}" fill="{RING}"/>')
    if state == "value":
        return (f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="{BG}" stroke="{RING}" stroke-width="1.6"/>'
                f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r-1.9:.1f}" fill="{DIM2}"/>')
    if state == "derived":
        # the derived port: the same ring, plus the ∂ tick that names it derived
        return (f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="{BG}" stroke="{RING}" stroke-width="1.6"/>'
                f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r-1.9:.1f}" fill="{RING}"/>'
                f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r+2.6:.1f}" fill="none" stroke="{RING}" stroke-width="0.8" stroke-dasharray="1.6 1.6" opacity="0.8"/>')
    if state == "ring":
        # the crossing ring: positional, no id — hollow, grey, thin
        return f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r+0.5:.1f}" fill="{BG}" stroke="{DIM}" stroke-width="1.3"/>'
    if state == "collapsed":
        return (f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r+0.8:.1f}" fill="{BG}" stroke="{RING}" stroke-width="1.6"/>'
                f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r-1.4:.1f}" fill="{RING}"/>')
    if state == "callable":
        # a port shaped for blocks (F8): a rounded square instead of a circle
        s = r * 2
        return f'<rect x="{x-r:.1f}" y="{y-r:.1f}" width="{s:.1f}" height="{s:.1f}" rx="1.5" fill="{BG}" stroke="{RING}" stroke-width="1.6"/>'
    if state == "stream":
        # a port that fires N times (S1 / P3): a doubled ring
        return (f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="{BG}" stroke="{RING}" stroke-width="1.6"/>'
                f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r-2.2:.1f}" fill="none" stroke="{RING}" stroke-width="1.2"/>')
    return f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="{BG}" stroke="{RING}" stroke-width="1.6"/>'


def _chevron(x, y, open_=True):
    if open_:
        return f'<path d="M {x-3.5:.1f} {y-1.5:.1f} L {x:.1f} {y+2:.1f} L {x+3.5:.1f} {y-1.5:.1f}" fill="none" stroke="{DIM}" stroke-width="1.3" stroke-linecap="round"/>'
    return f'<path d="M {x-1.5:.1f} {y-3.5:.1f} L {x+2:.1f} {y:.1f} L {x-1.5:.1f} {y+3.5:.1f}" fill="none" stroke="{DIM}" stroke-width="1.3" stroke-linecap="round"/>'


def _elbow(x1, y1, x2, y2, left_to_right=True, lane_y=None):
    """An orthogonal path with rounded corners. `lane_y` forces a horizontal
    lane (used by the delayed back-cable, which runs under its block)."""
    r = ELBOW_R
    if lane_y is not None:
        # out to the right, down to the lane, left along it, up into the target
        ox, ix = x1 + 14, x2 - 14
        d = [f"M {x1:.1f} {y1:.1f}", f"H {ox-r:.1f}"]
        d.append(f"a {r} {r} 0 0 1 {r} {r}" if lane_y > y1 else f"a {r} {r} 0 0 0 {r} {-r}")
        d.append(f"V {lane_y-r:.1f}" if lane_y > y1 else f"V {lane_y+r:.1f}")
        d.append(f"a {r} {r} 0 0 1 {-r} {r}" if lane_y > y1 else f"a {r} {r} 0 0 0 {-r} {-r}")
        d.append(f"H {ix+r:.1f}")
        d.append(f"a {r} {r} 0 0 1 {-r} {-r}" if lane_y > y2 else f"a {r} {r} 0 0 0 {-r} {r}")
        d.append(f"V {y2+r:.1f}" if lane_y > y2 else f"V {y2-r:.1f}")
        d.append(f"a {r} {r} 0 0 1 {r} {-r}" if lane_y > y2 else f"a {r} {r} 0 0 0 {r} {r}")
        d.append(f"H {x2:.1f}")
        return " ".join(d)
    if x2 < x1 + 8:
        # backwards: step out, run along the midline, step in
        ym = (y1 + y2) / 2
        s1 = 1 if y2 > y1 else -1
        return (f"M {x1:.1f} {y1:.1f} H {x1+12-r:.1f} a {r} {r} 0 0 {1 if s1>0 else 0} {r} {r*s1:.1f} "
                f"V {ym-r*s1:.1f} a {r} {r} 0 0 {1 if s1>0 else 0} {-r} {r*s1:.1f} "
                f"H {x2-12+r:.1f} a {r} {r} 0 0 {0 if s1>0 else 1} {-r} {r*s1:.1f} "
                f"V {y2-r*s1:.1f} a {r} {r} 0 0 {0 if s1>0 else 1} {r} {r*s1:.1f} H {x2:.1f}")
    if abs(y2 - y1) < 1.5:
        return f"M {x1:.1f} {y1:.1f} H {x2:.1f}"
    mx = (x1 + x2) / 2
    down = y2 > y1
    rr = min(r, abs(y2 - y1) / 2, abs(x2 - x1) / 2)
    if x2 > x1:
        return (f"M {x1:.1f} {y1:.1f} H {mx-rr:.1f} "
                f"a {rr:.1f} {rr:.1f} 0 0 {1 if down else 0} {rr:.1f} {rr if down else -rr:.1f} "
                f"V {y2-rr if down else y2+rr:.1f} "
                f"a {rr:.1f} {rr:.1f} 0 0 {0 if down else 1} {rr:.1f} {rr if down else -rr:.1f} "
                f"H {x2:.1f}")
    return f"M {x1:.1f} {y1:.1f} H {x2:.1f}"


def _sample_cubic(p0, p1, p2, p3, n=80):
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        x = u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0]
        y = u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1]
        pts.append((x, y))
    return pts


def _sample_path_elbow(x1, y1, x2, y2, n=80):
    """Points along `_elbow`'s idealised polyline (corners ignored — a 6px
    radius does not move a wall crossing by more than a pixel)."""
    if abs(y2 - y1) < 1.5 or x2 <= x1:
        return [(x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n) for i in range(n + 1)]
    mx = (x1 + x2) / 2
    poly = [(x1, y1), (mx, y1), (mx, y2), (x2, y2)]
    out = []
    for (ax, ay), (bx, by) in zip(poly, poly[1:]):
        for i in range(n // 3 + 1):
            t = i / (n // 3)
            out.append((ax + (bx - ax) * t, ay + (by - ay) * t))
    return out


class GrammarBoard(Board):
    def __init__(self, spec):
        super().__init__(spec)
        self.ghosts = [dict(g) for g in spec.get("ghosts", [])]
        self.notes = [dict(n) for n in spec.get("notes", [])]
        self.breadcrumb = spec.get("breadcrumb")
        self.center = spec.get("center", True)

    # ---------------------------------------------------------------- sizing
    def _size(self, n):
        shape = n.get("shape", "box")
        if shape in ("bbox", "simple", "opaque"):
            ins, outs = n.get("in") or [], n.get("out") or []
            tops = n.get("top") or []
            title = n.get("t", "")
            chips_w = sum(_w(c.get("t", ""), 9.2) + 18 for c in (n.get("chips") or []))
            marks_w = sum(_w(m, 9.2) + 24 for m in (n.get("marks") or []))
            head_w = _w(title, 11) + 22 + chips_w + marks_w
            if shape == "simple":
                w = max(n.get("fw", 0), head_w, 118)
                h = max(n.get("fh", 0), TITLE_H + 34)
                return w, h
            lw = max([_w(p) for p in ins], default=0)
            rw = max([_w(p) for p in outs], default=0)
            rows = max(len(ins), len(outs), 1)
            w = max(n.get("fw", 0), head_w, lw + rw + 44, 104)
            h = TITLE_H + rows * PORT_H + 9
            if n.get("foot"):
                h += 17
            if shape == "opaque":
                h = max(h, TITLE_H + rows * PORT_H + 30)
            h = max(h, n.get("fh", 0))
            return w, h
        return super()._size(n)

    # ---------------------------------------------------------------- layout
    def layout(self):
        # The base layout, minus the vertical centring of columns when a
        # region with ARMS is on the board: arms are rows in source order, and
        # centring a shorter column would float a member out of its arm.
        for nid in self.order:
            n = self.nodes[nid]
            n["w"], n["h"] = self._size(n)
            n["c"] = int(n.get("c", 0))
            n["r"] = int(n.get("r", 0))
        cols = {}
        for nid in self.order:
            cols.setdefault(self.nodes[nid]["c"], []).append(nid)
        for c in cols:
            cols[c].sort(key=lambda i: self.nodes[i]["r"])

        # Per-node padding the frames need, LEFT and RIGHT separately, so a
        # region's corner card (seated left of a loop's members) and its
        # derived-port labels are reserved inside the members' own column and
        # never overlap the column before it.
        padl, padr, padt = {}, {}, {}
        for f in self.frames:
            ms = [m for m in f.get("members", []) if m in self.nodes]
            if not ms:
                continue
            if f.get("style") != "region":
                pad = 38 if (f.get("ltun") or f.get("rtun")) else 22
                for m in ms:
                    padl[m] = max(padl.get(m, 0), pad)
                    padr[m] = max(padr.get(m, 0), pad)
                    padt[m] = max(padt.get(m, 0), pad)
                continue
            left, right = 16, 16
            if f.get("dports"):
                left += max([_w(q if isinstance(q, str) else q.get("t", ""), 9.4) for q in (f["dports"].get("left") or [])], default=0) + 14
                right += max([_w(q if isinstance(q, str) else q.get("t", ""), 9.4) for q in (f["dports"].get("right") or [])], default=0) + 14
            if f.get("corner") and not f.get("arms"):
                left += self._corner_w(f) + 4
            if f.get("arms"):
                left = max(left, 26)
            cmin = min(self.nodes[m]["c"] for m in ms)
            cmax = max(self.nodes[m]["c"] for m in ms)
            for m in ms:
                if self.nodes[m]["c"] == cmin:
                    padl[m] = max(padl.get(m, 0), left)
                if self.nodes[m]["c"] == cmax:
                    padr[m] = max(padr.get(m, 0), right)
        # a region's corner card wants headroom above the first member row
        headroom = {}
        for f in self.frames:
            if f.get("style") == "region" and f.get("corner") and f.get("arms"):
                ch = self._corner_h(f)
                ms = f.get("members", [])
                if ms:
                    top = min(ms, key=lambda i: (self.nodes[i]["r"], self.nodes[i]["c"]))
                    for m in ms:
                        if self.nodes[m]["r"] == self.nodes[top]["r"]:
                            headroom[m] = max(headroom.get(m, 0), ch + 6)
        arm_head = {}
        for f in self.frames:
            for arm in f.get("arms") or []:
                for m in arm.get("members", []):
                    arm_head[m] = ARM_HEAD + 4

        colx, x = {}, PAD
        for c in sorted(cols):
            wmax = max(self.nodes[i]["w"] + padl.get(i, 0) + padr.get(i, 0) for i in cols[c])
            colx[c] = (x, wmax)
            x += wmax + COL_GAP
        total_w = x - COL_GAP + PAD

        heights = {}
        for c in sorted(cols):
            y = PAD + 12
            for nid in cols[c]:
                n = self.nodes[nid]
                y += padt.get(nid, 0) + headroom.get(nid, 0) + arm_head.get(nid, 0)
                n["y"] = y
                y += n["h"] + ROW_GAP + padt.get(nid, 0)
            heights[c] = y - ROW_GAP
        total_h = max(heights.values(), default=120) + PAD
        has_arms = any(f.get("arms") for f in self.frames)
        if self.center and not has_arms:
            for c in sorted(cols):
                shift = (total_h - heights[c]) / 2
                for nid in cols[c]:
                    self.nodes[nid]["y"] += shift
        for c in sorted(cols):
            cx, cw = colx[c]
            for nid in cols[c]:
                n = self.nodes[nid]
                pl, pr = padl.get(nid, 0), padr.get(nid, 0)
                n["x"] = cx + pl + (cw - pl - pr - n["w"]) / 2
        # explicit row alignment: a node may name the node whose y it copies
        for nid in self.order:
            n = self.nodes[nid]
            if n.get("align") in self.nodes:
                n["y"] = self.nodes[n["align"]]["y"]

        for f in self.frames:
            ms = [self.nodes[m] for m in f.get("members", []) if m in self.nodes]
            if not ms:
                self.errors.append(f"frame {f.get('id')} has no resolvable members")
                f["box"] = None
                continue
            region = f.get("style") == "region"
            p = 26 if (f.get("ltun") or f.get("rtun")) else (17 if not region else 16)
            x0 = min(m["x"] for m in ms) - p
            y0 = min(m["y"] for m in ms) - p - (13 if not region else 0)
            x1 = max(m["x"] + m["w"] for m in ms) + p
            y1 = max(m["y"] + m["h"] for m in ms) + p
            if region:
                x0 = min(m["x"] - padl.get(m["id"], 16) for m in ms)
                x1 = max(m["x"] + m["w"] + padr.get(m["id"], 16) for m in ms)
            if region and f.get("corner"):
                if f.get("arms"):
                    y0 = min(m["y"] for m in ms) - self._corner_h(f) - 8 - ARM_HEAD
                    x1 = max(x1, x0 + self._corner_w(f) + 40)
                else:
                    # a loop / group: the corner card sits LEFT of the members,
                    # its top-left on the frame's top-left (the :5421 capture)
                    y0 = min(y0, min(m["y"] for m in ms) - 14)
                    x0 = min(m["x"] for m in ms) - self._corner_w(f) - 18
                    y1 = max(y1, y0 + self._corner_h(f) + 30)
            if region and f.get("face") == "opaque":
                need = self._corner_h(f) + 16 + max(len((f.get("dports") or {}).get("left") or []), len((f.get("dports") or {}).get("right") or [])) * (PORT_H + 6) + (26 if f.get("foot") else 12)
                y1 = max(y1, y0 + need)
            if f.get("minw"):
                x1 = max(x1, x0 + f["minw"])
            if f.get("minh"):
                y1 = max(y1, y0 + f["minh"])
            f["box"] = (x0, y0, x1 - x0, y1 - y0)
            if f.get("tag") and _w(f.get("t", ""), 10) + _w(f["tag"], 9.2) + 26 > x1 - x0:
                self._tag_below = True
            total_w = max(total_w, x1 + PAD)
            total_h = max(total_h, y1 + PAD)
        # arms: bands between consecutive arms' member groups
        for f in self.frames:
            if not f.get("arms") or not f.get("box") or f.get("face") == "opaque":
                continue
            fx, fy, fw, fh = f["box"]
            top = fy + self._corner_h(f) + 2
            bands = []
            for i, arm in enumerate(f["arms"]):
                ms = [self.nodes[m] for m in arm.get("members", []) if m in self.nodes]
                if ms:
                    bottom = max(m["y"] + m["h"] for m in ms) + 12
                else:
                    bottom = top + ARM_HEAD + (arm.get("h", 26))
                bands.append((top, bottom))
                top = bottom
            f["bands"] = bands
            last = bands[-1][1] if bands else fy + fh
            if last > fy + fh - 2:
                f["box"] = (fx, fy, fw, last - fy + 2)
                total_h = max(total_h, last + PAD + 2)
        for g in self.ghosts:
            a = self.nodes.get(g.get("around"))
            if a:
                g["box"] = (a["x"] + g.get("dx", 0), a["y"] + g.get("dy", 0), g["w"], g["h"])
                total_w = max(total_w, g["box"][0] + g["box"][2] + PAD)
                total_h = max(total_h, g["box"][1] + g["box"][3] + PAD)
        self.W = total_w + (0 if not self.breadcrumb else 0)
        self.H = max(total_h, 110) + (16 if getattr(self, "_tag_below", False) else 0)
        if self.breadcrumb:
            # the breadcrumb sits above the board: shift everything down
            dy = 22
            for n in self.nodes.values():
                n["y"] += dy
            for f in self.frames:
                if f.get("box"):
                    x, y, w, h = f["box"]
                    f["box"] = (x, y + dy, w, h)
                if f.get("bands"):
                    f["bands"] = [(a + dy, b + dy) for a, b in f["bands"]]
            for g in self.ghosts:
                if g.get("box"):
                    x, y, w, h = g["box"]
                    g["box"] = (x, y + dy, w, h)
            self.H += dy
        return self

    def _corner_h(self, f):
        c = f.get("corner") or {}
        rows = max(len(c.get("in") or []), len(c.get("out") or []))
        return TITLE_H + (rows * PORT_H + 6 if rows else 0)

    # --------------------------------------------------------------- anchors
    def anchor(self, ref):
        m = re.match(r"^([A-Za-z0-9_-]+)\.(cin|cout|top)\.?(.*)$", ref or "")
        if m:
            nid, side, port = m.group(1), m.group(2), (m.group(3) or "")
            if side == "top":
                n = self.nodes.get(nid)
                if not n:
                    self.errors.append(f"wire to unknown node {nid!r}")
                    return None
                lst = n.get("top") or [""]
                i = lst.index(port) if port in lst else 0
                step = n["w"] / (len(lst) + 1)
                return (n["x"] + step * (i + 1), n["y"], True)
            f = next((f for f in self.frames if f.get("id") == nid), None)
            if not f or not f.get("box") or not f.get("corner"):
                self.errors.append(f"corner port on unknown region {nid!r}")
                return None
            x, y, w, h = f["box"]
            c = f["corner"]
            lst = (c.get("in") if side == "cin" else c.get("out")) or [""]
            i = lst.index(port) if port in lst else 0
            cy = y + TITLE_H + PORT_H * i + PORT_H / 2 + 3
            return ((x if side == "cin" else x + self._corner_w(f)), cy, side == "cin")
        m = re.match(r"^([A-Za-z0-9_-]+)\.(lt|rt)\.?(.*)$", ref or "")
        if m:
            f = next((f for f in self.frames if f.get("id") == m.group(1)), None)
            if f and f.get("dports"):
                x, y, w, h = f["box"]
                side = m.group(2)
                lst = (f["dports"].get("left") if side == "lt" else f["dports"].get("right")) or []
                port = m.group(3) or ""
                names = [p if isinstance(p, str) else p.get("t", "") for p in lst]
                i = names.index(port) if port in names else 0
                cy = self._dport_y(f, i, len(lst))
                return ((x if side == "lt" else x + w), cy, side == "lt")
        a = super().anchor(ref)
        return a

    def _corner_w(self, f):
        c = f.get("corner") or {}
        return max(CORNER_W, _w(c.get("t", ""), 11) + 30 + sum(_w(ch.get("t", ""), 9.2) + 16 for ch in (c.get("chips") or [])))

    def _dport_y(self, f, i, count):
        x, y, w, h = f["box"]
        start = y + self._corner_h(f) + 16 if f.get("corner") else y + 18
        # seats: a derived port may carry `t` (0..1 of the wall) — "same seats"
        return start + i * (PORT_H + 6)

    # ---------------------------------------------------------------- render
    def _wired_state(self, nid, side, port):
        """Which of a node's ports have a cable, so an unwired port draws
        hollow — bbox-ui's own `withWiredState`."""
        want = f"{nid}.{side}.{port}"
        want2 = f"{nid}.{side}" if not port else None
        for w in self.wires:
            for end in (w.get("a"), w.get("b")):
                if end == want or (want2 and end in (want2, want2 + ".")):
                    return True
        return False

    def draw_node(self, n):
        shape = n.get("shape", "box")
        if shape not in ("bbox", "simple", "opaque"):
            return super().draw_node(n)
        x, y, w, h = n["x"], n["y"], n["w"], n["h"]
        t = E(n.get("t", ""))
        o = []
        dim = n.get("dim")
        o.append(f'<g opacity="{0.42 if dim else 1}">')
        rx = 6
        radii = n.get("radii")  # region-corner: square top-right and bottom-left
        if radii == "corner":
            o.append(f'<path d="M {x+rx:.1f} {y:.1f} H {x+w:.1f} V {y+h-rx:.1f} a {rx} {rx} 0 0 1 {-rx} {rx} H {x:.1f} V {y+rx:.1f} a {rx} {rx} 0 0 1 {rx} {-rx} Z" '
                     f'fill="{PANEL2}" stroke="{LINE2}" stroke-width="1.2"/>')
        else:
            dash = ' stroke-dasharray="5 4"' if n.get("dashed") else ""
            o.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{rx}" '
                     f'fill="{PANEL2}" stroke="{LINE2}" stroke-width="1.2"{dash}/>')
        o.append(f'<line x1="{x:.1f}" y1="{y+TITLE_H:.1f}" x2="{x+w:.1f}" y2="{y+TITLE_H:.1f}" stroke="{LINE}" stroke-width="1"/>')
        o.append(f'<text x="{x+9:.1f}" y="{y+14.5:.1f}" fill="{FG}" font-size="11" class="s" font-weight="600">{t}</text>')
        # chips and marks, right-aligned in the header
        cx = x + w - 8
        if n.get("region"):
            # a region wearing a block face: the blackbox toggle in its header
            o.append(f'<rect x="{x+w-16:.1f}" y="{y+6:.1f}" width="9" height="9" rx="1.5" fill="{FG if shape == "opaque" else PANEL2}" stroke="{DIM}" stroke-width="1.1"/>')
            cx -= 16
        for m in reversed(n.get("marks") or []):
            label = f"{MARK_GLYPH.get(m, '')} {m}".strip()
            pw = _w(label, 9.2) + 12
            svg, _ = _pill(cx - pw / 2, y + TITLE_H / 2, label, "muted")
            o.append(svg)
            cx -= pw + 5
        for ch in reversed(n.get("chips") or []):
            pw = _w(ch.get("t", ""), 9.2) + 12
            svg, _ = _pill(cx - pw / 2, y + TITLE_H / 2, ch.get("t", ""), ch.get("tone", ""), mono=ch.get("mono", False))
            o.append(svg)
            cx -= pw + 5
        base = y + TITLE_H + 3
        if shape == "simple":
            cy = y + TITLE_H + (h - TITLE_H) / 2
            nin, nout = n.get("nin", 0), n.get("nout", 0)
            if nin:
                o.append(_dot(x, cy, "collapsed"))
                o.append(f'<text x="{x+9:.1f}" y="{cy+3.4:.1f}" fill="{DIM2}" font-size="9" class="s">+{nin} ports</text>')
            if nout:
                o.append(_dot(x + w, cy, "collapsed"))
                o.append(f'<text x="{x+w-9:.1f}" y="{cy+3.4:.1f}" fill="{DIM2}" font-size="9" text-anchor="end" class="s">+{nout} ports</text>')
            o.append("</g>")
            return "".join(o)
        states = n.get("state") or {}
        pstate = n.get("pstate")
        for i, p in enumerate(n.get("in") or []):
            cy = base + PORT_H * i + PORT_H / 2
            st = states.get(p) or pstate or ("wired" if self._wired_state(n["id"], "in", p) else "empty")
            o.append(_dot(x, cy, st))
            o.append(f'<text x="{x+9:.1f}" y="{cy+3.4:.1f}" fill="{DIM}" font-size="9.4" class="m">{E(p)}</text>')
        for i, p in enumerate(n.get("out") or []):
            cy = base + PORT_H * i + PORT_H / 2
            st = states.get(p) or pstate or ("wired" if self._wired_state(n["id"], "out", p) else "empty")
            o.append(_dot(x + w, cy, st))
            o.append(f'<text x="{x+w-9:.1f}" y="{cy+3.4:.1f}" fill="{DIM}" font-size="9.4" text-anchor="end" class="m">{E(p)}</text>')
        for p, sub in (n.get("psub") or {}).items():
            side_in = p in (n.get("in") or [])
            lst = n.get("in") if side_in else n.get("out")
            i = lst.index(p)
            cy = base + PORT_H * i + PORT_H / 2
            px = x + 9 + _w(p, 9.4) + 6 if side_in else x + w - 9 - _w(p, 9.4) - 6
            o.append(f'<text x="{px:.1f}" y="{cy+3.2:.1f}" fill="{DIM2}" font-size="8" class="s i" text-anchor="{"start" if side_in else "end"}">{E(sub)}</text>')
        tops = n.get("top") or []
        if tops:
            step = w / (len(tops) + 1)
            for i, p in enumerate(tops):
                px = x + step * (i + 1)
                o.append(_dot(px, y, "wired"))
                o.append(f'<text x="{px:.1f}" y="{y-7:.1f}" fill="{WARN}" font-size="8.6" text-anchor="middle" class="m">{E(p)}</text>')
        if shape == "opaque":
            rows = max(len(n.get("in") or []), len(n.get("out") or []), 1)
            ty = base + rows * PORT_H + (y + h - (17 if n.get("foot") else 0) - (base + rows * PORT_H)) / 2 + 3
            o.append(f'<text x="{x+w/2:.1f}" y="{ty:.1f}" fill="{DIM2}" font-size="9.6" text-anchor="middle" class="s i">{E(n.get("hidden", "members hidden"))}</text>')
        if n.get("body"):
            for i, line in enumerate(n["body"]):
                o.append(f'<text x="{x+10:.1f}" y="{base+PORT_H*(len(n.get("in") or [])+i)+10:.1f}" fill="{DIM2}" font-size="8.8" class="m">{E(line)}</text>')
        if n.get("foot"):
            o.append(f'<line x1="{x:.1f}" y1="{y+h-17:.1f}" x2="{x+w:.1f}" y2="{y+h-17:.1f}" stroke="{LINE}" stroke-width="1"/>')
            o.append(f'<text x="{x+9:.1f}" y="{y+h-5.5:.1f}" fill="{DIM2}" font-size="9" class="s">{E(n["foot"])}</text>')
        if n.get("tag"):
            o.append(f'<text x="{x+w/2:.1f}" y="{y+h+11:.1f}" fill="{DIM2}" font-size="8.8" text-anchor="middle" class="s">{E(n["tag"])}</text>')
        o.append("</g>")
        return "".join(o)

    def draw_frame(self, f):
        if f.get("style") != "region":
            return super().draw_frame(f)
        if not f.get("box"):
            return ""
        x, y, w, h = f["box"]
        o = []
        face = f.get("face", "expanded")
        if face == "opaque":
            o.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="8" fill="{PANEL}" stroke="{LINE2}" stroke-width="1.3"/>')
        else:
            o.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="8" fill="none" stroke="{LINE2}" stroke-width="1.3"/>')
        if f.get("toggle", True):
            o.append(f'<rect x="{x+w-16:.1f}" y="{y+6:.1f}" width="9" height="9" rx="1.5" fill="{PANEL2 if face != "opaque" else FG}" stroke="{DIM}" stroke-width="1.1"/>')
        c = f.get("corner")
        if c:
            cw, ch = self._corner_w(f), self._corner_h(f)
            # the corner card: square where it meets the frame (top-right, bottom-left)
            o.append(f'<path d="M {x+8:.1f} {y:.1f} H {x+cw:.1f} V {y+ch-6:.1f} a 6 6 0 0 1 -6 6 H {x:.1f} V {y+8:.1f} a 8 8 0 0 1 8 -8 Z" '
                     f'fill="{PANEL2}" stroke="{LINE2}" stroke-width="1.2"/>')
            o.append(f'<text x="{x+9:.1f}" y="{y+14.5:.1f}" fill="{FG}" font-size="11" class="s" font-weight="600">{E(c.get("t", ""))}</text>')
            cx = x + cw - 6
            for chp in reversed(c.get("chips") or []):
                pw = _w(chp.get("t", ""), 9.2) + 12
                svg, _ = _pill(cx - pw / 2, y + TITLE_H / 2, chp.get("t", ""), chp.get("tone", ""), mono=chp.get("mono", False))
                o.append(svg)
                cx -= pw + 5
            if c.get("in") or c.get("out"):
                o.append(f'<line x1="{x:.1f}" y1="{y+TITLE_H:.1f}" x2="{x+cw:.1f}" y2="{y+TITLE_H:.1f}" stroke="{LINE}" stroke-width="1"/>')
            for i, p in enumerate(c.get("in") or []):
                cy = y + TITLE_H + PORT_H * i + PORT_H / 2 + 3
                o.append(_dot(x, cy, "wired" if self._wired_state(f["id"], "cin", p) else "empty"))
                o.append(f'<text x="{x+9:.1f}" y="{cy+3.4:.1f}" fill="{DIM}" font-size="9.4" class="m">{E(p)}</text>')
            for i, p in enumerate(c.get("out") or []):
                cy = y + TITLE_H + PORT_H * i + PORT_H / 2 + 3
                o.append(_dot(x + cw, cy, "wired" if self._wired_state(f["id"], "cout", p) else "empty"))
                o.append(f'<text x="{x+cw-9:.1f}" y="{cy+3.4:.1f}" fill="{DIM}" font-size="9.4" text-anchor="end" class="m">{E(p)}</text>')
            if f.get("ruled", True) and f.get("arms"):
                # v8 "top rule": the corner card's bottom edge runs the full width
                o.append(f'<line x1="{x+cw:.1f}" y1="{y+ch:.1f}" x2="{x+w:.1f}" y2="{y+ch:.1f}" stroke="{LINE}" stroke-width="1"/>')
        elif f.get("t"):
            o.append(f'<text x="{x+9:.1f}" y="{y+14.5:.1f}" fill="{DIM}" font-size="10" class="s" font-weight="600">{E(f["t"])}</text>')
        for i, arm in enumerate(f.get("arms") or [] if face != "opaque" else []):
            top, bottom = f["bands"][i]
            if i > 0 or not c:
                o.append(f'<line x1="{x:.1f}" y1="{top:.1f}" x2="{x+w:.1f}" y2="{top:.1f}" stroke="{LINE}" stroke-width="{1.6 if arm.get("heavy") else 1}"/>')
            o.append(_chevron(x + 14, top + 11, arm.get("open", True)))
            o.append(f'<text x="{x+24:.1f}" y="{top+14.5:.1f}" fill="{FG if not arm.get("dim") else DIM2}" font-size="10.5" class="s">{E(arm.get("t", ""))}</text>')
            if arm.get("note"):
                o.append(f'<text x="{x+w-10:.1f}" y="{top+14.5:.1f}" fill="{DIM2}" font-size="8.8" text-anchor="end" class="s i">{E(arm["note"])}</text>')
        for side in ("left", "right"):
            lst = (f.get("dports") or {}).get(side) or []
            for i, p in enumerate(lst):
                name = p if isinstance(p, str) else p.get("t", "")
                st = "derived" if (isinstance(p, str) or p.get("derived", True)) else "wired"
                cy = self._dport_y(f, i, len(lst))
                px = x if side == "left" else x + w
                o.append(_dot(px, cy, st))
                if side == "left":
                    o.append(f'<text x="{px+10:.1f}" y="{cy+3.4:.1f}" fill="{DIM}" font-size="9.4" class="m">{E(name)}</text>')
                else:
                    o.append(f'<text x="{px-10:.1f}" y="{cy+3.4:.1f}" fill="{DIM}" font-size="9.4" text-anchor="end" class="m">{E(name)}</text>')
                if not isinstance(p, str) and p.get("sub"):
                    o.append(f'<text x="{px+(10 if side=="left" else -10):.1f}" y="{cy+13:.1f}" fill="{DIM2}" font-size="8" class="s i" text-anchor="{"start" if side=="left" else "end"}">{E(p["sub"])}</text>')
        if f.get("tag"):
            o.append(f'<text x="{x+2:.1f}" y="{y+h+13:.1f}" fill="{DIM2}" font-size="9.2" class="s">{E(f["tag"])}</text>')
        foot = f.get("foot") or (f.get("hidden") if face == "opaque" else None)
        if foot:
            o.append(f'<line x1="{x:.1f}" y1="{y+h-17:.1f}" x2="{x+w:.1f}" y2="{y+h-17:.1f}" stroke="{LINE}" stroke-width="1"/>')
            o.append(f'<text x="{x+9:.1f}" y="{y+h-5.5:.1f}" fill="{DIM2}" font-size="9" class="s i">{E(foot)}</text>')
        return "".join(o)

    def _inside(self, f, nid):
        return nid in (f.get("members") or []) or any(nid in (a.get("members") or []) for a in (f.get("arms") or []))

    def draw_wire(self, wr):
        k = wr.get("k", "data")
        if k not in ("cable", "delayed", "mut", "named"):
            s = super().draw_wire(wr)
            if wr.get("cross"):
                a, b = self.anchor(wr.get("a")), self.anchor(wr.get("b"))
                if a and b:
                    mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
                    s += (f'<circle cx="{mx:.1f}" cy="{my:.1f}" r="9" fill="{BG}" stroke="{WARN}" stroke-width="1.4"/>'
                          f'<path d="M {mx-4:.1f} {my-4:.1f} L {mx+4:.1f} {my+4:.1f} M {mx+4:.1f} {my-4:.1f} L {mx-4:.1f} {my+4:.1f}" stroke="{WARN}" stroke-width="1.6"/>')
            return s
        a, b = self.anchor(wr.get("a")), self.anchor(wr.get("b"))
        if not a or not b:
            return ""
        x1, y1, _ = a
        x2, y2, _ = b
        o = []
        colour = CABLE if k != "mut" else WARN
        dash = ""
        if k == "delayed":
            dash = ' stroke-dasharray="0.1 6" stroke-linecap="round"'
        elif k == "mut":
            dash = ' stroke-dasharray="2 3"'
        if wr.get("lane") is not None or (k == "delayed" and x2 <= x1 + 4):
            lane = wr.get("lane")
            if lane is None:
                src = self.nodes.get(wr["a"].split(".")[0])
                lane = (src["y"] + src["h"] + 16) if src else max(y1, y2) + 30
            d = _elbow(x1, y1, x2, y2, lane_y=lane)
            lx, ly = (x1 + x2) / 2 + 6, lane
        else:
            d = _elbow(x1, y1, x2, y2)
            lx, ly = x1 + (x2 - x1) * 0.5, (y1 + y2) / 2 - (9 if abs(y2 - y1) < 2 else 0)
        o.append(f'<path d="{d}" fill="none" stroke="{colour}" stroke-width="{CABLE_W}"{dash} opacity="0.95"/>')
        if wr.get("t"):
            tone = wr.get("tone", "")
            svg, _ = _pill(lx, ly, wr["t"], tone, mono=wr.get("mono", True))
            o.append(svg)
        if wr.get("end") == "x":
            o.append(f'<path d="M {x2-4:.1f} {y2-4:.1f} L {x2+4:.1f} {y2+4:.1f} M {x2+4:.1f} {y2-4:.1f} L {x2-4:.1f} {y2+4:.1f}" stroke="{FG}" stroke-width="1.6" stroke-linecap="round"/>')
        if wr.get("cross"):
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2
            o.append(f'<circle cx="{mx:.1f}" cy="{my:.1f}" r="9" fill="{BG}" stroke="{WARN}" stroke-width="1.4"/>'
                     f'<path d="M {mx-4:.1f} {my-4:.1f} L {mx+4:.1f} {my+4:.1f} M {mx+4:.1f} {my-4:.1f} L {mx-4:.1f} {my+4:.1f}" stroke="{WARN}" stroke-width="1.6"/>')
        # crossing rings: where this cable enters a region that asked for them
        for f in self.frames:
            if f.get("style") != "region" or not f.get("rings") or not f.get("box"):
                continue
            a_in = self._inside(f, wr["a"].split(".")[0])
            b_in = self._inside(f, wr["b"].split(".")[0])
            if a_in == b_in:
                continue
            fx, fy, fw, fh = f["box"]
            pts = _sample_path_elbow(x1, y1, x2, y2)
            prev = None
            for px, py in pts:
                inside = fx <= px <= fx + fw and fy <= py <= fy + fh
                if prev is not None and inside != prev:
                    o.append(_dot(px, py, "ring"))
                    break
                prev = inside
        return "".join(o)

    def svg(self):
        self.layout()
        body = ""
        for g in self.ghosts:
            if g.get("box"):
                x, y, w, h = g["box"]
                body += (f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="6" fill="none" '
                         f'stroke="{DIM2}" stroke-width="1.2" stroke-dasharray="5 4" opacity="0.8"/>')
                if g.get("t"):
                    body += f'<text x="{x+w-6:.1f}" y="{y+h-6:.1f}" fill="{DIM2}" font-size="8.8" text-anchor="end" class="s i">{E(g["t"])}</text>'
        hidden = set()
        for f in self.frames:
            if f.get("style") == "region" and f.get("face") == "opaque":
                hidden.update(f.get("members") or [])
                for arm in f.get("arms") or []:
                    hidden.update(arm.get("members") or [])
        body += "".join(self.draw_frame(f) for f in self.frames)
        body += "".join(self.draw_wire(w) for w in self.wires if w["a"].split(".")[0] not in hidden and w["b"].split(".")[0] not in hidden)
        body += "".join(self.draw_node(self.nodes[i]) for i in self.order if i not in hidden)
        for note in self.notes:
            body += f'<text x="{note.get("x", PAD):.1f}" y="{note.get("y", self.H-6):.1f}" fill="{note.get("fill", DIM2)}" font-size="{note.get("fs", 9.2)}" class="s i">{E(note.get("t", ""))}</text>'
        if self.breadcrumb:
            bx = PAD
            parts = self.breadcrumb
            for i, part in enumerate(parts):
                last = i == len(parts) - 1
                body += f'<text x="{bx:.1f}" y="{PAD+4:.1f}" fill="{FG if last else DIM2}" font-size="10" class="m" font-weight="{600 if last else 400}">{E(part)}</text>'
                bx += _w(part, 10) + 6
                if not last:
                    body += f'<text x="{bx:.1f}" y="{PAD+4:.1f}" fill="{DIM2}" font-size="10" class="m">›</text>'
                    bx += 12
        return (f'<svg viewBox="0 0 {self.W:.0f} {self.H:.0f}" width="{self.W:.0f}" height="{self.H:.0f}" '
                f'xmlns="http://www.w3.org/2000/svg" class="bd" role="img">{body}</svg>')


def render(spec):
    try:
        b = GrammarBoard(spec)
        s = b.svg()
        return s, b.errors
    except Exception as exc:  # noqa: BLE001
        return "", [f"{type(exc).__name__}: {exc}"]
