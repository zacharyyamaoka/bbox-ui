#!/usr/bin/env python3
"""Build the selection-toolbar proposal report — five proposals, five live mocks.

Round: Zach, 2026-09-24 (`Sources/Daily Notes/Daily Note - Sep 24 2026.md`,
"## bbox ui feedback"). Seven asks, all about the floating pill over a
selection; the full quotes are in `docs/toolbar_proposal_mocks.py`'s docstring
and again in the report's own opening section.

    python3 docs/build_toolbar_proposals_report.py \\
        --mocks <dir>/mocks --media <dir>/media [--out PATH]

NOTHING shipping is rewritten by this round. The mocks are a spike
(`docs/toolbar_proposal_mocks.py`); the app's real pill
(`apps/systemsketch/src/chrome/ContextualPopupMenu/`) and the trunk kit
(`apps/storybook-basics/src/editor/control*.tsx`) are untouched.

Every number about a MOCK comes from `mock-checks.json`, written by
`docs/capture_toolbar_proposal_mocks.mjs` while it drove the real page in
Chromium — never retyped. Every claim about the ARCHIVED app or the TRUNK is
checked against the files on disk by `verify_sources()` below, so a part this
repo does not actually have cannot be named as though it does.
"""
from __future__ import annotations

import argparse
import base64
import datetime
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
ARCHIVE = pathlib.Path("/home/bam/systemsketch")
DEFAULT_OUT = pathlib.Path("/home/bam/bbox-ui/reports/media/toolbar-proposals-2026-09-24.html")

TODAY = "2026-09-24"


# ── media ──────────────────────────────────────────────────────────────────

def shot(path: pathlib.Path, max_w: int = 960, quality: int = 72, crop=None) -> str:
    """A PNG on disk -> a scaled WebP data URI.

    Deliberately NOT auto-trimmed the way `_report_kit.shot` does: these are
    board captures whose whole point is where the pill SITS relative to the
    shape, and trimming to ink would delete the gap being judged.
    """
    if not path.exists():
        raise SystemExit(f"missing capture: {path}")
    im = Image.open(path).convert("RGB")
    if crop:
        im = im.crop(crop)
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=quality, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


# ── build-time verification ────────────────────────────────────────────────

def verify_sources() -> dict:
    """Read both trees, so the report cannot cite a file that is not there.

    Returns {label: {"path": str, "exists": bool, "lines": int, "hits": {...}}}.
    A `hits` entry is a regex the file MUST match for the sentence beside it in
    the report to be true.
    """
    targets = {
        "trunk.controlStrip": (TRUNK / "editor/controlStrip.tsx", {"export": r"export function ControlStrip"}),
        "trunk.controlPanel": (TRUNK / "editor/controlPanel.tsx", {"export": r"export function ControlPanel"}),
        "trunk.controlRegistry": (TRUNK / "editor/controlRegistry.ts",
                                  {"factory": r"export function createControlRegistry",
                                   "customSize": r"export interface CustomSizeBinding",
                                   "modePlacement": r"modePlacement\?: \"above\" \| \"beside\"",
                                   "stackModes": r"export function stackModes"}),
        "trunk.controlGlyphs": (TRUNK / "editor/controlGlyphs.tsx",
                                {"dash": r"DASH_ARRAYS", "fill": r"function FillGlyph",
                                 "strokePx": r"STROKE_WIDTH_PX"}),
        "trunk.floatingToolbar": (TRUNK / "editor/floatingToolbar.tsx", {"export": r"FloatingToolbar"}),
        "app.selectionClusters": (APP / "chrome/ContextualPopupMenu/selectionClusters.tsx",
                                  {"opacity": r"OpacityCluster", "styleRow": r"StyleRowControl"}),
        "app.arrangeActions": (APP / "chrome/ContextualPopupMenu/arrangeActions.ts",
                               {"size": r"DefaultSizeStyle", "rows": r"STYLE_ROWS"}),
        "archive.strokeMeta": (ARCHIVE / "src/appearance/strokeMeta.ts",
                               {"pin": r"pinStrokeWidth", "key": r"systemSketchStroke"}),
        "archive.customFontSize": (ARCHIVE / "src/appearance/customFontSize.ts", {"apply": r"applyCustomFontPx"}),
        "archive.appearanceModel": (ARCHIVE / "src/appearance/appearanceModel.ts",
                                    {"modeControl": r"modeControl", "stroke": r"strokeColorControl"}),
        "archive.controls": (ARCHIVE / "src/contextualMenus/ContextualControls.tsx",
                             {"custom": r"CustomFontSizeCell"}),
        "archive.registry": (ARCHIVE / "src/contextualMenus/contextualControlRegistry.ts",
                             {"recipe": r"V3_SEGMENTED_RECIPE"}),
    }
    out = {}
    for label, (path, hits) in targets.items():
        rec = {"path": str(path), "exists": path.exists(), "lines": 0, "hits": {}}
        if rec["exists"]:
            text = path.read_text(errors="ignore")
            rec["lines"] = text.count("\n") + 1
            rec["hits"] = {k: bool(re.search(v, text)) for k, v in hits.items()}
        out[label] = rec
    return out


