"""Shared furniture for the reports in docs/build_*.py.

Extracted on the third report in the Sep-18 source-code-view thread, when the
CSS and the in-report feedback dock had been copied twice verbatim. The two
earlier builders (`build_source_code_view_report.py`,
`build_source_code_view_answers.py`) are deliberately NOT retrofitted onto this
— they are committed and working, and churning them to prove a point is how a
peer's in-flight run gets broken. New builders import from here.

What lives here is only what is genuinely shared and genuinely stable:
the palette and page chrome, the feedback dock (verdict buttons + note boxes +
one Copy-as-markdown button), and the two helpers that turn a capture into a
data URI and a shell command into a measured fact.
"""
from __future__ import annotations

import base64
import io
import pathlib
import subprocess

from PIL import Image, ImageChops


def sh(cmd: str, cwd: pathlib.Path) -> str:
    """Read a fact off a tree at build time, so a stale claim cannot survive."""
    return subprocess.run(
        cmd, shell=True, cwd=cwd, capture_output=True, text=True
    ).stdout.strip()


def shot(path: pathlib.Path, quality: int = 76, pad: int = 10) -> str:
    """A PNG on disk -> a trimmed WebP data URI.

    The trim matters: an element screenshot of a Storybook root still carries
    whatever empty page the story left below it, and a frame that is 60% ground
    reads as a mistake rather than as evidence.
    """
    if not path.exists():
        raise SystemExit(f"missing capture: {path}")
    im = Image.open(path).convert("RGB")
    bg = Image.new("RGB", im.size, im.getpixel((0, 0)))
    box = ImageChops.difference(im, bg).getbbox()
    if box:
        im = im.crop((max(0, box[0] - pad), max(0, box[1] - pad),
                      min(im.width, box[2] + pad), min(im.height, box[3] + pad)))
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=quality, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


