#!/usr/bin/env python3
"""Builds the /create page review: the four tabs in both themes, the bench,
and the decisions the page embodies.

Captures come from reports/media/create-page-<date>/<set>/manifest.json,
written by the headless capture run; nothing on the page is typed in by hand.
Writes to the MAIN checkout's reports/media/, never the worktree: a worktree
is swept, and the file:// link Zach clicks a day later must still open.
"""
from __future__ import annotations

import base64
import json
import pathlib
import sys
import urllib.parse

DATE = "2026-09-11"
NAME = f"create-page-{DATE}"
REPO = pathlib.Path("/home/bam/bbox-ui")
MEDIA = REPO / "reports" / "media" / NAME
SET = sys.argv[1] if len(sys.argv) > 1 else "after"
OUT = REPO / "reports" / "media" / f"{NAME}.html"

manifest = json.loads((MEDIA / SET / "manifest.json").read_text())
by = {(m["theme"], m["tab"]): m["file"] for m in manifest}


def png(theme: str, tab: str) -> str:
    return "data:image/png;base64," + base64.b64encode((MEDIA / SET / by[(theme, tab)]).read_bytes()).decode()


TABS = [("dom", "DOM Preview"), ("code", "DOM Code"), ("reactflow", "React Flow"), ("tldraw", "tldraw")]


def pair(tab: str, label: str) -> str:
    return f"""
    <section class="pair">
      <h3>{label}</h3>
      <div class="two">
        <figure><img src="{png('light', tab)}" alt="{label}, light"><figcaption>light</figcaption></figure>
        <figure><img src="{png('dark', tab)}" alt="{label}, dark"><figcaption>dark</figcaption></figure>
      </div>
    </section>"""


HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>bbox-ui.com/create · {DATE}</title>
<style>
  :root {{ --ink:#16161a; --muted:#65656f; --line:#e3e3e8; --bg:#fbfbfc; --accent:#5b45d6 }}
  * {{ box-sizing:border-box }}
  body {{ margin:0; background:var(--bg); color:var(--ink); font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif }}
  main {{ max-width:1180px; margin:0 auto; padding:48px 24px 96px }}
  h1 {{ font-size:30px; margin:0 0 6px; letter-spacing:-.02em }}
  h2 {{ font-size:21px; margin:52px 0 12px }}
  h3 {{ font-size:15px; margin:28px 0 8px; color:var(--muted); text-transform:uppercase; letter-spacing:.06em }}
  .lede {{ font-size:18px; color:var(--muted); margin:0 0 4px }}
  .stamp {{ font:12px ui-monospace,Menlo,monospace; color:var(--muted); margin:0 0 28px }}
  blockquote {{ margin:18px 0; padding:12px 18px; border-left:3px solid var(--accent); background:#f5f3ff; border-radius:0 6px 6px 0; font-size:15px }}
  .two {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(460px,1fr)); gap:16px }}
  figure {{ margin:0; border:1px solid var(--line); border-radius:10px; overflow:hidden; background:#fff }}
  figure img {{ width:100%; display:block }}
  figcaption {{ font:12px ui-monospace,Menlo,monospace; color:var(--muted); padding:6px 10px; border-top:1px solid var(--line) }}
  ul {{ padding-left:22px }} li {{ margin:6px 0 }}
  code {{ font:13px ui-monospace,Menlo,monospace; background:#f0f0f4; padding:1px 5px; border-radius:4px }}
  .box {{ border:1px solid var(--line); background:#fff; border-radius:10px; padding:16px 20px; margin:16px 0 }}
</style></head><body><main>
<p class="lede">bbox-ui</p>
<h1>bbox-ui.com/create</h1>
<p class="stamp">{DATE} · branch <code>claude/create-page</code> · capture set <code>{SET}</code> · every image is the live page in headless Chrome</p>

<blockquote>
<p>“Can you please change the viewport to have 4 tabs: DOM Preview, DOM Code, React Flow, tldraw… so I can seamlessly switch between all of those… those instances are now living in a canvas so you can move them around, and we can get multi-select working as well.”</p>
<p>“For the inspector panel please make sure you never have to scroll it up and down while there is still space on the screen.” · “Let's have the sidebar full height top to bottom even if we don't use the full height.” · “As we change the site from dark to white, our create page should adapt accordingly.”</p>
</blockquote>

<h2>The four tabs, light and dark</h2>
<p>Two Port instances, both selected, Advanced tier. The same two instances in every image: the page owns them, the tabs only look at them.</p>
{''.join(pair(t, l) for t, l in TABS)}

<h2>The mixed bench</h2>
<div class="two">
  <figure><img src="{png('light', 'mixed')}" alt="Mixed bench, light"><figcaption>light</figcaption></figure>
  <figure><img src="{png('dark', 'mixed')}" alt="Mixed bench, dark"><figcaption>dark</figcaption></figure>
</div>

<h2>What holds it together</h2>
<div class="box"><ul>
<li><strong>One engine, two shells.</strong> The field model, the tier rule, the six panel designs, the registry and the bench seeds moved into <code>@bbox-ui/panel</code>. The Vite demo and the site both consume it; a structural test asserts there is exactly one implementation.</li>
<li><strong>The page owns the state.</strong> Instances, selection and canvas positions live in the page. A node dragged on React Flow is in the same place on tldraw; a shape picked on tldraw ticks the same sidebar checkbox. React Flow's selection is read only from user <code>select</code> changes, because its mount-time report of an empty selection looped the page.</li>
<li><strong>No scroll while there is room.</strong> The inspector is a full-height flex column; only its list scrolls, and only once the content is taller than the column. Measured at 900px (no scroll) and 600px (Expert scrolls, Simple does not).</li>
<li><strong>Theme reaches the panel.</strong> About 300 inline colours, including seven named whites the hex pass missed, are now semantic tokens mapped onto the site's theme. <code>color-scheme</code> is scoped to the workbench so native selects stop painting a white box under light text.</li>
<li><strong>Side by side is declared.</strong> A field's <code>group</code> decides pairing, never adjacency. Block width/height, Stack gap/gutter and TextBox's four paddings declare theirs; nothing else pairs.</li>
</ul></div>

<h2>Open</h2>
<ul>
<li>The Custom row still cannot be made true: no field kind combines named stops with a free scalar.</li>
<li>Port has no preset-governed property, so nothing is ever “driven” on Port.</li>
<li>tldraw shows its licence notice on the canvas; the page is served locally, where that is expected.</li>
</ul>
</main></body></html>
"""

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(HTML, encoding="utf-8")
encoded = len(urllib.parse.quote(HTML, safe=""))
print(f"wrote {OUT}")
print(f"  on disk {len(HTML.encode()):,} bytes; encoded {encoded:,} (cap 2,097,024) -> {'OK' if encoded < 2_097_024 else 'OVER, browser only'}")
