#!/usr/bin/env python3
"""Build the one report for the 2026-09-18 overnight build: control-flow
presets in the trunk, SystemSketch rebuilt as bbox-ui + stock tldraw, the
optional pyblocks backend, and the source-code view retarget.

    python3 docs/build_control_flow_systemsketch_rebuild_report.py

Writes a self-contained HTML page (every capture, the hero video and its
poster inlined as data URIs) to the gitignored media half of reports/:

    /home/bam/bbox-ui/reports/media/control-flow-and-systemsketch-rebuild-2026-09-18.html

Inputs it reads at build time (all read-only):
  - the lane captures under reports/media/lanes-2026-09-18/<lane>/*.png
  - Zach's own sketches in /home/bam/zach_brain/Pasted image 2026091815*.png
  - the hero recording staged in reports/media/<report-name>/hero/
    (recorded by Playwright's recordVideo against the real app on :4432
    from the integration worktree, 2026-09-19 10:33; the raw 1280x800
    capture sits beside the encoded copies)
  - the four plans' criteria and stock-part tables (docs/*-PLAN.md)
  - the in-flight lane's capture directory, if it exists by the time
    this runs (scv-scv-origin-on-app-shape); otherwise an in-flight note

Everything else in the page — lane status, audit verdicts, commits, gate
numbers, deviations — is a snapshot transcribed from the three build
journals and the integration log at the time of writing; the Source Index
at the bottom names each file so a stale claim can be traced.

The desktop preview refuses a page whose encodeURIComponent form exceeds
2,097,024 bytes, so this script downscales every capture to <=1000px wide,
re-encodes it as WebP, and prints the on-disk and encoded sizes at the end.
It inlines the GIF fallback only if the page still fits with it.
"""
from __future__ import annotations

import base64
import html
import io
import json
import pathlib
import re
import sys
from urllib.parse import quote

from PIL import Image, ImageChops

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent
REPORT_NAME = "control-flow-and-systemsketch-rebuild-2026-09-18"
MAIN_CHECKOUT = pathlib.Path("/home/bam/bbox-ui")
OUT = MAIN_CHECKOUT / "reports" / "media" / f"{REPORT_NAME}.html"
LANES = MAIN_CHECKOUT / "reports" / "media" / "lanes-2026-09-18"
HERO_DIR = MAIN_CHECKOUT / "reports" / "media" / REPORT_NAME / "hero"
HERO_FALLBACK = pathlib.Path(
    "/tmp/claude-1000/-home-bam-bbox-ui/f89f7a52-bbac-4b47-91c0-0ee0c4fe98dd/scratchpad/scribe-hero"
)
BRAIN = pathlib.Path("/home/bam/zach_brain")
INFLIGHT_DIR = LANES / "scv-scv-origin-on-app-shape"
CAP = 2_097_024

USED: list[str] = []


# ---------------------------------------------------------------- media

def img(path: pathlib.Path, max_w: int = 1000, quality: int = 70, trim: bool = True,
        crop: tuple[float, float, float, float] | None = None, pad: int = 12) -> str:
    """A PNG on disk -> a trimmed, downscaled WebP data URI."""
    if not path.exists():
        raise SystemExit(f"missing capture: {path}")
    USED.append(str(path))
    im = Image.open(path).convert("RGB")
    if crop:
        l, t, r, b = crop
        im = im.crop((int(im.width * l), int(im.height * t), int(im.width * r), int(im.height * b)))
    if trim:
        bg = Image.new("RGB", im.size, im.getpixel((0, 0)))
        box = ImageChops.difference(im, bg).getbbox()
        if box:
            im = im.crop((max(0, box[0] - pad), max(0, box[1] - pad),
                          min(im.width, box[2] + pad), min(im.height, box[3] + pad)))
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=quality, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


def data_uri(path: pathlib.Path, mime: str) -> str:
    USED.append(str(path))
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def hero_path(name: str) -> pathlib.Path | None:
    for d in (HERO_DIR, HERO_FALLBACK):
        p = d / name
        if p.exists():
            return p
    return None


# ---------------------------------------------------------------- markdown tables

def esc(s: str) -> str:
    return html.escape(s, quote=False)


def inline(s: str) -> str:
    """Markdown inline -> HTML, after escaping."""
    s = esc(s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![*\w])\*([^*]+)\*(?![*\w])", r"<em>\1</em>", s)
    return s


def md_tables(md: pathlib.Path, start: str, end: str) -> str:
    """Every markdown table between two heading prefixes, as HTML."""
    lines = md.read_text().split("\n")
    i0 = next(i for i, l in enumerate(lines) if l.startswith(start))
    i1 = next((i for i, l in enumerate(lines) if i > i0 and l.startswith(end)), len(lines))
    out, table, caption = [], [], None
    for l in lines[i0:i1]:
        if l.startswith("### ") or l.startswith("#### "):
            caption = l.lstrip("#").strip()
        if l.startswith("|"):
            table.append(l)
            continue
        if table:
            out.append(render_table(table, caption))
            table, caption = [], caption
    if table:
        out.append(render_table(table, caption))
    return "\n".join(out)


def render_table(rows: list[str], caption: str | None) -> str:
    def cells(row: str) -> list[str]:
        row = row.strip()
        if row.startswith("|"):
            row = row[1:]
        if row.endswith("|"):
            row = row[:-1]
        return [c.strip() for c in re.split(r"(?<!\\)\|", row)]
    head = cells(rows[0])
    body = [cells(r) for r in rows[2:]] if len(rows) > 2 else []
    h = "<table class='md'>"
    if caption:
        h += f"<caption>{inline(caption)}</caption>"
    h += "<thead><tr>" + "".join(f"<th>{inline(c)}</th>" for c in head) + "</tr></thead><tbody>"
    for r in body:
        h += "<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>"
    return h + "</tbody></table>"


# ---------------------------------------------------------------- widgets

def cite(*ns: int) -> str:
    return "<sup class='cite'>" + ",".join(f"<a href='#src-{n}'>{n}</a>" for n in ns) + "</sup>"


def fig(uri: str, caption: str, cls: str = "") -> str:
    return f"<figure class='{cls}'><img src='{uri}' loading='lazy' alt=''><figcaption>{caption}</figcaption></figure>"


def short_title(html_text: str, n: int) -> str:
    """Strip tags; cut at a word boundary so the copied markdown names the
    item readably instead of mid-path."""
    plain = html.unescape(re.sub(r"<[^>]+>", "", html_text)).strip()
    if len(plain) <= n:
        return plain
    cut = plain[:n].rsplit(" ", 1)[0].rstrip(",;:—- ")
    return cut + "…"


def verdict(kind: str, num: str, title: str) -> str:
    """Approve / Change / Reject + a note, per item. The kind, number and
    exact title travel with the copied markdown so Zach never has to
    hand-identify which item he means."""
    key = f"{kind}:{num}"
    return f"""
<div class="v" data-key="{esc(key)}" data-kind="{esc(kind)}" data-num="{esc(num)}" data-title="{esc(title)}">
  <button data-v="approve" aria-pressed="false">Approve</button>
  <button data-v="change" aria-pressed="false">Change</button>
  <button data-v="reject" aria-pressed="false">Reject</button>
  <textarea placeholder="note…" spellcheck="false" rows="1"></textarea>
</div>"""


# ---------------------------------------------------------------- content data

PLANS = {
    "cf": HERE / "CONTROL-FLOW-PLAN.md",
    "ss": HERE / "SYSTEMSKETCH-REBUILD-PLAN.md",
    "pb": HERE / "PYBLOCKS-BACKEND-PLAN.md",
    "scv": HERE / "SOURCE-CODE-VIEW-RETARGET-PLAN.md",
}

