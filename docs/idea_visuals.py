#!/usr/bin/env python3
"""
Hand-authored diagrams for the top-tier ideas.

The template library in `idea_diagrams.py` carries the long tail. These are the
ones whose whole point IS a specific picture — a mechanism you cannot see from a
generic box-and-arrow. Each is authored against one idea and says so.
"""
from __future__ import annotations

from idea_diagrams import (BG, PANEL, PANEL2, LINE, LINE2, DIM, DIM2, FG, BLUE, GREEN,
                           ORANGE, RED, YELLOW, PURPLE, MONO, svg, txt, box, dot, wire)


def v_typed_ports(w=980, h=210) -> str:
    """Typed ports + declared coercion (Baklava `NodeInterfaceType.addConversion`).
    The point: type CHECKING and type CONVERSION are the same mechanism, so a
    refused connection can offer the conversion that would make it legal."""
    s = txt(0, 12, "TODAY — a port has a visual state, and no type at all", DIM, 10, weight="700")
    s += box(20, 26, 150, 64, PANEL, LINE2, rx=8)
    s += txt(32, 46, "camera", FG, 10.5, weight="600")
    s += dot(170, 62, 5, ORANGE, ring=True) + txt(158, 66, "out", DIM2, 9.5, anchor="end")
    s += box(340, 26, 150, 64, PANEL, LINE2, rx=8)
    s += txt(352, 46, "planner", FG, 10.5, weight="600")
    s += dot(340, 62, 5, ORANGE, ring=True) + txt(352, 66, "in", DIM2, 9.5)
    s += wire(170, 62, 340, 62, BLUE, key=f"{w}{h}")
    s += txt(180, 96, "anything connects to anything", DIM, 9, mono=True)
    s += txt(20, 110, 'PortState = "empty" | "valueSet" | "wired" | "received"   ← paint, not data',
             DIM2, 9.5, mono=True)

    s += f'<line x1="520" y1="16" x2="520" y2="{h - 14}" stroke="{LINE}"/>'
    s += txt(546, 12, "WITH A TYPE ON THE PORT", ORANGE, 10, weight="700")
    s += box(566, 26, 150, 64, PANEL, LINE2, rx=8)
    s += txt(578, 46, "camera", FG, 10.5, weight="600")
    s += dot(716, 62, 5, GREEN, ring=True)
    s += txt(704, 66, "Image", GREEN, 9.5, anchor="end", mono=True)
    s += box(846, 26, 120, 64, PANEL, LINE2, rx=8)
    s += txt(858, 46, "planner", FG, 10.5, weight="600")
    s += dot(846, 62, 5, PURPLE, ring=True)
    s += txt(858, 66, "Pose", PURPLE, 9.5, mono=True)
    s += (f'<path d="M716,62 H768" stroke="{RED}" stroke-width="1.6" stroke-dasharray="3 3"/>'
          f'<path d="M772,55 l10,14 M782,55 l-10,14" stroke="{RED}" stroke-width="1.8"/>')
    s += (f'<path d="M794,62 H846" stroke="{RED}" stroke-width="1.6" stroke-dasharray="3 3" '
          f'marker-end="url(#ab-{w}{h})" opacity="0.4"/>')
    s += box(700, 104, 268, 40, "#2a1512", RED, rx=8)
    s += txt(714, 120, "refused — Image → Pose", RED, 10, weight="700")
    s += txt(714, 134, "…but a conversion is registered:", DIM2, 9, mono=True)
    s += box(700, 152, 268, 30, "#12301c", GREEN, rx=8, dash="4 3")
    s += txt(714, 171, "detectPose(Image) → Pose   — insert it?", GREEN, 9.5, mono=True)
    s += txt(546, 200, "one mechanism answers both “is this legal” and “what would make it legal”",
             DIM, 9.5, mono=True)
    return svg(w, h, s, "Typed ports with declared coercion")


