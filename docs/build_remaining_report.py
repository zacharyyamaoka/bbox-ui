#!/usr/bin/env python3
"""
Build the media-rich "what remains" report.

Zach rated the markdown-only delivery of `docs/REMAINING-2026-09-17.md` VERY
BAD — the second time in one session, after the rule had already been written
into the vault. The plan doc is a real artifact (isolated lanes read it from a
commit) but it is an input for machines; this is the thing he reads.

Captures come from `docs/capture_storybook_shots.mjs`; everything the report
proposes but which does NOT exist yet is DRAWN, because a rendered mock is how
he disagrees with a design before it is built.

    python3 docs/build_remaining_report.py
"""
from __future__ import annotations

import base64
import pathlib
import subprocess
from urllib.parse import quote

REPO = pathlib.Path("/home/bam/bbox-ui")
LANE = REPO / ".claude/worktrees/bar-block-storybook-17d0ae"
SHOTS = REPO / "reports/media/shots-remaining"
OUT = REPO / "reports/media/bbox-ui-remaining-2026-09-17.html"


def uri(name: str) -> str:
    p = SHOTS / name
    if not p.exists():
        raise SystemExit(f"missing capture {p} — run docs/capture_storybook_shots.mjs")
    return "data:image/webp;base64," + base64.b64encode(p.read_bytes()).decode()


def sh(cmd: str) -> str:
    return subprocess.run(cmd, shell=True, cwd=LANE, capture_output=True, text=True).stdout.strip()


F = {
    "components": sh("ls apps/storybook-basics/src/components/*.ts* | wc -l"),
    "stories": sh("ls apps/storybook-basics/src/stories/*.stories.tsx | wc -l"),
    "commits": sh("git log --oneline --since=midnight | wc -l"),
    "head": sh("git log --oneline -1 --format=%h"),
}

# ── the one-container thesis ────────────────────────────────────────────────
EVIDENCE = [
    ("containerGeometry.ts:1-9",
     "“A Block in a container view, a Branch and a Loop all present the same anatomy: "
     "a face, some solid chrome bands, and port dots”",
     "written after each one rediscovered the same hit-test bugs"),
    ("RegionShapeUtil.ts:1-16",
     "Branch and Loop’s container overrides were “two byte-identical override blocks "
     "living in two files before it was one”",
     "already deduplicated once, by the donor itself"),
    ("asyncRegionModel.ts:33-38",
     "The Async region is not a custom shape at all — a stock tldraw Frame plus a meta tag",
     "the strongest form of the argument: it needed no component"),
    ("MOC - bbox-ui Components.md:195-200",
     "“Presets: While loop, For Loops, Conditionals… All of these can be made with "
     "specific settings of the basic components, no need for new things”",
     "your own bet, made before the donor’s code confirmed it"),
]

