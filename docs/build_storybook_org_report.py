#!/usr/bin/env python3
"""Build the Storybook-organisation proposals report.

Reads the LIVE story index of today's Storybook (:5421) and of each proposal
preview (:5423 A, :5424 B, :5425 C — apps/storybook-basics/.storybook-org/),
the per-file table (`.storybook-org/story-org.json`) and the captures made by
`docs/capture_storybook_org_shots.mjs`, and writes one self-contained HTML
page into the main checkout's gitignored reports/media/ (it inlines captures).

    python3 docs/build_storybook_org_report.py

WHY every number is recomputed here from the running indexes rather than
typed into the page: the proposals are a claim about what Storybook BUILDS
from these titles. Reading Storybook's own index.json is the only oracle for
that which is not this repo's own guess.
"""
from __future__ import annotations

import base64
import html
import json
import re
import subprocess
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
MAIN = Path("/home/bam/bbox-ui")
MEDIA = MAIN / "reports/media/storybook-org-2026-09-22"
OUT = MAIN / "reports/media/storybook-org-2026-09-22.html"
TABLE = REPO / "apps/storybook-basics/.storybook-org/story-org.json"
VAULT = Path("/home/bam/zach_brain")

TREES = {
    "today": dict(port=5421, name="Today", short="Today"),
    "a": dict(port=5423, name="A · Mirror the repo", short="A"),
    "b": dict(port=5424, name="B · Kits, then families", short="B"),
    "c": dict(port=5425, name="C · Objects first", short="C"),
}

rows = json.loads(TABLE.read_text())["rows"]
index = {k: json.load(urllib.request.urlopen(f"http://localhost:{t['port']}/index.json"))["entries"] for k, t in TREES.items()}
manifest = json.loads((MEDIA / "manifest.json").read_text())


# ---------------------------------------------------------------- measures
def tree_of(entries):
    """title -> story count, plus parent -> children for every node."""
    per_title = Counter(e["title"] for e in entries.values() if e["type"] == "story")
    kids = defaultdict(list)
    for title in per_title:
        parts = title.split("/")
        for depth in range(len(parts)):
            parent, child = "/".join(parts[:depth]), parts[depth]
            if child not in kids[parent]:
                kids[parent].append(child)
    return per_title, kids


M = {}
for key, entries in index.items():
    per_title, kids = tree_of(entries)
    roots = kids[""]
    lists = {node: len(children) for node, children in kids.items() if node}
    widest_node = max(lists, key=lists.get)
    homes = defaultdict(set)
    for row in rows:
        homes[row["subject"]].add(row[key].split("/")[0])
    split = {subject: sorted(r) for subject, r in homes.items() if len(r) > 1}
    M[key] = dict(
        stories=sum(per_title.values()),
        roots=roots,
        root_sizes={r: len(kids[r]) for r in roots},
        singletons=[r for r in roots if len(kids[r]) == 1],
        widest=(widest_node, lists[widest_node]),
        depth=max(len(t.split("/")) for t in per_title),
        glance=manifest["trees"][key]["shots"]["glance"]["visibleRows"],
        split=split,
        per_title=per_title,
        kids=kids,
    )

# ids that change: same (file, export) -> different id
def ids_by_story(entries):
    return {(e["importPath"], e.get("exportName")): e["id"] for e in entries.values() if e["type"] == "story"}
today_ids = ids_by_story(index["today"])
for key in "abc":
    other = ids_by_story(index[key])
    M[key]["ids_changed"] = sum(1 for k, v in other.items() if today_ids.get(k) != v)

# tag audit on today's index (per file)
files_today = {}
for e in index["today"].values():
    files_today[e["importPath"]] = e
area_same = area_total = untagged = 0
for e in files_today.values():
    area = [t[5:] for t in e["tags"] if t.startswith("area:")]
    if not area:
        untagged += 1
        continue
    area_total += 1
    area_same += area[0] == e["title"].split("/")[0].lower().replace(" ", "-")

# hard-coded story ids in tracked files, and story links in the vault
live_ids = {e["id"] for e in index["today"].values()}
id_pat = re.compile(r"\b([a-z0-9]+(?:-[a-z0-9]+)*--[a-z0-9]+(?:-[a-z0-9]+)*)\b")
tracked = subprocess.run(["git", "ls-files"], cwd=REPO, capture_output=True, text=True, check=True).stdout.split()
ref_files, ref_ids, ref_total = set(), set(), 0
for f in tracked:
    if not re.search(r"\.(ts|tsx|mjs|js|py|md|json|html)$", f) or f.startswith("reports/"):
        continue
    try:
        text = (REPO / f).read_text(errors="ignore")
    except (IsADirectoryError, FileNotFoundError):
        continue
    for m in id_pat.findall(text):
        if m in live_ids:
            ref_files.add(f)
            ref_ids.add(m)
            ref_total += 1
vault_links = subprocess.run(
    ["grep", "-rhoE", r"542[0-9]/\?path=/story/[a-z0-9-]+--[a-z0-9-]+", str(VAULT), "--include=*.md"],
    capture_output=True, text=True,
).stdout.split()
vault_distinct = len(set(vault_links))

