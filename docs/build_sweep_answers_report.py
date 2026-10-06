#!/usr/bin/env python3
"""
Answers to Zach's questions on the prior-art sweep (2026-09-18).

He marked up the sweep report and asked six things. One of them — "for elkjs,
are we not using that library already???" — is a correction, and he is right;
that goes first because a wrong claim outranks a new answer.

Each answer is drawn rather than argued, and the page carries the same in-report
feedback strip the reports now ship with, so the next round needs no bookkeeping
either.

    python3 docs/build_sweep_answers_report.py
"""
from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import idea_diagrams as D          # noqa: E402
import report_feedback as FB       # noqa: E402

OUT = pathlib.Path("/home/bam/bbox-ui/reports/sweep-answers-2026-09-18.html")

# ---------------------------------------------------------------------------
# V1 — the elkjs correction. What is actually adopted, and for which job.
# ---------------------------------------------------------------------------
def v_elk_correction(w=980, h=214) -> str:
    s = D.txt(0, 12, "TWO DIFFERENT JOBS — THE REPORT TREATED THEM AS ONE", D.ORANGE, 10, weight="700")

    s += D.box(14, 26, 466, 158, D.PANEL, D.GREEN, rx=10)
    s += D.txt(30, 46, "NODE PLACEMENT — where do the boxes go", D.GREEN, 10, weight="700")
    s += D.txt(30, 64, "elkjs 0.12.0 — a real dependency, shipping today", D.FG, 10.5, mono=True)
    for i, line in enumerate([
        "systemsketch/package.json:228",
        "src/blocks/layout/organizeGraph.ts  — lazy-loaded",
        "'elk.algorithm': 'layered'",
        "'elk.portConstraints': 'FIXED_ORDER'   ← already!",
    ]):
        s += D.txt(30, 86 + i * 17, line, D.ORANGE if "FIXED_ORDER" in line else D.DIM2, 9.5, mono=True)
    s += D.txt(30, 172, "one-shot “organize” command · only positions come back", D.DIM, 9, mono=True)

    s += D.box(500, 26, 466, 158, D.PANEL, D.LINE2, rx=10)
    s += D.txt(516, 46, "WIRE ROUTING — how do the cables get there", D.DIM2, 10, weight="700")
    s += D.txt(516, 64, "ours, ~16,000 lines — and the verdict still stands", D.FG, 10.5, mono=True)
    for i, line in enumerate([
        "elbow/* · nudge.ts · trace.tidy.ts · binaryHeap.ts",
        "libavoid LGPL — deliberately never read",
        "…but its capability HAS been rebuilt clean-room:",
        "constraint-DAG nudging · pinned routes · trunk fan-out",
    ]):
        s += D.txt(516, 86 + i * 17, line, D.GREEN if "clean-room" in line or "trunk" in line else D.DIM2,
                   9.5, mono=True)
    s += D.txt(516, 172, "ELK is cited here as convergent prior art, not imported", D.DIM, 9, mono=True)

    s += D.txt(0, 204, "The report's “elkjs is copy-paste hostile, keep ours” was true of the RIGHT-hand column "
               "and silent about the left. That reads as “we don't use ELK”, and we do.", D.FG, 10)
    return D.svg(w, h, s, "elkjs is already adopted for node placement")


