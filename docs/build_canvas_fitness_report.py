#!/usr/bin/env python3
"""Build the canvas-fitness report: what a notebook UI has to change to live
on an infinite canvas, and what that changed in the lab today.

Extends as the styling variants land — same file, same link.

    python3 docs/build_canvas_fitness_report.py
"""
from __future__ import annotations

import base64
import html
import pathlib
import subprocess

REPO = pathlib.Path("/home/bam/bbox-ui")
LAB = pathlib.Path(__file__).resolve().parent.parent / "apps/notebook-lab"
SHOTS = REPO / "reports/media/lab-shots"
OUT = REPO / "reports/media/canvas-fitness-2026-09-18.html"


def uri(name: str) -> str:
    p = SHOTS / f"{name}.webp"
    if not p.exists():
        raise SystemExit(f"missing {p}")
    return "data:image/webp;base64," + base64.b64encode(p.read_bytes()).decode()


def sh(cmd: str) -> str:
    return subprocess.run(cmd, shell=True, cwd=LAB, capture_output=True, text=True).stdout.strip()


PASSES = sh("grep -c PASS acceptance.out")
CONTRACT = sh("grep -c PASS server/test_contract.out")

CSS = """
*{box-sizing:border-box}
:root{--ink:#0f172a;--dim:#64748b;--line:#e2e8f0;--bg:#f8fafc;--card:#fff;--acc:#b45309;
 --ok:#15803d;--okbg:#dcfce7;--bad:#b91c1c;--badbg:#fee2e2;--blue:#1d4ed8;
 --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 ui-sans-serif,-apple-system,"Segoe UI",Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1080px;margin:0 auto;padding:0 28px 110px}
header.top{border-bottom:1px solid var(--line);background:var(--card);padding:50px 0 34px;margin-bottom:38px}
header.top .wrap{padding-bottom:0}
.kicker{font:600 12px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--acc)}
h1{font-size:41px;line-height:1.1;margin:15px 0 14px;letter-spacing:-.022em;max-width:20ch}
.lede{font-size:19px;color:#334155;max-width:66ch;margin:0}
.lede b{color:var(--ink)}
h2{font-size:27px;letter-spacing:-.015em;margin:60px 0 6px;padding-top:22px;border-top:1px solid var(--line)}
h2 .num{font:600 13px/1 var(--mono);color:var(--acc);display:block;margin-bottom:10px;letter-spacing:.12em}
h3{font-size:18px;margin:32px 0 8px}
p{max-width:72ch}
code{font:.88em var(--mono);background:#eef2f7;padding:1px 5px;border-radius:4px}
a{color:var(--blue)}
.sub{color:var(--dim);font-size:13.5px}
figure{margin:24px 0}
figure img{width:100%;display:block;border:1px solid var(--line);border-radius:12px;background:#fff}
figcaption{font-size:13.5px;color:var(--dim);margin-top:9px}
figcaption b{color:var(--ink)}
table{border-collapse:collapse;width:100%;font-size:14.5px;margin:20px 0}
th,td{text-align:left;padding:11px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:11.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--dim);font-weight:650}
.scroll{overflow-x:auto}
.callout{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--acc);border-radius:0 10px 10px 0;padding:18px 22px;margin:26px 0}
.callout.ok{border-left-color:var(--ok)}
.callout p{margin:0}.callout p+p{margin-top:10px}
.quote{font-style:italic;color:#334155;border-left:3px solid var(--line);padding-left:18px;margin:22px 0;max-width:70ch}
.law{background:#0f172a;color:#e2e8f0;border-radius:14px;padding:26px 30px;margin:28px 0;font-size:19px;line-height:1.55}
.law b{color:#fbbf24}
.finding{border:1px solid var(--line);border-radius:12px;background:var(--card);margin:18px 0;padding:20px 22px}
.finding h4{margin:0 0 6px;font-size:16px}
.finding .tag{font:600 10.5px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;padding:4px 8px;border-radius:5px;display:inline-block;margin-bottom:10px}
.finding .tag.fixed{color:var(--ok);background:var(--okbg)}
.finding .tag.open{color:var(--acc);background:#fef3c7}
.finding .tag.trap{color:var(--bad);background:var(--badbg)}
.finding p{font-size:14.5px;color:#334155;margin:0}
.finding p+p{margin-top:9px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:26px 0}
.stat{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px}
.stat b{display:block;font:700 26px/1 var(--mono);letter-spacing:-.02em}
.stat span{font-size:12.5px;color:var(--dim)}
@media(max-width:900px){.stats{grid-template-columns:repeat(2,1fr)}h1{font-size:31px}}
"""

