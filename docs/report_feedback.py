#!/usr/bin/env python3
"""
In-report feedback: mark it up here, copy markdown out.

Zach, 2026-09-18 (/rate bad): "whenever you are making a report on which you
expect me to give feedback please make it easy to write the feedback in the
report and copy paste it out." The failure it fixes is bookkeeping — without
this he has to tell me WHICH item he means, every time, by hand.

So: one click for a verdict, one click plus typing for a note, and the copied
markdown already carries each item's number and title. Import this from any
report builder rather than re-implementing it:

    import report_feedback as FB
    CSS  += FB.CSS
    page  = ... FB.UI ... FB.JS
    strip = FB.strip(rank, title, extra_axis="diagram")

Two things are deliberate and easy to get wrong:

* **localStorage may be unavailable.** These reports are usually opened through
  the desktop preview, which builds a `data:` URL — an opaque origin where
  storage throws. Every access is wrapped; the feature degrades to
  in-memory-only and still works.
* **The clipboard API is usually refused** on `file:`/`data:` origins too. The
  copy sheet fills and SELECTS a textarea first, then tries the API — so ⌘C
  always works even when the button cannot.
"""
from __future__ import annotations

import html
import re

CSS = """
  /* ---- in-report feedback ---------------------------------------------
     Zach, 2026-09-18: "make it easy to write the feedback in the report and
     copy paste it out" — so a verdict is one click, a note is one click plus
     typing, and the rank + exact title travel with it automatically. He should
     never have to say WHICH idea he means. */
  .fb { display:flex; align-items:center; gap:7px; flex-wrap:wrap;
    border-top:1px solid #1e222a; margin-top:10px; padding-top:9px }
  .fb .lbl { font-size:10px; text-transform:uppercase; letter-spacing:.09em; color:var(--dim2);
    font-weight:700; margin-right:2px }
  .fb button { font:600 12px/1 inherit; font-family:inherit; cursor:pointer;
    background:#1a1e26; color:var(--dim); border:1px solid var(--line2);
    border-radius:7px; padding:6px 10px }
  .fb button:hover { color:var(--fg); border-color:#4e5768 }
  .fb button[aria-pressed="true"] { color:#0c0d10; font-weight:800 }
  .fb .yes[aria-pressed="true"] { background:var(--ok); border-color:var(--ok) }
  .fb .no[aria-pressed="true"]  { background:var(--warn); border-color:var(--warn) }
  .fb .star[aria-pressed="true"]{ background:var(--accent); border-color:var(--accent) }
  .fb .dyes[aria-pressed="true"]{ background:var(--accent2); border-color:var(--accent2) }
  .fb .dno[aria-pressed="true"] { background:#a2564f; border-color:#a2564f; color:#fff }
  .fb .sep { width:1px; align-self:stretch; background:var(--line); margin:0 4px }
  .fb .note-btn[aria-pressed="true"] { background:#2a2412; border-color:var(--warn2,#e8c06a); color:#e8c06a }
  .fb textarea { flex:1 1 100%; margin-top:8px; min-height:62px; resize:vertical;
    background:#08090b; color:var(--fg); border:1px solid var(--line2); border-radius:8px;
    padding:9px 11px; font:13px/1.55 var(--mono) }
  .fb textarea:focus { outline:none; border-color:var(--accent) }
  .fb textarea::placeholder { color:#4e5768 }
  .row .fb { margin-top:8px }

  /* the dock */
  .dock { position:fixed; right:18px; bottom:18px; z-index:60; display:flex; gap:9px;
    align-items:center; background:rgba(21,23,28,.96); backdrop-filter:blur(8px);
    border:1px solid var(--line2); border-radius:12px; padding:10px 12px;
    box-shadow:0 12px 40px #000a }
  .dock .tally { font:600 12px var(--mono); color:var(--dim) }
  .dock .tally b { color:var(--fg) }
  .dock button { font:700 12.5px/1 inherit; font-family:inherit; cursor:pointer;
    border-radius:8px; padding:9px 13px; border:1px solid var(--line2);
    background:#232833; color:var(--fg) }
  .dock button.go { background:var(--accent); border-color:var(--accent); color:#0c0d10 }
  .dock button:disabled { opacity:.4; cursor:default }

  /* the copy sheet */
  .sheet { position:fixed; inset:0; z-index:80; background:#07080acc; backdrop-filter:blur(4px);
    display:none; align-items:center; justify-content:center; padding:32px }
  .sheet.open { display:flex }
  .sheet .inner { background:var(--panel); border:1px solid var(--line2); border-radius:14px;
    width:min(860px,100%); max-height:100%; display:flex; flex-direction:column; overflow:hidden }
  .sheet header { padding:16px 20px 12px; border-bottom:1px solid var(--line);
    display:flex; align-items:center; gap:12px }
  .sheet header h3 { margin:0; font-size:16px } .sheet header .sp { margin-left:auto }
  .sheet textarea { flex:1; min-height:340px; margin:0; border:0; border-radius:0;
    background:#08090b; color:var(--fg); padding:16px 20px;
    font:12.5px/1.6 var(--mono); resize:none }
  .sheet textarea:focus { outline:none }
  .sheet footer { padding:12px 20px; border-top:1px solid var(--line); color:var(--dim2);
    font-size:12px; display:flex; align-items:center; gap:12px }
  .sheet footer .sp { margin-left:auto }
  .sheet button { font:700 12.5px/1 inherit; font-family:inherit; cursor:pointer;
    border-radius:8px; padding:9px 13px; border:1px solid var(--line2);
    background:#232833; color:var(--fg) }
  .sheet button.go { background:var(--ok); border-color:var(--ok); color:#0c0d10 }

  .overall { background:var(--panel); border:1px solid var(--line);
    border-left:3px solid var(--accent); border-radius:12px; padding:16px 20px; margin:26px 0 0 }
  .overall h3 { margin:0 0 4px; font-size:15px }
  .overall p { margin:0 0 10px; color:var(--dim2); font-size:12.5px }
  .overall textarea { width:100%; min-height:90px; resize:vertical; background:#08090b;
    color:var(--fg); border:1px solid var(--line2); border-radius:8px; padding:10px 12px;
    font:13px/1.55 var(--mono) }
  .overall textarea:focus { outline:none; border-color:var(--accent) }
"""


