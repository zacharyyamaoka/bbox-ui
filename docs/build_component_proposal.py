#!/usr/bin/env python3
"""Build the bbox-ui component proposal — two pages from one source.

  LIGHT  -> <branch>/reports/bbox-ui-component-proposal-2026-09-10.html  (tracked, no captures)
  HEAVY  -> /home/bam/bbox-ui/reports/media/bbox-ui-component-proposal-2026-09-10.html (ignored)

Every number printed on the page is MEASURED from the tree at build time, through
need()/count helpers that raise if the thing they measure has moved.  A report
that cannot drift from the code it describes is the only kind worth writing.

    python3 docs/build_component_proposal.py
"""
from __future__ import annotations

import base64
import io
import json
import os
import re
import sys
from datetime import date
from pathlib import Path

DATE = "2026-09-10"
BBOX_MAIN = Path("/home/bam/bbox-ui")
CODE_FIELD = BBOX_MAIN / ".claude/worktrees/code-field"
SS = Path("/home/bam/systemsketch")
BOARD = Path("/home/bam/SystemSketch/bbox-ui-v3-2pm-sep-10-2026.systemsketch")
MEDIA = BBOX_MAIN / "reports/media/component-proposal"
HERE = Path(__file__).resolve().parent
BRANCH_ROOT = HERE.parent

MAX_W = 900          # downscale captures to this width
LIGHT_CAP = 256 * 1024


# ----------------------------------------------------------------- measuring
class Drift(RuntimeError):
    pass


def need(path: Path) -> str:
    if not path.exists():
        raise Drift(f"missing, so a number on the page would be invented: {path}")
    return path.read_text(encoding="utf-8", errors="replace")


def need_one(text: str, pattern: str, label: str) -> str:
    hits = re.findall(pattern, text, re.M)
    if len(hits) != 1:
        raise Drift(f"{label}: expected 1 match for {pattern!r}, got {len(hits)}")
    return hits[0]


def braced(text: str, marker: str) -> str:
    """The `{...}` block that starts at `marker`, balanced."""
    i = text.index(marker)
    j, depth = i, 0
    while True:
        if text[j] == "{":
            depth += 1
        elif text[j] == "}":
            depth -= 1
            if depth == 0:
                return text[i:j + 1]
        j += 1


def top_keys(block: str) -> list[str]:
    return re.findall(r"^\t([A-Za-z_][A-Za-z0-9_]*)\s*[?:]", block, re.M)


def measure() -> dict:
    m: dict = {}

    # --- bbox-ui registry -------------------------------------------------
    reg = json.loads(need(BBOX_MAIN / "registry.json"))
    m["registry_items"] = [i["name"] for i in reg["items"]]
    m["registry_count"] = len(m["registry_items"])

    cf_reg_path = CODE_FIELD / "registry.json"
    if cf_reg_path.exists():
        cf = json.loads(cf_reg_path.read_text())
        m["code_field_items"] = [i["name"] for i in cf["items"] if i["name"] not in m["registry_items"]]
    else:
        m["code_field_items"] = []

    # --- core exports -----------------------------------------------------
    core = BBOX_MAIN / "packages/bbox-ui/src"
    block_tsx, port_tsx = need(core / "block.tsx"), need(core / "port.tsx")
    m["core_components"] = sorted(set(
        re.findall(r"^export function ([A-Z][A-Za-z0-9]*)", block_tsx, re.M)
        + re.findall(r"^export function ([A-Z][A-Za-z0-9]*)", port_tsx, re.M)
    ))
    layout = need(core / "layout.ts")
    m["layout_exports"] = len(re.findall(r"^export (?:const|function|type|interface) ", layout, re.M))
    m["text_sizes"] = need_one(layout, r"^export const TEXT_SIZES = (\{[^}]*\})", "TEXT_SIZES")
    m["port_diameters"] = need_one(layout, r"^export const PORT_DIAMETERS = (\{[^}]*\})", "PORT_DIAMETERS")
    m["icon_ratio"] = need_one(layout, r"^export const ICON_RATIO = ([0-9.]+)", "ICON_RATIO")
    m["simple_block"] = need_one(layout, r"^export const SIMPLE_BLOCK = (\{[^}]*\})", "SIMPLE_BLOCK")

    # --- the inspector schema that already exists -------------------------
    insp_dir = BBOX_MAIN / "packages/inspector/src/inspector"
    model = need(insp_dir / "inspectorModel.ts")
    m["inspector_model_lines"] = model.count("\n") + 1
    m["inspector_panel_lines"] = need(insp_dir / "Inspector.tsx").count("\n") + 1
    kinds_block = need_one(model, r"export type ControlKind =\n((?:\s*\|\s*'[a-z]+'\n)+)", "ControlKind")
    m["control_kinds"] = re.findall(r"'([a-z]+)'", kinds_block)
    m["control_sources"] = re.findall(r"'([a-z]+)'", need_one(
        model, r"export type ControlSource = (.+)$", "ControlSource"))
    ctl = braced(model, "export interface InspectorControl {")
    m["inspector_control_fields"] = re.findall(r"^\t([A-Za-z_][A-Za-z0-9_]*)\??:", ctl, re.M)
    m["inspector_files"] = sum(1 for p in (BBOX_MAIN / "packages/inspector/src").rglob("*")
                               if p.suffix in {".ts", ".tsx"})
    pkg = json.loads(need(BBOX_MAIN / "packages/inspector/package.json"))
    m["inspector_deps"] = pkg.get("dependencies", {})

    # --- SystemSketch, the donor -----------------------------------------
    bm = need(SS / "src/blocks/blockModel.ts")
    m["block_props"] = top_keys(braced(bm, "export const BLOCK_SHAPE_PROPS = {"))
    m["block_prop_count"] = len(m["block_props"])
    m["port_fields"] = top_keys(braced(bm, "export const BlockPort = T.object({"))
    m["port_field_count"] = len(m["port_fields"])
    m["block_views"] = re.findall(r"'([a-z]+)'", need_one(
        bm, r"^export const BLOCK_VIEWS = (\[[^\]]*\]) as const", "BLOCK_VIEWS"))
    m["ss_shape_types"] = sorted(set(re.findall(
        r"^export const [A-Z_]+_SHAPE_TYPE = '([a-zA-Z-]+)'",
        "\n".join(need(p) for p in SS.glob("src/**/*Model.ts")), re.M)))

    # --- the board itself -------------------------------------------------
    doc = json.loads(need(BOARD))
    shapes = [r for r in doc["records"] if r.get("typeName") == "shape"]
    counts: dict[str, int] = {}
    for s in shapes:
        counts[s["type"]] = counts.get(s["type"], 0) + 1
    m["board_records"] = len(doc["records"])
    m["board_shapes"] = len(shapes)
    m["board_by_type"] = dict(sorted(counts.items(), key=lambda kv: -kv[1]))
    m["board_texts"] = counts.get("text", 0)
    m["board_real_blocks"] = counts.get("block", 0) + counts.get("floating-port", 0)

    # --- captures ---------------------------------------------------------
    m["captures"] = sorted(p.name for p in MEDIA.glob("*.png"))
    return m


# ----------------------------------------------------------------- captures
def capture_data_uri(name: str) -> str | None:
    src = MEDIA / name
    if not src.exists():
        return None
    try:
        from PIL import Image
    except ImportError:
        return "data:image/png;base64," + base64.b64encode(src.read_bytes()).decode()
    im = Image.open(src).convert("RGB")
    if im.width > MAX_W:
        im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=78, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


# ------------------------------------------------------------------- mocks
# Unstyled = hairline border, system font, no colour.  The board's own idiom.

def glyph(px: int, dashed: bool = False) -> str:
    d = ' stroke-dasharray="3 3"' if dashed else ""
    return (f'<svg class="mk-glyph" width="{px}" height="{px}" viewBox="0 0 24 24" aria-hidden="true">'
            f'<rect x="1" y="1" width="22" height="22" fill="none" stroke="currentColor"{d}/>'
            f'<path d="M1 1 L23 23 M23 1 L1 23" stroke="currentColor" fill="none"/></svg>')


def tbox(text: str, fs: int = 13, pad: str = "6px 10px", font: str = "sans",
         align: str = "center", justify: str = "center", w: str = "auto", h: str = "auto") -> str:
    fam = {"sans": "var(--ui)", "mono": "var(--mono)", "sketch": "var(--sketch)"}[font]
    ai = {"top": "flex-start", "middle": "center", "bottom": "flex-end", "center": "center"}[align]
    ji = {"left": "flex-start", "middle": "center", "right": "flex-end", "center": "center"}[justify]
    return (f'<span class="mk-tb" style="font-size:{fs}px;padding:{pad};font-family:{fam};'
            f'align-items:{ai};justify-content:{ji};width:{w};height:{h}">{text}</span>')


def pill(text: str, dash: str = "solid", fill: str = "none") -> str:
    bg = {"none": "transparent", "semi": "var(--faint)", "solid": "var(--hair)"}[fill]
    return f'<span class="mk-pill" style="border-style:{dash};background:{bg}">{text}</span>'


def dot(state: str = "empty", px: int = 14) -> str:
    """The Port dot in each board state.  `hidden` renders nothing — that is the point."""
    if state == "hidden":
        return '<span class="mk-hidden" title="removed from layout, not hit-testable">—</span>'
    inner = ""
    if state == "value":
        inner = f'<i style="width:{px}px;height:{px}px;background:var(--hair);border-radius:50%"></i>'
    elif state == "wired":
        k = round(px * 0.5)
        inner = f'<i style="width:{k}px;height:{k}px;background:currentColor;border-radius:50%"></i>'
    elif state == "received":
        k = round(px * 0.5)
        inner = f'<i style="width:{k}px;height:{k}px;background:currentColor;border-radius:50%;outline:3px solid var(--faint)"></i>'
    op = ";opacity:.4" if state == "blur" else ""
    return (f'<span class="mk-dot" style="width:{px}px;height:{px}px{op}">{inner}</span>')


def lab(s: str) -> str:
    return f'<span class="mk-lab">{s}</span>'


def specimen(caption: str, body: str) -> str:
    return f'<figure class="sp"><div class="sp-b">{body}</div><figcaption>{caption}</figcaption></figure>'


def strip(items: list[str]) -> str:
    return '<div class="strip">' + "".join(items) + "</div>"


def blk(header: str = "", body: str = "", footer: str = "", w: int = 190, h: int | None = None,
        hdiv: bool = True, fdiv: bool = True, cls: str = "") -> str:
    sty = f"width:{w}px" + (f";height:{h}px" if h else "")
    parts = []
    if header:
        parts.append(f'<div class="bk-h{"" if hdiv else " no-rule"}">{header}</div>')
    parts.append(f'<div class="bk-b">{body}</div>')
    if footer is not None and footer != "":
        parts.append(f'<div class="bk-f{"" if fdiv else " no-rule"}">{footer}</div>')
    elif footer == "":
        pass
    return f'<div class="bk {cls}" style="{sty}">' + "".join(parts) + "</div>"


def simple_card(title: str, typ: str = "", desc: str = "", ic: bool = False,
                badges: int = 0, tools: bool = False, centre: str = "", w: int = 170) -> str:
    b = ""
    if badges:
        b = '<div class="bk-badges">' + "".join(pill("Draft 1") for _ in range(badges)) + "</div>"
    t = (glyph(13) + " " if ic else "") + f'<b class="bk-title">{title}</b>'
    if centre == "icon":
        mid = f'<div class="ctr">{glyph(20)}<b class="bk-title">{title}</b>' + \
              (f'<span class="bk-desc">{desc}</span>' if desc else "") + '</div>'
    elif centre == "type":
        mid = f'<div class="ctr"><b class="bk-title">{title}</b><span class="bk-type">{typ}</span></div>'
    else:
        mid = f'<div class="ctr">{t}' + (f'<span class="bk-desc">{desc}</span>' if desc else "") + '</div>'
    foot = f'<span class="bk-type">{typ}</span>' if typ and centre != "type" else "&nbsp;"
    tool = '<div class="bk-tools">' + glyph(10) + "</div>" if tools else ""
    return (f'<div class="bk simple" style="width:{w}px">{b}{tool}{mid}'
            f'<div class="bk-foot">{foot}</div></div>')


def port_row(name: str, typ: str, side: str = "in", st: str = "empty", offset: bool = False) -> str:
    d = dot(st)
    lb = f'<span class="pr-n">{name}</span> <span class="pr-t">{typ}</span>'
    if side == "in":
        return f'<div class="pr{" off" if offset else ""}">{d}{lb}</div>'
    return f'<div class="pr r{" off" if offset else ""}">{lb}{d}</div>'


def port_block(ins: list[tuple], outs: list[tuple], title: str = "Title", typ: str = "Type",
               w: int = 210, offset: bool = False, more: str = "", hdiv: bool = True,
               fdiv: bool = True, fold: str = "", header_extra: str = "") -> str:
    chev = f'<span class="chev">{"▾" if fold == "down" else "▸"}</span>' if fold else ""
    head = (f'{chev}{glyph(11)} <b class="bk-title sm">{title}</b>{header_extra}'
            f'<span class="bk-type sm">{typ}</span>')
    rows = '<div class="prs">'
    n = max(len(ins), len(outs))
    for i in range(n):
        li = port_row(*ins[i], side="in", offset=offset) if i < len(ins) else '<div class="pr"></div>'
        ro = port_row(*outs[i], side="out", offset=offset) if i < len(outs) else '<div class="pr r"></div>'
        rows += f'<div class="prline">{li}{ro}</div>'
    if more:
        rows += f'<div class="prline"><div class="pr"><span class="more">{more}</span></div><div class="pr r"></div></div>'
    rows += "</div>"
    body = "" if fold == "up" else rows
    return blk(head, body, "<span class='dots'>⋮</span>", w=w, hdiv=hdiv, fdiv=fdiv)


