#!/usr/bin/env python3
"""Builds the review for the five port-edge implementations.

Zach, 2026-09-12: "The ports are buggy when you move them though — stretching
to strange dimensions. I think before we integrate this into the block, let's
please get the 'port edge' component working. Basically that is something that
should look like this: claude/dndkit-lab. Please make 5 proposals for how you
think you could implement the port edge component."

Every capture and every number below comes from
reports/media/port-edge-v5-<date>/manifest.json, written by
demos/capture-port-edge-v5.mjs driving the real page in headless Chrome with
real mouse events; the hero loop is real frames of one real drag, recorded by
demos/capture-port-edge-v5-hero.mjs. Line counts and assertion counts are
measured at build time from the live tree, so the page cannot drift from it.

Writes to the MAIN checkout's reports/media/, never the worktree.
"""
from __future__ import annotations

import base64
import io
import json
import pathlib
import subprocess

from PIL import Image, ImageChops

DATE = "2026-09-12"
NAME = f"port-edge-v5-{DATE}"
REPO = pathlib.Path("/home/bam/bbox-ui")
MEDIA = pathlib.Path(__import__("os").environ.get("SYSTEMSKETCH_REPORT_MEDIA_DIR", REPO / "reports" / "media" / NAME))
OUT = pathlib.Path(__import__("os").environ.get("SYSTEMSKETCH_REPORT_OUTPUT", REPO / "reports" / "media" / f"{NAME}.html"))
HERE = pathlib.Path(__file__).resolve().parent.parent

manifest = json.loads((MEDIA / "manifest.json").read_text())
by = {(m["variant"], m["theme"], m["host"]): m for m in manifest}
VARIANT_IDS = []
for m in manifest:
    if m["variant"] not in VARIANT_IDS:
        VARIANT_IDS.append(m["variant"])


# ------------------------------------------------------------------ #
# image helpers                                                        #
# ------------------------------------------------------------------ #

def crop_content(im: Image.Image, margin: int = 26, frame: int = 6) -> Image.Image:
    """Crop a viewport capture to what is actually drawn on it."""
    inner = im.crop((frame, frame, im.width - frame, im.height - frame))
    background = Image.new("RGB", inner.size, inner.getpixel((inner.width - 1, inner.height - 1)))
    box = ImageChops.difference(inner, background).point(lambda v: 255 if v > 22 else 0).getbbox()
    if not box:
        return im
    left, top, right, bottom = box
    return im.crop(
        (max(0, left + frame - margin), max(0, top + frame - margin),
         min(im.width, right + frame + margin), min(im.height, bottom + frame + margin))
    )


def shot(file: str | None, width: int = 760) -> str | None:
    if not file or not (MEDIA / file).exists():
        return None
    im = crop_content(Image.open(MEDIA / file).convert("RGB"))
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=84)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


def build_hero_gif(width: int = 880) -> tuple[str, str]:
    """Assemble the recorded drag frames into one animated GIF plus a poster.

    Real frames of a real gesture — no fabricated animation. Frames are
    cropped identically (the recorder already clipped to a fixed rect, so a
    per-frame content crop would make the loop jump)."""
    meta = json.loads((MEDIA / "hero" / "hero.json").read_text())
    frames = []
    for name in meta["frames"]:
        im = Image.open(MEDIA / "hero" / name).convert("RGB")
        if im.width > width:
            im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        frames.append(im)
    buf = io.BytesIO()
    frames[0].save(
        buf, "GIF", save_all=True, append_images=frames[1:], duration=70, loop=0, optimize=True,
    )
    gif = "data:image/gif;base64," + base64.b64encode(buf.getvalue()).decode()
    pbuf = io.BytesIO()
    frames[0].save(pbuf, "WEBP", quality=86)
    poster = "data:image/webp;base64," + base64.b64encode(pbuf.getvalue()).decode()
    return gif, poster


def wc(path: str) -> int:
    f = HERE / path
    return len(f.read_text().splitlines()) if f.exists() else 0


def count(path: str, pattern: str) -> int:
    out = subprocess.run(["grep", "-c", pattern, str(HERE / path)], capture_output=True, text=True)
    return int(out.stdout.strip() or 0)


def stock_hits(path: str, names: list[str]) -> int:
    """How many distinct dnd-kit exports a variant actually imports."""
    src = (HERE / path).read_text()
    return sum(1 for n in names if n in src)


DND_EXPORTS = [
    "DndContext", "DragOverlay", "PointerSensor", "useSensor", "useSensors", "useDraggable",
    "useDroppable", "useDndMonitor", "closestCenter", "pointerWithin", "SortableContext",
    "useSortable", "horizontalListSortingStrategy", "verticalListSortingStrategy", "CSS",
    "CollisionDetection", "arrayMove",
]

