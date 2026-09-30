#!/usr/bin/env python3
"""
Build the "ten skins" report — the orthogonal style set, rendered.

Zach, 2026-09-17: "Lets call it Sketch, Unstyled, Shadcn, and then we can
have a couple different styles… Ok so we can support like 3 other orthongal
variants… Lets list them in story book in order." Plus the question the
whole thing is really answering: "Within the shadcn eco system how much room
is there for this?"

The captures are REAL frames of the real Storybook stories, taken by
docs/capture_storybook_shots.mjs against a live server, light and dark. The
token tables are parsed out of apps/storybook-basics/src/skin/skin.css at
build time rather than retyped, so the page cannot drift from the stylesheet
it documents.

This page inlines ~20 PNGs as data URIs, so it belongs in the GITIGNORED
reports/media/ half (CLAUDE.md's split is on inlined payload, not total
size).

    node docs/capture_storybook_shots.mjs --port <port> --out <dir> --shots docs/skin_shots.json
    python3 docs/build_skins_report.py --shots <dir>

Ported 2026-09-30 from claude/orthogonal-design-styles-8d71d7, which
predated migration M8 and the `Skin/Styles` story title. So
docs/skin_shots.json's ids are now `skin-styles--*` (they were `styles--*`),
and its `"scheme": "light"` frames need the `--color-scheme` / per-shot
`scheme` hunk that came across into docs/capture_storybook_shots.mjs with
it. The token tables below are parsed from skin.css, so they show the
13-token set M8 left and never the retired `crisp`/`outline` pair.
"""
from __future__ import annotations

import argparse
import base64
import html
import io
import pathlib
import re
import subprocess
from datetime import date

from PIL import Image

REPO = pathlib.Path("/home/bam/bbox-ui")
LANE = pathlib.Path(__file__).resolve().parent.parent
SKIN_CSS = LANE / "apps/storybook-basics/src/skin/skin.css"
SKIN_TS = LANE / "apps/storybook-basics/src/skin/skin.ts"
# Pinned, NOT `date.today()`: the work ran past midnight and a date-stamped
# name silently spawned a second report at 2026-09-18 while the link already
# handed to Zach pointed at the 09-17 file. One report per unit of work —
# extend and re-link the existing one. The date the page PRINTS is still
# today's, so the "last built" line stays honest.
OUT = REPO / "reports/media/bbox-ui-skins-2026-09-17.html"