CSS = """
:root{
  --ui: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --sketch: "Comic Sans MS", "Bradley Hand", var(--ui);
  --paper:#ffffff; --ink:#15171c; --muted:#646c7a; --hair:#c6ccd6; --faint:#eef1f5;
  --rule:#e2e6ec; --code:#f5f7fa; --accent:#6d4bd8; --warn:#a8560a; --ok:#1d6b3f;
}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){
  --paper:#14161b; --ink:#e7e9ee; --muted:#99a1af; --hair:#454c58; --faint:#1d2128;
  --rule:#2a2f38; --code:#191d24; --accent:#b8a3ff; --warn:#e0a85c; --ok:#6fcf97;
}}
:root[data-theme="dark"]{
  --paper:#14161b; --ink:#e7e9ee; --muted:#99a1af; --hair:#454c58; --faint:#1d2128;
  --rule:#2a2f38; --code:#191d24; --accent:#b8a3ff; --warn:#e0a85c; --ok:#6fcf97;
}
*{box-sizing:border-box}
body{background:var(--paper);color:var(--ink);font-family:var(--ui);line-height:1.55;margin:0}
.wrap{max-width:1080px;margin:0 auto;padding-inline:20px;padding-block:36px 96px}
h1{font-size:clamp(26px,4.2vw,40px);line-height:1.12;letter-spacing:-.02em;margin:0 0 6px}
h2{font-size:clamp(19px,2.6vw,25px);letter-spacing:-.01em;margin:56px 0 6px;padding-top:18px;border-top:1px solid var(--rule)}
h3{font-size:16px;margin:28px 0 8px;letter-spacing:-.005em}
h4{font-size:13.5px;margin:20px 0 6px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
p,li{font-size:14.5px}
a{color:var(--accent)}
.sub{color:var(--muted);font-size:15px;margin:0 0 4px}
.meta{color:var(--muted);font-size:12.5px;font-family:var(--mono);margin:14px 0 0}
.lede{font-size:16.5px;line-height:1.6;border-left:3px solid var(--accent);padding-left:14px;margin:22px 0}
code{font-family:var(--mono);font-size:.9em;background:var(--code);padding:1px 5px;border-radius:4px}
pre{font-family:var(--mono);font-size:12.5px;line-height:1.5;background:var(--code);border:1px solid var(--rule);
    border-radius:8px;padding:12px 14px;overflow-x:auto}
pre code{background:none;padding:0}
table{border-collapse:collapse;width:100%;font-size:13px;margin:10px 0 4px}
.scroll{overflow-x:auto;margin:10px 0 4px}
th,td{border:1px solid var(--rule);padding:6px 9px;text-align:left;vertical-align:top}
th{background:var(--faint);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
td code{white-space:nowrap}
.new{color:var(--warn);font-weight:600}
.have{color:var(--ok);font-weight:600}
.note{background:var(--faint);border:1px solid var(--rule);border-radius:8px;padding:12px 16px;margin:16px 0;font-size:14px}
.note b:first-child{display:block;margin-bottom:4px}
.rec{border-left:3px solid var(--ok);background:var(--faint);padding:10px 14px;margin:14px 0;font-size:14.5px;border-radius:0 8px 8px 0}
.kill{border-left:3px solid var(--warn)}
ul.tight{margin:8px 0;padding-left:20px}
ul.tight li{margin:3px 0}

/* ---------- gallery ---------- */
.row{border:1px solid var(--rule);border-radius:10px;margin:18px 0;overflow:hidden}
.row > .rh{background:var(--faint);padding:9px 14px;border-bottom:1px solid var(--rule)}
.row > .rh b{font-size:14.5px}
.row > .rh span{color:var(--muted);font-size:12.5px;margin-left:8px}
.cells{display:grid;grid-template-columns:1fr 1fr;gap:0}
@media (max-width:760px){.cells{grid-template-columns:1fr}}
.cell{padding:12px 14px;min-width:0}
.cell + .cell{border-left:1px solid var(--rule)}
@media (max-width:760px){.cell + .cell{border-left:0;border-top:1px solid var(--rule)}}
.cell > h5{margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);font-weight:600}
.cell img{width:100%;height:auto;display:block;border:1px solid var(--rule);border-radius:6px}
.nodonor{color:var(--muted);font-size:13px;font-style:italic;border:1px dashed var(--hair);border-radius:6px;
         padding:22px 12px;text-align:center}
.props{font-size:12px;table-layout:fixed}
.props td,.props th{padding:4px 7px;word-break:break-word}
.props td code{white-space:normal}
.props col.c1{width:26%}.props col.c2{width:36%}.props col.c3{width:17%}.props col.c4{width:21%}

/* ---------- unstyled mock kit ---------- */
.strip{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end}
.sp{margin:0;display:flex;flex-direction:column;gap:5px;align-items:flex-start}
.sp-b{display:flex;align-items:flex-end;gap:8px;min-height:26px}
.sp figcaption{font-size:10.5px;color:var(--muted);letter-spacing:.02em}
.mk-glyph{color:var(--hair);flex:none}
.mk-tb{display:inline-flex;border:1px solid var(--hair);color:var(--ink);line-height:1.25;box-sizing:border-box}
.mk-pill{display:inline-flex;align-items:center;border:1px solid var(--hair);border-radius:999px;
         padding:1px 9px;font-size:11px;white-space:nowrap}
.mk-dot{display:inline-flex;align-items:center;justify-content:center;border:1.5px solid var(--hair);
        border-radius:50%;flex:none;color:var(--ink)}
.mk-dot i{display:block}
.mk-hidden{color:var(--muted);font-size:11px;font-family:var(--mono)}
.mk-lab{font-size:10.5px;color:var(--muted)}

.bk{border:1px solid var(--hair);border-radius:5px;background:var(--paper);display:flex;flex-direction:column;
    font-size:11px;position:relative;flex:none}
.bk-h{padding:4px 7px;border-bottom:1px solid var(--hair);display:flex;align-items:center;gap:5px}
.bk-h.no-rule{border-bottom:0}
.bk-b{flex:1;padding:5px 7px;min-height:26px}
.bk-f{padding:4px 7px;border-top:1px solid var(--hair);text-align:right;color:var(--muted);min-height:19px}
.bk-f.no-rule{border-top:0}
.bk-title{font-weight:700;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bk-title.sm{font-size:11px}
.bk-type{color:var(--muted);font-size:10px;margin-left:auto;white-space:nowrap}
.bk-type.sm{font-size:9.5px}
.bk-desc{color:var(--muted);font-size:10px}
.bk.simple{padding:7px;align-items:stretch;min-height:74px;justify-content:space-between}
.bk.simple .ctr{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;flex:1;padding:6px 0}
.bk.simple .bk-foot{text-align:center;color:var(--muted);font-size:10px}
.bk-badges{position:absolute;top:5px;right:6px;display:flex;gap:3px}
.bk-tools{position:absolute;top:5px;left:6px;color:var(--hair)}
.prs{display:flex;flex-direction:column;gap:3px}
.prline{display:flex;justify-content:space-between;gap:6px}
.pr{display:flex;align-items:center;gap:4px;min-height:15px}
.pr.r{justify-content:flex-end}
.pr.off{margin-left:-9px}
.pr.r.off{margin-right:-9px}
.pr-n{font-family:var(--mono);font-size:9.5px}
.pr-t{font-family:var(--mono);font-size:9.5px;color:var(--muted)}
.more{font-size:9px;color:var(--muted);font-style:italic;padding-left:18px}
.dots{font-size:11px;color:var(--hair)}
.chev{font-size:8px;color:var(--muted)}
.edge-demo{position:relative;height:92px;width:150px;border:1px solid var(--hair);border-radius:5px}
.edge-demo .mk-dot{position:absolute;transform:translate(-50%,-50%)}
.ports-in-edge{display:flex;flex-direction:column;gap:3px}
.stackdemo{display:flex;flex-direction:column;gap:4px;padding:4px;border:1px dashed var(--hair);border-radius:4px}
.free{position:relative;height:104px}
.free .bk{position:absolute}
.tree{font-family:var(--mono);font-size:12px;line-height:1.7;white-space:pre;overflow-x:auto;
      background:var(--code);border:1px solid var(--rule);border-radius:8px;padding:14px}
svg.diagram{width:100%;height:auto;display:block;margin:14px 0;border:1px solid var(--rule);border-radius:8px;
            background:var(--paper)}
svg.diagram text{font-family:var(--ui);fill:var(--ink)}
svg.diagram .mut{fill:var(--muted)}
svg.diagram rect,svg.diagram line,svg.diagram path{stroke:var(--hair)}
svg.diagram .fillfaint{fill:var(--faint)}
.toc{columns:2;column-gap:28px;font-size:13.5px;margin:18px 0 0;padding:0;list-style:none}
@media (max-width:640px){.toc{columns:1}}
.toc li{margin:3px 0;break-inside:avoid}
.score td:first-child{font-weight:600}
.ev{margin:18px 0;border:1px solid var(--rule);border-radius:10px;overflow:hidden}
.ev img{width:100%;height:auto;display:block;border-bottom:1px solid var(--rule)}
.ev figcaption{font-size:13px;padding:9px 14px;color:var(--muted)}
.win{background:var(--faint)}
"""


def props_table(rows: list[tuple[str, str, str, str]]) -> str:
    head = ('<colgroup><col class="c1"><col class="c2"><col class="c3"><col class="c4"></colgroup>'
            "<tr><th>prop</th><th>type</th><th>default</th><th>control</th></tr>")
    body = "".join(
        f"<tr><td><code>{n}</code></td><td><code>{t}</code></td><td><code>{d}</code></td><td>{c}</td></tr>"
        for n, t, d, c in rows)
    return f'<div class="scroll"><table class="props">{head}{body}</table></div>'


def gal(title: str, board_note: str, capture: str | None, mock: str,
        props: str, heavy: bool, donor_note: str = "") -> str:
    if heavy and capture:
        uri = capture_data_uri(capture)
        shot = (f'<img src="{uri}" alt="SystemSketch today: {title}">'
                f'<p class="mk-lab">{capture} — real capture, SystemSketch main @ this build</p>') if uri else \
               f'<div class="nodonor">capture missing: {capture}</div>'
    elif capture:
        shot = (f'<div class="nodonor">real capture <code>{capture}</code><br>'
                f'lives in the media edition of this page</div>')
    else:
        shot = f'<div class="nodonor">{donor_note or "no donor in SystemSketch yet — this one is new"}</div>'
    return f"""<section class="row">
  <div class="rh"><b>{title}</b><span>{board_note}</span></div>
  <div class="cells">
    <div class="cell"><h5>SystemSketch today</h5>{shot}</div>
    <div class="cell"><h5>Proposed component — unstyled</h5>{mock}{props}</div>
  </div>
</section>"""


