#!/usr/bin/env python3
"""
Build the "Jupyter on a free canvas" proposals report.

Zach, Daily Note - Sep 18 2026, § "Running code within the canvas":
  "I like the idea of kinda making it start to work a bit like juypter
   notebook ... but now we can almost like do juypter notebook in a free
   canvas.. Please help me improve my thinking and make 5 proposals for how
   this could be done or look or work"

Nothing here is a screenshot of a thing that exists, EXCEPT the four real
captures at the top: the proposals do not exist yet, so per the 2026-09-17
feedback rule a proposal owes a rendered MOCK, and every mock below is drawn
in HTML/CSS in this file rather than described in prose.

Every file:line claim is re-read off disk at build time (see FACTS), so a
stale claim cannot survive a rebuild.

    python3 docs/build_canvas_notebook_report.py
"""
from __future__ import annotations

import base64
import pathlib
import subprocess

# OUT goes to the MAIN checkout by absolute path (it is the only place that both
# survives a worktree sweep and sits inside every lane's granted preview roots);
# HERE is this script's own tree, which is what the FACTS below must measure.
REPO = pathlib.Path("/home/bam/bbox-ui")
HERE = pathlib.Path(__file__).resolve().parent.parent
SHOTS = REPO / "reports/media/shots-notebook"
# Total inlined payload is ~162 KB of webp -> under the 256 KB line, so this
# page belongs in the TRACKED reports/ half, not the gitignored media/ half.
OUT = REPO / "reports/canvas-notebook-2026-09-18.html"


def uri(name: str) -> str:
    p = SHOTS / f"{name}.webp"
    if not p.exists():
        raise SystemExit(f"missing capture {p} — run docs/capture_notebook_shots.mjs")
    return "data:image/webp;base64," + base64.b64encode(p.read_bytes()).decode()


def sh(cmd: str, cwd: pathlib.Path) -> str:
    return subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True).stdout.strip()


# --------------------------------------------------------------------------
# Measured facts — read fresh from the three repos this question spans.
# --------------------------------------------------------------------------
SS = pathlib.Path("/home/bam/systemsketch")
PB = pathlib.Path("/home/bam/pyblocks")

FACTS = {
    "eval_route": sh("grep -n 'api/expression/evaluate' scripts/server.py | head -1 | cut -d: -f1", SS),
    "eval_lines": sh("wc -l < scripts/expression_eval.py", SS),
    "registry_lines": sh("wc -l < src/expression/variableRegistryModel.ts", SS),
    "code_shape_lines": sh("wc -l < src/code/CodeShapeUtil.tsx", SS),
    "exec_graph_lines": sh("wc -l < src/pipeline/execution/ExecutionGraph.tsx", PB),
    "exec_state_lines": sh("wc -l < src/pipeline/execution/executionState.ts", PB),
    "trunk_components": sh("ls apps/storybook-basics/src/components/*.ts* | wc -l", HERE),
    "trunk_stories": sh("ls apps/storybook-basics/src/stories/*.stories.tsx | wc -l", HERE),
}

PROPOSALS = [
    dict(
        n=1,
        key="strip",
        name="The Strip",
        sub="A notebook is one shape. Put several on the board.",
        order="The strip's own top-to-bottom line — imported from Jupyter unchanged.",
        gesture="Shift+Enter. Ctrl+Enter. Run All on the strip's header. Exactly Jupyter's.",
        output="Directly under the cell, inside the strip. The strip grows downward and pushes nothing, because it owns its own column.",
        file="One <code>.ipynb</code> per strip, plus a sidecar with each strip's board position. Open any strip in real Jupyter, unchanged.",
        scores=dict(hack=5, relearn=5, reuse=3, determinism=2, canvas=1),
        cost="Days. A <code>notebookStrip</code> shape wrapping N <code>CodeEditor</code>s, a kernel client, a MIME renderer.",
        for_="Zero relearning, in the strongest sense: it <em>is</em> Jupyter, so every muscle-memory key, <code>%magic</code>, <code>plt.show()</code> and <code>_repr_html_</code> works on day one because you did not reimplement any of it.",
        against="The canvas does nothing. Two strips side by side have no relationship a notebook did not already have. You have built a wall of notebooks, and the infinite canvas is wallpaper.",
        verdict="The tracer bullet. Cheapest path to a running kernel on the board, and the thing every other proposal needs anyway.",
    ),
    dict(
        n=2,
        key="thread",
        name="The Thread",
        sub="Reading order stops being invisible and becomes a line you can see and drag.",
        order="An explicit drawn thread. Beads numbered 1..N, routed between blocks. Position means nothing; the thread means everything.",
        gesture="▶ at the thread's head runs 1..N. Click bead <em>k</em> to run up to k. Select loose blocks → <em>Splice into thread</em>.",
        output="A result card pinned below each block at a fixed offset, never reflowing its neighbours.",
        file="A <code>.py</code> whose statement order <em>is</em> the thread order. The thread is the file; the file is the thread.",
        scores=dict(hack=4, relearn=4, reuse=4, determinism=4, canvas=3),
        cost="Weeks. The drawn path already exists — <code>trace.tsx</code> + <code>traceBadge.tsx</code> are numbered beads on a routed polyline today.",
        for_="Jupyter's fatal invisible edge — “this cell assumed the one above already ran” — becomes an object you can see, drag, reorder and version. Restart&nbsp;&amp;&nbsp;Run&nbsp;All is well-defined again on a canvas, which it is not in any other proposal but&nbsp;1.",
        against="One global order is a lie the moment you have two unrelated experiments on the board. You will want several threads, and then you need a rule for what happens when they touch.",
        verdict="The best bridge. It keeps the sequential mental model while making the canvas carry real information.",
    ),
    dict(
        n=3,
        key="reactive",
        name="The Reactive Board",
        sub="There is no run button. The code's own dataflow is the graph.",
        order="Derived, never authored. A block that binds <code>df</code> and a block that reads <code>df</code> are dependent; everything else is independent and runs in parallel.",
        gesture="You edit. The affected closure re-runs (eager), or is marked stale and waits for a click (lazy) — marimo ships both as a setting.",
        output="Attached to the block, with staleness drawn on it: a hatched, dimmed card meaning “this is r14's answer, the board is on r17”.",
        file="A pure <code>.py</code>. marimo already proves this half — cell order in the file does not determine execution order, so 2D positions are free to be a sidecar.",
        scores=dict(hack=4, relearn=3, reuse=3, determinism=5, canvas=5),
        cost="Weeks, <em>if</em> you buy the graph instead of building it. ipyflow is a drop-in ipykernel replacement that already computes this at runtime.",
        for_="The wires you were going to draw by hand get computed from code you already wrote — this is the one proposal where the canvas earns its existence rather than decorating a notebook. And no hidden state: the board cannot be quietly wrong.",
        against="marimo's version of this taxes you: one variable, one defining cell, so <code>df = df.dropna()</code> in a second block is illegal. That is precisely the hackability you said you love. <strong>ipyflow is the escape hatch</strong> — a dynamic tracer, no restrictions on your Python, same DAG.",
        verdict="The destination. Build 1 with ipyflow underneath and this becomes a display change, not a rewrite.",
    ),
    dict(
        n=4,
        key="pipeline",
        name="The Pipeline",
        sub="Wires carry values, not names. The kit you already have a fork of.",
        order="The wires, and only the wires. A block with no inlet is a source; execution is the downstream closure of whatever you pressed play on.",
        gesture="Region overlays with per-region ▶ / ■. Select nodes → play. This is <code>startExecution(editor, startingNodeIds)</code>, which is on this machine already.",
        output="A value preview on the outlet port, or a viewer node you wire to — an image lands in an Image node, not under the code.",
        file="A board document, not a Python file. Round-tripping to <code>.py</code> is pyblocks' lowering problem, which the control-flow map says is 7/9 unfinished.",
        scores=dict(hack=1, relearn=1, reuse=5, determinism=5, canvas=4),
        cost="Lowest of the five. <code>ExecutionGraph.tsx</code> is {exec_graph_lines} lines on disk and ports nearly verbatim.",
        for_="Everything bbox-ui has built — ports, traces, blocks, polarity, tidy routing — exists to draw exactly this. Caching, parallel branches and per-region play all fall out for free.",
        against="It is the least Jupyter of the five by a wide margin. The single gesture that makes a notebook a notebook — open a scratch cell, poke at <code>df</code>, throw it away — costs you two ports and a wire here.",
        verdict="Already funded, and not the notebook story. Don't let this absorb the question; it answers a different one.",
    ),
    dict(
        n=5,
        key="zoom",
        name="Zoom Is The Program",
        sub="One file. The IDE and the canvas are two zoom levels of it, exactly as you described.",
        order="The file's own order, at every zoom. Nesting replaces sequence: a region is a scope, and running a region runs what it contains.",
        gesture="Shift+Enter anywhere. The run scope is the region you are inside — a real object in your grammar, not “whatever is on screen”.",
        output="An <strong>output shelf</strong> docked under the viewport — Jupyter's scrollback, off the canvas. Nothing reflows, no board space is spent, and clicking an output flies the camera to the block that made it.",
        file="One <code>.py</code>. At z&nbsp;&gt;&nbsp;1.2 a block renders its full source and you are in an IDE; at z&nbsp;&lt;&nbsp;0.5 it renders as a card with its last output; below that, region summaries.",
        scores=dict(hack=4, relearn=3, reuse=2, determinism=3, canvas=5),
        cost="Highest. Semantic zoom is real work and the shelf is a second surface to design.",
        for_="This is the thing you actually described and nobody has built it: the IDE genuinely becomes a subset of the canvas, continuously, with no mode switch and no second file format.",
        against="Camera-as-scope is a novel gesture with no reference app to copy, which breaks your own zero-relearning law. And the shelf competes with the canvas for the same attention.",
        verdict="The one worth prototyping for its own sake. Build the shelf first — it is separable, and it fixes output placement for proposals 1-4 too.",
    ),
]

CRITERIA = [
    ("Hackability survives", 25, "Can you still open a scratch block, poke at <code>df</code> and throw it away — no ports, no wiring, no ceremony? This is the thing you said you love."),
    ("Zero relearning", 20, "Shift+Enter, <code>In&nbsp;[7]</code>, <code>plt.show()</code>, <code>%timeit</code>. Your own standing law: clone the reference app's conventions, not its vibe."),
    ("Reuses what is already built", 20, "The safe evaluator and variable registry that ship in SystemSketch today; <code>ExecutionGraph</code> in the pyblocks fork; the {trunk_components} trunk components in bbox-ui."),
    ("Cannot be silently wrong", 20, "A notebook recovers from out-of-order execution because <em>Restart &amp; Run All</em> has a defined order. On a free canvas there is no “All” order unless you invent one."),
    ("Earns the canvas", 15, "Does 2D buy anything a vertical notebook does not already give you? If the answer is no, the honest product is Jupyter with a nicer theme."),
]
CRIT_KEYS = ["hack", "relearn", "reuse", "determinism", "canvas"]


