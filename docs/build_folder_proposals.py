#!/usr/bin/env python3
"""Five proposals for the two-levels-down folder structure.

Zach, Daily Note - Sep 21 2026:
  "Can you please make 5 proposals then for how we can organize the components,
   scene, editor folders? This is a good 3 level split but I need to detail the
   split 2 more levels down for each of these folders. what are the sub headers?
   under components? and what are the sub headers under thoose? For components I
   think the first layer is obvious — its /port, /block, /port_edge etc but then
   within /port? This needs to be done for components, scene and editor."

So level 1 is settled (one folder per component). This document is about LEVEL 2:
what lives inside components/portEdge/, scene/<x>/ and editor/<x>/.

Each proposal is a COHERENT WHOLE-REPO SCHEME — one answer across all three
folders — not five independent options per folder. They are directly comparable
because every one is shown against the same worked example: portEdge, the
largest real component at 1,498 lines.

Measured inputs (see docs/ARCHITECTURE-2026-09-21.md for provenance):
  components/  77 flat .tsx, 23,826 lines, median 211; only 3 files >= 800
  scene/       31 sources, flat, by concept, 0 React / 0 tldraw / no DOM
  aspects      16 in 3 groups, 94% backlog coverage (docs/aspect-vocabulary.json)
"""
from __future__ import annotations

import pathlib

OUT = pathlib.Path("/home/bam/bbox-ui/reports/media/folder-proposals-2026-09-21.html")

# portEdge.tsx really contains all of this — the seams are not invented.
PORTEDGE_FACTS = [
    ("types &amp; props", "<code>PortEdgeItem</code>, <code>PortEdgeProps</code>, "
     "<code>PortEdgeArrangeMode</code>, <code>PortEdgeGroupMode</code>"),
    ("appearance tokens", "<code>EDGE_LINE_COLOR</code>, <code>CARD_OVERLAY_FILL</code>, "
     "<code>CARD_OVERLAY_RADIUS</code>, <code>LANE_PITCH_FALLBACK_PX</code>"),
    ("sub-components", "<code>EdgeLineMark</code>, <code>PortEdgeSlotBox</code>, "
     "<code>GroupSlotBody</code>, <code>SlotBody</code>, <code>SortableSlotCard</code>, "
     "<code>FreeSlotCard</code>"),
    ("drag &amp; drop", "<code>PortEdgeDndScope</code>, <code>PortEdgeDndProvider</code>, "
     "<code>SortableSlotCard</code>"),
    ("pure logic — <b>in the wrong layer</b>", "<code>reorderItemsBySlot</code>, "
     "<code>laneAvailability</code> — pure functions over items and slots, sitting in a "
     "<code>.tsx</code>. These belong in <code>scene/</code>."),
]

