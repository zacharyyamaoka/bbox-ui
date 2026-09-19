#!/usr/bin/env python3
"""
Build the menu-port review report.

Zach, 2026-09-18: "Please go through system sketch, and port over all the menus
we have implemented there to the editor-component kit in bbox-ui… start an
ultracode workflow… use a fable agent to look at the menus and make a proposal
for how they should be designed in a component modular way… find reference
libraries that provide off the shelf menu components and how they structure
them."

This page is the review surface for that work: the nine surfaces as he pasted
them, what the twelve survey/research agents found, the architecture call Fable
made, the stock-part mapping table he asks for by name, and the open decisions
he actually has to answer — each with its own verdict buttons so he never has
to hand-identify which item he is talking about.

It inlines nine PNG captures (~644 KB on disk, ~860 KB as data URIs), so it
belongs in the repo's GITIGNORED reports/media/ half, not the tracked reports/
half. See ~/.claude/CLAUDE.md on the split.

    python3 docs/build_menu_kit_report.py
"""
from __future__ import annotations

import base64
import html
import json
import pathlib
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
WORKTREE = HERE.parent
REPO = pathlib.Path("/home/bam/bbox-ui")
OUT = REPO / "reports/media/menu-kit-2026-09-18.html"

DATA = json.loads((HERE / "menus/data/survey-design.json").read_text())
SURVEYS = DATA["surveys"]
REFS = DATA["refs"]
DESIGN = DATA["design"]

BUILD_PATH = HERE / "menus/data/build.json"
BUILD = json.loads(BUILD_PATH.read_text()) if BUILD_PATH.exists() else None

SHOTS_DIR = HERE / "menus/screenshots"

# ---------------------------------------------------------------------------
# The nine surfaces, in the order Zach listed them. `shot` is the staged file;
# `survey` indexes into SURVEYS so each card can carry its own real counts
# rather than a number typed by hand.
# ---------------------------------------------------------------------------
SURFACES = [
    dict(n=0, shot="01-floating-toolbar-fill-popover.png", survey=1,
         title="The floating toolbar, and its popouts",
         zach="“We did a lot of work here to try to make it modular and composable”",
         blurb="A segmented pill over the selection, with a popover floating above it: a fill-mode row "
               "(Solid · Hatched · Transparent · No fill) over a 2×11 swatch grid ending in a rainbow "
               "custom-colour well. This is the surface the whole registry architecture exists to serve."),
    dict(n=0, shot="02-rich-text-toolbar.png", survey=1,
         title="…the same pill, aimed at text",
         zach="",
         blurb="Aa ▾ · Large 36 ▾ · B · A ▾ · align ▾. Same renderer, different recipe — which is the "
               "entire point of the architecture and the reason it is worth porting rather than rebuilding."),
    dict(n=0, shot="03-font-size-popover.png", survey=1,
         title="…and a list-layout popout",
         zach="",
         blurb="Small 18 / Medium 24 / Large 36 (checked) / Extra large 44. The <code>list</code> layout, "
               "chosen by the control's registry entry — not by a conditional in the renderer."),
    dict(n=1, shot="04-bottom-tool-toolbar.png", survey=2,
         title="The tool bar at the bottom",
         zach="",
         blurb="Select · frame · two block families · shape · draw · text · +. The chevron-under-icon cells "
               "are split buttons over a family with a remembered last-used member."),
    dict(n=2, shot="05-chrome-bar.png", survey=3,
         title="The top-left toolbar",
         zach="“Its components are: bread crumb, draft selector, forward and backwards buttons, burger file settings”",
         blurb="Burger · back/forward · home + breadcrumb with a live status dot · a branch chip · a count."),
    dict(n=3, shot="06-frames-panel.png", survey=4,
         title="The frames panel",
         zach="",
         blurb="A right-panel shell wrapping reorderable rows: drag grip, live board thumbnail, kind caption, "
               "title. Plus a save-this-camera-view row. The shell is the component; the frames are one instance."),
    dict(n=4, shot="07-problems-panel.png", survey=5,
         title="The problems panel",
         zach="",
         blurb="VS Code's Problems panel, over board diagnostics: severity counts, an All/Errors/Warnings "
               "filter, grouped rows carrying a rule code and a reveal-on-canvas button."),
    dict(n=5, shot="08-compare-changes.png", survey=6,
         title="The compare changes panel",
         zach="“for just changes, for use in git merging/rebasing”",
         blurb="A history rail that picks BEFORE, two version panes, a Properties/Code rail with Figma-style "
               "word-level diffing, and a side-by-side/overlay toggle. The single largest surface: 36 parts."),
    dict(n=6, shot="09-draft-title-bar.png", survey=7,
         title="The draft view title bar",
         zach="",
         blurb="Exit · draft name · ⋯ on the left; “Compare 0 Changes” and a split “Merge ▾” on the right, "
               "disabled until there is something to merge."),
]


