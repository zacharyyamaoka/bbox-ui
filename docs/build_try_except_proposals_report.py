#!/usr/bin/env python3
"""Build reports/media/try-except-proposals-2026-09-22.html.

Zach, 2026-09-22: "please make a subagent come up with 5 proposals a try,
expect, etc block. I feel its not necessarily branching feelings more
sequential regions that conditionally fire... (does lab view or unreal have
a reference)?"

Five orthogonal proposals for drawing `try / except / else / finally` on a
block-and-ports canvas, a straight answer to the LabVIEW/Unreal question,
and the wider prior-art sweep that turned out to matter more than either.

    python3 docs/build_try_except_proposals_report.py

Everything sits inside the grammar settled this afternoon
(reports/media/truthful-branching-2026-09-22.html): a dot is a value the
structure consumes, its POSITION says who consumes it, header text may only
be a pattern, and control flow is never a cable.

Mocks are hand-drawn (`_branch_svg` + `_branch_mocks` + `_tryexcept_svg`)
because none of this exists: `scene/controlFlow.ts` has no exception
vocabulary and `docs/CONTROL-FLOW-PLAN.md` never mentions one — grepped, not
assumed.

Every semantic claim below was re-derived by RUNNING CPython 3.12.3, not
read off a summary; the transcript is embedded in §2.
"""
from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _report_kit import CSS, FB_JS, dock, fb, overall_box, report_size, sh  # noqa: E402
from _branch_svg import *  # noqa: E402,F401,F403
from _branch_svg import (BAD, BG, CODE, DIM, FRAME, HOLLOW, INK, MONO, NEW, OK,
                         RULE, SANS, R_DOT, callout, chip, code, dot, esc, line,
                         out_dot, rect, svg, txt, wire)  # noqa: E402
from _branch_mocks import HEAD_FULL, HEAD_THIN, TAB_H, block, py, region, src_of  # noqa: E402
from _tryexcept_svg import (ALWAYS, ARM_HEADER_PX, CORNER_W_PX, GROUP, PROT,
                            always_strip, capdot, cut, excbox, footer_band,
                            head, legend, matrix, protected, tab, tabw)  # noqa: E402

HERE = pathlib.Path(__file__).resolve().parent
TREE = HERE.parent
MAIN = pathlib.Path("/home/bam/bbox-ui")
OUT = MAIN / "reports/media/try-except-proposals-2026-09-22.html"

HEAD_SHA = sh("git rev-parse --short HEAD", TREE)
BRANCH = sh("git rev-parse --abbrev-ref HEAD", TREE)
PYVER = sh("python3 -c 'import sys;print(\".\".join(map(str,sys.version_info[:3])))'", TREE)

W = 1000

# The one example every proposal is drawn from, so they are comparable.
SAMPLE = [
    "try:",
    "    cfg = load(path)",
    "    validate(cfg)",
    "except FileNotFoundError as e:",
    "    cfg = DEFAULTS",
    "except (ValueError, KeyError) as e:",
    "    report(e)",
    "else:",
    "    cache[path] = cfg",
    "finally:",
    "    fh.close()",
]


# ══════════════════════════════════════════════════════════════════════
#  §1  The fact that decides everything
# ══════════════════════════════════════════════════════════════════════

def fig_protection():
    """The naive drawing vs the true extent of the protection.

    Load-bearing, and measured by execution: a `raise` inside `else` is NOT
    caught by the except clauses above it. So a single frame drawn around
    all four suites claims a protection three of them do not have.
    """
    h = 466
    b = []
    b.append(txt(40, 26, "THE DRAWING EVERYONE REACHES FOR", size=11, fill=BAD,
                 weight=700, style='letter-spacing="0.09em"'))
    b.append(txt(540, 26, "WHAT PYTHON ACTUALLY PROTECTS", size=11, fill=OK,
                 weight=700, style='letter-spacing="0.09em"'))

    # ── left: one frame around everything ──────────────────────────────
    x, y, w = 30, 44, 400
    rows = [("try:", 62), ("except FileNotFoundError:", 50),
            ("except (ValueError, KeyError):", 50), ("else:", 50), ("finally:", 50)]
    total = 34 + sum(r[1] for r in rows)
    b.append(rect(x, y, w, total, stroke=FRAME, sw=1.8, rx=8))
    b.append(head(x, y, w, "try"))
    cy = y + 34
    for i, (label, rh) in enumerate(rows):
        if i:
            b.append(line(x, cy, x + w, cy, stroke=RULE, sw=1.3))
        b.append(tab(x, cy, 244, label))
        cy += rh
    b.append(rect(x - 7, y - 7, w + 14, total + 14, stroke=BAD, sw=2.0, rx=11, dash="6 4"))
    b.append(txt(x + w / 2, y + total + 34, "one frame \u2192 one protection claim", size=12,
                 fill=BAD, anchor="middle", weight=700))
    b.append(txt(x + w / 2, y + total + 52, "but only the first row is inside it", size=12,
                 fill=BAD, anchor="middle", weight=700))

    # ── right: the true extent ─────────────────────────────────────────
    x2 = 470
    b.append(rect(x2, y, w, total, stroke=FRAME, sw=1.8, rx=8))
    b.append(head(x2, y, w, "try"))
    cy = y + 34
    b.append(protected(x2 + 6, cy + 4, w - 12, rows[0][1] - 8, label=""))
    for i, (label, rh) in enumerate(rows):
        if i:
            b.append(line(x2, cy, x2 + w, cy, stroke=RULE, sw=1.3))
        b.append(tab(x2, cy, 244, label, stroke=PROT if i == 0 else FRAME))
        cy += rh
    nx = x2 + w + 12
    b.append(txt(nx, y + 34 + 26, "protected", size=11, fill=PROT, weight=800))
    b.append(txt(nx, y + 34 + 41, "— the try suite", size=10, fill=PROT, weight=600))
    b.append(txt(nx, y + 34 + 56, "alone", size=10, fill=PROT, weight=600))
    b.append(line(nx - 6, y + 34 + 8, nx - 6, y + 34 + rows[0][1] - 4, stroke=PROT, sw=2.2))
    ny0, ny1 = y + 34 + rows[0][1] + 6, y + 34 + total - 34 - 6
    b.append(line(nx - 6, ny0, nx - 6, ny1, stroke="#4a515e", sw=2.2))
    b.append(txt(nx, (ny0 + ny1) / 2 - 6, "not", size=10.5, fill=DIM, weight=700))
    b.append(txt(nx, (ny0 + ny1) / 2 + 8, "protected", size=10.5, fill=DIM, weight=700))
    b.append(txt(x2 + w / 2, y + total + 34, "three suites sit OUTSIDE the boundary,",
                 size=12, fill=OK, anchor="middle", weight=700))
    b.append(txt(x2 + w / 2, y + total + 52, "inside the same frame", size=12, fill=OK,
                 anchor="middle", weight=700))
    return svg(W, h, "".join(b),
               "Left: one frame claims protection for four suites. Right: only the try suite has it.")


def fig_outcome():
    """The try suite has THREE outcomes, not two, and one of them cannot be
    authored as an arm."""
    b = []
    b.append(txt(24, 24, "What the try suite produces, and which rows each outcome reaches",
                 size=13, fill=INK, weight=700))
    cols = ["except E", "except (…)", "else", "finally"]
    rows = [
        ("raised  FileNotFoundError", [1, 0, 0, 1], "first match wins"),
        ("raised  KeyError", [0, 1, 0, 1], "no earlier arm matched"),
        ("raised  OSError", [0, 0, 0, 1], "unmatched \u2192 propagates after"),
        ("completed", [0, 0, 1, 1], "this is what `else` means"),
        ("return / break / continue", [0, 0, 0, 1], "no arm can be written for it"),
    ]
    m, mh = matrix(24, 40, cols, rows, cw=120, rh=28, label_w=216)
    b.append(m)
    yy = 40 + mh + 34
    b.append(txt(24, yy, "Read the bottom two rows together: `completed` and `left early` are "
                         "different outcomes with different consequences,", size=12.5, fill=DIM))
    b.append(txt(24, yy + 19, "and only one of them has a row you can draw. The `finally` column "
                              "is solid all the way down — that is the whole", size=12.5, fill=DIM))
    b.append(txt(24, yy + 38, "point of `finally`, and no proposal that draws it as a fifth arm "
                              "can say so.", size=12.5, fill=DIM))
    return svg(W, 40 + mh + 108, "".join(b),
               "A truth table: five outcomes of the try suite against the four rows below it.")


def fig_ladder_vs_sieve():
    """`except` is a first-match ladder. `except*` is a partition. Same
    four rows on the page, opposite firing rules."""
    b = []
    b.append(txt(40, 24, "except  —  A LADDER", size=11.5, fill=INK, weight=700,
                 style='letter-spacing="0.09em"'))
    b.append(txt(540, 24, "except*  —  A SIEVE", size=11.5, fill=GROUP, weight=700,
                 style='letter-spacing="0.09em"'))
    b.append(txt(40, 44, "first clause whose type matches wins; the rest never run",
                 size=11.5, fill=DIM))
    b.append(txt(540, 44, "every clause runs at most once, each taking its own subgroup",
                 size=11.5, fill=DIM))

    # left: the ladder
    x, y, w = 40, 62, 420
    b.append(excbox(x + 130, y, 170, 26, "KeyError", stroke=BAD))
    cy = y + 46
    arms = [("except ValueError:", 0), ("except KeyError:", 1), ("except Exception:", 0)]
    b.append(rect(x, cy, w, 34 + 3 * 52, stroke=FRAME, sw=1.8, rx=8))
    b.append(head(x, cy, w, "handlers"))
    ry = cy + 34
    for i, (label, fires) in enumerate(arms):
        if i:
            b.append(line(x, ry, x + w, ry, stroke=RULE, sw=1.3))
        op = 1.0 if fires else 0.32
        b.append(tab(x, ry, 214, label, op=op,
                     fill_bg=OK if fires else None))
        if fires:
            b.append(txt(x + w - 14, ry + 21, "FIRES", size=10.5, fill=OK, anchor="end",
                         weight=800))
        elif i > 1:
            b.append(txt(x + w - 14, ry + 21, "never reached", size=10.5, fill="#4a515e",
                         anchor="end", weight=600))
        ry += 52

    # right: the sieve
    x2 = 540
    b.append(excbox(x2 + 60, y, 310, 26, "ExceptionGroup[ValueError, TypeError, KeyError]",
                    stroke=GROUP))
    cy = y + 46
    arms2 = [("except* ValueError:", "ValueError"), ("except* TypeError:", "TypeError"),
             ("except* Exception:", "KeyError")]
    b.append(rect(x2, cy, w, 34 + 3 * 52, stroke=GROUP, sw=1.8, rx=8))
    b.append(head(x2, cy, w, "handlers", stroke=GROUP))
    ry = cy + 34
    for i, (label, took) in enumerate(arms2):
        if i:
            b.append(line(x2, ry, x2 + w, ry, stroke=RULE, sw=1.3))
        b.append(tab(x2, ry, 214, label, stroke=GROUP, fill_bg=GROUP))
        b.append(txt(x2 + w - 14, ry + 21, f"FIRES · took {took}", size=10.5, fill=GROUP,
                     anchor="end", weight=800))
        ry += 52
    bot = cy + 34 + 3 * 52 + 30
    b.append(txt(40, bot, "one arm ran", size=12, fill=OK, weight=700))
    b.append(txt(540, bot, "all three arms ran", size=12, fill=GROUP, weight=700))
    b.append(txt(40, bot + 20, "Measured, not assumed — §2's transcript runs exactly these two "
                               "cases. A drawing that cannot tell them apart is the lie this "
                               "whole report is about.", size=11.5, fill=DIM))
    return svg(W, bot + 42, "".join(b),
               "Left: except, a first-match ladder, one arm fires. Right: except*, a sieve, all three fire.")


def fig_instinct():
    """Zach's hypothesis, steelmanned and then broken in three places."""
    b = []
    b.append(txt(24, 26, "“not necessarily branching — more sequential regions that "
                         "conditionally fire”", size=14.5, fill=INK, weight=700))
    b.append(txt(24, 48, "The strong form of this is right about the SHAPE and wrong about the "
                         "FIRING RULE. Both halves matter.", size=12.5, fill=DIM))

    x, y, w = 24, 72, 452
    b.append(txt(x, y - 6, "THE STEELMAN — and it is a good one", size=11, fill=OK, weight=700,
                 style='letter-spacing="0.08em"'))
    rows = [("try:", "always", ALWAYS), ("except FileNotFoundError:", "if raised & matches", NEW),
            ("except (ValueError, KeyError):", "if raised & matches", NEW),
            ("else:", "if completed", NEW), ("finally:", "always", ALWAYS)]
    cy = y + 10
    for i, (label, cond, col) in enumerate(rows):
        b.append(rect(x, cy, w, 34, stroke=col, sw=1.4, rx=5, fill="none", op=1))
        if col == ALWAYS:
            b.append(f'<rect x="{x}" y="{cy}" width="{w}" height="34" rx="5" fill="{col}"'
                     f' opacity="0.13"/>')
        b.append(code(x + 14, cy + 22, label, size=12, fill=INK))
        b.append(txt(x + w - 12, cy + 21.5, cond, size=10.5, fill=col, anchor="end", weight=700))
        cy += 40
    b.append(txt(x, cy + 8, "Rows in source order. Each carries its own firing condition.",
                 size=11.5, fill=DIM))
    b.append(txt(x, cy + 26, "No tree, no nesting, no branch. This is genuinely how the statement",
                 size=11.5, fill=DIM))
    b.append(txt(x, cy + 44, "reads, and it round-trips to text with zero cleverness.",
                 size=11.5, fill=DIM))

    # the three breaks
    x2 = 524
    b.append(txt(x2, y - 6, "WHERE IT BREAKS — three places, all structural", size=11, fill=BAD,
                 weight=700, style='letter-spacing="0.08em"'))
    breaks = [
        ("1", "“conditionally” is not true of two of the five rows.",
         "`try` and `finally` have no condition at all. A vocabulary whose whole\n"
         "job is “when does this fire” needs a value meaning “always”, and\n"
         "an always-true condition is a word, not a structure — the exact failure\n"
         "this morning’s report closed for `mode == \"fast\"`."),
        ("2", "The middle rows are not independent — they are one selection.",
         "Exactly one of {except₁, except₂, else} runs, chosen in order by one\n"
         "subject. Drawn as N independent conditions, the reader cannot tell that\n"
         "two arms firing is impossible — and under `except*` it is not only\n"
         "possible, it is the normal case. Same drawing, opposite rule."),
        ("3", "A sequence cannot draw the abort.",
         "The exception is raised at an unknown statement INSIDE row 1, and the\n"
         "rest of that row does not run. “Row 1 fired” is true and useless. This\n"
         "is the one thing no ordering vocabulary can express, and it is the\n"
         "difference between `try` and every other region in the kit."),
    ]
    cy = y + 10
    for n, title, bodytext in breaks:
        lines = bodytext.split("\n")
        hh = 26 + len(lines) * 16
        b.append(rect(x2, cy, W - x2 - 24, hh, stroke="#3a2226", sw=1.4, rx=7, fill="#170f11"))
        b.append(f'<circle cx="{x2 + 17}" cy="{cy + 17}" r="9" fill="{BAD}"/>')
        b.append(txt(x2 + 17, cy + 21, n, size=11, fill="#140d0e", anchor="middle", weight=800))
        b.append(txt(x2 + 34, cy + 21, title, size=12, fill=INK, weight=700))
        for i, ln in enumerate(lines):
            b.append(txt(x2 + 34, cy + 40 + i * 16, ln, size=11, fill=DIM, weight=500))
        cy += hh + 10
    return svg(W, max(cy + 16, y + 10 + 5 * 40 + 60), "".join(b),
               "Zach's sequential-bands hypothesis, steelmanned on the left and broken in three places on the right.")