PROPOSALS = [
    {
        "id": "1", "name": "Aspect-first",
        "tag": "your proposal, literally",
        "idea": "Level 2 is the aspect vocabulary. The same sub-headers repeat inside every "
                "component, so finding “how dragging works” is the same move on every part.",
        "trees": {
            "components": """components/
  portEdge/
    anatomy.tsx        slots, parts, what it is made of
    paint.tsx          how it renders
    appearance.ts      tokens: colours, radii, sizes
    interactions/
      drag.ts
      click.ts
      hover.ts
    portEdge.stories.tsx
    index.ts""",
            "scene": """scene/
  model/               what things are
    ports.ts  wires.ts  regions.ts
  ops/                 operations over them
    reorder.ts  availability.ts  tidy.ts
  layout/
    lanes.ts  routing.ts""",
            "editor": """editor/
  portEdge/
    menu.tsx           rows -> one scene call each
    inspector.tsx
    shortcuts.ts""",
        },
        "for": ["Exactly the vocabulary you described, and it is validated — 94% of the 468 "
                "backlog items land in it.",
                "Answers “where is the code for X” in one hop, identically for every component.",
                "The aspect names double as the docs sub-headers in your MOC."],
        "against": ["Seven sub-folders inside a 120-line component is absurd — and 30 of your 77 "
                    "components are under 150 lines.",
                    "Some aspects are empty for most components (<code>keyboard</code> is 40 items "
                    "across the whole backlog), so you get a lot of empty or one-line files."],
        "best": "Large, interaction-heavy components. Actively bad for small ones.",
        "rec": "half",
    },
    {
        "id": "2", "name": "Fractal three-layer",
        "tag": "the top-level split, repeated",
        "idea": "Level 2 uses the same three names as level 0: view / model / wire. The structure "
                "is self-similar, so there is exactly one concept to learn and it applies at every "
                "depth.",
        "trees": {
            "components": """components/
  portEdge/
    view.tsx           presentational only
    model.ts           types, what it stores
    interactions.ts    handlers -> call scene
    portEdge.stories.tsx""",
            "scene": """scene/
  portEdge/
    types.ts           the shapes of things
    queries.ts         read-only derivations
    ops.ts             pure transformations
  wire/  region/  history/  ...""",
            "editor": """editor/
  portEdge/
    menu.tsx
    inspector.tsx
    shortcuts.ts""",
        },
        "for": ["One idea to learn, applied everywhere — the cheapest possible thing to remember.",
                "<code>components/portEdge/</code>, <code>scene/portEdge/</code> and "
                "<code>editor/portEdge/</code> line up, so a feature is three files in three "
                "predictable places.",
                "The <code>view</code> / <code>model</code> split is exactly the line that "
                "<code>reorderItemsBySlot</code> is currently on the wrong side of."],
        "against": ["Forces <code>scene/</code> to reorganise around components, but scene is "
                    "currently organised by <em>concept</em> (<code>containment</code>, "
                    "<code>history</code>, <code>linking</code>) and some of those genuinely span "
                    "components.",
                    "“model” means something slightly different in components than in scene, "
                    "which is the kind of small ambiguity that rots."],
        "best": "If you want one rule for the whole repo and are willing to reorganise scene.",
        "rec": "yes",
    },
    {
        "id": "3", "name": "Headless + skin",
        "tag": "from your own shared rule",
        "idea": "Level 2 splits behaviour from presentation. Straight out of "
                "<code>C - Headless UI Components</code> in your MOC, and your Storybook already "
                "has a <code>Skin</code> bucket.",
        "trees": {
            "components": """components/
  portEdge/
    headless/          behaviour, no styling
      usePortEdge.ts
      dnd.ts
      slots.ts
    skin/              presentation, swappable
      default.tsx
      tokens.css
    portEdge.stories.tsx""",
            "scene": """scene/                 unchanged
  containment.ts  history.ts
  batchWire.ts  linking.ts
  collapse.ts  availability.ts""",
            "editor": """editor/
  menus/
  inspector/
  toolbar/
  commands/
    tidyEdges.ts       one scene call""",
        },
        "for": ["It is already one of your shared rules, so it costs no new vocabulary.",
                "Makes the skin genuinely swappable — which is what the <code>Skin</code> "
                "storybook bucket is reaching for.",
                "Leaves <code>scene/</code> completely alone, and scene measures healthy."],
        "against": ["Says nothing about where a <em>feature</em> lives — which was the original "
                    "question. “Where is drag?” becomes “somewhere in headless/”.",
                    "The headless/skin line is genuinely hard to hold for canvas parts, where "
                    "geometry <em>is</em> behaviour."],
        "best": "If swappable skins matter more than feature navigation.",
        "rec": "half",
    },
    {
        "id": "4", "name": "Stock library layout",
        "tag": "off-the-shelf, zero invention",
        "idea": "Level 2 is the conventional React component-library layout — what shadcn, "
                "Radix and most of the ecosystem do. Nothing here is designed by us.",
        "trees": {
            "components": """components/
  portEdge/
    PortEdge.tsx       the component
    usePortEdge.ts     the hook
    portEdge.types.ts
    portEdge.css
    PortEdge.stories.tsx
    PortEdge.test.tsx
    index.ts""",
            "scene": """scene/                 unchanged
  containment.ts  history.ts
  batchWire.ts  linking.ts""",
            "editor": """editor/
  menus/  inspector/
  toolbar/  commands/""",
        },
        "for": ["Every convention is borrowed — no scheme for you or an agent to learn or "
                "mis-apply.",
                "Matches the shadcn registry you already publish through.",
                "An AI agent given “add a component” gets this right with no instructions, "
                "because it is the overwhelming prior."],
        "against": ["Organises by <em>artifact type</em>, not by feature — so it answers "
                    "“where are the types” but not “where is drag behaviour”, which is "
                    "the question you actually asked.",
                    "A 1,498-line <code>PortEdge.tsx</code> stays 1,498 lines; this scheme has no "
                    "opinion about splitting it."],
        "best": "If you want the library to look like every other library. Weakest on your actual "
                "question.",
        "rec": "no",
    },
    {
        "id": "5", "name": "Graduated — flat until it hurts",
        "tag": "the recommendation",
        "idea": "Level 2 is <b>dotted filenames, not folders</b>, and you only add them when a "
                "component earns them. The aspect vocabulary supplies the suffixes, so the naming "
                "is identical to proposal 1 — but it scales down to a 90-line component without "
                "ceremony.",
        "trees": {
            "components": """components/
  portEdge/                     1,498 lines -> earns files
    portEdge.tsx                the component
    portEdge.anatomy.tsx        slots, parts
    portEdge.drag.ts
    portEdge.appearance.ts
    portEdge.stories.tsx
  badge.tsx                     90 lines -> stays one file
  breadcrumb.tsx                stays one file""",
            "scene": """scene/                 flat, by concept - UNCHANGED
  containment.ts  history.ts
  batchWire.ts  linking.ts
  collapse.ts  availability.ts
  reorder.ts      <- moved OUT of portEdge.tsx
  laneAvailability.ts  <- same""",
            "editor": """editor/
  portEdge.menu.tsx
  portEdge.inspector.tsx
  block.menu.tsx
  commands.ts        one scene call each""",
        },
        "for": ["Honours the measurement: 30 components are under 150 lines and must not get six "
                "sub-folders; 3 are over 800 and badly need the split.",
                "Same aspect vocabulary as proposal 1, so you lose none of the navigability — "
                "<code>ls components/portEdge/</code> still shows you the aspects.",
                "Greppable: <code>*.drag.ts</code> finds every drag implementation in the repo in "
                "one command, across all three layers.",
                "Leaves <code>scene/</code> exactly as it is, which the measurement says is already "
                "correct — apart from receiving the pure functions that leaked into components.",
                "Migration is incremental and stoppable: promote a file to a folder the day it "
                "gets big, not before."],
        "against": ["Two shapes coexist (single file and folder), so the repo is not perfectly "
                    "uniform.",
                    "Needs one written threshold or it becomes a judgement call every time — "
                    "suggest: <b>split at ~400 lines</b>, which is 22 of 77 components today."],
        "best": "Recommended. It is proposal 1's vocabulary with proposal 4's restraint.",
        "rec": "yes",
    },
    {
        "id": "6", "name": "Aspect as top-level sibling",
        "tag": "the status quo \u2014 already built, already working",
        "idea": "Level 2 inside a component stays minimal, because cross-cutting aspects are "
                "hoisted to their own <b>top-level trunk folders</b>. This is not a proposal so "
                "much as a description: the repo already does this, and it already works.",
        "trees": {
            "components": """components/
  portEdge/
    portEdge.tsx
    portEdge.stories.tsx
  port/  block/  trace/ ...

  (small, because the aspects
   live as siblings below)""",
            "scene": """scene/                 by concept
  containment.ts  history.ts
  batchWire.ts  collapse.ts

interaction/    1,216 lines  drag
skin/           2,409 lines  appearance
magnet/           911 lines  snap
hitRegions/       343 lines  hit
layout/           526 lines  layout
detach/         1,357 lines""",
            "editor": """editor/            the TRUNK kit
  sourceActions.ts   pure
  edgeDropMenu.tsx
  nodeCatalog.ts

apps/systemsketch/src/chrome/
                   the HOST
  dock.tsx  panels.tsx""",
        },
        "for": ["<b>It already exists.</b> interaction/, skin/, magnet/, hitRegions/, layout/ and "
                "detach/ are real folders holding 6,762 lines \u2014 aspects hoisted to level 1.",
                "A cross-cutting aspect gets written <em>once</em>, not once per component. "
                "<code>dragPolicy.ts</code> serves every draggable part.",
                "Matches <code>detach/</code> being one of your named shared rules \u2014 shared "
                "rules become shared folders.",
                "Zero migration cost, and nothing to decide."],
        "against": ["Answers \u201cwhere is drag\u201d with <code>interaction/</code> + "
                    "<code>magnet/</code> \u2014 two places, and neither is under the component you "
                    "were looking at.",
                    "Component-<em>local</em> behaviour has nowhere natural to go, so it stays in "
                    "the 1,498-line component file. That is exactly how portEdge got that big.",
                    "The split between \u201ccross-cutting\u201d and \u201clocal\u201d is currently "
                    "implicit \u2014 nobody wrote down which is which."],
        "best": "The honest baseline. Any proposal above has to beat this, not beat a blank page.",
        "rec": "half",
    },
]

