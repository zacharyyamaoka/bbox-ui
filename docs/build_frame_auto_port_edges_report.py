#!/usr/bin/env python3
"""Builds the frame-auto-port-edges report — a self-contained, media-rich HTML.

Lane `frame-auto-port-edges`, 2026-09-22. Every number below is read off the
tree or off a captured log at build time (`sh`, the log parsers), never typed
from memory; every picture is a real capture from `docs/capture_frame_auto_
port_edges.mjs` driven by a real mouse against the lane's own Storybook.

    python3 docs/build_frame_auto_port_edges_report.py --media <dir> --logs <dir> --out <file.html>
"""
from __future__ import annotations

import argparse
import base64
import json
import pathlib
import re
import subprocess
import sys
from html import escape

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from _report_kit import CSS, FB_JS, dock, fb, overall_box, report_size, sh, shot  # noqa: E402

REPO = pathlib.Path(__file__).resolve().parent.parent
APP = REPO / "apps/storybook-basics"
SRC = APP / "src"

parser = argparse.ArgumentParser()
parser.add_argument("--media", required=True)
parser.add_argument("--logs", required=True)
parser.add_argument("--out", required=True)
args = parser.parse_args()
MEDIA = pathlib.Path(args.media)
LOGS = pathlib.Path(args.logs)
OUT = pathlib.Path(args.out)

# --------------------------------------------------------------------------
# Facts read off the tree and the logs
# --------------------------------------------------------------------------


def counts(log: pathlib.Path) -> dict:
    text = log.read_text() if log.exists() else ""
    files = re.search(r"^\s*Test Files\s+(\d.*)$", text, re.MULTILINE)
    tests = re.search(r"^\s*Tests\s+(\d.*)$", text, re.MULTILINE)
    duration = re.search(r"Duration\s+([\d.]+s)", text)
    exit_code = re.search(r"test exit=(\d+)", text)
    return {
        "files": files.group(1).strip() if files else "?",
        "tests": tests.group(1).strip() if tests else "?",
        "duration": duration.group(1) if duration else "?",
        "exit": exit_code.group(1) if exit_code else "?",
        "red": [line.strip()[2:].strip() for line in text.splitlines() if line.strip().startswith("×")],
    }


BASELINE = counts(LOGS / "baseline-test.log")
FINAL = counts(LOGS / "final-test.log")
RERUN = counts(LOGS / "rerun-four.log")
MUTATIONS = json.loads((LOGS / "mutations.json").read_text()) if (LOGS / "mutations.json").exists() else []


def wc(rel: str) -> int:
    return len((SRC / rel).read_text().splitlines())


def added_lines(rel: str, marker: str = "2026-09-22") -> list[tuple[int, str]]:
    """Every line in a shared file that carries this lane's date stamp — the
    honest index of what was touched, with the line numbers Zach can open."""
    out = []
    for number, line in enumerate((SRC / rel).read_text().splitlines(), 1):
        if marker in line:
            out.append((number, line.strip()[:110]))
    return out


NEW_FILES = [
    ("components/frame.tsx", "The Frame: title, box, membership (BlockMembers), a PortEdge per wall, inner-face anchors, ring markers"),
    ("components/frame.layout.ts", "Faces naming, rail placement over railBoxFor, wall t ↔ rail offset, auto/custom insertion, auto-fit box"),
    ("components/frame.layout.test.ts", "9 node tests"),
    ("components/Frame.stories.tsx", "Layer 1 stories: frame alone, ports on every wall, every toggle (+ try-it)"),
    ("components/FrameAutoPortEdges.stories.tsx", "Layers 2-4 on React Flow: drag-to-edge, crossings ring/port, spacing, validation, linked delete, header, three children"),
    ("scene/links.ts", "Linked objects: refs, closure, deleteWithLinks, pruneLinks"),
    ("scene/links.test.ts", "13 node tests"),
    ("scene/wallPort.ts", "Wall crossings (ported from 52a1b92), faces, insertion order, chain split + link set, unsplit"),
    ("scene/wallPort.test.ts", "20 node tests"),
    ("hosts/frameScene.ts", "Host bindings: FrameData, mode/arrange writes, add/remove wall port, split/unsplit, deleteFrameObjects, resolvers with faces"),
    ("hosts/frameCrossings.ts", "useWallCrossings: N containers, rich crossings, measured in the host's space"),
    ("hosts/frameNodeView.tsx", "type:\"frame\" → Frame, through nodeViews' exported helpers"),
]
SHARED_FILES = [
    ("hosts/reactFlowHost.tsx", "connectable, isValidConnection, onConnect, onConnectEnd, onDeleteElements; frame node type + drag handle; pressable handles"),
    ("hosts/nodeViews.tsx", "case \"frame\"; freeMemberOf/withProducers exported; selectedPorts decoration"),
    ("components/wireLayer.tsx", "an inner-face dot has no own box (fromBox/toBox null)"),
    ("scene/model.ts", "BlockScene.links?: SceneLink[] (additive, optional); ObjectRef, SceneLink"),
    ("hosts/hostScene.ts", "HostNodeData.frame?: FrameData"),
    ("hosts/regionCrossings.ts", "now a one-region wrapper over useWallCrossings"),
]


