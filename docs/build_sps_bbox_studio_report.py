#!/usr/bin/env python3
"""Build the review report: bbox studio on the shared Stable/Preview switcher (2026-09-29).

Zach, 2026-09-29: "Please start subagent to use this package: stable-preview-switcher
and delete the old thing we had to do the stable/preview, etc. I expect to see the
component floating in the bottom right corner... above the bottom right menu".

Media lives in the gitignored reports/media/ of the MAIN checkout, recorded from the
real running stack in a scratch clone (scratch HOME, ports off every live one,
SPS_NO_WINDOW=1, headless Chromium 1400x900):

  sps-bbox-studio-hero.mp4 / .gif / -hero-marks.json   the primary flow
  sps-bbox-studio-1400x900.png, -1280x720.png          placement, Stable page

The commit lists are read from git at build time, so a rebuild cannot keep a stale
one. Everything is inlined, and the page must stay under the Claude desktop
preview's ceiling (measured as encodeURIComponent of the whole page), so the build
fails loudly instead of writing a page that will not open there.

    python3 docs/build_sps_bbox_studio_report.py
"""
from __future__ import annotations

import base64
import html
import json
import pathlib
import subprocess
import tempfile
import urllib.parse

TREE = pathlib.Path(__file__).resolve().parents[1]
MAIN = pathlib.Path("/home/bam/bbox-ui")
MEDIA = MAIN / "reports/media"
OUT = MEDIA / "sps-bbox-studio-2026-09-29.html"
SPS_REPO = pathlib.Path("/home/bam/stable_preview_switcher")
SPS_BRANCH = "claude/monorepo-snapshot-bbox"
LANE_BRANCH = "claude/subagent-bbox-studio-rename-bb4cdd"
LANE_BASE = "7cdabba"  # local main + the rename commit this lane started from
ENCODED_CEILING = 1_900_000  # the desktop preview's data: URL cap is 2,097,024; keep headroom

APP = "/home/bam/bbox-ui/apps/systemsketch"


def data_uri(name: str, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode((MEDIA / name).read_bytes()).decode()


def frame_uri(source: pathlib.Path, ffmpeg_args: list[str], suffix: str = ".png") -> str:
    """One still made by ffmpeg from a real capture (a crop, a video frame), inlined."""
    with tempfile.TemporaryDirectory() as scratch:
        target = pathlib.Path(scratch) / f"still{suffix}"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(source), *ffmpeg_args, str(target)], check=True)
        mime = "image/jpeg" if suffix == ".jpg" else "image/png"
        return f"data:{mime};base64," + base64.b64encode(target.read_bytes()).decode()


def git_log(repo: pathlib.Path, revision_range: str) -> list[tuple[str, str]]:
    done = subprocess.run(["git", "-C", str(repo), "log", "--format=%h%x09%s", revision_range],
                          capture_output=True, text=True, check=True)
    return [tuple(line.split("\t", 1)) for line in done.stdout.splitlines() if line]


e = html.escape
marks = {mark["name"]: mark for mark in json.loads((MEDIA / "sps-bbox-studio-hero-marks.json").read_text())}
video = data_uri("sps-bbox-studio-hero.mp4", "video/mp4")
gif = data_uri("sps-bbox-studio-hero.gif", "image/gif")
shot_large = data_uri("sps-bbox-studio-1400x900.png", "image/png")
shot_small = data_uri("sps-bbox-studio-1280x720.png", "image/png")
# WHY 1:1 crops of the corner beside the full frames: at half the page width the 11 px chip is
# unreadable, and the claim is about exactly that corner.
corner_large = frame_uri(MEDIA / "sps-bbox-studio-1400x900.png", ["-vf", "crop=620:190:780:710"])
corner_small = frame_uri(MEDIA / "sps-bbox-studio-1280x720.png", ["-vf", "crop=620:190:660:530"])
# A poster, so the first paint is a real frame even before the video decodes.
poster = frame_uri(MEDIA / "sps-bbox-studio-hero.mp4", ["-ss", "2.0", "-frames:v", "1", "-q:v", "5"], ".jpg")
duration = subprocess.run(
    ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(MEDIA / "sps-bbox-studio-hero.mp4")],
    capture_output=True, text=True, check=True,
).stdout.strip()
sps_commits = git_log(SPS_REPO, f"main..{SPS_BRANCH}")
lane_commits = git_log(TREE, f"{LANE_BASE}..{LANE_BRANCH}")

