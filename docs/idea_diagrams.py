#!/usr/bin/env python3
"""
Diagram templates for the 100-ideas report.

WHY a template library rather than 100 bespoke drawings: the ideas repeat a
small number of underlying SHAPES — a before/after, a block with ports, a
pipeline, a stack of planes, a small matrix, a state ladder. Parameterising
those means every idea gets a diagram that actually says something, at a scale
where hand-authoring 100 of them would mean 100 decorative rectangles instead.
Ideas whose shape is genuinely one-off still get a hand-authored SVG; these
are the workhorses, not a ceiling.

Palette matches the report's dark theme so the diagrams read as part of the page.
"""
from __future__ import annotations

# palette ------------------------------------------------------------------
BG     = "#0b0d10"
PANEL  = "#15181e"
PANEL2 = "#1b1f27"
LINE   = "#39404e"
LINE2  = "#4a5364"
DIM    = "#6b7383"
DIM2   = "#8b94a4"
FG     = "#d7dbe3"
BLUE   = "#5aa9f8"
GREEN  = "#3fb950"
ORANGE = "#f0883e"
RED    = "#e5534b"
YELLOW = "#e8c06a"
PURPLE = "#bc8cff"

MONO = "ui-monospace,Menlo,Consolas,monospace"


def svg(w: int, h: int, body: str, label: str = "") -> str:
    return (f'<svg viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg" role="img" '
            f'aria-label="{label}"><defs>'
            f'<marker id="a-{w}{h}" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">'
            f'<path d="M0,0 L6,3 L0,6 z" fill="{DIM2}"/></marker>'
            f'<marker id="ab-{w}{h}" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">'
            f'<path d="M0,0 L6,3 L0,6 z" fill="{BLUE}"/></marker>'
            f'<marker id="ao-{w}{h}" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">'
            f'<path d="M0,0 L6,3 L0,6 z" fill="{ORANGE}"/></marker>'
            f'</defs>{body}</svg>')


def txt(x, y, s, fill=DIM2, size=10, anchor="start", weight="400", mono=False) -> str:
    f = f' font-family="{MONO}"' if mono else ""
    return (f'<text x="{x}" y="{y}" fill="{fill}" font-size="{size}" text-anchor="{anchor}" '
            f'font-weight="{weight}"{f}>{s}</text>')


def box(x, y, w, h, fill=PANEL, stroke=LINE, rx=6, dash="") -> str:
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}"{d}/>'


def dot(cx, cy, r=4.5, fill=BLUE, ring=False) -> str:
    if ring:
        return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{fill}" stroke-width="2"/>'
                f'<circle cx="{cx}" cy="{cy}" r="{r*0.36:.1f}" fill="{fill}"/>')
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}" stroke="{BG}" stroke-width="1.2"/>'


def wire(x1, y1, x2, y2, colour=BLUE, w=1.5, dash="", arrow=True, key="") -> str:
    mx = (x1 + x2) / 2
    d = f' stroke-dasharray="{dash}"' if dash else ""
    m = f' marker-end="url(#ab-{key})"' if arrow else ""
    return (f'<path d="M{x1},{y1} C{mx},{y1} {mx},{y2} {x2},{y2}" fill="none" '
            f'stroke="{colour}" stroke-width="{w}"{d}{m}/>')


# --- templates -------------------------------------------------------------
def t_node(x, y, w, h, title, ins=(), outs=(), accent=LINE2, fill=PANEL,
           title_fill=FG, badge="", dashed=False) -> str:
    """A block with named ports down its left and right walls."""
    s = box(x, y, w, h, fill, accent, dash="4 3" if dashed else "")
    s += f'<rect x="{x}" y="{y}" width="{w}" height="20" rx="6" fill="{PANEL2}"/>'
    s += txt(x + 9, y + 14, title, FG if title_fill == FG else title_fill, 10, weight="600")
    if badge:
        s += txt(x + w - 8, y + 14, badge, DIM, 8.5, anchor="end", mono=True)
    for i, (lab, col) in enumerate(ins):
        cy = y + 34 + i * 17
        s += dot(x, cy, 4.2, col, ring=True) + txt(x + 10, cy + 3.5, lab, DIM2, 9.5)
    for i, (lab, col) in enumerate(outs):
        cy = y + 34 + i * 17
        s += dot(x + w, cy, 4.2, col, ring=True) + txt(x + w - 10, cy + 3.5, lab, DIM2, 9.5, anchor="end")
    return s


