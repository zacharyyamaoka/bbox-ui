"""The corpus the visual-language MOC indexes.

One record per artifact. `path` is absolute and checked before anything is
built — a MOC that links at a file which is not there is worse than no MOC.

WHY the corpus spans four trees: the question "how does Unreal draw a branch"
was answered in like_keras in July, in systemsketch in September, and again in
bbox-ui last week, because nothing indexed the earlier answer. That is the
thing this page exists to stop.
"""

SS = "/home/bam/systemsketch"
BB = "/home/bam/bbox-ui/reports"
PB = "/home/bam/pyblocks/docs"
VA = "/home/bam/zach_brain"

# tier: "core" = the language itself, "study" = one construct answered against
# the field, "support" = the field appears but is not the subject.
ARTIFACTS = [
    # ---------------------------------------------------------------- core
    dict(key="block-visuals", tier="core", repo="vault · like_keras", date="2026-07-16",
         path=f"{VA}/Projects/like keras/Block Visuals — Prior Art Up Close + Proposal (2026-07-16).html",
         title="Block Visuals — prior art up close",
         lede="17 tools photographed: the whole editor, then HD close-ups of the actual blocks, then each library's node taxonomy.",
         body="The only artifact in the corpus built out of <b>real screenshots of the real apps</b> rather than redrawings — 57 of them, opened and read one at a time. Unreal Blueprints (⚠ the spaghetti tale), LabVIEW (⚠ wire-is-type), Simulink, ComfyUI, Node-RED, n8n, Blender, Scratch (jigsaw · connect-by-shape), Max/MSP and Pure Data (top-down · the minority axis), KNIME, Orange, Ryven, IcePanel, AICA, MoveIt Pro, Flowstate, ADTF. Part B proposes the like_keras block against them.",
         tools=["Unreal Blueprints","LabVIEW","Simulink","ComfyUI","Node-RED","n8n","Blender","Scratch","Max/MSP","Pure Data","KNIME","Orange","Ryven"],
         topics=["node body","port","wire","taxonomy"], slow=True),

    dict(key="grammar-atlas", tier="core", repo="systemsketch", date="2026-09-02",
         path=f"{SS}/docs/node-editor-visual-grammar-atlas-2026-09-02.html",
         title="Node-editor visual grammar atlas — ten more languages",
         lede="Twelve conventions per system — six core marks plus six hard cases — as 120 original schematic glyphs.",
         body="The reading key, redrawn rather than screenshotted: meaning on the left, representative board shape on the right. Unreal Engine Blueprints (event node · callable node · <b>execution wire</b> · typed data wire · branch · collapsed graph), Grasshopper, Blender Geometry Nodes, Flyde, MLIR, Node-RED, n8n, Houdini, Unity Visual Scripting, Max/MSP. Covers branches, joins, counted and collection loops, while-like feedback, state, early exit and errors — and says where a system has <i>no</i> construct, which is itself a grammar choice.",
         tools=["Unreal Blueprints","Grasshopper","Blender","Flyde","MLIR","Node-RED","n8n","Houdini","Unity","Max/MSP"],
         topics=["exec flow","branch","loop","state","early exit","errors"]),

    dict(key="grammar-dict", tier="core", repo="systemsketch", date="2026-09-02",
         path=f"{SS}/docs/visual-grammar-simulink-labview-2026-09-02.html",
         title="Visual grammar dictionary — Simulink & LabVIEW",
         lede="The two mature tools, element by element: source block, operation block, Inport/Outport, signal line, signal branch, subsystem, enabled subsystem, If + action signal.",
         body="The companion to the atlas and the one to read first if the question is narrowly “how does LabVIEW/Simulink spell this”. Explicitly a dictionary, not a palette: each row is one mark and what it means, with the board shape beside it.",
         tools=["Simulink","LabVIEW"], topics=["node body","port","wire","subsystem","branch"]),

    dict(key="gap-analysis", tier="core", repo="systemsketch", date="2026-09-03",
         path=f"{SS}/docs/labview-blueprint-simulink-vocabulary-controls-gap-analysis-2026-09-03.html",
         title="LabVIEW · Unreal Blueprint · Simulink — vocabulary and UI-controls gap analysis",
         lede="4.3 MB, 66 figures. Track A is node and block vocabulary; Track B is the editor chrome — toolbar, debugger, watch, breadcrumbs, finder.",
         body="The deep-research dictionary turned into a gap list: what we already have, what is missing and would be useful, what to refuse. Its bottom line is a rule worth carrying: <b>borrow the mature tools' reading constraints, never their graph-authoring authority.</b> Every figure is a real capture — the 53 source PNGs are in <code>docs/assets/gap-*.png</code>. The markdown twin carries the long prose.",
         tools=["LabVIEW","Unreal Blueprints","Simulink","Stateflow"],
         topics=["vocabulary","editor chrome","debugger","errors","records"], slow=True),

    dict(key="sweep", tier="core", repo="bbox-ui", date="2026-09-17",
         path=f"{BB}/node-editor-prior-art-sweep-2026-09-17.html",
         title="Node-editor prior art — the exhaustive sweep",
         lede="19 tools against the five mechanisms a hierarchical black box needs, plus “how the field draws a port” in eight house styles redrawn to scale.",
         body="The port strip alone earns the page: React Flow <code>&lt;Handle&gt;</code>, JointJS port groups, litegraph index-addressed slots, Blender typed sockets (colour = socket type), <b>LabVIEW's connector-pane grid</b>, Simulink Inport/Outport blocks, ELK's constraint ladder and bbox-ui's own rail — same node, eight houses. Then: collapse-to-a-black-box is two bounds and one boolean in six independent implementations, drill-in is a layer swap not a camera move, and the container's interface comes from a boundary node placed inside in 7 of 11 shipping desktop tools.",
         tools=["Houdini","Blender","Unreal Blueprints","Nuke","Max/MSP","TouchDesigner","Substance Designer","Grasshopper","Node-RED","ComfyUI","LabVIEW","Simulink"],
         topics=["port","collapse","drill-in","interface","reuse"]),

    # --------------------------------------------------------------- study
    dict(key="loop-regions", tier="study", repo="systemsketch", date="2026-09-02",
         path=f"{SS}/docs/loop-regions-2026-09-02.html",
         title="How node editors draw “do this again”",
         lede="Five editors, visually, before any proposal: LabVIEW, Blender Geometry Nodes, Houdini SOPs, Simulink, Unreal Blueprints.",
         body="Each one drawn, then five SystemSketch directions scored against a weighted objective fixed <i>before</i> the boards. The reference captures it reads from are the five files in <code>docs/assets/loop-prior-art/</code>.",
         tools=["LabVIEW","Blender","Houdini","Simulink","Unreal Blueprints"], topics=["loop","region"]),

    dict(key="for-loop-grammars", tier="study", repo="systemsketch", date="2026-09-02",
         path=f"{SS}/docs/for-loop-labview-grammars-2026-09-02.html",
         title="Five loop grammars, from LabVIEW's answer outward",
         lede="Wall Tunnels · Cardinality Cable · Binding Ports · Header Contract · Bare Cycle — LabVIEW's tunnel-and-shift-register model taken as the origin and walked away from.",
         body="The clearest worked example in the corpus of <i>copying a mature tool and then paying for the copy</i>: V1 is LabVIEW's answer, and the scoring says where its cost lands.",
         tools=["LabVIEW","Houdini","Simulink","Grasshopper","Blender"], topics=["loop","port","region"]),

    dict(key="loop-edge-marks", tier="study", repo="systemsketch", date="2026-09-02",
         path=f"{SS}/docs/loop-edge-marks-2026-09-02.html",
         title="Five ways to say “next iteration” on a cable",
         lede="Dotted line · z⁻¹ chip mid-cable · Unit Delay block at the merge · ≫ at the landing · ◆ initial token.",
         body="The z⁻¹ chip and the Unit Delay block are Simulink's literal spelling; LabVIEW's is the shift register on the wall. Section 1 is what the prior art agrees on before any of the five are drawn.",
         tools=["Simulink","LabVIEW","TouchDesigner","Max/MSP"], topics=["wire","state","loop"]),

    dict(key="while-break", tier="study", repo="systemsketch", date="2026-09-03",
         path=f"{SS}/docs/while-loop-break-2026-09-03.html",
         title="Ten ways to draw a break — or admit you can't",
         lede="B2 is LabVIEW's real move (OR it into the condition inlet); B3 is BPMN's boundary event; the other eight are ours.",
         body="Section 1 is the part to read: what five existing answers to “interrupt a loop from partway through” actually look like, before the ten marks are scored.",
         tools=["LabVIEW","BPMN"], topics=["loop","early exit"]),

    dict(key="branch-regions", tier="study", repo="systemsketch", date="2026-09-02",
         path=f"{SS}/docs/branch-regions-2026-09-02.html",
         title="A branch is a region. Its inputs need no ports. Its outputs are joins.",
         lede="Prior art in one table — LabVIEW, Simulink, Node-RED, Houdini, Grasshopper, Pure Data, TouchDesigner, Max/MSP — then five boards against it.",
         body="The measured half matters as much as the survey: the binding table per arm, computed against real fixtures, is what makes the prior-art table decidable rather than decorative.",
         tools=["LabVIEW","Simulink","Node-RED","Houdini","Grasshopper","Pure Data","TouchDesigner","Max/MSP"],
         topics=["branch","port","region"]),

    dict(key="many-to-one", tier="study", repo="systemsketch", date="2026-09-02",
         path=f"{SS}/docs/many-to-one-2026-09-02.html",
         title="A many-to-one port is a φ. Choosing an arm reads it.",
         lede="Prior art on bypass and on showing the live path, then five boards for the join.",
         body="The join is the half of branching the atlas entries mostly skip — this is where it is answered.",
         tools=["LabVIEW","Simulink"], topics=["branch","port","wire"]),

    dict(key="reference-learnings", tier="study", repo="systemsketch", date="2026-09-02",
         path=f"{SS}/docs/reference-learnings-2026-09-02.html",
         title="Enso, Neva and unit — what to take",
         lede="Three modern languages the mature-tool sweep misses: a node is one line of code and its arguments are widgets; the grammar of connections is the whole product; the gesture is the command.",
         body="The counterweight to copying 1986. Seven things to take, including “make many-to-one a node, not a rendering rule” and “consider not drawing the for-loop at all”.",
         tools=["Enso","Neva","unit"], topics=["node body","wire","interaction"]),

    dict(key="truthful-branching", tier="study", repo="bbox-ui", date="2026-09-22",
         path=f"{BB}/media/truthful-branching-2026-09-22.html",
         title="More truthful branching — “it ends up looking like Unreal and Simulink”",
         lede="It ends up looking like LabVIEW, and that is forced by a rule already chosen: control flow is never a cable.",
         body="§2 is a three-row table that settles the family question. Unreal spells a conditional as a <b>white execution wire</b> into a Branch node with True/False exec outputs — ruled out here by the no-control-cable rule. Simulink has no control flow at all; every block runs every tick. What is left is structure, which is LabVIEW's Case Structure — with one place we beat it: LabVIEW cannot draw a flat <code>elif</code> ladder, it nests.",
         tools=["Unreal Blueprints","Simulink","LabVIEW"], topics=["branch","exec flow","port"]),

    dict(key="try-except", tier="study", repo="bbox-ui", date="2026-09-22",
         path=f"{BB}/media/try-except-proposals-2026-09-22.html",
         title="try / except / else / finally — five ways to draw it",
         lede="Eight notations against five criteria, and one column is empty all the way down: nobody draws a suite that runs on every path.",
         body="LabVIEW is “a reference for one inch, an anti-reference for the mile” — an error is an ordinary value on an ordinary wire, and the only try-shaped thing is a Case Structure with an error cluster on its selector, which gives exactly two cases. <b>Unreal Blueprints has no exceptions at all, and Epic decided that twice</b> (Verse chose a <code>&lt;decides&gt;</code> effect instead). The closer references turned out to be BPMN error boundary events, Step Functions Catch and Node-RED's detached catch node.",
         tools=["LabVIEW","Unreal Blueprints","Simulink","Node-RED","BPMN","Step Functions","Snap!"],
         topics=["errors","region","branch"]),

    dict(key="hundred-ideas", tier="study", repo="bbox-ui", date="2026-09-18",
         path=f"{BB}/hundred-ideas-2026-09-18.html",
         title="100 ideas, best first",
         lede="A transplant list. Each idea names the tool it is lifted from and draws the before/after.",
         body="The ones that are literally the field's visual language: <b>#12 LabVIEW's connector pane</b> — a terminal carries a caller obligation (required / recommended / optional) shown in the port's ring weight; <b>#8 Blender's Mute (M) and Nuke's Disable (D)</b> — a boolean on the node that reroutes its first type-matching input straight through, drawn as a dashed/red outline; <b>#2 Node-RED's Link In / Link Out</b> — wire to a name instead of drawing a cable across the board.",
         tools=["LabVIEW","Blender","Nuke","Node-RED","Houdini","Grasshopper","ComfyUI","Max/MSP","Simulink","TouchDesigner"],
         topics=["port","wire","node body"]),

    dict(key="left-to-right", tier="study", repo="pyblocks", date="2026-08-27",
         path=f"{PB}/left-to-right-feedback-research-2026-08-27.html",
         title="Left-to-right dataflow and feedback loops",
         lede="Should screen direction be a hard rule? Q1 is LabVIEW, Q2 is Simulink and the MAB style guide, Q3 is a production-editor matrix.",
         body="The reading-order question the atlases assume and never argue. Also the copyable wide-rounded return shape for a feedback cable, and what the human-factors evidence actually supports. The markdown twin carries the full source index.",
         tools=["LabVIEW","Simulink","Node-RED","Houdini","Grasshopper","Blender"], topics=["layout","wire","loop"]),

    dict(key="edge-overlap", tier="study", repo="pyblocks", date="2026-08-26",
         path=f"{PB}/edge-overlap-2026-08-26.html",
         title="Overlapping edges — and where the prior art reverses the premise",
         lede="The defect is a merge, not a crossing. Offset the elbows; hops are the treatment almost nobody ships.",
         body="A survey of how the field handles two cables that land on the same midline, with the same crossing drawn three ways at 4×. Every figure is drawn by the real router, not by hand.",
         tools=["Unreal Blueprints","LabVIEW","Simulink","Houdini","Grasshopper","Node-RED","ComfyUI","Nuke","n8n"],
         topics=["wire","layout"]),

    dict(key="diff-prior-art", tier="study", repo="pyblocks", date="2026-09-03",
         path=f"{PB}/diff-visual-design-prior-art-2026-09-03.html",
         title="Visual diff — ten products already solved pieces of this",
         lede="§3 “engineering block diagrams” is the closest domain match: Simulink's comparison tool keeps the canvas clean.",
         body="Selecting a changed item in the tree does <i>not</i> recolour the block — it draws a plain rectangle around it. Also: the only real node-diagram-diff precedent, and the one thing nobody has actually built.",
         tools=["Simulink"], topics=["diff","node body"]),

    dict(key="comparison-view", tier="study", repo="bbox-ui", date="2026-09-17",
         path=f"{BB}/media/comparison-view-research-2026-09-17.html",
         title="The comparison view — research, and where it splits",
         lede="The Simulink Comparison Tool as the closest domain match, read for what it refuses to do.",
         body="Side-by-side and overlay as two views of one comparison; the canvas stays clean rather than being recoloured.",
         tools=["Simulink"], topics=["diff"]),

    # ------------------------------------------------------------- support
    dict(key="prior-art-5src", tier="support", repo="bbox-ui", date="2026-09-17",
         path=f"{BB}/media/node-editor-prior-art-2026-09-17.html",
         title="Node-editor prior art — five sources",
         lede="JointJS, maxGraph, litegraph.js and Vyuh Flow read for design decisions: 58 raw findings, 39 entries.",
         body="Library grammar rather than product grammar — highlighters, element tools, cell model, index-addressed slots. litegraph is ComfyUI's upstream, so this is where ComfyUI's drawing rules actually live.",
         tools=["ComfyUI","litegraph","JointJS","maxGraph"], topics=["node body","port","interaction"]),

    dict(key="prior-art-visuals", tier="support", repo="bbox-ui", date="2026-09-18",
         path=f"{BB}/media/node-editor-prior-art-visuals-2026-09-18.html",
         title="Node-editor prior art — the other 26, drawn",
         lede="Every idea the five-sources report kept as a table row, given one mechanism diagram each.",
         body="Container behaviour, layout and serialization, runtime and interaction polish, JointJS element-tool mechanics — 24 of 26 verified in donor source by file:line.",
         tools=["JointJS","maxGraph","litegraph","Vyuh"], topics=["container","layout","interaction"]),

    dict(key="prior-art-wave2", tier="support", repo="bbox-ui", date="2026-09-18",
         path=f"{BB}/media/node-editor-prior-art-wave2-2026-09-18.html",
         title="Prior-art wave 2 — containment, history, definitions, paint order, edge-drop menu",
         lede="Where the z-order ruling came from, and the edge-drop type-filtered menu the field converged on.",
         body="Mostly mechanism rather than mark-making, but the paint-order ruling is the reason a nested child stays behind its header.",
         tools=["maxGraph","litegraph","JointJS"], topics=["container","paint order"]),

    dict(key="prior-art-explained", tier="support", repo="bbox-ui", date="2026-09-18",
         path=f"{BB}/media/prior-art-explained-2026-09-18.html",
         title="Prior art, explained — the three cards you asked about",
         lede="Edge-promotion resolver, “ports are a manifest”, and the parametric drag-handles — re-read in donor source and taught.",
         body="Includes the two places the original cards overstated. The edge-promotion figure is the one to look at if collapse is the construct in hand.",
         tools=["maxGraph","litegraph","JointJS"], topics=["collapse","port"]),

    dict(key="sweep-answers", tier="support", repo="bbox-ui", date="2026-09-18",
         path=f"{BB}/sweep-answers-2026-09-18.html",
         title="Sweep answers — including “how does Houdini name its drift?”",
         lede="Houdini is the only surveyed tool with a vocabulary for a definition and its instance disagreeing: a state, a visible divergence, a repair verb.",
         body="Corrections to the sweep made visible rather than silently patched.",
         tools=["Houdini"], topics=["reuse"]),

    dict(key="vpl-prior-art", tier="support", repo="bbox-ui", date="2026-09-18",
         path=f"{BB}/media/vpl-prior-art-2026-09-18.html",
         title="What the prior art changes — ~40 VPL tools",
         lede="Granularity, not mark-making: what one node is, in PyFlow, Ryven, Nodezator, Barfi, Orange, GNU Radio and the read-only projectors.",
         body="Carries the finding that most constrains any copy of LabVIEW: NI's own viscosity study, where six of six participants introduced a bug while rewiring existing LabVIEW code and four of six abandoned the task. Keep the file canonical and that failure never fires.",
         tools=["LabVIEW","PyFlow","Ryven","Orange","GNU Radio"], topics=["granularity","node body"]),

    dict(key="ss-design-tool", tier="support", repo="systemsketch", date="2026-09-07",
         path=f"{SS}/reports/node-editor-design-tool-prior-art-2026-09-07.html",
         title="Property panels, node editors and Figma-likes",
         lede="The chrome around the canvas: ComfyUI, Langflow, n8n, Node-RED, Penpot, Excalidraw, Graphite, tldraw, AFFiNE.",
         body="Twelve codebases read from primary source, asking where the schema a property panel renders actually comes from.",
         tools=["ComfyUI","Node-RED","n8n","Langflow","Excalidraw"], topics=["editor chrome","inspector"]),

    dict(key="ss-primitive-ds", tier="support", repo="systemsketch", date="2026-09-07",
         path=f"{SS}/reports/primitive-design-systems-2026-09-07.html",
         title="Primitive design systems — pre-sleep brief",
         lede="Short, but it is the receipt for the reference corpus: seven fact sheets and 19 + 11 reference screenshots across LabVIEW, Simulink and thirteen others.",
         body="Read it for the frozen criteria and hard gates used to score a visual language, which are reusable on any new comparison.",
         tools=["LabVIEW","Simulink","ComfyUI","n8n","Langflow"], topics=["criteria","node body"]),

    dict(key="ss-everything-block", tier="support", repo="systemsketch", date="2026-09-09",
         path=f"{SS}/reports/everything-is-a-block-2026-09-09.html",
         title="Everything is a Block — what survives",
         lede="The thesis measured against prior art, including “everything is a div” as the cautionary half of HTML.",
         body="§3.6 is the line that matters for a copy: sameness is the cost of a visual grammar, not its goal.",
         tools=["Unreal Blueprints","LabVIEW","Simulink"], topics=["node body","taxonomy"]),

    dict(key="control-flow-map", tier="support", repo="bbox-ui", date="2026-09-18",
         path=f"{BB}/control-flow-map-2026-09-18.html",
         title="Control flow — what is already decided, and where it lives",
         lede="Nine constructs × three repos: what pyblocks lowers it to, what systemsketch draws, what bbox-ui has parts for.",
         body="Not prior art itself — the routing table that says which construct already has a drawing and which has none. Read beside this MOC: that page maps <i>our</i> state, this one maps the field's.",
         tools=[], topics=["branch","loop","errors","state"]),

    dict(key="parity-triage", tier="support", repo="bbox-ui", date="2026-09-20",
         path=f"{BB}/media/parity-triage-2026-09-20.html",
         title="Parity backlog — what the old app had that this one doesn't",
         lede="Where the 53 Blueprint/LabVIEW/Simulink UI captures are actually cashed out as backlog rows.",
         body="Each row names the control, the capture it came from and the measured state of the code. Tidy-as-a-command is LabVIEW's Ctrl+U model; the connector contract, the member list and the component interface each cite their screenshot.",
         tools=["LabVIEW","Unreal Blueprints","Simulink"], topics=["editor chrome","vocabulary"], slow=True),

    dict(key="region-wall", tier="support", repo="bbox-ui", date="2026-09-22",
         path=f"{BB}/media/region-wall-crossing-2026-09-22.html",
         title="Region wall crossing — the cost LabVIEW's users name",
         lede="If every crossing inserts a port, a branch brings back the input tunnels that were dropped.",
         body="“Wires that point nowhere… imagine 20 cases” is NI's own users on LabVIEW case structures — the strongest available argument against one specific copy.",
         tools=["LabVIEW"], topics=["region","port"]),

    # ------------------------------------------------------------ vault
    dict(key="v-30years", tier="study", repo="vault · like_keras", date="2026-07-24",
         path=f"{VA}/Projects/like keras/Simulink + LabVIEW — What 30 Years of Visual Programming Teaches Block View (Deep Research, 2026-07-24).md",
         title="What 30 years of visual programming teaches Block View",
         lede="The canonical synthesis: intent preservation, structural edits as interface migrations, state and effects, grouping, geometry never being execution.",
         body="The conclusion that survives: borrow the operational contracts around graph editing, not the notation wholesale. Indexed by <b>MOC - LabVIEW</b>, which is deliberately scoped to those lessons and not to the drawing.",
         tools=["LabVIEW","Simulink"], topics=["contracts","state","grouping"], md=True),

    dict(key="v-levels", tier="study", repo="vault · like_keras", date="2026-07-16",
         path=f"{VA}/Projects/like keras/Block Visual Language — Levels × Views × States (2026-07-16).html",
         title="Block visual language — levels × views × states",
         lede="The framework the close-ups feed: what a block looks like at each level of detail, in each view, in each state.",
         body="The axis the atlases do not have. Read with Block Visuals open beside it.",
         tools=[], topics=["node body","states"]),

    dict(key="v-branch-atlas", tier="study", repo="vault · pyblocks", date="2026-09-02",
         path=f"{VA}/Projects/pyblocks/branching-node-editor-visual-atlas-2026-09-02.html",
         title="Branching — node-editor visual atlas",
         lede="The branch construct compared across editors, in the vault beside its deep-research note.",
         body="Small, and the systemsketch branch-regions page supersedes most of it — kept because it is the version filed where the decision was made.",
         tools=["LabVIEW","Simulink","Node-RED"], topics=["branch"]),

    dict(key="v-src2flow", tier="study", repo="vault · pyblocks", date="2026-08-23",
         path=f"{VA}/Projects/pyblocks/Source Code to Dataflow View — Prior Art Gallery (2026-08-23).html",
         title="Source code to dataflow view — prior art gallery",
         lede="The read-only projectors: what a tool that draws existing code, rather than authoring into a graph, actually looks like.",
         body="The half of the field Unreal and LabVIEW are not in — and the half this product is in.",
         tools=[], topics=["granularity","node body"]),

    dict(key="v-loops", tier="study", repo="vault · pyblocks", date="2026-09-02",
         path=f"{VA}/Projects/pyblocks/Loops in Visual Dataflow Languages — Prior Art and the Region Grammar (Deep Research, 2026-09-02).md",
         title="Loops in visual dataflow languages — prior art and the region grammar",
         lede="The cited research behind the loop boards.",
         body="Read when a loop decision needs its source rather than its drawing.",
         tools=["LabVIEW","Simulink","Houdini","Blender"], topics=["loop","region"], md=True),

    dict(key="v-branching", tier="study", repo="vault · pyblocks", date="2026-09-02",
         path=f"{VA}/Projects/pyblocks/Branching in Visual Dataflow Languages — Prior Art and the Region Grammar (Deep Research, 2026-09-02).md",
         title="Branching in visual dataflow languages — prior art and the region grammar",
         lede="The cited research behind the branch boards.",
         body="Pairs with branch-regions and many-to-one above.",
         tools=["LabVIEW","Simulink","Node-RED"], topics=["branch","region"], md=True),

    dict(key="v-classes", tier="study", repo="vault · pyblocks", date="2026-09-03",
         path=f"{VA}/Projects/pyblocks/Classes in Visual Dataflow Languages — Prior Art and the Region Grammar (Deep Research, 2026-09-03).md",
         title="Classes in visual dataflow languages — prior art and the region grammar",
         lede="Composite nodes and by-value object threading — the construct none of the atlases cover.",
         body="The one place the corpus goes beyond what Unreal and LabVIEW themselves draw.",
         tools=["LabVIEW","Simulink"], topics=["container","granularity"], md=True),

    dict(key="v-moc-labview", tier="support", repo="vault · MOC", date="2026-08-30",
         path=f"{VA}/Maps & Views/MOC/MOC - LabVIEW.md",
         title="MOC - LabVIEW",
         lede="The existing map — and it is deliberately not this one.",
         body="It gathers LabVIEW and Simulink as <i>comparative evidence for Block View</i>: five transferable contracts, and an explicit statement that it is not a visual-language reference. This page is the drawing half it says it does not cover.",
         tools=["LabVIEW","Simulink"], topics=["contracts"], md=True),
]

