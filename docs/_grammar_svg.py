"""Schematic SVG primitives for drawing visual-grammar comparisons.

Used by `build_visual_grammar_improvements_report.py` to draw, side by side,
what a prior-art system does and what a recommendation would do instead.

WHY these are hand-rolled schematics rather than captures of the real app:
the recommendations are PROPOSALS — most of the notation on these drawings does
not exist yet, so there is nothing to screenshot. Zach's rule is explicit that
"a proposal for something that doesn't exist yet owes a rendered MOCK", and that
prose + comparison tables alone do not land. Where a drawing shows something the
trunk ALREADY does, the caption says so, so a reader is never misled about which
half is real.

The visual idiom deliberately follows Zach's own two grammar-atlas reports
(`systemsketch/docs/*-visual-grammar-*-2026-09-02.html`): original schematic
reconstructions of stable conventions, meaning on the left and board shape on
the right, never copied product artwork.
"""
from __future__ import annotations

import html

# The report palette, kept in sync with docs/_report_kit.py's CSS block so a
# drawing never fights the page it sits on.
INK = "#e6e8ee"
DIM = "#9aa3b2"
DIM2 = "#6b7383"
LINE = "#343b49"
PANEL = "#1b1e25"
PANEL2 = "#22262f"
ACCENT = "#f0883e"
BLUE = "#5aa9f8"
OK = "#3fb950"
WARN = "#e5534b"
GOLD = "#e8c06a"
# WHY single quotes inside these stacks, and why the chain is explicit.
# These strings are interpolated straight into a double-quoted SVG attribute
# (`font-family="{fam}"`), so a family name wrapped in DOUBLE quotes terminates
# the attribute at its first inner quote — the stack silently becomes
# `font-family=""` and every label renders in the default serif face. That is
# not hypothetical: it is what this module shipped on its first render, and the
# only reason it was caught is that the drawing was rendered and looked at.
# CSS accepts single-quoted family names, so they nest safely.
# The chain is also explicit because `ui-monospace` is not a family fontconfig
# knows: `fc-match ui-monospace` on this box answers **Noto Sans**, a
# proportional face. Naming real installed fonts first is what makes the
# headless render and Zach's own browser agree.
MONO = ("'JetBrains Mono','DejaVu Sans Mono','Liberation Mono',"
        "'SF Mono',Menlo,Consolas,monospace")
SANS = "'Noto Sans','DejaVu Sans','Liberation Sans',system-ui,sans-serif"


# Advance width of one monospace glyph as a fraction of font-size. JetBrains
# Mono and DejaVu Sans Mono are both 0.6 em; measured rather than guessed, by
# rendering a 40-character string and reading the painted bbox.
MONO_ADVANCE = 0.6


def mono_w(s: str, size: float = 11) -> float:
    """How wide a mono label will actually paint.

    WHY this exists: every drawing in this kit is laid out by hand-written
    coordinates, and the first render collided a label into the box beside it
    the moment the font was fixed from serif to mono. A drawing whose labels
    overlap is not evidence, it is a bug that looks like a design — so lay out
    against this instead of against a guess.
    """
    return len(s) * size * MONO_ADVANCE


def esc(s: str) -> str:
    return html.escape(str(s))


def svg(body: str, w: int, h: int, *, label: str = "") -> str:
    """Wrap primitives in a responsive, viewBox-scaled root."""
    aria = f' role="img" aria-label="{html.escape(label, quote=True)}"' if label else ""
    return (
        f'<svg viewBox="0 0 {w} {h}" width="100%" height="auto"'
        f' preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg"'
        f' style="max-width:{w}px;display:block;margin:0 auto"{aria}>{body}</svg>'
    )


def text(x: float, y: float, s: str, *, size: float = 11, fill: str = INK,
         anchor: str = "start", mono: bool = True, weight: str = "400",
         opacity: float = 1.0) -> str:
    fam = MONO if mono else SANS
    return (
        f'<text x="{x}" y="{y}" font-family="{fam}" font-size="{size}"'
        f' fill="{fill}" text-anchor="{anchor}" font-weight="{weight}"'
        f' opacity="{opacity}">{esc(s)}</text>'
    )


def block(x: float, y: float, w: float, h: float, title: str, *,
          body: list[str] | None = None, fill: str = PANEL, stroke: str = LINE,
          header: float = 22, accent: str | None = None, dash: str = "",
          title_fill: str = INK, radius: float = 6, opacity: float = 1.0,
          shadow: bool = False) -> str:
    """A bbox-ui Block: rounded card, header band, optional body lines."""
    d = f' stroke-dasharray="{dash}"' if dash else ""
    out = []
    if shadow:
        out.append(f'<rect x="{x + 2}" y="{y + 3}" width="{w}" height="{h}" rx="{radius}"'
                   f' fill="#000" opacity=".28"/>')
    out.append(f'<g opacity="{opacity}">')
    out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}"'
               f' fill="{fill}" stroke="{stroke}" stroke-width="1.25"{d}/>')
    if header:
        out.append(f'<path d="M{x} {y + header} H{x + w}" stroke="{stroke}"'
                   f' stroke-width="1"{d}/>')
        if accent:
            out.append(f'<rect x="{x + 1}" y="{y + 1}" width="3.5" height="{header - 2}"'
                       f' rx="1.5" fill="{accent}"/>')
        out.append(text(x + (11 if accent else 8), y + header - 7, title,
                        size=10.5, fill=title_fill, weight="600"))
    else:
        out.append(text(x + 8, y + h / 2 + 3.5, title, size=10.5, fill=title_fill))
    for i, line in enumerate(body or []):
        out.append(text(x + 9, y + header + 15 + i * 14, line, size=10, fill=DIM))
    out.append("</g>")
    return "".join(out)


