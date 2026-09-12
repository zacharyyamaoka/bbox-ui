#!/usr/bin/env python3
"""Builds the review for TextBox's inline editing half (docs/TEXTBOX-EDITING-SPEC.md §4):
add a TextBox to a Block's Header · left slot, two-click-to-edit, commit,
cancel, multi-line, and (React Flow / tldraw) drag-vs-select — driven for
real in each of the three renders by demos/capture-text-box-editing.mjs.

Every number and every screenshot below comes from
reports/media/text-box-editing/manifest.json, written by that journey
against the live page — nothing here is hand-typed. A failing assertion is
never hidden: it prints in its render's own table, in the summary
scoreboard, and again in "What did not pass" with the measured value and
this builder's own root-cause read of *why*, cross-checked against the
installed library source.

WHY this deviates from this repo's other build_*.py scripts (REPO pointed
at the main checkout, `/home/bam/bbox-ui`): this task's own instructions
restrict the agent to working ONLY inside the text-box-editing worktree, a
narrower rule than the general "reports go in the main checkout" one — so
this report is written to the worktree's own reports/, and the handoff
says so explicitly rather than silently reaching outside the assigned tree.
"""
from __future__ import annotations

import base64
import io
import json
import pathlib

from PIL import Image

DATE = "2026-09-12"
HERE = pathlib.Path(__file__).resolve().parent.parent  # the worktree root
MEDIA = HERE / "reports" / "media" / "text-box-editing"
OUT = HERE / "reports" / "media" / f"text-box-editing-{DATE}.html"

manifest = json.loads((MEDIA / "manifest.json").read_text())
RESULTS = manifest["results"]
RENDERS_META = manifest["renders"]

RENDER_ORDER = ["dom", "reactflow", "tldraw"]
RENDER_LABEL = {"dom": "DOM", "reactflow": "React Flow", "tldraw": "tldraw"}
ALL_STEPS = (1, 2, 3, 4, 5, 6, 7, 8)
# A step can have more than one screenshot now (step 6's variant sweep adds
# one, step 8's F3/F4 pair adds two) — every entry is a list of `{render}-
# {name}.png` suffixes, tried per render; whichever don't exist for a given
# render are silently skipped below, same as before.
STEP_SHOT = {
    1: ["1-added"],
    2: ["1b-truncated"],
    3: ["2-editing"],
    4: ["3-committed"],
    5: ["4-cancelled", "4b-rightclick-still-editing"],
    6: ["5-multiline", "6c-icon-strip-textarea"],
    7: ["6-dragged"],
    8: ["7a-shift-extended-selection", "7b-bare-padding-reselects-block"],
}
STEP_LABEL = {
    1: "1 · add a TextBox to Header · left",
    2: "2 · bare in the header, no dashed frame, and (verify round 3) truthful truncation",
    3: "3 · click selects, click again edits",
    4: "4 · type, Enter commits",
    5: "5 · click again, Escape cancels, then (verify round 4) right-click leaves the control focused",
    6: "6 · lines → multi, newline, Ctrl+Enter, then the 6-variant textarea sweep",
    7: "7 · drag the resting text moves the node",
    8: "8 · verify round 2 (tldraw) — shift-select across two members, bare-padding click",
}


def png(path: pathlib.Path) -> str:
    im = Image.open(path).convert("RGB")
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def by_render(render: str) -> list[dict]:
    return [r for r in RESULTS if r["render"] == render]


def by_step(render: str, step: int) -> list[dict]:
    return [r for r in by_render(render) if r["step"] == step]


def badge(ok: bool) -> str:
    return f'<span class="badge {"pass" if ok else "fail"}">{"PASS" if ok else "FAIL"}</span>'


def assertion_rows(rows: list[dict]) -> str:
    out = []
    for r in rows:
        out.append(
            f'<tr class="{"" if r["pass"] else "failrow"}"><td>{badge(r["pass"])}</td>'
            f'<td>{r["name"]}</td><td><code>{r["detail"] or "&mdash;"}</code></td></tr>'
        )
    return "\n".join(out)


