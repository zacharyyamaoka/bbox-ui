#!/usr/bin/env python3
"""
Build the exhaustive node-editor prior-art sweep report.

Zach, 2026-09-17: "Lots of people have already made like 2d node editor
libraries... What we are trying to do here is add aspects related to
hierarchical blackbox modelling that I felt were missing. its funny that
almost all the stuff I have done so far though has mostly just been on the
still flat 2D level!!!! ... there is so so so much prior art here we
definitely don't need to reinvent anything."

Three questions, answered in order:
  1. an exhaustive reference list of libraries with docs + open source,
     drawn from his own vault first;
  2. where those libraries converged;
  3. where the field agrees and bbox-ui does something else, or hand-rolls
     something with mature prior art.

Evidence: 17 Sonnet research dossiers (~400 KB) in the run scratchpad, each
one required to cite a file path it opened or a URL it fetched. Integration
and every judgement below is Opus's. Nothing here is recalled from memory;
anything a dossier could not pin is carried through as "unverified" rather
than asserted.

    python3 docs/build_prior_art_sweep_report.py
"""
from __future__ import annotations

import base64
import html
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import report_feedback as FB  # noqa: E402

OUT = pathlib.Path("/home/bam/bbox-ui/reports/node-editor-prior-art-sweep-2026-09-17.html")
CAPS = pathlib.Path("/home/bam/bbox-ui/reports/media/prior-art-sweep")


def cap(name: str) -> str:
    """Inline a real Storybook capture as a data URI. Captures were taken this
    run against a lane-local Storybook on :5477 — never Zach's :5421."""
    data = base64.b64encode((CAPS / f"{name}.png").read_bytes()).decode()
    return f"data:image/png;base64,{data}"

# ---------------------------------------------------------------------------
# 1. THE REFERENCE LIBRARY  — every library the sweep read, by family.
#    vault: "y" = already cited in zach_brain with a verdict; "n" = new here.
# ---------------------------------------------------------------------------
FAMILIES = [
    ("Web node editors — the direct competitors", "The libraries that do exactly this job on the web. Read for data model, port model and package split.", [
        dict(name="React Flow (<code>@xyflow/react</code> 12.11.6)", lic="MIT", vault="y",
             docs="https://reactflow.dev", src="https://github.com/xyflow/xyflow",
             read="Read from installed <code>.d.ts</code>, not docs. <code>@xyflow/system</code> is the shared, framework-free interaction engine (<code>XYDrag</code>, <code>XYHandle</code>, <code>XYPanZoom</code>, <code>XYResizer</code>) behind React/Svelte/Vue Flow. Hierarchy: <code>parentId</code> + <code>extent:'parent'</code> + <code>expandParent</code> — containment only."),
        dict(name="React Flow UI", lic="MIT (page text)", vault="y",
             docs="https://ui.reactflow.dev", src="—",
             read="The registry bbox-ui ships into. 16 components, 2 templates — and <b>nothing for nesting, collapse, port promotion or hierarchy</b>. That absence is the product thesis, confirmed from a second source."),
        dict(name="JointJS (<code>@joint/core</code>)", lic="MPL-2.0 (core); JointJS+ commercial", vault="y",
             docs="https://docs.jointjs.com", src="https://github.com/clientIO/joint",
             read="The most mature ports API in open source: declarative port <i>groups</i> with named position-layout functions, plus separately composable <code>anchor</code> / <code>connectionPoint</code> / <code>port</code>. Embedding is containment; no fold."),
        dict(name="maxGraph / mxGraph / draw.io", lic="Apache-2.0", vault="y",
             docs="https://maxgraph.github.io/maxGraph/", src="https://github.com/maxGraph/maxGraph",
             read="The canonical folding implementation, 20 years old. <code>foldCells</code>, <code>Geometry.alternateBounds</code>, <code>isCellFoldable</code>, and <b>separately</b> <code>enterGroup</code>/<code>exitGroup</code>/<code>home</code> for drill-in. Two independent mechanisms, one nesting structure."),
        dict(name="AntV X6 + G6 v5", lic="MIT", vault="y",
             docs="https://x6.antv.antgroup.com/en", src="https://github.com/antvis/X6",
             read="A real <code>portLayoutRegistry</code> with seven swappable layouts, extended via <code>Graph.registerPortLayout</code>, plus routers <code>manhattan</code>/<code>orth</code>/<code>metro</code>. Seventeen <code>Graph.registerX</code> categories in X6 and eleven <code>ExtensionCategory</code> members in G6 — everything customizable is a string-keyed registered class. G6's Combo re-terminates edges on a collapsed boundary."),
        dict(name="Rete.js v2", lic="MIT", vault="y",
             docs="https://retejs.org", src="https://github.com/retejs/rete",
             read="Zach already rejected it as the engine (it owns an execution backend he does not want) while praising its shape: engine-agnostic core + per-framework render plugins. Precedent for the core/adapter rule, not a dependency."),
        dict(name="Baklava.js (<code>@baklavajs/core</code>)", lic="MIT", vault="y",
             docs="https://baklava.tech", src="https://github.com/newcat/baklavajs",
             read="Its <code>GraphTemplate</code> → <code>GraphNode</code> compile step <i>is</i> port promotion — a shipped, MIT precedent for turning a subgraph into a node with a derived interface."),
        dict(name="litegraph.js / ComfyUI fork", lic="MIT (archived standalone); <b>GPL-3.0</b> inside ComfyUI_frontend", vault="y",
             docs="https://github.com/jagenjo/litegraph.js", src="https://github.com/jagenjo/litegraph.js",
             read="Named by Zach as mature prior art for the Port (middle) view. Its <code>Subgraph.clone()</code> deep-copies and reassigns UUIDs — copies diverge instantly, undocumented. ComfyUI later added Blueprints, still copy-on-instantiate."),
        dict(name="Drawflow, flume, nodl, reaflow, Flyde, Ryven, NodeGraphQt", lic="MIT (each)", vault="partial",
             docs="https://github.com/jerosoler/Drawflow", src="https://github.com/jerosoler/Drawflow",
             read="The long tail. Surveyed for completeness; none contributes a hierarchy mechanism the four above do not already cover better. Ryven/Flyde/Unreal sit in the vault as bare links with no verdict recorded."),
    ]),
    ("The modelling-tool lineage — where hierarchy is taken most seriously", "Eclipse's diagram stack. Smaller audience, far deeper on ports and nesting.", [
        dict(name="diagram-js / bpmn-js", lic="<b>diagram-js: MIT</b>; bpmn-js: MIT-derived with a watermark clause", vault="y",
             docs="https://github.com/bpmn-io/diagram-js", src="https://github.com/bpmn-io/diagram-js",
             read="<b>The single most copyable hierarchy mechanism found.</b> Drill-in is a <i>plane swap</i>: each collapsed sub-process gets its own SVG layer and its own coordinate frame from (0,0) — no nested-coordinate math at all. Ships breadcrumbs and per-plane camera memory. The watermark clause is on bpmn-js, not on the engine."),
        dict(name="ELK / elkjs", lic="EPL-2.0 OR GPL-3.0-or-later", vault="y",
             docs="https://eclipse.dev/elk/", src="https://github.com/eclipse/elk",
             read="The graded port-constraint ladder — <code>FREE → FIXED_SIDE → FIXED_ORDER → FIXED_RATIO → FIXED_POS</code> — and <code>hierarchyHandling</code> as a per-node switch. Imitate the vocabulary; the engine is a GWT-compiled Java blob and dual-licensed copy-paste-hostile."),
        dict(name="Sprotty", lic="EPL-2.0", vault="n",
             docs="https://sprotty.org", src="https://github.com/eclipse-sprotty/sprotty",
             read="Action-as-lingua-franca between a client view and a model source. Vocabulary worth knowing; the client/server split solves a problem bbox-ui does not have."),
        dict(name="Eclipse GLSP", lic="EPL-2.0", vault="n",
             docs="https://eclipse.dev/glsp/", src="https://github.com/eclipse-glsp",
             read="Source-model → GModel projection split — the strongest statement of &ldquo;the canvas is a projection, never the truth&rdquo; in the survey. Heavier than anything bbox-ui needs."),
    ]),
    ("Canvas substrates and graph-viz engines", "Not node editors — the layers underneath them.", [
        dict(name="tldraw 5.3.2", lic="<b>Source-available</b> — production use needs a paid key; watermark enforced", vault="y",
             docs="https://tldraw.dev", src="https://github.com/tldraw/tldraw",
             read="Settled in the vault: &ldquo;React Flow is the shippable adapter, tldraw is the private one.&rdquo; Localhost is carved out forever, which is why SystemSketch may rely on it and bbox-ui.com may not."),
        dict(name="Excalidraw", lic="MIT", vault="y",
             docs="https://docs.excalidraw.com", src="https://github.com/excalidraw/excalidraw",
             read="Donor of the elbow router already ported here. Closed as an extension host: the custom-element-subtype PR sat unmerged 15 months — &ldquo;there is no seam to bind to.&rdquo;"),
        dict(name="Cytoscape.js", lic="MIT", vault="y",
             docs="https://js.cytoscape.org", src="https://github.com/cytoscape/cytoscape.js",
             read="Source of the <b>meta-edge</b> pattern: N crossing child edges collapse into one reversible, typed placeholder (<code>expand-collapse</code> plugin, <code>groupEdgesOfSameTypeOnCollapse</code>)."),
        dict(name="Konva / Fabric / PixiJS / Sigma / vis-network / BlockSuite", lic="MIT (each)", vault="partial",
             docs="https://konvajs.org", src="https://github.com/konvajs/konva",
             read="Rendering substrates and graph-viz engines. Relevant only if bbox-ui ever needs a third host; none carries a hierarchy model."),
    ]),
    ("Commercial references — imitate the docs, never the source", "Price-on-request, closed source. Their documentation is the best in the category and is free to read.", [
        dict(name="yFiles", lic="Commercial", vault="y",
             docs="https://docs.yworks.com/yfileshtml/", src="closed",
             read="<b>The complete cohesive answer, already shipped.</b> <code>FoldingManager</code>/<code>IFoldingView</code> (one master graph, N synced view graphs), collapsed node = folder node, <code>MergingFoldingEdgeConverter</code> merges crossing cables into one, and <code>reuseFolderNodePorts</code> vs <code>reuseMasterPorts</code> as a per-edge port-identity choice. Uniquely, <b>N independent folding views over one master graph</b> — two people looking at the same system with different things collapsed. Also <code>IPortCandidateProvider</code>: a per-node, queried set of legal connection targets computed live during a drag. Read it as the spec."),
        dict(name="GoJS", lic="Commercial", vault="y",
             docs="https://gojs.net/latest/api/", src="closed",
             read="Richest feature/layout suite in the category. Vault verdict already recorded: avoid if OSS is a requirement."),
        dict(name="jsPlumb Toolkit", lic="Community MIT (frozen); Toolkit commercial", vault="y",
             docs="https://docs.jsplumbtoolkit.com", src="partial",
             read="Its Groups feature is a third independent confirmation of edge promotion, quoted directly: <i>&ldquo;edges to/from children of the group are relocated to the group.&rdquo;</i> The community edition is frozen; the layout and data-binding features are behind the paid Toolkit."),
    ]),
    ("Whole-app references — how a real editor is decomposed", "Not libraries: shipped applications whose file layout is the lesson. All already ranked in Zach's own reference map.", [
        dict(name="OpenFlowKit", lic="MIT", vault="y", docs="https://github.com/", src="https://github.com/",
             read="Rank 1 in the vault's reading list. <code>FlowCanvasSurface</code>/<code>FlowCanvasOverlays</code> split, <code>GroupNode</code>/<code>SectionNode</code>, <code>useFlowHistory</code>, ELK in a worker, bidirectional diagram DSL."),
        dict(name="Activepieces", lic="MIT outside enterprise dirs", vault="y", docs="https://www.activepieces.com/docs", src="https://github.com/activepieces/activepieces",
             read="The sharpest precedent for bbox-ui's own rule: React Flow nodes are neither draggable nor connectable — a separate semantic tree owns every edit and produces deterministic layout. The canvas is a pure projection."),
        dict(name="Flowise <code>@flowiseai/agentflow</code>", lic="Apache-2.0 (package <code>0.0.0-dev</code>)", vault="y", docs="https://docs.flowiseai.com", src="https://github.com/FlowiseAI/Flowise",
             read="Explicitly the best <i>reusable editor-package architecture</i> found anywhere in the vault: <code>ARCHITECTURE.md</code> + <code>src/features/canvas/</code> + framework-free <code>src/core/</code> + one public <code>Agentflow.tsx</code>. Study the seams; the version number says do not depend on it."),
        dict(name="Langflow", lic="MIT", vault="y", docs="https://docs.langflow.org", src="https://github.com/langflow-ai/langflow",
             read="Verified from real source: shadcn/ui over Radix + CVA + clsx + tailwind-merge — the same stack as bbox-ui. Its node toolbar is a hand-rolled positioned div, not React Flow's <code>&lt;NodeToolbar&gt;</code>; its kebab menu is composed from stock <code>DropdownMenu</code>. Same house style bbox-ui already follows."),
        dict(name="Sim Studio · Apollon · Dump · Dify", lic="Apache-2.0 · MIT · MIT · modified Apache", vault="y", docs="—", src="—",
             read="Ranks 4–8. Operation-level inverse undo (Sim Studio), selection-preserving clipboard and Yjs presence (Apollon), edge-cutting knife (Dump), the broadest interaction corpus but restrictive licence (Dify)."),
    ]),
    ("The hierarchy masters — desktop tools, 40 years of shipping this", "Not libraries. These are the only places the black-box mechanism is actually finished, which is why the taxonomy below comes from them.", [
        dict(name="Houdini (Subnets + HDAs)", lic="Commercial", vault="y", docs="https://www.sidefx.com/docs/houdini/", src="closed",
             read="<b>The most complete answer in the survey.</b> Subnet Input/Output boundary nodes, a separate <i>Type Properties</i> modal for authoring the interface, promotion of a parameter with a live link, and the only <b>named divergence-and-repair vocabulary</b> anywhere: locked/unlocked + <i>Match Current Definition</i>."),
        dict(name="Blender (node groups)", lic="GPL", vault="y", docs="https://docs.blender.org/manual/en/latest/", src="https://projects.blender.org/blender/blender",
             read="Ctrl-G derives the interface from the selection boundary at fold time; Group Input/Output nodes then become editable objects inside. Tab/Ctrl-Tab to enter and leave. Definition is a file-scoped data-block."),
        dict(name="Unreal Blueprints", lic="Commercial (EULA)", vault="y", docs="https://dev.epicgames.com/documentation/", src="source-available",
             read="Tunnel nodes as the boundary; Details panel edits the pins; Collapse to Node / Function / Macro are three <i>different</i> promotion tiers, not one gesture."),
        dict(name="Nuke · Max/MSP · TouchDesigner · Substance Designer · Grasshopper", lic="Commercial (each)", vault="y", docs="—", src="closed",
             read="Group→Gizmo, Subpatcher→Abstraction, Base COMP→.tox, Exposed→SBSAR, Cluster: every one of them ships <b>two promotion tiers</b> — a local fold, then a separate deliberate step to a file-backed reusable definition. TouchDesigner is the only tool in the survey with a real clickable breadcrumb."),
        dict(name="Node-RED · n8n · Langflow (subflow tier)", lic="MIT · fair-code · MIT", vault="y", docs="https://nodered.org/docs/", src="https://github.com/node-red/node-red",
             read="The web-era versions. Node-RED's grey boundary squares are the classic authored interface; n8n and Langflow skip the visual interface entirely and call another document by id."),
    ]),
    ("The engineering-modelling lineage — the vocabulary that already exists", "Where &ldquo;black box&rdquo; is the field's own term, not a metaphor.", [
        dict(name="LabVIEW", lic="Commercial", vault="y", docs="https://www.ni.com/docs/", src="closed",
             read="The connector pane: a VI's terminals are authored by binding front-panel controls to a fixed terminal grid, and each terminal carries a <b>Required / Recommended / Optional</b> obligation level visible in the tooltip. bbox-ui ports have no notion of caller obligation."),
        dict(name="Simulink", lic="Commercial", vault="y", docs="https://www.mathworks.com/help/simulink/", src="closed",
             read="Ports are <i>derived</i> — Inport/Outport blocks placed inside the subsystem are the interface. Virtual vs atomic is a checkbox on the same subsystem, not a different node type. Subsystem Reference (dynamic interface) vs Model Reference (fixed) is an explicit, named choice."),
        dict(name="Modelica", lic="Open spec; OpenModelica open source", vault="y", docs="https://modelica.org/documents/", src="https://github.com/OpenModelica",
             read="Two lessons already in the vault: the file owns its view (<code>annotation(Placement(...))</code> lives inside the <code>.mo</code>), and connector compatibility is convention-only — &ldquo;the trap to avoid.&rdquo; Also <code>replaceable</code>/<code>redeclare</code>: type-safe substitutable definitions, which <code>definitionId</code> is not."),
        dict(name="Ptolemy II", lic="BSD-style", vault="n", docs="https://ptolemy.berkeley.edu/ptolemyII/", src="https://github.com/icyphy/ptII",
             read="<code>IORelation</code> as a first-class N-ary object (not a pairwise edge), <code>multiport</code> as multiplicity on one terminal, and opacity defined as &ldquo;has a local director&rdquo; — a composite is a black box exactly when it owns its own model of computation."),
        dict(name="SysML v2 · Capella/Arcadia · IP-XACT", lic="OMG spec · EPL · IEEE 1685", vault="partial", docs="https://www.omg.org/spec/SysML/", src="https://github.com/Systems-Modeling",
             read="<code>def</code> vs usage as a universal pattern; conjugated ports (<code>~PortDef</code>) deriving the socket from the plug; <b>delegation</b> as a named exchange kind distinct from an ordinary internal connection; and a logical/physical split with explicit allocation between two parallel graphs."),
    ]),
]