def strip(rank: int, title: str, extra_axis: str = "", noun: str = "idea") -> str:
    """One verdict row per idea. `data-rank`/`data-title` are what remove the
    bookkeeping: the copied markdown names the idea, so Zach never has to."""
    dia = ""
    if extra_axis:
        dia = (f'<span class="sep"></span><span class="lbl">{extra_axis}</span>'
               f'<button class="dyes" data-fb="dyes" aria-pressed="false" title="the {extra_axis} works">&#128077;</button>'
               f'<button class="dno" data-fb="dno" aria-pressed="false" title="the {extra_axis} misses it">&#128078;</button>')
    # the title travels into the copied markdown, so it has to be PLAIN text:
    # strip tags, then unescape entities, then escape once for the attribute.
    plain = html.unescape(re.sub(r"<[^>]+>", "", title)).strip()
    return (f'<div class="fb" data-rank="{rank}" data-title="{html.escape(plain, quote=True)}">'
            f'<span class="lbl">{noun}</span>'
            f'<button class="yes"  data-fb="yes"  aria-pressed="false" title="yes, do this">&#128077;</button>'
            f'<button class="no"   data-fb="no"   aria-pressed="false" title="no">&#128078;</button>'
            f'<button class="star" data-fb="star" aria-pressed="false" title="favourite">&#9733;</button>'
            f'{dia}'
            f'<span class="sep"></span>'
            f'<button class="note-btn" data-fb="note" aria-pressed="false">&#9998; note</button>'
            f'<textarea class="hidden" placeholder="markdown — it is copied out under this idea\'s number and title"></textarea>'
            f'</div>')