def v_named_channel(w=980, h=200) -> str:
    """Goto/From (Simulink) and wireless reroute (Unreal): wire to a NAME.
    Zach's own origin story is 'managing all the cables felt like a pain'."""
    s = txt(0, 12, "A CABLE ACROSS THE BOARD", DIM, 10, weight="700")
    for i, (x, lab) in enumerate([(20, "imu"), (20, "gps")]):
        y = 34 + i * 46
        s += box(x, y, 96, 34, PANEL, LINE2, rx=7)
        s += txt(x + 48, y + 21, lab, DIM2, 10, anchor="middle")
        s += dot(x + 96, y + 17, 4.4, BLUE)
    s += box(392, 34, 96, 80, PANEL, LINE2, rx=7)
    s += txt(440, 78, "fusion", DIM2, 10, anchor="middle")
    s += dot(392, 56, 4.4, BLUE) + dot(392, 92, 4.4, BLUE)
    s += (f'<path d="M116,51 C200,51 240,120 300,120 C340,120 330,56 392,56" fill="none" '
          f'stroke="{BLUE}" stroke-width="1.5" opacity=".85"/>')
    s += (f'<path d="M116,97 C200,97 250,150 310,150 C360,150 340,92 392,92" fill="none" '
          f'stroke="{BLUE}" stroke-width="1.5" opacity=".85"/>')
    s += txt(150, 176, "two long cables crossing the whole board", DIM, 9.5, mono=True)

    s += f'<line x1="530" y1="16" x2="530" y2="{h - 14}" stroke="{LINE}"/>'
    s += txt(556, 12, "WIRE TO A NAME INSTEAD", ORANGE, 10, weight="700")
    for i, (lab, chan) in enumerate([("imu", "@imu.raw"), ("gps", "@gps.fix")]):
        y = 34 + i * 46
        s += box(556, y, 96, 34, PANEL, LINE2, rx=7)
        s += txt(604, y + 21, lab, DIM2, 10, anchor="middle")
        s += dot(652, y + 17, 4.4, ORANGE)
        s += box(666, y + 4, 104, 26, "#2a1d10", ORANGE, rx=13)
        s += txt(718, y + 21, chan, ORANGE, 9.5, anchor="middle", mono=True)
    s += box(860, 34, 96, 80, PANEL, LINE2, rx=7)
    s += txt(908, 78, "fusion", DIM2, 10, anchor="middle")
    for i, chan in enumerate(["@imu.raw", "@gps.fix"]):
        y = 56 + i * 36
        s += box(766, y - 13, 82, 26, "#2a1d10", ORANGE, rx=13, dash="3 3")
        s += txt(807, y + 4, chan, ORANGE, 8.5, anchor="middle", mono=True)
        s += dot(860, y, 4.4, ORANGE)
        s += f'<path d="M848,{y} H860" stroke="{ORANGE}" stroke-width="1.4"/>'
    s += txt(690, 148, "publish", ORANGE, 8.5, anchor="middle", mono=True)
    s += txt(807, 148, "subscribe", ORANGE, 8.5, anchor="middle", mono=True)
    s += txt(556, 176, "same edges in the record — zero cable drawn, and the name is greppable",
             DIM, 9.5, mono=True)
    return svg(w, h, s, "Named-channel edges replace long cables")


