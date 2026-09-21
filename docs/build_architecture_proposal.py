#!/usr/bin/env python3
"""Build the architecture proposal — how to hold 468 features without a blob.

Zach asked two questions that turn out to be one question:

  (1) "We do want to avoid just having like this very old legacy database with
      all of these difference features... Perhaps like obsidan we should take
      more of a plugin architecture? can you please make some suggestions?"

  (2) "I kinda imagine in the documentation like a feature list around each of
      the features that shows like a short gif for something about what the
      feature does, and a text descriptoin"

And the fear under both: "the whole refactor form systemsketch to bbox ui was
about trying to almost redo systemsketch with a more principles approach.. I am
concerned with me just hand roll another blob agian".

Thesis: he already solved this once, in his notes. MOC - bbox-ui Components is a
flat folder of 37 pages where membership is a PROPERTY and every map is a
generated view ("adding a view never moves a file"). Mirror that in code rather
than import Obsidian's plugin runtime. And the feature list he wants IS the
registry the app reads — which is the mechanical reason it cannot rot.

Every number is measured. Provenance:
  storybook /index.json          -> 602 stories, 129 component titles, 10 buckets
  grep play: *.stories.tsx       -> 129 of 129 story files
  grep '/**' src/components      -> 54 of 77 component files carry JSDoc
  grep autodocs                  -> 0
  parity-backlog.json + regex    -> 272 of 468 items cite a `DP -` page
Images referenced, never inlined (the preview data-URL ceiling).
"""
from __future__ import annotations

import pathlib

OUT = pathlib.Path("/home/bam/bbox-ui/reports/media/architecture-2026-09-21.html")

MOC_QUOTE = (
    "Every component is one page in <code>Projects/bbox-ui/Components/</code>, flat, chrome "
    "included. Which project hosts it is a property of the page, not a folder — so a part "
    "that belongs to both has exactly one home. This page is the view by composition; "
    "MOC - SystemSketch Chrome is the view by screen position; MOC - Control Flow is the view by "
    "program construct. <strong>Adding a view never moves a file.</strong>"
)

MIRROR = [
    ("Flat folder, one page per part", "37 pages in <code>Components/</code>",
     "one folder per component, flat", "yes", "<code>components/</code> is flat, 123 files"),
    ("Membership is a property, not a folder", "a <code>Hosts:</code> column on the page",
     "a field in the feature manifest", "no", "today membership is an import in a chrome file"),
    ("Many generated views over one folder",
     "<code>&lt;!-- catalogue:generated --&gt;</code> — 3 MOCs, one folder",
     "docs page, storybook sidebar and menu registration all query the manifests",
     "no", "this is the one genuinely new thing"),
    ("Shared rules written once, linked", "Size Cascade, Detach to Primitive, Simple/Port/Expanded",
     "shared modules imported, never restated", "yes", "already how <code>scene/</code> works"),
    ("Composition tracked both directions", "<code># Composes</code> / <code># Composed into</code>",
     "the import graph, checkable by tooling", "yes", "and a lint could keep it honest"),
]

LAYERS = [
    ("components", 141, 30,
     "123 files, <b>0</b> tldraw and <b>0</b> React Flow imports. And in your own MOC the chrome "
     "parts — Toolbar, Title Bar, File Menu, Zoom Menu, Command Palette, Dev Menu, Library "
     "Panel, Inspector Panel — compose from only Button / Glyph / Toggle / EditableText / Flex "
     "/ Badge. A thin layer over six primitives is not a blob.", "good"),
    ("scene", 81, 17,
     "31 files, <b>0</b> React, <b>0</b> DOM. Four of the five apparent <code>document</code> hits "
     "are the word “document” in comments about the document <i>model</i>; the fifth is a "
     "parameter name. Genuinely pure — composition here is function composition.", "good"),
    ("editor", 127, 27,
     "No composition discipline. Every feature reaches into the same chrome files, so two agents "
     "adding two features collide on one file. <b>This is where a blob would form.</b>", "bad"),
    ("editor / app host", 84, 18, "Same problem, plus tldraw coupling.", "bad"),
    ("unclassified", 35, 8, "Needs a pass.", "warn"),
]

DP_COUNTS = [
    ("DP - Block", 62), ("DP - Port", 42), ("DP - Code Editor", 33), ("DP - Inspector Panel", 21),
    ("DP - Component", 13), ("DP - Trace", 11), ("DP - System", 11),
    ("DP - Contextual Popup Menu", 9), ("DP - Type Block", 8), ("DP - Glyph", 5),
    ("DP - EditableText", 5), ("DP - Title Bar", 5),
]

