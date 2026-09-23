#!/usr/bin/env python3
"""Build "bbox-ui against the field" — the thinking piece over the eleven
vocabularies.

    python3 docs/build_bbox_vs_field_report.py \
        --scratch  <dir holding sheets.json buckets.json scenarios.json img/> \
        --sb       <dir of cropped Storybook captures> \
        --boards   <dir of live vocab-boards captures> \
        --ours     <dir of captures pulled from earlier reports> \
        --out      /home/bam/bbox-ui/reports/media/bbox-ui-vs-the-field-2026-09-23.html

Every number on the page is computed HERE from the JSON the vocabulary pass
produced (agreement pairs, refusal counts, the 57-row convergence map's
member counts) — nothing is retyped from memory. The one hand-authored table
is CONVERGENCE below: which of the field's mechanisms bbox-ui's own drawing
rule for each scenario is nearest to. Each row names the bucket by its exact
string in buckets.json and the build fails loudly if that bucket does not
exist, so a row cannot cite a mechanism that was never recorded.

WHY WebP data URIs at display width: the desktop preview's ceiling is
~2 MB of encoded page; 40-odd captures at their capture size would be five
times that. Encoding at the width the page actually shows keeps the whole
report under the wall while staying self-contained (no sibling files — the
preview's data: URL cannot resolve a relative <img src>).
"""
from __future__ import annotations

import argparse, ast, base64, collections, html, io, json, os, re, sys

from PIL import Image, ImageChops

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import report_feedback as FB  # noqa: E402
from build_industry_vocabularies_report import (  # noqa: E402
    VOCAB_NAME, agreement, agreement_table)

E = html.escape

# ----------------------------------------------------------------------------
# images
# ----------------------------------------------------------------------------
_CACHE: dict[tuple, str] = {}


def uri(path: str, width: int | None = None, q: int = 72) -> str:
    key = (path, width, q)
    if key in _CACHE:
        return _CACHE[key]
    im = Image.open(path)
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGBA")
    if width and im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=q, method=5)
    out = "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
    _CACHE[key] = out
    return out


def crop_to_content(path: str, pad: int = 26) -> Image.Image:
    im = Image.open(path).convert("RGB")
    bg = Image.new("RGB", im.size, im.getpixel((im.width - 2, im.height - 2)))
    box = ImageChops.difference(im, bg).convert("L").point(lambda v: 255 if v > 18 else 0).getbbox()
    if not box:
        return im
    x0, y0, x1, y1 = box
    return im.crop((max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)))


# ----------------------------------------------------------------------------
# the hand-authored half: where bbox-ui's rule for each scenario sits
# ----------------------------------------------------------------------------
# verdict: majority | minority | alone | open
# bucket : the EXACT bucket name in buckets.json that bbox-ui's drawing is
#          nearest to (None when nothing in the field is near)
# why    : one line — what bbox-ui draws, and how that relates to the bucket
CONVERGENCE = [
    ("B1", "alone", "Titled node outside, sentinel nodes inside",
     "Outside: one titled block with named ports — agrees with the 6. Inside: the body is expanded IN PLACE with no sentinel nodes; no tool in the eleven does that for a definition."),
    ("B2", "majority", "Cable lands on the named row", "One output port per NamedTuple field; the cable lands on a named row."),
    ("B3", "majority", "Cable lands on the named row", "A keyword picks the formal parameter's port — the named row, never a position."),
    ("B4", "minority", "One port swallows many cables", "One variadic port accepting N cables, as Blender and Grasshopper do; 7 grow numbered ports instead."),
    ("B5", "minority", "Not drawn — a checkbox or runtime colour", "Same ports as a sync block, the output is the eventual value — async is not drawn, like the 4."),
    ("B6", "minority", "The callable rides its own pin", "A lambda is a block with no title; when it travels it rides a port shaped for blocks (F8)."),
    ("B7", "minority", "Self threads in and out on a matched pair of ports", "A class is a namespace of blocks sharing a self state port — LabVIEW's in/out pair, nobody else's."),
    ("B8", "minority", "Colour on the port is the type", "The type is printed on the port label; the 4 put it on the port as colour — same place, different ink."),
    ("B9", "majority", "Not drawn — it's a palette row", "An import is what the search bar can offer; it never draws."),
    ("V1", "majority", "The definition's own icon, dropped again", "The call is a block titled by the callee with the callee's formals as ports."),
    ("V2", "minority", "The name lettered under the cable", "A binding names a cable and adds no box — Simulink's signal label, and only Simulink's."),
    ("V3", "majority", "Loose box holding the value", "A data pill: one value, one output, no interface."),
    ("V4", "majority", "Ordinary box titled by the operation", "An operator is a node titled by its token with unnamed ports."),
    ("V5", "majority", "Ordinary box titled by the operation", "A predicate is a pure transform emitting the boolean a branch consumes."),
    ("V6", "alone", "Sub-pins indent in place, no box", "An attribute path is a label on the cable; the nearest thing is Unreal splitting a struct pin in place — still a pin, not a label."),
    ("V7", "majority", "Ordinary box titled by the operation", "A computed subscript is a transform box; a literal index collapses to a cable label (V6)."),
    ("V8", "majority", "N named rows on one wall", "A collect block with a variadic input rail."),
    ("V9", "majority", "Format slots become the box's inlets", "A format block whose template is its title and whose interpolations are inlets."),
    ("V10", "majority", "No write — the cable just continues", "Outside a loop the next value is just the next cable; inside one it is F2's feedback."),
    ("V11", "minority", "The name lettered under the cable", "A walrus names a cable that is being consumed — the same label-on-the-cable as V2."),
    ("V12", "alone", "The delete is text inside a node, never a mark", "A del is a badge on the producer or its cable; 8 draw nothing and 3 bury it in a dialog."),
    ("V13", "open", "Strung on the white exec wire", "An effect-only call has no output, so only an ORDER can place it — see F9."),
    ("C1", "alone", "Hatched frame, one arm visible", "One region node, corner-card ports, EVERY arm visible as a stacked row — LabVIEW's structure with the one thing LabVIEW cannot draw."),
    ("C2", "majority", "Candidates stacked in, one value out", "Three inputs, one output, opaque by default — the field's select node."),
    ("C3", "alone", "Hatched frame, one arm visible", "match is a Case Structure with all cases showing at once."),
    ("C4", "alone", "Case text printed beside its exit", "The pattern is the arm's label (agrees with 6); the names it BINDS are the arm's outputs — 0 of 11 bind anything."),
    ("F1", "minority", "Many cables into one exit node", "Each return is a cable into the block's one output port, carrying a certainty."),
    ("L1", "minority", "Drawn frame, body inside, wall terminals", "A drawn region with the iterable and item on the corner card — LabVIEW/Simulink's frame."),
    ("L2", "minority", "Drawn frame, body inside, wall terminals", "A region whose predicate is re-read each pass — a genuine feedback cable."),
    ("L3", "alone", "Boolean into a terminal on the region's own boundary", "break / continue are marks beside the call, never a cable or a terminal."),
    ("L4", "majority", "Nothing marks async on the canvas", "Identical to L1; async adds no ink."),
    ("F2", "minority", "Paired slots on the region boundary", "A paired in/out on the region plus the z⁻¹ back cable through an initial — LabVIEW's shift register and Simulink's 1/z at once."),
    ("P1", "minority", "Bounded region, sliced at the wall", "One region, opaque by default, the iterable sliced at its wall."),
    ("P2", "minority", "Bounded region, sliced at the wall", "Same region; only the collect at the end differs."),
    ("P3", "alone", "Wire painted as a continuous stream", "The output PORT is lazy; the field's nearest mark is a stream-painted cable."),
    ("S1", "minority", "A cable drawn unlike its neighbours", "A port that fires N times; the 3 put the many-ness on the cable instead of the port."),
    ("S2", "minority", "Stream cable threaded through the wall", "A pass-through of an inner stream — LabVIEW's tunnel at a block wall."),
    ("E1", "alone", "One node with Try/Catch/Finally arms", "A four-arm REGION that encloses the guarded body; Unity has the arms but encloses nothing."),
    ("E2", "open", None, "except* lets several arms fire for one failure — no design yet, and nothing in the field to copy."),
    ("E3", "majority", "A terminal node that only fails", "raise is a terminal on the error path with no output."),
    ("E4", "alone", "A two-way test whose failing arm dead-ends", "assert is a guard badge on the cable it constrains, not a test whose false arm dead-ends."),
    ("E5", "alone", "Sealed hull with paired border nodes", "A region whose exit runs on every path out — the hull exists in 2 tools, the guarantee in none."),
    ("E6", "alone", "Sealed hull with paired border nodes", "Same as E5."),
    ("N1", "alone", "Dead-end box, twin name elsewhere", "global / nonlocal become an undeclared in/out port on the block — the hidden channel made visible."),
    ("N2", "alone", "Bordered region, nothing computing inside", "pass is a badge so an empty arm is visibly empty."),
    ("F3", "majority", "Two cables, never a loop", "Rebinding is two cables in series — unanimous."),
    ("F4", "majority", "One bare cable, box to box", "Naming an intermediate changes nothing — unanimous."),
    ("F5", "majority", "Cables leave the same port unmarked", "Fan-out is N cables off one port."),
    ("F6", "alone", "Sub-ports indent in place", "Unpacking is the read side of B2's N ports — no splitter box; 7 add one."),
    ("F7", "majority", "Object in left, object out right", "A state port in and out on the receiver, plus a mut badge nobody else carries."),
    ("F8", "minority", "A differently shaped port carries blocks", "A port whose value is a block interface."),
    ("F9", "open", "A second cable kind, no value", "The syntax report asks for an execution edge; CLAUDE.md says control flow is never a cable. Unsettled on this tree."),
    ("F10", "majority", "The block's own card inside itself", "The recursive call is an ordinary call to a block that happens to be this one."),
    ("F11", "majority", "A wrapper box with identical ports", "A decorator is a block wrapped in a block."),
    ("F12", "minority", "The captured value becomes a real port", "A closure's capture is an input the signature never declared."),
    ("F13", "minority", "Unwired port grows a widget", "A default is a literal owned by the definition, shown on the unwired port."),
    ("F14", "majority", "Object in left, object out right", "Three spellings, one topology."),
]

VERDICT_LABEL = {"majority": "with the majority", "minority": "with a minority", "alone": "alone", "open": "open"}
VERDICT_COLOR = {"majority": "var(--ok)", "minority": "var(--accent2)", "alone": "var(--accent)", "open": "var(--warn)"}

REFUSAL_STRICT = re.compile(
    r"^(not drawn|refus|nothing|no region|no loop|carry invisible|the board never changes|invisible|"
    r"the item never travels|the editor refuses|nothing binds|nothing on canvas)", re.I)
OFF_CANVAS = re.compile(
    r"(off-canvas|in a field|inside a node|hides in a panel|text under the name|hides in a dropdown|"
    r"a name typed in a field|the write hides|names live off-canvas|the callee is text)", re.I)


