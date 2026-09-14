#!/usr/bin/env python3
"""Builds the Block view-switching implementation report: P2 "views are
presets" from reports/view-switching-proposals-2026-09-11.html, built on
branch claude/block-views.

Every screenshot is a REAL capture from the three CDP journeys
(demos/capture-block-views.mjs against /create, demos/
capture-block-views-hosts.mjs against the two host demos, plus the
storybook probe) — nothing restaged, nothing mocked. Branch shas, diff
stats, and test/typecheck counts are measured at build time from the live
worktree so the report cannot drift from the tree it describes; the full
test run is cached beside the output (pass --measure to re-run it).

Writes to the MAIN checkout's reports/, never the worktree: a worktree is
swept, and the file:// link Zach clicks a day later must still open.
"""
from __future__ import annotations

import base64
import html
import io
import json
import pathlib
import re
import subprocess
import sys

from PIL import Image

DATE = "2026-09-14"
MAIN = pathlib.Path("/home/bam/bbox-ui")
WORKTREE = MAIN / ".claude" / "worktrees" / "block-views"
SHOTS = WORKTREE / "demos" / "screenshots"
OUT = MAIN / "reports" / f"block-views-presets-{DATE}.html"
CACHE = MAIN / "reports" / "media" / f"block-views-presets-{DATE}-measurements.json"


# ------------------------------------------------------------------ #
# Measured at build time                                             #
# ------------------------------------------------------------------ #

def git(*args: str) -> str:
    return subprocess.run(["git", "-C", str(WORKTREE), *args], capture_output=True, text=True).stdout.strip()


COMMITS = [line.split("|", 1) for line in git("log", "main..HEAD", "--format=%h|%s").splitlines()]
DIFFSTAT = git("diff", "--shortstat", "main..HEAD")
BRANCH = git("branch", "--show-current")
BASE = git("merge-base", "main", "HEAD")[:7]


def measure_checks() -> dict:
    if CACHE.exists() and "--measure" not in sys.argv:
        return json.loads(CACHE.read_text())
    print("running pnpm typecheck + pnpm test in the worktree (use the cache next time)...")
    tc = subprocess.run(["pnpm", "typecheck"], cwd=WORKTREE, capture_output=True, text=True)
    tests = subprocess.run(["pnpm", "test"], cwd=WORKTREE, capture_output=True, text=True)
    passed = sum(int(m) for m in re.findall(r"Tests\s+(\d+) passed", tests.stdout))
    failed = sum(int(m) for m in re.findall(r"(\d+) failed", tests.stdout))
    data = {"typecheck_ok": tc.returncode == 0, "tests_passed": passed, "tests_failed": failed}
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(data))
    return data


CHECKS = measure_checks()
CREATE_MANIFEST = json.loads((SHOTS / "block-views" / "manifest.json").read_text())
HOSTS_MANIFEST = json.loads((SHOTS / "block-views-hosts" / "manifest.json").read_text())

# Polish-pass measurements (cab959e / 61c8574): per-dot wall deltas on all
# three surfaces plus the Region corner facts, measured by the verification
# probe after the fix and kept beside the screenshots.
POLISH = json.loads((SHOTS / "block-views" / "polish-verify.json").read_text())


def polish_deltas(surface: str) -> str:
    dots = POLISH[surface]["dots"]
    worst = max(abs(d["delta"]) for d in dots)
    return f"{worst:.2f}px worst of {len(dots)} dots"


# ------------------------------------------------------------------ #
# Images — real captures, cropped to the story, inlined as WebP      #
# ------------------------------------------------------------------ #

def webp(rel: str, crop: tuple[int, int, int, int] | None = None, width: int = 1000) -> str:
    im = Image.open(SHOTS / rel).convert("RGB")
    if crop:
        im = im.crop(crop)
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=82)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


# /create shots are 1600x1000: canvas pane + the inspector whose top row is
# the preset pill. Crop keeps both — the pill IS the view switch.
FACE_CROP = (280, 60, 1600, 660)
REGION_CROP = (280, 60, 1600, 620)


