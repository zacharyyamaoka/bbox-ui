#!/usr/bin/env python3
"""Turn ranked.json into the report's data file.

The MERGE map and the ORDER list are Opus's judgement, not the verifiers':
the agents scored each candidate in isolation, which produces big ties and
leaves near-duplicates that were mined from different libraries sitting apart.
Merging and ordering is the part of this job that cannot be fanned out.
"""
import json, pathlib, re, textwrap

I = pathlib.Path("/tmp/claude-1000/-home-bam-bbox-ui--claude-worktrees-port-primary-secondary-slot-3658dc/"
                 "33e26dbe-b892-4b95-979a-e4861aa72fc1/scratchpad/ideas")
R = json.loads((I / "ranked.json").read_text())

# --- families the conceptKeys missed: keep the first, fold the rest in -------
MERGE = {
    20:  [65],            # named-channel edges ← wireless link pair
    3:   [34],            # subtree clone ← deep duplicate contract
    16:  [33],            # cut-line gesture ← knife
    9:   [11],            # action vocabulary ← changes-array reducer
    112: [12, 14, 142],   # port/anchor/connectionPoint ← anchor variants
    17:  [72],            # bare-point edge end ← dangling wire end
    84:  [144, 77, 124],  # bus trunk ← trunk-merge, boundary merge, mergeEdges
    45:  [76],            # port colour from type ← auto colour by family
    38:  [115],           # search palette ← tab-key search
    70:  [42],            # ports derived from a data field ← config-derived ports
    119: [111],           # registered coercion ← typed-wiring package
    55:  [84] if False else [],
}
folded = {x for v in MERGE.values() for x in v}

# --- the ranking. Indices into ranked.json, best first. ---------------------
ORDER = [
    0, 20, 3, 1, 5, 119, 4, 19, 9, 2, 112, 16,                 # 1-12  top tier
    7, 8, 6, 17, 125, 24, 31, 56, 55, 84, 25, 26, 35, 10, 36,  # 13-27
    13, 22, 45, 38, 50, 32, 54, 30, 29, 110, 70, 47, 28,       # 28-40
]
# everything else keeps the verifiers' score order behind that
rest = [n for n in range(len(R)) if n not in ORDER and n not in folded]
ORDER += rest

# --- visuals ----------------------------------------------------------------
HAND = {0: "v_nesting_grammar", 20: "v_named_channel", 3: "v_subtree_clone",
        1: "v_inverse_undo", 5: "v_group_ungroup", 119: "v_typed_ports",
        4: "v_router_fallback", 19: "v_mute", 9: "v_action_vocab",
        125: "v_focus_depth", 16: "v_cut_gesture"}

# One idea the miners missed but the engineering dossier states outright, and
# that I verified absent myself (grep for obligation/Required/Recommended over
# components/ + scene/ returns prose only). Added by hand, flagged as such.
MANUAL = [dict(
    title="A terminal carries a caller obligation: required, recommended, optional",
    category="domain-model",
    what="LabVIEW's connector pane gives every terminal an obligation level that the caller can see "
         "before wiring: <b>Required</b> refuses the call unwired, <b>Recommended</b> is legal but warns, "
         "<b>Optional</b> is silent. It is the one piece of interface information that is about the "
         "<i>caller's duty</i> rather than the port's type or state, and it renders as ring weight — so a "
         "block's contract is legible without opening anything.",
    priorArt="LabVIEW connector pane",
    evidence="lib-engineering.md, LabVIEW section — listed there as a distinction bbox-ui has no "
             "representation for",
    whyUseful="<code>port.tsx</code>'s <code>PortState</code> is visual state and <code>portEdge.tsx</code>'s "
              "<code>PortEdgeItem</code> is { id, label } — neither says anything about what a caller owes.",
    checkedAgainst="grep -rinE 'obligation|\\b(Required|Recommended|Optional)\\b' components/ scene/ — "
                   "8 hits, all prose in doc comments, none a port concept",
    novelty=4, usefulness=4, conceptKey="port-caller-obligation", hand="v_obligation")]

TEMPLATE = {
    # idea index -> (template name, kwargs-building callable name)
    2: "hierarchy_switch", 7: "path_query", 8: "stale_cascade", 6: "diag_overlay",
    17: "bare_point", 24: "code_tab", 31: "draft_snapshot", 56: "bus_stack",
    55: "fanout", 84: "bus_trunk", 25: "schema_version", 26: "capabilities",
    35: "labels", 10: "barycenter", 36: "layered_rank", 13: "typed_binding",
    22: "variant_ports", 45: "type_colour", 38: "search_create", 50: "tabs",
    32: "drawer", 54: "exclusive", 30: "edge_disable", 29: "debug_tap",
    110: "fence", 70: "derived_ports", 47: "tags", 28: "preview_route",
}