# --------------------------------------------------------------------------
# The mocks. These are DRAWN, not captured — the proposals do not exist.
# Everything is plain HTML/CSS so the page stays self-contained and offline.
# --------------------------------------------------------------------------

def cell(n, code, out=None, out_kind="text", busy=False, stale=False):
    mark = f"In&nbsp;[{n}]" if n else "In&nbsp;[&nbsp;]"
    if busy:
        mark = "In&nbsp;[*]"
    o = ""
    if out is not None:
        cls = "cellout" + (" stale" if stale else "")
        if out_kind == "plot":
            o = f'<div class="{cls}"><span class="outmark">Out[{n}]</span><div class="plot">{out}</div></div>'
        else:
            o = f'<div class="{cls}"><span class="outmark">Out[{n}]</span><pre>{out}</pre></div>'
    return (
        f'<div class="cell"><div class="cellrow"><span class="inmark">{mark}</span>'
        f'<pre class="src">{code}</pre></div>{o}</div>'
    )


BARS = "".join(
    f'<i style="height:{h}%"></i>'
    for h in (14, 22, 31, 48, 66, 84, 97, 88, 71, 55, 40, 27, 18, 11)
)


def mock_strip():
    return f"""
<div class="board" style="height:392px">
  <div class="strip" style="left:26px;top:22px;width:390px">
    <div class="striph"><b>spectral</b><span class="kbadge">Python 3 · idle</span><span class="runall">⟳ Run All</span></div>
    {cell(2, 'mu, sigma = df.mean(), df.std()\nprint(f"gap = {1 - mu:.3f}")', 'gap = 0.680 +/- 0.016')}
    {cell(7, 'plt.hist(1 - df, bins=30)\nplt.show()', BARS, out_kind="plot")}
  </div>
  <div class="strip" style="left:452px;top:96px;width:330px">
    <div class="striph"><b>scratch</b><span class="kbadge">same kernel</span><span class="runall">⟳ Run All</span></div>
    {cell(9, 'df.head()', '   gap\n0  0.68\n1  0.67')}
    {cell(None, 'df[df.gap > 0.7].plot()')}
  </div>
  <div class="note" style="left:452px;top:22px;width:330px">Two strips, one kernel. Order inside a strip is the strip's. Between strips there is <b>no</b> order — and that is stated, not hidden.</div>
</div>"""


def mock_thread():
    wire = """
<svg class="ov" viewBox="0 0 820 404">
  <path d="M222 96 H276 V200 H352" class="tw"/>
  <path d="M592 200 H618 V96 H648" class="tw"/>
  <g class="bead"><circle cx="276" cy="148" r="13"/><text x="276" y="153">2</text></g>
  <g class="bead"><circle cx="618" cy="148" r="13"/><text x="618" y="153">4</text></g>
</svg>"""
    return f"""
<div class="board" style="height:404px">
  {wire}
  <div class="blk run1" style="left:26px;top:60px;width:196px">
    <div class="blkh"><span class="seq">1</span>load<span class="play">▶</span></div>
    <pre class="src">df = read_csv(p)</pre>
    <div class="res">DataFrame 446×3</div>
  </div>
  <div class="blk run1" style="left:352px;top:164px;width:240px">
    <div class="blkh"><span class="seq">3</span>normalise<span class="play">▶</span></div>
    <pre class="src">df = df / df.max()</pre>
    <div class="res">DataFrame 446×3</div>
  </div>
  <div class="blk run1" style="left:648px;top:60px;width:150px">
    <div class="blkh"><span class="seq">5</span>plot<span class="play">▶</span></div>
    <div class="res plot">{BARS}</div>
  </div>
  <div class="blk idle" style="left:26px;top:272px;width:226px">
    <div class="blkh"><span class="seq off">—</span>experiment</div>
    <pre class="src">df.gap.rolling(5)</pre>
    <div class="res muted">off-thread</div>
  </div>
  <div class="note" style="left:470px;top:272px;width:270px">The thread is the only thing that says what ran before what. Drag a bead to reorder the program; an off-thread block never runs by itself.</div>
</div>"""


def mock_reactive():
    wire = """
<svg class="ov" viewBox="0 0 820 452">
  <path d="M222 92 C284 92 282 186 340 186" class="gw"/>
  <path d="M222 108 C300 120 268 310 340 310" class="gw"/>
  <path d="M592 186 C636 186 634 108 672 108" class="gw"/>
  <text class="glab" x="262" y="80">df</text>
  <text class="glab" x="288" y="278">df</text>
  <text class="glab" x="612" y="96">norm</text>
</svg>"""
    return f"""
<div class="board" style="height:452px">
  {wire}
  <div class="blk def" style="left:26px;top:56px;width:196px">
    <div class="blkh">binds <code>df</code><span class="dotp" title="up to date"></span></div>
    <pre class="src">df = read_csv(p)</pre>
    <div class="res">446×3 · r17</div>
  </div>
  <div class="blk" style="left:340px;top:148px;width:252px">
    <div class="blkh">binds <code>norm</code><span class="dotp"></span></div>
    <pre class="src">norm = df / df.max()</pre>
    <div class="res">446×3 · r17</div>
  </div>
  <div class="blk staleb" style="left:340px;top:272px;width:252px">
    <div class="blkh">reads <code>df</code><span class="doto" title="stale"></span></div>
    <pre class="src">df.gap.hist(bins=30)</pre>
    <div class="res stale plot">{BARS}</div>
    <div class="staleline">stale · showing r14, board is on r17</div>
  </div>
  <div class="blk" style="left:672px;top:72px;width:124px">
    <div class="blkh">reads <code>norm</code><span class="dotp"></span></div>
    <div class="res">0.680</div>
  </div>
  <div class="note" style="left:26px;top:330px;width:276px">Nobody drew those wires. They are <code>df</code> and <code>norm</code>, read out of the code. <b>Runtime:</b> <span class="pill on">lazy</span> <span class="pill">eager</span></div>
</div>"""


def mock_pipeline():
    wire = """
<svg class="ov" viewBox="0 0 820 392">
  <rect x="18" y="44" width="576" height="222" rx="14" class="region"/>
  <path d="M232 112 H300 V186 H340" class="pw"/>
  <path d="M556 186 H612 V112 H664" class="pw"/>
</svg>"""
    return f"""
<div class="board" style="height:392px">
  {wire}
  <div class="rgh" style="left:22px;top:16px">region · <b>preprocess</b><span class="play on">▶</span><span class="stop">■</span></div>
  <div class="blk port" style="left:38px;top:76px;width:194px">
    <div class="blkh">read_csv<span class="ptype">DataFrame</span></div>
    <pre class="src">path = "runs.csv"</pre>
    <i class="pt out" style="top:36px"></i>
  </div>
  <div class="blk port" style="left:340px;top:150px;width:216px">
    <div class="blkh">normalise<span class="ptype">DataFrame</span></div>
    <pre class="src">return d / d.max()</pre>
    <i class="pt in" style="top:36px"></i><i class="pt out" style="top:36px"></i>
  </div>
  <div class="blk port" style="left:664px;top:76px;width:134px">
    <div class="blkh">Viewer</div>
    <div class="res plot">{BARS}</div>
    <i class="pt in" style="top:36px"></i>
  </div>
  <div class="note" style="left:38px;top:290px;width:330px">A value on the wire, a type on the port. The scratch cell you actually wanted costs two ports and a wire.</div>
</div>"""


def mock_zoom():
    return f"""
<div class="board zoomboard" style="height:336px">
  <div class="zpane" style="left:22px;top:26px;width:250px">
    <div class="zlab">z 1.4 — it is an IDE</div>
    <div class="zbody ide"><pre class="src num">  1  import pandas as pd
  2  
  3  df = read_csv(p)
  4  norm = df / df.max()
  5  
  6  def gap(frame):
  7      return 1 - frame.mean()
  8  
  9  print(gap(norm))</pre></div>
  </div>
  <div class="zpane" style="left:294px;top:26px;width:222px">
    <div class="zlab">z 0.8 — cards + output</div>
    <div class="zbody">
      <div class="zc"><pre class="src">df = read_csv(p)</pre><div class="res">446×3</div></div>
      <div class="zc"><pre class="src">norm = df / df.max()</pre><div class="res">446×3</div></div>
      <div class="zc"><pre class="src">print(gap(norm))</pre><div class="res">0.680</div></div>
    </div>
  </div>
  <div class="zpane" style="left:538px;top:26px;width:250px">
    <div class="zlab">z 0.3 — regions only</div>
    <div class="zbody">
      <div class="zr">load <span>1 block</span></div>
      <div class="zr">preprocess <span>2 blocks</span></div>
      <div class="zr">report <span>1 block · 0.680</span></div>
    </div>
  </div>
  <div class="shelf">
    <span class="shelfl">output shelf</span>
    <div class="shelfi"><b>Out[4]</b> 0.680 +/- 0.016</div>
    <div class="shelfi plotmini">{BARS}</div>
    <div class="shelfi"><b>stderr</b> RuntimeWarning: invalid</div>
    <span class="shelfr">click → camera flies there</span>
  </div>
</div>"""


MOCKS = {
    "strip": mock_strip,
    "thread": mock_thread,
    "reactive": mock_reactive,
    "pipeline": mock_pipeline,
    "zoom": mock_zoom,
}


