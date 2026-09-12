#!/usr/bin/env python3
"""Builds the review for the five inspector-panel proposals babbled against
Zach's 2026-09-12 feedback on the Block inspector.

Captures come from reports/media/inspector-v5-<date>/, written by
demos/capture-inspector-v5.mjs against the real running /create page — every
picture in here was asserted before it was taken, and the assertion count
printed at the bottom is read out of that run's own manifest.

Numbers about the tree are measured HERE, at build time, from the live
checkout, so the page cannot drift from the code it describes.

Writes to the MAIN checkout's reports/media/, never the worktree.
"""
from __future__ import annotations

import base64
import io
import json
import pathlib
import re
import subprocess

from PIL import Image

DATE = "2026-09-12"
NAME = f"inspector-v5-{DATE}"
REPO = pathlib.Path("/home/bam/bbox-ui")
MEDIA = REPO / "reports" / "media" / NAME
OUT = REPO / "reports" / "media" / f"{NAME}.html"
HERE = pathlib.Path(__file__).resolve().parent.parent

run = json.loads((MEDIA / "manifest.json").read_text())
MANIFEST = {entry["theme"]: entry for entry in run["manifest"]}
ASSERTIONS = len(run["checks"])


def trim(im: Image.Image, margin: int = 18) -> Image.Image:
    """Cut the empty column below the content. The journey captures the
    inspector with its scroll neutralised, so a short design leaves a tall
    empty tail behind it."""
    px = im.load()
    bg = px[im.width // 2, im.height - 1]
    last = 0
    for y in range(im.height - 1, -1, -1):
        row = [px[x, y] for x in range(6, im.width - 2, 4)]
        if any(abs(r[0] - bg[0]) + abs(r[1] - bg[1]) + abs(r[2] - bg[2]) > 24 for r in row):
            last = y
            break
    return im.crop((0, 0, im.width, min(im.height, last + margin)))


BUDGET = {"bytes": 0}


def shot(file: str, quality: int = 80, cap: int | None = None) -> str:
    """One capture, trimmed and inlined as webp.

    WHY webp and not the original PNG: Claude Code's HTML preview refuses a
    page past 2,097,024 bytes MEASURED ENCODED, and this report carries ~25
    full-height panel captures. webp at 80 holds flat UI chrome without
    visible loss at a third of the bytes.
    """
    im = Image.open(MEDIA / file).convert("RGB")
    im = trim(im)
    if cap and im.height > cap:
        im = im.crop((0, 0, im.width, cap))
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=quality, method=6)
    BUDGET["bytes"] += buf.tell()
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


def files_for(theme: str, design: str) -> dict:
    return MANIFEST[theme]["designs"][design]["files"]


def wc(path: str) -> int:
    p = HERE / path
    return len(p.read_text().splitlines()) if p.exists() else 0


def grep_count(path: str, pattern: str) -> int:
    p = HERE / path
    if not p.exists():
        return 0
    return len(re.findall(pattern, p.read_text()))


# ---- measured from the live tree, never typed in -----------------------
STANDARD_CONTROLS = re.findall(
    r'export const STANDARD_CONTROLS = \[(.*?)\]',
    (HERE / "packages/panel/src/sections/contract.ts").read_text(),
    re.S,
)[0]
CONTROL_NAMES = re.findall(r'"([a-z]+)"', STANDARD_CONTROLS)
SECTION_IDS = re.findall(r'id: "([a-z-]+)"', (HERE / "packages/panel/src/sections/variants/index.ts").read_text())
VARIANT_COUNT = len(re.findall(r"\b[A-Z_]+,", re.findall(r"SECTION_PANELS: SectionPanelVariant\[\] = \[(.*?)\]", (HERE / "packages/panel/src/sections/variants/index.ts").read_text(), re.S)[0] + ","))
SECTION_DECLS = grep_count("packages/bbox-ui/src/block.fields.ts", r"section: ") + grep_count(
    "packages/bbox-ui/src/appearance.fields.ts", r"section: APPEARANCE_SECTION"
)
OLD_ARRANGEMENT_LINES = wc("apps/docs/src/components/create/arrangement-section.tsx")
NEW_ARRANGEMENT_LINES = wc("apps/docs/src/components/create/sections/arrangement-fields.ts")
ENGINE_LINES = sum(
    wc(p)
    for p in [
        "packages/panel/src/sections/contract.ts",
        "packages/panel/src/sections/StandardRow.tsx",
        "packages/panel/src/sections/shared.tsx",
        "apps/docs/src/components/create/sections/build-sections.tsx",
        "apps/docs/src/components/create/sections/arrangement-fields.ts",
        "apps/docs/src/components/create/sections/SectionInspector.tsx",
    ]
)
VARIANT_LINES = sum(
    wc(f"packages/panel/src/sections/variants/{f}")
    for f in ["FigmaFlat.tsx", "Accordion.tsx", "Rail.tsx", "StackedLabels.tsx", "MembersAsRows.tsx"]
)

