#!/usr/bin/env python3
"""Build the floating-toolbars round's review report.

Self-contained HTML: every capture is inlined as a data URI so the page opens
offline and survives being moved. Writes to the MAIN checkout's
`reports/media/` (the gitignored half, because this page inlines ~600 KB of
PNG) so a peer session's `git stash -u` cannot take it — ignored files are
skipped by both `stash -u` and `clean -fd`.

It is also an INPUT surface: every item carries verdict buttons and a note
box, and the Copy button emits markdown naming each item by its number and
title, so Zach never has to hand-identify which item he is talking about.
"""
from __future__ import annotations

import base64
import json
import pathlib

MEDIA = pathlib.Path("/home/bam/bbox-ui/reports/media/toolbars-2026-09-20")
OUT = pathlib.Path("/home/bam/bbox-ui/reports/media/toolbars-2026-09-20.html")


def uri(name: str) -> str:
    path = MEDIA / name
    if not path.exists():
        return ""
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode()


ITEMS = [
    {
        "n": 1,
        "title": "For and while loops draw no line inside the frame",
        "ask": "“FOr loop and while loops like this no inside lines” — shown against an empty For Loop, then “Branch like this..” against a Branch that keeps its rules.",
        "shots": ["06-region-v9-for-vs-branch.png"],
        "body": """<p><code>region-header-rule</code> — the full-width line continuing the corner card’s bottom edge — was drawn for <em>every</em> region and hidden only by a CSS token. <strong>v2, v9 and v10 set that token to <code>block</code></strong>, so under the three variants you actually care about, a <code>for</code>/<code>while</code> region (which has no arms at all) drew a line across an empty body: a divider dividing nothing.</p>
<p>Now gated on <code>kind !== "loop" &amp;&amp; arms.length &gt; 0</code>. Both halves matter. The arms half is the honest test — the rule separates the header band from the arm rows. The kind half is the belt, and the case is <em>real</em>: the variant suite’s own helper mints every kind with one <code>body</code> arm, so an arms-only gate would have kept painting the rule on exactly these regions.</p>
<p class="measured">Measured in the running app, not asserted from the DOM tree:<br>
<code>branch → header rule "block", 2 arm headers</code><br>
<code>loop → header rule "none", 0 arm headers</code></p>
<p class="note">CSS could not have done this: the display is an <em>inline</em> style, so scoping the token off the already-stamped <code>[data-region-kind]</code> would be outranked no matter how specific the selector.</p>""",
    },
    {
        "n": 2,
        "title": "The selection pill: Arrange, opacity, Focus",
        "ask": "“1. floating tool bars that provide useful fucntions on the components” — against the old pill captioned “Current : BAD” (duplicate + delete, nothing else).",
        "shots": ["03b-pill-closeup.png", "04b-arrange-panel-closeup.png"],
        "body": """<p>Arrange collapses ten actions behind one face, the way the archived SystemSketch’s did — your own rule from 2026-09-08: <em>“instead of being visible on the floating toolbar I want them hidden behind a icon”</em>.</p>
<p><strong>What appears depends on how many shapes are selected</strong>, and the thresholds are the donor’s: z-order at 1+, align at 2+, distribute at 3+. Aligning needs something to align <em>to</em>, and with two shapes the ends are already the ends — so distribute would be a no-op that looks like a bug. Controls that cannot act are omitted rather than greyed.</p>
<p class="measured">Align-left, driven in the real browser: three blocks at x <code>[240, 620, 1000]</code> → <code>[240, 240, 240]</code>.</p>
<p>Opacity sits <em>in</em> the row rather than behind a trigger, because it is one value rather than a family and its current state is what you need to see while dragging it. Focus is <code>zoomToSelection</code>.</p>""",
    },
    {
        "n": 3,
        "title": "The tldraw style bar",
        "ask": "“2. FLoating toolbar over the tldraw primatives for styling”",
        "shots": ["01b-style-bar-closeup.png", "02b-colour-panel-closeup.png"],
        "body": """<p>Colour · fill · dash · size · font · align, shown for a selection made entirely of tldraw’s own shapes and never for one of ours.</p>
<p><strong>Which rows appear is <code>editor.getSharedStyles()</code>’ answer, never a switch on shape type.</strong> Select an arrow and the set changes, because an arrow shares different styles. That is not a stylistic choice — my first acceptance test asserted “an arrow has no fill” and was simply <em>wrong</em> for tldraw v5. The test now compares against the editor, so the oracle is tldraw rather than a second copy of my guess.</p>
<p>The colour swatch is read from <code>editor.getTheme("default")</code> at call time, never a hex table — tldraw ships a different hex per colour in dark mode, so a hardcoded swatch would be visibly wrong for half your sessions.</p>
<p class="caught">Caught by looking at the running app: with each trigger painting its raw value the bar read <code>None&nbsp;&nbsp;Draw&nbsp;&nbsp;M&nbsp;&nbsp;Draw&nbsp;&nbsp;Middle</code> — <em>“Draw” twice</em>, because <code>dash:"draw"</code> and <code>font:"draw"</code> are unrelated values sharing a name. Faces now name their family; the value moved to the tooltip.</p>""",
    },
    {
        "n": 4,
        "title": "Zoom menu, status strip, and the dock’s +",
        "ask": "“adding controls to when I click the zoom icon” · “adding a plus logo to the end of the tool bar”",
        "shots": ["08-status-strip.png", "09-tool-dock.png"],
        "body": """<p>The zoom % was a deliberately inert readout — the code carried a comment arguing a zoom menu should not be mounted. You overruled that, so the comment was rewritten to say who reversed it and why, rather than quietly deleted.</p>
<p>The strip is now grid · frames · warnings · zoom · <code>&lt;/&gt;</code> · <code>?</code>, and the dock has its trailing <code>+</code>.</p>
<p class="note">While wiring the zoom control I picked up <code>showZoomButtons</code> — a setting that was already persisted, already had a row in Settings ▸ Appearance, and was <strong>read by nothing</strong>. It is now live: turn it on and the readout is flanked by −/+.</p>""",
    },
]

