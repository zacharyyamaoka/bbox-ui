#!/usr/bin/env python3
"""
Build the "Source code view — the answers" report.

Second pass on the Sep 18 §Source Code View thread. Zach ruled: grain 1 is the
ceiling (grain 2/3 "start to feel like Enso" — exactly what he does not want),
P5 is out, P3 is loved, P1 is how you implement it, and P3-vs-P4 is "really the
discussion" — with a live worry that supporting both "gets messy". He also
raised pseudo-code blocks, asked where the non-source data lives, and ruled the
backend belongs in pyblocks rather than stock bbox-ui.

So this is an ANSWER report, not another babble. Its evidence is a real
`python3 -m pyblocks analyze` run executed at build time, plus the actual
record definitions read off /home/bam/pyblocks — because the load-bearing
finding is that P4 is already shipped in the file format and P3 is one optional
field away from it.

    python3 docs/build_source_code_view_answers.py
"""
from __future__ import annotations

import base64
import io
import json
import pathlib
import re
import subprocess
import sys
from html import escape
from urllib.parse import quote

from PIL import Image, ImageChops

REPO = pathlib.Path("/home/bam/bbox-ui")
PYBLOCKS = pathlib.Path("/home/bam/pyblocks")
SHOTS = REPO / "reports/media/shots-source-code-view"
OUT = REPO / "reports/media/source-code-view-answers-2026-09-18.html"
SCRATCH = pathlib.Path(
    "/tmp/claude-1000/-home-bam-bbox-ui--claude-worktrees-report-visuals-media-356db5"
    "/d353f52a-bd96-4002-997d-2890ce41a585/scratchpad"
)
PRIOR = "file:///home/bam/bbox-ui/reports/media/source-code-view-2026-09-18.html"
NOTEBOOK = "file:///home/bam/bbox-ui/reports/canvas-notebook-2026-09-18.html"


def sh(cmd: str, cwd: pathlib.Path) -> str:
    return subprocess.run(
        cmd, shell=True, cwd=cwd, capture_output=True, text=True
    ).stdout.strip()


def shot(name: str, quality: int = 76) -> str:
    path = SHOTS / f"{name}.png"
    if not path.exists():
        raise SystemExit(f"missing capture: {path}")
    im = Image.open(path).convert("RGB")
    bg = Image.new("RGB", im.size, im.getpixel((0, 0)))
    box = ImageChops.difference(im, bg).getbbox()
    if box:
        pad = 10
        im = im.crop((max(0, box[0] - pad), max(0, box[1] - pad),
                      min(im.width, box[2] + pad), min(im.height, box[3] + pad)))
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=quality, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


# ---------------------------------------------------------------------------
# THE MEASUREMENT. The central claim of this page -- "pyblocks hands you the
# grain-1 index for free, but its rendered projection is grain 2" -- is not
# argued, it is run. A 31-line fixture with four definitions goes through the
# real CLI at build time and the numbers below are whatever it actually said.
# ---------------------------------------------------------------------------
FIXTURE = '''"""Stereo front end."""
from __future__ import annotations
from typing import NamedTuple

CALIB = load_calibration("cam.yaml")


class EstimatePairOut(NamedTuple):
    depth: Depth
    confidence: float


def rectify(left: Frame, right: Frame) -> Rectified:
    # deliberately fiddly
    for i in range(3):
        left = warp(left, CALIB[i])
    return Rectified(left, right)


def estimate_pair(left: Frame, right: Frame) -> EstimatePairOut:
    rectified = rectify(left, right)
    disparity = match(rectified)
    return EstimatePairOut(depth=to_depth(disparity), confidence=score(disparity))


class Pipeline:
    def __init__(self, k: int) -> None:
        self.k = k

    def run(self, left, right):
        return estimate_pair(left, right)
'''

SCRATCH.mkdir(parents=True, exist_ok=True)
fixture_path = SCRATCH / "stereo_fixture.py"
fixture_path.write_text(FIXTURE)

raw = subprocess.run(
    ["python3", "-m", "pyblocks", "analyze", "--view", "module", str(fixture_path)],
    cwd=PYBLOCKS, capture_output=True, text=True,
)
if raw.returncode != 0:
    raise SystemExit(f"pyblocks analyze failed:\n{raw.stderr[-2000:]}")
ANALYSIS = json.loads(raw.stdout)

VIEWS = ANALYSIS["views"]
CONTENT = ANALYSIS["view"]["content"]
COVERAGE = ANALYSIS["coverage"]

def _construct(v):
    return (v.get("metadata", {}).get("pyblocks.python", {}) or {}).get("construct", "?")

VIEW_ROWS = "\n".join(
    f"<tr><td><code>{escape(v['title'])}</code></td><td>{_construct(v)}</td>"
    f"<td class=\"num\">{v['sourceRef']['span']['startLine']}&ndash;"
    f"{v['sourceRef']['span']['endLine']}</td>"
    f"<td><code>{escape((v.get('metadata',{}).get('pyblocks.python',{}) or {}).get('signature',''))}</code></td></tr>"
    for v in VIEWS
)

BLOCK_KINDS: dict[str, int] = {}
for b in CONTENT["blocks"]:
    kind = b["id"].split("/", 1)[1].split("@", 1)[0]
    BLOCK_KINDS[kind] = BLOCK_KINDS.get(kind, 0) + 1
KIND_ROWS = "\n".join(
    f"<tr><td><code>{k}</code></td><td class=\"num\">{n}</td>"
    f"<td>{'a definition &mdash; what you want' if k.startswith('region:') else 'a statement or expression &mdash; grain 2'}</td></tr>"
    for k, n in sorted(BLOCK_KINDS.items(), key=lambda kv: (-kv[1], kv[0]))
)

DEFINITION_BLOCKS = sum(n for k, n in BLOCK_KINDS.items() if k.startswith("region:"))
GRAIN2_BLOCKS = len(CONTENT["blocks"]) - DEFINITION_BLOCKS
N_DEFS = len([v for v in VIEWS if _construct(v) != "module"])

# The ports pyblocks actually put on the definition regions -- the honest
# measure of "does it already give me the call graph". (It gives free-variable
# capture; it does not give definition-to-definition calls.)
REGION_PORTS = {
    b["id"].split("/", 1)[1]: [p.get("id") for p in b.get("ports", [])]
    for b in CONTENT["blocks"]
    if b["id"].split("/", 1)[1].startswith("region:")
}
PORT_ROWS = "\n".join(
    f"<tr><td><code>{k}</code></td><td>"
    + (" ".join(f"<code>{p}</code>" for p in v) if v else "<i>none</i>")
    + "</td></tr>"
    for k, v in REGION_PORTS.items()
)

TERMINAL = (
    "$ python3 -m pyblocks analyze --view module stereo.py\n"
    f"\n  views[]            {len(VIEWS)}   the definition tree  "
    f"(1 module + {N_DEFS} definitions)\n"
    f"  view.blocks        {len(CONTENT['blocks'])}  of which {DEFINITION_BLOCKS} are definitions "
    f"and {GRAIN2_BLOCKS} are statements/expressions\n"
    f"  view.edges         {len(CONTENT['edges'])}\n"
    f"  coverage           {COVERAGE['representedPercent']:.0f}% represented, "
    f"{COVERAGE['semanticPercent']:.0f}% semantic, "
    f"{COVERAGE['opaqueLines']} opaque lines of {COVERAGE['totalLines']}\n"
)

