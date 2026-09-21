#!/usr/bin/env python3
"""Build the prior-art report: how ~100 real 2D node/graph editors organise code.

Zach: "what would standard best practice say we should do right now? in terms of
repo organization? How have projects in similar domains organized their code? ...
I would expect to a repoert with like 50-100 examples, and thoose examples then
goruped together by their philsophy... and then like a piechart that shows the
split what is most common. perhaps also like we can see a timeline for how the
split changes by year... what has the indstury learned?"

Charts are hand-drawn inline SVG — no chart library, nothing loaded at runtime,
so the page works offline and inside the artifact preview.

Reads docs/node-editor-findings.json (written by classify_node_editors.py).
"""
from __future__ import annotations

import json
import math
import pathlib

HERE = pathlib.Path(__file__).parent
DATA = HERE / "node-editor-findings.json"
OUT = pathlib.Path("/home/bam/bbox-ui/reports/media/prior-art-folders-2026-09-21.html")

COLORS = ["#7d9bff", "#4ac585", "#e0b050", "#ff8a80", "#b98cf0", "#57c8d4", "#9a9aa6"]


def pie(slices: list[tuple[str, int]], size: int = 260) -> str:
    """Donut chart. slices = [(label, count)] already sorted."""
    total = sum(v for _, v in slices) or 1
    cx = cy = size / 2
    r_out, r_in = size / 2 - 6, size / 2 - 62
    out, ang = [], -math.pi / 2
    for i, (label, v) in enumerate(slices):
        sweep = 2 * math.pi * v / total
        if sweep <= 0:
            continue
        large = 1 if sweep > math.pi else 0
        x0, y0 = cx + r_out * math.cos(ang), cy + r_out * math.sin(ang)
        x1, y1 = cx + r_out * math.cos(ang + sweep), cy + r_out * math.sin(ang + sweep)
        xi0, yi0 = cx + r_in * math.cos(ang + sweep), cy + r_in * math.sin(ang + sweep)
        xi1, yi1 = cx + r_in * math.cos(ang), cy + r_in * math.sin(ang)
        c = COLORS[i % len(COLORS)]
        out.append(
            f'<path d="M{x0:.1f},{y0:.1f} A{r_out},{r_out} 0 {large} 1 {x1:.1f},{y1:.1f} '
            f'L{xi0:.1f},{yi0:.1f} A{r_in},{r_in} 0 {large} 0 {xi1:.1f},{yi1:.1f} Z" '
            f'fill="{c}"><title>{label}: {v} ({v/total*100:.0f}%)</title></path>')
        ang += sweep
    out.append(f'<text x="{cx}" y="{cy-4}" class="pieN">{total}</text>'
               f'<text x="{cx}" y="{cy+15}" class="pieL">repos</text>')
    return f'<svg viewBox="0 0 {size} {size}" class="pie">{"".join(out)}</svg>'


def legend(slices: list[tuple[str, int]]) -> str:
    total = sum(v for _, v in slices) or 1
    rows = "".join(
        f'<li><span class="sw" style="background:{COLORS[i % len(COLORS)]}"></span>'
        f'<b>{v}</b> <span class="pct">{v/total*100:.0f}%</span> {label}</li>'
        for i, (label, v) in enumerate(slices))
    return f'<ul class="legend">{rows}</ul>'


def stacked_timeline(by_year: dict, keys: list[str], w=760, h=250) -> str:
    """100%-stacked bars, one per year, so the SHARE shift is visible."""
    years = sorted(y for y in by_year if y.isdigit() and 2010 <= int(y) <= 2026)
    if not years:
        return "<p class='cav'>no year data</p>"
    pad_l, pad_b, pad_t = 46, 26, 12
    bw = (w - pad_l - 8) / len(years)
    bars = []
    for xi, y in enumerate(years):
        c = by_year[y]
        tot = sum(c.values()) or 1
        x = pad_l + xi * bw
        acc = 0.0
        for ki, k in enumerate(keys):
            v = c.get(k, 0)
            if not v:
                continue
            frac = v / tot
            bh = (h - pad_b - pad_t) * frac
            yy = pad_t + (h - pad_b - pad_t) - acc - bh
            bars.append(f'<rect x="{x+1.5:.1f}" y="{yy:.1f}" width="{bw-3:.1f}" '
                        f'height="{bh:.1f}" fill="{COLORS[ki % len(COLORS)]}">'
                        f'<title>{y} · {k}: {v} of {tot}</title></rect>')
            acc += bh
        bars.append(f'<text x="{x+bw/2:.1f}" y="{h-8}" class="ax">{y[2:]}</text>')
        bars.append(f'<text x="{x+bw/2:.1f}" y="{pad_t-3}" class="axn">{tot}</text>')
    for p, lab in ((0, "100%"), (0.5, "50%"), (1, "0%")):
        yy = pad_t + (h - pad_b - pad_t) * p
        bars.append(f'<line x1="{pad_l}" y1="{yy:.1f}" x2="{w-4}" y2="{yy:.1f}" '
                    f'class="grid"/><text x="{pad_l-6}" y="{yy+4:.1f}" class="ax" text-anchor="end">{lab}</text>')
    return f'<svg viewBox="0 0 {w} {h}" class="tl">{"".join(bars)}</svg>'


