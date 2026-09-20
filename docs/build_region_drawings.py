#!/usr/bin/env python3
"""Build the report for the three region drawings Zach picked on 2026-09-19.

    python3 docs/build_region_drawings.py

Writes a self-contained page (every capture inlined as a data URI) to the
gitignored media half of reports/ in the MAIN checkout:

    /home/bam/bbox-ui/reports/media/region-drawings-2026-09-19.html

Every number on the page is measured at build time, from files on disk — this
page cannot drift from the tree it describes:

  - reports/media/region-drawings-2026-09-19/nesting-measurements.json —
    painted INK BANDS read off the REAL app (apps/systemsketch on :4371),
    at 1:1, for five region drawings x three nesting depths. A stroke is
    modelled as the interval a border actually paints, so "does it double?"
    is answerable rather than argued.
  - the same directory's gates/*.log — every gate re-run on this tree.
  - apps/storybook-basics/src/skin/regionVariants.ts — each drawing's title,
    blurb and header height, quoted from the live table.
  - apps/storybook-basics/src/skin/regionVariants.css — each new drawing's
    own arm tokens, read out of the live stylesheet.
  - apps/systemsketch/review/region-drawings-nesting.tldr — the board's real
    shape and region counts, and which regions are nested.
  - git, for the branch and the commit that carries the change.

WHY the page is measured `encodeURIComponent`-encoded and not on disk: Claude
Code's desktop preview opens a file:// report as a `data:text/html,` URL and
refuses one past 2,097,024 bytes encoded. Base64 media inflates ~7% under
that encoding, prose 46-73%, so disk size says nothing.
"""
from __future__ import annotations

import base64
import html
import json
import pathlib
import re
import subprocess
from urllib.parse import quote

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent
MAIN = pathlib.Path("/home/bam/bbox-ui")
NAME = "region-drawings-2026-09-19"
MEDIA = MAIN / "reports" / "media" / NAME
OUT = MAIN / "reports" / "media" / f"{NAME}.html"
SB = REPO / "apps" / "storybook-basics"
APP = REPO / "apps" / "systemsketch"
BOARD = APP / "review" / "region-drawings-nesting.tldr"
CAP = 2_097_024
URI_SAFE = "-_.!~*'()"

NEW = ["v6", "v7", "v8"]
GALLERY = {"v6": "V1 · Transparent Card", "v7": "V2 · Edge Card", "v8": "V3 · Top Rule"}

SOURCES: list[str] = []


def cite(*ns: int) -> str:
    return '<span class="cite">' + ",".join(f'<a href="#src{n}">{n}</a>' for n in ns) + "</span>"


def esc(s: str) -> str:
    return html.escape(str(s))


def attr(s: str) -> str:
    return html.escape(str(s), quote=True)


def img(path: pathlib.Path, *, pixelated: bool = False) -> str:
    data = path.read_bytes()
    SOURCES.append(str(path))
    style = ' style="image-rendering:pixelated"' if pixelated else ""
    return f'<img src="data:image/png;base64,{base64.b64encode(data).decode()}" alt="{attr(path.stem)}"{style}>'


def fig(markup: str, caption: str, *, cls: str = "") -> str:
    return f'<figure class="{cls}">{markup}<figcaption>{caption}</figcaption></figure>'


def verdict(num: str, title: str) -> str:
    """Approve / Change / Reject + a note. The number and the exact title
    travel into the copied markdown, so Zach never has to say which item he
    is talking about."""
    return (
        f'<div class="v" data-key="{attr(num)}" data-num="{attr(num)}" data-title="{attr(title)}">'
        '<button data-v="approve" aria-pressed="false">Approve</button>'
        '<button data-v="change" aria-pressed="false">Change</button>'
        '<button data-v="reject" aria-pressed="false">Reject</button>'
        '<textarea placeholder="note…" spellcheck="false" rows="1"></textarea></div>'
    )


# ------------------------------------------------------------------ facts


def git(*args: str) -> str:
    try:
        return subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True, timeout=20).stdout.strip()
    except Exception:
        return ""


def nesting() -> dict:
    path = MEDIA / "nesting-measurements.json"
    SOURCES.append(str(path))
    return json.loads(path.read_text())


def gate_log(stem: str) -> str:
    path = MEDIA / "gates" / f"{stem}.log"
    SOURCES.append(str(path))
    return path.read_text()


def counts(text: str, section: str | None = None) -> tuple[str | None, str | None]:
    """(files, tests) out of a vitest tail."""
    if section:
        block = text.split(f"== {section} ==")
        text = block[1] if len(block) > 1 else ""
    files = re.search(r"Test Files\s+(\d+) passed \((\d+)\)", text)
    tests = re.search(r"Tests\s+(\d+) passed \((\d+)\)", text)
    return (files.group(2) if files else None, tests.group(2) if tests else None)


