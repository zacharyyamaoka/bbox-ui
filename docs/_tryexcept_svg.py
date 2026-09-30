"""Drawing vocabulary for the try/except proposal set.

Extends `_branch_svg` (tokens, dot, out_dot, rect, line, txt, code, chip,
callout) with the three things try/except needs and branching did not:

  * an UNCONDITIONAL band — a row that is not selected by anything. The
    branch grammar has no such thing: every arm of an `if` or a `match` is
    chosen. `try:` and `finally:` are not, so drawing them with an arm tab
    would reuse a shape that means "this one was picked" for two rows where
    nothing picked anything.
  * a CUT — the abort. An exception leaves the rest of the try suite
    unexecuted, and no existing figure in this kit draws "and then it
    stopped". Python's own words: "the rest of the clause is skipped"
    (docs.python.org/3/tutorial/errors.html).
  * a FOOTER band — a row drawn ON the frame's bottom edge rather than
    inside the arm stack, which is how proposal 4 makes `finally`
    structurally incapable of looking conditional.

Geometry follows the committed constants, not invented ones:
REGION_ARM_HEADER_PX = 32, REGION_CORNER_WIDTH_PX = 160,
REGION_ARM_FADE_OPACITY = 0.18
(apps/storybook-basics/src/components/blockRegion.layout.ts:28,42,46).
"""
from __future__ import annotations

from _branch_svg import *  # noqa: F401,F403
from _branch_svg import (BG, CODE, DIM, FRAME, INK, MONO, NEW, OK, BAD, RULE,
                         R_DOT, callout, chip, code, dot, esc, line, out_dot,
                         rect, txt, wire)

# ── the committed layout constants, so a mock cannot claim a size the kit
#    does not have (blockRegion.layout.ts:28-49) ────────────────────────
ARM_HEADER_PX = 32
CORNER_W_PX = 160
FADE = 0.18

PROT = "#7fc9e8"   # the PROTECTED boundary — only the try suite is inside it
ALWAYS = "#b48ef0"  # a row nothing selects: `try` and `finally`
GROUP = "#e8c06a"   # except* / ExceptionGroup


def head(x, y, w, label, *, h=34, stroke=FRAME, port=None, port_label=None,
         port_state="empty", sub=None, note=None, note_fill=NEW):
    """The region's corner/head card, drawn full-width the way today's
    branch mocks draw it (`_branch_mocks.region`) so the two reports read as
    one vocabulary."""
    out = [line(x, y + h, x + w, y + h, stroke=stroke, sw=1.5),
           txt(x + w / 2, y + h / 2 + (0 if sub else 5), label, size=13.5, fill=INK,
               anchor="middle", weight=700)]
    if sub:
        out.append(txt(x + w / 2, y + h - 6, sub, size=10, fill=DIM, anchor="middle",
                       weight=500))
    if port:
        cy = y + h / 2
        out.append(dot(x, cy, supplied=(port_state in ("wired", "received")),
                       stroke=NEW if port_state == "received" else FRAME))
        out.append(code(x + 16, cy + 4.5, port, size=12, fill=INK))
        if port_label:
            out.append(txt(x + 16, cy + 19, port_label, size=10, fill=DIM, weight=500))
    if note:
        out.append(callout(x + w + 12, y + h / 2 + 4, note, fill=note_fill))
    return "".join(out)


def tab(x, y, w, label, *, stroke=FRAME, op=1.0, fill_bg=None):
    """An arm tab — the little interface box a dot or a capture attaches to.
    Open to the frame's left edge and top; its bottom and right edges are
    what make it read as chrome rather than as content."""
    out = []
    if fill_bg:
        out.append(f'<path d="M {x} {y} L {x + w} {y} L {x + w} {y + ARM_HEADER_PX}'
                   f' L {x} {y + ARM_HEADER_PX} Z" fill="{fill_bg}" opacity="0.5"/>')
    out.append(f'<path d="M {x} {y + ARM_HEADER_PX} L {x + w} {y + ARM_HEADER_PX}'
               f' L {x + w} {y}" fill="none" stroke="{stroke}" stroke-width="1.5"'
               f' opacity="{op}"/>')
    out.append(txt(x + 20, y + ARM_HEADER_PX / 2 + 5, label, size=12.5, fill=INK,
                   font=MONO, weight=500, style=f'opacity="{op}"'))
    return "".join(out)


def always_strip(x, y, w, label, *, stroke=ALWAYS, note="always", op=1.0):
    """A row nothing selects. Full width, tinted, no tab — the absence of a
    tab is the whole message: there is no edge for a test dot to attach to
    because there is no test.

    WHY not a chip saying "always": that is the failure the branching report
    just closed — a word in a header standing in for structure. The shape
    carries it instead."""
    out = [f'<rect x="{x}" y="{y}" width="{w}" height="{ARM_HEADER_PX}" fill="{stroke}"'
           f' opacity="0.13"/>',
           line(x, y, x + w, y, stroke=stroke, sw=1.5, op=op),
           line(x, y + ARM_HEADER_PX, x + w, y + ARM_HEADER_PX, stroke=stroke, sw=1.5, op=op),
           txt(x + 20, y + ARM_HEADER_PX / 2 + 5, label, size=12.5, fill=INK,
               font=MONO, weight=600, style=f'opacity="{op}"')]
    if note:
        out.append(txt(x + w - 14, y + ARM_HEADER_PX / 2 + 4.5, note, size=10.5,
                       fill=stroke, anchor="end", weight=700))
    return "".join(out)


