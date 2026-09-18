#!/usr/bin/env python3
"""
Build the invalid-states / diagnostic-axis proposal report.

WHY this is its own builder rather than a build_lane_report.py manifest:
that builder's manifest carries changes/findings/captures — the shape of a
lane that shipped code. This report is a DESIGN PROPOSAL whose substance is
hand-drawn HTML/CSS mocks of states that do not exist yet, side by side
with real captures of what exists today. The shared pieces (git facts,
capture crop+WebP, the encoded-size ceiling check, the page chrome) are
IMPORTED from build_lane_report.py so the two cannot drift; only the body
is bespoke.

The spec of record is docs/INVALID-STATES-PLAN.md — this page renders it.

USAGE
  python3 docs/build_invalid_states_report.py --shots DIR
  (DIR holds the PNGs captured by docs/capture_storybook_shots.mjs against
   the lane's own Storybook; see the plan for the story list.)
"""
from __future__ import annotations

import pathlib
import sys
from datetime import date
from urllib.parse import quote

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from build_lane_report import CAP_BYTES, REPO, STYLE, git_facts, webp_data_uri

LANE_REPO = pathlib.Path(__file__).resolve().parent.parent
VAULT = pathlib.Path("/home/bam/zach_brain")

# ---------------------------------------------------------------------------
# The mock palette — the storybook app's own DARK theme values, verbatim from
# apps/storybook-basics/src/globals.css (:root dark block + the two ported
# bbox tokens) and packages/bbox-ui/src/theme.css:79-89 for the three status
# tokens this proposal ports. Namespaced --m-* so the report's own chrome
# palette (STYLE) cannot collide.
# ---------------------------------------------------------------------------
MOCK_CSS = """
.board { --m-bg: oklch(0.145 0 0); --m-card: oklch(0.205 0 0);
  --m-border: oklch(1 0 0 / 10%); --m-muted: oklch(0.269 0 0);
  --m-mutedfg: oklch(0.708 0 0); --m-fg: oklch(0.985 0 0);
  --m-primary: oklch(0.78 0.17 48); --m-received: oklch(0.78 0.17 145);
  --m-danger: oklch(0.72 0.17 25); --m-warning: oklch(0.80 0.15 85);
  --m-accent: oklch(0.70 0.17 264);
  --m-destructive: oklch(0.704 0.191 22.216);
  background: var(--m-bg); border:1px solid var(--line); border-radius:10px;
  padding:26px 22px; display:flex; flex-wrap:wrap; gap:34px; align-items:center;
  justify-content:space-evenly;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
.board.col { flex-direction:column; align-items:stretch; }
.spec { text-align:center; color:var(--m-mutedfg); font-size:12px; }
.spec .art { display:flex; align-items:center; justify-content:center; min-height:64px; margin-bottom:10px; }
.spec b { color:var(--m-fg); font-weight:600; display:block; font-size:12.5px; }
.spec small { display:block; color:var(--dim2); margin-top:2px }

/* Port dot — 12px "md", rings as box-shadow exactly as port.tsx paints them:
   0 0 0 2px card (surface ring), 0 0 0 5px state ring (2+3px). */
.dot { width:12px; height:12px; border-radius:50%; position:relative;
  background: var(--m-card); display:inline-block; }
.dot .core { position:absolute; left:50%; top:50%; width:42%; height:42%;
  transform:translate(-50%,-50%); border-radius:50%; }

.mono { font-family: ui-monospace,"SF Mono",Menlo,Consolas,monospace; }

/* Squiggles — CSS text-decoration only; the text metrics don't move. */
.sq-err  { text-decoration: underline wavy var(--m-danger) 1.5px; text-underline-offset:4px; }
.sq-warn { text-decoration: underline wavy var(--m-warning) 1.5px; text-underline-offset:4px; }
.sq-info { text-decoration: underline dotted var(--m-accent) 1.5px; text-underline-offset:4px; }

/* Block mock — border/radius/shadow slots as block.tsx paints them. */
.blk { width:190px; border-radius:10px; border:1px solid var(--m-border);
  background: var(--m-card); color: var(--m-fg); font-size:13px;
  position:relative; box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1); }
.blk .hd { padding:7px 12px; border-bottom:1px solid var(--m-border); text-align:center; }
.blk .bd { padding:16px 12px; text-align:center; color:var(--m-mutedfg); font-size:12px; }
.blk.err { box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--m-danger) 80%, transparent),
                       0 0 18px 2px color-mix(in srgb, var(--m-danger) 35%, transparent),
                       0 1px 3px 0 rgb(0 0 0 / 0.1); }

/* DiagnosticFlag — 22px chip straddling the corner. */
.flag { position:absolute; top:-9px; right:-9px; width:22px; height:22px;
  border-radius:50%; background:var(--m-card); display:flex; align-items:center;
  justify-content:center; cursor:pointer; }
.flag.err  { border:1.5px solid var(--m-danger);  color:var(--m-danger); }
.flag.warn { border:1.5px solid var(--m-warning); color:var(--m-warning); }
.flag.info { border:1.5px solid var(--m-accent);  color:var(--m-accent); }
.flag svg { width:12px; height:12px; }
.flag.inline { position:static; }

/* Popover mock — popover tokens (oklch(0.205), border, radius-md). */
.pop { width:308px; background:oklch(0.205 0 0); border:1px solid oklch(1 0 0/12%);
  border-radius:8px; color:var(--m-fg); font-size:12.5px; text-align:left;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.5); overflow:hidden; }
.pop .msg { padding:10px 12px; line-height:1.5; display:flex; gap:8px; align-items:flex-start; }
.pop .msg svg { width:14px; height:14px; flex-shrink:0; margin-top:1px; }
.pop .rule { color:var(--m-mutedfg); }
.pop .act { padding:0 12px 10px; }
.pop .btn { display:inline-block; background:var(--m-accent); color:oklch(0.145 0 0);
  font-weight:600; font-size:12px; border-radius:6px; padding:5px 10px; }
.pop .links { border-top:1px solid oklch(1 0 0/10%); padding:8px 12px; display:flex; gap:16px;
  color:var(--m-accent); font-size:12px; }
.badge { display:inline-flex; align-items:center; border-radius:6px; padding:1px 7px;
  font-size:10.5px; font-weight:500; border:1px solid transparent; vertical-align:2px; }
.badge.outline { border-color: currentColor; color:var(--m-mutedfg); }
.badge.destructive { background: color-mix(in srgb, var(--m-destructive) 60%, transparent); color:#fff; }
.badge.warning { background: var(--m-warning); color: oklch(0.145 0 0); }
.badge.secondary { background: var(--m-muted); color: var(--m-fg); }

/* CodeEditor mock */
.ced { background:var(--m-card); border:1px solid var(--m-border); border-radius:8px;
  font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace; font-size:13px;
  color:var(--m-fg); text-align:left; padding:10px 0; line-height:1.7; }
.ced .ln { display:flex; }
.ced .no { width:34px; text-align:right; padding-right:12px; color:oklch(0.45 0 0);
  user-select:none; flex-shrink:0; }
.k { color:#c678dd; } .f { color:#61afef; } .s { color:#98c379; } .n { color:#d19a66; }

/* Matrix table */
table.mx { border-collapse:collapse; margin:0 auto; color:var(--m-mutedfg); font-size:12px; }
table.mx th { font-weight:600; color:var(--m-fg); padding:8px 18px; font-size:12px; }
table.mx td { padding:16px 18px; text-align:center; }
table.mx td.rowlab { text-align:right; color:var(--m-fg); font-weight:600; padding-right:22px; }

/* EditableText mock */
.etx { color:var(--m-fg); font-size:14px; }
.etx-edit { border:1px solid oklch(1 0 0/22%); border-radius:6px; padding:3px 8px;
  background:oklch(0.17 0 0); }

/* Value capsule mock */
.cap { position:relative; height:44px; border-radius:22px; border:1px solid var(--m-border);
  background:var(--m-card); color:var(--m-fg); display:inline-flex; align-items:center;
  padding:0 26px; font-family:ui-monospace,Menlo,monospace; font-size:14px; }
.cap.err { box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--m-danger) 80%, transparent),
                       0 0 18px 2px color-mix(in srgb, var(--m-danger) 35%, transparent); }
.cap .rim { position:absolute; top:50%; transform:translate(-50%,-50%); }
.cap .rim.l { left:0; } .cap .rim.r { left:100%; }

/* channel-ownership + inventory tables reuse table.look from STYLE */
.chip { display:inline-block; width:11px; height:11px; border-radius:3px; vertical-align:-1px; margin-right:7px; }
figure.ref img { max-width:100%; }
.callout { background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--accent);
  border-radius:8px; padding:12px 16px; font-size:13.5px; color:var(--dim); margin:14px 0; }
.callout b { color:var(--fg); }
.two { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
@media (max-width:900px){ .two { grid-template-columns:1fr } }
.diffhatch { background: repeating-linear-gradient(45deg, oklch(1 0 0/0.16) 0 4px, transparent 4px 8px);
  border-radius:4px; padding:1px 5px; }
figure img.natural { width:auto; max-width:100%; }
"""

