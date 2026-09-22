#!/usr/bin/env python3
"""Build the dock-icon report: why the SystemSketch dock icon never updated, and the fix.

Zach, 2026-09-22: "many agents in the past have tried to update this icon but
it still seems to be using a cached version? this is for system sketch btw.."

Captures live in reports/media/dock-icon-2026-09-22/ (staged by the session
that made the fix: real grabs of his dock, and each historical icon revision
pulled from /home/bam/systemsketch's git objects). Every claim that can go
stale — the GTK lookup, the --check verdict, the test count — is re-measured
at build time, so a rebuild cannot keep a false one.

Inlines its images, so the page lives in the gitignored reports/media/ half.

    python3 docs/build_dock_icon_report.py
"""
from __future__ import annotations

import base64
import html
import pathlib
import shutil
import subprocess
import sys
import tempfile

TREE = pathlib.Path(__file__).resolve().parents[1]
MAIN = pathlib.Path("/home/bam/bbox-ui")
MEDIA = MAIN / "reports/media/dock-icon-2026-09-22"
OUT = MAIN / "reports/media/dock-icon-2026-09-22.html"
MARK = TREE / "apps/docs/public/bbox-studio-mark.svg"


def uri(name: str) -> str:
    path = MEDIA / name
    kind = "svg+xml" if path.suffix == ".svg" else "png"
    return f"data:image/{kind};base64," + base64.b64encode(path.read_bytes()).decode()


def run(*cmd: str) -> tuple[int, str]:
    done = subprocess.run(cmd, cwd=TREE, capture_output=True, text=True)
    return done.returncode, (done.stdout + done.stderr).strip()


check_code, check_out = run(sys.executable, "scripts/dock_icon.py", "--check")
_, lookup = run(
    sys.executable, "-c",
    "import sys; sys.path.insert(0,'scripts'); import dock_icon as d; [print(n, '->', d.resolves_to(n, 48)) for n in ('systemsketch', 'bbox-ui', 'pyblocks')]",
)
test_code, test_out = run(sys.executable, "-m", "pytest", "scripts/tests/test_dock_icon.py", "-q")
suite_code, suite_out = run(sys.executable, "-m", "pytest", "scripts/tests", "-q")
test_line, suite_line = test_out.splitlines()[-1], suite_out.splitlines()[-1]
mark_uri = "data:image/svg+xml;base64," + base64.b64encode(MARK.read_bytes()).decode()
after = MEDIA / "dock-after-zoom.png"
after_html = (
    f'<img src="{uri(after.name)}" alt="Dock after: the lit slot shows the bbox studio mark">'
    if after.exists()
    else '<div class="pending">NOT YET CAPTURED — the dock was auto-hidden behind a window when this was built. '
    "The GTK lookup below is the proof until a live grab lands.</div>"
)

BACKUP = pathlib.Path.home() / ".local/share/pyblocks/desktop-backup-2026-09-22/before-resize"
INSTALLED = pathlib.Path.home() / ".local/share/icons/hicolor"


def painted(png: pathlib.Path) -> tuple[float, float]:
    """(width, height) of the alpha >= 128 bounds, as fractions of the canvas — measured, not recalled."""
    from PIL import Image

    image = Image.open(png).convert("RGBA")
    left, top, right, bottom = image.getchannel("A").point(lambda v: 255 if v >= 128 else 0).getbbox()
    return (right - left) / image.width, (bottom - top) / image.height


reference = {name: painted(path) for name, path in (("Claude", pathlib.Path("/usr/share/icons/hicolor/256x256/apps/claude-desktop.png")), ("Codex", pathlib.Path("/usr/share/pixmaps/chatgpt.png")))}
size_rows = "".join(
    f"<tr><td>{name}</td><td>—</td><td>{w:.3f} × {h:.3f}</td></tr>" for name, (w, h) in reference.items()
) + "".join(
    "<tr><td>{0}</td><td>{1[0]:.3f} × {1[1]:.3f}</td><td>{2[0]:.3f} × {2[1]:.3f}</td></tr>".format(
        name, painted(BACKUP / "512x512/apps" / f"{name}.png"), painted(INSTALLED / "512x512/apps" / f"{name}.png"))
    for name in ("pyblocks", "systemsketch", "bbox-ui")
)

resized = MEDIA / "dock-resized-zoom.png"
resized_html = (
    f'<img src="{uri(resized.name)}" alt="Dock after the resize">'
    if resized.exists()
    else '<div class="pending">NOT YET CAPTURED — the dock was auto-hidden when this was built. '
    "The rendered comparison above is from the installed files.</div>"
)

