# Architecture

One presentational core, two host adapters that share nothing with each other.

```
packages/bbox-ui              the core: props in, DOM out
├── src/layout.ts             pure geometry — no React, no canvas engine
├── src/blockLayout.ts        the Simple View's flex CSS restated as pure
│                             arithmetic (box per part) — detach's authority
├── src/port.tsx              Port / PortDot / PortLabel
└── src/block.tsx             Block / BlockHeader / BlockGlyph / BlockTitle /
                              BlockChip / BlockDescription / BlockType

packages/adapter-reactflow    React Flow custom node wrapping the core
packages/adapter-tldraw       tldraw ShapeUtil wrapping the core
└── src/detach/               detach-to-primitives + rebuild (tldraw-only)
```

## The line

**Layout geometry is portable and lives in the core; interaction geometry
(hit-testing, snapping, z-order, drag) is host-owned and never travels.**

`layout.ts` holds every number measured off the wireframe — text rungs, the
0.9 icon ratio, port diameters and states, the 384 × 258 Simple View box, the
chip oval, and `portAnchor()` for placing dots on a block boundary. It imports
nothing, so any renderer (a host adapter, an SVG exporter, a test) can consume
it without dragging React or an engine along.

The core components (`port.tsx`, `block.tsx`) turn those numbers into DOM.
They have **zero imports of tldraw, zero imports of React Flow, zero canvas
assumptions**. They never listen for pointers, never measure themselves,
never claim a z-index.

## What each host owns

| | React Flow | tldraw |
|---|---|---|
| size authority | the DOM — RF measures into `node.measured.*`. Hug-contents is the default, and overridable through CSS: an explicit size goes on as `style: { width, height }` (the node's `width`/`height` fields are where RF *stores* what it measured, not an input) with the core Block filling the box | the shape record — `props.w/h` are authoritative, geometry from `getGeometry()` |
| a port is | a real `<Handle>` DOM element (painted with the shared `portDotClass`) | a geometry point from `portAnchor()`, painted with the core `PortDot` |
| hit-testing / drag / snap / z-order | React Flow | tldraw |
| `received` port state | node data (React state — never serialized by us) | a runtime `atom` side table; the shape prop validator rejects `"received"` outright |

An adapter may import the core and its own engine — never the other engine,
never the other adapter. That rule is what keeps a third host (an SVG
snapshotter, an Obsidian view) a ~150-line afternoon instead of a fork.

## The size contract

**Explicit size when the scene carries one; hug contents when it does not.**
Stated once, in `explicitBlockSize()` (`demos/scene`), never re-derived per
adapter. A block resized in one host must paint the exact same box in the
other: tldraw takes the pair as `props.w/h`; React Flow takes it as CSS on
the node with the core Block filling that box, and its port anchors come from
the same `portAnchor(side, t, w, h)` call as tldraw's — so a resize moves the
ports identically in both hosts. Interactive resizing is host-owned
(interaction geometry): tldraw's stock handles on one side, an opt-in
`<NodeResizer>` (`data.resizable`) on the other, which writes the result back
into `data.w/h` + `style` so the node round-trips as if the scene had carried
the size all along. The compare panes never enable it — they are read-only by
design, and a resize mid-measurement would de-calibrate the readout.

## Detach to primitives

A bbox-ui shape can leave the kit: **Detach to primitives** (tldraw only —
stock shapes are tldraw's vocabulary) replaces it with the closest stock
approximation, grouped, and **Rebuild** brings it back. Three rules hold it
together (`packages/adapter-tldraw/src/detach/`):

- **Hierarchy through a contract, not recursion.** Each kind declares how it
  reduces itself and which phase it runs in (`detachableKind.ts`); a phased
  sweep runs `leaf` kinds before `container` kinds in one global order
  (`detachPlan.ts` / `detachSweep.ts`). A composite never enumerates child
  kinds: Block's picture invokes `primitivesForPort` per port — the same
  reduction the standalone Port kind uses — and each port becomes a nested
  group inside the Block group, so unpeeling top-down lands on sensible
  units. WHY not naive depth-first recursion: it breaks two invariants once
  edges and containers exist (an edge must lower while both endpoints still
  stand; a container reduces only after its contents), and breaking either
  corrupts rebuild fidelity — SystemSketch tried and rejected it.
- **Geometry from the layout authority.** The detached picture derives from
  `layout.ts` + `blockLayout.ts` — the same numbers the live renderer
  paints from — never from re-measured DOM, never hand-typed offsets.
- **The group remembers.** The replacement group's `meta.bboxUi`
  (`detachModel.ts`, pure) carries a versioned record with the complete
  original props; a reader that meets a newer version declines rather than
  guessing. `meta` survives save/load/copy/paste and stock tldraw ignores
  it, so a `.tldr` opens as plain shapes anywhere and rebuilds here. On
  rebuild, props come from the record verbatim; position comes from where
  the marked anchor primitive (card / ring) is now, so a moved group
  rebuilds where the user left it. Ungrouping by hand discards the record —
  that is the honest meaning of taking the thing apart.

## Why `received` is runtime-only

"Data Recived" (board spelling) means *data flowed through this port just
now*. Only a live host can know that; a document that persisted it would lie
after reload. So the core types it as a `PortState`, but
`PERSISTABLE_PORT_STATES` excludes it, and the tldraw adapter enforces the
exclusion in its props validator.
