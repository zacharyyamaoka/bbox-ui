#!/usr/bin/env python3
"""
Build the "Source code view" proposal report — five ways to make code and
blocks the same document.

Zach, Daily Note - Sep 18 2026 §Source Code View: "Please make 5 proposal for
how we could implement this. I feel its basically like a file within a file
... pyblocks shows us how to do the transformation forwards and backwards ...
The simplest pyblocks scene anyways is just 1 opaque source code block that
runs as the entire code anyways right."

The feature does not exist, so most of this page is rendered MOCKS (the rule:
a proposal for something unbuilt owes a drawing, precisely because there is
nothing to screenshot). The other half is real captures of the parts that
already ship — the code cell, the code-inside-a-block story, collapse/dissolve
proving an exact inverse — taken off Zach's own Storybook on :5421 by
docs/capture_source_code_view_shots.mjs.

Inlines those captures as data URIs, so the page lives in the gitignored
reports/media/ half (ignored files survive a peer's `git stash -u`, which is
what makes that location safe for an untracked handoff link).

    node docs/capture_source_code_view_shots.mjs --out /home/bam/bbox-ui/reports/media/shots-source-code-view
    python3 docs/build_source_code_view_report.py
"""
from __future__ import annotations

import base64
import io
import pathlib
import re
import subprocess
import sys
from urllib.parse import quote

from PIL import Image

REPO = pathlib.Path("/home/bam/bbox-ui")
PYBLOCKS = pathlib.Path("/home/bam/pyblocks")
SKETCH = pathlib.Path("/home/bam/systemsketch")
SHOTS = REPO / "reports/media/shots-source-code-view"
OUT = REPO / "reports/media/source-code-view-2026-09-18.html"
LANE = "claude/bar-block-storybook-e61a36"


# ---------------------------------------------------------------------------
# Captures. Auto-trimmed against the story background, because an element
# screenshot of a Storybook root still carries whatever empty page the story
# left below it — a 2236x1456 frame that is 60% black reads as a mistake.
# ---------------------------------------------------------------------------
def shot(name: str, quality: int = 78) -> str:
    path = SHOTS / f"{name}.png"
    if not path.exists():
        raise SystemExit(
            f"missing capture: {path}\n"
            "run: node docs/capture_source_code_view_shots.mjs "
            f"--out {SHOTS}"
        )
    im = Image.open(path).convert("RGB")
    # Trim: compare against the top-left pixel, which is always page ground.
    bg = Image.new("RGB", im.size, im.getpixel((0, 0)))
    box = Image.eval(
        Image.blend(im, bg, 0.0), lambda _: 0
    )  # placeholder, replaced below
    from PIL import ImageChops

    diff = ImageChops.difference(im, bg)
    box = diff.getbbox()
    if box:
        pad = 12
        left = max(0, box[0] - pad)
        top = max(0, box[1] - pad)
        right = min(im.width, box[2] + pad)
        bottom = min(im.height, box[3] + pad)
        im = im.crop((left, top, right, bottom))
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=quality, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


def sh(cmd: str, cwd: pathlib.Path) -> str:
    return subprocess.run(
        cmd, shell=True, cwd=cwd, capture_output=True, text=True
    ).stdout.strip()


# ---------------------------------------------------------------------------
# Measured facts. Every number on the page is read off a tree at build time,
# so a stale claim cannot survive a rebuild.
# ---------------------------------------------------------------------------
commands_src = (PYBLOCKS / "pyblocks/commands.py").read_text()
# First docstring LINE of each command dataclass. A `.+?` up to the closing
# quotes silently drops any command whose docstring wraps — which it did:
# PromoteToNamedOutputs went missing and the count read 7 instead of 8.
COMMAND_CLASSES = [
    # `.rstrip('"')` because a one-line docstring's closing quotes are on the
    # same line as its text -- without it every row ended in a literal """.
    (n, d.strip().rstrip('"').strip())
    for n, d in re.findall(r"^class (\w+):\n    \"\"\"([^\n]+)", commands_src, re.M)
    if n != "CommandError"
]
# Cross-check against the module's own dispatch table rather than trusting the
# regex: if these disagree, the page would be quietly under-reporting.
_declared = len(re.findall(r'^\s+"[a-z_]+": \w+,$', commands_src, re.M))
assert len(COMMAND_CLASSES) == _declared, (
    f"parsed {len(COMMAND_CLASSES)} command classes but _COMMANDS declares {_declared}"
)

FACTS = {
    "analyzer": sh("wc -l < pyblocks/analyzer.py", PYBLOCKS),
    "commands": sh("wc -l < pyblocks/commands.py", PYBLOCKS),
    "adapter": sh("wc -l < pyblocks/python_adapter.py", PYBLOCKS),
    "identity": sh("wc -l < pyblocks/identity.py", PYBLOCKS),
    "ncommands": str(len(COMMAND_CLASSES)),
    "collapse": sh(f"git show {LANE}:apps/storybook-basics/src/scene/collapse.ts | wc -l", REPO),
    "collapse_tests": sh(
        f"git show {LANE}:apps/storybook-basics/src/scene/collapse.test.ts | grep -c '  it(' || true",
        REPO,
    ),
    "boundary": sh(f"git show {LANE}:apps/storybook-basics/src/scene/boundary.ts | wc -l", REPO),
    "codeeditor": sh("wc -l < apps/storybook-basics/src/components/codeEditor.tsx", REPO),
    "sketch_code": sh("ls src/code/*.ts* | wc -l", SKETCH),
    "sketch_code_lines": sh("cat src/code/*.ts* | wc -l", SKETCH),
    "head": sh("git rev-parse --short HEAD", REPO),
    "lanehead": sh(f"git rev-parse --short {LANE}", REPO),
}

# The line-status vocabulary the analyzer already accounts every line against.
LINE_STATUS = sh("grep -m1 'LineStatus = ' pyblocks/schema.py", PYBLOCKS)

SAMPLE = """def estimate_pair(left: Frame, right: Frame) -> EstimatePairOut:
    rectified = rectify(left, right)
    disparity = match(rectified)
    return EstimatePairOut(
        depth=to_depth(disparity),
        confidence=score(disparity),
    )"""