def b64(path: pathlib.Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


def e(s) -> str:
    return html.escape(str(s if s is not None else ""))


def git_sha() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=WORKTREE,
                              capture_output=True, text=True, check=True).stdout.strip()
    except Exception:
        return "unknown"


# ---------------------------------------------------------------------------
# Totals — computed from the real data, never typed
# ---------------------------------------------------------------------------
TOT_FILES = sum(len(s["files"]) for s in SURVEYS)
TOT_PARTS = sum(len(s["anatomy"]) for s in SURVEYS)
TOT_COUPLINGS = sum(len(s["engineCoupling"]) for s in SURVEYS)
TOT_BLOCKERS = sum(1 for s in SURVEYS for c in s["engineCoupling"] if c["severity"] == "blocker")
TOT_CITATIONS = sum(len(r["citations"]) for r in REFS)
TOT_COMPONENTS = len(DESIGN["components"])

CSS = """
:root{
  --bg:#0b0d10; --bg2:#12151a; --card:#161a21; --card2:#1b2029; --line:#252b36;
  --ink:#e8ecf3; --dim:#98a2b3; --faint:#69717f;
  --accent:#6ea8fe; --accent2:#a78bfa; --good:#4ade80; --warn:#fbbf24; --bad:#f87171;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;
  -webkit-font-smoothing:antialiased}
.wrap{max-width:1180px;margin:0 auto;padding:0 28px 120px}
a{color:var(--accent)}
code{font-family:var(--mono);font-size:.88em;background:#0f1319;border:1px solid var(--line);
  border-radius:4px;padding:1px 5px;color:#c9d4e4}
h1,h2,h3{line-height:1.2;margin:0}
hr{border:0;border-top:1px solid var(--line);margin:56px 0}

header{padding:64px 0 36px;border-bottom:1px solid var(--line);margin-bottom:44px}
.eyebrow{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);
  font-weight:700;margin-bottom:14px}
h1{font-size:40px;font-weight:700;letter-spacing:-.02em}
.sub{color:var(--dim);font-size:18px;margin-top:14px;max-width:800px}
.meta{margin-top:22px;font-size:12.5px;color:var(--faint);font-family:var(--mono)}

.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:12px;margin:34px 0 0}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px}
.kpi b{display:block;font-size:27px;font-weight:700;letter-spacing:-.02em}
.kpi span{display:block;font-size:11.5px;color:var(--dim);margin-top:4px;line-height:1.35}

h2{font-size:27px;font-weight:700;letter-spacing:-.015em;margin:0 0 8px}
.lede{color:var(--dim);max-width:860px;margin:0 0 28px;font-size:15.5px}

.verdict{background:linear-gradient(180deg,#1a1f2b,#151922);border:1px solid #2f3a4d;
  border-left:3px solid var(--accent);border-radius:12px;padding:26px 30px;margin:0 0 12px}
.verdict .tag{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);
  font-weight:700;margin-bottom:12px}
.verdict p{margin:0;font-size:16.5px;line-height:1.7}

.shot{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;
  margin-bottom:22px}
.shot .cap{padding:18px 22px 6px;display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}
.shot .cap h3{font-size:17.5px;font-weight:650}
.shot .counts{font-family:var(--mono);font-size:11px;color:var(--faint);margin-left:auto}
.shot .blurb{padding:0 22px 16px;color:var(--dim);font-size:14px;max-width:820px}
.shot .zach{padding:0 22px 16px;color:var(--accent2);font-size:14px;font-style:italic}
.shot .img{background:#07080a;border-top:1px solid var(--line);padding:20px;text-align:center}
.shot img{max-width:100%;height:auto;border-radius:6px;display:block;margin:0 auto}

table{width:100%;border-collapse:collapse;font-size:13.5px;margin:0}
.scroll{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--card)}
th{text-align:left;padding:11px 14px;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--faint);font-weight:700;border-bottom:1px solid var(--line);white-space:nowrap;
  background:var(--card2);position:sticky;top:0}
td{padding:11px 14px;border-bottom:1px solid #1e2430;vertical-align:top}
tr:last-child td{border-bottom:0}
td.mono,.mono{font-family:var(--mono);font-size:12px}
/* WHY table-layout:fixed with explicit widths rather than letting the browser
   size these: the stock-part and component tables carry long monospace
   file:line strings in the middle columns, and auto layout lets those claim
   whatever width they want — which pushed the LAST column (the behaviour that
   must survive, i.e. the actual point of the table) off the edge of the
   scroll box. Fixed widths + break-word make every column earn its share and
   wrap instead of shove. */
table.fixed{table-layout:fixed}
table.fixed td{overflow-wrap:anywhere}
.stock col.c1{width:13%}.stock col.c2{width:27%}.stock col.c3{width:30%}.stock col.c4{width:30%}
.comp col.c1{width:20%}.comp col.c2{width:30%}.comp col.c3{width:30%}.comp col.c4{width:20%}
.stock td:nth-child(3){color:#8fd6a8}
.stock tr.seam td{background:#12171a}
.stock tr.seam td:nth-child(2){color:var(--faint);font-style:italic}

.layers{display:flex;flex-direction:column;gap:2px;margin:0 0 10px}
.layer{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:15px 18px;
  display:grid;grid-template-columns:150px 1fr;gap:18px;align-items:start}
.layer .nm{font-weight:700;font-size:14px;color:var(--accent)}
.layer .nm small{display:block;font-weight:400;color:var(--faint);font-size:11px;margin-top:3px;
  font-family:var(--mono)}
.layer .bd{font-size:13.5px;color:var(--dim)}
.layer .imports{margin-top:7px;font-size:11.5px;font-family:var(--mono);color:var(--faint)}
.layer.host{border-color:#3a2f1f;background:#171308}
.layer.host .nm{color:var(--warn)}

.waves{display:grid;gap:12px}
.wave{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 20px}
.wave h4{margin:0 0 6px;font-size:14.5px;font-weight:650}
.wave .bar{display:inline-block;font-family:var(--mono);font-size:10.5px;padding:2px 8px;
  border-radius:4px;background:#2a1f10;color:var(--warn);border:1px solid #3d2e18;margin-left:8px}
.wave .why{color:var(--dim);font-size:13px;margin:6px 0 0}
.wave .ws{margin-top:8px;font-family:var(--mono);font-size:11px;color:var(--faint);line-height:1.7}

.cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:860px){.cols{grid-template-columns:1fr}.layer{grid-template-columns:1fr}}
.box{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:18px 20px}
.box h4{margin:0 0 10px;font-size:14px;font-weight:650}
.box ul{margin:0;padding-left:18px;color:var(--dim);font-size:13.5px}
.box li{margin-bottom:7px}

.pat{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 20px;
  margin-bottom:10px}
.pat h4{margin:0 0 4px;font-size:14.5px}
.pat .ex{font-family:var(--mono);font-size:11.5px;color:var(--accent);margin-bottom:8px}
.pat pre{background:#0a0d11;border:1px solid var(--line);border-radius:6px;padding:11px 13px;
  overflow-x:auto;margin:8px 0;font-family:var(--mono);font-size:11.5px;color:#c9d4e4;line-height:1.55}
.pat .to{color:var(--dim);font-size:13px;margin:6px 0 0}

/* ---- decision cards: the input surface ---- */
.dec{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px 22px;
  margin-bottom:14px}
.dec .num{font-family:var(--mono);font-size:11px;color:var(--faint);margin-bottom:6px}
.dec h4{margin:0 0 10px;font-size:15.5px;font-weight:650;line-height:1.45}
.dec .rec{background:#101922;border-left:2px solid var(--accent);border-radius:0 6px 6px 0;
  padding:10px 14px;margin-bottom:8px;font-size:13.5px;color:#cfe0f5}
.dec .def{background:#101a12;border-left:2px solid var(--good);border-radius:0 6px 6px 0;
  padding:10px 14px;margin-bottom:14px;font-size:13px;color:#bfe6cc}
.dec .rec b,.dec .def b{color:#fff;font-weight:650}
.votes{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:10px}
.votes button{font:inherit;font-size:12.5px;padding:6px 14px;border-radius:7px;cursor:pointer;
  background:#1d232e;color:var(--dim);border:1px solid var(--line);transition:.12s}
.votes button:hover{border-color:#3c4657;color:var(--ink)}
.votes button[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#08101c;
  font-weight:650}
.votes button[data-v=no][aria-pressed=true]{background:var(--bad);border-color:var(--bad);color:#2a0808}
.votes button[data-v=talk][aria-pressed=true]{background:var(--warn);border-color:var(--warn);color:#2a1f05}
.dec textarea{width:100%;min-height:52px;background:#0c0f14;border:1px solid var(--line);
  border-radius:7px;padding:9px 12px;color:var(--ink);font:inherit;font-size:13px;resize:vertical}
.dec textarea::placeholder{color:#4d5563}

section.decisions{position:relative}
.copybar{position:sticky;bottom:0;background:linear-gradient(180deg,rgba(11,13,16,0),var(--bg) 42%);
  padding:26px 0 18px;margin-top:10px}
.copybar .inner{background:var(--card2);border:1px solid var(--line);border-radius:11px;
  padding:15px 18px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
.copybar button{font:inherit;font-size:13.5px;font-weight:650;padding:9px 20px;border-radius:8px;
  background:var(--accent);color:#08101c;border:0;cursor:pointer}
.copybar span{color:var(--dim);font-size:12.5px}
#out{width:100%;min-height:150px;margin-top:12px;background:#0a0d11;border:1px solid var(--line);
  border-radius:8px;padding:13px;color:#c9d4e4;font-family:var(--mono);font-size:11.5px;
  display:none;resize:vertical}

.pill{display:inline-block;font-family:var(--mono);font-size:10px;padding:2px 7px;border-radius:4px;
  text-transform:uppercase;letter-spacing:.06em;font-weight:700}
.pill.blocker{background:#2c1214;color:#fca5a5}
.pill.mechanical{background:#2a2110;color:#fcd34d}
.pill.cosmetic{background:#16212c;color:#93c5fd}
.pill.done{background:#10241a;color:#86efac}
.pill.partial{background:#2a2110;color:#fcd34d}
.pill.failed{background:#2c1214;color:#fca5a5}

.note{background:#171308;border:1px solid #3a2f1f;border-left:3px solid var(--warn);
  border-radius:0 10px 10px 0;padding:16px 20px;margin:18px 0;font-size:14px;color:#e8dcc0}
.note b{color:#fff}
.ok{background:#0d1a12;border-color:#1f3a28;border-left-color:var(--good);color:#cfe9d8}
"""


