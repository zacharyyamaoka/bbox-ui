"""The prior-art matrix for the Python-syntax inventory, with citations.

Zach, 2026-09-23: *"blueprints, simulink, labview, these are just prior art,
they basically ARE the key references."*

WHY this file is split in two halves rather than shipped as one complete table:
the vault's two deep-research passes (both 2026-09-02, both primary-sources-only
with numbered citation indexes) covered **branching and loops** exhaustively and
covered nothing else. Filling the other fourteen rows from memory would produce
a table that reads exactly as authoritative as the nine real ones and is worth
less than a blank — which is the failure mode `feedback_verify_before_asserting`
and `docs/ALGORITHM-PROVENANCE.md` both name. So the researched rows carry their
source and the rest are listed as the next research brief.

Every quoted string below was read out of the cited file during this build, not
recalled. Where a source itself flags a claim as unconfirmed, that flag travels
with it into UNVERIFIED.
"""
from __future__ import annotations

BRANCH = ("zach_brain/Projects/pyblocks/Branching in Visual Dataflow Languages "
          "— Prior Art and the Region Grammar (Deep Research, 2026-09-02).md")
LOOPS = ("zach_brain/Projects/pyblocks/Loops in Visual Dataflow Languages "
         "— Prior Art and the Region Grammar (Deep Research, 2026-09-02).md")


def _q(t: str) -> str:
    return f"<i>&ldquo;{t}&rdquo;</i>"