# Measured with getBoundingClientRect in headless Chromium on the Stable page (chip inside its
# shadow root, the menu = [data-slot="status-strip"]); the same numbers held on Preview and the dev lane.
PLACEMENT = [
    ("1400×900", (996.2, 808, 1384, 834), (993.3, 842, 1288, 892), shot_large, corner_large),
    ("1280×720", (876.2, 588, 1264, 614), (977.3, 622, 1272, 672), shot_small, corner_small),
]

TITLES = [
    ("Zach's dock today (old launcher, :4341, build pinned 2026-09-21)", "SystemSketch", "measured: the page's <title>"),
    ("main's index.html before this lane (5089a0b)", "bbox-ui", "git show 7cdabba^"),
    ("after — the page's own <title> (7cdabba)", "bbox studio", "apps/systemsketch/index.html"),
    ("after — Stable window (the chip keeps a channel prefix)", "Stable · bbox studio", "document.title, measured"),
    ("after — Preview window", "Preview · bbox studio", "document.title, measured"),
    ("after — an agent's sps dev lane", "Dev · bbox studio", "document.title, measured"),
]

STOCK = [
    ("Stable build", "launch_systemsketch.py build_stable, --update", "sps promote + snapshot.include / snapshot.link",
     "pinned build of main; a trunk, lockfile or tsconfig change reads “behind”", "replaced — a dirty tree is now built and recorded, not refused"),
    ("Stable server :4341", "StableHandler / serve()", "sps serve-stable, stable.port 4341", "loopback only; index.html never cached", "replaced"),
    ("File host on Stable", "WorkspaceApi + RecordingApi mounted in-process",
     "stable.processes[files] :4342 + stable.proxy {to, rewriteOrigin}", "same-origin save into the real home; foreign pages refused",
     "replaced — saves 200 from the Stable page, 403 from a foreign Origin"),
    ("Files/lock root override", "launcher honoured SYSTEMSKETCH_FILES_ROOT", "serve --files-root-from-env (app backend, not channel code)",
     "an isolated run never writes the real home; Stable and Preview lock in ONE folder", "kept — relative values now refused loudly on both sides"),
    ("/api/health on Stable", "health_document()", "—", "☰ site rows' “differs from this board”", "dropped — the chip carries Stable's commit and relation"),
    ("--status / --stop", "launcher", "sps status / sps stop", "—", "replaced"),
    ("Window open / raise / focus", "launcher (CDP, xdotool, shared profile)", "sps open (xdotool focus, --class=bbox-ui)", "one dock icon, one window", "replaced"),
    ("Chrome singleton recovery, visible-window check", "launcher", "—", "a dock press never opens nothing", "dropped here — owed to the shared runtime (Codex P1 #5)"),
    ("Dock entry", "assets/bbox-ui.desktop", "sps install-desktop", "3 actions: Open Preview (live — what agents are changing), Make Preview Stable, Roll Stable Back",
     "replaced at integration; the two docs-site actions go"),
    ("Dock icon refresh", "refresh_dock_icon() on every press", "none (config sets no icon)", "the fitted, outlined bbox-ui tile", "manual now: python3 scripts/dock_icon.py"),
    ("Preview :4340", "pnpm dev", "the runtime's Vite adapter, preview.port 4340", "hot reload with the app's own vite.config", "replaced"),
    ("The chip", "none", "the chip the runtime injects; chip.avoid = [data-slot=\"status-strip\"]", "floats bottom-right, above the menu, covers no control", "new"),
    ("Agent launch", "--headless on a private Xvfb", "SPS_NO_WINDOW=1 sps --root … dev + headless Chrome", "never on Zach's screen", "replaced"),
    ("Old SystemSketch up on :4321", "legacy(\"--no-open\")", "—", "☰ “Switch to old SystemSketch”", "dropped — works while systemsketch.desktop has it up"),
    ("Storybook up on :5421", "ensure_storybook()", "—", "☰ “Open Storybook”", "dropped — the row is disabled while :5421 is down"),
    ("Shared Chrome profile with the old app", "PROFILE = LEGACY_PROFILE", "—", "old origin's storage after the switch row", "dropped"),
    ("Recording header", "channel stable, build <commit>", "files CLI says dev/dev", "recording metadata", "dropped (cosmetic)"),
    ("<file> argument", "launcher routing .bbox/.tldr", "—", "no live caller (no MimeType)", "dropped — ?board=/abs/path still opens a board"),
    ("unchanged (stock seam)", "vite.config.ts, devFileHost.ts proxy, statusEndpoint.ts, dock_icon.py, the docs-site and Storybook channel code",
     "—", "the app runs from its own config", "untouched; docs site / Storybook wait on non-Vite adapters"),
]

