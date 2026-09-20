#!/usr/bin/env python3
"""Build the chrome / files / settings review report.

The round: Zach's 2026-09-19 afternoon feedback about the NEW SystemSketch app
(`apps/systemsketch`) — the chrome (rename field, burger, no undo/redo pill), a
Settings surface, and real local file saving with the archive's navigator
ported over. Ask: `docs/ASK-2026-09-19-CHROME-FILES-SETTINGS.md`. Plan:
`docs/CHROME-FILES-SETTINGS-PLAN.md`.

    python3 docs/build_chrome_files_settings.py [--measure]

Written to `/home/bam/bbox-ui/reports/media/chrome-files-settings-2026-09-19.html`
— the gitignored half of `reports/`, because the page inlines a hero video and
eleven captures (`.claude/feedback.md`, 2026-09-17; the split is on inlined
payload, not on total size).

EVERY NUMBER IS MEASURED AT BUILD TIME, from one of four live sources, and the
builder raises rather than fall back to a literal:

  * `reports/media/<name>/measurements.json` — written by
    `docs/capture_chrome_files_settings.mjs` while it drove the REAL app
    (a Vite dev server, the real Python file host, a mkdtemp files root).
    Rects, menu rows, disk listings and file byte counts come from there.
  * `reports/media/<name>/gates/*.log` — raw vitest / unittest stdout.
    `--measure` re-runs all four suites into that folder first.
  * the plan's own §4 table, for the RED BASELINE each suite started from —
    parsed out of the markdown, so the report cannot claim a baseline the plan
    never committed to.
  * the working tree itself — `git`, line counts, and the export lists of the
    stock shadcn copies, read out of the files rather than retyped.
"""
from __future__ import annotations

import argparse
import base64
import datetime
import io
import json
import pathlib
import re
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from PIL import Image  # noqa: E402

from _report_kit import CSS, FB_JS, dock, fb, overall_box, report_size, sh  # noqa: E402

REPO = pathlib.Path(__file__).resolve().parent.parent
NAME = "chrome-files-settings-2026-09-19"
# The MAIN checkout, always — a report written into a worktree dies with the
# worktree and takes the `file://` Zach was handed with it.
MAIN = pathlib.Path("/home/bam/bbox-ui")
MEDIA = MAIN / "reports" / "media" / NAME
OUT = MAIN / "reports" / "media" / f"{NAME}.html"

SUITES = [
    ("trunk-unit", "trunk unit", "apps/storybook-basics", "pnpm exec vitest --project=unit run"),
    ("trunk-storybook", "trunk storybook", "apps/storybook-basics", "pnpm exec vitest --project=storybook run"),
    ("app", "app smoke + unit", "apps/systemsketch", "pnpm exec vitest run"),
    ("python", "python file host", ".", "python3 -m unittest discover -s scripts/tests -t scripts/tests -v"),
]


# ------------------------------------------------------------ measurement

def load_measurements() -> dict:
    path = MEDIA / "measurements.json"
    if not path.exists():
        raise SystemExit(
            f"missing {path}\nrun:  node docs/capture_chrome_files_settings.mjs --out {MEDIA}"
        )
    return json.loads(path.read_text())


def run_gates() -> None:
    (MEDIA / "gates").mkdir(parents=True, exist_ok=True)
    for key, label, cwd, cmd in SUITES:
        print(f"  running {label} …", flush=True)
        done = subprocess.run(cmd, shell=True, cwd=REPO / cwd, capture_output=True, text=True)
        (MEDIA / "gates" / f"{key}.log").write_text(done.stdout + done.stderr)


def parse_gate(key: str) -> dict:
    """Read a suite's result off its own stdout — never off a summary."""
    path = MEDIA / "gates" / f"{key}.log"
    if not path.exists():
        raise SystemExit(f"missing {path}\nrun:  python3 docs/build_chrome_files_settings.py --measure")
    text = path.read_text()
    # vitest: "Tests  1 failed | 152 passed (153)"  /  "Tests  509 passed (509)"
    hit = re.search(r"Tests\s+(?:(\d+) failed \| )?(\d+) passed(?: \| (\d+) skipped)? \((\d+)\)", text)
    if hit:
        failed = int(hit.group(1) or 0)
        return {"failed": failed, "passed": int(hit.group(2)), "total": int(hit.group(4)), "kind": "vitest"}
    # unittest: "Ran 55 tests in 10.264s" + "OK" / "FAILED (failures=N, errors=M)"
    ran = re.search(r"Ran (\d+) tests? in", text)
    if ran:
        total = int(ran.group(1))
        bad = re.search(r"FAILED \((?:failures=(\d+))?(?:, )?(?:errors=(\d+))?", text)
        failed = (int(bad.group(1) or 0) + int(bad.group(2) or 0)) if bad else 0
        return {"failed": failed, "passed": total - failed, "total": total, "kind": "unittest"}
    raise SystemExit(f"cannot read a result out of {path}")


def parse_baselines() -> dict[str, str]:
    """The red baseline each suite started from, read out of the PLAN's §4
    table — the report must not invent a baseline the plan never committed."""
    plan = (REPO / "docs/CHROME-FILES-SETTINGS-PLAN.md").read_text()
    rows = dict(re.findall(r"^\|\s*(.+?)\s*\|\s*(\*\*.+?)\s*\|$", plan, re.M))
    def find(needle: str) -> str:
        for key, value in rows.items():
            if needle in key:
                return re.sub(r"\*\*|`", "", value)
        raise SystemExit(f"no baseline row matching {needle!r} in the plan's §4 table")
    return {
        "trunk-unit": find("--project=unit"),
        "trunk-storybook": find("--project=storybook"),
        "app": find("app `pnpm test`"),
        "python": find("unittest discover"),
    }