def t_before_after(w, h, left, right, lab_l="before", lab_r="after", split=0.46) -> str:
    """Two sunken panels with an arrow between them."""
    lw = int(w * split)
    rx = w - lw
    s = box(0, 14, lw, h - 30, BG, LINE, rx=8)
    s += box(w - rx, 14, rx, h - 30, BG, LINE, rx=8)
    s += txt(6, 9, lab_l, DIM, 9, weight="700")
    s += txt(w - rx + 6, 9, lab_r, DIM, 9, weight="700")
    s += (f'<path d="M{lw + 8},{h/2} H{w - rx - 8}" stroke="{DIM}" stroke-width="1.4" '
          f'marker-end="url(#a-{w}{h})"/>')
    s += f'<g transform="translate(0,14)">{left}</g>'
    s += f'<g transform="translate({w - rx},14)">{right}</g>'
    return s


def t_chain(w, h, steps, note="", colour=BLUE) -> str:
    """step → step → step, evenly spaced."""
    n = len(steps)
    bw = min(128, (w - 24 - (n - 1) * 34) / n)
    gap = (w - 24 - n * bw) / max(1, n - 1)
    y = 18 if note else (h - 34) / 2
    s = ""
    for i, st in enumerate(steps):
        x = 12 + i * (bw + gap)
        accent = st.get("accent", LINE2)
        s += box(x, y, bw, 34, st.get("fill", PANEL), accent)
        s += txt(x + bw / 2, y + 16, st["t"], FG, 10, anchor="middle", weight="600")
        if st.get("sub"):
            s += txt(x + bw / 2, y + 28, st["sub"], DIM, 8.5, anchor="middle", mono=True)
        if i < n - 1:
            s += (f'<path d="M{x + bw + 5},{y + 17} H{x + bw + gap - 5}" stroke="{colour}" '
                  f'stroke-width="1.5" marker-end="url(#ab-{w}{h})"/>')
    if note:
        s += txt(12, h - 8, note, DIM, 9.5, mono=True)
    return s


def t_stack(w, h, layers, active=0, note="", inner="") -> str:
    """A breadcrumb over one visible plane, with the others as ghosts behind it.

    WHY not a literal z-stack of equal cards: drawn that way the labels collide and
    the *active* plane is the one you cannot read. The point of the diagram is
    "exactly one plane is live, and it has its own frame" — so the live one is
    solid and in front, and the rest are outlines plus a breadcrumb."""
    s = ""
    x = 12
    for i, name in enumerate(layers):
        on = i == active
        s += txt(x, 13, name, ORANGE if on else BLUE, 9.5, mono=True, weight="700" if on else "400")
        x += len(name) * 5.6 + 8
        if i < len(layers) - 1:
            s += txt(x - 4, 13, "\u203a", LINE2, 9.5)
            x += 8
    ghosts = len(layers) - 1
    for g in range(ghosts, 0, -1):
        s += box(12 + g * 9, 22 + g * 7, w - 30 - g * 9, h - 46 - g * 7, "none", LINE, rx=8)
    s += box(12, 22, w - 30, h - 46, PANEL, ORANGE, rx=8)
    if inner:
        s += f'<g transform="translate(12,22)">{inner}</g>'
    else:
        s += txt(26, 44, layers[active], FG, 11, weight="700")
        s += txt(26, 60, "own frame from (0,0)", DIM, 9, mono=True)
    s += txt(w - 8, h - 8, note or "exactly one plane is live", DIM, 9, anchor="end", mono=True)
    return s


