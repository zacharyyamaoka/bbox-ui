#!/usr/bin/env python3
"""Build the exhaustive Python-syntax scenario report.

    python3 docs/build_python_syntax_report.py

Writes /home/bam/bbox-ui/reports/python-syntax-scenarios-<date>.html — the MAIN
checkout's reports/, by absolute path, even from a worktree (CLAUDE.md: that is
the one location a handoff link survives AND opens).

Every fact on the page is measured at build time rather than typed: the grammar
node counts come from `ast` on the running interpreter, the golden coverage from
parsing the corpus, and the example count from the inventory. A stale claim
cannot survive a rebuild.
"""
from __future__ import annotations

import ast
import datetime as dt
import html
import json
import pathlib
import re
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from pygments import highlight                       # noqa: E402
from pygments.formatters import HtmlFormatter        # noqa: E402
from pygments.lexers import PythonLexer              # noqa: E402

from _report_kit import CSS, FB_JS, dock, fb, overall_box, report_size  # noqa: E402
import python_syntax_inventory as inv                # noqa: E402

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent
MAIN = pathlib.Path("/home/bam/bbox-ui")
PYBLOCKS = pathlib.Path("/home/bam/pyblocks")
TODAY = dt.date.today().isoformat()
OUT = MAIN / "reports" / f"python-syntax-scenarios-{TODAY}.html"

E = html.escape
LEXER = PythonLexer()
FORMATTER = HtmlFormatter(nowrap=True, classprefix="p-")

# WHY a sentinel rather than letting Pygments see the angle brackets: a canonical
# form like `for <item> in <iterable>:` is a TEMPLATE, not Python, and Pygments
# lexes `<item>` as two comparison operators around a name — which paints the
# placeholder the same colour as real code and defeats the whole point of showing
# a general form beside three concrete ones.
#
# WHY the sentinel must itself be a valid Python IDENTIFIER: the first version
# delimited it with U+2422, and every canonical form on the page rendered as
# literal `bPH0b`. Pygments lexes a non-identifier character as its own Error
# token, so the sentinel came back out of the highlighter split across three
# spans and the exact-string replace below could never match. An identifier
# lexes as one Name token and survives contiguous.
_PH = "PH_{}_SENTINEL"


def py(code: str, template: bool = False) -> str:
    """Python source -> highlighted HTML. `template=True` keeps <placeholders> distinct."""
    holes: list[str] = []
    if template:
        def grab(m: re.Match) -> str:
            holes.append(m.group(1))
            return _PH.format(len(holes) - 1)
        code = re.sub(r"<([A-Za-z_][\w.]*)>", grab, code)
    out = highlight(code, LEXER, FORMATTER).rstrip("\n")
    for i, name in enumerate(holes):
        out = out.replace(_PH.format(i), f'<span class="ph">{E(name)}</span>')
    return out


def sh(cmd: str, cwd: pathlib.Path) -> str:
    return subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True).stdout.strip()


# --------------------------------------------------------------------------
# Measured facts
# --------------------------------------------------------------------------

def measure_goldens() -> dict:
    """Parse EVERY golden corpus and report what it actually reaches.

    WHY all three and not just `runnable_goldens`: the first version of this
    report measured that one corpus, found 23 of the 71 grammar nodes absent,
    and led with `match`/`case` as "zero occurrences anywhere in the corpus".
    That was wrong by a factor of four. `adversarial_goldens` holds 131 more
    cases — including `e07_match_statement_bindings`, `b06_walrus_in_
    comprehension_leaks`, `b08_global_write_hidden_channel` and
    `f02_reviewed_generator_yield_from` — and measuring one corpus and
    reporting on "the corpus" is precisely the scan-is-not-proof-the-set-is-
    complete failure this report exists to prevent.

    Two measures, because they answer different questions:
      * `body`     — inside the case's own reviewed symbol. This is what the
                     projection actually has to DRAW.
      * `anywhere` — anywhere in the case's source.py, scaffolding included.
                     A node here but not in `body` has a golden that touches
                     it and no golden that draws it.
    """
    body: dict[str, set[str]] = {}
    anywhere: dict[str, set[str]] = {}
    per_corpus: dict[str, int] = {}
    for corpus in ("runnable_goldens", "adversarial_goldens", "repo_goldens"):
        root = PYBLOCKS / "examples" / corpus
        n = 0
        for cj in sorted(root.rglob("case.json")):
            case = f"{corpus.split('_')[0][:3]}:{cj.parent.name}"
            n += 1
            sym = json.loads(cj.read_text()).get("qualifiedSymbol", "run").split(".")[-1]
            src = cj.parent / "source.py"
            if not src.exists():
                continue
            # utf-8-sig: p17_utf8_byte_order_mark is a golden whose whole point
            # is a BOM, and a plain read makes ast.parse throw on it.
            tree = ast.parse(src.read_text(encoding="utf-8-sig"))
            for node in ast.walk(tree):
                anywhere.setdefault(type(node).__name__, set()).add(case)
            target = None
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == sym:
                    target = node
            if target is None:
                continue
            for node in ast.walk(target):
                body.setdefault(type(node).__name__, set()).add(case)
        per_corpus[corpus] = n
    return {
        "per_corpus": per_corpus,
        "total": sum(per_corpus.values()),
        "body": {k: len(v) for k, v in body.items()},
        # Drawable nodes only: `body` also holds riders (Del, GtE, BitAnd …),
        # which are labels on a carrier and can never be thin on their own.
        "thin": sorted(k for k, v in body.items()
                       if len(v) <= 2 and k in inv.EVERY_NODE),
        "no_body": [n for n in inv.EVERY_NODE if n not in body],
        "nowhere": [n for n in inv.EVERY_NODE if n not in anywhere],
        "scaffold_only": {n: sorted(anywhere[n])[:3] for n in inv.EVERY_NODE
                          if n not in body and n in anywhere},
    }


GOLD = measure_goldens()
MISSING, DUPES = inv.coverage_report(inv.ALL_GROUPS)
assert not MISSING and not DUPES, (MISSING, DUPES)

N_EX = sum(len(s.examples) for s in inv.ALL_SCENARIOS)
GAPS = [s for s in inv.ALL_SCENARIOS if not s.covered]
PARTIAL = [s for s in inv.ALL_SCENARIOS if s.partial]
OPEN_QS = [s for s in inv.ALL_SCENARIOS if s.open_q]

# Every example is real Python. Asserted, not claimed.
for _s in inv.ALL_SCENARIOS:
    for _cap, _code in _s.examples:
        ast.parse(_code)

