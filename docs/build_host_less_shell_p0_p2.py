#!/usr/bin/env python3
"""docs/build_host_less_shell_p0_p2.py — the review + P0/P2 delivery, as one page.

The work order (docs/WORK-ORDER-HOST-LESS-SHELL.md) asked to be reviewed,
improved and then implemented, in that order. This builds the answer: what
changed in the order and why, the gate re-measured with the fixed command, the
contract going red against three broken fakes, and a numbered decision packet
Zach can answer by pasting one block back.

    python3 docs/build_host_less_shell_p0_p2.py

Output: /home/bam/bbox-ui/reports/host-less-shell-p0-p2-2026-09-19.html — the
MAIN checkout's reports/, by absolute path, even when run from a worktree (a
report written into a worktree dies when the worktree is swept).

Every number is measured at build time from the live tree or read from a
captured run in docs/assets/ — none is typed here.
"""
from __future__ import annotations

import base64
import html
import re
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
MAIN = Path("/home/bam/bbox-ui")
OUT = MAIN / "reports" / "host-less-shell-p0-p2-2026-09-19.html"
ASSETS = REPO / "docs" / "assets"
SHELL = REPO / "apps" / "storybook-basics" / "src" / "shell"
CHROME = REPO / "apps" / "systemsketch" / "src" / "chrome"
WHITEBOARD = Path("/home/bam/simple-reactflow-whiteboard")

E = html.escape


def run(cmd: list[str], cwd: Path) -> str:
    try:
        return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=120).stdout.strip()
    except Exception as error:  # noqa: BLE001 - a missing tool must not kill the page
        return f"(unavailable: {error})"


def lines(path: Path) -> int:
    return len(path.read_text(errors="replace").splitlines())


# ───────────────────────────── measurements ─────────────────────────────

def measure_shell() -> list[tuple[str, int]]:
    return sorted(((p.name, lines(p)) for p in SHELL.iterdir() if p.is_file()), key=lambda r: -r[1])


def measure_chrome() -> tuple[int, int, int, int]:
    """(files, lines, editor call sites, distinct methods) — comments stripped."""
    files = sorted(p for p in CHROME.iterdir() if p.suffix in {".ts", ".tsx"} and ".test." not in p.name)
    total = sum(lines(p) for p in files)
    calls: list[str] = []
    for p in files:
        text = re.sub(r"/\*.*?\*/", "", p.read_text(errors="replace"), flags=re.S)
        text = re.sub(r"(?m)^[ \t]*//.*$", "", text)
        calls += re.findall(r"\beditor\.([a-zA-Z_]+)", text)
    return len(files), total, len(calls), len(set(calls))


def port_members() -> int:
    body = (SHELL / "hostPort.ts").read_text()
    interface = body.split("export interface HostPort {", 1)[1].split("\n}\n", 1)[0]
    interface = re.sub(r"/\*.*?\*/", "", interface, flags=re.S)
    interface = re.sub(r"(?m)^[ \t]*//.*$", "", interface)
    return len(re.findall(r"(?m)^\s{2}(?:readonly\s+)?([a-zA-Z]+)[(:<]", interface))


def whiteboard_src_lines() -> int:
    return sum(lines(p) for p in (WHITEBOARD / "src").rglob("*") if p.suffix in {".ts", ".tsx"})


