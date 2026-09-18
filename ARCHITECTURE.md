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

This diagram describes what's **published** — `packages/bbox-ui` plus its two
adapters, wired into `registry.json` and `apps/docs` today. It does not say
where design *decisions* get made. That question has its own answer, below,
and as of 2026-09-17 the two answers point at different trees.

## The trunk — one canonical lineage, three consumers

**`apps/storybook-basics` is the design trunk.** Every component decision of
the last four days — LabeledPort's root-is-the-dot-box fix, grouped-spacing
in PortEdge, the multi-line lane, PortedBlock's rail-placement rules, Trace's
elbow routing and the wire layer — landed there, not in `packages/bbox-ui`.
`packages/bbox-ui` is **frozen as the v1 lineage**: it keeps everything it
has (the adapters, `blockLayout.ts`, detach, the schema — none of that exists
in the trunk yet) and stays published exactly as-is, but it stops being where
a design decision lands. A future regeneration of `packages/bbox-ui` from the
trunk is P7's kind of work, not a mandate of this page.

Three trees consume the trunk, each differently:

| Consumer | What it does today | State |
|---|---|---|
| `packages/bbox-ui` (+ its two adapters) | Still what `registry.json`'s `port`/`block`/adapter items ship and what `apps/docs`'s live previews render via `@bbox-ui/core` | Frozen v1. Not edited as a design surface; a full migration to the trunk is unscheduled follow-up work, not done here |
| `registry.json` (this file's sibling) | New items (`port-v2`, `block-v2`, `trace`, `port-edge`, `block-port`, …) now publish trunk source directly — see `CLAUDE.md`'s "The registry is the product" | Live as of this page (P7) |
| `systemsketch/src/bboxUi/` | A **hand-vendored snapshot**, not an install — wired into a live "BBOX-UI" toolbar family since `47c3e2c9` (SystemSketch, 09-14) | **Actively diverging**, verified below |

### The divergence is real, not just staleness — verified 2026-09-17

Measured directly against `/home/bam/systemsketch` (read-only):

- **Structural staleness.** `src/bboxUi/core/port.tsx` is 687 lines with
  **zero** hits of `SlotOrigin`/`secondarySlot` (`wc -l` and `grep -c`, run
  2026-09-17) — it predates the trunk's split of that concept out into
  `port.layout.ts` (which carries it now, 10 hits) plus `port.tsx` /
  `portEdge.tsx` / `blockPort.tsx`. That much matches what `PORT-EDGE-PLAN.md`
  already recorded.
- **It is not merely stale — it took its own fixes after that split, and
  they exist in no bbox-ui lineage.** `git log --since=2026-09-15
  --until=2026-09-16 -- src/bboxUi/` inside SystemSketch shows 20 commits
  between `641e6a83` (17:35) and `10748b8c` (22:30), all after the split was
  already known-stale:
  - `4c01e6fe` (18:49) fixes four real bugs in the vendored copy's `Code`
    shape — click-to-position, indentation at rest, a missing floating menu —
    touching both `src/bboxUi/core/codeBlock.css` and three
    `src/bboxUi/adapter/` files. `docs/bbox-code-click-to-edit-live-2026-09-15.png`
    is the driven-not-guessed evidence cited in the commit itself.
  - `234460ae` through `11dfa229`/`10748b8c` (19:47–22:30) are **nine rounds
    of adversarial-review fixes** hardening the click-to-edit invalidation
    timer in `src/bboxUi/adapter/bboxCodeClickToEdit.ts` — round 9 adds a
    real browser smoke test (`tests/bbox_code_click_to_edit_smoke.mjs`, 290
    lines) that this repo has no counterpart for.

  None of those 20 commits' changes exist anywhere in `packages/bbox-ui` or
  `apps/storybook-basics` — confirmed by grepping this repo for the touched
  filenames and finding no match. Most of the fixed surface
  (`bboxCodeClickToEdit.ts`, the invalidation timer, the pointer-events CSS)
  is host-owned interaction code by this repo's own rule ("interaction
  geometry is host-owned and never travels") — so it was never going to be a
  core-component port. But the underlying bugs it fixes (click-to-position
  inside an editable code block, entry-point lifecycle around delete/reload)
  are exactly the class of thing `code-editor`/`labeled-port`/`port-edge`
  will hit the moment a real host drives them, and nothing today routes that
  learning back. That is the semantic-merge-conflict setup P2 warned about:
  two individually-correct copies, no shared channel between them.

One correction to the record this page supersedes: `docs/PROPOSALS-2026-09-17.md`
(written earlier the same day) states Group B — the wire layer — was "not
built... zero hits for `wireLayer` in `src/`". That is now stale, not wrong
for its time: `wireLayer.tsx` and `wiring.ts` landed at `e6aea8e` (17:19,
"Wires between real ports"), before this page was written. Filed here so the
correction doesn't get lost the way the proposal it corrects is passed
around.

### What to do when you find the same component in two places

1. **The trunk (`apps/storybook-basics/src/components/`) wins the design.**
   If `packages/bbox-ui` or `systemsketch/src/bboxUi/` disagrees with it on
   anything but publish-surface (adapters, schema), the trunk is right and
   the other tree is behind.
2. **A fix made on a vendored copy (`systemsketch/src/bboxUi/`, or any other
   hand-copy) does not travel on its own.** Leave a one-line `// owed
   upstream: <what, where>` comment at the fix so a grep for "owed upstream"
   finds it, and port the *lesson* — not necessarily the code, since
   interaction-layer fixes are host-owned by design — back into the trunk or
   its story coverage.
3. **Never edit `packages/bbox-ui` to chase a trunk change.** It is frozen
   v1: bug-for-bug stable until an explicit regeneration project (P7-class
   work) replaces its registry items and `apps/docs`'s previews together, in
   one pass, so the "install" tab and the live preview never again show two
   different components under one name.

## Kits and consumers — what is core, and who depends on it

Zach, 2026-09-17: *"I want to make it clear what is the core package and what
are consumers."* This is that chart. It answers "I changed X — what else needs
updating?" and it is the thing to re-read before starting any cross-cutting
change.

### The three kits — the core

| Kit | What it is | Rule |
|---|---|---|
| **`components`** | The atoms that DRAW a scene element: `Block`, `Port`, `Trace`, `Bar`, `CodeEditor`, and their composites. | Props in, DOM out. No state beyond its own gesture. **Imports no canvas engine, and imports no scene.** |
| **`scene`** | The ensemble: what exists, what connects, what nests, what identity is — plus every pure function over it (`topologicalOrder`, `findCycles`, `wiredPorts`, tidy, lint, rank). | `f(scene) → data`. **No React, no DOM, no engine, not even their types.** Runs in Node, which is why its tests are milliseconds. |
| **`edit`** | The authoring surfaces: inspector panel, glyph picker, the quick-pick menu, style controls. *Not "menus"* — what unites them is that they **produce scene mutations**. | Reads a scene, renders with `components`, emits a mutation. Imports both other kits; nothing imports it. |

The dependency DAG, which is the whole architecture in four lines:

```
  scene  ←──────  components        components never imports scene
    ↑                 ↑
    └───── edit ──────┘             edit imports both; nothing imports edit
```

`components` not importing `scene` is the load-bearing one. It is what lets the
same `Block` be driven by a story literal, a React Flow node, a tldraw shape or
a server-side render, and it is checked by grep in CI's stead — see
`docs/SCENE-KIT.md`.

### The naming, and what it rejects

`components` / `scene` / `edit` — atom, ensemble, mutation. Considered and
rejected, recorded so it is not relitigated:

- **`view`** for the first — says what it does, not what it is, and "UI kit" is
  vaguer still since every kit here is UI.
- **`elements`** — Zach's own suggestion, and the atom/ensemble pairing behind
  it is why the second kit is `scene`. Rejected on a collision: in React an
  *element* is the OUTPUT of a component (`<Block />`), not the component
  (`Block`), so a package of components called `elements` inverts React's own
  vocabulary. Compounded by the diagramming world using "element" for DATA
  (Excalidraw's `ExcalidrawElement`, tldraw's shapes) — the side we did not
  pick, when we already ship `SceneNode` for it.
- **`graph`** for the second — suggests charts, and does not cover placement.

### Consumers — two kinds, and the difference matters

They consume **different contracts**, which is why conflating them causes
questions like "does the registry need to support scenes?" (it does not; it
never runs one).

**Hosts** — consume the *scene contract* at runtime. Each owns the viewport
transform, pan/zoom, canvas-spanning drag, and spatial hit-testing.

| Host | Why it exists |
|---|---|
| **DOM** | The reference host, and the fastest iteration surface. Already exists as `Scene.stories.tsx`. Deliberately has no viewport — the moment it grows pan/zoom it is a canvas engine and should be tldraw. |
| **React Flow** | A barebones viewport, and the cheap proof. |
| **tldraw** | The full whiteboard — draw alongside the graph, move things, the rest of the surface. |
| **SystemSketch** | The real product. Eventually. |

**Why two engine hosts rather than one:** not for their features — tldraw alone
would do. **One host cannot falsify a contract; two can.** If the same scene
drives both a barebones viewport and a full whiteboard, "backend-agnostic"
stops being an aspiration and becomes a measurement.

**Channels** — consume *source*, not a runtime contract. They copy files.

| Channel | What it takes |
|---|---|
| **shadcn registry** | Source, copied verbatim. The only distribution channel; npm is deliberately not one. |
| **bbox-ui.com** (`apps/docs`) and `/create` | Source + live demos. |
| **Storybook** (`apps/storybook-basics`) | The workbench, and the trunk itself. |

### Where an interaction belongs

Two tests, coarse then fine:

1. **Does it need a viewport transform?** Yes → host.
2. **Is it bounded by one component's own box, or does it span the canvas?**
   Bounded → ours. Spanning → host's.

The second is the one that settles real cases: reordering ports on a rail and
dragging members inside a block are bounded (ours, already built on dnd-kit);
dragging a node across the board, resizing it, panning are spanning (host's).

**Drawing an edge splits**, and it is the case worth knowing: the gesture spans
the canvas so the host owns it, but the port-side affordances — what is a valid
target, what the rail does as the pointer approaches, where a new port would be
inserted — are ours, and they are the expensive part. "Interactions are blocked
on the whiteboard framework" is therefore only about a third true.

### Measurement is the host's job too

A layout function needs to know how big a node is, and size is a VIEW fact
(rendered text width, font, padding). That looks like it breaks the split. It
does not, and React Flow already shows the way — the vocabulary `scene`
borrowed carries the answer: **the host measures and writes the result back
into the scene as data** (`node.measured.width/height`). The algorithm reads a
number; it never touches a DOM node.

So: the scene may CONTAIN measurements, it just never TAKES them.

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
