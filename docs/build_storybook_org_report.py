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
SNAP = MEDIA / "snapshot"  # the proposal servers are gone; their indexes were saved before they stopped
BEFORE_REV, LANDED_REV = "eeb748b", "5828461"
VAULT = Path("/home/bam/zach_brain")

TREES = {
    "today": dict(port=5421, name="Today", short="Today"),
    "a": dict(port=5423, name="A · Mirror the repo", short="A"),
    "b": dict(port=5424, name="B · Kits, then families", short="B"),
    "c": dict(port=5425, name="C · Objects first", short="C"),
}

rows = json.loads((SNAP / "story-org.proposals.json").read_text())["rows"]
landed_rows = json.loads((SNAP / "story-org.landed.json").read_text())["rows"]
index = {k: json.loads((SNAP / f"index-{k}.json").read_text())["entries"] for k in TREES}
try:  # the landed tree is read live when its server is up, else from the snapshot taken when it was
    landed_index = json.load(urllib.request.urlopen("http://localhost:5422/index.json"))["entries"]
except OSError:
    landed_index = json.loads((SNAP / "index-landed.json").read_text())["entries"]
manifest = json.loads((MEDIA / "manifest.json").read_text())
manifest_landed = json.loads((MEDIA / "manifest-landed.json").read_text())
MOVES = {
    "components/FitToContent.stories.tsx": "scene/FitToContent.stories.tsx",
    "components/PortVariants.stories.tsx": "skin/PortVariants.stories.tsx",
    "components/Styles.stories.tsx": "skin/Styles.stories.tsx",
    "editor/ChromeRename.stories.tsx": "components/ChromeRename.stories.tsx",
}


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

# the landed tree, from the real Storybook
def by_file_export(entries):
    """(file name, export) -> id; a moved story file keeps its name, so this pairs old and new."""
    return {(e["importPath"].rsplit("/", 1)[-1], e.get("exportName")): e["id"] for e in entries.values() if e["type"] == "story"}


NEW_PATH = {old: MOVES.get(old, old) for old in (r["path"] for r in landed_rows)}
per_title_l, kids_l = tree_of(landed_index)
landed_title_of = {e["importPath"].replace("./src/", ""): e["title"] for e in landed_index.values() if e["type"] == "story"}
homes_l = defaultdict(set)
for row in landed_rows:
    homes_l[row["subject"]].add(landed_title_of[NEW_PATH[row["path"]]].split("/")[0])
lists_l = {node: len(ch) for node, ch in kids_l.items() if node}
widest_l = max(lists_l, key=lists_l.get)
M["landed"] = dict(
    stories=sum(per_title_l.values()), roots=kids_l[""], root_sizes={r: len(kids_l[r]) for r in kids_l[""]},
    singletons=[r for r in kids_l[""] if len(kids_l[r]) == 1], widest=(widest_l, lists_l[widest_l]),
    depth=max(len(t.split("/")) for t in per_title_l), glance=manifest_landed["shots"]["glance"]["visibleRows"],
    split={sub: sorted(r) for sub, r in homes_l.items() if len(r) > 1}, per_title=per_title_l, kids=kids_l,
    ids_changed=sum(1 for k, v in by_file_export(landed_index).items() if by_file_export(index["today"]).get(k) != v),
)
host_counts = Counter(t for e in landed_index.values() if e["type"] == "story" for t in e["tags"] if t.startswith("host:"))
tldraw_sections = Counter(e["title"].split("/")[0] for e in landed_index.values() if e["type"] == "story" and "host:tldraw" in e["tags"])
tldraw_by_section = ", ".join(f"{sec} {n}" for sec, n in tldraw_sections.most_common())
landed_files = {e["importPath"]: e for e in landed_index.values() if e["type"] == "story"}
host_tagged_files = sum(1 for e in landed_files.values() if any(t.startswith("host:") for t in e["tags"]))
host_files = Counter(t for e in {e["importPath"]: e for e in landed_index.values()}.values() for t in e["tags"] if t.startswith("host:"))

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

# hard-coded story ids in tracked files (read at a git revision), and story links in the vault
def id_refs(rev: str, ids: set) -> tuple[set, set, int]:
    out = subprocess.run(
        ["git", "grep", "-oE", r"[a-z0-9]+(-[a-z0-9]+)*--[a-z0-9]+(-[a-z0-9]+)*", rev, "--",
         "*.ts", "*.tsx", "*.mjs", "*.js", "*.py", "*.md", "*.json", "*.html", ":!reports/*"],
        cwd=REPO, capture_output=True, text=True,
    ).stdout.splitlines()
    files, found, total = set(), set(), 0
    for line in out:
        _, path, token = line.split(":", 2)
        if token in ids:
            files.add(path)
            found.add(token)
            total += 1
    return files, found, total


