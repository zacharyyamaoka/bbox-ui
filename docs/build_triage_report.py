#!/usr/bin/env python3
"""Build the parity BACKLOG TRIAGE report — the thumbs up/down gate.

Zach: "before you start implementing please prepare a full list for me to
review, where I can just scroll thorugh a media rich html report and just
select thumbs up or down".

So this is an INPUT surface first and a document second. One card per candidate
feature, each with a real screenshot of that feature in the old app, and two
buttons. Nothing is built until he has been through it.

The media comes from `/home/bam/systemsketch/docs/assets` — 1,093 PNGs the old
app accumulated documenting itself, named after the features they show
(`wrap-selection-menu.png`, `compare-modal-side-by-side.png`,
`command-palette-commands-2026-09-02.png`). Matching a backlog item to its
picture is therefore a name-matching problem, not a screenshotting one, which
is why this report does not drive the archived app at all — that app autosaves
into whatever board it has open, and those are his 31 real boards.

Input:  a JSON backlog (see BACKLOG_SCHEMA below).
Output: one self-contained HTML file, every image inlined.
"""
from __future__ import annotations

import base64
import json
import pathlib
import re
import sys
from urllib.parse import quote

DONOR_ASSETS = pathlib.Path("/home/bam/systemsketch/docs/assets")
OUT = pathlib.Path("/home/bam/bbox-ui/reports/media/parity-triage-2026-09-20.html")
THUMB_MAX_BYTES = 120_000  # per image, after downscale

# Words that carry no matching signal.
STOP = {
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "by",
    "is", "it", "its", "into", "from", "at", "as", "be", "that", "this",
    "selection", "shape", "shapes", "block", "blocks", "menu", "view", "mode",
    "support", "editing", "edit", "show", "hide", "toggle", "panel",
}


def tokens(text: str) -> list[str]:
    return [w for w in re.split(r"[^a-z0-9]+", text.lower()) if w and w not in STOP and len(w) > 2]


def index_assets() -> list[tuple[str, pathlib.Path, set[str]]]:
    out = []
    if not DONOR_ASSETS.is_dir():
        return out
    for p in sorted(DONOR_ASSETS.glob("*.png")):
        stem = re.sub(r"[-_]\d{4}-\d{2}-\d{2}$", "", p.stem)
        stem = re.sub(r"[-_]\d{6,}$", "", stem)
        out.append((stem, p, set(tokens(stem))))
    return out


ASSETS = index_assets()


def match_image(name: str, area: str, hint: str = "") -> pathlib.Path | None:
    """Best donor screenshot for a feature, or None.

    Scores on shared tokens. Requires at least TWO overlapping tokens, or one
    long distinctive one — a single short token like "port" matches ninety
    files and would put a confidently wrong picture beside a feature, which is
    worse than showing none.
    """
    if hint:
        direct = DONOR_ASSETS / hint
        if direct.exists():
            return direct
    want = set(tokens(name)) | set(tokens(area))
    if not want:
        return None
    best, best_score = None, 0
    for _stem, path, have in ASSETS:
        shared = want & have
        if not shared:
            continue
        score = sum(len(w) for w in shared) + 3 * len(shared)
        if score > best_score:
            best, best_score = path, score
    strong = best is not None and (
        len(want & set(tokens(best.stem))) >= 2 or any(len(w) >= 7 for w in want & set(tokens(best.stem)))
    )
    return best if strong else None


def uri(path: pathlib.Path | None) -> str:
    if path is None or not path.exists():
        return ""
    data = path.read_bytes()
    if len(data) > THUMB_MAX_BYTES:
        try:
            from PIL import Image
            import io
            im = Image.open(io.BytesIO(data)).convert("RGB")
            w = 560
            if im.width > w:
                im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, format="JPEG", quality=72, optimize=True)
            return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
        except Exception:
            return ""
    return "data:image/png;base64," + base64.b64encode(data).decode()


