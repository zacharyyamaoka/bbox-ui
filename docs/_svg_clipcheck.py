#!/usr/bin/env python3
"""Flag clipped / colliding <text> in a report's inline hand-drawn SVGs.

    python3 docs/_svg_clipcheck.py reports/media/<report>.html

Exit 1 if anything is suspect. Written 2026-09-22 after a callout in the
try/except report ran under a side panel and lost its last three words --
eyeballing 15 screenshots had missed it, and a second instance in the SAME
figure was only found once this existed.

It is a TOOL, not a gate: nothing runs it automatically. A report builder
that hand-draws SVG should run it before handoff, because SVG text does not
wrap and nothing else in the pipeline will tell you.

Proven able to fail: reverting both fixes makes it print exactly those two
lines and exit 1. Coverage is checked too -- on that report it measured
484 of 484 <text> tags, so a green run is not green for want of parsing.

Two defect classes, both mechanical:
  A  text whose estimated right edge runs past the SVG's own width
  B  text that STARTS outside a <rect> and runs into it at an overlapping
     y-band (the "runs under the panel" case)

Widths are estimated, so this is a spotlight, not a proof -- every hit gets
eyeballed. Metrics measured against this page's own rendering: the mono
stack advances ~0.605em, the sans stack ~0.52em at these weights.
"""
import html
import re
import sys

MONO_ADV, SANS_ADV = 0.605, 0.525

TEXT = re.compile(
    r'<text x="([-\d.]+)" y="([-\d.]+)" font-family="([^"]*)" font-size="([\d.]+)"'
    r' fill="[^"]*" text-anchor="([^"]*)"[^>]*>(.*?)</text>', re.S)
RECT = re.compile(
    r'<rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"')
SVG = re.compile(r'<svg viewBox="0 0 (\d+) (\d+)".*?</svg>', re.S)


def width_of(s, size, family):
    adv = MONO_ADV if "mono" in family.lower() or "Menlo" in family else SANS_ADV
    return len(s) * size * adv


def main(path):
    page = open(path, encoding="utf-8").read()
    bad = 0
    for n, m in enumerate(SVG.finditer(page), 1):
        W = int(m.group(1))
        body = m.group(0)
        rects = [tuple(map(float, r.groups())) for r in RECT.finditer(body)]
        for t in TEXT.finditer(body):
            x, y, fam, size, anchor, raw = t.groups()
            x, y, size = float(x), float(y), float(size)
            s = html.unescape(re.sub(r"<[^>]+>", "", raw))
            if not s.strip():
                continue
            w = width_of(s, size, fam)
            x0 = x if anchor == "start" else (x - w if anchor == "end" else x - w / 2)
            x1 = x0 + w
            if x1 > W + 1:
                bad += 1
                print(f"  [A] svg#{n} (w={W}) overflows by {x1 - W:5.0f}px  y={y:.0f}"
                      f"  {s[:64]!r}")
                continue
            for rx, ry, rw, rh in rects:
                if rw < 60 or rh < 14:
                    continue                      # chips, dots, bars: not panels
                if not (ry - 2 <= y <= ry + rh + 2):
                    continue
                if x0 < rx - 2 and x1 > rx + 8:   # starts outside, runs in
                    bad += 1
                    print(f"  [B] svg#{n} text crosses a panel edge at x={rx:.0f}"
                          f"  y={y:.0f}  {s[:64]!r}")
                    break
    print(f"\n{bad} suspect(s)" if bad else "\nno suspects")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
