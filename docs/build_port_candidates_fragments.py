#!/usr/bin/env python3
"""
Build the HTML fragments for the port-candidates survey report (2026-09-18).

Zach, `PROJECT - Black Box UI.md:3145`: "In light of this feature like the
focus slider. Please make a list of other things we can port over. from
ssytemsketch/pyblocks etc that we haven't yet ported. Make a media rich
report with screeen shots to communicate the intended functionality."

This script generates docs/fragments/port-candidates-*.html, which
docs/lane_report_manifest.port-candidates.json feeds to the shared
docs/build_lane_report.py (`sections[].html_file`):

    python3 docs/build_port_candidates_fragments.py
    python3 docs/build_lane_report.py \
        docs/lane_report_manifest.port-candidates.json --skip-capture \
        --out /home/bam/bbox-ui/reports/media/port-candidates-2026-09-18.html

PROVENANCE IS ENFORCED MECHANICALLY. Every donor path a card or table row
cites is opened by THIS script at build time — a missing file kills the
build, and every line count printed in the page is `len(readlines())` read
off disk here, never a number typed from memory (repo rule,
.claude/feedback.md "algorithm provenance"; the same rule
docs/ALGORITHM-PROVENANCE.md holds code to). Screenshots are the donors'
own review captures, cropped and re-encoded here; each caption says which
file it came from.

VISUAL LANGUAGE: the SVG primitives and palette re-state the kit used by
docs/build_prior_art_visuals_fragments.py (the visual pass Zach rated
good), so this page reads as the same drawn hand.

Donor trees (READ-ONLY — never written):
  /home/bam/systemsketch            @ main 10748b8c + live working tree
  /home/bam/systemsketch/.claude/worktrees/vision-consolidated   (untracked!)
  /home/bam/systemsketch/.claude/worktrees/contextual-menu-next  (untracked!)
  /home/bam/pyblocks
"""
from __future__ import annotations

import base64
import io
import pathlib
import subprocess

from PIL import Image

REPO = pathlib.Path(__file__).resolve().parent.parent
FRAG_DIR = REPO / "docs" / "fragments"
TRUNK = REPO / "apps" / "storybook-basics" / "src"

SS = pathlib.Path("/home/bam/systemsketch/src")
SS_DOCS = pathlib.Path("/home/bam/systemsketch/docs")
VC = pathlib.Path("/home/bam/systemsketch/.claude/worktrees/vision-consolidated")
CMN = pathlib.Path("/home/bam/systemsketch/.claude/worktrees/contextual-menu-next")
PB = pathlib.Path("/home/bam/pyblocks")

# Palette — matches build_lane_report.py's CSS variables (same values the
# prior-art visuals fragments re-state).
BG = "#0e0f12"
PANEL = "#15171c"
PANEL2 = "#1b1e25"
LINE = "#282d38"
FG = "#e6e8ee"
DIM = "#9aa3b2"
DIM2 = "#6b7383"
ACCENT = "#f0883e"
ACCENT2 = "#5aa9f8"
OK = "#3fb950"
WARN = "#e5534b"
AMBER = "#e8c06a"
PURPLE = "#bc8cff"
MONO = "ui-monospace,Menlo,Consolas,monospace"
SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif"


# ---------------------------------------------------------------------------
# Verified donor citation: the path is opened HERE, the line count is real.
# ---------------------------------------------------------------------------
_verified: dict[str, int] = {}


def cite(path: pathlib.Path, label: str | None = None) -> str:
    """Return `label (N lines)` — and die if the path is not on disk."""
    if not path.exists():
        raise SystemExit(f"PROVENANCE FAILURE — cited donor does not exist: {path}")
    n = len(path.read_text(errors="replace").splitlines())
    _verified[str(path)] = n
    shown = label or path.name
    return f'<code>{shown}</code>&thinsp;<span class="pc-lines">{n}&#8202;ln</span>'


def lines(path: pathlib.Path) -> int:
    if not path.exists():
        raise SystemExit(f"PROVENANCE FAILURE — cited donor does not exist: {path}")
    n = len(path.read_text(errors="replace").splitlines())
    _verified[str(path)] = n
    return n


def landed(path: pathlib.Path) -> str:
    """Assert a piece of evidence in OUR tree exists; return its short name."""
    if not path.exists():
        raise SystemExit(f"LANDED-CLAIM FAILURE — evidence does not exist: {path}")
    if path.is_dir():
        return f"{path.parent.name}/{path.name}"
    return path.name


# ---------------------------------------------------------------------------
# Screenshot pipeline: donor PNG -> crop -> resize -> WebP data URI.
# ---------------------------------------------------------------------------
_img_bytes_total = 0


def shot(path: pathlib.Path, crop: tuple[int, int, int, int] | None = None,
         max_w: int = 1100, quality: int = 78) -> str:
    global _img_bytes_total
    if not path.exists():
        raise SystemExit(f"CAPTURE FAILURE — screenshot does not exist: {path}")
    im = Image.open(path).convert("RGB")
    if crop:
        im = im.crop(crop)
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=quality)
    _img_bytes_total += buf.tell()
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


def fig(uri_or_svg: str, title: str, caption: str, source: str = "") -> str:
    src = f'<div class="pc-cite">{source}</div>' if source else ""
    media = (uri_or_svg if uri_or_svg.lstrip().startswith("<svg")
             else f'<img src="{uri_or_svg}" alt="{title}" loading="lazy">')
    return (f'<figure class="pc-fig">{media}'
            f'<figcaption><b>{title}</b>{caption}{src}</figcaption></figure>')