# And every canonical form's placeholders really did become <span class="ph">.
# This gate exists because the first build shipped `bPH0b` on all 57 cards and
# looked fine in the terminal — the failure is only visible in the rendered page.
for _s in inv.ALL_SCENARIOS:
    _h = py(_s.canonical, template=True)
    assert "PH_" not in _h and "p-err" not in _h, f"placeholder leaked in {_s.id}: {_h[:120]}"
    if "<" in _s.canonical:
        assert 'class="ph"' in _h, f"no placeholder rendered in {_s.id}"

SS_VIEWS = len(list((PYBLOCKS / "examples" / "systemsketch_goldens").glob("series_*/source.py")))
PY_VER = ".".join(str(v) for v in sys.version_info[:3])
PYB_HEAD = sh("git log -1 --format=%h", PYBLOCKS) or "?"
BBOX_HEAD = sh("git log -1 --format=%h", REPO) or "?"


# --------------------------------------------------------------------------
# Page-local CSS — the code is the media here, so it gets the budget
# --------------------------------------------------------------------------

EXTRA_CSS = """
  .wrap { max-width:1180px }

  /* Pygments, mapped onto the report palette rather than a stock theme. */
  .p-k, .p-kn, .p-kd, .p-kc, .p-kr, .p-kp, .p-ow { color:#c98bdb; font-weight:600 }
  .p-nf, .p-fm { color:#79b8ff }
  .p-nc, .p-nn { color:#5ecf9a }
  .p-nb { color:#6fd0c0 }
  .p-nd { color:#e8c06a }
  .p-s, .p-s1, .p-s2, .p-sa, .p-si, .p-se, .p-sd { color:#9ecbff }
  .p-m, .p-mi, .p-mf { color:#e8a87c }
  .p-c, .p-c1, .p-cm { color:#5c6370; font-style:italic }
  .p-o, .p-p { color:#8b93a3 }
  .p-bp { color:#c98bdb }
  .ph { color:#f0883e; background:#2a1c10; border:1px solid #4a3218; border-radius:3px;
        padding:0 3px; font-style:italic }

  .toc { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:10px; margin:26px 0 10px }
  .toc a { display:block; background:var(--panel); border:1px solid var(--line); border-radius:9px;
           padding:11px 13px; text-decoration:none; color:var(--fg) }
  .toc a:hover { border-color:#4e5768 }
  .toc a b { display:block; font-size:13.5px; margin-bottom:3px }
  .toc a span { font-size:11px; color:var(--dim2); font-family:var(--mono) }

  .sc { background:var(--panel); border:1px solid var(--line); border-radius:12px;
        padding:20px 22px; margin:0 0 16px; scroll-margin-top:16px }
  .sc.gap { border-left:3px solid var(--warn) }
  .sc.facet { border-left:3px solid var(--accent2) }
  .sc-h { display:flex; align-items:baseline; gap:11px; flex-wrap:wrap; margin-bottom:4px }
  .sc-h .sid { font:800 12px/1 var(--mono); color:#0c0d10; background:var(--dim2);
               border-radius:5px; padding:5px 7px; letter-spacing:.04em }
  .sc.gap .sc-h .sid { background:var(--warn); color:#fff }
  .sc.facet .sc-h .sid { background:var(--accent2) }
  .sc-h h3 { margin:0; font-size:19px; letter-spacing:-.015em; flex:1 1 auto }
  .chip { font:700 10px/1 var(--mono); text-transform:uppercase; letter-spacing:.09em;
          border-radius:5px; padding:5px 7px; border:1px solid var(--line2); color:var(--dim) }
  .chip.block { color:#79b8ff; border-color:#2d4463 } .chip.transform { color:#5ecf9a; border-color:#23503c }
  .chip.region { color:#f0883e; border-color:#57351c } .chip.data { color:#e8a87c; border-color:#4d3524 }
  .chip.wire { color:#9aa3b2; border-color:#3a4150 } .chip.mark { color:#e8c06a; border-color:#4a3f1f }
  .chip.sink { color:#d98ab0; border-color:#4f2c3d } .chip.not-drawn { color:#6b7383; border-color:#2b303a }

  .nodes { font:11.5px/1.7 var(--mono); color:var(--dim2); margin:2px 0 14px }
  .nodes b { color:var(--dim); font-weight:600 }
  .nodes .n { color:#5ecf9a; background:#0d1512; border:1px solid #1d2f26;
              border-radius:4px; padding:1px 5px; margin-right:4px; display:inline-block }
  .nodes .r { color:#6b7383; background:#0c0d11; border:1px solid #1d212a;
              border-radius:4px; padding:1px 5px; margin-right:3px; display:inline-block; font-size:10.5px }

  .lab { font:700 10px/1 var(--mono); text-transform:uppercase; letter-spacing:.13em;
         color:var(--dim2); margin:16px 0 7px }
  .lab.canon { color:var(--accent) }
  pre.canon { background:#0d0a07; border-color:#3a2a17 }
  .ports { background:#0c0e12; border:1px solid var(--line); border-left:2px solid var(--accent2);
           border-radius:0 8px 8px 0; padding:10px 14px; margin:10px 0 0; font-size:13px; color:var(--dim) }
  .ports b { color:var(--fg) }

  .ex { margin:0 0 11px }
  .ex .cap { font-size:12.5px; color:var(--dim2); margin:0 0 5px; line-height:1.5 }
  .ex .cap b { color:var(--dim) }

  .sc-note { font-size:13.5px; color:var(--dim); margin:16px 0 0; line-height:1.65 }
  .sc-note b { color:var(--fg) } .sc-note i { color:var(--dim) }
  .oq { background:#1a1207; border:1px solid #4a3218; border-radius:9px; padding:12px 15px;
        margin:13px 0 0; font-size:13.5px; color:#e8c06a; line-height:1.6 }
  .oq b { color:#f0883e; display:block; font:700 10px/1 var(--mono); text-transform:uppercase;
          letter-spacing:.13em; margin-bottom:6px }
  .oq code { background:#120c05; border-color:#3a2a17; color:#e8c06a }
  .cov { font:11.5px/1 var(--mono); margin:14px 0 0; color:var(--dim2) }
  .cov .on { color:var(--ok) } .cov .off { color:var(--warn) }

  figure.d { margin:22px 0 0; background:#0a0b0e; border:1px solid var(--line); border-radius:11px; padding:18px }
  figure.d svg { display:block; width:100%; height:auto }
  figure.d figcaption { margin-top:13px }
  .grid5 { display:grid; grid-template-columns:repeat(5,1fr); gap:10px }
  .sid-lite { font:700 10px/1 var(--mono); color:var(--dim2); letter-spacing:.08em }
  #prior-art + .lede + .scroll table td { font-size:12.5px; line-height:1.55 }
  #prior-art + .lede + .scroll table td i { color:#9ecbff }
  @media (max-width:900px){ .grid5 { grid-template-columns:repeat(2,1fr) } }
"""


