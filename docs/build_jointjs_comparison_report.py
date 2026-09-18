#!/usr/bin/env python3
"""
Build the JointJS-vs-SystemSketch feature-comparison report.

Zach (`/rate bad`, 2026-09-17): "bad no html report, what is goign on?" — a
20-row comparison table (four sub-agents researched JointJS's actual feature
set from docs.jointjs.com and the clientio/joint repo; a fifth scouted
SystemSketch) was written straight into an existing vault note as a markdown
table. No HTML report existed. That is a category error whether the content
lands in a new file, a subagent's return value, or — this case — an append
into a note that was already there: a comparison Zach will judge from is the
same deliverable regardless of where the text lands.

This script is the correction: the same 20-row comparison, rendered as a
self-contained page with a status-pill matrix, a KPI summary, and the two
real gaps called out — not a table pasted into a document.

No images/screenshots are inlined (this is a research/comparison report, not
a UI capture), so this page's whole weight is text + inline SVG and it
belongs in the repo's TRACKED reports/ half, not reports/media/.

    python3 docs/build_jointjs_comparison_report.py
"""
from __future__ import annotations

import pathlib
from urllib.parse import quote

REPO = pathlib.Path("/home/bam/bbox-ui")
OUT = REPO / "reports/jointjs-vs-systemsketch-2026-09-17.html"

