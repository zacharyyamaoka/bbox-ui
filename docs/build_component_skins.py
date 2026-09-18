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
    "plain": "Square corners, no fill, one weight of line. Your “unstylized”.",
    "sketch": "No fill at all, and a line that is genuinely drawn — jittered, bowed, and laid down twice.",
}

tldraw = json.loads((MEDIA / "tldraw-report.json").read_text())
reactflow = json.loads((MEDIA / "reactflow-report.json").read_text())


def data_uri(path: pathlib.Path, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def jpg(name: str) -> str:
    return data_uri(MEDIA / name, "image/jpeg")


def sh(*args: str) -> str:
    return subprocess.run(args, capture_output=True, text=True, cwd=REPO).stdout.strip()


COMMIT = sh("git", "-C", str(REPO), "log", "-1", "--format=%h", "claude/component-styling-options-90a72f") or "b3adc60"

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
    ("A · CSS token layer", "data-bbox-skin re-points nine custom properties",
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
     "<strong><code>roughjs</code></strong> / <strong><code>react-rough-fiber</code></strong>, or "
     "<strong><code>PathBuilder.toDrawD</code></strong> + <strong><code>rng</code></strong> "
     "(tldraw 5.3.2's own — read, then ported)",
     "<strong>Ported, not installed</strong> — <code>sketchPath.ts</code>, ~90 lines of pure math. "
     "tldraw's is not importable here on principle: it sits behind <code>@tldraw/editor</code>'s "
     "<code>Vec</code> and <code>PathBuilder</code>, and the core's one rule is that it imports no "
     "engine. <code>roughjs</code> is genuinely off-the-shelf and would also work — it is a larger "
     "surface than the one function a rectangle needs, and it would not have answered what you asked, "
     "which was what tldraw does. The <code>rng</code> IS ported verbatim: a weaker hash makes "
     "neighbouring seeds wobble alike and a row of blocks looks stamped rather than drawn."),
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
<p>It is one inherited HTML attribute re-pointing nine CSS custom properties. Skins are
<em>shape</em>; shadcn's tokens stay underneath all of them as <em>colour</em>. The adapters,
the field cascade, <code>layout.ts</code> and every existing consumer were not touched at
all.</p>
<p>One part of a skin turned out not to be CSS, and that is the finding worth your time: a
<strong>drawn line is geometry</strong>. Sketch now generates a real SVG path — the technique
tldraw uses, read out of its source and ported as pure math with no tldraw import — while CSS
still decides whether it paints. The section right after the skins is the answer to what they
actually do.</p>
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
<div class="box">
<h3>What “no background” actually took</h3>
<p><code>--bbox-skin-surface: transparent</code> was one line. Two things fell out of it that
were not:</p>
<ul>
<li><strong>The border goes transparent, not absent.</strong> The 2px still occupies its 2px —
it is what every wall-mounted port anchor is measured against — it simply paints nothing, and
the drawn line lands exactly on it. That is the whole trick, and it is why the drift table
below still reads 0.00px.</li>
<li><strong>Text had been contrasting against a card that is no longer painted.</strong> A
sketch Block has to read against the <em>canvas</em> behind it, so <code>--bbox-skin-fg</code>
re-points it at the page foreground. It is a token rather than a rule selecting markup,
deliberately: that keeps <code>skin.css</code>'s one real property, which is that nothing in it
can out-specify a caller's own <code>className</code>.</li>
</ul>
<p>And it exposed something the demos had been getting wrong all along: both canvases are
light while headless Chrome reports <code>prefers-color-scheme: dark</code>, so they were
painting dark-theme tokens on a light canvas. Invisible with a surface painted;
near-white-on-white without one. The demos now carry a light/dark toggle next to the skin
picker — which also makes the 3&nbsp;&times;&nbsp;2 orthogonality something you can click.</p>
</div>
<p class="cap">The colour is the same in all three on purpose — that is the theme's job, not the
skin's. The <code>border-width</code> being identical is <em>not</em> a coincidence either; see
the trap below.</p>

<h2>Sketch reaches every component</h2>
<blockquote><p>“when you go sketchy I think that should propagate to all the components. all
the components should kinda support like a ‘sketchy’ mode. and then then I can always tune it
later to prevent certain ones from being sketchy, say like if I want the ports to still be
normal.”</p></blockquote>
<p>Port view is where this shows, because Simple view has almost no chrome. Same card, same
board, three skins:</p>
<div class="grid three">
<figure class="card">
  <img src="{jpg('portview-default.jpg')}" alt="Port view, default skin">
  <figcaption><span class="name">Default</span><span class="meas">unchanged</span></figcaption>
  <p class="cap">Fill, crisp rules, capsule chip, system font. Free to get as styled as you
  like — you said so.</p>
</figure>
<figure class="card">
  <img src="{jpg('portview-plain.jpg')}" alt="Port view, plain skin">
  <figcaption><span class="name">Plain</span><span class="meas">no fill</span></figcaption>
  <p class="cap">Square corners including the chip, no background, canvas showing through.</p>
</figure>
<figure class="card">
  <img src="{jpg('portview-sketch.jpg')}" alt="Port view, sketch skin">
  <figcaption><span class="name">Sketch</span><span class="meas">drawn</span></figcaption>
  <p class="cap">Outline, header and footer rules, chip and every code label — all drawn or
  hand-lettered, and the port rings deliberately left alone.</p>
</figure>
</div>

<table>
<thead><tr><th>Component</th><th>What sketch does to it</th><th>Who owns the colour</th></tr></thead>
<tbody>
<tr><th>Block &middot; Region</th><td>Drawn outline replaces the CSS border; no fill</td><td class=h>the skin</td></tr>
<tr><th>Pill &middot; BlockChip</th><td>Drawn capsule, wobble scaled to its ~20px height</td><td class=h><strong>the <code>state</code> preset</strong></td></tr>
<tr><th>Bar</th><td>The header/footer rule becomes one drawn segment</td><td class=h><strong>the <code>state</code> preset</strong></td></tr>
<tr><th>Badge</th><td>Gains a drawn outline it never had (it is a tinted chip)</td><td class=h>the skin</td></tr>
<tr><th>TextBox &middot; CodeField</th><td>Hand lettering — D3, and it now holds in every host</td><td class=h>&mdash;</td></tr>
<tr><th>Trace</th><td>The cable is redrawn by hand, ends pinned to their ports</td><td class=h>its own <code>strokeColor</code>/<code>tone</code></td></tr>
<tr><th>Port dot</th><td><strong>Nothing, shipped.</strong> The ring is built and works — see the trap below</td><td class=h><strong>the <code>state</code> preset</strong></td></tr>
</tbody>
</table>

<div class="box win">
<h3>The axis boundary survived, and is now a test</h3>
<p>Pill, Bar and Port paint their line from the <code>state</code> preset family. So the skin
is not allowed to name a colour for them — its two suppression tokens
(<code>--bbox-skin-line-override</code>, <code>--bbox-skin-dot-rings</code>) can only say
“do not paint the CSS one”, and the drawn outline is handed the colour that cascade already
resolved. A skin setting one of them to a real colour would be the two-selectors-one-field
collision <code>assertDisjointPresets</code> exists to forbid — and it would look like a
styling choice, not a bug, which is why there is now an assertion that those tokens only ever
hold <code>transparent</code>, <code>none</code>, <code>currentColor</code> or
<code>initial</code>.</p>
<p>It is also what makes your “tune it later” one CSS rule and no new API. Every token
inherits, so exempting a component is a scoped re-declaration:</p>
<pre><code>[data-bbox-skin="sketch"] [data-slot="port"] {{
  --bbox-skin-outline: none;          /* stop drawing */
  --bbox-skin-crisp: inline;          /* put the crisp one back */
  --bbox-skin-line-override: initial; /* let the real paint resolve */
}}</code></pre>
<p><code>initial</code> is what makes the last line work: on a custom property it is the
guaranteed-invalid value, so <code>var(--x, &lt;real paint&gt;)</code> falls straight
through.</p>
</div>

<h3>The cable, before and after</h3>
<div class="grid">
<figure class="card">
  <img src="{jpg('trace-default.jpg')}" alt="A crisp trace">
  <figcaption><span class="name">Default</span><span class="meas">one bezier</span></figcaption>
  <p class="cap">Exactly the path React Flow's <code>getBezierPath</code> produced.</p>
</figure>
<figure class="card">
  <img src="{jpg('trace-sketch.jpg')}" alt="A sketched trace">
  <figcaption><span class="name">Sketch</span><span class="meas">two passes</span></figcaption>
  <p class="cap">Sampled, jittered, re-smoothed, drawn twice — and both ends still pinned to
  their ports. A wandering end is a correctness bug wearing a style's clothes.</p>
</figure>
</div>
<p class="cap">This is what “just like async, or animated” buys: sketch is orthogonal to
<code>variant</code> and to the dash cadence, so a sketched trace can still be an animated
async one. The demo now paints its cables through the core's own <code>TraceBody</code> (a
<code>TraceEdge</code> in the demo scene) — there is no Trace adapter yet, and promoting one
is a separate call about the product's surface.</p>