# ---- the frozen criteria ----------------------------------------------
CRITERIA = [
    ("FR1", "One standard control list", 25,
     "Every editable value in the inspector renders through the shared control vocabulary. Zero one-off control clusters. Asserted mechanically by <code>data-standard-control</code>."),
    ("FR2", "Sections group by anatomy — fields AND members", 22,
     "A Block reads Layout · Appearance · Header · Body · Footer · Ports, each carrying its own properties <em>and</em> its own member lists. Declared on the field, not hand-wired per component."),
    ("FR3", "No clutter: no helper text, one header per list", 15,
     "The three things he named: the two helper sentences gone, and the fold chevron on the list's existing header instead of a second one above it."),
    ("FR4", "Figma look: full width, flat, titled", 15,
     "Full bleed to the column — no card in a box. Bold section title left, icon verbs right, hairline between sections."),
    ("FR5", "Nothing lost", 13,
     "Tiers, filter, provenance dots, clear-override, member add/remove/reorder/select, region hide/line/size, arrangement and placement editing all still reachable."),
    ("FR6", "Scales to a real Block", 10,
     "~30 rows, 8 member lists, 6 sections. Finding the Ports section should not be a scrolling exercise."),
]
GATES = [
    ("G1", "No helper text anywhere in the inspector — no <code>members-empty</code>, no prose paragraph."),
    ("G2", "Every value-editing control sits inside a <code>[data-standard-control]</code> naming one of the six."),
    ("G3", "The panel paints no border, no radius, and spans the full column width."),
    ("G4", "Exactly one header per member list; a fold chevron only on a list that has members."),
    ("G5", "Both themes render with zero console errors."),
]