def v_inverse_undo(w=980, h=190) -> str:
    """Operation-level inverse undo (Sim Studio) vs whole-scene snapshots."""
    s = txt(0, 12, "SNAPSHOT UNDO — every edit copies the whole scene", DIM, 10, weight="700")
    for i in range(4):
        x = 20 + i * 96
        s += box(x, 28, 82, 56, PANEL, LINE, rx=7)
        s += txt(x + 41, 52, f"scene v{i}", DIM2, 9, anchor="middle", mono=True)
        s += txt(x + 41, 66, "full copy", DIM, 8, anchor="middle", mono=True)
        if i < 3:
            s += f'<path d="M{x + 84},56 H{x + 92}" stroke="{LINE2}" stroke-width="1.2"/>'
    s += txt(20, 104, "memory grows with scene size × history depth", DIM, 9.5, mono=True)
    s += txt(20, 122, "and two peers' edits cannot be merged — only one snapshot can win",
             DIM2, 9.5, mono=True)

    s += f'<line x1="420" y1="16" x2="420" y2="{h - 14}" stroke="{LINE}"/>'
    s += txt(446, 12, "INVERSE-PATCH UNDO — store the operation and its inverse", ORANGE, 10, weight="700")
    ops = [("addEdge(e7)", "removeEdge(e7)"), ("setPos(n3,…)", "setPos(n3,prev)"),
           ("rename(p2)", "rename(p2,old)")]
    for i, (fwd, inv) in enumerate(ops):
        y = 30 + i * 34
        s += box(446, y, 200, 26, PANEL, LINE2, rx=6)
        s += txt(456, y + 17, fwd, FG, 9.5, mono=True)
        s += f'<path d="M650,{y + 13} H674" stroke="{ORANGE}" stroke-width="1.2" stroke-dasharray="3 2"/>'
        s += box(678, y, 200, 26, "#2a1d10", ORANGE, rx=6)
        s += txt(688, y + 17, inv, ORANGE, 9.5, mono=True)
    s += txt(446, 152, "constant memory · replayable · mergeable · and the log IS the audit trail",
             DIM, 9.5, mono=True)
    s += txt(446, 170, "bbox-ui has no scene-level undo today — only CodeMirror's, inside codeEditor.tsx",
             DIM2, 9, mono=True)
    return svg(w, h, s, "Inverse-patch undo versus snapshot undo")


def v_obligation(w=980, h=180) -> str:
    """LabVIEW's connector pane: each terminal carries a caller obligation."""
    s = txt(0, 12, "A TERMINAL CARRIES AN OBLIGATION, AND THE BORDER SHOWS IT", ORANGE, 10, weight="700")
    specs = [("Required", 4.0, ORANGE, "caller must wire it — refuse the call otherwise"),
             ("Recommended", 2.2, YELLOW, "unwired is legal, but warn"),
             ("Optional", 1.0, LINE2, "silence is fine")]
    for i, (lab, thick, colour, note) in enumerate(specs):
        x = 20 + i * 316
        s += box(x, 32, 150, 70, PANEL, LINE2, rx=8)
        s += txt(x + 12, 52, "detect", FG, 10.5, weight="600")
        s += (f'<circle cx="{x}" cy="78" r="6" fill="none" stroke="{colour}" '
              f'stroke-width="{thick}"/><circle cx="{x}" cy="78" r="2" fill="{colour}"/>')
        s += txt(x + 14, 82, "frame", DIM2, 9.5)
        s += txt(x, 122, lab, colour, 11, weight="700")
        s += txt(x, 138, note, DIM, 9, mono=True)
    s += txt(20, 168, "the same information LabVIEW puts in a connector-pane tooltip — here it is the port's own ring weight",
             DIM2, 9.5, mono=True)
    return svg(w, h, s, "Port obligation levels rendered as ring weight")


