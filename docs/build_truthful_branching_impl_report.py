#!/usr/bin/env python3
"""Build reports/media/truthful-branching-implemented-2026-09-22.html.

The implementation report for the truthful-branching grammar and Zach's
"new header formatting on the blocks" note (2026-09-22). Every drawing here
is a REAL capture off the real Storybook — nothing in this report is a mock,
which is the difference between it and its afternoon sibling
(`truthful-branching-2026-09-22.html`, the proposal).

    python3 docs/build_truthful_branching_impl_report.py
"""
from __future__ import annotations
import pathlib, sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _report_kit import CSS, FB_JS, fb, dock, overall_box, report_size, shot, sh  # noqa

HERE = pathlib.Path(__file__).resolve().parent
TREE = HERE.parent
MAIN = pathlib.Path("/home/bam/bbox-ui")
CAP = MAIN / "reports/media/truthful-branching-2026-09-22"
VAULT = pathlib.Path("/home/bam/zach_brain")
OUT = MAIN / "reports/media/truthful-branching-implemented-2026-09-22.html"

BRANCH = sh("git rev-parse --abbrev-ref HEAD", TREE)
HEAD = sh("git rev-parse --short HEAD", TREE)
# a971c0c is the merge that brought main in; everything AFTER it on this
# branch is this change set. `--no-merges` drops that merge itself.
COMMITS = sh("git log --oneline --no-merges --reverse a971c0c..HEAD", TREE).splitlines()


def cap(name: str, q: int = 72) -> str:
    return shot(CAP / name, quality=q)


def fig(name: str, caption: str, q: int = 72) -> str:
    return (f'<figure class="cap"><img src="{cap(name, q)}" alt=""/>'
            f'<figcaption>{caption}</figcaption></figure>')


def sk(name: str, caption: str) -> str:
    return (f'<figure class="cap"><img src="{shot(VAULT / name, quality=70)}" alt=""/>'
            f'<figcaption>{caption}</figcaption></figure>')


def section(n, title, sub=""):
    s = f'<p class="sub">{sub}</p>' if sub else ""
    return f'<h2 id="s{n}"><span class="n">{n}</span>{title}</h2>{s}'


def page() -> str:
    rows = "".join(
        f"<tr><td><code>{c.split(' ')[0]}</code></td><td>{' '.join(c.split(' ')[1:])}</td></tr>"
        for c in COMMITS)

    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Truthful branching — implemented</title>