# Lucide icon paths (stroke-based, 24 viewBox) — the exact icons Glyph would
# resolve: octagon-x is heavy for 12px, so the flag uses circle-x for error.
ICON = {
    "err": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>',
    "warn": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 20h16a2 2 0 0 0 1.73-2Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
    "info": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
}

RING = {
    "empty": ("var(--m-fg)", None, None),
    "valueSet": ("var(--m-mutedfg)", "var(--m-muted)", None),
    "wired": ("var(--m-primary)", None, "var(--m-primary)"),
    "received": ("var(--m-received)", "var(--m-received)", "var(--m-received)"),
}
HALO_TOKEN = {"err": "var(--m-danger)", "warn": "var(--m-warning)"}


def dot(state: str = "empty", halo: str | None = None, scale: float = 1.0) -> str:
    """A Port dot mock — ring layers exactly as portDotStyle stacks them."""
    ring, fill, core = RING[state]
    layers = [f"0 0 0 {2*scale:g}px var(--m-card)", f"0 0 0 {5*scale:g}px {ring}"]
    if halo:
        layers.append(f"0 0 0 {9*scale:g}px color-mix(in srgb, {HALO_TOKEN[halo]} 38%, transparent)")
    style = f"box-shadow:{', '.join(layers)};"
    if fill:
        style += f"background:{fill};"
    size = f"width:{12*scale:g}px;height:{12*scale:g}px;"
    core_html = f'<span class="core" style="background:{core}"></span>' if core else ""
    return f'<span class="dot" style="{size}{style}">{core_html}</span>'