def spec_of(vid: str) -> dict[str, str]:
    """A drawing's own row, quoted out of the live TS table."""
    ts = SB / "src" / "skin" / "regionVariants.ts"
    SOURCES.append(str(ts))
    block = re.search(rf"\n  {vid}: \{{(.*?)\n  \}},", ts.read_text(), re.S)
    if not block:
        raise SystemExit(f"{vid} is not in REGION_VARIANTS — the page describes a drawing the table no longer has")
    body = block.group(1)

    def one(pattern: str) -> str:
        found = re.search(pattern, body)
        return found.group(1) if found else "—"

    return {
        "title": one(r'title: "([^"]+)"'),
        "blurb": one(r'blurb: "([^"]+)"'),
        "header": one(r'header: "([^"]+)"'),
        "divider": one(r"divider: (true|false)"),
        "headerPx": one(r"headerPx: (\d+)"),
        "nested": one(r'contrast: "([^"]+)"'),
    }


ARM_TOKENS = [
    "arm-decor-display", "arm-decor-inset", "arm-decor-stroke-widths",
    "arm-decor-radius", "arm-decor-fill", "arm-header-inset",
    "arm-divider-width", "arm-header-rule-width", "nested-fill",
]


def tokens_of(vid: str) -> dict[str, str]:
    """A drawing's arm tokens, read out of the live stylesheet."""
    css = SB / "src" / "skin" / "regionVariants.css"
    SOURCES.append(str(css))
    block = re.search(rf'\[data-bbox-region-variant="{vid}"\]\s*\{{(.*?)\n\}}', css.read_text(), re.S)
    if not block:
        raise SystemExit(f"{vid} has no block in regionVariants.css")
    body = block.group(1)
    out = {}
    for key in ARM_TOKENS:
        found = re.search(rf"--bbox-region-{key}:\s*([^;]+);", body)
        out[key] = found.group(1).strip() if found else "—"
    return out


def board_facts() -> dict:
    SOURCES.append(str(BOARD))
    records = [json.loads(line) for line in BOARD.read_text().splitlines() if line.strip().startswith("{")]
    if len(records) == 1 and "records" in records[0]:
        records = records[0]["records"]
    shapes = [r for r in records if r.get("typeName") == "shape"]
    regions = [r for r in shapes if r.get("type") == "ss-region"]
    return {
        "shapes": len(shapes),
        "regions": len(regions),
        "nested": len([r for r in regions if str(r.get("parentId", "")).startswith("shape:")]),
        "loops": len([r for r in regions if r.get("props", {}).get("kind") == "for"]),
        "bytes": BOARD.stat().st_size,
    }


# ------------------------------------------------------------------ page


def level_row(data: dict, vid: str, level: str) -> dict:
    return data[vid][level]


def num(value) -> str:
    if value is None:
        return "—"
    return f"{value:g}" if isinstance(value, (int, float)) else str(value)


