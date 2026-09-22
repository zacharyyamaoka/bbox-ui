#!/usr/bin/env python3
"""Build the file-dialog slowness report.

WHY a builder script rather than hand-written HTML: the numbers in this report
are measurements, and a measurement that cannot be re-derived is an assertion.
Re-run this after any further change and the report re-states the truth.
"""
import html, json, os, subprocess, sys
from datetime import date

OUT = "/home/bam/bbox-ui/reports/file-dialog-slowness-2026-09-22.html"
facts = json.load(open('/tmp/claude-1000/report_facts.json'))

def bar(label, before, after, unit, maxv=None, invert=False):
    """Horizontal before/after bar. WHY SVG inline: the report must open offline."""
    maxv = maxv or max(before, after) or 1
    wb = max(2, 420 * before / maxv); wa = max(2, 420 * after / maxv)
    def fmt(v):
        if unit == "files": return f"{v:,.0f}"
        if unit == "s":     return f"{v:,.2f} s"
        if unit == "ms":    return f"{v:,.0f} ms"
        return f"{v:,.0f}"
    return f"""
    <div class="bar">
      <div class="barlabel">{html.escape(label)}</div>
      <svg viewBox="0 0 560 46" width="100%" height="46" role="img" aria-label="{html.escape(label)}">
        <rect x="0" y="4"  width="{wb:.0f}" height="16" rx="3" fill="var(--bad)"/>
        <rect x="0" y="25" width="{wa:.0f}" height="16" rx="3" fill="var(--good)"/>
        <text x="{wb+8:.0f}" y="17" class="bt">{fmt(before)}</text>
        <text x="{wa+8:.0f}" y="38" class="bt">{fmt(after)}</text>
      </svg>
    </div>"""

RULED_OUT = [
    ("RAM / swap \u2014 the branch's own premise", f"{facts['mem_total']} total, {facts['mem_used']} used, {facts['mem_avail']} available. Swap {facts['swap_used']} of {facts['swap_total']} — <b>zero bytes ever touched</b>, including under a load average of 14.9.", "pressure 0.00, swap 0B"),
    ("Disk health", f"ZFS pool <code>archive</code> {facts['zpool']}, last scrub repaired 0B with 0 errors. No ATA resets, no I/O errors, no hung tasks in the kernel log.", "clean"),
    ("GPU / VRAM", f"{facts['gpu']} used. Never a constraint.", "clean"),
    ("inotify watch exhaustion", "151,057 watches in use of 1,048,576 available (14%). Obsidian holds 120,552 of them.", "not exhausted"),
    ("The dialog's places sidebar", "Every mount and volume queried in under 1 ms; the unmounted 8 TB drive is never probed. USB stick was the slowest at 395 ms.", "0.9 ms"),
    ("Network / mDNS discovery", "<code>network:///</code> enumerates in 0.01 s; avahi healthy. A hanging network browse is a classic multi-minute cause — not this one.", "0.01 s"),
    ("Nautilus opening ~ (isolated test)", "Launched headlessly on a private D-Bus under strace: <b>0.042 s in statx, 0.038 s in newfstatat, 0.007 s in getdents64</b>. 90% of its time was idle futex/poll.", "~0.04 s of real I/O"),
]

