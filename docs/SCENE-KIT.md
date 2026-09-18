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
- `linkedCopy`: same, plus the copy joins the source's definition GROUP.
  `definitionId` is a group id shared by every occurrence — minted like a
  node id, never equal to one — so there is no privileged "definition
  node" whose deletion could orphan the rest, and `linkedCopies` stays one
  equality test. (2026-09-17: migrated from the earlier points-at-the-root
  reading, which died on exactly that deletion case.)

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

## Definition linking — same name = same thing

`src/scene/linking.ts`, ported 2026-09-17 from SystemSketch's
`src/blocks/definitions/definitionLinking.ts` (donor revision `10748b8`,
line-level provenance and the exhaustive dropped/deviated list in the
module header). Zach's settled model, after several iterations (the
pyblocks notes record the earlier reject-as-namespace-conflict and `_N`
suffix eras): **"we settled on copying the software model. If it has the
same name then it's the same thing."**

The rules:

1. **Same name = same thing.** Two nodes whose normalized names agree are
   occurrences of one definition. `definitionId` carries the resolved
   group between operations; the NAME GESTURE (`commitDefinitionName`) is
   the only thing that re-derives it — nothing links two nodes except
   through the name.
2. **Renaming one occurrence detaches it — never renames its links.** The
   donor's WHY: the title is the escape seam between two occurrences;
   broadcasting it first made a rename incapable of expressing "this one
   is different". This was the recurring bug ("otherwise you can never
   link"), and it is the mutation-tested assertion (L1).
3. **Same name over different content drafts automatically.** The
   occurrence keeps the colliding name and gains `draftOrdinal` N (badge
   "Draft N"). Ordinals only count up — `1 + max(in use)`, a freed number
   is never refilled — and when a name's canonical definition disappears,
   the LOWEST ordinal (the oldest: FIFO) is promoted to canonical. An
   EMPTY block named after an existing definition adopts it instead of
   drafting (nothing to diverge with), content flowing into the joiner.
4. **Data is linked; appearance is free — except the expanded view's.**
   The linked facets are `name`, `data.linked` (content), `data.expanded`
   (the expanded view's appearance — the function BODY: one definition,
   every call site points at it), and `draftOrdinal`. Everything else —
   `data.appearance`, `position`, `parentId`, wiring — is occurrence-
   local. The split is explicit in `OccurrenceData`'s type, not a comment.
5. **Port identity is namespaced to the node** (`portKey`). Occurrences
   share a port VOCABULARY (it lives in linked data) while their port
   keys are disjoint by construction — an extension the donor never
   needed, and what lets `findDanglingEdges` catch a dead port on a live
   node.
6. **Unlink = a new name.** `unlinkOccurrence` gives the freed block a
   collision-free numbered title (`mix_1`, `run_1()`), because keeping
   the old name would silently re-link on the next reconcile — "no point
   in even calling it the same thing". `duplicateNodeUnlinked` is
   duplicate-then-unlink; the DEFAULT duplicate (`linkedCopy`) yields
   another occurrence.
7. **Deletion takes the subtree, and the edge fate is the host's call.**
   `deleteNode(scene, id, policy)` — the policy is REQUIRED (Zach: "leave
   this as a toggle for now so the people can decide"): `"drop"` (both
   engines' own gesture), `"dangle"` (edges survive unresolvable), or
   `"park"` (`data.parked` stamps the dead ends — dangling on purpose, so
   undo re-resolves and a lint can tell deliberate from broken).
   `findDanglingEdges` (scene.ts, beside the other lints) is what makes
   the permissive policies safe: dangling-and-not-parked on load means
   the document is wrong. Deleting an occurrence never touches the
   survivors; deleting the LAST occurrence deletes the definition (it
   lives only in its occurrences), and the closing reconcile FIFO-promotes
   its oldest draft.
8. **`reconcileDefinitions` repairs authored scenes** into the invariant
   (mint missing group ids, merge same-name+same-content, draft
   same-name+different-content, renumber colliding ordinals, converge
   intra-group drift to the first occurrence) — run on load or after
   surgery, never on keystrokes.

Two donor behaviours were deliberately NOT ported (module header #7/#8):
a no-op name commit re-drafting the canonical (a blur-handler artifact),
and the empty-adopt syncing OUTWARD from the empty joiner (the donor's
own code contradicts its stated intent there; the port implements the
intent). The body-materialization machinery (donor's cloned child shapes)
stayed behind with tldraw — `data.expanded` is the linked body here.

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
- `pnpm exec vitest --project=unit run` — 287 (was 235; +45 linking tests
  in `linking.test.ts`, +8 in `scene.test.ts` for `findDanglingEdges` and
  the group-id migration, -1 replaced).
- `pnpm test-stories` — 157 (was 151; +6 interactive `Linking` stories
  under Blocks/Scene/Linking, every rule asserted in a play function).
- `topologicalOrder` and `findCycles` are mutation-tested; the surviving
  on-stack mutant produced the cross-component-edge test now in
  `scene.test.ts`. Linking is mutation-tested too (2026-09-17):
  broadcast-rename (L1), blind content signature (L2), and a port-blind
  `findDanglingEdges` (L9) each turn the suite red.