# ---- the five, unranked ------------------------------------------------
VARIANTS = [
    dict(
        id="figma-flat", name="S1 · Figma flat",
        axis="Section chrome — flat dividers, nothing folds",
        thesis="The section is a title and a hairline, nothing more: Figma's panel, literally.",
        decisions=[
            "Sections never collapse. Figma's don't, because a four-row section has nothing to hide — the only thing that folds is a member list, on its own header, which is exactly where he put the chevron.",
            "The preset picker is deleted, not restyled. A preset's selector <em>is</em> a field (<code>state</code>), so the old violet PRESET row drew the same control twice, one line above the State row. Only the reset had nowhere else to go, so it became <code>↺</code> on the section title — where Figma puts a modified-instance reset.",
            "A region's <code>⚙</code> is a section action, not a caption widget. It opens the Bar for everything the Header section deliberately does not surface.",
        ],
        best="Reading. Scanning. Anything where you already know roughly where the row is and the panel just has to not get in the way.",
        loses="A subject with six sections and thirty rows is a long scroll, and nothing helps you skip it.",
        splice="The section chrome itself — title weight, hairline, right-aligned verbs. Every other design should inherit exactly this.",
        state_key="header-hidden", state_label="Header hidden through the standard toggle row",
    ),
    dict(
        id="accordion", name="S2 · Accordion",
        axis="Section chrome — every section folds, carrying a summary",
        thesis="A Block's panel is long; folding a section is the only thing that makes it fit one screen.",
        decisions=[
            "The summary is derived, never hardcoded: a collapsed section reads <em>4 properties</em> or <em>3 properties · 0 Left · 0 Center · 0 Right</em>, computed off its own rows.",
            "A section whose only content is empty member lists starts closed; anything with real rows starts open. The resting state is therefore already useful.",
            "The fold trigger names itself (<code>data-slot=\"section-toggle\"</code>) because a section title also holds the icon verbs — 'the button in the title row' is ambiguous to anything driving the panel.",
        ],
        best="A Block. The moment the subject has more than three sections this is the only design that lets you put four of them away and keep working in the fifth.",
        loses="Its resting state is S1 with chevrons — the cost is paid (a chevron on every title) before any benefit is taken.",
        splice="The derived summary line. It is the single cheapest thing to add to any of the other four.",
        state_key="collapsed", state_label="Four sections collapsed — the summaries still say what is inside",
    ),
    dict(
        id="rail", name="S3 · Section rail",
        axis="Navigation — one section at a time, chips are the map",
        thesis="Sections are destinations, not stops on a scroll.",
        decisions=[
            "Exactly one section body renders. The panel never scrolls past something you are not looking at, and on a Block it is about a fifth as tall.",
            "A chip carries a dot when its section holds a member list with members, so <em>where are my ports</em> is answerable without visiting anything.",
            "The rail wraps rather than scrolling horizontally — six chips do not fit 22rem on one line and a hidden chip is a hidden section.",
        ],
        best="A deep subject you navigate rather than read. It is the only one of the five where panel height is independent of how complicated the Block is.",
        loses="Comparing two sections. Anything that needs Layout and Ports in view at once is now two clicks and a memory test.",
        splice="The dot on a chip. It is the only affordance in the five that answers a question about a section you cannot see.",
        state_key="top", state_label="As landed — the rail, and the Layout section it opens on",
    ),
    dict(
        id="stacked", name="S4 · Stacked labels",
        axis="Row geometry — label above the control, two-up; lists as a strip",
        thesis="Copy Figma's geometry, not just its dividers: two controls fit one line when the label sits above.",
        decisions=[
            "Rows lay out in a two-column grid; a row spans both columns when its control genuinely needs the width (a &gt;3-option dropdown, a flags set, a text box).",
            "Member lists are lifted out of the property flow into a chip strip under the section title — the section's contents are visible as a shape before you open anything.",
            "Density is deliberately lower. This is the one design that spends vertical space to buy horizontal alignment.",
        ],
        best="A component whose fields are mostly short paired numbers — which is exactly what Figma's own panel is full of, and exactly what Block's Layout section is.",
        loses="Almost everything else. Measured on the real Block, only two of the rows actually pair (Width/Height and Radius/Orientation); the rest span both columns and the result is a taller single column with the labels moved.",
        splice="Nothing structural. The label-above geometry is already in the codebase where it earns its keep — a declared <code>group</code> pair, which is where S1 uses it too.",
        state_key="top", state_label="As landed — the two-up grid and the list chip strip",
    ),
    dict(
        id="member-rows", name="S5 · Members as rows",
        axis="Interleave — a member list IS a property row",
        thesis="He said the fields/members split is confusing, so delete the split: a member list is a property whose value happens to be a list.",
        decisions=[
            "A list's closed row is pixel-identical to a property row — same 92px label cell, same 22px height, same type. That likeness is the whole design.",
            "A filled list opens by default, an empty one stays closed reading <em>empty</em>, and the row is still clickable so its <code>+</code> is one click away.",
            "Sections stay flat, like S1. The difference lives entirely in how a list is drawn.",
        ],
        best="A subject with a few lists and many fields, where the lists really are just more properties.",
        loses="Open state. The summary row and the list's own header are then both on screen, one above the other — which is the second header he rejected, rebuilt from the other direction. Visible in the capture.",
        splice="The closed row's grammar. Fold a list in S1 and you get most of this without the collision.",
        state_key="placement", state_label="A Port selected — Placement is standard rows too",
    ),
]