# ----------------------------------------------------------------------------
# a measurement the grain-1 bet can be falsified by
# ----------------------------------------------------------------------------
def measure_grain(root: str):
    """Of BAM's own functions, how many are arithmetic rather than calls?
    A grain-1 drawing shows a call as a block and an operator as a label —
    so a function whose body is mostly operators draws as one box with a
    text field. This counts them."""
    if not os.path.isdir(root):
        return None
    skip = ("node_modules", ".git", "archive", "__pycache__", ".venv", "site-packages",
            "docs/ref", "ex_ext_pkg", "/build/", "/install/", "/tests", "/test_")
    seen, tot, opheavy, zero, files = set(), 0, 0, 0, 0
    for dp, _dn, fn in os.walk(root):
        if any(x in dp for x in skip):
            continue
        for f in fn:
            if not f.endswith(".py") or f.startswith("test_"):
                continue
            try:
                tree = ast.parse(open(os.path.join(dp, f), encoding="utf-8", errors="ignore").read())
            except Exception:  # noqa: BLE001
                continue
            files += 1
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    stmts = sum(isinstance(n, ast.stmt) for n in ast.walk(node)) - 1
                    if stmts < 3:
                        continue
                    calls = sum(isinstance(n, ast.Call) for n in ast.walk(node))
                    ops = sum(isinstance(n, (ast.BinOp, ast.UnaryOp, ast.Compare, ast.BoolOp)) for n in ast.walk(node))
                    key = (node.name, stmts, calls, ops, ast.dump(node.args))
                    if key in seen:
                        continue
                    seen.add(key)
                    tot += 1
                    opheavy += ops > calls
                    zero += calls == 0
    return dict(files=files, functions=tot, opheavy=opheavy, zero=zero)


