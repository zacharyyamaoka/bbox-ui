#!/usr/bin/env python3
"""Build "What the bbox-ui visual language should be" — the proposal over the
eleven vocabularies, the 57 scenarios and the peer thinking piece.

    python3 docs/build_visual_grammar_proposal.py \
        --scratch <dir holding buckets.json scenarios.json img/ sbcrop/ fieldboards.json> \
        --out     /home/bam/bbox-ui/reports/visual-grammar-proposal-2026-09-23.html

Every drawing on the page is a board SPEC rendered by one of two engines:
  * FIELD boards are the vocab-boards React Flow kit's own markup, captured
    from the running app by docs/capture_grammar_field_boards.mjs (the same
    705-board renderer Zach read all day), inlined with the kit's board.css.
  * TODAY / PROPOSED boards are docs/grammar_board.py — vocab_board.py's
    layout engine (which the kit was ported from) extended with bbox-ui's
    marks — so the three columns of every triptych read as one hand.
Nothing is drawn per figure by hand; if a mark cannot be expressed in either
engine the caption says so.

Payload discipline: the page must stay under 256 KB of inlined `data:` URIs
so it belongs in the tracked reports/ half (CLAUDE.md, reports split). The
build measures and prints the number, and fails if it crosses the line.
"""
from __future__ import annotations

import argparse
import ast
import base64
import html
import io
import json
import os
import re
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import report_feedback as FB  # noqa: E402
from grammar_board import render as render_ours  # noqa: E402
from vocab_board import SHARED_CSS, SHARED_DEFS  # noqa: E402
from vocab_board import render as render_field  # noqa: E402

E = html.escape
TRUNK = "/home/bam/bbox-ui/.claude/worktrees/visual-language-reports-moc-279480/apps/storybook-basics/src"
DATA_BUDGET = 256 * 1024

# ----------------------------------------------------------------------------
# images — WebP data URIs at display width (the peer builder's rule)
# ----------------------------------------------------------------------------
_PAYLOAD = {"bytes": 0, "n": 0}


def uri(path: str, width: int | None = None, q: int = 70, crop=None) -> str:
    im = Image.open(path)
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGBA")
    if crop:
        im = im.crop(crop)
    if width and im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=q, method=6)
    out = "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
    _PAYLOAD["bytes"] += len(out)
    _PAYLOAD["n"] += 1
    return out


# ----------------------------------------------------------------------------
# Python highlighting — the syntax report's convention: source, highlighted,
# and every example goes through ast.parse at build time.
# ----------------------------------------------------------------------------
KW = r"\b(def|return|if|elif|else|for|while|in|try|except|finally|with|as|yield|del|assert|pass|break|continue|class|import|from|async|await|match|case|raise|not|and|or|lambda|global|nonlocal)\b"


# ONE pass over the escaped line: comment | string | keyword | number. Two
# passes rewrote the tags the first had injected (`class` is a keyword).
TOKEN = re.compile(r"(#.*$)|(&quot;[^&]*&quot;|'[^']*')|" + KW + r"|\b(\d+(?:\.\d+)?)\b")


def _tok(m: re.Match) -> str:
    if m.group(1):
        return f'<i class="c">{m.group(1)}</i>'
    if m.group(2):
        return f'<i class="s">{m.group(2)}</i>'
    if m.group(3):
        return f'<b class="k">{m.group(3)}</b>'
    return f'<i class="n">{m.group(4)}</i>'


def py(code: str) -> str:
    ast.parse(code)  # a proposal cannot cite Python that does not parse
    out = [TOKEN.sub(_tok, E(line)) for line in code.rstrip("\n").split("\n")]
    return '<pre class="py">' + "\n".join(out) + "</pre>"


# ----------------------------------------------------------------------------
# board helpers
# ----------------------------------------------------------------------------
def N(id, t, c, r, ins=None, outs=None, **kw):
    return {"id": id, "t": t, "c": c, "r": r, "shape": "bbox", "in": ins or [], "out": outs or [], **kw}


def W(a, b, k="cable", **kw):
    return {"a": a, "b": b, "k": k, **kw}


class Boards:
    """Collects every rendered board so a spec error fails the build loudly."""

    def __init__(self, field: dict, css: str):
        self.field = field
        self.css = css
        self.last_width = 0
        self.errors: list[str] = []
        self.count = {"ours": 0, "field-kit": 0, "field-py": 0}

    def ours(self, spec, cap="", cls=""):
        svg, err = render_ours(spec)
        for e in err:
            self.errors.append(f"{cap or spec.get('cap', '?')}: {e}")
        self.count["ours"] += 1
        return f'<figure class="bd {cls}"><div class="bdw">{svg}</div>{self._cap(cap)}</figure>'

    def field_py(self, spec, cap="", cls=""):
        svg, err = render_field(spec)
        for e in err:
            self.errors.append(f"{cap}: {e}")
        self.count["field-py"] += 1
        m = re.search(r'width="(\d+)"', svg)
        self.last_width = int(m.group(1)) if m else 0
        return f'<figure class="bd {cls}"><div class="bdw">{svg}</div>{self._cap(cap)}</figure>'

    def kit(self, board_id, cap="", cls="", maxw=None):
        """The kit's own markup, scaled down (never up) to `maxw` so a wide
        board fits its cell instead of scrolling — a transform on the board,
        so the captured pixels are the app's, only smaller."""
        b = self.field.get(board_id)
        if not b:
            self.errors.append(f"field board not captured: {board_id}")
            return f'<figure class="bd {cls}"><div class="bdw miss">missing {E(board_id)}</div>{self._cap(cap)}</figure>'
        self.count["field-kit"] += 1
        self.last_width = b["width"]
        w, h = b["width"], b["height"]
        sc = min(1.0, maxw / w) if maxw else 1.0
        src = f'<span class="src">vocab-boards {E(board_id)} · React Flow kit, captured from :5471{" · shown at %d%%" % round(sc * 100) if sc < 1 else ""}</span>'
        inner = f'<div class="vb-board" style="width:{w:.0f}px;height:{h:.0f}px;transform:scale({sc:.3f});transform-origin:0 0">{b["html"]}</div>'
        return (f'<figure class="bd {cls}"><div class="bdw"><div style="width:{w*sc:.0f}px;height:{h*sc:.0f}px;margin:0 auto;overflow:hidden">{inner}</div></div>'
                f'{self._cap(cap, src)}</figure>')

    @staticmethod
    def _cap(cap, src=""):
        if not cap and not src:
            return ""
        return f"<figcaption>{cap}{src}</figcaption>"


def fig(img, cap, src="", w=None, light=False):
    style = f' style="max-width:{w}px"' if w else ""
    return (f'<figure class="{"light" if light else ""}"><img src="{img}" alt=""{style}>'
            f'<figcaption>{cap}<span class="src">{E(src)}</span></figcaption></figure>')


# ----------------------------------------------------------------------------
# CSS — the peer report's house style, plus the proposal's own grids
# ----------------------------------------------------------------------------
CSS = """
:root{--bg:#0e0f12;--panel:#15171c;--panel2:#1b1e25;--line:#282d38;--line2:#343b49;
 --fg:#e6e8ee;--dim:#9aa3b2;--dim2:#6b7383;--accent:#f0883e;--accent2:#5aa9f8;
 --ok:#3fb950;--warn:#e5534b;--gold:#e8c06a;--purple:#bc8cff;
 --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:44px 24px 160px}
h1{font-size:40px;line-height:1.1;margin:0 0 10px;letter-spacing:-.026em}
h2{font-size:12.5px;text-transform:uppercase;letter-spacing:.15em;color:var(--dim2);margin:74px 0 14px;font-weight:600}
h3{font-size:21px;letter-spacing:-.015em;margin:0 0 8px;line-height:1.25}
h4{font-size:15px;margin:18px 0 6px}
.sub{color:var(--dim);font-size:19px;margin:0 0 24px;line-height:1.5;max-width:900px}
.kicker{font:600 11.5px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--dim2);margin:0 0 18px}
a{color:var(--accent2);text-decoration:none}a:hover{text-decoration:underline}
p{margin:0 0 12px}
code{font-family:var(--mono);font-size:.88em;background:#0a0b0e;border:1px solid #23272f;border-radius:4px;padding:1px 5px}
.n{font:600 10.5px/1 var(--mono);color:var(--dim2);vertical-align:super;margin-left:1px}
.lede{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:10px;padding:19px 23px;margin:22px 0}
.lede p:last-child{margin:0}.lede.blue{border-left-color:var(--accent2)}.lede.gold{border-left-color:var(--gold)}
.lede.green{border-left-color:var(--ok)}.lede.red{border-left-color:var(--warn)}.lede.purple{border-left-color:var(--purple)}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:24px 0}
.fact{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:13px 15px}
.fact b{display:block;font:700 25px/1.1 var(--mono);color:var(--accent);letter-spacing:-.02em}
.fact span{display:block;color:var(--dim2);font-size:11.5px;margin-top:6px;line-height:1.35}
.nav{position:sticky;top:0;z-index:20;background:rgba(14,15,18,.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);margin:0 -24px;padding:11px 24px;display:flex;gap:6px;flex-wrap:wrap}
.nav a{font:600 11px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--dim2);border:1px solid var(--line);border-radius:20px;padding:6px 10px}
.nav a:hover{color:var(--fg);border-color:var(--line2);text-decoration:none}
.card{border:1px solid var(--line);border-radius:12px;background:#111318;margin:0 0 22px;padding:20px 22px 16px}
.card .tag{font:600 10px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;border-radius:20px;padding:5px 9px;border:1px solid var(--line2);color:var(--dim);display:inline-block;margin:0 8px 10px 0}
.card.fix .tag{color:var(--warn);border-color:#4d2320}.card.unify .tag{color:var(--accent2);border-color:#1f3a5a}
.card.sketch .tag{color:var(--gold);border-color:#4a3c1c}.card.name .tag{color:var(--ok);border-color:#1d4429}
.two{display:grid;grid-template-columns:1.15fr 1fr;gap:20px;align-items:start}
.three{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;align-items:start}
.figs{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin:12px 0 6px}
.figs.figs2{grid-template-columns:repeat(2,1fr)}
figure{margin:0;background:#0b0d11;border:1px solid var(--line);border-radius:9px;padding:8px;overflow:hidden}
figure img{display:block;max-width:100%;height:auto;border-radius:5px;margin:0 auto}
figure.light img{background:#fff}
figcaption{color:var(--dim2);font-size:11.3px;line-height:1.5;margin:8px 2px 0}
figcaption b{color:var(--dim);font-weight:600}
figcaption .src{display:block;font:10px/1.5 var(--mono);color:#4e5563;word-break:break-all;margin-top:3px}
.kv{width:100%;border-collapse:collapse;font-size:13.2px;margin:10px 0 6px}
.kv th{text-align:left;color:var(--dim2);font:600 10.5px/1.4 var(--mono);letter-spacing:.08em;text-transform:uppercase;padding:6px 8px;border-bottom:1px solid var(--line2)}
.kv td{padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top;color:var(--dim)}
.kv td:first-child{color:var(--fg);font-weight:600}
.kv tr.hi td{color:var(--fg)}.kv tr.stock td{color:var(--dim);background:#0c0e12}
.kv code{white-space:nowrap}
details{border:1px solid var(--line);border-radius:9px;padding:10px 14px;margin:14px 0}
summary{cursor:pointer;color:var(--dim);font-size:13px}
.q{border:1px solid var(--line2);border-radius:10px;padding:14px 16px;margin:0 0 14px;background:var(--panel)}
.q b.t{display:block;font-size:15px;margin-bottom:4px}
.q .rec{color:var(--fg)}.q .def{color:var(--dim);font-size:13px;margin-top:6px}.q .def b{color:var(--gold)}
.fb textarea.hidden{display:none}
.foot{margin-top:80px;padding-top:22px;border-top:1px solid var(--line);color:var(--dim2);font-size:12.5px}
ol.src{font-size:12.5px;color:var(--dim);line-height:1.7;padding-left:22px}
ol.src code{font-size:.85em}
ul{margin:0 0 12px;padding-left:20px}li{margin:0 0 5px}
@media (max-width:900px){.two,.three,.trip{grid-template-columns:1fr}}
/* --- boards ------------------------------------------------------------- */
figure.bd{padding:6px 6px 8px}
.bdw{overflow:auto;background:var(--bg);border-radius:5px;padding:2px}
.bdw svg.bd{display:block;max-width:100%;height:auto}
.bdw .vb-board{margin:0 auto;max-width:100%}
.bdw.miss{color:var(--warn);font:12px var(--mono);padding:20px}
.trip{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:14px 0 8px;align-items:start}
.trip>div{min-width:0}.bdw{min-width:0}
.trip.wide{grid-template-columns:1fr 1fr}.trip.wide .fcell{grid-column:1/-1}
.trip figure.bd{min-height:120px}
.col{font:600 10px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--dim2);margin:0 0 8px}
.col.f{color:var(--accent2)}.col.t{color:var(--dim)}.col.p{color:var(--accent)}
/* --- the grammar sheet -------------------------------------------------- */
.gram{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px;margin:14px 0 6px}
.g{background:#101217;border:1px solid var(--line);border-radius:10px;padding:10px 12px 10px;min-height:150px}
.g .gv{background:var(--bg);border-radius:6px;padding:4px;margin:0 0 8px;min-height:74px;display:flex;align-items:center;justify-content:center}
.g .gv svg{max-width:100%;height:auto;display:block}
.g b{display:block;font-size:13.5px;margin:0 0 3px}
.g .m{color:var(--dim);font-size:12px;line-height:1.45}
.g .not{color:var(--dim2);font-size:11.3px;margin-top:5px;line-height:1.4}
.g .not::before{content:"not ";color:var(--warn);font:600 10px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;margin-right:3px}
.g .st{font:600 9.5px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;border-radius:12px;padding:3px 7px;border:1px solid var(--line2);color:var(--dim2);float:right;margin:2px 0 0 6px}
.g .st.new{color:var(--accent);border-color:#5a341a}.g .st.exists{color:var(--ok);border-color:#1d4429}.g .st.sketch{color:var(--gold);border-color:#4a3c1c}
.gramrow{font:600 10.5px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--dim2);margin:26px 0 0}
/* --- python ------------------------------------------------------------- */
pre.py{background:#0a0b0e;border:1px solid #23272f;border-radius:8px;padding:11px 14px;font:12.4px/1.55 var(--mono);color:#d7dce5;overflow:auto;margin:0 0 12px;white-space:pre}
pre.py .k{color:#f0883e;font-weight:600}pre.py .s{color:#3fb950;font-style:normal}pre.py .c{color:#6b7383}pre.py .n{color:#bc8cff;font-style:normal;font-size:inherit;vertical-align:baseline;margin:0}
.chg{display:grid;grid-template-columns:minmax(260px,.9fr) 1.1fr;gap:18px;align-items:start;margin:8px 0 10px}
.chg .meta{font-size:13.2px;color:var(--dim)}.chg .meta b{color:var(--fg)}
.chg .meta dl{margin:8px 0 0}.chg .meta dt{font:600 10px/1.6 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--dim2);margin-top:8px}.chg .meta dd{margin:0;line-height:1.5}
.rank{display:inline-block;font:800 15px/28px var(--mono);width:28px;height:28px;border-radius:7px;background:var(--accent);color:#0c0d10;text-align:center;margin:0 10px 0 0;vertical-align:middle}
.buys{color:var(--fg);font-size:14px;margin:0 0 10px}
.opts{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:10px 0 6px}
.opt{border:1px solid var(--line);border-radius:10px;padding:10px;background:#0f1116}
.opt.pick{border-color:#5a341a;box-shadow:inset 0 0 0 1px #5a341a}
.opt .oh{font:600 11px/1.3 var(--mono);color:var(--dim);margin:0 0 6px}.opt.pick .oh{color:var(--accent)}
.opt .oh i{font-style:normal;color:var(--dim2);font-weight:400}
.opt p{font-size:12.3px;color:var(--dim);margin:8px 0 0;line-height:1.45}
.stay{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:10px 0}
@media (max-width:900px){.stay,.opts,.chg,.gram{grid-template-columns:1fr}}
"""