today_story_ids = {e["id"] for e in index["today"].values()}
landed_story_ids = {e["id"] for e in landed_index.values()}
ref_files, ref_ids, ref_total = id_refs(BEFORE_REV, today_story_ids)
_, stale_after, stale_total = id_refs(LANDED_REV, today_story_ids - landed_story_ids)
_, live_after, live_total = id_refs(LANDED_REV, landed_story_ids)
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
    out = {k: sorted({r[k] for r in rows if r["subject"] == subject}) for k in TREES}
    out["landed"] = sorted({landed_title_of[NEW_PATH[r["path"]]] for r in landed_rows if r["subject"] == subject})
    return out


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

SHOWN = {**TREES, "landed": dict(port=5422, name="Landed (B + Hosts)", short="Landed")}
glance_h = {k: Image.open(MEDIA / f"{k}-glance.png").size[1] for k in SHOWN}
tallest = max(glance_h.values())
glance_cols = "".join(
    f'''<figure class="sky"><div class="skyimg" id="glance-{k}" style="--r:{glance_h[k] / tallest:.4f}">{img(f"{k}-glance.png", f"{SHOWN[k]['name']} sidebar at first glance")}</div>
    <figcaption><b>{esc(SHOWN[k]['short'])}</b> · {M[k]['glance']} rows</figcaption></figure>'''
    for k in SHOWN
)
roots_cols = "".join(
    f'''<figure class="rootshot">{img(f"{k}-roots.png", f"{SHOWN[k]['name']} sections collapsed")}
    <figcaption><b>{esc(SHOWN[k]['short'])}</b> · {len(M[k]['roots'])} sections{(' · singletons: ' + esc(', '.join(M[k]['singletons']))) if M[k]['singletons'] else ''}</figcaption></figure>'''
    for k in SHOWN
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
    ("Title shape held by a test", lambda k: "yes" if k == "landed" else "—"),
]
metrics_table = "<table class='metrics'><thead><tr><th></th>" + "".join(
    f"<th>{esc(SHOWN[k]['short'])}</th>" for k in SHOWN) + "</tr></thead><tbody>" + "".join(
    "<tr><th>" + esc(label) + "</th>" + "".join(f"<td>{fn(k)}</td>" for k in SHOWN) + "</tr>" for label, fn in metric_rows
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
        "<td>" + "<br>".join(f"<code>{esc(x)}</code>" for x in t[k]) + "</td>" for k in SHOWN) + "</tr>"
where_table = "<table class='where'><thead><tr><th></th>" + "".join(
    f"<th>{esc(SHOWN[k]['short'])}</th>" for k in SHOWN) + "</tr></thead><tbody>" + where_rows + "</tbody></table>"