SB_STATE = [
    ("Stories that exist", "602", "across 129 component titles in 10 buckets", "have"),
    ("Story files with an executable <code>play()</code>", "129 / 129",
     "every single one. The demo already runs, and already passes.", "have"),
    ("Components carrying JSDoc prop docs", "54 / 77",
     "react-docgen extracts them automatically — the Controls panel below is showing real "
     "prose you wrote, with no docs system installed.", "have"),
    ("Top-level buckets", "10",
     "Basics 257 · Blocks 148 · Control Flow 62 · Trace 49 · Ports 42 · Styles "
     "15 · Interaction 9 · Hit Regions 8 · Presets 7 · Skin 5. Already close to "
     "your MOC's six taxonomy sections.", "have"),
    ("A one-line blurb per feature", "0", "the piece you actually asked for", "need"),
    ("A generated docs page per component", "0",
     "<code>autodocs</code> tag absent; <code>@storybook/addon-docs</code> not a direct dep", "need"),
    ("A recorded GIF per feature", "0",
     "but every <code>play()</code> is a recordable script already", "need"),
]

STOCK = [
    ("Feature discovery", "hand-written imports inside the chrome files",
     "<code>import.meta.glob</code> (Vite, <code>{eager:true}</code>)",
     "delete the folder → the feature is gone. No central list for two agents to fight over."),
    ("Manifest shape", "nothing — the shape lives in your head", "<code>zod</code> · <code>z.object</code>",
     "a malformed feature fails the build, not at runtime in front of you."),
    ("Prop-level description", "<b>already working</b> — JSDoc on the props interface",
     "<code>react-docgen-typescript</code> (the react-vite default)",
     "unchanged. 54 of 77 components already have it; the other 23 just need the comment."),
    ("Feature-level blurb", "nothing", "<code>meta.parameters.docs.description.component</code>",
     "one sentence per feature, sitting beside the code it describes."),
    ("The per-component docs page", "the vault MOC, via a generator you run by hand",
     "<code>tags: ['autodocs']</code> · <code>@storybook/addon-docs</code>",
     "one generated page per component — the layout you described, for one addon."),
    ("The short GIF", "nothing", "the existing <code>play()</code> · Playwright <code>recordVideo</code>",
     "<b>the demo IS the test.</b> A broken feature fails to record, so the documentation cannot "
     "quietly go stale. This is the whole anti-blob mechanism."),
    ("Family grouping", "already working — the story <code>title</code>",
     "Storybook <code>title: 'Ports/Labeled Port'</code>",
     "unchanged. Your ten buckets are already the sidebar."),
    ("Status (shipped / building / spec)", "a column you maintain by hand in the MOC",
     "<code>tags: ['status:building']</code> + a badge",
     "11 / 14 / 12 stays accurate because the tag lives on the story, not in a table."),
    ("<b>unchanged (stock seam)</b>", "<code>components/</code> and <code>scene/</code>",
     "— nothing added",
     "verified 0 engine imports, 0 DOM. These already compose; adding machinery here is a downgrade."),
]

CRITERIA = [
    ("Lets you NOT build most of them", 5,
     "468 items is a decade. The structure has to make “not yet” free rather than a debt "
     "that rots. Most plugin discussions skip this and it is the most important property."),
    ("The docs cannot drift from the code", 5,
     "Your actual fear, stated mechanically. A feature list maintained by hand beside a codebase "
     "<em>becomes</em> the legacy database you are describing. The only durable fix is to generate "
     "it from something the app itself reads."),
    ("A feature is one folder you can delete", 5,
     "The honest anti-blob test. If removing a feature means hunting six files, the structure "
     "failed no matter what it is called."),
    ("Doesn’t wreck the two layers that already work", 5,
     "Measured: components imports no canvas engine, scene is pure. That is what the bbox-ui "
     "refactor actually bought you. Protect it."),
    ("Survives parallel AI agents", 4,
     "How you build. The #1 collision this whole session has been two lanes editing one file. A "
     "central registry every feature must edit is a merge-conflict magnet — discovery has to "
     "be by convention."),
    ("No public API you must maintain forever", 4,
     "An extension API is a product in itself. Obsidian’s took years and a team. Your audience "
     "today is you, plus your own agents."),
    ("Zero-relearning", 3,
     "You are the only user. If it makes your own edits slower it loses, however clean in theory."),
]