# ---------------------------------------------------------------------------
# 2. CONVERGENCE MATRIX — what the field agrees on, and who dissents.
# ---------------------------------------------------------------------------
CONVERGENCE = [
    dict(q="Node vs edge vs group", agree="One cell/node type with children, not a separate &ldquo;group&rdquo; class. Geometry on the record, semantics in a data bag.",
         who="maxGraph <code>Cell</code>, React Flow <code>Node.parentId</code>, JointJS <code>dia.Element</code> embeds, X6, diagram-js",
         bbox="Converged — <code>SceneNode.parentId</code>, <code>data</code> bag, geometry in <code>position</code>.", verdict="same"),
    dict(q="Are ports first-class?", agree="Yes, but optional: an edge may attach to a bare node. Ports are declared on the node, addressed by id, and grouped.",
         who="JointJS <code>ports.groups</code>, X6, ELK <code>ports[]</code>, React Flow <code>Handle</code> (id-addressed)",
         bbox="Converged — <code>PortEdgeItem.id</code> + <code>(nodeId, portId)</code> via <code>portKey</code>.", verdict="same"),
    dict(q="How is port position expressed?", agree="A <b>named layout function</b> selected by name and called with args — never hard-coded coordinates.",
         who="JointJS port position layouts, X6 <code>portLayout</code> registry, ELK's constraint ladder",
         bbox="Converged on the idea, <b>diverges on openness</b>: <code>portEdge.layout.ts</code>'s schemes are a closed union, not a registry a consumer extends.", verdict="near"),
    dict(q="Edge path vocabulary", agree="straight · bezier · (smooth-)step · orthogonal-with-obstacles. Four families, near-identical names everywhere.",
         who="React Flow <code>getBezierPath</code>/<code>getSmoothStepPath</code>, JointJS <code>manhattan</code>, X6 <code>orth</code>/<code>metro</code>, ELK orthogonal",
         bbox="Converged, and <b>ahead</b>: <code>elbow/*</code> is a real obstacle-aware A* router; React Flow has none.", verdict="ahead"),
    dict(q="Who owns interaction?", agree="<b>The field does not agree.</b> JointJS bakes hit-testing and drag into <code>dia.Paper</code>; React Flow isolates it in <code>@xyflow/system</code>; GLSP/Activepieces push it out entirely.",
         who="split roughly 50/50 across the survey",
         bbox="bbox-ui's &ldquo;core imports no canvas engine&rdquo; is the <i>less common</i> choice in the field — worth naming as deliberate rather than assuming it is obvious.", verdict="diff"),
    dict(q="Distribution", agree="Two live models: npm package (React Flow, JointJS, X6) and shadcn-registry copy (React Flow UI, Kibo).",
         who="React Flow UI and bbox-ui independently chose the same registry protocol",
         bbox="Converged — <code>registry.json</code>, npm deliberately excluded.", verdict="same"),
    dict(q="Collapse to a black box", agree="Every mature implementation stores <b>two bounds and one boolean</b>, never a second &ldquo;collapsed representation&rdquo; object to keep in sync &mdash; and collapsing <b>relocates boundary-crossing edges onto the container</b>. Six independent confirmations; the strongest convergence in the whole sweep.",
         who="maxGraph <code>alternateBounds</code>+<code>isCellCollapsed</code> &middot; yFiles folding edges &middot; jsPlumb Groups (<i>&ldquo;edges to/from children of the group are relocated to the group&rdquo;</i>) &middot; AntV G6 Combo &middot; Cytoscape meta-edges &middot; Mermaid's published rule",
         bbox="<b>Absent.</b> <code>BlockPort</code>'s <code>collapsePorts</code> is a density toggle on already-declared ports, not a fold.", verdict="missing"),
    dict(q="Drill-in navigation", agree="A <b>separate mechanism from collapse</b>, operating on the same nesting structure.",
         who="maxGraph <code>enterGroup</code>/<code>exitGroup</code>/<code>home</code>; diagram-js plane swap; Blender Tab; Houdini dive",
         bbox="<b>Absent.</b> Nothing in the trunk changes which level is in view. <code>childrenOf</code> is the query a host <i>could</i> build on.", verdict="missing"),
    dict(q="Where does the interface come from?", agree="A boundary node placed <i>inside</i> the box &mdash; <b>7 of 11</b> shipping desktop tools. Baklava shows derived and authored are the <i>same answer</i>: it derives the interface by filtering for the boundary nodes someone placed.",
         who="Houdini, Unreal, Nuke, TouchDesigner, Node-RED, Max/MSP &middot; <b>Baklava <code>GraphTemplate.inputs/outputs</code>, MIT, source read</b>",
         bbox="<b>Absent.</b> No derivation, no boundary node, no interface authoring anywhere.", verdict="missing"),
    dict(q="Data &rarr; renderer binding", agree="The record carries a <code>type</code> string; a <code>type</code> &rarr; renderer map decides what draws it. Unanimous.",
         who="GoJS <code>nodeTemplateMap</code>, jsPlumb <code>view.nodes[type]</code>, Syncfusion, React Flow <code>nodeTypes</code>, X6/G6 registries",
         bbox="Converged &mdash; <code>SceneNode.type</code> plus a per-file component registry.", verdict="same"),
    dict(q="How a consumer extends the library", agree="A <b>string-keyed registry of classes or functions</b>, not subclassing and not render props. Five independent libraries.",
         who="X6 (17 <code>Graph.registerX</code> categories), G6 (11 <code>ExtensionCategory</code> members), JointJS <code>Element.define()</code>, Baklava <code>registerNodeType</code>, Rete plugins",
         bbox="<b>Diverges.</b> <code>portEdge.layout.ts</code>'s schemes and <code>trace.routing.ts</code>'s routings are closed union types. Adding a radial port layout means editing the file, not registering a function.", verdict="diff"),
    dict(q="A point on a shape's boundary", agree="A fractional <code>[0,1]</code> parameterisation of the unit square, never absolute pixels.",
         who="jsPlumb anchor arrays, Syncfusion port <code>offset</code>, GoJS <code>Spot</code>",
         bbox="Partially converged &mdash; <code>portEdge.layout.ts</code> thinks in distribution along a rail rather than a named fractional primitive.", verdict="near"),
    dict(q="Is a connection legal?", agree="Yes &mdash; an interaction-time query, answered live during the drag.",
         who="X6's eight gates (<code>allowLoop</code>, <code>allowMulti</code>, <code>validateConnection</code>, &hellip;) plus <code>highlighting.magnetAdsorbed</code>; yFiles <code>IPortCandidateProvider</code>",
         bbox="<b>Absent by choice.</b> <code>Wire{id, from, to, &hellip;}</code> has no validation field at all. Defensible under the host-owns-interaction rule &mdash; but say so, because the field does not agree.", verdict="diff"),
    dict(q="Definition vs instance drift", agree="Either never let it drift (true shared reference) <b>or</b> let it drift and <i>name</i> the drift with a repair verb. Nobody ships silent divergence.",
         who="Blender/Nuke/Max/TouchDesigner (reference) &middot; Houdini (locked/unlocked + Match Current Definition) &middot; <b>Baklava</b> (edits propagate by full replacement &mdash; per-instance changes are lost) &middot; <b>ComfyUI Blueprints</b> (deliberately never propagate). Both MIT, both source-read: the two horns, shipped.",
         bbox="<code>linkedCopy</code>/<code>definitionId</code> is a third, unnamed option: a copy that remembers its origin, with no sync behaviour and no drift vocabulary.", verdict="diff"),
]

# ---------------------------------------------------------------------------
# 3. WHERE BBOX-UI STANDS — the four buckets.
# ---------------------------------------------------------------------------
BUCKETS = [
    ("same", "Converged — nothing to do", "The flat 2D layer. Where the field agrees, bbox-ui already agrees with it.", [
        ("Node / edge record shape", "<code>SceneNode</code>/<code>SceneEdge</code> borrow React Flow's exact vocabulary and a <code>tsc</code>-gated test proves they assign to its published types with no cast — while importing nothing. That is convergence made falsifiable, which is stronger than convergence claimed."),
        ("Ports declared on the node, addressed by id", "<code>PortEdgeItem { id, label }</code> plus <code>portKey(nodeId, portId)</code> matches JointJS, X6 and ELK on identity and scoping."),
        ("Layout as a named pure function", "<code>portEdge.layout.ts</code>'s <code>mainAxisPositions</code> cites CSS Align 3 and is the same &ldquo;named function over element geometry&rdquo; shape JointJS and X6 use."),
        ("Registry-as-distribution", "React Flow UI reached the same shadcn-registry answer independently. Two teams, one protocol."),
        ("Composed chrome, not componentized chrome", "Neither React Flow UI nor Langflow ships a menu or toolbar component — both compose per-demo from stock shadcn primitives. bbox-ui's vendored <code>button</code>/<code>dropdown-menu</code> is the same house style, already documented as such."),
    ]),
    ("ahead", "Ahead, or deliberately different", "Real divergences that are defensible — with the cost of each named.", [
        ("Obstacle-aware orthogonal routing", "<code>elbow/*</code> (13 files, ported verbatim from Excalidraw, enforced by <code>elbow/provenance.test.ts</code>) is a genuine A* router with channel-assignment nudging. React Flow has <b>no</b> obstacle-avoidance router at all; JointJS's <code>manhattan</code> is the only open-source peer. Ahead, and correctly attributed."),
        ("Port grouping as an authored mini-language", "<code>groups</code> on the edge — not on the port — parsed by <code>parseGroupSyntax</code> into slots. JointJS has no equivalent. The design rule that a port never carries its own membership is the interesting half."),
        ("Definition vs instance exists at all", "React Flow has no definition/instance concept anywhere in its public API. <code>definitionId</code>/<code>linkedCopy</code> is ahead of the web field — though behind the desktop field on what to <i>do</i> with it (see below)."),
        ("Core imports no canvas engine", "Correct, but name it as a choice: JointJS bakes interaction into <code>dia.Paper</code>, and roughly half the field does the same. Activepieces and GLSP are the precedents that back this rule, not React Flow."),
        ("No connection validation, on purpose", "X6 ships eight connection gates and yFiles a live <code>IPortCandidateProvider</code>. <code>Wire{id, from, to}</code> has no validation field. That follows from host-owns-interaction and is probably right &mdash; but the field does not agree with you here, so it is worth one line in <code>ARCHITECTURE.md</code> rather than being left to look like an oversight."),
        ("Themeable by token fallback", "<code>theme.css</code>'s <code>var(--bbox-primary, var(--primary))</code> pattern &mdash; define only the shadcn-standard tokens and get sane defaults, add the <code>--bbox-*</code> tokens for bbox's own grammar. Verified in the file, with the reasoning in its own comment. Nothing in the survey does this better."),
    ]),
    ("stock", "Hand-rolled where mature prior art exists", "Checked file by file. The honest answer is: far less than expected.", [
        ("Routing and layout maths — <b>keep all of it</b>", "Nine candidate stock parts were checked against the ~16,000 hand-rolled lines of <i>wire-routing and port-layout</i> geometry. Verdict on every one: keep ours. <code>libavoid</code> is LGPL and correctly not read. <code>dagre</code> solves a different problem. <code>tinyqueue</code> lacks the <code>rescore</code> operation <code>binaryHeap.ts</code>'s A* needs. Nothing in <i>that</i> set is a redundant hand-roll. <b style=\"color:#e8c06a\">Corrected 2026-09-18 &mdash; the <code>elkjs</code> line as first written was wrong.</b> It said &ldquo;copy-paste hostile, keep ours&rdquo; without saying that SystemSketch <b>already depends on <code>elkjs</code> 0.12.0</b> (<code>package.json:228</code>, lazy-loaded in <code>src/blocks/layout/organizeGraph.ts</code>) for one-shot <i>node placement</i> &mdash; a different job from wire routing, which is why the routing verdict still stands, but the report should have said so. Zach caught it. Full correction: <code>reports/sweep-answers-2026-09-18.html</code>."),
        ("<code>portEdge.layout.ts</code>'s closed union → an open registry", "X6 lets a consumer register a new port layout by name. bbox-ui's three schemes are a union type. Small, real, and exactly the kind of extensibility a copy-paste registry should have."),
        ("Port constraint vocabulary", "ELK's <code>FREE → FIXED_SIDE → FIXED_ORDER → FIXED_RATIO → FIXED_POS</code> ladder is a well-designed, documented enum. Adopt the <i>names and meanings</i> as bbox-ui's own layout-config surface — the same way <code>mainAxisPositions</code> already cites CSS Align 3. Do not adopt the engine."),
        ("Router/connector as two stages", "JointJS splits &ldquo;pick the waypoints&rdquo; from &ldquo;draw the path between them&rdquo; (the <code>jumpover</code> connector stacks on the <code>manhattan</code> router). <code>elbow/</code> folds both into one, so a rounded-corner or jump-arc rendering style cannot be swapped in without touching pathfinding."),
        ("Closed unions where the field ships open registries", "Verified twice this run, with exact names: X6's <code>portLayoutRegistry</code> (seven layouts, extended by <code>Graph.registerPortLayout</code>) and G6's eleven <code>ExtensionCategory</code> members. A copy-paste registry arguably needs this <i>more</i> than an npm library does &mdash; a consumer who owns the source will want to add a layout without re-deriving <code>portEdge.layout.ts</code>."),
        ("Generic highlighter primitive", "<code>highlighters.add(cellView, selector, id)</code> — one id-addressable, non-destructive highlight usable on any view. Already flagged as a gap by a concurrent session; this sweep confirms the call shape really is that small."),
    ]),
    ("missing", "Missing entirely — and already specified in your own vault", "The hierarchy layer. This is the whole differentiator, and it is the one thing not in the repo.", [
        ("No collapse-to-black-box", "A repo-wide search for <code>black-box</code>, <code>drill-in</code>, <code>collapse-to</code> and <code>interface-deriv*</code> across every <code>.ts</code>/<code>.tsx</code> under <code>apps/storybook-basics/src</code> returns <b>zero hits</b>. <code>BlockPort</code>'s <code>collapsePorts</code> changes how one block's own declared ports draw; it derives nothing from what is nested inside."),
        ("No interface derivation", "No function anywhere looks at a set of child nodes' edges and computes which ports a parent black box should expose. <code>wiredPorts</code>, <code>producersOf</code>, <code>duplicateEdges</code> all operate on a flat edge set against explicit ports."),
        ("No drill-in navigation", "Nothing changes which level of nesting is in view. No breadcrumb, no focused subgraph, no re-rooting."),
        ("Two things <code>CLAUDE.md</code> asserts that the code does not", "Measured, not assumed. (1) <b>&ldquo;No pointer listeners&rdquo; is not literally true</b> of <code>packages/bbox-ui/src</code>: <code>codeField.tsx:547</code> attaches a document-level <code>pointerdown</code>, <code>:565</code> a non-passive <code>wheel</code>, <code>completionMenu.ts:594-595</code> two more. Every one is scoped to the code field's own text editing, never to canvas hit-testing or drag &mdash; so the rule's <i>spirit</i> holds and its wording does not. (2) <b><code>apps/docs/src/app/global.css</code> has four <code>@source</code> directives and none of them is <code>apps/storybook-basics/src</code></b>, which is now the trunk. Whether that bites today is unverified; structurally, the 16 trunk-sourced registry items have docs-site CSS coverage by accident rather than by declaration."),
        ("The specification already exists — in Obsidian, not in the repo", "<code>PROJECT - Black Box UI.md</code> carries <b>nine boundary rules</b> already settled: port polarity derives from scope rather than being stored; collapse redirects crossing edges and drops internal-only ones; meta-edge aggregation; a closure toggle matching Simulink's virtual/atomic subsystem. Zach's own note calls these &ldquo;the only thing that makes a component set cohere rather than be five borrowed ideas in one folder.&rdquo; None of it is written down anywhere in this repo."),
    ]),
]