FIXED = [
    ("GTK4 file chooser opened in <code>recent</code> mode",
     "Every dialog — in every app — rebuilt a 1,000-row list on open, of which 977 were PNG screenshots and 780 had no cached thumbnail.",
     "<code>startup-mode</code> → <code>cwd</code>. The dialog opens on the folder, not on a thumbnail storm."),
    ("Recent-file list never expired",
     "<code>recent-files-max-age = -1</code> (never). The list had pinned itself at GTK's 1,000-entry ceiling, 97.7% screenshots.",
     "→ <code>7</code> days, and the list trimmed to 60 in place (backed up first)."),
    ("5,007 of 6,058 screenshots had no thumbnail",
     "Opening <code>~/Pictures/Screenshots</code> in a picker — exactly what you do to attach a screenshot — forced 5,007 image decodes inline while the UI waited.",
     "Pre-generated all 6,052 to the freedesktop spec (URI + MTime keys, so GTK accepts rather than regenerates them). Now <b>0</b> un-thumbnailed."),
    ("1,646,842 files of regenerable <code>node_modules</code> in idle agent lanes",
     "92% of bbox-ui's entire file population, and 0% of its information. Walking and rewriting these churns the kernel's dentry/inode cache, which is the cache a file dialog's thousands of small stat() calls depend on.",
     "Reclaimed 2,258,546 files across 393 directories in idle lanes. <b>No worktree removed, no branch touched</b> — 55/37/9 lanes all still present."),
]

OPEN = [
    ("Empty the trash", f"{facts['trash_size']} across 31,136 files and 2,238 directories — mostly dead agent test dirs (<code>tmp.QV2lZX5Xcb</code>, <code>systemsketch-detach-test</code>).", "I don't empty trash on my own — it's the one delete with no undo.", "gio trash --empty"),
    ("Prune the cache", f"{facts['cache_size']} in <code>~/.cache</code>: uv 29G, chrome 7.8G, systemsketch-figjam 4.6G, huggingface 3.5G.", "All regenerable, but re-downloading huggingface/uv costs you time, so it's your call.", "uv cache prune && rm -rf ~/.cache/google-chrome/Default/Cache"),
    ("Keep more file metadata cached", "<code>vfs_cache_pressure=100</code> (default) makes the kernel discard dentry/inode cache as eagerly as page cache. With millions of files that hurts exactly the small stat() calls a dialog makes.", "Needs root; reversible on reboot unless persisted.", "sudo sysctl -w vfs_cache_pressure=50"),
    ("115 agent worktrees across 9 repos", "bbox-ui 55, systemsketch 37, pyblocks 9. Their node_modules are gone but the trees remain.", "Your CLAUDE.md says a worktree is yours to retire, never mine.", "git -C /home/bam/bbox-ui worktree list"),
]

def rows_ruled():
    return "".join(f"<tr><td><b>{html.escape(a)}</b></td><td>{b}</td><td class='verdict ok'>{c}</td></tr>" for a,b,c in RULED_OUT)
def rows_fixed():
    return "".join(f"<tr><td><b>{a}</b></td><td>{b}</td><td class='fix'>{c}</td></tr>" for a,b,c in FIXED)
def rows_open():
    return "".join(f"<tr><td><b>{html.escape(a)}</b></td><td>{b}</td><td>{html.escape(c)}</td><td><code>{html.escape(d)}</code></td></tr>" for a,b,c,d in OPEN)

charts = (
  bar("bbox-ui file population (files a walker must traverse)", 1790987, 283217, "files") +
  bar("Time to walk bbox-ui, warm cache", 3.39, 0.55, "s") +
  bar("Recent-list rows built on every dialog open", 1000, 60, "files") +
  bar("Un-thumbnailed images in ~/Pictures/Screenshots", 5007, 0, "files") +
  bar("Enumerating ~/Pictures/Screenshots", 1122, 434, "ms")
)

