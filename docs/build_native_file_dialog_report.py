#!/usr/bin/env python3
"""
Build the research report answering Zach's question, 2026-09-22:

    "is there no way to open the standard system file explorer to a preset
     window or something? so you could see like recents etc?"

...asked while looking at SystemSketch's own in-app file browser.

WHY this is a script and not a hand-written .html: every screenshot in the
page is a REAL capture of the REAL GNOME file chooser taken on this machine,
driven through Chrome under an invisible Xvfb display, and every number in
the prose (recent-entry counts, the portal's D-Bus member name, which folder
each call lands in) was read off the machine rather than typed from memory.
Re-running the capture harness and re-running this script is how the page
stays honest.

USAGE
  python3 docs/build_native_file_dialog_report.py \
      --captures /abs/dir/of/pngs \
      --out /home/bam/bbox-ui/reports/media/native-file-dialog-2026-09-22.html
"""
from __future__ import annotations

import argparse
import base64
import io
import urllib.parse
from pathlib import Path

from PIL import Image

# The desktop preview builds a `data:text/html,<encoded>` URL and refuses
# anything over this many bytes MEASURED ENCODED, not on disk.
PREVIEW_CEILING = 2_097_024


def webp(path: Path, crop=None, scale: float = 1.0, quality: int = 80) -> str:
    """One capture -> an inline data: URI, cropped and re-encoded to WebP."""
    img = Image.open(path).convert("RGB")
    if crop:
        img = img.crop(crop)
    if scale != 1.0:
        img = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=quality, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def figure(src: str, caption: str, sub: str = "") -> str:
    subline = f'<p class="sub">{sub}</p>' if sub else ""
    return (
        f'<figure><img src="{src}" alt="{caption}">'
        f"<figcaption><strong>{caption}</strong>{subline}</figcaption></figure>"
    )


CSS = """
:root{--bg:#0f1115;--panel:#161a21;--ink:#e8ecf2;--dim:#98a2b3;--line:#262c36;
      --good:#37d67a;--bad:#ff6b6b;--warn:#ffb020;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
     font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;}
.wrap{max-width:1040px;margin:0 auto;padding:40px 24px 96px}
h1{font-size:30px;line-height:1.2;margin:0 0 6px}
h2{font-size:21px;margin:52px 0 10px;padding-top:18px;border-top:1px solid var(--line)}
h3{font-size:14px;margin:26px 0 8px;color:var(--dim);text-transform:uppercase;letter-spacing:.06em}
p{margin:0 0 14px}
.lede{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--good);
      border-radius:10px;padding:20px 22px;margin:22px 0 8px;font-size:17px}
.lede strong{color:#fff}
.q{color:var(--dim);font-style:italic;margin:0 0 26px}
code,kbd{background:#0b0d11;border:1px solid var(--line);border-radius:4px;
     padding:1px 6px;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#cfe0ff}
pre{background:#0b0d11;border:1px solid var(--line);border-radius:8px;padding:14px 16px;
    overflow-x:auto;font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:#cfe0ff}
pre code{background:none;border:none;padding:0}
table{width:100%;border-collapse:collapse;margin:14px 0 20px;font-size:14.5px}
th,td{border:1px solid var(--line);padding:9px 11px;text-align:left;vertical-align:top}
th{background:#1b212b;color:#fff;font-weight:600}
tbody tr:nth-child(even){background:#12161d}
figure{margin:20px 0;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px}
figure img{width:100%;display:block;border-radius:6px;background:#fff}
figcaption{margin-top:10px;font-size:14px;color:var(--ink)}
figcaption .sub{margin:4px 0 0;color:var(--dim);font-size:13.5px}
ul{margin:0 0 14px;padding-left:22px}
li{margin:5px 0}
.yes{color:var(--good);font-weight:600}
.no{color:var(--bad);font-weight:600}
.maybe{color:var(--warn);font-weight:600}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:820px){.cols{grid-template-columns:1fr}}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px 18px}
.card h4{margin:0 0 8px;font-size:15px}
.rec{background:#12211a;border:1px solid #1f6b43;border-left:3px solid var(--good)}
.not{background:#211414;border:1px solid #6b2a2a;border-left:3px solid var(--bad)}
.foot{margin-top:48px;padding-top:18px;border-top:1px solid var(--line);color:var(--dim);font-size:13px}
.stock td:nth-child(3){color:#cfe0ff;font-family:ui-monospace,Menlo,monospace;font-size:13px}
tr.seam td{background:#12211a}
"""


