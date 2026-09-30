#!/usr/bin/env python3
"""Merge verdicts onto candidates, dedup by conceptKey, and rank."""
import json, pathlib
from collections import Counter, defaultdict

I = pathlib.Path("/tmp/claude-1000/-home-bam-bbox-ui--claude-worktrees-port-primary-secondary-slot-3658dc/"
                 "33e26dbe-b892-4b95-979a-e4861aa72fc1/scratchpad/ideas")
J = pathlib.Path("/home/bam/.claude/projects/-home-bam-bbox-ui--claude-worktrees-port-primary-secondary-slot-3658dc/"
                 "33e26dbe-b892-4b95-979a-e4861aa72fc1/subagents/workflows/wf_ef5f053a-ecd/journal.jsonl")

cands = json.loads((I / "candidates.json").read_text())
verdicts = []
for line in J.read_text().splitlines():
    d = json.loads(line)
    if d.get("type") == "result" and isinstance(d.get("result"), dict):
        verdicts.extend(d["result"].get("verdicts", []))

by_index = {v["index"]: v for v in verdicts}
print(f"verdicts: {len(verdicts)} covering {len(by_index)} distinct indices of {len(cands)}")
print("verdict mix:", dict(Counter(v["verdict"] for v in verdicts)))

merged = []
for n, c in enumerate(cands):
    v = by_index.get(n)
    if not v:
        continue
    c = dict(c)
    c.update({k: v[k] for k in ("conceptKey", "verdict", "reason", "novelty",
                                "usefulness", "checkedAgainst") if k in v})
    if v.get("sharpenedTitle"):
        c["title"] = v["sharpenedTitle"]
    if v.get("sharpenedBody"):
        c["what"] = v["sharpenedBody"]
    c["index"] = n
    merged.append(c)

kept = [c for c in merged if c["verdict"] == "keep"]
print(f"kept {len(kept)}")

# dedup on conceptKey — keep the highest-scoring, remember the merged siblings
groups = defaultdict(list)
for c in kept:
    groups[c["conceptKey"]].append(c)
uniq = []
for key, g in groups.items():
    g.sort(key=lambda c: -(c["novelty"] * c["usefulness"]))
    best = dict(g[0])
    if len(g) > 1:
        best["alsoFrom"] = [x["priorArt"] for x in g[1:]]
        best["mergedCount"] = len(g)
    uniq.append(best)

uniq.sort(key=lambda c: (-(c["novelty"] * c["usefulness"]), -c["usefulness"], c["title"]))
print(f"after conceptKey dedup: {len(uniq)}  (merged {len(kept) - len(uniq)} siblings)")
print("categories:", dict(Counter(c["category"] for c in uniq)))
print("\nTOP 20:")
for i, c in enumerate(uniq[:20], 1):
    m = f" [+{c.get('mergedCount',1)-1}]" if c.get("mergedCount") else ""
    print(f"{i:3}. ({c['novelty']}x{c['usefulness']}={c['novelty']*c['usefulness']:2}) "
          f"[{c['category'][:6]}]{m} {c['title']}")

(I / "ranked.json").write_text(json.dumps(uniq, indent=1))
print(f"\nwrote ranked.json ({len(uniq)})")
