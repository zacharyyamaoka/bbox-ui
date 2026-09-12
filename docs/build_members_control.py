#!/usr/bin/env python3
"""Builds the Members-control review: five standard controls for adding,
listing, selecting, reordering and removing a component's members, as a
babble behind a live switcher on bbox-ui.com/create.

Captures come from reports/media/members-control-<date>/manifest.json,
written by demos/capture-members-control.mjs (a CDP journey against the
real page — every number and every picture on this report was asserted
there, nothing is typed in by hand). Writes to the MAIN checkout's
reports/media/, never the worktree: a worktree is swept, and the file://
link Zach clicks a day later must still open.
"""
from __future__ import annotations

import base64
import io
import json
import pathlib
import subprocess

from PIL import Image

DATE = "2026-09-11"
NAME = f"members-control-{DATE}"
REPO = pathlib.Path("/home/bam/bbox-ui")
MEDIA = REPO / "reports" / "media" / NAME
OUT = REPO / "reports" / "media" / f"{NAME}.html"
HERE = pathlib.Path(__file__).resolve().parent.parent

manifest = json.loads((MEDIA / "manifest.json").read_text())
rows = [m for m in manifest if "height" in m]
by = {(m["theme"], m["control"]): m for m in manifest}


def data_uri(path: pathlib.Path, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def png(file: str) -> str:
    """Inspector crops are the full column, mostly empty below the control;
    trim to the last row that differs from the background, plus a margin,
    so the report shows the control and not the void under it."""
    im = Image.open(MEDIA / file).convert("RGB")
    px = im.load()
    bg = px[im.width // 2, im.height - 1]
    last = 0
    for y in range(im.height - 1, -1, -1):
        row = [px[x, y] for x in range(0, im.width, 4)]
        if any(abs(r[0] - bg[0]) + abs(r[1] - bg[1]) + abs(r[2] - bg[2]) > 24 for r in row):
            last = y
            break
    im = im.crop((0, 0, im.width, min(im.height, last + 28)))
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def webp(file: str, width: int = 1000) -> str:
    """Full-page shots go in as resized WebP: a 1400px PNG of the whole app is
    ~200 KB and there are a dozen of them; the report has to stay openable."""
    im = Image.open(MEDIA / file).convert("RGB")
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=82)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


def measured_lines(path: str, pattern: str) -> int:
    """Count at build time from the live tree, so the report cannot drift."""
    out = subprocess.run(["grep", "-c", pattern, str(HERE / path)], capture_output=True, text=True)
    return int(out.stdout.strip() or 0)


def wc(path: str) -> int:
    return len((HERE / path).read_text().splitlines())


CONTROLS = [
    ("list", "List", "the baseline", "The Arms / Members section from SystemSketch's inspector, brought over as-is: one row per member — grip, type glyph, title, type, state badge, ×. The row selects; the grip drags (dnd-kit sortable); + opens the typed Add menu."),
    ("chips", "Chips", "density", "Everything on one wrapping row, like a tag input. A chip is a member; drag it to reorder, × to remove, the trailing dashed chip adds. The densest control that still satisfies the whole contract."),
    ("outline", "Outline", "depth", "Figma's Layers panel: the whole subtree under the parent, indented, with disclosure triangles. You can jump straight to a grandchild. Direct members reorder with ↑↓; deeper rows select only, so there is still no nested editor."),
    ("grouped", "Grouped by type", "grouping", "The Shopify theme editor / Unity Add-Component idea: one sub-section per kind the parent accepts, each with its own + and its own \"none yet\". Shows what CAN be added even when nothing is. Tallest."),
    ("stepper", "Stepper", "how much per child", "Storybook Controls: one field row, `Members − 3 +` with a kind picker, then a strip of numbered squares. The minimum information per child that still lets you click into one."),
]

INDEX_AXIS = "\n".join(f'<li><strong>{label}</strong> — moves <em>{axis}</em>. {blurb}</li>' for _, label, axis, blurb in CONTROLS)


def variant_card(cid: str, label: str, axis: str, blurb: str) -> str:
    d, l = by[("dark", cid)], by[("light", cid)]
    strip = "".join(
        f'<figure class="mini"><img src="{png(d["files"][k])}" alt="{label}, {cap}"><figcaption>{cap}</figcaption></figure>'
        for k, cap in (("empty", "empty"), ("child", "after Add: the child"), ("clicked", "a row clicked"), ("reordered", "after reorder"), ("removed", "after remove"))
    )
    rec = ' <span class="tag">default</span>' if cid == "list" else ""
    return f"""
<section class="variant" id="v-{cid}">
  <h3>{label}{rec} <span class="axis">axis: {axis}</span> <span class="meas">{d["height"]}px with three members</span></h3>
  <p>{blurb}</p>
  <div class="two">
    <figure class="card"><img src="{png(d["files"]["filled"])}" alt="{label}, dark, three members"><figcaption>dark · three members</figcaption></figure>
    <figure class="card"><img src="{png(l["files"]["filled"])}" alt="{label}, light, three members"><figcaption>light · three members</figcaption></figure>
  </div>
  <div class="strip">{strip}</div>
</section>"""


VARIANTS = "\n".join(variant_card(*c) for c in CONTROLS)

heights = {cid: by[("dark", cid)]["height"] for cid, *_ in CONTROLS}
worst = max(heights.values())
HEIGHT_ROWS = "\n".join(
    f'<tr><th>{label}</th><td class="num"><div class="bar" style="width:{round(100 * heights[cid] / worst)}%"></div><span class="h">{heights[cid]}px</span></td></tr>'
    for cid, label, *_ in CONTROLS
)

renders = by[("dark", "renders")]["files"]
RENDERS = "".join(
    f'<figure class="card"><img src="{webp(renders[r])}" alt="member click on the {name} render"><figcaption>{name} — the Pill inside the Stack was clicked; the inspector shows the Pill, the path says where it is</figcaption></figure>'
    for r, name in (("dom", "DOM"), ("reactflow", "React Flow"), ("tldraw", "tldraw"))
)

depth = by[("dark", "outline-depth")]["files"]
depth_light = by[("light", "outline-depth")]["files"]
code = by[("dark", "code")]

n_controls = len(CONTROLS)
lines_model = wc("packages/panel/src/members/model.ts")
lines_controls = sum(wc(f"packages/panel/src/members/{f}.tsx") for f in ("List", "Chips", "Outline", "Grouped", "Stepper", "shared"))
tests = measured_lines("packages/panel/test/members.test.ts", "^\\s*it(")
asserts = measured_lines("demos/capture-members-control.mjs", "assert(")

HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Members control — five variants · {DATE}</title>
<style>
  :root {{ --ink:#16161a; --muted:#65656f; --line:#e3e3e8; --bg:#fbfbfc; --card:#fff; --accent:#5b45d6; --win:#2f7d5b; --warn:#c06413 }}
  * {{ box-sizing:border-box }}
  body {{ margin:0; background:var(--bg); color:var(--ink); font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif }}
  main {{ max-width:1100px; margin:0 auto; padding:48px 24px 96px }}
  h1 {{ font-size:30px; line-height:1.25; margin:0 0 8px; letter-spacing:-.02em }}
  h2 {{ font-size:21px; margin:56px 0 12px; letter-spacing:-.01em }}
  h3 {{ font-size:17px; margin:36px 0 8px; display:flex; flex-wrap:wrap; gap:10px; align-items:baseline }}
  .lede {{ font-size:18px; color:var(--muted); margin:0 0 24px }}
  .axis {{ font-size:12px; font-weight:500; color:var(--accent); text-transform:uppercase; letter-spacing:.04em }}
  .meas {{ font-size:12px; color:var(--muted); font-weight:400 }}
  .tag {{ font-size:11px; background:var(--win); color:#fff; border-radius:999px; padding:1px 8px; font-weight:600 }}
  code {{ font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; background:#f1f1f4; padding:1px 5px; border-radius:4px }}
  pre {{ background:#16161a; color:#e8e8ee; padding:14px 16px; border-radius:8px; overflow:auto; font:12.5px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace }}
  .two {{ display:grid; grid-template-columns:1fr 1fr; gap:16px }}
  .three {{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px }}
  figure {{ margin:0 }}
  .card {{ background:var(--card); border:1px solid var(--line); border-radius:10px; overflow:hidden }}
  .card img {{ display:block; width:100%; height:auto }}
  .card figcaption {{ font-size:12px; color:var(--muted); padding:8px 12px; border-top:1px solid var(--line) }}
  .strip {{ display:grid; grid-template-columns:repeat(5,1fr); gap:8px; margin-top:10px }}
  .mini {{ border:1px solid var(--line); border-radius:8px; overflow:hidden; background:var(--card) }}
  .mini img {{ display:block; width:100%; height:auto; max-height:240px; object-fit:cover; object-position:top }}
  .mini figcaption {{ font-size:11px; color:var(--muted); padding:4px 8px; border-top:1px solid var(--line) }}
  table {{ border-collapse:collapse; width:100%; font-size:14px }}
  th, td {{ text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); vertical-align:top }}
  th {{ font-weight:600; white-space:nowrap }}
  td.num {{ position:relative; width:60% }}
  .bar {{ position:absolute; left:0; top:6px; bottom:6px; background:#e4e0fa; border-radius:4px; z-index:0 }}
  .h {{ position:relative; z-index:1; font-variant-numeric:tabular-nums }}
  .hero {{ border:1px solid var(--line); border-radius:12px; overflow:hidden; background:#000 }}
  .hero video, .hero img {{ display:block; width:100%; height:auto }}
  .decide li {{ margin-bottom:8px }}
  .note {{ background:#fff7ed; border:1px solid #fed7aa; border-radius:8px; padding:10px 14px; font-size:14px }}
  ol.contract li {{ margin-bottom:4px }}
  .run {{ background:#f1f1f4; border-radius:8px; padding:10px 14px; font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; overflow:auto }}
</style></head>
<body><main>

<h1>Members control — five variants, one contract, picked live in the app</h1>
<p class="lede">A standard inspector section that appears automatically for any component that declares it holds members. Add is typed, a member is selected by clicking it (the inspector switches to the child), a path climbs back out. Built on bbox-ui.com/create, behind a <strong>Members control</strong> switcher in the sidebar; <strong>List</strong> is applied by default.</p>

<div class="hero">
  <video autoplay muted loop playsinline controls poster="{webp(by[("dark", "list")]["files"]["page"])}">
    <source src="{data_uri(MEDIA / "hero.mp4", "video/mp4")}" type="video/mp4">
    <img src="{data_uri(MEDIA / "hero.gif", "image/gif")}" alt="The List control: empty, Add a Port, the inspector shows the Port, back to the Stack, three members, a row clicked, reordered, removed">
  </video>
</div>
<p class="meas">Recorded from the real page by the journey: empty → Add a Port → the inspector shows the Port → the path climbs back → three members → a row clicked → dragged to reorder → one removed. GIF fallback inside the video tag.</p>

<h2>What was decided before drawing anything</h2>
<ul>
  <li><strong>A member list is not a field.</strong> <code>FieldValue</code> stays a scalar and none of the six panel designs learned about arrays. A component declares <code>members: {{ accepts: [...], max?, label? }}</code> on its registry entry, and the inspector adds the section itself. Stack, RowContainer, PortEdge and Block declare it; Port, Pill, Glyph and TextBox are leaves and do not.</li>
  <li><strong>The stored fact is the parent's ordered id list.</strong> No child stores a parent pointer. Parent, depth, subtree and breadcrumb are all derived in <code>members/model.ts</code> ({lines_model} lines, {tests} unit tests). Same answer SystemSketch reached on 2026-09-09: order is the child index on the parent.</li>
  <li><strong>A member is drawn inside its parent by the parent's own component</strong>, never as a node of its own — one <code>renderInstance</code> for all three renders. A pointer-down on a member selects it and stops there.</li>
  <li><strong>No nested editor.</strong> Clicking a member makes it the inspector's subject, exactly as clicking it on the board would. A breadcrumb (<em>Inside ☰ Stack 1 › Port A</em>) is what makes that a two-way door.</li>
</ul>

<h3>The contract every control satisfies</h3>
<ol class="contract">
  <li>Every member shown, in order, with its type and a title.</li>
  <li>Add is typed (only what the parent accepts) and capped (<code>max</code>).</li>
  <li>Clicking a member selects it — the inspector switches to the child.</li>
  <li>Remove and reorder are reachable for every member.</li>
  <li>Empty says what can be added, not nothing.</li>
  <li>No nested editor: a member's own fields are edited by selecting it.</li>
</ol>
<p>The journey (<code>demos/capture-members-control.mjs</code>, {asserts} assertions) walks all six for each of the five, in both themes, reading the inspector header and the rendered DOM rather than the control's own claims.</p>

<h2>The five</h2>
<p>Each one moves a single axis, so the comparison is about that axis and nothing else:</p>
<ul>{INDEX_AXIS}</ul>

<table>
  <thead><tr><th>Control</th><th>Height with three members (dark, measured)</th></tr></thead>
  <tbody>{HEIGHT_ROWS}</tbody>
</table>

{VARIANTS}

<h3>Outline, with real depth</h3>
<p>The three-member captures above are all leaves, so Outline looked like List. Here the Stack holds a Port and a Block, and the Block holds a Port of its own. The grandchild row is one click away; clicking it shows the Port with both ancestors in the path.</p>
<div class="three">
  <figure class="card"><img src="{png(depth["depth"])}" alt="Outline with a nested Block"><figcaption>dark · the subtree, depths 0, 0, 1</figcaption></figure>
  <figure class="card"><img src="{png(depth_light["depth"])}" alt="Outline with a nested Block, light"><figcaption>light · same</figcaption></figure>
  <figure class="card"><img src="{png(depth["jumped"])}" alt="The grandchild selected"><figcaption>dark · the grandchild row clicked: inside Stack 1 › Block 1</figcaption></figure>
</div>

<h2>Click a child anywhere and the inspector follows</h2>
<p>Zach's ask was "if I click any of those children then it could change the inspector panel to them". That holds on all three renders, not only in the control. The Pill inside the Stack was clicked with a real pointer on each canvas:</p>
<div class="three">{RENDERS}</div>
<p class="note">tldraw needed one fix to make this true: a member has no shape of its own, so selecting it writes an empty selection into the editor, and tldraw's store listeners flush on the <em>next frame</em> — after the sync guard has been lowered — reporting "nothing selected" back and clearing the child. The editor→page listeners now compare against the page's <em>shape-backed</em> selection, so that echo is a no-op while a real click on a shape still wins. Found by the journey, not by reading.</p>

<h2>The Code view prints members nested</h2>
<div class="two">
  <figure class="card"><img src="{webp(code["files"]["code"])}" alt="Code view with a nested Port"><figcaption>DOM · Code, a Stack holding a Port</figcaption></figure>
  <pre>{code["code"]}</pre>
</div>
<p><code>members</code> is never printed as an attribute — it is not a prop. The React Flow and tldraw code views print the same nested element inside their generic bench node / shape.</p>

<h2>Stock parts</h2>
<table>
  <thead><tr><th>Element</th><th>Today</th><th>Off-the-shelf part (exact name)</th><th>Behaviour that must survive</th></tr></thead>
  <tbody>
    <tr><th>Reorder by drag (List, Chips)</th><td>hand-rolled pointer loop in SystemSketch's Arms section</td><td><code>DndContext</code> + <code>SortableContext</code> + <code>useSortable</code> from <code>@dnd-kit/sortable</code>; <code>verticalListSortingStrategy</code> / <code>rectSortingStrategy</code></td><td>drag the grip (List) or the chip (Chips); 3px activation distance so a click is a click; the drop calls one <code>onMove(from, to)</code></td></tr>
    <tr><th>Reorder by button/key (Outline, Grouped, Stepper)</th><td>—</td><td>none needed; ↑↓ buttons and ←→ on a focused square call the same <code>onMove</code></td><td>one reducer, five gestures</td></tr>
    <tr><th>The tree</th><td>—</td><td>plain derivation over the parent's id list (<code>parentMap</code>, <code>subtreeIds</code>, <code>ancestry</code>)</td><td>no parent pointer stored anywhere</td></tr>
    <tr><th>Typed Add</th><td>—</td><td>a shared <code>AddMemberMenu</code>; native <code>&lt;select&gt;</code> on Stepper</td><td>offers exactly <code>accepts</code>, disabled at <code>max</code>, adds directly when only one kind fits</td></tr>
    <tr><th>Field rows, tiers, filter, Mixed, provenance</th><td colspan="3"><strong>unchanged (stock seam)</strong> — the six panel designs and <code>readFieldRow</code> were not touched</td></tr>
    <tr><th>Selection, positions, the three renders</th><td colspan="3"><strong>unchanged (stock seam)</strong> — the page still owns all of it; the renders only draw roots now and nest the rest</td></tr>
  </tbody>
</table>

<h2>Decisions — each with the default taken if you say nothing</h2>
<ul class="decide">
  <li><strong>D1 · Which control ships.</strong> Recommendation: <strong>List</strong> as the default section, with <strong>Chips</strong> as the Simple-tier collapsed form once tiers reach sections (a one-row Members field in the Figma Dense grammar). Outline earns its place the day a board nests three deep; Grouped and Stepper are the two ends of the information axis and are kept as the record. Default if silent: List stays applied; the switcher stays.</li>
  <li><strong>D2 · What a parent accepts.</strong> Stack: Block, Stack, RowContainer and the four leaves; RowContainer: leaves; PortEdge: Port only; Block: Stack, RowContainer and leaves (its body). Default: as declared in <code>MEMBER_SPECS</code>, one line each to widen.</li>
  <li><strong>D3 · A member has no canvas position.</strong> It sits inside its parent on every render. Default: yes — a member with an x/y would be a node, and then the parent would not contain it.</li>
  <li><strong>D4 · The added member is selected immediately.</strong> Add takes you into the child; the path takes you back. Default: yes. The alternative (stay on the parent) makes "add three Ports" one click faster and "add and name it" two clicks slower; the path makes both cheap.</li>
  <li><strong>D5 · Removing a member removes its subtree</strong> and lands the selection on the parent, so the inspector never goes blank mid-edit. Default: yes.</li>
</ul>

<h2>What is left, and what was deliberately not done</h2>
<ul>
  <li><strong>Not done:</strong> dragging a member OUT of a parent onto the canvas, or a root INTO a parent (re-parenting by drag). The model has <code>wouldCycle</code> ready for it; no gesture calls it yet.</li>
  <li><strong>Not done:</strong> a Members section on the Mixed bench's multi-selection — it appears only for a single selected instance, on purpose (adding to three Stacks at once is a real feature and a different one).</li>
  <li><strong>Known:</strong> Stepper's kind picker resets after each Add, because the control unmounts when the inspector moves to the child and remounts on the way back. Inherent to D4; a stored "last added kind" would fix it if Stepper is picked.</li>
  <li><strong>Known:</strong> on tldraw, clicking empty canvas while a <em>member</em> is selected does not deselect it (the empty editor selection equals the page's shape-backed selection). Clicking any shape does.</li>
  <li><strong>Next:</strong> the sidebar lists members indented under their parent with a type glyph; a small disclosure there would let a long tree fold.</li>
</ul>

<h2>Run it</h2>
<p>From any terminal, then open <code>http://localhost:4110/create</code> (use <em>localhost</em>, not the IP — Next refuses to hydrate by IP). Pick <strong>Stack</strong> as the component; the Members control switcher is at the bottom of the sidebar.</p>
<div class="run">pnpm --dir /home/bam/bbox-ui/.claude/worktrees/members-control --filter @bbox-ui/docs exec next dev --port 4110</div>
<p class="meas">Branch <code>claude/members-control</code> in /home/bam/bbox-ui, cut from <code>claude/create-page</code>. {n_controls} controls, {lines_controls} lines under <code>packages/panel/src/members/</code>. Report built by <code>docs/build_members_control.py</code> from the journey's manifest.</p>

</main></body></html>
"""

OUT.write_text(HTML)
print(f"wrote {OUT} ({OUT.stat().st_size / 1e6:.2f} MB)")
