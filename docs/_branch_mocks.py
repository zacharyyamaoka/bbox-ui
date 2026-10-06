"""The mock drawings for the truthful-branching report."""
from __future__ import annotations
from _branch_svg import *  # noqa

CORNER_W = 160          # REGION_CORNER_WIDTH_PX, plan §3.3
HEAD_THIN = 34
HEAD_FULL = 62
TAB_H = 34


def region(x, y, w, arms, *, head="Branch", head_h=HEAD_THIN, head_ports=(),
           tabs=True, corner_card=True, frame_stroke=FRAME, head_note=None):
    """Draw a region frame, its corner/head card, and a stack of arm rows.

    `arms` is a list of dicts:
      title      str      the arm's header text
      h          int      body height
      port       None | ("hollow"|"solid")   the arm's own operand dot
      captures   [str]    names the pattern binds INTO the body
      body       [str]    extra svg strings, drawn translated into the body
      fade       bool
      tab_w      int
    """
    out = []
    hy = y + head_h
    total = head_h + sum(a.get("h", 84) for a in arms)
    out.append(rect(x, y, w, total, stroke=frame_stroke, sw=1.8, rx=8))

    # head / corner card
    if corner_card:
        out.append(line(x, hy, x + w, hy, stroke=frame_stroke, sw=1.5))
        out.append(txt(x + w / 2, y + head_h / 2 + 5, head, size=13.5,
                       fill=INK, anchor="middle", weight=700))
        for i, (name, sup) in enumerate(head_ports):
            cy = y + head_h / 2 + (i - (len(head_ports) - 1) / 2) * 24
            out.append(dot(x, cy, supplied=sup))
            out.append(code(x + 16, cy + 4.5, name, size=12, fill=INK))
    if head_note:
        out.append(callout(x + w + 12, y + head_h / 2 + 4, head_note))

    cy = hy
    for a in arms:
        h = a.get("h", 84)
        op = 0.3 if a.get("fade") else 1.0
        if cy > hy:
            out.append(line(x, cy, x + w, cy, stroke=RULE, sw=1.3, op=op))
        tw = a.get("tab_w", 150)
        ty = cy + TAB_H / 2
        if tabs:
            # the tab: an arm's own little interface box, open to the frame's
            # left edge and top — its bottom + right edges are what make it read
            # as chrome rather than as content.
            out.append(f'<path d="M {x} {cy + TAB_H} L {x + tw} {cy + TAB_H} L {x + tw} {cy}"'
                       f' fill="none" stroke={chr(34)}{frame_stroke}{chr(34)} stroke-width="1.5"'
                       f' opacity="{op}"/>')
            out.append(txt(x + 22, ty + 5, a["title"], size=12.5, fill=INK,
                           font=MONO, weight=500, style=f'opacity="{op}"'))
        else:
            out.append(txt(x + 22, ty + 5, a["title"], size=12.5, fill=INK,
                           font=MONO, weight=500, style=f'opacity="{op}"'))
        p = a.get("port")
        if p:
            out.append(dot(x, ty, supplied=(p == "solid")))
        for j, cap in enumerate(a.get("captures", [])):
            cxp = x + tw
            out.append(out_dot(cxp, ty))
            out.append(code(cxp + 13, ty + 4.5, cap, size=11.5, fill=NEW))
        if a.get("note"):
            out.append(callout(x + w + 12, ty + 5, a["note"], fill=a.get("note_fill", NEW)))
        for b in a.get("body", []):
            out.append(f'<g transform="translate({x},{cy})">{b}</g>')
        cy += h
    return "".join(out), total


def block(x, y, w, h, name, *, ins=(), outs=(), stroke=FRAME, sub=None):
    """An ordinary Block in `view="port"` — header band + walls of dots."""
    out = [rect(x, y, w, h, stroke=stroke, sw=1.6, rx=7),
           line(x, y + 26, x + w, y + 26, stroke=stroke, sw=1.4),
           txt(x + w / 2, y + 18, name, size=12.5, fill=INK, anchor="middle",
               font=MONO, weight=600)]
    if sub:
        out.append(txt(x + w / 2, y + h - 10, sub, size=10.5, fill=DIM, anchor="middle"))
    body_top = y + 26
    for i, (n, sup) in enumerate(ins):
        cy = body_top + 22 + i * 24
        out.append(dot(x, cy, supplied=sup))
        out.append(code(x + 15, cy + 4.5, n, size=11.5))
    for i, (n, sup) in enumerate(outs):
        cy = body_top + 22 + i * 24
        out.append(dot(x + w, cy, supplied=sup))
        out.append(code(x + w - 15, cy + 4.5, n, size=11.5, anchor="end"))
    return "".join(out)


def src_of(y, names, *, x=16, w=132, label="src"):
    h = 26 + 22 + len(names) * 24
    return block(x, y, w, h, label, outs=[(n, True) for n in names]), h


def py(x, y, lines, *, size=12.5, lh=17, fill=CODE):
    return "".join(code(x, y + i * lh, l, size=size, fill=fill) for i, l in enumerate(lines))
