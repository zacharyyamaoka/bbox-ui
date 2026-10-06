#!/usr/bin/env python3
"""docs/build_host_less_shell_report.py — the "no-host shell" proposal, as one page.

Zach, 2026-09-19 (PROJECT - Black Box UI, "Sept 19 2026"): he wants a *no-host*
application — every window around the canvas, missing only the whiteboard — that
either host (tldraw, or React Flow via a `simple-reactflow-whiteboard`) can drop
in behind it, and asked for thoughts. This builds the answer: his own diagram,
redrawn from his board's real coordinates, the evidence measured from the live
tree, and the decisions with verdict buttons.

Nothing here is built. It is a proposal, so the mock IS the diagram.

    python3 docs/build_host_less_shell_report.py

Output: /home/bam/bbox-ui/reports/host-less-shell-2026-09-19.html — the MAIN
checkout's reports/, by absolute path, even when run from a worktree (a report
written into a worktree dies when the worktree is swept). Text + inline SVG only,
so it belongs to the tracked half of reports/ (no data-URI payload).

Numbers are measured at build time, never typed: chrome size, tldraw coupling,
the `editor.*` surface, and React Flow's real public API all come from the tree.
The diagram geometry is a citation of a file, not a measurement:
  /home/bam/SystemSketch/bbox ui package depency.systemsketch
  (22 shapes, 16 bindings — read-only; arrow direction = "depends on", and two
  arrow starts are unbound, so they were inferred from position: scene->components
  and no-host->editor).
"""
from __future__ import annotations

import html
import math
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
MAIN = Path("/home/bam/bbox-ui")
OUT = MAIN / "reports" / "host-less-shell-2026-09-19.html"
APP_SRC = REPO / "apps" / "systemsketch" / "src"
NODE_MODULES = REPO / "node_modules" if (REPO / "node_modules").exists() else MAIN / "node_modules"


# ───────────────────────────── measurements ─────────────────────────────
def lines(path: Path) -> int:
    return len(path.read_text(errors="replace").splitlines())


def is_test(path: Path) -> bool:
    return bool(re.search(r"\.(test|smoke\.test)\.tsx?$", path.name))


def src_files(directory: Path) -> list[Path]:
    return sorted(p for p in directory.rglob("*") if p.suffix in {".ts", ".tsx"} and not is_test(p))


def measure_app() -> dict:
    by_dir = {}
    for name in ["chrome", "shapes", "backend", "document", "source"]:
        d = APP_SRC / name
        files = src_files(d) if d.exists() else []
        by_dir[name] = (sum(lines(p) for p in files), len(files))
    top = [p for p in APP_SRC.glob("*.ts*") if not is_test(p)]
    by_dir["top-level"] = (sum(lines(p) for p in top), len(top))

    chrome = src_files(APP_SRC / "chrome")
    tldraw_importers = [p for p in chrome if re.search(r"""from\s+["']tldraw["']""", p.read_text())]
    methods: dict[str, int] = {}
    for p in chrome:
        for m in re.findall(r"\beditor\.([a-zA-Z]+)", p.read_text()):
            methods[m] = methods.get(m, 0) + 1
    hooks: dict[str, int] = {}
    for p in chrome:
        for h in re.findall(r"\b(useValue|useEditor|useToasts|useDialogs)\b", p.read_text()):
            hooks[h] = hooks.get(h, 0) + 1
    return {
        "by_dir": by_dir,
        "chrome_files": len(chrome),
        "chrome_importing_tldraw": len(tldraw_importers),
        "editor_calls": sum(methods.values()),
        "editor_methods": methods,
        "hooks": hooks,
    }


def measure_reactflow() -> dict:
    root = next(iter(sorted((NODE_MODULES / ".pnpm").glob("@xyflow+react@*/node_modules/@xyflow/react"))), None)
    if root is None:
        return {"version": "not installed", "absent": {}, "present": []}
    version = re.search(r'"version":\s*"([^"]+)"', (root / "package.json").read_text()).group(1)
    dts = "\n".join(p.read_text(errors="replace") for p in (root / "dist" / "esm").rglob("*.d.ts"))
    absent = {w: len(re.findall(rf"\b{w}\b", dts, flags=re.I)) for w in ["undo", "redo", "clipboard", "paste", "history", "tool"]}
    present = [n for n in ["fitView", "setViewport", "getViewport", "zoomTo", "useOnSelectionChange", "SelectionMode",
                           "NodeResizer", "getNodesBounds", "deleteElements", "toObject", "snapGrid", "MiniMap", "Controls", "Panel"]
               if re.search(rf"\b{n}\b", dts)]
    return {"version": version, "absent": absent, "present": present}


WB_ROOT = Path("/home/bam/simple-reactflow-whiteboard")