PRIOR_ART = [
    dict(
        construct="<b>if / else</b><br><span class='sid-lite'>C1</span>",
        blueprints="A small <b>Branch</b> node routes <b>execution</b> to True or False; the "
                   "coloured data wires stay separate. Control is a cable, not a frame.",
        labview="<b>Case Structure</b> — a region. " + _q("Only one case subdiagram is visible at "
                "a time, and the structure executes only one subdiagram at a time") + ". Cycled "
                "with Ctrl+wheel; NI: " + _q("it is not possible to view all conditions … at the "
                "same time") + ".",
        simulink="<b>If</b> block emits action signals to one <b>If Action Subsystem</b> per arm; "
                 "recombination is a separate <b>Merge</b> block whose " + _q("output value at any "
                 "time is equal to the most recently computed output of its driving blocks") + ".",
        other="<b>MLIR</b> <code>scf.if</code>: a then-region and an else-region, both ending in "
              "<code>scf.yield</code>. <b>n8n</b> If node with True/False handles + a Merge node. "
              "<b>Scratch</b> nests both bodies inside one control shape. <b>Blender</b> never "
              "built a conditional zone &mdash; its <code>if</code> is a Switch node.",
        lesson="<b>Region, and the asymmetry is real.</b> Inputs may read outside; outputs leave "
               "only through <b>one join per leaving value</b> &mdash; Dennis's merge, SSA's "
               "&phi;, Simulink's Merge, LabVIEW's output tunnel, <code>scf.yield</code>.",
    ),
    dict(
        construct="<b>elif chain / N-way</b><br><span class='sid-lite'>C3</span>",
        blueprints="&mdash; not covered by the research pass.",
        labview="The Case Structure is <b>already N-way</b>: the selector takes a value, not a "
                "boolean, and each case is one subdiagram. No separate construct.",
        simulink="The If block takes <code>elseif</code> expressions, each driving its own action "
                 "subsystem into the same Merge.",
        other="<b>MLIR</b> <code>scf.index_switch</code> is the N-way form <b>with a mandatory "
              "default</b>. <b>Ptolemy</b>'s <code>Case</code> actor runs one refinement per case "
              "and " + _q("all refinements have the same ports") + " &mdash; tunnels by construction.",
        lesson="N-way is the same region with N arms, not a second construct. The IRs make the "
               "default arm <b>mandatory</b>; Python's <code>case _</code> is optional, so the "
               "projection has to represent &ldquo;no arm matched&rdquo; somehow.",
    ),
    dict(
        construct="<b>ternary</b><br><span class='sid-lite'>C2</span>",
        blueprints="A <b>Select</b> node &mdash; and it <b>evaluates both inputs</b> "
                   "(UE&#8209;20044, open since 2015).",
        labview="The <b>Select</b> function, separate from the Case Structure. It evaluates both "
                "<code>t</code> and <code>f</code> because a node needs all its inputs. NI "
                "recommends it " + _q("for simple if statements") + " and the Case Structure "
                + _q("if you need to change what code is executed") + ".",
        simulink="The <b>Switch</b> block, which also evaluates both data inputs unless "
                 "<i>conditional input branch execution</i> is on. A MathWorks engineer prefers "
                 "If/Merge because " + _q("I don't like reliance on an optimization to provide "
                 "good behavior") + ".",
        other="<b>Blender</b>'s Switch is lazy since 3.0 (" + _q("only the input that is passed "
              "through the node is evaluated") + "). <b>Unity Shader Graph</b>: " + _q("both sides "
              "of the branch are evaluated in the shader") + ". <b>Houdini</b> ships both "
              "behaviours under one name.",
        lesson="<b>Four independent products ship a select node and three of them evaluate both "
               "arms.</b> So a select is only honest when both sides are pure &mdash; which is "
               "exactly why pyblocks' uncommitted change lowers <code>ast.IfExp</code> to an "
               "<b>opaque region</b> rather than to a select. Live divergence: the branch note's "
               "own rule 5 still says " + _q("a conditional expression is a select block") + ".",
    ),
    dict(
        construct="<b>for-each</b><br><span class='sid-lite'>L1</span>",
        blueprints="<b>ForLoop</b>, an exec macro with Loop Body, Index and Completed pins. "
                   "Control only &mdash; no data region.",
        labview="<b>For Loop</b>, the same region shape as the Case Structure. An "
                "<b>auto-indexing tunnel</b> feeds one element per iteration, so the item comes "
                "off the <i>wall</i>, not from a node.",
        simulink="<b>For Iterator Subsystem</b> &mdash; a region executed N times per time step, "
                 "with " + _q("States when starting") + " held or reset.",
        other="<b>MLIR</b> <code>scf.for</code>, a region whose carried values are region "
              "arguments. <b>Blender</b>'s Repeat / For-Each zones: input node left, output node "
              "right, an <b>Iteration socket</b> for the index. <b>Houdini</b> Block Begin / End, "
              "a <i>pair</i>, not a container. <b>Grasshopper has no loops at all</b> &mdash; "
              "Anemone bolts on a Loop Start / Loop End pair.",
        lesson="Region again, and <b>the item is a property of the wall</b> (auto-indexing tunnel "
               "&equiv; induction variable &equiv; Iteration socket). The pair conventions "
               "(Houdini, Anemone) are the dissent, and their named cost is that the body's "
               "extent becomes invisible.",
    ),
    dict(
        construct="<b>while</b><br><span class='sid-lite'>L2</span>",
        blueprints="<b>WhileLoop</b> macro, same exec-pin shape as ForLoop.",
        labview="<b>While Loop</b> &mdash; the same region as the For Loop, differing only in its "
                "conditional terminal.",
        simulink="<b>While Iterator Subsystem</b>.",
        other="<b>MLIR</b> <code>scf.while</code> is the interesting one: it has a <i>before</i> "
              "and an <i>after</i> region which " + _q("communicate by means of region arguments")
              + " &mdash; the predicate is a region of its own.",
        lesson="Everyone but MLIR treats <code>while</code> as <code>for</code> with a different "
               "terminal. MLIR splitting the predicate into its own region is the honest answer "
               "for a Python <code>while</code> whose condition calls something.",
    ),
    dict(
        construct="<b>loop-carried state</b><br><span class='sid-lite'>F2</span>",
        blueprints=_q("none: a value that survives an iteration is a variable") + " &mdash; the "
                   "one surveyed system with no carried-value construct at all.",
        labview="<b>Shift register</b>: " + _q("a pair of terminals … directly opposite each "
                "other on the vertical sides of the loop border") + ", the right "
                + _q("stores data on the completion of an iteration") + ", the left returns it, "
                "and " + _q("after the loop executes, the terminal on the right side … returns "
                "the last value") + ". A <b>Feedback Node</b> is inserted automatically when an "
                "output is wired back to an input inside a loop.",
        simulink="<b>Unit Delay</b> &mdash; " + _q("Delay signal one sample period") + " &mdash; "
                 "with an explicit <b>Initial condition</b>.",
        other="<b>MLIR</b> <code>iter_args</code>, advanced by <code>scf.yield</code>; results "
              "must match the <code>iter_args</code>. <b>Blender</b> zone output items feed the "
              "next iteration. <b>Houdini</b> Fetch Feedback: " + _q("each subsequent loop will "
              "start with the output of the previous loop") + ".",
        lesson="<b>The strongest convergence in the whole table, and it is your own rule.</b> "
               "Five independent products give the carried value a named carrier <b>with a "
               "seed</b>; synchronous dataflow states the law (" + _q("well-formed when every "
               "cycle passes through a delay") + "). Your grammar doc's " + _q("all feedback "
               "traces have to go through an initial variable first") + " is the same sentence.",
    ),
    dict(
        construct="<b>map over a collection</b><br><span class='sid-lite'>P1</span>",
        blueprints="&mdash; the ForLoop macro again; no collect construct.",
        labview="The <b>auto-indexing tunnel</b> is the map: elements in on one wall, elements "
                "out on the other, no explicit collect node.",
        simulink="<b>For Each Subsystem</b> &mdash; the subsystem is applied per element.",
        other="<b>Blender</b>'s For-Each zone. <b>Grasshopper / Dynamo</b> do it <b>implicitly</b> "
              "&mdash; components replicate over lists with no loop at all, which is also how "
              "Dynamo's <code>If</code> " + _q("replicates over lists and truncates them") +
              " (issue&nbsp;#6258, open since 2016).",
        lesson="Map is the one loop shape several products make <b>invisible</b>. That is the "
               "precedent for a comprehension drawing opaque by default &mdash; and Dynamo's "
               "decade-old bug is the precedent for what goes wrong when implicit replication "
               "meets a conditional.",
    ),
    dict(
        construct="<b>fan-out, then recombine</b><br><span class='sid-lite'>F5</span>",
        blueprints="One output pin, many wires &mdash; universal and unremarkable.",
        labview="Same, plus the structural rule that a <b>direct cycle is illegal</b> (a broken "
                "wire); feedback exists only through a Feedback Node or a shift register.",
        simulink="Same; recombination is an explicit block, never implicit.",
        other="<b>Routers recombine badly</b>: Node-RED's <code>switch</code>, n8n's If, Max's "
              "<code>gate</code>/<code>route</code>, Pd's <code>moses</code>/<code>select</code>, "
              "Flyde and NoFlo all branch by sending a message out one port, and recombination "
              "becomes an implicit fan-in or a join that waits on counts and timeouts. "
              "<b>React Flow</b>'s official guidance is to write <code>null</code> to the dead handle.",
        lesson="Fan-out is free everywhere. <b>Fan-IN is where the designs diverge</b>, and the "
               "message-routing family is the one that gets it wrong &mdash; which is the "
               "argument for a region with an explicit join over a router with two output ports.",
    ),
    dict(
        construct="<b>sequencing pure effects</b><br><span class='sid-lite'>F9</span>",
        blueprints="<b>White execution wires.</b> Every node has exec pins beside its data pins; "
                   "order is drawn, not inferred.",
        labview="No exec wire &mdash; ordering is data dependency, plus the structure boundary. "
                "Kodosky: " + _q("We represented control-flow structures as boxes in a data-flow "
                "diagram … its boundary could hold iteration state information") + ".",
        simulink="Implicit in the signal graph; ordering without a signal needs an explicit "
                 "construct.",
        other="<b>Unity</b>'s If pulses one side the same way. <b>DRAKON</b>'s layout law is "
              + _q("the main route must lie on the skewer") + " and " + _q("the further to the "
              "right, the worse") + " &mdash; order as geometry rather than as a cable.",
        lesson="<b>This is the split Python forces.</b> Blueprints pays for imperative order with "
               "a second cable on every node; LabVIEW refuses and makes you express order as "
               "data. Python is imperative, so a projection that draws only data edges cannot be "
               "a faithful oracle &mdash; two different orderings would render identically.",
    ),
]