CSS = """
  :root {
    --bg:#0e0f12; --panel:#15171c; --panel2:#1b1e25; --line:#282d38; --line2:#343b49;
    --fg:#e6e8ee; --dim:#9aa3b2; --dim2:#6b7383;
    --accent:#f0883e; --accent2:#5aa9f8; --ok:#3fb950; --warn:#e5534b; --gold:#e8c06a;
    --mono: ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  }
  * { box-sizing:border-box }
  body { margin:0; background:var(--bg); color:var(--fg);
    font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif; }
  .wrap { max-width:1080px; margin:0 auto; padding:48px 24px 140px }
  h1 { font-size:36px; line-height:1.12; margin:0 0 8px; letter-spacing:-.024em }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.14em; color:var(--dim2);
       margin:66px 0 18px; font-weight:600 }
  h4 { font-size:13.5px; margin:22px 0 8px }
  .sub { color:var(--dim); font-size:18px; margin:0 0 26px; line-height:1.5 }
  .kicker { font:600 11.5px/1 var(--mono); letter-spacing:.14em; text-transform:uppercase;
    color:var(--dim2); margin:0 0 18px }
  a { color:var(--accent2) }
  code { font-family:var(--mono); font-size:.9em; background:#0a0b0e; border:1px solid #23272f;
    border-radius:4px; padding:1px 5px }
  p { margin:0 0 12px }

  .answers { counter-reset:a; margin:26px 0 }
  .answer { background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--accent);
    border-radius:10px; padding:18px 22px 18px 58px; margin:0 0 12px; position:relative }
  .answer::before { counter-increment:a; content:counter(a);
    position:absolute; left:19px; top:18px; width:24px; height:24px; border-radius:6px;
    background:var(--accent); color:#0c0d10; font:800 13px/24px var(--mono); text-align:center }
  .answer b.h { display:block; font-size:16.5px; margin-bottom:6px; letter-spacing:-.01em }
  .answer p:last-child { margin:0 }
  .answer.blue { border-left-color:var(--accent2) } .answer.blue::before { background:var(--accent2) }
  .answer.red { border-left-color:var(--warn) } .answer.red::before { background:var(--warn) }
  .answer.green { border-left-color:var(--ok) } .answer.green::before { background:var(--ok) }

  .lede { background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--accent2);
    border-radius:10px; padding:18px 22px; margin:22px 0 }
  .lede p:last-child { margin:0 }
  .lede.gold { border-left-color:var(--gold) }
  .lede.green { border-left-color:var(--ok) }
  .lede.red { border-left-color:var(--warn) }
  .lede.orange { border-left-color:var(--accent) }

  .facts { display:grid; grid-template-columns:repeat(auto-fit,minmax(118px,1fr)); gap:10px; margin:24px 0 6px }
  .fact { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:13px 15px }
  .fact b { display:block; font-size:25px; font-variant-numeric:tabular-nums; letter-spacing:-.02em }
  .fact span { font-size:11px; color:var(--dim2); text-transform:uppercase; letter-spacing:.07em;
    line-height:1.35; display:block; margin-top:3px }
  .fact.good b { color:var(--ok) } .fact.bad b { color:var(--warn) } .fact.warn b { color:var(--accent) }

  table { width:100%; border-collapse:collapse; margin:14px 0; font-size:13.5px }
  th { text-align:left; font-size:10.5px; text-transform:uppercase; letter-spacing:.09em;
    color:var(--dim2); font-weight:600; padding:8px 10px; border-bottom:1px solid var(--line2);
    vertical-align:bottom }
  td { padding:9px 10px; border-bottom:1px solid #1e222a; vertical-align:top; color:var(--dim) }
  td b, td strong { color:var(--fg); font-weight:600 }
  tr:last-child td { border-bottom:0 }
  td.num { font-variant-numeric:tabular-nums; text-align:right; font-family:var(--mono); color:var(--fg) }
  td.c { text-align:center }
  tr.good td { background:#101b13 } tr.bad td { background:#1c1213 } tr.dim td { color:var(--dim2) }
  .yes { color:var(--ok); font-weight:700 } .no { color:var(--warn); font-weight:700 }
  .maybe { color:var(--gold); font-weight:700 }
  .scroll { overflow-x:auto; -webkit-overflow-scrolling:touch }

  pre { margin:0; font:12.5px/1.65 var(--mono); color:#c8cede; white-space:pre;
    overflow-x:auto; background:#08090b; border:1px solid #1d212a; border-radius:8px; padding:13px 15px }
  pre .k { color:#c98bdb } pre .f { color:#79b8ff } pre .s { color:#9ecbff }
  pre .c { color:#5c6370 } pre .t { color:#5ecf9a } pre .g { color:#3b414c }
  pre.term { background:#060709; border-color:#1a1e26 }
  pre.tight { padding:9px 11px; font-size:11.5px }

  .mock { margin:16px 0 0; background:#0a0b0e; border:1px dashed #333a47; border-radius:11px; padding:18px }
  .mock-label { font:700 10px/1 var(--mono); color:var(--accent); text-transform:uppercase;
    letter-spacing:.14em; margin-bottom:14px }
  .mock-note { margin:14px 0 0; font-size:12.5px; color:var(--dim2); line-height:1.55 }

  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:14px }
  .grid3 { display:grid; grid-template-columns:repeat(3,1fr); gap:12px }
  .grid2 > *, .grid3 > * { min-width:0 }
  @media (max-width:760px){ .grid2,.grid3 { grid-template-columns:1fr } }
  .card { background:var(--panel2); border:1px solid var(--line); border-radius:9px; padding:13px 15px }
  .card > b { display:block; font-size:12px; text-transform:uppercase; letter-spacing:.08em;
    color:var(--dim2); margin-bottom:6px }
  .card.ok > b { color:var(--ok) } .card.no > b { color:var(--warn) }
  .card.blue > b { color:var(--accent2) } .card.gold > b { color:var(--gold) }
  .card p { margin:0; font-size:13.5px; color:var(--dim) }
  .card p + p { margin-top:7px }
  .card p b { color:var(--fg) }

  .quote { border-left:2px solid var(--line2); padding:2px 0 2px 14px; margin:12px 0;
    color:var(--dim); font-style:italic }
  .quote cite { display:block; font-style:normal; font-size:12px; color:var(--dim2); margin-top:6px }

  figure { margin:16px 0 0 }
  figure img { width:100%; display:block; border-radius:9px; border:1px solid var(--line); background:#0a0b0e }
  figcaption { font-size:12.5px; color:var(--dim2); margin-top:9px; line-height:1.55 }
  figcaption > b:first-child { color:var(--fg); display:block; font-size:13px; margin-bottom:2px }
  figcaption b { color:var(--fg) }
  .shots { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:18px }
  .shots figure img { max-height:280px; object-fit:contain; object-position:left top; padding:6px }

  .hidden { display:none !important }
  .fb { display:flex; align-items:center; gap:7px; flex-wrap:wrap;
    border-top:1px solid #1e222a; margin-top:16px; padding-top:12px }
  .fb .lbl { font-size:10px; text-transform:uppercase; letter-spacing:.09em; color:var(--dim2);
    font-weight:700; margin-right:2px }
  .fb button { font:600 12px/1 inherit; font-family:inherit; cursor:pointer;
    background:#1a1e26; color:var(--dim); border:1px solid var(--line2); border-radius:7px; padding:6px 10px }
  .fb button:hover { color:var(--fg); border-color:#4e5768 }
  .fb button[aria-pressed="true"] { color:#0c0d10; font-weight:800 }
  .fb .yes[aria-pressed="true"] { background:var(--ok); border-color:var(--ok) }
  .fb .no[aria-pressed="true"]  { background:var(--warn); border-color:var(--warn) }
  .fb .star[aria-pressed="true"]{ background:var(--accent); border-color:var(--accent) }
  .fb .dyes[aria-pressed="true"]{ background:var(--accent2); border-color:var(--accent2) }
  .fb .dno[aria-pressed="true"] { background:#a2564f; border-color:#a2564f; color:#fff }
  .fb .sep { width:1px; align-self:stretch; background:var(--line); margin:0 4px }
  .fb .note-btn[aria-pressed="true"] { background:#2a2412; border-color:var(--gold); color:var(--gold) }
  .fb textarea { flex:1 1 100%; margin-top:8px; min-height:62px; resize:vertical;
    background:#08090b; color:var(--fg); border:1px solid var(--line2); border-radius:8px;
    padding:9px 11px; font:13px/1.55 var(--mono) }
  .fb textarea:focus { outline:none; border-color:var(--accent) }
  .fb textarea::placeholder { color:#4e5768 }

  .ask { background:var(--panel); border:1px solid var(--line); border-radius:11px;
    padding:18px 20px; margin:0 0 14px }
  .ask h3 { margin:0 0 6px; font-size:16.5px }
  .ask .dflt { font-size:13px; color:var(--dim); margin:10px 0 0;
    border-left:2px solid var(--gold); padding-left:11px }
  .ask .dflt b { color:var(--gold) }

  .dock { position:fixed; right:18px; bottom:18px; z-index:60; display:flex; gap:9px;
    align-items:center; background:rgba(21,23,28,.96); backdrop-filter:blur(8px);
    border:1px solid var(--line2); border-radius:12px; padding:10px 12px; box-shadow:0 12px 40px #000a }
  .dock .tally { font:600 12px var(--mono); color:var(--dim) }
  .dock .tally b { color:var(--fg) }
  .dock button { font:700 12.5px/1 inherit; font-family:inherit; cursor:pointer;
    border-radius:8px; padding:9px 13px; border:1px solid var(--line2); background:#232833; color:var(--fg) }
  .dock button.go { background:var(--accent); border-color:var(--accent); color:#0c0d10 }
  .dock button:disabled { opacity:.4; cursor:default }

  .sheet { position:fixed; inset:0; z-index:80; background:#07080acc; backdrop-filter:blur(4px);
    display:none; align-items:center; justify-content:center; padding:32px }
  .sheet.open { display:flex }
  .sheet .inner { background:var(--panel); border:1px solid var(--line2); border-radius:14px;
    width:min(860px,100%); max-height:100%; display:flex; flex-direction:column; overflow:hidden }
  .sheet header { padding:16px 20px 12px; border-bottom:1px solid var(--line);
    display:flex; align-items:center; gap:12px }
  .sheet header h3 { margin:0; font-size:16px }
  .sheet header .sp, .sheet footer .sp { margin-left:auto }
  .sheet textarea { flex:1; min-height:340px; margin:0; border:0; border-radius:0;
    background:#08090b; color:var(--fg); padding:16px 20px; font:12.5px/1.6 var(--mono); resize:none }
  .sheet textarea:focus { outline:none }
  .sheet footer { padding:12px 20px; border-top:1px solid var(--line); color:var(--dim2);
    font-size:12px; display:flex; align-items:center; gap:12px }
  .sheet button { font:700 12.5px/1 inherit; font-family:inherit; cursor:pointer;
    border-radius:8px; padding:9px 13px; border:1px solid var(--line2); background:#232833; color:var(--fg) }
  .sheet button.go { background:var(--ok); border-color:var(--ok); color:#0c0d10 }

  footer.page { margin-top:70px; padding-top:22px; border-top:1px solid var(--line);
    font-size:12.5px; color:var(--dim2); line-height:1.7 }
  footer.page b { color:var(--dim) }
"""