def gallery(m: dict, heavy: bool) -> str:
    R = []

    # ---- Glyph
    R.append(gal(
        "Glyph", "board: Size XL/L/M/S · Padding · “Always a square”",
        "13-icon-primitive.png",
        strip([specimen("xl 44", glyph(44)), specimen("lg 36", glyph(36)),
               specimen("md 24", glyph(24)), specimen("sm 18", glyph(18)),
               specimen("padded", f'<span class="mk-tb" style="padding:8px">{glyph(24)}</span>')]),
        props_table([
            ("size", "'sm'|'md'|'lg'|'xl'", "'md'", "inline-radio"),
            ("padding", "number", "0", "range 0–24"),
            ("name", "string", "—", "text (Lucide id)"),
            ("src", "string", "—", "text / file"),
        ]) + f"<p class='mk-lab'>Square is invariant, not a prop. Rung sizes ride the title at "
             f"<code>ICON_RATIO {m['icon_ratio']}</code> — already in <code>layout.ts</code>.</p>", heavy))

    # ---- TextBox
    R.append(gal(
        "TextBox", "board: text size · padding per side · style sans/sketch/mono · alignment · justification",
        "07-header-sizes.png",
        strip([specimen("xl 44", tbox("Text Box", 30)), specimen("lg 36", tbox("Text Box", 22)),
               specimen("md 24", tbox("Text Box", 15)), specimen("sm", tbox("Text Box", 11))])
        + strip([specimen("sans", tbox("Text Box", 12, font="sans")),
                 specimen("sketch", tbox("Text Box", 12, font="sketch")),
                 specimen("mono", tbox("Text Box", 12, font="mono"))])
        + strip([specimen("top · left", tbox("Text Box", 11, w="86px", h="46px", align="top", justify="left")),
                 specimen("middle · center", tbox("Text Box", 11, w="86px", h="46px", align="middle", justify="middle")),
                 specimen("bottom · right", tbox("Text Box", 11, w="86px", h="46px", align="bottom", justify="right")),
                 specimen("pad top 16", tbox("Text Box", 11, pad="16px 6px 4px"))]),
        props_table([
            ("size", "'sm'|'md'|'lg'|'xl'", "'md'", "inline-radio"),
            ("font", "'sans'|'sketch'|'mono'", "'sans'", "inline-radio"),
            ("align", "'top'|'middle'|'bottom'", "'middle'", "inline-radio"),
            ("justify", "'left'|'middle'|'right'", "'left'", "inline-radio"),
            ("padding", "number | [t,r,b,l]", "0", "4-up number"),
            ("children", "ReactNode", "—", "text"),
        ]), heavy))

    # ---- CodeField
    R.append(gal(
        "CodeField <span class='new'>(exists, on a branch)</span>",
        "board: “Single line mode / Python Dev Mode” · ports as one line of code",
        "14-code-block.png",
        strip([specimen("one line, signature grammar",
                        tbox("<span style='font-family:var(--mono)'>pose: Pose = None</span>", 12, font="mono")),
               specimen("multiline, python grammar",
                        tbox("<span style='font-family:var(--mono)'>def greet(name: str) -&gt; str:</span>", 11, font="mono"))]),
        props_table([
            ("value", "string", "required", "text"),
            ("grammar", "CodeFieldGrammar", "plain", "select"),
            ("multiline", "boolean", "false", "boolean"),
            ("align", "'left'|'right'", "'left'", "inline-radio"),
            ("mode", "'rendered'|'source'", "'rendered'", "inline-radio"),
            ("…", "19 props total", "—", "see <code>codeField.tsx</code>"),
        ]) + "<p class='mk-lab'>Already built on <code>claude/code-field</code> as registry items "
             "<code>code-field</code> + <code>code-field-signature</code>. Not merged.</p>", heavy))

    # ---- Pill / Badge
    R.append(gal(
        "Pill / Badge", "board: “It’s a text box with a rounded outside” · line style · line colour · fill style · “we can use shadcn badge here”",
        "11-value-pill.png",
        strip([specimen("solid", pill("Draft 1")), specimen("dashed", pill("Draft 1", "dashed")),
               specimen("dotted", pill("Draft 1", "dotted")), specimen("fill semi", pill("Draft 1", fill="semi")),
               specimen("fill solid", pill("Draft 1", fill="solid")),
               specimen("value pill", pill("= 0.85", fill="semi"))]),
        props_table([
            ("variant", "'default'|'secondary'|'outline'", "'outline'", "inline-radio"),
            ("line", "Appearance['line']", "inherit", "group (below)"),
            ("fill", "Appearance['fill']", "inherit", "group (below)"),
            ("children", "ReactNode", "—", "text"),
        ]) + "<p class='mk-lab'>Line/fill are <b>not</b> Pill props — they are the shared "
             "<code>Appearance</code> group every component accepts. Pill itself is shadcn "
             "<code>Badge</code> + that group.</p>", heavy))

    # ---- RowContainer
    R.append(gal(
        "RowContainer", "board: “basically like a flexbox” · height · reading direction LTR/RTL · alignment · evenly spaced",
        "03-port-inline.png",
        strip([specimen("LTR",
                        f'<span class="mk-tb" style="padding:3px;gap:0">{tbox("var",11)}{tbox("Type",11)}{tbox("value",11)}</span>'),
               specimen("RTL",
                        f'<span class="mk-tb" style="padding:3px;gap:0;direction:rtl">{tbox("var",11)}{tbox("Type",11)}{tbox("value",11)}</span>'),
               specimen("evenly spaced",
                        f'<span class="mk-tb" style="padding:3px;width:220px;justify-content:space-between">{glyph(16)}{tbox("Title",11)}{tbox("Type",11)}</span>')]),
        props_table([
            ("direction", "'ltr'|'rtl'", "'ltr'", "inline-radio"),
            ("justify", "'start'|'center'|'end'|'between'", "'start'", "inline-radio"),
            ("align", "'start'|'center'|'end'", "'center'", "inline-radio"),
            ("height", "number | 'hug'", "'hug'", "number"),
            ("gap", "number", "8", "range 0–24"),
        ]) + "<p class='mk-lab'>This is CSS flexbox with five names. It is a <b>layout</b> item in the "
             "registry, not a component — one file, no React needed for the geometry.</p>", heavy))

    # ---- Port
    R.append(gal(
        "Port", "board: states empty/out-of-focus/w-value/wired/data-received/hidden · diameter L/M/S/exact · selection diameter · polarity N/E/S/W",
        "12-floating-ports.png",
        strip([specimen("empty", dot("empty")), specimen("out of focus", dot("blur")),
               specimen("w/ value", dot("value")), specimen("wired", dot("wired")),
               specimen("data received", dot("received")), specimen("hidden", dot("hidden"))])
        + strip([specimen("lg 36", dot("empty", 30)), specimen("md 25", dot("empty", 21)),
                 specimen("sm 14", dot("empty", 13)), specimen("exact", dot("empty", 17))])
        + strip([specimen("N", f'<span class="mk-lab">↑</span>{dot("empty")}'),
                 specimen("E", f'{dot("empty")}<span class="mk-lab">→</span>'),
                 specimen("S", f'{dot("empty")}<span class="mk-lab">↓</span>'),
                 specimen("W", f'<span class="mk-lab">←</span>{dot("empty")}')]),
        props_table([
            ("state", "'empty'|'blurred'|'value'|'wired'|'received'", "'empty'", "inline-radio"),
            ("size", "'sm'|'md'|'lg'", "'md'", "inline-radio"),
            ("diameter", "number", "—", "number (overrides size)"),
            ("hitRadius", "number", "12", "range 6–32"),
            ("polarity", "'n'|'e'|'s'|'w'", "derived", "<span class='new'>see §6c</span>"),
            ("visible", "boolean", "true", "<span class='new'>structural, not appearance</span>"),
            ("children", "ReactNode", "—", "text (the label slot)"),
        ]) + f"<p class='mk-lab'><code>PORT_DIAMETERS</code> and the four non-received states already ship "
             f"in <code>port.tsx</code>. <code>{m['port_field_count']}</code>-field <code>BlockPort</code> in "
             f"SystemSketch is the superset — most of it is document semantics, not presentation.</p>", heavy))

    # ---- Port placement
    R.append(gal(
        "Port placement", "board: Row Container Placement — bot/top/right/left + right-offset/left-offset",
        "04-port-offset.png",
        strip([specimen("top", f'<div style="text-align:center">{tbox("label",10)}<br>{dot()}</div>'),
               specimen("bot", f'<div style="text-align:center">{dot()}<br>{tbox("label",10)}</div>'),
               specimen("left", f'{tbox("label",10)}{dot()}'),
               specimen("right", f'{dot()}{tbox("label",10)}'),
               specimen("right-offset", f'{dot()}<span style="display:inline-block;width:18px"></span>{tbox("label",10)}'),
               specimen("left-offset", f'{tbox("label",10)}<span style="display:inline-block;width:18px"></span>{dot()}')]),
        props_table([
            ("placement", "'top'|'bot'|'left'|'right'|'left-offset'|'right-offset'", "'right'", "select"),
            ("labelGap", "number", "8", "range 0–40"),
        ]) + "<p class='mk-lab'>All six already exist in <code>port.tsx</code> as "
             "<code>textLayout</code>; renaming to the board's word is the only change.</p>", heavy))

    # ---- PortEdge
    R.append(gal(
        "PortEdge (lane)", "board: box edge left/right/top/bottom · layout evenly-spaced/custom · “they act like kanban cards in a row, use dnd-kit”",
        "05-hidden-ports.png",
        strip([specimen("left edge",
                        '<div class="ports-in-edge">' + "".join(port_row("port", "Any") for _ in range(3)) + "</div>"),
               specimen("top edge (evenly)",
                        '<div class="edge-demo">' + "".join(
                            f'<span class="mk-dot" style="width:12px;height:12px;left:{p}%;top:0"></span>'
                            for p in (25, 50, 75)) + "</div>"),
               specimen("custom",
                        '<div class="edge-demo">' + "".join(
                            f'<span class="mk-dot" style="width:12px;height:12px;left:0;top:{p}%"></span>'
                            for p in (14, 26, 70, 82)) + "</div>")]),
        props_table([
            ("edge", "'left'|'right'|'top'|'bottom'", "'left'", "inline-radio"),
            ("layout", "'evenly'|'custom'", "'evenly'", "inline-radio"),
            ("ports", "PortSpec[]", "[]", "object (array)"),
            ("onReorder", "(from,to)=&gt;void", "—", "<span class='new'>host</span>"),
        ]) + "<p class='mk-lab'>The lane <b>positions</b>; the drag that reorders it is host-owned "
             "(dnd-kit), exactly as PEP 0013 already rules in SystemSketch.</p>", heavy))

    # ---- Block simple view
    nine = [
        simple_card("Title"),
        simple_card("Title", "Type"),
        simple_card("Title", "Type", "Description"),
        simple_card("Title", "Type", "Description", ic=True),
        simple_card("Title", "Type", "Description", ic=True, badges=1),
        simple_card("Title", "Type", "Description", ic=True, badges=2),
        simple_card("Title", "Type", "Description", ic=True, badges=2, tools=True),
        simple_card("Title", "", "", centre="icon"),
        simple_card("Title", "Type", centre="type"),
    ]
    caps = ["title only", "w/ type", "w/ type & description", "w/ …& icon", "w/ badge",
            "w/ many badges", "w/ tool items", "icon centered", "type centered"]
    R.append(gal(
        "Block — Simple View (all nine board variants)",
        "board: title · w/type · w/type&desc · w/…&icon · w/badge · w/many badges · w/tool items · icon centered · type centered",
        "01-simple-ladder.png",
        strip([specimen(c, b) for c, b in zip(caps, nine)]),
        props_table([
            ("view", "'simple'|'port'|'expanded'|'region'", "'simple'", "inline-radio"),
            ("title", "string", "''", "text"),
            ("type", "string", "''", "text"),
            ("description", "string", "''", "text"),
            ("icon", "string", "—", "text"),
            ("centre", "'none'|'icon'|'type'", "'none'", "inline-radio"),
            ("badges", "Badge[]", "[]", "object (array)"),
            ("tools", "ToolItem[]", "[]", "object (array)"),
        ]), heavy))

    # ---- Block port view
    ins = [("image", "Image"), ("threshold", "float"), ("model", "Model")]
    outs = [("boxes", "list[Box]"), ("scores", "list[f]")]
    R.append(gal(
        "Block — Port View", "board: header + body + footer with ⋮ · ports inline vs offset · header ports “scoped region…”",
        "03-port-inline.png",
        strip([specimen("inline", port_block(ins, outs)),
               specimen("offset", port_block(ins, outs, offset=True)),
               specimen("1× header port",
                        port_block(ins, outs, header_extra=f'<span style="margin-left:4px">{dot("empty",9)}</span>'))]),
        props_table([
            ("inputs", "PortSpec[]", "[]", "object (array)"),
            ("outputs", "PortSpec[]", "[]", "object (array)"),
            ("portLayout", "'inline'|'offset'", "'inline'", "inline-radio"),
            ("headerPorts", "PortSpec[]", "[]", "object (array)"),
            ("footer", "ReactNode", "—", "slot"),
        ]), heavy))

    # ---- header sizes + layouts
    R.append(gal(
        "Block — header size &amp; header layouts",
        "board: Size of Header S/M/L/XL · type compact · title badge · other tools/text · centered · folding left/right · play button + “15.1ms”",
        "07-header-sizes.png",
        strip([specimen("S", blk(f'{glyph(9)} <b class="bk-title" style="font-size:9px">Title</b><span class="bk-type sm">Type</span>', "", "", w=150)),
               specimen("M", blk(f'{glyph(11)} <b class="bk-title sm">Title</b><span class="bk-type sm">Type</span>', "", "", w=150)),
               specimen("L", blk(f'{glyph(14)} <b class="bk-title" style="font-size:14px">Title</b><span class="bk-type">Type</span>', "", "", w=150)),
               specimen("XL", blk(f'{glyph(18)} <b class="bk-title" style="font-size:17px">Title</b><span class="bk-type">Type</span>', "", "", w=160))])
        + strip([specimen("type compact", blk(f'{glyph(11)} <b class="bk-title sm">Title</b> <span class="bk-type sm" style="margin-left:3px">Type</span>', "", "", w=150)),
                 specimen("title badge", blk(f'{glyph(11)} <b class="bk-title sm">Title</b> {pill("Draft 1")}<span class="bk-type sm">Type</span>', "", "", w=170)),
                 specimen("w/ tools", blk(f'{glyph(11)} <b class="bk-title sm">Title</b><span class="bk-type sm">Type</span>{glyph(9)}{glyph(9)}{glyph(9)}', "", "", w=180)),
                 specimen("centered", blk(f'<span style="margin:auto;display:flex;gap:4px;align-items:center">{glyph(11)} <b class="bk-title sm">Title</b> <span class="bk-type sm">Type</span></span>', "", "", w=160)),
                 specimen("folding left", blk(f'<span class="chev">▾</span>{glyph(11)} <b class="bk-title sm">Title</b><span class="bk-type sm">Type</span>', "", "", w=160)),
                 specimen("folding right", blk(f'{glyph(11)} <b class="bk-title sm">Title</b><span class="bk-type sm">Type</span><span class="chev">▾</span>', "", "", w=160)),
                 specimen("play + 15.1ms", blk(f'{glyph(11)} <b class="bk-title sm">Title</b><span class="bk-type sm">Type</span> <span class="mk-lab">15.1ms</span> <span class="chev">▶</span>', "", "", w=180))]),
        props_table([
            ("headerSize", "'s'|'m'|'l'|'xl'", "'m'", "inline-radio"),
            ("headerAlign", "'left'|'center'", "'left'", "inline-radio"),
            ("headerLeft / headerRight", "ReactNode", "—", "slot"),
            ("foldControlSide", "'left'|'right'|'none'", "'none'", "inline-radio"),
        ]) + "<p class='mk-lab'>Every “header layout” on the board is a <b>slot arrangement</b>, not an "
             "enum. Seven named layouts collapse to three slots + two enums — see §2.</p>", heavy,
        donor_note="header sizes exist; play-button / tool-item slots have no donor yet"))

    # ---- folding + visibility + hidden
    R.append(gal(
        "Block — folding, visibility, hidden ports",
        "board: Folding down/up · No header line · No footer line · No header · No footer · Hidden ports “+3 more”",
        "08-visibility.png",
        strip([specimen("fold down", port_block(ins[:2], outs[:1], w=160, fold="down")),
               specimen("fold up", port_block(ins[:2], outs[:1], w=160, fold="up")),
               specimen("no header rule", port_block(ins[:2], outs[:1], w=160, hdiv=False)),
               specimen("no footer rule", port_block(ins[:2], outs[:1], w=160, fdiv=False)),
               specimen("+3 more", port_block([("image", "Image")], outs[:1], w=160, more="+3 more"))]),
        props_table([
            ("folded", "boolean", "false", "boolean"),
            ("showHeaderRule", "boolean", "true", "boolean"),
            ("showFooterRule", "boolean", "true", "boolean"),
            ("showHeader / showFooter", "boolean", "true", "boolean"),
            ("hiddenSummary", "'inline'|'footer'|'off'", "'inline'", "inline-radio"),
        ]) + "<p class='mk-lab'>“Hidden” on a port is <b>structural</b> — it removes the row and "
             "reflows the block. It is not an opacity. See §6b.</p>", heavy))

    # ---- members
    child = lambda t, b=0: simple_card(t, "Type", badges=b, w=128)
    R.append(gal(
        "Block — members (Stack vs Free), Expanded, Region",
        "board: “each block can add other blocks as children… children stacked vertically… the width of the largest child drives the width… everything is a block”",
        "09-members-stack.png",
        strip([specimen("stack (width: fill)",
                        blk(f'{glyph(11)} <b class="bk-title sm">Pipeline</b><span class="bk-type sm">system</span>',
                            '<div class="stackdemo">' + child("Grab") + child("Detect", 1) + child("Track") + "</div>",
                            "<span class='dots'>⋮</span>", w=160)),
               specimen("free (cables inside)",
                        blk(f'{glyph(11)} <b class="bk-title sm">Pipeline</b><span class="bk-type sm">system</span>',
                            f'<div class="free">'
                            f'<div style="position:absolute;left:2px;top:2px">{child("Grab")}</div>'
                            f'<div style="position:absolute;left:26px;top:42px">{child("Detect")}</div></div>',
                            "<span class='dots'>⋮</span>", w=180)),
               specimen("region, black-box OFF",
                        blk(f'{glyph(11)} <b class="bk-title sm">Region</b><span class="bk-type sm">Type</span> <span style="border:1px solid var(--hair);width:9px;height:9px;display:inline-block"></span>',
                            f'<div class="free"><div style="position:absolute;left:4px;top:6px">{child("Child")}</div>'
                            f'<div style="position:absolute;left:48px;top:50px">{child("Child")}</div></div>', "", w=180)),
               specimen("region, black-box ON",
                        simple_card("Title", "Type", centre="type", w=140))]),
        props_table([
            ("bodyLayout", "'free'|'stack'", "'free'", "inline-radio"),
            ("memberGap", "number", "8", "range 0–40"),
            ("memberGutter", "number", "12", "range 0–40"),
            ("memberWidth", "'fill'|'own'", "'fill'", "inline-radio"),
            ("blackBox", "boolean", "false", "boolean"),
            ("members", "BlockProps[]", "[]", "<span class='new'>recursive — see §6d</span>"),
        ]) + "<p class='mk-lab'>Black-box ON is not a separate view: it renders the same Block in "
             "<code>view='simple'</code>. One prop, no new component.</p>", heavy))

    # ---- presets
    presets = [("Type", "Braces"), ("Function", "λ"), ("Type Mapping", "="), ("Class", "C"),
               ("Component", "▣"), ("System", "◫"), ("For Loop", "↻"), ("While Loop", "↺"),
               ("Conditional", "⋔")]
    R.append(gal(
        "Presets", "board: Type · Function · Type Mapping · Class · Component · System · For Loop · While Loop · Conditional",
        "15-branch-region.png",
        strip([specimen(n, simple_card(n, n.lower().replace(" ", "-"), centre="type", w=118))
               for n, _ in presets]),
        props_table([
            ("preset", "'type'|'function'|…", "—", "select"),
        ]) + "<p class='mk-lab'>A preset sets nothing new. It is a <b>named bundle of the props above</b> "
             "— the same object a Storybook story's <code>args</code> is. See §6a; this is the single "
             "highest-leverage idea in the proposal.</p>", heavy,
        donor_note="Branch / Loop / Behaviour Tree exist as real shapes; Type / Function / Class / Component / System do not"))

    # ---- host-owned
    R.append(gal(
        "Edges / cables <span class='have'>(host adapter, never a bbox-ui component)</span>",
        "board: dragging interactions — edge out to nowhere · edge to edge of expanded · reorganising ports by dragging · auto spacing",
        "18-edge.png",
        '<div class="note"><b>Deliberately absent from the component family.</b>'
        'An edge is two anchors plus a router, and both anchors are engine coordinates. '
        'React Flow owns it as an edge type; tldraw owns it as a binding. '
        '<code>ARCHITECTURE.md</code> already draws this line — “interaction geometry is host-owned '
        'and never travels”. bbox-ui ships the <b>anchor</b> (<code>portAnchor()</code>), not the cable.</div>',
        "", heavy))

    # ---- the menu
    R.append(gal(
        "Appearance — the tldraw-style Line/Fill menu",
        "board: thin/med/thick · solid/dashed/dotted/async/none · colour swatches · “same control we have in tldraw/excalidraw”",
        "20-appearance-menu.png",
        strip([specimen("thickness", strip([specimen("thin", '<span style="display:block;width:30px;border-top:1px solid var(--ink)"></span>'),
                                            specimen("med", '<span style="display:block;width:30px;border-top:2px solid var(--ink)"></span>'),
                                            specimen("thick", '<span style="display:block;width:30px;border-top:3.5px solid var(--ink)"></span>')])),
               specimen("style", strip([specimen("solid", '<span style="display:block;width:30px;border-top:2px solid var(--ink)"></span>'),
                                        specimen("dashed", '<span style="display:block;width:30px;border-top:2px dashed var(--ink)"></span>'),
                                        specimen("dotted", '<span style="display:block;width:30px;border-top:2px dotted var(--ink)"></span>'),
                                        specimen("none", '<span class="mk-lab">∅</span>')]))]),
        props_table([
            ("line.style", "'solid'|'dashed'|'dotted'|'none'", "'solid'", "inline-radio"),
            ("line.width", "'thin'|'med'|'thick'", "'med'", "inline-radio"),
            ("line.color", "string", "'currentColor'", "swatches + color"),
            ("line.opacity", "number 0–1", "1", "range"),
            ("fill.style", "'none'|'semi'|'solid'|'pattern'", "'none'", "inline-radio"),
            ("fill.color", "string", "—", "swatches + color"),
            ("fill.opacity", "number 0–1", "1", "range"),
        ]) + "<p class='mk-lab'>One <code>Appearance</code> object, accepted by every component, "
             "seven controls. Not seven props on each of eleven components.</p>", heavy))

    # ---- the inspector that exists
    R.append(gal(
        "The inspector you already have <span class='have'>(twice)</span>",
        "board note: “I want a developer inspector panel that basically allows me to make all of these customizations”",
        "19-selected-chrome.png",
        f'<div class="note"><b>This is the finding that changes the plan.</b>'
        f'<code>packages/inspector</code> is {m["inspector_files"]} TS/TSX files. '
        f'<code>inspectorModel.ts</code> ({m["inspector_model_lines"]} lines) already declares a schema — '
        f'<code>InspectorControl</code> with {len(m["inspector_control_fields"])} fields and '
        f'{len(m["control_kinds"])} control kinds ({", ".join("<code>"+k+"</code>" for k in m["control_kinds"])}) — '
        f'and <code>Inspector.tsx</code> ({m["inspector_panel_lines"]} lines) is, in its own words, '
        f'“deliberately dumb”. It has a drag-scrub number field, a colour well, segmented controls and '
        f'swatch rows. It is keyed to <b>tldraw shapes</b>. Re-keying it to <b>components</b> is the '
        f'whole job.</div>', "", heavy))

    return "\n".join(R)


def esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def code(s: str) -> str:
    return f"<pre><code>{esc(s.strip())}</code></pre>"


COMPOSITION_SVG = """
<svg class="diagram" viewBox="0 0 900 420" role="img" aria-label="Block composition tree">
  <rect x="14" y="14" width="300" height="392" rx="8" fill="none"/>
  <text x="28" y="40" font-size="15" font-weight="700">Block</text>
  <text x="28" y="58" font-size="11" class="mut">one anatomy, four views, recursive</text>

  <rect x="30" y="74" width="268" height="62" rx="5" class="fillfaint"/>
  <text x="42" y="94" font-size="12" font-weight="600">Header</text>
  <text x="42" y="110" font-size="10.5" class="mut">RowContainer( slot-left · slot-centre · slot-right )</text>
  <text x="42" y="126" font-size="10.5" class="mut">Glyph · TextBox · Pill* · Tool* · fold chevron</text>

  <rect x="30" y="146" width="268" height="140" rx="5" class="fillfaint"/>
  <text x="42" y="166" font-size="12" font-weight="600">Body — exactly one of:</text>
  <text x="54" y="184" font-size="10.5" class="mut">PortEdge × n        (view = port)</text>
  <text x="54" y="200" font-size="10.5" class="mut">MemberStack&lt;Block&gt;   (bodyLayout = stack)</text>
  <text x="54" y="216" font-size="10.5" class="mut">free children       (bodyLayout = free / region)</text>
  <text x="54" y="232" font-size="10.5" class="mut">CodeField           (python dev mode)</text>
  <text x="54" y="248" font-size="10.5" class="mut">centred TextBox     (view = simple)</text>
  <text x="42" y="272" font-size="10.5" class="mut">↳ every member is itself a Block</text>

  <rect x="30" y="296" width="268" height="52" rx="5" class="fillfaint"/>
  <text x="42" y="316" font-size="12" font-weight="600">Footer</text>
  <text x="42" y="332" font-size="10.5" class="mut">RowContainer( slot-left · slot-right · ⋮ )</text>

  <text x="42" y="378" font-size="10.5" class="mut">Appearance{line, fill} — accepted here,</text>
  <text x="42" y="393" font-size="10.5" class="mut">inherited by every descendant unless overridden</text>

  <line x1="330" y1="105" x2="392" y2="105"/><path d="M386 100 L394 105 L386 110 Z"/>
  <line x1="330" y1="215" x2="392" y2="215"/><path d="M386 210 L394 215 L386 220 Z"/>
  <line x1="330" y1="322" x2="392" y2="322"/><path d="M386 317 L394 322 L386 327 Z"/>

  <rect x="400" y="20" width="228" height="176" rx="8" fill="none"/>
  <text x="414" y="42" font-size="13" font-weight="700">Primitives (L0)</text>
  <text x="414" y="64" font-size="11">Glyph</text><text x="560" y="64" font-size="10" class="mut">new</text>
  <text x="414" y="84" font-size="11">TextBox</text><text x="560" y="84" font-size="10" class="mut">new</text>
  <text x="414" y="104" font-size="11">Pill / Badge</text><text x="560" y="104" font-size="10" class="mut">shadcn</text>
  <text x="414" y="124" font-size="11">CodeField</text><text x="560" y="124" font-size="10" class="mut">branch</text>
  <text x="414" y="152" font-size="13" font-weight="700">Layout (L1)</text>
  <text x="414" y="174" font-size="11">RowContainer · Stack · PortEdge</text>

  <rect x="400" y="212" width="228" height="92" rx="8" fill="none"/>
  <text x="414" y="234" font-size="13" font-weight="700">Port (L2)</text>
  <text x="414" y="254" font-size="11">PortDot + PortLabel + placement</text>
  <text x="414" y="274" font-size="10.5" class="mut">ships today in port.tsx</text>
  <text x="414" y="292" font-size="10.5" class="mut">a lane of them is a PortEdge</text>

  <rect x="400" y="320" width="228" height="86" rx="8" fill="none"/>
  <text x="414" y="342" font-size="13" font-weight="700">Presets (L4) — data</text>
  <text x="414" y="362" font-size="10.5" class="mut">Type · Function · Type Mapping · Class</text>
  <text x="414" y="378" font-size="10.5" class="mut">Component · System · For · While · Cond.</text>
  <text x="414" y="396" font-size="10.5" class="mut">named arg bundles, not components</text>

  <rect x="648" y="20" width="238" height="386" rx="8" fill="none"/>
  <text x="662" y="42" font-size="13" font-weight="700">Host adapter — never core</text>
  <text x="662" y="66" font-size="11">drag · resize · snap · z-order</text>
  <text x="662" y="86" font-size="11">hit-testing &amp; selection</text>
  <text x="662" y="106" font-size="11">wheel / camera</text>
  <text x="662" y="126" font-size="11">dnd-kit port reorder</text>
  <text x="662" y="146" font-size="11">edges / cables / routing</text>
  <text x="662" y="166" font-size="11">persistence &amp; undo</text>
  <text x="662" y="196" font-size="10.5" class="mut">React Flow: Handle, NodeResizer,</text>
  <text x="662" y="212" font-size="10.5" class="mut">edge types, LabeledHandle (copy it)</text>
  <text x="662" y="236" font-size="10.5" class="mut">tldraw: ShapeUtil, bindings,</text>
  <text x="662" y="252" font-size="10.5" class="mut">getGeometry, detach/rebuild</text>
  <text x="662" y="288" font-size="11" font-weight="600">The one thing that crosses:</text>
  <text x="662" y="308" font-size="10.5" class="mut">portAnchor(side, t, w, h) — the</text>
  <text x="662" y="324" font-size="10.5" class="mut">anchor point, not the cable.</text>
  <text x="662" y="352" font-size="11" font-weight="600">The cost nobody counts:</text>
  <text x="662" y="372" font-size="10.5" class="mut">every component also needs a pure</text>
  <text x="662" y="388" font-size="10.5" class="mut">box fn in blockLayout.ts, or it</text>
  <text x="662" y="400" font-size="10.5" class="mut">cannot detach. See §6f.</text>
</svg>
"""


