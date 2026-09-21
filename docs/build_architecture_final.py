#!/usr/bin/env python3
"""The settled bbox-ui architecture — the whole proposal and the philosophy under it.

Everything here was decided by Zach on 2026-09-21 across a long working session,
and every number is measured in the repo rather than asserted. This builder is
the durable explainer; ARCHITECTURE.md is the normative record.

Charts are hand-drawn inline SVG — no chart library, works offline.
"""
from __future__ import annotations

import pathlib

OUT = pathlib.Path("/home/bam/bbox-ui/reports/media/architecture-settled-2026-09-21.html")

# ---------------------------------------------------------------- philosophy
PRINCIPLES = [
    ("Isolation, then together", "PROJECT:36",
     "being able to see each of the components in isolation and then also together right.",
     "Every component is legible alone <em>and</em> in composition. This is why each one gets a "
     "folder with its own story, and why the cross-component scenario stories still exist."),
    ("Solve it once", "PROJECT:38", "let me solve it once and make it right",
     "Nothing cross-cutting gets copied into every component. It is written once, in the one "
     "place that can own it."),
    ("The portability line", "PROJECT:92",
     "If you look at it like static UI. without all the interactions, that certainly is stuff "
     "that is very portable. alot of the interactions though not so much.",
     "The load-bearing cut inside a component is static-versus-interaction, not feature-by-feature."),
    ("Detach is universal", "PROJECT:103",
     "All components support ‘detach to primative’",
     "If every component supports it, it cannot live inside any one of them."),
    ("Extraction regret", "PROJECT:125",
     "a shame they haven’t been like extracted from a particular library, for example like the "
     "elbow routing",
     "The named failure mode: reusable logic trapped inside something specific."),
    ("Specific, solved generally", "PROJECT:783",
     "solve a very specific problem in the most general way possible",
     "Structure follows a real problem. No folder is created in advance of code to put in it."),
    ("You already over-modularised once", "MOC:475",
     "I think I went quite overboard though and got lost in the weeds.",
     "<b>The warning that shapes everything.</b> The restart was caused by duplication; the "
     "over-correction was caused by too much structure. Both failure modes, named first-hand."),
    ("Presets get folders too", "PROJECT:2360",
     "each should kidna get their own folder as if it was a component, even though its just a preset.",
     "Presets are peer to components at level 1."),
    ("Hand-wire it, don’t auto-generate", "PROJECT:3377",
     "we can almost hand design them and hand wire them for now",
     "An explicit rejection of premature generality — and the reason the manifest/registry "
     "proposal was killed."),
    ("Two surfaces, always", "MOC:285",
     "reflected in the isolated /create page… then they should also be relflected in system sketch",
     "Every behaviour owes an isolated bench <em>and</em> the consuming app."),
]

# ----------------------------------------------------------------- the rules
PLACEMENT = [
    ("Does it render, or touch the DOM?", "components/ or editor/",
     "React, JSX, hooks, <code>getBoundingClientRect</code> — anything that paints or measures."),
    ("Is it pure, and reused across components?", "scene/",
     "<b>Domain vocabulary is fine here.</b> <code>scene/</code> IS the domain model, so naming "
     "ports and blocks is expected, not disqualifying."),
    ("Is it pure, and used by exactly one component?", "inside that component",
     "Self-contained functional code has no reason to leave the folder that uses it."),
    ("Is it applied on top, with the component unaware?", "skin/",
     "Tokens, and the sketch technique. Components declare the contract; skin injects the values."),
    ("Is it a configuration of existing components?", "presets/",
     "Loop, branch, while. A preset mints no new component."),
]

TOPLEVEL = [
    ("Applied on top, component unaware", "skin/", "the component does not know it is drawn that way"),
    ("Between components with no common owner", "was magnet/", "no <code>TraceBlock</code> component "
     "exists — though the pure half of magnet lands in <code>scene/interactions/</code>"),
    ("Every component needs it", "was detach/", "it cannot live in one of them — though again "
     "the pure half is scene"),
]