# Real captures of the real applications that already sit on disk.
CAPTURES = [
    dict(path=f"{SS}/docs/assets/loop-prior-art/unreal-for-loop.png", tool="Unreal Blueprints",
         cap="ForLoop: a white execution wire in, Loop Body and Completed execution wires out, Index as a typed data pin."),
    dict(path=f"{SS}/docs/assets/loop-prior-art/labview-shift-registers.gif", tool="LabVIEW",
         cap="Shift registers: the loop wall carries the state, and the value crosses the boundary as a tunnel."),
    dict(path=f"{SS}/docs/assets/loop-prior-art/simulink-for-iterator.png", tool="Simulink",
         cap="For Iterator subsystem — the count is a block inside the region, not a header field."),
    dict(path=f"{SS}/docs/assets/loop-prior-art/blender-repeat-zone.png", tool="Blender Geometry Nodes",
         cap="Repeat Zone: two paired nodes, not a frame — the region is defined by its ends."),
    dict(path=f"{SS}/docs/assets/loop-prior-art/houdini-loop-network.jpg", tool="Houdini",
         cap="For-Each SOP network — begin/end blocks with the metadata node hanging off the side."),
    dict(path=f"{SS}/docs/assets/gap-labview-connector-contract-2026-09-03.png", tool="LabVIEW",
         cap="A real VI block diagram: the pink dashed error cluster runs beside the data wire the whole way."),
    dict(path=f"{SS}/docs/assets/labview-while-loop.png", tool="LabVIEW",
         cap="The While Loop's own context help — conditional terminal, Stop if True, and the error-cluster wiring."),
    dict(path=f"{SS}/docs/assets/gap-blueprint-struct-pins-2026-09-03.png", tool="Unreal Blueprints",
         cap="Struct pins — split and recombine a record on the node itself."),
    dict(path=f"{SS}/docs/assets/gap-ui-blueprint-graph-editor-2026-09-04.png", tool="Unreal Blueprints",
         cap="The Blueprint graph editor, whole — the chrome around the canvas, not just the nodes."),
    dict(path=f"{SS}/docs/assets/gap-ui-blueprint-toolbar-2026-09-04.png", tool="Unreal Blueprints",
         cap="Compile · Save · Find in CB · Search · Class Settings · Class Defaults · Simulation · Play."),
    dict(path=f"{SS}/docs/assets/gap-simulink-switch-2026-09-03.png", tool="Simulink",
         cap="Switch block — the conditional as an ordinary block with three data inputs."),
    dict(path=f"{SS}/docs/assets/gap-ui-simulink-editor-2026-09-04.png", tool="Simulink",
         cap="The Simulink editor, whole — toolstrip, model browser, property inspector."),
]
