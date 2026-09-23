"""The exhaustive Python-construct inventory the block view has to draw.

Why this file exists
--------------------
Zach, 2026-09-23 (`Sources/Daily Notes/Daily Note - Sep 23 2026.md`): *"the key
thing is we need to strip python down to this lowest level to look at the actual
structure of it right.. Can you please make an exhaustive list of all the python
syntax we need to be able to support."*

Exhaustive is a checkable claim here, not a vibe: Python's grammar has a finite
node set, and `ast` publishes it. Measured on CPython 3.12.3 the drawable
surface is **28 statements + 27 expressions + 8 match patterns + 7 helper
nodes**. `EVERY_NODE` below is that set, and `coverage_report()` asserts that
every one of them is claimed by exactly one scenario — so a construct cannot be
forgotten silently, and a new Python release shows up as a failure rather than
as a gap nobody noticed.

`expr_context` (Load/Store/Del), `operator`/`unaryop`/`cmpop`/`boolop` and `mod`
are deliberately NOT in the drawable set: they are labels *on* a node, not nodes
that could ever get their own box. They ride on the scenario that owns their
carrier (BinOp, Compare, ...).

WHY the `becomes` field, and why it uses these seven words: they are the union
of the two vocabularies that already ship, not new ones invented here —
pyblocks' `NodeKind = "data" | "transform" | "region" | "sink" | "branch"`
(`/home/bam/pyblocks/pyblocks/schema.py:19`) and bbox-ui's
`RegionKind = "loop" | "branch" | "group"` plus the `break`/`continue`/`pass`
marks from `docs/CONTROL-FLOW-PLAN.md`. A construct's `becomes` is the answer to
the only question that decides the drawing: does it get a box, a wire, a frame,
a badge, or nothing?
"""
from __future__ import annotations

import ast
from dataclasses import dataclass, field


# --------------------------------------------------------------------------
# The grammar, as ground truth. Regenerate with:
#   python3 -c "import ast;print([n.__name__ for n in ast.stmt.__subclasses__()])"
# --------------------------------------------------------------------------

STMT = [n.__name__ for n in ast.stmt.__subclasses__()]
EXPR = [n.__name__ for n in ast.expr.__subclasses__()]
PATTERN = [n.__name__ for n in ast.pattern.__subclasses__()]
HELPERS = ["arguments", "arg", "keyword", "alias", "withitem",
           "match_case", "comprehension", "ExceptHandler"]

EVERY_NODE = sorted(set(STMT + EXPR + PATTERN + HELPERS))

# Labels that ride on a carrier node rather than earning a box of their own.
RIDERS = {
    "operator": [n.__name__ for n in ast.operator.__subclasses__()],
    "unaryop": [n.__name__ for n in ast.unaryop.__subclasses__()],
    "cmpop": [n.__name__ for n in ast.cmpop.__subclasses__()],
    "boolop": [n.__name__ for n in ast.boolop.__subclasses__()],
    "expr_context": [n.__name__ for n in ast.expr_context.__subclasses__()],
}


BECOMES = {
    "block":     ("Block", "the black box itself — its signature IS its ports"),
    "transform": ("Transform", "a box that consumes inputs and produces outputs"),
    "data":      ("Data", "a pill: a literal or a named value, no computation"),
    "wire":      ("Wire", "no box at all — it is the cable, or a label on one"),
    "region":    ("Region", "a frame holding blocks; one node, ports on its corner card"),
    "mark":      ("Mark", "a badge on a block — never a cable"),
    "sink":      ("Sink", "a terminal: the value leaves the graph here"),
    "not-drawn": ("Not drawn", "real syntax with no graph presence; it feeds the palette or the types"),
}


@dataclass
class Scenario:
    id: str
    name: str
    nodes: list[str]
    becomes: str
    canonical: str
    ports: str
    examples: list[tuple[str, str]]
    covered: str | None = None          # golden case id, or None => gap
    note: str = ""
    open_q: str = ""
    riders: list[str] = field(default_factory=list)


@dataclass
class Group:
    id: str
    title: str
    lede: str
    scenarios: list[Scenario]


def coverage_report(groups: list[Group]) -> tuple[list[str], list[str]]:
    """Every grammar node claimed once, and only once. Returns (missing, dupes)."""
    claimed: dict[str, list[str]] = {}
    for g in groups:
        for s in g.scenarios:
            for n in s.nodes:
                claimed.setdefault(n, []).append(s.id)
    missing = [n for n in EVERY_NODE if n not in claimed]
    dupes = [f"{n} -> {claimed[n]}" for n in sorted(claimed) if len(claimed[n]) > 1]
    unknown = [n for n in claimed if n not in EVERY_NODE]
    return missing + [f"NOT A GRAMMAR NODE: {u}" for u in sorted(unknown)], dupes


def S(**kw) -> Scenario:
    kw.setdefault("nodes", [])
    kw.setdefault("examples", [])
    return Scenario(**kw)


# ==========================================================================
# G1 — THE BOUNDARY: what makes a block at all
# ==========================================================================

