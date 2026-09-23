#!/usr/bin/env python3
"""Build "Every scenario, in every industry vocabulary".

    python3 docs/build_industry_vocabularies_report.py \
        --scenarios scenarios.json --sheets sheets.json \
        --buckets buckets.json --images imgdir --out FILE

Inputs
  scenarios.json  the 57 cards, from docs/extract_python_scenarios.py
  sheets.json     one grammar sheet per vocabulary, read from its own docs
  buckets.json    per scenario: the distinct industry approaches, each with a
                  board spec per example
  imgdir          proof screenshots, imgdir/<key>.jpg + manifest.json

WHY the proof images are CSS custom properties and not <img src="data:...">:
the same screenshot is cited by many scenarios, and a data URI repeated 30
times is 30 copies of the payload. Declared once on :root and referenced by
class, each image is stored exactly once.
"""
from __future__ import annotations

import argparse, base64, html, io, json, os, re, sys
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vocab_board import render, SHARED_DEFS, SHARED_CSS  # noqa: E402

E = html.escape

VOCAB_ORDER = ["unreal", "unity", "labview", "simulink", "houdini", "blender",
               "grasshopper", "nodered", "n8n", "flyde", "max"]
VOCAB_NAME = {
    "unreal": "Unreal Blueprints", "unity": "Unity Visual Scripting",
    "labview": "LabVIEW", "simulink": "Simulink", "houdini": "Houdini",
    "blender": "Blender Geometry Nodes", "grasshopper": "Grasshopper",
    "nodered": "Node-RED", "n8n": "n8n", "flyde": "Flyde", "max": "Max/MSP",
}
SECTION_ORDER = ["g-boundary", "g-values", "g-choice", "g-loops", "g-comps",
                 "g-streams", "g-failure", "g-scope", "g-facets"]
SECTION_SHORT = {
    "g-boundary": "Boundary", "g-values": "Values", "g-choice": "Choice",
    "g-loops": "Repetition", "g-comps": "Comprehensions", "g-streams": "Streams",
    "g-failure": "Failure", "g-scope": "Scope", "g-facets": "Composition",
}

PY_KW = r"\b(def|class|return|if|elif|else|for|while|break|continue|try|except|finally|raise|with|as|import|from|lambda|yield|async|await|global|nonlocal|del|assert|pass|match|case|in|not|and|or|is|None|True|False)\b"


def pycode(src):
    out, i = [], 0
    for m in re.finditer(PY_KW, src):
        out.append(E(src[i:m.start()]))
        out.append(f'<span class="k">{E(m.group(0))}</span>')
        i = m.end()
    out.append(E(src[i:]))
    s = "".join(out)
    s = re.sub(r"(#[^\n<]*)", r'<span class="c">\1</span>', s)
    s = re.sub(r"(&#x27;[^&\n]*&#x27;|&quot;[^&\n]*&quot;)", r'<span class="s">\1</span>', s)
    return s


def jpeg_uri(path, width, quality=72):
    im = Image.open(path)
    im = im.convert("RGB")
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


AGREEMENT_ORDER = ["unreal", "unity", "labview", "simulink", "houdini", "blender",
                   "grasshopper", "flyde", "nodered", "n8n", "max"]


def agreement(buckets):
    """How often does each PAIR of vocabularies land in the same bucket?

    This is the one number in the report that nobody wrote down — it falls out
    of 223 grouping decisions made scenario by scenario, and it is what answers
    "which of these eleven am I actually choosing between".
    """
    import itertools
    together = {}
    appears = {}
    for s_ in buckets:
        for b in s_.get("buckets", []):
            ms = sorted(set(b.get("members", [])))
            for m in ms:
                appears[m] = appears.get(m, 0) + 1
            for a, c in itertools.combinations(ms, 2):
                together[(a, c)] = together.get((a, c), 0) + 1
    return together, appears