def spec(art: str, label: str, sub: str = "") -> str:
    sub_html = f"<small>{sub}</small>" if sub else ""
    return f'<div class="spec"><div class="art">{art}</div><b>{label}</b>{sub_html}</div>'


def flag(kind: str, inline: bool = False) -> str:
    extra = " inline" if inline else ""
    return f'<span class="flag {kind}{extra}">{ICON[kind]}</span>'


def trace_svg(diag: str | None = None, w: int = 300, h: int = 96) -> str:
    """A Trace mock: grey stroke + chevron head; the diagnostic renders one
    extra translucent backdrop path on the SAME geometry (the hit-path idea,
    trace.tsx:131, painted)."""
    path = f"M16,{h-20} C{w*0.4:.0f},{h-20} {w*0.55:.0f},20 {w-22:.0f},20"
    backdrop = ""
    if diag:
        token = HALO_TOKEN[diag]
        backdrop = (f'<path d="{path}" fill="none" stroke="color-mix(in srgb, {token} 30%, transparent)" '
                    f'stroke-width="10" stroke-linecap="round"/>')
    head = (f'<path d="M{w-26},14 L{w-16},20 L{w-26},26" fill="none" stroke="oklch(0.708 0 0)" '
            f'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>')
    return (f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}">{backdrop}'
            f'<path d="{path}" fill="none" stroke="oklch(0.708 0 0)" stroke-width="2"/>{head}</svg>')


def two_producers_svg() -> str:
    """THE canonical lint, drawn: two producers wired into one port — both
    cables carry the red backdrop, the contested port wears the halo. Only a
    `wired` port can be in this error, which is the orthogonality argument
    as a picture."""
    w, h = 460, 190
    cable_a = "M74,50 C170,50 240,88 332,92"
    cable_b = "M74,140 C170,140 240,100 332,96"
    def cable(d: str) -> str:
        return (f'<path d="{d}" fill="none" stroke="color-mix(in srgb, var(--m-danger) 30%, transparent)" stroke-width="10" stroke-linecap="round"/>'
                f'<path d="{d}" fill="none" stroke="oklch(0.708 0 0)" stroke-width="2"/>')
    def mini_block(x: int, y: int, name: str) -> str:
        return (f'<rect x="{x}" y="{y}" width="64" height="34" rx="8" fill="var(--m-card)" stroke="oklch(1 0 0 / 0.12)"/>'
                f'<text x="{x+32}" y="{y+21}" fill="var(--m-fg)" font-size="12" text-anchor="middle" font-family="sans-serif">{name}</text>')
    def out_dot(cx: int, cy: int) -> str:
        return (f'<circle cx="{cx}" cy="{cy}" r="6" fill="var(--m-card)" stroke="var(--m-primary)" stroke-width="3"/>'
                f'<circle cx="{cx}" cy="{cy}" r="2.4" fill="var(--m-primary)"/>')
    contested = (
        '<circle cx="338" cy="94" r="13" fill="color-mix(in srgb, var(--m-danger) 38%, transparent)"/>'
        '<circle cx="338" cy="94" r="6" fill="var(--m-card)" stroke="var(--m-primary)" stroke-width="3"/>'
        '<circle cx="338" cy="94" r="2.4" fill="var(--m-primary)"/>')
    target = ('<rect x="332" y="62" width="112" height="64" rx="10" fill="var(--m-card)" stroke="oklch(1 0 0 / 0.12)"/>'
              '<text x="392" y="86" fill="var(--m-fg)" font-size="12" text-anchor="middle" font-family="sans-serif">fuse</text>'
              '<text x="352" y="99" fill="var(--m-fg)" font-size="11" font-family="sans-serif">pose</text>')
    return (f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            + mini_block(8, 33, "gps") + mini_block(8, 123, "odom") + target
            + cable(cable_a) + cable(cable_b)
            + out_dot(74, 50) + out_dot(74, 140) + contested
            + '</svg>')