MOVES = [
    ("scene/", 2817, 15, "var(--accent)",
     "<code>dragPolicy</code> 592 · <code>magnetProposals</code> 558 · "
     "<code>fitToContent</code> 527 · detach model/plan/rebuild/sweep 636 · "
     "<code>dragIntent</code>+<code>grabChain</code> 263 · <code>hitPolicy</code> 61"),
    ("components/ + editor/", 1561, 10, "var(--yes)",
     "the React/DOM shells: <code>harness.tsx</code> · <code>policyStage.tsx</code> · "
     "<code>stockShapes</code> → <code>components/stock/</code> · "
     "<code>useMagnetDrag</code> · <code>magnetProposalLayer</code>"),
    ("skin/ — stays", 2415, 6, "var(--warn)",
     "token supply plus the sketch technique; components are unaware of both"),
    ("presets/ — stays", 997, 5, "var(--muted)", "one folder per preset, peer to components"),
]

STORIES = [
    ("map cleanly to a component", 80, "var(--yes)"),
    ("follow their hoisted code", 14, "var(--accent)"),
    ("scene-function stories", 18, "var(--warn)"),
    ("presets", 9, "var(--no)"),
    ("editor chrome", 6, "#b98cf0"),
    ("cross-component galleries", 3, "#57c8d4"),
]

CORRECTIONS = [
    ("A manifest / registry for features",
     "Killed. <a href=\"#P9\">Hand-wire it, don’t auto-generate</a> — and the single-call "
     "rule makes a registry unnecessary: if an editor entry point is one call into scene, there is "
     "no tangle for a registry to undo."),
    ("An Obsidian-style plugin runtime",
     "Not now. An extension API is a product in itself; the audience today is one person plus his "
     "own agents."),
    ("“Hoisting aspects to top level is the working baseline”",
     "Wrong — it was slop. Confirmed against 285 real repos: <b>zero</b> have a top-level "
     "<code>interaction/</code>, <code>drag/</code> or <code>gestures/</code>. What the industry "
     "hoists is <code>hooks</code>, <code>style</code>, <code>layout</code> — infrastructure only."),
    ("“Split a component folder by feature (drag, hover, paint)”",
     "No — <a href=\"#P3\">the portability line</a> says cut static-versus-interaction first."),
    ("“Use domain-noun count to decide placement”",
     "<b>My error, and the costliest.</b> It mis-sorted <code>dragPolicy.ts</code> (592 lines, 87 "
     "domain nouns) as component behaviour. It is pure, so it is scene. Domain vocabulary belongs "
     "in scene; the right axis is purity."),
    ("“Only split components that are big enough”",
     "No — every component gets a folder because every component needs a story. The "
     "<em>contents</em> vary; the folder does not."),
]

PRIOR_ART = [
    ("flat source", 123), ("domain/feature-first", 70), ("monorepo by package", 44),
    ("type-first", 31), ("layer-first", 17),
]


def bar_row(label, value, total, color, note):
    pct = value / total * 100
    return (f'<tr><td><b>{label}</b></td><td class="num">{value:,}</td>'
            f'<td><div class="bar"><span style="width:{pct:.1f}%;background:{color}"></span></div></td>'
            f'<td class="dim">{note}</td></tr>')


def donut(slices, size=230):
    import math
    total = sum(v for _, v, _ in slices) or 1
    cx = cy = size / 2
    ro, ri = size / 2 - 5, size / 2 - 54
    out, ang = [], -math.pi / 2
    for label, v, c in slices:
        sweep = 2 * math.pi * v / total
        if sweep <= 0:
            continue
        large = 1 if sweep > math.pi else 0
        x0, y0 = cx + ro * math.cos(ang), cy + ro * math.sin(ang)
        x1, y1 = cx + ro * math.cos(ang + sweep), cy + ro * math.sin(ang + sweep)
        xi0, yi0 = cx + ri * math.cos(ang + sweep), cy + ri * math.sin(ang + sweep)
        xi1, yi1 = cx + ri * math.cos(ang), cy + ri * math.sin(ang)
        out.append(f'<path d="M{x0:.1f},{y0:.1f} A{ro},{ro} 0 {large} 1 {x1:.1f},{y1:.1f} '
                   f'L{xi0:.1f},{yi0:.1f} A{ri},{ri} 0 {large} 0 {xi1:.1f},{yi1:.1f} Z" fill="{c}">'
                   f'<title>{label}: {v}</title></path>')
        ang += sweep
    out.append(f'<text x="{cx}" y="{cy-2}" class="dN">{total}</text>'
               f'<text x="{cx}" y="{cy+16}" class="dL">stories</text>')
    return f'<svg viewBox="0 0 {size} {size}" class="donut">{"".join(out)}</svg>'


