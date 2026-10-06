#!/usr/bin/env python3
"""Attach a diagram to every one of the 100 ideas and emit the report data file."""
import json, pathlib, re, sys

DOCS = "/home/bam/bbox-ui/.claude/worktrees/port-primary-secondary-slot-3658dc/docs"
sys.path.insert(0, DOCS)
import idea_diagrams as D          # noqa: E402
import idea_visuals as V           # noqa: E402

I = pathlib.Path("/tmp/claude-1000/-home-bam-bbox-ui--claude-worktrees-port-primary-secondary-slot-3658dc/"
                 "33e26dbe-b892-4b95-979a-e4861aa72fc1/scratchpad/ideas")
items = json.loads((I / "final100.json").read_text())

# tier → (width, height) of the diagram canvas
def size(rank):
    if rank <= 12:  return 980, None
    if rank <= 40:  return 470, 150
    if rank <= 75:  return 470, 130
    return 150, 66

IDENT = re.compile(r"<code>([^<]{2,34})</code>")

def keys_of(it, n=3):
    """Pick labels for a schematic from the idea's own text.

    Prefer API-shaped identifiers — a call, a dotted path, a camelCase name, a
    typed field — over bare filenames. A diagram labelled `scene.ts` says
    nothing; one labelled `applySceneChanges()` says what the idea is."""
    cands = IDENT.findall(it["body"])
    def score(k):
        k = k.strip()
        if re.fullmatch(r"[\w/.-]+\.tsx?", k):      # a filename
            return -1
        s = 0
        if "(" in k: s += 3
        if ":" in k: s += 2
        if "." in k: s += 1
        if re.search(r"[a-z][A-Z]", k): s += 2
        if len(k) > 26: s -= 1
        return s
    ranked = sorted({c.strip() for c in cands}, key=lambda k: (-score(k), len(k)))
    out = [k for k in ranked if score(k) >= 0][:n]
    if len(out) < n:
        for k in ranked:
            if k not in out:
                out.append(k)
            if len(out) == n: break
    if not out:
        stop = {"the","and","not","with","from","into","just","own","for","its","one","a","an"}
        out = [w for w in re.findall(r"[A-Za-z][A-Za-z.\-]{3,22}", it["title"])
               if w.lower() not in stop][:n]
    return out[:n]