FB_JS = r"""
(function(){
  var dock = document.querySelector('.dock');
  var REPORT = dock.dataset.report || 'this report';
  var NOUN = dock.dataset.noun || 'item';
  var TOTAL = dock.dataset.total || '';
  var KEY = 'bbox-report-feedback:' + REPORT;
  var state = {};
  var overall = document.getElementById('fb-overall');
  function load(){ try { var raw = localStorage.getItem(KEY); if (!raw) return;
      var saved = JSON.parse(raw); state = saved.items || {};
      if (saved.overall) overall.value = saved.overall; } catch (e) {} }
  function save(){ try { localStorage.setItem(KEY, JSON.stringify({items: state, overall: overall.value})); }
    catch (e) {} }
  function slot(rank, title){ if (!state[rank]) state[rank] = {v:'', d:'', note:'', title:title};
    state[rank].title = title; return state[rank]; }
  Array.prototype.forEach.call(document.querySelectorAll('.fb'), function(strip){
    var rank = strip.dataset.rank, title = strip.dataset.title;
    var ta = strip.querySelector('textarea');
    function paint(){
      var st = state[rank] || {};
      Array.prototype.forEach.call(strip.querySelectorAll('button[data-fb]'), function(b){
        var k = b.dataset.fb;
        var on = (k === 'yes' || k === 'no' || k === 'star') ? st.v === k
               : (k === 'dyes' || k === 'dno') ? st.d === k
               : !ta.classList.contains('hidden') || !!(st.note || '').trim();
        b.setAttribute('aria-pressed', String(!!on));
      });
    }
    Array.prototype.forEach.call(strip.querySelectorAll('button[data-fb]'), function(b){
      b.addEventListener('click', function(){
        var k = b.dataset.fb, st = slot(rank, title);
        if (k === 'note'){ ta.classList.toggle('hidden');
          if (!ta.classList.contains('hidden')) ta.focus(); }
        else if (k === 'dyes' || k === 'dno'){ st.d = st.d === k ? '' : k; }
        else { st.v = st.v === k ? '' : k; }
        save(); paint(); tally();
      });
    });
    ta.addEventListener('input', function(){ slot(rank, title).note = ta.value; save(); tally(); });
    var st = state[rank];
    if (st){ ta.value = st.note || ''; if (ta.value.trim()) ta.classList.remove('hidden'); }
    paint();
  });
  overall.addEventListener('input', function(){ save(); tally(); });
  function marked(){ return Object.keys(state).filter(function(r){
      var s = state[r]; return s && (s.v || s.d || (s.note || '').trim()); }).sort(); }
  function tally(){
    var m = marked(), notes = m.filter(function(r){ return (state[r].note||'').trim(); }).length;
    var el = document.getElementById('fb-tally');
    var extra = overall.value.trim() ? ' + overall' : '';
    el.innerHTML = m.length ? '<b>' + m.length + '</b> marked &middot; <b>' + notes + '</b> noted' + extra
      : (extra ? 'overall note only' : 'nothing marked yet');
    document.getElementById('fb-copy').disabled = !m.length && !overall.value.trim();
  }
  var FACE = {yes:'\u{1F44D}', no:'\u{1F44E}', star:'★'};
  function markdown(){
    var m = marked(); var out = ['# Feedback — ' + REPORT, ''];
    if (overall.value.trim()){ out.push('## Overall', '', overall.value.trim(), ''); }
    if (m.length){ out.push('## Per ' + NOUN, '');
      m.forEach(function(r){ var s = state[r], tags = [];
        if (s.v) tags.push(FACE[s.v]);
        if (s.d === 'dyes') tags.push('drawing \u{1F44D}');
        if (s.d === 'dno')  tags.push('drawing \u{1F44E}');
        out.push('- ' + (tags.length ? '[' + tags.join(' ') + '] ' : '') + '**' + r + ' ' + s.title + '**');
        var n = (s.note || '').trim();
        if (n) n.split('\n').forEach(function(line){ out.push('  ' + line); });
      }); out.push(''); }
    out.push('<sub>written in the report; ' + m.length + (TOTAL ? ' of ' + TOTAL : '') + ' ' + NOUN + 's marked</sub>');
    return out.join('\n');
  }
  var sheet = document.getElementById('fb-sheet');
  var outTa = document.getElementById('fb-out');
  var status = document.getElementById('fb-status');
  function toClipboard(text){
    if (navigator.clipboard && window.isSecureContext){
      return navigator.clipboard.writeText(text).then(function(){ return true; }, function(){ return false; }); }
    try { outTa.select(); return Promise.resolve(document.execCommand('copy')); }
    catch (e) { return Promise.resolve(false); } }
  function openSheet(){
    outTa.value = markdown(); sheet.classList.add('open'); outTa.focus(); outTa.select();
    status.innerHTML = 'Selected &mdash; press &#8984;C / Ctrl-C, or use the button.';
    toClipboard(outTa.value).then(function(ok){
      if (ok) status.innerHTML = '&#10003; Copied to your clipboard &mdash; paste it straight back to Claude.'; }); }
  document.getElementById('fb-copy').addEventListener('click', openSheet);
  document.getElementById('fb-copy2').addEventListener('click', function(){
    toClipboard(outTa.value).then(function(ok){
      status.innerHTML = ok ? '&#10003; Copied.' : 'Clipboard refused &mdash; the text above is selected, press &#8984;C.'; }); });
  document.getElementById('fb-close').addEventListener('click', function(){ sheet.classList.remove('open'); });
  sheet.addEventListener('click', function(e){ if (e.target === sheet) sheet.classList.remove('open'); });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape') sheet.classList.remove('open');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'enter') openSheet(); });
  document.getElementById('fb-clear').addEventListener('click', function(){
    if (!confirm('Clear every mark and note in this report?')) return;
    state = {}; overall.value = '';
    Array.prototype.forEach.call(document.querySelectorAll('.fb'), function(strip){
      strip.querySelector('textarea').value = '';
      strip.querySelector('textarea').classList.add('hidden');
      Array.prototype.forEach.call(strip.querySelectorAll('button[data-fb]'), function(b){
        b.setAttribute('aria-pressed','false'); }); });
    save(); tally(); });
  load();
  Array.prototype.forEach.call(document.querySelectorAll('.fb'), function(strip){
    var st = state[strip.dataset.rank]; if (!st) return;
    var ta = strip.querySelector('textarea');
    ta.value = st.note || ''; if (ta.value.trim()) ta.classList.remove('hidden');
    Array.prototype.forEach.call(strip.querySelectorAll('button[data-fb]'), function(b){
      var k = b.dataset.fb;
      var on = (k==='yes'||k==='no'||k==='star') ? st.v===k
             : (k==='dyes'||k==='dno') ? st.d===k : !!(st.note||'').trim();
      b.setAttribute('aria-pressed', String(!!on)); }); });
  tally();
})();
"""