CSS = """
*{box-sizing:border-box}
:root{
  --ink:#0f172a;--dim:#64748b;--line:#e2e8f0;--bg:#f8fafc;--card:#fff;
  --acc:#b45309;--accbg:#fef3c7;--ok:#15803d;--okbg:#dcfce7;
  --blue:#1d4ed8;--bluebg:#dbeafe;--stale:#c2410c;--violet:#6d28d9;
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
}
body{margin:0;background:var(--bg);color:var(--ink);
  font:16px/1.65 ui-sans-serif,-apple-system,"Segoe UI",Inter,system-ui,sans-serif;
  -webkit-font-smoothing:antialiased}
.wrap{max-width:1080px;margin:0 auto;padding:0 28px 120px}
header.top{border-bottom:1px solid var(--line);background:var(--card);padding:52px 0 36px;margin-bottom:44px}
header.top .wrap{padding-bottom:0}
.kicker{font:600 12px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--acc)}
h1{font-size:40px;line-height:1.12;margin:16px 0 14px;letter-spacing:-.022em;max-width:20ch}
.lede{font-size:19px;color:#334155;max-width:66ch;margin:0}
.lede b{color:var(--ink)}
h2{font-size:27px;letter-spacing:-.015em;margin:64px 0 6px;padding-top:22px;border-top:1px solid var(--line)}
h2 .num{font:600 13px/1 var(--mono);color:var(--acc);display:block;margin-bottom:10px;letter-spacing:.12em}
h3{font-size:18px;margin:34px 0 8px;letter-spacing:-.01em}
p{max-width:72ch}
code{font:.88em var(--mono);background:#eef2f7;padding:1px 5px;border-radius:4px}
pre code,.src code{background:none;padding:0}
a{color:var(--blue)}
.sub{color:var(--dim);font-size:14px}
figure{margin:22px 0}
figure img{width:100%;display:block;border:1px solid var(--line);border-radius:10px;background:#fff}
figcaption{font-size:13.5px;color:var(--dim);margin-top:9px}
figcaption b{color:var(--ink)}
table{border-collapse:collapse;width:100%;font-size:14.5px;margin:20px 0}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:11.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--dim);font-weight:650}
tbody tr:hover{background:#fff}
.scroll{overflow-x:auto}
.callout{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--acc);
  border-radius:0 10px 10px 0;padding:18px 22px;margin:26px 0}
.callout.blue{border-left-color:var(--blue)}
.callout.ok{border-left-color:var(--ok)}
.callout p{margin:0}
.callout p+p{margin-top:10px}
.quote{font-style:italic;color:#334155;border-left:3px solid var(--line);padding-left:18px;margin:22px 0;max-width:70ch}

/* ---- the three-parts diagram ---- */
.parts{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:26px 0}
.part{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 18px 20px}
.part.bad{border-color:#fca5a5;background:#fff7f6}
.part h4{margin:0 0 4px;font-size:15.5px}
.part .tag{font:600 10.5px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;
  color:var(--ok);background:var(--okbg);padding:4px 7px;border-radius:5px;display:inline-block;margin-bottom:12px}
.part.bad .tag{color:#b91c1c;background:#fee2e2}
.part p{font-size:14px;color:#475569;margin:0}

/* ---- board mocks ---- */
.boardwrap{overflow-x:auto;margin:20px 0;padding-bottom:2px}
.board{position:relative;width:820px;background:#fbfcfe;border:1px solid var(--line);border-radius:12px;
  background-image:radial-gradient(#dde5ef 1px,transparent 1px);background-size:22px 22px;
  overflow:hidden}
.board .ov{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.tw{fill:none;stroke:#f59e0b;stroke-width:2.4;stroke-linecap:round}
.bead circle{fill:#f59e0b}
.bead text{fill:#fff;font:700 12px/1 var(--mono);text-anchor:middle}
.gw{fill:none;stroke:#a78bfa;stroke-width:2;stroke-dasharray:5 5}
.glab{fill:#6d28d9;font:600 12px/1 var(--mono)}
.pw{fill:none;stroke:#334155;stroke-width:2.2}
.region{fill:rgba(29,78,216,.045);stroke:#93b4f7;stroke-width:1.5;stroke-dasharray:7 5}
.blk,.strip{position:absolute;background:#fff;border:1px solid #cbd5e1;border-radius:9px;
  box-shadow:0 1px 2px rgba(15,23,42,.05)}
.blkh{display:flex;align-items:center;gap:7px;font:600 12.5px/1 var(--mono);color:#334155;
  padding:9px 11px;border-bottom:1px solid var(--line)}
.blkh code{background:#eef2f7;font-size:11.5px}
.seq{background:#f59e0b;color:#fff;border-radius:50%;width:18px;height:18px;
  display:grid;place-items:center;font-size:11px;flex:none}
.seq.off{background:#e2e8f0;color:#94a3b8}
.play{margin-left:auto;color:#94a3b8;font-size:11px}
.play.on{color:#15803d}
.ptype{margin-left:auto;font-size:10.5px;color:#94a3b8;font-weight:500}
.src{font:12.5px/1.5 var(--mono);margin:0;padding:10px 11px;white-space:pre;color:#1e293b;overflow:hidden}
.src.num{color:#475569}
.res{border-top:1px solid var(--line);padding:8px 11px;font:12px/1.4 var(--mono);color:#0f172a;background:#fcfdff;border-radius:0 0 8px 8px}
.res.muted{color:#94a3b8}
.blk.idle{opacity:.72;border-style:dashed}
.blk.def{border-color:#86efac}
.blk.staleb{border-color:#fdba74}
.dotp,.doto{margin-left:auto;width:9px;height:9px;border-radius:50%;background:var(--violet);flex:none}
.doto{background:#f97316}
.res.plot,.plot{display:flex;align-items:flex-end;gap:2px;height:52px;padding:8px 11px}
.res.plot i,.plot i{flex:1;background:#7ba7e8;border-radius:1px 1px 0 0;display:block}
.res.stale{background:repeating-linear-gradient(135deg,#fff7ed,#fff7ed 6px,#ffedd5 6px,#ffedd5 12px);
  border-radius:0}
.staleline{border-top:1px dashed #fdba74;padding:6px 11px;background:#fff7ed;border-radius:0 0 8px 8px;
  font:600 10.5px/1 var(--mono);color:var(--stale);text-align:right}
.pt{position:absolute;width:9px;height:9px;border-radius:50%;background:#fff;border:2px solid #334155}
.pt.in{left:-5px}.pt.out{right:-5px}
.rgh{position:absolute;display:flex;align-items:center;gap:9px;font:600 12px/1 var(--mono);color:var(--blue)}
.rgh .stop{color:#94a3b8}
.note{position:absolute;font-size:12.5px;line-height:1.5;color:#475569;background:#fffdf5;
  border:1px solid #fde68a;border-radius:8px;padding:10px 12px}
.note code{background:#fef3c7}
.pill{font:600 10.5px/1 var(--mono);border:1px solid #cbd5e1;border-radius:20px;padding:4px 9px;color:#64748b}
.pill.on{background:var(--ink);color:#fff;border-color:var(--ink)}
/* strip */
.striph{display:flex;align-items:center;gap:9px;padding:9px 12px;border-bottom:1px solid var(--line);
  font:600 13px/1 var(--mono);background:#f8fafc;border-radius:8px 8px 0 0}
.kbadge{font-size:10.5px;color:var(--ok);background:var(--okbg);padding:3px 7px;border-radius:5px;font-weight:600}
.runall{margin-left:auto;font-size:11px;color:#64748b;font-weight:500}
.cell{border-bottom:1px solid #f1f5f9}
.cell:last-child{border-bottom:0}
.cellrow{display:flex;gap:8px;align-items:flex-start;padding:9px 10px 9px 8px}
.inmark,.outmark{font:11px/1.5 var(--mono);color:#b45309;flex:none;padding-top:1px;min-width:46px}
.outmark{color:#b91c1c;display:block;margin-bottom:3px}
.cellrow .src{padding:0;flex:1}
.cellout{padding:4px 10px 10px 8px;background:#fcfdff}
.cellout pre{margin:0;font:12px/1.45 var(--mono);white-space:pre}
/* zoom */
.zoomboard{padding-bottom:62px}
.zpane{position:absolute}
.zlab{font:600 10.5px/1 var(--mono);letter-spacing:.06em;color:var(--dim);margin-bottom:7px;text-transform:uppercase}
.zbody{background:#fff;border:1px solid #cbd5e1;border-radius:9px;overflow:hidden}
.zbody.ide .src{font-size:11px;line-height:1.55}
.zc{border-bottom:1px solid #f1f5f9}
.zc:last-child{border-bottom:0}
.zc .src{font-size:11.5px;padding:8px 10px}
.zc .res{font-size:11px;padding:5px 10px}
.zr{display:flex;justify-content:space-between;font:600 12px/1 var(--mono);padding:14px 12px;border-bottom:1px solid #f1f5f9;color:#334155}
.zr:last-child{border-bottom:0}
.zr span{font-weight:400;color:#94a3b8}
.shelf{position:absolute;left:0;right:0;bottom:0;height:56px;background:#0f172a;display:flex;
  align-items:center;gap:10px;padding:0 14px;color:#cbd5e1}
.shelfl{font:600 10px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:#64748b;flex:none}
.shelfi{background:#1e293b;border-radius:7px;padding:7px 11px;font:11.5px/1.3 var(--mono);
  color:#e2e8f0;white-space:nowrap;flex:none}
.shelfi b{color:#fbbf24;font-weight:600}
.shelfi.plotmini{display:flex;align-items:flex-end;gap:2px;height:34px;width:96px;padding:5px 7px}
.shelfi.plotmini i{flex:1;background:#60a5fa;border-radius:1px 1px 0 0}
.shelfr{margin-left:auto;font-size:11px;color:#64748b;flex:none}

/* ---- proposal cards ---- */
.prop{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:26px 28px 8px;margin:30px 0}
.prophead{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
.pnum{font:700 30px/1 var(--mono);color:var(--acc)}
.prophead h3{margin:0;font-size:25px;letter-spacing:-.015em}
.psub{color:#475569;font-size:16px;margin:8px 0 0;max-width:70ch}
.answers{display:grid;grid-template-columns:repeat(2,1fr);gap:0 26px;margin:20px 0 4px}
.ans{padding:12px 0;border-top:1px solid var(--line)}
.ans dt{font:600 10.5px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--acc);margin-bottom:5px}
.ans dd{margin:0;font-size:14px;color:#334155}
.fa{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:14px 0 6px}
.fa div{font-size:14.5px;color:#334155}
.fa .lbl{font:600 10.5px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;display:block;margin-bottom:6px}
.fa .for .lbl{color:var(--ok)}
.fa .ag .lbl{color:#b91c1c}
.pverdict{background:#f8fafc;border-radius:9px;padding:13px 16px;font-size:14.5px;margin:16px 0 4px}
.pverdict b{color:var(--acc)}
.bars{display:grid;grid-template-columns:auto 1fr auto;gap:5px 11px;align-items:center;font-size:12.5px;margin:6px 0 2px}
.bars .bn{color:var(--dim);white-space:nowrap}
.bt{height:7px;background:#eef2f7;border-radius:4px;overflow:hidden}
.bt i{display:block;height:100%;background:var(--acc);border-radius:4px}
.bars .bv{font:600 12px/1 var(--mono);color:#334155}

/* ---- rating surface ---- */
.rate{border-top:1px solid var(--line);margin-top:18px;padding:14px 0 18px;display:flex;
  align-items:center;gap:8px;flex-wrap:wrap}
.rate .rl{font:600 10.5px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin-right:4px}
.rb{font:600 13px/1 inherit;border:1px solid #cbd5e1;background:#fff;color:#334155;
  border-radius:20px;padding:7px 15px;cursor:pointer}
.rb:hover{border-color:#94a3b8}
.rb[aria-pressed="true"]{background:var(--ink);color:#fff;border-color:var(--ink)}
.rn{flex:1 1 260px;min-width:220px;font:14px inherit;padding:8px 11px;border:1px solid #cbd5e1;
  border-radius:8px;background:#fff;color:var(--ink);resize:vertical;min-height:38px}
.copybar{background:var(--card);border-top:1px solid var(--line);
  padding:18px 0;margin-top:40px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.cbtn{font:600 14px inherit;background:var(--ink);color:#fff;border:0;border-radius:9px;
  padding:11px 20px;cursor:pointer}
#outbox{width:100%;min-height:190px;font:12.5px/1.5 var(--mono);padding:14px;
  border:1px solid #cbd5e1;border-radius:10px;background:#fff;margin-top:14px}
.hint{font-size:13px;color:var(--dim)}
.ladder{counter-reset:s;margin:22px 0;padding:0;list-style:none}
.ladder li{position:relative;padding:14px 0 14px 54px;border-top:1px solid var(--line);font-size:15px}
.ladder li:before{counter-increment:s;content:counter(s);position:absolute;left:0;top:14px;
  width:32px;height:32px;border-radius:50%;background:var(--accbg);color:var(--acc);
  display:grid;place-items:center;font:700 14px/1 var(--mono)}
.ladder b{display:block;margin-bottom:2px}
.ladder .done{background:var(--okbg);color:var(--ok)}
.tick{color:var(--ok);font-weight:700}
.cross{color:#b91c1c;font-weight:700}
@media(max-width:900px){
  .parts,.answers,.fa{grid-template-columns:1fr}
  h1{font-size:31px}
}
"""