def popover_mock(kind: str, message: str, rule: str, action: str | None, links: list[str]) -> str:
    action_html = f'<div class="act"><span class="btn">{action}</span></div>' if action else ""
    links_html = "".join(f"<span>{text}</span>" for text in links)
    return (f'<div class="pop"><div class="msg"><span style="color:var(--m-{"danger" if kind=="err" else "warning" if kind=="warn" else "accent"})">{ICON[kind]}</span>'
            f'<span>{message} <span class="badge outline mono">{rule}</span></span></div>'
            f'{action_html}<div class="links">{links_html}</div></div>')


def img_card(uri: str, title: str, caption: str, max_w: int = 460, natural: bool = False) -> str:
    """natural=True stops a small crop from upscaling into blur — the img
    keeps its captured pixel width."""
    cls = ' class="natural"' if natural else ""
    return (f'<figure style="max-width:{max_w}px"><img{cls} src="{uri}" alt="{title}">'
            f'<figcaption><b>{title}</b>{caption}</figcaption></figure>')


def build() -> str:
    facts = git_facts(LANE_REPO, "main")
    shots_dir = pathlib.Path(sys.argv[sys.argv.index("--shots") + 1]) if "--shots" in sys.argv else None

    def shot(name: str) -> str | None:
        if not shots_dir:
            return None
        png = shots_dir / f"{name}.png"
        return webp_data_uri(png) if png.exists() else None

    vscode_ref = webp_data_uri(VAULT / "Pasted image 20260917204726.png")
    squiggle_ref = webp_data_uri(VAULT / "Pasted image 20260901220523.png")

    cap_port = shot("port-all-states")
    cap_block = shot("block-composed")
    cap_value = shot("value-wired")
    cap_badge = shot("badge-variants")
    cap_lport = shot("labeledport-default")
    cap_ced = shot("codeeditor-multiline")
    cap_etx = shot("editabletext-default")
    cap_wiring = shot("wiring-scenarios")

    # ----- section: the matrix -------------------------------------------
    matrix_rows = []
    for state, label in [("empty", "empty"), ("valueSet", "valueSet"), ("wired", "wired"), ("received", "received")]:
        cells = "".join(
            f"<td>{dot(state, halo, scale=1.4)}</td>"
            for halo in (None, "err", "warn")
        )
        info_cell = f"<td>{dot(state, None, scale=1.4)}<div style='margin-top:6px;font-size:10.5px'>no chrome</div></td>"
        matrix_rows.append(f'<tr><td class="rowlab mono">{label}</td>{cells}{info_cell}</tr>')
    matrix = (
        '<table class="mx"><tr><th></th><th>no diagnostic</th>'
        '<th style="color:var(--m-danger)">error</th>'
        '<th style="color:var(--m-warning)">warning</th>'
        '<th style="color:var(--m-accent)">info</th></tr>'
        + "".join(matrix_rows) + "</table>"
    )

    # ----- per-component boards ------------------------------------------
    port_board = f"""
    <div class="board">
      {spec(dot("wired", None, 2), "wired · today", "port.tsx:53 STATE_TOKENS")}
      {spec(dot("wired", "err", 2), "wired + error", "halo layer, hinting geometry (port.tsx:127)")}
      {spec(dot("valueSet", "warn", 2), "valueSet + warning", "same layer, --bbox-warning")}
      {spec(dot("empty", "err", 2), "empty + error", "state ring untouched")}
      {spec(dot("received", None, 2), "received + info", "info paints nothing on a dot")}
    </div>"""

    lport_board = f"""
    <div class="board">
      {spec(f'<span style="display:inline-flex;align-items:center;gap:10px">{dot("wired")}<span class="etx">pose</span></span>',
            "today", "dot + rest-span label")}
      {spec(f'<span style="display:inline-flex;align-items:center;gap:10px">{dot("wired","err")}<span class="etx sq-err">pose</span></span>',
            "error", "halo + wavy underline — text metrics unchanged")}
      {spec(f'<span style="display:inline-flex;align-items:center;gap:10px">{dot("wired","warn")}<span class="etx sq-warn">pose</span>{flag("warn", inline=True)}</span>',
            "warning + flag in the secondary slot", "labeledPort.tsx:262 — the slot already exists")}
      {spec(f'<span style="display:inline-flex;align-items:center;gap:10px">{dot("wired")}<span class="etx sq-info">pose</span></span>',
            "info", "dotted underline only, no halo")}
    </div>"""

    block_board = f"""
    <div class="board">
      {spec('<div class="blk"><div class="hd">fuse</div><div class="bd">Body content</div></div>', "today", "block.tsx:158 shadow slot")}
      {spec(f'<div class="blk err"><div class="hd">fuse</div><div class="bd">Body content</div>{flag("err")}</div>', "error", "glow prepended to the shadow slot + flag")}
      {spec(f'<div class="blk"><div class="hd">fuse</div><div class="bd">Body content</div>{flag("warn")}</div>', "warning", "flag only — no glow, warnings must not shout")}
      {spec('<div class="blk"><div class="hd">fuse</div><div class="bd">Body content</div></div>', "info", "nothing — a note is not a mark")}
    </div>"""

    popover_board = f"""
    <div class="board">
      {spec(f'<div style="position:relative"><div class="blk err"><div class="hd">fuse</div><div class="bd">Body content</div>{flag("err")}</div></div>',
            "1 · click the flag…", "")}
      {spec(popover_mock("err",
            "Two producers write <span class='mono'>pose</span> — make them exclusive or merge them.",
            "wire/multi-producer", "Fix with Agent",
            ["View Problem", "Quick Fix…"]),
            "2 · …the popover opens", "message · rule-id Badge · host actions slot · host links")}
      {spec(popover_mock("warn",
            "<span class='mono'>gain</span> has a default but nothing wired — is that intended?",
            "port/unwired-default", None, ["View Problem"]),
            "warning body", "no action button when the host passes none")}
    </div>"""

    trace_board = f"""
    <div class="board">
      {spec(trace_svg(None), "today", "stroke keeps its variant colour/dash")}
      {spec(trace_svg("err"), "error", "backdrop path, hit-path geometry (trace.tsx:131) painted 30%")}
      {spec(trace_svg("warn"), "warning", "same, --bbox-warning")}
      {spec(f'<span style="position:relative;display:inline-block">{trace_svg("err")}<span class="badge destructive" style="position:absolute;left:50%;top:52%;transform:translate(-50%,-50%)">type: Pose ≠ Twist</span></span>',
            "message on the wire", "TraceBadge in severity dress at labelPosition")}
    </div>"""

    two_producers_board = f"""
    <div class="board" style="justify-content:center">
      {spec(two_producers_svg(), "the canonical lint, drawn", "two producers → one port. Only a WIRED port can be in this error — the orthogonality argument as a picture.")}
    </div>"""

    ced_board = f"""
    <div class="board">
      {spec(f'''<div class="ced" style="min-width:320px">
        <div class="ln"><span class="no">1</span><span><span class="k">def</span> <span class="f">run</span>(raw: bytes, gain: <span class="sq-warn">flaot</span>):</span></div>
        <div class="ln"><span class="no">2</span><span>&nbsp;&nbsp;pose = <span class="sq-err">transfrom</span>(raw, gain)</span></div>
        <div class="ln"><span class="no">3</span><span>&nbsp;&nbsp;<span class="k">return</span> <span class="sq-info">encode</span>(pose)</span></div>
      </div>''', "all three severities", "@codemirror/lint setDiagnostics — stock squiggles, one new dependency")}
    </div>"""

    etx_board = f"""
    <div class="board">
      {spec('<span class="etx">conveyor speed</span>', "today", "rest span")}
      {spec('<span class="etx sq-err">conveyor speed</span>', "error at rest", "CSS text-decoration only")}
      {spec('<span class="etx etx-edit sq-err">conveyor speed</span>', "error while editing", "the control inherits the decoration")}
      {spec('<span class="etx sq-info">conveyor speed</span>', "info", "dotted, quiet")}
    </div>"""

    badge_board = f"""
    <div class="board">
      {spec('<span class="badge destructive">error</span>', "error — exists today", "variant=&quot;destructive&quot;, badge.tsx:36")}
      {spec('<span class="badge warning">warning</span>', "warning — one new cva row", "amber bg, dark text")}
      {spec('<span class="badge secondary">info</span>', "info — exists today", "variant=&quot;secondary&quot;")}
    </div>"""

    value_board = f"""
    <div class="board">
      {spec(f'<span class="cap"><span class="rim l">{dot("wired")}</span>42<span class="rim r">{dot("empty")}</span></span>', "today", "value.tsx — Block in a pill")}
      {spec(f'<span class="cap err"><span class="rim l">{dot("wired","err")}</span><span class="sq-err">4.2e</span><span class="rim r">{dot("empty")}</span></span>', "error", "pill glow (via Block) + squiggle on the bad span. No flag — the glow is the beacon")}
    </div>"""

    diff_compose_board = f"""
    <div class="board">
      {spec(f'<span style="display:inline-flex;align-items:center;gap:10px">{dot("wired","err",1.4)}<span class="etx diffhatch sq-err" style="font-size:15px">run_predict</span></span>',
            "changed AND broken — both marks at once",
            "hatch = the comparison lane's mark, drawn indicatively (their vocabulary, their names). The halo + squiggle are this axis. Different channels, no collision.")}
    </div>"""

    # ----- inventory + channels + stock tables ---------------------------
    inventory = """
    <table class="look">
    <tr><th>mark</th><th>rendered by (exists today)</th><th>new prop or new component</th></tr>
    <tr><td>colour change</td><td><code>portRingColor</code>/<code>portDotStyle</code> (port.tsx:102-144); Badge <code>destructive</code> (badge.tsx:36)</td><td>prop</td></tr>
    <tr><td>halo behind a Port dot</td><td>the <code>hinting</code> halo layer (port.tsx:127-129)</td><td>prop — same geometry, severity token</td></tr>
    <tr><td>red halo / drop shadow behind a Block</td><td>Block's shadow slot (block.tsx:158)</td><td>prop — prepend a glow layer</td></tr>
    <tr><td>red backdrop on cables</td><td>Trace's hit-path twin (trace.tsx:131,311)</td><td>prop — one extra translucent path</td></tr>
    <tr><td>warning icon top-right, click → message</td><td>Glyph (lucide) + Badge + a click popup</td><td><b>2 new</b>: <code>popover.tsx</code> (stock shadcn copy, same routine as tooltip.tsx) + <code>DiagnosticFlag</code> (~50-line composition)</td></tr>
    <tr><td>red wavy underline — editing</td><td>CodeEditor</td><td>prop + <b>1 new dependency</b> (<code>@codemirror/lint</code>), 0 new components</td></tr>
    <tr><td>red wavy underline — at rest</td><td>EditableText / LabeledPort rest span</td><td>prop — CSS <code>text-decoration</code> only</td></tr>
    <tr><td>hover message, rich body</td><td>Tooltip — arbitrary children (tooltip.tsx:33,60)</td><td>none</td></tr>
    <tr><td>rule-id chip</td><td>Badge <code>outline sm</code></td><td>none</td></tr>
    <tr><td colspan="2" style="text-align:right;color:var(--fg)"><b>genuinely new components</b></td><td><b>2</b> (one of them a verbatim vendor copy)</td></tr>
    </table>"""

    channels = """
    <table class="look">
    <tr><th>axis</th><th>owns (CSS channels)</th><th>evidence</th></tr>
    <tr><td><span class="chip" style="background:oklch(0.78 0.17 48)"></span><code>state</code> — semantic</td><td>dot ring/fill/core colours, badge variants</td><td>port.tsx:53-58, 102-159</td></tr>
    <tr><td><span class="chip" style="background:oklch(0.65 0 0)"></span><code>skin</code> — shape language</td><td>border width/colour slots, radius, font, resting shadow</td><td>src/skin/skin.ts:89-118</td></tr>
    <tr><td><span class="chip diffhatch" style="border:1px solid var(--line)"></span>diff — comparison lane</td><td>fills/washes, chips, ghosts, token ink — their names, untouched here</td><td>systemsketch diffPresentation.ts traits</td></tr>
    <tr><td><span class="chip" style="background:oklch(0.72 0.17 25)"></span><b><code>diagnostic</code> — this proposal</b></td><td><b>outer halo, corner flag, wavy underline, cable backdrop, popover</b></td><td>docs/INVALID-STATES-PLAN.md §3</td></tr>
    </table>"""

    tokens = """
    <table class="look">
    <tr><th>severity</th><th>token</th><th>dark value (used in every mock above)</th><th>provenance</th></tr>
    <tr><td><b style="color:oklch(0.72 0.17 25)">error</b></td><td><code>--bbox-danger</code></td><td><code>oklch(0.72 0.17 25)</code></td><td>packages/bbox-ui/src/theme.css:30,87 — ported, not invented</td></tr>
    <tr><td><b style="color:oklch(0.80 0.15 85)">warning</b></td><td><code>--bbox-warning</code></td><td><code>oklch(0.80 0.15 85)</code></td><td>theme.css:28,86</td></tr>
    <tr><td><b style="color:oklch(0.70 0.17 264)">info</b></td><td><code>--bbox-accent</code></td><td><code>oklch(0.70 0.17 264)</code></td><td>theme.css:31,89</td></tr>
    </table>"""

    stock = """
    <table class="look">
    <tr><th>element</th><th>today</th><th>off-the-shelf part (exact name)</th><th>behaviour that must survive</th></tr>
    <tr><td>hover message</td><td>none</td><td><code>Tooltip</code>/<code>TooltipContent</code> (@base-ui/react/tooltip via tooltip.tsx)</td><td>rich children; glanceable, no actions</td></tr>
    <tr><td>click popup</td><td>none</td><td><code>Popover</code> (@base-ui/react/popover via a new stock popover.tsx)</td><td>click-open, Escape/outside dismiss, no menu semantics</td></tr>
    <tr><td>editor squiggle</td><td>none</td><td><code>setDiagnostics</code>/<code>linter</code> (@codemirror/lint)</td><td>per-range severity; message reaches hover</td></tr>
    <tr><td>resting-text squiggle</td><td>none</td><td>CSS <code>text-decoration: underline wavy</code> (no library)</td><td>label metrics unchanged</td></tr>
    <tr><td>halo / glow</td><td>hinting's halo (port.tsx:127-129)</td><td>plain <code>box-shadow</code> layers</td><td>state rings keep their colours; skins keep their shadow slot</td></tr>
    <tr><td>severity icon</td><td>none</td><td><code>lucide-react</code> circle-x / triangle-alert / info via <code>Glyph</code></td><td>resolver-context pattern, no new icon plumbing</td></tr>
    <tr><td>rule-id chip</td><td>none</td><td><code>Badge</code> outline sm</td><td>authored characters verbatim</td></tr>
    <tr><td><b>unchanged (stock seam)</b></td><td><code>PortState</code> (port.tsx:37), <code>STATE_TOKENS</code> (:53), skin token table (skin.ts:89), Trace variant dashes</td><td>—</td><td>untouched by this axis, by design</td></tr>
    </table>"""

    # ----- captures column -----------------------------------------------
    def maybe(uri, title, caption, w=460, natural=False):
        return img_card(uri, title, caption, w, natural) if uri else ""

    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invalid States — the diagnostic axis</title>
