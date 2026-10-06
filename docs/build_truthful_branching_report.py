#!/usr/bin/env python3
"""Build reports/media/truthful-branching-2026-09-22.html.

Zach, 2026-09-22 daily note "More truthful branching": the arm headers hide
whole expressions, so the drawing lies the moment a test has a side effect.
He proposes following LabVIEW. This report answers that with a grammar, six
rendered examples, and a straight answer to each of his four TBDs.

    python3 docs/build_truthful_branching_report.py

Captures: docs/capture_storybook_shots.mjs against the real Storybook
(reports/media/truthful-branching-2026-09-22/*.png). Mocks: _branch_svg.py +
_branch_mocks.py — hand-drawn because the proposed form does not exist in
components/blockRegion.tsx yet (an arm carries zero ports today).
"""
from __future__ import annotations
import pathlib, sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _report_kit import CSS, FB_JS, fb, dock, overall_box, report_size, shot, sh  # noqa
from _branch_svg import *  # noqa
from _branch_mocks import *  # noqa

HERE = pathlib.Path(__file__).resolve().parent
TREE = HERE.parent
MAIN = pathlib.Path("/home/bam/bbox-ui")
SHOTS = MAIN / "reports/media/truthful-branching-2026-09-22"
VAULT = pathlib.Path("/home/bam/zach_brain")
OUT = MAIN / "reports/media/truthful-branching-2026-09-22.html"

HEAD = sh("git rev-parse --short HEAD", TREE)
BRANCH = sh("git rev-parse --abbrev-ref HEAD", TREE)

# ── figures ───────────────────────────────────────────────────────────
W = 1000


def fig_today_shape():
    """What the data model actually says today, drawn from the real fixture."""
    body, t = region(300, 74, 400, [
        dict(title='if mode == "fast":',   h=76, tab_w=196),
        dict(title='elif mode == "safe":', h=76, tab_w=196),
        dict(title="else:",                h=76, tab_w=196),
    ], head="Branch", head_h=HEAD_FULL, head_ports=[("mode", True)])
    s, _ = src_of(150, ["mode"])
    return svg(W, 74 + t + 62,
        py(300, 30, ['branchNode({ conditions: ["mode"],',
                     '  arms: ifElifElseArms([\'mode == "fast"\', \'mode == "safe"\']) })'], fill=DIM)
        + s + body
        + wire([(148, 194), (250, 194), (250, 105), (300, 105)])
        + txt(300, 74 + t + 30, "ONE port, named for the subject.  THREE arms, whose tests are free text.", size=12.5, fill=BAD, weight=600)
        + txt(300, 74 + t + 48, 'Nothing in the model computes  == "fast" .  Nothing binds the port to an arm.', size=12.5, fill=BAD, weight=600)
        + chip(704, 92, "the whole interface", fill=BAD, fg="#fff"))


def fig_rule():
    """Where an operand may live, and what that position MEANS."""
    b = []
    b.append(txt(40, 34, "The one rule", size=15, fill=INK, weight=700))
    b.append(txt(40, 58, "A dot is a VALUE the structure consumes at run time. Its POSITION says who consumes it.", size=13, fill=DIM))
    body, t = region(60, 96, 330, [
        dict(title='case "go":', h=62, tab_w=130),
        dict(title='case _:',    h=62, tab_w=130),
    ], head="match", head_h=HEAD_FULL, head_ports=[("subject", True)])
    b.append(body)
    b.append(txt(60, 96 + t + 26, "ON THE HEAD CARD", size=12, fill=NEW, weight=700))
    b.append(txt(60, 96 + t + 44, "one value, tested against N static", size=12, fill=DIM))
    b.append(txt(60, 96 + t + 60, "patterns. The patterns are TEXT —", size=12, fill=DIM))
    b.append(txt(60, 96 + t + 76, "they are not values, so no dots.", size=12, fill=DIM))
    b.append(txt(60, 96 + t + 96, "→  match / switch  (LabVIEW Case Structure)", size=12, fill=INK, weight=600))

    body2, t2 = region(530, 96, 330, [
        dict(title="if",   h=62, port="solid", tab_w=100),
        dict(title="elif", h=62, port="solid", tab_w=100),
        dict(title="else", h=62, tab_w=100),
    ], head="Branch", head_h=HEAD_THIN)
    b.append(body2)
    b.append(txt(530, 96 + t2 + 26, "ON THE ARM ROW", size=12, fill=NEW, weight=700))
    b.append(txt(530, 96 + t2 + 44, "N independent booleans, evaluated in", size=12, fill=DIM))
    b.append(txt(530, 96 + t2 + 60, "order. Each arm owns its own test, so", size=12, fill=DIM))
    b.append(txt(530, 96 + t2 + 76, "each arm owns its own dot.", size=12, fill=DIM))
    b.append(txt(530, 96 + t2 + 96, "→  if / elif / else  (a predicate ladder)", size=12, fill=INK, weight=600))
    b.append(line(455, 96, 455, 96 + max(t, t2) + 100, stroke="#2a2f38", sw=1.4, dash="4 5"))
    return svg(W, 96 + max(t, t2) + 118, "".join(b))