def fb(rank: str, title: str, placeholder: str = "your call…") -> str:
    """One feedback strip. The rank and exact title travel with the copied
    markdown, so Zach never has to hand-identify which item he means."""
    return f"""
<div class="fb" data-rank="{rank}" data-title="{title}">
  <span class="lbl">{rank}</span>
  <button class="yes" data-fb="yes" aria-pressed="false">&#128077;</button>
  <button class="no" data-fb="no" aria-pressed="false">&#128078;</button>
  <button class="star" data-fb="star" aria-pressed="false">&#9733; do this</button>
  <span class="sep"></span>
  <button class="dyes" data-fb="dyes" aria-pressed="false">drawing &#128077;</button>
  <button class="dno" data-fb="dno" aria-pressed="false">drawing &#128078;</button>
  <span class="sep"></span>
  <button class="note-btn" data-fb="note" aria-pressed="false">&#9998; note</button>
  <textarea class="hidden" spellcheck="false" placeholder="{placeholder}"></textarea>
</div>"""


def dock(report: str, noun: str, total: int) -> str:
    return f"""
<div class="dock" data-report="{report}" data-noun="{noun}" data-total="{total}">
  <span class="tally" id="fb-tally">nothing marked yet</span>
  <button id="fb-clear">Clear</button>
  <button class="go" id="fb-copy">Copy feedback</button>
</div>

<div class="sheet" id="fb-sheet">
  <div class="inner">
    <header><h3>Your feedback, as markdown</h3><span class="sp"></span>
      <button id="fb-close">Close</button></header>
    <textarea id="fb-out" spellcheck="false"></textarea>
    <footer><span id="fb-status">Selected &mdash; press &#8984;C / Ctrl-C, or use the button.</span>
      <span class="sp"></span><button class="go" id="fb-copy2">Copy to clipboard</button></footer>
  </div>
</div>"""


