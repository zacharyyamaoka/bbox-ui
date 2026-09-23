#!/usr/bin/env python3
"""Builds dom-canvas-vs-reactflow-2026-09-22.html — a self-contained decision report.

Read-only research output: every number below was measured in the bbox-ui repo
(branch claude/system-sketch-ui-feedback-14bfc3 @ 51a81e1) or in the installed
@xyflow packages; estimates are labelled as estimates.
"""
from html import escape
from pathlib import Path

OUT = Path("/home/bam/bbox-ui/reports/dom-canvas-vs-reactflow-2026-09-22.html")

# --------------------------------------------------------------------------
# Text-width estimate for SVG layout (system-ui). Verified by rendering.
# --------------------------------------------------------------------------
WIDE = set("mwMW@")
NARROW = set("ilj.,:;'|!() ·/-")


def text_w(text: str, size: float) -> float:
    total = 0.0
    for ch in text:
        if ch in WIDE:
            total += 0.82
        elif ch in NARROW:
            total += 0.30
        elif ch.isupper():
            total += 0.64
        else:
            total += 0.53
    return total * size


# --------------------------------------------------------------------------
# Figure 1 — who owns which gesture
# --------------------------------------------------------------------------

def host_roles_svg() -> str:
    W, H = 960, 650
    out = []
    add = out.append
    add(f'<svg class="diagram" viewBox="0 0 {W} {H}" role="img" '
        'aria-label="Who owns which gesture. Kit gestures, bounded by one component, work in every host including the static DOM Canvas. '
        'Canvas-spanning gestures are none-by-design in the DOM Canvas, stock in React Flow and tldraw, except elbow cable corners, '
        'which no host but the tldraw studio ships and which should be built once in the kit.">')

    # ---- kit band -------------------------------------------------------
    add('<rect class="kit-band" x="16" y="12" width="928" height="140" rx="10"/>')
    add('<text class="d-h" x="34" y="38">THE KIT — gestures bounded by one component’s box</text>')
    add('<text class="d-sub" x="34" y="57">ARCHITECTURE.md:233-238 · rendered inside every host by SceneNodeView, so they work the same in all three — the static DOM Canvas included</text>')

    def chip_row(y, chips):
        x = 34
        for label, cls in chips:
            w = text_w(label, 12.5) + 26
            add(f'<rect class="chip {cls}" x="{x:.1f}" y="{y}" width="{w:.1f}" height="28" rx="14"/>')
            add(f'<text class="chip-t" x="{x + w / 2:.1f}" y="{y + 18.5}" text-anchor="middle">{escape(label)}</text>')
            x += w + 10

    chip_row(72, [
        ("member drag", "chip-kit"),
        ("port reorder · dnd-kit", "chip-kit"),
        ("stack reorder · dnd-kit", "chip-kit"),
        ("caret · text edit", "chip-kit"),
        ("fold chevrons", "chip-kit"),
        ("hover states", "chip-kit"),
    ])
    chip_row(110, [
        ("straight-cable bends · TraceEditor", "chip-kit"),
        ("wall-port slide · story code today", "chip-bench"),
        ("elbow cable corners · missing: build once here", "chip-gap"),
    ])

    # ---- connector ------------------------------------------------------
    cols = [(206, 238), (454, 238), (702, 242)]
    for cx, cw in cols:
        mid = cx + cw / 2
        add(f'<line class="conn" x1="{mid}" y1="153" x2="{mid}" y2="184" marker-end="url(#dn)"/>')
    add('<defs><marker id="dn" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">'
        '<path class="conn-head" d="M0,0 L10,5 L0,10 z"/></marker></defs>')
    add('<text class="d-note" x="24" y="176">each host draws the kit ↓</text>')

    # ---- host headers ---------------------------------------------------
    heads = [
        ("DOM Canvas", "the control · static on purpose"),
        ("React Flow", "the twin for anything that moves"),
        ("tldraw · bbox studio", "the product"),
    ]
    for (cx, cw), (name, role) in zip(cols, heads):
        add(f'<rect class="head" x="{cx}" y="190" width="{cw}" height="52" rx="8"/>')
        add(f'<text class="head-t" x="{cx + 14}" y="212">{escape(name)}</text>')
        add(f'<text class="head-s" x="{cx + 14}" y="231">{escape(role)}</text>')
    add('<text class="d-h" x="24" y="212">HOST GESTURES</text>')
    add('<text class="d-sub" x="24" y="231">span the canvas</text>')

    # ---- matrix ---------------------------------------------------------
    rows = [
        ("move a box", [("none", "— none, on purpose"), ("stock", "stock · XYDrag"), ("stock", "stock · translate")]),
        ("resize", [("none", "— none, on purpose"), ("stock", "stock · NodeResizer"), ("stock", "stock · resize handles")]),
        ("pan · zoom", [("none", "— none, on purpose"), ("stock", "stock · XYPanZoom"), ("stock", "stock · camera")]),
        ("select · marquee", [("none", "— none, on purpose"), ("stock", "stock · selection"), ("stock", "stock · select tool")]),
        ("raise on top", [("none", "— none, on purpose"), ("stock", "stock · elevateNodesOnSelect"), ("stock", "stock · bring to front")]),
        ("draw a cable", [("none", "— none, on purpose"), ("stock", "stock · switched off here"), ("stock", "studio · drag dot to dot")]),
        ("drag cable corners", [("gap", "kit, once built"), ("gap", "kit, once built · 0 exports"), ("stock", "stock handles · studio P-028")]),
    ]
    y0, pitch, ch = 256, 43, 32
    for i, (label, cells) in enumerate(rows):
        y = y0 + i * pitch
        add(f'<text class="row-t" x="24" y="{y + 21}">{escape(label)}</text>')
        for (cx, cw), (kind, text) in zip(cols, cells):
            add(f'<rect class="cell cell-{kind}" x="{cx}" y="{y}" width="{cw}" height="{ch}" rx="6"/>')
            add(f'<text class="cell-t cell-t-{kind}" x="{cx + 12}" y="{y + 20.5}">{escape(text)}</text>')

    # ---- legend ---------------------------------------------------------
    ly = 578
    items = [
        ("cell-stock", "stock in the engine"),
        ("cell-none", "none — on purpose"),
        ("cell-gap", "missing: build once in the kit"),
    ]
    x = 24
    for cls, label in items:
        add(f'<rect class="cell {cls}" x="{x}" y="{ly}" width="26" height="16" rx="4"/>')
        add(f'<text class="d-note" x="{x + 34}" y="{ly + 12.5}">{escape(label)}</text>')
        x += 34 + text_w(label, 12) + 30
    add('<text class="d-note" x="24" y="616">Sources: domCanvas.tsx:5-15 · reactFlowHost.tsx:332-392, 423-439, 481-500, 738 · tldrawHost.tsx:33-46 · traceEditor.tsx:229-242</text>')
    add('<text class="d-note" x="24" y="636">apps/systemsketch/src/shapes/wire/WireShapeUtil.tsx:440-530 (bbox studio, P-028: stock tldraw getHandles / onHandleDrag)</text>')
    add('</svg>')
    return "\n".join(out)