G_BOUNDARY = Group("boundary", "The boundary — what makes a block", """
A block is a <code>def</code>. Nothing else in Python draws a box you can name,
give an interface to, and reuse. Everything in this section is about where the
wall goes and which ports are punched through it — the signature <b>is</b> the
port list, which is why <code>DP - Underlying Python Syntax for Block View</code>
rules that outputs are a <code>NamedTuple</code>: a tuple return has positions,
and a port needs a name.""", [

  S(id="B1", name="Function definition", nodes=["FunctionDef", "arguments", "arg"],
    becomes="block",
    canonical="def <name>(<in1>: T1, <in2>: T2) -> <Out>:\n    <block>\n    return <out>",
    ports="in: one per parameter, in declaration order · out: one per returned field",
    covered="01 linear chain",
    note="The one construct that is not a choice. Every other scenario is about what happens "
         "<i>inside</i> this wall or how two of these walls connect.",
    examples=[
      ("the minimum",
       "def decode(raw: bytes) -> Frame:\n    return Frame.from_bytes(raw)"),
      ("two in, one out",
       "def estimate(frame: Frame, gain: float) -> Pose:\n"
       "    scaled = scale(frame, gain)\n"
       "    return solve(scaled)"),
      ("a method — the receiver is a port too",
       "class Gripper:\n"
       "    def grasp(self, target: Pose, force: float) -> Grasp:\n"
       "        return Grasp(self.tool, target, force)"),
    ]),

  S(id="B2", name="Return — where output ports come from", nodes=["Return"],
    becomes="sink",
    canonical="return <out1>                 # one output port\n"
              "return <Out>(a=<x>, b=<y>)    # named output ports",
    ports="out: one port per field of the returned NamedTuple; a bare tuple gives positions, not names",
    covered="07 multiple outputs",
    note="A bare <code>return a, b</code> is <i>supported</i> but not <i>default</i> — it draws "
         "two ports called <code>0</code> and <code>1</code>. The NamedTuple form is what the "
         "grammar doc rules for, precisely so the drawing can label them.",
    examples=[
      ("default form — named ports",
       "class EstimateOut(NamedTuple):\n    pose: Pose\n    quality: float\n\n"
       "def estimate(frame: Frame) -> EstimateOut:\n"
       "    return EstimateOut(solve(frame), score(frame))"),
      ("supported form — positional",
       "def estimate(frame: Frame) -> tuple[Pose, float]:\n"
       "    return solve(frame), score(frame)"),
      ("no return at all — zero output ports, an effect block",
       "def publish(pose: Pose, topic: str) -> None:\n"
       "    _BUS.send(topic, pose)"),
    ]),

  S(id="B3", name="Keyword arguments at the call site", nodes=["keyword"],
    becomes="wire",
    canonical="<callee>(<in1>, name=<in2>, **<mapping>)",
    ports="none of its own — a keyword picks WHICH input port the cable lands on",
    covered="20 keyword arguments",
    note="The axis under test in golden 20 is that reordering keywords in source must not "
         "change the graph at all: the port is identified by the formal parameter, never by "
         "argument position.",
    examples=[
      ("reordered — same graph",
       "pose = estimate(gain=2.0, frame=frame)\n"
       "pose = estimate(frame=frame, gain=2.0)"),
      ("mixed positional and keyword",
       "grasp = plan(target, force=12.0, approach='top')"),
      ("**kwargs splat — the port list is no longer statically known",
       "cfg = {'force': 12.0, 'approach': 'top'}\n"
       "grasp = plan(target, **cfg)"),
    ]),

  S(id="B4", name="Starred — *args, and unpacking into a call", nodes=["Starred"],
    becomes="wire",
    canonical="def <name>(*<items>, **<opts>): ...\n<callee>(*<seq>)\n<a>, *<rest> = <seq>",
    ports="a variadic input port: one port that accepts N cables, not N ports",
    covered=None,
    open_q="Does a variadic port draw as one growing rail (LabVIEW's expanding node) or as "
           "N+1 slots with an always-empty tail? bbox-ui already has "
           "<code>variadic_port_v5</code> in pyblocks/examples — unreviewed.",
    note="GAP: <code>Starred</code> appears in zero of the 53 reviewed golden bodies.",
    examples=[
      ("collecting",
       "def merge(*poses: Pose) -> Pose:\n    return average(poses)"),
      ("splatting into a call",
       "poses = [a, b, c]\nbest = merge(*poses)"),
      ("star-unpack on the left of an assignment",
       "first, *rest = detections"),
    ]),

  S(id="B5", name="async def / await", nodes=["AsyncFunctionDef", "Await"],
    becomes="block",
    canonical="async def <name>(<in>) -> <Out>:\n    <x> = await <callee>(<in>)\n    return <x>",
    ports="the same ports as a sync block; the output is the <i>eventual</i> value, not the awaitable",
    covered="15 async concurrency",
    note="Golden 15 keeps the eventual-value abstraction: an <code>await estimate(...)</code> "
         "block outputs a <code>Pose</code>, not a <code>Task[Pose]</code>. The task/future "
         "container only becomes visible when it is stored, as with <code>gather</code>.",
    examples=[
      ("the ordinary case — await is invisible in the graph",
       "async def run(raw: bytes) -> Pose:\n"
       "    frame = await decode(raw)\n"
       "    return await estimate(frame)"),
      ("concurrency made visible — two cables into one gather block",
       "async def run(a: bytes, b: bytes) -> tuple[Pose, Pose]:\n"
       "    return await asyncio.gather(estimate(a), estimate(b))"),
      ("a task stored — now the container IS the value on the wire",
       "task = asyncio.create_task(estimate(frame))\n"
       "other = classify(frame)\n"
       "pose = await task"),
    ]),

  S(id="B6", name="lambda — the anonymous block", nodes=["Lambda"],
    becomes="block",
    canonical="<f> = lambda <in>: <expr>",
    ports="in: one per lambda parameter · out: exactly one, unnamed",
    covered=None,
    open_q="Draw a lambda as a real nested block, or as a literal pill on the port that "
           "receives it? Golden 03 (callable argument) poses the same question for a named "
           "function passed by reference and is still marked REVIEW.",
    note="GAP: absent from all 53 reviewed bodies. A lambda is a <code>def</code> with no "
         "name and one output — so it is a block by the B1 rule, but it has no title to draw.",
    examples=[
      ("a sort key",
       "best = max(poses, key=lambda p: p.confidence)"),
      ("injected behaviour — the port carries a block",
       "run(frame, estimator=lambda f, g: solve(f) * g)"),
      ("immediately bound — this one has a name after all",
       "scale = lambda p, k: Pose(p.x * k, p.y * k, p.z * k)"),
    ]),

  S(id="B7", name="class definition", nodes=["ClassDef"],
    becomes="block",
    canonical="class <Name>:\n    def <method>(self, <in>) -> <Out>: ...",
    ports="a class is not one block — it is a namespace of blocks sharing a <code>self</code> state port",
    covered=None,
    open_q="Is a class a region containing its methods, a palette entry that only appears once "
           "instantiated, or both? Goldens 41–48 select real methods but never draw the class "
           "that holds them. This is the largest undecided scenario in the inventory.",
    note="GAP as an axis: <code>ClassDef</code> appears in 54 golden FILES but in zero reviewed "
         "BODIES — it is always scaffolding, never the subject. NamedTuple and dataclass "
         "declarations are the same node and are pure type declarations (see B8).",
    examples=[
      ("a port type, not a block",
       "class EstimateOut(NamedTuple):\n    pose: Pose\n    quality: float"),
      ("state shared by two methods — one self port, two blocks",
       "class Tracker:\n"
       "    def update(self, pose: Pose) -> None:\n        self.last = pose\n\n"
       "    def predict(self, dt: float) -> Pose:\n        return extrapolate(self.last, dt)"),
      ("a callable class — indistinguishable from a def at the call site",
       "class Scale:\n"
       "    def __init__(self, k: float) -> None:\n        self.k = k\n\n"
       "    def __call__(self, p: Pose) -> Pose:\n        return Pose(p.x * self.k, p.y, p.z)"),
    ]),

  S(id="B8", name="Annotations and type aliases", nodes=["AnnAssign", "TypeAlias"],
    becomes="not-drawn",
    canonical="<name>: <T> = <value>\n<name>: <T>          # declaration only\ntype <Alias> = <T>",
    ports="none — annotations decide the TYPE printed on a port, never whether a port exists",
    covered=None,
    note="GAP for <code>TypeAlias</code> (the 3.12 <code>type X = Y</code> statement): zero "
         "goldens. An annotation with no value is the one assignment that produces no wire.",
    examples=[
      ("annotated binding — a wire whose type is now known",
       "pose: Pose = estimate(frame)"),
      ("declaration only — no value, so no cable",
       "pose: Pose"),
      ("3.12 type alias — decides a port label, draws nothing",
       "type Poses = list[Pose]\n\ndef best(items: Poses) -> Pose: ..."),
    ]),

  S(id="B9", name="import — the palette, not the graph", nodes=["Import", "ImportFrom", "alias"],
    becomes="not-drawn",
    canonical="import <module>\nfrom <module> import <name> as <alias>",
    ports="none — an import decides what the search bar can offer, and where a callee's contract is read from",
    covered="49 standard library call",
    note="Zach, in the grammar doc: <i>\"To include a block that already exists means that you "
         "will import it. so the search bar basically corresponds to the things you can import "
         "into this file.\"</i> Golden 49's whole axis is that the callee is <b>not</b> in the "
         "file, so its port list has to come from the resolver (jedi + typeshed), not the source.",
    examples=[
      ("module import — the callee's contract comes from typeshed",
       "import math\n\nangle = math.atan2(p.y, p.x)"),
      ("from-import — the block appears under its bare name",
       "from geometry import solve\n\npose = solve(frame)"),
      ("aliased — the drawn title is the alias, the contract is the original",
       "from geometry import solve as solve_pose\n\npose = solve_pose(frame)"),
    ]),
])


# ==========================================================================
# G2 — VALUES AND THE CHAIN: the 80% that is just boxes and cables
# ==========================================================================