# ---- the 28 named template configs -----------------------------------------
def named(key, it, w, h):
    k = keys_of(it, 3)
    if key == "hierarchy_switch":
        return D.t_states(w, h, [{"t": "INHERIT"}, {"t": "INCLUDE_CHILDREN", "on": True},
                                 {"t": "SEPARATE"}], "one layout pass, or a cached box")
    if key == "path_query":
        b = ""
        xs = [20, 130, 240, 350]
        for i, x in enumerate(xs):
            on = i < 3
            b += D.box(x, h/2 - 15, 84, 30, D.PANEL, D.ORANGE if on else D.LINE, rx=6)
            b += D.txt(x + 42, h/2 + 4, ["src", "proc", "kid", "sink"][i],
                       D.ORANGE if on else D.DIM, 9.5, anchor="middle")
            if i < 3:
                b += (f'<path d="M{x+84},{h/2} H{xs[i+1]}" stroke="{D.ORANGE if i<2 else D.LINE}" '
                      f'stroke-width="{2 if i<2 else 1.2}"/>')
        b += D.txt(20, h - 10, "path(scene, 'src', 'kid') → the route, in order", D.DIM, 9, mono=True)
        return b
    if key == "stale_cascade":
        return D.t_chain(w, h, [{"t": "edited", "accent": D.ORANGE, "fill": "#2a1d10"},
                                {"t": "stale", "accent": D.YELLOW}, {"t": "stale", "accent": D.YELLOW}],
                         "consumersOf(), transitively — the cascade you already have the primitives for")
    if key == "diag_overlay":
        return D.t_grid(w, h, ["computed", "painted"],
                        ["findCycles", "duplicateEdges", "rank", "router.fallback"],
                        {(r, 0): "y" for r in range(4)} | {(r, 1): "n" for r in range(4)}, colw=112)
    if key == "bare_point":
        b = D.t_node(20, 18, 130, 62, "block", outs=[("out", D.GREEN)])
        b += D.wire(150, 49, 330, 49, D.BLUE, key=f"{w}{h}")
        b += f'<circle cx="336" cy="49" r="5" fill="none" stroke="{D.ORANGE}" stroke-width="2"/>'
        b += D.txt(348, 53, "a point — no node", D.ORANGE, 9.5, mono=True)
        b += D.txt(20, h - 10, "the half-drawn edge becomes representable", D.DIM, 9, mono=True)
        return b
    if key == "code_tab":
        return D.t_before_after(w, h,
            D.t_node(14, 14, 120, 58, "Perception", outs=[("out", D.GREEN)]),
            D.txt(14, 28, "block Perception {", D.GREEN, 9.5, mono=True)
            + D.txt(22, 44, "port out: Tracks", D.DIM2, 9.5, mono=True)
            + D.txt(14, 60, "}", D.GREEN, 9.5, mono=True),
            "board", "text — and back")
    if key == "draft_snapshot":
        return D.t_states(w, h, [{"t": "draft", "on": True}, {"t": "snapshot", "accent": D.GREEN}],
                          "only snapshots enter the diff")
    if key == "bus_stack":
        return D.t_concept(w, h, "domain-model", ["busInterface: ClockBus", "port.clk", "port.rst"],
                           "one contract, N physical ports")
    if key == "fanout":
        return D.t_bus(w, h, 3, "the junction has an id, so it can be moved and reused")
    if key == "bus_trunk":
        return D.t_bus(w, h, 4, "converge near the shared node, split further out")
    if key == "schema_version":
        return D.t_chain(w, h, [{"t": "v1 record"}, {"t": "migrate", "accent": D.ORANGE, "fill": "#2a1d10"},
                                {"t": "v2 record"}], "a runtime check, not a hope")
    if key == "capabilities":
        return D.t_grid(w, h, ["DOM", "RF", "tldraw"], ["collapse", "drill-in", "free drag"],
                        {(0,0):"n",(0,1):"p",(0,2):"y",(1,0):"n",(1,1):"n",(1,2):"y",
                         (2,0):"y",(2,1):"y",(2,2):"y"}, colw=92)
    if key == "labels":
        b = D.wire(20, h/2, w - 40, h/2, D.BLUE, key=f"{w}{h}")
        for i, (x, lab) in enumerate([(110, "rate"), (250, "10Hz"), (360, "qos")]):
            b += D.box(x, h/2 - 26, 62, 18, D.PANEL, D.ORANGE, rx=4)
            b += D.txt(x + 31, h/2 - 13, lab, D.ORANGE, 8.5, anchor="middle", mono=True)
            b += f'<path d="M{x+31},{h/2-8} V{h/2}" stroke="{D.ORANGE}" stroke-width="1"/>'
        b += D.txt(20, h - 10, "each label owns its own position along the chord", D.DIM, 9, mono=True)
        return b
    if key == "barycenter":
        return D.t_before_after(w, h,
            D.txt(14, 20, "3 crossings", D.RED, 9.5, mono=True)
            + "".join(D.wire(14, 36 + i*18, 150, 36 + (2-i)*18, D.RED, 1.3, key=f"{w}{h}") for i in range(3)),
            D.txt(14, 20, "0 crossings", D.GREEN, 9.5, mono=True)
            + "".join(D.wire(14, 36 + i*18, 150, 36 + i*18, D.GREEN, 1.3, key=f"{w}{h}") for i in range(3)),
            "authored order", "barycenter + transpose")
    if key == "layered_rank":
        b = ""
        for col in range(4):
            for row in range(min(3, 1 + col % 3)):
                b += D.box(20 + col*106, 24 + row*30, 76, 22, D.PANEL, D.LINE2, rx=5)
            b += D.txt(58 + col*106, h - 22, f"rank {col}", D.ORANGE if col else D.DIM, 9, anchor="middle", mono=True)
        b += D.txt(20, h - 6, "rank() already gives the column — this gives the row", D.DIM, 9, mono=True)
        return b
    if key == "typed_binding":
        return D.t_concept(w, h, "domain-model", ["kind: 'delegation'", "source", "target"],
                           "FLOW · ASSEMBLY · DELEGATION — Capella's own vocabulary")
    if key == "variant_ports":
        return D.t_polarity(w, h, [{"t": "full", "ok": True, "why": "all ports"},
                                   {"t": "variant", "ok": True, "why": "a subset, still valid"}])
    if key == "type_colour":
        b = ""
        for i, (lab, col) in enumerate([("Image", D.GREEN), ("Pose", D.PURPLE), ("Cmd", D.ORANGE)]):
            x = 24 + i * 150
            b += D.dot(x, h/2 - 6, 6, col, ring=True)
            b += D.txt(x + 16, h/2 - 2, lab, col, 10, mono=True)
            b += D.txt(x + 16, h/2 + 14, "same in every state", D.DIM, 8.5, mono=True)
        b += D.txt(24, h - 10, "colour says WHAT it carries; the ring still says its state", D.DIM, 9, mono=True)
        return b
    if key == "search_create":
        return D.t_menu(w, h, "pose|", ["PoseStamped · sensor", "Pose2D · planner",
                                        "+ create “pose|” as a new block"], highlight=2)
    if key == "tabs":
        b = ""
        for i, t in enumerate(["System", "Perception", "detect"]):
            x = 18 + i * 132
            on = i == 1
            b += D.box(x, 16, 124, 26, D.PANEL if on else D.BG, D.ORANGE if on else D.LINE, rx=6)
            b += D.txt(x + 62, 33, t, D.FG if on else D.DIM, 9.5, anchor="middle", mono=True)
        b += D.box(18, 50, w - 36, h - 74, D.PANEL, D.ORANGE, rx=8)
        b += D.txt(30, 70, "several subgraphs open at once, not one linear stack", D.DIM, 9, mono=True)
        return b
    if key == "drawer":
        b = D.box(16, 14, w - 32, h - 56, D.BG, D.LINE, rx=8)
        b += D.txt(28, 32, "the board stays put", D.DIM, 9.5, mono=True)
        b += D.box(16, h - 44, w - 32, 34, D.PANEL, D.ORANGE, rx=8)
        b += D.txt(28, h - 22, "▸ Perception — its interior, in a drawer", D.ORANGE, 9.5, mono=True)
        return b
    if key == "exclusive":
        return D.t_polarity(w, h, [{"t": "A · active", "ok": True, "why": "exactly one"},
                                   {"t": "B", "ok": False, "why": "muted by the flag"}])
    if key == "edge_disable":
        b = D.wire(20, 34, w - 30, 34, D.BLUE, key=f"{w}{h}")
        b += D.wire(20, 74, w - 30, 74, D.DIM, 1.4, dash="5 4", key=f"{w}{h}", arrow=False)
        b += D.txt(w - 26, 78, "disabled", D.DIM, 9, mono=True)
        b += D.txt(20, h - 10, "the wire is off; both nodes still run", D.DIM, 9, mono=True)
        return b
    if key == "debug_tap":
        return D.t_concept(w, h, "diagnostics", ["port.out", "streams to one panel"], "opt-in, per port")
    if key == "fence":
        b = D.box(16, 18, w - 32, h - 42, "none", D.ORANGE, rx=8, dash="5 4")
        b += D.txt(30, 38, "scope fence", D.ORANGE, 9.5, mono=True, weight="700")
        b += D.txt(30, 58, "@names resolve inside; nothing leaks out", D.DIM, 9, mono=True)
        return b
    if key == "derived_ports":
        return D.t_chain(w, h, [{"t": "data.fields", "sub": "one named field"},
                                {"t": "derive", "accent": D.ORANGE, "fill": "#2a1d10"},
                                {"t": "ports", "sub": "reconciled by id"}])
    if key == "tags":
        b = ""
        for i, t in enumerate(["#safety", "#perception", "#draft"]):
            x = 20 + i * 132
            b += D.box(x, h/2 - 14, 112, 26, D.PANEL, D.PURPLE, rx=13)
            b += D.txt(x + 56, h/2 + 4, t, D.PURPLE, 9.5, anchor="middle", mono=True)
        b += D.txt(20, h - 10, "cuts across type, parent and position", D.DIM, 9, mono=True)
        return b
    if key == "preview_route":
        return D.t_wires(w, h, [{"t": "dragging", "body": D.wire(14, 30, 180, 70, D.DIM, 1.4, key=f"{w}{h}"),
                                 "note": "one cheap bend"},
                                {"t": "on release", "body": '<path d="M14,30 H90 V70 H180" fill="none" '
                                 f'stroke="{D.GREEN}" stroke-width="1.6"/>', "note": "full A* pass"}])
    return D.t_concept(w, h, it["category"], k)

hand_count = tmpl_count = auto_count = 0
for rank, it in enumerate(items, 1):
    w, h = size(rank)
    if rank > 75:                       # the tail: a category glyph, not a label soup
        it["svg"] = D.t_glyph(it["category"])
        auto_count += 1
        continue
    if it.get("hand"):
        it["svg"] = getattr(V, it["hand"])()
        hand_count += 1
    else:
        h = h or 150
        if it.get("tmpl"):
            body = named(it["tmpl"], it, w, h); tmpl_count += 1
        else:
            body = D.t_concept(w, h, it["category"], keys_of(it, 3)); auto_count += 1
        it["svg"] = D.svg(w, h, body, it["title"])

print(f"diagrams — hand {hand_count} · named {tmpl_count} · schematic {auto_count}")
(I / "final100_svg.json").write_text(json.dumps(items))
print("wrote final100_svg.json")