def build(cap: Path) -> str:
    DLG_SMALL = (0, 0, 815, 384)
    DLG_BIG = (0, 0, 1180, 760)

    shot_today = webp(cap / "01-A-plain-fresh.png", crop=DLG_SMALL)
    shot_recent_filtered = webp(cap / "21-recent-boardfilter.png", crop=DLG_BIG, scale=0.82)
    shot_recent_all = webp(cap / "31-recent-ALLFILES.png", crop=DLG_BIG, scale=0.82)
    shot_boards_folder = webp(cap / "52-after-pick.png", crop=DLG_BIG, scale=0.86)
    shot_consent = webp(cap / "80c-consent.png", crop=(520, 770, 1060, 975))
    shot_breadcrumbs = webp(cap / "breadcrumbs-all.png")
    shot_inapp = webp(cap / "story-breadcrumb-navigates.png", crop=(510, 480, 2050, 1235), scale=0.62)

    inapp_block = figure(
        shot_inapp,
        "The in-app browser WITH its Recent rail fed - the real component, not a mock",
        "Captured live from the story <code>Editor/Panels &amp; Dialogs/FileNavigator/Stock Parts</code>, which "
        "is the only thing in the repo that passes the <code>recents</code> prop. The rail renders perfectly; "
        "nothing in the actual app ever supplies it, which is the entire reason the real dialog says "
        "&ldquo;No recent files yet.&rdquo;",
    )

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Native file dialog, preset folders and Recents</title>
<style>{CSS}</style></head><body><div class="wrap">

<h1>Can we open the real system file dialog, preset to a folder, with Recents?</h1>
<p class="q">&ldquo;is there no way to open the standard system file explorer to a preset window or
something? so you could see like recents etc?&rdquo; &mdash; 2026-09-22</p>

<div class="lede">
<p><strong>Yes &mdash; and almost all of it is already wired. It is one setting away, not a feature.</strong>
On this machine Chrome does not draw its own file dialog: <code>showOpenFilePicker()</code> hands off over D-Bus to
<code>xdg-desktop-portal-gnome</code>, so you get <em>the same GNOME chooser Nautilus uses</em> &mdash; Recent in the
sidebar, Places, search, the lot. Settings &rarr; File navigation &rarr; <em>System file dialog</em> turns it on today.</p>
<p>Two measured caveats, neither needing code. <strong>Recent looks empty at first</strong> because it obeys the
board type filter and <em>no board has ever been registered</em> in the OS recent list &mdash; but the portal
registers every board you open through it, so it fills itself in from your first open. And <strong>the &ldquo;preset
window&rdquo; half already works</strong>: the app passes <code>id: "systemsketch-boards"</code>, which makes Chrome
remember the last folder per origin, so only the <em>very first</em> open ever lands in Home.</p>
<p><strong>So do not add <code>startIn</code>.</strong> Measured below: a remembered <code>id</code> overrides it, and
on this machine every well-known name it accepts resolves to Home anyway.</p>
</div>

<h2>What actually opens</h2>
<p>Chrome 153.0.8010.52, Ubuntu 24.04, GNOME/X11. Driven through a disposable profile on an invisible
<code>Xvfb</code> display with its own private D-Bus bus and its own portal stack, so nothing could appear on
your screen. That it is the portal and not Chrome's own dialog is proved twice &mdash; by the X window's owner and
by the D-Bus traffic:</p>
<pre><code>0x200004 "Select a file this site can read": ("xdg-desktop-portal-gnome" "xdg-desktop-portal-gnome")

method call ... destination=org.freedesktop.portal.Desktop
    interface=org.freedesktop.portal.FileChooser; member=OpenFile</code></pre>

{figure(shot_today,
        "Exactly what the app asks for today &mdash; and it already has Recent",
        "<code>showOpenFilePicker({id:'systemsketch-boards', types:BOARD_PICKER_TYPES, ...})</code> on a fresh "
        "profile. <span class='yes'>Recent is right there</span>, top of the sidebar. The type filter is already "
        "correct too &mdash; bottom right reads <em>SystemSketch board</em>. It opens on Home; that is the one real gap.")}

<h2>&ldquo;so you could see like recents etc&rdquo; &mdash; the actual question</h2>
<p>Recent exists. The interesting part is why it <em>looks</em> broken, and why that fixes itself.</p>