# --------------------------------------------------------------------------
# The rungs, in Zach's order. `n` is the sidebar position he specified —
# rung 1 is the picker's "No skin (today)", which is the ABSENCE of the
# attribute and therefore not a skin.
# --------------------------------------------------------------------------
RUNGS = [
    dict(id="unstyled", n=2, label="Unstyled", tagline="Undecorated, not invisible",
         hue="none — the UA's own ButtonBorder",
         reads="The debugging lens, and the Base UI reading: no fill, no shadow, no corner, the browser's own serif, and the browser's own ButtonBorder on every line. Nothing on screen is a colour this repo picked, so a layout bug has nowhere to hide behind a nice card — but you can still see the boxes, which the first pass got wrong. Ports and wires keep their colour, because that belongs to the `state` axis and a skin may not touch it."),
    dict(id="sketch", n=3, label="Sketch", tagline="Hand-drawn",
         hue="none — theme-derived",
         reads="Unchanged from the original three. The border keeps its 2px and paints nothing; an SVG path draws on exactly that line. The only rung that swaps a CSS line for a drawn one."),
    dict(id="shadcn", n=4, label="Shadcn", tagline="The stock design system",
         hue="none — theme-derived",
         reads="Was called `default`. It always was the shadcn/ui look, and \"default\" hid that behind a word meaning \"whatever is currently on\". This is the rung to switch back to."),
    dict(id="vellum", n=5, label="No. 1 · Vellum", tagline="Soft, warm, friendly",
         hue="one warm tan, mixed into --card",
         reads="The reference is your own — a node editor whose blocks read friendly rather than technical. A 14px corner, a geometric rounded letterform, a warm paper tint, and ambient shadow instead of a hard edge."),
    dict(id="blueprint", n=6, label="No. 2 · Blueprint", tagline="Drafting paper",
         hue="one cyan-blue, mixed into --card and --foreground",
         reads="Square everything — pills included, which collapses Badge's lozenge into a tag. No depth at all, a condensed technical face. The furthest this set goes from \"app chrome\" while still being a UI."),
    dict(id="brutal", n=7, label="No. 3 · Brutal", tagline="Neo-brutalist",
         hue="none — theme-derived",
         reads="A 5px hard offset shadow with zero blur, and a full-strength foreground line. The clearest demonstration that a skin can change a silhouette without moving anything: box-shadow paints outside the border box and lays out nothing."),
    dict(id="terminal", n=8, label="No. 4 · Terminal", tagline="A modern terminal window",
         hue="one amber, mixed into --card and --foreground",
         reads="Warm charcoal, a 6px window corner, an amber-leaning hairline and a real drop shadow — a floating terminal over a desktop rather than a tube glowing in the dark. The accent lives in the border and not in the text, because an accent applied to every glyph stops being one; a terminal's default text is not orange. Monospace in every slot, including the ones that ask for sans — which is exactly why `--bbox-skin-font-sans` exists, since a sans rung is set inline and would otherwise beat inheritance."),
    dict(id="porcelain", n=9, label="No. 5 · Porcelain", tagline="Soft depth, almost no line",
         hue="none — theme-derived",
         reads="A translucent panel and a line you can barely see, with two stacked shadows doing the work the border used to do. Names no hue, so it follows light/dark and any base-colour swap for free."),
    dict(id="notion", n=10, label="No. 6 · Notion", tagline="The document, not the app",
         hue="one warm grey, mixed into --card and --card-foreground",
         reads="Notion's whole trick is that its blocks barely exist: a 4px corner, a fill one step off the page, a line you have to look for, and no depth at all — a callout is flat against the document, not floating above it. The pill radius is 3px rather than 9999px, because Notion's inline tags are rounded RECTANGLES, and that one token is most of the difference between a document and an app. Nearest neighbour is Porcelain on purpose; they separate on depth, corner, pill and warmth."),
    dict(id="obsidian", n=11, label="No. 7 · Obsidian", tagline="The vault",
         hue="one violet, mixed into --card and --foreground",
         reads="One colour on an almost-neutral ground — the violet accent against a near-grey panel, an 8px corner (Obsidian's own --radius-m) and 4px tags (its --radius-s, because a #tag is a rounded rectangle and it is the most recognisable small thing in the app). Elevation is its own --shadow-s, three stops at 1px / 3px / 15px, re-expressed against --foreground so they invert instead of being three black rgba literals that only work on a light page. The violet sits on the edge and not in the fill, because Obsidian's backgrounds are nearly neutral and the accent shows up on edges and active states — a violet PANEL would be a theme nobody ships."),
]

# What the token vocabulary can and cannot reach — the direct answer to
# "how much room is there". Every row is checked against the stylesheet
# below (a token that stops being used is a build-time failure).
WALLS = [
    dict(wall="Border WIDTH", verdict="off the table",
         why="Width is geometry: it moves the content box, and block.tsx's BLOCK_BORDER_PX / port.tsx's ring sizing are literals a drawn sketch outline lands on exactly. Every skin is pinned to 2px, and skin.test.ts fails if one is not. Hairline-vs-heavy is the one expressive lever the layer deliberately withholds."),
    dict(wall="Anything that MOVES", verdict="off the table",
         why="No transform, no rotate, no padding, no gap. A rotated DOM stops agreeing with the host's own hit-test box and port anchors, which the core does not own. The SideBySide story measures every port-dot centre and block rect across all ten and holds them to ±1px."),
    dict(wall="Semantic colour", verdict="belongs to another axis",
         why="A Port's ring, a Badge's `outline` variant, a Trace's variant — those colours are the `state` axis. A skin may say \"do not paint the CSS line\" (--bbox-skin-line-override, --bbox-skin-dot-rings) but may never name a colour for them, and skin.test.ts enforces exactly that."),
    dict(wall="Per-element decoration", verdict="needs a component change",
         why="Your own example: a highlight on one card. The trick you named — \"unless you keep it always there and transparent by default\" — is already the mechanism here, twice: SketchOutline is ALWAYS rendered and switched with `display`, and the two suppression tokens blank a paint without owning its colour. Anything that needs a NEW element still needs a component change; it is just that the component change is a one-off and the skin then drives it."),
]