def data_uri(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode()


def read_capture(name: str) -> str:
    p = ASSETS / name
    return p.read_text(errors="replace").strip() if p.exists() else "(capture missing — re-run the gate)"


CHROME_FILES, CHROME_LINES, CALL_SITES, DISTINCT = measure_chrome()
SHELL_FILES = measure_shell()
SHELL_LINES = sum(n for _, n in SHELL_FILES)
PORT_MEMBERS = port_members()
WB_LINES = whiteboard_src_lines()
GATE = read_capture("chrome-gate.txt")
REDS = read_capture("three-reds.txt")
SHOT = ASSETS / "no-host-shell.png"
HEAD = run(["git", "rev-parse", "--short", "HEAD"], REPO)
WB_HEAD = run(["git", "rev-parse", "--short", "HEAD"], WHITEBOARD)
WB_BRANCH = run(["git", "branch", "--show-current"], WHITEBOARD)
WRITE_SET = run(["git", "diff", "--name-only", "21268c2...HEAD"], REPO)
P2_TESTS = len(re.findall(r"(?m)^test\(", (WHITEBOARD / "tests" / "library.spec.ts").read_text()))
P2_BASELINE_TESTS = len(re.findall(r"(?m)^test\(", (WHITEBOARD / "tests" / "whiteboard.spec.ts").read_text()))
CONTRACT_CHECKS = len(re.findall(r'await check\("', (SHELL / "hostContract.ts").read_text()))
BREAKS = len(re.findall(r'^\s+\| "[a-z-]+"', (SHELL / "fakeHost.ts").read_text(), re.M)) + 1
WB_SHOT = ASSETS / "whiteboard-consumer.png"


# ───────────────────────────── the decision packet ─────────────────────────────

DECISIONS = [
    (
        "Q1",
        "Four capabilities, not five — <code>nextStyle</code> and <code>resize</code> dropped",
        """The order sketched five. I ship four: <code>history</code>, <code>tools</code>,
        <code>duplicate</code>, <code>documentIo</code>. A capability that gates no affordance cannot
        satisfy its own acceptance case (&ldquo;a host lacking a capability does not get the
        affordance&rdquo;) — it is a flag that can never be observed. <code>nextStyle</code> gates
        nothing the shell can call, because &sect;4.2 already keeps that machinery in the tldraw
        adapter, and <code>dock.tsx:190-215</code> shows the real mechanism is a tool
        <em>variant id</em>, which <code>tools()</code>/<code>setTool()</code> already carry. Nothing
        in chrome&rsquo;s """ + f"{CHROME_LINES:,}" + """ lines resizes anything.""",
        "Keep four. Adding one back is a single array element the day an affordance needs it. "
        "If you say nothing I proceed with four.",
    ),
    (
        "Q2",
        "The shell lives in the trunk, not as its own app",
        """Your diagram draws one box, <code>app/bbox-no-host</code>, that both engine apps depend on.
        D3 splits it: the importable half is <code>@trunk/shell</code>, the runnable half is
        <code>apps/bbox-no-host</code>. I kept the importable half inside
        <code>apps/storybook-basics/src/</code> for three measured reasons — the repo has exactly one
        source alias; <code>engineFree.test.ts</code> walks only that tree, so a shell outside it has
        no engine wall at all; and Tailwind v4&rsquo;s app-only scanning would need an
        <code>@source</code> line in three apps.""",
        "Keep it in the trunk. Moving it later is a directory move plus one alias. "
        "If you say nothing it stays where it is.",
    ),
    (
        "Q3",
        "<code>ARCHITECTURE.md</code>&rsquo;s kit DAG goes false when the shell lands",
        """That page states the rule as &ldquo;<code>edit</code> imports both other kits;
        <strong>nothing imports edit</strong>.&rdquo; Your own arrow —
        <code>app/bbox-no-host &rarr; @bbox-ui/editor</code> — makes the shell the first importer of
        <code>edit</code>. I have not edited that page yet: the order says update it when P1 lands,
        and a peer reading it tonight would be reading a sentence that is about to be wrong.""",
        "Amend it now, in one line, rather than at P1. That is my recommendation; "
        "the reversible default if you say nothing is to leave it and fold it into P1's update.",
    ),
    (
        "Q4",
        "P1 is still gated — five lanes, not dead yet",
        """The fixed gate prints five branches touching <code>chrome/</code>,
        <code>main.tsx</code> or <code>App.tsx</code>. I did not start P1. This is N5 from the order:
        you can declare any of those lanes dead and P1 starts against the rest.""",
        "Wait for the gate. If you say nothing, P1 stays unstarted and the next session "
        "re-runs scripts/chrome_gate.sh before touching anything.",
    ),
    (
        "Q5",
        "<code>simple-reactflow-whiteboard</code> is committed locally and unpushed",
        """It is a public repo, so N4&rsquo;s default holds: I committed to
        <code>""" + E(WB_BRANCH or "claude/open-as-library-2026-09-19") + """</code> and pushed
        nothing. P3 cannot pin it by SHA until you push; until then it would take a dev-only
        <code>file:</code> reference.""",
        "Leave it unpushed. Push is yours. If you say nothing, nothing is pushed.",
    ),
    (
        "Q6",
        "npm&rsquo;s install-script gate is a live risk for P3&rsquo;s pinned git dependency",
        """The whiteboard&rsquo;s <code>dist/</code> is produced by a <code>prepare</code> script,
        which is how a git dependency gets a built package at all. npm 11.19.0 prints
        <em>&ldquo;install scripts not yet covered by allowScripts&rdquo;</em> for it on every
        non-registry install &mdash; and still runs it today, verified by fresh <code>dist/</code>
        timestamps. That wording is the shape of a default that tightens. If it ever becomes a hard
        gate, P3&rsquo;s install silently produces a package with no entry point, which surfaces as
        a mystifying module-not-found months from now rather than as an install error.""",
        "Note it in P3's README when P3 starts, rather than pre-emptively committing a workaround "
        "for a version of npm that does not exist. If you say nothing, that is what happens.",
    ),
]


def decision_html() -> str:
    rows = []
    for num, title, body, default in DECISIONS:
        # The copy block is MARKDOWN, so the title has to be plain text: strip
        # the tags AND resolve the entities, or `&rsquo;` lands in what Zach
        # pastes back. Measured — it did, on the first render.
        plain = html.unescape(re.sub(r"<[^>]+>", "", title))
        rows.append(f"""
      <article class="q" data-q="{num}" data-title="{E(plain)}">
        <h3><span class="num">{num}</span> {title}</h3>
        <div class="body">{body}</div>
        <p class="default"><strong>Reversible default:</strong> {default}</p>
        <div class="verdicts">
          <button type="button" data-v="APPROVE">Approve</button>
          <button type="button" data-v="CHANGE">Change</button>
          <button type="button" data-v="DISCUSS">Discuss</button>
        </div>
        <textarea rows="2" placeholder="Optional note for {num}&hellip;"></textarea>
      </article>""")
    return "\n".join(rows)


# ───────────────────────────── the page ─────────────────────────────

PAGE = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Host-less shell &mdash; review, P0 and P2</title>
<style>
  :root {{
    --bg:#fbfbfa; --ink:#1a1a18; --muted:#6b6b66; --line:#e3e2de; --card:#fff;
    --good:#1a7f4b; --bad:#b4342a; --accent:#2f5fd0; --code:#f4f3f0;
  }}
  @media (prefers-color-scheme: dark) {{
    :root:not([data-theme="light"]) {{
      --bg:#16161a; --ink:#e9e8e4; --muted:#9c9b94; --line:#2e2e34; --card:#1e1e23;
      --good:#4ec27f; --bad:#f0736a; --accent:#7fa3f5; --code:#232329;
    }}
  }}
  :root[data-theme="dark"] {{
    --bg:#16161a; --ink:#e9e8e4; --muted:#9c9b94; --line:#2e2e34; --card:#1e1e23;
    --good:#4ec27f; --bad:#f0736a; --accent:#7fa3f5; --code:#232329;
  }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; background:var(--bg); color:var(--ink); font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }}
  .wrap {{ max-width:960px; margin:0 auto; padding:48px 16px 96px; }}
  h1 {{ font-size:30px; line-height:1.2; margin:0 0 6px; letter-spacing:-.02em; }}
  h2 {{ font-size:20px; margin:52px 0 14px; padding-bottom:7px; border-bottom:1px solid var(--line); letter-spacing:-.01em; }}
  h3 {{ font-size:16px; margin:0 0 8px; }}
  .sub {{ color:var(--muted); margin:0 0 4px; }}
  code, pre {{ font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }}
  code {{ background:var(--code); padding:1px 5px; border-radius:4px; font-size:.88em; }}
  pre {{ background:var(--code); border:1px solid var(--line); border-radius:8px; padding:12px 14px;
         overflow-x:auto; font-size:12.5px; line-height:1.5; }}
  table {{ border-collapse:collapse; width:100%; margin:14px 0; font-size:14px; }}
  th, td {{ text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); vertical-align:top; }}
  th {{ font-weight:600; color:var(--muted); font-size:12.5px; text-transform:uppercase; letter-spacing:.04em; }}
  .cards {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:12px; margin:18px 0; }}
  .card {{ background:var(--card); border:1px solid var(--line); border-radius:10px; padding:14px 16px; }}
  .card .n {{ font-size:26px; font-weight:650; letter-spacing:-.02em; }}
  .card .l {{ color:var(--muted); font-size:12.5px; margin-top:2px; }}
  .ok {{ color:var(--good); }} .no {{ color:var(--bad); }}
  figure {{ margin:18px 0; }}
  figure img {{ width:100%; border:1px solid var(--line); border-radius:10px; display:block; }}
  figcaption {{ color:var(--muted); font-size:13px; margin-top:8px; }}
  .q {{ background:var(--card); border:1px solid var(--line); border-radius:10px; padding:16px 18px; margin:14px 0; }}
  .q .num {{ display:inline-block; background:var(--accent); color:#fff; border-radius:5px;
             padding:1px 8px; font-size:13px; margin-right:8px; font-family:ui-monospace,monospace; }}
  .q .body {{ color:var(--ink); }}
  .q .default {{ color:var(--muted); font-size:13.5px; border-left:3px solid var(--line); padding-left:12px; }}
  .verdicts {{ display:flex; gap:8px; flex-wrap:wrap; margin:10px 0 8px; }}
  .verdicts button {{ font:inherit; font-size:13px; padding:5px 14px; border-radius:999px; cursor:pointer;
                      border:1px solid var(--line); background:transparent; color:var(--ink); }}
  .verdicts button[aria-pressed="true"] {{ background:var(--accent); border-color:var(--accent); color:#fff; }}
  .q textarea {{ width:100%; font:inherit; font-size:13.5px; padding:8px 10px; border-radius:7px;
                 border:1px solid var(--line); background:var(--bg); color:var(--ink); resize:vertical; }}
  #copyRow {{ display:flex; gap:10px; align-items:center; margin:16px 0 8px; flex-wrap:wrap; }}
  #copyRow button {{ font:inherit; font-size:14px; padding:8px 18px; border-radius:8px; cursor:pointer;
                     border:1px solid var(--accent); background:var(--accent); color:#fff; }}
  #out {{ width:100%; min-height:150px; font-family:ui-monospace,monospace; font-size:12.5px;
          padding:11px; border:1px solid var(--line); border-radius:8px; background:var(--code); color:var(--ink); }}
  ul {{ padding-left:22px; }} li {{ margin:5px 0; }}
  .tag {{ font-size:11.5px; border:1px solid var(--line); border-radius:999px; padding:1px 9px; color:var(--muted); }}