def cut(x, y, w, *, stroke=BAD, label=None):
    """The ABORT. A jagged tear across the body at the point the exception
    left it — everything below is skipped. Python: "the rest of the clause
    is skipped" (tutorial/errors.html)."""
    step = 11
    pts = []
    n = max(2, int(w // step))
    for i in range(n + 1):
        pts.append((x + i * step, y + (2.6 if i % 2 else -2.6)))
    out = [wire(pts, stroke=stroke, sw=1.8)]
    if label:
        out.append(txt(x + w + 10, y + 4.5, label, size=10.5, fill=stroke, weight=700))
    return "".join(out)


def footer_band(x, y, w, label, *, stroke=ALWAYS, note=None, h=ARM_HEADER_PX):
    """A band drawn ON the frame's bottom edge — geometrically outside the
    arm stack, so no selector can reach it. Proposal 4's whole idea.
    The kit already has the slot: `Block`'s optional `footer`."""
    out = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="0" fill="{stroke}"'
           f' opacity="0.16"/>',
           line(x, y, x + w, y, stroke=stroke, sw=1.8),
           txt(x + 20, y + h / 2 + 5, label, size=12.5, fill=INK, font=MONO, weight=600)]
    if note:
        out.append(txt(x + w - 14, y + h / 2 + 4.5, note, size=10.5, fill=stroke,
                       anchor="end", weight=700))
    return "".join(out)


def protected(x, y, w, h, *, label="protected", stroke=PROT, dash="5 4"):
    """The boundary that actually protects. Only the try suite is inside it —
    verified by execution: a raise in `else` escapes the whole statement."""
    return (rect(x, y, w, h, stroke=stroke, sw=1.6, dash=dash, rx=5)
            + txt(x + w - 8, y - 6, label, size=10, fill=stroke, anchor="end", weight=700))


def excbox(x, y, w, h, name, *, stroke=BAD, fill="none"):
    """A raised exception drawn as the value it is."""
    return (rect(x, y, w, h, stroke=stroke, sw=1.5, rx=4, fill=fill)
            + txt(x + w / 2, y + h / 2 + 4.5, name, size=11, fill=stroke,
                  anchor="middle", font=MONO, weight=700))


def capdot(cx, cy, name, *, fill=NEW):
    """`as e` — the square capture dot on a tab's right edge, plus its name.
    Verified scoped: `e` is deleted at the end of the arm (CPython 3.12.3),
    so this dot can never legitimately be wired outside its own row."""
    return out_dot(cx, cy, stroke=fill) + code(cx + 13, cy + 4.5, name, size=11.5, fill=fill)


def legend(x, y, items, *, size=11, gap=20):
    """A small key. Each item is (swatch_colour, text)."""
    out = []
    for i, (col, s) in enumerate(items):
        yy = y + i * gap
        out.append(f'<rect x="{x}" y="{yy - 8}" width="14" height="11" rx="2" fill="{col}"'
                   f' opacity="0.55" stroke="{col}" stroke-width="1.2"/>')
        out.append(txt(x + 22, yy + 1, s, size=size, fill=DIM, weight=500))
    return "".join(out)


def matrix(x, y, cols, rows, *, cw=132, rh=26, hh=30, label_w=180):
    """A truth table drawn as a grid.

    WHY a matrix and not a flow diagram: a diagram of "which band runs after
    which outcome" would need arrows between bands, and an arrow between two
    parts of one statement is exactly the execution cable CLAUDE.md forbids.
    A matrix says the same thing with no edge at all.
    """
    out = []
    W = label_w + len(cols) * cw
    for j, c in enumerate(cols):
        out.append(txt(x + label_w + j * cw + cw / 2, y + hh - 10, c, size=11,
                       fill=DIM, anchor="middle", weight=700))
    out.append(line(x, y + hh, x + W, y + hh, stroke=RULE, sw=1.3))
    for i, (lab, cells, note) in enumerate(rows):
        yy = y + hh + i * rh
        out.append(txt(x + 2, yy + rh / 2 + 4.5, lab, size=11.5, fill=INK, font=MONO,
                       weight=500))
        for j, v in enumerate(cells):
            cx = x + label_w + j * cw + cw / 2
            if v == 1:
                out.append(f'<rect x="{cx - 26}" y="{yy + 4}" width="52" height="{rh - 8}"'
                           f' rx="4" fill="{OK}" opacity="0.2"/>')
                out.append(txt(cx, yy + rh / 2 + 4.5, "runs", size=10.5, fill=OK,
                               anchor="middle", weight=700))
            elif v == 0:
                out.append(txt(cx, yy + rh / 2 + 4.5, "—", size=12, fill="#4a515e",
                               anchor="middle", weight=700))
            else:
                out.append(txt(cx, yy + rh / 2 + 4.5, str(v), size=10, fill=NEW,
                               anchor="middle", weight=700))
        if note:
            out.append(txt(x + W + 14, yy + rh / 2 + 4.5, note, size=10.5, fill=DIM,
                           weight=500))
        out.append(line(x, yy + rh, x + W, yy + rh, stroke="#1e222a", sw=1))
    return "".join(out), hh + len(rows) * rh


# Monospace advance at the tab's own 12.5px size: 0.6em is the standard
# advance for the ui-monospace stack. Measured against the rendered page
# rather than guessed — a tab narrower than its own label puts the capture
# dot on top of the text, which is what this exists to prevent.
MONO_ADV = 7.55


def tabw(label: str, *, pad: int = 36, lead: int = 20) -> int:
    """How wide a tab has to be for `label` to fit inside it.

    `lead` is the text's left inset inside the tab (`tab()` uses 20); `pad`
    is the breathing room before the tab's right edge, where a capture dot
    sits. Always compute this rather than hand-tuning a number: the labels
    in these figures are real Python and one of them is 35 characters."""
    return int(len(label) * MONO_ADV) + lead + pad