<style>{STYLE}{MOCK_CSS}</style></head>
<body><div class="wrap">

<h1>Invalid states — what a wrong thing looks like</h1>
<p class="sub">A design proposal, nothing implemented: one <code>diagnostic</code> prop
(<code>error · warning · info</code>), orthogonal to <code>state</code>, rendered through marks the
components can already carry. Spec of record: <code>docs/INVALID-STATES-PLAN.md</code>.
Every dark panel below is a drawn mock in the app's own dark-theme tokens; photographs are real
captures from this lane's Storybook and say so.</p>

<h2>The ask, and the two references</h2>
<div class="two">
  {img_card(vscode_ref, "The VS Code diagnostic hover (Zach's screenshot, vault)", "squiggle → popup: message · rule id <code>Ruff(F407)</code> · action button · View Problem / Quick Fix. The popover mock below mirrors this anatomy piece for piece.", 560)}
  <div>
    {img_card(squiggle_ref, "His Sep 1 sketch of the error state", "a red squiggle under a bad token — from FR - Block, Ports &amp; Edges Primitive § Linting/Error state.", 220)}
    <div class="callout" style="margin-top:16px"><b>His constraint:</b> "Could you do it with no new components? maybe you may need a couple but could be mostly styling." Held below: <b>2</b> new components, one of which is a verbatim shadcn/Base&nbsp;UI vendor copy; every other mark is a prop.</div>
  </div>