FACTS = {
    "views": str(len(VIEWS)),
    "defs": str(N_DEFS),
    "blocks": str(len(CONTENT["blocks"])),
    "edges": str(len(CONTENT["edges"])),
    "grain2": str(GRAIN2_BLOCKS),
    "codeblock_fields": "3",
    "languages": sh("grep -m1 'CODE_BLOCK_LANGUAGES = ' pyblocks/systemsketch.py", PYBLOCKS),
    "systemsketch_py": sh("wc -l < pyblocks/systemsketch.py", PYBLOCKS),
    "sketch_store": sh("wc -l < pyblocks/sketch_store.py", PYBLOCKS),
    "head": sh("git rev-parse --short HEAD", REPO),
    "pbhead": sh("git rev-parse --short HEAD", PYBLOCKS),
}

CODEBLOCK_SRC = sh(
    "grep -n -A7 'def _is_code_block_payload' pyblocks/systemsketch.py", PYBLOCKS
)


# ---------------------------------------------------------------------------
CSS = """
  :root {
    --bg:#0e0f12; --panel:#15171c; --panel2:#1b1e25; --line:#282d38; --line2:#343b49;
    --fg:#e6e8ee; --dim:#9aa3b2; --dim2:#6b7383;
    --accent:#f0883e; --accent2:#5aa9f8; --ok:#3fb950; --warn:#e5534b; --gold:#e8c06a;
    --mono: ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  }
  * { box-sizing:border-box }
  body { margin:0; background:var(--bg); color:var(--fg);
    font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif; }
  .wrap { max-width:1080px; margin:0 auto; padding:48px 24px 140px }
  h1 { font-size:36px; line-height:1.12; margin:0 0 8px; letter-spacing:-.024em }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.14em; color:var(--dim2);
       margin:66px 0 18px; font-weight:600 }
  h3.q { font-size:21px; margin:0 0 4px; letter-spacing:-.015em }
  .sub { color:var(--dim); font-size:18px; margin:0 0 26px; line-height:1.5 }
  .kicker { font:600 11.5px/1 var(--mono); letter-spacing:.14em; text-transform:uppercase;
    color:var(--dim2); margin:0 0 18px }
  a { color:var(--accent2) }
  code { font-family:var(--mono); font-size:.9em; background:#0a0b0e; border:1px solid #23272f;
    border-radius:4px; padding:1px 5px }
  p { margin:0 0 12px }

  .answers { counter-reset:a; margin:26px 0 }
  .answer { background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--accent);
    border-radius:10px; padding:18px 22px 18px 58px; margin:0 0 12px; position:relative }
  .answer::before { counter-increment:a; content:counter(a);
    position:absolute; left:19px; top:18px; width:24px; height:24px; border-radius:6px;
    background:var(--accent); color:#0c0d10; font:800 13px/24px var(--mono); text-align:center }
  .answer b.h { display:block; font-size:16.5px; margin-bottom:6px; letter-spacing:-.01em }
  .answer p:last-child { margin:0 }
  .answer.blue { border-left-color:var(--accent2) } .answer.blue::before { background:var(--accent2) }

  .lede { background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--accent2);
    border-radius:10px; padding:18px 22px; margin:22px 0 }
  .lede p:last-child { margin:0 }
  .lede.gold { border-left-color:var(--gold) }
  .lede.green { border-left-color:var(--ok) }
  .lede.red { border-left-color:var(--warn) }

  .facts { display:grid; grid-template-columns:repeat(auto-fit,minmax(118px,1fr)); gap:10px; margin:24px 0 6px }
  .fact { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:13px 15px }
  .fact b { display:block; font-size:25px; font-variant-numeric:tabular-nums; letter-spacing:-.02em }
  .fact span { font-size:11px; color:var(--dim2); text-transform:uppercase; letter-spacing:.07em;
    line-height:1.35; display:block; margin-top:3px }
  .fact.good b { color:var(--ok) } .fact.bad b { color:var(--warn) }

  table { width:100%; border-collapse:collapse; margin:14px 0; font-size:13.5px }
  th { text-align:left; font-size:10.5px; text-transform:uppercase; letter-spacing:.09em;
    color:var(--dim2); font-weight:600; padding:8px 10px; border-bottom:1px solid var(--line2) }
  td { padding:9px 10px; border-bottom:1px solid #1e222a; vertical-align:top; color:var(--dim) }
  td b, td strong { color:var(--fg); font-weight:600 }
  tr:last-child td { border-bottom:0 }
  td.num { font-variant-numeric:tabular-nums; text-align:right; font-family:var(--mono); color:var(--fg) }
  tr.good td { background:#101b13 } tr.bad td { background:#1c1213 }
  tr.dim td { color:var(--dim2) }

  pre { margin:0; font:12.5px/1.65 var(--mono); color:#c8cede; white-space:pre;
    overflow-x:auto; background:#08090b; border:1px solid #1d212a; border-radius:8px; padding:13px 15px }
  pre .k { color:#c98bdb } pre .f { color:#79b8ff } pre .s { color:#9ecbff }
  pre .c { color:#5c6370 } pre .t { color:#5ecf9a } pre .g { color:#3b414c }
  pre .add { color:var(--ok) } pre .del { color:var(--warn) }
  pre.term { background:#060709; border-color:#1a1e26 }
  pre.term .p { color:var(--ok) } pre.term .n { color:var(--accent) }

  .mock { margin:16px 0 0; background:#0a0b0e; border:1px dashed #333a47; border-radius:11px; padding:18px }
  .mock-label { font:700 10px/1 var(--mono); color:var(--accent); text-transform:uppercase;
    letter-spacing:.14em; margin-bottom:14px }
  .mock-note { margin:14px 0 0; font-size:12.5px; color:var(--dim2); line-height:1.55 }

  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:14px }
  .grid3 { display:grid; grid-template-columns:repeat(3,1fr); gap:12px }
  @media (max-width:760px){ .grid2,.grid3 { grid-template-columns:1fr } }
  .card { background:var(--panel2); border:1px solid var(--line); border-radius:9px; padding:13px 15px }
  .card > b { display:block; font-size:12px; text-transform:uppercase; letter-spacing:.08em;
    color:var(--dim2); margin-bottom:6px }
  .card.ok > b { color:var(--ok) } .card.no > b { color:var(--warn) }
  .card p { margin:0; font-size:13.5px; color:var(--dim) }
  .card p + p { margin-top:7px }
  .card p b { color:var(--fg) }

  /* the definition tree */
  .tree { font:12.5px/1.9 var(--mono) }
  .tree .row { display:flex; align-items:center; gap:9px }
  .tree .rail { color:#3b414c; white-space:pre }
  .node { border:1px solid #3a4250; border-radius:7px; padding:3px 10px; background:#171a20;
    color:#dfe4ee; font-weight:600; position:relative }
  .node small { color:var(--dim2); font-weight:400; margin-left:8px }
  .node.mod { border-color:var(--accent); background:#1d1710 }
  .node.cls { border-color:#6a5bbd; background:#181626 }
  .node.fn  { border-color:#2f6f4a; background:#111c16 }
  .node.op  { border-style:dashed; border-color:#3b414c; background:#0d0f13; color:var(--dim2);
    font-weight:400 }
  .cut { display:flex; align-items:center; gap:12px; margin:24px 0 14px }
  .cut::before, .cut::after { content:""; flex:1; border-top:1px dashed var(--warn) }
  .cut span { flex:0 0 auto;
    font:700 10px/1 var(--mono); letter-spacing:.12em; text-transform:uppercase; color:var(--warn) }

  /* the record */
  .rec { font:12.5px/1.8 var(--mono); background:#08090b; border:1px solid #1d212a;
    border-radius:9px; padding:14px 16px }
  .rec .fld { display:flex; gap:10px }
  .rec .fld .nm { color:#79b8ff; min-width:92px }
  .rec .fld .ty { color:var(--dim2) }
  .rec .fld.new { background:#101b13; margin:0 -8px; padding:2px 8px; border-radius:5px }
  .rec .fld.new .nm { color:var(--ok) }
  .rec .hd { color:var(--dim2); margin-bottom:6px }

  .states { display:grid; grid-template-columns:repeat(4,1fr); gap:10px }
  .state { border:1px solid var(--line); border-radius:9px; padding:12px; background:#101318 }
  .state .t { font:700 10px/1.3 var(--mono); letter-spacing:.09em; text-transform:uppercase;
    margin-bottom:7px }
  .state.s1 { border-color:#1e3d26 } .state.s1 .t { color:var(--ok) }
  .state.s2 { border-color:#4a3524 } .state.s2 .t { color:var(--accent) }
  .state.s3 { border-color:#4a2424 } .state.s3 .t { color:var(--warn) }
  .state.s4 { border-color:#24384a } .state.s4 .t { color:var(--accent2) }
  .state p { font-size:12px; color:var(--dim); margin:0 }
  .state p + p { margin-top:6px }
  @media (max-width:760px){ .states { grid-template-columns:1fr 1fr } }

  /* file layout */
  .files { font:12.5px/1.85 var(--mono) }
  .files .f { display:flex; align-items:baseline; gap:10px }
  .files .nm { color:#dfe4ee } .files .nm.owned { color:var(--ok) }
  .files .nm.src { color:var(--accent2) }
  .files .cm { color:var(--dim2) }
  .files .rail { color:#3b414c; white-space:pre }

  figure { margin:16px 0 0 }
  figure img { width:100%; display:block; border-radius:9px; border:1px solid var(--line); background:#0a0b0e }
  figcaption { font-size:12.5px; color:var(--dim2); margin-top:9px; line-height:1.55 }
  figcaption b { color:var(--fg); display:block; font-size:13px; margin-bottom:2px }
  .shots { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:18px }
  .shots figure img { max-height:280px; object-fit:contain; object-position:left top; padding:6px }

  .hidden { display:none !important }
  .fb { display:flex; align-items:center; gap:7px; flex-wrap:wrap;
    border-top:1px solid #1e222a; margin-top:16px; padding-top:12px }
  .fb .lbl { font-size:10px; text-transform:uppercase; letter-spacing:.09em; color:var(--dim2);
    font-weight:700; margin-right:2px }
  .fb button { font:600 12px/1 inherit; font-family:inherit; cursor:pointer;
    background:#1a1e26; color:var(--dim); border:1px solid var(--line2); border-radius:7px; padding:6px 10px }
  .fb button:hover { color:var(--fg); border-color:#4e5768 }
  .fb button[aria-pressed="true"] { color:#0c0d10; font-weight:800 }
  .fb .yes[aria-pressed="true"] { background:var(--ok); border-color:var(--ok) }
  .fb .no[aria-pressed="true"]  { background:var(--warn); border-color:var(--warn) }
  .fb .star[aria-pressed="true"]{ background:var(--accent); border-color:var(--accent) }
  .fb .dyes[aria-pressed="true"]{ background:var(--accent2); border-color:var(--accent2) }
  .fb .dno[aria-pressed="true"] { background:#a2564f; border-color:#a2564f; color:#fff }
  .fb .sep { width:1px; align-self:stretch; background:var(--line); margin:0 4px }
  .fb .note-btn[aria-pressed="true"] { background:#2a2412; border-color:var(--gold); color:var(--gold) }
  .fb textarea { flex:1 1 100%; margin-top:8px; min-height:62px; resize:vertical;
    background:#08090b; color:var(--fg); border:1px solid var(--line2); border-radius:8px;
    padding:9px 11px; font:13px/1.55 var(--mono) }
  .fb textarea:focus { outline:none; border-color:var(--accent) }
  .fb textarea::placeholder { color:#4e5768 }

  .ask { background:var(--panel); border:1px solid var(--line); border-radius:11px;
    padding:18px 20px; margin:0 0 14px }
  .ask h3 { margin:0 0 6px; font-size:16.5px }
  .ask .dflt { font-size:13px; color:var(--dim); margin:10px 0 0;
    border-left:2px solid var(--gold); padding-left:11px }
  .ask .dflt b { color:var(--gold) }

  .dock { position:fixed; right:18px; bottom:18px; z-index:60; display:flex; gap:9px;
    align-items:center; background:rgba(21,23,28,.96); backdrop-filter:blur(8px);
    border:1px solid var(--line2); border-radius:12px; padding:10px 12px; box-shadow:0 12px 40px #000a }
  .dock .tally { font:600 12px var(--mono); color:var(--dim) }
  .dock .tally b { color:var(--fg) }
  .dock button { font:700 12.5px/1 inherit; font-family:inherit; cursor:pointer;
    border-radius:8px; padding:9px 13px; border:1px solid var(--line2); background:#232833; color:var(--fg) }
  .dock button.go { background:var(--accent); border-color:var(--accent); color:#0c0d10 }
  .dock button:disabled { opacity:.4; cursor:default }

  .sheet { position:fixed; inset:0; z-index:80; background:#07080acc; backdrop-filter:blur(4px);
    display:none; align-items:center; justify-content:center; padding:32px }
  .sheet.open { display:flex }
  .sheet .inner { background:var(--panel); border:1px solid var(--line2); border-radius:14px;
    width:min(860px,100%); max-height:100%; display:flex; flex-direction:column; overflow:hidden }
  .sheet header { padding:16px 20px 12px; border-bottom:1px solid var(--line);
    display:flex; align-items:center; gap:12px }
  .sheet header h3 { margin:0; font-size:16px }
  .sheet header .sp, .sheet footer .sp { margin-left:auto }
  .sheet textarea { flex:1; min-height:340px; margin:0; border:0; border-radius:0;
    background:#08090b; color:var(--fg); padding:16px 20px; font:12.5px/1.6 var(--mono); resize:none }
  .sheet textarea:focus { outline:none }
  .sheet footer { padding:12px 20px; border-top:1px solid var(--line); color:var(--dim2);
    font-size:12px; display:flex; align-items:center; gap:12px }
  .sheet button { font:700 12.5px/1 inherit; font-family:inherit; cursor:pointer;
    border-radius:8px; padding:9px 13px; border:1px solid var(--line2); background:#232833; color:var(--fg) }
  .sheet button.go { background:var(--ok); border-color:var(--ok); color:#0c0d10 }

  footer.page { margin-top:70px; padding-top:22px; border-top:1px solid var(--line);
    font-size:12.5px; color:var(--dim2); line-height:1.7 }
  footer.page b { color:var(--dim) }
"""