SCHEMA_TS = r"""
// packages/schema/src/field.ts — zero dependencies, no React, no engine.
// A FieldSpec is the DECLARATION.  It never carries a value.
export type FieldKind =
  | 'segments' | 'swatches' | 'tiles' | 'number' | 'range'
  | 'toggle' | 'color' | 'text' | 'object'

export interface FieldOption { value: string; label: string; swatch?: string; path?: string }

export interface FieldSpec<T = unknown> {
  id: string                 // must be a real prop key — one test asserts it
  label: string
  kind: FieldKind
  group?: string             // 'Layout' | 'Appearance' | 'Behaviour'   (Shopify section)
  caption?: string           // Figma's second level, already in InspectorControl
  options?: FieldOption[]
  min?: number; max?: number; step?: number; unit?: string
  glyph?: string; paired?: boolean; fallback?: number
  hint?: string
  default: T
  structural?: true          // changes layout, so it is NOT an appearance control (§6b)
}

// A READING is a FieldSpec plus what the current subject(s) actually say.
// Storybook is the degenerate case: one subject, `mixed` can never happen.
export interface FieldReading extends FieldSpec {
  value: string | number | boolean | null   // null === mixed
  unset?: boolean; overridden?: boolean; disabled?: boolean
}
"""

FIELDS_TS = r"""
// packages/bbox-ui/src/port.fields.ts — beside port.tsx, shipped in the registry item.
import type { FieldSpec } from '@bbox-ui/schema'
import { PORT_DIAMETERS } from './layout'

export const portFields = [
  { id: 'state', label: 'State', kind: 'segments', group: 'Content',
    options: [
      { value: 'empty',    label: 'Empty' },
      { value: 'blurred',  label: 'Out of focus' },
      { value: 'value',    label: 'w/ value set' },
      { value: 'wired',    label: 'Wired' },
      { value: 'received', label: 'Data received' },
    ],
    default: 'empty' },
  { id: 'size', label: 'Diameter', kind: 'segments', group: 'Layout',
    options: Object.keys(PORT_DIAMETERS).map((k) => ({ value: k, label: k })),
    default: 'md' },
  { id: 'diameter', label: 'Exact', kind: 'number', group: 'Layout',
    min: 6, max: 64, step: 1, unit: 'px', fallback: 25, default: PORT_DIAMETERS.md },
  { id: 'hitRadius', label: 'Selection', kind: 'range', group: 'Layout',
    min: 6, max: 32, step: 1, unit: 'px', default: 12 },
  { id: 'placement', label: 'Label', kind: 'segments', group: 'Layout',
    options: ['top','bot','left','right','left-offset','right-offset']
      .map((v) => ({ value: v, label: v })), default: 'right' },
  { id: 'polarity', label: 'Polarity', kind: 'segments', group: 'Layout',
    options: ['n','e','s','w'].map((v) => ({ value: v, label: v.toUpperCase() })),
    default: 'e', hint: 'Authored. The host may compute one and pass it in — the core never detects.' },
  { id: 'visible', label: 'Visible', kind: 'toggle', group: 'Behaviour',
    default: true, structural: true,
    hint: 'false removes the row and reflows the block. Not an opacity.' },
] as const satisfies readonly FieldSpec[]
"""

ARGTYPES_TS = r"""
// packages/schema/src/storybook.ts — 1 pure function, unit-testable, no Storybook import.
const CONTROL: Record<FieldKind, string> = {
  segments: 'inline-radio', swatches: 'select', tiles: 'radio', number: 'number',
  range: 'range', toggle: 'boolean', color: 'color', text: 'text', object: 'object',
}

export function toArgTypes(fields: readonly FieldSpec[]) {
  return Object.fromEntries(fields.map((f) => [f.id, {
    name: f.label,
    description: f.hint,
    options: f.options?.map((o) => o.value),
    control: { type: CONTROL[f.kind], min: f.min, max: f.max, step: f.step },
    table: { category: f.group, defaultValue: { summary: String(f.default) } },
  }]))
}

export function defaultArgs(fields: readonly FieldSpec[]) {
  return Object.fromEntries(fields.map((f) => [f.id, f.default]))
}
"""

STORY_TSX = r"""
// packages/bbox-ui/src/Port.stories.tsx — CSF3.  The SAME array as the inspector.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { toArgTypes, defaultArgs } from '@bbox-ui/schema/storybook'
import { Port } from './port'
import { portFields } from './port.fields'
import { PORT_PRESETS } from './presets'

const meta = {
  title: 'Primitives/Port',
  component: Port,
  argTypes: toArgTypes(portFields),      // <- one source of truth
  args: { ...defaultArgs(portFields), children: 'image' },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Port>
export default meta
type Story = StoryObj<typeof meta>

// The board's six states are six stories — and the SAME objects the
// inspector offers as presets.  See §6a: a preset file is a story file.
export const Empty:    Story = { args: PORT_PRESETS.empty }
export const Blurred:  Story = { args: PORT_PRESETS.blurred }
export const WithValue:Story = { args: PORT_PRESETS.value }
export const Wired:    Story = { args: PORT_PRESETS.wired }
export const Received: Story = { args: PORT_PRESETS.received }
export const Hidden:   Story = { args: PORT_PRESETS.hidden }

// hidden is STRUCTURAL: prove it leaves no hit target behind (§6b).
export const HiddenLeavesNoTarget: Story = {
  args: PORT_PRESETS.hidden,
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement)
    await step('no dot is painted', async () => {
      await expect(canvas.queryByTestId('port-dot')).toBeNull()
    })
    await step('and nothing under the cursor claims the click', async () => {
      const hit = document.elementFromPoint(10, 10)
      await expect(hit?.getAttribute('data-testid')).not.toBe('port-dot')
    })
  },
}
"""

INSPECTOR_TSX = r"""
// demos/playground/src/InspectorPane.tsx — the SAME array, the product panel.
import { Inspector } from '@bbox-ui/inspector'
import { readFields } from '@bbox-ui/schema'
import { portFields } from '@bbox-ui/core/port.fields'

export function InspectorPane({ selection, write }) {
  //           declaration      +  subjects  ->  readings (value | null for mixed)
  const readings = readFields(portFields, selection.map((s) => s.props))
  return <Inspector readings={readings} onWrite={(id, v) => write(selection, id, v)} />
}
// Storybook's Controls addon renders `argTypes` for ONE subject.
// This renders the SAME fields for N subjects, with tldraw's `mixed`.
// Same declaration, two readers.  Neither is a fork of the other.
"""

PREVIEW_TSX = r"""
// .storybook/preview.tsx — one global, one decorator, three hosts.
import type { Preview } from '@storybook/react-vite'
import { DomHost, ReactFlowHost, TldrawHost } from '../demos/story-hosts'

const HOSTS = { dom: DomHost, reactflow: ReactFlowHost, tldraw: TldrawHost }

const preview: Preview = {
  globalTypes: {
    host: {
      description: 'Render this story in a plain div, a React Flow node, or a tldraw shape',
      toolbar: {
        title: 'Host',
        icon: 'component',
        items: [
          { value: 'dom',       title: 'DOM' },
          { value: 'reactflow', title: 'React Flow' },
          { value: 'tldraw',    title: 'tldraw' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { host: 'dom' },
  decorators: [
    (Story, context) => {
      const Host = HOSTS[context.globals.host as keyof typeof HOSTS] ?? HOSTS.dom
      return <Host><Story /></Host>     // the story is the node's / shape's body
    },
  ],
}
export default preview
"""

TLDRAW_HOST_TSX = r"""
// demos/story-hosts/TldrawHost.tsx — lives in demos/, so core keeps zero engine imports.
// The ShapeUtil is defined ONCE at module scope; a per-story class re-registers
// the shape on every render and tldraw throws.
class StoryShapeUtil extends ShapeUtil<StoryShape> {
  static override type = 'story' as const
  getDefaultProps() { return { w: 320, h: 200 } }
  getGeometry(s) { return new Rectangle2d({ width: s.props.w, height: s.props.h, isFilled: true }) }
  component() { return <HTMLContainer>{useStoryBody()}</HTMLContainer> }   // ← the story
  indicator(s) { return <rect width={s.props.w} height={s.props.h} /> }
}
"""


EVIDENCE = [
    ("02-simple-icon.png", "Simple View with icon + type + description — the board's fourth variant, painted by SystemSketch today."),
    ("06-folded.png", "<code>foldable: true, folded: true</code>. The header survives, the body collapses to 48px. The board calls this “Folding up”."),
    ("10-members-free.png", "<code>bodyLayout: 'free'</code> — the same three members, positioned by hand. This is Region view before it has a name."),
    ("16-loop-region.png", "A real <code>loop</code> shape: “For Loop” with <code>Iterable</code>/<code>Iter</code> header ports. One of your nine presets already exists, as its own shape type."),
    ("17-behaviour-tree.png", "A real <code>behaviorTree</code> shape — header, node count, Start pill, add button. The board's two Behaviour-Tree bands are empty; this is what would fill them."),
    ("21-stock-style.png", "<b>The one to look at twice.</b> Select a stock rectangle in SystemSketch and the panel <i>reports</i> Colour / Fill / Dash / Size / Font and says “edited on the selection pill over the shape”. Your board asks for tldraw's Line and Fill controls — SystemSketch shows them read-only; bbox-ui's inspector is the one that actually writes them. Two inspectors, one requirement."),
]


def evidence(heavy: bool) -> str:
    if not heavy:
        return ("<p>The remaining captures — folded blocks, free members, the real Loop and Behaviour-Tree "
                "shapes, and SystemSketch's read-only stock-style panel — are in the media edition.</p>")
    out = []
    for name, why in EVIDENCE:
        uri = capture_data_uri(name)
        if not uri:
            continue
        out.append(f'<figure class="ev"><img src="{uri}" alt="{name}">'
                   f'<figcaption><code>{name}</code> — {why}</figcaption></figure>')
    return "".join(out)