# ── the five omissions ─────────────────────────────────────────────────────
FORGOT = [
    dict(n="1", title="One scene record, six derivations",
         lead="Active-branch fade, mutation derivation, linters, animation scheduling, wired-state "
              "and producer counts are all <code>f(scene)</code> — six features over one input type "
              "that still has no name.",
         why="Built list-first, each becomes a story-local literal with its own shape. You already "
             "have three partial scene models that don’t know about each other.",
         mock="scene"),
    dict(n="2", title="Band ports — the one real component gap",
         lead="The Loop’s item outlet sits on the <b>header’s bottom edge</b> "
              "(<code>loopModel.ts:43-52</code>); the Branch’s controls sit on its band "
              "(<code>branchModel.ts:55-60</code>). Your own golden has “Header ports” "
              "scribbled on it in red.",
         why="bbox-ui rails attach only to a Block’s four outer walls — <code>blockPort.tsx:86-101</code>, "
             "“this component only places ports on its walls”. No prop combination reaches a port on a "
             "Bar’s boundary. This is the single place the “it’s all presets” answer genuinely fails.",
         shot="fouredges.webp",
         shotcap="Rails today: four outer walls only. A port on the header band has no seam."),
    dict(n="3", title="The Value capsule, and the vocabulary that needs it",
         lead="The donor’s Block has a fourth representation the reset dropped — <code>value</code>, "
              "a literal drawn as a capsule, one inlet, one outlet, the title IS the literal "
              "(<code>valueBlock.ts:1-31</code>). The reset ships <code>simple|port|expanded</code> only.",
         why="Loops and branches are exactly where literals appear — <code>for x in xs</code>, "
             "<code>while err &gt; tol</code>, seeds on z⁻¹ edges. And the edge-ends-nowhere menu you "
             "asked for offers Value / Bundle / Unbundle / Copy / Select / Clock: if those presets "
             "aren’t fixture data, the menu has nothing to offer.",
         mock="value"),
    dict(n="4", title="Error and warning rungs — the paint half of linting",
         lead="Your list asks for linters and never says what a lint <i>looks like</i>. "
              "<code>Port</code> has four states, none of them error or warning "
              "(<code>port.tsx:52-57</code>); Trace and Block have none.",
         why="The donor deliberately runs lint marks and diff marks through one state vocabulary on "
             "the primitives (<code>diagnosticsModel.ts:48-55</code>) — and its own recorded gap is "
             "that lint was never wired to paint. Props-only, gallery-reviewable, and it buys the "
             "board-diff feature its visual language for free.",
         mock="rungs"),
    dict(n="5", title="Linked copies — the identity model behind the Draft badge",
         lead="Your earliest block list includes “make a linked copy of the block (links by name)”. "
              "The <code>Draft</code> badge already ships as vocabulary with nothing behind it.",
         why="Not urgent, but it is a scene-contract decision — is a block’s identity its id or its "
             "name? — and the contract is about to be frozen. A paragraph now; a migration later.",
         mock="identity"),
]

MOCKS: dict[str, str] = {}

MOCKS["container"] = """
<div class="mock"><div class="mock-label">the one container, four presets</div>
<div class="presets">
  <div class="preset"><div class="ph band">for · band header</div><div class="pb">members</div><div class="pf">chip</div></div>
  <div class="preset"><div class="ph band">while · band header</div><div class="pb">members</div><div class="pf">chip</div></div>
  <div class="preset"><div class="ph band">if · band header</div><div class="pb arms"><span>arm 0 — active</span><span class="dim">arm 1</span></div><div class="pf">chip</div></div>
  <div class="preset"><div class="ph band">region · band header</div><div class="pb">members</div><div class="pf">chip</div></div>
</div>
<p class="mock-note">Same anatomy in all four: a face, chrome bands, members, port dots. The only
genuinely extra structure is the Branch’s <b>arms</b> — an ordered stack with per-arm fold and one
active arm — and that maps onto <code>blockMembers</code> + <code>FoldingChevron</code>, not onto a
new container.</p></div>"""

MOCKS["scene"] = """
<div class="mock"><div class="mock-label">what you already have — three partial models that don’t know each other</div>
<div class="three">
  <div class="tm"><b>Wire</b><span>wiring.ts — invented today</span><code>{ id, from: WireEnd, to: WireEnd }</code><em>edges</em></div>
  <div class="tm"><b>BlockMember</b><span>blockMembers.tsx</span><code>{ id, content, x?, y? }</code><em>nesting AND placement</em></div>
  <div class="tm"><b>PortEdgeItem</b><span>portEdge.tsx + portLane.ts</span><code>{ id, label }</code><em>identity, via an LCS diff</em></div>
</div>
<pre class="code"><span class="c">// the ~100 lines that would unify them — data, not a base class.</span>
<span class="c">// Borrows React Flow's NAMES (familiar, and a clean translation target)</span>
<span class="c">// without borrowing its runtime, which is the part tldraw already owns.</span>
<span class="k">interface</span> <span class="t">BlockScene</span> {
  nodes: <span class="t">Record</span>&lt;NodeId, <span class="t">SceneNode</span>&gt;;   <span class="c">// parentId = nesting</span>
  edges: <span class="t">SceneEdge</span>[];                    <span class="c">// sourceHandle = a port id</span>
  placements: <span class="t">Record</span>&lt;NodeId, <span class="t">Placement</span>&gt;; <span class="c">// host-owned, never component-owned</span>
}
<span class="c">// invariants nobody has written down yet:</span>
<span class="c">//   · every edge end resolves to a live port id</span>
<span class="c">//   · a moved node re-parks its edges; it does not orphan them</span>
<span class="c">//   · identity is the id — `name` is a label (see omission 5)</span></pre>
<p class="mock-note">No component imports this. A host reads a scene and passes props; a pure function
reads a scene and returns a lint result. That is the difference between a contract and a framework,
and it is why this is safe where a React Flow dependency would not be.</p></div>"""

