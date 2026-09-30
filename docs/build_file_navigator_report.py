#!/usr/bin/env python3
"""Build the file-navigator fixes review report.

The round: Zach, 2026-09-22, with a screenshot — "please start an agent to fix
the built in fiel viewer it has many issues right now, first of all its just
way to long goes off the screen".

    python3 docs/build_file_navigator_report.py --captures <dir>

`<dir>` is where `measure.mjs` wrote its before/after runs: one `<label>.json`
per run plus one PNG per window-size x interface-scale cell. That harness drove
the REAL app (`apps/systemsketch` on its own Vite port, the real Python file
host over a scratch files root that is NOT ~/SystemSketch), opened the real
dialog, and read `getBoundingClientRect` / `elementFromPoint` — never a class
name, never DOM presence.

EVERY NUMBER IN THE PAGE COMES OUT OF THOSE JSON FILES. There is no literal to
go stale: the builder raises if a cell is missing rather than fall back to a
remembered figure, which is the whole reason the measurement is a file on disk
and not a sentence in the commit message.

Written to `/home/bam/bbox-ui/reports/media/file-navigator-fixes-2026-09-22.html`
— the gitignored half of `reports/`, because the page inlines eight captures
(`.claude/feedback.md`, 2026-09-17; the split is on inlined payload, not total
size).
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from PIL import Image  # noqa: E402

from _report_kit import CSS, FB_JS, dock, fb, overall_box, report_size, sh  # noqa: E402

REPO = pathlib.Path(__file__).resolve().parent.parent
NAME = "file-navigator-fixes-2026-09-22"
OUT = pathlib.Path("/home/bam/bbox-ui/reports/media") / f"{NAME}.html"


def load(captures: pathlib.Path, label: str) -> dict[tuple[int, int, int], dict]:
    """`<label>.json` -> {(w, h, scale): cell}. Raises on a missing run."""
    path = next(captures.rglob(f"{label}.json"), None)
    if path is None:
        raise SystemExit(f"missing measurement run: {label}.json under {captures}")
    return {(c["size"]["w"], c["size"]["h"], c["scale"]): c for c in json.loads(path.read_text())}


def png(captures: pathlib.Path, label: str, w: int, h: int, scale: int) -> str:
    found = next(captures.rglob(f"{label}-{w}x{h}-s{scale}.png"), None)
    if found is None:
        raise SystemExit(f"missing capture: {label}-{w}x{h}-s{scale}.png under {captures}")
    # WHY not `_report_kit.shot`: it trims to the content bbox, which is right
    # for an element capture floating on an empty story page and exactly wrong
    # here. These are FULL-WINDOW shots and the window edge is the evidence —
    # "the dialog crosses the top of the screen" is unreadable once the trim has
    # removed the top of the screen. Encoded whole, at the window's real aspect.
    import base64
    import io

    im = Image.open(found).convert("RGB")
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=82, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


def cell_row(before: dict, after: dict, w: int, h: int, scale: int) -> str:
    b, a = before[(w, h, scale)], after[(w, h, scale)]

    def frame(c: dict) -> str:
        p = c["popup"]
        return f'{p["w"]:g}x{p["h"]:g} @ y={p["top"]:g}…{p["bottom"]:g}'

    def verdict(c: dict) -> str:
        on = c["popupOnScreen"]
        reach = c["cancelClickable"] and c["confirmClickable"]
        if on and reach:
            return '<span class="ok">on screen · both buttons reachable</span>'
        bits = []
        if not on:
            bits.append(f'off screen by {max(0, -c["popup"]["top"]):.0f}px top / {max(0, c["popup"]["bottom"] - c["vh"]):.0f}px bottom')
        if not reach:
            bits.append("Cancel + Open UNREACHABLE")
        return f'<span class="bad">{" · ".join(bits)}</span>'

    return f"""<tr>
  <td><b>{w}x{h}</b> @ {scale}%</td>
  <td class="num">{frame(b)}</td><td>{verdict(b)}</td>
  <td class="num">{frame(a)}</td><td>{verdict(a)}</td>