# ------------------------------------------------------------------ #
# content                                                              #
# ------------------------------------------------------------------ #

VARIANTS = {
    "v1-lane-sortable": dict(
        label="V1 · Lane Sortable",
        file="packages/panel/src/portEdges/v1-laneSortable.tsx",
        thesis="Port the lab as-is. One SortableContext per edge with dnd-kit's own list-sorting strategies; the cross-edge move is committed LIVE in <code>onDragOver</code> — the canonical multi-container recipe — so the lane you enter re-evens under the pointer and the lane you left closes its gap while you are still holding the port.",
        decisions=[
            "<strong>onDragOver commits, not onDragEnd.</strong> That is the lab's whole feel. The cost: a drag released outside every lane has already moved the port.",
            "<strong>A collapsed group is ONE sortable item.</strong> Rigid group movement is then not a feature — it is what sorting a slot already does.",
            "<strong>Custom mode drops the SortableContext entirely</strong> and becomes a plain droppable lane with absolutely-positioned cards. A sorting strategy has nothing to say about freely-positioned cards, and forcing one on them is how you get a card that snaps back.",
        ],
        best="You want the lab, in the product, with as little of this code being ours as possible — and you value the neighbours parting live while you drag.",
        loses="A gesture that ends nowhere still moved something. And the two layout engines (flex in auto, absolute in custom) are genuinely different code paths inside one variant.",
    ),
    "v2-lane-math": dict(
        label="V2 · Lane Math",
        file="packages/panel/src/portEdges/v2-laneMath.tsx",
        thesis="The smallest thing that can work. dnd-kit contributes two hooks and a sensor; everything else is the placement model's own lane math, resolved once, at drop, from the pointer. There is no overlay and no clone — the thing moving under the cursor IS the port.",
        decisions=[
            "<strong>No DragOverlay at all.</strong> The live card translates by <code>transform</code>, divided by the host's zoom. The whole stretch class of bug is unreachable rather than fixed.",
            "<strong>The model is written once, on drop.</strong> Nothing reflows mid-drag — the honest trade for having no ghost, since a live reflow would move the very element the pointer is holding.",
            "<strong><code>pointerWithin</code>, not <code>closestCenter</code>.</strong> A lane is a long thin band whose geometric centre can sit far from a pointer that is solidly inside it.",
        ],
        best="You want the least machinery, the least surface area, and a drag that is obviously the port itself rather than a picture of it.",
        loses="Nothing previews. Until you release, the lane gives you no promise about where the port will land beyond the highlighted band.",
    ),
    "v3-slot-droppables": dict(
        label="V3 · Slot Droppables",
        file="packages/panel/src/portEdges/v3-slotDroppables.tsx",
        thesis="Make the insertion point itself a droppable. A lane with n cards renders n+1 named gaps (<code>owner:gap:top:2</code>), so dnd-kit's own collision answers “where does this land” with a string — there is no pointer arithmetic to get wrong, the hovered gap opens to preview the insert, and a test asserts a name instead of a pixel.",
        decisions=[
            "<strong>The gaps ARE the spacing.</strong> <code>justify-content</code> is switched off in auto mode and the equal spacing comes out of equal <code>flex-grow</code>, which is what makes the space between two ports a thing you can hover.",
            "<strong>The hovered gap grows and shows an insertion rule</strong> — the only live preview of the five that costs no model write.",
            "<strong>Custom mode renders no gaps at all</strong> and falls back to pointer → <code>t</code>. Named targets and free positioning are different questions; pretending otherwise gives you a card that snaps to a slot it was never dropped in.",
        ],
        best="You care most that the interaction is legible and testable, and you like the lane parting to show you the slot before you commit.",
        loses="The most DOM of the five (2n+1 nodes per lane), and two spacing implementations to keep agreeing — flex-grow in auto, <code>t</code> in custom.",
    ),
    "v4-rubber-band": dict(
        label="V4 · Rubber Band",
        file="packages/panel/src/portEdges/v4-rubberBand.tsx",
        thesis="There is no drag state, only a sequence of placements. Every <code>onDragMove</code> writes the model, so the port literally slides along the wall and the lane re-evens live underneath it. Releasing changes nothing, because what you are looking at is already committed.",
        decisions=[
            "<strong>No ghost and no transform on the card.</strong> The element moves because its <code>t</code> changed, not because CSS moved it — the only variant where the thing under the cursor and the thing in the model are never out of step.",
            "<strong>Hysteresis, not throttling.</strong> A commit happens only when the computed target differs from the last one; without it auto mode oscillates, because re-evening moves the very centres the index is counted from.",
            "<strong><code>nearestLiveEdge</code> decides the edge, not dnd-kit's collision.</strong> Collision is a discrete “am I over it” question; a rubber band needs a continuous “which wall am I closest to” one, over lanes being re-laid-out every frame.",
        ],
        best="You want the most direct manipulation available — dragging a port feels like moving a bead on a wire, and undo has exactly one thing to undo per gesture… which is also the problem.",
        loses="Every intermediate position is a real state write. Undo, autosave and any future collaborative cursor all see the whole sweep, not the drop.",
    ),
    "v5-page-space": dict(
        label="V5 · Page Space",
        file="packages/panel/src/portEdges/v5-pageSpace.tsx",
        thesis="Delete flexbox. A lane is a measured line; a port sits at <code>t</code> along it in BOTH modes; a drop is <code>t</code> read back off the same line. The component computes every position itself instead of asking the browser where the browser put things — which is exactly why it is identical in a React Flow node at 1.5 and a tldraw shape at 2.5.",
        decisions=[
            "<strong>Auto mode renders from <code>t</code> too.</strong> <code>refresh()</code> already keeps <code>t</code> equal to the even-spacing closed form, so <code>justify-evenly</code> is a second implementation of a number the model already holds. This is the load-bearing difference — and a visible one: <code>evenT</code> spaces port CENTRES, flex spaces card BOXES.",
            "<strong>A custom <code>collisionDetection</code></strong> — nearest lane by page-space rect distance — replaces <code>closestCenter</code>/<code>pointerWithin</code>. It degrades exactly to <code>pointerWithin</code> inside a lane and keeps answering outside one.",
            "<strong><code>useDndMonitor</code> inside the Lane</strong>, so a lane highlights itself without the Provider threading <code>isOver</code> down.",
        ],
        best="You expect this component to live mostly inside canvases, and you want one arithmetic to be the answer in all three hosts rather than three coincidences.",
        loses="Spacing no longer matches CSS's. Labels of unequal width sit at even CENTRES, not in even gaps, so a lane of long and short names reads differently from every other flex row in the product.",
    ),
}