# ---------------------------------------------------------------------------
# 4. STOCK-PART MAPPING TABLE (the house rule: element by element, exact names)
# ---------------------------------------------------------------------------
STOCK = [
    dict(el="Fold a subtree to a small box", today="Nothing. <code>collapsePorts</code> is a port-density toggle on one block.",
         part="maxGraph <code>Graph.foldCells(collapse, recurse, cells)</code> + <code>Geometry.alternateBounds</code> + <code>Graph.isCellFoldable()</code> + <code>collapseToPreferredSize</code> <span class=lic>Apache-2.0</span>",
         keep="One geometry, two bounds, one boolean — never a second collapsed-representation record to keep in sync. Authored collapsed size, with a computed fallback."),
    dict(el="Step inside a box", today="Nothing. <code>childrenOf(scene, id)</code> is the query a host could build on.",
         part="diagram-js <code>Canvas.addRootElement()</code> / <code>setRootElement()</code> / <code>findRoot()</code> — one SVG layer per plane, shown one at a time <span class=lic>MIT</span>",
         keep="The child's own coordinate frame starts at (0,0). Nested-coordinate transforms never exist, so the boundary-crossing maths never has to."),
    dict(el="Know where you are", today="Nothing.",
         part="diagram-js <code>DrilldownBreadcrumbs</code> — walks the <i>semantic</i> parent chain, resolves each ancestor to its plane, and each crumb's click handler is literally <code>canvas.setRootElement(parentPlane)</code> <span class=lic>MIT</span>",
         keep="Breadcrumb order is a domain decision; plane-swapping is generic. That split is exactly bbox-ui's core/adapter rule, already proven in someone else's code."),
    dict(el="Return to where you were", today="Nothing.",
         part="diagram-js <code>DrilldownCentering</code> — a <code>positionMap</code> keyed by root element storing <code>{x, y, zoom}</code> per plane <span class=lic>MIT</span>",
         keep="Drilling back out restores the exact viewbox you left, not a recomputed fit-to-view. ~60 lines."),
    dict(el="What happens to a cable that crossed the boundary", today="Undefined. A view toggle currently strands it.",
         part="Three graded options: Mermaid's published collapse rule (redirect crossing edges to the collapsed node, drop internal-only ones) <span class=lic>MIT</span> · Cytoscape <code>expand-collapse</code> meta-edges with <code>groupEdgesOfSameTypeOnCollapse</code> <span class=lic>MIT</span> · yFiles <code>MergingFoldingEdgeConverter</code> <span class=lic>commercial, read as spec</span>",
         keep="Reversible. Whatever N edges collapsed into must expand back into exactly those N edges, with their identities intact."),
    dict(el="Where the interface comes from", today="Nothing.",
         part="<b>No library ships this</b> — the pattern is from the desktop tools: a boundary node placed inside the box (Houdini Subnet Input/Output, Unreal tunnel nodes, Node-RED grey squares), used by 7 of 11 surveyed tools.",
         keep="The interface is an ordinary node you can select, rename, reorder and delete. Not a hidden derived list, and not a modal you must open to see it."),
    dict(el="A reusable subgraph definition", today="<code>definitionId</code> + <code>linkedCopy()</code> &mdash; identity, with no interface and no palette entry.",
         part="Baklava <code>GraphTemplate</code> + <code>GraphInputNode</code>/<code>GraphOutputNode</code> + <code>editor.addGraphTemplate()</code> <span class=lic>MIT, source read in full this run</span>",
         keep="<code>graphInterfaceId</code> is separate from the node's own id, so a port survives its boundary node being deleted and recreated &mdash; the same principle <code>portLane.ts</code>'s LCS reconcile already protects for labels."),
    dict(el="An extensible port layout", today="<code>mode: \"auto\" | \"custom\"</code> over a closed union of three CSS-Align-3 schemes.",
         part="AntV X6 <code>portLayoutRegistry</code> &middot; <code>Graph.registerPortLayout(name, fn)</code>, where <code>fn</code> is <code>(portsArgs, elemBBox, groupArgs) =&gt; {position, angle}[]</code> <span class=lic>MIT</span>",
         keep="The three existing schemes and their CSS Align 3 citation. What changes is that they become the built-in entries of a registry rather than the whole universe."),
    dict(el="Port position constraints", today="<code>mode: \"auto\" | \"custom\"</code> plus free offsets.",
         part="ELK's <code>org.eclipse.elk.portConstraints</code> ladder: <code>FREE</code> · <code>FIXED_SIDE</code> · <code>FIXED_ORDER</code> · <code>FIXED_RATIO</code> · <code>FIXED_POS</code> <span class=lic>EPL-2.0, vocabulary only</span>",
         keep="Adopt the names and their meanings, not the engine — the same borrowing <code>mainAxisPositions</code> already does from CSS Align 3."),
    dict(el="<b>Unchanged (stock seam)</b> — the routing pipeline", today="<code>elbow/*</code>, <code>trace.tidy.ts</code>, <code>trace.routing.ts</code>, <code>portLane.ts</code>, <code>binaryHeap.ts</code>.",
         part="<b>None adopted for routing.</b> Candidates rejected with reasons: <code>libavoid</code> (LGPL, deliberately unread &mdash; though SystemSketch has since built a lot of libavoid-<i>class</i> capability clean-room: constraint-DAG nudging, <code>hasFixedRoute</code>-equivalent pinning, trunk fan-out), <code>dagre</code> (different problem), JointJS <code>manhattan</code> (not better), <code>tinyqueue</code> (no <code>rescore</code>). <b style=\"color:#e8c06a\">Corrected:</b> <code>elkjs</code> belongs in the &ldquo;already adopted&rdquo; column, not this one &mdash; SystemSketch ships it for node placement.",
         keep="Everything. This is the part of the repo that is already right — ported verbatim with a runnable provenance test. Do not touch it."),
]


# ---------------------------------------------------------------------------
# 4b. HOW THEY STRUCTURE THEIR LIBRARIES — Zach asked for this axis by name.
# ---------------------------------------------------------------------------
LIBSTRUCT = [
    dict(t="Framework-agnostic core, optional official framework packages",
         who="GoJS &middot; yFiles &middot; jsPlumb &middot; Rete v2 &middot; Baklava (<code>@baklavajs/core</code> + <code>renderer-vue</code>) &middot; <code>@xyflow/system</code> behind React/Svelte/Vue Flow",
         b="Unanimous, including all three commercial libraries. None hard-couples its core to a UI framework. bbox-ui sits one level stricter &mdash; core imports no <i>canvas engine</i>, not merely no framework &mdash; and the grep confirms it holds: zero imports of <code>tldraw</code>, <code>@xyflow/react</code> or <code>react-dom</code> in either <code>packages/bbox-ui/src</code> or the trunk's <code>components/</code>."),
    dict(t="Everything customizable is a string-keyed registered class",
         who="X6 (17 <code>Graph.registerX</code> categories) &middot; G6 (11 <code>ExtensionCategory</code>) &middot; JointJS <code>Element.define()</code> &middot; Baklava <code>registerNodeType</code>",
         b="Four libraries, arrived at independently, and the one structural idea bbox-ui most clearly does not have. Its layout schemes, routings and component set are closed unions and per-file registries. For a library you <i>copy</i> rather than depend on, an open registry is arguably more valuable, not less &mdash; the consumer already owns the file."),
    dict(t="Serialization is first-class in core, or it is nobody's job",
         who="Baklava <code>editor.save()</code>/<code>.load()</code> over <code>IEditorState</code> &middot; maxGraph's codec layer &middot; tldraw's <code>@tldraw/store</code> + <code>tlschema</code> with migrations &middot; Rete: deliberately absent",
         b="The libraries that ship a format also ship migrations. bbox-ui's <code>packages/schema</code> exists but is <code>private: true</code>, so a consumer cannot reach it &mdash; the scene kit's records are the de-facto format and they have no versioning story. Worth a decision, not an accident."),
    dict(t="Two-tier CSS: structural skeleton vs default theme",
         who="React Flow's <code>base.css</code> vs <code>style.css</code>",
         b="A consumer can take the structural CSS and skip the visual theme. bbox-ui's equivalent is better in one way and worse in another: <code>theme.css</code>'s <code>var(--bbox-primary, var(--primary))</code> fallback means a host that defines only the shadcn tokens looks right &mdash; but there is no way to take the geometry without the look."),
    dict(t="One registry, two pipelines &mdash; and a leftover",
         who="bbox-ui's own tree, measured",
         b="Root <code>registry.json</code> is the public distribution surface. <code>apps/docs/registry.json</code> is a <i>different document</i> &mdash; still carrying <code>&quot;name&quot;: &quot;shadcn-registry-docs-template/ui&quot;</code> from the Fumadocs fork this app started from &mdash; and drives only Fumadocs' internal live-preview machinery. <code>apps/docs/public/r/</code> is gitignored and copied from the root build, with the copy script's own comment saying why: <i>&ldquo;One registry, one source of truth, no second copy to drift.&rdquo;</i> That is correct, and the same-named file is a trap for the next person."),
    dict(t="The falsifiable-compatibility trick, which nobody else does",
         who="bbox-ui <code>scene.reactflow.test.ts</code>",
         b="<code>scene.ts</code> has <b>zero import statements</b> &mdash; verified, not claimed. Compatibility with React Flow is then proved by four one-line identity functions that only compile if <code>SceneNode</code>/<code>SceneEdge</code> structurally satisfy its published types with no cast, gated by <code>tsc --noEmit</code>. No library in this survey proves its interop this way. It is the most original structural idea in the repo."),
]

# ---------------------------------------------------------------------------
# 5. DECISION SURFACE
# ---------------------------------------------------------------------------
DECISIONS = [
    dict(k="ask", t="Fork 1 &mdash; which derivation: from the selection, or from boundary nodes?",
         b="""I framed this as derive-vs-author before reading Baklava's source, and that framing was wrong: <b>they are the
         same mechanism.</b> Baklava's <code>GraphTemplate.inputs</code> is <i>derived</i> &mdash; by filtering the template's
         own node list for <code>GraphInputNode</code>/<code>GraphOutputNode</code>. Dropping a boundary node inside the box
         <i>is</i> adding a port. So the real fork is what you derive <i>from</i>: the marquee you happened to draw
         (Blender, Max/MSP &mdash; fast, but the interface is an accident of the selection), or boundary nodes that live
         inside and can be selected, renamed and reordered (Houdini, Unreal, Nuke, TouchDesigner, Node-RED, Max/MSP,
         Baklava &mdash; 7 of 11 tools, plus the one MIT implementation whose source we have read).<br><br>
         <b>Recommendation: derive from boundary nodes.</b> It reuses <code>Block</code> and <code>Port</code> instead of
         inventing a record type, it is the field's supermajority, and fold-the-selection can be layered on top later as a
         gesture that <i>creates</i> the boundary nodes. The reverse is not true. Take <code>graphInterfaceId</code> with it:
         a port identity separate from its node's id, so the interface survives the boundary node being deleted and
         recreated.<br><br><b>Default if you say nothing:</b> I write it up as a plan against <code>scene.ts</code> and do
         not build it.""" ),
    dict(k="ask", t="Fork 2 &mdash; when the definition changes, what happens to the instances?",
         b="""Both answers are shipped, MIT, and were read from source this run. <b>Baklava propagates</b>: every
         <code>GraphNode</code> subscribes to <code>template.events.updated</code> and rebuilds its whole subgraph from
         scratch &mdash; so edits reach every instance, and any per-instance change inside one is lost. <b>ComfyUI's
         Blueprints deliberately do not propagate</b>: an instance &ldquo;is still isolated,&rdquo; copy-on-instantiate.
         Upstream litegraph's <code>Subgraph.clone()</code> reassigns every UUID and says nothing about it, which is the
         state <code>linkedCopy</code> is in today.<br><br><b>Recommendation: stay isolated, but name it.</b> Isolation is
         the reversible default &mdash; it can be upgraded to live-linking later and the reverse cannot. What must change is
         the silence: add a <code>linked</code>/<code>detached</code> state and a <code>matchDefinition</code> verb, which is
         Houdini's vocabulary without Houdini's machinery. Divergence then becomes a fact the model states rather than one
         the user discovers.<br><br><b>Default if you say nothing:</b> nothing changes; <code>linkedCopy</code> keeps its
         current behaviour.""" ),
    dict(k="do", t="Bring the nine boundary rules into the repo",
         b="""They are settled in <code>PROJECT - Black Box UI.md</code> and invisible to anyone reading this codebase — including the
         next agent. A <code>docs/BOUNDARY-RULES.md</code> that states them, with the prior art each one came from, is the
         cheapest high-value thing on this list and needs no design decisions at all. It is also the document that makes the two
         forks above answerable by someone other than you.""" ),
    dict(k="do", t="Vendor diagram-js's drilldown trio",
         b="""<code>Canvas</code>'s plane API, <code>DrilldownBreadcrumbs</code> and <code>DrilldownCentering</code> are MIT, small, read
         this run (the sources are on disk in the run scratchpad), and solve the exact problem that makes nested canvases painful.
         The watermark clause people remember belongs to <b>bpmn-js</b>, not to the engine. The idea worth taking is the one that
         removes work: <i>planes instead of nested coordinate spaces</i>.""" ),
    dict(k="no", t="What I deliberately did not do",
         b="""No code was written and nothing was installed — this was a research sweep and the repo is untouched. I did not re-run
         the eight dossiers whose agents wrote their files and then died on the weekly limit before returning a value; their
         markdown was complete on disk and re-running would have burned tokens to regenerate it. I did not read libavoid or its
         TypeScript ports (LGPL, standing repo rule). I did not open the 32 <code>DP -</code> per-component vault pages, and I did
         not touch the vault at all.""" ),
]

