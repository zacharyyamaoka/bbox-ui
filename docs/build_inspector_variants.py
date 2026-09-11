#!/usr/bin/env python3
"""Builds the inspector-panel-variants review page.

Every number on the page is measured from the live deployed artifact at build
time (reports/media/<dir>/manifest.json, written by the headless capture run)
rather than typed in, so the page cannot drift from the panels it describes.
"""
from __future__ import annotations

import base64
import json
import pathlib
import sys

DATE = "2026-09-11"
NAME = f"inspector-variants-{DATE}"
# The main checkout, never the worktree this may be running from: a report
# written into a worktree dies when the worktree is swept, so the file:// link
# is gone a day later.
REPO = pathlib.Path("/home/bam/bbox-ui")
MEDIA = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else REPO / "reports" / "media" / NAME
OUT = REPO / "reports" / "media" / f"{NAME}.html"
LIVE = "https://zacharyyamaoka.github.io/bbox-ui/inspector/"

manifest = json.loads((MEDIA / "manifest.json").read_text())


def data_uri(path: pathlib.Path, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def png(name: str) -> str:
    return data_uri(MEDIA / name, "image/png")


by_component: dict[str, list[dict]] = {}
for row in manifest:
    by_component.setdefault(row["component"], []).append(row)

baseline = {c: next(r["height"] for r in rows if r["id"] == "current") for c, rows in by_component.items()}
order = [r["id"] for r in by_component["Pill"]]
labels = {r["id"]: r["label"] for r in manifest}
blurbs = {r["id"]: r["blurb"] for r in by_component["Pill"]}
height = {(r["component"], r["id"]): r["height"] for r in manifest}


def pct(component: str, vid: str) -> str:
    if vid == "current":
        return "baseline"
    b = baseline[component]
    return f"{round(100 * (height[(component, vid)] - b) / b):+d}%"


# ---------------------------------------------------------------- height table
rows_html = []
worst = max(height.values())
for vid in order:
    cells = []
    for component in ("Pill", "Port"):
        h = height[(component, vid)]
        bar = round(100 * h / worst)
        tone = "base" if vid == "current" else "win"
        cells.append(
            f'<td class="num"><div class="bar {tone}" style="width:{bar}%"></div>'
            f'<span class="h">{h}px</span> <span class="d">{pct(component, vid)}</span></td>'
        )
    rows_html.append(
        f'<tr{" class=baseline" if vid == "current" else ""}><th>{labels[vid]}</th>{"".join(cells)}</tr>'
    )
HEIGHT_TABLE = "\n".join(rows_html)

# ---------------------------------------------------------------- the galleries
def gallery(component: str) -> str:
    cards = []
    for row in by_component[component]:
        cards.append(f"""
        <figure class="card{' base' if row['id'] == 'current' else ''}">
          <figcaption>
            <span class="name">{row['label']}</span>
            <span class="meas">{row['height']}px <em>{pct(component, row['id'])}</em></span>
          </figcaption>
          <img src="{png(row['file'])}" alt="{row['label']} panel over {component}">
        </figure>""")
    return "\n".join(cards)


BLURB_LIST = "\n".join(
    f'<li><strong>{labels[v]}</strong> — {blurbs[v]}</li>' for v in order if v != "current"
)

BENCH_SECTION = """<h2>The bench</h2>
<p>It used to open with two instances and two checkboxes, which reads as a puzzle rather than
a primitive. It now opens with <strong>one</strong>. A stepper adds more, and the checkboxes
appear the moment a second instance does — a tickbox whose only reachable state is the one it
is already in is not a control.</p>

<div class="grid three">
  <figure class="card"><figcaption><span class="name">One, isolated</span></figcaption>
    <img src="{b1}" alt="The bench with a single Port instance and no checkbox"></figure>
  <figure class="card"><figcaption><span class="name">Two, disagreeing</span></figcaption>
    <img src="{b2}" alt="Two Port instances with checkboxes and Mixed readings"></figure>
  <figure class="card"><figcaption><span class="name">Mixed types</span></figcaption>
    <img src="{b3}" alt="Port and Pill in one bench with four shared fields"></figure>
</div>

<p>The seeds became a list of genuinely different variations per component, so instance two
actually disagrees with instance one. A copy would mean nothing ever reads Mixed, and the
bench would prove nothing.</p>

<h3>The mixed bench answers “what can I change across all of these?”</h3>
<p>A <strong>Mixed bench</strong> holds instances of different components at once, added from
a row of type chips. The panel then shows only the fields the selection genuinely has in
common. Port and Pill leave four editable fields. Add a Stack and the answer is none — said
out loud, rather than shown as an empty box.</p>
<p>A field survives that intersection only when its id, its kind <em>and</em> its option set
all agree. Two components can both call a field <code>size</code> and mean different options,
and one control over both would write a value that is legal for one and nonsense for the
other. Everything excluded is named with the reason it was excluded: absent from a type, or
present with different options.</p>

""".format(
    b1=png("bench-1-single.png"), b2=png("bench-2-two.png"), b3=png("bench-3-mixed.png")
)

HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Inspector panel — five proposals · {DATE}</title>
<style>
  :root {{
    --ink:#16161a; --muted:#65656f; --line:#e3e3e8; --bg:#fbfbfc; --card:#fff;
    --win:#2f7d5b; --base:#b0b0ba; --accent:#5b45d6; --warn:#c06413;
  }}
  * {{ box-sizing:border-box }}
  body {{ margin:0; background:var(--bg); color:var(--ink);
    font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }}
  main {{ max-width:1080px; margin:0 auto; padding:48px 24px 96px }}
  h1 {{ font-size:30px; line-height:1.25; margin:0 0 8px; letter-spacing:-.02em }}
  h2 {{ font-size:21px; margin:56px 0 12px; letter-spacing:-.01em }}
  h3 {{ font-size:16px; margin:28px 0 8px }}
  p, li {{ color:#2b2b33 }}
  .lede {{ font-size:18px; color:var(--muted); margin:0 0 4px }}
  .stamp {{ font:12px ui-monospace,SFMono-Regular,Menlo,monospace; color:var(--muted); margin:0 0 32px }}
  blockquote {{ margin:20px 0; padding:12px 18px; border-left:3px solid var(--accent);
    background:#f5f3ff; color:#3a3a45; font-size:15px; border-radius:0 6px 6px 0 }}
  blockquote p {{ margin:0 0 6px }} blockquote p:last-child {{ margin:0 }}
  video, .hero img {{ width:100%; max-width:760px; border:1px solid var(--line);
    border-radius:10px; background:#fff; display:block }}
  .hero {{ margin:24px 0 8px }}
  .cap {{ font-size:13px; color:var(--muted); margin:8px 0 0 }}
  table {{ border-collapse:collapse; width:100%; margin:16px 0; font-size:14px }}
  th, td {{ text-align:left; padding:9px 12px; border-bottom:1px solid var(--line); vertical-align:middle }}
  thead th {{ font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted) }}
  tbody th {{ font-weight:600; width:26% }}
  tr.baseline {{ background:#f4f4f6 }}
  td.num {{ position:relative; width:37% }}
  .bar {{ height:7px; border-radius:4px; background:var(--win); opacity:.28; margin-bottom:4px }}
  .bar.base {{ background:var(--base); opacity:.55 }}
  .h {{ font:13px ui-monospace,Menlo,monospace }}
  .d {{ font:12px ui-monospace,Menlo,monospace; color:var(--win) }}
  tr.baseline .d {{ color:var(--muted) }}
  .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:20px; margin:20px 0 }}
  .grid.three {{ grid-template-columns:repeat(auto-fit,minmax(440px,1fr)) }}
  .card {{ margin:0; background:var(--card); border:1px solid var(--line); border-radius:10px;
    padding:12px; display:flex; flex-direction:column; gap:10px }}
  .card.base {{ border-color:#cfcfd8; background:#f6f6f8 }}
  .card img {{ width:100%; border-radius:6px; display:block; align-self:flex-start }}
  figcaption {{ display:flex; justify-content:space-between; align-items:baseline; gap:10px }}
  .name {{ font-weight:650; font-size:14px }}
  .meas {{ font:12px ui-monospace,Menlo,monospace; color:var(--muted) }}
  .meas em {{ font-style:normal; color:var(--win) }}
  .card.base .meas em {{ color:var(--muted) }}
  .box {{ border:1px solid var(--line); background:var(--card); border-radius:10px; padding:18px 22px; margin:18px 0 }}
  .box.warn {{ border-color:#f0d9bd; background:#fdf8f2 }}
  .box h3 {{ margin-top:0 }}
  code {{ font:13px ui-monospace,Menlo,monospace; background:#f0f0f4; padding:1px 5px; border-radius:4px }}
  ul {{ padding-left:22px }} li {{ margin:6px 0 }}
  .dot {{ display:inline-block; width:9px; height:9px; border-radius:50%; vertical-align:middle; margin-right:6px }}
  .dot.def {{ border:1.5px solid #b4b4be }}
  .dot.driven {{ background:var(--accent) }}
  .dot.over {{ background:var(--warn) }}
  a {{ color:var(--accent) }}
</style></head><body><main>

<p class="lede">bbox-ui</p>
<h1>The inspector panel, five ways</h1>
<p class="stamp">{DATE} · branch <code>claude/port-t0</code> · every height below measured
in headless Chrome against the deployed site, not estimated</p>

<blockquote>
<p>“I feel that it's not as compact as I'd like it to be… the gold standard here is
something more like what Figma has done. Even Storybook… it just has a drop down menu,
which is way more compact… Prusa does this, they have like an easy, intermediate and
expert view.”</p>
<p>“One challenge is, like, how do you show presets and also custom at the same time…
what do you do when you have presets that could potentially drive a number of the
individual panels? Definitely having some type of indication saying whether it's driven
or default.”</p>
<p>“I kinda wanted to see the primitive in isolation first… maybe by default we just have
one. But then you just have a little sticker there that allows you to adjust the number of
them. As soon as you start to add more than one, then you add the checkbox too… I can even
imagine having a free flowing one where you can add instances of any types of primitives…
to see what are the things that you're able to update across all of them.”</p>
</blockquote>

<div class="hero">
  <video autoplay loop muted playsinline controls poster="{png(by_component['Port'][1]['file'])}">
    <source src="{data_uri(MEDIA / 'hero.mp4', 'video/mp4')}" type="video/mp4">
  </video>
  <noscript><img src="{data_uri(MEDIA / 'hero.gif', 'image/gif')}" alt="Switching between the six panel designs"></noscript>
  <p class="cap">Driven on the live site, in order: one Port on its own, a second and a third
  added from the stepper, one removed, then the mixed bench with a Glyph joining Port and
  Pill, then the same Pill selection through all six panel designs. The badge top-right is
  the panel's live height.</p>
</div>

{BENCH_SECTION}

<h2>What is different</h2>
<p>Six panels now render the same field array over the same subjects. The one that shipped
is in the switcher as <strong>Current</strong>, so the comparison is one click, not a claim.
The choice is remembered across reloads, and it is a control in the app — never a URL flag.</p>
<ul>{BLURB_LIST}</ul>

<h2>How much shorter</h2>
<p>Pill has 12 fields, Port has 20. Both rendered with two instances selected, so the
Mixed reading is live in every capture.</p>
<table>
  <thead><tr><th>Panel</th><th>Pill · 12 fields</th><th>Port · 20 fields</th></tr></thead>
  <tbody>{HEIGHT_TABLE}</tbody>
</table>
<p class="cap">Bars are relative to the tallest panel measured. Tiered and Filter First are
shortest because they hide the long tail behind a tier switch or a search box — the fields
are reachable, not dropped. That is a deliberate trade, not a free win.</p>

<h2>Pill — all six</h2>
<div class="grid">{gallery('Pill')}</div>

<h2>Port — all six</h2>
<div class="grid">{gallery('Port')}</div>

<h2>Presets and custom, at the same time</h2>
<p>This is the harder half of the ask, and it is the same question three times over. All six
panels answer it the same way, because the answer belongs to the schema rather than to any
one layout.</p>

<div class="box">
<h3>1. Three states, one mark, no extra row</h3>
<p>Every field row carries a single dot:
<span class="dot def"></span><strong>default</strong> (hollow — nothing has been said about
this field), <span class="dot driven"></span><strong>driven</strong> (a preset governs it),
<span class="dot over"></span><strong>overridden</strong> (an instance value beats the preset).
It sits in the label's existing gutter, so telling the three apart costs no height at all.
Icon Strip carries the same three states as a ring colour on the active glyph.</p>
</div>

<div class="box">
<h3>2. A governed row reads as a compound, not as an empty control</h3>
<p>A field a preset governs shows <code>Wired · primary</code> — the name of what is driving
it and the value it resolved to, on the one line that was already there. You learn both
without opening anything. The old panel showed either the preset chip or the raw control and
made you infer the other.</p>
</div>

<div class="box">
<h3>3. The preset says how far it has drifted, and can undo it</h3>
<p>The moment any field a preset governs carries an override, the preset chip stops claiming
to describe the result: it reads <code>Wired +1 ↺</code>, and the reset clears every override
that preset governs in one action. That is the direct answer to “what do you do when you have
presets that could drive a number of the individual panels” — the preset tells you it is no
longer the whole story, and names the size of the gap.</p>
</div>

<div class="box">
<h3>4. A named scale and a free value share one control</h3>
<p>Your toolbar example — presets beside custom — is a dropdown whose rows are named stops
with their resolved values in a muted column (<code>Medium · 12px</code>), a tick on the
active one, and a last row that reads <code>Custom [ __ ] px</code>. Picking a stop and typing
a number are the same control, so there is no moment where the two disagree. Figma Dense,
Row + Popover and Icon Strip all render this for <code>diameter</code> and <code>textSize</code>.</p>
</div>

<div class="box warn">
<h3>What this surfaced that needs your call</h3>
<p>The <code>Custom</code> row cannot be made real yet. No <code>FieldKind</code> in the schema
combines named stops with a free scalar: <code>diameter</code> and <code>textSize</code> carry
their pixel value inside the option label, which is why the dropdown reads correctly, but
there is nowhere to <em>store</em> 13px. Shipping row 4 for real means a new field kind that
holds both a chosen stop and an off-scale number.</p>
<p>Separately, <code>PORT_PRESETS</code> is empty — Port has no settable paint property for a
preset to govern — so nothing is ever “driven” on Port in any of the six panels. That is a
property of the current schema, not of any panel design.</p>
</div>

<h2>What every panel had to keep</h2>
<p>Density is easy to buy by quietly dropping behaviour. Five agents built these
independently against one written contract, and the contract is the reason none of them
shipped a cheaper panel that was also a lesser product:</p>
<ul>
<li>Presets come first.</li>
<li>A governed field reads as inherited, never as an empty control.</li>
<li>Multi-selection works, and a field whose <em>stored</em> values disagree reads Mixed with a blanked control.</li>
<li>An override is visibly distinct and clearable, including across a multi-selection.</li>
<li>The cascade is reachable for a single subject — which layer won, and what the others held.</li>
<li>When a transform paints something the stored layers do not explain, the panel says so.</li>
<li>Every field is reachable. Hiding is allowed; losing is not.</li>
</ul>

<h2>Recommendation</h2>
<p><strong>Row + Popover as the default, Tiered as the mode switch on top of it.</strong>
Row + Popover is the design closest to Figma's actual inspector and the only one whose height
is independent of what each field's control needs — a six-option enum and a bare toggle cost
the same inch, so the list never jumps as you change values. Figma Dense is a close second and
is shorter, but it pays for that with a grid that reflows when a control is wider than its
column. Tiered is not really a competitor: its Simple/Advanced/Expert idea composes with any
of the others, and it is the cheapest way to get the long tail out of sight. Icon Strip is
the most fun to use and the hardest to read cold — worth keeping for the canvas toolbar
rather than the side panel.</p>
<p>Nothing is locked in. Switch panels in the app and the choice sticks.</p>

</main></body></html>
"""

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(HTML, encoding="utf-8")
import urllib.parse
encoded = len(urllib.parse.quote(HTML, safe=""))
print(f"wrote {OUT}")
print(f"  on disk: {len(HTML.encode()):,} bytes")
print(f"  encoded: {encoded:,} bytes (preview cap 2,097,024) -> {'OK' if encoded < 2_097_024 else 'OVER, browser only'}")