FB_SCRIPT = (REPO / ".claude/worktrees/report-visuals-media-356db5/docs/_fb_script.js")
# The feedback dock is the same proven script as the first report; keep one copy.
FB_JS = r"""
(function(){
  var dock = document.querySelector('.dock');
  var REPORT = dock.dataset.report || 'this report';
  var NOUN = dock.dataset.noun || 'item';
  var TOTAL = dock.dataset.total || '';
  var KEY = 'bbox-report-feedback:' + REPORT;
  var state = {};
  var overall = document.getElementById('fb-overall');
  function load(){ try { var raw = localStorage.getItem(KEY); if (!raw) return;
      var saved = JSON.parse(raw); state = saved.items || {};
      if (saved.overall) overall.value = saved.overall; } catch (e) {} }
  function save(){ try { localStorage.setItem(KEY, JSON.stringify({items: state, overall: overall.value})); }
    catch (e) {} }
  function slot(rank, title){ if (!state[rank]) state[rank] = {v:'', d:'', note:'', title:title};
    state[rank].title = title; return state[rank]; }
  Array.prototype.forEach.call(document.querySelectorAll('.fb'), function(strip){
    var rank = strip.dataset.rank, title = strip.dataset.title;
    var ta = strip.querySelector('textarea');
    function paint(){
      var st = state[rank] || {};
      Array.prototype.forEach.call(strip.querySelectorAll('button[data-fb]'), function(b){
        var k = b.dataset.fb;
        var on = (k === 'yes' || k === 'no' || k === 'star') ? st.v === k
               : (k === 'dyes' || k === 'dno') ? st.d === k
               : !ta.classList.contains('hidden') || !!(st.note || '').trim();
        b.setAttribute('aria-pressed', String(!!on));
      });
    }
    Array.prototype.forEach.call(strip.querySelectorAll('button[data-fb]'), function(b){
      b.addEventListener('click', function(){
        var k = b.dataset.fb, st = slot(rank, title);
        if (k === 'note'){ ta.classList.toggle('hidden');
          if (!ta.classList.contains('hidden')) ta.focus(); }
        else if (k === 'dyes' || k === 'dno'){ st.d = st.d === k ? '' : k; }
        else { st.v = st.v === k ? '' : k; }
        save(); paint(); tally();
      });
    });
    ta.addEventListener('input', function(){ slot(rank, title).note = ta.value; save(); tally(); });
    var st = state[rank];
    if (st){ ta.value = st.note || ''; if (ta.value.trim()) ta.classList.remove('hidden'); }
    paint();
  });
  overall.addEventListener('input', function(){ save(); tally(); });
  function marked(){ return Object.keys(state).filter(function(r){
      var s = state[r]; return s && (s.v || s.d || (s.note || '').trim()); }).sort(); }
  function tally(){
    var m = marked(), notes = m.filter(function(r){ return (state[r].note||'').trim(); }).length;
    var el = document.getElementById('fb-tally');
    var extra = overall.value.trim() ? ' + overall' : '';
    el.innerHTML = m.length ? '<b>' + m.length + '</b> marked &middot; <b>' + notes + '</b> noted' + extra
      : (extra ? 'overall note only' : 'nothing marked yet');
    document.getElementById('fb-copy').disabled = !m.length && !overall.value.trim();
  }
  var FACE = {yes:'\u{1F44D}', no:'\u{1F44E}', star:'★'};
  function markdown(){
    var m = marked(); var out = ['# Feedback — ' + REPORT, ''];
    if (overall.value.trim()){ out.push('## Overall', '', overall.value.trim(), ''); }
    if (m.length){ out.push('## Per ' + NOUN, '');
      m.forEach(function(r){ var s = state[r], tags = [];
        if (s.v) tags.push(FACE[s.v]);
        if (s.d === 'dyes') tags.push('drawing \u{1F44D}');
        if (s.d === 'dno')  tags.push('drawing \u{1F44E}');
        out.push('- ' + (tags.length ? '[' + tags.join(' ') + '] ' : '') + '**' + r + ' ' + s.title + '**');
        var n = (s.note || '').trim();
        if (n) n.split('\n').forEach(function(line){ out.push('  ' + line); });
      }); out.push(''); }
    out.push('<sub>written in the report; ' + m.length + (TOTAL ? ' of ' + TOTAL : '') + ' ' + NOUN + 's marked</sub>');
    return out.join('\n');
  }
  var sheet = document.getElementById('fb-sheet');
  var outTa = document.getElementById('fb-out');
  var status = document.getElementById('fb-status');
  function toClipboard(text){
    if (navigator.clipboard && window.isSecureContext){
      return navigator.clipboard.writeText(text).then(function(){ return true; }, function(){ return false; }); }
    try { outTa.select(); return Promise.resolve(document.execCommand('copy')); }
    catch (e) { return Promise.resolve(false); } }
  function openSheet(){
    outTa.value = markdown(); sheet.classList.add('open'); outTa.focus(); outTa.select();
    status.innerHTML = 'Selected &mdash; press &#8984;C / Ctrl-C, or use the button.';
    toClipboard(outTa.value).then(function(ok){
      if (ok) status.innerHTML = '&#10003; Copied to your clipboard &mdash; paste it straight back to Claude.'; }); }
  document.getElementById('fb-copy').addEventListener('click', openSheet);
  document.getElementById('fb-copy2').addEventListener('click', function(){
    toClipboard(outTa.value).then(function(ok){
      status.innerHTML = ok ? '&#10003; Copied.' : 'Clipboard refused &mdash; the text above is selected, press &#8984;C.'; }); });
  document.getElementById('fb-close').addEventListener('click', function(){ sheet.classList.remove('open'); });
  sheet.addEventListener('click', function(e){ if (e.target === sheet) sheet.classList.remove('open'); });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape') sheet.classList.remove('open');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'enter') openSheet(); });
  document.getElementById('fb-clear').addEventListener('click', function(){
    if (!confirm('Clear every mark and note in this report?')) return;
    state = {}; overall.value = '';
    Array.prototype.forEach.call(document.querySelectorAll('.fb'), function(strip){
      strip.querySelector('textarea').value = '';
      strip.querySelector('textarea').classList.add('hidden');
      Array.prototype.forEach.call(strip.querySelectorAll('button[data-fb]'), function(b){
        b.setAttribute('aria-pressed','false'); }); });
    save(); tally(); });
  load();
  Array.prototype.forEach.call(document.querySelectorAll('.fb'), function(strip){
    var st = state[strip.dataset.rank]; if (!st) return;
    var ta = strip.querySelector('textarea');
    ta.value = st.note || ''; if (ta.value.trim()) ta.classList.remove('hidden');
    Array.prototype.forEach.call(strip.querySelectorAll('button[data-fb]'), function(b){
      var k = b.dataset.fb;
      var on = (k==='yes'||k==='no'||k==='star') ? st.v===k
             : (k==='dyes'||k==='dno') ? st.d===k : !!(st.note||'').trim();
      b.setAttribute('aria-pressed', String(!!on)); }); });
  tally();
})();
"""


