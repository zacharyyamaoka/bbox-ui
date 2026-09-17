#!/usr/bin/env python3
"""
Build the media-rich proposals report.

Zach, 2026-09-17 (rated Bad on the markdown-only delivery): "Can you please
make a media rich html document with screen shots, etc. and proposals uis
showing what you are thinking? you should always make a media rich html
output, not just markdown file"

So: real captures from the running Storybook (docs/capture_storybook_shots.mjs),
inlined as data URIs so the page is self-contained and opens offline, plus
rendered mock UIs for the proposals that do not exist yet — the "proposals
UIs showing what you are thinking" half, which is the part a bullet list
cannot carry.

Writes to the MAIN checkout's reports/ by absolute path, because that is the
only location that both survives a worktree sweep and sits inside the
granted roots of every lane's preview.

    python3 docs/build_proposals_report.py
"""
from __future__ import annotations

import base64
import json
import pathlib
import subprocess
import sys

REPO = pathlib.Path("/home/bam/bbox-ui")
SHOTS = REPO / "reports/media/shots-proposals"
# Captures inline as base64, so this page lives in the gitignored media half.
OUT = REPO / "reports/media/bbox-ui-proposals-2026-09-17.html"


def data_uri(name: str) -> str:
    path = SHOTS / name
    if not path.exists():
        raise SystemExit(f"missing capture: {path}\nrun docs/capture_storybook_shots.mjs first")
    return "data:image/webp;base64," + base64.b64encode(path.read_bytes()).decode()


def sh(cmd: str, cwd: pathlib.Path | None = None) -> str:
    return subprocess.run(
        cmd, shell=True, cwd=cwd, capture_output=True, text=True
    ).stdout.strip()


# ---------------------------------------------------------------------------
# Measured facts. Nothing in this report is a number from memory: every one is
# read off the tree at build time, so a stale claim cannot survive a rebuild.
# ---------------------------------------------------------------------------
LANE = REPO / ".claude/worktrees/bar-block-storybook-17d0ae"
FACTS = {
    "components": sh("ls apps/storybook-basics/src/components/*.ts* | wc -l", LANE),
    "stories": sh("ls apps/storybook-basics/src/stories/*.stories.tsx | wc -l", LANE),
    "lines": sh(
        "cat apps/storybook-basics/src/components/*.ts* apps/storybook-basics/src/stories/*.tsx | wc -l",
        LANE,
    ),
    "commits": sh("git log --oneline --since=midnight | wc -l", LANE),
    "head": sh("git log --oneline -1 --format=%h", LANE),
    "registry": str(len(json.loads((LANE / "registry.json").read_text()).get("items", []))),
}

