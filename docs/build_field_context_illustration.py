#!/usr/bin/env python3
"""Illustrate the two prior-art points from the visual-grammar report.

    python3 docs/build_field_context_illustration.py

Writes to the gitignored media half, because every figure here is a real
inlined capture rather than generated SVG:

    /home/bam/bbox-ui/reports/media/field-context-2026-09-24.html

The figures are Blender's own manual figures, fetched from
docs.blender.org and inlined. They are reproduced here as reference images for
design commentary — the same use Zach's `feedback_show_dont_tell` rule asks for
("embed close-up reference images of the ACTUAL elements"). Each carries its
source URL.

WHY this page exists as a correction as much as an illustration: one of the two
points it was asked to illustrate did not survive being checked. The Pipedream
claim came from the research corpus and was relayed without my opening the
product's docs; when I did, they describe an event-inspector sidebar, not the
canvas state overlay the claim described. That is recorded below rather than
quietly dropped.
"""
from __future__ import annotations

import base64
import io
import pathlib
import subprocess
import sys

from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent
MAIN = pathlib.Path("/home/bam/bbox-ui")
NAME = "field-context-2026-09-24"
OUT = MAIN / "reports" / "media" / f"{NAME}.html"
SHOTS = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "_shots"
CAP = 2_097_024

BLENDER_DOC = ("https://docs.blender.org/manual/en/latest/modeling/"
               "geometry_nodes/fields.html")
IMG_BASE = "https://docs.blender.org/manual/en/latest/_images"


def sh(cmd: str) -> str:
    return subprocess.run(cmd, shell=True, cwd=REPO, capture_output=True,
                          text=True).stdout.strip()


def img(name: str, *, width: int = 1400, quality: int = 82) -> str:
    """Inline a capture as WebP, downscaled to what the page actually shows."""
    p = SHOTS / name
    if not p.exists():
        raise SystemExit(f"missing capture: {p}")
    im = Image.open(p).convert("RGB")
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=quality, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


def figure(name: str, caption: str, source: str) -> str:
    return (f'<figure><img src="{img(name)}" alt="">'
            f'<figcaption>{caption}<br><a href="{IMG_BASE}/{source}">'
            f'{source}</a></figcaption></figure>')


CSS = """
:root { --bg:#0e0f12; --panel:#15171c; --panel2:#1b1e25; --line:#282d38;
  --line2:#343b49; --fg:#e6e8ee; --dim:#9aa3b2; --dim2:#6b7383;
  --accent:#f0883e; --accent2:#5aa9f8; --ok:#3fb950; --warn:#e5534b; --gold:#e8c06a;
  --mono:'JetBrains Mono','DejaVu Sans Mono',Menlo,Consolas,monospace; }
* { box-sizing:border-box }
body { margin:0; background:var(--bg); color:var(--fg);
  font:15.5px/1.68 -apple-system,'Noto Sans',Inter,sans-serif }
.wrap { max-width:1000px; margin:0 auto; padding:48px 24px 90px }
h1 { font-size:34px; line-height:1.14; margin:0 0 10px; letter-spacing:-.024em }
h2 { font-size:12.5px; text-transform:uppercase; letter-spacing:.14em;
  color:var(--dim2); margin:62px 0 16px; font-weight:600 }
h3 { font-size:20px; margin:34px 0 8px; letter-spacing:-.015em }
.kicker { font:600 11.5px/1 var(--mono); letter-spacing:.14em; text-transform:uppercase;
  color:var(--dim2); margin:0 0 18px }
.sub { color:var(--dim); font-size:18px; margin:0 0 26px; line-height:1.55 }
p { margin:0 0 15px }
a { color:var(--accent2) }
code { font:12.8px var(--mono); background:#0a0b0e; padding:1.5px 5px;
  border-radius:4px; color:var(--gold) }
figure { margin:22px 0; background:#0a0b0e; border:1px solid var(--line);
  border-radius:12px; padding:14px }
figure img { width:100%; display:block; border-radius:7px }
figcaption { color:var(--dim); font-size:13px; line-height:1.55; margin-top:11px }
figcaption a { font:11px var(--mono); color:#4d7fb8 }
blockquote { margin:18px 0; padding:14px 18px; background:var(--panel);
  border-left:2px solid var(--gold); border-radius:0 8px 8px 0;
  font-size:15px; line-height:1.62; color:#d6dae3 }
blockquote cite { display:block; margin-top:9px; font:11.5px var(--mono);
  color:var(--dim2); font-style:normal }
.note { border-left:2px solid var(--line2); padding:3px 0 3px 18px;
  color:var(--dim); margin:20px 0 }
.note.warn { border-color:var(--warn) }
.note.ok { border-color:var(--ok) }
.lede { font-size:17px; color:#d6dae3; line-height:1.62 }
.two { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin:22px 0 }
.two figure { margin:0 }
@media (max-width:820px){ .two { grid-template-columns:1fr } }
.tag { display:inline-block; font:600 10.5px var(--mono); letter-spacing:.06em;
  text-transform:uppercase; padding:3px 9px; border-radius:20px;
  background:var(--panel2); border:1px solid var(--line); color:var(--dim) }
.tag.ok { color:var(--ok); border-color:#2a4a32 }
.tag.warn { color:var(--warn); border-color:#5a2f2c }
hr { border:0; border-top:1px solid var(--line); margin:46px 0 }
"""


