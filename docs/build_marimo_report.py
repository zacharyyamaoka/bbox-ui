#!/usr/bin/env python3
"""
Build "marimo, measured" — can marimo's engine back a definition-level source
code view over ordinary hand-written Python?

Zach, 2026-09-18: "Crazy Marimo basically does everything we need exactly!!!
... super cool to how its stored as like a raw python file as well."

A sonnet agent read marimo's source; this report then goes further and RUNS it.
marimo 0.24.2 and pyflow-analysis 0.1.1 were both fetched into throwaway uvx
environments and pointed at one 31-line hand-written module, so the central
table — the same file at three granularities — is measured here rather than
quoted. Every artifact of that run is kept beside this page in
reports/media/marimo-probe/.

No captures are inlined, so this page is text-only and lives in the TRACKED
reports/ half, committed so a peer sweep cannot take it.

    python3 docs/build_marimo_report.py
"""
from __future__ import annotations

import json
import pathlib
import re
import sys
from html import escape

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from _report_kit import CSS, FB_JS, dock, fb, overall_box, report_size, sh  # noqa: E402

REPO = pathlib.Path("/home/bam/bbox-ui")
PROBE = REPO / "reports/media/marimo-probe"
OUT = REPO / "reports/vpl-marimo-2026-09-18.html"
PRIOR = "file:///home/bam/bbox-ui/reports/media/vpl-prior-art-2026-09-18.html"
ANSWERS = "file:///home/bam/bbox-ui/reports/media/source-code-view-answers-2026-09-18.html"
KEYIDEAS = "file:///home/bam/bbox-ui/reports/marimo-key-ideas-2026-09-18.html"

M = json.loads((PROBE / "measurements.json").read_text())
PLAIN = (PROBE / "plain_module.py").read_text()
CONVERTED = (PROBE / "converted.py").read_text()

N_DEFS = len(re.findall(r"^(?:def|class) ", PLAIN, re.M)) + len(
    re.findall(r"^    def ", PLAIN, re.M)
)
PLAIN_LINES = len(PLAIN.splitlines())

FACTS = {
    "lines": str(PLAIN_LINES),
    "defs": str(N_DEFS),
    "expr": M["expr_nodes"],
    "expr_edges": M["expr_edges"],
    "cell": "1",
    "cell_edges": "0",
    "marimo_v": "0.24.2",
    "head": sh("git rev-parse --short HEAD", REPO),
}


def code(text: str, cls: str = "") -> str:
    return f'<pre class="{cls}">{escape(text)}</pre>'


# The converted file, with the two lines that matter called out.
CONVERTED_MARKED = escape(CONVERTED)
CONVERTED_MARKED = CONVERTED_MARKED.replace(
    "def _(Depth, Frame, Rectified, load_calibration, match, score, to_depth, warp):",
    '<span class="hl">def _(Depth, Frame, Rectified, load_calibration, match, score, to_depth, warp):</span>',
)
CONVERTED_MARKED = CONVERTED_MARKED.replace(
    "    from __future__ import annotations",
    '<span class="bad">    from __future__ import annotations</span>'
    '\n<span class="note">    ^^^ indented off line 2 — this file no longer compiles</span>',
)

EXTRA_CSS = """
  pre .hl { background:#1b2a1e; border-radius:3px }
  pre .bad { background:#2a1517; border-radius:3px }
  pre .note { color:#e5534b; font-style:italic }
  .grain { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin:16px 0 0 }
  .gcard { border:1px solid var(--line); border-radius:10px; padding:14px; background:#101318;
    text-align:center }
  .gcard .n { font:800 34px/1 var(--mono); letter-spacing:-.03em }
  .gcard .lbl { font:700 10px/1.3 var(--mono); letter-spacing:.1em; text-transform:uppercase;
    margin:9px 0 6px }
  .gcard .sub { font-size:12px; color:var(--dim2); line-height:1.5 }
  .gcard.too .n { color:var(--warn) } .gcard.too .lbl { color:var(--warn) }
  .gcard.want { border-color:#1e3d26; background:#0f1a13 }
  .gcard.want .n { color:var(--ok) } .gcard.want .lbl { color:var(--ok) }
"""