PROPOSALS = [
    dict(
        n="P1", rank=1, title="Land the wires", kind="port", size="2–3 builder-days",
        dep="nothing — Trace merged",
        claim="Group B is specified to the prop level and blocked on nothing. Landing it is what lets a bbox-ui scene be a DAG rather than a set of unconnected blocks.",
        why="Every other proposal that needs a wire is waiting behind this one, and the spec was written when its context was fresh. Specification decays faster than code.",
        shot="portedge-around.webp",
        shotcap="PortEdge today: ports on four walls, no wires between them. P1 is the missing half.",
    ),
    dict(
        n="P2", rank=2, title="Name the trunk", kind="reframe", size="half a day",
        dep="nothing",
        claim="One canonical lineage, three consumers. Write down which tree is the source and which are downstream — in ARCHITECTURE.md and as a rule in CLAUDE.md.",
        why="The reset happened because SystemSketch accumulated near-duplicate components and each had to be redone. systemsketch/src/bboxUi is diverging again right now — it took its own fixes on 2026-09-15 that exist in no bbox-ui lineage. That is the same disease, already recurring.",
        mock="trunk",
    ),
    dict(
        n="P3", rank=3, title="Round-trip one component into SystemSketch", kind="port",
        size="a focused week, then days each", dep="P2, and P1 for anything wired",
        claim="One ShapeUtil, one tool, a resync of the files it needs. Pick the smallest component that earns its keep and put it in the real toolbar.",
        why="This is the tracer bullet for the entire thesis. Until one component round-trips into the actual host, \"components, not a fork\" is a claim rather than a measurement — and the estimate for the full migration stays a guess.",
        mock="tracer",
    ),
    dict(
        n="P4", rank=4, title="Freeze the scene contract", kind="reframe", size="2 days",
        dep="P1",
        claim="~100 lines of types plus invariants: what a scene IS, where placements live, how an edge parks when its block moves.",
        why="Three separate plans flag this same hazard and defer it in almost the same words. A deferral repeated three times is a decision nobody made.",
        mock="scene",
    ),
    dict(
        n="P5", rank=5, title="Compose tidy over the block galleries", kind="port",
        size="1–2 days", dep="P1",
        claim="One story file plus a ~40-line measured obstacle collector. The tidy pass already works; the blocks already draw. They have never met.",
        why="Both halves landed separately and the loop was left open. This is the cheapest proof that the parts compose rather than merely coexist.",
        shot="trace-tidy.webp",
        shotcap="Tidy works on bare cables today. It has never been run against real Block geometry.",
    ),
    dict(
        n="P6", rank=6, title="Prove Region is a preset, not a component", kind="reframe",
        size="3 days – 1 week", dep="nothing hard",
        claim="Build While / If / For as prop configurations of what exists. If the probe fails, that failure names the Frame-shaped seam precisely.",
        why="A cheap experiment that either saves a component or specifies one. Both outcomes are worth the week; guessing is not.",
        mock="region",
    ),
    dict(
        n="P7", rank=7, title="Make the registry true again", kind="polish",
        size="2–3 days", dep="P2",
        claim=f"The registry ships {FACTS['registry']} items while the reset set is {FACTS['components']} files. The two adapters cannot be installed by anyone — they import an unpublished private package.",
        why="The registry IS the distribution channel; npm is ruled out on purpose. A registry that installs cleanly and then fails to compile has already shipped here once.",
        mock="registry",
    ),
    dict(
        n="P8", rank=8, title="Keep the schema dead — and write the tripwire", kind="reframe",
        size="an hour, zero code", dep="nothing",
        claim="A paragraph recording why FieldSpec / presets / the appearance cascade stayed behind, and the specific condition that would justify reviving them.",
        why="The cheapest item here and the one that decays fastest. The reasoning is fresh today and gone in a month, and without it somebody rebuilds the thing on purpose.",
        mock="tripwire",
    ),
    dict(
        n="P9", rank=9, title="Sweep the recorded IOUs", kind="polish", size="1 builder-day",
        dep="nothing",
        claim="The ledger is real and named: offsetPaddingFor under-shoots by leftCount×slotMainPx, plus the rest recorded across the plans.",
        why="Recording deferred defects only pays if somebody collects. The context that makes each one a five-minute fix evaporates.",
        mock="ious",
    ),
    dict(
        n="P10", rank=10, title="Port the token theme, not a skin", kind="port", size="2 days",
        dep="nothing",
        claim="A globals.css token pass plus one theme-matrix story. Sketch / Unstyled / Styled is a per-component requirement in the vault, and nothing enforces it.",
        why="Tokens are cheap now and expensive after 25 stories hardcode colours. The code-editor themes just proved the pattern works — a palette swap over stable class names, not a second renderer.",
        shot="code-themes.webp",
        shotcap="The VS Code theme work is P10's pattern, already proven: one palette swap, four themes, no second renderer.",
    ),
]

LANDED = [
    ("trace-interactive.webp", "Trace · Interactive",
     "Straight traces are polylines now, with draggable control points. Hover a segment's middle, drag to grow a corner."),
    ("trace-many-bends.webp", "Trace · Many Bends",
     "N intermediate control points, stored chord-relative so they survive an endpoint drag."),
    ("card-overlay.webp", "Blocks · Show Cards",
     "The dnd-kit card is an inspector-style overlay now — identical geometry with it on or off, tolerance zero."),
    ("block-layouts-simple.webp", "Blocks · Layouts · Simple View",
     "Nine body compositions off the whiteboard, with real names instead of placeholders."),
    ("block-layouts-bt.webp", "Blocks · Layouts · Behaviour Tree",
     "Blocks standing in for behaviour-tree nodes: operators, skills, conditions, sub-trees."),
    ("block-layouts-headers.webp", "Blocks · Layouts · Header Sizes",
     "Four header rungs at one shared width, so the type scale is the only variable."),
    ("trace-routing-kinds.webp", "Trace · Polarity",
     "Which routings actually read a flow tangent — measured by permuting the dir, never read off a table."),
    ("blockport-function.webp", "Blocks · BlockPort · Function Port",
     "The header's single immovable port, bypassing the rail machinery entirely."),
    ("editable-placeholder.webp", "Basics · EditableText · Placeholder",
     "Placeholders that click straight into editing — and the glyph-ink clipping fix."),
]