ROUNDS = [
    ("1", "P1 ×4: duplicate Origin headers became trusted; an included symlink could keep Stable on live bytes; a checkout edit during the build entered the release; Stable ignored SYSTEMSKETCH_FILES_ROOT. Plus dock hardening (Chrome singleton).",
     "rewriteOrigin refuses duplicate Host/Origin (400) and matches byte-exactly; included symlinks checked; the checkout is re-read after the build; serve --files-root-from-env. Dock hardening deferred to the shared runtime."),
    ("2", "Symlink chains: an absolute or excluded intermediate hop passed; empty/relative lock roots split Stable from Preview.",
     "Every hop is walked inside the mirror; empty = unset, relative resolved against one app dir; trailing-whitespace Origin tests."),
    ("3", "A dev lane still split from Stable on a relative lock root; the walker accepted data.py/../x (ENOTDIR).",
     "Relative overrides refused on both sides; --app-dir removed; every traversed component must be a directory."),
    ("4", "Node's lexical .. vs Python following the symlink put the two channels in two folders; a lone relative lock root was silently accepted.",
     "devFileHost.ts only validates and passes strings unchanged — Python is the one resolver; both variables validated before precedence."),
    ("5", "No P0/P1 from this work. (A default lock root diverging when HOME itself holds symlink + .. exists on main already — filed separately.)", "—"),
]

INTEGRATION = [
    ("Merge the runtime branch (from the sps main checkout, on main)", f"git -C {SPS_REPO} merge --no-ff {SPS_BRANCH}"),
    ("Refresh the runtime every dock entry uses — the installed one rejects snapshot.include", f"python3 {SPS_REPO}/python/sps.py install"),
    ("Stop the old launcher's Stable on :4341 BEFORE the merge deletes it", "python3 /home/bam/bbox-ui/scripts/launch_systemsketch.py --stop"),
    ("Merge this lane (the integration session does it via claude/finish-2026-09-29)", "git -C /home/bam/bbox-ui merge --no-ff claude/finish-2026-09-29"),
    ("Check", f"sps --root {APP} doctor"),
    ("First Stable", f"sps --root {APP} promote"),
    ("Dock entry — replaces ~/.local/share/applications/bbox-ui.desktop", f"sps --root {APP} install-desktop"),
    ("Re-fit the icon the entry names", "python3 /home/bam/bbox-ui/scripts/dock_icon.py"),
    ("Open it", f"sps --root {APP} open"),
]

QUESTIONS = [
    ("Stable's recordings say channel/build “dev”.", "Leave it; add --channel/--build to the files CLI only if the header matters to you."),
    ("☰ “Switch to old SystemSketch” and “Open Storybook” need their servers already up.", "Leave them; each fails visibly (Storybook's row greys out)."),
    ("No /api/health on Stable, so the ☰ site rows can't flag a version mismatch there.", "Accept; the chip in the corner shows Stable's commit and relation."),
    ("The dock loses “Open bbox-ui.com (deployed)” and “Open the site's local Preview (HMR)”.", "Accept; ☰ “Open bbox-ui.com” remains."),
    ("Chrome singleton recovery / visible-window confirmation on a dock press.", "Tracked in the shared runtime (Codex P1 #5), not this app."),
    ("Old pinned builds under ~/.local/share/systemsketch-next are orphaned after integration.", "Leave them until you delete them."),
    ("The docs site and Storybook still use the old bbox_launch_common channels.", "Leave; they need non-Vite adapters in the runtime first."),
]


def rect(values: tuple[float, float, float, float]) -> str:
    left, top, right, bottom = values
    return f"left {left:g} · top {top:g} · right {right:g} · bottom {bottom:g}"


