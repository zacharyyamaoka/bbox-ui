#!/usr/bin/env python3
"""
Build the "100 ideas" report.

Zach, 2026-09-18: "Can you please a report with 100 ideas from this background
research. Please visuals that explains what the concepts/feature is to
implement... Please don't copy the ideas that this one already talks about.
Please also go through our existing code base to make sure its not an idea we
already have implemented as well. Make sure they are genuinely kinda novel and
useful. Order the ideas from most novel and useful to least novel and useful so
if I ever get bored then I will just stop reading."

Three constraints drive the whole design:

1. **Ranked, not grouped.** The order IS the product — he reads until bored, so
   the best idea must be first and the tail must be honestly ranked, not padded.
2. **Every idea gets a drawing.** Diagrams come from `idea_diagrams.py`'s
   template library; the top tier gets hand-authored SVG or a live demo.
3. **Nothing already said or already built.** Each idea was checked against the
   two prior reports, ~30 prior proposal reports, the repo's `docs/*.md` plans,
   and an exhaustive inventory of the trunk's own components and stories.

    python3 docs/build_hundred_ideas_report.py
"""
from __future__ import annotations

import html
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import idea_diagrams as D  # noqa: E402
import report_feedback as FB  # noqa: E402

OUT = pathlib.Path("/home/bam/bbox-ui/reports/hundred-ideas-2026-09-18.html")
DATA = pathlib.Path(__file__).resolve().parent / "hundred_ideas_data.py"

CAT = {
    "domain-model":    ("Domain model", "#bc8cff"),
    "algorithm":       ("Algorithm",    "#5aa9f8"),
    "interaction":     ("Interaction",  "#f0883e"),
    "ui":              ("UI",           "#3fb950"),
    "diagnostics":     ("Diagnostics",  "#e8c06a"),
    "library-structure": ("Library shape", "#e5534b"),
}