ASKS = [
    dict(
        n="C1",
        q="Vendor marimo&rsquo;s visitor, or write our own?",
        body="marimo is Apache-2.0, so copying is allowed with attribution. Its "
             "<code>_ast/visitor.py</code> is a clean <code>ast.NodeVisitor</code> that maintains a "
             "ref-stack per scope and bubbles free variables upward &mdash; genuinely good, and the "
             "technique we need. But it produces <em>cell-wide</em> defs and refs, and the graph "
             "algorithms around it are typed on <code>CellId_t</code>.",
        default="<b>Port the technique, cite the file, do not take the dependency.</b> Same shape as "
                "every other donor in this repo: name <code>marimo/_ast/visitor.py</code> and "
                "<code>marimo/_runtime/dataflow/</code> with a revision in the provenance header, "
                "re-express against our own node type, and keep the Apache-2.0 notice. Depending on "
                "the package to reach a class whose own docstring says &ldquo;internal&rdquo; is the "
                "part I would not do.",
    ),
    dict(
        n="C2",
        q="Does the reactive runtime interest you separately from the view?",
        body="The stale-vs-autorun model you liked is real and well built, and it is computed from "
             "the <em>same</em> graph as the dependency edges. But it is per-cell, lives only in "
             "memory on a live kernel, and has no representation in the file. It is also squarely "
             "the other agent&rsquo;s thread &mdash; the canvas-notebook question.",
        default="<b>Keep them separate.</b> The source-code view needs the <em>analysis</em> half and "
                "none of the runtime. If the notebook thread wants a reactive kernel, ipyflow is "
                "already its recommendation and does not impose marimo&rsquo;s one-definition rule. "
                "Wiring one decision to the other would couple two designs that only share a graph "
                "shape.",
    ),
    dict(
        n="C3",
        q="Is the one-definition rule a warning we should heed, or just marimo&rsquo;s problem?",
        body="marimo refuses to load a file where two cells define the same name &mdash; functions "
             "and classes included &mdash; because that is what buys its determinism. Ordinary "
             "Python breaks the rule constantly. Our design never adopts the rule, but the question "
             "underneath is real: what does our view do when a name <em>is</em> bound twice?",
        default="<b>Report it, never refuse it.</b> A projection over code it does not own must "
                "degrade rather than reject &mdash; that is the same rule as the analyser never "
                "executing what it reads, and the same rule as pyblocks&rsquo; identity ladder "
                "reporting an unmatched block instead of guessing. Two bindings of one name becomes "
                "a visible state on the block, not a load error.",
    ),
]
ASK_HTML = "\n".join(
    f"""<div class="ask">
  <h3>{a['n']} &middot; {a['q']}</h3>
  <p style="color:var(--dim);font-size:14px;margin:0">{a['body']}</p>
  <p class="dflt"><b>If you say nothing:</b> {a['default']}</p>
  {fb(a['n'], re.sub(r'<[^>]+>', '', a['q']))}
</div>"""
    for a in ASKS
)

HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>marimo, measured</title>
<style>{CSS}{EXTRA_CSS}</style>
</head><body><div class="wrap">

<p class="kicker">bbox-ui &middot; pyblocks &nbsp;&middot;&nbsp; marimo, examined as an engine &nbsp;&middot;&nbsp; 2026-09-18</p>
<h1>marimo, measured</h1>
<p class="sub">Your instinct is right about the <em>model</em> &mdash; and marimo is the best existence
proof yet that it works. It is not, however, an engine we can point at your code. I ran it to be
sure.</p>