def agreement_table(buckets):
    together, appears = agreement(buckets)
    order = [k for k in AGREEMENT_ORDER if appears.get(k)]
    head = "".join(f'<th class="rot"><span>{E(VOCAB_NAME.get(k, k))}</span></th>' for k in order)
    rows = []
    for a in order:
        cells = []
        for c in order:
            if a == c:
                cells.append('<td class="self">\u2014</td>')
                continue
            n = together.get((min(a, c), max(a, c)), 0)
            denom = min(appears.get(a, 1), appears.get(c, 1)) or 1
            pct = n / denom
            hue = min(1.0, pct / 0.8)
            cells.append(f'<td style="background:rgba(240,136,62,{hue*0.62:.3f})" '
                         f'title="{n} of {denom} buckets">{n}</td>')
        rows.append(f'<tr><th>{E(VOCAB_NAME.get(a, a))}</th>{"".join(cells)}</tr>')
    return (f'<table class="agree"><thead><tr><th></th>{head}</tr></thead>'
            f'<tbody>{"".join(rows)}</tbody></table>')


CSS = """
:root{--bg:#0e0f12;--panel:#15171c;--panel2:#1b1e25;--line:#282d38;--line2:#343b49;
 --fg:#e6e8ee;--dim:#9aa3b2;--dim2:#6b7383;--accent:#f0883e;--accent2:#5aa9f8;
 --ok:#3fb950;--warn:#e5534b;--gold:#e8c06a;--purple:#bc8cff;
 --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);
 font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif}
.wrap{max-width:1280px;margin:0 auto;padding:44px 24px 160px}
h1{font-size:40px;line-height:1.1;margin:0 0 10px;letter-spacing:-.026em}
h2{font-size:12.5px;text-transform:uppercase;letter-spacing:.15em;color:var(--dim2);
 margin:70px 0 14px;font-weight:600}
.sub{color:var(--dim);font-size:19px;margin:0 0 24px;line-height:1.5;max-width:900px}
.kicker{font:600 11.5px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--dim2);margin:0 0 18px}
a{color:var(--accent2);text-decoration:none}a:hover{text-decoration:underline}
p{margin:0 0 12px}
code{font-family:var(--mono);font-size:.88em;background:#0a0b0e;border:1px solid #23272f;border-radius:4px;padding:1px 5px}
.lede{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--accent);
 border-radius:10px;padding:19px 23px;margin:22px 0}
.lede p:last-child{margin:0}
.lede.blue{border-left-color:var(--accent2)}.lede.gold{border-left-color:var(--gold)}
.lede.green{border-left-color:var(--ok)}.lede.red{border-left-color:var(--warn)}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:10px;margin:24px 0}
.fact{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:13px 15px}
.fact b{display:block;font:700 25px/1.1 var(--mono);color:var(--accent);letter-spacing:-.02em}
.fact span{display:block;color:var(--dim2);font-size:11.5px;margin-top:6px;line-height:1.35}

/* the eleven vocabularies */
.vgrid{column-count:2;column-gap:14px}
.vcard{break-inside:avoid;margin:0 0 14px;background:var(--panel);border:1px solid var(--line);border-radius:11px;overflow:hidden}
.vshot{background:#fff;line-height:0;border-bottom:1px solid var(--line);height:186px;
 background-size:cover;background-position:top center}
.vbody{padding:14px 16px 15px}
.vbody h3{margin:0 0 4px;font-size:16px;letter-spacing:-.01em}
.vbody .one{color:var(--fg);font-size:13.4px;margin:0 0 9px;line-height:1.5}
.vrow{display:flex;gap:8px;font-size:11.5px;color:var(--dim);border-top:1px solid var(--line);padding:7px 0 0;margin-top:4px}
.vrow b{color:var(--dim2);font:600 10px/1.5 var(--mono);letter-spacing:.07em;text-transform:uppercase;min-width:52px}
.vlinks{margin-top:9px;font-size:11.5px;line-height:1.9;word-break:break-all}

/* section nav */
.nav{position:sticky;top:0;z-index:20;background:rgba(14,15,18,.94);backdrop-filter:blur(8px);
 border-bottom:1px solid var(--line);margin:0 -24px 0;padding:11px 24px;display:flex;gap:6px;flex-wrap:wrap}
.nav a{font:600 11px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--dim2);
 border:1px solid var(--line);border-radius:20px;padding:6px 10px}
.nav a:hover{color:var(--fg);border-color:var(--line2);text-decoration:none}

/* scenario */
.sc{border:1px solid var(--line);border-radius:12px;background:#111318;margin:0 0 20px;overflow:hidden}
.sc-h{display:flex;align-items:baseline;gap:11px;padding:15px 20px 0;flex-wrap:wrap}
.sid{font:700 11px/1 var(--mono);color:#0c0d10;background:var(--accent);border-radius:4px;padding:5px 7px}
.sc-h h3{margin:0;font-size:19px;letter-spacing:-.015em}
.chip{font:600 9.6px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;
 border-radius:20px;padding:5px 9px;border:1px solid var(--line2);color:var(--dim)}
.chip.Region{color:var(--gold);border-color:#4a3c1c}.chip.Block{color:var(--accent2);border-color:#1d3a56}
.chip.Transform{color:var(--ok);border-color:#1d4429}.chip.Wire{color:var(--purple);border-color:#3a2a55}
.chip.Mark{color:var(--accent);border-color:#4d3218}.chip.Sink{color:var(--warn);border-color:#4d2320}
.sc-b{padding:11px 20px 18px}
.canon{background:#0a0b0e;border:1px solid #20242c;border-radius:8px;padding:10px 13px;
 font:12.4px/1.55 var(--mono);white-space:pre;overflow-x:auto;margin:6px 0 10px;color:#c9cedb}
.canon .k{color:var(--accent);font-weight:600}.canon .s{color:#a5d6a7}.canon .c{color:var(--dim2)}
.ports{color:var(--dim);font-size:12.8px;margin:0 0 14px}
.exs{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:0 0 6px}
.ex .cap{font:600 10px/1 var(--mono);letter-spacing:.09em;text-transform:uppercase;color:var(--dim2);margin:0 0 6px}
.ex pre{margin:0;background:#0a0b0e;border:1px solid #20242c;border-radius:8px;padding:9px 11px;
 font:11.6px/1.5 var(--mono);white-space:pre-wrap;color:#c9cedb;overflow-x:auto}
.ex pre .k{color:var(--accent);font-weight:600}.ex pre .s{color:#a5d6a7}.ex pre .c{color:var(--dim2)}

.bk{border-top:1px solid var(--line);margin:18px -20px 0;padding:16px 20px 4px}
.bk-h{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:5px}
.bk-h b{font-size:15px;letter-spacing:-.01em}
.who{display:flex;gap:5px;flex-wrap:wrap}
.who span{font:600 9.6px/1 var(--mono);letter-spacing:.05em;color:var(--dim);
 background:var(--panel2);border:1px solid var(--line);border-radius:20px;padding:5px 8px}
.mech{color:var(--dim);font-size:13px;margin:0 0 4px;max-width:960px}
.ev{font-size:11.6px;color:var(--dim2);margin:0 0 12px;line-height:1.75}
.ev q{color:var(--dim);font-style:italic}
.ev .pf{display:inline-block;width:46px;height:30px;border-radius:4px;vertical-align:-10px;
 background-size:cover;background-position:center;border:1px solid var(--line2);margin-right:7px}
.boards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.bd-w{background:#0b0d11;border:1px solid var(--line);border-radius:9px;padding:10px;overflow-x:auto}
svg.bd{max-width:100%;height:auto;display:block}
.bcap{color:var(--dim2);font-size:11.3px;margin:8px 2px 0;line-height:1.5}
.nodraw{color:var(--dim2);font-size:12.5px;border-top:1px dashed var(--line);margin:16px -20px 0;padding:13px 20px 0}
.nodraw b{color:var(--warn);font-weight:600}
.err{color:var(--warn);font:11px/1.5 var(--mono)}
table.agree{width:auto;margin:18px 0 6px;border-collapse:separate;border-spacing:2px}
table.agree th{padding:5px 8px;font:600 11px/1.3 var(--mono);color:var(--dim);border:none;text-align:right;white-space:nowrap}
table.agree th.rot{height:112px;vertical-align:bottom;padding:0 0 7px;text-align:center;width:44px}
table.agree th.rot span{display:block;writing-mode:vertical-rl;transform:rotate(180deg);
 font:600 10.5px/1 var(--mono);color:var(--dim2);letter-spacing:.03em}
table.agree td{width:44px;height:30px;text-align:center;border:1px solid var(--line);border-radius:4px;
 font:600 11.5px/1 var(--mono);color:var(--fg);padding:0}
table.agree td.self{background:#0a0b0e;color:#343b49}
.foot{margin-top:80px;padding-top:22px;border-top:1px solid var(--line);color:var(--dim2);font-size:12.5px}
@media (max-width:900px){.exs,.boards{grid-template-columns:1fr}.vgrid{column-count:1}}
"""