placement_rows = "".join(
    f"<tr><td>{e(size)}</td><td>{rect(chip)}</td><td>{rect(menu)}</td>"
    f"<td><b>{menu[1] - chip[3]:g} px</b></td><td>{int(size.split('×')[0]) - chip[2]:g} px</td><td>none</td></tr>"
    for size, chip, menu, _, _ in PLACEMENT
)
placement_shots = "".join(
    f'<figure><img src="{corner}" alt="The bottom-right corner at {e(size)}, 1:1: the chip above the menu">'
    f'<figcaption>{e(size)} — the bottom-right corner at 1:1</figcaption>'
    f'<img class="thumb" src="{uri}" alt="The whole Stable page at {e(size)}"><figcaption>the whole page</figcaption></figure>'
    for size, _, _, uri, corner in PLACEMENT
)
title_rows = "".join(f"<tr><td>{e(where)}</td><td><code>{e(title)}</code></td><td>{e(source)}</td></tr>" for where, title, source in TITLES)
stock_rows = "".join(
    f"<tr{' class=seam' if element.startswith('unchanged') else ''}>" + "".join(f"<td>{e(cell)}</td>" for cell in row) + "</tr>"
    for row in STOCK for element in [row[0]]
)
round_rows = "".join(f"<tr><td>{e(n)}</td><td>{e(found)}</td><td>{e(changed)}</td></tr>" for n, found, changed in ROUNDS)
integration_items = "".join(f"<li>{e(why)}<pre><code>{e(command)}</code></pre></li>" for why, command in INTEGRATION)
question_items = "".join(f"<li><b>{e(question)}</b><br>Default: {e(default)}</li>" for question, default in QUESTIONS)
commit_list = lambda commits: "".join(f"<li><code>{e(sha)}</code> {e(subject)}</li>" for sha, subject in commits)  # noqa: E731
steps = [
    ("Stable, pinned build", marks["stable-behind"]["chip"]),
    ("Preview after Open Preview (same window)", marks["preview"]["chip"]),
    ("After Make Stable", marks["match"]["chip"]),
    ("Stable after Roll back", marks["rolled-back"]["chip"]),
]
BUTTONS = ("Open Preview", "Make Stable", "Stable updated", "Reload")


def chip_text(text: str) -> str:
    """textContent runs the button into the last part; show it as the button it is."""
    for label in BUTTONS:
        if text.endswith(label):
            return f"<code>{e(text[: -len(label)].replace('·', ' · '))}</code> <span class=button>{e(label)}</span>"
    return f"<code>{e(text)}</code>"


step_rows = "".join(f"<tr><td>{e(label)}</td><td>{chip_text(chip)}</td></tr>" for label, chip in steps)

