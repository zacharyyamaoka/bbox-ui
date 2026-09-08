# Architecture

One presentational core, two host adapters that share nothing with each other.

```
packages/bbox-ui              the core: props in, DOM out
├── src/layout.ts             pure geometry — no React, no canvas engine
├── src/port.tsx              Port / PortDot / PortLabel
└── src/block.tsx             Block / BlockHeader / BlockGlyph / BlockTitle /
                              BlockChip / BlockDescription / BlockType

packages/adapter-reactflow    React Flow custom node wrapping the core
packages/adapter-tldraw       tldraw ShapeUtil wrapping the core
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
| size authority | the DOM — RF measures into `node.measured.*`, hug-contents is free | the shape record — `props.w/h` are authoritative, geometry from `getGeometry()` |
| a port is | a real `<Handle>` DOM element (painted with the shared `portDotClass`) | a geometry point from `portAnchor()`, painted with the core `PortDot` |
| hit-testing / drag / snap / z-order | React Flow | tldraw |
| `received` port state | node data (React state — never serialized by us) | a runtime `atom` side table; the shape prop validator rejects `"received"` outright |

An adapter may import the core and its own engine — never the other engine,
never the other adapter. That rule is what keeps a third host (an SVG
snapshotter, an Obsidian view) a ~150-line afternoon instead of a fork.

## Why `received` is runtime-only

"Data Recived" (board spelling) means *data flowed through this port just
now*. Only a live host can know that; a document that persisted it would lie
after reload. So the core types it as a `PortState`, but
`PERSISTABLE_PORT_STATES` excludes it, and the tldraw adapter enforces the
exclusion in its props validator.