def ui(report: str, noun: str = "idea", total: int | None = None) -> str:
    """The dock carries the report's own name and item count so the copied
    markdown says which report it is about — the module must not hardcode one."""
    return UI_TMPL.replace("{{REPORT}}", html.escape(report)) \
                  .replace("{{NOUN}}", html.escape(noun)) \
                  .replace("{{TOTAL}}", str(total) if total else "")


UI_TMPL = """
<div class="overall">
  <h3>Overall &mdash; anything that is not about one {{NOUN}}</h3>
  <p>The shape of it, what is missing, the format itself. This lands at the top of the copied markdown.</p>
  <textarea id="fb-overall" placeholder="markdown"></textarea>
</div>

<div class="dock" data-report="{{REPORT}}" data-noun="{{NOUN}}" data-total="{{TOTAL}}">
  <span class="tally" id="fb-tally">nothing marked yet</span>
  <button id="fb-clear">Clear</button>
  <button class="go" id="fb-copy">Copy feedback</button>
</div>

<div class="sheet" id="fb-sheet">
  <div class="inner">
    <header>
      <h3>Your feedback, as markdown</h3>
      <span class="sp"></span>
      <button id="fb-close">Close</button>
    </header>
    <textarea id="fb-out" spellcheck="false"></textarea>
    <footer>
      <span id="fb-status">Selected &mdash; press &#8984;C / Ctrl-C, or use the button.</span>
      <span class="sp"></span>
      <button class="go" id="fb-copy2">Copy to clipboard</button>
    </footer>
  </div>
</div>
"""


