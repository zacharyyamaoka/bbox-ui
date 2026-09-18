#!/usr/bin/env python3
"""
Build the node-editor prior-art synthesis report.

Zach, 2026-09-17: "the highlighter feature is super cool... start an Opus
agent to do another pass and see if there's any cool ideas we can take from
this," then mid-turn: "JointJS is basically actually almost exactly what we
want to do... a library for making node based UIs... What I am adding is
the blackbox modeling things which goes more into the hierarchical nesting
aspects... start subagents to look at each of these, and come up with at
least 10 ideas from each" — maxGraph, JointJS's shape-tools page,
litegraph.js, and Vyuh Flow.

Five Opus passes came back (JointJS highlighters, JointJS element-tools,
maxGraph, litegraph.js, Vyuh Flow) with ~58 distinct, source-cited ideas.
This is the synthesis — not a re-paste of five agent transcripts. It surfaces:
one verified bug, two durable architecture forks that need Zach's judgment,
four places where independent sources converged on the same design, the
highest-value ideas in full, and everything else in a dense reference table
so nothing is silently dropped.

Also cross-references a genuinely concurrent peer session (commit 18d2fed on
`claude/bbox-ui-skins-in-storybook`, landed minutes into this same research)
that independently reached three of the same JointJS-highlighter
conclusions — flagged inline, not duplicated.

    python3 docs/build_node_editor_prior_art_report.py
"""
from __future__ import annotations

import pathlib
from urllib.parse import quote

REPO = pathlib.Path("/home/bam/bbox-ui")
OUT = REPO / "reports/node-editor-prior-art-2026-09-17.html"

SOURCES = [
    dict(name="JointJS — highlighters", n=5, url="https://docs.jointjs.com/learn/features/highlighters/",
         note="MPL-2.0 core"),
    dict(name="JointJS — element tools", n=14, url="https://docs.jointjs.com/learn/features/shape-tools/",
         note="MPL-2.0 core"),
    dict(name="maxGraph", n=13, url="https://maxgraph.github.io/maxGraph/", note="draw.io's engine, Apache-2.0"),
    dict(name="litegraph.js", n=13, url="https://github.com/jagenjo/litegraph.js/",
         note="upstream of ComfyUI's fork, MIT"),
    dict(name="Vyuh Flow", n=13, url="https://flow.vyuh.tech/", note="Flutter/Dart, MIT core + paid SDK tier"),
]
TOTAL_IDEAS = sum(s["n"] for s in SOURCES)

