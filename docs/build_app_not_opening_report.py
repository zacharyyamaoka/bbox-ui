#!/usr/bin/env python3
"""Build the report for "the bbox-ui app does not open" — self-contained HTML.

Every capture in here came off a real run: the hero clip is x11grab of the
headless launch on its own Xvfb, the journal lines are `journalctl --user`
verbatim, and the mutation matrix is the recorded pass/fail of running the
suite with each guard removed.

Usage:
    python3 docs/build_app_not_opening_report.py --media <dir> --out <file.html>

`--media` holds headless.mp4, headless.gif, headless-still.png, filmstrip.png
and pyblocks-headless.png. The report inlines all of them, so it opens offline
and survives being moved.
"""

from __future__ import annotations

import argparse
import base64
import html
from pathlib import Path

REPORT_TITLE = "The dock icon opens a window — or says why not"
SUBTITLE = "bbox-ui · 2026-09-23 · the shared Chrome singleton, and why agents now run headless"


def data_uri(path: Path, media_type: str) -> str:
    return f"data:{media_type};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


JOURNAL = """\
2026-09-23T08:28:00  systemd: Started app-gnome-systemsketch-880118.scope
2026-09-23T08:28:00  systemsketch.desktop[880118]: SystemSketch (new): 75c5aa7b0 — …
2026-09-23T08:28:00  systemsketch.desktop[880118]: http://127.0.0.1:4341/
2026-09-23T08:31:24  systemd: app-gnome-systemsketch-880118.scope: Consumed 30.062s CPU time.
2026-09-23T08:31:26  systemd: Started app-gnome-systemsketch-893629.scope
2026-09-23T08:31:27  systemsketch.desktop[893629]: SystemSketch (new): 75c5aa7b0 — …
2026-09-23T08:31:27  systemsketch.desktop[893629]: http://127.0.0.1:4341/
2026-09-23T08:31:29  systemd: Started app-gnome-bbox\\x2dui-893995.scope
2026-09-23T08:31:29  bbox-ui.desktop[893995]: SystemSketch (new): 75c5aa7b0 — …
2026-09-23T08:31:29  bbox-ui.desktop[893995]: http://127.0.0.1:4341/
2026-09-23T08:31:37  systemd: app-gnome-systemsketch-893629.scope: Consumed 2.737s CPU time."""

FORWARD = """\
$ google-chrome-stable --app=http://127.0.0.1:4341/ --class=systemsketch \\
    --user-data-dir=~/.local/state/systemsketch/desktop-v2/stable/browser-profile \\
    --no-first-run --no-default-browser-check --remote-debugging-port=4325
Opening in existing browser session.
$ echo $?
0"""

CMDLINE = """\
# what the textbook read gives you for a LIVE Chrome browser
>>> open('/proc/1040938/cmdline','rb').read().decode().split('\\0')
['/opt/google/chrome/chrome --app=http://127.0.0.1:43909/ --class=systemsketch …']
                                                            ^ one element, not thirty

>>> profile_holders(profile)        # every `--flag in argv` test answers False
[]                                  # …against a browser that is demonstrably holding it"""

SUITE = """\
$ python3 -m pytest scripts/tests/ -q
...........................................................................
203 passed in 40.79s

$ python3 -m pytest scripts/tests/test_window_guard_integration.py -v
test_a_press_opens_on_the_display_that_asked   PASSED
test_headless_never_touches_the_shared_profile PASSED
test_the_bug_is_real                           PASSED
3 passed in 3.61s"""

MUTATIONS = [
    ("<code>focus_open_window</code> skips the window check", "the shipped behaviour — a foreign page answers the press",
     "test_focus_refuses_a_page_owned_by_another_display <i>and</i> the end-to-end integration test"),
    ("<code>launch_profile</code> always returns the shared profile", "the press is forwarded to the hidden browser",
     "test_launch_profile_steps_aside_for_a_foreign_holder"),
    ("<code>headless_command</code> uses the shared profile / port", "an agent's run becomes the browser that swallows the press",
     "test_the_headless_command_never_names_the_shared_profile_or_port"),
    ("<code>clear_stale_singletons</code> ignores live holders", "two browsers share one profile and corrupt it",
     "test_it_never_clears_a_lock_a_live_browser_holds"),
]