def clean(s: str) -> str:
    s = re.sub(r"\s+", " ", s or "").strip()
    s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    # `code` spans survive as real code elements
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    return s

def body_for(c: dict) -> str:
    """Truncate on the RAW text, before backticks become tags.

    WHY: cutting after the conversion can land inside a <code> element, and one
    unclosed inline tag re-styles every card after it and collapses the dense
    rows' grid. That is exactly what shipped on the first build."""
    raw = re.sub(r"\s+", " ", c["what"] or "").strip()
    if len(raw) > 430:
        cut = raw[:430]
        if cut.count("`") % 2:                    # never cut inside a code span
            cut = cut[:cut.rfind("`")]
        cut = cut.rsplit(". ", 1)[0]
        raw = (cut + ".") if cut else raw[:400] + "\u2026"
    out = clean(raw)
    opens, closes = out.count("<code>"), out.count("</code>")
    if opens > closes:                            # belt and braces
        out += "</code>" * (opens - closes)
    return out


def prior_for(c: dict) -> str:
    """Source chips are plain text — strip markup rather than risk a cut tag."""
    p = re.sub(r"\s+", " ", (c["priorArt"] or "")).strip().replace("`", "")
    p = p.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    p = re.sub(r"\s*—.*$", "", p)
    p = re.sub(r"\s*\(.*?\)\s*", " ", p)
    parts = [x.strip(" ,.;") for x in re.split(r"[;·]| and ", p) if x.strip(" ,.;")]
    seen, out = set(), []
    for x in parts:
        k = x.lower()[:18]
        if k in seen:
            continue
        seen.add(k)
        out.append(x if len(x) < 34 else x[:32] + "…")
    return " · ".join(out[:3]) or p[:40]

def where_for(c: dict) -> str:
    w = clean(c.get("whyUseful", ""))
    m = re.findall(r"<code>([^<]+\.(?:ts|tsx))</code>|([\w/]+\.(?:ts|tsx))", w)
    hits = [a or b for a, b in m]
    seen, out = set(), []
    for h in hits:
        h = h.split("/")[-1]
        if h not in seen:
            seen.add(h); out.append(f"<code>{h}</code>")
    return " ".join(out[:3])

def checked_for(c: dict) -> str:
    ck = clean(c.get("checkedAgainst", ""))
    ck = re.sub(r"^(grep|sed|Read|read)\b", lambda m: m.group(0), ck)
    return textwrap.shorten(ck, 150, placeholder="…")

out = []
MANUAL_AT = 11   # rank 12, beside the other interface-contract ideas
for m in MANUAL:
    m["_manual"] = True

for n in ORDER[:100 - len(MANUAL)]:
    c = R[n]
    extra = MERGE.get(n, [])
    also = [prior_for(R[x]) for x in extra]
    item = {
        "idx": n,
        "title": clean(c["title"]),
        "category": c["category"],
        "body": body_for(c),
        "priorArt": prior_for(c) + ("".join(f" · {a}" for a in also) if also else ""),
        "where": where_for(c),
        "checked": checked_for(c),
        "novelty": c["novelty"], "usefulness": c["usefulness"],
        "hand": HAND.get(n), "tmpl": TEMPLATE.get(n),
        "conceptKey": c["conceptKey"],
        "mergedFrom": len(extra),
    }
    out.append(item)

for off, m in enumerate(MANUAL):
    out.insert(MANUAL_AT + off, {
        "idx": -1 - off, "title": clean(m["title"]), "category": m["category"],
        "body": re.sub(r"\s+", " ", m["what"]).strip(),   # authored as HTML
        "priorArt": m["priorArt"],
        "where": "<code>port.tsx</code> <code>portEdge.tsx</code>",
        "checked": clean(m["checkedAgainst"]),
        "novelty": m["novelty"], "usefulness": m["usefulness"],
        "hand": m["hand"], "tmpl": None, "conceptKey": m["conceptKey"],
        "mergedFrom": 0, "manual": True,
    })
out = out[:100]

(I / "final100.json").write_text(json.dumps(out, indent=1))
from collections import Counter
print(f"final: {len(out)}  hand-drawn: {sum(1 for x in out if x['hand'])}  "
      f"named templates: {sum(1 for x in out if x['tmpl'])}")
print("categories:", dict(Counter(x['category'] for x in out)))
print("merged families:", sum(x['mergedFrom'] for x in out))
print("\nfirst 14:")
for i, x in enumerate(out[:14], 1):
    print(f"{i:3}. [{x['category'][:6]}] {x['title'][:72]}")