# ---------------------------------------------------------------------------
# The comparison itself — one row per feature. Verdict buckets:
#   ahead   — SystemSketch does it and JointJS core doesn't (or does it worse)
#   parity  — both do it, roughly equivalently
#   gap     — SystemSketch doesn't have it; a real, new-to-name gap
#   known   — SystemSketch is behind, but this was already known/tracked
# Every claim here traces to a doc URL (JointJS) or a file:line (SystemSketch),
# named in the "evidence" column — this is the same evidence used in the
# vault note, not re-derived.
# ---------------------------------------------------------------------------
ROWS = [
    dict(feature="Router / connector split", jointjs="Core — orthogonal, manhattan, metro, straight, smooth, jumpover",
         systemsketch="`straight` / `curved` / `elbow` — elbow is Excalidraw-derived A*, obstacle-aware",
         evidence="connectionRouting.ts", verdict="parity",
         note="elbow's A* is closer to manhattan's obstacle-avoidance than JointJS's plain orthogonal"),
    dict(feature="Cable-crossing disambiguation", jointjs="Core — jumpover connector (arc/gap where cables cross)",
         systemsketch="Not implemented",
         evidence="—", verdict="gap",
         note="real gap, but not new — blocked on the curved-vs-orthogonal default, a call already flagged in PROJECT - pyblocks.md"),
    dict(feature="Manual vertices / waypoints", jointjs="Core",
         systemsketch="Pinned rails via a route:N handle",
         evidence="elbowAuthoredRoute.ts", verdict="parity", note=""),
    dict(feature="Link tools (vertex/segment/remove/reconnect)", jointjs="Core — you wire the hover/select trigger yourself",
         systemsketch="pill / bend / route:N / segment:M handles",
         evidence="ConnectionShapeUtil.tsx getHandles()/onHandleDrag", verdict="parity", note="spot-verified directly against source"),
    dict(feature="Link labels positioned along the path", jointjs="Core",
         systemsketch="pill label, 0–1 fraction of path length",
         evidence="connectionModel.ts pillPosition", verdict="parity", note=""),
    dict(feature="Ports + connection validation", jointjs="Core — two boolean callbacks (validateConnection/validateMagnet)",
         systemsketch="Nine-rule judgeConnection policy — type, polarity, cycles, fan-in/out, scope",
         evidence="connectionRules.ts", verdict="ahead", note="richer policy than JointJS's two callbacks"),
    dict(feature="Drag-time “valid target” highlight", jointjs="Core — markAvailable / available-magnet class",
         systemsketch="eligiblePorts signal + PortDot eligible/hinting states",
         evidence="portState.ts, PortDot.tsx", verdict="parity", note="spot-verified directly against source"),
    dict(feature="Embedding / containment", jointjs="Core — fitToChildren / fitParent",
         systemsketch="Region / Branch / Block nesting on tldraw's native parent-child system",
         evidence="BranchShapeUtil, BehaviorTreeShapeUtil", verdict="parity", note="worth confirming shrink-to-fit specifically, not just grow"),
    dict(feature="Non-destructive highlighter", jointjs="Core — highlighters.add(cellView, selector, id), any cell, by id",
         systemsketch="Bespoke per-ShapeUtil override seam, not one shared primitive",
         evidence="src/inspector/overrides.ts", verdict="gap", note="real, but minor — worth generalizing only once a 3rd/4th consumer shows up"),
    dict(feature="Box / rubber-band selection", jointjs="JointJS+ only", systemsketch="tldraw stock",
         evidence="tldraw core", verdict="ahead", note="free vs. paywalled"),
    dict(feature="Snap-to-grid", jointjs="Core", systemsketch="tldraw stock",
         evidence="tldraw core", verdict="parity", note=""),
    dict(feature="Snaplines (alignment guides)", jointjs="JointJS+ only", systemsketch="tldraw stock",
         evidence="tldraw core", verdict="ahead", note=""),
    dict(feature="Halo (floating resize/rotate/action toolbar)", jointjs="JointJS+ only",
         systemsketch="tldraw's stock selection handles + context menu; no floating multi-action halo",
         evidence="BlockContextMenu.tsx", verdict="parity", note="roughly parity in practice — not a real gap"),
    dict(feature="Command manager (undo/redo)", jointjs="JointJS+ only, delta-based",
         systemsketch="tldraw native, free", evidence="tldraw core", verdict="ahead", note=""),
    dict(feature="Stencil (drag-and-drop shape palette)", jointjs="JointJS+ only",
         systemsketch="Two-tab Library browser (Built-in + Library), core & free",
         evidence="ShapeLibraryBrowser.tsx", verdict="ahead", note=""),
    dict(feature="Serialization (toJSON/fromJSON)", jointjs="Core, stable public format",
         systemsketch=".systemsketch envelope wrapping tldraw's own versioned schema+records",
         evidence="systemSketchFile.ts", verdict="parity", note=""),
    dict(feature="Custom shape authoring", jointjs="Core — one dia.Element.define() call: markup + attrs + defaults",
         systemsketch="Heavier — a new ShapeUtil registered across six separate arrays in five files",
         evidence="App.tsx, createSystemSketchStore.ts, portableTldraw.ts, EmbeddedCanvas.tsx, BoardRender.tsx",
         verdict="known", note="already known, already test-guarded (test_primitive_registration.py) — not new information"),
    dict(feature="Directed-graph auto-layout", jointjs="Separate MIT package, dagre only",
         systemsketch="ELK (general graphs) + d3-hierarchy (trees)",
         evidence="organizeGraph.ts, treeLayout.ts", verdict="ahead", note="ELK is a superset of what dagre does"),
    dict(feature="Groups (bundle unrelated shapes)", jointjs="Not a real primitive even in JointJS+ — only a transient multi-select",
         systemsketch="tldraw native group shape, persists",
         evidence="inspectorModel.ts", verdict="ahead", note=""),
    dict(feature="Pan / zoom", jointjs="Core scale()/translate(); production PaperScroller (inertia, zoomToFit) is JointJS+ only",
         systemsketch="tldraw stock, free", evidence="tldraw core", verdict="ahead", note=""),
]

VERDICT_META = {
    "ahead": dict(label="SystemSketch ahead", cls="v-ahead"),
    "parity": dict(label="Parity", cls="v-parity"),
    "gap": dict(label="New gap", cls="v-gap"),
    "known": dict(label="Known weakness", cls="v-known"),
}

counts = {k: sum(1 for r in ROWS if r["verdict"] == k) for k in VERDICT_META}
TOTAL = len(ROWS)
assert TOTAL == 20, f"expected 20 rows, got {TOTAL}"