</div>

<h2>The axis — <code>diagnostic</code>, orthogonal to <code>state</code></h2>
<p class="sub">The canonical lint — two producers into one port — can only fire on a <b>wired</b> port.
If <code>"error"</code> were a fifth <code>PortState</code> (port.tsx:37), marking the port would erase the very
fact the lint is complaining about. <code>dimmed</code> and <code>hinting</code> already model this split
(port.tsx:169-181): host-computed facts <i>about</i> the port live beside the enum, never in it.
Sixteen cells, every one reachable:</p>
<div class="board col">{matrix}</div>
{maybe(cap_port, "Real capture — Ports/Port · AllStates, today", "the four semantic states this axis must not disturb (plus host-computed Out&nbsp;of&nbsp;Focus). Compare the matrix's left column.", 640)}

<h2>Who may paint what — the channel contract</h2>
<p class="sub">Four appearance axes stay composable because each owns disjoint CSS channels.
This is also the whole composition contract with the comparison lane — their diff marks keep the
fill/wash/chip/typography channels and their own names; this axis never tints a surface.</p>
{channels}
{diff_compose_board}

<h2>Inventory — every mark against what already exists</h2>
{inventory}

<h2>Port</h2>
<p class="sub">The halo reuses <code>hinting</code>'s exact geometry (port.tsx:127-129) in the severity token —
one halo grammar on the board: accent halo = "about to wire", red halo = "broken". The state ring is never recoloured.
A dot has no room for an icon; the message rides the label, flag, or popover.</p>
{port_board}

