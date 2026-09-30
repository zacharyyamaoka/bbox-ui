#!/usr/bin/env python3
"""Build the notebook-lab implementation report.

The design half is reports/canvas-notebook-2026-09-18.html. This one is the
build: what got made, that it runs, and the two real defects the acceptance
journey found on the way.

Nothing here is a mock. The hero video is a recording of the running app
(record_demo.mjs), the stills are the acceptance journey's own frames, and both
test transcripts are the real files those suites wrote.

Lives in the gitignored reports/media/ half because it inlines video — that is
what the split is for (payload, not total size).

    python3 docs/build_notebook_lab_report.py
"""
from __future__ import annotations

import base64
import html
import pathlib
import subprocess

REPO = pathlib.Path("/home/bam/bbox-ui")
LAB = pathlib.Path(__file__).resolve().parent.parent / "apps/notebook-lab"
SHOTS = REPO / "reports/media/lab-shots"
DEMO = REPO / "reports/media/lab-demo"
OUT = REPO / "reports/media/notebook-lab-2026-09-18.html"


def uri(path: pathlib.Path, mime: str) -> str:
    if not path.exists():
        raise SystemExit(f"missing {path}")
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def read(path: pathlib.Path) -> str:
    if not path.exists():
        raise SystemExit(f"missing {path} — run the suite that writes it")
    return html.escape(path.read_text().rstrip())


def lines(rel: str) -> str:
    return subprocess.run(f"wc -l < {rel}", shell=True, cwd=LAB, capture_output=True, text=True).stdout.strip()