def kpis() -> str:
    items = [
        (TOT_FILES, "donor files read across the nine surfaces"),
        (TOT_PARTS, "visible parts named and traced to a file:line"),
        (TOT_COUPLINGS, "engine couplings found", f"{TOT_BLOCKERS} rated blockers"),
        (TOT_CITATIONS, "citations actually fetched or read on disk"),
        (TOT_COMPONENTS, "components proposed for the kit"),
        (len(DESIGN["stockPartTable"]), "stock-part rows, seams included"),
    ]
    out = []
    for it in items:
        sub = f"{it[1]}<br><span style='color:var(--warn)'>{it[2]}</span>" if len(it) > 2 else it[1]
        out.append(f"<div class='kpi'><b>{it[0]}</b><span>{sub}</span></div>")
    return f"<div class='kpis'>{''.join(out)}</div>"


def surfaces_html() -> str:
    out = []
    for s in SURFACES:
        p = SHOTS_DIR / s["shot"]
        if not p.exists():
            continue
        sv = SURVEYS[s["survey"]]
        counts = (f"{len(sv['files'])} files · {len(sv['anatomy'])} parts · "
                  f"{len(sv['engineCoupling'])} couplings")
        zach = f"<div class='zach'>{e(s['zach'])}</div>" if s["zach"] else ""
        out.append(f"""
<div class='shot'>
  <div class='cap'><h3>{e(s['title'])}</h3><div class='counts'>{counts}</div></div>
  <div class='blurb'>{s['blurb']}</div>
  {zach}
  <div class='img'><img alt="{e(s['title'])}" src="data:image/png;base64,{b64(p)}"></div>
</div>""")
    return "".join(out)