OPTIONS = [
    {
        "id": "A", "title": "Feature folders", "rec": "half",
        "sub": "Your MOC’s “flat folder” rule, in code.",
        "svg": '<svg viewBox="0 0 400 190" class="dia">'
               '<rect x="14" y="12" width="170" height="76" rx="9" fill="var(--line)" fill-opacity=".5" stroke="var(--muted)"/>'
               '<text x="28" y="34" class="l">features/tidy-edges/</text>'
               '<text x="28" y="52" class="s">feature.ts — the manifest</text>'
               '<text x="28" y="68" class="s">scene.ts · editor.tsx</text>'
               '<text x="28" y="84" class="s">tidy-edges.stories.tsx</text>'
               '<rect x="216" y="12" width="170" height="76" rx="9" fill="var(--line)" fill-opacity=".5" stroke="var(--muted)"/>'
               '<text x="230" y="34" class="l">features/compare/</text>'
               '<text x="230" y="52" class="s">feature.ts</text><text x="230" y="68" class="s">editor.tsx</text>'
               '<text x="230" y="84" class="s">compare.stories.tsx</text>'
               '<rect x="14" y="112" width="372" height="56" rx="9" fill="var(--accent)" fill-opacity=".18" stroke="var(--accent)"/>'
               '<text x="28" y="136" class="l">import.meta.glob("features/*/feature.ts")</text>'
               '<text x="28" y="156" class="s">found at build time — no hand-edited registry</text></svg>',
        "how": "A feature is one directory. Nothing imports it by name; a build-time glob finds it. "
               "Deleting the directory deletes the feature, its docs entry and its story together.",
        "for": ["Literally your note system’s first rule, applied to code.",
                "No new runtime machinery whatsoever.",
                "One folder is one agent’s write set — the collision problem disappears."],
        "against": ["It organises files but does not say <em>how</em> a feature’s editor part "
                    "reaches the menu. Without a seam each one still reaches into the chrome.",
                    "On its own this is filing, not architecture."],
        "verdict": "Necessary, not sufficient. Take it — it needs B to be complete.",
    },
    {
        "id": "B", "title": "Manifest + generated views", "rec": "yes",
        "sub": "Your MOC’s “adding a view never moves a file”, in code.",
        "svg": '<svg viewBox="0 0 400 200" class="dia">'
               '<rect x="118" y="8" width="164" height="42" rx="9" fill="var(--accent)" fill-opacity=".22" stroke="var(--accent)"/>'
               '<text x="132" y="27" class="l">feature.ts manifest</text>'
               '<text x="132" y="43" class="s">name · blurb · page · story · contributes</text>'
               '<path d="M158 50 L70 86 M200 50 L200 86 M242 50 L330 86" stroke="var(--accent)" stroke-dasharray="3 3"/>'
               '<rect x="10" y="90" width="120" height="48" rx="8" fill="var(--yes)" fill-opacity=".14" stroke="var(--yes)"/>'
               '<text x="22" y="110" class="l">docs page</text><text x="22" y="127" class="s">GIF + blurb</text>'
               '<rect x="140" y="90" width="120" height="48" rx="8" fill="var(--yes)" fill-opacity=".14" stroke="var(--yes)"/>'
               '<text x="152" y="110" class="l">the app</text><text x="152" y="127" class="s">menu registration</text>'
               '<rect x="270" y="90" width="120" height="48" rx="8" fill="var(--yes)" fill-opacity=".14" stroke="var(--yes)"/>'
               '<text x="282" y="110" class="l">storybook</text><text x="282" y="127" class="s">the story + its test</text>'
               '<text x="28" y="170" class="s">one source, three consumers — the docs cannot drift,</text>'
               '<text x="28" y="188" class="s">because the app reads the file the docs are built from</text></svg>',
        "how": "Each feature declares what it is and what it contributes. The chrome renders whatever "
               "is registered and never names a feature. The docs page, the storybook entry and the "
               "menu registration become three <em>views</em> over the same manifests — exactly "
               "the three-MOCs-over-one-folder move from your notes.",
        "for": ["Kills the 127-item editor tangle at the root: adding a feature stops meaning "
                "editing the chrome.",
                "<b>This is also the answer to the GIF-and-description docs you asked for</b>, and "
                "the reason that page can never rot — it is generated from what the app reads.",
                "The seam list doubles as the roadmap: about nine seams, not 468 items.",
                "Compile-time and first-party, so no versioning burden."],
        "against": ["You must design the seams once, carefully; a wrong seam is worse than none.",
                    "A few features will not fit any seam — plan the escape hatch rather than "
                    "pretending otherwise. You already have the pattern: Detach to Primitive."],
        "verdict": "The piece that earns its keep — and only for the editor layer.",
    },
    {
        "id": "C", "title": "Full Obsidian-style plugin runtime", "rec": "no",
        "sub": "Installable, versioned, third-party.",
        "svg": '<svg viewBox="0 0 400 190" class="dia">'
               '<rect x="14" y="14" width="372" height="46" rx="9" fill="var(--no)" fill-opacity=".14" stroke="var(--no)"/>'
               '<text x="28" y="34" class="l">public API surface — versioned, forever</text>'
               '<text x="28" y="51" class="s">every seam becomes a compatibility promise</text>'
               '<rect x="14" y="78" width="110" height="38" rx="8" fill="var(--line)" fill-opacity=".5" stroke="var(--muted)"/>'
               '<text x="26" y="101" class="s">core</text>'
               '<rect x="144" y="78" width="110" height="38" rx="8" fill="var(--line)" fill-opacity=".5" stroke="var(--muted)"/>'
               '<text x="156" y="101" class="s">plugin A</text>'
               '<rect x="274" y="78" width="110" height="38" rx="8" fill="var(--line)" fill-opacity=".5" stroke="var(--muted)"/>'
               '<text x="286" y="101" class="s">plugin B</text>'
               '<text x="28" y="146" class="s">audience today: you, plus your own agents</text>'
               '<text x="28" y="166" class="s">Obsidian’s API took years and a team to stabilise</text></svg>',
        "how": "A real extension API: runtime enable/disable, semantic versioning, third parties ship "
               "against it.",
        "for": ["The end state if bbox-ui ever has outside users.",
                "Hard isolation — a plugin genuinely cannot reach into core."],
        "against": ["<strong>An API is a product.</strong> Every seam becomes a promise you cannot "
                    "change without breaking someone — and right now that someone is you, three "
                    "months from now, moving fast.",
                    "It buys isolation you can get from B at a fraction of the cost.",
                    "It optimises for an audience that does not exist."],
        "verdict": "Not now — but B is the honest first half of it. If outside users ever appear, "
                   "the manifests are what you would publish. Nothing here forecloses it.",
    },
    {
        "id": "D", "title": "No new abstraction — cut the list", "rec": "half",
        "sub": "The steelman for doing nothing structural.",
        "svg": '<svg viewBox="0 0 400 190" class="dia">'
               '<text x="20" y="46" class="big">468</text><text x="128" y="46" class="s">candidate features</text>'
               '<path d="M42 62 L42 98" stroke="var(--muted)" marker-end="url(#ar)"/>'
               '<text x="20" y="130" class="big" fill="var(--yes)">~40</text>'
               '<text x="128" y="130" class="s">the ones you would actually miss</text>'
               '<text x="20" y="168" class="s">build them in the structure you already have</text>'
               '<defs><marker id="ar" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">'
               '<path d="M0 0 L8 4 L0 8 z" fill="var(--muted)"/></marker></defs></svg>',
        "how": "Treat the backlog itself as the disease. Cut to what you would genuinely miss, build "
               "it in the current structure, move on.",
        "for": ["Fastest path to a good app, and right if most of the 468 are not actually wanted.",
                "Every abstraction you do not build is one you cannot get wrong.",
                "You voted 43 yes to 3 no but left 422 unread — the appetite may be far smaller "
                "than the list."],
        "against": ["You have said the opposite: you want to match the old app.",
                    "It dissolves the question rather than answering it. Honest to state, not enough "
                    "to choose on its own."],
        "verdict": "Keep as a discipline, not the plan. Its real contribution: the default answer to "
                   "a backlog item is no.",
    },
    {
        "id": "E", "title": "Mirror your note system", "rec": "yes",
        "sub": "The recommendation. A + B, scoped by the measurement, decided per DP page.",
        "svg": '<svg viewBox="0 0 400 210" class="dia">'
               '<rect x="14" y="8" width="372" height="46" rx="9" fill="var(--accent)" fill-opacity=".2" stroke="var(--accent)"/>'
               '<text x="28" y="28" class="l">editor — manifest + generated views</text>'
               '<text x="28" y="45" class="s">the ONLY layer that gets new machinery (127 items land here)</text>'
               '<rect x="14" y="66" width="372" height="42" rx="9" fill="var(--yes)" fill-opacity=".14" stroke="var(--yes)"/>'
               '<text x="28" y="84" class="l">scene — leave alone</text>'
               '<text x="28" y="100" class="s">pure already; composition is function composition</text>'
               '<rect x="14" y="120" width="372" height="42" rx="9" fill="var(--yes)" fill-opacity=".14" stroke="var(--yes)"/>'
               '<text x="28" y="138" class="l">components — leave alone</text>'
               '<text x="28" y="154" class="s">0 engine imports; chrome is a thin layer over 6 primitives</text>'
               '<text x="28" y="188" class="s">decide per DP page (37), not per item (468)</text></svg>',
        "how": "Three moves. <b>One:</b> the unit of decision is the <code>DP -</code> page, not the "
               "item — there are 37, and 272 of the 468 items already cite one. <b>Two:</b> a "
               "feature is a folder (A). <b>Three:</b> manifest plus generated views for the "
               "<em>editor only</em> (B), because that is the only layer the measurement says is "
               "tangled.",
        "for": ["Adds machinery exactly where it is needed and nowhere else.",
                "Turns 468 decisions into 37 — about twelve features per component page, which "
                "is a page you can sit down and read.",
                "Keeps the two verified-good layers untouched.",
                "Gives you the GIF-per-feature docs as a by-product, not a second job.",
                "Repo-per-family stays available when a family is genuinely its own product — "
                "which is what you already did with beautiful-bt and whiteboard-table."],
        "against": ["Requires designing the seam list once, carefully.",
                    "196 of the 468 items do not yet cite a DP page and need one assigned."],
        "verdict": "Recommended. It is your own proposal plus your own note system, with one "
                   "correction from the measurement: only the editor needs new machinery.",
    },
]