# ----------------------------------------------------------------------------
# Sources — every bare number in the text points here
# ----------------------------------------------------------------------------
SOURCES = [
    # 1
    ("bbox-ui against the field — the peer thinking piece this proposes FROM: the 57-row map (21 / 18 / 15 / 3), the four 'behind' items, the two unseen observations, Q1–Q6", "/home/bam/bbox-ui/reports/media/bbox-ui-vs-the-field-2026-09-23.html"),
    # 2
    ("57 Python scenarios × 235 mechanisms, the bucket names and members used for every 'field' figure", "scratchpad: buckets.json · apps/vocab-boards/src/boards.json"),
    # 3
    ("The 57 scenarios and bbox-ui's own drawing rule for each (the Python examples below are its examples, or written in its idiom and ast-parsed at build)", "/home/bam/bbox-ui/reports/python-syntax-scenarios-2026-09-23.html · scratchpad: scenarios.json"),
    # 4
    ("Daily note, 2026-09-23 — the view rules ('Regions of code don't actually explicitly define the API', 'we never want random wires going into a block without a pin id') and the [!ai] callout answering them (granularity × footprint; the 20-derived-ports failure; the four wall states; 'same size AND same seats')", "/home/bam/zach_brain/Sources/Daily Notes/Daily Note - Sep 23 2026.md"),
    # 5
    ("CLAUDE.md — the settled rules: core imports no engine; control flow is never a cable; a region is ONE node, the corner card owns the id, the frame owns no id; arms are nodes; break/continue/pass are marks", "/home/bam/bbox-ui/.claude/worktrees/visual-language-reports-moc-279480/CLAUDE.md"),
    # 6
    ("Control-flow plan — §0 the six lines; §2.B opaque is a projection; §4 the stock-part table this one extends; §9 Q1/Q2/Q7", "/home/bam/bbox-ui/.claude/worktrees/visual-language-reports-moc-279480/docs/CONTROL-FLOW-PLAN.md"),
    # 7
    ("components/blockPort.layout.ts:45 — `BlockView = \"simple\" | \"port\" | \"expanded\"`, `BLOCK_VIEWS`; no footprint axis on a Block", f"{TRUNK}/components/blockPort.layout.ts:45"),
    # 8
    ("components/blockRegion.tsx:150-180 — `RegionKind = loop | branch | group`, `RegionView = expanded | opaque | port`, `RegionOpaqueFace = card | frame`, `RegionHeaderStyle`; `RegionArm`, `RegionHeaderChips`, `RegionCornerCard`", f"{TRUNK}/components/blockRegion.tsx:150"),
    # 9
    ("hosts/regionScene.ts:14-21 — `RegionView`, `RegionPresentation` ('regions do not have a simple view', Zach 2026-09-22), `setRegionView` writes one field", f"{TRUNK}/hosts/regionScene.ts:14"),
    # 10
    ("scene/regionView.ts — `projectOpaqueRegions`: the opaque face as a projection; calls `promoteBoundary` with NO `geometryOf`/`box`, so `t` is never set (seats scramble)", f"{TRUNK}/scene/regionView.ts:139"),
    # 11
    ("scene/boundary.ts — `classifyBoundary`, `promoteBoundary`, `PromotedPort {id, side, direction, seat, band, t?, inner, outer, edgeIds, portType, by}`, `dagPolarityPolicy`, `crossingGeometryPolicy` (needs `box` + `geometry`, sets `t`, `by: \"geometry\"`); promotion keyed by `portKey(inner.nodeId, inner.portId)`", f"{TRUNK}/scene/boundary.ts:325"),
    # 12
    ("components/blockRegion.crossings.ts — `wallCrossings(path, frame)`: the frame-local point where each cable crosses; Liang–Barsky via elbow/boundaryCrossing.ts; ring within 1.5px of the painted cable", f"{TRUNK}/components/blockRegion.crossings.ts:41"),
    # 13
    ("scene/linking.ts — `definitionBadge` → `Draft n`; exports `commitDefinitionName`, `setDefinitionData`, `unlinkOccurrence`, `duplicateNodeUnlinked`, `deleteNode`, `reconcileDefinitions`; no repair verb", f"{TRUNK}/scene/linking.ts:174"),
    # 14
    ("editor/breadcrumb.tsx — a stock shadcn Breadcrumb, no plane stack behind it; `scene/region.ts` `descendantsOf` / `absolutePosition` / `ancestorsOf` are the walks a re-root needs", f"{TRUNK}/editor/breadcrumb.tsx · {TRUNK}/scene/region.ts"),
    # 15
    ("scene/controlFlow.ts — `ARM_NODE_TYPE`, `armsOf`, `bodyChildrenOf`, `hiddenSummary`, `describeHidden` ('2 blocks · 2 arms · 3 edges hidden')", f"{TRUNK}/scene/controlFlow.ts"),
    # 16
    ("components/controlMark.tsx — `CONTROL_MARK_KINDS = [break, continue, pass]`, a `Badge` with `data-slot=\"control-mark\"`, no port, no edge", f"{TRUNK}/components/controlMark.tsx"),
    # 17
    ("components/sideEffectMarks.tsx, returnDividerMarks.tsx, originBadge.tsx, traceBadge.tsx, traceMark.tsx, traceTerminal.tsx — the marks that already exist: divider tick, `MutationLineMark`, `ReturnDividerMark`, `OriginBadge` (pseudo/synced/drifted/orphaned), `TraceBadge`, `TraceMark`, `TraceTerminal`", f"{TRUNK}/components/"),
    # 18
    ("components/trace.layout.ts — `TRACE_VARIANTS = [data, async, delayed]`, `DEFAULT_TRACE_MARKER_END = \"none\"`, `DEFAULT_TRACE_ROUTING = \"elbow\"`, `ASYNC_PACKET_DASHARRAY`", f"{TRUNK}/components/trace.layout.ts:72"),
    # 19
    ("scene/region.branch.ts — Q1/V1: a branch's corner card writes `ports: {left: conditions}` and never a right wall; `ifElifElseArms`, `matchCaseArms`", f"{TRUNK}/scene/region.branch.ts:16"),
    # 20
    ("scene/lint.ts — `LintRuleId = dangling-edge | cycle | duplicate-edge | many-to-one | self-connection | type-mismatch | polarity`, `LINT_RULES`, `lintScene`", f"{TRUNK}/scene/lint.ts:182"),
    # 21
    ("skin/regionVariants.ts — `REGION_VARIANT_IDS v1…v10`, the arm drawings; v8 'top rule' is the one Zach picked ('add the top line on the top arm', 2026-09-20)", f"{TRUNK}/skin/regionVariants.ts:50"),
    # 22
    ("PROJECT - Black Box UI — 'everything is a block and input output port'; 'control flow is not a card' (Sept 19); 'nesting shows the issues with the card design, its just to many lines'", "/home/bam/zach_brain/Projects/bbox-ui/PROJECT - Black Box UI.md"),
    # 23
    ("PROJECT - pyblocks — 'A small compact visual language'; 'clean minimal design, not a lot of gutters'; 'rows to split parallel work… left to right (time), top to down (different paths)'; 'Lots of learnings from lab view'", "/home/bam/zach_brain/Projects/pyblocks/PROJECT - pyblocks.md"),
    # 24
    ("Node-editor prior-art sweep — collapse is two bounds + one boolean in six implementations (maxGraph `Geometry.alternateBounds` + `foldCells`); drill-in is a plane swap; boundary node inside in 7 of 11; Houdini locked / unlocked / Match Current Definition", "/home/bam/bbox-ui/reports/node-editor-prior-art-sweep-2026-09-17.html · /home/bam/bbox-ui/reports/sweep-answers-2026-09-18.html"),
    # 25
    ("Region drawings — painted lines at 1/2/3 levels of nesting: v8 5/10/15, v7 7/14/21", "/home/bam/bbox-ui/reports/media/region-drawings-2026-09-19.html"),
    # 26
    ("Region wall crossing — Option 1 the hollow ring, Option 2 the derived wall port; Q3 'ports only on outbound crossings'", "/home/bam/bbox-ui/reports/media/region-wall-crossing-2026-09-22.html"),
    # 27
    ("Twenty ways to beat the prior art — the sibling report on the user-complaint corpus (openness derived from a line budget; the `Crossed` fifth origin state). Different axis; consistent with this one", "/home/bam/bbox-ui/reports/visual-grammar-improvements-2026-09-23.html"),
    # 28
    ("Storybook captures — Zach's running :5421, read-only, captured today by the peer builder (story ids in each caption)", "http://127.0.0.1:5421/iframe.html?id=<story>&viewMode=story"),
    # 29
    ("vocab-boards — the React Flow kit whose captured markup is every 'field' board here; docs/capture_grammar_field_boards.mjs", "/home/bam/bbox-ui/.claude/worktrees/visual-language-reports-moc-279480/apps/vocab-boards · http://127.0.0.1:5471/?board=<id>"),
    # 30
    ("The eleven vocabularies' own documentation, adversarially checked (vendor screenshots carry the doc URL the sheet cites)", "scratchpad: sheets.json · digest.md"),
    # 31
    ("C - Branch Region Asymmetry (Scopes See In, Only Yields Come Out) — input borders are transparent, output borders are φ-nodes", "/home/bam/zach_brain/World Model/Chunks & Concepts/C - Branch Region Asymmetry (Scopes See In, Only Yields Come Out).md"),
    # 32
    ("Grain 1 is the ceiling — a block is a definition, never a statement; measure_grain: 15.7% of BAM core functions are operator-heavy", "/home/bam/.claude/projects/-home-bam-bbox-ui/memory/grain-1-is-the-ceiling-for-block-views.md · docs/build_bbox_vs_field_report.py"),
    # 33
    ("hosts/pyblocksScene.ts — `loadPyblocksScene`: the one place scenes arrive from the file; `withoutRegionViewState` drops view state, so view is client-owned", f"{TRUNK}/hosts/pyblocksScene.ts"),
]