CRITERIA = [
    ("FR1", "Fidelity to the lab (stage 3 + 4)", 24,
     "Cross-edge move with auto re-evening, custom drop-stays-at-<code>t</code>, a grouped pair moving as a rigid body, a collapsed set drawing one card."),
    ("FR2", "Host-agnostic at zoom ≠ 1", 22,
     "The same component, unchanged, inside a React Flow node at 1.5 and a tldraw shape at 2.5: the ghost matches the dot, the drop lands where the pointer is, the host never moves the node."),
    ("FR3", "Direct-manipulation feel", 16,
     "Does the thing under the cursor behave like the thing being moved? Live preview, neighbours parting, the drop landing where you saw it."),
    ("FR4", "Stock-part ratio", 14,
     "How much is dnd-kit's own machinery versus hand-rolled geometry. Zach's standing rule: off-the-shelf first."),
    ("FR5", "Code size and seam count", 10,
     "Lines, and how many places change when a new edge state, a fourth host or a new gesture arrives."),
    ("FR6", "Testability", 8,
     "Can a journey name the drop target and assert it, without pixel math?"),
    ("FR7", "Keyboard reorder reachable", 6,
     "Is <code>KeyboardSensor</code> a drop-in, or a rewrite?"),
]

GATES = [
    ("The ghost never stretches", "Mid-drag, whatever is following the pointer is within 2px (3px at zoom ≠ 1) of the live card it was grabbed from — measured on DOM, React Flow @ 1.5 and tldraw @ 2.5."),
    ("The host never moves", "The React Flow node's <code>style.transform</code> and the tldraw shape's <code>x,y</code> are byte-identical before and after a port drag."),
    ("The model is untouched", "Every variant drives <code>portPlacement.ts</code> unchanged and adds no field; its tests stay green."),
    ("One DOM contract", "Every variant emits the same <code>[data-slot=\"port-lane\"]</code> / <code>[data-port-id]</code> / <code>[data-group-size]</code> markup, so one journey judges all five and a difference between two captures is a difference in behaviour."),
    ("Console clean", "No errors in either theme, in any host."),
]