def page(m: dict, heavy: bool) -> str:
    ed = "media edition — captures inlined" if heavy else "light edition — no captures"
    other = ("The light, tracked edition lives at <code>reports/bbox-ui-component-proposal-2026-09-10.html</code> on the branch."
             if heavy else
             "Every <b>real SystemSketch capture</b> lives in the media edition: "
             "<code>/home/bam/bbox-ui/reports/media/bbox-ui-component-proposal-2026-09-10.html</code>")

    bt = " · ".join(f"<code>{k}</code>&nbsp;{v}" for k, v in m["board_by_type"].items())
    kinds = ", ".join(f"<code>{k}</code>" for k in m["control_kinds"])

    fam_rows = [
        ("L0", "Glyph", "square icon slot, 4 rungs, padding", "<span class='new'>new</span>",
         "board Glyph band; <code>ICON_RATIO</code> + <code>glyphPx()</code> exist in <code>layout.ts</code>; "
         "<code>systemsketch-icon</code> shape shipped on SS main 2026-09-10"),
        ("L0", "TextBox", "size · font · align · justify · per-side padding", "<span class='new'>new</span>",
         "<code>BlockTitle</code>/<code>BlockDescription</code>/<code>BlockType</code> are three hard-coded "
         "instances of it today"),
        ("L0", "Pill / Badge", "rounded TextBox + Appearance", "<span class='new'>new</span> (shadcn <code>Badge</code>)",
         "<code>BlockChip</code> exists; SS's “Draft N” chip and the <code>value</code> view are both this"),
        ("L0", "CodeField", "CodeMirror 6, grammar-agnostic", "<span class='have'>branch</span>",
         "<code>claude/code-field</code> — 19 props, 2 registry items, judge PASS, not merged"),
        ("L1", "RowContainer", "flexbox with five names", "<span class='new'>new</span>",
         "every header/footer/port row is one; today it is inline CSS in <code>block.tsx</code>"),
        ("L1", "Stack", "vertical member stack, gap/gutter/width", "<span class='new'>new</span>",
         "SS <code>memberStack.ts</code> + <code>memberGap/memberGutter/memberWidth</code> is the donor"),
        ("L1", "PortEdge (lane)", "n ports on one box edge, evenly or custom", "<span class='new'>new</span>",
         "SS <code>layoutBlock.ts</code> lanes + <code>edgePortPoint()</code>; dnd-kit reorder is host-side"),
        ("L2", "Port", "dot + label + placement + state", "<span class='have'>ships</span>",
         f"<code>port.tsx</code>, registry item <code>port</code>; SS <code>BlockPort</code> has "
         f"{m['port_field_count']} fields, most of them semantics not presentation"),
        ("L3", "Block", "Header / Body / Footer, 4 views, members", "<span class='have'>partial</span>",
         f"<code>block.tsx</code> ships Simple View only ({len(m['core_components'])} exported parts); "
         f"SS Block has {m['block_prop_count']} props and {len(m['block_views'])} views"),
        ("L4", "Presets", "Type · Function · Type Mapping · Class · Component · System · For · While · Conditional",
         "<span class='new'>data, not components</span>",
         "SS has 6 <i>stock blocks</i> and 3 tools, none of them these nine — the nine are new"),
        ("—", "Edges / cables", "two anchors + a router", "<span class='have'>host adapter</span>",
         "React Flow edge type · tldraw binding. Never enters the core. <code>ARCHITECTURE.md</code> already rules it"),
        ("—", "drag · hit-test · z-order · wheel · dnd-kit reorder", "interaction geometry",
         "<span class='have'>host adapter</span>", "same rule, same file"),
    ]
    fam = "".join(f"<tr><td><b>{a}</b></td><td><b>{b}</b></td><td>{c}</td><td>{d}</td><td>{e}</td></tr>"
                  for a, b, c, d, e in fam_rows)

    crit = [
        ("One source of truth — props, Storybook controls, in-product inspector, Autodocs, registry docs", 5),
        ("Code is the living spec (no parallel corpus that can drift)", 5),
        ("Stock parts over hand-rolled", 4),
        ("Host neutrality — core must stay free of React, engines and the DOM where possible", 4),
        ("Controls exactly like tldraw’s style menu (swatch rows, segmented tiles, drag-scrub, <i>mixed</i>)", 4),
        ("Speed to a first working page", 3),
        ("Runs headless in CI", 3),
    ]
    crit_html = "".join(f"<tr><td>{c}</td><td style='text-align:center'><b>×{w}</b></td></tr>" for c, w in crit)

    score = [
        ("A · CVA variants + argTypes overlay", 2, 3, 4, 3, 1, 4, 3, "68"),
        ("B · zod → argTypes + RJSF inspector", 4, 4, 3, 2, 2, 2, 3, "78"),
        ("C · hand-written JSON Schema + RJSF", 3, 2, 3, 3, 2, 1, 3, "66"),
        ("D · Storybook argTypes only", 2, 3, 4, 1, 1, 5, 3, "62"),
        ("E · FieldSpec split out of the inspector you already have", 5, 5, 4, 5, 5, 4, 4, "<b>125</b>"),
    ]
    score_html = "".join(
        f"<tr class='{'win' if r[0].startswith('E') else ''}'><td>{r[0]}</td>"
        + "".join(f"<td style='text-align:center'>{v}</td>" for v in r[1:8])
        + f"<td style='text-align:center'>{r[8]}</td></tr>" for r in score)

    stock = [
        ("Segmented control (S/M/L/XL, Left/Center, Show/Hide)",
         "hand-rolled <code>SegmentedControl</code> in <code>variants/kit.tsx</code>",
         "Base UI <code>ToggleGroup</code> (already a dep: <code>@base-ui/react@1.8.0</code>)",
         "tldraw’s <i>mixed</i> third state; keyboard arrow nav; the tile grid with SVG paths"),
        ("Drag-scrub number", "<code>ScrubNumber.tsx</code>, 430 lines, hand-rolled pointer maths",
         "<span class='have'>keep hand-rolled</span> — Base UI <code>NumberField</code> is already its root; "
         "no library ships Figma-style scrub",
         "the 2px threshold, <code>ew-resize</code>, expression parsing (<code>100/2</code>, <code>+6</code>), the <code>fallback</code> origin"),
        ("Colour well", "<code>react-colorful</code> <code>HexAlphaColorPicker</code>", "unchanged (stock seam)",
         "alpha; the swatch row stays ours because the palette is tldraw’s"),
        ("Badge / Pill", "<code>BlockChip</code> + hand CSS", "shadcn <code>Badge</code> (Base UI variant)",
         "the reserved chip region — <code>CHIP_INSET_RIGHT</code>/<code>CHIP_TITLE_GAP</code>; the chip must never paint over live title text"),
        ("Variant → className", "template strings + <code>cn()</code>",
         "<code>cva</code> — <b>only</b> where shadcn already vendored it (<code>components/ui/*</code>)",
         "do <b>not</b> promote cva to the schema: it carries no label, caption, unit, min/max, swatch or <i>mixed</i>"),
        ("Component catalogue + controls", "<code>apps/playground</code> + <code>demos/compare</code>",
         "Storybook 9 (<code>@storybook/react-vite</code>) + <code>@storybook/addon-vitest</code>",
         "the playground stays — it is the <i>authoring</i> canvas, not a catalogue; compare stays, it measures 0.00px divergence"),
        ("Interaction test", "<code>demos/drive-*.mjs</code> CDP journeys",
         "<code>play</code> + <code>storybook/test</code> (<code>userEvent</code>, <code>expect</code>), run in real Chromium by the Vitest addon",
         "the journeys keep everything needing a real camera, two hosts at once, or detach/rebuild"),
        ("Port label + dot in React Flow",
         "<code>portDotClass()</code> + <code>&lt;Handle&gt;</code> in <code>adapter-reactflow</code>",
         "React Flow UI <code>LabeledHandle</code> — <code>npx shadcn@latest add https://ui.reactflow.dev/labeled-handle</code>",
         "our six placements and five states; copy theirs for the handle plumbing only, inside the adapter"),
        ("Everything under <code>ARCHITECTURE.md</code>’s line", "—", "<b>unchanged (stock seam)</b>",
         "layout geometry portable in core; interaction geometry host-owned. No part of this proposal moves that line."),
    ]
    stock_html = "".join(f"<tr><td>{a}</td><td>{b}</td><td>{c}</td><td>{d}</td></tr>" for a, b, c, d in stock)

    rf_dupes = [
        ("<code>LabeledHandle</code>", "Port + label", "<b>Copy it</b> — but only into <code>adapter-reactflow</code>; it imports <code>@xyflow/react</code>"),
        ("<code>BaseNode</code>", "Block container", "Read, don’t copy. It is a Tailwind card; bbox-ui’s Block is far more specified"),
        ("<code>LabeledGroupNode</code>", "Region view", "<b>Read it before designing Region.</b> Same problem, already solved once"),
        ("<code>NodeAppendix</code>", "the ⋮ footer", "Read it. May be the whole footer"),
        ("<code>NodeStatusIndicator</code>", "<code>received</code> / running chrome", "Read before inventing a “running” state"),
        ("<code>BaseHandle</code> · <code>ButtonHandle</code>", "PortDot variants", "Read; ours is stricter (5 states, 3 diameters)"),
        ("<code>NodeTooltip</code> · <code>NodeSearch</code> · <code>ZoomSlider</code> · <code>DevTools</code>", "chrome", "Not our problem — host chrome"),
        ("<code>DataEdge</code> · <code>ButtonEdge</code> · <code>AnimatedSvgEdge</code>", "cables", "Host-owned by our own rule. Use theirs in the React Flow demo"),
    ]
    rf_html = "".join(f"<tr><td>{a}</td><td>{b}</td><td>{c}</td></tr>" for a, b, c in rf_dupes)

    ladder = [
        ("T0", "<b>Port, end to end</b> — the tracer bullet",
         "<code>packages/schema</code> (FieldSpec + toArgTypes + readFields, zero deps) · "
         "<code>port.fields.ts</code> · <code>Port.stories.tsx</code> with 6 state stories and one "
         "<code>play</code> · <code>.storybook/preview.tsx</code> with the <code>host</code> toolbar and the "
         "three-host decorator · the playground inspector fed by the same array.",
         "<b>Done when</b> one <code>Port</code> story renders in DOM, in a React Flow node and in a tldraw "
         "shape from one toolbar, and <code>state</code> changed in Storybook Controls and in the demo "
         "inspector do the identical thing."),
        ("T1", "The <code>Appearance</code> group", "7 shared fields (line ×4, fill ×3) applied to Port + Pill; "
         "one <code>appearanceFields</code> array reused, not copied.",
         "Proves the group composes before eleven components depend on it."),
        ("T2", "Glyph · TextBox · Pill", "three components, three <code>*.fields.ts</code>, three story files. "
         "Autodocs now has something to document.", "First point at which the gallery in this report is real code."),
        ("T3", "RowContainer + PortEdge", "lane geometry in the core; dnd-kit reorder in the <i>demo</i>, "
         "never in the core (PEP 0013).", "Proves the host/core line survives a gesture."),
        ("T4", "<code>presets.ts</code> + Block Simple View’s nine variants",
         "each preset used twice: story <code>args</code> and the inspector’s preset picker.",
         "This is where the Shopify idea pays — see §6a."),
        ("T5", "Block Port View", "header slots, header sizes, folding, the four visibility flags, "
         "hidden-port summary.", "Now the board’s biggest band is code."),
        ("T6", "Members · Expanded · Region · black-box", "recursion + the <code>mapping</code> trick for "
         "member arrays in Controls (§6d).", "The recursive claim gets tested, not asserted."),
        ("T7", "Merge <code>claude/code-field</code> into the family", "CodeField becomes TextBox’s big brother; "
         "the signature grammar becomes the Port label’s editor.", "Closes the “a port is one line of code” arc."),
    ]
    ladder_html = "".join(
        f"<tr><td><b>{a}</b></td><td>{b}</td><td>{c}</td><td>{d}</td></tr>" for a, b, c, d in ladder)

    decisions = [
        ("1", "Where the schema lives",
         "New <code>packages/schema</code> — <code>FieldSpec</code> (declaration) + <code>FieldReading</code> "
         "(declaration + value/mixed), <code>toArgTypes()</code>, <code>readFields()</code>. Zero deps, no React.",
         "Create it. It is ~120 lines and it is the hinge of everything else."),
        ("2", "Storybook or Ladle",
         "Storybook 9 (<code>@storybook/react-vite</code>) + <code>@storybook/addon-vitest</code>. Ladle is ~20× "
         "lighter and CSF-compatible, but its docs cover neither a custom global toolbar nor <code>object</code>/"
         "<code>mapping</code> controls nor play functions — and those three are exactly what makes the "
         "three-host plan and the recursive <code>members</code> control work.",
         "Storybook, with the Tailwind v4 plugin added inside <code>viteFinal</code> (documented friction, "
         "documented fix). Revisit only if install weight actually hurts."),
        ("3", "One inspector or two",
         "Keep <code>packages/inspector</code>. Add a second entry point that takes "
         "<code>FieldReading[]</code> instead of a tldraw <code>Editor</code>. Do not fork, do not rewrite, "
         "do not try to embed Storybook’s Controls panel in the product.",
         "Extend in place behind a new export. The existing tldraw-shape mode keeps working untouched."),
        ("4", "Where presets live",
         "<code>packages/bbox-ui/src/presets.ts</code> — in the <i>core</i>, not in <code>.storybook</code>. "
         "Stories import them; the inspector’s preset picker imports them; the toolbar’s “new Block” imports them.",
         "Core. A preset in a story file can only ever be a story."),
        ("5", "React Flow UI",
         "Copy <code>LabeledHandle</code> into <code>adapter-reactflow</code>. Read "
         "<code>LabeledGroupNode</code>, <code>NodeAppendix</code> and <code>NodeStatusIndicator</code> before "
         "designing Region, the footer, and any running-state chrome. Design nothing that already exists there.",
         "Copy the one, read the three, design none of them."),
        ("6", "Polarity",
         "Authored <code>'n'|'e'|'s'|'w'</code> with a default derived from which array the port sits in "
         "(inputs → W, outputs → E). The <i>host</i> may compute a better one and pass it down as a prop. "
         "The core never inspects edges.",
         "Ship it authored. “Detect it dynamically” would put edge knowledge in the core and break the one "
         "rule the repo rests on."),
    ]
    dec_html = "".join(
        f"<tr><td><b>{a}</b></td><td><b>{b}</b></td><td>{c}</td><td>{d}</td></tr>"
        for a, b, c, d in decisions)

    shots_line = (f"{len(m['captures'])} real captures, driven headlessly through "
                  f"<code>tests/browser_harness.mjs</code> against SystemSketch main")

    return f"""<title>bbox-ui Component Proposal</title>
<style>{CSS}</style>
<div class="wrap">

<h1>bbox-ui — the component family, the schema, and one storybook in three hosts</h1>
<p class="sub">A proposal, not an implementation. Drawn from
<code>bbox-ui-v3-2pm-sep-10-2026.systemsketch</code> · {DATE} · {ed}</p>
<p class="meta">{other}</p>

<p class="lede">Your board is not a drawing of eleven components. It is a drawing of
<b>one schema</b> — {m['board_shapes']} shapes, of which {m['board_texts']} are text labels and
{m['board_by_type'].get('geo', 0)} are plain rectangles standing in for components that do not exist yet.
Every band on it — Glyph <i>size</i>, TextBox <i>padding</i>, Port <i>state</i>, Block <i>view</i> — is a
field with a closed set of values. The nine “Simple View variants” are not nine components; they are nine
<b>arg bundles</b> of one. So the first thing to build is not a component. It is the field vocabulary —
and you already own two thirds of it.</p>

<ul class="toc">
<li><a href="#f">§1 · The family, named and leveled</a></li>
<li><a href="#c">§2 · How they come together</a></li>
<li><a href="#g">§3 · The gallery — board · real capture · unstyled mock</a></li>
<li><a href="#s">§4 · The schema decision</a></li>
<li><a href="#h">§5 · One storybook, three hosts</a></li>
<li><a href="#n">§6 · What you are not seeing</a></li>
<li><a href="#l">§7 · The ladder</a></li>
<li><a href="#d">§8 · Decisions</a></li>
<li><a href="#e">Appendix · the rest of the evidence</a></li>
</ul>

<div class="note"><b>Measured, not remembered.</b>
Board: <b>{m['board_records']}</b> records, <b>{m['board_shapes']}</b> shapes — {bt}.
Only <b>{m['board_real_blocks']}</b> of them are real SystemSketch objects; the rest is hand-drawn.
bbox-ui: <b>{m['registry_count']}</b> registry items ({', '.join('<code>'+i+'</code>' for i in m['registry_items'])}),
<b>{len(m['core_components'])}</b> exported core components, <b>{m['layout_exports']}</b> exports in <code>layout.ts</code>,
plus <b>{len(m['code_field_items'])}</b> more items waiting on <code>claude/code-field</code>.
SystemSketch: Block has <b>{m['block_prop_count']}</b> props and <b>{len(m['block_views'])}</b> views
({', '.join('<code>'+v+'</code>' for v in m['block_views'])}); <code>BlockPort</code> has
<b>{m['port_field_count']}</b> fields. Evidence: {shots_line}.</div>

<h2 id="f">§1 · The family, named and leveled</h2>
<p>Eleven things, in four levels plus a data layer, plus a firm list of what stays a host adapter.
The <b>status</b> column is the honest one: less is new than it looks.</p>
<div class="scroll"><table>
<tr><th></th><th>component</th><th>what it is</th><th>status</th><th>evidence / donor</th></tr>
{fam}
</table></div>
<p class="mk-lab">Per-component props, with the board variant each maps to and its control type, are in
the gallery (§3) — one table per component, beside its mock.</p>

<h2 id="c">§2 · How they come together</h2>
{COMPOSITION_SVG}

<h3>The slot model — seven “header layouts” are three slots and two enums</h3>
<p>The board names seven header layouts (type compact, title badge, other tools/text, centered, folding
left, folding right, play button + 15.1ms). Modelling those as a seven-way enum would be a mistake: the
eighth one arrives next week. They are all the same <code>RowContainer</code> with three slots filled
differently, plus two genuine enums.</p>
{code('''
<Block.Header size="m" align="left" foldSide="left">
  <Block.HeaderLeft>   <Glyph/> <TextBox rung="title"/> </Block.HeaderLeft>
  <Block.HeaderCentre> ...optional... </Block.HeaderCentre>
  <Block.HeaderRight>  <Pill>Draft 1</Pill> <TextBox rung="type"/> <Tool icon="play"/> </Block.HeaderRight>
</Block.Header>

// board "w/ play button + text 15.1ms"  ==  HeaderRight={<><TextBox>15.1ms</TextBox><Tool icon="play"/></>}
// board "centered"                      ==  align="center"
// board "w/ folding right"              ==  foldSide="right"
''')}

<h3>The style model — one <code>Appearance</code>, not seven props on eleven components</h3>
<p>Your board note asks for tldraw/Excalidraw’s Line (style, colour, thickness, opacity) and Fill (style,
colour, opacity) “for all the shapes”. That is seven controls. Repeating them as props on every component
is 77 props and seven chances to diverge. One object, accepted at every level and inherited downward,
is seven <code>FieldSpec</code>s written once:</p>
{code('''
interface Appearance {
  line?: { style?: 'solid'|'dashed'|'dotted'|'none'; width?: 'thin'|'med'|'thick';
           color?: string; opacity?: number }
  fill?: { style?: 'none'|'semi'|'solid'|'pattern'; color?: string; opacity?: number }
}
// every bbox-ui component takes `appearance?: Appearance` and puts it on a CSS custom-property
// scope, so a child inherits unless it overrides.  `color` defaults to `currentColor`, which is
// how a token and a per-shape override are the same mechanism (§6e).
''')}

<h2 id="g">§3 · The gallery</h2>
<p>Each row: what the board says · what SystemSketch paints <b>today</b> (real capture, driven headlessly,
every one looked at before it was embedded) · the unstyled mock, as real DOM so it is the seed of the
future story · the proposed props.</p>
{gallery(m, heavy)}

<h2 id="s">§4 · The schema decision</h2>
<p>One schema per component has to drive five surfaces: TypeScript props, Storybook
<code>argTypes</code>/Controls, the right-hand inspector inside the demos, Autodocs, and the registry
item’s documentation. Criteria first.</p>

<div class="scroll"><table>
<tr><th>criterion</th><th>weight</th></tr>{crit_html}</table></div>

<div class="scroll"><table class="score">
<tr><th>option</th><th>truth</th><th>spec</th><th>stock</th><th>neutral</th><th>tldraw-like</th><th>speed</th><th>CI</th><th>score</th></tr>
{score_html}</table></div>

<div class="rec"><b>Recommendation — E.</b> Not because the others are bad, but because
<b>you already wrote it</b>. <code>packages/inspector/src/inspector/inspectorModel.ts</code>
({m['inspector_model_lines']} lines) opens with: “Everything a stock tldraw primitive can be told, as one
list of fields. The panel that renders this is deliberately dumb.” Its <code>InspectorControl</code> has
<b>{len(m['inspector_control_fields'])}</b> fields and <b>{len(m['control_kinds'])}</b> control kinds
({kinds}). That is a superset of Storybook’s <code>argTypes</code> on every axis except one.</div>

<h3>What <code>InspectorControl</code> already has that <code>argTypes</code> does not</h3>
<div class="scroll"><table>
<tr><th>Storybook <code>argTypes</code></th><th>bbox-ui <code>InspectorControl</code></th><th></th></tr>
<tr><td><code>name</code></td><td><code>label</code></td><td>same</td></tr>
<tr><td><code>control.type</code></td><td><code>kind</code></td><td>same, 9 vs {len(m['control_kinds'])} kinds</td></tr>
<tr><td><code>options</code></td><td><code>options[{{value,label,swatch,path}}]</code></td><td>ours carries the swatch colour and the tile’s SVG path</td></tr>
<tr><td><code>control.{{min,max,step}}</code></td><td><code>min/max/step</code> + <code>unit</code> + <code>glyph</code> + <code>fallback</code></td><td>ours knows the scrub origin and the unit</td></tr>
<tr><td><code>table.category</code></td><td><code>caption</code> + group</td><td>two levels, Figma-shaped</td></tr>
<tr><td><code>description</code></td><td><code>hint</code></td><td>same</td></tr>
<tr><td><code>if: {{arg, eq}}</code></td><td><span class="new">missing</span></td><td>the one thing to steal back</td></tr>
<tr><td>—</td><td><code>value: … | null</code></td><td><b>mixed</b> across a multi-selection. Storybook has no concept of this and never will</td></tr>
<tr><td>—</td><td><code>unset</code> · <code>overridden</code> · <code>disabled</code></td><td>“auto”, “overriding the engine”, “engine-derived”</td></tr>
<tr><td>—</td><td><code>source: {', '.join(m['control_sources'])}</code></td><td>where the write goes</td></tr>
</table></div>

<div class="note"><b>The bug hiding in that table.</b> <code>InspectorControl</code> conflates a
<i>declaration</i> (label, kind, options, min/max) with a <i>reading</i> (value, unset, overridden,
mixed). That is why it can only be produced by <code>getPrimitiveInspectorModel(editor)</code> — a
function that needs a live tldraw editor. Split the two and the declaration half becomes portable,
static, and exactly the shape <code>argTypes</code> wants. <b>That split is the entire proposal’s
load-bearing move.</b></div>

{code(SCHEMA_TS)}
{code(FIELDS_TS)}
{code(ARGTYPES_TS)}
{code(STORY_TSX)}
{code(INSPECTOR_TSX)}

<h3>Why not the other four</h3>
<ul class="tight">
<li><b>CVA</b> — it is a <code>className</code> builder. <code>VariantProps&lt;typeof x&gt;</code> is genuinely
useful for types, but a cva config carries no label, no caption, no unit, no min/max, no swatch colour, no
ordering, and no <i>mixed</i>. In this repo cva appears only inside shadcn’s vendored
<code>components/ui/*</code> (button, tabs, toggle, sidebar, field, input-group) — it is boilerplate that
arrived with the CLI, not an authoring pattern. Leave it there; do not promote it.</li>
<li><b>zod → JSON Schema → RJSF</b> — good runtime validation, but a swatch row, a tile grid of SVG paths,
a drag-scrub with a <code>fallback</code> origin and a <code>unit</code> are not expressible in JSON Schema
without a <code>uiSchema</code> sidecar — which is a second schema, i.e. the thing you are trying to
avoid. And it adds a runtime dependency to a package whose whole pitch is that it has two.</li>
<li><b>hand-written JSON Schema</b> — same sidecar problem, minus the type inference.</li>
<li><b>argTypes only</b> — lives in story files, so the product inspector cannot import it without
importing Storybook into the product.</li>
</ul>
<p><b>Keep TypeScript as the source of <i>types</i>, and the fields array as the source of
<i>controls</i>.</b> react-docgen already feeds Autodocs from the props interface; the
<code>as const satisfies readonly FieldSpec[]</code> plus one test asserting every <code>field.id</code>
is a real prop key is what stops the two drifting.</p>

<h3>Stock part mapping</h3>
<div class="scroll"><table>
<tr><th>element</th><th>today</th><th>off-the-shelf part (exact name)</th><th>behaviour that must survive</th></tr>
{stock_html}</table></div>

<h2 id="h">§5 · One storybook, three hosts</h2>
<p>You asked to see every component live inside a React Flow and a tldraw whiteboard, with the same
controls. Storybook has exactly the seam for it: a <b>global</b> declared in <code>globalTypes</code>
gives you a toolbar dropdown, and a <b>global decorator</b> reads <code>context.globals</code> and
decides what tree the story mounts inside. One global, one decorator, every story — including ones
written next year — becomes viewable in all three hosts for free.</p>
{code(PREVIEW_TSX)}
{code(TLDRAW_HOST_TSX)}
<ul class="tight">
<li>The three host wrappers live in <code>demos/story-hosts/</code>. <b>Never in the core</b> — the
moment <code>packages/bbox-ui</code> imports tldraw, the one rule that makes a third host a
150-line afternoon is gone.</li>
<li>The tldraw host needs a fixed-height container and the shape registered once at module scope.
A <code>ShapeUtil</code> class created per render re-registers the shape and tldraw throws.</li>
<li>A story that reads <code>context.globals.host</code> itself is a smell — the story should not know.
Only the decorator knows.</li>
</ul>

<h3>Do <code>play</code> functions replace <code>drive-*.mjs</code>?</h3>
<p><b>No — they have different oracles, and collapsing them would lose the one that matters.</b></p>
<div class="scroll"><table>
<tr><th></th><th><code>play</code> (+ Vitest addon)</th><th><code>demos/drive-*.mjs</code></th></tr>
<tr><td>asserts</td><td>the <i>component’s</i> contract — DOM, roles, keyboard, state transitions</td>
    <td>the <i>integration</i> — real pointer gestures, camera, two hosts at once, detach → stock → rebuild, 0.00px divergence</td></tr>
<tr><td>runs in</td><td>real Chromium via Playwright (the addon is browser-mode, not jsdom) — Vite frameworks only, which bbox-ui is</td><td>headless Chrome over CDP, against a real vite + host app</td></tr>
<tr><td>keep?</td><td><b>add</b></td><td><b>keep all of them</b></td></tr>
</table></div>
<p><b>Recommendation:</b> <code>play</code> takes over the DOM-shaped assertions currently buried in the
drive scripts; the drive scripts keep everything a Storybook iframe structurally cannot do — a camera, a
second engine, a right-click context menu, a real resize handle, a pixel comparison. Two suites, no
overlap, and the drive scripts get shorter.</p>

<h3>“A storybook-like inspector panel on the right” — which one is it?</h3>
<p><b>Both, and that is fine, because they render the same array.</b></p>
<ul class="tight">
<li><b>Inside Storybook</b> it is the stock <b>Controls addon</b>, fed <code>toArgTypes(fields)</code>.
Do not replace it — you would lose Autodocs, the args URL state and the reset-to-default plumbing for free.</li>
<li><b>Inside the demos and, later, the product</b> it is a copy-in <code>&lt;Inspector&gt;</code> —
the one in <code>packages/inspector</code>, {m['inspector_files']} files, which already has the drag-scrub
field, the colour well, the segmented tiles and the swatch rows — fed
<code>readFields(fields, selection)</code>.</li>
<li>The product panel is the <b>harder</b> of the two: it must handle N subjects and render <i>mixed</i>.
Storybook’s Controls is its degenerate single-subject case. Build the product one; Storybook’s comes free.</li>
</ul>

<h2 id="n">§6 · What you are not seeing</h2>

<h3>a · The schema is the product; the panel is a consequence</h3>
<p>The Shopify insight you pointed at is not the panel — it is that a section’s <code>settings</code>
<b>and</b> its <code>presets</code> are data in the same file, and the editor is generated from them.
Your nine presets (Type, Function, Type Mapping, Class, Component, System, For, While, Conditional) are
precisely Shopify presets: <i>named bundles of setting values</i>. And a Storybook story is also a named
bundle of arg values. <b>They are the same object.</b> One <code>presets.ts</code> can be all three: the
stories’ <code>args</code>, the inspector’s preset picker, and the toolbar’s “new Block of kind X”
defaults. Write it early, not last.</p>
<p class="mk-lab">Novelty check: the vault has <b>zero</b> references to Shopify’s theme editor or
settings_schema.json, and Storybook appears twice in passing (a 2026-07-16 deep-research citation about
docs tabs, and a note that Penpot’s design system uses it) with no analysis and no decision. This is new
ground, not a restatement.</p>

<h3>b · <code>hidden</code> is structural — so it cannot be an appearance control</h3>
<p>Your board is emphatic: “Completely remove it, we don’t want it to be selectable either. If you just
set 0 opacity, it could not be there but still capture mouse clicks.” Right — and the consequence goes
further than hit-testing. Removing a port row <b>reflows the block</b>, which changes what
<code>blockLayout.ts</code> returns, which changes what <b>detach</b> draws and what the compare harness
measures. A <code>visible</code> toggle filed under Appearance would be a bug that only surfaces at
detach time, in the other host. Mark it <code>structural: true</code> in the <code>FieldSpec</code> and
keep it out of the <code>Appearance</code> group. SystemSketch already models it correctly —
<code>visible: boolean</code> on <code>BlockPort</code>, with <code>hiddenPortSummaries()</code> doing
the reflow and the “+N more” line.</p>

<h3>c · “Detect polarity dynamically” contradicts the rule the repo rests on</h3>
<p>If polarity is derived from what is connected, the core has to know about edges. It must not —
<code>ARCHITECTURE.md</code>: “interaction geometry is host-owned and never travels”, and the core has
“zero imports of tldraw, zero imports of React Flow”. Resolution: <b>polarity is authored</b>, with a
default derived from which array the port sits in (inputs → W, outputs → E). A host that <i>can</i>
compute a better one from its own edge graph passes it down as a prop. The direction of the flow is
decided at the landing, by the host — which is already your ruling for cables.</p>

<h3>d · “Everything is a Block” collides with Storybook’s per-component story tree</h3>
<p>If members are Blocks, a Block story’s <code>members</code> arg is an array of Block args, and
Storybook’s <code>object</code> control renders that as a raw JSON editor — technically correct,
practically unusable. The stock answer is <code>argTypes.mapping</code>: the control offers short option
strings and the mapping holds the real complex values.</p>
{code('''
argTypes: {
  members: {
    control: 'select',
    options: ['none', 'three', 'nested'],       // what you click
    mapping: {                                  // what the component receives
      none:   [],
      three:  [PRESETS.component, PRESETS.component, PRESETS.component],
      nested: [{ ...PRESETS.system, members: [PRESETS.component] }],
    },
  },
}
''')}
<p>And the recursion does not need a “member story tree”: a member is a Block, so
<code>Block.stories.tsx</code> covers it. What you <i>do</i> want is one story per <b>containment
rule</b> — stack vs free, fill vs own width, black-box on vs off — because those are the rules that break.</p>

<h3>e · Unstyled now, styled later — which rows are tokens and which are props</h3>
<p>The rule that survives: <b>if two blocks on one board may legitimately differ, it is a prop; if they
must agree for the board to look like one product, it is a token.</b></p>
<div class="scroll"><table>
<tr><th>token (<code>theme.css</code>, <code>--bbox-*</code>)</th><th>prop (<code>FieldSpec</code>)</th></tr>
<tr><td>the rung <i>scale</i> itself — {esc(m['text_sizes']).replace(chr(10),' ')}</td><td><i>which</i> rung: <code>size: 'sm'|'md'|'lg'|'xl'</code></td></tr>
<tr><td>port diameters {esc(m['port_diameters']).replace(chr(10),' ')} and <code>ICON_RATIO {m['icon_ratio']}</code></td><td><code>size</code>, and <code>diameter</code> for an exact override</td></tr>
<tr><td>hairline colour, radius, default gap/gutter, the sans/sketch/mono families</td><td><code>font</code>, <code>align</code>, <code>justify</code>, <code>padding</code></td></tr>
<tr><td>line <i>thickness scale</i> (thin/med/thick → px)</td><td><code>line.width</code> — which rung</td></tr>
</table></div>
<p><b>The trap is line colour.</b> The board lists it under Line, i.e. a prop — but nine times in ten you
want the token. Make <code>line.color</code> default to <code>currentColor</code>: it inherits the theme
unless someone overrides it, so the token and the per-shape override are one mechanism rather than two
that fight.</p>

<h3>f · The real cost per component is not the component</h3>
<p><code>ARCHITECTURE.md</code>’s second detach rule: “Geometry from the layout authority — the detached
picture derives from <code>layout.ts</code> + <code>blockLayout.ts</code>, never from re-measured DOM,
never hand-typed offsets.” So <b>every new component needs a pure box function</b>, or it cannot detach,
cannot rebuild, and cannot be compared across the two hosts at 0.00px. The honest per-component cost is
six artefacts:</p>
<p class="tree">component.tsx  +  component.fields.ts  +  layoutComponent()  +  DetachableKind  +  registry item  +  Component.stories.tsx</p>
<p>Eleven components × six is the budget. That is why §7 starts with <i>one</i> component all the way
through rather than eleven components half way.</p>

<h3>g · React Flow UI already ships some of these — copy, do not design</h3>
<div class="scroll"><table>
<tr><th>theirs</th><th>your band</th><th>verdict</th></tr>{rf_html}</table></div>
<p class="mk-lab">Installed by the same CLI you already use
(<code>npx shadcn@latest add https://ui.reactflow.dev/&lt;name&gt;</code>) and they require React 19 +
Tailwind 4 — which this repo already is. Every one of them imports <code>@xyflow/react</code>, so they
can only live in <code>packages/adapter-reactflow</code>.</p>

<h3>h · Registry granularity</h3>
<p>shadcn resolves <code>registryDependencies</code>, so <b>one item per primitive, plus one composite
<code>block</code> item that depends on them</b>, is the CLI-native shape and the only one that honours
“copy-paste components you own” — someone can take just <code>port</code>. Today’s
{m['registry_count']} items already have exactly this shape, with <code>bbox-layout</code> as the shared
lib dependency. Keep it; add <code>glyph</code>, <code>text-box</code>, <code>pill</code>,
<code>row-container</code>, <code>port-edge</code> as siblings rather than folding them into
<code>block</code>.</p>

<h3>i · Storybook’s weight, honestly</h3>
<ul class="tight">
<li><b>Ladle</b> is a genuine alternative: CSF-compatible, ~250KB of assets against Storybook 6.4’s
5.1MB by its own README. Its documented controls are boolean, number, range, select, multi-select, radio,
inline-radio, check, inline-check — with <b>no</b> documented colour control, <b>no</b> object/array
control, <b>no</b> <code>mapping</code>, <b>no</b> custom global toolbar, and <b>no</b> play functions.
Those absences are precisely the three features this plan needs.</li>
<li><b>Tailwind v4 + Storybook 9 + Vite has real friction</b>, all documented in the open:
<code>@tailwindcss/vite</code> is not picked up by Storybook’s own Vite instance;
<code>ERR_PACKAGE_PATH_NOT_EXPORTED</code> on <code>@tailwindcss/vite/package.json</code>; a crash when
<code>mergeConfig</code> is imported at the top of <code>main.ts</code> on SB 9.1.1 / Vite 7.1.1.
The fix is known and small: add the plugin inside <code>viteFinal</code>, with a dynamic import.
Budget an hour, not a day.</li>
<li>The tldraw host inside Storybook is the one genuinely unproven piece of this plan. It should be the
<i>first</i> thing T0 builds, not the last — if it does not work, the three-host toolbar becomes a
two-host toolbar and the rest of the plan is unchanged.</li>
</ul>

<h2 id="l">§7 · The ladder</h2>
<div class="scroll"><table>
<tr><th></th><th>rung</th><th>what it is</th><th>why this order</th></tr>{ladder_html}</table></div>

<h3>What to copy from SystemSketch first</h3>
<ul class="tight">
<li><code>layoutBlock.ts</code> → <code>hiddenPortSummaries()</code>’s reflow rule and the “+N more” placement.</li>
<li>The rung <i>names</i>: <code>titleSize</code>/<code>titleFont</code>/<code>titleAlign</code> already use
the board’s own words. Do not invent new ones.</li>
<li><code>src/appearance/strokeMeta.ts</code>’s option sets — thin/medium/thick and
solid/dashed/dotted/async — so the two products offer the identical vocabulary.</li>
<li><code>memberStack.ts</code>’s <code>fill | own</code> width rule, which is the whole of “the width of
the largest child drives the width”.</li>
</ul>
<h3>What never moves into bbox-ui</h3>
<p>Most of SystemSketch’s Block is <b>meaning</b>, not presentation. Of its {m['block_prop_count']} props,
the ones that must stay behind include <code>definitionId</code>, <code>definitionKey</code>,
<code>fieldDiffs</code>, <code>priorPose</code>, <code>draftOrdinal</code>, <code>attributeSource</code>,
<code>stockConfig</code>, <code>expandedWeights</code>; and of <code>BlockPort</code>’s
{m['port_field_count']} fields, <code>semanticRoleDerived</code>, <code>semanticRoleAuthored</code>,
<code>link</code>, <code>variadic</code>, <code>mutates</code>, <code>effect</code>,
<code>stateBefore</code>. Also staying: cables and bindings, autosave and board files, connection routing,
the behaviour-tree XML canon. <b>bbox-ui is presentation. SystemSketch keeps the meaning.</b></p>

<h2 id="d">§8 · Decisions</h2>
<p>Six. Each carries the reversible default I will take if you say nothing.</p>
<div class="scroll"><table>
<tr><th></th><th>decision</th><th>recommendation</th><th>default if you say nothing</th></tr>{dec_html}</table></div>

<div class="note"><b>What would change my mind.</b> (1) If the tldraw <code>ShapeUtil</code> will not
mount cleanly inside a Storybook iframe, the three-host toolbar drops to two and the React Flow host
carries the “see it in a whiteboard” requirement alone — everything else stands. (2) If you want the
inspector to ship <i>inside SystemSketch</i> rather than inside bbox-ui demos, the schema package needs
to be publishable separately and the decision-3 “extend in place” answer flips to a real extraction.
(3) If Storybook’s install weight actually bites in this monorepo, Ladle plus a hand-rolled host
dropdown is a real fallback — the <code>FieldSpec</code> layer is unchanged either way, which is the
point of putting it in its own package.</div>

<div class="note"><b>What I could not verify.</b> tldraw mounted inside a Storybook iframe (not
attempted — no implementation in this task). The exact Storybook 9 install weight in this pnpm workspace.
Whether <code>@storybook/addon-vitest</code> and the pinned <code>vitest@3</code> here agree without a
bump. The React Flow UI components were read from their published docs, not installed.</div>

<h2 id="e">Appendix · the rest of the evidence</h2>
<p>Six more captures from the same headless run, each one looked at before it was embedded.</p>
{evidence(heavy)}

<p class="meta">Built by <code>docs/build_component_proposal.py</code> · every number above measured from
the tree at build time · branch <code>claude/component-proposal</code> · {DATE}</p>
</div>
"""


def main() -> int:
    m = measure()
    light = BRANCH_ROOT / "reports" / f"bbox-ui-component-proposal-{DATE}.html"
    heavy = BBOX_MAIN / "reports/media" / f"bbox-ui-component-proposal-{DATE}.html"
    light.parent.mkdir(parents=True, exist_ok=True)
    heavy.parent.mkdir(parents=True, exist_ok=True)

    lh = page(m, heavy=False)
    light.write_text(lh, encoding="utf-8")
    hh = page(m, heavy=True)
    heavy.write_text(hh, encoding="utf-8")

    import urllib.parse
    for label, p in (("light", light), ("heavy", heavy)):
        disk = p.stat().st_size
        enc = len(urllib.parse.quote(p.read_text(encoding="utf-8")))
        print(f"{label:5} {disk:>9,} B on disk   {enc:>9,} B encoded   {p}")
        if label == "light" and disk > LIGHT_CAP:
            print(f"  !! light page over {LIGHT_CAP:,} B — it must carry no captures", file=sys.stderr)
            return 1
        if enc > 2_097_024:
            print("  !! over the 2,097,024-byte preview ceiling — browser only", file=sys.stderr)
    print(f"captures embedded: {len(m['captures'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