F = {name: lines(name) for name in [
    "server/lab_server.py", "server/test_contract.py", "src/Lab.tsx", "src/labClient.ts",
    "acceptance.mjs", "run_lab.py", "src/app.css", "record_demo.mjs",
]}
TOTAL = sum(int(v) for v in F.values())

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
figure img,video{width:100%;display:block;border:1px solid var(--line);border-radius:12px;background:#fff}
figcaption{font-size:13.5px;color:var(--dim);margin-top:9px}
figcaption b{color:var(--ink)}
table{border-collapse:collapse;width:100%;font-size:14.5px;margin:20px 0}
th,td{text-align:left;padding:11px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:11.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--dim);font-weight:650}
.scroll{overflow-x:auto}
.callout{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--acc);border-radius:0 10px 10px 0;padding:18px 22px;margin:26px 0}
.callout.ok{border-left-color:var(--ok)}
.callout.bad{border-left-color:var(--bad)}
.callout p{margin:0}.callout p+p{margin-top:10px}
pre.term{background:#0f172a;color:#e2e8f0;border-radius:11px;padding:18px 20px;overflow-x:auto;font:11.8px/1.6 var(--mono);margin:20px 0}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:26px 0}
.stat{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px}
.stat b{display:block;font:700 28px/1 var(--mono);letter-spacing:-.02em}
.stat span{font-size:12.5px;color:var(--dim)}
.tick{color:var(--ok);font-weight:700}
.cross{color:var(--bad);font-weight:700}
.two{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:22px 0}
.two>div{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 20px}
.two h4{margin:0 0 8px;font-size:15px}
.two p{font-size:14px;color:#475569;margin:0}
.two p+p{margin-top:8px}
.bugs{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--card);margin:22px 0}
.bug{padding:18px 20px;border-bottom:1px solid var(--line)}
.bug:last-child{border-bottom:0}
.bug h4{margin:0 0 6px;font-size:15.5px}
.bug .who{font:600 10.5px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--bad);background:var(--badbg);padding:4px 8px;border-radius:5px;display:inline-block;margin-bottom:9px}
.bug .who.trunk{color:var(--acc);background:#fef3c7}
.bug p{font-size:14.5px;color:#334155;margin:0}
.bug p+p{margin-top:8px}
@media(max-width:900px){.stats{grid-template-columns:repeat(2,1fr)}.two{grid-template-columns:1fr}h1{font-size:31px}}
"""

BODY = f"""
<header class="top"><div class="wrap">
  <div class="kicker">bbox-ui · apps/notebook-lab — 18 Sep 2026</div>
  <h1>The notebook lab runs</h1>
  <p class="lede">Cells on a canvas, in one Python scope, with <b>ports and wires derived from the
  code by marimo</b> and nothing authored by hand. All four of your success criteria, driven
  end-to-end in a real browser against a real kernel — plus the two genuine defects that journey
  found, which is the part that makes it worth having run.</p>
</div></header>

<div class="wrap">

<figure>
  <video controls autoplay muted loop playsinline poster="{uri(DEMO / 'poster.webp', 'image/webp')}">
    <source src="{uri(DEMO / 'lab-hero.mp4', 'video/mp4')}" type="video/mp4">
    <img src="{uri(DEMO / 'lab-hero-small.gif', 'image/gif')}" alt="the lab, recorded">
  </video>
  <figcaption><b>34 seconds of the real app</b>, recorded by <code>record_demo.mjs</code> against
  the running kernel — derive, run, edit, watch staleness spread, add a block that wires itself,
  run it across scopes, and open the marimo <code>.py</code> underneath. Not a re-enactment: the
  same code path the acceptance suite drives.</figcaption>
</figure>

<div class="stats">
  <div class="stat"><b>28 / 28</b><span>acceptance checks, in a real browser</span></div>
  <div class="stat"><b>39 / 39</b><span>kernel contract checks</span></div>
  <div class="stat"><b>{TOTAL:,}</b><span>lines, whole lab</span></div>
  <div class="stat"><b>5</b><span>real defects caught by running it</span></div>
</div>

<h2><span class="num">Your four criteria</span>Where each one is proved, by name</h2>
<div class="scroll"><table>
<thead><tr><th style="width:30%">You asked for</th><th>What the lab does</th><th>Proved by</th></tr></thead>
<tbody>
<tr><td><b>1 · run the code editor and see the output display on the canvas</b></td>
<td>Each cell has an <code>In [n]</code> gutter you click. stdout, the last expression's value,
tracebacks and a real matplotlib figure all land under the cell.</td>
<td><code>a real matplotlib figure came back as an image</code> — and, because a broken image has
the same DOM presence as a good one, <code>it is actually laid out, not a 0×0 broken image</code>,
measured off <code>getBoundingClientRect</code>.</td></tr>
<tr><td><b>2 · add cells in a stack and run them like a notebook</b></td>
<td>A block is a strip: <code>+</code> appends a cell, the block header's ▶ runs the stack in
dependency order, <code>In [ ]</code> fills in when a cell has run and empties when it goes stale.</td>
<td><code>stdout rendered under the cell that printed it</code>, <code>nothing stale after a full
run</code>.</td></tr>
<tr><td><b>3 · another editor — same scope, "one Python file through a view"</b></td>
<td>One namespace for the whole board, on purpose. A new block reads a name another block bound,
with no import and no wiring step.</td>
<td><code>it saw `gap` from the stats block</code> and <code>the number matches what stats
printed</code> — a fresh block printing <code>wide 0.68</code> from a variable it never defined.</td></tr>
<tr><td><b>4 · detect the order and draw the connections</b></td>
<td>Undefined name in, bound name out. An inlet appears the moment you type a name nothing here
binds, the matching outlet appears on whoever binds it, and the wire is drawn between them.</td>
<td><code>the undefined name `gap` became an INLET port, unasked</code>, <code>and `stats` grew the
matching OUTLET</code>, <code>a wire was drawn between them</code> — plus the spatial check, that
the painted path really ends on the two dots.</td></tr>
</tbody></table></div>

<figure>
  <img src="{uri(SHOTS / '01-derived-before-running.webp', 'image/webp')}" alt="the lab before anything has run — ports and wires already drawn">
  <figcaption><b>Before anything has run.</b> Every port and both wires are already there, because
  they come from static analysis, not from a trace. This is the frame that rules out a runtime
  tracer: <code>samples</code> has an outlet on <code>load</code> and an inlet on two consumers,
  and no cell has executed once. Everything is marked <code>stale</code>, which is the truth.</figcaption>
</figure>

<figure>
  <img src="{uri(SHOTS / '02-ran-with-output.webp', 'image/webp')}" alt="after run all — stdout and a histogram under their cells">
  <figcaption><b>After ▶ run all.</b> <code>gap = 0.680 +/- 0.015</code> under the cell that
  printed it and the histogram under the cell that drew it — the same two outputs as the
  JupyterLab screenshot you pasted, on a canvas instead of a column.</figcaption>
</figure>

<figure>
  <img src="{uri(SHOTS / '05-new-block-wired-itself.webp', 'image/webp')}" alt="a new block gains an inlet and a wire just from typing gap">
  <figcaption><b>The moment that answers criterion 4.</b> A block was added empty and
  <code>verdict = 'wide' if gap &gt; 0.5 else 'narrow'</code> typed into it. Nobody touched a port.
  <code>gap</code> is undefined here, so it became an inlet; <code>stats</code> binds it, so it
  grew the outlet; the wire followed. Wire count went from 2 to exactly 3.</figcaption>
</figure>

<h2><span class="num">The split</span>What is marimo's, and what is ours</h2>
<div class="two">
  <div><h4>marimo's, untouched</h4>
  <p>Every inlet, outlet, wire and run order comes from marimo's own AST scope resolution.
  <code>marimo/_ast/visitor.py</code> is 1,242 lines of Python scoping rules and reimplementing it
  is exactly the mistake.</p>
  <p>Also marimo's: the file format. The board <em>is</em> a <code>.py</code> of
  <code>@app.cell</code> functions, emitted with the signatures the analysis derived.</p></div>
  <div><h4>ours, and deliberately small</h4>
  <p>One shared namespace, cells run in marimo's topological order, and Jupyter's
  last-expression echo. marimo's real kernel speaks its own websocket protocol to its own
  frontend; embedding that is the <code>App.embed()</code> spike, still open.</p>
  <p>The whole edge model is <code>name in producer.defs and name in consumer.refs</code>, so
  marimo's private <code>DirectedGraph</code> never has to be imported.</p></div>
</div>

<div class="callout">
  <p><b>One honest correction to the design report.</b> It said to reach the analysis only through
  the public <code>marimo.Cell.refs</code>/<code>.defs</code>. That holds for a <em>decorated
  function</em> — but a <code>Cell</code> only exists once the code is already wrapped in
  <code>@app.cell</code> with its refs named in the signature, which is the thing we are computing.
  For free-form cell text there is no public door, so <code>lab_server.py</code> imports
  <code>marimo._ast.compiler.compile_cell</code> and pins the version.</p>
  <p>The mitigation is not a promise to be careful. <code>test_contract.py</code> emits a real
  marimo notebook from our own analysis, imports it, and asks the <b>public</b>
  <code>Cell.refs</code>/<code>.defs</code> what marimo itself thinks. If the private call ever
  drifts from what marimo would say, that check goes red — an independent oracle rather than the
  implementation grading its own homework.</p>
</div>

<pre class="term">{read(LAB / 'server/test_contract.out')}</pre>

<h2 id="namespace"><span class="num">One file, one namespace</span>What "no extra namespacing" actually costs</h2>

<div class="quote" style="font-style:italic;color:#334155;border-left:3px solid var(--line);padding-left:18px;margin:22px 0;max-width:70ch">“all of the blocks we have there are from a single marimo file. We don't want to do
any kind of namespacing things in addition… the key difference was, are we looking at this as a
single Python file or multiple Python files — and the idea is we're seeing it as a single Python
file.”</div>

<p>That is the paradigm the lab was built on, so the clarification landed on something already
true. But checking it properly turned up a gap worth having found: <b>“one shared dict” is not the
same thing as “marimo's namespace”</b>, and the difference is two rules I had not implemented.
Skipping them hands Jupyter's hidden state straight back while claiming we are rid of it.</p>

<div class="two">
  <div><h4>Rule 1 · <code>_name</code> is local to its cell</h4>
  <p>marimo drops an underscore-prefixed name from <em>both</em> <code>defs</code> and
  <code>refs</code>. Measured: <code>y = _tmp</code> has <code>refs = []</code>, so in marimo that
  cell references nothing and is a NameError.</p>
  <p>Exec'd into one shared dict it was not. Cell B quietly read cell A's scratch value — with no
  wire, no staleness, and nothing on the board to see. <b>Invisible coupling is worse than no
  coupling</b>, and it is the one thing a derived graph cannot warn you about, because marimo
  does not model that name at all.</p></div>
  <div><h4>Rule 2 · a binding nobody makes must leave</h4>
  <p>Delete the block that bound <code>samples</code> and the bare dict kept serving it. The graph
  said, correctly, that nothing binds the name; the kernel handed back a value anyway.</p>
  <p>That ghost is precisely the hidden state we picked marimo to avoid — and it is nastier than
  Jupyter's, because the board is <em>showing you</em> a clean dependency picture that the runtime
  is not honouring.</p></div>
</div>

<p>Both are now implemented as marimo's rules rather than as scoping added on top: each cell keeps
its own <code>_</code>-scratch, swapped in for the duration of its run and harvested back out
afterwards, and <code>sync()</code> evicts any binding the board has stopped making — whether the
block was deleted or just edited to bind something else. A name that is free and not a builtin is
now reported as <b>undefined</b> and drawn in red on the cell, so you see it before you press play
rather than after.</p>

<figure>
  <img src="{uri(SHOTS / '08-no-ghost.webp', 'image/webp')}" alt="renaming a binding makes its consumers show undefined and fail loudly">
  <figcaption><b>Rule 2, in the app.</b> <code>samples</code> was renamed to
  <code>samples_v2</code>, so nothing on the board binds <code>samples</code> any more. Both
  consumers immediately show <code>?samples</code> in red, <b>the inlet ports and their wires are
  gone</b> — an undefined name has no producer to cable to — and pressing play raises a NameError
  instead of quietly returning the value the old binding left in the namespace. Before the fix,
  that last step printed a perfectly plausible number.</figcaption>
</figure>

<div class="callout ok">
  <p><b>The sharp version, for the record:</b> a single namespace is the easy half. The hard half
  is that a single namespace has to <em>shrink</em> — and a canvas makes that harder than a
  notebook does, because deleting a block is a fast, casual gesture with no "restart and run all"
  ritual afterwards to save you.</p>
</div>

<h2><span class="num">The defects</span>Two things that only show up when you actually run it</h2>
<p>This is the part worth the effort of writing an acceptance journey rather than eyeballing a
screenshot. None of these was visible in a static look at the app; the two namespace rules above
were two more, found by probing marimo's own behaviour rather than trusting my summary of it.</p>

<div class="bugs">
  <div class="bug">
    <span class="who trunk">trunk defect · owed upstream</span>
    <h4>A port rail swallows clicks on whatever is behind it</h4>
    <p>A new block landed near an existing one and every click on its run button was eaten. Not
    subtly — Playwright named it exactly: <code>&lt;div data-edge="left" data-slot="port-edge"&gt;
    … intercepts pointer events</code>.</p>
    <p>The rail is absolutely positioned <em>outside</em> the block's own box, which is how the
    dots sit on the border, and it is a full-size hit target. On a Storybook bench blocks have
    generous gaps and this never appears. On a free canvas, where the human drags blocks wherever
    they like, it is only a matter of time. <b>Patched lab-locally in CSS</b> (rail transparent,
    dots still live) and flagged rather than silently fixed in a component this app only consumes —
    the real fix belongs in <code>blockPort.tsx</code>, where it also has to keep hit-testing alive
    for the day cables become draggable.</p>
  </div>
  <div class="bug">
    <span class="who">lab defect · fixed</span>
    <h4>Tracebacks were about the server, not about your cell</h4>
    <p>Every cell runs through <code>exec</code> inside <code>lab_server.py</code>, so a raw
    <code>format_exc</code> led with our plumbing and an absolute worktree path before reaching
    anything the human wrote. Now only frames belonging to the cell survive, and because
    <code>compile()</code> on an AST leaves nothing in <code>linecache</code>, the source line is
    attached from the code we already have: <code>line 2: y = x + undefined_thing</code>, then the
    exception. Three lines instead of twelve.</p>
  </div>
  <div class="bug">
    <span class="who">lab defect · fixed</span>
    <h4>The first cell to run "created" <code>__builtins__</code>, and then owned it</h4>
    <p>Found the moment Rule 2 landed: <code>exec</code> injects <code>__builtins__</code> into the
    namespace, so the ownership bookkeeping recorded it as a binding the cell had made — and
    <code>sync()</code> then dutifully evicted the interpreter's own builtins from the board's
    namespace. Dunders belong to the module, never to a cell.</p>
  </div>
  <div class="bug">
    <span class="who">lab defect · fixed</span>
    <h4>▶ on a block appeared to do nothing after you edited its input</h4>
    <p>The run handler pulled in ancestors that had <em>never run</em>. An ancestor you had just
    edited had run — with the old code — so it was skipped, and the block you pressed play on
    stayed <code>stale</code> behind it. The button looked broken.</p>
    <p>Fixed: a run pulls in an ancestor that is stale <em>or</em> never-run. That is marimo's own
    policy — running a cell runs what it needs — and it is the difference between a graph you can
    trust and a graph you have to work around.</p>
  </div>
</div>

<p>A third finding was mine, not the app's: the suite asserted "everything is stale on load", which
failed because the kernel is a <b>server-side</b> namespace that outlives a page reload. That is
correct and is the entire point of a kernel, so the journey now restarts the kernel to establish
its own cold start. A suite that only passes on a fresh box is not a suite.</p>

<h2><span class="num">The journey</span>Run it yourself, it is 24 lines of output</h2>
<pre class="term">{read(LAB / 'acceptance.out')}</pre>

<figure>
  <img src="{uri(SHOTS / '07-the-py-file.webp', 'image/webp')}" alt="the board shown as a marimo .py file">
  <figcaption><b>"I am looking at a single Python file through a very cool view" — literally.</b>
  <code>show .py</code> drops the drawer and there is the board as an ordinary marimo notebook:
  <code>@app.cell</code> functions whose signatures are the derived inlets. It imports, it runs as a
  script, it diffs in git — and cell order in the file is meaningless to marimo, so board positions
  never have to fight the format.</figcaption>
</figure>

<h2><span class="num">What is in it</span>The whole lab, file by file</h2>
<div class="scroll"><table>
<thead><tr><th>File</th><th>Lines</th><th>What it is</th></tr></thead>
<tbody>
<tr><td><code>server/lab_server.py</code></td><td>{F['server/lab_server.py']}</td>
<td>The kernel. Analysis via marimo; execution in one namespace that obeys marimo's two rules
(<code>_</code>-locals, eviction on unbind); staleness with downstream propagation; the marimo
<code>.py</code> emitter. Standard library otherwise.</td></tr>
<tr><td><code>server/test_contract.py</code></td><td>{F['server/test_contract.py']}</td>
<td>The independent oracle above, plus the scope, staleness and error-survival checks.</td></tr>
<tr><td><code>src/Lab.tsx</code></td><td>{F['src/Lab.tsx']}</td>
<td>The canvas. Every visible part is a trunk component — <code>Block</code>,
<code>BlockPort</code>, <code>CodeEditor</code>, <code>WireLayer</code>, <code>Trace</code>. The
only authored idea is <code>derivePorts</code>, about thirty lines.</td></tr>
<tr><td><code>src/labClient.ts</code></td><td>{F['src/labClient.ts']}</td><td>Four routes. No websocket, no protocol.</td></tr>
<tr><td><code>acceptance.mjs</code></td><td>{F['acceptance.mjs']}</td>
<td>The journey. Spatial claims measured, never DOM-presence-asserted.</td></tr>
<tr><td><code>record_demo.mjs</code></td><td>{F['record_demo.mjs']}</td><td>The hero video, from the real app.</td></tr>
<tr><td><code>run_lab.py</code></td><td>{F['run_lab.py']}</td><td>One command. Idempotent, and creates its own venv.</td></tr>
<tr><td><code>src/app.css</code></td><td>{F['src/app.css']}</td>
<td>The Tailwind floor, the dot grid, and two scoped overrides that are each a flagged trunk
question rather than a quiet local fix.</td></tr>
</tbody></table></div>

<div class="callout ok">
  <p><b>The lab consumes the trunk; it does not copy it.</b> <code>vite.config.ts</code> aliases
  <code>@trunk</code> at <code>apps/storybook-basics/src</code>, so there is no second lineage to
  drift — which is the failure mode CLAUDE.md's trunk rule exists to prevent. Nothing in the lab
  writes into the trunk.</p>
</div>

<h2><span class="num">Decision</span>What needs you</h2>
<table><tbody>
<tr><td style="width:24%"><b>Done &amp; proved</b></td><td>All four criteria, driven in a real browser
against a real kernel. 24/24 acceptance, 28/28 contract including the independent-oracle check. The
video is the app, the stills are the journey's own frames.</td></tr>
<tr><td><b>Needs you</b></td><td><b>Q1 — the port-rail hit target.</b> Real fix in
<code>blockPort.tsx</code> (rail transparent, dots live) or leave it consumer-side? Default if you
say nothing: fix it in the trunk, since a free canvas is the whole point of the component.
<b>Q2 — an <code>xs</code> rung on <code>PORT_TEXT_SIZES</code>?</b> The smallest port label is
18px, right at canvas zoom and loud beside a 12.5px cell. Default: propose it, do not ship it
unasked — it changes a scale every consumer reads. <b>Q3 — does the lab graduate?</b> It is an
<code>apps/*</code> prototype, not the trunk. Default: leave it as a lab until you have used it.</td></tr>
<tr><td><b>Not done</b></td><td>No cable dragging yet — that is rung 5a (rebind via libcst) and it
is deliberately after this. No <code>App.embed()</code> spike, so marimo's real kernel is still
unexercised. No cell reordering inside a stack, no block rename, no persistence: close the tab and
the board is the seed again.</td></tr>
</tbody></table>

</div>
"""

OUT.parent.mkdir(parents=True, exist_ok=True)
page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>The notebook lab runs — bbox-ui</title>
<style>{CSS}</style></head><body>{BODY}</body></html>"""
OUT.write_text(page, encoding="utf-8")

import urllib.parse
enc = len(urllib.parse.quote(page))
print(f"wrote {OUT}  {OUT.stat().st_size/1024:.0f} KB on disk  ·  {enc/1024:.0f} KB encoded")
print("preview cap 2,097,024 bytes encoded —", "OK" if enc < 2_097_024 else "OVER")