# --------------------------------------------------------------------------
# Figure 2 — new lines per capability (estimates, ranges)
# --------------------------------------------------------------------------

CHART_ROWS = [
    # label, dom (lo, hi) or None, rf (lo, hi) or None, dom note, rf note
    ("Move a box", (40, 60), None, "", "0 · stock"),
    ("Raise it on top", (10, 20), None, "", "0 · stock"),
    ("Resize", (100, 200), None, "", "0 · stock, already wired"),
    ("Select · marquee", (100, 180), None, "", "0 · stock"),
    ("Snap to grid", (15, 30), None, "", "0 · stock"),
    ("Cable parity (kit router)", None, (100, 160), "0 · WireLayer has it", ""),
    ("Elbow cable corners", (120, 165), (120, 165), "", ""),
]


def bar_path(x0, y, x1, h, r=4.0):
    """Bar anchored square at the baseline (x0), rounded at the data end (x1)."""
    if x1 - x0 < r:
        r = max(0.0, x1 - x0)
    return (f"M{x0:.1f},{y:.1f} H{x1 - r:.1f} Q{x1:.1f},{y:.1f} {x1:.1f},{y + r:.1f} "
            f"V{y + h - r:.1f} Q{x1:.1f},{y + h:.1f} {x1 - r:.1f},{y + h:.1f} H{x0:.1f} Z")


def lines_chart_svg() -> str:
    W = 960
    left, right = 250, 880
    vmax = 220
    scale = (right - left) / vmax
    top = 64
    pitch = 50
    bh = 12
    H = top + pitch * len(CHART_ROWS) + 78
    out = []
    add = out.append
    add(f'<svg class="chart" viewBox="0 0 {W} {H}" role="img" '
        'aria-label="New lines you would write, per capability. DIY DOM canvas: move a box 40-60, raise 10-20, resize 100-200, select 100-180, snap 15-30, cable parity 0, elbow corners 120-165. '
        'React Flow host: 0 for the first five because they are stock, cable parity 100-160 once, elbow corners 120-165 (shared kit work).">')
    # legend
    add(f'<rect class="sw-dom" x="{left}" y="14" width="14" height="14" rx="3"/>')
    add(f'<text class="c-legend" x="{left + 20}" y="25.5">DIY DOM canvas (option B)</text>')
    lx = left + 20 + text_w("DIY DOM canvas (option B)", 13) + 28
    add(f'<rect class="sw-rf" x="{lx:.1f}" y="14" width="14" height="14" rx="3"/>')
    add(f'<text class="c-legend" x="{lx + 20:.1f}" y="25.5">React Flow host (option A+)</text>')
    kx = lx + 20 + text_w("React Flow host (option A+)", 13) + 28
    add(f'<text class="c-muted" x="{kx:.1f}" y="25.5">solid = low estimate · faded = up to high</text>')
    # grid + ticks
    for v in (0, 50, 100, 150, 200):
        x = left + v * scale
        add(f'<line class="grid{" base" if v == 0 else ""}" x1="{x:.1f}" y1="{top - 10}" x2="{x:.1f}" y2="{top + pitch * len(CHART_ROWS) - 6}"/>')
        add(f'<text class="tick" x="{x:.1f}" y="{top - 16}" text-anchor="middle">{v}</text>')
    add(f'<text class="c-muted" x="{right}" y="{top - 16}" text-anchor="end" dx="44">lines</text>')

    for i, (label, dom, rf, dom_note, rf_note) in enumerate(CHART_ROWS):
        y = top + i * pitch
        add(f'<text class="c-label" x="{left - 14}" y="{y + 18}" text-anchor="end">{escape(label)}</text>')
        for j, (rng, cls, note, who) in enumerate(((dom, "dom", dom_note, "DIY DOM canvas"), (rf, "rf", rf_note, "React Flow host"))):
            by = y + 4 + j * (bh + 4)
            if rng is None:
                add(f'<g><title>{escape(label)} — {who}: {escape(note)}</title>'
                    f'<circle class="dot-{cls}" cx="{left}" cy="{by + bh / 2}" r="4.5"/></g>')
                add(f'<text class="c-val" x="{left + 12}" y="{by + bh - 1.5}">{escape(note)}</text>')
                continue
            lo, hi = rng
            x_lo = left + lo * scale
            x_hi = left + hi * scale
            tip = f"{escape(label)} — {who}: {lo}–{hi} new lines (estimate)"
            add(f'<g><title>{tip}</title>'
                f'<path class="bar-{cls} faded" d="{bar_path(left, by, x_hi, bh)}"/>'
                f'<path class="bar-{cls}" d="M{left},{by} H{x_lo:.1f} V{by + bh} H{left} Z"/></g>')
            val = f"{lo}–{hi}"
            add(f'<text class="c-val" x="{x_hi + 8:.1f}" y="{by + bh - 1.5}">{val}</text>')
        if label == "Elbow cable corners":
            add(f'<text class="c-muted" x="{left - 14}" y="{y + 35}" text-anchor="end">shared: build once in the kit</text>')
        if label == "Cable parity (kit router)":
            add(f'<text class="c-muted" x="{left - 14}" y="{y + 35}" text-anchor="end">paid once, for every RF story</text>')

    ty = top + pitch * len(CHART_ROWS) + 20
    add(f'<text class="c-total" x="{left - 14}" y="{ty}" text-anchor="end">Running total</text>')
    add(f'<text class="c-total" x="{left}" y="{ty}">DIY DOM canvas ≈ 385–655 lines, and still climbing</text>')
    add(f'<text class="c-total" x="{left}" y="{ty + 20}">React Flow host ≈ 220–325 lines, and 120–165 of that is the shared corner work</text>')
    add(f'<text class="c-muted" x="{left}" y="{ty + 42}">Estimates ±50%, product code only. React Flow’s own versions of the first five: ≈1,500 bundled lines in @xyflow/system 0.0.82.</text>')
    add('</svg>')
    return "\n".join(out)


