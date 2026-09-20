#!/usr/bin/env python3
"""docs/build_host_less_shell_work_order_report.py — the readable face of the work order.

`docs/WORK-ORDER-HOST-LESS-SHELL.md` is the lane-readable input another agent
executes from a commit. This builds the page Zach reads and hands over: the
kickoff prompt to paste, the phases at a glance, the open items with verdict
buttons and one Copy button, and the full order rendered below.

    python3 docs/build_host_less_shell_work_order_report.py

Output: /home/bam/bbox-ui/reports/host-less-shell-work-order-2026-09-19.html
(the MAIN checkout's reports/, by absolute path). Text only, so it is the tracked
half of reports/ — but it is also listed in the clone's .git/info/exclude so a
peer's `git stash -u` cannot take it while it is uncommitted there.
"""
from __future__ import annotations

import html
import re
import subprocess
import sys
from pathlib import Path

import markdown

DOCS = Path(__file__).resolve().parent
REPO = DOCS.parent
sys.path.insert(0, str(DOCS))
import build_host_less_shell_report as base  # noqa: E402  (its CSS/JS; importing only measures, never writes)

ORDER = REPO / "docs" / "WORK-ORDER-HOST-LESS-SHELL.md"
OUT = Path("/home/bam/bbox-ui/reports/host-less-shell-work-order-2026-09-19.html")
BRANCH = "claude/library-vs-host-rule-2026-09-19"


