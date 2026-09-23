# 0005 — The DOM canvas stays static; interactive twins run on React Flow

- **Status**: accepted
- **Date**: 2026-09-22
- **Decided by**: Zach, on the decision report
  `reports/dom-canvas-vs-reactflow-2026-09-22.html` (builder:
  `docs/build_dom_canvas_report.py`), which recommended option A+. His
  call, verbatim: *"ok its settled 100% lets use reactflow than."*
- **Seam**: `apps/storybook-basics/src/hosts/domCanvas.tsx:5` carries a
  `WHY:` pointing here. The React Flow half is
  `apps/storybook-basics/src/hosts/reactFlowHost.tsx` (`KitRoutesContext`,
  whose doc cites this record), routing through
  `apps/storybook-basics/src/components/wireLayer.tsx`'s `resolveWires` +
  `ResolvedWireTrace`.

## The ruling

**The DOM canvas (`hosts/domCanvas.tsx`) stays static: no viewport, no pan,
no zoom, no top-level node drag. Anything that has to move across the canvas
is shown in a React Flow twin of the same scene, and that twin draws the
kit's own cables** — the same router, keep-outs, ring-flush ends and
no-arrow default the DOM canvas's `WireLayer` uses, from one derivation
measured in flow space. React Flow keeps its own node drag, selection and
handles stock; only the edge paint/route goes through its custom edge type.
Gestures bounded by one component's box (member drag, port reorder, cable
corners) stay in the kit and work in every host, the static one included.

## What forced it

Zach's note of 2026-09-22 asked whether to build "a dom canvas where you can
drag things around", or lean on React Flow, while keeping the "silly DOM"
host as the plain baseline that shows "exactly what is reactflow giving".
The report measured three things that decided it:

- **Moving a box on a DOM canvas is cheap; everything after it is React
  Flow.** Step one is ~40–60 new lines (the drag reducer, its React binding
  and member drag already exist). Raise-on-top, resize, select/marquee and
  snapping take the barebones canvas to ~385–655 lines and still climbing —
  against ~1,500 bundled lines `@xyflow/system` 0.0.82 already ships for the
  same set.
- **The React Flow twin was not free yet.** Its host drew its own stock
  cables — `getSmoothStepPath`, no keep-outs, a 16px gap short of the ring
  (`reactFlowHost.tsx:481-500` at `51a81e1`). A React Flow copy of the wall
  crossing would have routed differently and shown no wall rings: two
  routers, not two hosts. Parity was one seam, paid once for every React
  Flow story.
- **Cable-corner drag is nobody's stock part.** `@xyflow/react` 12.11.6
  exports nothing for it (0 hits). It is a kit job either way —
  `components/traceEditor.tsx` already does straight cables, SystemSketch's
  P-028 does elbows with stock tldraw handles — so it cannot be a reason to
  pick either canvas.

## Options weighed

Criteria, weighted for where the work stood (1 = poor, 5 = strong; total =
Σ(score × weight) ÷ 5, out of 100):

| # | Criterion | Weight |
|---|---|---|
| C1 | Keeps the work on static UI | 20 |
| C2 | Hit-testing and gestures carry over to the product | 20 |
| C3 | Shows what React Flow gives vs vanilla DOM | 15 |
| C4 | Lines now, and the slope after | 15 |
| C5 | Off-the-shelf first | 10 |
| C6 | Architecture stays honest | 10 |
| C7 | One obvious answer to "can I drag this here?" | 10 |

| Option | C1 | C2 | C3 | C4 | C5 | C6 | C7 | Total |
|---|---|---|---|---|---|---|---|---|
| **A+** DOM static; React Flow twin after cable parity; bounded gestures in the kit | 4 | 4 | 5 | 3.5 | 5 | 5 | 4 | **86** |
| A — DOM static; React Flow twin on the host as it was | 4 | 4 | 2 | 3 | 5 | 5 | 4 | 75 |
| E — bbox studio (tldraw) as the interactive twin | 3 | 5 | 2 | 2 | 5 | 5 | 3 | 70 |
| C — drop the DOM host; React Flow only | 3 | 4 | 1 | 3 | 5 | 1 | 3 | 58 |
| F — box drag in the wall-crossing bench only | 4 | 2 | 2 | 4 | 2 | 4 | 2 | 58 |
| B — barebones draggable DOM canvas | 2 | 2 | 2 | 3 | 1 | 2 | 4 | 45 |

- **B, a draggable DOM canvas**, lost on C1/C5/C6: it tests a host that
  ships nowhere, shrinks the very difference the DOM host exists to show,
  and reverses the recorded routing (node drag belongs to a real engine).
  Its one strength, C7, is recovered by A+ anyway: in the twin, the answer
  to "can I drag this here?" is React Flow's.
- **A as written** was right in direction but compared routers, not hosts
  (C3 = 2) until the parity seam landed.
- **E, tldraw** is the product and already has corner handles, but the wall
  crossing is not in the studio yet, and whiteboard concerns would muddy a
  host-vs-host comparison.
- **C** deletes the engine-free control that `ARCHITECTURE.md` rests on
  ("one host cannot falsify a contract; two can").
- **F** is one more private DOM host where outer boxes move while
  `DomCanvas` stories do not.

## What we give up

- **You cannot drag a top-level box on the DOM canvas, and never will.** A
  story that needs a box to move goes on React Flow; the DOM pane can still
  *show* the moved state, from the same scene record (the mirror story does
  exactly that).
- **The React Flow twin routes after the fact.** The kit's router needs the
  rendered dots, so a cable is resolved one layout pass after its nodes land
  (`KitWireRouter` measures on every node move, plus one frame). For that
  first frame, and for any end the kit cannot resolve to a dot (a node-level
  edge with no handle), the edge falls back to React Flow's stock path,
  marked `data-edge-route="stock"`.
- **Badges** (`TraceBadge` pills) still render only in `WireLayer`; the
  React Flow edge draws the cable, not its pill.
- **Cable-corner drag is still unbuilt.** It goes in the kit, as an elbow
  mode of `components/traceEditor.tsx` (the handle/reveal pattern and
  `getScreenCTM` already make it host-independent), not in either canvas.

## Proof it holds

`apps/storybook-basics/src/hosts/cableParity.ts` measures, for the same
scene, that both hosts draw every cable on the same waypoints (±1px, same
vertex count) and paint it in the same place relative to each host's origin
— asserted on `HOST_SCENE` (`hosts/CableParity.stories.tsx`) and on the
"w/ ports" region (`hosts/WallCrossingMirror.stories.tsx`, which also drags
a box across the region wall in React Flow and checks the crossing markers
stay on the frame and change count). Reverting the React Flow edge to
`getSmoothStepPath` turns both red.

## What would reopen this

**If a canvas gesture the product needs has no stock React Flow part and
cannot live in the kit** — something that spans the canvas, so the two-test
rule (`ARCHITECTURE.md`, "Where an interaction belongs") hands it to a host,
yet React Flow cannot express it. Then the cost comparison above changes
and a hand-rolled canvas is back on the table. Nothing in view needs that
today.