# --------------------------------------------------------------------------
# Tables
# --------------------------------------------------------------------------

CRITERIA = [
    ("C1", "Keeps you on static UI", 20,
     "“lets even just assume its static UI for now” (Sep 22 :90). A canvas project is the rabbit hole you named."),
    ("C2", "Hit-testing and gestures carry over to the product", 20,
     "The studio runs on tldraw, and React Flow is the cheap second opinion. This week’s hit-test bugs were all seams between the kit and a real engine; a canvas that ships nowhere can’t catch them."),
    ("C3", "Shows what React Flow gives vs vanilla DOM", 15,
     "Your own reason for keeping the “silly DOM” (Sep 22 :150)."),
    ("C4", "Lines now, and the slope after", 15,
     "“AT some point though this basically feels like reactflow” (Sep 22 :130)."),
    ("C5", "Off-the-shelf first", 10,
     "Your standing rule: maximize stock parts, build only the smallest missing piece."),
    ("C6", "Architecture stays honest", 10,
     "The control host and the two-test gesture rule (ARCHITECTURE.md:210, 228-238). No re-litigating a settled call."),
    ("C7", "One obvious answer to “can I drag this here?”", 10,
     "Sep 21 :1198, “I seem to be able to drag the children inside but not the things on the outside? why?”, and the benches keep forking."),
]
WEIGHTS = [c[2] for c in CRITERIA]

OPTIONS = [
    ("A+", "DOM static; React Flow twin after cable parity; bounded gestures in the kit", "recommended",
     [4, 4, 5, 3.5, 5, 5, 4],
     "Same router in both hosts, so the only difference you see is React Flow’s gestures. Parity costs lines once and pays back on every React Flow story."),
    ("A", "DOM static; React Flow twin on today’s host (your note, as written)", "",
     [4, 4, 2, 3, 5, 5, 4],
     "Right direction, but today’s React Flow host draws different cables (smoothstep, no keep-outs) and no rings. You’d be comparing two routers, not two hosts."),
    ("E", "bbox studio (tldraw) as the interactive twin", "",
     [3, 5, 2, 2, 5, 5, 3],
     "The product, and it already has corner handles (P-028). But the wall crossing isn’t in the studio yet, and tldraw vs DOM mixes in whiteboard concerns."),
    ("C", "Drop the DOM host; React Flow only", "",
     [3, 4, 1, 3, 5, 1, 3],
     "Loses the engine-free control and the baseline you want to learn from. It also contradicts your Sep 19 “plain DOM canvas … exact same structure as bbox ui”."),
    ("F", "Box drag in the wall-crossing bench only (the quick fix)", "",
     [4, 2, 2, 4, 2, 4, 2],
     "Cheapest literal answer (~40–60 lines). But it’s one more private DOM host where outer boxes move while DomCanvas stories don’t, and that bench now conflicts with the trunk."),
    ("B", "Barebones draggable DOM canvas", "",
     [2, 2, 2, 3, 1, 2, 4],
     "Step one is cheap, but it tests a host that ships nowhere, shrinks the difference you want to see, and reverses the recorded routing (node drag → React Flow), so it needs a decision record."),
]


def total(scores):
    return sum(s * w for s, w in zip(scores, WEIGHTS)) / 5


def criteria_table() -> str:
    rows = "".join(
        f"<tr><td class='mono'>{cid}</td><td><strong>{escape(name)}</strong></td>"
        f"<td class='num'>{w}</td><td>{escape(why)}</td></tr>"
        for cid, name, w, why in CRITERIA)
    return ("<div class='table-wrap'><table class='t'><thead><tr><th>#</th><th>Criterion</th>"
            "<th class='num'>Weight</th><th>Why it carries that weight now</th></tr></thead>"
            f"<tbody>{rows}</tbody></table></div>")


def options_table() -> str:
    head = "".join(f"<th class='num' title='{escape(c[1])}'>{c[0]}<span class='w'>{c[2]}</span></th>" for c in CRITERIA)
    body = []
    for oid, name, tag, scores, why in OPTIONS:
        t = total(scores)
        cells = "".join(f"<td class='num sc sc{int(round(s))}'>{('%g' % s)}</td>" for s in scores)
        badge = "<span class='badge'>recommended</span>" if tag else ""
        body.append(
            f"<tr class='{'rec' if tag else ''}'><td class='mono opt'>{oid}</td>"
            f"<td class='optname'><strong>{escape(name)}</strong>{badge}<div class='why'>{escape(why)}</div></td>"
            f"{cells}<td class='num tot'><div class='totbar'><span style='width:{t:.0f}%'></span></div>{t:.0f}</td></tr>")
    return ("<div class='table-wrap'><table class='t scores'><thead><tr><th>Option</th><th></th>"
            f"{head}<th class='num'>Total<span class='w'>/100</span></th></tr></thead>"
            f"<tbody>{''.join(body)}</tbody></table></div>")