SEAMS = [
    ("tool", "a dock entry and its behaviour", "Block, Port, Region, Table, Glyph"),
    ("command", "an invocable action — palette + keyboard", "Tidy edges, Reset routing, Detach to primitive"),
    ("menuRow", "a row in the burger / right-click menu", "Go to definition, Wrap into…, Export"),
    ("pillCluster", "a group in the selection pill", "Arrange, appearance, opacity, Wrap"),
    ("inspectorSection", "a section in the right rail", "Ports, Members, Connections, Renderer"),
    ("settingsPage", "a category in Settings", "Canvas, Connections, Appearance, Hotkeys"),
    ("lintRule", "a check that produces a Problem", "type mismatch, polarity, unsatisfied input"),
    ("shapeKind", "a shape, its ShapeUtil and geometry", "block, port, wire, region, table"),
    ("styleProp", "a batched, undoable property", "state, view, colour"),
]


def option_html(o):
    fors = "".join(f"<li>{x}</li>" for x in o["for"])
    againsts = "".join(f"<li>{x}</li>" for x in o["against"])
    label, cls = {"yes": ("recommended", "b-yes"), "no": ("not now", "b-no"),
                  "half": ("partly", "b-half")}[o["rec"]]
    return f"""
<section class="opt {cls}" data-id="{o['id']}" data-title="{o['title']}">
  <div class="ohead"><span class="oid">{o['id']}</span>
    <div><h3>{o['title']}</h3><p class="osub">{o['sub']}</p></div>
    <span class="badge {cls}">{label}</span></div>
  <div class="obody"><div>{o['svg']}</div>
    <div class="otext"><p class="how">{o['how']}</p>
      <div class="two"><div><h4>For</h4><ul>{fors}</ul></div>
        <div><h4>Against</h4><ul>{againsts}</ul></div></div>
      <p class="verdict"><b>Verdict.</b> {o['verdict']}</p></div></div>
  <div class="vote"><button data-v="yes">▲ Do this</button>
    <button data-v="maybe">● Maybe</button><button data-v="no">▼ No</button>
    <textarea rows="1" placeholder="Notes on option {o['id']}…"></textarea></div>
</section>"""