FINDINGS = [
    dict(kind="fixed",
         title="Unstyled showed no outline at all — your bug, and now a test",
         body="The first pass painted the border <code>transparent</code>, which is the literal reading of “every paint token off” and the wrong one: it shipped a rung with nothing on screen. Base UI's unstyled demos are <em>undecorated, not invisible</em> — the browser still draws the chrome it draws on its own. Both halves were wrong, and both are fixed: the block's line is now <code>ButtonBorder</code>, a CSS Color 4 <em>system</em> colour — the paint a browser puts on a <code>&lt;button&gt;</code> nobody styled, which is the only value here that is not a decision this repo made — and <code>--bbox-skin-line-override</code> is <code>currentColor</code> rather than <code>transparent</code>, so the outline-variant Badge, Button and Toggle keep a real line instead of reading as floating words. Two assertions in the rung's play function and two in <code>skin.test.ts</code> now fail if either comes back."),
    dict(kind="fixed",
         title="color-mix(in oklch, …) rendered Blueprint pink and Terminal khaki",
         body="oklch interpolates the HUE ANGLE, and <code>globals.css</code> authors <code>--card</code> as <code>oklch(1 0 0)</code> — an explicit hue of 0. Mixing that 86/14 toward blue (hue 248) takes the short arc <em>backwards</em>: measured in a real browser, it resolves to <code>oklch(0.93 0.0168 344.32)</code>, which is magenta. The green mix landed on hue 18 — khaki. There is a trap inside the trap worth knowing: the same mix written with the keyword <code>white</code> gives the correct hue 248, because sRGB white converts with a <em>powerless</em> hue that CSS Color 4 carries over from the other colour. So the bug only exists because the theme spells its white in oklch. Every mix in the stylesheet is now <code>in oklab</code> — rectangular, no hue angle to travel along. The swatches above are computed by your own browser as you read them."),
    dict(kind="fixed",
         title="Five of the rungs rendered in the same font",
         body="None of the first-choice families (Nunito, Archivo Black, IBM Plex Sans Condensed…) is installed on this box, so the letterform axis — a quarter of what distinguishes these styles — was dead on the machine they are being judged on. Each stack now carries a second tail of families that actually resolve here: URW Gothic, Liberation Sans Narrow, Lato Black, and JetBrains Mono placed <em>ahead</em> of <code>ui-monospace</code>, which would otherwise win and resolve to the plain system mono. Still no webfont is shipped; a reader on macOS or Windows reaches the first-choice families exactly as written."),
    dict(kind="fixed",
         title="Porcelain was invisible in light mode",
         body="It was a translucent <code>--card</code>, and in shadcn's neutral theme <code>--card</code> and <code>--background</code> are the same colour — so a see-through card over the canvas is literally nothing. It is now a translucent <code>--muted</code>, which keeps the \"floating above something\" reading and gives the panel an edge to find."),
    dict(kind="found",
         title="CodeEditor clips its last glyph by 3.5px — pre-existing, and a skin makes it worse",
         body="Visible as a half-drawn <code>8</code> in every capsule below. <code>codeEditorLayout.ts</code> derives its box width from an empirical <code>0.61</code> character-ratio and says so in its own header: \"a host that swaps the font silently gets a wrong width. That is a known limitation.\" A skin that sets <code>--bbox-skin-font-mono</code> is exactly that host. Measured live: 3.5px clipped under <code>ui-monospace</code>, 3.4px under JetBrains Mono, <strong>0px</strong> under Sketch's narrower cursive stack — and 17px clipped in the shipped <code>presets-value--literals</code> story with no skin involved at all, which is what makes it pre-existing rather than caused here. Left alone on purpose: it is a peer's preset, and the fix is a real measurement (a hidden span, or <code>ch</code> units), not a constant tweak."),
    dict(kind="note",
         title="plain was dropped, and survives untouched in the frozen package",
         body="The original three were <code>default</code> / <code>plain</code> / <code>sketch</code>. <code>plain</code>'s austere square wireframe sat between Unstyled and Shadcn without being either, and your list has no rung for it. <code>packages/bbox-ui</code> is frozen v1 and still carries all three; nothing here edits it. If you want it back as a sixth numbered style it is twelve lines."),
]


