#!/usr/bin/env python3
"""A board renderer: declarative node-graph spec in, inline SVG out.

WHY a renderer and not hand-drawn SVG per figure: this report draws the same
171 Python examples in every distinct industry vocabulary — several hundred
figures. Asking a model for raw SVG that many times gives several hundred
slightly different hands and a long tail of broken geometry. Here the model
supplies only WHAT is on the board (nodes, ports, wires, frames, columns) and
this file owns every pixel, so all of them read as one drawn hand — the same
palette and primitives as docs/build_prior_art_visuals_fragments.py.

Spec (JSON per board):
  flow    "lr" (default) or "tb" (Max/MSP-style top-down patching)
  nodes   [{id, t, sub, c, r, shape, in[], out[], xin, xout[], accent, tag}]
  frames  [{id, t, style, members[], ltun[], rtun[], tag}]
  wires   [{a, b, k, t, dash}]   endpoints: "n.out.p" "n.in.p" "n.xin" "n.x.p"
                                            "f.lt.p"  "f.rt.p" (frame tunnels)
  cap     one line under the drawing
"""
from __future__ import annotations

import html
import re

# Palette — the report chrome's CSS variables, so SVG and page are one system.
BG, PANEL, PANEL2 = "#0e0f12", "#15171c", "#1b1e25"
LINE, LINE2 = "#282d38", "#343b49"
FG, DIM, DIM2 = "#e6e8ee", "#9aa3b2", "#6b7383"
ACCENT, ACCENT2 = "#f0883e", "#5aa9f8"
OK, WARN, AMBER, PURPLE = "#3fb950", "#e5534b", "#e8c06a", "#bc8cff"
MONO = "ui-monospace,Menlo,Consolas,monospace"
SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif"

# A wire kind is a colour AND a shape rule. exec is the one that is white and
# thick, because that is precisely what Unreal and Unity do and what LabVIEW,
# Simulink and every dataflow tool in the survey refuse to do.
KIND = {
    "data":  dict(c=ACCENT2, w=1.7, dash=None),
    "exec":  dict(c="#f2f4f8", w=2.6, dash=None),
    "err":   dict(c=WARN, w=1.7, dash="4 3"),
    "item":  dict(c=AMBER, w=1.7, dash=None),
    "geo":   dict(c=OK, w=2.2, dash=None),
    "ctrl":  dict(c=PURPLE, w=1.7, dash="5 3"),
    "fb":    dict(c=AMBER, w=1.7, dash="5 3"),
    "dim":   dict(c=DIM2, w=1.4, dash="3 3"),
}
ACC = {"data": ACCENT2, "exec": "#f2f4f8", "err": WARN, "item": AMBER,
       "geo": OK, "ctrl": PURPLE, "dim": DIM2, "": DIM2}

PAD = 16          # outer margin
COL_GAP = 46      # horizontal gap between columns
ROW_GAP = 22      # vertical gap between rows in a column
ROW_GAP_TB = 54   # top-down patching needs room for inlet/outlet labels
TITLE_H = 21
PORT_H = 15
CH = 6.35         # mono char width at 10.5px
E = html.escape


def _w(text, fs=10.5):
    return len(text) * fs * 0.605