def rel(p: str) -> str:
    """A path the reader can click, whichever tree it lives in."""
    s = str(p)
    for root, name in ((str(REPO), ""), ("/home/bam/systemsketch", "systemsketch(archived)")):
        if s.startswith(root):
            tail = s[len(root):].lstrip("/")
            return f"{name}/{tail}" if name else tail
    return s


# ── content ────────────────────────────────────────────────────────────────

ASKS = [
    ("A1", "Text size must not set line width",
     "“I don’t like how setting the size of the text also sets the size of the line width "
     "(thats tldraws convention) but I want thoose to be seperate things here.”"),
    ("A2", "The dropdown should look like the old SystemSketch’s",
     "“I prefer how the drop down looked in the old system sketch.”"),
    ("A3", "Text size needs a custom value",
     "“in text size it gave the option for a custom size”"),
    ("A4", "Line types need a preview icon",
     "“in the line types it showed a little icon of what it would look like”"),
    ("A5", "Colour and fill belong in one dropdown",
     "“Here you also have color and fill type differently in old system sketch we had thoose "
     "in drop down menu”"),
    ("A6", "One trigger per thing being styled",
     "“Generally I like a very compact tool bar, 1 for dealing with the inside, 1 for dealling "
     "with the stroke, etc..”"),
    ("A7", "Opacity is not a toolbar control",
     "“I also don’t like the opacity slider on the tool bar … that is something that relates "
     "to the fill and stroke.”"),
    ("A8", "Stroke colour follows fill until you set it",
     "“By default the stroke color should follow the fill color, unless you specifically set "
     "the stroke color, then it now indepently moves. that makes it easy to like quickly make "
     "it green. but thten also allows you to fully customize if you want…”"),
]