def fb(rank: str, title: str, placeholder: str = "your call…") -> str:
    return f"""
<div class="fb" data-rank="{rank}" data-title="{title}">
  <span class="lbl">{rank}</span>
  <button class="yes" data-fb="yes" aria-pressed="false">&#128077;</button>
  <button class="no" data-fb="no" aria-pressed="false">&#128078;</button>
  <button class="star" data-fb="star" aria-pressed="false">&#9733; do this</button>
  <span class="sep"></span>
  <button class="dyes" data-fb="dyes" aria-pressed="false">drawing &#128077;</button>
  <button class="dno" data-fb="dno" aria-pressed="false">drawing &#128078;</button>
  <span class="sep"></span>
  <button class="note-btn" data-fb="note" aria-pressed="false">&#9998; note</button>
  <textarea class="hidden" spellcheck="false" placeholder="{placeholder}"></textarea>
</div>"""


# ---------------------------------------------------------------------------
# Drawings
# ---------------------------------------------------------------------------
TREE = ("""
<div class="mock">
  <div class="mock-label">grain 1 is a TREE, not a rung &mdash; your correction, drawn</div>
  <div class="tree">
    <div class="row"><span class="rail">   </span>
      <span class="node mod">stereo.py <small>module &middot; {LINES} lines</small></span></div>
    <div class="row"><span class="rail">   ├─ </span>
      <span class="node cls">EstimatePairOut <small>class</small></span></div>
    <div class="row"><span class="rail">   ├─ </span>
      <span class="node fn">rectify <small>def &middot; left, right &rarr; Rectified</small></span></div>
    <div class="row"><span class="rail">   ├─ </span>
      <span class="node fn">estimate_pair <small>def &middot; &rarr; depth, confidence</small></span></div>
    <div class="row"><span class="rail">   └─ </span>
      <span class="node cls">Pipeline <small>class</small></span></div>
    <div class="row"><span class="rail">        ├─ </span>
      <span class="node fn">__init__ <small>def</small></span></div>
    <div class="row"><span class="rail">        └─ </span>
      <span class="node fn">run <small>def</small></span></div>
  </div>
  <div class="cut"><span>the line you do not cross</span></div>
  <div class="tree" style="opacity:.55">
      <div class="row"><span class="rail">              </span>
        <span class="node op">rectified = rectify(left, right)</span></div>
      <div class="row"><span class="rail">              </span>
        <span class="node op">match(&hellip;)</span>
        <span class="node op">to_depth(&hellip;)</span>
        <span class="node op">score(&hellip;)</span></div>
  </div>
  <p class="mock-note">My first drawing put grain on one axis, which made it look like a depth dial
  and made P5 look like the natural end of it. You corrected that: <i>&ldquo;it just naturally
  hierarchically nests&rdquo;</i>. Grain&nbsp;1 applies at <b>every</b> level of the definition tree
  &mdash; module, class, method, nested def &mdash; and there is no deeper rung to want, because the
  next thing down is not a smaller definition, it is a <b>statement</b>. So the ceiling is not a
  number on a dial. It is a <b>kind</b>: a block is a definition; everything inside one is held
  text.</p>
</div>""").replace("{LINES}", str(COVERAGE["totalLines"]))