<style>{CSS}
.cap{{margin:0;background:#0f1114;border:1px solid #232830;border-radius:10px;padding:10px}}
.cap img{{width:100%;height:auto;display:block;border-radius:6px}}
.cap figcaption{{color:var(--dim);font-size:12.5px;margin-top:9px;line-height:1.6}}
.grid2{{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:18px 0}}
.grid3{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:18px 0}}
@media(max-width:860px){{.grid2,.grid3{{grid-template-columns:1fr}}}}
.lede{{font-size:16px;line-height:1.7}} .lede b{{color:#fff}}
.key{{border-left:3px solid #f0a83a;background:#17140c;padding:14px 18px;border-radius:0 8px 8px 0;margin:18px 0}}
.bad{{border-left-color:#e0615c;background:#1a1010}}
.ok{{border-left-color:#5cc98a;background:#0e1713}}
h2 .n{{display:inline-block;width:30px;color:#f0a83a;font-weight:800}}
.sub{{color:var(--dim);margin:-8px 0 16px;font-size:14px}}
table.m td,table.m th{{vertical-align:top;font-size:13px}}
.pill{{display:inline-block;background:#1d2230;border:1px solid #2c3444;border-radius:20px;
      padding:2px 10px;font-size:11.5px;color:#b9c3d2;margin-right:6px}}
</style></head><body><div class="wrap">

<header>
  <h1>Truthful branching — implemented</h1>
  <p class="lede">Every drawing below is a <b>real capture off the real Storybook</b>. The grammar
  from this afternoon's proposal is built: <code>match</code> is a Case Structure with one subject
  on the head card, <code>if</code>/<code>elif</code> is a ladder where each arm owns its test, and
  <code>else</code> owns nothing. Your head-tab header format is a Block prop, so a region's corner
  and an arm's row are the same component wearing different settings.</p>
  <p class="meta">worktree <code>{BRANCH}</code> @ <code>{HEAD}</code> · typecheck exit 0 ·
  313 test files / 3775 tests, the 1–3 that vary per run pass in isolation ·
  the 73 control-flow, region and header tests are green every run · 2026-09-22</p>
</header>

<div class="key">
<b>What is different from the proposal</b>
<ol style="margin:10px 0 0;padding-left:20px;line-height:1.8">
<li><b>Loops needed nothing.</b> <code>for</code> puts <code>Iterable</code> on the head and
<code>while</code> puts <code>Bool</code> there with deliberately no right wall — both already one
test for the whole structure. The split only ever touched branch and match.</li>
<li><b>Two bugs shipped behind green tests and were caught by LOOKING.</b> Both were text
collisions; every assertion measured a dot's box and none measured overlapping text. Section 4.</li>
<li><b>Two projection holes</b> — the arm's operand and any port's inline default were dropped
between the scene and the component. Section 5. Neither was found by a failing test.</li>
</ol>
</div>

{section(1, "Your header format, in the real app")}
<p>Four sketches, four stories. <code>Block.headerFit="hug"</code> is the whole prop; the tab's
rules become an L (bottom + right), and <code>showHeaderDivider={{false}}</code> still means no
rules at all.</p>
<div class="grid2">
{sk("Pasted image 20260922184414.png", "Your sketch — “Head Tab View”, and the same with the footer hidden.")}
{fig("hdr-3-head-tab.png", "Built. <code>headerFit=\"hug\"</code> beside <code>\"full\"</code> as the control — the tab's L-shaped rules, the body starting at the same line in both.")}
{sk("Pasted image 20260922184423.png", "Your sketch — “With Ports”: a dot on each edge of the tab.")}
{fig("hdr-5-tab-with-ports.png", "Built. The left dot rides the block's wall; the RIGHT dot rides the <b>tab's</b> right edge, strictly inside the block. That inequality is the whole geometric claim, and it is asserted, not eyeballed.")}
{sk("Pasted image 20260922184406.png", "Your sketch — “Ports on Header, inputs and outputs…”")}
{fig("hdr-2-ports-on-header.png", "Built. <code>band: \"header\"</code> per edge. The rails span the header strip, never the body.")}
{sk("Pasted image 20260922184507.png", "Your sketch — “Hidding header lines.”")}
{fig("hdr-6-bare-header.png", "Built. No tab outline, chevron and title only, the dot still on the header band.")}
</div>
<div class="key ok"><b>Your conclusion holds mechanically.</b> The header band is a general
<code>RailBand</code>, not a region feature — so an ordinary Block, a region's corner and an arm's
row are one geometry. <code>blockPort.layout.header.test.ts</code> pins it with 15 pure assertions
and four mutations that each turn it red.</div>
{fb("1", "The head-tab header format")}

{section(2, "if / elif / else — a ladder, each arm owning its test")}
{fig("branch-ladder-mixed.png", "The five-arm ladder you named, MIXED: <code>if:</code> and the first <code>elif:</code> are driven by real <code>==</code> blocks (hollow dot = unwired is impossible here, a cable lands); <code>elif: count &gt; 10</code> and <code>elif: retries == 0</code> are unwired and show their inline default (filled = <code>valueSet</code>, “owns a default”); <code>else:</code> has no dot at all. All five arms fan into <code>encode()</code>'s single <code>pose</code> — the join you picked on 2026-09-02, unchanged.", 76)}
<div class="grid2">
{fig("branch-wired-condition.png", "Wired: the test is a real block, so a version that called <code>sensor.read()</code> would be drawn too. This is the form that survives side effects.")}
{fig("branch-inline-default.png", "Unwired: <code>valueSet</code>. This is “in the title … we can support default variables so you don't need to pass in everything with a pill” — and it is the kit's existing port state, not a new concept.")}
{fig("branch-folded-arm.png", "One arm folded — a sibling's members do not move, because a child's position is arm-relative.")}
{fig("branch-active-arm.png", "One arm active, the rest faded to one token. The reading burden your V1 moved off the ports and onto a lens.")}
</div>
{fb("2", "The if/elif/else ladder")}

{section(3, "match — a Case Structure, and what a pattern BINDS")}
<div class="grid2">
{fig("match-case.png", "One subject on the head card, static patterns below, and NOT ONE arm dot. This is LabVIEW's Case Structure, and it is the shape the ladder above deliberately is not.")}
{fig("match-guard.png", "The case your <code>case var</code> sketch was reaching for. <code>case Point(x=0, y=y): y &gt; 0</code> — the pattern BINDS <code>y</code> (the dot on the tab's right edge, wired into <code>north()</code>) and the guard comes back in as that arm's own operand on the left. Patterns with nothing to bind own no dot.", 76)}
</div>
{fb("3", "match, captures and guards")}

{section(4, "The two bugs that shipped behind green tests", "Both text collisions. Both found by opening a PNG.")}
<div class="grid2">
{fig("v1-labeled-group.png", "<b>Before.</b> The arm's rail drew its label at the frame's left edge and the Bar drew the keyword at the same x, so <code>mode == \"fast\"</code> painted through <code>if:</code> — <code>modif:e == \"fast\"</code>, in all five region drawings, chevron overdrawn too.")}
{fig("fixed-v1.png", "<b>After.</b> <code>● ⌄ if: mode == \"fast\"</code>. The rail is a bare dot; the expression is the arm's header text, after the keyword. The gap is a margin, not a space character — a space would be indistinguishable from one you typed.")}
</div>
<div class="key bad">
<b>Neither was caught by a test, and that is the finding.</b> Every assertion measured a port dot's
<code>getBoundingClientRect()</code>; none measured whether two pieces of text occupied the same
pixels. The same class of defect hit the Block header first (<code>in</code>/<code>out</code> over
<code>Planner</code>) and then the arm row. Both now carry a measured non-overlap assertion, and the
try/except report grew a mechanical clip-checker for its hand-drawn SVGs after the same thing
happened there twice. <span class="pill">rule</span> a green assertion is not proof the drawing
reads correctly.
</div>
{fb("4", "The text-collision class of defect")}

{section(5, "Two projection holes, neither found by a failing test")}
<table class="m">
<tr><th>Hole</th><th>Symptom</th><th>Why it hid</th></tr>
<tr><td><b>The arm's operand</b><br><code>7058e86</code></td>
<td>A scene built by <code>branchNode</code> rendered arms with no dots and no condition in
<em>every</em> canvas host.</td>
<td><code>armNode</code> wrote the port's id onto the wall and dropped <code>test.default</code>;
<code>nodeViews.tsx</code> read neither. A direct <code>&lt;BlockRegion&gt;</code> caller looked
perfect, so the component and the scene were both right and only the seam between them lost the
value.</td></tr>
<tr><td><b>Any port's inline default</b><br><code>45ede4a</code></td>
<td>A <code>for</code> loop could not show <code>range(10)</code> through the scene at all — the
loop stories had to bypass it and hand-mount the component.</td>
<td><code>withWiredState</code> only ever promoted a port to <code>wired</code>. Nothing could say
“nothing is wired here, but a value is in force anyway”. Arms worked only because they carry their
own <code>test.default</code>.</td></tr>
</table>
<div class="key">
<b>The precedence, now stated and pinned:</b> a default beats an authored label (it is the more
specific fact), and a <b>cable beats a default</b> — a default is what you get in the <em>absence</em>
of a value, never instead of one. <code>portDefaults.test.ts</code> calls the real projection rather
than a copy of it; its first draft mirrored the rule in a local helper and re-spelled
<code>portKey</code> with the wrong separator, which is exactly why it now imports both.
</div>
{fb("5", "The projection holes and the precedence rule")}

{section(6, "Loops — already truthful, now covered")}
<div class="grid3">
{fig("for-loop-default-iterable.png", "<code>for</code> with an unwired <code>Iterable</code> showing <code>range(10)</code>.")}
{fig("while-loop-default-bool.png", "<code>while</code> with an unwired <code>Bool</code>, and no right wall — a condition produces no element, so an outlet would be a dot with nothing behind it.")}
{fig("while-true-break.png", "<code>while True:</code> — the condition is a literal and the real exit is a <code>break</code> mark, never a cable.")}
{fig("for-loop-nested.png", "A <code>for</code> inside a <code>for</code>, the inner <code>Iterable</code> fed by the outer's <code>Iter</code>.")}
{fig("for-loop-continue.png", "<code>continue</code> as a Badge mark beside the call.")}
{fig("while-loop-mutates.png", "A body that mutates what the condition reads — the case where the re-check actually matters.")}
</div>
{fb("6", "Loop coverage")}

{section(7, "What landed")}
<table class="m"><tr><th>Commit</th><th>What</th></tr>{rows}</table>
<div class="key">
<b>Left deliberately undone, and why</b>
<ul style="margin:10px 0 0;padding-left:20px;line-height:1.8">
<li><b>FRAME-PLAN's six-step migration is not started.</b> Your note is step 3 of it
(“Fold Block = header + Frame + footer”), and its own step 0 is “merge the two region lineages
first, or steps 4-6 are done twice”. Doing it inside this change would have been that second time.
<code>BlockRegion</code> still draws its own frame.</li>
<li><b>Two rail renderers.</b> <code>ArmHeaderRail</code> and <code>BlockPortRail</code> share all
the geometry and now differ in nothing but which one is used where — folding them is a follow-up
task chip, not worth destabilising three in-flight lanes for.</li>
<li><b>A capture's NAME has no text label</b> — the dot is there and the pattern text names the
binding, but there is no <code>region-arm-test</code> equivalent for captures.</li>
<li><b>Nothing merged to <code>main</code>.</b> Implementing is not integrating.</li>
</ul>
</div>
{fb("7", "Scope — what I left undone")}

{overall_box("what you'd change…")}
{dock("truthful-branching-implemented-2026-09-22", "item", 7)}
</div><script>{FB_JS}</script></body></html>"""


if __name__ == "__main__":
    report_size(page(), OUT)