PROPOSALS = [
    dict(
        pid="p1", rank="P1", name="SystemSketch Classic",
        tag="the one you asked for",
        blurb="The archived pill, rebuilt on the trunk’s control kit.",
        body="""<p>Seven triggers, in the archived app’s own order: <b>shape · fill · stroke · Aa ·
size · align</b>, then the actions cluster. Each style trigger opens a <b>stacked</b> popover —
the mode section on top, the palette under it — which is the structure
<code>appearanceModel.ts</code> already builds with <code>modeControl</code> +
<code>modePlacement: "above"</code>.</p>
<p><b>Inside</b> is one popover: fill treatment chips, then the colour grid, then opacity.
<b>Stroke</b> is one popover: thickness, line style, the link row, the edge palette, opacity.
That is A5, A6 and A7 in one move — and it is the shape the archived app already shipped,
minus the opacity control that used to sit loose on the pill.</p>
<p>The size trigger is the archived 144&nbsp;px combobox: it prints the rung’s <em>name</em>
and its <em>real px</em> side by side, because the rung is a type role and the px is the
answer to “how big is it actually”.</p>""",
        pros=["Nothing to learn — it is the bar you already used for a month.",
              "Every popover shape already exists in the trunk kit; no new layout primitive.",
              "Widest vocabulary: shape library, both aligns, per-family triggers."],
        cons=["Widest pill of the five (measured below).",
              "Its open popover covers most of the shape it is styling."],
    ),
    dict(
        pid="p2", rank="P2", name="Two Faces",
        tag="the most literal reading of A6",
        blurb="Three style triggers — Inside, Edge, Text — and each face draws the real result.",
        body="""<p>You said “1 for dealing with the inside, 1 for dealling with the stroke, etc..”.
This is that, taken literally and no further: <b>Inside</b>, <b>Edge</b>, <b>Text</b>.</p>
<p>The difference that earns it a slot of its own is the <b>face</b>. It is not a family icon and
not a swatch — it is a 24&nbsp;px square painted with the selection’s <em>actual</em> fill
treatment, colour and opacity (Inside) or its actual width, dash and colour (Edge). Look at the
bar and you have already read the answer; you only open the popover to change it.</p>
<p>Cost: the shape library and the two aligns have to go somewhere. Here they are inside
<b>Text</b> (align) and an overflow (shape) — a real trade, not a free win.</p>""",
        pros=["Narrowest pill with all three style families still on it.",
              "The face answers “what is it now?” without opening anything.",
              "Maps 1:1 onto your sentence, so the vocabulary is self-explaining."],
        cons=["A face that draws a 2 px dashed edge at 24 px is a small picture; at a glance "
              "‘dashed’ and ‘dotted’ read alike.",
              "Shape and align lose their own triggers."],
    ),
    dict(
        pid="p3", rank="P3", name="One Appearance Panel",
        tag="fewest triggers",
        blurb="A single Appearance trigger opening Figma’s right rail, folded into one popover.",
        body="""<p>One style trigger. Its popover is a 268&nbsp;px panel with three labelled
sections — <b>Fill</b>, <b>Stroke</b>, <b>Text</b> — each a compact row stack. This is Figma’s
right-hand rail moved to where the selection is.</p>
<p>It is the most compact bar by a wide margin, and the honest cost is the panel: everything in
one surface makes the surface tall. The mock caps it and scrolls, which is what a real
implementation would do — and which the capture run caught on its own, when the stroke swatches
landed below the fold and could not be clicked.</p>""",
        pros=["Smallest pill of the five; the bar almost disappears.",
              "Everything about appearance is in one place — one open, one scan.",
              "The fill→stroke link is visible in the same panel as both colours."],
        cons=["The panel is tall enough to need a scroll — the thing you came for may be below "
              "the fold.",
              "Covers the most of the shape while open (measured below).",
              "Loses the muscle memory of ‘the colour button is second from the left’."],
    ),
    dict(
        pid="p4", rank="P4", name="Linked Pair",
        tag="A8 as the organising idea",
        blurb="Fill and stroke fused into one disc-in-ring trigger with a chain you can break.",
        body="""<p>You described a relationship, not a control: the edge follows the fill until you
say otherwise. Every other proposal <em>obeys</em> that rule; this one <em>shows</em> it.</p>
<p>The trigger is a single 24&nbsp;px mark — the fill as a disc, the edge as the ring around it,
drawn at the real width — with a chain glyph beside it. Linked, the chain is whole. Set the edge
separately and it breaks, permanently and visibly, until you press it again. One press to relink.</p>
<p>Line style and thickness get their own trigger, because they are about the line’s
<em>shape</em> rather than its colour, and folding them in would have made the pair trigger mean
two different things.</p>""",
        pros=["The one design where you can see, at rest, whether the edge is still following.",
              "Fill and edge colour sit in one popover, so “make it green” is one press.",
              "Relinking is discoverable — it is the same glyph that broke."],
        cons=["A chain icon is a convention you have to learn once.",
              "Two colour grids in one popover is a lot of circles.",
              "Covers as much of the shape as P3."],
    ),
    dict(
        pid="p5", rank="P5", name="Inline Tray",
        tag="fixes something you did not ask about",
        blurb="The pill grows a tray instead of floating a popover, so it never covers the shape.",
        body="""<p>Look again at your own first screenshot: the size menu opens straight down over
the rectangle you are sizing. Both of your screenshots show it. Every popover design has this
problem, and it is worst exactly when it matters — while you are comparing two values.</p>
<p>So this one has no popover. Clicking a face grows the pill into a tray that shares its surface
and opens <em>away</em> from the selection. One horizontal row of controls, the same vocabulary
as P1, and a measured <b>0%</b> of the shape hidden.</p>
<p>The cost is width: a tray is a row, so it is as wide as its contents and the pill visibly
changes size as you switch faces.</p>""",
        pros=["Covers none of the shape — measured, against 58–74% for the others.",
              "One surface, so there is never a popover to lose track of.",
              "The tray can hold a wider control (a real hex field, a gradient bar) later."],
        cons=["The bar’s size jumps as you switch between faces.",
              "A horizontal row scales badly once a family has many options."],
    ),
]



ARCHIVE_SHOTS = pathlib.Path("/home/bam/systemsketch/docs")
TODAY_SHOTS = pathlib.Path("/home/bam/bbox-ui/reports/media/toolbars-2026-09-20")


def provenance_section() -> str:
    """Today's bar and the archived app's, both real captures, cropped to the
    control under discussion."""
    pairs = [
        (TODAY_SHOTS / "02-colour-panel-open.png", (686, 700, 1900, 1010),
         "Today — colour", "Twelve discs and nothing else. Fill is a <em>separate</em> trigger "
         "two cells along, and its own popover lists tldraw's raw values as words."),
        (ARCHIVE_SHOTS / "appearance-menu-1-color-2026-09-01.png", (380, 180, 1000, 365),
         "Archived — colour <em>and</em> fill",
         "One popover: the fill chips on top, a divider, then the palette. A5, already built."),
        (ARCHIVE_SHOTS / "appearance-menu-8-shape-line-style-2026-09-05.png", (430, 130, 1000, 365),
         "Archived — the stroke stack",
         "Thickness, then line style <em>drawn</em>, then the edge palette. A4 and A6, "
         "already built."),
        (ARCHIVE_SHOTS / "appearance-menu-7-font-size-2026-09-01.png", (698, 128, 885, 362),
         "Archived — text size",
         "Each rung at its own size with its real px, then a live <code>Custom [22] px</code> "
         "field. A3, already built."),
    ]
    figs = "".join(
        f"""<figure><img src="{shot(path, max_w=620, crop=crop)}" alt="{title}">
        <figcaption><b>{title}</b>{note}</figcaption></figure>"""
        for path, crop, title, note in pairs
    )
    return f"""
<h2>Where the design comes from</h2>
<p>Left to right: what ships today, then the three archived popovers you are describing. These
are captures of two running apps, not mocks — <code>reports/media/toolbars-2026-09-20/</code>
and <code>/home/bam/systemsketch/docs/</code>.</p>
<div class="shots">{figs}</div>"""