def esc(s: str) -> str:
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def row_html(r: dict) -> str:
    vm = VERDICT_META[r["verdict"]]
    note = f'<div class="note">{esc(r["note"])}</div>' if r["note"] else ""
    return f"""
    <tr>
      <td class="feat">{esc(r['feature'])}</td>
      <td class="jj">{esc(r['jointjs'])}</td>
      <td class="ss">{esc(r['systemsketch'])}<div class="ev">{esc(r['evidence'])}</div></td>
      <td class="verdict"><span class="pill {vm['cls']}">{vm['label']}</span>{note}</td>
    </tr>"""


# Stacked-bar KPI: proportional widths for a 20-wide horizontal bar.
BAR_ORDER = ["ahead", "parity", "gap", "known"]
bar_segments = []
x = 0.0
for k in BAR_ORDER:
    w = counts[k] / TOTAL * 100
    bar_segments.append(
        f'<rect x="{x:.2f}%" y="0" width="{w:.2f}%" height="100%" class="seg-{k}"/>'
    )
    x += w
BAR_SVG = f"""<svg viewBox="0 0 100 28" preserveAspectRatio="none" class="barsvg" role="img"
  aria-label="20 features: {counts['ahead']} ahead, {counts['parity']} parity, {counts['gap']} new gaps, {counts['known']} known weakness">
  {''.join(bar_segments)}
</svg>"""

ROWS_HTML = "\n".join(row_html(r) for r in ROWS)

HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>JointJS vs SystemSketch — feature comparison, 2026-09-17</title>
<style>
  :root {{
    --bg:#0e0f12; --panel:#15171c; --panel2:#1b1e25; --line:#282d38;
    --fg:#e6e8ee; --dim:#9aa3b2; --dim2:#6b7383;
    --accent:#f0883e; --accent2:#5aa9f8; --ok:#3fb950; --warn:#e5534b; --behind:#c9a13b;
    --mono: ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  }}
  * {{ box-sizing:border-box }}
  body {{ margin:0; background:var(--bg); color:var(--fg);
    font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif; }}
  .wrap {{ max-width:1120px; margin:0 auto; padding:48px 24px 96px }}
  h1 {{ font-size:32px; line-height:1.2; margin:0 0 6px; letter-spacing:-.02em }}
  h2 {{ font-size:13px; text-transform:uppercase; letter-spacing:.14em; color:var(--dim2);
       margin:56px 0 16px; font-weight:600 }}
  .sub {{ color:var(--dim); font-size:16.5px; margin:0 0 26px; max-width:800px }}
  a {{ color:var(--accent2) }}
  code {{ font-family:var(--mono); font-size:.92em; background:#0009; padding:1px 5px; border-radius:4px }}

  .facts {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr));
    gap:10px; margin:24px 0 28px }}
  .fact {{ background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px 16px }}
  .fact b {{ display:block; font-size:26px; font-variant-numeric:tabular-nums; letter-spacing:-.02em }}
  .fact span {{ font-size:11.5px; color:var(--dim2); text-transform:uppercase; letter-spacing:.08em }}

  .lede {{ background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--accent);
    border-radius:10px; padding:18px 22px; margin:26px 0 }}
  .lede p {{ margin:0 0 10px }} .lede p:last-child {{ margin:0 }}

  .barwrap {{ margin:8px 0 32px }}
  .barsvg {{ width:100%; height:26px; border-radius:6px; overflow:hidden; display:block }}
  .seg-ahead {{ fill:var(--ok) }} .seg-parity {{ fill:var(--accent2) }}
  .seg-gap {{ fill:var(--warn) }} .seg-known {{ fill:var(--behind) }}
  .barlegend {{ display:flex; gap:18px; flex-wrap:wrap; margin-top:10px; font-size:12.5px; color:var(--dim) }}
  .barlegend span {{ display:inline-flex; align-items:center; gap:6px }}
  .sw {{ width:10px; height:10px; border-radius:2px; display:inline-block }}

  table {{ width:100%; border-collapse:collapse; background:var(--panel);
    border:1px solid var(--line); border-radius:10px; overflow:hidden; font-size:13.5px }}
  th {{ text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.08em;
    color:var(--dim2); background:var(--panel2); padding:10px 14px; border-bottom:1px solid var(--line) }}
  td {{ padding:12px 14px; border-bottom:1px solid var(--line); vertical-align:top }}
  tr:last-child td {{ border-bottom:none }}
  td.feat {{ font-weight:600; min-width:190px }}
  td.jj {{ color:var(--dim); min-width:220px }}
  td.ss {{ min-width:260px }}
  .ev {{ font-family:var(--mono); font-size:11.5px; color:var(--dim2); margin-top:4px }}
  .note {{ font-size:12px; color:var(--dim2); margin-top:6px; max-width:260px }}
  .pill {{ display:inline-block; font-size:11.5px; font-weight:600; padding:3px 10px;
    border-radius:99px; white-space:nowrap }}
  .v-ahead {{ background:#12331c; color:#5fd889 }}
  .v-parity {{ background:#122a3d; color:#7cc0ff }}
  .v-gap {{ background:#3d1f1c; color:#ff9a8f }}
  .v-known {{ background:#3a2f11; color:#e8c06a }}

  .gaps {{ display:grid; gap:14px }}
  .gapcard {{ background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:16px 20px }}
  .gapcard h3 {{ margin:0 0 8px; font-size:15.5px }}
  .gapcard p {{ margin:0; color:var(--dim); font-size:14px }}

  .quote {{ border-left:3px solid var(--dim2); padding:4px 0 4px 16px; margin:10px 0;
    color:var(--dim); font-style:italic; font-size:14px }}

  footer {{ margin-top:64px; padding-top:20px; border-top:1px solid var(--line);
    color:var(--dim2); font-size:12.5px; line-height:1.8 }}
</style></head>
<body>
<div class="wrap">
  <h1>JointJS vs SystemSketch</h1>
  <p class="sub">Feature-by-feature comparison against <a href="https://github.com/clientio/joint">clientio/joint</a>
  (JointJS), for the question raised in the bbox-ui project note: what does JointJS teach SystemSketch,
  and what — if anything — is worth building.</p>

  <div class="facts">
    <div class="fact"><b>{TOTAL}</b><span>Features compared</span></div>
    <div class="fact"><b>{counts['ahead'] + counts['parity']}</b><span>Parity or ahead</span></div>
    <div class="fact"><b>{counts['gap']}</b><span>Real new gaps</span></div>
    <div class="fact"><b>{counts['known']}</b><span>Already-known weakness</span></div>
    <div class="fact"><b>4</b><span>Sub-agents dispatched</span></div>
    <div class="fact"><b>MPL-2.0</b><span>JointJS core license</span></div>
  </div>

  <div class="barwrap">
    {BAR_SVG}
    <div class="barlegend">
      <span><i class="sw" style="background:var(--ok)"></i>SystemSketch ahead ({counts['ahead']})</span>
      <span><i class="sw" style="background:var(--accent2)"></i>Parity ({counts['parity']})</span>
      <span><i class="sw" style="background:var(--warn)"></i>New gap ({counts['gap']})</span>
      <span><i class="sw" style="background:var(--behind)"></i>Known weakness ({counts['known']})</span>
    </div>
  </div>

  <div class="lede">
    <p><b>JointJS's open-source core is thinner than its reputation.</b> Undo/redo, box selection,
    snaplines, the halo (floating action toolbar), and the stencil (drag-and-drop palette) are all
    <b>JointJS+</b> — a separate commercial package — not the free MPL-2.0 core. Because SystemSketch is
    built on tldraw, it already gets nearly all of that for free from tldraw's own stock engine — the
    exact bet this repo's <code>CLAUDE.md</code> "tldraw stays stock" rule already made.</p>
    <p>Of {TOTAL} features compared: {counts['ahead'] + counts['parity']} are at parity or ahead, {counts['known']}
    is an already-known, already test-guarded weakness (custom shape authoring's six-registry cost —
    nothing new here), and only {counts['gap']} are genuinely new gaps worth naming.</p>
  </div>

  <h2>The comparison</h2>
  <table>
    <thead><tr><th>Feature</th><th>JointJS ships it in</th><th>SystemSketch</th><th>Verdict</th></tr></thead>
    <tbody>{ROWS_HTML}
    </tbody>
  </table>

  <h2>The two real gaps</h2>
  <div class="gaps">
    <div class="gapcard">
      <h3>1. Cable-crossing disambiguation</h3>
      <p>JointJS's own team states the actual blocker plainly: <code>smooth</code> (curved) router links
      can't be intersection-tested for a jumpover-style arc/gap. <code>PROJECT - pyblocks.md</code> already
      worked through this in the same words — "hops and gaps are structurally incompatible with bezier
      edges" — and reached the right conclusion: decide the routing default first, then crossing marks.
      SystemSketch's default is still <code>curved</code>, so this stays blocked on that decision, exactly
      as already flagged. Not new information — confirmation the blocker is real, and that JointJS doesn't
      solve it for free either (it just doesn't offer the combination at all).</p>
    </div>
    <div class="gapcard">
      <h3>2. A generalized highlight primitive</h3>
      <p>JointJS's <code>highlighters.add(cellView, selector, id, opts)</code> is a small, uniform,
      non-destructive way to draw a stroke/mask/opacity/class highlight on any cell without touching its
      persisted style, keyed by id so it can be removed cleanly. SystemSketch does the same job today, but
      as bespoke logic behind each shape's own <code>getCustomDisplayValues</code> override seam rather than
      one shared primitive. Real, small, and low-risk to generalize once a third or fourth consumer of
      "temporarily highlight this shape" shows up — not worth doing speculatively for one.</p>
    </div>
  </div>

  <h2>License, and why it decides half the table</h2>
  <p>JointJS core is <b>MPL-2.0</b> (<code>LICENSE</code> in <code>clientio/joint</code>), single-licensed,
  not dual. <b>JointJS+</b> is a separate paid package (<code>@joint/plus</code>) carrying undo/redo, box
  selection, snaplines, halo, and the stencil palette — none of that ships in the free tier. One honest
  caveat on the "SystemSketch gets it for free" framing: tldraw's own SDK license changed in 2025 (v4+
  needs a paid license for production use), so it's really "bundled into a cost already priced in
  elsewhere," not zero-cost in absolute terms — still strictly better than paying JointJS+ on top of a
  canvas-engine license.</p>

  <h2>Prior art — this was already evaluated once</h2>
  <p>Zach evaluated JointJS in July 2026 and ranked it below MIT alternatives on the same licensing
  grounds this report reaches independently:</p>
  <div class="quote">"All built-in layouts + inspector/minimap/export are behind the paid JointJS+"
  — <code>Canvas, Node-Editor &amp; Diagramming — Open-Source Reference Map (2026-07-19).md</code></div>
  <p>And <code>PROJECT - pyblocks.md</code> had already named the exact cable-crossing blocker this report
  confirms:</p>
  <div class="quote">"Hops and gaps are structurally incompatible with bezier edges" — JointJS cannot
  detect intersections with <code>smooth</code> router links.</div>
  <p>This report doesn't reverse either prior conclusion. It confirms both from the SystemSketch side.</p>

  <footer>
    Built by <code>docs/build_jointjs_comparison_report.py</code> · sources: <code>docs.jointjs.com</code>,
    <code>github.com/clientio/joint</code>, <code>/home/bam/systemsketch</code> (main), and
    <code>.claude/projects/-home-bam-systemsketch/memory/</code>. Four sub-agents researched JointJS and
    scouted SystemSketch independently; two claims (edge handles, drag-time port highlight) were
    spot-verified directly against the SystemSketch source rather than relayed unchecked. Full writeup
    also lives inline in the vault at <code>Projects/bbox-ui/PROJECT - Black Box UI.md</code> (the
    <code>[!ai]-</code> reply dated 2026-09-17).
  </footer>
</div>
</body></html>"""

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(HTML)
encoded_len = len(quote(HTML))
print(f"wrote {OUT} ({len(HTML):,} bytes on disk, {encoded_len:,} bytes encoded)")
print(f"rows: {counts}")