<div class="cols">
{figure(shot_recent_filtered,
        "Recent under the board filter: empty",
        "What you would see on the first click. Not a bug in the dialog.")}
{figure(shot_recent_all,
        "Same Recent, filter switched to All Files: full",
        "Your real 85 entries render &mdash; Name, Location, Size, Accessed. The list works; it had nothing "
        "matching <code>.systemsketch</code>/<code>.tldr</code> to show.")}
</div>

<p>The cause, read off the machine: <code>~/.local/share/recently-used.xbel</code> held
<strong>85 entries and zero boards</strong>, every one a screenshot registered by <code>gio open</code>. You have
never opened a board through anything that registers recents.</p>

<h3>Does opening a board through this dialog register it?</h3>
<p>Measured against a <em>copy</em> of your real recents file (yours was never written to &mdash; checksum verified
identical before and after every run):</p>
<pre><code>BEFORE: 85 entries, 0 board entries
  ... pick /home/bam/SystemSketch/02_literal_argument.tldr through the dialog ...
AFTER : 86 entries
        href="file:///home/bam/SystemSketch/02_literal_argument.tldr"
        registered by: xdg-desktop-portal-gnome</code></pre>
<p><span class="yes">Yes</span> &mdash; the portal does it, with no app code at all. Recent is self-populating from
the first board you open, and because it is the OS list those boards then appear in Nautilus's Recent too.</p>

<h2>The &ldquo;preset window&rdquo; half &mdash; and why <code>startIn</code> is the wrong lever</h2>
<p>Five runs, each a clean Chrome profile, each escaping at the dialog. Only the breadcrumb matters, so here
they are stacked in the order of the table below:</p>

{figure(shot_breadcrumbs, "Where each call actually lands")}

<table>
<thead><tr><th>#</th><th>Call</th><th>Profile state</th><th>Lands in</th><th>Reading</th></tr></thead>
<tbody>
<tr><td>1</td><td><code>{{id, types}}</code> &mdash; today's code</td><td>fresh</td><td><code>~</code> (Home)</td>
    <td>The gap: the first open ever drops you in a 185-entry Home.</td></tr>
<tr><td>2</td><td><code>{{types, startIn:'documents'}}</code></td><td>fresh</td><td><code>~</code> (Home)</td>
    <td><span class="no">Well-known names are useless here.</span> Your <code>user-dirs.dirs</code> says
        <code>XDG_DOCUMENTS_DIR="$HOME/"</code> &mdash; Documents <em>is</em> Home.</td></tr>
<tr><td>3</td><td><code>{{id, types, startIn:&lt;dir handle&gt;}}</code></td><td>fresh id, handle held</td>
    <td><code>~/SystemSketch</code></td>
    <td><span class="maybe">Works</span> &mdash; at the price of the consent prompt below.</td></tr>
<tr><td>4</td><td><code>{{id, types, startIn:'documents'}}</code></td>
    <td>id already remembers <code>~/SystemSketch</code></td><td><code>~/SystemSketch</code></td>
    <td><span class="no">The remembered <code>id</code> wins.</span> <code>startIn</code> is ignored outright.</td></tr>
<tr><td>5</td><td><code>{{id, types}}</code></td><td>id already remembers <code>~/SystemSketch</code></td>
    <td><code>~/SystemSketch</code></td>
    <td><span class="yes">Stickiness you already have, for free.</span></td></tr>
</tbody></table>