def fig_match():
    body, t = region(300, 92, 400, [
        dict(title='case "go":',   h=72, tab_w=140),
        dict(title='case "stop":', h=72, tab_w=140),
        dict(title='case _:',      h=72, tab_w=140, note="no pattern to test", note_fill=DIM),
    ], head="match", head_h=HEAD_FULL, head_ports=[("cmd", True)])
    s, _ = src_of(150, ["cmd"])
    return svg(W, 92 + t + 26, py(300, 32, [
        "match cmd:", '    case "go":   start()', '    case "stop": halt()',
        "    case _:      ignore()"]) + s + body
        + wire([(148, 194), (250, 194), (250, 123), (300, 123)]))


def fig_ladder(inline: bool):
    """The predicate ladder. `inline=True` shows the default-in-the-title form
    Zach asked for: the dot is HOLLOW and the tab carries the expression."""
    if inline:
        arms = [dict(title='if  mode == "fast"',   h=76, port="hollow", tab_w=214),
                dict(title='elif mode == "safe"',  h=76, port="hollow", tab_w=214),
                dict(title="else",                 h=76, tab_w=214)]
        extra = ""
    else:
        arms = [dict(title="if",   h=76, port="solid", tab_w=110),
                dict(title="elif", h=76, port="solid", tab_w=110),
                dict(title="else", h=76, tab_w=110)]
        extra = (block(30, 150, 190, 112, "==", ins=[("mode", True), ('"fast"', False)],
                       outs=[("bool", True)], stroke=NEW)
                 + block(30, 286, 190, 112, "==", ins=[("mode", True), ('"safe"', False)],
                         outs=[("bool", True)], stroke=NEW))
    body, t = region(310, 92, 380, arms, head="Branch", head_h=HEAD_THIN)
    wires = ""
    if not inline:
        wires = (wire([(220, 198), (265, 198), (265, 143), (310, 143)], stroke=NEW)
                 + wire([(220, 334), (285, 334), (285, 245), (310, 245)], stroke=NEW))
    lab = ("SUPPLIED — a real block computes it" if not inline
           else "UNSUPPLIED — the tab's text IS the default")
    return svg(W, 92 + t + 46, py(310, 30, [
        'if mode == "fast":   estimate()',
        'elif mode == "safe": fallback()',
        "else:                identity()"], fill=DIM)
        + extra + body + wires
        + txt(310, 92 + t + 26, lab, size=12.5, fill=NEW if not inline else DIM, weight=700))


def fig_guard():
    arms = [
        dict(title="case Point(x=0, y=y)", h=88, tab_w=232, captures=["y"], port="solid"),
        dict(title="case Point()", h=72, tab_w=232),
        dict(title="case _:", h=68, tab_w=232),
    ]
    body, t = region(330, 112, 380, arms, head="match", head_h=HEAD_FULL,
                     head_ports=[("pt", True)])
    s_, _ = src_of(170, ["pt"])
    bot = 112 + t
    guard = block(790, 130, 170, 86, "y > 0", ins=[("y", True)], outs=[("bool", True)], stroke=NEW)
    # the guard's result loops BACK to the arm's own operand dot — routed
    # clear below the frame so it never crosses a row it does not belong to.
    loop = wire([(960, 178), (980, 178), (980, bot + 22), (300, bot + 22), (300, 163), (330, 163)],
                stroke=NEW)
    return svg(W, bot + 96, py(330, 34, [
        "match pt:",
        "    case Point(x=0, y=y) if y > 0:  north(y)",
        "    case Point():                   other()",
        "    case _:                         ignore()"]) + s_ + body + guard
        + wire([(168, 214), (280, 214), (280, 143), (330, 143)])
        + wire([(590, 163), (700, 163), (700, 178), (790, 178)], stroke=NEW)
        + loop
        + txt(330, bot + 52, "A pattern BINDS as well as tests. `y` is a value the header produces INTO the arm — a square dot,", size=12.5, fill=NEW, weight=600)
        + txt(330, bot + 70, "facing right. The `if y > 0` guard then returns as an ordinary operand on that same arm's own dot.", size=12.5, fill=NEW, weight=600))


def fig_select():
    b = block(300, 104, 260, 148, "Select", ins=[("cond", True), ("a", True), ("b", True)],
              outs=[("out", True)], stroke=OK)
    s, _ = src_of(120, ["cond", "a", "b"])
    return svg(W, 300, py(300, 34, ["count = 0 if count == N else N + 1"], fill=DIM)
        + s + b
        + wire([(148, 164), (230, 164), (230, 152), (300, 152)])
        + wire([(148, 188), (300, 188)])
        + wire([(148, 212), (230, 212), (230, 224), (300, 224)])
        + txt(600, 150, "NOT a region. No frame, no arms, no body.", size=13, fill=OK, weight=700)
        + txt(600, 172, "A conditional EXPRESSION joins by being a value,", size=12.5, fill=DIM)
        + txt(600, 190, "so it is an ordinary 3-in/1-out Block.", size=12.5, fill=DIM)
        + txt(600, 216, "Already decided — your own vault note, 2026-09-02:", size=12, fill=DIM)
        + txt(600, 234, "C - Branch Region Asymmetry, §Boundary.", size=12, fill=INK, weight=600)
        + txt(600, 258, "Nothing to build. This is LabVIEW's Select function,", size=12, fill=DIM)
        + txt(600, 276, "which the NI page you read calls out as the other tool.", size=12, fill=DIM))