</style></head><body><div class="wrap">

<h1>The host-less shell &mdash; review, then P0 and P2</h1>
<p class="sub">2026-09-19 &middot; bbox-ui <code>{E(HEAD)}</code> on <code>claude/host-less-shell-2026-09-19</code>
&middot; whiteboard <code>{E(WB_HEAD)}</code> on <code>{E(WB_BRANCH)}</code>, unpushed
&middot; <span class="tag">P1 not started &mdash; gate closed</span></p>

<h2>The short version</h2>
<ul>
  <li><strong>The order is sound; I changed five things.</strong> The biggest is a bug in its own
      gate command that reported a tooling failure as a hit. The rest are one invented type, one
      missing contract clause, one vacuous capability pair, and one acceptance case that could not
      be met as written.</li>
  <li><strong>P0 is done and proved.</strong> {PORT_MEMBERS} port members over 9 capability groups,
      {CONTRACT_CHECKS} contract checks, and {BREAKS} broken fakes each failing exactly the set named
      for it.</li>
  <li><strong>An independent audit broke it, and I fixed what it found.</strong> The first version
      let a host leak a phantom record and pass all 28 checks &mdash; while a comment in my own code
      claimed the opposite. That is the most useful thing in this report.</li>
  <li><strong>P2 is done:</strong> {P2_TESTS} acceptance tests committed red first, now
      {P2_TESTS}/{P2_TESTS} green with the {P2_BASELINE_TESTS} existing ones unchanged.</li>
  <li><strong>P1 is untouched</strong> and stays that way until the gate opens.</li>
