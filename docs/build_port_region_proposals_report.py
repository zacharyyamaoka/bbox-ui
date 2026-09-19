#!/usr/bin/env python3
"""Build the one report for the 2026-09-19 ports / edges / regions round:
Zach's feedback on the overnight build, the three fixes, five port styles,
five region drawings, the producer count, and the bottom-right switch.

    python3 docs/build_port_region_proposals_report.py

Writes a self-contained page (captures, hero video, poster inlined as data
URIs) to the gitignored media half of reports/ in the MAIN checkout:

    /home/bam/bbox-ui/reports/media/port-and-region-proposals-2026-09-19.html

Inputs read at build time (all read-only):
  - the lane captures under reports/media/lanes-2026-09-19/<lane>/
  - Zach's nine screenshots, /home/bam/zach_brain/Pasted image 20260919*.png
  - the hero recording + probes staged by the scribe under
    reports/media/port-and-region-proposals-2026-09-19/{hero,gates,probes}/
    (recorded with Playwright recordVideo against the REAL app served from
    the integration worktree at 21bd8ef on :4470)
  - the variant registries (src/skin/portVariants.ts, regionVariants.ts) and
    the story files, which this script checks for every story id it links
  - git, for whether the worktree behind Zach's :5421 / :4340 already
    contains the round (the Open-it fence follows the answer)

Lane status, audit verdicts, fix rounds and deviations are transcribed from
the dispatcher's lane-result records handed to the scribe; the Source Index
at the bottom names each input so a stale claim can be traced.

WHY every capture is re-encoded and the size printed: Claude Code's desktop
preview opens a file:// report as a data:text/html URL and refuses one whose
encodeURIComponent form exceeds 2,097,024 bytes. Base64 media inflates little
under that encoding; prose inflates a lot — so the page is measured encoded,
never on disk, and the GIF fallback is inlined only if the page still fits.
"""
from __future__ import annotations

import base64
import html
import io
import json
import pathlib
import re
import subprocess
import sys
from urllib.parse import quote

from PIL import Image, ImageChops

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent
REPORT_NAME = "port-and-region-proposals-2026-09-19"
MAIN = pathlib.Path("/home/bam/bbox-ui")
OUT = MAIN / "reports" / "media" / f"{REPORT_NAME}.html"
LANES = MAIN / "reports" / "media" / "lanes-2026-09-19"
STAGE = MAIN / "reports" / "media" / REPORT_NAME
HERO = STAGE / "hero"
GATES = STAGE / "gates"
PROBES = STAGE / "probes"
BRAIN = pathlib.Path("/home/bam/zach_brain")
SB = REPO / "apps" / "storybook-basics"
REVIEW_WORKTREE = MAIN / ".claude" / "worktrees" / "component-docs-reorganize-8ce972"
INTEGRATION_WORKTREE = MAIN / ".claude" / "worktrees" / "prf-integration-2026-09-19"
INTEGRATION_HEAD = "21bd8ef"
CAP = 2_097_024
# encodeURIComponent leaves exactly these unescaped besides [A-Za-z0-9].
URI_SAFE = "-_.!~*'()"

USED: list[str] = []


# ---------------------------------------------------------------- media

def img(path: pathlib.Path, max_w: int = 900, crop: tuple[float, float, float, float] | None = None,
        trim: bool = False, pad: int = 10, quality: int = 80) -> str:
    """PNG on disk -> cropped, downscaled WebP data URI (lossy or lossless,
    whichever is smaller — flat UI screenshots often compress better losslessly)."""
    if not path.exists():
        raise SystemExit(f"missing capture: {path}")
    USED.append(str(path))
    im = Image.open(path).convert("RGB")
    if crop:
        l, t, r, b = crop
        im = im.crop((int(im.width * l), int(im.height * t), int(im.width * r), int(im.height * b)))
    if trim:
        bg = Image.new("RGB", im.size, im.getpixel((0, 0)))
        box = ImageChops.difference(im, bg).getbbox()
        if box:
            im = im.crop((max(0, box[0] - pad), max(0, box[1] - pad), min(im.width, box[2] + pad), min(im.height, box[3] + pad)))
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    lossy, lossless = io.BytesIO(), io.BytesIO()
    im.save(lossy, "WEBP", quality=quality, method=6)
    im.save(lossless, "WEBP", lossless=True, quality=100, method=6)
    best = min(lossy.getvalue(), lossless.getvalue(), key=len)
    return "data:image/webp;base64," + base64.b64encode(best).decode()


def data_uri(path: pathlib.Path, mime: str) -> str:
    if not path.exists():
        raise SystemExit(f"missing media: {path}")
    USED.append(str(path))
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def esc(s: str) -> str:
    return html.escape(s, quote=False)


def attr(s: str) -> str:
    return html.escape(s, quote=True)


def cite(*ns: int) -> str:
    return "<sup class='cite'>" + ",".join(f"<a href='#src-{n}'>{n}</a>" for n in ns) + "</sup>"


def fig(uri: str, caption: str, cls: str = "", style: str = "") -> str:
    st = f" style='{style}'" if style else ""
    return f"<figure class='{cls}'{st}><img src='{uri}' alt=''><figcaption>{caption}</figcaption></figure>"


def plain(html_text: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", html_text)).strip()


def verdict(kind: str, num: str, title: str) -> str:
    """Approve / Change / Reject + a note, per item. Kind, number and exact
    title travel into the copied markdown so Zach never has to say which
    item he means."""
    return f"""<div class="v" data-key="{attr(kind + ':' + num)}" data-kind="{attr(kind)}" data-num="{attr(num)}" data-title="{attr(plain(title))}">
  <button data-v="approve" aria-pressed="false">Approve</button><button data-v="change" aria-pressed="false">Change</button><button data-v="reject" aria-pressed="false">Reject</button>
  <textarea placeholder="note…" spellcheck="false" rows="1"></textarea></div>"""


# ---------------------------------------------------------------- facts read at build time

def git(*args: str, cwd: pathlib.Path = REPO) -> str:
    try:
        return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, timeout=20).stdout.strip()
    except Exception:
        return ""


def review_worktree_has_round() -> tuple[bool | None, str]:
    if not REVIEW_WORKTREE.exists():
        return None, "missing"
    head = git("rev-parse", "--short", "HEAD", cwd=REVIEW_WORKTREE)
    rc = subprocess.run(["git", "merge-base", "--is-ancestor", INTEGRATION_HEAD, "HEAD"], cwd=REVIEW_WORKTREE).returncode
    return rc == 0, head


def gate(name: str) -> dict:
    """Parse one gate log the scribe re-ran on the merged tree."""
    p = GATES / f"{name}.log"
    if not p.exists():
        return {"ok": None, "files": None, "tests": None, "dur": None}
    USED.append(str(p))
    t = p.read_text()
    exit_ok = bool(re.search(r"^exit 0\s*$", t, re.M))
    files = re.search(r"Test Files\s+(\d+) passed \((\d+)\)", t)
    tests = re.search(r"Tests\s+(\d+) passed \((\d+)\)", t)
    dur = re.search(r"Duration\s+([\d.]+s)", t)
    return {"ok": exit_ok, "files": files.group(2) if files else None, "tests": tests.group(2) if tests else None,
            "dur": dur.group(1) if dur else None}


STORIES = [
    # (story file, title, export) — the builder checks each export exists
    ("PortVariants.stories.tsx", "Ports/PortVariants", "AllFive"),
    ("PortVariants.stories.tsx", "Ports/PortVariants", "StatesAllVariants"),
    ("PortVariants.stories.tsx", "Ports/PortVariants", "InContext"),
    ("RegionVariants.stories.tsx", "Control Flow/Region Variants", "AllFive"),
    ("RegionVariants.stories.tsx", "Control Flow/Region Variants", "FoldInEveryVariant"),
    ("VariantGallery.stories.tsx", "Control Flow/Variant Gallery", "VariantGallery"),
    ("EdgeDefaults.stories.tsx", "Control Flow/Edge Defaults", "ElbowIsTheDefault"),
    ("Producers.stories.tsx", "Blocks/Scene/Producer Count", "AtRest"),
]


def story_ids() -> list[tuple[str, str, str]]:
    """Every linked story, verified in the merged tree's story files, with
    the id Storybook's own csf helpers compute (V1 -> `v-1`, not `v1`)."""
    rows = []
    for file, title, export in STORIES:
        src = SB / "src" / "stories" / file
        text = src.read_text()
        if f'title: "{title}"' not in text or not re.search(rf"^export const {export}\b", text, re.M):
            raise SystemExit(f"story {title} / {export} not found in {src}")
        USED.append(str(src))
        rows.append((file, title, export))
    script = ("const m=require('storybook/internal/csf');const rows=JSON.parse(process.argv[1]);"
              "console.log(JSON.stringify(rows.map(([t,e])=>m.toId(t,m.storyNameFromExport(e)))));")
    try:
        out = subprocess.run(["node", "-e", script, json.dumps([[t, e] for _, t, e in rows])], cwd=SB,
                             capture_output=True, text=True, timeout=30).stdout
        ids = json.loads(out)
    except Exception:
        def san(s: str) -> str:
            return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]", "-", s.lower())).strip("-")
        def name(e: str) -> str:
            return re.sub(r"([a-z])([A-Z0-9])", r"\1 \2", e)
        ids = [f"{san(t)}--{san(name(e))}" for _, t, e in rows]
    return [(f, e, i) for (f, _, e), i in zip(rows, ids)]