def cite(*ns):
    return '<span class="n">' + ",".join(str(n) for n in ns) + "</span>"


# ============================================================================
# THE BOARDS
# ============================================================================
def grammar_cards(B: Boards):
    """§1 — the reference sheet. Each card: a small board, a name, what the
    mark means, what it is NOT, and whether it exists / is new / is a sketch."""
    cards = []

    def card(svg_html, name, meaning, not_, status="exists"):
        cards.append(f'<div class="g"><span class="st {status}">{status}</span><div class="gv">{svg_html}</div><b>{name}</b>'
                     f'<div class="m">{meaning}</div><div class="not">{not_}</div></div>')

    def row(title):
        cards.append(f'<div class="gramrow" style="grid-column:1/-1">{title}</div>')

    row("Nouns — three things exist on a board")
    card(render_ours({"nodes": [N("b", "estimate()", 0, 0, ["frame", "gain"], ["pose"], state={"frame": "wired", "gain": "value"})]})[0],
         "Block", "A definition (grain 1). A header naming it, inputs on the left wall, outputs on the right, a footer when it has something to say.",
         "a statement, an expression, an operator. Those are labels on a node or on a cable, never a box.")
    card(render_ours({"nodes": [N("a", "decode()", 0, 0, [], ["frame"]), N("b", "estimate()", 1, 0, ["frame"], ["pose"])],
                      "wires": [W("a.out.frame", "b.in.frame")]})[0],
         "Port", "A named point on a wall where exactly one kind of thing happens: a value enters (left) or leaves (right). The dot is hollow until wired.",
         "a coloured type (the type is printed on the label), a tunnel, a pin on a frame.")
    card(render_ours({"nodes": [N("a", "load()", 0, 0, [], ["rows"]), N("b", "tabulate()", 1, 0, ["rows"], ["table"]), N("c", "plot()", 1, 1, ["rows"], ["chart"])],
                      "wires": [W("a.out.rows", "b.in.rows"), W("a.out.rows", "c.in.rows")]})[0],
         "Cable", "The one line kind. A value, from one output to one input; fan-out is N cables off one port. Grey, elbow-routed, no arrowhead — direction is which wall it touches.",
         "an execution wire, a control line, a message token. Nothing runs along a cable.")

    row("Structure — two ways blocks contain blocks")
    card(render_ours({"nodes": [N("m", "merge()", 0, 0, ["pose", "other"], ["Pose"])],
                      "frames": [{"id": "l", "style": "region", "corner": {"t": "For Loop", "in": ["Iterable"], "out": ["Iter"]}, "members": ["m"], "toggle": True}],
                      "wires": [W("l.cout.Iter", "m.in.other")]})[0],
         "Region", "A Block wearing a frame. The corner card IS the block — it owns the id and every port; the frame is scope only and owns nothing. Kinds: loop, branch, group; proposed: try, with.",
         "a frame with ports on its wall. A tunnel wall is LabVIEW's; the wall here has no id.")
    card(render_ours({"nodes": [N("a", "estimate()", 0, 0, ["frame"], ["pose"]), N("b", "fallback()", 0, 1, ["frame"], ["pose"])],
                      "frames": [{"id": "br", "style": "region", "corner": {"t": "Branch", "in": ["fast"]}, "members": ["a", "b"], "toggle": False,
                                  "arms": [{"t": "if fast:", "members": ["a"]}, {"t": "else:", "members": ["b"]}]}]})[0],
         "Arm", "A stacked row inside a region, one per suite: `if fast:` · `else:` · `case 'go':` · `except Timeout:`. A top rule and a fold chevron; every arm visible at once. Arms are nodes, so folding one never moves a sibling's blocks.",
         "a card (Zach: 'control flow is not a card'); a tab that hides the other arms; a cable between arms.")
    card(render_ours({"nodes": [N("a", "step()", 0, 0, ["state"], ["next"]), N("b", "check()", 1, 0, ["next"], [], marks=["break"])],
                      "wires": [W("a.out.next", "b.in.next")]})[0],
         "Mark", "Paint that carries no value: a badge on a block, a pill on a cable, a tick on a wall. `break` · `continue` · `pass` · `mut` · `z⁻¹` · `iteration 3 of 7` · `edited`. A mark has no port, so nothing can wire to it.",
         "a cable, a terminal, a node. If it could be wired it would be a port.")

    row("The wall — four states, from nothing to declared")
    card(render_ours({"nodes": [N("a", "load()", 0, 0, [], ["rows"]), N("b", "tabulate()", 1, 0, ["rows"], ["t"])],
                      "frames": [{"id": "g", "style": "region", "corner": {"t": "For Loop", "in": ["Iterable"]}, "members": ["b"], "rings": True, "toggle": False}],
                      "wires": [W("a.out.rows", "b.in.rows")]})[0],
         "Crossing ring", "Expanded region: a cable enters straight to the member; a hollow ring marks WHERE it crosses the frame. Positional, no id — the entry point is kept, no pin is minted.",
         "an input tunnel. This is the wall state that keeps 'no input ports in expanded' honest.")
    card(render_ours({"nodes": [N("b", "Branch", 0, 0, ["mode", "frame"], ["pose"], shape="opaque", region=True, pstate="derived", state={"mode": "wired"}, fw=180, fh=96, hidden="3 blocks · 3 arms hidden")]})[0],
         "Derived port", "Port / opaque region: a port that exists ONLY because a cable crossed. Proposed: one per variable (not per producer), renameable, seated where its cable crossed. The dashed halo says 'derived'.",
         "declared. Delete the crossing and it vanishes; a function's port stays.", "new")
    card(render_ours({"nodes": [N("b", "Planner", 0, 0, shape="simple", nin=3, nout=2, fw=130, fh=64)]})[0],
         "Collapsed dot", "Simple face: one dot per wall standing for N pins — and it says which (`data-collapsed-ports=\"pose,gain,reset\"`). Every cable still ends on a dot; simple is the many-to-one case, not the lawless one.",
         "an exception to the pin-id rule. There is none.")
    card(render_ours({"nodes": [N("b", "estimate()", 0, 0, ["frame: Frame", "gain: float"], ["pose: Pose"], state={"gain": "value"})]})[0],
         "Declared port", "Function block: drawn whether wired or not. `name: Type` printed on the label — ink, never colour. A grey-filled dot is a default the definition owns (F13).",
         "coloured by type (Unreal/Unity/Blender/LabVIEW); a widget growing out of the port.")

    row("Cables — one kind, three dressings")
    card(render_ours({"nodes": [N("a", "load()", 0, 0, [], ["cfg"]), N("b", "scale()", 1, 0, ["gain"], ["out"])],
                      "wires": [W("a.out.cfg", "b.in.gain", t=".gain")]})[0],
         "Named cable", "A binding names a cable and adds no box (V2 — Simulink alone). An attribute path elides onto it (V6 `.gain`). Introducing or removing a name changes no block, port or edge.",
         "a SET/GET pair, a pass-through node, twin name tags with the cable erased.")
    card(render_ours({"nodes": [N("m", "merge()", 0, 0, ["pose"], ["Pose"])],
                      "wires": [W("m.out.Pose", "m.in.pose", "delayed", t="z⁻¹")]})[0],
         "Delayed cable", "The one backwards cable: loop-carried state, dotted, wearing z⁻¹ (LabVIEW's shift register and Simulink's 1/z at once). Always drawn inside a region.",
         "a control loop-back; a Set/Get pair hiding the carry (Unreal, Unity, Node-RED, n8n, Houdini).")
    card(render_ours({"nodes": [N("a", "queue", 0, 0, [], ["q"], shape="bbox"), N("b", "push()", 1, 0, ["q", "item"], [], top=["mut q"])],
                      "wires": [W("a.out.q", "b.in.q"), W("b.top.mut q", "a.out.q", "mut")]})[0],
         "Mutation line", "Receiver mutation (F7): a top-wall effect port and a dotted red line back to what changed, badged `mut`. State in on the left, the effect on top — never a second data cable pretending to be a new value.",
         "an object-in/object-out pair (6 of 11). The receiver did not become a new value.")

    row("Views — a camera, not the document (granularity × footprint)")
    card(render_ours({"nodes": [N("s", "Planner", 0, 0, shape="simple", nin=3, nout=2, fw=96, fh=58), N("p", "Planner", 1, 0, ["pose", "gain"], ["cmd"], fw=96), N("x", "Planner", 2, 0, ["pose", "gain"], ["cmd"], fw=96, fh=74, body=["scale()", "solve()"])]})[0],
         "Granularity: simple · port · expanded", "How much of the inside is on screen, monotone. Blocks have all three; regions have port and expanded only (no simple — Zach, 2026-09-22). Source is the other side of the round trip, not a rung.",
         "a fourth 'value' rung (there isn't one); a grain slider.")
    card(render_ours({"nodes": [N("p", "Planner", 0, 0, ["pose", "gain"], ["cmd"], fw=96), N("o", "Planner", 1, 0, ["pose", "gain"], ["cmd"], shape="opaque", fw=126, fh=92, hidden="2 members hidden")],
                      "ghosts": [{"around": "p", "w": 126, "h": 92, "t": "hug"}]})[0],
         "Footprint: hug · hold", "Does the box keep its expanded size when its inside is hidden? Opaque = port's content at expanded's footprint — same size AND same seats. Today regions have it; proposed: Blocks too.",
         "a fourth granularity. Hold at port content is the whole definition of opaque.", "new")
    card(render_ours({"breadcrumb": ["module", "run()", "estimate()"], "nodes": [N("a", "scale()", 0, 0, ["frame"], ["scaled"]), N("b", "solve()", 1, 0, ["scaled"], ["pose"])],
                      "frames": [{"id": "e", "style": "region", "corner": {"t": "estimate()", "in": ["frame"], "out": ["pose"]}, "members": ["a", "b"], "toggle": False}],
                      "wires": [W("e.cin.frame", "a.in.frame"), W("a.out.scaled", "b.in.scaled"), W("b.out.pose", "e.cout.pose")]})[0],
         "Plane: the root of the lens", "Drill-in re-roots the projection at one definition and gives its expanded face the whole board; the breadcrumb is the definition path. No document state, no treeStack — the file is canonical and the graph re-derives.",
         "sentinel Group Input / Output nodes; a copy of the body; a second geometry saved anywhere.", "new")

    row("Laws — what the axes of the board mean")
    card(render_ours({"nodes": [N("a", "log()", 0, 0, ["frame"], []), N("b", "save()", 0, 1, ["frame"], [])],
                      "frames": [{"id": "d", "style": "region", "corner": {"t": "run()", "in": ["frame"]}, "members": ["a", "b"], "toggle": False, "ruled": False,
                                  "arms": [{"t": "1", "members": ["a"], "dim": True}, {"t": "2", "members": ["b"], "dim": True}]}],
                      "wires": [W("d.cin.frame", "a.in.frame"), W("d.cin.frame", "b.in.frame")]})[0],
         "Left→right is data; top→down is order", "Horizontal position is dataflow (time in the dataflow sense). Vertical position inside an expanded region is SOURCE ORDER, derived, never dragged — so two effect-only calls with no cable between them still read in the order they run (F9 / V13).",
         "an execution cable (the imperative pair's answer); Max's hazard (position-as-order with a user who drags). The file is what makes the third answer safe.", "new")
    card(render_ours({"nodes": [N("a", "read()", 0, 0, [], ["x"]), N("b", "write()", 1, 0, ["x"], [], xin=True)],
                      "wires": [W("a.out.x", "b.in.x"), {"a": "a.out.x", "b": "b.xin", "k": "exec", "cross": True}]})[0],
         "Never", "No execution wire. No control cable. No sentinel nodes inside a definition. No box for a name. No tunnel on a frame wall. No colour-as-type. Every one of these is a field mechanism the rules above already exclude.",
         "open. These are the closed doors that make the vocabulary small.")
    return '<div class="gram">' + "".join(cards) + "</div>"