def fig_tabs_vs_flat():
    a, ta = region(40, 74, 380, [
        dict(title="if",   h=72, port="solid", tab_w=104),
        dict(title="elif", h=72, port="solid", tab_w=104),
        dict(title="else", h=72, tab_w=104),
    ], head="Branch", head_h=HEAD_THIN, tabs=True)
    b, tb = region(540, 74, 380, [
        dict(title="if",   h=72, port="solid"),
        dict(title="elif", h=72, port="solid"),
        dict(title="else", h=72),
    ], head="Branch", head_h=HEAD_THIN, tabs=False)
    h = 74 + max(ta, tb) + 96
    return svg(W, h, a + b
        + txt(40, 54, "A · tabs   ← recommended", size=13, fill=NEW, weight=700)
        + txt(540, 54, "B · flat rails", size=13, fill=DIM, weight=700)
        + txt(40, 74 + ta + 30, "The tab is the arm's own interface box.", size=12, fill=DIM)
        + txt(40, 74 + ta + 48, "It is what the dot attaches TO, it is where a", size=12, fill=DIM)
        + txt(40, 74 + ta + 66, "capture dot and a fold chevron can live, and", size=12, fill=DIM)
        + txt(40, 74 + ta + 84, 'it makes an arm a block — your own rule.', size=12, fill=DIM)
        + txt(540, 74 + tb + 30, "Less ink, and the left rail already carries", size=12, fill=DIM)
        + txt(540, 74 + tb + 48, "the order. But the title floats in the body,", size=12, fill=DIM)
        + txt(540, 74 + tb + 66, "so it reads as content; and a capture dot", size=12, fill=DIM)
        + txt(540, 74 + tb + 84, "has no edge to sit on.", size=12, fill=DIM))


def fig_head_bar():
    specs = [
        (40,  "match", HEAD_FULL, [("cmd", True)], 'case "go":', "earns it: carries the subject"),
        (370, "Branch", HEAD_THIN, [], "if", "quiet: a title strip, hugged"),
        (700, None, 0, [], "if", "gone: the region loses its id"),
    ]
    b, notes, hmax = [], [], 0
    for x, head, hh, ports, first, note in specs:
        arms = [dict(title=first, h=60, port=("solid" if head != "match" else None), tab_w=128),
                dict(title="…",   h=60, tab_w=128)]
        s, t = region(x, 86, 250, arms, head=head or "", head_h=hh,
                      head_ports=ports, corner_card=head is not None,
                      frame_stroke=BAD if head is None else FRAME)
        b.append(s)
        notes.append((x, note, head is None))
        hmax = max(hmax, t)
    for x, note, bad in notes:
        b.append(txt(x, 86 + hmax + 28, note, size=12, fill=BAD if bad else DIM, weight=600))
    b.append(txt(40, 60, "B · does the head bar show?", size=13, fill=INK, weight=700))
    b.append(txt(700, 86 + hmax + 48, "data-block-id has nowhere to go.", size=11.5, fill=BAD))
    return svg(W, 86 + hmax + 68, "".join(b))


def fig_dots():
    """The kit already has a FOUR-state port vocabulary, not two:
    `PortState = "empty" | "valueSet" | "wired" | "received"`
    (components/port.tsx:60). `valueSet` is literally "owns a default"."""
    b = [txt(40, 34, "C · the kit already has the states — all four of them", size=13, fill=INK, weight=700),
         code(40, 56, 'type PortState = "empty" | "valueSet" | "wired" | "received"   ·   components/port.tsx:60',
              size=11.5, fill=DIM)]
    rows = [
        ("empty",    False, None,   "nothing to test",
         "`else:` · `case _:` — no dot at all"),
        ("valueSet", False, "muted", "owns a default — the tab's own text is in force",
         '`if mode == "fast"` typed inline, no cable'),
        ("wired",    True,  None,   "a cable lands here and overrides it",
         "a real `==` block upstream computes the bool"),
        ("received", True,  "recv", "data arrived — this is the arm that fired",
         "your active-arm lens, for free"),
    ]
    y = 96
    for name, sup, tint, meaning, ex in rows:
        fillc = {"muted": "#6f7885", "recv": "#5cc98a"}.get(tint)
        if name == "empty":
            b.append(dot(60, y, supplied=False))
        elif fillc:
            b.append(f'<circle cx="60" cy="{y}" r="{R_DOT}" fill="{fillc}" stroke="{FRAME if tint=="muted" else OK}" stroke-width="2"/>')
        else:
            b.append(dot(60, y, supplied=True))
        b.append(txt(92, y + 5, name, size=12.5, fill=INK, font=MONO, weight=600))
        b.append(txt(196, y + 5, meaning, size=12.5, fill=DIM))
        b.append(code(624, y + 5, ex, size=11.5, fill=NEW))
        y += 46
    b.append(out_dot(60, y))
    b.append(txt(92, y + 5, "capture", size=12.5, fill=NEW, font=MONO, weight=600))
    b.append(txt(196, y + 5, "the header PRODUCES this into the body", size=12.5, fill=DIM))
    b.append(code(624, y + 5, "`case Point(x=0, y=y)` binds `y`", size=11.5, fill=NEW))
    y += 46
    b.append(txt(40, y + 14, "Only the square is new. `valueSet` — “owns a default” — is exactly the “default variables in", size=12, fill=OK, weight=600))
    b.append(txt(40, y + 32, "the title” you asked for, already named, already painted in all five skins. Nothing to invent.", size=12, fill=OK, weight=600))
    return svg(W, y + 54, "".join(b))


