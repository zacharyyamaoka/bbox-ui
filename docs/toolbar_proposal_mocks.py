#!/usr/bin/env python3
"""The five selection-toolbar proposals, as ONE live page.

Round: Zach, 2026-09-24 (`Sources/Daily Notes/Daily Note - Sep 24 2026.md`,
"## bbox ui feedback"):

    Also I don't like how setting the size of the text also sets the size of
    the line width (thats tldraws convention) but I want thoose to be
    seperate things here.
    I prefer how the drop down looked in the old system sketch. For example in
    text size it gave the option for a custom size and in the line types it
    showed a little icon of what it would look like ...
    Here you also have color and fill type differently in old system sketch we
    had thoose in drop down menu ...
    Generally I like a very compact tool bar, 1 for dealing with the inside,
    1 for dealling with the stroke, etc.. Please reference the old system
    sketch. make 5 proposals. 1 basically copying the old system sketch but
    with our new more modular design. 2-5 can be whatever else you want.

  ... and, mid-round:

    I also don't like the opacity slider on the tool bar ... that is something
    that relates to the fill and stroke. By default the stroke color should
    follow the fill color, unless you specifically set the stroke color, then
    it now indepently moves.

WHY this is a live page rather than five static pictures: every complaint in
that round is about a RELATIONSHIP between two controls — text size vs stroke
width, fill colour vs stroke colour, opacity vs the thing it fades. A
screenshot can show a layout but cannot show a relationship; you have to drag
the size and watch the outline hold. So the shape on this page is painted from
the same state the triggers read, and the proposals differ only in how that
one state is reached.

The variant switcher is bottom-right and remembers the choice
(`feedback_prototype_switch_in_app`): a URL flag Zach has to type is not a
review surface.

  python3 docs/toolbar_proposal_mocks.py [--out DIR]

Writes `mock.html` (all five, switchable) plus `mock-p1.html` … `mock-p5.html`
(one proposal each, pinned, for the capture script).
"""
from __future__ import annotations

import argparse
import pathlib

# ── measured constants ─────────────────────────────────────────────────────
#
# The palette is SAMPLED from the running app's own colour popover
# (`reports/media/toolbars-2026-09-20/02-colour-panel-open.png`, the 2026-09-20
# round's capture) rather than retyped from tldraw's source: tldraw 5 no longer
# exports `DefaultColorThemePalette`, and a hand-typed hex table is exactly the
# thing that silently goes wrong in dark mode. Pixel-sampled at each swatch
# centre; see the `--palette` note in docs/build_toolbar_proposals_report.py.
PALETTE = [
    ("black", "#1d1d1d"), ("grey", "#9fa8b2"), ("light-violet", "#e085f4"),
    ("violet", "#ae3ec9"), ("blue", "#4465e9"), ("light-blue", "#4ba1f1"),
    ("yellow", "#f1ac4b"), ("orange", "#e16919"), ("green", "#099268"),
    ("light-green", "#4cb05e"), ("light-red", "#f87777"), ("red", "#e03131"),
    ("white", "#ffffff"),
]

# Pill geometry, from the archived app's `src/appearance/figjamTokens.ts` —
# themselves read off FigJam with getComputedStyle, not eyeballed.
TOKENS = dict(
    SURFACE="#1e1e1e", DIVIDER="#383838", ACCENT="#9747ff", ACCENT_RADIO="#8a38f5",
    PILL_HEIGHT=40, PILL_RADIUS=13, TRIGGER_RADIUS=5, TRIGGER_WIDTH=56,
    TEXT_TRIGGER_WIDTH=144, SWATCH_SIZE=24, SWATCH_PITCH=32, CELL_SIZE=24,
    POPOVER_GAP=8, POPOVER_PADDING=8,
)

# `strokeMeta.ts:87-91` — the three rungs, anchored so nothing on an existing
# board moves. THE POINT of this round: these are not the text ladder.
STROKE_PX = {"thin": 2, "medium": 3.5, "thick": 7}
# `customFontSize.ts:31-33` STOCK_LABEL_BASE_PX, the rung → px the old app
# printed beside each font-size row.
FONT_PX = {"s": 18, "m": 22, "l": 26, "xl": 32}

CHEVRON_PATH = (
    "M9.768 6.768a.5.5 0 0 1 .707.707l-2.12 2.121a.5.5 0 0 1-.708 0L5.525 "
    "7.475a.5.5 0 0 1 .708-.707l1.768 1.767z"
)

PROPOSALS = [
    ("p1", "SystemSketch Classic",
     "The archived pill, rebuilt on the trunk kit. Inside · Stroke · Type, "
     "each a stacked popover."),
    ("p2", "Two Faces",
     "Three style triggers, and each face is a live drawing of the result: "
     "Inside, Edge, Text."),
    ("p3", "One Appearance Panel",
     "A single Appearance trigger opening Figma's right rail as one sectioned "
     "popover."),
    ("p4", "Linked Pair",
     "Fill and stroke fused into one disc-in-ring trigger with a visible chain "
     "you can break."),
    ("p5", "Inline Tray",
     "No floating popover: the pill grows a tray beneath itself, so it never "
     "covers the shape it is styling."),
]


# ── css ────────────────────────────────────────────────────────────────────