G_VALUES = Group("values", "Values and the chain — the ordinary 80%", """
Nothing in this section needs a frame, an arm or a badge. A call is a box, a
binding is a cable, a literal is a pill. This is where the block view is already
solved and the goldens mostly PASS — and it is worth seeing the whole of it laid
out, because it is the baseline every harder scenario has to degrade gracefully
into.""", [

  S(id="V1", name="Call — the transform", nodes=["Call"],
    becomes="transform",
    canonical="<out> = <callee>(<in1>, <in2>)",
    ports="in: one per argument, named by the callee's formals · out: one per returned field",
    covered="01 linear chain",
    note="The single most common node in every golden: present in 52 of 53 reviewed bodies.",
    examples=[
      ("plain",
       "frame = decode(raw)"),
      ("nested — the inner call has no name, only a cable (see F4)",
       "pose = estimate(decode(raw), 2.0)"),
      ("a method call — the receiver is the first input port",
       "grasp = gripper.plan(target)"),
    ]),

  S(id="V2", name="Binding — the cable's name", nodes=["Assign", "Name"],
    becomes="wire",
    canonical="<name> = <expr>",
    ports="none — a binding names a cable; it never adds a box",
    covered="08 anonymous intermediate",
    note="Golden 08's axis is <i>binding-invariance</i>: naming an intermediate or inlining it "
         "must produce the identical graph. If the drawing changes when you introduce a "
         "variable, the projection is wrong.",
    examples=[
      ("named intermediate",
       "frame = decode(raw)\npose = estimate(frame)"),
      ("the same graph, inlined",
       "pose = estimate(decode(raw))"),
      ("chained targets — one cable, two names",
       "a = b = decode(raw)"),
    ]),

  S(id="V3", name="Literal — the data pill", nodes=["Constant"],
    becomes="data",
    canonical="<out> = <callee>(<in>, <literal>)",
    ports="attaches to one input port; it has an output and no input",
    covered="02 literal argument",
    note="The rung where <code>simple</code> view earns its keep: a literal has one value and "
         "no interface, so its ports collapse to a single point and it draws as a pill, not a box. "
         "That is <code>NodeKind=\"data\"</code> in pyblocks' schema.",
    examples=[
      ("a number on a port",
       "pose = estimate(frame, 2.0)"),
      ("a flag — often better drawn as a port preset than a pill",
       "cfg = load(path, strict=True)"),
      ("a sentinel — None is a literal like any other",
       "pose = estimate(frame, None)"),
    ]),

  S(id="V4", name="Operator — the anonymous transform", nodes=["BinOp", "UnaryOp"],
    becomes="transform",
    riders=["Add", "Sub", "Mult", "MatMult", "Div", "FloorDiv", "Mod", "Pow",
            "LShift", "RShift", "BitOr", "BitXor", "BitAnd", "UAdd", "USub", "Invert"],
    canonical="<out> = <in1> <op> <in2>",
    ports="in: 2 (or 1 for unary), unnamed · out: 1",
    covered="present in 14 reviewed bodies",
    open_q="At grain 1 an operator is a block like any other, and <code>a*b + c</code> is two "
           "boxes. That is correct and unreadable. Does an arithmetic expression collapse to a "
           "single labelled box, and if so where is the boundary?",
    note="The 13 binary and 4 unary operator tokens are labels on one node, not 17 node types — "
         "they ride on <code>BinOp</code>/<code>UnaryOp</code>.",
    examples=[
      ("one operator, one box",
       "scaled = raw * gain"),
      ("compound — two boxes, or one?",
       "score = weight * quality + bias"),
      ("matrix multiply — the one operator that is obviously a block",
       "world = extrinsics @ camera_pose"),
    ]),

  S(id="V5", name="Predicate — comparison and boolean logic", nodes=["Compare", "BoolOp"],
    becomes="transform",
    riders=["Eq", "NotEq", "Lt", "LtE", "Gt", "GtE", "Is", "IsNot", "In", "NotIn", "And", "Or", "Not"],
    canonical="<flag> = <in1> <cmp> <in2>\n<flag> = <a> and <b>",
    ports="in: 2+ · out: 1 boolean — the cable that drives a branch region's predicate port",
    covered="09 branch",
    note="<code>and</code>/<code>or</code> short-circuit, so a boolean op is <i>also</i> control "
         "flow: the right operand may not evaluate. Drawn as a pure transform that is a lie "
         "whenever the right side has an effect.",
    examples=[
      ("a chained comparison — one node, two operators",
       "ok = 0.0 < quality <= 1.0"),
      ("membership",
       "known = label in CATALOG"),
      ("short-circuit — `probe` may never run",
       "usable = pose is not None and probe(pose)"),
    ]),

  S(id="V6", name="Attribute — a path elided onto the cable", nodes=["Attribute"],
    becomes="wire",
    canonical="<out> = <callee>(<obj>.<field>)",
    ports="none of its own — the <code>.field</code> becomes a label on the cable",
    covered="24 module config",
    note="Golden 24 keeps <code>.gain</code> collapsed into the config cable but <b>asserts</b> "
         "the label and the normalised elided path, so what looks like a shortcut is still an "
         "exact contract. Promoting every attribute access to its own getter box is the "
         "alternative, and it is what makes naive projections unreadable.",
    examples=[
      ("field read — a label, not a box",
       "pose = estimate(frame, CONFIG.gain)"),
      ("deep path — one cable, one elided label",
       "k = robot.tool.gripper.max_force"),
      ("attribute WRITE — this one is not a cable, it is a mutation (see F6)",
       "tracker.last = pose"),
    ]),

  S(id="V7", name="Subscript and slice", nodes=["Subscript", "Slice"],
    becomes="transform",
    canonical="<out> = <seq>[<index>]\n<out> = <seq>[<lo>:<hi>]",
    ports="in: the container + each index expression · out: 1",
    covered="present in 25 reviewed bodies",
    note="Cheap to treat like V6 (a label on the cable) when the index is a literal, and "
         "genuinely a transform when it is computed — the two cases look identical in source "
         "and must not look identical in the drawing.",
    examples=[
      ("literal index — elidable",
       "first = detections[0]"),
      ("computed index — a real box with two inputs",
       "chosen = detections[best_index]"),
      ("slice — three optional inputs",
       "window = samples[start:start + 32]"),
    ]),

  S(id="V8", name="Collection display", nodes=["List", "Tuple", "Set", "Dict"],
    becomes="transform",
    canonical="<out> = [<a>, <b>, <c>]\n<out> = {<k>: <v>}",
    ports="in: one per element (variadic) · out: 1 collection",
    covered="present in 36 (list) / 54 (tuple) reviewed bodies",
    note="A collect/pack block — the exact dual of the unpack in F5. This is the natural home "
         "for a variadic input rail, which is why B4's open question and this one are the same "
         "question.",
    examples=[
      ("a list of cables into one collection",
       "poses = [near, mid, far]"),
      ("a tuple — same shape, different type on the wire",
       "bounds = (lo, hi)"),
      ("a dict — pairs of cables, keys usually literal",
       "payload = {'pose': pose, 'quality': quality}"),
    ]),

  S(id="V9", name="f-string", nodes=["JoinedStr", "FormattedValue"],
    becomes="transform",
    canonical="<text> = f\"...{<in1>}...{<in2>:<spec>}...\"",
    ports="in: one per interpolation · out: 1 string",
    covered="present in 7 reviewed bodies",
    note="A format block whose template is its title. Every interpolation is a real data "
         "dependency, which makes f-strings one of the few places a long unreadable expression "
         "genuinely IS a fan-in.",
    examples=[
      ("two inputs",
       "msg = f\"pose {pose.x:.2f} at quality {quality}\""),
      ("in a raise — the string is an input to the exception (see E3)",
       "raise ValueError(f\"bad checksum {frame.checksum}\")"),
      ("nested call inside the interpolation",
       "label = f\"{classify(frame)} / {len(detections)}\""),
    ]),

  S(id="V10", name="Augmented assignment", nodes=["AugAssign"],
    becomes="transform",
    canonical="<name> <op>= <in>       # read <name>, transform, write <name>",
    ports="in: the current value + the operand · out: the next value, bound to the same name",
    covered="10 loop-carried state",
    note="The compact form of the accumulator, and the reason F2 exists: inside a loop this is "
         "the one construct that <i>must</i> draw as feedback rather than as a straight cable.",
    examples=[
      ("outside a loop — just a rebinding (F3)",
       "total = 0.0\ntotal += quality"),
      ("inside a loop — a carried value",
       "total = 0.0\nfor pose in poses:\n    total += pose.confidence"),
      ("on an attribute — a mutation, not a binding",
       "tracker.count += 1"),
    ]),

  S(id="V11", name="Walrus — assignment inside an expression", nodes=["NamedExpr"],
    becomes="wire",
    canonical="if (<name> := <expr>) is not None:\n    <block>",
    ports="none — it names a cable that is simultaneously being consumed",
    covered=None,
    open_q="A walrus in a <code>while</code> header names a value produced <i>inside</i> the "
           "loop's own predicate. Which side of the region boundary does that cable live on?",
    note="GAP: zero goldens. Structurally identical to V2 except the binding happens where an "
         "expression is, so the cable has a name AND a consumer at the same point.",
    examples=[
      ("guard + bind in one",
       "if (pose := estimate(frame)) is not None:\n    publish(pose)"),
      ("the classic read loop",
       "while (chunk := stream.read(1024)):\n    process(chunk)"),
      ("inside a comprehension — binds into the enclosing scope",
       "good = [p for f in frames if (p := estimate(f)).confidence > 0.8]"),
    ]),

  S(id="V12", name="del — the end of a lifetime", nodes=["Delete"],
    becomes="mark",
    canonical="del <name>",
    ports="none — a badge on the block that produced the value, or on its cable",
    covered=None,
    note="GAP: zero goldens. Dataflow has no vocabulary for un-producing a value; the honest "
         "drawing is a terminator mark, the same class as <code>break</code>.",
    examples=[
      ("releasing a large intermediate",
       "frame = decode(raw)\npose = estimate(frame)\ndel frame"),
      ("removing a key — a mutation of the container, not a name",
       "del cache[key]"),
      ("several at once",
       "del frame, raw"),
    ]),

  S(id="V13", name="Bare expression statement — the effect-only call", nodes=["Expr"],
    becomes="sink",
    canonical="<callee>(<in>)          # result discarded",
    ports="in: its arguments · out: none — which is exactly why it needs an ordering edge",
    covered="04 unused value · 11 receiver mutation",
    note="The construct that proves dataflow alone is not enough. Two adjacent effect calls have "
         "no data dependency, so nothing in the graph says which runs first — see F9.",
    examples=[
      ("a side effect",
       "publish(pose)"),
      ("a value produced and thrown away — golden 04's axis",
       "validate(frame)\nreturn estimate(frame)"),
      ("two effects whose order matters and whose data does not connect them",
       "gripper.open()\narm.move_to(target)"),
    ]),
])