def tip() -> str:
    return subprocess.run(["git", "-C", str(REPO), "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()


def kickoff(sha: str) -> str:
    return f"""You are executing an approved work order for bbox-ui: the host-less shell migration.

The order is self-contained and you have no other context. Read it first:
  git -C /home/bam/bbox-ui show {BRANCH}:docs/WORK-ORDER-HOST-LESS-SHELL.md
Base your worktree on branch {BRANCH} (tip {sha} when this was written), unless that branch has since merged to main.

Your first moves:
1. Read section 0's four items, then the whole order.
2. Start P0 (the contract barrier) and P2 (open simple-reactflow-whiteboard). They are independent and can run in parallel.
3. Do NOT start P1 until its gate command (section 6) prints nothing. Five live lanes are editing chrome today.
4. Commit each phase's acceptance tests RED, in their own commit, before any implementation.

Rules: commit to branches only. No merge to main, no push (simple-reactflow-whiteboard is a public repo), no rename of apps/systemsketch, do not touch the live lanes' branches or worktrees, never `git add -A`.

Hand over with a rich-media report, an Open-it table and a decision packet (section 8)."""


PHASES = [
    ("P0", "Contract barrier", "now", "new <code>shell/</code>, new <code>apps/bbox-no-host</code>, one line in the wall test and the workspace file",
     "port + fake host + a contract suite that goes <em>red</em> on three broken fakes; the wall test goes red on a tldraw import", "the port needs a tldraw-only verb, or grows by more than ~12 methods"),
    ("P2", "Open the whiteboard", "now — its own repo, in parallel", "<code>/home/bam/simple-reactflow-whiteboard</code> on a new branch; <strong>no push</strong>",
     "its 19 tests pass unchanged; a consumer registers a custom tool; undo/redo and duplicate work", "<code>src/</code> passes 2,000 lines (954 today)"),
    ("P1", "Lift chrome behind the port", "the gate command prints nothing (five lanes today) and P0 has landed", "<code>shell/</code>, <code>chrome/</code>, <code>main.tsx</code>, <code>App.tsx</code>, a new tldraw adapter",
     "every existing suite equal or higher; the contract suite green on tldraw; a <em>measured</em> real-browser journey; pointer pass-through", "any behaviour change is needed"),
    ("P3", "The React Flow host", "P0 + P1 + P2 are done", "new <code>apps/bbox-reactflow</code>",
     "contract green on React Flow; anchor nodes filtered out of the scene; unsupported affordances hidden", "host glue passes ~1,500 lines"),
]

NEEDS = [
    ("N1", "Rename apps/systemsketch → apps/bbox-tldraw?", "Out of scope in this order. If yes: one barrier commit after P1's gate opens.", "No rename."),
    ("N2", "The shell as a trunk kit shell/ + a thin apps/bbox-no-host (not a packages/ dir)?", "Yes — it reuses the @trunk alias and adds no npm surface. A directory move if you disagree.", "As stated."),
    ("N3", "Merge the host-rule branch to main first?", "Yes. It is docs and report builders only, and it merges cleanly into main today; it puts this order and the host rule in every lane's worktree.", "The executor bases on that branch; you merge when you like."),
    ("N4", "Push simple-reactflow-whiteboard (public) once P2 lands?", "Needed before P3 can pin by commit. Your call — it is public.", "Not pushed. P3 uses a dev-only file: reference until you do."),
    ("N5", "Are any of the five gating lanes dead?", "Naming them lets P1 start sooner. Otherwise P1 waits for the gate command to print nothing.", "P1 waits."),
]


def render_order() -> str:
    text = ORDER.read_text()
    body = markdown.markdown(text, extensions=["tables", "fenced_code", "sane_lists"])
    body = re.sub(r"<h1>.*?</h1>", "", body, count=1, flags=re.S)  # the page has its own title
    for level in (4, 3, 2):  # demote so the page hierarchy stays h1 > h2 > h3
        body = body.replace(f"<h{level}>", f"<h{level + 1}>").replace(f"</h{level}>", f"</h{level + 1}>")
    # Tables scroll inside their own box on a phone instead of widening the page.
    body = body.replace("<table>", '<div class="wrap"><table>').replace("</table>", "</table></div>")
    return body


def phases_table() -> str:
    rows = "".join(
        f"<tr><th>{pid}<br><span class='dim'>{html.escape(name)}</span></th><td>{start}</td><td>{writes}</td><td>{proves}</td><td>{stop}</td></tr>"
        for pid, name, start, writes, proves, stop in PHASES
    )
    return ("<div class='wrap'><table><thead><tr><th>Phase</th><th>Starts when</th><th>Writes</th><th>Proved by</th><th>Stops if</th></tr></thead>"
            f"<tbody>{rows}</tbody></table></div>")


def needs_cards() -> str:
    out = []
    for nid, question, rec, default in NEEDS:
        out.append(f"""
<section class="decision" data-id="{nid}" data-title="{html.escape(question)}">
  <h3><span class="did">{nid}</span> {html.escape(question)}</h3>
  <p class="rec"><strong>Recommendation:</strong> {html.escape(rec)}</p>
  <p class="def"><strong>If you say nothing:</strong> {html.escape(default)}</p>
  <div class="verdicts" role="group" aria-label="{nid} verdict"><button type="button" data-v="Approve">Approve</button><button type="button" data-v="Change">Change</button><button type="button" data-v="Reject">Reject</button></div>
  <textarea placeholder="Note on {nid} (optional)" rows="2"></textarea>
</section>""")
    return "\n".join(out)


EXTRA_CSS = """
.prompt{width:100%;min-height:290px;font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;background:#0f1419;color:#e6e6e6;border:0;border-radius:8px;padding:14px;resize:vertical}
.bar2{display:flex;gap:12px;align-items:center;margin:10px 0 0;flex-wrap:wrap}.bar2 button{font:inherit;font-weight:600;padding:8px 16px;background:var(--accent);color:#fff;border:0;border-radius:6px;cursor:pointer}
.copybar{position:static;border-top:0;padding-top:4px}
.callout{background:#fef7e0;border-left:4px solid #f9ab00;padding:12px 16px;border-radius:0 8px 8px 0;margin:14px 0}
.wo h3{border-top:1px solid var(--line);padding-top:14px;margin-top:34px}.wo pre{background:#0f1419;color:#e6e6e6;padding:14px;border-radius:8px;overflow-x:auto;font-size:13px}.wo pre code{background:none;padding:0;color:inherit;overflow-wrap:normal}
.wo table{font-size:13.5px}.wo td:first-child code,.wo th:first-child code{white-space:nowrap;overflow-wrap:normal}.wo blockquote{border-left:3px solid var(--line);margin:10px 0;padding:0 14px;color:#3c4043}
"""

PAGE_JS = """
(function(){
  var p=document.getElementById('prompt'),s=document.getElementById('pstatus');
  document.getElementById('copyprompt').addEventListener('click',function(){
    p.focus();p.select();
    var done=function(ok){s.textContent=ok?'Copied — paste it into the other agent.':'Clipboard blocked on this page — the prompt is selected; press Ctrl+C.'};
    try{ if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(p.value).then(function(){done(true)},function(){done(false)});return;} }catch(e){}
    try{ done(document.execCommand('copy')); }catch(e){ done(false); }
  });
  p.addEventListener('focus',function(){p.select()});
})();
"""


def page() -> str:
    sha = tip()
    js = base.JS.replace("# Answers — host-less shell (2026-09-19)", "# Answers — host-less shell work order (2026-09-19)")
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Work order — host-less shell</title><style>{base.CSS}{EXTRA_CSS}</style></head>
<body><main>
<h1>Work order: the host-less shell</h1>
<p class="lede dim">Approved by you 2026-09-19 (D1–D5, all Approve). Written so another agent can run it with none of this conversation. Nothing is started.</p>

<div class="tldr"><strong>What it says</strong>
<ul>
<li><strong>Build a shell</strong> — every window, with the whiteboard as a swappable background — that a tldraw host and a React Flow host both drop into through one contract, <code>HostPort</code>.</li>
<li><strong>Four phases.</strong> P0 (the contract) and P2 (open the whiteboard) start now, in parallel. P1 (lift chrome) waits on a mechanical gate. P3 (the React Flow host) waits on all three.</li>
<li><strong>Every phase commits its acceptance tests red first</strong>, has a stop rule, and is proved in a real browser. Nothing merges, nothing is pushed, nothing is renamed.</li>
</ul></div>
<div class="callout"><strong>One correction to what you approved.</strong> D4 was worded around "two lanes". Measured afterwards, <strong>five</strong> live branches touch chrome, <code>main.tsx</code> or <code>App.tsx</code>, so the gate is now a command that prints the offenders, not a list of names. And the no-host app's windows arrive in P1, not P0 — building them sooner would fork wiring those lanes are still editing. The report you approved has been corrected to match.</div>

<h2>Hand it over</h2>
<p>Paste this into the other agent. It points at the work order on branch <code>{BRANCH}</code> (tip <code>{sha}</code>).</p>
<textarea id="prompt" class="prompt" readonly aria-label="Kickoff prompt for the other agent">{html.escape(kickoff(sha))}</textarea>
<div class="bar2"><button id="copyprompt" type="button">Copy prompt</button><span id="pstatus" class="dim" role="status"></span></div>

<h2>The phases at a glance</h2>
{phases_table()}
<p class="dim">P0 ∥ P2 → P1 → P3. P0 and P2 touch different files in different repos.</p>

<h2>Needs you</h2>
<p class="dim">Each has my recommendation and the default taken if you say nothing, so ignoring this is free. Press a verdict, add a note, then Copy — it names each item by number and title.</p>
{needs_cards()}
<div class="copybar"><button id="copy" type="button">Copy answers</button><span id="status" class="dim" role="status"></span></div>
<textarea id="out" aria-label="Answers to copy" readonly></textarea>

<h2>The work order, in full</h2>
<p class="dim">Rendered from <code>docs/WORK-ORDER-HOST-LESS-SHELL.md</code> — the file the other agent reads.</p>
<div class="wo">{render_order()}</div>
</main><script>{js}{PAGE_JS}</script></body></html>
"""


if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(page())
    print(f"wrote {OUT} ({OUT.stat().st_size:,} bytes)")
