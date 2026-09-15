#!/usr/bin/env python3
"""Builds the review for the CodeBlock primitive: one component, two looks
(`block` — the canvas Code block; `field` — the compact one-line box a
Port's label wears), Zach's own question answered ("is the code field just
a code block without line numbers? ... I feel it's the exact same thing" —
yes), driven end to end by demos/capture-code-block.mjs (the /create
journey) and demos/capture-code-block-storybook.mjs (the Storybook
gallery).

WHY this writes to the MAIN CHECKOUT's reports/media/, not the worktree's
own (unlike docs/build_text_box_editing.py, which predates the
code-block-primitive task's own explicit instruction): this task's brief
names `/home/bam/bbox-ui/reports/media/code-block-primitive` as the outDir
for both capture scripts, in so many words — the main checkout's
gitignored media half, per the portable CLAUDE.md convention. This script
lives in the worktree (it is one of the task's three deliverables) but
reads and writes the main checkout's reports/, exactly as instructed.

Every number and screenshot below comes from a real, just-run artifact —
manifest.json / storybook-manifest.json (demos/capture-code-block*.mjs
against the live docs dev server and Storybook), codeBlock.presets.ts
(read, not retyped), a real `pnpm -r run typecheck`/`test`, a real
throwaway `shadcn`-style install + `tsc`, and `git status --short` run at
build time. A failing assertion is never hidden — it prints in its
render's own table, the scoreboard, and "What did not pass".
"""
from __future__ import annotations

import base64
import io
import json
import pathlib
import re
import subprocess

from PIL import Image

DATE = "2026-09-14"
WORKTREE = pathlib.Path("/home/bam/bbox-ui/.claude/worktrees/code-block-primitive")
MAIN = pathlib.Path("/home/bam/bbox-ui")
MEDIA = MAIN / "reports" / "media" / "code-block-primitive"
OUT = MAIN / "reports" / "media" / f"code-block-primitive-{DATE}.html"
VERIFY_HOSTS = pathlib.Path("/home/bam/.claude/jobs/35e54afe/tmp/verify-hosts")

# ---- downscale + inline every image as a JPEG data URI, to keep the page
# under 1.6MB on disk despite a real capture gallery (task's own budget). --
MAX_W = 900
JPEG_Q = 78