CSS = """
:root {
  --surface:#1e1e1e; --divider:#383838; --accent:#9747ff; --accent-radio:#8a38f5;
  --ink:#e9e9e9; --ink-dim:rgba(233,233,233,.55);
  --shadow: 0 0 .5px rgb(0 0 0 / 12%), 0 10px 16px rgb(0 0 0 / 12%), 0 2px 5px rgb(0 0 0 / 15%);
  --board:#111215;
}
* { box-sizing:border-box }
html, body { height:100% }
body {
  margin:0; background:var(--board); color:var(--ink);
  font:13px/1.4 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  -webkit-font-smoothing:antialiased;
}

/* ── the board ─────────────────────────────────────────────────────────── */
#board { position:relative; height:100%; overflow:hidden }
#title {
  position:absolute; left:0; right:0; top:52px; text-align:center;
  font-family:"Comic Sans MS","Segoe Print",cursive; font-size:34px; letter-spacing:.5px;
}
#stage { position:absolute; left:50%; top:230px; transform:translateX(-50%) }
#shape { display:block }
#selection {
  position:absolute; inset:-1px; border:1.5px solid #4a9eff; pointer-events:none;
}
#selection i {
  position:absolute; width:7px; height:7px; background:#fff; border:1.5px solid #4a9eff;
}
#selection i:nth-child(1){left:-4px;top:-4px} #selection i:nth-child(2){right:-4px;top:-4px}
#selection i:nth-child(3){left:-4px;bottom:-4px} #selection i:nth-child(4){right:-4px;bottom:-4px}

/* ── the pill ──────────────────────────────────────────────────────────── */
#pillwrap { position:absolute; left:50%; top:150px; transform:translateX(-50%); z-index:30 }
.pill {
  display:flex; align-items:center; height:40px; padding:0 4px;
  background:var(--surface); border-radius:13px; box-shadow:var(--shadow);
  position:relative;
}
.pill.tray:has(#tray[data-open="true"]) { border-radius:0 0 13px 13px }
.sep { width:1px; align-self:stretch; margin:8px 4px; background:var(--divider) }

.trig {
  display:flex; align-items:center; gap:2px; height:32px; padding:0 4px;
  background:none; border:0; color:var(--ink); border-radius:5px; cursor:pointer;
  font:inherit; font-size:11px;
}
.trig:hover { background:rgba(255,255,255,.08) }
.trig[aria-expanded="true"] { background:rgba(255,255,255,.14) }
.trig .chev { width:16px; height:16px; fill:currentColor; opacity:.7; flex:none }
.trig .word { padding:0 4px; white-space:nowrap }
.trig .px { color:var(--ink-dim); font-variant-numeric:tabular-nums; padding-right:2px }
.trig.combo { width:144px; justify-content:space-between }
.trig.icon { width:auto }
.glyph { width:24px; height:24px; fill:none; stroke:currentColor; stroke-width:1.5;
         stroke-linecap:round; stroke-linejoin:round; flex:none }
.disc { width:18px; height:18px; border-radius:50%; box-shadow:inset 0 0 0 1px rgb(255 255 255 / 20%);
        flex:none }
.discbox { width:22px; height:22px; display:grid; place-items:center; flex:none }

/* the disc-in-ring face (P4) and the live result face (P2) */
.pairface { width:24px; height:24px; position:relative; flex:none }
.pairface .ring { position:absolute; inset:0; border-radius:50%; border-style:solid }
.pairface .core { position:absolute; inset:6px; border-radius:50% }
.chain { width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:1.6; opacity:.85; flex:none }
.chain[data-broken="true"] { opacity:.45 }
.resultface { width:24px; height:24px; flex:none; border-radius:4px }

/* ── popovers ──────────────────────────────────────────────────────────── */
.pop {
  position:absolute; z-index:40; background:var(--surface); border-radius:13px;
  box-shadow:var(--shadow); padding:8px; display:none;
}
.pop[data-open="true"] { display:block }
.pop.above { bottom:calc(100% + 8px) } .pop.below { top:calc(100% + 8px) }

.section + .section { margin-top:8px; padding-top:8px; border-top:1px solid var(--divider) }
.section > .caption {
  font-size:10px; letter-spacing:.06em; text-transform:uppercase;
  color:var(--ink-dim); padding:0 4px 6px;
}

.chips { display:flex; gap:4px; padding:0 4px }
.chip {
  display:flex; align-items:center; gap:4px; height:24px; padding:0 6px 0 4px;
  border:0; border-radius:5px; background:none; color:var(--ink); cursor:pointer;
  font:inherit; font-size:11px; white-space:nowrap;
}
.chip:hover { background:rgba(255,255,255,.08) }
.chip[aria-checked="true"] { background:var(--accent) }
.chip .glyph { width:16px; height:16px }

.cells { display:flex; gap:8px; padding:0 4px }
.cell {
  width:24px; height:24px; display:grid; place-items:center; border:0; border-radius:5px;
  background:none; color:var(--ink); cursor:pointer; padding:0;
}
.cell:hover { background:rgba(255,255,255,.08) }
.cell[aria-checked="true"] { background:var(--accent-radio) }

.swatches { display:grid; grid-template-columns:repeat(7,24px); gap:8px; padding:4px }
.sw { width:24px; height:24px; border-radius:50%; border:0; cursor:pointer; padding:0;
      box-shadow:inset 0 0 0 1px rgb(255 255 255 / 20%) }
.sw[aria-checked="true"] { box-shadow:inset 0 0 0 1px rgb(255 255 255 / 20%),
                                       0 0 0 2px var(--surface), 0 0 0 4px var(--accent-radio) }
.sw.wheel { background:conic-gradient(#f00,#ffa800 47.73deg,#ff0 79.56deg,#0f0 121.33deg,
            #0ff 180.99deg,#00f 238.67deg,#f0f 294.36deg,#f00 360deg) }

.list { display:flex; flex-direction:column; min-width:172px }
.row {
  display:flex; align-items:center; gap:6px; height:28px; padding:0 8px 0 4px;
  border:0; border-radius:5px; background:none; color:var(--ink); cursor:pointer;
  font:inherit; text-align:left; width:100%;
}
.row:hover { background:rgba(255,255,255,.08) }
.row .tick { width:16px; flex:none; opacity:0; font-size:12px }
.row[aria-checked="true"] .tick { opacity:1 }
.row .grow { flex:1 }
.row .px { color:var(--ink-dim); font-size:11px; font-variant-numeric:tabular-nums }

.custom {
  display:flex; align-items:center; gap:6px; height:32px; margin-top:8px;
  padding:0 4px 0 8px; border-top:1px solid var(--divider); padding-top:8px;
  font-size:11px; color:var(--ink-dim);
}
.custom input {
  width:56px; height:24px; background:#383838; border:1px solid #444; border-radius:5px;
  color:var(--ink); font:inherit; font-size:11px; text-align:center; padding:0;
  font-variant-numeric:tabular-nums;
}
.custom input:focus { outline:none; border-color:#0c8ce9 }

.opacity { display:flex; align-items:center; gap:8px; padding:4px 6px; min-width:196px }
.opacity label { font-size:11px; color:var(--ink-dim); width:46px; flex:none }
.opacity input[type=range] { flex:1; accent-color:var(--accent); height:16px }
.opacity output { font-size:11px; width:34px; text-align:right; font-variant-numeric:tabular-nums }

.linkrow {
  display:flex; align-items:center; gap:8px; padding:4px 6px; font-size:11px;
  color:var(--ink-dim); min-width:196px;
}
.linkrow button {
  margin-left:auto; height:22px; padding:0 8px; border-radius:5px; border:1px solid var(--divider);
  background:none; color:var(--ink); font:inherit; font-size:11px; cursor:pointer;
}
.linkrow button:hover { background:rgba(255,255,255,.08) }
.linkrow[data-linked="true"] .state { color:#6ee7a8 }

/* ── P3's one panel ────────────────────────────────────────────────────── */
.panel { min-width:268px; max-height:min(440px, calc(100vh - 230px)); overflow-y:auto;
          scrollbar-width:thin; scrollbar-color:#3a4150 transparent }
.panel .prow { display:flex; align-items:center; gap:8px; height:30px; padding:0 4px }
.panel .prow > .lab { font-size:11px; color:var(--ink-dim); width:52px; flex:none }

/* ── P5's tray ─────────────────────────────────────────────────────────── */
#tray {
  position:absolute; bottom:100%; left:0; right:0; background:var(--surface);
  border-radius:13px 13px 0 0; box-shadow:var(--shadow); padding:8px;
  border-bottom:1px solid var(--divider); display:none;
}
#tray[data-open="true"] { display:block }

/* ── switcher + readout ────────────────────────────────────────────────── */
#switch {
  position:fixed; right:16px; bottom:16px; z-index:60; display:flex; align-items:center; gap:8px;
  background:#16181d; border:1px solid #2a2f3a; border-radius:10px; padding:8px 10px;
  box-shadow:var(--shadow); font-size:12px;
}
#switch select {
  background:#0f1115; color:var(--ink); border:1px solid #2a2f3a; border-radius:6px;
  padding:5px 8px; font:inherit;
}
#readout {
  position:fixed; left:16px; bottom:16px; z-index:60; background:#16181d;
  border:1px solid #2a2f3a; border-radius:10px; padding:10px 12px; font-size:11px;
  font-family:ui-monospace,Menlo,Consolas,monospace; color:var(--ink-dim); line-height:1.7;
  box-shadow:var(--shadow);
}
#readout b { color:var(--ink); font-weight:600 }
#readout .hi { color:#6ee7a8 }
#caption {
  position:fixed; left:50%; transform:translateX(-50%); bottom:16px; z-index:55;
  max-width:560px; text-align:center; font-size:12px; color:var(--ink-dim);
}
#caption b { color:var(--ink) }
"""