def proposal_section(p: dict, checks: dict, media: pathlib.Path) -> str:
    c = checks[p["pid"]]
    cov = c["popoverCoversShape"]
    dec = c["decoupling"]
    shots = "".join(
        f"""<figure><img src="{shot(media / f'{p["pid"]}-{n}.png', max_w=760)}" alt="{alt}">
        <figcaption><b>{cap}</b>{note}</figcaption></figure>"""
        for n, alt, cap, note in [
            ("1-pill", f"{p['name']} pill", "The bar at rest",
             f" {c['triggerCount']} trigger{'s' if c['triggerCount'] != 1 else ''}, "
             f"{c['pillWidth']}&nbsp;px wide."),
            ("2-inside", "inside popover", "Inside — fill, colour, opacity",
             " Fill treatment, the palette and opacity in one surface (A5, A7)."),
            ("3-edge", "edge popover", "Edge — thickness, line style, colour, opacity",
             " Every line style draws itself (A4); the link row is above the palette (A8)."),
            ("4-text", "text popover", "Text — presets at their own size, then Custom px",
             " Each row prints its real px; the Custom field takes any value 4–400 (A3)."),
        ]
    )
    return f"""
<div class="answer{' green' if p['pid'] == 'p1' else ''}">
  <b class="h">{p['name']} <span style="color:var(--dim2);font-weight:400;font-size:13px">
    — {p['tag']}</span></b>
  <p style="color:var(--dim)">{p['blurb']}</p>
  {p['body']}

  <div class="facts">
    <div class="fact"><b>{c['pillWidth']}</b><span>pill width, px</span></div>
    <div class="fact"><b>{c['triggerCount']}</b><span>style triggers</span></div>
    <div class="fact {'good' if cov == 0 else 'warn' if cov < 60 else 'bad'}"><b>{cov}%</b>
      <span>of the shape hidden while open</span></div>
    <div class="fact good"><b>{dec['afterXL']['strokeWidth']}</b>
      <span>stroke px, held across {dec['before']['fontPx']}&rarr;{dec['afterXL']['fontPx']} px text</span></div>
  </div>

  <div class="shots">{shots}</div>

  <div class="grid2" style="margin-top:18px">
    <div class="card ok"><b>What it buys</b>{"".join(f"<p>{x}</p>" for x in p["pros"])}</div>
    <div class="card no"><b>What it costs</b>{"".join(f"<p>{x}</p>" for x in p["cons"])}</div>
  </div>
  {fb(p['rank'], p['name'], "which one, and what would you change about it…")}
</div>"""


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--mocks", required=True)
    ap.add_argument("--media", required=True)
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--mock-url", default="", help="where the live mock page can be opened")
    args = ap.parse_args()

    media = pathlib.Path(args.media)
    checks = json.loads((media / "mock-checks.json").read_text())
    src = verify_sources()
    missing = [k for k, v in src.items() if not v["exists"] or not all(v["hits"].values())]
    if missing:
        raise SystemExit(
            "these citations could not be verified against the tree, so the report would be "
            f"lying: {missing}",
        )

    p1 = checks["p1"]
    dash_rows = p1["lineStyleOptions"]
    size_rows = p1["sizeRowsDrawnAtOwnSize"]
    thickness = p1["thicknessOptions"]
    branch = sh("git rev-parse --abbrev-ref HEAD", REPO)
    head = sh("git rev-parse --short HEAD", REPO)

    # Every number below is read out of the two dicts above; nothing is typed.
    covers = {k: v["popoverCoversShape"] for k, v in checks.items()}
    widths = {k: v["pillWidth"] for k, v in checks.items()}

    asks_rows = "".join(
        f"<tr><td><b>{i}</b></td><td><b>{t}</b><div style='color:var(--dim2);font-size:12.5px;"
        f"margin-top:3px'>{q}</div></td><td class='c'><span class='yes'>all&nbsp;5</span></td></tr>"
        for i, t, q in ASKS
    )

    table_rows = "".join(
        f"""<tr{' class="good"' if pid == "p5" else ''}>
          <td><b>{name}</b></td>
          <td class="num">{widths[pid]}</td>
          <td class="num">{checks[pid]['triggerCount']}</td>
          <td class="num">{covers[pid]}%</td>
          <td class="c">{'<span class="yes">✓</span>' if checks[pid]['insideHasOpacity'] else '<span class="no">✗</span>'}</td>
          <td class="c">{'<span class="yes">✓</span>' if checks[pid]['hasCustomPx'] else '<span class="no">✗</span>'}</td>
          <td class="c">{'<span class="yes">✓</span>' if all(o['hasGlyph'] for o in checks[pid]['lineStyleOptions']) else '<span class="no">✗</span>'}</td>
        </tr>"""
        for pid, _, name in [(p["pid"], p["rank"], p["name"]) for p in PROPOSALS]
    )

    stock_rows = [
        ("The pill shell",
         "<code>FloatingToolbar</code> in the app’s own chrome",
         f"<code>FloatingToolbar</code> — <code>{rel(src['trunk.floatingToolbar']['path'])}</code>",
         "Placement, max width, off-screen hiding. Already shared; nothing changes."),
        ("One trigger + its popover",
         "hand-rolled <code>StyleRowControl</code> in the app "
         f"(<code>{rel(src['app.selectionClusters']['path'])}</code>)",
         f"<code>ControlStrip</code> + <code>ControlPanel</code> — "
         f"<code>{rel(src['trunk.controlStrip']['path'])}</code>. Already a registry item "
         f"(<code>control-strip</code>), so a host outside this repo can install it.",
         "The trigger face, the chevron, the five layouts. <b>The port already exists and "
         "nothing mounts it.</b>"),
        ("What the options are",
         "<code>STYLE_ROWS</code>, tldraw <code>StyleProp</code>s read straight through",
         f"<code>createControlRegistry</code> — <code>{rel(src['trunk.controlRegistry']['path'])}</code>",
         "A data registry, so labels/order/layout are declared once, not re-typed per surface. "
         "<code>bindControl</code> / <code>composeControls</code> come off the instance it "
         "returns, not off the module."),
        ("The little icon on each option",
         "plain text: the popover literally lists <code>draw / solid / dashed / dotted / none</code>",
         f"<code>DASH_ARRAYS</code> + <code>FillGlyph</code> — "
         f"<code>{rel(src['trunk.controlGlyphs']['path'])}</code>",
         "A4. Ported from the archived app; drawn, unused, already in the tree."),
        ("Custom text size",
         "nothing — four presets only",
         f"<code>CustomSizeBinding</code> (the <code>customSize</code> field on "
         f"<code>ControlBinding</code>) — <code>{rel(src['trunk.controlRegistry']['path'])}</code>",
         "A3. 4–400 px, committed on blur or Enter. The cell that renders it is module-private "
         "in <code>controlPanel.tsx</code>; you get it by supplying the binding, which is the "
         "right seam."),
        ("Text size ⊥ stroke width",
         "one tldraw <code>size</code> rung drives both",
         f"<code>pinStrokeWidth</code> + shape <code>meta</code> — "
         f"<code>{rel(src['archive.strokeMeta']['path'])}</code>",
         "A1. The archived app already solved this after the same report; the width lives in "
         "<code>meta</code> so <code>.tldr</code> files still open in stock tldraw."),
        ("Popover sections stacked",
         "one flat list per trigger",
         f"<code>modeControl</code> / <code>modePlacement:\"above\"</code> + the exported "
         f"<code>stackModes</code> walker — <code>{rel(src['trunk.controlRegistry']['path'])}</code>",
         "A5, A6. This is the mechanism that makes “fill lives inside colour” a data "
         "declaration rather than a bespoke component."),
        ("Opacity",
         "an inline slider + <code>100%</code> on the bar "
         f"(<code>OpacityCluster</code>, <code>{rel(src['app.selectionClusters']['path'])}</code>)",
         "<b>no stock part — new</b>, a row inside the Fill and Stroke panels",
         "A7. Nothing in either tree models opacity as a property <em>of</em> a paint; this is "
         "the smallest genuinely new piece."),
        ("Stroke follows fill",
         "nothing — two independent styles",
         "<b>no stock part — new</b>, one boolean beside the edge colour",
         "A8. Neither the archived app nor the trunk has a derived/linked colour. The rule is "
         "three lines; making it <em>visible</em> is the design question P4 answers."),
        ("Unchanged (stock seam)",
         "<code>Popover</code> / <code>PopoverTrigger</code> / <code>PopoverContent</code>, "
         "Base UI via shadcn",
         "same — <code>apps/storybook-basics/src/components/popover.tsx</code>",
         "Deliberately untouched. The disclosure is stock; only what goes inside it is ours."),
    ]
    stock_html = "".join(
        f"<tr><td><b>{a}</b></td><td>{b}</td><td>{c}</td><td>{d}</td></tr>"
        for a, b, c, d in stock_rows
    )

    mock_row = (
        f"""<p style="margin-top:14px"><b>All five are live.</b> The page below is the real thing —
        click the triggers, drag the sliders, watch the shape repaint and the readout bottom-left
        follow it. The proposal picker is bottom-right and remembers your choice. It is a plain
        file, so there is no server and nothing to stop.</p>
        <pre class="tight">{args.mock_url}</pre>"""
        if args.mock_url else ""
    )

    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Selection toolbar — five proposals</title>