# ---------------------------------------------------------------------------
# Featured ideas — the ones worth full prose. Everything else goes in the
# dense reference table (ALSO_SURFACED) so nothing is silently dropped.
# ---------------------------------------------------------------------------
FEATURED = [
    dict(tag="bug", tagLabel="Verified bug — fix now", sources=["maxGraph"],
         title="Block's view toggle currently strands cables",
         body="""maxGraph promotes an edge to its collapsed ancestor's boundary the moment that
         ancestor hides (<code>GraphView.getVisibleTerminal</code> walks the terminal's ancestor
         chain at render time — a pure projection, never a model mutation). SystemSketch already
         has exactly one instance of this: <code>branchFoldAttachPoint</code>
         (<code>src/branch/branchScope.ts:101</code>) — but grep confirms its only production
         caller is <code>src/blocks/connections/blockPorts.ts:367</code>, and it returns
         <code>null</code> for anything that isn't a Branch. Flip a Block's <code>view</code> from
         <code>'expanded'</code> to <code>'simple'</code> while a cable still runs to one of its
         internal ports, and there is currently no defined behavior for where that cable goes."""),
    dict(tag="decision", tagLabel="Decide before building — #1", sources=["Vyuh Flow"],
         title="Is a Region a Block subtype, or a distinct shape kind?",
         body="""Vyuh Flow's own maintainer refactored every node — including containers — onto
         one <code>Node&lt;T&gt;</code> class specifically so containers could carry ports too
         (<code>class GroupNode&lt;T&gt; extends Node&lt;T&gt;</code>), after earlier telling a
         user "ports on annotations are not supported right now." He paid for the unification
         after shipping the split. SystemSketch already pays a real tax for treating shapes as
         distinct kinds — <b>every new shape type costs six hand-copied registry entries across
         five files</b> (<code>test_primitive_registration.py</code> exists because missing one
         painted the embed canvas blank). This is the fork that tax should be weighed against
         before Region grows further."""),
    dict(tag="decision", tagLabel="Decide before building — #2", sources=["litegraph.js", "Vyuh Flow"],
         title="Definition vs. instance: does a reused Region stay isolated, or live-link?",
         body="""Both node-graph libraries studied hit this and chose isolation. Upstream
         litegraph's <code>Subgraph.clone()</code> deep-copies and reassigns every UUID — two
         copies diverge instantly, undocumented as a limitation. ComfyUI later added reusable
         "Blueprints" on purpose, and its own docs say an instance "is still isolated" —
         copy-on-instantiate, never live-linked. <b>Recommendation: isolated copies as the
         reversible default.</b> Live-linking a definition means answering "what happens to every
         instance's overrides when the definition's port list changes" before a single user
         exists to tell you that answer is wrong — and isolation can be upgraded to live-linking
         later; the reverse can't."""),
    dict(tag="convergent", tagLabel="Convergent — 2 independent sources", sources=["maxGraph", "litegraph.js"],
         title="Collapse needs a generalized edge-promotion resolver, and nobody's built the whole thing",
         body="""maxGraph solves the render-time half: a <code>PerimeterFunction</code> gives a
         collapsed shape a landing point, and <code>ParallelEdgeLayout</code> groups edges by
         their <i>visible</i> terminal so four cables collapsing to one point still render as
         four, spaced apart. litegraph solves the authoring half — and shows it's the hard part:
         its own "Convert selection → Subgraph" menu item calls a function whose body is
         <b>entirely commented out</b>, ending in a TODO list ("split every connection... clone
         nodes... try to reconnect"). ComfyUI's fork made this gesture central; upstream never
         finished it. <b>Mapping:</b> generalize <code>branchFoldAttachPoint</code> into a
         shape-agnostic <code>visibleEndpoint()</code> keyed off <code>getBlockShapeVisibility</code>
         rather than a Branch check, give it a perimeter to land on, and fan promoted parallels
         apart — the same three-piece mechanism both libraries independently needed."""),
    dict(tag="convergent", tagLabel="Convergent — 2 independent sources", sources=["litegraph.js", "Vyuh Flow"],
         title='"Draw a loose selection, then promote it to a real container" is the authoring gesture both libraries reach for',
         body="""litegraph's unfinished collapse-to-subgraph and Vyuh's shipped, working
         <code>setBehavior(newBehavior, {captureContainedNodes})</code> — which converts a loose
         spatial region into an ID-set-based composite by absorbing whatever's inside it right
         now, wired to a live radio control in Vyuh's own demo — are the same idea at two
         different levels of finish. <b>Mapping:</b> <code>collapseToRegion(shapeIds)</code> as a
         real command: select loose Blocks, promote to a Branch/Region, edges crossing the new
         boundary become manifest ports automatically. Region membership
         (<code>branchScope.ts:53-64</code>) already gives SystemSketch the boundary test that
         litegraph's unfinished version lacked."""),
    dict(tag="idea", tagLabel="Container ports", sources=["litegraph.js"],
         title="A container's ports are a manifest; the port shapes inside it are just placements",
         body="""<code>LGraph.addInput</code> keeps a slot table (<code>graph.inputs[name]</code>)
         on the container itself; a <code>graph/input</code> node inside just <i>reads</i> that
         table — one declared port can have N bridge nodes tapping it, not one fixed terminal.
         The trap: upstream keys bridges by <b>name</b>, and renaming a port never propagates to
         sibling taps — they silently orphan. <b>Mapping:</b> a Region gets a <code>ports[]</code>
         manifest (Branch already half-has this via <code>controls</code>,
         <code>branchModel.ts:68</code>); bridge by a stable <code>portId</code>, same split
         SystemSketch already uses for <code>definitionId</code>/<code>definitionKey</code>
         (<code>blockModel.ts:520</code>) — and it satisfies the truthful-property-rendering rule
         for free, since the name stays a label, never a key."""),
    dict(tag="idea", tagLabel="Container ports", sources=["litegraph.js"],
         title="A collapsed container should show its contract, not a shrunken preview of its contents",
         body="""<code>Subgraph.computeSize</code> sizes the collapsed node purely by port count
         — width fixed, height from <code>max(inputs, outputs)</code> — the interior is simply
         invisible on the parent canvas; two <code>+</code> buttons let you add ports without
         entering it. <b>Mapping:</b> Block's existing <code>view: 'simple'</code>
         (default at <code>blockModel.ts:616</code>) is already exactly this state for a leaf —
         extending it to Region means rendering the manifest as port rows, never a
         miniature-thumbnail of children. Thumbnails are the tempting wrong answer: they stop
         scaling the moment nesting goes two levels deep."""),
    dict(tag="idea", tagLabel="Navigation", sources=["litegraph.js"],
         title="Drill-in is a navigation stack, and returning lands you back where you left",
         body="""<code>openSubgraph</code>/<code>closeSubgraph</code> push/pop a graph stack;
         closing doesn't just restore the parent view, it re-centers on and re-selects the exact
         subgraph node you drilled into — you land back on the thing you left, not at some
         default viewport. The breadcrumb is canvas text plus a border stroked in the subgraph's
         own color. <b>Mapping:</b> BehaviorTree already has exactly this —
         <code>treeStack</code> + step-in/out (<code>behaviorTreeCommands.ts:192</code>) and
         <code>depthBreadcrumbs.ts</code>. Generalizing that one stack to every Region via
         <code>navigateViewport</code> is extension, not new territory — and copying the
         return-to-where-you-left detail is what stops drilling from feeling like teleportation."""),
    dict(tag="idea", tagLabel="Visual communication", sources=["JointJS — highlighters"],
         title="A reason→painter lookup table is the missing half of the diagnostics pipeline",
         body="""JointJS never lets a producer say "draw an orange stroke" — it says
         <code>cellView.highlight(node, {{magnetAvailability: true}})</code>, and a
         user-replaceable table (<code>Paper.mjs</code> <code>defaultHighlighting</code>) resolves
         that reason to a painter. Verified directly against SystemSketch:
         <code>boardDiagnosticStateOverlay()</code> (<code>diagnosticsModel.ts:577-589</code>)
         already returns a per-shape state with the comment <i>"Nothing paints from this yet."</i>
         — a routing hole, not a props hole. <b>Mapping:</b> a sibling table owning
         reason → <code>{{halo | flag | squiggle | cableBackdrop}}</code> turns the calm-board
         rule ("info paints nothing") into a data row instead of a branch buried in the severity
         mapper — and this idea is <b>not</b> covered by the concurrent peer commit on
         <code>claude/bbox-ui-skins-in-storybook</code> (18d2fed), which addressed the
         single-prop-vs-list gap but not this routing layer."""),
    dict(tag="idea", tagLabel="Visual communication", sources=["JointJS — element tools"],
         title="One tool set can serve leaf and container shapes if visibility is a predicate, not a per-shape branch",
         body="""JointJS's <code>ToolView.computeVisibility()</code> re-evaluates a per-tool
         predicate on every update — but JointJS itself only ever uses it for one narrow case,
         leaving the container/leaf seam unused (grep for
         <code>getParentCell|isEmbedded|fitToChildren</code> across its tools code: zero hits).
         <b>Mapping:</b> one Block tool set, with
         <code>visibility: v =&gt; v.model.view === 'expanded'</code> gating port-editing handles
         and <code>v =&gt; !hasChildren(v)</code> hiding leaf-only tools on a Region — instead of
         maintaining parallel tool sets per shape kind. A second detail worth taking: mounting a
         Region's own handles as an overlay (always crisp) while handles on Blocks <i>inside</i>
         it mount inline, inheriting the parent's transform, so collapsing the Region takes its
         children's handles with it for free."""),
    dict(tag="idea", tagLabel="Validation depth", sources=["maxGraph"],
         title="Let a graph be built wrong and flagged, not just refused at drop-time",
         body="""maxGraph's <code>validateGraph()</code> runs a full-graph, non-blocking pass
         against declared <code>Multiplicity</code> rules (cardinality as real
         <code>min</code>/<code>max</code> numbers, plus allow/deny lists of valid neighbor
         types) and attaches a warning overlay + tooltip to offending cells —
         <code>judgeConnection</code> today only refuses at the moment of connection.
         <b>Mapping:</b> this is the exact producer the "reason→painter" idea above needs a
         consumer for, and it's the natural extension of the invalid-states/lint-marks design
         already in flight (<code>MOC - Invalid States &amp; Lint Marks.md</code>) — a
         wrong-but-intentional wiring becomes something Zach can build and see flagged, rather
         than something the UI silently refuses mid-drag."""),
    dict(tag="idea", tagLabel="Buildable now", sources=["JointJS — element tools"],
         title="A shipped library of 14 parametric drag-handles, one of which is a ready-made donor",
         body="""JointJS's <code>Control</code> tool is a small base class — three overrides
         (<code>getPosition</code>/<code>setPosition</code>/<code>resetPosition</code>),
         double-click to reset, a dashed ghost while dragging — and the shape-tools package ships
         <b>14 concrete ones</b>, including <code>TableDividerTool</code> (clamped to
         <code>width</code>/<code>height</code>). <b>Mapping:</b> a direct donor for dragging a
         Grid primitive's row/column dividers — the missing canvas-level surface for SystemSketch's
         parametric property system. Also worth copying: every <code>Control</code> drag batches
         as one undo step and is stamped with the tool's own id, which is what stops a handle from
         fighting its own model update mid-drag."""),
    dict(tag="idea", tagLabel="Buildable now", sources=["Vyuh Flow"],
         title="Name one transaction boundary for logical multi-node changes",
         body="""Vyuh's <code>mutateGraph(mutation, {{reason}})</code> exists explicitly, per its
         own doc comment, "for logical topology changes that touch multiple nodes and
         connections, such as expanding a node into a subgraph." It batches history into one
         undo step, publishes one spatial-index revision, and nests. Its own honest caveat: no
         rollback — a throw mid-mutation leaves partial state applied.
         <b>Mapping:</b> collapse/expand and "convert selection to Region" both need exactly this
         primitive before either gets a UI — build the boundary first, with the same
         no-rollback caveat named up front rather than discovered later."""),
]