# ----------------------------------------------------------------------------
# §2 the changes — each drawn three ways
# ----------------------------------------------------------------------------
def changes(B: Boards, shots: dict):
    out = []

    def change(rank, kind, title, buys, code, field, today, proposed, cost, files, fbnote="", extra="", wide=False):
        out.append(f'''<div class="card {kind}" id="c{rank}">
<span class="tag">{E(kind)}</span>
<h3><span class="rank">{rank}</span>{title}</h3>
<p class="buys">{buys}</p>
<div class="chg"><div>{code}</div><div class="meta">{extra}</div></div>
<div class="trip{" wide" if wide else ""}">
 <div class="fcell"><div class="col f">the field</div>{field}</div>
 <div><div class="col t">bbox-ui today</div>{today}</div>
 <div><div class="col p">proposed</div>{proposed}</div>
</div>
<div class="chg"><div class="meta"><dl><dt>cost</dt><dd>{cost}</dd></dl></div><div class="meta"><dl><dt>files it touches</dt><dd>{files}</dd></dl></div></div>
{FB.strip(rank, re.sub("<[^>]+>", "", title), noun="change")}
</div>''')

    # --- 1 · footprint -------------------------------------------------------
    code = py('''def build_report(rows, window):
    table = tabulate(rows)
    chart = plot(table, window)
    return render(table, chart)

report = build_report(load(), 30)
send(report)''')
    field = B.field_py({"nodes": [
        {"id": "c", "t": "build_report", "c": 0, "r": 0, "shape": "box", "in": ["rows", "window"], "out": ["report"], "accent": "data", "tag": "collapsed: the node keeps its place"},
        {"id": "n", "t": "alternateBounds — the expanded box, remembered", "c": 0, "r": 1, "shape": "note"}],
        "frames": [{"id": "alt", "style": "dashed", "members": ["c", "n"], "t": "Geometry"}]},
        cap="<b>maxGraph / diagram-js / Blender / Houdini / Simulink:</b> collapse is <code>foldCells()</code> + <code>Geometry.alternateBounds</code> — one geometry, two bounds, one boolean; six independent implementations, and nothing ever mints a second object." + cite(24, 1))
    today = B.ours({"nodes": [N("l", "load()", 0, 0, [], ["rows"]), N("b", "build_report", 1, 0, ["rows", "window"], ["report"], fw=118), N("s", "send()", 2, 0, ["report"], [])],
                    "wires": [W("l.out.rows", "b.in.rows"), W("b.out.report", "s.in.report")],
                    "ghosts": [{"around": "b", "w": 176, "h": 132, "t": "the expanded box was here"}]},
                   cap="<b>Today:</b> <code>BlockView</code> is <code>simple | port | expanded</code> and nothing else" + cite(7) + ". Going expanded → port SHRINKS the block and every neighbour reflows — the one thing the opaque face exists to prevent, available to regions only" + cite(9, 4) + ".")
    proposed = B.ours({"nodes": [N("l", "load()", 0, 0, [], ["rows"]), N("b", "build_report", 1, 0, ["rows", "window"], ["report"], shape="opaque", fw=200, fh=132, hidden="3 members · 3 edges hidden", chips=[{"t": "hold", "tone": "blue"}]), N("s", "send()", 2, 0, ["report"], [])],
                       "wires": [W("l.out.rows", "b.in.rows"), W("b.out.report", "s.in.report")]},
                      cap="<b>Proposed:</b> a second axis on every Block — <code>footprint: \"hug\" | \"hold\"</code>. Opaque = port's content at hold. Nothing around it moves; the footer states what is hidden (<code>describeHidden</code>)" + cite(15) + ". The seats survive too: derived ports land where their cable crossed (<code>wallCrossings</code> → <code>crossingGeometryPolicy</code>)" + cite(12, 11, 4) + ".")
    change(1, "fix", "Give a Block the footprint flag — opaque for functions, and the same seats",
           "Buys the in-place bet its missing half: a 200-line function you collapse to check its signature must not move its neighbours. The field pays for the same thing with two bounds and a boolean; this is that, arriving late." + cite(1, 24),
           code, field, today, proposed,
           "One type change (<code>BlockFootprint</code> beside <code>BlockView</code>), the held box drawn by the same <code>opaque</code> face <code>BlockRegion</code> already paints, and one seam: pass <code>box</code> + <code>geometryOf</code> into <code>promoteBoundary</code> from <code>projectOpaqueRegions</code> so <code>t</code> is set (<code>by: \"geometry\"</code>). Both ends exist; today they are not connected" + cite(10, 11, 12) + ". ~150 lines, one lane, behind the existing acceptance tests.",
           "<code>components/blockPort.layout.ts</code> (the axis), <code>components/blockPort.tsx</code> (the held face), <code>hosts/nodeViews.tsx</code>, <code>scene/regionView.ts:139-150</code> (the seam), a <code>BlockPort</code> story `Footprint` and a <code>Views</code> story for the seats.",
           extra=f'<p><b>Why it ranks first.</b> The peer report\'s strongest convergence and the daily note\'s own callout §3 ("the missing sixth face… a one-word change to a type")' + cite(1, 4) + '. And it is the precondition for the sibling report\'s #1 (faces computed from a line budget), which needs a face that holds its box to be safe to compute' + cite(27) + '.</p>'
                 + fig(shots["opaque"], "<b>Today, for real:</b> the Block's Expanded Opaque face is a hit-region story only — painted, with no <code>BlockView</code> field carrying it, so nothing in the scene holds the box.", "story components-blocks-blockport-hit-regions--expanded-opaque · :5421 read-only capture", w=330))

    # --- 2 · derived ports ---------------------------------------------------
    code = py('''if mode == "fast":
    pose = estimate(frame)
elif cached:
    pose = lookup(frame)
else:
    pose = fallback(frame)
encode(pose)''')
    field = B.kit("C1__b1__ex1", maxw=330, cap="<b>LabVIEW:</b> the Case Structure's output tunnel is ONE square on the wall for one variable, and it must be wired in every case — the φ join, drawn. (The input tunnels are the half NI's own users complain about.)" + cite(2, 30, 31))
    today = B.ours({"nodes": [N("d", "decode()", 0, 0, ["raw"], ["frame"]),
                              N("br", "Branch", 1, 0, ["mode", "estimate/frame", "lookup/frame", "fallback/frame"], ["estimate/pose", "lookup/pose", "fallback/pose"], shape="opaque", region=True, pstate="derived", state={"mode": "wired"}, fw=262, fh=150, hidden="3 blocks · 3 arms · 6 edges hidden"),
                              N("e", "encode()", 2, 0, ["pose"], ["bytes"])],
                    "wires": [W("d.out.frame", "br.in.mode"), W("d.out.frame", "br.in.estimate/frame"), W("d.out.frame", "br.in.lookup/frame"), W("d.out.frame", "br.in.fallback/frame"),
                              W("br.out.estimate/pose", "e.in.pose"), W("br.out.lookup/pose", "e.in.pose"), W("br.out.fallback/pose", "e.in.pose")]},
                   cap="<b>Today:</b> <code>promoteBoundary</code> groups by INNER endpoint (<code>portKey(inner.nodeId, inner.portId)</code>), so one variable produced in three arms mints three derived outputs, named by producer, in authoring order — 'imagine 20 cases' arriving through the derived-port rule" + cite(11, 10, 4) + ". And the inputs got promoted too, which is exactly LabVIEW's input-tunnel half" + cite(26) + ".")
    proposed = B.ours({"nodes": [N("d", "decode()", 0, 0, ["raw"], ["frame"]),
                                 N("br", "Branch", 1, 0, ["mode", "frame"], ["pose"], shape="opaque", region=True, pstate="derived", state={"mode": "wired"}, fw=200, fh=150, hidden="3 blocks · 3 arms hidden", psub={"pose": "∂ join of 3"}),
                                 N("e", "encode()", 2, 0, ["pose"], ["bytes"])],
                       "wires": [W("d.out.frame", "br.in.mode"), W("d.out.frame", "br.in.frame"), W("br.out.pose", "e.in.pose")]},
                      cap="<b>Proposed:</b> promote by VARIABLE on the output side — the three producers of <code>pose</code> become one derived port, renameable (its label is data on the region, keyed to the variable, not to a producer), seated where the cable crossed. Inputs: one derived port per outer value (<code>frame</code>), never per consumer" + cite(31, 26, 4) + ".")
    change(2, "fix", "Derived ports: one per variable, renameable, seated where the cable crossed",
           "Buys regions an interface that is an object, not an accident of which wires crossed. Your 2026-09-23 rule makes derived ports a region's ONLY interface, so this is where 'behind' bites hardest: a port that is the whole interface and cannot be named is worse than the field's position, not lighter" + cite(1, 4) + ".",
           code, field, today, proposed,
           "A promotion key option on <code>promoteBoundary</code> (<code>groupBy: \"inner\" | \"value\"</code> — the value key is the outer endpoint on inputs and the bound name on outputs, which pyblocks hands over); <code>PromotedPort.label</code> plus a <code>data.derivedNames</code> map on the region and a <code>renameDerivedPort</code> verb in <code>hosts/regionScene.ts</code>; the seat seam from change 1. ~250 lines, one lane. Keying the rename to the variable (not the port id) is what lets it survive re-derivation from the file" + cite(33) + ".",
           "<code>scene/boundary.ts:449</code> (the key), <code>scene/regionView.ts</code>, <code>hosts/regionScene.ts</code> (the verb), <code>components/blockRegion.tsx</code> (the label + ∂ halo), <code>BlockRegion/Views</code> stories.",
           extra=fig(shots["arms"], "<b>Today, for real:</b> the expanded branch — every arm visible, no output wall on the corner card (V1), arms fan in at the consumer. This proposal changes nothing here; it changes what the SAME region shows when you flip it to port or opaque.", "story components-blocks-blockregion--with-arms · :5421 read-only capture", w=300))

    # --- 3 · position is order -----------------------------------------------
    code = py('''def run(frame):
    log(frame)      # effect only, no output
    save(frame)     # effect only, no output''')
    field = B.kit("F9__b0__ex1", maxw=330, cap="<b>Unreal / Unity / Simulink:</b> a second cable kind with no value on it says WHEN. The two tools that disagree with 'never a cable' are the two whose execution model is Python's" + cite(1, 2) + ".")
    today = B.ours({"nodes": [N("r", "decode()", 0, 0, ["raw"], ["frame"]), N("a", "log()", 1, 0, ["frame"], []), N("b", "save()", 2, 0, ["frame"], [])],
                    "wires": [W("r.out.frame", "a.in.frame"), W("r.out.frame", "b.in.frame")],
                    "notes": [{"t": "which ran first? the picture cannot say", "y": 108}]},
                   cap="<b>Today:</b> the tree holds two answers. CLAUDE.md: control flow is never a cable. The syntax report, F9: 'an execution edge… a projection that only draws data edges is not a faithful oracle'" + cite(5, 3) + ". Side by side, two effect-only calls draw the same picture in either order.")
    proposed = B.ours({"nodes": [N("a", "log()", 0, 0, ["frame"], []), N("b", "save()", 0, 1, ["frame"], [])],
                       "frames": [{"id": "d", "style": "region", "corner": {"t": "run()", "in": ["frame"]}, "members": ["a", "b"], "toggle": False, "ruled": False, "rings": False,
                                   "arms": [{"t": "", "members": ["a"], "note": "y-rank 1 · derived"}, {"t": "", "members": ["b"], "note": "y-rank 2 · derived"}]}],
                       "wires": [W("d.cin.frame", "a.in.frame"), W("d.cin.frame", "b.in.frame")]},
                      cap="<b>Proposed:</b> inside an expanded definition or region, vertical order IS source order — derived by the projection, re-derived after every edit, held as a scene fact. No cable. A member dragged above its predecessor is a lint finding (<code>order</code>), not a layout. The two faint rules are the taste question in §4; variant 1 draws nothing.")
    change(3, "unify", "Position is order: vertical rank inside an expanded region is source order, derived",
           "Buys the F9/V13 answer without a cable, and closes the one contradiction the tree carries today. Max and n8n already do position-as-order and it is a hazard there because the user drags; here the user does not — the file is canonical and the graph re-derives, which turns the field's worst mechanism into the only one that is both cable-free and truthful" + cite(1, 3) + ".",
           code, field, today, proposed,
           "No new mark. A derived <code>order</code> on members from the pyblocks span (<code>hosts/pyblocksScene.ts</code>), a lint rule <code>order</code> in <code>scene/lint.ts</code> (a member above its predecessor), and the ELK request already sets <code>considerModelOrder</code> — the rule is what was missing, not the lever" + cite(20, 33, 4) + ". The real cost is a new invariant: free drag inside a region can no longer reorder, and every host must honour that (interaction geometry is host-owned).",
           "<code>hosts/pyblocksScene.ts</code> (order in), <code>scene/lint.ts:182</code> (<code>LintRuleId</code> + rule), <code>hosts/memberDrag.ts</code> (clamp or lint), the F9 row of the syntax report (corrected to say this).")

    # --- 4 · drift ------------------------------------------------------------
    code = py('''def estimate(frame, gain):
    return solve(scale(frame, gain))

# a copy that drifted — same name, different content
def estimate(frame, gain, *, clamp=True):
    return solve(scale(frame, gain), clamp)''')
    field = B.field_py({"nodes": [
        {"id": "a", "t": "estimate", "c": 0, "r": 0, "shape": "box", "in": ["geo"], "out": ["geo"], "accent": "geo", "tag": "locked — matches the definition"},
        {"id": "b", "t": "estimate", "c": 1, "r": 0, "shape": "box", "in": ["geo"], "out": ["geo"], "accent": "geo", "tag": "unlocked — edited inside"},
        {"id": "m", "t": "Match Current Definition", "c": 1, "r": 1, "shape": "badge"}]},
        cap="<b>Houdini:</b> an HDA instance is <i>locked</i> (bit-identical to the definition) or <i>unlocked</i> (you edited inside, the node's own UI says so), and <i>Match Current Definition</i> is the repair verb. Nuke: Published / Make Editable / Publish. Blender: the user count beside the name" + cite(24, 1) + ".")
    today = B.ours({"nodes": [N("a", "estimate()", 0, 0, ["frame", "gain"], ["pose"]), N("b", "estimate()", 1, 0, ["frame", "gain"], ["pose"], chips=[{"t": "Draft 2", "tone": "muted"}])]},
                   cap="<b>Today:</b> <code>definitionBadge</code> says <code>Draft 2</code> — which number it is, not what it drifted from — and the exports are <code>commitDefinitionName</code>, <code>setDefinitionData</code>, <code>unlinkOccurrence</code>, <code>duplicateNodeUnlinked</code>, <code>deleteNode</code>, <code>reconcileDefinitions</code>. A rename-time adopt exists; a 'match the definition' for an already-drafted occurrence does not" + cite(13, 1) + ".")
    proposed = B.ours({"nodes": [N("a", "estimate()", 0, 0, ["frame", "gain"], ["pose"], chips=[{"t": "linked · 2", "tone": "muted"}]),
                                 N("b", "estimate()", 0, 1, ["frame", "gain", "clamp"], ["pose"], chips=[{"t": "edited · estimate", "tone": "warn"}, {"t": "↺ match", "tone": "blue"}])]},
                      cap="<b>Proposed:</b> Houdini's three words on <code>linking.ts</code> — an occurrence is <b>linked</b> (badge: the count, like Blender), <b>edited</b> (badge names the definition it drifted from, amber) or <b>unlinked</b> (its own name, no badge) — and one verb, <code>matchDefinition(scene, id)</code>, which is <code>setDefinitionData</code> pointed the other way. The ↺ chip is that verb's affordance.")
    change(4, "name", "Name the drift: linked · edited · unlinked, and one repair verb",
           "Buys a name for a state the code already tracks and a verb the field has had for years. Small, and it lands on SystemSketch's 'bread and butter' (hand-drawn black boxes with many occurrences) as much as on Python" + cite(1, 13) + ".",
           code, field, today, proposed,
           "~60 lines: <code>definitionBadge</code> returns <code>edited · &lt;name&gt;</code> for a drafted occurrence and <code>linked · n</code> for a canonical one with peers; <code>matchDefinition</code> copies the canonical <code>linked</code>/<code>expanded</code> facets onto the occurrence and clears <code>draftOrdinal</code>; the chip is an <code>OriginBadge</code>-style <code>Badge</code> in <code>RegionHeaderChips</code>/the Block header. The ordinal stays as data (FIFO promotion needs it); only the WORD changes.",
           "<code>scene/linking.ts:174</code> (badge), <code>scene/linking.ts</code> (new verb beside <code>setDefinitionData</code>), <code>hosts/nodeViews.tsx</code> (the chip), <code>Linking</code> stories.")

    # --- 5 · plane swap -------------------------------------------------------
    code = py('''def run(raw):
    frame = decode(raw)
    pose = estimate(frame)
    return encode(pose)

def estimate(frame):
    scaled = scale(frame)
    return solve(scaled)''')
    field = B.kit("B1__b0__ex1", maxw=1110, cap="<b>Unreal / Unity / Simulink / Blender / Grasshopper / Flyde:</b> double-click, Tab, dive — every plane draws from (0,0), and the wall reappears inside as two sentinel nodes. 11 of 11 can leave the plane" + cite(2, 24, 1) + ".")
    today = B.ours({"nodes": [N("d", "decode()", 0, 0, ["raw"], ["frame"]), N("e", "estimate()", 1, 0, ["frame"], ["pose"], fw=150, fh=92, body=["scale() → solve()", "(expanded in place)"]), N("n", "encode()", 2, 0, ["pose"], ["bytes"])],
                    "frames": [{"id": "r", "style": "region", "corner": {"t": "run()", "in": ["raw"], "out": ["bytes"]}, "members": ["d", "e", "n"], "toggle": True}],
                    "wires": [W("r.cin.raw", "d.in.raw"), W("d.out.frame", "e.in.frame"), W("e.out.pose", "n.in.pose"), W("n.out.bytes", "r.cout.bytes")]},
                   cap="<b>Today:</b> in place, and only in place — <code>editor/breadcrumb.tsx</code> is a stock shadcn Breadcrumb with no stack behind it; <code>drillIn</code> / <code>enterGroup</code> / <code>treeStack</code> / <code>alternateBounds</code>: 0 hits outside the file navigator" + cite(14, 1) + ". At three levels the in-place drawing is 15–21 painted lines" + cite(25) + ".")
    proposed = B.ours({"breadcrumb": ["module", "run()", "estimate()"],
                       "nodes": [N("a", "scale()", 0, 0, ["frame"], ["scaled"]), N("b", "solve()", 1, 0, ["scaled"], ["pose"])],
                       "frames": [{"id": "e", "style": "region", "corner": {"t": "estimate()", "in": ["frame"], "out": ["pose"]}, "members": ["a", "b"], "toggle": False}],
                       "wires": [W("e.cin.frame", "a.in.frame"), W("a.out.scaled", "b.in.scaled"), W("b.out.pose", "e.cout.pose")]},
                      cap="<b>Proposed:</b> a plane is a projection ROOT, not a document state. <code>projectHostScene(scene, {root})</code> makes one definition the board (its expanded face, full-bleed, its own ports on its own corner card — no sentinel nodes), the breadcrumb is the definition path, Back pops it. Nothing is saved; nothing can drift.")
    change(5, "fix", "A plane swap as a lens: re-root the projection, breadcrumb the path",
           "Buys the one thing 11 of 11 have and the trunk does not — for the price of a root parameter. The peer report recommended 'not yet' on the grounds that in-place is the bet and a document-saved treeStack is real work" + cite(1) + "; this is a cheaper form of the same feature that keeps the bet intact, because the plane is not a second geometry, it is the same projection asked from a different root.",
           code, field, today, proposed,
           "~120 lines: <code>root?: string</code> on <code>projectHostScene</code> → nodes = <code>descendantsOf(root)</code> re-based with <code>absolutePosition</code>, edges = those with both ends inside (crossings become the root's own ports, which it already has); the breadcrumb reads the <code>parentId</code>/definition chain; the DOM host's double-click on a corner card sets the root. React Flow and tldraw get it for free because they render the projection" + cite(14, 6) + ".",
           "<code>hosts/regionScene.ts:176</code> (<code>projectHostScene</code>), <code>editor/breadcrumb.tsx</code> (wired, not changed), <code>hosts/domCanvas.tsx</code> (the gesture), a <code>Hosts</code> story <code>Plane Swap</code>.",
           extra=fig(shots["nested"], "<b>Today, for real:</b> a branch inside an arm inside a branch, in place — already the line count the 09-19 report measured. The plane swap is for the day a golden nests past this.", "story components-blocks-blockregion-branch--nested · :5421 read-only capture", w=300), wide=True)

    # --- 6 · try / with -------------------------------------------------------
    code = py('''try:
    pose = estimate(frame)
except Timeout:
    pose = fallback(frame)
finally:
    release(cam)

with open(path) as f:
    data = f.read()''')
    field = B.kit("E1__b1__ex1", maxw=330, cap="<b>Unity:</b> one Try Catch node with Try / Catch / Finally arrow outputs — the arms exist, but they enclose nothing, and the finally arm is just a third pin" + cite(2, 30) + ". LabVIEW threads an error wire through a stacked case frame; the finally column is empty all the way down the field" + cite(1) + ".")
    today = B.ours({"nodes": [N("a", "estimate()", 0, 0, ["frame"], ["pose"]), N("b", "release()", 0, 1, ["cam"], [])],
                    "frames": [{"id": "g", "style": "region", "corner": {"t": "try (group)"}, "members": ["a", "b"], "toggle": False}],
                    "notes": [{"t": "RegionKind = loop | branch | group — no try, no with", "y": 118}]},
                   cap="<b>Today:</b> <code>RegionKind = \"loop\" | \"branch\" | \"group\"</code>" + cite(8) + ". A <code>try</code> can be drawn as a labeled group and an <code>except</code> as a branch arm by hand; nothing says which arm runs on every path out, and <code>with</code>'s guaranteed exit has no mark at all (E5: alone, 'the hull exists in 2 tools, the guarantee in none')" + cite(1) + ".")
    proposed = B.ours({"nodes": [N("a", "estimate()", 0, 0, ["frame"], ["pose"]), N("b", "fallback()", 0, 1, ["frame"], ["pose"]), N("c", "release()", 0, 2, ["cam"], [])],
                       "frames": [{"id": "t", "style": "region", "corner": {"t": "Try", "in": ["frame", "cam"]}, "members": ["a", "b", "c"], "toggle": False,
                                   "arms": [{"t": "try:", "members": ["a"]}, {"t": "except Timeout:", "members": ["b"]}, {"t": "finally:", "members": ["c"], "heavy": True, "note": "runs on every path out"}]}],
                       "wires": [W("t.cin.frame", "a.in.frame"), W("t.cin.frame", "b.in.frame"), W("t.cin.cam", "c.in.cam")]},
                      cap="<b>Proposed:</b> <code>RegionKind</code> gains <code>try</code> and <code>with</code>. A try is a branch whose arms are <code>try:</code> / <code>except X:</code> / <code>else:</code> / <code>finally:</code>, and the finally arm wears a heavier top rule — the one arm every path crosses. A <code>with</code> is a region whose exit arm is that same heavy rule with nothing but the release in it. Same component, particular data (<code>region.try.ts</code> beside <code>region.branch.ts</code>).")
    change(6, "unify", "try / except / finally and with as region kinds — the finally rule",
           "Buys E1 and E5/E6 (three of the fifteen 'alone' scenarios) a drawing that is data over the existing component instead of a hand-assembled group. The heavy rule is the only new ink, and it is the mark the whole field lacks: a suite that runs on every path out" + cite(1, 3) + ".",
           code, field, today, proposed,
           "~200 lines of preset (<code>region.try.ts</code>: <code>tryArms</code>, <code>withArms</code>), one <code>RegionArm.emphasis?: \"always\"</code> flag drawn by <code>BlockRegion</code> as the heavier rule (a token in <code>skin/regionVariants.ts</code>), stories for E1/E5. <code>except*</code> is still open — several arms can fire for one failure, and nothing in the field has it either" + cite(1, 4) + ".",
           "<code>components/blockRegion.tsx:150</code> (<code>RegionKind</code>, <code>RegionArm</code>), <code>scene/region.try.ts</code> (new, beside <code>region.branch.ts</code>), <code>skin/regionVariants.ts</code> (the rule token), <code>BlockRegion</code> stories.")

    # --- 7 · name the ring ---------------------------------------------------
    code = py('''for item in items:
    total = merge(total, item)   # `total` enters from outside''')
    field = B.kit("L1__b3__ex1", maxw=1110, cap="<b>LabVIEW / Simulink:</b> the wall owns the terminals — a tunnel is a square on the frame with an id, and it is the half NI's users complain about ('wires that point nowhere… imagine 20 cases')" + cite(2, 31) + ".")
    today = B.ours({"nodes": [N("s", "seed()", 0, 0, [], ["total"]), N("m", "merge()", 1, 0, ["total", "item"], ["total"])],
                    "frames": [{"id": "l", "style": "region", "corner": {"t": "For Loop", "in": ["Iterable"], "out": ["Iter"]}, "members": ["m"], "rings": True}],
                    "wires": [W("s.out.total", "m.in.total"), W("l.cout.Iter", "m.in.item"), W("m.out.total", "m.in.total", "delayed", t="z⁻¹")]},
                   cap="<b>Today:</b> the ring is shipped — <code>wallCrossings</code> → <code>BlockRegion</code>'s <code>crossings</code> prop, within 1.5px of the painted cable — and nothing in the rules names it" + cite(12, 4) + ". A mark nobody has named is a mark somebody deletes as decoration.")
    proposed = B.ours({"nodes": [N("a", "nothing", 0, 0, [], ["v"], fw=88), N("b", "ring", 0, 1, [], ["v"], fw=88), N("c", "derived", 0, 2, [], ["v"], fw=88, pstate="derived"), N("d", "declared", 0, 3, [], ["v: T"], fw=88)],
                       "frames": [{"id": "w", "style": "region", "corner": {"t": "the wall, four states"}, "members": ["a", "b", "c", "d"], "toggle": False, "rings": False, "ruled": False,
                                   "arms": [{"t": "expanded region, cable to the member", "members": ["a"], "dim": True}, {"t": "expanded region, crossing kept", "members": ["b"], "dim": True}, {"t": "port / opaque region", "members": ["c"], "dim": True}, {"t": "function block", "members": ["d"], "dim": True}]}]},
                      cap="<b>Proposed:</b> write the wall vocabulary down as four states — <b>nothing</b> → <b>crossing ring</b> (positional, no id; expanded) → <b>derived port</b> (id, promoted; port/opaque) → <b>declared port</b> (the API) — and give the ring a slot name (<code>data-slot=\"region-crossing\"</code>) and a story of its own. No new paint.")
    change(7, "name", "Name the wall's four states — the crossing ring is a mark, not decoration",
           "Buys nothing on screen and a great deal in the next refactor: the ring is what makes 'no input ports in expanded' safe, and it is currently the only unnamed mark in the language" + cite(4, 26) + ".",
           code, field, today, proposed,
           "Documentation and one attribute. The four-state table goes into CLAUDE.md's control-flow section and the grammar sheet above; the ring gets its <code>data-slot</code> and an acceptance assertion that it sits on the cable.",
           "<code>components/blockRegion.tsx</code> (the slot), <code>components/blockRegion.acceptance.ts</code>, <code>CLAUDE.md</code>.", wide=True)

    # --- 8 · temporal sketch -------------------------------------------------
    code = py('''def frames(cam):
    while cam.open:
        yield cam.read()      # fires N times
    buf = grab(cam)
    del buf                   # the end of a lifetime''')
    field = B.kit("V12__b0__ex1", maxw=1110, cap="<b>8 of 11 on <code>del</code>:</b> not drawn — lifetimes never appear. 40 of the field's 98 refusals are about WHEN a value exists rather than what flows" + cite(2, 1) + ".")
    today = B.ours({"nodes": [N("g", "grab()", 0, 0, ["cam"], ["buf"]), N("r", "read()", 1, 0, ["cam"], ["frame"])],
                    "wires": [W("g.out.buf", "r.in.cam")], "notes": [{"t": "del: no mark · yield: a port like any other", "y": 96}]},
                   cap="<b>Today:</b> the scenarios answer each time-shaped construct with a different ad-hoc mark: <code>del</code> a badge, <code>yield</code> 'a port that fires N times', <code>with</code> a region, <code>async</code> nothing" + cite(3) + ".")
    proposed = B.ours({"nodes": [N("g", "grab()", 0, 0, ["cam"], ["buf"]), N("r", "read()", 1, 0, ["cam"], ["frame"], state={"frame": "stream"}, psub={"frame": "×N"}), N("s", "sink", 2, 0, ["buf"], [], fw=70)],
                       "wires": [W("g.out.buf", "s.in.buf", end="x", t="del"), W("g.out.buf", "r.in.cam")]},
                      cap="<b>Sketch:</b> one mark family for the five time-shaped scenarios once change 3 makes the vertical axis mean time — the × where a cable ends (<code>del</code>), a doubled ring for a port that fires N times (<code>yield</code>, a generator expression), the finally rule from change 6 for <code>with</code>. Drawn here only so the family can be seen together; no capture, no story, not proposed for a lane before change 3 lands.")
    change(8, "sketch", "Temporal marks — × at the end of a cable, a port that fires N times",
           "Buys a single answer to E5, E6, V12, S1, P3 (and the async facet) instead of five. Only coherent if change 3 is adopted first, because the marks only mean something on an axis that means time" + cite(1) + ".",
           code, field, today, proposed,
           "Unknown until tried on fixtures — this is the one item here that is a sketch, not a spec. The doubled ring is a <code>PortState</code>-class paint (<code>port.tsx</code>); the × is a <code>TraceTerminal</code> variant" + cite(17) + ".",
           "<code>components/port.tsx</code> (a paint), <code>components/traceTerminal.tsx</code> (a terminal), fixtures for E5/V12/S1 — after change 3.", wide=True)
    return "".join(out)