def t_grid(w, h, cols, rows, cells, colw=None) -> str:
    """A small matrix. cells maps (row, col) -> one of 'y' | 'p' | 'n'."""
    lw = colw or 96
    cw = (w - lw - 8) / len(cols)
    rh = min(20, (h - 26) / max(1, len(rows)))
    s = ""
    for c, name in enumerate(cols):
        s += txt(lw + cw * (c + 0.5), 12, name, DIM, 8.5, anchor="middle", weight="700")
    for r, name in enumerate(rows):
        y = 26 + r * rh
        last = r == len(rows) - 1
        s += txt(2, y + rh * 0.7, name, RED if last else FG, 9.5, weight="600" if last else "400")
        s += f'<line x1="0" y1="{y + rh}" x2="{w}" y2="{y + rh}" stroke="#1e222a"/>'
        for c in range(len(cols)):
            mark = cells.get((r, c), "n")
            cx, cy = lw + cw * (c + 0.5), y + rh * 0.5
            if mark == "y":
                s += f'<circle cx="{cx}" cy="{cy}" r="4.4" fill="{GREEN}"/>'
            elif mark == "p":
                s += (f'<circle cx="{cx}" cy="{cy}" r="4.4" fill="none" stroke="{YELLOW}" stroke-width="1.6"/>'
                      f'<path d="M{cx},{cy - 4.4} A4.4,4.4 0 0,1 {cx},{cy + 4.4} Z" fill="{YELLOW}"/>')
            else:
                s += (f'<circle cx="{cx}" cy="{cy}" r="4.2" fill="none" '
                      f'stroke="{"#7a3b34" if last else LINE}" stroke-width="1.4"/>')
    return s


def t_states(w, h, states, note="") -> str:
    """A ladder of labelled chips, optionally with one highlighted."""
    n = len(states)
    cw = (w - 20 - (n - 1) * 12) / n
    y = (h - 42) / 2
    s = ""
    for i, st in enumerate(states):
        x = 10 + i * (cw + 12)
        on = st.get("on")
        s += box(x, y, cw, 30, PANEL if on else BG, st.get("accent", ORANGE if on else LINE), rx=15)
        s += txt(x + cw / 2, y + 19, st["t"], FG if on else DIM2, 10, anchor="middle",
                 weight="700" if on else "400")
        if i < n - 1:
            s += (f'<path d="M{x + cw + 1},{y + 15} H{x + cw + 10}" stroke="{DIM}" stroke-width="1.2" '
                  f'marker-end="url(#a-{w}{h})"/>')
    if note:
        s += txt(10, h - 6, note, DIM, 9.5, mono=True)
    return s


def t_tree(w, h, root, children, note="", child_ports=False) -> str:
    """A parent box containing child boxes — nesting, membership, containment."""
    s = box(14, 14, w - 28, h - 34, PANEL, LINE2, rx=9)
    s += f'<rect x="14" y="14" width="{w - 28}" height="20" rx="9" fill="{PANEL2}"/>'
    s += txt(26, 28, root, FG, 10.5, weight="600")
    n = len(children)
    cw = (w - 60 - (n - 1) * 14) / max(1, n)
    for i, c in enumerate(children):
        x = 30 + i * (cw + 14)
        s += box(x, 46, cw, 30, PANEL2, c.get("accent", LINE), rx=6)
        s += txt(x + cw / 2, 65, c["t"], DIM2, 9.5, anchor="middle")
        if child_ports:
            s += dot(x, 61, 3.4, BLUE) + dot(x + cw, 61, 3.4, GREEN)
    if note:
        s += txt(14, h - 6, note, DIM, 9.5, mono=True)
    return s


def t_wires(w, h, variants) -> str:
    """Two or three mini routings side by side — for anything about edge shape."""
    n = len(variants)
    pw = (w - (n - 1) * 12) / n
    s = ""
    for i, v in enumerate(variants):
        x = i * (pw + 12)
        s += box(x, 12, pw, h - 34, BG, LINE, rx=7)
        s += txt(x + 6, 8, v["t"], DIM, 9, weight="700")
        s += f'<g transform="translate({x},12)">{v["body"]}</g>'
        if v.get("note"):
            s += txt(x + 6, h - 6, v["note"], DIM, 8.5, mono=True)
    return s


def t_split(w, h, parts, caption="") -> str:
    """A proportion bar — for anything about distribution or budget."""
    total = sum(p["n"] for p in parts) or 1
    x = 0
    s = ""
    for p in parts:
        pw = (w) * p["n"] / total
        s += f'<rect x="{x:.1f}" y="16" width="{pw:.1f}" height="26" fill="{p["c"]}"/>'
        if pw > 26:
            s += txt(x + pw / 2, 33, str(p["n"]), BG, 11, anchor="middle", weight="800")
        x += pw
    s += f'<rect x="0" y="16" width="{w}" height="26" rx="6" fill="none" stroke="{LINE}"/>'
    kx = 0
    for p in parts:
        s += f'<rect x="{kx}" y="52" width="8" height="8" rx="2" fill="{p["c"]}"/>'
        s += txt(kx + 13, 60, p["t"], DIM2, 9)
        kx += 12 + len(p["t"]) * 5.4 + 16
    if caption:
        s += txt(0, 10, caption, DIM, 9, weight="700")
    return s