SCORES = {
    #            FR1 FR2 FR3 FR4 FR5 FR6 FR7
    "v1-lane-sortable":   [5, 4, 5, 5, 3, 3, 5],
    "v2-lane-math":       [4, 5, 3, 2, 5, 3, 2],
    "v3-slot-droppables": [4, 4, 4, 4, 3, 5, 4],
    # FR5 4 -> 3: the fix for the oscillation below costs V4 a seam the other
    # four do not have — its own window pointer listener, because dnd-kit's
    # `delta` is not usable by a variant that moves the real card.
    "v4-rubber-band":     [4, 4, 5, 2, 3, 2, 1],
    # FR2 5 -> 2. This was a 5 written before the host half of the journey had
    # ever run against V5. It then failed the stretch gate on tldraw @ 2.5 in
    # BOTH themes with identical numbers — the criterion FR2 is literally
    # about. Scored where the evidence puts it, not where the thesis predicted.
    "v5-page-space":      [3, 2, 3, 3, 4, 4, 2],
}

EVIDENCE = {
    "v1-lane-sortable": [
        "journey: all four behaviours pass, both themes, three hosts",
        "journey: node/shape byte-identical at 1.5 and 2.5",
        "capture: the top lane re-evens to three cards mid-drag, before release",
        "imports the most dnd-kit exports of the five",
        "two layout paths (flex + absolute) inside one variant",
        "the drop target is a slot id; the index still comes from list order",
        "useSortable ships keyboard sorting; only the sensor is missing",
    ],
    "v2-lane-math": [
        "journey: all four behaviours pass; no live preview to capture",
        "journey: passes at 1.5 and 2.5; no overlay to misplace",
        "nothing moves but the dragged card",
        "two hooks and a sensor; the rest is ours",
        "the smallest file of the five",
        "drop asserted by painted position, not by a named target",
        "no sortable semantics to hand a KeyboardSensor",
    ],
    "v3-slot-droppables": [
        "journey: all four behaviours pass, both themes",
        "journey: passes at 1.5 and 2.5",
        "the hovered gap opens; the port itself does not move until release",
        "collision and droppables are stock; the gap layout is ours",
        "2n+1 nodes per lane; two spacing implementations",
        "the only variant where the drop target has a NAME a test can read",
        "a named target is exactly what a keyboard move needs",
    ],
    "v4-rubber-band": [
        "journey: all four behaviours pass, both themes — <em>after</em> the delta fix below; before it, the cross-edge drag was a no-op",
        "journey: passes at 1.5 and 2.5; nothing to place but the model",
        "the port and the model are never out of step",
        "no droppables, no collision, no overlay — the least stock of the five",
        "small file, but the hysteresis is load-bearing, and it needs its own pointer listener",
        "no drop target exists to assert; only the end state",
        "a keyboard move has no continuous gesture to drive it",
    ],
    "v5-page-space": [
        "journey: the four bench behaviours pass; auto spacing is centres, not boxes",
        "<strong>journey: FAILS the stretch gate on tldraw @ 2.5, both themes</strong> — ghost 95.8&times;45.0 against a 75.0&times;45.0 card; React Flow @ 1.5 passes",
        "no live preview; the drop is where the pointer was",
        "a custom collision replaces a stock one (a supported extension point)",
        "no flex to reconcile, but the placement arithmetic is ours",
        "positions are computable without the DOM, so a test can predict them",
        "no sortable semantics; a keyboard move would step `t`",
    ],
}

CONFIDENCE = {
    "v1-lane-sortable": "high — this is the lab's own code path, exercised green by the journey in all three hosts, both themes",
    "v2-lane-math": "high",
    "v3-slot-droppables": "medium — the gap index arithmetic is the one place a subtle off-by-one could hide; the journey covers the cases it covers",
    "v4-rubber-band": "medium — green now, but this is the variant whose bug the journey actually caught, and the hysteresis constant is still tuned rather than derived. Its thesis (move the real card on every frame) is the reason it cannot use dnd-kit's own <code>delta</code>; treat any future change here as needing the journey, not review.",
    "v5-page-space": "low — the one variant with a failing hard gate. The tldraw discrepancy is reproducible and identical in both themes, but its <em>cause</em> is not yet proven: the ghost pins itself to the live card's rect measured at drag start, and in this host that measurement (95.8) disagrees with the same card measured before the press (75.0). Not chased to the bottom.",
}


# ------------------------------------------------------------------ #
# derived results — every number below is read from the manifest the   #
# journey wrote, or measured from the live tree at build time.         #
# ------------------------------------------------------------------ #

WEIGHTS = [c[2] for c in CRITERIA]
LABELS = {vid: VARIANTS[vid]["label"] for vid in VARIANTS}


def weighted(vid: str) -> float:
    return round(sum(s * w for s, w in zip(SCORES[vid], WEIGHTS)) / 5, 1)