def v_mute(w=980, h=170) -> str:
    """Nuke/Blender mute: a node becomes a type-matched pass-through, not a hole."""
    def chain(x0, y, muted):
        t = ""
        for i, (lab, w_) in enumerate([("camera", 92), ("denoise", 96), ("detect", 88)]):
            x = x0 + i * 118
            off = muted and i == 1
            t_fill = "#221a12" if off else PANEL
            t += box(x, y, w_, 40, t_fill, ORANGE if off else LINE2, rx=7,
                     dash="4 3" if off else "")
            t += txt(x + w_ / 2, y + 24, lab, ORANGE if off else DIM2, 10, anchor="middle")
            if off:
                t += f'<path d="M{x + 8},{y + 34} L{x + w_ - 8},{y + 6}" stroke="{ORANGE}" stroke-width="1.2" opacity="0.5"/>'
            if i < 2:
                t += f'<path d="M{x + w_},{y + 20} H{x + 118}" stroke="{BLUE}" stroke-width="1.5"/>'
                t += dot(x + w_, y + 20, 3.6, BLUE)
        return t

    s = txt(0, 12, "DELETE IT — the chain breaks and you rewire by hand", DIM, 10, weight="700")
    s += box(20, 26, 92, 40, PANEL, LINE2, rx=7) + txt(66, 50, "camera", DIM2, 10, anchor="middle")
    s += box(256, 26, 88, 40, PANEL, LINE2, rx=7) + txt(300, 50, "detect", DIM2, 10, anchor="middle")
    s += box(138, 26, 96, 40, "none", RED, rx=7, dash="4 3")
    s += txt(186, 50, "gone", RED, 10, anchor="middle")
    s += f'<path d="M112,46 H134" stroke="{RED}" stroke-width="1.4" stroke-dasharray="3 3"/>'
    s += f'<path d="M238,46 H256" stroke="{RED}" stroke-width="1.4" stroke-dasharray="3 3"/>'
    s += txt(20, 88, "two dangling ends", RED, 9.5, mono=True)

    s += f'<line x1="400" y1="16" x2="400" y2="{h - 14}" stroke="{LINE}"/>'
    s += txt(426, 12, "MUTE IT — the node becomes a typed pass-through", ORANGE, 10, weight="700")
    s += chain(426, 26, True)
    s += (f'<path d="M518,46 C556,46 560,46 590,46" fill="none" stroke="{GREEN}" '
          f'stroke-width="1.6" stroke-dasharray="4 3"/>')
    s += txt(556, 88, "in→out carried through, because their types match", GREEN, 9.5, mono=True)
    s += txt(426, 112, "the graph stays connected and the intent — “skip this, temporarily” — is in the record,",
             DIM, 9.5, mono=True)
    s += txt(426, 130, "not lost in an undo stack. Mute is refused when the types do not match.",
             DIM, 9.5, mono=True)
    return svg(w, h, s, "Mute a node into a type-matched pass-through")


def v_focus_depth(w=980, h=190) -> str:
    """Depth-of-focus: dim everything past N hops from the selection.

    WHY concentric columns rather than a radial cloud: the quantity being shown
    is HOP COUNT, which is ordinal. A radial scatter reads as "some nodes are
    dimmer"; columns read as "this is the second ring", which is the point."""
    s = txt(0, 12, "DEPTH OF FOCUS — one slider, measured in hops, not pixels", ORANGE, 10, weight="700")
    cols = [(0, 1, ORANGE, 1.0, "selected"), (1, 2, BLUE, .62, "1 hop"),
            (2, 3, DIM2, .3, "2 hops"), (3, 3, DIM, .12, "3 hops")]
    for hop, n, colour, op, lab in cols:
        cx = 60 + hop * 112
        s += txt(cx, 34, lab, colour, 9.5, anchor="middle", mono=True,
                 weight="700" if hop == 0 else "400")
        for k in range(n):
            y = 52 + k * 34 + (3 - n) * 17
            s += (f'<rect x="{cx - 34}" y="{y}" width="68" height="24" rx="6" fill="{PANEL}" '
                  f'stroke="{colour}" opacity="{op}"/>')
            if hop == 0:
                s += txt(cx, y + 16, "sel", ORANGE, 9.5, anchor="middle", weight="700")
        if hop:
            s += (f'<path d="M{cx - 56},{h/2 - 6} H{cx - 40}" stroke="{colour}" '
                  f'stroke-width="1.3" opacity="{op}"/>')
    s += f'<line x1="500" y1="20" x2="500" y2="{h - 20}" stroke="{LINE}"/>'
    s += txt(534, 34, "focus depth", ORANGE, 10, weight="700")
    s += f'<rect x="534" y="54" width="330" height="6" rx="3" fill="{PANEL2}"/>'
    s += f'<rect x="534" y="54" width="165" height="6" rx="3" fill="{ORANGE}"/>'
    s += f'<circle cx="699" cy="57" r="9" fill="{ORANGE}" stroke="{BG}" stroke-width="2"/>'
    for i in range(5):
        x = 534 + i * 82.5
        s += txt(x, 82, str(i), ORANGE if i == 2 else DIM, 9.5, anchor="middle", mono=True)
    s += txt(534, 116, "rank() and a BFS over the same edge set already give you the hop count;",
             DIM, 9.5, mono=True)
    s += txt(534, 134, "the slider is opacity over a number the scene kit can already compute.",
             DIM, 9.5, mono=True)
    s += txt(534, 158, "Nothing in the trunk dims by graph distance today —", DIM2, 9, mono=True)
    s += txt(534, 174, "grepped for focusDepth / dimPast / hops: zero real hits.", DIM2, 9, mono=True)
    return svg(w, h, s, "Depth-of-focus dims nodes past N hops")