MATRIX = [
    ("Costs nothing to adopt today", ["no", "no", "no", "no", "part", "yes"]),
    ("Answers “where is drag?” in one hop", ["yes", "yes", "part", "no", "yes"]),
    ("Works for a 90-line component", ["no", "part", "part", "yes", "yes", "yes"]),
    ("Works for a 1,498-line component", ["yes", "yes", "yes", "no", "yes", "no"]),
    ("Leaves healthy <code>scene/</code> alone", ["no", "no", "yes", "yes", "yes", "yes"]),
    ("One idea to learn", ["part", "yes", "part", "yes", "part", "part"]),
    ("An agent gets it right unprompted", ["no", "part", "no", "yes", "part", "no"]),
    ("Greppable across layers", ["part", "part", "no", "no", "yes", "part"]),
    ("Incremental, stoppable migration", ["no", "no", "part", "yes", "yes", "yes"]),
]


def tree_block(label, text):
    return (f'<div class="tcol"><div class="tlabel">{label}</div>'
            f'<pre class="tree">{text}</pre></div>')


def prop_html(p):
    fors = "".join(f"<li>{x}</li>" for x in p["for"])
    ags = "".join(f"<li>{x}</li>" for x in p["against"])
    label, cls = {"yes": ("recommended", "b-yes"), "no": ("weakest here", "b-no"),
                  "half": ("situational", "b-half")}[p["rec"]]
    trees = "".join(tree_block(k, v) for k, v in p["trees"].items())
    return f"""
<section class="prop {cls}" data-id="{p['id']}" data-title="{p['name']}">
  <div class="phead"><span class="pid">{p['id']}</span>
    <div><h3>{p['name']}</h3><p class="ptag">{p['tag']}</p></div>
    <span class="badge {cls}">{label}</span></div>
  <p class="idea">{p['idea']}</p>
  <div class="trees">{trees}</div>
  <div class="two"><div><h4>For</h4><ul>{fors}</ul></div>
    <div><h4>Against</h4><ul>{ags}</ul></div></div>
  <p class="best"><b>Best when.</b> {p['best']}</p>
  <div class="vote"><button data-v="yes">▲ This one</button>
    <button data-v="maybe">● Maybe</button><button data-v="no">▼ No</button>
    <textarea rows="1" placeholder="Notes on proposal {p['id']}…"></textarea></div>
</section>"""


