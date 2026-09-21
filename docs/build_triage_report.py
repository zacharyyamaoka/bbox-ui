#!/usr/bin/env python3
"""Build the parity BACKLOG TRIAGE report — the thumbs up/down gate.

Zach: "before you start implementing please prepare a full list for me to
review, where I can just scroll thorugh a media rich html report and just
select thumbs up or down". Then, on the first build: "make it so I can click
to enlarge the screen shots and make them bigger my default I cannot even see
what I am looking at".

He was right, and the cause was a bad trade on my side. The first build inlined
every picture as base64 to keep the file self-contained, which put it against
the Claude Code preview's 2,097,024-byte ENCODED ceiling; I bought the fit by
crushing 468 thumbnails to 300px at JPEG q52 — destroying the one thing the
report exists to show.

So this build stops inlining. It is opened in Chrome through
`/home/bam/.local/bin/open`, and a real browser resolves sibling files, so the
captures sit next to the HTML in `triage-assets/` at FULL resolution and the
page points at them. The HTML is then small enough to be ONE file again instead
of two, the pictures are as large as the layout allows, and clicking one opens
it full size.

The trade this makes instead, stated plainly: the page is no longer
self-contained, so moving the .html without `triage-assets/` breaks the images,
and Claude Code's own preview pane (whose data: URL is non-hierarchical) cannot
render them. Both are acceptable here because the handoff opens it in a browser
from its own directory — but it is a real constraint, not a free lunch.

Media source: `/home/bam/systemsketch/docs/assets` — 1,093 PNGs the old app
accumulated documenting itself, named after the features they show. Pairing a
backlog row with its picture is name-matching, not screenshotting, which is why
this never drives the archived app: that app autosaves into whatever board it
has open, and those are his 31 real boards.
"""
from __future__ import annotations

import json
import pathlib
import re
import shutil
import sys

DONOR_ASSETS = pathlib.Path("/home/bam/systemsketch/docs/assets")
OUT = pathlib.Path("/home/bam/bbox-ui/reports/media/parity-triage-2026-09-20.html")
ASSET_DIR_NAME = "triage-assets"
ASSET_DIR = OUT.parent / ASSET_DIR_NAME

STOP = {
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "by",
    "is", "it", "its", "into", "from", "at", "as", "be", "that", "this",
    "selection", "shape", "shapes", "block", "blocks", "menu", "view", "mode",
    "support", "editing", "edit", "show", "hide", "toggle", "panel",
}


def tokens(text):
    return [w for w in re.split(r"[^a-z0-9]+", text.lower()) if w and w not in STOP and len(w) > 2]


def index_assets():
    if not DONOR_ASSETS.is_dir():
        return []
    out = []
    for p in sorted(DONOR_ASSETS.glob("*.png")):
        stem = re.sub(r"[-_]\d{4}-\d{2}-\d{2}$", "", p.stem)
        stem = re.sub(r"[-_]\d{6,}$", "", stem)
        out.append((stem, p, set(tokens(stem))))
    return out


ASSETS = index_assets()
AREA_REPRESENTATIVE = {}


def pick_area_representatives():
    keys = {
        "wires": ("edge-", "connector-", "trace-", "tidy-"),
        "shapes": ("block-", "port-", "region-", "loop-"),
        "pill": ("contextual-", "appearance-", "figjam-"),
        "menus": ("menu-", "toolbar-", "command-"),
        "panels": ("inspector-", "frames-", "library-"),
        "files": ("workspace-", "draft-", "compare-", "file-"),
        "settings": ("interface-", "wheel-", "zoom-", "theme-"),
        "keyboard": ("command-palette-",),
        "canvas": ("canvas-", "viewport-", "zoom-"),
        "backend": ("code-", "type-", "literal-"),
    }
    for area, prefixes in keys.items():
        best, best_size = None, 0
        for _stem, path, _have in ASSETS:
            if path.name.startswith(prefixes) and path.stat().st_size > best_size:
                best, best_size = path, path.stat().st_size
        if best:
            AREA_REPRESENTATIVE[area] = best.name