def v_nesting_grammar(w=980, h=200) -> str:
    """BlockSuite's defineBlockSchema role + parent/children flavour lists:
    'what may nest inside what' as a schema fact, not an ad-hoc parentId."""
    s = txt(0, 12, "TODAY — parentId is a bare string, so any nesting is legal", DIM, 10, weight="700")
    s += box(20, 28, 200, 96, PANEL, LINE2, rx=8)
    s += txt(32, 48, "Planner", FG, 10.5, weight="600")
    s += box(36, 58, 168, 26, PANEL2, LINE, rx=6) + txt(46, 75, "Perception", DIM2, 9.5)
    s += box(36, 90, 168, 26, "#2a1512", RED, rx=6, dash="4 3")
    s += txt(46, 107, "the whole System root", RED, 9.5)
    s += txt(20, 146, "parentId?: string", DIM2, 9.5, mono=True)
    s += txt(20, 164, "nothing refuses it — and nothing tells you until the render is wrong",
             RED, 9.5, mono=True)

    s += f'<line x1="470" y1="16" x2="470" y2="{h - 14}" stroke="{LINE}"/>'
    s += txt(496, 12, "WITH A DECLARED GRAMMAR", ORANGE, 10, weight="700")
    rows = [("role", '"root" | "hub" | "content"', ORANGE),
            ("children", '["block.*", "port-rail"]', GREEN),
            ("parent", '["hub"]', BLUE)]
    for i, (k, v, colour) in enumerate(rows):
        y = 34 + i * 26
        s += box(496, y, 108, 20, PANEL2, LINE, rx=5)
        s += txt(506, y + 14, k, colour, 9.5, mono=True)
        s += box(612, y, 246, 20, PANEL, LINE, rx=5)
        s += txt(622, y + 14, v, DIM2, 9.5, mono=True)
    s += box(496, 118, 362, 30, "#12301c", GREEN, rx=7)
    s += txt(508, 137, "validate(type, parentType, childTypes)  → throws", GREEN, 9.5, mono=True)
    s += txt(496, 168, "glob-matched, like BlockSuite's minimatch flavour lists — the illegal nest is",
             DIM, 9.5, mono=True)
    s += txt(496, 186, "refused at the edit, not discovered at the paint.", DIM, 9.5, mono=True)
    return svg(w, h, s, "A declared nesting grammar for block types")