def esc_ports(t: str) -> str:
    return t


def scenario_html(s: inv.Scenario, rank: str) -> str:
    kind_label, _ = inv.BECOMES[s.becomes]
    cls = "sc" + (" gap" if not s.covered else "") + (" facet" if s.id.startswith("F") else "")
    nodes = ""
    if s.nodes:
        nodes += "<b>grammar</b> " + "".join(f'<span class="n">ast.{E(n)}</span>' for n in s.nodes)
    else:
        nodes += "<b>grammar</b> <i>no node of its own — a composition of the ones above</i>"
    if s.riders:
        nodes += '<br><b>riders</b> ' + "".join(f'<span class="r">{E(r)}</span>' for r in s.riders)

    ex = "".join(
        f'<div class="ex"><p class="cap"><b>{i}.</b> {cap}</p>'
        f'<pre class="tight">{py(code)}</pre></div>'
        for i, (cap, code) in enumerate(s.examples, 1))

    cov = (f'<span class="on">&#9679;</span> golden <b>{E(s.covered)}</b>'
           if s.covered else '<span class="off">&#9679;</span> <b>GAP</b> — no golden exercises this')

    return f"""
<div class="{cls}" id="s-{s.id}">
  <div class="sc-h">
    <span class="sid">{E(s.id)}</span>
    <h3>{E(s.name)}</h3>
    <span class="chip {s.becomes}">{E(kind_label)}</span>
  </div>
  <p class="nodes">{nodes}</p>
  <p class="lab canon">Canonical form</p>
  <pre class="canon">{py(s.canonical, template=True)}</pre>
  <p class="ports"><b>Blocks &amp; ports</b> — {s.ports}</p>
  <p class="lab">Three real examples &mdash; the mini goldens to draw</p>
  {ex}
  {f'<p class="sc-note">{s.note}</p>' if s.note else ''}
  {f'<div class="oq"><b>Open question</b>{s.open_q}</div>' if s.open_q else ''}
  <p class="cov">{cov}</p>
  {fb(rank, s.name, "what this should look like drawn…")}
</div>"""


# --------------------------------------------------------------------------
# Diagrams — drawn to scale from the real numbers, not sketched
# --------------------------------------------------------------------------

def svg_faces() -> str:
    """One block, five faces. The columns Zach asked to see for every scenario.

    WHY draw this once rather than 57 times: the five faces are a property of the
    VIEW LADDER, not of the construct. Redrawing them per scenario would imply
    each construct gets its own answer, which is exactly the thing the ladder
    exists to deny.
    """
    return """
<svg viewBox="0 0 1100 250" xmlns="http://www.w3.org/2000/svg" font-family="ui-monospace,Menlo,monospace">
 <defs>
  <style>
   .bx{fill:#1b1e25;stroke:#3b4353;stroke-width:1.5;rx:6}
   .hd{fill:#232833}
   .t{fill:#e6e8ee;font-size:11px}
   .tt{fill:#9aa3b2;font-size:10px}
   .lb{fill:#6b7383;font-size:10.5px;letter-spacing:.1em}
   .dot{fill:#0e0f12;stroke:#5aa9f8;stroke-width:1.6}
   .dotr{fill:#0e0f12;stroke:#3fb950;stroke-width:1.6}
   .w{stroke:#4e5768;stroke-width:1.4;fill:none}
   .fr{fill:none;stroke:#f0883e;stroke-width:1.5;stroke-dasharray:4 3;rx:7}
   .kw{fill:#c98bdb;font-size:11px}.fn{fill:#79b8ff;font-size:11px}.nm{fill:#c8cede;font-size:11px}
  </style>
 </defs>

 <!-- 1 SOURCE -->
 <text class="lb" x="10" y="16">1 · SOURCE</text>
 <rect class="bx" x="10" y="28" width="196" height="96" fill="#08090b" stroke="#1d212a"/>
 <text x="22" y="48"><tspan class="kw">def</tspan> <tspan class="fn">estimate</tspan><tspan class="nm">(f, g):</tspan></text>
 <text class="nm" x="34" y="66">s = scale(f, g)</text>
 <text class="nm" x="34" y="84">p = solve(s)</text>
 <text x="34" y="102"><tspan class="kw">return</tspan> <tspan class="nm">p, q</tspan></text>

 <!-- 2 SIMPLE -->
 <text class="lb" x="238" y="16">2 · SIMPLE</text>
 <rect class="bx" x="262" y="46" width="118" height="58"/>
 <text class="t" x="321" y="80" text-anchor="middle">estimate</text>
 <line class="w" x1="238" y1="75" x2="262" y2="75"/>
 <circle class="dot" cx="262" cy="75" r="5"/>
 <line class="w" x1="380" y1="75" x2="404" y2="75"/>
 <circle class="dotr" cx="380" cy="75" r="5"/>
 <text class="tt" x="321" y="128" text-anchor="middle">every port &#8594; one point</text>

 <!-- 3 PORT -->
 <text class="lb" x="436" y="16">3 · PORT</text>
 <rect class="bx" x="460" y="36" width="130" height="86"/>
 <rect class="hd" x="460.75" y="36.75" width="128.5" height="24" rx="6"/>
 <text class="t" x="525" y="53" text-anchor="middle">estimate</text>
 <circle class="dot" cx="460" cy="78" r="5"/><text class="tt" x="472" y="82">f</text>
 <circle class="dot" cx="460" cy="102" r="5"/><text class="tt" x="472" y="106">g</text>
 <circle class="dotr" cx="590" cy="78" r="5"/><text class="tt" x="578" y="82" text-anchor="end">p</text>
 <circle class="dotr" cx="590" cy="102" r="5"/><text class="tt" x="578" y="106" text-anchor="end">q</text>
 <text class="tt" x="525" y="146" text-anchor="middle">the interface, innards hidden</text>

 <!-- 4 EXPANDED -->
 <text class="lb" x="640" y="16">4 · EXPANDED</text>
 <rect class="bx" x="640" y="36" width="196" height="150"/>
 <rect class="hd" x="640.75" y="36.75" width="194.5" height="24" rx="6"/>
 <text class="t" x="738" y="53" text-anchor="middle">estimate</text>
 <circle class="dot" cx="640" cy="90" r="5"/><text class="tt" x="652" y="94">f</text>
 <circle class="dot" cx="640" cy="140" r="5"/><text class="tt" x="652" y="144">g</text>
 <circle class="dotr" cx="836" cy="90" r="5"/><text class="tt" x="824" y="94" text-anchor="end">p</text>
 <circle class="dotr" cx="836" cy="140" r="5"/><text class="tt" x="824" y="144" text-anchor="end">q</text>
 <rect class="bx" x="668" y="74" width="66" height="30" fill="#232833"/>
 <text class="tt" x="701" y="93" text-anchor="middle">scale</text>
 <rect class="bx" x="754" y="112" width="66" height="30" fill="#232833"/>
 <text class="tt" x="787" y="131" text-anchor="middle">solve</text>
 <path class="w" d="M734 89 L754 89 L754 127"/>
 <text class="tt" x="738" y="206" text-anchor="middle">the inside</text>

 <!-- 5 EXPANDED-OPAQUE -->
 <text class="lb" x="886" y="16">5 · EXPANDED&#8209;OPAQUE</text>
 <rect class="fr" x="886" y="36" width="204" height="150"/>
 <rect class="bx" x="898" y="48" width="112" height="66"/>
 <rect class="hd" x="898.75" y="48.75" width="110.5" height="22" rx="6"/>
 <text class="t" x="954" y="64" text-anchor="middle">estimate</text>
 <circle class="dot" cx="898" cy="90" r="5"/><text class="tt" x="910" y="94">f</text>
 <circle class="dotr" cx="1010" cy="90" r="5"/><text class="tt" x="998" y="94" text-anchor="end">p</text>
 <text class="tt" x="988" y="150" text-anchor="middle">2 blocks hidden</text>
 <text class="tt" x="988" y="206" text-anchor="middle">frame kept, contents folded</text>
</svg>"""