LESSONS = [
    dict(title="A control construct is a REGION, and that was settled in 1987",
         body="Ferrante, Ottenstein &amp; Warren's program dependence graph adds "
              + _q("region nodes to summarize the set of control conditions for a node") +
              ". Every representation that has to be <i>correct</i> &mdash; the PDG, the sea of "
              "nodes, MLIR's <code>scf.if</code>, LabVIEW's Case Structure &mdash; makes an "
              "<code>if</code> a region. It is not a taste call, and bbox-ui's "
              "<code>RegionKind = &quot;loop&quot; | &quot;branch&quot; | &quot;group&quot;</code> "
              "already agrees."),
    dict(title="Scopes see out; only yields come out",
         body="MLIR states it outright: a region can reference values defined outside it, but "
              + _q("a value defined in a region can never be used outside of the region") +
              ", so results leave through <code>scf.yield</code>. LabVIEW enforces the same thing "
              "with a compile error &mdash; an unwired output tunnel is <i>Tunnel: missing "
              "assignment to tunnel</i>, because " + _q("since only one frame of the structure is "
              "executed, every frame must assign values to all the outputs") + ". <b>That error "
              "is Python's <code>UnboundLocalError</code></b>: a name written on one arm and read "
              "after the region."),
    dict(title="One join per leaving value, driven by the same predicate",
         body="Dennis's merge actor, Arvind &amp; Culler's " + _q("one switch per value entering, "
              "one merge per value leaving") + ", Cytron's &phi; (" + _q("each execution of a "
              "&phi;-function uses only one of the operands") + "), Simulink's Merge, LabVIEW's "
              "output tunnel. An <i>un</i>controlled merge is nondeterministic (Lee &amp; Parks), "
              "which is why every join is driven by the one predicate."),
    dict(title="Every feedback cycle needs a seed, and five products invented the same object",
         body="LabVIEW's shift register, Simulink's Unit Delay with an Initial condition, MLIR's "
              "<code>iter_args</code>, Blender's zone output items, Houdini's Fetch Feedback. "
              "Your own rule from the grammar doc &mdash; " + _q("all feedback traces have to go "
              "through an initial variable first") + " &mdash; is the sixth independent "
              "statement of it. <b>The rule is not &ldquo;no backward arrows&rdquo;; it is "
              "&ldquo;no delay-free cycle&rdquo;</b>, which is a much better fit for Python, "
              "where straight-line code is a DAG by construction and real feedback only enters "
              "where the code loops."),
    dict(title="Hiding the arms is the measured cost, and NI's own users say so",
         body="Green &amp; Petre measured it: " + _q("only one arm of a LabVIEW conditional is "
              "visible at any one moment &hellip; every subject's performance was worse in "
              "LabVIEW than in text") + " on conditional questions. NI declined the side-by-side "
              "request, but read the reasons &mdash; altenbach: " + _q("I don't like the wires "
              "that point nowhere") + "; NI R&amp;D: stacked cases " + _q("kind of a pain to work "
              "with when you start adding additional tunnels") + ". <b>Those are objections to "
              "tunnels, not to visible arms.</b> A cable landing on a real inner port points "
              "somewhere and needs no copy per case &mdash; which is exactly what bbox-ui's "
              "arms-stacked region does, and why it is not simply repeating LabVIEW's mistake."),
]