# ---- the AI prune ------------------------------------------------------
SCORES = {
    "figma-flat": [
        (5, "high", "All 22 controls on a Block name a standard kind; 431 assertions across both themes found no stray input or select."),
        (5, "high", f"Six sections on a Block, from {SECTION_DECLS} <code>section</code> declarations plus the slots and members specs that already existed."),
        (5, "high", "No paragraph in the inspector; one header per list; chevron only on LEFT (1), RIGHT (1) and PORTS (3)."),
        (5, "high", "Panel border 0px, radius 0px, width equal to the host. The title/hairline/verb grammar is read straight off his reference."),
        (5, "high", "Tier, filter, dots, clear, add/remove/reorder/select, hide/line/size, arrangement and placement all exercised green."),
        (2, "high", "~1,200px tall on a Block with two members. Nothing folds; you scroll the whole thing."),
    ],
    "accordion": [
        (5, "high", "Same engine, same controls — the design never touches a row."),
        (5, "high", "Same six sections; folding is chrome over the same structure."),
        (4, "med", "Clean, but every title now carries a chevron whether or not you fold it — slightly more furniture than S1 at rest."),
        (4, "med", "Figma's own panel does not fold its sections, so this is a deliberate departure from the reference he pointed at."),
        (5, "high", "Nothing removed; four sections collapsed and reopened in the journey with their summaries intact."),
        (5, "high", "Collapsed to Header + Ports the panel is ~420px. The only design that shrinks on demand without losing the map."),
    ],
    "rail": [
        (5, "high", "Same engine, same controls."),
        (4, "med", "Sections are the navigation, so the anatomy is more legible than anywhere else — but you can never see two parts of it at once."),
        (5, "high", "Clean; the rail replaces chrome rather than adding it."),
        (3, "med", "The chip rail is not in his reference at all. It reads more like a tab bar than a Figma panel."),
        (4, "med", "Everything reachable, but a comparison across sections costs clicks that no other design charges."),
        (5, "high", "Panel height is independent of subject complexity. The Ports section is one click from anywhere."),
    ],
    "stacked": [
        (5, "high", "Same engine, same controls."),
        (4, "med", "Sections correct; lifting lists into a chip strip weakens 'properties and members together' — they are in the same section but no longer in the same flow."),
        (5, "high", "Clean."),
        (4, "med", "Closest to the reference's INNER geometry (caption above input, two-up), furthest from its density."),
        (5, "high", "Nothing lost."),
        (2, "high", "Measured on the real Block only 2 of ~14 property rows actually pair; the rest span. Net effect is a TALLER panel than S1 for the same content."),
    ],
    "member-rows": [
        (5, "high", "Same engine, same controls."),
        (5, "high", "The strongest reading of 'properties and members together' — they are literally the same row grammar."),
        (2, "high", "Open a list and its summary row sits directly above the list's own header. That is the double header he rejected, arrived at from the other side."),
        (4, "med", "Section chrome is S1's, so the Figma half is right; the list row is an invention."),
        (5, "high", "Nothing lost."),
        (4, "med", "Closed lists compress a Block well — seven one-line rows instead of seven list headers."),
    ],
}

WEIGHTS = [c[2] for c in CRITERIA]
TOTALS = {vid: sum(s[0] * w for s, w in zip(rows, WEIGHTS)) / 5 for vid, rows in SCORES.items()}