def build():
    mirror_rows = "".join(
        f"<tr><td><b>{a}</b></td><td class='dim'>{b}</td><td>{c}</td>"
        f"<td class='{'g' if d == 'yes' else 'r'}'>{d}</td><td class='dim'>{e}</td></tr>"
        for a, b, c, d, e in MIRROR)
    layer_rows = "".join(
        f"<tr class='{cls}'><td><code>{n}</code></td><td class='num'>{c}</td>"
        f"<td class='num'>{p}%</td><td>{note}</td></tr>" for n, c, p, note, cls in LAYERS)
    dp_rows = "".join(
        f"<tr><td>{n}</td><td class='num'>{c}</td>"
        f"<td><div class='bar'><span style='width:{c / 62 * 100:.0f}%'></span></div></td></tr>"
        for n, c in DP_COUNTS)
    sb_rows = "".join(
        f"<tr class='{'good' if k == 'have' else 'warn'}'><td>{a}</td>"
        f"<td class='num'><b>{b}</b></td><td>{c}</td></tr>" for a, b, c, k in SB_STATE)
    stock_rows = "".join(
        f"<tr><td><b>{a}</b></td><td class='dim'>{b}</td><td>{c}</td><td>{d}</td></tr>"
        for a, b, c, d in STOCK)
    crit_rows = "".join(
        f"<tr><td>{n}</td><td class='num'>{'●' * w}{'○' * (5 - w)}</td><td>{why}</td></tr>"
        for n, w, why in CRITERIA)
    seam_rows = "".join(f"<tr><td><code>{k}</code></td><td>{d}</td><td class='dim'>{e}</td></tr>"
                        for k, d, e in SEAMS)
    opts = "".join(option_html(o) for o in OPTIONS)

    css = """
:root{--bg:#0f1013;--fg:#ececf0;--muted:#9a9aa6;--line:#26262e;--card:#16171b;
  --accent:#7d9bff;--yes:#4ac585;--no:#ff8a80;--warn:#e0b050}
@media(prefers-color-scheme:light){:root:not([data-theme="dark"]){--bg:#fbfbfd;--fg:#16161a;
  --muted:#6b6b76;--line:#e4e4ea;--card:#fff;--accent:#2f5bd8;--yes:#137a4b;--no:#b3261e;--warn:#8a5a00}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.62 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1080px;margin:0 auto;padding:44px 18px 130px}
h1{font-size:31px;margin:0 0 8px;letter-spacing:-.02em;line-height:1.18}
.sub{color:var(--muted);margin:0 0 26px}
h2{font-size:12.5px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);margin:46px 0 14px;font-weight:650}
.lede{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--accent);
  border-radius:0 12px 12px 0;padding:18px 20px;margin:0 0 12px;font-size:16.5px}
.lede b{color:var(--accent)}
blockquote{margin:14px 0;padding:11px 16px;border-left:3px solid var(--accent);color:var(--fg);
  background:color-mix(in srgb,var(--accent) 7%,transparent);border-radius:0 9px 9px 0;font-size:14.5px}
blockquote .who{display:block;color:var(--muted);font-size:12px;margin-top:7px;font-style:normal}
table{width:100%;border-collapse:collapse;font-size:14.5px;margin:6px 0 10px}
th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);
  padding:7px 10px;border-bottom:1px solid var(--line)}
td{padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
td.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--muted)}
td.dim{color:var(--muted);font-size:13px}
td.g{color:var(--yes);font-weight:600}td.r{color:var(--warn);font-weight:600}
tr.good td{background:color-mix(in srgb,var(--yes) 8%,transparent)}
tr.bad td{background:color-mix(in srgb,var(--no) 8%,transparent)}
tr.warn td{background:color-mix(in srgb,var(--warn) 7%,transparent)}
.bar{height:7px;background:var(--line);border-radius:99px;overflow:hidden;min-width:100px}
.bar span{display:block;height:100%;background:var(--accent);border-radius:99px}
code{font-family:ui-monospace,SFMono-Regular,monospace;font-size:.88em;
  background:color-mix(in srgb,var(--fg) 8%,transparent);padding:1.5px 5px;border-radius:4px}
figure{margin:0 0 16px}
figure img{width:100%;border:1px solid var(--line);border-radius:11px;display:block;cursor:zoom-in}
figcaption{color:var(--muted);font-size:12.5px;margin-top:7px}
.opt{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px;margin:0 0 16px}
.opt.b-yes{border-color:color-mix(in srgb,var(--yes) 55%,var(--line))}
.opt.b-no{opacity:.82}
.ohead{display:flex;gap:14px;align-items:flex-start;margin-bottom:14px}
.oid{flex:none;width:34px;height:34px;border-radius:9px;background:var(--accent);color:#fff;
  display:grid;place-items:center;font-weight:700;font-size:15px}
.ohead h3{margin:0;font-size:20px;letter-spacing:-.01em}
.osub{margin:2px 0 0;color:var(--muted);font-size:14px}
.badge{margin-left:auto;font-size:11px;text-transform:uppercase;letter-spacing:.07em;padding:4px 10px;
  border-radius:99px;border:1px solid var(--line);color:var(--muted);white-space:nowrap}
.badge.b-yes{color:var(--yes);border-color:var(--yes)}
.badge.b-no{color:var(--no);border-color:var(--no)}
.badge.b-half{color:var(--warn);border-color:var(--warn)}
.obody{display:grid;grid-template-columns:400px 1fr;gap:20px;align-items:start}
@media(max-width:900px){.obody{grid-template-columns:1fr}}
.dia{width:100%;height:auto;background:color-mix(in srgb,var(--fg) 4%,transparent);
  border:1px solid var(--line);border-radius:10px}
.dia .l{fill:var(--fg);font:600 13px ui-sans-serif}
.dia .s{fill:var(--muted);font:11.5px ui-sans-serif}
.dia .big{fill:var(--fg);font:700 30px ui-sans-serif}
.how{margin:0 0 12px;font-size:15px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:10px}
@media(max-width:700px){.two{grid-template-columns:1fr}}
.two h4{margin:0 0 5px;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}
.two ul{margin:0;padding-left:17px;font-size:13.5px}.two li{margin-bottom:5px}
.verdict{margin:8px 0 0;font-size:14.5px;padding:9px 13px;border-radius:8px;
  background:color-mix(in srgb,var(--accent) 9%,transparent)}
.vote{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:16px;padding-top:14px;
  border-top:1px dashed var(--line)}
.vote button{font:inherit;font-size:13px;font-weight:600;padding:7px 14px;border-radius:8px;
  border:1px solid var(--line);background:transparent;color:var(--fg);cursor:pointer}
.vote button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#fff}
.vote textarea{flex:1 1 220px;min-width:180px;font:inherit;font-size:13px;padding:7px 10px;
  border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--fg);resize:vertical}
pre.code{background:var(--card);border:1px solid var(--line);border-radius:11px;padding:15px 17px;
  overflow:auto;font-family:ui-monospace,monospace;font-size:12.8px;line-height:1.6;margin:10px 0}
pre.code .c{color:var(--muted)}pre.code .k{color:var(--accent)}pre.code .s2{color:var(--yes)}
.bar2{position:fixed;left:0;right:0;bottom:0;background:color-mix(in srgb,var(--bg) 94%,transparent);
  backdrop-filter:blur(10px);border-top:1px solid var(--line);padding:11px 16px;z-index:9}
.bar2 .inner{max-width:1080px;margin:0 auto;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.bar2 button{font:inherit;font-size:14px;font-weight:600;padding:9px 16px;border-radius:9px;border:0;
  background:var(--accent);color:#fff;cursor:pointer}
#out{width:100%;margin-top:10px;font-family:ui-monospace,monospace;font-size:12px;padding:10px;
  border-radius:9px;border:1px solid var(--line);background:var(--card);color:var(--fg);display:none}
#out.show{display:block}
#lb{position:fixed;inset:0;background:rgba(0,0,0,.93);display:none;place-items:center;z-index:99;cursor:zoom-out}
#lb.on{display:grid}#lb img{max-width:97vw;max-height:97vh;border-radius:8px}
"""

    js = """
function save(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function read(k){try{return localStorage.getItem(k)}catch(e){return null}}
document.querySelectorAll(".opt").forEach(function(o){
  var id=o.dataset.id,t=o.querySelector("textarea");
  var v=read("arch-"+id),n=read("arch-note-"+id);
  if(n)t.value=n; if(v)o.dataset.vote=v;
  o.querySelectorAll(".vote button").forEach(function(b){
    if(v===b.dataset.v)b.setAttribute("aria-pressed","true");
    b.addEventListener("click",function(){
      var now=o.dataset.vote===b.dataset.v?"":b.dataset.v; o.dataset.vote=now;
      o.querySelectorAll(".vote button").forEach(function(x){
        if(now&&x.dataset.v===now)x.setAttribute("aria-pressed","true");else x.removeAttribute("aria-pressed")});
      save("arch-"+id,now)})});
  t.addEventListener("input",function(){save("arch-note-"+id,t.value)})});
var lb=document.getElementById("lb"),lbi=lb.querySelector("img");
document.querySelectorAll("figure img").forEach(function(im){
  im.addEventListener("click",function(){lbi.src=im.src;lb.classList.add("on")})});
lb.addEventListener("click",function(){lb.classList.remove("on")});
addEventListener("keydown",function(e){if(e.key==="Escape")lb.classList.remove("on")});
document.getElementById("copy").addEventListener("click",function(){
  var L=["# Architecture \\u2014 my picks",""];
  document.querySelectorAll(".opt").forEach(function(o){
    var p=o.querySelector('.vote button[aria-pressed="true"]'),n=o.querySelector("textarea").value.trim();
    if(!p&&!n)return;
    L.push("**"+o.dataset.id+" \\u2014 "+o.dataset.title+"**: "+(p?p.textContent.trim():"(no pick)"));
    if(n)L.push("  note: "+n.replace(/\\n+/g," / ")); L.push("")});
  if(L.length===2)L.push("_(nothing marked yet)_");
  var out=document.getElementById("out");
  out.value=L.join("\\n");out.classList.add("show");out.focus();out.select();
  try{navigator.clipboard.writeText(out.value).catch(function(){})}catch(e){}});
"""

    manifest = """<span class="c">// features/tidy-edges/feature.ts — the whole contract</span>
<span class="k">export default</span> defineFeature({
  name:   <span class="s2">"Tidy edges"</span>,
  blurb:  <span class="s2">"Re-route every wire on the selection to orthogonal segments."</span>,
  page:   <span class="s2">"DP - Trace"</span>,          <span class="c">// which of your 37 pages it documents under</span>
  status: <span class="s2">"building"</span>,            <span class="c">// shipped | building | spec</span>
  story:  <span class="s2">"traces-tidy--demo"</span>,   <span class="c">// the story that IS the GIF and the test</span>
  contributes: {
    command: { id: <span class="s2">"tidy-edges"</span>, key: <span class="s2">"alt+t"</span>, run: tidyEdges },
    menuRow: { in: <span class="s2">"selection"</span>, when: hasWires },
  },
})"""

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Architecture — not another blob</title>
<style>{css}</style></head><body><div class="wrap">