UNVERIFIED = [
    "Whether maxGraph automatically re-routes an edge to terminate at a collapsed group's visual boundary while the model keeps the child terminal — the manual describes the model behaviour, not the render behaviour. Recorded rather than assumed.",
    "diagram-js's <code>SubprocessCompatibility.js</code> handles boundary-crossing edges; the file was listed but not opened this run.",
    "React Flow UI's MIT claim rests on its own page text; no repository link was found to confirm it from a manifest.",
    "Whether <code>heap-js</code> supports decrease-key (the one operation that would make it a real alternative to <code>binaryHeap.ts</code>) was not confirmed.",
    "Whether the nine boundary rules appear anywhere in this repo — searched, not found, but the search was for filenames and headings rather than an exhaustive prose read.",
]

# ---------------------------------------------------------------------------
# CSS  (plain string — braces are literal, never .format()ed)
# ---------------------------------------------------------------------------
CSS = """
  :root {
    --bg:#0c0d10; --panel:#15171c; --panel2:#1b1e25; --line:#282d38; --line2:#343b48;
    --fg:#e8eaf0; --dim:#9aa3b2; --dim2:#6b7383;
    --accent:#f0883e; --accent2:#5aa9f8; --ok:#3fb950; --warn:#e5534b; --purple:#bc8cff;
    --mono: ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  }
  * { box-sizing:border-box }
  body { margin:0; background:var(--bg); color:var(--fg);
    font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif; }
  .wrap { max-width:1140px; margin:0 auto; padding:0 24px 110px }
  a { color:var(--accent2); text-decoration:none } a:hover { text-decoration:underline }
  code { font-family:var(--mono); font-size:.88em; background:#0009; padding:1px 5px; border-radius:4px }
  p { margin:0 0 10px }

  /* ---- hero ---- */
  .hero { padding:60px 0 12px }
  .kicker { font-size:11px; letter-spacing:.22em; text-transform:uppercase; color:var(--accent);
    font-weight:700; margin:0 0 16px }
  h1 { font-size:46px; line-height:1.06; margin:0 0 14px; letter-spacing:-.03em; max-width:900px }
  .sub { color:var(--dim); font-size:17px; margin:0 0 4px; max-width:760px }
  .sub i { color:#c3cad6 }

  /* ---- act headers ---- */
  .act { margin:88px 0 6px; display:flex; align-items:baseline; gap:14px }
  .act .n { font-size:52px; font-weight:800; letter-spacing:-.04em; color:var(--line2);
    line-height:1; font-variant-numeric:tabular-nums }
  .act h2 { font-size:27px; margin:0; letter-spacing:-.02em; font-weight:700 }
  .actsub { color:var(--dim); font-size:15.5px; margin:2px 0 26px; max-width:820px }
  h3 { margin:38px 0 10px; font-size:18px; letter-spacing:-.01em }
  h4 { margin:0 0 6px; font-size:15px }

  .facts { display:grid; grid-template-columns:repeat(auto-fit,minmax(124px,1fr)); gap:10px; margin:30px 0 8px }
  .fact { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:15px 16px }
  .fact b { display:block; font-size:28px; font-variant-numeric:tabular-nums; letter-spacing:-.03em; line-height:1.15 }
  .fact span { font-size:10.5px; color:var(--dim2); text-transform:uppercase; letter-spacing:.08em }
  .fact.hot b { color:var(--warn) } .fact.good b { color:var(--ok) }

  .lede { background:linear-gradient(180deg,#17191f,#131519); border:1px solid var(--line);
    border-left:3px solid var(--accent); border-radius:12px; padding:22px 26px; margin:28px 0 }
  .lede p:last-child { margin-bottom:0 } .lede b { color:#fff }

  /* ---- real captures ---- */
  .shot { margin:22px 0 26px }
  .shot .frame { background:#fff; border:1px solid var(--line2); border-radius:12px; padding:10px;
    overflow:hidden; box-shadow:0 10px 34px #0007 }
  .shot img { display:block; width:100%; height:auto; border-radius:6px }
  .shot .cap { display:flex; gap:12px; align-items:flex-start; margin-top:11px;
    color:var(--dim); font-size:13px; line-height:1.6 }
  .shot .cap b { color:var(--fg) }
  .realchip { flex:none; font-size:9.5px; font-weight:800; letter-spacing:.09em; text-transform:uppercase;
    color:#7ee08f; background:#12301c; border:1px solid #1d4a2b; padding:4px 8px; border-radius:99px;
    margin-top:1px; white-space:nowrap }
  .shotgrid { display:grid; grid-template-columns:1fr 1fr; gap:22px }
  @media (max-width:820px){ .shotgrid { grid-template-columns:1fr } }

  /* ---- interactive demos ---- */
  .demo { background:var(--panel); border:1px solid var(--line); border-radius:14px;
    padding:0; margin:26px 0; overflow:hidden }
  .demo .dhd { padding:16px 20px 12px; border-bottom:1px solid var(--line); background:var(--panel2) }
  .demo .dhd h4 { margin:0 0 3px; font-size:15.5px }
  .demo .dhd p { margin:0; color:var(--dim2); font-size:12.5px }
  .demo .dbody { padding:18px 20px 8px }
  .demo svg { display:block; width:100%; height:auto }
  .ctrls { display:flex; flex-wrap:wrap; gap:8px; align-items:center; padding:12px 20px 16px;
    border-top:1px solid var(--line) }
  button.b { font:600 12.5px/1 inherit; font-family:inherit; color:var(--fg); background:#242932;
    border:1px solid var(--line2); border-radius:8px; padding:9px 14px; cursor:pointer }
  button.b:hover { background:#2d333e; border-color:#454d5d }
  button.b[aria-pressed="true"] { background:#1d3c57; border-color:#2f6da3; color:#cfe6ff }
  button.b.primary { background:#3a2a17; border-color:#7a4d1f; color:#ffc794 }
  button.b.primary:hover { background:#4a351c }
  .readout { margin-left:auto; font-family:var(--mono); font-size:11.5px; color:var(--dim2); text-align:right }
  .readout b { color:var(--accent); font-weight:700 }
  .seg { display:inline-flex; border:1px solid var(--line2); border-radius:8px; overflow:hidden }
  .seg button.b { border:0; border-radius:0; border-right:1px solid var(--line2) }
  .seg button.b:last-child { border-right:0 }

  figure { margin:26px 0; background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:22px 20px 16px }
  figure svg { display:block; width:100%; height:auto }
  figcaption { color:var(--dim2); font-size:12.5px; margin-top:14px; line-height:1.65 }
  figcaption b { color:var(--dim) }

  /* ---- idiom strip ---- */
  .idioms { display:grid; grid-template-columns:repeat(auto-fit,minmax(178px,1fr)); gap:14px; margin:22px 0 }
  .idiom { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:14px 14px 12px }
  .idiom svg { display:block; width:100%; height:auto; margin-bottom:10px }
  .idiom b { display:block; font-size:12.5px; margin-bottom:2px }
  .idiom span { color:var(--dim2); font-size:11px; line-height:1.5; display:block; font-family:var(--mono) }

  /* ---- tables ---- */
  table { width:100%; border-collapse:collapse; font-size:13.5px; margin:0 0 10px }
  th { text-align:left; color:var(--dim2); text-transform:uppercase; font-size:10.5px;
    letter-spacing:.08em; padding:8px 10px; border-bottom:1px solid var(--line); font-weight:600 }
  td { padding:11px 10px; border-bottom:1px solid var(--line); vertical-align:top; color:var(--dim) }
  td b, td strong { color:var(--fg) }
  td.nm { color:var(--fg); width:196px; font-weight:600 }
  td.lic { font-size:11.5px; width:152px; color:var(--dim2) }
  .lic { font-size:11px; color:var(--dim2) }
  .vy { color:var(--ok) } .vn { color:var(--accent) } .vp { color:var(--dim2) }
  .famhd { display:flex; align-items:baseline; gap:10px; margin:38px 0 4px }
  .famhd h3 { margin:0 } .famhd span { color:var(--dim2); font-size:12px }

  .conv td.q { color:var(--fg); font-weight:600; width:176px }
  .badge { display:inline-block; font-size:10px; font-weight:700; text-transform:uppercase;
    letter-spacing:.07em; padding:3px 8px; border-radius:99px; white-space:nowrap }
  .b-same { background:#12301c; color:#7ee08f } .b-near { background:#2d2a12; color:#dcd07a }
  .b-ahead { background:#122a3d; color:#7cc0ff } .b-diff { background:#3a2f11; color:#e8c06a }
  .b-missing { background:#3d1f1c; color:#ff9a8f }

  /* ---- scorecard ---- */
  .score { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:24px 0 8px }
  @media (max-width:880px){ .score { grid-template-columns:1fr 1fr } }
  .sc { background:var(--panel); border:1px solid var(--line); border-top:3px solid var(--line); border-radius:12px; padding:16px }
  .sc.k-same { border-top-color:var(--ok) } .sc.k-ahead { border-top-color:var(--accent2) }
  .sc.k-stock { border-top-color:#e8c06a } .sc.k-missing { border-top-color:var(--warn) }
  .sc .big { font-size:34px; font-weight:800; letter-spacing:-.03em; line-height:1 }
  .sc.k-same .big { color:#7ee08f } .sc.k-ahead .big { color:#7cc0ff }
  .sc.k-stock .big { color:#e8c06a } .sc.k-missing .big { color:#ff9a8f }
  .sc .lab { font-size:12px; color:var(--fg); font-weight:600; margin:8px 0 4px }
  .sc .txt { font-size:11.5px; color:var(--dim2); line-height:1.5 }

  .bucket { background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--line);
    border-radius:12px; padding:20px 22px; margin:0 0 14px }
  .bucket.k-same { border-left-color:var(--ok) } .bucket.k-ahead { border-left-color:var(--accent2) }
  .bucket.k-stock { border-left-color:#e8c06a } .bucket.k-missing { border-left-color:var(--warn) }
  .bucket h3 { margin:0 0 4px; font-size:17px; display:flex; align-items:center; gap:10px }
  .bucket .bsub { color:var(--dim2); font-size:13px; margin:0 0 14px }
  .bucket dl { margin:0 } .bucket dt { color:var(--fg); font-size:14px; font-weight:600; margin:15px 0 3px }
  .bucket dd { margin:0; color:var(--dim); font-size:13.5px }

  .stock td.el { color:var(--fg); font-weight:600; width:200px }
  .stock tr.seam td { background:#101a12 } .stock tr.seam td.el { color:var(--ok) }

  .dec { background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--line);
    border-radius:12px; padding:18px 22px; margin:0 0 14px }
  .dec.k-ask { border-left-color:var(--accent) } .dec.k-do { border-left-color:var(--ok) }
  .dec.k-no { border-left-color:var(--dim2) }
  .dec h3 { margin:0 0 8px; font-size:16.5px }
  .dec p { color:var(--dim); font-size:14px; margin:0 }
  .dectag { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.07em;
    padding:3px 8px; border-radius:99px; margin-right:9px; vertical-align:2px }
  .t-ask { background:#3a2f11; color:#e8c06a } .t-do { background:#12301c; color:#7ee08f }
  .t-no { background:#22262e; color:var(--dim2) }

  pre { background:#08090b; border:1px solid var(--line); border-radius:10px; padding:15px 17px;
    overflow-x:auto; font-family:var(--mono); font-size:12.5px; line-height:1.65; color:#c9d1d9; margin:14px 0 }
  pre .c { color:#6b7383 } pre .k { color:#ff9a8f } pre .s { color:#7ee08f }

  /* ---- gap matrix ---- */
  .mxwrap { background:var(--panel); border:1px solid var(--line); border-radius:14px;
    padding:8px 18px 14px; margin:22px 0; overflow-x:auto }
  table.mx { width:100%; border-collapse:collapse; font-size:13px }
  table.mx th { padding:14px 6px 10px; font-size:10px; color:var(--dim2); text-transform:uppercase;
    letter-spacing:.07em; border-bottom:1px solid var(--line); text-align:center; font-weight:700 }
  table.mx th:first-child, table.mx th:nth-child(2) { text-align:left }
  table.mx td { padding:7px 6px; border-bottom:1px solid #1e222a; text-align:center; font-size:15px }
  table.mx td.mx-nm { text-align:left; width:1%; color:var(--fg); font-weight:600; font-size:13px; white-space:nowrap }
  table.mx td.mx-kind { text-align:left; width:1%; color:var(--dim2); font-size:10.5px; text-transform:uppercase;
    letter-spacing:.06em; white-space:nowrap; padding-right:16px }
  .mx-y { color:#3fb950 } .mx-p { color:#e8c06a } .mx-n { color:#39404e }
  tr.mx-ours td { background:#2a1512; border-bottom-color:#43201c }
  tr.mx-ours td.mx-nm { color:#ff9a8f } tr.mx-ours td.mx-kind { color:#c4736a }
  tr.mx-ours .mx-n { color:#7a3b34 }
  .mxlegend { margin:12px 0 2px; font-size:11.5px; color:var(--dim2) }
  .mxlegend span { font-size:14px; vertical-align:-1px }

  /* ---- proportion bars ---- */
  .licbar { display:flex; height:30px; border-radius:8px; overflow:hidden; margin:18px 0 10px;
    border:1px solid var(--line) }
  .licseg { display:flex; align-items:center; justify-content:center; font-size:11.5px;
    font-weight:800; color:#0c0d10; min-width:18px }
  .lickeys { display:flex; flex-wrap:wrap; gap:8px 18px; margin-bottom:6px }
  .lickey { font-size:11.5px; color:var(--dim); display:inline-flex; align-items:center; gap:7px }
  .lickey i { width:9px; height:9px; border-radius:2px; display:inline-block }
  .lickey b { color:var(--fg) }

  footer { margin-top:80px; padding-top:24px; border-top:1px solid var(--line);
    color:var(--dim2); font-size:12.5px; line-height:1.85 }
  footer b { color:var(--dim) }
  ul.uv { margin:8px 0 0; padding-left:18px } ul.uv li { margin:5px 0 }
"""