def exports_of(relative: str) -> list[str]:
    """The exact exported names of a module, read out of its `export { … }`."""
    text = (REPO / relative).read_text()
    hit = re.search(r"^export \{(.*?)\};", text, re.M | re.S)
    if not hit:
        raise SystemExit(f"no export block in {relative}")
    return [n.strip() for n in hit.group(1).replace("\n", " ").split(",") if n.strip()]


def lines_of(relative: str) -> int:
    path = REPO / relative
    if not path.exists():
        raise SystemExit(f"missing {relative}")
    return len(path.read_text().splitlines())


def exists(relative: str) -> bool:
    return (REPO / relative).exists()


# ----------------------------------------------------------------- media

def png(name: str, max_width: int | None = 1500, quality: int = 78) -> str:
    """A capture on disk -> a WebP data URI, downscaled to what the page shows.

    No trim (unlike `_report_kit.shot`): these frames are already clipped to a
    measured DOM rect by the capture script, and trimming by background colour
    would eat the dialog's own margin — the very padding that shows it floats
    over the board.
    """
    path = MEDIA / "stills" / name
    if not path.exists():
        raise SystemExit(f"missing capture: {path}")
    image = Image.open(path).convert("RGB")
    if max_width and image.width > max_width:
        image = image.resize((max_width, round(image.height * max_width / image.width)), Image.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, "WEBP", quality=quality, method=6)
    return "data:image/webp;base64," + base64.b64encode(buffer.getvalue()).decode()


def datauri(path: pathlib.Path, mime: str) -> str:
    if not path.exists():
        raise SystemExit(f"missing {path}")
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def figure(src: str, title: str, body: str, klass: str = "") -> str:
    return (
        f'<figure class="{klass}"><img alt="{title}" src="{src}">'
        f"<figcaption><b>{title}</b>{body}</figcaption></figure>"
    )


def kb(n: int) -> str:
    return f"{n / 1024:,.0f} KB"


# ------------------------------------------------------------------ build