# ----------------------------------------------------------------------------
# §3 what stays
# ----------------------------------------------------------------------------
def stays(B: Boards, shots: dict):
    rows = [
        ("The core imports no canvas engine; layout geometry travels, interaction geometry does not",
         "All eleven are monoliths fused to their engine — 'how does Unreal draw a loop' had to be answered from screenshots. The freshest evidence for the split is the 705 field boards on this page: drawn by React Flow node types from bucket data in a day, with no engine in the data" + cite(1, 29) + "."),
        ("Control flow is never a cable",
         "9 of 11 run the program on no execution wire; 8 of 11 draw no control line at all. The two dissenters are the imperative pair. Change 3 is what makes the rule hold for F9 without a cable" + cite(1, 2) + "."),
        ("A region is ONE node; the corner card owns the id; the frame owns no id",
         "Simulink's For Iterator is a small block INSIDE the subsystem, the subsystem is the node with the ports — a corner card avant la lettre. MLIR: an operation owns its regions. LabVIEW's wall-owns-the-terminals is the design NI's own users asked to leave" + cite(1, 31) + "."),
        ("Arms are `type: \"arm\"` nodes; break / continue / pass are Badge marks",
         "Every arm visible is the thing LabVIEW could not draw once the input tunnels are gone. In the field a break is six different things (a wire back, a stub, a boolean into a wall, text in a field…); a cable implies a value and these carry none, so a badge is the only honest ink" + cite(1, 2, 16) + "."),
        ("Grain 1: a block is a definition, never a statement",
         "7 of 11 draw `+` as a box; the 17,192-px five-line function is what expression grain costs. Exposure measured: 15.7% of BAM core functions are operator-heavy — a real minority, concentrated in kinematics, and the number to watch" + cite(32, 1) + "."),
        ("The file is canonical; the graph is a lens that re-derives",
         "NI measured six of six participants introducing a bug while rewiring; that failure fires on graph edits, and a re-derived graph is never edited that way. It is also what makes changes 3 and 5 nearly free: order and the plane are both facts the projection already has" + cite(1, 24) + "."),
        ("No output wall on a branch's corner card (V1); arms fan in at the consumer",
         "Zach, 2026-09-02: yields 'get messy — then you don't know which of those ports are firing'. Unchanged in expanded. Change 2 is about what the same region shows in port/opaque, where a derived output IS an output — one per variable, which is the φ the asymmetry note already settled" + cite(19, 31) + "."),
        ("A name is a label on the cable; a type is ink on the label, not colour",
         "V2: Simulink alone letters the name under the arrow; ten of eleven box it or refuse it. B8: four colour the port by type; the label carries the same information without a legend" + cite(1, 2) + "."),
    ]
    t = '<table class="kv"><tr><th>settled</th><th>what the corpus says</th></tr>' + "".join(f"<tr><td>{E(a)}</td><td>{b}</td></tr>" for a, b in rows) + "</table>"
    figs = '<div class="figs figs2">' + "".join([
        B.kit("F9__b5__ex1", maxw=520, cap="<b>n8n / Max / Simulink:</b> nothing drawn — position is the order. The hazard, in the field; the answer, here, once the position is derived." + cite(2)),
        B.kit("L3__b3__ex1", maxw=520, cap="<b>LabVIEW / Blender:</b> `break` is a boolean into a terminal on the region's own boundary — the wall owning something, again." + cite(2)),
        B.kit("V2__b1__ex1", maxw=520, cap="<b>Simulink:</b> the name lettered under the cable — the one vocabulary that agrees with V2." + cite(2)),
        B.kit("V4__b0__ex1", maxw=520, cap="<b>The operator box</b> (7 of 11) — grain 0. Not here: `+` is a label on a node, never a box." + cite(2)),
    ]) + "</div>"
    return t + figs