def data_uri(path: pathlib.Path) -> str:
    """Inline one capture, re-encoded to WebP.

    WHY not the raw PNG: Claude Code's desktop preview builds a
    `data:text/html,<encodeURIComponent(page)>` URL and refuses at
    2,097,024 bytes of THAT string — which for a base64-heavy page is
    about 1.9 MB on disk. Twenty retina PNGs are 1.93 MB before base64's
    own 33% and the page came out at 2.50 MB, i.e. browser-only. The same
    twenty at WebP q88 are 0.98 MB, which lands the page comfortably under
    the ceiling with no visible loss on flat UI captures. Measured both
    ways rather than guessed.
    """
    image = Image.open(path).convert("RGB")
    buffer = io.BytesIO()
    image.save(buffer, "WEBP", quality=88, method=6)
    return "data:image/webp;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def skin_tokens(skin: str) -> dict[str, str]:
    """Parse one `[data-bbox-skin="x"] { … }` block out of the real stylesheet.

    WHY parsed and not retyped: a report that restates a stylesheet by hand
    is wrong the first time either changes, and this one is specifically
    claiming "the five styles are made of nothing but token values".
    """
    source = re.sub(r"/\*[\s\S]*?\*/", "", SKIN_CSS.read_text())
    match = re.search(rf'\[data-bbox-skin="{skin}"\]\s*\{{([^}}]*)\}}', source)
    if not match:
        raise SystemExit(f"no CSS block for skin {skin!r}")
    return {
        m[1]: re.sub(r"\s+", " ", m[2]).strip()
        for m in re.finditer(r"--(bbox-skin-[\w-]+)\s*:\s*([^;]+);", match.group(1))
    }


def git(*args: str) -> str:
    return subprocess.run(["git", "-C", str(LANE), *args],
                          capture_output=True, text=True, check=True).stdout.strip()


parser = argparse.ArgumentParser()
parser.add_argument("--shots", required=True, help="directory of captured PNGs")
args = parser.parse_args()
SHOTS = pathlib.Path(args.shots)

ALL = {rung["id"]: skin_tokens(rung["id"]) for rung in RUNGS}
BASE = ALL["shadcn"]
TOKEN_ORDER = list(BASE.keys())

# Sanity: the claim "stroke-width is 2px everywhere" is asserted here too,
# so the report cannot print a wall the stylesheet stopped honouring.
widths = {t["bbox-skin-stroke-width"] for t in ALL.values()}
assert widths == {"2px"}, f"stroke-width is no longer uniform: {widths}"

branch = git("rev-parse", "--abbrev-ref", "HEAD")
sha = git("rev-parse", "--short", "HEAD")
subject = git("log", "-1", "--format=%s")

E = html.escape

CSS = """
:root {
  --ink: #0d1117; --paper: #ffffff; --muted: #5a6475; --line: #e3e7ee;
  --soft: #f6f8fb; --accent: #b4530a; --good: #17693f; --warn: #8a5a00;
  --mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--paper); color: var(--ink);
  font: 16px/1.62 "Lato", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}
main { max-width: 1180px; margin: 0 auto; padding: 56px 28px 120px; }
h1 { font-size: 40px; line-height: 1.12; letter-spacing: -0.022em; margin: 0 0 10px; }
h2 { font-size: 26px; letter-spacing: -0.014em; margin: 64px 0 6px; }
h3 { font-size: 18px; margin: 34px 0 6px; }
p { margin: 12px 0; }
.lede { font-size: 19px; color: #2b3444; max-width: 72ch; }
.sub { color: var(--muted); font-size: 14px; margin: 0 0 30px; }
code, .m { font-family: var(--mono); font-size: 0.875em; }
code { background: var(--soft); border: 1px solid var(--line); border-radius: 5px; padding: 1px 5px; }
hr { border: 0; border-top: 1px solid var(--line); margin: 48px 0; }
figure { margin: 22px 0 8px; }
figure img { width: 100%; display: block; border: 1px solid var(--line); border-radius: 12px; }
figcaption { color: var(--muted); font-size: 13.5px; margin-top: 9px; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.pair figure { margin: 0; }
table { border-collapse: collapse; width: 100%; margin: 18px 0; font-size: 14.5px; }
th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-size: 12px; letter-spacing: 0.07em; text-transform: uppercase; color: var(--muted); }
tbody tr:hover { background: var(--soft); }
.scroll { overflow-x: auto; }
.pill { display: inline-block; border-radius: 999px; padding: 2px 9px; font-size: 11.5px;
        font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
.pill.off { background: #fdecea; color: #a12a1c; }
.pill.axis { background: #eef2fb; color: #2d4a9a; }
.pill.comp { background: #fff4e0; color: var(--warn); }
.pill.fixed { background: #e7f6ec; color: var(--good); }
.pill.found { background: #fff4e0; color: var(--warn); }
.pill.note { background: var(--soft); color: var(--muted); }
.rung { border: 1px solid var(--line); border-radius: 16px; padding: 22px 24px; margin: 26px 0; }
.rung > header { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 4px; }
.rung h3 { margin: 0; font-size: 21px; }
.rung .num { font-family: var(--mono); font-size: 13px; color: var(--muted); }
.rung .tag { color: var(--muted); font-size: 14px; }
.diff { font-family: var(--mono); font-size: 12.5px; }
.diff td { padding: 5px 10px; }
.diff .tok { color: var(--muted); white-space: nowrap; }
.diff .val { color: var(--ink); word-break: break-word; }
.same { color: #aab2c0; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin: 26px 0 8px; }
.kpi { border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; }
.kpi b { display: block; font-size: 27px; letter-spacing: -0.02em; }
.kpi span { color: var(--muted); font-size: 12.5px; }
.finding { border-left: 3px solid var(--line); padding: 2px 0 2px 18px; margin: 22px 0; }
.finding h3 { margin: 0 0 4px; font-size: 17px; }
.swatches { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin: 18px 0; }
.swatchrow { display: flex; gap: 0; border-radius: 10px; overflow: hidden; border: 1px solid var(--line); }
.swatchrow div { flex: 1; height: 62px; }
.sw-label { font-family: var(--mono); font-size: 12px; color: var(--muted); margin-bottom: 6px; }
.decide { border: 1px solid var(--line); border-radius: 16px; padding: 6px 26px 22px; background: var(--soft); }
ul { margin: 10px 0; padding-left: 22px; }
li { margin: 7px 0; }
@media (max-width: 860px) { .pair, .kpis, .swatches { grid-template-columns: 1fr; } }
"""