<h2>LabeledPort</h2>
{lport_board}
{maybe(cap_lport, "Real capture — Ports/LabeledPort · Default, today", "dot + rest-span label; the squiggle is text-decoration on this exact span, so nothing moves.", 320, natural=True)}

<h2>Block</h2>
<p class="sub">Error gets both beacons — glow + flag; a warning gets the flag alone (calm board rule);
info paints nothing. The flag straddles the corner the way wall-mounted ports already straddle walls (blockPort.tsx).</p>
{block_board}
{maybe(cap_block, "Real capture — Blocks/Block · ComposedWithBar, today", "the resting card the glow layers under — border and shadow slots at block.tsx:157-158.", 380)}

<h2>The click-through — flag → popover</h2>
<p class="sub">The VS Code hover anatomy, carried by existing parts: severity <code>Glyph</code> ·
message text · rule-id <code>Badge</code> · a host <code>actions</code> slot · host footer links.
Hover on marked text gives the same body minus actions, via <code>Tooltip</code> (rich children verified, tooltip.tsx:33,60).
Click needs the one honest vendor copy: <code>popover.tsx</code> — Tooltip is hover-only, DropdownMenu imposes menu roles.</p>
{popover_board}

<h2>PortEdge</h2>
<p class="sub">Nothing on the rail itself, at any severity — the port is the subject, the rail is furniture.
<code>PortEdgeItem</code> (portEdge.tsx:89-93) grows <code>diagnostic?</code> and forwards it to the LabeledPort it renders.</p>