def build() -> str:
    data = nesting()
    fast = gate_log("fast")
    story = gate_log("storybook")
    board = board_facts()
    specs = {v: spec_of(v) for v in NEW}
    toks = {v: tokens_of(v) for v in NEW}
    branch = git("rev-parse", "--abbrev-ref", "HEAD")
    tip = git("rev-parse", "--short", "HEAD")
    drawing_sha = git("log", "-1", "--format=%h", "--", "apps/storybook-basics/src/skin") or tip
    board_sha = git("log", "-1", "--format=%h", "--", "apps/systemsketch/review") or tip

    sb_unit = counts(fast, "sb unit")
    ss_tests = counts(fast, "ss vitest")
    sb_story = counts(story)
    sb_tsc = "clean" if re.search(r"== sb tsc ==\s*\nexit=0", fast) else "FAIL"
    ss_tsc = "clean" if re.search(r"== ss tsc ==\s*\nexit=0", fast) else "FAIL"

    gate_cards = "".join(
        f'<div class="gate"><div class="big{"" if ok else " bad"}">{esc(big)}</div>'
        f'<div class="lbl">{esc(label)}<br><span class="dim2">{esc(note)}</span></div></div>'
        for label, big, note, ok in [
            ("trunk · tsc", sb_tsc, "typecheck", sb_tsc == "clean"),
            ("trunk · unit", sb_unit[1] or "—", f"{sb_unit[0]} files · node", bool(sb_unit[1])),
            ("trunk · stories", sb_story[1] or "—", f"{sb_story[0]} files · real browser", bool(sb_story[1])),
            ("app · tsc", ss_tsc, "typecheck", ss_tsc == "clean"),
            ("app · tests", ss_tests[1] or "—", f"{ss_tests[0]} files · unit + smoke", bool(ss_tests[1])),
        ]
    )

    # ---- the nesting table, straight off the measurement file --------------
    order = ["v8", "v7", "v6", "v1", "v5"]
    labels = {
        "v8": "v8 · Top rule <span class='dim2'>(gallery V3)</span>",
        "v7": "v7 · Edge card <span class='dim2'>(gallery V2)</span>",
        "v6": "v6 · Transparent card <span class='dim2'>(gallery V1)</span>",
        "v1": "v1 · Labeled group <span class='dim2'>shipped</span>",
        "v5": "v5 · Card <span class='dim2'>shipped</span>",
    }
    rows = []
    for vid in order:
        cells = []
        for level in ("L1", "L2", "L3"):
            m = level_row(data, vid, level)
            cells.append(f'<td class="r">{m["lines"]}</td>')
        m3 = level_row(data, vid, "L3")
        doubled = len(m3["doubled"])
        tight = len(m3["tightH"]) + len(m3["tightV"])
        klass = "good" if tight == 0 and doubled == 0 else ("bad" if tight >= 6 else "")
        rows.append(
            f'<tr><th>{labels[vid]}</th>{"".join(cells)}'
            f'<td class="r {"bad" if doubled else "good"}">{doubled or "0"}</td>'
            f'<td class="r">{num(m3["minGapH"])}</td><td class="r">{num(m3["minGapV"])}</td>'
            f'<td class="r {klass}">{tight}</td></tr>'
        )
    nest_table = (
        '<table><thead><tr><th>Drawing</th><th>1 level</th><th>2 levels</th><th>3 levels</th>'
        '<th>2 px bands<br><span class="dim2">at 3 levels</span></th>'
        '<th>tightest<br>gap ↔</th><th>tightest<br>gap ↕</th>'
        '<th>pairs ≤12 px<br><span class="dim2">at 3 levels</span></th></tr></thead>'
        f'<tbody>{"".join(rows)}</tbody></table>'
    )

    def token_table(vid: str) -> str:
        t = toks[vid]
        s = specs[vid]
        pairs = [
            ("--bbox-region-arm-decor-display", t["arm-decor-display"]),
            ("--bbox-region-arm-decor-inset", t["arm-decor-inset"]),
            ("--bbox-region-arm-decor-stroke-widths", t["arm-decor-stroke-widths"]),
            ("--bbox-region-arm-decor-radius", t["arm-decor-radius"]),
            ("--bbox-region-arm-decor-fill", t["arm-decor-fill"]),
            ("--bbox-region-arm-header-inset", t["arm-header-inset"]),
            ("--bbox-region-arm-divider-width", t["arm-divider-width"]),
            ("--bbox-region-arm-header-rule-width", t["arm-header-rule-width"]),
            ("--bbox-region-nested-fill", t["nested-fill"]),
            ("arms.header <span class='dim2'>(TS)</span>", s["header"]),
            ("arms.headerPx <span class='dim2'>(TS)</span>", s["headerPx"] + " px"),
            ("nested.contrast <span class='dim2'>(TS)</span>", s["nested"]),
        ]
        body = "".join(f'<tr><th>{k}</th><td class="r">{esc(v)}</td></tr>' for k, v in pairs)
        return f"<table class='tok'><tbody>{body}</tbody></table>"

    def drawing_section(n: int, vid: str, headline: str, verdict_text: str, prose: str) -> str:
        s = specs[vid]
        m1, m2, m3 = (level_row(data, vid, L) for L in ("L1", "L2", "L3"))
        return f"""
<h2><span class="k">{n}</span>{vid} · {esc(s['title'])} <span class="dim2">— gallery {esc(GALLERY[vid].split(' · ')[0])}, “{esc(GALLERY[vid].split(' · ')[1])}”</span></h2>
<p class="lead">{esc(s['blurb'])}</p>
<div class="grid2 compare">
  {fig(img(MEDIA / f'gallery-{ {"v6":"transparent-card","v7":"edge-card","v8":"top-rule"}[vid] }.png'), f"What you picked: the gallery mock, rendered {cite(1)}", cls='dark')}
  {fig(img(MEDIA / f'board-{vid}-stack.png'), f"What shipped: the same drawing in the real app, three Branches deep {cite(2)}")}
</div>
{prose}
<h3>The token set, read out of the live stylesheet</h3>
{token_table(vid)}
<h3>What it costs to nest</h3>
<div class="grid3">
  {fig(img(MEDIA / f'app-{vid}-L1.png'), f"1 level — {m1['lines']} painted lines")}
  {fig(img(MEDIA / f'app-{vid}-L2.png'), f"2 levels — {m2['lines']} lines")}
  {fig(img(MEDIA / f'app-{vid}-L3.png'), f"3 levels — {m3['lines']} lines, {len(m3['tightH']) + len(m3['tightV'])} pair(s) within 12 px")}
</div>
<div class="finding"><h3>Verdict — {esc(headline)}</h3><p>{verdict_text}</p></div>
{verdict(str(n), f"{vid} · {s['title']}")}
"""

    v6 = level_row(data, "v6", "L3")
    v7 = level_row(data, "v7", "L3")
    v8 = level_row(data, "v8", "L3")
    v6_pairs = len(v6["tightH"]) + len(v6["tightV"])
    v7_double = len(v7["doubled"])

    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Three region drawings, and what nesting does to them — 2026-09-19</title>
<style>
:root {{ --bg:#0e0f12; --panel:#15171c; --panel2:#1b1e25; --line:#282d38; --line2:#343b49;
  --fg:#e6e8ee; --dim:#9aa3b2; --dim2:#6b7383; --accent:#f0883e; --accent2:#5aa9f8; --ok:#3fb950; --warn:#e5534b; --gold:#e8c06a;
  --mono: ui-monospace,"SF Mono",Menlo,Consolas,monospace; }}