LOC_B = [
    ("Place boxes absolutely", "hosts/domCanvas.tsx:65-78", "0"),
    ("Drag members inside a block or region", "hosts/memberDrag.ts:78-137 · hosts/nodeViews.tsx:218-265 (freeMemberOf, MEMBER_DRAG_VETO)", "0 — already works in DOM"),
    ("Press vs drag, threshold, Escape", "scene/interactions/dragIntent.ts (161) · hosts/useDragIntent.ts:49-104", "0"),
    ("Who may grab where (hit policy)", "scene/interactions/dragPolicy.ts (591) · hosts/grabChain.ts (100) · hosts/nodeViews.tsx:96 POINTER_OWNED_CLASS", "~5"),
    ("Move top-level boxes, the region included (its corner-card header is its own header)", "useDragIntent · hosts/nodeViews.tsx:142-149 moveMember (any node id) · hosts/reactFlowHost.tsx:126-133 ownHeaderOf", "40–60"),
    ("Raise the dragged box on top", "— (between-node z-order is host-owned: CLAUDE.md, z-index section)", "10–20"),
    ("Carry pins on a cable", "components/trace.tsx:643 takes pins · but components/wiring.ts:37-65 Wire has none", "20–25"),
    ("Grab and drag elbow corners", "elbow/elbowRouter.ts:1068-1080 pinElbowSegment · elbow/elbowPins.ts · handle/reveal pattern in components/traceEditor.tsx (getScreenCTM, :139-146)", "100–140"),
    ("Hover: reveal handles, highlight the box", "component states", "15–25"),
]
LOC_A = [
    ("React Flow cable parity: TraceEdge routes through the kit’s router (elbow, keep-outs, through) and reports each polyline",
     "components/trace.tsx traceGeometry · components/wiring.ts keepOutsFor · dot-sighting pattern at hosts/reactFlowHost.tsx:201-222", "100–160"),
    ("Parity check: DOM and React Flow draw the same polyline (±1px, zoom 1) on HOST_SCENE and a region fixture",
     "hosts/SceneHosts.stories.tsx fixtures · hosts/hostGestures.ts:37-88", "60–80 (test)"),
    ("One crossing glue for both hosts: lift useWallCrossings out of the story, add an optional crossings field to the node decoration",
     "presets/RegionViews.stories.tsx:183-205 · components/regionViews.layout.ts wallCrossings · components/region.tsx crossings prop", "30–50"),
    ("Story: Option 1 · Mirror (ReactFlow ⇄ DOM Canvas). One scene state; drag a box in React Flow and both panes re-seat the ring",
     "ReactFlowHost · DomCanvas · the sketch fixture", "70–100 (incl. play)"),
]


def loc_table(rows, foot) -> str:
    body = "".join(
        f"<tr><td>{escape(p)}</td><td class='mono small'>{escape(r)}</td><td class='num nowrap'>{escape(n)}</td></tr>"
        for p, r, n in rows)
    return ("<div class='table-wrap'><table class='t loc'><thead><tr><th>Piece</th><th>Reused as-is</th>"
            f"<th class='num'>New lines</th></tr></thead><tbody>{body}</tbody>"
            f"<tfoot>{foot}</tfoot></table></div>")


LEDGER = [
    ("Move a box", "XYDrag via onNodesChange position changes; dragHandle selector (reactFlowHost.tsx:423-439)",
     "None in DomCanvas, on purpose. Story benches hand-roll it with useDragIntent (MagnetProposals.stories.tsx:279-289)",
     "1-click cold drag with no prior select (vault :2601); header-only grab"),
    ("Drag an unselected box", "getDragItems: node.selected || node.id === nodeId (@xyflow/system :2053)",
     "dragIntent.ts decides press → drag by distance", "“sense the click and drag motion” (:2601)"),
    ("Drag threshold", "nodeDragThreshold={4} (reactFlowHost.tsx:734)", "thresholdFor (dragIntent.ts:53)",
     "a rail claims its press before the canvas does (INNER_CLAIM_PX)"),
    ("No text selection mid-drag", ".react-flow__node { user-select: none } (style.css:215-219)",
     "added by hand: userSelect: none (MagnetProposals.stories.tsx:284-289)", "—"),
    ("Inner surfaces keep their pointer", "noDragClassName = \"nodrag\" (grabChain.ts:28-39)",
     "nothing to fight: no canvas gesture", "caret, rails and chevrons still work"),
    ("Resize", "NodeResizer (reactFlowHost.tsx:367-391)", "none", "written back once, at rest (onResizeEnd)"),
    ("Pan · zoom", "XYPanZoom on d3-zoom + Controls", "none, on purpose (domCanvas.tsx:5-15)", "—"),
    ("Raise on select", "elevateNodesOnSelect", "none: paint order is DOM order", "the kit never z-indexes a node root (CLAUDE.md)"),
    ("Select · marquee", "selectionOnDrag · SelectionMode · useOnSelectionChange",
     "click-select by event delegation in one story (BatchWiring.stories.tsx:307-350)", "the Inspector opens on click (studio)"),
    ("Snap", "snapToGrid · snapGrid", "none", "—"),
    ("Draw or re-aim a cable", "XYHandle · reconnectEdge (switched off: nodesConnectable={false}, :738)",
     "the wall-crossing bench draws one (RegionWallCrossing.stories.tsx:366-402, branch)", "the port-side affordances are ours (ARCHITECTURE.md:240-244)"),
    ("Drag cable corners", "— nothing (0 exports; you’d build it on EdgeLabelRenderer / ViewportPortal)",
     "none for elbows; TraceEditor does straight cables (traceEditor.tsx:229-242)", "pins travel with the box (elbowPins.ts header)"),
    ("Route around regions", "— stock getSmoothStepPath, no obstacles (reactFlowHost.tsx:481-500)",
     "WireLayer + the elbow router (keep-outs, through)", "“never straight arrows”; bypass regions"),
]


def ledger_table() -> str:
    body = "".join(
        f"<tr><td><strong>{escape(c)}</strong></td><td class='small'>{escape(rf)}</td><td class='small'>{escape(dom)}</td><td class='small'>{escape(keep)}</td></tr>"
        for c, rf, dom, keep in LEDGER)
    return ("<div class='table-wrap'><table class='t ledger'><thead><tr><th>Capability</th>"
            "<th>React Flow, by its exact name</th><th>Vanilla DOM in this repo today</th><th>Must survive</th></tr></thead>"
            f"<tbody>{body}</tbody></table></div>")