<h2>Trace</h2>
<p class="sub">"Red backdrop of cables": one extra translucent path on the hit-path geometry (trace.tsx:131) —
the stroke itself keeps its variant colour and dash, so <code>data</code>/<code>async</code>/<code>delayed</code> stay legible under the mark.</p>
{trace_board}
{two_producers_board}
{maybe(cap_wiring, "Real capture — Blocks/BlockWiring · WiringScenarios, today", "the board these marks land on: grey cables, orange wired dots — unmarked, as a passing board must stay.", 640)}

<h2>CodeEditor</h2>
{ced_board}
{maybe(cap_ced, "Real capture — Basics/CodeEditor · MultiLine, today", "gutter + syntax highlighting exist; @codemirror/lint adds the squiggle layer to this exact surface.", 460, natural=True)}

<h2>EditableText</h2>
{etx_board}
{maybe(cap_etx, "Real capture — Basics/EditableText · Default, today", "", 320, natural=True)}

<h2>Badge</h2>
{badge_board}
{maybe(cap_badge, "Real capture — Basics/Badge · Variants, today", "destructive already exists — error costs nothing; warning is one cva row.", 460)}

<h2>Value preset</h2>
{value_board}
{maybe(cap_value, "Real capture — Presets/Value · Wired, today", "capsules on the wired board — the glow marks the pill via the Block it already renders (value.tsx:142).", 640)}

<h2>Severity tokens — ported, not invented</h2>
{tokens}

<h2>One vocabulary, two producers — but two props</h2>
<p class="sub">SystemSketch runs diff and lint through ONE per-shape <code>state</code>
(blockModel.ts:214; diagnosticsModel.ts's "one state vocabulary on the primitives, two producers"), and the donor package
made the same single-axis call as <code>Lens</code> (appearance.ts:124 — currently a <code>data-lens</code> attribute, no paint).
This kit should share the <b>severity vocabulary and tokens</b> but split the <b>props</b>:
a single enum makes <i>changed-AND-broken</i> — the comparison view's most important cell — inexpressible;
it forces every host to merge two producers before the component; and SystemSketch's own record shows the coupling cost
("the lint producer is not wired to paint"). Calm comes from the channel contract and from info flattening to nothing,
not from mutual exclusion. The composed mock under the channel table shows both marks on one port without collision.</p>

<h2>Stock parts, element by element</h2>
{stock}

<h2>Deliberately not here</h2>
<ul class="plain">
<li><b>The linter engine</b> — external, per the ruling ("anything that can be <i>wrong</i> lives on the Python side").</li>
<li><b>Gutter marks, overview ruler, Problems panel</b> — editor-chrome scale, not component scale.</li>
<li><b>Persistence</b> — <code>diagnostic</code> is never written to a document; the producer re-derives it (same contract as <code>received</code>, appearance.ts:43-49).</li>
<li><b>Naming the diff states</b> — the comparison lane's call; only the channel contract above constrains the composition.</li>
<li><b>"hint" severity and a <code>diagnosticColor</code> escape hatch</b> — rejected to keep the set closed, like the skin table's fixed 15 tokens (skin.ts:89).</li>
</ul>

<footer>
Built by <code>docs/build_invalid_states_report.py</code> from <code>{facts["head_short_sha"]}</code>
(&ldquo;{facts["head_subject"]}&rdquo;) on branch <code>{facts["branch"]}</code>.
Mocks are drawn in the app's own dark-theme tokens; captures are real and labelled as such.
Spec of record: <code>docs/INVALID-STATES-PLAN.md</code>. Vault topic note:
<code>Projects/bbox-ui/MOC - Invalid States &amp; Lint Marks.md</code>.
</footer>
</div></body></html>"""
    return html


def main() -> None:
    html = build()
    out_path = REPO / "reports/media" / f"invalid-states-proposal-{date.today().isoformat()}.html"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html)
    print(f"wrote {out_path}  ({out_path.stat().st_size:,} bytes on disk)")
    encoded = len(quote(html, safe="").encode())
    verdict = "OK, opens in preview" if encoded < CAP_BYTES else "OVER CAP — browser-only"
    print(f"encoded data: URL {encoded:,} / {CAP_BYTES:,} bytes  ({encoded / CAP_BYTES:.0%})  -> {verdict}")


if __name__ == "__main__":
    main()