REVISIONS = [
    ("rev0-2026-08-30.png", "08-30", "the original raster", "what the dock showed", True),
    ("rev1-2026-09-06a.png", "09-06 05:45", "Refine SystemSketch application icon", "branch only", False),
    ("rev2-2026-09-06b.png", "09-06 16:02", "Adopt selected design", "branch only", False),
    ("rev3-2026-09-06c.png", "09-06 16:45", "Use supplied SVG as master", "branch only", False),
    (None, "09-21 17:39", "bbox studio mark (Frame 7)", "site only", False),
]
lineage = "".join(
    f'<figure class="rev{" live" if live else ""}"><img src="{uri(name) if name else mark_uri}" alt="">'
    f"<figcaption><b>{when}</b><br>{html.escape(what)}<br><span class=\"where\">{where}</span></figcaption></figure>"
    for name, when, what, where, live in REVISIONS
)

# (file, exact text, replacement, what it breaks). Re-applied to a scratch
# copy of the tree on every build — a "caught" below is measured, not recalled.
MUTATIONS = [
    ("dock_icon.py", "    os.utime(root)\n", "", "Drop the hicolor/ mtime bump", "the shell would keep the old texture until logout"),
    ("dock_icon.py", "        (root / path).unlink(missing_ok=True)", "        pass", "Keep stray size variants", "a leftover 1024px raster would outrank the mark at that size"),
    ("dock_icon.py", "or (root / path).read_bytes() != content]", "]", "Staleness by existence only", "the archived installer's raster would read as current"),
    ("launch_systemsketch.py", "            refresh_dock_icon()\n            open_window(url)", "            open_window(url)", "Launcher skips the sync on --open", "the dock would lag the site again"),
    ("launch_systemsketch.py", "    except Exception as cause:  # noqa: BLE001 — see WHY above", "    except OSError as cause:", "Let a sync error escape the launcher", "a broken icon could stop the window opening"),
    ("dock_icon.py", "    return svg[: tag.start()] + root + svg[tag.end() :]", "    return svg[: tag.start()] + root + svg[tag.end() : -8] + b'</svg>'", "fit() touches the artwork, not just the frame", "a resize that quietly edits Zach's drawing"),
    ("dock_icon.py", "TARGET = (0.098, 0.902)", "TARGET = (0.115, 0.885)", "Keep the old, smaller frame", "the icons stay smaller than Claude/Codex"),
    ("dock_icon.py", "centre_y - side / 2:.2f}", "top:.2f}", "Fit without re-centring vertically", "the studio mark keeps sitting high"),
    ("dock_icon.py", "    if not is_fitted(svg):\n        svg = fit(svg)\n", "    svg = fit(svg)\n", "Re-fit an already-fitted pyblocks icon", "every run rewrites it by a rounding hair"),
    ("dock_icon.py", "    return fit(outline(svg))", "    return fit(svg)", "Drop the hairline", "the dark square vanishes on the dark dock again"),
    ("dock_icon.py", 'x="{x + half:g}" y="{y + half:g}" width="{width - OUTLINE_WIDTH:g}" \'\n        f\'height="{height - OUTLINE_WIDTH:g}"', 'x="{x:g}" y="{y:g}" width="{width:g}" \'\n        f\'height="{height:g}"', "Outline straddles the edge instead of sitting inside", "a faint halo grows the icon past the Claude/Codex box"),
]


def mutant_verdict(file: str, old: str, new: str) -> str:
    with tempfile.TemporaryDirectory() as scratch:
        root = pathlib.Path(scratch)
        shutil.copytree(TREE / "scripts", root / "scripts", ignore=shutil.ignore_patterns("__pycache__"))
        (root / MARK.relative_to(TREE)).parent.mkdir(parents=True)
        shutil.copy(MARK, root / MARK.relative_to(TREE))
        target = root / "scripts" / file
        source = target.read_text()
        if old not in source:
            return "STALE MUTATION"
        target.write_text(source.replace(old, new, 1))
        done = subprocess.run([sys.executable, "-m", "pytest", "-q", "scripts/tests/test_dock_icon.py"], cwd=root, capture_output=True)
        return "caught" if done.returncode else "SURVIVED"


verdicts = [(label, mutant_verdict(file, old, new), why) for file, old, new, label, why in MUTATIONS]
mutation_rows = "".join(f"<tr><td>{a}</td><td class=\"{'ok' if b == 'caught' else 'bad'}\">{b}</td><td>{c}</td></tr>" for a, b, c in verdicts)