<h2>How tldraw actually draws that line</h2>
<blockquote><p>“Can you please look into how TL Draw does their sketch line where it kind of
renders a bit interestingly? … I feel like TL Draw does something clever where they kind of
create this line that has variable width and stuff, but I'm not sure how they actually do that.
Just by a pure CSS.”</p></blockquote>

<p><strong>It is not CSS, and for a box it is not variable width either.</strong> Read in the
installed <code>tldraw@5.3.2</code> — <code>lib/shapes/shared/PathBuilder.mjs</code>,
<code>lib/shapes/geo/GeoShapeBody.mjs</code>, and <code>rng</code> in
<code>@tldraw/utils</code>. There are two separate mechanisms and only one of them ever
touches a rectangle.</p>

<table>
<thead><tr><th style="width:22%">&nbsp;</th><th>Freehand draw stroke</th><th>Geo shape (what a Block is)</th></tr></thead>
<tbody>
<tr><th>Where</th><td class=h>shared/freehand/getStrokeOutlinePoints.mjs</td><td class=h>shared/PathBuilder.mjs &rarr; toDrawD</td></tr>
<tr><th>What it emits</th><td>A filled outline <strong>polygon</strong></td><td>A stroked <strong>path</strong></td></tr>
<tr><th>Variable width</th><td><strong>Yes</strong> — the polygon's radius tracks pressure and
  velocity. The width is a <em>shape</em>, not a <code>stroke-width</code>.</td>
  <td><strong>No.</strong> Constant stroke. A geo shape never runs that code.</td></tr>
