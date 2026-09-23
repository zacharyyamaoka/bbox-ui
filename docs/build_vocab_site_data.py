#!/usr/bin/env python3
"""Emit everything apps/vocab-boards needs to BE the deliverable.

    python3 docs/build_vocab_site_data.py --scenarios S --sheets SH --buckets B \
        --images IMGDIR --narrative N --out APPDIR

Zach, 2026-09-23: "Instead of a report, just make a live server please!" — so
there is no self-contained HTML any more. The app carries the whole thing: the
Python scenarios, the mechanism buckets, the resolved citations, the proof
screenshots, the agreement matrix and the decision surface.

WHY citations are resolved HERE rather than in the app: a drawing agent named
only (vocabulary, construct). The documentation URL, the tool's own name for the
thing and the verbatim quote are looked up from the sheets that were checked
against the live pages, so nothing on the page is a model's recollection.
"""
from __future__ import annotations

import argparse, itertools, json, os, shutil, sys

VOCAB_ORDER = ["unreal", "unity", "labview", "simulink", "houdini", "blender",
               "grasshopper", "flyde", "nodered", "n8n", "max"]
VOCAB_NAME = {
    "unreal": "Unreal Blueprints", "unity": "Unity Visual Scripting",
    "labview": "LabVIEW", "simulink": "Simulink", "houdini": "Houdini",
    "blender": "Blender Geometry Nodes", "grasshopper": "Grasshopper",
    "nodered": "Node-RED", "n8n": "n8n", "flyde": "Flyde", "max": "Max/MSP",
}
SECTION_ORDER = ["g-boundary", "g-values", "g-choice", "g-loops", "g-comps",
                 "g-streams", "g-failure", "g-scope", "g-facets"]
SECTION_SHORT = {
    "g-boundary": "Boundary", "g-values": "Values", "g-choice": "Choice",
    "g-loops": "Repetition", "g-comps": "Comprehensions", "g-streams": "Streams",
    "g-failure": "Failure", "g-scope": "Scope", "g-facets": "Composition",
}


def resolve_evidence(sheets, kept):
    out = {}
    for s in sheets:
        for c in s.get("constructs", []):
            out[(s["key"], c.get("construct", ""))] = dict(
                vocab=s["key"], url=c.get("doc_url", ""), quote=c.get("quote", ""),
                named_thing=c.get("named_thing", ""), has=c.get("has", ""),
                confidence=c.get("confidence", ""))
    for k, ims in (kept or {}).items():
        for im in ims:
            key = (k, im.get("construct", ""))
            if key in out and not out[key].get("image"):
                out[key]["image"] = im["key"]
    return out