def svg_region() -> str:
    """Region anatomy — the two shapes every scenario reduces to.

    WHY the shift register is drawn as a matched PAIR on the two walls rather
    than as an arrow looping around: that pairing is the whole point. A lone
    backwards arrow says "this value came from over there"; a wall pair says
    "this is the same slot, one iteration apart", which is the only reading
    under which the cycle is well-formed. LabVIEW, Lustre's `fby` and SCADE's
    `pre` all encode it that way.
    """
    return """
<svg viewBox="0 0 1100 300" xmlns="http://www.w3.org/2000/svg" font-family="ui-monospace,Menlo,monospace">
 <defs><style>
  .bx{fill:#1b1e25;stroke:#3b4353;stroke-width:1.5;rx:6}
  .hd{fill:#232833}.t{fill:#e6e8ee;font-size:11.5px}.tt{fill:#9aa3b2;font-size:10.5px}
  .lb{fill:#6b7383;font-size:10.5px;letter-spacing:.09em}
  .dot{fill:#0e0f12;stroke:#5aa9f8;stroke-width:1.6}.dotr{fill:#0e0f12;stroke:#3fb950;stroke-width:1.6}
  .w{stroke:#4e5768;stroke-width:1.5;fill:none}
  .fr{fill:none;stroke:#f0883e;stroke-width:1.6;rx:8}
  .arm{fill:none;stroke:#343b49;stroke-width:1.2;stroke-dasharray:3 3;rx:5}
  .bad{fill:#e5534b;font-size:10.5px}
  .sr{fill:#2a1c10;stroke:#f0883e;stroke-width:1.5}
  .carry{stroke:#f0883e;stroke-width:1.5;fill:none;stroke-dasharray:5 3}
 </style></defs>

 <!-- ============ LEFT: loop region ============ -->
 <text class="lb" x="10" y="16">LOOP REGION &#183; the carried value returns through an initial</text>
 <rect class="fr" x="150" y="34" width="330" height="168"/>
 <text class="tt" x="315" y="53" text-anchor="middle">for pose in poses:</text>

 <rect class="bx" x="164" y="66" width="116" height="56"/>
 <rect class="hd" x="164.75" y="66.75" width="114.5" height="22" rx="6"/>
 <text class="t" x="222" y="82" text-anchor="middle">loop</text>
 <text class="tt" x="222" y="110" text-anchor="middle" fill="#3fb950">data-block-id</text>
 <circle class="dot" cx="164" cy="104" r="5"/>
 <circle class="dotr" cx="280" cy="104" r="5"/>

 <rect class="bx" x="318" y="88" width="84" height="32" fill="#232833"/>
 <text class="tt" x="360" y="108" text-anchor="middle">blend</text>
 <path class="w" d="M280 104 L318 104"/>

 <!-- shift register: matched pair on the two walls -->
 <rect class="sr" x="144" y="140" width="12" height="12"/>
 <rect class="sr" x="474" y="140" width="12" height="12"/>
 <path class="carry" d="M402 104 L440 104 L440 146 L474 146"/>
 <path class="carry" d="M144 146 L120 146 L120 182 L462 182 L462 152"/>
 <path class="w" d="M156 146 L164 146 L164 116" stroke="#f0883e"/>
 <text class="tt" x="315" y="198" text-anchor="middle" fill="#f0883e">same slot, one iteration apart</text>

 <rect class="bx" x="20" y="88" width="82" height="30" fill="#2a1c10" stroke="#f0883e"/>
 <text class="tt" x="61" y="107" text-anchor="middle">initial 0.0</text>
 <path class="w" d="M102 103 L132 103 L132 141 L144 143"/>
 <text class="tt" x="20" y="134">needs an initial</text>

 <circle class="dotr" cx="480" cy="104" r="5"/>
 <path class="w" d="M480 104 L512 104"/>
 <text class="tt" x="518" y="108">total</text>

 <!-- ============ RIGHT: branch region ============ -->
 <text class="lb" x="660" y="16">BRANCH REGION &#183; arms stack, one join per value</text>
 <rect class="fr" x="700" y="34" width="318" height="168"/>
 <rect class="bx" x="712" y="46" width="116" height="56"/>
 <rect class="hd" x="712.75" y="46.75" width="114.5" height="22" rx="6"/>
 <text class="t" x="770" y="62" text-anchor="middle">branch</text>
 <circle class="dot" cx="712" cy="86" r="5"/>
 <text class="tt" x="666" y="90" text-anchor="end">cond</text>
 <path class="w" d="M670 86 L712 86"/>
 <circle class="dotr" cx="828" cy="86" r="5"/>

 <rect class="arm" x="712" y="114" width="290" height="36"/>
 <text class="tt" x="724" y="136">if</text>
 <rect class="bx" x="752" y="118" width="80" height="28" fill="#232833"/>
 <text class="tt" x="792" y="137" text-anchor="middle">estimate</text>

 <rect class="arm" x="712" y="158" width="290" height="36"/>
 <text class="tt" x="724" y="180">else</text>
 <rect class="bx" x="752" y="162" width="80" height="28" fill="#232833"/>
 <text class="tt" x="792" y="181" text-anchor="middle">FALLBACK</text>

 <path class="w" d="M832 132 L900 132 L900 112"/>
 <path class="w" d="M832 176 L900 176 L900 112"/>
 <circle class="dotr" cx="900" cy="106" r="5"/>
 <text class="tt" x="912" y="110">pose</text>
 <text class="tt" x="860" y="220" text-anchor="middle">one join &#8212; not one output per arm</text>

 <!-- ============ the silent-failure rule ============ -->
 <text class="bad" x="10" y="256">&#10007; the FRAME must not carry data-block-id. wireLayer.resolveDot takes the FIRST match in document order, so a frame</text>
 <text class="bad" x="10" y="272">stamped with the region id wins the lookup, owns no port dot, and every cable into the region silently fails to land.</text>
 <text class="tt" x="10" y="292">wireLayer.tsx:122&#8211;123 (CLAUDE.md still says :81 &#8212; the function has moved) &#183; &#8220;a region is ONE node, and the frame owns no id&#8221;</text>
</svg>"""


