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

# WHY two manifests: round 3 collapsed four designs into one shipped panel,
# so `manifest.json` (this run) now carries far fewer checks than the
# round-2 comparison the rest of this file quotes. `MANIFEST`/`ASSERTIONS`
# keep pointing at the round-2 data (renamed to manifest-round2.json by the
# capture script) so every existing section below is untouched, byte for
# byte, and the round-3 section reads its own numbers from ROUND3 instead.
run = json.loads((MEDIA / "manifest.json").read_text())
ROUND3 = {entry["theme"]: entry for entry in run["manifest"]}
ROUND3_ASSERTIONS = len(run["checks"])
assert ROUND3_ASSERTIONS > 250, f"expected round 3's one-panel journey checks, found {ROUND3_ASSERTIONS}"

# WHY round 4 reads the SAME manifest: it added a gate (G15) to the existing
# journey rather than writing a second one, so `run` above is now round 4's
# run and `ROUND3_ASSERTIONS` is the LIVE total, not round 3's historical one.
# Round 3's own share is therefore the live total minus G15's checks —
# measured by counting them, never by subtracting a remembered number.
LIVE_ASSERTIONS = ROUND3_ASSERTIONS
ROUND4 = ROUND3
ROUND4_CHECKS = [c for c in run["checks"] if "G15" in c]
ROUND3_OWN_ASSERTIONS = LIVE_ASSERTIONS - len(ROUND4_CHECKS)
assert ROUND4_CHECKS, "expected round 4's G15 gate in the live manifest — re-run demos/capture-inspector-v5b.mjs"
ROUND4_MEMBERS = ROUND4["dark"]["membersProperty"]
ROUND4_LIGHT_MEMBERS = ROUND4["light"]["membersProperty"]

run2 = json.loads((MEDIA / "manifest-round2.json").read_text())
MANIFEST = {entry["theme"]: entry for entry in run2["manifest"]}
ASSERTIONS = len(run2["checks"])
assert ASSERTIONS > 400, f"expected round 2's four-design journey checks, found {ASSERTIONS}"


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


def wc_at(rev: str, path: str) -> int:
    """Line count of `path` as it existed at `rev` — for a file round 3
    deleted outright, so the live tree has nothing left for `wc()` to read."""
    result = subprocess.run(["git", "-C", str(HERE), "show", f"{rev}:{path}"], capture_output=True, text=True)
    return len(result.stdout.splitlines()) if result.returncode == 0 else 0


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
# WHY at a pinned revision, not `wc()`: round 3 deleted all three files
# outright (see "What was deleted" below) — the live tree has nothing left
# to count. e93218c is their last commit before the deletion.
VARIANT_LINES = sum(
    wc_at("e93218c", f"packages/panel/src/sections/variants/{f}")
    for f in ["Hairline.tsx", "Ledger.tsx", "Strata.tsx"]
)
ROUND1_ROW_LINES = wc(
    "/home/bam/bbox-ui/.claude/worktrees/inspector-panel-v5/packages/panel/src/sections/StandardRow.tsx"
)
NEW_STANDARDROW_LINES = wc("packages/panel/src/sections/StandardRow.tsx")

DARK = MANIFEST["dark"]["designs"]
LEGACY_HEADERS = DARK["current"]["legacyHeaders"]

# ==========================================================================
# ROUND 3 — one panel, clearer words, and the reset that was missing.
#
# WHY pinned commits, not HEAD: peers commit to this worktree concurrently
# (several agent sessions share it — see CLAUDE.md), and an unrelated later
# commit on this branch must not get swept into "what round 3 deleted".
# ROUND2_TIP is the round-2 report builder's own commit; ROUND3_TIP is
# round 3's last substantive commit — both already exist in history and
# will not move, unlike HEAD.
# ==========================================================================
ROUND2_TIP = "37fe56a"
ROUND3_TIP = "1e2fe0c"
_round3_shortstat = subprocess.run(
    ["git", "-C", str(HERE), "diff", "--shortstat", f"{ROUND2_TIP}..{ROUND3_TIP}"],
    capture_output=True, text=True,
).stdout
ROUND3_DELETED = int(re.search(r"(\d+) deletions?\(-\)", _round3_shortstat).group(1))
ROUND3_INSERTED = int(re.search(r"(\d+) insertions?\(\+\)", _round3_shortstat).group(1))
ROUND3_FILES_CHANGED = int(re.search(r"(\d+) files? changed", _round3_shortstat).group(1))