def measure_whiteboard() -> dict:
    """The actual repo Zach pointed at (github.com/zacharyyamaoka/simple-reactflow-whiteboard),
    read from its local checkout. Every claim in the page about it is a measurement of this."""
    if not WB_ROOT.exists():
        return {"present": False}
    src = [p for p in (WB_ROOT / "src").rglob("*") if p.suffix in {".ts", ".tsx"}]
    text = {p: p.read_text(errors="replace") for p in src}
    joined = "\n".join(text.values())
    board = (WB_ROOT / "src/whiteboard/Whiteboard.tsx").read_text(errors="replace")
    model = (WB_ROOT / "src/whiteboard/model.ts").read_text(errors="replace")
    tool_union = re.search(r"export type Tool = ([^\n]+)", model)
    pkg = (WB_ROOT / "package.json").read_text()
    hits = lambda pattern: len(re.findall(pattern, joined, flags=re.I))
    return {
        "present": True,
        "src_lines": sum(len(t.splitlines()) for t in text.values()),
        "test_lines": len((WB_ROOT / "tests/whiteboard.spec.ts").read_text().splitlines()),
        "tests": len(re.findall(r"^test\(", (WB_ROOT / "tests/whiteboard.spec.ts").read_text(), flags=re.M)),
        "closed_component": bool(re.search(r"export default function Whiteboard\(\s*\)", board)),
        "tool_union": tool_union.group(1).strip() if tool_union else "?",
        "fixed_node_types": bool(re.search(r"^const nodeTypes = \{", board, flags=re.M)),
        "has_entry": bool(re.search(r'"(main|exports|module)"', pkg)),
        "undo": hits(r"\b(undo|redo|history)\b"),
        "clipboard": hits(r"\b(clipboard|copy|paste|duplicate)\b"),
        "resize": hits(r"NodeResizer"),
        "fitview": hits(r"fitView"),
        "persist": hits(r"localStorage|toObject"),
        "controls": "<Controls" in board,
        "box_select": "selectionOnDrag" in board,
    }


APP = measure_app()
RF = measure_reactflow()
WB = measure_whiteboard()
TOTAL_APP = sum(v[0] for v in APP["by_dir"].values())

# ───────────────────────────── the diagram ─────────────────────────────
# Geometry copied from Zach's board (see docstring). (x, y, w, h)
BOX_W, BOX_H = 338.9, 93.6
BOXES = {
    "components": ("@bbox-ui/components", 278, 251),
    "scene": ("@bbox-ui/scene", 828, 244),
    "editor": ("@bbox-ui/editor", 531, 511),
    "nohost": ("app/bbox-no-host", 513, 804),
    "tldraw": ("@tldraw", 9, 814),
    "rfw": ("simple-reactflow-whiteboard", 1053, 847),
    "reactflow": ("@reactflow", 1302, 651),
    "bt": ("app/bbox-tldraw", 307, 1071),
    "br": ("app/bbox-reactflow", 782, 1081),
}
EDGES = [
    ("scene", "components"), ("editor", "components"), ("editor", "scene"), ("nohost", "editor"),
    ("bt", "nohost"), ("bt", "tldraw"), ("br", "nohost"), ("br", "rfw"), ("rfw", "reactflow"),
]
GROUP = (175, 123, 1071.6, 540.2)  # the @bbox group
FRAME = (-138, -58, 1895.9, 1398.9)  # the bbox-ui repo frame


def center(key):
    _, x, y = BOXES[key]
    return x + BOX_W / 2, y + BOX_H / 2


def edge_point(src, dst):
    """Where the line from src's centre toward dst's centre leaves src's box."""
    (sx, sy), (dx, dy) = center(src), center(dst)
    vx, vy = dx - sx, dy - sy
    half_w, half_h = BOX_W / 2, BOX_H / 2
    t = min(half_w / abs(vx) if vx else math.inf, half_h / abs(vy) if vy else math.inf)
    return sx + vx * t, sy + vy * t