# One row per lane: (uid, what, build, audits, fixes, landed, deviation)
# Transcribed from the three build journals + the integration log [8,9,10,13].
LANE_ROWS = [
    ("cf:A", "Region kit: scene queries, layout twin, <code>Region</code> component, host renderer",
     "PASS <code>c616d71</code>", "PASS (3 minor)", "0", "merged <code>d09fbe2</code>",
     "An 8th story (<code>HeaderChipAndMarks</code>) added so the chip/marks code path ships run; the 160px corner card wraps “For Loop” onto two lines when a chip is present."),
    ("cf:B", "Loop preset: <code>forLoopNode</code> / <code>whileLoopNode</code> / <code>carriedValueEdge</code>, five fixtures transcribed from Zach's sketches, six stories",
     "PASS <code>edf60d4</code>", "PASS (3 minor)", "0", "merged <code>002cd58</code>",
     "<code>LOOP_WITH_BREAK</code> is a <em>while</em> loop (the sketch the brief names draws one); every crossing cable elbow-routed so lane D's <code>through</code> rule is exercised."),
    ("cf:C", "Branch preset: if/elif/else, match/case, nested, fold, active arm",
     "PASS <code>b1ec6c6</code>", "PASS (1 minor)", "0", "merged <code>5edb8f7</code>",
     "Fixture edges are not elbow-routed (lane D was not in its base); the nested inner region overflows the outer arm body by 3px."),
    ("cf:D", "Wires: keep-outs (bypass), endpoint boxes, <code>z⁻¹</code>/<code>mut</code> badges",
     "PASS <code>3b91b0a</code>", "PASS (2 minor)", "0", "merged <code>88fbc0d</code>",
     "Badge is <code>variant=\"secondary\"</code> (opaque), not the brief's <code>outline</code> — the cable was read through the pill. The planner's <code>expectWireAvoids</code> helper is vacuous (it samples the arrowhead); lanes B/D/F carry a real one locally."),
    ("cf:E", "Opaque projection (<code>projectOpaqueRegions</code>), the toggle, three hosts wired to it",
     "PASS <code>c52c96f</code>", "PASS (2 minor)", "0", "merged <code>837c1d1</code>",
     "Promotion policy is not the default <code>dagPolarityPolicy</code> — the frozen acceptance pins sink/left; the nested footer counts a region's direct arms only."),
    ("cf:F", "Registry item <code>region</code>, gallery stories (the whole language on one board), full gate",
     "PASS <code>4f337d2</code>", "PASS (5 minor)", "0", "merged <code>3040e85</code>",
     "<code>shadcn build</code> rewrote 18 stale item files; all reverted, only <code>region.json</code> kept. README's registry list is stale (43 items now). React Flow/tldraw gallery hosts paint their own edges: no bypass, no pills there."),
    ("cf:G", "Canvas-host member edges (React Flow <code>Handle</code> per member dot, tldraw anchors)",
     "PASS <code>cf6fc98</code>", "PASS (3 minor)", "0", "merged <code>07f86ec</code>",
     "tldraw's “within 14px of the dot” is measured to the trace's terminal stop (raw 15.88px, <code>TRACE_TERMINAL_GAP</code>); member cables paint under the parent's opaque card in both engines."),
    ("ss:L0", "Scaffold <code>apps/systemsketch</code>: stock tldraw 5.3.2 + <code>@trunk</code> alias + <code>ss-block</code> + one-slot dock + persistence + stock-boundary test + smoke",
     "FAIL <code>0f69fa1</code> → fix <code>76952b8</code> → fix <code>64b4313</code>", "FAIL ×3 — every blocker in planner-committed harness files", "2", "harness fixed by the dispatcher <code>bdc8a25</code>; merged <code>28fe1fb</code>",
     "Rail label is the port's <em>name</em> only (labels collided at the default width); self-hosted assets without an <code>@tldraw/assets</code> import in <code>src</code> (the stock-boundary test forbids it), proved with the network blocked; a global CSS override on Base UI's modal backdrop (owed upstream)."),
    ("ss:L1", "Code shape: <code>ss-code</code> renders the trunk <code>CodeEditor</code>, focus ↔ editing, per-keystroke writes, 10px grab ring",
     "PASS <code>5f613e3</code>", "PASS (2 minor)", "0", "merged <code>a59d1cb</code>",
     "CodeMirror language packages reached through a <code>@trunk/../node_modules/…</code> path (the app does not declare them — a package.json line the dispatcher owns); the box's width ratchets."),
    ("ss:L2", "Floating port: <code>ss-port</code> renders the trunk <code>LabeledPort</code>, one measured anchor, inline rename, direction decides the dot side",
     "PASS <code>d30390f</code> → fix <code>81fd4b8</code>", "FAIL (1 major) → PASS (2 minor)", "1", "merged <code>1c9dc47</code>",
     "Face now hugs its label (a fixed 120×32 box defeated the measurement pass). Dot side is the <em>opposite</em> of the archive's floating port — the committed test is the spec. <code>onEditEnd</code> deliberately not wired (StrictMode closes the rename)."),
    ("ss:L3", "Wires as data lines: <code>ss-wire</code> + <code>ss-wire-binding</code>, press-drag from a dot, Trace paint, derived scene, edit-event stream, edge-drop menu, <code>applyScene</code>",
     "PASS <code>67afc12</code> → fix <code>c79bda6</code> → fix <code>c6d285d</code>", "FAIL (1 major) → FAIL (3 major) → PASS (2 minor)", "2", "merged <code>c0741b9</code>",
     "All four <code>applyScene</code> defects (port names lowercased, no reparent-out, restyle = delete+recreate, position no-op) fixed and probed against a real editor. In-flight cable painted in the overlay, not a provisional shape. Two dispatcher-granted extensions: expanded block geometry is a <code>Group2d</code>; the smoke viewport is 1400×900."),
    ("ss:L4", "Editor menus through tldraw's component seams: chrome bar + undo/redo + file burger, floating selection toolbar, frames + problems panels, status strip",
     "PASS <code>fc0945f</code> → fix <code>7a6f2de</code> → fix <code>3d5f04c</code>", "FAIL (2 major) → FAIL (1 major = planner fixture) → PASS (4 minor)", "2", "merged <code>9cc2039</code>",
     "Wheel pass-through wired with tldraw's public <code>usePassThroughWheelEvents</code>; <code>parseAndLoadDocument</code> is not public in 5.3.2, so Open .tldr is <code>parseTldrawJsonFile</code> + <code>loadSnapshot</code> (+ zoom-to-fit). Rename trims whitespace; Escape closes any panel."),
    ("ss:L5", "Regions: Loop and Branch as <code>ss-region</code> frame-like shapes whose header contract is a real corner <code>ss-block</code>; arms fold; control flow is containment, never a line",
     "PASS <code>ccda260</code> → fix <code>93be83a</code> → fix <code>301e99e</code>", "FAIL (4 major) → FAIL (1 major) → PASS (4 minor)", "2", "gate failed in the merged tree (joint-only: fixture under the chrome bar) → dispatcher <code>1833d78</code> → merged <code>8317b59</code>",
     "Props ARE the geometry (drag-create was off by 239px, dead resize handle); the arm reconcile ported whole from the archive; armed tools no longer hijack every region create; duplicates repair <code>cornerBlockId</code>. <code>while</code> and the opaque region view are owed to L4's floating toolbar."),
    ("ss:L6", "Archive note (what moved where) + the two-line ARCHIVED banner for the old app's README",
     "PASS <code>910f697</code>", "PASS (2 minor)", "0", "merged <code>48cefcd</code>; banner applied at SystemSketch <code>517a4fb9</code>",
     "Two rows of the behaviours table over-state what the cited tests assert (containment-is-never-an-edge; the engine-free rule's scope)."),
    ("pb:pyblocks-scene-projection", "pyblocks: <code>block_view_to_scene</code> (nine projection rules), <code>to-systemsketch</code> CLI, <code>/api/systemsketch/{scene,events}</code> routes, <code>capabilities</code> on health",
     "PASS <code>d2822d9</code>", "PASS (2 minor)", "0", "on branch <code>claude/lane-pb-pyblocks-scene-projection-2026-09-18</code> (never merged to pyblocks main, by rule)",
     "pyblocks main's own unittest suite was already red (43 failures + 2 errors) before this lane; “typecheck” there means byte-compilation — the repo has no type checker."),
    ("pb:trunk-loader-events", "Trunk: <code>parsePyblocksScene</code> + <code>layoutUnplaced</code>, <code>deriveSceneEvents</code> + the event seam, pyblocks client, backend setting, port labels, proof stories",
     "FAIL <code>7f932ab</code> → fix <code>6082d86</code> → fix <code>d728792</code>", "FAIL ×3 — one red assertion, a contradiction between two planner-committed artifacts", "2", "fixture fixed by the dispatcher <code>bdc8a25</code>; merged <code>b877df8</code>",
     "39/40 green; the 40th pinned <code>from: null</code> in the fixture and <code>from: undefined</code> in the committed test for the same absent-key case. The builder refused to edit either and reported FAIL three times; the dispatcher dropped the fixture token. A value node's port face does not honour <code>portLabels</code> yet."),
    ("pb:app-backend-wiring", "App: <code>Backend: none | pyblocks @ url</code> with health, <code>Open Python file…</code>, board titled after the file, scene-event bridge + consumer, back-to-none removes every surface",
     "PASS <code>5927547</code> (acceptance first at <code>c8bc10d</code>) → fix <code>2e5013e</code> → fix <code>90778bf</code>", "FAIL (2 major) → FAIL (2 major) → FAIL (1 rule-based blocker, 5 minor)", "2", "merged by the dispatcher <code>0386529</code> — the last blocker was a write-set excursion, not a defect",
     "Round 2 edited two L4-owned files to fix real defects: the chrome title now reads tldraw's <code>TLDocument.name</code> (one title, not two), and <code>problems.ts</code> no longer reports a straight line as a cycle. Region <code>w/h</code> from pyblocks not carried; a <code>value</code> node lands as an <code>ss-block</code>; “Open Python file…” is its own top-right dropdown."),
    ("scv:scv-rung-a-scene", "Trunk Rung A: <code>collapseToCode</code> / <code>expandCode</code>, <code>definitionsToScene</code>, code-cell face, <code>OriginBadge</code>, stories",
     "PASS <code>c9810e6</code>", "PASS (2 minor)", "0", "merged <code>cbf0f6c</code>",
     "<code>OriginBadge</code>/<code>CodeCellFace</code> take the badge spec as a prop (a committed layering test forbids the import); in the opaque face the promoted port labels overprint the editor's first line."),
    ("scv:scv-definitions-partition", "pyblocks: <code>definition_graph.py</code> (grain-1 definitions view, exact spans + sha256, call/name/attribute references), <code>analyze --view-kind definitions</code>, frozen fixture",
     "PASS <code>60b633b</code>", "PASS (1 minor)", "0", "on branch <code>claude/lane-scv-scv-definitions-partition-2026-09-18</code> (contains the scene-projection lane)",
     "The dispatcher's pre-step had not landed the acceptance fixtures; the builder transcribed them from the plan rather than stop. Name resolution ignores shadowing bindings (a parameter named like a definition still yields a reference edge)."),
    ("scv:scv-origin-and-actions", "The four-state origin judge (<code>codeOriginState</code>, <code>isCodeOrigin</code>), the pyblocks-gated source actions, the right-click story, decision record <code>peps/0004</code>",
     "PASS <code>d65e404</code>", "PASS (1 minor)", "0", "merged <code>02f45ce</code>",
     "<code>isCodeOrigin</code> uses <code>Object.keys</code>, so a non-enumerable or symbol extra key still validates."),
    ("scv:scv-origin-on-app-shape", "Origin on the NEW app's code shape, host resolution, the badge, the backend switch, the source context-menu group",
     "in flight", "—", "—", "in flight at report time", "See the in-flight section above."),
]