CSS = """
  :root {
    --bg:#0c0d10; --panel:#15171c; --panel2:#1b1e25; --sunk:#0b0d10;
    --line:#282d38; --line2:#343b48;
    --fg:#e8eaf0; --dim:#9aa3b2; --dim2:#6b7383;
    --accent:#f0883e; --accent2:#5aa9f8; --ok:#3fb950; --warn:#e5534b; --purple:#bc8cff;
    --mono: ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  }
  * { box-sizing:border-box }
  body { margin:0; background:var(--bg); color:var(--fg);
    font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif }
  .wrap { max-width:1180px; margin:0 auto; padding:0 24px 120px }
  a { color:var(--accent2); text-decoration:none } a:hover { text-decoration:underline }
  code { font-family:var(--mono); font-size:.86em; background:#0009; padding:1px 5px; border-radius:4px }
  p { margin:0 0 10px }

  .hero { padding:58px 0 10px }
  .kicker { font-size:11px; letter-spacing:.22em; text-transform:uppercase; color:var(--accent);
    font-weight:700; margin:0 0 16px }
  h1 { font-size:46px; line-height:1.06; margin:0 0 14px; letter-spacing:-.03em; max-width:900px }
  .sub { color:var(--dim); font-size:16.5px; margin:0 0 8px; max-width:820px }
  .sub b { color:var(--fg) }

  .facts { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:10px; margin:28px 0 10px }
  .fact { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:14px 16px }
  .fact b { display:block; font-size:27px; font-variant-numeric:tabular-nums; letter-spacing:-.03em; line-height:1.15 }
  .fact span { font-size:10.5px; color:var(--dim2); text-transform:uppercase; letter-spacing:.08em }

  .lede { background:linear-gradient(180deg,#17191f,#131519); border:1px solid var(--line);
    border-left:3px solid var(--accent); border-radius:12px; padding:20px 24px; margin:26px 0 }
  .lede p:last-child { margin-bottom:0 } .lede b { color:#fff }

  /* ---- sticky filter ---- */
  .filter { position:sticky; top:0; z-index:20; background:rgba(12,13,16,.94);
    backdrop-filter:blur(8px); border-bottom:1px solid var(--line);
    margin:38px -24px 0; padding:12px 24px; display:flex; gap:8px; flex-wrap:wrap; align-items:center }
  .chip { font:600 12px/1 inherit; font-family:inherit; color:var(--dim); background:#1a1e26;
    border:1px solid var(--line2); border-radius:99px; padding:8px 13px; cursor:pointer;
    display:inline-flex; align-items:center; gap:7px }
  .chip:hover { color:var(--fg) }
  .chip i { width:8px; height:8px; border-radius:2px; display:inline-block }
  .chip[aria-pressed="true"] { color:#0c0d10; font-weight:800 }
  .chip .n { font-variant-numeric:tabular-nums; opacity:.75 }
  .filter .count { margin-left:auto; font-family:var(--mono); font-size:11.5px; color:var(--dim2) }

  .tierhd { margin:60px 0 4px; display:flex; align-items:baseline; gap:14px }
  .tierhd h2 { font-size:25px; margin:0; letter-spacing:-.02em }
  .tierhd .rng { font-family:var(--mono); font-size:12px; color:var(--dim2) }
  .tiersub { color:var(--dim); font-size:14.5px; margin:2px 0 22px; max-width:820px }

  /* ---- idea card ---- */
  .idea { background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--line2);
    border-radius:13px; padding:18px 20px 16px; margin:0 0 16px }
  .idea .hd { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:9px }
  .rank { font-family:var(--mono); font-size:12.5px; font-weight:800; color:var(--dim2);
    background:#1a1e26; border:1px solid var(--line); border-radius:6px; padding:3px 7px;
    font-variant-numeric:tabular-nums }
  .cat { font-size:10px; font-weight:800; letter-spacing:.07em; text-transform:uppercase;
    padding:3px 9px; border-radius:99px }
  .src { font-size:11px; color:var(--dim2); background:var(--panel2); border:1px solid var(--line);
    padding:2px 8px; border-radius:99px; white-space:nowrap }
  .idea h3 { margin:0 0 10px; font-size:17.5px; letter-spacing:-.012em; line-height:1.3 }
  .idea .dia { background:var(--sunk); border:1px solid var(--line); border-radius:10px;
    padding:12px 14px; margin:0 0 12px }
  .idea .dia svg { display:block; width:100%; height:auto }
  .idea p.body { color:var(--dim); font-size:14px; margin:0 0 8px }
  .idea p.body b { color:var(--fg) }
  .idea .foot { display:flex; gap:14px; flex-wrap:wrap; font-size:11.5px; color:var(--dim2);
    border-top:1px solid #1e222a; padding-top:9px; margin-top:10px }
  .idea .foot b { color:var(--dim) }
  .idea .foot .ck { color:#6f8f75 }

  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:16px }
  .grid2 .idea { margin:0 }
  @media (max-width:900px){ .grid2 { grid-template-columns:1fr } }

  /* tier 4 — dense rows */
  .row { display:grid; grid-template-columns:52px 150px 1fr; gap:14px; align-items:start;
    padding:13px 0; border-bottom:1px solid #1c2028 }
  .row .rank { align-self:start }
  .row .mini { background:var(--sunk); border:1px solid var(--line); border-radius:7px; padding:6px }
  .row .mini svg { display:block; width:100%; height:auto }
  .row h4 { margin:0 0 3px; font-size:14.5px }
  .row p { margin:0; color:var(--dim); font-size:13px }
  .row .foot { margin-top:6px; font-size:11px; color:var(--dim2) }

  footer { margin-top:80px; padding-top:24px; border-top:1px solid var(--line);
    color:var(--dim2); font-size:12.5px; line-height:1.85 }
  footer b { color:var(--dim) }
  .hidden { display:none !important }

  /* in-report feedback lives in report_feedback.py — see FB.CSS below */
"""

CSS += FB.CSS


def cat_chip(cat: str) -> str:
    label, colour = CAT[cat]
    return f'<span class="cat" style="background:{colour}22;color:{colour}">{label}</span>'


def srcs(s: str) -> str:
    return "".join(f'<span class="src">{p.strip()}</span>' for p in s.split("·") if p.strip())