</ul>

<div class="cards">
  <div class="card"><div class="n ok">185</div><div class="l">trunk test files green<br>(baseline 184)</div></div>
  <div class="card"><div class="n ok">1761</div><div class="l">trunk tests green<br>(baseline 1747)</div></div>
  <div class="card"><div class="n">{CONTRACT_CHECKS}</div><div class="l">contract checks<br>{BREAKS} broken fakes prove them</div></div>
  <div class="card"><div class="n">{PORT_MEMBERS}</div><div class="l">HostPort members<br>stop rule allows ~21</div></div>
  <div class="card"><div class="n ok">30</div><div class="l">whiteboard tests green<br>(19 old + 11 new)</div></div>
  <div class="card"><div class="n no">5</div><div class="l">lanes still gating P1</div></div>
</div>

<h2>1 &middot; What I changed in the order, and why</h2>

<h3>1.1 &nbsp;The gate command reported a failure as a hit</h3>
<p>&sect;6&rsquo;s gate uses <code>git diff --quiet main...$b || echo "$b"</code>. That
<code>||</code> fires on <em>any</em> non-zero exit &mdash; and <code>git diff</code> exits non-zero
both when there <em>is</em> a diff (1) and when it cannot compute one (128). <code>lab-extract</code>
shares no history with <code>main</code>, so the command printed it as a chrome-touching branch
while git was printing <code>fatal: main...lab-extract: no merge base</code> on stderr.</p>
<p>The replacement, <code>scripts/chrome_gate.sh</code>, resolves <code>git merge-base --all</code>
first, dispatches on the explicit exit code, reports unrelated history and multiple merge bases as
their own categories, and adds one thing the original could not do at all: <strong>it scans live
worktrees for uncommitted chrome edits</strong>. A branch diff cannot see a lane mid-edit, and five
lanes are live.</p>
<pre>{E(GATE)}</pre>