# Needs-Zach items: (num, title, recommendation, default, cites)
NEEDS = [
    ("Z1", "Where the rebuilt SystemSketch lives: <code>apps/systemsketch</code> inside the bbox-ui monorepo, importing the trunk through one <code>@trunk</code> alias; <code>/home/bam/systemsketch</code> stays as the archive, untouched except the banner.",
     "Keep it. It is literally “bbox-ui + stock tldraw” with zero vendoring drift, and the archive's root checkout was dirty with a peer's work plus 258 worktrees.", "stays in the monorepo", (1, 3, 6)),
    ("Z2", "The corner block sits INSIDE the frame sharing its top-left border (the Labeled Group Node look), not above the frame as the Selector/Switch sketches draw it.",
     "Inside — it is the reference you named and the NEW/GOOD sketch; the acceptance measures the corner's top-left within 2px of the frame's.", "inside, sharing the frame's border", (2, 16)),
    ("Z3", "The opaque (P5) view is a PROJECTION over the scene — one field flips, crossing edges are re-pointed at promoted ports at paint time — not a document edit.",
     "Projection. Positions survive by construction; PEP 0003's mutating collapse stays for grouping a loose selection.", "projection", (2,)),
    ("Z4", "Branch arms are scene NODES (<code>type: \"arm\"</code>, children carry <code>parentId = arm</code>), and the branch's corner block has NO output port — arms fan in at the consumer.",
     "Nodes, no output port — your V1 pick twice over; folding one arm never moves a sibling's blocks.", "nodes; no output port", (2,)),
    ("Z5", "The <code>z⁻¹</code> pill is always drawn on a delayed cable inside a region, even when a backwards cable can only mean next turn.",
     "Always drawn — a redundant pill is cheaper than a reader who has to know which stage they are looking at.", "always drawn", (2,)),
    ("Z6", "Bypass routing (cables avoid regions they do not flow through) lands only on the DOM canvas tonight; React Flow and tldraw paint their own bezier/arrow and show no pills.",
     "Follow-up lane: route both canvas hosts through <code>routeTraceRequest</code> with elbow + their node rects. The rule is proven on the DOM canvas along the real path.", "DOM canvas only", (2, 10)),
    ("Z7", "Corner block width fixed at 160px (<code>REGION_CORNER_WIDTH_PX</code>) and the opaque card at 220px; with a header chip like “iteration 3 of 7” the title wraps onto two lines.",
     "Constants tonight; a per-node <code>data.cornerW</code> is a one-field follow-up if the wrap bothers you.", "constants", (2, 8)),
    ("Z8", "Shape type prefix <code>ss-</code> (<code>ss-block</code>, <code>ss-code</code>, <code>ss-port</code>, <code>ss-wire</code>, <code>ss-region</code>) — a saved <code>.tldr</code> and pyblocks' projection both spell these strings.",
     "Keep <code>ss-</code>; it cannot collide with the trunk's <code>bbox-node</code> or the old adapter's <code>bbox-block</code>. Renaming later is a shape migration, cheap but real.", "<code>ss-</code>", (3,)),
    ("Z9", "Members inside an expanded block are tldraw child shapes (stock frame containment), so expanded-block fit-to-content over children is a follow-up; phase-1 expanded blocks are hand-resized.",
     "Yes — interaction geometry is host-owned by the repo's rule, and <code>scene.parentId ↔ shape.parentId</code> is a 1:1 map.", "tldraw children", (3,)),
    ("Z10", "File format is plain <code>.tldr</code> (stock <code>persistenceKey</code> + Open/Save) — no <code>.systemsketch</code> envelope, no Python workspace host; archive boards are not openable in the new app.",
     "Ship <code>.tldr</code>; add a one-way importer lane once the vocabulary settles.", "<code>.tldr</code>, no importer", (3,)),
    ("Z11", "The trunk's <code>ToolDock</code> replaces tldraw's toolbar: one system slot (Block · Code · Port · Loop · Branch) beside the shape and draw families; hand/eraser/note/laser are keyboard-only.",
     "Replace — it is the thesis made literal and the archive's own seam.", "replace", (3,)),
    ("Z12", "Port rail labels in the app show the port's NAME only; the plan's default was one <code>name type</code> label, dropped in L0's fix round because both labels overlapped at the default block width.",
     "Accept name-only for phase 1; bring the type back through <code>LabeledPort</code>'s secondary slot as the follow-up the plan already lists.", "name only", (3, 8)),
    ("Z13", "Opening a Python file makes the selected function the ROOT REGION with its body nested inside (<code>root_as_region=True</code>; <code>--flat</code> keeps BlockView's shape).",
     "Root region — “everything is a block” applied to the def, and the function collapses to its signature with the region kit for free.", "root region", (4,)),
    ("Z14", "Unplaced nodes are laid out by the app (<code>x = 40 + 320·rank</code>, <code>y = 40 + 160·i</code> per scope); pyblocks never invents geometry.",
     "App-side; a <code>--layout</code> CLI flag can port the same formula later.", "app-side layout", (4,)),
    ("Z15", "Python files open through the browser's file picker; no fenced <code>GET /api/python/file</code> route, no mtime polling, so external edits do not refresh the board.",
     "Picker tonight; the route is follow-up F3 and deserves its own small design.", "picker, no polling", (4,)),
    ("Z16", "Default pyblocks URL <code>http://127.0.0.1:4177</code> (the desktop icon's port), editable in the setting; events go out as one POST per gesture, coalesced within 250 ms — no WebSocket.",
     "4177 and POST — pyblocks' <code>http.server</code> has no WS and the notebook lab's precedent is “no websocket, no protocol”.", "4177; POST", (4,)),
    ("Z17", "The OLD SystemSketch bridge in pyblocks (<code>systemsketch_adapter.py</code>, the <code>.systemsketch</code> formats, the goldens harness) is left untouched beside the new projection.",
     "Leave it as a stock seam; retire it once the goldens can be evaluated through <code>to-systemsketch</code>.", "untouched", (4,)),
    ("Z18", "“Open Python file…” lives in its own top-right <em>Python</em> dropdown next to the Backend chip, not in the ☰ burger's File group — the chrome bar's rows are memoised on <code>[editor, helpers]</code> and never re-render on a health flip.",
     "Accept for now; moving it into the burger needs a health dependency on the chrome bar (an L4 file), a small follow-up.", "separate dropdown", (10,)),
    ("Z19", "“Collapse to code” is offered ONLY with a pyblocks backend; with <code>Backend: none</code> the source group is absent from the context menu.",
     "Keep it gated — offering it without a parser would be a second “make composite” beside collapse-to-region.", "gated", (5,)),
    ("Z20", "Reference edges between definitions (“run calls estimate_pair”) are a dashed node-level dependency lane with no handles, not port-level data cables.",
     "Keep the dependency lane until grain-1 port semantics are drawn; a call inside held text is neither a data cable nor a control line.", "dashed reference edges", (5,)),
    ("Z21", "A pseudo (unbound) code cell shows a quiet <em>Pseudo</em> badge; <code>origin.uri</code> is a board-relative POSIX path; duplicate definitions anchor as <code>f</code>, <code>f#1</code>, <code>f#2</code>.",
     "Yes to all three as frozen — each is a one-line data edit to flip.", "as frozen", (5,)),
    ("Z22", "A <code>data-changed</code> event whose key was absent before reports <code>from: undefined</code> (the raw value); the planner's fixture had pinned <code>from: null</code> and the dispatcher dropped that token. A POSTed batch therefore carries no <code>from</code> key at all for that case.",
     "Fine for tonight — nothing consumes the events yet (<code>applied: 0</code>). If pyblocks' consumer wants a JSON-visible sentinel, flip to <code>?? null</code> and re-pin the test (both sides are one token).", "raw <code>undefined</code>", (10, 18)),
    ("Z23", "The pyblocks app lane's fix round edited two L4-owned files outside its write set (<code>chrome/chromeBar.tsx</code>: title from <code>TLDocument.name</code>; <code>chrome/problems.ts</code>: a straight line is not a cycle, +146/−4). Audit #3 called it a rule-based blocker; the dispatcher merged it because both fixes are real and probed.",
     "Keep it merged. The alternative — re-land the same two hunks under L4's name — buys process purity and nothing else.", "keep as merged", (10, 13)),
    ("Z24", "Rename commits in the app silently <code>trim()</code> whitespace (frames panel rows and the board title) — the truthful-property rule forbids silent normalisation of authored names.",
     "Stop trimming (two one-line edits) unless you want the trim; the next chore lane on the app takes it.", "stop trimming", (10,)),
]

# Known issues worth Zach's eye: (title, detail, cites)
ISSUES = [
    ("Effect-port label collides with the block title",
     "A <code>Block</code> with a header AND a top-wall port paints the port label over the header text — <code>effect:pose</code> sits across <code>merge()</code> on every gallery capture. Pre-existing in the trunk's <code>Block</code>, outside every control-flow lane's write set; the mutation cable is a fixture tonight, so the collision is visible but idle.", (9, 10)),
    ("Backend panel draws over the Problems panel header",
     "The pyblocks panel is mounted in tldraw's <code>SharePanel</code> slot (top-right), so when the Problems panel is open the <code>linear_chain.py</code> and <code>Python</code> pills sit on its close-× row (see the Problems capture above).", (10,)),
    ("Port rail label dropped the type",
     "L0's fix round changed the rail label from <code>name + \" \" + type</code> to <code>name</code> alone after measuring “frame Frame” and “Pose Pose” overlapping inside a 160px block. Plan §8.5's stated default is one <code>name type</code> label — see Z12.", (8,)),
    ("Base UI modal backdrop neutralised by a global CSS rule",
     "<code>apps/systemsketch/src/app.css</code> carries <code>[data-base-ui-portal]:has([role=\"menu\"]) &gt; [data-base-ui-inert] { pointer-events: none }</code> so the dock's popout backdrop does not swallow the next canvas click. It reaches into Base UI internals and is owed upstream to the kit's <code>ToolDock</code>.", (8,)),
    ("WHY comments that lie a little",
     "Three audits flagged rationale comments that cite the wrong evidence: ss-L2's <code>RestingLabel</code> WHY says the rejected “Image mask” order is visible in capture 03 (03 shows the chosen order); ss-L0's <code>BlockFace</code>/<code>BlockShapeUtil</code> WHYs say the casts wait for L3, which had already landed; ss-L3's <code>Group2d</code> WHY credits <code>BaseFrameLikeShapeUtil</code> with a precedent the installed 5.3.2 does not have; cf-A's <code>describeHidden</code> WHY cites a pyblocks line that never emits the sentence.", (8, 10)),
    ("The <code>from: null</code> fixture fix",
     "Planner-committed <code>events_edit_session.json</code> pinned <code>\"from\": null</code> for an absent key while the planner-committed <code>sceneEvents.test.ts:91</code> pinned <code>from: undefined</code> for the identical case. The builder measured both directions (39/40 either way), refused to touch either file three rounds running, and the dispatcher dropped the fixture token in <code>bdc8a25</code>. Z22 carries the design question.", (8, 18)),
    ("Harness fixes the dispatcher made to planner-committed tests",
     "<code>bdc8a25</code>: <code>createShapeId</code> is a standalone tldraw export, never an <code>Editor</code> method (14 sites in six smoke files); <code>ensureStoreIsUsable</code> is <code>@internal</code> in the public types (typed cast, same runtime seed); shape-record helpers return <code>TLShape</code>; the fixture token above. <code>1833d78</code>: L5's re-parenting fixture moved from page (40,40) — under the chrome bar the menus lane mounts, measured x 8–416 / y 8–50 — to (60,160). No implementation changed in either commit; both lanes had returned FAIL rather than edit those files.", (18, 19)),
    ("The pyblocks-opened board was captured before L5 landed",
     "In the backend lane's captures the region is a dashed <code>ss-region — lane L5</code> placeholder, because L5 merged after that lane's captures. On the merged tree it is the real frame-like region; the board was NOT re-captured for this report, and pyblocks' region <code>w/h</code> (520×340) is not carried into the shape (default 480×320).", (10,)),
    ("Not reachable in the app yet: <code>while</code> and the opaque region view",
     "Both exist (<code>cornerBlockPropsFor</code> knows <code>while</code>; cf-E's projection is in the trunk) but nothing in the app reaches them: the floating toolbar offers Simple / Ports / Expanded for a block, the language for a code shape, duplicate and delete. The Loop row places a <code>for</code>.", (10, 24)),
    ("Committing an unchanged backend URL re-creates the client",
     "Enter and blur both call <code>commitUrl</code>; <code>commitSetting</code> always mints a new setting object, so health is re-polled and the consumer detaches and re-attaches for a no-op edit.", (10,)),
    ("Escape closes any open panel",
     "The Frames/Problems panel's Escape-to-close is a window-level keydown listener that does not check who consumed the key, so dismissing the burger or cancelling a title rename also closes the panel.", (10,)),
    ("CodeMirror languages reached through a path hack",
     "<code>apps/systemsketch</code> does not declare <code>@codemirror/lang-{python,javascript,json}</code>; L1 imports them as <code>@trunk/../node_modules/@codemirror/…</code>. Declaring them is a package.json line only the dispatcher may add.", (9,)),
    ("React Flow and tldraw gallery hosts: no bypass, no pills, cables through frames",
     "Each engine's own edge renderer paints those stories (bezier / arrow), so the bypass rule and the <code>mut</code>/<code>z⁻¹</code> badges only show on the DOM canvas; member cables also paint under the parent's opaque card. Z6 is the decision.", (10,)),
]