def entries(vid: str):
    return [m for m in manifest if m["variant"] == vid]


def failures_for(vid: str):
    return [m["failed"] for m in entries(vid) if m.get("failed")]


def hosts_reached(vid: str) -> set[str]:
    return {m["host"] for m in entries(vid) if not m.get("failed")}


def console_for(vid: str) -> list[str]:
    out: list[str] = []
    for m in entries(vid):
        for line in m.get("console", []):
            if line not in out:
                out.append(line)
    return out


# Gates 3 and 4 are structural, so they are measured from the source rather
# than asserted: every variant must reach the placement model only through
# `moveSlot`, and must emit no port markup of its own.
VARIANT_FILES = {vid: VARIANTS[vid]["file"] for vid in VARIANTS}
OWN_MODEL_WRITES = {vid: count(f, "onMovePort") for vid, f in VARIANT_FILES.items()}
OWN_MARKUP = {vid: count(f, 'data-port-id\\|data-slot="port-lane"') for vid, f in VARIANT_FILES.items()}


def gate_rows(vid: str) -> list[tuple[str, bool, str]]:
    """(gate name, passed, what was actually measured)."""
    rows = []
    stretch_fail = [f for f in failures_for(vid)
                    if "ghost is" in f["message"] or "moving element" in f["message"] or "wrapper carries" in f["message"]]
    if stretch_fail:
        rows.append((GATES[0][0], False, stretch_fail[0]["message"]))
    else:
        bits = []
        for host, theme in (("dom", "dark"), ("reactflow", "dark"), ("tldraw", "dark")):
            m = by.get((vid, theme, host))
            s = (m or {}).get("measures", {}).get("stretch") or (m or {}).get("measures", {}).get("autoStretch")
            if s:
                bits.append(f"{host} {s['moving']['w']}&times;{s['moving']['h']} vs {s['source']['w']}&times;{s['source']['h']}")
        rows.append((GATES[0][0], True, "; ".join(bits) or "measured on every drag"))

    reached = hosts_reached(vid)
    anchors = [by[(vid, t, h)]["measures"].get("anchor") for t in ("dark", "light")
               for h in ("reactflow", "tldraw") if (vid, t, h) in by and not by[(vid, t, h)].get("failed")]
    anchors = [a for a in anchors if a]
    missing = {"reactflow", "tldraw"} - reached
    if missing:
        rows.append((GATES[1][0], False,
                     f"not reached on {', '.join(sorted(missing))} — the run stopped at the failed gate above"))
    else:
        rows.append((GATES[1][0], True, f"{len(anchors)} host anchors byte-identical before and after the drag"))

    rows.append((GATES[2][0], OWN_MODEL_WRITES[vid] == 0,
                 f"{OWN_MODEL_WRITES[vid]} direct <code>onMovePort</code> calls in the variant — it goes through <code>moveSlot</code>"))
    rows.append((GATES[3][0], OWN_MARKUP[vid] == 0,
                 f"{OWN_MARKUP[vid]} port-markup attributes of its own — the DOM comes from <code>contract.tsx</code>"))
    errs = console_for(vid)
    rows.append((GATES[4][0], not errs, "no console errors in either theme" if not errs else "; ".join(errs[:2])))
    return rows


ALL_GATES_PASS = {vid: all(ok for _, ok, _ in gate_rows(vid)) for vid in VARIANTS}
RANKED = sorted(VARIANTS, key=lambda v: (ALL_GATES_PASS[v], weighted(v)), reverse=True)
WINNER = RANKED[0]
RUNNER = next(v for v in RANKED[1:] if ALL_GATES_PASS[v])

JOURNEY_ASSERTS = count("demos/capture-port-edge-v5.mjs", "assert(")
CONTRACT_LINES = wc("packages/panel/src/portEdges/contract.tsx")

HERO_GIF, HERO_POSTER = build_hero_gif()


# ------------------------------------------------------------------ #
# page                                                                 #
# ------------------------------------------------------------------ #