# ── the page's javascript ──────────────────────────────────────────────────

def js(palette, stroke_px, font_px, proposals) -> str:
    import json
    body = """
const PALETTE = __PALETTE__;
const STROKE_PX = __STROKE_PX__;
const FONT_PX = __FONT_PX__;
const PROPOSALS = __PROPOSALS__;
const HEX = Object.fromEntries(PALETTE);

// WHY one state object shared by every proposal: the five differ only in the
// route to a value, never in the value. Anything that read its own copy would
// let a proposal look right while lying about the model underneath it.
const S = {
  fill: "green", fillStyle: "semi", fillOpacity: 1,
  stroke: "green", strokeLinked: true, strokeWidth: "medium", dash: "solid", strokeOpacity: 1,
  font: "draw", size: "m", customPx: null, align: "middle",
};

const CHEV = "__CHEVRON__";

function chevron() { return `<svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="${CHEV}"/></svg>`; }

/* ── glyphs: ported 1:1 from apps/storybook-basics/src/editor/controlGlyphs.tsx
      (FillGlyph :86-112, DASH_ARRAYS + DashGlyph :121-149, strokeWidthPxForRung
      :166-172) so a preview here cannot drift from the kit that would ship. */
const DASH_ARRAYS = { draw:null, solid:null, dashed:"4 3", dotted:"0.1 3.2", none:null };

function dashGlyph(v, cls) {
  cls = cls || "glyph";
  if (v === "none") {
    return `<svg class="${cls}" viewBox="0 0 20 20"><path d="M3 17 17 3"/><circle cx="10" cy="10" r="7"/></svg>`;
  }
  const d = v === "draw" ? "M3 12.5c4-6 6 2 14-4.5" : "M3 10h14";
  const da = DASH_ARRAYS[v] ? ` stroke-dasharray="${DASH_ARRAYS[v]}"` : "";
  const lc = v === "dotted" ? ` stroke-linecap="round"` : ` stroke-linecap="butt"`;
  return `<svg class="${cls}" viewBox="0 0 20 20"><path d="${d}"${da}${lc}/></svg>`;
}

function fillGlyph(v, cls) {
  cls = cls || "glyph";
  const box = `<rect x="3.5" y="3.5" width="13" height="13" rx="2"/>`;
  if (v === "none") return `<svg class="${cls}" viewBox="0 0 20 20">${box}</svg>`;
  if (v === "pattern") {
    return `<svg class="${cls}" viewBox="0 0 20 20">${box}` +
      ["M4 12l8-8","M4 16l12-12","M8 16l8-8"].map(d=>`<path d="${d}" stroke-width="1"/>`).join("") +
      `</svg>`;
  }
  const op = v === "semi" ? 0.35 : 1;
  return `<svg class="${cls}" viewBox="0 0 20 20">` +
    `<rect x="3.5" y="3.5" width="13" height="13" rx="2" fill="currentColor" opacity="${op}" stroke="none"/>` +
    box + `</svg>`;
}

function widthGlyph(v, cls) {
  const px = STROKE_PX[v];
  return `<svg class="${cls||"glyph"}" viewBox="0 0 20 20"><path d="M3 10h14" stroke-width="${px}" stroke-linecap="round"/></svg>`;
}

function alignGlyph(v, cls) {
  const rows = { start:[14,9,12], middle:[14,10,12], end:[14,11,12] }[v] || [14,10,12];
  const x = { start:[3,3,3], middle:[3,5.5,4], end:[3,8,5] }[v] || [3,5.5,4];
  return `<svg class="${cls||"glyph"}" viewBox="0 0 20 20">` +
    `<path d="M${x[0]} 6h${rows[0]}"/><path d="M${x[1]} 10h${rows[1]}"/><path d="M${x[2]} 14h${rows[2]}"/></svg>`;
}

// WHY single quotes: these strings are interpolated into a double-quoted HTML
// style attribute. A double quote here closes the attribute early and silently
// drops everything after it — which is how `font-size` went missing and the
// label stayed at 13px through an Extra-large press.
const FONT_FACES = {
  draw: "'Comic Sans MS','Segoe Print',cursive",
  sans: "ui-sans-serif,system-ui,sans-serif",
  serif: "Georgia,'Times New Roman',serif",
  mono: "ui-monospace,Menlo,Consolas,monospace",
};
const FONT_LABELS = { draw:"Hand-drawn", sans:"Sans", serif:"Serif", mono:"Mono" };
const SIZE_LABELS = { s:"Small", m:"Medium", l:"Large", xl:"Extra large" };
const FILL_LABELS = { solid:"Solid", semi:"Transparent", pattern:"Hatched", none:"No fill" };
const DASH_LABELS = { draw:"Hand-drawn", solid:"Solid", dashed:"Dashed", dotted:"Dotted", none:"None" };

/* ── derived values ────────────────────────────────────────────────────── */
function fontPx() { return S.customPx != null ? S.customPx : FONT_PX[S.size]; }
function strokePx() { return STROKE_PX[S.strokeWidth]; }
function strokeHex() { return HEX[S.strokeLinked ? S.fill : S.stroke]; }
function fillHex() { return HEX[S.fill]; }

/* ── the shape: painted from S, so a claim on this page is checkable ───── */
function paintShape() {
  const w = 430, h = 240, fh = fillHex(), sh = strokeHex(), sw = strokePx();
  let fillAttr = `fill="${fh}"`, fillOp = S.fillOpacity;
  if (S.fillStyle === "none") { fillAttr = `fill="none"`; fillOp = 0; }
  else if (S.fillStyle === "semi") { fillOp = S.fillOpacity * 0.28; }
  else if (S.fillStyle === "pattern") { fillAttr = `fill="url(#hatch)"`; }
  const da = DASH_ARRAYS[S.dash];
  const dashAttr = da ? ` stroke-dasharray="${da.split(" ").map(n=>Number(n)*sw).join(" ")}"` : "";
  const strokeAttr = S.dash === "none" ? `stroke="none"` : `stroke="${sh}"`;
  const anchor = { start:"start", middle:"middle", end:"end" }[S.align];
  const tx = { start:20, middle:w/2, end:w-20 }[S.align];

  document.getElementById("stage").innerHTML = `
    <svg id="shape" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <defs>
        <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="7" stroke="${fh}" stroke-width="2.5" opacity="${S.fillOpacity}"/>
        </pattern>
      </defs>
      <rect x="${sw/2}" y="${sw/2}" width="${w-sw}" height="${h-sw}" rx="6"
            ${fillAttr} fill-opacity="${fillOp}"
            ${strokeAttr} stroke-width="${sw}" stroke-opacity="${S.strokeOpacity}"${dashAttr}
            data-role="shape"/>
      <text x="${tx}" y="${h/2}" text-anchor="${anchor}" dominant-baseline="central"
            fill="${fh}" fill-opacity="${Math.max(S.fillOpacity, 0.85)}"
            style="font-family:${FONT_FACES[S.font]};font-size:${fontPx()}px"
            data-role="label">if ready</text>
    </svg>
    <div id="selection"><i></i><i></i><i></i><i></i></div>`;
}

/* ── shared popover sections ───────────────────────────────────────────── */
function secSwatches(target) {
  const cur = target === "fill" ? S.fill : (S.strokeLinked ? S.fill : S.stroke);
  return `<div class="swatches" role="group" aria-label="${target} colour">` +
    PALETTE.map(([name, hex]) =>
      `<button class="sw" role="radio" aria-checked="${cur === name}" aria-label="${name}"
        data-act="colour" data-target="${target}" data-value="${name}"
        style="background:${hex}"></button>`).join("") +
    `<button class="sw wheel" aria-label="Custom colour" data-act="noop"></button></div>`;
}

function secFillChips() {
  return `<div class="chips" role="group" aria-label="Fill style">` +
    ["solid","semi","pattern","none"].map(v =>
      `<button class="chip" role="radio" aria-checked="${S.fillStyle === v}"
        data-act="fillStyle" data-value="${v}">${fillGlyph(v)}<span>${FILL_LABELS[v]}</span></button>`
    ).join("") + `</div>`;
}

function secDashChips(withLabels) {
  return `<div class="chips" role="group" aria-label="Line style">` +
    ["draw","solid","dashed","dotted","none"].map(v =>
      `<button class="chip" role="radio" aria-checked="${S.dash === v}" title="${DASH_LABELS[v]}"
        aria-label="${DASH_LABELS[v]}" data-act="dash" data-value="${v}">${dashGlyph(v)}` +
      (withLabels ? `<span>${DASH_LABELS[v]}</span>` : ``) + `</button>`
    ).join("") + `</div>`;
}

function secThickness() {
  return `<div class="cells" role="group" aria-label="Thickness">` +
    ["thin","medium","thick"].map(v =>
      `<button class="cell" role="radio" aria-checked="${S.strokeWidth === v}"
        aria-label="${v} (${STROKE_PX[v]}px)" title="${v} — ${STROKE_PX[v]}px"
        data-act="strokeWidth" data-value="${v}">${widthGlyph(v)}</button>`
    ).join("") + `</div>`;
}

function secOpacity(target) {
  const v = target === "fill" ? S.fillOpacity : S.strokeOpacity;
  return `<div class="opacity"><label>Opacity</label>
    <input type="range" min="0" max="100" step="1" value="${Math.round(v*100)}"
      data-act="opacity" data-target="${target}" aria-label="${target} opacity">
    <output data-opacity-out="${target}">${Math.round(v*100)}%</output></div>`;
}

function secLink() {
  return `<div class="linkrow" data-linked="${S.strokeLinked}">
    <span class="state">${S.strokeLinked ? "Following the fill colour" : "Set independently"}</span>
    <button data-act="toggleLink">${S.strokeLinked ? "Set separately" : "Follow fill"}</button></div>`;
}

function secSizeList() {
  const onPreset = S.customPx == null;
  return `<div class="list" role="group" aria-label="Text size">` +
    ["s","m","l","xl"].map(v =>
      `<button class="row" role="radio" aria-checked="${onPreset && S.size === v}"
        data-act="size" data-value="${v}"><span class="tick">✓</span>
        <span class="grow" style="font-size:${{s:12,m:13,l:14,xl:16}[v]}px">${SIZE_LABELS[v]}</span>
        <span class="px">${FONT_PX[v]}</span></button>`
    ).join("") +
    `</div><div class="custom"><span>Custom</span>
      <input type="number" min="4" max="400" step="1" value="${fontPx()}"
        data-act="customPx" aria-label="Custom text size"><span>px</span></div>`;
}

function secFontList() {
  return `<div class="list" role="group" aria-label="Typeface">` +
    Object.keys(FONT_FACES).map(v =>
      `<button class="row" role="radio" aria-checked="${S.font === v}" data-act="font" data-value="${v}">
        <span class="tick">✓</span>
        <span class="grow" style="font-family:${FONT_FACES[v]}">${FONT_LABELS[v]}</span></button>`
    ).join("") + `</div>`;
}

function secAlign() {
  return `<div class="cells" role="group" aria-label="Text align">` +
    ["start","middle","end"].map(v =>
      `<button class="cell" role="radio" aria-checked="${S.align === v}" aria-label="align ${v}"
        data-act="align" data-value="${v}">${alignGlyph(v)}</button>`
    ).join("") + `</div>`;
}

function captioned(caption, body) {
  return `<div class="section"><div class="caption">${caption}</div>${body}</div>`;
}

/* ── trigger faces ─────────────────────────────────────────────────────── */
function faceDisc(hex) { return `<span class="discbox"><span class="disc" style="background:${hex}"></span></span>`; }

function facePair() {
  const sw = Math.max(2, Math.min(4, strokePx()));
  return `<span class="pairface">
    <span class="ring" style="border-color:${strokeHex()};border-width:${sw}px;opacity:${S.strokeOpacity}"></span>
    <span class="core" style="background:${fillHex()};opacity:${S.fillStyle === "none" ? 0.12 : S.fillOpacity}"></span>
  </span>`;
}

function faceResult(part) {
  // A face that draws what the shape actually looks like — the whole idea of P2.
  const sw = Math.max(1.5, Math.min(3.5, strokePx()));
  if (part === "inside") {
    const bg = S.fillStyle === "none" ? "transparent"
      : S.fillStyle === "semi" ? `color-mix(in srgb, ${fillHex()} 28%, transparent)`
      : S.fillStyle === "pattern"
        ? `repeating-linear-gradient(45deg, ${fillHex()} 0 2px, transparent 2px 5px)`
        : fillHex();
    return `<span class="resultface" style="background:${bg};opacity:${S.fillOpacity};
      box-shadow:inset 0 0 0 1px rgb(255 255 255 / 25%)"></span>`;
  }
  const da = DASH_ARRAYS[S.dash];
  const style = S.dash === "none" ? "none" : da ? "dashed" : "solid";
  return `<span class="resultface" style="border:${sw}px ${style} ${strokeHex()};
    opacity:${S.strokeOpacity};background:transparent"></span>`;
}

// Lucide's `link` / `unlink`, 24px viewBox — the chain IS the control in P4,
// so it gets a glyph people already read as "these two move together", not a
// house-drawn approximation.
function chainGlyph(broken) {
  const body = broken
    ? `<path d="m18.84 12.25 1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
       <path d="m5.17 11.75-1.71 1.71a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
       <path d="m2 2 3 3"/><path d="m19 19 3 3"/>`
    : `<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
       <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>`;
  return `<svg class="chain" viewBox="0 0 24 24" data-broken="${broken}"
    aria-label="${broken ? "edge set independently" : "edge follows the fill"}">${body}</svg>`;
}

/* ── the five pills ────────────────────────────────────────────────────── */
function trig(id, inner, cls) {
  return `<button class="trig ${cls||""}" data-pop="${id}" aria-expanded="false"
    aria-haspopup="dialog">${inner}${chevron()}</button>`;
}
function pop(id, inner, side) {
  return `<div class="pop ${side||"below"}" data-popid="${id}" role="dialog">${inner}</div>`;
}
function wrap(id, trigger, popover) {
  return `<span style="position:relative;display:flex">${trigger}${popover}</span>`;
}
function actions() {
  return `<span class="sep"></span>
    <button class="trig icon" title="Arrange" aria-label="Arrange">${alignGlyph("start")}</button>
    <button class="trig icon" title="Zoom to selection" aria-label="Zoom to selection">
      <svg class="glyph" viewBox="0 0 20 20"><path d="M3 7V4h3M17 7V4h-3M3 13v3h3M17 13v3h-3"/><circle cx="10" cy="10" r="2.4"/></svg></button>
    <span class="sep"></span>
    <button class="trig icon" title="Duplicate" aria-label="Duplicate">
      <svg class="glyph" viewBox="0 0 20 20"><rect x="6.5" y="6.5" width="10" height="10" rx="2"/><path d="M13 4.5H4.5a1 1 0 0 0-1 1V13"/></svg></button>
    <button class="trig icon" title="Delete" aria-label="Delete">
      <svg class="glyph" viewBox="0 0 20 20"><path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10"/></svg></button>`;
}
function geoTrigger() {
  return `<button class="trig icon" title="Shape" aria-label="Shape">
    <svg class="glyph" viewBox="0 0 20 20"><rect x="3.5" y="5.5" width="9" height="9" rx="1.5"/><circle cx="13.5" cy="12" r="4"/></svg>${chevron()}</button>`;
}

const PILLS = {
  /* P1 — the archived pill, rebuilt. Inside · Stroke · Type. */
  p1: () => `<div class="pill" data-proposal="p1">
    ${geoTrigger()}
    ${wrap("fill", trig("fill", faceDisc(fillHex())),
      pop("fill", captioned("Fill", secFillChips()) + captioned("Colour", secSwatches("fill"))
        + captioned("Opacity", secOpacity("fill"))))}
    ${wrap("stroke", trig("stroke", widthGlyph(S.strokeWidth)),
      pop("stroke", captioned("Thickness", secThickness()) + captioned("Line style", secDashChips(false))
        + captioned("Edge colour", secLink() + secSwatches("stroke"))
        + captioned("Opacity", secOpacity("stroke"))))}
    <span class="sep"></span>
    ${wrap("font", trig("font", `<span class="word" style="font-family:${FONT_FACES[S.font]}">Aa</span>`),
      pop("font", secFontList()))}
    ${wrap("size", trig("size",
        `<span class="word">${S.customPx == null ? SIZE_LABELS[S.size] : "Custom"}</span>
         <span class="px">${fontPx()}</span>`, "combo"),
      pop("size", secSizeList()))}
    ${wrap("align", trig("align", alignGlyph(S.align)), pop("align", secAlign()))}
    ${actions()}
  </div>`,

  /* P2 — three triggers, each face drawing the real result. */
  p2: () => `<div class="pill" data-proposal="p2">
    ${wrap("inside", trig("inside", faceResult("inside") + `<span class="word">Inside</span>`),
      pop("inside", captioned("Fill", secFillChips()) + captioned("Colour", secSwatches("fill"))
        + captioned("Opacity", secOpacity("fill"))))}
    ${wrap("edge", trig("edge", faceResult("edge") + `<span class="word">Edge</span>`),
      pop("edge", captioned("Thickness", secThickness()) + captioned("Line style", secDashChips(true))
        + captioned("Colour", secLink() + secSwatches("stroke"))
        + captioned("Opacity", secOpacity("stroke"))))}
    ${wrap("text", trig("text",
        `<span class="word" style="font-family:${FONT_FACES[S.font]}">Aa</span><span class="px">${fontPx()}</span>`),
      pop("text", captioned("Typeface", secFontList()) + captioned("Size", secSizeList())
        + captioned("Align", secAlign())))}
    ${actions()}
  </div>`,

  /* P3 — one Appearance trigger, one sectioned panel. */
  p3: () => `<div class="pill" data-proposal="p3">
    ${geoTrigger()}
    ${wrap("appearance", trig("appearance", facePair() + `<span class="word">Appearance</span>`),
      pop("appearance", `<div class="panel">` +
        captioned("Fill", secFillChips() + secSwatches("fill") + secOpacity("fill")) +
        captioned("Stroke", `<div class="prow"><span class="lab">Weight</span>${secThickness()}</div>
          <div class="prow"><span class="lab">Style</span>${secDashChips(false)}</div>` +
          secLink() + secSwatches("stroke") + secOpacity("stroke")) +
        captioned("Text", secFontList() + secSizeList() + secAlign()) + `</div>`))}
    ${actions()}
  </div>`,

  /* P4 — the link is the control. */
  p4: () => `<div class="pill" data-proposal="p4">
    ${geoTrigger()}
    ${wrap("pair", `<button class="trig" data-pop="pair" aria-expanded="false" aria-haspopup="dialog">
        ${facePair()}${chainGlyph(!S.strokeLinked)}${chevron()}</button>`,
      pop("pair", captioned("Fill", secFillChips() + secSwatches("fill") + secOpacity("fill")) +
        captioned("Edge", secLink() + secSwatches("stroke") + secOpacity("stroke"))))}
    ${wrap("line", trig("line", dashGlyph(S.dash)),
      pop("line", captioned("Thickness", secThickness()) + captioned("Line style", secDashChips(true))))}
    <span class="sep"></span>
    ${wrap("font4", trig("font4", `<span class="word" style="font-family:${FONT_FACES[S.font]}">Aa</span>`),
      pop("font4", secFontList()))}
    ${wrap("size4", trig("size4",
        `<span class="word">${S.customPx == null ? SIZE_LABELS[S.size] : "Custom"}</span>
         <span class="px">${fontPx()}</span>`, "combo"),
      pop("size4", secSizeList()))}
    ${actions()}
  </div>`,

  /* P5 — a tray, not a popover: the shape is never covered. */
  p5: () => `<div class="pill tray" data-proposal="p5">
    ${geoTrigger()}
    <button class="trig" data-tray="inside" aria-expanded="false">${faceResult("inside")}<span class="word">Inside</span>${chevron()}</button>
    <button class="trig" data-tray="edge" aria-expanded="false">${faceResult("edge")}<span class="word">Edge</span>${chevron()}</button>
    <button class="trig combo" data-tray="text" aria-expanded="false">
      <span class="word" style="font-family:${FONT_FACES[S.font]}">Aa</span>
      <span class="px">${fontPx()}</span>${chevron()}</button>
    ${actions()}
    <div id="tray" data-open="false"></div>
  </div>`,
};

const TRAYS = {
  inside: () => `<div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
    <div>${secFillChips()}</div><div>${secSwatches("fill")}</div><div>${secOpacity("fill")}</div></div>`,
  edge: () => `<div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
    <div>${secThickness()}</div><div>${secDashChips(false)}</div><div>${secSwatches("stroke")}</div>
    <div>${secLink()}${secOpacity("stroke")}</div></div>`,
  text: () => `<div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
    <div>${secFontList()}</div><div>${secSizeList()}</div><div>${secAlign()}</div></div>`,
};

/* ── render + events ───────────────────────────────────────────────────── */
let current = "p1";
let openPop = null;   // popover id
let openTray = null;  // tray id

function render() {
  document.getElementById("pillwrap").innerHTML = PILLS[current]();
  if (current === "p5" && openTray) {
    const t = document.getElementById("tray");
    t.innerHTML = TRAYS[openTray]();
    t.dataset.open = "true";
    const b = document.querySelector(`[data-tray="${openTray}"]`);
    if (b) b.setAttribute("aria-expanded", "true");
  } else if (openPop) {
    const p = document.querySelector(`[data-popid="${openPop}"]`);
    if (p) {
      p.dataset.open = "true";
      const b = document.querySelector(`[data-pop="${openPop}"]`);
      if (b) b.setAttribute("aria-expanded", "true");
    }
  }
  paintShape();
  paintReadout();
  document.getElementById("caption").innerHTML =
    `<b>${PROPOSALS.find(p => p[0] === current)[1]}</b> — ${PROPOSALS.find(p => p[0] === current)[2]}`;
}

function paintReadout() {
  const linked = S.strokeLinked;
  document.getElementById("readout").innerHTML = `
    <div>text&nbsp;&nbsp;<b data-r="fontPx">${fontPx()}px</b> &nbsp;<span style="opacity:.6">${
      S.customPx == null ? SIZE_LABELS[S.size] : "custom"}</span></div>
    <div>stroke <b data-r="strokePx">${strokePx()}px</b> &nbsp;<span style="opacity:.6">${S.strokeWidth}</span></div>
    <div>fill&nbsp;&nbsp;<b data-r="fill">${S.fill}</b></div>
    <div>edge&nbsp;&nbsp;<b data-r="stroke">${linked ? S.fill : S.stroke}</b>
      <span class="${linked ? "hi" : ""}" data-r="linked">${linked ? "· linked" : "· independent"}</span></div>
    <div>opacity <b data-r="opacity">${Math.round(S.fillOpacity*100)}% / ${Math.round(S.strokeOpacity*100)}%</b></div>`;
}

document.addEventListener("click", (e) => {
  const trigger = e.target.closest("[data-pop]");
  const trayBtn = e.target.closest("[data-tray]");
  const act = e.target.closest("[data-act]");

  if (trigger) {
    const id = trigger.dataset.pop;
    openPop = openPop === id ? null : id;
    openTray = null;
    render();
    return;
  }
  if (trayBtn) {
    const id = trayBtn.dataset.tray;
    openTray = openTray === id ? null : id;
    openPop = null;
    render();
    return;
  }
  if (act) {
    apply(act.dataset.act, act.dataset.value, act.dataset.target);
    return;
  }
  if (!e.target.closest(".pop") && !e.target.closest("#tray") && !e.target.closest("#switch")) {
    if (openPop || openTray) { openPop = null; openTray = null; render(); }
  }
});

document.addEventListener("input", (e) => {
  const act = e.target.closest("[data-act]");
  if (!act) return;
  if (act.dataset.act === "opacity") {
    const v = Number(act.value) / 100;
    if (act.dataset.target === "fill") S.fillOpacity = v; else S.strokeOpacity = v;
    const out = document.querySelector(`[data-opacity-out="${act.dataset.target}"]`);
    if (out) out.textContent = Math.round(v*100) + "%";
    paintShape(); paintReadout();
  }
});

document.addEventListener("change", (e) => {
  const act = e.target.closest("[data-act]");
  // WHY deferred: a `change` raised by blur is dispatched from inside the blur
  // handler, and re-rendering the pill there detaches the very node the browser
  // is still unwinding ("The node to be removed is no longer a child").
  if (act && act.dataset.act === "customPx") {
    const v = act.value;
    requestAnimationFrame(() => apply("customPx", v));
  }
});
document.addEventListener("keydown", (e) => {
  const act = e.target.closest("[data-act]");
  if (act && act.dataset.act === "customPx" && e.key === "Enter") { e.preventDefault(); apply("customPx", act.value); }
});

function apply(act, value, target) {
  switch (act) {
    case "colour":
      // WHY the link breaks HERE and only here: "unless you specifically set
      // the stroke color". Choosing a fill while linked must carry the edge
      // along; choosing an EDGE colour is the explicit act that unlinks.
      if (target === "fill") S.fill = value;
      else { S.stroke = value; S.strokeLinked = false; }
      break;
    case "fillStyle": S.fillStyle = value; break;
    case "dash": S.dash = value; break;
    case "strokeWidth": S.strokeWidth = value; break;
    case "font": S.font = value; break;
    case "align": S.align = value; break;
    case "toggleLink":
      S.strokeLinked = !S.strokeLinked;
      if (S.strokeLinked) S.stroke = S.fill;
      break;
    case "size":
      // WHY nothing touches strokeWidth: this is the whole round. In stock
      // tldraw one `size` rung drives BOTH the label's font size and the
      // outline's width (default-shape-constants.mjs: STROKE_SIZES and
      // LABEL_FONT_SIZES share the key). Here they are two fields.
      S.size = value; S.customPx = null;
      break;
    case "customPx": {
      const n = Number.parseFloat(value);
      if (Number.isFinite(n) && n >= 4 && n <= 400) S.customPx = n;
      break;
    }
    case "noop": return;
  }
  render();
}

document.addEventListener("DOMContentLoaded", () => {
  const sel = document.getElementById("variant");
  if (sel) {
    const saved = new URLSearchParams(location.search).get("p")
      || localStorage.getItem("bbox-toolbar-proposal");
    if (saved && PILLS[saved]) current = saved;
    sel.value = current;
    sel.addEventListener("change", () => {
      current = sel.value;
      localStorage.setItem("bbox-toolbar-proposal", current);
      openPop = null; openTray = null;
      render();
    });
  }
  const pinned = document.body.dataset.pin;
  if (pinned) current = pinned;
  const openAt = document.body.dataset.open;
  if (openAt) openPop = openAt;
  render();
});
"""
    for token, val in (
        ("__PALETTE__", json.dumps(palette)),
        ("__STROKE_PX__", json.dumps(stroke_px)),
        ("__FONT_PX__", json.dumps(font_px)),
        ("__PROPOSALS__", json.dumps(proposals)),
        ("__CHEVRON__", CHEVRON_PATH),
    ):
        body = body.replace(token, val)
    return body