def t_menu(w, h, title, items, highlight=-1, footer="") -> str:
    """A palette / dropdown / search surface."""
    mw = min(230, w - 20)
    s = box(10, 12, mw, h - 30, PANEL, LINE2, rx=8)
    s += f'<rect x="10" y="12" width="{mw}" height="24" rx="8" fill="{PANEL2}"/>'
    s += txt(22, 28, title, DIM2, 9.5, mono=True)
    for i, it in enumerate(items):
        y = 42 + i * 19
        if i == highlight:
            s += f'<rect x="14" y="{y - 12}" width="{mw - 8}" height="18" rx="4" fill="#1d3c57"/>'
        s += txt(22, y, it, FG if i == highlight else DIM2, 9.5)
    if footer:
        s += txt(mw + 22, h / 2, footer, DIM, 9.5, mono=True)
    return s


def t_callout(w, h, body, label, lx, ly, tx, ty, colour=ORANGE) -> str:
    """Any shape plus one annotated pointer."""
    s = body
    s += (f'<path d="M{lx},{ly} L{tx},{ty}" stroke="{colour}" stroke-width="1.2" '
          f'stroke-dasharray="3 2" marker-end="url(#ao-{w}{h})"/>')
    s += txt(lx, ly - 5, label, colour, 9.5, weight="700", mono=True)
    return s


def t_registry(w, h, slot, entries, adding="+ register yours", note="") -> str:
    """A named-function registry — the open-vs-closed-set shape that recurs a lot."""
    s = box(10, 14, 128, h - 34, PANEL2, LINE2, rx=8)
    s += txt(22, 32, slot, ORANGE, 10, mono=True, weight="700")
    s += txt(22, 46, "registry", DIM, 8.5, mono=True)
    y = 16
    for i, e in enumerate(entries):
        s += box(168, y, w - 190, 20, PANEL, LINE, rx=5)
        s += txt(178, y + 14, e, DIM2, 9.5, mono=True)
        s += f'<path d="M138,{h/2 - 10} H162" stroke="{LINE2}" stroke-width="1"/>' if i == 0 else ""
        y += 24
    s += box(168, y, w - 190, 20, "none", ORANGE, rx=5, dash="4 3")
    s += txt(178, y + 14, adding, ORANGE, 9.5, mono=True)
    if note:
        s += txt(10, h - 6, note, DIM, 9, mono=True)
    return s


def t_views(w, h, views, note="") -> str:
    """One record, N views of it — each view carrying its own state."""
    s = box(10, 14, 108, h - 36, PANEL2, PURPLE, rx=8)
    s += txt(64, 40, "one graph", FG, 10, anchor="middle", weight="700")
    s += txt(64, 55, "one record", DIM, 8.5, anchor="middle", mono=True)
    n = len(views)
    vw = (w - 160 - (n - 1) * 12) / n
    for i, v in enumerate(views):
        x = 150 + i * (vw + 12)
        s += box(x, 14, vw, h - 36, PANEL, LINE2, rx=8)
        s += txt(x + vw / 2, 32, v["t"], FG, 9.5, anchor="middle", weight="600")
        for j, row in enumerate(v.get("rows", [])):
            yy = 44 + j * 15
            folded = row.startswith("!")
            s += box(x + 10, yy, vw - 20, 11, PANEL2 if folded else BG,
                     ORANGE if folded else LINE, rx=3)
            s += txt(x + 16, yy + 9, row.lstrip("!"), ORANGE if folded else DIM, 8, mono=True)
        s += f'<path d="M118,{h/2 - 10} C134,{h/2 - 10} 134,{h/2 - 10} {x},{h/2 - 10}" fill="none" stroke="{PURPLE}" stroke-width="1.1" stroke-dasharray="3 2"/>'
    if note:
        s += txt(10, h - 6, note, DIM, 9, mono=True)
    return s