# ----------------------------------------------------------------------------
# §4 taste
# ----------------------------------------------------------------------------
def taste(B: Boards):
    out = []

    def decision(n, title, why, options, pick_note):
        cells = []
        for i, (label, board, note) in enumerate(options, 1):
            cells.append(f'<div class="opt {"pick" if i == 1 else ""}"><div class="oh">{"★ " if i == 1 else ""}{i} · {E(label)}{" <i>· recommended, applied in §1</i>" if i == 1 else ""}</div>{board}<p>{note}</p></div>')
        out.append(f'<div class="card" id="t{n}"><h3>T{n} · {title}</h3><p class="buys">{why}</p><div class="opts">{"".join(cells)}</div><p class="meta" style="color:var(--dim);font-size:13px">{pick_note}</p>{FB.strip(n, title, noun="taste")}</div>')

    # T1 — the held Block
    o1 = B.ours({"nodes": [N("b", "build_report", 0, 0, ["rows", "window"], ["report"], shape="opaque", fw=190, fh=120, hidden="3 members hidden")]})
    o2 = B.ours({"nodes": [N("b", "build_report", 0, 0, ["rows", "window"], ["report"], fw=118)], "ghosts": [{"around": "b", "w": 190, "h": 120, "t": "held"}]})
    o3 = B.ours({"nodes": [N("b", "build_report", 0, 0, ["rows", "window"], ["report"], shape="opaque", fw=190, fh=120, hidden="", body=["", "", "", "▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒"])]})
    decision(1, "How a held Block shows its footprint",
             "Change 1 needs a face. The region already has one (the P5 card with a footer); a Block can copy it or draw something lighter.",
             [("the region's card, footer states what is hidden", o1, "One face for blocks and regions; the footer is <code>describeHidden</code>, measured. This is what the trunk's opaque region already paints."),
              ("port card at the corner, dashed ghost of the held bounds", o2, "Shows the two bounds literally (the field's model). Costs a second outline and reads as 'something is missing'."),
              ("full card, hatched body", o3, "Blender's greyed-out group. Heavy ink for a state that should be quiet.")],
             "Pick 1: one face, one footer, and the region and the block stop being two designs.")

    # T2 — derived port rename affordance
    o1 = B.ours({"nodes": [N("b", "Branch", 0, 0, ["frame"], ["pose"], shape="opaque", region=True, pstate="derived", fw=170, fh=84, hidden="", psub={"pose": "∂"})]})
    o2 = B.ours({"nodes": [N("i", "in", 0, 0, [], ["frame"], fw=60), N("e", "estimate()", 1, 0, ["frame"], ["pose"]), N("o", "out", 2, 0, ["pose"], [], fw=60)],
                 "frames": [{"id": "b", "style": "region", "corner": {"t": "Branch"}, "members": ["i", "e", "o"], "toggle": False}],
                 "wires": [W("i.out.frame", "e.in.frame"), W("e.out.pose", "o.in.pose")]})
    o3 = B.ours({"nodes": [N("b", "Branch", 0, 0, ["frame"], ["pose"], shape="opaque", region=True, pstate="derived", fw=170, fh=84, hidden="")],
                 "notes": [{"t": "names live in the inspector only", "y": 112}]})
    decision(2, "Where a derived port is named",
             "Change 2 makes derived ports renameable. The name has to live somewhere a reader can find it without a dialog.",
             [("in place on the wall, with the ∂ halo", o1, "The label is editable where it is read (<code>EditableText</code>, as every port label is). The dashed halo is the only thing that says 'derived, and renameable'."),
              ("sentinel in / out nodes inside the frame", o2, "The field's answer (6 of 11). Rejected: this is the input-tunnel wall NI's users asked to leave, drawn as nodes."),
              ("inspector only, no mark on the wall", o3, "Cheapest. But a port whose name cannot be seen on the board is not an interface.")],
             "Pick 1: name it where it is read. The halo is 0.8px of ink.")

    # T3 — drift badge
    o1 = B.ours({"nodes": [N("b", "estimate()", 0, 0, ["frame"], ["pose"], chips=[{"t": "edited · estimate", "tone": "warn"}, {"t": "↺", "tone": "blue"}])]})
    o2 = B.ours({"nodes": [N("b", "estimate()", 0, 0, ["frame"], ["pose"], chips=[{"t": "🔓", "tone": "muted"}])]})
    o3 = B.ours({"nodes": [N("b", "estimate()", 0, 0, ["frame"], ["pose"], chips=[{"t": "2 ⇄", "tone": "muted"}])]})
    decision(3, "How an edited occurrence says so",
             "Change 4 gives the drift a word; the badge is where the word goes.",
             [("amber `edited · <definition>` chip and a ↺ match action", o1, "Names what it drifted FROM, in the drift colour <code>OriginBadge</code> already uses for 'drifted'; the verb sits beside the state it repairs."),
              ("a lock glyph, Houdini's way", o2, "Quiet and familiar to Houdini users; says nothing about which definition, and nothing about how to repair."),
              ("Blender's user count with a ⇄ mark", o3, "Reads as 'shared by 2', not 'diverged'. The sibling report's #8 is already amending this badge in the other direction" + cite(27) + ".")],
             "Pick 1: the state, the parent, and the verb in one chip.")

    # T4 — order affordance
    o1 = B.ours({"nodes": [N("a", "log()", 0, 0, ["f"], []), N("b", "save()", 0, 1, ["f"], [])],
                 "frames": [{"id": "d", "style": "region", "corner": {"t": "run()"}, "members": ["a", "b"], "toggle": False}]})
    o2 = B.ours({"nodes": [N("a", "log()", 0, 0, ["f"], []), N("b", "save()", 0, 1, ["f"], [])],
                 "frames": [{"id": "d", "style": "region", "corner": {"t": "run()"}, "members": ["a", "b"], "toggle": False, "ruled": False,
                             "arms": [{"t": "1", "members": ["a"], "dim": True}, {"t": "2", "members": ["b"], "dim": True}]}]})
    o3 = B.ours({"nodes": [N("a", "log()", 0, 0, ["f"], []), N("b", "save()", 0, 1, ["f"], [], chips=[{"t": "then", "tone": "muted"}])],
                 "frames": [{"id": "d", "style": "region", "corner": {"t": "run()"}, "members": ["a", "b"], "toggle": False}]})
    decision(4, "Whether position-as-order gets any ink",
             "Change 3 makes the y-rank a fact. The question is whether the board says so, or only the lint does.",
             [("nothing drawn; the y-rank is the order, a lint flags a violation", o1, "Zero ink. Consistent with 'no gutters' and with how source reads: order is position. The lint is the only place the rule becomes visible, and only when broken."),
              ("faint ordinal rules between statements", o2, "Makes the rule legible to a stranger. Costs a line per statement — the gutter Zach keeps rejecting."),
              ("a `then` chip on effect-only calls", o3, "Marks only the calls where order is the ONLY thing placing them (V13). Cheap, but a mark on the node for a fact about the region.")],
             "Pick 1, with 3 as the fallback if user testing shows the order is missed.")

    # T5 — plane chrome
    o1 = B.ours({"breadcrumb": ["module", "run()", "estimate()"], "nodes": [N("a", "scale()", 0, 0, ["frame"], ["s"]), N("b", "solve()", 1, 0, ["s"], ["pose"])],
                 "frames": [{"id": "e", "style": "region", "corner": {"t": "estimate()", "in": ["frame"], "out": ["pose"]}, "members": ["a", "b"], "toggle": False}],
                 "wires": [W("a.out.s", "b.in.s")]})
    o2 = B.ours({"breadcrumb": ["‹ back to run()"], "nodes": [N("a", "scale()", 0, 0, ["frame"], ["s"]), N("b", "solve()", 1, 0, ["s"], ["pose"])],
                 "frames": [{"id": "e", "style": "region", "corner": {"t": "estimate()", "in": ["frame"], "out": ["pose"]}, "members": ["a", "b"], "toggle": False}],
                 "wires": [W("a.out.s", "b.in.s")]})
    o3 = B.ours({"breadcrumb": ["run()  |  estimate() ×"], "nodes": [N("a", "scale()", 0, 0, ["frame"], ["s"]), N("b", "solve()", 1, 0, ["s"], ["pose"])],
                 "frames": [{"id": "e", "style": "region", "corner": {"t": "estimate()", "in": ["frame"], "out": ["pose"]}, "members": ["a", "b"], "toggle": False}],
                 "wires": [W("a.out.s", "b.in.s")]})
    decision(5, "The chrome of a plane",
             "Change 5 needs a way back. Three shapes of the same fact.",
             [("the breadcrumb, and nothing else", o1, "<code>editor/breadcrumb.tsx</code> exists and is stock shadcn; the path IS the stack. Every segment is a click."),
              ("a single Back chip on the board", o2, "Simulink's Back button. One level of memory; loses the path."),
              ("tabs, one per open plane", o3, "Max's windows. State to manage, and it is the field's design, not a lens.")],
             "Pick 1: it already exists, and it is the honest shape of a projection root.")
    return "".join(out)


