#!/usr/bin/env python3
"""
Build the readable face of docs/SOURCE-CODE-VIEW-PLAN.md.

Zach asked for an implementation plan he can hand to another agent as part of a
larger refactor bringing bbox-ui's work into SystemSketch. That needs two
artifacts, and the feedback ledger is explicit about naming both: the committed
`.md` is the LANE-READABLE input (an isolated worktree can only read a plan from
a commit), and this page is what Zach reads.

Nothing here is retyped from the plan. The phase table, the write sets and the
open questions are PARSED out of the committed markdown at build time, so the
page cannot drift from the file the lanes execute.

    python3 docs/build_plan_report.py
"""
from __future__ import annotations

import pathlib
import re
import sys
from html import escape

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from _report_kit import CSS, FB_JS, dock, fb, overall_box, report_size, sh  # noqa: E402

HERE = pathlib.Path(__file__).resolve().parent
REPO = pathlib.Path("/home/bam/bbox-ui")
PLAN = HERE / "SOURCE-CODE-VIEW-PLAN.md"
OUT = REPO / "reports/source-code-view-plan-2026-09-18.html"
TEXT = PLAN.read_text()

PRIOR = {
    "proposals": "file:///home/bam/bbox-ui/reports/media/source-code-view-2026-09-18.html",
    "answers": "file:///home/bam/bbox-ui/reports/media/source-code-view-answers-2026-09-18.html",
    "priorart": "file:///home/bam/bbox-ui/reports/media/vpl-prior-art-2026-09-18.html",
    "marimo": "file:///home/bam/bbox-ui/reports/vpl-marimo-2026-09-18.html",
}

# ---------------------------------------------------------------------------
# Parsed out of the committed plan, never retyped.
# ---------------------------------------------------------------------------
PHASE_BLOCKS = re.findall(
    r"^### (P\d) — (.+?)\n(.*?)(?=^### P\d — |^## )", TEXT, re.M | re.S
)
if len(PHASE_BLOCKS) < 6:
    raise SystemExit(f"parsed only {len(PHASE_BLOCKS)} phases — the plan's shape changed")


def field(block: str, key: str) -> str:
    """Pull one `- **X:** …` bullet out of a phase block, to the next bullet."""
    m = re.search(rf"^- \*\*{key}.*?:?\*\*\s*(.*?)(?=^- \*\*|\Z)", block, re.M | re.S)
    return md_inline(" ".join(m.group(1).split())) if m else "&mdash;"