# ==========================================================================
# G3 — CHOICE
# ==========================================================================

G_CHOICE = Group("choice", "Choice — the branch region", """
Every visual dataflow language that has ever shipped draws a conditional the same
way: a <b>frame</b> holding the conditional work, with the predicate arriving on
the frame and every value that leaves doing so through an explicit join. LabVIEW
calls it a Case Structure and the join a tunnel; Simulink calls it an If Action
Subsystem and the join a Merge block; MLIR calls it <code>scf.if</code> and the
join <code>scf.yield</code>. That convergence is why bbox-ui's
<code>RegionKind</code> already reads <code>"loop" | "branch" | "group"</code> —
the shape was settled by prior art, not chosen.""", [

  S(id="C1", name="if / elif / else", nodes=["If"],
    becomes="region",
    canonical="if <cond>:\n    <block>\nelif <cond2>:\n    <block>\nelse:\n    <block>",
    ports="on the corner card — in: the predicate + every value read from outside · "
          "out: one port per value that leaves, joined across all arms",
    covered="09 branch · 13 early return",
    note="One region node, N arms. The arms are <code>type: \"arm\"</code> child nodes "
         "(<code>scene/controlFlow.ts:38</code>) whose children are arm-relative, so folding "
         "one arm cannot move a sibling's blocks. <b>Exactly one <code>data-block-id</code></b>, "
         "on the corner card — stamping it on the frame silently breaks every wire into the region.",
    examples=[
      ("two arms, one joined output",
       "if frame.checksum == 0:\n    pose = FALLBACK\nelse:\n    pose = estimate(frame)\n"
       "return pose"),
      ("a chain — three arms, still one region",
       "if q > 0.9:\n    grade = 'A'\nelif q > 0.6:\n    grade = 'B'\nelse:\n    grade = 'C'"),
      ("one-sided — the implicit else still needs a join",
       "pose = FALLBACK\nif frame.samples:\n    pose = estimate(frame)"),
    ]),

  S(id="C2", name="Ternary — the conditional expression", nodes=["IfExp"],
    becomes="region",
    canonical="<out> = <true_value> if <cond> else <false_value>",
    ports="in: the predicate + both candidate values · out: exactly 1",
    covered="present in 4 reviewed bodies",
    note="Zach wrote this one out by hand in the daily note. It is a two-armed branch whose "
         "arms are single expressions, so it is the one branch that can honestly draw "
         "<b>opaque</b> by default and still tell the truth. pyblocks changed its lowering on "
         "2026-09-21 (uncommitted, <code>analyzer.py</code> ~1870-1890) from a branch node to "
         "an opaque region — the same conclusion, reached in code.",
    examples=[
      ("the canonical shape",
       "pose = estimate(frame) if frame.samples else FALLBACK"),
      ("on a port — the whole branch is one input cable",
       "publish(pose, topic='high' if quality > 0.9 else 'low')"),
      ("chained ternaries — three arms written as nested two-arm regions",
       "grade = 'A' if q > 0.9 else 'B' if q > 0.6 else 'C'"),
    ]),

  S(id="C3", name="match / case", nodes=["Match", "match_case"],
    becomes="region",
    canonical="match <subject>:\n    case <pattern1>:\n        <block>\n"
              "    case <pattern2> if <guard>:\n        <block>\n    case _:\n        <block>",
    ports="in: the subject + each guard's inputs · out: joined across every case, same as C1",
    covered=None,
    open_q="Is <code>match</code> just C1 with a different arm label, or does destructuring "
           "mean each arm also <b>produces</b> ports (the bound names) that <code>if</code> "
           "arms never do? That difference is the whole reason it is listed separately.",
    note="GAP: zero goldens, zero occurrences anywhere in the corpus. The largest single hole "
         "in the inventory — 9 of the 71 grammar nodes (13%) are match-only.",
    examples=[
      ("literal cases — pure C1",
       "match status:\n    case 'ok':\n        publish(pose)\n    case 'stale':\n"
       "        refresh()\n    case _:\n        drop()"),
      ("destructuring — the arm binds new names, which are output ports of the arm",
       "match detection:\n    case Box(x=x, y=y):\n        pose = Pose(x, y, 0.0)\n"
       "    case Point(x, y):\n        pose = Pose(x, y, 0.0)"),
      ("a guard — a second predicate input on one arm",
       "match item:\n    case Waste(mass=m) if m > 2.0:\n        route('heavy')\n"
       "    case Waste():\n        route('light')"),
    ]),

  S(id="C4", name="Patterns — what a case arm matches on",
    nodes=["MatchValue", "MatchSingleton", "MatchSequence", "MatchStar",
           "MatchMapping", "MatchClass", "MatchAs", "MatchOr"],
    becomes="mark",
    canonical="case <Class>(<field>=<name>) | <Other>() as <bound> if <guard>:",
    ports="a pattern is the arm's LABEL; the names it binds are the arm's own outputs",
    covered=None,
    note="GAP: all eight. Listed as their own scenario rather than folded into C3 because "
           "they are the part with no analogue anywhere in the prior art — LabVIEW's Case "
           "selector takes a value, not a shape.",
    examples=[
      ("sequence + star",
       "match detection:\n    case [first, *rest]:\n        publish(first)"),
      ("mapping + class",
       "match payload:\n    case {'kind': 'box', 'size': size}:\n        route(size)"),
      ("or + as + singleton",
       "match shape_in:\n    case (Box() | Point()) as shape:\n        draw(shape)\n    case None:\n        drop()"),
    ]),

  S(id="F1", name="FACET · Early return — an exit that is not the bottom", nodes=[],
    becomes="region",
    canonical="if <cond>:\n    return <out_a>\n<block>\nreturn <out_b>",
    ports="each return is a separate cable into the block's SAME output port, each carrying a certainty",
    covered="13 early return",
    note="Golden 13's contract is 5 blocks · 17 ports · 9 edges, and its stated rule is that "
         "nested arms are <b>not</b> flattened: what crosses a region boundary is explicit and "
         "carries <code>must</code> / <code>may</code> / <code>unknown</code> certainty. "
         "That certainty mark is what stops three returns looking like three outputs.",
    examples=[
      ("guard clause",
       "def estimate(frame: Frame) -> Pose:\n    if not frame.samples:\n        return FALLBACK\n"
       "    return solve(frame)"),
      ("three exits, one port",
       "def grade(q: float) -> str:\n    if q > 0.9:\n        return 'A'\n"
       "    if q > 0.6:\n        return 'B'\n    return 'C'"),
      ("an exit from inside a loop — crosses two region boundaries",
       "def first_good(frames: list[Frame]) -> Pose:\n    for f in frames:\n"
       "        p = estimate(f)\n        if p.confidence > 0.8:\n            return p\n"
       "    return FALLBACK"),
    ]),
])


# ==========================================================================
# G4 — REPETITION
# ==========================================================================