# ══════════════════════════════════════════════════════════════════════
#  The five proposals
# ══════════════════════════════════════════════════════════════════════

def fig_p1():
    """BANDS — Zach's instinct built literally. One region, rows in source
    order, the firing condition carried by the row's own shape."""
    b = []
    x, y, w = 40, 54, 476
    b.append(txt(x, 30, "THE DRAWING", size=11, fill=DIM, weight=700,
                 style='letter-spacing="0.09em"'))
    _r = ["try:", "except FileNotFoundError as e:",
          "except (ValueError, KeyError) as e:", "else:", "finally:"]
    rows = [
        (_r[0], "always", None, None, 74),
        (_r[1], "tab", True, tabw(_r[1]), 58),
        (_r[2], "tab", True, tabw(_r[2]), 58),
        (_r[3], "tab", None, tabw(_r[3]), 58),
        (_r[4], "always", None, None, 58),
    ]
    total = 34 + sum(r[4] for r in rows)
    b.append(rect(x, y, w, total, stroke=FRAME, sw=1.8, rx=8))
    b.append(head(x, y, w, "try"))
    cy = y + 34
    for label, kind, cap, tw, rh in rows:
        if kind == "always":
            b.append(always_strip(x, cy, w, label))
        else:
            b.append(line(x, cy, x + w, cy, stroke=RULE, sw=1.3))
            b.append(tab(x, cy, tw, label))
            if cap:
                # bare dot: the tab text already spells `as e`, and a second
                # `e` beside it is noise, not information.
                b.append(out_dot(x + tw, cy + ARM_HEADER_PX / 2))
        cy += rh
    b.append(code(x + 26, y + 34 + 52, "cfg = load(path)", size=11.5, fill=DIM))
    b.append(code(x + 26, y + 34 + 68, "validate(cfg)", size=11.5, fill=DIM))
    b.append(legend(x, y + total + 30, [
        (ALWAYS, "no tab  =  nothing selects this row"),
        (FRAME, "tab  =  a row the structure chooses"),
        (NEW, "square dot  =  `as e`, a value the header binds INTO the body"),
    ]))

    # the failure, drawn
    x2 = 540
    b.append(txt(x2, 30, "WHAT IT CANNOT SAY", size=11, fill=BAD, weight=700,
                 style='letter-spacing="0.09em"'))
    b.append(rect(x2, y, W - x2 - 40, 128, stroke="#3a2226", sw=1.4, rx=7, fill="#170f11"))
    b.append(txt(x2 + 16, y + 26, "Three rows with three independent conditions admit",
                 size=12, fill=INK, weight=600))
    b.append(txt(x2 + 16, y + 44, "a state Python forbids:", size=12, fill=INK, weight=600))
    for i, s in enumerate(["except FileNotFoundError", "except (ValueError, KeyError)", "else"]):
        yy = y + 66 + i * 20
        b.append(txt(x2 + 26, yy, "✓", size=13, fill=BAD, weight=800))
        b.append(code(x2 + 44, yy, s, size=11.5, fill=DIM))
    b.append(txt(x2 + 258, y + 88, "all three at once —", size=11, fill=BAD, weight=700))
    b.append(txt(x2 + 258, y + 104, "nothing forbids it", size=11, fill=BAD, weight=700))

    b.append(rect(x2, y + 142, W - x2 - 40, 108, stroke="#2b3a2e", sw=1.4, rx=7, fill="#0f1712"))
    b.append(txt(x2 + 16, y + 168, "… and yet that is exactly right for", size=12, fill=OK,
                 weight=600))
    b.append(code(x2 + 16, y + 188, "except*", size=13, fill=GROUP))
    b.append(txt(x2 + 16, y + 210, "where every arm really can fire. P1 is the only",
                 size=11.5, fill=DIM))
    b.append(txt(x2 + 16, y + 228, "proposal that draws exception GROUPS correctly,",
                 size=11.5, fill=DIM))
    b.append(txt(x2 + 16, y + 246, "and it gets there by being wrong about `except`.",
                 size=11.5, fill=DIM))
    return svg(W, max(y + total + 116, y + 270), "".join(b),
               "Proposal 1, bands: one region, rows in source order, no tab on the rows nothing selects.")


def fig_p2():
    """BOUNDARY — the try body is the node; handlers mount on its wall at
    the point the exception leaves. The BPMN answer."""
    b = []
    x, y, w = 40, 56, 330
    b.append(txt(x, 30, "THE DRAWING", size=11, fill=DIM, weight=700,
                 style='letter-spacing="0.09em"'))
    bh = 168
    b.append(rect(x, y, w, bh, stroke=PROT, sw=2.0, rx=8))
    b.append(head(x, y, w, "try", stroke=PROT))
    b.append(code(x + 22, y + 60, "cfg = load(path)", size=12, fill=CODE))
    b.append(cut(x + 16, y + 74, w - 40, label=None))
    b.append(code(x + 22, y + 100, "validate(cfg)", size=12, fill="#4a515e"))
    b.append(txt(x + 22, y + 122, "skipped — “the rest of the clause is skipped”",
                 size=10, fill=BAD, weight=600))
    b.append(txt(x + 22, y + 138, "docs.python.org/3/tutorial/errors.html", size=9.5,
                 fill="#5c6370", weight=500))
    b.append(txt(x + w / 2, y + bh + 22, "the protected body IS the node", size=11.5,
                 fill=PROT, anchor="middle", weight=700))

    # handlers mounted ON the right wall, touching — adjacency, never a cable
    hx = x + w
    hy = y + 52
    hands = [("FileNotFoundError", "e", "cfg = DEFAULTS"),
             ("(ValueError, KeyError)", "e", "report(e)")]
    for i, (typ, cap, bodyline) in enumerate(hands):
        yy = hy + i * 62
        b.append(dot(hx, yy + 16, supplied=True, stroke=BAD))
        b.append(f'<path d="M {hx} {yy} L {hx + 300} {yy} L {hx + 300} {yy + 52}'
                 f' L {hx} {yy + 52}" fill="none" stroke="{BAD}" stroke-width="1.5"/>')
        b.append(code(hx + 22, yy + 19, f"except {typ}", size=11.5, fill=INK))
        b.append(capdot(hx + 268, yy + 17, cap))
        b.append(code(hx + 22, yy + 40, bodyline, size=11, fill=DIM))
    # Two lines, not one. WHY: at 10.5px this sentence is ~350px and the
    # right-hand column starts at x2=706, so a single line starting at
    # hx+6=376 runs under the panel and loses its last three words. The
    # space ABOVE the handlers (y 56..hy) is free at this x because the try
    # frame ends at hx, so the fix is vertical room, not a shorter sentence.
    b.append(txt(hx + 6, hy - 26, "handlers hang off the boundary they",
                 size=10.5, fill=BAD, weight=700))
    b.append(txt(hx + 6, hy - 11, "protect — touching, never wired",
                 size=10.5, fill=BAD, weight=700))

    # else + finally have nowhere on the boundary
    fy = y + bh + 42
    b.append(rect(x, fy, 632, 40, stroke="#3a3040", sw=1.4, rx=6, dash="5 4"))
    b.append(code(x + 18, fy + 25, "else:", size=12, fill=DIM))
    b.append(txt(x + 110, fy + 25, "not an event — no boundary to hang off. Floats.",
                 size=11, fill=BAD, weight=600))
    b.append(footer_band(x, fy + 52, 632, "finally:", note="always"))
    # Two lines for the same reason as the callout above: the right column's
    # panel starts at x2=706 and this caption is ~665px wide from x+18=58.
    b.append(txt(x + 18, fy + 108, "`finally` lands correctly by accident: it is not an",
                 size=11, fill=DIM))
    b.append(txt(x + 18, fy + 124, "event either, so it becomes a band — which is what it "
                                   "should be.", size=11, fill=DIM))

    # right column: the verdict
    x2 = 706
    b.append(txt(x2, 30, "WHAT IT BUYS", size=11, fill=OK, weight=700,
                 style='letter-spacing="0.09em"'))
    b.append(rect(x2, y, W - x2 - 40, 118, stroke="#2b3a2e", sw=1.4, rx=7, fill="#0f1712"))
    for i, s in enumerate(["The abort has a place.", "The escape point is on",
                           "the wall, at the height", "it happened. No other",
                           "proposal here can draw", "“and then it stopped.”"]):
        b.append(txt(x2 + 14, y + 26 + i * 16, s, size=11, fill=DIM, weight=500))
    b.append(txt(x2, y + 146, "WHAT IT COSTS", size=11, fill=BAD, weight=700,
                 style='letter-spacing="0.09em"'))
    b.append(rect(x2, y + 158, W - x2 - 40, 178, stroke="#3a2226", sw=1.4, rx=7, fill="#170f11"))
    for i, s in enumerate(["Source order is gone —", "handlers are spatial, so", "the ladder's ORDER", "(first match wins) has", "no drawing at all.", "",
                           "And arms on a vertical", "wall is new layout math;", "blockRegion.layout.ts", "stacks rows, full stop."]):
        b.append(txt(x2 + 14, y + 182 + i * 15, s, size=10.5, fill=DIM, weight=500))
    return svg(W, fy + 140, "".join(b),
               "Proposal 2, boundary handlers: the protected body is a container and handlers mount on its wall.")


def fig_p3():
    """SUBJECT — the try suite produces an OUTCOME; the handler ladder is a
    `match` on it. The only proposal written entirely in the grammar that
    was settled this afternoon."""
    b = []
    x, y, w = 40, 56, 470
    b.append(txt(x, 30, "THE DRAWING", size=11, fill=DIM, weight=700,
                 style='letter-spacing="0.09em"'))
    arms = [(p_, c_, tabw(f"case {p_}:"), g_) for p_, c_, g_ in [
        ("FileNotFoundError", "e", False), ("(ValueError, KeyError)", "e", False),
        ("completed", None, False), ("left early", None, True)]]
    body_h, subhead_h = 96, 36
    total = 34 + body_h + subhead_h + len(arms) * 52
    b.append(rect(x, y, w, total, stroke=FRAME, sw=1.8, rx=8))
    b.append(head(x, y, w, "try"))
    # the protected suite
    b.append(protected(x + 8, y + 42, w - 16, body_h - 16, label="protected"))
    b.append(code(x + 26, y + 68, "cfg = load(path)", size=12, fill=CODE))
    b.append(code(x + 26, y + 88, "validate(cfg)", size=12, fill=CODE))
    # the subject strip
    sy = y + 34 + body_h
    b.append(f'<rect x="{x}" y="{sy}" width="{w}" height="{subhead_h}" fill="{NEW}"'
             f' opacity="0.10"/>')
    b.append(line(x, sy, x + w, sy, stroke=NEW, sw=1.6))
    b.append(line(x, sy + subhead_h, x + w, sy + subhead_h, stroke=NEW, sw=1.6))
    b.append(dot(x, sy + subhead_h / 2, supplied=True, stroke=NEW))
    b.append(code(x + 17, sy + subhead_h / 2 + 4.5, "⟨outcome⟩", size=12, fill=NEW))
    b.append(txt(x + w - 14, sy + subhead_h / 2 + 4.5, "one subject, matched in order",
                 size=10.5, fill=NEW, anchor="end", weight=700))
    cy = sy + subhead_h
    for i, (pat, cap, tw, ghost) in enumerate(arms):
        if i:
            b.append(line(x, cy, x + w, cy, stroke=RULE, sw=1.3))
        if ghost:
            b.append(f'<path d="M {x} {cy + ARM_HEADER_PX} L {x + tw} {cy + ARM_HEADER_PX}'
                     f' L {x + tw} {cy}" fill="none" stroke="{DIM}" stroke-width="1.4"'
                     f' stroke-dasharray="4 4" opacity="0.6"/>')
            b.append(txt(x + 20, cy + ARM_HEADER_PX / 2 + 5, f"case {pat}:", size=12.5,
                         fill="#5c6370", font=MONO, weight=500))
            b.append(txt(x + tw + 14, cy + ARM_HEADER_PX / 2 + 4.5,
                         "exists in the semantics; cannot be authored", size=10.5,
                         fill="#5c6370", weight=600))
        else:
            b.append(tab(x, cy, tw, f"case {pat}:"))
            if cap:
                b.append(capdot(x + tw, cy + ARM_HEADER_PX / 2, cap))
        cy += 52
    b.append(footer_band(x, cy - 4, w, "finally:", note="unsolved here"))

    # right column
    x2 = 542
    b.append(txt(x2, 30, "WHY THIS IS THE GRAMMAR-NATIVE ONE", size=11, fill=OK, weight=700,
                 style='letter-spacing="0.09em"'))
    notes = [
        (OK, "The subject exists.", [
            "`except ValueError:` is EVALUATED — `ast.ExceptHandler.type`",
            "is an ordinary expr node (§2). Under the settled rule an",
            "evaluated thing owes a dot. This is the dot, and it is the",
            "only proposal that pays it."]),
        (OK, "`else` stops being special.", [
            "It is the `completed` pattern — one of the three shapes the",
            "outcome takes. No new row type, no extra rule."]),
        (NEW, "The dot is never wired.", [
            "The suite above supplies it structurally, the way a region",
            "already sees what was defined before it. Same argument the",
            "branching report used for the selector: “it is read by the",
            "structure itself.” So there is no cable, real or apparent."]),
        (BAD, "It needs one new port state.", [
            "An always-hollow dot reads as a missing input. `received`",
            "already exists in `PortState` (port.tsx:60) and is the",
            "closest honest fit — but this is a real decision, not free."]),
        (BAD, "`finally` is still homeless.", [
            "Nothing about a subject makes a row unconditional. P4 is",
            "what fixes that, and the two compose."]),
    ]
    cy2 = y
    for col, title, lines in notes:
        hh = 24 + len(lines) * 15
        b.append(f'<rect x="{x2}" y="{cy2}" width="{W - x2 - 40}" height="{hh}" rx="6"'
                 f' fill="{col}" opacity="0.07"/>')
        b.append(line(x2, cy2, x2, cy2 + hh, stroke=col, sw=2.4))
        b.append(txt(x2 + 14, cy2 + 17, title, size=12, fill=INK, weight=700))
        for i, ln in enumerate(lines):
            b.append(txt(x2 + 14, cy2 + 34 + i * 15, ln, size=10.5, fill=DIM, weight=500))
        cy2 += hh + 9
    return svg(W, max(cy + 56, cy2 + 16), "".join(b),
               "Proposal 3: the try suite produces an outcome; the handlers are a match on it.")