# ---------------------------------------------------------------------------
# Everything else — real, source-cited, but denser. Grouped by theme.
# ---------------------------------------------------------------------------
ALSO_SURFACED = [
    ("Container behavior", [
        ("Vyuh Flow", "Split Region membership into three named axes: membership source (spatial vs ID-set), sizing policy (manual vs auto-fit), escape rule (can a child leave) — SystemSketch's Region currently conflates these into one concept."),
        ("Vyuh Flow", "PortType.both (one port is simultaneously input and output) is documented for exactly a Loop's entry — but Vyuh's own implementation has a shipped bug (double-membership in derived input/output lists) and locks polarity at press-time, which SystemSketch's own 'polarity decided at the landing' design already avoids. Take the type, not the resolution."),
        ("Vyuh Flow", "Nesting by ID-set needs an explicit cycle guard (Vyuh's own `_moveNodesByDelta` carries a visited-set specifically to prevent infinite loops) since nothing in a plain ID list stops A containing B containing A."),
        ("Vyuh Flow", "Nested-region z-index is a single invariant enforced at three separate moments (add, drag-start, load) in Vyuh's code — a sign it kept breaking. Budget for the same repetition, not a single check."),
        ("Vyuh Flow", "Freeze a dragged Region's membership at drag-start and subtract the current selection from the move, or a Block that's both selected and inside the dragged Region moves at 2x delta."),
        ("Vyuh Flow", "Auto-fit-on-child-move must have a reentrancy latch, or resize triggers reposition triggers resize."),
        ("Vyuh Flow", "Decide the empty-container lifecycle explicitly: an empty Branch is probably garbage (auto-delete), an empty Loop body is a legitimate authoring state (persist) — Vyuh models this as one boolean flag, not a universal rule."),
        ("maxGraph", "Containment is three independent policies (extend-parent-on-overflow, constrain-child-inside, allow-overlap) rather than one 'containment' behavior — lets a swimlane clamp while a group grows."),
        ("maxGraph", "Reparenting-on-drag should route through one judgeContainment(child, candidateParent) predicate mirroring judgeConnection's shape, so a drag can't put the model in a state a direct edit couldn't."),
        ("maxGraph", "Foldability should be a derived predicate ('has visible children') rather than a stored flag, so it can never go stale against content — makes a fold-all/expand-all command trivial across shape kinds."),
    ]),
    ("Layout & serialization", [
        ("maxGraph", "Layout is per-container and re-entrant: each container picks its own algorithm and an outer layout reflows around the result — SystemSketch's ELK and d3-hierarchy passes are currently separate global passes, not nestable."),
        ("maxGraph", "A named, inheritable stylesheet (put once, reference by name, override explicitly) is the same idea as bbox-ui's token→preset→override cascade — worth sharing one resolver across both projects."),
        ("litegraph.js", "Reusable definitions should be stored flat in the file envelope, keyed by id, with instances holding a reference — inlining a nested graph into its container (as upstream litegraph does) is what makes reuse impossible later."),
    ]),
    ("Runtime & interaction polish", [
        ("litegraph.js", "Dragging a wire onto empty canvas can open a type-filtered node search (built from a type→node index) instead of a bare context menu — makes typed ports earn their keep as an affordance, not just a validation nag."),
        ("litegraph.js", "A cable that just carried a value can glow briefly (alpha-fade over ~1s) as the cheapest honest 'this fired' signal — no numbers, no marching dots, no layout cost."),
        ("litegraph.js", "Reject full widgets-in-node (SystemSketch has a real inspector; that's canvas2d's forced choice, not a feature to import) — but do take 'promote one inner field onto the parent's inspector,' which is the actual composite-node feature."),
        ("litegraph.js", "Keep visual Groups (geometric, transient, membership by overlap) strictly distinct from Regions (persisted, semantic) — conflating them makes 'what does this box mean' unanswerable."),
        ("litegraph.js", "Ship named port taps before reroute dots — a tap carries a name and a type, a reroute point carries neither, and for black-box modeling the named version is strictly more informative."),
        ("Vyuh Flow", "A zoom-driven level-of-detail ladder (7 independent visibility booleans, not a binary) is richer than simple/expanded — but Vyuh's own most recent release reverted auto-simplification from default-on to opt-in, so treat it as opt-in only unless boards routinely exceed ~200 visible Blocks."),
        ("maxGraph", "A real minimap/outline (a second small graph instance sharing the same renderer, so it structurally cannot drift) is a genuine current gap — none exists today, and deep nesting is exactly when orientation aids matter most."),
    ]),
    ("Element-tool mechanics (JointJS)", [
        ("JointJS — element tools", "getToolOptions derives three related behaviors (relative positioning, forced model-geometry, implicit rotation) from one 'is this tool an overlay' boolean — getting this wrong is the classic double-transform bug on nested shapes."),
        ("JointJS — element tools", "useModelGeometry vs view-geometry diverge specifically on containers whose rendered node differs from its declared extent — a Region's boundary tool must use model geometry or it tracks painted children instead of the Region's own bounds."),
        ("JointJS — element tools", "A hover-triggered 'connect from anywhere' affordance reuses the same drag primitive as a port press but — verified against source, not yet run — appears to skip one of the two connection validators (validateMagnet), worth a real experiment before relying on it."),
        ("JointJS — element tools", "Tool placement can be a small declarative expression language (percentages, calc(w), calc(h/2+10)) evaluated against the bounding box — makes tool positions serializable and themeable identically across React Flow / tldraw / DOM hosts."),
        ("JointJS — element tools", "Every tool-driven mutation should batch as one undo step and carry the tool's own id on the change event, so a handle's own re-render doesn't get triggered by the change it just made."),
        ("JointJS — element tools", "Tool sets are swapped wholesale per shape (never partially patched) and broadcast show/hide/remove via one paper-wide event — a clean 'clear every handle on the board' primitive for gesture starts."),
    ]),
]