DECISIONS = [
    ("Z1", "Region drawing: should v9 become v8?", "Default on silence: leave as v9 so v8 stays comparable. Promoting is one token."),
    ("Z4", "Which <code>?board=</code> implementation wins?", "<strong>Settled on this branch, and the reason is sharper than the work order’s.</strong> Both compute the same persistence key, but booting both opens the board TWICE — the files session resolves it through the host while <code>openBoardFromBoot</code> independently fetches and swaps the store, and that second swap calls <code>clearHistory</code>. A silent race that costs you your undo stack. Kept the files-host side; <code>review/boardParam.ts</code> stays in the tree with passing tests and no production caller. Deleting it is your call."),
    ("N1", "Four of the five settings models are still inert", "<code>appearancePreferences</code> is now live (above) and <code>toolAliases</code> went live this morning. <code>gestureSettings</code>, <code>interfaceScale</code> and <code>edgePolicy</code> still drive nothing. <strong>Do not wire edgePolicy without deciding first</strong> — <code>wireGesture.ts:227</code> hard-codes <code>{allowFanIn: true}</code> and cites you saying everything should connect by default, so the 9-switch Connections category contradicts a decision you already made."),
    ("N2", "The stack is not merge-ready and this branch inherits that", "<code>chrome-files-settings</code> failed its round-2 Codex judge: 4 of 9 findings fixed, 5 still PARTIAL, with five reproduced P1 data-loss paths around Save As / native Open / the compare-write race. Everything here descends from it."),
]

KNOWN = [
    ("draft.smoke × 7", "The drafts chip never appears — <code>draftSession.tsx</code> is absent and <code>chromeBar.tsx</code> has no <code>draftChip</code>. <strong>The draft-compare chrome half was never committed.</strong> A real missing feature, not a flake. It was earlier believed to be deliberately-red acceptance; that turned out to be wrong."),
    ("menus.smoke × 1", "The burger’s Export submenu: <em>“element is not stable … detached from the DOM”</em>. Reproduces in isolation, so it is not a cross-test flake, and it predates this round entirely."),
    ("Not built, not faked", "<strong>Wrap</strong> and <strong>Tidy</strong> are in the donor’s pill and not in this one. Wrap needs <code>wrapSelectionInto</code> ported; Tidy needs the trunk’s already-built <code>tidyTraces</code> bound to the app’s wire layer. Both are real lanes, not a row to add."),
]


def item_html(item: dict) -> str:
    shots = "".join(
        f'<figure><img alt="{item["title"]}" src="{uri(s)}"><figcaption>{s}</figcaption></figure>'
        for s in item["shots"] if uri(s)
    )
    return f"""
<section class="item" data-n="{item['n']}" data-title="{item['title']}">
  <h3><span class="num">{item['n']}</span> {item['title']}</h3>
  <blockquote class="ask">{item['ask']}</blockquote>
  <div class="shots">{shots}</div>
  <div class="body">{item['body']}</div>
  <div class="verdict">
    <button data-v="good">Good</button>
    <button data-v="tweak">Needs a tweak</button>
    <button data-v="bad">Wrong</button>
    <textarea rows="2" placeholder="Notes on item {item['n']} — optional"></textarea>
  </div>
</section>"""


HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Floating toolbars</title>
<style>
  :root {{
    --bg:#fbfbfd; --fg:#16161a; --muted:#6b6b76; --line:#e4e4ea; --card:#fff;
    --accent:#2f5bd8; --good:#137a4b; --bad:#b3261e; --warn:#8a5a00;
  }}
  @media (prefers-color-scheme: dark) {{
    :root:not([data-theme="light"]) {{
      --bg:#0f1013; --fg:#ececf0; --muted:#9a9aa6; --line:#26262e; --card:#16171b;
      --accent:#7d9bff; --good:#4ac585; --bad:#ff8a80; --warn:#e0b050;
    }}
  }}
  :root[data-theme="dark"] {{
    --bg:#0f1013; --fg:#ececf0; --muted:#9a9aa6; --line:#26262e; --card:#16171b;
    --accent:#7d9bff; --good:#4ac585; --bad:#ff8a80; --warn:#e0b050;
  }}
  *{{box-sizing:border-box}}
  body{{margin:0;background:var(--bg);color:var(--fg);
    font:16px/1.65 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif;}}
  .wrap{{max-width:940px;margin:0 auto;padding:48px 16px 96px}}
  h1{{font-size:30px;line-height:1.2;margin:0 0 6px;letter-spacing:-.02em}}
  .sub{{color:var(--muted);margin:0 0 30px}}
  h2{{font-size:13px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);
     margin:44px 0 14px;font-weight:650}}
  .item{{background:var(--card);border:1px solid var(--line);border-radius:14px;
        padding:22px;margin:0 0 20px}}
  .item h3{{margin:0 0 10px;font-size:20px;letter-spacing:-.01em;display:flex;gap:10px;align-items:baseline}}
  .num{{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:26px;
       border-radius:7px;background:var(--accent);color:#fff;font-size:13px;font-weight:700;flex:none}}
  .ask{{margin:0 0 16px;padding:9px 14px;border-left:3px solid var(--accent);
       background:color-mix(in srgb,var(--accent) 7%,transparent);
       color:var(--fg);font-size:14.5px;border-radius:0 7px 7px 0}}
  figure{{margin:0 0 12px}}
  img{{max-width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:9px;background:#fff}}
  figcaption{{font-size:11.5px;color:var(--muted);margin-top:5px;font-family:ui-monospace,monospace}}
  .body p{{margin:0 0 11px;font-size:15px}}
  code{{font-family:ui-monospace,SFMono-Regular,monospace;font-size:.88em;
       background:color-mix(in srgb,var(--fg) 7%,transparent);padding:1.5px 5px;border-radius:4px}}
  .measured{{border-left:3px solid var(--good);padding:8px 13px;
            background:color-mix(in srgb,var(--good) 9%,transparent);border-radius:0 7px 7px 0}}
  .caught{{border-left:3px solid var(--warn);padding:8px 13px;
          background:color-mix(in srgb,var(--warn) 10%,transparent);border-radius:0 7px 7px 0}}
  .note{{color:var(--muted);font-size:14px}}
  .verdict{{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:16px;
           padding-top:14px;border-top:1px dashed var(--line)}}
  .verdict button{{font:inherit;font-size:13px;padding:6px 13px;border-radius:8px;
    border:1px solid var(--line);background:transparent;color:var(--fg);cursor:pointer}}
  .verdict button:hover{{border-color:var(--accent)}}
  .verdict button[aria-pressed="true"]{{background:var(--accent);color:#fff;border-color:var(--accent)}}
  .verdict textarea{{flex:1 1 240px;min-width:200px;font:inherit;font-size:13px;padding:6px 9px;
    border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--fg);resize:vertical}}
  table{{width:100%;border-collapse:collapse;font-size:14.5px}}
  td,th{{text-align:left;vertical-align:top;padding:10px 12px;border-bottom:1px solid var(--line)}}
  th{{font-size:11.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}}
  td:first-child{{white-space:nowrap;font-weight:650;width:1%}}
  .bar{{position:sticky;bottom:0;background:color-mix(in srgb,var(--bg) 92%,transparent);
    backdrop-filter:blur(8px);border-top:1px solid var(--line);padding:12px 16px;margin-top:40px}}
  .bar .inner{{max-width:940px;margin:0 auto;display:flex;gap:10px;align-items:center;flex-wrap:wrap}}
  .bar button{{font:inherit;font-size:14px;font-weight:600;padding:9px 18px;border-radius:9px;
    border:0;background:var(--accent);color:#fff;cursor:pointer}}
  .bar span{{color:var(--muted);font-size:13px}}
  #out{{width:100%;margin-top:11px;font-family:ui-monospace,monospace;font-size:12px;
    padding:10px;border-radius:9px;border:1px solid var(--line);background:var(--card);
    color:var(--fg);display:none}}
  #out.show{{display:block}}
</style></head>
<body><div class="wrap">
<h1>Floating toolbars, and the loop that drew a line across nothing</h1>
<p class="sub">bbox-ui · <code>claude/floating-toolbars-2026-09-20</code> · 20 Sep 2026 · every capture below is the real app at 127.0.0.1:4390, zero page errors</p>

<h2>What you asked for</h2>
{"".join(item_html(i) for i in ITEMS)}

<h2>Needs you</h2>
<table><thead><tr><th></th><th>Question</th></tr></thead><tbody>
{"".join(f"<tr><td>{k}</td><td><strong>{q}</strong><br><span class='note'>{a}</span></td></tr>" for k, q, a in DECISIONS)}
</tbody></table>

<h2>Red, and why — none of it from this round</h2>
<table><tbody>
{"".join(f"<tr><td>{k}</td><td>{v}</td></tr>" for k, v in KNOWN)}
</tbody></table>

<h2>Gates</h2>
<table><tbody>
<tr><td>app unit</td><td>137 / 137</td></tr>
<tr><td>selection pill</td><td>10 / 10 · mutation-tested red both ways</td></tr>
<tr><td>arrangeActions</td><td>14 / 14</td></tr>
<tr><td>region variants</td><td>11 / 11 · mutation-tested red on v2, v9, v10</td></tr>
<tr><td>trunk region</td><td>47 / 47 unit · 20 / 20 variant stories</td></tr>
<tr><td>tsc</td><td>exit 0</td></tr>
<tr><td>app smoke</td><td>107 / 115 — the 8 reds are the 8 that were already red before this round</td></tr>
</tbody></table>
</div>

<div class="bar"><div class="inner">
  <button id="copy">Copy my verdicts</button>
  <span>Pick a verdict on any item, then copy — the text names each item by number and title.</span>
  <textarea id="out" rows="9" readonly></textarea>
</div></div>

<script>
// localStorage refuses on file:// in some browsers, so every access is wrapped
// and the page renders correctly without it.
function store(k, v) {{ try {{ localStorage.setItem(k, v); }} catch {{}} }}
function load(k) {{ try {{ return localStorage.getItem(k); }} catch {{ return null; }} }}

document.querySelectorAll(".item").forEach(function (item) {{
  var n = item.dataset.n;
  var saved = load("toolbars-v-" + n);
  var note = load("toolbars-n-" + n);
  var box = item.querySelector("textarea");
  if (note) box.value = note;
  item.querySelectorAll(".verdict button").forEach(function (b) {{
    if (saved === b.dataset.v) b.setAttribute("aria-pressed", "true");
    b.addEventListener("click", function () {{
      item.querySelectorAll(".verdict button").forEach(function (o) {{ o.removeAttribute("aria-pressed"); }});
      b.setAttribute("aria-pressed", "true");
      store("toolbars-v-" + n, b.dataset.v);
    }});
  }});
  box.addEventListener("input", function () {{ store("toolbars-n-" + n, box.value); }});
}});

var LABEL = {{ good: "Good", tweak: "Needs a tweak", bad: "Wrong" }};
document.getElementById("copy").addEventListener("click", function () {{
  var lines = ["# Floating toolbars — verdicts", ""];
  document.querySelectorAll(".item").forEach(function (item) {{
    var picked = item.querySelector('.verdict button[aria-pressed="true"]');
    var note = item.querySelector("textarea").value.trim();
    if (!picked && !note) return;
    lines.push("**" + item.dataset.n + ". " + item.dataset.title + "** — " +
               (picked ? LABEL[picked.dataset.v] : "(no verdict)"));
    if (note) lines.push("  " + note);
    lines.push("");
  }});
  if (lines.length === 2) lines.push("_(nothing marked yet)_");
  var out = document.getElementById("out");
  out.value = lines.join("\\n");
  out.classList.add("show");
  // Always end in a pre-selected textarea: clipboard writes are refused on
  // file:// and data:, so selection is the reliable path, not the fallback.
  out.focus(); out.select();
  // `.catch`, NOT try/catch: writeText returns a PROMISE, so a synchronous
  // catch cannot see its rejection and every copy on file:// threw an
  // unhandled "Write permission denied" (measured). The selection above is
  // the real delivery path; the clipboard is the bonus.
  try {{ navigator.clipboard.writeText(out.value).catch(function () {{}}); }} catch {{}}
}});
</script>
</body></html>
"""

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(HTML, encoding="utf-8")
size = OUT.stat().st_size
print(f"wrote {OUT} ({size:,} bytes)")

# The preview's real ceiling is the ENCODED data: URL it builds, measured at
# 2,097,024 bytes. Base64-heavy pages inflate ~7-8% under encodeURIComponent.
from urllib.parse import quote
encoded = len(quote(HTML, safe=""))
print(f"encoded data: URL length {encoded:,} / 2,097,024 "
      f"({'OK' if encoded < 2_097_024 else 'OVER CAP - browser only'})")
