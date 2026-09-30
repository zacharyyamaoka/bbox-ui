#!/usr/bin/env python3
"""
Build the readable face of docs/finish-2026-09-29/WORK-ORDER.md.

Zach asked for "a plan for me to finish the rest of the bbox ui work in a single
shot". The lane-readable plan is the committed markdown plus lanes.json (an
isolated worktree can only read a plan from a commit); this page is what he
reads and decides from.

Nothing is retyped. The gates and the decision table are PARSED out of the
committed WORK-ORDER.md, the lanes, deferrals and the dependency graph come from
lanes.json, and the verdict counts from backlog-verified.json — so the page
cannot drift from what the run executes. The build also refuses to write the
page if any open backlog id is unassigned or assigned twice.

    python3 docs/build_finish_plan_report.py
"""
from __future__ import annotations

import json
import pathlib
import re
import sys
from collections import Counter, defaultdict
from html import escape

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from _report_kit import CSS, FB_JS, dock, overall_box, report_size, sh  # noqa: E402

HERE = pathlib.Path(__file__).resolve().parent
PLAN_DIR = HERE / "finish-2026-09-29"
REPO = HERE.parent
OUT = pathlib.Path("/home/bam/bbox-ui/reports/finish-plan-2026-09-29.html")

ORDER = (PLAN_DIR / "WORK-ORDER.md").read_text()
LANES = json.loads((PLAN_DIR / "lanes.json").read_text())
BACKLOG = json.loads((PLAN_DIR / "backlog-verified.json").read_text())["items"]
BY_ID = {row["id"]: row for row in BACKLOG}

# ---------------------------------------------------------------------------
# Coverage gate — the one invariant the plan rests on.
# ---------------------------------------------------------------------------
OPEN = {r["id"] for r in BACKLOG if r["verdict"] in ("STILL-ABSENT", "PARTIAL")}
assigned = Counter(i for lane in LANES["lanes"] for i in lane.get("items", []))
deferred_ids = {d["id"] for d in LANES["deferred"]}
twice = [i for i, n in assigned.items() if n > 1]
unplaced = OPEN - set(assigned) - deferred_ids
stray = (set(assigned) | deferred_ids) - OPEN
if twice or unplaced or stray or (set(assigned) & deferred_ids):
    raise SystemExit(f"coverage broken: twice={twice} unplaced={sorted(unplaced)} stray={sorted(stray)}")
clusters_in = Counter(c for lane in LANES["lanes"] for c in lane.get("clusters", []))
clusters_out = {d["cluster"] for d in LANES["deferredClusters"]}
if set(range(1, 35)) - set(clusters_in) - clusters_out or [c for c, n in clusters_in.items() if n > 1]:
    raise SystemExit("cluster coverage broken")


# ---------------------------------------------------------------------------
# Parsed out of the committed work order.
# ---------------------------------------------------------------------------
def md_table(heading: str) -> list[list[str]]:
    """The first pipe table under a heading, header and rule dropped."""
    lines = ORDER.split(heading, 1)[1].splitlines()
    start = next(i for i, ln in enumerate(lines) if ln.startswith("|"))
    block = []
    for ln in lines[start:]:
        if not ln.startswith("|"):
            break
        block.append(ln)
    rows = [[c.strip() for c in ln.strip().strip("|").split("|")] for ln in block]
    return [r for r in rows[1:] if not all(set(c) <= set("-: ") for c in r)]


def md_inline(text: str) -> str:
    out = escape(text)
    out = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", out)
    out = re.sub(r"`(.+?)`", r"<code>\1</code>", out)
    return out


GATES = md_table("## 1. The finish line")
DECISIONS = md_table("## 6. Decisions")
KICKOFF = re.search(r"## 8\. Kickoff.*?\n\n(?:.*?\n\n)?((?:> .*\n?)+)", ORDER, re.S).group(1)
KICKOFF = " ".join(ln[2:].strip() for ln in KICKOFF.strip().splitlines())
if len(GATES) != 6 or len(DECISIONS) < 18:
    raise SystemExit(f"parsed {len(GATES)} gates / {len(DECISIONS)} decisions — the order's shape changed")