def fig_p4():
    """NEST — `finally` is the OUTER frame's footer. Geometrically outside
    the arm stack, so no selector can reach it. Mirrors the language's own
    definition of the combined form."""
    b = []
    x, y, w = 40, 62, 496
    b.append(txt(x, 34, "THE DRAWING", size=11, fill=DIM, weight=700,
                 style='letter-spacing="0.09em"'))
    inner_rows = [("try:", 74, "always"), ("except FileNotFoundError as e:", 50, "tab"),
                  ("except (ValueError, KeyError) as e:", 50, "tab"), ("else:", 50, "tab")]
    inner_w = max(tabw(r[0]) for r in inner_rows) + 34
    inner_h = 34 + sum(r[1] for r in inner_rows)
    outer_h = 34 + 14 + inner_h + 14 + ARM_HEADER_PX

    b.append(rect(x, y, w, outer_h, stroke=ALWAYS, sw=2.0, rx=8))
    b.append(head(x, y, w, "try … finally", stroke=ALWAYS, sub="the cleanup frame"))
    ix, iy, iw = x + 14, y + 34 + 14, w - 28
    b.append(rect(ix, iy, iw, inner_h, stroke=FRAME, sw=1.7, rx=7))
    b.append(head(ix, iy, iw, "try … except", sub="the selection frame"))
    cy = iy + 34
    for i, (label, rh, kind) in enumerate(inner_rows):
        if kind == "always":
            b.append(always_strip(ix, cy, iw, label, note=None))
            b.append(protected(ix + 8, cy + ARM_HEADER_PX + 4, iw - 16, rh - ARM_HEADER_PX - 10,
                               label="protected"))
            b.append(code(ix + 26, cy + ARM_HEADER_PX + 24, "cfg = load(path)", size=11,
                          fill=CODE))
            b.append(code(ix + 26, cy + ARM_HEADER_PX + 39, "validate(cfg)", size=11,
                          fill=CODE))
        else:
            b.append(line(ix, cy, ix + iw, cy, stroke=RULE, sw=1.3))
            tw = tabw(label)
            b.append(tab(ix, cy, tw, label))
            if "as e" in label:
                b.append(out_dot(ix + tw, cy + ARM_HEADER_PX / 2))
        cy += rh
    fy = y + outer_h - ARM_HEADER_PX
    b.append(footer_band(x, fy, w, "finally:", note="a FOOTER, not an arm"))
    b.append(callout(x, y + outer_h + 22, "▲ on the frame's bottom edge — there is no "
                                          "selector at this level to reach it", fill=ALWAYS))

    # right: the language's own definition
    x2 = 542
    b.append(txt(x2, 34, "THIS IS PYTHON'S OWN SHAPE", size=11, fill=OK, weight=700,
                 style='letter-spacing="0.09em"'))
    b.append(rect(x2, y, W - x2 - 40, 122, stroke="#2b3a2e", sw=1.4, rx=7, fill="#0f1712"))
    b.append(txt(x2 + 14, y + 24, "The reference defines the combined form as a", size=11,
                 fill=DIM, weight=500))
    b.append(txt(x2 + 14, y + 40, "nesting, in one sentence:", size=11, fill=DIM, weight=500))
    for i, ln in enumerate(["“The try clause is executed, including any",
                            "except and else clauses. … The finally",
                            "clause is executed.”"]):
        b.append(txt(x2 + 14, y + 62 + i * 16, ln, size=11, fill=OK, weight=600))
    b.append(txt(x2 + 14, y + 112, "reference/compound_stmts.html § the try statement",
                 size=9.5, fill="#5c6370", weight=500))
    b.append(txt(x2, y + 148, "The outer frame is that sentence's first half; the footer is its "
                              "second.", size=11.5, fill=DIM))
    b.append(txt(x2, y + 166, "Two frames is the cost. The benefit is that no future skin, "
                              "props", size=11.5, fill=DIM))
    b.append(txt(x2, y + 184, "change or author mistake can make `finally` look chosen — it "
                              "is not", size=11.5, fill=DIM))
    b.append(txt(x2, y + 202, "in the arm stack to begin with. A label can be edited; a "
                              "geometry", size=11.5, fill=DIM))
    b.append(txt(x2, y + 220, "cannot.", size=11.5, fill=DIM))
    b.append(txt(x2, y + 254, "AND THE SLOT ALREADY EXISTS", size=11, fill=NEW, weight=700,
                 style='letter-spacing="0.09em"'))
    b.append(txt(x2, y + 276, "`Block` takes an optional `footer` (block.tsx:145) — the", size=11,
                 fill=DIM))
    b.append(txt(x2, y + 294, "same prop the opaque region view uses for its hidden-", size=11,
                 fill=DIM))
    b.append(txt(x2, y + 312, "count line. This spends a stock part rather than", size=11,
                 fill=DIM))
    b.append(txt(x2, y + 330, "adding a row kind.", size=11, fill=DIM))
    return svg(W, max(y + outer_h + 46, y + 350), "".join(b),
               "Proposal 4: finally is the outer frame's footer, wrapping an inner selection frame.")


def fig_p5():
    """RAIL — LabVIEW's actual answer. An error-typed lane threads every
    statement; protection is per-statement, not per-region."""
    b = []
    b.append(txt(40, 30, "THE DRAWING  —  LabVIEW's error wire, ported literally",
                 size=11, fill=DIM, weight=700, style='letter-spacing="0.09em"'))
    y, bw, bh, gap = 72, 190, 96, 26
    stmts = [("load(path)", False), ("validate(cfg)", True), ("cache[path]=cfg", True)]
    x = 40
    for i, (name, skipped) in enumerate(stmts):
        st = "#4a515e" if skipped else FRAME
        b.append(rect(x, y, bw, bh, stroke=st, sw=1.6, rx=7))
        b.append(line(x, y + 26, x + bw, y + 26, stroke=st, sw=1.4))
        b.append(txt(x + bw / 2, y + 18, name, size=12, fill=INK if not skipped else "#5c6370",
                     anchor="middle", font=MONO, weight=600))
        b.append(dot(x, y + 62, supplied=(i > 0), stroke=BAD if i > 0 else FRAME))
        b.append(code(x + 15, y + 66.5, "err in", size=10.5, fill=DIM))
        b.append(dot(x + bw, y + 62, supplied=True, stroke=BAD))
        b.append(code(x + bw - 15, y + 66.5, "err out", size=10.5, fill=DIM, anchor="end"))
        if skipped:
            b.append(txt(x + bw / 2, y + 88, "no-ops — error passed through", size=9.5,
                         fill=BAD, anchor="middle", weight=600))
        if i:
            b.append(wire([(x - gap, y + 62), (x, y + 62)], stroke=BAD, sw=2.0))
        x += bw + gap
    b.append(txt(40 + bw / 2, y + bh + 22, "raises", size=10.5, fill=BAD, anchor="middle",
                 weight=700))

    # the handler: LabVIEW's two-case error structure
    hx, hw = x, 292
    b.append(wire([(hx - gap, y + 62), (hx, y + 62)], stroke=BAD, sw=2.0))
    b.append(rect(hx, y - 12, hw, bh + 24, stroke=BAD, sw=2.2, rx=8))
    b.append(rect(hx + 5, y - 7, hw - 10, bh + 14, stroke=OK, sw=1.6, rx=6))
    b.append(dot(hx, y + 62, supplied=True, stroke=BAD))
    b.append(txt(hx + hw / 2, y + 10, "◀  Error  ▶", size=11.5, fill=BAD,
                 anchor="middle", weight=700))
    b.append(txt(hx + hw / 2, y + 44, "the selector terminal accepts an", size=10.5, fill=DIM,
                 anchor="middle"))
    b.append(txt(hx + hw / 2, y + 60, "Error Cluster as one of its five types", size=10.5,
                 fill=DIM, anchor="middle"))
    b.append(txt(hx + hw / 2, y + 82, "red border = error case · green = no error", size=10,
                 fill=OK, anchor="middle", weight=600))

    yy = y + bh + 54
    b.append(txt(40, yy, "This is not an approximation of LabVIEW — it is LabVIEW. NI's own "
                         "words for the abort:", size=12, fill=INK, weight=600))
    b.append(rect(40, yy + 14, 600, 46, stroke="#2a3340", sw=1.3, rx=6, fill="#0b0f14"))
    b.append(txt(54, yy + 34, "“If LabVIEW detects an error, the node passes the error to the "
                              "next node", size=11.5, fill=CODE, font=MONO))
    b.append(txt(54, yy + 50, " without executing that part of the code.”", size=11.5,
                 fill=CODE, font=MONO))
    b.append(txt(654, yy + 34, "lumen.ni.com/pdf/labview101/us/", size=10, fill="#5c6370"))
    b.append(txt(654, yy + 50, "debugging_explanation.pdf", size=10, fill="#5c6370"))

    yy2 = yy + 78
    b.append(txt(40, yy2, "AND WHY IT IS AN ANTI-REFERENCE HERE", size=11, fill=BAD, weight=700,
                 style='letter-spacing="0.09em"'))
    for i, ln in enumerate([
        "•  It draws PROPAGATION, and Python has none. In Python the remaining statements are not executed-as-no-ops; they",
        "    simply never run. The rail spends a port on every block to animate a mechanism the language does not have.",
        "•  It cannot round-trip. There is no `try:` in this picture — nothing says where the protected region begins or ends,",
        "    so a reader (and pyblocks' backward pass) cannot recover the source.",
        "•  The rail IS a cable, and it carries control. Whatever it is called, a wire whose presence decides whether the next",
        "    block runs is the execution wire CLAUDE.md forbids — with the forbidding made harder because it looks like data.",
        "•  It taxes every block on the canvas, forever, for a construct that appears in a small fraction of them.",
    ]):
        b.append(txt(40, yy2 + 22 + i * 17, ln, size=11, fill=DIM, weight=500))
    return svg(W, yy2 + 22 + 7 * 17 + 14, "".join(b),
               "Proposal 5: LabVIEW's error rail threaded through every statement, ending in a two-case error structure.")