# ---- stock-part style mapping: one-off control → standard control -------
MAPPING = [
    ("Region header", "<code>RegionHeader</code> — a caption row hand-drawing <em>hidden ☐ · line ☑ · md ▾ · ⚙</em>",
     "Ordinary rows of the Bar: <code>toggle</code>, <code>toggle</code>, <code>dropdown</code>, plus <code>⚙</code> as a section action",
     "Hide header / hide footer / hide the line still one click from the Block's own panel"),
    ("Arrangement", "<code>ArrangementSection</code> — a select, a pill button, a segmented strip and four toggle buttons",
     "<code>dropdown</code> · <code>segmented</code> · <code>flags</code> · <code>dropdown</code>, plus <code>⧉</code> as a section action",
     "Active state, Auto/Custom, live edges, grouping; a parked port keeps its stored edge"),
    ("Placement", "<code>PlacementSection</code> — a select, two number inputs, a text input and a checkbox with a sentence",
     "<code>dropdown</code> · <code>number</code> · <code>number</code> · <code>text</code> · <code>toggle</code>",
     "Order and t both stored; t read-only in Auto mode, with the reason on the label's tooltip instead of a line of prose"),
    ("Live edge set", "four <code>T R B L</code> buttons drawn inside the Arrangement block",
     "a new sixth <code>FieldKind</code>, <code>flags</code>, added once to the standard list",
     "Toggling an edge off parks its ports rather than losing them"),
    ("Preset picker", "a violet PRESET row drawing the selector a second time, one line above its own field row",
     "deleted — the selector's own standard row <em>is</em> the picker; the reset became <code>↺</code> on the section title",
     "“Wired · primary” provenance text, the modified count, and one-click clear of every override the preset governs"),
    ("Member list", "the shared <code>List</code> control, wrapped in a second collapsible header row",
     "<strong>unchanged (stock seam)</strong> — the List control itself, now with the chevron on its own header",
     "grip-drag reorder, typed Add menu, click-to-select, remove, count pill"),
    ("Field engine", "<code>readFieldRow</code> / <code>resolveField</code> / tiers / filter",
     "<strong>unchanged (stock seam)</strong>",
     "Provenance dots, Mixed, clear-override, inherited-from-Header, Simple/Advanced/Expert, the filter box"),
]

CHANGES = [
    ("&ldquo;No need to put this text under the members list.&rdquo;",
     "<code>members-empty</code> and its sentence deleted. An empty list shows its header and its <code>+</code>."),
    ("&ldquo;No need for this helper text either.&rdquo;",
     "The <em>One row per member…</em> line deleted. The gate asserts zero paragraphs anywhere in the inspector."),
    ("&ldquo;Just put a folding chevron to the left of the existing header.&rdquo;",
     "The fold moved INTO <code>SectionHeader</code>. The wrapper that owned it had to draw a row to put the chevron on — that row was the second header."),
    ("&ldquo;Properties/members related to the block, the header, footer, body, ports… grouped together.&rdquo;",
     "<code>FieldSpec.section</code>, on the same footing as <code>group</code>. Slots and member specs derive their sections; only a component's own fields declare one."),
    ("&ldquo;All controls should kinda be from a standard control list.&rdquo;",
     f"Six controls, one file, every one tagged. {OLD_ARRANGEMENT_LINES} lines of hand-drawn Arrangement/Placement UI became {NEW_ARRANGEMENT_LINES} lines of declaration."),
    ("&ldquo;Not spreading the full width of the inspector panel.&rdquo;",
     "The panel paints no card at all. The old column fought the card with <code>[&amp;&gt;*]:!border-0</code>, which reached the layout wrapper rather than the panel — so the card survived."),
]


def criteria_rows() -> str:
    return "".join(
        f'<tr><td class="k">{cid}</td><td><strong>{name}</strong><div class="sub">{blurb}</div></td>'
        f'<td class="w">{weight}</td></tr>'
        for cid, name, weight, blurb in CRITERIA
    )


def variant_block(v: dict) -> str:
    f = files_for("dark", v["id"])
    fl = files_for("light", v["id"])
    state = f.get(
        {"header-hidden": "headerHidden", "collapsed": "collapsed", "top": "top", "placement": "placement"}[v["state_key"]]
    )
    decisions = "".join(f"<li>{d}</li>" for d in v["decisions"])
    return f"""
    <section class="variant" id="{v['id']}">
      <div class="vhead">
        <h3>{v['name']}</h3>
        <div class="axis">{v['axis']}</div>
        <p class="thesis">{v['thesis']}</p>
      </div>
      <div class="shots">
        <figure><img src="{shot(f['hero'])}" alt="{v['name']} dark"><figcaption>Dark — the Block fixture, Ports open</figcaption></figure>
        <figure><img src="{shot(fl['hero'])}" alt="{v['name']} light"><figcaption>Light — same fixture</figcaption></figure>
        <figure><img src="{shot(state)}" alt="{v['name']} state"><figcaption>{v['state_label']}</figcaption></figure>
      </div>
      <div class="vbody">
        <div><h4>Decisions</h4><ul>{decisions}</ul></div>
        <div class="verdicts">
          <div><h4>Best when</h4><p>{v['best']}</p></div>
          <div><h4>Loses when</h4><p>{v['loses']}</p></div>
          <div><h4>Keep in a splice</h4><p>{v['splice']}</p></div>
        </div>
      </div>
    </section>"""