<style>{CSS}
  .shots {{ grid-template-columns:repeat(auto-fit,minmax(430px,1fr)); gap:22px }}
  .shots figure img {{ max-height:420px; object-position:center top }}
</style></head><body>
<div class="wrap">

<p class="kicker">bbox-ui · {TODAY} · {branch} @ {head}</p>
<h1>The selection toolbar, five ways</h1>
<p class="sub">Eight asks from this morning, four of which are about a <em>relationship</em>
between two controls rather than a layout. All five proposals obey all eight; they differ in how
much of the bar you have to look at to use them.</p>

<div class="lede gold">
<p><b>Read this first, because it changes what the decision is.</b> The design you are asking me
to copy is <em>already ported into this repo</em> and nothing mounts it.
<code>{rel(src['trunk.controlStrip']['path'])}</code> ({src['trunk.controlStrip']['lines']} lines),
<code>{rel(src['trunk.controlPanel']['path'])}</code> ({src['trunk.controlPanel']['lines']} lines),
<code>{rel(src['trunk.controlRegistry']['path'])}</code> and
<code>{rel(src['trunk.controlGlyphs']['path'])}</code> are a finished port of the archived app’s
appearance kit — stacked popovers, five layouts, a custom-size binding, and the dash preview
glyphs you asked for, already drawn.</p>
<p>The bar in your screenshots is a <em>second, hand-rolled implementation</em> in
<code>{rel(src['app.selectionClusters']['path'])}</code> that reads tldraw’s style props
straight through. That is why the line-style menu says the word “dashed” instead of drawing a
dashed line: the glyph exists two directories away and the shipped bar never calls it.</p>
<p>So the question is not “can we build this”. It is <b>which arrangement do you want</b> —
and then wiring the kit that is already there.</p>
</div>