* {{ box-sizing:border-box }}
body {{ margin:0; background:var(--bg); color:var(--fg); font:15px/1.55 -apple-system,"Segoe UI",Inter,Roboto,sans-serif }}
main {{ max-width:1160px; margin:0 auto; padding:28px 24px 170px }}
h1 {{ font-size:30px; line-height:1.15; margin:0 0 6px; letter-spacing:-.01em }}
h2 {{ font-size:22px; margin:52px 0 12px; padding-top:18px; border-top:1px solid var(--line); letter-spacing:-.01em }}
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
table.tok th {{ font:12.5px/1.4 var(--mono); font-weight:500; color:var(--dim); width:48% }}
td.r {{ font-family:var(--mono); text-align:center; white-space:nowrap }}
td.r.good {{ color:#5ee08a }} td.r.bad {{ color:#ff8a80 }}
figure {{ margin:0; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:8px; min-width:0 }}
figure img {{ width:100%; display:block; border-radius:6px; background:#f7f7f8 }}
figure.dark img {{ background:#111 }}
figure.seam img {{ border-radius:3px }}
/* A three-deep stack is tall and narrow; an unbounded one leaves its
   neighbour sitting in a void. Cap the height and centre it instead. */
.grid2.compare {{ align-items:center }}
.grid2 figure img {{ max-height:600px; width:auto; max-width:100%; margin:0 auto }}
.grid3 figure img {{ max-height:420px; width:auto; max-width:100%; margin:0 auto }}
figcaption {{ color:var(--dim); font-size:12.5px; padding:8px 4px 2px }}
.grid2 {{ display:grid; grid-template-columns:1fr 1fr; gap:14px; margin:12px 0; align-items:start }}
.grid3 {{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; margin:12px 0; align-items:start }}
@media (max-width:900px) {{ .grid2, .grid3 {{ grid-template-columns:1fr }} }}
.finding {{ background:#2a241633; border:1px solid #8a6d1c; border-radius:10px; padding:14px 16px; margin:16px 0 }}
.finding h3 {{ margin:0 0 6px; color:var(--gold) }}
.default {{ background:#12301c33; border:1px solid #2f7a45; border-radius:10px; padding:10px 14px; margin:12px 0; color:#cfe9d6 }}
.quote {{ border-left:3px solid var(--accent); padding:4px 0 4px 14px; margin:14px 0; color:#d6dae3; font-size:16px }}
.gates {{ display:grid; grid-template-columns:repeat(5,1fr); gap:10px; margin:12px 0 }}
@media (max-width:960px) {{ .gates {{ grid-template-columns:repeat(2,1fr) }} }}
.gate {{ background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:10px 12px }}
.gate .big {{ font:600 20px/1.1 var(--mono); color:#5ee08a }} .gate .big.bad {{ color:#ff8a80 }}
.gate .lbl {{ color:var(--dim); font-size:12px; margin-top:4px }}
.need {{ background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 14px; margin:10px 0 }}
.need-h {{ font-size:15px; margin-bottom:8px }}
.need .tag {{ font:600 12px/1 var(--mono); background:#2a2416; color:var(--gold); padding:4px 7px; border-radius:4px; margin-right:8px }}
.need-b {{ color:#cfd5e0; font-size:14px; margin:4px 0 }}
.need-b .lbl {{ color:var(--dim2); font:600 11px var(--mono); letter-spacing:.06em; text-transform:uppercase; margin-right:8px }}
.v {{ display:flex; gap:6px; align-items:flex-start; flex-wrap:wrap; margin-top:10px }}
.v button {{ background:#0a0b0e; color:#cfd5e0; border:1px solid var(--line2); border-radius:6px; padding:4px 10px; font-size:12.5px; cursor:pointer }}
.v button[aria-pressed="true"][data-v="approve"] {{ background:#12301c; border-color:#2f7a45; color:#5ee08a }}
.v button[aria-pressed="true"][data-v="change"] {{ background:#3a2f0f; border-color:#8a6d1c; color:var(--gold) }}
.v button[aria-pressed="true"][data-v="reject"] {{ background:#3a1616; border-color:#8a2c2c; color:#ff8a80 }}
.v textarea {{ flex:1 1 240px; min-width:160px; background:#08090b; color:var(--fg); border:1px solid var(--line); border-radius:6px; padding:4px 8px; font:12.5px/1.4 var(--mono); resize:vertical }}
pre.cmd {{ background:#08090b; border:1px solid var(--line); border-radius:8px; padding:10px 12px; font:13px/1.5 var(--mono); white-space:pre-wrap; word-break:break-all; margin:6px 0 }}
ul.src {{ list-style:none; padding:0; font-size:13px; color:var(--dim) }}
ul.src li {{ padding:4px 0; border-bottom:1px dashed var(--line); overflow-wrap:anywhere }}
ul.src .n {{ display:inline-block; min-width:28px; color:var(--accent2); font-family:var(--mono) }}
.dock {{ position:fixed; left:0; right:0; bottom:0; background:#0a0b0ee6; backdrop-filter:blur(8px); border-top:1px solid var(--line2); padding:10px 24px; display:flex; gap:12px; align-items:center; z-index:9 }}
.dock .tally {{ color:var(--dim); font-size:13px; flex:1 }}
.dock button {{ background:#0a0b0e; color:#cfd5e0; border:1px solid var(--line2); border-radius:6px; padding:7px 14px; cursor:pointer }}
.dock button.go {{ background:var(--accent); color:#111; border-color:var(--accent); font-weight:600 }}
#outwrap {{ display:none }} #outwrap.open {{ display:block }}
.overall textarea, #out {{ width:100%; background:#08090b; color:var(--fg); border:1px solid var(--line2); border-radius:8px; padding:10px 12px; font:13px/1.55 var(--mono) }}
.overall textarea {{ min-height:70px }} #out {{ min-height:220px; margin-top:10px }}
</style></head>
<body><main>

<h1>Three region drawings, for real — and what nesting does to each</h1>
<p class="prov">{esc(branch)} · drawings {esc(drawing_sha)} · board {esc(board_sha)} · 2026-09-19 ·
every number below measured at build time from the real app, never typed in</p>

<div class="quote">“control flow is not a card!”</div>

<p class="lead">Your three picks out of tonight's gallery are in the app as <code>v6</code>,
<code>v7</code> and <code>v8</code>, switchable from the bottom-right pill, on a board that
already has a Branch, a Branch-in-a-Branch-in-a-Branch and a For Loop on it. The headline:
<strong>v7 Edge card is the only one of the three that keeps its promise when Branches nest</strong>,
<strong>v8 Top rule is arm-for-arm identical to the v1 you already ship</strong>, and
<strong>v6 Transparent card still reads as cards</strong> — taking the fill out did not stop it
drawing a box round every arm.</p>

<h2><span class="k">0</span>Read this first: two different “v1 v2 v3”</h2>
<p>You named the three by the <em>gallery's</em> numbering. The repo's region table already had a
v1–v5. Nothing was overwritten — the three land beside them, and each carries the gallery's own
<em>name</em> as its title so the two numberings can never be confused again.</p>
<table><thead><tr><th>You said</th><th>Gallery name</th><th>Pill value now</th><th>Title in the app</th></tr></thead><tbody>
<tr><td class="r">v1</td><td>Transparent Card</td><td class="r">v6</td><td>{esc(specs['v6']['title'])}</td></tr>
<tr><td class="r">v2</td><td>Edge Card</td><td class="r">v7</td><td>{esc(specs['v7']['title'])}</td></tr>
<tr><td class="r">v3</td><td>Top Rule</td><td class="r">v8</td><td>{esc(specs['v8']['title'])}</td></tr>
</tbody></table>
<p class="small dim">The board says this on the board itself, on a blue card beside the For Loop,
so you never have to hold the mapping in your head while you flip the pill.</p>

<h2><span class="k">1</span>The board, so nothing has to be built to compare</h2>
{fig(img(MEDIA / 'board-v7-fit.png'), f"The whole board under v7, opened through the app's own ☰ › File › Open. {board['shapes']} shapes, {board['regions']} regions, {board['nested']} of them genuinely nested (real <code>parentId</code>, not coordinates that happen to look nested), {board['loops']} For Loop. {cite(2, 3)}")}
<p>The pill is <strong>global</strong> — one attribute on <code>&lt;html&gt;</code> — so “the same
Branch under each of the three” is <em>this board, flipped three times</em>. That is the comparison
you want anyway: the shapes never move, only the drawing changes.</p>

<div class="default"><strong>Your scoping rule is a measurement now, not a claim.</strong>
The For Loop's painted signature — frame stroke width, colour, fill, radius, arm count, decor
count, header-rule display — came back <em>character for character identical</em> under v1, v6, v7
and v8 while driving the real board. It cannot be otherwise: a For Loop is built with
<code>arms: []</code>, so there is no arm row for an arm drawing to reach.</p></div>

<h2><span class="k">2</span>What nesting actually did — all of it, in one table</h2>
<p>Read at 1:1 off the running app, at one, two and three levels of Branch-in-Branch. A stroke here
is not an <em>edge</em>, it is a <strong>band of ink</strong>: a 1 px border paints the interval
<code>[edge, edge+1]</code> inside its own box, so two borders that share a coordinate are 2 px of
ink and two 6 px apart are two lines the eye separates. That is what makes “does it double?”
answerable instead of arguable.{cite(4)}</p>
{nest_table}
<p class="small dim">“Lines” counts distinct painted bands (coincident strokes merged — they are one
line to a reader). “2 px bands” are places where two 1 px strokes land flush and paint as one
heavier line. Gaps are CSS px, measured at zoom 1.</p>

<div class="finding"><h3>The three answers you asked for, with numbers</h3>
<p><strong>Top rule at 3 levels is not a ladder.</strong> {v8['lines']} lines, tightest gaps
{num(v8['minGapH'])} px ↔ and {num(v8['minGapV'])} px ↕, <strong>zero</strong> pairs within 12 px.
The gallery's stated risk does not materialise, because the only thing an extra level adds is its
own frame — and a frame is a line you were paying for anyway.</p>
<p><strong>Transparent card at 3 levels is exactly the crowding the gallery feared.</strong>
{v6['lines']} lines — double v8 — and <strong>{v6_pairs}</strong> pairs within 12 px: at every
level the frame's own line and the arm outline sit <strong>5 px</strong> apart on the left and
again on the right, and the two arm outlines sit <strong>10 px</strong> apart. Three levels, six
5 px pairs.</p>
<p><strong>Edge card's side-stroke promise holds all the way down.</strong> Vertical lines stay at
exactly two per region — the frame, and nothing else — so the tightest vertical gap is still
{num(v7['minGapV'])} px at three levels and there are <strong>zero</strong> tight vertical pairs.
It holds even when the “frame” a stroke could double against is itself an outer arm's edge. But it
buys that with one doubling the gallery mock never showed you: between an arm's bottom stroke and
the next arm's top stroke, flush, <strong>{v7_double} bands of 2 px</strong> at three levels — one
per region.</p></div>

<h3>The seam between two arms, at 3×</h3>
<div class="grid3">
  {fig(img(MEDIA / 'seam-v6.png', pixelated=True), "v6 — two outlines, 10 px apart", cls='seam')}
  {fig(img(MEDIA / 'seam-v7.png', pixelated=True), f"v7 — one band, 2 px: the doubling, magnified. It reads as one slightly heavier rule, not as two lines.", cls='seam')}
  {fig(img(MEDIA / 'seam-v8.png', pixelated=True), "v8 — one 1 px hairline, the divider and nothing else", cls='seam')}
</div>

<h3>What I decided nesting should DO, and why it is the same call for all three</h3>
<p><code>nested.contrast</code> is <code>none</code> on all three, i.e.
<code>--bbox-region-nested-fill: initial</code> — a Branch inside a Branch reads the parent's own
transparent fill. That is a deliberate choice, not a default I left alone: the only nesting
contrast this mechanism has is <em>deepening the nested frame's fill</em>, and that fill paints
<strong>behind the arms</strong>. Giving a nested arm a tone is giving an arm a background, which
is the one thing you ruled out. So nesting is answered with geometry here, and the table above is
what that geometry costs.</p>

{drawing_section(3, 'v7',
  "Ship this one",
  "It is the only one of the three that is still doing its job at three levels: two vertical lines per "
  "region, no crowding anywhere, and nesting reads as <em>indentation</em> rather than as boxes. "
  "The full-width rule under the corner card comes free with the drawing — it is the first arm's own "
  "top stroke, which is the line you pointed at in <code>…115353.png</code>. "
  "One real cost, above: the 2 px seam between arms.",
  "<p>Edge to edge, top and bottom strokes only. The side strokes are dropped rather than kept at 1 px "
  "because at inset 0 an arm's left and right lines land on the frame's own borders one pixel apart, and "
  "a doubled line there reads as a seam rather than a subdivision — the gallery's own words, "
  "“one column subdivided, not cards parked in a box”.</p>")}

{drawing_section(4, 'v8',
  "It is already shipped — picking it means shipping nothing",
  "Its arm tokens are identical to <code>v1</code>'s, value for value: decor off, divider 1 px, no header "
  "rule, no band, header inset 0. The only difference in the whole set is the 30 px header the three share "
  "so that flipping between them moves no row (v1 is 32 px). It is kept as its own id because you picked "
  "three drawings by name and the pill has to offer three — but the honest reading is that the quietest "
  "drawing in the gallery was the one already on the board.",
  "<p>One hairline between rows and nothing else. Note what it does <em>not</em> draw: no line above the "
  "first arm (the corner card's edge is the only mark there) and no line under the last. The gallery's "
  "thesis said “one line above each arm”; the mock, and therefore this, draws one <em>between</em> arms.</p>")}

{drawing_section(5, 'v6',
  "Taking the fill out did not stop it being a card",
  "Against “control flow is not a card!” this is the weakest of the three, and the nesting numbers say why: "
  "it is the only one that adds a near-parallel line pair at <em>every</em> level, and at three levels the "
  "stack reads as boxes inside boxes inside boxes. Built faithfully to the gallery's own numbers so you can "
  "judge it, not argued away.",
  "<p><code>v5</code>'s inset card with the fill taken out. The three numbers are the gallery's own, read "
  "back off the rendered page: inset 5 px, 1 px all round, radius 6 px, fill fully transparent — and the "
  "header text moves in by the same 5 px so the title sits inside the outline rather than straddling it.</p>")}

<h2><span class="k">6</span>How it was built — and the one stock seam that did not move</h2>
<p>All three are <strong>token sets</strong>. Not one element was added to <code>ArmRow</code>: the arm was
already fully tokenised, which is exactly what made “three drawings” three blocks of custom properties
rather than three components.</p>
<table><thead><tr><th>Element</th><th>Today</th><th>Off-the-shelf part</th><th>Behaviour that must survive</th></tr></thead><tbody>
<tr><td>the arm's decor box</td><td>one absolutely-positioned <code>div</code> reading nine
<code>--bbox-region-arm-decor-*</code> properties</td><td><strong>unchanged (stock seam)</strong> —
CSS custom properties, the same mechanism <code>skin.css</code> uses</td><td>the row's own box never moves for
it, so <code>expectArmsStacked</code> and every member's authored position hold in all eight drawings</td></tr>
<tr><td>the variant switch</td><td><code>data-bbox-region-variant</code> on any ancestor</td>
<td><strong>unchanged (stock seam)</strong> — one attribute, no React context</td>
<td>three new ids appear in the pill and the Storybook toolbar with no wiring; a stale value still reads as v1</td></tr>
<tr><td>the pill itself</td><td>shadcn <code>DropdownMenu</code> + <code>DropdownMenuRadioGroup</code></td>
<td><strong>unchanged (stock seam)</strong></td><td>it grew from five rows to eight by itself, because it maps
<code>REGION_VARIANT_IDS</code></td></tr>
<tr><td>the review board</td><td>hand-built tldraw JSON <span class="dim2">(would have been)</span></td>
<td><code>skills/bbox-review-board</code>'s <code>create_review_board.mjs</code> — the real editor, the app's
own serializer, a cold reopen through the app's own Open</td><td>the file is one the product can open; containment
is a tree fact; cue arrows land square on the edge they name</td></tr>
</tbody></table>
<p class="small dim">Nothing hand-rolled was replaced by a library part in this round — the table is here to say
so explicitly, and to name the seams that were deliberately left alone.</p>

<h3>Two tests were made stricter. Nothing was weakened.</h3>
<ul>
<li><code>signatureOf</code> in <code>RegionVariants.stories.tsx</code> gained the decor box's geometry. Without
it v6 and v7 sign identically — same frame, same header, both <code>decor: block</code> — and “pairwise
distinct” stops meaning anything. More fields can only split pairs apart, never merge them.</li>
<li><code>variants.smoke.test.tsx</code>'s menu row count and last-remembered id now derive from the tables
instead of being spelled <code>5</code> and <code>"v5"</code>. The two tables no longer have the same length.</li>
<li>Two new acceptance branches, <code>outline</code> and <code>edge</code>, assert what each drawing
<em>claims</em>: v6's decor must read back <strong>unfilled</strong>, v7's must reach both side walls with
<strong>zero</strong> side stroke. Both were mutation-tested red before being trusted — a fill on v6 and a
side stroke on v7 each failed on exactly the intended assertion.</li>
</ul>

<h2><span class="k">7</span>Gates, re-run on this tree</h2>
<div class="gates">{gate_cards}</div>
<p class="small dim">Baselines taken on the base commit <em>before</em> any edit, on this same tree:
trunk tsc clean, trunk unit 1228, trunk stories 520, app tsc clean, app tests 153. The stories suite is
+3 — one story per new drawing. The app suite's count is unchanged because its region cases live inside
loops over <code>REGION_VARIANT_IDS</code>: same number of tests, eight drawings each instead of five.{cite(5, 6)}</p>

<h2><span class="k">8</span>What needs you</h2>

<div class="need"><div class="need-h"><span class="tag">PICK</span>Which drawing wins</div>
<p class="need-b"><span class="lbl">recommend</span><strong>v7 · Edge card.</strong> It is the only one of
the three still doing its job at three levels, and it is the one that actually stops being a card.</p>
<p class="need-b"><span class="lbl">if silence</span>Nothing is promoted. All eight stay in the pill and v1
stays the default — a proposal under review must not quietly become the product.</p>
{verdict("8a", "Which drawing wins")}</div>

<div class="need"><div class="need-h"><span class="tag">ASK</span>v7's 2 px seam between arms — leave it or halve it</div>
<p class="need-b"><span class="lbl">what</span>An arm's bottom stroke and the next arm's top stroke land flush,
so the line between two arms is 2 px where every other line is 1 px. At 3× it reads as one slightly heavier rule,
not as two lines — but it is measurably there, {v7_double} times in a three-deep stack.</p>
<p class="need-b"><span class="lbl">recommend</span>Leave it for now. The one-token fix is
<code>--bbox-region-arm-decor-stroke-widths: 1px 0 0 0</code> (top only), which costs the last arm its bottom
line — and that bottom line is what currently closes the last arm against the frame's own bottom, 10 px below.
I did not take it because it changes the drawing you actually looked at.</p>
<p class="need-b"><span class="lbl">if silence</span>It stays as the gallery drew it.</p>
{verdict("8b", "v7's 2 px seam between arms")}</div>

<div class="need"><div class="need-h"><span class="tag">FYI</span>v8 is v1 — say the word and it comes back out</div>
<p class="need-b"><span class="lbl">what</span>Its arm tokens are byte-identical to v1's. It exists so the pill
can offer the three you named.</p>
<p class="need-b"><span class="lbl">recommend</span>Keep it until you have picked, then delete whichever of the
eight did not win.</p>
<p class="need-b"><span class="lbl">if silence</span>It stays.</p>
{verdict("8c", "v8 duplicates v1")}</div>

<h3>Done and proved</h3>
<ul class="small">
<li>Three drawings in <code>REGION_VARIANTS</code> as <code>v6</code>/<code>v7</code>/<code>v8</code>, values
read off the rendered gallery — not one element added to <code>ArmRow</code>.</li>
<li>Nesting measured at 1, 2 and 3 levels in the real app, on real <code>parentId</code> containment, at 1:1.</li>
<li>The board opened through the product's own ☰ › File › Open, the pill walked v1 → v6 → v7 → v8, every
capture on this page looked at.</li>
<li>The For Loop's paint proved identical across all four drawings.</li>
<li>All five gates green, baselines recorded before the first edit.</li>
</ul>

<h3>Left, and deliberately not done</h3>
<ul class="small">
<li><strong>Nothing merged.</strong> The work is on its branch; landing it is your call.</li>
<li><strong>No drawing promoted to <code>v1</code>.</strong> That is the pick above.</li>
<li><strong>v7's seam not “fixed”.</strong> See 8b — changing it would be proposing something you never saw.</li>
<li><strong>The For Loop's own drawing untouched.</strong> You said this treatment is the Branch's; a loop has
no arms, so there was nothing to draw and nothing was invented.</li>
</ul>

<h2><span class="k">9</span>Sources — every number above came from one of these</h2>
<ul class="src">{{SRC}}</ul>

<div class="overall"><h3>Anything else</h3>
<textarea id="fb-overall" placeholder="free text — travels to the top of the copied markdown" spellcheck="false"></textarea></div>
<div id="outwrap"><p class="small dim" id="status"></p><textarea id="out" spellcheck="false"></textarea></div>

</main>
<div class="dock"><span class="tally" id="tally"></span><button id="clear">Clear</button><button class="go" id="copy">Copy my feedback</button></div>
<script>
(function () {{
  var KEY = "fb:{NAME}";
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
    document.getElementById("tally").textContent = (n || notes)
      ? (n + " verdict" + (n === 1 ? "" : "s") + ", " + notes + " note" + (notes === 1 ? "" : "s"))
      : "nothing marked yet — silence promotes nothing and leaves v1 the default";
  }}
  tally();
  function markdown() {{
    var out = ["# Feedback — three region drawings (2026-09-19)", ""];
    if (state.__overall) out.push(state.__overall.trim(), "");
    var rows = items.map(function (el) {{
      var s = state[el.dataset.key] || {{}}; if (!s.v && !s.note) return null;
      return "- **" + el.dataset.num + " · " + el.dataset.title + "** — " + (s.v ? s.v.toUpperCase() : "(no verdict)") + (s.note ? " — " + s.note.trim() : "");
    }}).filter(Boolean);
    if (rows.length) out.push(rows.join("\\n"), "");
    if (out.length === 2) out.push("_(nothing marked — nothing promoted, v1 stays the default)_");
    return out.join("\\n");
  }}
  function show(text, msg) {{
    var wrap = document.getElementById("outwrap"), ta = document.getElementById("out");
    ta.value = text; wrap.classList.add("open"); wrap.scrollIntoView({{ block: "center" }}); ta.focus(); ta.select();
    document.getElementById("status").textContent = msg;
  }}
  function copy() {{
    var text = markdown();
    var done = function () {{ show(text, "Copied — and selected below, in case the clipboard refused (file:// often does)."); }};
    var fail = function () {{ show(text, "The clipboard refused on this origin — the text is selected below; press Ctrl-C / ⌘C."); }};
    try {{ if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fail); else fail(); }} catch (e) {{ fail(); }}
  }}
  document.getElementById("copy").addEventListener("click", copy);
  document.getElementById("clear").addEventListener("click", function () {{ state = {{}}; save(); items.forEach(paint); overall.value = ""; tally(); }});
}})();
</script>
</body></html>"""

    srcs = "".join(
        f'<li id="src{i}"><span class="n">{i}</span>{esc(path)}</li>'
        for i, path in enumerate(dict.fromkeys(SOURCES), start=1)
    )
    return page.replace("{SRC}", srcs)


def encoded_size(page: str) -> int:
    return len("data:text/html,") + len(quote(page, safe=URI_SAFE).encode())


def main() -> int:
    page = build()
    enc = encoded_size(page)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(page, encoding="utf-8")
    disk = OUT.stat().st_size
    print(f"wrote {OUT}")
    print(f"  on disk  {disk:,} bytes")
    print(f"  encoded  {enc:,} bytes  (preview cap {CAP:,}) — {'OK' if enc < CAP else 'OVER: browser only'}")
    print(f"  inputs   {len(dict.fromkeys(SOURCES))} files read at build time")
    return 0 if enc < CAP else 1


if __name__ == "__main__":
    raise SystemExit(main())