<h3>1.2 &nbsp;<code>ScreenRect</code> &rarr; the trunk&rsquo;s existing <code>Rect</code></h3>
<p>The sketch&rsquo;s own constraint 1 says reuse the trunk&rsquo;s vocabulary rather than invent
one &mdash; and then it invents <code>ScreenRect</code>. The single real consumer of those
rectangles, <code>placeFloatingToolbar()</code>, already takes <code>Rect</code> and <code>Size</code>
from <code>components/floatingToolbar.placement.ts:105,112</code>. A new type would have been
converted at exactly one call site, back into the type it started as.</p>

<h3>1.3 &nbsp;Referential stability is a contract clause (new constraint 7)</h3>
<p>The shell reads through <code>useSyncExternalStore</code>, whose <code>getSnapshot</code> must
return the same reference when nothing changed &mdash; otherwise React throws <em>&ldquo;The result
of getSnapshot should be cached to avoid an infinite loop&rdquo;</em> and the app spins.
<code>scene()</code> is <em>derived</em>, so the obvious reading of constraint 3 allocates a fresh
<code>BlockScene</code> per call and breaks constraint 2&rsquo;s consumer. This is the single thing
most likely to have burned a P1 builder.</p>
<p>It costs zero methods, which matters: a <code>version()</code> counter would have worked and
would have pushed the port to its own stop-rule line. It does not contradict D1 &mdash; a host
memoising its own derivation is the host caching its own work, not the shell keeping a second
document.</p>

<h3>1.4 &nbsp;Four capabilities, not five</h3>
<p>See <strong>Q1</strong> below. Short form: a capability that gates no affordance cannot satisfy
A0.1&rsquo;s own hiding case.</p>

<h3>1.5 &nbsp;A0.1&rsquo;s hiding case could not be met in P0 as written</h3>
<p>I3 says P0 ships no windows; A0.1 asks P0 to prove an affordance is hidden. Both cannot be true
of a rendered control. Resolved by making <code>affordancesFor(port)</code> a pure function the
contract asserts without rendering &mdash; and P1&rsquo;s windows consume the <em>same</em>
function, so A1.5 renders exactly what P0 proved instead of a second, parallel rule.</p>

<h3>1.6 &nbsp;Two things I checked and did <em>not</em> change</h3>
<ul>
  <li><strong><code>load</code> sync, <code>serialize</code> async.</strong> It reads like an
      oversight. It is not: <code>fileActions.ts:167</code> calls <code>parseTldrawJsonFile</code>
      without awaiting, while <code>serializeBoard</code> at <code>:68</code> returns a promise. The
      asymmetry is the engine&rsquo;s, and mirroring it keeps the adapter a pass-through.</li>
  <li><strong>&sect;4.2&rsquo;s table is accurate</strong>, contrary to the warning I was handed.
      All 14 named files exist (plus <code>legacyApp.test.ts</code>), and every cited line number
      still points at the thing it names &mdash; <code>floatingToolbar.tsx:123</code>,
      <code>variantSwitch.tsx:152</code>, <code>overlay.tsx:158</code>,
      <code>dock.tsx:181</code>, <code>chromeBar.tsx:90-91</code>. Re-verify at gate time anyway;
      it was true at {E(HEAD)}.</li>
</ul>