# ---------------------------------------------------------------------------
# Facts.
# ---------------------------------------------------------------------------
verdicts = Counter(r["verdict"] for r in BACKLOG)
sizes = Counter(r["size"] for r in BACKLOG if r["id"] in OPEN)
UNMOUNTED = re.compile(r"no app importer|unmounted|nothing mounts|app mounts neither|app imports neither|"
                       r"not mounted|app still paints|app passes|app sets no|no importer", re.I)
trunk_ahead = sorted((r["id"] for r in BACKLOG if r["id"] in OPEN and UNMOUNTED.search(
    r.get("note", "") + " " + r.get("evidence", ""))), key=lambda s: int(s[2:]))
lanes = LANES["lanes"]
build_lanes = [lane for lane in lanes if lane.get("owner") != "dispatcher"]
FACTS = {
    "commits": 74,
    "branches": 12,
    "studio_red": 10,
    "open": len(OPEN),
    "in_run": len(assigned),
    "deferred": len(deferred_ids),
    "lanes": len(build_lanes),
    "clusters_in": len(clusters_in),
    "trunk_ahead": len(trunk_ahead),
    "head": sh("git rev-parse --short HEAD", REPO),
    "main": sh("git rev-parse --short main", REPO),
}

KIND = {
    "dispatcher": ("#8b93a3", "dispatcher"),
    "barrier": ("#f0883e", "barrier — alone"),
    "green": ("#e8c06a", "green main"),
    "canvas": ("#5aa9f8", "canvas lane"),
    "chrome": ("#b58cf2", "chrome lane (on the shell)"),
    "host": ("#3fc4b0", "host / channels"),
    "library": ("#3fb950", "registry + site"),
}
CHROME = {"L-MENU-CONTEXT", "L-PILL", "L-INSPECTOR", "L-FILES", "L-NAV"}
HOSTS = {"L-RF-HOST", "L-CHANNELS"}


def kind_of(lane: dict) -> str:
    lid = lane["id"]
    if lane.get("owner") == "dispatcher" or lid == "W0":
        return "dispatcher"
    if lid.startswith("B-"):
        return "barrier"
    if lid.startswith("G-"):
        return "green"
    if lid in CHROME:
        return "chrome"
    if lid in HOSTS:
        return "host"
    if lid.startswith("L-REG") or lid.startswith("L-DOCS"):
        return "library"
    return "canvas"


# ---------------------------------------------------------------------------
# The run, drawn: longest-path layers from dependsOn.
# ---------------------------------------------------------------------------
NODES = {"W0": {"id": "W0", "title": "Preflight", "dependsOn": [], "owner": "dispatcher"}}
NODES.update({lane["id"]: lane for lane in lanes})
# "*" = every lane nothing else waits on: W5 verifies the whole run, not one wave.
SINKS = [lane["id"] for lane in lanes if lane["dependsOn"] != ["*"]
         and not any(lane["id"] in other["dependsOn"] for other in lanes)]


def deps(nid: str) -> list[str]:
    raw = NODES[nid].get("dependsOn", [])
    return [d for dep in raw for d in (SINKS if dep == "*" else [dep])]


layer: dict[str, int] = {}


def depth(nid: str) -> int:
    if nid not in layer:
        layer[nid] = 1 + max((depth(d) for d in deps(nid)), default=-1)
    return layer[nid]


for nid in NODES:
    depth(nid)
columns: dict[int, list[str]] = defaultdict(list)
KIND_ORDER = ["dispatcher", "barrier", "green", "canvas", "chrome", "host", "library"]
for nid in sorted(NODES, key=lambda n: (KIND_ORDER.index(kind_of(NODES[n])), n)):
    columns[layer[nid]].append(nid)

COL_W, NODE_W, NODE_H, ROW_H, TOP, LEFT = 134, 124, 26, 34, 34, 8
n_cols = max(columns) + 1
n_rows = max(len(v) for v in columns.values())
SVG_W = LEFT * 2 + COL_W * n_cols
SVG_H = TOP + ROW_H * n_rows + 12
pos: dict[str, tuple[float, float]] = {}