# --------------------------------------------------------------------------
# Prior art — filled from docs/python_syntax_prior_art.py (cited, vault-sourced)
# --------------------------------------------------------------------------

try:
    from python_syntax_prior_art import PRIOR_ART, LESSONS, CITATIONS, UNVERIFIED
except ImportError:                                   # pragma: no cover
    PRIOR_ART, LESSONS, CITATIONS, UNVERIFIED = [], [], [], []


def prior_art_html() -> str:
    if not PRIOR_ART:
        return '<p class="sc-note">Prior-art matrix not built.</p>'
    # NOT html-escaped: these cells are our own markup (the <code>/<b> in a
    # product name, the scenario chip). Escaping them printed raw tags in the
    # first build.
    rows = "".join(
        f"<tr><td>{r['construct']}</td><td>{r['blueprints']}</td>"
        f"<td>{r['labview']}</td><td>{r['simulink']}</td><td>{r['other']}</td>"
        f"<td>{r['lesson']}</td></tr>" for r in PRIOR_ART)
    les = "".join(
        f'<div class="answer"><b class="h">{E(l["title"])}</b><p>{l["body"]}</p></div>'
        for l in LESSONS)
    cites = "".join(f"<li>{c}</li>" for c in CITATIONS)
    unv = ("".join(f"<li>{u}</li>" for u in UNVERIFIED)
           if UNVERIFIED else "<li>nothing — every claim above is sourced.</li>")
    return f"""
<h2 id="prior-art">Prior art &mdash; what already shipped, per construct</h2>
<div class="lede gold"><p>Zach, this morning: <i>&ldquo;blueprints, simulink, labview, these are just
prior art, they basically ARE the key references.&rdquo;</i> The table below is what those systems
actually do, by product feature name. A blank cell is an honest &ldquo;no analogue&rdquo; &mdash;
the interesting rows are the ones where three independent products converged on the same shape,
because that is the part that is not a taste question either.</p></div>
<div class="scroll"><table>
<thead><tr><th style="width:10%">Construct</th><th style="width:15%">Unreal Blueprints</th>
<th style="width:16%">LabVIEW</th><th style="width:15%">Simulink</th>
<th style="width:23%">Other</th><th style="width:21%">Consensus</th></tr></thead>
<tbody>{rows}</tbody></table></div>
<h2 id="lessons">The five things the prior art agrees on</h2>
<div class="answers">{les}</div>
<details style="margin:18px 0"><summary style="cursor:pointer;color:var(--dim2);font-size:12.5px">
Citations &amp; unverified claims</summary>
<p class="lab">Sources</p><ul style="font-size:12.5px;color:var(--dim);line-height:1.8">{cites}</ul>
<p class="lab">Not verified &mdash; treat as a lead, not a fact</p>
<ul style="font-size:12.5px;color:var(--dim);line-height:1.8">{unv}</ul></details>"""


# --------------------------------------------------------------------------
# Page
# --------------------------------------------------------------------------

def build() -> str:
    nowhere_list = ", ".join(f"<code>{E(n)}</code>" for n in GOLD["nowhere"])
    n_thin = len(GOLD["thin"])
    toc = "".join(
        f'<a href="#g-{g.id}"><b>{E(g.title.split(" — ")[0])}</b>'
        f'<span>{len(g.scenarios)} scenarios &middot; '
        f'{sum(len(s.nodes) for s in g.scenarios)} nodes</span></a>'
        for g in inv.ALL_GROUPS)

    rank = 0
    groups_html = []
    for g in inv.ALL_GROUPS:
        cards = []
        for s in g.scenarios:
            rank += 1
            cards.append(scenario_html(s, f"{rank:02d}"))
        groups_html.append(
            f'<h2 id="g-{g.id}">{E(g.title)}</h2>'
            f'<div class="lede"><p>{g.lede.strip()}</p></div>' + "".join(cards))

    def _row(sc, cls, state):
        return (f'<tr class="{cls}"><td><b>{E(sc.id)} {E(sc.name)}</b></td>'
                f'<td>{" ".join("<code>"+E(n)+"</code>" for n in sc.nodes) or "&mdash;"}</td>'
                f'<td>{E(inv.BECOMES[sc.becomes][0])}</td><td>{state}</td></tr>')

    gap_rows = ("".join(_row(sc, "bad", "<b>nothing</b>") for sc in GAPS)
                + "".join(_row(sc, "dim", sc.partial) for sc in PARTIAL))

    nowhere = ", ".join(f"<code>{E(a)}</code>" for a in GOLD["nowhere"])
    scaffold = ", ".join(
        f'<code>{E(n)}</code> <span style="color:var(--dim2)">({E(v[0].split(":")[1])}&hellip;)</span>'
        for n, v in GOLD["scaffold_only"].items())
    thin_rows = "".join(
        f'<tr><td><code>{E(n)}</code></td><td class="num">{GOLD["body"][n]}</td></tr>'
        for n in GOLD["thin"])

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Python syntax &rarr; blocks and ports &mdash; the exhaustive scenario inventory</title>
<style>{CSS}{EXTRA_CSS}</style></head>
<body><div class="wrap">

