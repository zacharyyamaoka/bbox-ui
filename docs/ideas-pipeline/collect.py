#!/usr/bin/env python3
"""Pull every mined idea out of the workflow journal into one candidates.json."""
import json, pathlib, sys

J = pathlib.Path("/home/bam/.claude/projects/-home-bam-bbox-ui--claude-worktrees-port-primary-secondary-slot-3658dc/"
                 "33e26dbe-b892-4b95-979a-e4861aa72fc1/subagents/workflows/wf_2bc34e6f-7ba/journal.jsonl")
OUT = pathlib.Path("/tmp/claude-1000/-home-bam-bbox-ui--claude-worktrees-port-primary-secondary-slot-3658dc/"
                   "33e26dbe-b892-4b95-979a-e4861aa72fc1/scratchpad/ideas")

ideas, excl_reports, excl_props, inventory = [], [], [], []
for line in J.read_text().splitlines():
    d = json.loads(line)
    if d.get("type") != "result":
        continue
    v = d.get("result") or d.get("value")
    if not isinstance(v, dict):
        continue
    if v.get("ideas"):
        for it in v["ideas"]:
            it["slice"] = v.get("slice", "?")
            ideas.append(it)
    elif v.get("entries"):
        (excl_props if any("sourceFile" in e for e in v["entries"]) else excl_reports).extend(v["entries"])
    elif v.get("capabilities"):
        inventory = v

(OUT / "candidates.json").write_text(json.dumps(ideas, indent=1))
(OUT / "exclusions.json").write_text(json.dumps(
    {"reports": excl_reports, "proposals": excl_props}, indent=1))
if inventory:
    (OUT / "inventory.json").write_text(json.dumps(inventory, indent=1))

from collections import Counter
print(f"candidates: {len(ideas)}")
print("by slice:", dict(Counter(i['slice'] for i in ideas)))
print("by category:", dict(Counter(i['category'] for i in ideas)))
print(f"exclusions: {len(excl_reports)} report ideas + {len(excl_props)} repo proposals")