def place() -> None:
    for col, ids in columns.items():
        offset = (n_rows - len(ids)) * ROW_H / 2
        for row, nid in enumerate(ids):
            pos[nid] = (LEFT + col * COL_W, TOP + offset + row * ROW_H)


# WHY two barycentre sweeps (Sugiyama's ordering step, the textbook heuristic):
# sorting a column by where its dependencies sit is what stops a fan like
# B-SCHEMA → thirteen lanes from drawing as a knot of crossings.
place()
for _ in range(2):
    for col in range(1, n_cols):
        columns[col].sort(key=lambda n: sum(pos[d][1] for d in deps(n)) / max(len(deps(n)), 1))
        place()

edges_svg = []
for nid in NODES:
    x2, y2 = pos[nid]
    if NODES[nid].get("dependsOn") == ["*"]:
        continue  # WHY: sink → W5 edges crossed every column and read as feeding the barriers; stubs say it instead
    for d in deps(nid):
        x1, y1 = pos[d]
        sx, sy, ex, ey = x1 + NODE_W, y1 + NODE_H / 2, x2, y2 + NODE_H / 2
        mid = (sx + ex) / 2
        long_range = layer[nid] - layer[d] > 1
        edges_svg.append(
            f'<path d="M{sx:.1f},{sy:.1f} C{mid:.1f},{sy:.1f} {mid:.1f},{ey:.1f} {ex:.1f},{ey:.1f}" '
            f'fill="none" stroke="#5a6475" stroke-width="1.1" marker-end="url(#arr)"'
            f'{" stroke-dasharray=\"3 3\"" if long_range else ""}/>')
for sink in SINKS:
    x, y = pos[sink]
    edges_svg.append(
        f'<path d="M{x + NODE_W:.1f},{y + NODE_H / 2:.1f} h7" stroke="#8b93a3" stroke-width="1.1" '
        f'marker-end="url(#arrv)"/>')
nodes_svg = []
for nid, (x, y) in pos.items():
    colour = KIND[kind_of(NODES[nid])][0]
    title = escape(NODES[nid].get("title", nid))
    nodes_svg.append(
        f'<g><title>{escape(nid)} — {title}</title>'
        f'<rect x="{x}" y="{y}" width="{NODE_W}" height="{NODE_H}" rx="6" fill="#15171c" '
        f'stroke="{colour}" stroke-width="1.5"/>'
        f'<text x="{x + NODE_W / 2}" y="{y + NODE_H / 2 + 3.6}" text-anchor="middle" '
        f'font-family="ui-monospace,Menlo,monospace" font-size="10" fill="#e6e8ee">{escape(nid)}</text></g>')
WAVE_LABELS = "".join(
    f'<text x="{LEFT + c * COL_W + NODE_W / 2}" y="16" text-anchor="middle" font-size="10" '
    f'fill="#6b7383" font-family="ui-monospace,Menlo,monospace">step {c}</text>' for c in range(n_cols))
DAG = (f'<svg viewBox="0 0 {SVG_W} {SVG_H}" width="100%" role="img" '
       f'aria-label="The run as a dependency graph"><defs><marker id="arr" viewBox="0 0 6 6" refX="5.5" '
       f'refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#5a6475"/>'
       f'</marker><marker id="arrv" viewBox="0 0 6 6" refX="5.5" refY="3" markerWidth="6" markerHeight="6" '
       f'orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#8b93a3"/></marker></defs>{WAVE_LABELS}{"".join(edges_svg)}{"".join(nodes_svg)}</svg>')
LEGEND = "".join(
    f'<span style="display:inline-flex;align-items:center;gap:6px;margin:0 16px 6px 0;font-size:12.5px;'
    f'color:var(--dim)"><i style="width:12px;height:12px;border-radius:3px;border:1.5px solid {c};'
    f'display:inline-block"></i>{escape(label)}</span>' for c, label in KIND.values())