# ---------------------------------------------------------------- content data

# Lanes, transcribed from the dispatcher's lane-result records [3].
LANES_DATA = [
    dict(uid="fix-edges", title="Fixes: elbow by default, one centre attach point per port, tldraw regions drawn like the DOM canvas",
         built="Opus 5", audit="Sonnet 5", verdict="PASS", findings="none", rounds=0, tip="e2dbc6d", merge="3b724ce",
         dev="Inverted (not deleted) the app smoke case that asserted two wires between the same dots fan ≥8px apart — it asserted what you ruled out; now ≤0.5px, endpoints coincide. <code>traceEditor.tsx</code> still defaults <code>curved</code> (story-only surface). React Flow's stock <code>getSmoothStepPath</code> has no keep-outs, so bypass is proved on the DOM canvas only."),
    dict(uid="regions", title="Five region drawings, one with the branch header rule, the For Loop reading kept",
         built="Fable 5.1", audit="Sonnet 5", verdict="PASS after 1 fix round", findings="1 minor (process)", rounds=1, tip="936ae6e", merge="1e42304",
         dev="The fix round made a nearer ancestor's switch re-resolve and applies it with <code>flushSync</code> — a plain <code>setState</code> from a MutationObserver painted one half-switched frame on every switch. Acceptance for that was committed first (<code>e27257c</code>)."),
    dict(uid="ports", title="Five circular on-the-edge port styles, small text by default, producers badge slot",
         built="Opus 5", audit="Sonnet 5", verdict="PASS", findings="none", rounds=0, tip="ad56589", merge="a5a583c",
         dev="One textual conflict in <code>globals.css</code> (both lanes' variant imports kept, each keyed on its own attribute). No acceptance edited."),
    dict(uid="producers-count", title="Producer-count badge fed from the scene: how many cables meet each port",
         built="Opus 5", audit="Sonnet 5", verdict="PASS", findings="none", rounds=0, tip="8976a38", merge="133d0ff",
         dev="Hosts pass the raw count; the ≥2 threshold stays in <code>Port</code>. In the app the count comes from the derived scene, so a half-bound wire is not counted. Two stories added on top of the acceptance (+83/−0)."),
    dict(uid="app-variant-switch", title="The bottom-right variant switch: ports × regions, live, remembered, in the app and as a Storybook global",
         built="Opus 5", audit="Sonnet 5", verdict="PASS", findings="none", rounds=0, tip="b76f46b", merge="21bd8ef",
         dev="Stock shadcn <code>DropdownMenu</code> radio groups, not native selects (a native list is drawn by the OS, off-token and un-screenshottable). Switching a drawing re-settles every armed region's stored height with history ignored."),
]

PORT_INFO = {
    # id: (title, basis html, dot box px, painted px, ring/gap, rest/wired grammar, label, hover, badge)
    "v1": ("Fine ring", "React Flow's own 6px handle scale (<code>@xyflow/react/dist/style.css:250-251</code>) drawn in this trunk's three-circle state grammar",
           6, 11, "1px card gap + 1.5px ring", "hollow ring in the STATE colour; a cable lights an orange centre; data received turns it green", "12px sans 400, type at 55%",
           "×1.35 and a 3px soft halo", "14px solid ink circle"),
    "v2": ("SystemSketch original", "the original app's live port — <code>systemsketch/src/blocks/ui/block-canvas.css:1099-1132</code>, <code>portPalette.ts:23-40</code>, the mono signature row, the <code>.Port-count</code> pill — scaled ×2/3 with the text",
           8, 12, "1px surface gap + 1px ring in the TYPE colour", "hollow in the type colour; a default value fills it muted grey; a cable fills it with the type colour", "12px monospace 400, type at 60%",
           "×1.25 and a 3px halo", "14px soft grey chip (the original's pill)"),
    "v3": ("Langflow", "langflow's handle — <code>handleRenderComponent/index.tsx:110-143</code>, the <code>--datatype-*</code> pairs in <code>style/index.css:162-202</code>, <code>nodeColorsName</code>",
           10, 16, "no gap + 3px pale ring of the same hue", "a disc FILLED with the type colour, identical wired or not — the cable says “wired”", "12px sans 500, type at 50%",
           "×1.15 and a neon glow in the type colour", "14px solid ink circle"),
    "v4": ("React Flow UI pearl", "React Flow UI's <code>BaseHandle</code> (<code>h-[11px] w-[11px] rounded-full border-slate-300 bg-slate-100</code>) + stock xyflow ink once connected",
           9, 11, "no gap + 1px light border", "a light pearl that nearly disappears into the card; wired turns it the foreground ink; data received green", "12px sans 400, type at 50%",
           "×1.3 and a 3px halo", "14px solid ink circle"),
    "v5": ("Reticle", "your own <code>DP - Port.md</code> — “three stacked circles: outline, background, centre” — drawn literally",
           12, 14, "no gap + 1px hairline ring", "the centre is ALWAYS drawn (muted grey until something attaches), lit orange when wired — the one centre attach point is visible before any cable exists", "12px sans 400, type at 55%",
           "×1.2 and a 3px halo", "14px solid ink circle"),
}

REGION_INFO = {
    # id: (title, blurb, frame, corner, arm header, header px, chevron, nested)
    "v1": ("Labeled group", "Today's look, tightened — the For Loop reading you liked.", "hairline <code>--border</code>, no fill, <code>--radius-lg</code>", "flush on the frame's top-left", "none; a hairline between rows", 32, "always", "same"),
    "v2": ("Ruled", "The corner card's bottom edge runs the full width as a header rule; every arm header sits between two rules — the line you pointed at in 115353.", "hairline, no fill, <code>--radius-md</code>", "flush + a full-width rule under it (measured 638×1px in the app)", "a rule above and below each header", 32, "always", "same"),
    "v3": ("Zone", "No frame line — a faint tinted zone; each arm header is a tinted band with the condition in it.", "no stroke, 3% foreground tint", "flush", "tinted band, no rules", 28, "always", "one tone deeper"),
    "v4": ("Bracket", "A left bracket and a top rule only, open right and bottom; arms read like code — indent guide, monospace headers.", "muted-foreground left + top only", "flush", "indent guide under the header, monospace title", 26, "on hover", "same"),
    "v5": ("Card", "The frame is filled a tone off the canvas; each arm is an inset card; a nested region goes one tone deeper.", "hairline, <code>--muted</code> fill", "flush", "each arm an inset card", 30, "always", "one tone deeper"),
}

# The element-by-element stock-part table [4,5,7,14].
ELEMENTS = [
    ("Port dot, v1 scale", "18px ring beside 24px label text (“way too big”, 114919)", "xyflow <code>.react-flow__handle</code> 6×6px box, centred on the edge by <code>translate(-50%,-50%)</code> — <code>@xyflow/react/dist/style.css:250-251, 274-278</code>", "Colour means STATE (empty · default set · wired · received), per the 2026-09-10 ruling; the dot sits ON the wall."),
    ("Port dot, v2", "—", "SystemSketch <code>block-canvas.css:1099-1132</code> (12px dot, surface gap, type ring), <code>portPalette.ts</code> <code>portColorFamily</code> / <code>FAMILY_HEX</code>, <code>.BlockNode-portName</code>/<code>.BlockNode-portType</code>, <code>.Port-count</code>", "Hollow while unwired, muted with a default, type-filled when wired; the count floats over the incoming wire, never on it."),
    ("Port dot, v3", "—", "langflow <code>handleRenderComponent/index.tsx</code> (10px <code>rounded-full</code> disc, 3px pale ring, glow on hover, 32px hit target); <code>--datatype-*</code>; <code>nodeColorsName</code>", "Colour means TYPE; unknown robotics types hash into langflow's own palette instead of all-gray (ours, stated at the seam)."),
    ("Port dot, v4", "—", "React Flow UI <code>BaseHandle</code> (<code>base-handle.json</code>), <code>LabeledHandle</code> (<code>px-3</code> label), <code>DatabaseSchemaNode</code> rows <code>text-xs</code>; xyflow <code>--xy-handle-background-color-default</code>", "Quietest at rest; wired ports are the only dark marks on the wall."),
    ("Port dot, v5", "—", "ours — <code>DP - Port.md</code> three stacked circles", "The centre attach point is always visible."),
    ("Port text", "<code>sm</code> 18px / <code>md</code> 24px", "a new <code>xs</code> rung, 12px, in <code>PORT_TEXT_SIZES</code>; <code>PORT_DIAMETERS.xs = 6</code>", "“Small by default” — every variant uses the same 12px so text never jumps between them."),
    ("Producer count", "3 cables at 3 stacked offsets (115137)", "the original SystemSketch <code>.Port-count</code> idea; count from <code>producerCounts(scene)</code> (<code>src/scene/producers.ts</code>)", "One centre attach point + a number; no badge at 0 or 1 cable."),
    ("Elbow routing, React Flow host", "<code>getBezierPath</code> for every edge", "<code>@xyflow/react</code> <code>getSmoothStepPath</code> (elbow) · <code>getStraightPath</code> · <code>getBezierPath</code>, by routing", "Elbow unless a cable asks otherwise; straight/slanted/curved stay selectable."),
    ("Elbow routing, DOM canvas + tldraw + app", "<code>curved</code> default in <code>trace.tsx</code>", "ours — one constant <code>DEFAULT_TRACE_ROUTING = \"elbow\"</code> (<code>trace.layout.ts:156</code>) read by every host", "Keep-outs still collected for defaulted cables (bypass rule)."),
    ("Region v1", "the DOM render you liked (115249/115424)", "React Flow UI's Labeled Group Node look (cited at <code>region.tsx:27</code>)", "Corner block flush top-left; its dots ON the frame edge, never clipped; arms stacked with chevrons."),
    ("Region v2–v5", "—", "ours — CSS custom properties over <code>globals.css</code> tokens (<code>--border</code>, <code>--muted</code>, <code>--foreground</code>, <code>--radius-*</code>); <code>FoldingChevron</code>'s own <code>reveal</code> prop", "Same five invariants as v1; no dashed frame (the dashed placeholder was part of “unprofessional”)."),
    ("The switch, app", "a URL flag would have been the only way in", "the app kit's shadcn <code>DropdownMenu</code> + <code>DropdownMenuRadioGroup</code>/<code>DropdownMenuRadioItem</code> (Base UI)", "Bottom-right, live, remembered in <code>localStorage</code> (<code>bbox.portVariant</code>/<code>bbox.regionVariant</code>)."),
    ("The switch, Storybook", "—", "Storybook <code>globalTypes</code> toolbar + one decorator (<code>.storybook/preview.tsx</code>)", "<code>v1</code> stamps nothing, so every existing story is unchanged."),
    ("<strong>unchanged (stock seam)</strong>", "tldraw 5.3.2 shape/binding/component seams; <code>BlockPort</code>'s rail geometry; the opaque card (the host's own <code>Block</code>)", "left alone on purpose", "A variant never decides WHERE a dot sits — every one is centred on the wall by the same rail; tldraw stays stock."),
]