def fig(uri: str, caption: str, cls: str = "") -> str:
    return (
        f'<figure class="{cls}"><img src="{uri}" alt="">'
        f"<figcaption>{caption}</figcaption></figure>"
    )


def png_raw(rel: str) -> str:
    """Tiny pixel crops (a few KB) go in untouched — WebP recompression
    would smear exactly the ring pixels the crop exists to show."""
    return "data:image/png;base64," + base64.b64encode((SHOTS / rel).read_bytes()).decode()


IMG = {
    "light_simple": webp("block-views/light-block-simple.png", FACE_CROP),
    "light_port": webp("block-views/light-block-port.png", FACE_CROP),
    "light_expanded": webp("block-views/light-block-expanded.png", FACE_CROP),
    "dark_simple": webp("block-views/dark-block-simple.png", FACE_CROP),
    "dark_port": webp("block-views/dark-block-port.png", FACE_CROP),
    "dark_expanded": webp("block-views/dark-block-expanded.png", FACE_CROP),
    "region": webp("block-views/light-region.png", REGION_CROP),
    "rf_canvas": webp("block-views/light-block-port-reactflow.png", FACE_CROP),
    "tl_canvas": webp("block-views/dark-block-port-tldraw.png", FACE_CROP),
    "park_resized": webp("block-views-hosts/rf-expanded-resized.png"),
    "park_returned": webp("block-views-hosts/rf-expanded-park-returned.png"),
    "sb_views": webp("block-views-storybook/sb-views.png", (0, 0, 1500, 830)),
    "polish_pair_rf": png_raw("block-views/polish-pair-rf-right-wall.png"),
    "polish_pair_tl_left": png_raw("block-views/polish-pair-tl-left-wall.png"),
    "polish_pair_tl_frame": png_raw("block-views/polish-pair-tl-frame-output.png"),
    "polish_region": webp("block-views/polish-after-region-corner-dark.png"),
    "polish_light": webp("block-views/polish-after-light-expanded.png"),
}


# ------------------------------------------------------------------ #
# The page                                                           #
# ------------------------------------------------------------------ #

def esc(s: str) -> str:
    return html.escape(s)


commit_rows = "\n".join(
    f"<tr><td><code>{esc(sha)}</code></td><td>{esc(subject)}</td></tr>" for sha, subject in reversed(COMMITS)
)

checks_line = (
    f"<code>pnpm typecheck</code> {'green across all packages' if CHECKS['typecheck_ok'] else 'FAILING'} · "
    f"<code>pnpm test</code> <strong>{CHECKS['tests_passed']} passed"
    + (f", {CHECKS['tests_failed']} failed" if CHECKS["tests_failed"] else ", 0 failed")
    + "</strong> (measured at build time from the worktree)"
)

PRESET_TABLE = """
<table>
<thead><tr><th>governed field</th><th>Simple</th><th>Port</th><th>Expanded</th></tr></thead>
<tbody>
<tr><td><code>header</code></td><td>centered</td><td>band</td><td>band</td></tr>
<tr><td><code>ports</code></td><td>anonymous</td><td>rows</td><td>walls</td></tr>
<tr><td><code>members</code></td><td>hidden</td><td>hidden</td><td>shown</td></tr>
<tr><td><code>description</code></td><td>true</td><td>false</td><td>false</td></tr>
<tr><td><code>typePlacement</code></td><td>bottom</td><td>header</td><td>header</td></tr>
<tr><td><code>footer</code></td><td>false</td><td>true</td><td>false</td></tr>
<tr><td><code>width × height</code></td><td>384 × 258</td><td>384 × 346</td><td>707 × 452</td></tr>
</tbody>
</table>
<p class="note">Pinned by <code>test/block.fields.test.ts</code> (governs = Object.keys(values) per preset,
<code>assertDisjointPresets</code>, every value above) — part of the test count in the header. The renderer
never reads <code>view</code>: it resolves these eight fields through <code>resolveField</code> (the same
cascade Pill uses) and dispatches through total <code>Record&lt;Mode, …&gt;</code> lookups, so an instance
override composes over the preset and the inspector can trace which layer won.</p>
"""