def build():
    props = "".join(prop_html(p) for p in PROPOSALS)
    facts = "".join(f"<tr><td><b>{a}</b></td><td>{b}</td></tr>" for a, b in PORTEDGE_FACTS)
    mark = {"yes": '<span class="m y">●</span>', "no": '<span class="m n">○</span>',
            "part": '<span class="m p">◑</span>'}
    mrows = "".join(
        "<tr><td>" + crit + "</td>" + "".join(f"<td class='c'>{mark[v]}</td>" for v in vals) + "</tr>"
        for crit, vals in MATRIX)

    css = """
:root{--bg:#0f1013;--fg:#ececf0;--muted:#9a9aa6;--line:#26262e;--card:#16171b;
  --accent:#7d9bff;--yes:#4ac585;--no:#ff8a80;--warn:#e0b050}
@media(prefers-color-scheme:light){:root:not([data-theme="dark"]){--bg:#fbfbfd;--fg:#16161a;
  --muted:#6b6b76;--line:#e4e4ea;--card:#fff;--accent:#2f5bd8;--yes:#137a4b;--no:#b3261e;--warn:#8a5a00}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.62 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1140px;margin:0 auto;padding:44px 18px 130px}
h1{font-size:30px;margin:0 0 8px;letter-spacing:-.02em;line-height:1.2}
.sub{color:var(--muted);margin:0 0 24px}
h2{font-size:12.5px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);margin:44px 0 14px;font-weight:650}
.lede{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--accent);
  border-radius:0 12px 12px 0;padding:17px 20px;margin:0 0 12px;font-size:16.5px}
.lede b{color:var(--accent)}
table{width:100%;border-collapse:collapse;font-size:14.5px;margin:6px 0 10px}
th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);
  padding:7px 9px;border-bottom:1px solid var(--line)}
td{padding:8px 9px;border-bottom:1px solid var(--line);vertical-align:top}
td.c{text-align:center}
.m{font-size:15px}.m.y{color:var(--yes)}.m.n{color:var(--muted);opacity:.5}.m.p{color:var(--warn)}
code{font-family:ui-monospace,SFMono-Regular,monospace;font-size:.87em;
  background:color-mix(in srgb,var(--fg) 8%,transparent);padding:1.5px 5px;border-radius:4px}
.prop{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px;margin:0 0 16px}
.prop.b-yes{border-color:color-mix(in srgb,var(--yes) 55%,var(--line))}
.prop.b-no{opacity:.85}
.phead{display:flex;gap:14px;align-items:flex-start;margin-bottom:10px}
.pid{flex:none;width:32px;height:32px;border-radius:9px;background:var(--accent);color:#fff;
  display:grid;place-items:center;font-weight:700;font-size:15px}
.phead h3{margin:0;font-size:20px;letter-spacing:-.01em}
.ptag{margin:2px 0 0;color:var(--muted);font-size:13.5px}
.badge{margin-left:auto;font-size:11px;text-transform:uppercase;letter-spacing:.07em;padding:4px 10px;
  border-radius:99px;border:1px solid var(--line);color:var(--muted);white-space:nowrap}
.badge.b-yes{color:var(--yes);border-color:var(--yes)}
.badge.b-no{color:var(--no);border-color:var(--no)}
.badge.b-half{color:var(--warn);border-color:var(--warn)}
.idea{margin:0 0 14px;font-size:15px}
.trees{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px}
@media(max-width:940px){.trees{grid-template-columns:1fr}}
.tcol{min-width:0}
.tlabel{font-size:10.5px;text-transform:uppercase;letter-spacing:.09em;color:var(--accent);
  margin-bottom:5px;font-weight:700}
pre.tree{margin:0;background:color-mix(in srgb,var(--fg) 5%,transparent);border:1px solid var(--line);
  border-radius:9px;padding:12px 13px;overflow-x:auto;font-family:ui-monospace,monospace;
  font-size:12.2px;line-height:1.62;white-space:pre}
.find{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--warn);
  border-radius:0 12px 12px 0;padding:16px 19px;margin:0 0 14px}
.find h3{margin:0 0 9px;font-size:16.5px;letter-spacing:-.01em}
.find p{font-size:14.5px;margin:9px 0}
.find table{margin:8px 0}
.cav{color:var(--muted);font-size:13.5px;border-top:1px dashed var(--line);padding-top:9px}
td.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:8px}
@media(max-width:760px){.two{grid-template-columns:1fr}}
.two h4{margin:0 0 5px;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}
.two ul{margin:0;padding-left:17px;font-size:13.5px}.two li{margin-bottom:5px}
.best{margin:6px 0 0;font-size:14.5px;padding:9px 13px;border-radius:8px;
  background:color-mix(in srgb,var(--accent) 9%,transparent)}
.vote{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:15px;padding-top:13px;
  border-top:1px dashed var(--line)}
.vote button{font:inherit;font-size:13px;font-weight:600;padding:7px 14px;border-radius:8px;
  border:1px solid var(--line);background:transparent;color:var(--fg);cursor:pointer}
.vote button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#fff}
.vote textarea{flex:1 1 220px;min-width:180px;font:inherit;font-size:13px;padding:7px 10px;
  border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--fg);resize:vertical}
.bar2{position:fixed;left:0;right:0;bottom:0;background:color-mix(in srgb,var(--bg) 94%,transparent);
  backdrop-filter:blur(10px);border-top:1px solid var(--line);padding:11px 16px;z-index:9}
.bar2 .inner{max-width:1140px;margin:0 auto;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.bar2 button{font:inherit;font-size:14px;font-weight:600;padding:9px 16px;border-radius:9px;border:0;
  background:var(--accent);color:#fff;cursor:pointer}
#out{width:100%;margin-top:10px;font-family:ui-monospace,monospace;font-size:12px;padding:10px;
  border-radius:9px;border:1px solid var(--line);background:var(--card);color:var(--fg);display:none}
#out.show{display:block}
"""
    js = """
function save(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function read(k){try{return localStorage.getItem(k)}catch(e){return null}}
document.querySelectorAll(".prop").forEach(function(o){
  var id=o.dataset.id,t=o.querySelector("textarea");
  var v=read("fp-"+id),n=read("fp-note-"+id);
  if(n)t.value=n; if(v)o.dataset.vote=v;
  o.querySelectorAll(".vote button").forEach(function(b){
    if(v===b.dataset.v)b.setAttribute("aria-pressed","true");
    b.addEventListener("click",function(){
      var now=o.dataset.vote===b.dataset.v?"":b.dataset.v;o.dataset.vote=now;
      o.querySelectorAll(".vote button").forEach(function(x){
        if(now&&x.dataset.v===now)x.setAttribute("aria-pressed","true");else x.removeAttribute("aria-pressed")});
      save("fp-"+id,now)})});
  t.addEventListener("input",function(){save("fp-note-"+id,t.value)})});
document.getElementById("copy").addEventListener("click",function(){
  var L=["# Folder structure \\u2014 my picks",""];
  document.querySelectorAll(".prop").forEach(function(o){
    var p=o.querySelector('.vote button[aria-pressed="true"]'),n=o.querySelector("textarea").value.trim();
    if(!p&&!n)return;
    L.push("**"+o.dataset.id+" \\u2014 "+o.dataset.title+"**: "+(p?p.textContent.trim():"(no pick)"));
    if(n)L.push("  note: "+n.replace(/\\n+/g," / "));L.push("")});
  if(L.length===2)L.push("_(nothing marked yet)_");
  var out=document.getElementById("out");
  out.value=L.join("\\n");out.classList.add("show");out.focus();out.select();
  try{navigator.clipboard.writeText(out.value).catch(function(){})}catch(e){}});
"""
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Folder structure — five proposals</title>
<style>{css}</style></head><body><div class="wrap">