WAVE_NOTE = {
    1: "Noticeable and cheap — a one-liner or a straight port.",
    2: "Noticeable, but real work.",
    3: "Worth having, lower urgency.",
    4: "Unbuilt product work. Costed honestly, not smuggled into a quick wave.",
}


def card(item: dict, n: int) -> str:
    img_path = match_image(item.get("name", ""), item.get("area", ""), item.get("image", ""))
    u = uri(img_path)
    shot = (
        f'<img alt="{item.get("name","")}" src="{u}" loading="lazy">'
        f'<div class="cap">{img_path.name}</div>' if u
        else '<div class="noshot">no donor capture matched<br><span>the feature is real; the picture is not</span></div>'
    )
    notice = int(item.get("noticeability", 3) or 3)
    return f"""
<article class="card" data-n="{n}" data-name="{item.get('name','')}" data-area="{item.get('area','')}"
         data-effort="{item.get('effort','')}" data-wave="{item.get('wave','')}">
  <div class="shot">{shot}</div>
  <div class="meat">
    <h3><span class="idx">{n}</span>{item.get('name','')}</h3>
    <p class="what">{item.get('whatItDoes','')}</p>
    <div class="meta">
      <span class="pill area">{item.get('area','')}</span>
      <span class="pill effort e-{re.sub(r'[^a-z]', '', str(item.get('effort','')).lower())}">{item.get('effort','')}</span>
      <span class="pill notice" title="how much you'd notice it missing">{'●' * notice}{'○' * (5 - notice)}</span>
      <span class="pill bbox">{item.get('inBbox','')}</span>
    </div>
    <details><summary>evidence</summary><code>{item.get('donorEvidence','')}</code></details>
  </div>
  <div class="vote">
    <button class="up" data-v="yes" title="build it">▲ Yes</button>
    <button class="down" data-v="no" title="skip it">▼ No</button>
  </div>
</article>"""