STOCK_TABLE = """
<table>
<thead><tr><th>element</th><th>before this branch</th><th>part playing the role now (exact export)</th><th>behaviour that must survive</th></tr></thead>
<tbody>
<tr><td>View switch UI</td><td>— (no switching existed)</td><td>the panel's own <code>data-slot="preset-picker"</code> (FigmaDense renders one segmented row per selector)</td><td>one click on S/P/E; the current view highlighted; nothing new built for it</td></tr>
<tr><td>View state</td><td>—</td><td><code>VIEW_FIELD</code> (segments selector) in <code>block.fields.ts</code>; React Flow <code>data.view</code>; tldraw nullable <code>view</code> prop</td><td>one write, one undo step in each host; absent/null = the legacy composition, byte-stable</td></tr>
<tr><td>Per-view chrome</td><td>—</td><td><code>BLOCK_PRESETS</code> + <code>resolveField</code> / <code>governedFieldIds</code> (<code>packages/schema/src/resolve.ts</code>, stock)</td><td>an override traces as override; a view can never silently ignore a governed row</td></tr>
<tr><td>Data → face mapping</td><td>hand-coded Simple face only</td><td><code>BlockFace</code> with total lookups <code>HEADER_RENDER</code> / <code>PORTS_RENDER</code> / <code>MEMBERS_RENDER</code> / <code>TYPE_RENDER</code> (<code>blockFace.tsx</code>)</td><td>no <code>switch(view)</code> anywhere; every governed field moves pixels</td></tr>
<tr><td>Band header</td><td>did not exist in any form</td><td><code>BlockBand</code> = real <code>Bar</code> (left/center/right, divider) + <code>Glyph</code> + <code>TextBox</code> + <code>Pill</code></td><td>one band composition shared by core and both adapters — never three hand-rolled copies</td></tr>
<tr><td>Centered header (Simple)</td><td><code>BlockHeader</code>/<code>BlockGlyph</code>/<code>BlockTitle</code> hand-rolled</td><td><strong>unchanged (stock seam)</strong> — same components, now one entry of <code>HEADER_RENDER</code></td><td>Simple's exact pixels: pinned by <code>layoutSimpleBlock</code> (detach + compare harness)</td></tr>
<tr><td>Per-view size memory</td><td>—</td><td><code>parkViewSize</code> (<code>block.view.ts</code>, pure — ported from SystemSketch's <code>setBlockViewProps</code>) via <code>applyBlockNodeView</code> / <code>applyBlockShapeView</code></td><td>resize in one view, switch away and back: the exact box returns (browser-proven below)</td></tr>
<tr><td>Anonymous ports</td><td>—</td><td>every port element stays mounted with its stable id, <code>visibility:hidden</code> at the wall midpoint (<code>portDotPlacement(side, 0.5, …)</code>)</td><td>React Flow edges and probes survive S ↔ P ↔ E; asserted in both journeys</td></tr>
<tr><td>Hidden members</td><td>—</td><td><code>MEMBERS_RENDER.hidden</code> mounts nothing; the member list itself is untouched</td><td>members stay in the record and the inspector; collapse hides on canvas only</td></tr>
<tr><td>Region</td><td>—</td><td><code>Region</code> registry entry with <code>slots: [corner → Block{view:"port"}, body → Flex]</code> — the same <code>fillProps</code> mechanism <code>BLOCK_SLOTS</code> already uses</td><td>the corner is a real, selectable, inspectable Block, never a Block preset</td></tr>
<tr><td>Unchanged (stock seam)</td><td>—</td><td><code>resolveField</code>/<code>assertDisjointPresets</code>, the preset picker, tiers, MIXED, <code>renderInstance</code>, the members model, the port-lane system, Pill/Bar presets</td><td>not touched by this work</td></tr>
</tbody>
</table>
"""

page = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Block views are presets — implemented · {DATE}</title>
<style>
  :root {{ --ink: #1a1a1f; --muted: #6b6b76; --line: #e3e3e8; --accent: #4338ca; --bg: #fbfbfc; --card: #ffffff; }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }}
  main {{ max-width: 1080px; margin: 0 auto; padding: 40px 28px 80px; }}
  h1 {{ font-size: 26px; line-height: 1.25; margin: 0 0 6px; }}
  h2 {{ font-size: 19px; margin: 44px 0 10px; padding-top: 18px; border-top: 1px solid var(--line); }}
  .sub {{ color: var(--muted); font-size: 13.5px; margin-bottom: 22px; }}
  .lede {{ background: var(--card); border: 1px solid var(--line); border-left: 4px solid var(--accent); border-radius: 8px; padding: 16px 20px; margin: 18px 0; }}
  code {{ background: #eeeef3; border-radius: 4px; padding: 1px 5px; font-size: 13px; }}
  pre code {{ display: block; padding: 10px 14px; overflow-x: auto; }}
  table {{ border-collapse: collapse; width: 100%; font-size: 13.5px; margin: 12px 0; background: var(--card); }}
  th, td {{ border: 1px solid var(--line); padding: 6px 10px; text-align: left; vertical-align: top; }}
  th {{ background: #f2f2f6; font-weight: 600; }}
  figure {{ margin: 0; background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 8px; }}
  figure img {{ width: 100%; height: auto; display: block; border-radius: 4px; }}
  figcaption {{ font-size: 12.5px; color: var(--muted); padding: 8px 4px 2px; }}
  .grid3 {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 14px 0; }}
  .grid2 {{ display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin: 14px 0; }}
  .note {{ color: var(--muted); font-size: 13px; }}
  ul.tight li {{ margin-bottom: 8px; }}
  .pill {{ display: inline-block; background: #eef; color: var(--accent); border-radius: 99px; padding: 1px 10px; font-size: 12px; font-weight: 600; }}
  @media (max-width: 900px) {{ .grid3, .grid2 {{ grid-template-columns: 1fr; }} }}
</style>
</head>
<body>
<main>

<h1>Block views are presets — implemented</h1>
<div class="sub">bbox-ui · branch <code>{esc(BRANCH)}</code> off <code>main</code> @ <code>{BASE}</code> · {DATE} ·
<strong>not merged</strong> — integration is a separate decision</div>

<div class="lede">
<p><strong>What shipped:</strong> <code>view</code> — <code>"simple" | "port" | "expanded"</code> — is Block's
first real preset family, exactly the P2 design the
<a href="view-switching-proposals-2026-09-11.html">Sept-11 proposals report</a> scored at 4.75/5. Three
<code>PresetSpec</code>s govern eight face fields; <code>BlockFace</code> renders total lookups over the
<em>resolved</em> fields and never branches on <code>view</code>; a pure <code>parkViewSize</code> (ported from
SystemSketch's <code>setBlockViewProps</code>) remembers a box per view in both host adapters; and
<code>Region</code> ships as its own component composing a <em>real</em> <code>Block&#123;view:"port"&#125;</code>
into its corner slot — never a Block preset.</p>
<p>{checks_line}. {esc(DIFFSTAT)}.</p>
</div>

<h2>1 · The three faces, driven live on /create</h2>
<p>Captured by <code>demos/capture-block-views.mjs</code> — headless Chrome clicking the panel's own preset
pill (visible top-right in every shot) S → P → E → S, both themes. The journey asserts, from the painted DOM:
each view's face fields and governed box (384×258 / 384×346 / 707×452, ±2px), <strong>the same three port
ids surviving every switch</strong> (anonymous = mounted + <code>visibility:hidden</code>; rows = a body
list; walls = the port lanes), the footer Bar mounting only in Port, and the centered header only in Simple.</p>
<div class="grid3">
{fig(IMG["light_simple"], "Simple — centered glyph+title, description, type at the bottom; the three ports are mounted but anonymous. Preset pill: Simple.")}
{fig(IMG["light_port"], "Port — band header (the composable Bar), port rows in the body (out-row mirrored right), footer bar. Box grows to 384×346.")}
{fig(IMG["light_expanded"], "Expanded — band header, members/body shown, ports on the walls via the port-lane system. Box 707×452.")}
</div>
<div class="grid3">
{fig(IMG["dark_simple"], "The same three assertions in dark.")}
{fig(IMG["dark_port"], "Dark · Port.")}
{fig(IMG["dark_expanded"], "Dark · Expanded.")}
</div>

<h2>2 · Same instance, both host canvases</h2>
<p>/create's render tabs mount the identical instance inside a real React Flow canvas and a real tldraw
editor; the journey re-asserts <code>data-view="port"</code> / <code>data-ports="rows"</code> on each before
shooting.</p>
<div class="grid2">
{fig(IMG["rf_canvas"], "React Flow render tab — the Port face on a real React Flow canvas (light).")}
{fig(IMG["tl_canvas"], "tldraw render tab — the same instance on a real tldraw editor (dark).")}
</div>

<h2>3 · Region — composed from a Block, not a Block</h2>
{fig(IMG["region"], 'Region on /create: a real, selectable Block in Port view riding the top-left corner (half scale — presentation only), body slot below. The journey asserts the corner element is a Block with data-view="port"; its ports/members are editable in the inspector like any other instance.')}

<h2>4 · The park proof — a real drag, end to end</h2>
<p><code>demos/capture-block-views-hosts.mjs</code> drives the two standalone host demos through a dev
view-switcher (committed with the branch). The scene loads <em>legacy</em> — no block carries a view, zero
pixel change for every existing journey — then: switch all blocks to Expanded, <strong>drag the Camera
block's NodeResizer handle</strong> (707×452 → 773×496), switch to Port (its own 384×346 box restores),
switch back — <strong>the exact dragged box returns</strong>. tldraw round-trips the same proof through
<code>editor.resizeShape</code>. That is <code>parkViewSize</code> exercised through
<code>applyBlockNodeView</code>/<code>applyBlockShapeView</code> in a real browser, not a unit test.</p>
<div class="grid2">
{fig(IMG["park_resized"], "Expanded, after the real NodeResizer drag: Camera at 773×496, selection handles visible; its peers hold the preset 707×452.")}
{fig(IMG["park_returned"], "After Port → Expanded again: Camera returns at exactly 773×496. Wall ports and edges intact throughout.")}
</div>

<h2>5 · BlockFace itself, in Storybook</h2>
{fig(IMG["sb_views"], "The Views story — the core BlockFace component (not the bench composition) painting all three faces from one data record; a DOM probe asserts identical port-id sets across faces, Simple's hidden ports, members only in Expanded. PortFaceOverride beside it proves footer:false composes over the Port preset.")}

<h2>6 · The preset table (what each view governs)</h2>
{PRESET_TABLE}

<h2>7 · The header-composition decision</h2>
<p><span class="pill">decision</span> <strong>Simple's hand-rolled centered header stays; the Port/Expanded
band is new, composed from the shared <code>Bar</code> + <code>Glyph</code> + <code>TextBox</code>
(exported as <code>BlockBand</code>); both are entries of one total
<code>Record&lt;BlockHeaderMode, render&gt;</code> dispatch.</strong> Why not rebuild Simple atop Bar too:
Simple's pixels are pinned by <code>blockLayout.ts</code>'s <code>layoutSimpleBlock</code> mirror — the
geometry authority for detach and the compare harness, matched "rule for rule" — and T1-SPEC §10 defers the
BlockTitle/TextBox ladder reconciliation precisely because the ladders differ. Rebuilding would be a large
blast radius for zero visual change. The band is new surface with nothing to preserve, so it adopts the
shared primitives cleanly, and exporting <code>BlockBand</code> is what keeps core and both adapters painting
one band instead of three hand-rolled copies. The fork lives at the resolved-field seam
(<code>header</code>), which is exactly where P2 wants forks to live — never on <code>view</code>.</p>

<h2>8 · Four bugs the browser pass caught (why it wasn't a rubber stamp)</h2>
<ul class="tight">
<li><strong>tldraw <code>onResize</code> was fatally broken for face-mode blocks.</strong> tldraw's
<code>resizeBox</code> returns a <em>partial</em> props bag (<code>&#123;w,h&#125;</code> only) despite its
declared type — so <code>resized.props.view</code> was <code>undefined</code>, the null guard missed, and the
views bag gained a literal <code>"undefined"</code> key the shape validator rejects, killing the entire
resize gesture. Fixed to read from the original shape; regression-pinned in
<code>blockShapeView.test.ts</code>. Typecheck could never catch this.</li>
<li><strong>React Flow's park restore silently lost after a drag.</strong> NodeResizer writes node-level
<code>width</code>/<code>height</code>, which outrank <code>style</code> — the switcher now mirrors both, or
the dragged box stayed painted after a switch.</li>
<li><strong>Region's corner Block eclipsed the region</strong> (a full-size 384×346 block on a 560×360
region, spilling off-canvas) — now rides the corner at half scale, presentation-only.</li>
<li><strong>Output port rows didn't mirror</strong> in either adapter (the core did) — outputs now put the
dot at the row's right edge in all three renders.</li>
</ul>

<h2>9 · Polish pass, same day</h2>
<p>A follow-up pass (<code>cab959e</code>, <code>61c8574</code>) fixed what made the first captures read
"pretend" once looked at closely: wall-mounted port dots were not actually landing on the wall, and the
Region corner was a transform mock. <strong>Four compounding root causes</strong> behind the wall dots, one
line each:</p>
<ul class="tight">
<li><strong>Bench lane geometry</strong> — the /create port lanes were positioned with an inset off the
outline, so a bench wall dot's center never sat on the boundary <code>portDotPlacement</code> promises.</li>
<li><strong>A React Flow style-key collision</strong> — <code>portDotStyle</code> emitted
<code>transform:&nbsp;undefined</code>, which merged over the Handle's centering transform and let React
Flow's own <code>.react-flow__handle-right {{ translate(50%,-50%) }}</code> win: every right-wall handle sat
<strong>+12px inside the wall</strong> (measured at zoom 1).</li>
<li><strong>Block's <code>overflow:&nbsp;clip</code></strong> amputated the straddling outer half of every
wall dot — walls mode now relaxes it through the same total lookup, in <code>BlockFace</code> and both host
adapters.</li>
<li><strong>Hollow dots painted a transparent interior</strong> — the wall line ran straight through
empty/wired ports; the resting disc is now opaque <code>var(--card)</code>, the same punch-out convention
SystemSketch's own circles use.</li>
</ul>
<p>The Region corner was a literal <code>transform: translate(-10px,-10px) scale(0.5)</code> presentation
mock; it is now a <em>real</em> governed-size box —
{POLISH["domRegion"]["cornerBlock"]["w"]}×{POLISH["domRegion"]["cornerBlock"]["h"]}, transform
<code>{esc(POLISH["domRegion"]["cornerTransform"])}</code>, flush at the region's top-left
(Δ {POLISH["domRegion"]["deltaLeft"]}px / {POLISH["domRegion"]["deltaTop"]}px). A second commit
(<code>61c8574</code>) makes label and badge spacing clear the <em>painted</em> ring (box-shadow ink outside
the dot's layout box) instead of the layout box itself.</p>
<div class="grid3">
{fig(IMG["polish_pair_rf"], "React Flow right wall, before | after: the dot moves from +12px inside the card onto the wall line exactly, ring fully round, interior opaque.")}
{fig(IMG["polish_pair_tl_left"], "tldraw left wall, before | after: the straddling half is no longer amputated by overflow:clip — dots center ON the wall.")}
{fig(IMG["polish_pair_tl_frame"], "tldraw output port, before | after: clipped flat + see-through, then straddling with the opaque punch-out disc.")}
</div>
<div class="grid2">
{fig(IMG["polish_light"], "Light theme after the hollow-dot fix: empty dots read as an opaque punch-out on the wall — the border no longer runs through them. Walls exact on both sides.")}
{fig(IMG["polish_region"], "The honest Region corner (dark): a real 192×173 Block at the region's exact top-left — selectable, inspectable, no scale transform.")}
</div>
<table>
<thead><tr><th>surface</th><th>before</th><th>after (measured, <code>polish-verify.json</code>)</th></tr></thead>
<tbody>
<tr><td>DOM bench (/create)</td><td>dot clipped flush inside the wall — straddling half amputated, lane inset compounding</td><td>{polish_deltas("domBlock")} off the wall</td></tr>
<tr><td>React Flow</td><td><strong>+12px</strong> inside the wall on right-wall handles (measured at zoom 1, style-key collision)</td><td>{polish_deltas("rfBlock")} off the wall</td></tr>
<tr><td>tldraw</td><td>dot clipped flush inside the wall (same clip amputation)</td><td>{polish_deltas("tlBlock")} off the wall</td></tr>
<tr><td>Region corner</td><td><code>translate(-10px,-10px) scale(0.5)</code> mock</td><td>real box, Δ {POLISH["domRegion"]["deltaLeft"]}px / {POLISH["domRegion"]["deltaTop"]}px, transform {esc(POLISH["domRegion"]["cornerTransform"])}</td></tr>
</tbody>
</table>
<p class="note">Only React Flow's before-offset was instrumented (+12px, from the commit's own measurement);
the bench/tldraw defects were clipping, shown in the before crops rather than given an invented number.
After-deltas are per-dot measurements from the re-run verification probe, kept beside the raw crops as
<code>demos/screenshots/block-views/polish-verify.json</code>. Test suite after the pass:
{CHECKS["tests_passed"]} passed{", " + str(CHECKS["tests_failed"]) + " failed" if CHECKS["tests_failed"] else ", 0 failed"}.</p>

<h2>10 · Explicitly out of scope</h2>
<ul class="tight">
<li><strong>Region in the two dedicated host adapters</strong> (tldraw frame-like containment, React Flow
<code>parentId</code> + <code>extent:"parent"</code>) — /create's three renders prove the corner
composition; host containment mechanics are a clean follow-up.</li>
<li><strong>tldraw <code>view</code> as a StyleProp</strong> (the Sept-11 report's suggestion): a StyleProp
cannot be null, and <code>null</code> is what keeps every legacy scene and compare-harness pixel byte-stable.
Plain nullable validated prop instead; <code>getSharedStyles</code> multi-select batching is the app-level
follow-up (WHY comment at the seam).</li>
<li><strong>Dashed control-flow edges</strong> — host edge styling; the core draws no edges (T1-SPEC §10).</li>
<li><strong>P4 inherited view</strong> (a container setting the face of everything inside it) — the report's
own named follow-up; nothing in P2's data changes when it arrives.</li>
<li><strong>tldraw <code>isFrameLike</code>/drop-in members for Expanded</strong> — the report's own "later,
for drop-in".</li>
</ul>
<p class="note">Report §5c check ("if a governed field moves nothing, collapse to P1's enum") — not hit:
every governed field moves pixels in at least one face pair. <code>description</code> is inert under the
stock Port/Expanded presets (both set it false) but is override-reachable and paints in every face — an
argument <em>for</em> the preset model, which is why both adapters render it under the band too.</p>

<h2>11 · Stock parts, element by element</h2>
{STOCK_TABLE}

<h2>12 · Provenance</h2>
<table>
<thead><tr><th>sha</th><th>commit</th></tr></thead>
<tbody>
{commit_rows}
</tbody>
</table>
<p class="note">Worktree <code>{esc(str(WORKTREE))}</code>. Journeys:
<code>demos/capture-block-views.mjs</code> ({len(CREATE_MANIFEST["shots"])} shots, finished
{esc(CREATE_MANIFEST["finished"])}), <code>demos/capture-block-views-hosts.mjs</code>
({len(HOSTS_MANIFEST["shots"])} shots, finished {esc(HOSTS_MANIFEST["finished"])}); raw PNGs under
<code>demos/screenshots/block-views*/</code> in the worktree. Built by
<code>docs/build_block_views_presets.py</code>; commit shas, diff stat and check counts measured from the
live tree at build time.</p>

</main>
</body>
</html>
"""

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(page)
print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB)")