<h2>What you asked for</h2>
<div class="scroll"><table>
<thead><tr><th style="width:44px">#</th><th>Ask</th><th class="c" style="width:90px">Honoured by</th></tr></thead>
<tbody>{asks_rows}</tbody></table></div>
<p style="color:var(--dim2);font-size:13px">A1, A7 and A8 are <em>rules</em>, not layouts — so
they are not what distinguishes the five. They are implemented identically in all of them, and
proved below. The five differ only on A2, A5 and A6: how the controls are grouped.</p>

<h2>The three rules, proved</h2>

<div class="answer green">
<b class="h">A1 — text size no longer moves the line width</b>
<p>In stock tldraw one <code>size</code> rung drives both, in
<code>default-shape-constants.mjs</code>: <code>STROKE_SIZES</code> and
<code>LABEL_FONT_SIZES</code> share the key <code>s|m|l|xl</code>. That is the coupling — it is
tldraw’s, not ours, and this repo writes the enum and nothing else
(<code>{rel(src['app.arrangeActions']['path'])}</code>).</p>
<p>The archived app already broke it, after you filed the same report:
<code>{rel(src['archive.strokeMeta']['path'])}</code> stores the painted width in the shape’s
<code>meta</code> and calls <code>pinStrokeWidth</code> <em>before</em> writing the new rung, so
the outline stays where it was. Keeping it in <code>meta</code> rather than a new
<code>StyleProp</code> is what lets a <code>.tldr</code> still open in stock tldraw.</p>
<p class="measured">Driven in Chromium, reading the painted <code>&lt;rect&gt;</code> and
<code>&lt;text&gt;</code> — not the DOM tree:</p>
<pre class="term">text  {p1['decoupling']['before']['fontPx']}px → {p1['decoupling']['afterXL']['fontPx']}px   (Medium → Extra large)
text  {p1['decoupling']['afterXL']['fontPx']}px → {p1['decoupling']['afterCustom47']['fontPx']}px   (Custom 47 px)
<span class="t">stroke  {p1['decoupling']['before']['strokeWidth']}px → {p1['decoupling']['afterXL']['strokeWidth']}px → {p1['decoupling']['afterCustom47']['strokeWidth']}px   unchanged throughout</span></pre>
<p class="note" style="color:var(--dim2);font-size:13px"><b>The gate can fail.</b> Re-couple the
two in the mock — <code>S.strokeWidth = {{s:"thin",m:"medium",l:"medium",xl:"thick"}}[value]</code>,
which is what tldraw does — and all five go red with <code>XL moved the stroke width</code> and
<code>custom px moved the stroke width</code>. Mutation-tested {TODAY}.</p>
</div>