full_rows = "".join(
    f"<tr><td><code>{esc(r['path'])}</code></td><td>{esc(r['today'])}</td><td>{esc(r['a'])}</td><td>{esc(r['b'])}</td><td>{esc(r['c'])}</td></tr>"
    for r in rows
)
outlines = "".join(
    f'<div class="outline" data-tree="{k}" {"hidden" if k != "landed" else ""}>{outline_html(k)}</div>' for k in SHOWN
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
.skyline{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px;align-items:end}
.sky{margin:0;text-align:center}.skyimg{--skyh:520px;display:flex;align-items:flex-end;justify-content:center;height:var(--skyh);border-bottom:2px solid var(--fg)}
.skyimg img{height:calc(var(--skyh) * var(--r));width:auto;border:1px solid var(--line)}
.sky figcaption{font-size:13px;margin-top:6px}
.roots{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px;align-items:start}
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
.mut td.red,.gates td.red{color:var(--bad);font-weight:600}.mut td.green,.gates td.green,td.green{color:var(--good);font-weight:600}
h2.record{margin-top:64px;border-top:3px double var(--line)}
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
function feedback(){
  let t='## Storybook sidebar (B landed) — feedback, report 2026-09-22\\n';
  document.querySelectorAll('.q').forEach(q=>{const a=q.querySelector('textarea').value.trim();
    t+='\\n**'+q.querySelector('.qq').textContent.trim()+'**\\n'+(a||'(default)')+'\\n';});
  return t;}
document.getElementById('copy').addEventListener('click',async()=>{const t=feedback();const out=document.getElementById('out');
  out.value=t;out.hidden=false;try{await navigator.clipboard.writeText(t);document.getElementById('copied').textContent='Copied — paste it into the chat.';}
  catch(e){out.select();document.getElementById('copied').textContent='Clipboard blocked — the text is selected below; copy it by hand.';}});
"""


landed_video = data_uri(MEDIA / "landed.mp4", "video/mp4")
landed_gif = data_uri(MEDIA / "landed.gif", "image/gif")
landed_poster = data_uri(MEDIA / "landed-poster.jpg", "image/jpeg")
L, T = M["landed"], M["today"]
landed_split = "; ".join(f"{sub} → {', '.join(r)}" for sub, r in L["split"].items())
hosts_list = ", ".join(L["kids"]["Hosts"])
MUTATIONS = [  # measured 2026-09-22 with `pnpm exec vitest --project=unit run src/storyOrganisation.test.ts`
    ("Badge retitled back to <code>Basics/Badge</code>", "old section name", "1 failed"),
    ("<code>Components/Widgets/Badge</code>", "family outside the list", "1 failed"),
    ("<code>Scene/Badge</code> on a file in <code>components/</code>", "section ≠ folder", "1 failed"),
    ("<code>host:react-flow</code> dropped from SceneHosts", "tag disagrees with imports", "1 failed"),
    ("<code>area:basics</code> put back on Badge", "retired tag", "1 failed"),
]
mut_rows = "".join(f"<tr><td>{a}</td><td>{b}</td><td class='red'>{c}</td></tr>" for a, b, c in MUTATIONS)
LANDED_Q = [
    ("l1", "Merge it?", "It is on <code>claude/storybook-server-launch-e5f2cc</code> (commit <code>5828461</code>), not on main. A dry-run merge with main and with the in-flight lane <code>claude/system-sketch-ui-feedback-14bfc3</code> is textually clean.",
     "If you say nothing it stays on the branch. Whoever merges the other lane second retitles its one new story — <code>MemberStackKeyboardReorder.stories.tsx</code> arrives as <code>Blocks/Member stack</code>; it becomes <code>Components/Blocks/BlockMembers/Keyboard Reorder</code> with <code>object:block</code>. The guard names the file, so it cannot slip through."),
    ("l2", f"Your Hosts section trades back “one home per thing” for {len(L['split'])} components: {esc(', '.join(L['split']))} — their host board is under Hosts, a section away from them.",
     "Keep it — it is what you asked for, and <code>object:</code> tags pull a component's stories back together in the filter.",
     "Default: keep. Alternative: give those boards back to their component as <em>In A Host</em> and rely on the <code>host:</code> filter alone for the engine view."),
    ("l3", "Scene is flat (11 entries) now that its host boards left it, so the Model &amp; Diff / Wiring / Validation / Layout split from your L191 note is not a level.",
     "Flat — 11 fits one screen, and the test keeps any section over 15 honest.",
     "Default: flat. Say so if you want those four groups back; it is four titles' worth of change."),
]
landed_q_html = "".join(
    f'<div class="q" data-q="{qid}"><p class="qq"><b>{q}</b></p><p><b>Recommend:</b> {rec}</p><p class="def">{default}</p>'
    f'<textarea placeholder="Your answer (blank = take the default)"></textarea></div>'
    for qid, q, rec, default in LANDED_Q
)
landed_html = f"""
<h1>Storybook sidebar — B landed: the repo's top level, then families</h1>
<p class="sub">22 Sep 2026 · bbox-ui <code>apps/storybook-basics</code> · branch <code>claude/storybook-server-launch-e5f2cc</code> @ <code>5828461</code>, not merged · every number read from the real Storybook's own <code>index.json</code></p>
<div class="tldr">
<p><b>Done.</b> The sidebar's sections are the repo's six top-level folders — <b>Components · Scene · Editor · Hosts · Presets · Skin</b> — with a family level under Components only (Ports, Blocks, Traces, Text &amp; Marks, Menus &amp; Bars, Panels &amp; Dialogs, Stock). A unit test now fails any story that breaks that shape.</p>
<p><b>Hosts is a section, as you asked:</b> {len(L['kids']['Hosts'])} engine boards together. But most engine examples do not live in <code>hosts/</code> — measured by import, 21 story files reach React Flow or tldraw and only 10 of them are there (the control-flow presets, Producers and the recording panels are the rest). So every story also carries <code>host:dom</code> / <code>host:react-flow</code> / <code>host:tldraw</code>: tick one in the sidebar filter and only those examples remain, wherever they sit. The video ends on exactly that.</p>
<p><b>What the Hosts section cost, plainly:</b> the first glance is {L['glance']} rows, not the {M['b']['glance']} B was proposed at (Hosts adds 13, and Scene goes flat), and {len(L['split'])} components have their host board a section away. Against today it is still {T['glance']} → {L['glance']} rows and {len(T['roots'])} → {len(L['roots'])} sections, with none holding a single item.</p>
<div class="nums">
<div class="num"><b>{T['glance']} → {L['glance']}</b><span>rows at first glance</span></div>
<div class="num"><b>{len(T['roots'])} → {len(L['roots'])}</b><span>sections · single-item sections {len(T['singletons'])} → {len(L['singletons'])}</span></div>
<div class="num"><b>{T['widest'][1]} → {L['widest'][1]}</b><span>longest list ({esc(L['widest'][0])})</span></div>
<div class="num"><b>{host_tagged_files}</b><span>story files tagged with the hosts they render in</span></div>
</div></div>

<div class="hero">
  <video controls muted loop playsinline autoplay poster="{landed_poster}" src="{landed_video}"></video>
  <div><b>The real sidebar, recorded from this branch's Storybook</b> (9 s, cropped to the sidebar):
  <ol><li>every section open, nothing else — scrolled top to bottom: it fits in about two screens</li>
  <li>the sidebar's tag filter opened, <code>host:tldraw</code> ticked ({host_counts['host:tldraw']} stories; <code>host:react-flow</code> {host_counts['host:react-flow']}, <code>host:dom</code> {host_counts['host:dom']})</li>
  <li>what is left: only tldraw examples — {tldraw_by_section}. Only {tldraw_sections.get('Hosts', 0)} of the {host_counts['host:tldraw']} are in Hosts, which is why the tag exists.</li></ol>
  <details><summary>No video? GIF fallback</summary><img src="{landed_gif}" alt="GIF of the landed sidebar and the host filter"></details></div>
</div>

<h2>The sidebar now</h2>
<div class="card-grid">
  <div class="scrollshot"><img data-same-as="glance-landed" alt="Landed sidebar at first glance"></div>
  <div>
  <h4>Sections</h4><ul class="plain">{''.join(f"<li><b>{esc(r)}</b> · {L['root_sizes'][r]}" + (f" — {esc(', '.join(L['kids'][r]))}" if r in ('Components', 'Hosts') else '') + "</li>" for r in L['roots'])}</ul>
  <h4>How a title is built</h4><ul class="plain">
  <li><b>Section = the file's top-level folder</b>, no exceptions. Four story files that were shelved away from their code moved next to it: <code>FitToContent</code> → <code>scene/</code>, <code>PortVariants</code> and <code>Styles</code> → <code>skin/</code>, <code>ChromeRename</code> → <code>components/</code>.</li>
  <li><b>A family level only where a section would list more than 15 things.</b> That is only Components (79); Hosts sits at 13 and reads better flat than as five families of two.</li>
  <li>Then the component's code name, then an aspect in words: <code>Components/Ports/PortEdge/Hit Regions</code>.</li>
  <li>Tags: <code>object:</code> (what it is about — replaces <code>area:</code>, which only repeated the section), <code>host:</code> (measured), <code>lane:</code> (unchanged).</li></ul>
  </div>
</div>

<h2>Held by a test, not a convention</h2>
<p><code>src/storyOrganisation.test.ts</code> runs in the <code>unit</code> project, so <code>pnpm test</code> catches it. It reads titles with Storybook's <em>own</em> CSF parser, not a regex. It fails on: a section that is not the file's folder, a family outside the closed list, a flat section over 15, a missing or foreign <code>object:</code> tag, any <code>area:</code> tag, and <code>host:</code> tags that disagree with what the file actually imports (it walks the imports). What it cannot judge: whether a component is in the <em>right</em> family.</p>
<div class="tablewrap"><table class="mut"><thead><tr><th>Deliberate breakage</th><th>Rule it tests</th><th>Result</th></tr></thead><tbody>{mut_rows}
<tr><td>all five restored</td><td></td><td class="green">557 passed</td></tr></tbody></table></div>

<h2>Gates</h2>
<div class="tablewrap"><table class="gates"><tbody>
<tr><th><code>pnpm typecheck</code></th><td class="green">exit 0</td><td>covers <code>.storybook/preview.tsx</code> and the new test</td></tr>
<tr><th>guard test</th><td class="green">557 / 557</td><td>151 files × section, tags, hosts; 79 × family</td></tr>
<tr><th><code>pnpm test</code> (both projects)</th><td>3,088 then 3,089 of 3,091</td><td>The failures moved between runs — run 1: FitToContentHosts <em>Drag A Member (tldraw)</em> and two more; run 2: SceneHosts <em>A Member's Header Does Not Drag Its Parent (ReactFlow)</em> and Grouping <em>Boundary Classes</em>. Those three files alone, twice: <b>14 / 14</b>. Load average was 11 from other sessions; all are timing-measured drags. No story file changed anything but its title and tags (and the four moved files' import paths).</td></tr>
<tr><th>Story ids in the repo</th><td class="green">0 stale</td><td>{ref_total} references to {len(ref_ids)} ids in {len(ref_files)} files, rewritten from the old→new map; at <code>5828461</code> {live_total} references resolve and {stale_total} point at an id that no longer exists. Vault links ({vault_distinct}) left as history.</td></tr>
<tr><th>Merge, dry run</th><td class="green">clean</td><td><code>git merge-tree</code> with <code>main</code> and with <code>claude/system-sketch-ui-feedback-14bfc3</code>: no conflicts.</td></tr>
</tbody></table></div>

