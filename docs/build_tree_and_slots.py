#!/usr/bin/env python3
"""Builds the review for two babbles on bbox-ui.com/create:

  A · the instance navigator — five stock tree parts behind a switcher;
  B · the slotted Block and five inspector layouts that place its member
      lists beside the scalar rows.

Captures come from reports/media/tree-and-slots-<date>/manifest.json,
written by demos/capture-tree-and-slots.mjs against the real page — every
picture was asserted before it was taken. Writes to the MAIN checkout's
reports/media/, never the worktree.
"""
from __future__ import annotations

import base64
import io
import json
import pathlib
import subprocess

from PIL import Image

DATE = "2026-09-11"
NAME = f"tree-and-slots-{DATE}"
REPO = pathlib.Path("/home/bam/bbox-ui")
MEDIA = REPO / "reports" / "media" / NAME
OUT = REPO / "reports" / "media" / f"{NAME}.html"
HERE = pathlib.Path(__file__).resolve().parent.parent

manifest = json.loads((MEDIA / "manifest.json").read_text())
by = {(m["kind"], m["theme"], m["id"]): m for m in manifest}


def data_uri(path: pathlib.Path, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def trim(im: Image.Image, margin: int = 24) -> Image.Image:
    """Cut the empty column below the content: last row that differs from
    the background (sampled inside the borders), plus a margin."""
    px = im.load()
    bg = px[im.width // 2, im.height - 1]
    last = 0
    for y in range(im.height - 1, -1, -1):
        row = [px[x, y] for x in range(6, im.width - 2, 4)]
        if any(abs(r[0] - bg[0]) + abs(r[1] - bg[1]) + abs(r[2] - bg[2]) > 24 for r in row):
            last = y
            break
    return im.crop((0, 0, im.width, min(im.height, last + margin)))


def png(file: str | None, do_trim: bool = True) -> str | None:
    if not file:
        return None
    im = Image.open(MEDIA / file).convert("RGB")
    if do_trim:
        im = trim(im)
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def webp(file: str, width: int = 1000) -> str:
    im = Image.open(MEDIA / file).convert("RGB")
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=82)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


def count(path: str, pattern: str) -> int:
    out = subprocess.run(["grep", "-c", pattern, str(HERE / path)], capture_output=True, text=True)
    return int(out.stdout.strip() or 0)


def wc(path: str) -> int:
    """Line count of a file in the live tree; 0 for one that has since been
    deleted (the losing variants went the evening the picks were made)."""
    f = HERE / path
    return len(f.read_text().splitlines()) if f.exists() else 0


NAVS = [
    ("arborist", "react-arborist", "Tree from react-arborist", "The VS Code explorer as a library: virtualised rows, shift/ctrl selection, arrow keys, drag with re-parenting — all stock. One quirk found: it sizes to a numeric height and virtualises rows out of the DOM, so the tree is sized to its content and the column scrolls."),
    ("aria", "React Aria Tree", "Tree · TreeItem · useDragAndDrop (react-aria-components)", "Accessibility first. selectionBehavior=\"replace\" gives file-manager clicks for free; drag is native HTML5 and the library insists on a slot=\"drag\" button for keyboard users — it warned in the console until one existed."),
    ("headless", "headless-tree", "useTree (@headless-tree/react) + selection / hotkeys / drag-and-drop features", "The successor to react-complex-tree, fully headless: our markup, its state machine. Selection, hotkeys and drop targets are features you switch on; the drag line is a style it hands you."),
    ("shadcn", "shadcn Sidebar tree", "SidebarMenu · SidebarMenuSub (vendored shadcn, Base UI)", "Zero new dependencies: the sidebar's own nested menus and active state, with selection and arrow keys from one shared reducer. No drag — the part has none, and hand-rolling one is what this comparison exists to avoid."),
    ("dndkit", "dnd-kit sortable tree", "DndContext · SortableContext · useSortable (the official Sortable Tree example)", "The repo's first-class drag library, so the drag is the point: horizontal offset chooses the depth while dragging. Selection and keys from the shared reducer; a refused drop flashes the row."),
]
LAYOUTS = [
    ("inline", "Inline rows", "Collapsible (vendored shadcn, Base UI)", "Each member list is ONE row in the Figma Dense grammar — label, count pill, chevron — that unfolds in place. A fresh Block reads as seven quiet rows; a filled one opens the lists that have something in them. Recommended."),
    ("anatomy", "Anatomy first", "none", "The lists come first, under a small schematic of the regions whose count pills jump to each list; the scalar rows follow. For a Block, composition is what you came to do."),
    ("bottom", "Bottom stack", "none", "Fields first, every list stacked below with a region caption. Zach's own first idea; the longest scroll on a Block."),
    ("tabs", "Tabs", "Tabs (vendored shadcn, Base UI)", "Properties | Members at the top; inside Members a second row filters by region. The lists never share a scroll with the fields."),
    ("split", "Split pane", "PanelGroup · Panel · PanelResizeHandle (react-resizable-panels)", "The column is split: fields above, lists below, each with its own scroller and a draggable handle that remembers its position."),
]


def nav_card(nid: str, label: str, part: str, blurb: str) -> str:
    d, l = by[("navigator", "dark", nid)], by[("navigator", "light", nid)]
    f = d["files"]
    steps = [("tree", "the tree"), ("multi", "click, then ctrl-click"), ("range", "shift-click range"), ("folded", "ArrowLeft folded the Block")]
    if d.get("supportsDrag"):
        steps += [("dragged", "the Pill dragged into the second Stack"), ("refused", "a Port dropped on the Body slot: refused, nothing moved")]
    strip = "".join(
        f'<figure class="mini"><img src="{png(f[k])}" alt="{label}, {cap}"><figcaption>{cap}</figcaption></figure>' for k, cap in steps if f.get(k)
    )
    console = d.get("console") or []
    console_html = (
        "<details><summary>console during the run: " + str(len(console)) + "</summary><pre>" + "\n".join(console) + "</pre></details>" if console else '<p class="meas">console clean during the run</p>'
    )
    drag_note = "" if d.get("supportsDrag") else ' <span class="tag muted">no drag</span>'
    rec = ' <span class="tag">default</span>' if nid == "arborist" else ""
    kb = d.get("keyboard") or {}
    if kb.get("arrowMovesSelection"):
        kb_line = "arrows move the <strong>selection</strong> (Finder)"
    elif kb.get("keyboardSelectsFolders"):
        kb_line = "arrows move a <strong>focus cursor</strong>; Space selects it (VS Code)"
    else:
        kb_line = "arrows move a <strong>focus cursor</strong>; Space selects a leaf and toggles a folder, so a folder is selected by click only"
    kb_html = '<p class="meas">Keyboard, as measured: ' + kb_line + ". ArrowDown from the folded Block landed on the " + str(kb.get("arrowDownLanded", "?")) + ".</p>"
    return f"""
<section class="variant" id="nav-{nid}">
  <h3>{label}{rec}{drag_note} <span class="axis">{part}</span></h3>
  <p>{blurb}</p>
  <div class="two">
    <figure class="card"><img src="{png(f["tree"])}" alt="{label} dark"><figcaption>dark</figcaption></figure>
    <figure class="card"><img src="{png(l["files"]["tree"])}" alt="{label} light"><figcaption>light</figcaption></figure>
  </div>
  <div class="strip">{strip}</div>
  {kb_html}
  {console_html}
</section>"""


def layout_card(lid: str, label: str, part: str, blurb: str) -> str:
    d, l = by[("layout", "dark", lid)], by[("layout", "light", lid)]
    f = d["files"]
    console = d.get("console") or []
    console_html = (
        "<details><summary>console during the run: " + str(len(console)) + "</summary><pre>" + "\n".join(console) + "</pre></details>" if console else '<p class="meas">console clean during the run</p>'
    )
    rec = ' <span class="tag">default</span>' if lid == "inline" else ""
    return f"""
<section class="variant" id="layout-{lid}">
  <h3>{label}{rec} <span class="axis">{part}</span></h3>
  <p>{blurb}</p>
  <div class="three">
    <figure class="card"><img src="{png(f["empty"])}" alt="{label}, a fresh Block"><figcaption>dark · a fresh Block: seven empty slots</figcaption></figure>
    <figure class="card"><img src="{png(f["filled"])}" alt="{label}, filled"><figcaption>dark · header filled, a body row with a Port, footer right</figcaption></figure>
    <figure class="card"><img src="{png(l["files"]["filled"])}" alt="{label}, filled, light"><figcaption>light · same</figcaption></figure>
  </div>
  {console_html}
</section>"""


NAV_CARDS = "\n".join(nav_card(*n) for n in NAVS)
LAYOUT_CARDS = "\n".join(layout_card(*l) for l in LAYOUTS)
hero_page = by[("layout", "dark", "inline")]["files"]["page"]
code = by[("code", "dark", "block")]
fill_shot = by[("layout", "dark", "inline")]["files"]["fill"]

nav_asserts = count("demos/capture-picks-applied.mjs", "assert(")
lines_navs = sum(wc(f"apps/docs/src/components/create/navigator/{f}.tsx") for f in ("Arborist", "AriaTree", "HeadlessTree", "ShadcnTree", "DndKitTree"))
lines_layouts = sum(wc(f"apps/docs/src/components/create/inspector-layout/{f}.tsx") for f in ("InlineRows", "AnatomyFirst", "BottomStack", "Tabs", "SplitPane"))
sel_tests = count("packages/panel/test/navigatorSelection.test.ts", "^\\s*it(")
slot_tests = count("packages/panel/test/members.test.ts", "^\\s*it(")

# ---- Round 2: the picks applied (written by demos/capture-picks-applied.mjs into round2/)
ROUND2 = ""
r2 = MEDIA / "round2" / "manifest.json"
if r2.exists():
    entries = {m["theme"]: m for m in json.loads(r2.read_text())}
    d, l = entries.get("dark"), entries.get("light")

    def r2png(theme_entry, key):
        return png("round2/" + theme_entry["files"][key])

    def r2webp(theme_entry, key):
        return webp("round2/" + theme_entry["files"][key])

    cons = (d or {}).get("console") or []
    cons_html = ("<details><summary>console during the run: " + str(len(cons)) + "</summary><pre>" + "\n".join(cons) + "</pre></details>") if cons else '<p class="meas">console clean during the run</p>'
    ROUND2 = f"""
<h2>Round 2 — the picks, applied</h2>
<p>Same evening, after this page was first handed over: <strong>react-arborist</strong> is the navigator, <strong>Inline rows</strong> is the layout, <strong>List</strong> is the Members control, and <strong>Flex replaced RowContainer</strong>. The other four navigators and four layouts are deleted, with their switchers and their dependencies; the sections above are the record of what was compared. Three behaviours you asked for, each checked by <code>demos/capture-picks-applied.mjs</code> in both themes:</p>
<ol class="contract">
  <li><strong>Add stays on the parent.</strong> The new member is a row; click it to enter. No jump.</li>
  <li><strong>Mouse back / forward walk the subject history.</strong> Click into a child, press back, you are on the parent; forward re-enters; two levels in, two presses out. The browser's own back navigation is swallowed on <code>mouseup</code>, the one event that cancels it.</li>
  <li><strong>An empty list is never folded.</strong> Its + is one click away; a fresh Block shows seven + buttons.</li>
</ol>
<div class="three">
  <figure class="card"><img src="{r2png(d, "emptyOpen")}" alt="empty list unfolded"><figcaption>dark · an empty Stack list, unfolded, + in reach</figcaption></figure>
  <figure class="card"><img src="{r2png(d, "stayed")}" alt="add stays"><figcaption>dark · two members added, still on the Stack</figcaption></figure>
  <figure class="card"><img src="{r2png(d, "back")}" alt="mouse back"><figcaption>dark · entered the Pill, mouse back: the Stack again</figcaption></figure>
</div>
<div class="three" style="margin-top:16px">
  <figure class="card"><img src="{r2png(d, "blockFresh")}" alt="fresh Block"><figcaption>dark · a fresh Block: seven lists, seven + buttons, nothing folded</figcaption></figure>
  <figure class="card"><img src="{r2png(l, "blockFilled")}" alt="Block filled, light"><figcaption>light · a Glyph left and a Pill right, added without leaving the Block</figcaption></figure>
  <figure class="card"><img src="{r2webp(d, "blockPage")}" alt="the page"><figcaption>dark · the page after the adds</figcaption></figure>
</div>
{cons_html}
"""

HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Instance navigator × 5, slotted Block, inspector layouts × 5 · {DATE}</title>
<style>
  :root {{ --ink:#16161a; --muted:#65656f; --line:#e3e3e8; --bg:#fbfbfc; --card:#fff; --accent:#5b45d6; --win:#2f7d5b }}
  * {{ box-sizing:border-box }}
  body {{ margin:0; background:var(--bg); color:var(--ink); font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif }}
  main {{ max-width:1100px; margin:0 auto; padding:48px 24px 96px }}
  h1 {{ font-size:30px; line-height:1.25; margin:0 0 8px; letter-spacing:-.02em }}
  h2 {{ font-size:22px; margin:64px 0 12px; letter-spacing:-.01em }}
  h3 {{ font-size:17px; margin:36px 0 8px; display:flex; flex-wrap:wrap; gap:10px; align-items:baseline }}
  .lede {{ font-size:18px; color:var(--muted); margin:0 0 24px }}
  .axis {{ font-size:11.5px; font-weight:500; color:var(--accent); letter-spacing:.02em }}
  .meas {{ font-size:12px; color:var(--muted); font-weight:400 }}
  .tag {{ font-size:11px; background:var(--win); color:#fff; border-radius:999px; padding:1px 8px; font-weight:600 }}
  .tag.muted {{ background:#9a9aa5 }}
  code {{ font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; background:#f1f1f4; padding:1px 5px; border-radius:4px }}
  pre {{ background:#16161a; color:#e8e8ee; padding:14px 16px; border-radius:8px; overflow:auto; font:12.5px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace }}
  details pre {{ font-size:11px }}
  .two {{ display:grid; grid-template-columns:1fr 1fr; gap:16px }}
  .three {{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px }}
  figure {{ margin:0 }}
  .card {{ background:var(--card); border:1px solid var(--line); border-radius:10px; overflow:hidden }}
  .card img {{ display:block; width:100%; height:auto }}
  .card figcaption {{ font-size:12px; color:var(--muted); padding:8px 12px; border-top:1px solid var(--line) }}
  .strip {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:8px; margin-top:10px }}
  .mini {{ border:1px solid var(--line); border-radius:8px; overflow:hidden; background:var(--card) }}
  .mini img {{ display:block; width:100%; height:auto; max-height:260px; object-fit:cover; object-position:top }}
  .mini figcaption {{ font-size:11px; color:var(--muted); padding:4px 8px; border-top:1px solid var(--line) }}
  table {{ border-collapse:collapse; width:100%; font-size:14px }}
  th, td {{ text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); vertical-align:top }}
  th {{ font-weight:600; white-space:nowrap }}
  .hero {{ border:1px solid var(--line); border-radius:12px; overflow:hidden; background:#000 }}
  .hero video, .hero img {{ display:block; width:100%; height:auto }}
  .decide li {{ margin-bottom:8px }}
  .note {{ background:#fff7ed; border:1px solid #fed7aa; border-radius:8px; padding:10px 14px; font-size:14px }}
  ol.contract li {{ margin-bottom:4px }}
  .run {{ background:#f1f1f4; border-radius:8px; padding:10px 14px; font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; overflow:auto }}
</style></head>
<body><main>

<h1>Instance navigator × 5, the slotted Block, inspector layouts × 5</h1>
<p class="lede">Three asks from 2026-09-11, one page. The left column is now a tree with highlighted rows and shift/ctrl selection, built five ways on five stock tree parts. The Block is a header · body · footer note with seven slots, each a member list. And the right column places those lists beside the scalar rows five ways. All three behind switchers in the sidebar footer; the first of each applied by default.</p>

<div class="hero">
  <video autoplay muted loop playsinline controls poster="{webp(hero_page)}">
    <source src="{data_uri(MEDIA / "hero.mp4", "video/mp4")}" type="video/mp4">
    <img src="{data_uri(MEDIA / "hero.gif", "image/gif")}" alt="The navigator tree being clicked, ranged, folded and dragged; then a Block's slots being filled">
  </video>
</div>
<p class="meas">Recorded from the real page by the five-way journey (since retired; the living regression is <code>demos/capture-picks-applied.mjs</code>, {nav_asserts} assertions): the arborist tree — click, ctrl-click, shift range, fold, drag re-parent — then a Block's header, body row and footer being filled through the inline-rows inspector.</p>

<h2>Terminology: slot and Flex are two words for two things</h2>
<p>You asked whether these should be called slots or flex boxes. Both, at different levels, because they name different things:</p>
<ul>
  <li>A <strong>slot</strong> is a named hole on a parent — Block's <code>header.left</code>, <code>body</code>, <code>footer.right</code>. It is the API role: it exists whether or not anything fills it, and a template addresses it by name. shadcn, Radix and Web Components all use the word for exactly this.</li>
  <li>A <strong>Flex</strong> is the component that fills a slot and lays members out — direction, justify, align, gap, padding, wrap. It is a flex container in CSS's own words, and every library you copy calls the component <code>Flex</code> (Radix Themes, Chakra, Mantine). It also stands on its own, nests, and is what a body row is.</li>
</ul>
<p>So a Block <em>declares slots</em> and each slot is <em>filled by a Flex</em>. The fill is created with the Block and can never be removed or dragged out; what you add goes into it. "FlexBox" would name the component after the CSS module rather than the thing; "slot" alone would leave the fill nameless the moment you select it to change its justify.</p>

<h2>A · The instance navigator</h2>
<p>The contract every one satisfies, checked by the journey in both themes: a tree with folding disclosures; click selects one, ctrl/cmd-click toggles, shift-click ranges over the <em>visible</em> rows; selected rows highlighted, no checkboxes; ArrowUp/Down move, Left folds, Right unfolds; glyph, title and faint type per row; drag re-parents where the part offers it and refuses what the parent cannot hold. The selection reducer the two dependency-free variants share is host-neutral in <code>@bbox-ui/panel</code> ({sel_tests} tests); the three library variants get the semantics from their part.</p>
{NAV_CARDS}

<h3>Stock parts, element by element</h3>
<table>
  <thead><tr><th>Element</th><th>Today (checkbox list)</th><th>Off-the-shelf part (exact name)</th><th>Behaviour that must survive</th></tr></thead>
  <tbody>
    <tr><th>Rows + folding</th><td>indented <code>&lt;label&gt;</code> rows</td><td>arborist <code>Tree</code> · aria <code>Tree/TreeItem</code> · <code>useTree</code> · shadcn <code>SidebarMenuSub</code> · dnd-kit flattened rows</td><td>members under their parent, a folded subtree hidden</td></tr>
    <tr><th>Multi-select</th><td>one checkbox per row</td><td>arborist <code>node.handleClick</code> · aria <code>selectionBehavior="replace"</code> · headless <code>selectionFeature</code> · <code>clickSelect()</code> for shadcn and dnd-kit</td><td>click / ctrl / shift over visible rows; the inspector reads "n selected" and Mixed</td></tr>
    <tr><th>Keyboard</th><td>none</td><td>stock in arborist, aria, headless; <code>stepRow()</code> for the other two</td><td>arrows move, Left/Right fold</td></tr>
    <tr><th>Re-parent by drag</th><td>none</td><td>arborist <code>onMove/disableDrop</code> · aria <code>useDragAndDrop</code> · headless <code>dragAndDropFeature</code> · dnd-kit depth projection</td><td>the page's <code>canDrop</code> is asked before every drop; <code>reparent()</code> refuses a cycle</td></tr>
    <tr><th>Selection, positions, renders, inspector</th><td colspan="3"><strong>unchanged (stock seam)</strong> — the page still owns selection; the navigator only reports it</td></tr>
  </tbody>
</table>

<h2>B · The slotted Block</h2>
<p>A Block now arrives as your sketch: header with left · centre · right, a body that is a column of rows, footer with left · centre · right. Each slot is a Flex, each Flex has a member list, each list adds into its slot. The old glyph · title · chip header is now something you <em>compose</em> into the header slots (a Glyph left, a TextBox centre, a Pill right).</p>
<div class="two">
  <figure class="card"><img src="{webp(by[("layout", "dark", "inline")]["files"]["page0"])}" alt="A fresh Block"><figcaption>a fresh Block: seven empty slots, each saying which hole it is</figcaption></figure>
  <figure class="card"><img src="{webp(hero_page)}" alt="A filled Block"><figcaption>header filled, a body row holding a Port, a Pill in footer · right — every member added from its slot's list</figcaption></figure>
</div>
<div class="two" style="margin-top:16px">
  <figure class="card"><img src="{png(fill_shot)}" alt="A slot's Flex selected"><figcaption>⚙ on a slot list selects the Flex that fills it: justify, align, gap, padding are its own rows</figcaption></figure>
  <figure class="card"><img src="{webp(code["files"]["code"])}" alt="Code view of a Block"><figcaption>the Code view prints the seven fills nested</figcaption></figure>
</div>
<pre>{code["code"]}</pre>
<p><strong>Rules, each checked by a test:</strong> a Block makes itself plus one Flex per slot in slot order with the slot's starting props ({slot_tests} tests in <code>members.test.ts</code>); a slot fill is named after its slot; the body slot narrows its Flex to hold rows only; a fill can never be removed, reordered or dragged; the stepper counts roots, so a Block is "1 instance" though it is eight instances.</p>

<h2>C · Inspector layouts: where the lists go</h2>
<p>A member list is not a field, and a Block has seven of them. Each layout receives the fields panel and the lists already rendered and only arranges them; the contract: every list and every field reachable, lists in anatomy order, a count visible for every list, zero lists = just the panel, nothing restyled.</p>
{LAYOUT_CARDS}

{ROUND2}

<h2>Decisions — each with the default taken if you say nothing</h2>
<ul class="decide">
  <li><strong>D1 · Navigator — taken: react-arborist.</strong> Recommendation was: <strong>react-arborist</strong> — everything in the contract is stock, including drag re-parenting, and it is the VS Code explorer you already know. React Aria is the accessibility-correct alternative if keyboard drag matters; headless-tree if we want our own markup with a library state machine. Default: arborist stays applied.</li>
  <li><strong>D2 · Inspector layout — taken: Inline rows.</strong> Recommendation was: <strong>Inline rows</strong> — a list becomes one row in the Figma Dense grammar and unfolds in place, so a fresh Block reads as seven quiet rows; Anatomy first is the strongest alternative for a Block-heavy day. Default: inline stays applied.</li>
  <li><strong>D3 · Names.</strong> <code>slot</code> for the hole, <code>Flex</code> for the fill. Default: as built.</li>
  <li><strong>D4 · RowContainer — taken: replaced by Flex.</strong> Its files, story and tests are gone; the verify scripts and the Stack's accepted kinds say Flex.</li>
  <li><strong>D5 · Block's appearance fields.</strong> state/tone/lens still sit on Block's field array but no chip is composed by default, so they are inert until a Pill is added to a slot. Default: left as is; the cleaner move is to drop them from Block and let the Pill carry them.</li>
</ul>

<h2>What is left, and what was deliberately not done</h2>
<ul>
  <li><strong>Known:</strong> a React-internal "Expected static flag was missing" dev warning appears once while switching navigators; the per-variant console captures above show which variant it belongs to.</li>
  <li><strong>Not done:</strong> drag from the canvas into a slot; a Members section over a multi-selection; sidebar rename of an instance.</li>
  <li><strong>Not done:</strong> the Code view prints the seven fills in order without naming their slots — `slot` is not a prop, so a faithful print needs a JSX comment per fill or a `slot="…"` attribute convention. Left for the pick.</li>
</ul>

<h2>Run it</h2>
<p>Then open <code>http://localhost:4110/create</code> (use <em>localhost</em>). Pick <strong>Block</strong>; the three switchers are at the bottom of the sidebar.</p>
<div class="run">pnpm --dir /home/bam/bbox-ui/.claude/worktrees/members-control --filter @bbox-ui/docs exec next dev --port 4110</div>
<p class="meas">Branch <code>claude/members-control</code>. What remains after the picks: react-arborist ({lines_navs} lines under <code>apps/docs/src/components/create/navigator/</code>), Inline rows ({lines_layouts} lines under <code>inspector-layout/</code>), Flex + slots in <code>packages/bbox-ui/src/flex.tsx</code> and <code>packages/panel/src/bench.tsx</code>. The five-way captures above were taken before the deletions and are the record. Built by <code>docs/build_tree_and_slots.py</code>.</p>

</main></body></html>
"""

OUT.write_text(HTML)
print(f"wrote {OUT} ({OUT.stat().st_size / 1e6:.2f} MB)")