# ---------------------------------------------------------------------------
# V2 — Houdini's drift vocabulary
# ---------------------------------------------------------------------------
def v_houdini_drift(w=980, h=232) -> str:
    s = D.txt(0, 12, "WHAT “NAMES ITS DRIFT” MEANT IN THAT COLUMN", D.ORANGE, 10, weight="700")
    s += D.txt(0, 30, "Every tool lets a shared definition and one of its instances disagree. Houdini is the only one "
               "that gives the disagreement a NAME and a verb to end it.", D.DIM, 10)

    # the definition
    s += D.box(14, 50, 200, 86, D.PANEL, D.ORANGE, rx=9)
    s += D.txt(28, 72, "the HDA", D.FG, 11, weight="600")
    s += D.txt(28, 90, "asset definition", D.DIM, 9, mono=True)
    s += D.txt(28, 108, "on disk, shared", D.DIM, 9, mono=True)
    s += D.txt(28, 126, "by every instance", D.DIM, 9, mono=True)

    states = [
        ("LOCKED", D.GREEN, ["matches the definition", "exactly, bit for bit", "— the normal state"]),
        ("UNLOCKED", D.YELLOW, ["you edited inside this", "instance. Houdini SAYS SO", "in the node's own UI"]),
        ("MATCH CURRENT", D.ORANGE, ["the verb that ends it:", "throw my edits away,", "re-sync to the definition"]),
    ]
    for i, (name, colour, lines) in enumerate(states):
        x = 262 + i * 240
        s += D.box(x, 50, 222, 118, D.PANEL, colour, rx=9)
        s += f'<rect x="{x}" y="50" width="222" height="24" rx="9" fill="{D.PANEL2}"/>'
        s += D.txt(x + 14, 67, name, colour, 10, weight="700", mono=True)
        for j, l in enumerate(lines):
            s += D.txt(x + 14, 94 + j * 17, l, D.DIM2, 9.5)
        if i < 2:
            s += (f'<path d="M{x + 226},109 H{x + 236}" stroke="{D.DIM}" stroke-width="1.2" '
                  f'marker-end="url(#a-{w}{h})"/>')
        s += f'<path d="M{x + 111},50 V36 H214" stroke="{colour}" stroke-width="1" stroke-dasharray="3 2" opacity=".5"/>'
    s += (f'<path d="M{262 + 480 + 111},168 C{262 + 480 + 111},196 160,196 114,142" fill="none" '
          f'stroke="{D.ORANGE}" stroke-width="1.4" stroke-dasharray="4 3" marker-end="url(#ao-{w}{h})"/>')
    s += D.txt(430, 204, "“Match Current Definition” — the repair verb", D.ORANGE, 9.5, mono=True, weight="700")

    s += D.txt(0, 226, "The point is not that Houdini prevents drift. It is that drift is a STATE the file records, "
               "visible on the node, with one named command to resolve it.", D.FG, 10)
    return D.svg(w, h, s, "Houdini's locked / unlocked / Match Current Definition")


# ---------------------------------------------------------------------------
# V3 — Fork 1, re-explained
# ---------------------------------------------------------------------------
def v_fork1(w=980, h=250) -> str:
    s = D.txt(0, 12, "THE QUESTION IS ONLY: WHERE DOES THE PORT LIST COME FROM?", D.ORANGE, 10, weight="700")
    s += D.txt(0, 30, "You select three blocks and fold them into one. The new box needs ports. Two ways to decide "
               "which ports, and they age very differently.", D.DIM, 10)

    # A — from the selection boundary
    s += D.box(14, 48, 466, 150, D.PANEL, D.LINE2, rx=10)
    s += D.txt(30, 68, "A · DERIVE FROM WHAT THE SELECTION CUT", D.DIM2, 10, weight="700")
    s += f'<rect x="34" y="80" width="150" height="80" rx="7" fill="none" stroke="{D.ORANGE}" stroke-dasharray="4 3"/>'
    for i in range(2):
        s += D.box(46, 92 + i * 34, 126, 24, D.PANEL2, D.LINE, rx=5)
    s += D.txt(109, 108, "camera", D.DIM2, 9, anchor="middle")
    s += D.txt(109, 142, "detect", D.DIM2, 9, anchor="middle")
    for i, y in enumerate([104, 138]):
        s += f'<path d="M34,{y} H16" stroke="{D.BLUE}" stroke-width="1.4"/>'
    s += f'<path d="M184,120 H202" stroke="{D.GREEN}" stroke-width="1.4"/>'
    s += D.txt(214, 96, "3 wires cross the marquee", D.DIM, 9, mono=True)
    s += D.txt(214, 112, "→ the box gets 3 ports", D.DIM, 9, mono=True)
    s += D.txt(214, 140, "drag the marquee 10px", D.RED, 9, mono=True)
    s += D.txt(214, 156, "and it is a different", D.RED, 9, mono=True)
    s += D.txt(214, 172, "interface", D.RED, 9, mono=True)
    s += D.txt(30, 190, "one gesture · nothing new to author · the contract is an accident of the drag",
               D.DIM, 9, mono=True)

    # B — from boundary nodes
    s += D.box(500, 48, 466, 150, D.PANEL, D.ORANGE, rx=10)
    s += D.txt(516, 68, "B · DERIVE FROM BOUNDARY NODES YOU PLACED", D.ORANGE, 10, weight="700")
    s += D.box(520, 80, 240, 82, D.PANEL2, D.LINE2, rx=7)
    s += D.box(530, 90, 60, 22, "#2a1d10", D.ORANGE, rx=5, dash="3 2")
    s += D.txt(560, 105, "in", D.ORANGE, 9, anchor="middle", weight="700")
    s += D.box(604, 90, 66, 22, D.PANEL, D.LINE, rx=5)
    s += D.txt(637, 105, "work", D.DIM2, 9, anchor="middle")
    s += D.box(684, 90, 64, 22, "#2a1d10", D.ORANGE, rx=5, dash="3 2")
    s += D.txt(716, 105, "out", D.ORANGE, 9, anchor="middle", weight="700")
    s += D.txt(530, 134, "the box's ports ARE these nodes", D.DIM2, 9, mono=True)
    s += D.txt(530, 150, "rename one → the port renames", D.GREEN, 9, mono=True)
    s += D.txt(776, 96, "survives re-selection", D.GREEN, 9, mono=True)
    s += D.txt(776, 112, "survives a moved block", D.GREEN, 9, mono=True)
    s += D.txt(776, 128, "reorderable, deletable", D.GREEN, 9, mono=True)
    s += D.txt(776, 144, "reviewable in a diff", D.GREEN, 9, mono=True)
    s += D.txt(516, 190, "one more object to author · but the contract is a thing, not a side effect",
               D.DIM, 9, mono=True)

    s += D.txt(0, 222, "Baklava does B and calls it derivation — GraphTemplate.inputs is literally "
               "“filter my nodes for GraphInputNode”. So B is not the opposite of deriving; it is deriving "
               "from something stable.", D.FG, 10)
    s += D.txt(0, 242, "A can be added on top later as a convenience that CREATES the B nodes. The reverse "
               "cannot. That is the whole fork.", D.ORANGE, 10, weight="600")
    return D.svg(w, h, s, "Fork 1 explained: derive from the marquee or from boundary nodes")