CSS = """
:root{--bg:#fbfbfa;--ink:#16171a;--dim:#5d6068;--line:#e2e2df;--card:#fff;
--ok:#17683a;--ok-bg:#e7f5ec;--bad:#a3231f;--bad-bg:#fdeceb;--accent:#3b5bdb;--accent-soft:#eef1fd;
--code:#f4f4f2;}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
--bg:#131417;--ink:#e9e9ea;--dim:#9a9da5;--line:#2a2c31;--card:#191a1e;
--ok:#6ee7a0;--ok-bg:#11insert;--bad:#ff9d97;--bad-bg:#2c1a19;--accent:#9db2ff;--accent-soft:#1c2033;--code:#1e2025;}}
:root[data-theme="dark"]{--bg:#131417;--ink:#e9e9ea;--dim:#9a9da5;--line:#2a2c31;--card:#191a1e;
--ok:#6ee7a0;--ok-bg:#122a1c;--bad:#ff9d97;--bad-bg:#2c1a19;--accent:#9db2ff;--accent-soft:#1c2033;--code:#1e2025;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
font:16px/1.62 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;
-webkit-font-smoothing:antialiased;}
.wrap{max-width:1040px;margin:0 auto;padding:52px 22px 120px}
h1{font-size:33px;line-height:1.16;letter-spacing:-.022em;margin:0 0 10px}
h2{font-size:23px;letter-spacing:-.016em;margin:60px 0 14px;padding-top:22px;border-top:1px solid var(--line)}
h3{font-size:17.5px;margin:30px 0 8px;letter-spacing:-.01em}
p{margin:0 0 13px}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.875em;
background:var(--code);padding:.12em .38em;border-radius:4px}
.lede{font-size:18px;color:var(--dim);margin-bottom:30px}
.quote{border-left:3px solid var(--accent);background:var(--accent-soft);
padding:14px 18px;border-radius:0 8px 8px 0;margin:0 0 30px;color:var(--ink)}
.quote p{margin:0}
figure{margin:22px 0}
figure img{width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:9px;background:var(--card)}
figcaption{font-size:13.5px;color:var(--dim);margin-top:8px}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:18px 0}
table{border-collapse:collapse;width:100%;font-size:14.5px;min-width:560px}
th,td{text-align:left;padding:9px 11px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-weight:600;font-size:12.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--dim)}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.pill{display:inline-block;font-size:12px;font-weight:600;padding:2px 9px;border-radius:999px;white-space:nowrap}
.pass{background:var(--ok-bg);color:var(--ok)}
.fail{background:var(--bad-bg);color:var(--bad)}
.card{background:var(--card);border:1px solid var(--line);border-radius:11px;padding:20px 22px;margin:20px 0}
.card.win{border-color:var(--accent);border-width:2px}
.card.red{border-color:var(--bad)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px}
ul{margin:0 0 13px;padding-left:20px}
li{margin:0 0 6px}
.k{font-size:12.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--dim);margin:16px 0 5px;font-weight:600}
.bar{height:7px;border-radius:4px;background:var(--accent);display:inline-block;vertical-align:middle}
.muted{color:var(--dim);font-size:14px}
.hero{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--card)}
.hero img{width:100%;display:block}
"""
CSS = CSS.replace("--ok-bg:#11insert;", "--ok-bg:#122a1c;")


def esc(s: str) -> str:
    return s


def gate_table(vid: str) -> str:
    rows = "".join(
        f"<tr><td>{name}</td>"
        f"<td><span class='pill {'pass' if ok else 'fail'}'>{'PASS' if ok else 'FAIL'}</span></td>"
        f"<td class='muted'>{note}</td></tr>"
        for name, ok, note in gate_rows(vid)
    )
    return f"<div class='scroll'><table><thead><tr><th>Hard gate</th><th>Result</th><th>What was measured</th></tr></thead><tbody>{rows}</tbody></table></div>"


def captures(vid: str) -> str:
    out = []
    seq = [("seed", "At rest — four ports on top, one left, two right, one bottom."),
           ("autoMidDrag", "Mid-drag, button still down: this frame is where the stretch gate is measured."),
           ("autoAfter", "After the cross-edge drop — both lanes re-evened."),
           ("custom", "Custom mode: the drop stays at the <code>t</code> it was released at."),
           ("collapsed", "A collapsed group drawing one card, moving as a rigid body.")]
    m = by.get((vid, "dark", "dom"))
    for key, cap in seq:
        src = shot((m or {}).get("files", {}).get(key))
        if src:
            out.append(f"<figure><img src='{src}' alt='{key}'><figcaption>{cap}</figcaption></figure>")
    for host, zoom in (("reactflow", "1.5"), ("tldraw", "2.5")):
        hm = by.get((vid, "dark", host))
        src = shot((hm or {}).get("files", {}).get("midDrag"))
        if src:
            out.append(f"<figure><img src='{src}' alt='{host}'><figcaption>Inside a {'React Flow node' if host=='reactflow' else 'tldraw shape'} at zoom {zoom}, mid-drag.</figcaption></figure>")
        else:
            out.append(f"<p class='muted'>No {host} capture — the run stopped at the failed gate before this host.</p>")
    return "".join(out)