RECORD = f"""
<div class="mock">
  <div class="mock-label">P3 and P4 are the same record &mdash; one optional field apart</div>
  <div class="grid2">
    <div>
      <div class="rec">
        <div class="hd">// shipped today &mdash; pyblocks/systemsketch.py</div>
        <div class="fld"><span class="nm">CodeBlock</span><span class="ty">{{</span></div>
        <div class="fld"><span class="nm">&nbsp;&nbsp;version</span><span class="ty">int == 1</span></div>
        <div class="fld"><span class="nm">&nbsp;&nbsp;language</span><span class="ty">{FACTS['languages'].split('= ')[-1]}</span></div>
        <div class="fld"><span class="nm">&nbsp;&nbsp;source</span><span class="ty">str &mdash; the bytes</span></div>
        <div class="fld"><span class="ty">}}</span></div>
      </div>
      <p class="mock-note" style="margin-top:10px"><b style="color:var(--accent)">This is P4.</b>
      The board owns the bytes. It already works, and a board full of these is already a valid
      <code>.systemsketch</code>.</p>
    </div>
    <div>
      <div class="rec">
        <div class="hd">// the whole proposal</div>
        <div class="fld"><span class="nm">CodeBlock</span><span class="ty">{{</span></div>
        <div class="fld"><span class="nm">&nbsp;&nbsp;version</span><span class="ty">int == 2</span></div>
        <div class="fld"><span class="nm">&nbsp;&nbsp;language</span><span class="ty">&hellip;</span></div>
        <div class="fld"><span class="nm">&nbsp;&nbsp;source</span><span class="ty">str &mdash; now a CACHE</span></div>
        <div class="fld new"><span class="nm">&nbsp;&nbsp;origin?</span>
          <span class="ty">{{uri, anchor, sha256}} | absent</span></div>
        <div class="fld"><span class="ty">}}</span></div>
      </div>
      <p class="mock-note" style="margin-top:10px"><b style="color:var(--ok)">Present &rarr; P3.</b>
      The file owns the bytes; <code>source</code> is a cache and the board edits route through
      pyblocks&rsquo; commands. <b>Absent &rarr; P4</b>, unchanged &mdash; which is your pseudo-code
      block.</p>
    </div>
  </div>
  <p class="mock-note"><b>Why this answers &ldquo;does supporting both get messy?&rdquo; with
  no.</b> Messy is a <i>mode</i> &mdash; a board-level or app-level switch, which forces every cell
  in a document to agree and leaves you migrating between two worlds. This is a field on one node.
  Each cell answers the question by itself, a board can hold a mix, and there is exactly one rule to
  remember: <b>whoever the binding points at owns the bytes.</b></p>
</div>"""


STATES = """
<div class="mock">
  <div class="mock-label">the four states, and what each one may do</div>
  <div class="states">
    <div class="state s4"><div class="t">no origin</div>
      <p><b>Pseudo.</b> Nothing backs it. The board owns the bytes and always has.</p>
      <p>Edit freely. Nothing to drift from. Runs only if you run it (the notebook thread).</p></div>
    <div class="state s1"><div class="t">origin · hash verifies</div>
      <p><b>Real, in sync.</b> The file owns the bytes; this is a faithful cache of a span.</p>
      <p>Block-side edits go through a named command. Painted normally.</p></div>
    <div class="state s2"><div class="t">origin · hash differs</div>
      <p><b>Real, drifted.</b> Somebody &mdash; you, vim, Claude &mdash; edited the file.</p>
      <p>Re-read, don't merge. If the board also changed, that is dpkg&rsquo;s three-way case: show
      both, never clobber.</p></div>
    <div class="state s3"><div class="t">origin · cannot resolve</div>
      <p><b>Real, orphaned.</b> File moved, or the anchored definition was deleted.</p>
      <p>Say so on the block. Offer re-bind or detach-to-pseudo. Never silently fall back to the
      cache and pretend.</p></div>
  </div>
  <p class="mock-note"><b>And do not make it a setting.</b> You wrote &ldquo;perhaps that is where I
  have a setting of like pseudo code vs real code&rdquo; &mdash; your own note argues against it:
  <i>an ownership declaration (a DO NOT EDIT header, a mode flag) is advisory and stale by
  construction, because the event that changes ownership is exactly the event that does not update
  the declaration.</i> A binding is not a declaration; it is a pointer you can follow and a hash you
  can check. The four states above are computed, and the badge on the block just reports which one
  is true.</p>
</div>"""