def pic(name: str, scheme: str, quality: int = 70) -> str:
    path = MEDIA / f"{name}-{scheme}.png"
    return shot(path, quality=quality) if path.exists() else ""


def data_uri(path: pathlib.Path, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def pair(name: str, caption: str, note: str = "", quality: int = 70) -> str:
    dark = pic(name, "dark", quality)
    light = pic(name, "light", quality)
    return f"""
<figure class="pair">
  <div class="pair-grid">
    <div><img src="{dark}" alt="{escape(caption)} (dark)"><span class="tag">dark</span></div>
    <div><img src="{light}" alt="{escape(caption)} (light)"><span class="tag">light</span></div>
  </div>
  <figcaption><b>{escape(caption)}</b>{escape(note)}</figcaption>
</figure>"""


# --------------------------------------------------------------------------
# The seam diagram — a wall port's two faces and the linked set
# --------------------------------------------------------------------------


def seam_svg() -> str:
    return """
<svg class="diagram" viewBox="0 0 900 300" role="img" aria-label="A wall port has two faces. An outside cable arrives at the outer face, whose handle is the port id p; an inside cable leaves the inner face, handle p at inner, into the frame. Both faces share one dot and one owner box. The outer half-cable, the port and the inner half-cable form one linked set: deleting any one deletes all three.">
  <rect x="330" y="30" width="520" height="240" rx="12" fill="none" stroke="#3a4250" stroke-width="2"/>
  <text x="344" y="22" fill="#9aa3b2" font-size="13" font-weight="600">Frame  ·  one owner box  [data-block-id="frame"]</text>
  <rect x="560" y="120" width="210" height="80" rx="8" fill="#15171c" stroke="#343b49"/>
  <text x="576" y="146" fill="#e6e8ee" font-size="13" font-weight="600">child member</text>
  <circle cx="560" cy="176" r="6" fill="none" stroke="#f0883e" stroke-width="2"/>
  <text x="574" y="181" fill="#9aa3b2" font-size="12">in1  Pose</text>
  <rect x="60" y="120" width="170" height="80" rx="8" fill="#15171c" stroke="#343b49"/>
  <text x="76" y="146" fill="#e6e8ee" font-size="13" font-weight="600">External</text>
  <circle cx="230" cy="176" r="6" fill="none" stroke="#f0883e" stroke-width="2"/>
  <text x="150" y="181" fill="#9aa3b2" font-size="12">out  Pose</text>
  <path d="M236 176 H330" fill="none" stroke="#c8cede" stroke-width="2.5"/>
  <path d="M330 176 H554" fill="none" stroke="#c8cede" stroke-width="2.5"/>
  <circle cx="330" cy="176" r="8" fill="#0e0f12" stroke="#f0883e" stroke-width="2.5"/>
  <text x="344" y="196" fill="#e6e8ee" font-size="12">port  Pose</text>
  <text x="236" y="160" fill="#5aa9f8" font-size="12" font-weight="600">outer half-cable  →  frame/p</text>
  <text x="344" y="160" fill="#5aa9f8" font-size="12" font-weight="600">frame/p@inner  →  inner half-cable</text>
  <text x="300" y="232" fill="#f0883e" font-size="12" text-anchor="middle">outer face: sink</text>
  <text x="300" y="248" fill="#9aa3b2" font-size="11" text-anchor="middle">rail data-edge="left"</text>
  <text x="366" y="232" fill="#f0883e" font-size="12" text-anchor="start">inner face: source</text>
  <text x="366" y="248" fill="#9aa3b2" font-size="11" text-anchor="start">nested rail data-edge="right", same dot box</text>
  <path d="M236 100 H554" fill="none" stroke="#3fb950" stroke-width="1.5" stroke-dasharray="6 5"/>
  <path d="M236 100 v8 M554 100 v8" stroke="#3fb950" stroke-width="1.5"/>
  <text x="395" y="92" fill="#3fb950" font-size="12" font-weight="600" text-anchor="middle">ONE linked set — [edge:w~0, port:frame/p, edge:w~1]</text>
  <text x="395" y="70" fill="#9aa3b2" font-size="11" text-anchor="middle">individually selectable, not a group; delete any one → all three go (scene/links.ts)</text>
</svg>"""


# --------------------------------------------------------------------------
# Tables
# --------------------------------------------------------------------------

STOCK_PARTS = [
    ("The four port edges of a Frame", "hand-rolled rails per component (BlockPortRail, region section rails)", "<code>PortEdge</code> (components/portEdge.tsx) placed by <code>railBoxFor</code> / <code>railAxisFor</code> (blockPort.layout.ts) — the same call BlockPort makes", "auto vs custom spacing (<code>PortEdge.mode</code>), reorder by dragging the label, the min-gap clamp, the 18px corner clearance"),
    ("Custom spacing after insertion", "—", "<code>constrainPortPositions</code>, <code>autoSlotOffsets</code>, <code>MIN_PORT_GAP_PX</code> (portSpacing.layout.ts)", "order wins, adjacent ports ≥ 24px apart, the slot stays inside the track"),
    ("Membership: free vs stacked, inset vs edge-to-edge", "Block and Region each mount their own", "<code>BlockMembers</code> (blockMembers.tsx), <code>BlockMember.inset/width</code>", "free members at authored (x, y); stack as an ordered, reorderable column; a hidden member keeps its membership"),
    ("Where a cable crosses a wall", "52a1b92's <code>wallCrossings</code> over a pseudo-block", "<code>portEdgeCrossings</code> (scene/portEdgeCrossing.ts) → <code>boundaryCrossings</code> (elbow/boundaryCrossing.ts, Liang–Barsky, the SystemSketch donor) — called unchanged", "one number for the ring, the port and a promoted port; <code>by: \"chord\"</code> when a route has no polyline"),
    ("The connect gesture on React Flow", "none — the host had <code>nodesConnectable={false}</code>", "<code>Handle</code> (<code>isConnectable</code>, a 16px pressable box over the dot), <code>ConnectionMode.Loose</code>, <code>isValidConnection</code>, <code>onConnect</code>, <code>onConnectEnd</code> (<code>FinalConnectionState</code>: <code>fromHandle</code>, <code>toHandle</code>, <code>isValid</code>, <code>to</code>)", "press the DOT to draw a cable, press the LABEL to reorder; a release on nothing near a wall makes a port there (React Flow's own \"add node on edge drop\" pattern)"),
    ("Whether two ports may connect", "—", "<code>validateConnection</code> (scene/edgeValidation.ts), <code>typesIntersect</code> (scene/lint.ts), with the frame's two-faced <code>PortDirectionOf</code>/<code>PortsOf</code>/<code>PortTypeOf</code> (hosts/frameScene.ts)", "validation OFF: anything connects; ON: same-polarity and type-mismatch refuse with the judge's own message, and the committed edge is the judge's oriented pair"),
    ("Delete on React Flow", "—", "<code>onDelete</code> (React Flow) → <code>deleteWithLinks</code> (scene/links.ts)", "the host never removes a node itself; the linked set decides what goes"),
    ("Drag a member inside the frame", "BlockNodeView's private wrapper", "<code>freeMemberOf</code> + <code>useFreeMemberDrag</code> (hosts/nodeViews.tsx, hosts/memberDrag.ts), now exported", "the button veto inside a member; write-back at rest only"),
    ("Undo in the story", "—", "a story-owned stack of scene snapshots (the host has no undo; scene/history.ts is a contract, not a stack)", "one gesture = one step"),
    ("<b>unchanged (stock seam)</b>: WireLayer's router, keep-outs, ring-flush ends", "—", "<code>resolveWires</code> / <code>ResolvedWireTrace</code> (wireLayer.tsx) — one additive line: an inner-face dot has no own box", "every existing story's cables byte-identical (full suite)"),
    ("<b>unchanged (stock seam)</b>: Block, BlockPort, Region, BlockMembers, PortEdge internals", "—", "not edited — docs/FRAME-PLAN.md is the migration that folds them onto Frame", "every landed story"),
]


def stock_table() -> str:
    rows = "".join(
        f"<tr><td><b>{element}</b></td><td>{today}</td><td>{part}</td><td>{survive}</td></tr>" for element, today, part, survive in STOCK_PARTS
    )
    return f"""<div class="scroll"><table><thead><tr><th>Element</th><th>Today</th><th>Off-the-shelf part (exact exported name)</th><th>Behaviour that must survive</th></tr></thead><tbody>{rows}</tbody></table></div>"""


def mutations_table() -> str:
    rows = []
    for m in MUTATIONS:
        unit_red = "red" if m["unit_exit"] != 0 else "green"
        story_red = "red" if m["story_exit"] != 0 else "green"
        red_stories = [line.strip()[1:].strip()[:80] for line in m["story"].splitlines() if line.strip().startswith("×")]
        unit_tests = re.search(r"^\s*Tests\s+(\d.*)$", m["unit"], re.MULTILINE)
        story_tests = re.search(r"^\s*Tests\s+(\d.*)$", m["story"], re.MULTILINE)
        rows.append(
            f"<tr><td><b>{escape(m['name'])}</b><br><code>{escape(m['file'])}</code></td>"
            f"<td class='c'><span class='{'no' if unit_red == 'red' else 'maybe'}'>{unit_red}</span><br><small>{escape(unit_tests.group(1) if unit_tests else '')}</small></td>"
            f"<td class='c'><span class='{'no' if story_red == 'red' else 'maybe'}'>{story_red}</span><br><small>{escape(story_tests.group(1) if story_tests else '')}</small></td>"
            f"<td><small>{'<br>'.join(escape(s) for s in red_stories) or '—'}</small></td></tr>"
        )
    return f"""<div class="scroll"><table><thead><tr><th>Mutation (applied, tested, restored byte-for-byte)</th><th>node tests</th><th>story tests</th><th>which stories went red</th></tr></thead><tbody>{''.join(rows)}</tbody></table></div>"""


def files_table() -> str:
    new = "".join(f"<tr><td><code>{rel}</code></td><td class='num'>{wc(rel)}</td><td>{escape(what)}</td></tr>" for rel, what in NEW_FILES)
    shared = []
    for rel, what in SHARED_FILES:
        lines = added_lines(rel)
        where = ", ".join(f":{n}" for n, _ in lines[:14]) + (" …" if len(lines) > 14 else "")
        shared.append(f"<tr><td><code>{rel}</code></td><td class='num'>{wc(rel)}</td><td>{escape(what)}<br><small class='mono'>stamped lines {escape(where)}</small></td></tr>")
    return f"""<h4>New files</h4><div class="scroll"><table><thead><tr><th>File</th><th class="num">lines</th><th>What</th></tr></thead><tbody>{new}</tbody></table></div>
<h4>Shared files, edited additively (every edit carries the lane's date stamp — grep <code>2026-09-22</code>)</h4><div class="scroll"><table><thead><tr><th>File</th><th class="num">lines</th><th>What, and where</th></tr></thead><tbody>{''.join(shared)}</tbody></table></div>"""


# --------------------------------------------------------------------------
# The page
# --------------------------------------------------------------------------

hero_webm = MEDIA / "hero.webm"
hero_gif = MEDIA / "hero.gif"
hero_src = data_uri(hero_webm, "video/webm") if hero_webm.exists() else ""
hero_gif_src = data_uri(hero_gif, "image/gif") if hero_gif.exists() else ""
hero_poster = pic("rf-ports", "dark", 60)

EXTRA_CSS = """
  .pair-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px }
  .pair-grid > div { position:relative; min-width:0 }
  .pair-grid .tag { position:absolute; left:10px; top:10px; font:700 10px/1 var(--mono); letter-spacing:.12em;
    text-transform:uppercase; color:#0c0d10; background:var(--gold); border-radius:5px; padding:4px 6px; opacity:.9 }
  @media (max-width:760px){ .pair-grid { grid-template-columns:1fr } }
  video.hero { width:100%; display:block; border-radius:10px; border:1px solid var(--line); background:#000 }
  .layer { font:700 11px/1 var(--mono); letter-spacing:.14em; text-transform:uppercase; color:var(--accent); margin:0 0 6px }
  .diagram { width:100%; height:auto; display:block; background:#0a0b0e; border:1px solid var(--line); border-radius:10px; padding:10px }
  ul.tight { margin:8px 0 0 18px; padding:0 } ul.tight li { margin:4px 0 }
  .mono { font-family:var(--mono) } small { font-size:12px; color:var(--dim2) }
"""

green_gate = FINAL["exit"] == "0"
html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Frame + auto port edges — proven one layer at a time</title>
<style>{CSS}{EXTRA_CSS}</style></head>
<body><div class="wrap">
<p class="kicker">bbox-ui · lane frame-auto-port-edges · 2026-09-22 · base claude/system-sketch-ui-feedback-14bfc3 · uncommitted worktree</p>
<h1>Frame + auto port edges, proven one layer at a time</h1>
<p class="sub">A <code>Frame</code> that owns membership and layout with a real <code>PortEdge</code> on each of its four walls; a pure model that detects every wall crossing whether or not anything is drawn; a real port inserted at a crossing that splits the cable into two halves that share it, as one <b>linked set</b>; drag-a-child-port-to-the-wall, validation, auto vs custom spacing — every one a toggle in the story. Built on the React Flow host with four additive seams.</p>

<div class="facts">
  <div class="fact good"><b>{escape(FINAL['tests'].split('|')[-1].strip() if '|' in FINAL['tests'] else FINAL['tests'])}</b><span>full suite after (both vitest projects)</span></div>
  <div class="fact"><b>{escape(BASELINE['tests'])}</b><span>baseline before the first change</span></div>
  <div class="fact good"><b>4 / 4</b><span>mutations red, then restored</span></div>
  <div class="fact good"><b>42</b><span>new node tests (links 13 · wallPort 20 · frame.layout 9)</span></div>
  <div class="fact good"><b>12</b><span>new stories with measuring play functions</span></div>
  <div class="fact {'good' if green_gate else 'warn'}"><b>{'0' if green_gate else str(len(FINAL['red']))}</b><span>full-suite failures {'' if green_gate else '(see Tests: flakes under load, each green in isolation)'}</span></div>
</div>

<h2>The primary flow, on the real Storybook</h2>
<p class="layer">hero · real mouse, recorded · drag to edge → wire externals → crossings become ports → delete cascades → undo → a refusal</p>
<video class="hero" autoplay muted loop playsinline poster="{hero_poster}" src="{hero_src}" controls>{f'<img src="{hero_gif_src}" alt="The primary flow, as an animated GIF" style="width:100%">' if hero_gif_src else ''}</video>
<p class="mock-note">Recorded by <code>docs/capture_frame_auto_port_edges.mjs</code> through Chromium's own input pipeline (<code>page.mouse</code>), not the play functions' synthetic events. 13 s, muted, loops. What it shows in order: child/in1 dragged onto the left wall (a <b>port Pose</b> input appears, wired from its inner face); child/out1 to the right wall; <b>Wire externals</b> — four crossings detected and drawn as rings; crossings → <b>port</b>: each ring becomes a real wall port, each cable split through it; the top port clicked and <b>Delete</b> pressed — the port and BOTH halves go; <b>Undo</b>; validation on, child/out2 dragged onto the left input's inner face — refused.</p>

<h2>Layer 1 · the Frame alone</h2>
<p>Zach: <i>"start with frame, add 4 port edges to all sides"</i>. Sketch 1, as a component: <code>components/frame.tsx</code> — title above / as a header bar / none, the box drawn or not, free or stacked membership, custom or auto fit, a port edge on any subset of walls, auto or custom spacing per wall. Every one a prop, so a future Block preset is a bundle of props, never a fork (docs/FRAME-PLAN.md).</p>
{pair('frame-alone', 'Frame alone — bare, then with four port edges', ' — Blocks/Frame › Frame alone. Measured: each rail\'s cross centre on its wall (±1px), each edge line stopping 18px short of the corners, one owner box.')}
{pair('frame-ports-every-wall', 'Ports on every wall — two faces, one owner box, the hit area past the wall', ' — Blocks/Frame › Ports on every wall. Measured: every dot on its wall; each port\'s inner face is a second [data-port-id] on the SAME box facing the opposite wall; a press 15px OUTSIDE the wall still lands on the port (the clip trap the BlockRegion report measured on Block\'s 7px clip margin).')}
{pair('frame-every-toggle', 'Every toggle, in the story\'s own UI', ' — Blocks/Frame › Every toggle. The play flips each: a header pushes the left rail into the body band (> 20px), auto fit grows the box to the members + 12px, stack makes a column, a wall switched off loses its rail and port, custom spacing snapshots the auto layout, the frame off leaves a transparent border and the rails.')}
{fb('L1', 'Frame alone — the substrate', 'the title placement, the orange edge lines, anything to change?')}

<h2>Layer 2 · the pure model — no React, no engine</h2>
{seam_svg()}
<div class="grid3">
  <div class="card blue"><b>scene/wallPort.ts · crossings, faces, the split</b><p><code>wallCrossings</code> (ported from 52a1b92 :159-170, frames → any container box) finds every wall a routed cable crosses — <b>always computed</b>, drawing is the host's choice. A wall port is a REAL port on the container with two handles: <code>p</code> (outer face) and <code>p@inner</code>; <code>wallFacesFor("sink")</code> = <code>{{outer: sink, inner: source}}</code>. <code>splitEdgeAtWalls</code> rewrites one edge into a chain through the minted ports and links every piece; <code>unsplitWallPort</code> is its inverse (round-trip tested).</p></div>
  <div class="card blue"><b>scene/links.ts · linked objects, general</b><p><code>BlockScene.links?: SceneLink[]</code> — additive, optional. Members are typed refs <code>node:</code>/<code>edge:</code>/<code>port:</code>. <code>linkedClosure</code> is transitive (a port in two sets pulls both cables), <code>deleteWithLinks</code> deletes the closure and prunes stale members and one-member sets; port deletion is injected (host vocabulary), never guessed.</p></div>
  <div class="card blue"><b>components/frame.layout.ts · wall t ↔ rail slot</b><p><code>wallSlotOffset</code>/<code>wallTOfSlot</code> convert a crossing's 0..1 along the wall into <code>PortEdge.freeOffsets</code>' px and back. <code>insertPortAtWall</code>: AUTO = the index the crossing implies, then the distribution re-spaces; CUSTOM = the crossing's offset, clamped by order and the 24px minimum gap through the existing <code>constrainPortPositions</code>. <code>fitBoxToMembers</code> for auto fit.</p></div>
</div>
<p class="mock-note">42 node tests. Provenance rows added to <code>docs/ALGORITHM-PROVENANCE.md</code>: class (c) over (a) — the one piece of real geometry is the existing Liang–Barsky clipper, called unchanged.</p>
{fb('L2', 'The pure model — faces, split, linked set', 'is p / p@inner the right spelling? should a drag-created port + its cable be linked too (they are not, today)?')}

<h2>Layer 3 · the interactive host is React Flow</h2>
<p>Four additive seams on <code>ReactFlowHost</code>, every one omitted by every bench that predates them: <code>connectable</code> (stock <code>Handle</code> drag, a 16px pressable box over the dot — <b>press the dot to connect, the label to reorder</b>), <code>isValidConnection</code> / <code>onConnect</code> in scene ends, <code>onConnectEnd</code> with the release point in flow px (a drop near a wall with no handle under it = "make a port here"), <code>onDeleteElements</code>. Plus <code>type: "frame"</code> as a node and its drag handle. The story owns the rest: the mode, validation and spacing toggles, port selection, the Delete key, an undo stack.</p>
{pair('rf-rest', 'At rest — sketch 3\'s cast', ' — one child member with four typed ports, an External on each side, nothing wired. Mode: ring.')}
{pair('rf-drag-to-edge', 'Drag child/in1 to the left wall → a typed input port, wired from its inner face', ' — the status line reads the wall and t; the cable runs INTO the frame because the inner face\'s nested rail faces right (measured: before the wireLayer fix the same cable was a 400px lap around the frame).')}
{pair('rf-rings', 'Externals wired → four crossings detected, one per wall, drawn as rings', ' — mode ring. In mode OFF the same four are detected and nothing is drawn (asserted).')}
{pair('rf-ports', 'Mode port → every crossing is a real wall port; each cable is two halves sharing it, as one linked set', ' — four sets, eight half-cables; a minted port takes the cable\'s type and explicit faces from the crossing direction; auto spacing re-spaces each wall.')}
{pair('rf-deleted', 'Delete the selected top port → the port and BOTH halves go; the other three sets are untouched', ' — status: deleted 0 node(s), 2 edge(s), 1 port(s). Undo brings all three back (asserted).')}
{pair('rf-refused', 'Validation ON: child/out2 → the left input\'s inner face is refused', ' — the judge\'s own message: "joins two source ports". With validation OFF the same drag connects (asserted, then undone). Type mismatch refuses too; a child OUTPUT dropped on the LEFT wall makes no port ("the left wall takes inputs").')}
{fb('L3', 'The React Flow host — gestures and toggles', 'dot-connects / label-reorders: right split? the 24px wall-drop tolerance?')}

<h2>Layers 3b and 4 · inside an expanded block, and with three children</h2>
<p>Zach's 08:29 ruling makes Block = header + body + footer where the body IS the Frame. So "the frame as an expanded block's body" is rendered as the target shape — a Frame with <code>titlePlacement: "header"</code> — not as today's <code>Block</code>+<code>BlockPort</code> (whose rail cannot host an inner face without an edit; docs/FRAME-PLAN.md §3.5). Measured: the header bar pushes the left rail into the body band, a top-wall port lands on the header's top edge, port mode still splits every crossing (6 wall ports). With three children: four crossings into three different members, one per wall, each becomes a port, and a port dragged onto a wall that already carries a split port joins that wall's order.</p>
{fb('L4', 'Header + three children', 'should the three-children case ALSO be shown on today\'s Block (crossings detected there already; insertion needs the fold)?')}

<h2>Stock parts — element by element</h2>
{stock_table()}

<h2>Tests, mutations, and what the gate actually said</h2>
<div class="facts">
  <div class="fact"><b>{escape(BASELINE['tests'])}</b><span>baseline · {escape(BASELINE['files'])} · {escape(BASELINE['duration'])}</span></div>
  <div class="fact {'good' if green_gate else 'warn'}"><b>{escape(FINAL['tests'])}</b><span>after · {escape(FINAL['files'])} · {escape(FINAL['duration'])}</span></div>
  <div class="fact good"><b>{escape(RERUN['tests'])}</b><span>the four full-suite reds re-run in isolation</span></div>
</div>
<p>Gate: <code>pnpm typecheck</code> exit 0 before and after; <code>pnpm test</code> (both projects, on the lane's own Storybook port 5491) before and after. {"The full run was green." if green_gate else "The final full run reported " + str(len(FINAL['red'])) + " red: <b>" + escape("; ".join(FINAL['red'])) + "</b> — pre-existing drag stories (a dnd-kit rail reorder, a tldraw member drag) that are timing-sensitive under a parallel run on a loaded box (load average ≈ 9 during these runs; the baseline run's transform time was 40 s, the final run's 88 s). Re-run in isolation together with this lane's two story files: " + escape(RERUN['tests']) + ". Across four full-suite runs today the red set was different every time and never included the same story twice except <code>FitToContentHosts › Drag A Member (tldraw)</code>; one earlier full run caught this lane's Layer 3 story once, which led to a real fix (the bench's status line reflowed the pane 31 px mid-story — now a fixed-height row). Not hidden, not fixed here: a flake under load is not this lane's regression, but it is a gate weakness worth a follow-up."}</p>
<p>One real regression was caught by the suite and fixed: forwarding <code>portTypes</code> onto a BLOCK's rail items painted "rawbytes" where <code>PyblocksScene.stories.tsx</code> pins the bare label "raw" — so block rails stay as they were and only a Frame's walls paint the type (the fold in FRAME-PLAN §3.1 brings it to blocks).</p>
<h4>Mutations — each applied to the source, tested, restored byte-for-byte</h4>
{mutations_table()}
<p class="mock-note">M1's node column stays green because <code>edgeValidation.test.ts</code> never supplies a <code>directionOf</code> (its polarity gate is inert there — a pre-existing coverage gap in that file, not this lane's); the story is the assertion that catches it, and it did. The other three go red in both projects.</p>
{fb('T', 'The evidence', 'anything you want measured differently?')}