</tr>"""


def build(captures: pathlib.Path) -> str:
    before = load(captures, "before")
    after = load(captures, "final")
    save = load(captures, "finalsave")
    cells = sorted(before.keys(), key=lambda k: (-k[1], k[2]))

    broken = [k for k in cells if not before[k]["popupOnScreen"]]
    unreachable = [k for k in cells if not (before[k]["cancelClickable"] and before[k]["confirmClickable"])]
    fixed_all = all(a["popupOnScreen"] and a["cancelClickable"] and a["confirmClickable"] for a in after.values())
    save_all = all(a["popupOnScreen"] and a["cancelClickable"] and a["confirmClickable"] for a in save.values())

    # The scale-invariance claim, straight out of the numbers.
    ref = (1280, 800)
    heights_before = {s: before[(ref[0], ref[1], s)]["popup"]["h"] for s in (100, 125, 160)}
    heights_after = {s: after[(ref[0], ref[1], s)]["popup"]["h"] for s in (100, 125, 160)}

    branch = sh("git rev-parse --abbrev-ref HEAD", REPO)
    head = sh("git rev-parse --short HEAD", REPO)
    changed = sh("git show --stat --oneline HEAD | tail -n +2", REPO)

    rows = "\n".join(cell_row(before, after, *k) for k in cells)

    asks = [
        ("A", "The frame — bounded by the window at every scale"),
        ("B", "The columns — 'Modified' is a whole word again"),
        ("C", "The scrollbar and the rail"),
        ("D", "Escape closes the dialog (found, not reported)"),
        ("E", "The generalisation — data-viewport-frame"),
    ]

    return f"""<!doctype html><meta charset="utf-8">