def fig_rec():
    """The recommendation: P4's geometry carrying P3's subject."""
    b = []
    x, y, w = 40, 74, 500
    b.append(txt(x, 34, "P4 × P3  —  the footer frame carrying the outcome dot", size=13,
                 fill=INK, weight=700))
    b.append(txt(x, 54, "Two frames. Everything in the inner one is chosen; nothing in the outer "
                        "one is.", size=11.5, fill=DIM))
    arms = [(p_, c_, tabw(f"case {p_}:")) for p_, c_ in [
        ("FileNotFoundError", "e"), ("(ValueError, KeyError)", "e"), ("completed", None)]]
    body_h, subhead_h = 88, 34
    inner_h = 30 + body_h + subhead_h + len(arms) * 48
    outer_h = 38 + 14 + inner_h + 14 + ARM_HEADER_PX

    b.append(rect(x, y, w, outer_h, stroke=ALWAYS, sw=2.2, rx=9))
    b.append(head(x, y, w, "try … finally", h=38, stroke=ALWAYS))
    ix, iy, iw = x + 14, y + 38 + 14, w - 28
    b.append(rect(ix, iy, iw, inner_h, stroke=FRAME, sw=1.7, rx=7))
    b.append(head(ix, iy, iw, "try … except", h=30))
    b.append(protected(ix + 8, iy + 38, iw - 16, body_h - 14, label="protected"))
    b.append(code(ix + 24, iy + 62, "cfg = load(path)", size=11.5, fill=CODE))
    b.append(code(ix + 24, iy + 81, "validate(cfg)", size=11.5, fill=CODE))
    sy = iy + 30 + body_h
    b.append(f'<rect x="{ix}" y="{sy}" width="{iw}" height="{subhead_h}" fill="{NEW}"'
             f' opacity="0.10"/>')
    b.append(line(ix, sy, ix + iw, sy, stroke=NEW, sw=1.5))
    b.append(line(ix, sy + subhead_h, ix + iw, sy + subhead_h, stroke=NEW, sw=1.5))
    b.append(dot(ix, sy + subhead_h / 2, supplied=True, stroke=NEW))
    b.append(code(ix + 17, sy + subhead_h / 2 + 4.5, "⟨outcome⟩", size=11.5, fill=NEW))
    b.append(txt(ix + iw - 12, sy + subhead_h / 2 + 4.5, "state = received", size=10, fill=NEW,
                 anchor="end", weight=700))
    cy = sy + subhead_h
    for i, (pat, cap, tw) in enumerate(arms):
        if i:
            b.append(line(ix, cy, ix + iw, cy, stroke=RULE, sw=1.3))
        b.append(tab(ix, cy, tw, f"case {pat}:"))
        if cap:
            b.append(capdot(ix + tw, cy + ARM_HEADER_PX / 2, cap))
        cy += 48
    b.append(footer_band(x, y + outer_h - ARM_HEADER_PX, w, "finally:", note="a footer, not an arm"))

    # annotations
    x2 = 570
    anns = [
        (ALWAYS, "finally cannot look chosen", [
            "It is on the outer frame's bottom edge, outside the arm",
            "stack entirely. Not a label that says “always” — a place",
            "no selector reaches. `Block` already takes one (block.tsx:145)."]),
        (NEW, "the handlers have a subject", [
            "`except ValueError` is an evaluated expression (§2), so",
            "under the settled rule it owes a dot. This is it. It is",
            "NEVER wired: the suite above supplies it structurally,",
            "exactly as the branch report argued for the selector."]),
        (PROT, "the protected extent is drawn", [
            "The dashed box hugs the try suite ALONE. That is the",
            "fact §1 measured — a raise in `else` escapes — and it is",
            "the one thing a single flat frame can never say."]),
        (OK, "`else` needs no special case", [
            "It is the `completed` pattern. Three shapes of one",
            "outcome; `left early` is the fourth and has no arm,",
            "which the drawing shows by not offering one."]),
        (BAD, "what it still costs", [
            "Two frames of chrome for one statement. One new port",
            "state decision (`received` on a never-wired dot). And",
            "`except*` needs a marked variant — see the next figure."]),
    ]
    cy2 = y
    for col, title, lines in anns:
        hh = 23 + len(lines) * 15
        b.append(f'<rect x="{x2}" y="{cy2}" width="{W - x2 - 40}" height="{hh}" rx="6"'
                 f' fill="{col}" opacity="0.08"/>')
        b.append(line(x2, cy2, x2, cy2 + hh, stroke=col, sw=2.6))
        b.append(txt(x2 + 14, cy2 + 16, title, size=11.5, fill=INK, weight=700))
        for i, ln in enumerate(lines):
            b.append(txt(x2 + 14, cy2 + 32 + i * 15, ln, size=10.5, fill=DIM, weight=500))
        cy2 += hh + 8
    return svg(W, max(y + outer_h + 26, cy2 + 14), "".join(b),
               "The recommendation: proposal 4's nested footer frame carrying proposal 3's outcome dot.")


def fig_group_variant():
    """What the recommendation does about `except*`, drawn rather than
    promised. One marker, and it changes the firing rule from ladder to
    sieve."""
    b = []
    b.append(txt(40, 28, "except  —  the ladder", size=11.5, fill=INK, weight=700,
                 style='letter-spacing="0.08em"'))
    b.append(txt(530, 28, "except*  —  the sieve", size=11.5, fill=GROUP, weight=700,
                 style='letter-spacing="0.08em"'))
    for k, (x, col, subj, note, rule) in enumerate([
            (40, NEW, "⟨outcome⟩", "one arm runs", "matched in order · first wins"),
            (530, GROUP, "⟨outcome group⟩", "every arm may run",
             "split in order · each takes its subgroup")]):
        w = 430
        y = 48
        arms = [("FileNotFoundError", "e"), ("(ValueError, KeyError)", "e")]
        h = 30 + 34 + len(arms) * 46
        b.append(rect(x, y, w, h, stroke=col, sw=1.8, rx=7))
        b.append(head(x, y, w, "try … except*" if k else "try … except", h=30, stroke=col))
        sy = y + 30
        b.append(f'<rect x="{x}" y="{sy}" width="{w}" height="34" fill="{col}" opacity="0.11"/>')
        b.append(line(x, sy, x + w, sy, stroke=col, sw=1.5))
        b.append(line(x, sy + 34, x + w, sy + 34, stroke=col, sw=1.5))
        b.append(dot(x, sy + 17, supplied=True, stroke=col))
        b.append(code(x + 17, sy + 21.5, subj, size=11.5, fill=col))
        b.append(txt(x + w - 12, sy + 21.5, rule, size=10, fill=col, anchor="end", weight=700))
        cy = sy + 34
        for i, (pat, cap) in enumerate(arms):
            if i:
                b.append(line(x, cy, x + w, cy, stroke=RULE, sw=1.3))
            tw = tabw(f"case {pat}:")
            b.append(tab(x, cy, tw, f"case {pat}:", stroke=col,
                         fill_bg=col if k else (col if i == 0 else None)))
            b.append(capdot(x + tw, cy + ARM_HEADER_PX / 2, cap, fill=col))
            b.append(txt(x + w - 12, cy + 21, "FIRES" if (k or i == 0) else "skipped",
                         size=10, fill=col if (k or i == 0) else "#4a515e", anchor="end",
                         weight=800))
            cy += 46
        b.append(txt(x, cy + 22, note, size=11.5, fill=col, weight=700))
        if k:
            b.append(txt(x, cy + 42, "`as e` binds the SUBGROUP, an ExceptionGroup — not one",
                         size=10.5, fill=DIM))
            b.append(txt(x, cy + 58, "exception. And `case _:` is illegal: `except*:` is a",
                         size=10.5, fill=DIM))
            b.append(txt(x, cy + 74, "SyntaxError, so the catch-all arm cannot be drawn at all.",
                         size=10.5, fill=DIM))
        else:
            b.append(txt(x, cy + 42, "`as e` binds one exception. A bare `except:` is legal,",
                         size=10.5, fill=DIM))
            b.append(txt(x, cy + 58, "so the catch-all arm exists — and, like `else` in a",
                         size=10.5, fill=DIM))
            b.append(txt(x, cy + 74, "branch, it is the one arm with no pattern.", size=10.5,
                         fill=DIM))
    b.append(txt(40, 340, "The two cannot be mixed — `cannot have both 'except' and "
                          "'except*' on the same 'try'` (CPython, §2). So this is a property of "
                          "the WHOLE region,", size=11.5, fill=DIM))
    b.append(txt(40, 358, "not of an arm: one marker on the frame, and the arm rows keep their "
                          "shape. That is the cheapest honest answer, and it is the only one "
                          "available.", size=11.5, fill=DIM))
    return svg(W, 378, "".join(b),
               "The same geometry under except and except*, with the firing rule marked on the frame.")


def fig_priorart():
    """Seven notations against the five things the drawing has to do.

    The `finally` column is the finding: nobody has drawn it. Not the two
    Zach asked about, and not the five that turned out to be better
    references than either.
    """
    b = []
    b.append(txt(24, 24, "Every notation checked, against the five things this drawing has to do",
                 size=13, fill=INK, weight=700))
    b.append(txt(24, 44, "Each cell is sourced in §4. “Draws the abort” = does the "
                         "notation show that the protected body stopped part-way?", size=11.5,
                 fill=DIM))
    cols = ["protected body\nis a CONTAINER", "handler dispatch\nis ORDERED",
            "the error is\nBOUND to a name", "a true\nFINALLY", "draws the\nABORT"]
    rows = [
        ("BPMN 2.0  · error boundary event", [1, 1, 1, 0, 0],
         "the closest thing to a solution; error events are ALWAYS interrupting"),
        ("BPMN 2.0  · event sub-process", [1, 1, 1, 0, 0],
         "“inside the scope instead of attached to” it — the precedent for a handler ROW"),
        ("AWS Step Functions  · Catch", [0, 1, 1, 0, 0],
         "catchers “scanned in order”, States.ALL must be last — Python's ladder exactly"),
        ("Node-RED  · catch node", [0, 0, 1, 0, 0],
         "detached: a scope ARRAY of node ids, never a wire; overlapping catches all fire"),
        ("Snap!  · safely try", [1, 0, 1, 0, -1],
         "one block, two stacked C-slots, error bound to an upvar — the nearest shape to ours"),
        ("LabVIEW  · error cluster + case structure", [0, -1, -1, -1, 0],
         "no container at all; the error is a value on a wire and every node relays it"),
        ("Unreal Blueprints  · (nothing)", [0, 0, 0, 0, 0],
         "no exceptions, ever. Failure is an extra white exec pin the author routes by hand"),
        ("Simulink / Stateflow  · (nothing)", [0, 0, 0, 0, 0],
         "does not attempt it — pushed into textual MATLAB or one Assertion checkbox"),
    ]
    x, y = 24, 72
    label_w, cw, rh, hh = 268, 122, 30, 44
    for j, c in enumerate(cols):
        for k, ln in enumerate(c.split("\n")):
            b.append(txt(x + label_w + j * cw + cw / 2, y + 14 + k * 13, ln, size=10,
                         fill=DIM, anchor="middle", weight=700))
    b.append(line(x, y + hh, x + label_w + len(cols) * cw, y + hh, stroke=RULE, sw=1.3))
    for i, (lab, cells, note) in enumerate(rows):
        yy = y + hh + i * rh
        b.append(txt(x + 2, yy + rh / 2 + 4.5, lab, size=11, fill=INK, weight=600))
        for j, v in enumerate(cells):
            cx = x + label_w + j * cw + cw / 2
            if v == 1:
                b.append(txt(cx, yy + rh / 2 + 5, "✓", size=15, fill=OK, anchor="middle",
                             weight=800))
            elif v == -1:
                b.append(txt(cx, yy + rh / 2 + 4.5, "n/a", size=10, fill="#5c6370",
                             anchor="middle", weight=600))
            else:
                b.append(txt(cx, yy + rh / 2 + 4.5, "✕", size=13, fill="#4a515e",
                             anchor="middle", weight=700))
        b.append(line(x, yy + rh, x + label_w + len(cols) * cw, yy + rh, stroke="#1e222a", sw=1))
    tot = y + hh + len(rows) * rh
    # the finding
    fx = x + label_w + 3 * cw          # the FINALLY column's left edge
    b.append(rect(fx + 5, y + 4, cw - 10, tot - y - 4, stroke=BAD, sw=1.8, rx=6,
                  dash="5 4"))
    b.append(txt(x, tot + 30, "One column is empty all the way down.", size=13.5, fill=BAD,
                 weight=700))
    for i, ln in enumerate([
        "Nothing in this survey draws a suite that runs on EVERY path. BPMN's nearest construct is compensation, and the spec",
        "rules it out explicitly: it is undo semantics, and “compensation of a failed Activity results in a null operation”.",
        "Node-RED's `complete` node looks like one and is not — Complete and Catch are mutually exclusive outcomes.",
        "",
        "So `finally` is not a thing to copy. It is the part that has to be invented, which is why proposal 4 spends GEOMETRY on it",
        "rather than a word: there is no established notation to fall back on if the word turns out not to hold.",
    ]):
        b.append(txt(x, tot + 54 + i * 17, ln, size=11.5, fill=DIM if i else DIM, weight=500))
    return svg(W, tot + 54 + 6 * 17 + 10, "".join(b),
               "Eight notations against five criteria; the finally column is empty for all of them.")