def build(backlog: dict) -> str:
    waves = backlog.get("waves", {})
    body = []
    total = 0
    for wnum in sorted(waves, key=lambda k: int(k)):
        items = waves[wnum]
        if not items:
            continue
        body.append(f'<h2>Wave {wnum} <span class="wn">{WAVE_NOTE.get(int(wnum), "")}</span> '
                    f'<span class="count">{len(items)}</span></h2>')
        for it in items:
            total += 1
            body.append(card(it, total))
    dont = backlog.get("doNotBuild", [])
    dont_html = "".join(
        f"<tr><td>{d.get('name','')}</td><td>{d.get('why','')}</td></tr>" for d in dont
    )
    matched = sum(1 for wnum in waves for it in waves[wnum]
                  if match_image(it.get("name", ""), it.get("area", ""), it.get("image", "")))
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Parity backlog</title>
<style>
 :root{{--bg:#0f1013;--fg:#ececf0;--muted:#9a9aa6;--line:#26262e;--card:#16171b;
   --accent:#7d9bff;--yes:#4ac585;--no:#ff8a80;--warn:#e0b050}}
 @media (prefers-color-scheme:light){{:root:not([data-theme="dark"]){{--bg:#fbfbfd;--fg:#16161a;
   --muted:#6b6b76;--line:#e4e4ea;--card:#fff;--accent:#2f5bd8;--yes:#137a4b;--no:#b3261e;--warn:#8a5a00}}}}
 *{{box-sizing:border-box}}
 body{{margin:0;background:var(--bg);color:var(--fg);
   font:16px/1.55 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif}}
 .wrap{{max-width:1080px;margin:0 auto;padding:40px 16px 120px}}
 h1{{font-size:28px;margin:0 0 6px;letter-spacing:-.02em}}
 .sub{{color:var(--muted);margin:0 0 8px}}
 .how{{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:18px 0 26px}}
 .how b{{color:var(--accent)}}
 h2{{font-size:13px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);
   margin:34px 0 12px;font-weight:650;display:flex;align-items:baseline;gap:10px}}
 h2 .wn{{text-transform:none;letter-spacing:0;font-weight:400;font-size:13px}}
 h2 .count{{margin-left:auto;font-size:12px;background:var(--line);padding:2px 9px;border-radius:99px}}
 .card{{display:grid;grid-template-columns:260px 1fr auto;gap:16px;align-items:start;
   background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;margin:0 0 10px;
   scroll-margin-top:12px}}
 @media (max-width:860px){{.card{{grid-template-columns:1fr}}}}
 .card[data-vote="yes"]{{border-color:var(--yes);box-shadow:inset 3px 0 0 var(--yes)}}
 .card[data-vote="no"]{{border-color:var(--no);opacity:.5}}
 .shot img{{width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:8px;background:#111}}
 .cap{{font-size:10px;color:var(--muted);margin-top:4px;font-family:ui-monospace,monospace;
   overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
 .noshot{{padding:26px 10px;text-align:center;border:1px dashed var(--line);border-radius:8px;
   color:var(--muted);font-size:12px}}
 .noshot span{{font-size:11px;opacity:.75}}
 h3{{margin:0 0 5px;font-size:16.5px;letter-spacing:-.01em;display:flex;gap:9px;align-items:baseline}}
 .idx{{color:var(--muted);font-size:12px;font-family:ui-monospace,monospace;flex:none}}
 .what{{margin:0 0 9px;font-size:14px;color:var(--fg)}}
 .meta{{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px}}
 .pill{{font-size:11px;padding:2px 8px;border-radius:99px;border:1px solid var(--line);color:var(--muted)}}
 .pill.notice{{letter-spacing:2px;color:var(--warn)}}
 .e-oneliner,.e-port{{color:var(--yes);border-color:var(--yes)}}
 .e-realwork{{color:var(--warn);border-color:var(--warn)}}
 .e-unbuiltproductwork{{color:var(--no);border-color:var(--no)}}
 details{{font-size:12px;color:var(--muted)}} details code{{font-size:11px}}
 .vote{{display:flex;flex-direction:column;gap:6px}}
 .vote button{{font:inherit;font-size:13px;font-weight:600;padding:8px 14px;border-radius:9px;
   border:1px solid var(--line);background:transparent;color:var(--fg);cursor:pointer;min-width:74px}}
 .vote .up[aria-pressed="true"]{{background:var(--yes);border-color:var(--yes);color:#04140c}}
 .vote .down[aria-pressed="true"]{{background:var(--no);border-color:var(--no);color:#210404}}
 table{{width:100%;border-collapse:collapse;font-size:13.5px}}
 td{{padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}}
 td:first-child{{white-space:nowrap;font-weight:600;width:1%}}
 .bar{{position:fixed;left:0;right:0;bottom:0;background:color-mix(in srgb,var(--bg) 93%,transparent);
   backdrop-filter:blur(10px);border-top:1px solid var(--line);padding:11px 16px;z-index:9}}
 .bar .inner{{max-width:1080px;margin:0 auto;display:flex;gap:10px;align-items:center;flex-wrap:wrap}}
 .bar button{{font:inherit;font-size:14px;font-weight:600;padding:9px 16px;border-radius:9px;border:0;
   background:var(--accent);color:#fff;cursor:pointer}}
 .bar .ghost{{background:transparent;color:var(--muted);border:1px solid var(--line)}}
 #tally{{color:var(--muted);font-size:13px}}
 #out{{width:100%;margin-top:10px;font-family:ui-monospace,monospace;font-size:12px;padding:10px;
   border-radius:9px;border:1px solid var(--line);background:var(--card);color:var(--fg);display:none}}
 #out.show{{display:block}}
</style></head><body><div class="wrap">
<h1>Parity backlog — what the old app had that this one doesn’t</h1>
<p class="sub">{total} candidates · {matched} with a real screenshot from the old app’s own {len(ASSETS)} captures · 20 Sep 2026</p>
<div class="how"><b>Scroll and vote.</b> ▲ Yes = build it, ▼ No = skip it. Nothing is implemented until you’ve been through this.
Your picks are saved as you go, so you can close the tab and come back. <b>Copy my picks</b> at the bottom gives me the list.
Unvoted items are treated as “not yet decided”, never as yes.</div>
{''.join(body)}
{('<h2>Do not build — you already said no</h2><table><tbody>' + dont_html + '</tbody></table>') if dont_html else ''}
</div>
<div class="bar"><div class="inner">
  <button id="copy">Copy my picks</button>
  <button class="ghost" id="allno">Mark the rest No</button>
  <button class="ghost" id="clear">Clear</button>
  <span id="tally"></span>
  <textarea id="out" rows="10" readonly></textarea>
</div></div>
<script>
function save(k,v){{try{{localStorage.setItem(k,v)}}catch{{}}}}
function read(k){{try{{return localStorage.getItem(k)}}catch{{return null}}}}
var cards=[].slice.call(document.querySelectorAll(".card"));
function tally(){{
  var y=cards.filter(function(c){{return c.dataset.vote==="yes"}}).length;
  var n=cards.filter(function(c){{return c.dataset.vote==="no"}}).length;
  document.getElementById("tally").textContent=y+" yes · "+n+" no · "+(cards.length-y-n)+" undecided";
}}
function setVote(card,v){{
  card.dataset.vote=v||"";
  card.querySelectorAll(".vote button").forEach(function(b){{
    if(v&&b.dataset.v===v) b.setAttribute("aria-pressed","true"); else b.removeAttribute("aria-pressed");
  }});
  if(v) save("triage-"+card.dataset.n,v); else save("triage-"+card.dataset.n,"");
  tally();
}}
cards.forEach(function(card){{
  var v=read("triage-"+card.dataset.n); if(v) setVote(card,v);
  card.querySelectorAll(".vote button").forEach(function(b){{
    b.addEventListener("click",function(){{
      setVote(card, card.dataset.vote===b.dataset.v ? "" : b.dataset.v);
    }});
  }});
}});
tally();
document.getElementById("allno").addEventListener("click",function(){{
  cards.forEach(function(c){{ if(!c.dataset.vote) setVote(c,"no") }});
}});
document.getElementById("clear").addEventListener("click",function(){{
  cards.forEach(function(c){{ setVote(c,"") }});
}});
document.getElementById("copy").addEventListener("click",function(){{
  var yes=[],no=[],un=[];
  cards.forEach(function(c){{
    var line="- "+c.dataset.name+"  ("+c.dataset.area+", "+c.dataset.effort+", wave "+c.dataset.wave+")";
    if(c.dataset.vote==="yes") yes.push(line);
    else if(c.dataset.vote==="no") no.push(line);
    else un.push(line);
  }});
  var L=["# Parity backlog — my picks",""];
  L.push("## Build these ("+yes.length+")",""); L.push.apply(L,yes.length?yes:["_none_"]); L.push("");
  L.push("## Skip these ("+no.length+")",""); L.push.apply(L,no.length?no:["_none_"]); L.push("");
  if(un.length){{L.push("## Not decided ("+un.length+")",""); L.push.apply(L,un); L.push("")}}
  var out=document.getElementById("out");
  out.value=L.join("\\n"); out.classList.add("show"); out.focus(); out.select();
  // .catch, not try/catch: writeText returns a promise, so a sync catch cannot
  // see its rejection and every copy on file:// throws.
  try{{navigator.clipboard.writeText(out.value).catch(function(){{}})}}catch{{}}
}});
</script></body></html>
"""


if __name__ == "__main__":
    src = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "docs/parity-backlog.json")
    backlog = json.loads(src.read_text())
    html = build(backlog)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    enc = len(quote(html, safe=""))
    n = sum(len(v) for v in backlog.get("waves", {}).values())
    print(f"wrote {OUT} ({OUT.stat().st_size:,} bytes) — {n} candidates")
    print(f"encoded data: URL {enc:,} / 2,097,024 "
          f"({'OK' if enc < 2_097_024 else 'OVER CAP — browser only, say so in the handoff'})")