# ---------------------------------------------------------------------------
# V4 — the ELK ladder against bbox-ui's real vocabulary
# ---------------------------------------------------------------------------
def v_elk_ladder(w=980, h=250) -> str:
    rows = [
        ("FREE", "solver picks the wall AND the position", "— nothing", D.RED,
         "the only rung with no equivalent: a bbox-ui port always has a BlockSide"),
        ("FIXED_SIDE", "wall authored, order and spacing free", "— nothing", D.YELLOW,
         "items[] order is always meaningful here, so this rung cannot be expressed"),
        ("FIXED_ORDER", "wall + relative order authored", "mode:\"auto\" + SpacingScheme", D.GREEN,
         "this IS bbox-ui's default — and the string SystemSketch already sends ELK"),
        ("FIXED_RATIO", "wall + proportional position", "space-evenly / space-around", D.YELLOW,
         "close: the schemes are proportional, but not authored per port"),
        ("FIXED_POS", "wall + absolute position", "mode:\"custom\" + freeOffsets", D.GREEN,
         "exact match, different name"),
    ]
    s = D.txt(0, 12, "THE LADDER YOU ALREADY CLIMB TWO RUNGS OF", D.ORANGE, 10, weight="700")
    s += D.txt(14, 34, "ELK", D.DIM2, 9, weight="700")
    s += D.txt(150, 34, "what it means", D.DIM2, 9, weight="700")
    s += D.txt(420, 34, "bbox-ui today", D.DIM2, 9, weight="700")
    s += D.txt(640, 34, "verdict", D.DIM2, 9, weight="700")
    for i, (name, meaning, ours, colour, note) in enumerate(rows):
        y = 46 + i * 38
        s += f'<rect x="0" y="{y}" width="{w}" height="34" rx="6" fill="{D.PANEL if i % 2 == 0 else "none"}"/>'
        s += D.txt(14, y + 22, name, colour, 10, mono=True, weight="700")
        s += D.txt(150, y + 22, meaning, D.DIM2, 9.5)
        s += D.txt(420, y + 22, ours, D.FG if ours != "— nothing" else D.RED, 9.5, mono=True)
        s += D.txt(640, y + 22, note, D.DIM, 9)
    s += D.txt(0, 244, "So the answer is: the enums are not new capability — mode:\"auto\" IS FIXED_ORDER and "
               "mode:\"custom\" IS FIXED_POS. What ELK has is the three rungs BETWEEN and BELOW them, which are "
               "exactly the ones an auto-layout needs to negotiate with.", D.FG, 10)
    return D.svg(w, h, s, "ELK's port-constraint ladder against bbox-ui's own vocabulary")