NEEDS = [
    ("Q1", "Pick the port style. Five are live behind the bottom-right switch; <strong>v1 Fine ring</strong> is applied.",
     "v1 or v5. v1 is the quietest that still says state; v5 makes your “one centre attach point” visible before a cable exists. v2/v3 cannot be judged fairly in the app yet (Q3).", "v1 stays applied"),
    ("Q2", "Pick the region drawing. <strong>v1 Labeled group</strong> (the For Loop reading you liked) is applied; <strong>v2 Ruled</strong> is the header line you asked about.",
     "v2 — it answers 115353 directly and keeps everything v1 does.", "v1 stays applied"),
    ("Q3", "Type colour does not reach the app's ports: <code>BlockFace.tsx</code> never passes the port's type, so v2 paints every dot amber and v3 every dot gray.",
     "Pass <code>type</code> through (a one-line change in the app's <code>BlockFace</code>) before judging v2/v3.", "not done until you pick v2 or v3"),
    ("Q4", "When a drawing with shorter arm headers is picked, members keep their absolute position, so the last arm's bottom member can hang past the frame (v4: 2px, measured).",
     "Members keep their ARM-relative position (arms are nodes); re-settle moves them with their arm.", "next lane fixes it that way"),
    ("Q5", "The producer count shows only at 2 or more cables; one cable shows no number (the dot still reads wired).",
     "Keep — a “1” on every wired port is noise.", "≥2"),
    ("Q6", "The Problems panel calls an if/else fan-in a many-to-one ERROR (“no region makes them exclusive”): the app's derived scene has no arm nodes. That is the red ⚠ 1 in the hero.",
     "Derive arm membership in the app's scene so exclusive arms stop flagging; pre-existing, not this round's.", "next lane"),
    ("Q7", "A block first measured at a zoom other than 100% puts its right-hand dots off the wall (50px at 125%). Pre-existing on main, not this round's.",
     "Fix at the measure seam (divide by zoom); it will bite any pyblocks board opened at 108%.", "next lane"),
    ("Q8", "Once picked: collapse to the chosen variant and remove the temporary pill, or keep the registry as a skin axis?",
     "Collapse to the pick and delete the pill (it is a temporary review device by your rule); keep the registry file only if you want to flip again.", "pill stays until you pick"),
    ("Q9", "Integration: <code>claude/port-region-feedback-2026-09-19</code> at <code>21bd8ef</code> is not on <code>main</code> and not in the worktree behind your :5421.",
     "Fast-forward the review worktree so :5421/:4340 show it; landing on main is your call, in those words.", "nothing lands"),
]

ISSUES = [
    ("Type colour missing in the app (v2 amber / v3 gray everywhere)",
     "<code>apps/systemsketch/src/shapes/block/BlockFace.tsx</code> never passes the port's <code>type</code>/<code>dataType</code> to the trunk port, so both by-type grammars fall back — see the v3 still in the hero section. Flagged by the switch lane; Q3.", (7, 3)),
    ("Picking a shorter-header drawing clips the last arm's bottom member — <em>found by the scribe</em>",
     "Measured at 100%: the Branch's stored height re-settles 436 → 428 (v3) → 424 (v4), while <code>keep()</code> stays at y=326 in every variant, so in v4 its card bottom (466.1) passes the frame bottom (464.1) and tldraw clips 2px (2.5px at 125%, visible in the crops below). Q4.", (12, 7)),
    ("Right-hand dots leave the wall when a block is first measured off 100% zoom — <em>found by the scribe; pre-existing</em>",
     "A block created (or first measured) at 125% stores its right anchor as <code>w × zoom</code> (187.5 for a 150px block): the dot sits 46.9–50px off the card. Created at 100% and zoomed after: 0.0px at 80/125/200%. Same numbers on the :4340 app at <code>2416d97</code>, so not this round's. The hero seeds at 100% then zooms for exactly this reason. Q7.", (12,)),
    ("Problems panel: an if/else fan-in is a many-to-one error — <em>found by the scribe; pre-existing</em>",
     "“Port … has 2 producers wired in (no region makes them exclusive)”. <code>smooth()</code> (if arm) and <code>keep()</code> (else arm) both carry <code>parentId</code> = the Branch region; the app's derived scene has zero arm nodes, so exclusivity is invisible to the check. Q6.", (12,)),
    ("React Flow host: elbow without keep-outs",
     "The host now uses React Flow's stock <code>getSmoothStepPath</code>, which has no obstacle input — the bypass-around-regions rule is proved on the DOM canvas only. <code>traceEditor.tsx</code> still defaults to <code>curved</code> (every call site passes routing explicitly).", (3,)),
    ("Region switch dirties the document",
     "Re-settling stored region heights writes the document (history ignored, so no undo step) — a switched board saves with the new heights.", (3, 7)),
    ("Storybook gallery board: a hanging port and an overprinted title",
     "In <code>Control Flow/Variant Gallery</code>, <code>src</code>'s third port (<code>gain</code>) hangs below its card and <code>merge()</code>'s top-wall <code>effect:pose</code> label prints across its title — both visible in the lane's <code>sb-port-v1</code> capture; neither is a variant defect.", (8,)),
    ("The regions lane's Storybook captures predate the 12px text",
     "Its per-variant captures were taken before the ports lane landed, so they show the old 18px dots; the app captures beside them are the merged tree. <code>merge</code>'s <code>other</code>/<code>Pose</code> label collision noted on 115424 was in no lane's scope and was not re-measured.", (8,)),
    ("Auditor minor (regions): acceptance amended in the implementation commit",
     "<code>acd92eb</code> swapped an unscoped arm query for a scoped one and widened a fixture 360→372px instead of landing those in the acceptance commit. The auditor verified it is not a weakening (the unscoped query could never pass against a correct implementation); flagged as process only.", (3,)),
    ("Producer badge size vs dot",
     "In v1 the 14px ink badge is larger than the 11px dot it counts and covers its upper-outer quadrant (a notification-badge overlap, by design at <code>portProducersOffsetPx</code>). Worth a look at canvas zoom before you pick.", (4,)),
]


# ---------------------------------------------------------------- page