G_LOOPS = Group("loops", "Repetition — the loop region", """
Zach wrote the two canonical shapes into the daily note himself, <code>else</code>
clause included — the clause most people forget exists. A loop is the same region
as a branch with two extra facts: the body runs N times, and a value may travel
from one iteration to the next. That second fact is the only place in Python
where a cable legitimately points backwards, and the grammar doc already rules on
it: <i>every feedback trace must pass through an initial variable first</i>.""", [

  S(id="L1", name="for / for-else", nodes=["For"],
    becomes="region",
    canonical="for <item> in <iterable>:\n    <block>\nelse:\n    <block>",
    ports="in: the iterable · out per iteration: the item · out of the region: whatever is carried or collected. "
          "The <code>else</code> arm runs only if no <code>break</code> fired.",
    covered="10 loop-carried state",
    note="The <code>else</code> clause is a third arm whose predicate is \"the loop finished "
         "without breaking\" — it is not an alternative body, and drawing it as one is wrong.",
    examples=[
      ("plain iteration, effect only",
       "for pose in poses:\n    publish(pose)"),
      ("for-else — the search idiom it exists for",
       "for item in bin:\n    if item.kind == 'metal':\n        route(item)\n        break\n"
       "else:\n    route_default(bin)"),
      ("enumerate — two items out of one iterable port",
       "for index, frame in enumerate(frames):\n    publish(estimate(frame), seq=index)"),
    ]),

  S(id="L2", name="while / while-else", nodes=["While"],
    becomes="region",
    canonical="while <condition>:\n    <block>\nelse:\n    <block>",
    ports="in: everything the condition reads — and the condition is re-evaluated each pass, "
          "so at least one of its inputs must be produced INSIDE the region",
    covered="50 scalar while",
    note="The structural difference from L1: a <code>for</code> takes its iterable once, a "
         "<code>while</code> re-reads its predicate. That makes the predicate cable a genuine "
         "feedback edge in almost every real while loop.",
    examples=[
      ("a counter — the predicate's input is produced inside",
       "attempts = 0\nwhile attempts < 3:\n    attempts += 1\n    if try_grasp(target):\n        break"),
      ("while-else",
       "while queue:\n    item = queue.pop()\n    if item.kind == 'metal':\n        break\n"
       "else:\n    log('no metal found')"),
      ("while True — the predicate is a literal, so every exit is a break",
       "while True:\n    frame = camera.read()\n    if frame is None:\n        break\n"
       "    publish(estimate(frame))"),
    ]),

  S(id="L3", name="break / continue", nodes=["Break", "Continue"],
    becomes="mark",
    canonical="for <item> in <it>:\n    if <cond>:\n        break\n    if <cond2>:\n        continue\n    <block>",
    ports="none — <b>never a cable</b>",
    covered="present in 2 / 1 reviewed bodies",
    note="A settled decision, already implemented: <code>break</code>, <code>continue</code> "
         "and <code>pass</code> are <code>Badge</code> marks with "
         "<code>data-slot=\"control-mark\"</code>, never a wire with an endpoint "
         "(<code>docs/CONTROL-FLOW-PLAN.md</code>). A cable implies a value; these carry none.",
    examples=[
      ("break — also decides whether for-else runs",
       "for item in bin:\n    if item.kind == 'metal':\n        route(item)\n        break"),
      ("continue — a filter written as control flow",
       "for frame in frames:\n    if frame.checksum == 0:\n        continue\n"
       "    publish(estimate(frame))"),
      ("both, in a nested loop — each binds to its OWN region",
       "for b in bins:\n    for item in b:\n        if item.mass > 10:\n            continue\n"
       "        if route(item):\n            break"),
    ]),

  S(id="L4", name="async for", nodes=["AsyncFor"],
    becomes="region",
    canonical="async for <item> in <async_iterable>:\n    <block>",
    ports="identical to L1 — the iterable port carries an async iterator",
    covered="present in 1 reviewed body",
    note="Structurally L1. Listed separately only because it is a distinct grammar node and "
           "because a stream that yields over time is the shape BAM's perception loop actually "
           "has.",
    examples=[
      ("a live camera stream",
       "async for frame in camera.frames():\n    await publish(estimate(frame))"),
      ("with a break",
       "async for msg in bus.subscribe('poses'):\n    if msg.kind == 'stop':\n        break\n"
       "    handle(msg)"),
      ("collecting from a stream",
       "poses = []\nasync for frame in camera.frames():\n    poses.append(estimate(frame))"),
    ]),

  S(id="F2", name="FACET · Loop-carried state — the one backwards cable", nodes=[],
    becomes="region",
    canonical="<acc> = <initial>\nfor <item> in <it>:\n    <acc> = <f>(<acc>, <item>)\nreturn <acc>",
    ports="a paired in/out on the region: the value enters at the initial, leaves at the last iteration",
    covered="10 loop-carried state (verdict: REVIEW)",
    open_q="Still REVIEW after a year. LabVIEW answers it with a <b>shift register</b> — a "
           "matched pair of terminals on the loop's left and right walls, wired to an initial "
           "value from outside. Do we adopt that shape verbatim?",
    note="Zach's own rule, from the grammar doc: <i>\"I want to enforce that all feedback traces "
         "have to go through an initial variable first.\"</i> That is exactly Lustre's "
         "<code>fby</code> / SCADE's <code>pre</code> / Faust's <code>~</code>: a cycle is only "
         "well-formed if it passes through a unit delay with a known initial value.",
    examples=[
      ("accumulator",
       "total = 0.0\nfor pose in poses:\n    total += pose.confidence\nreturn total"),
      ("a filter carrying its own previous output",
       "smoothed = poses[0]\nfor pose in poses[1:]:\n    smoothed = blend(smoothed, pose, 0.2)"),
      ("two carried values at once — two shift registers",
       "best, best_q = FALLBACK, 0.0\nfor frame in frames:\n    p = estimate(frame)\n"
       "    if p.confidence > best_q:\n        best, best_q = p, p.confidence"),
    ]),
])


# ==========================================================================
# G5 — COMPREHENSIONS
# ==========================================================================

G_COMPS = Group("comps", "Comprehensions — a loop that already collapsed", """
Zach wrote the canonical form into the daily note:
<code>[expression for item in iterable [if condition]]</code>. A comprehension is
a loop region that Python itself already decided to draw opaque — one line in,
one collection out — and that is why golden 17's contract is only 4 blocks · 10
ports · 5 edges for three of them. It is the cleanest evidence in the corpus that
<b>opaque is a legitimate default</b>, not a compromise.""", [

  S(id="P1", name="List comprehension", nodes=["ListComp", "comprehension"],
    becomes="region",
    canonical="<out> = [<expr> for <item> in <iterable> if <cond>]",
    ports="in: the iterable (+ anything the expression or filter reads from outside) · out: 1 collection",
    covered="17 comprehension",
    note="The <code>comprehension</code> helper node is the <code>for ... in ... if ...</code> "
         "clause itself; a comprehension can carry several, which is what makes a nested "
         "comprehension one region with two iterable ports rather than two regions.",
    examples=[
      ("map",
       "poses = [estimate(f) for f in frames]"),
      ("map + filter — the filter is a second input to the region",
       "good = [estimate(f) for f in frames if f.checksum != 0]"),
      ("two clauses — a flattening double loop, still one region",
       "items = [i for b in bins for i in b.contents]"),
    ]),

  S(id="P2", name="Dict and set comprehension", nodes=["DictComp", "SetComp"],
    becomes="region",
    canonical="<out> = {<k>: <v> for <item> in <it>}\n<out> = {<expr> for <item> in <it>}",
    ports="identical to P1; only the collect at the end differs",
    covered="17 comprehension",
    note="Same region, different terminal. If the three comprehension kinds draw differently "
         "the drawing is encoding the container type, which belongs on the output port's type, "
         "not in the frame.",
    examples=[
      ("dict — two expressions per item",
       "by_id = {d.id: estimate(d.frame) for d in detections}"),
      ("set — dedupe as a side effect of the container",
       "kinds = {item.kind for item in bin.contents}"),
      ("dict with a filter",
       "heavy = {i.id: i.mass for i in items if i.mass > 2.0}"),
    ]),

  S(id="P3", name="Generator expression", nodes=["GeneratorExp"],
    becomes="region",
    canonical="<out> = (<expr> for <item> in <iterable>)",
    ports="in: the iterable · out: 1 lazy stream — nothing has run yet",
    covered="17 comprehension",
    note="Visually identical to P1 and semantically very different: the region has not executed "
         "when its output cable is created. The same distinction S1 draws for a generator "
         "function, so the two should share whatever mark carries it.",
    examples=[
      ("consumed immediately — indistinguishable from a list comp in effect",
       "total = sum(p.confidence for p in poses)"),
      ("stored — now the laziness is observable",
       "stream = (estimate(f) for f in frames)\nfirst = next(stream)"),
      ("short-circuiting — the region may run zero times",
       "ok = any(i.kind == 'metal' for i in bin.contents)"),
    ]),
])