# ----------------------------------------------------------------------------
# §5 stock parts
# ----------------------------------------------------------------------------
def stock_table():
    rows = [
        ("Block faces (granularity)", "`BlockView = simple | port | expanded`, `BLOCK_VIEWS`", "`BlockView` — unchanged", "the three faces, `data-collapsed-ports` on the simple dot, one data record four paints"),
        ("Block footprint (change 1)", "none — a Block always hugs", "new `BlockFootprint = \"hug\" | \"hold\"` in `blockPort.layout.ts`; the held face is `BlockRegion`'s existing `opaque` card + `describeHidden`", "positions preserved by construction; the footer's words measured; `setRegionView`'s one-field write, now for blocks"),
        ("Same seats (change 1)", "`projectOpaqueRegions` → `promoteBoundary` with no `box`/`geometryOf`", "`crossingGeometryPolicy` + `wallCrossings` (both exist) handed in as `box`/`geometryOf`", "`t` set, `by: \"geometry\"`; polarity still v1's (`dagPolarityPolicy`), only the SIDE/seat measured"),
        ("Derived port key (change 2)", "`portKey(inner.nodeId, inner.portId)` — per producer", "`promoteBoundary` option `groupBy: \"value\"`; `PromotedPort` already carries many `outer` ends per port — the same many-to-one on the `inner` side", "a card and a `collapseToRegion` still name the same port; `mintPortId` default unchanged"),
        ("Derived port name (change 2)", "none — the id is the label", "`PromotedPort.label` + `RegionData.derivedNames` + `renameDerivedPort` in `hosts/regionScene.ts`; painted by `EditableText`", "keyed to the variable, so it survives re-derivation from the file; ∂ halo is `PortDot` paint"),
        ("Order (change 3)", "`considerModelOrder: NODES_AND_EDGES` set in ELK; no rule", "`LintRuleId` gains `order`; `hosts/pyblocksScene.ts` carries `order` from the span", "free drag still works; a member above its predecessor is a finding, not a snap"),
        ("Drift (change 4)", "`definitionBadge` → `Draft n`", "`definitionBadge` → `edited · <name>` / `linked · n`; new `matchDefinition` beside `setDefinitionData`; chip = `Badge` (`OriginBadge`'s `warning` variant)", "FIFO promotion and `draftOrdinal` untouched; rename-detaches rule untouched"),
        ("Plane (change 5)", "in place only; `editor/breadcrumb.tsx` idle", "`projectHostScene(scene, {root})` over `descendantsOf` + `absolutePosition`; the stock `Breadcrumb`", "no document write; React Flow and tldraw hosts render the projection unchanged"),
        ("try / with (change 6)", "`RegionKind = loop | branch | group`", "`RegionKind` + `try` + `with`; `scene/region.try.ts` (`tryArms`, `withArms`) beside `region.branch.ts`; `RegionArm.emphasis` → a `regionVariants` token", "one region renderer; `armsOf`/`hiddenSummary` unchanged"),
        ("The ring (change 7)", "`wallCrossings` → `BlockRegion.crossings`, unnamed", "same code, `data-slot=\"region-crossing\"` + an acceptance assertion", "within 1.5px of the painted cable"),
        ("Control marks", "`ControlMark` (`break`, `continue`, `pass`), `data-slot=\"control-mark\"`", "unchanged", "no port, no edge can originate at one"),
        ("Cable dressings", "`Trace variant=\"delayed\"` + `TraceBadge` (z⁻¹); `MutationLineMark`; `TraceBadge` for a name/path", "unchanged", "`DEFAULT_TRACE_MARKER_END = \"none\"`, `DEFAULT_TRACE_ROUTING = \"elbow\"`"),
        ("Temporal marks (change 8, sketch)", "none", "a `PortState`-class paint in `port.tsx`; a `TraceTerminal` variant", "— (after change 3)"),
    ]
    t = ['<table class="kv"><tr><th>element</th><th>today</th><th>off-the-shelf part, by its exported name</th><th>behaviour that must survive</th></tr>']
    for a, b, c, d in rows:
        t.append(f"<tr><td>{E(a)}</td><td>{md(b)}</td><td>{md(c)}</td><td>{md(d)}</td></tr>")
    t.append('<tr class="stock"><td>unchanged (stock seam)</td><td colspan="3">' + md(
        "`scene/scene.ts`, `scene/collapse.ts` (`collapseToRegion` / `dissolveRegion`), `scene/containment.ts`, `scene/region.ts`, `scene/boundary.ts`'s `classifyBoundary`, `components/elbow/*` (verbatim port — never edited), `components/port.tsx`'s dot grammar, `components/portEdge.tsx`, `components/block.tsx` (`shape=\"region-corner\"`), `components/blockRegion.tsx`'s frame + corner + arms renderer, `hosts/regionScene.ts`'s `RegionView`/`RegionPresentation` split (two fields, two controls — Zach 2026-09-22), the `Draft` FIFO in `linking.ts`, the branch's V1 corner (no output wall), the tag vocabulary, the registry generator. Every existing story stays byte-identical; the full `pnpm test` gate proves it."
    ) + "</td></tr></table>")
    return "".join(t)


def md(s: str) -> str:
    s = E(s)
    return re.sub(r"`([^`]+)`", r"<code>\1</code>", s)


# ----------------------------------------------------------------------------
# §6 risks · §7 decisions
# ----------------------------------------------------------------------------
def risks():
    items = [
        ("A renamed derived port is a name the file does not hold.", "The rename lives in the layout sidecar keyed to the VARIABLE, and re-derivation must find the same variable after an edit. Falsifier: rename `pose`, insert a blank line at the top of the file, re-derive — if the name is gone, the key is span-derived and this is the ρ problem again (0 of 14 ids survived exactly that on 2026-09-23)" + cite(4) + ". If it cannot be keyed to the variable, the rename should not ship."),
        ("Position-as-order makes free drag inside a region a lie, in every host.", "Interaction geometry is host-owned, so each host must clamp or lint. Falsifier: if reviewers keep reordering members for readability and the lint fires constantly, order is not what vertical position wants to mean and the rule should retreat to effect-only calls (T4 option 3)."),
        ("Hold costs canvas.", "A held function at expanded size on a 30-block board spends area that the shrink used to give back. Falsifier: the sibling report's face-from-a-line-budget ceiling — if the budget keeps demoting held blocks to hug, hold is a per-viewer pin, not a default" + cite(27) + "."),
        ("Promote-by-variable needs the variable.", "On a hand-drawn whiteboard region (SystemSketch) there is no binding name; the key falls back to the outer endpoint, which is today's behaviour. Falsifier: two producers inside a whiteboard region wired to one consumer still mint two ports. Acceptable; say so in the story."),
        ("A plane as a projection root has no memory.", "Leaving the plane and coming back re-derives everything; a treeStack would have remembered scroll and selection. That is the price of not saving it. Falsifier: if Zach asks for 'go back to where I was' inside a plane, add per-viewer camera memory keyed to the root — still not a document field."),
        ("The settled rule I would watch, not reopen.", "V1 — no output wall on a branch's corner card. It holds in expanded and dissolves in port/opaque by construction (a derived output IS an output wall). That is fine as long as it is said out loud; change 2 says it. The other rule worth a sentence: 'regions have no simple view' is right today and becomes a real question the day a region can hold (a held region with one dot per wall is a simple face). Not reopened; noted."),
    ]
    return "".join(f'<div class="q"><b class="t">{E(a)}</b><div class="rec">{b}</div></div>' for a, b in items)


