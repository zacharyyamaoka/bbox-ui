# The scene kit — decisions and their reasons

2026-09-17. bbox-ui is now two kits. The **view kit** (`src/components/`) is
unchanged: props in, DOM out. The **scene kit**
(`apps/storybook-basics/src/scene/scene.ts`) is one record for how blocks
relate and talk — `SceneNode` / `SceneEdge` / `BlockScene` — plus pure
functions over it. Zero React, zero DOM, zero canvas engine, zero imports.

Zach's framing, which this implements: *"pure UI kit and then Graph/Scene Kit
which is all about how the different components are relating… I need like a
common datatype that I can pass into all my pure functions… then to adapt
into reactflow or tldraw, its simply a case about matching the graph data
types."*

## Borrowed from React Flow, falsifiably

The vocabulary is React Flow's on purpose — `source`/`target`,
`sourceHandle`/`targetHandle` (a handle IS a port id), `position`, `data`,
`parentId` — because the names carry the domain (DDD: borrow the vocabulary,
not the package). "Borrowed exactly" is not a vibe:
`src/scene/scene.reactflow.test.ts` proves `SceneNode → Node` and
`SceneEdge → Edge` against `@xyflow/react`'s real published types **with no
cast**, as universally-quantified functions, gated by `tsc --noEmit`
(vitest does not typecheck). `@xyflow/react` is a devDependency of
`bbox-storybook-basics` solely so that test's type imports resolve; nothing
in `src/scene/` or `src/components/` imports it.

Deliberate divergences, both argued in `scene.ts`:

- `definitionId` is an extra field React Flow's `Node` lacks — structurally
  invisible to assignability, carries linked-copy identity.
- Handles are `string | undefined`, never `null` — one spelling of "no
  handle". Narrower assigns into RF's wider type for free; the pure
  functions' `SceneEdgeEnds` slice re-admits `null` so RF's own `Edge[]`
  feeds them unmodified.

## Placement: `position` on the node, no `placements` table

Argued both ways, decided for the node:

- **For a separate `placements` table**: "interaction geometry is host-owned"
  (ARCHITECTURE line). But that names hit-testing, snapping, drag, z-order —
  the transient geometry of a gesture. The same line's other half says layout
  geometry is portable; an authored at-rest position is layout, exactly as
  `BlockMember.x/y` already was.
- **Against**: two structures owning one fact is the split-model disease this
  kit cures; React Flow makes `position` required on the node, so a side
  table forces a join in every adapter and a cast in the assignability
  proof — the acceptance criterion failing.

So `BlockScene` is `{ nodes, edges }`, `position` is the node's authored
at-rest placement (parent-relative under `parentId`), and a host mid-drag
owns the moving copy, writing back at rest.

## Identity: `id` is identity, `name` is a label

- `id`: opaque, unique per scene, minted by the **host** (`mintId` callbacks,
  the D9 rule `portLane.ts` already established). Never derived from a name.
- `data.name`: display data. Free to collide, free to change; no edge notices.
- `duplicateNode`: fresh id, everything else verbatim — including
  `definitionId` (copying never launders a link away, never adds one). Edges
  and children do not multiply.
- `linkedCopy`: same, plus `definitionId = source.definitionId ?? source.id` —
  chains flatten to the root definition so `linkedCopies` is one equality
  test, never a walk.

This is the rule that dissolves the port-identity symptom: `portLane.ts`
needed an LCS diff to decide "which port keeps its id" only because lane
lines carry no id. Scene records always do.

## What was absorbed

Three partial scene models existed; one is absorbed, two are documented
tenants:

- **`wiring.ts` — absorbed.** Deleted from it: `wireEndKey`, `wiredPortKeys`,
  `withWiredState`, and `Wire`'s role as a record hosts author. The record is
  `SceneEdge`; the derivation is `scene.ts`'s `wiredPorts`; the item-state
  map moved to the adapter (`sceneWires.ts`). What remains in `wiring.ts` is
  paint only: `Wire`/`WireEnd` as `WireLayer`'s prop vocabulary and the
  duplicate fan. `BlockWiring` and `AsyncRegion` stories now author scenes
  (or scene edges) and derive; `wireLayer.tsx` needed no edit.
- **`blockMembers.tsx` — tenant.** `parentId` owns nesting in the scene;
  `BlockMember` remains the view of it (a host builds members via
  `childrenOf`, as `Scene.stories.tsx` does). Its `x/y` remain view-props for
  free-layout rendering; a scene-authoring host feeds them from `position`.
- **`portLane.ts` — tenant, deliberately.** See below.

## The layering rule

`scene.ts` imports nothing. Components never import the scene — not even
transitively (that is why `Wire` did NOT become `extends SceneEdge`:
`WireLayer` imports `wiring.ts`, and the wall holds only if scene types stay
out of it). The bridge is `src/scene/sceneWires.ts`, an adapter allowed to
know both vocabularies — the same licence `packages/adapter-reactflow` has
for its engine. Hosts (stories, apps) read a scene and pass props.

## What absorbing `portLane.ts`'s reconcile would take

The reconcile exists because the lane's TEXT is the identity-free surface.
To absorb it, ports must become scene-owned records:

1. A port list per node — either `data.ports: { id, label }[]` by convention
   or a first-class `SceneHandle` (React Flow's `Node.handles` is the
   borrowable shape).
2. `formatPortLane` reads that list; `reconcilePortLane(ports, text, mintItem)`
   becomes `reconcileNodePorts(scene, nodeId, text, mintId): BlockScene` —
   same LCS + positional-zip contract, returning a scene whose edges are
   REWRITTEN where a port id died (edge ends naming a deleted port drop to
   `data-unresolved-wires` honestly rather than dangling).
3. The LCS itself survives unchanged — it is the right answer for "an edit
   arrived as text"; what changes is the owner: today the reconcile writes
   `PortEdgeItem[]` (view items), afterwards it writes the scene and the view
   derives.

Not done now because it edits `portEdge.tsx`'s controlled-items seam, which
another lane holds today.

## Verification

- `pnpm exec tsc --noEmit -p .` — includes the assignability proof.
- `pnpm exec vitest --project=unit run` — 224 (was 186; +38 scene tests).
- `STORYBOOK_PORT=5453 pnpm test-stories` — 140 (was 139; +`SceneDriven`,
  which measures rendered wire terminals against the scene's edges).
- `topologicalOrder` and `findCycles` are mutation-tested; the surviving
  on-stack mutant produced the cross-component-edge test now in
  `scene.test.ts`.