def build():
    prin = "".join(
        f'<tr id="P{i+1}"><td class="pid">P{i+1}</td><td><b>{name}</b><br>'
        f'<span class="q">“{quote}”</span><br><span class="cite">{cite}</span></td>'
        f'<td class="dim">{cons}</td></tr>'
        for i, (name, cite, quote, cons) in enumerate(PRINCIPLES))
    place = "".join(
        f'<tr><td><b>{q}</b></td><td><code>{dest}</code></td><td class="dim">{note}</td></tr>'
        for q, dest, note in PLACEMENT)
    top = "".join(f'<tr><td><b>{r}</b></td><td><code>{ex}</code></td><td class="dim">{note}</td></tr>'
                  for r, ex, note in TOPLEVEL)
    total_moves = sum(v for _, v, _, _, _ in MOVES)
    moves = "".join(bar_row(l, v, total_moves, c, n) for l, v, _, c, n in MOVES)
    corr = "".join(f'<tr><td class="was">{a}</td><td>{b}</td></tr>' for a, b in CORRECTIONS)
    story_leg = "".join(
        f'<li><span class="sw" style="background:{c}"></span><b>{v}</b> {l}</li>'
        for l, v, c in STORIES)
    pa_total = sum(v for _, v in PRIOR_ART)
    pa = "".join(
        f'<tr><td>{l}</td><td class="num">{v}</td><td><div class="bar">'
        f'<span style="width:{v/pa_total*100:.0f}%"></span></div></td>'
        f'<td class="num">{v/pa_total*100:.0f}%</td></tr>' for l, v in PRIOR_ART)

    css = """
:root{--bg:#0f1013;--fg:#ececf0;--muted:#9a9aa6;--line:#26262e;--card:#16171b;--accent:#7d9bff;
  --yes:#4ac585;--no:#ff8a80;--warn:#e0b050}
@media(prefers-color-scheme:light){:root:not([data-theme="dark"]){--bg:#fbfbfd;--fg:#16161a;
  --muted:#6b6b76;--line:#e4e4ea;--card:#fff;--accent:#2f5bd8;--yes:#137a4b;--no:#b3261e;--warn:#8a5a00}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.63 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1080px;margin:0 auto;padding:46px 18px 90px}
h1{font-size:32px;margin:0 0 8px;letter-spacing:-.022em;line-height:1.16}
.sub{color:var(--muted);margin:0 0 26px}
h2{font-size:12.5px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);margin:48px 0 14px;font-weight:650}
.lede{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--accent);
  border-radius:0 12px 12px 0;padding:18px 21px;margin:0 0 14px;font-size:16.5px}
.lede b{color:var(--accent)}
table{width:100%;border-collapse:collapse;font-size:14.5px;margin:6px 0 12px}
th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);
  padding:7px 10px;border-bottom:1px solid var(--line)}
td{padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
td.num{text-align:right;font-variant-numeric:tabular-nums;color:var(--muted);white-space:nowrap}
td.dim{color:var(--muted);font-size:13.5px}
td.pid{font-weight:700;color:var(--accent);width:36px}
td.was{color:var(--no);font-weight:600;width:38%}
.q{font-style:italic}
.cite{font-family:ui-monospace,monospace;font-size:11px;color:var(--muted)}
code{font-family:ui-monospace,SFMono-Regular,monospace;font-size:.88em;
  background:color-mix(in srgb,var(--fg) 8%,transparent);padding:1.5px 5px;border-radius:4px}
.bar{height:8px;background:var(--line);border-radius:99px;overflow:hidden;min-width:110px}
.bar span{display:block;height:100%;background:var(--accent);border-radius:99px}
pre.tree{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;
  overflow-x:auto;font-family:ui-monospace,monospace;font-size:13px;line-height:1.62;margin:10px 0}
.two{display:grid;grid-template-columns:240px 1fr;gap:24px;align-items:center;background:var(--card);
  border:1px solid var(--line);border-radius:13px;padding:20px;margin-bottom:14px}
@media(max-width:760px){.two{grid-template-columns:1fr}}
.donut{width:100%;max-width:230px;height:auto}
.dN{fill:var(--fg);font:700 32px ui-sans-serif;text-anchor:middle}
.dL{fill:var(--muted);font:12px ui-sans-serif;text-anchor:middle}
ul.leg{list-style:none;margin:0;padding:0;font-size:14.5px}
ul.leg li{margin-bottom:7px;display:flex;gap:9px;align-items:baseline}
.sw{width:12px;height:12px;border-radius:3px;flex:none;position:relative;top:1px}
.dag{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px;margin:10px 0}
.phase{background:var(--card);border:1px solid var(--line);border-radius:13px;padding:18px 20px;margin-bottom:12px}
.phase h3{margin:0 0 8px;font-size:18px}
.phase.p1{border-left:3px solid var(--yes)}.phase.p2{border-left:3px solid var(--warn)}
.note{background:color-mix(in srgb,var(--warn) 9%,transparent);border-radius:9px;padding:12px 15px;
  font-size:14px;margin:12px 0}
"""
    tree = """apps/storybook-basics/src/
  components/            one folder per component, self-contained
    PortEdge/
      PortEdge.tsx           the view
      portEdge.types.ts      what it stores
      usePortEdge.ts         its own behaviour
      skin/                  its local presentation
      PortEdge.stories.tsx   ← moves here from src/stories/
      PortEdge.test.tsx      ← already colocated
      index.ts
    Badge/
      badge.tsx              one file is fine — the folder is the constant, not the contents
    stock/                   stock shapes: the thing you detach INTO

  scene/                 flat, grouped by what the operation DOES
    model.ts                 ← NEW: the types, today scattered across 8+ files
    tidy.ts  collapse.ts  containment.ts  linking.ts  history.ts
    layout/                  a folder when the concept is large
    interactions/            ← NEW: pure interaction policy
      magnet/                  magnetProposals, magnetPortTypes
      dragPolicy.ts            dragIntent.ts   grabChain.ts

  editor/                one folder per editor component, named for what it IS
    ContextualPopupMenu/     FileMenu/     TitleBar/
    Toolbar/                 ZoomMenu/     DevMenu/
    InspectorPanel/          ShareMenu/    LibraryPanel/

  presets/               one folder per preset, peer to components
    loop/  branch/  while/

  skin/                  applied on top; components are unaware
    tokens  ·  portVariants  ·  regionVariants  ·  the sketch technique"""

    dag = """  scene  ←──────  components     components never imports scene
    ↑                 ↑
    └──── editor ────┘             editor imports both; nothing imports editor"""

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>bbox-ui architecture — settled</title>
<style>{css}</style></head><body><div class="wrap">