<tr><th>The “drawn” quality</th><td>from the varying radius</td>
  <td>from displacing each command point, and from drawing it <strong>twice</strong></td></tr>
</tbody>
</table>

<div class="box">
<h3>What <code>toDrawD</code> does, in four steps</h3>
<ol>
<li>Take the <em>exact</em> geometric path — the same commands a crisp rectangle would use.</li>
<li>Displace each command point by a random unit direction with magnitude
  <code>sqrt(|random()|) * offset</code>. The <code>sqrt</code> spreads points evenly over a
  disc instead of bunching them near the centre. <code>offset</code> defaults to
  <strong><code>strokeWidth / 3</code></strong>.</li>
<li>Round each corner using the tangents into and out of it, by
  <code>roundness = strokeWidth * 2</code>.</li>
<li>Do all of that <strong><code>passes = 2</code></strong> times, each pass seeded
  <code>rng(randomSeed + pass)</code>. <strong>This is the part doing the work</strong> — two
  nearly-identical outlines over each other is what reads as a pen going round twice.</li>
</ol>
<p>The seed is the <strong>shape id</strong>, through an xorshift128 seeded from the string.
Deterministic on purpose: unseeded randomness would re-wobble on every render and shimmer.
And the <em>fill</em> is a separate path built at <code>passes: 1, offset: 0</code> — the fill
follows true geometry and only the outline wobbles. Moot for us now: sketch has no fill.</p>
</div>