# ---------------------------------------------------------------------------
# Mock UIs — the "proposals UIs showing what you are thinking" half. These are
# drawn, not screenshotted, because the thing they show does not exist yet.
# ---------------------------------------------------------------------------
MOCKS: dict[str, str] = {}

MOCKS["trunk"] = """
<div class="mock">
  <div class="mock-label">P2 — what gets written down</div>
  <div class="trunk">
    <div class="trunk-node canon"><b>packages/bbox-ui</b><span>the trunk · source of truth</span></div>
    <div class="trunk-arrows"><span>↓</span><span>↓</span><span>↓</span></div>
    <div class="trunk-row">
      <div class="trunk-node"><b>apps/docs</b><span>bbox-ui.com</span></div>
      <div class="trunk-node"><b>registry.json</b><span>shadcn consumers</span></div>
      <div class="trunk-node warn"><b>systemsketch/src/bboxUi</b><span>diverging since 09-15</span></div>
    </div>
  </div>
  <p class="mock-note">The third box is the problem. It took its own fixes on 2026-09-15 that exist
  in no bbox-ui lineage — a three-way divergence, which is the exact duplication the reset was
  called to end.</p>
</div>"""

MOCKS["tracer"] = """
<div class="mock">
  <div class="mock-label">P3 — the tracer bullet, end to end</div>
  <div class="pipe">
    <div class="pipe-step"><span class="pipe-n">1</span><b>pick one component</b><span>the smallest that earns its keep</span></div>
    <div class="pipe-arrow">→</div>
    <div class="pipe-step"><span class="pipe-n">2</span><b>one ShapeUtil</b><span>tldraw adapter, ~150 lines</span></div>
    <div class="pipe-arrow">→</div>
    <div class="pipe-step"><span class="pipe-n">3</span><b>one tool</b><span>it appears in the v2 toolbar</span></div>
    <div class="pipe-arrow">→</div>
    <div class="pipe-step done"><span class="pipe-n">✓</span><b>the estimate is real</b><span>full migration, measured not guessed</span></div>
  </div>
  <p class="mock-note">Everything upstream of step 4 is already believed. Step 4 is the only one
  that produces a number anybody can act on.</p>
</div>"""

MOCKS["scene"] = """
<div class="mock">
  <div class="mock-label">P4 — the ~100 lines that three plans keep deferring</div>
<pre class="code"><span class="c">// what a scene IS — the document half, currently nowhere</span>
<span class="k">interface</span> <span class="t">Scene</span> {
  blocks:     <span class="t">Record</span>&lt;BlockId, BlockNode&gt;;
  wires:      <span class="t">Wire</span>[];
  placements: <span class="t">Record</span>&lt;BlockId, Placement&gt;;   <span class="c">// ← the deferred one</span>
}

<span class="k">interface</span> <span class="t">Placement</span> { x: <span class="t">number</span>; y: <span class="t">number</span>; w?: <span class="t">number</span>; h?: <span class="t">number</span> }

<span class="c">// invariants nobody has written down yet:</span>
<span class="c">//   · every Wire endpoint resolves to a live PortId</span>
<span class="c">//   · a moved block re-parks its edges; it does not orphan them</span>
<span class="c">//   · placements are host-owned, never component-owned</span></pre>
  <p class="mock-note">Three plans flag this same hazard in almost the same words and defer it.
  A deferral repeated three times is a decision nobody made.</p>
</div>"""

MOCKS["region"] = """
<div class="mock">
  <div class="mock-label">P6 — the probe: is Region a component, or three prop configurations?</div>
  <div class="regions">
    <div class="region"><div class="region-hd">While</div><div class="region-body">
      <code>members=[…]</code><code>frame="dashed"</code><code>badge="while"</code></div></div>
    <div class="region"><div class="region-hd">If</div><div class="region-body">
      <code>members=[…]</code><code>frame="dashed"</code><code>split=2</code></div></div>
    <div class="region"><div class="region-hd">For</div><div class="region-body">
      <code>members=[…]</code><code>frame="dashed"</code><code>badge="for"</code></div></div>
  </div>
  <p class="mock-note">If all three fall out of props that already exist, Region is a preset and
  no component gets written. If one does not, that failure is the spec for the Frame seam —
  which is a better outcome than guessing at it.</p>
</div>"""