<p>Rows 4 and 5 are the finding that inverts the obvious fix. Chrome persists the folder per origin under
<code>file_system_last_picked_directory &rarr; custom-id-systemsketch-boards</code> (read straight out of the
profile's <code>Preferences</code>), and that remembered value <em>takes precedence over</em> <code>startIn</code>.
Adding <code>startIn</code> would therefore change exactly one dialog opening &mdash; the first after a profile
reset &mdash; and be dead code forever after.</p>

<p>And the only form of <code>startIn</code> that can actually reach <code>~/SystemSketch</code> (row 3) needs a
<code>FileSystemDirectoryHandle</code>, obtainable only by asking for read access to the whole folder:</p>

{figure(shot_consent,
        "The price of the handle route",
        "<code>showDirectoryPicker()</code> raises this Chrome consent prompt, and the handle must then be "
        "persisted in IndexedDB and re-authorised after a restart. A permanent permission surface, bought to "
        "improve one dialog opening.")}

{figure(shot_boards_folder,
        "What the dialog looks like once it is pointed at your boards",
        "The state rows 3-5 all reach, and the state every open after your first reaches by itself. "
        "119 boards, filtered to SystemSketch boards, with Size and Modified.")}

<h2>Prior art: this was built once, and deliberately removed</h2>
<p>Worth knowing before anyone proposes it again. A native GTK chooser <em>was</em> shipped &mdash; not through the
browser, but by shelling out to <code>zenity</code> from the Python controller, with <code>--filename=</code> as its
preset-folder flag. It was removed the next day, and a test now fails if it returns
(<code>tests/test_workspace_store.py</code>, <code>test_the_host_never_shells_out_to_a_desktop_file_chooser</code>).
The commit says why:</p>
<pre><code>File &gt; Open handed the modal to zenity: the Python host ran it as a
subprocess inside the HTTP handler with no timeout, and the browser
awaited that fetch with no deadline either - so a wedged GTK chooser
wedged Open with it. ... Two single points of failure for one modal.
                        - systemsketch c3a3aa60, 2026-09-01</code></pre>
<p>Note precisely what was wrong: a blocking GUI subprocess inside a synchronous HTTP handler. Not &ldquo;native
choosers are bad.&rdquo; The browser's own picker reaches the <em>same</em> GNOME dialog over D-Bus with none of
that &mdash; no second process to wedge, no HTTP round trip to hang on.</p>

<h2>Stock parts</h2>
<p>One row per element: what the app does by hand today, the platform part that could replace it by its exact
name, and what must survive the swap.</p>

<table class="stock">
<thead><tr><th>Element</th><th>Today</th><th>Off-the-shelf part (exact name)</th><th>Behaviour that must survive</th></tr></thead>
<tbody>
<tr><td>Open&hellip; dialog</td><td><code>FileNavigator</code>, hand-rolled React dialog</td>
    <td>window.showOpenFilePicker()</td>
    <td>Board-type filter; Cancel leaves the board untouched; keyboard-only operation.</td></tr>
<tr><td>Save As&hellip;</td><td><code>FileNavigator</code> <code>mode="save"</code></td>
    <td>window.showSaveFilePicker()</td>
    <td>Suggested name keeps its extension; overwrite asks first.</td></tr>
<tr><td>Start folder, 2nd open onward</td><td>&mdash; (no concept)</td>
    <td>the <code>id</code> option ALREADY passed<br>-&gt; file_system_last_picked_directory</td>
    <td>Reopens where you last were. <strong>Already working; nothing to build.</strong></td></tr>
<tr><td>Start folder, first ever open</td><td>&mdash; (lands in Home)</td>
    <td>startIn: WellKnownDirectory<br>startIn: FileSystemHandle</td>
    <td class="no">Neither is worth it &mdash; rows 2-4 above. Recommendation: skip.</td></tr>
<tr><td>Recent list (OS-wide)</td><td>nothing; boards never registered</td>
    <td>xdg-desktop-portal-gnome<br>(reads ~/.local/share/recently-used.xbel)</td>
    <td>Most-recent-first, with Location and Accessed. Populates itself from your first open.</td></tr>
<tr><td>Registering a board as recent<br><em>without</em> the native dialog</td><td>nothing does it</td>
    <td>Gtk.RecentManager.add_item()<br>from launch_systemsketch.py (python3-gi is installed and verified)</td>
    <td>Boards opened by <em>any</em> route reach Recent &mdash; in-app browser and launcher included.</td></tr>
<tr><td>Recent list (in-app)</td>
    <td><code>recents</code> prop exists, typed, rendered &mdash; and no host ever passes it, so it is permanently
        &ldquo;No recent files yet.&rdquo;</td>
    <td>&mdash; (no stock part; a wiring gap, not a missing library)</td>
    <td>Most-recent-first, click to open, full path on hover.</td></tr>
<tr class="seam"><td><strong>unchanged (stock seam)</strong><br>save pipeline</td>
    <td>digest fence, atomic write, autosave, watcher in <code>workspace_store.py</code></td>
    <td><strong>left alone</strong></td>
    <td>External/agent edits still detected; no silent clobber. None of it sits in the dialog's path.</td></tr>
<tr class="seam"><td><strong>unchanged (stock seam)</strong><br>the in-app browser</td>
    <td><code>FileNavigator</code> stays the default</td>
    <td><strong>left alone</strong></td>
    <td>Rename, Show in Files, New folder, breadcrumb, filter box &mdash; the GNOME chooser has none of these.</td></tr>
</tbody></table>

<h2>The in-app Recent is one wire away</h2>
<p>Separate from the native-dialog question, and cheaper. The in-app browser's Recent rail is fully built and
fully tested &mdash; it is simply never given data. <code>recents</code> is declared at
<code>fileNavigator.tsx:111</code>, rendered at <code>:476</code>, and the only things that ever pass it are stories.</p>
{inapp_block}

<h2>Recommendation</h2>
<div class="card rec">
<h4>Reversible default &mdash; what I would do, and would do without asking</h4>
<ul>
<li><strong>Correct the setting's description.</strong> It currently reads &ldquo;<em>Your browser's own Open and
Save dialogs. No recent list, no rename, no Show in Files.</em>&rdquo; The <em>&ldquo;no recent list&rdquo;</em>
clause is false on this machine &mdash; and it is exactly what would have stopped you trying the thing you just
asked for. One string in <code>settingsCategories.tsx</code>.</li>
<li><strong>Feed the in-app <code>recents</code> prop</strong> from the host's MRU, so the app's own Recent rail
stops being permanently empty. Small, self-contained, and it pays off whichever dialog you end up preferring.</li>
<li><strong>Try the native dialog</strong> by flipping the setting &mdash; zero code, one click back. Its Recent
reads empty until you have opened a board or two through it, then stays useful, and your boards start showing up
in Nautilus's Recent as a side effect.</li>
</ul>
</div>

<div class="card not" style="margin-top:16px">
<h4>What I would NOT do, and why</h4>
<ul>
<li><strong>Add <code>startIn</code>.</strong> Measured, not assumed: a remembered <code>id</code> overrides it
(row 4), every well-known name resolves to Home here (row 2), and the handle form costs a folder-wide consent
prompt plus IndexedDB persistence (row 3). It buys one dialog opening, once, then never runs again.</li>
<li><strong>Re-spawn a chooser from the Python controller.</strong> It existed, it wedged File &gt; Open, it was
removed on purpose, and a test forbids it. The browser picker reaches the same dialog without the second process.</li>
<li><strong>Replace the in-app browser.</strong> It has rename, Show in Files, New folder and a filter box that the
GNOME chooser does not. The setting already lets both exist; that is the right shape.</li>
</ul>
</div>

<h2>What I could not verify</h2>
<ul>
<li><strong>Dialog size and window chrome.</strong> No window manager exists on the virtual display, so the chooser
rendered at its minimum size and I resized it by hand with <code>xdotool</code>. On your real session it will be
larger and decorated. Contents, sidebar and behaviour are faithful; geometry is not.</li>
<li><strong>Your real session's portal backend.</strong> I ran a private <code>xdg-desktop-portal-gnome</code> so
nothing could reach your screen. Your session runs the same backend (both it and <code>-gtk</code> are live, and
GNOME prefers <code>-gnome</code>), so this should be the same dialog &mdash; but that is an inference from
configuration, not a capture of your live session.</li>
<li><strong><code>startIn</code> with a <em>file</em> handle</strong> (rather than a directory handle) is allowed by
the spec and would avoid the consent prompt. I did not test it, because row 4 makes it moot &mdash; the remembered
<code>id</code> would override it anyway.</li>
</ul>

<p class="foot">Method: Chrome 153.0.8010.52 driven by Playwright 1.63 on disposable profiles, on
<code>Xvfb :64</code> with a private D-Bus bus and a private portal stack, so no window could reach display :0.
Recents were exercised against a copy of <code>~/.local/share/recently-used.xbel</code>; the real file's checksum
was verified unchanged after every run. Screenshots are <code>ffmpeg -f x11grab</code> captures of the virtual
display &mdash; the chooser is an OS window, so a page screenshot would not contain it. No feature code was changed
in this lane.</p>

</div></body></html>
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--captures", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()

    html = build(args.captures)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(html, encoding="utf-8")

    on_disk = len(html.encode("utf-8"))
    encoded = len(urllib.parse.quote(html).encode("ascii"))
    pct = encoded / PREVIEW_CEILING * 100
    print(f"wrote {args.out}")
    print(f"  on disk : {on_disk:,} bytes")
    print(f"  encoded : {encoded:,} bytes  ({pct:.1f}% of the {PREVIEW_CEILING:,}-byte ceiling)")
    print("  " + ("OK - opens in the desktop preview" if encoded <= PREVIEW_CEILING else "OVER CEILING - browser-only"))


if __name__ == "__main__":
    main()