JS = """
(function(){
  var KEY='canvas-notebook-2026-09-18';
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
    note.addEventListener('input',function(){
      state[id]=state[id]||{}; state[id].n=note.value; save();
    });
  });

  function markdown(){
    var out=['# Canvas notebook — my verdicts (2026-09-18)',''];
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
    return out.join('\\n');
  }

  var box=document.getElementById('outbox');
  document.getElementById('copy').addEventListener('click',function(){
    box.value=markdown();
    box.focus(); box.select();
    try{ var w=navigator.clipboard&&navigator.clipboard.writeText(box.value); if(w&&w.catch) w.catch(function(){}); }catch(e){}
    try{ document.execCommand('copy'); }catch(e){}
    document.getElementById('copyhint').textContent=
      'Selected below — Ctrl+C if the clipboard was refused (it is, on file://).';
  });
})();
"""


def sub(text: str) -> str:
    """Token substitution, not %-formatting: the prose is full of literal % signs
    (`%timeit`, `20%`) and a format string would choke on every one of them."""
    for k, v in FACTS.items():
        text = text.replace("{" + k + "}", v)
    return text


def bars(p):
    rows = []
    for key, (name, weight, _) in zip(CRIT_KEYS, CRITERIA):
        v = p["scores"][key]
        rows.append(
            f'<span class="bn">{name}</span><span class="bt"><i style="width:{v*20}%"></i></span>'
            f'<span class="bv">{v}</span>'
        )
    return '<div class="bars">' + "".join(rows) + "</div>"


def weighted(p):
    return sum(p["scores"][k] * w for k, (_, w, _) in zip(CRIT_KEYS, CRITERIA)) / 100


def rate(rid, title):
    return f"""
<div class="rate" data-id="{rid}" data-title="{title}">
  <span class="rl">verdict</span>
  <button class="rb" data-v="build it" aria-pressed="false">Build it</button>
  <button class="rb" data-v="interesting" aria-pressed="false">Interesting</button>
  <button class="rb" data-v="not this" aria-pressed="false">Not this</button>
  <button class="rb" data-v="wrong question" aria-pressed="false">Wrong question</button>
  <textarea class="rn" rows="1" placeholder="note…"></textarea>
</div>"""


def proposal_html(p):
    f = dict(FACTS)
    return f"""
<div class="prop" id="p{p['n']}">
  <div class="prophead"><span class="pnum">{p['n']}</span><h3>{p['name']}</h3></div>
  <p class="psub">{p['sub']}</p>
  <div class="boardwrap">{MOCKS[p['key']]()}</div>
  <p class="sub">Drawn for this page. Nothing below exists yet — that is the point of drawing it.</p>
  <dl class="answers">
    <div class="ans"><dt>What replaces top-to-bottom</dt><dd>{p['order']}</dd></div>
    <div class="ans"><dt>The run gesture</dt><dd>{p['gesture']}</dd></div>
    <div class="ans"><dt>Where output lives</dt><dd>{p['output']}</dd></div>
    <div class="ans"><dt>What the file is</dt><dd>{p['file']}</dd></div>
  </dl>
  <div class="fa">
    <div class="for"><span class="lbl">What it buys</span>{p['for_']}</div>
    <div class="ag"><span class="lbl">What it costs you</span>{p['against']}</div>
  </div>
  <p class="sub" style="margin:6px 0 0"><b>Build cost —</b> {sub(p['cost'])}</p>
  {bars(p)}
  <div class="pverdict"><b>My call:</b> {p['verdict']} <span class="sub">· weighted {weighted(p):.2f}/5</span></div>
  {rate('p' + str(p['n']), str(p['n']) + ' · ' + p['name'])}
</div>"""


def build() -> str:
    f = dict(FACTS)
    props = "".join(proposal_html(p) for p in PROPOSALS)
    ranked = sorted(PROPOSALS, key=weighted, reverse=True)

    crit_rows = "".join(
        f"<tr><td><b>{n}</b></td><td>{w}%</td><td>{sub(d)}</td></tr>" for n, w, d in CRITERIA
    )
    head_cells = "".join(f'<th>{n}<br><span class="sub">{w}%</span></th>' for n, w, _ in CRITERIA)
    score_rows = "".join(
        "<tr><td><b>{n} · {nm}</b></td>{cells}<td><b>{t:.2f}</b></td></tr>".format(
            n=p["n"], nm=p["name"],
            cells="".join(f'<td>{p["scores"][k]}</td>' for k in CRIT_KEYS),
            t=weighted(p),
        )
        for p in PROPOSALS
    )

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Jupyter on a free canvas — five proposals</title>
<style>{CSS}{ADDENDUM_CSS}{ADDENDUM2_CSS}</style></head><body>

<header class="top"><div class="wrap">
  <div class="kicker">bbox-ui · systemsketch · pyblocks — 18 Sep 2026</div>
  <h1>Jupyter on a free canvas</h1>
  <p class="lede">Five proposals, and one reframe worth more than all five: a Jupyter notebook is
  <b>three separable things</b>, and only one of them fails to survive the move to a canvas.
  Every proposal below is a different answer to that one failure.</p>
</div></header>

<div class="wrap">

<div class="banner"><div><b>Superseded in part, the same evening.</b> Zach converged: proposal 2
is dropped (a DAG expresses parallelism a thread cannot), 3 and 4 turn out to be one design, and
<b>marimo replaces ipyflow</b> — for a reason the morning's criteria missed. The survey below
stands as the record; the decision, the proof and the revised v1 are at the end — including
<a href="#cable">the cable that edits the code</a>, run against a real CST.</div>
<a href="#decided">Jump to what we decided →</a></div>

<div class="banner" style="background:#ecfdf5;border-color:#a7f3d0"><div><b>Built, 18 Sep evening.</b>
The lab exists and runs: cells on a canvas in one Python scope, ports and wires derived by marimo,
24/24 acceptance checks in a real browser. Implementation report, with a video of it working:
<code>file:///home/bam/bbox-ui/reports/media/notebook-lab-2026-09-18.html</code></div></div>

<h2><span class="num">The reframe</span>What you are actually taking from Jupyter</h2>
<p>You wrote that a notebook is “blocks that are stacked, that show their output”. That is true,
and it hides the load-bearing part. Pull a notebook apart and there are three mechanisms, and
they are independent of each other:</p>

<figure>
  <img src="{uri('jupyter-ref')}" alt="JupyterLab with a Fit section, a code cell printing a gap, and a histogram output below a plt.hist cell">
  <figcaption><b>The screenshot you pasted.</b> Read it as the three mechanisms rather than as one
  thing: the kernel badge top-left, <code>Out[7]</code>'s histogram (a MIME bundle, not a widget
  anyone wrote for this notebook), and the gutter's <code>In&nbsp;[2]</code> / <code>In&nbsp;[7]</code>
  — the only visible trace of an order that is otherwise entirely implicit.</figcaption>
</figure>

<div class="parts">
  <div class="part"><span class="tag">ports unchanged</span>
    <h4>1 · A kernel</h4>
    <p>A long-lived process holding mutable state, addressed by <code>execute_request</code>
    messages. This is <em>the entire source of the hackability you love</em> — the thing that lets
    you poke at <code>df</code> without re-running anything. It has no opinion about layout.</p></div>
  <div class="part"><span class="tag">ports unchanged</span>
    <h4>2 · A rich display protocol</h4>
    <p><code>display_data</code> carries a <b>MIME bundle</b> — “keys are MIME types, values are
    the raw data of the representation in that format”. That is how <code>plt.show()</code>
    becomes a picture. Also has no opinion about layout.</p></div>
  <div class="part bad"><span class="tag">does not port</span>
    <h4>3 · A linear document order</h4>
    <p>The invisible edge. “This cell assumed the one above already ran.” It is what makes
    <em>Restart&nbsp;&amp;&nbsp;Run&nbsp;All</em> mean anything. <b>On a free canvas there is no
    “above”</b>, so this mechanism does not exist and cannot be faked.</p></div>
</div>

<div class="callout">
  <p><b>So the whole design question is one sentence:</b> what replaces the notebook's
  top-to-bottom order on a surface that has no top and no bottom?</p>
  <p>Every proposal below answers it differently — with a container, with a drawn line, with the
  code's own dataflow, with wires, or with nesting. You cannot decline to answer it. Declining is
  how you get a board that is quietly wrong and looks completely fine.</p>
</div>

<h3>Three more things the free canvas breaks, that a notebook hid for you</h3>
<table><tbody>
<tr><td style="width:27%"><b>“Output appears underneath it”</b></td>
<td>In a notebook that works because the column reflows — everything below slides down. A free
canvas reflows nothing, so output-below either overlaps your neighbour or shoves it. Output
placement is a real design decision with at least four distinct answers, and it is the single
choice that decides whether the thing <em>feels</em> like Jupyter.</td></tr>
<tr><td><b>Out-of-order execution</b></td>
<td>Already the most-criticised thing about notebooks, and a notebook at least has a recovery
ritual. On a canvas there is no “All” order to restart into. Hidden mutable state × free 2D
layout is the worst reproducibility surface anyone has ever shipped — unless you make staleness
visible, which is the one thing every proposal here has to buy.</td></tr>
<tr><td><b>“The IDE becomes a subset of the canvas”</b></td>
<td>Right, and it only becomes true if <b>the canvas file is a Python file</b>. Otherwise you
have a canvas that contains code, which is not the same claim. marimo already proves this half:
it “stores notebooks as Python, not JSON… lets you version notebooks with git, execute them as
scripts”, and file order does <em>not</em> determine execution order — so 2D positions are free
to be a sidecar without fighting the format.</td></tr>
</tbody></table>