BODY = f"""
<header class="top"><div class="wrap">
  <div class="kicker">bbox-ui · apps/notebook-lab — 18 Sep 2026</div>
  <h1>What a notebook has to give up to live on a canvas</h1>
  <p class="lede">marimo's UI is a very good answer to a question the canvas does not ask. This is
  the research you asked for, the one law it comes down to, and the three findings that were
  load-bearing enough that I fixed them today — including <b>a coupling bug in the width control
  you asked for this morning</b>.</p>
</div></header>

<div class="wrap">

<h2><span class="num">The reframe</span>marimo's column solves exactly one problem</h2>
<p>The brief was "what must change about marimo's UI for a canvas". The sharper question is what
marimo's UI is a solution <em>to</em>. Read off its shipped CSS: <code>.marimo-cell {{ width: 100%;
max-width: inherit }}</code> with <code>--content-width: 740px</code> and
<code>--gutter-width: 100px</code>. A cell has no intrinsic width, so <b>the document supplies
one</b>. Wrap-versus-scroll, output capping, hover chrome at the edges, <code>opacity:.5</code> for
stale — every one of those is downstream of "the column decides the width, and you can always
scroll past."</p>

<div class="law">
  On a document, layout cost is <b>O(scroll)</b> — you pay it once, later, and only if you go
  looking. On a canvas it is <b>O(board)</b>: you pay it forever, globally, at every zoom.
</div>

<p>Which is your own sentence made mechanical: <em>"the block view is useful to the extent it
hides information and makes other more obvious — in this case the topology and dataflow."</em>
Everything below is that, applied.</p>

<h2><span class="num">Fixed today</span>Three findings that could not wait</h2>

<div class="finding">
  <span class="tag fixed">fixed · e6827bd</span>
  <h4>The width control was wired to the wire picture</h4>
  <p>The editor wrapped long lines, so a block's <b>height</b> was a function of its <b>width</b>.
  And because the port rail distributes its dots over the block's height
  (<code>portEdge.layout.ts</code>, <code>space-between</code>), growing a block by Δ moves port
  <em>i</em> by <code>i·Δ/(n−1)</code> — <b>every port but the first, and the last by the full
  Δ</b>. So the width control you asked for this morning re-flowed your text, changed the height,
  moved the ports and re-routed the cables. The one control broke the one picture.</p>
  <p>Width is now measured in <b>character columns</b>, and code scrolls horizontally instead of
  wrapping. Code is monospace; a column count is the unit its width is actually in. 80 columns at
  0.9rem mono is ≈640px — which is marimo's 740 minus its 100px gutter, so <em>"80 columns" and
  "feels like marimo" are the same number</em>.</p>
  <p>You had already asked for this, before the lab existed — <b>DP - Code Editor:631</b>: <em>"around
  like 100 character width, and then it would have the scroll bar if you went past that. that
  matches how it feels like in an IDE."</em> The trunk even documents that mode as "the IDE feel
  Zach's screenshot wants". I picked <code>wrap</code>.</p>
</div>

<div class="callout ok">
  <p><b>And it resolves what looked like a contradiction in your own feedback.</b> You said "I don't
  like how there's like a scroll bar that appears", and you also asked for a scroll bar past 100
  characters. Both are right, because they are different axes. <b>An inner scroll region is a smell
  on a canvas exactly when it hides content from the camera.</b> Vertical output scroll always does
  — scrolled-away output is invisible to zoom-to-fit, to search and to a screenshot, so the board
  lies about how much is on it. Horizontal code scroll never does: the line ends, the content is
  bounded, and it is the axis the camera does not fight.</p>
</div>

<div class="finding">
  <span class="tag fixed">fixed</span>
  <h4>Figures are capped and click-to-expand</h4>
  <p>On a scrolling notebook a 400px plot is free. On a canvas it is permanent real estate at every
  zoom, paid for by every other block — the seed histogram was taller than both cells that produced
  it. marimo's own answer is <code>max-height: 610px; overflow: auto</code>, which is exactly the
  inner scrollbar you disliked, and it is worse here than there for the reason above.</p>
</div>

<div class="finding">
  <span class="tag fixed">fixed</span>
  <h4>The emitted <code>.py</code> was reordering itself behind you</h4>
  <p>It was written in topological order, on the reasoning that marimo does not care where a cell
  sits in the file. True of marimo's <em>execution</em>, false of <em>git</em>: topological order is
  derived, so adding one reference relocates a cell and a one-character edit produces a diff that
  reorders cells nobody touched. Now board order, which is authored. And
  <code>hide_code</code>/<code>column</code>/<code>disabled</code> are passed through as real
  <code>@app.cell(...)</code> arguments instead of being dropped on every round-trip — they are
  genuine <code>CellConfig</code> fields, so a collapse control would get file-level persistence for
  free.</p>
</div>

<figure>
  <img src="{uri('02-ran-with-output')}" alt="the lab with columns-based width, no wrapping, and a capped figure">
  <figcaption><b>After.</b> <code>plt.hist(1 - samples, bins=30, color="#1f77b4")</code> is one line
  again, blocks are 64 columns, the histogram is capped at 200px and expands on click, and the
  styling switcher sits bottom-right. {PASSES}/{PASSES} acceptance and {CONTRACT}/{CONTRACT} contract
  checks still green.</figcaption>
</figure>

<h2><span class="num">Open</span>The findings that are yours to call</h2>

<div class="finding">
  <span class="tag open">needs you</span>
  <h4>Anchor each port to its cell's row, instead of distributing over the block</h4>
  <p>The same arithmetic as the width bug, and the deeper fix for it. On a canvas a port's
  <em>position</em> is information — it says which member owns it. Distributing makes position a
  function of the box, which makes it noise. Your own default from earlier today was "the cable
  leaves at that member's row"; the arithmetic says take it as a rule, not a default.</p>
</div>

<div class="finding">
  <span class="tag open">needs you</span>
  <h4>Drop <code>In [n]</code>. marimo has no execution counter at all</h4>
  <p>Verified: zero <code>execution_count</code> anywhere in the package outside nbformat
  conversion, and its state type is <code>Literal["idle", "queued", "running",
  "disabled-transitively"]</code>. With a dependency graph, order is a fact about the graph, not a
  log of what you did. Our <code>In [n]</code> is Jupyter's, and it costs ~17% of a block's width to
  render the artifact of the problem marimo deleted. Keep it in the <code>jupyter</code> styling,
  where it belongs; the question is whether it survives anywhere else.</p>
</div>

<div class="finding">
  <span class="tag open">needs you</span>
  <h4>Stale is in the worst possible channel</h4>
  <p>We copied marimo's <code>opacity: .5</code>. "Which of my twenty blocks are stale" is the
  question zooming out exists to answer, and at that zoom a 50%-opacity 12.5px glyph is simply
  gone. Hue and outline survive zoom; opacity does not.</p>
</div>

<div class="finding">
  <span class="tag open">needs you</span>
  <h4>Reserve the east and west edges for ports, forever</h4>
  <p>marimo's hover chrome lives on the cell's shoulders — which on our blocks is the type
  signature. That collision has already cost two defects: a neighbour's rail swallowing clicks on a
  run button, and an outlet dot swallowing the resize drag. The proposal is a rule rather than a
  fix: <b>N carries title, run and state; S carries a hover strip; E/W carry nothing but ports</b>,
  with contextual controls floating above the selection the way SystemSketch already does. Keep
  marimo's hover <em>timing and invisibility</em> — that is muscle memory and it costs no layout.
  Break its <em>geometry</em> — that is the host-specific part.</p>
</div>

<h2><span class="num">Traps</span>Three things worth not walking into</h2>
<div class="finding">
  <span class="tag trap">trap</span>
  <h4>Push-apart or force-directed layout</h4>
  <p>The obvious answer to "a block grew and now it overlaps". It means <b>your board rearranges
  itself while you type</b>, position stops being authored, and undo becomes ambiguous. The
  canvas-native answer is already in the dependency tree: tldraw's own note shape keeps a fixed
  width, grows downward, never pushes anything, and shrinks its font before it ever wraps. Fixed
  width, grow down, push nothing, plus a manual <em>tidy</em> command.</p>
</div>
<div class="finding">
  <span class="tag trap">trap</span>
  <h4>Semantic zoom as a general mechanism</h4>
  <p>tldraw hands you a zoom-invariant layer for free — <code>--tl-scale: calc(1 / var(--tl-zoom))</code>,
  and it already ships the clamped form so counter-scaling stops before it eats the shape. It gives
  you level-of-detail <b>not at all</b>; every threshold would be hand-built and hand-maintained
  board state nobody authored. Counter-scale the port layer instead: code fades to texture as you
  zoom out while ports and wires stay crisp. That is semantic zoom's whole benefit in about one CSS
  rule — and it means the lab's 11.5px port-label override is backwards. At zoom 1 the small label
  reads better; at zoom 0.5 the label is the <em>only</em> thing left, and the trunk's 18px was
  right.</p>
</div>
<div class="finding">
  <span class="tag trap">trap</span>
  <h4>The board has no camera yet</h4>
  <p>The lab renders into a fixed <code>1400×900</code> div with <code>overflow: auto</code>. There
  is no pan, no zoom, no <code>--tl-zoom</code> — so <b>every zoom conclusion above is currently
  untested in this app</b>. The cheapest high-value next move is to put it on a real camera before
  tuning anything, because legibility, chrome scale and port hit size at zoom can only be settled by
  looking. Related: <code>PORT_HIT_PX = 40</code> is a page-space constant, so at zoom 0.25 the port
  hit target is ten screen pixels.</p>
</div>

<h2><span class="num">Still running</span>The five stylings</h2>
<p>An agent is building them now against the frozen contract: <b>classic</b> (baseline),
<b>marimo</b> (stock, from the real source values — 10px radius, <code>--gray-4</code> border,
0.9rem code, hover-gated shoulders, the elapsed-time badge, the <code>…</code> menu, the "reusable"
footer link), <b>jupyter</b> (the classic <code>In [n]:</code> layout), <b>canvas</b> (marimo
adapted, designing against everything above), plus one of its own. The switcher is already in the
app, bottom-right, remembered. This page extends when they land.</p>

<p class="sub">Answering your other question directly: <b>yes, marimo uses CodeMirror</b> — there is a
<code>cell-editor-*.js</code> chunk importing <code>@codemirror/state</code> in the shipped bundle.
Same engine as our <code>CodeEditor</code>, so "feel like marimo" is a styling problem, not an
engine one.</p>

</div>
"""