def resolve_evidence(sheets, kept):
    """A drawing agent names only (vocab, construct). The URL, the verbatim quote,
    the tool's own name for the thing and the proof screenshot are looked up HERE,
    from the sheets that were adversarially checked — so a citation in this report
    is never something a drawing agent typed from memory."""
    out = {}
    for s in sheets:
        k = s["key"]
        for c in s.get("constructs", []):
            out[(k, c.get("construct", ""))] = dict(
                vocab=k, url=c.get("doc_url", ""), quote=c.get("quote", ""),
                named_thing=c.get("named_thing", ""), has=c.get("has", ""),
                confidence=c.get("confidence", ""))
    for k, ims in (kept or {}).items():
        for im in ims:
            key = (k, im.get("construct", ""))
            if key in out and not out[key].get("image"):
                out[key]["image"] = im["key"]
    return out


def build(scen, sheets, buckets, images, out, kept=None, narrative=None):
    by_key = {s["key"]: s for s in sheets}
    ev_index = resolve_evidence(sheets, kept)
    bk_by_scen = {b["scenario"]: b for b in buckets}
    # Two passes: work out which images the page actually references, then
    # encode only those — and at the size they are DISPLAYED at. A proof
    # thumbnail renders 46px wide; storing it at 300px was 80% of the payload.
    used = {f"hero-{k}" for k in VOCAB_ORDER}
    ev_probe = resolve_evidence(sheets, kept)
    for b in buckets:
        for bk_ in b.get("buckets", []):
            for raw in bk_.get("evidence", [])[:4]:
                e = ev_probe.get((raw.get("vocab", ""), raw.get("construct", "")))
                if e and e.get("image"):
                    used.add(e["image"])
    img_css, img_seen = [], {}
    for key in sorted(used):
        path = images.get(key)
        if not path or not os.path.exists(path):
            continue
        img_seen[key] = True
        hero = key.startswith("hero-")
        img_css.append(f'  --img-{key}: url("{jpeg_uri(path, 560 if hero else 132, 74 if hero else 62)}");')

    errors, n_boards, n_buckets = [], 0, 0

    # ---- the eleven vocabularies
    vcards = []
    for k in VOCAB_ORDER:
        s = by_key.get(k)
        if not s:
            continue
        ident = s.get("identity", {})
        hero = f"hero-{k}"
        shot = (f'<div class="vshot" style="background-image:var(--img-{hero})"></div>'
                if hero in img_seen else "")
        links = " · ".join(
            f'<a href="{E(u)}">{E(re.sub(r"^https?://(www\\.)?", "", u)[:58])}</a>'
            for u in sorted({c["doc_url"] for c in s.get("constructs", []) if c.get("doc_url")})[:5])
        vcards.append(f"""
      <div class="vcard">{shot}<div class="vbody">
        <h3>{E(s.get('name', k))}</h3>
        <p class="one">{E(ident.get('one_line', ''))}</p>
        <div class="vrow"><b>node</b><span>{E(ident.get('node_shape', ''))}</span></div>
        <div class="vrow"><b>ports</b><span>{E(ident.get('port_style', ''))}</span></div>
        <div class="vrow"><b>wire</b><span>{E(ident.get('wire_style', ''))}</span></div>
        <div class="vrow"><b>flow</b><span>{E(ident.get('flow', ''))}{' · draws a separate EXECUTION wire' if ident.get('has_exec_wire') else ' · no execution wire — dependency is the order'}</span></div>
        <div class="vlinks">{links}</div>
      </div></div>""")

    # ---- the scenarios
    secs, nav = [], []
    for sec_id in SECTION_ORDER:
        cards = [c for c in scen if c["section_id"] == sec_id]
        if not cards:
            continue
        nav.append(f'<a href="#{sec_id}">{E(SECTION_SHORT.get(sec_id, sec_id))} <span style="color:#4e5563">{len(cards)}</span></a>')
        body = []
        for c in cards:
            bk = bk_by_scen.get(c["id"], {})
            exs = "".join(
                f'<div class="ex"><p class="cap">{E(x["caption"])}</p><pre>{pycode(x["code"])}</pre></div>'
                for x in c["examples"])
            bucket_html = []
            for b in bk.get("buckets", []):
                n_buckets += 1
                who = "".join(f"<span>{E(VOCAB_NAME.get(m, m))}</span>" for m in b.get("members", []))
                ev, seen_ev = [], set()
                for raw in b.get("evidence", [])[:4]:
                    e = ev_index.get((raw.get("vocab", ""), raw.get("construct", "")))
                    if not e or e["vocab"] in seen_ev:
                        continue
                    seen_ev.add(e["vocab"])
                    ik = e.get("image")
                    pf = (f'<span class="pf" style="background-image:var(--img-{ik})"></span>'
                          if ik and ik in img_seen else "")
                    q = f' <q>{E(e["quote"])}</q>' if e.get("quote") else ""
                    nm = (f'<b style="color:#9aa3b2">{E(e["named_thing"])}</b> — '
                          if e.get("named_thing") else "")
                    link = (f'<a href="{E(e["url"])}">{E(VOCAB_NAME.get(e["vocab"], e["vocab"]))} docs</a>'
                            if e.get("url") else
                            f'<span style="color:#6b7383">{E(VOCAB_NAME.get(e["vocab"], e["vocab"]))}</span>')
                    ev.append(f"{pf}{nm}{link}{q}")
                if not ev:
                    ev.append('<span style="color:#4e5563">no citation resolved</span>')
                boards = []
                for i, spec in enumerate(b.get("boards", [])[:3]):
                    svg, errs = render(spec)
                    n_boards += 1
                    if errs:
                        errors.append(f'{c["id"]} / {b.get("name")} / ex{i+1}: {"; ".join(errs[:3])}')
                    cap = E(spec.get("cap", ""))
                    boards.append(f'<div><div class="bd-w">{svg}</div><p class="bcap">{cap}</p></div>')
                while len(boards) < 3:
                    boards.append('<div><div class="bd-w" style="opacity:.35;display:flex;align-items:center;'
                                  'justify-content:center;min-height:90px;color:#4e5563;font-size:11.5px">not drawn for this example</div></div>')
                bucket_html.append(f"""
          <div class="bk">
            <div class="bk-h"><b>{E(b.get('name', ''))}</b><div class="who">{who}</div></div>
            <p class="mech">{E(b.get('mechanism', ''))}</p>
            <p class="ev">{' &nbsp;·&nbsp; '.join(ev)}</p>
            <div class="boards">{''.join(boards)}</div>
          </div>""")
            nd = ""
            if bk.get("none"):
                names = ", ".join(VOCAB_NAME.get(m, m) for m in bk["none"])
                nd = (f'<p class="nodraw"><b>No drawing at all</b> — {E(names)}. '
                      f'{E(bk.get("none_note", ""))}</p>')
            body.append(f"""
        <div class="sc" id="sc-{E(c['id'])}">
          <div class="sc-h"><span class="sid">{E(c['id'])}</span><h3>{E(c['title'])}</h3>
            <span class="chip {E(c['kind'].replace(' ', '-'))}">{E(c['kind'])}</span></div>
          <div class="sc-b">
            <div class="canon">{pycode(c['canonical'])}</div>
            <p class="ports">{E(c['ports'])}</p>
            <div class="exs">{exs}</div>
          </div>
          {''.join(bucket_html)}
          {nd}
        </div>""")
        secs.append(f'<h2 id="{sec_id}">{E(cards[0]["section"])}</h2>' + "".join(body))

    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Every Python scenario, in every industry vocabulary</title>