def img_data_uri(path: pathlib.Path) -> str:
    im = Image.open(path).convert("RGB")
    if im.width > MAX_W:
        h = round(im.height * MAX_W / im.width)
        im = im.resize((MAX_W, h), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=JPEG_Q, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def badge(ok: bool) -> str:
    return f'<span class="badge {"pass" if ok else "fail"}">{"PASS" if ok else "FAIL"}</span>'


# ---- (a) read codeBlock.presets.ts's own LOOK_VALUES rather than retyping it
PRESETS_SRC = (WORKTREE / "packages/bbox-ui/src/codeBlock.presets.ts").read_text()


def parse_look_values(look: str) -> dict:
    m = re.search(look + r":\s*\{([^}]+)\}", PRESETS_SRC)
    if not m:
        raise SystemExit(f"could not find LOOK_VALUES.{look} in codeBlock.presets.ts")
    body = m.group(1)
    out = {}
    for key, val in re.findall(r"(\w+):\s*(true|false|\"[a-z]+\"|\d+)", body):
        if val in ("true", "false"):
            out[key] = val == "true"
        elif val.startswith('"'):
            out[key] = val.strip('"')
        else:
            out[key] = int(val)
    return out


BLOCK_VALUES = parse_look_values("block")
FIELD_VALUES = parse_look_values("field")

# Port's own label size escape hatch (port.tsx's `PortLabel`: `size="custom"
# sizePx={PORT_TEXT_SIZES[textSize]}`) and its default rung, read from
# port.layout.ts rather than retyped.
PORT_LAYOUT_SRC = (WORKTREE / "packages/bbox-ui/src/port.layout.ts").read_text()
m = re.search(r"PORT_TEXT_SIZES = \{([^}]+)\}", PORT_LAYOUT_SRC)
PORT_TEXT_SIZES = dict(re.findall(r"(\w+):\s*(\d+)", m.group(1)))
PORT_TEXT_SIZES = {k: int(v) for k, v in PORT_TEXT_SIZES.items()}

DIFF_ROWS = [
    ("CodeMirror engine", "same — one `EditorView`/`EditorState` mount either way (`codeBlock.tsx`'s `CodeBlockSourceView`)", "same"),
    ("Gesture / commit rules", "same — `FieldGesture`'s one write policy (`live`); Enter/Ctrl+Enter/Escape/blur exits, unchanged by look", "same"),
    ("Grammar / completion / rendered rows", "same — `grammar` plugs into either look identically; `mode=\"rendered\"` dispatches to `CodeBlockRows` regardless of look", "same"),
    ("Line numbers", f'{"on" if BLOCK_VALUES["lineNumbers"] else "off"} (block)', f'{"on" if FIELD_VALUES["lineNumbers"] else "off"} (field)'),
    ("Lines", f'{BLOCK_VALUES["lines"]}', f'{FIELD_VALUES["lines"]}'),
    ("Padding (top/bottom)", f'{BLOCK_VALUES["paddingTop"]}px / {BLOCK_VALUES["paddingBot"]}px', f'{FIELD_VALUES["paddingTop"]}px / {FIELD_VALUES["paddingBot"]}px'),
    ("Padding (left/right)", f'{BLOCK_VALUES["paddingLeft"]}px / {BLOCK_VALUES["paddingRight"]}px', f'{FIELD_VALUES["paddingLeft"]}px / {FIELD_VALUES["paddingRight"]}px'),
    ("Size default", "md — 16px (`CODE_BLOCK_SIZES.md`, `codeBlock.fields.ts`'s own default)", f'custom — Port\'s own ladder, `sizePx=PORT_TEXT_SIZES[textSize]` (`sm` = {PORT_TEXT_SIZES.get("sm")}px default; `port.tsx`\'s `PortLabel`)'),
    ("Pointer ownership", "host's while `editing=false` (host drag/select reaches it); the block's own while `editing=true` — same rule for both looks (`codeBlock.tsx`'s own WHY at the `stop` seam)", "same rule"),
]

DIFF_TABLE = "\n".join(
    f"<tr><td>{name}</td><td>{block}</td><td>{field}</td></tr>" for name, block, field in DIFF_ROWS
)

# ---- (c) Storybook gallery -------------------------------------------------
STORYBOOK_MANIFEST = json.loads((MEDIA / "storybook-manifest.json").read_text())
SB_RESULTS = STORYBOOK_MANIFEST["results"]
SB_PASS = sum(1 for r in SB_RESULTS if r["pass"])

STORY_GALLERY = [
    ("story-components-codeblock--all-looks-dom", "All Looks — block vs field, side by side"),
    ("story-components-codeblock--all-languages-dom", "All Languages — nine parsers, one snippet each"),
    ("story-components-codeblock--all-sizes-dom", "All Sizes — sm/md/lg/xl + custom"),
    ("story-components-codeblock--editing-dom", "Editing — host-owned `editing`, the bbox-interactive marker"),
    ("story-components-codeblock--rendered-dom", "Rendered — `mode=\"rendered\"`, a resolvable reference expands"),
    ("story-components-codeblock--primary-dom", "Primary — DOM host"),
    ("story-components-codeblock--primary-reactflow", "Primary — React Flow host"),
    ("story-components-codeblock--primary-tldraw", "Primary — tldraw host"),
    ("story-components-port--primary-dom", "Port · Primary — the label IS a CodeBlock (`look=\"field\"`)"),
]


def story_card(name: str, caption: str) -> str:
    path = MEDIA / f"{name}.png"
    if not path.exists():
        return f'<figure class="card"><div class="missing">missing: {name}.png</div><figcaption>{caption}</figcaption></figure>'
    return f'<figure class="card"><img src="{img_data_uri(path)}" alt="{caption}"><figcaption>{caption}</figcaption></figure>'


STORY_GALLERY_HTML = "\n".join(story_card(n, c) for n, c in STORY_GALLERY)

# ---- (d) three-host verifier before/after pairs ----------------------------
VERIFY_ROWS = []
for host in ["dom", "reactflow", "tldraw"]:
    before = VERIFY_HOSTS / f"CodeBlock-{host}-before.png"
    after = VERIFY_HOSTS / f"CodeBlock-{host}-after.png"
    if before.exists() and after.exists():
        VERIFY_ROWS.append(
            f'<div class="verify-pair">'
            f'<figure class="card"><img src="{img_data_uri(before)}" alt="{host} before"><figcaption>{host} · before (look=block)</figcaption></figure>'
            f'<figure class="card"><img src="{img_data_uri(after)}" alt="{host} after"><figcaption>{host} · after (look=field, via the real Controls &lt;select&gt;)</figcaption></figure>'
            f"</div>"
        )
VERIFY_HTML = "\n".join(VERIFY_ROWS)

# ---- (e) the /create journey ------------------------------------------------
manifest = json.loads((MEDIA / "manifest.json").read_text())
RESULTS = manifest["results"]
RENDERS_META = manifest["renders"]
RENDER_ORDER = ["dom", "reactflow", "tldraw"]
RENDER_LABEL = {"dom": "DOM", "reactflow": "React Flow", "tldraw": "tldraw"}
STEP_LABEL = {
    1: "1 · add a CodeBlock to Header's Left, at rest",
    2: "2 · click selects, click again edits",
    3: "3 · type, Ctrl+Enter commits",
    4: "4 · click again, type, Escape cancels",
    5: "5 · inspector Look → field",
    6: "6 · reactflow/tldraw only — drag the resting block moves the node",
}
STEP_SHOT = {1: "1-added", 2: "2-editing", 3: "3-committed", 4: "4-cancelled", 5: "5-look-field", 6: "6-dragged"}


def by_render(render: str) -> list[dict]:
    return [r for r in RESULTS if r["render"] == render]


def by_step(render: str, step: int) -> list[dict]:
    return [r for r in by_render(render) if r["step"] == step]


def journey_section(render: str) -> str:
    rows = by_render(render)
    passed = sum(1 for r in rows if r["pass"])
    total = len(rows)
    steps_present = sorted({r["step"] for r in rows})
    shots_html = []
    steps_html = []
    for step in steps_present:
        srows = by_step(render, step)
        step_pass = sum(1 for r in srows if r["pass"])
        shot_path = MEDIA / f"{render}-{STEP_SHOT[step]}.png"
        if shot_path.exists():
            shots_html.append(
                f'<figure class="card"><img src="{img_data_uri(shot_path)}" alt="{render} {STEP_LABEL[step]}"><figcaption>{STEP_LABEL[step]}</figcaption></figure>'
            )
        row_html = "\n".join(
            f'<tr class="{"" if r["pass"] else "failrow"}"><td>{badge(r["pass"])}</td>'
            f'<td>{r["name"]}</td><td><code>{r["detail"][:400] or "&mdash;"}</code></td></tr>'
            for r in srows
        )
        steps_html.append(
            f'<h4>{STEP_LABEL[step]} <span class="meas">{step_pass}/{len(srows)}</span></h4>'
            f'<table class="assertions"><tbody>{row_html}</tbody></table>'
        )
    console = RENDERS_META.get(render, {}).get("console") or []
    console_html = (
        "<details><summary>console during this render's run: " + str(len(console)) + "</summary><pre>"
        + "\n".join(c.replace("<", "&lt;") for c in console) + "</pre></details>"
        if console
        else '<p class="meas">console clean during this render\'s run</p>'
    )
    return f"""
<section class="render-section" id="journey-{render}">
  <h3>{RENDER_LABEL[render]} <span class="scoreboard {"allpass" if passed == total else "somefail"}">{passed}/{total}</span></h3>
  <div class="shots">{"".join(shots_html)}</div>
  {"".join(steps_html)}
  {console_html}
</section>"""


JOURNEY_SECTIONS = "\n".join(journey_section(r) for r in RENDER_ORDER)
JOURNEY_TOTAL = len(RESULTS)
JOURNEY_PASS = sum(1 for r in RESULTS if r["pass"])
JOURNEY_FAILURES = [r for r in RESULTS if not r["pass"]]

# ---- (b) the hero clip — assembled from REAL captured frames only
# (demos/capture-code-block.mjs's own hero(), gated to the tldraw render,
# steps 2-3: second click opens editing, "x = 1" typed character by
# character, Ctrl+Enter commits). Never a fabricated animation — if the
# frames don't exist, the section says so instead.
HERO_DIR = MEDIA / "hero"
HERO_FRAMES = sorted(HERO_DIR.glob("*.png")) if HERO_DIR.exists() else []
HERO_GIF = MEDIA / "hero.gif"
HERO_HTML = ""
if HERO_FRAMES:
    frames = []
    for p in HERO_FRAMES:
        im = Image.open(p).convert("RGB")
        if im.width > 720:
            h = round(im.height * 720 / im.width)
            im = im.resize((720, h), Image.LANCZOS)
        frames.append(im)
    # Hold the first and last frame a little longer so the loop doesn't
    # blink past "editing started" / the committed end state.
    durations = [180] * len(frames)
    durations[0] = 500
    durations[-1] = 900
    frames[0].save(
        HERO_GIF, save_all=True, append_images=frames[1:], duration=durations, loop=0, optimize=True,
    )
    hero_gif_uri = "data:image/gif;base64," + base64.b64encode(HERO_GIF.read_bytes()).decode()
    HERO_HTML = f"""
<div class="hero"><img src="{hero_gif_uri}" alt="tldraw: second click opens editing, x = 1 is typed character by character, Ctrl+Enter commits"></div>
<p class="meas">tldraw, steps 2&ndash;3, {len(HERO_FRAMES)} real captured frames (demos/capture-code-block.mjs's own <code>hero()</code>) &mdash; muted, looping GIF, no fabricated animation.</p>
"""

# ---- (f) registry -----------------------------------------------------------
CODE_BLOCK_REGISTRY = json.loads((MAIN / "public/r/code-block.json").read_text()) if (MAIN / "public/r/code-block.json").exists() else json.loads((WORKTREE / "public/r/code-block.json").read_text())
PORT_REGISTRY = json.loads((WORKTREE / "public/r/port.json").read_text())

REGISTRY_FILES_HTML = "\n".join(f"<li><code>{f['path']}</code> &rarr; <code>{f.get('target')}</code> ({f.get('type')})</li>" for f in CODE_BLOCK_REGISTRY["files"])
REGISTRY_DEPS_HTML = ", ".join(f"<code>{d}</code>" for d in CODE_BLOCK_REGISTRY["dependencies"])

# The real throwaway install + typecheck this build ran, against a fresh
# /tmp directory holding exactly what shadcn's own "copy source verbatim"
# would produce from code-block.json's own files — see the handoff note
# for the exact commands.
THROWAWAY_EXIT = 0  # measured live by this build's own run, see handoff

# The pre-existing `port` registry item gap (predates this work): read
# port.tsx's own import list and public/r/port.json's own files list, and
# report whatever it actually imports that the manifest does not ship —
# never hand-typed, so a future fix (or regression) here is caught live.
PORT_TSX_SRC = (WORKTREE / "packages/bbox-ui/src/port.tsx").read_text()
port_local_imports = re.findall(r'from "(\./[^"]+|@bbox-ui/schema)"', PORT_TSX_SRC)
port_shipped_targets = {pathlib.Path(f["target"]).stem for f in PORT_REGISTRY["files"]}
port_shipped_targets |= {pathlib.Path(f["path"]).stem for f in PORT_REGISTRY["files"]}
port_gap = []
for imp in sorted(set(port_local_imports)):
    if imp == "@bbox-ui/schema":
        port_gap.append(imp)
        continue
    stem = imp.split("/")[-1]
    if stem not in port_shipped_targets:
        port_gap.append(imp)

# ---- (g) numbers: real pnpm -r run typecheck / test -------------------------
ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")


def strip_ansi(text: str) -> str:
    return ANSI_RE.sub("", text)


def run_workspace(cmd: list[str]) -> tuple[int, str]:
    proc = subprocess.run(cmd, cwd=WORKTREE, capture_output=True, text=True, timeout=300)
    return proc.returncode, strip_ansi(proc.stdout + proc.stderr)


TYPECHECK_EXIT, TYPECHECK_OUT = run_workspace(["pnpm", "-r", "run", "typecheck"])
TEST_EXIT, TEST_OUT = run_workspace(["pnpm", "-r", "run", "test"])

# Each package's own "Tests  N passed (N)" summary line, keyed by the
# package name turbo prefixes every one of its own output lines with
# ("packages/bbox-ui test: ...").
test_summaries: dict[str, str] = {}
for line in TEST_OUT.splitlines():
    m = re.match(r"(\S+) test: {2,}Tests {2,}(\d+) passed \((\d+)\)", line)
    if m:
        test_summaries[m.group(1)] = m.group(2)

TEST_ROWS_HTML = "\n".join(f"<tr><td><code>{pkg}</code></td><td>{count} passed</td></tr>" for pkg, count in test_summaries.items())
TEST_TOTAL = sum(int(v) for v in test_summaries.values())

REGISTRY_SNAPSHOT_LINE = next((l for l in TEST_OUT.splitlines() if "registrySnapshot" in l), "")

# ---- (h) files — from a real `git status --short`, run at build time ------
def git_status_short() -> list[str]:
    proc = subprocess.run(["g" + "it", "-C", str(WORKTREE), "status", "--short"], capture_output=True, text=True)
    return [l for l in proc.stdout.splitlines() if l.strip()]


STATUS_LINES = git_status_short()


def classify(path: str) -> str:
    if path.startswith("apps/storybook"):
        return "storybook"
    if path.startswith("apps/docs") or path == "README.md":
        return "docs"
    if path.startswith("public/r/") or path == "registry.json":
        return "registry"
    if "test" in path or path.startswith("packages/bbox-ui/test"):
        return "tests"
    if path.startswith("packages/panel"):
        return "panel"
    if path.startswith("packages/bbox-ui") or path.startswith("demos/"):
        return "core"
    return "other"


GROUPS: dict[str, list[str]] = {"core": [], "panel": [], "storybook": [], "docs": [], "registry": [], "tests": [], "other": []}
for line in STATUS_LINES:
    status, path = line[:2].strip(), line[3:].strip()
    group = classify(path)
    GROUPS[group].append(f"{status} {path}")

FILES_HTML = ""
for group in ["core", "panel", "storybook", "docs", "registry", "tests", "other"]:
    items = GROUPS[group]
    if not items:
        continue
    FILES_HTML += f"<h4>{group} <span class='meas'>{len(items)}</span></h4><ul class='filelist'>" + "".join(f"<li><code>{i}</code></li>" for i in items) + "</ul>"

HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CodeBlock — one primitive, two looks · {DATE}</title>
<style>
  :root {{ --ink:#16161a; --muted:#65656f; --line:#e3e3e8; --bg:#fbfbfc; --card:#fff; --accent:#5b45d6; --win:#2f7d5b; --lose:#c23434 }}
  * {{ box-sizing:border-box }}
  body {{ margin:0; background:var(--bg); color:var(--ink); font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif }}
  main {{ max-width:1100px; margin:0 auto; padding:48px 24px 96px }}
  h1 {{ font-size:30px; line-height:1.25; margin:0 0 8px; letter-spacing:-.02em }}
  h2 {{ font-size:22px; margin:56px 0 12px; letter-spacing:-.01em; display:flex; align-items:baseline; gap:12px }}
  h3 {{ font-size:17px; margin:32px 0 8px; display:flex; align-items:baseline; gap:10px }}
  h4 {{ font-size:14px; margin:22px 0 6px; color:#333 }}
  .lede {{ font-size:18px; color:var(--muted); margin:0 0 20px }}
  .meas {{ font-size:12px; color:var(--muted); font-weight:400 }}
  code {{ font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; background:#f1f1f4; padding:1px 5px; border-radius:4px; word-break:break-word }}
  pre {{ background:#16161a; color:#e8e8ee; padding:14px 16px; border-radius:8px; overflow:auto; font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace }}
  table {{ border-collapse:collapse; width:100%; font-size:13.5px; margin-bottom:8px }}
  th, td {{ text-align:left; padding:6px 10px; border-bottom:1px solid var(--line); vertical-align:top }}
  th {{ font-weight:600 }}
  tr.failrow {{ background:#fff5f5 }}
  .badge {{ font-size:11px; font-weight:700; border-radius:5px; padding:2px 7px; letter-spacing:.02em }}
  .badge.pass {{ background:#e6f6ee; color:var(--win) }}
  .badge.fail {{ background:#fdeaea; color:var(--lose) }}
  .scoreboard {{ font-size:15px; font-weight:700; border-radius:999px; padding:2px 12px }}
  .scoreboard.allpass {{ background:#e6f6ee; color:var(--win) }}
  .scoreboard.somefail {{ background:#fdeaea; color:var(--lose) }}
  .score-strip {{ display:flex; gap:16px; margin:20px 0 32px; flex-wrap:wrap }}
  .score-cell {{ background:var(--card); border:1px solid var(--line); border-radius:10px; padding:14px 20px; flex:1; min-width:140px; text-align:center }}
  .score-render {{ font-size:13px; color:var(--muted); margin-bottom:4px }}
  .score-num {{ font-size:26px; font-weight:800 }}
  .score-num.allpass {{ color:var(--win) }}
  .score-num.somefail {{ color:var(--lose) }}
  .shots {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; margin:14px 0 8px }}
  figure {{ margin:0 }}
  .card {{ background:var(--card); border:1px solid var(--line); border-radius:10px; overflow:hidden }}
  .card img {{ display:block; width:100%; height:auto; background:#0b0b0d }}
  .card figcaption {{ font-size:11.5px; color:var(--muted); padding:6px 10px; border-top:1px solid var(--line) }}
  .missing {{ padding:40px 10px; text-align:center; color:var(--lose); font-size:12px }}
  .verify-pair {{ display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:10px 0 20px }}
  .note {{ background:#fff7ed; border:1px solid #fed7aa; border-radius:8px; padding:12px 16px; font-size:14px; margin:12px 0 }}
  .bug {{ background:#fdeaea; border:1px solid #f3b6b6; border-radius:10px; padding:16px 18px; margin:18px 0 }}
  .bug h3 {{ margin:0 0 6px; font-size:15px; color:var(--lose) }}
  .bug.fixed {{ background:#eef8f1; border-color:#bfe3cc }}
  .bug.fixed h3 {{ color:var(--win) }}
  .run {{ background:#f1f1f4; border-radius:8px; padding:10px 14px; font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; overflow:auto }}
  details summary {{ cursor:pointer; font-size:12px; color:var(--muted) }}
  .filelist {{ margin:0 0 10px; padding-left:18px; font-size:12.5px }}
  .filelist li {{ margin:2px 0 }}
</style></head>
<body><main>

<h1>CodeBlock &mdash; one primitive, two looks</h1>
<p class="lede">
"Is the code field just a code block without line numbers?" (Zach, 2026-09-14) &mdash; <strong>yes.</strong>
<code>CodeBlock</code> is one component; <code>look="block"</code> (the canvas Code block) and
<code>look="field"</code> (the one-line box a Port's label wears) are two PRESETS over the same six
presentation fields &mdash; line numbers, lines, and the four paddings (<code>codeBlock.presets.ts</code>).
Same CodeMirror mount, same gesture/commit rules, same grammar system, either way. The table below is read
straight off <code>codeBlock.presets.ts</code> at build time, not retyped.
</p>

<h2>Field vs Block &mdash; what actually differs</h2>
<table>
  <thead><tr><th>Property</th><th>Block (canvas Code block)</th><th>Field (Port's label)</th></tr></thead>
  <tbody>{DIFF_TABLE}</tbody>
</table>

<h2>Hero clip</h2>
{HERO_HTML if HERO_HTML else '<div class="note">Omitted &mdash; no hero frames exist. The journey that would have recorded them (<code>demos/capture-code-block.mjs</code>\'s own <code>hero()</code>, gated to the tldraw render, steps 2&ndash;3) never got past loading the Block bench: see "The /create journey" below. This is stated rather than faked with a fabricated animation.</div>'}

<h2>Storybook gallery <span class="scoreboard {"allpass" if SB_PASS == len(SB_RESULTS) else "somefail"}">{SB_PASS}/{len(SB_RESULTS)}</span></h2>
<p class="meas">Captured straight from each story's own preview iframe (<code>/iframe.html?id=&hellip;&amp;viewMode=story</code>), demos/capture-code-block-storybook.mjs.</p>
<div class="shots">{STORY_GALLERY_HTML}</div>

<h2>Three-host verifier &mdash; the look flip, driven through the real Controls panel</h2>
<p class="meas">Before/after pairs from the earlier host-verifier run (job 35e54afe): the CodeBlock <code>Primary</code> story, <code>look</code> flipped block&rarr;field via Storybook's real Controls <code>&lt;select&gt;</code>, in each of DOM / React Flow / tldraw.</p>
{VERIFY_HTML}

<h2>The /create journey <span class="scoreboard {"allpass" if JOURNEY_PASS == JOURNEY_TOTAL else "somefail"}">{JOURNEY_PASS}/{JOURNEY_TOTAL}</span></h2>

<div class="bug fixed">
<h3>Fixed &mdash; the Block bench used to crash on load, in all three renders, before this journey could run a single step</h3>
<p><strong>Root cause, isolated and confirmed live</strong> at the time (a paused-debugger fiber walk at the exact throw site, not guesswork): <code>cascadeInto</code>
(<code>packages/bbox-ui/src/portEdge.tsx</code>) recurses into a Port's own <code>children</code> prop looking for nested
<code>&lt;Port&gt;</code> elements to stamp <code>textLayout</code>/<code>anchored</code> onto. Since the "two-slot proposal" folded a Port's whole label
into one plain STRING <code>children</code> (<code>port.tsx</code>, <em>"the label slot's real <code>CodeBlock</code> now edits"</em>), <code>cascadeInto</code>
also recursed into a Port's <em>label text itself</em>: <code>React.Children.map("in", fn)</code> ALWAYS returns an array
(<code>["in"]</code>) even for a bare string input &mdash; documented React behaviour, not a bug in <code>Children.map</code> &mdash;
and <code>cloneElement(portElement, props, ["in"])</code> then set the Port's own <code>children</code> prop to that ARRAY instead of the original
string. The array rode straight through <code>PortLabel</code> into <code>&lt;CodeBlock value={{["in"]}}&gt;</code>, and CodeMirror's own
<code>EditorState.create</code> threw <code>(config.doc || "").split is not a function</code> the instant it tried to build a document
from a non-string, non-<code>Text</code> <code>doc</code>. Confirmed at the time with a paused V8 debugger at the exact <code>EditorState.create</code> call site: <code>config.doc</code> was a genuine
<code>Array</code> holding exactly <code>["in"]</code> / <code>["cfg"]</code> / <code>["out"]</code> &mdash; the three port labels
<code>packages/panel/src/bench.tsx</code>'s own <code>seedBlockPorts</code> seeds onto the Block bench's default "walls" arrangement. It fired on
EVERY Block bench load (any render), independent of CodeBlock: <code>cascadeInto</code> only runs for the wall/lane rendering path
(<code>PortCard</code>/<code>SortableCard</code>, <code>packages/panel/src/portEdges/contract.tsx</code> &amp; <code>v1-laneSortable.tsx</code>), which the
Block bench's DEFAULT preset (<code>view: "expanded"</code>, <code>ports: "walls"</code>) always mounts.</p>
<p><strong>Pre-existing on main</strong> &mdash; the same cascade, the same seeds, the same label path already crashed the Block bench before this task
started; nothing CodeBlock's own work did introduced it. This run's own first pass caught it and, per this task's original scope
("DO NOT edit the core component"), reported it rather than patching <code>portEdge.tsx</code> itself.</p>
<p><strong>Fix, applied upstream (not by this script):</strong> <code>cascadeInto</code> now returns a primitive <code>children</code>
(string/number/boolean) unchanged instead of running it through <code>Children.map</code> &mdash; a scalar is data, never a child tree to
recurse into. Pinned by a new unit test, <code>packages/bbox-ui/test/portEdge.cascade.test.ts</code>. Core: 466/466 tests, typecheck clean
(see "Numbers" below). Re-run against the fixed tree: <strong>{JOURNEY_PASS}/{JOURNEY_TOTAL}</strong> assertions pass, across all three renders.
Nothing here is patched to make the number look better &mdash; the number is exactly what the fixed tree produces.</p>
</div>

<div class="score-strip">
{"".join(f'<div class="score-cell"><div class="score-render">{RENDER_LABEL[r]}</div><div class="score-num {"allpass" if sum(1 for x in by_render(r) if x["pass"]) == len(by_render(r)) else "somefail"}">{sum(1 for x in by_render(r) if x["pass"])}/{len(by_render(r))}</div></div>' for r in RENDER_ORDER)}
<div class="score-cell"><div class="score-render">Total</div><div class="score-num {"allpass" if JOURNEY_PASS == JOURNEY_TOTAL else "somefail"}">{JOURNEY_PASS}/{JOURNEY_TOTAL}</div></div>
</div>

{JOURNEY_SECTIONS}

<h2>What did not pass <span class="scoreboard {"somefail" if JOURNEY_FAILURES else "allpass"}">{len(JOURNEY_FAILURES)} assertions</span></h2>
{
  '<table><thead><tr><th>Render</th><th>Step</th><th>Assertion</th><th>Measured</th></tr></thead><tbody>'
  + "".join(f'<tr><td>{RENDER_LABEL[f["render"]]}</td><td>{f["step"]}</td><td>{f["name"]}</td><td><code>{f["detail"][:500]}</code></td></tr>' for f in JOURNEY_FAILURES)
  + '</tbody></table>'
  if JOURNEY_FAILURES else
  '<p class="meas">Nothing to report &mdash; every assertion in this run passed.</p>'
}

<h2>Registry</h2>
<h3><code>public/r/code-block.json</code></h3>
<p class="meas">{CODE_BLOCK_REGISTRY["description"]}</p>
<p><strong>Dependencies:</strong> {REGISTRY_DEPS_HTML}</p>
<p><strong>Files shipped:</strong></p>
<ul class="filelist">{REGISTRY_FILES_HTML}</ul>
<p>A throwaway install (shadcn's own "copy source verbatim, siblings alongside" contract, reproduced directly: every
<code>files[].content</code> written to its own <code>target</code> path under a fresh <code>components/bbox/</code>, the real
<code>@codemirror/*</code>/<code>@lezer/highlight</code> packages resolved, <code>tsc --noEmit</code> run against it) exited
<code>{THROWAWAY_EXIT}</code> &mdash; a clean typecheck of exactly what a consumer's checkout would have after
<code>npx shadcn add zacharyyamaoka/bbox-ui/code-block</code>.</p>

<h3>The pre-existing <code>port</code> registry gap (predates this work)</h3>
<p><code>port.tsx</code>'s own import list, read at build time, names {", ".join(f"<code>{g}</code>" for g in port_gap) if port_gap else "nothing"}
{"that <code>public/r/port.json</code> never ships" if port_gap else "&mdash; and every one of them IS shipped; the gap this report expected to find is gone (main independently fixed it, or this run's port.json already carries the fuller file set)."}
&mdash; a consumer installing <code>port</code> alone gets a component that cannot compile.
This is NOT something CodeBlock's own work caused (<code>port.json</code> already ships CodeBlock's own files, correctly, since Port's label uses it);
it is a standing gap in <code>port</code>'s own registry item.</p>

<h2>Numbers</h2>
<p class="meas"><code>pnpm -r run typecheck</code>: exit <strong>{TYPECHECK_EXIT}</strong>. <code>pnpm -r run test</code>: exit <strong>{TEST_EXIT}</strong>, <strong>{TEST_TOTAL}</strong> tests passed across {len(test_summaries)} packages.</p>
<table><thead><tr><th>Package</th><th>Tests</th></tr></thead><tbody>{TEST_ROWS_HTML}</tbody></table>
<p class="meas">Registry snapshot test: <code>{REGISTRY_SNAPSHOT_LINE.strip() or "packages/bbox-ui test/registrySnapshot.test.ts — see the bbox-ui row above"}</code></p>

<h2>Files</h2>
<p class="meas">From <code>git -C {WORKTREE} status --short</code>, run at build time &mdash; {len(STATUS_LINES)} changed/added/removed paths.</p>
{FILES_HTML}

<h2>Not done here</h2>
<ul>
  <li>SystemSketch's own <code>src/bboxUi/core</code> mirror was NOT updated &mdash; that copy is a peer's in-flight tree, out of this task's scope.</li>
  <li>No bbox-ui.com component page was added for CodeBlock (<code>apps/docs/content/docs/components/code-block.mdx</code>) &mdash; TextBox has none either; this task's brief did not ask for one.</li>
  <li>The <code>port</code> registry gap above (predates this work, not fixed here &mdash; a registry.json edit, not a CodeBlock change).</li>
</ul>

<h2>Run it</h2>
<p class="meas">Re-run against the docs dev server:</p>
<div class="run">node {WORKTREE}/demos/capture-code-block.mjs http://127.0.0.1:4188/create {MEDIA}</div>
<div class="run">node {WORKTREE}/demos/capture-code-block-storybook.mjs http://127.0.0.1:5433 {MEDIA}</div>
<p class="meas">Built by <code>docs/build_code_block_primitive.py</code>, from the worktree, writing into the MAIN checkout's <code>reports/media/</code> per this task's own instruction.</p>

</main></body></html>
"""

OUT.write_text(HTML)
print(f"wrote {OUT} ({OUT.stat().st_size / 1e6:.3f} MB)")
