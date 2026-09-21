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


# Verified verbatim against the project page, with line numbers. `mine` = Zach's own prose;
# `kept` = an AI analysis block on his page that he retained (still his stated position by
# adoption, but not his voice — attributed separately so the citation is honest).
PRINCIPLES = [
    ("P1", "Isolation, then together", "mine", "PROJECT:36",
     "being able to see each of the components in isolation and then also together right.",
     "The organising goal of the whole library. Any scheme has to make a part legible alone "
     "<em>and</em> legible in composition."),
    ("P2", "Solve it once", "mine", "PROJECT:38",
     "let me solve it once and make it right",
     "Anti-duplication, stated as a value. Copying an aspect into every component folder is the "
     "thing this rejects."),
    ("P3", "The portability line", "mine", "PROJECT:92",
     "If you look at it like static UI. without all the interactions, that certainly is stuff "
     "that is very portable. alot of the interactions though not so much.",
     "<b>The sharpest structural principle on the page.</b> You already split a component along "
     "static-vs-interaction, on portability grounds. That is a reason to cut there rather than "
     "anywhere else."),
    ("P4", "Detach is universal", "mine", "PROJECT:103",
     "All components support \u2018detach to primative\u2019, which means even the most complex "
     "composite component can also support \u2018detach to primative\u2019",
     "If <em>every</em> component supports it, it cannot live inside any one of them. This is the "
     "principled case for a top-level <code>detach/</code> — which already exists, 1,357 lines."),
    ("P5", "Extraction regret", "mine", "PROJECT:125",
     "There seems to be alot of things that its a shame they haven\u2019t been like extracted from "
     "a particular library, for example like the elbow routing",
     "You have already named the failure mode: reusable logic trapped inside something specific. "
     "Argues for hoisting cross-cutting aspects out."),
    ("P6", "Capability tiers", "mine", "PROJECT:132",
     "What is possible with just the whiteboard and no contextual menu? what is possible with the "
     "whiteboard and a contextual menu? What is possible with the whiteboard and a inspector menu? "
     "These are different things right...",
     "You already think of the editing surfaces as <em>tiers of capability</em>. That is a ready-made "
     "organising axis for <code>edit/</code> — and a better one than “menus vs panels”."),
    ("P7", "Simple / Port / Expanded", "mine", "PROJECT:202",
     "3 key views — Simple, Port, Expanded (S/P/E)",
     "States are a first-class axis, not a detail. A component library is mostly states, so a scheme "
     "that has no home for them is incomplete."),
    ("P8", "Specific, solved generally", "mine", "PROJECT:783",
     "For me one trick is to just try to solve a very specific problem in the most general way "
     "possible — that way you at least get 1 problem, and you are open to get as many other ones "
     "as you may end up getting.",
     "Against speculative structure. Build the folder when there is a specific problem in it, not "
     "in advance — which is an argument for graduating rather than imposing."),
    ("P9", "What is portable", "kept", "PROJECT:283",
     "What is portable is <b>the model and the algorithms, never the components.</b>",
     "The components/scene split is about portability, not tidiness. Explains why scene must stay "
     "pure and why components may not import it."),
    ("P10", "One pure core, N host bindings", "kept", "PROJECT:285",
     "one pure core, N host bindings that share nothing with each other",
     "The narrow waist. <b>The layer boundary is what carries the value</b> — which means the "
     "within-layer folder shape, the thing you are asking about, is a second-order decision. Worth "
     "saying plainly rather than overselling any option below."),
    ("P11", "Presets get folders too", "mine", "PROJECT:2360",
     "in story board please organize though so its kinda clear.. We will have lots of block "
     "presets coming up. each should kidna get their own folder as if it was a component, even "
     "though its just a preset.",
     "<b>A settled instruction, already given.</b> One folder per preset, peer to components — "
     "even though a preset is not a component. Any scheme has to carry this, and none of mine did "
     "until now. Reinforced by <em>“All of these can be made with specific settings of the basic "
     "components, no need for new things”</em> (MOC:221): presets get folders, not component "
     "code."),
    ("P12", "You already over-modularised once", "mine", "MOC:475",
     "frusterating with kinda like the amount of duplication going on… The goal was to basically "
     "get a more modular structure going on. <b>I think I went quite overboard though and got lost "
     "in the weeds.</b> there is this fine balance…",
     "<b>The strongest argument in the whole document, and it is a warning.</b> The restart was "
     "caused by duplication; the over-correction was caused by too much structure. You have named "
     "both failure modes yourself, which is exactly the case for graduating rather than imposing."),
    ("P13", "Prefer one big refactor", "mine", "MOC:485",
     "So let me actually just get fabel 5.1 to just refactor this all in one shot... that is really "
     "how you want to be working more efficiently right Zach, not these small steps ideally...",
     "<b>This cuts against my own recommendation</b> and I would rather surface it than bury it. "
     "Proposal 5 sells “incremental, stoppable migration” as a virtue; you have said you "
     "prefer one shot. See the note under the recommendation."),
    ("P14", "Hand-wire it, do not auto-generate", "mine", "PROJECT:3377",
     "you could almost like auto generate these inspector panels I don’t see right now me having "
     "like that many different options so I think we can almost hand design them and hand wire them "
     "for now",
     "An explicit rejection of premature generality, in the exact place a framework is most "
     "tempting. Ratifies killing the manifest/registry idea, and warns against any scheme whose "
     "value is “it would scale”."),
    ("P15", "Two surfaces, always", "mine", "MOC:285",
     "1. All the behaviors I request. They should be reflected in the isolated /create page as part "
     "of bbox-ui  2. Then they should also be relflected in system sketch",
     "Every behaviour owes an isolated bench <em>and</em> the consuming app. This is why the "
     "cross-app <code>@trunk</code> boundary exists, and why “it works in Storybook” is only "
     "half of done."),
]