# ---------------------------------------------------------------------------
# V5 — drilldown: ours vs diagram-js
# ---------------------------------------------------------------------------
def v_drilldown(w=980, h=230) -> str:
    s = D.txt(0, 12, "SAME FEATURE, TWO PLACES TO PUT THE STATE", D.ORANGE, 10, weight="700")

    s += D.box(14, 30, 466, 170, D.PANEL, D.GREEN, rx=10)
    s += D.txt(30, 50, "SYSTEMSKETCH — already shipped", D.GREEN, 10, weight="700")
    s += D.txt(30, 70, "behaviorTreeCommands.ts:200-228", D.DIM2, 9.5, mono=True)
    s += D.box(30, 82, 200, 54, D.PANEL2, D.LINE2, rx=7)
    s += D.txt(42, 100, "region shape", D.FG, 9.5, weight="600")
    s += D.txt(42, 116, "props.treeId", D.ORANGE, 9, mono=True)
    s += D.txt(42, 130, "props.treeStack[]", D.ORANGE, 9, mono=True)
    for i, l in enumerate([
        "the stack lives ON THE SHAPE",
        "→ saved in the document",
        "→ undoable (markHistoryStoppingPoint)",
        "→ the board never moves; one shape swaps",
    ]):
        s += D.txt(246, 100 + i * 16, l, D.GREEN if i else D.DIM2, 9, mono=True)
    s += D.txt(30, 158, "compactDepthBreadcrumbs in chrome/TitleBar.tsx draws the trail", D.DIM, 9, mono=True)
    s += D.txt(30, 180, "This is arguably the better half: diagram-js's plane state is runtime-only.",
               D.GREEN, 9.5)

    s += D.box(500, 30, 466, 170, D.PANEL, D.LINE2, rx=10)
    s += D.txt(516, 50, "DIAGRAM-JS — what it has that we do not", D.DIM2, 10, weight="700")
    s += D.txt(516, 70, "DrilldownCentering.js · ~60 lines · MIT", D.DIM2, 9.5, mono=True)
    s += D.box(516, 82, 200, 54, D.PANEL2, D.ORANGE, rx=7)
    s += D.txt(528, 100, "positionMap", D.ORANGE, 9.5, mono=True, weight="600")
    s += D.txt(528, 116, "root → {x, y, zoom}", D.DIM2, 9, mono=True)
    s += D.txt(528, 130, "saved on every exit", D.DIM2, 9, mono=True)
    for i, l in enumerate([
        "one camera REMEMBERED per level",
        "step out → exactly where you left",
        "not a recomputed fit-to-view",
        "orthogonal to where the stack lives",
    ]):
        s += D.txt(732, 100 + i * 16, l, D.ORANGE if i < 2 else D.DIM2, 9, mono=True)
    s += D.txt(516, 180, "The transferable piece is this and only this — not the plane swap.", D.ORANGE, 9.5)

    s += D.txt(0, 222, "Recommendation: keep treeStack-on-props. Borrow the positionMap the day drilling in "
               "starts moving the camera.", D.FG, 10)
    return D.svg(w, h, s, "SystemSketch's treeStack against diagram-js's DrilldownCentering")