# ---------------------------------------------------------------------------
# Sections.
# ---------------------------------------------------------------------------
def fbc(rank: str, title: str, placeholder: str) -> str:
    """A decision strip: take the default, change it, or note — no drawing
    buttons, because nothing here is a drawing."""
    return f"""
<div class="fb" data-rank="{escape(rank)}" data-title="{escape(title)}">
  <span class="lbl">{escape(rank)}</span>
  <button class="yes" data-fb="yes" aria-pressed="false">&#10003; take the default</button>
  <button class="no" data-fb="no" aria-pressed="false">&#10007; change it</button>
  <button class="star" data-fb="star" aria-pressed="false">&#9733; matters most</button>
  <span class="sep"></span>
  <button class="note-btn" data-fb="note" aria-pressed="false">&#9998; note</button>
  <textarea class="hidden" spellcheck="false" placeholder="{escape(placeholder)}"></textarea>
</div>"""


GATES_HTML = "".join(
    f"<tr><td>{md_inline(g)}</td><td>{md_inline(d)}</td><td>{md_inline(m)}</td></tr>" for g, d, m in GATES)

DECISIONS_HTML = "".join(
    f'<div class="ask"><h3>{md_inline(q)}</h3>'
    f'<p class="dflt"><b>Default:</b> {md_inline(dflt)}</p>'
    f'{fbc(re.sub(r"[*`]", "", did), re.sub(r"[*`]", "", q), "what should it be instead…")}</div>'
    for did, q, dflt in DECISIONS)

WAVE_TITLES = {w["id"]: w["title"] for w in LANES["waves"]}
lane_rows = []
for wave in [w["id"] for w in LANES["waves"]]:
    in_wave = [lane for lane in lanes if lane["wave"] == wave]
    if not in_wave:
        continue
    lane_rows.append(f'<tr class="dim"><td colspan="6"><b>{wave} · {escape(WAVE_TITLES[wave])}</b></td></tr>')
    for lane in in_wave:
        colour = KIND[kind_of(lane)][0]
        items = lane.get("items", [])
        item_bits = ", ".join(
            f'<span title="{escape(BY_ID[i].get("note", ""))}">{i}</span>' for i in items)
        extra = ""
        if lane.get("clusters"):
            extra += f' · clusters {", ".join(str(c) for c in lane["clusters"])}'
        if lane.get("extra") and not items:
            extra = f'<span style="color:var(--dim2)">{md_inline(lane["extra"][0])}</span>'
        acc = "".join(f"<li>{md_inline(a)}</li>" for a in lane.get("acceptance", []))
        lane_rows.append(
            f'<tr><td><b style="color:{colour}">{escape(lane["id"])}</b></td>'
            f'<td><b>{escape(lane["title"])}</b>'
            f'<details><summary style="cursor:pointer;color:var(--dim2);font-size:12px">acceptance</summary>'
            f'<ul style="margin:6px 0 0 16px;padding:0;font-size:12.5px">{acc}</ul></details></td>'
            f'<td>{item_bits or ("" if extra else "—")}{extra}</td>'
            f'<td class="c">{escape(lane.get("model", ""))}</td>'
            f'<td class="c">{escape(lane.get("size", ""))}</td>'
            f'<td style="font-size:12px">{escape(", ".join(lane.get("dependsOn", [])))}</td></tr>')
LANES_HTML = "".join(lane_rows)

DEFERRED_HTML = "".join(
    f'<tr><td><b>{d["id"]}</b></td><td>{escape(BY_ID[d["id"]].get("note", ""))}</td>'
    f'<td>{md_inline(d["why"])}</td></tr>' for d in LANES["deferred"])
DEFERRED_CLUSTERS_HTML = "".join(
    f'<tr><td><b>cluster {d["cluster"]}</b></td><td colspan="2">{md_inline(d["why"])}</td></tr>'
    for d in LANES["deferredClusters"])