QUOTES = [
    ("Projects/bbox-ui/PROJECT - Black Box UI.md:1960",
     "Perhaps mabye we don't have node resizeing, node repositioning, etc inside our raw dom canvas? as that is stuff that reactflow, etc can do super easily? ability to draw arrows though could be helpful.... Ok so there is some type of seam there..."),
    ("PROJECT - Black Box UI.md:2082",
     "within storybook, use DOM Canvas for as much as possible until, it starts needing to be a viewport, etc then switch to reactflow"),
    ("Sources/Chats/Claude Code/2026-09-19 — ef974670 (CHAT).md:430",
     "Yes just lkike bbox ui we want to be host indepdent... so we should use plan DOM canvas. and then in storybook we can show stories that integrate it with reactflow when we want to be able to zoom around etc... exact same structure as bbox ui"),
    ("PROJECT - Black Box UI.md:2612",
     "use a host reactflow/tldraw that syas like here is the expected interaction, and then I can basically like click it and move it my self to test."),
    ("PROJECT - Black Box UI.md:1958",
     "Are we going to make our own hitbox interactions etc in pure DOM? I guess so.. I think you need to code that logic anyways... certaintly for example like the dnd-kit stuff we are porting over right."),
    ("PROJECT - Black Box UI.md:2042",
     "if its not tagged then I just assume its just like plain DOM basically... a adhoc hand roller thing, which hoesntly is fine for most of it right!"),
    ("Daily Note - Sep 22 2026.md:50-56",
     "Add resized as well so we can test that out as well… Ok I can do those in react flow… […] Keep it like fixed UI agreed…"),
    ("Daily Note - Sep 22 2026.md:90",
     "Ok One issue is I have been getting way to stuck on the interactions.. lets even just assume its static UI for now... and just get concerete with what it lokos like."),
]


def quotes_html() -> str:
    return "".join(
        f"<blockquote class='q'><p>{escape(text)}</p><cite class='mono'>{escape(src)}</cite></blockquote>"
        for src, text in QUOTES)


CSS = """
:root{
  --bg:#f9f9f7;--surface:#fcfcfb;--ink:#0b0b0b;--ink-2:#52514e;--muted:#6f6d68;--line:#e1e0d9;--line-strong:#c3c2b7;
  --dom:#2a78d6;--rf:#eb6834;--violet:#4a3aa7;--violet-wash:rgba(74,58,167,.08);
  --stock-fill:rgba(11,11,11,.06);--kit-fill:rgba(42,120,214,.06);--kit-line:rgba(42,120,214,.35);
  --rec:rgba(42,120,214,.07);--code-bg:rgba(11,11,11,.05);--good:#006300;
  color-scheme:light;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#0d0d0d;--surface:#1a1a19;--ink:#ffffff;--ink-2:#c3c2b7;--muted:#9b998f;--line:#2c2c2a;--line-strong:#46463f;
    --dom:#3987e5;--rf:#d95926;--violet:#9085e9;--violet-wash:rgba(144,133,233,.12);
    --stock-fill:rgba(255,255,255,.08);--kit-fill:rgba(57,135,229,.10);--kit-line:rgba(57,135,229,.45);
    --rec:rgba(57,135,229,.12);--code-bg:rgba(255,255,255,.07);--good:#0ca30c;
    color-scheme:dark;
  }
}
:root[data-theme="dark"]{
  --bg:#0d0d0d;--surface:#1a1a19;--ink:#ffffff;--ink-2:#c3c2b7;--muted:#9b998f;--line:#2c2c2a;--line-strong:#46463f;
  --dom:#3987e5;--rf:#d95926;--violet:#9085e9;--violet-wash:rgba(144,133,233,.12);
  --stock-fill:rgba(255,255,255,.08);--kit-fill:rgba(57,135,229,.10);--kit-line:rgba(57,135,229,.45);
  --rec:rgba(57,135,229,.12);--code-bg:rgba(255,255,255,.07);--good:#0ca30c;
  color-scheme:dark;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1040px;margin:0 auto;padding:28px 16px 64px}
.kicker{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0 0 6px}
h1{font-size:30px;line-height:1.15;margin:0 0 8px;letter-spacing:-.01em}
h2{font-size:20px;margin:40px 0 10px;letter-spacing:-.005em}
h3{font-size:15px;margin:22px 0 8px}
p{margin:0 0 10px}
.lede{color:var(--ink-2);max-width:820px}
code,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.86em}
code{background:var(--code-bg);padding:1px 5px;border-radius:4px;overflow-wrap:anywhere}
.answer{background:var(--surface);border:1px solid var(--line);border-left:4px solid var(--dom);border-radius:10px;padding:20px 22px;margin:22px 0 14px}
.answer h2{margin:0 0 12px;font-size:21px}
.answer ul{margin:0;padding-left:20px}
.answer li{margin:0 0 9px}
.tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0 6px}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.tile .v{font-size:28px;font-weight:650;letter-spacing:-.01em;line-height:1.1}
.tile .l{font-size:13px;color:var(--ink-2);margin-top:4px}
@media (max-width:760px){.tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}
ol.assume{padding-left:22px}
ol.assume li{margin:0 0 10px}
.table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--line);border-radius:10px;background:var(--surface);margin:10px 0 6px}
table.t{border-collapse:collapse;width:100%;font-size:14px}
.t th,.t td{padding:9px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
.t thead th{font-size:12px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.04em;background:var(--surface);position:sticky;top:0}
.t tbody tr:last-child td{border-bottom:none}
.t tfoot td{border-top:1px solid var(--line-strong);border-bottom:none;font-weight:600}
.t tfoot td.def{font-weight:400}
.ledger td:first-child{min-width:150px}
.num{text-align:right!important;font-variant-numeric:tabular-nums}
.nowrap{white-space:nowrap}
.small{font-size:13px}
.t td.mono{white-space:nowrap}
.loc td.mono{white-space:normal;color:var(--ink-2)}
.w{display:block;font-weight:400;color:var(--muted);text-transform:none;letter-spacing:0}
.scores td.sc{font-weight:600}
.sc1,.sc2{color:var(--muted)}
.scores tr.rec td{background:var(--rec)}
.opt{font-weight:700;font-size:15px}
.optname{min-width:280px}
.why{font-size:13px;color:var(--ink-2);margin-top:3px}
.badge{display:inline-block;margin-left:8px;font-size:11px;font-weight:600;padding:1px 8px;border-radius:999px;border:1px solid var(--dom);color:var(--ink);vertical-align:1px}
.tot{font-weight:700;min-width:120px}
.totbar{display:inline-block;width:70px;height:8px;border-radius:4px;background:var(--line);margin-right:8px;vertical-align:1px;overflow:hidden}
.totbar span{display:block;height:100%;background:var(--ink-2);border-radius:0 4px 4px 0}
.rec .totbar span{background:var(--dom)}
figure{margin:14px 0 8px}
.fig-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:8px}
svg.diagram,svg.chart{display:block;width:100%;height:auto;min-width:760px}
figcaption{font-size:13px;color:var(--ink-2);margin-top:8px;max-width:900px}
/* diagram */
.kit-band{fill:var(--kit-fill);stroke:var(--kit-line);stroke-width:1}
.d-h{font-size:12.5px;font-weight:700;letter-spacing:.05em;fill:var(--ink)}
.d-sub{font-size:12px;fill:var(--ink-2)}
.d-note{font-size:12px;fill:var(--ink-2)}
.chip{stroke-width:1}
.chip-kit{fill:var(--surface);stroke:var(--kit-line)}
.chip-bench{fill:var(--surface);stroke:var(--line-strong);stroke-dasharray:4 3}
.chip-gap{fill:var(--violet-wash);stroke:var(--violet);stroke-dasharray:5 3}
.chip-t{font-size:12.5px;fill:var(--ink)}
.conn{stroke:var(--line-strong);stroke-width:1.5}
.conn-head{fill:var(--line-strong)}
.head{fill:var(--surface);stroke:var(--line-strong)}
.head-t{font-size:14px;font-weight:700;fill:var(--ink)}
.head-s{font-size:12px;fill:var(--ink-2)}
.row-t{font-size:13px;fill:var(--ink)}
.cell{stroke-width:1}
.cell-stock{fill:var(--stock-fill);stroke:var(--line-strong)}
.cell-none{fill:none;stroke:var(--line-strong);stroke-dasharray:4 3}
.cell-gap{fill:var(--violet-wash);stroke:var(--violet);stroke-dasharray:5 3}
.cell-t{font-size:12.5px;fill:var(--ink)}
.cell-t-none{fill:var(--muted)}
/* chart */
.grid{stroke:var(--line);stroke-width:1}
.grid.base{stroke:var(--line-strong)}
.tick{font-size:12px;fill:var(--muted);font-variant-numeric:tabular-nums}
.c-label{font-size:13px;fill:var(--ink)}
.c-val{font-size:12px;fill:var(--ink-2);font-variant-numeric:tabular-nums}
.c-legend{font-size:13px;fill:var(--ink)}
.c-muted{font-size:12px;fill:var(--muted)}
.c-total{font-size:13px;font-weight:600;fill:var(--ink)}
.bar-dom{fill:var(--dom)}
.bar-rf{fill:var(--rf)}
.faded{opacity:.32}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .faded{opacity:.5}}
:root[data-theme="dark"] .faded{opacity:.5}
.sw-dom{fill:var(--dom)}
.sw-rf{fill:var(--rf)}
.dot-dom{fill:var(--dom);stroke:var(--surface);stroke-width:2}
.dot-rf{fill:var(--rf);stroke:var(--surface);stroke-width:2}
/* quotes */
.quotes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
@media (max-width:760px){.quotes{grid-template-columns:1fr}}
blockquote.q{margin:0;background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--line-strong);border-radius:8px;padding:12px 14px}
blockquote.q p{margin:0 0 6px;font-size:14px}
blockquote.q cite{font-style:normal;color:var(--muted);font-size:12px;overflow-wrap:anywhere}
.callout{background:var(--surface);border:1px solid var(--line);border-left:4px solid var(--violet);border-radius:10px;padding:14px 18px;margin:12px 0}
.callout ul{margin:6px 0 0;padding-left:20px}
.cols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
@media (max-width:860px){.cols{grid-template-columns:1fr}}
.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.card h3{margin:0 0 8px}
.card ul{margin:0;padding-left:18px}
.card li{margin:0 0 6px;font-size:14px}
.surface li{margin-bottom:8px}
.def{font-size:13px;color:var(--ink-2)}
footer{margin-top:40px;font-size:12px;color:var(--muted)}
"""


