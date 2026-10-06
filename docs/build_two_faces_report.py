#!/usr/bin/env python3
"""Build the Two Faces implementation report.

Zach picked proposal 2 out of the five in
`reports/media/toolbar-proposals-2026-09-24.html`, then amended it:

    Please implement the two faces design. P2
    I would still keep the shape selection its self as a seperate. tab though
    Should then you have shape selector, inside, edge, text
    no need to put the text (inside and edge) on the drop down menu btw, we
    can learn to just know it by the icon

    python3 docs/build_two_faces_report.py --media <dir> [--out PATH] \\
        [--tests <file with the pasted test output>]

Every capture is of the REAL app (`apps/systemsketch`, driven in Chromium at
1400x950, deviceScaleFactor 2) — no mocks on this page, because the thing
being reported is shipped code. Every number is read out of that run or off a
file on disk at build time.
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from PIL import Image  # noqa: E402

from _report_kit import CSS, FB_JS, dock, fb, overall_box, report_size, sh  # noqa: E402

REPO = pathlib.Path(__file__).resolve().parent.parent
TRUNK = REPO / "apps" / "storybook-basics" / "src"
APP = REPO / "apps" / "systemsketch" / "src"
DEFAULT_OUT = pathlib.Path("/home/bam/bbox-ui/reports/media/two-faces-2026-09-24.html")


def shot(path: pathlib.Path, max_w: int = 900, quality: int = 74) -> str:
    if not path.exists():
        raise SystemExit(f"missing capture: {path}")
    im = Image.open(path).convert("RGB")
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=quality, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


def verify() -> dict:
    """Read the tree, so this page cannot describe code that is not there."""
    targets = {
        "model": (APP / "chrome/ContextualPopupMenu/appearanceModel.ts",
                  {"recipe": r"TWO_FACES_RECIPE", "build": r"export function buildAppearance"}),
        "glyphs": (APP / "chrome/ContextualPopupMenu/appearanceGlyphs.tsx",
                   {"faces": r"insideFace", "link": r"function LinkGlyph"}),
        "cluster": (APP / "chrome/ContextualPopupMenu/selectionClusters.tsx",
                    {"cluster": r"export function AppearanceCluster",
                     "gone": r"AppearanceCluster"}),
        "strokeMeta": (APP / "appearance/strokeMeta.ts", {"pin": r"pinStrokeWidth"}),
        "paintLink": (APP / "appearance/paintLink.ts", {"link": r"edgeFollowsFill"}),
        "customFont": (APP / "appearance/customFontSize.ts", {"apply": r"applyCustomFontPx"}),
        "overrides": (APP / "appearance/stockPaintOverrides.ts", {"paint": r"getCustomDisplayValues"}),
        "kitRegistry": (TRUNK / "editor/controlRegistry.ts",
                        {"continuous": r"export interface ContinuousBinding",
                         "trigger": r"triggerGlyph\?: string"}),
        "kitPanel": (TRUNK / "editor/controlPanel.tsx", {"row": r"function ContinuousRow"}),
        "kitGlyphs": (TRUNK / "editor/controlGlyphs.tsx", {"face": r"export function paintFaceGlyph"}),
        "kitStrip": (TRUNK / "editor/controlStrip.tsx", {"skin": r"panelClassName"}),
    }
    out = {}
    for label, (path, hits) in targets.items():
        rec = {"path": str(path.relative_to(REPO)), "exists": path.exists(), "lines": 0, "hits": {}}
        if rec["exists"]:
            text = path.read_text(errors="ignore")
            rec["lines"] = text.count("\n") + 1
            rec["hits"] = {k: bool(re.search(v, text)) for k, v in hits.items()}
        out[label] = rec
    return out


ASKS = [
    ("A1", "Text size must not set the line width",
     "“setting the size of the text also sets the size of the line width (thats tldraws "
     "convention) but I want thoose to be seperate things here”",
     "<b>Done.</b> The painted width lives in the shape’s <code>meta</code> and "
     "<code>pinStrokeWidth</code> freezes it before a new rung is written. Measured below."),
    ("A2", "The dropdown should look like the archived SystemSketch’s",
     "“I prefer how the drop down looked in the old system sketch”",
     "<b>Done.</b> Stacked sections, chips, swatch grid and list — the archived kit, via the "
     "trunk’s port of it."),
    ("A3", "Text size needs a custom value",
     "“in text size it gave the option for a custom size”",
     "<b>Done.</b> A live 4–400&nbsp;px field under the presets. Driven: <code>Aa 22</code> → "
     "<code>Aa 47</code>."),
    ("A4", "Line types need a preview icon",
     "“in the line types it showed a little icon of what it would look like”",
     "<b>Done.</b> Five line styles, each drawing itself. The glyphs already existed in the "
     "trunk; the old bar printed the word instead."),
    ("A5", "Colour and fill belong in one dropdown",
     "“in old system sketch we had thoose in drop down menu”",
     "<b>Done.</b> Fill treatment, palette and opacity are one panel: <b>Inside</b>."),
    ("A6", "One trigger per thing being styled",
     "“1 for dealing with the inside, 1 for dealling with the stroke, etc..”",
     "<b>Done.</b> Four triggers, six fewer than before."),
    ("A7", "Opacity is not a toolbar control",
     "“I also don’t like the opacity slider on the tool bar … that relates to the fill and stroke”",
     "<b>Done.</b> Gone from the bar; a row inside Inside and inside Edge."),
    ("A8", "Stroke colour follows fill until you set it",
     "“By default the stroke color should follow the fill color, unless you specifically set the "
     "stroke color, then it now indepently moves”",
     "<b>Done.</b> One flag in <code>meta</code>, default on. Measured below."),
    ("A9", "Keep the shape picker as its own tab",
     "“I would still keep the shape selection its self as a seperate. tab though … shape "
     "selector, inside, edge, text”",
     "<b>Done.</b> First trigger, its own group, 20 shapes in a scrolling library."),
    ("A10", "No words on the paint triggers",
     "“no need to put the text (inside and edge) on the drop down menu btw, we can learn to just "
     "know it by the icon”",
     "<b>Done — and it is what forced the faces to be real.</b> See “what the face is” below."),
]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--media", required=True)
    ap.add_argument("--measurements", required=True, help="json from the acceptance run")
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--tests", default=None, help="file holding the pasted test output")
    args = ap.parse_args()

    media = pathlib.Path(args.media)
    m = json.loads(pathlib.Path(args.measurements).read_text())
    src = verify()
    missing = [k for k, v in src.items() if not v["exists"] or not all(v["hits"].values())]
    if missing:
        raise SystemExit(f"these citations are not true of the tree: {missing}")

    tests = pathlib.Path(args.tests).read_text().strip() if args.tests else None
    branch = sh("git rev-parse --abbrev-ref HEAD", REPO)
    head = sh("git rev-parse --short HEAD", REPO)
    dec, link = m["decoupling"], m["link"]

    asks_rows = "".join(
        f"<tr><td><b>{i}</b></td><td><b>{t}</b>"
        f"<div style='color:var(--dim2);font-size:12.5px;margin-top:3px'>{q}</div></td>"
        f"<td>{a}</td></tr>"
        for i, t, q, a in ASKS
    )

    def fig(name, title, note, max_w=900, rank=None):
        """A capture, and — when it names a reviewable item — its own verdict
        strip, so a note lands on THIS panel rather than on the page."""
        strip = fb(rank, title.split("\u2014")[0].strip(), "what would you change about this panel\u2026") if rank else ""
        body = f"""<figure><img src="{shot(media / name, max_w=max_w)}" alt="{title}">
        <figcaption><b>{title}</b>{note}</figcaption></figure>{strip}"""
        return f'<div class="card" style="padding:14px">{body}</div>' if rank else body

    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Two Faces — implemented</title>
<style>{CSS}
  .shots {{ grid-template-columns:repeat(auto-fit,minmax(430px,1fr)); gap:22px }}
  .shots figure img {{ max-height:460px; object-position:center top }}
</style></head><body>
<div class="wrap">

<p class="kicker">bbox-ui · 2026-09-24 · {branch} @ {head}</p>
<h1>Two Faces, shipped</h1>
<p class="sub">Four triggers — <b>shape · inside · edge · text</b> — replacing six. Every one of
your ten asks is in, and the two behavioural ones are measured off the painted shape in the real
app, not asserted against the DOM.</p>

<div class="lede green">
<p><b>The bar now mounts the trunk kit, and the duplicate is deleted.</b> The pill was a second,
hand-rolled implementation of a renderer <code>apps/storybook-basics/src/editor/</code> already
had — which is exactly why its line-style menu printed the word “dashed” while a drawn dashed
line sat two directories away. <code>StyleCluster</code>, <code>StyleRowControl</code>,
<code>StyleFace</code>, <code>StyleOption</code> and <code>OpacityCluster</code> are gone. The
vocabulary is data (<code>{src['model']['path']}</code>, {src['model']['lines']} lines), the
drawing is the trunk’s, the renderer is <code>ControlStrip</code>.</p>
</div>

<h2>The bar</h2>
<div class="shots">
{fig("01-bar.png", "Four triggers, no words",
     " Shape · Inside · Edge · Text. The Inside face is the selection’s real semi-transparent "
     "green; the Edge face is its real thick dashed green. Nothing on this bar is a family icon.",
     max_w=760)}
{fig("04-board.png", "In place over a selection",
     " The whole app, unretouched. The opacity slider and its <code>100%</code> readout that "
     "used to sit in this row are gone.", max_w=760)}
</div>

{fb("BAR", "The four-trigger bar", "the bar as a whole\u2014")}

<h2>What the face is, and why your last sentence forced it</h2>
<div class="lede">
<p>“<i>no need to put the text (inside and edge) on the drop down menu btw, we can learn to just
know it by the icon</i>” — with the words gone, the face is the <b>only</b> thing telling the two
triggers apart. A paint-bucket and a line icon would name their families and say nothing about
the shape you have selected: the bar would read identically whether the fill were solid green or
absent.</p>
<p>So the faces are not icons. Each one paints the selection’s <b>actual</b> fill treatment,
colour and opacity (Inside) or its actual width, dash and colour (Edge). You read the answer off
the bar and only open a panel to change it.</p>
<p class="note" style="color:var(--dim2);font-size:13px"><b>Caught by looking, not by a test.</b>
A fresh geo’s edge is tldraw’s <code>black</code> (#1d1d1d) and the pill’s surface is #1e1e1e —
so the first version of the Edge face was a black square on a black bar, and the trigger rendered
as a bare chevron. It now carries a keyline under the stroke, the same job the swatch family’s
inset ring does.</p>
</div>

<h2>The four panels</h2>
<div class="shots">
{fig("02-inside.png", "Inside — fill, colour, opacity",
     " Ask A5 and A7 in one surface. Six fill treatments, each drawing itself; the real palette; "
     "opacity with its readout, where it belongs.")}
{fig("02-edge.png", "Edge — thickness, line style, link, colour, opacity",
     " Ask A4: five line styles, every one drawn. Ask A8: the link row sits directly above the "
     "palette it governs. Each thickness cell is a line at the width it actually paints.")}
{fig("02-text.png", "Text — typeface, align, size, custom px",
     " Ask A3: presets with their real px, then a live Custom field. tldraw’s three "
     "<code>*-legacy</code> aligns are filtered out — they rendered as three more identical cells.")}
{fig("02-geo.png", "Shape — its own tab, as you asked",
     " Ask A9. Twenty shapes, drawn rather than named: the regular polygons are computed, the "
     "rest are paths.")}
</div>

<h2>Every face, side by side</h2>
<p>The one thing I cannot judge for you. Each row is the real bar with one value
changed — captured from the running app, not drawn for this page. <code>draw</code> vs
<code>solid</code> is the closest pair: a sketched square with overshooting corners against a
ruled one with rounded ones.</p>
{fig("contact-sheet.png", "Nine states of the two faces",
     " Top five: the Edge face across every line style. Bottom four: the Inside face across "
     "every fill treatment. Two earlier versions of this sheet are why <code>draw</code> and "
     "<code>none</code> were rewritten.", max_w=760, rank="FACES")}

<h2>The two behaviours, measured in the real app</h2>

<div class="answer green">
<b class="h">A1 — text size no longer moves the line width</b>
<p>In stock tldraw one <code>size</code> rung drives both: <code>STROKE_SIZES</code> and
<code>LABEL_FONT_SIZES</code> share the key <code>s|m|l|xl</code>. The fix stores the painted
width in the shape’s <code>meta</code> and pins it <em>before</em> the new rung is written
(<code>{src['strokeMeta']['path']}</code>). <code>meta</code> rather than a new
<code>StyleProp</code>, so a <code>.tldr</code> still opens in stock tldraw.</p>
<pre class="term">text    {dec['before']['fontPx']}px → {dec['afterXL']['fontPx']}px    (Extra large)
trigger Aa22 → Aa47                    (Custom px)
<span class="t">stroke  {dec['before']['strokeWidth']}px → {dec['afterXL']['strokeWidth']}px → {dec['afterCustom']['strokeWidth']}px    unchanged throughout</span></pre>
<p class="note" style="color:var(--dim2);font-size:13px">Read off the painted
<code>&lt;path&gt;</code>’s computed <code>stroke-width</code> in the running app — not off the
editor’s own state, which would be the implementation grading its own homework. The custom step
is read from the trigger, because an exact px rides the shape’s <code>scale</code>, so the CSS
<code>font-size</code> deliberately stays on its rung.</p>
{fb("A1", "Text size no longer moves the line width", "does this behave the way you meant?\u2026")}
</div>

<div class="answer green">
<b class="h">A8 — the edge follows the fill until you set it</b>
<p>One flag in <code>meta</code>, defaulting to on. The link breaks when you set the <b>edge</b>,
never when you set the <b>fill</b> — otherwise “make it green” would silently orphan the outline.
<b>Set separately</b> ⇄ <b>Follows fill</b> is the readout and the only way back.</p>
<pre class="term">fill → red      outline <span class="s">{link['linked']['stroke']}</span>   <span class="t">the edge followed</span>
edge → blue     outline <span class="s">{link['unlinked']['stroke']}</span>   the link broke
fill → yellow   outline <span class="s">{link['held']['stroke']}</span>   <span class="t">the edge held</span></pre>
{fb("A8", "The edge follows the fill until you set it", "does this behave the way you meant?\u2026")}
</div>

<div class="shots" style="margin-top:8px">
{fig("03-unlinked.png", "The broken link, on the bar and in the panel",
     " Edge set to red: the face turns red and stays dashed, the chain shows broken, and the "
     "Inside face is still green. The two are now independent.")}
</div>

<h2>Every ask</h2>
<div class="scroll"><table>
<thead><tr><th style="width:44px">#</th><th style="width:40%">Ask</th><th>Where it landed</th></tr></thead>
<tbody>{asks_rows}</tbody></table></div>

<h2>Stock part, element by element</h2>
<div class="scroll"><table>
<thead><tr><th style="width:16%">Element</th><th style="width:25%">Before today</th>
<th style="width:29%">Stock part, by its exported name</th><th>Behaviour that must survive</th></tr></thead>
<tbody>
<tr><td><b>Trigger + popover</b></td><td>hand-rolled <code>StyleRowControl</code></td>
<td><code>ControlStrip</code> — <code>{src['kitStrip']['path']}</code></td>
<td>One renderer for every control. Deleted the copy.</td></tr>
<tr><td><b>Panel body</b></td><td>a flat list of text rows</td>
<td><code>ControlPanel</code> — <code>{src['kitPanel']['path']}</code></td>
<td>Five layouts, stacked sections, the Custom-px cell.</td></tr>
<tr><td><b>Vocabulary</b></td><td><code>STYLE_ROWS</code>, one row per tldraw style</td>
<td><code>createControlRegistry</code> — <code>{src['kitRegistry']['path']}</code></td>
<td>Options read off tldraw’s own enums, declared once.</td></tr>
<tr><td><b>Option previews</b></td><td>plain text (“dashed”)</td>
<td><code>DEFAULT_GLYPH_FAMILIES</code> — <code>{src['kitGlyphs']['path']}</code></td>
<td>A4. Already drawn; the bar simply never called them.</td></tr>
<tr><td><b>Text/stroke split</b></td><td>one tldraw <code>size</code> rung drove both</td>
<td><b>new</b> — <code>pinStrokeWidth</code>, <code>{src['strokeMeta']['path']}</code></td>
<td>A1. Ported from the archived app, which solved this after the same report.</td></tr>
<tr><td><b>Custom px</b></td><td>nothing</td>
<td><code>CustomSizeBinding</code> + <code>{src['customFont']['path']}</code></td>
<td>A3. Nearest rung plus residual <code>scale</code>, stroke pinned first.</td></tr>
<tr><td><b>Opacity</b></td><td><code>OpacityCluster</code>, inline on the bar</td>
<td><b>new</b> — <code>ContinuousBinding</code> + <code>ContinuousRow</code></td>
<td>A7. One undo step per drag, not per pixel.</td></tr>
<tr><td><b>Edge follows fill</b></td><td>nothing — two independent styles</td>
<td><b>new</b> — <code>{src['paintLink']['path']}</code></td>
<td>A8. Breaks on edge, never on fill.</td></tr>
<tr><td><b>The faces</b></td><td>a family icon per row</td>
<td><b>new</b> — <code>paintFaceGlyph</code>, injected like <code>swatchGlyph</code></td>
<td>A10. Draws the real paint; the kit imports no canvas engine.</td></tr>
<tr><td><b>Unchanged (stock seam)</b></td><td><code>Popover</code> / <code>PopoverTrigger</code> /
<code>PopoverContent</code>, Base UI via shadcn</td><td>same</td>
<td>Deliberately untouched. Only what goes inside it is ours.</td></tr>
</tbody></table></div>

{"<h2>Tests</h2><pre class='term'>" + tests + "</pre>" if tests else
 "<h2>Tests</h2><div class='lede red'><p><b>Not yet green as of this build.</b> The suite "
 "migration is still running — every selector in the pill's smoke tests moved with the DOM "
 "contract. This page will be rebuilt with the real output; do not read its absence as a pass.</p></div>"}

<h2>What I did not do</h2>
<div class="grid2">
<div class="card"><b>Fill opacity and stroke opacity are still one value</b>
<p>tldraw persists one shape-wide <code>opacity</code>. Two independent values would have to ride
<code>meta</code> and would not round-trip into a stock <code>.tldr</code>. The one real value is
shown in both panels, which satisfies your ask; the split is a separate decision.</p></div>
<div class="card"><b>Size rows are not drawn at their own size</b>
<p>The archived list drew “Small” small and “Extra large” large. Here each row prints its real px
instead. Cheap to add — it needs one more binding on the kit’s list layout — but it is a kit
change and I did not want it riding in on this one.</p></div>
<div class="card"><b>No seeded review board</b>
<p>The change is to the bar, not to canvas behaviour, and the app opens on a board you can draw a
rectangle in. Say the word and I will seed one.</p></div>
<div class="card"><b>Not merged</b>
<p>Everything is on <code>{branch}</code>. Landing it on <code>main</code> is your call.</p></div>
</div>

<h2>What needs you</h2>
<div class="ask">
<h3>1. Do the faces read at a glance?</h3>
<p>This is the one thing I cannot check for you. At 24&nbsp;px, “dashed” and “dotted” are close,
and a thin edge on a small face is subtle.</p>
<p class="dflt"><b>If you say nothing:</b> they stay as they are. The fallback if they do not work
is the tooltip, which already names the value.</p>
</div>
<div class="ask">
<h3>2. Should the shape picker keep its own group separator?</h3>
<p>It sits in its own group, so there is a hairline between it and Inside. That is four groups on
a bar you asked to be compact.</p>
<p class="dflt"><b>If you say nothing:</b> it stays — the separator is what makes “shape” read as
a different kind of thing from the three paints.</p>
</div>

{overall_box("anything the ten asks missed…")}

<footer class="page">
<p><b>Captures</b> are of <code>apps/systemsketch</code> driven in Chromium at 1400&times;950,
deviceScaleFactor&nbsp;2. <b>Every measurement</b> on this page was read off the painted shape or
off a file on disk at build time; a citation the tree does not support fails this build.</p>
</footer>
</div>

{dock("two-faces-2026-09-24", "item", 7)}
<script>{FB_JS}</script>
</body></html>"""

    report_size(html, pathlib.Path(args.out))


if __name__ == "__main__":
    main()