CSS += FB.CSS

# ---------------------------------------------------------------------------
# DEMO 1 — collapse to a black box. Operable: fold the group and watch the
# crossing edges re-terminate and the internal-only edges drop. The two edge
# policies are the ones the field actually shipped (Mermaid redirect vs
# yFiles MergingFoldingEdgeConverter).
# ---------------------------------------------------------------------------
DEMO_COLLAPSE = """
<div class="demo">
  <div class="dhd"><h4>Collapse to a black box &mdash; operate it</h4>
    <p>One geometry, two bounds, one boolean &mdash; maxGraph <code>foldCells()</code> + <code>Geometry.alternateBounds</code>. Nothing in bbox-ui does this today.</p></div>
  <div class="dbody">
    <svg id="cl-svg" viewBox="0 0 1000 300" aria-label="A group of three nodes collapsing into a single black box with derived ports">
      <defs>
        <marker id="cl-a" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 z" fill="#8b94a4"/></marker>
      </defs>
      <g id="cl-ext"></g>
      <g id="cl-edges"></g>
      <rect id="cl-box" x="330" y="60" width="340" height="180" rx="10" fill="#15181e" stroke="#4a5364"/>
      <rect id="cl-hd" x="330" y="60" width="340" height="26" rx="10" fill="#1e232c"/>
      <text id="cl-title" x="344" y="78" fill="#d7dbe3" font-size="12" font-weight="600">Perception</text>
      <g id="cl-kids"></g>
      <g id="cl-ports"></g>
    </svg>
  </div>
  <div class="ctrls">
    <button class="b primary" id="cl-toggle">Collapse &#9662;</button>
    <span class="seg" role="group" aria-label="edge policy">
      <button class="b" id="cl-redirect" aria-pressed="true">redirect each &mdash; Mermaid</button>
      <button class="b" id="cl-merge" aria-pressed="false">merge into one &mdash; yFiles</button>
    </span>
    <span class="readout" id="cl-read"></span>
  </div>
</div>
<script>
(function(){
  var S = {collapsed:false, merge:false, t:0};
  var EXT = [
    {id:'cam', x:70,  y:96,  w:110, h:30, label:'sensor'},
    {id:'imu', x:70,  y:176, w:110, h:30, label:'imu'},
    {id:'plan',x:820, y:136, w:110, h:30, label:'planner'}
  ];
  var KIDS = [
    {id:'k1', x:352, y:100, w:130, h:26, label:'camera'},
    {id:'k2', x:352, y:142, w:130, h:26, label:'detect'},
    {id:'k3', x:352, y:184, w:130, h:26, label:'track'}
  ];
  // crossing = one end outside the group; internal = both ends inside
  var EDGES = [
    {from:'cam', to:'k1', cross:true},
    {from:'imu', to:'k2', cross:true},
    {from:'k1',  to:'k2', cross:false},
    {from:'k2',  to:'k3', cross:false},
    {from:'k3',  to:'plan', cross:true}
  ];
  var svg = document.getElementById('cl-svg');
  var box = document.getElementById('cl-box'), hd = document.getElementById('cl-hd');
  var title = document.getElementById('cl-title');
  var gExt = document.getElementById('cl-ext'), gEdges = document.getElementById('cl-edges');
  var gKids = document.getElementById('cl-kids'), gPorts = document.getElementById('cl-ports');
  var EXPANDED = {x:330,y:60,w:340,h:180}, COLLAPSED = {x:420,y:132,w:160,h:40};  // alternateBounds

  function el(n,a){ var e=document.createElementNS('http://www.w3.org/2000/svg',n);
    for(var k in a) e.setAttribute(k,a[k]); return e; }
  function lerp(a,b,t){ return a+(b-a)*t; }
  function bounds(){ var t=S.t; return {
    x:lerp(EXPANDED.x,COLLAPSED.x,t), y:lerp(EXPANDED.y,COLLAPSED.y,t),
    w:lerp(EXPANDED.w,COLLAPSED.w,t), h:lerp(EXPANDED.h,COLLAPSED.h,t)}; }
  function node(g,n,fill,stroke,tc){
    g.appendChild(el('rect',{x:n.x,y:n.y,width:n.w,height:n.h,rx:6,fill:fill,stroke:stroke}));
    var t=el('text',{x:n.x+n.w/2,y:n.y+n.h/2+4,fill:tc,'font-size':11,'text-anchor':'middle'});
    t.textContent=n.label; g.appendChild(t);
  }
  function byId(id){ var a=EXT.concat(KIDS); for(var i=0;i<a.length;i++) if(a[i].id===id) return a[i]; }

  function draw(){
    var b = bounds(), t = S.t;
    box.setAttribute('x',b.x); box.setAttribute('y',b.y);
    box.setAttribute('width',b.w); box.setAttribute('height',b.h);
    hd.setAttribute('x',b.x); hd.setAttribute('y',b.y);
    hd.setAttribute('width',b.w); hd.setAttribute('height',t>0.5?b.h:26);
    title.setAttribute('x',b.x+14); title.setAttribute('y',b.y+(t>0.5?b.h/2+4:18));
    title.textContent = t>0.5 ? '\\u25B8 Perception' : 'Perception';

    gExt.textContent=''; gKids.textContent=''; gEdges.textContent=''; gPorts.textContent='';
    EXT.forEach(function(n){ node(gExt,n,'#1b1f27','#39404e','#aab2c0'); });

    gKids.setAttribute('opacity', Math.max(0, 1-t*2.2));
    if (t < 0.45) KIDS.forEach(function(n){ node(gKids,n,'#1b1f27','#39404e','#aab2c0'); });

    // where an edge end lands: its own node when expanded, the box wall when collapsed
    function anchor(id, outgoing){
      var n = byId(id), inside = KIDS.indexOf(n) >= 0;
      if (!inside) return {x: outgoing ? n.x+n.w : n.x, y:n.y+n.h/2};
      var nx = outgoing ? n.x+n.w : n.x, ny = n.y+n.h/2;
      var bx = outgoing ? b.x+b.w : b.x, by = b.y+b.h/2;
      return {x:lerp(nx,bx,t), y:lerp(ny,by,t)};
    }
    var crossing = EDGES.filter(function(e){return e.cross;});
    var merged = {};
    EDGES.forEach(function(e, i){
      var a = anchor(e.from, true), c = anchor(e.to, false);
      var op = 1;
      if (!e.cross) op = Math.max(0, 1-t*1.8);                 // internal-only: drops
      if (e.cross && S.merge && t > 0.05) {                     // merge: stack them onto one wall point
        var side = KIDS.indexOf(byId(e.to)) >= 0 ? 'in' : 'out';
        if (side === 'in') { c = {x:c.x, y:lerp(c.y, b.y+b.h/2, t)}; }
        merged[side] = true;
      }
      var mx = (a.x+c.x)/2;
      var d = 'M'+a.x+','+a.y+' C'+mx+','+a.y+' '+mx+','+c.y+' '+c.x+','+c.y;
      gEdges.appendChild(el('path',{d:d,fill:'none',stroke: e.cross?'#5aa9f8':'#e5534b',
        'stroke-width':1.6,opacity:op,'marker-end':'url(#cl-a)'}));
    });
    // the derived ports: one dot per surviving crossing edge end on the wall
    if (t > 0.35) {
      var ins  = S.merge ? 1 : crossing.filter(function(e){return KIDS.indexOf(byId(e.to))>=0;}).length;
      var outs = crossing.filter(function(e){return KIDS.indexOf(byId(e.from))>=0;}).length;
      var o = (t-0.35)/0.65;
      function dots(nn, x, colour){
        for (var i=0;i<nn;i++){
          var y = b.y + b.h*(i+1)/(nn+1);
          gPorts.appendChild(el('circle',{cx:x,cy:y,r:5,fill:colour,stroke:'#0c0d10','stroke-width':1.5,opacity:o}));
        }
      }
      dots(ins, b.x, '#5aa9f8'); dots(outs, b.x+b.w, '#3fb950');
    }
    var nIn = S.merge ? 1 : 2;
    document.getElementById('cl-read').innerHTML = S.collapsed
      ? '<b>'+(nIn+1)+'</b> derived ports &nbsp;&middot;&nbsp; 3 crossing edges kept &nbsp;&middot;&nbsp; <b>2</b> internal edges dropped'
      : '3 nodes inside &nbsp;&middot;&nbsp; 3 crossing edges &nbsp;&middot;&nbsp; 2 internal edges';
  }
  function tween(to){
    var from = S.t, t0 = null;
    function step(ts){ if(!t0) t0=ts; var k=Math.min(1,(ts-t0)/420);
      k = k<0.5 ? 2*k*k : 1-Math.pow(-2*k+2,2)/2;
      S.t = from+(to-from)*k; draw(); if(k<1) requestAnimationFrame(step); }
    requestAnimationFrame(step);
  }
  document.getElementById('cl-toggle').addEventListener('click', function(){
    S.collapsed = !S.collapsed; this.innerHTML = S.collapsed ? 'Expand \\u25B4' : 'Collapse \\u25BE';
    tween(S.collapsed ? 1 : 0);
  });
  function mode(m){ S.merge = m;
    document.getElementById('cl-redirect').setAttribute('aria-pressed', String(!m));
    document.getElementById('cl-merge').setAttribute('aria-pressed', String(m)); draw(); }
  document.getElementById('cl-redirect').addEventListener('click', function(){ mode(false); });
  document.getElementById('cl-merge').addEventListener('click', function(){ mode(true); });
  draw();
})();
</script>"""

# ---------------------------------------------------------------------------
# DEMO 2 — drill-in as a plane swap (diagram-js). Each plane draws in its own
# frame from (0,0) and remembers its own camera; the breadcrumb walks the
# semantic parent chain. Pan a plane, leave, come back: it is where you left it.
# ---------------------------------------------------------------------------
DEMO_DRILL = """
<div class="demo">
  <div class="dhd"><h4>Drill-in as a plane swap &mdash; operate it</h4>
    <p>diagram-js <code>Canvas.setRootElement()</code> + <code>DrilldownBreadcrumbs</code> + <code>DrilldownCentering</code>. MIT. Double-click a group to step in; pan it, step out, step back &mdash; the camera is where you left it.</p></div>
  <div class="dbody">
    <div id="dd-crumbs" style="font-family:var(--mono);font-size:12px;margin:0 0 10px;color:#6b7383"></div>
    <svg id="dd-svg" viewBox="0 0 1000 215" aria-label="Drilling into a subprocess swaps to its own layer with its own coordinate frame and camera">
      <defs><marker id="dd-a" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto">
        <path d="M0,0 L7,3.5 L0,7 z" fill="#8b94a4"/></marker></defs>
      <rect x="0" y="0" width="1000" height="215" fill="#0b0d10" rx="10"/>
      <g id="dd-layer"></g>
    </svg>
  </div>
  <div class="ctrls">
    <button class="b" id="dd-up">&#8593; Step out</button>
    <button class="b" id="dd-left">&#8592; Pan</button>
    <button class="b" id="dd-right">Pan &#8594;</button>
    <span class="readout" id="dd-read"></span>
  </div>
</div>
<script>
(function(){
  var PLANES = {
    root: {name:'System', nodes:[
        {id:'sensors', x:80, y:90,  w:130, h:44, label:'sensors'},
        {id:'perception', x:300, y:80, w:170, h:64, label:'Perception', group:true},
        {id:'planner', x:570, y:90, w:130, h:44, label:'planner'},
        {id:'arm', x:790, y:90, w:120, h:44, label:'arm'}],
      edges:[['sensors','perception'],['perception','planner'],['planner','arm']]},
    perception: {name:'Perception', nodes:[
        {id:'in', x:60,  y:96, w:96, h:36, label:'in \\u00b7 frame', boundary:true},
        {id:'camera', x:220, y:56, w:120, h:36, label:'camera'},
        {id:'detect', x:400, y:96, w:120, h:36, label:'detect'},
        {id:'track',  x:580, y:96, w:120, h:36, label:'track'},
        {id:'out', x:760, y:96, w:110, h:36, label:'out \\u00b7 tracks', boundary:true}],
      edges:[['in','camera'],['camera','detect'],['detect','track'],['track','out']]}
  };
  var S = {stack:['root'], cam:{root:0, perception:0}};
  var layer = document.getElementById('dd-layer');
  function el(n,a){ var e=document.createElementNS('http://www.w3.org/2000/svg',n);
    for(var k in a) e.setAttribute(k,a[k]); return e; }
  function cur(){ return S.stack[S.stack.length-1]; }
  function nodeById(p,id){ var ns=PLANES[p].nodes; for(var i=0;i<ns.length;i++) if(ns[i].id===id) return ns[i]; }

  function draw(){
    var key = cur(), P = PLANES[key], dx = S.cam[key];
    layer.textContent = '';
    var g = el('g', {transform:'translate('+dx+',0)'});
    P.edges.forEach(function(e){
      var a = nodeById(key,e[0]), b = nodeById(key,e[1]);
      var x1=a.x+a.w, y1=a.y+a.h/2, x2=b.x, y2=b.y+b.h/2, mx=(x1+x2)/2;
      g.appendChild(el('path',{d:'M'+x1+','+y1+' C'+mx+','+y1+' '+mx+','+y2+' '+x2+','+y2,
        fill:'none',stroke:'#5aa9f8','stroke-width':1.6,'marker-end':'url(#dd-a)'}));
    });
    P.nodes.forEach(function(n){
      var stroke = n.group ? '#f0883e' : (n.boundary ? '#f0883e' : '#39404e');
      var fill   = n.group ? '#241a10' : (n.boundary ? '#f0883e14' : '#1b1f27');
      var r = el('rect',{x:n.x,y:n.y,width:n.w,height:n.h,rx:7,fill:fill,stroke:stroke,
        'stroke-dasharray': n.boundary ? '4 3' : ''});
      if (n.group) { r.style.cursor='pointer';
        r.addEventListener('dblclick', function(){ S.stack.push('perception'); draw(); }); }
      g.appendChild(r);
      var t = el('text',{x:n.x+n.w/2,y:n.y+n.h/2+4,fill:n.group?'#ffc794':(n.boundary?'#f0883e':'#aab2c0'),
        'font-size':11.5,'text-anchor':'middle','pointer-events':'none'});
      t.textContent = n.label; g.appendChild(t);
      if (n.group) { var h=el('text',{x:n.x+n.w/2,y:n.y+n.h+15,fill:'#6b7383','font-size':9.5,
        'text-anchor':'middle','pointer-events':'none'}); h.textContent='double-click to step in'; g.appendChild(h); }
    });
    layer.appendChild(g);
    document.getElementById('dd-crumbs').innerHTML = S.stack.map(function(k,i){
      return i < S.stack.length-1
        ? '<a href="#" data-i="'+i+'" style="color:#5aa9f8">'+PLANES[k].name+'</a>'
        : '<span style="color:#e8eaf0">'+PLANES[k].name+'</span>'; }).join(' <span style="color:#3a4150">&#8250;</span> ');
    Array.prototype.forEach.call(document.querySelectorAll('#dd-crumbs a'), function(a){
      a.addEventListener('click', function(ev){ ev.preventDefault();
        S.stack = S.stack.slice(0, Number(this.dataset.i)+1); draw(); }); });
    document.getElementById('dd-read').innerHTML =
      'plane <b>' + key + '</b> &nbsp;&middot;&nbsp; own frame from (0,0) &nbsp;&middot;&nbsp; camera x = <b>' + dx + '</b>';
    document.getElementById('dd-up').disabled = S.stack.length < 2;
  }
  document.getElementById('dd-up').addEventListener('click', function(){
    if (S.stack.length>1){ S.stack.pop(); draw(); } });
  document.getElementById('dd-left').addEventListener('click', function(){
    S.cam[cur()] -= 60; draw(); });
  document.getElementById('dd-right').addEventListener('click', function(){
    S.cam[cur()] += 60; draw(); });
  draw();
})();
</script>"""