def svg_diagram(annotated: bool) -> str:
    vb = (-160, -130, 1940, 1500)
    out = [f'<svg viewBox="{vb[0]} {vb[1]} {vb[2]} {vb[3]}" xmlns="http://www.w3.org/2000/svg" role="img" '
           f'aria-label="{"Proposed" if annotated else "Zach\'s"} dependency diagram" class="diagram">',
           '<defs><marker id="head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">'
           '<path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>']
    fx, fy, fw, fh = FRAME
    out.append(f'<rect x="{fx}" y="{fy}" width="{fw}" height="{fh}" rx="10" class="frame"/>')
    out.append(f'<text x="-100" y="-88" class="tiny">bbox-ui repo</text>')
    gx, gy, gw, gh = GROUP
    out.append(f'<rect x="{gx}" y="{gy}" width="{gw}" height="{gh}" rx="10" class="group"/>')
    out.append(f'<text x="{gx + 22}" y="{gy - 16}" class="tiny">@bbox</text>')

    if annotated:
        # The seam: a band between the shell and the two hosts. Arrows cross it by design, so its label sits at the
        # ends of the band where no arrow runs — a label in the middle gets struck through.
        out.append('<rect x="120" y="990" width="1620" height="44" rx="8" class="seam"/>')
        out.append('<text x="140" y="1019" class="seamtext">HostPort</text>')
        out.append('<text x="1720" y="1019" class="seamtext" text-anchor="end">the one contract a host implements</text>')
        nx, ny = BOXES["nohost"][1], BOXES["nohost"][2]
        fx0 = nx + BOX_W + 14  # 14 clear of the shell, and well short of the whiteboard box at x=1053
        out.append(f'<rect x="{fx0}" y="{ny + 6}" width="172" height="82" rx="8" class="fake"/>')
        out.append(f'<text x="{fx0 + 86}" y="{ny + 42}" class="small" text-anchor="middle">fake host</text>')
        out.append(f'<text x="{fx0 + 86}" y="{ny + 70}" class="tiny" text-anchor="middle">in-memory</text>')

    for src, dst in EDGES:
        x1, y1 = edge_point(src, dst)
        x2, y2 = edge_point(dst, src)
        out.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" class="edge" marker-end="url(#head)"/>')

    tiers = {"components": "lib", "scene": "lib", "editor": "lib", "nohost": "shell", "bt": "host", "br": "host",
             "tldraw": "ext", "reactflow": "ext", "rfw": "risk" if annotated else "host"}
    for key, (label, x, y) in BOXES.items():
        cls = tiers[key] if annotated else "plain"
        out.append(f'<rect x="{x}" y="{y}" width="{BOX_W}" height="{BOX_H}" rx="8" class="box {cls}"/>')
        size = 25 if len(label) <= 22 else 19  # "simple-reactflow-whiteboard" overflowed its box at 25
        out.append(f'<text x="{x + BOX_W / 2}" y="{y + BOX_H / 2 + 8}" class="label" style="font-size:{size}px" text-anchor="middle">{html.escape(label)}</text>')
    if annotated:
        rx, ry = BOXES["rfw"][1], BOXES["rfw"][2]
        out.append(f'<text x="{rx + BOX_W + 14}" y="{ry + 36}" class="flag">own repo · MIT</text>')
        out.append(f'<text x="{rx + BOX_W + 14}" y="{ry + 64}" class="flag">closed API today (D2, D5)</text>')
    out.append("</svg>")
    return "".join(out)


# ───────────────────────────── page pieces ─────────────────────────────
def bar_rows() -> str:
    rows = []
    label = {"chrome": "chrome/ — the shell's wiring", "shapes": "shapes/ — tldraw ShapeUtils + faces", "backend": "backend/ — pyblocks consumer",
             "document": "document/ — store ↔ scene bridge", "source": "source/ — source view", "top-level": "App, main, css entry"}
    for name in ["shapes", "chrome", "backend", "document", "source", "top-level"]:
        n, files = APP["by_dir"][name]
        pct = 100 * n / TOTAL_APP
        rows.append(f'<div class="bar"><span class="barlabel">{label[name]}</span>'
                    f'<span class="track"><span class="fill {"hot" if name == "chrome" else ""}" style="width:{pct:.1f}%"></span></span>'
                    f'<span class="barnum">{n:,} lines · {files} files</span></div>')
    return "\n".join(rows)


CAPABILITIES = [
    # capability, today's editor.* calls, react flow status, what the port must say
    ("Camera", ["zoomToFit", "zoomToBounds", "getZoomLevel", "getViewportScreenBounds", "getCurrentPageBounds"],
     "free", "fitView · setViewport · getViewport · zoomTo · zoomIn · zoomOut", "Fit / zoom to a set of nodes; report the zoom."),
    ("Selection", ["select", "getSelectedShapeIds", "getSelectedShapes", "getSelectionRotatedScreenBounds"],
     "free", "useOnSelectionChange · SelectionMode · getNodesBounds", "Read and set the selection; its bounds, for the floating toolbar."),
    ("Node operations", ["getShape", "getShapePageBounds", "getCurrentPageShapes", "getCurrentPageShapeIds", "updateShape", "updateShapes", "deleteShapes"],
     "free", "deleteElements · applyNodeChanges · NodeResizer", "Read, move, resize, delete nodes. (Duplicate is separate, below.)"),
    ("Document I/O", ["loadSnapshot", "getDocumentSettings", "updateDocumentSettings"],
     "free", "toObject", "Serialise and load the host's own document format."),
    ("History", ["undo", "redo", "getCanUndo", "getCanRedo", "clearHistory", "run"],
     "build", None, "Undo, redo, can-undo, and a transaction so one gesture is one undo step."),
    ("Tools", ["setCurrentTool", "getCurrentToolId", "isIn"],
     "build", None, "A tool id per dock button. React Flow has modes, not tools."),
    ("Duplicate / clipboard", ["duplicateShapes"],
     "build", None, "Duplicate the selection; copy and paste."),
    ("Next-shape style", ["setStyleForNextShapes", "getStyleForNextShape"],
     "decide", None, "A tldraw idea (\"the style the next shape you draw gets\"). Name it neutrally, or drop it."),
]


def whiteboard_cell(cap: str) -> str:
    """What simple-reactflow-whiteboard has for a capability — from its measured source, not from memory."""
    if not WB["present"]:
        return "<em>repo not found</em>"
    yes, no = '<span class="pill ok">has</span>', '<span class="pill warn">missing</span>'
    cells = {
        "Camera": (WB["controls"], "zoom <code>Controls</code>; no <code>fitView</code>" if not WB["fitview"] else "Controls + fitView"),
        "Selection": (WB["box_select"], "select tool with box-select"),
        "Node operations": (True, "draw rect/line/arrow, drag, delete; <strong>no resize</strong>" if not WB["resize"] else "draw, drag, delete, resize"),
        "Document I/O": (bool(WB["persist"]), "README: no persistence; nothing serialises the board"),
        "History": (bool(WB["undo"]), f"{WB['undo']} mentions of undo / redo / history in <code>src/</code>"),
        "Tools": (True, f"five, as a fixed union: <code>{html.escape(WB['tool_union'])}</code>"),
        "Duplicate / clipboard": (bool(WB["clipboard"]), f"{WB['clipboard']} mentions in <code>src/</code>"),
        "Next-shape style": (False, "no style panel (README)"),
    }
    ok, note = cells[cap]
    return f"{yes if ok else no}<br>{note}"


def capability_table() -> str:
    used = APP["editor_methods"]
    rows = []
    badge = {"free": ("ships", "ok"), "build": ("no stock part — build", "warn"), "decide": ("concept has no twin — decide", "note")}
    for cap, methods, status, rf_parts, port in CAPABILITIES:
        present = [m for m in methods if m in used]
        calls = sum(used[m] for m in present)
        text, cls = badge[status]
        rf = f"<code>{html.escape(rf_parts)}</code>" if rf_parts else "<em>none in @xyflow/react</em>"
        rows.append(f'<tr><th>{cap}</th><td>{calls} call sites<br><span class="dim">{", ".join(present) or "—"}</span></td>'
                    f'<td><span class="pill {cls}">{text}</span><br>{rf}</td><td>{whiteboard_cell(cap)}</td><td>{port}</td></tr>')
    return "\n".join(rows)


DECISIONS = [
    ("D1", "Who owns the document",
     "The host keeps its own native document (tldraw store → .tldr today; React Flow's toObject() JSON). The shell only READS a derived scene and issues commands through the port. No canonical shell-side copy.",
     "Yes — host-native, shell reads a scene",
     "The archive's own comment records why: every drift bug it ever had came from a second copy of the document (apps/systemsketch/src/chrome/problems.ts). This is also what today's code already does — the Problems panel, status strip and pyblocks bridge all read a derived scene — so the shell inherits it for free. Cross-host portability becomes an explicit scene export, later, not a sync engine.",
     "Host-native, shell reads a scene."),
    ("D2", "What simple-reactflow-whiteboard needs before it can sit behind the shell",
     "Open it, don't grow it. (1) a library entry; (2) an observable and commandable state surface — nodes, edges, selection, tool; (3) registrable tools and node/edge types, so the Block, Code, Port, Loop and Branch tools have somewhere to plug in; (4) history hooks. Then build the few things it and React Flow both lack: undo/redo and duplicate/paste (resize is stock: NodeResizer). Free-draw, text, sticky notes, styling and alignment guides stay out unless you add them.",
     "Open it first; parity is a separate, later decision",
     "It is already scoped small on purpose (its README: no ports, frames, style panel or persistence) and your Aug 26 note is the guardrail against creeping back — \"I now get stage 1 for free with tldraw.\" The second host earns its place by falsifying the port (ARCHITECTURE.md: one host cannot, two can) and by being MIT for public pages, not by matching tldraw.",
     "Nothing changes in that repo until the port spec says exactly what to open."),
    ("D3", "Is no-host an app or a package?",
     "Your arrows make both hosts import no-host. One app importing another is the odd part. Ship it as an importable shell (<BboxShell host={port}>) plus a thin standalone app that mounts it on the fake host — that app is the blank-canvas thing you want to develop in.",
     "Package + thin app",
     "It is cheap to reverse (a directory move) and it removes app→app imports before they spread. The name is yours; I would not rename anything until the first host imports it.",
     "Package + thin app; everything else as drawn."),
    ("D4", "When to start, and the first rung",
     "Wait for the lanes now editing chrome/, main.tsx and App.tsx to land — five at last check (chrome-files-settings, review-boards, devtools, draft-compare, settings-pages), not the two I first named. Then: (1) HostPort + the fake host + a contract test suite — additive, touches no existing app file; (2) lift chrome out of the tldraw app behind the port, kept green by its existing real-browser suite; (3) only then the React Flow host — first opening the whiteboard, then the port on it, with a stop rule on its size.",
     "Yes, in this order",
     "Moving chrome now collides with the five lanes that are rewriting it. Step 1 is the contract barrier and can run beside any lane, and step 2 is safe because the tldraw app already has a real-browser suite around it. Step 3 waits on evidence: the port has to survive tldraw AND the fake before React Flow is asked to.",
     "Nothing starts until you say; the port spec is the first rung when you do."),
    ("D5", "Where the whiteboard lives",
     "Your diagram draws simple-reactflow-whiteboard inside the bbox-ui repo, but it is its own public repo today. Keep it separate and pin it by commit once it has a library entry, or copy it in as a package.",
     "Separate repo, pinned by commit",
     "This is a stable leaf with a small API, unlike the app-plus-trunk pair where I argued against splitting: it changes rarely, and bbox-specific behaviour lives in app/bbox-reactflow, not in the whiteboard. Separate keeps \"depends on nothing of bbox\" physically true and keeps it useful on its own; copying it in recreates the vendored drift the trunk exists to end. The cost is a cross-repo hop for any change to it — fine while it stays small.",
     "Leave it where it is; nothing is copied or pinned yet."),
]


def decision_cards() -> str:
    cards = []
    for did, title, body, verdict, why, default in DECISIONS:
        cards.append(f"""
<section class="decision" data-id="{did}" data-title="{html.escape(title)}">
  <h3><span class="did">{did}</span> {html.escape(title)}</h3>
  <p>{html.escape(body)}</p>
  <p class="rec"><strong>Recommendation:</strong> {html.escape(verdict)}. <span class="dim">{html.escape(why)}</span></p>
  <p class="def"><strong>If you say nothing:</strong> {html.escape(default)}</p>
  <div class="verdicts" role="group" aria-label="{did} verdict">
    <button type="button" data-v="Approve">Approve</button>
    <button type="button" data-v="Change">Change</button>
    <button type="button" data-v="Reject">Reject</button>
  </div>
  <textarea placeholder="Note on {did} (optional)" rows="2"></textarea>
</section>""")
    return "\n".join(cards)


CSS = """
:root{--ink:#1a1a1a;--dim:#5f6368;--line:#d8dadd;--bg:#fff;--soft:#f6f7f8;--lib:#e8f0fe;--shell:#e6f4ea;--host:#fef7e0;--ext:#f1f3f4;--risk:#fce8e6;--accent:#1a73e8;--ok:#188038;--warn:#b06000;}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--bg);overflow-wrap:break-word}
main{max-width:1000px;margin:0 auto;padding:32px 20px 96px}
h1{font-size:28px;line-height:1.2;margin:0 0 8px}h2{font-size:21px;margin:44px 0 10px;padding-top:8px;border-top:1px solid var(--line)}h3{font-size:17px;margin:0 0 6px}
p{margin:0 0 12px}code{font:13px ui-monospace,Menlo,Consolas,monospace;background:var(--soft);padding:1px 5px;border-radius:4px;overflow-wrap:anywhere}
.lede{font-size:18px}.dim{color:var(--dim)}.tldr{background:var(--soft);border-left:4px solid var(--accent);padding:14px 18px;border-radius:0 8px 8px 0;margin:18px 0}
.tldr ul{margin:8px 0 0;padding-left:20px}.tldr li{margin:4px 0}
.diagram{width:100%;height:auto;display:block;background:#fff;border:1px solid var(--line);border-radius:10px}
.frame{fill:none;stroke:#9aa0a6;stroke-width:2}.group{fill:none;stroke:#9aa0a6;stroke-width:2;stroke-dasharray:8 6}
.box{stroke:#3c4043;stroke-width:2;fill:#fff}.box.lib{fill:var(--lib)}.box.shell{fill:var(--shell)}.box.host{fill:var(--host)}.box.ext{fill:var(--ext)}.box.risk{fill:var(--risk);stroke:#c5221f}
.edge{stroke:#3c4043;stroke-width:2.5;color:#3c4043}.label{font:600 25px system-ui,sans-serif;fill:#1a1a1a}.tiny{font:600 22px system-ui;fill:#5f6368}.small{font:600 24px system-ui;fill:#1a1a1a}
.seam{fill:#fff8e1;stroke:#f9ab00;stroke-width:2;stroke-dasharray:10 6}.seamtext{font:700 24px system-ui;fill:#7a5300}.fake{fill:#fff;stroke:#188038;stroke-width:2;stroke-dasharray:6 5}.flag{font:600 21px system-ui;fill:#c5221f}
.legend{display:flex;flex-wrap:wrap;gap:8px 16px;margin:10px 0 0;font-size:14px}.sw{display:inline-block;width:14px;height:14px;border:1.5px solid #3c4043;border-radius:3px;vertical-align:-2px;margin-right:5px}
.pair{display:grid;grid-template-columns:1fr;gap:18px}
@media(min-width:900px){.pair.two{grid-template-columns:1fr 1fr}}
figcaption{font-size:14px;color:var(--dim);margin-top:6px}figure{margin:0}
table{width:100%;border-collapse:collapse;font-size:14px;margin:8px 0}th,td{text-align:left;vertical-align:top;padding:9px 10px;border-top:1px solid var(--line)}thead th{border-top:0;color:var(--dim);font-weight:600}
tbody th{width:14%}.wrap{overflow-x:auto}
.pill{display:inline-block;font-size:12px;font-weight:600;padding:2px 8px;border-radius:99px;margin-bottom:3px}.pill.ok{background:#e6f4ea;color:var(--ok)}.pill.warn{background:#fef0cd;color:var(--warn)}.pill.note{background:#e8eaed;color:#3c4043}
.bar{display:grid;grid-template-columns:230px 1fr 150px;gap:10px;align-items:center;margin:6px 0;font-size:14px}.track{background:var(--soft);border-radius:4px;height:14px;overflow:hidden}.fill{display:block;height:100%;background:#9aa0a6}.fill.hot{background:var(--accent)}.barnum{color:var(--dim);text-align:right;font-variant-numeric:tabular-nums}
@media(max-width:640px){.bar{grid-template-columns:1fr}.barnum{text-align:left}}
.quote{border-left:3px solid var(--line);margin:12px 0;padding:2px 14px;color:#3c4043}
.decision{border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin:14px 0}.did{display:inline-block;background:var(--ink);color:#fff;border-radius:5px;padding:0 7px;margin-right:6px;font-size:14px}
.rec{background:#e8f0fe;border-radius:6px;padding:8px 10px}.def{color:var(--dim)}
.verdicts{display:flex;gap:8px;margin:10px 0 8px}.verdicts button{font:inherit;font-size:14px;padding:6px 14px;border:1px solid #9aa0a6;background:#fff;border-radius:6px;cursor:pointer}.verdicts button[aria-pressed=true]{background:var(--ink);color:#fff;border-color:var(--ink)}
textarea{width:100%;font:inherit;font-size:14px;padding:8px;border:1px solid var(--line);border-radius:6px;resize:vertical}
.copybar{position:sticky;bottom:0;background:#fff;border-top:1px solid var(--line);padding:12px 0;margin-top:20px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.copybar button{font:inherit;font-weight:600;padding:8px 16px;background:var(--accent);color:#fff;border:0;border-radius:6px;cursor:pointer}
#out{width:100%;min-height:120px;font:13px ui-monospace,Menlo,monospace;display:none}
.notdone li{margin:4px 0}
"""

JS = """
(function(){
  function answers(){
    var lines=['# Answers — host-less shell (2026-09-19)',''];
    document.querySelectorAll('.decision').forEach(function(card){
      var pressed=card.querySelector('button[aria-pressed=true]');
      var note=card.querySelector('textarea').value.trim();
      lines.push('## '+card.dataset.id+' — '+card.dataset.title);
      lines.push('- Verdict: '+(pressed?pressed.dataset.v:'(no answer — take the default)'));
      if(note) lines.push('- Note: '+note);
      lines.push('');
    });
    return lines.join('\\n');
  }
  document.querySelectorAll('.verdicts button').forEach(function(b){
    b.addEventListener('click',function(){
      var group=b.parentNode;
      group.querySelectorAll('button').forEach(function(o){o.setAttribute('aria-pressed','false')});
      b.setAttribute('aria-pressed','true');
    });
  });
  var out=document.getElementById('out'),status=document.getElementById('status');
  document.getElementById('copy').addEventListener('click',function(){
    var text=answers();
    // WHY the textarea is always shown afterwards: clipboard writes are refused on file:// and data: pages,
    // so the button can fail silently. A pre-selected textarea means Ctrl+C always works.
    out.style.display='block';out.value=text;out.focus();out.select();
    var done=function(ok){status.textContent=ok?'Copied — paste it into the chat.':'Clipboard blocked here — the text below is selected; press Ctrl+C.'};
    try{ if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(function(){done(true)},function(){done(false)});return;} }catch(e){}
    try{ done(document.execCommand('copy')); }catch(e){ done(false); }
  });
})();
"""


def page() -> str:
    c = APP["by_dir"]["chrome"][0]
    dir_lines = {k: v[0] for k, v in APP["by_dir"].items()}
    methods_n = len(APP["editor_methods"])
    rf_absent = ", ".join(f"{k} {v}" for k, v in RF["absent"].items())
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Host-less shell — thoughts</title><style>{CSS}</style></head>
<body><main>
<h1>Yes to the layering. The seam is the design — and the React Flow whiteboard has to be opened before it can sit behind it.</h1>
<p class="lede dim">Your diagram from <code>PROJECT - Black Box UI</code> · Sept 19 2026, redrawn from your board's own coordinates. Nothing is built; this is a proposal, so the diagram is the mock.</p>

<div class="tldr"><strong>Short version</strong>
<ul>
<li><strong>The layering is right.</strong> Components ← scene ← editor kit ← a shell with every window ← two hosts. It is the strict form of "functionality lives in the library": the shell itself becomes shared instead of re-wired per host. And <code>simple-reactflow-whiteboard</code> depends on nothing of bbox — a good boundary.</li>
<li><strong>Your arrows mean the shell can't call the host</strong> — hosts import the shell. So the shell needs an injected <code>HostPort</code>. Measured, today's chrome touches about {methods_n} <code>editor.*</code> methods, which collapse into 8 capabilities. Small enough to be a real contract.</li>
<li><strong>The hard question hiding in "no-host" is who owns the document.</strong> I recommend the host keeps its own native document and the shell only reads a derived scene (D1). It is what the code already does, and it avoids the second copy that caused the archive's drift bugs.</li>
<li><strong>The React Flow whiteboard exists, is small on purpose, and is closed.</strong> <code>simple-reactflow-whiteboard</code> is {WB["src_lines"]:,} lines with {WB["tests"]} Playwright tests, MIT, and already does select / hand / rect / line / arrow. But <code>Whiteboard()</code> takes no props, <code>Tool</code> is a fixed union and the package has no entry point, so nothing can plug a Block tool into it yet. <strong>The work is opening it (a small API), not adding features</strong> (D2) — plus what it and React Flow {html.escape(RF["version"])} both lack: undo/redo and duplicate/paste.</li>
</ul></div>

<h2>Your diagram, and what I'd add</h2>
<div class="pair">
<figure>{svg_diagram(False)}<figcaption>Yours, as drawn (arrow = "depends on"). Two arrow starts were unbound on the board and are inferred by position: scene → components, and no-host → editor.</figcaption></figure>
<figure>{svg_diagram(True)}<figcaption>The same boxes, coloured by role, with the one thing missing from the drawing: the contract between the shell and a host, and a fake host that lets you run the shell before any whiteboard exists.
<div class="legend"><span><i class="sw" style="background:var(--lib)"></i>library</span><span><i class="sw" style="background:var(--shell)"></i>shell</span><span><i class="sw" style="background:var(--host)"></i>host</span><span><i class="sw" style="background:var(--ext)"></i>external engine</span><span><i class="sw" style="background:var(--risk);border-color:#c5221f"></i>scope risk</span></div></figcaption></figure>
</div>

<h2>What the shell would actually be — measured</h2>
<p><code>apps/systemsketch/src</code> is {TOTAL_APP:,} lines. The chrome — the shell's wiring — is {c:,} of them ({100 * c / TOTAL_APP:.0f}%), across {APP["chrome_files"]} files; {APP["chrome_importing_tldraw"]} of those import tldraw. The biggest slice, <code>shapes/</code>, is the tldraw host's own ShapeUtils and stays with the tldraw host.</p>
{bar_rows()}
<p class="dim" style="margin-top:12px">The trunk already shares one scene→view renderer between its two host benches (<code>hosts/nodeViews.tsx</code>: "a third host imports this file and owns nothing but its viewport"), so a React Flow host does not re-draw Blocks. What the shell adds to the trunk is the chrome; what a host adds is a viewport, a document, and this port.</p>

<h2>The port: today's editor calls, and what React Flow gives you</h2>
<p>Grouped from a text search of <code>chrome/</code> for <code>editor.*</code> ({APP["editor_calls"]} call sites, so it includes a few mentions in comments), plus tldraw's UI hooks: <code>useValue</code> ×{APP["hooks"].get("useValue", 0)} and <code>useEditor</code> ×{APP["hooks"].get("useEditor", 0)} (a reactive read the port must offer), and <code>useToasts</code> ×{APP["hooks"].get("useToasts", 0)} / <code>useDialogs</code> ×{APP["hooks"].get("useDialogs", 0)} — those are tldraw's own UI, so the shell should own toasts and dialogs and they leave the port entirely.</p>
<div class="wrap"><table>
<thead><tr><th>Capability</th><th>Chrome uses today</th><th>React Flow {html.escape(RF["version"])} (its type definitions)</th><th>simple-reactflow-whiteboard today (its source)</th><th>What the port must say</th></tr></thead>
<tbody>{capability_table()}</tbody></table></div>
<p class="dim">Off-the-shelf first: every "ships" cell is a stock <code>@xyflow/react</code> export found in its types. The "build" rows have no stock part there; I have not picked an outside library for them and would choose one when that rung starts, not now.</p>

<h2>The React Flow whiteboard: small on purpose, and closed</h2>
<p>It is public and MIT, created tonight: {WB["src_lines"]:,} lines of source and {WB["tests"]} Playwright tests ({WB["test_lines"]} lines), trimmed by design from the ~14.5k-line whiteboard in pyblocks (its own README's figure). Its README lists what it leaves out — "no ports, no frames, no style panel, no persistence, no collaboration" — so you have already done the thing I would have warned about: scoped it small. Your Aug 26 note is the guardrail to keep it that way:</p>
<div class="quote">"Every moment I spend giving feedback on a UI interaction is waste time I will never get back, just find a good reference and then get the AI to copy it better… I definitely should not be spending my time here at all" — Aug 26, 2026, the day you moved to tldraw: "I now get stage 1 for free."</div>
<p><strong>What it is not yet is droppable.</strong> Read from its source:</p>
<ul>
<li><code>Whiteboard()</code> takes <strong>no props</strong>. Nodes, edges, the selected tool and the gesture are internal state, so a shell can neither read the selection or the document nor push a command.</li>
<li><code>Tool</code> is a <strong>closed union</strong> — <code>{html.escape(WB["tool_union"])}</code>. The Block, Code, Port, Loop and Branch tools have nowhere to plug in.</li>
<li><code>nodeTypes</code> and <code>edgeTypes</code> are module constants, so a host cannot register a Block node or a wire edge.</li>
<li><code>package.json</code> has <strong>no entry point</strong>: it is an app, not an importable package.</li>
<li><strong>Watch-out:</strong> a free line end is an invisible 1×1 <code>anchor</code> node in React Flow's node array (README). The shell's derived scene must filter those out, or every loose arrow shows up as a node.</li>
</ul>
<p>So D2 is about <em>opening</em> it. That is also why it earns its place as a second host: it falsifies the port (one host cannot, two can), and it is MIT for public pages — tldraw needs a licence key in production, which is the reason its own README gives.</p>

<h2>Order of work</h2>
<ol>
<li><strong>The port + a fake host + contract tests.</strong> Additive; touches no existing app file, so it can run beside any lane. A thin no-host app can mount against the fake host, but its windows only arrive in step 2, when chrome is lifted — building them earlier would fork wiring that five live lanes are still editing.</li>
<li><strong>Lift chrome out of the tldraw app, behind the port.</strong> Held green by the app's existing real-browser suite. <em>Not before</em> the lanes that are rewriting <code>chrome/</code>, <code>main.tsx</code> and <code>App.tsx</code> have landed — five at last check.</li>
<li><strong>The React Flow host, last, with a stop rule on its size.</strong> First open the whiteboard (D2), then implement the port on it. By then the port has survived tldraw and the fake.</li>
</ol>
<p class="dim">Deliberately not done: no code, no rename, no move of chrome, no merge, and no change to <code>simple-reactflow-whiteboard</code> — I read its source but did not run its tests. The two lanes above are live; I did not touch them.</p>

<h2>Decisions</h2>
<p class="dim">Each has my recommendation and the default I take if you say nothing, so ignoring this is free. Press a verdict, add a note, then Copy — it names each item by number and title.</p>
{decision_cards()}
<div class="copybar"><button id="copy" type="button">Copy answers</button><span id="status" class="dim" role="status"></span></div>
<textarea id="out" aria-label="Answers to copy" readonly></textarea>
</main><script>{JS}</script></body></html>
"""


if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(page())
    print(f"wrote {OUT} ({OUT.stat().st_size:,} bytes)")
    print(f"chrome {APP['by_dir']['chrome']} · methods {len(APP['editor_methods'])} · rf {RF['version']} absent {RF['absent']}")