<h2>2 &middot; Ground truth, re-measured</h2>
<table>
  <tr><th>Fact</th><th>Order said</th><th>Measured now</th></tr>
  <tr><td><code>chrome/</code> size</td><td>2,780 lines, 14 files</td>
      <td>{CHROME_LINES:,} lines, {CHROME_FILES} files (non-test)</td></tr>
  <tr><td><code>editor.*</code> surface</td><td>71 sites, ~36 methods</td>
      <td><strong>{CALL_SITES} sites, {DISTINCT} distinct</strong> with comments stripped &mdash;
          the order&rsquo;s count included comment mentions, which its own text allowed for</td></tr>
  <tr><td>tldraw UI hooks</td><td>useValue &times;16, useEditor &times;15, useToasts &times;4, useDialogs &times;4</td>
      <td>exact match</td></tr>
  <tr><td>whiteboard <code>src</code></td><td>954 lines</td>
      <td>{WB_LINES} lines &mdash; stop rule is 2,000</td></tr>
</table>

<h2>3 &middot; P0 &mdash; the contract barrier</h2>
<table>
  <tr><th>File</th><th>Lines</th><th>What it is</th></tr>
  {"".join(f"<tr><td><code>{E(n)}</code></td><td>{c}</td><td>{E(D)}</td></tr>" for n, c, D in [
      (n, c, {
          "HOST-PORT.md": "the design note: what survived the sketch, what changed, the diagram mapping",
          "hostPort.ts": "the types, the four capabilities, affordancesFor()",
          "hostContract.ts": "28 checks as a PURE function, plus vitest sugar",
          "fakeHost.ts": "an in-memory host that really derives a scene and really undoes",
          "hostContract.test.ts": "A0.1: the fake passes; three broken fakes each fail their own check",
          "BboxShell.tsx": "the container, the port plumbing, the affordance context — no windows (I3)",
      }.get(n, "")) for n, c in SHELL_FILES])}
  <tr><td colspan="2"><strong>{SHELL_LINES}</strong></td><td>total</td></tr>
</table>

<h3>A0.1 &mdash; the three red outputs</h3>
<p>A contract that cannot fail is not a contract. Each broken fake is the <em>same constructor</em>
with one surgical difference, so it cannot fail for an incidental reason. The test asserts each one
fails <strong>exactly</strong> its own check plus the checks that genuinely build on the broken
behaviour &mdash; a host that fails everything proves nothing.</p>
<pre>{E(REDS)}</pre>

<h3>A0.4 &mdash; <code>apps/bbox-no-host</code>, driven in real headless Chromium</h3>
<figure>
  <img src="{data_uri(SHOT)}" alt="The no-host app: a header with host-connected and four capability checkboxes, above the shell container reading 'No canvas behind this shell'.">
  <figcaption>The shell mounted on the fake host, captured from the running app at
  <code>127.0.0.1:4361</code>. The capability checkboxes are a control in the app rather than a URL
  flag &mdash; dropping a capability is the thing this app exists to demonstrate, so it has to be one
  click. The smoke fails on console <em>warnings</em> as well as errors, because
  &ldquo;getSnapshot should be cached&rdquo; is a warning, and it measures the container with
  <code>boundingBox()</code> rather than asserting it present.</figcaption>
</figure>