def match_image(name, area, hint=""):
    """Best donor screenshot for a feature, or None.

    Needs two overlapping tokens or one long distinctive one. A single short
    token like "port" matches ninety files, and a confidently wrong picture
    beside a feature is worse than none — so those fall through to an area
    stand-in, which the card labels "representative" rather than implying the
    picture IS the feature.
    """
    if hint and (DONOR_ASSETS / hint).exists():
        return DONOR_ASSETS / hint
    want = set(tokens(name)) | set(tokens(area))
    if not want:
        return None
    best, best_score = None, 0
    for _stem, path, have in ASSETS:
        shared = want & have
        if shared:
            score = sum(len(w) for w in shared) + 3 * len(shared)
            if score > best_score:
                best, best_score = path, score
    if best is not None:
        overlap = want & set(tokens(best.stem))
        if len(overlap) >= 2 or any(len(w) >= 7 for w in overlap):
            return best
    rep = AREA_REPRESENTATIVE.get(area)
    if rep and (DONOR_ASSETS / rep).exists():
        return DONOR_ASSETS / rep
    return None


def stage_assets(backlog):
    """Copy every matched capture next to the HTML, at full resolution."""
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    used = set()
    for wave in backlog.get("waves", {}).values():
        for it in wave:
            p = match_image(it.get("name", ""), it.get("area", ""), it.get("image", ""))
            if p:
                used.add(p)
    for p in used:
        target = ASSET_DIR / p.name
        if not target.exists() or target.stat().st_size != p.stat().st_size:
            shutil.copy2(p, target)
    return len(used)


WAVE_NOTE = {
    1: "Noticeable and cheap — a one-liner or a straight port.",
    2: "Noticeable, but real work.",
    3: "Worth having, lower urgency.",
    4: "Unbuilt product work. Costed honestly, not smuggled into a quick wave.",
}