def card(i: dict, rank: int, dense: bool = False) -> str:
    cat_col = CAT[i["category"]][1]
    dia = i.get("svg", "")
    checked = i.get("checked", "")
    if dense:
        return (f'<div class="row" data-cat="{i["category"]}">'
                f'<span class="rank">{rank}</span>'
                f'<div class="mini">{dia}</div>'
                f'<div><h4>{i["title"]}</h4><p>{i["body"]}</p>'
                f'<div class="foot">{cat_chip(i["category"])} {srcs(i["priorArt"])}'
                + (f' <span class="ck">checked: {checked}</span>' if checked else "")
                + "</div>" + FB.strip(rank, i["title"], extra_axis="diagram" if i.get("tmpl") else "") + "</div></div>")
    return (f'<div class="idea" style="border-left-color:{cat_col}" data-cat="{i["category"]}">'
            f'<div class="hd"><span class="rank">{rank}</span>{cat_chip(i["category"])}{srcs(i["priorArt"])}</div>'
            f'<h3>{i["title"]}</h3>'
            + (f'<div class="dia">{dia}</div>' if dia else "")
            + f'<p class="body">{i["body"]}</p>'
            + '<div class="foot">'
            + (f'<span><b>where</b> {i["where"]}</span>' if i.get("where") else "")
            + (f'<span class="ck"><b>checked</b> {checked}</span>' if checked else "")
            + "</div>" + FB.strip(rank, i["title"], extra_axis="diagram" if i.get("tmpl") else "") + "</div>")


TIERS = [
    (0, 12, "The twelve that would change the product",
     "Each of these changes what bbox-ui <i>is</i>, not how it looks. They get the most room and the "
     "biggest drawings because they are the ones worth arguing about."),
    (12, 40, "Strong, specific, buildable",
     "Real mechanisms with named prior art, each small enough to land in a lane. Two columns from here."),
    (40, 75, "Worth knowing about",
     "Good ideas that are either narrower in scope or further from what you are doing this month."),
    (75, 100, "The tail, honestly ranked",
     "Real, cited, and last on purpose. If you stopped reading before here, you did not miss much — "
     "which is the point of ranking them."),
]


def filter_bar(ideas) -> str:
    counts = {}
    for i in ideas:
        counts[i["category"]] = counts.get(i["category"], 0) + 1
    chips = [f'<button class="chip" data-cat="all" aria-pressed="true" '
             f'style="background:#e8eaf0;border-color:#e8eaf0">All <span class="n">{len(ideas)}</span></button>']
    for key, (label, colour) in CAT.items():
        if key not in counts:
            continue
        chips.append(f'<button class="chip" data-cat="{key}" aria-pressed="false" '
                     f'data-colour="{colour}"><i style="background:{colour}"></i>{label} '
                     f'<span class="n">{counts[key]}</span></button>')
    return ('<div class="filter">' + "".join(chips) +
            '<span class="count" id="fcount"></span></div>')


FILTER_JS = """
<script>
(function(){
  var chips = Array.prototype.slice.call(document.querySelectorAll('.filter .chip'));
  var items = Array.prototype.slice.call(document.querySelectorAll('[data-cat]:not(.chip)'));
  var count = document.getElementById('fcount');
  function apply(cat){
    chips.forEach(function(c){
      var on = c.dataset.cat === cat;
      c.setAttribute('aria-pressed', String(on));
      if (c.dataset.cat === 'all') { c.style.background = on ? '#e8eaf0' : '#1a1e26';
        c.style.borderColor = on ? '#e8eaf0' : '#343b48'; }
      else { c.style.background = on ? c.dataset.colour : '#1a1e26';
        c.style.borderColor = on ? c.dataset.colour : '#343b48'; }
    });
    var shown = 0;
    items.forEach(function(el){
      var vis = cat === 'all' || el.dataset.cat === cat;
      el.classList.toggle('hidden', !vis); if (vis) shown++;
    });
    // hide a tier heading whose whole section filtered out
    Array.prototype.forEach.call(document.querySelectorAll('[data-tier]'), function(sec){
      var any = sec.querySelector('[data-cat]:not(.hidden)');
      sec.classList.toggle('hidden', !any);
    });
    count.textContent = shown + ' of ' + items.length + ' shown';
  }
  chips.forEach(function(c){ c.addEventListener('click', function(){ apply(c.dataset.cat); }); });
  apply('all');
})();
</script>"""


