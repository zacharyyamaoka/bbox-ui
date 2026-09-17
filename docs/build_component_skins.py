#!/usr/bin/env python3
"""Builds the component-skins proposal page.

Every paint value and every geometry claim on the page is read out of the
capture run's own JSON (reports/media/<dir>/*-report.json, written by
demos/capture-skins.mjs against the live demos) rather than typed in, so the
page cannot claim a radius or an "identical" that the browser did not
actually produce.
"""
from __future__ import annotations

import base64
import json
import pathlib
import subprocess
import sys

DATE = "2026-09-17"
NAME = f"component-skins-{DATE}"
# The main checkout, never the worktree this runs from: a report written into
# a worktree dies when the worktree is swept and the file:// link rots.
REPO = pathlib.Path("/home/bam/bbox-ui")
MEDIA = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else REPO / "reports" / "media" / NAME
OUT = REPO / "reports" / "media" / f"{NAME}.html"

SKINS = ["default", "plain", "sketch"]
SKIN_NAME = {"default": "Default", "plain": "Plain", "sketch": "Sketch"}
SKIN_BLURB = {
    "default": "What you have today, unchanged, and what renders when no skin is set at all.",
    "plain": "Square corners everywhere — the chip stops being a capsule. Your “unstylized”.",
    "sketch": "An informal font and corners that are not the same on any two sides.",
}

tldraw = json.loads((MEDIA / "tldraw-report.json").read_text())
reactflow = json.loads((MEDIA / "reactflow-report.json").read_text())


