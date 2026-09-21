#!/usr/bin/env python3
"""Build the SystemSketch -> bbox-ui parity report.

Three columns, which is what Zach asked for: what the old app (and FigJam) did,
what bbox-ui did before this round, and what it does now.

Column 1 is HIS OWN screenshots of the donor, lifted from the vault. That is
deliberate and not laziness: the archived SystemSketch autosaves into whatever
board it has open, and that is his 31 real boards, so driving it for a
screenshot is not worth the risk. Columns 2 and 3 are real captures of the
running app, taken by docs/capture_parity_before.mjs in DARK colour scheme
because that is what he runs.

Self-contained HTML with every image inlined, written to the main checkout's
gitignored reports/media/ so a peer's `git stash -u` cannot take it.
"""
from __future__ import annotations

import base64
import pathlib
import sys
from urllib.parse import quote

MEDIA = pathlib.Path("/home/bam/bbox-ui/reports/media/parity-2026-09-20")
OUT = pathlib.Path("/home/bam/bbox-ui/reports/media/parity-2026-09-20.html")


def uri(rel: str) -> str:
    p = MEDIA / rel
    if not p.exists():
        return ""
    return "data:image/png;base64," + base64.b64encode(p.read_bytes()).decode()


def img(rel: str, alt: str) -> str:
    u = uri(rel)
    if not u:
        return '<div class="missing">not captured</div>'
    return f'<img alt="{alt}" src="{u}" loading="lazy">'


# ---------------------------------------------------------------- the rows

ROWS = [
    {
        "id": "pill-surface",
        "title": "The pill's surface",
        "ask": "“It feels like you are making this look like the tldraw stock floating toolbar which I don’t like… Our goal was for it to be more like system sketch which is copying the figjam floating tool bar.”",
        "donor_img": "donor/donor-pill-appearance.png",
        "before_img": "donor/zach-current-pill.png",
        "after_img": "after-pill-style.png",
        "donor": "FigJam’s pill is <code>rgb(30,30,30)</code> with white ink <strong>always</strong>, in every theme — traced off FigJam’s own DOM, not read off a screenshot. 40px tall, 13px radius, <code>0 4px</code> padding, and a three-part shadow.",
        "before": "<code>bg-foreground</code>, which <strong>inverts with the theme</strong>: a dark bar in light mode, a near-white bar in dark mode. Zach runs dark, so he sees a white pill with dark icons on a dark canvas — which is precisely tldraw’s stock look. Worse, the open dropdown stayed dark under the light pill: trigger and popover did not share a surface.",
        "after": "",
    },
    {
        "id": "icon-align",
        "title": "Icon alignment",
        "ask": "“You can see for example that the icons are not aligned”",
        "donor_img": "donor/donor-pill-view-opacity.png",
        "before_img": "donor/zach-icon-misalign.png",
        "after_img": "after-pill-closeup.png",
        "donor": "Every FigJam cell is the <strong>same height as the bar</strong> (40px) and centres its glyph, so there is exactly one baseline.",
        "before": "Measured in the running app: <strong>three baselines and two button heights in one bar</strong>. Content centres at y=20 (style cells), y=14 (Arrange) and y=16 (Focus/Duplicate/Delete) against a bar whose true centre is 20; buttons 28px and 32px. Cause: <code>items-stretch</code> beat <code>items-center</code> through twMerge, so definite-height children landed at cross-start.",
        "after": "",
    },
    {
        "id": "cell-geometry",
        "title": "Cell geometry",
        "ask": "“the sizing and formating and everything is a bit off here”",
        "donor_img": "donor/donor-pill-wrap.png",
        "before_img": "before-pill-style.png",
        "after_img": "after-pill-style.png",
        "donor": "Four traced families, every one 40px tall with a 5px radius: plain icon <code>32×40</code>, trigger-with-value <code>56×40</code>, colour <code>54×40</code>, text combobox <code>144×40</code>. Separator <code>1×40</code> in <code>rgb(56,56,56)</code> with 4px clear.",
        "before": "Cells 28px and 32px tall inside a 40px bar, so nothing filled the bar. Radius 14px on the bar (FigJam: 13px).",
        "after": "",
    },
    {
        "id": "chrome-size",
        "title": "Chrome size on a 4K screen",
        "ask": "“Compare the chrome size though to the same screen in exali draw or tldraw… Feels like by default needs to be bigger.”",
        "donor_img": "donor/tldraw-4k.png",
        "before_img": "donor/bbox-ui-4k.png",
        "after_img": "after-dock.png",
        "donor": "Measured from Zach’s own captures at identical window size, in CSS pixels: <strong>tldraw.com 44×44</strong> tool cell, <strong>Excalidraw 40×40</strong>.",
        "before": "<strong>~32px</strong> — 73% of tldraw’s, 80% of Excalidraw’s. Not a DPI problem: <code>devicePixelRatio</code> is 1 and nothing is DPI-derived. <code>ToolbarButton</code> fell through to its <code>default</code> size (<code>h-8</code>) because no <code>Bar</code> mounted a size provider.",
        "after": "",
    },
    {
        "id": "interface-scale",
        "title": "Interface scale",
        "ask": "“As I move the interface scale I would expect for it to resize but its not… also I want that interface scale setting to persist”",
        "donor_img": "donor/zach-settings-appearance.png",
        "before_img": "donor/zach-settings-appearance.png",
        "after_img": "after-scale-150.png",
        "donor": "<code>zoom</code> on <strong>two</strong> roots, an inverse counter-zoom on the six layers positioned from tldraw’s own screen coordinates, and — easy to miss — a rule for tldraw’s <strong>portaled</strong> surfaces, which escape the zoomed subtree and would otherwise stay at 100% while the bar that opened them grew. The canvas never scales.",
        "before": "The control rendered and the value <strong>already persisted</strong> (verified: <code>interfaceScale.ts</code> is a complete port and <code>appSettings.tsx:188</code> writes it). <strong>Nothing read it.</strong> An apply-side bug only — so half of the ask was already satisfied and invisible.",
        "after": "",
    },
    {
        "id": "hit-test",
        "title": "Selecting an expanded block",
        "ask": "“in expanded view I can only select it by hovering over the edge… if I hover over the header and other parts it should also become selected!!!”",
        "donor_img": "donor/zach-expanded-selected.png",
        "before_img": "donor/zach-expanded-unselected.png",
        "after_img": "after-expanded-header-selected.png",
        "donor": "The donor hit this exact bug and fixed it by adding the chrome bands as <code>isLabel</code> children of the frame’s geometry — deliberately <em>not</em> the whole interior, so whatever is painted underneath stays reachable.",
        "before": "<code>getGeometry</code> returned <code>Group2d{children:[box]}</code> — one child, no label children. Two things make the obvious fix a no-op: the body rect is <em>already</em> <code>isFilled:true</code>, and <code>Group2d</code>’s constructor hard-codes <code>isFilled:false</code>. The same repo’s <code>RegionShapeUtil</code> already did it right; <code>BlockShapeUtil</code> never got it.",
        "after": "",
    },
]