def overall_box(placeholder: str) -> str:
    return f"""
<div class="ask" style="border-color:#3a4250">
  <h3>Anything else</h3>
  <p style="color:var(--dim);font-size:14px;margin:0 0 10px">Goes at the top of the copied markdown.</p>
  <textarea id="fb-overall" spellcheck="false" placeholder="{placeholder}"
    style="width:100%;min-height:90px;background:#08090b;color:var(--fg);border:1px solid var(--line2);
           border-radius:8px;padding:10px 12px;font:13px/1.55 var(--mono);resize:vertical"></textarea>
</div>"""


def report_size(html: str, out: pathlib.Path) -> None:
    """Write, then measure against the desktop preview's real ceiling.

    The preview builds `data:text/html,<encodeURIComponent(page)>` and caps at
    2,097,024 bytes of THAT — measured encoded, never on disk, because
    encodeURIComponent inflates a base64-heavy page ~7-8% and a text-heavy one
    46-73%.
    """
    from urllib.parse import quote

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html)
    encoded = len(quote(html, safe="").encode())
    cap = 2_097_024
    print(f"wrote {out}  ({out.stat().st_size:,} bytes on disk)")
    print(f"encoded data: URL {encoded:,} / {cap:,} ({encoded / cap:.0%})"
          f"  -> {'OK, opens in preview' if encoded < cap else 'OVER CAP - browser-only'}")