CITATIONS = [
    f"<b>Branching</b> &mdash; <code>{BRANCH}</code>. Primary sources only, 81 indexed entries: "
    "NI help via the rajsite mirror, the NI Style Checklist, Knowledge Base and Idea Exchange "
    "threads answered by NI staff, Kodosky's HOPL paper, Green &amp; Petre, Whitley &amp; "
    "Blackwell, Dennis, Arvind &amp; Culler, Buck &amp; Lee, Lee &amp; Parks, Cytron, Click, "
    "Ferrante, the MLIR reference, the TensorFlow cond_v2 RFC, XLA, MathWorks, the Ptolemy "
    "<code>Case</code> source, and the manuals/source of 18 node editors.",
    f"<b>Loops</b> &mdash; <code>{LOOPS}</code>. The per-tool table (MLIR <code>scf</code>, "
    "LabVIEW shift registers and auto-indexing, Simulink For/While Iterator and Unit Delay, "
    "Houdini Block Begin/End and Solver SOP, Blender Repeat and Simulation zones, TouchDesigner "
    "Feedback TOP, Grasshopper + Anemone, Unreal ForLoop/WhileLoop, Dennis/Arvind, synchronous "
    "dataflow, Kodosky) plus the five-variant score and the analyzer contract.",
    "<b>The uncommitted IfExp change</b> &mdash; read out of <code>git diff pyblocks/analyzer.py</code> "
    "in <code>/home/bam/pyblocks</code> during this build: <code>ast.IfExp</code> now lowers to "
    "<code>add_node(&quot;region&quot;, &quot;conditional-expression&quot;, &quot;if · else&quot;, "
    "&hellip;, tags=[&quot;control&quot;, &quot;opaque&quot;])</code> with a <code>condition</code> "
    "edge in and a <code>may</code>-certainty edge out. Working tree only, not in HEAD.",
    "<b>The five faces and the region ruling</b> &mdash; <code>blockPort.layout.ts:45</code>, "
    "<code>hosts/regionScene.ts:13&ndash;20</code>, <code>pyblocks/blockview.py:22</code>, "
    "<code>pyblocks/schema.py:19</code>, all read in this build.",
]