<style>:root{{{chr(10).join(img_css)}}}{CSS}{SHARED_CSS}</style></head><body>{SHARED_DEFS}<div class="wrap">
<p class="kicker">bbox-ui · 23 september 2026 · 11 vocabularies read from their own documentation</p>
<h1>How the industry would draw it</h1>
<p class="sub">Every scenario from <i>Python, stripped to blocks and ports</i>, drawn in each
distinct way the field has thought of — the eleven vocabularies collapsed into the handful of
genuinely different mechanisms behind them, so the same idea is drawn once and labelled with
everyone who uses it.</p>
<div class="facts">
  <div class="fact"><b>{len(scen)}</b><span>scenarios</span></div>
  <div class="fact"><b>{sum(len(c['examples']) for c in scen)}</b><span>Python examples</span></div>
  <div class="fact"><b>11</b><span>vocabularies</span></div>
  <div class="fact"><b>{n_buckets}</b><span>distinct mechanisms, after grouping</span></div>
  <div class="fact"><b>{n_boards}</b><span>boards drawn</span></div>
  <div class="fact"><b>{n_buckets and round(n_buckets/max(len(scen),1),1)}</b><span>mechanisms per scenario</span></div>
</div>
{{LEDE}}
<h2>Which of these are actually the same choice?</h2>
<p class="mech" style="margin-bottom:6px">Nobody wrote this number down — it falls out of {n_buckets} grouping
decisions made one scenario at a time. Each cell counts the buckets where those two
vocabularies were judged to draw the thing <i>the same way</i>. Read the bright squares:
they are the pairs where picking one over the other is a matter of paint, not of mechanism.</p>
{agreement_table(buckets)}
<p class="ev" style="margin-top:4px">Darker is more agreement, scaled against the smaller of the two tools\u2019 bucket counts.</p>