def fig_shortcircuit():
    a, ta = region(300, 112, 320, [
        dict(title="if",   h=66, port="solid", tab_w=100),
        dict(title="elif", h=104, port="solid", tab_w=100),
        dict(title="else", h=60, tab_w=100),
    ], head="Branch", head_h=HEAD_THIN)
    left = (block(30, 186, 210, 86, "sensor.read()", outs=[("v", True)], stroke=BAD)
            + a
            + wire([(240, 234), (270, 234), (270, 197), (300, 197)], stroke=BAD)
            + txt(30, 100, "A · the predicate lives outside the region", size=12.5, fill=BAD, weight=700))
    guard = (rect(14, 44, 196, 50, stroke=NEW, sw=1.4, rx=5, dash="4 3")
             + txt(24, 63, "sensor.read()", size=11, fill=NEW, font=MONO)
             + txt(24, 81, "  > threshold", size=11, fill=NEW, font=MONO))
    b, tb = region(680, 112, 300, [
        dict(title="if",   h=66, port="solid", tab_w=96),
        dict(title="elif", h=104, tab_w=96, body=[guard]),
        dict(title="else", h=60, tab_w=96),
    ], head="Branch", head_h=HEAD_THIN)
    right = (b + txt(680, 100, "B · the guard lives in the arm", size=12.5, fill=NEW, weight=700))
    bot = 112 + max(ta, tb)
    return svg(W, bot + 96, py(30, 34, [
        "if fast:                        estimate()",
        "elif sensor.read() > threshold: fallback()",
        "else:                           identity()"], fill=DIM)
        + left + right
        + txt(30, bot + 30, "Drawn as though it always runs. It does not —", size=12, fill=BAD)
        + txt(30, bot + 48, "`sensor.read()` fires only if arm 1 was false.", size=12, fill=BAD)
        + txt(30, bot + 70, "The fix has introduced a NEW lie.", size=12.5, fill=BAD, weight=700)
        + txt(500, bot + 30, "`elif` IS `else: if …` — Python desugars it that way. Put the", size=12, fill=NEW)
        + txt(500, bot + 48, "guard inside the arm and the laziness becomes structural rather", size=12, fill=NEW)
        + txt(500, bot + 66, "than annotated: flat look, nested truth. The tab is the seam.", size=12, fill=NEW))


FIGS = {}


def build_figs():
    FIGS["today"] = fig_today_shape()
    FIGS["rule"] = fig_rule()
    FIGS["match"] = fig_match()
    FIGS["ladder_wired"] = fig_ladder(False)
    FIGS["ladder_inline"] = fig_ladder(True)
    FIGS["guard"] = fig_guard()
    FIGS["select"] = fig_select()
    FIGS["tabs"] = fig_tabs_vs_flat()
    FIGS["head"] = fig_head_bar()
    FIGS["dots"] = fig_dots()
    FIGS["short"] = fig_shortcircuit()


# ── page ──────────────────────────────────────────────────────────────
SKETCHES = [
    ("Pasted image 20260922164006.png", "Your ternary sketch — Selector / True Value / False Value."),
    ("Pasted image 20260922164308.png", "Match with a subject on the head and a dot per case."),
    ("Pasted image 20260922164407.png", "match value: with the source above it."),
    ("Pasted image 20260922165239.png", "“In case you did ever need to pass something in you could draw a port.”"),
    ("Pasted image 20260922165249.png", "Branch: If / elif / elif, each with a tab and a dot."),
    ("Pasted image 20260922165313.png", "“Else of course has no need for input port.”"),
    ("Pasted image 20260922165427.png", "Your own TBD: tabs (left) vs flat rails (right)."),
]

TODAY_SHOTS = [
    ("today-many-inputs.png", "ManyInputs",
     "Three ports on the corner card — <code>input_1/2/3</code> — connected to nothing, "
     "above three arms called <code>arm 1 / arm 2 / arm N</code>. Nothing in the drawing says "
     "which port belongs to which arm. It is adjacency, not structure."),
    ("today-match-case.png", "MatchCase",
     "One port <code>cmd</code> on the corner card and static patterns below it. This one is "
     "already right — it is a LabVIEW Case Structure, and it is the shape the rest should not copy."),
    ("today-active-arm.png", "ActiveArm",
     "The shipped board. One port named <code>mode</code>; the arms say "
     "<code>if mode == \"fast\":</code> and <code>elif mode == \"safe\":</code>. "
     "The <code>==</code> is text. Nothing computes it, nothing can be wired to it."),
    ("today-nested.png", "Nested",
     "A branch inside a branch's arm. Every dot here is hollow and nothing is wired, "
     "so the inner branch's <code>gain</code> and the outer's <code>mode</code> read identically "
     "whether or not a value ever reaches them."),
]


def section(n, title, sub=""):
    s = f'<p class="sub">{sub}</p>' if sub else ""
    return f'<h2 id="s{n}"><span class="n">{n}</span>{title}</h2>{s}'


def figure(key, cap=""):
    c = f'<figcaption>{cap}</figcaption>' if cap else ""
    return f'<figure class="fig">{FIGS[key]}{c}</figure>'