def build(inline_gif: bool) -> str:
    USED.clear()
    L = LANES
    Z = lambda stamp: BRAIN / f"Pasted image 20260919{stamp}.png"  # noqa: E731

    # --- hero
    webm = HERO / "hero-960.webm"
    gif = HERO / "hero-480.gif"
    poster = HERO / "poster.jpg"
    log = json.loads((HERO / "hero-log.json").read_text())
    USED.append(str(HERO / "hero-log.json"))
    webm_uri = data_uri(webm, "video/webm")
    poster_uri = img(poster, 960)
    gif_sibling = OUT.parent / f"{REPORT_NAME}-hero.gif"
    gif_sibling.write_bytes(gif.read_bytes())
    t_start = next(t for t, s in log["log"] if s == "READY")
    step_words = {
        "block placed": "a <strong>Block</strong> placed from the dock's one System slot (a fresh block has no ports yet)",
        "wired mode → input 1 (elbow)": "press-drag <code>mode()</code> → the Branch's <code>input 1</code>: an <strong>elbow</strong>, landing on the dot that sits on the frame edge",
        "wired keep → encode.pose; badge=2": "a second cable into <code>encode().pose</code>: both meet at the dot's <strong>centre</strong> and the count reads <strong>2</strong>",
        "END": "end — both switches back on v1",
    }
    steps = []
    for t, s in log["log"]:
        if s in ("READY",):
            continue
        rel = max(0.0, t - t_start)
        m = re.match(r"(port|region) (v\d); html attr = (.*)", s)
        if m:
            which, vid, a = m.groups()
            name = (PORT_INFO if which == "port" else REGION_INFO)[vid][0]
            words = f"{'Ports' if which == 'port' else 'Regions'} → <strong>{vid} {esc(name)}</strong> <span class='dim'>(<code>&lt;html data-bbox-{which}-variant&gt;</code> = {esc(a)})</span>"
        else:
            words = step_words.get(s, esc(s))
        steps.append(f"<li><span class='t'>{rel:4.1f}s</span>{words}</li>")
    facts = log["facts"]
    # WHY the GIF is hidden and swapped in by script rather than shown under
    # the video: a second, visible copy of the same 15 s loop is noise; the
    # fallback only matters where WebM will not play (canPlayType / a source
    # error), and <video> fallback content never renders in a browser that
    # supports <video> but not VP9.
    gif_block = (f"<img id='hero-gif' src='{data_uri(gif, 'image/gif')}' alt='' hidden style='max-width:480px;margin:8px auto 0'>"
                 f"<p class='dim small'>A 480px GIF of the same clip is inlined and replaces the video automatically if WebM will not play; it is also a sibling file: <code>file://{esc(str(gif_sibling))}</code></p>"
                 if inline_gif else
                 f"<p class='dim small'>GIF fallback (480px, {gif.stat().st_size // 1024} KB) kept as a sibling file so the page stays under the preview's cap: <code>file://{esc(str(gif_sibling))}</code></p>")

    # --- Zach's screenshots
    zach = {s: img(Z(s), w) for s, w in [("114919", 560), ("114952", 560), ("115137", 560), ("115156", 412),
                                          ("115249", 420), ("115353", 420), ("115424", 480)]}
    zach["115744"] = img(Z("115744"), 78)
    # 115050 is a tall 934x935 capture; the defect is its top-left corner.
    zach["115050"] = img(Z("115050"), 480, crop=(0.0, 0.0, 0.62, 0.36))

    # --- headline table
    OUT_ROWS = [
        ("fixed", "“The ports look way too big … the port text size also seems too big … very unprofessional”", "114919",
         "Every variant now paints a 11–16px dot beside <strong>12px</strong> text (was 18px/24px); a new <code>xs</code> rung is the default. The five styles are the proposal half.", "#s3"),
        ("fixed", "“By default elbow arrows should always be used. Never straight arrows”", "114952",
         "Elbow is the default in the trunk (one constant), all three hosts and the app; straight/slanted/curved stay selectable per cable.", "#s2a"),
        ("fixed", "“Edges should always leave from the center of the port … the port only should have 1 connection point in the center”", "115137 · 115156",
         "The fan-out/fan-in spread is gone in all three hosts and the app; duplicates coincide (≤0.5px).", "#s2b"),
        ("fixed", "“Instead you should show the producer circle that has the number”", "—",
         "A count badge fed from the scene on every port with 2+ cables — DOM canvas, React Flow, tldraw and the app, live as you draw or delete.", "#s2b"),
        ("fixed", "“I want the port to be right on the edge, and it shouldn't be cut off by the frame” / “make the one in tldraw more like the DOM render”", "115050 · 115249",
         "The app's Branch corner card now sits ON the frame (was inset 8px behind a clip-path); its dot centre is on the frame edge — measured 0.00px in the hero.", "#s2c"),
        ("proposed", "“Please make 5 proposals for different visual styles for [the ports]” — one from SystemSketch, one from langflow, circular, on the edge", "115744 (not this)",
         "Five, switchable live: Fine ring · SystemSketch original · Langflow · React Flow UI pearl · Reticle. v1 applied.", "#s3"),
        ("proposed", "“Come up with 5 variants for the regions (one is adding that line header for the branches)”", "115353",
         "Five drawings over one Region: Labeled group · <strong>Ruled (the header line)</strong> · Zone · Bracket · Card. v1 applied.", "#s4"),
        ("kept", "“I really like this for loop”", "115424",
         "v1 is that look; every variant keeps the corner block flush, its dots on the edge, arms stacked with chevrons.", "#s4"),
        ("not done", "The <code>merge</code> <code>other</code>/<code>Pose</code> labels touching (noted on 115424)", "115424",
         "In no lane's scope; not re-measured on the merged tree.", "#s7"),
    ]
    head_rows = "".join(
        f"<tr><td><span class='st {k.replace(' ', '')}'>{k.upper()}</span></td><td>{q}</td><td class='dim small'>{esc(s)}</td><td>{o} <a class='jump' href='{a}'>↓</a></td></tr>"
        for k, q, s, o, a in OUT_ROWS)

    # --- ports
    port_cards = []
    for n, vid in enumerate(["v1", "v2", "v3", "v4", "v5"], 1):
        title, basis, box, painted, rings, grammar, label, hover, badge = PORT_INFO[vid]
        sb = img(L / "ports" / f"{vid}-storybook@2x.png", 520, trim=True, pad=16)
        app = img(L / "app-variant-switch" / f"app-port-{vid}.png", 640, crop=(0.03, 0.09, 0.58, 0.49))
        default = " <span class='st kept'>DEFAULT</span>" if vid == "v1" else ""
        port_cards.append(f"""
<div class="var" id="port-{vid}">
  <h3>P{n} · {vid} {esc(title)}{default}</h3>
  <p class="dim small">Based on {basis} {cite(4)}</p>
  <div class="pair">
    {fig(sb, "Storybook <code>Ports/PortVariants</code> — the same <code>estimate()</code> fixture for all five: <code>pose</code> has 3 producers, <code>cmd</code> wired, <code>done</code> received " + cite(8))}
    {fig(app, "The app (merged ports + switch), same board for all five, 1400px viewport cropped " + cite(8))}
  </div>
  <table class="spec"><tbody>
    <tr><th>Dot</th><td><strong>{box}px</strong> box · <strong>{painted}px</strong> painted ({rings})</td><th>Text</th><td>{label}</td></tr>
    <tr><th>At rest → wired</th><td colspan="3">{grammar}</td></tr>
    <tr><th>Hover</th><td>{hover}</td><th>Selected</th><td>2px blue ring, 2px out</td></tr>
    <tr><th>Producer count</th><td colspan="3">{badge}, on a 55° up-and-out ray so it clears the incoming cable</td></tr>
  </tbody></table>
  {verdict("port", f"P{n}", f"Port {vid} {title}")}
</div>""")

    # --- regions
    region_cards = []
    for n, vid in enumerate(["v1", "v2", "v3", "v4", "v5"], 1):
        title, blurb, frame, corner, arm, hpx, chev, nested = REGION_INFO[vid]
        app = img(L / "app-variant-switch" / f"app-region-{vid}.png", 560, crop=(0.225, 0.085, 0.70, 0.75))
        sb = img(L / "regions" / f"{vid}-storybook.png", 620)
        default = " <span class='st kept'>DEFAULT</span>" if vid == "v1" else ""
        callout = " <span class='st proposed'>THE HEADER LINE</span>" if vid == "v2" else ""
        extra = ""
        if vid == "v2":
            extra = f"""<div class="pair">
    {fig(zach["115353"], "Yours, 115353: “I think perhaps though you need to draw a line here..?”", "sketch")}
    {fig(img(L / "regions" / "corner-seam-v2.png", 560), "v2's corner seam: the card's bottom edge continues as the full-width rule; <code>if mode == \"fast\":</code> sits between two rules " + cite(8))}
  </div>"""
        region_cards.append(f"""
<div class="var" id="region-{vid}">
  <h3>R{n} · {vid} {esc(title)}{default}{callout}</h3>
  <p class="dim small">{blurb} {cite(5)}</p>
  {extra}
  <div class="pair reg">
    {fig(app, "The app: a Branch with a For Loop in its <code>if</code> arm, ports v1 " + cite(8))}
    {fig(sb, "Storybook <code>Control Flow/Region Variants</code>: nested Branch, the For Loop, the opaque card (captured before the 12px ports landed) " + cite(8))}
  </div>
  <table class="spec"><tbody>
    <tr><th>Frame</th><td>{frame}</td><th>Corner block</th><td>{corner}</td></tr>
    <tr><th>Arm header</th><td>{arm}; <strong>{hpx}px</strong> (measured {hpx}px in the app)</td><th>Chevron · nested</th><td>{chev} · {nested}</td></tr>
  </tbody></table>
  {verdict("region", f"R{n}", f"Region {vid} {title}")}
</div>""")

    # --- elements
    el_rows = "".join(f"<tr><td>{a}</td><td>{b}</td><td>{c}</td><td>{d}</td></tr>" for a, b, c, d in ELEMENTS)

    # --- gates
    g = {k: gate(k) for k in ("sb-typecheck", "sb-unit", "sb-test", "ss-typecheck", "ss-unit", "ss-smoke")}
    head_file = (GATES / "HEAD.txt").read_text().split()[-1][:7] if (GATES / "HEAD.txt").exists() else "?"

    def gtile(key: str, label: str, big: str | None = None) -> str:
        r = g[key]
        ok = r["ok"]
        cls = "big" if ok else "big bad"
        val = big if big is not None else (r["tests"] or ("0 errors" if ok else "FAIL"))
        sub = f"{r['files']} files · {r['dur']}" if r["files"] else ("exit 0" if ok else "no log")
        return f"<div class='gate'><div class='{cls}'>{esc(val)}</div><div class='lbl'>{label}<br><span class='dim2'>{esc(sub)}</span> {cite(10)}</div></div>"

    gates_html = "".join([
        gtile("sb-typecheck", "trunk typecheck", "0 errors" if g["sb-typecheck"]["ok"] else "FAIL"),
        gtile("sb-unit", "trunk unit tests"),
        gtile("sb-test", "trunk full gate (unit + every story in Chromium)"),
        gtile("ss-typecheck", "app typecheck", "0 errors" if g["ss-typecheck"]["ok"] else "FAIL"),
        gtile("ss-unit", "app unit tests"),
        gtile("ss-smoke", "app smoke tests (real Chromium)"),
    ])
    lane_rows = "".join(
        f"<tr><td class='n'>{i}</td><td><code>{esc(d['uid'])}</code></td><td>{esc(d['title'])}</td><td>{d['built']}</td><td>{d['audit']}</td>"
        f"<td>{esc(d['verdict'])}<br><span class='dim small'>{esc(d['findings'])}</span></td><td class='n'>{d['rounds']}</td>"
        f"<td><code>{d['tip']}</code> → <code>{d['merge']}</code></td><td class='dev'>{d['dev']}</td>"
        f"<td>{verdict('lane', f'L{i}', 'Lane ' + d['uid'])}</td></tr>"
        for i, d in enumerate(LANES_DATA, 1))

    # --- issues
    issues_html = "".join(f"<tr><td class='n'>K{i}</td><td><strong>{t}</strong><br><span class='dim'>{d}</span> {cite(*c)}</td></tr>"
                          for i, (t, d, c) in enumerate(ISSUES, 1))
    clip_pair = f"""<div class="pair narrow">
  {fig(img(HERO / 'hero-final.png', 420, crop=(0.46, 0.60, 0.66, 0.83)), "Regions v1 at 125% (hero, last frame): <code>keep()</code>'s card has its bottom border and shadow " + cite(9))}
  {fig(img(HERO / 'frame-region-v4.png', 420, crop=(0.46, 0.60, 0.66, 0.83)), "Regions v4, same board, an earlier take of the same script: the card's bottom edge is cut at the frame line " + cite(9, 12))}
</div>"""

    # --- needs
    needs_html = "".join(f"""<div class="need"><div class="need-h"><span class="tag">{q}</span>{t}</div>
<div class="need-b"><span class="lbl">Recommend</span>{r}</div><div class="need-b"><span class="lbl">If you say nothing</span>{d}</div>
{verdict("needs", q, t)}</div>""" for q, t, r, d in NEEDS)

    # --- open it
    has_round, review_head = review_worktree_has_round()
    ids = story_ids()
    story_rows = "".join(f"<li><code>{esc(i)}</code> <span class='dim small'>— {esc(f)} · {esc(e)}</span></li>" for f, e, i in ids)
    review_cmd = f"pnpm --dir {REVIEW_WORKTREE} --filter systemsketch dev"
    integ_cmd = f"pnpm --dir {INTEGRATION_WORKTREE} --filter systemsketch exec vite --port 4470 --strictPort"
    if has_round:
        fence_note = "Opens the app from the worktree behind your :5421 Storybook, which already contains this round."
        fence_cmd, fence_url = review_cmd, "http://127.0.0.1:4340"
        other = (f"<p class='dim small'>The integration worktree runs the same tree on :4470: <code>{esc(integ_cmd)}</code>. "
                 f"Stories: <code>http://127.0.0.1:5421/?path=/story/&lt;id&gt;</code>.</p>")
    else:
        fence_note = (f"Opens the merged round from the integration worktree on :4470 — the worktree behind your :5421/:4340 "
                      f"is at <code>{esc(review_head)}</code> and does <strong>not</strong> contain <code>{INTEGRATION_HEAD}</code> yet "
                      f"(checked when this page was built).")
        fence_cmd, fence_url = integ_cmd, "http://127.0.0.1:4470"
        other = (f"<p class='dim small'>Once the dispatcher fast-forwards that worktree (Q9), your usual command shows it on :4340: "
                 f"<code>{esc(review_cmd)}</code>, and the stories below open at <code>http://127.0.0.1:5421/?path=/story/&lt;id&gt;</code>. "
                 f"Re-running this builder flips this fence to that command.</p>")

    # --- sources
    sources = [
        (1, f"docs/ASK-2026-09-19-PORTS-EDGES-REGIONS-FEEDBACK.md — your feedback verbatim + the dispatcher's fix/proposal split and contracts (commit <code>36e9c08</code>)"),
        (2, "/home/bam/zach_brain/Sources/Daily Notes/Daily Note - Sep 19 2026.md §System sketch, and /home/bam/zach_brain/Pasted image 20260919{114919,114952,115050,115137,115156,115249,115353,115424,115744}.png"),
        (3, "The dispatcher's lane-result records for fix-edges, ports, regions, producers-count, app-variant-switch (status, builder, auditor, verdict, findings, fix rounds, deviations), handed to the scribe"),
        (4, "apps/storybook-basics/src/skin/portVariants.ts + portVariants.css (the five port variants, their numbers and per-variant provenance with file:line citations); components/port.layout.ts (PORT_DIAMETERS, PORT_TEXT_SIZES)"),
        (5, "apps/storybook-basics/src/skin/regionVariants.ts + regionVariants.css; components/region.tsx"),
        (6, "apps/storybook-basics/src/scene/producers.ts; apps/systemsketch/src/document/sceneFromStore.ts (documentProducerCounts, usePortProducers)"),
        (7, "apps/systemsketch/src/chrome/variantSwitch.tsx; apps/storybook-basics/.storybook/preview.tsx; reports/media/lanes-2026-09-19/app-variant-switch/measurements.json (dot boxes 6/8/10/9/12px, headers 32/32/28/26/30px, v2 rule 638×1px, pill x 910–1232, reload keeps v3/v2, no console errors)"),
        (8, "/home/bam/bbox-ui/reports/media/lanes-2026-09-19/{fix-edges,ports,regions,producers-count,app-variant-switch}/ — the lanes' own captures"),
        (9, f"reports/media/{REPORT_NAME}/hero/ — hero-960.webm (15.0s, trimmed from raw-1280x800.webm), hero-log.json (step times + end-of-run measurements), hero-final.png, frame-*.png (stills from an earlier take of the same script); script: probes/hero.mjs + seed.mjs"),
        (10, f"reports/media/{REPORT_NAME}/gates/*.log — the six gates re-run by the scribe on the merged tree at <code>{esc(head_file)}</code>, 2026-09-19 13:52–13:54"),
        (11, f"git log --oneline 36e9c08..{INTEGRATION_HEAD} on claude/port-region-feedback-2026-09-19 (the integration worktree)"),
        (12, f"reports/media/{REPORT_NAME}/probes/findings.json + zoomprobe2.mjs, clipprobe.mjs, problems.mjs, armprobe.mjs — the scribe's own measurements on :4470 (and :4340 for the zoom control)"),
        (13, "apps/storybook-basics/src/stories/{PortVariants,RegionVariants,VariantGallery,EdgeDefaults,Producers}.stories.tsx — every story id below is checked against these files at build time"),
        (14, "/home/bam/pyblocks/reports/media/react-flow-references.md — the React Flow reference list the ports lane drew v1/v4 from"),
    ]
    sources_html = "".join(f"<li id='src-{n}'><span class='n'>{n}</span>{t}</li>" for n, t in sources)

    tally = {k: sum(1 for r in OUT_ROWS if r[0] == k) for k in ("fixed", "proposed", "kept", "not done")}

    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ports, edges and regions — 2026-09-19</title>