def layers_html() -> str:
    out = []
    for i, l in enumerate(DESIGN["layers"]):
        name = l["layer"]
        host = "host" in name.lower() or "adapter" in name.lower()
        short = name.split("(")[0].strip()
        paren = name[len(short):].strip(" ()") if "(" in name else ""
        out.append(f"""
<div class='layer {'host' if host else ''}'>
  <div class='nm'>{e(short)}{f"<small>{e(paren)}</small>" if paren else ""}</div>
  <div class='bd'>{e(l['contains'])}
    <div class='imports'>may import → {e(l['mayImport'])}</div>
  </div>
</div>""")
    return f"<div class='layers'>{''.join(out)}</div>"


def components_html() -> str:
    rows = []
    for c in DESIGN["components"]:
        deps = ", ".join(c["dependsOn"]) or "—"
        rows.append(f"""<tr>
  <td class='mono'>{e(c['file'])}</td>
  <td class='mono' style='color:#8fd6a8'>{e(c['exports'])}</td>
  <td>{e(c['renders'])}</td>
  <td class='mono' style='color:var(--faint)'>{e(deps)}</td>
</tr>""")
    return f"""<div class='scroll'><table class='comp fixed'>
<colgroup><col class='c1'><col class='c2'><col class='c3'><col class='c4'></colgroup>
<thead><tr><th>File</th><th>Exports</th><th>Renders</th><th>Depends on</th></tr></thead>
<tbody>{''.join(rows)}</tbody></table></div>"""


