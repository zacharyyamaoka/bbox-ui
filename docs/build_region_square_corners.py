#!/usr/bin/env python3
"""Build the report for Zach's 2026-09-19 "the edges should be straight" note.

    python3 docs/build_region_square_corners.py

Writes a self-contained page (every capture inlined as a data URI) to the
gitignored media half of reports/ in the MAIN checkout:

    /home/bam/bbox-ui/reports/media/region-square-corners-2026-09-19.html

Every number on the page is measured at build time, from files on disk:

  - reports/media/region-square-corners-2026-09-19/measured-{before,after}.json
    — computed `border-radius` read off the REAL app (apps/systemsketch served
    by vite on :4390), after drawing a Branch with the dock's own Branch tool
    and sweeping all five region drawings through the switch attribute. The
    two halves are one script run apart, with only `BlockFace.tsx`'s one line
    reverted in between, so the crops are the same gesture at the same zoom.
  - the same directory's gates/*.log — each gate re-run on this tree.
  - apps/storybook-basics/src/components/region.tsx — the four radii are
    quoted from the live source, never retyped, so the page cannot drift from
    the rule it describes.
  - apps/storybook-basics/src/skin/regionVariants.css — each drawing's own
    `--bbox-region-frame-radius` / `--bbox-region-corner-radius`.
  - git, for the branch and commit.

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
NAME = "region-square-corners-2026-09-19"
MEDIA = MAIN / "reports" / "media" / NAME
OUT = MAIN / "reports" / "media" / f"{NAME}.html"
SB = REPO / "apps" / "storybook-basics"
APP = REPO / "apps" / "systemsketch"
CAP = 2_097_024
URI_SAFE = "-_.!~*'()"

SOURCES: list[str] = []


def cite(*ns: int) -> str:
    return '<span class="cite">' + ",".join(f'<a href="#src{n}">{n}</a>' for n in ns) + "</span>"


def esc(s: str) -> str:
    return html.escape(str(s))


def attr(s: str) -> str:
    return html.escape(str(s), quote=True)


def img(path: pathlib.Path, *, zoom: bool = False) -> str:
    data = path.read_bytes()
    SOURCES.append(str(path))
    style = ' style="image-rendering:pixelated"' if zoom else ""
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


def measured(phase: str) -> dict:
    path = MEDIA / f"measured-{phase}.json"
    SOURCES.append(str(path))
    return json.loads(path.read_text())


def gate(stem: str) -> dict:
    path = MEDIA / "gates" / f"{stem}.log"
    SOURCES.append(str(path))
    text = path.read_text()
    files = re.search(r"Test Files\s+(\d+) passed \((\d+)\)", text)
    tests = re.search(r"Tests\s+(\d+) passed \((\d+)\)", text)
    return {
        "ok": bool(re.search(r"^exit 0\s*$", text, re.M)),
        "files": files.group(2) if files else None,
        "tests": tests.group(2) if tests else None,
        "failed": bool(re.search(r"\bfailed\b", text)),
    }


def corner_style_source() -> list[tuple[str, str]]:
    """The four radii, quoted verbatim out of the live `region.tsx` — the page
    cannot describe a rule the file no longer holds."""
    src = SB / "src" / "components" / "region.tsx"
    SOURCES.append(str(src))
    body = re.search(
        r"export const REGION_CORNER_BLOCK_STYLE: CSSProperties = \{(.*?)\n\};", src.read_text(), re.S
    )
    if not body:
        raise SystemExit("REGION_CORNER_BLOCK_STYLE not found in region.tsx")
    rows = []
    for line in body.group(1).strip().splitlines():
        key, _, value = line.strip().rstrip(",").partition(": ")
        rows.append((key, value))
    if len(rows) != 4:
        raise SystemExit(f"expected four radii, read {len(rows)}")
    return rows


def variant_radii() -> dict[str, dict[str, str]]:
    """Each drawing's own two radius tokens, read out of the skin CSS."""
    css = SB / "src" / "skin" / "regionVariants.css"
    SOURCES.append(str(css))
    text = css.read_text()
    out: dict[str, dict[str, str]] = {}
    for block in re.finditer(r'\[data-bbox-region-variant="(v\d)"\]\s*\{(.*?)\n\}', text, re.S):
        vid, body = block.group(1), block.group(2)
        out[vid] = {
            key: (re.search(rf"--bbox-region-{key}:\s*([^;]+);", body).group(1).strip()
                  if re.search(rf"--bbox-region-{key}:\s*([^;]+);", body) else "—")
            for key in ("frame-radius", "corner-radius")
        }
    return out