def fail_figure(vid: str) -> str:
    fs = failures_for(vid)
    if not fs:
        return ""
    f = fs[0]
    src = shot(f.get("shot"), width=820)
    img = f"<img src='{src}' alt='failure'>" if src else ""
    return (f"<div class='card red'><div class='k'>Failed gate — the whole page at the moment it failed</div>"
            f"<p><code>{f['at']}</code><br>{f['message']}</p><figure>{img}"
            f"<figcaption>Both themes fail identically, with the same numbers.</figcaption></figure></div>")


score_head = "".join(f"<th class='n'>{c[0]}</th>" for c in CRITERIA)
score_rows = ""
for vid in RANKED:
    cells = "".join(f"<td class='n'>{s}</td>" for s in SCORES[vid])
    total = weighted(vid)
    flag = "" if ALL_GATES_PASS[vid] else " <span class='pill fail'>gate failed</span>"
    score_rows += (f"<tr><td><strong>{LABELS[vid]}</strong>{flag}</td>{cells}"
                   f"<td class='n'><strong>{total}</strong></td>"
                   f"<td><span class='bar' style='width:{round(total)}px'></span></td></tr>")

criteria_rows = "".join(
    f"<tr><td><strong>{cid}</strong> · {name}</td><td class='n'>{w}</td><td class='muted'>{desc}</td></tr>"
    for cid, name, w, desc in CRITERIA)

variant_sections = ""
for vid in RANKED:
    v = VARIANTS[vid]
    lines = wc(v["file"])
    stock = stock_hits(v["file"], DND_EXPORTS)
    win = " win" if vid == WINNER else (" red" if not ALL_GATES_PASS[vid] else "")
    decisions = "".join(f"<li>{d}</li>" for d in v["decisions"])
    ev = "".join(f"<li><strong>{c[0]}</strong> · {e}</li>" for c, e in zip(CRITERIA, EVIDENCE[vid]))
    badge = ("<span class='pill pass'>all gates pass</span>" if ALL_GATES_PASS[vid]
             else "<span class='pill fail'>hard gate failed</span>")
    variant_sections += f"""
<h2 id="{vid}">{LABELS[vid]} &nbsp;{badge}</h2>
<div class="card{win}">
<p>{v['thesis']}</p>
<div class="k">Decisions</div><ul>{decisions}</ul>
<div class="k">Size &amp; stock</div>
<p class="muted">{lines} lines &middot; {stock} distinct dnd-kit exports used &middot; weighted score <strong>{weighted(vid)}</strong>/100</p>
<div class="k">Best when</div><p>{v['best']}</p>
<div class="k">What you give up</div><p>{v['loses']}</p>
<div class="k">Confidence</div><p class="muted">{CONFIDENCE[vid]}</p>
</div>
{gate_table(vid)}
{fail_figure(vid)}
<div class="k">Evidence, criterion by criterion</div><ul>{ev}</ul>
{captures(vid)}
"""

HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Port Edge — five implementations</title>
<style>{CSS}</style></head><body><div class="wrap">

<h1>The port edge component, five ways</h1>
<p class="lede">Five orthogonal implementations of the same component, each driven in a real
headless Chrome with real mouse events, in three hosts and both themes, and judged against
frozen weighted criteria with five hard pass/fail gates.</p>

<div class="quote"><p>&ldquo;The ports are buggy when you move them though &mdash; stretching to
strange dimensions. I think before we integrate this into the block, let&rsquo;s please get the
&lsquo;port edge&rsquo; component working. Basically that is something that should look like
this: claude/dndkit-lab. Please make 5 proposals for how you think you could implement the port
edge component.&rdquo;</p><p class="muted" style="margin-top:8px">&mdash; Zach, {DATE}</p></div>

<div class="hero"><img src="{HERO_GIF}" alt="A port being dragged from one edge to another"></div>
<p class="muted" style="margin-top:9px">{len(json.loads((MEDIA / 'hero' / 'hero.json').read_text())['frames'])}
real frames of one real cross-edge drag in {LABELS[json.loads((MEDIA / 'hero' / 'hero.json').read_text())['variantId']]},
recorded from the running app while the button was down. Not a fabricated animation.</p>