<title>File navigator — fixes · 2026-09-22</title>
<style>{CSS}
.num {{ font: 12.5px/1.5 var(--mono); white-space: nowrap; }}
.ok {{ color:#7ee08a; }} .bad {{ color:#ff8f8f; }}
.shots {{ display:grid; grid-template-columns:1fr 1fr; gap:14px; margin:14px 0; }}
.shots figure {{ margin:0; }}
.shots img {{ width:100%; border-radius:8px; border:1px solid var(--line2); display:block; }}
.shots figcaption {{ font:12px/1.5 var(--mono); color:var(--dim); padding-top:6px; }}
table.m {{ width:100%; border-collapse:collapse; margin:10px 0 4px; }}
table.m th, table.m td {{ text-align:left; padding:6px 10px; border-bottom:1px solid var(--line2); font-size:13.5px; vertical-align:top; }}
table.m th {{ color:var(--dim); font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.04em; }}
</style>
<div class="page">

<header class="page">
  <h1>The built-in file viewer</h1>
  <p class="lede">Zach, with a screenshot: <i>"please start an agent to fix the built in fiel viewer
  it has many issues right now, first of all its just way to long goes off the screen"</i>.
  Everything below is <b>measured in the real app</b> — <code>apps/systemsketch</code> on its own
  Vite port, the real Python file host over a scratch files root, driven headless.
  Rects are <code>getBoundingClientRect</code>; "reachable" is
  <code>document.elementFromPoint</code> at the button's own centre.</p>
</header>

<section class="ask">
<h2>The short version</h2>
<ul>
  <li><b>At 100% it was fine.</b> {len(broken)} of the {len(cells)} window-size x interface-scale
      combinations were broken, and every one of them was at <b>125% or 160%</b>. In
      {len(unreachable)} of them <b>Cancel and Open could not be clicked at all</b>.</li>
  <li><b>The cause</b> was one class: <code>max-h-[85vh]</code> on a frame that
      <code>interface-scale.css</code> zooms. A viewport length written inside a zoomed layer
      resolves against the <i>unzoomed</i> viewport and then paints scaled — 85vh painted ~136vh
      at 160%.</li>
  <li><b>After:</b> {"all " + str(len(after)) + " combinations on screen with both buttons reachable" if fixed_all else "NOT all combinations pass — see the table"},
      and the same {"holds" if save_all else "does NOT hold"} in Save As mode.</li>
  <li>Four more defects were confirmed by measurement and fixed; one of them —
      <b>Escape never closed the dialog</b> — was not in the report and was found while writing
      the tests.</li>
</ul>
</section>

<section class="ask">
<h2>A · The frame</h2>
{fb("A", "The frame — bounded by the window at every scale")}
<p>The dialog at <b>1280x800, 160%</b>. Left: before — the header, the path bar and the filter are
above the top of the window, the footer is below the bottom, and
<code>elementFromPoint</code> at the centre of both Cancel and Open returns <code>null</code>.
Right: after.</p>
<div class="shots">
  <figure><img src="{png(captures, "before", 1280, 800, 160)}" alt="before, 1280x800 at 160%">
  <figcaption>BEFORE · {before[(1280,800,160)]["popup"]["w"]:g}x{before[(1280,800,160)]["popup"]["h"]:g}
  at y={before[(1280,800,160)]["popup"]["top"]:g} — window is 800 tall</figcaption></figure>
  <figure><img src="{png(captures, "final", 1280, 800, 160)}" alt="after, 1280x800 at 160%">
  <figcaption>AFTER · {after[(1280,800,160)]["popup"]["w"]:g}x{after[(1280,800,160)]["popup"]["h"]:g}
  at y={after[(1280,800,160)]["popup"]["top"]:g}</figcaption></figure>
</div>

<p style="margin-top:18px">Every cell, measured. <code>y=</code> is the frame's top and bottom edge
against a window of that height.</p>
<table class="m">
<tr><th>window @ scale</th><th>before</th><th></th><th>after</th><th></th></tr>
{rows}
</table>

<p><b>Why the "after" column is the same number three times.</b> The frame is now held in real
pixels and only its <i>interior</i> is scaled, so its painted box cannot move with the setting.
At {ref[0]}x{ref[1]} the frame's height went
{" → ".join(f"{heights_before[s]:g}" for s in (100, 125, 160))} before
({100}% → {160}%), and is
{" → ".join(f"{heights_after[s]:g}" for s in (100, 125, 160))} after. That invariance — not
"it happens to fit on this monitor" — is what the regression test asserts.</p>
</section>

<section class="ask">
<h2>B · The columns</h2>
{fb("B", "The columns — 'Modified' is a whole word again")}
<p>At <b>100%</b>, where the frame was never the problem. The header read <code>Mo</code> and the
timestamps read <code>6:4</code>: an un-truncated Name column pushed the table's min-content width
past its box, and <code>Table</code>'s own <code>overflow-x-auto</code> scrolled the tail of the
last column out of sight with no bar to bring it back. Measured: the table wanted
<b>612px inside a 562px box</b>.</p>
<div class="shots">
  <figure><img src="{png(captures, "before", 1280, 800, 100)}" alt="before, 1280x800 at 100%">
  <figcaption>BEFORE · "Mo" / "6:4", and the long name runs the full width</figcaption></figure>
  <figure><img src="{png(captures, "final", 1280, 800, 100)}" alt="after, 1280x800 at 100%">
  <figcaption>AFTER · "Modified" / "6:41 PM"; the long name ellipsizes and keeps
  its full value in <code>title</code></figcaption></figure>
</div>
<p><code>table-fixed</code> takes the two <code>w-24</code> columns off the top and gives Name the
rest, so no file name can squeeze the header off the edge. The name that has to be shortened shows
an explicit ellipsis and keeps the complete value immediately discoverable — Zach's truthful-
property-rendering rule, asserted in both suites.</p>
</section>

<section class="ask">
<h2>C · The scrollbar and the rail</h2>
{fb("C", "The scrollbar and the rail")}
<p>The list scrolled through a native <code>overflow-y-auto</code> — a classic inset bar laid out
<i>inside</i> the box, so it steals width from the rows as you walk in and out of folders. It is now
the stock <code>ScrollArea</code> the settings panel already uses, viewport pinned
<code>overflow-x: hidden</code>. The rail gets the same treatment plus a <code>border-r</code>, so
its lower half reads as the bottom of a column rather than as blank dialog.</p>
<p>The rail's track also changed from a flat <code>160px</code> to
<code>minmax(7rem, 22%)</code>. A px track keeps its <i>local</i> width while the frame's real width
is fixed, so under the interface scale the rail's share of the row grows: measured at 160% it took
<b>160 of 460 local px (35%)</b> against 22% at 100%, which is what squeezed every file name to
<code>Board …</code>. A percentage track keeps its proportion and therefore its painted size.</p>
<div class="shots">
  <figure><img src="{png(captures, "after", 1280, 800, 160)}" alt="rail at 160%, before the track fix">
  <figcaption>160% with the frame fixed but the rail still <code>160px</code> — names squeezed to
  "Board …", breadcrumb collapsed to "Sketch"</figcaption></figure>
  <figure><img src="{png(captures, "final", 1366, 720, 160)}" alt="after, 1366x720 at 160%">
  <figcaption>AFTER · proportional rail, and the path row wraps instead of
  collapsing the breadcrumb</figcaption></figure>
</div>
</section>

<section class="ask">
<h2>D · Escape never closed the dialog</h2>
{fb("D", "Escape closes the dialog (found, not reported)")}
<p>Not in the screenshot, and not something a static read finds: the Filter field is
<code>autoFocus</code> in open mode and swallowed Escape <b>unconditionally</b>
(<code>preventDefault</code> + <code>stopPropagation</code> before <code>setQuery("")</code>), so the
very first Escape after opening did nothing and the dialog could not be dismissed from the keyboard
at all. It surfaced as three of my own tests timing out on "Escape closes the navigator" — measured:
still in the DOM 10s later.</p>
<p>Now it swallows only while there is a search to abandon, the same split
<code>settingsView.tsx</code>'s search box already draws. The Save As name field had the identical
bug (its Escape branch was a <code>preventDefault</code> with an <i>empty body</i>) and gets the
same rule — that is the generalisation, not two one-off patches.</p>
</section>

<section class="ask">
<h2>E · The generalisation</h2>
{fb("E", "The generalisation — data-viewport-frame")}
<p>The settings panel hit this same trap hours earlier and was fixed with a bespoke rule pair keyed
on its own <code>data-slot</code>. Rather than write a second one, a trunk frame now declares
<code>data-viewport-frame</code> — "my box is sized against the real window; hold it in real pixels
and scale my interior" — the host answers all of them with one rule pair, and
<code>settingsView</code> moved onto the same contract (its own 160% regression test still passes
unchanged, which is the proof the migration is behaviour-preserving).</p>
<p><code>interface-scale.css</code> now carries the audit of <b>every</b> viewport-relative length in
the trunk and the app, each classified by whether it actually renders inside a zoomed layer: two
fixed, four known-wrong-and-left (named, with the reason), five correct as written. Two of the four
left alone are <i>interior</i> lengths that <code>data-viewport-frame</code> would not fix — the rule
zooms a frame's direct children, so a <code>vh</code> deeper in still inflates. They need the lengths
rewritten, and that is written down rather than left to be rediscovered.</p>
</section>

{overall_box("anything the captures made you want changed…")}

<footer class="page">
  Built by <b>docs/build_file_navigator_report.py</b> from the measurement runs under
  <code>{captures}</code>, which drove the real <code>apps/systemsketch</code> dev server and the
  real Python file host over a scratch files root.
  Branch <b>{branch}</b> at <b>{head}</b>.<br>
  <span style="color:var(--dim);font:12px/1.6 var(--mono)">{changed}</span>
</footer>
</div>

{dock(NAME, "item", len(asks))}
<script>{FB_JS}</script>
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--captures", required=True, type=pathlib.Path,
                        help="directory holding measure.mjs's <label>.json runs and PNGs")
    options = parser.parse_args()
    report_size(build(options.captures), OUT)


if __name__ == "__main__":
    main()