def build() -> str:
    b_foot = ("<tr><td>Product code</td><td></td><td class='num'>~190–275</td></tr>"
              "<tr><td>Tests (drivers already exist: hosts/hostGestures.ts:37-88)</td><td></td><td class='num'>120–160</td></tr>"
              "<tr><td>All-in</td><td></td><td class='num'>~310–435</td></tr>")
    a_foot = ("<tr><td>All-in, one lane</td><td></td><td class='num'>~260–390</td></tr>"
              "<tr><td class='def' colspan='3'>Deferred, not in this lane: Option 2’s wall-port slide as part of the region component (kit, works in every host), 80–120, mostly moved from the branch · "
              "elbow corners as a TraceEditor elbow mode (kit, works in every host thanks to getScreenCTM), 120–165.</td></tr>")

    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DOM Canvas vs React Flow</title>
<style>{CSS}</style>
</head>
<body>
<main>
<p class="kicker">bbox-ui · decision · Tue 22 Sep 2026 · read-only research</p>
<h1>DOM Canvas vs React Flow</h1>
<p class="lede">Your note “Dom canvas where you can drag things around?” (Daily Note, Sep 22, :121-150) asks how much code a barebones draggable DOM canvas would take, or whether to lean on React Flow. The answer comes first, then the reasoning and the numbers. Everything was checked against branch <code>claude/system-sketch-ui-feedback-14bfc3</code> at <code>51a81e1</code>. Nothing in the repo was changed.</p>

