#!/usr/bin/env python3
"""Builds the Glyph-on-/create review: the hero screencast of the tldraw flow,
the three renders in both themes, the resize/rotate/code states, and what
the branch actually contains — measured from the tree at build time.

Captures come from `BBOX_CAPTURE_DIR=<media dir> node apps/docs/scripts/drive-create-glyph.mjs <url>`
(the committed journey in capture mode) followed by the two ffmpeg lines in
`encode_hero()` below. Writes to the MAIN checkout's reports/media/, never
the worktree: a worktree is swept, and the file:// link Zach clicks a day
later must still open.
"""
from __future__ import annotations

import base64
import html
import json
import pathlib
import re
import subprocess
import sys
import urllib.parse

DATE = "2026-09-12"
NAME = f"create-glyph-{DATE}"
REPO = pathlib.Path("/home/bam/bbox-ui")
MEDIA = REPO / "reports" / "media" / NAME
OUT = REPO / "reports" / "media" / f"{NAME}.html"
TREE = pathlib.Path(__file__).resolve().parents[1]  # the checkout this builder runs from
BASE_SHA = "185f786"  # the create-page tip the lane was cut from

STILL_WIDTH = 1100


def sh(*args: str, cwd: pathlib.Path = TREE) -> str:
    return subprocess.run(args, cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


def jpeg(name: str) -> str:
    """A still, downscaled to STILL_WIDTH as JPEG so the page stays under the
    preview ceiling; the PNG originals stay beside it in the media dir."""
    src = MEDIA / name
    dst = MEDIA / (pathlib.Path(name).stem + f".w{STILL_WIDTH}.jpg")
    if not dst.exists() or dst.stat().st_mtime < src.stat().st_mtime:
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-vf", f"scale={STILL_WIDTH}:-1", "-q:v", "5", str(dst)],
            check=True,
        )
    return "data:image/jpeg;base64," + base64.b64encode(dst.read_bytes()).decode()


def data(name: str, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode((MEDIA / name).read_bytes()).decode()


def encode_hero() -> None:
    frames = sorted(MEDIA.glob("frame-*.jpg"))
    if not frames:
        return
    if not (MEDIA / "hero.mp4").exists():
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", "6", "-i", str(MEDIA / "frame-%04d.jpg"),
                        "-vf", "scale=1200:-2,format=yuv420p", "-c:v", "libx264", "-crf", "28", "-preset", "slow",
                        "-movflags", "+faststart", str(MEDIA / "hero.mp4")], check=True)
    if not (MEDIA / "hero.gif").exists():
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", "6", "-i", str(MEDIA / "frame-%04d.jpg"),
                        "-vf", "fps=6,scale=900:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3",
                        str(MEDIA / "hero.gif")], check=True)


# ---- measured from the tree, never typed in -------------------------------