# ---------------------------------------------------------------------------
CARDS = [
    dict(k="fix", tag="You were right — correction", title="elkjs: already a dependency, for a different job",
         svg=v_elk_correction(),
         body="""<b>The report was wrong as written, and you caught it.</b> It said &ldquo;<code>elkjs</code> is a
         GWT-compiled Java blob, dual-licensed EPL/GPL &mdash; copy-paste hostile&rdquo; and filed it under
         <i>keep ours</i>. But SystemSketch has shipped <code>elkjs</code> 0.12.0 since before that sweep ran
         (<code>package.json:228</code>), lazy-loaded in <code>src/blocks/layout/organizeGraph.ts</code> for the
         one-shot organize command &mdash; and it already passes <code>'elk.portConstraints': 'FIXED_ORDER'</code>,
         which is the very enum the report then recommended &ldquo;adopting the vocabulary of.&rdquo;
         <br><br>What is still true is the narrower claim I should have made: the nine candidates were weighed
         against the <i>wire-routing and port-layout</i> geometry, and for that job nothing was worth swapping in.
         ELK does <b>node placement</b> &mdash; where boxes go &mdash; which is the <code>dagre</code> row's
         &ldquo;different problem&rdquo;, and we solved it by adopting a library, exactly as we should have.
         <br><br>On <b>libavoid</b> you are also right that the picture has moved, in the other direction: the
         licence verdict stands (LGPL, still deliberately unread &mdash; <code>nudge.ts:46-52</code> says so
         explicitly), but SystemSketch has since rebuilt a great deal of libavoid-<i>class</i> capability
         clean-room &mdash; constraint-DAG nudging, pinned-route exclusion that mirrors <code>hasFixedRoute</code>,
         trunk fan-out. The report treated that as a gap. It is a strength.
         <br><br>Both rows in the sweep report are now corrected in place, with the correction visible rather
         than silently patched."""),

    dict(k="ans", tag="Your question", title="How does Houdini name its drift?",
         svg=v_houdini_drift(),
         body="""That column asked one thing: <i>when a shared definition and one instance disagree, does the tool
         have a word for it?</i> Almost nothing does. Houdini does, and it is three pieces:
         <br><br><b>1. A state on the instance.</b> An HDA instance is <b>locked</b> (identical to the definition)
         or <b>unlocked</b> (you edited inside this one). It is not inferred &mdash; it is stored, and the node
         shows it.
         <br><b>2. A verb that ends the disagreement.</b> <i>Match Current Definition</i> discards the instance's
         edits and re-syncs it. One named command, not a manual rebuild.
         <br><b>3. Edit-the-definition is a separate, visible act.</b> <i>Type Properties</i> opens a different
         surface; you can never reshape the shared interface by accident while poking at one instance.
         <br><br>The reason it is worth naming: every other surveyed tool either never drifts (Blender data-blocks,
         Nuke Gizmos, Max Abstractions) or drifts in silence. Houdini is the only one that lets it drift and
         <i>says so</i>. Your Drafts work is arguably the same instinct &mdash; see the next card."""),

    dict(k="ans", tag="Fork 1 — you asked me to explain it again", title="It is only: where does the port list come from?",
         svg=v_fork1(),
         body="""I wrote that fork badly. It is not a deep architectural choice &mdash; it is one question with a
         practical consequence. You fold three blocks into one box. The box needs ports. Where does that list come
         from?
         <br><br><b>Option A</b> is the obvious one: look at which wires the selection cut, and make one port per
         cut wire. One gesture, nothing to author. The cost is that the box's interface is a by-product of a
         marquee &mdash; re-select slightly differently and you get a different contract, with nothing to diff and
         nothing to rename.
         <br><br><b>Option B</b> is what most shipping tools do: put two ordinary little nodes <i>inside</i> the
         box &mdash; an <code>in</code> and an <code>out</code> &mdash; and the box's ports are simply those nodes.
         Rename one, the port renames. Reorder them, the ports reorder. Delete one, the port goes. The interface
         becomes an object you can select, review and version.
         <br><br>The thing that makes it a genuine fork rather than a preference: <b>A can be built on top of B
         later</b> &mdash; a &ldquo;fold this selection&rdquo; gesture that <i>creates</i> the boundary nodes for
         you &mdash; but B cannot be recovered from A, because A never made the ports into anything.
         <br><br>Given your note that this is the same switch as simple / port / expanded, B also fits better:
         <code>PortEdge</code>'s items are already a named, ordered, reorderable list. B makes a folded box's ports
         the same kind of list, rather than a second, derived one that has to be kept in sync."""),

    dict(k="ans", tag="Your question", title="How do ELK's enums relate to the vocabulary we already have?",
         svg=v_elk_ladder(),
         body="""Closer than I implied &mdash; you already implement the top two rungs under different names, and
         SystemSketch already sends ELK the middle one as a string.
         <br><br><code>mode: "auto"</code> + a <code>SpacingScheme</code> <i>is</i> <code>FIXED_ORDER</code>: the
         wall is authored (<code>BlockSide</code>), the order is authored (<code>items[]</code>), the spacing is
         computed. <code>mode: "custom"</code> + <code>freeOffsets</code> <i>is</i> <code>FIXED_POS</code>: every
         port's position is given.
         <br><br>So the value of the ELK names is not new behaviour. It is that
         <code>mode: "auto" | "custom"</code> is a two-value switch standing where the field uses a five-rung
         ladder, and the three rungs you cannot express are exactly the ones that matter the moment a layout engine
         is in the room: <code>FREE</code> (let the solver pick the wall), <code>FIXED_SIDE</code> (wall mine,
         order yours), <code>FIXED_RATIO</code> (proportional). Today <code>organizeGraph.ts</code> hard-codes
         <code>FIXED_ORDER</code> for every node because there is no way for a block to say anything else.
         <br><br>The cheap version is not a rewrite: keep the current props and add a single derived
         <code>portConstraint</code> getter that maps them onto the ELK rung. It makes the contract explicit, it is
         the string the ELK adapter already needs, and it costs one function."""),

    dict(k="ans", tag="Your question", title="What would the open port-layout registry actually look like?",
         svg=D.svg(980, 176, D.t_registry(980, 176, "portLayout",
                   ["distribute  — space-between / evenly / around",
                    "aligned  — start / end",
                    "custom  — freeOffsets"],
                   "+ registerPortLayout('ellipse', fn)   ← a consumer adds this, no fork",
                   "one signature, three built-ins, and a door"),
                   "An open port-layout registry"),
         body="""Concretely, three small changes to <code>portEdge.layout.ts</code>:
         <br><br><b>1. Name the signature.</b> Every layout is already the same shape &mdash; count and geometry in,
         positions out. Write it down: <code>type PortLayoutFn = (ports: PortEdgeItem[], rail: RailBox, args?:
         unknown) =&gt; number[]</code>.
         <br><b>2. Turn the union into a map.</b> <code>const portLayouts: Record&lt;string, PortLayoutFn&gt;</code>
         holding today's three, plus <code>registerPortLayout(name, fn)</code>. The existing
         <code>SpacingScheme</code> union stays as the built-in names, so nothing breaks.
         <br><b>3. Let the prop take a string.</b> <code>mode</code> becomes <code>string</code> resolved through
         the map rather than a closed union.
         <br><br>Why it matters more here than in a normal library, and why it reminded you of Obsidian: a consumer
         of bbox-ui <b>already owns the file</b>. Today, wanting a radial port arrangement means editing
         <code>portEdge.layout.ts</code> and inheriting a merge conflict on every update. With a registry it is a
         sibling file that calls <code>registerPortLayout</code> and never touches the copied source. The registry
         is what makes a copy-paste component stay upgradable.
         <br><br>X6 does exactly this with <code>Graph.registerPortLayout</code> and ships seven built-ins;
         <code>trace.routing.ts</code>'s four routings are the identical closed-union shape and would take the same
         treatment."""),

    dict(k="ans", tag="Your question", title="How does diagram-js's drilldown compare to the one we shipped?",
         svg=v_drilldown(),
         body="""You already have the feature; the comparison is about <i>where the state lives</i>, and on that
         you made the better call.
         <br><br><b>Yours</b> (<code>systemsketch/src/behaviorTree/behaviorTreeCommands.ts:200-228</code>): a
         <code>treeStack: string[]</code> on the region shape's own props. Step in pushes the current
         <code>treeId</code>; step out pops it; both run inside
         <code>editor.markHistoryStoppingPoint('step out of subtree')</code>. Because it is shape props, the
         position in the hierarchy is <b>saved in the document and undoable</b>, and the board itself never moves
         &mdash; one shape swaps its contents. <code>compactDepthBreadcrumbs</code> in
         <code>src/chrome/TitleBar.tsx</code> draws the trail.
         <br><br><b>diagram-js</b>: each level is a separate SVG layer and <code>canvas.setRootElement()</code>
         swaps which one is visible. That state is runtime-only &mdash; reload and it is gone. So on persistence
         and undo, yours wins outright.
         <br><br><b>The one piece worth taking</b> is <code>DrilldownCentering.js</code> &mdash; about 60 lines
         keeping a <code>Map</code> of root &rarr; <code>{x, y, zoom}</code>, saving the outgoing level's viewport
         and restoring the incoming one, so stepping back out returns you to exactly where you were rather than a
         recomputed fit. That is orthogonal to where the stack lives, and it only starts to matter the day drilling
         in pans or zooms the camera. Right now yours does not, which is why you have not missed it.
         <br><br>If any of it does get borrowed, the provenance note belongs next to
         <code>behaviorTreeCommands.ts</code>'s existing header, in the same form
         <code>docs/ALGORITHM-PROVENANCE.md</code> already uses."""),

    dict(k="agree", tag="Agreed — no action", title="Fork 2 is already your Drafts / link work",
         svg=D.svg(980, 120, D.t_states(980, 120,
                   [{"t": "linked", "on": True, "accent": D.GREEN},
                    {"t": "edited here", "accent": D.YELLOW},
                    {"t": "re-sync", "accent": D.ORANGE}],
                   "the same three-part shape Houdini ships: a state, a visible divergence, and a verb"),
                   "Drafts as the drift vocabulary"),
         body="""You said this is already in flight with the link and Drafts logic, and from the outside that looks
         right &mdash; a Draft <i>is</i> a named divergence from a committed state, which is the thing Houdini
         spells locked/unlocked. So this fork is not open; it is a sanity check on an implementation you already
         have.
         <br><br>The one question worth carrying over from the prior art: does a diverged instance have a
         <b>repair verb</b> &mdash; a single command that says &ldquo;discard my edits, match the definition
         again&rdquo;? Having the state without the verb is the halfway house every surveyed tool eventually backed
         out of."""),

    dict(k="agree", tag="Agreed — no action", title="Collapse is the S/P/E switch, and the logic is mostly there",
         svg=None,
         body="""Your read matches what the sweep found: <code>PortEdge</code>'s grouping, <code>groupMode</code>
         and <code>maxVisible</code> already do the hard part of deciding <i>which ports a collapsed face shows</i>.
         What the matrix marked absent was never the port arithmetic &mdash; it was the step before it: taking a
         parent plus its children and deriving the port list from the wires that cross the boundary, rather than
         from a list someone already authored on that block.
         <br><br>Given the S/P/E switch already exists, that is a smaller job than the matrix's empty row implies,
         and it lands as a pure function over the scene rather than as a component change."""),
]