# ==========================================================================
# G6 — STREAMS
# ==========================================================================

G_STREAMS = Group("streams", "Streams — a port that fires more than once", """
Every port drawn so far carries one value per execution. <code>yield</code>
breaks that, and it is the only thing in Python that does. Golden 21's contract
is 8 blocks · 21 ports · 11 edges for two typed yields, and its stated axis is
<i>suspension ordering</i> — the drawing has to say not just what leaves, but
that the block resumes where it stopped.""", [

  S(id="S1", name="yield", nodes=["Yield"],
    becomes="sink",
    canonical="def <name>(<in>):\n    for <item> in <it>:\n        yield <out>",
    ports="an output port that fires N times; the block keeps its state between fires",
    covered="21 generator",
    note="A <code>yield</code> is a return that does not end the block. Drawn as an ordinary "
         "output port it is a lie about cardinality; drawn as a stream port it is the same "
         "abstraction P3 needs.",
    examples=[
      ("the plain generator",
       "def poses(frames: list[Frame]):\n    for f in frames:\n        yield estimate(f)"),
      ("two yields — two fire sites, ONE port",
       "def bounds(items):\n    yield min(i.mass for i in items)\n    yield max(i.mass for i in items)"),
      ("yield as an expression — a port that is also an INPUT (a coroutine send)",
       "def controller():\n    target = yield\n    while True:\n        target = yield step(target)"),
    ]),

  S(id="S2", name="yield from", nodes=["YieldFrom"],
    becomes="wire",
    canonical="def <name>(<in>):\n    yield from <inner_generator>",
    ports="none of its own — it splices an inner block's stream port onto this block's stream port",
    covered=None,
    note="GAP: zero goldens. Structurally a pass-through — which is exactly LabVIEW's "
         "<b>tunnel</b>, a value crossing a boundary unchanged. If a tunnel primitive exists "
         "for regions, this is the same primitive at the block wall.",
    examples=[
      ("delegation",
       "def all_poses(bins):\n    for b in bins:\n        yield from poses(b.frames)"),
      ("splicing a library generator",
       "def windows(samples):\n    yield from itertools.pairwise(samples)"),
      ("with a return value — the inner block's RETURN becomes an ordinary cable",
       "def run(frames):\n    count = yield from counted(frames)\n    return count"),
    ]),
])


# ==========================================================================
# G7 — FAILURE AND LIFETIME
# ==========================================================================

G_FAILURE = Group("failure", "Failure and lifetime — the scoped regions", """
These are regions with a second, non-obvious exit. A <code>try</code> has a
normal path and an error path; a <code>with</code> has a guaranteed exit that
runs whichever path you leave by. Golden 14's stated rule is that <b>cleanup
stays atomic</b> — the region does not get flattened to show you the
<code>finally</code> as just another block, because its ordering guarantee is not
expressible as a cable.""", [

  S(id="E1", name="try / except / finally", nodes=["Try", "ExceptHandler"],
    becomes="region",
    canonical="try:\n    <block>\nexcept <Error> as <e>:\n    <block>\nelse:\n    <block>\nfinally:\n    <block>",
    ports="in: whatever the body reads · out: each value that leaves, from BOTH paths, joined — "
          "plus the exception itself as an output of the except arm",
    covered="14 exception cleanup",
    note="Four arms, and the <code>else</code> one is again the forgotten one: it runs only if "
         "the body raised nothing. The exception bound by <code>as e</code> is an output port "
         "of its arm — the same thing C3's destructuring patterns do.",
    examples=[
      ("the ordinary guard",
       "try:\n    pose = estimate(frame)\nexcept BadFrame:\n    pose = FALLBACK"),
      ("all four arms",
       "try:\n    f = open(path)\nexcept OSError as err:\n    log(err)\nelse:\n"
       "    data = f.read()\nfinally:\n    close_all()"),
      ("two handlers — two arms with different predicates",
       "try:\n    route(item)\nexcept Jam:\n    clear()\nexcept Overweight:\n    split(item)"),
    ]),

  S(id="E2", name="except* — exception groups", nodes=["TryStar"],
    becomes="region",
    canonical="try:\n    <block>\nexcept* <Error>:\n    <block>",
    ports="the same as E1 except that MORE THAN ONE arm can run for a single failure",
    covered=None,
    open_q="Every other arm construct in this inventory is mutually exclusive — one arm runs. "
           "<code>except*</code> is the only one where several fire. Does the arm vocabulary "
           "need an 'all matching' mode, or is this its own region kind?",
    note="GAP: zero goldens. Rare today, unavoidable with <code>asyncio.TaskGroup</code> — "
         "which is exactly the shape B5's concurrency case grows into.",
    examples=[
      ("a task group's failures",
       "try:\n    async with asyncio.TaskGroup() as tg:\n        tg.create_task(estimate(a))\n"
       "        tg.create_task(estimate(b))\nexcept* BadFrame:\n    log('one frame failed')"),
      ("two arms, both may run",
       "try:\n    run_all()\nexcept* Jam:\n    clear()\nexcept* Overweight:\n    split()"),
      ("binding the group",
       "try:\n    run_all()\nexcept* OSError as group:\n    log(len(group.exceptions))"),
    ]),

  S(id="E3", name="raise", nodes=["Raise"],
    becomes="sink",
    canonical="raise <Error>(<in>)\nraise <Error> from <cause>",
    ports="in: the exception's arguments · out: none — it is a terminal on the error path",
    covered="present in 2 reviewed bodies",
    note="The error-path twin of B2. A block that can raise has a second exit that its "
         "signature does not mention, which is why E1's region needs an error output at all.",
    examples=[
      ("with a computed message — the f-string is an input",
       "raise ValueError(f'bad checksum {frame.checksum}')"),
      ("re-raise — no inputs at all",
       "try:\n    publish(pose)\nexcept BadFrame:\n    log('dropping')\n    raise"),
      ("chained — the original exception is an input port",
       "try:\n    data = open(path).read()\nexcept OSError as err:\n    raise LoadFailed(path) from err"),
    ]),

  S(id="E4", name="assert", nodes=["Assert"],
    becomes="mark",
    canonical="assert <cond>, <message>",
    ports="in: the predicate · out: none — a guard badge on the cable it constrains",
    covered=None,
    note="GAP as an axis: present in 10 golden FILES, zero reviewed BODIES. Structurally "
         "<code>if not cond: raise</code>, but drawing it that way turns a one-line invariant "
         "into a region — the reason it belongs with the marks instead.",
    examples=[
      ("an invariant on a cable",
       "pose = estimate(frame)\nassert pose.confidence >= 0.0"),
      ("with a message",
       "assert frame.samples, 'decoder produced an empty frame'"),
      ("a type narrowing assert — changes the PORT TYPE downstream",
       "assert pose is not None\npublish(pose)"),
    ]),

  S(id="E5", name="with — the scoped resource", nodes=["With", "withitem"],
    becomes="region",
    canonical="with <resource>() as <name>:\n    <block>",
    ports="in: whatever opens the resource · a region-scoped value port for <code>as</code> · "
          "out: what the body produced. The exit runs on every path out.",
    covered="18 context manager",
    note="Golden 18's contract is 2 blocks · 6 ports · 3 edges — the tightest in the advanced "
         "tier, because enter/body/exit collapse to one frame. Its axis is <i>scoped "
         "enter/body/guaranteed exit</i>: the guarantee is the thing the region exists to draw.",
    examples=[
      ("one resource",
       "with open(path) as f:\n    frames = decode_all(f.read())"),
      ("two in one statement — two withitems, ONE region",
       "with open(src) as fin, open(dst, 'w') as fout:\n    fout.write(transform(fin.read()))"),
      ("a lock — no value at all, pure scope",
       "with arm.lock():\n    arm.move_to(target)"),
    ]),

  S(id="E6", name="async with", nodes=["AsyncWith"],
    becomes="region",
    canonical="async with <resource>() as <name>:\n    <block>",
    ports="identical to E5",
    covered=None,
    note="GAP: zero goldens. Same region as E5. The one that matters soon is "
         "<code>asyncio.TaskGroup</code>, which is an async context manager whose exit is a "
         "join of every task started inside it — an E5 region and a B5 concurrency fan-in at once.",
    examples=[
      ("a session",
       "async with httpx.AsyncClient() as client:\n    resp = await client.get(url)"),
      ("a task group — the exit joins every task",
       "async with asyncio.TaskGroup() as tg:\n    tg.create_task(estimate(a))\n"
       "    tg.create_task(estimate(b))"),
      ("an async lock",
       "async with arm.lock():\n    await arm.move_to(target)"),
    ]),
])