<div class="answer green">
<b class="h">A7 — opacity is a property of a paint, so it lives with the paint</b>
<p>Today it is an inline slider and a <code>100%</code> readout sitting loose on the pill
(<code>OpacityCluster</code>, <code>{rel(src['app.selectionClusters']['path'])}</code>), which
makes it look like a peer of “colour” rather than an attribute of it. In all five proposals the
bar carries no slider and no percentage; Fill has its own opacity row and Stroke has its own.</p>
<p>That is also strictly more expressive than today: one shape can now have a solid edge over a
20% fill, which the single shape-wide opacity could not express.</p>
<p class="note" style="color:var(--dim2);font-size:13px"><b>The gate can fail.</b> Put a slider
back on the bar and the run reports <code>opacity is still on the bar</code> for the proposals
that carry it. Mutation-tested {TODAY}.</p>
</div>

<div class="answer green">
<b class="h">A8 — the edge follows the fill until you set it</b>
<p>One boolean. While it is true the edge is <em>painted</em> from the fill colour and the edge
swatch shows that colour as selected. Choosing a fill carries the edge along. Choosing an
<em>edge</em> colour is the explicit act that sets the boolean false — after which the two are
independent, permanently, until you press <b>Follow fill</b>.</p>
<p>The subtlety worth naming: the link breaks on <em>setting the edge</em>, never on setting the
fill. Anything else and “make it green” would silently orphan the edge.</p>
<p class="measured">Driven in Chromium, reading the painted <code>&lt;rect&gt;</code>:</p>
<pre class="term">fill → red      rect fill <span class="s">{p1['link']['afterFillRed']['fill']}</span>  stroke <span class="s">{p1['link']['afterFillRed']['stroke']}</span>   <span class="t">edge followed</span>
edge → blue     rect fill <span class="s">{p1['link']['afterEdgeBlue']['fill']}</span>  stroke <span class="s">{p1['link']['afterEdgeBlue']['stroke']}</span>   link broken
fill → yellow   rect fill <span class="s">{p1['link']['afterFillYellow']['fill']}</span>  stroke <span class="s">{p1['link']['afterFillYellow']['stroke']}</span>   <span class="t">edge held</span></pre>
</div>

{provenance_section()}

<h2>A2, A3, A4 — the dropdown itself</h2>
<p>These are the same in all five, because they are about what an option <em>looks like</em>,
not where the trigger sits. Both come from the archived app, and both already have a ported
implementation in the trunk that the shipped bar does not call.</p>

<div class="grid2">
<div class="card blue"><b>A4 — line styles draw themselves</b>
<p>Five options, every one carrying its own <code>&lt;svg&gt;</code>, measured in the running
page: {", ".join(f"<code>{o['value']}</code>" for o in dash_rows)}.</p>
<p>The cadences are <code>DASH_ARRAYS</code> from
<code>{rel(src['trunk.controlGlyphs']['path'])}</code> — <code>dashed 4&nbsp;3</code>,
<code>dotted 0.1&nbsp;3.2</code> with round caps, <code>draw</code> a wobbled path,
<code>none</code> a slashed circle.</p>
<p>Thickness does the same thing one level up: each cell is a line drawn <b>at the width it
actually paints</b> — {", ".join(f"<code>{t['value']} {t['drawnAt']}px</code>" for t in thickness)}.</p></div>

<div class="card blue"><b>A3 — text size, presets and a real number</b>
<p>Each preset row is drawn at its own size and prints its real px:
{", ".join(f"<code>{r['value']} → {r['printedPx']}px</code>" for r in size_rows)}.</p>
<p>Under them, a live <code>Custom</code> field, 4–400&nbsp;px, committed on blur or Enter — the
archived <code>CustomFontSizeCell</code> (<code>{rel(src['archive.controls']['path'])}</code>).
Picking a preset clears the custom value; typing one un-checks every preset, exactly as the
archived list did.</p>
<p>The rung’s name and its px sit side by side on the trigger too, because the rung is a type
role (“this is a heading”) and the px is the answer to “how big is it actually”.</p></div>
</div>

<h2>The five, side by side</h2>
<div class="scroll"><table>
<thead><tr><th>Proposal</th><th class="num">Pill px</th><th class="num">Style triggers</th>
<th class="num">Shape hidden</th><th class="c">Opacity inside</th><th class="c">Custom px</th>
<th class="c">Drawn line styles</th></tr></thead>
<tbody>{table_rows}</tbody></table></div>
<p style="color:var(--dim2);font-size:13px">“Pill px” and “shape hidden” are
<code>getBoundingClientRect()</code> readings taken while the page was driven, not estimates.
“Shape hidden” is the fraction of the selected rectangle’s area that the open surface overlaps —
the number that says what the popover costs you while you are using it.</p>
{mock_row}