<h1>How to hold 468 features without hand-rolling another blob</h1>
<p class="sub">bbox-ui · 21 Sep 2026 · the plugin-architecture question and the GIF-docs question turn out to be the same question</p>

<div class="lede">
<b>You already solved this once — in your notes.</b> <code>MOC - bbox-ui Components</code> is a
flat folder of 37 pages where membership is a <em>property</em> and every map is a generated view.
Mirror that in code rather than import Obsidian’s plugin runtime. And the per-feature
GIF-and-description page you described is not a second job: it is <b>the same artifact as the
registry the app reads</b>, which is the mechanical reason it can never rot.
</div>

<h2>Your own rule, quoted back</h2>
<blockquote>{MOC_QUOTE}<span class="who">— MOC - bbox-ui Components, the “One folder, many maps” callout. The page is marked <code>&lt;!-- catalogue:generated --&gt;</code> — you already generate it.</span></blockquote>
<p>Five properties. The code already has three of them:</p>
<table><thead><tr><th>Property of your note system</th><th>In the vault</th><th>Code equivalent</th><th>Already?</th><th>Evidence</th></tr></thead>
<tbody>{mirror_rows}</tbody></table>

<h2>Am I hand-rolling another blob? — measured, not assumed</h2>
<p>Before proposing structure I checked whether the layers really have the properties you credit
them with. Two of the three do. The third is the whole problem.</p>
<table><thead><tr><th>Layer</th><th class="num">Items</th><th class="num">Share</th><th>State</th></tr></thead>
<tbody>{layer_rows}</tbody></table>
<p><b>So: no, not in the components and not in the scene.</b> The refactor bought exactly what it
was meant to — that is a real and unusual result, and it is worth protecting. The risk is
concentrated in the one layer that never got a composition discipline.</p>