# ==========================================================================
# G8 — SCOPE AND NON-EVENTS
# ==========================================================================

G_SCOPE = Group("scope", "Scope and non-events", """
Three constructs that mostly draw nothing — which is a finding, not an omission.
<code>global</code> and <code>nonlocal</code> are the exception: they are the only
syntax in Python that punches an input/output port through a block wall
<b>without appearing in the signature</b>, and that is precisely the thing a block
diagram exists to make impossible to miss.""", [

  S(id="N1", name="global / nonlocal", nodes=["Global", "Nonlocal"],
    becomes="block",
    canonical="def <name>():\n    global <state>\n    <state> = <expr>",
    ports="an undeclared in/out pair on the block — a port the signature never mentions",
    covered=None,
    open_q="Draw the hidden state as a real port on the block wall (honest, noisy), or as a "
           "badge like the <code>mut</code> cable (quiet, easy to miss)? The <code>mut</code> "
           "vocabulary already exists in the control-flow plan.",
    note="GAP: zero goldens. The highest-value gap per line of code in the whole inventory — "
         "this is the construct whose invisibility in source is most worth fixing in the drawing.",
    examples=[
      ("module state written from inside a block",
       "_LAST: Pose | None = None\n\ndef track(pose: Pose) -> None:\n    global _LAST\n    _LAST = pose"),
      ("nonlocal — a closure writing its parent's binding",
       "def counter():\n    n = 0\n    def tick() -> int:\n        nonlocal n\n        n += 1\n"
       "        return n\n    return tick"),
      ("read-only global — no declaration needed, and STILL a hidden input port",
       "def estimate(frame: Frame) -> Pose:\n    return solve(frame, CONFIG.gain)"),
    ]),

  S(id="N2", name="pass", nodes=["Pass"],
    becomes="mark",
    canonical="if <cond>:\n    pass\nelse:\n    <block>",
    ports="none",
    covered="present in 1 reviewed body",
    note="Already decided and shipped with <code>break</code>/<code>continue</code>: a "
         "<code>Badge</code> mark. It exists so an empty arm is visibly empty rather than "
         "indistinguishable from an arm that failed to render.",
    examples=[
      ("an intentionally empty arm",
       "if item.kind == 'unknown':\n    pass\nelse:\n    route(item)"),
      ("a swallowed exception",
       "try:\n    publish(pose)\nexcept BusError:\n    pass"),
      ("a stub block — zero inner blocks, full interface",
       "def estimate(frame: Frame) -> Pose:\n    pass"),
    ]),
])


# ==========================================================================
# G9 — THE FACETS: composition pressures that are not grammar nodes
# ==========================================================================