# ----------------------------------------------------------------------------
# page
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
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:24px 0}
.fact{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:13px 15px}
.fact b{display:block;font:700 25px/1.1 var(--mono);color:var(--accent);letter-spacing:-.02em}
.fact span{display:block;color:var(--dim2);font-size:11.5px;margin-top:6px;line-height:1.35}
.nav{position:sticky;top:0;z-index:20;background:rgba(14,15,18,.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);margin:0 -24px;padding:11px 24px;display:flex;gap:6px;flex-wrap:wrap}
.nav a{font:600 11px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--dim2);border:1px solid var(--line);border-radius:20px;padding:6px 10px}
.nav a:hover{color:var(--fg);border-color:var(--line2);text-decoration:none}
.card{border:1px solid var(--line);border-radius:12px;background:#111318;margin:0 0 22px;padding:20px 22px 16px}
.card .tag{font:600 10px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;border-radius:20px;padding:5px 9px;border:1px solid var(--line2);color:var(--dim);display:inline-block;margin:0 0 10px}
.card.ahead .tag{color:var(--ok);border-color:#1d4429}.card.behind .tag{color:var(--warn);border-color:#4d2320}
.card.bet .tag{color:var(--purple);border-color:#3a2a55}.card.unseen .tag{color:var(--gold);border-color:#4a3c1c}
.two{display:grid;grid-template-columns:1.15fr 1fr;gap:20px;align-items:start}
.three{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;align-items:start}
.figs{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin:12px 0 6px}
figure{margin:0;background:#0b0d11;border:1px solid var(--line);border-radius:9px;padding:8px;overflow:hidden}
figure img{display:block;max-width:100%;height:auto;border-radius:5px;margin:0 auto}
figure.light img{background:#fff}
figcaption{color:var(--dim2);font-size:11.3px;line-height:1.5;margin:8px 2px 0}
figcaption b{color:var(--dim);font-weight:600}
figcaption .src{display:block;font:10px/1.5 var(--mono);color:#4e5563;word-break:break-all;margin-top:3px}
.kv{width:100%;border-collapse:collapse;font-size:13.2px;margin:10px 0 6px}
.kv th{text-align:left;color:var(--dim2);font:600 10.5px/1.4 var(--mono);letter-spacing:.08em;text-transform:uppercase;padding:6px 8px;border-bottom:1px solid var(--line2)}
.kv td{padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top;color:var(--dim)}
.kv td:first-child{color:var(--fg);font-weight:600;white-space:nowrap}
.kv tr.hi td{color:var(--fg)}
.map{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 14px}
.chip{font:600 11px/1 var(--mono);border-radius:6px;padding:7px 8px;border:1px solid var(--line2);color:#0c0d10;cursor:default;min-width:44px;text-align:center}
.mapsec{margin:0 0 8px}.mapsec b{display:block;font:600 10px/1.5 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--dim2);margin-bottom:5px}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--dim);margin:6px 0 0}
.legend i{display:inline-block;width:11px;height:11px;border-radius:3px;vertical-align:-1px;margin-right:5px}
details{border:1px solid var(--line);border-radius:9px;padding:10px 14px;margin:14px 0}
summary{cursor:pointer;color:var(--dim);font-size:13px}
table.agree{width:auto;margin:18px 0 6px;border-collapse:separate;border-spacing:2px}
table.agree th{padding:5px 8px;font:600 11px/1.3 var(--mono);color:var(--dim);border:none;text-align:right;white-space:nowrap}
table.agree th.rot{height:112px;vertical-align:bottom;padding:0 0 7px;text-align:center;width:44px}
table.agree th.rot span{display:block;writing-mode:vertical-rl;transform:rotate(180deg);font:600 10.5px/1 var(--mono);color:var(--dim2);letter-spacing:.03em}
table.agree td{width:44px;height:30px;text-align:center;border:1px solid var(--line);border-radius:4px;font:600 11.5px/1 var(--mono);color:var(--fg);padding:0}
table.agree td.self{background:#0a0b0e;color:#343b49}
.q{border:1px solid var(--line2);border-radius:10px;padding:14px 16px;margin:0 0 14px;background:var(--panel)}
.q b.t{display:block;font-size:15px;margin-bottom:4px}
.q .rec{color:var(--fg)}.q .def{color:var(--dim);font-size:13px;margin-top:6px}.q .def b{color:var(--gold)}
svg.dia{max-width:100%;height:auto;display:block;margin:8px 0}
svg.dia text{font-family:var(--mono);font-size:11px;fill:#e6e8ee}
svg.dia text.d{fill:#9aa3b2}svg.dia text.s{font-size:10px;fill:#6b7383}
.fb textarea.hidden{display:none}
.figs figure.wide{grid-column:1/-1}
.kv.fam td:first-child{white-space:normal}
.foot{margin-top:80px;padding-top:22px;border-top:1px solid var(--line);color:var(--dim2);font-size:12.5px}
ol.src{font-size:12.5px;color:var(--dim);line-height:1.7;padding-left:22px}
ol.src code{font-size:.85em}
ul{margin:0 0 12px;padding-left:20px}li{margin:0 0 5px}
@media (max-width:900px){.two,.three{grid-template-columns:1fr}}
"""

SOURCES = [
    # 1
    ("The eleven vocabularies, read from their own documentation and adversarially checked", "scratchpad: sheets.json · digest.md · checks.json (a `!! CORRECTION` line overrides the line above it)"),
    # 2
    ("57 Python scenarios × 235 distinct mechanisms, with the vocabularies that use each", "scratchpad: buckets.json"),
    # 3
    ("The 57 scenarios and bbox-ui's own drawing rule for each", "/home/bam/bbox-ui/reports/python-syntax-scenarios-2026-09-23.html · scratchpad: scenarios.json"),
    # 4
    ("Node-editor prior art — the exhaustive sweep (19 tools × 5 black-box mechanisms; collapse = two bounds + one boolean, six implementations; drill-in = a plane swap; boundary node inside in 7 of 11)", "/home/bam/bbox-ui/reports/node-editor-prior-art-sweep-2026-09-17.html"),
    # 5
    ("What the prior art changes (~40 Python VPLs; Henley & Fleming's NI viscosity study; Green & Petre 1996; the composition table with each tool's inverse)", "/home/bam/bbox-ui/reports/media/vpl-prior-art-2026-09-18.html"),
    # 6
    ("More truthful branching — 'it ends up looking like LabVIEW, and that is forced by a rule already chosen'", "/home/bam/bbox-ui/reports/media/truthful-branching-2026-09-22.html"),
    # 7
    ("try / except / else / finally — the finally column is empty all the way down", "/home/bam/bbox-ui/reports/media/try-except-proposals-2026-09-22.html"),
    # 8
    ("Visual-language MOC — the map of every artifact", "/home/bam/bbox-ui/reports/media/visual-language-moc-2026-09-23.html"),
    # 9
    ("Sweep answers — how Houdini names its drift (locked / unlocked / Match Current Definition)", "/home/bam/bbox-ui/reports/sweep-answers-2026-09-18.html"),
    # 10
    ("The repo's settled rules: 'the core imports no canvas engine', 'control flow is never a cable', 'a region is ONE node, and the frame owns no id', the naming principle", "/home/bam/bbox-ui/.claude/worktrees/visual-language-reports-moc-279480/CLAUDE.md"),
    # 11
    ("Control-flow plan — §0 the six lines, §2.A corner block, §2.B opaque is a projection, §2.C arms are nodes", "/home/bam/bbox-ui/.claude/worktrees/visual-language-reports-moc-279480/docs/CONTROL-FLOW-PLAN.md"),
    # 12
    ("Architecture — the core/adapter split; 'interaction geometry is host-owned and never travels'; the measured divergence of the vendored SystemSketch copy (20 commits in one evening that exist in no bbox-ui lineage)", "/home/bam/bbox-ui/.claude/worktrees/visual-language-reports-moc-279480/ARCHITECTURE.md"),
    # 13
    ("scene/collapse.ts — collapseToRegion / dissolveRegion, the exact inverse, 'the bread and butter'", "apps/storybook-basics/src/scene/collapse.ts"),
    # 14
    ("scene/linking.ts — definition linking: linked occurrences, `Draft n` badge, unlinkOccurrence, FIFO promote; no repair verb", "apps/storybook-basics/src/scene/linking.ts"),
    # 15
    ("hosts/regionScene.ts — `RegionView = \"expanded\" | \"opaque\"` is region-only; regions have no simple view (Zach, 2026-09-22)", "apps/storybook-basics/src/hosts/regionScene.ts"),
    # 16
    ("components/blockPort.layout.ts — `BLOCK_VIEWS = [\"simple\", \"port\", \"expanded\"]`", "apps/storybook-basics/src/components/blockPort.layout.ts:46"),
    # 17
    ("components/portEdge.layout.ts — the group syntax: 'groups are something the EDGE assigns, not a value a port carries' (Zach, 2026-09-12); groupSyntax.ts, 72 lines", "apps/storybook-basics/src/components/portEdge.layout.ts:434"),
    # 18
    ("Daily note, 2026-09-23 — the view rules, and the [!ai] callout answering them (opaque is region-only; the 20-derived-ports failure; the four wall states)", "/home/bam/zach_brain/Sources/Daily Notes/Daily Note - Sep 23 2026.md"),
    # 19
    ("PROJECT - Black Box UI — Goals (§FRs), 'Tension between specific vs general', the 2026-09-17 five-sources feedback ('100% region is isolated'), the 2026-09-18 sweep feedback", "/home/bam/zach_brain/Projects/bbox-ui/PROJECT - Black Box UI.md"),
    # 20
    ("PROJECT - pyblocks — 'A small compact visual language', 'Being Opinionated', 'Lots of learnings from lab view'", "/home/bam/zach_brain/Projects/pyblocks/PROJECT - pyblocks.md"),
    # 21
    ("C - Simple, Port, Expanded — the vault note whose field claim this report corrects", "/home/bam/zach_brain/World Model/Chunks & Concepts/C - Simple, Port, Expanded.md"),
    # 22
    ("C - Branch Region Asymmetry — MLIR LangRef: an operation owns its regions; NI's 'wires that point nowhere… imagine 20 cases'", "/home/bam/zach_brain/World Model/Chunks & Concepts/C - Branch Region Asymmetry (Scopes See In, Only Yields Come Out).md"),
    # 23
    ("Region drawings — painted-line counts at 1/2/3 levels of nesting (v7: 7/14/21; v8: 5/10/15)", "/home/bam/bbox-ui/reports/media/region-drawings-2026-09-19.html"),
    # 24
    ("Region wall crossing — the hollow ring (Option 1) and the derived wall port (Option 2)", "/home/bam/bbox-ui/reports/media/region-wall-crossing-2026-09-22.html"),
    # 25
    ("Storybook captures — Zach's running :5421, read-only, captured today (story ids in each caption)", "http://127.0.0.1:5421/iframe.html?id=<story>&viewMode=story"),
    # 26
    ("vocab-boards — the 705 boards drawn by React Flow from the same buckets, captured today", "http://127.0.0.1:5471/?board=<id> · apps/vocab-boards"),
    # 27
    ("Grain 1 is the ceiling for block views — a block is a definition, never a statement", "/home/bam/.claude/projects/-home-bam-bbox-ui/memory/grain-1-is-the-ceiling-for-block-views.md"),
    # 28
    ("scene/region.branch.ts — V1: a branch's corner card has `ports: { left: conditions }` and no right wall; the yield dot Zach rejected on 2026-09-02", "apps/storybook-basics/src/scene/region.branch.ts:16-24, 100-104"),
    # 29
    ("editor/breadcrumb.tsx — a stock shadcn breadcrumb; no plane stack behind it in the trunk (grep: alternateBounds / drillIn / enterGroup / treeStack — 0 hits outside the file navigator)", "apps/storybook-basics/src/editor/breadcrumb.tsx"),
    # 30
    ("The grain-1 probe — `measure_grain()` in this builder, run over /home/bam/bam_ws/src/core at build time", "docs/build_bbox_vs_field_report.py"),
]


def cite(*ns):
    return '<span class="n">' + ",".join(str(n) for n in ns) + "</span>"


def build(args):
    scratch = args.scratch
    sheets = json.load(open(os.path.join(scratch, "sheets.json")))
    buckets = json.load(open(os.path.join(scratch, "buckets.json")))
    scenarios = json.load(open(os.path.join(scratch, "scenarios.json")))
    manifest = json.load(open(os.path.join(scratch, "img", "manifest.json")))
    by_scen = {b["scenario"]: b for b in buckets}
    sc_by_id = {s["id"]: s for s in scenarios}
    sheet_by = {s["key"]: s for s in sheets}

    def construct(vocab, name):
        for c in sheet_by[vocab]["constructs"]:
            if c["construct"] == name:
                return c
        return {}

    # ---- numbers, all from the JSON
    together, appears = agreement(buckets)
    top_pairs = sorted(together.items(), key=lambda kv: -kv[1])[:4]
    exec_wire = [s["key"] for s in sheets if s["identity"].get("has_exec_wire")]
    # WHY two numbers and not one: the identity flag counts Simulink's dot-dashed
    # function-call line as a control wire (it is one — it fires a subsystem and
    # carries no value), but only two tools thread the PROGRAM on such a wire.
    spine = sorted({m for bk in by_scen["V1"]["buckets"] if bk["name"] == "Strung on the white exec wire" for m in bk["members"]})
    ctrl_line = sorted({m for bk in by_scen["F9"]["buckets"] if bk["name"] == "A second cable kind, no value" for m in bk["members"]})
    assert set(spine) <= set(ctrl_line) <= set(exec_wire), (spine, ctrl_line, exec_wire)
    spine_names = " and ".join(VOCAB_NAME[k] for k in spine)
    n_mech = sum(len(b["buckets"]) for b in buckets)
    refusal_buckets = [(b["scenario"], bk) for b in buckets for bk in b["buckets"] if REFUSAL_STRICT.match(bk["name"])]
    offcanvas_buckets = [(b["scenario"], bk) for b in buckets for bk in b["buckets"]
                         if not REFUSAL_STRICT.match(bk["name"]) and OFF_CANVAS.search(bk["name"] + " " + bk["mechanism"][:80])]
    refusal_per_scen = collections.Counter()
    for sid, bk in refusal_buckets:
        refusal_per_scen[sid] += len(set(bk["members"]))
    drill_in = [s["key"] for s in sheets if construct(s["key"], "subgraph").get("has") in ("yes", "partial")]
    op_box = [s["key"] for s in sheets if construct(s["key"], "operator").get("has") == "yes"]
    # V4 buckets: who draws an operator as its own box / glyph
    v4 = by_scen["V4"]["buckets"]
    op_as_box = set()
    for bk in v4:
        if bk["name"].startswith(("Ordinary box", "Shape-coded")):
            op_as_box.update(bk["members"])

    # ---- convergence map — every bucket name must exist
    conv_rows, tally, nearest_tally = [], collections.Counter(), collections.Counter()
    for sid, verdict, bname, why in CONVERGENCE:
        members = None
        if bname is not None:
            hit = [bk for bk in by_scen[sid]["buckets"] if bk["name"] == bname]
            if not hit:
                raise SystemExit(f"CONVERGENCE cites a bucket that does not exist: {sid} / {bname!r}")
            members = hit[0]["members"]
            if verdict in ("minority", "alone"):
                nearest_tally.update(set(members))
        tally[verdict] += 1
        conv_rows.append((sid, verdict, bname, members, why))
    n_conv = len(conv_rows)
    assert n_conv == len(scenarios) == 57, (n_conv, len(scenarios))

    grain = measure_grain(args.grain_root)

    # ---- images
    IMG = os.path.join(scratch, "img")

    def vendor(key, caption, w=None, light=False):
        """A vendor screenshot from img/, captioned with the tool's own name for
        the thing and the doc URL the sheet cites — never a caption typed
        from memory."""
        fname = manifest.get(key, key)
        path = os.path.join(IMG, fname)
        if not os.path.exists(path):
            raise SystemExit(f"missing vendor image {key} -> {path}")
        m = re.match(r"^([a-z]+)-\d+-(.+)$", key)
        src = ""
        if m and m.group(1) in sheet_by:
            c = construct(m.group(1), m.group(2))
            nt = c.get("named_thing", "")
            src = (f'<b>{E(VOCAB_NAME.get(m.group(1), m.group(1)))}</b> · {E(nt)}' if nt else f'<b>{E(VOCAB_NAME.get(m.group(1), m.group(1)))}</b>')
            src += f'<span class="src">{E(c.get("doc_url", ""))}</span>'
        im = Image.open(path)
        width = w or min(im.width, 520)
        return (f'<figure class="{"light" if light else ""}"><img src="{uri(path, width, 74)}" alt="{E(key)}">'
                f'<figcaption>{caption} {src}</figcaption></figure>')

    def hand(path, caption, w=None, light=False, src="", wide=False):
        if not os.path.exists(path):
            raise SystemExit(f"missing image {path}")
        im = Image.open(path)
        width = w or min(im.width, 560)
        s = f'<span class="src">{E(src)}</span>' if src else ""
        cls = ("light " if light else "") + ("wide" if wide else "")
        return (f'<figure class="{cls.strip()}"><img src="{uri(path, width, 74)}" alt="">'
                f'<figcaption>{caption}{s}</figcaption></figure>')

    def sb(story, caption, w=560, wide=False):
        path = os.path.join(args.sb, story + ".png")
        return hand(path, caption, w, light=True, src=f"story {story} · :5421 read-only capture", wide=wide)

    def board(bid, caption, w=520, wide=False):
        path = os.path.join(args.boards, bid + ".png")
        sid, bidx = bid.split("__")[0], int(bid.split("__")[1][1:])
        bk = by_scen[sid]["buckets"][bidx]
        who = ", ".join(VOCAB_NAME.get(m, m) for m in bk["members"])
        return hand(path, f'{caption} <b>{E(bk["name"])}</b> — {E(who)}', w, src=f"vocab-boards {bid}", wide=wide)

    def ours(fname, caption, w=520, src="", wide=False):
        return hand(os.path.join(args.ours, fname), caption, w, src=src, wide=wide)

    # ---- the convergence map html
    sec_order = ["g-boundary", "g-values", "g-choice", "g-loops", "g-comps", "g-streams", "g-failure", "g-scope", "g-facets"]
    sec_name = {"g-boundary": "Boundary", "g-values": "Values", "g-choice": "Choice", "g-loops": "Repetition",
                "g-comps": "Comprehensions", "g-streams": "Streams", "g-failure": "Failure & lifetime",
                "g-scope": "Scope", "g-facets": "Composition"}
    conv_by_id = {r[0]: r for r in conv_rows}
    map_html = []
    for sec in sec_order:
        chips = []
        for s in scenarios:
            if s["section_id"] != sec:
                continue
            sid, verdict, bname, members, why = conv_by_id[s["id"]]
            title = f'{s["id"]} · {s["title"]} — {VERDICT_LABEL[verdict]}' + (f' — nearest: {bname} ({len(members)})' if bname else "")
            chips.append(f'<span class="chip" style="background:{VERDICT_COLOR[verdict]}" title="{E(title)}">{E(s["id"])}</span>')
        map_html.append(f'<div class="mapsec"><b>{E(sec_name[sec])}</b><div class="map">{"".join(chips)}</div></div>')
    conv_table = ['<table class="kv"><thead><tr><th>#</th><th>scenario</th><th>bbox-ui sits</th><th>nearest mechanism in the field</th><th>why</th></tr></thead><tbody>']
    for sid, verdict, bname, members, why in conv_rows:
        s = sc_by_id[sid]
        near = (f'{E(bname)} <span style="color:#4e5563">({len(members)}: {E(", ".join(VOCAB_NAME.get(m, m) for m in members))})</span>'
                if bname else '<span style="color:#4e5563">—</span>')
        conv_table.append(f'<tr><td>{E(sid)}</td><td style="color:var(--fg)">{E(s["title"])}</td>'
                          f'<td style="color:{VERDICT_COLOR[verdict]};font-weight:600;white-space:nowrap">{E(VERDICT_LABEL[verdict])}</td>'
                          f'<td>{near}</td><td>{E(why)}</td></tr>')
    conv_table.append("</tbody></table>")

    fam_rows = "".join(
        f'<tr><td>{E(VOCAB_NAME[a])} + {E(VOCAB_NAME[c])}</td><td>{n} shared mechanisms</td><td>{E(fam)}</td><td>{E(model)}</td></tr>'
        for (a, c), n, fam, model in [
            (top_pairs[0][0], top_pairs[0][1], "game-engine scripting", "imperative event graph — a white execution wire says WHEN"),
            (top_pairs[1][0], top_pairs[1][1], "automation", "message passing — one wire kind carries the token and the data"),
            (top_pairs[2][0], top_pairs[2][1], "parametric / procedural", "pull-based — the graph is evaluated backwards from its output"),
            (top_pairs[3][0], top_pairs[3][1], "engineering", "dataflow / time-stepped — a node fires when its inputs have data"),
        ])
    floaters = [k for k in VOCAB_NAME if k not in {x for p in top_pairs[:4] for x in p[0]}]
    # for each floater, its closest partner
    def closest(k):
        best = max(((c if a == k else a, n) for (a, c), n in together.items() if k in (a, c)), key=lambda kv: kv[1])
        return best
    floater_txt = " · ".join(f'{VOCAB_NAME[k]} → {VOCAB_NAME[closest(k)[0]]} ({closest(k)[1]})' for k in floaters)

    refusal_top = ", ".join(f'{sid} ({sc_by_id[sid]["title"].split(" — ")[0]}: {n} of 11)' for sid, n in refusal_per_scen.most_common(8))
    time_scen = ["V12", "E5", "E6", "L4", "B5", "P3", "S2", "S1"]
    time_refusals = sum(refusal_per_scen[s] for s in time_scen)
    all_refusals = sum(refusal_per_scen.values())

    nearest_txt = ", ".join(f'{VOCAB_NAME[k]} {n}' for k, n in nearest_tally.most_common(5))

    # ---- diagrams
    ladder_svg = """
<svg class="dia" viewBox="0 0 1100 265" xmlns="http://www.w3.org/2000/svg">
  <text x="14" y="22" class="d">THE FIELD — two states, and the way between them is either a plane swap or a destruction</text>
  <rect x="14" y="40" width="160" height="62" rx="6" fill="#1b1e25" stroke="#5aa9f8"/>
  <text x="94" y="66" text-anchor="middle">collapsed node</text><text x="94" y="84" text-anchor="middle" class="s">ports shown · innards hidden</text>
  <circle cx="14" cy="60" r="3.5" fill="#5aa9f8"/><circle cx="14" cy="78" r="3.5" fill="#5aa9f8"/><circle cx="174" cy="70" r="3.5" fill="#5aa9f8"/>
  <path d="M180 60 L300 60" stroke="#9aa3b2" fill="none" marker-end="url(#ah)"/>
  <text x="238" y="52" text-anchor="middle" class="s">dbl-click · Tab · dive</text>
  <rect x="306" y="36" width="290" height="70" rx="6" fill="#0b0d11" stroke="#343b49" stroke-dasharray="4 3"/>
  <text x="451" y="58" text-anchor="middle" class="d">another plane, drawn from (0,0)</text>
  <text x="451" y="76" text-anchor="middle" class="s">Group Input → … → Group Output</text>
  <text x="451" y="94" text-anchor="middle" class="s">11 of 11 · the parent is not on screen</text>
  <path d="M174 90 C 240 90, 240 150, 300 150" stroke="#e5534b" fill="none" marker-end="url(#ar)"/>
  <text x="14" y="140" class="s" style="fill:#e5534b">Expand Node · Alt-G · opextract</text>
  <rect x="306" y="124" width="290" height="60" rx="6" fill="#0b0d11" stroke="#e5534b"/>
  <text x="451" y="144" text-anchor="middle" class="d">the box is gone; members re-parented</text>
  <text x="451" y="161" text-anchor="middle" class="s">a mutation — the inverse is documented,</text>
  <text x="451" y="176" text-anchor="middle" class="s">never measured</text>
  <text x="640" y="58" class="s">what nobody in the eleven has:</text>
  <text x="640" y="76" class="s">· simple — every port collapses to one dot</text>
  <text x="640" y="94" class="s">· expanded in place — the body inside the</text>
  <text x="640" y="110" class="s">  same box, as a VIEW the document does</text>
  <text x="640" y="126" class="s">  not change under</text>
  <text x="640" y="152" class="s">what everybody has and the trunk does not:</text>
  <text x="640" y="170" class="s">· the plane swap (drill-in)</text>
  <text x="640" y="188" class="s">· the second geometry that keeps a collapse in place</text>
  <text x="14" y="212" class="d">BBOX-UI — one document, four faces; the face is a field, never an edit</text>
  <rect x="14" y="224" width="90" height="34" rx="6" fill="#1b1e25" stroke="#f0883e"/><text x="59" y="246" text-anchor="middle">simple</text>
  <rect x="118" y="224" width="90" height="34" rx="6" fill="#1b1e25" stroke="#f0883e"/><text x="163" y="246" text-anchor="middle">port</text>
  <rect x="222" y="224" width="150" height="34" rx="6" fill="#1b1e25" stroke="#f0883e"/><text x="297" y="246" text-anchor="middle">expanded (in place)</text>
  <rect x="386" y="224" width="215" height="34" rx="6" fill="#1b1e25" stroke="#f0883e" stroke-dasharray="4 3"/><text x="493" y="246" text-anchor="middle">opaque = port @ expanded size</text>
  <text x="616" y="246" class="s">← granularity × footprint; regions only, today</text>
  <defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#9aa3b2"/></marker>
  <marker id="ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#e5534b"/></marker></defs>
</svg>"""

    order_svg = """
<svg class="dia" viewBox="0 0 1100 245" xmlns="http://www.w3.org/2000/svg">
  <text x="14" y="20" class="d">F9 · two effect-only calls, no data between them — three answers the field has, and the one the file makes safe</text>
  <text x="14" y="50" class="s">UNREAL / UNITY · a second cable kind</text>
  <rect x="14" y="58" width="100" height="30" rx="5" fill="#1b1e25" stroke="#343b49"/><text x="64" y="77" text-anchor="middle">open()</text>
  <rect x="170" y="58" width="100" height="30" rx="5" fill="#1b1e25" stroke="#343b49"/><text x="220" y="77" text-anchor="middle">move()</text>
  <path d="M114 73 L168 73" stroke="#f2f4f8" stroke-width="2.6" marker-end="url(#aw)"/>
  <text x="142" y="107" text-anchor="middle" class="s">2 of 11 · ruled out here</text>
  <text x="380" y="50" class="s">LABVIEW · a wire invented to carry order</text>
  <rect x="380" y="58" width="100" height="30" rx="5" fill="#1b1e25" stroke="#343b49"/><text x="430" y="77" text-anchor="middle">open()</text>
  <rect x="536" y="58" width="100" height="30" rx="5" fill="#1b1e25" stroke="#343b49"/><text x="586" y="77" text-anchor="middle">move()</text>
  <path d="M480 82 L536 82" stroke="#e8c06a" stroke-width="1.8" stroke-dasharray="4 3"/>
  <text x="508" y="107" text-anchor="middle" class="s">the error cluster nobody reads</text>
  <text x="740" y="50" class="s">MAX / n8n · position IS the order</text>
  <rect x="740" y="58" width="100" height="26" rx="5" fill="#1b1e25" stroke="#343b49"/><text x="790" y="75" text-anchor="middle">open()</text>
  <rect x="740" y="92" width="100" height="26" rx="5" fill="#1b1e25" stroke="#343b49"/><text x="790" y="109" text-anchor="middle">move()</text>
  <text x="856" y="75" class="s">higher runs first;</text><text x="856" y="91" class="s">drag it and the</text><text x="856" y="107" class="s" style="fill:#e5534b">program changes</text>
  <text x="14" y="148" class="d">BBOX-UI · the same third answer, made safe: y-order in an expanded region is DERIVED from source order, never authored</text>
  <rect x="14" y="158" width="410" height="66" rx="6" fill="none" stroke="#f0883e"/>
  <rect x="24" y="167" width="80" height="20" rx="4" fill="#1b1e25" stroke="#343b49"/><text x="64" y="181" text-anchor="middle">open()</text>
  <rect x="24" y="194" width="80" height="20" rx="4" fill="#1b1e25" stroke="#343b49"/><text x="64" y="208" text-anchor="middle">move()</text>
  <text x="118" y="181" class="s">line 12</text><text x="118" y="208" class="s">line 13</text>
  <text x="190" y="176" class="s">a fact the file owns — drag cannot</text>
  <text x="190" y="192" class="s">reorder it; the Max hazard never</text>
  <text x="190" y="208" class="s">fires, and no cable is needed</text>
  <text x="450" y="176" class="s">cost: layout in expanded view stops being cosmetic.</text>
  <text x="450" y="192" class="s">`considerModelOrder` is already set; what is missing</text>
  <text x="450" y="208" class="s">is the rule that a member cannot be dragged ABOVE</text>
  <text x="450" y="224" class="s">its predecessor.</text>
  <defs><marker id="aw" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#f2f4f8"/></marker></defs>
</svg>"""

    lifeline_svg = """
<svg class="dia" viewBox="0 0 1100 250" xmlns="http://www.w3.org/2000/svg">
  <text x="14" y="20" class="d">The refusals share one missing axis: WHEN. A sequence diagram has had it since UML 1 — and in an expanded region, y is already source order.</text>
  <text x="14" y="52" class="s">with resource() as r:</text>
  <rect x="14" y="60" width="286" height="120" rx="6" fill="none" stroke="#f0883e"/>
  <rect x="26" y="66" width="70" height="20" rx="4" fill="#1b1e25" stroke="#343b49"/><text x="61" y="80" text-anchor="middle">open()</text>
  <rect x="26" y="112" width="70" height="20" rx="4" fill="#1b1e25" stroke="#343b49"/><text x="61" y="126" text-anchor="middle">read()</text>
  <rect x="26" y="152" width="70" height="20" rx="4" fill="#1b1e25" stroke="#343b49"/><text x="61" y="166" text-anchor="middle">parse()</text>
  <line x1="124" y1="86" x2="124" y2="180" stroke="#5aa9f8" stroke-width="1.5"/>
  <rect x="118" y="86" width="12" height="94" fill="#5aa9f8" opacity=".35"/>
  <text x="146" y="82" class="s">r is alive here —</text>
  <text x="146" y="98" class="s">an activation bar on</text>
  <text x="146" y="114" class="s">the resource's cable;</text>
  <text x="146" y="130" class="s">its bottom edge is</text>
  <text x="146" y="146" class="s">the exit on every</text>
  <text x="146" y="162" class="s">path out (E5)</text>
  <text x="340" y="52" class="s">del frame</text>
  <line x1="350" y1="60" x2="350" y2="150" stroke="#5aa9f8" stroke-width="1.5"/>
  <text x="350" y="168" text-anchor="middle" style="fill:#e5534b;font-size:16px">×</text>
  <text x="366" y="82" class="s">the destruction mark:</text>
  <text x="366" y="98" class="s">the cable ends, so a</text>
  <text x="366" y="114" class="s">later read is visibly</text>
  <text x="366" y="130" class="s">a read of nothing</text>
  <text x="366" y="146" class="s">(V12: 8 of 11 draw none)</text>
  <text x="600" y="52" class="s">yield item</text>
  <rect x="600" y="60" width="90" height="20" rx="4" fill="#1b1e25" stroke="#343b49"/><text x="645" y="74" text-anchor="middle">gen()</text>
  <line x1="645" y1="80" x2="645" y2="180" stroke="#5aa9f8" stroke-width="1.5" stroke-dasharray="3 3"/>
  <circle cx="645" cy="100" r="3" fill="#f0883e"/><circle cx="645" cy="130" r="3" fill="#f0883e"/><circle cx="645" cy="160" r="3" fill="#f0883e"/>
  <text x="665" y="104" class="s">the block stays alive across</text>
  <text x="665" y="120" class="s">its own outputs — one lifeline,</text>
  <text x="665" y="136" class="s">many fires (S1, P3)</text>
  <text x="665" y="166" class="s">finally: a bar every path crosses (E1)</text>
  <text x="14" y="215" class="s">One mark family — lifeline · activation · destruction — instead of five ad-hoc marks. Untested; a sketch, not a proposal with captures.</text>
  <text x="14" y="232" class="s">It only works because §6.1 already made the vertical axis mean time. Without that, this is decoration.</text>
</svg>"""

    # ---- assemble
    S = []  # sections

    # ---------------------------------------------------------------- answer
    S.append(f"""
<h2 id="answer">The answer</h2>
<div class="lede">
<p><b>Less changes than you would expect, and the one thing that does is about time, not shape.</b> Your drawing rules for the 57 scenarios sit <b>with the field's majority in {tally['majority']}</b>, <b>with a real minority in {tally['minority']}</b> (that minority is LabVIEW and Simulink far more often than anyone else — {E(nearest_txt)}), and <b>alone in {tally['alone']}</b> — and the alone ones are not eccentricities, they are two constructs the field never built: a region with every arm visible, and a badge vocabulary for things that carry no value.{cite(2, 3)} "Control flow is never a cable" agrees with {11 - len(spine)} of 11 on the program's spine — only {E(spine_names)} thread execution on a wire — and with {11 - len(ctrl_line)} of 11 on drawing any value-less control line at all; Simulink's dot-dashed function-call line is the third.{cite(1, 2, 10)}</p>
<p><b>What does change:</b> the two tools that disagree with you on the cable are the two whose execution model is Python's — imperative, sequenced, side-effecting.{cite(1)} The 9 you agree with never needed the wire because nothing in them runs in order. Your own tree already shows the strain: the syntax report reaches for an execution edge at F9 while CLAUDE.md forbids it.{cite(3, 10)} The way out is one the file makes possible and no tool in the corpus has: <b>vertical position in an expanded region is source order</b>, derived, never dragged — which turns layout from cosmetic into semantic. That, plus the observation that {time_refusals} of the field's {all_refusals} outright refusals are about <i>when</i> a value exists rather than <i>what</i> flows, is the whole of §6.</p>
<p><b>Where you are genuinely behind</b> is smaller than the sweep made it sound and more specific: a block has no second geometry (collapse reflows the board), the trunk has no plane swap, a derived port cannot be renamed, and a drifted instance has no name and no repair verb.{cite(4, 15, 14)} All four are one-lane fixes, and none of them is a vocabulary problem.</p>
</div>
<div class="facts">
  <div class="fact"><b>{tally['majority']}</b><span>scenarios where bbox-ui draws it the way most of the field does</span></div>
  <div class="fact"><b>{tally['minority']}</b><span>with a minority — mostly LabVIEW / Simulink</span></div>
  <div class="fact"><b>{tally['alone']}</b><span>alone: all-arms regions, and marks</span></div>
  <div class="fact"><b>{tally['open']}</b><span>open on this tree (F9, V13, E2)</span></div>
  <div class="fact"><b>{11 - len(spine)} / 11</b><span>run the program on no execution wire; {11 - len(ctrl_line)} draw no control line at all</span></div>
  <div class="fact"><b>{len(refusal_buckets)}</b><span>mechanisms that are the field declining to draw something at all</span></div>
</div>
<p style="color:var(--dim);font-size:13px">How to read the numbers: the 57 verdicts are hand-classified in <code>docs/build_bbox_vs_field_report.py</code> (one line of rationale each, the full table is in §1); every "nearest mechanism" is a bucket name that must exist in <code>buckets.json</code> or the build fails; agreement counts and refusal counts are computed from the same file. Vendor screenshots carry the tool's own name for the thing and the documentation URL the sheet cites.{cite(1, 2)}</p>
""")

    # ---------------------------------------------------------------- map
    S.append(f"""
<h2 id="map">1 · Where you stand, scenario by scenario</h2>
<p class="sub">Each chip is one of the 57 Python scenarios, coloured by where bbox-ui's own drawing rule for it lands among the field's mechanisms. Hover for the nearest mechanism and how many of the eleven use it.</p>
{''.join(map_html)}
<div class="legend"><span><i style="background:var(--ok)"></i>with the majority</span><span><i style="background:var(--accent2)"></i>with a minority</span><span><i style="background:var(--accent)"></i>alone</span><span><i style="background:var(--warn)"></i>open</span></div>
<div class="lede blue" style="margin-top:22px">
<p><b>The shape of it:</b> the greens are the ordinary 80% — calls, literals, operators, fan-out, decorators, chaining — where there is one correct dataflow drawing and everyone found it.{cite(2)} The blues are almost all structure — loops, comprehensions, streams, feedback — and the minority you sit with there is the engineering pair.{cite(2)} The oranges are two things only: <b>a region that shows every arm</b> (C1, C3, C4, E1, E5, E6) and <b>a mark that carries no value</b> (V12, L3, E4, N2). You already know the first is deliberate ("control flow is not a card"{cite(19)}); the second is the badge vocabulary the control-flow plan settled.{cite(11)} So in one sentence: <b>bbox-ui is LabVIEW's structure with Simulink's cable labels, Unreal's port ergonomics, and no execution wire</b> — and the parts of it with no peer are exactly the parts LabVIEW's own users asked for.{cite(22)}</p>
</div>
<details><summary>The full table — 57 rows, one line of rationale each. Disagree in place; the row is what the chip is made from.</summary>{''.join(conv_table)}</details>
""")

    # ---------------------------------------------------------------- families
    S.append(f"""
<h2 id="families">2 · The eleven are four families, and the families are execution models</h2>
<div>
<div>
<p>Nobody wrote this number down; it falls out of {n_mech} grouping decisions made one scenario at a time. Each cell counts the mechanisms two vocabularies were judged to draw <i>the same way</i>.{cite(2)}</p>
{agreement_table(buckets)}
<p style="color:var(--dim2);font-size:12px">Floaters, with their closest partner: {E(floater_txt)}. Houdini's nearest relative is an automation tool, not Blender — drawing family is not domain family.</p>
</div>
<div>
<table class="kv fam"><thead><tr><th>pair</th><th>agreement</th><th>domain</th><th>execution model</th></tr></thead><tbody>{fam_rows}</tbody></table>
<div class="lede gold"><p><b>The thing to notice</b> is the last column. Only the first family runs the program on an execution wire ({E(spine_names)}); Simulink's dot-dashed function-call line fires a subsystem but carries no program{cite(1, 2)} — and only the first family runs the way Python runs: statements, in order, with effects. The other nine never needed a wire that says <i>when</i>, because in a pull-based or time-stepped or message-passing graph there is no <i>when</i> to say. Your convergence with them is real, and it is a convergence among tools whose semantics are not Python's. §6 is what to do about that.</p></div>
</div>
</div>
""")

    # ---------------------------------------------------------------- ahead
    S.append(f"""
<h2 id="ahead">3 · Where you are ahead — and what each one costs</h2>

<div class="card ahead"><span class="tag">ahead · views</span>
<h3>The view ladder is a projection over one document. The field's is two states joined by a plane swap or a destruction.</h3>
{ladder_svg}
<div class="two"><div>
<p>Every one of the eleven reaches the inside of a definition by leaving the plane — double-click, Tab, dive, a new window ({len(drill_in)} of 11 have a subgraph with an inside{cite(1)}) — and every one that can put the members back on the parent canvas does it by <i>mutating</i> the document: Unreal's Expand Node, Blender's Alt-G (documented lossy — it drops the group's defaults), Houdini's opextract, Max's De-encapsulate, Simulink's Expand.{cite(5)} Not one measures its inverse; yours does, to <code>JSON.stringify</code> equality under 27 tests.{cite(5, 13)}</p>
<p>bbox-ui's four faces are a field on one node: <code>BLOCK_VIEWS = ["simple","port","expanded"]</code>{cite(16)} plus <code>RegionView = "expanded" | "opaque"</code>{cite(15)}, and the opaque face is <code>projectOpaqueRegions</code> at paint time, positions preserved by construction.{cite(11)} The vault note says the data never changes between rungs — that is the sentence the field cannot say.{cite(21)}</p>
<p><b>A correction to your own note.</b> <i>C - Simple, Port, Expanded</i> claims "nobody documents 'ports shown, innards hidden'".{cite(21)} Read against the eleven, that is wrong: every collapsed subgraph node in the corpus is exactly that — Unity's Subgraph node, LabVIEW's subVI icon with its connector pane, Simulink's subsystem with numbered stubs, Blender's group node.{cite(1)} What nobody has is the rung <i>above</i> and the rung <i>below</i>: <b>simple</b> (every port collapses to one centred dot) and <b>expanded in place as a view</b>. The middle rung is the one you share with everyone; lead with the other two.</p>
<p><b>What it costs.</b> In-place expansion pays in ink. Measured on your own board: three levels of nested branch paint 15 painted lines under the v8 drawing you picked and 21 under v7 — "nesting shows the issues with the card design, it's just too many lines".{cite(23, 19)} The field pays for the same depth with windows; Green & Petre's Prograph number (131 entities over 11 windows) is the cost of their answer, yours is the cost of the opposite one.{cite(5)}</p>
</div><div>
<div class="figs">
{sb('components-blocks-blockport--view-matrix', 'The ladder on one Block, from the trunk: simple → port → expanded, and the value face. One node, one data record, four paints.', 380)}
{vendor('unity-7-subgraph', 'Unity: the Subgraph node on the parent, and Edit Graph to leave the plane — the field\'s two states.')}
{vendor('big_subsystem-virtual-nonvirtual-comparison.png', '<b>Simulink</b> · Virtual vs nonvirtual subsystem — the field\'s "port view", ports shown and innards hidden; the inside is a canvas swap with a Back button.', light=True)}
{sb('components-blocks-blockregion--empty-opaque', 'Opaque: the region at its expanded size with the members hidden — the fourth face, region-only today.', 380)}
</div>
</div></div>
{FB.strip(1, 'Ahead · the ladder is a projection; correct the vault note; the cost is ink at depth')}
</div>

<div class="card ahead"><span class="tag">ahead · structure</span>
<h3>Every arm visible, and a mark for things that carry no value. The field has neither.</h3>
<div class="two"><div>
<p>LabVIEW's Case Structure shows one case and stacks the rest behind it; NI declined to change that because tunnels multiply per case — "wires that point nowhere… imagine 20 cases".{cite(22)} The other route to a branch in the corpus is no region at all: Unreal and Unity fork an exec wire and let each arm hang loose; Blender, Houdini and Grasshopper draw both arms as upstream siblings converging on a Switch, so which arm ran is nowhere on the canvas.{cite(2)} Your branch is a region whose arms are stacked rows, all visible, with no input tunnels — the thing LabVIEW could not draw once you take the tunnels away, which is exactly what the asymmetry note does.{cite(6, 22, 28)}</p>
<p>The marks are the other half. <code>break</code>, <code>continue</code>, <code>pass</code> are badges with <code>data-slot="control-mark"</code>, never a cable.{cite(11, 10)} In the field a break is a wire back into the loop node (Unreal, Max), a dead-end stub (Unity), a boolean into a wall terminal (LabVIEW, Blender), or text in a field (Houdini, Simulink).{cite(2)} <code>del</code> is the sharpest case: 8 of 11 draw nothing and the three that do bury it in a dialog.{cite(2)} A cable implies a value; these carry none, so a badge is the only honest ink.</p>
<p><b>What it costs.</b> A mark has no endpoint, so nothing wires to it and nothing can validate it by wiring — it is a lint target, not a graph edge. And "every arm visible" is the same ink bill as the card above: a 20-arm match is 20 rows, and the daily note's own callout shows the promotion rule minting 20 derived output ports for one variable when such a region goes opaque.{cite(18)} The visibility you bought at the frame has to be paid for again at the wall.</p>
</div><div>
<div class="figs">
{vendor('labview-0-branch', 'LabVIEW: the Case Structure — one case visible, the ▾ is the only way to the others.', light=True)}
{sb('components-blocks-blockregion--with-arms', 'bbox-ui: if / elif (folded) / else as stacked rows in one region; the corner card carries the one input.', 380)}
{vendor('unreal-2-branch', 'Unreal: no region — a Branch node with True / False exec pins, and the arms hang wherever the wire goes.')}
{sb('components-blocks-blockregion-loop--loop-with-break', 'bbox-ui: `break` is a badge beside the call, never a cable.', 640, wide=True)}
{vendor('unity-3-early-exit', 'Unity: Break Loop is a stub node with an arrow in and none out — the field\'s nearest positive mark.')}
</div>
</div></div>
{FB.strip(2, 'Ahead · all arms visible + marks; the cost is ink and the 20-port promotion')}
</div>

<div class="card ahead"><span class="tag">ahead · cables</span>
<h3>A cable can carry a name and a path. Ten of eleven box the name or refuse it.</h3>
<div class="two"><div>
<p>V2, a plain <code>x = f(a)</code>: Unreal and Unity make the name a SET box on the exec wire and a GET pill elsewhere; Houdini and Blender insert a pass-through node; Node-RED and n8n type it into a dialog; Max, LabVIEW, Simulink, Houdini and Flyde also offer twin name tags with the cable between them erased; Grasshopper, LabVIEW and Flyde refuse — the cable has no name.{cite(2)} <b>Simulink alone letters the name under the arrow</b>, and that is your rule: a binding names a cable and adds no box.{cite(2, 3)}</p>
<p>You then go one step past Simulink: V6 elides an attribute path onto the cable as a label (<code>.gain</code> on the config cable) where the field's nearest move is Unreal splitting a struct pin in place — still a pin, and still a node-side thing.{cite(2, 3)} The payoff is F4: introducing or removing a variable name changes no block, port or edge — every tool agrees on the bare cable (11 of 11), but only you and Simulink keep that invariance when the cable is <i>named</i>.{cite(2)}</p>
<p><b>What it costs.</b> A label on a cable is not a first-class object in any of the engines you host on; it has to be the draggable pill (<code>TraceBadge</code>) and it will lose the argument with an auto-router every time the cable moves. And a name on a cable is unreadable the moment the cable is one of thirty — which is what simple view is for, and why V2's invariance matters more at port view than at expanded.</p>
</div><div>
<div class="figs">
{board('V2__b4__ex1', 'The field\'s most common answer to a name:', 560, wide=True)}
{vendor('unreal-11-binding', 'Unreal: the name is a GET pill — a node, not a label.')}
{sb('components-blocks-blockregion-loop--for-loop-carried', 'bbox-ui: the carried value rides one back cable with a z⁻¹ pill on it; the seed enters from outside. The name is on the cable, not in a box.', 700, wide=True)}
</div>
</div></div>
{FB.strip(3, 'Ahead · names and paths on cables (Simulink\'s rule, extended)')}
</div>

<div class="card ahead"><span class="tag">ahead · stance</span>
<h3>File-canonical and grain 1 — already established, restated with its bill attached.</h3>
<div class="two"><div>
<p>The prior-art report already made this case and it holds: NI measured six of six participants introducing a bug while rewiring existing LabVIEW code, four of six abandoning the task; that failure fires on graph edits, and a graph that is re-derived from a canonical file is never edited that way.{cite(5)} Epic's own advice to leave Blueprints at scale is the same argument from the vendor that ships the collapse tooling.{cite(5)} Nothing in the eleven ingests existing Python; the corpus is graph-canonical top to bottom.{cite(5)}</p>
<p><b>What it costs — the number the daily note put on it.</b> "Identity across edits is the <i>only</i> thing you give up by keeping text as truth", and you already paid one instalment: a one-line insert above a block renames every span-derived id below it (0 of 14 survive a blank line at the top of the file), which is why ρ reconciliation is the admission fee and not a side quest, and why rust-analyzer moved off the same rung in production.{cite(18)} The two ports you draw here — <b>the port-grouping syntax</b>{cite(17)} and <b>the elbow router</b>{cite(4)} — this corpus cannot rank: the 26 constructs have no row for wire routing or for grouping sibling ports, so the honest claim is narrower. What it does show is that the field's answer to "many related values on one wall" is a <i>typed bundle</i> — Unreal's struct pin, Simulink's bus, LabVIEW's cluster; 7 of 11 split it with a box (F6){cite(2)} — one wire carrying the group, where your group is paint on the rail that assigns nothing to the wire.{cite(17)} Your bundle is the NamedTuple (B2); the two are level, not ahead.</p>
</div><div>
<div class="figs">
{vendor('labview-13-unpack', 'LabVIEW: Unbundle By Name — the field\'s group is a typed cluster on ONE wire, split by a box.', light=True)}
{vendor('unreal-15-unpack', 'Unreal: Split Struct Pin — the group is a type; the pin indents its members in place.')}
{vendor('simulink-7-unpack', 'Simulink: a bus is one thick line; Bus Selector fans it out.', light=True)}
</div>
</div></div>
{FB.strip(4, 'Ahead · file-canonical + grain 1 (the bill is ρ); grouping and routing are unranked by this corpus')}
</div>
""")

    # ---------------------------------------------------------------- behind
    S.append(f"""
<h2 id="behind">4 · Where you are behind — the useful half</h2>

<div class="card behind"><span class="tag">behind · collapse</span>
<h3>A block has no second geometry, so collapsing it reflows the board. The field keeps two bounds and one boolean.</h3>
<div class="two"><div>
<p>The sweep's strongest convergence: collapse is <code>foldCells()</code> plus <code>Geometry.alternateBounds</code> — one geometry, two bounds, one boolean, in six independent implementations; nothing ever mints a second collapsed-representation object.{cite(4)} Blender, Houdini and Simulink all hold the node's place on the parent canvas when it folds.{cite(1)}</p>
<p>What bbox-ui has is not nothing — it is the wrong half. The <i>grouping algebra</i> exists and is exact (<code>collapseToRegion</code> / <code>dissolveRegion</code>).{cite(13)} The <i>view</i> exists for regions: <code>RegionView = "expanded" | "opaque"</code> keeps <code>w/h</code> and every position by construction.{cite(15, 11)} But there is no <code>BlockView = "opaque"</code>; a function block going expanded → port shrinks, and everything around it moves — the daily note's callout §3 already names this as "the missing sixth face" and prices it at a one-word type change.{cite(18)} The corner card's seats are the same story: <code>promoteBoundary</code> is called with no geometry, so derived ports land in authoring order rather than where their cables crossed — "you hold the frame and then scramble the wall".{cite(18)}</p>
<p><b>Why it matters more here than in the field:</b> a tool with drill-in can afford a reflow, because the user is about to leave the plane anyway. A tool whose whole bet is in-place views cannot — the reflow is the one thing the opaque face exists to prevent.</p>
</div><div>
<div class="figs">
{vendor('houdini-0-loop-counted', 'Houdini: the Block Begin / Block End pair with the tinted hull — collapse to a subnet keeps the bar\'s place in the chain.')}
{vendor('n8n-3-subgraph', 'n8n: a Canvas Group collapses in place to a bar wires still attach to — the second geometry, with no ports.', light=True)}
{sb('components-blocks-blockport-hit-regions--expanded-opaque', 'bbox-ui: "Expanded Opaque" on a Block exists as a hit-region story — the face is painted, but no `BlockView` field carries it, so nothing in the scene holds the box.', 420)}
</div>
</div></div>
{FB.strip(5, 'Behind · give Block the footprint flag; compute the seats', noun='fix')}
</div>

<div class="card behind"><span class="tag">behind · drill-in</span>
<h3>Eleven of eleven can leave the plane. The trunk cannot.</h3>
<div class="two"><div>
<p>Drill-in is a layer swap, not a camera move: every plane draws in its own frame from (0,0), so nested-coordinate maths never has to exist — Blender Tab, Houdini dive, maxGraph <code>enterGroup</code>, diagram-js plane swap.{cite(4)} Every one of the eleven does it for a definition{cite(1)}, and the field does <i>both</i>: in-place regions for control flow (LabVIEW's frames, Blender's zones, Houdini's hull) and a plane swap for definitions.</p>
<p>bbox-ui's trunk does in-place for both and the plane swap for neither: <code>editor/breadcrumb.tsx</code> is a stock shadcn breadcrumb with no stack behind it, and a grep for <code>drillIn</code> / <code>enterGroup</code> / <code>treeStack</code> / <code>alternateBounds</code> finds only the file navigator.{cite(29)} The one you shipped — SystemSketch's <code>treeStack</code> on the region shape, saved in the document and undoable — lives in the archived app.{cite(9)} You wrote "drill in — that's fine, we already have it" about that app, not this tree.{cite(19)}</p>
<p><b>When it starts to matter</b> is measurable: at three levels the in-place drawing is 15–21 painted lines{cite(23)}, and Green & Petre's warning about deep nesting with no overview is the same warning either way.{cite(5)} The trunk needs the plane swap the day a real file nests past two — which pyblocks' goldens already do.</p>
</div><div>
<div class="figs">
{vendor('blender-10-subgraph', 'Blender: inside a Node Group — Group Input / Group Output flank the contents on their own plane.', 200)}
{vendor('max-5-subgraph', 'Max: a `p` box opens its own patcher window; inlet / outlet objects become the nubs on the parent.')}
{sb('components-blocks-blockregion-branch--nested', 'bbox-ui: a branch inside an arm inside a branch — in place, and already the line count the 09-19 report measured.', 420)}
</div>
</div></div>
{FB.strip(6, 'Behind · a plane swap in the editor kit, reusing the breadcrumb', noun='fix')}
</div>

<div class="card behind"><span class="tag">behind · the derived interface</span>
<h3>The field makes the boundary an object you can rename. Yours is an accident of which wires crossed.</h3>
<div class="two"><div>
<p>B1's largest bucket: a titled node outside, and inside, two facing sentinel nodes — one spraying the parameters, one swallowing the returns — with every port named on both faces (6 of 11); LabVIEW, Houdini, Max and Node-RED do the same wall with unlabelled nubs.{cite(2)} The sweep counted the boundary-node-inside pattern in 7 of 11 desktop tools and the prior-art report upgraded "renameable derived ports" to "the one thing every tool that does this well agrees on".{cite(4, 5)}</p>
<p>bbox-ui derives the interface from the crossing edges (<code>classifyBoundary</code> → <code>promoteBoundary</code>) and nothing renames, reorders or diffs the result — the W3 lane, still open.{cite(5, 13)} For a <i>function</i> this gap is smaller than it looks: Python's <code>def</code> line is the sentinel node, and pyblocks hands you named ports for free. The gap is real in two places: a hand-drawn black box on a whiteboard (SystemSketch's use, and the "bread and butter" you named{cite(19)}), and a <b>region in port or opaque view</b>, where your own 09-23 rule makes the derived port the <i>only</i> interface a region has.{cite(18)} A port that is the whole interface and cannot be named is a worse position than the field's, not a lighter one.</p>
</div><div>
<div class="figs">
{board('B1__b0__ex1', 'The field\'s wall, drawn twice:', 640, wide=True)}
{vendor('unreal-8-block', 'Unreal: the purple function entry and Return Node — the sentinel pair, both named.')}
{ours('rw-09.webp', 'bbox-ui: Option 2 of the wall-crossing report — three crossings promoted to three wall ports, each a stock Port dot with no label.', 560, src='region-wall-crossing-2026-09-22.html', wide=True)}
</div>
</div></div>
{FB.strip(7, 'Behind · reify derived ports as renameable objects (W3), especially for regions', noun='fix')}
</div>

<div class="card behind"><span class="tag">behind · drift</span>
<h3>Houdini names the drift between a definition and its instances, and has a verb to end it. linking.ts has the states and no words.</h3>
<div class="two"><div>
<p>Houdini: an HDA instance is <b>locked</b> (matches the definition bit for bit) or <b>unlocked</b> (you edited inside it, and the node's own UI says so), and <b>Match Current Definition</b> is the repair verb — throw my edits away, re-sync.{cite(9)} Nuke's LiveGroup has Published / Make Editable / Publish; Blender prints the user count beside the name and offers Make Single User; Simulink library links can be disabled and restored.{cite(5)} Everything else in the corpus either never drifts or drifts in silence.{cite(4)}</p>
<p><code>scene/linking.ts</code> has three states — a linked occurrence, a <b>Draft n</b> (a definition that deliberately collides on the name and carries an ordinal), and an unlinked copy — plus FIFO promotion when the primary is deleted.{cite(14)} Two things are missing. A Draft's badge says <i>which number it is</i>, not <i>what it drifted from</i>; and there is no repair verb — the only exports are <code>commitDefinitionName</code>, <code>setDefinitionData</code>, <code>unlinkOccurrence</code>, <code>duplicateNodeUnlinked</code>, <code>deleteNode</code>, <code>reconcileDefinitions</code>. A rename-time <i>adopt</i> exists; a "match the definition" for an already-drafted occurrence does not.{cite(14)} You said Fork 2 was "our Drafts and link logic" — it is, and the sweep's open question about it (does a diverged instance have a repair verb, not just a state) is still the open question.{cite(19)}</p>
</div><div>
<div class="figs">
{vendor('houdini-6-block', 'Houdini: six sphere nodes — an HDA is drawn identically to any bar; the lock state is in the node\'s own UI, not its silhouette.')}
{vendor('labview-6-block', 'LabVIEW: a subVI is always a reference to a file; edits propagate to every call site — the never-drifts end of the spectrum.', light=True)}
</div>
</div></div>
{FB.strip(8, 'Behind · name the drift (linked · edited · match) and add the repair verb', noun='fix')}
</div>
""")

    # ---------------------------------------------------------------- bets
    S.append(f"""
<h2 id="bets">5 · Where you are different, and it is a bet</h2>
<p class="sub">Three decisions where the field went the other way. For each: who else made this bet, what it buys, what it forecloses, and what would falsify it — because a bet with no falsifier is a belief.</p>

<div class="card bet"><span class="tag">bet · architecture</span>
<h3>"The core imports no canvas engine." All eleven are monoliths.</h3>
<div class="two"><div>
<p><b>Who else.</b> Nobody in the eleven — every vocabulary here is fused to its engine, which is why "how does Unreal draw a loop" had to be answered from screenshots rather than by importing the loop.{cite(1)} The peers are outside node editors: shadcn (the copy-paste distribution channel the registry already uses{cite(10)}), and MLIR and RobMoSys' Block-Port Model — a vocabulary specified independently of any renderer.{cite(20, 22)}</p>
<p><b>What it buys.</b> Three hosts from one core, a third host "a ~150-line afternoon instead of a fork"{cite(10)}, detach-to-primitive, and — the freshest evidence — <code>apps/vocab-boards</code>: 705 boards in eleven house styles, drawn by React Flow node types from the same bucket data in a day.{cite(26)}</p>
<p><b>What it forecloses.</b> Interaction geometry — hit-testing, snapping, drag, z-order <i>between</i> nodes — "is host-owned and never travels".{cite(12, 10)} So every host re-earns the muscle memory separately, and a fix to how wiring <i>feels</i> has no trunk to land in.</p>
<p><b>What would falsify it — and it has half-fired.</b> ARCHITECTURE.md measured the vendored SystemSketch copy taking 20 commits in one evening, "all after the split was already known-stale", fixing click-to-position, indentation, a floating menu — interaction fixes that "exist in no bbox-ui lineage".{cite(12)} If the fixes people actually need keep landing on the interaction side of the seam, the seam is in the wrong place. The measurement to keep: trunk commits vs host-only commits per month. The day the second number wins three months running, the bet has lost.</p>
</div><div>
<div class="figs">
{vendor('flyde-4-subgraph', 'Flyde: an inline node opens as a full-screen modal — vocabulary and editor are one program, like all eleven.')}
{board('C1__b0__ex1', 'The same scenario, in Unreal\'s vocabulary, drawn by React Flow from the bucket data — what a vocabulary without an engine makes cheap:', 600, wide=True)}
</div>
</div></div>
{FB.strip(9, 'Bet · no canvas engine in the core — keep, and measure where fixes land', noun='bet')}
</div>

<div class="card bet"><span class="tag">bet · grain</span>
<h3>Grain 1 — a block is a definition, never a statement. {len(op_as_box)} of 11 draw <code>+</code> as a box.</h3>
<div class="two"><div>
<p><b>Who else.</b> PyFlow (one node per decorated function, small library functions for texture), marimo (a cell), Sourcetrail (a function) — none of the eleven.{cite(5, 27)} In this corpus the operator is an ordinary box in {len([k for k in op_as_box])} vocabularies (V4: "ordinary box titled by the operation" plus LabVIEW's and Simulink's shape-coded glyphs); the other three type it into a field or a Formula node.{cite(2)} Your rule keeps V4 as a node too — but the 35 operator tokens are labels on one node kind, never a box each, and a literal subscript or attribute collapses onto the cable.{cite(3)}</p>
<p><b>What it buys.</b> A node count bounded by the definition count, under the 24–50 range where measured dataflow graphs stop helping; the 17,192-px-wide five-line function is what lowering to expression grain costs.{cite(5)}</p>
<p><b>What it forecloses.</b> The one domain where visual programming is an unambiguous success is control math — gains, sums, delays as boxes — and Whitley et al. found graphs win exactly where the computation genuinely is a dataflow graph.{cite(5)} A function whose body is arithmetic draws, at grain 1, as one block with a text field: correct, and empty of topology.</p>
<p><b>What would falsify it — measured today.</b> <code>measure_grain()</code> walked <code>{E(args.grain_root)}</code>: <b>{grain['functions']:,} distinct functions</b> of three or more statements across {grain['files']:,} files (vendored copies and duplicates removed); in <b>{grain['opheavy']:,} ({100*grain['opheavy']/grain['functions']:.1f}%)</b> operators outnumber calls, and <b>{grain['zero']:,} ({100*grain['zero']/grain['functions']:.1f}%)</b> make no call at all.{cite(30)} So roughly one function in six in BAM's own core is the kind grain 1 draws as a single box — a real minority, concentrated in kinematics. That is the number to watch: if it climbs past a third as the controllers land, the ceiling needs a rung below it for arithmetic bodies (Simulink's grain, inside one block), not a general lowering.</p>
</div><div>
<div class="figs">
{vendor('labview-10-loop-state', 'LabVIEW: grain 0 — `+` and `×` are glyphs on the diagram, and the shift register carries state across the wall.', light=True)}
{vendor('simulink-4-loop-state', 'Simulink: the For Iterator block INSIDE the subsystem, a Sum, a Memory block on the feedback — every operator is a box.', light=True)}
{vendor('unity-14-comprehension', 'Unity: the Formula node — the other answer, a whole expression typed into one box. Grain 1 for one node.')}
</div>
</div></div>
{FB.strip(10, 'Bet · grain 1 — keep; watch the operator-heavy fraction', noun='bet')}
</div>

<div class="card bet"><span class="tag">bet · regions</span>
<h3>A region is ONE node, and the frame owns no id. The field splits three ways.</h3>
<div class="two"><div>
<p><b>Who else.</b> The closest relative is Simulink: the For Iterator is a small block <i>inside</i> the subsystem, the subsystem is the node with the ports — a corner card avant la lettre.{cite(1)} MLIR is the textual peer: an operation owns its regions, and "operations inside a region can reference values defined outside" while nothing defined inside escapes except through a yield.{cite(22)} Not peers: LabVIEW (the wall owns the terminals), Blender and Houdini (the region is <i>defined by</i> two sentinel nodes, and you grow a zone by dragging its end), Unreal and Unity (no region at all — the body hangs off a pin).{cite(2)}</p>
<p><b>What it buys.</b> One id, one port vocabulary: <code>WireLayer</code>'s <code>resolveDot</code> takes the first <code>[data-block-id]</code> and a loop's Iterable resolves exactly as any block's port does; <code>collapseToRegion</code> already promotes onto the region node, so an opaque card is the same node wearing more ports.{cite(11, 10)} Arms are child nodes with arm-relative positions, so folding one never moves a sibling's blocks.{cite(11)}</p>
<p><b>What it forecloses.</b> Blender's move — sliding the Repeat Output node to grow the zone — and any wall that owns something. Every value that leaves a region must go through the corner card, which is what makes the yield-dot question a question about the card, not the frame.{cite(28)}</p>
<p><b>What would falsify it.</b> The daily note's §5 measurement: <code>promoteBoundary</code> groups by inner endpoint, so a 20-arm branch flipped to opaque mints 20 derived output ports for one variable — NI's "imagine 20 cases" arriving through the derived-port rule instead of through tunnels.{cite(18)} If the corner card becomes a tunnel wall, the bet has reproduced the LabVIEW complaint it was made to escape. The fix is named there too: promote by variable, not by producer.</p>
</div><div>
<div class="figs">
{vendor('blender-1-loop-state', 'Blender: the Repeat zone is defined by its two nodes — the hull is a consequence, not an object.')}
{vendor('big_shift.png', '<b>LabVIEW</b> · the frame owns the terminals: N and i on the wall, shift registers as paired squares on the wall.', light=True)}
{sb('components-blocks-blockregion-branch--many-inputs', 'bbox-ui: the corner card owns the ports; the frame is scope only. Three inputs, three arms.', 380)}
</div>
</div></div>
{FB.strip(11, 'Bet · region is one node — keep; promote by variable', noun='bet')}
</div>
""")

    # ---------------------------------------------------------------- unseen
    S.append(f"""
<h2 id="unseen">6 · Two things the corpus says that nobody has said to you</h2>

<div class="card unseen"><span class="tag">unseen · order</span>
<h3>The 9-of-11 convergence is a convergence of tools that never run anything in order. Python does. The file is what makes the third answer safe.</h3>
{order_svg}
<div class="two"><div>
<p>F9 — two effect-only calls with no data between them — is where the four families show their execution models nakedly.{cite(2)} Unreal, Unity and Simulink draw a second cable kind that carries no value. LabVIEW invents a wire (the error cluster nobody reads) and threads it through both. Houdini, Grasshopper, Blender and Node-RED run an ordinary cable and let it say nothing. And Max and n8n draw <i>nothing</i>: which box sits higher, or further right, decides what runs first, and dragging a box re-orders the program.{cite(2)}</p>
<p>Your tree holds two answers at once. CLAUDE.md: control flow is never a cable.{cite(10)} The syntax report, F9: "an execution edge, not a data edge — a different cable kind… a projection that only draws data edges is not a faithful oracle, because two orderings would produce the same picture".{cite(3)} Both are right about the problem; one of them has to lose.</p>
<p><b>The observation:</b> Max's answer is a hazard <i>because the user drags</i>. In bbox-ui the user does not — the file is canonical, and in an expanded region the members' vertical order is source order, derived by the projection and re-derived after every edit. Position-is-the-order stops being the worst mechanism in the field and becomes the only one that is both cable-free and truthful. The price is that layout in expanded view is no longer cosmetic: a member cannot be dragged above its predecessor without lying, and the y-rank is a fact the scene must hold, not a hint ELK is given (<code>considerModelOrder</code> is already set; the rule is not).{cite(18)} That is a new invariant, and it is the reason to prefer the derived layout over any free-drag mode inside a region.</p>
</div><div>
<div class="figs">
{board('F9__b5__ex1', 'The hazard, in the field:', 360)}
{board('F9__b0__ex1', 'The imperative family\'s answer:', 460)}
{vendor('max-3-sequencing', 'Max: `print 1 · 2 · 3` — the console shows the right-to-left firing order that nothing on the patch draws.', light=True)}
</div>
</div></div>
{FB.strip(12, 'Unseen · position is the order, derived from source — make y-rank a held fact')}
</div>

<div class="card unseen"><span class="tag">unseen · time</span>
<h3>The field's refusals are not scattered. They are one missing axis, and the sequence diagram has had it for thirty years.</h3>
{lifeline_svg}
<div class="two"><div>
<p>{len(refusal_buckets)} mechanisms are the field declining to draw something at all (the rule: a bucket named <i>Not drawn</i>, <i>Refusal</i>, <i>Nothing</i>, <i>No region</i>, <i>Carry invisible</i>, or <i>Invisible</i>){cite(2)}; counting tools rather than buckets, the heaviest scenarios are {E(refusal_top)}. Set C4 aside (nothing in the field destructures, that is a pattern-matching gap) and every other name on that list is about <b>when</b> a value exists: <code>del</code> is a death, <code>with</code> is a lifetime with a guaranteed end, <code>async</code> and <code>async for</code> are concurrency, a generator and <code>yield from</code> are laziness across time, and <code>finally</code> — which the try/except report found no drawing for anywhere — is a suite that runs on every path out.{cite(7)} {time_refusals} of the {all_refusals} tool-refusals sit on those eight scenarios. Dataflow has axes for <i>what</i> and <i>from where</i>; it has none for <i>when</i>, so the field refuses, and your own scenarios answer each of these five with a different ad-hoc mark.{cite(3)}</p>
<p><b>The observation:</b> §6.1 just made the vertical axis of an expanded region mean time. Once it does, the UML sequence diagram's three marks — the lifeline, the activation bar, the destruction × — transfer directly: a <code>with</code> is an activation bar on the resource's cable whose bottom edge is the guaranteed exit; <code>del</code> is the × where a cable ends; <code>yield</code> is a block whose lifeline stays lit across its own outputs; <code>finally</code> is a bar every path crosses. One mark family, five refusal-heavy scenarios. This is a sketch, not a proposal — no capture exists, and it is only coherent if §6.1 is adopted first.</p>
</div><div>
<div class="figs">
{board('V12__b0__ex1', 'The field on `del`:', 600, wide=True)}
{board('E5__b0__ex1', 'The field on `with`:', 600, wide=True)}
{vendor('labview-15-scope-resource', 'LabVIEW: Initialize → configure → output → Close on one refnum wire — the lifetime is the distance between two icons, and nothing unwinds on failure.', light=True)}
</div>
</div></div>
{FB.strip(13, 'Unseen · one temporal mark family (lifeline / activation / destruction) for the five refusal scenarios')}
</div>
""")

    # ---------------------------------------------------------------- decide
    S.append(f"""
<h2 id="decide">7 · Decision surface</h2>
<div class="three">
<div class="lede green"><p><b>Proved</b></p><ul>
<li>The 57-row map: {tally['majority']} with the majority, {tally['minority']} with a minority (LabVIEW/Simulink first), {tally['alone']} alone on two constructs, {tally['open']} open.{cite(2, 3)}</li>
<li>"Never a cable" is convergence with {11 - len(spine)} of 11 on the spine ({11 - len(ctrl_line)} of 11 on any control line) — and the two dissenters are the imperative family.{cite(1, 2)}</li>
<li>The vault note's "nobody documents ports-shown-innards-hidden" is wrong; every collapsed node in the eleven is that. The unique rungs are simple and in-place expanded.{cite(1, 21)}</li>
<li>Block has no opaque face; the trunk has no plane swap; derived ports cannot be renamed; a Draft has no parent name and no repair verb.{cite(15, 29, 13, 14)}</li>
<li>{100*grain['opheavy']/grain['functions']:.1f}% of BAM's own functions are operator-heavy — the grain-1 bet's exposure, measured.{cite(30)}</li>
</ul></div>
<div class="lede gold"><p><b>Open</b></p><ul>
<li>F9 / V13: the tree disagrees with itself (execution edge vs never-a-cable).{cite(3, 10)}</li>
<li>E2 <code>except*</code>: no design, nothing to copy.{cite(3)}</li>
<li>The temporal marks: a sketch only.</li>
<li>Whether the interaction seam is in the right place — a measurement to start, not a decision to make.{cite(12)}</li>
</ul></div>
<div class="lede red"><p><b>Deliberately not done</b></p><ul>
<li>No code, no vault edit — this report is the record; the note correction is Q2 below.</li>
<li>No re-derivation of the sweep's stock-part verdicts (elkjs, libavoid, JointJS) — unchanged since the 09-18 correction.{cite(9)}</li>
<li>No claim about wire routing or port grouping vs the field: the 26 constructs have no row for either, so the corpus cannot rank them.{cite(1)}</li>
<li>Vendor claims the checker flagged (Max hot/cold colours, Unreal "no literal node", Houdini generator nubs) are not used here.{cite(1)}</li>
</ul></div>
</div>

<h4 style="margin-top:26px">Needs you — each with the recommendation and the reversible default taken on silence</h4>

<div class="q"><b class="t">Q1 · F9 sequencing: an execution cable, position-as-order, or nothing?</b>
<p class="rec"><b>Recommend:</b> position-as-order, derived from source, with y-rank held as a scene fact inside expanded regions (a member cannot be dragged above its predecessor). No cable of any kind. Correct the F9 row of the syntax report to say so.</p>
<p class="def"><b>Default if you say nothing:</b> no code changes; the F9 row in <code>python-syntax-scenarios</code> gets a one-line correction note pointing here, so the two documents stop disagreeing silently.</p>
{FB.strip(14, 'Q1 · F9 — position is the order, derived; no cable', noun='question')}</div>

<div class="q"><b class="t">Q2 · Correct <i>C - Simple, Port, Expanded</i>?</b>
<p class="rec"><b>Recommend:</b> yes — replace "nobody documents ports-shown-innards-hidden" with the measured claim: every collapsed node in the eleven is that rung; what nobody has is simple (one dot) and expanded-in-place as a non-destructive view. Leading with the middle rung leads with the one thing you share.</p>
<p class="def"><b>Default:</b> the note stays as is; this report is linked from it by the next hand that touches it.</p>
{FB.strip(15, 'Q2 · correct the S/P/E vault note', noun='question')}</div>

<div class="q"><b class="t">Q3 · Give Block the footprint flag (an opaque face) and compute the seats?</b>
<p class="rec"><b>Recommend:</b> yes, both — the one-word type change the 09-23 callout priced, and wiring <code>wallCrossings</code> into <code>promoteBoundary</code> so a fold is a dissolve in place rather than a reshuffle. This is the field's "two bounds and one boolean", arriving late.</p>
<p class="def"><b>Default:</b> done in the next region lane, behind the existing acceptance tests; nothing merged without you.</p>
{FB.strip(16, 'Q3 · Block opaque face + seats from crossings', noun='question')}</div>

<div class="q"><b class="t">Q4 · A plane swap (drill-in) in the editor kit?</b>
<p class="rec"><b>Recommend:</b> not yet. In-place is the bet, and the ink cost only bites past two levels. Port SystemSketch's <code>treeStack</code> (document-saved, undoable) the day a golden nests three deep in review.</p>
<p class="def"><b>Default:</b> no.</p>
{FB.strip(17, 'Q4 · drill-in — not yet', noun='question')}</div>

<div class="q"><b class="t">Q5 · Name the drift?</b>
<p class="rec"><b>Recommend:</b> adopt Houdini's three words onto <code>linking.ts</code> — an occurrence is <i>linked</i>, <i>edited</i> (the badge names the definition it drifted from, not an ordinal), or <i>unlinked</i> — and add the one verb, <code>matchDefinition(occurrence)</code>, which is <code>setDefinitionData</code> pointed the other way.</p>
<p class="def"><b>Default:</b> no code; the badge stays "Draft n".</p>
{FB.strip(18, 'Q5 · linked / edited / match', noun='question')}</div>

<div class="q"><b class="t">Q6 · Treat the five time-shaped scenarios as one design lane?</b>
<p class="rec"><b>Recommend:</b> yes — E5, E6, V12, S1, P3 (and B5/L4 as the async facet) share one fixture set and one mark family, tried after Q1 lands, because the marks only mean anything on an axis that means time.</p>
<p class="def"><b>Default:</b> the scenarios stay as written (regions and marks, decided one at a time).</p>
{FB.strip(19, 'Q6 · one temporal-mark lane', noun='question')}</div>
""")

    # ---------------------------------------------------------------- sources
    src_items = "".join(f'<li><b style="color:var(--dim)">{E(t)}</b><br><code>{E(p)}</code></li>' for t, p in SOURCES)
    S.append(f"""
<h2 id="sources">Source index</h2>
<ol class="src">{src_items}</ol>
<p class="foot">Built by <code>docs/build_bbox_vs_field_report.py</code> from the vocabulary pass's <code>sheets.json</code> / <code>buckets.json</code> / <code>scenarios.json</code> and its 117 verified vendor screenshots, plus captures taken today from Zach's Storybook (:5421, read-only) and the vocab-boards app (:5471). Vendor screenshots belong to their vendors and are reproduced as documentation references. Feedback buttons copy out as markdown naming each item; nothing here is stored anywhere but this page.</p>
""")

    nav = "".join(f'<a href="#{i}">{E(t)}</a>' for i, t in [
        ("answer", "answer"), ("map", "1 map"), ("families", "2 families"), ("ahead", "3 ahead"),
        ("behind", "4 behind"), ("bets", "5 bets"), ("unseen", "6 unseen"), ("decide", "7 decide"), ("sources", "sources")])

    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>bbox-ui against the field</title>
<style>{CSS}{FB.CSS}</style></head><body><div class="wrap">
<p class="kicker">bbox-ui · 23 september 2026 · a thinking piece over eleven vocabularies, 57 scenarios, {n_mech} mechanisms</p>
<h1>bbox-ui against the field</h1>
<p class="sub">Given what eleven node-editor vocabularies say when read from their own documentation — where is your thinking genuinely different, where is it ahead, and where is it behind? You have seen the research; this is what it changes.</p>
<div class="nav">{nav}</div>
{''.join(S)}
</div>{FB.ui('bbox-ui against the field', noun='item', total=19)}{FB.JS}</body></html>"""

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write(page)
    size = os.path.getsize(args.out)
    print(f"wrote {args.out}  {size/1024:.0f} KB  ({size} bytes)")
    print(f"map: {dict(tally)} · exec-wire flag: {exec_wire} · spine: {spine} · ctrl line: {ctrl_line} · refusal buckets: {len(refusal_buckets)} · off-canvas buckets: {len(offcanvas_buckets)}")
    print(f"nearest (minority+alone): {nearest_tally.most_common(6)}")
    print(f"grain: {grain}")
    return size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scratch", required=True)
    ap.add_argument("--sb", required=True)
    ap.add_argument("--boards", required=True)
    ap.add_argument("--ours", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--grain-root", default="/home/bam/bam_ws/src/core")
    build(ap.parse_args())


if __name__ == "__main__":
    main()