# ---------------------------------------------------------------------------
# DEMO 3 — definition/instance. Edit the definition and watch what the three
# shipped policies do to the instances. bbox-ui's current behaviour is the
# third button, and the point is what it does NOT tell you.
# ---------------------------------------------------------------------------
DEMO_DRIFT = """
<div class="demo">
  <div class="dhd"><h4>Edit the definition &mdash; now what happens to the instances?</h4>
    <p>Three shipped policies, two of them read from source this run. Rename the definition's output port and watch.</p></div>
  <div class="dbody">
    <svg id="df-svg" viewBox="0 0 1000 250" aria-label="One definition and three instances under three different propagation policies"></svg>
  </div>
  <div class="ctrls">
    <button class="b primary" id="df-edit">Rename <code>out</code> &rarr; <code>tracks</code> in the definition</button>
    <span class="seg" role="group" aria-label="policy">
      <button class="b" id="df-p0" aria-pressed="true">Baklava &mdash; propagate</button>
      <button class="b" id="df-p1" aria-pressed="false">ComfyUI &mdash; isolate</button>
      <button class="b" id="df-p2" aria-pressed="false">bbox-ui today</button>
    </span>
    <span class="readout" id="df-read"></span>
  </div>
</div>
<script>
(function(){
  var S = {policy:0, edited:false, custom:true};
  var svg = document.getElementById('df-svg');
  function el(n,a){ var e=document.createElementNS('http://www.w3.org/2000/svg',n);
    for(var k in a) e.setAttribute(k,a[k]); return e; }
  function card(g,x,y,w,h,title,port,accent,note,noteColour){
    g.appendChild(el('rect',{x:x,y:y,width:w,height:h,rx:9,fill:'#15181e',stroke:accent}));
    g.appendChild(el('rect',{x:x,y:y,width:w,height:24,rx:9,fill:'#1e232c'}));
    var t=el('text',{x:x+12,y:y+16,fill:'#d7dbe3','font-size':11,'font-weight':600}); t.textContent=title; g.appendChild(t);
    g.appendChild(el('circle',{cx:x+w,cy:y+h/2+6,r:5,fill:'#3fb950',stroke:'#0c0d10','stroke-width':1.5}));
    var p=el('text',{x:x+w-14,y:y+h/2+10,fill:'#9aa3b2','font-size':11,'text-anchor':'end'}); p.textContent=port; g.appendChild(p);
    if (note){ var n=el('text',{x:x+12,y:y+h+16,fill:noteColour,'font-size':10,'font-family':'monospace'});
      n.textContent=note; g.appendChild(n); }
  }
  function draw(){
    svg.textContent='';
    var g = el('g',{});
    var defPort = S.edited ? 'tracks' : 'out';
    card(g, 40, 70, 200, 78, 'Perception \\u00b7 definition', defPort, '#f0883e',
         S.edited ? 'edited just now' : 'the shared definition', '#f0883e');
    var labels, notes, colours;
    if (S.policy===0){        // Baklava: full rebuild from the template
      labels = [defPort, defPort, defPort];
      notes  = S.edited ? ['rebuilt from template','rebuilt from template','rebuilt \\u2014 local edits lost'] : ['','',''];
      colours= ['#7ee08f','#7ee08f','#ff9a8f'];
    } else if (S.policy===1){ // ComfyUI Blueprints: copy-on-instantiate
      labels = ['out','out','out'];
      notes  = S.edited ? ['isolated by design','isolated by design','isolated by design'] : ['','',''];
      colours= ['#9aa3b2','#9aa3b2','#9aa3b2'];
    } else {                  // bbox-ui today: remembers its origin, says nothing
      labels = ['out','out','out'];
      notes  = S.edited ? ['?','?','?'] : ['','',''];
      colours= ['#ff9a8f','#ff9a8f','#ff9a8f'];
    }
    for (var i=0;i<3;i++){
      var x = 420 + i*190;
      card(g, x, 70, 160, 78, 'instance ' + (i+1), labels[i], '#3a4150', notes[i], colours[i]);
      var p = el('path',{d:'M240,109 C320,109 '+(x-60)+',109 '+x+',109', fill:'none',
        stroke: S.policy===0 ? '#3fb950' : '#343b48', 'stroke-width':1.4,
        'stroke-dasharray': S.policy===0 ? '' : '4 4'});
      g.appendChild(p);
    }
    var lbl = el('text',{x:330,y:100,fill:S.policy===0?'#7ee08f':'#6b7383','font-size':10,'font-family':'monospace','text-anchor':'middle'});
    lbl.textContent = S.policy===0 ? 'live link' : 'copied once';
    g.appendChild(lbl);
    svg.appendChild(g);
    var msg = ['every instance rebuilt from the template &mdash; any edit made <i>inside</i> an instance is lost',
               'instances never change &mdash; and that is stated, documented behaviour',
               'instances never change, and <b>nothing anywhere says they diverged</b>'][S.policy];
    document.getElementById('df-read').innerHTML = S.edited ? msg : 'press the button on the left';
  }
  document.getElementById('df-edit').addEventListener('click', function(){
    S.edited = !S.edited; this.innerHTML = S.edited
      ? 'Reset the definition' : 'Rename <code>out</code> &rarr; <code>tracks</code> in the definition';
    draw(); });
  [0,1,2].forEach(function(i){
    document.getElementById('df-p'+i).addEventListener('click', function(){
      S.policy = i; [0,1,2].forEach(function(j){
        document.getElementById('df-p'+j).setAttribute('aria-pressed', String(i===j)); });
      draw(); }); });
  draw();
})();
</script>"""

# ---------------------------------------------------------------------------
# The idiom strip — how each library actually DRAWS a port. Same node, eight
# house styles, redrawn to scale. This is the convergence argument made
# visually: everybody landed on a dot or a stub on a wall, addressed by id.
# ---------------------------------------------------------------------------
def idiom(svg: str, name: str, note: str) -> str:
    return f'<div class="idiom"><svg viewBox="0 0 200 92" aria-hidden="true">{svg}</svg><b>{name}</b><span>{note}</span></div>'


BODY = ('<rect x="56" y="24" width="88" height="46" rx="6" fill="#1b1f27" stroke="#4a5364"/>'
        '<text x="100" y="52" fill="#8b94a4" font-size="10" text-anchor="middle">node</text>')

IDIOMS = "".join([
    idiom(BODY +
          '<rect x="50" y="34" width="8" height="8" rx="1.5" fill="#5aa9f8"/>'
          '<rect x="50" y="52" width="8" height="8" rx="1.5" fill="#5aa9f8"/>'
          '<rect x="142" y="43" width="8" height="8" rx="1.5" fill="#3fb950"/>',
          "React Flow", "&lt;Handle id type position&gt;"),
    idiom(BODY +
          '<circle cx="56" cy="38" r="5" fill="none" stroke="#5aa9f8" stroke-width="1.6"/>'
          '<circle cx="56" cy="56" r="5" fill="none" stroke="#5aa9f8" stroke-width="1.6"/>'
          '<circle cx="144" cy="47" r="5" fill="none" stroke="#3fb950" stroke-width="1.6"/>'
          '<text x="100" y="86" fill="#4a5364" font-size="8" text-anchor="middle">ports.groups.in / .out</text>',
          "JointJS", "port group + layout fn"),
    idiom(BODY +
          '<rect x="46" y="32" width="12" height="7" fill="#5aa9f8"/>'
          '<rect x="46" y="55" width="12" height="7" fill="#5aa9f8"/>'
          '<rect x="142" y="43" width="12" height="7" fill="#3fb950"/>',
          "litegraph", "slots, index-addressed"),
    idiom(BODY +
          '<circle cx="56" cy="34" r="4.5" fill="#bc8cff"/><circle cx="56" cy="47" r="4.5" fill="#bc8cff"/>'
          '<circle cx="56" cy="60" r="4.5" fill="#bc8cff"/>'
          '<circle cx="144" cy="47" r="4.5" fill="#e8c06a"/>'
          '<text x="100" y="86" fill="#4a5364" font-size="8" text-anchor="middle">colour = socket type</text>',
          "Blender", "typed sockets"),
    idiom('<rect x="56" y="24" width="88" height="46" rx="2" fill="#1b1f27" stroke="#4a5364"/>'
          '<line x1="56" y1="36" x2="56" y2="36" stroke="#5aa9f8"/>'
          '<rect x="56" y="28" width="10" height="9" fill="#2b3442" stroke="#5aa9f8" stroke-width="0.8"/>'
          '<rect x="56" y="40" width="10" height="9" fill="#2b3442" stroke="#5aa9f8" stroke-width="0.8"/>'
          '<rect x="56" y="52" width="10" height="9" fill="#2b3442" stroke="#5aa9f8" stroke-width="0.8"/>'
          '<rect x="134" y="34" width="10" height="9" fill="#2b3442" stroke="#3fb950" stroke-width="0.8"/>'
          '<rect x="134" y="46" width="10" height="9" fill="#2b3442" stroke="#3fb950" stroke-width="0.8"/>'
          '<text x="100" y="86" fill="#4a5364" font-size="8" text-anchor="middle">required / recommended / optional</text>',
          "LabVIEW", "connector pane grid"),
    idiom(BODY +
          '<path d="M36,38 H56" stroke="#5aa9f8" stroke-width="1.4"/>'
          '<path d="M36,56 H56" stroke="#5aa9f8" stroke-width="1.4"/>'
          '<path d="M144,47 H166" stroke="#3fb950" stroke-width="1.4"/>'
          '<path d="M30,34 l6,4 -6,4 z" fill="#5aa9f8"/><path d="M30,52 l6,4 -6,4 z" fill="#5aa9f8"/>'
          '<text x="100" y="86" fill="#4a5364" font-size="8" text-anchor="middle">Inport / Outport blocks</text>',
          "Simulink", "interface is a block inside"),
    idiom(BODY +
          '<circle cx="56" cy="38" r="4" fill="#5aa9f8"/><circle cx="56" cy="56" r="4" fill="#5aa9f8"/>'
          '<circle cx="144" cy="47" r="4" fill="#3fb950"/>'
          '<path d="M46,30 V64" stroke="#e8c06a" stroke-width="1" stroke-dasharray="2 2"/>'
          '<text x="100" y="86" fill="#4a5364" font-size="8" text-anchor="middle">FIXED_SIDE &#8594; FIXED_POS</text>',
          "ELK", "a constraint ladder"),
    idiom('<rect x="56" y="24" width="88" height="46" rx="6" fill="#1b1f27" stroke="#f0883e"/>'
          '<circle cx="56" cy="38" r="5" fill="none" stroke="#f0883e" stroke-width="2"/>'
          '<circle cx="56" cy="38" r="1.8" fill="#f0883e"/>'
          '<circle cx="56" cy="56" r="5" fill="none" stroke="#8b94a4" stroke-width="2"/>'
          '<circle cx="144" cy="47" r="5" fill="none" stroke="#3fb950" stroke-width="2"/>'
          '<circle cx="144" cy="47" r="1.8" fill="#3fb950"/>'
          '<text x="100" y="86" fill="#4a5364" font-size="8" text-anchor="middle">state in the ring, not the fill</text>',
          "bbox-ui", "PortEdge rail on a wall"),
])

# ---------------------------------------------------------------------------
# SVG — the four ways an inside becomes an outside interface
# ---------------------------------------------------------------------------
def _panel(x, title, vote, votecolor, body):
    return f"""
  <g>
    <rect x="{x}" y="6" width="240" height="252" rx="10" fill="#15171c" stroke="#282d38"/>
    <text x="{x+16}" y="28" fill="#e6e8ee" font-size="12.5" font-weight="700">{title}</text>
    {body}
    <text x="{x+16}" y="245" fill="{votecolor}" font-size="11.5" font-weight="700">{vote}</text>
  </g>"""