def page() -> str:
    build_figs()
    sk = "".join(
        f'<figure class="sk"><img src="{shot(VAULT / f, quality=70)}" alt=""/>'
        f'<figcaption>{c}</figcaption></figure>' for f, c in SKETCHES)
    today = "".join(
        f'<figure class="cap"><img src="{shot(SHOTS / f, quality=72)}" alt=""/>'
        f'<figcaption><b>{n}</b> — {d}</figcaption></figure>' for f, n, d in TODAY_SHOTS)

    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>More truthful branching — bbox-ui</title>
<style>{CSS}
.fig{{margin:22px 0 26px;background:#0f1114;border:1px solid #232830;border-radius:10px;padding:14px}}
.fig figcaption{{color:var(--dim);font-size:12.5px;margin-top:10px;line-height:1.55}}
.cap,.sk{{margin:0;background:#0f1114;border:1px solid #232830;border-radius:10px;padding:10px}}
.cap img,.sk img{{width:100%;height:auto;display:block;border-radius:6px}}
.cap figcaption,.sk figcaption{{color:var(--dim);font-size:12.5px;margin-top:9px;line-height:1.6}}
.grid2{{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:18px 0}}
.grid3{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:18px 0}}
@media(max-width:860px){{.grid2,.grid3{{grid-template-columns:1fr}}}}
.lede{{font-size:16px;line-height:1.7;color:var(--fg)}}
.lede b{{color:#fff}}
.key{{border-left:3px solid #f0a83a;background:#17140c;padding:14px 18px;border-radius:0 8px 8px 0;margin:18px 0}}
.bad{{border-left-color:#e0615c;background:#1a1010}}
.ok{{border-left-color:#5cc98a;background:#0e1713}}
h2 .n{{display:inline-block;width:30px;color:#f0a83a;font-weight:800}}
.sub{{color:var(--dim);margin:-8px 0 16px;font-size:14px}}
table.m td,table.m th{{vertical-align:top;font-size:13px}}
.pill{{display:inline-block;background:#1d2230;border:1px solid #2c3444;border-radius:20px;
      padding:2px 10px;font-size:11.5px;color:#b9c3d2;margin-right:6px}}
.rec{{background:#17140c;border:1px solid #4a3a16;border-radius:8px;padding:10px 14px;margin:10px 0;font-size:13.5px}}
.rec b{{color:#f0a83a}}
</style></head><body>
<div class="wrap">

<header>
  <h1>More truthful branching</h1>
  <p class="lede">You are right that the headers are hiding functions, and the fix you found is the
  right one. The part worth adding is this: <b>you have two different structures under one name.</b>
  <code>match</code> really is a LabVIEW Case Structure — one selector, static patterns, no per-arm
  ports. <code>if/elif/else</code> is not one, and cannot be made into one, because each arm carries
  its own expression and they are evaluated in order. Draw them as two shapes and every one of your
  TBDs answers itself.</p>
  <p class="meta">bbox-ui · worktree <code>{BRANCH}</code> @ <code>{HEAD}</code> ·
  captures from the real Storybook, mocks hand-drawn (the proposed form does not exist yet) ·
  2026-09-22</p>
</header>

<div class="key">
<b>The answer in six lines</b>
<ol style="margin:10px 0 0;padding-left:20px;line-height:1.85">
<li><b>A dot is a value the structure consumes. Its position says who consumes it.</b> On the head
card = one subject for the whole structure. On an arm row = that arm's own test.</li>
<li><b><code>match</code> → head card, no arm dots.</b> Patterns are text because they are patterns,
not values. This is LabVIEW exactly, and it is the one fixture you already draw correctly.</li>
<li><b><code>if/elif/else</code> → one dot per arm, none on <code>else</code>.</b> Your sketch. There
is no shared selector to put on the head.</li>
<li><b>"Default variables in the title" is already a named port state.</b> The kit ships
<code>PortState = "empty" | "valueSet" | "wired" | "received"</code>
(<code>components/port.tsx:60</code>), and <code>valueSet</code> literally means "owns a default".
Nothing to invent — the branch just stops being special.</li>
<li><b>The ternary is not a region at all.</b> Three inputs, one output, no body — you decided this
on 2026-09-02 and the note is in the vault.</li>
<li><b>The fix introduces one new lie</b> — a predicate block drawn outside the region looks
unconditional, and an <code>elif</code>'s test is lazy. The tab is where to put it.</li>
</ol>
</div>

{section(1, "What the model actually says today")}
<p>Not an impression — this is the committed fixture set, captured from the real Storybook this
afternoon. The corner block carries <code>ports: {{ left: conditions }}</code> and an arm carries
<b>zero ports</b> (<code>scene/controlFlow.ts:10-21</code>). So the only place a value can enter is
the head card, and the only thing that can sit on an arm is a string.</p>

<div class="grid2">{today}</div>

<div class="key bad">
<b>The measurable problem: one data shape, three different meanings.</b>
<table class="m" style="margin-top:10px">
<tr><th>Fixture</th><th>What the port means there</th><th>Readable?</th></tr>
<tr><td><code>MATCH_CASE</code></td><td><code>cmd</code> is the <b>subject</b>; arms are static
patterns</td><td style="color:#5cc98a">yes — this is a Case Structure</td></tr>
<tr><td><code>BRANCH_ACTIVE</code></td><td><code>mode</code> is the <b>subject</b>, but the arms hold
uncomputed comparisons <code>mode == "fast"</code></td><td style="color:#e0615c">no — the
<code>==</code> exists nowhere</td></tr>
<tr><td><code>BRANCH_MANY_INPUTS</code></td><td><code>input_1/2/3</code> are <b>per-arm tests</b>,
bound to arms only by vertical coincidence</td><td style="color:#e0615c">no — nothing says which
goes with which</td></tr>
<tr><td><code>BRANCH_ONE_INPUT</code></td><td>one condition, one arm — ambiguous between the two
readings above</td><td style="color:#d8a13a">only because N=1</td></tr>
</table>
<p style="margin:12px 0 0">Three authors resolved the same grammar three ways. That is the
signature of a grammar that under-specifies, and it is exactly what you felt.</p>
</div>

{figure("today", "The shipped board, drawn from its own factory call. One port. Three arms. No binding between them.")}
{fb("1", "Today's diagnosis: one shape, three meanings")}

{section(2, "“It ends up looking like Unreal and Simulink”")}
<p class="lede">It ends up looking like <b>LabVIEW</b>, and that is forced — by a rule you already
chose.</p>
<table class="m">
<tr><th>Language</th><th>How conditional execution is expressed</th><th>Why you are not it</th></tr>
<tr><td><b>Unreal Blueprints</b></td><td>a white <b>execution wire</b>; a Branch node has
<code>True</code>/<code>False</code> exec outputs</td><td>you forbade it —
“control flow is never a cable” (<code>CLAUDE.md</code>)</td></tr>
<tr><td><b>Simulink</b></td><td>no control flow at all — every block runs every tick; an
<code>If</code> block is an <em>enabled subsystem</em></td><td>Python has statements; you are
projecting real source, not a signal graph</td></tr>
<tr><td><b>LabVIEW</b></td><td><b>structured dataflow</b>: control is a bounded <em>structure</em>
with a selector terminal, never a wire</td><td>— this is you</td></tr>
</table>
<div class="key">
<b>So the convergence is real, and it is not a failure of imagination.</b> Once you forbid an
execution cable, the only remaining way to say “this runs and that does not” is to make it
<em>structure</em>: a bounded region with an operand. There genuinely is one method. What you should
notice is that you already beat LabVIEW on one point — <b>LabVIEW cannot draw a flat elif ladder.</b>
It nests a Case Structure inside the previous one's False case. NI declined stacked cases because
output tunnels multiply per case; you dropped input tunnels, so the objection does not apply to you
(your own note, <em>C&nbsp;-&nbsp;Branch Region Asymmetry</em>, §“LabVIEW could not show both arms”).
The flat ladder is yours, not a copy.</p>
</div>
{fb("2", "Why LabVIEW and not Blueprints/Simulink")}

{section(3, "The grammar", "One rule. It produces two shapes, and the hard cases fall out of it.")}
{figure("rule")}
<div class="rec"><b>The rule.</b> A dot is a value the structure consumes at run time. Text in a
header is only allowed to be a <em>pattern</em> — something that is matched, never evaluated. Anything
that is evaluated is a value and owes a dot. A call, an attribute access, a comparison or anything
with a side effect is <em>always</em> evaluated, so it can never legitimately be a case label. That is
your side-effect worry, closed mechanically: it is an AST check on the test expression, not something
anyone has to remember.</div>

<h3>3.1 · <code>match</code> — the Case Structure, unchanged</h3>
{figure("match", "One subject on the head card. Arms carry patterns, which are text because they are patterns. <code>case _:</code> has nothing to test, so it has no dot — exactly your sketch.")}

<h3>3.2 · <code>if/elif/else</code> — a predicate ladder, one dot per arm</h3>
<p>There is no shared selector, so the head card carries nothing but the name. Two spellings of the
same arm, and the difference is only whether a cable lands:</p>
{figure("ladder_wired", "SUPPLIED. The test is a real block: <code>==</code> is drawn, so a version that called <code>sensor.read()</code> would be drawn too. This is the form that survives side effects.")}
{figure("ladder_inline", "<code>state=\"valueSet\"</code> — this is your “default variables in the title”. The tab's own text is in force; wire the dot and it becomes <code>\"wired\"</code> and the text is overridden. No pill needed, and no new state: it is what every port in the kit already does.")}

<h3>3.3 · The case your sketch was reaching for</h3>
<p>Your <code>case var</code> drawing — “in case you did ever need to pass something in you could
draw a port” — is pointing at something sharper than a port. In Python a pattern <b>binds</b> as well
as tests: <code>case Point(x=0, y=y)</code> destructures and produces <code>y</code>
<em>inside</em> the arm. That is an output of the header, not an input. And
<code>case … if y &gt; 0:</code> is a real guard, which then comes back in as an ordinary operand.
One grammar covers both without a special rule.</p>
{figure("guard")}
{fb("3", "The grammar: head-card subject vs per-arm operand")}

{section(4, "Your four TBDs, answered")}

<h3>A · tabs or flat rails?</h3>
{figure("tabs")}
<div class="rec"><b>Tabs.</b> Reversible default: build tabs. The argument is not aesthetic — the tab
is the only edge a capture dot, a guard strip or a fold chevron can attach to, and “an arm is a
block” is your own rule. A flat label floats in the body and reads as content.
<br><span class="pill">falls out</span> an arm with nothing to test gets no tab furniture at all,
which is why <code>else</code> and <code>case _:</code> look plain in your own sketches. The tab
<em>is</em> what the dot attaches to.</div>
{fb("4a", "TBD A — tabs vs flat rails")}

<h3>B · does the head bar show?</h3>
{figure("head")}
<div class="rec"><b>Always present, visually quiet when empty.</b> Reversible default: keep it and let
it hug. The corner card is the only thing carrying <code>data-block-id</code>
(<code>CLAUDE.md</code>, “a region is ONE node, the frame owns no id”), so removing it costs the
region its identity and every wire into it. But “present” does not mean “tall”: with a subject it is
a full card, with nothing it collapses to a title strip. That is the kit's existing hug behaviour,
not a new mode — which is the honest reading of your “maybe lightly?”.</div>
{fb("4b", "TBD B — head bar: always, light, or none")}

<h3>C · what state is a dot in?</h3>
{figure("dots")}
{fb("4c", "TBD C — dot states")}

<h3>D · is <code>match</code> the same shape as <code>if</code>?</h3>
<div class="rec"><b>No — and today's code says yes.</b> <code>matchCaseArms()</code> and
<code>ifElifElseArms()</code> differ only in the strings they write
(<code>scene/region.branch.ts:171-187</code>: “it is the same region, the same corner block carrying
the subject as a condition port, and the same arm rows — only the titles differ”). That is the
conflation. Splitting them is the whole change; everything else in this report is a consequence.
<br><span class="pill">test</span> can the reader tell, from the drawing alone, whether the value on
the left is tested once or N times? Today: no. After: the position answers it.</div>
{fb("4d", "TBD D — split match from if/elif")}

{section(5, "The one new lie the fix introduces", "Worth naming before you build it, because it will come back.")}
{figure("short")}
<div class="key">
<b>Recommendation:</b> ship A (predicate outside) as V1 with a lint that flags a producer feeding an
arm below the first, and treat B (guard in the tab) as the honest form to grow into. A is what
LabVIEW does too — but LabVIEW gets away with it because it <em>nests</em>, so its inner selector
really is conditional. Your flat ladder buys legibility and owes this back.
<br><br><b>Where to stop.</b> <code>a &gt; b and c.ready()</code> short-circuits too, so this
recursion has no natural floor. Stop it at the arm boundary: <b>one boolean per arm, period.</b>
Whatever produces it is upstream and gets ordinary upstream treatment. Do not make <code>and</code>
a region.
</div>
{fb("5", "The short-circuit lie and where to stop")}

{section(6, "What this does NOT reopen")}
<p>Two things you already settled that this design leaves exactly where they are.</p>
{figure("select", "Your first sketch drew the ternary as a region with a header and a body. It is not one.")}
<div class="key ok">
<b>The join stays as you picked it.</b> No yield ports on the region; each arm's producer runs one
cable to the consumer, whose input becomes a one-of receiver (your V1 pick, 2026-09-02: yields “get
messy — then you don't know which of those ports are firing”). Nothing here needs it reopened —
<em>the selector is not a tunnel.</em> Input tunnels are fake because a region can already see what
was defined before it; but the selector is not read by the body, it is read by the <b>structure
itself</b>. It is an operand of the <code>if</code>, the way <code>%cond</code> is an operand of
MLIR's <code>scf.if</code> and not one of its captured values. That distinction is what makes a
per-arm dot legal inside the asymmetry rule you already wrote.
</div>
{fb("6", "Ternary = Select block; join unchanged")}

{section(7, "The stock parts this is made of", "What already exists, what is a props change, what is genuinely new.")}
<table class="m">
<tr><th>Element</th><th>Today</th><th>Off-the-shelf part, by its exact exported name</th><th>Behaviour that must survive</th></tr>
<tr><td>Region frame + arm stack</td><td><code>BlockRegion</code> draws frame, corner, arm rows</td>
<td><code>BlockRegion</code>, <code>RegionArm</code> (<code>components/blockRegion.tsx</code>)</td>
<td>per-arm fold, <code>activeArm</code> fade, arm-relative child positions</td></tr>
<tr><td>Arm operand dot</td><td><b>does not exist</b> — an arm has zero ports</td>
<td><code>RegionArm.port?: PortSpec</code> — a new optional field rendering the kit's existing
<code>portDotClass</code></td><td>the dot resolves through <code>wireLayer.tsx</code>'s ordinary
<code>[data-port-id]</code> lookup; no second wire path</td></tr>
<tr><td>Default vs wired vs firing</td><td>already a four-state vocabulary, painted in all five
skins</td><td><code>PortState</code> + <code>portGrammarPaint</code>
(<code>components/port.tsx:60,203</code>), <code>skin/portVariants.ts</code> — both unchanged</td>
<td><code>valueSet</code> keeps meaning “owns a default”; <code>received</code> gives the active-arm
lens a dot state for free</td></tr>
<tr><td>Inline default text</td><td><code>BlockValue</code> renders a literal in place of a pill</td>
<td><code>block.value.tsx</code> (<code>BlockValue</code>) — the precedent to copy into the tab,
paired with <code>state="valueSet"</code> on the dot</td>
<td>truthful property rendering: <code>mode == "fast"</code> keeps its spaces and quotes</td></tr>
<tr><td>Capture dot (<code>case Point(y=y)</code>)</td><td>does not exist</td>
<td>an ordinary right-wall port on the tab — no new component</td><td>faces right so it can never be
confused with an operand</td></tr>
<tr><td>Guard strip inside the tab</td><td>does not exist</td>
<td><code>BlockMembers</code> <code>layout="free"</code>, already used for arm bodies</td>
<td>nothing new; a tab is a very short body</td></tr>
<tr><td><b>unchanged (stock seam)</b></td><td>the join at the consumer</td>
<td><code>BlockPort</code>'s ordinary fan-in — two cables, one dot</td><td>V1 decision from
2026-09-02 stands; this proposal adds no yield port</td></tr>
<tr><td><b>unchanged (stock seam)</b></td><td><code>break</code>/<code>continue</code></td>
<td><code>Badge</code> with <code>data-slot="control-mark"</code></td><td>still a mark, never a
wire</td></tr>
</table>
{fb("7", "Stock-part mapping")}

{section(8, "What actually changes in code")}
<p>Small, and mostly in one file. Nothing in <code>components/blockRegion.tsx</code>'s layout math
moves.</p>
<table class="m">
<tr><th>#</th><th>Change</th><th>Where</th></tr>
<tr><td>1</td><td><code>BranchArmSpec</code> gains <code>test?: {{ name: string; default?: string }}</code>
— the arm's own operand. <code>title</code> stops carrying the expression.</td>
<td><code>scene/region.branch.ts:40-47</code></td></tr>
<tr><td>2</td><td><code>branchNode</code> splits into <code>branchNode</code> (no head ports; arms
carry tests) and <code>matchNode</code> (one head port; arms carry patterns, no tests).
<code>ifElifElseArms</code> / <code>matchCaseArms</code> stop being interchangeable.</td>
<td><code>scene/region.branch.ts:80-200</code></td></tr>
<tr><td>3</td><td><code>RegionArm</code> gains an optional port; the tab renders it on the frame's
left wall at the tab's vertical centre.</td><td><code>components/blockRegion.tsx</code>,
<code>blockRegion.layout.ts</code></td></tr>
<tr><td>4</td><td>The four branch fixtures are rewritten to the split grammar — this is the
regression that proves the ambiguity is gone.</td><td><code>scene/region.branch.fixtures.ts</code></td></tr>
<tr><td>5</td><td>A lint: an arm's test expression that is not a name, a literal or a pure comparison
must be supplied by a cable.</td><td><code>scene/lint.ts</code></td></tr>
<tr><td>6</td><td>pyblocks' forward pass emits <code>test</code> from the real AST instead of
stringifying it into a title.</td><td>pyblocks <code>to_systemsketch</code> — separate repo, separate
lane</td></tr>
</table>
{fb("8", "The code change list")}

{section(9, "Where this leaves you")}
<table class="m">
<tr><th style="width:130px">State</th><th>What</th></tr>
<tr><td style="color:#5cc98a"><b>Done &amp; proved</b></td><td>
Today's grammar measured against the committed fixtures and captured from the real Storybook —
the three-meanings table in §1 is read off <code>region.branch.fixtures.ts</code>, not inferred.
The four-state port vocabulary is verified present (<code>components/port.tsx:60</code>), so
“default in the title” costs nothing. The LabVIEW semantics are from the page you linked, fetched
today, not from memory.</td></tr>
<tr><td style="color:#d8a13a"><b>Left, not blocked</b></td><td>
The six code changes in §8. They are one file plus a fixture rewrite; the layout math in
<code>blockRegion.layout.ts</code> does not move. A lane could land 1–4 in an afternoon; 5 (the lint)
and 6 (pyblocks' forward pass) are separate.</td></tr>
<tr><td style="color:#79a6ff"><b>Needs you</b></td><td>
<b>One real decision:</b> split <code>match</code> from <code>if/elif</code> as two factories, or
keep one shape and accept the ambiguity? Everything else follows from it.
<span class="pill">default on silence</span> split them — it is the smaller change and it is what
makes the drawing readable without a legend.<br>
The other three (tabs, head bar, dot states) each carry a reversible default above and I would just
build them that way.</td></tr>
<tr><td style="color:#98a2b1"><b>Deliberately not done</b></td><td>
<b>Nothing implemented.</b> You asked to improve the thinking, and the arm-port change touches a
frozen contract three hosts read — that is a lane with a committed baseline, not a drive-by edit.<br>
<b>The join is not reopened.</b> Your 2026-09-02 V1 pick (fan-in at the consumer, no yield dots)
stands; §6 argues it does not need revisiting even with per-arm operands.<br>
<b>No <code>and</code>/<code>or</code> decomposition.</b> Named as a rabbit hole in §5 and stopped at
the arm boundary on purpose.<br>
<b>No React Flow / tldraw review board.</b> There is nothing running to seed one from yet.</td></tr>
</table>
{fb("9", "The decision: split match from if, or keep one shape")}

{section(10, "Your sketches", "Embedded as taken, for the record.")}
<div class="grid3">{sk}</div>

{overall_box("what you'd change about the grammar…")}
{dock("truthful-branching-2026-09-22", "item", 12)}
</div>
<script>{FB_JS}</script></body></html>"""


if __name__ == "__main__":
    report_size(page(), OUT)