def build(IDEAS: list, META: dict) -> str:
    assert len(IDEAS) >= 100, f"need 100 ideas, have {len(IDEAS)}"
    sections = []
    for ti, (lo, hi, title, sub) in enumerate(TIERS):
        chunk = IDEAS[lo:hi]
        if not chunk:
            continue
        if ti == 0:
            body = "".join(card(x, lo + n + 1) for n, x in enumerate(chunk))
        elif ti in (1, 2):
            body = '<div class="grid2">' + "".join(card(x, lo + n + 1) for n, x in enumerate(chunk)) + "</div>"
        else:
            body = "".join(card(x, lo + n + 1, dense=True) for n, x in enumerate(chunk))
        sections.append(
            f'<section data-tier="{ti}"><div class="tierhd"><h2>{title}</h2>'
            f'<span class="rng">#{lo + 1}&ndash;{min(hi, len(IDEAS))}</span></div>'
            f'<p class="tiersub">{sub}</p>{body}</section>')

    cats = {}
    for i in IDEAS:
        cats[i["category"]] = cats.get(i["category"], 0) + 1
    catline = " &middot; ".join(f'{CAT[k][0]} <b>{v}</b>' for k, v in
                               sorted(cats.items(), key=lambda kv: -kv[1]))

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>100 ideas from the prior-art sweep — ranked, 2026-09-18</title>
<style>{CSS}</style></head>
<body><div class="wrap">

<div class="hero">
  <p class="kicker">bbox-ui &middot; {len(IDEAS)} ideas, ranked &middot; 2026-09-18</p>
  <h1>{len(IDEAS)} ideas, best first.</h1>
  <p class="sub">Mined from the 17 prior-art dossiers behind the sweep report. Every one carries the
  tool it came from and the exact API that tool calls it. Ranked by <b>novelty &times; usefulness</b>,
  so the moment they stop being worth your time you can stop reading &mdash; the tail is honestly
  last, not padding.</p>
  <p class="sub">{catline}</p>
</div>

<div class="facts">
  <div class="fact"><b>{len(IDEAS)}</b><span>Ideas</span></div>
  <div class="fact"><b>{META['candidates']}</b><span>Candidates mined</span></div>
  <div class="fact"><b>{META['excluded']}</b><span>Cut as already said</span></div>
  <div class="fact"><b>{META['built']}</b><span>Cut as already built</span></div>
  <div class="fact"><b>{META['sources']}</b><span>Tools cited</span></div>
  <div class="fact"><b>17</b><span>Dossiers mined</span></div>
</div>

<div class="lede">
<p><b>What was deliberately left out.</b> Every idea in the two existing prior-art reports &mdash;
the SystemSketch one you linked and the wide sweep &mdash; is excluded, including its whole
&ldquo;also surfaced&rdquo; table. So is everything already proposed in this repo's own ~30 reports
under <code>reports/media/</code> and everything planned in <code>docs/*.md</code>. And every
surviving idea was checked against an exhaustive inventory of the trunk: its components, their
props, the scene kit's exported functions, and all ~121 story exports. Where a check was close,
the card says what it was checked against.</p>
</div>

{filter_bar(IDEAS)}

{''.join(sections)}

{FB.ui("100 ideas from the prior-art sweep (2026-09-18)", "idea", len(IDEAS))}

<footer>
<p><b>Method.</b> A two-stage ultracode workflow. Stage one: 11 Sonnet agents mined the 17 dossiers
(one slice each, ~20 candidates apiece) while three more built the exclusion corpus &mdash; every
idea in the two prior reports, every proposal in this repo's own report archive and plan documents,
and a full inventory of what the trunk already implements. Stage two: {META['verifiers']} verifier
agents checked each surviving candidate against the repo with real greps, killed the duplicates,
and scored novelty and usefulness independently. Ranking and every word of the cards is Opus's.</p>
<p><b>Honesty notes.</b> {META['honesty']}</p>
<p><b>Sources.</b> Each card names the tool and its exact API. The dossiers those came from live in
the sweep's run scratchpad and each required a file path opened or a URL fetched. Where a dossier
could not pin an API name, the card says what it does know rather than inventing one.</p>
</footer>

</div>{FILTER_JS}{FB.JS}</body></html>"""


if __name__ == "__main__":
    ns: dict = {}
    exec(compile(DATA.read_text(), str(DATA), "exec"), {"D": D}, ns)
    out = build(ns["IDEAS"], ns["META"])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(out, encoding="utf-8")
    print(f"wrote {OUT}  ({OUT.stat().st_size:,} bytes, {len(ns['IDEAS'])} ideas)")