<h2>The bug that started this, and the gate that now holds it</h2>
<p>The stretch was not a styling mistake. dnd-kit&rsquo;s <code>DndContext</code> bakes
<code>scaleX = over.rect.width / activeNodeRect.width</code> into the transform every draggable
reads, and the <code>adjustScale</code> prop on <code>DragOverlay</code> is what lets that reach
the overlay wrapper. With it on, a 33&times;24 ghost painted <strong>364&times;26</strong> over the
top lane &mdash; the lane&rsquo;s exact rect. Every variant here drops the prop and applies the
host camera&rsquo;s zoom itself, on an inner div.</p>
<p>That is now a hard gate, and the gate is <strong>mutation-tested red</strong>: restoring
<code>adjustScale</code> makes the journey fail with
<code>scale(1.2644, 5.4091) &mdash; that is the lane ratio leaking through</code>, in both themes,
and exit non-zero. A gate that cannot fail is not evidence.</p>
<p class="muted">{JOURNEY_ASSERTS} assertions in <code>demos/capture-port-edge-v5.mjs</code>;
{CONTRACT_LINES} lines of shared contract that all five variants render through, so a difference
between two captures is a difference in behaviour and not in markup.</p>

<h2>What good looks like here</h2>
<div class="scroll"><table><thead><tr><th>Criterion</th><th class="n">Weight</th><th>Meaning</th></tr></thead>
<tbody>{criteria_rows}</tbody></table></div>

<h2>Scores</h2>
<div class="scroll"><table><thead><tr><th>Variant</th>{score_head}<th class="n">/100</th><th></th></tr></thead>
<tbody>{score_rows}</tbody></table></div>
<p class="muted">Weighted out of 100. Gate failures are not scored away &mdash; a variant that fails
a hard gate is marked, and cannot be the recommendation regardless of its total.</p>

<h2>Recommendation</h2>
<div class="card win">
<p><strong>Take {LABELS[WINNER]}.</strong> It is the only variant that both scores highest
({weighted(WINNER)}/100) and passes all five gates, and it is the one that most nearly <em>is</em>
the lab you pointed at: one <code>SortableContext</code> per edge, dnd-kit&rsquo;s own strategies,
the cross-edge move committed live in <code>onDragOver</code> so the lane you enter re-evens under
your pointer.</p>
<div class="k">The decision hinge</div>
<p>One question decides this, and it is not a technical one: <strong>should a drag released
outside every lane have already moved the port?</strong> {LABELS[WINNER]} says yes &mdash; that live
commit is exactly what makes the lab feel the way it does, and the cost is that there is no
&ldquo;drop it nowhere and nothing happened&rdquo;. If you want release-to-commit, with a cancel
that truly cancels, take <strong>{LABELS[RUNNER]}</strong> instead: its hovered gap previews the
insertion without writing the model at all, and it is the only variant whose drop target has a name
a test can assert rather than a pixel.</p>
<div class="k">The reversible default</div>
<p>Nothing is integrated into Block yet, which is what you asked for. The default if you say
nothing: leave all five behind the <code>{'bbox-ui.create.portEdgeVariant'}</code> switcher on
<code>/create</code>, and integrate {LABELS[WINNER]} only once you have clicked through them.</p>
</div>

<h2>What I could not verify</h2>
<ul>
<li>{LABELS['v5-page-space']}&rsquo;s tldraw failure is reproducible and identical in both themes, but
its <em>cause</em> is not proven &mdash; the ghost pins itself to the live card&rsquo;s rect measured at
drag start, and in that host the measurement disagrees with the same card measured before the press
(95.8 vs 75.0). I stopped at the measurement rather than guess at a fix.</li>
<li>Keyboard reordering (FR7) is scored from what each variant&rsquo;s dnd-kit surface makes
available, not from a driven keyboard journey. No <code>KeyboardSensor</code> was wired.</li>
<li>Feel (FR3) is a judgement from captures and code, not from a human hand on a trackpad. That is
the part the switcher exists for.</li>
<li>Only the four seeded behaviours are covered. Touch input, many-port lanes and long labels are
untested.</li>
</ul>

{variant_sections}

<h2 style="border:0">How to see it yourself</h2>
<p>The five are live behind a switcher on <code>/create</code>; the key
<code>bbox-ui.create.portEdgeVariant</code> in <code>localStorage</code> selects one.</p>
<p class="muted">Journey: <code>demos/capture-port-edge-v5.mjs</code> &middot; hero:
<code>demos/capture-port-edge-v5-hero.mjs</code> &middot; this page:
<code>docs/build_port_edge_v5.py</code>. Built {DATE}.</p>

</div></body></html>"""

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(HTML)
kb = len(HTML.encode()) / 1024
print(f"wrote {OUT}  ({kb:.0f} KB)")
print(f"  winner {WINNER} ({weighted(WINNER)}), runner-up {RUNNER}")
for vid in RANKED:
    print(f"  {vid:22} {weighted(vid):5}  gates {'PASS' if ALL_GATES_PASS[vid] else 'FAIL'}")