<h2>Storybook right now</h2>
<figure><img src="shots/sb-home.png" alt="bbox-ui storybook running on port 5421">
<figcaption>Running on :5421, dark. Three things worth noticing, all of which change the proposal.
<b>(1)</b> The <code>Interactions 7</code> tab — this story’s <code>play()</code> ran seven
steps and passed, so an executable demo already exists. <b>(2)</b> The Controls panel is showing
real prose you wrote (“The burger (leftmost icon). One <code>MenuSpec</code> of nested
groups/submenus…”), extracted from JSDoc automatically — with no docs system installed.
<b>(3)</b> The variant switcher is already in the toolbar. Click to enlarge.</figcaption></figure>
<figure><img src="shots/sb-story.png" alt="the Blocks/Bar Header Layouts story, seven labelled variants">
<figcaption><code>Blocks/Bar → Header Layouts</code>, cropped to the story itself — the unit
a GIF would be recorded from. Note what this already is: seven variants, each with a written
label (“w/ folding left”, “w/ Title Badge”, “w/ play button + text”). That is a feature
list with descriptions, authored by you, sitting one addon away from being the page you asked
for. Click to enlarge.</figcaption></figure>

<h2>The docs you asked for are nearly built already</h2>
<p>I expected to propose building this. Measuring it says otherwise — five of the eight pieces
exist, and the three that don’t are small.</p>
<table><thead><tr><th>Piece</th><th class="num">Count</th><th>Note</th></tr></thead>
<tbody>{sb_rows}</tbody></table>
<p>That is the whole gap: <b>a one-line blurb, an <code>autodocs</code> tag, and a recorder
pointed at a <code>play()</code> that already passes.</b> Not a documentation system.</p>