def decisions():
    qs = [
        ("Q1 · The footprint flag on Block, with the seats?", "Yes, both — change 1. It is the one-word type change the 09-23 callout priced, plus connecting two ends that already exist.", "built in the next region lane behind the existing acceptance tests; nothing merged without you."),
        ("Q2 · Promote by variable, and let a derived port be renamed?", "Yes — change 2, keyed to the variable, ∂ halo on the wall (T2 option 1), inputs never per-consumer.", "the promotion key stays per-producer and this report is linked from the wall-crossing report's Q3; the 20-port failure stays."),
        ("Q3 · Position is order (F9 / V13)?", "Adopt — change 3, no ink (T4 option 1), a lint rule, and correct the F9 row of the syntax report to say so.", "no code; the F9 row gets a one-line correction note pointing here so the two documents stop disagreeing silently."),
        ("Q4 · Name the drift?", "Yes — change 4, Houdini's three words and `matchDefinition`, the amber chip (T3 option 1).", "no code; the badge stays `Draft n`."),
        ("Q5 · A plane swap as a projection root?", "Yes, in this cheap form — change 5, breadcrumb only (T5 option 1). This differs from the peer report's 'not yet', because a root parameter is not a treeStack.", "spec only, no code — the peer's default holds until you say otherwise."),
        ("Q6 · try / with as region kinds, with the finally rule?", "Yes — change 6; `except*` stays open.", "fixtures drawn by hand as groups; no preset."),
        ("Q7 · Write the wall's four states into CLAUDE.md and name the ring?", "Yes — change 7; it is documentation.", "done in the same lane as Q1 (it is one paragraph and one attribute)."),
        ("Q8 · Treat the time-shaped scenarios as one lane after Q3?", "Later — change 8 is a sketch; try it on fixtures once the vertical axis means time.", "no."),
    ]
    out = []
    for i, (q, rec, default) in enumerate(qs, 1):
        out.append(f'<div class="q"><b class="t">{E(q)}</b><div class="rec"><b>Recommend:</b> {md(rec)}</div><div class="def"><b>Default if you say nothing:</b> {md(default)}</div>{FB.strip(i, q, noun="question")}</div>')
    return "".join(out)


# ============================================================================
# build
# ============================================================================
def build(args):
    scratch = args.scratch
    field = json.load(open(os.path.join(scratch, "fieldboards.json")))
    board_css = open(args.board_css).read()
    B = Boards(field, board_css)

    # captures of today, from the peer's read-only :5421 pass
    sb = os.path.join(scratch, "sbcrop")
    shots = {
        "opaque": uri(os.path.join(sb, "components-blocks-blockport-hit-regions--expanded-opaque.png"), 330, crop=(150, 760, 1130, 1430)),
        "arms": uri(os.path.join(sb, "components-blocks-blockregion--with-arms.png"), 300),
        "nested": uri(os.path.join(sb, "components-blocks-blockregion-branch--nested.png"), 300),
        "carried": uri(os.path.join(sb, "components-blocks-blockregion-loop--for-loop-carried.png"), 560),
    }
    img = os.path.join(scratch, "img")
    vendor = {
        "labview": uri(os.path.join(img, "labview-0-branch.png"), 400),
        "unreal": uri(os.path.join(img, "unreal-8-block.png"), 400),
        "n8n": uri(os.path.join(img, "n8n-3-subgraph.png"), 520),
    }

    gram = grammar_cards(B)
    chg = changes(B, shots)
    st = stays(B, shots)
    ta = taste(B)
    stock = stock_table()
    rk = risks()
    dc = decisions()

    if B.errors:
        raise SystemExit("board errors:\n  " + "\n  ".join(B.errors))

    src_index = "".join(f"<li>{E(a)}<br><code>{E(b)}</code></li>" for a, b in SOURCES)

    page = f'''<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>What the bbox-ui visual language should be</title>
<style>{CSS}{FB.CSS}{SHARED_CSS}
/* the vocab-boards kit's own stylesheet, inlined once for every field board */
{board_css}</style></head><body>{SHARED_DEFS}<div class="wrap">
<div class="kicker">bbox-ui · 23 september 2026 · a proposal over eleven vocabularies, 57 scenarios, and the peer thinking piece</div>
<h1>What the bbox-ui visual language should be</h1>
<p class="sub">Not a survey and not a rewrite: the grammar written down as a closed vocabulary, four one-lane fixes where the field is genuinely ahead, one contradiction inside the tree resolved, and every taste call drawn so ignoring it is free.</p>
<div class="nav"><a href="#answer">answer</a><a href="#grammar">1 · grammar</a><a href="#changes">2 · changes</a><a href="#stays">3 · stays</a><a href="#taste">4 · taste</a><a href="#stock">5 · stock parts</a><a href="#risks">6 · risks</a><a href="#decide">7 · decide</a><a href="#sources">sources</a></div>

<h2 id="answer">The answer</h2>
<div class="lede"><p><b>The language is three nouns, two structures, one family of marks and a two-axis camera — and most of it is already right.</b> A <b>Block</b> is a definition; a <b>Port</b> is a named point on its wall; a <b>Cable</b> is the only line, and it carries a value. A <b>Region</b> is a Block wearing a frame whose corner card owns everything; an <b>Arm</b> is a stacked row inside it, every arm visible. <b>Marks</b> are paint that carries no value. The camera is <b>granularity</b> (simple · port · expanded) × <b>footprint</b> (hug · hold), and it never touches the document{cite(5, 6, 4)}.</p>
<p>What changes is small and specific. The peer report measured bbox-ui with the majority on 21 of 57 scenarios, with LabVIEW/Simulink on 18, alone on 15 — and behind on exactly four things, none of them a vocabulary problem{cite(1)}. Those four are changes 1, 2, 4 and 5 below. Change 3 resolves the one place the tree disagrees with itself (an execution edge at F9 vs 'never a cable') by making vertical position inside an expanded region mean source order — the only answer that is both cable-free and truthful, and it is only safe because the file is canonical{cite(1, 3, 5)}. Changes 6–8 give three 'alone' scenarios a drawing, name the one unnamed mark, and sketch the time-shaped family. Zero settled rules are reopened; one is watched (§6).</p></div>
<div class="facts">
<div class="fact"><b>3 · 2 · 1</b><span>nouns · structures · mark family — the whole vocabulary</span></div>
<div class="fact"><b>2 axes</b><span>granularity × footprint; the camera, never the document</span></div>
<div class="fact"><b>4</b><span>one-lane fixes where the field is ahead</span></div>
<div class="fact"><b>1</b><span>contradiction in the tree, resolved without a cable</span></div>
<div class="fact"><b>0</b><span>settled rules reopened</span></div>
<div class="fact"><b>{B.count["ours"] + B.count["field-kit"] + B.count["field-py"]}</b><span>boards on this page: {B.count["field-kit"]} from the React Flow kit, {B.count["ours"] + B.count["field-py"]} from its Python twin</span></div>
</div>
<p style="color:var(--dim);font-size:13px">How to read the drawings: every <span style="color:var(--accent2)">field</span> board is the vocab-boards kit's own markup for that bucket, captured from the app{cite(29)}; every <span style="color:var(--dim)">today</span> and <span style="color:var(--accent)">proposed</span> board is the same layout engine the kit was ported from, extended with bbox-ui's marks (<code>docs/grammar_board.py</code>) — amber rings and grey cables so you never mistake which column is ours. Where a mark cannot be expressed in either, the caption says so. Storybook captures are the peer's read-only pass over :5421 today{cite(28)}.</p>

<h2 id="grammar">1 · The grammar in one page</h2>
<p class="sub" style="font-size:16px">Every mark, what it means, what it is not. <span class="st exists" style="font:600 9.5px var(--mono);letter-spacing:.1em;text-transform:uppercase;border:1px solid #1d4429;color:var(--ok);border-radius:12px;padding:3px 7px">exists</span> is in the trunk today; <span style="font:600 9.5px var(--mono);letter-spacing:.1em;text-transform:uppercase;border:1px solid #5a341a;color:var(--accent);border-radius:12px;padding:3px 7px">new</span> is this proposal, already drawn with variant 1 applied; <span style="font:600 9.5px var(--mono);letter-spacing:.1em;text-transform:uppercase;border:1px solid #4a3c1c;color:var(--gold);border-radius:12px;padding:3px 7px">sketch</span> is a shape to look at, not a spec.</p>
{gram}
<div class="lede blue" style="margin-top:18px"><p><b>Three laws hold the sheet together.</b> (1) <i>Everything is a block, and a block has a wall</i>: a region's interface is its corner card; a definition's interface is its declared ports; a region's port/opaque interface is derived, one port per value{cite(6, 4, 31)}. (2) <i>Every cable ends on a dot, and a dot may stand for many pins but must say which</i> — simple view is the many-to-one case, not an exception{cite(4)}. (3) <i>Data and control never share a line</i>: values ride cables, order rides position, exits ride marks{cite(5, 1)}.</p></div>

<h2 id="changes">2 · What changes, ranked by what it buys</h2>
<p class="sub" style="font-size:16px">The same Python, drawn three ways. Four are the peer report's 'behind' items; each is a lane, not a rewrite.</p>
{chg}

<h2 id="stays">3 · What stays exactly as it is, and why</h2>
<p class="sub" style="font-size:16px">The settled list, each with the corpus evidence that it is right. This is what stops the proposal reading as a rewrite.</p>
{st}

<h2 id="taste">4 · Where it is taste — the alternatives, drawn</h2>
<p class="sub" style="font-size:16px">Five decisions that are genuinely taste. Option 1 is the recommendation and is what §1 already shows; picking 2 or 3 is a one-line reply.</p>
{ta}

<h2 id="stock">5 · The stock-part mapping</h2>
<p class="sub" style="font-size:16px">One row per element: what is there today, the off-the-shelf part by its exact exported name, and the behaviour that must survive. The last row is what is deliberately not touched.</p>
{stock}

<h2 id="risks">6 · Risks, and what would falsify this</h2>
{rk}

<h2 id="decide">7 · Decision surface</h2>
<p class="sub" style="font-size:16px">Each with the recommendation and the reversible default taken on silence.</p>
{dc}

<h2>Evidence the captions lean on</h2>
<div class="figs">
{fig(vendor["labview"], "<b>LabVIEW · Case Structure</b> — one case visible, the ▾ is the only way to the others; the wall owns the tunnels. The complaint and the design bbox-ui's arms answer.", "https://labviewwiki.org/wiki/Case_structure", light=True)}
{fig(vendor["unreal"], "<b>Unreal · function entry and ReturnNode</b> — the sentinel pair, both named: the field's renameable derived interface, and the drawing change 2 does NOT copy (T2 option 2).", "https://dev.epicgames.com/documentation/en-us/unreal-engine/functions", light=False)}
{fig(vendor["n8n"], "<b>n8n · Canvas Group</b> — expanded as a translucent region with a header card; collapsed in place to a bar wires still attach to. The second geometry, with no ports: change 1's field.", "https://docs.n8n.io/build/understand-workflows/workflow-components/canvas-groups", light=False)}
{fig(shots["carried"], "<b>bbox-ui today · the carried value</b> — one back cable wearing z⁻¹, the seed entering from outside, the name on the cable and not in a box. Unchanged by this proposal.", "story components-blocks-blockregion-loop--for-loop-carried · :5421 read-only capture")}
</div>

<h2 id="sources">Source index</h2>
<ol class="src">{src_index}</ol>
<div class="foot">Built by <code>docs/build_visual_grammar_proposal.py</code>. Field boards: <code>docs/capture_grammar_field_boards.mjs</code> over the running vocab-boards app (React Flow node/edge types over buckets.json). Today/proposed boards: <code>docs/grammar_board.py</code>, an extension of <code>docs/vocab_board.py</code> — the renderer the kit was ported from (verify.mjs: 0 differing pixels on 5 of 6 sample boards). Vendor screenshots belong to their vendors and are reproduced as documentation references. Feedback buttons copy out as markdown naming each item; nothing here is stored anywhere but this page.</div>
</div>
{FB.ui("visual-grammar-proposal-2026-09-23", noun="item")}
{FB.JS}
</body></html>'''

    with open(args.out, "w") as f:
        f.write(page)
    size = os.path.getsize(args.out)
    print(f"wrote {args.out}: {size:,} bytes; data: payload {_PAYLOAD['bytes']:,} bytes in {_PAYLOAD['n']} images; boards {B.count}")
    if _PAYLOAD["bytes"] > DATA_BUDGET:
        raise SystemExit(f"data: payload {_PAYLOAD['bytes']:,} > {DATA_BUDGET:,} — this page belongs in reports/media/, not reports/")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scratch", required=True)
    ap.add_argument("--board-css", default=os.path.join(HERE, "..", "apps", "vocab-boards", "dist", "board.css"))
    ap.add_argument("--out", required=True)
    build(ap.parse_args())


if __name__ == "__main__":
    main()