page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>bbox studio · Stable/Preview</title>
<style>
:root {{ --bg:#fbfbfa; --fg:#1d1f23; --muted:#5c6470; --line:#e2e4e8; --card:#fff; --accent:#2b6cff; --ok:#1a7f4b; --warn:#9a5b00; --code:#f2f3f5; }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --bg:#15171a; --fg:#e7e9ec; --muted:#a2a9b3; --line:#2c3036; --card:#1c1f23; --accent:#6d9bff; --ok:#4cc38a; --warn:#e0a84a; --code:#23272d; }} }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--bg); color:var(--fg); font:15px/1.55 system-ui,-apple-system,"Segoe UI",Ubuntu,sans-serif; }}
main {{ max-width:1080px; margin:0 auto; padding:28px 16px 64px; }}
h1 {{ font-size:22px; margin:0 0 6px; }} h2 {{ font-size:17px; margin:34px 0 10px; border-top:1px solid var(--line); padding-top:22px; }}
.verdict {{ background:var(--card); border:1px solid var(--line); border-left:4px solid var(--ok); padding:14px 16px; border-radius:8px; }}
.verdict b {{ font-size:17px; }} .qual {{ color:var(--warn); margin-top:6px; }}
video, figure img {{ width:100%; height:auto; border:1px solid var(--line); border-radius:8px; background:#fff; display:block; }}
figure {{ margin:0; }} figcaption, .small {{ color:var(--muted); font-size:13px; margin-top:4px; }}
.two {{ display:grid; grid-template-columns:1fr 1fr; gap:14px; }} @media (max-width:760px) {{ .two {{ grid-template-columns:1fr; }} }}
table {{ width:100%; border-collapse:collapse; font-size:13.5px; background:var(--card); }} th, td {{ text-align:left; vertical-align:top; padding:7px 9px; border-bottom:1px solid var(--line); }}
th {{ color:var(--muted); font-weight:600; }} tr.seam td {{ background:var(--code); font-style:italic; }}
.scroll {{ overflow-x:auto; border:1px solid var(--line); border-radius:8px; }}
code {{ background:var(--code); padding:1px 5px; border-radius:4px; font:12.5px ui-monospace,SFMono-Regular,Menlo,monospace; }}
pre {{ background:var(--code); padding:8px 10px; border-radius:6px; overflow-x:auto; margin:6px 0 10px; }} pre code {{ padding:0; background:none; }}
ol li, ul li {{ margin-bottom:6px; }}
img.thumb {{ margin-top:10px; }}
.button {{ background:var(--accent); color:#fff; border-radius:4px; padding:1px 6px; font-size:12px; white-space:nowrap; }}
</style>
</head>
<body><main>
<h1>bbox studio on the shared Stable/Preview switcher</h1>
<div class="verdict">
<b>bbox studio runs on the shared Stable/Preview switcher; the chip floats bottom-right above the menu.</b>
<div class="qual">NOT live in your dock yet: it needs the sps branch merged and <code>sps install</code> first, then this lane's merge, <code>sps promote</code> and <code>sps install-desktop</code> (steps below). Today's dock still runs the old launcher and says “SystemSketch”.</div>
</div>

<h2>The primary flow — recorded from the real running stack</h2>
<video controls autoplay muted loop playsinline poster="{poster}" src="{video}"><img src="{gif}" alt="Stable → Open Preview → Make Stable → Roll back, as a GIF"></video>
<p class="small">{float(duration):.1f} s, muted, looping. Scratch clone, scratch HOME, ports 4460/4461/4462, headless Chromium 1400×900, cropped to the bottom-right 900×580. Only the waits are sped up (labelled 2× / 8×; the real Make Stable build took {marks['match']['t'] - marks['press-make-stable']['t']:.0f} s). The chip text read at each step:</p>
<div class="scroll"><table><tr><th>step</th><th>chip, as read from its shadow root</th></tr>{step_rows}</table></div>

<h2>Placement — measured, not eyeballed</h2>
<div class="two">{placement_shots}</div>
<div class="scroll" style="margin-top:12px"><table>
<tr><th>viewport</th><th>chip rect</th><th>menu rect ([data-slot="status-strip"])</th><th>gap above menu</th><th>right inset</th><th>app controls under the chip</th></tr>
{placement_rows}</table></div>
<p class="small">getBoundingClientRect of the chip inside its shadow root and of the menu; the elementFromPoint sweep over the chip's rect found no app control and no app text. Captured on the first adoption run (Stable at 51d968c); the same numbers held on Preview and on an sps dev lane, and on every later run of the journey.</p>

<h2>The rename — the window title</h2>
<div class="scroll"><table><tr><th>where</th><th>title</th><th>source</th></tr>{title_rows}</table></div>

<h2>Stock parts — element by element</h2>
<div class="scroll"><table><tr><th>element</th><th>today (old)</th><th>shared part (exact name)</th><th>behaviour that must survive</th><th>fate</th></tr>{stock_rows}</table></div>

<h2>The judge loop — 5 Codex rounds (gpt-6-astra, read-only)</h2>
<div class="scroll"><table><tr><th>round</th><th>found</th><th>changed</th></tr>{round_rows}</table></div>

<h2>Integration — in this order</h2>
<ol>{integration_items}</ol>

<h2>Open questions — each with the default taken if you say nothing</h2>
<ul>{question_items}</ul>

<h2>Commits</h2>
<p class="small">stable_preview_switcher <code>{e(SPS_BRANCH)}</code> (contract first, then runtime, then tests — 311 tests pass):</p>
<ul>{commit_list(sps_commits)}</ul>
<p class="small">bbox-ui <code>{e(LANE_BRANCH)}</code> on top of <code>{LANE_BASE}</code> (scripts/tests 183 pass; the app's vitest suite shows only its 10 pre-existing failures):</p>
<ul>{commit_list(lane_commits)}</ul>
</main></body></html>
"""

encoded = len(urllib.parse.quote(page, safe="-_.!~*'()"))
if encoded > ENCODED_CEILING:
    raise SystemExit(f"refusing to write: {encoded:,} encoded bytes > {ENCODED_CEILING:,} (the desktop preview could not open it)")
OUT.write_text(page, encoding="utf-8")
print(f"wrote {OUT}: {OUT.stat().st_size:,} bytes on disk, {encoded:,} encoded; video {float(duration):.1f} s")