<h1>The bbox-ui architecture, settled</h1>
<p class="sub">21 Sep 2026 · the whole proposal, the philosophy under it, and what it corrects</p>

<div class="lede">
<b>One question decides where any file lives: does it render?</b> If it paints or measures, it is a
component or editor. If it is pure and reused, it is scene — <b>domain vocabulary and all</b>.
If it is pure and used by one component, it stays in that component. Two deliberate exceptions sit
outside: <code>skin/</code>, which is applied on top while the component is unaware, and
<code>presets/</code>, which configure existing components rather than minting new ones.
</div>

<h2>The dependency DAG — the whole architecture in four lines</h2>
<div class="dag"><pre class="tree" style="margin:0;border:0;padding:0;background:transparent">{dag}</pre></div>
<p><code>components</code> not importing <code>scene</code> is the load-bearing one: it lets the same
<code>Block</code> be driven by a story literal, a React Flow node, a tldraw shape or a server-side
render. It is checked by grep in CI's stead.</p>

<h2>The placement rule</h2>
<table><thead><tr><th>Ask</th><th>Answer</th><th>Note</th></tr></thead><tbody>{place}</tbody></table>

<h2>What earns a place outside the three kits</h2>
<p>Three reasons, and only three. Each says why no single component can hold the thing.</p>
<table><thead><tr><th>Reason</th><th>Example</th><th>Why no component can own it</th></tr></thead>
<tbody>{top}</tbody></table>
<div class="note"><b>The counter-example that makes it decidable:</b> PortEdge owns its own
drag-and-drop, because <code>PortEdge</code> <em>is</em> the component containing both the port and
the edge — a self-contained universe. Magnet cannot be owned that way because it relates traces
and blocks, and no <code>TraceBlock</code> component exists. <b>If a component contains both sides
of an interaction, the interaction lives there.</b></div>