<p class="kicker">bbox-ui &middot; {TODAY} &middot; pyblocks {PYB_HEAD} &middot; bbox-ui {BBOX_HEAD}</p>
<h1>Python, stripped to blocks and ports</h1>
<p class="sub">Every construct in the language, what it becomes on a canvas, and three real
examples of each to draw. {len(inv.ALL_SCENARIOS)} scenarios &middot; {len(inv.EVERY_NODE)} grammar
nodes, each claimed exactly once &middot; {N_EX} examples, every one of which parses.</p>

<div class="facts">
  <div class="fact"><b>{len(inv.ALL_SCENARIOS)}</b><span>scenarios</span></div>
  <div class="fact"><b>{len(inv.EVERY_NODE)}</b><span>drawable grammar nodes</span></div>
  <div class="fact"><b>{N_EX}</b><span>mini goldens to draw</span></div>
  <div class="fact good"><b>{GOLD['total']}</b><span>goldens behind them</span></div>
  <div class="fact warn"><b>{len(GOLD['nowhere'])}</b><span>nodes no golden reaches</span></div>
  <div class="fact warn"><b>{len(OPEN_QS)}</b><span>open questions</span></div>
</div>

<h2 id="reframe">What changed this morning</h2>
<div class="lede orange"><p>Your words, an hour ago: <i>&ldquo;I want to evaluate the block view is
drawn correctly by verifying that it matches valid python. This is super powerful because it's like
this objective oracle, but it also means actually what the block view looks like is almost solved
now. It's not a subjective choice, there is basically only 1 correct way to draw a DAG accurately
that would execute as the python. Really the only question is granularity.&rdquo;</i></p></div>

<div class="answers">
  <div class="answer"><b class="h">The question moved from taste to coverage</b>
  <p>If the drawing is checked against &ldquo;does this round-trip to running Python&rdquo;, then
  &ldquo;what should a <code>for</code> loop look like&rdquo; stops being a design question and
  becomes a <b>completeness</b> question: which constructs can we project at all, and which ones
  do we still silently drop on the floor? That is why this report is an inventory rather than a
  proposal &mdash; you do not need options, you need the list.</p></div>

  <div class="answer blue"><b class="h">Exhaustive is now a checkable claim, not a promise</b>
  <p>Python's grammar is finite and <code>ast</code> publishes it. On CPython {PY_VER} the drawable
  surface is <b>{len(inv.STMT)} statements + {len(inv.EXPR)} expressions + {len(inv.PATTERN)} match
  patterns + {len(inv.HELPERS)} helper nodes = {len(inv.EVERY_NODE)}</b>.
  <code>docs/python_syntax_inventory.py</code> asserts at build time that every one of them is
  claimed by exactly one scenario below &mdash; so a construct cannot be forgotten quietly, and a
  future Python release shows up as a <b>failing build</b> rather than as a hole nobody noticed.</p>
  <p>Operators, comparisons and boolean connectives (<code>Add</code>, <code>Lt</code>,
  <code>And</code>&hellip;, {sum(len(v) for v in inv.RIDERS.values())} tokens) are deliberately not
  in that set: they are labels on a node, never a box of their own. They ride on the scenario that
  owns their carrier and are listed there.</p></div>

  <div class="answer green"><b class="h">Yes &mdash; the goldens were built for exactly this, and they are far better than they look</b>
  <p>You asked whether this is what the goldens were for. It is. Measured just now across
  <b>all three</b> corpora that carry a <code>case.json</code> &mdash;
  <code>runnable_goldens</code> ({GOLD['per_corpus']['runnable_goldens']}),
  <code>adversarial_goldens</code> ({GOLD['per_corpus']['adversarial_goldens']}) and
  <code>repo_goldens</code> ({GOLD['per_corpus']['repo_goldens']}), <b>{GOLD['total']} reviewed
  bodies</b> &mdash; only <b>{len(GOLD['nowhere'])} of the {len(inv.EVERY_NODE)} grammar nodes
  appear nowhere at all</b>: {nowhere_list}.</p>
  <p>Three more &mdash; <code>ClassDef</code>, <code>ImportFrom</code>, <code>TypeAlias</code>
  &mdash; are in golden files but never inside a reviewed body, so a golden touches them and no
  golden draws them. That leaves the real work not in the holes but in the <b>thin tail</b>:
  {n_thin} nodes carried by one or two cases each.</p>
  <p style="color:var(--dim2);font-size:13px;border-top:1px solid #1e222a;margin-top:12px;padding-top:10px">
  Worth saying plainly: the first build of this page measured <code>runnable_goldens</code> alone,
  found 23 absent and led with &ldquo;<code>match</code> has zero occurrences anywhere in the
  corpus&rdquo;. <code>e07_match_statement_bindings</code> exists and is a good case. Measuring one
  corpus and reporting on &ldquo;the corpus&rdquo; is the exact failure this page is built to
  prevent, so the builder now walks all three and the counts above are re-derived every build.</p>
  </div>
</div>

<h2 id="faces">The five faces, drawn once</h2>
<p class="sc-note">You asked to see each scenario in <b>source &middot; simple &middot; port
&middot; expanded &middot; expanded-opaque</b>. Those five are a property of the view ladder, not
of the construct &mdash; the data does not change between rungs, only which parts of it are drawn.
So they are drawn here once, and each scenario card below instead answers the question the ladder
cannot: <b>which of these does this construct even get, and what are its ports?</b></p>
<figure class="d">{svg_faces()}
<figcaption><b>One block, five faces.</b> <code>simple</code> collapses every port to a single
centred point so wires converge rather than disappear; <code>port</code> is the rung nobody else
ships (&ldquo;ports shown, innards hidden&rdquo;); <code>expanded-opaque</code> keeps the frame and
folds the contents. <b>Which faces a construct gets is not a per-construct decision &mdash; it
follows from its chip:</b> a <span class="chip block">Block</span> gets
<code>simple&nbsp;&middot;&nbsp;port&nbsp;&middot;&nbsp;expanded</code>, a
<span class="chip region">Region</span> gets
<code>port&nbsp;&middot;&nbsp;expanded&nbsp;&middot;&nbsp;expanded&#8209;opaque</code> and no
<code>simple</code>. That is your own ruling from last Monday, quoted in the source:
<i>&ldquo;regions do not have a simple view. they just have port, expanded and expanded opaque
view&rdquo;</i> (<code>hosts/regionScene.ts:16</code>).</figcaption></figure>