UNVERIFIED = [
    "<b>The unit-delay operator names.</b> <code>C - Synchronous Dataflow</code> names the family "
    "as Lustre <code>pre</code>/<code>fby</code>, Faust <code>~</code> and Simulink's Unit Delay. "
    "The Jul-20 thinking pass that introduced them says so itself: " + _q("I did not open "
    "Faust/Lustre/SCADE docs in this pass &mdash; treat the operator names (<code>~</code>, "
    "<code>fby</code>, <code>pre</code>) as leads to confirm, not gospel") + ". Simulink's Unit "
    "Delay <i>is</i> confirmed (loops research, source&nbsp;6&ndash;8); the other three are not.",
    "<b>Unreal's multi-way switch.</b> Blueprints almost certainly has Switch-on-Int / -Enum / "
    "-String nodes, but neither research pass covered them, so the N-way row's Blueprints cell is "
    "left blank rather than filled from memory.",
    "<b>LabVIEW's Sequence Structure.</b> The obvious analogue for F9 (sequencing pure effects) "
    "and it is not in either pass &mdash; the passes covered the Case Structure and the loops, "
    "not the sequence structures. Left out of the table.",
    "<b>Everything below the line.</b> <code>try</code>/<code>except</code>/<code>finally</code>, "
    "<code>with</code>, generators, <code>async</code>/<code>await</code>, in-place mutation, "
    "tuple unpacking, multiple returns, default arguments and <code>break</code>/"
    "<code>continue</code> have <b>no prior-art research in the vault at all</b>. That is not an "
    "accident of this report &mdash; it maps exactly onto where bbox-ui's own design is settled "
    "(regions) versus open, and it is the brief for the next deep-research pass.",
]

# --------------------------------------------------------------------------
# The eleven rows the two 2026-09-02 passes did NOT cover.
#
# Sourced by a dedicated research pass on 2026-09-23 that fetched the product
# docs directly (Epic, MathWorks, NI) where the vault had no fact. A dagger
# marks a claim whose only source is third-party or a search snippet — those
# are repeated in UNVERIFIED below rather than quietly promoted.
# --------------------------------------------------------------------------

DAG = '<sup style="color:#e8c06a" title="see UNVERIFIED">&dagger;</sup>'