# ---- round 4: which components each side of the rule actually covers ----
# WHY parsed from the registry rather than listed here: the rule keys off a
# STRUCTURAL fact (`entry.slots`), so the honest way to say how far it reaches
# is to read every registered component and sort them by that same fact. A
# typed-in list would be a claim about the registry; this is the registry.
_bench_src = (HERE / "packages/panel/src/bench.tsx").read_text()
_registry_src = _bench_src.split("export const REGISTRY: ComponentEntry[] = [", 1)[1]
MEMBERS_INLINED: list[str] = []   # members, no slots — the list is the content
REGION_HOSTS: list[str] = []      # slots — Header/Body/Footer keep their chrome
LEAVES: list[str] = []            # neither
for _block in re.split(r"registerComponent\(\{", _registry_src)[1:]:
    _name = re.search(r'name: "(\w+)"', _block).group(1)
    _head = _block.split("render:", 1)[0]
    (REGION_HOSTS if "slots:" in _head else MEMBERS_INLINED if "members:" in _head else LEAVES).append(_name)
assert MEMBERS_INLINED and REGION_HOSTS, "the registry no longer has both sides of the rule"

ROUND3_SECTIONS = ROUND3["dark"]["designs"]["sections"]
ROUND3_LIGHT_SECTIONS = ROUND3["light"]["designs"]["sections"]
ROUND3_NAMING = ROUND3_SECTIONS["naming"]["sections"]
ROUND3_RESETS = ROUND3_SECTIONS["resets"]

# ---- the whole monorepo's vitest + typecheck, run for real -------------
# WHY an actual subprocess and not a guessed literal: this worktree DOES
# have node_modules and pnpm works in it, so "the test count isn't
# available" doesn't hold here — running it takes ~15s and is the only way
# to get a true total (static grep of `it(`/`test(` undercounts packages
# that use `test.each`, e.g. adapter-tldraw: 58 by grep, 78 for real).
_test_run = subprocess.run(["pnpm", "-r", "run", "test"], cwd=str(HERE), capture_output=True, text=True, timeout=240)
_TEST_COUNTS = dict(re.findall(r"^(\S+) test:\s+Tests\s+(\d+) passed", _test_run.stdout, re.M))
_TEST_COUNTS = {k: int(v) for k, v in _TEST_COUNTS.items()}
TEST_TOTAL = sum(_TEST_COUNTS.values())
TEST_PACKAGES = len(_TEST_COUNTS)
TEST_GREEN = _test_run.returncode == 0 and "failed" not in _test_run.stdout.lower()
PANEL_TEST_COUNT = _TEST_COUNTS.get("packages/panel", 0)

_typecheck_run = subprocess.run(["pnpm", "-r", "run", "typecheck"], cwd=str(HERE), capture_output=True, text=True, timeout=240)
TYPECHECK_GREEN = _typecheck_run.returncode == 0

_docs_typecheck_run = subprocess.run(
    ["pnpm", "--dir", "apps/docs", "run", "types:check"], cwd=str(HERE), capture_output=True, text=True, timeout=240,
)
DOCS_TYPECHECK_GREEN = _docs_typecheck_run.returncode == 0