# ---------------------------------------------------------------- page

def build(inline_gif: bool) -> str:
    USED.clear()
    # --- media
    webm = hero_path("hero-800.webm")
    gif = hero_path("hero-560.gif")
    poster = hero_path("hero-poster.jpg")
    mid = hero_path("hero-mid.jpg")
    final_png = hero_path("hero-final.png")
    hero_log = hero_path("hero-log.json")
    if not (webm and poster and final_png):
        raise SystemExit(f"hero media missing under {HERO_DIR} (and {HERO_FALLBACK})")
    webm_uri = data_uri(webm, "video/webm")
    poster_uri = data_uri(poster, "image/jpeg")
    gif_sibling = OUT.parent / f"{REPORT_NAME}-hero.gif"
    if gif:
        gif_sibling.write_bytes(gif.read_bytes())
    gif_uri = data_uri(gif, "image/gif") if (inline_gif and gif) else None
    steps = json.loads(hero_log.read_text()) if hero_log else []

    L = LANES
    S = lambda stamp: BRAIN / f"Pasted image {stamp}.png"  # noqa: E731

    inflight = ""
    if INFLIGHT_DIR.exists() and list(INFLIGHT_DIR.glob("*.png")):
        pngs = sorted(INFLIGHT_DIR.glob("*.png"))[:4]
        inflight = (
            "<p class='ok'>The lane's capture directory exists at build time — these are its captures, "
            "named as the lane left them. The dispatcher re-ran this builder after it landed; "
            "the lane-table row and the audit verdict for it are whatever the dispatcher's handoff says, not this snapshot.</p>"
            "<div class='grid2'>" + "".join(fig(img(p, 900), f"<code>{esc(p.name)}</code>") for p in pngs) + "</div>"
        )
    else:
        inflight = (
            "<div class='inflight'><strong>In flight at report time.</strong> "
            f"No capture directory at <code>{esc(str(INFLIGHT_DIR))}</code> when this page was built. "
            "The lane adds the <code>origin</code> prop to the app's <code>ss-code</code> shape, renders the "
            "<code>OriginBadge</code> in its header (<em>Pseudo</em> for an unbound cell, <em>Orphaned</em> for a bound cell "
            "with no backend to verify it), a bottom-right <code>Backend: none / pyblocks (stub)</code> switch, and the "
            "pyblocks-gated <code>bbox-source</code> context-menu group (“Convert to code”, “Expand to blocks”). "
            "Re-run this builder once its captures exist and this section fills itself in.</div>"
        )

    # --- plan tables
    def plan_block(key: str, title: str, crit: tuple[str, str], stock: tuple[str, str], cite_n: int) -> str:
        md = PLANS[key]
        return f"""
<div class="plan">
  <h3>{title} {cite(cite_n)}</h3>
  <details><summary>Criteria before options — the weights each plan scored its options against</summary>
    {md_tables(md, *crit)}
  </details>
  <details open><summary>Stock-part mapping — element by element</summary>
    {md_tables(md, *stock)}
  </details>
</div>"""

    plan_tables = "".join([
        plan_block("cf", "Control flow in the trunk", ("## 2 ", "## 3 "), ("## 4 ", "## 5 "), 2),
        plan_block("ss", "SystemSketch rebuilt as bbox-ui + stock tldraw", ("## 1 ", "## 2 "), ("## 4 ", "## 5 "), 3),
        plan_block("pb", "The optional pyblocks backend", ("## 3 ", "### 3.1"), ("## 4 ", "## 5 "), 4),
        plan_block("scv", "Source-code view, retargeted at the new app", ("## 2 ", "## 3 "), ("## 4 ", "## 5 "), 5),
    ])

    # --- lane table
    lane_rows = ""
    for i, (uid, what, build_s, audits, fixes, landed, dev) in enumerate(LANE_ROWS, 1):
        cls = " inflight-row" if uid == "scv:scv-origin-on-app-shape" else ""
        lane_rows += f"""<tr class="{cls}">
<td class="n">{i}</td><td><code>{esc(uid)}</code></td><td>{what}</td><td>{build_s}</td><td>{audits}</td><td class="n">{fixes}</td><td>{landed}</td><td class="dev">{dev}</td>
<td>{verdict("lane", str(i), uid + " — " + short_title(what, 90))}</td></tr>"""

    needs_html = ""
    for num, title, rec, default, cites in NEEDS:
        needs_html += f"""
<div class="need">
  <div class="need-h"><span class="tag">{num}</span> {title} {cite(*cites)}</div>
  <div class="need-b"><span class="lbl">recommendation</span> {rec}</div>
  <div class="need-b"><span class="lbl">default on silence</span> {default}</div>
  {verdict("needs", num, short_title(title, 110))}
</div>"""

    issues_html = "".join(
        f"<tr><td class='n'>{i}</td><td><strong>{t}</strong><div class='dim'>{d} {cite(*c)}</div></td></tr>"
        for i, (t, d, c) in enumerate(ISSUES, 1)
    )

    steps_html = "".join(f"<li><span class='t'>{esc(t)}s</span> {esc(s)}</li>" for t, s in steps)

    gif_block = (
        f"<details><summary>GIF fallback (inline, {gif.stat().st_size // 1024} KB) — if the video does not play</summary><img src='{gif_uri}' alt='' loading='lazy' style='max-width:560px;width:100%'></details>"
        if gif_uri else
        f"<p class='dim'>GIF fallback kept as a sibling file to stay under the preview's size cap: <code>{esc(str(gif_sibling))}</code></p>"
    )

    sources = [
        (1, "docs/ASK-2026-09-18-CONTROL-FLOW-AND-SYSTEMSKETCH-REBUILD.md — Zach's four items, verbatim (commit f80ebbf)"),
        (2, "docs/CONTROL-FLOW-PLAN.md — plan, criteria, stock-part table, §9 needs-Zach (062c2b5)"),
        (3, "docs/SYSTEMSKETCH-REBUILD-PLAN.md — plan, §1 criteria, §4 stock parts, §8 needs-Zach (7c5aa27, c341f7f)"),
        (4, "docs/PYBLOCKS-BACKEND-PLAN.md — plan, §3 criteria, §4 stock parts, §8 needs-Zach (d63ac62)"),
        (5, "docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md — plan, §2 criteria, §4 stock parts, §10 needs-Zach (b0dd1cc)"),
        (6, "docs/SYSTEMSKETCH-ARCHIVE.md — what moved where; the ARCHIVED banner (910f697)"),
        (7, "docs/lanes/*.md — the 21 lane briefs as the builders read them (00c6221)"),
        (8, "scratchpad/build-journal.json — wave 1: build / audit / fix / integrate entries per lane (cf-A,B,C,D,G; ss-L0,L6; pb-scene-projection, pb-trunk-loader-events; scv-rung-a, scv-definitions-partition, scv-origin-and-actions)"),
        (9, "scratchpad/build2-journal.json — wave 2: cf-E, cf-F, ss-L1, ss-L2"),
        (10, "scratchpad/build3-journal.json — wave 3: ss-L2 re-audit, ss-L3, ss-L4, ss-L5, pb-app-backend-wiring, cf-F audit"),
        (11, "scratchpad/plans.json — the four planners' structured output (needs_zach, not_verified, follow_ups)"),
        (12, "scratchpad/lanes.json — the 21 lanes: ids, deps, write sets, acceptance files"),
        (13, "git log c166fc0..8317b59 on claude/control-flow-integration-2026-09-18 in /home/bam/bbox-ui/.claude/worktrees/cf-integration-2026-09-18 — 18 lane merges, 4 plan merges, 175 files, +33,600 / −131"),
        (14, "scratchpad/gate-final-trunk.log — apps/storybook-basics `pnpm test` on the merged tree, 2026-09-19 10:28: 178 files, 1693 tests, all passed, 17.7 s"),
        (15, "reports/media/lanes-2026-09-18/<lane>/*.png — the lanes' own captures (about 120 PNGs); the ones embedded here are listed by the builder at the end of its run"),
        (16, "/home/bam/zach_brain/Pasted image 20260918150916.png (OLD/BAD vs NEW/GOOD), 20260918192040.png (React Flow Labeled Group Node), 20260918145132.png (for loop), 20260918143241.png (branch, one input, in the old app)"),
        (17, "Hero recording — this report's own run: Playwright recordVideo at 1280×800 against `pnpm --filter systemsketch exec vite --port 4432` from the integration worktree at 8317b59, 2026-09-19 10:33; raw capture kept at reports/media/" + REPORT_NAME + "/hero/hero-raw-1280x800.webm; step log hero-log.json"),
        (18, "commit bdc8a25 — “Fix the planner-committed acceptance harness, as two independent audits proved” (9 files, 28+/26−, no implementation)"),
        (19, "commit 1833d78 — “region smoke: place the dragged block clear of the chrome bar” (1 file, 1+/1−)"),
        (20, "pyblocks branches claude/lane-pb-pyblocks-scene-projection-2026-09-18 (d2822d9) and claude/lane-scv-scv-definitions-partition-2026-09-18 (60b633b), worktrees under /home/bam/pyblocks/.claude/worktrees/; pyblocks main untouched at 6a64e0c"),
        (21, "SystemSketch main 517a4fb9 (“Archive this app: a two-line banner pointing at the rebuild in bbox-ui”); bbox-ui main c166fc0 (trunk lane + menu kit, 1453 tests green — dispatcher's measurement)"),
        (22, "Dispatcher's gate measurements on the merged tree, relayed in the scribe brief: trunk typecheck 0 errors, trunk unit 76 files / 1211 tests; app typecheck 0 errors, app unit 4 files / 64 tests, app smoke 6 files / 28 tests in real Chromium"),
        (23, "docs/peps/0004-code-cell-origin-binding.md — the decision record scv lane C landed"),
        (24, "apps/systemsketch/src/chrome/selectionActions.ts (BLOCK_VIEWS, CODE_LANGUAGES) and chrome/floatingToolbar.tsx — what the floating toolbar offers today"),
    ]
    sources_html = "".join(f"<li id='src-{n}'><span class='n'>{n}</span> {esc(t)}</li>" for n, t in sources)

    # ---- assemble
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Control flow + SystemSketch rebuild — 2026-09-18</title>
<style>
:root {{ --bg:#0e0f12; --panel:#15171c; --panel2:#1b1e25; --line:#282d38; --line2:#343b49;
  --fg:#e6e8ee; --dim:#9aa3b2; --dim2:#6b7383; --accent:#f0883e; --accent2:#5aa9f8; --ok:#3fb950; --warn:#e5534b; --gold:#e8c06a;
  --mono: ui-monospace,"SF Mono",Menlo,Consolas,monospace; }}