def t_polarity(w, h, pairs, note="") -> str:
    """Port polarity / conjugation / obligation — a plug-and-socket row."""
    n = len(pairs)
    cw = (w - 24) / n
    s = ""
    for i, p in enumerate(pairs):
        x = 12 + i * cw
        s += txt(x + cw / 2, 14, p["t"], DIM, 9, anchor="middle", weight="700")
        cy = h / 2
        s += box(x + 6, cy - 18, cw / 2 - 20, 36, PANEL, LINE2, rx=6)
        s += box(x + cw / 2 + 14, cy - 18, cw / 2 - 20, 36, PANEL, LINE2, rx=6)
        lc, rc = p.get("lc", BLUE), p.get("rc", GREEN)
        s += dot(x + cw / 2 - 14, cy, 4.6, lc, ring=True)
        s += dot(x + cw / 2 + 14, cy, 4.6, rc, ring=True)
        ok = p.get("ok", True)
        s += (f'<path d="M{x + cw/2 - 9},{cy} H{x + cw/2 + 9}" stroke="{GREEN if ok else RED}" '
              f'stroke-width="1.6"{"" if ok else ' stroke-dasharray="2 2"'}/>')
        if not ok:
            s += txt(x + cw / 2, cy + 26, p.get("why", "refused"), RED, 8.5, anchor="middle", mono=True)
        elif p.get("why"):
            s += txt(x + cw / 2, cy + 26, p["why"], GREEN, 8.5, anchor="middle", mono=True)
    if note:
        s += txt(12, h - 6, note, DIM, 9, mono=True)
    return s


def t_bus(w, h, n_in=4, note="") -> str:
    """N wires merging into one trunk and fanning back out."""
    s = ""
    for i in range(n_in):
        y = 20 + i * ((h - 56) / max(1, n_in - 1))
        s += f'<path d="M14,{y:.0f} C70,{y:.0f} 90,{h/2:.0f} 150,{h/2:.0f}" fill="none" stroke="{BLUE}" stroke-width="1.3" opacity="0.8"/>'
        s += dot(14, y, 3.6, BLUE)
    s += f'<path d="M150,{h/2} H{w - 150}" stroke="{ORANGE}" stroke-width="4" stroke-linecap="round"/>'
    s += txt(w / 2, h / 2 - 12, "one trunk", ORANGE, 9.5, anchor="middle", mono=True, weight="700")
    for i in range(n_in):
        y = 20 + i * ((h - 56) / max(1, n_in - 1))
        s += f'<path d="M{w - 150},{h/2:.0f} C{w - 90},{h/2:.0f} {w - 70},{y:.0f} {w - 14},{y:.0f}" fill="none" stroke="{GREEN}" stroke-width="1.3" opacity="0.8"/>'
        s += dot(w - 14, y, 3.6, GREEN)
    if note:
        s += txt(14, h - 6, note, DIM, 9, mono=True)
    return s