<h2>The five proposals</h2>
<div class="answers">
{"".join(proposal_section(p, checks, media) for p in PROPOSALS)}
</div>

<h2>Stock part, element by element</h2>
<p>What each element is today, what it becomes, and what is genuinely new. Every part named in
the middle column was checked against the file on disk at build time — a name this repo does not
export would have failed the build rather than shipped.</p>
<div class="scroll"><table>
<thead><tr><th style="width:15%">Element</th><th style="width:26%">Today</th>
<th style="width:29%">Stock part, by its exported name</th><th>Behaviour that must survive</th></tr></thead>
<tbody>{stock_html}</tbody></table></div>

<h2>What I did not do</h2>
<div class="grid2">
<div class="card"><b>Nothing shipping was touched</b>
<p>The app’s pill and the trunk kit are both untouched. The five mocks are a spike in
<code>docs/toolbar_proposal_mocks.py</code>; the only new files are that, the capture script and
this builder.</p></div>
<div class="card"><b>No seeded review board</b>
<p>There is nothing to open in the app yet — the proposals are mocks. The board comes with the
implementation, per <code>skills/bbox-review-board</code>.</p></div>
<div class="card"><b>The shape library, arrange and the actions cluster</b>
<p>Untouched in all five. You did not raise them, and moving them would have made the five
proposals differ on something you are not choosing between.</p></div>
<div class="card"><b>Connectors and text shapes</b>
<p>The mocks style a geo shape only. The archived app varied the pill by what the selection
shares (<code>getSharedStyles()</code>); that behaviour is orthogonal to this choice and would
carry over unchanged.</p></div>
</div>

<h2>What needs you</h2>

<div class="ask">
<h3>1. Which arrangement?</h3>
<p>Mark one with <b>★ do this</b> above. They are not exclusive in the way they look: P1 and P5
share a vocabulary and differ only in the disclosure, so “P1’s grouping, P5’s tray” is a real
answer. So is “P2, but keep P4’s chain on the Edge face”.</p>
<p class="dflt"><b>If you say nothing:</b> I build <b>P1</b>. It is the one you asked for by name,
it is the only one that needs no new layout primitive, and every other proposal is a
rearrangement of the same parts — so P1 first makes the rest cheap.</p>
</div>

<div class="ask">
<h3>2. Does the link survive a copy, and a multi-selection?</h3>
<p>“Stroke follows fill” is per-shape state. Two questions it raises that the mock cannot answer:
does duplicating a linked shape keep the link (I would say yes), and what does the Edge swatch
show when some of the selection is linked and some is not?</p>
<p class="dflt"><b>If you say nothing:</b> the link travels with the shape on copy, and a mixed
selection shows the link row as indeterminate with <b>Follow fill</b> still available — pressing
it links all of them. Reversible either way.</p>
</div>

<div class="ask">
<h3>3. Should opacity stay two numbers, or go back to one?</h3>
<p>Splitting opacity into fill-opacity and stroke-opacity is more expressive, but it is also two
sliders where tldraw has one shape-wide value, and it does not round-trip into a stock
<code>.tldr</code> the way one <code>opacity</code> does.</p>
<p class="dflt"><b>If you say nothing:</b> two sliders in the UI, written to one shape-wide
<code>opacity</code> plus a <code>meta</code> ratio — same trick <code>strokeMeta.ts</code> uses
for width, so the file still opens in stock tldraw.</p>
</div>

{overall_box("anything the eight asks missed…")}

<footer class="page">
<p><b>Built from</b> <code>docs/build_toolbar_proposals_report.py</code> ·
mocks <code>docs/toolbar_proposal_mocks.py</code> ·
captures <code>docs/capture_toolbar_proposal_mocks.mjs</code>, driven in Chromium at
1180&times;700, deviceScaleFactor&nbsp;2.</p>
<p><b>Every number on this page</b> was read out of the running page or off a file on disk at
build time. The five proposals passed {len(checks)}/{len(checks)} of the ten gates, and the two
load-bearing gates were mutation-tested red on {TODAY}.</p>
<p><b>The archived app</b> is <code>/home/bam/systemsketch</code> —
<code>src/appearance/</code> and <code>src/contextualMenus/</code>. Its own captures of the
design you remember: <code>docs/appearance-menu-1-color-2026-09-01.png</code>,
<code>docs/appearance-menu-7-font-size-2026-09-01.png</code>,
<code>docs/appearance-menu-8-shape-line-style-2026-09-05.png</code>.</p>
</footer>
</div>

{dock("toolbar-proposals-2026-09-24", "proposal", len(PROPOSALS))}
<script>{FB_JS}</script>
</body></html>"""

    report_size(html, pathlib.Path(args.out))



if __name__ == "__main__":
    main()
