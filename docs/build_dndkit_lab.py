#!/usr/bin/env python3
"""Build the dnd-kit lab report.

Self-contained HTML: the seven captures in reports/media/dndkit-lab/ (written
by demos/capture-dndkit-lab.mjs) are inlined as data URIs, so the page has
no external file dependencies.

    node demos/capture-dndkit-lab.mjs http://localhost:5195 reports/media/dndkit-lab
    python3 docs/build_dndkit_lab.py

Writes /home/bam/bbox-ui/reports/media/dndkit-lab-<date>.html (media half:
the page inlines captures). Override with SYSTEMSKETCH_REPORT_OUTPUT /
SYSTEMSKETCH_REPORT_MEDIA_DIR, which the retained review runtime sets.
"""

from __future__ import annotations

import base64
import os
import subprocess
from datetime import date
from pathlib import Path

REPO = Path("/home/bam/bbox-ui")
DATE = os.environ.get("REPORT_DATE", date.today().isoformat())
MEDIA = Path(os.environ.get("SYSTEMSKETCH_REPORT_MEDIA_DIR", REPO / "reports/media/dndkit-lab"))
OUT = Path(
    os.environ.get("SYSTEMSKETCH_REPORT_OUTPUT", REPO / f"reports/media/dndkit-lab-{DATE}.html")
)


def img(name: str) -> str:
    data = base64.b64encode((MEDIA / name).read_bytes()).decode()
    return f"data:image/png;base64,{data}"


def sha() -> str:
    try:
        return subprocess.run(
            ["git", "-C", str(REPO), "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
    except Exception:
        return "uncommitted"


FIGURES = [
    (
        "01-row.png",
        "Stage 1 — single sortable row",
        "Five cards, one SortableContext, horizontalListSortingStrategy. Edge-to-edge "
        "spacing (space-between).",
    ),
    (
        "02-row-reordered-including-edge.png",
        "Stage 1 — after dragging A1 to the end",
        "A1 dropped past A5: the array reordered via arrayMove and the row re-evened "
        "itself. Spacing switched live to “Including edge” (space-evenly) — note the "
        "equal gap now appears before A2 and after A1 too.",
    ),
    (
        "03-column.png",
        "Stage 2 — single sortable column",
        "Same mechanism, verticalListSortingStrategy, the other axis.",
    ),
    (
        "04-column-reordered.png",
        "Stage 2 — after dragging B1 past B3",
        "Reorders top-to-bottom exactly like the row reorders left-to-right.",
    ),
    (
        "05-board-auto.png",
        "Stage 3 — four containers around a Block, Auto mode",
        "Top/bottom are rows (portrait cards), left/right are columns (landscape cards), "
        "matching how a port's peg is drawn perpendicular to whichever edge it sits on. "
        "The dashed square is the Block the ports would belong to. Each card also carries "
        "an arrow — its polarity — which always points away from the Block: up on top, "
        "down on bottom, left on the left edge, right on the right edge.",
    ),
    (
        "06-board-cross-container-orientation-flip.png",
        "Stage 3 — P1 dragged from the top edge to the left edge",
        "Cross-container drag via onDragOver/onDragEnd (the standard dnd-kit multi-container "
        "recipe). P1 lands in the left column: its shape flips from portrait to landscape, and "
        "its polarity arrow flips from pointing up to pointing left — both are derived from "
        "whichever container currently holds the card, never stored on the card itself, so "
        "they update the instant it crosses to a different edge. The top row reflows to fill "
        "the gap.",
    ),
    (
        "07-board-custom-freeform.png",
        "Stage 3 — Custom mode: P3 dropped off-grid, P2/P4 do not reflow",
        "Custom checked. P3 was dragged to a position between P2 and P4 that isn't one of "
        "the flex-evened slots. P2 and P4 hold still — no reflow happens in this mode. "
        "Cards still cross containers (and still repolarize) here too; toggling Custom back "
        "off re-sorts each container by where its cards were left, so Auto doesn't reshuffle "
        "them.",
    ),
]

HTML = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>dnd-kit lab</title>
<style>
  :root {{
    --bg: #0b0b0d; --panel: #111114; --line: #2a2a30; --text: #ececed;
    --text-dim: #9a9aa2; --accent: #7dd3fc;
  }}
  * {{ box-sizing: border-box; }}
  body {{
    background: var(--bg); color: var(--text); margin: 0; padding: 40px 24px 80px;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }}
  .wrap {{ max-width: 900px; margin: 0 auto; }}
  h1 {{ font-size: 24px; margin: 0 0 6px; }}
  .sub {{ color: var(--text-dim); font-size: 14px; margin: 0 0 28px; line-height: 1.6; }}
  .sub code {{ color: var(--text); }}
  .meta {{
    display: flex; gap: 18px; flex-wrap: wrap; font-size: 12px; color: var(--text-dim);
    border-top: 1px solid var(--line); border-bottom: 1px solid var(--line);
    padding: 10px 0; margin-bottom: 32px;
  }}
  .meta b {{ color: var(--text); }}
  h2 {{ font-size: 16px; margin: 40px 0 4px; }}
  .caption {{ color: var(--text-dim); font-size: 13px; line-height: 1.6; max-width: 720px; margin: 0 0 14px; }}
  figure {{ margin: 0 0 40px; }}
  figure img {{
    width: 100%; border: 1px solid var(--line); border-radius: 10px; display: block;
    background: #000;
  }}
  .run {{
    background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
    padding: 16px 20px; font-size: 13px; margin-bottom: 32px;
  }}
  .run code {{
    display: block; background: #000; padding: 10px 14px; border-radius: 6px;
    margin-top: 8px; overflow-x: auto; color: var(--accent);
  }}
  a {{ color: var(--accent); }}
</style>
</head>
<body>
<div class="wrap">
  <h1>dnd-kit lab</h1>
  <p class="sub">
    Prototype for the port-drag interaction, from <code>PROJECT - Black Box UI.md</code>
    &rarr; &ldquo;Prototype of dnd kit&rdquo;: a single sortable row, a single sortable column,
    then four containers around a Block that cards move freely between &mdash; with a
    switchable flex spacing scheme, a Custom mode where cards stop auto-evening and just
    sit where you drop them, and a polarity arrow on each card that always points away
    from the Block and flips the instant the card crosses to a different edge. Plain DOM,
    <code>@dnd-kit/core</code> + <code>@dnd-kit/sortable</code> &mdash; no React Flow or
    tldraw.
  </p>

  <div class="meta">
    <span><b>Where</b> &mdash; /home/bam/bbox-ui, branch claude/dndkit-lab, commit {sha()}</span>
    <span><b>Source</b> &mdash; demos/dndkit-lab/</span>
  </div>

  <div class="run">
    Run it locally (then open <a href="http://localhost:5195">http://localhost:5195</a>):
    <code>pnpm --filter demo-dndkit-lab run dev</code>
  </div>

  {"".join(
      f'<h2>{title}</h2><p class="caption">{caption}</p>'
      f'<figure><img src="{img(name)}" alt="{title}"></figure>'
      for name, title, caption in FIGURES
  )}
</div>
</body>
</html>
"""

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(HTML)
print(f"Wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB)")