<div class="answers">
  <div class="answer green">
    <b class="h">First, the part you got right, and it is the important part.</b>
    <p>A reactive dataflow graph derived by static analysis, over a file that stays plain-text Python,
    with a stale/autorun model &mdash; <b>marimo ships that and people use it.</b> Every other system
    that achieves live bidirectional behaviour pays for it by owning something: MPS owns the storage,
    Enso owns the language. marimo is the cheapest version of that trade anyone has found, and it is
    strong evidence that <b>file-canonical beats graph-canonical</b> &mdash; which is exactly the call
    you already made.</p>
  </div>
  <div class="answer red">
    <b class="h">But a marimo <code>.py</code> is not an ordinary Python file, and it cannot read one.</b>
    <p>marimo owns the file&rsquo;s frame: <code>import marimo</code>, <code>app = marimo.App()</code>,
    and every unit wrapped in <code>@app.cell def _(&hellip;):</code> whose parameter list and return
    tuple marimo itself maintains. Point its loader at a module nobody wrote in marimo and it refuses
    &mdash; measured below, verbatim:
    <code>NonMarimoPythonScriptError: Python script plain_module.py is not a marimo notebook.</code></p>
  </div>
  <div class="answer">
    <b class="h">Its granularity is the cell, and a converted file is exactly one cell.</b>
    <p>I ran <code>marimo convert</code> on a {FACTS['lines']}-line module with {FACTS['defs']}
    definitions. It produced <b>one cell containing the entire file</b>, every definition indented one
    level inside an anonymous function. The headless dependency graph for that file is
    <b>{FACTS['cell']} node and {FACTS['cell_edges']} edges</b>. <code>estimate_pair</code> calls
    <code>rectify</code> and marimo cannot see it &mdash; not because the analysis is weak, but
    because both live in the same cell.</p>
  </div>
  <div class="answer blue">
    <b class="h">And here is the finding worth the whole exercise: marimo already computes the names, then aggregates them away.</b>
    <p>That single cell&rsquo;s <code>defs</code> came back as
    <code>['CALIB', 'EstimatePairOut', 'NamedTuple', 'Pipeline', 'annotations', 'estimate_pair',
    'rectify']</code> &mdash; <b>every one of the four module-level definitions is in there,
    correctly found</b> (the two methods sit inside <code>Pipeline</code>, so they are not
    module-scope names), with
    the file&rsquo;s free variables as <code>refs</code>. The hard part is done. What is missing is
    not an analyser; it is the <b>partition</b> &mdash; nobody splits those names back out into one
    node each. That is a much smaller thing to build than it sounded this morning.</p>
  </div>
</div>

<h2>One file, three granularities, all measured today</h2>
<p style="color:var(--dim)">The same {FACTS['lines']}-line hand-written module through two real tools,
fetched into throwaway environments. The middle column is what we want, and it is the one nobody
ships.</p>
<div class="grain">
  <div class="gcard too">
    <div class="n">{FACTS['expr']}</div>
    <div class="lbl">expression grain</div>
    <div class="sub"><code>pyflow-analysis 0.1.1</code><br>{FACTS['expr_edges']} edges,
    {M['expr_ops']} ops, {M['expr_slots']} slots &mdash; and that is for
    <b>one</b> of the four definitions, not the file.</div>
  </div>
  <div class="gcard want">
    <div class="n">{FACTS['defs']}</div>
    <div class="lbl">definition grain &mdash; what we want</div>
    <div class="sub">one node per <code>def</code>/<code>class</code>, nested ones included
    (4 at module level + 2 methods).<br><b>No tool in the sweep emits this.</b></div>
  </div>
  <div class="gcard too">
    <div class="n">{FACTS['cell']}</div>
    <div class="lbl">cell grain</div>
    <div class="sub"><code>marimo {FACTS['marimo_v']}</code> after <code>convert</code><br>
    {FACTS['cell_edges']} edges. The whole file is one node.</div>
  </div>