LAYOUT = """
<div class="mock">
  <div class="mock-label">where the non-source data lives &mdash; and which .py is which</div>
  <div class="files">
    <div class="f"><span class="rail">  </span><span class="nm src">stereo.py</span>
      <span class="cm">&mdash; real Python. Your program. <b>Never written to except through a command.</b></span></div>
    <div class="f"><span class="rail">  </span><span class="nm src">frames.py</span>
      <span class="cm">&mdash; another one. A board may bind cells to several files at once.</span></div>
    <div class="f"><span class="rail">  </span><span class="nm owned">vision.systemsketch</span>
      <span class="cm">&mdash; the board. Positions, colours, pseudo cells, and one origin per bound cell.</span></div>
    <div class="f"><span class="rail">  </span><span class="nm owned">vision.systemsketch.py</span>
      <span class="cm">&mdash; the SAME board as declarative Python. Already exists, round trip already asserted on save.</span></div>
  </div>
  <p class="mock-note"><b>&ldquo;Remember there are different .pys&rdquo; &mdash; there are, and the
  distinction is already load-bearing in the code.</b> <code>stereo.py</code> is a program.
  <code>vision.systemsketch.py</code> is a <i>board</i> written as declarative Python &mdash;
  <code>pyblocks/systemsketch_store.py</code> calls it &ldquo;the declarative Python projection of
  the same document&hellip; parsed, never executed&rdquo;, and every save re-proves
  <code>assert_round_trip</code> before touching disk. They are both <code>.py</code>, they are not
  the same kind of thing, and the suffix is what tells them apart.</p>
  <p class="mock-note"><b>Your instinct about the separate file is the shipped industry answer, not a
  compromise.</b> In-file mixing has been tried and abandoned repeatedly &mdash; WinForms designer
  regions (&ldquo;the designer eats code it doesn&rsquo;t understand&rdquo;) became
  <code>.Designer.cs</code> partial classes; Eclipse JET&rsquo;s protected regions were formally
  &ldquo;not guaranteed&rdquo; to preserve hand-written code and the project was archived. A sibling
  file that the program never reads is the design that survived.</p>
</div>"""


BOUNDARY = """
<table>
  <tr><th>Concern</th><th>Who owns it</th><th>Why there and not somewhere else</th></tr>
  <tr><td><b>Parse, project, line accounting</b></td><td><code>pyblocks</code></td>
    <td>It already does this and nothing else in the stack wants a Python AST.</td></tr>
  <tr><td><b>The grain-1 projection</b> (definition graph)</td><td><code>pyblocks</code> &mdash; new</td>
    <td>The one real gap. It is a second builder mode over data the collector already has, not a new
    engine. Belongs beside the grain-2 builder, not in a UI repo.</td></tr>
  <tr><td><b>Block edit &rarr; source text</b></td><td><code>pyblocks</code></td>
    <td><code>commands.py</code>. Minimal text edits, refuses what it cannot do safely.</td></tr>
  <tr><td><b>The <code>origin</code> field and its four states</b></td><td><code>pyblocks</code></td>
    <td>It is a format change to <code>systemsketch.py</code>, which pyblocks owns and round-trip
    asserts on every save.</td></tr>
  <tr class="good"><td><b>The code cell, block, ports, badges</b></td><td><code>bbox-ui</code></td>
    <td>Your line: <i>&ldquo;definitely the editor components&rdquo;</i>. Props in, DOM out. A bound
    cell and a pseudo cell differ by one prop.</td></tr>
  <tr class="good"><td><b>Collapse &rarr; cell, expand &rarr; blocks</b></td><td><code>bbox-ui</code></td>
    <td><code>scene/collapse.ts</code> is already the exact inverse; the gesture is pure scene
    surgery and needs no parser.</td></tr>
  <tr><td><b>The shape, file dialogs, the document</b></td><td><code>SystemSketch</code></td>
    <td>Already ships a <code>code</code> shape with language-as-a-style and detach lowering.</td></tr>
  <tr class="dim"><td>Running a cell, kernels, outputs</td><td>the notebook thread</td>
    <td>Not this design. It meets this one at exactly one place &mdash; see below.</td></tr>
</table>"""


# ---------------------------------------------------------------------------
ASKS = [
    dict(
        n="A1",
        q="Where does the sidecar live: beside the <code>.py</code>, or in a sketch directory?",
        body="Two stores already exist and they disagree. <code>sketch_store.py</code> keys one "
             "board per workspace file at <code>&lt;sketch_dir&gt;/&lt;slug&gt;.json</code> "
             "(slug = the path with <code>&quot;/&quot; &rarr; &quot;__&quot;</code>, and the exact file key "
             "embedded so a slug collision cannot serve the wrong file&rsquo;s sketch). "
             "<code>systemsketch_store.py</code> stores free-standing boards anywhere under a files "
             "root. Both are right for what they were built for; only one can be the answer for a "
             "board that binds several files.",
        default="<b>The free-standing board wins, and the sidecar directory is retired for this "
                "purpose.</b> A board that can bind cells to several files is no longer &ldquo;the "
                "sketch <i>of</i> stereo.py&rdquo;, so a per-file key stops describing it. Opening a "
                "bare <code>.py</code> then means &ldquo;find or create a board that binds it&rdquo;, "
                "which keeps exactly one answer to where board data lives.",
    ),
    dict(
        n="A2",
        q="What is the anchor &mdash; and is a qualified name enough?",
        body="An <code>origin</code> has to survive you reformatting the file in vim. pyblocks&rsquo; "
             "own view ids embed position (<code>function:Pipeline.run@30:4</code>), so they are "
             "identity for one parse, not an anchor across edits. The identity ladder "
             "(<code>identity.py</code>: id &rarr; name &rarr; graph &rarr; source ordinal) is the "
             "durable one, and at grain 1 its second rung &mdash; the qualified name &mdash; is "
             "very nearly sufficient on its own.",
        default="<b>Anchor on the qualified name, keep <code>@line:col</code> only as a tie-break "
                "for overloads and re-definitions, and report an unresolved anchor rather than "
                "guessing.</b> That is the ladder&rsquo;s own rule &mdash; never reach across two "
                "different names to declare a rename &mdash; and it is why storing positions as "
                "metadata (your note on P1) is cheap at grain 1 and would have been fragile at "
                "grain 2.",
    ),
    dict(
        n="A3",
        q="Does a pseudo cell get highlighted as Python?",
        body="<code>CODE_BLOCK_LANGUAGES</code> is currently <code>(\"python\", \"markdown\")</code> "
             "&mdash; there is no <code>plaintext</code>. So today a pseudo-code cell has to claim to "
             "be Python in order to be legible, and anything that lints Python will then lint your "
             "sketching.",
        default="<b>Keep language and binding orthogonal, and add <code>plaintext</code> as a third "
                "language.</b> Pseudo-code is a <i>binding</i> fact, not a language fact &mdash; you "
                "will often want Python colours on an unbound cell. Conflating the two is the trap; "
                "the fix is one more enum value, and the parser simply never runs on an unbound "
                "cell.",
    ),
    dict(
        n="A4",
        q="Does the grain-1 builder go in pyblocks now, or do we prove it in a spike first?",
        body="This is the one piece of real new code the whole design needs. It is a second "
             "<code>_Builder</code> mode emitting one block per definition with call and reference "
             "edges between them &mdash; measured above, today&rsquo;s module page emits "
             f"{FACTS['blocks']} blocks for {FACTS['defs']} definitions, and puts no "
             "definition-to-definition edges in at all.",
        default="<b>Straight into pyblocks, behind a <code>--view-kind definitions</code> flag, with "
                "the golden corpus as its test.</b> A spike in bbox-ui would need a Python process "
                "anyway and would land the parser on the wrong side of the line you just drew.",
    ),
]