def main():
    ap = argparse.ArgumentParser()
    for a in ("scenarios", "sheets", "buckets", "images", "out"):
        ap.add_argument("--" + a, required=True)
    ap.add_argument("--narrative", default="")
    a = ap.parse_args()

    scen = json.load(open(a.scenarios))
    sheets = json.load(open(a.sheets))
    buckets = {b["scenario"]: b for b in json.load(open(a.buckets))}
    manifest = json.load(open(os.path.join(a.images, "manifest.json")))
    kept_path = os.path.join(a.images, "kept.json")
    kept = json.load(open(kept_path)) if os.path.exists(kept_path) else {}
    narrative = json.load(open(a.narrative)) if a.narrative else {}
    ev_index = resolve_evidence(sheets, kept)

    # images become ordinary served files — no data URIs, no size ceiling
    img_dir = os.path.join(a.out, "public", "img")
    os.makedirs(img_dir, exist_ok=True)
    used = set()
    for sc in buckets.values():
        for b in sc.get("buckets", []):
            for raw in b.get("evidence", [])[:4]:
                e = ev_index.get((raw.get("vocab", ""), raw.get("construct", "")))
                if e and e.get("image"):
                    used.add(e["image"])
    used |= {f"hero-{k}" for k in VOCAB_ORDER}
    shipped = {}
    for key in sorted(used):
        src = os.path.join(a.images, manifest.get(key, ""))
        if manifest.get(key) and os.path.exists(src):
            dst = os.path.join(img_dir, key + ".png")
            shutil.copyfile(src, dst)
            shipped[key] = f"/img/{key}.png"

    # boards, flattened for the renderer; ids are stable and URL-safe
    boards, out_scen = [], []
    for c in scen:
        sc = buckets.get(c["id"], {})
        bks = []
        for bi, b in enumerate(sc.get("buckets", [])):
            ev = []
            seen = set()
            for raw in b.get("evidence", [])[:4]:
                e = ev_index.get((raw.get("vocab", ""), raw.get("construct", "")))
                if not e or e["vocab"] in seen:
                    continue
                seen.add(e["vocab"])
                ev.append({"vocab": e["vocab"], "name": VOCAB_NAME.get(e["vocab"], e["vocab"]),
                           "url": e["url"], "quote": e["quote"],
                           "named_thing": e["named_thing"],
                           "img": shipped.get(e.get("image", ""), "")})
            ids = []
            for ei, spec in enumerate(b.get("boards", [])[:3]):
                bid = f"{c['id']}__b{bi}__ex{ei + 1}"
                boards.append({"id": bid, "spec": spec})
                ids.append(bid)
            bks.append({"name": b.get("name", ""), "members": b.get("members", []),
                        "memberNames": [VOCAB_NAME.get(m, m) for m in b.get("members", [])],
                        "mechanism": b.get("mechanism", ""), "evidence": ev, "boards": ids})
        out_scen.append({**{k: c[k] for k in
                            ("id", "section", "section_id", "title", "kind", "canonical",
                             "ports", "note", "examples", "flavour")},
                         "buckets": bks,
                         "none": sc.get("none", []),
                         "noneNote": sc.get("none_note", "")})

    together, appears = {}, {}
    for sc in buckets.values():
        for b in sc.get("buckets", []):
            ms = sorted(set(b.get("members", [])))
            for m in ms:
                appears[m] = appears.get(m, 0) + 1
            for x, y in itertools.combinations(ms, 2):
                together[f"{x}|{y}"] = together.get(f"{x}|{y}", 0) + 1

    site = {
        "generated": "2026-09-23",
        "vocabOrder": VOCAB_ORDER,
        "vocabName": VOCAB_NAME,
        "sectionOrder": SECTION_ORDER,
        "sectionShort": SECTION_SHORT,
        "vocabs": [{"key": s["key"], "name": s.get("name", s["key"]),
                    "identity": s.get("identity", {}),
                    "hero": shipped.get("hero-" + s["key"], ""),
                    "docs": sorted({c["doc_url"] for c in s.get("constructs", [])
                                    if c.get("doc_url")})[:6],
                    "constructs": [{k: c.get(k, "") for k in
                                    ("construct", "has", "mark", "named_thing", "doc_url", "quote")}
                                   for c in s.get("constructs", [])]}
                   for s in sorted(sheets, key=lambda x: VOCAB_ORDER.index(x["key"])
                                   if x["key"] in VOCAB_ORDER else 99)],
        "scenarios": out_scen,
        "agreement": {"together": together, "appears": appears},
        "narrative": narrative,
        "stats": {
            "scenarios": len(out_scen),
            "examples": sum(len(c["examples"]) for c in out_scen),
            "vocabs": len(VOCAB_ORDER),
            "buckets": sum(len(c["buckets"]) for c in out_scen),
            "boards": len(boards),
            "perScenario": round(sum(len(c["buckets"]) for c in out_scen) / max(len(out_scen), 1), 1),
        },
    }
    src_dir = os.path.join(a.out, "src")
    os.makedirs(src_dir, exist_ok=True)
    json.dump(site, open(os.path.join(src_dir, "site.json"), "w"), ensure_ascii=False)
    json.dump(boards, open(os.path.join(src_dir, "boards.json"), "w"), ensure_ascii=False)
    print(f"site.json  {len(out_scen)} scenarios · {site['stats']['buckets']} buckets · "
          f"{len(boards)} boards · {len(shipped)} images -> {a.out}")


if __name__ == "__main__":
    main()