JS = r"""
<script>
(function(){
  var dock = document.querySelector('.dock');
  var REPORT = dock.dataset.report || 'this report';
  var NOUN = dock.dataset.noun || 'idea';
  var TOTAL = dock.dataset.total || '';
  var KEY = 'bbox-report-feedback:' + REPORT;
  var state = {};                       // rank -> {v:'yes'|'no'|'star', d:'dyes'|'dno', note:'', title:''}
  var overall = document.getElementById('fb-overall');

  function load(){                      // localStorage is unavailable on a data: URL — never assume it
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      state = saved.items || {};
      if (saved.overall) overall.value = saved.overall;
    } catch (e) { /* opaque origin, private window, disabled storage — all fine */ }
  }
  function save(){
    try { localStorage.setItem(KEY, JSON.stringify({items: state, overall: overall.value})); }
    catch (e) {}
  }
  function slot(rank, title){
    if (!state[rank]) state[rank] = {v:'', d:'', note:'', title:title};
    state[rank].title = title;
    return state[rank];
  }

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
        if (k === 'note'){
          ta.classList.toggle('hidden');
          if (!ta.classList.contains('hidden')) ta.focus();
        } else if (k === 'dyes' || k === 'dno'){
          st.d = st.d === k ? '' : k;
        } else {
          st.v = st.v === k ? '' : k;
        }
        save(); paint(); tally();
      });
    });
    ta.addEventListener('input', function(){ slot(rank, title).note = ta.value; save(); tally(); });
    // restore
    var st = state[rank];
    if (st){ ta.value = st.note || ''; if (ta.value.trim()) ta.classList.remove('hidden'); }
    paint();
  });
  overall.addEventListener('input', function(){ save(); tally(); });

  function marked(){
    return Object.keys(state).map(Number).filter(function(r){
      var s = state[r]; return s && (s.v || s.d || (s.note || '').trim());
    }).sort(function(a,b){ return a-b; });
  }
  function tally(){
    var m = marked(), notes = m.filter(function(r){ return (state[r].note||'').trim(); }).length;
    var el = document.getElementById('fb-tally');
    var extra = overall.value.trim() ? ' + overall' : '';
    el.innerHTML = m.length
      ? '<b>' + m.length + '</b> marked &middot; <b>' + notes + '</b> noted' + extra
      : (extra ? 'overall note only' : 'nothing marked yet');
    document.getElementById('fb-copy').disabled = !m.length && !overall.value.trim();
  }

  var FACE = {yes:'\u{1F44D}', no:'\u{1F44E}', star:'\u2605'};
  function markdown(){
    var m = marked();
    var out = ['# Feedback \u2014 ' + REPORT, ''];
    if (overall.value.trim()){
      out.push('## Overall', '', overall.value.trim(), '');
    }
    if (m.length){
      out.push('## Per ' + NOUN, '');
      m.forEach(function(r){
        var s = state[r], tags = [];
        if (s.v) tags.push(FACE[s.v]);
        if (s.d === 'dyes') tags.push('diagram \u{1F44D}');
        if (s.d === 'dno')  tags.push('diagram \u{1F44E}');
        out.push('- ' + (tags.length ? '[' + tags.join(' ') + '] ' : '') + '**#' + r + ' ' + s.title + '**');
        var n = (s.note || '').trim();
        if (n) n.split('\n').forEach(function(line){ out.push('  ' + line); });
      });
      out.push('');
    }
    out.push('<sub>written in the report; ' + m.length + (TOTAL ? ' of ' + TOTAL : '') + ' ' + NOUN + 's marked</sub>');
    return out.join('\n');
  }

  var sheet = document.getElementById('fb-sheet');
  var outTa = document.getElementById('fb-out');
  var status = document.getElementById('fb-status');

  function toClipboard(text){
    // Layered on purpose: this page is usually opened as a file:// or data: URL,
    // where navigator.clipboard is frequently refused. The textarea is the
    // guarantee — it is filled and selected before any of this is attempted.
    if (navigator.clipboard && window.isSecureContext){
      return navigator.clipboard.writeText(text).then(function(){ return true; },
                                                      function(){ return false; });
    }
    try { outTa.select(); return Promise.resolve(document.execCommand('copy')); }
    catch (e) { return Promise.resolve(false); }
  }
  function openSheet(){
    outTa.value = markdown();
    sheet.classList.add('open');
    outTa.focus(); outTa.select();
    status.innerHTML = 'Selected &mdash; press &#8984;C / Ctrl-C, or use the button.';
    toClipboard(outTa.value).then(function(ok){
      if (ok) status.innerHTML = '&#10003; Copied to your clipboard &mdash; paste it straight back to Claude.';
    });
  }
  document.getElementById('fb-copy').addEventListener('click', openSheet);
  document.getElementById('fb-copy2').addEventListener('click', function(){
    toClipboard(outTa.value).then(function(ok){
      status.innerHTML = ok ? '&#10003; Copied.' : 'Clipboard refused &mdash; the text above is selected, press &#8984;C.';
    });
  });
  document.getElementById('fb-close').addEventListener('click', function(){ sheet.classList.remove('open'); });
  sheet.addEventListener('click', function(e){ if (e.target === sheet) sheet.classList.remove('open'); });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape') sheet.classList.remove('open');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'enter') openSheet();
  });
  document.getElementById('fb-clear').addEventListener('click', function(){
    if (!confirm('Clear every mark and note in this report?')) return;
    state = {}; overall.value = '';
    Array.prototype.forEach.call(document.querySelectorAll('.fb'), function(strip){
      strip.querySelector('textarea').value = '';
      strip.querySelector('textarea').classList.add('hidden');
      Array.prototype.forEach.call(strip.querySelectorAll('button[data-fb]'), function(b){
        b.setAttribute('aria-pressed','false'); });
    });
    save(); tally();
  });

  load();
  // re-apply anything restored from storage
  Array.prototype.forEach.call(document.querySelectorAll('.fb'), function(strip){
    var st = state[strip.dataset.rank]; if (!st) return;
    var ta = strip.querySelector('textarea');
    ta.value = st.note || ''; if (ta.value.trim()) ta.classList.remove('hidden');
    Array.prototype.forEach.call(strip.querySelectorAll('button[data-fb]'), function(b){
      var k = b.dataset.fb;
      var on = (k==='yes'||k==='no'||k==='star') ? st.v===k
             : (k==='dyes'||k==='dno') ? st.d===k : !!(st.note||'').trim();
      b.setAttribute('aria-pressed', String(!!on));
    });
  });
  tally();
})();
</script>"""
