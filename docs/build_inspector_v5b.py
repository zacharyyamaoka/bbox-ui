#!/usr/bin/env python3
"""Builds the round-2 review of the three inspector-panel proposals built on
Zach's 2026-09-12 picks from round 1.

Round 1 (`claude/inspector-panel-v5`) put five section designs on the table.
He picked from them, corrected one, named a bug and asked for three more
built on the combination — those picks are no longer variants, they are the
floor every design below stands on. What varies here is the one question
they left open: what is a section header FOR?

Captures come from reports/media/inspector-v5b-<date>/, written by
demos/capture-inspector-v5b.mjs against the real running /create page —
every picture in here was asserted before it was taken, and the assertion
count printed at the bottom is read out of that run's own manifest.

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

from PIL import Image

DATE = "2026-09-12"
NAME = f"inspector-v5b-{DATE}"
REPO = pathlib.Path("/home/bam/bbox-ui")
MEDIA = REPO / "reports" / "media" / NAME
OUT = REPO / "reports" / "media" / f"{NAME}.html"
HERE = pathlib.Path("/home/bam/bbox-ui/.claude/worktrees/inspector-panel-v6")
ROUND1 = "file:///home/bam/bbox-ui/reports/media/inspector-v5-2026-09-12.html"
BRANCH = "claude/inspector-panel-v6"
COMMIT = "HEAD"  # filled from git below
PORT = 4141

import subprocess

COMMIT = subprocess.run(["git", "-C", str(HERE), "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip() or "HEAD"

run = json.loads((MEDIA / "manifest.json").read_text())
MANIFEST = {entry["theme"]: entry for entry in run["manifest"]}
ASSERTIONS = len(run["checks"])
assert ASSERTIONS > 400, f"expected the post-review journey's checks, found {ASSERTIONS}"


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


def shot(file: str, quality: int = 80, cap: int | None = None, anchor: str = "top") -> str:
    """One capture, trimmed and inlined as webp.

    WHY webp and not the original PNG: Claude Code's HTML preview refuses a
    page past 2,097,024 bytes MEASURED ENCODED, and this report carries a
    couple dozen panel captures. webp at 80 holds flat UI chrome without
    visible loss at a third of the bytes.
    """
    im = Image.open(MEDIA / file).convert("RGB")
    im = trim(im)
    if cap and im.height > cap:
        # WHY an anchor: a "cap" that always crops from the top throws away
        # the bottom of the panel — which for the Renderer capture is the
        # only part the figure exists to show. Measured, not guessed: the
        # host stratum is the last section, so its crop has to start from
        # the foot.
        if anchor == "bottom":
            im = im.crop((0, im.height - cap, im.width, im.height))
        else:
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
STANDARD_CONTROLS_SRC = re.findall(
    r'export const STANDARD_CONTROLS = \[(.*?)\]',
    (HERE / "packages/panel/src/sections/contract.ts").read_text(),
)[0]
CONTROL_NAMES = re.findall(r'"([a-z]+)"', STANDARD_CONTROLS_SRC)
SECTION_DECLS = grep_count("packages/bbox-ui/src/block.fields.ts", r"section: ") + grep_count(
    "packages/bbox-ui/src/appearance.fields.ts", r"section: APPEARANCE_SECTION"
)
ENGINE_LINES = sum(
    wc(p)
    for p in [
        "packages/panel/src/sections/contract.ts",
        "packages/panel/src/sections/FoldRow.tsx",
        "packages/panel/src/sections/StandardRow.tsx",
        "packages/panel/src/sections/shared.tsx",
        "apps/docs/src/components/create/sections/build-sections.tsx",
        "apps/docs/src/components/create/sections/host-fields.ts",
        "apps/docs/src/components/create/sections/SectionInspector.tsx",
    ]
)
VARIANT_LINES = sum(
    wc(f"packages/panel/src/sections/variants/{f}")
    for f in ["Hairline.tsx", "Ledger.tsx", "Strata.tsx"]
)
ROUND1_ROW_LINES = wc(
    "/home/bam/bbox-ui/.claude/worktrees/inspector-panel-v5/packages/panel/src/sections/StandardRow.tsx"
)
NEW_STANDARDROW_LINES = wc("packages/panel/src/sections/StandardRow.tsx")

DARK = MANIFEST["dark"]["designs"]
LEGACY_HEADERS = DARK["current"]["legacyHeaders"]

# ---- the seven picks, transcribed verbatim ------------------------------
PICKS = [
    ("&ldquo;Lets take this design for different sections S1: The section is a "
     "title and a hairline&rdquo;",
     "<code>sections/shared.tsx</code>'s <code>sectionDividerStyle</code> plus "
     "<code>FoldRow</code>. The panel paints no card, no border and no "
     "max-width; the inspector column is the frame. Asserted as gate G3."),
    ("&ldquo;(S2) Lets add the folding &hellip; the chervon should appear just "
     "on hover&rdquo;",
     "<code>FoldRow</code>'s one line: <code>const chevronVisible = foldable "
     "&amp;&amp; (!open || revealed)</code>. An OPEN section hides its chevron "
     "at opacity 0 and reveals it under a real pointer. A CLOSED one keeps it "
     "&mdash; it is then the only thing on screen saying content is folded "
     "away. Gate G5, driven with <code>Input.dispatchMouseEvent</code>."),
    ("&ldquo;S3 don't take anything from this&rdquo;",
     "deleted. No file, no style and no idea from <code>Rail.tsx</code> "
     "carried forward."),
    ("&ldquo;S4 &ndash; yes we can support stacked labels. we do this already "
     "though via the group in the schema&rdquo;",
     "confirmed, and nothing was built. <code>FieldSpec.group</code> + "
     "<code>groupRows</code> are on main already; Width and Height land on "
     "one line through them, and so do the host's X and Y. Gate G8."),
    ("&ldquo;S5 I like how this looks collapses it more compact. lets copy "
     "that.&rdquo;",
     "<code>FoldRow</code> with <code>emphasis=\"list\"</code>: label, muted "
     "summary, chevron, one line. <code>Center &middot; empty</code> is that "
     "row."),
    ("&ldquo;When you expand it thought. no need to repeat the header agian "
     "etc.&rdquo;",
     "fixed. See the next section."),
    ("&ldquo;I would actually rebase on main&rdquo;",
     "reconciled, not replayed. See &ldquo;The rebase, and what it "
     "exposed&rdquo;."),
]

# ---- G1-G9, transcribed from the journey's own docblock -----------------
GATES = [
    ("G1", "no helper text anywhere in the inspector"),
    ("G2", "every value-editing control comes from the standard control list"),
    ("G3", "the panel is full bleed &mdash; no card, no border, no max-width"),
    ("G4", "<strong>EXACTLY ONE HEADER</strong> per member list, folded and "
     "expanded alike (the bug: &ldquo;when you expand it, no need to repeat "
     "the header again&rdquo;)"),
    ("G5", "a section's chevron is invisible at rest while it is open, and "
     "appears under a real mouse (&ldquo;the chevron should appear just on "
     "hover&rdquo;) &mdash; driven with <code>Input.dispatchMouseEvent</code>, "
     "not a synthetic React event, because the rule is about a pointer being "
     "there"),
    ("G6", "a folded thing is ONE line: label, summary, chevron"),
    ("G7", "the row's OVERRIDE tag still works inside the new section chrome "
     "(main's <code>RowLabel</code>, not a copy of it)"),
    ("G8", "two fields sharing <code>FieldSpec.group</code> still render on "
     "one row"),
    ("G10", "a member list's header is drawn as a PROPERTY ROW &mdash; same "
     "ink, type, weight and left edge as a real field row in the same "
     "section body, and no taller (&ldquo;I don't like how its greyed out "
     "and tab indented, I do like how its more compact now though&rdquo;)"),
    ("G11", "the shipped default never marks a folded header; the flag that "
     "does is opt-in and off (&ldquo;leave it off by default, I prefer "
     "simplicity&rdquo;)"),
    ("G12", "an open dropdown is never cut off by the panel's own scroll box "
     "&mdash; every row painted and hittable, nothing off-screen "
     "(&ldquo;instead of showing me the drop down menu, its cut off with a "
     "scroll wheel&rdquo;)"),
    ("G9", "both themes render with no console error"),
]

# ---- criteria, frozen before the scoring --------------------------------
CRITERIA = [
    ("FR1", "Quiet at rest", 22,
     "Does the resting panel read as &ldquo;a title and a hairline&rdquo;? "
     "Measured on what a header paints when nothing is pointing at it."),
    ("FR2", "Legible when folded", 20,
     "With the panel collapsed, can you find the section you edited without "
     "opening each one?"),
    ("FR3", "Compact", 16,
     "&ldquo;Like you can make it way more compact.&rdquo; Measured: the "
     "panel's own height, folded and open, plus what the Compact rung buys."),
    ("FR4", "No new mechanism", 17,
     "How much model does this design add? A header treatment that needs a "
     "new concept costs more than its pixels."),
    ("FR5", "Host-owned values placed honestly", 15,
     "Does the panel say which values belong to the render surface rather "
     "than the component?"),
    ("FR6", "The fold is discoverable", 10,
     "A hover-only chevron is quiet. Is it too quiet to find?"),
]
WEIGHTS = [c[2] for c in CRITERIA]

# ---- the three, unranked --------------------------------------------------
DESIGNS = [
    dict(
        id="hairline", name="P1 &middot; Hairline",
        axis="A header carries nothing at rest &mdash; name only; count, "
             "summary and verbs appear on hover.",
        blurb="The combination itself, with nothing added: title plus "
              "hairline, every section folds, chevron on hover, one compact "
              "line when folded, one header per member list. At rest it is "
              "a column of bold words and nothing else.",
        bets="that you know which section you want, so a header only has to "
             "be findable, not informative.",
        costs="with everything folded it tells you nothing about what is "
              "inside &mdash; including which section holds the value you "
              "changed.",
        state_key="folded",
        state_label=None,  # filled in below from measured heights
    ),
    dict(
        id="ledger", name="P2 &middot; Ledger",
        axis="A header carries its status at rest &mdash; count, live "
             "summary, verbs, and the rows' own OVERRIDE tag aggregated.",
        blurb="P1's chrome with standing information on every header. Fold "
              "a Block down to five lines and it still tells you which "
              "section you edited, how many rows it holds and what it can "
              "do &mdash; in the row tag's own vocabulary, one level up.",
        bets="that folding is something you actually do, and that a folded "
             "panel which cannot report your edits has folded away the "
             "wrong thing.",
        costs="every header becomes three or four visual elements instead "
              "of one &mdash; precisely what the S1 pick was reacting "
              "against.",
        state_key="folded",
        state_label="Folded, and still an audit: "
                     "<code>Body &#9317; 0 body 2 OVERRIDE</code>.",
    ),
    dict(
        id="strata", name="P3 &middot; Strata",
        axis="The panel splits by who writes the value: component-owned "
             "sections above, the render surface's own below.",
        blurb="P1's chrome plus a second stratum under a heavier rule "
              "&mdash; Renderer &middot; tldraw / React Flow / DOM, an "
              "ordinary section with ordinary rows, each saying who writes "
              "it, and disabled outright on the DOM render.",
        bets="that &ldquo;who owns this value&rdquo; is a question the "
             "panel should answer structurally rather than in prose.",
        costs="one more rule, one more section, and two new fields on the "
              "model (<code>InspectorSection.hostOwned</code>, "
              "<code>BoundField.provenance</code>) that the other two do "
              "not need.",
        state_key="renderer",
        state_anchor="bottom",
        state_cap=420,
        state_label="The host-owned stratum, last and under a heavier rule.",
    ),
]
DESIGNS[0]["state_label"] = (
    f"Everything folded: {DARK['hairline']['foldedHeight']}px, down from "
    f"{DARK['hairline']['openHeight']}px."
)

# ---- the AI prune --------------------------------------------------------
SCORES = {
    "hairline": [
        (5, "high", "At rest the journey measures zero painted chevrons "
         "(opacity 0), no count chips and no verbs &mdash; one bold word "
         "per header."),
        (2, "high", "Folded it says &ldquo;5 properties &middot; 0 "
         "body&rdquo;; nothing points at the section you changed."),
        (5, "high", f"{DARK['hairline']['foldedHeight']}px folded against "
         f"{DARK['hairline']['openHeight']}px open, and Compact takes the "
         "header from 30px to 24px."),
        (5, "high", "Adds nothing beyond the shared FoldRow every design "
         "uses."),
        (3, "med", "Host values stay invisible &mdash; the status quo, not "
         "a defect."),
        (3, "med", "No fold affordance at all until you point at one. A "
         "closed section keeps its chevron, which is the only mitigation."),
    ],
    "ledger": [
        (3, "high", "Three to four elements on every header. Visibly busier "
         "than P1 on the same Block &mdash; compare the two heroes above."),
        (5, "high", "&ldquo;Body &#9317; 0 body 2 OVERRIDE&rdquo; survives "
         "the fold; the journey asserts the tag is still there with every "
         "row gone."),
        (4, "high", f"Same {DARK['ledger']['foldedHeight']}px folded, but "
         "more ink per line."),
        (5, "high", "The aggregate is literally <code>ProvenanceTag</code> "
         "from FigmaDense &mdash; no second vocabulary for one idea."),
        (3, "med", "Same as P1."),
        (4, "med", "Chips and verbs at rest make a header read as something "
         "you can act on."),
    ],
    "strata": [
        (4, "high", "P1's header, plus one extra rule and one extra "
         "section."),
        (2, "high", "Same silence as P1."),
        (4, "high", f"{DARK['strata']['foldedHeight']}px folded against "
         f"{DARK['strata']['openHeight']}px open &mdash; the extra section "
         "costs what it costs."),
        (4, "med", "Two new fields on the model: "
         "<code>InspectorSection.hostOwned</code> and "
         "<code>BoundField.provenance</code>."),
        (5, "high", "Live X and Y off the page's real <code>positions</code> "
         "map; typing 260 moves the node; DOM is muted from "
         "<code>canMove: false</code> alone."),
        (3, "med", "Same as P1."),
    ],
}
TOTALS = {did: sum(s[0] * w for s, w in zip(rows, WEIGHTS)) / 100 for did, rows in SCORES.items()}

WHAT_I_COULD_NOT_VERIFY = [
    "Whether the hover-only chevron is discoverable. It is measurable in a "
    "browser and unknowable without a person; the closed-section chevron is "
    "my hedge, and it is the first thing I would change if a section ever "
    "feels stuck open.",
    "Whether <code>Renderer &middot; &lt;surface&gt;</code> should show "
    "Width and Height. The page has no measured size for an instance, so "
    "there was nothing honest to put in those rows and they are absent "
    "rather than faked.",
    "Rotation, for the same reason: <code>CanvasPosition</code> is "
    "<code>{x, y}</code> on main.",
]


def picks_rows() -> str:
    return "".join(f"<tr><td>{a}</td><td>{b}</td></tr>" for a, b in PICKS)


def gates_list() -> str:
    return "".join(f'<li><b>{g}</b>{t}</li>' for g, t in GATES)


def criteria_rows() -> str:
    return "".join(
        f'<tr><td class="k">{cid}</td><td><strong>{name}</strong>'
        f'<div class="sub">{blurb}</div></td><td class="w">{weight}</td></tr>'
        for cid, name, weight, blurb in CRITERIA
    )


def design_card(d: dict) -> str:
    fd = files_for("dark", d["id"])
    fl = files_for("light", d["id"])
    state = fd.get(d["state_key"])
    return f"""
    <section class="variant" id="{d['id']}">
      <div class="vhead">
        <h3>{d['name']}</h3>
        <div class="axis">{d['axis']}</div>
        <p class="thesis">{d['blurb']}</p>
      </div>
      <div class="shots">
        <figure><img src="{shot(fd['hero'])}" alt="{d['name']} dark"><figcaption>Dark</figcaption></figure>
        <figure><img src="{shot(fl['hero'])}" alt="{d['name']} light"><figcaption>Light</figcaption></figure>
        <figure><img src="{shot(state, cap=d.get('state_cap'), anchor=d.get('state_anchor', 'top'))}" alt="{d['name']} state"><figcaption>{d['state_label']}</figcaption></figure>
      </div>
      <div class="vbody" style="grid-template-columns:1fr 1fr">
        <div><h4>What it bets</h4><p class="sub" style="font-size:13.5px">{d['bets']}</p></div>
        <div><h4>What it costs</h4><p class="sub" style="font-size:13.5px">{d['costs']}</p></div>
      </div>
    </section>"""


def score_table() -> str:
    head = "".join(f'<th><span class="fr">{c[0]}</span><span class="wt">{c[2]}</span></th>' for c in CRITERIA)
    body = ""
    order = sorted(DESIGNS, key=lambda d: -TOTALS[d["id"]])
    for d in order:
        cells = ""
        for (score, conf, why) in SCORES[d["id"]]:
            cells += f'<td class="s s{score}"><span class="n">{score}</span><span class="c">{conf}</span><div class="why">{why}</div></td>'
        body += f'<tr><th class="vn">{d["name"]}</th>{cells}<td class="tot">{TOTALS[d["id"]]:.1f}</td></tr>'
    return f'<table class="scores"><thead><tr><th></th>{head}<th class="tot">/5</th></tr></thead><tbody>{body}</tbody></table>'


HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>bbox-ui &middot; three inspector panels, on the combination &middot; {DATE}</title>
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
blockquote {{ margin:0 0 14px; padding:10px 16px; border-left:3px solid var(--line); color:var(--dim); font-size:14px }}
.lede {{ color:var(--dim); font-size:16px; max-width:74ch }}
.meta {{ color:var(--faint); font-size:12.5px; margin-top:10px }}
a {{ color:#b8aaff; text-decoration:underline; text-underline-offset:2px }}
a:hover {{ color:#d4caff }}
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
.before img, .shots img, .pair img {{ width:100%; display:block; border:1px solid var(--line); border-radius:8px; background:#000 }}
figcaption {{ color:var(--faint); font-size:12px; margin-top:7px }}
.pair {{ display:grid; grid-template-columns:1fr 1fr; gap:18px; align-items:start; margin:14px 0 }}
.pair figure {{ margin:0 }}
.variant {{ border:1px solid var(--line); border-radius:12px; padding:22px; margin:22px 0; background:var(--panel) }}
.vhead {{ margin-bottom:16px }}
.axis {{ color:var(--accent); font-size:12px; text-transform:uppercase; letter-spacing:.06em; margin-top:5px; font-weight:600 }}
.thesis {{ color:var(--ink); font-size:15.5px; margin-top:10px; max-width:80ch }}
.shots {{ display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-bottom:18px }}
.shots figure {{ margin:0; max-height:760px; overflow:hidden; display:flex; flex-direction:column }}
.shots img {{ object-fit:cover; object-position:top }}
.vbody {{ display:grid; gap:26px }}
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
@media (max-width:900px) {{ .before,.shots,.vbody,.pair {{ grid-template-columns:1fr }} }}
</style></head><body><div class="wrap">

<h1>Three inspector panels, on the combination</h1>
<p class="lede">Round 1 put five section designs on the table. You picked from them, corrected one, named a bug and asked for three more. The picks are no longer variants &mdash; they are the floor every design below stands on. What varies is the one question they left open: what is a section header <em>for</em>?</p>
<p class="meta">Branch <code>{BRANCH}</code> &middot; <code>{COMMIT}</code> &middot; {ASSERTIONS} browser assertions across 2 themes and 4 designs, zero console errors &middot; engine {ENGINE_LINES} lines, three designs {VARIANT_LINES} lines &middot; <a href="{ROUND1}">round 1's report</a></p>
<div class="rec" style="margin-top:22px"><h4>You picked P1, and four things changed after you did</h4>
<p><strong>P1 &middot; Hairline is the shipped default</strong> &mdash; not a recommendation in a report, the design <code>/create</code> renders when nothing else is chosen. Its policy has a name now (<code>SHIPPED_HEADER_POLICY</code>) and a test that fails if the order of the variant list ever silently changes what ships.</p>
<p><strong>The Renderer section stopped being P3's.</strong> &ldquo;I don't think we need a new thing to the model, we can probably just support it within the existing model... its just another header and fields.&rdquo; Right: the flag that gated it made a region of the panel a property of the DESIGN rather than of the subject. It is gone. The host-owned section is built whenever the subject has host facts &mdash; a root has a place on the canvas, a member inside a Block does not &mdash; and <em>every</em> design renders it, P1 included.</p>
<p><strong>P2's folded override mark ships as a flag, off.</strong> &ldquo;Leave it off by default, I prefer simplicity, but yes if you want to implement it that's fine.&rdquo; It is <code>HeaderPolicy.foldedOverrideMark</code>, <code>false</code> in <code>SHIPPED_HEADER_POLICY</code>, and it marks a header only while the section is FOLDED &mdash; a status line earns its ink when the content it summarises cannot be seen, and not before. P2 is now that flag plus three more, which is all it ever was.</p>
<p><strong>A member list's header reads as a property row.</strong> &ldquo;I don't like how its greyed out and tab indented, I do like how its more compact now though.&rdquo; All three demotions were separate mistakes in one component &mdash; muted ink, smaller type, and a second helping of the section gutter &mdash; and they are fixed at the source in <code>FoldRow</code>, so no call site overrides anything. The height is unchanged; a gate measures it against a real sibling row so a future fix cannot quietly trade the compactness back.</p>
<p><strong>And one real bug, reproduced before it was fixed:</strong> the dropdown cut off by the panel's scrollbar. See below.</p></div>

<h2>The dropdown was cut off by the panel's own scrollbar</h2>
<p>Your words, on Port's State row: &ldquo;I did a drop down on the state property, and instead of showing me the drop down menu, its cut off with a scroll wheel.&rdquo; Reproduced first, on Port, at the foot of the inspector's scroller: <strong>five of six rows reachable, the sixth sheared off</strong> 22px past <code>[data-slot="inspector-scroll"]</code>'s edge.</p>
<p>The cause was a comment that had gone stale. The menu was <code>position: absolute</code> inside its row, with a note claiming &ldquo;this panel never sits inside an <code>overflow:hidden</code> ancestor that would clip it&rdquo; &mdash; true when the panel was a 280px card in page flow, false the moment it became a full-height column with its own scroller. This is the same class as the Base UI positioner trap: a popover that does not escape its scrolling ancestor is clipped by it.</p>
<p>The fix is <code>position: fixed</code> with the placement computed from the trigger's rect &mdash; prefer below, flip above when below cannot hold it and above can, clamp to the viewport either way. <strong>Not a portal</strong>, deliberately: a fixed element escapes overflow while staying a DOM descendant of the dropdown root, which is what the outside-pointerdown handler uses to tell &ldquo;inside the menu&rdquo; from &ldquo;outside it&rdquo;. Portalling would have silently broken that and made every click on a menu row close the menu before it fired. It also needs no <code>react-dom</code> dependency, which this package does not declare.</p>
<div class="pair">
  <figure><img src="{shot('dropdown-before.png')}" alt="dropdown clipped"><figcaption><strong>Before</strong> &mdash; the same menu with its previous <code>position: absolute</code> restored in the browser. Six rows, five reachable; &ldquo;Warning&rdquo; is gone.</figcaption></figure>
  <figure><img src="{shot('dropdown-after.png')}" alt="dropdown escaping"><figcaption><strong>After</strong> &mdash; six of six reachable, still 22px past the scroller and no longer clipped by it.</figcaption></figure>
</div>
<p class="sub">The placement is a pure function (<code>placeMenu</code>) with eight unit tests of its own &mdash; below, above, both-cramped, off-either-edge, and a 200-row list &mdash; because the bug was geometry, and geometry should not need a browser to check. G12 drives the real thing on Port in both themes and asserts every row is hittable via <code>elementFromPoint</code>, not by comparing rectangles: the menu is now <em>supposed</em> to extend past the scroller, so a rect test would fail the fix and pass the bug.</p>

<h2>The picks, and where each one went</h2>
<div class="card"><table><thead><tr><th style="width:44%">You said</th><th>Where it lives now</th></tr></thead><tbody>
{picks_rows()}
</tbody></table></div>

<h2>The bug: two headers, one list</h2>
<div class="pair">
  <figure><img src="{shot(files_for('dark','current')['hero'], cap=1500)}" alt="before"><figcaption><strong>Before</strong> &mdash; the panel on <code>main</code> today</figcaption></figure>
  <figure><img src="{shot(files_for('dark','hairline')['hero'])}" alt="after"><figcaption><strong>After</strong> &mdash; P1 &middot; Hairline</figcaption></figure>
</div>
<p>Expanding a member list showed its compact summary line <em>and</em> the list control's own header, stacked. Two components each believed they owned that header and neither could see the other, so no amount of styling either one could fix it.</p>
<p>The fix is structural, not visual: a member list now renders headerless (<code>members/List.tsx</code>, <code>chrome: "none"</code>) and its verbs &mdash; &#9881; and the typed <code>+</code> &mdash; ride up to the single <code>FoldRow</code> the section layer draws. There is no configuration in which two headers exist. Gate <strong>G4</strong> walks every list in the panel, in both themes, and asserts exactly one <code>[data-slot="list-header"]</code>, zero <code>[data-slot="members-header"]</code>, and a chevron only on a list that has members. The before design still reports {LEGACY_HEADERS} control-owned headers, which is what there was to fix.</p>

<h2>The rebase, and what it exposed</h2>
<p><code>claude/inspector-panel-v5</code> was cut from <code>f28b2cc</code>, the Arrangements/Placements tip of <code>claude/members-control</code>. That commit is <strong>not</strong> on main &mdash; <code>d78beed</code> merged <code>8fcd699</code> instead &mdash; so replaying round 1 onto main would have produced code calling <code>activeArrangement</code>, <code>blockPorts</code>, <code>portPlacementsOf</code> and <code>@bbox-ui/core</code>'s <code>Placement</code>, none of which exist there. It would not have compiled. So the section-chrome work was re-applied on <code>origin/main</code> (<code>76e4bcb</code>) instead, without the arrangement and placement sections, and without the <code>flags</code> control whose only caller was that unmerged model.</p>
<p>The rebase also exposed a defect that had nothing to do with the merge. Round 1 ported <code>variants/FigmaDense.tsx</code>'s row <strong>by value</strong> &mdash; {ROUND1_ROW_LINES} lines of it. Between then and now you replaced the provenance DOT with the plain-word OVERRIDE tag and the row's &ldquo;&times;&rdquo; with lucide's reset icon. The copy received neither, because a copy never receives its donor's corrections. <code>sections/StandardRow.tsx</code> is now {NEW_STANDARDROW_LINES} lines that import <code>RowLabel</code>, <code>DenseControl</code>, <code>TraceChain</code> and <code>readRow</code> from the file your own header calls &ldquo;the chosen design&rdquo;, and add only what a section needs on top: a foreign write target, <code>disabled</code>, a <code>note</code>, and the <code>data-standard-control</code> attribute the journey asserts on. A structural test refuses a second <code>RowLabel</code> in that file, and it is mutation-tested red.</p>
<div class="pair">
  <figure><img src="{shot(MANIFEST['dark']['provenance']['overrideShot'])}" alt="override tag"><figcaption>The row's own OVERRIDE tag, inside the new section chrome</figcaption></figure>
  <figure><img src="{shot(MANIFEST['dark']['provenance']['taggedShot'])}" alt="tagged folded"><figcaption>P2 aggregates that same tag onto the header, and it survives the fold</figcaption></figure>
</div>

<h2>Renderer props: yes, it is just another header</h2>
<p>You floated it as a hypothesis &mdash; &ldquo;I am thinking this could be just another header though.&rdquo; It is, and the reason is that the create page had already drawn the line the section needs, one layer down. <code>apps/docs/src/components/create/contract.ts</code>, on <code>CanvasPosition</code>:</p>
<blockquote>&ldquo;Kept OUT of <code>Instance.props</code>: position is a fact about a host, not a property of the component, and putting it in props would put an x/y row in the inspector for every component.&rdquo;</blockquote>
<p>The distinction was modelled; the panel simply had no view onto it. So the Renderer region needs no new mechanism. A host fact is a <code>FieldSpec</code> bound to a different subject &mdash; exactly what a Bar's <code>hidden</code> shown inside a Block's Header section already is. <code>BoundField.disabled</code> covers read-only, <code>BoundField.note</code> covers &ldquo;tldraw writes this when you drag&rdquo;, and <code>InspectorSection.muted</code> covers a surface with no canvas, which <code>RENDERS</code>' own <code>canMove: false</code> already declares for the DOM render. Nothing is stubbed: X and Y read the page's live <code>positions</code> map and write it back through the same setter a canvas drag uses, so typing 260 into X moves the node.</p>
<p>Two things did <strong>not</strong> survive, and losing them is the finding rather than a compromise. The prior implementation of this idea (<code>HostFactsSection.tsx</code>, on <code>claude/glyph-finish</code>) carried a paragraph of helper text under its title and an amber warning strip on the DOM render. Both are the helper text you already deleted from member lists one round earlier &mdash; &ldquo;No need to put this text under the members list. it just add clutter.&rdquo; The section's own label and the per-row writer note say everything they said.</p>
<p>One genuinely new thing: a host fact has exactly <strong>one</strong> layer, so the provenance tag and the cascade disclosure have nothing to explain. Left alone they painted a violet OVERRIDE on every X and Y &mdash; a true statement about the resolver and a false one to the reader. <code>BoundField.provenance: "none"</code> turns both off, and it is on the binding rather than the FieldSpec because what decides is where this row's value comes from.</p>
<div class="pair">
  <figure><img src="{shot(files_for('dark','strata')['renderer'])}" alt="renderer tldraw"><figcaption>Renderer &middot; tldraw &mdash; X and Y are live, editable, and share one row through <code>FieldSpec.group</code></figcaption></figure>
  <figure><img src="{shot(files_for('dark','strata')['rendererDom'])}" alt="renderer dom"><figcaption>Renderer &middot; DOM &mdash; muted and read-only, from <code>RENDERS.canMove === false</code> alone</figcaption></figure>
</div>

<h2>Criteria, frozen before the scoring</h2>
<div class="card"><table><tbody>{criteria_rows()}</tbody></table></div>
<div class="card"><h4>Hard gates &mdash; pass/fail, asserted by the journey, not scored</h4>
<ul class="gates">{gates_list()}</ul>
<p class="sub" style="margin-top:10px">All twelve pass in both themes. {ASSERTIONS} assertions, zero console errors.</p>
</div>

<h2>The three, unranked</h2>
{"".join(design_card(d) for d in DESIGNS)}

<h2>The prune</h2>
<p class="sub" style="margin-bottom:14px">Scored before your pick and kept unchanged as the record of it &mdash; rescoring after a decision is resulting. Two cells would move now: FR5 is no longer P3's alone (the Renderer section ships in all three), and FR2's gap between P1 and P2 is one boolean rather than a design.</p>
<div class="card">{score_table()}</div>

<div class="rec">
<h4>Recommended default</h4>
<p><strong>Ship P1 as the default, and treat P2 and P3 as two switches rather than two rivals.</strong> It is already the default in the picker and it is the literal combination you specified; nothing in it is my idea.</p>
<p>The three are not mutually exclusive, and that is the most useful thing this round found. P1 is the floor. P2 adds one thing to a header (standing status). P3 adds one thing to the panel (a host-owned stratum). Either can be taken without the other, and both are already built &mdash; click them in the picker at the bottom of the inspector column.</p>
<p>If you want my splice: keep P1's rest state, take P3's Renderer section, and take P2's aggregate tag <strong>only on a folded header</strong>. A status line earns its ink exactly when the content it summarises cannot be seen, and not before. That is one flag on <code>HeaderPolicy</code>, not a fourth design.</p>
</div>

<div class="hinge">
<h4>The decision hinge</h4>
<p><strong>Do you actually fold sections?</strong> Everything else follows from it. If folding is part of how you work, P1's silence is a real cost every time you collapse a Block and lose the thread of what you changed, and P2's extra ink is the price of keeping it. If you scroll instead of folding, P2 is decoration on a header you never read at rest and P1 wins outright. I cannot answer this one from the code; it is a fact about your hands.</p>
<p>The second hinge is narrower: <strong>does the inspector own host facts at all?</strong> If X and Y belong in the panel, P3's section is the right shape for them and the extra rule is cheap. If they belong only on the canvas, P3 is paying for a question you did not ask.</p>
</div>

<h4 style="margin-top:36px">What I could not verify</h4>
<ul class="gates">{"".join(f"<li>{item}</li>" for item in WHAT_I_COULD_NOT_VERIFY)}</ul>

<h2>Run it</h2>
<div class="run">pnpm --dir /home/bam/bbox-ui/.claude/worktrees/inspector-panel-v6 --filter @bbox-ui/docs run dev</div>
<p class="meta">Already running on http://localhost:{PORT}/create &mdash; pick a design in the <strong>Inspector</strong> drop-down at the bottom of the right column. Add a Glyph to Header &middot; Left and a Pill to Header &middot; Right to reproduce the fixture in these captures.</p>

<div class="foot">
Generated by <code>docs/build_inspector_v5b.py</code>. Every number on this page is read from the working tree or from the journey's own manifest at build time.
</div>
</div></body></html>"""

OUT.write_text(HTML)
encoded = len(HTML.encode())
print(f"wrote {OUT}  ({encoded/1e6:.2f} MB on disk, images {BUDGET['bytes']/1e6:.2f} MB)")