ASK_HTML = "\n".join(
    f"""<div class="ask">
  <h3>{a['n']} &middot; {a['q']}</h3>
  <p style="color:var(--dim);font-size:14px;margin:0">{a['body']}</p>
  <p class="dflt"><b>If you say nothing:</b> {a['default']}</p>
  {fb(a['n'], re.sub(r'<[^>]+>', '', a['q']))}
</div>"""
    for a in ASKS
)


HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Source code view — the answers</title>
<style>{CSS}</style>
</head><body><div class="wrap">

<p class="kicker">bbox-ui &middot; pyblocks &middot; systemsketch &nbsp;&middot;&nbsp; answers &nbsp;&middot;&nbsp; 2026-09-18</p>
<h1>Source code view &mdash; the answers</h1>
<p class="sub">Grain&nbsp;1 is the ceiling. Pseudo vs real is one field, not a setting. P3 and P4
are the same record. And &ldquo;off the shelf&rdquo; is <i>almost</i> true &mdash; here is the one
part that isn&rsquo;t.</p>

<div class="answers">
  <div class="answer">
    <b class="h">Capping at grain 1 doesn&rsquo;t just trim the ladder &mdash; it deletes the theory problem.</b>
    <p>Every hard thing about round-tripping lives at grain&nbsp;2 and below: drag a node out of a
    loop and no algorithm can know whether you meant to unroll, guard, or re-bind. <b>At grain 1
    that question cannot be asked.</b> A block <i>is</i> a definition, its body is held verbatim, and
    the inverse is &ldquo;print the held bytes back inside the def&rdquo; &mdash; total and unique.
    You are not choosing a conservative point on a spectrum; you are standing on the side of it
    where the lens literature has nothing to say. That is worth more than the feature it costs.</p>
  </div>
  <div class="answer blue">
    <b class="h">Grain 1 is a tree, not a rung &mdash; and that was your correction, not mine.</b>
    <p>My drawing put grain on one axis, which made P5 look like its natural end. <i>&ldquo;It just
    naturally hierarchically nests&rdquo;</i> is the fix: module &rarr; class &rarr; method &rarr;
    nested def are <b>all</b> grain 1. There is no deeper rung to want, because what comes next is
    not a smaller definition, it is a statement. The ceiling is a <b>kind</b>, not a number.</p>
  </div>
  <div class="answer">
    <b class="h">P3 vs P4 is not a backend choice. It is one optional field on a record that already exists.</b>
    <p><code>CodeBlock{{version, language, source}}</code> ships today in
    <code>pyblocks/systemsketch.py</code> &mdash; <b>that is P4, already built</b>. Add
    <code>origin</code> (a uri + anchor + hash) and the same record is P3: the file owns the bytes
    and <code>source</code> becomes a cache. <b>Absent &rarr; pseudo. Present &rarr; real.</b>
    Supporting both is not messy, because it is per cell and not per board &mdash; one rule:
    <i>whoever the binding points at owns the bytes.</i></p>
  </div>
  <div class="answer">
    <b class="h">But make it a binding, not a setting &mdash; your own note says so.</b>
    <p>You reached for &ldquo;a setting of like pseudo code vs real code&rdquo;. A mode flag is
    <i>advisory and stale by construction</i>: the event that changes ownership (you hand-editing
    the file) is exactly the event that does not update the flag. A binding is different in kind
    &mdash; it is a pointer you can follow and a hash you can check, so the block&rsquo;s badge
    <b>reports</b> a computed state instead of repeating a claim.</p>
  </div>
  <div class="answer" style="border-left-color:var(--warn)">
    <b class="h">And the one thing that isn&rsquo;t off the shelf: pyblocks&rsquo; projection is grain 2, at every level.</b>
    <p>You said pyblocks should do this basically off the shelf. Mostly true &mdash; but measured
    below, its module page turns a {COVERAGE['totalLines']}-line file with <b>{FACTS['defs']}
    definitions</b> into <b>{FACTS['blocks']} blocks</b>, because it lowers module-scope
    <i>statements</i>. The definition tree you want is already computed and handed to you for free
    in <code>views[]</code>; what does not exist is a projection whose <b>nodes are those views</b>.
    That is the work, it is small, and it belongs in pyblocks.</p>
  </div>
</div>

<div class="facts">
  <div class="fact good"><b>{FACTS['views']}</b><span>views[] entries — the definition tree, free</span></div>
  <div class="fact"><b>{FACTS['defs']}</b><span>definitions in the fixture</span></div>
  <div class="fact bad"><b>{FACTS['blocks']}</b><span>blocks the module page emits</span></div>
  <div class="fact bad"><b>{FACTS['grain2']}</b><span>of them statements or expressions</span></div>
  <div class="fact"><b>{FACTS['edges']}</b><span>edges — none between definitions</span></div>
  <div class="fact good"><b>{FACTS['codeblock_fields']}</b><span>fields in CodeBlock today</span></div>
  <div class="fact good"><b>1</b><span>field to add for P3</span></div>
</div>

<h2>The ceiling, drawn</h2>
{TREE}

<h2>What &ldquo;off the shelf&rdquo; actually buys &mdash; run, not argued</h2>
<p style="color:var(--dim)">A {COVERAGE['totalLines']}-line fixture with a class, two module-level
functions and a two-method class, through the real CLI at build time.</p>
<pre class="term">{TERMINAL}</pre>

<div class="grid2" style="margin-top:16px">
  <div>
    <h4 style="font-size:13.5px;margin:0 0 6px;color:var(--ok)">FREE &mdash; <code>views[]</code> is the definition tree</h4>
    <table style="margin-top:4px">
      <tr><th>view</th><th>kind</th><th style="text-align:right">lines</th><th>signature</th></tr>
      {VIEW_ROWS}
    </table>
    <p style="font-size:12.5px;color:var(--dim2)">Qualified names, exact spans, real signatures, and
    the declared output ports &mdash; <code>estimate_pair</code> already reports
    <code>depth: Depth</code> and <code>confidence: float</code>. This <i>is</i> grain 1, computed,
    today.</p>
  </div>
  <div>
    <h4 style="font-size:13.5px;margin:0 0 6px;color:var(--warn)">NOT FREE &mdash; the rendered page is grain 2</h4>
    <table style="margin-top:4px">
      <tr><th>block kind</th><th style="text-align:right">n</th><th>what it is</th></tr>
      {KIND_ROWS}
    </table>
    <p style="font-size:12.5px;color:var(--dim2)">Imports, literals, bindings and calls become
    nodes. For a file that is mostly definitions, that is {FACTS['grain2']} nodes of noise around
    the {DEFINITION_BLOCKS} you wanted.</p>
  </div>
</div>

<div class="lede red">
  <p><b>And the edges are the sharper half of the gap.</b> At grain 1, &ldquo;topology and
  dataflow&rdquo; means <b>which definition calls which</b>. Here is what pyblocks actually put on
  the definition regions:</p>
  <table style="margin:10px 0 0">
    <tr><th>definition region</th><th>ports</th></tr>
    {PORT_ROWS}
  </table>
  <p style="margin-top:10px"><code>rectify</code> gets <code>in-CALIB</code> &mdash; free-variable
  capture from a module-level binding, correctly found. But <code>estimate_pair</code> gets
  <b>no input port at all</b>, even though its body calls <code>rectify</code>. References to other
  <i>definitions</i> are not tracked as inputs. So the call graph &mdash; the exact thing you said
  the block view is for &mdash; is the piece that has to be written. Everything it needs is present:
  the definition table, the spans, and <code>symbols.py</code>&rsquo;s static resolution for the
  cross-file case.</p>