CHANGES = [
    ("Is this browser mine?",
     "Never asked. Any page on the URL counted, wherever it lived.",
     "<code>app_window_pids()</code> — does it own a window on <i>this</i> display?",
     "A window already open still gets raised, not duplicated."),
    ("A profile held elsewhere",
     "Chrome forwarded the press to it and exited 0.",
     "<code>launch_profile()</code> steps aside to a sibling profile.",
     "The shared profile stays the default, so the ☰ <i>Switch to old SystemSketch</i> row keeps its storage."),
    ("The DevTools port",
     "Fixed 4325, shared with the archived app's stable channel.",
     "<code>launch_cdp_port()</code> yields it to a foreign owner and takes a free one.",
     "Still 4325 in the normal case, so window-finding is unchanged."),
    ("A lock with no process",
     "Blocked every launch until someone deleted it by hand.",
     "<code>clear_stale_singletons()</code> — but only with zero live holders.",
     "A live mutex is never touched."),
    ("A press that opened nothing",
     "Printed the URL and exited 0. Silent.",
     "<code>confirm_window()</code> polls, then <code>notify-send</code>.",
     "A dock icon finally has an error surface."),
    ("How an agent opens the app",
     "The same visible window, on the same shared profile.",
     "<code>--headless</code> — private Xvfb, throwaway profile, free port.",
     "The visible path is untouched; headless is additive."),
    ("Everything else in the launcher",
     "— <b>unchanged (stock seam)</b> —",
     "<code>ensure_server</code>, <code>build_stable</code>, <code>--update</code>, <code>--old</code>, file routing, the dock icon refresh",
     "The pinned-build contract and the .desktop file are exactly as they were."),
]