<h1>What goes inside <code>components/port/</code>?</h1>
<p class="sub">bbox-ui · 21 Sep 2026 · six whole-repo schemes for level 2 — five proposed, one already built</p>

<div class="lede">
Level 1 is settled — one folder per component. These are five answers to level 2, and each is a
<b>complete scheme across all three folders</b> rather than a menu per folder, so they are directly
comparable. Every one is shown against the same worked example: <b><code>portEdge</code>, your
largest real component at 1,498 lines</b>.
</div>

<h2>Three things the measurement found first</h2>
<p>I measured the current code before writing any proposal. Two of them invert assumptions we
were both making, and the third means this document has to agree with a doc that already exists.</p>

<div class="find">
<h3>1 &nbsp;The editor does not call <code>scene</code> — at all</h3>
<p>The rule we settled on was “the editor makes exactly one call into scene per entry point”.
Measured against ~105 real entry points:</p>
<table><tbody>
<tr><td><code>scene</code> imports anywhere in <code>apps/systemsketch/src</code></td><td class="num"><b>23</b> in 12 files</td></tr>
<tr><td>…of those, inside <code>chrome/</code></td><td class="num"><b>1</b></td></tr>
<tr><td>Entry points in <code>chrome/</code> that call a scene function</td><td class="num"><b>0</b> of ~64</td></tr>
<tr><td>Entry points anywhere in the editor that call scene</td><td class="num"><b>3</b> of ~105</td></tr>
</tbody></table>
<p>So the rule is <b>vacuous today</b> — it would pass at 97% by doing nothing, while the editor
kept growing unbounded tldraw logic. The problem is not too many calls into scene. It is
<em>zero</em>. Everything else runs against tldraw’s <code>Editor</code> API plus local
<code>chrome/</code> helpers. Of ~61 handlers that <em>are</em> single-call, about 58 call an
editor helper, not scene — compliant in form, non-compliant in substance.</p>
<p class="cav">Caveat worth keeping: of the ~21 fat handlers, only <b>5–6</b> hold logic that
should move to scene. The rest is file I/O (11, all in <code>files/session.tsx</code>),
camera/viewport (5) and tldraw-owned operations — all of which the existing architecture doc
places outside scene <em>on purpose</em>. “All logic lives in scene” taken literally would
push code into scene that the doc forbids.</p>
</div>