</div>
<p class="mock-note" style="margin-top:14px">Too fine, just right, too coarse &mdash; and the two
tools that exist sit on either side of the answer. Note the left figure is <code>estimate_pair</code>
<i>alone</i>, a four-line function; the whole file at that grain would be several times larger.</p>

<h2>What <code>marimo convert</code> actually did to an ordinary module</h2>
<div class="grid2">
  <div>
    <h4 style="color:var(--ok)">before &mdash; plain Python, compiles, runs</h4>
    {code(PLAIN, "tight")}
  </div>
  <div>
    <h4 style="color:var(--warn)">after &mdash; <code>marimo convert</code></h4>
    <pre class="tight">{CONVERTED_MARKED}</pre>
  </div>
</div>
<div class="lede red">
  <p><b>And it does not compile.</b> Indenting the file into a cell body moves
  <code>from __future__ import annotations</code> off line 2, which Python rejects:</p>
  {code('$ python3 converted.py\n    from __future__ import annotations\n    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\nSyntaxError: from __future__ imports must occur at the beginning of the file', 'term')}
  <p style="margin-top:10px">The original compiles fine. This is not the headline &mdash; it is one
  bug in one converter on one fixture, and I am reporting it as that rather than as a verdict. But it
  does show the conversion path is not a serious route for existing code, which is the same
  conclusion the structure already forced.</p>
</div>

<h2>A correction to my own testing, before it misleads anyone</h2>
<div class="lede gold">
  <p>My first probe ran <code>marimo export script plain_module.py</code>, which exited 0 and echoed
  the file back &mdash; and I briefly took that as marimo accepting an ordinary module. It does not.
  That is a lenient path; the real loader is unambiguous:</p>
  {code('>>> from marimo._ast import load\n>>> load.load_app("plain_module.py")\nNonMarimoPythonScriptError: Python script plain_module.py is not a marimo notebook.', 'term')}
  <p style="margin-top:10px">Recording it because a passing command that tests the wrong thing is
  worse than no test &mdash; and because the agent&rsquo;s claim was right and my counter-test was
  not.</p>
</div>

<h2>The graph <em>is</em> reachable headless &mdash; that part is genuinely good news</h2>
<p style="color:var(--dim)">No kernel, no server, no websocket. Measured in-process:</p>
{code('''from marimo._ast import load
from marimo._ast.app import InternalApp

app = load.load_app("converted.py")
graph = InternalApp(app).graph          # -> DirectedGraph, no kernel started

cells=1  edges=0
  cell Hbol: defs=['CALIB', 'EstimatePairOut', 'NamedTuple', 'Pipeline',
                   'annotations', 'estimate_pair', 'rectify']
             refs=['Depth', 'Frame', 'Rectified', 'float', 'int', 'load_calibration']''', "term")}
<p style="font-size:12.5px;color:var(--dim2);margin-top:10px">Two caveats that keep this from being a
free lunch: <code>InternalApp</code>&rsquo;s own docstring says &ldquo;This exposes private APIs that
are used by the server and other internal components&rdquo;, and no CLI emits the graph as data &mdash;
every <code>marimo export</code> subcommand uses it only to pick a topological order. So it works,
but it is unstable surface, and it still only works on files marimo already owns.</p>

<h2>marimo tried definition-level serialisation, and named the exact blocker</h2>
<div class="lede">
  <p>The most useful thing in marimo&rsquo;s source for us is a feature that <em>almost</em> does what
  we want. <code>marimo/_ast/toplevel.py</code> will serialise a cell as a real top-level
  <code>def</code> (decorated <code>@app.function</code>) instead of burying it in a wrapper &mdash;
  but only if the cell contains <b>exactly one</b> function or class <b>and references nothing defined
  by another cell</b>. Its own hint text: <i>&ldquo;This function depends on variables defined by
  other cells&hellip; move these variables to the setup cell.&rdquo;</i></p>
  <p style="margin-top:10px"><b>So marimo emits definition-shaped nodes precisely when there are no
  inter-definition edges</b> &mdash; which is the case our view exists to draw. Read generously, that
  is marimo telling you where its model stops. It is a leaf-only special case, not a definition graph.</p>