<h2>The reframe — 468 items is not 468 decisions</h2>
<p>The backlog is already organised by your taxonomy, because the evidence for each item came out
of your own component pages. <b>272 of the 468 cite a <code>DP -</code> page by name.</b> So the
unit of decision is the page — 37 of them, about twelve features each. That is something you
can sit down and read; 468 rows is not.</p>
<table><thead><tr><th>Component page</th><th class="num">Items</th><th></th></tr></thead>
<tbody>{dp_rows}</tbody></table>
<p class="sub" style="font-size:13.5px">Top 12 of 37 shown. The other 196 items cite no page yet and need one assigned — real work, and the first thing worth doing.</p>

<h2>What good looks like, before the options</h2>
<table><thead><tr><th>Criterion</th><th class="num">Weight</th><th>Why it matters here</th></tr></thead>
<tbody>{crit_rows}</tbody></table>

<h2>Five ways to do it</h2>
{opts}

<h2>What the manifest would actually look like</h2>
<p>One file per feature, small on purpose — if it grows past this it has become a config
language, which is the failure mode.</p>
<pre class="code">{manifest}</pre>
<p>Three things read it: the docs page renders <code>blurb</code> beside a GIF recorded from
<code>story</code>; the app registers <code>contributes</code>; storybook runs <code>story</code>
as a test. Delete the folder and all three disappear together.</p>

<h2>Nothing here is hand-rolled — the stock parts</h2>
<p>Off-the-shelf first. Every element below is an existing library part, named exactly, and four of
the nine rows are things you already have.</p>
<table><thead><tr><th>Element</th><th>Today</th><th>Off-the-shelf part</th><th>Behaviour that must survive</th></tr></thead>
<tbody>{stock_rows}</tbody></table>
<p>The row that answers your worry is the GIF one. <b>If the demo is the test, the documentation
cannot drift from the code</b> — a broken feature fails to record. That is the mechanical
version of “don’t let it become a legacy database”, and it is nearly free, because all
129 story files already have a passing <code>play()</code>.</p>

<h2>If you take E: the seam list</h2>
<p>The entire design surface of the editor layer — nine seams instead of 468 items. Getting
these names right once is the real work; everything after is filling them in.</p>
<table><thead><tr><th>Seam</th><th>What it is</th><th>Examples from your backlog</th></tr></thead>
<tbody>{seam_rows}</tbody></table>

<h2>Two things worth saying plainly</h2>
<p><b>A plugin API is a product.</b> Obsidian’s took years and a team, and every seam in it is a
promise they cannot break. Option B gives the isolation without the promise, and it is the honest
first half of C — if outside users ever appear, the manifests are what you would publish.</p>
<p><b>The default answer to a backlog item is no.</b> You voted 43 yes to 3 no but left 422 unread,
so the real ratio is unknown and the architecture should assume most are never built. That is what
criterion 1 protects: “not yet” has to stay free, forever, at no carrying cost.</p>

</div>
<div id="lb"><img alt=""></div>
<div class="bar2"><div class="inner">
  <button id="copy">Copy my picks</button>
  <span style="color:var(--muted);font-size:13px">Pick per option, add notes, copy — then I’ll write the seam design for whichever you choose.</span>
  <textarea id="out" rows="8" readonly></textarea>
</div></div>
<script>{js}</script></body></html>
"""


if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(build(), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size:,} bytes)")