def stock_html() -> str:
    rows = []
    for r in DESIGN["stockPartTable"]:
        seam = "unchanged" in r["today"].lower() or "unchanged" in r["stockPart"].lower()
        rows.append(f"""<tr class="{'seam' if seam else ''}">
  <td>{e(r['element'])}</td>
  <td class='mono' style='font-size:11px'>{e(r['today'])}</td>
  <td class='mono'>{e(r['stockPart'])}</td>
  <td style='color:var(--dim)'>{e(r['behaviourThatMustSurvive'])}</td>
</tr>""")
    return f"""<div class='scroll'><table class='stock fixed'>
<colgroup><col class='c1'><col class='c2'><col class='c3'><col class='c4'></colgroup>
<thead><tr><th>Element</th><th>Today, in SystemSketch</th><th>Off-the-shelf part</th>
<th>Behaviour that must survive</th></tr></thead>
<tbody>{''.join(rows)}</tbody></table></div>"""


def waves_html() -> str:
    out = []
    for b in DESIGN["buildOrder"]:
        barrier = "BARRIER" in b["lane"].upper()
        ws = "<br>".join(e(w) for w in b["writeSet"])
        out.append(f"""
<div class='wave'>
  <h4>Wave {b['wave']} — {e(b['lane'].split('(')[0].strip())}
    {"<span class='bar'>barrier · lands alone</span>" if barrier else ""}</h4>
  <p class='why'>{e(b['rationale'])}</p>
  <div class='ws'>{ws}</div>
</div>""")
    return f"<div class='waves'>{''.join(out)}</div>"


def refs_html() -> str:
    out = []
    for r in REFS:
        libs = "".join(
            f"<tr><td class='mono'>{e(l['name'])}</td><td class='mono' style='font-size:11px;color:var(--faint)'>"
            f"{e(l['license'])}</td><td>{e(l['whatItGives'])}</td>"
            f"<td style='color:var(--dim)'>{e(l['extensibilityStory'])}</td></tr>"
            for l in r["libraries"])
        pats = "".join(f"""
<div class='pat'>
  <h4>{e(p['pattern'])}</h4>
  <div class='ex'>{e(p['exemplar'])}</div>
  <pre>{e(p['apiShape'])}</pre>
  <p class='to'><b>Trade-off:</b> {e(p['tradeoff'])}</p>
</div>""" for p in r["structuralPatterns"])
        out.append(f"""
<h3 style='font-size:19px;margin:32px 0 6px'>{e(r['area'])}</h3>
<p style='color:var(--faint);font-size:12px;font-family:var(--mono);margin:0 0 14px'>
  {len(r['citations'])} sources fetched or read on disk</p>
<div class='scroll' style='margin-bottom:18px'><table>
<thead><tr><th>Library</th><th>Licence</th><th>What it gives</th><th>How a host extends it</th></tr></thead>
<tbody>{libs}</tbody></table></div>
{pats}
<div class='note ok'><b>Take:</b> {e(r['recommendation'])}</div>""")
    return "".join(out)