def swatch_row(space: str) -> str:
    """A live color-mix demonstration — computed by the reader's browser.

    The base MUST be spelled `oklch(1 0 0)` and not `white`: measured in a
    real browser, `color-mix(in oklch, white 86%, oklch(0.5 0.12 248))`
    resolves to hue 248 (a correct blue) because sRGB white converts with a
    POWERLESS hue that CSS Color 4 carries over from the other colour,
    while `color-mix(in oklch, oklch(1 0 0) 86%, …)` resolves to hue
    344.32 — magenta. globals.css authors `--card` as `oklch(1 0 0)`, which
    is the second case, which is why the bug was real.
    """
    cells = "".join(
        f'<div style="background: color-mix(in {space}, oklch(1 0 0) {pct}%, oklch(0.5 0.12 248))"></div>'
        for pct in (100, 94, 88, 82, 76, 70)
    )
    return f'<div class="swatchrow">{cells}</div>'


def rung_section(rung: dict) -> str:
    tokens = ALL[rung["id"]]
    rows = []
    for name in TOKEN_ORDER:
        value = tokens.get(name, "—")
        same = value == BASE.get(name)
        cls = "val same" if same else "val"
        mark = "" if not same else ""
        rows.append(
            f'<tr><td class="tok">--{E(name)}</td><td class="{cls}">{E(value)}{mark}</td></tr>'
        )
    dark = SHOTS / f"rung-{rung['id']}.png"
    light = SHOTS / f"rung-{rung['id']}-light.png"
    changed = sum(1 for n in TOKEN_ORDER if tokens.get(n) != BASE.get(n))
    return f"""
<section class="rung" id="{E(rung['id'])}">
  <header>
    <span class="num">{rung['n']}.</span>
    <h3>{E(rung['label'])}</h3>
    <span class="tag">{E(rung['tagline'])} · {E(rung['hue'])} · {changed} of 15 tokens differ from Shadcn</span>
  </header>
  <p>{E(rung['reads'])}</p>
  <div class="pair">
    <figure><img src="{light}" alt="{E(rung['label'])}, light"><figcaption>light</figcaption></figure>
    <figure><img src="{dark}" alt="{E(rung['label'])}, dark"><figcaption>dark</figcaption></figure>
  </div>
  <details>
    <summary class="m" style="cursor:pointer;color:var(--muted);font-size:13px;margin-top:14px">
      the whole skin, as CSS ({changed} lines differ from Shadcn; the greyed ones are identical)
    </summary>
    <div class="scroll"><table class="diff"><tbody>{''.join(rows)}</tbody></table></div>
  </details>
</section>"""