DELETED_ROWS = [
    ("<code>packages/panel/src/sections/variants/Ledger.tsx</code> (P2)",
     "removed outright. A <code>Panel</code> body identical to P1's but for "
     "its function name, the shell's <code>id</code> string, and a "
     "<code>POLICY</code> object that flips exactly four "
     "<code>HeaderPolicy</code> booleans on."),
    ("<code>variants/Strata.tsx</code> (P3)",
     "removed outright. Once the Renderer section became every design's "
     "and not just P3's, its only residue was one extra "
     "<code>&lt;div&gt;</code> rule above the host-owned sections."),
    ("<code>variants/index.ts</code>", "removed — nothing left to register."),
    ("<code>variants/Hairline.tsx</code>",
     "promoted to <code>packages/panel/src/sections/SectionPanel.tsx</code> "
     "&mdash; the one panel that ships, not a variant among three."),
    ("<code>SectionPanelVariant</code>, <code>SECTION_PANELS</code>, "
     "<code>findSectionPanel</code>, <code>DEFAULT_SECTION_PANEL</code>",
     "gone from the package &mdash; a registry for choosing among panels "
     "that no longer has more than one to choose."),
    ("the <code>inspector-design-picker</code> <code>&lt;select&gt;</code> "
     "and its whole pre-sections render branch",
     "gone from <code>apps/docs/.../inspector-column.tsx</code>."),
    ("the settled <code>variant-picker</code> (&ldquo;Panel design&rdquo;)",
     "gone from <code>bench-sidebar.tsx</code> &mdash; it picked among the "
     "six <code>PANEL_VARIANTS</code>, settled 2026-09-11 (&ldquo;It's "
     "decided. We're going forward with figma dense.&rdquo;); they are "
     "untouched and still comparable side by side in "
     "<code>demos/inspector</code>."),
    ("two never-passed parameters, <code>onSelectParent</code> and "
     "<code>moveScope</code>",
     "gone from <code>listRow</code> in <code>build-sections.tsx</code>."),
]

WORDING_ROWS = [
    ("slot section title (<code>build-sections.tsx</code>, via the new "
     "shared <code>slotTitle()</code> in "
     "<code>packages/panel/src/sections/shared.tsx</code>)",
     "<code>Left</code> (and Center/Right/Header/Body/Footer)",
     "<code>Left Slot</code> (and Center/Right/Header/Body/Footer)",
     "Left/Center/Right are already values of Justify, Align and Port's "
     "Edge in the same panel, so the bare word as a title cannot be told "
     "from the word as a thing to pick."),
    ("member list under a slot's own fill",
     "<code>Left</code> &mdash; repeated its section",
     "<code>Members</code>",
     "a label repeating the heading above it spends a row saying "
     "nothing."),
    ("Bar-cell member lists",
     "<code>Left</code> / <code>Center</code> / <code>Right</code>",
     "<code>Left Slot</code> / <code>Center Slot</code> / "
     "<code>Right Slot</code>",
     "same reason as the slot title above."),
    ("&#9881; tooltip (<code>build-sections.tsx</code>)",
     "&ldquo;Open the &lt;T&gt; that fills Left&rdquo;",
     "&ldquo;Edit the &lt;T&gt; that fills Left Slot&rdquo;",
     "one verb for one glyph; two of the three call sites already said "
     "Edit."),
    ("add-menu tooltip",
     "&ldquo;Add to Members&rdquo;",
     "&ldquo;Add a member&rdquo; when the list has no name of its own",
     "&ldquo;Add to Members&rdquo; names a placeholder, not a thing you're "
     "doing."),
    ("reset tooltip (<code>packages/panel/src/fieldModel.ts</code> "
     "<code>resetTitleFor</code>)",
     "&ldquo;Clear this instance's override &mdash; fall back to the "
     "preset&rdquo;",
     "&ldquo;Reset to the default&rdquo; / &ldquo;Reset to the preset's "
     "value&rdquo; / &ldquo;Reset to the value inherited from the "
     "parent&rdquo;",
     "the old sentence named a preset on rows that have none &mdash; the "
     "panel's one outright false sentence."),
    ("<code>packages/bbox-ui/src/port.fields.ts</code> field "
     "<code>children</code>",
     "<code>Label</code>",
     "<code>Custom Label</code>",
     "a Port panel already has a <code>Name</code> row; <code>Label</code> "
     "one row under <code>Name</code> read as the same idea twice, and "
     "this field actually REPLACES the whole name/type/default "
     "rendering."),
    ("<code>packages/bbox-ui/src/glyph.fields.ts</code> field "
     "<code>children</code>",
     "<code>Content</code>",
     "<code>Icon</code>",
     "the hint already had to say &ldquo;the icon slot&rdquo; to make "
     "<code>Content</code> legible."),
]

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