def couplings_html() -> str:
    """The seams that must break — the blockers only, grouped by surface."""
    out = []
    for s in SURVEYS:
        blockers = [c for c in s["engineCoupling"] if c["severity"] == "blocker"]
        if not blockers:
            continue
        rows = "".join(
            f"<tr><td class='mono' style='font-size:11px'>{e(c['sourceRef'])}</td>"
            f"<td>{e(c['what'])}</td></tr>" for c in blockers)
        title = s["surface"].split("—")[0].strip()
        out.append(f"""
<h4 style='margin:22px 0 8px;font-size:14.5px'>{e(title)}
  <span class='pill blocker' style='margin-left:8px'>{len(blockers)} blockers</span></h4>
<div class='scroll'><table><tbody>{rows}</tbody></table></div>""")
    return "".join(out)


def decisions_html() -> str:
    out = []
    for i, d in enumerate(DESIGN["openDecisions"], 1):
        out.append(f"""
<div class='dec' data-n='{i}' data-title="{e(d['question'][:90])}">
  <div class='num'>DECISION {i} OF {len(DESIGN['openDecisions'])}</div>
  <h4>{e(d['question'])}</h4>
  <div class='rec'><b>Recommendation:</b> {e(d['recommendation'])}</div>
  <div class='def'><b>If you say nothing:</b> {e(d['reversibleDefault'])}</div>
  <div class='votes'>
    <button data-v='yes' aria-pressed='false'>Agree</button>
    <button data-v='no' aria-pressed='false'>No — do the other thing</button>
    <button data-v='talk' aria-pressed='false'>Talk to me first</button>
  </div>
  <textarea placeholder='Notes (optional)'></textarea>
</div>""")
    return "".join(out)


def build_html() -> str:
    """Implementation results — only rendered once the build workflow has landed."""
    if not BUILD:
        return """
<div class='note'><b>Implementation is still running.</b> Fourteen lanes across four waves, with a
typecheck + full story-suite gate at every barrier. This section fills in when it lands; the
architecture above is already final and committed.</div>"""

    lanes = BUILD.get("lanes", [])
    rows = "".join(
        f"<tr><td class='mono'>{e(l['lane'])}</td>"
        f"<td><span class='pill {e(l['status'])}'>{e(l['status'])}</span></td>"
        f"<td class='mono' style='font-size:11px'>{len(l['filesWritten'])} files</td>"
        f"<td style='color:var(--dim);font-size:12.5px'>"
        f"{e('; '.join(l['blockers']) if l['blockers'] else '—')}</td></tr>"
        for l in lanes)
    gates = BUILD.get("gates", {})
    gate_rows = "".join(
        f"<tr><td class='mono'>{e(k)}</td>"
        f"<td><span class='pill {'done' if (v or {}).get('pass') else 'failed'}'>"
        f"{'green' if (v or {}).get('pass') else 'red'}</span></td>"
        f"<td class='mono'>{e((v or {}).get('testFiles','—'))}</td>"
        f"<td class='mono'>{e((v or {}).get('testCount','—'))}</td></tr>"
        for k, v in gates.items())
    audit = BUILD.get("audit") or {}
    findings = "".join(
        f"<tr><td><span class='pill {'blocker' if f['severity']=='critical' else 'mechanical' if f['severity']=='major' else 'cosmetic'}'>"
        f"{e(f['severity'])}</span></td>"
        f"<td class='mono' style='font-size:11px'>{e(f['file'])}</td>"
        f"<td>{e(f['summary'])}</td>"
        f"<td class='mono' style='font-size:10.5px;color:var(--faint)'>{e(f['confidence'])}</td></tr>"
        for f in audit.get("findings", []))
    return f"""
<div class='scroll' style='margin-bottom:18px'><table>
<thead><tr><th>Lane</th><th>Status</th><th>Wrote</th><th>Blockers</th></tr></thead>
<tbody>{rows}</tbody></table></div>

<h3 style='font-size:18px;margin:28px 0 10px'>The gates</h3>
<p class='lede'>Every barrier ran <code>pnpm typecheck</code> and <code>pnpm test-stories</code> —
the real Vitest/Playwright suite with a real exit code, never the <code>storyRenders</code> check
that reads <code>undefined</code> whether or not a play function threw.</p>
<div class='scroll'><table>
<thead><tr><th>Gate</th><th>Result</th><th>Story files</th><th>Tests</th></tr></thead>
<tbody>{gate_rows}</tbody></table></div>

<h3 style='font-size:18px;margin:32px 0 10px'>What the independent audit found</h3>
<div class='note {'ok' if not audit.get('lawViolations') and not audit.get('falseClaims') else ''}'>
  <b>Verdict:</b> {e(audit.get('overallVerdict','—'))}</div>
{f"<div class='scroll'><table><thead><tr><th>Severity</th><th>File</th><th>Finding</th><th></th></tr></thead><tbody>{findings}</tbody></table></div>" if findings else "<p class='lede'>No findings survived verification.</p>"}
"""