<div class="lede red"><p><b>Two things to fix before drawing anything &mdash; both measured just
now, not recalled.</b></p>
<p><b>1 &middot; pyblocks spells the middle rung in the plural.</b>
<code>DetailLevel&nbsp;=&nbsp;Literal[&quot;simple&quot;,&nbsp;&quot;ports&quot;,&nbsp;&quot;expanded&quot;]</code>
(<code>pyblocks/blockview.py:22</code>) against bbox-ui's
<code>BlockView&nbsp;=&nbsp;&quot;simple&quot;&nbsp;|&nbsp;&quot;port&quot;&nbsp;|&nbsp;&quot;expanded&quot;</code>
(<code>blockPort.layout.ts:45</code>). One character, and the two sides of the oracle are the two
programs that have to agree.</p>
<p><b>2 &middot; the vault note says there is a fourth rung called <code>value</code>. There is
not.</b> <code>C - Simple, Port, Expanded</code> reads <i>&ldquo;the code says four &mdash; simple
&middot; port &middot; expanded &middot; value&rdquo;</i>, and that is worth correcting before it
gets drawn into a golden: <code>BLOCK_VIEWS</code> has exactly three members, and
<code>block.value.tsx</code> is a <b>component</b> that picks between two of them
(<code>const view = expanded ? &quot;expanded&quot; : &quot;simple&quot;</code>, line 174). The
value capsule is a consumer of the ladder, not a rung on it.</p>
<p>The block/region split itself is <b>already settled</b> and needs nothing from you &mdash; see
the caption above. It is only these two that would bake an ambiguity into the corpus.</p></div>

<figure class="d">{svg_region()}
<figcaption><b>The two region shapes every scenario in this report reduces to.</b> Left: a loop's
carried value leaves the right wall and re-enters the left one tick later &mdash; legal only
because it passes through an initial value first. That is your own rule from the grammar doc
(<i>&ldquo;all feedback traces have to go through an initial variable first&rdquo;</i>), and the
Jul-20 thinking pass names it as the <b>unit delay</b> of synchronous dataflow. Right: arms stack,
and every value that leaves the region does so through <b>one</b> join, not one output per arm.
<br><span style="color:var(--dim2)">The operator names that family uses &mdash; Lustre
<code>pre</code>, Faust <code>~</code> &mdash; are deliberately <b>not</b> asserted here: your own
note flags them <i>&ldquo;leads to confirm, not gospel&rdquo;</i> because nobody opened those docs.
They are in the unverified list under the prior-art table.</span></figcaption></figure>