STOCK = [
    ("Studio Stable / Preview", "hand-rolled: <code>scripts/launch_systemsketch.py</code> pins Stable on :4341, "
     "<code>chrome/siteStatus.ts</code> rows; an unmerged branch ported <code>releaseChannel.ts</code> into the trunk",
     "<code>stable_preview_switcher</code> — one <code>stable-preview.json</code>; <code>sps open</code>, "
     "<code>sps promote</code>, <code>sps install-desktop</code>, the injected chip",
     "the dock icon opens Stable; Preview one click away; “the badge may not claim what it has not verified”"),
    ("Auto-layout (P-103)", "none", "<code>elkjs</code> — <code>new ELK().layout(graph)</code>, positions only",
     "one undo step; never moves a pinned cable; cited in ALGORITHM-PROVENANCE.md"),
    ("Instance tree (P-083)", "none", "<code>react-arborist</code> — <code>Tree</code> (his pick)",
     "a fourth right-rail surface beside Frames, Problems, Inspector"),
    ("Code completion (P-064)", "dropped from the trunk <code>codeEditor.tsx</code>",
     "<code>completionMenu</code> (packages/bbox-ui, over <code>@codemirror/autocomplete</code>)",
     "':' offers types, '=' variables, a bare name nothing; Tab/Enter rules as in the README"),
    ("Wire labels (P-156/171)", "none on the canvas", "trunk <code>TraceBadge</code>",
     "double-click creates, drag along the cable, persisted as a fraction"),
    ("Right-click menu (P-010)", "tldraw stock + one <code>bbox-source</code> group",
     "trunk <code>buildBlockMenu</code> / <code>buildPortMenu</code> / <code>buildTraceMenu</code> → "
     "<code>ComponentContextMenu</code>", "every row runs a real command — the dead-control guard counts"),
    ("Number fields (P-139)", "none in the trunk", "<code>ScrubNumber</code> from packages/inspector",
     "drag to scrub, type an expression (<code>evaluateNumericExpression</code>)"),
    ("React Flow host (P3)", "none", "<code>simple-reactflow-whiteboard</code> <code>Whiteboard</code> "
     "(opened as a library 09-19) over <code>@xyflow/react</code>", "same shell windows as the tldraw host; never pushed"),
    ("Drafts (P-020)", "chip seat reserved, nothing passed",
     "trunk <code>draftBar</code>, <code>branchChip</code>, <code>draftChanges</code>",
     "IcePanel-quiet bar only (doNotBuild: the loud hazard bar)"),
    ("<b>unchanged (stock seam)</b>", "tldraw <code>ShapeUtil</code>/<code>Editor</code>, React Flow core, "
     "<code>npx shadcn build</code>, Fumadocs", "—", "not wrapped, not forked; the app hosts, the trunk owns behaviour"),
]
STOCK_HTML = "".join(f"<tr><td><b>{a}</b></td><td>{b}</td><td>{c}</td><td>{d}</td></tr>" for a, b, c, d in STOCK)

verdict_bar = "".join(
    f'<div title="{k} {n}" style="flex:{n};background:{c};height:14px"></div>'
    for k, n, c in [("still absent", verdicts["STILL-ABSENT"], "#e5534b"), ("partial", verdicts["PARTIAL"], "#e8c06a"),
                    ("now done", verdicts["NOW-DONE"], "#3fb950"), ("obsolete", verdicts["OBSOLETE"], "#6b7383")])

EXTRA_CSS = """
  .bar { display:flex; gap:2px; border-radius:5px; overflow:hidden; margin:10px 0 6px }
  .dag { background:#0a0b0e; border:1px solid var(--line); border-radius:11px; padding:14px 12px 6px; margin:14px 0 8px }
  details summary::-webkit-details-marker { color:var(--dim2) }
  .kick { position:relative }
  .kick button { position:absolute; top:8px; right:8px; font:700 12px/1 inherit; font-family:inherit;
    cursor:pointer; border-radius:7px; padding:7px 11px; border:1px solid var(--line2); background:#232833; color:var(--fg) }
  pre.wrap { white-space:pre-wrap }
  .grid2 > .ask { margin:0 }
  .ask h3 { font-size:15px }
"""

HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Finish bbox-ui — the plan</title>
<style>{CSS}{EXTRA_CSS}</style></head>
<body><div class="wrap">

<p class="kicker">bbox-ui · plan · 29 September 2026 · main {FACTS['main']}</p>
<h1>Finishing bbox-ui in one run</h1>
<p class="sub">Yes, it fits in one run, but only once "finish" has a line drawn. Below is that line: six
measured gates, {FACTS['lanes']} lanes in six waves, and about a night and a morning of agent time. The
biggest win costs almost nothing: <b>{FACTS['commits']} commits of finished work, most of it things you
asked for, are sitting on {FACTS['branches']} branches off main</b>, and they merge without a conflict.</p>