JS = """
(function(){
  var K='bbox-menu-kit-2026-09-18';
  function load(){ try{ return JSON.parse(localStorage.getItem(K)||'{}'); }catch(e){ return {}; } }
  function save(s){ try{ localStorage.setItem(K, JSON.stringify(s)); }catch(e){} }
  var state = load();

  document.querySelectorAll('.dec').forEach(function(card){
    var n = card.dataset.n;
    var btns = card.querySelectorAll('.votes button');
    var ta = card.querySelector('textarea');
    var cur = state[n] || {};
    btns.forEach(function(b){
      if (cur.v === b.dataset.v) b.setAttribute('aria-pressed','true');
      b.addEventListener('click', function(){
        var already = b.getAttribute('aria-pressed')==='true';
        btns.forEach(function(x){ x.setAttribute('aria-pressed','false'); });
        if(!already) b.setAttribute('aria-pressed','true');
        state[n] = state[n] || {};
        state[n].v = already ? null : b.dataset.v;
        save(state);
      });
    });
    if (cur.note) ta.value = cur.note;
    ta.addEventListener('input', function(){
      state[n] = state[n] || {}; state[n].note = ta.value; save(state);
    });
  });

  var LABEL = { yes:'AGREE', no:'NO — do the other thing', talk:'TALK TO ME FIRST' };
  document.getElementById('copy').addEventListener('click', function(){
    var lines = ['# Menu kit — decisions', ''];
    var answered = 0;
    document.querySelectorAll('.dec').forEach(function(card){
      var n = card.dataset.n, s = state[n] || {};
      if(!s.v && !s.note) return;
      answered++;
      lines.push('## ' + n + '. ' + card.dataset.title);
      if (s.v) lines.push('- **' + (LABEL[s.v]||s.v) + '**');
      if (s.note) lines.push('- Note: ' + s.note);
      lines.push('');
    });
    if(!answered) lines.push('_(nothing marked — the reversible defaults stand)_');
    var text = lines.join('\\n');
    var out = document.getElementById('out');
    out.style.display='block'; out.value = text; out.focus(); out.select();
    try{ navigator.clipboard.writeText(text); }catch(e){}
    document.getElementById('hint').textContent =
      answered ? ('Copied ' + answered + ' decision(s) — paste into chat.')
               : 'Nothing marked yet — the defaults stand. Text is selected below anyway.';
  });
})();
"""


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Menu kit — porting SystemSketch's menus into bbox-ui</title>
<style>{CSS}</style></head><body><div class="wrap">

<header>
  <div class="eyebrow">bbox-ui · editor component kit · 2026-09-18</div>
  <h1>Porting SystemSketch's menus</h1>
  <p class="sub">Nine surfaces, surveyed file by file, mapped against what shadcn, Base UI, tldraw,
    Excalidraw, Radix, Ariakit, React Aria and VS Code already give away — then drawn as one
    component kit that runs in any host.</p>
  <div class="meta">worktree {e(git_sha())} · 12 survey + research agents → Fable 5.1 design →
    14 build lanes · docs/menus/MENU-KIT-DESIGN.md</div>
  {kpis()}
</header>

<h2>The call</h2>
<p class="lede">You asked whether these should be modular components. They should — but not all the
same kind of modular, and that is the whole finding.</p>
<div class="verdict">
  <div class="tag">Architecture verdict · Fable 5.1</div>
  <p>{e(DESIGN['verdict'])}</p>