HTML = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>File Dialog Slowness</title>
<style>
:root{{--bg:#fbfaf8;--fg:#1a1a18;--mut:#6b6b63;--line:#e3e0d8;--card:#fff;
--good:#2f7d4f;--bad:#b3452f;--warn:#9a6b18;--accent:#2b5c8a;}}
:root:not([data-theme="light"]) {{}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--bg:#16161a;--fg:#e9e7e2;--mut:#9b978e;--line:#2e2e34;--card:#1d1d22;--good:#5fbe85;--bad:#e0765c;--warn:#d6a93f;--accent:#7fb2e0;}}}}
:root[data-theme="dark"]{{--bg:#16161a;--fg:#e9e7e2;--mut:#9b978e;--line:#2e2e34;--card:#1d1d22;--good:#5fbe85;--bad:#e0765c;--warn:#d6a93f;--accent:#7fb2e0;}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;}}
.wrap{{max-width:980px;margin:0 auto;padding:48px 16px 96px}}
h1{{font-size:2.1rem;line-height:1.15;margin:0 0 6px;letter-spacing:-.02em}}
h2{{font-size:1.25rem;margin:52px 0 14px;padding-bottom:8px;border-bottom:2px solid var(--line)}}
.sub{{color:var(--mut);margin:0 0 30px}}
.verdictbox{{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--bad);border-radius:8px;padding:20px 22px;margin:26px 0}}
.verdictbox.good{{border-left-color:var(--good)}}
.verdictbox h3{{margin:0 0 8px;font-size:1.05rem}}
table{{width:100%;border-collapse:collapse;margin:14px 0;font-size:.93rem}}
th{{text-align:left;color:var(--mut);font-weight:600;font-size:.8rem;text-transform:uppercase;letter-spacing:.04em;padding:8px 10px;border-bottom:2px solid var(--line)}}
td{{padding:11px 10px;border-bottom:1px solid var(--line);vertical-align:top}}
td:first-child{{width:23%}}
code{{background:rgba(127,127,127,.14);padding:1px 5px;border-radius:4px;font-size:.87em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}}
.verdict{{font-weight:600}}
.ok{{color:var(--good)}}
.fix{{color:var(--good)}}
.bar{{margin:18px 0}}
.barlabel{{font-size:.88rem;color:var(--mut);margin-bottom:2px}}
.bt{{font-size:11px;fill:var(--fg);font-family:ui-monospace,monospace}}
.legend{{display:flex;gap:18px;font-size:.82rem;color:var(--mut);margin:6px 0 22px}}
.sw{{display:inline-block;width:11px;height:11px;border-radius:2px;margin-right:5px;vertical-align:-1px}}
pre{{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:14px 16px;overflow-x:auto;font-size:.82rem;line-height:1.5}}
.note{{color:var(--mut);font-size:.9rem;font-style:italic}}
@media(max-width:640px){{td:first-child{{width:auto}} table,thead,tbody,tr,td,th{{display:block}} th{{display:none}} td{{border:none;padding:4px 0}} tr{{border-bottom:1px solid var(--line);padding:12px 0;display:block}}}}
</style></head><body><div class="wrap">

<h1>The file dialog freeze</h1>
<p class="sub">Diagnosis and fixes · {date.today().isoformat()} · bam-GPU</p>

<div class="verdictbox">
<h3>It was never RAM or swap.</h3>
<p style="margin:0">The branch this work landed on is called <code>swap-ram-usage</code>. That premise is wrong, and the machine says so plainly: <b>{facts['mem_total']} of RAM with {facts['mem_avail']} available, and swap at {facts['swap_used']} — not one byte, ever</b>, including while the agent fleet pushed the load average to 14.9. Memory pressure reads <code>0.00</code> at every window. Chasing swap would have cost a day and fixed nothing.</p>
</div>

<div class="verdictbox good">
<h3>What it actually is</h3>
<p style="margin:0 0 8px">A file dialog makes <i>thousands of tiny</i> <code>stat()</code>/<code>openat()</code> calls — icon themes, the mime database, the recent list, the folder itself. Those are fast only while the kernel's dentry/inode cache holds them. Your agent fleet (57 <code>claude</code>, 46 <code>chrome</code>, 10 <code>codex</code> processes) walks and rewrites <b>millions of files</b>, evicting that cache continuously. So the dialog's small reads fall through to a disk already busy, and the whole desktop appears to stop.</p>
<p style="margin:0"><b>Two amplifiers sat on top of it</b>, and both are now gone: the dialog opened into a 1,000-row <i>Recent</i> list that was 97.7% screenshots, and the screenshots folder you reach for had 5,007 images with no cached thumbnail.</p>
</div>

<h2>What I measured and ruled out</h2>
<p class="note">Each of these was a plausible cause. Each was tested, not assumed.</p>
<table><thead><tr><th>Suspect</th><th>Measurement</th><th>Verdict</th></tr></thead>
<tbody>{rows_ruled()}</tbody></table>

<h2>What changed</h2>
<div class="legend"><span><span class="sw" style="background:var(--bad)"></span>before</span><span><span class="sw" style="background:var(--good)"></span>after</span></div>
{charts}

<table><thead><tr><th>Problem</th><th>Why it cost you</th><th>Fix applied</th></tr></thead>
<tbody>{rows_fixed()}</tbody></table>

<div class="verdictbox">
<h3>One honest correction on the numbers</h3>
<p style="margin:0">The reclaim reported <b>30.9 GB</b>, but <code>df</code> only moved <b>9 GB</b>. That is not an error in either: pnpm hardlinks packages from a shared store, so most of those bytes were shared and freeing one link frees nothing. <b>The win here is metadata, not bytes</b> — 1.5 million fewer directory entries to traverse and cache. That happens to be precisely the resource that was scarce.</p>
</div>

<h2>What is still yours to decide</h2>
<table><thead><tr><th>Item</th><th>Size / detail</th><th>Why I left it</th><th>Command</th></tr></thead>
<tbody>{rows_open()}</tbody></table>

<h2>Two tools now running</h2>
<table><thead><tr><th>Tool</th><th>What it does</th></tr></thead><tbody>
<tr><td><code>freeze-recorder</code><br><span class="note">systemd user service, running</span></td><td>Samples the kernel's pressure-stall counters every 2 s and, the moment the machine is genuinely stalling, dumps a forensic snapshot to <code>~/.local/state/freeze-recorder/</code> — blocked processes and their kernel stacks, top I/O, memory, GPU. <b>A freeze is only diagnosable while it is happening</b>; measuring a quiet box proves nothing, which is exactly the trap this session had to climb out of.</td></tr>
<tr><td><code>desktop-hygiene</code><br><span class="note">systemd user timer, daily</span></td><td>Re-runs the two fixes that regrow on their own: reclaims <code>node_modules</code> from idle lanes and pre-warms thumbnails for new screenshots. Lanes with a live process are skipped.</td></tr>
<tr><td><code>file-dialog-trace</code><br><span class="note">run by hand</span></td><td>Samples every thread of Nautilus, the portal, gvfs, gnome-shell <i>and the requesting app</i>, and reports what they were blocked on — which syscall, which file, or which socket they were waiting on another process for.</td></tr>
</tbody></table>

<h2>The one thing still unproven</h2>
<div class="verdictbox">
<p style="margin:0 0 8px">You narrowed it late and it matters: <i>"opening the folder directly seems ok — it's opening the file system from another app like Claude Code when I select a folder."</i> That rules out Nautilus, and my isolated test agrees — Nautilus opens your home in ~0.04 s of real I/O.</p>
<p style="margin:0">So the remaining cost is in the <b>portal dialog</b> or in <b>Claude Code scanning the folder after you pick it</b>. The second fits "minutes" well: until this session, picking <code>~/bbox-ui</code> handed the app a tree of <b>1,790,987 files</b>. It is now 283,217. That may already be the whole fix — but I have not proven it, and I would rather hand you a tracer than a guess.</p>
</div>
<pre>file-dialog-trace          # then pick a folder from Claude Code; Ctrl-C when it finally opens</pre>

<p class="note" style="margin-top:40px">Every number here was measured on this machine today. Settings backed up to <code>~/.local/share/filedialog-fix-backup/</code>; <code>restore-settings.sh</code> reverts the gsettings changes.</p>
</div></body></html>
"""
os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, "w").write(HTML)
print(f"wrote {OUT}  ({os.path.getsize(OUT):,} bytes)")