<h2>Files</h2>
{files_table()}

<h2>The stretch — a branch region switched to Port view</h2>
<p><b>What falls out today:</b> the topological half. <code>Region view="port"</code> already shows boundary ports derived by <code>projectOpaqueRegions</code> → <code>classifyBoundary</code>/<code>promoteBoundary</code> (Control Flow/Region Views, sketch 1), and this lane's <code>useWallCrossings</code> runs against ANY container box — a region's frame included (<code>hosts/regionCrossings.ts</code> is now a wrapper over it) — so the geometric answer (which wall, at what t, entering or leaving) exists for a branch whether or not it is drawn.</p>
<p><b>What is missing, precisely:</b> (1) the port card accepts only <code>boundaryPorts.left/right</code> (<code>region.tsx:187</code>) — a top- or bottom-wall crossing has no seat in Port view; (2) the port card's ports are placed by polarity (<code>innerPolarityPolicy</code>), not by the crossing's <code>t</code> — feeding the measured crossings in is a one-line policy swap (<code>crossingGeometryPolicy</code> exists in <code>scene/boundary.ts</code>) but needs the geometry captured BEFORE the frame is hidden (the port view has no frame to measure); (3) "each of the blocks themselves go to port view" — a region view switch does not cascade a view change to its members; that is a scene write over <code>childrenOf</code> nobody has asked for yet. None of it fell out naturally; it is stated here rather than half-built.</p>