def tree_of(repo: dict) -> str:
    inner = repo.get("inner") or []
    root = repo.get("src_root") or "."
    lines = [f"{root}/"] + [f"  {d}/" for d in inner[:9]]
    return "\n".join(lines)


def build() -> str:
    d = json.loads(DATA.read_text(encoding="utf-8"))
    repos = d["repos"]
    phil = list(d["philosophy"].items())
    styles = [(k, v) for k, v in d["component_style"].items()]

    phil_keys = [k for k, _ in phil]
    style_keys = [k for k, _ in styles]

    # exemplars: the 3 biggest repos per philosophy
    by_phil: dict[str, list] = {}
    for r in repos:
        by_phil.setdefault(r["primary"], []).append(r)

    groups = ""
    for i, (name, count) in enumerate(phil):
        ex = by_phil.get(name, [])[:4]
        cards = "".join(
            f'<div class="ex"><div class="exh"><a href="https://github.com/{r["name"]}" '
            f'target="_blank" rel="noopener">{r["name"]}</a>'
            f'<span class="st">{r["stars"]:,}★</span></div>'
            f'<div class="exd">{r["desc"] or ""}</div>'
            f'<pre class="tree">{tree_of(r)}</pre>'
            f'<div class="exm">created {r["created"]} · {r["lang"] or "?"}'
            f'{" · " + r["component_style"] if r["component_style"] else ""}</div></div>'
            for r in ex)
        groups += (
            f'<section class="grp"><h3><span class="dot" style="background:'
            f'{COLORS[i % len(COLORS)]}"></span>{name}'
            f'<span class="cnt">{count} repos · {count/d["n_repos"]*100:.0f}%</span></h3>'
            f'<div class="exs">{cards}</div></section>')

    rows = "".join(
        f'<tr><td><a href="https://github.com/{r["name"]}" target="_blank" rel="noopener">'
        f'{r["name"]}</a></td><td class="num">{r["stars"]:,}</td><td class="num">{r["created"]}</td>'
        f'<td>{r["lang"] or ""}</td><td>{r["primary"]}</td>'
        f'<td>{r["component_style"] or "—"}</td></tr>'
        for r in repos)

    enc = d.get("encapsulation", {})
    signal = enc.get("hoisted_only",0)+enc.get("encapsulated_only",0)+enc.get("both",0)
    enc_pct = ((enc.get("encapsulated_only",0)+enc.get("both",0))/signal*100) if signal else 0
    hoisted_rows = "".join(
        f'<tr><td><code>{k}/</code></td><td class="num">{v} repos</td></tr>'
        for k, v in (enc.get("hoisted_names") or {}).items())
    n_style = sum(v for _, v in styles) or 1
    folder_pct = next((v for k, v in styles if k == "folder per component"), 0) / n_style * 100
    file_pct = next((v for k, v in styles if k == "file per component"), 0) / n_style * 100

    css = """
:root{--bg:#0f1013;--fg:#ececf0;--muted:#9a9aa6;--line:#26262e;--card:#16171b;--accent:#7d9bff;
  --yes:#4ac585;--no:#ff8a80;--warn:#e0b050}
@media(prefers-color-scheme:light){:root:not([data-theme="dark"]){--bg:#fbfbfd;--fg:#16161a;
  --muted:#6b6b76;--line:#e4e4ea;--card:#fff;--accent:#2f5bd8;--yes:#137a4b;--no:#b3261e;--warn:#8a5a00}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.62 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1140px;margin:0 auto;padding:44px 18px 80px}
h1{font-size:30px;margin:0 0 8px;letter-spacing:-.02em;line-height:1.2}
.sub{color:var(--muted);margin:0 0 24px}
h2{font-size:12.5px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);margin:46px 0 14px;font-weight:650}
.lede{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--accent);
  border-radius:0 12px 12px 0;padding:17px 20px;margin:0 0 12px;font-size:16.5px}
.lede b{color:var(--accent)}
.charts{display:grid;grid-template-columns:300px 1fr;gap:26px;align-items:center;
  background:var(--card);border:1px solid var(--line);border-radius:13px;padding:20px;margin-bottom:16px}
@media(max-width:820px){.charts{grid-template-columns:1fr}}
.pie{width:100%;max-width:280px;height:auto}
.pieN{fill:var(--fg);font:700 34px ui-sans-serif;text-anchor:middle}
.pieL{fill:var(--muted);font:12px ui-sans-serif;text-anchor:middle}
ul.legend{list-style:none;margin:0;padding:0;font-size:14.5px}
ul.legend li{margin-bottom:8px;display:flex;align-items:baseline;gap:8px}
.sw{width:12px;height:12px;border-radius:3px;flex:none;position:relative;top:1px}
.pct{color:var(--muted);font-variant-numeric:tabular-nums;min-width:38px}
.tl{width:100%;height:auto;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:6px}
.tl .ax{fill:var(--muted);font:10.5px ui-sans-serif;text-anchor:middle}
.tl .axn{fill:var(--muted);font:9px ui-sans-serif;text-anchor:middle;opacity:.65}
.tl .grid{stroke:var(--line);stroke-width:1}
.grp{background:var(--card);border:1px solid var(--line);border-radius:13px;padding:18px;margin-bottom:14px}
.grp h3{margin:0 0 12px;font-size:18px;display:flex;align-items:center;gap:9px;letter-spacing:-.01em}
.dot{width:12px;height:12px;border-radius:3px;flex:none}
.cnt{margin-left:auto;font-size:12px;color:var(--muted);font-weight:400}
.exs{display:grid;grid-template-columns:repeat(4,1fr);gap:11px}
@media(max-width:980px){.exs{grid-template-columns:repeat(2,1fr)}}
@media(max-width:580px){.exs{grid-template-columns:1fr}}
.ex{border:1px solid var(--line);border-radius:10px;padding:11px;min-width:0}
.exh{display:flex;gap:6px;align-items:baseline;font-size:13px;margin-bottom:5px}
.exh a{color:var(--accent);text-decoration:none;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.st{margin-left:auto;color:var(--muted);font-size:11px;white-space:nowrap}
.exd{color:var(--muted);font-size:11.5px;line-height:1.45;margin-bottom:7px;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
pre.tree{margin:0 0 6px;background:color-mix(in srgb,var(--fg) 5%,transparent);
  border-radius:7px;padding:8px 9px;font-family:ui-monospace,monospace;font-size:11px;
  line-height:1.55;overflow-x:auto;white-space:pre}
.exm{color:var(--muted);font-size:10.5px}
table{width:100%;border-collapse:collapse;font-size:13.5px;margin:6px 0 10px}
th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);
  padding:7px 9px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--bg)}
td{padding:6px 9px;border-bottom:1px solid var(--line)}
td.num{text-align:right;font-variant-numeric:tabular-nums;color:var(--muted);white-space:nowrap}
td a{color:var(--accent);text-decoration:none}
code{font-family:ui-monospace,monospace;font-size:.88em;background:color-mix(in srgb,var(--fg) 8%,transparent);
  padding:1.5px 5px;border-radius:4px}
.big{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--yes);
  border-radius:0 12px 12px 0;padding:17px 20px;margin:0 0 14px}
.big h3{margin:0 0 8px;font-size:17px}
.big .huge{font-size:40px;font-weight:700;color:var(--yes);line-height:1.1}
.cav{color:var(--muted);font-size:13.5px}
.scroll{max-height:560px;overflow:auto;border:1px solid var(--line);border-radius:11px}
"""
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prior art — how node editors organise code</title>
<style>{css}</style></head><body><div class="wrap">