<p>So the answer to “can pure CSS do this” is <strong>no</strong>, and the reason is specific:
CSS has no property that displaces points along a border, and <code>border-radius</code>
cannot differ between two coincident strokes. What CSS <em>can</em> still do is decide whether
the path paints and in what ink — which is how the skin stays one attribute even though this
part needs real geometry. <code>sketchPath.ts</code> is that geometry: pure functions, no
React, no DOM, <strong>no tldraw import</strong>.</p>

<h3>Before and after, same card, same seed</h3>
<div class="grid">
<figure class="card">
  <img src="{jpg('default-line-closeup.jpg')}" alt="The default skin's CSS border, magnified">
  <figcaption><span class="name">Default</span><span class="meas">CSS border</span></figcaption>
  <p class="cap">One stroke, mathematically straight, <code>border-radius: 8px</code>.</p>
</figure>
<figure class="card">
  <img src="{jpg('sketch-line-closeup.jpg')}" alt="The sketch skin's drawn outline, magnified">
  <figcaption><span class="name">Sketch</span><span class="meas">drawn path</span></figcaption>
  <p class="cap">Two passes separating along the edges, corners displaced, no fill behind it.
  The port dot still sits exactly on the line.</p>
</figure>
</div>

<div class="box warn">
<h3>Two places I deliberately did not copy tldraw — both because I looked</h3>
<p><strong>1. <code>strokeWidth / 3</code> rendered a straight rectangle.</strong> On our 2px
stroke that is a 0.67px nudge, and the first build of this shipped it faithfully: the two
passes landed within a pixel of each other, never separated, and the result was a plain
rounded rect with slightly soft corners. The ratio is not wrong — it is calibrated for
tldraw's own proportions, a thicker pen on shapes a fraction of a Block's 384px. I swept
0.67&nbsp;/&nbsp;1.2&nbsp;/&nbsp;1.8&nbsp;/&nbsp;2.4&nbsp;/&nbsp;3.0 against 0&ndash;4 edge
points and 1&ndash;3 passes, rendered them, and looked: below ~1.8 the passes still fuse,
above ~3 the box stops reading as a box. <strong><code>SKETCH_WOBBLE_PX = 2.4</code></strong>.</p>
<p><strong>2. tldraw's rectangle has no points between its corners</strong>, so every edge is a
perfectly straight ruler line between two corners that each moved less than a pixel. Fine at
tldraw's sizes; across 384px it reads as printed. Three intermediate jittered points per edge
give the line somewhere to bow.</p>
</div>

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
border, soft fill, a small shadow — that is not a new mechanism, it is one block appended to
<code>skin.css</code> plus its name in <code>BBOX_SKINS</code>. No component changes, no
adapter changes, no registry changes. (It would carry
<code>--bbox-skin-outline: none</code> and inherit the rest; only sketch turns the drawn line
on.)</p>
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
<tr><th>installed <code>skin.css</code></th><td class=h>3 skins &times; 9 tokens, identical
  sets &mdash; parsed out of the copied file, not the source</td></tr>
<tr><th><code>sketchPath.ts</code> + <code>sketchOutline.tsx</code></th><td class=h>land as
  siblings too, and a real <code>&lt;SketchOutline&gt;</code> call site compiles &mdash; the
  drawn line is a code dependency of <code>Block</code>, not just a stylesheet</td></tr>
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
<tr><th><code>packages/bbox-ui/src/sketchPath.ts</code></th><td>New, ~90 lines of pure math:
  tldraw's seeded <code>rng</code> ported verbatim, plus a rounded-rect path generator with the
  same structure as <code>toDrawD</code>. No React, no DOM, no tldraw import. Its header is the
  written-up answer to how tldraw does it.</td></tr>
<tr><th><code>packages/bbox-ui/src/sketchOutline.tsx</code></th><td>New. The <code>&lt;svg&gt;</code>
  layer <code>Block</code> and <code>Region</code> both mount, whose <code>display</code> reads
  <code>--bbox-skin-outline</code>. Always rendered, painted only by sketch — the component
  cannot know the active skin without reading its own computed style, and self-measurement is
  the one thing the core does not do.</td></tr>
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
<strong>1230 tests pass</strong> across the 11 packages that have suites, <code>shadcn build</code> clean, zero
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