PRIOR_ART += [
    dict(
        construct="<b>function definition</b><br><span class='sid-lite'>B1</span>",
        blueprints="<b>Function</b> &mdash; " + _q("Unlike Blueprint Macros, you can only add data "
                   "inputs and outputs to Functions") + "; pure functions get no exec pins. Three "
                   "collapse tiers with <i>different</i> semantics: Collapse Nodes (a copy), "
                   "Collapse to Function (one compiled callable), Collapse to Macro (inlined per use).",
        labview="<b>subVI</b> with a <b>connector pane</b> &mdash; required / recommended / "
                "optional terminals, standard placement. Every VI is its own <code>.vi</code>, "
                "always a reference.",
        simulink="<b>Subsystem</b> (Ctrl-G, auto Inport/Outport); virtual vs atomic vs "
                 "<b>Model Reference</b> (own file, context-independent interface); or a "
                 "<b>Simulink Function</b> block with a textual prototype <code>y = f(u)</code>.",
        other="<b>Blender</b> node group (Group Input/Output sockets, a datablock with a user "
              "count). <b>Houdini</b> subnet (copy) vs HDA (reference). <b>Prograph</b> put every "
              "method in its own window and had no call-graph overview.",
        lesson="Ports = parameters + named outputs, everywhere. And every tool that got "
               "composition right <b>split organise (copy) from reuse (reference)</b> and shows "
               "which one a node is in its chrome &mdash; the distinction Python makes with "
               "<code>def</code> vs a nested helper.",
    ),
    dict(
        construct="<b>function call</b><br><span class='sid-lite'>V1</span>",
        blueprints=_q("data pins of a Function Call node correspond to the parameters and return "
                      "value of the corresponding function") + ". A <b>Target</b> pin exists on "
                   "every node, defaults to Self and is hidden (<code>DefaultToSelf</code> / "
                   "<code>HideSelfPin</code>).",
        labview="The subVI node shows its connector-pane terminals. NI R&amp;D: " + _q("You "
                "explicitly declare all of inputs to your member VIs in the connector pane. "
                "LabVIEW never adds an implied input") + ".",
        simulink="<b>Function Caller</b> &mdash; " + _q("calls and executes a Simulink function")
                 + "; its ports come from the prototype.",
        other="<b>Max/MSP</b> abstractions are called by filename &mdash; save the file and every "
              "patcher using it updates, even while loaded.",
        lesson="<b>The block is labelled by the callee's formal parameter names, not the caller's "
               "variables</b> &mdash; pyblocks' README says the same ("
               + _q("the block is call site independent") + "). And the receiver is an ordinary "
               "input port: defaulted or hidden, <b>never absent</b>.",
    ),
    dict(
        construct="<b>multiple returns</b><br><span class='sid-lite'>B2</span>",
        blueprints="Any number of output data pins, added in the Details panel; a struct result is "
                   "opened with <b>Break Struct</b> or <b>Split Struct Pin</b>.",
        labview="Several output terminals on the connector pane, or one cluster out plus "
                "<b>Unbundle by Name</b>.",
        simulink="One <b>Outport</b> per output (<code>Out1…Outn</code>), or a bus plus a "
                 "<b>Bus Selector</b> that extracts " + _q("the elements you select by name") + ".",
        other="<b>Blender</b> Group Output sockets. pyblocks golden 07 splits at the call site by "
              "<i>unpacking</i>, not by return type.",
        lesson="<b>Outputs are named at the definition in every single tool.</b> Python's "
               "anonymous tuple is the outlier &mdash; which is exactly why your grammar doc "
               "rules for a <code>NamedTuple</code> return: so the ports belong to the block "
               "rather than to whatever the caller happened to call them.",
    ),
    dict(
        construct="<b>break / continue / early return</b><br><span class='sid-lite'>L3 F1</span>",
        blueprints="<b>ForLoopWithBreak</b> (" + _q("an input pin that allows the loop to be "
                   "broken") + "); a <b>Break</b> exec input on the Map/Set ForEachLoop variants.",
        labview="The <b>conditional terminal</b> <i>is</i> <code>break</code> &mdash; on While "
                "Loops always, on For Loops since 8.5 (" + _q("stop when a Boolean condition or "
                "an error occurs") + ", after which the auto-indexed output size is "
                "unpredictable). No <code>continue</code>, no <code>return</code>." + DAG,
        simulink=_q("There is no explicit break statement") + " &mdash; a While Iterator ends only "
                 "via <code>cond</code> or its iteration limit.",
        other="<b>Scratch</b> and <b>DRAKON</b> keep control structural, with no wire at all. "
              "bbox-ui's own answer scored ten variants and picked <b>B5, a stop mark beside the "
              "call, 81/100</b> (<code>DP - Break &amp; Continue</code>).",
        lesson="<b>Early exit is control with no data, and no dataflow tool draws it as a wire.</b> "
               "A terminal on the header, an exec pin, or nothing. Which is the same conclusion "
               "<code>CONTROL-FLOW-PLAN.md</code> already shipped: a Badge, never a cable.",
    ),
    dict(
        construct="<b>try / except / finally</b><br><span class='sid-lite'>E1</span>",
        blueprints="No exceptions. Failure is a <b>second exec-out</b> on the node &mdash; "
                   "<code>Cast To</code> has a <i>Cast Failed</i> pin, latent nodes have "
                   "Success/Failure outs." + DAG,
        labview="No exceptions. The <b>error cluster</b> (status, code, source) is threaded "
                "<code>error in</code> &rarr; <code>error out</code> through every subVI to "
                + _q("help control execution flow") + ", and is handled by " + _q("a Case "
                "structure … to distinguish between the error and no error conditions") + ".",
        simulink="No exceptions. The <b>Assertion</b> block " + _q("halts the simulation and "
                 "returns an error message by default") + ".",
        other="pyflow-analysis emitted <b>no graph at all</b> for <code>try</code>/"
              "<code>except</code>. Plotkin &amp; Pretnar: handlers are the <i>dual</i> of "
              "effects, not an algebraic operation over them.",
        lesson="<b>No mature VPL has exceptions or unwinding.</b> Errors are data on a wire "
               "(LabVIEW) or one more outcome pin (Blueprints). So <code>except</code> is a "
               "branch on an error <i>outcome</i> and <code>finally</code> an always-taken "
               "continuation &mdash; and the thing to copy is the consistent fault contract, not "
               "the parameter ceremony.",
    ),
    dict(
        construct="<b>with / context manager</b><br><span class='sid-lite'>E5</span>",
        blueprints="&mdash;",
        labview="The <b>refnum lifecycle</b>: Open &rarr; use &rarr; <b>Close Reference</b> on the "
                "same wire. " + _q("you must close the reference") + " or it leaks. The resource "
                "is the wire; nothing frames it.",
        simulink="&mdash;",
        other="pyblocks golden <code>e08_with_statement_swallows_exception</code>; the "
              "five-elements audit labels <code>With</code> as CONTROL but notes "
              + _q("acquire/release is the point") + ".",
        lesson="<b>A scoped resource is a WIRE</b> whose producer is the open and whose last "
               "consumer is the close; the region only marks the extent. It threads exactly like "
               "<code>self</code> &mdash; by value, explicitly re-emitted.",
    ),
    dict(
        construct="<b>generator / yield</b><br><span class='sid-lite'>S1</span>",
        blueprints="&mdash;",
        labview="<b>Channel Wires</b> (2016) &mdash; " + _q("depict asynchronous data flow: data "
                "flows from a source loop while that loop is still executing to allow sink loops "
                "to start execution immediately") + ". The <b>Stream</b> channel " + _q("operates "
                "like a queue … one writer and one reader") + ".",
        simulink="&mdash; every Simulink line is already a per-step sample stream.",
        other="<b>Kahn process networks</b> &mdash; the output is independent of the scheduling. "
              "pyblocks has ten generator goldens (<code>f01</code>&ndash;<code>f10</code>) "
              "including the send protocol and a lazy map that sees a later mutation.",
        lesson="<b>A lazy stream is dataflow's native model, not an exotic case</b>: a wire "
               "carrying a token sequence between two things that run concurrently. LabVIEW gives "
               "it its own wire <i>appearance</i> &mdash; which is the precedent for drawing a "
               "<code>yield</code> port differently from a <code>return</code> port.",
    ),
    dict(
        construct="<b>async / await</b><br><span class='sid-lite'>B5</span>",
        blueprints="<b>Latent</b> nodes &mdash; <code>Delay</code> is " + _q("Perform a latent "
                   "action with a delay") + " with a Duration in and a Completed exec out; a clock "
                   "icon marks them." + DAG,
        labview="Dataflow parallelism is already the default &mdash; unrelated nodes may run in "
                "any order or concurrently. Parallel loops are joined by Channel Wires; "
                "<b>Start Asynchronous Call</b> / <b>Wait On Asynchronous Call</b> is the "
                "call-and-collect pair." + DAG,
        simulink="<b>Function-Call Subsystem</b> &mdash; " + _q("executes when a function-call "
                 "input port receives a function-call event") + ". <b>Rate Transition</b> is an "
                 "explicit adapter with a <i>named policy</i>.",
        other="<b>Ptolemy</b> makes it a different <b>director</b> &mdash; SDF vs DE are separate "
              "models of computation, not cable styles. pyblocks: <code>await</code> is " + _q("a "
              "visible suspension boundary, while scheduling/interleavings remain explicitly "
              "unclaimed") + ".",
        lesson="<b>Async is a different model of computation, not a cable style.</b> Every tool "
               "separates it structurally and marks the <i>suspension</i> on the node or the arc; "
               "<b>none of them pretends the interleaving is drawn</b>. That is also the honest "
               "boundary of a round-trip oracle.",
    ),
    dict(
        construct="<b>mutation in place</b><br><span class='sid-lite'>F7</span>",
        blueprints="<b>Set Members in Struct</b> &mdash; " + _q("Member variables that are not "
                   "exposed will not be changed") + ". Struct <i>copy</i> semantics underneath.",
        labview="By value on purpose: " + _q("the value on each individual wire is independent "
                "from every other wire … By-reference syntax shatters that independence") + ". The "
                "object is re-emitted through Bundle / Unbundle by Name. <b>No <code>this</code>, "
                "no <code>self</code></b>.",
        simulink="<b>Data Store Memory</b> + Read / Write &mdash; a named shared store shipping "
                 "read-before-write / write-after-read / write-after-write <b>diagnostics</b>, "
                 "because " + _q("data store reads and writes occur in the expected order") +
                 " is the whole risk.",
        other="<b>Prograph</b> let side effects flow silently through class instances and paid for "
              "it (" + _q("integrity of data will be compromised") + "). pyblocks derives a "
              "top-wall <b>effect port</b> with a warm <code>mut</code> pill and three states: "
              "pure / mutates / unknown.",
        lesson="<b>Mutation is never invisible.</b> Either the object wire is re-emitted "
               "(by-value threading &mdash; visually <i>identical</i> in LabVIEW and Unreal, "
               "different semantics underneath) or the store is an explicit node with ordering "
               "diagnostics. A receiver is an ordinary input port, never an implicit self.",
    ),
    dict(
        construct="<b>a constant / literal</b><br><span class='sid-lite'>V3 F13</span>",
        blueprints="A literal typed into an unconnected input pin &mdash; the pin default. "
                   "<b>Promote to Variable</b> turns it into shared config." + DAG,
        labview="Block-diagram <b>constant</b> nodes by type; unwired optional terminals take "
                "their connector-pane defaults. NI's own checklist steers toward " + _q("the "
                "built-in LabVIEW string constants") + " over free-floating ones." + DAG,
        simulink="A <b>Constant</b> block (" + _q("generates a real or complex constant value "
                 "signal") + "); shared values become masked-subsystem parameters.",
        other="pyblocks ships a <b>literal pill</b> &mdash; <code>name: type = value</code> "
              "rendered on the unconnected port itself.",
        lesson="<b>A literal is shown at the port it feeds, not as a floating node</b> &mdash; "
               "unless it is shared config, which earns a node. LabVIEW's free constant is the "
               "outlier and its own style checklist steers away from it. That is the whole "
               "V3-vs-F13 distinction: value at the call, value at the definition.",
    ),
    dict(
        construct="<b>unpacking a tuple</b><br><span class='sid-lite'>F6</span>",
        blueprints="<b>Break Struct</b> (" + _q("break the struct into its individual parts") +
                   ") and <b>Split Struct Pin</b>, reversible with Recombine Struct Pin.",
        labview="<b>Unbundle by Name</b> &mdash; " + _q("you can resize the function until the "
                "name of the element you want appears") + ". Index Array is the positional fallback.",
        simulink="<b>Demux</b> is positional (" + _q("ports are ordered from top to bottom") + ") "
                 "and <b>Bus Selector</b> is by name &mdash; both ship, and the named one is what "
                 "MathWorks documents for structured data.",
        other="pyblocks' <b>Splitter</b>: only the <code>.accessor</code> form becomes a splitter; "
              "a plain fan-out stays several cables. Your v1 pick " + _q("even works for nested "
              ".var.foo.bar") + ".",
        lesson="<b>Unpacking is a splitter keyed BY NAME wherever the tool had a choice</b> "
               "&mdash; Unbundle by Name, Bus Selector, Break Struct. Positional (Demux, tuple "
               "index) is always the fallback. So <code>a, b = f()</code> should read the "
               "callee's <i>named</i> outputs, and <code>x.attr</code> is a splitter, not a port "
               "on the receiver.",
    ),
]