def fig_scores():
    """Criteria first, weighted, then the options against them."""
    crit = [
        ("Truthful under the settled grammar", 3,
         "does a dot appear where a value is consumed, and nowhere else?"),
        ("Draws the two discriminators", 3, "`finally` unconditional · `except*` a sieve"),
        ("Round-trips to real Python", 2, "source order and lexical extent survive pyblocks both ways"),
        ("Spends stock parts", 2, "Block · BlockPort · BlockMembers · Badge · blockRegion.layout.ts"),
        ("No execution cable, in fact AND in look", 2, "CLAUDE.md, and the look is the harder half"),
        ("Legible with no legend", 1, "can a reader tell what fires, from the drawing alone?"),
    ]
    opts = ["1 bands", "2 boundary", "3 subject", "4 footer/nest", "5 rail"]
    # Scored per criterion, not per vibe. P1 gets a 2 on the discriminators
    # because it reads `except*` right and `finally` wrong; P2 and P4 score
    # on truthfulness only for what they THEMSELVES carry -- neither has a
    # subject, so neither gets P3's point for one.
    scores = [
        [1, 2, 4, 3, 1],
        [2, 2, 2, 4, 0],
        [4, 1, 4, 4, 0],
        [4, 1, 3, 4, 1],
        [4, 3, 3, 4, 0],
        [2, 4, 4, 2, 1],
    ]
    b = []
    b.append(txt(24, 24, "Criteria first — weighted for this repo, this week", size=13,
                 fill=INK, weight=700))
    x, y = 24, 48
    label_w, cw, rh, hh = 340, 118, 34, 34
    for j, o in enumerate(opts):
        b.append(txt(x + label_w + j * cw + cw / 2, y + 22, o, size=11, fill=DIM,
                     anchor="middle", weight=700))
    b.append(line(x, y + hh, x + label_w + len(opts) * cw, y + hh, stroke=RULE, sw=1.3))
    totals = [0] * len(opts)
    for i, (name, wt, sub) in enumerate(crit):
        yy = y + hh + i * rh
        b.append(txt(x + 2, yy + 15, name, size=11.5, fill=INK, weight=600))
        b.append(txt(x + 2, yy + 29, sub, size=9.5, fill="#5c6370", weight=500))
        b.append(txt(x + label_w - 14, yy + 21, f"×{wt}", size=11, fill=NEW, anchor="end",
                     weight=800))
        for j in range(len(opts)):
            s = scores[i][j]
            totals[j] += s * wt
            cx = x + label_w + j * cw + cw / 2
            col = OK if s >= 4 else (NEW if s == 3 else (DIM if s == 2 else BAD))
            b.append(f'<rect x="{cx - 34}" y="{yy + 7}" width="{68}" height="{16}" rx="8"'
                     f' fill="{col}" opacity="0.16"/>')
            b.append(f'<rect x="{cx - 34}" y="{yy + 7}" width="{68 * s / 4}" height="{16}"'
                     f' rx="8" fill="{col}" opacity="0.62"/>')
            b.append(txt(cx, yy + 19.5, str(s), size=10, fill=INK, anchor="middle", weight=800))
        b.append(line(x, yy + rh, x + label_w + len(opts) * cw, yy + rh, stroke="#1e222a", sw=1))
    yy = y + hh + len(crit) * rh
    b.append(txt(x + 2, yy + 26, "WEIGHTED TOTAL   (max 52)", size=11.5, fill=INK, weight=800))
    best = max(totals)
    for j, t in enumerate(totals):
        cx = x + label_w + j * cw + cw / 2
        col = OK if t == best else DIM
        b.append(f'<rect x="{cx - 38}" y="{yy + 8}" width="76" height="26" rx="6" fill="{col}"'
                 f' opacity="{0.24 if t == best else 0.1}"/>')
        b.append(txt(cx, yy + 26, str(t), size=15, fill=col if t == best else DIM,
                     anchor="middle", weight=800))
    b.append(txt(x, yy + 62, "0 = the drawing says the opposite of the truth · 2 = silent on it "
                             "· 4 = the drawing carries it structurally", size=11, fill="#5c6370"))
    b.append(txt(x, yy + 86, "P4 and P3 finish 47 and 42, and that closeness is the point: they "
                             "answer different questions — what is the subject, and what",
                 size=11.5, fill=DIM))
    b.append(txt(x, yy + 104, "makes a row unconditional — and compose without touching each "
                              "other. The recommendation is their composition; each is scored "
                              "here alone.", size=11.5, fill=DIM))
    return svg(W, yy + 122, "".join(b),
               "Six weighted criteria scored against the five proposals; P4 leads, P3 close behind.")


# ══════════════════════════════════════════════════════════════════════
#  The page
# ══════════════════════════════════════════════════════════════════════

FACTS = sh("python3 docs/try_except_facts.py", TREE)

PROPOSALS = [
    ("P1", "Bands",
     "The statement is one region whose rows are BANDS in source order; the row's own shape "
     "says whether anything selects it.",
     fig_p1),
    ("P2", "Boundary handlers",
     "The protected body is the node. Handlers mount on its wall at the point the exception "
     "leaves it — BPMN's answer, and the only one that can draw the abort.",
     fig_p2),
    ("P3", "The outcome is a subject",
     "The try suite PRODUCES a value — its outcome — and the handler ladder is a `match` on "
     "it. Written entirely in this afternoon's grammar.",
     fig_p3),
    ("P4", "Finally is a footer",
     "Two frames: an outer cleanup frame whose FOOTER is `finally`, wrapping an inner "
     "selection frame. Geometry, not a label, makes `finally` unconditional.",
     fig_p4),
    ("P5", "The error rail",
     "LabVIEW, ported literally: an error-typed lane threads every statement and protection "
     "is per-statement. Drawn so the rejection is earned.",
     fig_p5),
]