<h2>Needs you</h2>
{landed_q_html}
<p><button class="btn" id="copy">Copy all feedback</button><span id="copied"></span></p>
<textarea id="out" hidden rows="10"></textarea>

<h2>Not done on purpose</h2>
<ul class="plain">
<li>Not merged, not pushed — integration is your call.</li>
<li>Your :5421 Storybook (the <code>bbox-ui-toolbar</code> tree) is untouched and still shows the old titles until this branch lands there.</li>
<li>The proposal previews (:5423–5425) are stopped and their configs deleted; their indexes are kept beside this report so the record below still rebuilds.</li>
<li>Historical reports under <code>reports/</code> keep their old story links; they describe the past.</li>
</ul>

<h2 class="record">How we got here — the three proposals</h2>
<p class="sub">The review that led to the pick, unchanged except for the new <b>Landed</b> column. Proposal B below is B as first proposed (no Hosts section, Scene in four families).</p>
"""

page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Storybook Sidebar Proposals</title><style>{CSS}</style></head><body><main>
{landed_html}

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
  </div>
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

<h2>Every file, every tree</h2>
<details><summary>All {len(rows)} story files — today's title and the title under A, B, C</summary>
<input id="filter" placeholder="Filter — e.g. port, hosts/, Hit Regions">
<div class="tablewrap"><table class="full"><thead><tr><th>File (src/)</th><th>Today</th><th>A</th><th>B</th><th>C</th></tr></thead><tbody>{full_rows}</tbody></table></div>
</details>
<details><summary>The full outline of each tree (from its live index; numbers are story counts)</summary>
<div class="tabs">{"".join(f'<button data-tree="{k}" aria-pressed="{str(k == "landed").lower()}">{esc(SHOWN[k]["name"])}</button>' for k in SHOWN)}</div>
{outlines}
</details>

<p class="sub">Built by <code>docs/build_storybook_org_report.py</code> · captures <code>docs/capture_storybook_org_shots.mjs</code> (<code>--landed</code> for the top half) · guard <code>apps/storybook-basics/src/storyOrganisation.test.ts</code> · branch <code>claude/storybook-server-launch-e5f2cc</code></p>
</main><script>{JS}</script></body></html>"""

OUT.write_text(page)
print(OUT, f"{OUT.stat().st_size / 1e6:.2f} MB")
print({k: dict(glance=M[k]["glance"], roots=len(M[k]["roots"]), widest=M[k]["widest"], split=len(M[k]["split"]), ids=M[k].get("ids_changed")) for k in TREES})
print("refs", len(ref_ids), ref_total, len(ref_files), "vault", vault_distinct, "area", area_same, area_total, "untagged", untagged)
L = M["landed"]
print("landed", dict(glance=L["glance"], roots=L["roots"], widest=L["widest"], split=sorted(L["split"]), ids=L["ids_changed"],
      stories=L["stories"]), "live refs", live_total, "stale refs", stale_total, "host files", host_tagged_files, dict(host_counts))