<section class="answer" aria-labelledby="ans">
<h2 id="ans">Keep your “best of both worlds.” Don’t build a draggable DOM canvas.</h2>
<ul>
<li><strong>The DOM Canvas stays static.</strong> It’s the control, and it’s the plain-DOM baseline you said is its whole point: “you really understand exactly what is reactflow giving.” Anything that moves across the canvas goes in a React Flow twin, as you proposed.</li>
<li><strong>Correction 1: the React Flow twin isn’t free yet.</strong> The React Flow host draws its own stock cables: <code>getSmoothStepPath</code>, with no keep-outs (<code>reactFlowHost.tsx:481-500</code>). So a React Flow copy of the wall crossing would route its cables differently and would show no wall rings. Fix that one seam first. It costs about 100–160 lines, once, and all 16 React Flow story files then get the kit’s own cables.</li>
<li><strong>Correction 2: React Flow doesn’t give you cable-corner dragging at all.</strong> <code>@xyflow/react</code> 12.11.6 exports nothing for it (0 hits). Corner dragging is a kit job. <code>TraceEditor</code> already does it for straight cables, and bbox studio already does it for elbows with stock tldraw handles (P-028). So it’s not a reason to pick either canvas.</li>
<li><strong>Next step, one lane of about 260–390 lines including tests:</strong> cable parity in the React Flow host, then <em>Control Flow/Wall Crossing › Option 1 · Mirror (ReactFlow ⇄ DOM Canvas)</em>. Drag a box in React Flow, and the ring re-seats in both panes.</li>
<li><strong>If you say nothing:</strong> that lane runs next, and <code>DomCanvas</code> stays exactly as it is.</li>
</ul>
</section>
<div class="tiles">
<div class="tile"><div class="v">40–60</div><div class="l">new lines to move boxes on a DOM canvas. The drag machinery already exists, so step one is cheap.</div></div>
<div class="tile"><div class="v">~190–275</div><div class="l">new lines for the whole barebones canvas you described, plus 120–160 test lines</div></div>
<div class="tile"><div class="v">~1,500</div><div class="l">bundled lines React Flow already ships for drag, resize, pan/zoom and connect. That’s the slope you’d climb.</div></div>
<div class="tile"><div class="v">0</div><div class="l">React Flow exports for dragging cable corners</div></div>
</div>

<h2>What the question assumes</h2>
<p>Four assumptions in the note, checked against the code.</p>
<ol class="assume">
<li><strong>“A barebones DOM canvas turns into React Flow.”</strong> The first step doesn’t. With no zoom, moving a box is just <code>position += delta</code>. The pure press/drag reducer (<code>scene/interactions/dragIntent.ts</code>), its React binding (<code>hosts/useDragIntent.ts</code>) and member drag (<code>hosts/memberDrag.ts</code>) already exist. The Magnet bench moves a node with about 15 lines of wiring (<code>MagnetProposals.stories.tsx:279-289</code>). The steps after it are what turn it into React Flow: raise on top, resize (you asked for it in the same note, :50), selection, snapping. React Flow already ships all of those.</li>
<li><strong>“React Flow would animate the whole wall crossing.”</strong> It moves the boxes. It doesn’t move the corners, and today it doesn’t draw the kit’s cables at all: it routes with stock smoothstep and no keep-outs, so its cables don’t match the DOM’s. The rings come from the kit’s painted route (<code>regionViews.layout.ts</code> <code>wallCrossings</code> over <code>WireLayer.onWireGeometry</code>), and no host forwards that route yet. Only the story benches do, which is why the lane below adds one crossing glue for both hosts.</li>
<li><strong>“A DOM canvas is the place to test hit-testing.”</strong> This week’s hit-testing bugs were all seam bugs between the kit and a real engine:
<ul>
<li>React Flow’s drag handle caught a member’s header and dragged the parent (<code>reactFlowHost.tsx:135-162</code>).</li>
<li>A tldraw arm chevron dragged the whole region (Sep 21 note :1210).</li>
<li>An expanded block could only be selected by its edge, because tldraw hit-tests geometry, not DOM (<code>apps/systemsketch/src/blockHitTest.smoke.test.tsx:1-17</code>).</li>
</ul>
A hand-rolled canvas has none of those seams. The kit-side hit-testing (member surface vs chevron, rail vs header, hover) already runs in the static DOM Canvas.</li>
<li><strong>“The wall crossing needs a gesture canvas.”</strong> By the repo’s own two tests (<code>ARCHITECTURE.md:228-238</code>), three of the four things you want to drag belong to the kit, not a host: members, the wall-port slide, and cable corners. Only “move the boxes” belongs to the host. On “Use dnd kit? Idk” (:44), the repo already decided: dnd-kit for ordering, pointer capture for free placement (<code>memberDrag.ts:22-28</code>).</li>
</ol>

<h2>Who owns which gesture</h2>
<figure>
<div class="fig-scroll">
{host_roles_svg()}
</div>
<figcaption>Everything in the top band is kit code, so it works the same in every host, including the static DOM Canvas. Only the rows below span the canvas, and React Flow and tldraw ship almost all of them stock. The one gap nobody ships stock (except tldraw’s handles in the studio) is elbow cable corners. That’s why it goes in the kit, once, not in a canvas.</figcaption>
</figure>

<h2>What good looks like here — criteria, weighted for where you are now</h2>
{criteria_table()}

<h2>Options, scored</h2>
<p class="def">1 = poor, 5 = strong. Total = Σ(score × weight) ÷ 5, out of 100. C1 static focus · C2 carries over to the product · C3 shows what React Flow gives · C4 lines + slope · C5 off-the-shelf · C6 architecture · C7 one obvious answer.</p>
{options_table()}

<h2>How much code — the honest estimate</h2>
<p>Estimates are ±50%, product code only unless marked. Each one is anchored on real code in the repo; “reused” means it already exists and would be imported unchanged.</p>
<h3>The barebones DOM canvas you described (option B)</h3>
{loc_table(LOC_B, b_foot)}
<h3>The recommended next step (option A+)</h3>
{loc_table(LOC_A, a_foot)}

<figure>
<div class="fig-scroll">
{lines_chart_svg()}
</div>
<figcaption>For moving boxes alone, the DOM canvas is cheaper (40–60 lines against a one-time 100–160 for React Flow parity). But the React Flow column is paid once and then stays flat, while the DOM column keeps growing with each capability you add. For calibration, React Flow’s own versions of those capabilities in <code>@xyflow/system</code> 0.0.82: node drag <code>:2050-2366</code> ≈ 317 lines, connect/re-aim <code>:2367-2667</code> ≈ 301, pan/zoom <code>:2742-3170</code> ≈ 429, <code>XYResizer</code> <code>:3171-3617</code> ≈ 447. That’s about 1,500, before <code>@xyflow/react</code>’s 5,179 lines of React glue.</figcaption>
</figure>