# ---------------------------------------------------------------------------
# Page
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
       margin:68px 0 18px; font-weight:600 }
  h4 { font-size:13.5px; margin:22px 0 8px; letter-spacing:.01em }
  .sub { color:var(--dim); font-size:18px; margin:0 0 26px; line-height:1.5 }
  .kicker { font:600 11.5px/1 var(--mono); letter-spacing:.14em; text-transform:uppercase;
    color:var(--dim2); margin:0 0 18px }
  a { color:var(--accent2) }
  code { font-family:var(--mono); font-size:.9em; background:#0a0b0e; border:1px solid #23272f;
    border-radius:4px; padding:1px 5px }
  p { margin:0 0 12px }

  .facts { display:grid; grid-template-columns:repeat(auto-fit,minmax(122px,1fr));
    gap:10px; margin:26px 0 6px }
  .fact { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:13px 15px }
  .fact b { display:block; font-size:25px; font-variant-numeric:tabular-nums; letter-spacing:-.02em }
  .fact span { font-size:11px; color:var(--dim2); text-transform:uppercase; letter-spacing:.07em;
    line-height:1.35; display:block; margin-top:3px }

  .lede { background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--accent);
    border-radius:10px; padding:20px 24px; margin:26px 0 }
  .lede p:last-child { margin:0 }
  .lede.blue { border-left-color:var(--accent2) }
  .lede.green { border-left-color:var(--ok) }
  .quote { color:var(--dim); font-style:italic }

  .prop { background:var(--panel); border:1px solid var(--line); border-radius:13px;
    margin:0 0 20px; overflow:hidden }
  .prop-hd { display:flex; align-items:center; gap:12px; flex-wrap:wrap;
    padding:16px 20px; border-bottom:1px solid var(--line); background:var(--panel2) }
  .prop-n { font:700 12px/1 var(--mono); color:var(--bg); background:var(--accent);
    padding:6px 9px; border-radius:6px }
  .prop-hd h3 { margin:0; font-size:19px; flex:1 1 auto; letter-spacing:-.015em }
  .tag { font-size:10.5px; padding:3px 9px; border-radius:99px; border:1px solid var(--line2);
    color:var(--dim); text-transform:uppercase; letter-spacing:.08em; white-space:nowrap }
  .tag.win { color:var(--ok); border-color:#1e3d26 }
  .tag.cheap { color:var(--accent2); border-color:#24384a }
  .tag.big { color:var(--gold); border-color:#4a3f24 }
  .prop-body { padding:20px }
  .claim { margin:0 0 12px; font-size:16px; line-height:1.55 }
  .claim b { color:var(--accent) }

  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:14px }
  .grid3 { display:grid; grid-template-columns:repeat(3,1fr); gap:12px }
  @media (max-width:760px){ .grid2,.grid3 { grid-template-columns:1fr } }

  .card { background:var(--panel2); border:1px solid var(--line); border-radius:9px; padding:13px 15px }
  /* the card's LABEL only -- a direct child. `.card b` unscoped also caught
     every <b> inside the card's paragraphs and broke sentences onto their own
     uppercase line (measured in the first render). */
  .card > b { display:block; font-size:12px; text-transform:uppercase; letter-spacing:.08em;
    color:var(--dim2); margin-bottom:6px }
  .card p b { color:var(--fg) }
  .card.ok > b { color:var(--ok) } .card.no > b { color:var(--warn) }
  .card p { margin:0; font-size:13.5px; color:var(--dim) }
  .card p + p { margin-top:7px }
  .card em { color:var(--fg); font-style:normal }

  table { width:100%; border-collapse:collapse; margin:14px 0; font-size:13.5px }
  th { text-align:left; font-size:10.5px; text-transform:uppercase; letter-spacing:.09em;
    color:var(--dim2); font-weight:600; padding:8px 10px; border-bottom:1px solid var(--line2) }
  td { padding:9px 10px; border-bottom:1px solid #1e222a; vertical-align:top; color:var(--dim) }
  td b, td strong { color:var(--fg); font-weight:600 }
  tr:last-child td { border-bottom:0 }
  td.num { font-variant-numeric:tabular-nums; text-align:right; font-family:var(--mono);
    color:var(--fg) }
  tr.stock td { background:#12151a }
  tr.win td { background:#101b13 }

  .mock { margin:16px 0 0; background:#0a0b0e; border:1px dashed #333a47;
    border-radius:11px; padding:18px }
  .mock-label { font:700 10px/1 var(--mono); color:var(--accent); text-transform:uppercase;
    letter-spacing:.14em; margin-bottom:14px }
  .mock-note { margin:14px 0 0; font-size:12.5px; color:var(--dim2); line-height:1.55 }

  pre { margin:0; font:12.5px/1.65 var(--mono); color:#c8cede; white-space:pre;
    overflow-x:auto; background:#08090b; border:1px solid #1d212a; border-radius:8px;
    padding:12px 14px }
  pre .k { color:#c98bdb } pre .f { color:#79b8ff } pre .s { color:#9ecbff }
  pre .c { color:#5c6370 } pre .t { color:#5ecf9a } pre .g { color:#3b414c }
  pre.tight { padding:9px 11px; font-size:11.5px }

  /* canvas-ish mock furniture */
  .blk { background:#171a20; border:1px solid #333b49; border-radius:8px; padding:8px 11px;
    font:600 12px/1.35 var(--mono); color:#dfe4ee; position:relative; display:inline-block }
  .blk small { display:block; font-weight:400; font-size:10.5px; color:var(--dim2);
    font-family:var(--mono); margin-top:2px }
  .blk.sel { border-color:var(--accent2); box-shadow:0 0 0 2px #5aa9f83d }
  .blk.cell { background:#0b0d11; border-color:#3d4654 }
  .dot { width:9px; height:9px; border-radius:99px; position:absolute; top:50%;
    margin-top:-4.5px; border:1.5px solid #0a0b0e }
  .dot.in { left:-5px; background:var(--accent2) } .dot.out { right:-5px; background:var(--ok) }
  .arrowcol { display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:5px; color:var(--dim2); font:600 10px/1 var(--mono); letter-spacing:.1em }
  .arrowcol .big { font-size:22px; color:var(--accent) }
  .pane { background:#101318; border:1px solid var(--line); border-radius:9px; padding:13px }
  .pane > .hd { font:700 10px/1 var(--mono); letter-spacing:.12em; text-transform:uppercase;
    color:var(--dim2); margin-bottom:10px; display:flex; align-items:center; gap:8px }
  .chip { font:600 9.5px/1 var(--mono); letter-spacing:.08em; text-transform:uppercase;
    padding:4px 7px; border-radius:5px; border:1px solid var(--line2); color:var(--dim) }
  .chip.live { background:#122016; border-color:#1e3d26; color:var(--ok) }
  .chip.stale { background:#201a12; border-color:#4a3524; color:var(--accent) }
  .chip.lock { background:#15171c; color:var(--dim2) }
  .chip.blue { background:#101c28; border-color:#24384a; color:var(--accent2) }

  .gut { display:grid; grid-template-columns:auto 1fr; gap:0 10px; font:12.5px/1.6 var(--mono) }
  .gut .n { color:#3b414c; text-align:right; user-select:none }
  .gut .l { color:#c8cede; white-space:pre }
  .gut .hl .l { background:#1b2a1e; border-radius:3px; box-shadow:0 0 0 3px #1b2a1e }
  .gut .hl .n { color:var(--ok) }
  .gut .op .l { color:#6b7383 }

  .ladder { display:grid; grid-template-columns:repeat(4,1fr); gap:10px }
  .rung { background:#101318; border:1px solid var(--line); border-radius:9px; padding:11px;
    display:flex; flex-direction:column; gap:7px }
  .rung .rh { font:700 10px/1 var(--mono); letter-spacing:.1em; text-transform:uppercase }
  .rung .rs { font-size:11px; color:var(--dim2); line-height:1.45; min-height:44px }
  .rung.g0 .rh { color:var(--ok) } .rung.g1 .rh { color:#8fd0a0 }
  .rung.g2 .rh { color:var(--accent) } .rung.g3 .rh { color:var(--warn) }
  .band { margin-top:10px; height:8px; border-radius:99px;
    background:linear-gradient(90deg,var(--ok),#8fd0a0 33%,var(--accent) 66%,var(--warn)) }
  .bandlbl { display:flex; justify-content:space-between; font:600 10px/1 var(--mono);
    letter-spacing:.1em; text-transform:uppercase; color:var(--dim2); margin-top:7px }

  .slider { display:flex; align-items:center; gap:0; margin:6px 0 16px }
  .slider .stop { flex:1; text-align:center; position:relative; padding-top:20px;
    font:600 10px/1.3 var(--mono); letter-spacing:.07em; color:var(--dim2) }
  .slider .stop::before { content:""; position:absolute; top:6px; left:50%; width:11px; height:11px;
    margin-left:-5.5px; border-radius:99px; background:#232833; border:2px solid #3c4453 }
  .slider { position:relative }
  .slider .stop::after { content:""; position:absolute; top:11px; left:50%; width:100%; height:2px;
    background:#2b313c }
  .slider .stop::before { z-index:1 }
  .slider .stop:last-child::after { display:none }
  .slider .stop.on { color:var(--accent) }
  .slider .stop.on::before { background:var(--accent); border-color:var(--accent) }

  .legend { display:flex; gap:16px; flex-wrap:wrap; font-size:12px; color:var(--dim2); margin-top:12px }
  .legend i { display:inline-block; width:10px; height:10px; border-radius:3px; margin-right:6px;
    vertical-align:-1px }

  figure { margin:16px 0 0 }
  figure img { width:100%; display:block; border-radius:9px; border:1px solid var(--line);
    background:#0a0b0e }
  figcaption { font-size:12.5px; color:var(--dim2); margin-top:9px; line-height:1.55 }
  figcaption b { color:var(--fg); display:block; font-size:13px; margin-bottom:2px }
  .shots { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:18px }
  .shots figure img { max-height:300px; object-fit:contain; object-position:left top; padding:6px }

  .hidden { display:none !important }

  /* ---- in-report feedback: the report is an input surface, not just an
     output. A verdict is one click, a note is one click plus typing, and the
     number + exact title travel with it so Zach never says WHICH one. ---- */
  .fb { display:flex; align-items:center; gap:7px; flex-wrap:wrap;
    border-top:1px solid #1e222a; margin-top:16px; padding-top:12px }
  .fb .lbl { font-size:10px; text-transform:uppercase; letter-spacing:.09em; color:var(--dim2);
    font-weight:700; margin-right:2px }
  .fb button { font:600 12px/1 inherit; font-family:inherit; cursor:pointer;
    background:#1a1e26; color:var(--dim); border:1px solid var(--line2);
    border-radius:7px; padding:6px 10px }
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
    border:1px solid var(--line2); border-radius:12px; padding:10px 12px;
    box-shadow:0 12px 40px #000a }
  .dock .tally { font:600 12px var(--mono); color:var(--dim) }
  .dock .tally b { color:var(--fg) }
  .dock button { font:700 12.5px/1 inherit; font-family:inherit; cursor:pointer;
    border-radius:8px; padding:9px 13px; border:1px solid var(--line2);
    background:#232833; color:var(--fg) }
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
  .sheet header .sp { margin-left:auto }
  .sheet textarea { flex:1; min-height:340px; margin:0; border:0; border-radius:0;
    background:#08090b; color:var(--fg); padding:16px 20px;
    font:12.5px/1.6 var(--mono); resize:none }
  .sheet textarea:focus { outline:none }
  .sheet footer { padding:12px 20px; border-top:1px solid var(--line); color:var(--dim2);
    font-size:12px; display:flex; align-items:center; gap:12px }
  .sheet footer .sp { margin-left:auto }
  .sheet button { font:700 12.5px/1 inherit; font-family:inherit; cursor:pointer;
    border-radius:8px; padding:9px 13px; border:1px solid var(--line2);
    background:#232833; color:var(--fg) }
  .sheet button.go { background:var(--ok); border-color:var(--ok); color:#0c0d10 }

  footer.page { margin-top:70px; padding-top:22px; border-top:1px solid var(--line);
    font-size:12.5px; color:var(--dim2); line-height:1.7 }
  footer.page b { color:var(--dim) }
"""

FB_SCRIPT = r"""
(function(){
  var dock = document.querySelector('.dock');
  var REPORT = dock.dataset.report || 'this report';
  var NOUN = dock.dataset.noun || 'item';
  var TOTAL = dock.dataset.total || '';
  var KEY = 'bbox-report-feedback:' + REPORT;
  var state = {};
  var overall = document.getElementById('fb-overall');

  function load(){
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      state = saved.items || {};
      if (saved.overall) overall.value = saved.overall;
    } catch (e) {}
  }
  function save(){
    try { localStorage.setItem(KEY, JSON.stringify({items: state, overall: overall.value})); }
    catch (e) {}
  }
  function slot(rank, title){
    if (!state[rank]) state[rank] = {v:'', d:'', note:'', title:title};
    state[rank].title = title;
    return state[rank];
  }

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
        if (k === 'note'){
          ta.classList.toggle('hidden');
          if (!ta.classList.contains('hidden')) ta.focus();
        } else if (k === 'dyes' || k === 'dno'){
          st.d = st.d === k ? '' : k;
        } else {
          st.v = st.v === k ? '' : k;
        }
        save(); paint(); tally();
      });
    });
    ta.addEventListener('input', function(){ slot(rank, title).note = ta.value; save(); tally(); });
    var st = state[rank];
    if (st){ ta.value = st.note || ''; if (ta.value.trim()) ta.classList.remove('hidden'); }
    paint();
  });
  overall.addEventListener('input', function(){ save(); tally(); });

  function marked(){
    return Object.keys(state).filter(function(r){
      var s = state[r]; return s && (s.v || s.d || (s.note || '').trim());
    }).sort();
  }
  function tally(){
    var m = marked(), notes = m.filter(function(r){ return (state[r].note||'').trim(); }).length;
    var el = document.getElementById('fb-tally');
    var extra = overall.value.trim() ? ' + overall' : '';
    el.innerHTML = m.length
      ? '<b>' + m.length + '</b> marked &middot; <b>' + notes + '</b> noted' + extra
      : (extra ? 'overall note only' : 'nothing marked yet');
    document.getElementById('fb-copy').disabled = !m.length && !overall.value.trim();
  }

  var FACE = {yes:'\u{1F44D}', no:'\u{1F44E}', star:'★'};
  function markdown(){
    var m = marked();
    var out = ['# Feedback — ' + REPORT, ''];
    if (overall.value.trim()){ out.push('## Overall', '', overall.value.trim(), ''); }
    if (m.length){
      out.push('## Per ' + NOUN, '');
      m.forEach(function(r){
        var s = state[r], tags = [];
        if (s.v) tags.push(FACE[s.v]);
        if (s.d === 'dyes') tags.push('mock \u{1F44D}');
        if (s.d === 'dno')  tags.push('mock \u{1F44E}');
        out.push('- ' + (tags.length ? '[' + tags.join(' ') + '] ' : '') + '**' + r + ' ' + s.title + '**');
        var n = (s.note || '').trim();
        if (n) n.split('\n').forEach(function(line){ out.push('  ' + line); });
      });
      out.push('');
    }
    out.push('<sub>written in the report; ' + m.length + (TOTAL ? ' of ' + TOTAL : '') + ' ' + NOUN + 's marked</sub>');
    return out.join('\n');
  }

  var sheet = document.getElementById('fb-sheet');
  var outTa = document.getElementById('fb-out');
  var status = document.getElementById('fb-status');

  function toClipboard(text){
    if (navigator.clipboard && window.isSecureContext){
      return navigator.clipboard.writeText(text).then(function(){ return true; },
                                                      function(){ return false; });
    }
    try { outTa.select(); return Promise.resolve(document.execCommand('copy')); }
    catch (e) { return Promise.resolve(false); }
  }
  function openSheet(){
    outTa.value = markdown();
    sheet.classList.add('open');
    outTa.focus(); outTa.select();
    status.innerHTML = 'Selected &mdash; press &#8984;C / Ctrl-C, or use the button.';
    toClipboard(outTa.value).then(function(ok){
      if (ok) status.innerHTML = '&#10003; Copied to your clipboard &mdash; paste it straight back to Claude.';
    });
  }
  document.getElementById('fb-copy').addEventListener('click', openSheet);
  document.getElementById('fb-copy2').addEventListener('click', function(){
    toClipboard(outTa.value).then(function(ok){
      status.innerHTML = ok ? '&#10003; Copied.' : 'Clipboard refused &mdash; the text above is selected, press &#8984;C.';
    });
  });
  document.getElementById('fb-close').addEventListener('click', function(){ sheet.classList.remove('open'); });
  sheet.addEventListener('click', function(e){ if (e.target === sheet) sheet.classList.remove('open'); });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape') sheet.classList.remove('open');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'enter') openSheet();
  });
  document.getElementById('fb-clear').addEventListener('click', function(){
    if (!confirm('Clear every mark and note in this report?')) return;
    state = {}; overall.value = '';
    Array.prototype.forEach.call(document.querySelectorAll('.fb'), function(strip){
      strip.querySelector('textarea').value = '';
      strip.querySelector('textarea').classList.add('hidden');
      Array.prototype.forEach.call(strip.querySelectorAll('button[data-fb]'), function(b){
        b.setAttribute('aria-pressed','false'); });
    });
    save(); tally();
  });

  load();
  Array.prototype.forEach.call(document.querySelectorAll('.fb'), function(strip){
    var st = state[strip.dataset.rank]; if (!st) return;
    var ta = strip.querySelector('textarea');
    ta.value = st.note || ''; if (ta.value.trim()) ta.classList.remove('hidden');
    Array.prototype.forEach.call(strip.querySelectorAll('button[data-fb]'), function(b){
      var k = b.dataset.fb;
      var on = (k==='yes'||k==='no'||k==='star') ? st.v===k
             : (k==='dyes'||k==='dno') ? st.d===k : !!(st.note||'').trim();
      b.setAttribute('aria-pressed', String(!!on));
    });
  });
  tally();
})();
"""


def fb(rank: str, title: str, placeholder: str = "what you'd change…") -> str:
    return f"""
<div class="fb" data-rank="{rank}" data-title="{title}">
  <span class="lbl">{rank}</span>
  <button class="yes" data-fb="yes" aria-pressed="false">&#128077;</button>
  <button class="no" data-fb="no" aria-pressed="false">&#128078;</button>
  <button class="star" data-fb="star" aria-pressed="false">&#9733; build this</button>
  <span class="sep"></span>
  <button class="dyes" data-fb="dyes" aria-pressed="false">mock &#128077;</button>
  <button class="dno" data-fb="dno" aria-pressed="false">mock &#128078;</button>
  <span class="sep"></span>
  <button class="note-btn" data-fb="note" aria-pressed="false">&#9998; note</button>
  <textarea class="hidden" spellcheck="false" placeholder="{placeholder}"></textarea>
</div>"""


# --- the shared mock sample, marked up once -------------------------------
def code_html(lines: list[tuple[str, str]]) -> str:
    """(class, text) rows -> a gutter-numbered code pane."""
    out = ['<div class="gut">']
    for i, (cls, text) in enumerate(lines, start=1):
        out.append(f'<span class="n">{i}</span><span class="l">{text}</span>'
                   if not cls else
                   f'<span class="n">{i}</span><span class="l">{text}</span>')
    out.append("</div>")
    return "".join(out)


SAMPLE_ROWS = [
    ("", '<span class="k">def</span> <span class="f">estimate_pair</span>(left: <span class="t">Frame</span>, right: <span class="t">Frame</span>) -&gt; <span class="t">EstimatePairOut</span>:'),
    ("", "    rectified = <span class=\"f\">rectify</span>(left, right)"),
    ("", "    disparity = <span class=\"f\">match</span>(rectified)"),
    ("", "    <span class=\"k\">return</span> <span class=\"t\">EstimatePairOut</span>("),
    ("", "        depth=<span class=\"f\">to_depth</span>(disparity),"),
    ("", "        confidence=<span class=\"f\">score</span>(disparity),"),
    ("", "    )"),
]


def gutter(rows, highlight=(), opaque=()) -> str:
    out = ['<div class="gut">']
    for i, (_, text) in enumerate(rows, start=1):
        cls = "hl" if i in highlight else ("op" if i in opaque else "")
        out.append(
            f'<span class="n {cls}">{i}</span>' if False else ""
        )
        out.append(
            f'<span class="n{" " + cls if cls else ""}">{i}</span>'
            f'<span class="l{" " + cls if cls else ""}">{text}</span>'
        )
    out.append("</div>")
    # the .hl/.op styling keys off a wrapper, so wrap each pair in a contents row
    return "".join(out)


def gutter_rows(rows, marks: dict[int, str] | None = None) -> str:
    marks = marks or {}
    cells = []
    for i, (_, text) in enumerate(rows, start=1):
        cls = marks.get(i, "")
        cells.append(
            f'<span class="n {cls}">{i}</span><span class="l {cls}">{text}</span>'
        )
    return '<div class="gut">' + "".join(cells) + "</div>"


CSS += """
  .gut .n.hl, .gut .l.hl { background:#132018 }
  .gut .n.hl { color:var(--ok) }
  .gut .n.op, .gut .l.op { color:#5a616e }
  .gut .n.wr, .gut .l.wr { background:#1e1a10 }
  .gut .n.wr { color:var(--gold) }
"""


# ---------------------------------------------------------------------------
# Mocks
# ---------------------------------------------------------------------------
MOCK_LADDER = f"""
<div class="mock">
  <div class="mock-label">the grain ladder &mdash; the same seven lines, four ways</div>
  <div class="ladder">
    <div class="rung g0">
      <div class="rh">grain 0 &middot; one cell</div>
      <pre class="tight"><span class="g">def estimate_pair(...)
  rectified = ...
  disparity = ...
  return ...</span></pre>
      <div class="rs"><b>Exact, always.</b> One opaque block holding the bytes.
        Round trip is identity &mdash; there is nothing to decide.</div>
    </div>
    <div class="rung g1">
      <div class="rh">grain 1 &middot; the def</div>
      <div style="display:flex;justify-content:center;padding:6px 0">
        <span class="blk">estimate_pair<small>2 in &middot; 2 out</small>
          <i class="dot in"></i><i class="dot out"></i></span>
      </div>
      <div class="rs"><b>Exact.</b> Signature in, body opaque. The inverse is
        &ldquo;print the held bytes back inside the def&rdquo;.</div>
    </div>
    <div class="rung g2">
      <div class="rh">grain 2 &middot; statements</div>
      <div style="display:flex;flex-direction:column;gap:5px;align-items:center;padding:6px 0">
        <span class="blk" style="font-size:10.5px">rectify<i class="dot in"></i><i class="dot out"></i></span>
        <span class="blk" style="font-size:10.5px">match<i class="dot in"></i><i class="dot out"></i></span>
        <span class="blk" style="font-size:10.5px">to_depth &middot; score<i class="dot in"></i><i class="dot out"></i></span>
      </div>
      <div class="rs"><b>Policy starts here.</b> Statement order vs. data
        dependency; where a temporary name goes; what a comment belongs to.</div>
    </div>
    <div class="rung g3">
      <div class="rh">grain 3 &middot; expressions</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:center;padding:6px 0">
        <span class="blk" style="font-size:9.5px;padding:5px 7px">left</span>
        <span class="blk" style="font-size:9.5px;padding:5px 7px">right</span>
        <span class="blk" style="font-size:9.5px;padding:5px 7px">rectify()</span>
        <span class="blk" style="font-size:9.5px;padding:5px 7px">match()</span>
        <span class="blk" style="font-size:9.5px;padding:5px 7px">score()</span>
      </div>
      <div class="rs"><b>Underspecified.</b> Drag one node out of a loop body and
        no algorithm can know whether you meant to unroll, guard, or re-bind.</div>
    </div>
  </div>
  <div class="band"></div>
  <div class="bandlbl"><span>round trip is identity</span><span>round trip is a chosen policy</span></div>
  <p class="mock-note">This is the axis the five proposals actually differ on. Every one of them can
  do grain 0 &mdash; that is your &ldquo;one opaque source code block that runs as the entire
  code&rdquo;, and it is already the analyzer&rsquo;s own fallback, not something to invent
  (<code>{LINE_STATUS}</code> in <code>pyblocks/schema.py</code>). They differ in how far right they
  are willing to go, and who owns the leftovers when they get there.</p>
</div>"""


MOCK_P1 = """
<div class="mock">
  <div class="mock-label">P1 &mdash; select three, press one key, get a cell (and back)</div>
  <div style="display:grid;grid-template-columns:1fr 78px 1fr;gap:10px;align-items:center">
    <div class="pane">
      <div class="hd">board &middot; 3 selected <span class="chip blue">marquee</span></div>
      <div style="display:flex;flex-direction:column;gap:9px;align-items:flex-start;
                  padding:8px; border:1.5px dashed #5aa9f8; border-radius:8px">
        <span class="blk sel">rectify<small>left, right &rarr; rectified</small>
          <i class="dot in"></i><i class="dot out"></i></span>
        <span class="blk sel" style="margin-left:26px">match<small>rectified &rarr; disparity</small>
          <i class="dot in"></i><i class="dot out"></i></span>
        <span class="blk sel" style="margin-left:52px">EstimatePairOut<small>depth, confidence</small>
          <i class="dot in"></i><i class="dot out"></i></span>
      </div>
      <div style="margin-top:9px;font:11px var(--mono);color:#6b7383">
        2 edges cross the selection boundary</div>
    </div>
    <div class="arrowcol">
      <span>collapse</span><span class="big">&#8652;</span><span>expand</span>
      <span class="chip" style="margin-top:4px">&#8984;E</span>
    </div>
    <div class="pane">
      <div class="hd">board &middot; one code cell <span class="chip live">python</span></div>
      <div style="position:relative;display:block;width:100%">
        <i class="dot in" style="top:58px"></i><i class="dot in" style="top:78px"></i>
        <i class="dot out" style="top:58px"></i><i class="dot out" style="top:78px"></i>
        <div class="blk cell" style="display:block;width:100%;padding:0;overflow:hidden">
          <div style="padding:7px 10px;border-bottom:1px solid #2a3140;font-size:11px;color:#9aa3b2">
            estimate_pair <span style="color:#5a616e">&middot; 7 lines</span></div>
          <pre class="tight" style="border:0;border-radius:0;background:#08090b"><span class="k">def</span> <span class="f">estimate_pair</span>(left, right):
    rectified = <span class="f">rectify</span>(left, right)
    disparity = <span class="f">match</span>(rectified)
    <span class="k">return</span> <span class="t">EstimatePairOut</span>(
        depth=<span class="f">to_depth</span>(disparity),
        confidence=<span class="f">score</span>(disparity))</pre>
        </div>
      </div>
      <div style="margin-top:9px;font:11px var(--mono);color:#6b7383">
        those same 2 edges are now the cell&rsquo;s ports</div>
    </div>
  </div>
  <p class="mock-note">The gesture is <code>collapseToRegion</code> with a different body. The two
  edges that crossed the marquee become the cell&rsquo;s two ports by the same
  <code>classifyBoundary</code> call a Region already uses &mdash; which is why the ports are
  <em>derived</em>, not authored, and why expanding puts the original edges back with their original
  ids.</p>
</div>"""


MOCK_P2 = """
<div class="mock">
  <div class="mock-label">P2 &mdash; one node, two buffers, one of them dirty</div>
  <div class="grid2">
    <div class="pane">
      <div class="hd">the node, source side <span class="chip live">canonical &middot; you typed here</span></div>
      <pre class="tight"><span class="c"># stereo front end. do not reorder --</span>
<span class="c"># rectify must see the raw frames.</span>
<span class="k">def</span> <span class="f">estimate_pair</span>(left, right):
    rectified = <span class="f">rectify</span>(left, right)
    disparity = <span class="f">match</span>(rectified)   <span class="c"># TODO: SGBM</span>
    <span class="k">return</span> <span class="t">EstimatePairOut</span>(...)</pre>
      <div style="margin-top:9px;font:11px var(--mono);color:#6b7383">
        2 comments &middot; 1 blank line &middot; 1 trailing note &mdash; the <em>complement</em></div>
    </div>
    <div class="pane">
      <div class="hd">the node, board side <span class="chip stale">stale &middot; 1 flush behind</span></div>
      <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-start;opacity:.62">
        <span class="blk">rectify<i class="dot in"></i><i class="dot out"></i></span>
        <span class="blk" style="margin-left:24px">match<i class="dot in"></i><i class="dot out"></i></span>
        <span class="blk" style="margin-left:48px">EstimatePairOut<i class="dot in"></i></span>
      </div>
      <div style="margin-top:11px;display:flex;gap:7px;flex-wrap:wrap">
        <span class="chip">re-derive</span><span class="chip">show diff</span>
      </div>
    </div>
  </div>
  <div class="pane" style="margin-top:12px">
    <div class="hd">and when you edit both sides before flushing</div>
    <table style="margin:0">
      <tr><td style="width:42%"><code>disparity = match(rectified)</code></td>
          <td style="width:16%;text-align:center;color:#e5534b">&harr;</td>
          <td><code>disparity = match(rectified, <b>mode</b>)</code></td></tr>
      <tr><td colspan="3" style="color:#e5534b;font-size:12.5px">
        conflict &mdash; resolve in the two-pane view, no side is silently discarded</td></tr>
    </table>
  </div>
  <p class="mock-note">The comments, the blank line and the <code>TODO</code> are the
  <em>complement</em>: everything the board projection cannot hold. Keeping the source buffer is what
  makes the write-back unique instead of a guess &mdash; the constant-complement result, used as an
  implementation rather than argued with. The conflict view is already built:
  <code>scene/lineDiff.ts</code> and <code>scene/wordDiff.ts</code>.</p>
</div>"""


MOCK_P3 = """
<div class="mock">
  <div class="mock-label">P3 &mdash; the board IS the file; every block edit is a named command</div>
  <div style="display:grid;grid-template-columns:1.25fr 1fr;gap:12px">
    <div class="pane">
      <div class="hd">stereo.py <span class="chip live">canonical</span>
        <span class="chip lock">git-diffable</span></div>
      __GUT__
      <div style="margin-top:11px;padding:9px 11px;background:#12151a;border:1px solid #23272f;
                  border-radius:7px;font:11.5px/1.5 var(--mono);color:#9aa3b2">
        <span style="color:#e8c06a">rename_output_port</span>(depth &rarr; distance)<br>
        <span style="color:#3fb950">&#10003;</span> 2 lines rewritten &middot;
        <span style="color:#3fb950">&#10003;</span> every other byte identical &middot;
        <span style="color:#3fb950">&#10003;</span> 0 new dialect diagnostics
      </div>
    </div>
    <div class="pane">
      <div class="hd">the projection <span class="chip">read + command</span></div>
      <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-start">
        <span class="blk">rectify<small>lines 4</small><i class="dot in"></i><i class="dot out"></i></span>
        <span class="blk" style="margin-left:22px">match<small>lines 5</small>
          <i class="dot in"></i><i class="dot out"></i></span>
        <span class="blk" style="margin-left:44px;border-color:#e8c06a">
          EstimatePairOut<small style="color:#e8c06a">distance &middot; confidence</small>
          <i class="dot in"></i></span>
      </div>
      <div style="margin-top:12px;font:11px/1.6 var(--mono);color:#6b7383">
        view state (x, y, colour, folded)<br>keyed by <span style="color:#9aa3b2">name &rarr; graph
        &rarr; source ordinal</span>,<br>never by line number
      </div>
    </div>
  </div>
  <p class="mock-note">Nothing is stored twice. The sidecar holds only what the text genuinely
  cannot say &mdash; where you put the box &mdash; and it is addressed by the identity ladder so a
  reformat does not scatter your layout.</p>
</div>"""


MOCK_P4 = """
<div class="mock">
  <div class="mock-label">P4 &mdash; the board is truth; the file is an export with one editable band</div>
  <div style="display:grid;grid-template-columns:1fr 78px 1.25fr;gap:10px;align-items:center">
    <div class="pane">
      <div class="hd">board.systemsketch <span class="chip live">canonical</span></div>
      <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-start">
        <span class="blk">rectify<i class="dot in"></i><i class="dot out"></i></span>
        <span class="blk" style="margin-left:22px">match<i class="dot in"></i><i class="dot out"></i></span>
        <span class="blk cell" style="margin-left:44px">held code<small>3 lines, verbatim</small>
          <i class="dot in"></i><i class="dot out"></i></span>
      </div>
    </div>
    <div class="arrowcol"><span>emit</span><span class="big">&rarr;</span>
      <span style="color:#e5534b">no return</span></div>
    <div class="pane">
      <div class="hd">stereo.py <span class="chip lock">&#128274; generated</span></div>
      <pre class="tight"><span class="c"># generated by SystemSketch -- do not edit</span>
<span class="g">def estimate_pair(left, right):
    rectified = rectify(left, right)
    disparity = match(rectified)</span>
    <span class="c"># region: held</span>
    <span class="k">return</span> <span class="t">EstimatePairOut</span>(
        depth=<span class="f">to_depth</span>(disparity),
        confidence=<span class="f">score</span>(disparity))
    <span class="c"># endregion</span></pre>
      <div class="legend">
        <span><i style="background:#3b414c"></i>generated &mdash; rewritten on every emit</span>
        <span><i style="background:#c8cede"></i>held &mdash; your bytes, carried through</span>
      </div>
    </div>
  </div>
  <p class="mock-note">The honest version of Blockly. It always works and it never surprises you
  &mdash; and the arrow only points one way, so the file stops being somewhere you can
  <em>live</em>.</p>
</div>"""


MOCK_P5 = """
<div class="mock">
  <div class="mock-label">P5 &mdash; no convert button; grain is a control you hold</div>
  <div class="slider">
    <span class="stop">0 &middot; file</span>
    <span class="stop">1 &middot; defs</span>
    <span class="stop on">2 &middot; statements</span>
    <span class="stop">3 &middot; expressions</span>
  </div>
  <div class="grid3">
    <div class="pane">
      <div class="hd">at 0 &mdash; scroll it like a file</div>
      <pre class="tight"><span class="c">&quot;&quot;&quot;stereo front end.&quot;&quot;&quot;</span>
<span class="k">from</span> .frames <span class="k">import</span> Frame

<span class="k">class</span> <span class="t">EstimatePairOut</span>(NamedTuple):
    depth: <span class="t">Depth</span>
    confidence: <span class="t">float</span>

<span class="k">def</span> <span class="f">estimate_pair</span>(left, right):
    ...</pre>
    </div>
    <div class="pane">
      <div class="hd">at 1 &mdash; the file&rsquo;s shape</div>
      <div style="display:flex;flex-direction:column;gap:8px;padding-top:4px">
        <span class="blk">EstimatePairOut<small>type &middot; 2 fields</small><i class="dot out"></i></span>
        <span class="blk">estimate_pair<small>def &middot; body opaque</small>
          <i class="dot in"></i><i class="dot out"></i></span>
        <span class="blk">to_depth<small>def &middot; body opaque</small>
          <i class="dot in"></i><i class="dot out"></i></span>
      </div>
    </div>
    <div class="pane">
      <div class="hd">at 2 &mdash; inside the focused def</div>
      <div style="display:flex;flex-direction:column;gap:7px;padding-top:4px">
        <span class="blk" style="font-size:11px">rectify<i class="dot in"></i><i class="dot out"></i></span>
        <span class="blk" style="font-size:11px;margin-left:18px">match
          <i class="dot in"></i><i class="dot out"></i></span>
        <span class="blk" style="font-size:11px;margin-left:36px">EstimatePairOut
          <i class="dot in"></i></span>
        <span style="font:10.5px var(--mono);color:#5a616e;margin-top:3px">
          everything else stays at grain 1</span>
      </div>
    </div>
  </div>
  <p class="mock-note">There is no conversion <em>event</em>, so there is nothing to round-trip
  &mdash; the lens theorem bites on conversion, and a depth is just a re-derivation. Grain is
  per-container, so one function can be open at statement level while the rest of the file stays a
  list of defs. This is the &ldquo;wow, that&rsquo;s seamless&rdquo; version, and it is also the one
  that needs an incremental parser and a layout that is stable across a depth change.</p>
</div>"""


# ---------------------------------------------------------------------------
# Assemble
# ---------------------------------------------------------------------------
gut = gutter_rows(
    SAMPLE_ROWS,
    {1: "", 4: "wr", 5: "hl", 6: "hl"},
)
MOCK_P3_FILLED = MOCK_P3.replace("__GUT__", gut)

CMD_ROWS = "\n".join(
    f"<tr><td><code>{n}</code></td><td>{d}</td></tr>" for n, d in COMMAND_CLASSES
)

CRITERIA = [
    ("Seamless in <em>both</em> directions, on your own code", 25,
     "The literal ask: select code &rarr; blocks, select blocks &rarr; code, and back again without "
     "bracing for loss."),
    ("File-first &mdash; git, grep, and Claude still work", 20,
     "Your hard constraint. A projectional store buys fidelity by having no text to be unfaithful "
     "to, and pays in diff and merge. Disqualifying."),
    ("Reuses what already exists", 15,
     f"pyblocks is {int(FACTS['analyzer']) + int(FACTS['adapter']) + int(FACTS['commands']):,} "
     "lines of exactly this problem, already written. Availability before originality."),
    ("Honest about what it cannot do", 15,
     "An editor may not reject what it does not understand &mdash; it must render <em>something</em> "
     "and say so. A silent lossy round trip is the one unacceptable failure."),
    ("Time to a slice you can actually use", 15, "Measured in days, against what is on disk today."),
    ("Ceiling &mdash; does it reach &ldquo;I can use this as an IDE&rdquo;", 10,
     "Your last paragraph. Scroll a whole file, zoom into a region, come back."),
]

SCORES = {
    # name: (seamless, file-first, reuse, honest, time, ceiling)
    "P1 Opaque Cell": (3, 4, 5, 5, 5, 2),
    "P2 Two Buffers": (5, 3, 4, 4, 3, 4),
    "P3 File Is Board": (4, 5, 5, 5, 2, 5),
    "P4 Board Is Truth": (2, 2, 3, 4, 4, 2),
    "P5 Grain Slider": (5, 5, 3, 4, 1, 5),
}
WEIGHTS = [c[1] for c in CRITERIA]


def weighted(vals):
    return sum(v * w for v, w in zip(vals, WEIGHTS)) / 100


ranked = sorted(SCORES.items(), key=lambda kv: -weighted(kv[1]))

score_rows = []
for name, vals in ranked:
    total = weighted(vals)
    cls = ' class="win"' if name == ranked[0][0] else ""
    cells = "".join(f'<td class="num">{v}</td>' for v in vals)
    score_rows.append(
        f"<tr{cls}><td><b>{name}</b></td>{cells}"
        f'<td class="num"><b>{total:.2f}</b></td></tr>'
    )
SCORE_ROWS = "\n".join(score_rows)

crit_rows = "\n".join(
    f'<tr><td><b>{n}</b><br><span style="font-size:12.5px">{why}</span></td>'
    f'<td class="num">{w}%</td></tr>'
    for n, w, why in CRITERIA
)

STOCK_ROWS = [
    ("Python text &rarr; a block graph", "nothing in bbox-ui",
     "<code>pyblocks.analyzer.analyze_source</code> &rarr; <code>BlockContent</code>",
     "Never imports or executes the file. Unsupported compound statements are summarised as "
     "<em>regions</em> rather than visited arm-by-arm &mdash; the honest incomplete graph."),
    ("Block edit &rarr; the source text", "nothing in bbox-ui",
     f"<code>pyblocks.commands.apply_command</code> &mdash; {FACTS['ncommands']} command dataclasses",
     "Untouched bytes stay byte-identical. Zero new dialect diagnostics. Never partially applies; "
     "returns <code>reviewDiagnostics</code> naming what a human should look at."),
    ("Comment- and format-preserving writes", "nothing",
     "<code>libcst</code> (already wired as an evidence frontend in "
     "<code>pyblocks/source_evidence.py</code>)",
     "Comments, blank lines and formatting survive a structural edit. Never "
     "<code>ast.unparse</code> on a human-authored file."),
    ("Which block is which, across an edit", "nothing",
     f"<code>pyblocks/identity.py</code> &mdash; the four-rung ladder, {FACTS['identity']} lines",
     "id &rarr; name &rarr; graph &rarr; source ordinal, then stop and report unmatched. Position "
     "and appearance are never matching keys."),
    ("Incremental reparse while you type", "nothing",
     "<code>@codemirror/lang-python</code>&rsquo;s Lezer parser (already a dependency of the code "
     "cell)",
     "Error-tolerant, keeps a tree across keystrokes. Only P5 strictly needs it."),
    ("The code cell itself", f"<code>components/codeEditor.tsx</code> &mdash; {FACTS['codeeditor']} lines",
     "<b>unchanged (stock seam)</b> &mdash; CodeMirror 6 <code>EditorView</code>",
     "The per-keystroke write policy, the Enter/Escape exit contract, line numbers, the three "
     "overflow modes, external-value sync."),
    ("A code block on a canvas",
     f"<code>systemsketch/src/code/</code> &mdash; {FACTS['sketch_code']} files, "
     f"{FACTS['sketch_code_lines']} lines",
     "<b>unchanged (stock seam)</b> &mdash; tldraw <code>StyleProp.defineEnum</code>",
     "Language is a style, so a multi-select sets it once and the next cell remembers. Detach "
     "lowers to stock records with the full payload kept in <code>meta</code>."),
    ("Select N &rarr; one container, and back",
     f"<code>scene/collapse.ts</code> &mdash; {FACTS['collapse']} lines, "
     f"{FACTS['collapse_tests']} tests",
     "<b>unchanged (stock seam)</b> &mdash; <code>collapseToRegion</code> / <code>dissolveRegion</code>",
     "Crossing edges split rather than being remembered, so dissolve is derivable. Ids, "
     "<code>data</code> and array position survive the round trip exactly."),
    ("The container&rsquo;s ports", f"<code>scene/boundary.ts</code> &mdash; {FACTS['boundary']} lines",
     "<b>unchanged (stock seam)</b> &mdash; <code>classifyBoundary</code> / <code>promoteBoundary</code>",
     "Ports derived from the edges that cross the selection, governed by PEP 0003."),
    ("Conflict view for two dirty sides",
     "<code>scene/lineDiff.ts</code>, <code>scene/wordDiff.ts</code>",
     "<b>unchanged (stock seam)</b>",
     "Intra-line runs inked the way GitHub does it. Only P2 needs this."),
    ("A renderer-neutral document in between",
     "<code>scene/scene.ts</code> (React Flow&rsquo;s vocabulary, zero imports)",
     "<code>pyblocks.python_adapter</code> &rarr; <code>BlockView</code>",
     "No Python construct in the core schema; origin facts live in namespaced metadata. Two "
     "candidate waists exist &mdash; picking one is decision D2 below."),
]
stock_rows = "\n".join(
    f'<tr{" class=\'stock\'" if "stock seam" in part else ""}>'
    f"<td><b>{el}</b></td><td>{today}</td><td>{part}</td><td>{keep}</td></tr>"
    for el, today, part, keep in STOCK_ROWS
)


PROPS = [
    dict(
        n="P1", tag=('<span class="tag cheap">cheapest</span>'
                     '<span class="tag win">~90% already built</span>'),
        title="Opaque Cell &mdash; collapse a selection into code, expand it back",
        claim="A code cell is <b>just a container whose body is text instead of a subgraph</b>. "
              "Collapse and expand are the gesture you already have, pointed at a different payload.",
        mock=MOCK_P1,
        forward="<b>Blocks &rarr; code.</b> <code>collapseToRegion</code> on the selection, then emit "
                "the enclosed subgraph as Python instead of nesting it. The two edges that crossed "
                "the marquee become the cell&rsquo;s ports, by the same "
                "<code>classifyBoundary</code> call.",
        backward="<b>Code &rarr; blocks.</b> Parse the cell, build the subgraph, splice its stub "
                 "edges &mdash; which is <code>dissolveRegion</code>, unchanged.",
        exact="<b>code &rarr; blocks &rarr; code is byte-exact</b> when the cell was never edited "
              "(the cell keeps its own bytes; the block view is a projection of them). "
              "<b>blocks &rarr; code &rarr; blocks</b> restores every edge id, node id and array "
              "position, because that is already measured in <code>collapse.test.ts</code>.",
        loses="Positions <em>inside</em> a cell. Once it is text, the layout you authored is gone "
              "unless it is stashed in a comment or a sidecar &mdash; and a layout comment is the "
              "kind of thing that rots. Also: a cell is a box on a canvas, so it does not give you "
              "&ldquo;scroll a whole file&rdquo;.",
        cost="<b>Days, not weeks.</b> The container, the ports, the inverse and the CodeMirror cell "
             "all exist; what is new is the emitter, the parser call, and one keybinding.",
        seam="<code>scene/collapse.ts</code> gains a sibling; nothing existing changes shape.",
    ),
    dict(
        n="P2", tag='<span class="tag">the literal &ldquo;file within a file&rdquo;</span>',
        title="Two Buffers, One Dirty Side &mdash; store the complement, make the inverse unique",
        claim="Each region carries <b>both</b> the source and the board, plus a hash of the last "
              "pair that agreed. Exactly one side is authoritative at a time; converting flushes it.",
        mock=MOCK_P2,
        forward="<b>Either direction is a flush.</b> The dirty side is transformed; the clean side "
                "is <em>re-merged into</em>, not overwritten &mdash; so the comments, blank lines and "
                "statements the lowering could not model come back from the retained buffer.",
        backward="Same mechanism, mirrored. The retained buffer <em>is</em> the complement, which is "
                 "what makes the write-back unique rather than one of several defensible answers.",
        exact="<b>Both directions, as long as you do not edit both sides between flushes.</b> That "
              "is the whole trick and also the whole catch.",
        loses="Nothing to the transform &mdash; but you gain a state machine. Two dirty sides is a "
              "real conflict and must be shown as one, never silently merged. A stale buffer that "
              "looks live is worse than no buffer at all, so the staleness chip is load-bearing UI, "
              "not decoration.",
        cost="<b>Medium.</b> The transform is P1&rsquo;s. The work is the state machine and the "
             "conflict view &mdash; and the conflict view is already built "
             "(<code>lineDiff.ts</code>, <code>wordDiff.ts</code>).",
        seam="The scene record grows a per-node <code>{source, scene, agreed}</code> triple. That is "
             "a schema change, so it wants a PEP.",
    ),
    dict(
        n="P3", tag=('<span class="tag win">recommended</span>'
                     '<span class="tag">text is canonical</span>'),
        title="The File Is The Board &mdash; blocks are a live projection, edits are named commands",
        claim="Open <code>stereo.py</code> on the canvas. There is <b>no second copy of anything</b>: "
              "blocks are derived on every keystroke, and every block-side edit is a named command "
              "that rewrites the minimum number of bytes.",
        mock=MOCK_P3_FILLED,
        forward="<b>Text &rarr; blocks</b> is <code>analyze_source</code> &rarr; "
                "<code>python_adapter</code> &rarr; <code>BlockView</code>. Already written, already "
                "tested against a 49-view golden corpus.",
        backward="<b>Blocks &rarr; text</b> is <code>apply_command</code>. Not regeneration &mdash; "
                 "minimal text edits with every untouched byte preserved, refusing any result that "
                 "introduces a new dialect diagnostic.",
        exact="<b>Guaranteed by construction in the write direction.</b> The read direction is a "
              "projection, so it does not need to be exact &mdash; it needs to be <em>total</em>, "
              "which the opaque-region fallback already makes it.",
        loses="Expressiveness, deliberately. You can only make the edits the command set can "
              "express; everything else is a source edit. Today that set is "
              f"{FACTS['ncommands']} commands &mdash; enough for names and ports, not yet for "
              "rewiring. The board&rsquo;s own facts (position, colour, folded) need a sidecar, and "
              "that sidecar has to be keyed by the identity ladder or a reformat scatters your "
              "layout.",
        cost="<b>Weeks &mdash; but almost none of them on the engine.</b> "
             f"{FACTS['analyzer']} + {FACTS['adapter']} + {FACTS['commands']} lines of it exist. "
             "The work is the host: a Python process (or Pyodide) behind the canvas, the sidecar, "
             "and growing the command set.",
        seam="A new runtime dependency &mdash; the board now needs Python to open a file. That is the "
             "real cost and it should be named out loud.",
    ),
    dict(
        n="P4", tag='<span class="tag">the safe fallback</span>',
        title="Board Is Truth &mdash; code is a deterministic export with one held band",
        claim="<code>.systemsketch</code> stays canonical. Leaf blocks hold opaque code verbatim, "
              "and &ldquo;convert to code&rdquo; emits a real, runnable file. <b>Importing replaces; "
              "it never merges.</b>",
        mock=MOCK_P4,
        forward="<b>Board &rarr; code</b> is a deterministic emitter. It always succeeds.",
        backward="<b>Code &rarr; board</b> only as an import that <em>replaces</em> a selection. There "
                 "is no write-back, so there is no lens and no theorem to fight.",
        exact="board &rarr; code &rarr; board is exact. code &rarr; board &rarr; code is <b>not</b>, "
              "for anything the emitter normalises &mdash; which is most formatting.",
        loses="The thing you actually asked for. The file stops being somewhere you can live: your "
              "edits to it are provisional until the next emit. This is Blockly and Node-RED, and "
              "they are successful products &mdash; but neither is an IDE.",
        cost="<b>Smallest risk, smallest ceiling.</b> No parser on the write path at all.",
        seam="Nothing structural. It is a menu item and an emitter.",
    ),
    dict(
        n="P5", tag=('<span class="tag big">the destination</span>'
                     '<span class="tag">most expensive</span>'),
        title="No Convert Button &mdash; grain is a continuous control",
        claim="There is no conversion, so there is nothing to round-trip. <b>Parse depth is a view "
              "parameter</b>: hold it at 0 and you are scrolling a file; push it to 2 inside one "
              "function and that function is blocks.",
        mock=MOCK_P5,
        forward="Every depth is a fresh derivation from the same text. Grain is per-container, so one "
                "def can be open at statement level while the rest of the file is still a list of "
                "defs.",
        backward="A write lands at the deepest grain that <em>owns</em> the edited span &mdash; "
                 "P3&rsquo;s command set, addressed by span rather than by node.",
        exact="<b>Vacuously.</b> A projection cannot drift from its source, because it is recomputed. "
              "That is the actual answer to the round-trip problem: stop converting.",
        loses="Nothing semantically &mdash; but it is the hardest to make <em>feel</em> right. A depth "
              "change that re-lays-out the canvas reads as teleporting, so it needs a layout that is "
              "stable under depth, and an incremental parser to stay fluid while you type.",
        cost="<b>The big one.</b> P3&rsquo;s engine, plus Lezer/tree-sitter on the hot path, plus a "
             "stable-under-depth layout. The LOD lane already on the work order "
             "(<code>lodFor(zoom, thresholds)</code>) is rung one of exactly this.",
        seam="Depth becomes a first-class view axis beside the existing "
             "<code>simple / port / expanded</code> one.",
    ),
]


def prop_html(p: dict) -> str:
    return f"""
<div class="prop">
  <div class="prop-hd">
    <span class="prop-n">{p['n']}</span>
    <h3>{p['title']}</h3>
    {p['tag']}
  </div>
  <div class="prop-body">
    <p class="claim">{p['claim']}</p>
    {p['mock']}
    <div class="grid2" style="margin-top:16px">
      <div class="card"><b>forward</b><p>{p['forward']}</p></div>
      <div class="card"><b>backward</b><p>{p['backward']}</p></div>
      <div class="card ok"><b>what round-trips exactly</b><p>{p['exact']}</p></div>
      <div class="card no"><b>what it costs you</b><p>{p['loses']}</p></div>
    </div>
    <div class="grid2" style="margin-top:12px">
      <div class="card"><b>effort</b><p>{p['cost']}</p></div>
      <div class="card"><b>seam it changes</b><p>{p['seam']}</p></div>
    </div>
    {fb(p['n'], p['title'].split(' &mdash; ')[0])}
  </div>
</div>"""


PROPS_HTML = "\n".join(prop_html(p) for p in PROPS)


ASKS = [
    dict(
        n="D1",
        q="Is text canonical, or is the board?",
        body="This is the only decision the other four follow from, and it is genuinely yours &mdash; "
             "it is a product call about where you want to live, not an engineering one. "
             "<b>P3/P5 say text.</b> <b>P4 says board.</b> <b>P2 says &ldquo;whichever you touched "
             "last&rdquo;</b>, which is the most pleasant and the most machinery.",
        default="I take <b>text canonical</b> &mdash; it is the only answer consistent with the "
                "file-first rule you have held everywhere else, and it is the one your 2026-07-16 "
                "round-trip pass already landed on. Reversible: nothing built for P1 is wasted "
                "under any of the three.",
    ),
    dict(
        n="D2",
        q="One waist or two? <code>BlockView</code> or <code>BlockScene</code>?",
        body="pyblocks already has a renderer-neutral document (<code>blockview.py</code>) and "
             "bbox-ui now has one too (<code>scene/scene.ts</code>, React&nbsp;Flow&rsquo;s "
             "vocabulary, proven assignable with no cast). They overlap almost entirely. Keeping "
             "both means an adapter forever; collapsing them is a real migration in whichever "
             "direction loses.",
        default="I write <b>a thin <code>BlockView &rarr; BlockScene</code> adapter</b> and do not "
                "migrate either. It is ~150 lines, it keeps pyblocks publishable on its own, and it "
                "defers a merge that wants its own PEP. Say the word and I will instead make "
                "<code>BlockScene</code> the single waist.",
    ),
    dict(
        n="D3",
        q="Does a code cell keep the layout of the blocks it swallowed?",
        body="Collapse three blocks into a cell, expand it again &mdash; do they come back where they "
             "were? Storing it means a layout side-table keyed to source spans, which is exactly the "
             "kind of fact that goes stale (the reason <code>collapse.ts</code> refuses to remember "
             "its promoted ports). Not storing it means expanding always re-lays-out.",
        default="<b>Store it, in the sidecar, keyed by the identity ladder &mdash; and treat a miss as "
                "a re-layout, never as an error.</b> A best-effort memory that degrades quietly is "
                "worth more here than purity, because the alternative is your arrangement exploding "
                "every time you peek at the code.",
    ),
    dict(
        n="D4",
        q="Is the dialect a constraint you accept?",
        body="pyblocks&rsquo; write path is safe <em>because</em> it only writes a constrained Python "
             "(PB1 named-output types, and so on). Arbitrary Python is always <em>readable</em>; it "
             "is the block&rarr;text direction that needs the dialect. If the dialect is too tight, "
             "P3 degrades into P4 for the files it cannot write.",
        default="<b>Accept it, and make it visible per block</b> &mdash; a block you can edit from "
                "the canvas looks different from one you can only read. That is the editability-zone "
                "rule you already agreed to; the new part is that the badge is drawn on the block, "
                "not written in a doc.",
    ),
]

ASK_HTML = "\n".join(
    f"""<div class="ask">
  <h3>{a['n']} &middot; {a['q']}</h3>
  <p style="color:var(--dim);font-size:14px;margin:0">{a['body']}</p>
  <p class="dflt"><b>If you say nothing:</b> {a['default']}</p>
  {fb(a['n'], a['q'].replace('<code>', '').replace('</code>', ''), 'your call…')}
</div>"""
    for a in ASKS
)


SHOTS_HTML = f"""
<div class="shots">
  <figure><img src="{shot('grouping-roundtrip')}" alt="collapse and dissolve round trip">
    <figcaption><b>The inverse is already exact.</b>
      <code>scene-grouping--round-trip</code>: collapse, then dissolve, and
      <code>JSON.stringify(before) === JSON.stringify(dissolved)</code> is
      <span style="color:#3fb950">IDENTICAL</span>. P1 rides this unchanged.</figcaption></figure>
  <figure><img src="{shot('grouping-ports')}" alt="promoted ports contract">
    <figcaption><b>A container&rsquo;s ports are derived, not authored.</b>
      <code>PromotedPort</code> already carries <code>inner</code>/<code>outer</code> per port &mdash;
      which is precisely what a code cell needs to know in order to be expanded back.</figcaption></figure>
  <figure><img src="{shot('code-in-block')}" alt="a code editor inside a block">
    <figcaption><b>&ldquo;Defining some types, the data classes or whatever&rdquo; &mdash; already
      renders.</b> <code>components-blocks-block--code-inside-block</code> puts a real CodeMirror document in a
      Block&rsquo;s Attributes slot.</figcaption></figure>
  <figure><img src="{shot('code-reactflow')}" alt="a code cell as a React Flow node">
    <figcaption><b>And already survives a host.</b> The same cell as a React Flow node &mdash; so
      &ldquo;a code block is a node&rdquo; needs no new adapter.</figcaption></figure>
  <figure><img src="{shot('line-diff')}" alt="line diff on code">
    <figcaption><b>P2&rsquo;s conflict view exists.</b> <code>scene/lineDiff.ts</code> already inks a
      code-level diff; two dirty buffers would render through it rather than through anything new.</figcaption></figure>
  <figure><img src="{shot('code-themes')}" alt="code editor syntax themes">
    <figcaption><b>The cell itself.</b> {FACTS['codeeditor']} lines in the trunk, CodeMirror&nbsp;6,
      with the write policy and exit contract already settled.</figcaption></figure>
</div>"""


HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Source code view — five proposals</title>
<style>{CSS}</style>
</head><body><div class="wrap">

<p class="kicker">bbox-ui &middot; systemsketch &middot; pyblocks &nbsp;&middot;&nbsp; proposals &nbsp;&middot;&nbsp; 2026-09-18</p>
<h1>Source code view</h1>
<p class="sub">Five ways to make code and blocks the same document &mdash; and the one sentence in
your note that decides which.</p>

<div class="lede">
  <p><b>Recommendation: P3, shipped as P1 first, aimed at P5.</b> Text stays canonical and the board
  is a live projection of it (<b>P3</b>); the first gesture to build is collapse-a-selection-into-a-cell
  (<b>P1</b>), which is about 90% already on disk; the thing you described in your last paragraph
  &mdash; scroll a file, zoom, it becomes blocks, zoom back &mdash; is <b>P5</b>, and it is P3 plus a
  depth control. <b>P2</b> contributes one amendment worth taking: <i>store the complement</i>.
  <b>P4</b> is the fallback if the dialect turns out to be too tight.</p>
  <p style="margin-top:12px"><b>And one reframe, because your own sentence is the design.</b>
  &ldquo;The simplest pyblocks scene anyways is just 1 opaque source code block that runs as the
  entire code&rdquo; is not a simplification &mdash; it is the <b>base case that makes the whole thing
  total</b>. Any region of Python can always become exactly one block, losslessly. So the conversion
  never fails; it only becomes <em>more opinionated</em> as the grain gets finer. The question is
  never &ldquo;can we round-trip&rdquo;. It is <b>at which grain, and who owns the leftovers</b>.</p>
</div>

<div class="facts">
  <div class="fact"><b>{FACTS['analyzer']}</b><span>lines · Python → blocks</span></div>
  <div class="fact"><b>{FACTS['commands']}</b><span>lines · blocks → Python</span></div>
  <div class="fact"><b>{FACTS['ncommands']}</b><span>edit commands written</span></div>
  <div class="fact"><b>{FACTS['collapse']}</b><span>lines · collapse ⇄ dissolve</span></div>
  <div class="fact"><b>{FACTS['collapse_tests']}</b><span>tests on that inverse</span></div>
  <div class="fact"><b>{FACTS['codeeditor']}</b><span>lines · the code cell</span></div>
  <div class="fact"><b>{FACTS['sketch_code_lines']}</b><span>lines · code shape in SystemSketch</span></div>
</div>
<p style="font-size:12.5px;color:var(--dim2);margin:10px 0 0">Every number here is read off a tree at
build time, not recalled &mdash; <code>/home/bam/pyblocks</code>, <code>/home/bam/systemsketch</code>,
and <code>{LANE}</code>.</p>

<h2>The axis the five differ on</h2>
{MOCK_LADDER}

<div class="lede blue">
  <p><b>&ldquo;It&rsquo;s not like Enso&rdquo; &mdash; here is exactly why you are right.</b> Enso
  buys lossless text&harr;graph by <em>constraining the language</em> until the graph is total: every
  program it accepts is a functional dataflow graph, which is why arbitrary Python cannot be one.
  Your design inverts that.
  <b>Enso constrains the language so the graph is total; this constrains the <em>graph</em> so the
  language is total.</b> The opaque cell is what pays for it &mdash; a construct the lowering does not
  model is not an error, it is a box. That is the difference between an honest incomplete graph and a
  plausible false one, and it is already the analyzer&rsquo;s stated design, not something to add.</p>
</div>

<h2>What is already on disk</h2>
<p style="color:var(--dim);margin-bottom:4px">Nothing below is proposed &mdash; it is inventory. Rows
marked <b>stock seam</b> are the ones this work should deliberately <em>not</em> touch.</p>
<table>
  <tr><th>Element</th><th>Today</th><th>Off-the-shelf part</th><th>Behaviour that must survive</th></tr>
  {stock_rows}
</table>

{SHOTS_HTML}

<h2>The backward pass already exists, and it is not a code generator</h2>
<div class="lede green">
  <p>Worth being precise about, because it changes what is expensive. pyblocks&rsquo; blocks&rarr;text
  direction is <b>not</b> &ldquo;render the graph as Python&rdquo;. It is a set of named semantic
  commands that perform <b>minimal text edits</b> &mdash; untouched bytes stay byte-identical &mdash;
  and that <b>refuse</b> any result introducing a new dialect diagnostic. What a command cannot safely
  rewrite, it reports instead.</p>
  <p>That is the difference between a toy and something you can point at a real file. It also means
  the expensive part of P3 is <em>not</em> the round trip &mdash; it is growing the command set.</p>
</div>
<table>
  <tr><th>Command</th><th>What it guarantees</th></tr>
  {CMD_ROWS}
</table>

<h2>What good looks like, before comparing</h2>
<table>
  <tr><th>Criterion</th><th>Weight</th></tr>
  {crit_rows}
</table>

<h2>The five</h2>
{PROPS_HTML}

<h2>Scored against those criteria</h2>
<table>
  <tr><th>Proposal</th>
    <th style="text-align:right">seam<br>less</th><th style="text-align:right">file<br>first</th>
    <th style="text-align:right">re<br>use</th><th style="text-align:right">hon<br>est</th>
    <th style="text-align:right">time</th><th style="text-align:right">ceil<br>ing</th>
    <th style="text-align:right">total</th></tr>
  {SCORE_ROWS}
</table>
<p style="font-size:12.5px;color:var(--dim2)">Each column 1&ndash;5, weighted by the table above.
The ranking is not close at the top or the bottom: P3 wins on file-first, reuse and honesty while
giving up only speed-to-first-slice, and P4 loses on the two heaviest criteria at once. P1 and P5
sit a hair apart for opposite reasons &mdash; P1 is nearly free and low-ceiling, P5 is the opposite.
<b>Which is the actual argument for doing both</b>, in that order.</p>

<div class="lede">
  <p><b>They are a ladder, not a menu &mdash; and that is not a dodge.</b> P1 is a strict subset of
  P2; P5 is P3 plus one control. The only genuinely exclusive choice in the set is <b>P3 versus
  P4</b>: who owns the truth. Everything else is sequencing.</p>
  <p style="margin-top:10px"><b>The order I would build it:</b>
  <br>&nbsp;&nbsp;<b>1.</b> P1&rsquo;s gesture, with the cell holding bytes and nothing else. One
  week or so, and it is useful on its own &mdash; it is already how you would want to park a messy
  region.
  <br>&nbsp;&nbsp;<b>2.</b> P3&rsquo;s read path behind it: the cell&rsquo;s contents get lowered, so
  expanding is a parse rather than a replay. This is where pyblocks arrives.
  <br>&nbsp;&nbsp;<b>3.</b> P3&rsquo;s write path, one command at a time, each with its block-level
  badge. Rename first; rewiring last.
  <br>&nbsp;&nbsp;<b>4.</b> P5&rsquo;s depth control, once the layout is stable enough that changing
  grain does not feel like teleporting.</p>
</div>

<h2>What needs you</h2>
<p style="color:var(--dim);margin-bottom:16px">Four decisions. Each carries the reversible default I
take if you say nothing, so silence keeps this moving.</p>
{ASK_HTML}

<div class="ask" style="border-color:#3a4250">
  <h3>Anything else</h3>
  <p style="color:var(--dim);font-size:14px;margin:0 0 10px">Goes at the top of the copied markdown.</p>
  <textarea id="fb-overall" spellcheck="false" placeholder="overall reaction, a direction I missed, a splice across two of them…"
    style="width:100%;min-height:90px;background:#08090b;color:var(--fg);border:1px solid var(--line2);
           border-radius:8px;padding:10px 12px;font:13px/1.55 var(--mono);resize:vertical"></textarea>
</div>

<h2>Deliberately not proposed</h2>
<div class="lede">
  <p><b>A projectional store (MPS-style).</b> It would make every one of these problems disappear by
  having no canonical text to be unfaithful to &mdash; and it would break git, grep, and Claude
  editing your files. Ruled out by your own file-first line, not by taste.</p>
  <p><b>Inferring the &ldquo;intended&rdquo; source edit.</b> Drag one node out of a loop body and
  there is no algorithm that can know whether you meant to change the bound, unroll, or special-case
  it. Every proposal above either refuses that edit or routes it to a code edit; none of them guess.</p>
  <p><b>Executing the file to build the view.</b> The analyzer&rsquo;s standing rule, and it should
  stay: a static, best-effort projection that never imports or runs what it is looking at. A source
  view that can hang or delete your files is not a view.</p>
  <p><b>A second language.</b> Everything here is Python-shaped because pyblocks is. The
  <code>BlockView</code> vocabulary is deliberately language-free, so a second front end is possible
  later &mdash; but proposing it now would be inventing a requirement you did not state.</p>
</div>

<div class="dock" data-report="source code view (2026-09-18)" data-noun="item" data-total="9">
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
      <span class="sp"></span>
      <button class="go" id="fb-copy2">Copy to clipboard</button></footer>
  </div>
</div>

<footer class="page">
<p><b>Read, not recalled.</b> The forward pass: <code>pyblocks/analyzer.py</code> (its module
docstring is where &ldquo;unsupported compound statements are summarized as regions&rdquo; comes
from) and <code>pyblocks/python_adapter.py</code>. The backward pass:
<code>pyblocks/commands.py</code> &mdash; the byte-identical and zero-new-diagnostics guarantees are
that module&rsquo;s own stated contracts, and the {FACTS['ncommands']} command rows above are parsed
out of its class docstrings at build time. Identity: <code>pyblocks/identity.py</code>. Line
accounting: <code>pyblocks/schema.py</code> (<code>{LINE_STATUS}</code>). Collapse and boundary:
<code>git show {LANE}:apps/storybook-basics/src/scene/{{collapse,boundary}}.ts</code>. The code cell:
<code>apps/storybook-basics/src/components/codeEditor.tsx</code>. The canvas code shape:
<code>systemsketch/src/code/</code> and <code>src/blocks/babble/useSourceToggleEditor.ts</code>.</p>
<p><b>Theory, from your own vault, not from memory.</b> The &ldquo;the inverse is underspecified&rdquo;
claim is Bancilhon&ndash;Spyratos constant complement and the Foster et&nbsp;al. lens classification,
as recorded in <code>C - Bidirectional Transformation (Lenses).md</code>; the opaque-node argument is
<code>C - Full-Fidelity Syntax Trees</code>; the projectional trade-off is
<code>C - Projectional Editing</code>; the per-object editability badge in D4 is
<code>C - Editable Ownership Zones</code>, and the recommendation in D1 is the same one your
2026-07-16 round-trip pass landed on.</p>
<p><b>No new algorithms are proposed here</b>, so there is nothing to attribute beyond the files
above &mdash; every transform named is one that already exists on disk at the path given.</p>
<p><b>Built by</b> <code>docs/build_source_code_view_report.py</code> from
<code>{FACTS['head']}</code>, captures by <code>docs/capture_source_code_view_shots.mjs</code>
against the Storybook already running on :5421 (lane <code>{FACTS['lanehead']}</code>).
Nothing was started or stopped to make this page.</p>
</footer>

</div>
<script>{FB_SCRIPT}</script>
</body></html>"""

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(HTML)
size = OUT.stat().st_size
print(f"wrote {OUT}  ({size:,} bytes on disk)")

encoded = len(quote(HTML, safe="").encode())
cap = 2_097_024
print(
    f"encoded data: URL {encoded:,} / {cap:,} bytes  ({encoded / cap:.0%})"
    f"  -> {'OK, opens in preview' if encoded < cap else 'OVER CAP - browser-only'}"
)
if encoded >= cap:
    sys.exit(0)