<div class="find">
<h3>2 &nbsp;Aspects are already hoisted to top-level folders</h3>
<p>The trunk does not have three folders. It has sixteen — and several are exactly the
cross-cutting aspects proposal 1 would put <em>inside</em> each component:</p>
<table><tbody>
<tr><td><code>interaction/</code> — <code>dragPolicy.ts</code>, <code>useDragIntent.ts</code></td><td class="num">1,216 lines</td></tr>
<tr><td><code>skin/</code> — appearance</td><td class="num">2,409</td></tr>
<tr><td><code>detach/</code> — one of your named shared rules, as a folder</td><td class="num">1,357</td></tr>
<tr><td><code>magnet/</code> — snapping</td><td class="num">911</td></tr>
<tr><td><code>layout/</code> · <code>hitRegions/</code> · <code>presets/</code></td><td class="num">1,861</td></tr>
</tbody></table>
<p>So “where does drag live?” already has an answer, and it is not
<code>components/port/drag.ts</code> — it is <code>interaction/</code> and <code>magnet/</code>.
That is the <b>opposite</b> of proposal 1, it is already built, and it works. It is proposal 6
below, and every other option has to beat it rather than beat a blank page.</p>
</div>

<div class="find">
<h3>3 &nbsp;<code>ARCHITECTURE.md</code> already exists, and names the kits differently</h3>
<p>292 lines at the repo root, written 17 Sep. It already settles the three-kit split, with a
dependency DAG and a record of the names it rejected:</p>
<pre class="tree">  scene  ←──────  components     components never imports scene
    ↑                 ↑
    └───── edit ──────┘            edit imports both; nothing imports edit</pre>