SVG_MECHANISMS = f"""
<svg viewBox="0 0 1040 268" xmlns="http://www.w3.org/2000/svg" role="img"
     aria-label="Four mechanisms by which a subgraph's inside becomes its outside interface">
  <defs>
    <marker id="ar" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 z" fill="#6b7383"/></marker>
    <marker id="ara" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 z" fill="#f0883e"/></marker>
  </defs>
  {_panel(10, "Derived at fold time", "3 tools &#183; Blender, Max/MSP, Grasshopper", "#9aa3b2", '''
    <rect x="34" y="48" width="118" height="84" rx="6" fill="none" stroke="#6b7383" stroke-dasharray="4 3"/>
    <rect x="48" y="60" width="42" height="22" rx="4" fill="#1b1f27" stroke="#39404e"/>
    <rect x="96" y="96" width="42" height="22" rx="4" fill="#1b1f27" stroke="#39404e"/>
    <path d="M34,71 H18" stroke="#5aa9f8" stroke-width="1.5"/>
    <path d="M34,107 H18" stroke="#5aa9f8" stroke-width="1.5"/>
    <path d="M152,107 H168" stroke="#3fb950" stroke-width="1.5"/>
    <text x="172" y="82" fill="#6b7383" font-size="9.5" font-family="monospace">wires</text>
    <text x="172" y="94" fill="#6b7383" font-size="9.5" font-family="monospace">crossing</text>
    <path d="M93,140 V158" stroke="#6b7383" stroke-width="1.4" marker-end="url(#ar)"/>
    <rect x="52" y="166" width="82" height="46" rx="6" fill="#15181e" stroke="#3a4150"/>
    <text x="93" y="194" fill="#d7dbe3" font-size="10.5" text-anchor="middle">Group</text>
    <circle cx="52" cy="180" r="4" fill="#5aa9f8"/><circle cx="52" cy="198" r="4" fill="#5aa9f8"/>
    <circle cx="134" cy="189" r="4" fill="#3fb950"/>
  ''')}
  {_panel(268, "Boundary node placed inside", "7 of 11 &#183; the field's answer", "#f0883e", '''
    <rect x="292" y="56" width="192" height="126" rx="8" fill="#15181e" stroke="#3a4150"/>
    <rect x="292" y="56" width="192" height="22" rx="8" fill="#1b1f27" stroke="none"/>
    <text x="303" y="71" fill="#d7dbe3" font-size="10.5" font-weight="600">Subnet</text>
    <rect x="304" y="96" width="42" height="24" rx="5" fill="#f0883e14" stroke="#f0883e" stroke-dasharray="3 2"/>
    <text x="325" y="112" fill="#f0883e" font-size="9" text-anchor="middle" font-weight="700">IN</text>
    <rect x="364" y="96" width="48" height="24" rx="5" fill="#1b1f27" stroke="#39404e"/>
    <text x="388" y="112" fill="#aab2c0" font-size="9" text-anchor="middle">work</text>
    <rect x="430" y="96" width="42" height="24" rx="5" fill="#f0883e14" stroke="#f0883e" stroke-dasharray="3 2"/>
    <text x="451" y="112" fill="#f0883e" font-size="9" text-anchor="middle" font-weight="700">OUT</text>
    <path d="M346,108 H362" stroke="#5aa9f8" stroke-width="1.5"/>
    <path d="M412,108 H428" stroke="#5aa9f8" stroke-width="1.5"/>
    <path d="M292,108 H278" stroke="#5aa9f8" stroke-width="1.5"/>
    <path d="M484,108 H498" stroke="#3fb950" stroke-width="1.5"/>
    <text x="303" y="146" fill="#6b7383" font-size="9.5" font-family="monospace">the interface IS a node:</text>
    <text x="303" y="160" fill="#6b7383" font-size="9.5" font-family="monospace">select it, rename it,</text>
    <text x="303" y="174" fill="#6b7383" font-size="9.5" font-family="monospace">reorder it, delete it</text>
    <path d="M388,196 V214" stroke="#f0883e" stroke-width="1.4" marker-end="url(#ara)"/>
    <text x="388" y="228" fill="#f0883e" font-size="10" text-anchor="middle" font-weight="600">reuses Block + Port</text>
  ''')}
  {_panel(526, "Authored in a side panel", "1 tool &#183; Houdini Type Properties", "#9aa3b2", '''
    <rect x="550" y="62" width="86" height="72" rx="7" fill="#15181e" stroke="#3a4150"/>
    <text x="593" y="102" fill="#d7dbe3" font-size="10.5" text-anchor="middle">HDA</text>
    <circle cx="550" cy="82" r="4" fill="#5aa9f8"/><circle cx="550" cy="102" r="4" fill="#5aa9f8"/>
    <circle cx="636" cy="92" r="4" fill="#3fb950"/>
    <path d="M644,98 H664" stroke="#6b7383" stroke-width="1.3" stroke-dasharray="3 3" marker-end="url(#ar)"/>
    <rect x="668" y="56" width="88" height="96" rx="6" fill="#1b1e25" stroke="#39404e"/>
    <text x="678" y="72" fill="#9aa3b2" font-size="9" font-weight="700">Type Properties</text>
    <rect x="678" y="80" width="68" height="13" rx="3" fill="#0b0d10"/>
    <rect x="678" y="97" width="68" height="13" rx="3" fill="#0b0d10"/>
    <rect x="678" y="114" width="68" height="13" rx="3" fill="#0b0d10"/>
    <text x="678" y="144" fill="#6b7383" font-size="9" font-family="monospace">+ add parm</text>
    <text x="550" y="182" fill="#6b7383" font-size="9.5" font-family="monospace">promotion keeps a</text>
    <text x="550" y="196" fill="#6b7383" font-size="9.5" font-family="monospace">live link; editable</text>
    <text x="550" y="210" fill="#6b7383" font-size="9.5" font-family="monospace">from any instance</text>
  ''')}
  {_panel(784, "Reference only &mdash; no interface", "2 tools &#183; n8n, Langflow", "#9aa3b2", '''
    <rect x="808" y="76" width="106" height="44" rx="7" fill="#15181e" stroke="#3a4150"/>
    <text x="861" y="96" fill="#d7dbe3" font-size="10" text-anchor="middle">Execute</text>
    <text x="861" y="109" fill="#6b7383" font-size="9" text-anchor="middle" font-family="monospace">flow #42</text>
    <circle cx="808" cy="98" r="4" fill="#5aa9f8"/><circle cx="914" cy="98" r="4" fill="#3fb950"/>
    <path d="M922,98 H948" stroke="#6b7383" stroke-width="1.3" stroke-dasharray="3 3" marker-end="url(#ar)"/>
    <rect x="952" y="70" width="52" height="58" rx="4" fill="#1b1e25" stroke="#39404e" stroke-dasharray="4 3"/>
    <text x="978" y="103" fill="#6b7383" font-size="9" text-anchor="middle">other</text>
    <text x="978" y="115" fill="#6b7383" font-size="9" text-anchor="middle">document</text>
    <text x="808" y="160" fill="#6b7383" font-size="9.5" font-family="monospace">nothing to select,</text>
    <text x="808" y="174" fill="#6b7383" font-size="9.5" font-family="monospace">nothing to rename &#8212;</text>
    <text x="808" y="188" fill="#6b7383" font-size="9.5" font-family="monospace">a call, not a graph</text>
  ''')}
</svg>"""

SVG_DRIFT = """
<svg viewBox="0 0 1040 196" xmlns="http://www.w3.org/2000/svg" role="img"
     aria-label="Definition-instance sharing: the two states the field occupies, and the unnamed third state bbox-ui is in">
  <line x1="60" y1="96" x2="980" y2="96" stroke="#282d38" stroke-width="2"/>
  <circle cx="150" cy="96" r="8" fill="#3fb950"/>
  <text x="150" y="70" fill="#7ee08f" font-size="12.5" font-weight="700" text-anchor="middle">Never drifts</text>
  <text x="150" y="126" fill="#9aa3b2" font-size="11" text-anchor="middle">true shared reference</text>
  <text x="150" y="144" fill="#6b7383" font-size="10" text-anchor="middle" font-family="monospace">Blender data-block &#183; Nuke Gizmo</text>
  <text x="150" y="158" fill="#6b7383" font-size="10" text-anchor="middle" font-family="monospace">Max Abstraction &#183; TD .tox &#183; Baklava</text>
  <circle cx="880" cy="96" r="8" fill="#3fb950"/>
  <text x="880" y="70" fill="#7ee08f" font-size="12.5" font-weight="700" text-anchor="middle">Drifts, and says so</text>
  <text x="880" y="126" fill="#9aa3b2" font-size="11" text-anchor="middle">named state + a repair verb</text>
  <text x="880" y="144" fill="#6b7383" font-size="10" text-anchor="middle" font-family="monospace">Houdini: locked / unlocked</text>
  <text x="880" y="158" fill="#6b7383" font-size="10" text-anchor="middle" font-family="monospace">&#8220;Match Current Definition&#8221;</text>
  <circle cx="515" cy="96" r="9" fill="#e5534b"/>
  <path d="M515,96 L515,44" stroke="#e5534b" stroke-width="1.5" stroke-dasharray="3 3"/>
  <text x="515" y="34" fill="#ff9a8f" font-size="12.5" font-weight="700" text-anchor="middle">bbox-ui today &#8212; an unnamed third state</text>
  <text x="515" y="128" fill="#9aa3b2" font-size="11" text-anchor="middle">a copy that remembers its origin,</text>
  <text x="515" y="145" fill="#9aa3b2" font-size="11" text-anchor="middle">with no sync behaviour and no vocabulary for divergence</text>
  <text x="515" y="166" fill="#6b7383" font-size="10" text-anchor="middle" font-family="monospace">scene.ts &#8212; definitionId, linkedCopy(), linkedCopies()</text>
  <text x="60" y="186" fill="#6b7383" font-size="10.5">Every surveyed tool that shipped reuse sits at one end or the other. Nothing ships silent divergence.</text>
</svg>"""

DRILLDOWN_CODE = """<pre><span class="c">// diagram-js, lib/core/Canvas.js &mdash; MIT. Fetched and read this run; the</span>
<span class="c">// file is on disk in the sweep scratchpad. Drill-in is a LAYER SWAP, not a</span>
<span class="c">// camera move: every plane draws in its own frame from (0,0), so the</span>
<span class="c">// nested-coordinate maths never has to exist at all.</span>

Canvas.prototype.addRootElement = <span class="k">function</span>(rootElement) {
  <span class="k">const</span> layerName = rootElement.layer = <span class="s">'root-'</span> + idx;
  <span class="k">this</span>.hideLayer(layerName);
  <span class="k">this</span>._planes.push({ rootElement, layer });
};

<span class="c">// ...and the breadcrumb's click handler is one line:</span>
canvas.setRootElement(parentPlane);       <span class="c">// DrilldownBreadcrumbs.js:124</span>

<span class="c">// DrilldownCentering.js keeps a Map keyed by root element holding</span>
<span class="c">// {x, y, zoom} per plane &mdash; so stepping back out returns you to exactly</span>
<span class="c">// where you left, not to a recomputed fit-to-view. ~60 lines.</span></pre>"""

# ---------------------------------------------------------------------------
# THE GAP MATRIX — every surveyed tool against the five hierarchy mechanisms.
# Sourced from the dossiers (lib-dcc's taxonomy, lib-maxgraph §3,
# lib-eclipse-elk's drilldown read, lib-executable's Baklava/litegraph reads,
# lib-commercial's yFiles folding read, lib-xyflow's confirmed absences).
#   y = ships it   p = partial / scoped   n = does not
# ---------------------------------------------------------------------------
MATRIX_COLS = ["Fold to a box", "Drill in", "Derived interface", "Reusable definition", "Names its drift"]
MATRIX = [
    ("Houdini",          "desktop", "yyyyy"),
    ("Blender",          "desktop", "yyyyn"),
    ("Unreal Blueprints","desktop", "yyyyn"),
    ("Nuke",             "desktop", "yyyyn"),
    ("Max/MSP",          "desktop", "yyyyn"),
    ("TouchDesigner",    "desktop", "yyyyn"),
    ("Substance Designer","desktop","yyyyn"),
    ("Grasshopper",      "desktop", "yyypn"),
    ("Node-RED",         "web app", "yyyyn"),
    ("n8n · Langflow",   "web app", "nnnyn"),
    ("Baklava.js",       "library", "yyyyn"),
    ("litegraph · ComfyUI","library","yyyyn"),
    ("maxGraph · draw.io","library","yynnn"),
    ("yFiles",           "library", "yypnn"),
    ("diagram-js",       "library", "yynnn"),
    ("AntV X6 · G6",     "library", "ynnnn"),
    ("JointJS",          "library", "nnnnn"),
    ("React Flow",       "library", "nnnnn"),
    ("bbox-ui",          "ours",    "nnnpn"),
]


def matrix_html() -> str:
    head = "".join(f"<th>{c}</th>" for c in MATRIX_COLS)
    rows = []
    for name, kind, cells in MATRIX:
        ours = kind == "ours"
        tds = ""
        for ch in cells:
            cls = {"y": "mx-y", "p": "mx-p", "n": "mx-n"}[ch]
            mark = {"y": "&#9679;", "p": "&#9681;", "n": "&#9675;"}[ch]
            tds += f'<td class="{cls}">{mark}</td>'
        rows.append(f'<tr class="{"mx-ours" if ours else ""}"><td class="mx-nm">{name}</td>'
                    f'<td class="mx-kind">{kind}</td>{tds}</tr>')
    return ('<div class="mxwrap"><table class="mx"><tr><th>Tool</th><th></th>' + head + "</tr>"
            + "".join(rows) + "</table>"
            '<p class="mxlegend"><span class="mx-y">&#9679;</span> ships it &nbsp; '
            '<span class="mx-p">&#9681;</span> partial or scoped &nbsp; '
            '<span class="mx-n">&#9675;</span> does not</p></div>')


# licence landscape — what this reference set can actually be borrowed from
def lic_class(lic: str) -> str:
    l = lic.lower()
    if "commercial" in l and "mit" not in l: return "Commercial — read the docs, imitate"
    if "source-available" in l: return "Source-available — key required"
    if "gpl" in l or "epl" in l or "mpl" in l: return "Copyleft / weak copyleft"
    if "spec" in l or "ieee" in l or "omg" in l: return "Open specification"
    return "Permissive — MIT / Apache / BSD"


LIC_ORDER = ["Permissive — MIT / Apache / BSD", "Copyleft / weak copyleft", "Open specification",
             "Source-available — key required", "Commercial — read the docs, imitate"]
LIC_COLOUR = {LIC_ORDER[0]: "#3fb950", LIC_ORDER[1]: "#e8c06a", LIC_ORDER[2]: "#bc8cff",
              LIC_ORDER[3]: "#f0883e", LIC_ORDER[4]: "#e5534b"}


def lic_bar() -> str:
    counts = {k: 0 for k in LIC_ORDER}
    for _n, _b, items in FAMILIES:
        for it in items:
            counts[lic_class(it["lic"])] += 1
    total = sum(counts.values())
    segs, keys = "", ""
    for k in LIC_ORDER:
        if not counts[k]: continue
        pct = counts[k] / total * 100
        segs += (f'<span class="licseg" style="width:{pct:.2f}%;background:{LIC_COLOUR[k]}" '
                 f'title="{k}: {counts[k]}">{counts[k]}</span>')
        keys += (f'<span class="lickey"><i style="background:{LIC_COLOUR[k]}"></i>{k} '
                 f'<b>{counts[k]}</b></span>')
    return f'<div class="licbar">{segs}</div><div class="lickeys">{keys}</div>'


# convergence verdict distribution
def verdict_bar() -> str:
    order = [("same", "converged", "#3fb950"), ("near", "nearly", "#dcd07a"),
             ("ahead", "ahead", "#5aa9f8"), ("diff", "deliberately different", "#e8c06a"),
             ("missing", "absent", "#e5534b")]
    total = len(CONVERGENCE)
    segs, keys = "", ""
    for key, label, colour in order:
        n = sum(1 for c in CONVERGENCE if c["verdict"] == key)
        if not n: continue
        segs += (f'<span class="licseg" style="width:{n/total*100:.2f}%;background:{colour}">{n}</span>')
        keys += f'<span class="lickey"><i style="background:{colour}"></i>{label} <b>{n}</b></span>'
    return f'<div class="licbar">{segs}</div><div class="lickeys">{keys}</div>'

# ---------------------------------------------------------------------------
# Renderers
# ---------------------------------------------------------------------------
def shot(name: str, title: str, body: str, story: str) -> str:
    return (f'<div class="shot"><div class="frame"><img alt="{html.escape(title)}" src="{cap(name)}"></div>'
            f'<div class="cap"><span class="realchip">real render</span><div><b>{title}</b> &mdash; {body}'
            f'<div class="lic" style="margin-top:5px">{story}</div></div></div></div>')


def vault_mark(v: str) -> str:
    return {"y": '<span class="vy">&#9679; in vault</span>',
            "n": '<span class="vn">&#9675; new here</span>',
            "partial": '<span class="vp">&#9681; partial</span>'}[v]


def fam_table(items) -> str:
    rows = []
    for it in items:
        docs, src = it["docs"], it["src"]
        link = f'<a href="{docs}">docs</a>' if docs.startswith("http") else '<span class="vp">&mdash;</span>'
        slink = f' &middot; <a href="{src}">source</a>' if src.startswith("http") else ""
        rows.append(f'<tr><td class="nm">{it["name"]}<div class="lic" style="margin-top:4px">{link}{slink}</div></td>'
                    f'<td class="lic">{it["lic"]}<div style="margin-top:6px">{vault_mark(it["vault"])}</div></td>'
                    f'<td>{it["read"]}</td></tr>')
    return ('<table><tr><th>Library</th><th>Licence &middot; vault</th>'
            '<th>What this sweep read it for</th></tr>' + "".join(rows) + "</table>")


def conv_table() -> str:
    rows = [f'<tr><td class="q">{c["q"]}</td><td>{c["agree"]}<div class="lic" style="margin-top:6px">{c["who"]}</div></td>'
            f'<td>{c["bbox"]}</td><td><span class="badge b-{c["verdict"]}">{c["verdict"]}</span></td></tr>'
            for c in CONVERGENCE]
    return ('<table class="conv"><tr><th>Design question</th><th>What the field converged on</th>'
            '<th>bbox-ui</th><th></th></tr>' + "".join(rows) + "</table>")