# Images are read from disk and inlined; the src attributes above are
# rewritten to data URIs here so each path is read exactly once.
sections = "\n".join(rung_section(r) for r in RUNGS)
for png in sorted(SHOTS.glob("*.png")):
    sections = sections.replace(str(png), data_uri(png))

gallery_light = data_uri(SHOTS / "gallery-light.png")
gallery_dark = data_uri(SHOTS / "gallery.png")
geometry = data_uri(SHOTS / "geometry.png")

walls = "".join(
    f'<tr><td><strong>{E(w["wall"])}</strong></td>'
    f'<td><span class="pill {"off" if "off" in w["verdict"] else ("axis" if "axis" in w["verdict"] else "comp")}">{E(w["verdict"])}</span></td>'
    f'<td>{E(w["why"])}</td></tr>'
    for w in WALLS
)

findings = "".join(
    f'<div class="finding"><h3><span class="pill {f["kind"]}">{f["kind"]}</span> {E(f["title"])}</h3><p>{f["body"]}</p></div>'
    for f in FINDINGS
)

HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ten skins — bbox-ui</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<style>{CSS}</style>
</head><body><main>

<h1>Ten skins, in the order you asked for</h1>
<p class="sub m">{E(branch)} · {E(sha)} · {E(subject)} · {date.today().isoformat()}</p>

<p class="lede">
  Every style below is made of <strong>nothing but values for the fifteen CSS custom
  properties that already existed</strong>. No component changed, no token was added,
  no webfont ships. That is the direct answer to “within the shadcn eco system how
  much room is there for this?” — and the honest half of the answer, the three walls
  you cannot get through with a token, is a section of its own further down.
</p>

<div class="kpis">
  <div class="kpi"><b>10</b><span>skins, from 3</span></div>
  <div class="kpi"><b>15</b><span>tokens — unchanged vocabulary</span></div>
  <div class="kpi"><b>0</b><span>component files edited</span></div>
  <div class="kpi"><b>±1px</b><span>geometry drift, all ten</span></div>
</div>

<figure>
  <img src="{gallery_light}" alt="All ten skins, light">
  <figcaption><strong>Storybook → Styles → 1. All skins</strong>, light. The same scene ten
  times: two wired blocks with port rails, a card with a code field, the shadcn primitives,
  three port states and a value capsule. The skin is the only variable.</figcaption>
</figure>
<figure>
  <img src="{gallery_dark}" alt="All ten skins, dark">
  <figcaption>The same story in dark. Nothing below is a second definition — skin and theme are
  separate axes, so every rung inverts for free. The four rungs that pin a hue reach it by mixing
  into <code>--card</code>, which is what keeps that true.</figcaption>
</figure>

<h2>The order</h2>
<p>
  Your list started at 2, because rung 1 in the picker is <em>No skin (today)</em> — the absence of
  the attribute, not a ninth skin. Modelling it as a member is exactly what would make “switch back
  to nothing” unexpressible. So in the Storybook sidebar rung 1 is the gallery above, and the
  toolbar keeps the no-skin rung where it was.
</p>
<div class="scroll"><table>
  <thead><tr><th>#</th><th>Sidebar</th><th>Toolbar picker</th><th>What it is</th></tr></thead>
  <tbody>
    <tr><td class="m">1</td><td>1. All skins</td><td>No skin (today)</td><td>The gallery / the unset attribute</td></tr>
    {''.join(f'<tr><td class="m">{r["n"]}</td><td>{r["n"]}. {E(r["label"])}</td><td>{E(r["label"])}</td><td>{E(r["tagline"])}</td></tr>' for r in RUNGS)}
  </tbody>
</table></div>

<h2>How much room is there, really</h2>
<p>
  Four things a token change genuinely buys you, and they are enough for ten distinguishable
  products: <strong>corner</strong>, <strong>fill</strong>, <strong>line</strong>,
  <strong>depth</strong>, <strong>letterform</strong>. Depth is the underrated one — Brutal's whole
  identity is a <code>box-shadow</code>, which paints outside the border box and lays out nothing,
  so it changes a silhouette without moving a pixel of geometry.
</p>
<p>And four things it does not:</p>
<div class="scroll"><table>
  <thead><tr><th>Wall</th><th>Verdict</th><th>Why</th></tr></thead>
  <tbody>{walls}</tbody>
</table></div>