<p>Two things follow. The third kit is called <b><code>edit</code></b>, not “editor”, and the
doc says why: <em>“Not ‘menus’ — what unites them is that they produce scene mutations.”</em>
<code>view</code>, <code>elements</code> and <code>graph</code> were each considered and rejected
for recorded reasons. And the doc already answers a chunk of the aspect question with two tests:
<b>does it need a viewport transform?</b> (yes → host) and <b>is it bounded by one component’s
box, or does it span the canvas?</b> (bounded → ours).</p>
<p class="cav">Also: the doc says <code>edit</code>, the disk says <code>editor/</code>, and
there are now two different things wearing that name — the pure trunk kit
(<code>apps/storybook-basics/src/editor/</code>, 4 files) and the app chrome
(<code>apps/systemsketch/src/chrome/</code>, 4,643 lines). Worth separating before either grows.</p>
</div>

<h2>The worked example — what is actually inside portEdge.tsx today</h2>
<p>These are the seams the file already has. No scheme below invents a category; they differ only
in how they cut along these.</p>
<table><tbody>{facts}</tbody></table>
<p>Note the last row. <code>reorderItemsBySlot</code> and <code>laneAvailability</code> are pure
functions over data, living in a <code>.tsx</code> component file. <b>Pure logic has already
leaked out of scene.</b> Every proposal below has to answer where they go; the three-layer rule
says <code>scene/</code>, and that is a real migration, not a rename.</p>