</div>

<h2>The one-definition rule, and why it cannot travel</h2>
<div class="grid2">
  <div class="card no"><b>marimo&rsquo;s rule</b>
    <p>&ldquo;marimo requires that every global variable be defined by only one cell&hellip; Functions,
    classes, and imported names are all variables.&rdquo;</p>
    <p>Enforced at <b>load time</b>, as a hard failure &mdash; <code>MultipleDefinitionError</code>,
    raised before the app will open. It is what buys the determinism.</p>
  </div>
  <div class="card"><b>what ordinary Python does</b>
    <p><code>df = df.dropna()</code> in a later cell &mdash; <b>illegal</b>. A helper monkeypatched
    later &mdash; <b>illegal</b>. Two same-named <code>def</code>s in a module &mdash; <b>illegal</b>
    if they land in different cells.</p>
    <p>Our view has to open code written by people who have never heard of any of this, so the rule
    cannot come with us. The underlying question &mdash; what to <em>show</em> when a name is bound
    twice &mdash; is real, and is C3 below.</p>
  </div>
</div>

<h2>What we take, and what we do not</h2>
<div class="scroll"><table>
  <tr><th>from marimo</th><th>where</th><th>take it?</th><th>why</th></tr>
  <tr class="good"><td><b>The defs/refs visitor technique</b></td>
    <td><code>marimo/_ast/visitor.py</code> &mdash; <code>ScopedVisitor(ast.NodeVisitor)</code></td>
    <td class="c"><span class="yes">yes, port</span></td>
    <td>Ref-stack per scope; a <code>def</code>/<code>class</code> registers its name like any
      binding; the body&rsquo;s free variables bubble up. Exactly the shape a definition-level
      analyser needs, one level down.</td></tr>
  <tr class="good"><td><b>The generic graph algorithms</b></td>
    <td><code>marimo/_runtime/dataflow/</code> &mdash; <code>topology.py</code>,
      <code>cycles.py</code>, <code>transitive_closure</code>, <code>topological_sort</code></td>
    <td class="c"><span class="yes">yes, port</span></td>
    <td>They operate on plain <code>dict[Id, set[Id]]</code> and barely touch marimo specifics beyond
      a type alias.</td></tr>
  <tr class="good"><td><b>The codegen discipline</b></td>
    <td><code>marimo/_ast/codegen.py</code> &mdash; <code>to_functiondef</code></td>
    <td class="c"><span class="yes">yes, as a principle</span></td>
    <td>Never re-serialise from an AST: splice the body in as <b>verbatim source text</b>, and
      represent what will not parse as an explicit opaque node
      (<code>app._unparsable_cell</code>) rather than dropping it. That is our opaque cell, arrived
      at independently by someone else.</td></tr>
  <tr class="bad"><td><b><code>DirectedGraph</code> as our graph</b></td>
    <td><code>dataflow/graph.py</code></td><td class="c"><span class="no">no</span></td>
    <td>Hard-wired to <code>CellId_t</code>, and <code>CellImpl</code> carries kernel state (stale,
      disabled, run result) we have no use for.</td></tr>
  <tr class="bad"><td><b>The file format</b></td><td><code>@app.cell</code> frame</td>
    <td class="c"><span class="no">no</span></td>
    <td>Adopting it means the file stops being an ordinary module &mdash; the exact invariant the
      whole design rests on.</td></tr>
  <tr class="bad"><td><b>The one-definition rule</b></td><td><code>dataflow/definitions.py</code></td>
    <td class="c"><span class="no">no</span></td>
    <td>A load-time refusal cannot be part of a projection over code we do not own.</td></tr>
  <tr class="dim"><td>The reactive runtime</td><td><code>marimo/_runtime/</code></td>
    <td class="c">separate question</td>
    <td>Per-cell, in-memory only, no file representation. Belongs to the notebook thread &mdash; C2.</td></tr>