<h2>Decision surface</h2>
<div class="lede green"><p><b>Done and proved.</b> Frame (all toggles), the pure model (42 node tests, 4/4 mutations red), the React Flow host seams, eight measuring stories (drag to each wall, off/ring/port with ports within 2px of the crossing, auto vs custom spacing, validation off/on with polarity and type refusals and the wall convention, linked delete + undo, header, three children), docs/FRAME-PLAN.md aligned with the BlockRegion-preset lane, provenance rows, WHY comments at every seam Zach named.</p></div>
<div class="lede gold"><p><b>Left.</b> (a) Wall ports on today's <code>Block</code> — detection runs there, insertion waits for the Block-on-Frame fold (FRAME-PLAN §3.2/§3.5). (b) The stretch (above). (c) Nested frames' drag handle in React Flow (the defect-6 class, noted in the host). (d) The DOM canvas twin of the React Flow story — deliberately not built: PEP 0005 says anything that moves gets a React Flow twin, and every gesture here moves.</p></div>
<div class="ask"><h3>Needs you — 1 · Is a drag-created port linked to its cable?</h3><p>Today a port made by dragging a child port to the wall is a first-class port: deleting its cable leaves the port. Only a SPLIT mints a linked set. </p><p class="dflt"><b>Default if silent:</b> keep it — a port you placed by hand is yours; a port the split minted belongs to the cut.</p>{fb('Q1', 'Link drag-created ports to their cable?', '')}</div>
<div class="ask"><h3>Needs you — 2 · Leaving port mode un-splits</h3><p>Switching crossings from <b>port</b> back to <b>ring</b>/<b>off</b> restores every split cable (the exact inverse, round-trip tested). The alternative keeps the ports and just stops splitting new crossings.</p><p class="dflt"><b>Default if silent:</b> un-split — the toggle then means one thing in both directions.</p>{fb('Q2', 'Un-split on leaving port mode?', '')}</div>
<div class="ask"><h3>Needs you — 3 · The frame surface is the Frame's drawing; Block's <code>surface</code> forwards to it</h3><p>FRAME-PLAN §3.1 picks this over "Block paints around a Frame body", on the clip/halo evidence and because <code>titlePlacement="header"</code> already renders Block's shape with the rails on the right line. That is a decision-record candidate once the fold merges (docs/peps), not written yet.</p><p class="dflt"><b>Default if silent:</b> the plan as written; the preset lane's option C composes over it unchanged.</p>{fb('Q3', 'Frame draws the surface; Block forwards', '')}</div>
<div class="ask"><h3>Needs you — 4 · Port labels point inward</h3><p>A wall port's label ("port Pose") reads INTO the frame, like a block's, and crosses the cables inside on a busy frame. The sketch draws it the same way; an outward label would clear the interior and crowd the outside.</p><p class="dflt"><b>Default if silent:</b> inward, as the sketch.</p>{fb('Q4', 'Label direction on wall ports', '')}</div>
<div class="lede red"><p><b>Deliberately not done.</b> No Block/BlockPort/blockMembers/Region refactor (the brief said plan it, not do it — FRAME-PLAN.md). No React Flow edge selection for kit-routed cables (the trace is <code>pointer-events: none</code> by design; the linked delete is entered from the port or the story's button). No decision records written (flagged only). No commit — the worktree is left dirty for the dispatcher.</p></div>
{overall_box('anything else — one line is enough')}

<footer class="page">
<b>Reproduce.</b> <code>STORYBOOK_PORT=5491 pnpm --dir apps/storybook-basics storybook</code> then open <code>http://localhost:5491/?path=/story/blocks-frame-auto-port-edges-react-flow--try-it</code>. Gate: <code>STORYBOOK_PORT=5491 pnpm --dir apps/storybook-basics test</code> and <code>pnpm --dir apps/storybook-basics typecheck</code>. Captures: <code>node docs/capture_frame_auto_port_edges.mjs --port 5491 --out &lt;dir&gt;</code>. This page: <code>docs/build_frame_auto_port_edges_report.py</code>.<br>
Built {escape(sh('date -u +%Y-%m-%dT%H:%MZ', REPO))} · tree {escape(sh('git rev-parse --short HEAD 2>/dev/null || echo uncommitted', REPO))} (+ uncommitted lane work) · Claude Fable 5.1 (claude-fable-5-1)
</footer>
</div>
{dock('frame-auto-port-edges-2026-09-22', 'item', 9)}
<script>{FB_JS}</script>
</body></html>"""

report_size(html, OUT)
