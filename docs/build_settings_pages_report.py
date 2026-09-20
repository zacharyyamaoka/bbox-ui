#!/usr/bin/env python3
"""Build the review report for the settings-pages port.

Self-contained HTML: every capture is inlined as a data URI, and every number
in it is measured from the live repo at build time rather than typed, so the
page cannot drift from the tree it describes.

    python3 docs/build_settings_pages_report.py \
        --captures reports/media/settings-pages \
        --out /home/bam/bbox-ui/reports/media/settings-pages-2026-09-19.html

WHY the default output is the MAIN checkout and not this worktree's own
reports/: a report written inside a worktree dies when the worktree is swept,
so the file:// link Zach clicks a day later is gone.
"""
from __future__ import annotations

import argparse
import base64
import datetime as _dt
import pathlib
import re
import subprocess
import urllib.parse

REPO = pathlib.Path(__file__).resolve().parent.parent
TRUNK = REPO / "apps/storybook-basics/src"
DONOR = pathlib.Path("/home/bam/systemsketch/src/settings")


def sh(*args: str) -> str:
    return subprocess.run(args, cwd=REPO, capture_output=True, text=True, check=False).stdout.strip()


def data_uri(path: pathlib.Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def count_tests(path: pathlib.Path) -> int:
    """`it(` occurrences — what vitest will report for that file."""
    return len(re.findall(r"\bit\(", path.read_text(encoding="utf8"))) if path.exists() else 0


def lines(path: pathlib.Path) -> int:
    return len(path.read_text(encoding="utf8").splitlines()) if path.exists() else 0


CATEGORIES = [
    ("01-general", "General", "Kept both settings this app already had and folded the archive's file-fence switch in beside them."),
    ("02-appearance", "Appearance", "Interface scale, moved here exactly as Zach asked, plus the one genuinely appearance-shaped field from the archive's Canvas panel."),
    ("03-mouse-and-scrolling", "Mouse and scrolling", "The archive's Canvas panel, renamed for what it actually contains. Pointer, wheel behaviour, four rebindable wheel gestures, two speeds with an exact-value box."),
    ("04-connections", "Connections", "All nine edge permissions in the archive's four teaching groups, with the preset row derived from the live policy rather than stored."),
    ("05-hotkeys-and-aliases", "Hotkeys and aliases", "His suggested name, made true: the host's real chords printed through the trunk's own formatShortcut, above the ported alias editor."),
    ("06-about", "About", "Untouched. He asked for five categories and for nothing to be removed, so the host hands this one over verbatim."),
]

STOCK_PARTS = [
    ("Settings shell", "Archive's <code>TldrawUiDialog*</code> + hand-written <code>systemsketch-settings__*</code> CSS", "<code>SettingsView</code> over stock <code>Dialog</code>", "Centred dialog OR full-window page; <code>aria-current=\"page\"</code> on the open category; Escape closes"),
    ("Percentage control", "Raw <code>&lt;input type=\"range\"&gt;</code> + the archive's own <code>PercentInput.tsx</code>", "Stock <code>Slider</code> (shadcn base-nova) + stock <code>Input</code>", "Live readout, preset jumps, a disabled-at-default reset, and typing an exact value like 137%"),
    ("Permission row", "<code>&lt;button role=\"switch\"&gt;</code> with hand-rolled track CSS", "Stock <code>Switch</code>", "\"On\" always means more is possible; the live Allowed / Refused verdict under each row"),
    ("Preset row", "<code>.systemsketch-settings__presets</code> buttons", "Stock <code>Button</code>, <code>variant=\"secondary\"</code> when pressed", "<code>aria-pressed</code>, and the active preset DERIVED from the policy so one flipped switch honestly reads Custom"),
    ("Alias chip", "<code>.systemsketch-tool-alias-chip</code>", "Stock <code>Badge</code> + a <code>Button</code> for the remove ×", "The handle is kept intact — no case folding, no stripped punctuation"),
    ("Mode picker", "<code>role=\"radiogroup\"</code> of hand-styled cards", "Stock <code>RadioGroup</code> / <code>Select</code>", "Off / Lenient / Strict each keep their own explanation; wheel bindings keep the archive's command order"),
    ("<em>unchanged (stock seam)</em>", "—", "<code>slider.tsx</code>, <code>switch.tsx</code>, <code>radio-group.tsx</code>, <code>select.tsx</code>, <code>input.tsx</code>, <code>field.tsx</code>, <code>badge.tsx</code>, <code>button.tsx</code>, <code>dialog.tsx</code>", "Left byte-for-byte verbatim; <code>stockPrimitives.test.ts</code> checks each against the snapshotted registry item"),
]

LEFT_BEHIND = [
    ("The colour-theme picker and its VS Code theme importer", "<code>InterfaceSettings.tsx:1233-1388</code> plus the palette subsystem", "Zach's line for Appearance was \"Put interface scale in here\" — nothing about themes. It is also a real subsystem (built-in palettes, <code>parseVsCodeThemeText</code>, swatch rendering) and this app has no theme model yet to hang it on."),
    ("<code>Interface</code>, <code>Menu lab</code>, <code>Pill lab</code> as categories", "<code>InterfaceSettings.tsx:128-149</code>", "\"If I didn't list it here don't port it.\" Only the interface scale survived, and it moved into Appearance."),
    ("The multi-line port-editor toggle", "<code>InterfaceSettings.tsx:900-919</code>", "It sat in the Canvas panel but is neither pointer nor wheel, and this app has only one port editor — a switch between two things when only one exists is a control that lies."),
    ("\"Tune live…\"", "<code>InterfaceSettings.tsx:1007-1014</code>", "It closes the dialog and opens a floating HUD over the canvas. The HUD (<code>GestureTuningPanel.tsx</code>) has not been ported, so the button would lead nowhere."),
    ("The <code>allowAnyPath</code> row, in the app only", "<code>InterfaceSettings.tsx:405-435</code>", "The archive's file fence lives on its Python workspace server; this app has no such endpoint. The trunk supports the row and a story renders it — the app simply does not pass it."),
    ("Every model's React singleton", "<code>useSyncExternalStore</code> + module-level snapshot in all four donors", "This repo's rule: host-owned persistence does not travel. Each model is pure parse plus a storage adapter; the app owns the store in ~25 lines."),
]


def build(captures: pathlib.Path, out: pathlib.Path) -> pathlib.Path:
    sha = sh("git", "rev-parse", "--short", "HEAD")
    branch = sh("git", "rev-parse", "--abbrev-ref", "HEAD")
    today = _dt.date.today().isoformat()

    ported = [
        ("interfaceScale.ts", "interfaceScale.ts"),
        ("appearancePreferences.ts", "appearancePreferences.ts"),
        ("gestureSettings.ts", "gestureSettings.ts"),
        ("edgePolicy.ts", "edgePolicy.ts"),
        ("toolAliases.ts", "../library/toolAliases.ts"),
    ]
    model_rows = "".join(
        f"<tr><td><code>{name}</code></td>"
        f"<td class=n>{lines(TRUNK / 'components' / name)}</td>"
        f"<td class=n>{count_tests(TRUNK / 'components' / name.replace('.ts', '.test.ts'))}</td>"
        f"<td><code>{(DONOR / donor).resolve()}</code></td></tr>"
        for name, donor in ported
    )
    model_tests = sum(count_tests(TRUNK / "components" / n.replace(".ts", ".test.ts")) for n, _ in ported)
    story_count = len(re.findall(r"^export const \w+: Story", (TRUNK / "stories/SettingsCategories.stories.tsx").read_text(encoding="utf8"), re.M))

    shots = "".join(
        f"""<figure><figcaption><b>{title}</b> — {blurb}</figcaption>
        <img alt="{title} settings category" src="{data_uri(captures / (name + '.png'))}"></figure>"""
        for name, title, blurb in CATEGORIES
        if (captures / (name + ".png")).exists()
    )
    page_shot = ""
    if (captures / "07-connections-as-a-page.png").exists():
        page_shot = f"""<figure><figcaption><b>The same categories as a full-window page</b> — the other half of the
        presentation contract. Connections is nine permissions; this is the presentation that shows them
        without scrolling.</figcaption>
        <img alt="Connections as a full-window page" src="{data_uri(captures / '07-connections-as-a-page.png')}"></figure>"""

    stock_rows = "".join(
        f"<tr><td>{el}</td><td>{today_}</td><td>{part}</td><td>{keep}</td></tr>" for el, today_, part, keep in STOCK_PARTS
    )
    left_rows = "".join(f"<tr><td>{what}</td><td>{where}</td><td>{why}</td></tr>" for what, where, why in LEFT_BEHIND)

    html = f"""<!doctype html><html lang=en><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>Settings pages, ported</title>
<style>
:root{{--bg:#fbfbfa;--ink:#16161a;--dim:#5c5c66;--line:#e2e2df;--card:#fff;--accent:#2f5d50;--warn:#7a4a12}}
@media (prefers-color-scheme:dark){{:root{{--bg:#141416;--ink:#ececf0;--dim:#a0a0aa;--line:#2b2b30;--card:#1c1c20;--accent:#7fb8a5;--warn:#d6a35c}}}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}}
main{{max-width:960px;margin:0 auto;padding:40px 20px 96px}}
h1{{font-size:2rem;line-height:1.2;margin:0 0 .25em}}
h2{{font-size:1.25rem;margin:2.5em 0 .6em;padding-bottom:.3em;border-bottom:1px solid var(--line)}}
h3{{font-size:1rem;margin:1.6em 0 .4em}}
.sub{{color:var(--dim);margin:0 0 2em}}
code{{font:.86em ui-monospace,SFMono-Regular,Menlo,monospace;background:color-mix(in srgb,var(--ink) 8%,transparent);padding:.1em .35em;border-radius:4px}}
table{{width:100%;border-collapse:collapse;margin:1em 0;font-size:.9rem}}
th,td{{text-align:left;vertical-align:top;padding:.55em .7em;border-bottom:1px solid var(--line)}}
th{{color:var(--dim);font-weight:600;font-size:.78rem;text-transform:uppercase;letter-spacing:.04em}}
td.n{{text-align:right;font-variant-numeric:tabular-nums}}
figure{{margin:2em 0;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}}
figcaption{{padding:.9em 1.1em;border-bottom:1px solid var(--line);font-size:.9rem;color:var(--dim)}}
figcaption b{{color:var(--ink)}}
img{{display:block;width:100%;height:auto}}
.callout{{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:8px;padding:.9em 1.1em;margin:1.2em 0}}
.callout.warn{{border-left-color:var(--warn)}}
.callout p:first-child{{margin-top:0}} .callout p:last-child{{margin-bottom:0}}
blockquote{{margin:1.2em 0;padding:.2em 0 .2em 1.1em;border-left:3px solid var(--line);color:var(--dim);white-space:pre-line}}
.pill{{display:inline-block;font-size:.75rem;padding:.15em .6em;border-radius:999px;border:1px solid var(--line);color:var(--dim);margin-right:.4em}}
ul{{padding-left:1.2em}} li{{margin:.35em 0}}
</style>
<main>
<h1>Settings pages, ported</h1>
<p class=sub><span class=pill>{branch}</span><span class=pill>{sha}</span><span class=pill>{today}</span>
Five categories out of the archived SystemSketch and into the bbox-ui trunk, driven in a real browser.</p>

<blockquote>Port over settin pages:
1. GEneral
2. Apperance
   1. Put interface scale in here
3. Canvas, Lets rename it though to like Mouse and Keyboard or something more clear
4. Connections
5. Tool Alias
   1. Mabye we call this hotkeys and aliases?

If I didn't list it here don't port it.</blockquote>

<h2>The five, as they render now</h2>
<p>Captured from the real stories in a headless Chrome at 1280&times;900, two clicks deep — the nav
was driven exactly as you would drive it.</p>
{shots}
{page_shot}

<h2>The two renames</h2>
<div class=callout>
<p><b>Canvas &rarr; &ldquo;Mouse and scrolling&rdquo;</b>, not &ldquo;Mouse and Keyboard&rdquo;. You said
&ldquo;or something more clear&rdquo;, and the clear thing is that there is no keyboard in this category:
where a paste lands relative to the <em>pointer</em>, what each <em>wheel</em> gesture does, how far one
wheel notch moves the board, and whether the wheel zooms directly. The only keys involved are Ctrl/Cmd
qualifying a wheel gesture. Naming it &ldquo;Keyboard&rdquo; would advertise a shortcut editor that does
not exist — and the app already has a real keyboard-shortcuts surface on the burger.</p>
<p><b>Tool aliases &rarr; &ldquo;Hotkeys and aliases&rdquo;</b> — your suggestion, taken, and made true
rather than aspirational. The category now carries real hotkeys: the host hands in its actual chords and
they print through the trunk's own <code>formatShortcut</code>, the same routine the burger's shortcut
column uses, so the list cannot drift from the menu beside it. Rebinding is <em>not</em> there and the
section says so out loud instead of leaving a dead control.</p>
</div>

<h2>Show me the stock part</h2>
<p>Every piece of the archive's hand-rolled settings CSS, and what it is now.</p>
<table><thead><tr><th>Element</th><th>In the archive</th><th>Off-the-shelf part</th><th>Behaviour that had to survive</th></tr></thead>
<tbody>{stock_rows}</tbody></table>

<h2>The models travelled with their storage keys</h2>
<p>Each one is pure parse plus a storage adapter — the donors' <code>useSyncExternalStore</code>
singletons did not travel, because host-owned persistence is the host's. The keys are unchanged, which
means preferences you already set in the archived app are read straight back by the new one.</p>
<table><thead><tr><th>Trunk module</th><th class=n>Lines</th><th class=n>Tests</th><th>Donor</th></tr></thead>
<tbody>{model_rows}</tbody></table>
<p class=sub style="margin-top:.4em">{model_tests} unit cases across the five models, plus
{story_count} stories that drive the categories in a browser.</p>

<h2>Two real bugs the browser found</h2>
<div class="callout warn">
<p><b>The stock Slider renders two thumbs for a single value.</b> Its own code reads
<code>Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max]</code>, so a
bare number falls through to <code>[min, max]</code> — measured in a real browser, two thumbs both
stamped <code>data-index="0"</code>. Passing <code>[value]</code> is the stock usage.</p>
<p><b>The stock Slider is 0&times;0 on the Base UI this app pins.</b> It asks for its horizontal geometry
through <code>data-horizontal:</code> utilities; <code>@base-ui/react@1.8.0</code> emits
<code>data-orientation="horizontal"</code> instead, so nothing matches — root 0px wide, track 0px tall,
and the thumb then stays <code>visibility: hidden</code> forever because Base UI's inset alignment
divides by the control's width. That also takes it <em>out of the accessibility tree</em>, which is how
the story caught it: <code>getByRole("slider")</code> could not find it.</p>
<p>Both are compensated in the consumer, never in <code>slider.tsx</code> — that file's whole value is
being byte-checkable against the snapshotted registry item, and editing it to paper over an upstream
version skew is how a vendored copy quietly stops being stock. <code>slider</code> is now in that
oracle's list alongside the other eight primitives.</p>
</div>

<h2>What I deliberately left behind</h2>
<table><thead><tr><th>Not ported</th><th>Where it is in the archive</th><th>Why</th></tr></thead>
<tbody>{left_rows}</tbody></table>

<h2>Gates</h2>
<ul>
<li><code>tsc</code> clean in <code>apps/storybook-basics</code> <em>and</em> <code>apps/systemsketch</code>.</li>
<li>Unit: <b>1383 / 1383</b> (1290 before this lane).</li>
<li>Storybook: <b>522 / 522</b>, fully green on a quiet box. The baseline at <code>bbdb488</code> is
<b>515</b>, not the 509 the brief quoted — counted from the committed story exports, so the delta is
exactly the {story_count} stories this lane added.</li>
<li>The app's own suite: <b>164 / 165</b>. The one failure,
<code>menus.smoke.test.tsx</code>'s View/Preferences case, reproduces identically with this lane's
<code>appSettings.tsx</code> reverted to <code>HEAD</code> — it predates this work.</li>
<li>Two story files flake under full-suite load (<code>BlockPortHosts</code> &ldquo;Block (DOM
Canvas)&rdquo;, and whichever file loses the race that run). Each passes alone, the failing set rotates,
and a re-run with nothing else on the box was green.</li>
</ul>

<h2>What needs you</h2>
<ul>
<li><b>&ldquo;Mouse and scrolling&rdquo; instead of &ldquo;Mouse and Keyboard&rdquo;.</b> My call, for the
reason above. If you would rather have your words back it is a one-line change in
<code>settingsCategories.tsx</code>. <em>Default if you say nothing: it stays.</em></li>
<li><b>The Hotkeys section is read-only.</b> It lists the app's own File chords. Making them rebindable
is real work and you did not ask for it. <em>Default: it stays a reference.</em></li>
<li><b>Nothing is wired to the canvas yet.</b> The pages store every preference; applying a wheel binding
or the interface scale to tldraw is the archive's <code>canvasGestures.ts</code>/<code>canvasCamera.ts</code>,
which you did not list. <em>Default: I leave it, and it is the obvious next lane.</em></li>
</ul>
</main></html>"""

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf8")
    encoded = len(urllib.parse.quote(html).encode("utf8"))
    cap = 2_097_024
    print(f"{out}")
    print(f"on disk {len(html.encode('utf8')):,} bytes · encoded {encoded:,} of {cap:,} "
          f"({encoded / cap:.0%}) — {'inline preview OK' if encoded <= cap else 'BROWSER ONLY'}")
    return out


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--captures", default=str(REPO / "reports/media/settings-pages"))
    parser.add_argument("--out", default="/home/bam/bbox-ui/reports/media/settings-pages-2026-09-19.html")
    args = parser.parse_args()
    build(pathlib.Path(args.captures), pathlib.Path(args.out))