def v_subtree_clone(w=980, h=196) -> str:
    """linkedCopy clones ONE node. Baklava's GraphTemplate.createGraph() walks
    the whole subtree and remaps every id through one map."""
    def tree(x0, y0, ids, edge_colour, faded=False):
        t = box(x0, y0, 196, 104, PANEL, LINE2, rx=8)
        t += txt(x0 + 12, y0 + 20, ids[0], FG if not faded else DIM2, 10.5, weight="600")
        for i, cid in enumerate(ids[1:]):
            cy = y0 + 34 + i * 24
            t += box(x0 + 16, cy, 164, 19, PANEL2, LINE, rx=5)
            t += txt(x0 + 26, cy + 13, cid, DIM2, 9, mono=True)
            if i:
                t += (f'<path d="M{x0 + 100},{cy - 5} V{cy}" stroke="{edge_colour}" stroke-width="1.2"/>')
        return t

    s = txt(0, 12, "linkedCopy(scene, id) — clones exactly one node", DIM, 10, weight="700")
    s += tree(20, 28, ["Perception", "camera  n2", "detect  n3", "track  n4"], LINE)
    s += f'<path d="M226,80 H286" stroke="{DIM}" stroke-width="1.4" marker-end="url(#a-{w}{h})"/>'
    s += box(300, 56, 196, 48, PANEL, ORANGE, rx=8)
    s += txt(312, 76, "Perception  n9", ORANGE, 10.5, weight="600")
    s += txt(312, 92, "— empty. children still point at n1", RED, 9, mono=True)
    s += txt(20, 152, "scene.ts's own comment says so: “not a subtree”", RED, 9.5, mono=True)
    s += txt(20, 170, "so every reuse feature is blocked on this one function", DIM2, 9.5, mono=True)

    s += f'<line x1="540" y1="16" x2="540" y2="{h - 14}" stroke="{LINE}"/>'
    s += txt(566, 12, "linkedSubtreeCopy — one id map, applied everywhere", ORANGE, 10, weight="700")
    s += tree(566, 28, ["Perception  n9", "camera  n10", "detect  n11", "track  n12"], ORANGE)
    s += box(786, 40, 176, 80, PANEL2, ORANGE, rx=8)
    s += txt(796, 58, "idMap", ORANGE, 9.5, mono=True, weight="700")
    for i, (a, b) in enumerate([("n1", "n9"), ("n2", "n10"), ("n3", "n11")]):
        s += txt(796, 74 + i * 15, f"{a} → {b}", DIM2, 9, mono=True)
    s += txt(566, 152, "every internal edge rewritten through the same map;",
             DIM, 9.5, mono=True)
    s += txt(566, 170, "definitionId still flattens to the root — Baklava does exactly this.",
             DIM, 9.5, mono=True)
    return svg(w, h, s, "Recursive subtree clone with a full id remap")


def v_router_fallback(w=980, h=180) -> str:
    """elbowRouter.autoPoints() already returns {points, fallback:true}. Nothing reads it."""
    s = txt(0, 12, "THE ROUTER ALREADY KNOWS", ORANGE, 10, weight="700")
    s += box(20, 30, 340, 118, BG, LINE, rx=8)
    s += box(60, 54, 74, 34, PANEL, LINE2, rx=6) + txt(97, 76, "src", DIM2, 10, anchor="middle")
    s += box(154, 88, 66, 40, PANEL2, LINE2, rx=6) + txt(187, 112, "wall", DIM, 9.5, anchor="middle")
    s += box(252, 54, 74, 34, PANEL, LINE2, rx=6) + txt(289, 76, "dst", DIM2, 10, anchor="middle")
    s += (f'<path d="M134,71 L252,71" stroke="{RED}" stroke-width="1.8" stroke-dasharray="5 3"/>')
    s += (f'<path d="M180,60 l16,22 M196,60 l-16,22" stroke="{RED}" stroke-width="1.6" opacity=".7"/>')
    s += txt(40, 140, "no route clears the wall — it gives up and draws through", RED, 9, mono=True)

    s += box(400, 34, 560, 46, "#0b0d10", LINE, rx=8)
    s += txt(414, 54, "// elbowRouter.ts — autoPoints()", DIM, 9.5, mono=True)
    s += txt(414, 70, "return { points, fallback: true }", GREEN, 10, mono=True)
    s += box(400, 92, 560, 30, "#2a1512", RED, rx=8)
    s += txt(414, 111, "grep '\\.fallback' outside elbow/*.test.ts  →  zero hits", RED, 9.5, mono=True)
    s += txt(400, 144, "The one honest signal about route quality in the whole pipeline is computed", DIM, 9.5, mono=True)
    s += txt(400, 162, "on every route and thrown away. Thread it to a badge and it ships today.", ORANGE, 9.5, mono=True)
    return svg(w, h, s, "The elbow router's unused fallback flag")