<h2>The eleven vocabularies</h2>
<p class="mech" style="margin-bottom:16px">Each read from its own documentation this run. The screenshot
is from that documentation — proof the mechanism described is the one the tool actually ships.</p>
<div class="vgrid">{''.join(vcards)}</div>
<div class="nav">{''.join(nav)}</div>
{''.join(secs)}
{{TAIL}}
<p class="foot">Built by <code>docs/build_industry_vocabularies_report.py</code>. Scenarios extracted
from <code>reports/python-syntax-scenarios-2026-09-23.html</code> by
<code>docs/extract_python_scenarios.py</code> — same source of truth, not a retyped copy.
Every board is drawn by <code>docs/vocab_board.py</code> from a declarative spec, so all
{n_boards} read as one hand. Screenshots belong to their vendors and are reproduced as
documentation references.</p>
</div></body></html>"""
    narrative = narrative or {}
    page = page.replace("{LEDE}", narrative.get("lede", ""))
    page = page.replace("{TAIL}", narrative.get("tail", ""))
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(page)
    return dict(boards=n_boards, buckets=n_buckets, errors=errors, bytes=os.path.getsize(out))


def main():
    ap = argparse.ArgumentParser()
    for a in ("scenarios", "sheets", "buckets", "out"):
        ap.add_argument("--" + a, required=True)
    ap.add_argument("--images", required=True)
    ap.add_argument("--narrative", default="")
    args = ap.parse_args()
    scen = json.load(open(args.scenarios))
    sheets = json.load(open(args.sheets))
    buckets = json.load(open(args.buckets))
    manifest = json.load(open(os.path.join(args.images, "manifest.json")))
    images = {k: os.path.join(args.images, v) for k, v in manifest.items()}
    kept_path = os.path.join(args.images, "kept.json")
    kept = json.load(open(kept_path)) if os.path.exists(kept_path) else {}
    narrative = json.load(open(args.narrative)) if args.narrative else {}
    r = build(scen, sheets, buckets, images, args.out, kept, narrative)
    print(f"{r['buckets']} buckets · {r['boards']} boards · {r['bytes']/1024:.0f} KB")
    if r["errors"]:
        print(f"\n{len(r['errors'])} BOARD ERRORS:")
        for e in r["errors"][:40]:
            print("  " + e)


if __name__ == "__main__":
    main()