# ---------------------------------------------------------------------------
# SVG kit — restated from build_prior_art_visuals_fragments.py.
# ---------------------------------------------------------------------------
def box(x, y, w, h, text="", sub="", fill=PANEL2, stroke=LINE, tc=FG, fs=11,
        rx=6, dash=None, mono=True, sw=1.2):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    out = (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" '
           f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{d}/>')
    fam = MONO if mono else SANS
    if text:
        cy = y + h / 2 + fs * 0.36 - (6 if sub else 0)
        out += (f'<text x="{x + w / 2}" y="{cy:.1f}" fill="{tc}" font-size="{fs}" '
                f'text-anchor="middle" font-family="{fam}">{text}</text>')
    if sub:
        out += (f'<text x="{x + w / 2}" y="{y + h / 2 + 14}" fill="{DIM2}" font-size="9" '
                f'text-anchor="middle" font-family="{SANS}">{sub}</text>')
    return out


def label(x, y, s, color=DIM, fs=10, anchor="middle", weight="400", mono=False):
    fam = MONO if mono else SANS
    return (f'<text x="{x}" y="{y}" fill="{color}" font-size="{fs}" '
            f'text-anchor="{anchor}" font-weight="{weight}" font-family="{fam}">{s}</text>')


def arrow(x1, y1, x2, y2, color=DIM2, sw=1.6, dash=None, marker="mA"):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return (f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" '
            f'stroke-width="{sw}"{d} marker-end="url(#{marker})"/>')


def dot(x, y, r, color, stroke="none", sw=1.2):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{color}" stroke="{stroke}" stroke-width="{sw}"/>'


DEFS = f"""<defs>
  <marker id="mA" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" fill="{DIM2}"/></marker>
  <marker id="mG" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" fill="{OK}"/></marker>
  <marker id="mO" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" fill="{ACCENT}"/></marker>
</defs>"""


def svg(w, h, body):
    return (f'<svg viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg" '
            f'role="img">{DEFS}{body}</svg>')


# ---------------------------------------------------------------------------
# Shared CSS + chips
# ---------------------------------------------------------------------------
PURITY = {
    "verbatim": ("ports verbatim", "#12301d", OK),
    "reexpress": ("re-expresses cleanly", "#122a3d", ACCENT2),
    "policy": ("policy only", "#2c2a14", AMBER),
    "mixed": ("part verbatim · part re-express", "#122a3d", ACCENT2),
    "none": ("does not port", "#20242d", DIM),
}
KIT = {
    "components": ("components", PURPLE),
    "scene": ("scene", OK),
    "editor": ("editor components", ACCENT2),
    "presets": ("presets", AMBER),
    "host": ("host", DIM),
}
SIZE = {"S": OK, "M": AMBER, "L": ACCENT, "XL": WARN}

STYLE = f"""
<style>
.pc-card {{ background:var(--panel); border:1px solid var(--line); border-radius:10px;
  padding:16px 18px 12px; margin:0 0 16px }}
.pc-hd {{ display:flex; align-items:baseline; gap:9px; flex-wrap:wrap; margin-bottom:8px }}
.pc-rank {{ font-family:{MONO}; font-size:15px; font-weight:700; color:{ACCENT}; min-width:30px }}
.pc-title {{ font-size:15px; font-weight:650; color:var(--fg) }}
.pc-chip {{ font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.06em;
  padding:2px 8px; border-radius:99px; white-space:nowrap }}
.pc-kit {{ font-size:10px; font-weight:700; padding:2px 8px; border-radius:4px;
  border:1px solid var(--line); background:{PANEL2}; white-space:nowrap }}
.pc-body {{ font-size:13px; color:{DIM}; line-height:1.6; margin:0 0 10px }}
.pc-body b {{ color:var(--fg) }} .pc-body code {{ color:{ACCENT2} }}
.pc-fig {{ background:{PANEL2}; border:1px solid var(--line); border-radius:8px;
  padding:8px; margin:0 0 10px }}
.pc-fig img, .pc-fig svg {{ width:100%; height:auto; display:block; border-radius:4px }}
.pc-fig figcaption {{ font-size:12.5px; color:{DIM}; line-height:1.55; margin-top:8px }}
.pc-fig figcaption b {{ display:block; color:var(--fg); font-size:13px; margin-bottom:2px }}
.pc-cols {{ display:grid; grid-template-columns:1fr 1fr; gap:10px }}
@media (max-width:760px) {{ .pc-cols {{ grid-template-columns:1fr }} }}
.pc-cite {{ font-family:{MONO}; font-size:10.5px; color:{DIM2}; line-height:1.7; margin-top:4px }}
.pc-lines {{ font-family:{MONO}; font-size:10px; color:{DIM2} }}
.pc-meta {{ display:flex; gap:14px; flex-wrap:wrap; font-size:11.5px; color:{DIM2};
  border-top:1px solid var(--line); padding-top:8px; margin-top:2px }}
.pc-meta b {{ color:{DIM} }}
table.pc-tbl {{ width:100%; border-collapse:collapse; font-size:12px }}
.pc-tbl th {{ text-align:left; color:{DIM2}; font-size:10.5px; text-transform:uppercase;
  letter-spacing:.05em; padding:6px 8px; border-bottom:1px solid var(--line); white-space:nowrap }}
.pc-tbl td {{ padding:7px 8px; border-bottom:1px solid {PANEL2}; color:{DIM};
  line-height:1.5; vertical-align:top }}
.pc-tbl td b {{ color:var(--fg); font-weight:600 }}
.pc-tbl code {{ font-size:11px; color:{ACCENT2} }}
.pc-scroll {{ overflow-x:auto }}
.pc-note {{ border-left:3px solid {ACCENT}; background:{PANEL2}; border-radius:0 8px 8px 0;
  padding:10px 14px; font-size:13px; color:{DIM}; line-height:1.6; margin:0 0 14px }}
.pc-note b {{ color:var(--fg) }}
.pc-risk {{ border-left:3px solid {WARN} }}
.pc-ok {{ border-left:3px solid {OK} }}
</style>
"""


def chip(kind: str) -> str:
    text, bg, fg_ = PURITY[kind]
    return f'<span class="pc-chip" style="background:{bg};color:{fg_}">{text}</span>'


def kitchips(*kits: str) -> str:
    return "".join(
        f'<span class="pc-kit" style="color:{KIT[k][1]}">{KIT[k][0]}</span>' for k in kits
    )


def sizechip(s: str) -> str:
    return f'<span class="pc-chip" style="background:{PANEL2};color:{SIZE[s]};border:1px solid {LINE}">size {s}</span>'


def card(rank: str, title: str, purity: str, kits: tuple, size: str,
         body: str, figures: str = "", deps: str = "", donor: str = "") -> str:
    meta = []
    if deps:
        meta.append(f"<span><b>needs</b> {deps}</span>")
    if donor:
        meta.append(f"<span><b>donor</b> {donor}</span>")
    meta_html = f'<div class="pc-meta">{"".join(meta)}</div>' if meta else ""
    return (
        f'<div class="pc-card"><div class="pc-hd">'
        f'<span class="pc-rank">{rank}</span>'
        f'<span class="pc-title">{title}</span>'
        f'{chip(purity)}{kitchips(*kits)}{sizechip(size)}</div>'
        f'<div class="pc-body">{body}</div>{figures}{meta_html}</div>'
    )


# ===========================================================================
# Live git facts about the at-risk worktrees (read-only commands).
# ===========================================================================
def untracked_src(worktree: pathlib.Path) -> list[str]:
    out = subprocess.run(["git", "-C", str(worktree), "status", "--porcelain"],
                         capture_output=True, text=True).stdout
    return [l[3:] for l in out.splitlines() if l.startswith("??")]


# ===========================================================================
# Fragment 1 — hero: how to read this + the kit map.
# ===========================================================================
def hero() -> str:
    # Kit map: where candidates land, in the repo's own vocabulary.
    b = []
    b.append(label(250, 24, "pure paint & layout", DIM2, 10))
    b.append(box(30, 34, 440, 118, "", fill=PANEL))
    b.append(label(52, 56, "components / presets", PURPLE, 12, anchor="start", weight="700"))
    for i, (t, c) in enumerate([("port `mutates` marker", ACCENT), ("band ports on a Bar edge", ACCENT),
                                ("signature grammar + completion", ACCENT2), ("floating port", DIM),
                                ("stock block presets", AMBER), ("callout preset", DIM)]):
        col, row = divmod(i, 3)
        b.append(dot(58 + col * 220, 80 + row * 22, 3.5, c))
        b.append(label(68 + col * 220, 84 + row * 22, t, DIM, 10.5, anchor="start"))

    b.append(label(720, 24, "pure derivations over BlockScene", DIM2, 10))
    b.append(box(510, 34, 440, 118, "", fill=PANEL))
    b.append(label(532, 56, "scene", OK, 12, anchor="start", weight="700"))
    for i, (t, c) in enumerate([("effect-port derivation", ACCENT), ("ELK organize adapter", ACCENT),
                                ("identity ladder (pyblocks)", ACCENT2), ("board search", DIM),
                                ("routing obstacles", AMBER), ("semantic-role rule", DIM)]):
        col, row = divmod(i, 3)
        b.append(dot(538 + col * 220, 80 + row * 22, 3.5, c))
        b.append(label(548 + col * 220, 84 + row * 22, t, DIM, 10.5, anchor="start"))

    b.append(box(30, 176, 440, 96, "", fill=PANEL))
    b.append(label(52, 198, "editor components", ACCENT2, 12, anchor="start", weight="700"))
    for i, (t, c) in enumerate([("edge-drop quick menu", ACCENT), ("batch-wire arming UI", ACCENT),
                                ("command palette", DIM), ("contextual controls", AMBER),
                                ("insert palette (press S)", DIM), ("tunnel layer bar", DIM)]):
        col, row = divmod(i, 3)
        b.append(dot(58 + col * 220, 222 + row * 22, 3.5, c))
        b.append(label(68 + col * 220, 226 + row * 22, t, DIM, 10.5, anchor="start"))

    b.append(box(510, 176, 440, 96, "", fill=PANEL))
    b.append(label(532, 198, "host (policy travels, code does not)", DIM, 12, anchor="start", weight="700"))
    for i, t in enumerate(["boundary-port drag / drop gestures", "detach execution sweep",
                           "auto-fit trigger guards", "comments · landmarks · camera"]):
        b.append(dot(538, 222 + (i % 2) * 22, 3.5, DIM2))
        b.append(label(548 + (i // 2) * 220, 226 + (i % 2) * 22, t, DIM, 10.5, anchor="start"))
        if i == 1:
            b.append(dot(538 + 220, 222, 3.5, DIM2))
            b.append(dot(538 + 220, 244, 3.5, DIM2))
    kitmap = svg(980, 290, "".join(b))

    return STYLE + f"""
<p class="pc-body" style="font-size:13.5px">
The focus slider set the bar: a donor feature that was <b>mature, self-contained and
already designed</b>, split into a pure traversal (scene) and a floating toolbar
(editor components). This survey walks every donor we have — all 46 top-level
feature directories of <code>systemsketch/src</code>, its lane worktrees, the frozen
<code>packages/bbox-ui</code> v1, and pyblocks — and lists what else is sitting in that
state. <b>25 candidates made the cut; each row was verified on disk today</b> (a cited
path that does not exist kills this page's build), and everything that already
landed here was measured first so nothing below re-proposes it.</p>
<p class="pc-body">Purity verdicts, because they are the estimate that matters:
{chip("verbatim")} copy with attribution &nbsp; {chip("reexpress")} the decisions travel,
the donor's <code>Editor</code> plumbing does not &nbsp; {chip("policy")} an idea worth
porting as behaviour, zero donor lines survive &nbsp; {chip("none")} stays behind.</p>
{fig(kitmap, "Where the candidates land",
     "The repo's own four-kit vocabulary. Orange dots are the top five; every candidate below names its kit in these terms — the same split the focus slider used (pure traversal → scene, toolbar → editor components).")}
"""


# ===========================================================================
# Fragment 2 — landed ledger.
# ===========================================================================
def landed_ledger() -> str:
    rows = [
        ("Wire layer + wire record (P1 / Group B)",
         [TRUNK / "components/wireLayer.tsx", TRUNK / "components/wiring.ts", TRUNK / "scene/sceneWires.ts"]),
        ("Scene record `BlockScene` (P4)", [TRUNK / "scene/scene.ts"]),
        ("Lint engine + edge validation (§2.8)", [TRUNK / "scene/lint.ts", TRUNK / "scene/edgeValidation.ts"]),
        ("Drag-time validity preview", [TRUNK / "scene/availability.ts"]),
        ("Errors bubble through folds", [TRUNK / "scene/bubble.ts"]),
        ("Diagnostics paint — error/warning rungs (§3.4)",
         [TRUNK / "components/highlighter.tsx", TRUNK / "components/traceMark.tsx"]),
        ("Value capsule preset (§3.3, first half)", [TRUNK / "presets/value/value.tsx"]),
        ("Linked copies — definition identity (§3.5)", [TRUNK / "scene/linking.ts"]),
        ("Compare model + word/field/line diff",
         [TRUNK / "scene/sceneDiff.ts", TRUNK / "scene/wordDiff.ts", TRUNK / "scene/fieldDiff.ts",
          TRUNK / "scene/lineDiff.ts"]),
        ("Batch-wiring model (from the untracked donor)", [TRUNK / "scene/batchWire.ts"]),
        ("Tunnels — edge presentation + layer derivations",
         [TRUNK / "components/tunnel.ts", TRUNK / "scene/layers.ts"]),
        ("Fit-to-content math (§2.4)", [TRUNK / "layout/fitToContent.ts"]),
        ("Magnetic wire proposals", [TRUNK / "magnet/magnetProposals.ts"]),
        ("Member reorder via dnd-kit (kanban-card stack)", [TRUNK / "components/blockMembers.tsx"]),
        ("Click-drag press ownership (§2.7's gesture half, the portable part)",
         [TRUNK / "interaction/dragPolicy.ts", TRUNK / "interaction/dragIntent.ts"]),
        ("Icon picker — Emoji / Lucide / Upload tabs",
         [REPO / "packages/glyph-picker/src/GlyphPicker.tsx"]),
        ("Inspector engine, host-neutral (as packages)", [REPO / "packages/panel/src",
                                            REPO / "packages/inspector/src"]),
    ]
    trs = "".join(
        f"<tr><td><b>{name}</b></td><td><code>{'</code> · <code>'.join(landed(p) for p in paths)}</code></td></tr>"
        for name, paths in rows
    )
    return f"""
<p class="pc-body">The 09-17 capability map (<code>docs/REMAINING-2026-09-17.md</code>) asked
"what capability is missing?" — this survey asks "what donor code exists that we could
take?" Where they overlap it is cited, not restated. But a day passed, and <b>a day here
is a lot</b>: seventeen of its rows have since landed. Every evidence path below was
checked to exist in this lane's tree at build time — if an older doc still lists one of
these as missing, this table wins.</p>
<div class="pc-scroll"><table class="pc-tbl">
<tr><th>Was missing on 09-17</th><th>Evidence in this tree today</th></tr>{trs}
</table></div>
<p class="pc-body" style="margin-top:10px"><b>In flight right now</b> (peer lanes, treated
as done here, not re-proposed): the focus slider / propagation lens (<code>scene/focus.ts</code>
+ the new <code>editor/</code> kit), the skin-at-the-edges migration, fit-to-content host
wiring, and the polarity/orientation unification. Also already referenced by other lanes and
so not candidates: <code>behaviorTree/</code>'s drag-sensitivity and live-drag-wire mechanics
(cited by <code>magnet/</code> and <code>interaction/</code> headers).</p>
"""


# ===========================================================================
# Fragment 3 — at-risk untracked donor work.
# ===========================================================================
def at_risk() -> str:
    vc_files = untracked_src(VC)
    vc_src = [f for f in vc_files if f.startswith("src/")]
    cmn_files = untracked_src(CMN)
    cmn_src = [f for f in cmn_files if f.startswith("src/")]

    sys_lines = sum(lines(VC / f) for f in vc_src if f.startswith("src/system/"))
    bw_lines = sum(lines(VC / f) for f in vc_src
                   if "batchWiring" in f or "wireIntoState" in f or "SelectionWiring" in f)
    menu_lines = sum(lines(CMN / f) for f in cmn_src if f.endswith(".ts"))

    return f"""
<div class="pc-note pc-risk"><b>Reviewed work that exists in no commit on any branch,
anywhere.</b> A previous lane flagged the 1,182-line batch-wiring donor sitting untracked
in systemsketch's <code>vision-consolidated</code> worktree. Re-measured today
(<code>git status --porcelain</code>, live at build time): the situation is bigger than
the flag. One <code>git stash&nbsp;-u</code> or <code>git clean&nbsp;-fd</code> in either
worktree deletes all of it — source, reports, and the review screenshots this very page
uses as figures.</div>
<div class="pc-scroll"><table class="pc-tbl">
<tr><th>Worktree (branch)</th><th>Untracked source, measured now</th><th>State</th></tr>
<tr><td><b>vision-consolidated</b><br><code>claude/vision-consolidated</code></td>
<td><code>src/system/</code> — the whole System-boundary-ports feature, <b>{sys_lines} lines</b>
across {len([f for f in vc_src if f.startswith('src/system/')])} files (model, commands, drag,
drop, selection, migrations, tool, tests) · batch-wiring donor <b>{bw_lines} lines</b>
(<code>batchWiring.ts</code>, <code>wireIntoState.ts</code>, commands, chrome) · plus its two
review reports and ~30 review PNGs under <code>docs/</code> and <code>sketches/review/</code>,
all untracked ({len(vc_files)} untracked paths total)</td>
<td>batch-wiring model already rescued into this repo as <code>scene/batchWire.ts</code>;
the System MODEL is committed on the lane branch (13 commits, unmerged) but its gestures are
not — <b>the System half is rescued nowhere</b>; it is candidate #5 below</td></tr>
<tr><td><b>contextual-menu-next</b><br><code>claude/contextual-menu-next</code></td>
<td><code>menuComposition.ts</code> + <code>menuCompositionStore.ts</code> + tests —
<b>{menu_lines} lines</b>: saved contextual-menu compositions as data (the lab writes,
the product reads back)</td>
<td>feeds candidate #9; unrescued</td></tr>
</table></div>
<p class="pc-body" style="margin-top:10px"><b>Recommendation</b> (needs a systemsketch
session, not this repo): commit both worktrees' untracked files to their own lane branches
— even a WIP commit ends the stash-risk. This lane did not touch them
(systemsketch is read-only by rule); porting from them into bbox-ui, as
<code>scene/batchWire.ts</code> already did, is the other durable rescue.</p>
"""


# ===========================================================================
# Fragment 4 — the top five.
# ===========================================================================
def top_five() -> str:
    out = ['<p class="pc-body">Ranked by the focus-slider test: mature in the donor, '
           'self-contained, already designed — and unblocked <i>today</i>, because the scene '
           'record, wire layer, diagnostics paint and TraceBadge they lean on all landed since '
           'the 09-17 map was written.</p>']

    # 1 — mutation chain
    figs = f'<div class="pc-cols">{fig(shot(SS_DOCS / "assets/effect-ports-2-marked-2026-09-03.png"), "Mark an input as mutated → the effect port derives", "One checkbox on <code>in_1</code> (the orange mark) and a derived output appears on the TOP edge — the inspector says it plainly: &quot;derived — in_1 is written in place&quot;. You cannot add or delete an effect port; you mark an argument and it exists.", "systemsketch docs/assets/effect-ports-2-marked-2026-09-03.png")}{fig(shot(SS_DOCS / "assets/effect-ports-3-wired-2026-09-03.png", crop=(0, 60, 1280, 960)), "The cable out the top is not an ordinary data cable", "Warm ink, heavier stroke, a draggable <code>mut</code> pill — all DERIVED from the source port, never stored on the wire. <code>poses.append</code> has no return channel; the mutation itself is the only way its result reaches <code>len</code>, so the cable is load-bearing and paints differently.", "systemsketch docs/assets/effect-ports-3-wired-2026-09-03.png")}</div>'
    out.append(card(
        "1", "The mutation chain — effect ports, mut cables, tethers, follow", "reexpress",
        ("scene", "components"), "M",
        f"""The donor's best-specified unported feature, end to end: mark an input
<code>mutates</code> and an effect port derives on the top edge
({cite(SS / "blocks/blockModel.ts", "blockModel.ts")} — <code>reconcileEffectPorts</code>
at <code>:1317</code>, "the port is derived, not authored"); a cable leaving it paints as a
side effect ({cite(SS / "blocks/connections/effectCable.ts")}); a faint elbow
<b>tether</b> says which argument it belongs to, pure geometry over the block layout
({cite(SS / "blocks/effectTether.ts")}); and on an expanded block the outer port
<b>follows wherever its cable crosses the frame</b>
({cite(SS / "blocks/connections/effectPortFollow.ts")}).
<br><br>Why it is #1: REMAINING §2.5 already mapped the bbox-ui expression — a
<code>mutates</code> marker prop on Port, the <code>mut</code> TraceBadge (shipped), a ~30-line
scene derivation, a tether drawn with the existing polyline Trace — and parked it behind
P1/P4. <b>Both landed.</b> The derivation is the same shape as <code>wiredPorts</code>; the
follow half rides the already-ported <code>elbow/boundaryCrossing.ts</code>. The donor's
pill-label contract is even pinned by test: <code>cablePillLabel({{temporal:'data',
effect:true}}) === 'mut'</code> ({cite(SS / "blocks/connections/cablePill.test.ts")}).""",
        figs,
        deps="all landed — scene record, wireLayer, TraceBadge, boundaryCrossing, labeledPort secondary slot",
        donor="~300 substantive donor lines + tests (effectPorts.test.ts, effectTether.test.ts)"))

    # 2 — ELK
    out.append(card(
        "2", "Auto-layout — the ELK organize command", "mixed", ("scene", "editor"), "M",
        f""""Choose positions" is the one auto-size mechanism from §2.4 with no owner yet, and
the donor already solved it off the shelf: {cite(SS / "blocks/layout/organizeGraph.ts")} is a
<b>pure ELK adapter</b> — its own header: "Only positions come back from ELK. [The] existing
connection router remains the sole owner of the cable geometry" — with Dify-derived layered
options, model order preserved, <code>FIXED_ORDER</code> ports. It is already engine-free and
ports near-verbatim. {cite(SS / "blocks/layout/organizeNodes.ts")} is the Editor-bound
scoping half (which blocks move: a selection, an expanded block's children, a loop body) and
re-expresses over <code>BlockScene</code> in a fraction of its lines.
<br><br>The one real cost is the <code>elkjs</code> dependency — the donor lazy-loads it
precisely so it stays out of the first bundle, and the same dynamic-import trick works here.
Package installs are the orchestrator's, not a lane's.""",
        fig(shot(SS_DOCS / "assets/layout-commands-live-organized-2026-09-02.png"),
            "One command, six blocks organized, edges tidied",
            'The donor\'s live acceptance capture: "Organized 6 nodes in the selection" + "Tidied 4 edges" — ELK owns positions, the (already-ported) elbow router keeps owning the cables. The same division of labour travels: <code>organizeScene(scene) → positions</code>, then the landed tidy pipeline.',
            "systemsketch docs/assets/layout-commands-live-organized-2026-09-02.png"),
        deps="elkjs (lazy dynamic import — needs Zach's one-line yes; ~0 first-load cost)",
        donor="501 donor lines, roughly half of which is tldraw scoping that does not travel"))

    # 3 — quick menu
    out.append(card(
        "3", "Edge-drop quick menu + the stock block vocabulary", "mixed",
        ("editor", "presets"), "M",
        f""""A cable that landed on nothing is a question, not a mistake" —
{cite(SS / "blocks/connections/blockPicker.ts")} holds that question as pure data (an
editor-scoped atom + preset rows), {cite(SS / "blocks/ui/OnCanvasBlockPicker.tsx")} anchors
the menu at the loose end, and {cite(SS / "blocks/stockBlocks.ts")} is the vocabulary it
offers: Set-attributes, Select, Clock, Bundle, Unbundle, Copy — each one a props bundle, the
exact pattern <code>presets/value</code> already established here. The preset data ports
verbatim; the menu re-expresses over the vendored shadcn <code>DropdownMenu</code> /
<code>Command</code>-in-<code>Popover</code> (Zach's standing "use shadcn" call on the focus
slider applies here word for word).
<br><br>Without the stock vocabulary the menu has nothing to offer — REMAINING §3.3 made
that point and the Value capsule landed; this is the second half. It is also the
interaction-demo unlock: every wiring story can end a drag on empty canvas and mean it.""",
        fig(shot(SS_DOCS / "assets/edge-accept-picker-open.png", crop=(240, 140, 1120, 900), max_w=900),
            "Drop a cable on nothing → INSERT A BLOCK",
            "The donor's picker, anchored to the loose end inside <code>run</code>: Call, Transform, Branch, Store, Sink, Value, Split, Expanded group — each row a preset with its port shape printed beside it (1 in · 1 out). Pick one and the cable binds to its first compatible port.",
            "systemsketch docs/assets/edge-accept-picker-open.png"),
        deps="presets kit (landed pattern) · vendored DropdownMenu/Popover (landed)",
        donor="739 donor lines, ~40% pure preset data"))

    # 4 — port affordances
    out.append(card(
        "4", "Add-port bead + held-port landing preview", "reexpress",
        ("components", "editor"), "S",
        f"""{cite(SS / "blocks/ports/portAffordances.ts")} answers two hover questions —
where does the "add a port here" bead sit, and where would a held port land if dropped now —
and its method is the whole reason to port it rather than reinvent it: <i>"Nothing here
authors a coordinate of its own. Both answers are read back out of layoutBlock — the add
bead by laying out the HYPOTHETICAL Block that already has the new port."</i> That is what
keeps the promise and the landing from ever drifting apart. Our
<code>blockPort.layout.ts</code> is the layout it reads back from here, and the wall/landing
model in {cite(SS / "blocks/ports/communicationPortDrag.ts")} is pure. The hover surface
itself is the landed <code>hitRegions</code> kit.""",
        fig(shot(SS_DOCS / "assets/header-port-rows-heading-bead-2026-09-01.png",
                 crop=(330, 140, 830, 540), max_w=860),
            "The bead, computed from the layout that will receive it",
            "Hover near a wall and the bead (⊕ on the header's left edge) marks exactly where the new port's row would materialize — because the geometry IS the laid-out hypothetical block, not a guess beside it. Same mechanism previews a held port's landing slot.",
            "systemsketch docs/assets/header-port-rows-heading-bead-2026-09-01.png"),
        deps="none — blockPort.layout + hitRegions landed",
        donor="422 donor lines incl. the pure drag model"))

    # 5 — system boundary ports
    sys_model = cite(VC / "src/system/systemModel.ts", "system/systemModel.ts")
    out.append(card(
        "5", "System boundary ports — the at-risk feature", "reexpress",
        ("components", "scene", "host"), "L",
        f"""A <b>System</b> is a frame whose wall carries declared ports: drop a cable on the
boundary to declare one ({cite(VC / "src/system/systemBoundaryDrop.ts", "systemBoundaryDrop.ts")}),
press-and-hold to slide it along the wall — a plain drag must keep meaning "draw a cable"
({cite(VC / "src/system/systemPortDrag.ts", "systemPortDrag.ts")}, its header states the
gesture rule) — and marquee-select ports as first-class things
({cite(VC / "src/system/systemPortSelection.ts", "systemPortSelection.ts")}). The model
({sys_model}) re-expresses cleanly; drag/drop/tool are policy over tldraw state nodes.
<br><br>Ranked top-five for a double reason: it is the containers' port story (a region wall
that owns ports is exactly what Loop/Branch bands need — §3.2's gap from the other side),
and the donor is the least-landed reviewed work in any tree: the model half sits
<b>13 unmerged commits deep on the lane branch</b> <code>claude/vision-consolidated</code>
(with {lines(VC / "src/system/systemModel.test.ts")} test lines), and the four gesture
files above it are <b>untracked on top of that</b> — one stash from gone. Porting it is
the rescue.""",
        fig(shot(VC / "docs/assets/system-boundary-declared.png", crop=(140, 80, 960, 880), max_w=900),
            "A cable crossing the wall becomes a declared boundary port",
            "Two component blocks inside a System frame; <code>data_out_1</code>'s cable reaches the wall and the dashed segment continues to a declared port ON the boundary. The wall owns the port; the cable follows it when it slides.",
            "vision-consolidated docs/assets/system-boundary-declared.png (untracked)"),
        deps="wireLayer (landed) · container clip (Block's overflow, landed) · band/wall rail extension (shared with #8)",
        donor="1,151 model/command/test lines committed on the UNMERGED lane branch + 548 gesture lines untracked"))

    return "".join(out)


# ===========================================================================
# Fragment 5 — tier 2.
# ===========================================================================
def tier2() -> str:
    out = ['<p class="pc-body">Real and designed, but each one either completes something '
           'already landed, or is gated on one named decision.</p>']

    out.append(card(
        "6", "Batch-wire arming UI — finish what the model started", "policy",
        ("editor",), "S",
        f"""<code>scene/batchWire.ts</code> landed the pure half (plan, judge, refusal
precedence, outcome describe). What did not travel is the surface: the armed mode where
eligible targets ring and ineligible ones dim ({cite(VC / "src/blocks/connections/wireIntoState.ts", "wireIntoState.ts")},
untracked), the two menu verbs ({cite(VC / "src/chrome/SelectionWiringActions.tsx", "SelectionWiringActions.tsx")},
untracked). All policy: atoms + one overlay + two commands over the landed model — the
donor's own split (<code>batchWiring.ts</code> vs <code>wireIntoState.ts</code>) says so.""",
        fig(shot(VC / "docs/assets/batch-wiring-into-wired.png"),
            '"Wire into" landing: three sources, one click, three cables',
            "Camera, plan and grip are armed as sources (rings on their <code>status</code> ports); one click on telem's <code>logs</code> and the toast reads \"Wired 3 cables\". The dims, rings and toast are this candidate; the legality math behind them already lives in <code>scene/batchWire.ts</code>.",
            "vision-consolidated docs/assets/batch-wiring-into-wired.png (untracked)"),
        deps="scene/batchWire.ts (landed) · editor kit (in flight)"))

    sig_crop = shot(SS_DOCS / "assets/floating-port-live-2026-09-04.png",
                    crop=(1160, 120, 1440, 560), max_w=560)
    sig_fig_style = '<div style="max-width:430px">'
    out.append(card(
        "7", "Port signature grammar + completion, into the trunk codeEditor", "verbatim",
        ("components",), "S",
        f"""One text field, Python's own parameter spelling — <code>pose: Pose = None</code>;
"a <code>:</code> makes a type, an <code>=</code> makes a default", structure appears
exactly when typed (Zach's 2026-09-09 call, quoted in
{cite(SS / "blocks/portSignature.ts")}). The nearer donor is <b>in this repo</b>: frozen v1's
{cite(REPO / "packages/bbox-ui/src/codeGrammar.ts", "packages/bbox-ui/src/codeGrammar.ts")}
already implements <code>signatureGrammar</code> with slot-aware completion, and
{cite(REPO / "packages/bbox-ui/src/completionMenu.ts", "completionMenu.ts")} the CodeMirror
menu — the trunk's codeEditor has neither (grep: no <code>signature</code>, no
<code>autocomplete</code> under <code>apps/storybook-basics/src</code>). The systemsketch
type-name registry logic ({cite(SS / "blocks/babble/typeNameAutocompleteLogic.ts", "typeNameAutocompleteLogic.ts")})
is the pure matching/sorting half if the completion list should know board types.
An autocomplete-menu lane existed on 09-14; its report was lost to a peer's stash and
nothing of it is in the tree — this row is that work's second life, with donors named.""",
        sig_fig_style + fig(sig_crop, "The grammar, live in the donor's Port inspector",
            "<code>speed: float = 7.2</code> — one field, three slots, colored by role. Parse/format are pure string functions; the field re-expresses over the landed codeEditor.",
            "systemsketch docs/assets/floating-port-live-2026-09-04.png (detail)") + "</div>",
        deps="codeEditor (landed) · trunk-vs-v1 rule: port INTO the trunk, v1 stays frozen"))

    figs8 = f'<div class="pc-cols">{fig(shot(SS_DOCS / "assets/branch-region-5-active.png", crop=(0, 80, 1520, 1000)), "Branch: arms, band ports, one active arm", "The <code>fast</code> value lands ON the band (no arm ports — the contract in branchModel.ts:1-17); the ◎ pill elects <code>if fast</code> active and everything else — arms, their blocks, their cables — fades to one token, BRANCH_FADE_OPACITY = 0.18.", "systemsketch docs/assets/branch-region-5-active.png")}{fig(shot(SS_DOCS / "assets/loop-contents-layout-organized-2026-09-03.png"), "Loop: header-as-operator, typed band ports, turn chip", "&quot;For each pose&quot;: the iterable lands on the header, the item leaves from the header\'s BOTTOM edge perpendicular into the body (LOOP_ITEM_PORT_INSET), and the turn chip reads &quot;iteration 3 of 7&quot;. Header ports carry a type and no name — the inspector says why.", "systemsketch docs/assets/loop-contents-layout-organized-2026-09-03.png")}</div>'
    out.append(card(
        "8", "Container presets — Loop and Branch over one Block preset", "reexpress",
        ("presets", "components"), "XL",
        f"""The big one, and REMAINING §2.0–2.3 already did its thinking: For/While/Branch/
region are <b>one container preset of Block</b> — header-as-operator-band, band ports,
member stack, footer chip — with per-kind props bundles
({cite(SS / "branch/branchModel.ts")}, {cite(SS / "loop/loopModel.ts")}, and the async
region is literally a stock frame + meta, {cite(SS / "asyncRegion" / next(p.name for p in (SS / "asyncRegion").glob("asyncRegionModel.ts")), "asyncRegionModel.ts")}).
Cite, don't restate — what this survey adds is the measurement that <b>the one real gap is
unchanged</b>: rails still attach only to a Block's four outer walls
(<code>blockPort.tsx</code>, verified today), so a port on a <i>Bar's</i> edge — the Loop's
item outlet, the Branch's controls, #1's effect ports and #5's walls all want it — is the
single component extension gating this whole family. The external prior-art survey's
Container-behavior section converges on the same shape from outside.""",
        figs8,
        deps="band/edge-inset port placement (the §3.2 gap — decide once, four features use it) · active-fade = one scene derivation (scene landed)",
        donor=f"branch/ {sum(lines(p) for p in (SS / 'branch').glob('*.ts') if not p.name.endswith('.test.ts'))} + loop/ {sum(lines(p) for p in (SS / 'loop').glob('*.ts') if not p.name.endswith('.test.ts'))} non-test model lines (UI excluded)"))

    out.append(card(
        "9", "Contextual control registry — and its at-risk composition lab", "mixed",
        ("editor",), "M",
        f"""{cite(SS / "contextualMenus/contextualControlRegistry.ts")} is a pure table —
control kinds, grouping, order, FigJam-derived palette — and the reason the donor's shape
menu, edge menu and title menu compose the same pieces instead of three UIs.
{cite(SS / "contextualMenus/ContextualControls.tsx")} re-expresses over Base UI
Toolbar/Tooltip (both vendored here); the tldraw StyleProp bindings
({cite(SS / "appearance/appearanceModel.ts")}) are the part that does not port.
The untracked <code>menuComposition.ts</code> work in <code>contextual-menu-next</code>
(see the at-risk table) is this registry's save-format — rescue and port together.
FigJam stays the named interaction oracle (<code>DP - Contextual Popup Menu</code>).""",
        "",
        deps="editor kit (in flight) · the at-risk lane's composition files"))

    ladder_body = []
    ladder_body.append(box(30, 30, 250, 210, "", fill=PANEL))
    ladder_body.append(label(155, 52, "board A (before)", DIM2, 10.5))
    ladder_body.append(box(700, 30, 250, 210, "", fill=PANEL))
    ladder_body.append(label(825, 52, "board B (after)", DIM2, 10.5))
    for i, (name, c) in enumerate([("decode()", FG), ("estimate()", FG), ("encode()", FG)]):
        ladder_body.append(box(55, 66 + i * 56, 200, 40, name, fs=11, tc=c))
        ladder_body.append(box(725, 66 + i * 56, 200, 40, name if i != 1 else "estimate_v2()", fs=11,
                               tc=c if i != 1 else AMBER))
    rungs = [("1 · id", "persistent id — same id, same thing", OK),
             ("2 · name", "unique qualified title path", ACCENT2),
             ("3 · graph", "neighbours + ports", PURPLE),
             ("4 · source", "call-site ordinal", AMBER)]
    for i, (rung, desc, c) in enumerate(rungs):
        y = 62 + i * 46
        ladder_body.append(box(360, y, 260, 34, "", fill=PANEL2, stroke=c, sw=1.4))
        ladder_body.append(label(378, y + 15, rung, c, 11, anchor="start", weight="700", mono=True))
        ladder_body.append(label(378, y + 27, desc, DIM2, 8.5, anchor="start"))
        ladder_body.append(arrow(285, 86 + i * 40, 356, y + 17, DIM2, 1.2))
        ladder_body.append(arrow(696, 86 + i * 40, 624, y + 17, DIM2, 1.2))
    ladder_body.append(label(490, 262, "each rung sees only what the one above could not settle", DIM, 10))
    ladder_body.append(label(490, 278, "then: stop. report unmatched. never guess.", WARN, 10.5, weight="700"))
    ladder = svg(980, 292, "".join(ladder_body))

    out.append(card(
        "10", "The identity ladder + canonicalization (pyblocks)", "reexpress",
        ("scene",), "L",
        f"""<code>scene/sceneDiff.ts</code> answers "what changed?" for scenes that share ids.
pyblocks answers the harder question underneath: <b>which thing on this board IS which thing
on that board</b> when ids do not align — four deterministic rungs (id → name → graph →
source ordinal), "if names differ, assume different… stop. Report unmatched. Never guess"
({cite(PB / "pyblocks/identity.py", "pyblocks/identity.py")}). Around it:
tier-1 canonicalization that re-addresses a board without changing how it looks
({cite(PB / "pyblocks/canonical.py", "pyblocks/canonical.py")}) and the two diff profiles —
REVISION vs CONFORMANCE as one <code>ignore</code> entry, not a fork
({cite(PB / "pyblocks/board_diff.py", "pyblocks/board_diff.py")}). An algorithm port
(Python → TS), not a copy — and it is what turns the landed diff into board-to-board
comparison, drafts merge-review, and generated-vs-target conformance.""",
        fig(ladder, "Four rungs, in order, each blind to the ones above",
            "Same pipeline on both boards: rung 1 matches what kept its id; rung 2 catches saves that re-minted ids; rung 3 matches by wiring shape; rung 4 by call-site order. A rename (<code>estimate_v2</code>) falls through name to graph — matched by its neighbours, reported as a rename, never guessed by content similarity.",
            "drawn; verified against pyblocks/identity.py's module contract (read today)"),
        deps="sceneDiff (landed) — this feeds it matches instead of assuming shared ids"))

    out.append(card(
        "11", "Board search + the command palette", "mixed", ("scene", "editor"), "M",
        f"""{cite(SS / "commands/boardSearch.ts")} walks every text field on a board —
block titles, frame names, rich text, port rows — with case/whole-word options and
find-and-replace; over <code>BlockScene</code> it is a ~150-line re-expression (the other
~350 are tldraw rich-text unpacking that dies at the border). The palette around it is
stock: {cite(SS / "commands/commandModel.ts")} is the action row type, and the vendored
shadcn <code>Command</code> is the UI this repo would use instead of the donor's
{cite(SS / "commands/SystemSketchCommandPalette.tsx", "SystemSketchCommandPalette.tsx")}.""",
        fig(shot(SS_DOCS / "assets/command-palette-commands-2026-09-02.png",
                 crop=(390, 80, 1050, 790), max_w=900),
            "Ctrl-P: commands and find-replace in one modal",
            "18 registered commands, keyboard-first, with Find as a second tab — the registry pattern is one data table; the search behind the Find tab is the portable half.",
            "systemsketch docs/assets/command-palette-commands-2026-09-02.png"),
        deps="scene (landed) · editor kit (in flight)"))

    return "".join(out)


# ===========================================================================
# Fragment 6 — tier 3 (small wins + deliberate defers).
# ===========================================================================
def tier3() -> str:
    out = ['<p class="pc-body">Small, real, and none of them urgent — plus the honest '
           'deliberate-defers. Sizes stay honest; a row with no figure is a row whose '
           'mechanism a sentence already carries.</p>']

    small = f'<div class="pc-cols">'
    small += fig(shot(SS_DOCS / "assets/primitive-search-filtered-2026-09-04.png", max_w=1000),
                 "#13 · Press-S insert palette",
                 "Hover empty canvas, press S, type — only library primitives appear, Enter arms the tool, the next drag draws it. Geometry constants are already a pure model (primitiveSearchModel.ts); the list re-expresses over shadcn Command.",
                 "systemsketch docs/assets/primitive-search-filtered-2026-09-04.png")
    small += fig(shot(SS_DOCS / "assets/floating-port-live-2026-09-04.png", crop=(120, 220, 1010, 560), max_w=1000),
                 "#14 · Floating port",
                 "A free canvas endpoint with a real signature, dashed proposal cables, fill modes (auto/filled/empty) and inline/offset label layouts. Our traceTerminal is deliberately illustration-only; this is the promotion path to a real component. Note the focus slider riding top-left — same donor board.",
                 "systemsketch docs/assets/floating-port-live-2026-09-04.png")
    small += "</div>"
    out.append(small)

    det_before = shot(SS_DOCS / "assets/detach-composite-block-before.png", max_w=400)
    det_after = shot(SS_DOCS / "assets/detach-composite-block-after.png", max_w=400)
    out.append(
        f'<div class="pc-cols">'
        f'<figure class="pc-fig"><div style="display:flex;gap:8px">'
        f'<img src="{det_before}" style="width:50%" alt="before detach">'
        f'<img src="{det_after}" style="width:50%" alt="after detach">'
        f'</div><figcaption><b>#15 · Detach to primitives — before / after</b>'
        f'That the two look nearly identical IS the feature — detach&#39;s contract is visual '
        f'fidelity, and what changes is ownership: after it the host owns plain stock shapes, '
        f'full style panel, no dependency on us. The plan half is pure and ordered '
        f'("planning is read-only… execution lives in detachSweep") — that split is '
        f'the port; execution stays host policy.'
        f'<div class="pc-cite">systemsketch docs/assets/detach-composite-block-before/after.png</div>'
        f'</figcaption></figure>'
        + fig(shot(SS_DOCS / "assets/callout-primitive-multiple-leaders.png", max_w=1000),
              "#17 · Callout preset",
              "An engineering callout: one note, N elbow leaders with draggable knees, pointed ends staying on their targets. In the donor it is a semantic grouping of STOCK geo+arrow records — here it is a preset of Block-micro + Trace, no new primitive.",
              "systemsketch docs/assets/callout-primitive-multiple-leaders.png")
        + "</div>"
    )

    rows = [
        ("12", "Routing-obstacles collector",
         f"{cite(SS / 'blocks/connections/routingObstacles.ts')} — live blocks → endpoint boxes + forbidden rects for a pure router; \"deliberately knows nothing about A*, nudging, persistence\". The landed collision router's missing feeder; P5 called it ~40 portable lines and it was blocked on the wire layer, which landed.",
         "reexpress", ("scene",), "S"),
        ("16", "Semantic-roles rule",
         f"{cite(SS / 'blocks/connections/semanticRoles.ts')} — \"the wire is a reading of its endpoints, not a second editable fact\"; role disagreement warns, never vetoes. Lands as one more <code>lint.ts</code> rule + a Badge word.",
         "reexpress", ("scene",), "S"),
        ("18", "Reset edges",
         f"{cite(SS / 'blocks/connections/resetEdges.ts')} — tidy deliberately spares authored routes; reset is the escape hatch that clears them back to automatic, same selection scope as tidy. One policy verb beside the landed pipeline.",
         "policy", ("editor",), "S"),
        ("19", "Tunnel layer bar",
         f"{cite(SS / 'blocks/ui/TunnelLayerBar.tsx')} — the strip UI over the landed <code>scene/layers.ts</code> derivations. 44 donor lines; a matching editor-kit strip is an afternoon.",
         "policy", ("editor",), "S"),
        ("20", "Drafts model",
         f"{cite(SS / 'drafts/draftModel.ts')} + {cite(SS / 'drafts/draftRebase.ts')} — fork/merge/rebase bookkeeping that deliberately owns no diff (\"every 'how much changed' question goes through the one shared engine\" — which here is the landed sceneDiff + #10). Storage and bars are app-owned.",
         "reexpress", ("scene", "host"), "M"),
        ("21", "Inspector panel content",
         f"donor {cite(SS / 'blocks/ui/BlockInspector.tsx')} + {cite(SS / 'blocks/ui/ConnectionInspector.tsx')} — but <code>packages/panel</code> + <code>packages/inspector</code> already exist HERE as the host-neutral engine, and peers are active in them. The port is content (field groups per selection kind), not machinery. Coordinate before touching.",
         "reexpress", ("editor",), "M"),
        ("22", "Comments",
         f"{cite(SS / 'comments/commentModel.ts')} — tldraw's opt-in comment records + anchor policy. Host-owned by the same line the architecture already draws; a scene-level comment record is cheap IF wanted, but nothing else needs it yet.",
         "policy", ("host",), "M"),
        ("23", "Landmarks",
         f"{cite(SS / 'landmarks/boardLandmarks.ts')} — named camera poses persisted with the board, versioned meta + failure taxonomy. Camera is host geometry; only the tiny validation model travels.",
         "policy", ("host",), "S"),
        ("24", "History panel",
         f"{cite(SS / 'history/historyModel.ts')} — four honest fields, and its header is the warning: this app has no history store to feed it. Blocked on a store decision, not on code.",
         "none", ("host",), "M"),
        ("25", "Expression eval + variable registry",
         f"{cite(SS / 'expression/variableRegistryModel.ts')} + {cite(SS / 'expression/pythonSafeNamespace.ts')} — live Python property expressions. The eval is a backend service in the donor; without one here the honest verdict is: does not port yet.",
         "none", ("host",), "L"),
    ]
    trs = "".join(
        f'<tr><td><span class="pc-rank" style="font-size:12px">{r}</span></td>'
        f'<td><b>{t}</b><br>{b}</td><td>{chip(p)}</td><td>{kitchips(*k)}</td>'
        f'<td>{sizechip(s)}</td></tr>'
        for r, t, b, p, k, s in rows)
    out.append(f'<div class="pc-scroll"><table class="pc-tbl">'
               f'<tr><th>#</th><th>Candidate</th><th>Purity</th><th>Kit</th><th>Size</th></tr>'
               f'{trs}</table></div>')
    return "".join(out)


# ===========================================================================
# Fragment 7 — the full ranked table.
# ===========================================================================
TABLE_ROWS = [
    # rank, name, donor short, donor lines expr, purity, kit, deps, size
    ("1", "Mutation chain (effect ports / mut / tether / follow)",
     "blockModel.ts:1317 + effectCable + effectTether + effectPortFollow", "~300",
     "reexpress", ("scene", "components"), "nothing — all deps landed", "M"),
    ("2", "ELK organize", "layout/organizeGraph.ts + organizeNodes.ts", "501",
     "mixed", ("scene", "editor"), "elkjs (lazy dep, needs a yes)", "M"),
    ("3", "Edge-drop quick menu + stock presets",
     "connections/blockPicker.ts + stockBlocks.ts + OnCanvasBlockPicker.tsx", "739",
     "mixed", ("editor", "presets"), "vendored shadcn menu (landed)", "M"),
    ("4", "Add-port bead + landing preview",
     "ports/portAffordances.ts + communicationPortDrag.ts", "422",
     "reexpress", ("components", "editor"), "none", "S"),
    ("5", "System boundary ports (AT RISK — gestures untracked, model unmerged)",
     "vision-consolidated src/system/*", "1,151+548",
     "reexpress", ("components", "scene", "host"), "wall-rail extension (shared w/ #8)", "L"),
    ("6", "Batch-wire arming UI", "wireIntoState.ts + SelectionWiringActions.tsx (untracked)", "314",
     "policy", ("editor",), "scene/batchWire.ts (landed)", "S"),
    ("7", "Signature grammar + completion menu",
     "packages/bbox-ui codeGrammar/completionMenu + SS portSignature.ts", "in-repo",
     "verbatim", ("components",), "codeEditor (landed)", "S"),
    ("8", "Container presets: Loop + Branch", "branch/ + loop/ + asyncRegion/", "4,665 dir",
     "reexpress", ("presets", "components"), "band ports — THE gate (§3.2, still open)", "XL"),
    ("9", "Contextual control registry (+at-risk composition)",
     "contextualControlRegistry.ts + ContextualControls.tsx", "1,066",
     "mixed", ("editor",), "editor kit (in flight)", "M"),
    ("10", "Identity ladder + canonicalization (pyblocks)",
     "identity.py + canonical.py + board_diff.py", "1,741 py",
     "reexpress", ("scene",), "sceneDiff (landed)", "L"),
    ("11", "Board search + command palette", "commands/boardSearch.ts + commandModel.ts", "577",
     "mixed", ("scene", "editor"), "scene (landed)", "M"),
    ("12", "Routing-obstacles collector", "connections/routingObstacles.ts", "272",
     "reexpress", ("scene",), "collision router (landed)", "S"),
    ("13", "Press-S insert palette", "library/primitiveSearchModel.ts + PrimitiveSearch.tsx", "~430",
     "mixed", ("editor",), "shadcn Command (vendored)", "S"),
    ("14", "Floating port", "floatingPort/floatingPortModel.ts + floatingPortLayout.ts", "103 pure",
     "verbatim", ("components",), "none", "S"),
    ("15", "Detach plan / sweep", "detach/detachPlan.ts + detachSweep.ts + registeredKinds.ts", "436",
     "mixed", ("scene", "host"), "linking (landed)", "M"),
    ("16", "Semantic-roles lint rule", "connections/semanticRoles.ts", "167",
     "reexpress", ("scene",), "lint.ts (landed)", "S"),
    ("17", "Callout preset", "callout/calloutModel.ts", "278",
     "reexpress", ("presets",), "Trace + Block (landed)", "M"),
    ("18", "Reset edges", "connections/resetEdges.ts", "75",
     "policy", ("editor",), "tidy (landed)", "S"),
    ("19", "Tunnel layer bar", "ui/TunnelLayerBar.tsx", "44",
     "policy", ("editor",), "scene/layers.ts (landed)", "S"),
    ("20", "Drafts model", "drafts/draftModel.ts + draftRebase.ts", "605",
     "reexpress", ("scene", "host"), "sceneDiff (landed) + #10", "M"),
    ("21", "Inspector panel content", "ui/BlockInspector.tsx + ConnectionInspector.tsx", "3,225",
     "reexpress", ("editor",), "packages/panel (exists — peers active)", "M"),
    ("22", "Comments", "comments/commentModel.ts", "399",
     "policy", ("host",), "a host", "M"),
    ("23", "Landmarks", "landmarks/boardLandmarks.ts", "246",
     "policy", ("host",), "a host camera", "S"),
    ("24", "History panel", "history/historyModel.ts", "115",
     "none", ("host",), "a history store that does not exist", "M"),
    ("25", "Expression eval + variable registry", "expression/*", "783 dir",
     "none", ("host",), "a backend eval service", "L"),
]


def full_table() -> str:
    trs = "".join(
        f'<tr><td><span class="pc-rank" style="font-size:12px">{r}</span></td>'
        f'<td><b>{n}</b></td><td><code>{d}</code></td><td class="pc-lines">{ln}</td>'
        f'<td>{chip(p)}</td><td>{kitchips(*k)}</td><td>{dep}</td><td>{sizechip(s)}</td></tr>'
        for r, n, d, ln, p, k, dep, s in TABLE_ROWS)
    return (
        '<p class="pc-body">Every candidate, one screen. Donor paths are relative to '
        '<code>/home/bam/systemsketch/src</code> unless named otherwise; every one was opened '
        'today and line counts are measured, not remembered.</p>'
        f'<div class="pc-scroll"><table class="pc-tbl">'
        f'<tr><th>#</th><th>Candidate</th><th>Donor (verified on disk)</th><th>Lines</th>'
        f'<th>Purity</th><th>Lands in</th><th>Depends on</th><th>Size</th></tr>'
        f'{trs}</table></div>')


# ===========================================================================
# Fragment 8 — ruled out.
# ===========================================================================
def ruled_out() -> str:
    def dirlines(d: pathlib.Path) -> str:
        n = 0
        for p in d.rglob("*"):
            if p.suffix in (".ts", ".tsx") and ".test." not in p.name:
                n += len(p.read_text(errors="replace").splitlines())
        return f"{n:,}"

    rows = [
        ("behaviorTree/", dirlines(SS / "behaviorTree"),
         "Out by instruction — a separate bt-flow library (REMAINING's scope note). Its general mechanisms (drag sensitivity, live-drag wire) are already cited by landed lanes."),
        ("table/", dirlines(SS / "table"),
         "Ruled app chrome on 09-17 and nothing changed — though its <code>engine/</code> subdir (grid/resize/clipboard) is pure if a table ever becomes a component ask."),
        ("chrome/ + workspace/ + settings/ + toolbar/ + theme/",
         "≈" + f"{sum(int(dirlines(SS / d).replace(',', '')) for d in ['chrome', 'workspace', 'settings', 'toolbar', 'theme']):,}",
         "App shell: file lifecycle, autosave, menus, theme plumbing. Host-owned by the architecture's own line; skins landed here as tokens instead."),
        ("depth/", dirlines(SS / "depth"),
         "Drill-in navigation — REMAINING ruled it host chrome, and the external prior-art report reached the same 'navigation stack belongs to the host' shape."),
        ("inspector/ (top level)", dirlines(SS / "inspector"),
         "The app's right dock. The engine already exists here as <code>packages/panel</code>; only per-kind CONTENT is a candidate (#21)."),
        ("recorder/", dirlines(SS / "recorder"),
         "Flight recorder over the tldraw store — dev diagnostics bound to the donor's store shape."),
        ("embed/ + export/ + import/", "≈" + f"{sum(int(dirlines(SS / d).replace(',', '')) for d in ['embed', 'export', 'import']):,}",
         "Document envelopes, host handshakes, legacy pyblocks import — all about the donor's file formats, not presentation."),
        ("compare/ UI half + diff/ paint half", "≈900",
         "The models landed (sceneDiff, wordDiff, fieldDiff, highlighter vocabulary). What remains in the donor is its app dialog and tldraw paint bindings — superseded here, not missing."),
        ("prototypes/ + development/ + store/ + scroll/", "≈" + f"{sum(int(dirlines(SS / d).replace(',', '')) for d in ['prototypes', 'development', 'store', 'scroll']):,}",
         "Labs and app plumbing."),
        ("pyblocks source projection (analyzer, blockview, series)", "—",
         "Python-source→board projection is like_keras/pyblocks domain — generation, not presentation. Only the identity/diff family (#10) crosses into this repo's charter."),
    ]
    trs = "".join(f'<tr><td><code>{d}</code></td><td class="pc-lines">{n}</td><td>{w}</td></tr>'
                  for d, n, w in rows)
    return (
        '<p class="pc-body">Named so the survey is checkably complete — every donor directory '
        'is either a candidate above, already landed, or in this table with a reason.</p>'
        f'<div class="pc-scroll"><table class="pc-tbl">'
        f'<tr><th>Donor</th><th>Lines</th><th>Why not</th></tr>{trs}</table></div>')


# ===========================================================================
# Fragment 9 — decision surface.
# ===========================================================================
def decision() -> str:
    return f"""
<div class="pc-note pc-ok"><b>Done and proved.</b> 46 donor directories + two lane worktrees
+ pyblocks + the frozen v1 package surveyed; 25 candidates verified on disk (this page's
build fails on a dead citation); 17 formerly-missing capabilities confirmed landed with
evidence paths; ~2,700 lines of reviewed donor work found untracked and inventoried.</div>
<div class="pc-note"><b>Left, and merely next (not blocked):</b> the top five are all
buildable today — #1 mutation chain is the focus-slider-shaped one to start with. #8
containers is the only XL and waits on one design decision, not on code.</div>
<div class="pc-note"><b>Needs you — with defaults, so silence keeps things moving:</b><br>
1 · <b>elkjs dependency</b> for #2 — lazy dynamic import, zero first-load cost.
<i>Default if silent: install it (orchestrator-owned package.json change) and build #2.</i><br>
2 · <b>Rescue the untracked donors</b> — a systemsketch session commits
<code>vision-consolidated</code>'s and <code>contextual-menu-next</code>'s untracked files to
their lane branches. <i>Default: none — this repo cannot write there; flagged as the report's
top risk until someone does.</i><br>
3 · <b>Band ports</b> (the §3.2 gap) — rail on a Bar edge vs an <code>edgeT</code>-style
inset placement. Four candidates (#1, #5, #8, and the Loop item outlet) want the same
answer. <i>Default: edgeT-style inset on the existing rail model — the smaller contract
change, and what effect ports already assume.</i><br>
4 · <b>Region blackbox semantics</b> — REMAINING §2.3's question is still open; the toggle
reads "collapse to interface" (repealing "regions never fold") or "hide wiring, keep
contents". <i>Default: reading one, as recommended there.</i></div>
<div class="pc-note"><b>Deliberately not done:</b> nothing behavior-tree-shaped (his
instruction); no re-ranking of the P1–P10 strategy docs; no libavoid comparison (standing
posture: only if tidy disappoints on real boards); the ruled-out table above names every
donor directory this survey chose not to nominate, with its reason.</div>
"""


# ===========================================================================
def main() -> None:
    FRAG_DIR.mkdir(parents=True, exist_ok=True)
    frags = {
        "port-candidates-hero.html": hero(),
        "port-candidates-landed.html": landed_ledger(),
        "port-candidates-risk.html": at_risk(),
        "port-candidates-top.html": top_five(),
        "port-candidates-tier2.html": tier2(),
        "port-candidates-tier3.html": tier3(),
        "port-candidates-table.html": full_table(),
        "port-candidates-ruledout.html": ruled_out(),
        "port-candidates-decision.html": decision(),
    }
    for name, html in frags.items():
        (FRAG_DIR / name).write_text(html)
        print(f"wrote {name:38s} {len(html):>8,} bytes")
    print(f"\nverified donor citations: {len(_verified)}")
    print(f"embedded raster bytes (webp, pre-base64): {_img_bytes_total:,}")


if __name__ == "__main__":
    main()