def v_group_ungroup(w=980, h=176) -> str:
    """maxGraph groupCells/ungroupCells — the AUTHORING-time operation, distinct
    from folding, and exactly the pure-function shape scene.ts already uses."""
    s = txt(0, 12, "SELECT THREE NODES", DIM, 10, weight="700")
    for i, lab in enumerate(["camera", "detect", "track"]):
        y = 34 + i * 36
        s += box(30, y, 130, 28, PANEL, ORANGE, rx=6, dash="4 3")
        s += txt(95, y + 18, lab, DIM2, 10, anchor="middle")
    s += f'<rect x="20" y="26" width="150" height="116" rx="9" fill="none" stroke="{ORANGE}" stroke-dasharray="3 3" opacity=".6"/>'

    s += f'<path d="M188,84 H248" stroke="{ORANGE}" stroke-width="1.5" marker-end="url(#ao-{w}{h})"/>'
    s += txt(218, 74, "groupNodes", ORANGE, 9.5, anchor="middle", mono=True, weight="700")
    s += txt(218, 100, "ungroupNodes", DIM, 9, anchor="middle", mono=True)
    s += f'<path d="M248,104 H188" stroke="{DIM}" stroke-width="1.2" stroke-dasharray="3 2" marker-end="url(#a-{w}{h})"/>'

    s += box(266, 26, 190, 116, PANEL, LINE2, rx=9)
    s += f'<rect x="266" y="26" width="190" height="22" rx="9" fill="{PANEL2}"/>'
    s += txt(278, 41, "Group  n9", FG, 10, weight="600")
    for i, lab in enumerate(["camera", "detect", "track"]):
        y = 56 + i * 28
        s += box(280, y, 162, 22, PANEL2, LINE, rx=5)
        s += txt(361, y + 15, lab, DIM2, 9.5, anchor="middle")

    s += f'<line x1="500" y1="16" x2="500" y2="{h - 14}" stroke="{LINE}"/>'
    s += txt(526, 12, "WHY THIS ONE, NOT “COLLAPSE”", ORANGE, 10, weight="700")
    lines = [
        ("groupNodes(scene, ids)", "synthesises a parent that did not exist"),
        ("fold / collapse", "changes how an EXISTING parent draws"),
        ("", ""),
        ("both are needed —", "different functions, different inverses"),
    ]
    for i, (a, b) in enumerate(lines):
        y = 42 + i * 26
        if a:
            s += txt(526, y, a, ORANGE if i == 0 else DIM2, 9.5, mono=True,
                     weight="700" if i == 0 else "400")
            s += txt(716, y, b, DIM, 9.5, mono=True)
    s += box(526, 128, 434, 30, "#12301c", GREEN, rx=7)
    s += txt(538, 147, "(scene, nodeIds) → { scene, groupId }   — pure, same shape as scene.ts",
             GREEN, 9.5, mono=True)
    return svg(w, h, s, "groupNodes and ungroupNodes as pure authoring functions")


def v_action_vocab(w=980, h=186) -> str:
    """Sprotty's Action union + xyflow's changes-array reducer: one serializable
    word for 'what changed', applied in a batch."""
    s = txt(0, 12, "TODAY — one bespoke pure function per edit", DIM, 10, weight="700")
    for i, fn in enumerate(["duplicateNode(scene, id, mint)", "linkedCopy(scene, id, mint)",
                            "…and one more per new operation"]):
        y = 32 + i * 28
        s += box(20, y, 380, 22, PANEL, LINE, rx=5)
        s += txt(30, y + 15, fn, DIM2 if i < 2 else DIM, 9.5, mono=True)
    s += txt(20, 128, "nothing names WHAT CHANGED, so a host cannot log it,", DIM, 9.5, mono=True)
    s += txt(20, 146, "replay it, send it to a peer, or invert it.", DIM, 9.5, mono=True)

    s += f'<line x1="440" y1="16" x2="440" y2="{h - 14}" stroke="{LINE}"/>'
    s += txt(466, 12, "ONE VOCABULARY, APPLIED AS A BATCH", ORANGE, 10, weight="700")
    s += box(466, 30, 240, 96, PANEL2, ORANGE, rx=8)
    s += txt(478, 48, "type SceneChange =", ORANGE, 9.5, mono=True, weight="700")
    for i, v in enumerate(['{ kind:"move",   id, position }',
                           '{ kind:"connect", edge }',
                           '{ kind:"remove",  id }']):
        s += txt(478, 66 + i * 17, v, DIM2, 9, mono=True)
    s += f'<path d="M718,78 H756" stroke="{ORANGE}" stroke-width="1.4" marker-end="url(#ao-{w}{h})"/>'
    s += box(766, 56, 194, 44, "#12301c", GREEN, rx=8)
    s += txt(778, 74, "applySceneChanges(", GREEN, 9.5, mono=True)
    s += txt(778, 89, "  scene, changes[])", GREEN, 9.5, mono=True)
    s += txt(466, 148, "xyflow proves the shape at production scale; Sprotty proves the vocabulary",
             DIM, 9.5, mono=True)
    s += txt(466, 166, "travels over a wire. bbox-ui still owns no stack and no engine.",
             DIM, 9.5, mono=True)
    return svg(w, h, s, "A serializable scene-change vocabulary applied as a batch")