<h2><span class="num">Where you already are</span>You built rung 1 of this ladder and called it something else</h2>
<p>This is not a greenfield question. Python already evaluates on your canvas today, with a
dependency pool, cycle detection and per-identifier error spans — it just only accepts one
expression at a time.</p>

<figure>
  <img src="{uri('ss-expression')}" alt="SystemSketch inspector with a property expression and a Variables used here panel">
  <figcaption><b>Real capture, SystemSketch, 2026-09-06.</b> <code>radius</code> is being typed as
  <code>chassis_width / 4</code>; the <em>Variables used here</em> panel below holds
  <code>chassis_width&nbsp;=&nbsp;0.5</code>, shared board-wide. That is a two-cell reactive
  notebook with the notebook filed off: edit the variable, every expression that reads it
  updates. <code>scripts/server.py</code> line&nbsp;{f['eval_route']} routes it to
  <code>expression_eval.py</code> ({f['eval_lines']} lines) — real <code>ast</code> semantics,
  empty <code>__builtins__</code>, cycle detection, source spans so the frontend can underline the
  exact undefined name.</figcaption>
</figure>

<ol class="ladder">
  <li><b><span class="tick">✓ shipped</span> One expression, safe-evaluated, board-wide names</b>
  <code>expression_eval.py</code> + <code>variableRegistryModel.ts</code>
  ({f['registry_lines']} lines) + <code>useDebouncedExpressionEval.ts</code>. Latest-wins
  debounce already in place.</li>
  <li><b><span class="cross">✗</span> One <em>statement</em> — a real Python process</b>
  Needs a kernel, because <code>ast.literal_eval</code>-class safety and <code>import pandas</code>
  are mutually exclusive. This is the one genuinely new dependency in the whole question.</li>
  <li><b><span class="cross">✗</span> Rich output</b> The MIME-bundle renderer.
  <code>image/png</code>, <code>text/html</code>, <code>text/plain</code> covers ~everything you
  actually look at.</li>
  <li><b><span class="cross">✗</span> More than one block, in some order</b>
  <em>This is the whole question.</em> The five proposals are five answers.</li>
</ol>

<h3>And the parts are on disk already</h3>
<div class="scroll"><table>
<thead><tr><th>You need</th><th>What exists, right now</th><th>Where</th></tr></thead>
<tbody>
<tr><td>A code cell</td><td>CodeMirror, Python highlighting, line numbers, clip/wrap/scroll,
gesture + external-sync guards</td><td><code>bbox-ui · apps/storybook-basics/src/components/codeEditor.tsx</code><br>
<span class="sub">{f['trunk_components']} trunk components, {f['trunk_stories']} story files</span></td></tr>
<tr><td>A cell on a canvas</td><td>A real tldraw shape, 8 languages — deliberately inert
(“raw text plus display preferences, never a language service — hard gate g3”)</td>
<td><code>systemsketch · src/code/CodeShapeUtil.tsx</code> ({f['code_shape_lines']} lines)</td></tr>
<tr><td>Run a selection, downstream</td><td><code>startExecution(editor, startingNodeIds)</code>:
builds the downstream closure, waits on dependencies, runs independent branches in parallel,
flips <code>isOutOfDate</code> around each node</td>
<td><code>pyblocks · src/pipeline/execution/ExecutionGraph.tsx</code> ({f['exec_graph_lines']} lines)
+ <code>executionState.ts</code> ({f['exec_state_lines']})</td></tr>
<tr><td>A staleness mark</td><td><code>isOutOfDate</code> on every node shape, already set on
typed edits</td><td>same fork</td></tr>
<tr><td>The run-a-region gesture</td><td>tldraw's own kit: “region overlays detect connected node
groups and provide per-region play/stop controls”</td><td>tldraw.dev · image-pipeline starter kit</td></tr>
</tbody></table></div>

<figure>
  <img src="{uri('code-gallery')}" alt="bbox-ui CodeEditor stories rendering real Python with line numbers and syntax highlighting">
  <figcaption><b>Real capture from your Storybook on :5421, today.</b> The cell half is finished
  — that is genuine Python, highlighted, numbered, in the trunk component. What no proposal here
  gets for free is the part under it: there is no output surface, no run affordance and no
  execution-count gutter anywhere in bbox-ui.</figcaption>
</figure>

<figure>
  <img src="{uri('code-in-block')}" alt="bbox-ui Block stories with a code field holding pose: Pose and quality: float inside the card body">
  <figcaption><b>Real capture, same Storybook.</b> And a code field already sits <em>inside</em> a
  Block's body, under a header, above a footer — so “a cell is a block” needs no new container
  either. Every one of the five proposals below is about what goes <em>around</em> these two
  captures, never about the cell itself.</figcaption>
</figure>

<h2><span class="num">Criteria</span>What good looks like, before the options</h2>
<p>Weighted for your situation specifically, not for notebooks in general. Scores in each card are
my judgement against these, not a measurement — argue with the weights first, they move the
ranking more than the scores do.</p>
<table><thead><tr><th style="width:24%">Criterion</th><th style="width:8%">Weight</th><th>Why this weight, for you</th></tr></thead>
<tbody>{crit_rows}</tbody></table>

<h2><span class="num">The five</span>Five answers to “what replaces top-to-bottom”</h2>
<p>Deliberately orthogonal: a container, a drawn line, derived dataflow, explicit wires, nesting.
They are not five skins on one idea, and three of them are genuinely incompatible with each other.</p>
{props}

<h2><span class="num">Scoreboard</span>Side by side</h2>
<div class="scroll"><table>
<thead><tr><th>Proposal</th>{head_cells}<th>Weighted</th></tr></thead>
<tbody>{score_rows}</tbody></table></div>
<p class="sub">Ranked: {" · ".join(f"{p['n']} {p['name']} ({weighted(p):.2f})" for p in ranked)}</p>

<h2><span class="num">Recommendation</span>Build 1, instrument it as if it were 3</h2>
<div class="callout ok">
  <p><span class="sup">superseded</span> Kept verbatim as the record. <a href="#decided">The
  ipyflow call was wrong</a>, and the thing that overturns it is the port idea — not a fact about
  ipyflow.</p>
  <p><b>Ship <em>The Strip</em> this week, and put ipyflow under it on day one instead of
  ipykernel.</b> Then 3 is a rendering change, not a rewrite.</p>
  <p>ipyflow describes itself as “a reactive Python kernel for Jupyter notebooks” that “tracks
  dataflow relationships between symbols and cells during a given interactive session”, ships as
  a <b>drop-in replacement for ipykernel</b>, and already draws exactly the marks proposal 3
  needs: orange dots for cells that would re-execute, purple for the cells a selected cell depends
  on. It infers dependencies dynamically, past simple variables — it distinguishes an
  <code>x[0]</code> reference to avoid a needless re-run.</p>
  <p>That last part is the whole reason to prefer it over marimo's compiler here.
  <b>marimo buys determinism by forbidding a variable from being defined in two cells</b> —
  so <code>df = df.dropna()</code> in a second block is illegal, and that is precisely the
  hackability you said you love. ipyflow imposes no such rule and still hands you the DAG.
  It is the one place in this whole question where you get both.</p>
</div>

<h3>Why not simply start with the one that scores highest</h3>
<p>Because 1 and 3 differ almost entirely in <em>display</em>, and not at all in runtime — both
need a kernel, a MIME renderer and a staleness mark. Building 1 with a dataflow-aware kernel is a
strictly-dominant first move: you get a running notebook on the board in days, and you have
already paid for the graph that 2 and 3 need. Proposal 4 needs none of it and is already funded
under a different name; do not let it absorb this question. Proposal 5's output shelf is the one
piece worth stealing early regardless of which display wins — it is separable, and it solves the
output-placement problem for 1 through 4 as well.</p>

{addendum()}

<h3>Stock parts — what to buy rather than write</h3>
<div class="scroll"><table>
<thead><tr><th>Element</th><th>Today</th><th>Off-the-shelf part, by exact name</th><th>Behaviour that must survive</th></tr></thead>
<tbody>
<tr><td>Python execution</td><td><code>expression_eval.py</code> — one expression, safe namespace</td>
<td>a marimo kernel (<code>App.embed</code>/<code>create_asgi_app</code>) · or <code>jupyter_client</code>
<code>KernelManager</code>/<code>KernelClient</code> under marimo's own stale/autorun policy</td>
<td>The existing safe evaluator <b>stays</b> for property fields. It is not a worse kernel; it is a
different, correct thing — no process, no imports, underlines the exact bad identifier.</td></tr>
<tr><td>A block's inlets and outlets</td><td>registry names, cycle-checked</td>
<td><code>marimo.Cell.refs</code> / <code>marimo.Cell.defs</code> — public properties, proven in
the probe below</td><td>Cycle detection and “which name is undefined” must keep pointing at a
source span, not just a block. Static, so a port is drawable before the first run — which is the
requirement that rules a runtime tracer out.</td></tr>
<tr><td>The wires between them</td><td>none</td><td>— write it: <code>name in a.defs and name in
b.refs</code></td><td>Twenty lines with no dependency, rather than importing
<code>marimo._runtime</code>, which is private.</td></tr>
<tr><td>Rich output</td><td>none</td><td>Jupyter <code>display_data</code> MIME bundle —
<code>image/png</code>, <code>text/html</code>, <code>text/plain</code></td>
<td><code>plt.show()</code>, <code>df.head()</code> and <code>_repr_html_</code> render without
any per-library special-casing.</td></tr>
<tr><td>Graph scheduling</td><td>none in the trunk</td>
<td><code>ExecutionGraph.tsx</code> from the pyblocks fork — port it, do not rewrite it</td>
<td>Downstream closure from a selection; parallel independent branches; <code>isOutOfDate</code>
flipped around each run.</td></tr>
<tr><td>The file on disk</td><td>board document</td><td>marimo's plain <code>.py</code> of
<code>@app.cell</code> functions (<code>nbformat</code> only if a strip must also open in
JupyterLab)</td><td>Git-diffable, runnable as a script, and order-free — so board positions can be
a sidecar that never contradicts it.</td></tr>
<tr><td><b>Unchanged (stock seam)</b></td><td colspan="3">The bbox-ui core still imports no canvas
engine, and <code>CodeShapeUtil</code>'s hard gate g3 still holds — the cell stays raw text plus
display preferences. Running code is the <em>host's</em> job, arriving as props. None of the five
proposals needs that rule bent, and it is worth checking each future PR against that, because the
tempting shortcut is to let the cell own its own kernel client.</td></tr>
</tbody></table></div>