CONTROLS_MISSING = [
    ("Wrap selection", "Wrap into a frame / block / branch / group", "absent", "not built this round — needs <code>wrapSelectionInto</code> ported"),
    ("Tidy edges / Reset routing / Organize", "three layout actions on the pill", "absent", "not built — needs the trunk’s <code>tidyTraces</code> bound to the wire layer"),
    ("FigJam colour palette", "full swatch grid, stroke colour, fill", "tldraw’s own <code>StyleProp</code> set only", "partially covered by the style bar"),
    ("Shape picker / arrowheads / line shape", "geo, arrowhead start+end, routing", "absent", "real unbuilt work"),
    ("Delete in the pill", "<strong>not present in the donor</strong> — it was removed there", "present in bbox-ui", "worth a decision: bbox-ui added a control the donor deliberately dropped"),
]


def cell(html: str) -> str:
    return html if html else '<span class="pending">—</span>'


def row_html(r: dict) -> str:
    return f"""
<section class="row" data-id="{r['id']}">
  <h3>{r['title']}</h3>
  <blockquote>{r['ask']}</blockquote>
  <div class="cols">
    <div class="col donor"><div class="tag">SystemSketch / FigJam</div>{img(r['donor_img'], r['title'])}<div class="note">{r['donor']}</div></div>
    <div class="col before"><div class="tag">bbox-ui before</div>{img(r['before_img'], r['title'])}<div class="note">{r['before']}</div></div>
    <div class="col after"><div class="tag">bbox-ui now</div>{img(r['after_img'], r['title'])}<div class="note">{cell(r['after'])}</div></div>
  </div>
  <div class="verdict">
    <button data-v="good">Good</button><button data-v="tweak">Needs a tweak</button><button data-v="bad">Wrong</button>
    <textarea rows="2" placeholder="Notes on {r['title']} — optional"></textarea>
  </div>
</section>"""