class Board:
    def __init__(self, spec):
        self.flow = spec.get("flow", "lr")
        self.nodes = {n["id"]: dict(n) for n in spec.get("nodes", [])}
        self.order = [n["id"] for n in spec.get("nodes", [])]
        self.frames = [dict(f) for f in spec.get("frames", [])]
        self.wires = [dict(x) for x in spec.get("wires", [])]
        self.cap = spec.get("cap", "")
        self.errors = []

    # ---------------------------------------------------------------- sizing
    def _size(self, n):
        ins, outs = n.get("in") or [], n.get("out") or []
        xout = n.get("xout") or []
        shape = n.get("shape", "box")
        title = n.get("t", "")
        rows = max(len(ins), len(outs) + len(xout), 0)
        if shape in ("pill", "badge", "terminal", "note"):
            w = max(54, _w(title) + 26)
            h = 24 if shape != "note" else 22
            return w, h
        if self.flow == "tb":
            w = max(78, _w(title, 11) + 28, (max(len(ins), len(outs), 1) * 34) + 14)
            return w, 30
        lw = max([_w(p) for p in ins], default=0)
        rw = max([_w(p) for p in outs + xout], default=0)
        w = max(96, _w(title, 11) + 26, lw + rw + 40)
        h = TITLE_H + max(rows, 1) * PORT_H + 7
        if n.get("sub"):
            h += 11
        if n.get("xin") and not ins:
            h = max(h, TITLE_H + PORT_H + 7)
        return w, h

    # ---------------------------------------------------------------- layout
    def layout(self):
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

        # frame padding has to exist BEFORE placement or a wall clips its members
        fpad = {}
        for f in self.frames:
            # A LabVIEW-style wall draws its tunnel labels on the INSIDE of the
            # wall, so a framed node needs clearance or the label lands under it.
            pad = 38 if (f.get("ltun") or f.get("rtun")) else 22
            for m in f.get("members", []):
                fpad[m] = max(fpad.get(m, 0), pad)

        colx, x = {}, PAD
        for c in sorted(cols):
            wmax = max(self.nodes[i]["w"] + fpad.get(i, 0) * 2 for i in cols[c])
            colx[c] = (x, wmax)
            x += wmax + COL_GAP
        total_w = x - COL_GAP + PAD

        heights = {}
        for c in sorted(cols):
            y = PAD + 12
            for nid in cols[c]:
                n = self.nodes[nid]
                y += fpad.get(nid, 0)
                n["y"] = y
                y += n["h"] + (ROW_GAP_TB if self.flow == "tb" else ROW_GAP) + fpad.get(nid, 0)
            heights[c] = y - (ROW_GAP_TB if self.flow == "tb" else ROW_GAP)
        total_h = max(heights.values(), default=120) + PAD

        # centre each column vertically so a 1-node column sits beside a 3-node one
        for c in sorted(cols):
            shift = (total_h - heights[c]) / 2
            for nid in cols[c]:
                self.nodes[nid]["y"] += shift
        for c in sorted(cols):
            cx, cw = colx[c]
            for nid in cols[c]:
                n = self.nodes[nid]
                n["x"] = cx + (cw - n["w"]) / 2

        for f in self.frames:
            ms = [self.nodes[m] for m in f.get("members", []) if m in self.nodes]
            if not ms:
                self.errors.append(f"frame {f.get('id')} has no resolvable members")
                f["box"] = None
                continue
            p = 26 if (f.get("ltun") or f.get("rtun")) else 17
            x0 = min(m["x"] for m in ms) - p
            y0 = min(m["y"] for m in ms) - p - 13
            x1 = max(m["x"] + m["w"] for m in ms) + p
            y1 = max(m["y"] + m["h"] for m in ms) + p
            f["box"] = (x0, y0, x1 - x0, y1 - y0)
        self.W, self.H = total_w, max(total_h, 120)
        return self

    # --------------------------------------------------------------- anchors
    def anchor(self, ref):
        # A single unnamed port may be written "n.out" or "n.out." — both mean index 0.
        m = re.match(r"^([A-Za-z0-9_-]+)\.(in|out|x|xin|lt|rt)\.?(.*)$", ref or "")
        if not m:
            self.errors.append(f"bad endpoint {ref!r}")
            return None
        nid, side, port = m.group(1), m.group(2), (m.group(3) or "")
        if side in ("lt", "rt"):
            f = next((f for f in self.frames if f.get("id") == nid), None)
            if not f or not f.get("box"):
                self.errors.append(f"tunnel on unknown frame {nid!r}")
                return None
            x, y, w, h = f["box"]
            lst = f.get("ltun" if side == "lt" else "rtun") or []
            i = lst.index(port) if port in lst else 0
            step = h / (len(lst) + 1)
            return ((x if side == "lt" else x + w), y + step * (i + 1), side == "lt")
        n = self.nodes.get(nid)
        if not n:
            self.errors.append(f"wire to unknown node {nid!r}")
            return None
        if self.flow == "tb":
            lst = n.get("in") if side in ("in", "xin") else n.get("out")
            lst = lst or [""]
            i = lst.index(port) if port in lst else 0
            step = n["w"] / (len(lst) + 1)
            top = side in ("in", "xin")
            return (n["x"] + step * (i + 1), n["y"] + (0 if top else n["h"]), top)
        shape = n.get("shape", "box")
        if shape in ("pill", "badge", "terminal", "note"):
            left = side in ("in", "xin")
            return (n["x"] + (0 if left else n["w"]), n["y"] + n["h"] / 2, left)
        base = n["y"] + TITLE_H + (11 if n.get("sub") else 0)
        if side == "xin":
            return (n["x"], base + PORT_H / 2, True)
        if side == "x":
            lst = n.get("xout") or []
            i = lst.index(port) if port in lst else 0
            off = len(n.get("out") or [])
            return (n["x"] + n["w"], base + PORT_H * (off + i) + PORT_H / 2, False)
        lst = n.get("in") if side == "in" else (n.get("out") or [])
        lst = lst or [""]
        i = lst.index(port) if port in lst else 0
        left = side == "in"
        return (n["x"] + (0 if left else n["w"]), base + PORT_H * i + PORT_H / 2, left)

    # ---------------------------------------------------------------- render
    def draw_node(self, n):
        x, y, w, h = n["x"], n["y"], n["w"], n["h"]
        shape = n.get("shape", "box")
        acc = ACC.get(n.get("accent", ""), DIM2)
        t = E(n.get("t", ""))
        o = []
        if shape == "pill":
            o.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{h/2:.1f}" '
                     f'fill="#10233a" stroke="{acc}" stroke-width="1.3"/>')
            o.append(f'<text x="{x+w/2:.1f}" y="{y+h/2+3.6:.1f}" fill="{FG}" font-size="10.5" '
                     f'text-anchor="middle" font-family="{MONO}">{t}</text>')
            return "".join(o)
        if shape in ("badge", "terminal"):
            fill = "#2a1a16" if shape == "terminal" else "#221d2f"
            col = WARN if shape == "terminal" else PURPLE
            o.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="5" '
                     f'fill="{fill}" stroke="{col}" stroke-width="1.2"/>')
            o.append(f'<text x="{x+w/2:.1f}" y="{y+h/2+3.6:.1f}" fill="{col}" font-size="10" '
                     f'text-anchor="middle" font-family="{MONO}">{t}</text>')
            return "".join(o)
        if shape == "note":
            o.append(f'<text x="{x:.1f}" y="{y+h/2+3.6:.1f}" fill="{DIM2}" font-size="10" '
                     f'font-family="{SANS}" font-style="italic">{t}</text>')
            return "".join(o)
        if shape == "diamond":
            cx, cy = x + w / 2, y + h / 2
            o.append(f'<path d="M {cx:.1f} {y:.1f} L {x+w:.1f} {cy:.1f} L {cx:.1f} {y+h:.1f} L {x:.1f} {cy:.1f} Z" '
                     f'fill="{PANEL2}" stroke="{acc}" stroke-width="1.3"/>')
            o.append(f'<text x="{cx:.1f}" y="{cy+3.6:.1f}" fill="{FG}" font-size="10" '
                     f'text-anchor="middle" font-family="{MONO}">{t}</text>')
            return "".join(o)

        if self.flow == "tb":
            o.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="3" '
                     f'fill="{PANEL2}" stroke="{LINE2}" stroke-width="1.2"/>')
            o.append(f'<text x="{x+w/2:.1f}" y="{y+h/2+3.8:.1f}" fill="{FG}" font-size="10.8" '
                     f'text-anchor="middle" font-family="{MONO}">{t}</text>')
            for lst, top in ((n.get("in") or [], True), (n.get("out") or [], False)):
                if not lst:
                    continue
                step = w / (len(lst) + 1)
                for i, p in enumerate(lst):
                    cx = x + step * (i + 1)
                    yy = y - 1 if top else y + h - 4
                    o.append(f'<rect x="{cx-6:.1f}" y="{yy:.1f}" width="12" height="5" rx="1" '
                             f'fill="{acc}" opacity="0.9"/>')
                    # WHY unlabelled by default: a Max patch does not label its
                    # inlets or outlets — position IS the name, and drawing the
                    # labels here would misrepresent the vocabulary. Opt in per
                    # node with plabels when the label is the point.
                    if p and n.get("plabels"):
                        ty = y - 7 if top else y + h + 13
                        o.append(f'<text x="{cx:.1f}" y="{ty:.1f}" fill="{DIM2}" font-size="8.4" '
                                 f'text-anchor="middle" font-family="{MONO}">{E(p)}</text>')
            if n.get("tag"):
                o.append(f'<text x="{x+w/2:.1f}" y="{y+h+26:.1f}" fill="{DIM2}" font-size="8.8" '
                         f'text-anchor="middle" font-family="{SANS}">{E(n["tag"])}</text>')
            return "".join(o)

        rx = 5 if shape != "round" else min(h / 2, 14)
        o.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{rx}" '
                 f'fill="{PANEL2}" stroke="{LINE2}" stroke-width="1.2"/>')
        # title band, tinted by the node's accent
        o.append(f'<path d="M {x:.1f} {y+rx:.1f} a {rx} {rx} 0 0 1 {rx} {-rx} h {w-2*rx:.1f} '
                 f'a {rx} {rx} 0 0 1 {rx} {rx} v {TITLE_H-rx:.1f} h {-w:.1f} Z" fill="{acc}" opacity="0.16"/>')
        o.append(f'<line x1="{x:.1f}" y1="{y+TITLE_H:.1f}" x2="{x+w:.1f}" y2="{y+TITLE_H:.1f}" '
                 f'stroke="{LINE2}" stroke-width="1"/>')
        o.append(f'<text x="{x+w/2:.1f}" y="{y+14.5:.1f}" fill="{FG}" font-size="10.8" '
                 f'text-anchor="middle" font-family="{MONO}" font-weight="600">{t}</text>')
        base = y + TITLE_H + (11 if n.get("sub") else 0)
        if n.get("sub"):
            o.append(f'<text x="{x+w/2:.1f}" y="{y+TITLE_H+9:.1f}" fill="{DIM2}" font-size="8.6" '
                     f'text-anchor="middle" font-family="{SANS}">{E(n["sub"])}</text>')
        if n.get("xin"):
            cy = base + PORT_H / 2
            o.append(f'<path d="M {x-5:.1f} {cy-4.5:.1f} L {x+3:.1f} {cy:.1f} L {x-5:.1f} {cy+4.5:.1f} Z" '
                     f'fill="#f2f4f8"/>')
        for i, p in enumerate(n.get("in") or []):
            cy = base + PORT_H * i + PORT_H / 2
            o.append(f'<circle cx="{x:.1f}" cy="{cy:.1f}" r="3.4" fill="{BG}" stroke="{acc}" stroke-width="1.6"/>')
            o.append(f'<text x="{x+8:.1f}" y="{cy+3.2:.1f}" fill="{DIM}" font-size="9.4" '
                     f'font-family="{MONO}">{E(p)}</text>')
        outs = n.get("out") or []
        for i, p in enumerate(outs):
            cy = base + PORT_H * i + PORT_H / 2
            o.append(f'<circle cx="{x+w:.1f}" cy="{cy:.1f}" r="3.4" fill="{BG}" stroke="{acc}" stroke-width="1.6"/>')
            o.append(f'<text x="{x+w-8:.1f}" y="{cy+3.2:.1f}" fill="{DIM}" font-size="9.4" '
                     f'text-anchor="end" font-family="{MONO}">{E(p)}</text>')
        for i, p in enumerate(n.get("xout") or []):
            cy = base + PORT_H * (len(outs) + i) + PORT_H / 2
            o.append(f'<path d="M {x+w-4:.1f} {cy-4.5:.1f} L {x+w+4:.1f} {cy:.1f} L {x+w-4:.1f} {cy+4.5:.1f} Z" '
                     f'fill="#f2f4f8"/>')
            o.append(f'<text x="{x+w-11:.1f}" y="{cy+3.2:.1f}" fill="#cfd4de" font-size="9.4" '
                     f'text-anchor="end" font-family="{MONO}">{E(p)}</text>')
        if n.get("tag"):
            o.append(f'<text x="{x+w/2:.1f}" y="{y+h+10:.1f}" fill="{DIM2}" font-size="8.8" '
                     f'text-anchor="middle" font-family="{SANS}">{E(n["tag"])}</text>')
        return "".join(o)

    def draw_frame(self, f):
        if not f.get("box"):
            return ""
        x, y, w, h = f["box"]
        st = f.get("style", "plain")
        o = []
        if st == "wall":
            o.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="7" '
                     f'fill="none" stroke="{AMBER}" stroke-width="4.5" opacity="0.85"/>')
            o.append(f'<rect x="{x+3:.1f}" y="{y+3:.1f}" width="{w-6:.1f}" height="{h-6:.1f}" rx="5" '
                     f'fill="{AMBER}" opacity="0.045"/>')
        elif st == "paired":
            o.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="9" '
                     f'fill="{OK}" opacity="0.07"/>')
            o.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="9" '
                     f'fill="none" stroke="{OK}" stroke-width="1.4" stroke-dasharray="1 0" opacity="0.5"/>')
        elif st == "subsystem":
            o.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="2" '
                     f'fill="#0c1520" stroke="{ACCENT2}" stroke-width="1.6"/>')
        elif st == "dashed":
            o.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="8" '
                     f'fill="none" stroke="{DIM2}" stroke-width="1.3" stroke-dasharray="6 4"/>')
        else:
            o.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="8" '
                     f'fill="{PANEL}" stroke="{LINE2}" stroke-width="1.3"/>')
        if f.get("t"):
            o.append(f'<text x="{x+9:.1f}" y="{y-5:.1f}" fill="{DIM}" font-size="10" '
                     f'font-family="{MONO}" font-weight="600">{E(f["t"])}</text>')
        if f.get("tag"):
            o.append(f'<text x="{x+w-6:.1f}" y="{y-5:.1f}" fill="{DIM2}" font-size="9.2" '
                     f'text-anchor="end" font-family="{SANS}">{E(f["tag"])}</text>')
        for side, key in (("lt", "ltun"), ("rt", "rtun")):
            lst = f.get(key) or []
            step = h / (len(lst) + 1)
            for i, p in enumerate(lst):
                cy = y + step * (i + 1)
                cx = x if side == "lt" else x + w
                o.append(f'<rect x="{cx-5:.1f}" y="{cy-5:.1f}" width="10" height="10" rx="1.5" '
                         f'fill="{BG}" stroke="{AMBER}" stroke-width="1.8"/>')
                if p:
                    o.append(f'<text x="{cx:.1f}" y="{cy-9:.1f}" fill="{DIM}" font-size="8.8" '
                             f'text-anchor="middle" font-family="{MONO}">{E(p)}</text>')
        return "".join(o)

    def draw_wire(self, wr):
        a, b = self.anchor(wr.get("a")), self.anchor(wr.get("b"))
        if not a or not b:
            return ""
        k = KIND.get(wr.get("k", "data"), KIND["data"])
        x1, y1, _ = a
        x2, y2, _ = b
        dash = f' stroke-dasharray="{wr.get("dashval") or k["dash"]}"' if (wr.get("dash") or k["dash"]) else ""
        mk = {"exec": "wX", "err": "wE", "item": "wI", "geo": "wG",
              "ctrl": "wC", "fb": "wF", "dim": "wD"}.get(wr.get("k", "data"), "wA")
        if self.flow == "tb":
            my = (y1 + y2) / 2
            d = f"M {x1:.1f} {y1:.1f} C {x1:.1f} {my:.1f} {x2:.1f} {my:.1f} {x2:.1f} {y2:.1f}"
        elif wr.get("k") == "fb" or x2 < x1 - 4:
            lift = max(abs(y2 - y1) * 0.5, 34)
            d = (f"M {x1:.1f} {y1:.1f} C {x1+30:.1f} {y1-lift:.1f} "
                 f"{x2-30:.1f} {y2-lift:.1f} {x2:.1f} {y2:.1f}")
        else:
            dx = max(22, abs(x2 - x1) * 0.45)
            d = (f"M {x1:.1f} {y1:.1f} C {x1+dx:.1f} {y1:.1f} "
                 f"{x2-dx:.1f} {y2:.1f} {x2:.1f} {y2:.1f}")
        o = [f'<path d="{d}" fill="none" stroke="{k["c"]}" stroke-width="{k["w"]}"{dash} '
             f'marker-end="url(#{mk})" opacity="0.95"/>']
        if wr.get("t"):
            # 0.42 along, not the midpoint: a midpoint label lands on top of a
            # frame's tunnel label when the wire terminates on a wall.
            mx, my = x1 + (x2 - x1) * 0.42, (y1 + y2) / 2 - 8
            o.append(f'<text x="{mx:.1f}" y="{my:.1f}" fill="{DIM}" font-size="9" '
                     f'text-anchor="middle" font-family="{MONO}">{E(wr["t"])}</text>')
        return "".join(o)

    def svg(self):
        self.layout()
        body = "".join(self.draw_frame(f) for f in self.frames)
        body += "".join(self.draw_wire(w) for w in self.wires)
        body += "".join(self.draw_node(self.nodes[i]) for i in self.order)
        defs = "".join(
            f'<marker id="{i}" viewBox="0 0 10 10" refX="7.4" refY="5" markerWidth="5.4" '
            f'markerHeight="5.4" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="{c}"/></marker>'
            for i, c in (("wA", ACCENT2), ("wX", "#f2f4f8"), ("wE", WARN), ("wI", AMBER),
                         ("wG", OK), ("wC", PURPLE), ("wF", AMBER), ("wD", DIM2)))
        return (f'<svg viewBox="0 0 {self.W:.0f} {self.H:.0f}" width="{self.W:.0f}" height="{self.H:.0f}" '
                f'xmlns="http://www.w3.org/2000/svg" class="bd" role="img">'
                f'<defs>{defs}</defs>{body}</svg>')


def render(spec):
    """Returns (svg_string, errors). Never raises on a malformed spec —
    a bad board must show up as a listed error, not a crashed build."""
    try:
        b = Board(spec)
        s = b.svg()
        return s, b.errors
    except Exception as exc:  # noqa: BLE001
        return "", [f"{type(exc).__name__}: {exc}"]