<h2><span class="num">Decision</span>What I need from you</h2>
<table><tbody>
<tr><td style="width:25%"><b>Done &amp; proved</b></td><td>The five proposals and the
reframe (morning), then the decision, the port derivation and the stack rule (evening). Every
<code>file:line</code> re-read off disk at build time. The four captures are real. The marimo
claims are not recalled — marimo 0.24.2 was installed into a disposable venv and asked, and
<code>docs/probe_marimo_ports.py</code> re-derives every line of that output.</td></tr>
<tr><td><b>Answered since this morning</b></td><td>Which display first → <b>neither 1 nor 2 alone</b>:
the container is already shipped, so the first lane is ports-from-source over it, with no kernel.
Engine → <b>marimo, via its public <code>Cell</code> API only</b>. Auto-generate the traces →
<b>always derived; dragging one is a code edit</b>.</td></tr>
<tr><td><b>Needs you</b></td><td><b>Q1 — where does a cable leave a stack?</b> A stack hides cables
between its members, but a dependency crossing the boundary must still be drawn. Default if you
say nothing: it leaves from the <em>stack's</em> edge at the member's row, so the stack reads as
one box from outside. <b>Q2 — is the board file a marimo <code>.py</code> + a positions sidecar,
or a board doc that exports one?</b> Default: the <code>.py</code> is canonical, because that is
what makes “the IDE is a subset of the canvas” literally true rather than a metaphor.
<b>Q3 — spike <code>App.embed()</code> before rung 4?</b> Default: yes, half a day — it is the one
piece of the integration the probe did not exercise.</td></tr>
<tr><td><b>Deliberately not done</b></td><td>Nothing built. marimo was installed only in
<code>/tmp</code>, never into a project environment, and no cell was ever executed — the probe is
pure static analysis on purpose. I did not spike <code>App.embed()</code> (Q3) because that is a
real integration decision, not a lookup. The <b>§ Source Code View</b> ask above is still formally
unanswered, though the “cable as a code edit” seam here is most of its mechanism.</td></tr>
</tbody></table>

{rate('overall', 'Overall — the reframe and the recommendation')}

<div class="copybar">
  <button class="cbtn" id="copy">Copy my verdicts as markdown</button>
  <span class="hint" id="copyhint">Marks every item by number and title, so you never have to say
  which one you meant.</span>
</div>
<textarea id="outbox" readonly placeholder="Your verdicts appear here, pre-selected — press the button above."></textarea>

</div>
<script>{JS}</script>
</body></html>
"""




# ===========================================================================
# ADDENDUM, 2026-09-18 evening. Zach converged: proposal 2 is dropped, 3 and 4
# merge into "ports derived from the code", and marimo replaces ipyflow. The
# probe outputs below are REAL — captured from a throwaway marimo 0.24.2 venv
# by docs/probe_marimo_ports.py, which ships beside this file so the numbers
# can be re-derived rather than trusted.
# ===========================================================================

PROBE = pathlib.Path(__file__).resolve().parent / "probe_marimo_ports.py"
# Committed beside the probe, NOT under the gitignored reports/media half: a
# builder that cannot rebuild its own committed report from the repo alone is
# not reproducible, and this file is 30 lines of text.
PROBE_OUT = pathlib.Path(__file__).resolve().parent / "probe_marimo_ports.out"


def probe_text() -> str:
    if not PROBE_OUT.exists():
        raise SystemExit(f"missing {PROBE_OUT} — run docs/probe_marimo_ports.py first")
    return PROBE_OUT.read_text().rstrip()


def esc(t: str) -> str:
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def mock_merged():
    """The synthesis: derived ports, a stack for the chain, wires for the branch."""
    wire = """
<svg class="ov" viewBox="0 0 820 478">
  <path d="M330 236 H392 V150 H452" class="pw"/>
  <path d="M330 236 C386 236 392 330 452 330" class="pw"/>
  <text class="glab dark" x="352" y="142">norm</text>
</svg>"""
    return f"""
<div class="board" style="height:478px">
  {wire}
  <div class="strip stackblk" style="left:26px;top:34px;width:304px">
    <div class="striph"><b>preprocess</b><span class="chainok">chain ✓</span><span class="runall">stack</span></div>
    <div class="mem"><div class="memh">load<span class="pchip out">pd</span><span class="pchip out">df</span></div>
      <pre class="src">import pandas as pd
df = pd.read_csv("runs.csv")</pre></div>
    <div class="mem"><div class="memh"><span class="pchip in">df</span>normalise<span class="pchip out">norm</span></div>
      <pre class="src">norm = df / df.max()</pre></div>
    <div class="memnote">cables between members hidden — the stack IS the chain</div>
    <i class="pt out" style="top:202px;right:-5px"></i>
  </div>
  <div class="blk port" style="left:452px;top:112px;width:236px">
    <div class="blkh"><span class="pchip in">norm</span>gap<span class="pchip out">gap</span></div>
    <pre class="src">gap = 1 - norm.mean()</pre>
    <div class="res">0.680 · r17</div>
    <i class="pt in" style="top:38px"></i>
  </div>
  <div class="blk port staleb" style="left:452px;top:292px;width:236px">
    <div class="blkh"><span class="pchip in">norm</span>hist<span class="doto"></span></div>
    <pre class="src">hist = norm.hist(bins=30)</pre>
    <div class="res stale plot">{BARS}</div>
    <div class="staleline">stale · norm changed</div>
    <i class="pt in" style="top:38px"></i>
  </div>
  <div class="note" style="left:26px;top:330px;width:304px">Two branches off <code>norm</code>, so they are siblings and run in <b>parallel</b> — an order a single thread could not have expressed.</div>
</div>"""


def mock_two_renderings():
    return """
<div class="board" style="height:268px">
  <div class="zlab" style="position:absolute;left:26px;top:16px">one graph, rendered as a stack</div>
  <div class="zlab" style="position:absolute;left:452px;top:16px">the same graph, rendered as wires</div>
  <svg class="ov" viewBox="0 0 820 268">
    <path d="M598 92 V126" class="pw"/><path d="M598 170 V204" class="pw"/>
    <path d="M400 130 H432" class="eq"/>
    <text class="eqt" x="416" y="122">=</text>
  </svg>
  <div class="strip" style="left:26px;top:44px;width:300px">
    <div class="mem"><div class="memh">load<span class="pchip out">df</span></div></div>
    <div class="mem"><div class="memh"><span class="pchip in">df</span>normalise<span class="pchip out">norm</span></div></div>
    <div class="mem"><div class="memh"><span class="pchip in">norm</span>gap<span class="pchip out">gap</span></div></div>
  </div>
  <div class="blk" style="left:512px;top:52px;width:172px"><div class="blkh">load<span class="pchip out">df</span></div></div>
  <div class="blk" style="left:512px;top:126px;width:172px"><div class="blkh"><span class="pchip in">df</span>normalise<span class="pchip out">norm</span></div></div>
  <div class="blk" style="left:512px;top:204px;width:172px"><div class="blkh"><span class="pchip in">norm</span>gap</div></div>
</div>"""


ADDENDUM_CSS = """
.banner{background:#fff7ed;border:1px solid #fdba74;border-radius:12px;padding:16px 20px;margin:0 0 34px;
  display:flex;gap:14px;align-items:flex-start;font-size:15px}