SEAM_SVG = """
<svg viewBox="0 0 880 330" role="img" aria-label="How GNOME picks the dock icon for the whiteboard window">
  <defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" class="ink"/></marker></defs>
  <g class="box"><rect x="10" y="120" width="170" height="74" rx="8"/>
    <text x="95" y="148">Chrome app window</text><text x="95" y="170" class="mono">WM_CLASS systemsketch</text></g>
  <g class="box dim"><rect x="260" y="30" width="220" height="74" rx="8"/>
    <text x="370" y="58">bbox-ui.desktop</text><text x="370" y="80" class="mono">StartupWMClass=systemsketch</text></g>
  <g class="box hot"><rect x="260" y="210" width="220" height="74" rx="8"/>
    <text x="370" y="238">systemsketch.desktop</text><text x="370" y="260" class="mono">ID == class → wins</text></g>
  <path d="M180,150 C220,150 220,70 258,70" class="edge dashed" marker-end="url(#ah)"/>
  <path d="M180,165 C220,165 220,245 258,245" class="edge" marker-end="url(#ah)"/>
  <text x="305" y="124" class="note">loses the tie</text>
  <text x="200" y="300" class="note">shell-app-system.c:142-144</text>
  <g class="box hot"><rect x="540" y="210" width="150" height="74" rx="8"/>
    <text x="615" y="238">Icon=systemsketch</text><text x="615" y="260" class="mono">hicolor/*/apps/</text></g>
  <path d="M480,247 L538,247" class="edge" marker-end="url(#ah)"/>
  <g class="box new"><rect x="540" y="30" width="300" height="74" rx="8"/>
    <text x="690" y="58">scripts/dock_icon.py</text><text x="690" y="80" class="mono">renders bbox-studio-mark.svg</text></g>
  <path d="M615,104 L615,208" class="edge new" marker-end="url(#ah)"/>
  <text x="625" y="160" class="note left">owns it now; launcher re-syncs on every open</text>
  <g class="box"><rect x="712" y="210" width="162" height="74" rx="8"/>
    <text x="793" y="238">GNOME Shell</text><text x="793" y="260" class="mono">watches hicolor/ mtime</text></g>
  <path d="M690,247 L710,247" class="edge" marker-end="url(#ah)"/>
</svg>
"""