def build() -> str:
    branch = sh("git rev-parse --abbrev-ref HEAD")
    head = sh("git rev-parse --short HEAD")

    P = [f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rendering the kind, not the instance</title><style>{CSS}</style></head>
<body><div class="wrap">"""]

    P.append('<p class="kicker">bbox-ui · prior art · 24 September 2026</p>')
    P.append("<h1>Rendering the kind is not rendering which one</h1>")
    P.append('<p class="sub">Blender ships three redundant channels for what a '
             'socket <em>is</em>, and none at all for <em>which evaluation you are '
             'looking at</em>. That gap is the Crossed hazard in different clothes.</p>')

    P.append("<h2>1 · The type channel, done well</h2>")
    P.append('<p class="lede">Blender spends three separate channels on field-ness, '
             'and they are redundant on purpose — socket <strong>shape</strong> '
             '(diamond = field, circle = single value), wire <strong>style</strong> '
             '(dashed = field, solid = value), and on a mismatch a red wire '
             '<em>plus</em> a warning glyph sitting on the connection.</p>')
    P.append(figure("blender-viz.png",
                    "Diamond sockets carry fields, circles carry single values. The "
                    "red wire with the warning badge is a field wired into a socket "
                    "that cannot take one. Three channels, any one of which alone "
                    "would still read.",
                    "modeling_geometry-nodes_fields_visualization.webp"))
    P.append("""<blockquote>If a node connection is coming from a field socket, it will
be drawn as a dashed line. Otherwise, it will be drawn as a solid line instead. If you
make the mistake of connecting a non-field socket to a field socket, the connection will
be drawn as a solid red line indicating that there is an error.
<cite>Blender Manual · Fields · Field Visualization</cite></blockquote>""")
    P.append('<p>This is the part worth copying. It is also, notably, the thing '
             'bbox-ui already gets right once: <code>ORIGIN_BADGE</code> carries '
             '<code>Pseudo</code> / <code>Synced</code> / <code>Drifted</code> / '
             '<code>Orphaned</code> as <strong>words</strong> plus a variant, not as a '
             'colour a reader has to decode from a legend.</p>')

    P.append("<h2>2 · The instance channel, absent</h2>")
    P.append('<p class="lede">Now the same notation with one node added. These two '
             'boards are the same field subgraph — <code>Position</code> and '
             '<code>Index</code> into <code>Scale</code>. On the right it feeds '
             '<strong>two</strong> <code>Set Position</code> nodes instead of one, and '
             'the second evaluation returns <strong>different data</strong>, because '
             'the first has already moved the geometry.</p>')
    P.append(figure("modeling_geometry-nodes_fields_flow-1.png",
                    "<strong>One consumer.</strong> The field is evaluated once. The "
                    "yellow arrows are the manual's annotation of that single pass.",
                    "modeling_geometry-nodes_fields_flow-1.png"))
    P.append(figure("modeling_geometry-nodes_fields_flow-2.png",
                    "<strong>Two consumers.</strong> Same subgraph, evaluated twice — "
                    "yellow for the first pass, green for the second. The two passes "
                    "return different values.",
                    "modeling_geometry-nodes_fields_flow-2.png"))

    P.append("""<blockquote>One common misunderstanding is that the same field node tree
used in multiple places will output the same data. This is not necessarily true, because
the field node tree will be evaluated for every data flow node, potentially retrieving
data from a different or changed geometry.
<cite>Blender Manual · Fields · Field Context</cite></blockquote>""")

    P.append("""<div class="note warn">
<p><strong>Look at what the manual had to do to explain it.</strong> The yellow and green
arrows are not Blender. They are drawn on top, in the documentation, because the product
has no way to show that one subgraph is being evaluated twice with different results. The
canvas is pixel-identical for both passes: same sockets, same dashes, same colours.</p>
<p>So the vendor spent three redundant channels telling you <em>what kind of value</em>
flows down a wire, and zero telling you <em>which evaluation you are looking at</em> —
and then had to annotate their own screenshots by hand to teach the difference. Their own
word for the result is <em>"misunderstanding"</em>, and it is the most-reported confusion
in the Geometry Nodes corpus.</p></div>""")

    P.append("<h2>3 · Why this is the Crossed hazard again</h2>")
    P.append("""<p class="lede">Strip the domain away and the two failures are the same
shape.</p>
<p><strong>Blender:</strong> the notation renders the <em>type</em> of a thing perfectly
and the <em>identity</em> of it not at all, so two uses of one subgraph that behave
differently are drawn identically.</p>
<p><strong>bbox-ui’s anchor:</strong> the four-state machine renders the
<em>content</em> status of a binding (<code>synced</code> / <code>drifted</code>) and
the <em>identity</em> of it not at all, so a cell bound to the right function and a cell
bound to its same-named neighbour are drawn identically — and on the
<code>drifted</code> path the badge actively recommends the click that makes the wrong
binding permanent.</p>
<p>Both systems answer <em>“is this the right kind of thing?”</em> and neither
answers <em>“is this the thing I meant?”</em> Blender has had years and a large
user base to find this and has not closed it, which is the argument for closing it
before the notation ships rather than after.</p>""")

    P.append("<hr>")
    P.append("<h2>4 · A correction — the Pipedream point does not hold</h2>")
    P.append("""<p><span class="tag warn">retracted</span></p>
<p>The report's completeness critic cited Pipedream as the corpus's SOLVED row for the
collapsed-node observability problem — <em>"solves the comprehension half separately
with a state overlay: the notation distinguishes 'a path that exists' from [one that
ran]"</em> — and I relayed that to you as copyable prior art without opening the
product's documentation.</p>
<p>I have now opened it. Pipedream's documented answer is an <strong>event inspector</strong>:
a sidebar listing past executions, with <code>console.log()</code> output attached to the
associated code cells, plus replay and delete buttons per event. That is a run log with
per-step detail. It is not a canvas overlay, and it does not distinguish a path that
exists from a path that ran — Pipedream workflows are largely linear step sequences,
where that distinction barely arises.</p>
<blockquote>The inspector lists the events you send to a workflow&hellip; Clicking on an
event from the list lets you review the incoming event data and workflow execution logs
for that event.
<cite>Pipedream Docs · Inspect Events</cite></blockquote>
<p>So treat point 4 of that list as withdrawn. The underlying <em>problem</em> is still
real and still unanswered — it is your own logged Unreal complaint, that collapsing
nodes breaks the live execution-flow debugger, and the corpus row that states the fix
(<em>"making a collapsed node's internal progress visible at its boundary&hellip; rather
than treating collapse as a rendering cut"</em>) still stands. What I no longer have is a
shipped product to copy it from.</p>
<div class="note"><p>The failure mode is worth naming, because it is the one the whole
research pipeline was built to prevent: the corpus verifier re-fetched the sources behind
each <em>complaint</em>, but a claim about a system's <em>solution</em>, written by a
later agent summarising a row, went out without the same check. Solutions need
re-fetching as hard as problems do.</p></div>""")

    P.append("<h2>Provenance</h2>")
    P.append(f"""<div class="note">
<p>Figures are Blender's own manual figures, fetched this session from
<a href="{BLENDER_DOC}">{BLENDER_DOC}</a> and inlined, each captioned with its source
filename. Quotes are verbatim from that page and from Pipedream's
<a href="https://pipedream.com/docs/workflows/building-workflows/inspect">Inspect
Events</a> page, both read in the browser rather than recalled.</p>
<p>Built by <code>docs/build_field_context_illustration.py</code> on
<code>{branch}</code> at <code>{head}</code>. Companion to
<code>reports/visual-grammar-improvements-2026-09-23.html</code>.</p></div>""")

    P.append("</div></body></html>")
    return "".join(P)


def main() -> None:
    from urllib.parse import quote
    page = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(page)
    encoded = len(quote(page, safe="-_.!~*'()").encode())
    print(f"wrote {OUT}  ({OUT.stat().st_size:,} bytes on disk)")
    print(f"desktop-preview encoded size: {encoded:,} / {CAP:,} "
          f"({encoded / CAP * 100:.0f}%)")
    if encoded > CAP:
        print("  OVER THE CAP — browser-only; say so in the handoff.")


if __name__ == "__main__":
    main()