def title_of(vid: str) -> str:
    ts = SB / "src" / "skin" / "regionVariants.ts"
    SOURCES.append(str(ts))
    block = re.search(rf'\n  {vid}: \{{(.*?)\n  \}},', ts.read_text(), re.S)
    name = re.search(r'title: "([^"]+)"', block.group(1)) if block else None
    return name.group(1) if name else vid


# ------------------------------------------------------------------ page


def radius_cell(value: str, *, square_is_good: bool) -> str:
    good = (value == "0px") if square_is_good else (value != "0px")
    cls = "good" if good else "bad"
    return f'<td class="r {cls}">{esc(value)}</td>'


def build() -> str:
    before, after = measured("before"), measured("after")
    style_rows = corner_style_source()
    tokens = variant_radii()
    branch = git("rev-parse", "--abbrev-ref", "HEAD")
    tip = git("rev-parse", "--short", "HEAD")
    # The commit that carries the CHANGE, not whichever commit happens to be
    # the tip when this runs — otherwise re-running the builder renames the
    # thing the page is about.
    sha = git("log", "-1", "--format=%h", "--", "apps") or tip
    subject = git("log", "-1", "--format=%s", "--", "apps")

    gates = [
        ("trunk · tsc", "trunk-tsc", "typecheck"),
        ("trunk · unit", "trunk-unit", "vitest --project=unit"),
        ("trunk · storybook", "trunk-storybook", "real Chromium"),
        ("app · tsc", "app-tsc", "typecheck"),
        ("app · tests", "app-tests", "unit + smoke"),
    ]
    gate_cards = []
    for label, stem, note in gates:
        g = gate(stem)
        big = g["tests"] or ("clean" if g["ok"] else "FAIL")
        cls = "" if g["ok"] and not g["failed"] else " bad"
        files = f"{g['files']} files · " if g["files"] else ""
        gate_cards.append(
            f'<div class="gate"><div class="big{cls}">{esc(big)}</div>'
            f'<div class="lbl">{esc(label)}<br><span class="dim2">{files}{esc(note)}</span></div></div>'
        )

    # The five drawings, before and after, off the browser.
    sweep_rows = []
    for vid in ("v1", "v2", "v3", "v4", "v5"):
        b = before["byVariant"][vid]["card"]
        a = after["byVariant"][vid]["card"]
        frame_r = tokens.get(vid, {}).get("frame-radius", "—")
        corner_r = tokens.get(vid, {}).get("corner-radius", "—")
        sweep_rows.append(
            f'<tr><td><code>{vid}</code> {esc(title_of(vid))}</td>'
            f'<td class="r dim">{esc(b["tl"])} / {esc(b["tr"])} / {esc(b["br"])} / {esc(b["bl"])}</td>'
            + radius_cell(a["tl"], square_is_good=False)
            + radius_cell(a["tr"], square_is_good=True)
            + radius_cell(a["br"], square_is_good=(vid == "v2"))
            + radius_cell(a["bl"], square_is_good=True)
            + f'<td class="dev"><code>{esc(frame_r)}</code><br><code>{esc(corner_r)}</code></td></tr>'
        )

    style_table = "".join(
        f"<tr><td><code>{esc(k)}</code></td><td><code>{esc(v)}</code></td>"
        f"<td class=\"dev\">{esc(note)}</td></tr>"
        for (k, v), note in zip(
            style_rows,
            [
                "the shared corner — the card and the frame curve together, so there is no junction to break",
                "JUNCTION: the card's top edge continues as the frame's top rule",
                "JUNCTION: the card's left edge continues as the frame's left rule",
                "free — this corner touches no frame edge; the drawing decides (v2 squares it for its header rule)",
            ],
        )
    )

    b_card, a_card = before["default"]["card"], after["default"]["card"]

    # A to-scale section of the bottom-left junction: the 10px radius, the
    # frame's 1px rule, and exactly what the eye is catching.
    def junction_svg() -> str:
        """The bottom-left junction at 9x, both states, drawn from the measured
        radius rather than from a stock illustration — 1 SVG unit renders as
        1 CSS px, so the 90-unit arc really is the 10px the browser reported."""
        S = 9
        r = int(re.sub(r"[^0-9.]", "", b_card["bl"]) or 10) * S
        top, bot = 46, 46 + r + 40
        return f"""<svg viewBox="0 0 760 250" width="100%" style="max-width:760px;display:block;margin:0 auto" role="img" aria-label="the bottom-left junction at nine times scale, before and after">
  <defs><style>
    .wall {{ stroke:#6b7383; stroke-width:{S * 0.55:.1f}; fill:none }}
    .card {{ stroke:#e6e8ee; stroke-width:{S * 0.55:.1f}; fill:none; stroke-linecap:square }}
    .hd {{ fill:#cfd5e0; font:600 13px ui-monospace,monospace }}
    .lbl {{ fill:#9aa3b2; font:12px -apple-system,"Segoe UI",sans-serif }}
    .foot {{ fill:#6b7383; font:11px ui-monospace,monospace }}
    .hot {{ fill:#e5534b }} .ok {{ fill:#3fb950 }}
    .gap {{ fill:#e5534b26; stroke:#e5534b; stroke-width:1.4; stroke-dasharray:5 4 }}
  </style></defs>

  <text class="hd" x="14" y="22" fill="#ff8a80">BEFORE — {esc(b_card['bl'])} at the junction</text>
  <path class="wall" d="M 60 {top} L 60 {bot}"/>
  <path class="card" d="M 60 {top} L 60 {bot - 40 - r} A {r} {r} 0 0 0 {60 + r} {bot - 40} L {60 + r + 60} {bot - 40}"/>
  <path class="gap" d="M 60 {bot - 40 - r} A {r} {r} 0 0 0 {60 + r} {bot - 40} L 60 {bot - 40} Z"/>
  <circle class="hot" cx="60" cy="{bot - 40 - r}" r="4.5"/><circle class="hot" cx="{60 + r}" cy="{bot - 40}" r="4.5"/>
  <text class="lbl" x="{60 + r + 14}" y="{bot - 100}">the card's wall pulls back {esc(b_card['bl'])}</text>
  <text class="lbl" x="{60 + r + 14}" y="{bot - 82}">from the frame's line, so the border</text>
  <text class="lbl" x="{60 + r + 14}" y="{bot - 64}">steps in and back out inside 10px</text>

  <text class="hd" x="414" y="22" fill="#5ee08a">AFTER — {esc(a_card['bl'])}</text>
  <path class="wall" d="M 460 {top} L 460 {bot}"/>
  <path class="card" d="M 460 {top} L 460 {bot - 40} L {460 + r + 60} {bot - 40}"/>
  <circle class="ok" cx="460" cy="{bot - 40}" r="4.5"/>
  <text class="lbl" x="{460 + 18}" y="{bot - 64}">one line down, one line out</text>

  <text class="foot" x="14" y="238">to scale at 9× — the frame's 1px rule and the card's own {esc(b_card['bl'])} radius, as the browser reported them</text>
</svg>"""

    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Region corners — 2026-09-19</title>