def esc_html(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def section(n: str, title: str) -> str:
    return f'<h2>{n} &nbsp;{title}</h2>'


def build() -> str:
    P: list[str] = []
    A = P.append

    A(f"""<!doctype html><meta charset="utf-8">
<title>try / except — five proposals — bbox-ui</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>{CSS}
  figure {{ margin:22px 0; }}
  figure figcaption {{ color:var(--dim2); font-size:12px; margin-top:8px; line-height:1.5 }}
  .prop {{ border:1px solid var(--line); border-radius:12px; padding:22px 24px; margin:26px 0;
           background:var(--panel) }}
  .prop > h3 {{ margin:0 0 6px; font-size:21px; letter-spacing:-.015em }}
  .prop > h3 .tag {{ font:800 12px/1 var(--mono); background:var(--accent); color:#0c0d10;
           border-radius:5px; padding:5px 7px; margin-right:9px; vertical-align:2px }}
  .prop .claim {{ color:var(--dim); font-size:15px; margin:0 0 4px; line-height:1.55 }}
  .cols {{ display:grid; grid-template-columns:1fr 1fr; gap:14px; margin:16px 0 0 }}
  .cols > div {{ background:var(--panel2); border:1px solid var(--line); border-radius:9px;
           padding:13px 15px }}
  .cols h5 {{ margin:0 0 7px; font-size:10.5px; text-transform:uppercase; letter-spacing:.1em;
           color:var(--dim2) }}
  .cols ul {{ margin:0; padding-left:17px; font-size:13px; color:var(--dim); line-height:1.6 }}
  .cols.three {{ grid-template-columns:1fr 1fr 1fr }}
  .disc {{ display:grid; grid-template-columns:1fr 1fr; gap:14px; margin:14px 0 0 }}
  .disc > div {{ border:1px solid var(--line2); border-radius:9px; padding:12px 15px;
           font-size:13px; color:var(--dim); line-height:1.6 }}
  .disc b {{ color:var(--fg); display:block; margin-bottom:4px; font-size:12px;
           text-transform:uppercase; letter-spacing:.08em }}
  .disc .g {{ border-color:#2b3a2e; background:#0f1712 }}
  .disc .r {{ border-color:#3a2226; background:#170f11 }}
  .src {{ font-size:11.5px; color:var(--dim2); margin:6px 0 0 }}
  .src a {{ color:#6f8db5 }}
</style>
<div class="wrap">""")

    # ── header ────────────────────────────────────────────────────────
    A(f"""<p class="kicker">bbox-ui · proposal set · 2026-09-22</p>
<h1>try / except / else / finally — five ways to draw it</h1>
<p class="sub">Your instinct is half right, and the half that is wrong is the useful half.
<b>Sequence is the correct top-level shape</b> — rows in source order, no tree. But
<b>&ldquo;conditionally fire&rdquo; is wrong about four of the five rows</b>: two of them
(<code>try</code>, <code>finally</code>) have no condition at all, and the middle three are not
independent conditions but one ordered selection over one subject. And there is a third thing
underneath both, which decides the whole design.</p>

<div class="lede orange">
<p><b>The fact that decides it, and it is not in the brief:</b> only the <code>try</code> suite is
protected. A <code>raise</code> inside <code>else</code> is <i>not</i> caught by the
<code>except</code> clauses above it — measured by execution, §2 probe 4. So any drawing that
puts one frame around all four suites claims a protection that three of them do not have. The
protected region is <i>smaller than the statement</i>, and that single fact eliminates the two
most natural drawings before any of the five are compared.</p></div>

<div class="facts">
  <div class="fact good"><b>5</b><span>proposals, rendered</span></div>
  <div class="fact"><b>8</b><span>semantic claims re-derived by running CPython {PYVER}</span></div>
  <div class="fact"><b>8</b><span>notations checked for prior art</span></div>
  <div class="fact bad"><b>0</b><span>of them draw a <code>finally</code></span></div>
  <div class="fact warn"><b>3</b><span>arms fire under <code>except*</code>, not one</span></div>
</div>
<p class="src">worktree <code>{BRANCH}</code> @ <code>{HEAD_SHA}</code> &middot; every drawing
hand-made (nothing to capture: <code>scene/controlFlow.ts</code> has no exception vocabulary and
<code>docs/CONTROL-FLOW-PLAN.md</code> never mentions one) &middot; drawn in the vocabulary settled
this afternoon in <code>truthful-branching-2026-09-22.html</code></p>""")

    # ── the answer up front ───────────────────────────────────────────
    A("""<h2>The answer in six lines</h2>
<div class="answers">
<div class="answer"><b class="h">Only <code>try</code> is protected — draw the boundary
around it, not around the statement.</b><p>Three of the four suites sit outside the protection
while living inside the same frame. Every proposal below is scored first on whether it can say
that.</p></div>

<div class="answer"><b class="h">The handler ladder IS a match, and the subject is the
outcome.</b><p>One value, tested in order, first match wins, with an optional capture — that is
<code>match</code>'s grammar exactly. <code>else</code> stops being a special row and becomes the
<code>completed</code> pattern. But the subject is <i>produced by the body</i>, which no other
region in this kit does.</p></div>

<div class="answer red"><b class="h">It is a match by semantics and an <code>if</code>-ladder by
grammar — and you should know which half you are buying.</b><p><code>ast.ExceptHandler.type</code>
is an arbitrary <b>expression</b>; <code>match_case.pattern</code> is its own grammar production
that can never be one. <code>except make_exc_class():</code> compiles and runs the call. So the
rule &ldquo;header text may only be a pattern&rdquo; is <b>not enforced by Python here</b> — it
has to be your lint. Same lint as §5 of this afternoon's report, one more node type.</p></div>

<div class="answer green"><b class="h"><code>finally</code> is the part nobody has drawn.</b>
<p>BPMN, Step Functions, Node-RED, Snap!, Simulink, LabVIEW, Blueprints — not one has a suite
that runs on every path. BPMN's nearest thing is compensation, which the spec rules out explicitly
(undo semantics; a no-op on failure). So <code>finally</code> is invented here or not at all, which
is why the recommendation spends <i>geometry</i> on it rather than a word.</p></div>

<div class="answer blue"><b class="h">LabVIEW: a reference for one inch, an anti-reference for the
mile. Unreal: no exceptions at all, and Epic decided that twice.</b><p>Full answer in §4 with the
sources. The better references turned out to be the two you did not ask about.</p></div>

<div class="answer"><b class="h">Recommendation: P4 carrying P3 — <code>finally</code> as the
outer frame's <b>footer</b>, wrapping a selection frame whose subject dot is the body's
outcome.</b><p>Both are stock parts (<code>Block</code> already takes a <code>footer</code>). The
reversible default if you say nothing: build P4's geometry now and draw P3's dot as
<code>state=&quot;received&quot;</code>, never wired. §11.</p></div>
</div>""")

    # ── §1 ────────────────────────────────────────────────────────────
    A(section("1", "The fact that decides it"))
    A("""<p>Start here, because it removes options rather than adding them. Python's own
reference is blunt about it: <i>&ldquo;Exceptions in the <code>else</code> clause are not handled by
the preceding <code>except</code> clauses.&rdquo;</i> Probe 4 in §2 confirms it by raising one and
watching it escape the whole statement.</p>
<p>So the four suites of a <code>try</code> statement do not share a protection status. One is
inside; three are outside. A drawing with a single frame cannot express that, and a drawing with
a single frame is what everyone — including this report's first sketch — reaches for.</p>""")
    A(f'<figure>{fig_protection()}<figcaption>Left: the shape the statement suggests. '
      f'Right: the shape it has. The dashed box on the right is the only thing an '
      f'<code>except</code> clause can catch from.</figcaption></figure>')
    A(fb("1", "The protected region is smaller than the statement",
         "does this land, or is it too fine a distinction to spend geometry on?"))

    # ── §2 ────────────────────────────────────────────────────────────
    A(section("2", "The semantics, re-derived by running them"))
    A(f"""<p>Not read off a summary. <code>docs/try_except_facts.py</code> is committed beside the
builder and runs at build time; the transcript below is its literal output on this machine, so a
claim in this report cannot drift from what the interpreter does. Run it yourself:
<code>python3 docs/try_except_facts.py</code>.</p>
<pre class="term">{esc_html(FACTS)}</pre>
<p class="src">Cross-checked against the language reference,
<a href="https://docs.python.org/3/reference/compound_stmts.html">docs.python.org/3/reference/compound_stmts.html</a>
&sect; <i>The try statement</i> and the tutorial,
<a href="https://docs.python.org/3/tutorial/errors.html">docs.python.org/3/tutorial/errors.html</a>,
both fetched 2026-09-22; <code>except*</code> against
<a href="https://peps.python.org/pep-0654/">PEP 654</a>.</p>""")

    A("<h4>What each probe changes about the drawing</h4>")
    A("""<div class="scroll"><table>
<tr><th style="width:22%">Measured</th><th style="width:34%">What Python does</th>
<th>What it forces on the drawing</th></tr>
<tr><td><b>1 &middot; grammar</b></td>
<td><code>except &lt;expr&gt;</code> takes an arbitrary expression, and
<code>except make_exc_class():</code> compiles. <code>case</code> cannot: patterns are their own
production.</td>
<td class="">Under the settled rule an evaluated thing <b>owes a dot</b>. So the handler header is
not automatically legal as bare text, and the &ldquo;pattern, never evaluated&rdquo; guarantee
that <code>match</code> gets from the parser has to be a <b>lint</b> here. This is the one place
the try/except grammar is <i>weaker</i> than the branch grammar assumed.</td></tr>
<tr><td><b>2 &middot; side effects</b></td>
<td>The header expression really is evaluated, in order, when its clause is reached.</td>
<td>Confirms the above by execution, not by reading the grammar. The lint is not
theoretical.</td></tr>
<tr class="good"><td><b>3 &middot; capture scope</b></td>
<td><code>e</code> is deleted at the end of its own arm — the reference spells the desugaring
as an implicit <code>finally: del N</code>.</td>
<td><b>A gift.</b> The square capture dot on the arm tab's right edge is not just a convention
here — the value genuinely cannot escape the row, so a cable from that dot to anywhere outside
its arm is statically wrong and a lint can say so.</td></tr>
<tr class="bad"><td><b>4 &middot; else is unprotected</b></td>
<td>A <code>raise</code> in <code>else</code> escapes the whole statement.</td>
<td>&sect;1. The protected boundary is the <code>try</code> suite alone.</td></tr>
<tr><td><b>5, 6 &middot; finally vs return</b></td>
<td><code>finally</code> runs on the way out and its <code>return</code> wins;
<code>else</code> does not run when the suite left early.</td>
<td>The try suite has <b>three</b> outcomes, not two, and only two of them have a row you can
author. See the matrix below.</td></tr>
<tr class="bad"><td><b>7, 8 &middot; except*</b></td>
<td>Three arms fired, each taking its own subgroup. <code>except</code> and <code>except*</code>
cannot be mixed; <code>except*:</code> bare is a SyntaxError while <code>except:</code> bare is
legal.</td>
<td>The firing rule is a property of the <b>whole region</b>, not of an arm — so it is one
marker on the frame. And the catch-all arm (the <code>else</code>-shaped row with no pattern)
<b>exists under <code>except</code> and is illegal under <code>except*</code></b>.</td></tr>
</table></div>""")

    A(f'<figure>{fig_outcome()}<figcaption>Five outcomes against four rows. The bottom row is '
      f'the one with no arm: a <code>return</code> inside the try suite skips every handler and '
      f'<code>else</code>, and goes straight to <code>finally</code>.</figcaption></figure>')
    A(f'<figure>{fig_ladder_vs_sieve()}<figcaption>The same four rows on the page, and the '
      f'opposite firing rule. This is the discriminator every proposal below is tested '
      f'against.</figcaption></figure>')
    A(fb("2", "The semantics, and what each one forces",
         "anything here you disagree with, or want dropped as too fine?"))

    # ── §3 ────────────────────────────────────────────────────────────
    A(section("3", "Your instinct — steelmanned, then broken"))
    A("""<p><i>&ldquo;I feel its not necessarily branching — more sequential regions that
conditionally fire.&rdquo;</i></p>
<p>This is worth taking seriously rather than politely, because the <b>shape</b> half of it is
right and is not obvious. A <code>try</code> statement genuinely is a flat stack of rows in
source order. It is not a tree, there is no nesting in the source, and the drawing should not
invent one. Every proposal below except P2 keeps that.</p>
<p>The <b>firing rule</b> half is where it comes apart, in three places — and the third is the
one that matters most, because no ordering vocabulary can reach it.</p>""")
    A(f'<figure>{fig_instinct()}<figcaption>The hypothesis on the left, and the three places it '
      f'cannot go on the right.</figcaption></figure>')
    A("""<div class="lede gold"><p><b>The synthesis, and it is what the recommendation is built
from:</b> keep the sequence at the top level, but make the <i>middle</i> of it one selector group
rather than N independent conditions — and take the two unconditional rows out of the selecting
structure entirely, so &ldquo;always&rdquo; is a place rather than a word. That is exactly
P4&nbsp;×&nbsp;P3.</p></div>""")
    A(fb("3", "Sequential regions that conditionally fire — steelman and break",
         "is the break fair? which of the three is the one you feel?"))

    # ── §4 ────────────────────────────────────────────────────────────
    A(section("4", "Prior art — the question you actually asked"))
    A("""<div class="lede"><p><b>Short answer.</b> <b>LabVIEW</b> has error handling but not a
<code>try</code>: an error is an ordinary data value on an ordinary wire, and the one genuinely
try/except-shaped thing it has is a Case Structure with an error cluster wired to its selector —
which gives you exactly <b>two</b> cases, not a typed ladder. <b>Unreal Blueprints</b> has no
exceptions at all and never has; failure is an extra white execution pin the author routes by
hand. Neither is the reference you want — and the wider sweep found five that are closer,
three of which nobody mentions in this context.</p></div>""")

    A("<h4>4.1 &middot; LabVIEW — a reference for one inch</h4>")
    A("""<p>The error cluster is <code>status</code> (Boolean), <code>code</code> (I32),
<code>source</code> (String), and NI is explicit that it is <b>data</b>, not control:
<i>&ldquo;Error handling in LabVIEW follows the dataflow model. Just as data values flow through a
VI, so can error information.&rdquo;</i> Every VI has <code>error in</code> / <code>error out</code>
terminals, and the same wire doubles as a sequencing hack — an artificial data dependency used to
force execution order.</p>
<p>Two things about it are directly relevant, and they point opposite ways.</p>
<ul>
<li><b>The reference.</b> The Case Structure's selector terminal accepts <b>five</b> data types,
and one of them is the Error Cluster: <i>&ldquo;The error case structure is like the Boolean case
structure but can be controlled by the error state of an Error cluster. The border of the error
case is red and the non-error case is green.&rdquo;</i> That is a real try/except: one value on the
selector, two branches, colour-coded. <b>It is also the whole of it</b> — two cases, error and
no-error, with no typed ladder, no capture beyond the cluster itself, and no scope.</li>
<li><b>The anti-reference.</b> There is no enclosing handler anywhere. Propagation is wiring, and
the &ldquo;abort&rdquo; is per-node: <i>&ldquo;If LabVIEW detects an error, the node passes the
error to the next node without executing that part of the code.&rdquo;</i> That is the behaviour
P5 draws, and it is a <b>convention each VI implements by checking its own <code>error in</code></b>,
not a language guarantee. Forget one wire and the error silently stops existing.</li>
</ul>
<p>Worth naming because it cuts the other way: automatic error handling is <b>on by
default</b> — <i>&ldquo;By default, LabVIEW automatically handles any error when a VI runs by
suspending execution, highlighting the subVI or function where the error occurred, and displaying
an error dialog box.&rdquo;</i> LabVIEW's real answer to an unhandled error is a modal dialog, not a
notation.</p>
<p class="src">Sources fetched 2026-09-22:
<a href="https://lumen.ni.com/pdf/labview101/us/debugging_explanation.pdf">lumen.ni.com &middot;
Debugging and Handling Errors (PDF, read directly)</a> for the cluster fields, the dataflow
sentence, automatic error handling and the per-node bypass;
<a href="https://labviewwiki.org/wiki/Case_structure">labviewwiki.org &middot; Case structure</a>
for the error case structure and the five selector types. <b>Not directly verified:</b> NI's own
page for the case-structure behaviour (<code>ni.com/docs/&hellip;/using_case_structures_for</code>)
is a JavaScript app and returns navigation chrome only; the exact NI wording
(&ldquo;displays two cases&mdash;Error and No&nbsp;Error&rdquo;) is corroborated across search
results but was never rendered here. The wiki quote above <i>was</i>.</p>""")

    A("<h4>4.2 &middot; Unreal Blueprints — an anti-reference, decided twice</h4>")
    A("""<p>Blueprints has no exceptions, no try, no catch. Epic's own overview of what Blueprint
Visual Scripting <i>is</i> does not mention them; the community has been asking since at least
2016 and a paid marketplace plugin exists purely to bolt the feature on. What Blueprints has
instead is the thing CLAUDE.md forbids you:</p>
<ul>
<li><b>Execution pins.</b> <i>&ldquo;Data pins pass values between nodes and execution pins control
the order in which nodes are executed.&rdquo;</i> Failure is an <b>extra white exec pin</b> —
<code>Branch</code>'s True/False, a latent node's success/failure outputs, a Cast node's
<i>Cast Failed</i>. <i>&ldquo;Other types of nodes can have multiple input and output execution
pins, allowing for different behavior dependent on which pin is activated.&rdquo;</i></li>
<li><b>The Sequence node</b> is not a <code>try</code> and is not related: <i>&ldquo;The Sequence
node allows for a single execution pulse to trigger a series of events in order.&rdquo;</i> Its
outputs are labelled <code>Out 0, Out 1, &hellip;</code> — worth correcting, the
&ldquo;Then&nbsp;0&rdquo; spelling is community shorthand, not the current doc.</li>
<li><b>No <code>finally</code>.</b> Nothing runs on every exit path.</li>
</ul>
<p><b>The interesting part is Verse</b>, Epic's from-scratch language for the same domain. It
<i>also</i> refused exceptions, and chose an effect instead: <code>&lt;decides&gt;</code> is
<i>&ldquo;an effect that indicates that the function can fail, and that calling this function is a
failable expression&rdquo;</i>, evaluated inside a <i>failure context</i>. Two independent Epic
decisions, twenty years apart, both landing on &ldquo;failure is a normal, visible, local branch,
not a hidden non-local jump.&rdquo; That is a real argument against the whole construct — but it
is an argument about <i>Python</i>, and you are projecting Python, so it does not get a vote
here.</p>
<p class="src">Fetched 2026-09-22:
<a href="https://dev.epicgames.com/documentation/unreal-engine/blueprint-foundations">Blueprint
Foundations</a>, <a href="https://dev.epicgames.com/documentation/unreal-engine/nodes-in-unreal-engine">Nodes</a>,
<a href="https://dev.epicgames.com/documentation/en-us/unreal-engine/flow-control-in-unreal-engine">Flow
Control</a>, <a href="https://dev.epicgames.com/documentation/fortnite/verse-glossary">Verse
Glossary</a>. <b>Not directly verified:</b> the Cast node's <i>Cast Failed</i> pin — Epic's
Casting Quick Start renders, but covers the C++ <code>Cast&lt;&gt;()</code> pattern, not the
Blueprint node's pins. The same idiom <i>is</i> directly verified on
<a href="https://dev.epicgames.com/documentation/en-us/unreal-engine/BlueprintAPI/AI/AIMoveTo">AI
MoveTo</a>, which carries two exec outputs plus a result enum.</p>""")

    A("<h4>4.3 &middot; The wider sweep — where the real references were</h4>")
    A(f'<figure>{fig_priorart()}<figcaption>Eight notations, five criteria. Read the fourth '
      f'column.</figcaption></figure>')
    A("""<div class="scroll"><table>
<tr><th style="width:20%">Notation</th><th style="width:44%">What it actually does</th>
<th>Verdict for us</th></tr>
<tr class="good"><td><b>BPMN 2.0</b><br>error boundary event</td>
<td>An event attached to the <b>boundary</b> of an activity. For errors it is always interrupting:
<i>&ldquo;an Error Event always interrupts the Activity to which it is attached &hellip; The boundary
of the Event thus always solid.&rdquo;</i> Dispatch is ordered — <i>&ldquo;caught by the first
event in the scope hierarchy matching the error code.&rdquo;</i></td>
<td><b>The strongest solve.</b> A visible container with ordered, named dispatch. It is P2. But it
has <b>no <code>finally</code></b> and <b>no drawing of the abort</b> — the notation shows the
exception flow leaving the boundary and says nothing about the interior.</td></tr>
<tr class="good"><td><b>BPMN 2.0</b><br>event sub-process</td>
<td>The same job done with a dotted-bordered sub-process drawn <b>inside</b> the parent:
<i>&ldquo;behaves like a boundary event, but is inside the scope instead of attached to the
scope&rdquo;</i> — and can therefore see local variables a boundary event cannot.</td>
<td><b>The precedent for a handler ROW.</b> BPMN has both shapes and chose to keep both; the
inside one exists precisely because scope-visibility matters. That is the argument for P3/P4 over
P2.</td></tr>
<tr><td><b>AWS Step Functions</b><br><code>Catch</code> / <code>Retry</code></td>
<td>Catchers are <i>&ldquo;scanned in the order listed&rdquo;</i>; <code>States.ALL</code> is the
wildcard and <i>&ldquo;must appear in the last catcher&rdquo;</i>; <code>ResultPath</code> binds
the error object (<code>Error</code> + <code>Cause</code>) into the state's output. A catcher
requires a <code>Next</code> target and is therefore drawn as a real edge; a retrier has no
<code>Next</code> and lives only in the config panel.</td>
<td><b>Validates the ladder.</b> Independently reinvented Python's first-match order, the
mandatory-last catch-all, and <code>as&nbsp;e</code>. No <code>finally</code>: you duplicate the
target by hand on every path.</td></tr>
<tr><td><b>Node-RED</b><br><code>catch</code> node</td>
<td>Detached. Scope is an <b>array of node ids</b> in the node's own config
(<code>"scope": ["54a42e35&hellip;"]</code>), entirely separate from <code>wires</code> — there is no
drawn edge from the protected node to the handler. Overlapping catches <b>all</b> fire.</td>
<td><b>A genuinely different answer, and wrong for Python.</b> Python's <code>try</code> is
lexical and contiguous; a scope-set cannot round-trip to one. Its <code>complete</code> node looks
like a <code>finally</code> and is not — Complete and Catch are mutually exclusive.</td></tr>
<tr class="good"><td><b>Snap!</b><br><code>safely try</code></td>
<td>One block with <b>two stacked C-slots</b>: the first runs, and <i>&ldquo;if an error happens,
the code in the second C-slot is run&rdquo;</i>, with an upvar carrying the error into it.</td>
<td><b>The best find, and the closest shape to ours.</b> One node, stacked containers, a bound
error — no boundary attachment, no second node kind. It is P1/P3/P4's family, arrived at
independently by people teaching children. It has no <code>else</code> and no
<code>finally</code>.</td></tr>
<tr class="dim"><td><b>Simulink / Stateflow</b></td>
<td>Does not attempt it. <code>MSLException</code> is a scripting API for block authors; the
Assertion block is one checkbox that halts the simulation; code generation does not even support
<code>try/catch</code> inside a MATLAB Function block.</td>
<td><b>The cleanest dodge.</b> Useful only as evidence that &ldquo;push it into text&rdquo; is a
real option people take.</td></tr>
<tr class="dim"><td><b>Temporal &middot; n8n</b></td>
<td>Temporal's saga pattern is pure SDK code with no visual representation in its own Web UI at
all. n8n takes Node-RED's answer further: the handler lives in an <b>entirely separate workflow
file</b>, selected from a dropdown.</td>
<td>Both confirm the same thing from the far end: when the notation cannot hold it, it leaves.</td></tr>
</table></div>
<p class="src">Each row was fetched, not recalled: the OMG BPMN 2.0 spec (formal/2011-01-03, read
as a PDF) and <a href="https://docs.camunda.io/docs/components/modeler/bpmn/error-events/">Camunda's
error-events doc</a>;
<a href="https://docs.aws.amazon.com/step-functions/latest/dg/concepts-error-handling.html">AWS
Step Functions error handling</a>;
<a href="https://nodered.org/docs/user-guide/handling-errors">Node-RED handling errors</a> and
<a href="https://nodered.org/blog/2019/09/20/node-done">the core team's node-done post</a>;
<a href="https://snap.berkeley.edu/snap/help/SnapManual.pdf">the Snap! Reference Manual</a>;
<a href="https://www.mathworks.com/help/simulink/ug/error-handling-in-simulink-using-mslexception.html">MathWorks
MSLException</a>. <b>Not verified:</b> whether Step Functions' Workflow Studio styles a catch edge
differently (dashed/red) — no source found either way. <b>Dropped rather than guessed:</b>
Prograph's error handling — nothing on it exists that we could fetch.</p>""")
    A(fb("4", "Prior art — LabVIEW, Unreal, and the five better references",
         "which of these do you want followed, and is the LabVIEW verdict fair?"))

    # ── §5-9 the five proposals ───────────────────────────────────────
    A(section("5", "The five proposals"))
    A("""<p>All five draw the <i>same</i> Python, so they are comparable line for line. They are
not five skins of one idea — each takes a different position on the three questions that
actually differ: <b>where do the handlers live</b>, <b>what is the subject and does it get a
dot</b>, and <b>what makes <code>finally</code> unconditional</b>.</p>
<pre>""" + "\n".join(
        f'<span class="k">{esc_html(l)}</span>' if l.lstrip().split(" ")[0] in
        ("try:", "except", "else:", "finally:") or l.startswith(("try", "except", "else", "finally"))
        else f'  {esc_html(l.strip())}' for l in SAMPLE) + "</pre>")

    DETAIL = {
        "P1": dict(
            right=["Source order survives exactly — row <i>n</i> in the drawing is clause "
                   "<i>n</i> in the file. pyblocks' backward pass is a line-for-line write.",
                   "The unconditional rows have a <b>shape</b>, not a word: no tab, because a tab "
                   "is what a test dot attaches to and there is no test. That is the same rule "
                   "the branch grammar already uses for <code>else:</code>.",
                   "It is the <b>only</b> proposal that draws <code>except*</code> correctly, and "
                   "it gets there by being wrong about <code>except</code>."],
            wrong=["<b>The selection is invisible.</b> Three rows with three independent "
                   "conditions admit a state Python forbids — two handlers plus "
                   "<code>else</code> all firing. Nothing in the drawing says only one can.",
                   "No subject anywhere, so <code>except FileNotFoundError</code> is bare text "
                   "for something that is evaluated — exactly the class of lie this "
                   "afternoon's report closed.",
                   "One frame around four suites — the &sect;1 problem, uncorrected."],
            cost=["<b>Nothing new.</b> <code>BlockRegion</code> + <code>RegionArm</code> as they "
                  "stand; the always-rows are a <code>RegionArm</code> with no tab furniture, "
                  "which is already the <code>else:</code> case.",
                  "One prop: a row kind. <code>blockRegion.layout.ts</code> does not move — "
                  "<code>REGION_ARM_HEADER_PX</code> is the same 32 either way.",
                  "Realistically an afternoon."],
            fin="A tinted strip with the word <code>always</code>. This is its weakest point: a "
                "label a future skin, prop change or author can contradict. It is the exact "
                "failure mode of <code>mode == &quot;fast&quot;</code> in a title.",
            grp="<b>Best of the five.</b> Independent rows <i>are</i> the correct reading of "
                "<code>except*</code>. It needs no variant at all — and that is the tell that "
                "it is reading <code>except</code> wrong."),
        "P2": dict(
            right=["<b>It draws the abort</b>, and nothing else here can. The escape point sits "
                   "on the wall at the height it happened, with the un-run remainder dimmed "
                   "below the tear. No notation in &sect;4 does this — BPMN included.",
                   "The protected extent is unambiguous: the container <i>is</i> the protection.",
                   "20 years of BPMN practitioner testing behind the shape."],
            wrong=["<b>Order is gone.</b> Handlers are spatial, so &ldquo;first match wins&rdquo; "
                   "has no drawing at all — and that is the single most consequential rule in "
                   "the whole construct.",
                   "<code>else</code> has nowhere to go: it is not an event and not protected, "
                   "so it floats.",
                   "A reader cannot recover source order, so the round-trip needs an out-of-band "
                   "index."],
            cost=["<b>Real new layout.</b> <code>blockRegion.layout.ts</code> stacks rows; "
                  "mounting arms on a vertical wall at arbitrary heights is a second layout mode, "
                  "not a prop.",
                  "Wire keep-outs get harder: <code>wireLayer.tsx</code> measures "
                  "<code>[data-arm-id]</code> rows as rectangles inside the frame; a handler "
                  "hanging outside it is a new obstacle class.",
                  "A week, and it lands on a file three hosts read."],
            fin="No boundary to hang off — it is not triggered by anything. Falls back to a band "
                "below, which is accidentally the right answer for the wrong reason.",
            grp="<b>Badly.</b> BPMN error events are always interrupting and exactly one fires. "
                "Drawing three boundary handlers that all fire contradicts the notation it is "
                "borrowing from."),
        "P3": dict(
            right=["<b>It pays the debt probe 1 found.</b> <code>except ValueError</code> is "
                   "evaluated, so it owes a dot; this is the only proposal that gives it one.",
                   "<code>else</code> stops being special — it is the <code>completed</code> "
                   "pattern, one of the three shapes the outcome takes. No new row kind.",
                   "The capture dot is already the right component and is now provably correct: "
                   "<code>e</code> is deleted at the end of its arm (probe 3), so it can never "
                   "legitimately be wired out of the row it sits on.",
                   "It can draw the arm you <i>cannot author</i> — <code>left early</code> — "
                   "as a ghost row, which is honest about a real gap."],
            wrong=["The subject is produced by the body, and <b>no other region in this kit has "
                   "that</b>. <code>match</code>'s subject arrives from outside on a cable; this "
                   "one does not arrive at all.",
                   "An always-hollow dot reads as a missing input. It needs a port state that "
                   "means &ldquo;supplied structurally, never wireable&rdquo;.",
                   "Says nothing about <code>finally</code>."],
            cost=["<b>Mostly stock.</b> The ladder is the <code>match</code> factory the branch "
                  "work is already building — <code>matchNode</code> with patterns as text and "
                  "captures as tab-right ports.",
                  "One new port state on <code>PortState</code> "
                  "(<code>components/port.tsx:60</code>), or a re-use of "
                  "<code>received</code>. Painted in five skins via "
                  "<code>skin/portVariants.ts</code> — that is the real cost, not the geometry.",
                  "One lint in <code>scene/lint.ts</code>: an <code>ExceptHandler.type</code> "
                  "that is not a dotted name or a tuple of them must be supplied by a cable."],
            fin="Unsolved. A subject makes rows <i>selected</i>; nothing about it makes a row "
                "unconditional. P4 is the missing half, and the two compose without touching each "
                "other.",
            grp="Needs a marked variant: same geometry, one marker on the frame, firing rule "
                "flips from ladder to sieve. Drawn in &sect;11 rather than promised. Honest cost: "
                "the marker is the only thing distinguishing two opposite semantics."),
        "P4": dict(
            right=["<b><code>finally</code> cannot look chosen</b>, because it is not in the arm "
                   "stack. A label can be edited; a geometry cannot. This is the only proposal "
                   "that answers the harder of the two discriminators structurally.",
                   "It is the language's own shape: the reference defines the combined form as a "
                   "nesting — the <code>try</code> clause &ldquo;including any "
                   "<code>except</code> and <code>else</code> clauses&rdquo;, and then the "
                   "<code>finally</code> clause.",
                   "The protected boundary lands correctly by construction, because the inner "
                   "frame is where the selection lives and the protected suite is its first row."],
            wrong=["Two frames of chrome for one statement. A <code>try/except</code> with no "
                   "<code>finally</code> should collapse to one frame, which is a rule to write "
                   "and get right.",
                   "The nesting is invisible to a reader who does not know the desugaring — it "
                   "looks like an arbitrary extra box until someone explains it.",
                   "Says nothing about the subject, so on its own the handler headers are still "
                   "bare text."],
            cost=["<b>The slot already exists.</b> <code>Block</code> takes an optional "
                  "<code>footer</code> — the same prop the opaque region view uses for its "
                  "hidden-count line. This proposal spends a stock part rather than adding a row "
                  "kind.",
                  "<code>blockRegion.layout.ts</code> already stacks a corner, a body and arms; "
                  "a footer is a fixed <code>REGION_ARM_HEADER_PX</code> band added to the "
                  "bottom, ahead of <code>REGION_PAD_BOTTOM_PX</code>.",
                  "Region-in-region already works — <code>armsOf</code> / "
                  "<code>bodyChildrenOf</code> in <code>scene/controlFlow.ts</code> are "
                  "recursive by construction."],
            fin="<b>This is the proposal.</b> Not a chip, not a tint, not a word — a place no "
                "selector reaches.",
            grp="Inherits whatever the inner frame does. Neutral on it, which is the right "
                "answer: the firing rule is the selection frame's business."),
        "P5": dict(
            right=["It is <b>actually LabVIEW</b>, not an impression of it — down to the "
                   "per-node bypass NI documents.",
                   "It scales to a non-contiguous protected set, which no lexical construct can "
                   "express.",
                   "The error is unambiguously a value, so there is no argument about what the "
                   "dot means."],
            wrong=["<b>It draws propagation, and Python has none.</b> The remaining statements are "
                   "not executed-as-no-ops; they never run. The rail animates a mechanism the "
                   "language does not have.",
                   "<b>It cannot round-trip.</b> Nothing in the picture says where the protected "
                   "region begins or ends, so no <code>try:</code> can be recovered from it.",
                   "<b>The rail is a cable, and it carries control.</b> A wire whose presence "
                   "decides whether the next block runs is the execution wire CLAUDE.md forbids — "
                   "made worse by looking like data.",
                   "It taxes every block on the canvas, forever, for a construct that appears in "
                   "a small fraction of them."],
            cost=["<b>Paradoxically cheap and completely wrong.</b> <code>PortEdge</code> + "
                  "<code>portLane.ts</code> already do dedicated lanes; "
                  "<code>BlockPortLane</code> is a shipped story.",
                  "The expensive part is not building it — it is that every existing block "
                  "gains a port, so every fixture, every layout test and every skin moves.",
                  "Included so the rejection is <b>earned</b>, not assumed. It is the answer the "
                  "brief's own reference would have given."],
            fin="No answer. There is no place in a rail for &ldquo;runs regardless&rdquo; — "
                "LabVIEW does not have one either, and that is not a coincidence.",
            grp="No answer. A rail carries one error at a time; a group is not a shape it has."),
    }

    for i, (tag, name, claim, figfn) in enumerate(PROPOSALS):
        d = DETAIL[tag]
        A(f'<div class="prop">')
        A(f'<h3><span class="tag">{tag}</span>{name}</h3>')
        A(f'<p class="claim">{claim}</p>')
        A(f'<figure>{figfn()}</figure>')
        A('<div class="cols three">')
        A('<div><h5>Gets right</h5><ul>' + "".join(f"<li>{s}</li>" for s in d["right"]) + '</ul></div>')
        A('<div><h5>Gets wrong</h5><ul>' + "".join(f"<li>{s}</li>" for s in d["wrong"]) + '</ul></div>')
        A('<div><h5>What it costs in this kit</h5><ul>' + "".join(f"<li>{s}</li>" for s in d["cost"]) + '</ul></div>')
        A('</div>')
        A('<div class="disc">')
        A(f'<div class="{"g" if tag == "P4" else "r"}"><b>finally</b>{d["fin"]}</div>')
        A(f'<div class="{"g" if tag == "P1" else "r"}"><b>except*</b>{d["grp"]}</div>')
        A('</div>')
        A(fb(f"5.{i + 1}", f"{tag} — {name}", "keep, kill, or splice with which?"))
        A('</div>')

    # ── §6 criteria + scores ──────────────────────────────────────────
    A(section("6", "Criteria before options"))
    A("""<p>Weighted for this repo and this week, not in the abstract. The two triple-weighted
rows are the ones that actually separate the field; the rest mostly rank cost.</p>""")
    A(f'<figure>{fig_scores()}</figure>')
    A(fb("6", "The criteria and their weights",
         "wrong weights? a criterion missing, or one you do not care about?"))

    # ── §7 recommendation ─────────────────────────────────────────────
    A(section("7", "The recommendation"))
    A("""<div class="lede green"><p><b>Build P4 carrying P3.</b> <code>finally</code> is the outer
frame's <b>footer</b> — geometry, not a label. Inside it, one selection frame whose first row is
the protected suite and whose handler rows are a <code>match</code> on the suite's
<b>outcome</b>, with that subject drawn as a dot that is <b>never wired</b>.</p>
<p>They are not rivals. P3 answers &ldquo;what is the subject&rdquo;; P4 answers &ldquo;what makes a
row unconditional&rdquo;. Neither touches the other's geometry, and each is separately the best
answer to its own question.</p></div>""")
    A(f'<figure>{fig_rec()}<figcaption>The composition. Two frames, one footer, one never-wired '
      f'subject dot, captures on the tab edges.</figcaption></figure>')

    A("<h4>The one thing in it that is genuinely new — a dot that is never wired</h4>")
    A("""<p>This deserves naming rather than smuggling. Every other dot in the kit is a socket: a
cable may land on it. This one never can, because the value comes from the suite directly above it
inside the same node.</p>
<p>The argument that it is still legal is the one this afternoon's report already made for the
branch selector: <i>&ldquo;the selector is not read by the body, it is read by the <b>structure
itself</b> — an operand of the <code>if</code>, the way <code>%cond</code> is an operand of
MLIR's <code>scf.if</code> and not one of its captured values.&rdquo;</i> The outcome is the same
kind of thing, and it arrives the same way a region already sees what was defined before it —
structurally, with no tunnel.</p>
<p><b>So there is no cable, in fact or in appearance</b>, which is what makes this the answer
rather than P5. The cost is one port state. <code>PortState</code> already has four
(<code>components/port.tsx:60</code>) and <code>received</code> is the closest honest fit, but
re-using it means &ldquo;a value is present&rdquo; now covers two different provenances. A fifth
value (<code>structural</code>) is cleaner and costs a paint in five skins. <b>Reversible default:
re-use <code>received</code></b>, and split it only if the active-arm lens ever needs to tell the
two apart.</p>""")

    A("<h4>And <code>except*</code>, drawn rather than promised</h4>")
    A(f'<figure>{fig_group_variant()}</figure>')
    A("""<p>Honest limitation: under this recommendation the difference between a first-match
ladder and an all-arms sieve is <b>one marker on the frame</b>. That is a small visual difference
carrying an enormous semantic one, and it is the same class of thing this whole report objects
to.</p>
<p>It is nonetheless the only option available, because Python makes it a property of the
statement: <code>except</code> and <code>except*</code> cannot be mixed (probe 8), so there is no
per-arm distinction to draw. The mitigations are real but modest — a different frame stroke, the
subject reading <code>&#10216;outcome group&#10217;</code> rather than
<code>&#10216;outcome&#10217;</code>, and the catch-all row being <b>absent</b> because
<code>except*:</code> is a SyntaxError. Three differences, not one. <b>If you decide that is not
enough, the honest move is to refuse to draw <code>except*</code> at all</b> and render it as an
opaque code block until someone has a better idea. I would not start there, but I would not argue
if you did.</p>""")
    A(fb("7", "The recommendation — P4 carrying P3",
         "yes / no / which half? and is the never-wired dot acceptable?"))

    # ── §8 stock parts ────────────────────────────────────────────────
    A(section("8", "The stock parts this is made of"))
    A("""<p>Element by element, against what exists on the trunk today. The point of the table is
the last column: nothing here may quietly change a behaviour that is already settled.</p>
<div class="scroll"><table>
<tr><th style="width:18%">Element</th><th style="width:22%">Today</th>
<th style="width:30%">Off-the-shelf part, by its exact exported name</th>
<th>Behaviour that must survive</th></tr>

<tr><td><b>Outer cleanup frame</b></td>
<td>a region is a region; there is no nesting rule for control flow</td>
<td><code>BlockRegion</code> with <code>kind:&nbsp;"group"</code>, an ordinary region node whose
one body child is the selection region</td>
<td>region-in-region already works — <code>armsOf</code> / <code>bodyChildrenOf</code>
(<code>scene/controlFlow.ts</code>) are recursive; arm-relative child positions are unaffected</td></tr>

<tr class="good"><td><b><code>finally</code> band</b></td>
<td>does not exist</td>
<td><code>Block</code>'s existing optional <code>footer</code> — the same prop the opaque
region view uses for its hidden-count line</td>
<td>a footer is drawn on the frame, never in the arm stack, so <code>armsOf</code> cannot return
it and no selector can reach it — that is the whole proposal</td></tr>

<tr><td><b>Selection frame</b></td>
<td><code>BlockRegion</code> + <code>RegionArm</code>, arms carry <code>title / open / active</code>
and <b>zero ports</b></td>
<td><code>BlockRegion</code>, <code>RegionArm</code> unchanged; the <code>matchNode</code> factory
the branch split is already introducing</td>
<td>per-arm fold, <code>REGION_ARM_FADE_OPACITY</code> on the inactive arm, arm-relative child
positions</td></tr>

<tr><td><b>Protected boundary</b></td>
<td>does not exist</td>
<td>a style on the first arm's body — <code>BlockMembers layout="free"</code> as today, with a
dashed inset border; no new component</td>
<td>it must hug the <code>try</code> suite <b>alone</b>; a future refactor that widens it to the
frame reintroduces the &sect;1 lie</td></tr>

<tr><td><b>Outcome subject dot</b></td>
<td>an arm has no port; a corner card's ports come from <code>data.ports</code></td>
<td>an ordinary <code>BlockPort</code> left-wall port on the selection frame's subject strip,
rendering the kit's existing <code>portDotClass</code></td>
<td>it resolves through <code>wireLayer.tsx</code>'s ordinary <code>[data-port-id]</code> lookup
like every other dot — no second path — while being <b>rejected as a wire endpoint</b> by the
same lint that owns the arm-test rule</td></tr>

<tr><td><b>Capture dot</b> (<code>as&nbsp;e</code>)</td>
<td>does not exist</td>
<td>an ordinary right-wall port on the arm tab — the identical part the branch report proposed
for <code>case&nbsp;Point(y=y)</code>, unchanged</td>
<td>faces right so it can never be confused with an operand; and now provably arm-scoped
(probe&nbsp;3), so a cable out of its row is statically wrong</td></tr>

<tr><td><b>Port state for a never-wired dot</b></td>
<td><code>PortState = "empty" | "valueSet" | "wired" | "received"</code>
(<code>components/port.tsx:60</code>)</td>
<td><code>received</code> re-used — painted already in all five skins by
<code>skin/portVariants.ts</code></td>
<td><code>valueSet</code> keeps meaning &ldquo;owns a default&rdquo;; if the active-arm lens ever
needs to tell &ldquo;arrived by cable&rdquo; from &ldquo;supplied structurally&rdquo;, that is when
a fifth value is earned — not before</td></tr>

<tr><td><b><code>except*</code> marker</b></td>
<td>does not exist</td>
<td><code>Badge</code> on the frame's header — the same part <code>break</code>/<code>continue</code>
already use (<code>data-slot="control-mark"</code>)</td>
<td>still a mark, never a wire; and it sits on the <b>frame</b>, because Python makes the firing
rule a property of the statement</td></tr>

<tr class="dim"><td><b>unchanged (stock seam)</b></td>
<td>the join at the consumer</td>
<td><code>BlockPort</code>'s ordinary fan-in — several cables, one dot</td>
<td>the 2026-09-02 V1 pick stands. Handler arms that both assign <code>cfg</code> fan in at the
consumer exactly like branch arms; this proposal adds no yield port</td></tr>

<tr class="dim"><td><b>unchanged (stock seam)</b></td>
<td><code>blockRegion.layout.ts</code>'s stacking math</td>
<td><code>regionLayout()</code>, <code>REGION_ARM_HEADER_PX&nbsp;=&nbsp;32</code>,
<code>REGION_PAD_BOTTOM_PX&nbsp;=&nbsp;12</code></td>
<td>a footer is one more fixed band ahead of the bottom pad. No row geometry moves, which is what
keeps this off the critical path of the lane currently in that file</td></tr>

<tr class="dim"><td><b>unchanged (stock seam)</b></td>
<td><code>raise</code> / <code>re-raise</code> inside an arm</td>
<td><code>Badge data-slot="control-mark"</code>, same as <code>break</code>/<code>continue</code></td>
<td>a mark, never a cable — <code>raise</code> is the same kind of thing as <code>break</code>
and gets the same treatment rather than a new one</td></tr>
</table></div>""")
    A(fb("8", "Stock-part mapping", "anything here you would not spend, or a seam I moved that should not move?"))

    # ── §9 contradictions ─────────────────────────────────────────────
    A(section("9", "What contradicts the grammar you settled today"))
    A("""<p>Three things, in descending order of how much they cost you. None of them break the
grammar; all three are places where <code>try</code> does not behave like <code>match</code> or
<code>if</code> and the rule has to be extended rather than applied.</p>
<div class="answers">

<div class="answer red"><b class="h">&ldquo;Header text may only be a pattern&rdquo; is not free
here — Python does not enforce it.</b><p>For <code>match</code>, the parser guarantees it:
<code>match_case.pattern</code> is its own grammar production and cannot hold a call. For
<code>except</code> it guarantees nothing — <code>ast.ExceptHandler.type</code> is an arbitrary
expression, and <code>except make_exc_class():</code> compiles and runs the call (probes 1&ndash;2).
<b>So the same lint &sect;5 of this afternoon's report proposed has to cover one more node type</b>,
and unlike the branch case it is the <i>only</i> thing standing between a header and a side
effect. Worth saying plainly: the rule survives, but its enforcement is now yours in a place
where you were getting it for free.</p></div>

<div class="answer red"><b class="h">A dot whose position says who consumes it — but nothing
says who <i>produces</i> it.</b><p>The grammar's rule is about consumption, and it works: the
outcome dot sits on the selection frame because the selection frame consumes it. But every other
dot in the kit is <i>also</i> a socket a cable may land on, and this one is not. The rule is
silent on that, and the recommendation has to add a sentence to it: <b>a dot's position says who
consumes the value; whether it is wireable is a separate fact.</b> That is a small extension, and
it is better to write it down now than discover it as a bug.</p></div>

<div class="answer"><b class="h">&ldquo;An arm with nothing to test gets no tab furniture&rdquo;
collides with itself.</b><p>In the branch grammar, <code>else:</code> is plain because it has no
<i>test</i>. In a <code>try</code> statement, <code>try:</code> and <code>finally:</code> are plain
because they have no <i>condition at all</i> — a different reason with the same drawing. P1 shows
exactly this collision. The recommendation dodges it by moving <code>finally</code> out of the arm
stack, and <code>try:</code> stays a plain row where plainness happens to be right for both
reasons at once. <b>It is a latent ambiguity, not a live bug</b> — but it will surface the first
time someone folds a <code>try</code> row and expects the fold to mean what it means on an
<code>elif</code>.</p></div>

<div class="answer blue"><b class="h">And one thing that does NOT contradict it, though it
looks like it might.</b><p>&ldquo;Control flow is never a cable&rdquo; survives intact. The outcome
is a <i>value</i> and it is never wired; the capture is a value and it is arm-scoped;
<code>raise</code> is a <code>Badge</code> mark like <code>break</code>. Nothing in the
recommendation draws an edge that carries control. P5 does, which is why P5 is in the report and
not in the recommendation.</p></div>
</div>""")
    A(fb("9", "The three contradictions",
         "do you want the grammar amended in writing, or left as it is?"))

    # ── §10 where this leaves you ─────────────────────────────────────
    A(section("10", "Where this leaves you"))
    A(f"""<div class="scroll"><table>
<tr><th style="width:16%">State</th><th>What</th></tr>

<tr class="good"><td><b>Done &amp; proved</b></td>
<td>Eight semantic claims re-derived by <b>running</b> CPython {PYVER}, not by reading a summary —
<code>docs/try_except_facts.py</code> is committed and its output is embedded above, so it re-runs
on every build. Prior art fetched from primary sources with the two claims we could <b>not</b>
render marked as such (NI's own case-structure page; Epic's Cast-Failed pin). The vault was swept
whole, including <code>Sources/**</code>: <b>no prior notes on any of this</b>, so nothing here
re-litigates a decision you already made. <code>docs/CONTROL-FLOW-PLAN.md</code> grepped — it
never mentions exceptions, so there is no frozen contract to break.</td></tr>

<tr><td><b>Left, not blocked</b></td>
<td>Nothing implemented, deliberately. The changes the recommendation implies are: a
<code>footer</code> band in <code>blockRegion.layout.ts</code> (one fixed
<code>REGION_ARM_HEADER_PX</code> ahead of <code>REGION_PAD_BOTTOM_PX</code>); a subject strip on
the selection frame; the <code>except</code>-arm lint beside the <code>elif</code>-test lint in
<code>scene/lint.ts</code>; and pyblocks' forward pass emitting handler types from the real AST.
The first two are an afternoon <b>after</b> the branch split lands — they build on
<code>matchNode</code>, which does not exist yet.</td></tr>

<tr class="bad"><td><b>Needs you</b></td>
<td><b>One real decision: does the outcome dot exist at all?</b> Everything else follows from it.
Say yes and the handler ladder is a <code>match</code> and the grammar is paid in full; say no and
the headers are bare text and you accept that <code>except</code> is the one place the drawing
does not show what is evaluated.
<br><br><b>Default on silence: yes, as <code>state="received"</code>, never wired.</b> It is the
smaller change (it re-uses a painted state rather than adding one) and it is what makes the
handler rows legible without a legend. The three sub-decisions — footer vs band for
<code>finally</code>, one frame or two when there is no <code>finally</code>, and whether
<code>except*</code> gets a marker or is refused — each carry a reversible default above and I
would just build them that way.</td></tr>

<tr><td><b>Deliberately not done</b></td>
<td><b>No code.</b> The recommendation touches <code>blockRegion.layout.ts</code>, which a peer
lane was editing this evening (mtime checked before writing anything) and which three hosts read.
That is a lane with a committed baseline and a frozen contract, not a drive-by edit.
<br><br><b>No sixth proposal from Snap!.</b> <code>safely try</code> is the best shape found in the
whole sweep, and it is <i>already</i> the P3/P4 family — one node, stacked containers, a bound
error. Adding it as a separate option would have been padding.
<br><br><b>No review board.</b> There is nothing running to seed one from, and
<code>bbox-review-board</code> is tldraw-only — React Flow is still undecided.
<br><br><b>Nothing reopened.</b> The join stays fan-in-at-the-consumer (your 2026-09-02 V1 pick);
the ternary is still not a region; <code>break</code>/<code>continue</code> are still
<code>Badge</code> marks and <code>raise</code> joins them rather than starting a new
vocabulary.</td></tr>
</table></div>""")

    A(overall_box("the one thing to change about all five…"))
    A(dock("try-except-proposals-2026-09-22", "item", 13))
    A(f"<script>{FB_JS}</script>")
    A("</div>")
    return "".join(P)


if __name__ == "__main__":
    report_size(build(), OUT)