<h1>How {d['n_repos']} node editors, graph engines and UI kits actually organise their code</h1>
<p class="sub">bbox-ui · 21 Sep 2026 · folder layouts read from the real repositories, grouped by philosophy</p>

<div class="lede">
Every repo below was read from its actual source tree via the GitHub API — not from docs, not
from memory. <b>{d['n_repos']} repositories</b>, classified by the shape of their top two
directory levels.
</div>

<h2>The split — primary organising philosophy</h2>
<div class="charts"><div>{pie(phil)}</div><div>{legend(phil)}</div></div>

<h2>The question you actually asked</h2>
<div class="big"><h3>Inside a <code>components/</code> directory: one file or one folder per component?</h3>
<div class="charts" style="background:transparent;border:0;padding:0">
<div>{pie(styles, 230)}</div>
<div>{legend(styles)}
<p class="cav" style="margin-top:10px">Measured on the {sum(v for _, v in styles)} repos in the
corpus with a <code>components/</code> directory big enough to judge (4+ entries). A repo counts as
“folder per component” when ≥70% of its direct children are directories.</p></div>
</div></div>

<h2>Timeline — has the split moved?</h2>
<p>100%-stacked by the year the repository was created. The number above each bar is the sample
size for that year, which is what you should read the thin years against.</p>
{stacked_timeline(d['by_year'], phil_keys)}
{legend(phil)}

<h2>Component style over time</h2>
{stacked_timeline(d['style_by_year'], style_keys, h=200)}
{legend(styles)}

<h2>The philosophies, with real trees</h2>
<p>Four exemplars per philosophy, largest first, showing the real second level of each repo.</p>
{groups}

<h2>Every repo in the corpus</h2>
<div class="scroll"><table><thead><tr><th>Repository</th><th class="num">Stars</th>
<th class="num">Born</th><th>Language</th><th>Philosophy</th><th>components/</th></tr></thead>
<tbody>{rows}</tbody></table></div>

</div></body></html>
"""


if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(build(), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size:,} bytes)")