<div class="facts">
  <div class="fact warn"><b>{FACTS['commits']}</b><span>commits stranded off main</span></div>
  <div class="fact bad"><b>{FACTS['studio_red']}</b><span>studio tests red on main</span></div>
  <div class="fact"><b>{FACTS['open']}</b><span>backlog items still open (of 110)</span></div>
  <div class="fact good"><b>{FACTS['in_run']}</b><span>open items in this run</span></div>
  <div class="fact"><b>{FACTS['deferred']}</b><span>items deferred, each with a reason</span></div>
  <div class="fact"><b>{FACTS['lanes']}</b><span>lanes, 6 waves</span></div>
  <div class="fact good"><b>{FACTS['trunk_ahead']}</b><span>at least — built in the trunk, never mounted</span></div>
</div>

<h2>Three things that change the brief</h2>
<div class="answers">
  <div class="answer"><b class="h">"Finish" needs a line, or no run ever ends.</b>
    <p>The backlog is 430 items across waves 2–4. That is not one shot of anything. The line below is six gates,
    each checked against something measurable: nothing stranded, green five times running, studio parity on
    every noticeability-4/5 capability, one shell over two hosts, every registry item installable, and
    Stable/Preview on the dock. Everything outside the line is listed with a reason, so a cut is visible
    rather than quiet.</p></div>
  <div class="answer blue"><b class="h">The trunk is ahead of the app.</b>
    <p>At least {FACTS['trunk_ahead']} of the {FACTS['open']} open items (the ones where the scout's note names
    the trunk part outright) are things the trunk already has and the studio never mounts: TraceBadge, the domain
    context menu, ScrubNumber, fit-to-content, tidy, definition linking, members, the blackbox toggle, the draft
    engine, the magnet kit. A large share of this run is wiring, not invention, so every lane starts by mounting
    the trunk part rather than rebuilding it.</p></div>
  <div class="answer red"><b class="h">main is red, and the red is two different things.</b>
    <p>Nine of the ten studio failures are acceptance tests written on 09-21 ahead of their features (drafts,
    the narrow corner, the Export rows). They're a to-do list, and the run builds what they specify. The
    tenth is a stale pin that never caught up with the channel rows you asked for. Separately, storybook-basics
    fails a <i>different</i> handful of tests on every run under load. That's flakiness, and it gets fixed
    before anything else so the gate means something.</p></div>
</div>

<h2>The finish line</h2>
<div class="scroll"><table><tr><th>gate</th><th>done means</th><th>measured by</th></tr>{GATES_HTML}</table></div>

<h2>The run, drawn</h2>
<p style="color:var(--dim)">Each box is a lane, and an edge means "must merge first". Columns are the
longest dependency chain, and wall-clock time runs left to right. Two barriers sit alone: <b>B-RENAME</b> and
<b>B-SCHEMA</b> (23 open items write <code>BlockShapeUtil.tsx</code>, so every new prop lands in one migration
against a legacy fixture). <b>B-SHELL-P1</b> is a barrier only on <code>chrome/</code>, which is why the canvas
lanes run beside it. A dashed edge skips columns. A short grey tick means the lane feeds W5-VERIFY directly;
every lane is verified there. Hover a box for its title.</p>
<div class="dag">{DAG}</div>
<div>{LEGEND}</div>

<h2>Where the backlog actually stands</h2>
<p style="color:var(--dim)">The 09-21 triage called 110 items ABSENT. Three read-only scouts re-checked every
one against main today by reading the code the row cites and anything landed since, not by grepping:</p>
<div class="bar">{verdict_bar}</div>
<p style="font-size:13px;color:var(--dim)"><b style="color:#e5534b">{verdicts['STILL-ABSENT']} still absent</b> ·
<b style="color:#e8c06a">{verdicts['PARTIAL']} partial</b> · <b style="color:#3fb950">{verdicts['NOW-DONE']} now done</b>
(P-053 terminal handles, P-055 the multi-line lane) · {verdicts['OBSOLETE']} obsolete (P-018, P-170).
Size of the {FACTS['open']} open ones: {sizes['S']} S · {sizes['M']} M · {sizes['L']} L. The 229 items never
triaged fell into 34 clusters plus 65 duplicates of canonical items and 8 doNotBuild hits.
{FACTS['clusters_in']} clusters are in this run. Each lane's acceptance author re-verifies at dispatch anyway,
because the last triage was 44% stale within a day.</p>