PROPOSALS = [
    {
        "id": "1", "name": "Aspect-first",
        "tag": "your proposal, literally",
        "idea": "Level 2 is the aspect vocabulary. The same sub-headers repeat inside every "
                "component, so finding “how dragging works” is the same move on every part.",
        "why": [("P1","Repeating the same sub-headers is what makes a part legible alone \u2014 read one component folder and you know the shape of every other."),("P7","Gives states an obvious home: <code>states.tsx</code> beside <code>anatomy</code>."),("P6","Its editor column can carry your capability tiers directly.")],
        "tension": ("P2 + P8","Copying <code>drag.ts</code> into every component folder is exactly what \u201csolve it once\u201d rejects \u2014 and creating seven folders before there is code for them is structure ahead of the specific problem."),
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
        "why": [("P3","<code>view</code> / <code>model</code> is your portability line drawn literally \u2014 the static portable part split from the part that is not."),("P9","Makes \u201cthe model and the algorithms are what travels\u201d visible in the folder names."),("P1","Self-similarity: one learned shape works at every level.")],
        "tension": ("P2","Still puts per-component copies of cross-cutting behaviour in each folder, and forces <code>scene/</code> to reorganise around components when several of its concepts legitimately span them."),
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
        "why": [("P3","<b>This is your portability sentence turned into folders.</b> <code>headless/</code> is what you called \u201cvery portable\u201d; <code>skin/</code> is what you said is not."),("P9","Matches what actually travels between hosts."),("P10","Keeps the pure core pure by construction, at component level.")],
        "tension": ("P1 + P6","Answers \u201cwhere does drag live\u201d with \u201csomewhere in headless/\u201d \u2014 not legible in isolation \u2014 and says nothing about the edit surfaces."),
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
        "why": [("P8","Maximally unspeculative \u2014 invents nothing, adds no scheme to mis-apply."),("P5","Being conventional is what makes a part easy to lift out of the repo later.")],
        "tension": ("P1 + P3 + P7","Organises by artifact type, so it answers \u201cwhere are the types\u201d but not \u201cwhere is drag\u201d or \u201cwhere are the states\u201d \u2014 and a 1,498-line file stays 1,498 lines."),
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
        "why": [("P8","<b>The most direct expression of your own trick.</b> Split when a specific component has a specific problem; stay general by keeping the same aspect vocabulary everywhere."),("P1","<code>ls components/portEdge/</code> still shows the aspects, so isolation survives."),("P2","Cross-cutting aspects stay hoisted, so nothing is solved twice.")],
        "tension": ("P7","Has no dedicated home for states \u2014 S/P/E would land in the main file or a <code>.states.tsx</code>, which is a convention rather than a structure."),
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
        "why": [("P2","<b>The literal implementation of \u201csolve it once\u201d</b> \u2014 <code>dragPolicy.ts</code> serves every draggable part, written once."),("P4","<code>detach/</code> is a top-level folder because every component supports detach. The principle predicted the folder."),("P5","Hoisting is the cure for extraction regret \u2014 the elbow-routing complaint, pre-empted.")],
        "tension": ("P1","Component-local behaviour has nowhere to go, so it stays in the component file \u2014 which is how <code>portEdge.tsx</code> reached 1,498 lines. Legible together, not in isolation."),
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
    whys = "".join(f'<li><a class="pref" href="#{pid}">{pid}</a> {txt}</li>' for pid, txt in p["why"])
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
  <div class="why"><h4>Why this follows from what you have written</h4><ul>{whys}</ul>
    <p class="tens"><b>But it cuts against {p['tension'][0]}.</b> {p['tension'][1]}</p></div>
  <p class="best"><b>Best when.</b> {p['best']}</p>
  <div class="vote"><button data-v="yes">▲ This one</button>
    <button data-v="maybe">● Maybe</button><button data-v="no">▼ No</button>
    <textarea rows="1" placeholder="Notes on proposal {p['id']}…"></textarea></div>
</section>"""


def build():
    props = "".join(prop_html(p) for p in PROPOSALS)
    prin_rows = "".join(
        f'<tr id="{pid}"><td class="pid2">{pid}</td><td><b>{name}</b>'
        f'<span class="src {src}">{"his" if src == "mine" else "kept"}</span><br>'
        f'<span class="quote">\u201c{quote}\u201d</span>'
        f'<br><span class="cite">{line if isinstance(line,str) else "PROJECT:"+str(line)}</span></td>'
        f'<td class="cons">{cons}</td></tr>'
        for pid, name, src, line, quote, cons in PRINCIPLES)
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
.why{background:color-mix(in srgb,var(--accent) 7%,transparent);border-radius:9px;padding:12px 15px;margin:10px 0 0}
.why h4{margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--accent)}
.why ul{margin:0;padding-left:17px;font-size:13.5px}.why li{margin-bottom:5px}
.why .tens{margin:9px 0 0;font-size:13.5px;color:var(--fg);border-top:1px dashed var(--line);padding-top:8px}
a.pref{display:inline-block;min-width:24px;font-weight:700;font-size:11.5px;color:#fff;
  background:var(--accent);border-radius:5px;padding:1px 5px;text-decoration:none;margin-right:5px}
table.prin td{font-size:14px}
td.pid2{font-weight:700;color:var(--accent);width:34px;vertical-align:top}
.quote{font-style:italic;color:var(--fg)}
.cite{font-family:ui-monospace,monospace;font-size:11px;color:var(--muted)}
.src{font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;padding:1.5px 6px;border-radius:99px;margin-left:7px;vertical-align:middle}
.src.mine{background:color-mix(in srgb,var(--yes) 22%,transparent);color:var(--yes)}
.src.kept{background:color-mix(in srgb,var(--warn) 22%,transparent);color:var(--warn)}
td.cons{color:var(--muted);font-size:13px;width:40%}
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

<h2>The principles these are judged against</h2>
<p>You asked for reasoning tied to what you have actually written down. These are verbatim from
<code>PROJECT - Black Box UI.md</code>, with line numbers so you can check every one. Each
proposal below cites them, <b>including the one it cuts against</b> — every scheme violates
something, and saying which is the useful part.</p>
<table class="prin"><tbody>{prin_rows}</tbody></table>
<p class="cav"><b>On attribution:</b> P1–P8 are your own prose. P9 and P10 are from an AI
analysis block on your page that you kept — your position by adoption, not your voice. Marked
so the citation is honest.</p>

<div class="find" style="border-left-color:var(--accent)">
<h3>What P10 means for this whole question</h3>
<p>“One pure core, N host bindings that share nothing with each other” says the value is
carried by the <b>boundary between</b> components / scene / edit — not by the folder shape
<em>inside</em> any of them. That boundary already holds: components imports no engine, scene has
no React or DOM.</p>
<p>So the honest framing is that <b>this is a second-order decision</b>. Every option below
preserves the thing that matters; they differ on navigation, duplication and migration cost. That
is a reason to pick the cheapest one that answers your actual question, not the most elegant one.</p>
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
<p><b>Proposal 6 for cross-cutting aspects, proposal 5 for component-local ones, and when a
component does get split, cut it on proposal 2’s line.</b></p>
<p>Three principles pick this, and they pick it for different reasons, which is why I trust it:</p>
<table><tbody>
<tr><td class="pid2">P2</td><td><b>Keep cross-cutting aspects hoisted.</b> <code>dragPolicy.ts</code>
serves every draggable part. Copying it into <code>components/port/drag.ts</code> and
<code>components/block/drag.ts</code> is the opposite of “solve it once and make it right”.
<a class="pref" href="#P4">P4</a> proves the pattern already works — <code>detach/</code> is a
top-level folder precisely because <em>every</em> component supports detach.</td></tr>
<tr><td class="pid2">P12</td><td><b>You have already over-corrected once.</b> The restart came from duplication; the thing that went wrong next was <em>too much</em> structure — “quite overboard… lost in the weeds”. That is the single strongest reason to spend folders only where a component has earned them, and it is your own account of what happened. <a class="pref" href="#P14">P14</a> says the same thing from the other side: hand-wire it, do not auto-generate.</td></tr>
<tr><td class="pid2">P8</td><td><b>Do not impose folders in advance.</b> “Solve a very specific
problem in the most general way possible” cuts against creating seven sub-folders for a 90-line
component that has no code to put in them. Split a component the day it has a specific problem —
which today is 22 of 77.</td></tr>
<tr><td class="pid2">P3</td><td><b>When you do split, cut on the portability line.</b> This is the
detail I would have got wrong without the principle. The natural instinct is to split by feature
(<code>drag</code>, <code>hover</code>, <code>paint</code>), but your own sentence says the load-bearing
line is static-versus-interaction. So the first cut is
<code>portEdge.view.tsx</code> · <code>portEdge.model.ts</code> ·
<code>portEdge.interactions.ts</code> — proposal 2’s names, applied inside proposal 5’s
graduated scheme. Feature-named files come <em>after</em> that, only if a component is still too big.</td></tr>
</tbody></table>
<p>And for <code>edit/</code>, <a class="pref" href="#P6">P6</a> supplies an axis nobody proposed:
organise by <b>capability tier</b> — what works with no menu, with a contextual menu, with an
inspector — because that is how you already reason about those surfaces. It is a better cut than
“menus vs panels”, which is about widgets rather than about what the user can do.</p>

<div class="find" style="border-left-color:var(--no)">
<h3>Two corrections a fuller read of your page forced</h3>
<p><b>1 — You already answered part of this, and none of my six schemes honoured it.</b>
<a class="pref" href="#P11">P11</a>: <em>“each should kidna get their own folder as if it was a
component, even though its just a preset.”</em> Presets are peer to components at level 1.
So <code>components/</code> is not only the 77 parts — <code>loop/</code>, <code>while/</code>,
<code>branch/</code> and the rest sit beside them, holding configuration rather than component
code (<a class="pref" href="#P11">MOC:221</a>: <em>“no need for new things”</em>). Every
scheme above should be read with a <code>presets/</code> peer folder added.</p>
<p><b>2 — My “incremental migration” selling point contradicts a preference you have
stated.</b> <a class="pref" href="#P13">P13</a>: <em>“just refactor this all in one shot… not
these small steps ideally.”</em> I listed “incremental, stoppable” as a virtue of proposal
5 and as a mark against 1 and 2. On your stated preference that is backwards.</p>
<p>The resolution is that these are different decisions and only one of them is about speed.
<b>How much structure</b> to impose is settled by <a class="pref" href="#P12">P12</a> — you have
already been “quite overboard… lost in the weeds” once, so the answer is: only where a
component has earned it. <b>How fast to get there</b> is settled by P13: once you have picked the
target shape, do it in one pass, not a component a week. Graduated is about the <em>destination</em>,
not the pace. So: decide the scheme now, apply it to all 22 large components in one shot, and leave
the 55 small ones alone permanently — that is one refactor, not a drip.</p>
</div>

<h2>The one thing worth writing down</h2>
<p>The missing artifact is small: <b>a list of which aspects are cross-cutting and which are
component-local.</b> Today that split is implicit, which is why the question “where should this
go” has no answer without reading the repo. Two rules make it decidable, and the second is
already in your <code>ARCHITECTURE.md</code>:</p>
<p style="padding:10px 14px;border-radius:8px;background:color-mix(in srgb,var(--accent) 9%,transparent)">
<b>1.</b> If more than one component needs it, it is cross-cutting — hoist it
(<a class="pref" href="#P2">P2</a>, <a class="pref" href="#P5">P5</a>).<br>
<b>2.</b> If it spans the canvas it belongs to the host; if it is bounded by one component’s box
it is ours — already written in <code>ARCHITECTURE.md</code>.</p>
<table><thead><tr><th>Cross-cutting — top-level folder</th><th>Component-local — inside the folder</th></tr></thead>
<tbody><tr><td>drag / resize / move · hover / affordance · visual appearance · layout / geometry ·
hit regions · keyboard</td>
<td>anatomy / slots · how it paints · what it stores · semantics / kinds · add / remove members ·
text editing · <b>states (S/P/E)</b></td></tr></tbody></table>
<p>On the single-call rule: restate it as <b>“at most one <em>scene</em> call per entry
point”</b>, with the projection sandwich exempt. The honest minimum today is five operations, at
<code>sourceContextMenu.tsx:165-176</code> — and that handler is the repo’s best example of the
intended architecture, which the rule as first worded would have failed.</p>

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