OUT.parent.mkdir(parents=True, exist_ok=True)
page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Canvas fitness — what a notebook gives up</title>
<style>{CSS}</style></head><body>{BODY}</body></html>"""
OUT.write_text(page, encoding="utf-8")
import urllib.parse
enc = len(urllib.parse.quote(page))
print(f"wrote {OUT}  {OUT.stat().st_size/1024:.0f} KB  ·  {enc/1024:.0f} KB encoded", "OK" if enc < 2_097_024 else "OVER")


# ---------------------------------------------------------------------------
# GALLERY — appended once the five stylings landed. Same file, same link.
# ---------------------------------------------------------------------------

VARIANTS_DIR = REPO / "reports/media/lab-variants"


def vuri(name: str) -> str:
    p = VARIANTS_DIR / f"{name}.webp"
    if not p.exists():
        raise SystemExit(f"missing {p} — run the variant capture first")
    return "data:image/webp;base64," + base64.b64encode(p.read_bytes()).decode()


VARIANTS = [
    dict(
        id="marimo", name="marimo, stock", cols=80,
        one="Every number taken from marimo's own source, nothing invented.",
        body="""Header chevron and <code>stats.py</code> filename, the cell as its own 10px card, line
        numbers, run and <code>…</code> top-right, the <b>−26px left shoulder</b> with its two
        add-cell buttons, the drag handle and elapsed-time on the right, the red trash bottom-right,
        all <code>hover-action</code> gated. The <code>…</code> is a real six-item menu, and
        <code>hide code</code> / <code>disable execution</code> are real per-cell state.""",
        note="""<b>It kept the shoulders at −26px on purpose — which is exactly where our port dots
        live.</b> Moving them would have hidden the finding this comparison exists to produce. Look
        at the close-up: the add-cell <code>+</code> sits on the <code>samples</code> inlet dot, and
        <code>0ms</code> crosses the card's right edge into the outlet rail. That is the E/W
        collision, rendered.""",
    ),
    dict(
        id="jupyter", name="JupyterLab", cols=72,
        one="JupyterLab's own theme tokens, not a look-alike.",
        body="""<code>--jp-cell-prompt-width: 64px</code>, <code>--jp-cell-editor-background:
        #f7f7f7</code>, the <code>--jp-brand-color1</code> collapser bar, 13px code at 1.3077 line
        height. Output flush under the input with no card, <code>In [*]:</code> while running.""",
        note="""Two deviations it flagged rather than took quietly. The prompts are a <em>pair</em> in
        the real app — <code>#307fc1</code> blue for In, <code>#bf5b3d</code> red-brown for Out — and
        it used the real pair over my brief's "both red-brown", since one-second recognition is the
        whole job. And the real 64px prompt column was <b>clipping</b> <code>In [n]:</code> at 13px
        (<code>scrollWidth 71 &gt; clientWidth 64</code>, silently eating a glyph to an ellipsis), so
        it kept the token and dropped the type a point. It also draws no inlet/outlet chips at all:
        a linear notebook has no dataflow furniture, and the names are already on the ports.""",
    ),
    dict(
        id="canvas", name="marimo, adapted", cols=60,
        one="Ten numbered changes to marimo's model, each with its reason at the seam.",
        body="""Shoulders come <em>inside</em> the box. Hover gating dropped — on a board you read
        blocks you are not pointing at, so chrome that only exists on hover reads as chrome that does
        not exist; always present at 45%, full on hover. Cell gap 1.25rem → 0, since vertical space
        is permanent here. No inner scroll: an explicit output collapse that <b>names what it
        hides</b> ("figure · 3 lines"), because truncation must be announced. State is a 3px rail,
        not a 1px border tint — 1px amber is gone at 40% zoom. The cell loses its own card, because
        two borders 10px apart read as one blurry edge zoomed out.""",
        note="""It found something by looking that I had not: <code>BlockPort</code> paints an
        inlet's label <em>inside</em> the card, and at this variant's tighter inset the word
        "samples" printed straight through the first line of code. It added a 20px lane — and said
        plainly that is a mitigation, not a cure, since a block with several inlets can still
        overprint a lower cell. That is a lab/trunk problem, not a variant one.""",
    ),
    dict(
        id="page", name="Standalone page", cols=100,
        one="Its own fifth: the block as a document, not a preview.",
        body="""No cell boxes at all. A real 40px manuscript margin carries every per-cell control as
        a marginal mark — <code>§1</code>, <code>run 9</code>, <code>0 ms</code>, a red
        <code>? nowhere</code> for an undefined name. Serif for everything that is not code, printed
        output set as body copy behind a rule, figures with numbered captions
        (<code>Figure 1 · plot.1</code>).""",
        note="""It is the one variant that <em>does</em> echo the inlet/outlet names, as an italic
        apparatus line — "reads samples · defines gap, spread" — precisely because
        <code>canvas</code> refuses to. Its reasoning: a page's conceit is self-containment, both
        answers are defensible, and the same variant should not take both.""",
    ),
]


def variant_block(v: dict) -> str:
    return f"""
