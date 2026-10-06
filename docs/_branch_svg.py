"""Tiny SVG vocabulary for the truthful-branching report's mocks.

WHY hand-drawn SVG rather than captures of the real components: the form
being proposed does NOT exist in `components/blockRegion.tsx` yet — an arm
carries zero ports today (`scene/controlFlow.ts:10-21`). A proposal for
something unbuilt owes a rendered mock, and a mock that reuses the kit's own
geometry constants stays honest about the sizes it is claiming.

Geometry follows the real kit: REGION_CORNER_WIDTH_PX = 160
(docs/CONTROL-FLOW-PLAN.md §3.3), port dot r = 7.
"""
from __future__ import annotations

# ── tokens ────────────────────────────────────────────────────────────
BG      = "#0f1114"
FRAME   = "#c9d1dc"   # region frame + block outline (the kit's ink-on-dark)
RULE    = "#6d7683"   # arm separators
INK     = "#e9edf3"
DIM     = "#98a2b1"
CODE    = "#cfd7e3"
NEW     = "#f0a83a"   # what this proposal adds
BAD     = "#e0615c"   # the lie
OK      = "#5cc98a"
FILL_D  = "#cfd7e3"   # a supplied dot is solid
HOLLOW  = BG          # an unsupplied dot is hollow (ring only)
MONO    = "ui-monospace,'SF Mono',Menlo,Consolas,monospace"
SANS    = "Inter,system-ui,-apple-system,sans-serif"

R_DOT = 7


def esc(s: str) -> str:
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def svg(w: int, h: int, body: str, title: str = "") -> str:
    t = f"<title>{esc(title)}</title>" if title else ""
    return (
        f'<svg viewBox="0 0 {w} {h}" width="100%" style="max-width:{w}px;height:auto;display:block"'
        f' xmlns="http://www.w3.org/2000/svg" role="img">{t}'
        f'<rect width="{w}" height="{h}" fill="{BG}"/>{body}</svg>'
    )


def txt(x, y, s, *, size=13, fill=INK, font=SANS, anchor="start", weight=500, style=""):
    return (f'<text x="{x}" y="{y}" font-family="{font}" font-size="{size}" fill="{fill}"'
            f' text-anchor="{anchor}" font-weight="{weight}" {style}>{esc(s)}</text>')


def code(x, y, s, *, size=12.5, fill=CODE, anchor="start"):
    return txt(x, y, s, size=size, fill=fill, font=MONO, anchor=anchor, weight=400)


def rect(x, y, w, h, *, stroke=FRAME, fill="none", rx=6, sw=1.6, dash=None, op=1):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"'
            f' stroke="{stroke}" stroke-width="{sw}" opacity="{op}"{d}/>')


def line(x1, y1, x2, y2, *, stroke=RULE, sw=1.4, dash=None, op=1):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return (f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke}"'
            f' stroke-width="{sw}" opacity="{op}"{d}/>')


def dot(cx, cy, *, supplied=False, stroke=FRAME, r=R_DOT, sw=2.0):
    """The kit's port dot. Hollow = unsupplied (its inline default is in
    force). Solid = a cable lands here. That meaning already exists in the
    kit (`supplied: false` in the port metadata) — this proposal spends it
    rather than inventing a second badge."""
    return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{stroke if supplied else HOLLOW}"'
            f' stroke="{stroke}" stroke-width="{sw}"/>')


def out_dot(cx, cy, *, stroke=NEW, r=R_DOT):
    """A pattern's CAPTURE: a value the arm header produces INTO its body.
    Drawn as a solid square-ish dot facing right so it cannot be confused
    with an operand coming in."""
    return (f'<rect x="{cx - r}" y="{cy - r}" width="{2*r}" height="{2*r}" rx="2"'
            f' fill="{stroke}" stroke="{stroke}" stroke-width="1.6"/>')


def wire(pts, *, stroke=FRAME, sw=1.7, dash=None, op=1.0):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    p = " ".join(f"{x},{y}" for x, y in pts)
    return (f'<polyline points="{p}" fill="none" stroke="{stroke}" stroke-width="{sw}"'
            f' stroke-linejoin="round" stroke-linecap="round" opacity="{op}"{d}/>')


def chip(x, y, s, *, fill=NEW, fg="#141414", size=10.5, pad=7, h=17):
    w = int(len(s) * size * 0.62) + pad * 2
    return (f'<g><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h//2}" fill="{fill}"/>'
            + txt(x + pad, y + h - 5, s, size=size, fill=fg, weight=700) + "</g>")


def callout(x, y, s, *, fill=NEW, size=11.5, anchor="start"):
    return txt(x, y, s, size=size, fill=fill, font=SANS, anchor=anchor, weight=600)