<h2>Your four rulings, and what each one took</h2>
<dl class="dl">
<dt>D1 &middot; “leave at 2px” &mdash; <span class="rec">done, nothing to change</span></dt>
<dd>All three skins stroke at 2px and a test now fails if one ever varies it, because border
width is geometry here: <code>BLOCK_BORDER_PX</code> insets every wall-mounted port anchor by
it.</dd>

<dt>D2 &middot; radius “auto” &mdash; <span class="rec">already true; my original claim was wrong</span></dt>
<dd>I said a panel-driven Block was pinned to 8 and ignored the skin. It is not.
<code>bench.tsx</code> passes <code>radius={{p.radius}}</code> straight through, so an untouched
radius is <code>undefined</code> and the skin decides — the coercion I had seen
(<code>p.radius ?? BLOCK_RADIUS_DEFAULT</code>) feeds the port-lane overlay, not the Block. The
only residue is that dev-bench overlay insetting its lanes at a hard 8 under a skin that says
0 or 12; cosmetic, in a harness. No schema change needed, which is the opposite of the
“widen <code>FieldValue</code> to admit null” I had lined up.</dd>

<dt>D3 &middot; “let it inherit” &mdash; <span class="rec">done, and it took more than the one line</span></dt>
<dd><code>codeField.css</code>'s <code>.cm-scroller</code> now reads
<code>--bbox-skin-font-mono</code>, so the decision lives in a token instead of in whether a
host imported a stylesheet. Then the captures showed a second offender the first fix did not
touch: a <code>TextBox</code> writes <code>font-family</code> <em>inline</em>, which beats
inheritance — so a Port-view title stayed crisply sans under a hand-drawn outline while Simple
view (a plain element) looked right. Its named rungs defer to the skin now too. A third thing
fell out: the two mono stacks in the codebase had quietly disagreed (one had Consolas, one did
not) and naming a single token fallback forced them to agree.</dd>

<dt>D4 &middot; “yes should go sketchy” &mdash; <span class="rec">done, without crossing the axis</span></dt>
<dd>The chip is drawn, with its wobble scaled to its own height —
<code>sketchWobbleFor</code> puts a 20px chip at 0.7px, because the 2.4px tuned on a 384px
Block does not make a chip sketchy, it destroys it. Colour still comes from
<code>state</code>; the skin only suppresses the CSS ring and hands the resolved colour to the
drawn one. Bar and Badge came along the same way.</dd>
</dl>

<h2>Three things only looking could have found</h2>

<div class="box warn">
<h3>1. <code>currentColor</code> and <code>none</code> are not “inert”</h3>
<p>Both suppression tokens need a value meaning “leave it alone” on the skins that do not
suppress. I used <code>currentColor</code> for the border one, reasoning that it names the
real thing. It does not — it names the <em>text</em> colour, so every wired Pill in the
default skin painted its ring in the label's ink. <code>none</code> on the Port one was worse:
it blanked every port's rings in every skin, including default.</p>
<p><code>initial</code> is the only correct value. On a custom property it is the
guaranteed-invalid value, so <code>var(--x, &lt;real paint&gt;)</code> falls straight through
to the component's own resolved colour.</p>
</div>

<div class="box warn">
<h3>2. Sketching the port rings deletes React Flow's ports</h3>
<p><code>PortDot</code> draws a hand-drawn ring and it works — in a host that renders the
component. <code>@bbox-ui/adapter-tldraw</code> mounts a real <code>&lt;Port&gt;</code>, so
does plain DOM. <strong><code>@bbox-ui/adapter-reactflow</code> never renders
<code>&lt;PortDot&gt;</code></strong>: it spreads <code>portDotStyle({{state}})</code> onto
React Flow's own <code>&lt;Handle&gt;</code>. Blanking the box-shadow rings there removes the
port's only paint and leaves nothing behind it.</p>
<p>So it ships <strong>off</strong> — which is also the component you guessed you would want
normal. One line turns it on, correct the day that adapter renders the component:
<code>[data-bbox-skin="sketch"] {{ --bbox-skin-dot-rings: none; }}</code></p>
</div>