def deleted_rows() -> str:
    return "".join(f"<tr><td>{a}</td><td>{b}</td></tr>" for a, b in DELETED_ROWS)


def wording_rows() -> str:
    return "".join(
        f"<tr><td>{where}</td><td>{old}</td><td>{new}</td><td>{why}</td></tr>"
        for where, old, new, why in WORDING_ROWS
    )


def naming_rows() -> str:
    rows = ""
    for s in ROUND3_NAMING:
        lists = ", ".join(f"<code>{l}</code>" for l in s["lists"]) or "<span class=\"sub\">&mdash;</span>"
        rows += f'<tr><td class="k">{s["id"]}</td><td><code>{s["title"]}</code></td><td>{lists}</td></tr>'
    return rows


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

<h2>Round 4 &mdash; the members header, on a component that is only members</h2>
<p class="lede" style="font-size:15px">&ldquo;Within a flex object you can get rid of the members header. Members should just be a property of the flex directly.&rdquo;</p>
<p>Right &mdash; and the reason is a rule the panel was already following everywhere else, applied one step too widely. <strong>A section earns its title by distinguishing its contents from a sibling section's.</strong> A Block has real siblings: Header, Body and Footer each hold their own fields <em>and</em> their own lists, so a heading there answers a live question &mdash; which region is this list in? A Flex has no siblings. Its {ROUND4_MEMBERS["flexFields"]} scalar rows and its {len(ROUND4_MEMBERS["flexLists"])} list are the entire panel, so a second titled, foldable wrapper separated the members from nothing, and spent a header saying the word &ldquo;Members&rdquo; directly above a row already labelled &ldquo;Members&rdquo;.</p>
<p>The word appeared <strong>twice</strong> in that panel, measured in the browser on the pre-fix build; it appears <strong>once</strong> now, and G15 asserts that number in both themes.</p>
<div class="pair">
  <figure><img src="{shot('round4-before-light-flex-one.png')}" alt="Flex before: Members twice"><figcaption><strong>Before</strong> &mdash; a bold <em>Members</em> section with its own hairline and fold chevron, and then <em>Members</em> again as the list's own row, three rows apart. Captured from this same running page with the old branch restored.</figcaption></figure>
  <figure><img src="{shot(ROUND4_LIGHT_MEMBERS['filledShot'])}" alt="Flex after: Members as the last property"><figcaption><strong>After</strong> &mdash; one section, and the list is its last property: same left edge, same ink, same row height as Wrap above it.</figcaption></figure>
</div>

<h3>The rule, and the signal it keys off</h3>
<p>No new declaration was added, and none was needed: the fact that separates the two cases was already in the registry. <code>entry.slots</code> is what a component uses to say &ldquo;I am several named regions&rdquo;, and it was <em>already</em> the guard on this branch of <code>buildSections</code> &mdash; a component with slots never reached it, because its lists were placed with their regions one step earlier. So a component that reaches this branch has, by construction, exactly one place its members can belong: its own section.</p>
<div class="card"><table><thead><tr><th style="width:30%">Registered as</th><th style="width:26%">Components</th><th>What its panel does</th></tr></thead><tbody>
<tr><td><code>members</code>, no <code>slots</code></td><td>{", ".join(f"<code>{n}</code>" for n in MEMBERS_INLINED)}</td><td><strong>Changed.</strong> The list is inlined as the last row of the component's own section. It keeps its label, its count and its <code>+</code> &mdash; only the section wrapper goes.</td></tr>
<tr><td><code>slots</code></td><td>{", ".join(f"<code>{n}</code>" for n in REGION_HOSTS)}</td><td><strong>Untouched.</strong> Header / Body / Footer are distinct named regions, each with its own fields and its own lists; a heading there is doing real work.</td></tr>
<tr><td>neither</td><td>{", ".join(f"<code>{n}</code>" for n in LEAVES)}</td><td>Leaves. No member list to place either way.</td></tr>
</tbody></table></div>
<p class="sub">Read out of <code>packages/panel/src/bench.tsx</code> at build time, by the same structural test the rule itself makes &mdash; not a list typed into this page.</p>