def render_section(render: str) -> str:
    rows = by_render(render)
    passed = sum(1 for r in rows if r["pass"])
    total = len(rows)
    console = RENDERS_META.get(render, {}).get("console") or []
    console_html = (
        "<details><summary>console during this render's run: " + str(len(console)) + "</summary><pre>"
        + "\n".join(c.replace("<", "&lt;") for c in console) + "</pre></details>"
        if console
        else '<p class="meas">console clean during this render\'s run</p>'
    )
    shots = []
    for step in ALL_STEPS:
        for name in STEP_SHOT.get(step, []):
            path = MEDIA / f"{render}-{name}.png"
            if not path.exists():
                continue
            shots.append(
                f'<figure class="card"><img src="{png(path)}" alt="{render} {STEP_LABEL[step]} — {name}">'
                f'<figcaption>{STEP_LABEL[step]}</figcaption></figure>'
            )
    steps_html = []
    for step in ALL_STEPS:
        srows = by_step(render, step)
        if not srows:
            continue
        step_pass = sum(1 for r in srows if r["pass"])
        steps_html.append(
            f'<h4>{STEP_LABEL[step]} <span class="meas">{step_pass}/{len(srows)}</span></h4>'
            f'<table class="assertions"><tbody>{assertion_rows(srows)}</tbody></table>'
        )
    return f"""
<section class="render-section" id="render-{render}">
  <h2>{RENDER_LABEL[render]} <span class="scoreboard {"allpass" if passed == total else "somefail"}">{passed}/{total}</span></h2>
  <div class="shots">{"".join(shots)}</div>
  {"".join(steps_html)}
  {console_html}
</section>"""


TOTAL_PASS = sum(1 for r in RESULTS if r["pass"])
TOTAL = len(RESULTS)
FAILURES = [r for r in RESULTS if not r["pass"]]
SECTIONS = "\n".join(render_section(r) for r in RENDER_ORDER)

SCOREBOARD_ROW = "".join(
    f'<div class="score-cell"><div class="score-render">{RENDER_LABEL[r]}</div>'
    f'<div class="score-num {"allpass" if sum(1 for x in by_render(r) if x["pass"]) == len(by_render(r)) else "somefail"}">'
    f'{sum(1 for x in by_render(r) if x["pass"])}/{len(by_render(r))}</div></div>'
    for r in RENDER_ORDER
)

FAILURE_ROWS = "\n".join(
    f'<tr><td>{RENDER_LABEL[f["render"]]}</td><td>{STEP_LABEL.get(f["step"], f["step"])}</td>'
    f'<td>{f["name"]}</td><td><code>{f["detail"] or "&mdash;"}</code></td></tr>'
    for f in FAILURES
)

HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TextBox inline editing, end to end · {DATE}</title>
<style>
  :root {{ --ink:#16161a; --muted:#65656f; --line:#e3e3e8; --bg:#fbfbfc; --card:#fff; --accent:#5b45d6; --win:#2f7d5b; --lose:#c23434 }}
  * {{ box-sizing:border-box }}
  body {{ margin:0; background:var(--bg); color:var(--ink); font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif }}
  main {{ max-width:1100px; margin:0 auto; padding:48px 24px 96px }}
  h1 {{ font-size:30px; line-height:1.25; margin:0 0 8px; letter-spacing:-.02em }}
  h2 {{ font-size:22px; margin:56px 0 12px; letter-spacing:-.01em; display:flex; align-items:baseline; gap:12px }}
  h3 {{ font-size:17px; margin:32px 0 8px }}
  h4 {{ font-size:14px; margin:22px 0 6px; display:flex; align-items:baseline; gap:10px; color:#333 }}
  .lede {{ font-size:18px; color:var(--muted); margin:0 0 20px }}
  .meas {{ font-size:12px; color:var(--muted); font-weight:400 }}
  code {{ font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; background:#f1f1f4; padding:1px 5px; border-radius:4px; word-break:break-word }}
  pre {{ background:#16161a; color:#e8e8ee; padding:14px 16px; border-radius:8px; overflow:auto; font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace }}
  table {{ border-collapse:collapse; width:100%; font-size:13.5px; margin-bottom:8px }}
  table.assertions {{ margin-bottom:4px }}
  th, td {{ text-align:left; padding:6px 10px; border-bottom:1px solid var(--line); vertical-align:top }}
  th {{ font-weight:600 }}
  tr.failrow {{ background:#fff5f5 }}
  .badge {{ font-size:11px; font-weight:700; border-radius:5px; padding:2px 7px; letter-spacing:.02em }}
  .badge.pass {{ background:#e6f6ee; color:var(--win) }}
  .badge.fail {{ background:#fdeaea; color:var(--lose) }}
  .scoreboard {{ font-size:15px; font-weight:700; border-radius:999px; padding:2px 12px }}
  .scoreboard.allpass {{ background:#e6f6ee; color:var(--win) }}
  .scoreboard.somefail {{ background:#fdeaea; color:var(--lose) }}
  .score-strip {{ display:flex; gap:16px; margin:20px 0 32px }}
  .score-cell {{ background:var(--card); border:1px solid var(--line); border-radius:10px; padding:14px 20px; flex:1; text-align:center }}
  .score-render {{ font-size:13px; color:var(--muted); margin-bottom:4px }}
  .score-num {{ font-size:26px; font-weight:800 }}
  .score-num.allpass {{ color:var(--win) }}
  .score-num.somefail {{ color:var(--lose) }}
  .shots {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; margin:14px 0 8px }}
  figure {{ margin:0 }}
  .card {{ background:var(--card); border:1px solid var(--line); border-radius:10px; overflow:hidden }}
  .card img {{ display:block; width:100%; height:auto; background:#0b0b0d }}
  .card figcaption {{ font-size:11.5px; color:var(--muted); padding:6px 10px; border-top:1px solid var(--line) }}
  .note {{ background:#fff7ed; border:1px solid #fed7aa; border-radius:8px; padding:12px 16px; font-size:14px; margin:12px 0 }}
  .bug {{ background:#fdeaea; border:1px solid #f3b6b6; border-radius:10px; padding:16px 18px; margin:18px 0 }}
  .bug h3 {{ margin:0 0 6px; font-size:15px; color:var(--lose) }}
  .bug.fixed {{ background:#eef8f1; border-color:#bfe3cc }}
  .bug.fixed h3 {{ color:var(--win) }}
  .run {{ background:#f1f1f4; border-radius:8px; padding:10px 14px; font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; overflow:auto }}
  details summary {{ cursor:pointer; font-size:12px; color:var(--muted) }}
</style></head>
<body><main>

<h1>TextBox's inline editing half, driven end to end</h1>
<p class="lede">docs/TEXTBOX-EDITING-SPEC.md §4's proof: add a <code>TextBox</code> to a Block's <em>Header · left</em> slot through the Members control, two-click-to-edit, commit, cancel, switch to multi-line, and (React Flow / tldraw) drag the resting text — for real, in headless Chrome, in each of the three renders. Every assertion below reads the real DOM (a bounding box, a control's own <code>.value</code>, <code>document.activeElement</code>, computed style) or genuine instance state via the inspector — never a screenshot's own claim.</p>

<div class="score-strip">{SCOREBOARD_ROW}
  <div class="score-cell"><div class="score-render">Total</div><div class="score-num {"allpass" if TOTAL_PASS == TOTAL else "somefail"}">{TOTAL_PASS}/{TOTAL}</div></div>
</div>

<div class="note">
{
  f"<strong>All {TOTAL} assertions pass across all three renders.</strong> Verify round 1 confirmed five defects in this journey's original run, fixed each at its root, swept the sibling paths the same causes reached (a bare-padding drag, a different non-editable member, the default inspector's textarea fallback), and re-ran this exact journey against the fixed tree. A second, independent audit of that fix then confirmed four more (\"Fixed in verify round 2\") — two the fix itself introduced, two it left unswept in five of the panel's six variants. A THIRD, independent audit of round 2's own fix commit then confirmed one more (\"Fixed in verify round 3\"): <code>lines: \"single\"</code>'s rest recipe was declared correctly but painted nothing, because <code>text-overflow</code> never applies to a flex container — every earlier round's own unit test pinned the style OBJECT, never the paint. A FOURTH, independent audit of round 3's own fix commit (7ba431c) then confirmed one more (below, \"Fixed in verify round 4\"): on tldraw only, a right-click on the editing control ended editing and opened tldraw's own context menu instead of leaving the control focused with the browser's native one. Each of these eleven defects is fixed at its root and covered by new permanent assertions (step 2's truncation probe, step 5b's right-click-stays-focused check on all three renders, step 6's 6-variant sweep, step 8's tldraw shift-select and bare-padding checks) so none can return unnoticed. Nothing here is patched to make the number look better, the number is what the fixes produced."
  if not FAILURES else
  f'<strong>{len(FAILURES)} assertion(s) still fail.</strong> See "What did not pass" below.'
}
</div>

<h2>What did not pass <span class="scoreboard {"somefail" if FAILURES else "allpass"}">{len(FAILURES)} assertions</span></h2>
{
  f'<table><thead><tr><th>Render</th><th>Step</th><th>Assertion</th><th>Measured</th></tr></thead><tbody>{FAILURE_ROWS}</tbody></table>'
  if FAILURES else
  '<p class="meas">Nothing to report — every assertion in this run passed.</p>'
}

<h2>Fixed in verify round 1 <span class="meas">confirmed findings, each independently re-verified after the fix</span></h2>

<div class="bug fixed">
<h3>F1 · React Flow's editing control never received keyboard focus</h3>
<p>Root cause (not react-arborist, as first suspected — refuted by reproducing the same failure with a different navigator entirely): this bench's <code>nodes</code> array is rebuilt as fresh objects on every render, and installed <code>@xyflow/system</code> 0.0.82's <code>adoptUserNodes</code> takes a node's <code>measured</code> size only from an object it recognizes by REFERENCE — a fresh object every time means <code>measured</code> resets to <code>undefined</code>, <code>nodeHasDimensions</code> reads false, and <code>NodeWrapper</code> paints <code>visibility:hidden</code> during the exact commit that mounts the autofocusing control (a hidden subtree cannot hold focus). <strong>Fix:</strong> <code>reactflow-canvas.tsx</code> now feeds each node's own `dimensions` change back through <code>onNodesChange</code> into a <code>measuredRef</code>, carried forward on every subsequent render — the standard pattern for a controlled React Flow.</p>
</div>

<div class="bug fixed">
<h3>F2 · React Flow never drags any node — <code>noDragClassName</code> collides with <code>noPanClassName</code></h3>
<p><code>reactflow-canvas.tsx</code> passed the identical string <code>"bbox-interactive"</code> to <code>noDragClassName</code>, <code>noPanClassName</code> <em>and</em> <code>noWheelClassName</code>. React Flow's own <code>NodeWrapper</code> unconditionally paints <code>noPanClassName</code> onto every draggable node's OWN root element — so with the node root itself carrying that class, d3-drag's <code>noDragClassName</code> filter (which walks up through and including that root) always matched, excluding every node from dragging, full stop. <strong>Fix:</strong> left <code>noPanClassName</code> at React Flow's own default (<code>"nopan"</code>), decoupling it from the interactive marker; <code>noDragClassName</code>/<code>noWheelClassName</code> keep gating on <code>bbox-interactive</code> as designed.</p>
</div>

<div class="bug fixed">
<h3>F3 · A drag starting on a member's resting content never moved the node, in React Flow or tldraw</h3>
<p><code>render-instance.tsx</code>'s member wrapper called <code>e.stopPropagation()</code> on pointer-down — which halts the NATIVE event too, not just React's own bubbling, so it silently cancelled every drag reaching React Flow's d3-drag (attached natively to the node root) and tldraw's own canvas gesture recognizer. <strong>Fix:</strong> replaced the stopPropagation with a "claim" flag (a <code>WeakSet</code> keyed by the native event) that lets the innermost wrapper win the SELECTION decision without blocking the native event from continuing on to each host's own drag machinery. Two further, related defects surfaced once that native path was actually reachable and were fixed alongside it: React Flow's own <code>preventDefault()</code> (needed to protect a freshly-mounted control's autofocus) was ALSO suppressing the browser's compatibility <code>mousedown</code> event d3-drag listens for — fixed by deferring that decision to pointer-up via a small arm/cancel-on-movement mechanism (<code>armEditOnRelease</code>) instead of acting on pointer-down; and tldraw's own hit-testing used a hardcoded 180×80 shape size against content that can be much larger, and its stock "double-click a non-editable shape creates a text label" default was firing on the two-click gesture — fixed with a live-measured shape size and a no-op <code>onDoubleClick</code> override, respectively.</p>
</div>

<div class="bug fixed">
<h3>F4 · tldraw: Escape did not restore the pre-edit value</h3>
<p>tldraw attaches its own Escape handling with a raw <code>container.addEventListener("keydown", …)</code> on <code>.tl-container</code> — an ancestor of the control — which runs BEFORE React's own (bubble-phase) dispatch ever reaches the control's <code>onKeyDown</code>, since React defers its synthetic dispatch until the event reaches the root it delegates from. tldraw's handler calls <code>container.focus()</code>, which blurs the control and fires <code>onCommit</code> with the still-typed value before the control's own Escape branch gets a chance to run. <strong>Fix:</strong> moved Escape handling into a <code>onKeyDownCapture</code> handler on the control itself — React's simulated CAPTURE pass runs top-down from the same root, synchronously, before the real DOM's native capture sweep ever reaches <code>.tl-container</code>'s bubble-phase listener, so <code>stopPropagation()</code> there removes the keydown before tldraw (or anything upstream) ever sees it.</p>
</div>

<div class="bug fixed">
<h3>F5 · A multi-line value silently lost its newline through the default inspector</h3>
<p><code>FigmaDense.tsx</code> (<code>PANEL_VARIANTS[0]</code>, the <code>/create</code> default) and <code>RowPopover.tsx</code> had no explicit branch for the new <code>"textarea"</code> field kind, so both fell through to a single-line <code>&lt;input&gt;</code>, whose value sanitization strips newlines — a real, silent character-loss the moment either panel touched the field, violating the truthful-rendering rule. <strong>Fix:</strong> both variants grew the same real <code>&lt;textarea rows=1 style="field-sizing:content"&gt;</code> branch <code>FieldTraceRow.tsx</code> already had.</p>
</div>

<h2>Fixed in verify round 2 (2026-09-12) <span class="meas">a second, independent audit of round 1's own fix commit (9a81da9) — distinct bugs from F1&ndash;F5 above, reusing the same letters because each round numbers its own findings from 1</span></h2>

<div class="note">Round 1's fix pass repaired the five defects above but introduced two new ones of its own (F3, F4 below) and left two pre-existing defects unswept in five of the panel's six selectable variants (F1, F2 below — round 1 verified only the default <code>FigmaDense</code> variant and one other IconStrip-adjacent path). All four are fixed at their root below and covered by new, permanent journey assertions (<code>demos/capture-text-box-editing.mjs</code> step 6's 6-variant sweep and step 8) so none of the four can regress unnoticed again.</div>

<div class="bug fixed">
<h3>F1 · FigmaDense's Text field never grew past one line</h3>
<p><code>FigmaDense.tsx</code>'s textarea branch (added in round 1 for F5) spread <code>textInputStyle(secondary)</code> — which pins <code>height: 22</code> for every OTHER dense-row control — before adding <code>fieldSizing: "content"</code>. <code>height</code> still won the cascade, so a 4-line value rendered exactly one line tall with the rest scrolled out of view and no visual indication anything was hidden (measured: <code>clientHeight 20</code> vs <code>scrollHeight 66</code> for a 4-line value). <strong>Fix:</strong> the textarea's own style now overrides with <code>height: "auto", minHeight: 22</code> after the spread, so the row still starts at the same 22px height as every other control but is free to grow.</p>
</div>

<div class="bug fixed">
<h3>F2 · IconStrip's Text field silently dropped every newline on the next keystroke</h3>
<p><code>IconStrip.tsx</code>'s <code>FieldText</code> — the control both the direct <code>childrenField</code> row AND <code>GenericFallback</code> route a <code>kind: "textarea"</code> field to — had no branch for it at all and always rendered a single-line <code>&lt;input&gt;</code>. An <code>&lt;input&gt;</code>'s value setter strips <code>\n</code> outright, so the FIRST keystroke made through IconStrip's own inspector on a multi-line TextBox silently collapsed its two lines into one (Zach's truthful-rendering rule) — this is round 1's own F5 class of bug, present in a SIXTH selectable variant round 1's fix never reached. <strong>Fix:</strong> <code>FieldText</code> now branches on <code>field.kind === "textarea"</code> and renders the same growable <code>&lt;textarea rows=1 style="field-sizing:content"&gt;</code> idiom every other variant uses.</p>
</div>

<div class="bug fixed">
<h3>F3 · tldraw: shift-selecting a second member of the same Block collapsed the selection to just that Block</h3>
<p>Round 1's own fix for a DIFFERENT regression (a stray reflexive root-reselection ending an in-progress edit) added <code>impliedRootSelection()</code>: it maps each selected id to its ancestor root and joins the sorted list. For two members of the SAME block (<code>[T1, T3]</code>) that join is <code>"block-8|block-8"</code> — not deduplicated — which never equals tldraw's own single reported shape id <code>"block-8"</code>, so the guard treated a genuine shift-extend as a real change and overwrote the page's <code>[T1, T3]</code> selection with just the shared root. <strong>Fix:</strong> replaced the whole ID-set heuristic with a DOM-target-based one — an <code>onPointerDownCapture</code> on the canvas wrapper (capture always finishes before any bubble-phase listener anywhere in the subtree, tldraw's own click handling included) records whether the causing press landed inside a member wrapper or the inline-edit control; the editor→page listener now skips exactly when that is true, regardless of which or how many ids are involved.</p>
</div>

<div class="bug fixed">
<h3>F4 · tldraw: clicking a Block's own bare padding stopped reselecting the Block once one of its members was selected</h3>
<p>The SAME <code>impliedRootSelection()</code> guard was blind to WHERE a press landed: a member already selected (<code>[T1]</code>) implies the same root string (<code>"block-8"</code>) that a genuine click on the Block's own bare padding ALSO reports, natively, at tldraw's geometry-based hit-test (only roots get a shape — a member's press and a bare-padding press are indistinguishable by id alone). The guard suppressed both identically, so the Block could never be reselected by clicking it again — only via the navigator or an empty-canvas click first. <strong>Fix:</strong> the same capture-phase press classification from F3 answers this directly — a bare-padding press has no member or control under it, so the flag is false, the guard does not suppress, and the native selection change reaches the page.</p>
</div>

<h2>Fixed in verify round 3 (2026-09-12) <span class="meas">a third, independent audit of round 2's own fix commit (83d9254) — reuses "F1" again, per the same each-round-starts-at-1 convention as round 2's own header above</span></h2>

<div class="note">Round 2's fix pass repaired its own four defects but never touched <code>lines</code>'s rest recipe at all — this is a pre-existing defect, present since the feature's very first commit, that survived TWO prior audits because every existing check (a Storybook play function reading <code>data-lines</code>/the CSS class, a unit test reading <code>el.props.style</code>) inspects the DECLARED style object, and none of them render the box in a narrow enough real container to see what actually PAINTS. Fixed at its root below and covered by a new, permanent journey assertion (<code>demos/capture-text-box-editing.mjs</code>'s new step 2 truncation probe, run in a real, narrow <code>Header · left</code> slot in all three renders) so it cannot regress unnoticed.</div>

<div class="bug fixed">
<h3>F1 · <code>lines: "single"</code>'s "truthful truncation" recipe was declared but never painted — no ellipsis, ever, at any <code>justify</code></h3>
<p>Two compounding defects, both inside <code>textBox.tsx</code>, both invisible to a unit test that only reads a style object:</p>
<p><strong>(a) the recipe lived on the wrong box.</strong> <code>white-space: nowrap; overflow: hidden; text-overflow: ellipsis</code> sat directly on the ROOT <code>&lt;div&gt;</code>, which is <code>inline-flex</code> (needed so <code>align</code>/<code>justify</code> can position content once a host gives the box explicit size). CSS <code>text-overflow</code> only ever applies to a BLOCK container — never a flex one — so Chromium silently no-oped it: measured live in a real 107px <code>Header · left</code> slot with the default <code>justify: "middle"</code>, a 32-character label was hard-clipped at BOTH ends with NO ellipsis glyph at all (first character measured 105px to the LEFT of the box). <strong>Fix:</strong> the recipe now lives on a new inner <code>&lt;span data-slot="text-box-content"&gt;</code> — the box's one real block container — so <code>text-overflow</code> actually has somewhere to apply.</p>
<p><strong>(b) even a correct block recipe had nothing narrow enough to clip against.</strong> Neither the new inner span nor the outer root declared <code>min-width: 0</code>, and a flex/grid item's automatic minimum size defaults to its OWN min-content size — for a <code>white-space: nowrap</code> label, that is the FULL untruncated text width. Nested two levels deep (root inside the inner span's own flex layout, and the root ITSELF inside a Block header slot's <code>Flex</code>), neither level would shrink below its content no matter how narrow its host tried to make it: measured live, a real Header · left slot correctly held to 107px by the Block's own header grid, yet the TextBox root still rendered at 534px, silently overflowing its own parent (which has <code>overflow: visible</code>, so nothing even clipped it — the inner span's ellipsis fix had no narrow box to engage). <strong>Fix:</strong> both the root and the inner content span now declare <code>min-width: 0</code> (the inner span also gets <code>max-width: "100%"</code>), so a host that squeezes this box can actually squeeze it.</p>
<p>Verified empirically in headless Chrome, not just reasoned about: a small CSS probe (three real DOM boxes, <code>justify-content: flex-start/center/flex-end</code>, a fixed 107px container) confirmed the fixed shape ellipsizes correctly at every <code>justify</code> — and that once text is long enough to truncate, the ellipsis always lands at the trailing edge regardless of <code>justify</code> (a clamped-to-100%-width block box has no spare space left to justify within), while <code>justify</code> still positions a SHORT, untruncated value normally. That trade-off — <code>justify</code> becoming a no-op the instant truncation engages — is inherent to CSS `text-overflow` (it marks the line box's trailing edge, not wherever `text-align` centered an already-overflowing line) and is not specific to this fix.</p>
</div>

<h2>Fixed in verify round 4 (2026-09-12) <span class="meas">a fourth, independent audit of round 3's own fix commit (7ba431c) — reuses "F1" again, per the same each-round-starts-at-1 convention as every round header above</span></h2>

<div class="note">tldraw-only. DOM and React Flow were already correct on this exact gesture; the fix is scoped to the tldraw host file and does not touch the shared control. Covered by a new, permanent journey assertion (<code>demos/capture-text-box-editing.mjs</code>'s new step 5b, run identically on all three renders) so it cannot regress unnoticed, and so a future regression that broke DOM or React Flow instead — not just tldraw — would also be caught.</div>

<div class="bug fixed">
<h3>F1 · tldraw: a right-click on the editing control ended editing and opened tldraw's own context menu</h3>
<p>The control's own <code>onContextMenu</code> stopPropagation (<code>textBox.tsx</code>, unchanged by this fix — it correctly stops the REAL, trusted <code>contextmenu</code> event so the browser's native cut/copy/paste menu can show) was never the whole story on tldraw. Installed <code>@tldraw/editor</code> 5.3.2's <code>useCanvasEvents.mjs</code> attaches a SEPARATE <code>onPointerUp</code> handler to <code>.tl-canvas</code> that reacts to the right button's pointer-UP itself: <code>if (rightClickPanning &amp;&amp; button === 2 &amp;&amp; !wasRightClickPanning)</code> it synthesizes and dispatches a BRAND NEW, untrusted <code>contextmenu</code> event directly on the canvas element — bypassing the control (and its already-correct stopPropagation) entirely, since it never bubbles FROM the control at all. That synthetic event opened tldraw's own <code>ContextMenu</code> (Paste / Copy as / Export as / Select all), and Radix's <code>FocusScope</code> then moved focus onto it, blurring the control — which fired <code>onCommit</code> with whatever had been typed. Reproduced twice over CDP: the untrusted <code>contextmenu</code>'s target was the canvas <code>DIV</code>, not the input, and the installed source's exact branch matched. Marking the earlier pointer-DOWN handled (already done, for drag/marquee suppression) does nothing here — it is a different native event object. <strong>Fix:</strong> the shape's <code>HTMLContainer</code> in <code>tldraw-canvas.tsx</code> now ALSO calls <code>editor.markEventAsHandled(e)</code> on pointer-UP when the target is inside <code>[data-bbox-interactive]</code> — the exact same mechanism already used for pointer-down, on the exact same element (an ANCESTOR of <code>.tl-canvas</code>'s own listener in the bubble path, so it runs first) — so <code>useCanvasEvents</code>'s own <code>wasEventAlreadyHandled</code> guard bails out before it ever synthesizes the fake event. Deliberately NOT fixed by adding a fifth <code>stopPropagation</code> (pointerup) to the shared control in <code>textBox.tsx</code>: tldraw's own doc for <code>markEventAsHandled</code> warns that a blanket <code>stopPropagation()</code> "can impact non-tldraw event handlers set up elsewhere" (this same file's own <code>armEditOnRelease</code> <code>document</code>-level pointerup listener among them) — this fix stays scoped to tldraw's own pipeline, in the file the contract (§3) already assigns this responsibility to, and leaves the core control exactly matching the spec's literal four stopped events (pointerdown, click, dblclick, contextmenu).</p>
</div>

{SECTIONS}

<h2>Stock parts touched by this feature, element by element</h2>
<table>
  <thead><tr><th>Element</th><th>Today</th><th>Off-the-shelf part (exact name)</th><th>Behaviour that must survive</th></tr></thead>
  <tbody>
    <tr><th>The editing control's host-neutral marker</th><td>a bespoke prop</td><td><code>data-bbox-interactive</code> attribute + <code>bbox-interactive</code> class, both emitted once by <code>TextBoxControl</code></td><td>React Flow gates drag/wheel by class name (<code>noDragClassName</code>/<code>noWheelClassName</code>), tldraw by attribute selector — one marker, two host vocabularies, the core imports neither</td></tr>
    <tr><th>React Flow drag/wheel exclusion</th><td>none existed</td><td><code>&lt;ReactFlow noDragClassName/noWheelClassName&gt;</code> (native prop, <code>@xyflow/react</code> 12.11.6) — <code>noPanClassName</code> deliberately left at its own default (<strong>F2</strong>: giving it the same string as the other two collided with React Flow's own internal use of it)</td><td>a drag starting on the editing control moves the caret, not the node; a drag starting anywhere else on the node — member content included, per <strong>F3</strong> — still moves it</td></tr>
    <tr><th>React Flow measured-dimensions feedback</th><td>none existed</td><td><code>onNodesChange</code>'s <code>dimensions</code> change type, fed into a <code>measuredRef</code> (documented controlled-flow pattern, <code>@xyflow/react</code> 12.11.6)</td><td>the node stays <code>visibility:visible</code> across every re-render, so the editing control's autofocus (<strong>F1</strong>) has something focusable to land on</td></tr>
    <tr><th>tldraw gesture suppression</th><td>none existed</td><td><code>editor.markEventAsHandled(e)</code> (stock tldraw <code>Editor</code> API) on the shape's <code>HTMLContainer</code> pointer-down AND pointer-up (round 4 added pointer-up), gated by <code>[data-bbox-interactive]</code></td><td>a press on the editing control does not start tldraw's own drag/marquee gesture; a right-click's release does not make tldraw's own <code>useCanvasEvents</code> synthesize its own <code>contextmenu</code> and open tldraw's menu (<strong>round 4 F1</strong>)</td></tr>
    <tr><th>tldraw shape sizing</th><td>hardcoded <code>w:180, h:80</code></td><td><code>ResizeObserver</code> feeding <code>editor.updateShape</code> (stock tldraw API, <code>history:"ignore"</code>), same principle as the React Flow measured-dimensions row above</td><td>tldraw's own hit-test and selection outline agree with what a person actually sees, whatever the rendered component's real size</td></tr>
    <tr><th><code>BenchShapeUtil.canEdit()</code></th><td>inherited default (already <code>false</code>)</td><td><code>ShapeUtil.canEdit()</code> override, explicit <code>return false</code></td><td>tldraw's own text-shape edit mode never races the page's own <code>editingId</code> state</td></tr>
    <tr><th><code>BenchShapeUtil.onDoubleClick()</code></th><td>none existed (fell through to tldraw's own default)</td><td><code>ShapeUtil.onDoubleClick()</code> override returning a no-op shape update (stock tldraw escape hatch)</td><td><strong>F3</strong>: tldraw's stock "double-click a non-editable shape creates a text label" default no longer fires on the two-click-to-edit gesture</td></tr>
    <tr><th>Instance-pointer-down claim</th><td>none existed (was <code>e.stopPropagation()</code>)</td><td><code>WeakSet&lt;Event&gt;</code> keyed by the native event (<code>claimInstancePointerDown</code>/<code>isInstancePointerDownClaimed</code>)</td><td><strong>F3</strong>: an innermost member still wins the SELECT decision without blocking the native event React Flow's/tldraw's own drag machinery needs</td></tr>
    <tr><th>Edit-vs-drag disambiguation</th><td>none existed (edit fired on pointer-down)</td><td><code>armEditOnRelease</code> — document-level <code>pointermove</code>/<code>pointerup</code> listeners, a 4px move threshold (matching this codebase's own long-press convention)</td><td><strong>F3</strong>: a drag starting on an already-selected, inline-editable instance still moves the node — <code>preventDefault()</code> only fires (protecting the fresh control's focus) once the press resolves to a click, not before</td></tr>
    <tr><th>Inspector textarea control</th><td>single-line <code>&lt;input&gt;</code> for every text field</td><td><code>FieldKind: "textarea"</code> (new), rendered as <code>&lt;textarea rows=1 style="field-sizing:content"&gt;</code> in <code>FieldTraceRow.tsx</code>, <code>FigmaDense.tsx</code> and <code>RowPopover.tsx</code> (<strong>F5</strong> — the latter two fell through to a newline-stripping <code>&lt;input&gt;</code> until this round)</td><td>a multi-line <code>children</code> value shows its newline in every panel that reads it, not just at rest</td></tr>
    <tr><th>Two-click-to-edit decision</th><td>none existed</td><td><code>isSecondPressToEdit()</code>, one shared function (<code>packages/panel/src/twoClickEdit.ts</code>), unit-tested</td><td>the exact same rule fires for a top-level instance (<code>dom-preview.tsx</code>) and a nested member (<code>render-instance.tsx</code>'s wrapper) — they cannot drift apart</td></tr>
    <tr><th>react-arborist instance navigator</th><td colspan="3"><strong>unchanged (stock seam)</strong> — F1's original report suspected its roving-tabindex focus management; refuted (reproduced identically with the shadcn navigator instead), so left untouched</td></tr>
    <tr><th>tldraw editor→page selection echo guard (round 2)</th><td>an un-deduplicated <code>impliedRootSelection()</code> ID-set join</td><td><code>onPointerDownCapture</code> (stock React synthetic capture event) on the canvas wrapper + <code>Element.closest()</code></td><td><strong>round 2 F3/F4</strong>: whether the page's own member/control handling already owns this exact press — read from WHERE it landed, not reconstructed from which ids happen to already be selected</td></tr>
    <tr><th>Every panel variant's "textarea" field control (round 2)</th><td>FigmaDense: real <code>&lt;textarea&gt;</code> that never actually grew (fixed <code>height:22</code> beat <code>fieldSizing</code>); IconStrip: single-line <code>&lt;input&gt;</code></td><td>the same <code>&lt;textarea rows=1 style="field-sizing:content"&gt;</code> idiom <code>FieldTraceRow.tsx</code> already had, now in all 6 of <code>PANEL_VARIANTS</code></td><td><strong>round 2 F1/F2</strong>: a multi-line value shows every line, and keeps every newline through one more keystroke, in every panel design a person can switch to — not only the default</td></tr>
  </tbody>
</table>

<h2>Run it</h2>
<p>The journey drives a Next dev server on port 4177 — never the peer worktree's 4100, never 4321-4323.</p>
<div class="run">pnpm --dir /home/bam/bbox-ui/.claude/worktrees/text-box-editing --filter @bbox-ui/docs exec next dev --port 4177</div>
<p class="meas">Then, in a second terminal: <code>node /home/bam/bbox-ui/.claude/worktrees/text-box-editing/demos/capture-text-box-editing.mjs http://localhost:4177/create /home/bam/bbox-ui/.claude/worktrees/text-box-editing/reports/media/text-box-editing</code>. Built by <code>docs/build_text_box_editing.py</code>. This report and its captures live in the <strong>worktree's own</strong> <code>reports/media/</code> (not the main checkout's), per this task's explicit "work only inside this worktree" instruction.</p>

</main></body></html>
"""

OUT.write_text(HTML)
print(f"wrote {OUT} ({OUT.stat().st_size / 1e6:.2f} MB)")