def page(pin: str | None = None, open_pop: str | None = None, switcher: bool = True) -> str:
    opts = "".join(
        f'<option value="{pid}">{n}. {title}</option>'
        for n, (pid, title, _) in enumerate(PROPOSALS, 1)
    )
    switch = (
        f'<div id="switch"><span style="color:var(--ink-dim)">Proposal</span>'
        f'<select id="variant">{opts}</select></div>'
        if switcher else ""
    )
    body_attrs = "".join(
        [f' data-pin="{pin}"' if pin else "", f' data-open="{open_pop}"' if open_pop else ""]
    )
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>bbox-ui · selection toolbar proposals</title>
<style>{CSS}</style></head>
<body{body_attrs}>
<div id="board">
  <div id="title">Conditionals</div>
  <div id="pillwrap"></div>
  <div id="stage"></div>
</div>
<div id="readout"></div>
<div id="caption"></div>
{switch}
<script>{js(PALETTE, STROKE_PX, FONT_PX, PROPOSALS)}</script>
</body></html>"""


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", default=None, help="directory to write the mock pages into")
    args = ap.parse_args()
    out = pathlib.Path(args.out) if args.out else pathlib.Path.cwd() / "toolbar-mocks"
    out.mkdir(parents=True, exist_ok=True)

    (out / "mock.html").write_text(page(), encoding="utf-8")
    for pid, _, _ in PROPOSALS:
        (out / f"mock-{pid}.html").write_text(page(pin=pid, switcher=False), encoding="utf-8")
    print(f"wrote {out}/mock.html and {len(PROPOSALS)} pinned pages")


if __name__ == "__main__":
    main()