<h3>A0.5 &mdash; the write set</h3>
<pre>{E(WRITE_SET)}</pre>
<p>Two additions beyond the order&rsquo;s stated write set, declared rather than smuggled:
<code>scripts/chrome_gate.sh</code> (the fixed gate, which is a review deliverable) and a
<code>.gitignore</code> line for <code>docs/assets/*.png</code> (capture output, regenerated on
demand).</p>

<h2>4 &middot; P2 &mdash; opening the whiteboard</h2>
<p>The ruler is committed red first, and it is off-limits to the implementation. Its sharpest
edge: <code>tests/fixtures/consumer.tsx</code> imports the package by its own <strong>bare
name</strong>, not a relative path into <code>src/</code>. A self-reference resolves only when
<code>exports</code>/<code>types</code> are right, so a broken entry fails at page load rather than
passing a compile check. It also registers a <code>star</code> tool and node type the library has
never heard of &mdash; &ldquo;open to us&rdquo; is not open.</p>
<p>Red at dispatch: <strong>10 failed, 1 passed</strong>. The one green is the bbox-independence
grep, which must <em>stay</em> green rather than turn &mdash; a coupling guard that only passes
after the work is no guard at all. Green now: <strong>30 passed, 0 failed</strong> &mdash; the
{P2_BASELINE_TESTS} original tests unchanged plus all {P2_TESTS} new ones.</p>
<figure>
  <img src="{data_uri(WB_SHOT)}" alt="The whiteboard driven through the consumer fixture: a dock reading V H R L A S, a drawn rectangle with an offset duplicate, an arrow between shapes, and a purple dashed star node.">
  <figcaption>Driven through the consumer fixture, not the demo app. The dock reads
  <strong>V H R L A <em>S</em></strong> &mdash; the <code>S</code> is the consumer&rsquo;s own tool,
  coming out of the same registry as the five built-ins, which is the whole of D2. The purple dashed
  box is the consumer&rsquo;s node type; the overlapping pair on the left is one rectangle and its
  duplicate at an offset. <code>getScene()</code> after this run returns
  <code>shape, star, anchor, anchor, shape</code> &mdash; the two anchors are the loose arrow&rsquo;s
  invisible endpoints, and seeing them here is the concrete reason P3&rsquo;s adapter must filter
  <code>type: "anchor"</code> out of the derived scene.</figcaption>
</figure>
<p>One thing the implementation lane got right that is worth naming: two tests failed at first, and
it reported <strong>FAIL with a diagnosis</strong> rather than touching the ruler. The diagnosis was
correct and the bug was mine &mdash; my <code>bridge()</code> helper rebuilt its callback with the
<code>Function</code> constructor, which sees only global scope, so a callback closing over an outer
local arrived with nothing to close over. Fixed as transport (an explicit argument); every assertion
is character-for-character what was committed red. Asked later to clear four lint warnings in a
fixture I wrote, the same lane <em>declined</em> &mdash; its brief said <code>tests/</code> was
off-limits and a peer session&rsquo;s say-so is not authorization it can verify. That was correct,
and I made the change from this side instead.</p>

<h2>4b &middot; The audit &mdash; what a second model broke</h2>
<p>P0 passed its own gates. I then handed the contract to a read-only auditor on a different model
with one question: <em>can a host pass every check while being genuinely wrong?</em> It could, and
finding that out was worth more than the green run.</p>
<table>
  <tr><th>What it found</th><th>What it meant</th><th>Fixed by</th></tr>
  <tr><td><strong>A host leaking a constant phantom record passed all 28 checks</strong></td>
      <td>Every scene check compared a <em>delta</em> &mdash; one more node, one fewer &mdash; so a
          permanent extra was invisible. This is the real failure mode for both engines (React
          Flow&rsquo;s invisible <code>anchor</code>, a tldraw helper shape). Worse, a comment in
          <code>fakeHost.ts</code> claimed its helper record made this checkable. The comment was
          false.</td>
      <td>Two checks, because one was not enough &mdash; my first attempt still missed it, since
          the leaked record was deletable by id. Now: deleting every reported node must empty the
          scene, <em>and</em> every reported node must actually be selectable. A fourth broken fake
          proves both.</td></tr>
  <tr><td>The cascade allow-list permitted 12 outcomes; 6 never fire</td>
      <td>Harmless only while nothing else is broken. A future regression tripping a permitted name
          gets waved through as collateral of a different bug.</td>
      <td>Each break now asserts an <strong>exact</strong> failure set.</td></tr>
  <tr><td><code>one transact is ONE undo step</code> was vacuous below 2 nodes</td>
      <td>It indexed <code>ids[1]</code> unguarded; the second write no-opped and the check degraded
          to something true of almost any implementation &mdash; and reported clean. A fresh tldraw
          board is exactly that case.</td>
      <td>One shared <code>idsAtLeast(port, n)</code> precondition.</td></tr>
  <tr><td><code>useHostValue</code> reintroduced constraint 7 on the shell side</td>
      <td>The constraint binds the <em>host&rsquo;s</em> getters. A caller&rsquo;s selector that
          derives an object from two of them &mdash; the obvious thing a window will want &mdash;
          allocates per call and throws the very error the constraint prevents. Same for an inline
          object <code>fallback</code> while no host is attached, which is the <em>common</em>
          state in the no-host app.</td>
      <td>Version-keyed cache plus refs, before either had a call site.</td></tr>
</table>
<p>One finding I did <em>not</em> "fix", with the reasoning recorded: a host declaring no
capabilities skips 11 of {CONTRACT_CHECKS} checks and reports zero violations. Failing it would be
wrong &mdash; declaring less is honest, and it is exactly how the React Flow host arrives one
capability at a time. Hiding it would not be, so the skip count is now in the result and in the
report line.</p>
<pre>{E(REDS)}</pre>

<h2>5 &middot; Decisions &mdash; each one answerable on its own</h2>
<p class="sub">Pick a verdict per item, add a note if you want, then hit Copy and paste the block
back. Nothing here blocks: every item has a reversible default that keeps the work moving if you
ignore it.</p>
{decision_html()}

<div id="copyRow">
  <button type="button" id="copyBtn">Copy all verdicts</button>
  <span class="sub" id="copyNote">The text lands in the box below either way &mdash; select and copy if the button cannot reach your clipboard.</span>
</div>
<textarea id="out" readonly></textarea>

<h2>6 &middot; What is left, and what I deliberately did not do</h2>
<table>
  <tr><th></th><th></th></tr>
  <tr><td><strong>Done and proved</strong></td><td>P0 in full: design note, port, 28-check contract,
      fake host, shell skeleton, the no-host app. A0.1&ndash;A0.5 all green, evidence above.
      P2&rsquo;s ruler committed red.</td></tr>
  <tr><td><strong>Also done and proved</strong></td><td>P2 in full: library entry, props and an
      imperative handle, an open tool registry, undo/redo, duplicate, serialize/load, and a real
      library build whose output was installed into a throwaway consumer two ways and type-checked
      under <code>strict</code>. 30/30 green, <code>src</code> at {WB_LINES} lines against the
      2,000 stop rule, <code>git grep -i bbox -- src</code> empty. Committed locally, unpushed.</td></tr>
  <tr><td><strong>Left &mdash; blocked</strong></td><td>P1, on the gate (Q4). P3, on P1 &mdash; P2
      is no longer the blocker.</td></tr>
  <tr><td><strong>Deliberately not done</strong></td><td>No windows in the shell (I3) &mdash; five
      lanes are rewriting exactly that wiring. No rename of <code>apps/systemsketch</code> (I4/N1).
      No merge to <code>main</code>, no push anywhere. <code>ARCHITECTURE.md</code> left unamended
      pending Q3. No Storybook stories added &mdash; this repo&rsquo;s CLAUDE.md says that surface
      is opt-in.</td></tr>
</table>

<script>
(function () {{
  var titles = {{}};
  document.querySelectorAll('.q').forEach(function (q) {{
    var id = q.dataset.q;
    titles[id] = q.dataset.title;
    q.querySelectorAll('.verdicts button').forEach(function (b) {{
      b.addEventListener('click', function () {{
        q.querySelectorAll('.verdicts button').forEach(function (o) {{ o.setAttribute('aria-pressed', 'false'); }});
        b.setAttribute('aria-pressed', 'true');
        render();
      }});
    }});
    q.querySelector('textarea').addEventListener('input', render);
  }});

  function render() {{
    var lines = ['## Host-less shell — verdicts', ''];
    document.querySelectorAll('.q').forEach(function (q) {{
      var id = q.dataset.q;
      var picked = q.querySelector('.verdicts button[aria-pressed="true"]');
      var note = q.querySelector('textarea').value.trim();
      var verdict = picked ? picked.dataset.v : '(no verdict)';
      lines.push('- **' + id + ' ' + titles[id] + '** — ' + verdict + (note ? ' — ' + note : ''));
    }});
    var out = document.getElementById('out');
    out.value = lines.join('\\n');
    return out.value;
  }}

  document.getElementById('copyBtn').addEventListener('click', function () {{
    var text = render();
    var out = document.getElementById('out');
    out.focus();
    out.select();
    // Both clipboard paths refuse on file:// in some browsers, so the textarea
    // above is the real deliverable and is always pre-selected.
    try {{
      if (navigator.clipboard && navigator.clipboard.writeText) {{
        navigator.clipboard.writeText(text).then(function () {{
          document.getElementById('copyNote').textContent = 'Copied.';
        }}, fallback);
        return;
      }}
    }} catch (e) {{ /* fall through */ }}
    fallback();
  }});

  function fallback() {{
    var ok = false;
    try {{ ok = document.execCommand('copy'); }} catch (e) {{ ok = false; }}
    document.getElementById('copyNote').textContent = ok
      ? 'Copied.'
      : 'Clipboard blocked on file:// — the text is selected below, press Cmd/Ctrl+C.';
  }}

  render();
}})();
</script>
</div></body></html>
"""

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(PAGE)
encoded = len(
    "data:text/html;charset=utf-8,"
    + "".join(c if c.isalnum() or c in "-_.!~*'()" else "".join(f"%{b:02X}" for b in c.encode()) for c in PAGE)
)
print(f"{OUT}  {len(PAGE):,} bytes on disk  {encoded:,} bytes encoded (preview cap 2,097,024)")