<h3>What the fold was hiding</h3>
<p>One thing got strictly better rather than just quieter. A section whose only row is an empty list is <code>isEffectivelyEmpty</code>, so it opened <strong>folded</strong> &mdash; which on a fresh Flex meant the <code>+</code>, the only way to add a member at all, was behind a chevron. Inlined into a section that has scalar rows, the list is always on screen. G15 asserts the <code>+</code> is in the panel at rest with the list still empty.</p>
<div class="pair">
  <figure><img src="{shot('round4-before-light-flex-empty.png')}" alt="empty Flex before"><figcaption><strong>Before</strong> &mdash; empty Flex: &ldquo;Members &middot; 0 members &#9656;&rdquo;, folded, the <code>+</code> out of reach.</figcaption></figure>
  <figure><img src="{shot(ROUND4_LIGHT_MEMBERS['emptyShot'])}" alt="empty Flex after"><figcaption><strong>After</strong> &mdash; empty Flex: the row is there, and so is the <code>+</code>.</figcaption></figure>
</div>

<h3>The other half of the gate: Block is untouched</h3>
<p>A fix scoped by a structural rule has to be proved on both sides of it, so G15 drives a Block in the same run and asserts its section list is exactly what it was: <code>{" &rarr; ".join(ROUND4_MEMBERS["blockIds"])}</code>, with every region keeping its slot title and its own list(s).</p>
<figure><img src="{shot(ROUND4_LIGHT_MEMBERS['blockShot'], cap=1400)}" alt="Block unchanged"><figcaption>The Block panel in the same run, after the change &mdash; Header Slot, Body Slot and Footer Slot still head their own lists.</figcaption></figure>
<div class="rec" style="margin-top:14px"><h4>The part of this capture worth staring at is <em>Body Slot</em></h4>
<p>A Block's body is filled by a Flex, and that section has read the right way the whole time: the Flex's Size / Direction / Justify / Align / Wrap, and then <strong>Members</strong> as the last row among them &mdash; no wrapper, no second heading. It is the exact shape you asked a standalone Flex for.</p>
<p>So this change is not a new idea; it is the removal of an inconsistency. The same component was drawn two ways depending on whether you reached it through a Block or picked it directly, and only the direct route grew the extra header. The fix makes the direct route agree with the route that was already right, which is why it costs one branch and no new declaration &mdash; and why nothing in the Block panel had to move.</p></div>

<div class="card"><h4>G15, and the mutant that proves it can fail</h4>
<p class="sub">{len(ROUND4_CHECKS)} of the journey's {LIVE_ASSERTIONS} assertions are round 4's, across both themes:</p>
<ul class="gates">{"".join(f"<li>{c.split(': ', 1)[1] if ': ' in c else c}</li>" for c in ROUND4_CHECKS if c.startswith("light/"))}</ul>
<p class="sub" style="margin-top:10px">Reverted to the old <code>sections.push(&hellip;)</code>, the journey stops at G15's first assertion &mdash; <code>a Flex grows NO section of its own for its members (1)</code> &mdash; with every check before it still green. The gate fails on the bug and only on the bug.</p>
<p class="sub">That one figure is the only number on this page not measured at build time, and it cannot be: re-deriving it would mean re-breaking the code the page is describing. It was observed once, by hand, on the run that reverted the branch &mdash; <code>137 assertions passed before the failure</code>.</p>
</div>