<h2>The five proposals</h2>
{props}

<h2>Side by side</h2>
<table><thead><tr><th>Does it…</th><th class="c">1 Aspect</th><th class="c">2 Fractal</th>
<th class="c">3 Headless</th><th class="c">4 Stock</th><th class="c">5 Graduated</th><th class="c">6 Sibling</th></tr></thead>
<tbody>{mrows}</tbody></table>
<p class="sub" style="font-size:13px">● yes · ◑ partly · ○ no</p>

<h2>Recommendation</h2>
<p><b>Keep proposal 6 for cross-cutting aspects, add proposal 5 for component-local ones, and
write down which is which.</b></p>
<p>That is not a compromise — it is what the measurement forces. An aspect like drag genuinely
is cross-cutting: <code>dragPolicy.ts</code> serves every draggable part, and copying it into
<code>components/port/drag.ts</code> and <code>components/block/drag.ts</code> would be strictly
worse. But component-<em>local</em> behaviour has nowhere to go today, which is precisely how
<code>portEdge.tsx</code> reached 1,498 lines. Proposal 5 gives it a home without imposing
sub-folders on the 30 components that are under 150 lines.</p>
<p>The missing artifact is small and it is the whole point: <b>a written list of which aspects are
cross-cutting and which are local.</b> Today that split is implicit, which is why nobody can
answer “where should this go” without reading the repo. Suggested starting split, from the
16-aspect vocabulary:</p>
<table><thead><tr><th>Cross-cutting — a top-level folder</th><th>Component-local — a dotted file inside the folder</th></tr></thead>
<tbody><tr><td>drag / resize / move · hover / affordance · visual appearance · layout / geometry ·
hit regions · keyboard</td>
<td>anatomy / slots · how it paints · what it stores · semantics / kinds · add / remove members ·
text editing</td></tr></tbody></table>
<p>Two rules make it decidable rather than a taste call, and the second is already in your
architecture doc: <b>if more than one component needs it, it is cross-cutting</b>; and
<b>if it spans the canvas it is the host’s, if it is bounded by one component’s box it is
local.</b></p>
<p>On the single-call rule: restate it as <b>“at most one <em>scene</em> call per entry
point”</b>, with the projection sandwich exempt. The honest minimum today is five operations,
visible at <code>sourceContextMenu.tsx:165-176</code> — <code>sceneNow(editor)</code>, the scene
call, a guard, <code>markHistoryStoppingPoint</code>, <code>applyScene</code>. That handler is the
best example of the intended architecture in the repo, and the rule as originally worded would
fail it.</p>

<h2>What none of these decide</h2>
<p>Two questions are genuinely open and no folder scheme answers them:</p>
<p><b>Does <code>scene/</code> reorganise by component, or stay by concept?</b> Today it is flat and
named by concept — <code>containment</code>, <code>history</code>, <code>linking</code>,
<code>collapse</code> — and several of those legitimately span components, which is an argument
for leaving it alone. Proposals 1 and 2 move it; 3, 4 and 5 do not.</p>
<p><b>Where do the 30 system-scope backlog items live?</b> “The whole whiteboard is a System”,
“Components nest into Systems”, “CAD exporter maps hardware to components”. They are
not features <em>of</em> a component, and forcing them into one would be the first crack in
whichever scheme you pick.</p>

</div>
<div class="bar2"><div class="inner">
  <button id="copy">Copy my picks</button>
  <span style="color:var(--muted);font-size:13px">Pick one, add notes, copy — then I’ll write the migration for it.</span>
  <textarea id="out" rows="8" readonly></textarea>
</div></div>
<script>{js}</script></body></html>
"""


if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(build(), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size:,} bytes)")