<style>
:root {{ --bg:#0e0f12; --panel:#15171c; --panel2:#1b1e25; --line:#282d38; --line2:#343b49;
  --fg:#e6e8ee; --dim:#9aa3b2; --dim2:#6b7383; --accent:#f0883e; --accent2:#5aa9f8; --ok:#3fb950; --warn:#e5534b; --gold:#e8c06a;
  --mono: ui-monospace,"SF Mono",Menlo,Consolas,monospace; }}
* {{ box-sizing:border-box }}
body {{ margin:0; background:var(--bg); color:var(--fg); font:15px/1.55 -apple-system,"Segoe UI",Inter,Roboto,sans-serif }}
main {{ max-width:1160px; margin:0 auto; padding:28px 24px 150px }}
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
td.dev {{ color:var(--dim); font-size:12.5px }}
td.r {{ font-family:var(--mono); text-align:center; white-space:nowrap }}
td.r.good {{ color:#5ee08a }} td.r.bad {{ color:#ff8a80 }}
figure {{ margin:0; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:8px; min-width:0 }}
figure img {{ width:100%; display:block; border-radius:6px; background:#f7f7f8 }}
figure.dark img {{ background:#111 }}
figure.zoom img {{ max-width:300px; margin:0 auto }}
figcaption {{ color:var(--dim); font-size:12.5px; padding:8px 4px 2px }}
.grid2 {{ display:grid; grid-template-columns:1fr 1fr; gap:14px; margin:12px 0; align-items:start }}
.grid3 {{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; margin:12px 0; align-items:start }}
@media (max-width:900px) {{ .grid2, .grid3 {{ grid-template-columns:1fr }} }}
.finding {{ background:#2a241633; border:1px solid #8a6d1c; border-radius:10px; padding:14px 16px; margin:16px 0 }}
.finding h3 {{ margin:0 0 6px; color:var(--gold) }}
.default {{ background:#12301c33; border:1px solid #2f7a45; border-radius:10px; padding:10px 14px; margin:12px 0; color:#cfe9d6 }}
.svgbox {{ background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px; margin:12px 0 }}
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

<h1>“The edges where it meets the region should be straight”</h1>
<p class="prov">Claude Opus 5, 2026-09-19. Branch <code>{esc(branch)}</code>, commit <code>{esc(sha)}</code> — “{esc(subject)}”; branch tip <code>{esc(tip)}</code>. Every radius on this page was read with <code>getComputedStyle</code> off a running browser; every test count was parsed from a gate log re-run on this tree. Bare numbers after a claim are sources in the index at the bottom.</p>

<p class="lead"><strong>Your two screenshots are of two different renderers — that is the whole bug.</strong> The DOM render you called <em>done properly</em> has always squared the corner card’s <strong>top-right and bottom-left</strong>: the two junctions where the card’s own edges continue the frame’s border. The tldraw app never wore that rule. Measured in the real app before this change, its card read <code>{esc(b_card['tl'])}</code> on all four corners — <em>in all five region drawings</em>, so it was detached from the region’s tokens entirely, not merely rounded. It now reads <code>{esc(a_card['tl'])} / {esc(a_card['tr'])} / {esc(a_card['br'])} / {esc(a_card['bl'])}</code>, which is your For Loop exactly.</p>

<div class="finding">
<h3>One thing I read differently from the brief, so you can overrule it cheaply</h3>
<p>The brief I was given read your annotation as “square all four corners, in the trunk’s default drawing.” I checked before building, and the evidence says otherwise on both halves — so this commit squares <strong>two</strong> corners, not four, and the trunk’s default drawing is <strong>unchanged</strong> because it was already right. The section below is the evidence. If you did mean all four, it is a one-line change from here and <a href="#s6">Q1</a> is where to say so.</p>
</div>

<h2 id="s1"><span class="k">01</span>Your three images, and what each one actually is</h2>
<div class="grid3">
  {fig(img(MEDIA / "zach-1-app-today.png"), "Yours, 180501 — the <strong>tldraw app</strong>. <code>input 1</code> is minted only by <code>apps/systemsketch/…/cornerBlock.ts</code>, so this frame can only be the app " + cite(5), cls="dark")}
  {fig(img(MEDIA / "zach-2-annotation.png"), "Yours, 180659 — your annotation. At <em>top-right</em> and <em>bottom-left</em> the grey strokes close into a hard square corner; at top-left and bottom-right they stop short and leave the card's arc showing", cls="dark")}
  {fig(img(MEDIA / "zach-3-done-properly.png"), "Yours, 180651 — “done properly”. This is a crop of <code>115424.png</code>, the <strong>DOM render</strong> from the morning. Its top-left and bottom-right are still <em>round</em>", cls="dark")}
</div>
<p>Read together they are consistent, and they say something narrower than “square the corners”. <strong>“The edges where it meets the region”</strong> is literally two places: the card’s top edge becomes the frame’s top rule, and its left edge becomes the frame’s left rule. Those are its <strong>top-right</strong> and <strong>bottom-left</strong> corners — the two your strokes close squarely. The other two are not junctions at all: top-left <em>is</em> the frame’s own corner (card and frame curve together), and bottom-right touches no frame edge. Your “done properly” example rounds both.</p>

<h2 id="s2"><span class="k">02</span>The junction, to scale</h2>
<div class="svgbox">{junction_svg()}</div>
<p class="dim small">Drawn from the measured numbers, not from a textbook: the card’s bottom-left radius was <code>{esc(b_card['bl'])}</code> and the frame’s rule is 1px {cite(1, 2)}. The eye catches the notch, not the curve — the border steps in by the radius and back out again within 10px.</p>

<h2 id="s3"><span class="k">03</span>The real app, before → after</h2>
<p class="dim small">Same gesture both times: the dock’s <strong>Branch</strong> row, then a drag on the canvas, in <code>apps/systemsketch</code> served by vite on :4390. Same crop, same zoom, one script run apart with only <code>BlockFace.tsx</code>’s one line reverted in between {cite(1, 2)}.</p>
<div class="grid2">
  {fig(img(MEDIA / "app-before.png"), f"BEFORE — <code>{esc(b_card['tl'])} / {esc(b_card['tr'])} / {esc(b_card['br'])} / {esc(b_card['bl'])}</code> (tl/tr/br/bl). Compare it with your own 180501 above: same card, same <code>input 1</code>")}
  {fig(img(MEDIA / "app-after.png"), f"AFTER — <code>{esc(a_card['tl'])} / {esc(a_card['tr'])} / {esc(a_card['br'])} / {esc(a_card['bl'])}</code>. The top edge leaves square into the frame's top rule; the left edge runs straight down into the frame's left rule")}
</div>
<h3>The two junctions, close up</h3>
<div class="grid2">
  {fig(img(MEDIA / "junction-bl-before.png", zoom=True), f"Bottom-left, BEFORE — the card's wall retracts {esc(b_card['bl'])} and the bottom edge arcs away from the frame's line", cls="zoom")}
  {fig(img(MEDIA / "junction-bl-after.png", zoom=True), "Bottom-left, AFTER — one line down, one line out", cls="zoom")}
  {fig(img(MEDIA / "junction-tr-before.png", zoom=True), f"Top-right, BEFORE — the card's top edge curves down before the frame's top rule takes over ({esc(b_card['tr'])})", cls="zoom")}
  {fig(img(MEDIA / "junction-tr-after.png", zoom=True), "Top-right, AFTER — the card's top edge and the frame's top rule are one line", cls="zoom")}
</div>

<h2 id="s4"><span class="k">04</span>What “done properly” turned out to differ by</h2>
<p>Nothing about the <em>For Loop</em>. The difference is the <strong>renderer</strong>. In the trunk’s DOM canvas the corner card is a React child of the <code>Region</code> element, and <code>hosts/nodeViews.tsx</code> spreads <code>REGION_CORNER_BLOCK_STYLE</code> onto it. In the app the corner card is a real <code>ss-block</code> <strong>child shape</strong> — your own “everything is really a block” ruling — which tldraw renders in its own subtree. It is not a React descendant of the <code>Region</code> element, so no rule the component could write, class or descendant selector, can reach it. The trunk was green the whole time and proved nothing about what was on screen.</p>
<div class="grid2">
  {fig(img(MEDIA / "trunk-loop.png"), "The trunk's own For Loop corner — the subject of your “done properly” crop. Unchanged by this work; <code>10px / 0px / 10px / 0px</code> " + cite(6))}
  {fig(img(MEDIA / "trunk-br.png"), "And the trunk's Branch, on the same board — identical rule. This is what the app now matches " + cite(6))}
</div>

<h2 id="s5"><span class="k">05</span>Default only, or all five drawings?</h2>
<p><strong>All five — because it was never a variant axis.</strong> The two junction corners are hard <code>0</code> in one place, and the other two follow each drawing’s own tokens. So the fix rides the tokens you already have; it does not add a sixth drawing or a per-variant decision. Measured in the app through the bottom-right switch, all five {cite(1, 2)}:</p>
<table><thead><tr><th>Drawing</th><th>Before (tl/tr/br/bl)</th><th>tl<br><span class="dim2">shared</span></th><th>tr<br><span class="dim2">junction</span></th><th>br<br><span class="dim2">free</span></th><th>bl<br><span class="dim2">junction</span></th><th>its own tokens {cite(4)}</th></tr></thead>
<tbody>{''.join(sweep_rows)}</tbody></table>
<p class="dim small">Green = what the rule wants. Note <code>v2</code> and <code>v4</code> come out at <strong>8px</strong>, not 10 — before this change the card read 10px in every drawing, so it was not following the region’s radius token at all. And <code>v2</code> squares its <em>free</em> corner too, which it already wanted: its full-width header rule leaves the card cleanly instead of departing from a curve.</p>

<h2 id="s6"><span class="k">06</span>Where it landed — the trunk owns the look, the app says which card</h2>
<p>Per your 2026-09-19 rule. The radii are quoted here straight out of the live source {cite(3)}:</p>
<table><thead><tr><th style="width:230px">Corner</th><th style="width:330px">Value in <code>region.tsx</code></th><th>Why</th></tr></thead><tbody>{style_table}</tbody></table>
<table><thead><tr><th style="width:250px">Element</th><th>Today</th><th>Off-the-shelf part, by name</th><th>Behaviour that must survive</th></tr></thead><tbody>
<tr><td>The four radii</td><td>Were reachable only by a React child of <code>Region</code></td><td><code>REGION_CORNER_BLOCK_STYLE</code> (trunk, <code>components/region.tsx</code>) — unchanged values</td><td>tl and br still follow the drawing's tokens; v2 still squares its free corner</td></tr>
<tr><td>“Is this card a corner?”</td><td>Nothing asked</td><td><code>isRegionCornerBlock</code> (app, <code>shapes/region/cornerBlock.ts</code>) — <code>cornerBlockOf</code>'s own parent check, read from the block's side</td><td>A duplicated region's original card is not mistaken for a corner until <code>installRegionKit</code> repairs the copy</td></tr>
<tr><td>Applying it</td><td>—</td><td>One spread in <code>BlockFace.tsx</code>, exactly as <code>hosts/nodeViews.tsx</code> already does it</td><td>No radius literal in the app; <code>Block</code>'s documented <code>style</code>-wins seam, not an <code>!important</code></td></tr>
<tr><td><strong>Unchanged (stock seam)</strong></td><td>The trunk's five region drawings, <code>regionVariants.css</code>, <code>Region</code>'s own markup, <code>Block</code>, every other block on the board</td><td>—</td><td>A free-standing card keeps all four of its own corners — asserted in both new test cases, so this can never be read as “blocks are square now”</td></tr>
</tbody></table>
<p>Two new cases, both <strong>mutation-tested red</strong> before being trusted:</p>
<ul>
<li><code>RegionVariants.stories.tsx</code> → <em>the corner card’s junctions with the frame are square (all five)</em> — sweeps the five drawings through the live attribute switch and measures all four radii. It also asserts tl and br stay <em>round</em>, so the over-correction (“square them all”) fails it too, not only the regression. Flipping <code>borderTopRightRadius</code> back to the frame radius turned 11 of 12 cases in that file red {cite(7)}.</li>
<li><code>variants.smoke.test.tsx</code> → <em>app-variant-switch (e)</em> — the only place this failure is visible, because it drives the real tldraw child shape. Reverting the one line in <code>BlockFace.tsx</code> turns it red {cite(8)}.</li>
</ul>

<h2 id="s7"><span class="k">07</span>Gates, on this tree</h2>
<div class="gates">{''.join(gate_cards)}</div>
<p class="dim small">Re-run for this report, logs in the media directory beside the captures {cite(9, 10, 11, 12, 13)}. The trunk counts include the new story case; the app count is 149 before it, 150 after.</p>

<h2 id="s8"><span class="k">08</span>Your call</h2>
<div class="default">Nothing here is blocking. If you say nothing, this stands: <strong>two junction corners square, the shared and free corners left as your For Loop draws them, in all five drawings.</strong> It is one commit on its own branch, not merged.</div>

<div class="need">
  <div class="need-h"><span class="tag">Q1</span>Two corners, or all four?</div>
  <p class="need-b"><span class="lbl">what I did</span>Squared the two junctions only — <code>tr</code> and <code>bl</code>.</p>
  <p class="need-b"><span class="lbl">why</span>“The edges where it <em>meets</em> the region” names exactly those two, and the For Loop you called done properly rounds the other two. Your strokes also close squarely at those two and stop short at the other two.</p>
  <p class="need-b"><span class="lbl">if you meant all four</span>One line: <code>--bbox-region-frame-radius: 0</code> on the drawing, which squares the frame and the shared corner together. Say so and it is done in a minute.</p>
  {verdict("Q1", "Two junction corners square, not four")}
</div>

<div class="need">
  <div class="need-h"><span class="tag">Q2</span>The app change</div>
  <p class="need-b"><span class="lbl">what I did</span>Touched <code>apps/systemsketch</code> — three lines of wiring plus a predicate — even though the brief said trunk only.</p>
  <p class="need-b"><span class="lbl">why</span>The trunk was already correct; the bug was entirely that the app never wore the rule, and no trunk-side change can cross a tldraw shape boundary. The radii stay the trunk’s; the app only names which card is a corner. That is the “light bit of configuration” your rule allows — but it is your rule, so it is your call.</p>
  {verdict("Q2", "The app wires the trunk's radii onto its corner shape")}
</div>

<div class="need">
  <div class="need-h"><span class="tag">Q3</span>Deliberately not done</div>
  <p class="need-b"><span class="lbl">not merged</span>The branch is left alone — integration is your decision, not “finish the implementation”.</p>
  <p class="need-b"><span class="lbl">not touched</span>The dock’s pinned build still serves the old commit, so the icon will show the rounded card until this lands. <code>claude/chrome-files-settings-2026-09-19</code> and its five live lanes were not gone near.</p>
  <p class="need-b"><span class="lbl">not generalised further</span>Only the region corner. A <code>NameTab</code> (a region with no corner block) already hard-codes <code>rounded-tl</code>/<code>rounded-br</code> and reads correctly; I left it.</p>
  {verdict("Q3", "Left unmerged; dock build not refreshed")}
</div>

<h2 id="s9"><span class="k">09</span>See it yourself</h2>
<p class="dim small">The app, on this branch, with hot reload. Draw a Branch from the dock’s system row — the card’s top-right and bottom-left are square.</p>
<pre class="cmd">pnpm --dir /home/bam/bbox-ui/.claude/worktrees/region-square-corners --filter systemsketch exec vite --port 4390 --strictPort</pre>
<p class="dim small">Then <code>http://localhost:4390/</code>. Stop it yourself when you are done — deliberately not a button: <code>pkill -f "vite --port 4390"</code></p>

<div class="overall"><h3>Anything else</h3><textarea id="fb-overall" spellcheck="false" placeholder="your call…"></textarea></div>
<div id="outwrap"><h3>Your feedback, as markdown</h3><p class="dim small" id="status"></p><textarea id="out" spellcheck="false"></textarea></div>

<h2 id="s10"><span class="k">10</span>Source index</h2>
<ul class="src">
<li id="src1"><span class="n">1</span><code>reports/media/{NAME}/measured-before.json</code> — computed radii read off the real app before the change, default drawing + all five</li>
<li id="src2"><span class="n">2</span><code>reports/media/{NAME}/measured-after.json</code> — the same run after it</li>
<li id="src3"><span class="n">3</span><code>apps/storybook-basics/src/components/region.tsx</code> — <code>REGION_CORNER_BLOCK_STYLE</code>, quoted verbatim at build time</li>
<li id="src4"><span class="n">4</span><code>apps/storybook-basics/src/skin/regionVariants.css</code> — each drawing's radius tokens</li>
<li id="src5"><span class="n">5</span><code>apps/systemsketch/src/shapes/region/cornerBlock.ts</code> — <code>input 1</code> is minted here and nowhere else in the repo</li>
<li id="src6"><span class="n">6</span>Storybook <code>presets-controlflow-gallery--branch-in-loop</code>, captured headless on :5487</li>
<li id="src7"><span class="n">7</span>Mutation run: <code>borderTopRightRadius: FRAME_RADIUS</code> → 11 failed / 1 passed in <code>RegionVariants.stories.tsx</code>; restored</li>
<li id="src8"><span class="n">8</span>Mutation run: <code>style={{undefined}}</code> in <code>BlockFace.tsx</code> → <em>app-variant-switch (e)</em> failed; restored</li>
<li id="src9"><span class="n">9</span><code>reports/media/{NAME}/gates/trunk-tsc.log</code></li>
<li id="src10"><span class="n">10</span><code>reports/media/{NAME}/gates/trunk-unit.log</code></li>
<li id="src11"><span class="n">11</span><code>reports/media/{NAME}/gates/trunk-storybook.log</code></li>
<li id="src12"><span class="n">12</span><code>reports/media/{NAME}/gates/app-tsc.log</code></li>
<li id="src13"><span class="n">13</span><code>reports/media/{NAME}/gates/app-tests.log</code></li>
<li id="src14"><span class="n">14</span><code>zach_brain/Projects/SystemSketch/PROJECT - System Sketch.md</code> § “More feebdakc fo rsystem sketch” — your words and the three images</li>
</ul>
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
      : "nothing marked yet — silence keeps the two junction corners square";
  }}
  tally();
  function markdown() {{
    var out = ["# Feedback — region corners (2026-09-19)", ""];
    if (state.__overall) out.push(state.__overall.trim(), "");
    var rows = items.map(function (el) {{
      var s = state[el.dataset.key] || {{}}; if (!s.v && !s.note) return null;
      return "- **" + el.dataset.num + " · " + el.dataset.title + "** — " + (s.v ? s.v.toUpperCase() : "(no verdict)") + (s.note ? " — " + s.note.trim() : "");
    }}).filter(Boolean);
    if (rows.length) out.push(rows.join("\\n"), "");
    if (out.length === 2) out.push("_(nothing marked — two junction corners square, all five drawings, stands)_");
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
    return page


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
    print(f"  inputs   {len(SOURCES)} files read at build time")
    return 0 if enc < CAP else 1


if __name__ == "__main__":
    raise SystemExit(main())