def v_cut_gesture(w=980, h=170) -> str:
    """Blender Cut Links / Dump's knife: drag a stroke, sever every wire it crosses."""
    s = txt(0, 12, "SEVER EVERY WIRE THE STROKE CROSSES — ONE GESTURE", ORANGE, 10, weight="700")
    lefts = [("imu", 46), ("gps", 86), ("cam", 126)]
    for lab, y in lefts:
        s += box(30, y - 14, 86, 28, PANEL, LINE2, rx=6)
        s += txt(73, y + 4, lab, DIM2, 9.5, anchor="middle")
        s += dot(116, y, 4, BLUE)
    rights = [("fuse", 56), ("plan", 116)]
    for lab, y in rights:
        s += box(420, y - 14, 86, 28, PANEL, LINE2, rx=6)
        s += txt(463, y + 4, lab, DIM2, 9.5, anchor="middle")
        s += dot(420, y, 4, GREEN)
    pairs = [(46, 56), (86, 56), (126, 116)]
    for i, (y1, y2) in enumerate(pairs):
        cut = i < 2
        s += (f'<path d="M116,{y1} C240,{y1} 300,{y2} 420,{y2}" fill="none" '
              f'stroke="{RED if cut else BLUE}" stroke-width="1.6" '
              f'{"stroke-dasharray=\"5 4\" opacity=\".55\"" if cut else ""}/>')
    s += (f'<path d="M196,24 C232,60 248,96 214,146" fill="none" stroke="{ORANGE}" '
          f'stroke-width="2.4" stroke-linecap="round" opacity=".9"/>')
    for cx, cy in [(214, 55), (222, 82)]:
        s += (f'<path d="M{cx - 6},{cy - 6} l12,12 M{cx + 6},{cy - 6} l-12,12" '
              f'stroke="{RED}" stroke-width="2"/>')
    s += txt(260, 146, "2 wires severed, 1 untouched", RED, 9.5, mono=True)

    s += f'<line x1="560" y1="16" x2="560" y2="{h - 14}" stroke="{LINE}"/>'
    s += txt(586, 12, "WHY IT IS CHEAP HERE", DIM, 10, weight="700")
    s += txt(586, 42, "wireLayer.tsx already hit-tests each rendered edge path.", DIM, 9.5, mono=True)
    s += txt(586, 62, "The gesture adds one thing: segment-intersection between", DIM, 9.5, mono=True)
    s += txt(586, 82, "the drag polyline and each path. No new geometry primitive,", DIM, 9.5, mono=True)
    s += txt(586, 102, "no new record — it emits N remove-edge changes.", DIM, 9.5, mono=True)
    s += box(586, 118, 374, 30, "#2a1d10", ORANGE, rx=7)
    s += txt(598, 137, "Blender ships it as Cut Links; Dump ships it as a knife.", ORANGE, 9.5, mono=True)
    return svg(w, h, s, "A cutting-line gesture that severs every crossed wire")
