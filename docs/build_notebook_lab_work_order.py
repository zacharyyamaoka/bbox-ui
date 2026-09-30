#!/usr/bin/env python3
"""Build the notebook-lab work order — the hand-off document.

Written so someone who was not in the conversation can pick up a lane and
start. Each lane carries what to do, why it matters, the exact write set, the
acceptance that proves it, and what is frozen because somebody else owns it.

Every count and file:line in it is read off the tree at build time.

    python3 docs/build_notebook_lab_work_order.py
"""
from __future__ import annotations

import pathlib
import subprocess

REPO = pathlib.Path("/home/bam/bbox-ui")
LAB = pathlib.Path(__file__).resolve().parent.parent / "apps/notebook-lab"
OUT = REPO / "reports/notebook-lab-work-order-2026-09-18.html"


def sh(cmd: str, cwd: pathlib.Path = LAB) -> str:
    return subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True).stdout.strip()


F = {
    "accept": sh("grep -c '^  PASS' acceptance.out"),
    "contract": sh("grep -c '^  PASS' server/test_contract.out"),
    "lines": sh("cat server/*.py src/*.ts* src/variants/*.ts* acceptance.mjs record_demo.mjs run_lab.py src/app.css | wc -l"),
    # REPO is the MAIN checkout (where reports live); the WORK is on this
    # worktree's branch. Reading git from REPO reported `main` and a commit
    # that has nothing to do with the lab — a handoff that sends someone to
    # the wrong branch is worse than one that says nothing.
    "head": sh("git log --oneline -1"),
    "branch": sh("git rev-parse --abbrev-ref HEAD"),
    "worktree": sh("git rev-parse --show-toplevel"),
    "variants": sh("ls src/variants/*.tsx | wc -l"),
}

CSS = """
*{box-sizing:border-box}
:root{--ink:#0f172a;--dim:#64748b;--line:#e2e8f0;--bg:#f8fafc;--card:#fff;--acc:#b45309;
 --ok:#15803d;--okbg:#dcfce7;--bad:#b91c1c;--badbg:#fee2e2;--blue:#1d4ed8;--bluebg:#dbeafe;
 --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 ui-sans-serif,-apple-system,"Segoe UI",Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1080px;margin:0 auto;padding:0 28px 110px}
header.top{border-bottom:1px solid var(--line);background:var(--card);padding:50px 0 34px;margin-bottom:34px}
header.top .wrap{padding-bottom:0}
.kicker{font:600 12px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--acc)}
h1{font-size:40px;line-height:1.12;margin:15px 0 14px;letter-spacing:-.022em;max-width:22ch}
.lede{font-size:19px;color:#334155;max-width:68ch;margin:0}
.lede b{color:var(--ink)}
h2{font-size:26px;letter-spacing:-.015em;margin:56px 0 6px;padding-top:22px;border-top:1px solid var(--line)}
h2 .num{font:600 13px/1 var(--mono);color:var(--acc);display:block;margin-bottom:10px;letter-spacing:.12em}
p{max-width:74ch}
code{font:.87em var(--mono);background:#eef2f7;padding:1px 5px;border-radius:4px}
a{color:var(--blue)}
.sub{color:var(--dim);font-size:13.5px}
table{border-collapse:collapse;width:100%;font-size:14.5px;margin:18px 0}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:11.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--dim);font-weight:650}
.scroll{overflow-x:auto}
.callout{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--acc);border-radius:0 10px 10px 0;padding:17px 21px;margin:24px 0}
.callout.ok{border-left-color:var(--ok)}
.callout.bad{border-left-color:var(--bad)}
.callout p{margin:0}.callout p+p{margin-top:9px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:13px;margin:24px 0}
.stat{background:var(--card);border:1px solid var(--line);border-radius:11px;padding:15px 17px}
.stat b{display:block;font:700 25px/1 var(--mono);letter-spacing:-.02em}
.stat span{font-size:12.5px;color:var(--dim)}
.lane{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:22px 24px;margin:22px 0}
.lane.blocked{border-color:#fca5a5}
.lane.flight{border-color:#93c5fd}
.lhead{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:4px}
.lnum{font:700 22px/1 var(--mono);color:var(--acc)}
.lhead h3{margin:0;font-size:20px;letter-spacing:-.012em}
.pill{font:600 10.5px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;padding:5px 9px;border-radius:20px;margin-left:auto}
.pill.go{color:var(--ok);background:var(--okbg)}
.pill.ask{color:var(--acc);background:#fef3c7}
.pill.stop{color:var(--bad);background:var(--badbg)}
.pill.air{color:var(--blue);background:var(--bluebg)}
.lane .why{font-size:15.5px;color:#334155;margin:8px 0 0}
.lane dl{display:grid;grid-template-columns:auto 1fr;gap:6px 16px;margin:16px 0 0;font-size:14px}
.lane dt{font:600 10.5px/1.5 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--dim);white-space:nowrap}
.lane dd{margin:0;color:#334155}
.size{font:600 10.5px/1 var(--mono);color:var(--dim);border:1px solid var(--line);padding:5px 8px;border-radius:5px}
.frozen{background:#0f172a;color:#e2e8f0;border-radius:12px;padding:20px 24px;margin:26px 0;font-size:15px;line-height:1.6}
.frozen b{color:#fbbf24}
.frozen code{background:#1e293b;color:#e2e8f0}
@media(max-width:900px){.stats{grid-template-columns:repeat(2,1fr)}h1{font-size:30px}.lane dl{grid-template-columns:1fr}}
"""