</div>
<div class="note"><b>Why this is not a fence-sit.</b> SystemSketch conflates two different animals
behind one word. A <b>command</b> surface (file menu, tool dock, panels) has items that are just
actions — and in a copy-paste registry the consumer already owns the placement file, so editing
that JSX <em>is</em> the extension mechanism; a schema on top buys nothing and costs a resolver.
A <b>value-bound</b> surface (the appearance pill) is the opposite: its items are bound to live,
possibly-mixed values across a selection, and that is exactly where the registry earns its keep —
which is why the pill was the part you remember doing a lot of work on.</div>

<hr>

<h2>The nine surfaces</h2>
<p class="lede">Each card carries the real counts from its own survey agent: files opened, visible
parts named down to a <code>file:line</code>, and places the code reaches into tldraw, a global
store, <code>localStorage</code>, or the DOM. Those last ones are the seams the port has to break.</p>
{surfaces_html()}

<hr>

<h2>The layers</h2>
<p class="lede">Four layers plus the host adapter. The rule that makes a third host cheap is the
arrow direction: nothing in the kit may import a canvas engine, and everything engine-shaped is
pushed down into the adapter — which never ships.</p>
{layers_html()}

<h2 style="margin-top:44px">The components</h2>
<p class="lede">{TOT_COMPONENTS} files. Names in <code>lowerCamel</code> for kit-original parts and
<code>kebab</code> for stock shadcn copies, matching what the trunk already does.</p>
{components_html()}

<hr>

<h2>The stock part, element by element</h2>
<p class="lede">One row per element: what SystemSketch does today, the off-the-shelf part that
replaces it by its exact exported name, and the behaviour that has to survive the swap. The dimmed
rows are deliberate <b>stock seams</b> — things left exactly alone.</p>
{stock_html()}

<hr>

<h2>The seams that must break</h2>
<p class="lede">{TOT_COUPLINGS} engine couplings found across the nine surfaces; these {TOT_BLOCKERS}
are rated <span class="pill blocker">blocker</span> — code that cannot travel into the core at all
and must become a prop, a callback, or host-adapter code.</p>
{couplings_html()}

<hr>

<h2>What the libraries already give away</h2>
<p class="lede">Four research lanes, {TOT_CITATIONS} sources fetched or read on disk — no API name
here is recalled from memory. The question each answers: can a host add, reorder, or replace one
item without forking?</p>
{refs_html()}

<hr>

<h2>Build order</h2>
<p class="lede">Lanes are serialized on <em>contracts</em>, not on fear: a lane editing a file other
lanes import is a barrier and lands alone; everything else runs in parallel in one tree.</p>
{waves_html()}

<h2 style="margin-top:48px">Where the build got to</h2>
{build_html()}

<hr>

<h2>What I deliberately left out</h2>
<div class="cols">
  <div class="box"><h4>Not built, on purpose</h4><ul>
    {''.join(f"<li>{e(o)}</li>" for o in DESIGN['omitted'][:7])}
  </ul></div>
  <div class="box"><h4>…and the rest</h4><ul>
    {''.join(f"<li>{e(o)}</li>" for o in DESIGN['omitted'][7:])}
  </ul></div>
</div>

<hr>

<!-- WHY the decisions live in their own <section>: `position:sticky` resolves
     against the nearest scrolling ancestor's containing block, so a copy bar
     parented to .wrap floats over EVERY section from the masthead down and
     clips whatever paragraph is under it. Scoping the containing block to
     this section makes the bar appear exactly when the questions do. -->
<section class="decisions">
<h2>Decisions that need you</h2>
<p class="lede">Eight calls the design made where a different answer was genuinely defensible. Each
carries my recommendation and the reversible default I take if you say nothing — so ignoring this
section is free and the work keeps moving. Mark only what you disagree with.</p>
{decisions_html()}

<div class="copybar"><div class="inner">
  <button id="copy">Copy my answers</button>
  <span id="hint">Each answer is named by number and title, so you never have to say which one you mean.</span>
  <textarea id="out" readonly></textarea>
</div></div>
</section>

</div><script>{JS}</script></body></html>"""
    OUT.write_text(page, encoding="utf-8")
    kb = len(page.encode()) / 1024
    print(f"wrote {OUT}  ({kb:.0f} KB)")
    if kb > 1900:
        print("  WARNING: over the desktop-preview ceiling — hand over as browser-only")


if __name__ == "__main__":
    main()