<h2>Round 3 &mdash; one panel, clearer words, and the reset that was missing</h2>
<p class="lede" style="font-size:15px">This round's journey drives the one panel that ships, not four designs side by side, which is why it asserts far fewer checks than round 2's {ASSERTIONS} &mdash; not a regression, a smaller surface. It now carries round 4's G15 too, so the live total is {LIVE_ASSERTIONS}, of which {ROUND3_OWN_ASSERTIONS} are round 3's own. Everything below this point that still says P1/P2/P3 or shows all three side by side is round 2's own record, kept as it was written.</p>

<h3>What was deleted</h3>
<p>The commit that shipped this (<code>{ROUND3_TIP}</code>, on top of the round-2 report's own <code>{ROUND2_TIP}</code>) is net negative: {ROUND3_INSERTED} insertions, <strong>{ROUND3_DELETED} deletions</strong> across {ROUND3_FILES_CHANGED} files.</p>
<div class="card"><table><thead><tr><th style="width:32%">Gone</th><th>What happened</th></tr></thead><tbody>{deleted_rows()}</tbody></table></div>

<h3>The wording pass</h3>
<div class="card"><table><thead><tr><th style="width:24%">Where</th><th style="width:22%">Old</th><th style="width:22%">New</th><th>Why</th></tr></thead><tbody>{wording_rows()}</tbody></table></div>
<p>The result, read live out of the shipped tree rather than asserted in prose &mdash; every slot section and the list beneath it, named by <code>SectionInspector</code> for a real Block right now:</p>
<div class="pair">
  <figure><img src="{shot(ROUND3_LIGHT_SECTIONS['files']['hero'])}" alt="round 3 hero, light theme"><figcaption>Header Slot, Body Slot, Footer Slot &mdash; and the list under each says Members or Left/Center/Right Slot, never the section's own name handed back to it.</figcaption></figure>
  <div class="card" style="margin:0"><table><thead><tr><th>Section</th><th>Title</th><th>Lists</th></tr></thead><tbody>{naming_rows()}</tbody></table></div>
</div>

<h3>The reset icon</h3>
<p>This is the headline fix. The button's guard was one line, <code>(governed || data.trace?.candidates[1]?.value !== undefined) && data.hasOwnOverride</code>, written independently in three places &mdash; <code>FigmaDense.tsx</code> twice (<code>FieldRow</code> and <code>PairedFieldCell</code>) and <code>StandardRow.tsx</code> once. <code>candidates</code> is a fixed 4-tuple in cascade order, <code>[override, inherited, preset, default]</code> (<code>packages/schema/src/resolve.ts</code>'s own <code>Layer</code> type), so <code>candidates[1]</code> is the <strong>inherited</strong> layer &mdash; not &ldquo;the next layer down&rdquo;. That file's own comment says it plainly: &ldquo;<code>default</code> always has a value &mdash; every <code>FieldSpec</code> declares one&rdquo;. Every overridden row has somewhere to go back to, and the old guard suppressed the button for every ungoverned, non-cascading field anyway.</p>
<p>Zach's Diameter had the &#8634; because a Port preset governs Diameter; his Justify did not, because nothing does. The split looked like control kind and was actually cascade shape.</p>
<p>The fix: one <code>canReset</code>/<code>resetsTo</code> pair computed once in <code>packages/panel/src/fieldModel.ts</code>, and one shared <code>ResetOverrideButton</code> in <code>FigmaDense.tsx</code> that every call site uses.</p>
<div class="pair">
  <figure><img src="{shot(ROUND3_LIGHT_SECTIONS['files']['hero'])}" alt="round 3 hero showing Align with a reset"><figcaption>Align &mdash; a DROPDOWN, tagged OVERRIDE &mdash; now carries the &#8634;, while un-overridden Justify correctly does not.</figcaption></figure>
  <figure><img src="{shot(ROUND3['dark']['provenance']['overrideShot'])}" alt="round 3 dark override, Radius 17"><figcaption>Radius = 17, OVERRIDE, with the &#8634;.</figcaption></figure>