# ---------------------------------------------------------------------------
# The fallback schematic. Ideas 41-100 get this rather than a bespoke drawing:
# a category-shaped diagram labelled with the idea's OWN identifiers, pulled
# from its text. Less information than a hand drawing, but it is still about
# this idea specifically — which a decorative box would not be.
# ---------------------------------------------------------------------------
def t_concept(w, h, category, keys, note="") -> str:
    k = (list(keys) + ["", "", ""])[:3]
    if category == "domain-model":
        s = box(14, 16, w - 28, h - 34, PANEL, LINE2, rx=9)
        s += f'<rect x="14" y="16" width="{w - 28}" height="20" rx="9" fill="{PANEL2}"/>'
        s += txt(26, 30, "the record", DIM2, 9.5, mono=True, weight="700")
        for i, f in enumerate([x for x in k if x][:3]):
            y = 46 + i * 22
            new = i == 0
            s += box(26, y, w - 52, 18, "#2a1d10" if new else BG, ORANGE if new else LINE, rx=4)
            s += txt(36, y + 13, f, ORANGE if new else DIM2, 9.5, mono=True)
            if new:
                s += txt(w - 34, y + 13, "new", ORANGE, 8.5, anchor="end", mono=True, weight="700")
    elif category == "algorithm":
        s = t_chain(w, h - 14, [{"t": "scene"},
                                {"t": k[0] or "fn", "accent": ORANGE, "fill": "#2a1d10"},
                                {"t": k[1] or "result"}])
    elif category == "diagnostics":
        s = box(20, 24, 176, h - 54, PANEL, LINE2, rx=8)
        s += txt(32, 44, k[0] or "node", FG, 10, weight="600")
        s += f'<circle cx="196" cy="34" r="8" fill="{YELLOW}"/>'
        s += txt(196, 38, "!", BG, 11, anchor="middle", weight="800")
        s += box(226, 30, w - 252, 26, "#2a2412", YELLOW, rx=6)
        s += txt(238, 48, k[1] or "the signal you already compute", YELLOW, 9.5, mono=True)
        s += txt(226, h - 22, note or "surfaced, not recomputed", DIM, 9, mono=True)
        return s
    elif category == "ui":
        s = t_menu(w, h, k[0] or "surface", [x for x in k[1:] if x] or ["…"], highlight=0)
    elif category == "interaction":
        s = box(20, 30, 120, 40, PANEL, LINE2, rx=7) + txt(80, 55, k[0] or "a", DIM2, 10, anchor="middle")
        s += box(w - 140, 30, 120, 40, PANEL, LINE2, rx=7) + txt(w - 80, 55, k[1] or "b", DIM2, 10, anchor="middle")
        s += (f'<path d="M150,50 C{w/2 - 40},{h - 30} {w/2 + 40},{h - 30} {w - 150},50" fill="none" '
              f'stroke="{ORANGE}" stroke-width="2.2" stroke-linecap="round" '
              f'marker-end="url(#ao-{w}{h})"/>')
        s += txt(w / 2, h - 16, note or "one gesture", ORANGE, 9.5, anchor="middle", mono=True, weight="700")
        return s
    else:  # library-structure
        n = len([x for x in k if x]) or 2
        cw = (w - 40 - (n - 1) * 14) / n
        s = ""
        for i, f in enumerate([x for x in k if x][:n]):
            x = 20 + i * (cw + 14)
            s += box(x, 24, cw, h - 56, PANEL, ORANGE if i == 0 else LINE2, rx=8)
            s += txt(x + cw / 2, 50, f, ORANGE if i == 0 else DIM2, 9.5, anchor="middle", mono=True)
            if i:
                s += f'<path d="M{x - 12},{h/2 - 6} H{x - 2}" stroke="{LINE2}" stroke-width="1.2"/>'
    if note:
        s += txt(20, h - 8, note, DIM, 9, mono=True)
    return s


def t_glyph(category: str, w=150, h=66) -> str:
    """The tail's mini-diagram. At 150x66 a labelled schematic is illegible —
    measured: the text overlapped itself. So the tail gets a clean category
    glyph instead, and lets the words carry the idea."""
    c = {"domain-model": PURPLE, "algorithm": BLUE, "diagnostics": YELLOW,
         "ui": GREEN, "interaction": ORANGE, "library-structure": RED}.get(category, DIM2)
    if category == "domain-model":
        s = box(30, 12, 90, 42, PANEL, LINE, rx=5)
        for i in range(3):
            y = 18 + i * 12
            s += box(36, y, 78, 8, "#2a1d10" if i == 0 else BG, c if i == 0 else LINE, rx=2)
    elif category == "algorithm":
        s = ""
        for i in range(3):
            x = 26 + i * 38
            s += box(x, 24, 26, 18, PANEL, c if i == 1 else LINE, rx=4)
            if i < 2:
                s += f'<path d="M{x + 26},33 H{x + 38}" stroke="{c}" stroke-width="1.4"/>'
    elif category == "diagnostics":
        s = box(26, 18, 74, 30, PANEL, LINE, rx=5)
        s += f'<circle cx="104" cy="22" r="9" fill="{c}"/>'
        s += txt(104, 26, "!", BG, 12, anchor="middle", weight="800")
    elif category == "ui":
        s = box(30, 12, 90, 42, PANEL, LINE, rx=5)
        s += f'<rect x="30" y="12" width="90" height="11" rx="5" fill="{PANEL2}"/>'
        s += box(36, 28, 78, 8, "#12301c", c, rx=2)
        s += box(36, 40, 54, 8, BG, LINE, rx=2)
    elif category == "interaction":
        s = box(20, 24, 34, 18, PANEL, LINE, rx=4) + box(96, 24, 34, 18, PANEL, LINE, rx=4)
        s += (f'<path d="M54,33 C70,8 80,8 96,33" fill="none" stroke="{c}" stroke-width="2" '
              f'stroke-linecap="round"/>')
    else:
        s = box(24, 18, 44, 30, PANEL, c, rx=5) + box(82, 18, 44, 30, PANEL, LINE, rx=5)
        s += f'<path d="M68,33 H82" stroke="{LINE2}" stroke-width="1.4"/>'
    return svg(w, h, s, category)