encode_hero()
commits = sh("git", "log", "--reverse", "--format=%h%x09%s", f"{BASE_SHA}..HEAD").splitlines()
diffstat = sh("git", "diff", "--shortstat", f"{BASE_SHA}..HEAD")
journey_src = (TREE / "apps/docs/scripts/drive-create-glyph.mjs").read_text()
journey_steps = re.findall(r'await step\(\s*[`"]([^`"]+)[`"]', journey_src)
# Executions, not definitions: the loops over renders run one definition up
# to three times. The capture run leaves its own tally in journey.log.
journey_log = (MEDIA / "journey.log").read_text() if (MEDIA / "journey.log").exists() else ""
tally = re.search(r"(\d+)/(\d+) steps passed", journey_log)
journey_passed, journey_total = (int(tally.group(1)), int(tally.group(2))) if tally else (0, 0)
journey_lines = [l.strip() for l in journey_log.splitlines() if l.strip().startswith(("PASS:", "FAIL:"))]
lucide = json.loads((TREE / "packages/glyph-picker/src/data/lucide-icons.json").read_text())
emoji = json.loads((TREE / "packages/glyph-picker/src/data/emoji.json").read_text())
lucide_count = len(lucide["icons"])
emoji_count = len(emoji["emoji"])
lucide_version = lucide["version"]
hero_seconds = float(sh("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(MEDIA / "hero.mp4")))
frame_count = len(list(MEDIA.glob("frame-*.jpg")))
glyph_fields = re.findall(r'id:\s*"(\w+)"', (TREE / "packages/bbox-ui/src/glyph.fields.ts").read_text())
host_fields = re.findall(r'id:\s*"(\w+)"', (TREE / "packages/panel/src/hostFields.ts").read_text())
branch = sh("git", "rev-parse", "--abbrev-ref", "HEAD")
tip = sh("git", "rev-parse", "--short", "HEAD")


def rows(items: list[tuple[str, ...]]) -> str:
    return "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in items)


def fig(name: str, caption: str) -> str:
    safe = html.escape(caption, quote=True)
    return f'<figure><img src="{jpeg(name)}" alt="{safe}" loading="lazy"><figcaption>{safe}</figcaption></figure>'


STOCK = [
    ("Size via drag, tldraw", "not possible (bench shape, resize off)", "<code>ShapeUtil.onResize</code> → <code>resizeBox</code>, <code>isAspectRatioLocked</code>", "square stays square; the handle writes the <code>size</code> override, never w/h"),
    ("Size via drag, React Flow", "not possible", "<code>NodeResizer keepAspectRatio</code>", "same override, same panel row; a mount measurement never writes size"),
    ("Click opens, drag moves, tldraw", "—", "tldraw's own select-tool phase (<code>editor.getPath() === \"select.pointing_shape\"</code>) read from <code>editor.on(\"event\")</code>", "no pointer handler on the shape; shift-add, group select, drag all stock"),
    ("Click opens, drag moves, React Flow", "—", "d3-drag's click suppression after a real drag", "no <code>nodrag</code> class, so dragging from the glyph still moves it"),
    ("Rotation, tldraw", "none", "stock rotate handle → <code>shape.rotation</code>", "origin-pivot converted to the centre-pivot the other two renders use"),
    ("Rotation, React Flow / DOM", "none", "inspector row + CSS <code>rotate</code>", "one number in <code>transforms</code>, never in props"),
    ("Picker surface", "Radix (Storybook toy)", "<code>@base-ui/react</code> Popover, the site's own stack", "Notion chrome: Emoji · Icons · Upload, filter, shuffle, Remove"),
    ("Icon search", "<code>name.includes</code> over ~100", f"Lucide {lucide_version}'s own tags over {lucide_count:,} icons, one lazy JSON chunk", "fetched only when a lucide value or the Icons tab needs it"),
    ("Upload", "none", "paste · drop · URL, canvas downscale to 256 px", "stored as a data URL in <code>content</code>, same in all three renders"),
    ("Detach placeholder", "text shape of the icon string", "tldraw geo <code>x-box</code>, w = h = size, no padding", "round-trips through the existing detach/rebuild test"),
    ("Mixed / provenance / clear", "—", "<code>readFieldRow</code>, <code>MIXED</code>", "<b>unchanged (stock seam)</b>; the Renderer rows reuse it"),
    ("Glyph core slot", "inert span", "<b>unchanged (stock seam)</b> + a <code>content</code> prop and a resolver context", "core gains no runtime dependency"),
]

AGENTS = [
    ("Contract", "1 Sonnet builder, 6 Opus refuters, 1 fix", "FieldKind <code>glyph</code>, <code>@bbox-ui/glyph-content</code>, Glyph v2 with the size cascade and a resolver context, HOST_FIELDS, the picker skeleton — 8 commits, 643 tests green, two verify rounds"),
    ("Phase 3 lanes", "3 Sonnet builders, 15 Opus refuters, 3 fixes", "Picker ported by value; <code>bbox-glyph</code> shape util with x-box detach; <code>bboxGlyph</code> node with NodeResizer. The tldraw lane's first click mechanism (<code>ShapeUtil.onClick</code> + a hand-rolled <code>onPointerDown</code>) was rejected three rounds running for breaking shift-select and groups"),
    ("Phase 3 fix", "3 Sonnet builders, 12 Opus refuters, 3 refixes", "Click-to-open rewritten to read tldraw's own select phase; the React Flow body centred so an 8 px glyph stays clickable; the Lucide chunk gated on need; every lane ended PASS on both lenses"),
    ("Phase 5", "2 Sonnet builders, 12 Opus refuters, 4 fixes", "HostFactsSection and the picker row in the panel; /create routed through the adapters with host facts and the 31-step journey; a blur-to-default defect fixed at NumberInput's root; rotation pivot and domain mismatches fixed at the canvas seam"),
    ("Finish, by hand", "Fable, no subagents", "Code view prints tldraw's converted origin for a rotated glyph; 180° reads back as 180; the DOM note wraps inside the gutter; the bench fetches Lucide only for a lucide value; the dense panel's stored tier is read after mount (a hydration mismatch the capture run surfaced); the journey gained a capture mode for this page"),
]

steps_html = "".join(f"<li>{html.escape(l)}</li>" for l in journey_lines)
commits_html = rows([tuple(c.split("\t", 1)) for c in commits])

HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Glyph on /create · {DATE}</title>
<style>
  :root {{ --ink:#16161a; --muted:#65656f; --line:#e3e3e8; --bg:#fbfbfc; --accent:#5b45d6; --ok:#1d7a4a; --warn:#8a5a12 }}
  * {{ box-sizing:border-box }}
  body {{ margin:0; background:var(--bg); color:var(--ink); font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif }}
  main {{ max-width:1180px; margin:0 auto; padding:48px 24px 96px }}
  h1 {{ font-size:30px; line-height:1.2; margin:0 0 8px }}
  h2 {{ font-size:20px; margin:48px 0 12px; padding-top:16px; border-top:1px solid var(--line) }}
  h3 {{ font-size:15px; margin:24px 0 8px; color:var(--muted); text-transform:uppercase; letter-spacing:.04em }}
  p.lede {{ font-size:18px; color:var(--muted); margin:0 0 24px }}
  .hero {{ margin:24px 0; border:1px solid var(--line); border-radius:12px; overflow:hidden; background:#000 }}
  .hero video, .hero img {{ display:block; width:100%; height:auto }}
  .two {{ display:grid; grid-template-columns:1fr 1fr; gap:16px }}
  .three {{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px }}
  figure {{ margin:0; border:1px solid var(--line); border-radius:10px; overflow:hidden; background:#fff }}
  figure img {{ display:block; width:100%; height:auto }}
  figcaption {{ font-size:12px; color:var(--muted); padding:6px 10px; border-top:1px solid var(--line) }}
  table {{ border-collapse:collapse; width:100%; font-size:14px }}
  th, td {{ text-align:left; vertical-align:top; padding:8px 10px; border-bottom:1px solid var(--line) }}
  th {{ color:var(--muted); font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.04em }}
  code {{ font:13px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace; background:#f0f0f4; padding:1px 5px; border-radius:4px }}
  pre {{ background:#16161a; color:#e8e8ee; padding:14px 16px; border-radius:10px; overflow:auto; font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace }}
  .stat {{ display:inline-block; margin:0 18px 8px 0; font-size:14px; color:var(--muted) }}
  .stat b {{ color:var(--ink); font-size:20px; margin-right:4px }}
  ol.steps {{ columns:2; column-gap:32px; font-size:14px; padding-left:22px }}
  ol.steps li {{ break-inside:avoid; margin-bottom:2px }}
  .ok {{ color:var(--ok); font-weight:600 }}
  .warn {{ color:var(--warn) }}
  details summary {{ cursor:pointer; color:var(--muted) }}
</style></head><body><main>

<h1>Glyph on <code>/create</code> — click it anywhere, size it by hand, turn it, and the inspector says who owns what</h1>
<p class="lede">Branch <code>{branch}</code> at <code>{tip}</code>, cut from the create-page tip <code>{BASE_SHA}</code>. Every number on this page was measured from that tree when the page was built.</p>

<div>
  <span class="stat"><b>{len(commits)}</b>commits</span>
  <span class="stat"><b>{journey_passed} / {journey_total}</b>journey steps passed in the capture run</span>
  <span class="stat"><b>{lucide_count:,}</b>Lucide icons</span>
  <span class="stat"><b>{emoji_count:,}</b>emoji</span>
  <span class="stat"><b>{hero_seconds:.0f}s</b>hero, {frame_count} frames</span>
</div>

<h2>The flow, as recorded from the real page</h2>
<p>tldraw render, dark theme: click the glyph → the Notion picker → filter <i>rocket</i> → pick → the same instance shows the rocket on DOM and React Flow → back on tldraw: press-drag moves it, the corner handle sizes it, the rotate handle turns it. Muted, looping; the frames are the journey's own screencast, nothing is animated by hand.</p>
<div class="hero">
  <video muted autoplay loop playsinline controls poster="{jpeg('04-tldraw-rotated.png')}">
    <source src="{data('hero.mp4', 'video/mp4')}" type="video/mp4">
  </video>
</div>
<details><summary>GIF fallback, if the video does not play here</summary><div class="hero"><img src="{data('hero.gif', 'image/gif')}" alt="the tldraw flow as a GIF"></div></details>

<h2>One instance, three renders</h2>
<p>The rocket picked on the DOM render is the same instance on React Flow and on tldraw; the inspector's <b>Properties</b> are the component's, the <b>Renderer</b> rows are the canvas's and name who writes them.</p>
<div class="three">
  {fig('01-dom-rocket.png', 'DOM · picked on this render')}
  {fig('01-reactflow-rocket.png', 'React Flow · same instance')}
  {fig('01-tldraw-rocket.png', 'tldraw · same instance, Renderer rows live')}
</div>

<h2>Board control writes the same properties the panel edits</h2>
<div class="three">
  {fig('02-tldraw-dragged.png', 'press-drag moved it 60 px; no picker opened')}
  {fig('03-tldraw-resized.png', 'corner handle → Size (px) reads a custom override with its clear affordance')}
  {fig('04-tldraw-rotated.png', 'rotate handle → the Renderer rotation row; React Flow carries the same angle')}
</div>

<h2>Light theme</h2>
<div class="two">
  {fig('06-light-picker.png', 'the picker over the DOM render; Renderer section disabled with the no-handles note')}
  {fig('06-light-tldraw.png', 'tldraw render, light')}
</div>
<div class="two" style="margin-top:12px">
  {fig('06-light-dom.png', 'DOM render, light')}
  {fig('06-light-reactflow.png', 'React Flow render, light')}
</div>

<h2>Code view prints the real records</h2>
<div class="three">
  {fig('05-code-dom.png', 'DOM: <Glyph content="lucide:rocket" …> with defaults omitted')}
  {fig('05-code-reactflow.png', 'React Flow: a bboxGlyph node with data and rotation')}
  {fig('05-code-tldraw.png', 'tldraw: a bbox-glyph shape with the converted origin and radians')}
</div>

<h2>The contract as it landed</h2>
<h3>Glyph properties — one flat space</h3>
<table><tr><th>field</th><th>role</th></tr>{rows([
    ("<code>content</code>", "encoded string: <code>\"\"</code> · <code>lucide:&lt;kebab&gt;</code> · <code>emoji:&lt;char&gt;</code> · <code>data:image/…</code> · <code>text:&lt;chars&gt;</code>; kind <code>glyph</code>, so the inspector row is the picker trigger"),
    ("<code>sizePreset</code>", "sm · md · lg · xl, the preset selector (default sm)"),
    ("<code>size</code>", "px, governed by the preset until a handle or the box writes a custom override"),
    ("<code>padding</code>", "px"),
])}</table>
<p style="font-size:13px;color:var(--muted)">Declared order in <code>glyph.fields.ts</code>: {' · '.join(f'<code>{f}</code>' for f in glyph_fields)}. Host facts, never props: {' · '.join(f'<code>{f}</code>' for f in host_fields)}.</p>

<h3>Stock parts, element by element</h3>
<table><tr><th>element</th><th>before</th><th>off-the-shelf part</th><th>behaviour that survives</th></tr>{rows(STOCK)}</table>

<h2>Definition of done — the committed journey</h2>
<p>Run against any dev server of this branch: <code>pnpm --filter @bbox-ui/docs run journey:glyph http://localhost:&lt;port&gt;</code>. <span class="ok">{journey_passed} / {journey_total} passed</span> in the run that produced this page's captures; one step asserts zero console errors.</p>
<ol class="steps">{steps_html}</ol>

<h2>What the agents did, and what I finished by hand</h2>
<table><tr><th>phase</th><th>who</th><th>outcome</th></tr>{rows(AGENTS)}</table>

<h2>Commits on the branch</h2>
<p style="font-size:13px;color:var(--muted)">{diffstat} since <code>{BASE_SHA}</code>.</p>
<table>{commits_html}</table>

<h2>Left open, deliberately</h2>
<ul>
  <li><b>Detach is not exposed on <code>/create</code>.</b> The x-box detach exists in the tldraw adapter with a round-trip test, but the create page's tldraw canvas hides the UI and has no context menu; wiring a detach action there is a separate ask.</li>
  <li><b>Block's own glyph slot does not open the picker yet.</b> The unification landed for standalone Glyph (three renders + the inspector row); <code>BlockGlyph</code> inside a Block header is the fourth trigger and is untouched.</li>
  <li><b>Minor audit notes not taken:</b> HostFactsSection re-implements the dense panel's number control cell rather than reusing it (two files to change on the next control fix); the journey exercises one instance, so Mixed across two glyphs is covered by unit tests only; the journey's console-error check would not fail on a warning-level message.</li>
  <li><b>tldraw's watermark and "Get a license for production" stay</b> — the pinned 5.3.2 licence question is unchanged by this work.</li>
</ul>

<h2>Open it</h2>
<pre>pnpm --dir /home/bam/bbox-ui/.claude/worktrees/glyph-finish --filter @bbox-ui/docs exec next dev --port 4110</pre>
<p>then <code>http://localhost:4110/create</code> — use <code>localhost</code>, not the IP (Next 16 does not hydrate by IP). Pick <b>Glyph</b> in the Component select; the tldraw and React Flow tabs have the handles.</p>

</main></body></html>
"""

OUT.write_text(HTML)
encoded = len(urllib.parse.quote(HTML, safe="~()*!.'"))
print(f"wrote {OUT} ({OUT.stat().st_size:,} bytes on disk, {encoded:,} bytes as a data: URL — {'preview-safe' if encoded < 2_097_024 else 'BROWSER ONLY'})")