</div>

<h2>Pseudo vs real</h2>
{RECORD}
{STATES}

<h2>Where the non-source data goes</h2>
<div class="lede green">
  <p><b>You are right that you need a separate file, and you already have two of them.</b>
  <code>sketch_store.py</code> ({FACTS['sketch_store']} lines) stores a board per workspace Python
  file, keyed by a slug of the path with the exact file key embedded so a collision cannot serve the
  wrong file&rsquo;s sketch. <code>systemsketch_store.py</code> stores free-standing boards, in
  <code>.systemsketch</code> or in <code>.systemsketch.py</code>. Neither needs inventing; one of
  them needs picking (A1).</p>
</div>
{LAYOUT}

<h2>Who owns what</h2>
<p style="color:var(--dim)">Your last line: <i>&ldquo;pyblocks will really implement a lot of the
backend&hellip; so it&rsquo;s not something I think we necessarily support in stock bbox-ui.
definitely the editor components&rdquo;</i> &mdash; agreed, and here is the line drawn so a lane
cannot drift across it.</p>
{BOUNDARY}

<h2>Evidence, from the parts that already run</h2>
<div class="shots">
  <figure><img src="{shot('code-in-block')}" alt="a code editor inside a block">
    <figcaption><b>A definition, rendered as a block with its code inside.</b> This is the grain-1
    picture, and it is a Storybook story today &mdash; a real CodeMirror document in a
    Block&rsquo;s Attributes slot.</figcaption></figure>
  <figure><img src="{shot('grouping-roundtrip')}" alt="collapse and dissolve round trip">
    <figcaption><b>The P1 gesture&rsquo;s inverse is measured, not asserted.</b> Collapse then
    dissolve, and <code>JSON.stringify(before) === JSON.stringify(dissolved)</code> is
    <span style="color:#3fb950">IDENTICAL</span> &mdash; which is what makes storing positions as
    metadata (your note) a safe thing to promise.</figcaption></figure>
</div>

<h2>Where this meets the notebook thread</h2>
<div class="lede">
  <p>The other agent&rsquo;s five proposals are a different question and I am not re-opening them
  &mdash; but the two designs touch at exactly one record, and it is worth naming so they do not
  each invent it. <b>An unbound cell is a notebook cell.</b> No file backs it, the board owns its
  bytes, and running it produces an output that also has nowhere else to live. A <i>bound</i> cell
  is the opposite: running it means running part of a real file, which is a different and much
  larger promise.</p>
  <p style="margin-top:10px">So the <code>origin</code> field is also the honest boundary for
  execution: <b>cells without an origin are runnable scratch; cells with one are a view onto a
  program.</b> If those two threads agree on that one field, they compose. If they each add their
  own flag, they will fight over the same node.
  &mdash; <a href="{NOTEBOOK}">the notebook report</a></p>
</div>

<h2>What needs you</h2>
<p style="color:var(--dim);margin-bottom:16px">Four, all narrower than last time, each with the
reversible default I take if you say nothing.</p>
{ASK_HTML}

<div class="ask" style="border-color:#3a4250">
  <h3>Anything else</h3>
  <p style="color:var(--dim);font-size:14px;margin:0 0 10px">Goes at the top of the copied markdown.</p>
  <textarea id="fb-overall" spellcheck="false" placeholder="a correction, something I have still got wrong, what to do first…"
    style="width:100%;min-height:90px;background:#08090b;color:var(--fg);border:1px solid var(--line2);
           border-radius:8px;padding:10px 12px;font:13px/1.55 var(--mono);resize:vertical"></textarea>
</div>

<h2>What I did not do</h2>
<div class="lede">
  <p><b>No code toward any of this.</b> You said no more code, so this pass is measurement and
  design only. Nothing in pyblocks, bbox-ui or SystemSketch was modified; the fixture used for the
  measurement lives in scratch, not in a repo.</p>
  <p><b>No re-opening of P5, and no new proposals.</b> You ruled grain 1 is the ceiling, so P5 is
  gone and the ladder drawing above replaces the one that made it look inevitable.</p>
  <p><b>No design for running cells.</b> That belongs to the notebook thread; this page names the
  one field the two share and stops there.</p>
</div>

<div class="dock" data-report="source code view — answers (2026-09-18)" data-noun="item" data-total="4">
  <span class="tally" id="fb-tally">nothing marked yet</span>
  <button id="fb-clear">Clear</button>
  <button class="go" id="fb-copy">Copy feedback</button>
</div>

<div class="sheet" id="fb-sheet">
  <div class="inner">
    <header><h3>Your feedback, as markdown</h3><span class="sp"></span>
      <button id="fb-close">Close</button></header>
    <textarea id="fb-out" spellcheck="false"></textarea>
    <footer><span id="fb-status">Selected &mdash; press &#8984;C / Ctrl-C, or use the button.</span>
      <span class="sp"></span><button class="go" id="fb-copy2">Copy to clipboard</button></footer>
  </div>
</div>

<footer class="page">
<p><b>Run, not recalled.</b> The grain-2 measurement is a real
<code>python3 -m pyblocks analyze --view module</code> executed when this page was built
(pyblocks at <code>{FACTS['pbhead']}</code>); every count, the <code>views[]</code> table, the block
kinds and the region ports are read straight out of its JSON. The record shape is
<code>_is_code_block_payload</code> in <code>pyblocks/systemsketch.py</code>
({FACTS['systemsketch_py']} lines) &mdash; note <code>_is_exact_v1</code>, which rejects unknown
keys, so adding <code>origin</code> is a deliberate version bump and not something that can sneak
in. The two stores are <code>pyblocks/sketch_store.py</code> and
<code>pyblocks/systemsketch_store.py</code>; the declarative board format and its save-time
<code>assert_round_trip</code> are in <code>pyblocks/systemsketch.py</code>. Anchors:
<code>pyblocks/identity.py</code>. The collapse inverse: <code>scene/collapse.ts</code> on
<code>claude/bar-block-storybook-e61a36</code>.</p>
<p><b>Theory, from your own vault.</b> The mode-flag argument and the four states are
<code>C - Provenance-Based Ownership (Hash Decides, Stamp Documents)</code> &mdash; including the
dpkg three-way-prompt precedent and the WinForms/JET history behind the separate-file
recommendation. The grain-1 escape from the lens problem is
<code>C - Bidirectional Transformation (Lenses)</code> read the other way round: the theorems bind
where a view abstracts, and a definition-level view does not abstract.</p>
<p><b>Built by</b> <code>docs/build_source_code_view_answers.py</code> from
<code>{FACTS['head']}</code>. The first pass, with the five proposals and the scoring, is
<a href="{PRIOR}">here</a>.</p>
</footer>

</div>
<script>{FB_JS}</script>
</body></html>"""

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(HTML)
print(f"wrote {OUT}  ({OUT.stat().st_size:,} bytes on disk)")
encoded = len(quote(HTML, safe="").encode())
cap = 2_097_024
print(f"encoded data: URL {encoded:,} / {cap:,} ({encoded/cap:.0%})"
      f"  -> {'OK, opens in preview' if encoded < cap else 'OVER CAP - browser-only'}")