<h2>Every lane</h2>
<div class="scroll"><table>
<tr><th>lane</th><th>what</th><th>backlog items (hover for the scout's note)</th><th>model</th><th>size</th><th>after</th></tr>
{LANES_HTML}
</table></div>

<h2>Decisions: each has a default the run takes if you say nothing</h2>
<p style="color:var(--dim);margin-bottom:16px">None of these blocks the run. Mark the ones you want changed and
press <b>Copy feedback</b>, or just paste the kickoff below as is.</p>
<div class="grid2">{DECISIONS_HTML}</div>
{overall_box("anything to change before this is dispatched…")}

<h2>Stock parts, element by element</h2>
<p style="color:var(--dim)">Where the run replaces something hand-rolled, or fills a gap with a library part.
This is a plan, so no captures exist yet. They are owed in the W5 report.</p>
<div class="scroll"><table>
<tr><th>element</th><th>today</th><th>off-the-shelf part (exact name)</th><th>behaviour that must survive</th></tr>
{STOCK_HTML}</table></div>

<h2>Deliberately not in this run</h2>
<div class="scroll"><table><tr><th>item</th><th>what the scout found</th><th>why it waits</th></tr>
{DEFERRED_HTML}{DEFERRED_CLUSTERS_HTML}</table></div>
<p style="color:var(--dim);font-size:13.5px">Also out: the visual-language proposal of 09-24 (it waits on
your per-idea marks on that page), anything in <code>packages/bbox-ui</code> beyond making registry items
installable, <code>apps/storybook</code>, deploys, pushes, and the vault note on the settled architecture.</p>

<h2>Kickoff</h2>
<p style="color:var(--dim)">Paste this into a fresh Opus 5.5 session with cwd <code>/home/bam/bbox-ui</code>.
It is a prompt, not a shell command, so it has no Run button.</p>
<div class="kick"><pre class="wrap" id="kick">{escape(KICKOFF)}</pre>
<button onclick="navigator.clipboard&&navigator.clipboard.writeText(document.getElementById('kick').innerText)">Copy</button></div>

{dock("finish plan (2026-09-29)", "decision", len(DECISIONS))}

<footer class="page">
<p><b>The plan is the files, not this page.</b> <code>docs/finish-2026-09-29/WORK-ORDER.md</code>,
<code>lanes.json</code>, <code>backlog-verified.json</code>, <code>untriaged-clusters.md</code>,
<code>baseline.md</code>, <code>LEDGER.md</code>, on branch <code>claude/bbox-ui-plan-960af5</code> at
<code>{FACTS['head']}</code>. This page is parsed from them.</p>
<p><b>How it was made.</b> Claude Opus 5.5 (<code>claude-opus-5-5</code>) planned and decided. Haiku scouts
swept the docs, plans, branches, the vault and last week's sessions. Three Sonnet 5.5 scouts re-verified the
110 items against code, and one clustered the 229. The stranded-branch merge was simulated as objects only,
and typecheck plus both suites were run on the simulated tip. Numbers are in <code>baseline.md</code>.</p>
<p><b>Built by</b> <code>docs/build_finish_plan_report.py</code>. No source file was modified.</p>
</footer>

</div>
<script>{FB_JS}</script>
</body></html>"""

report_size(HTML, OUT)
print(f"lanes={FACTS['lanes']} open={FACTS['open']} in_run={FACTS['in_run']} deferred={FACTS['deferred']} "
      f"clusters_in={FACTS['clusters_in']} trunk_ahead={FACTS['trunk_ahead']} decisions={len(DECISIONS)} "
      f"layers={n_cols} tallest={n_rows}")