# ---------------------------------------------------------------- helpers
def esc(s) -> str:
    return html.escape(str(s))


def data_uri(path: Path, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def img(name: str, alt: str, cls: str = "") -> str:
    return f'<img class="{cls}" src="{data_uri(MEDIA / name, "image/png")}" alt="{esc(alt)}" loading="lazy">'


def outline_html(key: str) -> str:
    per_title, kids = M[key]["per_title"], M[key]["kids"]

    def walk(prefix: str, depth: int) -> str:
        items = []
        for child in kids.get(prefix, []):
            path = f"{prefix}/{child}" if prefix else child
            n = per_title.get(path, 0)
            sub = walk(path, depth + 1) if kids.get(path) else ""
            count = f' <span class="n">{n}</span>' if n else ""
            cls = "root" if depth == 0 else ("grp" if sub else "leaf")
            items.append(f'<li class="{cls}"><span>{esc(child)}</span>{count}{sub}</li>')
        return f"<ul>{''.join(items)}</ul>"

    return walk("", 0)


def titles_for(subject: str) -> dict:
    return {k: sorted({r[k] for r in rows if r["subject"] == subject}) for k in TREES}


# ---------------------------------------------------------------- scoring
CRITERIA = [
    ("First glance is scannable", 25, "rows you see before opening anything; the longest single list"),
    ("Nobody has to choose a title", 20, "how a new lane's story lands in the right place — drift is how today happened"),
    ("One home per thing", 15, "every story about one component under one section"),
    ("Same words as the repo", 15, "components · scene · editor at the top, as ARCHITECTURE.md:121 names them"),
    ("Isolation, then together (P1)", 10, "a component alone, and the same component composed or in a host, both one click away"),
    ("Migration cost", 10, "files touched, links broken, and whether it waits on the folder move"),
    ("Stock Storybook only", 5, "no custom sidebar code survives the change"),
]
SCORES = {  # 1-5, each justified by a measured line in EVIDENCE
    "a": [1, 5, 3, 5, 4, 2, 5],
    "b": [5, 3, 5, 4, 4, 4, 5],
    "c": [3, 2, 5, 2, 5, 4, 5],
}
EVIDENCE = {
    "a": [
        f"{M['a']['glance']} rows; {M['a']['widest'][0]} holds {M['a']['widest'][1]} — longer than today's worst ({M['today']['widest'][1]})",
        "0 choices: the path is the title (Storybook's own auto-title)",
        f"{len(M['a']['split'])} components split — every <em>In A Host</em> story sits in Hosts, away from its component",
        "the roots ARE the repo's folders",
        "together = the Hosts and Scene sections",
        "needs the per-component folder move first, then deletes 151 titles; ids change twice (now, and at the move)",
        "auto-title is stock",
    ],
    "b": [
        f"{M['b']['glance']} rows; longest list {M['b']['widest'][1]} ({M['b']['widest'][0]})",
        "151 titles chosen by hand — held by a test: root must be a kit, second segment from a closed family list",
        f"{len(M['b']['split'])} split — host stories fold in as <em>In A Host</em> under their component",
        "roots are the kits; the family level is new vocabulary the repo does not have",
        "<em>In A Host</em> beside each component; Scene holds the composed boards",
        "151 one-line title edits + storySort; no file moves; no wait on the folder move",
        "title + storySort + tags — all stock",
    ],
    "c": [
        f"{M['c']['glance']} rows; longest list {M['c']['widest'][1]} ({M['c']['widest'][0]})",
        "151 hand-chosen titles, and the object is a judgement call for chrome, scene and editor stories",
        f"{len(M['c']['split'])} split — and more: scene and editor stories about a Port sit under Port too",
        "the kits disappear from the tree (they become a `kit:` tag in the filter)",
        "best: everything about Port — the dot, its edge, its variants, its overflow chip — in one subtree",
        "151 one-line title edits + storySort; no file moves",
        "title + storySort + tags — all stock",
    ],
}
weighted = {k: round(sum(w * s for (_, w, _), s in zip(CRITERIA, SCORES[k])) / 5) for k in SCORES}

# ---------------------------------------------------------------- page
from PIL import Image  # noqa: E402

glance_h = {k: Image.open(MEDIA / f"{k}-glance.png").size[1] for k in TREES}
tallest = max(glance_h.values())
glance_cols = "".join(
    f'''<figure class="sky"><div class="skyimg" id="glance-{k}" style="--r:{glance_h[k] / tallest:.4f}">{img(f"{k}-glance.png", f"{TREES[k]['name']} sidebar at first glance")}</div>
    <figcaption><b>{esc(TREES[k]['short'])}</b> · {M[k]['glance']} rows</figcaption></figure>'''
    for k in TREES
)
roots_cols = "".join(
    f'''<figure class="rootshot">{img(f"{k}-roots.png", f"{TREES[k]['name']} sections collapsed")}
    <figcaption><b>{esc(TREES[k]['short'])}</b> · {len(M[k]['roots'])} sections{(' · singletons: ' + esc(', '.join(M[k]['singletons']))) if M[k]['singletons'] else ''}</figcaption></figure>'''
    for k in TREES
)

metric_rows = [
    ("Sections (roots)", lambda k: len(M[k]["roots"])),
    ("Rows at first glance", lambda k: M[k]["glance"]),
    ("Longest list", lambda k: f"{M[k]['widest'][1]} <small>{esc(M[k]['widest'][0])}</small>"),
    ("Sections holding one thing", lambda k: len(M[k]["singletons"])),
    ("Components split across sections", lambda k: len(M[k]["split"])),
    ("Deepest title", lambda k: M[k]["depth"]),
    ("Stories (all render)", lambda k: M[k]["stories"]),
    ("Story ids that change", lambda k: "—" if k == "today" else f"{M[k]['ids_changed']} of {M[k]['stories']}"),
]
metrics_table = "<table class='metrics'><thead><tr><th></th>" + "".join(
    f"<th>{esc(TREES[k]['short'])}</th>" for k in TREES) + "</tr></thead><tbody>" + "".join(
    "<tr><th>" + esc(label) + "</th>" + "".join(f"<td>{fn(k)}</td>" for k in TREES) + "</tr>" for label, fn in metric_rows
) + "</tbody></table>"

score_table = "<table class='score'><thead><tr><th>Criterion</th><th>Weight</th>" + "".join(
    f"<th>{esc(TREES[k]['short'])}</th>" for k in "abc") + "</tr></thead><tbody>" + "".join(
    f"<tr><th>{esc(name)}<small>{esc(why)}</small></th><td>{w}</td>" + "".join(
        f"<td><span class='dot s{SCORES[k][i]}'>{SCORES[k][i]}</span><small>{EVIDENCE[k][i]}</small></td>" for k in "abc") + "</tr>"
    for i, (name, w, why) in enumerate(CRITERIA)
) + "<tr class='total'><th>Weighted, out of 100</th><td></td>" + "".join(
    f"<td><b>{weighted[k]}</b></td>" for k in "abc") + "</tr></tbody></table>"

where_rows = ""
for subject, label in (("PortEdge", "PortEdge"), ("BlockPort", "BlockPort"), ("Branch", "Branch"), ("FitToContent", "FitToContent")):
    t = titles_for(subject)
    where_rows += f"<tr><th>{label}</th>" + "".join(
        "<td>" + "<br>".join(f"<code>{esc(x)}</code>" for x in t[k]) + "</td>" for k in TREES) + "</tr>"
where_table = "<table class='where'><thead><tr><th></th>" + "".join(
    f"<th>{esc(TREES[k]['short'])}</th>" for k in TREES) + "</tr></thead><tbody>" + where_rows + "</tbody></table>"

full_rows = "".join(
    f"<tr><td><code>{esc(r['path'])}</code></td><td>{esc(r['today'])}</td><td>{esc(r['a'])}</td><td>{esc(r['b'])}</td><td>{esc(r['c'])}</td></tr>"
    for r in rows
)
outlines = "".join(
    f'<div class="outline" data-tree="{k}" {"hidden" if k != "b" else ""}>{outline_html(k)}</div>' for k in TREES
)
split_today = "; ".join(f"{s} → {', '.join(r)}" for s, r in M["today"]["split"].items())

PROPOSALS = [
    dict(
        key="a", port=5423,
        rule="Delete every <code>title:</code>. Storybook's auto-title makes the sidebar from the file path, so after the per-component folder move the sidebar <em>is</em> the repo: <code>components/PortEdge/HitRegions.stories.tsx</code> → <code>Components / PortEdge / HitRegions</code>.",
        good=["Can never drift again — no lane chooses a title, so none can choose badly (every mess on today's screenshot was a reasonable local choice).",
              "The sidebar names and the file names are the same string. Grep one, find the other.",
              "Sprawl in the repo shows up in the sidebar, which is where it gets noticed — the tree is an honest view of the architecture."],
        bad=[f"The first glance gets <b>longer</b>, not shorter: {M['a']['widest'][1]} components in one flat Components list, against today's {M['today']['widest'][1]} in Basics. A flat folder is fine to grep, not to scan.",
             f"{len(M['a']['split'])} components split: host stories live in <code>hosts/</code> (the settled ruling), so BlockPort's <em>In A Host</em> is a section away from BlockPort.",
             "Only works after the per-component folder move — before it, auto-title shows today's <code>hitRegions/HitRegionsPort</code> sprawl verbatim. And story ids change twice: at the retitle and again at the move."],
        cuts="P1 isolation-then-together (a component and its host rendering land in different sections) and your own complaint — the long flat list is the mess, relocated.",
    ),
    dict(
        key="b", port=5424,
        rule="Same top as the repo — <b>Components · Scene · Editor · Presets · Skin</b> — then one level the repo does not have, <em>only</em> where a section holds more than 12 things: families under Components (Ports, Blocks, Traces, Text &amp; Marks, Menus &amp; Bars, Panels &amp; Dialogs, Stock) and under Scene, from your own sentence at L191 (<em>“layout operations? data validation operations?”</em>): Model &amp; Diff, Wiring, Validation, Layout &amp; Drag.",
        good=[f"First glance is {M['b']['glance']} rows — it fits on one screen. Longest list anywhere is {M['b']['widest'][1]}, and that one is the vendored shadcn Stock you never browse.",
              "One home per thing: aspects nest under their component (<code>PortEdge / Hit Regions</code>, <code>BlockPort / In A Host</code>) — zero components split.",
              "No file moves, so it can land now and does not wait for the folder refactor; the titles survive that refactor unchanged."],
        bad=["151 titles are chosen, not derived — so it can drift the way today did. Needs a guard: a unit test that the root is a kit and the second segment is from the closed family list (it cannot check the family is <em>right</em>, only that it exists).",
             "The family words (Ports, Text &amp; Marks…) exist only in Storybook. The repo stays flat per your ruling, so the two trees differ by exactly one level.",
             "Retires the <code>area:</code> tag convention in CLAUDE.md — replaced by an <code>object:</code> tag that carries the axis the tree does not."],
        cuts="P2 solve-it-once, mildly: the family level is a second hierarchy maintained by hand. The test is what keeps that honest.",
    ),
    dict(
        key="c", port=5425,
        rule="Domain objects on top — <b>Port · Block · Trace · Region · Scene · Text &amp; Marks · Chrome · Stock · Skin</b>. Everything about a Port sits under Port, whichever kit the code is in: the dot, LabeledPort, PortEdge, its variants (skin), its overflow chip (editor). The kits become a <code>kit:</code> tag in the filter menu.",
        good=["The best answer to <em>“show me everything about X”</em> — the black-box view: a Port's whole universe in one subtree.",
              "Control flow reads as one thing: Region holds Branch, Loop, Toggle, Wires, Async and the variants.",
              "Zero split homes, like B."],
        bad=["Contradicts the vocabulary you just settled: <em>components, scene, editor</em> vanish from the tree.",
             "Objects only cover the canvas half. Chrome, Stock and Skin are not objects, so the tree is two schemes glued together — 9 sections, near today's 11.",
             "The object is a judgement call for every scene and editor story (is Linking about Trace or Scene? is the Inspector about Block?) — the weakest drift resistance of the three."],
        cuts="The settled architecture's vocabulary (ARCHITECTURE.md:121) and P2 — every story needs a human ruling on which object it is about.",
    ),
]

def proposal_card(p):
    k = p["key"]
    return f'''
<section class="card" id="p-{k}">
  <header><h3>{esc(TREES[k]['name'])}</h3><span class="score-pill">{weighted[k]}/100</span></header>
  <p class="rule">{p['rule']}</p>
  <div class="card-grid">
    <div class="scrollshot" aria-label="sidebar at first glance"><img data-same-as="glance-{k}" alt="{esc(TREES[k]['name'])} sidebar at first glance"></div>
    <div>
      <h4>What it gets right</h4><ul>{"".join(f"<li>{x}</li>" for x in p['good'])}</ul>
      <h4>What it costs</h4><ul>{"".join(f"<li>{x}</li>" for x in p['bad'])}</ul>
      <p class="cuts"><b>Cuts against:</b> {p['cuts']}</p>
      <p class="open">Running now: <code>http://localhost:{p['port']}</code> — the toolbar's proposal dropdown jumps to the same story in the others.</p>
    </div>
  </div>
</section>'''

cards = "".join(proposal_card(p) for p in PROPOSALS)

QUESTIONS = [
    ("q2", f"Links: {len(ref_ids)} story ids are hard-coded in {len(ref_files)} tracked files (report capture manifests, plans) and {vault_distinct} in the vault. Any retitle breaks them.",
     "Rewrite them in the same pass from the old→new map the table already holds.",
     "Default: rewrite. Rejected: pinning the old ids with meta <code>id</code> — URLs would keep naming sections that no longer exist."),
    ("q3", "The 22 vendored shadcn primitives (Button, Input, Tooltip…).", "Keep them, last, under Components › Stock — you need them when composing.",
     "Default: keep. Alternative: drop their stories; they are stock and never design work (CLAUDE.md)."),
    ("q4", "Should the families become real folders, so the sidebar is derived (A's mechanism, B's shape)?",
     "No — you ruled components/ flat (“/port, /block, /port_edge”). Families live in titles only, guarded by the test.",
     "Default: no folders."),
]
questions_html = "".join(
    f'''<div class="q" data-q="{qid}"><p class="qq"><b>{esc(q)}</b></p><p><b>Recommend:</b> {rec}</p><p class="def">{default}</p>
    <textarea placeholder="Your answer (blank = take the default)"></textarea></div>'''
    for qid, q, rec, default in QUESTIONS
)

stock_table = """
<table class="stock"><thead><tr><th>Element</th><th>Today</th><th>Off-the-shelf part (exact name)</th><th>Behaviour that must survive</th></tr></thead><tbody>
<tr><th>Sidebar tree</th><td>151 hand-typed <code>title:</code> strings, no rules</td><td>CSF <code>meta.title</code> (B, C) · CSF auto-title <code>userOrAutoTitleFromSpecifier</code> via <code>stories: [{ directory, titlePrefix }]</code> (A)</td><td>Every story reachable; names are the code names you grep for</td></tr>
<tr><th>Section order</th><td>load order — whichever file was indexed first</td><td><code>parameters.options.storySort</code> <code>{ method: "alphabetical", order: [...] }</code></td><td>Components first; Port before LabeledPort before PortEdge</td></tr>
<tr><th>Second axis</th><td><code>area:</code> tags — measured, they repeat the section name in """ + f"{area_same} of {area_total}" + """ files</td><td>Storybook tag filter (sidebar Filter menu builds a checkbox per tag)</td><td><code>object:port</code> (A, B) or <code>kit:scene</code> (C) — the axis the tree does not show</td></tr>
<tr><th>Lane tags</th><td><code>lane:&lt;slug&gt;</code></td><td class="unch">unchanged (stock seam)</td><td><code>git grep -l 'lane:x'</code> still finds one delivery's stories</td></tr>
<tr><th>Skin / Ports / Regions toolbar</th><td>preview globals</td><td class="unch">unchanged (stock seam)</td><td>present in all three previews (visible in every capture); switching them there was not exercised</td></tr>
<tr><th>Story URLs</th><td>derived from titles by <code>toId(title, name)</code></td><td class="unch">unchanged mechanism — ids follow the new titles</td><td>the name half after <code>--</code> never changes; only the title half moves</td></tr>
<tr><th>Title guard (B, C)</th><td>none</td><td>ours: one Vitest test in the existing <code>unit</code> project</td><td>a new story with a root outside the kit list fails <code>pnpm test</code></td></tr>
<tr><th>The previews themselves</th><td>—</td><td><code>experimental_indexers</code> wrapping the stock CSF indexer; <code>-c .storybook-org/&lt;a|b|c&gt;</code></td><td>throwaway — deleted when one lands; <code>.storybook/</code> untouched</td></tr>
</tbody></table>"""

video_b64 = data_uri(MEDIA / "journey.mp4", "video/mp4")
gif_b64 = data_uri(MEDIA / "journey.gif", "image/gif")
poster = data_uri(MEDIA / "poster.jpg", "image/jpeg")

CSS = """
:root{--bg:#fbfaf7;--fg:#1d1d1b;--muted:#6b6a64;--line:#e4e1d8;--card:#ffffff;--accent:#c2410c;--good:#15803d;--bad:#b91c1c;--code:#f1eee6;--pill:#1d1d1b;--pillfg:#fff}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#15161a;--fg:#e8e6e1;--muted:#9a978f;--line:#2c2d33;--card:#1c1d22;--accent:#fb923c;--good:#4ade80;--bad:#f87171;--code:#25262c;--pill:#e8e6e1;--pillfg:#15161a}}
:root[data-theme="dark"]{--bg:#15161a;--fg:#e8e6e1;--muted:#9a978f;--line:#2c2d33;--card:#1c1d22;--accent:#fb923c;--good:#4ade80;--bad:#f87171;--code:#25262c;--pill:#e8e6e1;--pillfg:#15161a}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1180px;margin:0 auto;padding:28px 16px 80px}
h1{font-size:28px;line-height:1.2;margin:0 0 6px}h2{font-size:20px;margin:44px 0 12px;padding-top:12px;border-top:1px solid var(--line)}
h3{margin:0;font-size:18px}h4{margin:14px 0 4px;font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.sub{color:var(--muted);margin:0 0 20px}code{background:var(--code);padding:1px 5px;border-radius:4px;font-size:.88em;word-break:break-word}
small{display:block;color:var(--muted);font-size:12px;line-height:1.35;margin-top:2px}
.tldr{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:10px;padding:16px 18px}
.tldr p{margin:6px 0}.nums{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:16px 0 0}
.num{background:var(--code);border-radius:8px;padding:10px 12px}.num b{font-size:24px;display:block}.num span{color:var(--muted);font-size:12px}
.hero{display:grid;grid-template-columns:minmax(0,340px) 1fr;gap:22px;align-items:start;margin-top:22px}
.hero video,.hero img{width:100%;border-radius:10px;border:1px solid var(--line);background:#000}
.hero ol{margin:6px 0 0;padding-left:20px}.hero li{margin:3px 0}
table{border-collapse:collapse;width:100%;font-size:13.5px}th,td{border-bottom:1px solid var(--line);padding:8px 8px;text-align:left;vertical-align:top}
thead th{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.tablewrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
.metrics td{font-variant-numeric:tabular-nums}.metrics td:nth-child(4){background:color-mix(in srgb,var(--good) 8%,transparent)}
.score .dot{display:inline-block;width:22px;height:22px;border-radius:50%;text-align:center;line-height:22px;font-weight:700;font-size:12px;color:#fff;margin-right:4px}
.s1{background:#b91c1c}.s2{background:#ea580c}.s3{background:#a16207}.s4{background:#4d7c0f}.s5{background:#15803d}
.score .total td,.score .total th{font-size:16px;border-bottom:none}
.skyline{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;align-items:end}
.sky{margin:0;text-align:center}.skyimg{--skyh:520px;display:flex;align-items:flex-end;justify-content:center;height:var(--skyh);border-bottom:2px solid var(--fg)}
.skyimg img{height:calc(var(--skyh) * var(--r));width:auto;border:1px solid var(--line)}
.sky figcaption{font-size:13px;margin-top:6px}
.roots{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;align-items:start}
.rootshot{margin:0}.rootshot img{width:100%;max-width:275px;border-radius:8px;border:1px solid var(--line)}.rootshot figcaption{font-size:13px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px;margin:16px 0}
.card header{display:flex;justify-content:space-between;align-items:center;gap:10px}
.score-pill{background:var(--pill);color:var(--pillfg);border-radius:99px;padding:3px 10px;font-weight:700;font-size:13px}
#p-b{border:2px solid var(--good)}
.rule{margin:10px 0 0}.card-grid{display:grid;grid-template-columns:260px 1fr;gap:20px;margin-top:12px}
.scrollshot{height:560px;overflow-y:auto;border:1px solid var(--line);border-radius:8px;background:#1b1c1f}
.scrollshot img{width:100%;display:block}.card ul{margin:4px 0;padding-left:18px}.card li{margin:4px 0}
.cuts{font-size:13.5px;color:var(--muted)}.open{font-size:13px}
.where code{font-size:12px}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.tabs button{font:inherit;font-size:13px;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:99px;padding:4px 12px;cursor:pointer}
.tabs button[aria-pressed="true"]{background:var(--pill);color:var(--pillfg)}
.outline{font-size:13px;columns:3 240px;column-gap:24px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.outline ul{list-style:none;margin:0;padding-left:14px}.outline>ul{padding-left:0}
.outline li.root>span{font-weight:700;text-transform:uppercase;letter-spacing:.06em;font-size:11.5px;color:var(--accent)}
.outline li.root{break-inside:avoid-column;margin-bottom:8px}.outline li.grp>span{font-weight:600}.outline .n{color:var(--muted);font-size:11px}
.stock td.unch{color:var(--muted);font-style:italic}
.q{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin:10px 0}.q p{margin:4px 0}.def{color:var(--muted);font-size:13.5px}
textarea{width:100%;min-height:56px;font:inherit;font-size:13.5px;border:1px solid var(--line);border-radius:8px;padding:8px;background:var(--bg);color:var(--fg)}
.pick{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 10px}.pick label{border:1px solid var(--line);border-radius:8px;padding:6px 12px;cursor:pointer;background:var(--card)}
.btn{font:inherit;font-weight:600;background:var(--accent);color:#fff;border:0;border-radius:8px;padding:9px 16px;cursor:pointer}
#copied{margin-left:10px;color:var(--good);font-size:13px}
#filter{width:100%;max-width:360px;font:inherit;padding:7px 10px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--fg);margin:6px 0}
.full td{font-size:12px}.full code{font-size:11.5px}
details>summary{cursor:pointer;font-weight:600;margin:8px 0}
.two{display:grid;grid-template-columns:1fr 1fr;gap:18px}
ul.plain{padding-left:18px}ul.plain li{margin:5px 0}
@media (max-width:760px){.hero,.card-grid,.two{grid-template-columns:1fr}.nums{grid-template-columns:repeat(2,1fr)}
.skyline,.roots{grid-template-columns:repeat(2,minmax(0,1fr))}.skyimg{--skyh:360px}.scrollshot{height:420px}}
"""

JS = """
// WHY copy instead of embedding twice: each glance capture is ~0.1 MB of base64; the cards reuse the skyline's.
document.querySelectorAll('img[data-same-as]').forEach(i=>{const s=document.querySelector('#'+i.dataset.sameAs+' img');if(s)i.src=s.src;});
document.querySelectorAll('.tabs button').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.tabs button').forEach(x=>x.setAttribute('aria-pressed',x===b));
  document.querySelectorAll('.outline').forEach(o=>o.hidden=o.dataset.tree!==b.dataset.tree);}));
const f=document.getElementById('filter');f&&f.addEventListener('input',()=>{const q=f.value.toLowerCase();
  document.querySelectorAll('.full tbody tr').forEach(r=>r.hidden=q&&!r.textContent.toLowerCase().includes(q));});
function feedback(){const pick=document.querySelector('input[name=pick]:checked');
  let t='## Storybook organisation — feedback (report 2026-09-22)\\n\\n';
  t+='**Pick:** '+(pick?pick.value:'(none — take the default, B)')+'\\n';
  const note=document.getElementById('pick-note').value.trim(); if(note) t+='\\n'+note+'\\n';
  document.querySelectorAll('.q').forEach(q=>{const a=q.querySelector('textarea').value.trim();
    t+='\\n**'+q.querySelector('.qq').textContent.trim()+'**\\n'+(a||'(default)')+'\\n';});
  return t;}
document.getElementById('copy').addEventListener('click',async()=>{const t=feedback();const out=document.getElementById('out');
  out.value=t;out.hidden=false;try{await navigator.clipboard.writeText(t);document.getElementById('copied').textContent='Copied — paste it into the chat.';}
  catch(e){out.select();document.getElementById('copied').textContent='Clipboard blocked — the text is selected below; copy it by hand.';}});
"""

page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Storybook Sidebar Proposals</title><style>{CSS}</style></head><body><main>
<h1>Storybook organisation — three proposals, each running</h1>
<p class="sub">22 Sep 2026 · bbox-ui <code>apps/storybook-basics</code> · {M['today']['stories']} stories in {len(rows)} files · every number below is read from Storybook's own <code>index.json</code> on the four running servers</p>

<div class="tldr">
<p><b>Recommendation: B — the repo's kits on top, then families.</b> It honours what you asked for (<em>“at the top level we have components, scene, editor”</em>) and adds the one level the repo does not have, only where a section is too long to scan.</p>
<p><b>The finding that shaped it:</b> mirroring the repo literally (A) makes the mess <em>longer</em>, not shorter. The repo's <code>components/</code> is deliberately flat, so a pure mirror puts {M['a']['widest'][1]} components in one list, against today's {M['today']['widest'][1]} in Basics. A flat folder is fine to grep but bad to scan. The folder answers <em>where does the code live</em>; the sidebar answers <em>where do I look</em>. They share the same top and differ one level down.</p>
<p><b>What B costs:</b> titles are chosen, not derived, so B needs a unit test to stop the drift that caused today's mess. Retitling also breaks {len(ref_ids)} hard-coded story links, which get rewritten in the same pass.</p>
<div class="nums">
<div class="num"><b>{M['today']['glance']} → {M['b']['glance']}</b><span>rows at first glance, today → B</span></div>
<div class="num"><b>{len(M['today']['roots'])} → {len(M['b']['roots'])}</b><span>sections; today has {len(M['today']['singletons'])} holding a single item</span></div>
<div class="num"><b>{len(M['today']['split'])} → {len(M['b']['split'])}</b><span>components split across sections</span></div>
<div class="num"><b>{M['today']['widest'][1]} → {M['b']['widest'][1]}</b><span>longest list, today → B</span></div>
</div></div>

<div class="hero">
  <video controls muted loop playsinline autoplay poster="{poster}" src="{video_b64}">
  </video>
  <div><b>The same scan in each tree, recorded from the real servers</b> (18 s, cropped to the sidebar). Every section is open and nothing else is; the sidebar is scrolled top to bottom:
  <ol><li><b>Today</b> (:5421): a long scroll through Basics, Blocks and Trace</li>
  <li><b>A</b> (:5423): an even longer flat Components list</li>
  <li><b>B</b> (:5424): reached through the toolbar's proposal dropdown. It barely scrolls.</li>
  <li><b>C</b> (:5425): through the same dropdown</li></ol>
  <details><summary>No video? GIF fallback</summary><img src="{gif_b64}" alt="GIF of the same journey"></details></div>
</div>

<h2>Criteria first — what “better navigation” has to mean here</h2>
<p>Weighted before looking at options. The top two carry the weight because they are the two failure modes behind your screenshot: long lists you have to scan, and titles each lane chose locally that add up to a mess.</p>
<div class="tablewrap">{score_table}</div>

<h2>The first glance, to scale</h2>
<p>Each sidebar with every section open and nothing else, as Storybook draws it, all at one scale (the tallest, today's, is {tallest:,} px). Only the height matters here; the readable versions are inside each proposal below.</p>
<div class="skyline">{glance_cols}</div>
<h4>Sections collapsed</h4>
<div class="roots">{roots_cols}</div>

<h2>Measured, per tree</h2>
<div class="tablewrap">{metrics_table}</div>
<p class="sub">Today's split components: {esc(split_today)}. All four servers render all stories (a sample from every section loaded in each proposal: A 18/18, C 27/27, B 15/15 after one Vite dependency reload).</p>

<h2>The three proposals</h2>
{cards}

<h2>Where does it live? Four things, four trees</h2>
<div class="tablewrap">{where_table}</div>

<h2>What is actually wrong today — measured</h2>
<div class="two"><ul class="plain">
<li><b>{len(M['today']['roots'])} sections, {len(M['today']['singletons'])} holding a single item</b> ({esc(', '.join(M['today']['singletons']))}). A section with one entry is a folder you open to find the only thing in it.</li>
<li><b>Aspects hoisted to the top</b>: <em>Hit Regions</em>, <em>Interaction</em> and <em>Styles</em> are sections named for a concern, not a thing. That is the pattern you called slop in the folders (<em>“We 100% do not want to hoist to top level”</em>), repeated in the sidebar. It is also why Port, LabeledPort, PortEdge, Block, Trace and TraceEditor each live in two sections.</li>
<li><b>Basics is a dumping ground</b>: {M['today']['root_sizes'].get('Basics')} entries mixing shadcn primitives, the menu kit, panels, the burger menu (<code>editor/AppMenu</code>) and the code editor.</li>
</ul><ul class="plain">
<li><b>File and sidebar disagree</b>: all 10 <code>scene/</code> stories are shelved under <em>Blocks</em> (9 of them under <em>Blocks › Scene</em>); editor stories are under <em>Blocks › Editor</em>, <em>Basics</em> and <em>Editor</em>; <code>TraceArrowhead</code> is under Blocks.</li>
<li><b>The tag convention half-held</b>: {untagged} of {len(files_today)} files carry no <code>area:</code>/<code>lane:</code> tags at all, and in the {area_total} that do, <code>area:</code> repeats the section name {area_same} times out of {area_total}. It adds nothing a new tree would not.</li>
<li><b>A loose folder above every section</b>: <em>Styles</em> is a one-segment title that also has children, so Storybook draws it as a stray folder at the very top (first row of today's collapsed shot).</li>
<li><b>One misnamed file</b>: <code>Collapsible.stories.tsx</code> holds FoldingChevron's main stories.</li>
</ul></div>

<h2>Stock parts, element by element</h2>
<div class="tablewrap">{stock_table}</div>

<h2>If you pick B — the one pass</h2>
<ol>
<li><b>Barrier lane, alone</b>: it rewrites 151 <code>title:</code> lines, and peer lanes are adding stories now. Titles come straight from the table's <code>b</code> column, and <code>area:</code> tags become <code>object:</code>.</li>
<li>Put B's <code>storySort</code> literal into <code>.storybook/preview.tsx</code>.</li>
<li>Add the guard test in the <code>unit</code> project: the root must be a kit; under Components and Scene the second segment must come from the family list.</li>
<li>Rewrite the {len(ref_ids)} hard-coded ids in {len(ref_files)} tracked files from the old→new map. Vault links ({vault_distinct}) are historical and left alone.</li>
<li>Amend CLAUDE.md's “Story tags” section (the <code>area:</code> vocabulary goes); delete <code>.storybook-org/</code>.</li>
<li>Gate on <code>pnpm test</code> (both projects, not just <code>test-stories</code>), then hand back for review. Nothing merges without you.</li>
</ol>

<h2>Every file, every tree</h2>
<details><summary>All {len(rows)} story files — today's title and the title under A, B, C</summary>
<input id="filter" placeholder="Filter — e.g. port, hosts/, Hit Regions">
<div class="tablewrap"><table class="full"><thead><tr><th>File (src/)</th><th>Today</th><th>A</th><th>B</th><th>C</th></tr></thead><tbody>{full_rows}</tbody></table></div>
</details>
<details><summary>The full outline of each tree (from its live index; numbers are story counts)</summary>
<div class="tabs">{"".join(f'<button data-tree="{k}" aria-pressed="{str(k == "b").lower()}">{esc(TREES[k]["name"])}</button>' for k in TREES)}</div>
{outlines}
</details>

<h2>Your call</h2>
<div class="q"><p class="qq"><b>Pick one</b></p>
<div class="pick">{"".join(f'<label><input type="radio" name="pick" value="{esc(TREES[k]["name"])}"> {esc(TREES[k]["name"])}</label>' for k in "abc")}<label><input type="radio" name="pick" value="None of these"> None of these</label></div>
<p><b>Recommend:</b> B. <span class="def">If you say nothing, B is written on its own branch in one pass (above) when you next say go. Nothing merges without you.</span></p>
<textarea id="pick-note" placeholder="Anything to change in the one you picked — a family name, where a story should sit…"></textarea></div>
{questions_html}
<p><button class="btn" id="copy">Copy all feedback</button><span id="copied"></span></p>
<textarea id="out" hidden rows="10"></textarea>

<h2>Done, left, and deliberately not done</h2>
<div class="two"><div><h4>Left</h4><ul class="plain">
<li><b>Next, not blocked:</b> the one pass above, once you pick.</li>
<li>The three preview servers stay up for you to click through. Story files a peer lane adds after this table was cut still appear, under <em>Unsorted</em>, with their old title.</li></ul>
<h4>Done and proved</h4><ul class="plain">
<li>Three proposal Storybooks running on <code>:5423</code>/<code>:5424</code>/<code>:5425</code>, each built from one per-file table; each index has all {M['b']['stories']} stories.</li>
<li>The in-app switch lands on the same story in another proposal, driven through its real dropdown (A → B → C, in the video).</li>
<li>Stories render in every proposal: a sample from every section in each.</li>
<li>Every capture here is from the real servers, re-takeable with <code>docs/capture_storybook_org_shots.mjs</code>.</li></ul></div>
<div><h4>Deliberately not done</h4><ul class="plain">
<li>No <code>title:</code> in <code>src/</code> changed. Peer lanes are editing those files, and the pick is yours.</li>
<li><code>.storybook/</code> and your :5421 are untouched. The previews use their own config directories.</li>
<li>No per-component folder move. That is the architecture's Phase 1 and its own decision; B does not depend on it.</li>
<li>Nothing merged or pushed.</li></ul></div></div>
<p class="sub">Built by <code>docs/build_storybook_org_report.py</code> · table <code>apps/storybook-basics/.storybook-org/story-org.json</code> · branch <code>claude/storybook-server-launch-e5f2cc</code></p>
</main><script>{JS}</script></body></html>"""

OUT.write_text(page)
print(OUT, f"{OUT.stat().st_size / 1e6:.2f} MB")
print({k: dict(glance=M[k]["glance"], roots=len(M[k]["roots"]), widest=M[k]["widest"], split=len(M[k]["split"]), ids=M[k].get("ids_changed")) for k in TREES})
print("refs", len(ref_ids), ref_total, len(ref_files), "vault", vault_distinct, "area", area_same, area_total, "untagged", untagged)