page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SystemSketch Dock Icon</title>
<link rel="icon" href="{mark_uri}">
<style>
:root {{ --bg:#fafaf9; --fg:#1c1917; --muted:#57534e; --line:#e7e5e4; --card:#fff; --hot:#c2410c; --new:#15803d; --dim:#a8a29e; }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --bg:#1c1917; --fg:#f5f5f4; --muted:#a8a29e; --line:#44403c; --card:#292524; --hot:#fb923c; --new:#4ade80; --dim:#78716c; }} }}
:root[data-theme="dark"] {{ --bg:#1c1917; --fg:#f5f5f4; --muted:#a8a29e; --line:#44403c; --card:#292524; --hot:#fb923c; --new:#4ade80; --dim:#78716c; }}
* {{ box-sizing:border-box }}
body {{ margin:0; background:var(--bg); color:var(--fg); font:15px/1.55 system-ui, sans-serif; }}
main {{ max-width:980px; margin:0 auto; padding:32px 16px 64px; }}
h1 {{ font-size:26px; margin:0 0 6px; }} h2 {{ font-size:18px; margin:40px 0 10px; border-top:1px solid var(--line); padding-top:22px; }}
.lede {{ color:var(--muted); margin:0 0 18px; }}
ul {{ padding-left:20px; }} li {{ margin:4px 0; }}
code, .mono {{ font-family:ui-monospace, monospace; font-size:.9em; }}
.pair {{ display:grid; grid-template-columns:1fr 1fr; gap:16px; }}
@media (max-width:700px) {{ .pair {{ grid-template-columns:1fr; }} }}
.card {{ background:var(--card); border:1px solid var(--line); border-radius:10px; padding:12px; }}
.card img {{ width:100%; border-radius:6px; display:block; image-rendering:auto; }}
.card h3 {{ margin:0 0 8px; font-size:14px; }}
.pending {{ border:1px dashed var(--hot); color:var(--hot); padding:24px; border-radius:6px; font-size:13px; }}
.strip {{ display:flex; gap:14px; overflow-x:auto; padding-bottom:6px; }}
.rev {{ margin:0; min-width:150px; text-align:center; font-size:12px; color:var(--muted); }}
.rev img {{ width:120px; height:120px; object-fit:contain; background:#3a3a3a; border-radius:10px; padding:8px; }}
.rev.live img {{ outline:3px solid var(--hot); }}
.rev b {{ color:var(--fg); }} .where {{ font-weight:600; }}
.rev.live .where {{ color:var(--hot); }}
svg {{ width:100%; height:auto; }}
svg text {{ fill:var(--fg); font:13px system-ui, sans-serif; text-anchor:middle; }}
svg .mono {{ font:11px ui-monospace, monospace; fill:var(--muted); }}
svg .note {{ font-size:11px; fill:var(--muted); }} svg .note.left {{ text-anchor:start; }}
svg .box rect {{ fill:var(--card); stroke:var(--line); stroke-width:1.5; }}
svg .box.hot rect {{ stroke:var(--hot); stroke-width:2; }} svg .box.new rect {{ stroke:var(--new); stroke-width:2; }}
svg .box.dim text {{ fill:var(--dim); }}
svg .edge {{ fill:none; stroke:var(--fg); stroke-width:1.5; }} svg .edge.dashed {{ stroke:var(--dim); stroke-dasharray:5 4; }}
svg .edge.new {{ stroke:var(--new); }} svg .ink {{ fill:var(--fg); }}
table {{ border-collapse:collapse; width:100%; font-size:14px; }}
th, td {{ text-align:left; padding:7px 8px; border-bottom:1px solid var(--line); vertical-align:top; }}
th {{ color:var(--muted); font-weight:600; }}
td.ok {{ color:var(--new); font-weight:600; }} td.bad {{ color:var(--hot); font-weight:700; }}
pre {{ background:var(--card); border:1px solid var(--line); border-radius:8px; padding:10px 12px; overflow-x:auto; font-size:12.5px; }}
.ask {{ border-left:3px solid var(--hot); padding:4px 0 4px 12px; margin:10px 0; }}
</style></head><body><main>

<h1>The dock icon wasn't cached. It was the wrong icon.</h1>
<p class="lede">SystemSketch / bbox studio · 2026-09-22 · branch <code>claude/system-sketch-icon-cache-647132</code></p>
<ul>
  <li><b>The lit dock slot belongs to <code>systemsketch.desktop</code>, not <code>bbox-ui.desktop</code>.</b> Both claim the window's class, and GNOME always picks the one whose ID equals the class. So nothing done to bbox-ui's icon could ever show on the running window.</li>
  <li><b>The file behind that slot was the 08-30 original.</b> The archived repo's installer re-wrote it on 09-09 from a <code>main</code> that never got the 09-06 refinement. The 09-21 bbox studio mark only ever reached the website.</li>
  <li><b>One real cache on top:</b> GNOME Shell only rescans when <code>hicolor/</code>'s own mtime moves, and only checks on a texture-cache miss. A file swapped in place stays on screen until something causes a miss (the overview, Alt+Tab) or a logout, so even a correct fix looks like it failed.</li>
  <li><b>Fixed and installed.</b> <code>scripts/dock_icon.py</code> renders the site's own <code>bbox-studio-mark.svg</code> into the icon and bumps the directory. The launcher re-syncs it every time you press the icon. <code>--check</code> now says: <b>{html.escape(check_out.splitlines()[-1])}</b>.</li>
  <li><b>Round 2, your follow-up: SystemSketch, pyblocks and bbox ui now fill the same box as Claude and Codex.</b> Measured on their icon files, both sit at 0.098–0.902 of the canvas. Only each SVG's frame changed, never a path, and the studio mark is now centred (it sat 25 units high). <b>The honest caveat, measured: the outer size was already within a few percent</b>, so the resize is ~1.5%. Almost all of why ours <i>look</i> smaller is contrast. Options for that are below.</li>
  <li><b>Round 3, your pick: the hairline (option C) is installed on all three.</b> It sits <i>inside</i> each square, so the outer size stays exactly on the Claude/Codex box. It's added as its own element in the dock version only; the site mark and your drawings are unchanged.</li>
</ul>

<h2>Your dock</h2>
<div class="pair">
  <div class="card"><h3>Before: live grab, 03:36</h3><img src="{uri('dock-before-zoom.png')}" alt="Dock before"></div>
  <div class="card"><h3>After: live grab, 03:51, no logout</h3>{after_html}</div>
</div>
<p class="lede">The three orange dots sit under the SystemSketch slot, not the "bbox ui" one you press. That's the tie-break below, seen on screen.</p>

<h2>Round 2 · the same outer size as Claude and Codex</h2>
<div class="card"><h3>Installed files on the dock's colour. Magenta = the Claude/Codex box. Top: before · bottom: after</h3><img src="{uri('sizes-before.png')}" alt="Before"><div style="height:8px"></div><img src="{uri('sizes-after.png')}" alt="After"></div>
<table><tr><th>Icon</th><th>Painted width × height, before</th><th>After (fraction of canvas)</th></tr>{size_rows}</table>
<p class="lede">The longer side now lands on the box exactly and each icon is centred. They stay ~2% narrower than Claude because your squares are 384×396, not square. I kept the aspect rather than stretch the drawing. pyblocks' logo was installed at 03:50 by a pyblocks session, outside any repo. It was re-framed in place, and the previous files are backed up at <code>~/.local/share/pyblocks/desktop-backup-2026-09-22/before-resize/</code>.</p>
<div class="card"><h3>Your dock at 04:28: the shell had NOT repainted yet</h3>{resized_html}</div>
<p class="lede"><b>Measured, not assumed:</b> the pyblocks slot here is pixel-identical to the 03:51 grab, although its 48 px file changed at 03:58. GNOME Shell only re-checks the icon folder when its texture cache misses, and a cache hit never looks. So the new files show the next time something causes a miss: opening the Activities overview, Alt+Tab, a new app icon. On X11, <code>Alt+F2</code>, <code>r</code>, <code>Enter</code> forces it without logging out and keeps your windows. The 03:51 repaint in round 1 was one of those misses, not the folder bump on its own.</p>

<h2>Why they still read smaller: contrast, not size</h2>
<div class="card"><img src="{uri('contrast-variants.png')}" alt="Three contrast options next to Claude and Codex"></div>
<p class="lede">Measured in the 03:51 grab: our square is <code>rgb(30,30,30)</code> on a dock of <code>rgb(18,19,19)</code>, about 1.1:1. Claude and Codex are orange and white. So the eye reads our white drawing, not the square. <b>A</b> is what's installed. <b>B</b> and <b>C</b> are renders only. Pyblocks and bbox ui also have much tighter corners (rx ≈ 4%) than Claude/Codex's rounded squares.</p>

<h2>Round 3 · the hairline, installed</h2>
<div class="card"><h3>Claude, Codex, then pyblocks, SystemSketch, bbox ui. Top: 48 px (the dock's size, shown 2×) · bottom: 96 px</h3><img src="{uri('outline-preview.png')}" alt="Outlined icons beside Claude and Codex"></div>
<p class="lede">A 10-unit white line at 28% opacity (about 1 px at 48 px), laid inside the square's edge, after the square and before the drawing. So SystemSketch's wire still crosses over it where it enters the box. Tested: rendering the same frame with and without it gives the identical faintest-pixel extent, so nothing grows past the Claude/Codex box.</p>

<h2>Four redesigns, none of them reached the dock</h2>
<div class="strip">{lineage}</div>
<p class="lede">Revisions 1–3 are real blobs from <code>/home/bam/systemsketch</code>'s history (only on <code>track/icon-cable-refinement</code>, never merged). The last is <code>apps/docs/public/bbox-studio-mark.svg</code>, which is now the dock icon's only source.</p>

<h2>The seam</h2>
<div class="card">{SEAM_SVG}</div>
<table>
<tr><th>Claim</th><th>Source actually read</th></tr>
<tr><td>Same StartupWMClass on two entries → the entry whose ID equals it wins</td><td><code>gnome-shell 46.0 src/shell-app-system.c:98-111, 142-144</code> (<code>startup_wm_class_is_exact_match</code>). Measured: all 3 windows <code>WM_CLASS "127.0.0.1", "systemsketch"</code>; dots under SystemSketch.</td></tr>
<tr><td>Shell rescans only when the theme dir's mtime moves</td><td><code>src/st/st-icon-theme.c:787-803</code> records <code>&lt;base&gt;/hicolor</code>, <code>:1085</code> checks it every &gt;5 s, <code>:2115-2140</code> compares only that mtime. <code>st-texture-cache.c:155</code> evicts icon textures on change.</td></tr>
</table>

<h2>What changed</h2>
<table>
<tr><th>File</th><th>Change</th></tr>
<tr><td><code>scripts/dock_icon.py</code></td><td>New. Installs <code>systemsketch</code> (from the studio mark) and <code>bbox-ui</code> (from <code>assets/bbox-ui.svg</code>) as SVG + 8 PNG sizes via GdkPixbuf/librsvg, the renderer GNOME uses. <code>fit()</code> measures each drawing's painted bounds and rewrites only the root <code>viewBox</code> so it fills <code>TARGET</code>. It removes stray variants, rebuilds the cache and bumps <code>hicolor/</code>. <code>--check</code> is read-only. <code>--fit-installed NAME</code> handles icons other projects own.</td></tr>
<tr><td><code>scripts/launch_systemsketch.py</code></td><td><code>refresh_dock_icon()</code> before every window open. A no-op when current, and it never blocks the launch.</td></tr>
<tr><td><code>scripts/tests/test_dock_icon.py</code></td><td>16 tests. The lookup oracle is <code>Gtk.IconTheme.lookup_icon</code> on a throwaway data dir. The size oracle is Pillow re-measuring the real Claude/Codex icons, never the module's own constant.</td></tr>
<tr><td><code>assets/bbox-ui.desktop</code></td><td>Comment only. The old one implied the window grouped under this entry. Measured: it doesn't.</td></tr>
<tr><td><code>assets/bbox-ui-{{16…512}}.png</code></td><td>Deleted. They were unreferenced pre-rendered copies that would now disagree with what's installed. <code>dock_icon.py</code> renders them from the SVG.</td></tr>
<tr><td><code>~/.local/share/icons/hicolor/*/apps/pyblocks.*</code></td><td>Re-framed and outlined in place with <code>--fit-installed pyblocks</code>. A second run is a no-op. The previous states are backed up in <code>~/.local/share/pyblocks/desktop-backup-2026-09-22/before-resize/</code> and <code>…/before-outline/</code>.</td></tr>
<tr><td><code>~/.local/share/icons/hicolor/*/apps/systemsketch.*</code></td><td>Installed live. The old raster is still in <code>/home/bam/systemsketch/assets/systemsketch.png</code> if you want it back.</td></tr>
</table>

<h2>Proof</h2>
<pre>$ python3 scripts/dock_icon.py --check     (exit {check_code})
{html.escape(check_out)}

GTK lookup at 48 px, live session:
{html.escape(lookup)}

scripts/tests/test_dock_icon.py   {html.escape(test_line)}
scripts/tests (whole suite)       {html.escape(suite_line)}</pre>
<p class="lede">Each mutation below was applied to a copy of the tree and must turn the suite red. One didn't at first: the mtime test synced into an empty folder, which moves the mtime anyway. It was rewritten to replace a file in place, the case that actually bites.</p>
<table><tr><th>Mutation</th><th>Result</th><th>What it would have let through</th></tr>{mutation_rows}</table>

<h2>What's left, and what needs you</h2>
<div class="ask"><b>Two pinned dock icons for one app.</b> "bbox ui" launches the window, but it lights "SystemSketch". Recommend: keep the SystemSketch slot (GNOME assigns the window to it), rename it <i>bbox studio</i>, move bbox-ui's two site actions onto its right-click, and unpin "bbox ui". <b>If you say nothing:</b> both stay pinned as they are. The lit one now shows the right icon.</div>
<div class="ask"><b>Contrast: settled.</b> You picked C. It's installed and in <code>dock_icon.py</code> as <code>OUTLINE</code>, so if you want it stronger or thinner, that's a one-line change.</div>
<ul>
  <li><b>Not merged.</b> The launcher self-heal only runs from <code>/home/bam/bbox-ui</code> main once this branch lands. The icon itself is already installed.</li>
  <li><b>Deliberately not touched:</b> the archived repo's <code>install_desktop.py</code> (running it would still write the 08-30 raster, but the next launch now heals that), your dock pins, the "SystemSketch" label, and the corner radii.</li>
  <li><b>pyblocks:</b> if the pyblocks session reinstalls its logo, run <code>python3 scripts/dock_icon.py --fit-installed pyblocks</code> again. Nothing re-fits it automatically, because that icon isn't this repo's.</li>
</ul>
</main></body></html>
"""

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(page)
print(f"wrote {OUT} ({OUT.stat().st_size:,} bytes)")
if check_code or test_code or suite_code or any(v != "caught" for _, v, _ in verdicts):
    print("WARNING: a gate is red — read the Proof section", file=sys.stderr)
    raise SystemExit(1)