def build(after_notes: dict[str, str] | None = None) -> str:
    if after_notes:
        for r in ROWS:
            if r["id"] in after_notes:
                r["after"] = after_notes[r["id"]]
    rows = "".join(row_html(r) for r in ROWS)
    missing = "".join(
        f"<tr><td>{a}</td><td>{b}</td><td>{c}</td><td>{d}</td></tr>" for a, b, c, d in CONTROLS_MISSING
    )
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SystemSketch parity</title>
<style>
  :root {{ --bg:#fbfbfd; --fg:#16161a; --muted:#6b6b76; --line:#e4e4ea; --card:#fff;
           --accent:#2f5bd8; --good:#137a4b; --warn:#8a5a00; }}
  @media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{
    --bg:#0f1013; --fg:#ececf0; --muted:#9a9aa6; --line:#26262e; --card:#16171b;
    --accent:#7d9bff; --good:#4ac585; --warn:#e0b050; }} }}
  :root[data-theme="dark"] {{ --bg:#0f1013; --fg:#ececf0; --muted:#9a9aa6; --line:#26262e;
    --card:#16171b; --accent:#7d9bff; --good:#4ac585; --warn:#e0b050; }}
  *{{box-sizing:border-box}}
  body{{margin:0;background:var(--bg);color:var(--fg);
    font:16px/1.6 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif}}
  .wrap{{max-width:1240px;margin:0 auto;padding:44px 16px 110px}}
  h1{{font-size:30px;margin:0 0 6px;letter-spacing:-.02em}}
  .sub{{color:var(--muted);margin:0 0 30px}}
  h2{{font-size:12px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);
     margin:42px 0 14px;font-weight:650}}
  .row{{background:var(--card);border:1px solid var(--line);border-radius:14px;
       padding:20px;margin:0 0 18px}}
  .row h3{{margin:0 0 8px;font-size:19px;letter-spacing:-.01em}}
  blockquote{{margin:0 0 16px;padding:8px 13px;border-left:3px solid var(--accent);
    background:color-mix(in srgb,var(--accent) 7%,transparent);border-radius:0 7px 7px 0;font-size:14.5px}}
  .cols{{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}}
  @media (max-width:900px){{ .cols{{grid-template-columns:1fr}} }}
  .col{{border:1px solid var(--line);border-radius:10px;padding:10px;background:var(--bg);min-width:0}}
  .tag{{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);
       margin-bottom:8px;font-weight:650}}
  .col.after .tag{{color:var(--good)}}
  img{{max-width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:7px;background:#111}}
  .note{{font-size:13.5px;margin-top:9px;color:var(--fg)}}
  .pending{{color:var(--muted);font-style:italic}}
  .missing{{padding:22px;text-align:center;color:var(--muted);font-size:12.5px;
    border:1px dashed var(--line);border-radius:7px}}
  code{{font-family:ui-monospace,SFMono-Regular,monospace;font-size:.88em;
    background:color-mix(in srgb,var(--fg) 8%,transparent);padding:1.5px 5px;border-radius:4px}}
  table{{width:100%;border-collapse:collapse;font-size:14px}}
  td,th{{text-align:left;vertical-align:top;padding:9px 11px;border-bottom:1px solid var(--line)}}
  th{{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}}
  .verdict{{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:15px;
    padding-top:13px;border-top:1px dashed var(--line)}}
  .verdict button{{font:inherit;font-size:13px;padding:6px 13px;border-radius:8px;
    border:1px solid var(--line);background:transparent;color:var(--fg);cursor:pointer}}
  .verdict button[aria-pressed="true"]{{background:var(--accent);color:#fff;border-color:var(--accent)}}
  .verdict textarea{{flex:1 1 240px;min-width:190px;font:inherit;font-size:13px;padding:6px 9px;
    border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--fg);resize:vertical}}
  .bar{{position:sticky;bottom:0;background:color-mix(in srgb,var(--bg) 92%,transparent);
    backdrop-filter:blur(8px);border-top:1px solid var(--line);padding:12px 16px;margin-top:34px}}
  .bar .inner{{max-width:1240px;margin:0 auto;display:flex;gap:10px;align-items:center;flex-wrap:wrap}}
  .bar button{{font:inherit;font-size:14px;font-weight:600;padding:9px 18px;border-radius:9px;
    border:0;background:var(--accent);color:#fff;cursor:pointer}}
  .bar span{{color:var(--muted);font-size:13px}}
  #out{{width:100%;margin-top:10px;font-family:ui-monospace,monospace;font-size:12px;padding:10px;
    border-radius:9px;border:1px solid var(--line);background:var(--card);color:var(--fg);display:none}}
  #out.show{{display:block}}
</style></head><body><div class="wrap">
<h1>SystemSketch parity — what it had, what we had, what we have now</h1>
<p class="sub">bbox-ui · <code>claude/floating-toolbars-2026-09-20</code> · 20 Sep 2026 · column 1 is your own captures of the old app; columns 2 and 3 are the running app in <strong>dark</strong> theme, which is what you run</p>

<h2>Feature by feature</h2>
{rows}

<h2>Still missing from bbox-ui’s pill</h2>
<p class="sub">Your words: “there are a lot a lot of features we had in system sketch that are missing”. Measured: the donor’s pill carries <strong>34 controls across six selection surfaces</strong>; bbox-ui’s carries <strong>11</strong>. Every one bbox-ui has is a stock tldraw style or a stock editor call — the cheap half. This is what is not there.</p>
<table><thead><tr><th>Control</th><th>SystemSketch / FigJam</th><th>bbox-ui</th><th>Size of the job</th></tr></thead>
<tbody>{missing}</tbody></table>

</div>
<div class="bar"><div class="inner">
  <button id="copy">Copy my verdicts</button>
  <span>Mark any row, then copy — the text names each row by title.</span>
  <textarea id="out" rows="8" readonly></textarea>
</div></div>
<script>
function store(k,v){{try{{localStorage.setItem(k,v)}}catch{{}}}}
function load(k){{try{{return localStorage.getItem(k)}}catch{{return null}}}}
document.querySelectorAll(".row").forEach(function(row){{
  var id=row.dataset.id, box=row.querySelector("textarea");
  var saved=load("parity-v-"+id), note=load("parity-n-"+id);
  if(note) box.value=note;
  row.querySelectorAll(".verdict button").forEach(function(b){{
    if(saved===b.dataset.v) b.setAttribute("aria-pressed","true");
    b.addEventListener("click",function(){{
      row.querySelectorAll(".verdict button").forEach(function(o){{o.removeAttribute("aria-pressed")}});
      b.setAttribute("aria-pressed","true"); store("parity-v-"+id,b.dataset.v);
    }});
  }});
  box.addEventListener("input",function(){{store("parity-n-"+id,box.value)}});
}});
var LABEL={{good:"Good",tweak:"Needs a tweak",bad:"Wrong"}};
document.getElementById("copy").addEventListener("click",function(){{
  var lines=["# SystemSketch parity — verdicts",""];
  document.querySelectorAll(".row").forEach(function(row){{
    var picked=row.querySelector('.verdict button[aria-pressed="true"]');
    var note=row.querySelector("textarea").value.trim();
    if(!picked&&!note) return;
    lines.push("**"+row.querySelector("h3").textContent+"** — "+(picked?LABEL[picked.dataset.v]:"(no verdict)"));
    if(note) lines.push("  "+note);
    lines.push("");
  }});
  if(lines.length===2) lines.push("_(nothing marked yet)_");
  var out=document.getElementById("out");
  out.value=lines.join("\\n"); out.classList.add("show"); out.focus(); out.select();
  // .catch, not try/catch: writeText returns a PROMISE, so a sync catch cannot
  // see its rejection and every copy on file:// throws.
  try{{navigator.clipboard.writeText(out.value).catch(function(){{}})}}catch{{}}
}});
</script></body></html>
"""


if __name__ == "__main__":
    html = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    enc = len(quote(html, safe=""))
    print(f"wrote {OUT} ({OUT.stat().st_size:,} bytes)")
    print(f"encoded data: URL {enc:,} / 2,097,024 "
          f"({'OK' if enc < 2_097_024 else 'OVER CAP - browser only, say so in the handoff'})")