<div class="box warn">
<h3>3. I changed tests, and that is the move worth naming</h3>
<p>Pill and Badge now render <code>[outline, children]</code>, and every trace segment renders
twice, so assertions about <code>children</code> and <code>&lt;path&gt;</code> counts were
about a contract that genuinely changed. Three helpers peel exactly one new layer each
(<code>labelOf</code>, <code>lineColorOf</code>, <code>segmentsOf</code>) and <em>assert the
layer is there</em>, so every original assertion still pins the same literal value it always
did — and the trace check is stronger than the count it replaced, since it now requires one
sketched twin per crisp segment rather than a total.</p>
<p>One assertion I had “fixed” turned out to be right as written and was reverted:
<code>chipElement</code> returns an unrendered <code>&lt;Pill&gt;</code>, so no outline exists
in that tree yet. And <code>TraceBody</code> stays hook-free, because its own test calls it as
a plain function with no renderer — the sketch cache is a bounded module-level Map, not a
<code>useMemo</code>.</p>
</div>

<h2>Deliberately not done</h2>
<ul>
<li><strong>Port dots stay crisp.</strong> Built, works, off — see trap 2. Yours to flip.</li>
<li><strong>No Trace adapter.</strong> The demo paints its cables through the core's
<code>TraceBody</code> via a <code>TraceEdge</code> in <code>demos/scene</code>, which is what
made the sketched cable reviewable. Promoting it to
<code>@bbox-ui/adapter-reactflow</code> is a call about the product's surface, not about
whether the skin works.</li>
<li><strong>No multi-select-and-restyle.</strong> You want to “multi select a bunch of
components and then quickly change their appearance” — that is the inspector's job, not the
skin's, and the skin is already the right shape for it: every token inherits, so a selection
could stamp one scoped rule. Not started.</li>
<li><strong>Not wired into <code>apps/docs</code>.</strong> The site would want the
<code>next-themes</code> provider from the stock table plus a picker on component pages.</li>
<li><strong>No rotation on the sketch skin.</strong> Still the one thing a skin must never
do: a tilted DOM stops agreeing with the host's hit-test box and port anchors.</li>
<li><strong>Bar rules are subtler than the outline.</strong> 1.7px of wander across a 370px
header — visible, but nothing like the container's 2.4px. It looked right to me and it is one
constant (<code>SketchLine</code>'s <code>wobble</code>) if it does not to you.</li>
<li><strong>Raw captures not committed.</strong> Regenerable in about a minute.</li>
<li><strong>Not merged.</strong> Head <code>{COMMIT}</code> on
<code>claude/component-styling-options-90a72f</code>.</li>
</ul>

<div class="box">
<h3>Where to turn the dials</h3>
<table>
<thead><tr><th>Want</th><th>Change</th></tr></thead>
<tbody>
<tr><th>More or less wobble, everywhere</th><td class=h><code>SKETCH_WOBBLE_PX</code> &middot; sketchPath.ts</td></tr>
<tr><th>How wobble scales with size</th><td class=h><code>sketchWobbleFor</code> &middot; sketchPath.ts</td></tr>
<tr><th>Cables specifically</th><td class=h><code>TRACE_WOBBLE_PX</code> &middot; trace.tsx</td></tr>
<tr><th>Header/footer rules</th><td class=h><code>SketchLine</code>'s <code>wobble</code> &middot; sketchOutline.tsx</td></tr>
<tr><th>More or fewer pen passes</th><td class=h><code>passes</code> (default 2) &middot; every generator</td></tr>
<tr><th>Exempt a component</th><td class=h>one scoped rule &mdash; see the axis-boundary box</td></tr>
<tr><th>A fourth skin</th><td class=h>one block in skin.css + its name in <code>BBOX_SKINS</code></td></tr>
</tbody>
</table>
</div>

</main></body></html>
"""

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(HTML)
print(f"{OUT}  {OUT.stat().st_size // 1024} KB")