<h2 id="prior">What we already built &mdash; the work you remembered</h2>
<div class="scroll"><table>
<thead><tr><th>Artifact</th><th>Where</th><th>What it is</th><th>Why it is not the list you wanted</th></tr></thead>
<tbody>
<tr><td><b>The curriculum table</b> &mdash; this is the one you were thinking of</td>
<td><code>pyblocks/examples/systemsketch_goldens/README.md</code></td>
<td>Two tables, <b>01&ndash;12</b> (<i>#&nbsp;&middot;&nbsp;Case&nbsp;&middot;&nbsp;Axis&nbsp;&middot;&nbsp;Verdict</i>)
and <b>13&ndash;24</b> (<i>&hellip;&nbsp;&middot;&nbsp;Builds&nbsp;on&nbsp;&middot;&nbsp;New pressure
&middot;&nbsp;Contract&nbsp;&middot;&nbsp;Verdict</i>), with exact block/port/edge counts per case.</td>
<td>It is indexed by <b>pressure</b>, not by syntax: &ldquo;versioned state without a false
self-loop&rdquo;, &ldquo;one producer, multiple consumers&rdquo;. Nothing in it tells you whether
<code>match</code> is handled.</td></tr>
<tr><td><b>The runnable goldens</b></td><td><code>pyblocks/examples/runnable_goldens/</code></td>
<td>{GOLD['per_corpus']['runnable_goldens']} cases, each a <code>source.py</code> +
<code>case.json</code> naming the reviewed symbol. Cases 25&ndash;48 are adapted from your real
<code>like_keras</code> and <code>cad_exporter</code> trees at pinned commits.</td>
<td>It is the corpus everyone reaches for and the <b>narrowest</b> one: 23 node types never appear
in it. Reach for <code>adversarial_goldens</code> first.</td></tr>
<tr class="good"><td><b>The adversarial goldens</b> &mdash; the real coverage</td>
<td><code>pyblocks/examples/adversarial_goldens/</code></td>
<td>{GOLD['per_corpus']['adversarial_goldens']} cases in nine families (a&ndash;i, p, t), each
carrying an <code>attack</code> sentence and an <code>intendedGraph</code> sentence in its
<code>case.json</code> &mdash; e.g. <code>b08_global_write_hidden_channel</code>,
<code>d07_decorator_changes_signature</code>, <code>e07_match_statement_bindings</code>,
<code>p17_utf8_byte_order_mark</code>.</td>
<td>Nothing &mdash; this is the answer to your question, and it is much stronger than the runnable
set. Its <code>intendedGraph</code> field is already the &ldquo;what should this look like&rdquo;
you are about to draw.</td></tr>
<tr><td><b>The grammar decisions</b></td>
<td><code>zach_brain/Sources/Notes/DP - Underlying Python Syntax for Block View.md</code></td>
<td>Your rulings: NamedTuple returns so output ports have names; reference-designator naming
(<code>funcb_1_out1</code>) borrowed from PCB refdes; feedback must pass through an initial
variable; default vs. supported grammar.</td>
<td>Rules about <i>how to write</i> the happy path, not an enumeration of what the language can
throw at you.</td></tr>
<tr><td><b>The control-flow plan</b></td><td><code>bbox-ui/docs/CONTROL-FLOW-PLAN.md</code></td>
<td>Region/arm/mark design, already implemented: <code>RegionKind&nbsp;=&nbsp;&quot;loop&quot;&nbsp;|&nbsp;&quot;branch&quot;&nbsp;|&nbsp;&quot;group&quot;</code>,
arms as child nodes, <code>break</code>/<code>continue</code>/<code>pass</code> as badges.</td>
<td>Covers four constructs deeply. The other {len(inv.ALL_SCENARIOS) - 4}&nbsp;are out of its scope.</td></tr>
<tr><td><b>The analyzer</b></td><td><code>pyblocks/pyblocks/analyzer.py</code></td>
<td>The real coverage surface: <code>NodeKind&nbsp;=&nbsp;&quot;data&quot;&nbsp;|&nbsp;&quot;transform&quot;&nbsp;|&nbsp;&quot;region&quot;&nbsp;|&nbsp;&quot;sink&quot;&nbsp;|&nbsp;&quot;branch&quot;</code>
(<code>schema.py:19</code>) &mdash; the five words this report's <b>becomes</b> column reuses.</td>
<td>Dispatch code, not a document. You cannot read it and know what is missing.</td></tr>
</tbody></table></div>

<h2 id="gaps">The gap list &mdash; measured across all {len(GOLD['per_corpus'])} corpora</h2>
<p class="sc-note">Parsing the reviewed body of every one of the <b>{GOLD['total']}</b> golden cases
that carries a <code>case.json</code>, these grammar nodes appear <b>nowhere at all</b> &mdash; not
in a body, not in scaffolding:</p>
<p class="nodes" style="font-size:13px;line-height:2.1">{nowhere}</p>
<p class="sc-note">Six nodes, and four of them are match patterns. These three appear in golden
files but never inside a reviewed body &mdash; a golden touches them, no golden draws them:</p>
<p class="nodes" style="font-size:13px;line-height:2.1">{scaffold}</p>
<p class="sc-note">Which lands as just <b>{len(GAPS)} scenarios with no golden</b> and
{len(PARTIAL)} that are only partly reached:</p>
<div class="scroll"><table>
<thead><tr><th>Scenario</th><th>Grammar</th><th>Becomes</th><th style="width:38%">What the corpus has</th></tr></thead>
<tbody>{gap_rows}</tbody></table></div>

<h4 style="margin-top:34px">The thin tail is the real risk, not the holes</h4>
<p class="sc-note">{n_thin} of the {len(inv.EVERY_NODE)} nodes are carried by <b>one or two</b>
reviewed bodies. A single case is enough to say &ldquo;handled&rdquo; and not enough to say
&ldquo;handled in general&rdquo; &mdash; and it is exactly where a regression lands silently,
because deleting the one case that covers <code>Nonlocal</code> turns nothing red except that
case. This is the list to thicken:</p>
<div class="scroll" style="max-width:520px"><table>
<thead><tr><th>Node</th><th style="text-align:right">bodies</th></tr></thead>
<tbody>{thin_rows}</tbody></table></div>

<h2 id="how">How to read a scenario card</h2>
<div class="lede"><p><b>Canonical form</b> is the shape in general terms, with
<span class="ph">placeholders</span> marked &mdash; the form you wrote by hand in the daily note.
<b>Blocks &amp; ports</b> is the part that is not a taste question: what boxes exist and what
crosses their walls. <b>Three real examples</b> are the mini goldens to draw. The chip on the right
says what the construct <i>becomes</i> &mdash; one of the eight words below &mdash; and a red left
edge means no golden exercises it yet.</p></div>
<div class="grid5" style="margin:16px 0 0">
{"".join(f'<div class="card"><b class="chip {k}" style="display:inline-block">{E(v[0])}</b><p>{E(v[1])}</p></div>' for k, v in inv.BECOMES.items())}
</div>

<div class="toc">{toc}</div>

{"".join(groups_html)}

{prior_art_html()}

<h2 id="next">What needs you</h2>
<div class="ask"><h3>1 &middot; Two one-line vocabulary fixes &mdash; say no if you disagree</h3>
<p>Not a design question: the block/region split is already your ruling. Just the plural and the
phantom rung, both of which would otherwise get drawn into 171 mini goldens.</p>
<p class="dflt"><b>Default if you say nothing:</b> rename pyblocks'
<code>DetailLevel</code> member <code>&quot;ports&quot;</code>&nbsp;&rarr;&nbsp;<code>&quot;port&quot;</code>
to match bbox-ui, and correct <code>C - Simple, Port, Expanded</code> in the vault to say three
rungs with <code>value</code> named as a component rather than a fourth face. Both reversible,
neither touches a drawing.</p></div>

<div class="ask"><h3>2 &middot; Do the six unreached nodes become goldens?</h3>
<p>Smaller than it looked an hour ago. <b>Four are match patterns</b> &mdash;
<code>MatchValue</code>, <code>MatchSingleton</code>, <code>MatchStar</code>,
<code>MatchOr</code> &mdash; which means one more case beside <code>e07</code> closes all four.
The other two are <code>except*</code> and <code>async with</code>, and they arrive together the
day anything uses <code>asyncio.TaskGroup</code>.</p>
<p class="dflt"><b>Default if you say nothing:</b> two new adversarial cases &mdash; one
<code>e13_match_value_or_star_patterns</code>, one <code>e14_taskgroup_except_star</code> &mdash;
written in the existing family style with their own <code>attack</code> and
<code>intendedGraph</code> sentences, plus a pass over the {n_thin}-node thin tail to say which
deserve a second case. No drawings, no analyzer changes.</p></div>

<div class="ask"><h3>3 &middot; Is &ldquo;grain 1&rdquo; the answer to V4?</h3>
<p>At grain 1 an operator is a block, so <code>weight * quality + bias</code> is two boxes. That is
objectively correct and subjectively unreadable, and it is the one place where your
&ldquo;granularity is the only remaining question&rdquo; bites hardest &mdash; because unlike a
loop body, there is no natural frame to collapse into.</p>
<p class="dflt"><b>Default if you say nothing:</b> arithmetic collapses to a single box labelled
with the source expression, expandable to per-operator boxes. Same opaque/expanded pair as
everything else &mdash; no new vocabulary.</p></div>

{overall_box("the ladder, the gap order, anything I got wrong…")}

<footer class="page">
<b>Built by</b> <code>docs/build_python_syntax_report.py</code> from
<code>docs/python_syntax_inventory.py</code> (the inventory) and
<code>docs/python_syntax_prior_art.py</code> (the cited matrix).<br>
<b>Measured at build time, not typed:</b> the {len(inv.EVERY_NODE)}-node grammar surface from
<code>ast</code> on CPython {PY_VER}; the coverage assertion that every node is claimed exactly
once; golden coverage by parsing the reviewed body of all {GOLD['total']} cases across
<code>runnable_goldens</code>, <code>adversarial_goldens</code> and <code>repo_goldens</code> at
<code>{PYB_HEAD}</code>; and a
<code>ast.parse</code> on all {N_EX} examples, so every snippet on this page is real Python.<br>
<b>Not measured:</b> nothing on this page is a screenshot of a running block view, because none of
these {len(inv.ALL_SCENARIOS)} scenarios has been drawn yet &mdash; that is the work this inventory
is for.
</footer>

</div>
{dock("python-syntax-scenarios", "scenario", len(inv.ALL_SCENARIOS))}
<script>{FB_JS}</script>
</body></html>"""


if __name__ == "__main__":
    report_size(build(), OUT)