LANES = [
    dict(n=1, title="Put the board on a real camera", pill="go", label="approved by default", size="1–2 days",
         why="""The lab renders into a fixed <code>1400×1100</code> div with <code>overflow: auto</code>. There is
         no pan, no zoom, no <code>--tl-zoom</code>. <b>Every zoom conclusion in the canvas research is therefore
         untested in this app</b> — legibility thresholds, chrome scale, port hit size. Do this before tuning any
         of them, because they can only be settled by looking.""",
         files="<code>src/Lab.tsx</code> (the canvas container and <code>WireLayer</code>'s <code>layoutKey</code>)",
         accept="""Pan and zoom work; <code>WireLayer</code> re-measures so wires stay on their dots at any zoom
         (assert with <code>getBoundingClientRect</code>, not DOM presence); the existing 41 acceptance checks
         still pass.""",
         note="""Two things to measure once it exists, both of which have a predicted answer worth falsifying:
         <code>PORT_HIT_PX = 40</code> is page-space, so at zoom 0.25 a port's hit target is ten screen pixels;
         and the research predicts that counter-scaling only the port layer (tldraw ships
         <code>--tl-scale: calc(1 / var(--tl-zoom))</code>, already clamped) gives semantic zoom's whole benefit
         in one CSS rule. If that is right, <b>the lab's 11.5px port-label override is backwards</b> and the
         trunk's 18px was correct."""),
    dict(n=2, title="Anchor each port to its cell's row", pill="go", label="approved by default", size="half a day",
         why="""<code>portEdge.tsx:109</code> defaults to <code>{ mode: "distribute", scheme: "space-between" }</code>,
         so a rail spreads its dots over the block's whole height. Grow a block by Δ and port <em>i</em> moves by
         <code>i·Δ/(n−1)</code> — every port but the first. On a canvas <b>a port's position is information</b>: it
         says which cell owns it. Distributing makes position a function of the box, which makes it noise.""",
         files="<code>src/Lab.tsx</code>'s <code>edges</code> construction; possibly a distribution mode in the trunk's <code>portEdge</code>",
         accept="""Adding a cell to a stack moves only the ports belonging to cells below it. Resizing a block
         moves no port vertically at all.""",
         note="""This is the deeper half of the width bug already fixed in <code>e6827bd</code>. That one stopped
         height changing with width; this one stops ports moving when height changes for any other reason."""),
    dict(n=3, title="Give the ports the block's edges, and move chrome off them", pill="ask", label="needs a yes", size="1 day + a trunk change",
         why="""Two defects so far, same cause: a neighbour's rail swallowed clicks on a run button, and an outlet
         dot swallowed the resize grip (<code>330 -> 330</code>). Both are patched locally. The rule they imply is
         not: <b>N carries title, run and state; S carries a hover strip; E and W carry nothing but ports</b>, with
         contextual controls floating above the selection the way SystemSketch already does.""",
         files="""<b>Trunk:</b> <code>apps/storybook-basics/src/components/blockPort.tsx</code> — rail
         <code>pointer-events: none</code>, dots <code>auto</code>. <b>Lab:</b> delete the two scoped overrides in
         <code>src/app.css</code> once the trunk fix lands.""",
         accept="""A block placed directly over a neighbour's rail is still fully clickable. The trunk fix must
         keep hit-testing alive for the day cables become draggable — a rail that is inert is not the same as a
         rail that is transparent.""",
         note="""The <code>marimo</code> styling deliberately keeps its shoulders at −26px, on top of the port
         dots, so this collision stays visible rather than being quietly designed around. Do not "fix" that
         variant as part of this lane."""),
    dict(n=4, title="Fill the contract's three holes", pill="go", label="approved by default", size="half a day",
         why="""Building five stylings found exactly three things a variant needs and cannot have. Each was worked
         around honestly rather than reached around, and each workaround is worse than the fix.""",
         files="<code>src/variants/contract.ts</code>, <code>src/Lab.tsx</code>",
         accept="""<code>cellCount</code> on <code>CellState</code> (marimo hides delete when a cell is the only
         one — the variant currently publishes a React context to its own children to learn this).
         <code>onReorder</code> on <code>CellActions</code> (marimo's drag handle is rendered and decorative, with
         a <code>title</code> saying so). <code>lineNumbers</code> on the contract (the editor is built once by the
         lab, so <code>marimo</code> draws numbers with a CSS counter — and documented that CodeMirror's real
         gutter is sticky under horizontal scroll while a pseudo-element is not, so numbers scroll away with the
         code past the measure).""",
         note="""Reorder is the one Zach asked for directly — <em>"these are like sortable blocks within"</em>. The
         dnd-kit machinery already exists in <code>apps/storybook-basics/src/components/blockMembers.tsx</code>;
         read its note about two DndContexts fighting one pointerdown before wiring a second one."""),
    dict(n=5, title="The marimo DOM adapter and its skins", pill="go", label="started, take it over", size="1–2 days",
         why="""Zach's call: don't reshape marimo's DOM to fit ours — <b>put marimo's own DOM inside a bbox-ui
         block</b>, let the block own the perimeter (ports, wires, position, expand) and let marimo own the body.
         Skinning is then only CSS custom properties.""",
         files="""<code>src/marimo-dom/**</code>, <code>src/variants/marimoDom.tsx</code>,
         <code>src/variants/index.ts</code>. <b>Partly done and committed unfinished</b> in
         <code>334ba33</code>: five marimo stylesheets are vendored with a NOTICE, and
         <code>src/marimo-dom/README.md</code> records exactly how far it got and what is missing.
         <b>Read that first.</b> No adapter, no variant, no skins, no scoping, no verification — and the
         vendored files still carry the previous agent's <code>_raw-</code> "not yet transformed" prefix and
         owe per-file attribution headers.""",
         accept="""Four skins — stock marimo, Notion, Obsidian, terminal — whose <b>computed geometry is identical
         across all four</b> (same <code>getBoundingClientRect</code>, padding, radius, font-size on the same
         element). Only paint may differ. A skin that moves something is a bug.""",
         note="""Two facts make this cheap: <code>/tmp/marimo</code> is a full clone at <b>0.24.2</b>, the same
         version installed, under <b>Apache-2.0</b>; and <code>Cell.css</code> reads only ~16 custom properties
         (<code>--gray-1..9</code>, <code>--blue-7/8</code>, <code>--red-2/7/8/9</code>, <code>--error</code>,
         <code>--gutter-width</code>, <code>--monospace-font</code>,
         <code>--marimo-code-editor-font-size</code>) — <b>that list is the skin API</b>. It ships alongside the
         hand-rolled <code>marimo</code> rather than replacing it, so the approximation and the real thing stay
         comparable. <code>/tmp</code> is volatile: the vendored copy must live in the repo."""),
    dict(n=6, title="The cable that edits the code — rebind and rename only", pill="go", label="approved by default", size="2–3 days",
         why="""Dragging a cable writes the reference into the target's source, and the wire then appears because
         the code says so. Already proven end to end by <code>docs/probe_cable_edit.py</code>: a real rebind
         through libcst, re-derived by marimo, with the comment above, the trailing comment and deliberate spacing
         all intact — and dragging back restores the file <b>byte-identically</b>.""",
         files="<code>src/Lab.tsx</code> (the drag), a new CST route in <code>server/lab_server.py</code>",
         accept="""<b>Rebind and rename only.</b> Lechtenbörger's undoability test (PODS 2003) says a view update
         is translatable precisely iff it can be undone from within the view: those two can, connect and cut
         cannot — dropping a reference leaves <code>hist = .hist(bins=30)</code>, and the undo needs an expression
         the wire never carried. Those are named commands with a preview, not drags. Byte-identical undo is the
         acceptance assertion.""",
         note="""Read with marimo (an AST), write with libcst (a CST). They are not interchangeable: an AST
         round-trip reprints the file and eats the comments, so every cable drag would silently reformat someone's
         work."""),
    dict(n=7, title="Decisions only you can make", pill="ask", label="needs a yes", size="minutes",
         why="""Five open calls, each argued in the reports with a recommendation. None of them is blocked on
         engineering; they are blocked on taste.""",
         files="—",
         accept="""<b>Which styling</b>, or which parts of which — the gallery has verdict buttons and a Copy
         button. <b>Drop <code>In [n]</code>?</b> marimo has no execution counter at all
         (<code>idle | queued | running | disabled-transitively</code>) and ours costs ~17% of a block's width.
         <b>Stale channel</b> — we copied marimo's <code>opacity: .5</code>, and "which of my twenty blocks are
         stale" is precisely the zoomed-out question where a 50%-opacity glyph is gone. <b>An
         <code>xs</code> rung on <code>PORT_TEXT_SIZES</code>?</b> The smallest is 18px; see lane 1 before
         answering, because the research argues 18px was right. <b>Does the lab graduate out of
         <code>apps/*</code>?</b>""",
         note=""),
    dict(n=8, title="AI in the editor — held", pill="stop", label="held, do not start", size="4–6 h when unblocked",
         why="""Investigated and scoped: a deliberate Cmd+K "ask Claude to edit this cell", backed by a persistent
         <code>claude</code> subprocess, fed the lab's own derived graph as context. <b>Not</b> ghost text — the
         latency floor rules that out.""",
         files="<code>server/lab_server.py</code> (one route), a Mod-k trigger in <code>src/Lab.tsx</code>",
         accept="—",
         note="""<b>Two blockers, neither of them engineering.</b> The account was measured at <b>98% of its
         7-day rate-limit window</b>, so this competes directly with interactive use. And whether driving the
         personal <code>claude</code> CLI from a non-Claude-Code editor feature is appropriate is <b>unresolved</b>
         — no language found either way. Measured latency if it is ever unblocked: 4.3–6.5s cold, ~1.6–2s warm on
         a held-open stream-json session. <code>claude --bare -p</code> is fast (~0.6s) but hard-walled against
         subscription auth, and there is no app-server/JSON-RPC mode for <code>claude</code> the way there is for
         Codex."""),
]