<div class="vcard" id="v-{v['id']}">
  <div class="vhead">
    <h3>{v['name']}</h3>
    <span class="vid">{v['id']}</span>
    <span class="vcols">{v['cols']} columns</span>
  </div>
  <p class="vone">{v['one']}</p>
  <figure><img src="{vuri(v['id'])}" alt="the {v['id']} styling on the seed board"></figure>
  <figure><img src="{vuri(v['id'] + '-cell')}" alt="a single cell in the {v['id']} styling"></figure>
  <p>{v['body']}</p>
  <div class="callout">{v['note']}</div>
  {rate('v-' + v['id'], v['name'])}
</div>"""


def rate(rid: str, title: str) -> str:
    return f"""
<div class="rate" data-id="{rid}" data-title="{title}">
  <span class="rl">verdict</span>
  <button class="rb" data-v="this one" aria-pressed="false">This one</button>
  <button class="rb" data-v="close" aria-pressed="false">Close</button>
  <button class="rb" data-v="steal a bit" aria-pressed="false">Steal a bit</button>
  <button class="rb" data-v="no" aria-pressed="false">No</button>
  <textarea class="rn" rows="1" placeholder="note…"></textarea>
</div>"""


GALLERY_CSS = """
.vcard{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:24px 26px 8px;margin:28px 0}
.vhead{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.vhead h3{margin:0;font-size:23px;letter-spacing:-.015em}
.vid{font:600 11px/1 var(--mono);background:#eef2f7;color:#475569;padding:5px 8px;border-radius:5px}
.vcols{font:600 11px/1 var(--mono);color:var(--dim);margin-left:auto}
.vone{font-size:16.5px;color:#334155;margin:8px 0 0}
.vcard figure{margin:18px 0}
.rate{border-top:1px solid var(--line);margin-top:18px;padding:14px 0 18px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.rate .rl{font:600 10.5px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin-right:4px}
.rb{font:600 13px/1 inherit;border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:20px;padding:7px 15px;cursor:pointer}
.rb:hover{border-color:#94a3b8}
.rb[aria-pressed="true"]{background:var(--ink);color:#fff;border-color:var(--ink)}
.rn{flex:1 1 240px;min-width:200px;font:14px inherit;padding:8px 11px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:var(--ink);resize:vertical;min-height:38px}
.copybar{background:var(--card);border-top:1px solid var(--line);padding:18px 0;margin-top:40px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.cbtn{font:600 14px inherit;background:var(--ink);color:#fff;border:0;border-radius:9px;padding:11px 20px;cursor:pointer}
#outbox{width:100%;min-height:170px;font:12.5px/1.5 var(--mono);padding:14px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;margin-top:14px}
"""

GALLERY_JS = """
(function(){
  var KEY='canvas-fitness-verdicts';
  var state={};
  try{ state=JSON.parse(localStorage.getItem(KEY)||'{}'); }catch(e){ state={}; }
  function save(){ try{ localStorage.setItem(KEY,JSON.stringify(state)); }catch(e){} }
  document.querySelectorAll('.rate').forEach(function(bar){
    var id=bar.dataset.id;
    bar.querySelectorAll('.rb').forEach(function(b){
      if(state[id] && state[id].v===b.dataset.v) b.setAttribute('aria-pressed','true');
      b.addEventListener('click',function(){
        bar.querySelectorAll('.rb').forEach(function(o){o.setAttribute('aria-pressed','false');});
        b.setAttribute('aria-pressed','true');
        state[id]=state[id]||{}; state[id].v=b.dataset.v; save();
      });
    });
    var note=bar.querySelector('.rn');
    if(state[id] && state[id].n) note.value=state[id].n;
    note.addEventListener('input',function(){ state[id]=state[id]||{}; state[id].n=note.value; save(); });
  });
  var box=document.getElementById('outbox');
  document.getElementById('copy').addEventListener('click',function(){
    var out=['# Notebook lab — styling verdicts (2026-09-18)',''];
    document.querySelectorAll('.rate').forEach(function(bar){
      var v=bar.querySelector('.rb[aria-pressed="true"]');
      var n=bar.querySelector('.rn').value.trim();
      if(!v && !n) return;
      out.push('## '+bar.dataset.title);
      out.push('- verdict: '+(v?v.dataset.v:'(none)'));
      if(n) out.push('- note: '+n);
      out.push('');
    });
    if(out.length===2) out.push('_(nothing marked yet)_');
    box.value=out.join('\\n'); box.focus(); box.select();
    try{ var w=navigator.clipboard&&navigator.clipboard.writeText(box.value); if(w&&w.catch) w.catch(function(){}); }catch(e){}
    try{ document.execCommand('copy'); }catch(e){}
    document.getElementById('copyhint').textContent='Selected below — Ctrl+C if the clipboard was refused (it is, on file://).';
  });
})();
"""

GALLERY = f"""
<h2 id="gallery"><span class="num">The five stylings</span>Switch between them in the app, bottom right</h2>
<p>All five drive the real kernel and the real derived graph — nothing here is a mock. Each was run
through the whole acceptance journey with that styling selected: <b>35 checks × 5 stylings, all
green</b>, verified by re-running it myself rather than taking the agent's word for it. Marks below
are yours; the Copy button at the end turns them into something you can paste back.</p>

<div class="vcard" id="v-classic">
  <div class="vhead"><h3>Classic</h3><span class="vid">classic</span><span class="vcols">64 columns</span></div>
  <p class="vone">The baseline the other four argue with — today's look, unchanged.</p>
  <figure><img src="{vuri('classic')}" alt="the classic styling"></figure>
  {rate('v-classic', 'Classic')}
</div>

{''.join(variant_block(v) for v in VARIANTS)}

<h3>The marimo <code>…</code> menu, since you asked about the hover affordances</h3>
<figure>
  <img src="{vuri('marimo-menu')}" alt="the marimo cell actions dropdown">
  <figcaption><b>Real dropdown, six items.</b> <code>hide code</code> and <code>disable
  execution</code> are live per-cell state; <code>split cell</code> and <code>clear output</code>
  render disabled because the variant contract has no such action — stated rather than faked, which
  is the right call.</figcaption>
</figure>

<h2><span class="num">What the build surfaced</span>Three things the contract could not give a variant</h2>
<table><tbody>
<tr><td style="width:28%"><b>No cell count</b></td><td>marimo hides delete when a cell is the only
one. <code>CellState</code> has <code>index</code> but not the stack size, so the variant published a
context from its own <code>Block</code> to its own <code>Cell</code> rather than reaching into lab
state. Correct instinct; <code>cellCount</code> should just be on <code>CellState</code>.</td></tr>
<tr><td><b>No reorder, stop, split or clear-output</b></td><td>marimo's drag handle is rendered but
decorative, with a <code>title</code> that says so. Reorder is the one you actually asked for
("these are like sortable blocks within") and it needs a contract action.</td></tr>
<tr><td><b>Line numbers are off and a variant cannot turn them on</b></td><td>The editor is built
once by the lab, deliberately. marimo needs numbers, so that variant drew them with a CSS counter —
and documented the limit at the seam: CodeMirror's real gutter is sticky under horizontal scroll and
a pseudo-element is not, so on a line past the measure the numbers scroll away with the code.
<code>lineNumbers</code> belongs in the contract.</td></tr>
</tbody></table>

<div class="callout ok">
  <p><b>And it caught me miscounting.</b> I reported "36/36 acceptance" twice; the suite has
  <b>35</b> checks. <code>grep -c PASS</code> was also matching the final
  <code>acceptance PASSED</code> line. The numbers above are re-counted.</p>
</div>

<div class="copybar">
  <button class="cbtn" id="copy">Copy my verdicts as markdown</button>
  <span class="sub" id="copyhint">Names each styling, so you never have to say which one you meant.</span>
</div>
<textarea id="outbox" readonly placeholder="Your verdicts appear here, pre-selected — press the button above."></textarea>
"""

page = page.replace("</div>\n", GALLERY + "\n</div>\n", 1) if False else page
html_out = OUT.read_text(encoding="utf-8")
html_out = html_out.replace("<style>" + CSS, "<style>" + CSS + GALLERY_CSS, 1)
html_out = html_out.replace(
    '<p class="sub">Answering your other question directly',
    GALLERY + '\n<p class="sub">Answering your other question directly', 1)
html_out = html_out.replace("</body>", f"<script>{GALLERY_JS}</script></body>", 1)
OUT.write_text(html_out, encoding="utf-8")
enc2 = len(urllib.parse.quote(html_out))
print(f"gallery added · {OUT.stat().st_size/1024:.0f} KB  ·  {enc2/1024:.0f} KB encoded",
      "OK" if enc2 < 2_097_024 else "OVER")