def port(cx: float, cy: float, *, kind: str = "in", fill: str = BLUE,
         label: str = "", side: str = "left", size: float = 5,
         square: bool = False, mark: str = "") -> str:
    """A port dot on a wall, with its label outside the wall."""
    out = []
    if square:
        out.append(f'<rect x="{cx - size}" y="{cy - size}" width="{size * 2}"'
                   f' height="{size * 2}" rx="1" fill="{fill}"'
                   f' stroke="{PANEL}" stroke-width="1"/>')
    else:
        out.append(f'<circle cx="{cx}" cy="{cy}" r="{size}" fill="{fill}"'
                   f' stroke="{PANEL}" stroke-width="1"/>')
    if mark:
        out.append(text(cx, cy + 3, mark, size=7, fill=PANEL, anchor="middle", weight="700"))
    if label:
        if side == "left":
            out.append(text(cx + size + 5, cy + 3.5, label, size=9.5, fill=DIM))
        elif side == "right":
            out.append(text(cx - size - 5, cy + 3.5, label, size=9.5, fill=DIM, anchor="end"))
        elif side == "top":
            out.append(text(cx, cy - size - 5, label, size=9.5, fill=DIM, anchor="middle"))
        else:
            out.append(text(cx, cy + size + 12, label, size=9.5, fill=DIM, anchor="middle"))
    return "".join(out)


def wire(pts: list[tuple[float, float]], *, stroke: str = BLUE, width: float = 1.6,
         dash: str = "", arrow: bool = True, radius: float = 7,
         opacity: float = 1.0) -> str:
    """An orthogonal elbow polyline with rounded corners, matching the trunk's
    elbow router's look (not its math — this is a drawing)."""
    if len(pts) < 2:
        return ""
    d = [f"M{pts[0][0]} {pts[0][1]}"]
    for i in range(1, len(pts) - 1):
        (px, py), (cx, cy), (nx, ny) = pts[i - 1], pts[i], pts[i + 1]
        v1x, v1y = cx - px, cy - py
        v2x, v2y = nx - cx, ny - cy
        l1 = max(1e-6, abs(v1x) + abs(v1y))
        l2 = max(1e-6, abs(v2x) + abs(v2y))
        r = min(radius, l1 / 2, l2 / 2)
        d.append(f"L{cx - v1x / l1 * r} {cy - v1y / l1 * r}")
        d.append(f"Q{cx} {cy} {cx + v2x / l2 * r} {cy + v2y / l2 * r}")
    d.append(f"L{pts[-1][0]} {pts[-1][1]}")
    ds = f' stroke-dasharray="{dash}"' if dash else ""
    mk = ' marker-end="url(#ar)"' if arrow else ""
    return (f'<path d="{" ".join(d)}" fill="none" stroke="{stroke}"'
            f' stroke-width="{width}" stroke-linecap="round"{ds}{mk}'
            f' opacity="{opacity}"/>')


def arrowhead(color: str = BLUE, ident: str = "ar") -> str:
    return (f'<defs><marker id="{ident}" viewBox="0 0 10 10" refX="8.5" refY="5"'
            f' markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">'
            f'<path d="M0 1 L9 5 L0 9 z" fill="{color}"/></marker></defs>')


def frame(x: float, y: float, w: float, h: float, *, stroke: str = LINE,
          fill: str = "none", dash: str = "", radius: float = 8,
          width: float = 1.25, opacity: float = 1.0) -> str:
    """A region frame — scope, never an interface. It owns no port."""
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}"'
            f' fill="{fill}" stroke="{stroke}" stroke-width="{width}"{d}'
            f' opacity="{opacity}"/>')


def badge(x: float, y: float, s: str, *, fill: str = ACCENT, text_fill: str = "#15171c",
          size: float = 9) -> str:
    """A control mark — break / continue / pass. Never a wire endpoint."""
    w = max(20.0, len(s) * size * 0.62 + 12)
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{size + 7}" rx="{(size + 7) / 2}"'
            f' fill="{fill}"/>' + text(x + w / 2, y + size + 1.2, s, size=size,
                                       fill=text_fill, anchor="middle", weight="700"))


def chevron(x: float, y: float, *, open_: bool = True, fill: str = DIM) -> str:
    """The folding chevron. Down = open, right = folded."""
    if open_:
        return f'<path d="M{x - 4} {y - 2} L{x} {y + 3} L{x + 4} {y - 2}" fill="none" stroke="{fill}" stroke-width="1.6" stroke-linecap="round"/>'
    return f'<path d="M{x - 2} {y - 4} L{x + 3} {y} L{x - 2} {y + 4}" fill="none" stroke="{fill}" stroke-width="1.6" stroke-linecap="round"/>'


def caption_band(x: float, y: float, w: float, s: str, *, fill: str = DIM2) -> str:
    return text(x + w / 2, y, s, size=9.5, fill=fill, anchor="middle", mono=False)


def tag(x: float, y: float, s: str, *, fill: str = WARN) -> str:
    """A small corner tag naming which system a drawing reconstructs."""
    return text(x, y, s, size=9, fill=fill, weight="700", mono=True)


def code(x: float, y: float, lines: list[str], *, size: float = 10.5,
         gap: float = 14.5, fill: str = DIM) -> str:
    """A small source listing, for the 'this is the Python' half of a pair."""
    return "".join(text(x, y + i * gap, ln, size=size, fill=fill) for i, ln in enumerate(lines))