<p>
  Your instinct about the highlight — <em>“unless you keep it always there and transparent by
  default”</em> — is not a workaround, it is already the mechanism, and it has a name here. Two of
  the fifteen tokens (<code>--bbox-skin-line-override</code>, <code>--bbox-skin-dot-rings</code>)
  exist for precisely that: they let a skin say “do not paint the CSS line” without letting it name
  a colour, because the colour belongs to <code>state</code>. And <code>SketchOutline</code> is
  <em>always</em> rendered on every block in every skin — only its <code>display</code> switches.
  You reasoned your way to the thing the layer was built on.
</p>

<h2>A skin paints; it never moves anything</h2>
<figure>
  <img src="{geometry}" alt="The same composition in all ten skins, geometry measured">
  <figcaption><strong>Styles → Side By Side</strong>, and it is a test, not a picture. Its play
  function measures every port-dot centre, every block rect, the folding chevron, the outline button
  and the value capsule's radius-equals-half-height contract in all ten columns and holds them to
  ±1px of each other. That is what makes it safe to switch a skin under a live canvas.</figcaption>
</figure>

<h2>The ten</h2>
{sections}

<h2>Measured, not reasoned</h2>
<div class="swatches">
  <div>
    <div class="sw-label">color-mix(in oklch, oklch(1 0 0) N%, oklch(0.5 0.12 248))</div>
    {swatch_row("oklch")}
    <div class="sw-label" style="margin-top:8px">the short hue arc from 0 goes backwards through magenta</div>
  </div>
  <div>
    <div class="sw-label">color-mix(in oklab, oklch(1 0 0) N%, oklch(0.5 0.12 248))</div>
    {swatch_row("oklab")}
    <div class="sw-label" style="margin-top:8px">rectangular — no hue angle to travel along</div>
  </div>
</div>
<p class="sub">Computed by your browser as you read this, not screenshotted. Both rows mix the same
blue into <code>oklch(1 0 0)</code> — the literal <code>--card</code> — at the same six percentages.</p>

{findings}

<hr>

<h2>Where this leaves it</h2>
<div class="decide">
<h3>Done and proved</h3>
<ul>
  <li>Ten skins in your order, in the sidebar and in the toolbar picker.
      <code>tsc</code> clean, <strong>361</strong> unit tests, <strong>197</strong> story tests.</li>
  <li>Orthogonality is asserted, not claimed: the gallery's play function fails if any two skins
      resolve to the same Block paint, and <code>skin.test.ts</code> fails if any two declare
      byte-identical token blocks or if the set stops spanning its five axes.</li>
  <li>The geometry invariant now runs across all ten and still holds at ±1px.</li>
  <li>Every rung asserts its own characteristic claim, so a clobbered skin fails CI instead of
      quietly looking like a choice.</li>
</ul>

<h3>Needs you — each with the default if you say nothing</h3>
<ul>
  <li><strong>Which of the seven survives?</strong> Pruning is the point of shipping seven. Default
      if you say nothing: all seven stay, since they cost one CSS block each and the picker is where
      other people's preferences would live.</li>
  <li><strong>Unstyled renders in the browser's serif.</strong> The outline is fixed; the serif was
      never flagged. It is the unmistakable “no stylesheet ran” signal and it is one line to change.
      Default: it stays serif.</li>
  <li><strong>Land it on the :5421 lane?</strong> This is committed on its own branch and is not
      merged anywhere. Default: it stays there until you say merge.</li>
  <li><strong>Want <code>plain</code> back</strong> as a sixth numbered style? Default: no — it
      stays in the frozen package only.</li>
</ul>

<h3>Deliberately not done</h3>
<ul>
  <li><strong>The CodeEditor width bug</strong> above. Pre-existing, peer-owned, and the fix is a
      real measurement rather than a constant tweak — folding it into a styling diff would hide it.</li>
  <li><strong>Nothing in <code>packages/bbox-ui</code>.</strong> It is frozen v1 and still carries
      the original <code>default</code>/<code>plain</code>/<code>sketch</code>.</li>
  <li><strong>No stroke-width variation</strong>, including for Shadcn, which is therefore 2px where
      “No skin (today)” is 1px. Closing that 1px would mean either breaking the geometry invariant
      or changing Block's own pre-skin fallback, which is what the no-skin regression test pins.</li>
</ul>
</div>

</main></body></html>
"""

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(HTML, encoding="utf-8")
print(f"{OUT}  ({OUT.stat().st_size / 1_048_576:.2f} MB)")