def esc(s):
    return (str(s or "").replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def clip(text, n):
    text = (text or "").strip()
    return text if len(text) <= n else text[: n - 1].rstrip() + "…"


def card(item, n):
    p = match_image(item.get("name", ""), item.get("area", ""), item.get("image", ""))
    is_rep = bool(p) and p.name == AREA_REPRESENTATIVE.get(item.get("area", ""))
    if p:
        src = ASSET_DIR_NAME + "/" + p.name
        cap = ("representative — " if is_rep else "") + p.name
        shot = ('<button class="shotbtn" data-full="' + esc(src) + '" title="Click to enlarge">'
                '<img src="' + esc(src) + '" alt="' + esc(item.get("name", "")) + '" loading="lazy"></button>'
                '<div class="cap' + (" rep" if is_rep else "") + '">' + esc(cap) + '</div>')
    else:
        shot = ('<div class="noshot">no donor capture matched<br>'
                '<span>the feature is real; the picture is not</span></div>')

    q = clip(item.get("zachQuote") or "", 400)
    quote = '<blockquote class="zq">' + esc(q) + '</blockquote>' if q else ""
    notice = int(item.get("noticeability", 3) or 3)
    effort_cls = re.sub(r"[^a-z]", "", str(item.get("effort", "")).lower())
    dots = "●" * notice + "○" * (5 - notice)
    return (
        '\n<article class="card" data-n="' + str(n) + '" data-name="' + esc(item.get("name", "")) + '"'
        ' data-area="' + esc(item.get("area", "")) + '" data-effort="' + esc(item.get("effort", "")) + '"'
        ' data-wave="' + esc(item.get("wave", "")) + '">'
        '<div class="shot">' + shot + '</div>'
        '<div class="meat">'
        '<h3><span class="idx">' + str(n) + '</span>' + esc(item.get("name", "")) + '</h3>'
        '<p class="what">' + esc(item.get("whatItDoes", "")) + '</p>'
        + quote +
        '<div class="meta">'
        '<span class="pill">' + esc(item.get("area", "")) + '</span>'
        '<span class="pill e-' + effort_cls + '">' + esc(item.get("effort", "")) + '</span>'
        '<span class="pill notice" title="how much you&#39;d notice it missing">' + dots + '</span>'
        '</div>'
        '<details><summary>evidence &amp; proof it’s missing</summary>'
        '<div class="ev"><b>donor</b> <code>' + esc(clip(item.get("donorEvidence", ""), 240)) + '</code></div>'
        '<div class="ev"><b>proof</b> <code>' + esc(clip(item.get("proofMissing", ""), 300)) + '</code></div>'
        '</details>'
        '</div>'
        '<div class="vote">'
        '<button class="up" data-v="yes" title="build it">▲ Yes</button>'
        '<button class="down" data-v="no" title="skip it">▼ No</button>'
        '</div></article>')


def build(backlog):
    waves = backlog.get("waves", {})
    body, total = [], 0
    for wnum in sorted(waves, key=lambda k: int(k)):
        items = waves[wnum]
        if not items:
            continue
        body.append('<h2 id="w' + wnum + '">Wave ' + wnum +
                    ' <span class="wn">' + WAVE_NOTE.get(int(wnum), "") + '</span>'
                    '<span class="count">' + str(len(items)) + '</span></h2>')
        for it in items:
            total += 1
            body.append(card(it, total))
    dont = "".join('<tr><td>' + esc(d.get("name", "")) + '</td><td>' +
                   esc(clip(d.get("why", ""), 400)) + '</td></tr>'
                   for d in backlog.get("doNotBuild", []))
    matched = sum(1 for w in waves.values() for it in w
                  if match_image(it.get("name", ""), it.get("area", ""), it.get("image", "")))
    nav = "".join('<a href="#w' + w + '">Wave ' + w + ' <b>' + str(len(waves[w])) + '</b></a>'
                  for w in sorted(waves, key=int) if waves[w])

    css = """
 :root{--bg:#0f1013;--fg:#ececf0;--muted:#9a9aa6;--line:#26262e;--card:#16171b;
   --accent:#7d9bff;--yes:#4ac585;--no:#ff8a80;--warn:#e0b050;--shot:460px}
 @media (prefers-color-scheme:light){:root:not([data-theme="dark"]){--bg:#fbfbfd;--fg:#16161a;
   --muted:#6b6b76;--line:#e4e4ea;--card:#fff;--accent:#2f5bd8;--yes:#137a4b;--no:#b3261e;--warn:#8a5a00}}
 *{box-sizing:border-box}
 body{margin:0;background:var(--bg);color:var(--fg);
   font:16px/1.55 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif}
 .wrap{max-width:1500px;margin:0 auto;padding:38px 18px 130px}
 h1{font-size:28px;margin:0 0 6px;letter-spacing:-.02em}
 .sub{color:var(--muted);margin:0 0 12px;font-size:14.5px}
 .how{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:16px 0 20px}
 .how b{color:var(--accent)}
 .nav{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 26px}
 .nav a{font-size:12.5px;color:var(--muted);text-decoration:none;border:1px solid var(--line);
   padding:5px 11px;border-radius:99px}
 .nav a:hover{border-color:var(--accent);color:var(--fg)} .nav a b{color:var(--fg)}
 h2{font-size:13px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);
   margin:38px 0 14px;font-weight:650;display:flex;align-items:baseline;gap:10px;scroll-margin-top:14px}
 h2 .wn{text-transform:none;letter-spacing:0;font-weight:400}
 h2 .count{margin-left:auto;font-size:12px;background:var(--line);padding:2px 9px;border-radius:99px}
 .card{display:grid;grid-template-columns:var(--shot) 1fr auto;gap:18px;align-items:start;
   background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;margin:0 0 12px}
 @media (max-width:1000px){.card{grid-template-columns:1fr}}
 .card[data-vote="yes"]{border-color:var(--yes);box-shadow:inset 4px 0 0 var(--yes)}
 .card[data-vote="no"]{border-color:var(--no);opacity:.45}
 .shotbtn{display:block;width:100%;padding:0;border:1px solid var(--line);border-radius:9px;
   background:#0b0b0d;cursor:zoom-in;overflow:hidden}
 .shotbtn:hover{border-color:var(--accent)}
 .shotbtn img{width:100%;height:auto;display:block;max-height:680px;object-fit:contain}
 .cap{font-size:11px;color:var(--muted);margin-top:5px;font-family:ui-monospace,monospace;
   overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 .cap.rep{opacity:.6;font-style:italic}
 .noshot{padding:48px 12px;text-align:center;color:var(--muted);font-size:13px;
   border:1px dashed var(--line);border-radius:9px}
 .noshot span{font-size:11.5px;opacity:.75}
 h3{margin:0 0 6px;font-size:18px;letter-spacing:-.01em;display:flex;gap:10px;align-items:baseline}
 .idx{color:var(--muted);font-size:12px;font-family:ui-monospace,monospace;flex:none}
 .what{margin:0 0 10px;font-size:14.5px}
 .zq{margin:0 0 10px;padding:8px 12px;border-left:3px solid var(--accent);border-radius:0 7px 7px 0;
   background:color-mix(in srgb,var(--accent) 10%,transparent);font-size:13.5px;font-style:italic}
 .zq::before{content:'\\201C'} .zq::after{content:'\\201D'}
 .meta{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:7px}
 .pill{font-size:11.5px;padding:2px 9px;border-radius:99px;border:1px solid var(--line);color:var(--muted)}
 .pill.notice{letter-spacing:2px;color:var(--warn)}
 .e-oneliner,.e-port{color:var(--yes);border-color:var(--yes)}
 .e-realwork{color:var(--warn);border-color:var(--warn)}
 .e-unbuiltproductwork{color:var(--no);border-color:var(--no)}
 details{font-size:12.5px;color:var(--muted)} details code{font-size:11.5px;word-break:break-word}
 .ev{margin:5px 0} .ev b{color:var(--fg);font-weight:600;margin-right:5px}
 .vote{display:flex;flex-direction:column;gap:7px}
 .vote button{font:inherit;font-size:13.5px;font-weight:600;padding:9px 15px;border-radius:9px;
   border:1px solid var(--line);background:transparent;color:var(--fg);cursor:pointer;min-width:80px}
 .vote .up[aria-pressed="true"]{background:var(--yes);border-color:var(--yes);color:#04140c}
 .vote .down[aria-pressed="true"]{background:var(--no);border-color:var(--no);color:#210404}
 table{width:100%;border-collapse:collapse;font-size:13.5px}
 td{padding:9px 11px;border-bottom:1px solid var(--line);vertical-align:top}
 td:first-child{white-space:nowrap;font-weight:600;width:1%}
 .bar{position:fixed;left:0;right:0;bottom:0;background:color-mix(in srgb,var(--bg) 94%,transparent);
   backdrop-filter:blur(10px);border-top:1px solid var(--line);padding:11px 16px;z-index:9}
 .bar .inner{max-width:1500px;margin:0 auto;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
 .bar button{font:inherit;font-size:14px;font-weight:600;padding:9px 16px;border-radius:9px;border:0;
   background:var(--accent);color:#fff;cursor:pointer}
 .bar .ghost{background:transparent;color:var(--muted);border:1px solid var(--line);font-weight:500}
 .bar .ghost[aria-pressed="true"]{color:var(--fg);border-color:var(--accent)}
 #tally{color:var(--muted);font-size:13px;margin-left:auto}
 #out{width:100%;margin-top:10px;font-family:ui-monospace,monospace;font-size:12px;padding:10px;
   border-radius:9px;border:1px solid var(--line);background:var(--card);color:var(--fg);display:none}
 #out.show{display:block}
 #lb{position:fixed;inset:0;background:rgba(0,0,0,.93);display:none;z-index:50;cursor:zoom-out;
   align-items:center;justify-content:center;padding:26px}
 #lb.show{display:flex}
 #lb img{max-width:100%;max-height:100%;object-fit:contain;border-radius:6px}
 #lbcap{position:fixed;bottom:16px;left:0;right:0;text-align:center;color:#bbb;font-size:12px;
   font-family:ui-monospace,monospace}
"""

    js = """
function save(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function read(k){try{return localStorage.getItem(k)}catch(e){return null}}
var cards=[].slice.call(document.querySelectorAll(".card"));

var lb=document.getElementById("lb"), lbi=lb.querySelector("img"), lbc=document.getElementById("lbcap");
document.addEventListener("click",function(e){
  var b=e.target.closest(".shotbtn");
  if(b){ lbi.src=b.dataset.full; lbc.textContent=b.dataset.full.split("/").pop(); lb.classList.add("show"); return; }
  if(e.target.closest("#lb")) lb.classList.remove("show");
});
document.addEventListener("keydown",function(e){ if(e.key==="Escape") lb.classList.remove("show"); });

function setSize(w){
  document.documentElement.style.setProperty("--shot", w+"px");
  save("triage-shot-w", w);
  document.querySelectorAll(".sz").forEach(function(b){
    if(String(b.dataset.w)===String(w)) b.setAttribute("aria-pressed","true"); else b.removeAttribute("aria-pressed");
  });
}
document.querySelectorAll(".sz").forEach(function(b){
  b.addEventListener("click",function(){ setSize(b.dataset.w) });
});
setSize(read("triage-shot-w") || 460);

function tally(){
  var y=cards.filter(function(c){return c.dataset.vote==="yes"}).length;
  var n=cards.filter(function(c){return c.dataset.vote==="no"}).length;
  document.getElementById("tally").textContent=y+" yes \\u00b7 "+n+" no \\u00b7 "+(cards.length-y-n)+" undecided";
}
function setVote(card,v){
  card.dataset.vote=v||"";
  card.querySelectorAll(".vote button").forEach(function(b){
    if(v&&b.dataset.v===v) b.setAttribute("aria-pressed","true"); else b.removeAttribute("aria-pressed");
  });
  save("triage-"+card.dataset.n, v||"");
  tally();
}
cards.forEach(function(card){
  var v=read("triage-"+card.dataset.n); if(v) setVote(card,v);
  card.querySelectorAll(".vote button").forEach(function(b){
    b.addEventListener("click",function(){
      setVote(card, card.dataset.vote===b.dataset.v ? "" : b.dataset.v);
    });
  });
});
tally();
document.getElementById("allno").addEventListener("click",function(){
  cards.forEach(function(c){ if(!c.dataset.vote) setVote(c,"no") });
});
document.getElementById("clear").addEventListener("click",function(){
  cards.forEach(function(c){ setVote(c,"") });
});
document.getElementById("copy").addEventListener("click",function(){
  var yes=[],no=[],un=[];
  cards.forEach(function(c){
    var line="- "+c.dataset.name+"  ("+c.dataset.area+", "+c.dataset.effort+", wave "+c.dataset.wave+")";
    if(c.dataset.vote==="yes") yes.push(line);
    else if(c.dataset.vote==="no") no.push(line);
    else un.push(line);
  });
  var L=["# Parity backlog \\u2014 my picks",""];
  L.push("## Build these ("+yes.length+")",""); L.push.apply(L,yes.length?yes:["_none_"]); L.push("");
  L.push("## Skip these ("+no.length+")",""); L.push.apply(L,no.length?no:["_none_"]); L.push("");
  if(un.length){L.push("## Not decided ("+un.length+")",""); L.push.apply(L,un); L.push("")}
  var out=document.getElementById("out");
  out.value=L.join("\\n"); out.classList.add("show"); out.focus(); out.select();
  // .catch, not try/catch: writeText returns a promise, so a sync catch cannot
  // see its rejection and every copy on file:// throws.
  try{navigator.clipboard.writeText(out.value).catch(function(){})}catch(e){}
});
"""

    return (
        '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        '<title>Parity backlog</title>\n<style>' + css + '</style></head><body><div class="wrap">\n'
        '<h1>Parity backlog — what the old app had that this one doesn’t</h1>\n'
        '<p class="sub">' + str(total) + ' genuine gaps · ' + str(matched) +
        ' with a screenshot from the old app’s own ' + str(len(ASSETS)) + ' captures · 20 Sep 2026<br>'
        'Distilled from 1,485 raw findings across 17 sweeps of the source and the vault — '
        '324 dropped because bbox-ui already has them, 211 as duplicates. '
        'Every card carries the grep that proves it is missing.</p>\n'
        '<div class="how"><b>Scroll and vote.</b> ▲ Yes = build it, ▼ No = skip it. '
        '<b>Click any screenshot to enlarge it</b> (Esc or click anywhere to close), and use the '
        'size buttons at the bottom to make them bigger or denser. Your picks save as you go, so you '
        'can close the tab and come back. Unvoted items are reported as “not yet decided”, never as yes.</div>\n'
        '<div class="nav">' + nav + '</div>\n'
        + "".join(body) + "\n"
        + (('<h2>Do not build — you already said no</h2><table><tbody>' + dont + '</tbody></table>') if dont else '')
        + '\n</div>\n<div id="lb"><img alt=""><div id="lbcap"></div></div>\n'
        '<div class="bar"><div class="inner">\n'
        '  <button id="copy">Copy my picks</button>\n'
        '  <button class="ghost" id="allno">Mark the rest No</button>\n'
        '  <button class="ghost" id="clear">Clear</button>\n'
        '  <span style="color:var(--muted);font-size:12.5px;margin-left:6px">size</span>\n'
        '  <button class="ghost sz" data-w="300">S</button>\n'
        '  <button class="ghost sz" data-w="460">M</button>\n'
        '  <button class="ghost sz" data-w="780">L</button>\n'
        '  <span id="tally"></span>\n'
        '  <textarea id="out" rows="10" readonly></textarea>\n'
        '</div></div>\n<script>' + js + '</script></body></html>\n')


if __name__ == "__main__":
    src = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "docs/parity-backlog.json")
    backlog = json.loads(src.read_text())
    pick_area_representatives()
    staged = stage_assets(backlog)
    html = build(backlog)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    n = sum(len(v) for v in backlog.get("waves", {}).values())
    media = sum(f.stat().st_size for f in ASSET_DIR.glob("*.png"))
    print("wrote " + str(OUT) + " (" + format(OUT.stat().st_size, ",") + " bytes HTML) — " + str(n) + " cards")
    print("  " + str(staged) + " full-resolution captures in " + ASSET_DIR_NAME + "/ (" + format(media, ",") + " bytes)")
    print("  images are REFERENCED, not inlined — open it from its own directory")