def page(media: dict[str, str]) -> str:
    rows = "\n".join(
        f"<tr><td>{was}</td><td class=bad>{before}</td><td class=good>{after}</td><td class=keep>{keep}</td></tr>"
        for was, before, after, keep in CHANGES
    )
    mutation_rows = "\n".join(
        f"<tr><td>{what}</td><td class=bad>{effect}</td><td class=good>{caught}</td></tr>"
        for what, effect, caught in MUTATIONS
    )
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(REPORT_TITLE)}</title>
<style>
  :root {{
    --bg:#0e1116; --panel:#161b22; --line:#262d38; --ink:#e6edf3; --dim:#9aa7b4;
    --accent:#7ee787; --bad:#ff7b72; --warn:#e3b341; --link:#79c0ff;
    --mono:"SFMono-Regular",ui-monospace,Menlo,Consolas,monospace;
  }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; background:var(--bg); color:var(--ink);
    font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif; }}
  .wrap {{ max-width:1000px; margin:0 auto; padding:56px 16px 96px; }}
  h1 {{ font-size:34px; line-height:1.2; margin:0 0 8px; letter-spacing:-.02em; }}
  h2 {{ font-size:22px; margin:56px 0 14px; letter-spacing:-.01em;
        padding-bottom:8px; border-bottom:1px solid var(--line); }}
  h3 {{ font-size:16px; margin:28px 0 8px; color:var(--dim); text-transform:uppercase;
        letter-spacing:.09em; font-weight:600; }}
  .sub {{ color:var(--dim); margin:0 0 34px; font-size:15px; }}
  p {{ margin:0 0 14px; }}
  a {{ color:var(--link); }}
  .verdict {{ background:var(--panel); border:1px solid var(--line); border-left:4px solid var(--accent);
    border-radius:10px; padding:20px 22px; margin:0 0 30px; }}
  .verdict p:last-child {{ margin-bottom:0; }}
  .verdict b {{ color:var(--accent); }}
  figure {{ margin:22px 0; }}
  video, img {{ max-width:100%; border-radius:10px; border:1px solid var(--line); display:block; }}
  figcaption {{ color:var(--dim); font-size:13.5px; margin-top:9px; }}
  pre {{ background:#0a0d12; border:1px solid var(--line); border-radius:9px; padding:15px 17px;
    overflow-x:auto; font-family:var(--mono); font-size:12.8px; line-height:1.55; color:#cdd9e5; }}
  pre b {{ color:var(--bad); font-weight:600; }}
  pre i {{ color:var(--accent); font-style:normal; }}
  table {{ width:100%; border-collapse:collapse; margin:18px 0; font-size:14.2px; }}
  th,td {{ text-align:left; padding:11px 12px; border-bottom:1px solid var(--line); vertical-align:top; }}
  th {{ color:var(--dim); font-size:12px; text-transform:uppercase; letter-spacing:.08em; }}
  td.bad {{ color:#ffb4ae; }} td.good {{ color:#a5e8ad; }} td.keep {{ color:var(--dim); }}
  code {{ font-family:var(--mono); font-size:12.8px; background:#0a0d12;
    border:1px solid var(--line); border-radius:5px; padding:1px 5px; }}
  .quote {{ border-left:3px solid var(--warn); padding:2px 0 2px 16px; margin:18px 0;
    color:#e8d9a8; font-style:italic; }}
  .cols {{ display:grid; grid-template-columns:1fr 1fr; gap:18px; }}
  @media (max-width:760px) {{ .cols {{ grid-template-columns:1fr; }} }}
  .decide li {{ margin-bottom:11px; }}
  .tag {{ display:inline-block; font-size:11px; letter-spacing:.07em; text-transform:uppercase;
    padding:2px 8px; border-radius:20px; border:1px solid var(--line); color:var(--dim); margin-left:8px; }}
  .tag.done {{ color:var(--accent); border-color:#1d4429; background:#0d1f14; }}
  .tag.open {{ color:var(--warn); border-color:#4a3c12; background:#1d180a; }}
  svg text {{ font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }}
</style></head>
<body><div class="wrap">

<h1>{html.escape(REPORT_TITLE)}</h1>
<p class="sub">{html.escape(SUBTITLE)}</p>

<div class="verdict">
<p><b>Fixed, and the fix is pinned by a test that reproduces the failure against real Chrome.</b>
The icon was not broken by the server or the <code>.desktop</code> file. The app window's Chrome
<code>--user-data-dir</code> and <code>--remote-debugging-port</code> are <b>machine-wide mutexes</b>,
shared with the archived app by design — and therefore with every agent session on this box. Any
other Chrome holding either one absorbed your press: the window opened on <i>its</i> display, and the
launcher printed the URL and exited 0.</p>
<p>So <b>my own headless runs were part of what kept it dead</b> while I investigated, which is
exactly why you now get <code>--headless</code> in both repos and a rule in both CLAUDE.mds.</p>
</div>

<h2>The change, in one flow</h2>
<figure>
  <video autoplay loop muted playsinline poster="{media['still']}">
    <source src="{media['mp4']}" type="video/mp4">
    <img src="{media['gif']}" alt="The headless launch: an empty virtual display, then the whiteboard.">
  </video>
  <figcaption><b>The new <code>--headless</code> path, recorded off the virtual display it creates.</b>
  Black frame → Chrome window → the real whiteboard, then it tears itself down. Nothing appears on
  your screen and nothing touches the profile your dock icon needs.</figcaption>
</figure>
<figure>
  <img src="{media['strip']}" alt="Four frames: empty display, then the app painted, three times.">
  <figcaption>The same clip as stills — t=0s empty, then the chrome bar, tool dock and zoom control.
  ffmpeg <code>x11grab</code> of the Xvfb, not a mock.</figcaption>
</figure>

<h2>What was actually happening</h2>
<p>Your presses are all in the journal. Each one starts a scope, prints the URL, and ends with no
window — and <code>08:31:26</code> and <code>08:31:29</code> are three seconds apart, which is the
double-press of someone pressing an icon that did nothing the first time.</p>
<pre>{html.escape(JOURNAL)}</pre>
<p>The mechanism, reproduced verbatim at the shell while another Chrome held the profile:</p>
<pre>{html.escape(FORWARD)}</pre>
<p>Chrome does not fail when the profile is taken. It hands its command line to the holder and
exits <b>zero</b>. There were two independent ways in:</p>

<figure>
<svg viewBox="0 0 960 330" width="100%" role="img" aria-label="Two ways a dock press was swallowed">
  <defs>
    <marker id="a" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
      <path d="M0,0 L9,4.5 L0,9 z" fill="#ff7b72"/></marker>
    <marker id="g" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
      <path d="M0,0 L9,4.5 L0,9 z" fill="#7ee787"/></marker>
  </defs>
  <rect x="16" y="130" width="150" height="62" rx="9" fill="#161b22" stroke="#262d38"/>
  <text x="91" y="156" fill="#e6edf3" font-size="14" text-anchor="middle">dock press</text>
  <text x="91" y="175" fill="#9aa7b4" font-size="11.5" text-anchor="middle">bbox-ui.desktop</text>

  <rect x="250" y="26" width="240" height="86" rx="9" fill="#1d1114" stroke="#5a2b2b"/>
  <text x="370" y="50" fill="#ff7b72" font-size="13" text-anchor="middle">1 · profile mutex</text>
  <text x="370" y="70" fill="#cdd9e5" font-size="11.5" text-anchor="middle">another Chrome holds</text>
  <text x="370" y="86" fill="#cdd9e5" font-size="11.5" text-anchor="middle">--user-data-dir</text>
  <text x="370" y="103" fill="#9aa7b4" font-size="11" text-anchor="middle">“Opening in existing browser session”</text>

  <rect x="250" y="210" width="240" height="86" rx="9" fill="#1d1114" stroke="#5a2b2b"/>
  <text x="370" y="234" fill="#ff7b72" font-size="13" text-anchor="middle">2 · DevTools port</text>
  <text x="370" y="254" fill="#cdd9e5" font-size="11.5" text-anchor="middle">another Chrome owns :4325</text>
  <text x="370" y="271" fill="#cdd9e5" font-size="11.5" text-anchor="middle">its page gets “activated”</text>
  <text x="370" y="288" fill="#9aa7b4" font-size="11" text-anchor="middle">launcher opens nothing at all</text>

  <rect x="590" y="118" width="230" height="86" rx="9" fill="#1d1114" stroke="#5a2b2b"/>
  <text x="705" y="145" fill="#ff7b72" font-size="13" text-anchor="middle">window opens elsewhere</text>
  <text x="705" y="165" fill="#cdd9e5" font-size="11.5" text-anchor="middle">an agent's hidden Xvfb</text>
  <text x="705" y="184" fill="#9aa7b4" font-size="11" text-anchor="middle">exit 0 · nothing to show you</text>

  <path d="M166,150 C205,150 210,72 246,72" stroke="#ff7b72" fill="none" stroke-width="1.6" marker-end="url(#a)"/>
  <path d="M166,174 C205,174 210,250 246,250" stroke="#ff7b72" fill="none" stroke-width="1.6" marker-end="url(#a)"/>
  <path d="M490,72 C540,72 545,150 586,155" stroke="#ff7b72" fill="none" stroke-width="1.6" marker-end="url(#a)"/>
  <path d="M490,250 C540,250 545,178 586,172" stroke="#ff7b72" fill="none" stroke-width="1.6" marker-end="url(#a)"/>

  <rect x="590" y="26" width="230" height="62" rx="9" fill="#0d1f14" stroke="#1d4429"/>
  <text x="705" y="52" fill="#7ee787" font-size="13" text-anchor="middle">now: a window here</text>
  <text x="705" y="71" fill="#9aa7b4" font-size="11" text-anchor="middle">or a notification saying why not</text>
  <path d="M846,155 C890,155 900,80 826,58" stroke="#7ee787" fill="none" stroke-width="1.6"
        stroke-dasharray="5 4" marker-end="url(#g)"/>
  <text x="884" y="118" fill="#7ee787" font-size="10.5" text-anchor="middle">the fix</text>
</svg>
<figcaption>Both paths ended in <code>exit 0</code>, and a dock icon has no terminal — so neither
could ever have told you anything.</figcaption>
</figure>

<h2>What changed</h2>
<table>
<tr><th style="width:19%">Element</th><th style="width:26%">Before</th><th style="width:29%">After</th>
<th style="width:26%">Behaviour that must survive</th></tr>
{rows}
</table>

<h2>Two traps that cost real time — both now recorded at the seam</h2>
<p>The integration test caught a bug in my <i>own</i> fix that review would not have. Chrome rewrites
its process title, and that rewrite eats both its argv separators and its environment block:</p>
<pre>{html.escape(CMDLINE)}</pre>
<p>The second trap follows from the first: <code>/proc/&lt;pid&gt;/environ</code> for a live Chrome
reads back with no <code>DISPLAY</code> at all. The <code>/proc/net/unix</code> route is a dead end
too — only the <i>server</i> side of an X connection carries the <code>@/tmp/.X11-unix/X&lt;n&gt;</code>
name, so a browser's own socket never matches. The answer is to ask the display which windows exist,
which is what <code>app_window_pids()</code> does. All three findings are written into
<code>launch_systemsketch.py</code> so nobody re-walks them.</p>

<h2>Proof</h2>
<pre>{html.escape(SUITE)}</pre>
<h3>Every guard mutation-tested red</h3>
<table>
<tr><th style="width:31%">Mutation</th><th style="width:33%">What it restores</th><th>Caught by</th></tr>
{mutation_rows}
</table>
<p><code>test_the_bug_is_real</code> pins Chrome's forwarding behaviour itself, so if a future Chrome
stops forwarding, the suite says so instead of quietly guarding nothing.</p>

<h2>Headless, in both repos</h2>
<div class="quote">“why do you keep on opening the application? its distrbuting me while I work.
can You test it headless?” — you, mid-session, while I was doing exactly that</div>
<p>Fair, and it was worse than an interruption: a visible agent launch <i>is</i> the bug. Both
launchers now take <code>--headless</code>, each with its own virtual display, throwaway Chrome
profile and free port, so an agent's check can no longer be the browser that swallows your press.</p>
<div class="cols">
<figure>
  <img src="{media['still']}" alt="bbox-ui rendered on a private virtual display.">
  <figcaption><b>bbox-ui</b> — <code>launch_systemsketch.py --headless --screenshot …</code>.
  Verified, cleans up after itself.</figcaption>
</figure>
<figure>
  <img src="{media['pyblocks']}" alt="pyblocks rendered headlessly, still showing its loading pill.">
  <figcaption><b>pyblocks</b> — works and cleans up, but its capture lands
  <i>mid-load</i>: <code>readyState</code> fires before the board paints. Sent back to close that.</figcaption>
</figure>
</div>

<h2>Where it stands</h2>
<ul class="decide">
<li><b>bbox-ui — done and proved</b> <span class="tag done">committed, not merged</span><br>
Branch <code>claude/bbox-app-not-opening-b62874</code>, commit <code>5842377</code>. 203 launcher tests
green, four guards mutation-tested red, the failure reproduced end to end against real Chrome.</li>
<li><b>pyblocks — done, one gap being closed</b> <span class="tag open">in flight</span><br>
Branch <code>claude/launcher-headless-mode</code>, commit <code>6ac51d1</code>. I re-ran its 16 tests
and drove its headless mode myself rather than take its word for it. It works; the screenshot lands
mid-load, and it is back with the agent to wait for a real readiness signal.</li>
<li><b>Needs you: whether to land it.</b> Your dock icon runs the launcher in the
<i>main checkout</i>, so it still has the old one. Implementing is not integrating, so I left both
branches where they are. <b>If you say nothing I will leave them unmerged</b> — nothing regresses,
and the icon works whenever no stray Chrome holds the profile (nothing does right now).</li>
<li><b>Deliberately not done.</b> I did not touch the two duplicate dock entries —
<code>bbox-ui.desktop</code> and <code>systemsketch.desktop</code> run the identical <code>Exec</code>
and declare the same <code>StartupWMClass</code>, so they are two icons for one app. That is a
separate call about what you want in the dock, not a bug fix. I also left the archived app's own
launcher alone; it still takes the shared profile and port, which is now survivable rather than
fatal.</li>
</ul>

</div></body></html>
"""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--media", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    arguments = parser.parse_args()
    media = {
        "mp4": data_uri(arguments.media / "headless.mp4", "video/mp4"),
        "gif": data_uri(arguments.media / "headless.gif", "image/gif"),
        "still": data_uri(arguments.media / "headless-still.png", "image/png"),
        "strip": data_uri(arguments.media / "filmstrip.png", "image/png"),
        "pyblocks": data_uri(arguments.media / "pyblocks-headless.png", "image/png"),
    }
    arguments.out.parent.mkdir(parents=True, exist_ok=True)
    arguments.out.write_text(page(media), encoding="utf8")
    size = arguments.out.stat().st_size
    print(f"{arguments.out} — {size:,} bytes ({size / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