def card_html(c, n: int) -> str:
    colour = {"fix": "#e5534b", "ans": "#f0883e", "agree": "#3fb950"}[c["k"]]
    label = {"fix": "#e5534b22", "ans": "#f0883e22", "agree": "#3fb95022"}[c["k"]]
    dia = f'<div class="dia">{c["svg"]}</div>' if c.get("svg") else ""
    return (f'<div class="idea" style="border-left-color:{colour}">'
            f'<div class="hd"><span class="rank">{n}</span>'
            f'<span class="cat" style="background:{label};color:{colour}">{c["tag"]}</span></div>'
            f'<h3>{c["title"]}</h3>{dia}<p class="body">{c["body"]}</p>'
            + FB.strip(n, c["title"], noun="answer") + "</div>")


CSS = """
  :root { --bg:#0c0d10; --panel:#15171c; --panel2:#1b1e25; --sunk:#0b0d10;
    --line:#282d38; --line2:#343b48; --fg:#e8eaf0; --dim:#9aa3b2; --dim2:#6b7383;
    --accent:#f0883e; --accent2:#5aa9f8; --ok:#3fb950; --warn:#e5534b; --purple:#bc8cff;
    --mono: ui-monospace,"SF Mono",Menlo,Consolas,monospace; }
  * { box-sizing:border-box }
  body { margin:0; background:var(--bg); color:var(--fg);
    font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif }
  .wrap { max-width:1120px; margin:0 auto; padding:0 24px 130px }
  a { color:var(--accent2); text-decoration:none } a:hover { text-decoration:underline }
  code { font-family:var(--mono); font-size:.86em; background:#0009; padding:1px 5px; border-radius:4px }
  .hero { padding:56px 0 6px }
  .kicker { font-size:11px; letter-spacing:.22em; text-transform:uppercase; color:var(--accent);
    font-weight:700; margin:0 0 15px }
  h1 { font-size:42px; line-height:1.08; margin:0 0 14px; letter-spacing:-.03em; max-width:900px }
  .sub { color:var(--dim); font-size:16.5px; margin:0 0 8px; max-width:840px }
  .sub b { color:var(--fg) }
  .lede { background:linear-gradient(180deg,#1d1517,#151114); border:1px solid var(--line);
    border-left:3px solid var(--warn); border-radius:12px; padding:20px 24px; margin:26px 0 34px }
  .lede p { margin:0 } .lede b { color:#fff }
  .idea { background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--line2);
    border-radius:13px; padding:18px 22px 16px; margin:0 0 18px }
  .idea .hd { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:9px }
  .rank { font-family:var(--mono); font-size:12.5px; font-weight:800; color:var(--dim2);
    background:#1a1e26; border:1px solid var(--line); border-radius:6px; padding:3px 7px }
  .cat { font-size:10px; font-weight:800; letter-spacing:.07em; text-transform:uppercase;
    padding:3px 9px; border-radius:99px }
  .idea h3 { margin:0 0 12px; font-size:19px; letter-spacing:-.015em; line-height:1.3 }
  .idea .dia { background:var(--sunk); border:1px solid var(--line); border-radius:10px;
    padding:14px 16px; margin:0 0 14px }
  .idea .dia svg { display:block; width:100%; height:auto }
  .idea p.body { color:var(--dim); font-size:14.5px; margin:0 }
  .idea p.body b { color:var(--fg) }
  footer { margin-top:70px; padding-top:22px; border-top:1px solid var(--line);
    color:var(--dim2); font-size:12.5px; line-height:1.85 }
  footer b { color:var(--dim) }
  .hidden { display:none !important }
"""
CSS += FB.CSS

HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Answers to your sweep feedback — 2026-09-18</title>
<style>{CSS}</style></head>
<body><div class="wrap">

<div class="hero">
  <p class="kicker">bbox-ui &middot; answering your markup &middot; 2026-09-18</p>
  <h1>Your questions, answered &mdash; starting with the one where you were right.</h1>
  <p class="sub">Six questions off the prior-art sweep. One of them is a correction to the report itself,
  so it goes first.</p>
</div>

<div class="lede">
<p><b>&ldquo;for elkjs, are we not using that library already???&rdquo;</b> &mdash; yes. SystemSketch
has shipped <code>elkjs</code> 0.12.0 since before that sweep ran, and the report said it was
&ldquo;copy-paste hostile&rdquo; without saying so. That row is corrected in the sweep report, visibly
rather than silently, and the full account is the first card below.</p>
</div>

{''.join(card_html(c, n) for n, c in enumerate(CARDS, 1))}

{FB.ui("answers to the sweep feedback (2026-09-18)", "answer", len(CARDS))}

<footer>
<p><b>What I checked, rather than recalled.</b> <code>systemsketch/package.json:228</code> and
<code>src/blocks/layout/organizeGraph.ts</code> for the elkjs dependency and its ELK options;
<code>src/blocks/elbow/nudge.ts:46-52</code> for the libavoid licence stance and the clean-room
derivation; <code>src/behaviorTree/behaviorTreeCommands.ts:200-228</code> for the drilldown stack and
its history stop; <code>src/chrome/TitleBar.tsx</code> for <code>compactDepthBreadcrumbs</code>; and
<code>apps/storybook-basics/src/components/portEdge.layout.ts</code> + <code>port.layout.ts</code> for
the port vocabulary the ELK ladder is mapped against.</p>
<p><b>Still open.</b> Whether SystemSketch's Drafts already carry a repair verb (the Houdini
&ldquo;Match Current Definition&rdquo; half) &mdash; I did not read the Drafts implementation this
round, so that card asks rather than asserts.</p>
<p><b>Mark this one up too</b> &mdash; every card has its own verdict buttons and a note box, and
<b>Copy feedback</b> emits markdown naming each answer by number and title.</p>
</footer>

</div>{FB.JS}</body></html>"""

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(HTML, encoding="utf-8")
print(f"wrote {OUT}  ({OUT.stat().st_size:,} bytes, {len(CARDS)} answers)")