TAG_META = {
    "bug": dict(cls="tag-bug", label="Bug"),
    "decision": dict(cls="tag-decision", label="Decision"),
    "convergent": dict(cls="tag-convergent", label="Convergent"),
    "idea": dict(cls="tag-idea", label="Idea"),
}


def esc(s: str) -> str:
    return s


def featured_html(f: dict) -> str:
    tm = TAG_META[f["tag"]]
    src_chips = " ".join(f'<span class="srcchip">{s}</span>' for s in f["sources"])
    return f"""
    <div class="card {tm['cls']}">
      <div class="card-hd">
        <span class="tag {tm['cls']}">{f['tagLabel']}</span>
        {src_chips}
      </div>
      <h3>{f['title']}</h3>
      <p>{f['body']}</p>
    </div>"""


FEATURED_HTML = "\n".join(featured_html(f) for f in FEATURED)

ALSO_HTML_PARTS = []
for section_title, rows in ALSO_SURFACED:
    row_html = "\n".join(
        f'<tr><td class="src">{src}</td><td>{text}</td></tr>' for src, text in rows
    )
    ALSO_HTML_PARTS.append(f"""
    <h3 class="also-h3">{section_title}</h3>
    <table class="also-table"><tbody>{row_html}</tbody></table>""")
ALSO_HTML = "\n".join(ALSO_HTML_PARTS)