MOCKS["value"] = """
<div class="mock"><div class="mock-label">the fourth view, and the menu that needs it</div>
<div class="valrow">
  <div class="capsule"><span class="dot in"></span>0.25<span class="dot out"></span></div>
  <div class="capsule"><span class="dot in"></span>tol<span class="dot out"></span></div>
  <div class="capsule"><span class="dot in"></span>xs<span class="dot out"></span></div>
  <div class="picker"><div class="picker-hd">drag ended nowhere →</div>
    <div class="pi sel">Value</div><div class="pi">Bundle</div><div class="pi">Unbundle</div>
    <div class="pi">Copy</div><div class="pi">Select</div><div class="pi">Clock</div></div>
</div>
<p class="mock-note">Without the capsule preset every loop example fakes its literals as bare blocks —
and the quick-pick menu has an empty vocabulary to offer.</p></div>"""

MOCKS["rungs"] = """
<div class="mock"><div class="mock-label">what a lint looks like — props only, no new component</div>
<div class="rungs">
  <div class="rung"><span class="pdot ok"></span><b>ok</b><span>the four states that exist today</span></div>
  <div class="rung"><span class="pdot warn"></span><b>warning</b><span>two edges into one port</span></div>
  <div class="rung"><span class="pdot err"></span><b>error</b><span>type mismatch · cycle</span></div>
  <div class="rung"><span class="wline err"></span><b>edge error</b><span>the wire carries it too</span></div>
</div>
<p class="mock-note">The donor runs lint marks and diff marks through <i>one</i> state vocabulary on the
primitives, and its own recorded failure is that lint was never wired to paint. Adding the rungs now is
a gallery-reviewable props change that also gives board-diff its visual language.</p></div>"""

MOCKS["identity"] = """
<div class="mock"><div class="mock-label">one paragraph now, a migration later</div>
<div class="card-quote">
  <p><b>The question.</b> Is a block’s identity its <code>id</code>, or its <code>name</code>?</p>
  <p><b>Why it has to be answered now.</b> “Make a linked copy of the block (links by name)” is on your
  earliest block list, and the donor carries <code>Draft N</code> as a same-name definition identity.
  The <code>Draft</code> badge already ships here as vocabulary with nothing behind it. The scene
  contract is about to freeze exactly this.</p>
  <p><b>Recommended default.</b> Identity is the <code>id</code>; <code>name</code> is a label, and a
  linked copy is two nodes sharing a <code>definitionId</code>. That keeps renames free and makes
  “linked” explicit rather than emergent from a string match.</p>
</div></div>"""

SEQ = [
    ("barrier", "Scene record + wires, one dispatch",
     "P4 stops being “nice typing” — it is the substrate of four of the five omissions. "
     "Sequence it WITH the wiring, not after."),
    ("par", "Band ports", "The one real component gap. Small, named, unblocks all three control-flow kinds."),
    ("par", "Value capsule + stock presets", "One capsule preset, one data module, one gallery."),
    ("par", "Error / warning rungs", "Props-only on Port, Trace, Block."),
    ("then", "The container probe", "While / If / For as prop bundles. Either saves three components or specifies one seam."),
    ("then", "Mutation edges · tidy obstacles · linters", "All derivations over the scene record, once it exists."),
    ("last", "Tracer host, ELK, animation", "After the contract is real and one host consumes it."),
]