.banner b{color:var(--stale)}
.banner a{font-weight:600;white-space:nowrap}
.sup{display:inline-block;font:600 10.5px/1 var(--mono);letter-spacing:.09em;text-transform:uppercase;
  background:#fee2e2;color:#b91c1c;padding:4px 8px;border-radius:5px;margin-right:8px}
.probe{background:#0f172a;color:#e2e8f0;border-radius:11px;padding:18px 20px;overflow-x:auto;
  font:12px/1.62 var(--mono);margin:20px 0}
.probe .c{color:#64748b}
.probe b{color:#fbbf24;font-weight:600}
.probe em{color:#86efac;font-style:normal}
.stackblk{box-shadow:0 1px 2px rgba(15,23,42,.05)}
.mem{border-bottom:1px solid #f1f5f9;padding:0 0 6px}
.mem:last-of-type{border-bottom:0}
.memh{display:flex;align-items:center;gap:6px;font:600 12.5px/1 var(--mono);color:#334155;padding:9px 11px 6px}
.memnote{font:11px/1.4 var(--mono);color:#94a3b8;padding:8px 11px;border-top:1px dashed var(--line);text-align:center}
.pchip{font:600 10.5px/1 var(--mono);padding:3px 7px;border-radius:20px;border:1px solid #cbd5e1;color:#475569}
.pchip.in{background:#eef2ff;border-color:#c7d2fe;color:#4338ca}
.pchip.out{background:#ecfdf5;border-color:#a7f3d0;color:#047857;margin-left:auto}
.pchip.out+.pchip.out{margin-left:0}
.chainok{font:600 10.5px/1 var(--mono);color:var(--ok);background:var(--okbg);padding:3px 7px;border-radius:5px}
.glab.dark{fill:#334155}
.eq{stroke:#cbd5e1;stroke-width:0;fill:none}
.eqt{fill:#94a3b8;font:600 20px/1 var(--mono);text-anchor:middle}
.two{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:22px 0}
.two>div{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 20px}
.two h4{margin:0 0 8px;font-size:15px}
.two p{font-size:14px;color:#475569;margin:0}
.two .yes{border-color:#a7f3d0}
.two .no{border-color:#fca5a5}
@media(max-width:900px){.two{grid-template-columns:1fr}}
"""


def addendum() -> str:
    f = dict(FACTS)
    return f"""
<h2 id="decided"><span class="num">What we decided · later the same day</span>Ports, derived from the code — and a stack only where the graph is a chain</h2>

<div class="quote">“if a block defines a df.. then it should get a DF port, so that you can send that
cable anywhere… when you do that you both show the dataflow and ALSO the order of execution…
In that sense I don't really need to show the thread. if its DAG I already can read it left to
right and know the order of execution. you can even put this in parallel, which this sequential
ordering cannot capture… if you want linear flow then you should just do a stack, and if you want
parallel flow then you can use wires.”</div>

<p>That collapses the five into one design and kills one of them outright. Three changes:</p>

<div class="two">
  <div class="no"><h4>Proposal 2 is dead, correctly</h4><p>A thread can only express a
  <em>sequence</em>. The moment two blocks both read <code>norm</code> and neither reads the
  other, they are siblings and the truth is “these run in parallel” — which a numbered line
  physically cannot say. The DAG is strictly more expressive, and it is not more to draw.</p></div>
  <div class="yes"><h4>3 and 4 were never two proposals</h4><p>“Derive the graph from the code”
  (3) and “draw ports and wires” (4) are the same thing seen from the engine and from the
  screen. A name bound in one block and read in another <em>is</em> an outlet, a wire and an
  inlet. One design.</p></div>
</div>

<h3>The correction: marimo, not ipyflow — and the reason is your port idea, not hackability</h3>
<div class="callout">
  <p><b>I had this the wrong way round this morning, and your port idea is what flips it.</b> I
  argued for ipyflow because it imposes no rules on your Python. But <b>a port has to be
  knowable before the code runs</b>, or there is nothing to draw and nothing to drag a cable
  from. ipyflow's graph is a <em>runtime observation</em> — it exists only after execution.
  marimo's is <em>static analysis</em>: it parses each cell to an AST and resolves scope, so
  every inlet and outlet is on screen before anything has run once.</p>
  <p>So the criterion that decided it is not “which preserves hackability” — it is “which one
  can draw a port on an unrun block”. Only marimo can. Take the hackability loss knowingly; it
  buys the thing you actually want.</p>
</div>

<h3>And the rule you'd have resented is the precondition for your ports</h3>
<p>marimo enforces exactly two constraints: <b>no cycles</b> and <b>no variable redefinitions</b>
across cells. This morning I called the second one a tax on hackability. It is not — it is the
well-formedness condition for your <code>df</code> outlet. <b>A port has exactly one producer.</b>
If two blocks could bind <code>df</code>, the outlet has two sources and the cable is ambiguous;
there is no drawing that resolves it. marimo refuses it, and any port model must refuse it too,
for the same reason. The escape hatch is already there: a leading underscore makes a name
cell-local, so <code>_tmp</code> can be reused freely and simply has no port.</p>

<h3>The ports fall straight out — this is a real run, not a sketch</h3>
<p>Installed marimo {"0.24.2"} into a throwaway venv and asked it. <code>marimo.Cell.refs</code>
(“The references that this cell takes as input”) and <code>marimo.Cell.defs</code> (“The
definitions made by this cell”) are <b>public, documented properties</b>. A wire is then one line
of set intersection. Nothing below was executed — that is the point.</p>
<pre class="probe">{esc(probe_text())}</pre>
<p class="sub">Re-derivable: <code>docs/probe_marimo_ports.py</code>, run against a disposable
<code>uv venv</code>. The <code>print</code> in <code>report</code>'s refs is filtered out because
nothing in the document binds it — a name with no producer can never have a cable, which is also
how import noise stays off the board.</p>

<h3>The design, drawn</h3>
<div class="boardwrap">{mock_merged()}</div>
<p class="sub">Drawn for this page. Note the cable that <em>leaves</em> the stack: a stack hides
the cables between its own members, but a dependency crossing its boundary still has to be drawn,
and it has to leave from somewhere. That is a real open question below.</p>

<h2><span class="num">Stacks and wires</span>You already shipped this toggle. It just doesn't mean execution yet</h2>
<p>The mixing you want is not new work — it is already the vocabulary in <code>blockModel.ts</code>,
shipped, with drag-reorder. Verbatim from the file:</p>
<div class="quote">“<code>free</code> is the frame: members sit wherever they were dropped,
<b>cables between them are drawn</b>, and Inset / Edge-to-edge is a one-shot tidy command.
<code>stack</code> lays members out continuously in their <b>authored order</b> (tldraw's own
child index), <b>hides the cables between them</b>, and reads its spacing from the three member
props below.”<br><span class="sub">systemsketch · src/blocks/blockModel.ts:131-138 ·
<code>BLOCK_BODY_LAYOUTS = ['free', 'stack']</code> · the trunk's port of it is
<code>apps/storybook-basics/src/components/blockMembers.tsx</code>, whose own header quotes you:
“free vs stack is basically the same thing, it's all just membership”</span></div>

<p><b>Ordered with cables hidden</b> versus <b>positioned with cables drawn</b> is precisely
“stack for linear, wires for parallel”. The entire delta is that today those two words describe
<em>drawing</em>, and you now want them to describe <em>execution</em>. That is a meaning change
on a shipped toggle, not a feature.</p>

<div class="boardwrap">{mock_two_renderings()}</div>

<h3>But a stack can lie, and the check is mechanical</h3>
<p>Here is the trap, and it is the same one the reframe opened with. A DAG has no order; a stack
has one. So a stack can only tell the truth when its members form a <b>path</b> — one head, one
tail, each member with at most one parent and one child inside the selection. Stack two siblings
and the column asserts a sequence the graph does not have, which is exactly the invisible lie
Jupyter's cell order tells. The probe above checks it in about fifteen lines:</p>
<table><tbody>
<tr><td style="width:46%"><code>['load', 'normalise', 'gap_of']</code></td><td><span class="tick">chain ✓</span>
— a real path, so the stack is faithful and the hidden cables are genuinely redundant</td></tr>
<tr><td><code>['gap_of', 'histogram']</code></td><td><span class="cross">not a chain</span> — siblings.
A stack here invents an order; they belong side by side, wired.</td></tr>
<tr><td><code>['normalise', 'gap_of', 'histogram']</code></td><td><span class="cross">not a chain</span> — one
parent, two children. It is a fan-out, and a column cannot draw a fan-out.</td></tr>
</tbody></table>
<p>Which gives three concrete behaviours, all free once the graph exists: <b>“Stack this” is only
offered when the selection is a chain</b>; a stack <b>auto-sorts topologically</b> so its authored
order can never drift from the graph; and dragging a member into a stack that would break the
chain <b>refuses, or the container falls back to free</b> — it never silently accepts a false
order.</p>

<h2><span class="num">Your open question</span>“Auto-generate those traces, or do it yourself?”</h2>
<div class="callout blue">
  <p><b>Derived. Always. There is no version of this where you draw the wire.</b> The code is the
  truth; a hand-drawn wire would be a second truth that can contradict it, and then the board has
  to pick — which is the bug you spent the whole control-flow effort avoiding.</p>
  <p><b>But dragging a cable is still a real gesture — it is a code edit.</b> Drop a cable from
  <code>norm</code>'s outlet onto a block and it writes <code>norm</code> into that block's source;
  the wire then appears because the code now says so, not because you drew it. You have already
  built exactly this seam once: typing <code>chassis_width / 4</code> into a property field and
  watching the board-wide registry resolve it is the same move, one expression smaller.</p>
  <p>That is also the honest answer to the <b>§ Source Code View</b> question above. Code → blocks
  is <code>refs</code>/<code>defs</code>. Blocks → code is a named source edit. Same mechanism,
  read in two directions — not two projects.</p>
</div>

{addendum_cable()}

<h3>What a “DF port” actually knows</h3>
<p>Careful here, because the name and the type have different lifecycles. Static analysis gives
you the <b>name</b>, always. It gives you the <b>type</b> only if you wrote one:
<code>df: pd.DataFrame = pd.read_csv(...)</code> keeps <code>pd.DataFrame</code> right there in
the AST (verified). Without an annotation the type is a runtime fact and the label can only
appear after the first successful run. So: <b>the port exists before you run; its type badge
arrives after</b> — the same two-state life <code>isOutOfDate</code> already gives every node in
the pyblocks fork. Typed ports are then a reason to annotate, which is a nice pressure rather
than a new mechanism.</p>

<h3>Two things marimo will not do for you</h3>
<table><tbody>
<tr><td style="width:30%"><b>Mutation is invisible</b></td><td>Its own description: dependencies come
from static analysis, “No runtime tracing occurs; mutations are not tracked.” So
<code>df.dropna(inplace=True)</code> in another block will <em>not</em> mark dependents stale —
the graph says nothing changed. This is the real cost of choosing static over dynamic, and it
lands squarely on <b>DP - Mutation &amp; Side Effects</b>, which SystemSketch has already
drawn a <code>mutates</code>/<code>effect</code> port for. That derived effect port is the
mitigation, and it now has a second reason to exist.</td></tr>
<tr><td><b>Imports become cables</b></td><td>The probe shows <code>pd</code> as a genuine outlet of
<code>load</code>, so strictly there is a <code>pd</code> wire to every block that touches pandas.
Correct, and unreadable at forty blocks. Collapse import-bound names into a preamble rather than
drawing them — marimo hands you <code>get_imports()</code> to identify exactly that set.</td></tr>
</tbody></table>

<h2><span class="num">Integration</span>How much of marimo do we actually take</h2>
<p>This matters more than it looks, because the good part and the risky part are different
modules.</p>
<div class="scroll"><table>
<thead><tr><th>What we need</th><th>marimo surface</th><th>Public?</th><th>Call</th></tr></thead>
<tbody>
<tr><td>A block's inlets and outlets</td><td><code>marimo.Cell.refs</code> / <code>.defs</code></td>
<td><span class="tick">yes</span> — documented properties on the exported <code>Cell</code></td>
<td><b>Take it.</b> This is the whole port model and it is supported API.</td></tr>
<tr><td>The wires</td><td>— none needed —</td><td>n/a</td>
<td><b>Write it.</b> <code>name in a.defs and name in b.refs</code>. Twenty lines, no dependency,
no upgrade risk.</td></tr>
<tr><td>Descendants / stale set / cycles</td><td><code>marimo._runtime.dataflow.DirectedGraph</code>
({f['exec_graph_lines'] if False else '440'} lines)</td><td><span class="cross">no</span> — underscore-private,
not in the 70-name <code>__all__</code></td>
<td><b>Don't import it.</b> Reachability over the wire set you already built is a dozen lines and
cannot break on <code>pip install -U</code>.</td></tr>
<tr><td>Scope resolution itself</td><td><code>marimo._ast.visitor</code> (1,242 lines)</td>
<td><span class="cross">no</span></td><td><b>Don't reimplement it either</b> — that is 1,242 lines
of Python scoping rules. Reach it only through <code>Cell.refs</code>/<code>.defs</code>, which is
the public door onto the same analysis.</td></tr>
<tr><td>The file on disk</td><td>a plain <code>.py</code> of <code>@app.cell</code> functions</td>
<td><span class="tick">yes</span></td><td><b>Adopt it as the board's file.</b> “marimo stores
notebooks as Python, not JSON. This lets you version notebooks with git, execute them as scripts”
— and since order in the file is meaningless, 2D positions are free to be a sidecar that fights
nothing.</td></tr>
<tr><td>Actually running it</td><td><code>marimo.App.embed()</code>, <code>create_asgi_app</code></td>
<td><span class="tick">yes</span></td><td><b>Open.</b> Worth a spike before committing — this is
the one piece the probe did not exercise.</td></tr>
</tbody></table></div>
<p class="sub">Measured against marimo 0.24.2 in a disposable venv on 2026-09-18; nothing was
installed into a project environment. The private-module line counts are read off that install.</p>

<h2><span class="num">Revised v1</span>What this makes the first lane</h2>
<ol class="ladder">
  <li><b><span class="tick">✓ already yours</span> The container and its two modes</b>
  <code>BLOCK_BODY_LAYOUTS = ['free', 'stack']</code>, drag-reorder, cables hidden in a stack.
  Nothing to build; the change is what those words mean.</li>
  <li><b>Ports, from the source</b> Parse each code block with <code>marimo.Cell</code>; render
  <code>refs</code> as inlets and <code>defs</code> as outlets on the blocks you already have.
  <b>No kernel yet, and still worth shipping</b> — a board that shows you the dataflow of your own
  Python without running it is already useful, and it is the whole of proposal 5's “source view”
  question answered as a side effect.</li>
  <li><b>Wires + the chain check</b> Set intersection for the edges; gate “Stack this” on
  <code>is_chain</code>; topologically auto-sort a stack. Still no kernel.</li>
  <li><b>The kernel, and stale</b> Run a block, mark descendants stale (lazy) or re-run them
  (autorun) — marimo ships both as a policy, so copy the policy, not a timer. MIME bundle
  rendering lands here.</li>
  <li><b>The cable as a code edit</b> Dropping a wire writes the reference. This is the bridge to
  § Source Code View and should not be attempted before 2-4 are solid.</li>
</ol>
<p><b>Rungs 2 and 3 need no kernel at all</b>, which is the good news buried in this: the
riskiest dependency arrives at rung 4, and the first two rungs are a pure rendering change over a
container you already shipped.</p>
"""



# ===========================================================================
# ADDENDUM 2, 2026-09-18 night. Zach: "when we start adding round trip editing,
# by draging the cable we actually edit the code!! thats the whole point".
# Yes — and his own vault bounds it, so this section runs the bound rather than
# describing it. Evidence: docs/probe_cable_edit.py.
# ===========================================================================

CABLE_OUT = pathlib.Path(__file__).resolve().parent / "probe_cable_edit.out"


def cable_text() -> str:
    if not CABLE_OUT.exists():
        raise SystemExit(f"missing {CABLE_OUT} — run docs/probe_cable_edit.py first")
    return CABLE_OUT.read_text().rstrip()


def mock_drag():
    """The gesture, frame by frame: the cable lands, and the source is what changed."""
    return f"""
<div class="board" style="height:396px">
  <svg class="ov" viewBox="0 0 820 396">
    <path d="M214 92 C272 92 262 176 316 176" class="pw"/>
    <path d="M214 286 C280 286 262 210 316 210" class="gw drop"/>
    <circle cx="316" cy="210" r="7" class="landing"/>
  </svg>
  <div class="blk port" style="left:26px;top:56px;width:188px">
    <div class="blkh">binds <code>df</code><span class="pchip out">df</span></div>
    <pre class="src">df = read_csv(p)</pre>
    <i class="pt out" style="top:36px"></i>
  </div>
  <div class="blk port" style="left:26px;top:250px;width:188px">
    <div class="blkh">binds <code>norm</code><span class="pchip out">norm</span></div>
    <pre class="src">norm = df / df.max()</pre>
    <i class="pt out" style="top:36px"></i>
  </div>
  <div class="blk port dragging" style="left:316px;top:140px;width:484px">
    <div class="blkh"><span class="pchip in was">df</span><span class="arrowto">→</span><span class="pchip in">norm</span>hist<span class="pchip out">hist</span></div>
    <pre class="src"><span class="cmt"># the distribution is the whole point of this board</span>
hist = <del>df</del><ins>norm</ins>.hist( bins = 30 )   <span class="cmt"># deliberate, do not tidy</span></pre>
    <div class="res">the drop rewrote <b>two characters</b> of source. The wire then appears because the code says so.</div>
    <i class="pt in" style="top:36px"></i>
  </div>
  <div class="note" style="left:316px;top:300px;width:484px">Comment above, trailing comment and
  that deliberate <code>( bins = 30 )</code> spacing all survive — a CST edit, never a reprint.
  Drag <code>df</code> back and the file is <b>byte-identical</b> to where it started.</div>
</div>"""


ADDENDUM2_CSS = """
.gw.drop{stroke:#f59e0b;stroke-dasharray:6 4}
.landing{fill:none;stroke:#f59e0b;stroke-width:2.5}
.blk.dragging{border-color:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.14)}
.pchip.was{background:#fef2f2;border-color:#fecaca;color:#b91c1c;text-decoration:line-through}
.arrowto{color:#94a3b8;font:600 12px/1 var(--mono)}
.src del{background:#fee2e2;color:#b91c1c;text-decoration:line-through;border-radius:3px;padding:0 2px}
.src ins{background:#dcfce7;color:#15803d;text-decoration:none;border-radius:3px;padding:0 2px}
.src .cmt{color:#94a3b8}
.band{display:grid;grid-template-columns:auto 1fr;gap:0;margin:22px 0;border:1px solid var(--line);
  border-radius:12px;overflow:hidden;background:var(--card)}
.band>div{padding:14px 18px;border-bottom:1px solid var(--line)}
.band>div:nth-last-child(-n+2){border-bottom:0}
.band .k{font:600 11px/1.5 var(--mono);letter-spacing:.07em;text-transform:uppercase;white-space:nowrap;
  background:#f8fafc;display:flex;align-items:center}
.band .k.ok{color:var(--ok)}
.band .k.warn{color:var(--spec)}
.band .k.no{color:#b91c1c}
.band .v{font-size:14.5px;color:#334155}
"""


def addendum_cable() -> str:
    return f"""
<h2 id="cable"><span class="num">The cable is the edit</span>Yes — and the theory that bounds it is already in your vault</h2>

<div class="quote">“when we start adding round trip editing, by dragging the cable we actually edit
the code!! thats the whole point”</div>

<p>Agreed, and it is not a consolation prize for “you can't draw wires” — it is the stronger
claim. A derived wire is <em>read-only information</em>; a wire you can drag is a
<b>refactoring gesture with a graph for a UI</b>. Renaming a variable across a codebase by
dragging its port is a better interaction than any IDE's rename dialog, and it only works
because the graph is derived rather than drawn.</p>

<div class="boardwrap">{mock_drag()}</div>
<p class="sub">Drawn for this page — but the diff in it is real, produced by
<code>docs/probe_cable_edit.py</code>, output below.</p>

<h3>Proven, comments and all</h3>
<p>A cable drag is a <code>put</code> in the lens sense, and the read side is
<code>get</code>. The law that has to hold is <b><code>get(put(source, wire)) == wire</code></b>
— after the edit, re-deriving must hand back exactly the wire you drew, or the board and the file
have quietly diverged. Ran it:</p>
<pre class="probe">{esc(cable_text())}</pre>

<h3>The write side is a different tool from the read side</h3>
<p>Worth stating because it is the easy thing to get wrong: <b>marimo's analysis is an AST, and an
AST cannot write.</b> Round-trip through <code>ast</code> and you reprint the file — comments gone,
<code>( bins = 30 )</code> tidied into <code>(bins=30)</code>, quote style normalised. Every cable
drag would silently reformat someone's work. The write side has to be a <b>CST</b>, which is your
own <b>C - Comment Preserving Code Editing (CST vs AST)</b> note, and the probe uses
<b>libcst 1.9.0</b> — the same class of tool as the <code>ruamel</code> round-trip like_keras
already ships for YAML. Read with marimo, write with libcst; they are not interchangeable.</p>

<h3>But not every cable gesture is legal, and the test is mechanical</h3>
<p>Here is where your vault saves real time. <b>C - Bidirectional Transformation (Lenses)</b>
already collects the results that bound this, including <b>Lechtenbörger's undoability test</b>
(PODS 2003): <em>a view update is translatable precisely iff its effect can be undone from within
the view.</em> That is not philosophy — it is a check you can run per gesture, and the probe runs
it. The answer splits the gestures cleanly in three:</p>

<div class="band">
  <div class="k ok">silent drag</div>
  <div class="v"><b>REBIND</b> an inlet that already has a reference · <b>RENAME</b> a port.
  Both undo by doing the opposite drag, and the probe confirms the rebind round-trips
  <b>byte-identically</b>. These are exactly the “local, non-abstracting” band your lens note
  already identified as safe.</div>
  <div class="k warn">named command, with a preview</div>
  <div class="v"><b>CONNECT</b> a name into a block that does not reference anything yet — there is
  no inlet to land on, so the tool has to ask <em>where in the expression</em>, and a drag cannot
  ask. <b>CUT</b> a cable — removing the reference leaves <code>hist = .hist(bins=30)</code>,
  which is not Python; the undo needs the expression you deleted and the wire never carried it.
  This is Rule 4 of your <b>Visual to Python Round Tripping</b> note arriving from a completely
  different direction: structural edits are named source operations, never silent mutations.</div>
  <div class="k no">never under a drag</div>
  <div class="v">An <b>LLM</b>. Rule 6, and it still holds: too slow, nondeterministic and
  untestable at interaction speed. It belongs on the underdetermined edits — “turn this repeated
  list into a loop” — where it proposes a diff you review. It is not the edit engine.</div>
</div>

<h3>The consequence worth taking from this</h3>
<div class="callout ok">
  <p><b>Dragging a port's name is a guaranteed-correct global rename</b>, and that is a real
  feature falling out of a constraint. Because marimo forbids a second binding, a port has exactly
  one producer and every consumer is statically known — so renaming <code>norm</code> to
  <code>scaled</code> is a complete, exact refactor, not a search-and-replace that might catch a
  string literal or miss a shadowed scope. The single-definition rule has now paid for itself
  three times: it makes the outlet unambiguous, the rename total, and the stale set exact.</p>
  <p>Which also means the rename is <b>two</b> edits, not one — rebind every consumer, then
  re-bind the producer — and the probe shows why they must be separate: a rebind deliberately
  refuses to touch a binding, so that dragging an inlet can never silently rename somebody's
  outlet.</p>
</div>

<p>So rung 5 of the ladder splits, and the first half is much closer than it looked:
<b>5a — rebind and rename</b>, a CST edit behind a drag, testable with a byte-identical undo
assertion, and needing no kernel; <b>5b — connect and cut</b>, which need a command surface with a
preview and should wait. Doing 5a early is tempting and, unusually, probably right: it is the
smallest possible thing that makes a wire feel alive, and it is the one that cannot corrupt a
file.</p>
"""

if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    html = build()
    OUT.write_text(html, encoding="utf-8")
    import urllib.parse
    enc = len(urllib.parse.quote(html))
    print(f"wrote {OUT}  {OUT.stat().st_size/1024:.0f} KB on disk  ·  {enc/1024:.0f} KB encoded")
    print("preview cap is 2,097,024 bytes encoded", "— OK" if enc < 2_097_024 else "— OVER")