G_FACETS = Group("facets", "Composition pressures — the goldens' real axes", """
None of these is a grammar node, and every one of them is a numbered golden.
That is the shape of the existing corpus: it was built to attack the places where
two correct constructs compose into a <b>wrong drawing</b>, not to tick off
syntax. They belong in an exhaustive list for the same reason a semantic merge
conflict belongs in a list of merge failure modes — each side is fine and the
result is not.""", [

  S(id="F3", name="FACET · Rebinding the same name", nodes=[],
    becomes="wire",
    canonical="<x> = <f>(<x>)      # NOT a self-loop — two versions of one name",
    ports="none — but getting this wrong invents a cycle that is not in the program",
    covered="06 rebinding",
    note="Golden 06's axis, stated exactly: <i>versioned state without a false self-loop</i>. "
         "The name is reused; the value is not. Outside a loop this is two cables in series; "
         "only F2 makes it genuine feedback.",
    examples=[
      ("two versions, straight line",
       "pose = estimate(frame)\npose = refine(pose)\nreturn pose"),
      ("three versions of one name",
       "data = read(path)\ndata = decode(data)\ndata = normalise(data)"),
      ("the same text INSIDE a loop — now it IS feedback",
       "for frame in frames:\n    pose = blend(pose, estimate(frame))"),
    ]),

  S(id="F4", name="FACET · Anonymous intermediate", nodes=[],
    becomes="wire",
    canonical="<out> = <g>(<f>(<in>))     # identical graph to naming the middle",
    ports="none",
    covered="08 anonymous intermediate",
    note="The invariant: introducing or removing a variable name must not change one block, "
         "port or edge. If it does, the projection is keying off syntax instead of structure — "
         "and round-tripping will churn the user's layout for free.",
    examples=[
      ("inlined",
       "return publish(estimate(decode(raw)))"),
      ("the same graph, three names",
       "frame = decode(raw)\npose = estimate(frame)\nreturn publish(pose)"),
      ("half and half",
       "frame = decode(raw)\nreturn publish(estimate(frame))"),
    ]),

  S(id="F5", name="FACET · Fan-out and rejoin", nodes=[],
    becomes="wire",
    canonical="<x> = <f>(<in>)\n<a> = <g>(<x>)\n<b> = <h>(<x>)\n<out> = <join>(<a>, <b>)",
    ports="one output port, N cables leaving it",
    covered="05 fan-out + rejoin",
    note="The construct that makes the drawing worth more than the text: in source the second "
         "use of <code>x</code> is just another identifier; in the drawing it is visibly the "
         "same producer feeding two consumers. Zach's own framing — <i>topology becomes clearer</i>.",
    examples=[
      ("one producer, two consumers, rejoined",
       "frame = decode(raw)\npose = estimate(frame)\nlabel = classify(frame)\n"
       "return Record(pose, label)"),
      ("fan-out that never rejoins — two independent sinks",
       "pose = estimate(frame)\npublish(pose)\nlog(pose)"),
      ("fan-out across a region boundary",
       "gain = CONFIG.gain\nfor f in frames:\n    publish(estimate(f, gain))"),
    ]),

  S(id="F6", name="FACET · Unpacking a tuple into names", nodes=[],
    becomes="wire",
    canonical="<a>, <b> = <f>(<in>)     # two cables off two output ports",
    ports="none new — it is the read side of B2's multiple outputs",
    covered="07 multiple outputs",
    note="The exact dual of V8's collection display. The reason the grammar doc rules for "
         "NamedTuple returns lives here: with a plain tuple, which name goes with which port is "
         "decided by <b>position at the unpack site</b>, so renaming one variable silently "
         "re-labels a port.",
    examples=[
      ("two outputs, two names",
       "pose, quality = estimate(frame)"),
      ("named access instead — same two ports, no positional risk",
       "out = estimate(frame)\npublish(out.pose, out.quality)"),
      ("swap — two cables crossing, no block at all",
       "lo, hi = hi, lo"),
    ]),

  S(id="F7", name="FACET · Receiver mutation — the mut cable", nodes=[],
    becomes="wire",
    canonical="<obj>.<method>(<in>)      # no return value; <obj> is different afterwards",
    ports="a state port on the receiver: in and out, same object, two versions",
    covered="11 receiver mutation · 51 chain by mutation",
    note="Already has a vocabulary in the repo: an amber cable carrying a <code>mut</code> "
         "badge, leaving a top port (<code>docs/lanes/cf-F.md</code>). Zach, in the daily note: "
         "<i>\"even if those blocks do like mutations then I can still represent it properly!\"</i> "
         "— this is the mechanism that claim rests on.",
    examples=[
      ("a mutating call with no return",
       "tracker = Tracker()\ntracker.update(pose)\nreturn tracker.best()"),
      ("mutating a container passed in — the caller's object changes",
       "def collect(poses: list[Pose], frame: Frame) -> None:\n    poses.append(estimate(frame))"),
      ("chain by mutation — golden 51's axis, three steps, no data cable between them",
       "bundle = Bundle()\nbundle.add(mesh)\nbundle.add(texture)\nbundle.write(path)"),
    ]),

  S(id="F8", name="FACET · A callable on a port", nodes=[],
    becomes="data",
    canonical="<out> = <f>(<in>, <callee>)      # the port carries a BLOCK, not a value",
    ports="an input port whose value is itself a block interface",
    covered="03 callable argument (verdict: REVIEW)",
    open_q="Still REVIEW. Does a callable argument draw as a pill (a value like any other), as "
           "a nested block wired into the consumer's wall, or as a dashed 'will be called here' "
           "edge? B6 (lambda) cannot be answered until this is.",
    note="The axis is <i>dynamic callee identity</i> — the consumer's real behaviour is not "
         "knowable from the consumer's own source.",
    examples=[
      ("a named function passed by reference",
       "pose = run(frame, estimator=solve)"),
      ("chosen at runtime — the identity genuinely is not static",
       "estimator = solve if precise else approximate\npose = run(frame, estimator)"),
      ("a bound method — carries its receiver with it",
       "pose = run(frame, tracker.predict)"),
    ]),

  S(id="F9", name="FACET · Sequencing with no data dependency", nodes=[],
    becomes="wire",
    canonical="<f>(<in>)\n<g>(<in>)        # order matters; no cable says so",
    ports="an execution edge, not a data edge — a different cable kind",
    covered="04 unused value",
    note="The hard limit of pure dataflow, and the reason Unreal Blueprints has a white "
         "<b>exec</b> pin beside every data pin and a <code>Sequence</code> node to fan it out. "
         "Python is imperative; a projection that only draws data edges is <b>not</b> a faithful "
         "oracle, because two orderings would produce the same picture.",
    examples=[
      ("two effects — nothing connects them, order is load-bearing",
       "gripper.open()\narm.move_to(target)\ngripper.close()"),
      ("a produced value discarded — the call still has to happen",
       "validate(frame)\nreturn estimate(frame)"),
      ("print/log interleaving — invisible to dataflow, obvious to a reader",
       "log('start')\npose = estimate(frame)\nlog('done')"),
    ]),

  S(id="F10", name="FACET · Recursion", nodes=[],
    becomes="block",
    canonical="def <name>(<in>):\n    if <base>:\n        return <out>\n    return <name>(<smaller>)",
    ports="a block whose own interface appears inside itself",
    covered="16 recursion",
    note="Golden 16's contract is 8 blocks · 23 ports · 13 edges, with a stated <i>explicit "
         "decrement</i> — the recursive call is drawn as an ordinary call to a block that "
         "happens to be this one, so the base exit and the recursive exit are two cables into "
         "one output port (F1's shape).",
    examples=[
      ("the plain shape",
       "def depth(node: Node) -> int:\n    if node.child is None:\n        return 0\n"
       "    return 1 + depth(node.child)"),
      ("tree recursion — the block appears twice inside itself",
       "def total_mass(node: Node) -> float:\n"
       "    return node.mass + sum(total_mass(c) for c in node.children)"),
      ("mutual recursion — two blocks each containing the other",
       "def is_even(n: int) -> bool:\n    return True if n == 0 else is_odd(n - 1)\n\n"
       "def is_odd(n: int) -> bool:\n    return False if n == 0 else is_even(n - 1)"),
    ]),

  S(id="F11", name="FACET · Decorators", nodes=[],
    becomes="block",
    canonical="@<wrapper>\ndef <name>(<in>) -> <Out>: ...",
    ports="unchanged signature, changed behaviour — a block wrapped in another block",
    covered=None,
    open_q="A badge on the header (honest about the signature, silent about the behaviour) or "
           "a real enclosing block (honest about the behaviour, noisy for "
           "<code>@dataclass</code>)? Probably both, keyed on whether the decorator changes the "
           "signature.",
    note="GAP as an axis, though <code>@dataclass</code> appears throughout the corpus' "
         "scaffolding. <code>decorator_list</code> rides on <code>FunctionDef</code>, so it "
         "will never show up as a missing node — only as a missing drawing.",
    examples=[
      ("signature-preserving — a badge is enough",
       "@functools.cache\ndef solve(frame: Frame) -> Pose: ...")
      ,
      ("signature-changing — the drawn ports are now a lie",
       "@click.option('--gain', default=1.0)\ndef run(gain: float) -> None: ..."),
      ("a class decorator that GENERATES ports",
       "@dataclass(frozen=True)\nclass Pose:\n    x: float\n    y: float"),
    ]),

  S(id="F12", name="FACET · Closure capture", nodes=[],
    becomes="block",
    canonical="def <outer>(<a>):\n    def <inner>(<b>):\n        return <f>(<a>, <b>)\n    return <inner>",
    ports="the inner block has an input port its signature does not declare",
    covered="22 nested closure",
    note="Golden 22's contract is 5 blocks · 12 ports · 6 edges for <i>a local callable plus "
         "frame/gain captures</i>. Same class of problem as N1: a port that exists in the "
         "program and not in the signature — which is exactly what a block diagram should "
         "surface rather than hide.",
    examples=[
      ("one capture",
       "def make_scaler(k: float):\n    def scale(p: Pose) -> Pose:\n        return Pose(p.x * k, p.y * k, p.z * k)\n"
       "    return scale"),
      ("two captures, used once",
       "def run(frame: Frame, gain: float) -> Pose:\n    def local() -> Pose:\n"
       "        return solve(frame, gain)\n    return local()"),
      ("late binding — the captured value is read when CALLED, not when defined",
       "fns = [lambda: i for i in range(3)]\nassert [f() for f in fns] == [2, 2, 2]"),
    ]),

  S(id="F13", name="FACET · Default argument — a value the definition owns", nodes=[],
    becomes="data",
    canonical="def <name>(<in>, <opt> = <default>) -> <Out>: ...",
    ports="an optional input port carrying its own literal, visible with nothing wired to it",
    covered="19 default argument",
    note="The distinction golden 19 exists to force: golden 02's literal lives at the CALL, "
         "golden 19's lives at the DEFINITION. Same value on the same port, two different owners "
         "— and the drawing has to say which, because editing one edits a different line of code.",
    examples=[
      ("definition-owned default",
       "def estimate(frame: Frame, gain: float = 1.0) -> Pose:\n    return solve(frame, gain)"),
      ("overridden at the call — now the port is wired",
       "pose = estimate(frame, gain=2.0)"),
      ("the mutable-default trap — the default is ONE object shared by every call",
       "def collect(item, bucket=[]):\n    bucket.append(item)\n    return bucket"),
    ]),

  S(id="F14", name="FACET · Chaining by mutation, method, or nesting", nodes=[],
    becomes="wire",
    canonical="<a> = <f>(<in>); <g>(<a>)        # by value\n"
              "<obj>.<f>().<g>()                 # by method\n"
              "<g>(<f>(<in>))                    # by nesting",
    ports="none — three source spellings that must produce the SAME topology",
    covered="51 chain by mutation · 52 chain by method · 53 chain by nesting",
    note="The last three goldens in the runnable corpus, and they exist as a set on purpose: "
         "they are the same pipeline written three ways. If the three drawings differ, the "
         "projection is reading style rather than structure — the same invariant as F4, applied "
         "to whole chains rather than one name.",
    examples=[
      ("by value",
       "bundle = Bundle()\nbundle = bundle.with_mesh(mesh)\nbundle = bundle.with_texture(tex)"),
      ("by method — a fluent chain",
       "bundle = Bundle().with_mesh(mesh).with_texture(tex)"),
      ("by nesting",
       "bundle = with_texture(with_mesh(Bundle(), mesh), tex)"),
    ]),
])


ALL_GROUPS = [G_BOUNDARY, G_VALUES, G_CHOICE, G_LOOPS, G_COMPS,
              G_STREAMS, G_FAILURE, G_SCOPE, G_FACETS]

ALL_SCENARIOS = [s for g in ALL_GROUPS for s in g.scenarios]


if __name__ == "__main__":
    missing, dupes = coverage_report(ALL_GROUPS)
    print(f"{len(ALL_SCENARIOS)} scenarios in {len(ALL_GROUPS)} groups")
    print(f"{len(EVERY_NODE)} drawable grammar nodes")
    print("MISSING:", missing or "none — every grammar node is claimed")
    print("DUPES:  ", dupes or "none — no node claimed twice")
    gaps = [s.id for s in ALL_SCENARIOS if not s.covered]
    print(f"GAPS ({len(gaps)}):", ", ".join(gaps))
    if missing or dupes:
        raise SystemExit(1)