* {{ box-sizing:border-box }}
body {{ margin:0; background:var(--bg); color:var(--fg); font:15px/1.55 -apple-system,"Segoe UI",Inter,Roboto,sans-serif; }}
main {{ max-width:1200px; margin:0 auto; padding:28px 24px 140px; }}
h1 {{ font-size:30px; line-height:1.15; margin:0 0 6px; letter-spacing:-.01em }}
h2 {{ font-size:22px; margin:54px 0 12px; padding-top:18px; border-top:1px solid var(--line); letter-spacing:-.01em }}
h2 .k {{ color:var(--dim2); font-weight:500; margin-right:10px; font-family:var(--mono); font-size:15px }}
h3 {{ font-size:17px; margin:26px 0 8px }}
p {{ margin:8px 0 }}
code {{ font:13px/1.4 var(--mono); background:#0a0b0e; border:1px solid var(--line); border-radius:4px; padding:1px 5px; color:#dfe3ea }}
a {{ color:var(--accent2) }}
.prov {{ color:var(--dim2); font-size:13px; margin:0 0 22px }}
.dim {{ color:var(--dim) }}
.cite {{ font-size:10px; vertical-align:super; margin-left:2px }} .cite a {{ color:var(--dim2); text-decoration:none }}
.lead {{ font-size:17px; color:#d6dae3 }}
table.md, table.lanes, table.issues, table.gates {{ border-collapse:collapse; width:100%; font-size:13.5px; margin:10px 0 18px }}
table.md caption {{ text-align:left; color:var(--dim); font-size:13px; padding:6px 0 }}
th, td {{ border:1px solid var(--line); padding:7px 9px; vertical-align:top; text-align:left }}
th {{ background:var(--panel2); color:#cfd5e0; font-weight:600 }}
td.n, th.n {{ text-align:right; color:var(--dim) }} td.n {{ white-space:nowrap }}
td.dev {{ color:var(--dim); font-size:12.5px }}
tr.inflight-row td {{ background:#1c1a12 }}
figure {{ margin:0; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:8px }}
figure img {{ width:100%; display:block; border-radius:6px; background:#f7f7f8 }}
figcaption {{ color:var(--dim); font-size:13px; padding:8px 4px 2px }}
.grid2 {{ display:grid; grid-template-columns:1fr 1fr; gap:14px; margin:12px 0 }}
.grid3 {{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; margin:12px 0 }}
.sketch img {{ background:#111 }}
@media (max-width:900px) {{ .grid2, .grid3 {{ grid-template-columns:1fr }} }}
.items {{ display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:16px 0 }}
@media (max-width:1000px) {{ .items {{ grid-template-columns:1fr 1fr }} }}
.item {{ background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 14px }}
.item .st {{ display:inline-block; font:600 11px/1 var(--mono); letter-spacing:.06em; padding:4px 7px; border-radius:4px; margin-bottom:8px }}
.st.done {{ background:#12301c; color:#5ee08a }} .st.part {{ background:#3a2f0f; color:var(--gold) }} .st.branch {{ background:#1a2a44; color:#8cc2ff }}
.item h3 {{ margin:0 0 6px; font-size:15px }}
.hero {{ background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:12px }}
.hero video {{ width:100%; max-width:960px; display:block; margin:0 auto; border-radius:8px; background:#000 }}
.hero ol {{ columns:2; color:var(--dim); font-size:13px; margin:10px 0 0; padding-left:22px }}
.hero ol .t {{ font-family:var(--mono); color:var(--dim2); margin-right:6px }}
.plan {{ margin:18px 0 26px }}
details {{ background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:8px 12px; margin:8px 0 }}
summary {{ cursor:pointer; color:#cfd5e0; font-weight:600; font-size:14px }}
.gates {{ display:grid; grid-template-columns:repeat(6,1fr); gap:10px; margin:12px 0 }}
@media (max-width:1000px) {{ .gates {{ grid-template-columns:repeat(3,1fr) }} }}
.gate {{ background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:10px 12px }}
.gate .big {{ font:600 24px/1.1 var(--mono); color:#5ee08a }} .gate .lbl {{ color:var(--dim); font-size:12px; margin-top:4px }}
.need {{ background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 14px; margin:10px 0 }}
.need-h {{ font-size:15px; margin-bottom:8px }}
.need .tag {{ font:600 12px/1 var(--mono); background:#2a2416; color:var(--gold); padding:4px 7px; border-radius:4px; margin-right:6px }}
.need-b {{ color:#cfd5e0; font-size:14px; margin:4px 0 }} .need-b .lbl {{ color:var(--dim2); font:600 11px var(--mono); letter-spacing:.06em; text-transform:uppercase; margin-right:8px }}
.inflight {{ background:#1c1a12; border:1px dashed var(--gold); border-radius:10px; padding:12px 14px; color:#e9dfc0 }}
.ok {{ color:#5ee08a }}
.v {{ display:flex; gap:6px; align-items:flex-start; flex-wrap:wrap; margin-top:8px }}
.v button {{ background:#0a0b0e; color:#cfd5e0; border:1px solid var(--line2); border-radius:6px; padding:4px 10px; font-size:12.5px; cursor:pointer }}
.v button[aria-pressed="true"][data-v="approve"] {{ background:#12301c; border-color:#2f7a45; color:#5ee08a }}
.v button[aria-pressed="true"][data-v="change"] {{ background:#3a2f0f; border-color:#8a6d1c; color:var(--gold) }}
.v button[aria-pressed="true"][data-v="reject"] {{ background:#3a1616; border-color:#8a2c2c; color:#ff8a80 }}
.v textarea {{ flex:1 1 220px; min-width:180px; background:#08090b; color:var(--fg); border:1px solid var(--line); border-radius:6px; padding:4px 8px; font:12.5px/1.4 var(--mono); resize:vertical }}
table.lanes td .v {{ flex-direction:column; align-items:stretch }} table.lanes td .v textarea {{ flex:0 0 auto; min-width:0; height:54px }}
table.lanes {{ table-layout:fixed }} table.lanes th:nth-child(1) {{ width:34px }} table.lanes th:nth-child(2) {{ width:120px }} table.lanes th:nth-child(4) {{ width:120px }} table.lanes th:nth-child(6) {{ width:66px }} table.lanes th:nth-child(9) {{ width:118px }}
table.lanes td {{ overflow-wrap:anywhere }}
.open table {{ table-layout:fixed; width:100% }} .open td:first-child {{ width:26% }} .open td {{ overflow-wrap:anywhere }} .open pre.cmd {{ max-width:100%; margin:6px 0 }}
ul.src {{ list-style:none; padding:0; font-size:13px; color:var(--dim) }} ul.src li {{ padding:3px 0; border-bottom:1px dashed var(--line) }} ul.src .n {{ display:inline-block; min-width:26px; color:var(--accent2); font-family:var(--mono) }}
.dock {{ position:fixed; left:0; right:0; bottom:0; background:#0a0b0ee6; backdrop-filter:blur(8px); border-top:1px solid var(--line2); padding:10px 24px; display:flex; gap:12px; align-items:center; z-index:9 }}
.dock .tally {{ color:var(--dim); font-size:13px; flex:1 }}
.dock button {{ background:#0a0b0e; color:#cfd5e0; border:1px solid var(--line2); border-radius:6px; padding:7px 14px; cursor:pointer }}
.dock button.go {{ background:var(--accent); color:#111; border-color:var(--accent); font-weight:600 }}
.sheet {{ display:none; position:fixed; inset:0; background:#000a; z-index:10; align-items:center; justify-content:center }}
.sheet.open {{ display:flex }}
.sheet .inner {{ background:var(--panel); border:1px solid var(--line2); border-radius:12px; width:min(900px,92vw); max-height:88vh; display:flex; flex-direction:column; padding:14px }}
.sheet header, .sheet footer {{ display:flex; gap:10px; align-items:center }} .sheet .sp {{ flex:1 }}
.sheet textarea {{ flex:1; min-height:46vh; margin:10px 0; background:#08090b; color:var(--fg); border:1px solid var(--line); border-radius:8px; padding:10px; font:13px/1.5 var(--mono) }}
.sheet button {{ background:#0a0b0e; color:#cfd5e0; border:1px solid var(--line2); border-radius:6px; padding:7px 14px; cursor:pointer }} .sheet button.go {{ background:var(--accent); color:#111; border-color:var(--accent); font-weight:600 }}
.overall textarea {{ width:100%; min-height:80px; background:#08090b; color:var(--fg); border:1px solid var(--line2); border-radius:8px; padding:10px 12px; font:13px/1.55 var(--mono) }}
.open table td:first-child {{ white-space:nowrap }}
pre.cmd {{ background:#08090b; border:1px solid var(--line); border-radius:8px; padding:10px 12px; font:13px/1.5 var(--mono); overflow:auto; white-space:pre }}
</style></head>
<body><main>

<h1>Control flow, and SystemSketch rebuilt as bbox-ui + stock tldraw</h1>
<p class="prov">Built by Claude Fable 5.1 (scribe) for the dispatcher session, 2026-09-19, from the sources in the index at the bottom. Every bare number after a claim is one of them. Captures are the lanes' own; the hero video is this report's own recording of the merged app. Nothing here is drawn from memory.</p>

<p class="lead">Twenty-one lanes ran overnight against the ask you wrote on the 18th {cite(1)}. Eighteen are merged on <code>claude/control-flow-integration-2026-09-18</code> at <code>8317b59</code> with every gate green {cite(13, 14, 22)}; two stayed on pyblocks branches by rule {cite(20)}; one is still building. The old SystemSketch is archived at <code>517a4fb9</code> {cite(21)}. Nothing touched <code>main</code>.</p>

<div class="items">
  <div class="item"><span class="st done">DONE · IN THE TRUNK</span><h3>1 · For / while / branch presets and the Region</h3>
    <p class="dim">A region is one scene node whose ports ARE its corner block's ports; arms are nodes; the opaque view is a projection; wires bypass what they do not flow through. Seven lanes, seven first-round PASS audits, a <code>region</code> registry item, and the whole language on one gallery board {cite(2, 8, 9, 10)}.</p></div>
  <div class="item"><span class="st done">DONE · PHASE 1</span><h3>2 · SystemSketch from scratch</h3>
    <p class="dim"><code>apps/systemsketch</code>: stock tldraw 5.3.2, the trunk through one <code>@trunk</code> alias, ONE system slot (Block · Code · Port · Loop · Branch), wires, editor menus, regions, <code>.tldr</code> persistence. The old app archived with a two-line banner {cite(3, 6, 13)}.</p></div>
  <div class="item"><span class="st done">DONE · OFF BY DEFAULT</span><h3>3 · The pyblocks backend</h3>
    <p class="dim"><code>Backend: none | pyblocks @ url</code> with health, Open Python file…, a board titled after the file, and an edit-event bridge that echoes semantic events to pyblocks. The pyblocks half (<code>block_view_to_scene</code>, routes) sits on a branch, unmerged by rule {cite(4, 10, 20)}.</p></div>
  <div class="item"><span class="st part">PARTIAL · APP LANE IN FLIGHT</span><h3>4 · Source-code view</h3>
    <p class="dim">Rung A in the trunk (collapse to a code cell, expand back, definitions → scene, the four-state origin badge, pyblocks-gated actions) is merged with PASS audits; the definitions partition is on a pyblocks branch; wiring the badge and menu into the new app's code shape is the one lane still running {cite(5, 8, 20)}.</p></div>
</div>

<h2><span class="k">01</span>The merged app, driven</h2>
<div class="hero">
  <video src="{webm_uri}" poster="{poster_uri}" controls muted loop autoplay playsinline></video>
  <p class="dim" style="margin:10px 0 0">16.9 s, muted, loops. Recorded headless against the real app served from the integration worktree at <code>8317b59</code> — not a mock, not a story {cite(17)}. What happens, in order:</p>
  <ol>{steps_html}</ol>
  {gif_block}
</div>
<div class="grid2" style="margin-top:14px">
  {fig(img(mid, 900, trim=False), "Mid-flow frame: the dropped block is selected inside the For Loop and the floating toolbar offers Simple / Ports / Expanded, duplicate, delete. The block re-parented into the region on drop — stock frame containment, measured (<code>parentId</code> became the loop) " + cite(17))}
  {fig(img(final_png, 900, trim=False), "Final frame: a For Loop whose header is a real block (<code>Iterable</code> in, <code>Iter</code> out) with the block now in Expanded view, and a Branch whose <code>else</code> arm is folded so the frame hugs. Top-right: <code>Backend: none</code> — the whiteboard with no backend " + cite(17))}
</div>

<h2><span class="k">02</span>The visual language, proved</h2>
<p>Your closing sentence in the ask was the grading rule: <em>everything is really a block</em>, and <em>data and control flow are very different</em>. The region carries a real block in its top-left corner, and control flow is containment — it never becomes a line {cite(1, 2)}.</p>
<div class="grid2">
  {fig(img(S("20260918150916"), 900, trim=False), "Your sketch: OLD/BAD (ports on the region header) vs NEW/GOOD (a real <code>For Loop</code> block with <code>Iterable → iter</code> in the top-left corner of an otherwise empty frame) " + cite(16), "sketch")}
  {fig(img(L / "cf-A" / "with-members.png", 900), "Built (lane cf-A, DOM canvas): the <code>Region</code> component with its corner <code>Block</code> in port view and two members inside. Note <code>merge</code>'s <code>other</code>/<code>Pose</code> labels touching — the port-label collision listed under known issues " + cite(8))}
  {fig(img(S("20260918192040"), 700, trim=False), "The reference you named: React Flow UI's Labeled Group Node — “the label looks integral to the group” " + cite(16), "sketch")}
  {fig(img(L / "cf-B" / "for-loop-carried.png", 1000), "Built (cf-B, <code>ForLoopCarried</code>): <code>run().others → Iterable</code>, <code>Iter</code> feeds <code>merge()</code>, and the carried value goes back along the bottom lane as a dotted cable wearing <code>z⁻¹ = estimate()</code> — the delayed dataflow drawn directly, exactly as your white sketch asked " + cite(8))}
</div>
<div class="grid2">
  {fig(img(S("20260918143241"), 700, trim=False), "Your branch sketch in the old app: one <code>fast</code> input on the header, <code>if</code>/<code>else</code> arms, a separate blue <em>Control</em> cable " + cite(16), "sketch")}
  {fig(img(L / "cf-C" / "folded-arm-at-rest.png", 1000), "Built (cf-C, <code>FoldedArm</code> at rest): the corner block carries <code>mode</code>; <code>if mode == \"fast\":</code> is open, <code>elif</code> is folded to its header and the <code>else</code> row pulled up; both arms fan in at <code>encode().pose</code> — no output port on the branch, no control cable " + cite(8))}
  {fig(img(L / "cf-C" / "many-inputs.png", 900), "cf-C <code>ManyInputs</code>: three condition ports on the corner block, three titled arm rows stacked in order " + cite(8))}
  {fig(img(L / "cf-C" / "nested.png", 900), "cf-C <code>Nested</code>: a Branch inside an <code>if</code> arm of another Branch — arms are nodes, so a child's position is arm-relative and folding one arm never moves a sibling's blocks " + cite(2, 8))}
</div>
<div class="grid2">
  {fig(img(L / "cf-E" / "dom-expanded.png", 1000, crop=(0, 0, 1, 0.66)), "cf-E, expanded: the For Loop with <code>merge</code> and <code>smooth</code> inside and direct crossing cables " + cite(9))}
  {fig(img(L / "cf-E" / "dom-opaque.png", 1000, crop=(0, 0, 1, 0.66)), "cf-E, the same document one field later (<code>view: \"opaque\"</code>): a 220px card with promoted ports (<code>pose</code>, <code>out</code>) and the footer “2 blocks · 2 edges hidden”. Positions are untouched — it is a projection, not an edit (P5, honest port view first) " + cite(9))}
  {fig(img(L / "cf-D" / "bypass-around-a-block.png", 900), "cf-D: <code>src.out → enc.in</code> routed around <code>bystander</code>, which it does not flow through — the keep-out rule you asked for on branches, measured along the real path " + cite(8))}
  {fig(img(L / "cf-D" / "mut-effect-cable.png", 900), "cf-D: a mutating function shows a side effect, not an output — the top-wall <code>effect:pose</code> port and an orange <code>mut</code> cable into <code>world.pose</code>. Tonight the mut cable is a fixture; the derivation from a <code>mutates</code> flag is a listed follow-up " + cite(2, 8))}
</div>
{fig(img(L / "cf-F" / "gallery-branch-in-loop-dom.png", 1100, quality=72), "cf-F, the gallery: the whole language on one board — For Loop with the carried <code>z⁻¹ = prior()</code> value, a Branch nested inside it with <code>if fast</code> / <code>else:</code> arms fanning into <code>report</code> and <code>encode()</code>, the <code>mut</code> effect into <code>world</code>, and <code>cfg.out</code> bypassing both frames along the bottom. Visible defect: <code>effect:pose</code> drawn across <code>merge()</code> (known issue 1) " + cite(9, 10))}

<h2><span class="k">03</span>The new SystemSketch, proved</h2>
<p>Plain tldraw first, then bbox added through supported seams only — <code>shapeUtils</code>, <code>tools</code>, <code>bindingUtils</code>, <code>components</code> — with a committed stock-boundary test that refuses any other <code>@tldraw/*</code> import. The tldraw store IS the document: every bbox thing is a shape whose validated props are the persisted state, so <code>persistenceKey</code> and Open/Save <code>.tldr</code> work with no backend {cite(3, 8)}.</p>
<div class="grid2">
  {fig(img(L / "ss-L1" / "02-system-popout-lists-code.png", 700, crop=(0.4, 0.8, 0.66, 1.0), trim=False), "L0 + L1: ONE system slot in the dock — Block (<kbd>B</kbd>) and Code as rows of the same family. By the end of the night the popout lists Block · Code · Port · Loop · Branch (see the hero) " + cite(9))}
  {fig(img(L / "ss-L0" / "f02-rail-labels-no-longer-overlap.png", 700, crop=(0, 0.06, 0.3, 0.3), trim=False), "L0: an <code>ss-block</code> in port view — the trunk's <code>Block</code> face with measured anchors written back into props; rail labels are the port's name after the fix round (the type was dropped — Z12) " + cite(8))}
  {fig(img(L / "ss-L1" / "04-typed-python.png", 900, crop=(0.15, 0.25, 0.55, 0.5), trim=False), "L1: <code>ss-code</code> is a block whose face is a live CodeMirror document (the trunk's <code>CodeEditor</code>); focus is the editing session, keystrokes write props, the 10px ring drags it " + cite(9))}
  {fig(img(L / "ss-L2" / "fix-02-selection-wraps-label.png", 900, crop=(0.2, 0.28, 0.8, 0.7), trim=False), "L2: floating <code>ss-port</code>s — an input's dot sits left of its label, an output's right; the face hugs its label after the fix round so the hit box is the token you see (<code>throttle_setpoint_value float</code> selected) " + cite(9, 10))}
  {fig(img(L / "ss-L3" / "03-wire-landed.png", 1000, crop=(0.1, 0.15, 0.7, 0.75), trim=False), "L3: a wire is data — <code>ss-wire</code> with two real <code>ss-wire-binding</code>s, painted by the trunk's <code>Trace</code> between measured anchors; press-drag from <code>estimate().pose</code> lands on <code>encode().pose</code> " + cite(10))}
  {fig(img(L / "ss-L3" / "06-edge-drop-menu.png", 1000, crop=(0.1, 0.15, 0.8, 0.9), trim=False), "L3: duplicates fan, and a drop on empty canvas opens the trunk's edge-drop menu (“Insert a node · Block · 1 in · 1 out”) " + cite(10))}
  {fig(img(L / "ss-L4" / "05-problems-panel.png", 1000), "L4: every editor menu is the trunk's, mounted through tldraw's component seams — chrome bar with undo/redo and the file burger, the floating selection toolbar (Simple / Ports / Expanded), the Problems panel derived from the projected scene " + cite(10))}
  {fig(img(L / "ss-L4" / "06-file-burger.png", 700, crop=(0, 0, 0.35, 0.2), trim=False), "L4: the burger — New board · Open .tldr… · Save .tldr… (stock <code>parseTldrawJsonFile</code> + <code>loadSnapshot</code>, then zoom-to-fit so the board lands where you can see it) " + cite(10))}
  {fig(img(L / "ss-L5" / "A-branch-placed.png", 900, crop=(0.2, 0, 0.7, 0.66), trim=False), "L5: a Branch placed by click — an <code>ss-region</code> that is frame-like (<code>BaseFrameLikeShapeUtil</code>) with a REAL corner <code>ss-block</code> child carrying <code>input 1</code>, and titled <code>if</code> / <code>else</code> arm rows " + cite(10))}
  {fig(img(L / "ss-L5" / "B-else-folded-hugs.png", 900, crop=(0.2, 0, 0.7, 0.66), trim=False), "L5 after the second fix round: fold <code>else</code> and the region hugs its rows — a region's height IS its rows, the arm reconcile ported whole from the archive's <code>reconcileBranchProps</code> " + cite(10))}
</div>

<h3>The pyblocks backend — off by default, then on</h3>
<div class="grid2">
  {fig(img(L / "pb-app-backend-wiring" / "02-backend-down.png", 900, crop=(0.55, 0, 1, 0.25), trim=False), "Backend set to pyblocks on a dead port: the URL, the reason (<code>Failed to fetch</code>), a red dot on the chip. Health gates every pyblocks surface " + cite(10))}
  {fig(img(L / "pb-app-backend-wiring" / "03-menu-item.png", 900, crop=(0.55, 0, 1, 0.2), trim=False), "Health says <code>scene</code>: a <em>Python</em> dropdown appears with <code>Open Python file…</code> (a separate top-right menu, not the burger — Z18) " + cite(10))}
  {fig(img(L / "pb-app-backend-wiring" / "05-board.png", 1000), "<code>linear_chain.py</code> opened: the board takes the file's name; <code>run()</code> is the root region's corner block; <code>decode</code>, <code>scale</code> and the <code>2.0</code> literal are laid out by the trunk's <code>rank()</code>. The dashed <code>ss-region — lane L5</code> is the placeholder this lane's base still had — on the merged tree it is the real region (known issue 8) " + cite(10))}
  {fig(img(L / "pb-app-backend-wiring" / "07-rename-echo.png", 1000), "Renaming <code>decode()</code> to <code>parse()</code> through the document seam: the bridge diffs the projected scene and POSTs <code>1 batch · 1 semantic · 0 applied</code> — pyblocks receives the echo; nothing acts on it tonight " + cite(10))}
</div>
{fig(img(L / "pb-trunk-loader-events" / "region-for-if-dom-canvas.png", 1100, quality=72), "Trunk loader (pb-trunk-loader-events): the frozen <code>region_for_if</code> pyblocks scene — <code>sort_frame()</code> as the root region, a <code>for detection in detections:</code> region and an <code>if label == \"unknown\":</code> region inside it — parsed, laid out and rendered on the DOM canvas; “2 control edges kept aside, 0 drawn”, because control never becomes a cable " + cite(8))}

<h2><span class="k">04</span>Source-code view — Rung A in the trunk</h2>
<div class="grid2">
  {fig(img(L / "scv-scv-rung-a-scene" / "01-round-trip-blocks.png", 900), "Before: <code>Source → A → B → Sink</code>, <code>B → C</code>, plus an untouched <code>Other → Other2</code> pair " + cite(8))}
  {fig(img(L / "scv-scv-rung-a-scene" / "02-round-trip-collapsed.png", 900), "<code>collapseToCode([A,B,C])</code>: one code cell with promoted ports <code>a/in</code> and <code>b/out</code>, its face a generated header (“3 blocks: A, B, C — annotation only until a backend is connected”). <code>expandCode</code> restores the blocks; the round trip is asserted. Visible: the port labels overprint the editor's first line (audit minor) " + cite(8))}
  {fig(img(L / "scv-scv-rung-a-scene" / "06-origin-badge-states.png", 1100, crop=(0, 0, 1, 0.62)), "The four origin states, computed by <code>codeOriginState</code> and never stored on the cell: Pseudo · Synced · Drifted · Orphaned " + cite(8, 23))}
  {fig(img(L / "scv-scv-origin-and-actions" / "02-backend-on-convert-to-code.png", 900), "Right-click on a two-block selection with the bottom-right switch on <code>pyblocks</code>: the <code>Convert to code</code> row appears under the stock rows; on <code>none</code> the group is absent (Z19) " + cite(8))}
</div>
<h3>The app lane — <code>scv:scv-origin-on-app-shape</code></h3>
{inflight}

<h2><span class="k">05</span>The stock parts, element by element</h2>
<p class="dim">Carried verbatim from the four plans, beside the captures above rather than instead of them. The criteria tables are the weights each planner scored its options against; the mapping tables say what each element was, what off-the-shelf part it became (by its exact exported name), and which behaviour had to survive.</p>
{plan_tables}

<h2><span class="k">06</span>Gates and evidence</h2>
<div class="gates">
  <div class="gate"><div class="big">0</div><div class="lbl">trunk typecheck errors {cite(22)}</div></div>
  <div class="gate"><div class="big">1211</div><div class="lbl">trunk unit tests, 76 files {cite(22)}</div></div>
  <div class="gate"><div class="big">1693</div><div class="lbl">trunk full browser gate, 178 files, 17.7 s {cite(14)}</div></div>
  <div class="gate"><div class="big">0</div><div class="lbl">app typecheck errors {cite(22)}</div></div>
  <div class="gate"><div class="big">64</div><div class="lbl">app unit tests, 4 files {cite(22)}</div></div>
  <div class="gate"><div class="big">28</div><div class="lbl">app smoke tests, 6 files, real Chromium {cite(22)}</div></div>
</div>
<p class="dim">All measured on the merged tree at <code>8317b59</code>. The diff over <code>c166fc0</code> is 175 files, +33,600 / −131, in 18 lane merges and 4 plan merges {cite(13)}. The trunk's full gate log ends <code>Test Files 178 passed (178) · Tests 1693 passed (1693)</code> {cite(14)}.</p>

<h3>The 21 lanes</h3>
<p class="dim">Every row has its own verdict buttons. “Fix rounds” counts builder rounds after an audit; the audit column is the verdict sequence. Commits are lane tips or merge commits on the integration branch {cite(8, 9, 10, 13)}.</p>
<table class="lanes">
<thead><tr><th class="n">#</th><th>Lane</th><th>What</th><th>Build</th><th>Audits</th><th class="n">Fix rounds</th><th>Landed as</th><th>Notable deviation</th><th>Your call</th></tr></thead>
<tbody>{lane_rows}</tbody>
</table>

<h2><span class="k">07</span>Known issues and the auditors' minors worth your eye</h2>
<table class="issues"><tbody>{issues_html}</tbody></table>

<h2><span class="k">08</span>The decision surface</h2>
<h3>Done and proved</h3>
<ul>
  <li>The control-flow kit in the trunk: Region (scene queries, layout twin, component, host renderer), Loop and Branch presets as data over it, the opaque projection and toggle in all three hosts, bypass wires and pills on the DOM canvas, member edges in both canvas hosts, a <code>region</code> registry item installed and type-checked in a throwaway project, and the gallery. 7 lanes, 7 first-round PASS audits, 0 fix rounds, all merged {cite(8, 9, 10)}.</li>
  <li><code>apps/systemsketch</code>, phase 1: scaffold, Block, Code, Port, wires + derived scene + edit-event stream, editor menus, regions, archive note — 7 lanes merged; the app's typecheck, unit and smoke gates green on the merged tree; the hero video drives it {cite(13, 17, 22)}.</li>
  <li>The optional pyblocks backend, off by default, health-gated, with the projection on the pyblocks side and the loader/event seam in the trunk; the edit echo measured end-to-end (<code>1 batch · 1 semantic</code>) {cite(10)}.</li>
  <li>Rung A of the source-code view in the trunk, the four-state origin judge, the gated actions, the decision record, and the definitions partition on the pyblocks side {cite(8, 23)}.</li>
</ul>
<h3>Left</h3>
<ul>
  <li><strong>In flight:</strong> <code>scv:scv-origin-on-app-shape</code> — the badge, the switch and the source menu on the app's code shape (its section above fills itself in on re-run).</li>
  <li><strong>Next, not blocked:</strong> <code>while</code> and the opaque region view in the app's floating toolbar; bypass routing + pills in the React Flow and tldraw hosts; region auto-fit over tldraw children; the port type back on the rail via <code>LabeledPort</code>'s secondary slot; declare the CodeMirror language packages; stop trimming names; the two chrome minors (Escape, panel overlap) {cite(2, 3, 10)}.</li>
  <li><strong>Blocked on a design you have not seen:</strong> the write path (semantic events → <code>pyblocks.commands.apply_command</code>); server-side <code>.py</code> access with drift detection; Rung B (expand a bound cell through the backend); the mutation derivation from a <code>mutates</code> flag; break/continue/for-else marks; an archive-board importer {cite(2, 4, 5)}.</li>
  <li><strong>Integration:</strong> the branch is not on <code>main</code>; the pyblocks lanes are not on pyblocks <code>main</code>. Both are your call, in those words.</li>
</ul>
<h3>Needs you — each with the recommendation and the reversible default a silent build already took</h3>
{needs_html}
<h3>Deliberately not done</h3>
<ul>
  <li>Nothing merged to <code>main</code> in bbox-ui or pyblocks, nothing pushed — implementing is not integrating.</li>
  <li>The pyblocks-opened board was not re-captured on the merged tree; the lane's own captures are shown with the placeholder they had (known issue 8). The hero video is the only capture made on the merged tree.</li>
  <li>No React Flow / tldraw bypass routing, no case-view selector chip, no cable fade for inactive arms, no per-node corner width, no clipping policy — each is a listed follow-up with the planner's default stated {cite(2)}.</li>
  <li>No value capsule or glyph shape in the app (not on your phase-1 list; glyph needs the private <code>@bbox-ui/glyph-content</code>) {cite(3, 6)}.</li>
  <li>README's stale registry list and CLAUDE.md's stale unit-test counts were flagged, not corrected — outside every lane's write set {cite(2, 9)}.</li>
</ul>

<h2><span class="k">09</span>Open it</h2>
<div class="open">
<table><tbody>
<tr><td>This report</td><td><code>file://{esc(str(OUT))}</code></td></tr>
<tr><td>The app (integration worktree, :4340)</td><td><pre class="cmd">pnpm --dir /home/bam/bbox-ui/.claude/worktrees/cf-integration-2026-09-18 --filter systemsketch dev</pre>then <code>http://127.0.0.1:4340</code> — the dispatcher's handoff owns the final table and should re-point this once the branch lands somewhere durable.</td></tr>
<tr><td>The gallery in Storybook (your :5421, once fast-forwarded to the integration branch)</td><td><code>http://127.0.0.1:5421/?path=/story/control-flow-gallery--branch-in-loop</code> · also <code>control-flow-loop--for-loop-carried</code>, <code>control-flow-branch--folded-arm</code>, <code>control-flow-toggle--dom-canvas</code>, <code>source-code-view--round-trip</code></td></tr>
<tr><td>The archive (old SystemSketch, unchanged but for the banner)</td><td><code>cd ~/systemsketch &amp;&amp; npm run dev</code> → :4322 {cite(6)}</td></tr>
<tr><td>The pyblocks side</td><td>worktrees under <code>/home/bam/pyblocks/.claude/worktrees/</code>: <code>python3 -m pyblocks to-systemsketch &lt;file.py&gt;</code> on the scene-projection branch; <code>analyze --view-kind definitions</code> on the partition branch {cite(20)}</td></tr>
</tbody></table>
</div>

<div class="overall">
<h3>Anything else</h3>
<p class="dim">Goes at the top of the copied markdown.</p>
<textarea id="fb-overall" spellcheck="false" placeholder="your call…"></textarea>
</div>

<h2><span class="k">10</span>Source index</h2>
<ul class="src">{sources_html}</ul>
<p class="dim">scratchpad = <code>/tmp/claude-1000/-home-bam-bbox-ui/f89f7a52-bbac-4b47-91c0-0ee0c4fe98dd/scratchpad/</code> (session-scoped; the journals were the dispatcher's live ledger while the lanes ran). docs/ paths are relative to the integration worktree <code>/home/bam/bbox-ui/.claude/worktrees/cf-integration-2026-09-18</code>.</p>

</main>

<div class="dock"><span class="tally" id="tally">nothing marked yet</span><button id="clear">Clear</button><button class="go" id="copy">Copy feedback</button></div>
<div class="sheet" id="sheet"><div class="inner">
  <header><h3 style="margin:0">Your feedback, as markdown</h3><span class="sp"></span><button id="close">Close</button></header>
  <textarea id="out" spellcheck="false"></textarea>
  <footer><span id="status" class="dim">Selected — press Ctrl-C / ⌘C, or use the button.</span><span class="sp"></span><button class="go" id="copy2">Copy to clipboard</button></footer>
</div></div>

<script>
(function () {{
  var KEY = "fb:{REPORT_NAME}";
  var state = {{}};
  try {{ state = JSON.parse(localStorage.getItem(KEY) || "{{}}") || {{}}; }} catch (e) {{ state = {{}}; }}
  function save() {{ try {{ localStorage.setItem(KEY, JSON.stringify(state)); }} catch (e) {{}} }}
  var items = Array.prototype.slice.call(document.querySelectorAll(".v"));
  function paint(el) {{
    var k = el.dataset.key, s = state[k] || {{}};
    el.querySelectorAll("button").forEach(function (b) {{ b.setAttribute("aria-pressed", String(s.v === b.dataset.v)); }});
    var ta = el.querySelector("textarea"); if (ta && ta.value !== (s.note || "")) ta.value = s.note || "";
  }}
  items.forEach(function (el) {{
    paint(el);
    el.querySelectorAll("button").forEach(function (b) {{
      b.addEventListener("click", function () {{
        var k = el.dataset.key; state[k] = state[k] || {{}};
        state[k].v = (state[k].v === b.dataset.v) ? "" : b.dataset.v; save(); paint(el); tally();
      }});
    }});
    var ta = el.querySelector("textarea");
    ta.addEventListener("input", function () {{ var k = el.dataset.key; state[k] = state[k] || {{}}; state[k].note = ta.value; save(); tally(); }});
  }});
  var overall = document.getElementById("fb-overall");
  try {{ overall.value = state.__overall || ""; }} catch (e) {{}}
  overall.addEventListener("input", function () {{ state.__overall = overall.value; save(); tally(); }});
  function tally() {{
    var n = 0, notes = 0;
    items.forEach(function (el) {{ var s = state[el.dataset.key] || {{}}; if (s.v) n++; if (s.note) notes++; }});
    document.getElementById("tally").textContent = n || notes ? (n + " verdict" + (n === 1 ? "" : "s") + ", " + notes + " note" + (notes === 1 ? "" : "s")) : "nothing marked yet";
  }}
  tally();
  function markdown() {{
    var out = ["# Feedback — control flow + SystemSketch rebuild (2026-09-18)", ""];
    if (state.__overall) out.push(state.__overall.trim(), "");
    function section(title, kind) {{
      var rows = items.filter(function (el) {{ return el.dataset.kind === kind; }}).map(function (el) {{
        var s = state[el.dataset.key] || {{}}; if (!s.v && !s.note) return null;
        return "- **" + el.dataset.num + " · " + el.dataset.title + "** — " + (s.v ? s.v.toUpperCase() : "(no verdict)") + (s.note ? " — " + s.note.trim() : "");
      }}).filter(Boolean);
      if (rows.length) out.push("## " + title, "", rows.join("\\n"), "");
    }}
    section("Needs you", "needs"); section("Lanes", "lane");
    if (out.length === 2) out.push("_(nothing marked)_");
    return out.join("\\n");
  }}
  function show(text, msg) {{
    var sheet = document.getElementById("sheet"), ta = document.getElementById("out");
    ta.value = text; sheet.classList.add("open"); ta.focus(); ta.select();
    document.getElementById("status").textContent = msg;
  }}
  function copy() {{
    var text = markdown();
    var done = function () {{ show(text, "Copied to the clipboard — and selected below, in case the clipboard refused (file:// often does)."); }};
    var fail = function () {{ show(text, "Clipboard refused on this origin — the text is selected below; press Ctrl-C / ⌘C."); }};
    try {{ if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fail); else fail(); }} catch (e) {{ fail(); }}
  }}
  document.getElementById("copy").addEventListener("click", copy);
  document.getElementById("copy2").addEventListener("click", copy);
  document.getElementById("close").addEventListener("click", function () {{ document.getElementById("sheet").classList.remove("open"); }});
  document.getElementById("clear").addEventListener("click", function () {{ state = {{}}; save(); items.forEach(paint); overall.value = ""; tally(); }});
}})();
</script>
</body></html>"""
    return page


def main() -> None:
    html_page = build(inline_gif=True)
    encoded = len(quote(html_page, safe="").encode())
    if encoded >= CAP:
        print(f"with the GIF inline the encoded size is {encoded:,} >= {CAP:,}; rebuilding with the GIF as a sibling file")
        html_page = build(inline_gif=False)
        encoded = len(quote(html_page, safe="").encode())
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html_page)
    print(f"wrote {OUT}  ({OUT.stat().st_size:,} bytes on disk)")
    print(f"encoded data: URL {encoded:,} / {CAP:,} ({encoded / CAP:.0%}) -> {'OK, opens in the preview' if encoded < CAP else 'OVER CAP - browser only'}")
    print(f"captures/media inlined: {len(USED)}")
    for u in USED:
        print("  ", u)


if __name__ == "__main__":
    sys.exit(main())