<h2>The ledger: what React Flow gives vs what vanilla DOM needs</h2>
<p>This is the “understand exactly what React Flow is giving” question as a table. The mirror story is the same thing, felt. Two rows show React Flow giving <em>nothing</em>, corners and routing, and both are kit work.</p>
{ledger_table()}

<h2>What you already decided</h2>
<p>Five times since Sep 17 you put canvas-spanning drag (repositioning, resize, zoom) on React Flow and kept the DOM Canvas plain. Twice you also said hand-rolled DOM is fine for the smaller, bounded interactions (:1958, :2042), and that’s exactly the kit/host split. The Sep 22 note re-opens the question and then lands in the same place, so this report agrees with you rather than inventing a disagreement.</p>
<div class="quotes">{quotes_html()}</div>

<h2>Found in passing — handle before the next wall-crossing merge</h2>
<div class="callout">
<strong>Two lanes built the Option 1 ring independently, and they now collide.</strong>
<ul>
<li><strong>Trunk</strong> (the region-views merge, <code>51a81e1</code>, a few minutes ago): <code>components/regionViews.layout.ts</code> <code>wallCrossings</code>, the <code>region.tsx</code> crossing markers, and <code>WireLayer.onWireGeometry</code>, which only reports when a route actually moved.</li>
<li><strong>Branch</strong> <code>claude/region-wall-intersection-1bd334</code> (<code>52a1b92</code>, unmerged, the Option 2 bench in your screenshot): its own <code>scene/wallPort.ts</code> <code>wallCrossings</code>, <code>WallMark</code>, and its own <code>onWireGeometry</code>, which reports on every re-route.</li>
<li><strong>Checked with a read-only <code>git merge-tree</code> dry run:</strong> merging the branch into the trunk gives a <strong>CONFLICT in <code>apps/storybook-basics/src/components/wireLayer.tsx</code></strong>.</li>
<li><strong>Fix:</strong> rebase the Option 2 bench onto the trunk’s <code>wallCrossings</code> and <code>onWireGeometry</code>, and keep only what’s Option 2’s own (<code>splitEdgeAtWalls</code>, <code>slideWallPort</code>, <code>wallSlideRange</code>). The mirror lane depends only on the trunk, so it isn’t blocked by any of this.</li>
</ul>
</div>

<h2>What would change my mind · not verified · decision record</h2>
<div class="cols">
<div class="card"><h3>What would change my mind</h3><ul>
<li>If parity turns out to need more than ~200 lines, or makes React Flow stories flaky (the host already fights one measured race, <code>reactFlowHost.tsx:623-646</code>), I’d switch to <strong>F</strong>: box drag in the bench, 40–60 lines.</li>
<li>If you want boxes draggable in <em>most</em> DOM stories during the static phase, so dragging becomes part of looking and not of testing, I’d switch to <strong>B</strong>, as an opt-in gesture layer <em>around</em> <code>DomCanvas</code> (event delegation, the way <code>BatchWiring.stories.tsx:29-36</code> already does it), plus a decision record.</li>
<li>If a real shipping host turns out to be plain DOM (an Obsidian view, the /create page), B’s code would ship, and C2 flips.</li>
</ul></div>
<div class="card"><h3>Not verified</h3><ul>
<li>The line counts are estimates, anchored on analogous code but not built.</li>
<li>React Flow’s web docs weren’t checked. I only confirmed the installed 12.11.6 exports nothing for editable edges.</li>
<li>Nothing was run in Storybook. This was read-only; the only thing executed was a <code>git merge-tree</code> dry run.</li>
</ul></div>
<div class="card"><h3>Decision record — a flag, not written</h3><ul>
<li>This fork has come up twice in two days (Sep 21 :1198-1216, Sep 22 :121-150).</li>
<li>Right now it lives only in header comments (<code>domCanvas.tsx:5-15</code>, <code>SceneHosts.stories.tsx:17-20</code>), <code>ARCHITECTURE.md</code> and the vault. That’s exactly the bar in <code>docs/peps/README.md</code>.</li>
<li>When the parity lane merges: write <code>docs/peps/0005-dom-canvas-stays-static.md</code> and link it from a WHY at <code>domCanvas.tsx:5</code>.</li>
</ul></div>
</div>

<h2>Decision surface</h2>
<div class="cols surface">
<div class="card"><h3>Done &amp; proved</h3><ul>
<li>Research only. Claims cite file:line in the repo, the installed <code>@xyflow</code> bundles, and the vault.</li>
<li>The merge conflict was checked with a <code>git merge-tree</code> dry run, React Flow’s exports with a grep of the installed bundle, and React Flow’s size with line ranges in that bundle.</li>
</ul></div>
<div class="card"><h3>Needs you — with the default if you’re silent</h3><ul>
<li><strong>Confirm A+.</strong> Default: yes. The parity + mirror lane runs next, and DomCanvas stays static.</li>
<li><strong>Where cable-corner drag lives when you want it in Storybook.</strong> Default: an elbow mode in the kit’s <code>TraceEditor</code>, deferred until the static phase ends.</li>
<li><strong>Which <code>wallCrossings</code> wins.</strong> Default: the trunk’s (<code>regionViews.layout.ts</code>), and the Option 2 branch rebases onto it.</li>
</ul></div>
<div class="card"><h3>Deliberately not done</h3><ul>
<li>No code, no branch touched, no lane dispatched. This was read-only by brief.</li>
<li>No decision record yet. The repo’s bar says to write it at merge, not before.</li>
<li>Didn’t touch the wall-crossing branch, because it’s another lane’s write set.</li>
</ul></div>
</div>

<footer>Built by <code>scratchpad/dom-canvas/build_report.py</code>. Palette checked with the dataviz validator: blue/orange pass every check in light and dark. Sources: bbox-ui <code>51a81e1</code> · <code>@xyflow/react</code> 12.11.6 · <code>@xyflow/system</code> 0.0.82 · vault <code>Projects/bbox-ui/PROJECT - Black Box UI.md</code>, Daily Notes Sep 21–22, chat 2026-09-19 ef974670.</footer>
</main>
</body>
</html>
"""
    return html


if __name__ == "__main__":
    OUT.write_text(build(), encoding="utf-8")
    print(OUT, OUT.stat().st_size, "bytes")
