#!/usr/bin/env python3
"""Fold the adversarial checks back into the grammar sheets and emit ONE digest
that the drawing agents read.

    python3 docs/build_vocab_digest.py --sheets S --checks C --out DIGEST.md

WHY the correction is applied here and not left to the drawing agents to
reconcile: the checker found real, specific errors — Max's hot inlet is PINK
not blue, Simulink's Function Caller draws NO wire to its callee, Node-RED's
orange ring is selection chrome and not a subflow's identity. A drawing made
from the uncorrected sheet is a drawing of something that does not exist. The
correction wins, in writing, at the point the drawing agent reads it.
"""
from __future__ import annotations

import argparse, json, re, textwrap

KEYMAP = {"simulink-stateflow": "simulink"}
ORDER = ["unreal", "unity", "labview", "simulink", "houdini", "blender",
         "grasshopper", "nodered", "n8n", "flyde", "max"]


def norm(k):
    return KEYMAP.get(k, k)


def wrap(s, w=96, indent="      "):
    return textwrap.fill(re.sub(r"\s+", " ", s or "").strip(), w,
                         initial_indent=indent, subsequent_indent=indent)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheets", required=True)
    ap.add_argument("--checks", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--only", default="", help="comma-separated construct keys; omit src/quote lines")
    a = ap.parse_args()
    only = {x.strip() for x in a.only.split(",") if x.strip()}
    sheets = {norm(s["key"]): s for s in json.load(open(a.sheets))}
    checks = {norm(c["key"]): c for c in json.load(open(a.checks))}

    corr = {}          # (vocab, construct) -> [should_be, ...]
    ident_corr = {}    # vocab -> [should_be, ...]
    for k, c in checks.items():
        for f in c.get("invented", []):
            con = (f.get("construct") or "").strip()
            sb = f.get("should_be") or f.get("why") or ""
            if con.startswith("identity") or "identity" in con:
                ident_corr.setdefault(k, []).append(sb)
            else:
                # a finding may name several constructs ("literal (and the same claim in not-drawn)")
                for part in re.split(r"[,/]| and | \(", con):
                    part = part.strip().strip("`'\"").split(" ")[0]
                    if part:
                        corr.setdefault((k, part), []).append(sb)
        for f in c.get("bad_quotes", []):
            con = (f.get("construct") or "").strip().split(" ")[0]
            if con and not con.startswith("NOTE") and not con.startswith("NONE"):
                corr.setdefault((k, con), []).append("[quote is weak or does not support the claim] "
                                                     + (f.get("why") or "")[:180])

    out = ["# The eleven vocabularies — grammar digest",
           "",
           "Each was read from its own documentation, then adversarially checked. Where a",
           "CORRECTION line appears it **overrides** the line above it: the checker verified",
           "the original claim was wrong. Draw the corrected version.",
           ""]
    for k in ORDER:
        s = sheets.get(k)
        if not s:
            continue
        i = s.get("identity", {})
        out.append(f"\n## {s.get('name', k)}   `{k}`")
        out.append(f"  ONE LINE  {re.sub(r'  +', ' ', i.get('one_line',''))}")
        out.append(f"  FLOW      {i.get('flow','')}")
        out.append(f"  NODE      {i.get('node_shape','')}")
        out.append(f"  PORTS     {i.get('port_style','')}")
        out.append(f"  WIRE      {i.get('wire_style','')}")
        out.append(f"  EXEC WIRE {'YES — a separate white EXECUTION wire exists' if i.get('has_exec_wire') else 'NO — dependency alone is the order; never draw k:exec for this tool'}")
        for c in ident_corr.get(k, []):
            out.append(wrap("CORRECTION (identity): " + c, 92, "  !! "))
        out.append("")
        for con in s.get("constructs", []):
            name = con.get("construct", "")
            if only and name not in only:
                continue
            has = con.get("has", "")
            flag = {"yes": "YES    ", "partial": "PARTIAL", "no": "NO     "}.get(has, has)
            nt = f'  [{con["named_thing"]}]' if con.get("named_thing") else ""
            out.append(f"  - {name:22s} {flag}{nt}")
            out.append(wrap(con.get("mark", ""), 94, "      "))
            if not only:
                if con.get("doc_url"):
                    out.append(f"      src: {con['doc_url']}")
                if con.get("quote"):
                    out.append(wrap(f'"{con["quote"]}"', 94, "      > "))
            for c in corr.get((k, name), []):
                out.append(wrap("CORRECTION: " + c, 90, "      !! "))
        if s.get("refusals") and not only:
            out.append(wrap("REFUSES OUTRIGHT: " + ", ".join(s["refusals"]), 94, "    "))
    text = "\n".join(out)
    open(a.out, "w", encoding="utf-8").write(text)
    print(f"{len(text)//1024} KB digest -> {a.out}")
    print(f"{sum(len(v) for v in corr.values())} construct corrections, "
          f"{sum(len(v) for v in ident_corr.values())} identity corrections folded in")


if __name__ == "__main__":
    main()