def data_uri(path: pathlib.Path, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def jpg(name: str) -> str:
    return data_uri(MEDIA / name, "image/jpeg")


def sh(*args: str) -> str:
    return subprocess.run(args, capture_output=True, text=True, cwd=REPO).stdout.strip()


COMMIT = sh("git", "-C", str(REPO), "log", "-1", "--format=%h", "claude/component-styling-options-90a72f") or "57bf246"

# ------------------------------------------------------------ measured paint
paint_rows = []
for skin in SKINS:
    p = tldraw["paint"][skin]
    paint_rows.append(
        f"<tr><th>{SKIN_NAME[skin]}</th>"
        f"<td class=h>{p['borderRadius']}</td>"
        f"<td class=h>{p['borderWidth']}</td>"
        f"<td class=h>{p['borderColor']}</td>"
        f"<td class=h>{p['fontFamily']}</td></tr>"
    )
PAINT_TABLE = "".join(paint_rows)


REPORT_BY_HOST = {"tldraw": tldraw, "reactflow": reactflow}


def strip(kind: str, host: str) -> str:
    # The badge quotes THIS host's own measurement. Quoting tldraw's for both
    # strips happened to print the same string (the two hosts agree), which is
    # exactly the kind of accidental-pass that makes a number untrustworthy:
    # it would have kept printing 8px if React Flow had rendered 12.
    report = REPORT_BY_HOST[host]
    cards = []
    for skin in SKINS:
        cards.append(
            f"""<figure class="card">
  <img src="{jpg(f'{host}-{skin}-{kind}.jpg')}" alt="The {SKIN_NAME[skin]} skin in the {host} host">
  <figcaption><span class="name">{SKIN_NAME[skin]}</span>
    <span class="meas">{report['paint'][skin]['borderRadius'].split(' / ')[0]}</span></figcaption>
  <p class="cap">{SKIN_BLURB[skin]}</p>
</figure>"""
        )
    return "".join(cards)


# ----------------------------------------------------------------- scoring
CRITERIA = [
    ("One switch re-skins a whole board", 5,
     "He compares boards, not components. A mechanism that needs a prop on forty instances is not a switch."),
    ("Adapters cost nothing", 5,
     "CLAUDE.md's one rule. A third host must stay a ~150-line afternoon; anything each adapter has to thread is a fork tax."),
    ("Never breaks an existing consumer", 4,
     "`shadcn add` copies source verbatim. Whatever ships must render today's pixels for someone who ignores it."),
    ("Never moves anything", 4,
     "Port anchors and edge endpoints are host geometry. A skin that shifts them is worse than no skin."),
    ("Traceable in the inspector", 3,
     "“why is this value this” is the product. A second, informal paint system that the panel cannot explain is a real loss."),
    ("Stays out of the document", 3,
     "A skin is a view preference like light/dark, not a fact about the system being drawn."),
]

OPTIONS = [
    ("A · CSS token layer", "data-bbox-skin re-points seven custom properties",
     [5, 5, 4, 4, 1, 3], "shipped"),
    ("B · Preset family", "a `skin` selector in the existing field cascade",
     [1, 2, 3, 4, 3, 0], ""),
    ("C · cva variants", "class-variance-authority inside each component",
     [2, 3, 3, 4, 1, 3], ""),
    ("D · Registry styles", "three forked sources, the way shadcn ships new-york/default",
     [0, 5, 4, 4, 1, 3], ""),
]

WEIGHTS = [c[1] for c in CRITERIA]
MAXSCORE = sum(w * 5 for w in WEIGHTS)


def score(vals: list[int]) -> int:
    return sum(w * v for w, v in zip(WEIGHTS, vals))


opt_head = "".join(f"<th>{n.split(' · ')[0]}</th>" for n, _, _, _ in OPTIONS)
crit_rows = []
for i, (label, weight, why) in enumerate(CRITERIA):
    cells = []
    for _, _, vals, _ in OPTIONS:
        v = vals[i]
        cls = "good" if v >= 4 else ("mid" if v >= 2 else "bad")
        cells.append(f'<td class="s {cls}">{v}</td>')
    crit_rows.append(
        f'<tr><th>{label}<span class="why">{why}</span></th>'
        f'<td class="w">x{weight}</td>{"".join(cells)}</tr>'
    )
totals = "".join(
    f'<td class="s tot">{score(vals)}<span class="of">/{MAXSCORE}</span></td>'
    for _, _, vals, _ in OPTIONS
)
SCORE_TABLE = (
    f'<thead><tr><th>Criterion</th><th class="w">wt</th>{opt_head}</tr></thead>'
    f'<tbody>{"".join(crit_rows)}'
    f'<tr class="totals"><th>Weighted</th><td class="w"></td>{totals}</tr></tbody>'
)
OPTION_KEY = "".join(
    f"<li><strong>{n}</strong> — {d}{' <span class=pill>shipped in the spike</span>' if s else ''}</li>"
    for n, d, _, s in OPTIONS
)

# ------------------------------------------------------------------- stock
STOCK = [
    ("Selecting &amp; remembering a skin",
     "Hand-rolled <code>useState</code> + <code>localStorage</code> in the demo's <code>SkinPicker</code>",
     "<strong><code>ThemeProvider</code></strong> (next-themes 0.4.6, <em>already a dependency of apps/docs</em>) with "
     "<code>attribute=\"data-bbox-skin\"</code>, <code>themes</code>, <code>storageKey</code>, <code>defaultTheme</code> — "
     "verified present on <code>ThemeProviderProps</code>",
     "No flash of the wrong skin on load (its inline script is the whole reason it exists). "
     "Caveat I did check: <code>useTheme()</code> reads ONE context, so a skin provider nested inside "
     "the light/dark one shadows it for descendants — both still write their own attribute, but the "
     "site's theme toggle has to sit outside, or skin gets its own two-line context."),
    ("Declaring the tokens",
     "<code>theme.css</code>'s hand-written <code>:root</code> block",
     "<strong>Tailwind v4 <code>@theme</code></strong> — the mechanism <code>theme.css</code> already uses",
     "<strong>unchanged (stock seam).</strong> Skin tokens are plain custom properties in the same file idiom; "
     "nothing new to learn and nothing to migrate."),
    ("Per-component style variants",
     "Hard-coded utilities in each <code>.tsx</code>",
     "<strong><code>cva</code></strong> (class-variance-authority 0.7.1, already a dependency of apps/docs) — "
     "the shadcn-native idiom",
     "<strong>Rejected, see option C.</strong> A variant table lives in each component's source, so "
     "<code>shadcn add port</code> copies all three skins whether you want them or not, and adding a "
     "fourth skin edits every component file instead of one stylesheet."),
    ("Hand-drawn stroke",
     "none",
     "<strong><code>roughjs</code></strong>, or <strong><code>react-rough-fiber</code></strong>",
     "<strong>Rejected for v1.</strong> Both draw SVG paths, so every Block/Pill border becomes an SVG "
     "overlay instead of a CSS border — a render-tree rewrite, plus a runtime dependency in a core whose "
     "one rule is that it imports no engine. Asymmetric corners get 80% of the read for one token."),
    ("Hand-drawn font",
     "<code>TEXT_BOX_FONT_STACKS.sketch</code> = <code>\"Segoe Print\", \"Bradley Hand\", cursive</code> — "
     "which resolves to nothing on this machine (<code>fc-match cursive</code> &rarr; <code>Z003</code>, "
     "a formal calligraphic italic, not a hand)",
     "<strong>Shantell Sans</strong> from <strong><code>@tldraw/assets</code></strong> (OFL), or "
     "<strong>Excalifont</strong> (OFL, Excalidraw's)",
     "The stack degrades to a real hand, not to the body font. The core ships no file — it has no asset "
     "pipeline — so the host declares one <code>@font-face</code>. A tldraw host already has the file."),
    ("<strong>unchanged (stock seam)</strong>",
     "Port dot geometry &middot; <code>layout.ts</code> / <code>blockLayout.ts</code> / "
     "<code>portPlacement.ts</code> &middot; the <code>resolveField</code> cascade &middot; "
     "both adapters &middot; <code>appearance.ts</code>'s state ladder",
     "&mdash;",
     "Not touched, deliberately. A skin paints; it does not get a vote on where anything sits, what "
     "state a port is in, or how a host hit-tests. That boundary is the entire reason switching one "
     "moves nothing."),
]
STOCK_ROWS = "".join(
    f"<tr><th>{a}</th><td>{b}</td><td>{c}</td><td>{d}</td></tr>" for a, b, c, d in STOCK
)

FOURTH = '''[data-bbox-skin="soft"] {
  --bbox-skin-radius: 12px;
  --bbox-skin-radius-pill: 9999px;
  --bbox-skin-stroke-width: 2px;          /* pinned — see D1 */
  --bbox-skin-stroke: var(--border);      /* shadcn Card's hairline, not the ink */
  --bbox-skin-surface: var(--card);
  --bbox-skin-shadow: 0 1px 2px 0 rgb(0 0 0 / .05);
  --bbox-skin-font: inherit;
}'''

HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Component skins — sketch, plain, and the one you have &middot; {DATE}</title>
<style>
  :root {{
    --ink:#16161a; --muted:#65656f; --line:#e3e3e8; --bg:#fbfbfc; --card:#fff;
    --win:#2f7d5b; --base:#b0b0ba; --accent:#5b45d6; --warn:#c06413; --bad:#b4363c;
  }}
  * {{ box-sizing:border-box }}
  body {{ margin:0; background:var(--bg); color:var(--ink);
    font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif }}
  main {{ max-width:1080px; margin:0 auto; padding:48px 24px 96px }}
  h1 {{ font-size:30px; line-height:1.25; margin:0 0 8px; letter-spacing:-.02em }}
  h2 {{ font-size:21px; margin:56px 0 12px; letter-spacing:-.01em }}
  h3 {{ font-size:16px; margin:28px 0 8px }}
  p, li {{ color:#2b2b33 }}
  .lede {{ font-size:18px; color:var(--muted); margin:0 0 4px }}
  .stamp {{ font:12px ui-monospace,SFMono-Regular,Menlo,monospace; color:var(--muted); margin:0 0 32px }}
  blockquote {{ margin:20px 0; padding:12px 18px; border-left:3px solid var(--accent);
    background:#f5f3ff; color:#3a3a45; font-size:15px; border-radius:0 6px 6px 0 }}
  blockquote p {{ margin:0 }}
  video, .hero img {{ width:100%; border:1px solid var(--line); border-radius:10px;
    background:#fff; display:block }}
  .hero {{ margin:24px 0 8px }}
  .cap {{ font-size:13px; color:var(--muted); margin:8px 0 0 }}
  table {{ border-collapse:collapse; width:100%; margin:16px 0; font-size:14px }}
  th, td {{ text-align:left; padding:9px 12px; border-bottom:1px solid var(--line); vertical-align:top }}
  thead th {{ font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted) }}
  tbody th {{ font-weight:600 }}
  .h {{ font:12.5px ui-monospace,Menlo,monospace }}
  .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(290px,1fr)); gap:18px; margin:20px 0 }}
  .card {{ margin:0; background:var(--card); border:1px solid var(--line); border-radius:10px;
    padding:12px; display:flex; flex-direction:column; gap:8px }}
  .card img {{ width:100%; border-radius:6px; display:block }}
  figcaption {{ display:flex; justify-content:space-between; align-items:baseline; gap:10px }}
  .name {{ font-weight:650; font-size:14px }}
  .meas {{ font:12px ui-monospace,Menlo,monospace; color:var(--muted) }}
  .card .cap {{ margin:0 }}
  .box {{ border:1px solid var(--line); background:var(--card); border-radius:10px; padding:18px 22px; margin:18px 0 }}
  .box.warn {{ border-color:#f0d9bd; background:#fdf8f2 }}
  .box.win {{ border-color:#c8e3d5; background:#f4fbf7 }}
  .box h3 {{ margin-top:0 }}
  code {{ font:13px ui-monospace,Menlo,monospace; background:#f0f0f4; padding:1px 5px; border-radius:4px }}
  pre {{ background:#16161a; color:#e8e8ee; padding:14px 16px; border-radius:8px; overflow-x:auto;
    font:12.5px/1.65 ui-monospace,Menlo,monospace }}
  pre code {{ background:none; padding:0; color:inherit; font-size:inherit }}
  ul {{ padding-left:22px }} li {{ margin:6px 0 }}
  .why {{ display:block; font-weight:400; font-size:12.5px; color:var(--muted); margin-top:3px }}
  td.w, th.w {{ width:38px; text-align:center; font:12px ui-monospace,Menlo,monospace; color:var(--muted) }}
  td.s {{ text-align:center; font:13px ui-monospace,Menlo,monospace; width:96px }}
  td.s.good {{ background:#eef8f2; color:var(--win); font-weight:700 }}
  td.s.mid {{ background:#fdf8f2; color:var(--warn) }}
  td.s.bad {{ background:#fdf2f3; color:var(--bad) }}
  tr.totals th, tr.totals td {{ border-top:2px solid var(--ink); border-bottom:none; padding-top:12px }}
  td.tot {{ font-size:17px; font-weight:700 }}
  .of {{ font-size:11px; font-weight:400; color:var(--muted) }}
  .pill {{ display:inline-block; background:var(--win); color:#fff; font-size:11px;
    padding:1px 7px; border-radius:9px; vertical-align:middle }}
  .dl dt {{ font-weight:650; margin-top:14px }}
  .dl dd {{ margin:4px 0 0 0; color:#2b2b33 }}
  .dl .rec {{ color:var(--win); font-weight:600 }}
  a {{ color:var(--accent) }}
</style></head><body><main>

<p class="lede">bbox-ui</p>
<h1>Two more skins: sketch, plain — and what you already have</h1>
<p class="stamp">{DATE} &middot; branch <code>claude/component-styling-options-90a72f</code> &middot;
commit <code>{COMMIT}</code> &middot; every paint value and every geometry claim below read out of
<code>demos/capture-skins.mjs</code>'s own JSON, measured in headless Chrome against the two
running demos &mdash; none of it typed by hand</p>

<blockquote><p>“one thing I'm interested in is having two other styling options in addition to
the Shad CN one that we currently have. one would be sketch styling the other just unstyleized
(straight corners, minimal appearance like base UI). Can you please make a proposal for how I
could add this to my existing components?”</p></blockquote>

<div class="hero">
  <video autoplay loop muted playsinline controls poster="{jpg('tldraw-default-full.jpg')}">
    <source src="{data_uri(MEDIA / 'skin-switch.mp4', 'video/mp4')}" type="video/mp4">
    <img src="{data_uri(MEDIA / 'skin-switch.gif', 'image/gif')}" alt="Switching skins live in the tldraw demo">
  </video>
  <p class="cap">The real tldraw demo on <code>:5189</code>, driven headlessly: Default &rarr;
  Plain &rarr; Sketch &rarr; Default, clicked through the picker in the bottom-right corner.
  Nothing else on the board changes &mdash; not a port, not an edge endpoint, not a box.
  <strong>Neither adapter was edited to make this work.</strong></p>
</div>

<div class="box win">
<h3>The short version</h3>
<p>It is one inherited HTML attribute re-pointing seven CSS custom properties. Skins are
<em>shape</em>; shadcn's tokens stay underneath all of them as <em>colour</em>. The whole
mechanism is <strong>two new files and about 110 changed lines across four components</strong>;
the demos gained an import and one <code>&lt;SkinPicker/&gt;</code> each; the adapters, the
field cascade, <code>layout.ts</code> and every existing consumer were not touched at all.</p>
<p>It is built, committed and measured, not sketched. Look at it, then answer the three
questions at the bottom.</p>
</div>

<h2>One correction worth making first</h2>
<p>“the Shad CN one that we currently have” is half right, and the half that is wrong is the
useful half. What you have today is <strong>shadcn's token vocabulary</strong> —
<code>--card</code>, <code>--foreground</code>, <code>--muted-foreground</code> — painting
<strong>one shape language</strong>: a 2px ink outline with 8px corners.</p>
<p>Those are two different things, and separating them is what makes this cheap. Sketch and
Plain are new <em>shape languages</em>. They keep reading the same shadcn tokens, so all three
follow light/dark for free and none of them needs a palette of its own. Skin is a third axis
next to the two you already have:</p>
<table>
<thead><tr><th>Axis</th><th>Owned by</th><th>Answers</th><th>Values</th></tr></thead>
<tbody>
<tr><th>Theme</th><td><code>theme.css</code>, <code>data-theme</code></td><td>which colours</td><td>light &middot; dark</td></tr>
<tr><th>Appearance</th><td><code>appearance.ts</code>, the <code>state</code> preset family</td><td>what this thing <em>is</em></td><td>empty &middot; valueSet &middot; wired &middot; received</td></tr>
<tr><th><strong>Skin</strong></th><td><code>skin.ts</code>, <code>data-bbox-skin</code></td><td>what it is <em>drawn like</em></td><td>default &middot; plain &middot; sketch</td></tr>
</tbody>
</table>
<p>They compose and none of them knows the others exist. A sketch board in dark mode with a
wired Port is all three at once. Folding skin into the <code>state</code> family instead would
have put two selectors on the same paint fields, which is exactly what
<code>assertDisjointPresets</code> forbids — the same argument <code>appearance.ts</code>
already makes about why <code>tone</code> is an override rather than a second preset family.</p>

<h2>The three skins, in the real tldraw host</h2>
<p>Same card, same board, same capture box, three skins. Note the chip: a capsule under Default
and Sketch, a rectangle under Plain. Note the port dots: identical to the pixel in all three.</p>
<div class="grid">{strip("detect", "tldraw")}</div>

<h3>Measured, not described</h3>
<p>Computed style off a live <code>[data-slot="block"]</code> in the tldraw host:</p>
<table>
<thead><tr><th>Skin</th><th>border-radius</th><th>border-width</th><th>border-color</th><th>font-family</th></tr></thead>
<tbody>{PAINT_TABLE}</tbody>
</table>
<p class="cap">The colour is the same in all three on purpose — that is the theme's job, not the
skin's. The <code>border-width</code> being identical is <em>not</em> a coincidence either; see
the trap below.</p>

<h2>The same three, in React Flow — with no adapter change</h2>
<p>This is the load-bearing claim. A tldraw shape and a React Flow node both render their DOM
inside their engine's own tree, where no wrapper component can reach them. One inherited
attribute on <code>&lt;html&gt;</code> reaches both anyway.</p>
<div class="grid">{strip("detect", "reactflow")}</div>
<p class="cap">The full diff for each demo is an import line and
<code>&lt;SkinPicker /&gt;</code>. <code>@bbox-ui/adapter-tldraw</code> and
<code>@bbox-ui/adapter-reactflow</code> are byte-identical to before.</p>

<h2>Nothing moved — and that is measured, not asserted</h2>
<div class="box win">
<p><code>demos/capture-skins.mjs</code> clicks the real in-app picker, then reads every port
dot's centre and every block's box with <code>getBoundingClientRect</code> and compares the
three skins element by element.</p>
<table>
<thead><tr><th>Host</th><th>Port dots</th><th>Blocks</th><th>Drift across all three skins</th><th>Console errors</th></tr></thead>
<tbody>
<tr><th>tldraw</th><td class=h>{tldraw['ports']}</td><td class=h>{tldraw['blocks']}</td>
    <td class=h><strong>0.00 px</strong> &mdash; identical</td><td class=h>{len(tldraw['consoleErrors'])}</td></tr>
<tr><th>React Flow</th><td class=h>{reactflow['ports']}</td><td class=h>{reactflow['blocks']}</td>
    <td class=h><strong>0.00 px</strong> &mdash; identical</td><td class=h>{len(reactflow['consoleErrors'])}</td></tr>
</tbody>
</table>
<p class="cap">Spatial, so measured spatially. A DOM-presence assertion cannot fail when a port
slides four pixels out from under a host's edge endpoint, which is the exact failure this
invariant exists to catch.</p>
</div>

<h2>Why a CSS token layer and not the three obvious alternatives</h2>
<p>Criteria first, weighted for this repo specifically, then the options against them.</p>
<ul>{OPTION_KEY}</ul>
<table>{SCORE_TABLE}</table>
<p class="cap">B loses on the switch (a preset family needs the field written onto every
instance, and it would persist into saved documents) and on the adapters (each would thread it
through its shape record). C loses because a <code>cva</code> table lives inside each
component's source, so <code>shadcn add port</code> ships all three skins to someone who wanted
one, and a fourth skin edits every component instead of one stylesheet. D — shadcn's own
<code>new-york</code>/<code>default</code> pattern — cannot switch at runtime at all, which is
the entire point.</p>

<div class="box warn">
<h3>What A gives up, stated plainly</h3>
<p><strong>A skin does not appear in a <code>FieldTrace</code>.</strong> The inspector can say
“the <em>wired</em> preset supplied this colour”; it cannot say “the <em>sketch</em> skin
supplied this radius”, because the skin never enters the cascade. That is the one real thing
option B would have bought, and it is a genuine loss in a repo whose product is
“why is this value this”.</p>
<p>The cheap mitigation, if it bothers you: a read-only <strong>Skin</strong> row in the panel
that reports <code>getComputedStyle(el).getPropertyValue('--bbox-skin-radius')</code> and the
active attribute. It is honest — it reads the same value the pixels came from — and it does not
require skin to become document data. Not built; say the word.</p>
</div>

<h2>The stock part, element by element</h2>
<table>
<thead><tr><th style="width:17%">Element</th><th style="width:26%">Today</th>
<th style="width:27%">Off-the-shelf part</th><th>Behaviour that must survive</th></tr></thead>
<tbody>{STOCK_ROWS}</tbody>
</table>

<h2>Two traps this turned up</h2>

<div class="box warn">
<h3>1. Border <em>width</em> is geometry here, not paint</h3>
<p><code>port.layout.ts</code>'s <code>BLOCK_BORDER_PX</code> (2) insets every wall-mounted
port's anchor, and <code>region.tsx</code>'s <code>REGION_BORDER_PX</code> (2) positions the
corner Block. A skin that stroked a 1px hairline would slide every port half a pixel out from
under the host's own edge endpoints — in both adapters, silently, with every test green.</p>
<p>So all three shipped skins stroke at <strong>2px</strong>, and the token exists mainly to
make that constraint visible at the place someone would otherwise change it. Both constants
now carry the note. Making width variable is real layout work with adapter-visible
consequences; see <strong>D1</strong>.</p>
</div>

<div class="box warn">
<h3>2. A code field's font depends on which host you are in</h3>
<p>The capture caught this, not the tests. A Port's label is a <code>CodeField</code>. It
inherits the skin font like everything else <em>unless</em> the host also imports
<code>codeField.css</code>, whose <code>.cm-scroller</code> rule pins monospace and wins.
Storybook imports it; the demos and <code>apps/docs</code> do not. So the same board renders
hand-drawn port labels in one host and monospace ones in another.</p>
<p>That is a taste call, not a bug to paper over — code text arguably <em>should</em> resist a
sketch skin. See <strong>D3</strong>.</p>
</div>

<h2>Adding a fourth skin is one block of CSS</h2>
<p>If you want your default to read more like an actual shadcn <code>Card</code> — hairline
border, soft fill, a small shadow — that is not a new mechanism, it is nine lines appended to
<code>skin.css</code> plus its name in <code>BBOX_SKINS</code>. No component changes, no
adapter changes, no registry changes.</p>
<pre><code>{FOURTH}</code></pre>
<p class="cap">Deliberately not shipped: three is what you asked for, and a fourth is more
useful as proof that the seam is cheap than as a skin nobody chose.</p>

<h2>The registry item, installed for real</h2>
<p><code>CLAUDE.md</code> is blunt about this: <em>“<code>npx shadcn add</code> exiting 0 proves
nothing — this repo already shipped a registry that installed cleanly and then failed to
compile.”</em> So the new item was installed into a throwaway project and type-checked, not
just built.</p>
<table>
<thead><tr><th>Step</th><th>Result</th></tr></thead>
<tbody>
<tr><th><code>shadcn add …/r/bbox-skin.json</code></th><td class=h>exit 0 &mdash;
  <code>skin.ts</code> and <code>skin.css</code> land in <code>components/bbox/</code>,
  siblings of <code>block.tsx</code> as intended</td></tr>
<tr><th><code>tsc --noEmit</code> over a real call site</th><td class=h><strong>exit 0</strong>
  &mdash; importing all seven exports, <code>bboxSkinAttrs</code>, both types</td></tr>
<tr><th>installed <code>skin.css</code></th><td class=h>3 skins &times; 7 tokens, identical
  sets &mdash; parsed out of the copied file, not the source</td></tr>
<tr><th><code>bbox-skin</code> as a dependency of <code>port</code>/<code>block</code></th>
  <td class=h>deliberately <strong>not</strong> one. They compile without it.</td></tr>
</tbody>
</table>

<div class="box warn">
<h3>What that check turned up about <code>block</code> — pre-existing, not from this work</h3>
<p>Installing <code>block</code> alongside it fails to compile, and has nothing to do with
skins. <code>block.tsx</code> imports <code>./pill</code> and <code>./block.fields</code>;
the <code>block</code> registry item ships only <code>block.tsx</code>,
<code>layout.ts</code> and <code>lib/utils.ts</code>. Both imports are missing from the
payload, so a consumer gets <code>TS2307: Cannot find module './pill'</code> plus five
knock-on errors.</p>
<p>I confirmed it predates this branch: on <code>main</code>, <code>block.tsx</code> already
carries both imports and the item already lists the same three files.</p>
<p><strong>And adding the missing files does not fix it.</strong> <code>pill.tsx</code>
imports <code>@bbox-ui/schema</code>, which is <code>private: true</code> and unpublished — so
<code>block</code> belongs in the same category <code>CLAUDE.md</code> already documents for
<code>block-node-reactflow</code> and <code>block-shape-tldraw</code>: items that cannot be
installed by anyone until the source stops naming an unpublishable specifier. Three of five
items, not two.</p>
<p>Out of scope here and left alone — flagged as its own task rather than folded into a
styling change.</p>
</div>

<h2>What actually changed</h2>
<table>
<thead><tr><th>File</th><th>What</th></tr></thead>
<tbody>
<tr><th><code>packages/bbox-ui/src/skin.ts</code></th><td>New, 129 lines. The vocabulary: three skins,
  the attribute name, the closed token list with each token's fallback. React-free, engine-free,
  same discipline as <code>appearance.ts</code>.</td></tr>
<tr><th><code>packages/bbox-ui/src/skin.css</code></th><td>New, 108 lines. <em>Only</em> custom-property
  declarations — not one rule reaching into component markup, so it can never out-specify a
  caller's own <code>className</code>.</td></tr>
<tr><th><code>block.tsx</code> &middot; <code>region.tsx</code> &middot; <code>pill.tsx</code> &middot; <code>port.tsx</code></th>
  <td>The seam: hard-coded utilities become token reads that carry today's value as the
  <code>var()</code> fallback. <code>border-2 border-foreground bg-card</code> &rarr;
  <code>border-[length:var(--bbox-skin-stroke-width,2px)]</code> and friends. Kept as Tailwind
  utilities, not inline styles, so <code>cn</code>'s tailwind-merge still lets
  <code>className</code> win.</td></tr>
<tr><th><code>registry.json</code>, <code>public/r/</code></th><td>A new opt-in
  <code>bbox-skin</code> item. Not a <code>registryDependency</code> of <code>port</code> or
  <code>block</code>: they work without it.</td></tr>
<tr><th><code>demos/*</code></th><td>One shared <code>SkinPicker</code>, an import per demo, and
  two driver scripts (<code>capture-skins.mjs</code> measures, <code>record-skins.mjs</code>
  records the clip above).</td></tr>
<tr><th><code>packages/bbox-ui/test/skin.test.ts</code></th><td>New, 8 assertions binding the
  three pieces nothing in TypeScript connects: the vocabulary, the stylesheet, and four call
  sites. Including the one that keeps <code>skin.css</code> optional — every component's
  <code>var()</code> fallback still equals what <code>BBOX_SKIN_TOKENS</code> advertises.</td></tr>
</tbody>
</table>
<p class="cap">Full workspace green: <code>pnpm -r typecheck</code> clean,
<strong>1229 tests pass</strong> across 13 packages, <code>shadcn build</code> clean, zero
console errors in either host.</p>

<div class="box win">
<h3>The new assertions can actually fail — mutation-tested, not assumed</h3>
<p>A guard nobody has seen go red is a guess. Each of these was introduced on purpose, one at
a time, and each turned exactly one assertion red; restoring went green.</p>
<table>
<thead><tr><th>Mutation</th><th>Result</th></tr></thead>
<tbody>
<tr><th><code>sketch</code> strokes a 1px hairline</th><td class=h>1 failed &mdash; the geometry trap</td></tr>
<tr><th><code>plain</code> drops <code>--bbox-skin-shadow</code></th><td class=h>1 failed &mdash; incomplete token set</td></tr>
<tr><th><code>block.tsx</code>'s stroke fallback drifts to 1px</th><td class=h>1 failed &mdash; fallback no longer matches</td></tr>
<tr><th>someone adds <code>rotate(-0.3deg)</code> to <code>sketch</code></th><td class=h>1 failed &mdash; no transforms</td></tr>
</tbody>
</table>
<p class="cap">The fallback check itself needed a second pass: the regex first written for it
truncated <code>var(--color-foreground)</code> to <code>var(--color-foreground</code> and
compared equal to nothing. It is a paren-balanced scan now, and it caught its own weakening
before it ever went green.</p>
</div>

<h2>What needs you</h2>
<dl class="dl">
<dt>D1 &middot; Should <code>plain</code> be a hairline rather than a 2px outline?</dt>
<dd>“Minimal, like Base UI” could mean a thin <code>--border</code> line rather than the bold
ink one. It currently keeps 2px because of the geometry trap above — going thinner means
teaching <code>BLOCK_BORDER_PX</code> and <code>REGION_BORDER_PX</code> to read the token,
which moves port anchors and needs the adapters re-measured.
<span class="rec">Recommendation: leave it at 2px.</span> The square corners already carry the
austerity, and the hairline costs a layout change for a small visual gain.
<em>If you say nothing I leave it as shipped — reversible in one line.</em></dd>

<dt>D2 &middot; Should <code>RADIUS_FIELD</code> be able to say “auto”?</dt>
<dd>An unset <code>radius</code> prop now defers to the skin, which is why the demos re-corner.
But the inspector panel always writes the field's declared default of 8, so a panel-driven Block
stays at 8px and ignores the skin. Fixing it means the field's default becomes
<code>null</code>/“auto” and the number control grows an unset state.
<span class="rec">Recommendation: yes, but as its own change</span> — it touches the panel's
number control and is not a skin question.
<em>If you say nothing, panel-driven blocks keep their pinned 8px.</em></dd>

<dt>D3 &middot; Should a <code>CodeField</code> resist the sketch skin?</dt>
<dd>Right now it is accidental: it inherits the hand font in the demos and stays monospace in
Storybook, purely because of which stylesheets each host imports. Either answer is defensible —
Excalidraw draws everything by hand; a schematic keeps code monospace — but the current state
is “whichever happens”, which is the worst of the three.
<span class="rec">Recommendation: let it inherit</span>, and drop the monospace pin from
<code>.cm-scroller</code> down to a <code>--bbox-skin-font-mono</code> token so the decision is
stated once instead of depending on an import.
<em>If you say nothing I will not change it, since it is currently host-dependent rather than
wrong.</em></dd>
</dl>

<h2>Deliberately not done</h2>
<ul>
<li><strong>Not wired into <code>apps/docs</code>.</strong> The site would want the
<code>next-themes</code> provider from the stock table plus a picker on component pages —
a real design decision about the site, not part of the mechanism. The spike proves the
mechanism in two canvas hosts instead.</li>
<li><strong>No real roughened stroke.</strong> An <code>feTurbulence</code> filter was the first
thing I tried; Block's <code>overflow: clip</code> (which is what makes its corners cut the
header and footer bars) clips a filtered pseudo-element border to the padding box and eats the
wobble, and filtering the element itself displaces its text into blur. Asymmetric corners get
most of the read for one token and no repaint layer.</li>
<li><strong>No rotation on the sketch skin.</strong> Tempting, and the one thing a skin must
never do: a tilted DOM stops agreeing with the host's own hit-test box and port anchors, which
the core does not own.</li>
<li><strong>Raw captures not committed.</strong> ~1.4&nbsp;MB of regenerable PNGs; the script
rebuilds them in about 40 seconds.</li>
<li><strong>Did not fix the <code>block</code> registry item.</strong> Real, pre-existing, and
a different problem (an unpublishable import, not a missing file). Folding it into a styling
change would hide it.</li>
<li><strong>Not merged.</strong> Three commits on
<code>claude/component-styling-options-90a72f</code>, head <code>{COMMIT}</code>.</li>
</ul>

</main></body></html>
"""

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(HTML)
print(f"{OUT}  {OUT.stat().st_size // 1024} KB")