</div>
<div class="hinge" style="border-left-color:var(--good);background:#101b10">
<h4 style="color:var(--good)">The assertion this round deliberately inverted</h4>
<p>Round 2's gate read: <blockquote>G7 no &#8634; on a row whose only fallback is its own default &mdash; main's rule, unchanged</blockquote></p>
<p>Round 3's replacement: <blockquote>G14 an overridden row offers its &#8634;, even with only a default under it</blockquote></p>
<p>The old assertion codified main's behaviour on purpose. Zach's own sentence &mdash; &ldquo;when you edit a value away from default you get a little reset icon that appears to put it back&rdquo; &mdash; is what overrode it.</p>
</div>
<div class="card"><h4>Live from the journey manifest</h4>
<p class="sub">{ROUND3_RESETS['rows']} rows scanned across {len(ROUND3_RESETS['kinds'])} control kinds ({", ".join(f"<code>{k}</code>" for k in ROUND3_RESETS['kinds'])}); in this fixture {len(ROUND3_RESETS['withReset'])} already carry an override with its own reset: {", ".join(f"<code>{w}</code>" for w in ROUND3_RESETS['withReset'])}. G14 (below) is what proves every kind gets one, not just these two.</p>
</div>

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

<h2>Proof, round 3</h2>
<div class="card">
<p>The one-panel journey: <strong>{LIVE_ASSERTIONS} assertions</strong>, both themes, zero console errors &mdash; a smaller number than round 2's {ASSERTIONS} on purpose, since it now drives one shipped panel instead of four designs. {len(ROUND4_CHECKS)} of them are round 4's G15.</p>
<p>The whole monorepo's tests, run for this build rather than quoted from memory: <strong>{TEST_TOTAL} tests across {TEST_PACKAGES} packages, {"green" if TEST_GREEN else "NOT green — see build output"}</strong> &mdash; <code>packages/panel</code> alone at <strong>{PANEL_TEST_COUNT}</strong>.</p>
<p>Both type checks, also run for this build: <code>pnpm -r run typecheck</code> is {"clean" if TYPECHECK_GREEN else "NOT clean"}, and <code>apps/docs</code>' own <code>tsc --noEmit</code> (via <code>types:check</code>) is {"clean" if DOCS_TYPECHECK_GREEN else "NOT clean"}.</p>
<p class="sub" style="margin-top:10px">Three new gates joined the list above, across rounds 3 and 4:</p>
<ul class="gates">
<li><b>G13</b> a section that stands for a slot says so &mdash; &ldquo;Left Slot&rdquo;, never the bare Justify/Align/Edge word underneath it</li>
<li><b>G14</b> the &#8634; reset appears on every overridden row, whatever control kind it is &mdash; a property of having an override, not of which control draws it</li>
<li><b>G15</b> a component whose members <em>are</em> its content gets one section with the list as its last property, while a component with named regions keeps a heading per region &mdash; asserted on a Flex and a Block in the same run</li>
</ul>
</div>

<h2>Run it</h2>
<div class="run">pnpm --dir /home/bam/bbox-ui/.claude/worktrees/inspector-panel-v6 --filter @bbox-ui/docs run dev</div>
<p class="meta">Already running on http://localhost:{PORT}/create &mdash; P1 ships as the only panel now, no picker left to choose it from. Add a Glyph to Header Slot &middot; Left and a Pill to Header Slot &middot; Right to reproduce the fixture in these captures. For round 4, pick <strong>Flex</strong> in the component picker: one section, with Members as its last row.</p>

<div class="foot">
Generated by <code>docs/build_inspector_v5b.py</code>. Every number on this page is read from the working tree or from the journey's own manifest at build time.
</div>
</div></body></html>"""

OUT.write_text(HTML)
encoded = len(HTML.encode())
print(f"wrote {OUT}  ({encoded/1e6:.2f} MB on disk, images {BUDGET['bytes']/1e6:.2f} MB)")