</table></div>
<p style="font-size:12.5px;color:var(--dim2)">marimo is <b>Apache-2.0</b> throughout the analysis code
(<code>license = "Apache-2.0"</code> in <code>pyproject.toml</code>), so porting with attribution is
clean &mdash; unlike <code>ryvencore</code>, which is LGPL-2.1 and which I would not read.</p>

<h2>The shape of the whole answer</h2>
<div class="lede orange">
  <p><b>Every system that keeps a graph and a text file honestly in sync does it by owning something.</b>
  MPS owns the storage, so there is no text to disagree with. Enso owns the language, so both faces
  are native. marimo owns the file&rsquo;s frame, so it always knows where a cell begins. Each is a
  real achievement, and each buys sync with the same currency: <b>control of the format</b>.</p>
  <p style="margin-top:10px">Your design pays none of that, which is why nothing in the sweep matches
  it &mdash; and also why it is the only version where the file stays a file. The price is that the
  boundary detection is <em>ours</em>: no one else can tell us where a node begins, because everyone
  else decided that in advance by owning the frame. That is the work, it is one AST walk over
  <code>ast.Module.body</code>, and between pyblocks&rsquo; <code>views[]</code> (which already has
  the definitions and their exact spans) and marimo&rsquo;s visitor (which already resolves the
  references), both halves exist.</p>
</div>

<h2>What needs you</h2>
<p style="color:var(--dim);margin-bottom:16px">Three, each with the reversible default.</p>
{ASK_HTML}
{overall_box("a correction, or what to do first…")}

<h2>What I did not do</h2>
<div class="lede">
  <p><b>No code toward the feature</b>, and nothing installed into the repo &mdash; marimo and
  pyflow-analysis were fetched into throwaway <code>uvx</code> environments and are not dependencies
  of anything.</p>
  <p><b>No re-run of the &ldquo;what is marimo&rdquo; question</b> &mdash; <a href="{KEYIDEAS}">the
  key-ideas report</a> already covers the five ideas and where marimo appears in your vault, and this
  deliberately does not repeat it. The delta here is narrow and specific: can the engine back a
  definition-level view over code marimo did not author.</p>
  <p><b>No judgement on the reactive runtime</b> for the canvas-notebook thread &mdash; that is the
  other agent&rsquo;s, and the stale/autorun model deserves to be judged on its own terms there
  rather than through this question.</p>
</div>

{dock("marimo, measured (2026-09-18)", "item", len(ASKS))}

<footer class="page">
<p><b>Run, not relayed.</b> marimo {FACTS['marimo_v']} and pyflow-analysis 0.1.1 were fetched with
<code>uvx</code> and pointed at one hand-written {FACTS['lines']}-line module. Every artifact is kept
beside this page in <code>reports/media/marimo-probe/</code> &mdash; the input
(<code>plain_module.py</code>), the converted output (<code>converted.py</code>), the
expression-grain dump (<code>estimate_pair_ddg.text</code>) and the script that read the headless
graph (<code>probe.py</code>) &mdash; so every figure above can be reproduced or contradicted.</p>
<p><b>Source claims</b> (file format, <code>toplevel.py</code> constraints, the one-definition rule,
licence) come from a sonnet agent reading <code>marimo-team/marimo</code> on <code>main</code>, and the
load-path and graph claims were then re-tested here directly. Where my own first test disagreed with
the agent, the agent was right and the correction is in the body rather than quietly dropped.</p>
<p><b>Built by</b> <code>docs/build_marimo_report.py</code> from <code>{FACTS['head']}</code>.
Earlier in this thread: <a href="{PRIOR}">the prior-art sweep</a> and
<a href="{ANSWERS}">the answers pass</a>.</p>
</footer>

</div>
<script>{FB_JS}</script>
</body></html>"""

report_size(HTML, OUT)