<style>
:root {{ --bg:#0e0f12; --panel:#15171c; --panel2:#1b1e25; --line:#282d38; --line2:#343b49;
  --fg:#e6e8ee; --dim:#9aa3b2; --dim2:#6b7383; --accent:#f0883e; --accent2:#5aa9f8; --ok:#3fb950; --warn:#e5534b; --gold:#e8c06a;
  --mono: ui-monospace,"SF Mono",Menlo,Consolas,monospace; }}
* {{ box-sizing:border-box }}
body {{ margin:0; background:var(--bg); color:var(--fg); font:15px/1.55 -apple-system,"Segoe UI",Inter,Roboto,sans-serif; }}
main {{ max-width:1200px; margin:0 auto; padding:28px 24px 140px; }}
h1 {{ font-size:30px; line-height:1.15; margin:0 0 6px; letter-spacing:-.01em }}
h2 {{ font-size:22px; margin:54px 0 12px; padding-top:18px; border-top:1px solid var(--line); letter-spacing:-.01em }}
h2 .k {{ color:var(--dim2); font-weight:500; margin-right:10px; font-family:var(--mono); font-size:15px }}
h3 {{ font-size:17px; margin:26px 0 8px }}
p {{ margin:8px 0 }}
code {{ font:12.5px/1.4 var(--mono); background:#0a0b0e; border:1px solid var(--line); border-radius:4px; padding:1px 5px; color:#dfe3ea; overflow-wrap:anywhere }}
a {{ color:var(--accent2) }}
.prov {{ color:var(--dim2); font-size:13px; margin:0 0 22px }}
.dim {{ color:var(--dim) }} .dim2 {{ color:var(--dim2) }} .small {{ font-size:13px }}
.cite {{ font-size:10px; vertical-align:super; margin-left:2px }} .cite a {{ color:var(--dim2); text-decoration:none }}
.lead {{ font-size:17px; color:#d6dae3 }}
table {{ border-collapse:collapse; width:100%; font-size:13.5px; margin:10px 0 18px }}
th, td {{ border:1px solid var(--line); padding:7px 9px; vertical-align:top; text-align:left }}
th {{ background:var(--panel2); color:#cfd5e0; font-weight:600 }}
td.n, th.n {{ text-align:right; color:var(--dim); white-space:nowrap }}
td.dev {{ color:var(--dim); font-size:12.5px }}
.st {{ display:inline-block; font:600 11px/1 var(--mono); letter-spacing:.06em; padding:4px 7px; border-radius:4px; white-space:nowrap; vertical-align:middle }}
.st.fixed {{ background:#12301c; color:#5ee08a }} .st.proposed {{ background:#1a2a44; color:#8cc2ff }} .st.kept {{ background:#2a2416; color:var(--gold) }} .st.notdone {{ background:#3a1616; color:#ff8a80 }}
table.head td:first-child {{ width:108px }} table.head td:nth-child(3) {{ width:120px }} a.jump {{ text-decoration:none; color:var(--dim2) }}
figure {{ margin:0; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:8px; min-width:0 }}
figure img {{ width:100%; display:block; border-radius:6px; background:#f7f7f8 }}
figure.sketch img {{ background:#111 }}
figcaption {{ color:var(--dim); font-size:12.5px; padding:8px 4px 2px }}
.grid2 {{ display:grid; grid-template-columns:1fr 1fr; gap:14px; margin:12px 0; align-items:start }}
.grid3 {{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; margin:12px 0 }}
.pair {{ display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:10px 0; align-items:start }}
.pair.narrow {{ max-width:860px }} .pair.reg {{ grid-template-columns:0.85fr 1.15fr }}
@media (max-width:900px) {{ .grid2, .grid3, .pair {{ grid-template-columns:1fr }} }}
.hero {{ background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:12px }}
.hero video {{ width:100%; max-width:960px; display:block; margin:0 auto; border-radius:8px; background:#000 }}
.hero ol {{ columns:2; color:var(--dim); font-size:13px; margin:10px 0 0; padding-left:22px }}
.hero ol li {{ break-inside:avoid; margin-bottom:2px }}
.hero ol .t {{ font-family:var(--mono); color:var(--dim2); margin-right:8px }}
.facts {{ display:flex; flex-wrap:wrap; gap:8px; margin:10px 0 0 }}
.facts span {{ background:#0a0b0e; border:1px solid var(--line); border-radius:6px; padding:3px 8px; font:12px var(--mono); color:#cfd5e0 }}
.var {{ background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:4px 16px 14px; margin:16px 0 }}
.var h3 {{ margin-top:14px }}
table.spec {{ font-size:13px; margin:8px 0 4px }} table.spec th {{ width:120px; background:transparent; color:var(--dim) }}
.gates {{ display:grid; grid-template-columns:repeat(6,1fr); gap:10px; margin:12px 0 }}
@media (max-width:1000px) {{ .gates {{ grid-template-columns:repeat(3,1fr) }} }}
.gate {{ background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:10px 12px }}
.gate .big {{ font:600 22px/1.1 var(--mono); color:#5ee08a }} .gate .big.bad {{ color:#ff8a80 }} .gate .lbl {{ color:var(--dim); font-size:12px; margin-top:4px }}
table.lanes {{ table-layout:fixed }} table.lanes td {{ overflow-wrap:anywhere }}
table.lanes th:nth-child(1) {{ width:30px }} table.lanes th:nth-child(2) {{ width:110px }} table.lanes th:nth-child(4), table.lanes th:nth-child(5) {{ width:70px }}
table.lanes th:nth-child(6) {{ width:100px }} table.lanes th:nth-child(7) {{ width:58px }} table.lanes th:nth-child(8) {{ width:110px }} table.lanes th:nth-child(10) {{ width:190px }}
table.lanes td .v {{ flex-direction:column; align-items:stretch }} table.lanes td .v textarea {{ flex:0 0 auto; min-width:0; width:100%; height:54px }}
table.issues td.n {{ width:40px }}
.need {{ background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 14px; margin:10px 0 }}
.need-h {{ font-size:15px; margin-bottom:8px }}
.need .tag {{ font:600 12px/1 var(--mono); background:#2a2416; color:var(--gold); padding:4px 7px; border-radius:4px; margin-right:8px }}
.need-b {{ color:#cfd5e0; font-size:14px; margin:4px 0 }} .need-b .lbl {{ color:var(--dim2); font:600 11px var(--mono); letter-spacing:.06em; text-transform:uppercase; margin-right:8px }}
.default {{ background:#12301c33; border:1px solid #2f7a45; border-radius:10px; padding:10px 14px; margin:12px 0; color:#cfe9d6 }}
.v {{ display:flex; gap:6px; align-items:flex-start; flex-wrap:wrap; margin-top:10px }}
.v button {{ background:#0a0b0e; color:#cfd5e0; border:1px solid var(--line2); border-radius:6px; padding:4px 10px; font-size:12.5px; cursor:pointer }}
.v button[aria-pressed="true"][data-v="approve"] {{ background:#12301c; border-color:#2f7a45; color:#5ee08a }}
.v button[aria-pressed="true"][data-v="change"] {{ background:#3a2f0f; border-color:#8a6d1c; color:var(--gold) }}
.v button[aria-pressed="true"][data-v="reject"] {{ background:#3a1616; border-color:#8a2c2c; color:#ff8a80 }}
.v textarea {{ flex:1 1 220px; min-width:160px; background:#08090b; color:var(--fg); border:1px solid var(--line); border-radius:6px; padding:4px 8px; font:12.5px/1.4 var(--mono); resize:vertical }}
.open table {{ table-layout:fixed }} .open td:first-child {{ width:210px }} .open td {{ overflow-wrap:anywhere }}
ul.stories {{ list-style:none; padding:0; margin:0 }} ul.stories li {{ padding:3px 0; border-bottom:1px dashed var(--line) }}
pre.cmd {{ background:#08090b; border:1px solid var(--line); border-radius:8px; padding:10px 12px; font:13px/1.5 var(--mono); white-space:pre-wrap; word-break:break-all; margin:6px 0 }}
ul.src {{ list-style:none; padding:0; font-size:13px; color:var(--dim) }} ul.src li {{ padding:4px 0; border-bottom:1px dashed var(--line); overflow-wrap:anywhere }} ul.src .n {{ display:inline-block; min-width:28px; color:var(--accent2); font-family:var(--mono) }}
.dock {{ position:fixed; left:0; right:0; bottom:0; background:#0a0b0ee6; backdrop-filter:blur(8px); border-top:1px solid var(--line2); padding:10px 24px; display:flex; gap:12px; align-items:center; z-index:9 }}
.dock .tally {{ color:var(--dim); font-size:13px; flex:1 }}
.dock button {{ background:#0a0b0e; color:#cfd5e0; border:1px solid var(--line2); border-radius:6px; padding:7px 14px; cursor:pointer }}
.dock button.go {{ background:var(--accent); color:#111; border-color:var(--accent); font-weight:600 }}
.overall textarea, #out {{ width:100%; background:#08090b; color:var(--fg); border:1px solid var(--line2); border-radius:8px; padding:10px 12px; font:13px/1.55 var(--mono) }}
.overall textarea {{ min-height:80px }} #out {{ min-height:260px; margin-top:10px }}
#outwrap {{ display:none }} #outwrap.open {{ display:block }}
ul.tight li {{ margin:4px 0 }}
</style></head>
<body><main>
<h1>Ports, edges and regions — your feedback on the overnight build, answered</h1>
<p class="prov">Written by Claude Opus 5 (scribe), 2026-09-19. Lanes built by Opus 5, the regions lane by Fable 5.1; audits by Sonnet 5 and Opus 5 because Fable hit its usage limit (the lane records name Sonnet 5 as the auditor of record on all five) {cite(3)}. Every bare number after a claim is a source in the index at the bottom. The hero and the four measured issues marked <em>found by the scribe</em> are new captures made on the merged tree; every other capture is the lanes' own.</p>
<p class="lead"><strong>{tally['fixed']} of your points are fixed, {tally['proposed']} are five-way proposals you can flip live in the app, {tally['kept']} is kept, {tally['not done']} is not done.</strong> Elbow is the default everywhere, every cable meets a port at its centre with a count badge, and the tldraw Branch now matches the DOM render. The five port styles and five region drawings sit behind a bottom-right switch, with <strong>v1 of each already applied</strong>, so if you pick nothing nothing changes. Five lanes, all audited PASS (one after a fix round), merged on <code>claude/port-region-feedback-2026-09-19</code> at <code>{INTEGRATION_HEAD}</code>; all six gates are green on the merged tree {cite(3, 10, 11)}. It is <strong>not</strong> on main and not yet in the worktree behind your :5421 (Q9) — <a href="#s9">open it ↓</a>.</p>
<table class="head"><thead><tr><th>Outcome</th><th>What you said {cite(1, 2)}</th><th>Your screenshot</th><th>What happened</th></tr></thead><tbody>{head_rows}</tbody></table>

<h2 id="s1"><span class="k">01</span>The merged app, driven</h2>
<div class="hero">
  <video id="hero-video" poster="{poster_uri}" controls muted loop autoplay playsinline><source src="{webm_uri}" type="video/webm"></video>
  <p class="dim small" style="margin:10px 0 0">15.0 s, muted, loops. Recorded headless with Playwright against the real app served from the integration worktree at <code>{INTEGRATION_HEAD}</code> on :4470, 1280×800 at 125% zoom; every step is a real pointer gesture (the arrow is drawn from the page's own pointer events — headless video has no cursor). The board was seeded through the app's editor before the clip starts {cite(9)}.</p>
  <ol>{''.join(steps)}</ol>
  <div class="facts"><span>end of run: {facts['wires']} wires</span><span>badges: {esc(', '.join(facts['producers']))}</span><span>encode().pose dot centre − card left = {facts['encodePoseDotCentreMinusCardLeft']}px</span><span>Branch input 1 dot centre − frame left = {facts['branchInputDotCentreMinusFrameLeft']}px</span><span>console errors: {len(log['errors'])}</span></div>
  {gif_block}
</div>
<p class="dim small">The red <strong>⚠ 1</strong> that appears after the second cable is the Problems panel calling that if/else fan-in a many-to-one error — a pre-existing check that cannot see arms in the app (K4, Q6), not something this round added {cite(12)}.</p>

<h2 id="s2"><span class="k">02</span>The fixes, before → after</h2>
<h3 id="s2a">Elbow by default — never straight</h3>
<div class="grid3">
  {fig(zach["114952"], "Yours, 114952: straight arrows between blocks (Rung A story)", "sketch")}
  {fig(img(L / "fix-edges" / "a-straight-before.png", 560), "Before (base of the round): the same story, straight chords " + cite(8))}
  {fig(img(L / "fix-edges" / "a-elbow-after.png", 560), "After: elbow for every cable that does not ask for a routing; <code>Other → Other2</code> is level, so its elbow is a straight run " + cite(8))}
</div>
<p class="dim small">One constant, <code>DEFAULT_TRACE_ROUTING = "elbow"</code> in <code>trace.layout.ts</code>, read by <code>trace.tsx</code> (was <code>curved</code>), <code>wireLayer.tsx</code>, the tldraw host and the React Flow host (was <code>getBezierPath</code> for every edge; now <code>getSmoothStepPath</code> / <code>getStraightPath</code> / <code>getBezierPath</code> by routing). Acceptance <code>EdgeDefaults/ElbowIsTheDefault</code> was red on the base first {cite(3, 13)}. These fix-edges captures predate the 12px ports, hence the big dots.</p>

<h3 id="s2b">One centre attach point, and the count instead of the spread</h3>
<div class="grid2">
  {fig(zach["115137"], "Yours, 115137: three cables leave <code>pose</code> at three stacked offsets", "sketch")}
  {fig(zach["115156"], "Yours, 115156: two cables enter a port at two different points", "sketch")}
  {fig(img(L / "fix-edges" / "b-spread-before.png", 560, crop=(0.05, 0.25, 0.9, 0.6)), "Before: two duplicate cables between the same dots fanned 14px apart " + cite(8))}
  {fig(img(L / "fix-edges" / "b-centre-after.png", 560, crop=(0.05, 0.25, 0.9, 0.6)), "After: they coincide at each dot's centre (the app's smoke test that asserted ≥8px fan-apart was inverted to ≤0.5px) " + cite(3, 8))}
</div>
<div class="grid2">
  {fig(img(L / "producers-count" / "app-fan-in-3-fan-out-3.png", 620, crop=(0.05, 0.12, 0.86, 0.8)), "The app, merged: three cables into <code>estimate().pose</code> and three out of <code>out</code>, all at the centre; each port wears a <strong>3</strong> " + cite(6, 8))}
  {fig(img(L / "producers-count" / "app-fan-in-3.png", 560), "Close-up: the badge rides the dot on a 55° up-and-out ray, clear of the cables it counts " + cite(4, 8))}
</div>
<p class="dim small"><code>producerCounts(scene)</code> counts every cable END at a port, in and out, whatever the edge kind; duplicates each count; one cable shows no number. The three hosts and the app compute it from the same scene they paint, so an opaque card's promoted port counts the cables re-pointed at it {cite(3, 6)}.</p>

<h3 id="s2c">The tldraw Branch, drawn like the DOM render</h3>
<div class="grid2">
  {fig(zach["115050"], "Yours, 115050: the corner block inset from the frame, <code>input 1</code> cut off by the frame edge", "sketch")}
  {fig(img(L / "fix-edges" / "c-dom-reference.png", 480, crop=(0, 0, 0.62, 0.42)), "The DOM render you called desired (115249), re-shot: corner block flush, <code>mode</code> dot on the edge " + cite(8))}
  {fig(img(L / "fix-edges" / "c-tldraw-before.png", 480, crop=(0.05, 0.05, 0.62, 0.35)), "App before: an 8px inset and a <code>clip-path: polygon(-8px …)</code> slicing the dot " + cite(3, 8))}
  {fig(img(L / "fix-edges" / "c-tldraw-after.png", 480, crop=(0.05, 0.05, 0.62, 0.35)), "App after: the corner card sits ON the frame and nothing clips its dots " + cite(3, 8))}
</div>

<h2 id="s3"><span class="k">03</span>Five port styles — all circular, all on the edge, all 12px text</h2>
<div class="pair">
  {fig(zach["114919"], "Yours, 114919: “the ports look way too big … the port text size also seems too big”", "sketch")}
  {fig(img(HERO / "hero-final.png", 620, crop=(0.02, 0.1, 0.70, 0.62)), "The merged app today, v1 at 125% zoom (hero, last frame): 11px painted dots on the wall, 12px labels, elbows " + cite(9))}
</div>
<p>What every variant shares: the dot is centred ON the block wall by the same rail (never inset like 115744 <img src="{zach['115744']}" alt="" style="height:40px;vertical-align:middle;border-radius:4px;image-rendering:pixelated">), the label is 12px, and a selected port gets the same 2px blue ring. What they vary: dot scale (11 → 16px painted), fill grammar, whether colour means <em>state</em> or <em>type</em>, typeface and weight {cite(4)}.</p>
{fig(img(L / "ports" / "states-all-variants@2x.png", 1100), "Every variant × every state, Storybook <code>Ports/PortVariants/StatesAllVariants</code>: empty · default set · wired · data received · selected · producers = 3 " + cite(8, 13))}
<div class="grid2" style="margin-top:12px">
  {fig(img(L / "ports" / "v1-hover@3x.png", 360), "Hover, v1 (real pointer): ×1.35 and a soft halo " + cite(8))}
  {fig(img(HERO / "frame-port-v3.png", 560, crop=(0.0, 0.1, 0.72, 0.62)), "v3 in the app, from the hero take: every dot the same gray — type never reaches the app's ports (K1, Q3) " + cite(9))}
</div>
{''.join(port_cards)}

<h2 id="s4"><span class="k">04</span>Five region drawings — one with the header line</h2>
<p>What every drawing keeps, measured per variant by <code>RegionVariants.stories.tsx</code>: the corner block flush with the frame's top-left, its dots ON the frame edge and never clipped, arms stacked under it and folded by the chevron, the For Loop reading you liked, and the opaque card (the host's own <code>Block</code>, not a variant axis). No drawing uses a dashed frame — that placeholder was part of “unprofessional” {cite(5, 13)}.</p>
<div class="grid2">
  {fig(zach["115424"], "Yours, 115424: “I really like this for loop” — the anchor for all five", "sketch")}
  {fig(zach["115249"], "Yours, 115249: the nested Branch in the DOM render — “this is desired”", "sketch")}
</div>
{''.join(region_cards)}

<h2 id="s5"><span class="k">05</span>The stock parts, element by element</h2>
<p class="dim small">What each variant and fix reuses, by its exact name, and the behaviour that has to survive whichever you pick {cite(4, 5, 7, 14)}.</p>
<table><thead><tr><th>Element</th><th>Before this round</th><th>Off-the-shelf part (exact name)</th><th>Behaviour that must survive</th></tr></thead><tbody>{el_rows}</tbody></table>

<h2 id="s6"><span class="k">06</span>Gates and lanes</h2>
<div class="gates">{gates_html}</div>
<p class="dim small">Re-run by the scribe on the merged tree at <code>{esc(head_file)}</code> (the integration worktree, clean before and after) — the lanes' own gate tails were per-lane; these are the joint ones {cite(10)}.</p>
<table class="lanes"><thead><tr><th class="n">#</th><th>Lane</th><th>What</th><th>Built by</th><th>Audited by</th><th>Verdict</th><th class="n">Fixes</th><th>Tip → merge</th><th>Deviation worth knowing</th><th>Your call</th></tr></thead><tbody>{lane_rows}</tbody></table>
<p class="dim small">Merge order on the integration branch: fix-edges → regions → ports → producers-count → app-variant-switch {cite(11)}. The switch lane branched before producers-count landed, so its own captures show no badges; the hero shows both together.</p>

<h2 id="s7"><span class="k">07</span>Known issues and minor findings</h2>
<table class="issues"><tbody>{issues_html}</tbody></table>
{clip_pair}

<h2 id="s8"><span class="k">08</span>The decision surface</h2>
<div class="default"><strong>If you say nothing:</strong> ports <strong>v1 Fine ring</strong> and regions <strong>v1 Labeled group</strong> stay applied — they are the defaults already, so ignoring this page changes nothing. Every other default is on its question below.</div>
<h3>Done and proved</h3>
<ul class="tight">
  <li>Elbow by default in the trunk, all three hosts and the app; one centre attach point everywhere; duplicates coincide — captures in 02, acceptance red on the base first {cite(3, 8)}.</li>
  <li>The producer count from the scene on DOM canvas, React Flow, tldraw and the app, live: 2 appears on the second cable in the hero {cite(6, 9)}.</li>
  <li>The app's Branch corner card on the frame, its dot centre on the frame edge (0.00px, measured in the hero) {cite(9)}.</li>
  <li>Five port styles and five region drawings, switchable live from the bottom-right pill and a Storybook toolbar, remembered across a reload {cite(7)}.</li>
  <li>All six gates green on <code>{INTEGRATION_HEAD}</code>: trunk {g['sb-test']['tests']} tests, app {g['ss-smoke']['tests']} smoke + {g['ss-unit']['tests']} unit {cite(10)}.</li>
</ul>
<h3>Left</h3>
<ul class="tight">
  <li><strong>Next, not blocked:</strong> type colour into the app's ports (Q3); members follow their arm on a drawing switch (Q4); the Problems panel's arm blindness (Q6); the zoom-measure bug (Q7); keep-outs for the React Flow host's elbow.</li>
  <li><strong>Blocked on you:</strong> the two picks (Q1, Q2), then collapsing to them (Q8).</li>
  <li><strong>Integration:</strong> your call (Q9).</li>
</ul>
<h3>The five port styles</h3>
<p class="dim small">Verdict buttons are on each card in section 03: {' · '.join(f'<a href="#port-{v}">P{i} {v} {esc(PORT_INFO[v][0])}</a>' for i, v in enumerate(PORT_INFO, 1))}.</p>
<h3>The five region drawings</h3>
<p class="dim small">Verdict buttons are on each card in section 04: {' · '.join(f'<a href="#region-{v}">R{i} {v} {esc(REGION_INFO[v][0])}</a>' for i, v in enumerate(REGION_INFO, 1))}.</p>
<h3>Needs you — each with a recommendation and the reversible default</h3>
{needs_html}
<h3>Deliberately not done</h3>
<ul class="tight">
  <li>Nothing merged to <code>main</code>, nothing pushed, the worktree behind your :5421 untouched — implementing is not integrating.</li>
  <li>No fix for the four measured issues — each is outside the five lanes' write sets and gets its own lane on your say-so.</li>
  <li>The regions lane's Storybook captures were not re-shot with the 12px ports; the app captures and the hero are the merged tree.</li>
  <li>Your 13:48 note about the right-corner menu sitting over “Get a license for production” is a separate ask (the dock lane's), not this round — the pill sits in that same row.</li>
</ul>

<h2 id="s9"><span class="k">09</span>Open it</h2>
<div class="open">
<table><tbody>
<tr><td>📄 This report</td><td><code>file://{esc(str(OUT))}</code></td></tr>
<tr><td>🎞 GIF fallback</td><td><code>file://{esc(str(gif_sibling))}</code></td></tr>
<tr><td>📚 Storybook stories (verified in the merged tree's story files)</td><td><ul class="stories">{story_rows}</ul></td></tr>
<tr><td>🖱 The app, with the switch bottom-right</td><td><p class="dim small" style="margin:0"><em>{fence_note}</em></p><pre class="cmd">{esc(fence_cmd)}</pre>then <code>{fence_url}</code>{other}</td></tr>
</tbody></table>
</div>
<div class="overall">
<h3>Anything else</h3>
<p class="dim small">Goes at the top of the copied markdown.</p>
<textarea id="fb-overall" spellcheck="false" placeholder="your call…"></textarea>
</div>
<div id="outwrap"><h3>Your feedback, as markdown</h3><p class="dim small" id="status"></p><textarea id="out" spellcheck="false"></textarea></div>

<h2 id="s10"><span class="k">10</span>Source index</h2>
<ul class="src">{sources_html}</ul>
</main>
<div class="dock"><span class="tally" id="tally">nothing marked yet — silence keeps v1 / v1</span><button id="clear">Clear</button><button class="go" id="copy">Copy feedback</button></div>
<script>
(function () {{
  var v = document.getElementById("hero-video"), gif = document.getElementById("hero-gif");
  function toGif() {{ if (gif) {{ gif.hidden = false; gif.style.display = "block"; v.style.display = "none"; }} }}
  try {{ if (!v.canPlayType || !v.canPlayType('video/webm; codecs="vp9"')) toGif(); }} catch (e) {{ toGif(); }}
  var src = v.querySelector("source"); if (src) src.addEventListener("error", toGif);
}})();
(function () {{
  var KEY = "fb:{REPORT_NAME}";
  var state = {{}};
  try {{ state = JSON.parse(localStorage.getItem(KEY) || "{{}}") || {{}}; }} catch (e) {{ state = {{}}; }}
  function save() {{ try {{ localStorage.setItem(KEY, JSON.stringify(state)); }} catch (e) {{}} }}
  var items = Array.prototype.slice.call(document.querySelectorAll(".v"));
  function paint(el) {{
    var s = state[el.dataset.key] || {{}};
    el.querySelectorAll("button").forEach(function (b) {{ b.setAttribute("aria-pressed", String(s.v === b.dataset.v)); }});
    var ta = el.querySelector("textarea"); if (ta && ta.value !== (s.note || "")) ta.value = s.note || "";
  }}
  items.forEach(function (el) {{
    paint(el);
    el.querySelectorAll("button").forEach(function (b) {{
      b.addEventListener("click", function () {{
        var k = el.dataset.key; state[k] = state[k] || {{}};
        state[k].v = (state[k].v === b.dataset.v) ? "" : b.dataset.v; save(); paint(el); tally();
      }});
    }});
    var ta = el.querySelector("textarea");
    ta.addEventListener("input", function () {{ var k = el.dataset.key; state[k] = state[k] || {{}}; state[k].note = ta.value; save(); tally(); }});
  }});
  var overall = document.getElementById("fb-overall");
  overall.value = state.__overall || "";
  overall.addEventListener("input", function () {{ state.__overall = overall.value; save(); tally(); }});
  function tally() {{
    var n = 0, notes = 0;
    items.forEach(function (el) {{ var s = state[el.dataset.key] || {{}}; if (s.v) n++; if (s.note) notes++; }});
    document.getElementById("tally").textContent = n || notes ? (n + " verdict" + (n === 1 ? "" : "s") + ", " + notes + " note" + (notes === 1 ? "" : "s")) : "nothing marked yet — silence keeps v1 / v1";
  }}
  tally();
  function markdown() {{
    var out = ["# Feedback — ports, edges and regions (2026-09-19)", ""];
    if (state.__overall) out.push(state.__overall.trim(), "");
    function section(title, kind) {{
      var rows = items.filter(function (el) {{ return el.dataset.kind === kind; }}).map(function (el) {{
        var s = state[el.dataset.key] || {{}}; if (!s.v && !s.note) return null;
        return "- **" + el.dataset.num + " · " + el.dataset.title + "** — " + (s.v ? s.v.toUpperCase() : "(no verdict)") + (s.note ? " — " + s.note.trim() : "");
      }}).filter(Boolean);
      if (rows.length) out.push("## " + title, "", rows.join("\\n"), "");
    }}
    section("Port styles", "port"); section("Region drawings", "region"); section("Needs you", "needs"); section("Lanes", "lane");
    if (out.length === 2) out.push("_(nothing marked — the defaults stand: ports v1 Fine ring, regions v1 Labeled group)_");
    return out.join("\\n");
  }}
  function show(text, msg) {{
    var wrap = document.getElementById("outwrap"), ta = document.getElementById("out");
    ta.value = text; wrap.classList.add("open"); wrap.scrollIntoView({{ block: "center" }}); ta.focus(); ta.select();
    document.getElementById("status").textContent = msg;
  }}
  function copy() {{
    var text = markdown();
    var done = function () {{ show(text, "Copied to the clipboard — and selected below, in case the clipboard refused (file:// often does)."); }};
    var fail = function () {{ show(text, "The clipboard refused on this origin — the text is selected below; press Ctrl-C / ⌘C."); }};
    try {{ if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fail); else fail(); }} catch (e) {{ fail(); }}
  }}
  document.getElementById("copy").addEventListener("click", copy);
  document.getElementById("clear").addEventListener("click", function () {{ state = {{}}; save(); items.forEach(paint); overall.value = ""; tally(); }});
}})();
</script>
</body></html>"""
    return page


def encoded_size(page: str) -> int:
    return len("data:text/html,") + len(quote(page, safe=URI_SAFE).encode())


def main() -> int:
    page = build(inline_gif=True)
    enc = encoded_size(page)
    if enc >= CAP:
        print(f"with the GIF inline the encoded size is {enc:,} >= {CAP:,}; rebuilding with the GIF as a sibling file")
        page = build(inline_gif=False)
        enc = encoded_size(page)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(page)
    disk = OUT.stat().st_size
    print(f"wrote {OUT}")
    print(f"bytes on disk: {disk:,}")
    print(f"bytes encoded (data:text/html,encodeURIComponent): {enc:,} / {CAP:,} ({enc / CAP:.0%}) -> {'OK, opens in the preview' if enc < CAP else 'OVER CAP - browser only'}")
    print(f"media inlined: {len(USED)}")
    for u in USED:
        print("  ", u)
    return 0 if enc < CAP else 1


if __name__ == "__main__":
    sys.exit(main())