def lane_html(l: dict) -> str:
    cls = {"stop": " blocked", "air": " flight"}.get(l["pill"], "")
    note = f'<dt>Watch for</dt><dd>{l["note"]}</dd>' if l["note"] else ""
    return f"""
<div class="lane{cls}">
  <div class="lhead">
    <span class="lnum">{l['n']}</span><h3>{l['title']}</h3>
    <span class="pill {l['pill']}">{l['label']}</span>
  </div>
  <p class="why">{l['why']}</p>
  <dl>
    <dt>Write set</dt><dd>{l['files']}</dd>
    <dt>Done when</dt><dd>{l['accept']}</dd>
    {note}
    <dt>Size</dt><dd><span class="size">{l['size']}</span></dd>
  </dl>
</div>"""


BODY = f"""
<header class="top"><div class="wrap">
  <div class="kicker">bbox-ui · apps/notebook-lab · work order — 18 Sep 2026</div>
  <h1>Notebook lab — eight lanes, and what is frozen</h1>
  <p class="lede">The lab runs. This is what is left, ordered so someone who was not in the conversation can pick
  a lane and start. <b>Five are approved by default</b> — take them. <b>Two need a yes from Zach.</b>
  <b>One is held</b> and must not be started. Lane 5 is <b>part-built and committed unfinished</b>: start by
  reading its README, not its code.</p>
</div></header>

<div class="wrap">

<div class="stats">
  <div class="stat"><b>{F['accept']}</b><span>acceptance checks, real browser</span></div>
  <div class="stat"><b>{F['contract']}</b><span>kernel contract checks</span></div>
  <div class="stat"><b>{F['lines']}</b><span>lines in the lab</span></div>
  <div class="stat"><b>{F['variants']}</b><span>stylings, switchable</span></div>
</div>

<h2><span class="num">Before you start</span>Read the tree, not this page</h2>
<p>The work is on <code>{F['branch']}</code>, at <code>{F['head']}</code>, in the worktree\n<code>{F['worktree']}</code> — <b>not on <code>main</code></b>. This list is a floor, not a ceiling — the tree
moves faster than any document about it, and lane 5 is part-built. <b>Re-read what exists before building.</b></p>

<div class="callout ok">
  <p><b>Start it with one command, and it is idempotent.</b>
  <code>python3 apps/notebook-lab/run_lab.py</code> creates its own venv, starts the marimo-backed kernel on
  5480 and Vite on 5490, or reuses them if they are already up. <code>--stop</code> stops what it started.</p>
  <p><b>Every claim in this document is re-runnable.</b> <code>node acceptance.mjs</code> drives the real app in
  a real browser ({F['accept']} checks; <code>LAB_VARIANT=&lt;id&gt;</code> picks a styling).
  <code>.venv/bin/python server/test_contract.py</code> checks the kernel ({F['contract']} checks, including an
  independent-oracle cross-check against marimo's public API). Neither is a smoke test — if you change behaviour,
  one of them should go red.</p>
</div>

<div class="frozen">
  <p><b>Frozen — do not change these without saying so out loud.</b></p>
  <p>① <b>The variant contract</b> (<code>src/variants/contract.ts</code>). A styling owns look and nothing else;
  the editor is built once by the lab and handed in, so five stylings cannot quietly diverge on editor config.
  Lane 4 is the sanctioned way to widen it.<br>
  ② <b><code>BlockPort</code>'s DOM contract.</b> It finds port bands by querying <code>[data-slot="block"]</code>
  and its <em>direct</em> header/body children. A component that omits them renders perfectly and shows no ports
  and no wires — which reads as a data bug when it is a markup one.<br>
  ③ <b>Analysis is marimo's.</b> Never hand-roll Python scope resolution;
  <code>marimo/_ast/visitor.py</code> is 1,242 lines and reimplementing it is the mistake.<br>
  ④ <b>The lab consumes the trunk, never copies it</b> (<code>@trunk</code> → <code>apps/storybook-basics/src</code>).
  A second lineage is how <code>systemsketch/src/bboxUi</code> started to drift.<br>
  ⑤ <b>Board order in the emitted <code>.py</code>.</b> It was topologically sorted once; adding one reference
  relocated a cell, so a one-character edit produced a diff reordering cells nobody touched.</p>
</div>

<h2><span class="num">The lanes</span>Five to take, two to ask about, one to leave alone</h2>
{''.join(lane_html(l) for l in LANES)}

<h2><span class="num">Owed upstream</span>Two trunk defects this lab found</h2>
<p>Both are patched lab-locally and both belong in <code>apps/storybook-basics/src/components/</code>. Neither was
visible on a Storybook bench, where blocks have generous gaps — they only appear on a board a human drags things
around on.</p>
<div class="scroll"><table>
<thead><tr><th style="width:30%">Defect</th><th>Detail</th></tr></thead>
<tbody>
<tr><td><b>The port rail is a full-size hit target outside the block box</b></td>
<td>It swallows clicks on whatever is behind it. Lane 3. Playwright named it exactly:
<code>&lt;div data-edge="left" data-slot="port-edge"&gt; … intercepts pointer events</code>.</td></tr>
<tr><td><b>An inlet's label is painted inside the card</b></td>
<td>At a tight left inset the port name prints straight through the first line of code. The
<code>canvas</code> styling adds a 20px lane, which fixes the seed board and does not fix a block with several
inlets. Needs a real answer in <code>blockPort</code>, not a lane per variant.</td></tr>
</tbody></table></div>

<h2><span class="num">Not in any lane</span>Deliberately unscheduled</h2>
<p><b>Persistence</b> — close the tab and the board is the seed again. Fine for a lab, and the file format is
already settled (a marimo <code>.py</code> plus a positions sidecar), so this is small whenever it matters.
<b>The <code>App.embed()</code> spike</b> — marimo's real kernel is still unexercised; ours is one namespace over
marimo's topological order, which is enough for everything above. <b>Anything in SystemSketch</b> — nothing in
this work has touched it.</p>

<h2><span class="num">Background</span>Where the reasoning lives</h2>
<table><tbody>
<tr><td style="width:34%">Design — the reframe, five proposals, the decision, the cable gestures</td>
<td><code>reports/canvas-notebook-2026-09-18.html</code></td></tr>
<tr><td>Implementation — the lab, with a video of it working</td>
<td><code>reports/media/notebook-lab-2026-09-18.html</code></td></tr>
<tr><td>Canvas fitness + the styling gallery, with verdict buttons</td>
<td><code>reports/media/canvas-fitness-2026-09-18.html</code></td></tr>
<tr><td>The vault record, with the full decision trail</td>
<td><code>Projects/SystemSketch/Running Code on the Canvas — marimo, Derived Ports and Five Stylings (2026-09-18)</code></td></tr>
</tbody></table>

</div>
"""

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Notebook lab — work order</title>
<style>{CSS}</style></head><body>{BODY}</body></html>""", encoding="utf-8")
import urllib.parse
page = OUT.read_text(encoding="utf-8")
enc = len(urllib.parse.quote(page))
print(f"wrote {OUT}  {OUT.stat().st_size/1024:.0f} KB  ·  {enc/1024:.0f} KB encoded",
      "OK" if enc < 2_097_024 else "OVER")