def scorecard() -> str:
    meta = {"same": ("Converged", "already agree with the field"),
            "ahead": ("Ahead or deliberate", "different on purpose"),
            "stock": ("Has a stock part", "small, real, adoptable"),
            "missing": ("Missing entirely", "the hierarchy layer")}
    out = []
    for key, _t, _s, items in BUCKETS:
        lab, txt = meta[key]
        out.append(f'<div class="sc k-{key}"><div class="big">{len(items)}</div>'
                   f'<div class="lab">{lab}</div><div class="txt">{txt}</div></div>')
    return '<div class="score">' + "".join(out) + "</div>"


def buckets_html() -> str:
    label = {"same": "b-same", "ahead": "b-ahead", "stock": "b-diff", "missing": "b-missing"}
    return "".join(
        f'<div class="bucket k-{k}"><h3>{t}<span class="badge {label[k]}">{len(items)}</span></h3>'
        f'<p class="bsub">{sub}</p><dl>' + "".join(f"<dt>{a}</dt><dd>{b}</dd>" for a, b in items) + "</dl></div>"
        for k, t, sub, items in BUCKETS)


def stock_table() -> str:
    rows = [f'<tr{" class=seam" if "Unchanged" in s["el"] else ""}><td class="el">{s["el"]}</td>'
            f'<td>{s["today"]}</td><td>{s["part"]}</td><td>{s["keep"]}</td></tr>' for s in STOCK]
    return ('<table class="stock"><tr><th>Element</th><th>Today</th>'
            '<th>Off-the-shelf part, by its exact exported name</th>'
            '<th>Behaviour that must survive</th></tr>' + "".join(rows) + "</table>")


def libstruct_html() -> str:
    return "".join(f'<div class="dec k-do" style="border-left-color:var(--accent2)"><h3>{d["t"]}</h3>'
                   f'<p class="lic" style="margin:0 0 8px">{d["who"]}</p><p>{d["b"]}</p></div>' for d in LIBSTRUCT)


def decisions_html() -> str:
    """Each decision carries its own feedback strip — these are the rows that
    literally ask Zach a question, so answering in place beats a reply that has
    to restate which fork it is about."""
    names = {"ask": "Needs you", "do": "Do next", "no": "Not done"}
    out = []
    for n, d in enumerate(DECISIONS, 1):
        plain = re.sub(r"<[^>]+>", "", d["t"])
        out.append(f'<div class="dec k-{d["k"]}"><h3><span class="dectag t-{d["k"]}">{names[d["k"]]}</span>{d["t"]}</h3>'
                   f'<p>{d["b"]}</p>' + FB.strip(n, plain, noun="decision") + "</div>")
    return "".join(out)


LIB_COUNT = sum(len(items) for _, _, items in FAMILIES)
fam_html = "".join(
    f'<div class="famhd"><h3>{name}</h3><span>{len(items)} entries</span></div>'
    f'<p style="color:var(--dim);font-size:13.5px;margin:0 0 12px;max-width:840px">{blurb}</p>' + fam_table(items)
    for name, blurb, items in FAMILIES)

HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Node-editor prior art — the exhaustive sweep, 2026-09-17</title>
<style>{CSS}</style></head>
<body><div class="wrap">

<div class="hero">
  <p class="kicker">bbox-ui &middot; prior-art sweep &middot; 17 dossiers &middot; 2026-09-17</p>
  <h1>Everything already exists. Except the one thing you said was missing.</h1>
  <p class="sub"><i>&ldquo;there is so so so much prior art here we definitely don't need to reinvent
  anything&rdquo;</i> &mdash; true, and the sweep found nothing you hand-roll that has a vendorable
  stock part.</p>
  <p class="sub"><i>&ldquo;almost all the stuff I have done so far though has mostly just been on the
  still flat 2D level!!!!&rdquo;</i> &mdash; also true. That one is the finding.</p>
</div>

<div class="facts">
  <div class="fact"><b>{LIB_COUNT}</b><span>Reference entries</span></div>
  <div class="fact"><b>17</b><span>Research dossiers</span></div>
  <div class="fact"><b>390</b><span>Vault notes swept</span></div>
  <div class="fact"><b>{len(CONVERGENCE)}</b><span>Convergences</span></div>
  <div class="fact good"><b>0</b><span>Parts worth vendoring</span></div>
  <div class="fact hot"><b>0</b><span>Hits for &ldquo;black-box&rdquo;</span></div>
  <div class="fact hot"><b>9</b><span>Rules only in Obsidian</span></div>
</div>

<div class="lede">
<p><b>The whole report in four sentences.</b> Nine candidate stock parts were checked against
~16,000 lines of hand-rolled geometry &mdash; <code>elkjs</code>, <code>dagre</code>, libavoid,
JointJS's <code>manhattan</code>, <code>tinyqueue</code> and four more &mdash; and every one came
back <i>keep ours</i>, for a stated reason. A repo-wide search for <code>black-box</code>,
<code>drill-in</code>, <code>collapse-to</code> and <code>interface-deriv*</code> under
<code>apps/storybook-basics/src</code> returns <b>zero hits</b>. Meanwhile
<code>PROJECT&nbsp;-&nbsp;Black&nbsp;Box&nbsp;UI.md</code> already carries nine boundary rules you
settled, which live in Obsidian and nowhere in this codebase. And the mechanism is not an open
problem: eleven shipping tools answered it decades ago, and one MIT library &mdash; whose source
this sweep read in full &mdash; implements it end to end.</p>
</div>

<div class="act"><span class="n">01</span><h2>The gap, operable</h2></div>
<p class="actsub">Three mechanisms the field settled and bbox-ui has none of. Each one below is
live &mdash; press the buttons. Nothing here exists in the repo yet, which is exactly why it is
drawn rather than described.</p>

{DEMO_COLLAPSE}
{DEMO_DRILL}
{DEMO_DRIFT}

<h3>Who ships what &mdash; the whole finding in one grid</h3>
<p style="color:var(--dim);max-width:860px">Nineteen tools against the five mechanisms a hierarchical
black box actually needs. Read the bottom row.</p>
{matrix_html()}
<p style="color:var(--dim2);font-size:12.5px;max-width:860px">Houdini is the only full row in the survey.
The <i>Names its drift</i> column is nearly empty everywhere &mdash; which is why fork 2 below is a real
question and not a solved one. bbox-ui's single half-mark is <code>definitionId</code>: identity without
any of the behaviour that normally comes with it.</p>

<h3>Where the interface comes from &mdash; four answers, one supermajority</h3>
<figure>{SVG_MECHANISMS}
<figcaption><b>Eleven shipping desktop tools, one question.</b> Derive-at-fold is one gesture but the
interface becomes an accident of the selection. The boundary node placed inside &mdash; Houdini Subnet
Input/Output, Unreal tunnel nodes, Nuke Input, TouchDesigner In/Out, Node-RED's grey squares, Max/MSP
inlet/outlet &mdash; makes the interface an ordinary, selectable, renameable object. Baklava.js proves
the two are the same answer: its <code>GraphTemplate.inputs</code> is <i>derived</i>, by filtering the
template's own nodes for <code>GraphInputNode</code>/<code>GraphOutputNode</code>.</figcaption></figure>

<figure>{SVG_DRIFT}
<figcaption><b>Nobody ships silent divergence.</b> Grasshopper is explicit that cluster entanglement is
document-scoped; Houdini is the only surveyed tool with a named divergence-and-repair vocabulary.
<code>linkedCopy</code> sits between the two ends with no vocabulary for the state it is in.</figcaption></figure>

<h3>The trick that removes the work</h3>
<p style="color:var(--dim);max-width:840px">Nested canvases are painful because of the coordinate maths.
diagram-js sidesteps it entirely, and the engine that does so is plain MIT &mdash; the watermark clause
people remember belongs to <code>bpmn-js</code>, the notation layer on top, not to the engine.</p>
{DRILLDOWN_CODE}

<div class="act"><span class="n">02</span><h2>What you already have</h2></div>
<p class="actsub">Every image below is a real render from this lane's own Storybook, captured this run
on port 5477 &mdash; not a mock, and never your :5421. This is the flat 2D layer you called solved,
and it mostly is.</p>

{shot("view-matrix", "The S/P/E ladder — Simple, Port·inline, Port·offset, Expanded",
      "the rung you said nobody documents: <i>ports shown, innards hidden</i>. React Flow UI's whole registry "
      "has no equivalent; neither does JointJS. Same ports in all four, live — only the view rule changes.",
      "Blocks/BlockPort › View Matrix")}

<div class="shotgrid">
{shot("tidy", "Five parallel cables, before and after Tidy",
      "the obstacle-aware channel assignment React Flow simply does not have. <code>elbow/*</code> is ported "
      "verbatim from Excalidraw with a runnable provenance test; <code>trace.tidy.ts</code> is the SystemSketch pass over it.",
      "Trace/Tidy › Tidy Shared Corridor")}
{shot("elbow", "The elbow router, with pins",
      "JointJS's <code>manhattan</code> is the only open-source peer in the survey. Nine stock parts were "
      "weighed against this pipeline; every verdict was keep ours.",
      "Trace/Elbow › Elbow And Multi Elbow")}
{shot("grouping", "Port grouping — the mini-language",
      "<code>groups</code> lives on the edge, never on the port, parsed by <code>parseGroupSyntax</code> into slots. "
      "JointJS, X6 and ELK have nothing equivalent. This one is genuinely yours.",
      "Ports/PortEdge › Grouped Spacing")}
{shot("lane", "The port lane — identity across a text edit",
      "<code>portLane.ts</code>'s LCS reconcile keeps a port's id through a rename. Baklava protects the same "
      "property with <code>graphInterfaceId</code>; you arrived there independently.",
      "Blocks/BlockPort/Lane › Lane Gallery")}
{shot("routings", "The routing vocabulary",
      "straight · slanted · curved · elbow — the same four families React Flow, JointJS and X6 ship "
      "under near-identical names. Converged.",
      "Trace/Routing › Routings")}
{shot("scene", "One scene record driving real wires",
      "<code>scene.ts</code> imports <b>nothing</b> — verified, zero import statements — and a "
      "<code>tsc</code>-gated test proves its records assign to React Flow's published types with no cast.",
      "Blocks/Scene › Scene Driven")}
</div>

{shot("mixed-views", "One canvas, three blocks, three different views",
      "the same wires land correctly whether a block is drawn Simple, Port or Expanded — the view rule is a "
      "projection over one record, not three node types. This is the half of the black-box idea that already works.",
      "Blocks/BlockWiring › Mixed Views Canvas")}

{shot("nesting", "Nesting today — <code>blockMembers</code> and <code>parentId</code>",
      "this is the structure a fold and a drill-in would both run on. It exists and it renders. "
      "What is missing is any operation that <i>uses</i> it as a boundary.",
      "Blocks/Block › Show Cards And Members")}

<div class="act"><span class="n">03</span><h2>How the field draws a port</h2></div>
<p class="actsub">Same node, eight house styles, redrawn to scale. The convergence argument is easier to
see than to read: everyone landed on a dot or a stub on a wall, addressed by id, positioned by a named
function.</p>
<div class="idioms">{IDIOMS}</div>
{shot("port-states", "And the real one, at real size",
      "state lives in the ring, never the fill — so a port reads the same whether it is wired, hovered or "
      "disabled. Every library in the strip above solves the same problem; this is what yours looks like rendered.",
      "Ports/Port › All States")}

<h3>{len(CONVERGENCE)} design questions, and where you sit on each</h3>
{verdict_bar()}
<p style="color:var(--dim);max-width:840px">Every red segment is a hierarchy question. Nothing else in the
survey is red.</p>
{conv_table()}

<div class="act"><span class="n">04</span><h2>The scorecard</h2></div>
<p class="actsub">Everything the sweep found about bbox-ui, sorted into four buckets.</p>
{scorecard()}
{buckets_html()}

<h3>The stock-part mapping, element by element</h3>
<p style="color:var(--dim);max-width:840px">One row per element, the off-the-shelf part named by its exact
exported name, and the behaviour that must survive adoption &mdash; plus the explicit <b>unchanged</b> row
for the seam deliberately left alone.</p>
{stock_table()}

<div class="act"><span class="n">05</span><h2>How they structure their libraries</h2></div>
<p class="actsub">You asked for this axis by name. Six patterns: four the field converged on, two measured
in bbox-ui's own tree this run.</p>
{libstruct_html()}

<div class="act"><span class="n">06</span><h2>The reference library</h2></div>
<p class="actsub">Every library, tool and specification the sweep read. <span class="vy">&#9679; in vault</span>
means your Obsidian notes already carry a verdict &mdash; most do, which is itself the answer to &ldquo;go
through my documents&rdquo;. Licences are read from manifests or LICENSE files, never recalled.</p>
{lic_bar()}
<p style="color:var(--dim);max-width:860px;margin-bottom:4px">Which is the practical question: over half this
reference set is permissive enough to borrow code from outright, and the two mechanisms most worth taking
&mdash; maxGraph's folding and diagram-js's drilldown &mdash; are both in that green segment.</p>
{fam_html}

<div class="act"><span class="n">07</span><h2>Decide</h2></div>
<p class="actsub">Two forks that need you, two things that need nobody, and what I deliberately left undone.
Each fork carries the reversible default I take if you say nothing.</p>
{decisions_html()}

{FB.ui("node-editor prior-art sweep (2026-09-17)", "decision", len(DECISIONS))}

<footer>
<p><b>Method.</b> A 19-agent fan-out (Sonnet legwork, Opus integration, as asked): 4 vault sweeps over
<code>/home/bam/zach_brain</code>, 11 library-family dossiers, 2 repo inventories. Every agent was required
to cite a file path it opened or a URL it fetched, with an explicit <code>unverified</code> list for anything
it could not pin. <code>@xyflow/react</code> 12.11.6, <code>@xyflow/system</code> 0.0.82 and
<code>tldraw</code> 5.3.2 were read from <code>node_modules</code> as primary sources; Baklava's and
diagram-js's sources were fetched and read in full. libavoid and its ports were <b>not</b> read (LGPL,
standing repo rule). The first run lost 15 of 19 agents to a weekly limit after they had written their
dossiers but before they returned; those files were complete on disk and were used rather than regenerated,
and the five that never wrote anything were re-run once the limit reset.</p>
<p><b>The captures</b> are real renders from <code>apps/storybook-basics</code> in this lane worktree, driven
headlessly on <code>STORYBOOK_PORT=5477</code> via Playwright and inlined as data URIs. The three demos in
act 01 are hand-built from the mechanisms as documented &mdash; they are drawings of prior art, not renders
of bbox-ui, and every one of them says so.</p>
<p><b>Relationship to the other report.</b>
<a href="file:///home/bam/bbox-ui/reports/node-editor-prior-art-2026-09-17.html">node-editor-prior-art-2026-09-17.html</a>
is a concurrent session's deeper read of four sources against <i>SystemSketch</i>. This is the wide sweep
against <i>bbox-ui</i>. They agree where they overlap. Read that one for depth on four libraries; this one
for the map.</p>
<p><b>Unverified &mdash; carried through rather than dropped:</b></p>
<ul class="uv">{"".join(f"<li>{u}</li>" for u in UNVERIFIED)}</ul>
</footer>

</div>{FB.JS}</body></html>"""

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(HTML, encoding="utf-8")
print(f"wrote {OUT}  ({OUT.stat().st_size:,} bytes)")