<h2>The shape</h2>
<pre class="tree">{tree}</pre>

<h2>What moves, measured</h2>
<table><thead><tr><th>Destination</th><th class="num">Lines</th><th></th><th>What</th></tr></thead>
<tbody>{moves}</tbody></table>
<p>Only <code>skin/</code> and <code>presets/</code> remain as top-level siblings. Everything else
resolves into the three kits — down from six sprawling top-level folders.</p>

<h2>The stories</h2>
<div class="two"><div>{donut([(l, v, c) for l, v, c in STORIES])}</div>
<div><ul class="leg">{story_leg}</ul>
<p class="sub" style="font-size:13.5px;margin-top:10px">All 129 live in one flat
<code>src/stories/</code> wing today, divorced from the components. Tests are already colocated,
so the repo is currently inconsistent with itself.</p></div></div>
<div class="note"><b>Orphan stories are orphans because their code is hoisted.</b>
<code>DragPolicy.stories.tsx</code> has nowhere to live precisely because <code>dragPolicy.ts</code>
has nowhere to live. Un-hoisting and colocating are the same operation, not two.</div>

<h2>The philosophy — quoted, with line numbers</h2>
<p>Every rule above traces to something already written in
<code>PROJECT - Black Box UI.md</code> or <code>MOC - bbox-ui Components.md</code>.</p>
<table><tbody>{prin}</tbody></table>

<h2>What this corrects</h2>
<p>Recorded so it is not relitigated — including the things I got wrong.</p>
<table><thead><tr><th>Proposed</th><th>Outcome</th></tr></thead><tbody>{corr}</tbody></table>

<h2>What 285 real repos say</h2>
<p>Folder layouts read from source via the GitHub trees API — node editors, graph engines,
whiteboards, plus UI kits as a control group.</p>
<table><thead><tr><th>Primary philosophy</th><th class="num">Repos</th><th></th><th class="num">Share</th></tr></thead>
<tbody>{pa}</tbody></table>
<p><b>Two findings that mattered.</b> Of repos showing a signal, 62% keep behaviour inside the
component folder — and what gets hoisted in the wild is only <code>hooks</code>,
<code>style</code>, <code>layout</code>, <code>animations</code>. <b>Zero</b> have a top-level
<code>interaction/</code>, <code>drag/</code> or <code>gestures/</code>. Separately,
file-per-component versus folder-per-component is a <b>dead heat</b> — 40/40/13 across 93 repos
— so prior art does not settle that one, and nobody should cite it as if it does.</p>

<h2>The plan</h2>
<div class="phase p1"><h3>Phase 1 — make what exists complete and correct</h3>
<p>Refactor into the shape above, colocate the 129 stories, un-hoist ~2,817 lines into
<code>scene/</code> and ~1,561 into their components, extract <code>scene/model.ts</code>, regroup
<code>editor/</code> into the chrome components, and give the four scene stories that render nothing
a visual form. One pass, not a drip.</p></div>
<div class="phase p2"><h3>Phase 2 — migrate the ~468 features from SystemSketch</h3>
<p>With the structure in place, migrate everything, cleanly and modularly. Anything unwanted gets
switched off after the fact rather than argued about in advance — which is cheaper than
triaging 468 items up front.</p></div>

</div></body></html>
"""


if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(build(), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size:,} bytes)")