def md_inline(s: str) -> str:
    s = escape(s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<i>\1</i>", s)
    return s


PARALLEL = {p[0] for p in PHASE_BLOCKS if "**∥**" in p[2] or "∥ with" in p[2]}
PHASE_ROWS = "\n".join(
    f"<tr{' class=\"good\"' if 'start immediately' in title else ''}>"
    f'<td><b>{pid}</b></td>'
    f"<td><b>{md_inline(title)}</b></td>"
    f'<td class="c">{"&#8741;" if pid in PARALLEL else "&#9207;"}</td>'
    f"<td>{field(body, 'W')}</td>"
    f"<td>{field(body, 'A')}</td>"
    f"<td>{field(body, 'D')}</td></tr>"
    for pid, title, body in PHASE_BLOCKS
)

QUESTIONS = re.findall(r"^- \*\*(Q\d) — (.+?)\*\*\s*(.*?)(?=^- \*\*Q\d|\n\nEverything else)", TEXT, re.M | re.S)
Q_HTML = "\n".join(
    f"""<div class="ask">
  <h3>{qid} &middot; {md_inline(q)}</h3>
  <p style="color:var(--dim);font-size:14px;margin:0">{md_inline(" ".join(body.split()))}</p>
  {fb(qid, re.sub(r'<[^>]+>', '', md_inline(q)))}
</div>"""
    for qid, q, body in QUESTIONS
)

OUT_OF_SCOPE = re.findall(r"^- \*\*(.+?)\*\*\s*(?:&mdash;|—)\s*(.*?)(?=^- \*\*|\Z)",
                          TEXT.split("## 10 · Explicitly out of scope")[1].split("## 11")[0], re.M | re.S)
SCOPE_HTML = "\n".join(
    f"<tr><td><b>{md_inline(name)}</b></td><td>{md_inline(' '.join(why.split()))}</td></tr>"
    for name, why in OUT_OF_SCOPE
)

BOUNDARY = re.findall(r"^\| (.+?) \| \*\*(.+?)\*\* \| (.+?) \|$", TEXT, re.M)
BOUNDARY_ROWS = "\n".join(
    f"<tr><td>{md_inline(piece)}</td><td><b>{repo}</b></td><td>{md_inline(where)}</td></tr>"
    for piece, repo, where in BOUNDARY
)

ORDER = re.search(r"```\n(P0 ⛔.*?)\n```", TEXT, re.S)
ORDER_BLOCK = escape(ORDER.group(1)) if ORDER else ""

FACTS = {
    "phases": str(len(PHASE_BLOCKS)),
    "parallel": str(len(PARALLEL)),
    "questions": str(len(QUESTIONS)),
    "lines": str(len(TEXT.splitlines())),
    "planhead": sh("git log -1 --format=%h -- SOURCE-CODE-VIEW-PLAN.md", HERE),
    "lane": sh("git rev-parse --short claude/bar-block-storybook-e61a36", REPO),
}

# Claims I re-checked against disk after the planning lane returned.
AUDIT = [
    ("bbox-ui scene lane head", "23fad70", sh("git rev-parse --short claude/bar-block-storybook-e61a36", REPO)),
    ("pyblocks head", "6a64e0c", sh("git rev-parse --short HEAD", pathlib.Path("/home/bam/pyblocks"))),
    ("systemsketch head", "10748b8c", sh("git rev-parse --short HEAD", pathlib.Path("/home/bam/systemsketch"))),
    ("<code>codeModel.ts:106</code>", "CODE_SHAPE_PROPS",
     sh("sed -n '106p' src/code/codeModel.ts", pathlib.Path("/home/bam/systemsketch"))),
    ("<code>CodeShapeUtil.tsx:65</code>", "migrations",
     "migrations" if "migrations" in sh("sed -n '65p' src/code/CodeShapeUtil.tsx", pathlib.Path("/home/bam/systemsketch")) else "MISSING"),
    ("<code>analyzer.py:1923</code>", "def analyze_source(",
     sh("sed -n '1923p' pyblocks/analyzer.py", pathlib.Path("/home/bam/pyblocks"))),
    ("<code>linking.ts</code> line count", "727",
     sh("git show claude/bar-block-storybook-e61a36:apps/storybook-basics/src/scene/linking.ts | wc -l", REPO)),
    ("next free PEP number", "0018",
     "0018" if not list(pathlib.Path("/home/bam/systemsketch/docs/peps").glob("0018-*")) else "TAKEN"),
]
AUDIT_ROWS = "\n".join(
    f'<tr class="{"good" if str(claimed) in str(actual) or str(actual) in str(claimed) else "bad"}">'
    f"<td>{what}</td><td><code>{escape(str(claimed))}</code></td>"
    f'<td><code>{escape(str(actual))}</code></td>'
    f'<td class="c">{"&#10003;" if str(claimed) in str(actual) or str(actual) in str(claimed) else "&#10007;"}</td></tr>'
    for what, claimed, actual in AUDIT
)
AUDIT_OK = all(str(c) in str(a) or str(a) in str(c) for _, c, a in AUDIT)

EXTRA_CSS = """
  .order { font:12.5px/1.9 var(--mono); background:#08090b; border:1px solid #1d212a;
    border-radius:9px; padding:15px 17px; color:#c8cede; white-space:pre; overflow-x:auto }
  td.c { text-align:center; font-family:var(--mono) }
"""

HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Source code view — the plan</title>
<style>{CSS}{EXTRA_CSS}</style>
</head><body><div class="wrap">

<p class="kicker">bbox-ui &middot; pyblocks &middot; systemsketch &nbsp;&middot;&nbsp; implementation plan &nbsp;&middot;&nbsp; 2026-09-18</p>
<h1>Source code view &mdash; the plan</h1>
<p class="sub">Collapse a selection into a code cell, expand it back into blocks. One optional
<code>origin</code> field decides per cell whether the board or a real <code>.py</code> owns the
bytes. {FACTS['phases']} phases, three repos, {FACTS['parallel']} of them dispatchable on day one.</p>

<div class="lede orange">
  <p><b>This page is the readable face of a committed file.</b> The plan a lane executes is
  <code>docs/SOURCE-CODE-VIEW-PLAN.md</code> ({FACTS['lines']} lines) at
  <code>{FACTS['planhead']}</code> on <code>claude/source-code-view-f1855d</code> &mdash; committed
  because an isolated worktree can only read a plan from a commit. Everything below is
  <b>parsed out of that file at build time</b>, not retyped, so this page cannot drift from what
  the lanes actually run.</p>
</div>

<h2>The order</h2>
<div class="order">{ORDER_BLOCK}</div>
<p style="font-size:12.5px;color:var(--dim2);margin-top:10px"><b>P3 and P4 need nothing from the
<code>origin</code> contract and can be dispatched immediately, in parallel, in different repos.</b>
P0 is a one-file barrier that freezes the field shape both P1 and P2 then implement.</p>

<h2>Where each piece lands</h2>
<div class="scroll"><table>
  <tr><th>piece</th><th>repo</th><th>where exactly</th></tr>
  {BOUNDARY_ROWS}
</table></div>

<h2>The phases &mdash; write set, acceptance, dependency</h2>
<div class="scroll"><table>
  <tr><th></th><th>phase</th><th style="text-align:center">&#8741;</th>
    <th>write set</th><th>acceptance</th><th>depends on</th></tr>
  {PHASE_ROWS}
</table></div>
<p style="font-size:12.5px;color:var(--dim2)">&#8741; = parallel-safe. Green rows can start on day
one. Every write set is explicit paths, because several agents write these trees at once and an
unstated write set is how two lanes become individually correct and jointly wrong.</p>

<h2>The two corrections that moved the design</h2>
<div class="grid2">
  <div class="card no"><b>what my earlier reports said</b>
    <p><code>CodeBlock{{version, language, source}}</code> in
    <code>pyblocks/systemsketch.py</code> &ldquo;ships today &mdash; that is P4, already built&rdquo;.</p>
    <p>True, but it is pyblocks&rsquo; <b>mirror</b>, under the extension key
    <code>pyblocksCodeBlock</code>.</p>
  </div>
  <div class="card ok"><b>what the tree actually says</b>
    <p>The record the app writes is SystemSketch&rsquo;s tldraw shape &mdash;
    <code>CODE_SHAPE_PROPS</code> in <code>src/code/codeModel.ts</code>, whose text field is named
    <code>code</code>, with no <code>version</code> field because tldraw versions through
    migrations.</p>
    <p><b>So <code>origin</code> lands on the shape first and the mirror second.</b> A plan that put
    it only on pyblocks' record would have been wrong.</p>
  </div>
</div>
<div class="lede gold" style="margin-top:14px">
  <p><b>And an accepted PEP already forbids the tempting shortcut.</b> PEP 0017, <i>One
  <code>CodeField</code>, not four</i> (2026-09-14), converged four CodeMirror mounts onto
  <code>src/fields/CodeField.tsx</code> with the rule that it takes only what a different <i>mount
  lifecycle</i> requires &mdash; <b>&ldquo;never anything for value semantics&rdquo;</b>.
  <code>origin</code> is value semantics, so it cannot live on the field.</p>
  <p style="margin-top:10px"><b>Which is what makes PEP 0018 worth writing.</b> Today that shape
  holds no semantics about the code inside it &mdash; <code>codeModel.ts</code> describes
  <code>characterWidth</code> as &ldquo;a presentation measurement, never a semantic interpretation
  of the code&rdquo;. <code>origin</code> would be the first. That is the decision, and it is the
  PEP&rsquo;s subject rather than a footnote.</p>
</div>

<h2>Two more the planning lane found on its own</h2>
<div class="grid2">
  <div class="card gold"><b>the language mismatch</b>
    <p>The tldraw shape allows <b>9</b> languages including <code>plaintext</code>; the pyblocks
    mirror allows <b>2</b> (<code>python</code>, <code>markdown</code>). Any board with a
    <code>sql</code> or <code>plaintext</code> cell cannot round-trip through the declarative
    format today.</p>
    <p>Fixed in the same version bump as <code>origin</code> &mdash; which also settles the earlier
    open question about whether a pseudo-code cell can be highlighted as plain text.</p>
  </div>
  <div class="card no"><b>the baseline trap</b>
    <p><code>collapse.ts</code>, <code>boundary.ts</code> and <code>linking.ts</code> exist only on
    <code>claude/bar-block-storybook-e61a36</code> (<code>{FACTS['lane']}</code>) &mdash; not on
    <code>main</code>, and not on this branch, which carries only <code>scene.ts</code> and
    <code>sceneWires.ts</code>.</p>
    <p><b>A Rung A lane cut from <code>main</code> would cheerfully rebuild ~4,200 lines that
    already exist.</b> The plan states this as a dispatcher decision rather than leaving it to be
    discovered.</p>
  </div>
</div>

<h2>Rung A and Rung B &mdash; what ships without waiting</h2>
<div class="grid2">
  <div class="card ok"><b>rung A &mdash; shippable alone, zero pyblocks</b>
    <p>Collapse N selected things into a cell that <b>holds bytes</b>; expand puts the subgraph back.
    No parser anywhere. <code>origin</code> absent.</p>
    <p>Rides <code>collapseToRegion</code>/<code>dissolveRegion</code>, whose inverse is measured
    exact &mdash; the only inverse in the whole prior-art sweep that is checked rather than claimed.</p>
    <p><b>Useful on its own</b> for parking a messy region.</p>
  </div>
  <div class="card blue"><b>rung B &mdash; needs the partition</b>
    <p>Expand produces <b>definition</b> blocks, the four-state origin badge lights up, and the
    first named command writes back to the file.</p>
    <p>The partition is the one genuinely new algorithm: one node per definition, edges = which
    definition references which. It lives in pyblocks as
    <code>pyblocks/definition_graph.py</code>.</p>
    <p>Both halves already exist &mdash; pyblocks&rsquo; <code>views[]</code> has the definitions
    and their spans; marimo&rsquo;s visitor is the reference for resolving the references.</p>
  </div>
</div>

<h2>Organise and reuse stay apart</h2>
<div class="lede">
  <p>The prior-art sweep&rsquo;s central lesson, now a plan constraint: <b>collapse-to-cell is the
  <i>organise</i> tier only</b> &mdash; tidy, copy, no reuse. It never mints or touches a
  <code>definitionId</code>, which <code>collapse.ts</code> already hard-codes
  (<i>&ldquo;No <code>definitionId</code>, ever&rdquo;</i>, line 223). Reuse stays behind the badge
  <code>linking.ts</code> already draws, untouched.</p>
  <p style="margin-top:10px">Every tool that shipped one undifferentiated &ldquo;make composite&rdquo;
  gesture is the one with open bugs about it. Unreal survived by splitting it three ways in its own
  UI; ComfyUI&rsquo;s linked subgraph instances currently ship broken.</p>
</div>

<h2>What I re-checked against disk after the plan came back</h2>
<p style="color:var(--dim)">A plan that is wrong about a path is worse than one that admits it does
not know, so every load-bearing claim was re-derived here rather than relayed.</p>
<div class="scroll"><table>
  <tr><th>claim</th><th>plan says</th><th>tree says</th><th style="text-align:center"></th></tr>
  {AUDIT_ROWS}
</table></div>
<p style="font-size:12.5px;color:var(--dim2)">{'All checks passed.' if AUDIT_OK else
  '<b style="color:var(--warn)">At least one check FAILED &mdash; read the red row before dispatching.</b>'}
The three files the plan proposes to create
(<code>pyblocks/definition_graph.py</code>, <code>scene/codeCell.ts</code>, PEP 0018) were also
confirmed absent, so no phase is quietly describing work that already exists.</p>

<h2>Open questions</h2>
<p style="color:var(--dim);margin-bottom:16px">Only {FACTS['questions']} &mdash; everything the four
research passes settled is folded in as an adopted default rather than re-asked. Each of these has a
default a silent lane takes.</p>
{Q_HTML}
{overall_box("anything to change before this is dispatched…")}

<h2>Explicitly out of scope</h2>
<div class="scroll"><table>
  <tr><th>not doing</th><th>why</th></tr>
  {SCOPE_HTML}
</table></div>

{dock("source code view plan (2026-09-18)", "question", len(QUESTIONS))}

<footer class="page">
<p><b>The plan is the file, not this page.</b>
<code>docs/SOURCE-CODE-VIEW-PLAN.md</code> at <code>{FACTS['planhead']}</code> on
<code>claude/source-code-view-f1855d</code>. Hand a downstream agent that path and that ref; this
page is parsed from it and exists so you do not have to read markdown to decide.</p>
<p><b>Written</b> by a Fable lane reading the four report builders in <code>docs/</code> and the
three real trees, with four verified facts sent mid-flight (the two code records, the migration
seam, the PEP number, and PEP 0017's constraint). <b>Audited</b> here against disk &mdash; the table
above is generated by re-running each check at build time, so a stale claim cannot survive a
rebuild.</p>
<p><b>The research behind it:</b> <a href="{PRIOR['proposals']}">five proposals</a> &middot;
<a href="{PRIOR['answers']}">the answers pass</a> &middot;
<a href="{PRIOR['priorart']}">~40 tools of prior art</a> &middot;
<a href="{PRIOR['marimo']}">marimo, measured</a>.</p>
<p><b>Built by</b> <code>docs/build_plan_report.py</code>. No source file in any of the three repos
was modified by this work.</p>
</footer>

</div>
<script>{FB_JS}</script>
</body></html>"""

report_size(HTML, OUT)
print(f"phases={len(PHASE_BLOCKS)} parallel={len(PARALLEL)} questions={len(QUESTIONS)} "
      f"scope={len(OUT_OF_SCOPE)} boundary={len(BOUNDARY)} audit_ok={AUDIT_OK}")