CITATIONS += [
    "<b>The 2026-09-23 pass</b> that filled the eleven rows above fetched the product docs "
    "directly where the vault had no fact: Epic (Functions, Nodes, Flow Control, Blueprint Struct "
    "Variables, UFunctions, Event Dispatchers, Delay, ForEachLoop&nbsp;Map/Set, Reroute, "
    "Variables), MathWorks (For&nbsp;Each / For&nbsp;Iterator / While&nbsp;Iterator Subsystem, "
    "Switch&nbsp;Case, If, Merge, Unit&nbsp;Delay, Data&nbsp;Store&nbsp;Memory, Demux, "
    "Bus&nbsp;Selector, Function&nbsp;Caller, Constant, Assertion, Model Referencing, Rate "
    "Transition, sorted execution order), NI (Block Diagram Data Flow, Connector Pane Patterns, "
    "Shift Registers, Channel Wires, Closing References, conditional For-Loop exit, the Style "
    "Checklist, LVOOP <i>Decisions Behind the Design</i>), Cycling&nbsp;'74 "
    "(<code>trigger</code>), Zélus, Blender, SideFX, Scratch Wiki and DRAKON.",
    "<b>Also read from the vault for those rows</b>: <code>Classes in Visual Dataflow Languages "
    "&mdash; Prior Art and the Region Grammar (Deep Research, 2026-09-03)</code>; "
    "<code>Simulink + LabVIEW &mdash; What 30 Years of Visual Programming Teaches Block View "
    "(2026-07-24)</code>; <code>LabVIEW, Unreal Blueprint &amp; Simulink &mdash; Vocabulary and "
    "UI Controls Gap Analysis Work Order (2026-09-03)</code>; the concept notes "
    "<code>C - By-Value Object Threading</code>, <code>C - Kahn Process Networks</code>, "
    "<code>C - Signals vs Events</code>; and <code>DP - Break &amp; Continue</code> / "
    "<code>DP - Mutation &amp; Side Effects</code>. All four paths confirmed to exist during "
    "this build, and <code>DP - Break &amp; Continue</code>'s " + _q("B5 wins, 81/100") +
    " was read verbatim rather than relayed.",
]

UNVERIFIED += [
    "<b>Marked &dagger; in the table.</b> Blueprints: the <code>Cast&nbsp;To &rarr; Cast Failed</code> "
    "exec pin and latent Success/Failure outs (vault work order + forums, no Epic page); the "
    "latent-node clock icon (an old-docs search snippet); a literal editable on an unconnected "
    "input pin (evidenced only by a screenshot in the work order). LabVIEW: the Conditional "
    "tunnel mode, Start/Wait&nbsp;On&nbsp;Asynchronous&nbsp;Call and the block-diagram constant "
    "details (all three NI pages are JavaScript-only, so the text is a search snippet); and "
    "&ldquo;no <code>continue</code> construct&rdquo;, which is an inference with no NI page "
    "behind it.",
    "<b>The ForEachLoop pin names.</b> Epic's Flow Control page does not list the array variant "
    "at all &mdash; only the Map and Set variants were confirmed on dev.epicgames.com. "
    "<i>Array Element</i> / <i>Array Index</i> come from third-party pastes.",
    "<b>Not attempted:</b> Stateflow error states, Simulink's function-call line style, and "
    "whether the For Iterator Subsystem has a break. Left out of the table rather than guessed.",
]