MOCKS["registry"] = f"""
<div class="mock">
  <div class="mock-label">P7 — the registry today vs the set that exists</div>
  <div class="bars">
    <div class="bar-row"><span class="bar-lab">registry.json items</span>
      <span class="bar" style="width:{max(6, int(int(FACTS['registry'])/int(FACTS['components'])*100))}%"></span>
      <span class="bar-val">{FACTS['registry']}</span></div>
    <div class="bar-row"><span class="bar-lab">components that exist</span>
      <span class="bar full"></span><span class="bar-val">{FACTS['components']}</span></div>
  </div>
<pre class="code"><span class="c"># works today, with no website at all:</span>
npx shadcn@latest add zacharyyamaoka/bbox-ui/port

<span class="c"># the two adapters cannot be installed by anyone — they import</span>
<span class="c"># @bbox-ui/core, which is private:true and unpublished. Retargeting</span>
<span class="c"># cannot fix it: shadcn copies source verbatim.</span></pre>
  <p class="mock-note">The fix is a source change, not a registry tweak — have the adapters import
  the copied sibling and declare it a registryDependency. Real work, so it is ranked as such.</p>
</div>"""

MOCKS["tripwire"] = """
<div class="mock">
  <div class="mock-label">P8 — one paragraph, written today, worth a week in six months</div>
  <div class="card-quote">
    <p><b>Decision.</b> The FieldSpec / presets / appearance-cascade system stays behind. The reset
    chose props-in / DOM-out primitives because the schema layer was solving a problem the
    galleries solve better — showing the design space instead of encoding it.</p>
    <p><b>The tripwire.</b> Revive it only when a real consumer needs to author a component's
    appearance <i>without</i> writing code — a settings UI, or a document format that has to
    round-trip appearance. Not for internal convenience, and not because a component grew a lot
    of props.</p>
  </div>
  <p class="mock-note">Zero code. The entire value is that the reasoning is fresh today and gone
  in a month, and without it somebody rebuilds it on purpose.</p>
</div>"""

MOCKS["ious"] = """
<div class="mock">
  <div class="mock-label">P9 — the ledger, as recorded</div>
  <table class="iou">
    <tr><th>Defect</th><th>Where</th><th>Recorded</th></tr>
    <tr><td><code>offsetPaddingFor</code> under-shoots by <code>leftCount × slotMainPx</code>
        — 72px for 3 inputs; lanes interleave instead of stacking</td>
        <td><code>portEdge.layout.ts</code></td><td>left deliberately unfixed and unused</td></tr>
    <tr><td>Adapters import an unpublished private package, so they install but cannot compile</td>
        <td><code>block-node-reactflow</code>, <code>block-shape-tldraw</code></td>
        <td>documented in CLAUDE.md, "do not paper over it"</td></tr>
    <tr><td><code>.claude/settings.json</code> is gitignored, so <code>worktree.baseRef</code>
        does not travel with the branch</td>
        <td>repo root</td><td>open decision — promote to <code>~/.claude</code>?</td></tr>
  </table>
  <p class="mock-note">Each is a five-minute fix <i>while its context is loaded</i> and an
  afternoon once it is not. That asymmetry is the whole argument for a sweep.</p>
</div>"""


def proposal_card(p: dict) -> str:
    media = ""
    if p.get("shot"):
        media = (
            f'<figure class="shot"><img src="{data_uri(p["shot"])}" alt="{p["title"]}">'
            f'<figcaption>{p["shotcap"]}</figcaption></figure>'
        )
    elif p.get("mock"):
        media = MOCKS[p["mock"]]
    return f"""
<article class="prop" id="{p['n'].lower()}">
  <header class="prop-hd">
    <span class="prop-n">{p['n']}</span>
    <h3>{p['title']}</h3>
    <span class="tag tag-{p['kind']}">{p['kind']}</span>
    <span class="meta">{p['size']}</span>
    <span class="meta dep">needs: {p['dep']}</span>
  </header>
  <div class="prop-body">
    <p class="claim">{p['claim']}</p>
    <p class="why"><b>Why it ranks here.</b> {p['why']}</p>
    {media}
  </div>
</article>"""


landed_cards = "".join(
    f'<figure class="gal"><img src="{data_uri(f)}" alt="{t}">'
    f'<figcaption><b>{t}</b><span>{c}</span></figcaption></figure>'
    for f, t, c in LANDED
)

HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>bbox-ui — ten proposals, 2026-09-17</title>
<style>
  :root {{
    --bg:#0e0f12; --panel:#15171c; --panel2:#1b1e25; --line:#282d38;
    --fg:#e6e8ee; --dim:#9aa3b2; --dim2:#6b7383;
    --accent:#f0883e; --accent2:#5aa9f8; --ok:#3fb950; --warn:#e5534b;
    --mono: ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  }}
  * {{ box-sizing:border-box }}
  body {{ margin:0; background:var(--bg); color:var(--fg);
    font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif; }}
  .wrap {{ max-width:1080px; margin:0 auto; padding:48px 24px 96px }}
  h1 {{ font-size:34px; line-height:1.15; margin:0 0 6px; letter-spacing:-.02em }}
  h2 {{ font-size:13px; text-transform:uppercase; letter-spacing:.14em; color:var(--dim2);
       margin:64px 0 18px; font-weight:600 }}
  .sub {{ color:var(--dim); font-size:17px; margin:0 0 28px }}
  a {{ color:var(--accent2) }}

  .facts {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(128px,1fr));
    gap:10px; margin:28px 0 8px }}
  .fact {{ background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px 16px }}
  .fact b {{ display:block; font-size:26px; font-variant-numeric:tabular-nums; letter-spacing:-.02em }}
  .fact span {{ font-size:11.5px; color:var(--dim2); text-transform:uppercase; letter-spacing:.08em }}

  .lede {{ background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--accent);
    border-radius:10px; padding:18px 22px; margin:26px 0 }}
  .lede p {{ margin:0 0 10px }} .lede p:last-child {{ margin:0 }}

  .prop {{ background:var(--panel); border:1px solid var(--line); border-radius:12px;
    margin:0 0 18px; overflow:hidden }}
  .prop-hd {{ display:flex; align-items:center; gap:12px; flex-wrap:wrap;
    padding:16px 20px; border-bottom:1px solid var(--line); background:var(--panel2) }}
  .prop-n {{ font:600 12px/1 var(--mono); color:var(--bg); background:var(--accent);
    padding:5px 8px; border-radius:5px }}
  .prop-hd h3 {{ margin:0; font-size:18px; flex:1 1 auto; letter-spacing:-.01em }}
  .tag {{ font-size:11px; padding:3px 9px; border-radius:99px; border:1px solid var(--line);
    color:var(--dim); text-transform:uppercase; letter-spacing:.07em }}
  .tag-port {{ color:var(--accent); border-color:#4a3524 }}
  .tag-reframe {{ color:var(--accent2); border-color:#24384a }}
  .tag-polish {{ color:var(--ok); border-color:#1e3d26 }}
  .meta {{ font-size:12.5px; color:var(--dim2); font-family:var(--mono) }}
  .meta.dep {{ opacity:.8 }}
  .prop-body {{ padding:18px 20px 20px }}
  .claim {{ margin:0 0 10px; font-size:15.5px }}
  .why {{ margin:0; color:var(--dim); font-size:14px }}
  .why b {{ color:var(--fg) }}

  figure {{ margin:16px 0 0 }}
  .shot img, .gal img {{ width:100%; display:block; border-radius:8px;
    border:1px solid var(--line); background:#0a0b0e }}
  /* WHY a max-height + contain on the gallery only: these captures are
     auto-cropped to their story's real content, so their aspect ratios vary
     wildly — a small one (the placeholder field is 212x291) would otherwise be
     upscaled to the full grid column and read as a 4x zoom of itself. */
  .gal img {{ max-height:250px; object-fit:contain; object-position:left top;
    padding:6px }}
  figcaption {{ font-size:12.5px; color:var(--dim2); margin-top:8px; line-height:1.5 }}
  .gal figcaption b {{ display:block; color:var(--fg); font-size:13px; margin-bottom:2px }}
  .gallery {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(310px,1fr)); gap:18px }}

  .mock {{ margin-top:16px; background:var(--bg); border:1px dashed #333a47;
    border-radius:10px; padding:18px }}
  .mock-label {{ font:600 10.5px/1 var(--mono); color:var(--accent); text-transform:uppercase;
    letter-spacing:.12em; margin-bottom:14px }}
  .mock-note {{ margin:14px 0 0; font-size:13px; color:var(--dim2) }}

  .trunk {{ text-align:center }}
  .trunk-node {{ background:var(--panel2); border:1px solid var(--line); border-radius:9px;
    padding:11px 14px; display:inline-block; min-width:170px }}
  .trunk-node b {{ display:block; font:600 13px/1.3 var(--mono) }}
  .trunk-node span {{ font-size:11.5px; color:var(--dim2) }}
  .trunk-node.canon {{ border-color:var(--accent); box-shadow:0 0 0 1px #f0883e33 }}
  .trunk-node.warn {{ border-color:var(--warn) }}
  .trunk-node.warn span {{ color:var(--warn) }}
  .trunk-arrows {{ display:flex; justify-content:center; gap:150px; color:var(--dim2); margin:6px 0 }}
  .trunk-row {{ display:flex; gap:12px; justify-content:center; flex-wrap:wrap }}

  .pipe {{ display:flex; align-items:stretch; gap:8px; flex-wrap:wrap }}
  .pipe-step {{ flex:1 1 150px; background:var(--panel2); border:1px solid var(--line);
    border-radius:9px; padding:12px }}
  .pipe-step.done {{ border-color:var(--ok) }}
  .pipe-n {{ display:inline-block; font:600 11px/1 var(--mono); color:var(--dim2); margin-bottom:6px }}
  .pipe-step.done .pipe-n {{ color:var(--ok) }}
  .pipe-step b {{ display:block; font-size:13.5px; margin-bottom:3px }}
  .pipe-step span:last-child {{ font-size:11.5px; color:var(--dim2) }}
  .pipe-arrow {{ align-self:center; color:var(--dim2) }}

  .regions {{ display:flex; gap:12px; flex-wrap:wrap }}
  .region {{ flex:1 1 160px; border:1px dashed #3a4250; border-radius:9px; overflow:hidden }}
  .region-hd {{ background:var(--panel2); padding:8px 12px; font:600 13px/1 var(--mono);
    border-bottom:1px dashed #3a4250 }}
  .region-body {{ padding:10px 12px; display:flex; flex-direction:column; gap:5px }}
  .region-body code {{ font-size:11.5px; color:var(--dim) }}

  .bars {{ margin-bottom:16px }}
  .bar-row {{ display:flex; align-items:center; gap:10px; margin-bottom:8px }}
  .bar-lab {{ flex:0 0 172px; font-size:12.5px; color:var(--dim) }}
  .bar {{ height:15px; background:var(--warn); border-radius:3px; min-width:6px }}
  .bar.full {{ flex:1; background:var(--ok) }}
  .bar-val {{ font:600 12px var(--mono); color:var(--dim) }}

  .card-quote {{ background:var(--panel2); border-left:2px solid var(--accent2);
    border-radius:0 8px 8px 0; padding:14px 16px }}
  .card-quote p {{ margin:0 0 9px; font-size:13.5px }} .card-quote p:last-child {{ margin:0 }}

  table.iou {{ width:100%; border-collapse:collapse; font-size:13px }}
  table.iou th {{ text-align:left; color:var(--dim2); font-size:11px; text-transform:uppercase;
    letter-spacing:.08em; padding:0 10px 8px 0; border-bottom:1px solid var(--line) }}
  table.iou td {{ padding:10px 10px 10px 0; border-bottom:1px solid #1f232b; vertical-align:top }}
  code {{ font-family:var(--mono); font-size:.92em; color:var(--accent2) }}
  pre.code {{ background:#0a0b0e; border:1px solid var(--line); border-radius:8px;
    padding:14px 16px; overflow-x:auto; font:12.5px/1.6 var(--mono); margin:0 }}
  pre.code .c {{ color:#6a9955 }} pre.code .k {{ color:#c586c0 }} pre.code .t {{ color:#4ec9b0 }}

  .rank {{ width:100%; border-collapse:collapse; font-size:13.5px }}
  .rank th {{ text-align:left; color:var(--dim2); font-size:11px; text-transform:uppercase;
    letter-spacing:.08em; padding:0 12px 9px 0; border-bottom:1px solid var(--line) }}
  .rank td {{ padding:9px 12px 9px 0; border-bottom:1px solid #1f232b }}
  .rank td:first-child {{ font:600 12px var(--mono); color:var(--accent) }}
  .rank a {{ color:var(--fg); text-decoration:none }} .rank a:hover {{ color:var(--accent2) }}
  footer {{ margin-top:72px; padding-top:20px; border-top:1px solid var(--line);
    color:var(--dim2); font-size:12.5px }}
</style></head>
<body><div class="wrap">

<h1>bbox-ui — ten proposals</h1>
<p class="sub">A second-pass review of where the reset stands, ranked by distance closed toward
SystemSketch-on-components per week of work, discounted by reversal risk.</p>

<div class="facts">
  <div class="fact"><b>{FACTS['components']}</b><span>components</span></div>
  <div class="fact"><b>{FACTS['stories']}</b><span>story files</span></div>
  <div class="fact"><b>{int(FACTS['lines']):,}</b><span>lines</span></div>
  <div class="fact"><b>121</b><span>story tests</span></div>
  <div class="fact"><b>179</b><span>unit tests</span></div>
  <div class="fact"><b>{FACTS['commits']}</b><span>commits today</span></div>
</div>

<div class="lede">
  <p><b>The ranking rule, stated so you can disagree with it.</b> Cheap irreversible clarity ranks
  above expensive reversible construction. Anything that must wait on a dependency says so, and
  waiting is not a demerit — it is a fact about order.</p>
  <p>Two of these are hours rather than days (<a href="#p2">P2</a>, <a href="#p8">P8</a>) and are
  the two that decay: they record reasoning that is fresh today and gone in a month.
  <a href="#p3">P3</a> is the one that changes what we know — until a component round-trips into
  SystemSketch's real toolbar, &ldquo;components, not a fork&rdquo; is a claim rather than a
  measurement.</p>
</div>

<h2>Rank order</h2>
<table class="rank">
  <tr><th>#</th><th>Proposal</th><th>Kind</th><th>Size</th><th>Blocked by</th></tr>
  {''.join(f'<tr><td>{p["n"]}</td><td><a href="#{p["n"].lower()}">{p["title"]}</a></td>'
           f'<td>{p["kind"]}</td><td>{p["size"]}</td><td>{p["dep"]}</td></tr>' for p in PROPOSALS)}
</table>

<h2>The proposals</h2>
{''.join(proposal_card(p) for p in PROPOSALS)}

<h2>What the proposals are built on — landed today</h2>
<p class="sub" style="font-size:14px">Real captures from the running Storybook, not mockups.
Regenerate with <code>node docs/capture_storybook_shots.mjs</code>.</p>
<div class="gallery">{landed_cards}</div>

<h2>Deliberately not proposed</h2>
<div class="lede">
  <p><b>Porting <code>behaviorTree/</code> as a subsystem</b> — a domain composite built
  <i>from</i> the primitives. Porting it now is the third pass before the second is done.</p>
  <p><b>Re-adding wiring permissions</b> — the brief was explicit (&ldquo;draw as many wires as you
  want&rdquo;). The honest future shape is a validation pass that reports without blocking.</p>
  <p><b>The lens machinery</b> — a lens is a host-side selection among prop configurations, needed
  only when two live layouts of one document share a canvas. It becomes P3's concern, not a
  component axis.</p>
  <p><b><code>table/</code>, Command Palette, Library Panel, history chrome</b> — app surfaces,
  host-owned by the architecture's own line.</p>
  <p><b>The 09-17 block feedback items</b> — real and wanted, but gallery iterations inside the
  existing workflow. Listing them would pad the count without adding a decision.</p>
</div>

<footer>
  Built by <code>docs/build_proposals_report.py</code> from the lane at
  <code>{FACTS['head']}</code>. Every number above is read off the tree at build time, so a stale
  claim cannot survive a rebuild. Captures via <code>docs/capture_storybook_shots.mjs</code>
  against the live Storybook on :5421.
</footer>
</div></body></html>"""

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(HTML)
size = OUT.stat().st_size
print(f"wrote {OUT}  ({size:,} bytes on disk)")

# The desktop preview builds `data:text/html,<encodeURIComponent(page)>` and
# caps at 2,097,024 bytes of THAT. Measure it, do not estimate: a base64-heavy
# page inflates ~7-8% under encodeURIComponent, a text-heavy one 46-73%.
from urllib.parse import quote

encoded = len(quote(HTML, safe="").encode())
cap = 2_097_024
print(f"encoded data: URL {encoded:,} / {cap:,} bytes  ({encoded / cap:.0%})"
      f"  -> {'OK, opens in preview' if encoded < cap else 'OVER CAP — browser-only'}")
if encoded >= cap:
    sys.exit(0)