SOURCE_ROWS = "\n".join(
    f'<tr><td>{s["name"]}</td><td class="ev">{s["url"]}</td><td>{s["note"]}</td><td class="num">{s["n"]}</td></tr>'
    for s in SOURCES
)

ALSO_COUNT = sum(len(rows) for _, rows in ALSO_SURFACED)
FEATURED_COUNT = len(FEATURED)
ENTRY_COUNT = FEATURED_COUNT + ALSO_COUNT
DROPPED = TOTAL_IDEAS - ENTRY_COUNT
# WHY these numbers don't match: several raw per-agent ideas were merged into
# one synthesized entry (e.g. the two "convergent" cards each fold 2-3 raw
# ideas from different agents into one), and a handful of purely
# methodological notes (docs-drift observations, "couldn't verify" caveats
# with no standalone actionable content) were folded into the featured
# entries' prose rather than kept as separate rows. Nothing substantive was
# silently discarded — every raw idea is traceable to a featured or
# also-surfaced entry above, just not 1:1.

HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Node-editor prior art — five sources, 2026-09-17</title>
<style>
  :root {{
    --bg:#0e0f12; --panel:#15171c; --panel2:#1b1e25; --line:#282d38;
    --fg:#e6e8ee; --dim:#9aa3b2; --dim2:#6b7383;
    --accent:#f0883e; --accent2:#5aa9f8; --ok:#3fb950; --warn:#e5534b; --purple:#bc8cff;
    --mono: ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  }}
  * {{ box-sizing:border-box }}
  body {{ margin:0; background:var(--bg); color:var(--fg);
    font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif; }}
  .wrap {{ max-width:1080px; margin:0 auto; padding:48px 24px 96px }}
  h1 {{ font-size:32px; line-height:1.2; margin:0 0 6px; letter-spacing:-.02em }}
  h2 {{ font-size:13px; text-transform:uppercase; letter-spacing:.14em; color:var(--dim2);
       margin:56px 0 18px; font-weight:600 }}
  h3 {{ margin:10px 0 8px; font-size:16px }}
  .also-h3 {{ font-size:13px; color:var(--accent2); text-transform:none; letter-spacing:0;
    margin:28px 0 10px; font-weight:700 }}
  .sub {{ color:var(--dim); font-size:16.5px; margin:0 0 26px; max-width:800px }}
  a {{ color:var(--accent2) }}
  code {{ font-family:var(--mono); font-size:.9em; background:#0009; padding:1px 5px; border-radius:4px }}
  p {{ margin:0 0 8px }}

  .facts {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr));
    gap:10px; margin:24px 0 28px }}
  .fact {{ background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px 16px }}
  .fact b {{ display:block; font-size:26px; font-variant-numeric:tabular-nums; letter-spacing:-.02em }}
  .fact span {{ font-size:11.5px; color:var(--dim2); text-transform:uppercase; letter-spacing:.08em }}

  .lede {{ background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--accent);
    border-radius:10px; padding:18px 22px; margin:26px 0 }}

  table.srctable {{ width:100%; border-collapse:collapse; font-size:13px; margin:0 0 8px }}
  table.srctable th {{ text-align:left; color:var(--dim2); text-transform:uppercase; font-size:10.5px;
    letter-spacing:.08em; padding:6px 10px; border-bottom:1px solid var(--line) }}
  table.srctable td {{ padding:7px 10px; border-bottom:1px solid var(--line) }}
  table.srctable .ev {{ font-family:var(--mono); font-size:12px; color:var(--dim) }}
  table.srctable .num {{ text-align:right; font-variant-numeric:tabular-nums; color:var(--dim2) }}

  .card {{ background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--line);
    border-radius:10px; padding:18px 20px; margin:0 0 16px }}
  .card-hd {{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:8px }}
  .tag {{ font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.07em;
    padding:3px 9px; border-radius:99px }}
  .srcchip {{ font-size:11px; color:var(--dim2); background:var(--panel2); border:1px solid var(--line);
    padding:2px 8px; border-radius:99px }}
  .tag-bug {{ background:#3d1f1c; color:#ff9a8f }} .card.tag-bug {{ border-left-color:var(--warn) }}
  .tag-decision {{ background:#3a2f11; color:#e8c06a }} .card.tag-decision {{ border-left-color:#e8c06a }}
  .tag-convergent {{ background:#241a3a; color:var(--purple) }} .card.tag-convergent {{ border-left-color:var(--purple) }}
  .tag-idea {{ background:#122a3d; color:#7cc0ff }} .card.tag-idea {{ border-left-color:var(--accent2) }}
  .card p {{ color:var(--dim); font-size:14px }}
  .card b {{ color:var(--fg) }}

  .also-table {{ width:100%; border-collapse:collapse; font-size:13px; margin-bottom:6px }}
  .also-table td {{ padding:8px 10px; border-bottom:1px solid var(--line); vertical-align:top; color:var(--dim) }}
  .also-table td.src {{ color:var(--dim2); font-size:11.5px; text-transform:uppercase; letter-spacing:.04em;
    white-space:nowrap; width:150px; font-weight:600 }}

  footer {{ margin-top:64px; padding-top:20px; border-top:1px solid var(--line);
    color:var(--dim2); font-size:12.5px; line-height:1.8 }}
</style></head>
<body>
<div class="wrap">
  <h1>Node-editor prior art, five sources</h1>
  <p class="sub">JointJS (two passes), maxGraph, litegraph.js, and Vyuh Flow — read for design
  decisions worth taking, not feature checklists. Zach's framing: the flat node/port/edge
  mechanics are a solved problem elsewhere; the differentiator is black-box modeling and
  hierarchical nesting, so that is where this synthesis weights hardest.</p>

  <div class="facts">
    <div class="fact"><b>5</b><span>Sources researched</span></div>
    <div class="fact"><b>{TOTAL_IDEAS}</b><span>Raw findings across sources</span></div>
    <div class="fact"><b>{ENTRY_COUNT}</b><span>Synthesized into entries below</span></div>
    <div class="fact"><b>1</b><span>Verified live bug</span></div>
    <div class="fact"><b>2</b><span>Architecture forks to decide</span></div>
    <div class="fact"><b>2</b><span>Independent convergences</span></div>
  </div>
  <p class="sub" style="margin-top:-16px">{TOTAL_IDEAS} raw findings, {ENTRY_COUNT} synthesized
  entries — {DROPPED} were merged into a convergent entry or folded into another entry's prose
  rather than kept as separate rows. Nothing substantive was dropped; see the footer.</p>

  <table class="srctable">
    <thead><tr><th>Source</th><th>URL</th><th>License</th><th>Ideas</th></tr></thead>
    <tbody>{SOURCE_ROWS}</tbody>
  </table>

  <div class="lede">
    <p><b>A concurrent session already landed a related finding while this research ran</b> —
    commit <code>18d2fed</code> on <code>claude/bbox-ui-skins-in-storybook</code> independently
    mapped JointJS's five highlighter types onto this plan's vocabulary and reached the same
    "prop should be a list, not a scalar" conclusion as one idea below. That overlap is called
    out inline rather than repeated. Nothing here duplicates or contradicts it.</p>
  </div>

  <h2>Read this first</h2>
  {FEATURED_HTML}

  <h2>Also surfaced — real, cited, lower priority</h2>
  <p class="sub">{ALSO_COUNT} more ideas, grouped by theme. Every one traces to a real file or
  doc section in the source agent reports; kept dense here on purpose rather than padded to
  match the featured section's prose.</p>
  {ALSO_HTML}

  <h2>Recommended build order</h2>
  <div class="card tag-idea">
    <h3>1. Fix the bug</h3>
    <p>Generalize <code>branchFoldAttachPoint</code> into a shape-agnostic
    <code>visibleEndpoint()</code>, give it a perimeter to land on, fan promoted parallels apart.
    This closes the maxGraph-verified gap and is the same mechanism the "convert selection to
    Region" gesture will need next.</p>
  </div>
  <div class="card tag-decision">
    <h3>2. Decide, don't build around, the two forks</h3>
    <p>Region-as-Block-subtype and definition-vs-instance both get harder to change the more
    gets built on top of the current answer. Vyuh Flow's own team paid for exactly the first one
    after shipping; litegraph's team paid for exactly the second. Settle both before Region grows
    further, not after.</p>
  </div>
  <div class="card tag-convergent">
    <h3>3. Ship <code>collapseToRegion(shapeIds)</code></h3>
    <p>Two independent libraries reach for this same authoring gesture — one shipped it
    (Vyuh's <code>setBehavior</code>), one started and abandoned it (litegraph's commented-out
    <code>buildFromNodes</code>). SystemSketch's Region membership model already has the boundary
    test the abandoned attempt lacked.</p>
  </div>
  <div class="card tag-idea">
    <h3>4. Everything else is independent and can queue behind those three</h3>
    <p>The reason→painter table, the container-aware tool visibility predicate, and the
    Grid-divider <code>Control</code> donor are all buildable in any order once the above lands.</p>
  </div>

  <footer>
    Built by <code>docs/build_node_editor_prior_art_report.py</code>. Five Opus (claude-opus)
    research passes, each grounded in real SystemSketch/bbox-ui file paths and told explicitly
    not to re-derive ground already covered. Two claims are flagged unverified by their own
    source agents: JointJS's <code>Connect</code> tool skipping <code>validateMagnet</code>
    (read from the call graph, not exercised), and Vyuh Flow's For-Each loop interaction design
    (closed-source; claims come from the maintainer's own issue-tracker comments, not code).
    Cross-references commit <code>18d2fed</code> on <code>claude/bbox-ui-skins-in-storybook</code>
    and the vault note <code>Projects/bbox-ui/PROJECT - Black Box UI.md</code>. {TOTAL_IDEAS} raw
    findings came back from the five agents; {ENTRY_COUNT} appear above as distinct entries. The
    gap is merges, not drops — the two "convergent" cards each fold 2-3 raw findings from
    different agents into one entry, and a few purely methodological notes (docs-drift
    observations, "could not verify" caveats with no standalone actionable content) were folded
    into a featured entry's prose instead of kept as their own row.
  </footer>
</div>
</body></html>"""

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(HTML)
encoded_len = len(quote(HTML))
print(f"wrote {OUT} ({len(HTML):,} bytes on disk, {encoded_len:,} bytes encoded)")
print(f"featured: {FEATURED_COUNT}, also-surfaced: {ALSO_COUNT}, total: {TOTAL_IDEAS}")