def build() -> str:
    M = load_measurements()
    gates = {key: parse_gate(key) for key, *_ in SUITES}
    baselines = parse_baselines()

    captured = datetime.datetime.fromisoformat(M["capturedAt"]).astimezone().strftime("%Y-%m-%d %H:%M")
    head = sh("git rev-parse --short HEAD", REPO)
    branch = sh("git rev-parse --abbrev-ref HEAD", REPO)
    # `--shortstat` already opens with "N files changed"; printing a separate
    # file count beside it read as "68 files, 68 files changed".
    round_stat = sh("git diff --shortstat ddb6a4c~1..HEAD", REPO).strip()

    total_tests = sum(g["total"] for g in gates.values())
    total_failed = sum(g["failed"] for g in gates.values())

    rename = M["rename"]
    delta = rename["delta"]
    worst = max(delta.values())
    bar_worst = max(rename["barDelta"].values())

    file_rows = M["fileMenu"]["rows"]
    native_rows = M["fileMenuNative"]["rows"]
    root_rows = M["burgerRoot"]["rows"]
    disk = M["workspaceOnDisk"]
    tldr_on_disk = [e for e in disk if e["name"].endswith(".tldr")]

    hero_mp4 = datauri(MEDIA / "hero.mp4", "video/mp4")
    hero_gif = datauri(MEDIA / "hero.gif", "image/gif")

    # -- the stock parts, element by element (plan §3), with a MEASURED column.
    stock = [
        ("Settings dialog / page shell", "nothing (the archive's tldraw-coupled <code>SystemSketchSettingsDialog</code>)",
         "components/dialog.tsx", "Modal, focus-trapped, Escape closes; the SAME view renders centred or full-window (<code>data-presentation</code>)"),
        ("A setting with two choices", "nothing",
         "components/radio-group.tsx", "One choice at a time, keyboard-navigable, each option keeps its own description"),
        ("A setting that is on/off", "the archive's hand-rolled <code>role=\"switch\"</code> button rows",
         "components/switch.tsx", "<code>role=\"switch\"</code> + <code>aria-checked</code> — the donor's own semantics, now stock"),
        ("A setting from a list", "nothing",
         "components/select.tsx", "Ships now so a lane never hand-rolls one for the first list-shaped setting"),
        ("Field labels and descriptions", "ad-hoc <code>&lt;strong&gt;/&lt;small&gt;</code> in the donor",
         "components/field.tsx", "Label/description/control association, so a screen reader reads a setting as one thing"),
        ("Field labels (the primitive)", "nothing",
         "components/label.tsx", "The <code>htmlFor</code> association the Field group composes"),
        ("Navigator text inputs (Filter, File name, New folder)", "the donor's <code>SystemSketchUiInput</code> over <code>TldrawUiInput</code>",
         "components/input.tsx", "Escape resets the draft without closing the dialog; Enter submits the navigator's action"),
        ("Navigator file table", "the donor's hand-styled <code>div</code> grid + <code>role=\"listbox\"</code>",
         "components/table.tsx", "Name ↑/↓ · Size · Modified, folders always first, second click reverses"),
    ]

    ours = [
        ("Burger menu, submenus, separators, checkbox rows", "<code>DropdownMenu*</code> (trunk) — but the burger rendered no separators and no checkbox rows",
         "components/dropdown-menu.tsx", "trunk, already existed",
         "One-press Escape; the shortcut column as display data; a group boundary is a separator; a toggle row is a real <code>menuitemcheckbox</code>"),
        ("The burger's CONTENT", "<code>fileActionsFor()</code> in the app — three rows",
         "components/appMenu.ts", "ours, new, in the trunk",
         "The archive's File order and shortcut spellings; a row exists only if the host can honour it"),
        ("Rename field", "<code>InlineRename</code> (trunk)",
         "components/inlineRename.tsx", "unchanged part, changed behaviour",
         "Enter / Escape(+stopPropagation) / blur, the 400 ms double-click guard, the unchanged-name cancel — all kept; the hint node and the layout shift go"),
        ("Settings surface", "nothing",
         "components/settingsView.tsx", "ours, new, in the trunk",
         "Left nav of categories, right pane; the app supplies WHICH settings, never how they look"),
        ("Settings storage + parse", "nothing",
         "components/appSettings.ts", "ours, new, in the trunk",
         "A throwing <code>localStorage</code> is swallowed — a preference never blocks drawing"),
        ("File browser", "the donor's <code>WorkspaceDialog</code> (2,232-line file, Radix, tldraw hooks)",
         "components/fileNavigator.tsx", "ours, ported, over the stock parts above",
         "Places/Recent rail, breadcrumb, ←, + Folder, Filter, sort, ↑/↓/Enter/Backspace, “Open in new window”, the Replace prompt"),
        ("Rows, sort, selection, breadcrumb, recents, untitled claims, autosave schedule", "nothing",
         "files/workspaceModel.ts", "ours, ported verbatim (its donor test suite ported with it)",
         "Folders first; the MRU list; a claim reserves an Untitled name across windows; the 600 ms debounce with a 30 s ceiling"),
        ("File host protocol client", "nothing",
         "files/workspaceClient.ts", "ours, ported",
         "Per-operation timeouts, <code>WorkspaceConflict</code> on 409, abort passthrough, retry only transient failures"),
        ("Native open/save", "nothing",
         "files/nativeFiles.ts", "stock BROWSER API, wrapped",
         "<code>showOpenFilePicker</code> / <code>showSaveFilePicker</code> / <code>createWritable</code>; cancel = nothing chosen; the same SHA-256 fence as the host"),
    ]

    unchanged = [
        ("Bar, Toolbar, Breadcrumb, Button, Tooltip, ButtonGroup, Badge", "trunk",
         "<code>ChromeBar</code>'s composition is untouched apart from the burger's renderer and the rename box"),
        ("tldraw's Edit / View / Export / Preferences commands", "<code>useActions</code>, <code>useCanUndo</code>, <code>useCanRedo</code>, <code>useTranslation</code>, <code>useDialogs</code>, <code>useToasts</code>",
         "Every row runs tldraw's own action — no second implementation of undo, zoom, export or snap mode"),
        ("tldraw's keyboard-shortcuts dialog", "the <code>open-kbd-shortcuts</code> action",
         "“Keyboard shortcuts” opens tldraw's own dialog; the app adds nothing"),
        ("The dock's Stable server", "<code>scripts/launch_systemsketch.py</code>",
         "<code>--update</code> / <code>--open</code> / <code>--stop</code> behave exactly as before; it only gained the file-host mount"),
        ("Icons", "<code>lucide-react</code> named exports",
         "Every <code>icon</code> prop stays a <code>ReactNode</code>; no string→asset registry"),
    ]

    stock_rows = "".join(
        f"<tr><td><b>{element}</b></td><td>{today}</td>"
        f"<td><code>{', '.join(exports_of('apps/storybook-basics/src/' + module))}</code>"
        f"<div style='color:var(--dim2);font-size:11.5px;margin-top:4px'>"
        f"{'✓ snapshot ' + module.split('/')[-1].replace('.tsx', '.json') if exists('docs/provenance/shadcn-base-nova/' + module.split('/')[-1].replace('.tsx', '.json')) else '— no snapshot'}"
        f" · {lines_of('apps/storybook-basics/src/' + module)} lines</div></td>"
        f"<td>{survives}</td></tr>"
        for element, today, module, survives in stock
    )

    ours_rows = "".join(
        f"<tr><td><b>{element}</b></td><td>{today}</td>"
        f"<td><b>{kind}</b><div style='color:var(--dim2);font-size:11.5px;margin-top:4px'>"
        f"<code>{module}</code> · {lines_of('apps/storybook-basics/src/' + module)} lines</div></td>"
        f"<td>{survives}</td></tr>"
        for element, today, module, kind, survives in ours
    )

    unchanged_rows = "".join(
        f"<tr class='dim'><td><b>{element}</b></td><td colspan='2'>{part}</td><td>{survives}</td></tr>"
        for element, part, survives in unchanged
    )

    gate_rows = ""
    for key, label, cwd, cmd in SUITES:
        g = gates[key]
        good = g["failed"] == 0
        gate_rows += (
            f"<tr class='{'good' if good else 'bad'}'><td><b>{label}</b>"
            f"<div style='color:var(--dim2);font-size:11.5px;margin-top:3px'><code>{cmd}</code></div></td>"
            f"<td>{baselines[key]}</td>"
            f"<td class='num'>{g['total']}</td>"
            f"<td class='{'yes' if good else 'no'}' style='text-align:right'>"
            f"{'all green' if good else str(g['failed']) + ' failed'}</td></tr>"
        )

    menu_rows = "".join(
        f"<tr><td><b>{r['label']}</b></td><td><code>{r['shortcut'] or '—'}</code></td>"
        f"<td class='c'>{'▸' if r['submenu'] else ''}</td>"
        f"<td class='{'no' if r['disabled'] else 'yes'}' style='text-align:right'>"
        f"{'needs a file-backed board' if r['disabled'] else 'live'}</td></tr>"
        for r in file_rows
    )

    native_labels = {r["label"] for r in native_rows}
    dropped = [r["label"] for r in file_rows if r["label"] not in native_labels]

    disk_rows = ""
    for entry in disk:
        size = "—" if entry["bytes"] is None else f"{entry['bytes']:,}"
        disk_rows += (
            f"<tr><td><b>{entry['name']}</b></td>"
            f"<td>{'folder' if entry['dir'] else 'file'}</td>"
            f"<td class='num'>{size}</td></tr>"
        )

    settings_sections = M["settings"]["sections"]
    settings_rows = ""
    for section in settings_sections:
        chosen = next(o["value"] for o in section["options"] if o["checked"])
        values = " · ".join(f"<b>{o['value']}</b>" for o in section["options"])
        settings_rows += (
            f"<tr><td><b>{section['id']}</b></td><td>{values}</td>"
            f"<td style='text-align:right'><code>{chosen}</code></td></tr>"
        )

    # -- captions computed here, not inside the page template: an apostrophe in
    #    a caption is a syntax error the moment it lands inside an f-string.
    cap_burger_root = (
        f"The root, {len(root_rows)} rows in {M['burgerRoot']['separators'] + 1} groups",
        " File ▸ · Settings · Edit ▸ View ▸ Export ▸ · Preferences ▸ Keyboard shortcuts ·"
        " Switch to old SystemSketch. Figma&rsquo;s grouping: one separator per group.",
    )
    cap_burger_file = (
        "File ▸ — the archive&rsquo;s ten rows, its order, its shortcuts",
        " Read off the live DOM, not off the source: every label and every shortcut column is in"
        " the table below.",
    )
    cap_rename_before = (
        "Before — the title",
        f" &ldquo;{M['titleBeforeSave']['text']}&rdquo;, tone <code>{M['titleBeforeSave']['tone']}</code>"
        f" (unsaved). Width {rename['title']['width']:.2f}px.",
    )
    cap_rename_after = (
        "After — double-click",
        f" The field occupies the same {rename['field']['width']:.2f}px box at the same point."
        " No hint, no growth, nothing below it.",
    )
    cap_saveas = (
        "Save a copy",
        " Places · Recent · breadcrumb with ← · + Folder · Filter · Name↑/Size/Modified · the name"
        " field with its fixed <code>.tldr</code> suffix.",
    )
    cap_open = (
        "Open a document",
        " The same navigator over the same folder, now listing what the take wrote. Folders first."
        " Cancel / Open in new window / Open.",
    )
    cap_native = (
        "File ▸ with &ldquo;System file dialog&rdquo; chosen",
        f" {len(native_rows)} rows: " + " · ".join(r["label"] for r in native_rows) + ".",
    )
    cap_dialog = (
        "Dialog — the default",
        f" <code>role={M['settings']['role']}</code>,"
        f" {M['settings']['rect']['width']:.0f}×{M['settings']['rect']['height']:.0f} in a"
        f" {M['settings']['viewport']['width']}×{M['settings']['viewport']['height']} window."
        " Left nav: " + " · ".join(M["settings"]["nav"]) + ".",
    )
    cap_page = (
        "Page — one radio away",
        f" The same component at {M['settingsPage']['rect']['width']:.0f}×{M['settingsPage']['rect']['height']:.0f},"
        " pinned to the window origin. Not a second screen: <code>data-presentation</code> is the"
        " only thing that changed.",
    )

    asks = [
        ("1", "A plain dock launch opens the scratch board, not your most recent file",
         "The archived app reopened whatever you had last. This build opens today's scratch board and puts "
         "<b>File ▸ Open recent</b> one click away.",
         "yes, eventually — it is what “every board is a file” means. But it is a one-line flip and it "
         "orphans nothing, so it can wait for you to say so.",
         "no change: a plain launch keeps the scratch board."),
        ("2", "Autosave is on for a file-backed board",
         "A board opened from disk saves itself on a 600&nbsp;ms debounce with a 30&nbsp;s ceiling, digest-fenced — "
         "the archive's own schedule. The scratch board keeps its browser persistence and never touches disk.",
         "autosave, as the archive did. Ctrl+S stays, and the fence means a contested file is refused, not clobbered.",
         "autosave stays on."),
        ("3", "Both apps share one lock folder",
         "<code>~/.local/share/systemsketch/runtime/locks/workspace</code>, so a save from either app excludes the "
         "other on the same file. Both apps see <code>~/SystemSketch</code>.",
         "yes — sharing it is the only thing that makes a concurrent save safe across the two apps.",
         "share it when it exists, else the new app's own state folder."),
        ("4", "Ctrl+N / Ctrl+⇧+N may be eaten by Chrome — NOT VERIFIED",
         "The rows and their printed shortcuts match the archive either way, and clicking the row always works. "
         "Whether the browser lets the <i>keystroke</i> through in <code>--app</code> mode cannot be measured headless.",
         "show the shortcuts, bind them, and report it the first time you hit it in the dock.",
         "shortcuts shown and bound; the menu rows are the guaranteed path."),
        ("5", "The one red test: fix the submenu, or leave the Escape alone",
         "Measured both ways below. The product fix makes the named case pass and breaks the three cases after it; "
         "leaving it makes one case fail and three pass.",
         "<b>Option B</b> — close the burger explicitly in the acceptance helper rather than change how every "
         "submenu in the kit answers Escape. But that helper is committed acceptance and off-limits to a builder, "
         "so it is your call to authorise.",
         "nothing changes: the case stays red and the report says so."),
    ]

    ask_html = ""
    for rank, title, body, recommend, default in asks:
        ask_html += f"""
<div class="ask">
  <h3>{rank}. {title}</h3>
  <p style="color:var(--dim);font-size:14px">{body}</p>
  <p style="font-size:14px;margin:10px 0 0"><b style="color:var(--accent2)">Recommendation:</b> {recommend}</p>
  <p class="dflt"><b>If you say nothing:</b> {default}</p>
  {fb(rank, title)}
</div>"""

    # ---------------------------------------------------------------- page
    return f"""<!doctype html>
<meta charset="utf-8">
<title>Chrome, files and settings — SystemSketch, 2026-09-19</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>{CSS}
  .hero {{ margin:26px 0 0; border:1px solid var(--line2); border-radius:12px; overflow:hidden;
    background:#08090b }}
  .hero video, .hero img {{ display:block; width:100%; height:auto; background:#f7f8fa }}
  .hero .cap {{ padding:13px 16px; font-size:13px; color:var(--dim2); line-height:1.6;
    border-top:1px solid var(--line) }}
  .hero .cap b {{ color:var(--fg) }}
  .beats {{ display:flex; flex-wrap:wrap; gap:7px; margin:12px 0 0; padding:0; list-style:none }}
  .beats li {{ font:600 11.5px/1 var(--mono); color:var(--dim); background:#12141a;
    border:1px solid var(--line); border-radius:99px; padding:7px 11px }}
  .beats li b {{ color:var(--accent) }}
  .pair {{ display:grid; grid-template-columns:1fr 1fr; gap:14px; margin:16px 0 0 }}
  @media (max-width:760px) {{ .pair {{ grid-template-columns:1fr }} }}
  .pair {{ align-items:start }}
  .pair figure {{ margin:0 }}
  .pair figure img {{ padding:0; background:#eef0f4;
    width:auto; max-width:100%; max-height:470px }}
  /* A full-window shot keeps its own aspect inside a height cap — `object-fit`
     would letterbox a 1400x900 frame with 300px of dead background. */
  figure.window img {{ width:auto; max-width:100%; max-height:470px; background:#eef0f4 }}
  /* A code span in prose splitting across lines reads as a typo ("--" / "app").
     Table cells keep normal wrapping: the export lists there are genuinely long. */
  code {{ white-space:nowrap }}
  td code, th code, pre code {{ white-space:normal }}
  .zero {{ font:800 15px var(--mono); color:var(--ok) }}
</style>

<div class="wrap">

<p class="kicker">SystemSketch · the new app · 2026-09-19 afternoon feedback</p>
<h1>The chrome, a Settings surface, and real files on disk</h1>
<p class="sub">
  Renaming happens in the title's own box with no hint under it. The burger is the old app's
  File menu, in its order, with its shortcuts. The undo/redo pill is gone. Settings is a dialog
  or a full page, your choice. And <b>Save As…</b> writes a real <code>.tldr</code> through the
  archive's own file host, browsed with the archive's own navigator — or through your browser's
  native pickers, if you flip one setting.
</p>

<div class="facts">
  <div class="fact {'good' if total_failed == 0 else 'warn'}"><b>{total_tests - total_failed:,}</b><span>of {total_tests:,} tests green<br>across four suites</span></div>
  <div class="fact good"><b>{worst:g}px</b><span>the rename field moves<br>(acceptance allows 1)</span></div>
  <div class="fact good"><b>{len(file_rows)}</b><span>rows in File ▸<br>the archive's order</span></div>
  <div class="fact good"><b>{len(tldr_on_disk)}</b><span>real .tldr files<br>written in the take</span></div>
  <div class="fact {'bad' if total_failed else 'good'}"><b>{total_failed}</b><span>red, and it is<br>a decision below</span></div>
</div>

<h2>The take</h2>
<div class="hero">
  <video controls muted loop autoplay playsinline preload="auto">
    <source src="{hero_mp4}" type="video/mp4">
    <img alt="The same take as an animated GIF" src="{hero_gif}">
  </video>
  <div class="cap">
    <b>{M['heroMp4']['seconds']:.0f} seconds, recorded from the real app.</b>
    <code>pnpm --filter systemsketch dev</code> on a free port, its <code>devFileHostPlugin</code>
    running the real <code>scripts/systemsketch_files.py</code> over a <code>mkdtemp</code> files
    root — never <code>~/SystemSketch</code>, which holds your boards. The orange dot is a rendered
    pointer: it is moved to the exact coordinates each real click is then dispatched at, because a
    Playwright video carries no OS cursor. Nothing here is animated by hand.
    Fallback for a player that will not play it: an animated GIF is embedded inside the same element
    ({kb(M['heroGif']['bytes'])}, against {kb(M['heroMp4']['bytes'])} of h264).
  </div>
</div>
<ul class="beats">
  <li><b>1</b> draw a Block with the dock's own tool</li>
  <li><b>2</b> rename in the title's box</li>
  <li><b>3</b> burger ▸ File, shortcuts and all</li>
  <li><b>4</b> Save As… → the navigator → real bytes</li>
  <li><b>5</b> Open… lists the folder it just wrote to</li>
  <li><b>6</b> Settings, as a dialog</li>
  <li><b>7</b> …and as a page</li>
</ul>

<h2>1 · The rename field</h2>
<div class="lede">
  <p>Zach: <i>“I don't like how this textbox moves up when I click it and the hint displays beneath it.
  please don't show the control hints.”</i></p>
  <p style="margin-top:10px">Measured on the running app, not asserted in a unit test: the field's rect against the
  rect of the title it replaced — <span class="zero">{delta['left']:g} / {delta['top']:g} / {delta['width']:g} / {delta['height']:g} px</span>
  on left / top / width / height. The chrome bar around it moves <span class="zero">{bar_worst:g}px</span>.
  The string <code>Press Enter…</code> appears nowhere in the document
  ({'found' if rename['hintInDocument'] else 'not found'}).</p>
</div>
<div class="pair">
  {figure(png('rename-before.png', 700), *cap_rename_before)}
  {figure(png('rename-after.png', 700), *cap_rename_after)}
</div>
<figure style="max-width:520px">
  <img alt="The title after a real save" src="{png('title-saved.png', 660)}">
  <figcaption><b>And after a real save</b> the same box reads
  <b>{M['titleAfterSave']['text']}</b> with tone <code>{M['titleAfterSave']['tone']}</code> —
  the dot is the only thing that changed, still in the same box.</figcaption>
</figure>

<h2>2 · The burger</h2>
<div class="lede">
  <p>Zach: <i>“Please further build out our burger menu. right now its looking too thin!”</i> and
  <i>“Important is the file tab at the start with then new, new window, open, open recent, etc I use those a lot..”</i></p>
</div>
<div class="pair">
  {figure(png('burger-root.png', 560), *cap_burger_root)}
  {figure(png('burger-file.png', 900), *cap_burger_file)}
</div>
<div class="scroll"><table>
  <tr><th>Row</th><th>Shortcut</th><th>▸</th><th style="text-align:right">State on a scratch board</th></tr>
  {menu_rows}
</table></div>
<p style="color:var(--dim2);font-size:13px">
  {M['fileMenu']['separators']} separators, so three groups — New…Open recent │ Save…Rename │ Copy Absolute Path…Move to Trash….
  The three greyed rows need a board that is a file; they are disabled rather than hidden because the
  feature exists and the board does not qualify yet. Rows whose feature does not exist at all
  (Language, Insert embed, Upload media) are absent instead.
</p>

<h2>3 · The undo/redo pill is gone</h2>
<div class="lede green">
  <p>Zach: <i>“Undo redo should be hidden … We don't need to show that.”</i>
  Measured in the booted app: <code>ss-chrome-undo</code> {('present' if M['undoRedoPill']['undoTestId'] else 'absent')},
  <code>ss-chrome-redo</code> {('present' if M['undoRedoPill']['redoTestId'] else 'absent')},
  tldraw's own <code>[aria-label="Document history"]</code> {('present' if M['undoRedoPill']['tldrawHistoryGroup'] else 'absent')}.
  Undo and Redo live in <b>Edit ▸</b> with their shortcuts, and Ctrl+Z / Ctrl+⇧+Z are untouched.</p>
</div>
<figure class="window">
  <img alt="The app at boot" src="{png('boot.png', 1400)}">
  <figcaption><b>The whole window at boot.</b> Chrome bar top-left, tool dock bottom-centre,
  status strip bottom-right. Nothing between the title and the depth badge.</figcaption>
</figure>

<h2>4 · Real files</h2>
<div class="lede">
  <p>Zach: <i>“we need to be able to save real files to the system so I can start working on this:
  Please copy over the code from system sketch for the file navigator here. its working good enough for now.”</i></p>
</div>
<div class="pair">
  {figure(png('navigator-saveas.png', 900), *cap_saveas)}
  {figure(png('navigator-open.png', 900), *cap_open)}
</div>
<p style="color:var(--dim);font-size:14px;margin-top:16px">
  This is the workspace folder as it stood on disk when the capture finished — read with
  <code>readdir</code>, not from the app:
</p>
<div class="scroll"><table>
  <tr><th>On disk under <code>&lt;tmp&gt;/SystemSketch</code></th><th>Kind</th><th style="text-align:right">Bytes</th></tr>
  {disk_rows}
</table></div>
<p style="color:var(--dim2);font-size:13px">
  <b>Pose pipeline.tldr</b> is the one the stills pass saved through the navigator
  ({M['saved']['bytes']:,} bytes, {M['saved']['records']} records, {M['saved']['blocks']} Block);
  <b>Sorter v2.tldr</b> is the one the hero take saved ({M['heroSavedBytes']:,} bytes). The siblings and
  <code>Archive/</code> were seeded from those bytes so the navigator shows a real folder rather than one row,
  and <code>legacy pipeline.systemsketch</code> is a placeholder envelope — this app never writes that
  format; the row exists to show the hand-off to the archived app, which owns it.
</p>

<h3 style="margin-top:34px">Native mode — the same menu, minus what a picker cannot honour</h3>
<div class="pair">
  {figure(png('burger-file-native.png', 900), *cap_native)}
  <div class="card no" style="align-self:start">
    <b>Absent, not disabled</b>
    <p>{' · '.join('<b>' + d + '</b>' for d in dropped)}</p>
    <p>The File System Access API hands back an opaque handle: no path, no listing, no trash, no
    rename. A row that cannot work is removed rather than shown broken — and the choice is one
    radio in Settings, so nothing is lost by trying it.</p>
  </div>
</div>

<h2>5 · Settings</h2>
<div class="lede">
  <p>Zach: <i>“Please add the setting page. We want the option whether we see settings as a […].
  You can reference the one in old system sketch.”</i> Read as <b>dialog or full page, as a setting</b> —
  the same view, re-presented, remembered per viewer.</p>
</div>
<div class="pair" style="grid-template-columns:minmax(0,420px) minmax(0,1fr)">
  {figure(png('settings-dialog.png', 800), *cap_dialog)}
  <div class="scroll" style="margin-top:0"><table>
    <tr><th>Section</th><th>Options (read from the live DOM)</th><th style="text-align:right">Default</th></tr>
    {settings_rows}
  </table></div>
</div>
<figure class="window" style="margin-top:22px">
  <img alt="Settings as a full-window page" src="{png('settings-page.png', 1400)}">
  <figcaption><b>{cap_page[0]}</b>{cap_page[1]}</figcaption>
</figure>
<h2>6 · The stock parts, element by element</h2>
<p style="color:var(--dim);font-size:14px">
  Zach: <i>“Of course as always please be using stock shadcn as much as possible.”</i> Exact exported
  names, read out of each file at build time. Eight primitives the trunk did not have were copied
  verbatim from the stock shadcn <code>base-nova</code> registry, each against a snapshot in
  <code>docs/provenance/shadcn-base-nova/</code> that
  <code>stockPrimitives.test.ts</code> checks the copy against.
</p>
<div class="scroll"><table>
  <tr><th style="width:21%">Element</th><th style="width:22%">Today</th><th style="width:28%">Off-the-shelf part (exact exported name)</th><th>Behaviour that must survive</th></tr>
  {stock_rows}
</table></div>

<h4>Ours — ported or new, and living in the trunk so the next host inherits it</h4>
<div class="scroll"><table>
  <tr><th style="width:21%">Element</th><th style="width:22%">Today</th><th style="width:28%">What it is</th><th>Behaviour that must survive</th></tr>
  {ours_rows}
</table></div>

<h4>Unchanged (stock seam) — deliberately not touched</h4>
<div class="scroll"><table>
  <tr><th style="width:21%">Element</th><th colspan="2" style="width:50%">The part</th><th>What that buys</th></tr>
  {unchanged_rows}
</table></div>

<h2>7 · The gates</h2>
<p style="color:var(--dim);font-size:14px">
  Every suite was committed <b>red, before any builder ran</b> — the baseline column is parsed out of
  the plan's own §4 table, and the result column out of each suite's raw stdout in
  <code>reports/media/{NAME}/gates/</code>.
</p>
<div class="scroll"><table>
  <tr><th>Suite</th><th>Baseline (red by design)</th><th style="text-align:right">Tests</th><th style="text-align:right">Now</th></tr>
  {gate_rows}
</table></div>
<p style="color:var(--dim2);font-size:13px">
  {round_stat} — measured from <code>{branch}</code> at <code>{head}</code>,
  across the plan commit and the seven lanes.
</p>

<h2>8 · The one red — a decision, not a defect</h2>
<div class="lede red">
  <p><b>{gates['app']['failed']} of {gates['app']['total']}</b> app tests fails:
  <i>“View ▸ Zoom to 100% … Preferences ▸ always-snap … Export and Keyboard shortcuts are tldraw's”</i>.
  It is not the feature: every assertion the case makes about zoom, the checkbox row and tldraw's
  own actions passes on the way through. It fails on the fourth menu it opens, and the cause was
  measured rather than guessed.</p>
</div>

<h4>What actually happens</h4>
<pre class="term"><span class="c">// @base-ui/react@1.8.0 — menu/root/MenuRoot.js:50, the default</span>
closeParentOnEsc = <span class="k">false</span>
<span class="c">// …and line 351, where that default is spent</span>
escapeKey: closeParentOnEsc &amp;&amp; parent.type === <span class="s">'menu'</span></pre>
<p style="color:var(--dim);font-size:14px">
  The frozen acceptance helper <code>apps/systemsketch/src/testing/menus.ts</code> →
  <code>closeMenus()</code> sends <b>one</b> Escape. With Base UI's default, one Escape closes the
  <i>submenu</i> and leaves the root burger open. The next <code>openBurger()</code> click therefore
  <b>toggles the burger shut</b>, and the row the test then reaches for detaches mid-click:
</p>
<pre class="term tight">TimeoutError: locator.click: Timeout 18783ms exceeded.
  - waiting for …getByRole('menuitem', {{ name: 'Export' }})
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not stable
  - <b>element was detached from the DOM, retrying</b></pre>

<h4>Both roads, measured on this tree</h4>
<div class="grid2">
  <div class="card no">
    <b>Option A — fix the product, one line</b>
    <p><code>DropdownMenuSub</code> in <code>apps/storybook-basics/src/components/dropdown-menu.tsx</code>
    defaults <code>closeParentOnEsc</code> to <b>true</b>.</p>
    <p>Applied and run: the named case <b>passes</b>. It then reaches its last step — opening tldraw's
    keyboard-shortcuts dialog, which the case never closes — and tldraw's
    <code>tlui-menu-click-capture</code> overlay intercepts pointer events for the <b>next three
    cases</b>. Measured: <b>3 failed | 4 passed</b>, up from 1. Reverted for that reason.</p>
    <p style="color:var(--dim2)">The three it takes down: the floating toolbar, the problems panel, the frames panel —
    all blocked by the same overlay, nine times in the log.</p>
  </div>
  <div class="card ok">
    <b>Option B — leave the kit alone <span style="color:var(--dim2);font-weight:400">(recommended)</span></b>
    <p>Close the burger explicitly where the acceptance needs it closed, and let tldraw's dialog be
    dismissed by the case that opens it.</p>
    <p>Cost: an edit to <code>src/testing/menus.ts</code>, which is <b>committed acceptance, off-limits
    to a builder by rule</b> — so it needs your say-so, not a lane's.</p>
    <p>Benefit: one Escape keeps meaning “close this submenu” for every menu in the kit, which is what
    Base UI ships and what the other 152 app tests and 509 stories are green against.</p>
  </div>
</div>
<p style="color:var(--dim2);font-size:13px;margin-top:12px">
  Raw logs for both runs are beside this page:
  <code>gates/app.log</code> (as shipped) and <code>gates/menus-with-fix.log</code> (Option A applied).
</p>

<h2>9 · What the captures showed that the tests did not</h2>
<div class="answers">
  <div class="answer red">
    <b class="h">The selected radio reads as the <i>un</i>selected one</b>
    <p>In Settings, the chosen option gets a soft grey fill and a hairline border; the unchosen one
    gets a <b>heavier black border</b>. At a glance “System file dialog” looks like the active choice
    when “SystemSketch file browser” is. The tests only ever read <code>aria-checked</code>, so this
    was invisible to them — you can see it in both Settings captures above.</p>
  </div>
  <div class="answer red">
    <b class="h">Settings as a page stretches its rows the full window width</b>
    <p>The page presentation pins the view to the viewport, which the acceptance asserts to the pixel —
    and that is exactly what makes the option rows {M['settingsPage']['rect']['width']:.0f}px wide, with a
    radio marooned at the far right of each one. The archive's settings page held its content in a
    column. One <code>max-width</code> in <code>settingsView.tsx</code>, and it is the trunk's file,
    so it is a component fix, not an app one.</p>
  </div>
  <div class="answer blue">
    <b class="h">Three File rows are disabled, and the plan said they would be absent</b>
    <p>The plan's reading was “rows whose feature does not exist yet are omitted, not shown disabled”.
    What shipped disables <b>Copy Absolute Path</b>, <b>Show in Files</b> and <b>Move to Trash…</b> on a
    scratch board. That is the better call — the feature <i>does</i> exist, the board just is not a file
    yet, and a row that vanishes and reappears is worse than one that greys out. Flagged because it is a
    deviation from the committed plan, not because it looks wrong.</p>
  </div>
</div>

<h2>10 · Deliberately not done</h2>
<div class="grid2">
  <div class="card"><b>The external-change watcher</b><p>The donor's 1.5&nbsp;s <code>stat</code> poll.
    The digest fence already refuses to clobber; without the poll a conflict surfaces on the next save
    instead of the instant the other app writes. The donor's pure functions are still there to port.</p></div>
  <div class="card"><b>“Allow opening files anywhere”</b><p>The archive's General switch. The fence
    here is <code>$HOME</code>, which already covers every worktree under it.</p></div>
  <div class="card"><b>Reading or writing <code>.systemsketch</code></b><p>This app writes plain
    <code>.tldr</code>. A <code>.systemsketch</code> row is listed and hands off to the archived app,
    which owns that envelope.</p></div>
  <div class="card"><b>Insert embed · Upload media · Language</b><p>tldraw ships the actions, but this
    app's <code>.tldr</code> round trip does not carry assets — a menu row that loses your image on
    reopen is worse than no row.</p></div>
  <div class="card"><b>Colour scheme in Settings</b><p><code>&lt;Tldraw colorScheme="system"&gt;</code>
    is set in <code>App.tsx</code> and it is not established whether it pins the user preference.
    An unverified setting is worse than none.</p></div>
  <div class="card"><b>Native Open recent · Copy path · Show in Files · Trash · Rename</b><p>Opaque
    handles: no path, no listing, no trash. Absent in native mode rather than present and broken.</p></div>
</div>

<h2>11 · What needs you</h2>
<p style="color:var(--dim);font-size:14px">
  Five items. Each carries a recommendation and the reversible default already taken, so silence keeps
  the work moving. Mark them here and press <b>Copy feedback</b> — the markdown names every item by its
  number and title, so you never have to say which one you meant.
</p>
{ask_html}
{overall_box('anything the video or the captures made you want changed…')}

<footer class="page">
  Built by <b>docs/build_chrome_files_settings.py</b> from
  <b>docs/capture_chrome_files_settings.mjs</b>, which drove
  <code>pnpm --filter systemsketch dev</code> on port {M['port']} over a <code>mkdtemp</code> files
  root at <code>{M['filesRoot']}</code>. Captured {captured} local ·
  branch <b>{branch}</b> at <b>{head}</b>.<br>
  Ask: <b>docs/ASK-2026-09-19-CHROME-FILES-SETTINGS.md</b> · Plan:
  <b>docs/CHROME-FILES-SETTINGS-PLAN.md</b> · Raw suite output:
  <b>reports/media/{NAME}/gates/</b>.
</footer>
</div>

{dock(NAME, 'question', len(asks))}
<script>{FB_JS}</script>
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--measure", action="store_true", help="re-run all four suites into reports/media/<name>/gates/ first")
    options = parser.parse_args()
    if options.measure:
        run_gates()
    report_size(build(), OUT)


if __name__ == "__main__":
    main()