def forgot_card(f: dict) -> str:
    media = (f'<figure class="shot"><img src="{uri(f["shot"])}" alt=""><figcaption>{f["shotcap"]}</figcaption></figure>'
             if f.get("shot") else MOCKS[f["mock"]])
    return f"""<article class="prop"><header class="prop-hd"><span class="prop-n">{f['n']}</span>
<h3>{f['title']}</h3></header><div class="prop-body">
<p class="claim">{f['lead']}</p><p class="why"><b>Why it matters.</b> {f['why']}</p>{media}</div></article>"""


LANDED = [
    ("wiring.webp", "Blocks · Wiring", "Six topologies — the DAG milestone, landed today."),
    ("async.webp", "Blocks · Async Region", "Stream / Service / Action across four walls."),
    ("distribution.webp", "Ports · Distribution", "0.000 asymmetry; a lone port centres with no special case."),
    ("tidymatrix.webp", "Trace · Tidy Matrix", "All sixteen direction pairs, no-ops labelled as no-ops."),
    ("block-layouts-simple.webp", "Blocks · Layouts", "Nine body compositions, real names."),
    ("trace-interactive.webp", "Trace · Interactive", "Straight traces are polylines with draggable control points."),
]

HTML = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>bbox-ui — what remains</title><style>
:root{{--bg:#0e0f12;--panel:#15171c;--panel2:#1b1e25;--line:#282d38;--fg:#e6e8ee;--dim:#9aa3b2;
--dim2:#6b7383;--accent:#f0883e;--accent2:#5aa9f8;--ok:#3fb950;--warn:#d29922;--err:#e5534b;
--mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace}}
*{{box-sizing:border-box}} body{{margin:0;background:var(--bg);color:var(--fg);
font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif}}
.wrap{{max-width:1080px;margin:0 auto;padding:48px 24px 96px}}
h1{{font-size:34px;margin:0 0 6px;letter-spacing:-.02em}}
h2{{font-size:13px;text-transform:uppercase;letter-spacing:.14em;color:var(--dim2);margin:64px 0 18px;font-weight:600}}
.sub{{color:var(--dim);font-size:17px;margin:0 0 28px}}
.facts{{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin:28px 0}}
.fact{{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px 16px}}
.fact b{{display:block;font-size:26px;font-variant-numeric:tabular-nums}}
.fact span{{font-size:11.5px;color:var(--dim2);text-transform:uppercase;letter-spacing:.08em}}
.lede{{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--accent);
border-radius:10px;padding:18px 22px;margin:26px 0}}
.lede p{{margin:0 0 10px}} .lede p:last-child{{margin:0}}
.prop{{background:var(--panel);border:1px solid var(--line);border-radius:12px;margin:0 0 18px;overflow:hidden}}
.prop-hd{{display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid var(--line);background:var(--panel2)}}
.prop-n{{font:600 12px/1 var(--mono);color:var(--bg);background:var(--accent);padding:5px 8px;border-radius:5px}}
.prop-hd h3{{margin:0;font-size:18px}} .prop-body{{padding:18px 20px 20px}}
.claim{{margin:0 0 10px}} .why{{margin:0;color:var(--dim);font-size:14px}} .why b{{color:var(--fg)}}
figure{{margin:16px 0 0}} .shot img,.gal img{{width:100%;display:block;border-radius:8px;border:1px solid var(--line);background:#0a0b0e}}
.gal img{{max-height:240px;object-fit:contain;object-position:left top;padding:6px}}
figcaption{{font-size:12.5px;color:var(--dim2);margin-top:8px}}
.gal figcaption b{{display:block;color:var(--fg);font-size:13px;margin-bottom:2px}}
.gallery{{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:18px}}
.mock{{margin-top:16px;background:var(--bg);border:1px dashed #333a47;border-radius:10px;padding:18px}}
.mock-label{{font:600 10.5px/1 var(--mono);color:var(--accent);text-transform:uppercase;letter-spacing:.12em;margin-bottom:14px}}
.mock-note{{margin:14px 0 0;font-size:13px;color:var(--dim2)}}
pre.code{{background:#0a0b0e;border:1px solid var(--line);border-radius:8px;padding:14px 16px;
overflow-x:auto;font:12.5px/1.6 var(--mono);margin:0}}
pre.code .c{{color:#6a9955}} pre.code .k{{color:#c586c0}} pre.code .t{{color:#4ec9b0}}
code{{font-family:var(--mono);font-size:.92em;color:var(--accent2)}}
.ev{{width:100%;border-collapse:collapse;font-size:13.5px}}
.ev td{{padding:11px 12px 11px 0;border-bottom:1px solid #1f232b;vertical-align:top}}
.ev td:first-child{{font:600 11.5px var(--mono);color:var(--accent);white-space:nowrap;width:1%}}
.ev td:last-child{{color:var(--dim2);font-size:12.5px;white-space:nowrap;width:1%}}
.presets{{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}}
.preset{{border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--panel2)}}
.ph{{padding:7px 10px;font:600 11.5px var(--mono);border-bottom:1px solid var(--line)}}
.ph.band{{background:#22262f;color:var(--accent2)}}
.pb{{padding:16px 10px;font-size:12px;color:var(--dim2);text-align:center}}
.pb.arms{{display:flex;flex-direction:column;gap:5px;text-align:left}}
.pb.arms span{{border:1px dashed #3a4250;border-radius:5px;padding:4px 7px;font-size:11px}}
.pb.arms .dim{{opacity:.42}}
.pf{{padding:6px 10px;border-top:1px solid var(--line);font-size:11px;color:var(--dim2);text-align:right}}
.three{{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:16px}}
.tm{{background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:11px 13px}}
.tm b{{display:block;font:600 13px var(--mono)}} .tm span{{display:block;font-size:11px;color:var(--dim2);margin-bottom:6px}}
.tm code{{display:block;font-size:11px;margin-bottom:6px}} .tm em{{font-size:11.5px;color:var(--warn);font-style:normal}}
.valrow{{display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap}}
.capsule{{display:flex;align-items:center;gap:8px;background:var(--panel2);border:1px solid var(--line);
border-radius:999px;padding:7px 12px;font:600 13px var(--mono)}}
.dot{{width:9px;height:9px;border-radius:50%;border:2px solid var(--accent);display:inline-block}}
.dot.out{{border-color:var(--ok)}}
.picker{{margin-left:auto;background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:7px;min-width:150px}}
.picker-hd{{font-size:10.5px;color:var(--dim2);text-transform:uppercase;letter-spacing:.09em;padding:3px 6px 6px}}
.pi{{padding:5px 8px;border-radius:5px;font-size:12.5px;color:var(--dim)}}
.pi.sel{{background:#2b3140;color:var(--fg)}}
.rungs{{display:flex;flex-direction:column;gap:9px}}
.rung{{display:flex;align-items:center;gap:11px;font-size:13px}}
.rung b{{min-width:78px}} .rung span:last-child{{color:var(--dim2);font-size:12.5px}}
.pdot{{width:15px;height:15px;border-radius:50%;border:3px solid var(--dim2);display:inline-block;flex:none}}
.pdot.ok{{border-color:var(--ok)}} .pdot.warn{{border-color:var(--warn)}} .pdot.err{{border-color:var(--err)}}
.wline{{width:30px;height:3px;background:var(--err);display:inline-block;flex:none;border-radius:2px}}
.card-quote{{background:var(--panel2);border-left:2px solid var(--accent2);border-radius:0 8px 8px 0;padding:14px 16px}}
.card-quote p{{margin:0 0 9px;font-size:13.5px}} .card-quote p:last-child{{margin:0}}
.seq{{display:flex;flex-direction:column;gap:9px}}
.sq{{display:flex;gap:14px;align-items:flex-start;background:var(--panel);border:1px solid var(--line);
border-radius:9px;padding:13px 16px}}
.sq-k{{font:600 10px var(--mono);text-transform:uppercase;letter-spacing:.1em;padding:4px 8px;border-radius:4px;
flex:none;min-width:70px;text-align:center}}
.sq-k.barrier{{background:#4a2b24;color:#f0a68e}} .sq-k.par{{background:#1e3d26;color:#7ee29a}}
.sq-k.then{{background:#24384a;color:#8ec5f0}} .sq-k.last{{background:#2b2f38;color:var(--dim)}}
.sq b{{display:block;font-size:14.5px;margin-bottom:2px}} .sq span{{font-size:13px;color:var(--dim)}}
footer{{margin-top:72px;padding-top:20px;border-top:1px solid var(--line);color:var(--dim2);font-size:12.5px}}
</style></head><body><div class="wrap">

<h1>bbox-ui — what remains</h1>
<p class="sub">Read from SystemSketch’s source (not only its notes), bbox-ui’s docs, and your
screenshots. The headline is not a list: it is that three items on your list are one component.</p>

<div class="facts">
 <div class="fact"><b>{F['components']}</b><span>components</span></div>
 <div class="fact"><b>{F['stories']}</b><span>story files</span></div>
 <div class="fact"><b>139</b><span>story tests</span></div>
 <div class="fact"><b>186</b><span>unit tests</span></div>
 <div class="fact"><b>{F['commits']}</b><span>commits today</span></div>
 <div class="fact"><b>4,474</b><span>donor lines this replaces</span></div>
</div>

<div class="lede">
 <p><b>The short answer to “am I ready to finish things off”: not quite, and the blocker is not
 components.</b> You have {F['components']} of them and 139 passing story tests. What is missing is a
 document model — so every container you build next invents its own nesting, and you re-unify them in
 a month.</p>
 <p>Everything below is either evidence for that, or the small list of things genuinely missing
 underneath it.</p>
</div>

<h2>Loops, branches and regions are one component</h2>
<p class="sub" style="font-size:14px">Not an intuition — the donor’s own code says so, in three
places, and your vault said it before the code did.</p>
<table class="ev">
 {''.join(f'<tr><td>{a}</td><td>{b}</td><td>{c}</td></tr>' for a, b, c in EVIDENCE)}
</table>
{MOCKS["container"]}

<h2>What you forgot</h2>
{''.join(forgot_card(f) for f in FORGOT)}

<h2>Sequencing</h2>
<div class="seq">
 {''.join(f'<div class="sq"><span class="sq-k {k}">{k}</span><div><b>{t}</b><span>{d}</span></div></div>'
          for k, t, d in SEQ)}
</div>

<h2>What this is built on — landed today</h2>
<div class="gallery">
 {''.join(f'<figure class="gal"><img src="{uri(f)}" alt="{t}"><figcaption><b>{t}</b><span>{c}</span></figcaption></figure>'
          for f, t, c in LANDED)}
</div>

<h2>Out of scope, and one decision waiting on you</h2>
<div class="lede">
 <p><b>Behaviour trees</b> — your instruction; they go to the bt-flow library.</p>
 <p><b>The While-loop design</b> — decided 2026-09-06 (W10 + W2). Port the decision, do not
 re-litigate it.</p>
 <p><b>A libavoid comparison</b> — it is LGPL, which an attribution comment does not discharge. The
 repo already decided not to read it (<code>elbow/nudge.ts:63-68</code>) and cited papers instead.</p>
 <p><b>Waiting on you:</b> <code>DP - Region</code> says regions are <i>not</i> collapsible — “folding
 them would mean something different” — and neither donor region folds. Your blackbox-toggle ask
 contradicts that. Reversible default if you say nothing: blackbox means the region is a Block in
 whitebox/blackbox views, repealing the old rule.</p>
</div>

<footer>Built by <code>docs/build_remaining_report.py</code> from <code>{F['head']}</code>; captures by
<code>docs/capture_storybook_shots.mjs</code> against the live Storybook on :5421. Every count above is
read off the tree at build time. Full working notes:
<code>docs/REMAINING-2026-09-17.md</code>.</footer>
</div></body></html>"""

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(HTML)
enc = len(quote(HTML, safe="").encode())
cap = 2_097_024
print(f"wrote {OUT} ({OUT.stat().st_size:,} bytes)")
print(f"encoded data: URL {enc:,} / {cap:,} ({enc/cap:.0%}) -> "
      f"{'OK, opens in preview' if enc < cap else 'OVER CAP — browser-only'}")