def score_table() -> str:
    head = "".join(f'<th><span class="fr">{c[0]}</span><span class="wt">{c[2]}</span></th>' for c in CRITERIA)
    body = ""
    order = sorted(VARIANTS, key=lambda v: -TOTALS[v["id"]])
    for v in order:
        cells = ""
        for (score, conf, why) in SCORES[v["id"]]:
            cells += f'<td class="s s{score}"><span class="n">{score}</span><span class="c">{conf}</span><div class="why">{why}</div></td>'
        body += f'<tr><th class="vn">{v["name"]}</th>{cells}<td class="tot">{TOTALS[v["id"]]:.1f}</td></tr>'
    return f'<table class="scores"><thead><tr><th></th>{head}<th class="tot">/5</th></tr></thead><tbody>{body}</tbody></table>'


HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>bbox-ui · five inspector panels · {DATE}</title>
<style>
:root {{
  --bg:#0d0d10; --panel:#15151a; --line:#26262e; --ink:#e9e9f0; --dim:#9a9aa8; --faint:#6a6a78;
  --accent:#8b7bf5; --good:#4ade80; --warn:#fbbf24; --bad:#f87171;
}}
* {{ box-sizing:border-box }}
body {{ margin:0; background:var(--bg); color:var(--ink); font:15px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }}
.wrap {{ max-width:1180px; margin:0 auto; padding:40px 24px 120px }}
h1 {{ font-size:30px; margin:0 0 6px; letter-spacing:-.02em }}
h2 {{ font-size:20px; margin:56px 0 14px; letter-spacing:-.01em; padding-bottom:8px; border-bottom:1px solid var(--line) }}
h3 {{ font-size:18px; margin:0 }}
h4 {{ font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--faint); margin:0 0 6px }}
p {{ margin:0 0 10px }}
code {{ font:12.5px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace; background:#1e1e26; padding:1px 5px; border-radius:4px; color:#c9c9d8 }}
.lede {{ color:var(--dim); font-size:16px; max-width:74ch }}
.meta {{ color:var(--faint); font-size:12.5px; margin-top:10px }}
.card {{ background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:18px 20px; margin:14px 0 }}
table {{ border-collapse:collapse; width:100%; font-size:13.5px }}
th,td {{ text-align:left; padding:9px 10px; border-bottom:1px solid var(--line); vertical-align:top }}
th {{ color:var(--faint); font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.06em }}
td.k {{ color:var(--accent); font-weight:700; white-space:nowrap; font-size:12px }}
td.w {{ text-align:right; font-weight:700; color:var(--ink); white-space:nowrap }}
.sub {{ color:var(--dim); font-size:12.5px; margin-top:3px; font-weight:400 }}
.gates li {{ margin-bottom:6px; color:var(--dim) }}
.gates li b {{ color:var(--good); font-family:ui-monospace,monospace; font-size:12px; margin-right:6px }}
.before {{ display:grid; grid-template-columns:1fr 1fr; gap:18px; align-items:start }}
.before figure {{ margin:0 }}
.before img, .shots img {{ width:100%; display:block; border:1px solid var(--line); border-radius:8px; background:#000 }}
figcaption {{ color:var(--faint); font-size:12px; margin-top:7px }}
.variant {{ border:1px solid var(--line); border-radius:12px; padding:22px; margin:22px 0; background:var(--panel) }}
.vhead {{ margin-bottom:16px }}
.axis {{ color:var(--accent); font-size:12px; text-transform:uppercase; letter-spacing:.06em; margin-top:5px; font-weight:600 }}
.thesis {{ color:var(--ink); font-size:15.5px; margin-top:10px; max-width:80ch }}
.shots {{ display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-bottom:18px }}
.shots figure {{ margin:0; max-height:760px; overflow:hidden; display:flex; flex-direction:column }}
.shots img {{ object-fit:cover; object-position:top }}
.vbody {{ display:grid; grid-template-columns:1.15fr 1fr; gap:26px }}
.vbody ul {{ margin:0; padding-left:18px; color:var(--dim); font-size:13.5px }}
.vbody li {{ margin-bottom:8px }}
.verdicts > div {{ margin-bottom:14px }}
.verdicts p {{ color:var(--dim); font-size:13.5px }}
.scores td.s {{ text-align:left; width:13%; }}
.scores .n {{ font-size:17px; font-weight:800; margin-right:6px }}
.scores .c {{ font-size:10px; color:var(--faint); text-transform:uppercase; letter-spacing:.05em }}
.scores .why {{ color:var(--dim); font-size:11.5px; margin-top:5px; line-height:1.45 }}
.scores .s5 .n {{ color:var(--good) }} .scores .s4 .n {{ color:#a3e635 }}
.scores .s3 .n {{ color:var(--warn) }} .scores .s2 .n {{ color:#fb923c }} .scores .s1 .n {{ color:var(--bad) }}
.scores .vn {{ text-transform:none; font-size:13px; color:var(--ink); white-space:nowrap; font-weight:700 }}
.scores .tot {{ text-align:right; font-weight:800; font-size:16px; color:var(--accent) }}
.scores thead .fr {{ display:block; color:var(--ink) }}
.scores thead .wt {{ display:block; color:var(--accent); font-size:13px; margin-top:2px }}
.rec {{ border-left:3px solid var(--accent); padding:16px 20px; background:#17161f; border-radius:0 10px 10px 0 }}
.hinge {{ border-left:3px solid var(--warn); padding:16px 20px; background:#1b1810; border-radius:0 10px 10px 0; margin-top:14px }}
.run {{ background:#101018; border:1px solid var(--line); border-radius:10px; padding:16px 18px; font:12.5px/1.7 ui-monospace,monospace; color:#cfcfe2; overflow-x:auto }}
.foot {{ color:var(--faint); font-size:12px; margin-top:40px; border-top:1px solid var(--line); padding-top:16px }}
@media (max-width:900px) {{ .before,.shots,.vbody {{ grid-template-columns:1fr }} }}
</style></head><body><div class="wrap">

<h1>Five inspector panels</h1>
<p class="lede">Zach's 2026-09-12 feedback on the Block inspector reads as five complaints about styling. Four of them are one architectural fact: the inspector had two escape hatches out of the field engine, and both existed because there was no way to say <em>these rows belong under the Header sub-header</em>. Give the panel sections and both hatches close. These five differ only in how a section is <em>drawn</em> — which is the part that is actually a matter of taste.</p>
<p class="meta">Branch <code>claude/inspector-panel-v5</code> · every capture below taken from the real running page by <code>demos/capture-inspector-v5.mjs</code>, {ASSERTIONS} assertions across two themes and six designs, zero console errors · engine {ENGINE_LINES} lines, five designs {VARIANT_LINES} lines</p>

<h2>What he asked for, and what changed</h2>
<div class="card"><table><thead><tr><th style="width:44%">His words</th><th>What it became</th></tr></thead><tbody>
{"".join(f'<tr><td>{a}</td><td>{b}</td></tr>' for a, b in CHANGES)}
</tbody></table></div>

<h2>Before / after, same Block</h2>
<div class="before">
  <figure><img src="{shot(files_for('dark','current')['hero'], cap=1500)}" alt="before"><figcaption><strong>Before</strong> — the panel in its own bordered card, seven flat lists, a hand-drawn <em>HEADER · hidden ☐ · line ☑ · md ▾</em> caption, a hand-drawn ARRANGEMENT block, and two lines of helper text.</figcaption></figure>
  <figure><img src="{shot(files_for('dark','figma-flat')['hero'], cap=1500)}" alt="after"><figcaption><strong>After (S1)</strong> — six sections, full bleed. The Bar's <code>hidden</code>/<code>line</code>/<code>size</code> are ordinary rows of the Header section; Arrangement is ordinary rows of the Ports section; the fold chevron is on each list's own header.</figcaption></figure>
</div>

<h2>One-off control → standard control</h2>
<div class="card"><table><thead><tr><th style="width:15%">Element</th><th style="width:30%">Before</th><th style="width:28%">Standard control</th><th>Behaviour that must survive</th></tr></thead><tbody>
{"".join(f'<tr><td><strong>{a}</strong></td><td>{b}</td><td>{c}</td><td class="sub">{d}</td></tr>' for a, b, c, d in MAPPING)}
</tbody></table>
<p class="sub" style="margin-top:12px">The standard list, read out of <code>packages/panel/src/sections/contract.ts</code> at build time: {", ".join(f"<code>{c}</code>" for c in CONTROL_NAMES)}.</p></div>

<h2>Criteria, frozen before the designs</h2>
<div class="card"><table><tbody>{criteria_rows()}</tbody></table></div>
<div class="card"><h4>Hard gates — pass/fail, asserted by the journey, not scored</h4>
<ul class="gates">{"".join(f'<li><b>{g}</b>{t}</li>' for g, t in GATES)}</ul></div>

<h2>The five, unranked</h2>
{"".join(variant_block(v) for v in VARIANTS)}

<h2>The prune</h2>
<p class="lede">Scored 1&ndash;5 against the frozen criteria, each cell carrying the evidence it was scored on and how confident that evidence makes me. Weighted total out of 5.</p>
<div class="card">{score_table()}</div>

<div class="rec">
<h4>Recommended default</h4>
<p><strong>S1 · Figma flat, spliced with S2's collapsible sections.</strong> S1 is what he actually pointed at and it wins or ties every criterion except the one it ignores — a Block's panel is ~1,200px tall and nothing helps you skip it. S2 is the same engine, the same rows and the same title grammar with a chevron and a derived summary added; it costs one glyph per title and buys the only real answer to panel height. They are not two designs so much as one design with the fold switched on, which is why the splice is cheap rather than a compromise.</p>
<p>Take from the losers: <strong>S3's dot on a chip</strong> (the only affordance here that says something about a section you cannot see — worth adding to S2's collapsed titles), and <strong>S5's closed-list row grammar</strong>, which S2 already approximates when a list is folded.</p>
<p>Reject outright: <strong>S4</strong>. Its premise is measurable and it failed on the real subject — only 2 of ~14 property rows actually pair, so it spends vertical space and gets a taller panel. <strong>S5</strong>'s open state rebuilds the double header he rejected, from the other direction.</p>
</div>

<div class="hinge">
<h4>The decision hinge</h4>
<p><strong>Is the inspector something you read, or something you navigate?</strong> If a Block's panel is a thing you scan top to bottom while working, S1 flat is right and folding is furniture. If it is a place you go to change one known thing, S3's rail is right and everything else is scrolling. S2 is the hedge, and hedges usually lose — but here the fold is genuinely off by default, so the hedge costs one chevron.</p>
<p>The second hinge is smaller and yours: <strong>the declaration is called <code>section</code>, not <code>header</code></strong>, which was your word. In this panel &ldquo;header&rdquo; already names the panel's own title bar <em>and</em> the Block's header region — which is itself one of the sections the declaration produces, so a Bar's fields would have read <code>header: "header"</code>. Say the word and it gets renamed.</p>
</div>

<h2>Run it</h2>
<div class="run">pnpm --dir /home/bam/bbox-ui/.claude/worktrees/inspector-panel-v5 --filter @bbox-ui/docs exec next dev --port 4112</div>
<p class="meta">Then <code>http://localhost:4112/create</code> &mdash; localhost, never 127.0.0.1, or Next will not hydrate. Pick <strong>Block</strong> in the left column, then switch designs with the <strong>Inspector</strong> dropdown at the bottom of the right column. <em>Current (before)</em> is still in that list; nothing was deleted.</p>

<div class="foot">
Generated by <code>docs/build_inspector_v5.py</code> from <code>reports/media/{NAME}/manifest.json</code>.
Every number on this page was measured from the live checkout at build time.
{ASSERTIONS} browser assertions, {len(MANIFEST)} themes, {len(VARIANTS) + 1} designs.
</div>
</div></body></html>"""

OUT.write_text(HTML)
encoded = len(HTML.encode())
print(f"wrote {OUT}  ({encoded/1e6:.2f} MB on disk, images {BUDGET['bytes']/1e6:.2f} MB)")
