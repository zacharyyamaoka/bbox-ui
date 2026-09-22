# Control flow in the bbox-ui trunk — Region, Loop, Branch, and the opaque ⇄ expanded toggle

*Plan, 2026-09-18 evening. Base: `claude/control-flow-integration-2026-09-18` @ `f80ebbf`.
Written by a Fable 5.1 planning agent; Zach is away — every open question below carries the reversible
default the build takes on silence. This `.md` is the lane-readable input (isolated worktrees read it
from a commit). The rich-media report for Zach is built by the dispatcher AFTER implementation from
real captures — see §8 for what to capture.*

---

## 0 · The recommendation, in six lines

1. **A region is one scene node** (`type: "region"`, `scene/region.ts:60`) **whose ports ARE the corner block's ports.** The frame is how that node *renders* its scope; the corner block is how it *renders* its interface. One id, one port vocabulary, one `data-block-id` (on the corner card, never on the frame). That is "everything is a block" made structural, it is what pyblocks' P1 lane already froze (`RegionInterface.tsx:1-9`: "a region is a frame with ZERO ports of its own… gathered into a HEAD card rendered inside the same box the frame draws"), and it is Zach's OLD-BAD/NEW-GOOD sketch literally.
2. **Arms are nodes** (`type: "arm"`, `parentId` = the region). A child's `position` is then arm-relative by the scene's own existing rule (`scene.ts:60-72`), so folding one arm never moves a sibling arm's blocks. pyblocks diverges (no arm nodes yet) — recorded in §12, mapped in one rule.
3. **The opaque view is a projection, not a document edit.** Flipping `data.region.view` changes one field; a pure `projectOpaqueRegions` (reusing `boundary.ts`'s `classifyBoundary` + `promoteBoundary`, both non-mutating) re-points the crossing edges at promoted ports on the card at paint time. Positions are preserved *by construction* and `hosts/regionScene.test.ts` asserts it as referential identity. `collapse.ts` (which MUTATES) stays exactly what it is — grouping a loose selection into a NEW region — and is reused as the query, never duplicated.
4. **Data lines and control lines never mix**: the only "control" a region carries is the corner block's condition/iterable ports and the arm *structure*. `break`/`continue` are marks (badges), never cables. Cables between arms are unrepresentable (an arm is a parent; `armOf` is a total query), so "cables cannot cross rows" stays derived, not styled.
5. **Bypass routing is a lane, not a follow-up** — the elbow router already takes `obstacles` (`elbow/collisionRouting.ts:101-115`, `trace.tsx:644`); what is missing is the ~60-line collector REMAINING §2.6 named, blocked on P1, which has since landed as `WireLayer`. `Wire.through` (the containers a cable's ends live inside) is the one new field that makes "avoid everything except what I flow through" a pure rule (`keepOutsFor`, `wiring.test.ts`).
6. **Seven lanes, three waves, buildable tonight**: A (region kit, barrier) ∥ D (wires) ∥ G (canvas-host member edges) → B (loop) ∥ C (branch) ∥ E (opaque + toggle) → F (registry + gallery + full gate). 38 acceptance assertions are already committed red in five files, plus a story-assertion helper — none of them is a builder's to edit.

---

## 1 · What exists today — measured, so the gaps are subtraction

| Thing | Where (cite) | State |
|---|---|---|
| Region as a node kind, isolated (no `definitionId`) | `scene/region.ts:60-66`, header `:19-26` | ✅ ruling implemented; `descendantsOf`, `absolutePosition`, `regionOf`, `ancestorsOf`, `boundsOfNodes` exist and are tested |
| Collapse a loose selection → new region with promoted ports; dissolve inverse | `scene/collapse.ts:175-284`, `:335-414`; PEP `docs/peps/0003` | ✅ mutating grouping algebra; **not** the view toggle (see §2.B) |
| Boundary classification + promotion (pure query) | `scene/boundary.ts:171`, `:449`; `PromotedPort` `:390` (`id, side, direction, seat, band, t?, inner, outer, edgeIds, portType, by`) | ✅ reused verbatim by the projection |
| Containment judge, cycle guard, empty-container policy | `scene/containment.ts` | ✅ untouched |
| Host renderer: one type switch, members via `childrenOf`, free-member drag + auto-fit | `hosts/nodeViews.tsx:437-531` (`BlockNodeView`), `:538-573` (`SceneNodeView`) | ✅ a region is one new `case` |
| Host data vocabulary | `hosts/hostScene.ts:25-67` (`HostNodeData`) — "Loop and Branch are absent because those presets do not exist yet" (`:14-16`) | ❌ → §3.1 adds `region`, `arm`, `badge`, `marks` (types committed) |
| DOM canvas (no viewport, the control) | `hosts/domCanvas.tsx:249-270` | ✅ renders top-level nodes + `WireLayer` |
| React Flow host | `hosts/reactFlowHost.tsx:541-556` — "a `parentId` node is drawn INSIDE its parent by `SceneNodeView`, so only top-level nodes become React Flow nodes" | ⚠️ a wire into a MEMBER has no RF rendering (`hostScene.ts:75-82`); `sightPortDots` only sights dots the node OWNS (`portDotSightings.ts:54-56`) → **lane G** |
| tldraw host | `hosts/tldrawHost.tsx:406-577`; `endPoint(blockId)` looks up `anchors[blockId]` + `shapeIdForNode(blockId)` | ⚠️ same member-edge gap → **lane G**; sizes from `data.w/h` (`:602-603`) |
| Wires: `Wire`, `fanWires`, `WireLayer` resolving dots by `[data-block-id]`→`[data-port-id]` | `components/wiring.ts:32-50`, `wireLayer.tsx:80-92` (`resolveDot` takes the FIRST `[data-block-id]` in document order) | ✅; ❌ passes no `obstacles`/`fromBox`/`toBox`, draws no badge → **lane D** |
| Elbow router with hard keep-outs, soft clearance, nudging; tidy pipeline | `components/elbow/*` (verbatim port), `trace.tidy.ts:241`, `TraceRouteRequest.obstacles` `trace.tsx:644-647` | ✅ the math exists; the collector does not |
| `delayed` variant (dotted) | `trace.layout.ts:72-85`, `trace.tsx:269-274` | ✅ paint exists |
| `TraceBadge` (the pill, draggable along the path) / `TraceMark` | `traceBadge.tsx:28-66`, `traceMark.tsx` | ✅ components exist; nobody mounts them on a `WireLayer` wire |
| `FoldingChevron`, `Collapsible`, `Bar`, `Badge`, `BlockMembers` (free/stack) | `foldingChevron.tsx:321-389`, `bar.tsx:64-91`, `badge.tsx:31-71`, `blockMembers.tsx:80-200` | ✅ stock parts for arms, header chips, the members region |
| Value preset (the precedent for "a preset of components") | `presets/value/value.tsx:1-45` | ✅ pattern to follow; not a registry item |
| Registry generator | `docs/build_menu_registry_items.py:59-108` (`ITEMS`), `:181-202` (`target_for`: only `components/` and `lib/` have a rule; `presets/` raises) | ⚠️ `region` registers cleanly; presets need a target rule (follow-up) |
| Story tags — closed `area:` vocabulary | `CLAUDE.md` "Story tags" (`basics, blocks, hit-regions, ports, presets, styles, trace`) | ❌ `control-flow` must be added there first (lane A) |
| Effect ports / mutation | `elbow/boundaryCrossing.ts` prefers top edge for a derived effect port; `portLane.ts:9-13` deliberately stripped `reconcileEffectPorts` | partial — a top-wall port + a coloured wire + a `mut` badge draws today with zero new components once lane D lands badges; the *derivation* is a follow-up |
| Donor behaviours (read-only) | `systemsketch/src/loop/loopModel.ts:1-70` (typed unnamed header, item cable solid), `branch/branchModel.ts:1-17, 161-230` (band → arms → per-arm fold, one `activeArmId`, `BRANCH_FADE_OPACITY = 0.18`), `branchScope.ts:1-60`, `branchArmFrames.ts:56-61` (arms are materialised frames) | ported by value into §3.3 constants and the arm model |
| pyblocks P1 lane (read-only, live) | `c45d8d1` (parentId + `__inner` twins), `b0130b1` (head/tail cards inside the frame; `collapseView` + `describeHidden` "3 blocks · 2 arms · lines 8–14 hidden") | aligned where cheap (§12) |

**Baseline measured in this worktree:** `pnpm typecheck` exit 0; `pnpm test-unit` 59 files / 1019 tests green before this plan's files; 64 files / 1022 green + 38 red (the five acceptance files) after.

---

## 2 · Criteria before options

Weighted for *this* situation: Zach reviews on `:5421`, three hosts must agree, pyblocks' P1 lane is live and stream 2 (new SystemSketch = bbox-ui + stock tldraw) will consume whatever this plan freezes tonight.

| Criterion | Weight | Why this weight, here |
|---|---|---|
| **C1 Honours the two load-bearing ideas** — everything is a block; never mix data and control lines | 30% | Zach's own closing sentence; the ASK grades on it |
| **C2 Reuses the scene kit as-is** — `region.ts`, `boundary.ts`, `collapse.ts`, `containment.ts` unchanged | 20% | a second implementation of "which edges cross" is how the vendored copy diverged last time |
| **C3 Three hosts, one renderer** — DOM canvas + React Flow required, tldraw if mechanical | 15% | `nodeViews.tsx` is the shared translation; a per-host region is a fork |
| **C4 Toggle is one field; positions survive by construction** | 15% | the ASK's literal requirement; also what makes undo trivial |
| **C5 Stream 2/3 can consume it without a re-freeze** | 10% | pyblocks P1 already froze head/tail + `__inner`; SystemSketch-next is built on this |
| **C6 Buildable tonight by builders who never saw this chat** | 10% | briefs must be self-contained; fewer moving parts wins |

### 2.A · Where does the corner block live?

| Option | C1 | C2 | C3 | C4 | C5 | C6 | Weighted |
|---|---|---|---|---|---|---|---|
| **A1 · The region node IS the corner block** — its `data.ports` render on the corner card; the frame is scope only (portless) | 5 | 5 | 5 | 5 | 5 | 5 | **5.0** |
| A2 · A separate `head` child node pinned at (0,0) inside a portless region node | 4 | 3 (every crossing edge into the head counts as "inbound" to the region; collapse would promote the head's ports as `head/x`) | 4 | 3 | 3 (pyblocks puts ports on the region id) | 3 | 3.4 |
| A3 · Ports on the frame's own header band (the OLD form) | 1 | 4 | 4 | 4 | 2 | 4 | 3.0 |

**A1.** WHY: one id means `WireLayer`, the RF handles and tldraw anchors all resolve a loop's `Iterable` exactly as they resolve any block's port today; `collapseToRegion` already puts promoted ports on the region node, so an opaque card is the same node wearing more ports. Reversible default: A1; A2 is a data migration (mint a head child, move `ports`).

### 2.B · What is the opaque view?

| Option | C1 | C2 | C3 | C4 | C5 | C6 | Weighted |
|---|---|---|---|---|---|---|---|
| **B1 · Projection** — `data.region.view` flips; `projectOpaqueRegions` re-points crossing edges at `promoteBoundary`'s ports at paint time; the document keeps its direct P1 cables | 5 | 5 (QUERY half of collapse.ts reused) | 5 | 5 | 5 (pyblocks' `collapseView` is also a pure doc→doc projection) | 4 | **4.9** |
| B2 · Mutation — fold = split every crossing edge through minted ports (a `foldRegion`/`unfoldRegion` pair beside `collapse.ts`) | 4 | 3 (a third mutating pair) | 4 | 2 (edges change; ids minted per fold) | 3 | 3 | 3.2 |

**B1.** This does not re-open PEP 0003: *collapsing a loose selection* still mints a node and mutates (its three reasons hold). The *toggle* is a different operation on a node that already exists, and Zach's V1 pick means the expanded document has DIRECT crossing cables — so an opaque card can only ever be a lens over them. Reversible default: B1.

### 2.C · Are arms nodes?

| Option | C1 | C2 | C3 | C4 | C5 | C6 | Weighted |
|---|---|---|---|---|---|---|---|
| **C-1 · `type: "arm"` nodes, children carry `parentId = arm`** | 5 ("everything is a block": an arm has members, a fold, a height) | 5 (`descendantsOf`/`childrenOf`/`ancestorsOf` just work; `keepOutsFor` gets the arm for free) | 5 | 5 (arm-relative positions survive a sibling fold) | 3 (pyblocks has no arm nodes — one mapping rule) | 4 | **4.6** |
| C-2 · `data.arm: "if"` marker on each child, arms as a `data.arms[]` list on the region | 3 | 3 (every walk special-cases "is this block in arm X") | 4 | 2 (folding arm 1 shifts arm 2's origin → every child position must be rewritten or made arm-relative by convention the scene kit does not know) | 5 | 3 | 3.3 |

**C-1.** The donor reached the same shape from the other side (`branchArmFrames.ts`: "an idempotent projection, not a second arm model"). Reversible default: C-1.

Decided without scoring, from the ASK's own settled list: Q1 no output on a branch's corner block (arms fan in at the consumer, V1); Q2 the title is `Branch`; Q7 the z⁻¹ pill is always drawn (put in code: `sceneWires` derives `badge: "z⁻¹"` for every `delayed` edge that names none); break/continue are marks (B5); three mutation states never two (the mark is a fixture in F, the derivation a follow-up); **case view is not built** — the donor's own definition is "the Expanded layout with at most one arm open" (`branchModel.ts:12-13`), i.e. per-arm fold, which lane A ships; a `◀ ▶` selector chip is a follow-up.

---

## 3 · The design — the contract every lane builds against

### 3.1 Scene shape (frozen; types committed in `hosts/hostScene.ts`, `hosts/regionScene.ts`, `scene/controlFlow.ts`)

```ts
// A region: ONE node. Its ports are the corner block's ports.
{ id: "loop", type: "region",                       // scene/region.ts REGION_NODE_TYPE
  position: { x, y }, parentId?,                     // never definitionId (isolated — ruling)
  data: { name: "For Loop",                          // the corner block's header
          region: { kind: "loop", loop: "for", view: "expanded", activeArm?: string },
          ports: { left: ["Iterable"], right: ["Iter"] },   // typed, unnamed (DP - Loop); a while: { left: ["Bool"] }
          w: 400, h: 300,                            // the FRAME; the corner hugs (REGION_CORNER_WIDTH_PX)
          badge?: "iteration 3 of 7" } }             // a header chip (donor `turn`)
// An arm: a node whose parent is the region. Its own position is derived (stacked) and never read.
{ id: "if", type: "arm", parentId: "br", position: { x: 0, y: 0 },
  data: { name: "if fast:", arm: { open: true, h: 180 } } }
// A block inside an arm (or a loop's body): position is in the ARM's (or loop's) space — scene.ts:60-72, unchanged.
{ id: "est", type: "block", parentId: "if", position: { x: 40, y: 20 }, data: { …, marks?: ["break"] } }
// Edges are ordinary SceneEdges. In the EXPANDED document cables cross the frame DIRECTLY (V1):
{ id: "e-seed", source: "src", sourceHandle: "pose", target: "merge", targetHandle: "pose" }
// The region's own interface is wired like any port:
{ id: "e-iterable", source: "src", sourceHandle: "others", target: "loop", targetHandle: "Iterable" }
{ id: "e-iter",     source: "loop", sourceHandle: "Iter",  target: "merge", targetHandle: "other" }   // port-inner: private wiring
// The carried value: a delayed self-cable; routing elbow so it takes the bottom lane; pill derived.
{ id: "e-carry", source: "merge", sourceHandle: "Pose", target: "merge", targetHandle: "pose",
  data: { variant: "delayed", routing: "elbow", badge?: "z⁻¹ = estimate()" } }
```

Pure queries (`scene/controlFlow.ts`): `ARM_NODE_TYPE`, `isArm`, `armsOf`, `bodyChildrenOf`, `armOf`, `hiddenSummary` → `{nodes, arms, edges}`, `describeHidden` → `"2 blocks · 2 arms · 3 edges hidden"` / `"nothing hidden"`. Host vocabulary (`hosts/regionScene.ts`): `RegionData`, `ArmData`, `regionViewOf`, `isOpaqueRegion`, `setRegionView`, `toggleRegionView`, `projectHostScene`.

### 3.2 The `Region` component (lane A) and its DOM contract

`components/region.tsx` — props in, DOM out, imports no scene module (the import wall `layering.test.ts` enforces).

```ts
export interface RegionArm { id: string; title: ReactNode; open: boolean; onOpenChange?(open: boolean): void;
                             active?: boolean; bodyHeight?: number; members?: BlockMember[] }
export interface RegionProps {
  id: string;                          // stamped as data-region-id on the root AND the frame — NEVER data-block-id
  kind?: "loop" | "branch" | "group";  // data-region-kind only; no behaviour
  view?: "expanded" | "opaque";        // default expanded
  corner: ReactNode;                   // the REAL Block: a BlockPort whose id === this region's id
  cornerSize?: { w: number; h: number }; // skip the ResizeObserver when a host already knows it
  width?: number; height?: number;     // the frame; height omitted = hug (regionLayout)
  members?: BlockMember[];             // free-layout body (a loop's blocks) — BlockMembers layout="free"
  arms?: RegionArm[];
  className?: string; style?: CSSProperties;
}
```

DOM (what `stories/controlFlow.acceptance.ts` measures):

```
[data-slot="region"][data-region-id][data-region-kind][data-region-view]
  expanded:
  [data-slot="region-frame"]                          1px border, transparent fill, radius var(--bbox-skin-radius, var(--radius-lg)), overflow visible
    [data-slot="region-corner"] > BlockPort[data-block-id=<id>]   absolutely at the frame's top-left, its own border ON the frame's border;
                                                       the Block's top-right and bottom-left corner radii are 0px, top-left = the frame's
    [data-slot="region-body"]                           regionLayout().body — BlockMembers layout="free"
    [data-slot="region-arm"][data-arm-id][data-open][data-active]     absolutely at regionLayout().arms[i]
      [data-slot="region-arm-header"]  Bar size="sm": FoldingChevron (data-slot="folding-chevron") + title; a top divider for arms after the first
      [data-slot="region-arm-body"]    BlockMembers layout="free"; absent or 0px tall when data-open="false"
  opaque:
  the root wraps ONLY `corner` (the host passes a wider card carrying own ports + promoted ports + a footer
  [data-slot="region-hidden"] with describeHidden's text); no frame, no arms in the DOM.
```

Look: React Flow UI's Labeled Group Node (screenshot `Pasted image 20260918192040.png`, opened — the page's source could not be fetched, see §10): a thin rounded frame with transparent fill and a label chip INSIDE the frame at its top-left corner, sharing the frame's top-left rounding, square where it meets the frame, softly rounded at its free bottom-right corner. Our chip is a whole Block. Non-active arms: `opacity: REGION_ARM_FADE_OPACITY` on the row (cables fade later — follow-up).

### 3.3 Layout constants (`components/region.layout.ts`, committed)

`REGION_ARM_HEADER_PX = 32`, `REGION_ARM_DEFAULT_BODY_PX = 180`, `REGION_ARM_MIN_BODY_PX = 48` (donor `branchModel.ts:29-32`), `REGION_BODY_MIN_PX = 120`, `REGION_PAD_BOTTOM_PX = 12`, `REGION_MIN_WIDTH_PX = 240`, `REGION_ARM_FADE_OPACITY = 0.18`, `REGION_CORNER_WIDTH_PX = 160`, `REGION_CARD_WIDTH_PX = 220`. `regionLayout({width, height?, corner, arms?})` → `{corner at origin, body under it, arms stacked: rowTop → header → body(open ? h : 0) → bottom → next rowTop}`; height = explicit if large enough else last bottom + pad (`region.layout.test.ts`).

### 3.4 The opaque projection (lane E) — `scene/regionView.ts`

Per OUTERMOST opaque region R (`classifyBoundary(scene, {containerId: R})` → `promoteBoundary`): an edge with one end inside R is re-pointed at `{R, mintPortId(inner)}` (default `portKey`, so a card and a `collapseToRegion` agree); `interior` and `port-inner` edges are dropped; `port-outer` edges are the SAME object; no opaque region → `scene.edges` itself. Nodes are never touched. `regions: [{regionId, ports: PromotedPort[], hidden}]` is what the card renders (`regionView.test.ts`, `regionScene.test.ts`).

### 3.5 Wires (lane D) — `components/wiring.ts`, `wireLayer.tsx`, `scene/sceneWires.ts`

`Wire.through: string[]` = the ancestors of both ends (`sceneWires` derives it with `ancestorsOf`); `Wire.badge?: string` (`sceneWires` derives `"z⁻¹"` for a `delayed` edge that names none — Q7 in code). `WireLayer`, for `routing === "elbow"`: measure every `[data-region-id]` frame, `[data-arm-id]` row and `[data-block-id]` box in container space (a region id present as both frame and corner card → the FRAME is the keep-out); `obstacles = keepOutsFor(wire, rects)`; `fromBox`/`toBox` = the endpoint blocks' own boxes (the corner card for a region end); hand all three to `Trace`. A DOM sibling layer `[data-slot="wire-badges"]` mounts a static `TraceBadge` per badged wire on the polyline `Trace` reports. Bypass therefore reads: *a cable avoids every box except its two endpoints and the containers those endpoints live inside* — the region frame, the target arm, and nothing else (`wiring.test.ts`).

### 3.6 Hosts

`SceneNodeView` gains `case "region"` → `RegionNodeView` (lane A). The corner card is `BlockPort id={node.id} view="port"` with `edges` from `data.ports` exactly as `BlockNodeView` builds them today (wired state via `withWiredState`), inside `Block` with `header` = the name (a `Bar` with a `Badge` on the right only when `data.badge` or `data.marks` is present — otherwise the plain string, so no existing story's DOM moves). Members and arm members reuse `useFreeMemberDrag` + `moveMember` (`nodeViews.tsx:444-485`). React Flow: `NODE_TYPES.region = BboxNode`, drag handle = the corner card's own header (`ownHeaderOf` already finds `[data-block-id=<region id>]`) — lane G. tldraw: nothing per-type — the one `BboxNodeShapeUtil` renders every top-level node through `SceneNodeView`; the shape's size is `data.w/h` (`tldrawHost.tsx:602-603`), which a region carries. All three hosts hand their edge painter `projectHostScene(scene).scene.edges` and compute `wired` off the same (lane E).

---

## 4 · Stock-part mapping — element by element

| Element | Today | Off-the-shelf part (exact exported name) | Behaviour that must survive |
|---|---|---|---|
| The region node | `REGION_NODE_TYPE`, `isRegion`, `regionOf`, `ancestorsOf`, `descendantsOf` (`scene/region.ts`) | the same — unchanged | isolated: never a `definitionId`; nesting = `parentId` |
| The corner block | nothing (SystemSketch drew ports on a header band) | `BlockPort` (`components/blockPort.tsx`) + `Block` (`block.tsx`), `view="port"`, `edges` from `data.ports` via `withWiredState` (`scene/sceneWires.ts`) | port dots resolve by `[data-block-id]`→`[data-port-id]` exactly as any block's; typed unnamed labels (`Iterable`/`Iter`/`Bool`) are just port ids |
| Header chip (turn / iteration) | donor `Loop-turn` (`loopModel.ts:77`) | `Bar` (`bar.tsx`) with `Badge` (`badge.tsx`) in the right slot | only rendered when `data.badge` exists — the plain-string header is byte-identical otherwise |
| The frame | donor `.systemsketch-branch-canvas` (transparent, 1.2px ring) | a plain `div[data-slot="region-frame"]` in `region.tsx` — the one new piece of paint | transparent fill so cables under it stay visible; no value ports; `overflow: visible` so the corner's wall dots straddle |
| Body members (a loop's blocks) | `BlockMembers` free layout inside `Block` | `BlockMembers` `layout="free"` (`blockMembers.tsx`), `useFreeMemberDrag` + `moveMember` (`hosts/memberDrag.ts`, `nodeViews.tsx:401`) | drag writes the settled position back into `SceneNode.position`; `nodrag` marker keeps the canvas out |
| Arms | donor `BranchArm` rows + invisible `BranchArmShape` frames | `type: "arm"` nodes + `regionLayout` (`region.layout.ts`) for rows; `Bar size="sm"` + `FoldingChevron` (`foldingChevron.tsx`) for the header | per-arm fold; one `activeArm`; non-active fade `0.18`; arm-relative child positions survive a sibling's fold |
| Opaque card | pyblocks `BlockNode` + `hasFooter` | the same `BlockPort`/`Block` as the corner, wider (`REGION_CARD_WIDTH_PX`), footer `describeHidden(hiddenSummary())` | ports = own interface ∪ `promoteBoundary`'s `PromotedPort[]` (`scene/boundary.ts:390`) on `port.side`; the footer's words are measured |
| The toggle | `Toggle` blackbox glyph exists (REMAINING §2.3) | `FoldingChevron` in the corner card's header, `open = view === "expanded"`; `toggleRegionView` (`hosts/regionScene.ts`) | one field flips; positions, ids, edges untouched (asserted) |
| Crossing edges in opaque view | `collapseToRegion` splits them (mutation) | `classifyBoundary` + `promoteBoundary` (`scene/boundary.ts`) as a QUERY inside `projectOpaqueRegions` | the promoted port id is `portKey(inner)` in both, so grouping and viewing agree |
| Delayed cable + z⁻¹ pill | `Trace variant="delayed"` (`trace.tsx:269`), `TraceBadge` (`traceBadge.tsx`) | the same two, mounted by `WireLayer` from `Wire.badge` | dotted paint unchanged; pill text is data (`"z⁻¹"` / `"z⁻¹ = seed"`); always drawn (Q7) |
| Bypass | `elbow/collisionRouting.ts` `routeClearsObstacles`, `TraceRouteRequest.obstacles/fromBox/toBox` (`trace.tsx:644-647`) | the same router; new: `keepOutsFor` (`wiring.ts`) + `WireLayer`'s measured rects | never routes INTO a keep-out; a cable into an arm's block may enter the frame and that arm only |
| Break / continue | nothing (ten marks drawn, B5 picked) | `Badge` (`badge.tsx`) with a lucide glyph, `data-slot="control-mark"` | a mark, never a cable — no port, no edge can originate at it |
| Mutation effect cable | `boundaryCrossing.ts` top-edge preference; nothing drawn | a top-wall port in `data.ports.top` + `Wire.color` + `Wire.badge: "mut"` — zero new components | fixture-only tonight; the `mutates → effect port` derivation is a follow-up |
| Member edges in canvas hosts | `sightPortDots` sights owned dots only (`portDotSightings.ts:54-56`) | the same seam with an additive `{members: true}` option returning `ownerId`/`handleId = portKey(owner, port)` | own-dot behaviour byte-identical when the option is off |
| **unchanged (stock seam)** | `scene/scene.ts`, `collapse.ts`, `boundary.ts`, `containment.ts`, `region.ts`, `linking.ts`; `block.tsx`, `blockPort.tsx`, `blockMembers.tsx`, `portEdge.tsx`, `trace.tsx` (D may only ADD pass-through props if `Trace` does not already forward `obstacles/fromBox/toBox/onGeometry`), `elbow/*` (verbatim port — never edited) | — | every existing story stays byte-identical; the full `pnpm test` gate proves it |

---

## 5 · The two load-bearing ideas, honoured per lane

| Lane | "Everything is a block" | "Never mix data and control lines" |
|---|---|---|
| A region kit | the region node's interface IS a `BlockPort` in the frame's corner — same DOM contract, same dot resolution as any block; arms are nodes with members | the frame owns no value ports; the corner's ports are the only control-flow inputs; arm structure is geometry, not cables |
| B loop | `For Loop`/`While Loop` are a `Block` with typed unnamed ports (`Iterable`→`Iter`; `Bool`) | the carried value is a DATA cable that is merely delayed (dotted + z⁻¹); `break` is a mark; no "loop back" control wire exists |
| C branch | `Branch` is a `Block` carrying the condition(s) only; each arm is a node | Q1: no output — arms fan in at the consumer; sibling-arm cables are unrepresentable (`armOf` is total) |
| D wires | keep-outs are the boxes of blocks/regions/arms — the same `data-*-id` stamps | bypass routes around structure it does not flow through; a control mark can never be a wire's endpoint (`expectControlMark`) |
| E toggle | the opaque card is the same block with more ports (`promoteBoundary`) | the projection surfaces only DATA crossings; a region's private `Iter` cable is hidden, never re-pointed as if it were a value entering from outside |
| G host edges | a member is a block whose dots the host now sights | none — it changes where a wire ANCHORS, never what it means |
| F integration | `region` becomes a registry item like every other block-ish part | the gallery shows a branch nested in a loop with bypass: three sections of code, cables never crossing arms |

---

## 6 · Lanes

| id | title | barrier | day-0 | depends on | est. lines |
|---|---|---|---|---|---|
| A | Region kit: scene queries, layout, component, host renderer | **yes** | yes | — | ~900 |
| D | Wires: keep-outs (bypass), boxes, badges | no | yes | — (contract only) | ~350 |
| G | Canvas-host member edges (React Flow + tldraw) | no | yes | — | ~300 |
| B | Loop preset: for / while factories, fixtures, stories | no | no | A (D for the badge/bypass assertions) | ~450 |
| C | Branch preset: if/elif/else, match/case, nested, fold, active | no | no | A | ~550 |
| E | Opaque projection, the toggle, hosts wired to the projection | no | no | A, D, G | ~500 |
| F | Registry item, gallery stories, full gate | no | no | A, B, C, D, E, G | ~300 |

Waves: **0** = A ∥ D ∥ G · **1** = B ∥ C ∥ E · **2** = F. Every lane runs in its own worktree (`.claude/settings.json` has `worktree.baseRef: "head"`), installs with `pnpm install --filter bbox-storybook-basics...`, and gates on `pnpm typecheck` + `pnpm test` inside `apps/storybook-basics` (a visual check may start its own Storybook on a free `STORYBOOK_PORT`; `:4321 :4325 :5421 :5193 :5199 :4599` are taken). The dispatcher merges each lane back after its gate; landing on `main` is Zach's call.

**Off-limits to every builder (committed with this plan):** `apps/storybook-basics/src/scene/controlFlow.test.ts`, `src/scene/regionView.test.ts`, `src/components/region.layout.test.ts`, `src/components/wiring.test.ts`, `src/hosts/regionScene.test.ts`, `src/stories/controlFlow.acceptance.ts`. A red assertion there means the lane is not done; "cannot pass → report FAIL with the reason" is a valid deliverable. Any edit to those files in a lane's diff goes to the auditor by rule. Everyone: never `git add -A`; stage explicit pathspecs; never touch `/home/bam/systemsketch`, `/home/bam/pyblocks`, `/home/bam/zach_brain`, `packages/*`, `apps/docs`, `components/elbow/*`.

The full builder briefs are §6.1–§6.7 below (they are also handed verbatim to the builders as the workflow's `lanes[].builder_brief`).

### 6.1 Lane A — Region kit (barrier, day-0)

See the structured brief. Summary of the write set: `src/scene/controlFlow.ts` (bodies), `src/components/region.layout.ts` (body), `src/components/region.tsx` (new), `src/hosts/nodeViews.tsx` (`case "region"`, control-mark badges, header chip), `src/stories/ControlFlowRegion.stories.tsx` (new), `CLAUDE.md` (area vocabulary + a "Control flow" pointer). Acceptance: `controlFlow.test.ts`, `region.layout.test.ts` green; `ControlFlowRegion` stories call `expectRegionExpanded`/`expectRegionOpaque`/`expectArmsStacked`/`expectMemberInside`/`expectCornerPorts`; `pnpm test` green.

### 6.2 Lane D — Wires (day-0)

Write set: `src/components/wiring.ts` (`keepOutsFor` body), `src/components/wireLayer.tsx`, `src/scene/sceneWires.ts`, `src/components/trace.tsx` (adds-only, only if pass-through props are missing), `src/stories/ControlFlowWires.stories.tsx`. Acceptance: `wiring.test.ts`; stories call `expectWireAvoids`, `expectWirePainted`, `expectWireBadge`.

### 6.3 Lane G — Canvas-host member edges (day-0)

Write set: `src/hosts/portDotSightings.ts`, `src/hosts/reactFlowHost.tsx`, `src/hosts/tldrawHost.tsx`, `src/stories/ControlFlowHostEdges.stories.tsx`. Acceptance: existing `SceneHosts`/`SceneHostsTldraw`/`FitToContentHosts` stories unchanged and green; new stories measure an edge into a member painted in both hosts.

### 6.4 Lane B — Loop preset (after A; D for two assertions)

Write set: `src/presets/loop/loop.ts`, `src/presets/loop/loop.fixtures.ts`, `src/presets/loop/loop.test.ts` (builder's own), `src/stories/ControlFlowLoop.stories.tsx`.

### 6.5 Lane C — Branch preset (after A)

Write set: `src/presets/branch/branch.ts`, `src/presets/branch/branch.fixtures.ts`, `src/presets/branch/branch.test.ts` (builder's own), `src/stories/ControlFlowBranch.stories.tsx`.

### 6.6 Lane E — Opaque projection + toggle (after A, D, G)

Write set: `src/scene/regionView.ts` (body), `src/hosts/regionScene.ts` (bodies), `src/hosts/nodeViews.tsx` (opaque card, chevron), `src/hosts/domCanvas.tsx`, `src/hosts/reactFlowHost.tsx`, `src/hosts/tldrawHost.tsx` (edge/wired seams), `src/stories/ControlFlowToggle.stories.tsx`. Acceptance: `regionView.test.ts`, `regionScene.test.ts`; stories call `expectRegionExpanded` → click → `expectRegionOpaque` → click → `expectRegionExpanded`, on all three hosts, with positions read back equal.

### 6.7 Lane F — Registry + gallery + full gate (after all)

Write set: `docs/build_menu_registry_items.py` (`region` item), `registry.json` (regenerated), `src/stories/ControlFlowGallery.stories.tsx`, `README.md` (component row), `docs/CONTROL-FLOW-PLAN.md` §13 "Status" (append only). Gate: `pnpm test` all green, `python3 docs/build_menu_registry_items.py --check`, the CLAUDE.md throwaway install + `tsc` for `region`.

---

## 7 · Acceptance files — committed before any builder, red now

| File | Lane it gates | What it pins |
|---|---|---|
| `src/scene/controlFlow.test.ts` | A | arm kind; `armsOf`/`bodyChildrenOf`/`armOf` totality and cycle safety; `hiddenSummary` counts (a loop hides its `Iter` cable + interior + the delayed self-cable = 3); `describeHidden` wording |
| `src/components/region.layout.test.ts` | A | donor constants; corner at origin; body under it; arm rows stack header→body→bottom; folded = 0; hug vs explicit height; min body clamp; purity |
| `src/components/wiring.test.ts` | D | `keepOutsFor` excludes endpoints + `through`, keeps order, strips ids, never returns the input; `fanWires` unaffected by the new fields |
| `src/scene/regionView.test.ts` | E | expanded = identity (same arrays); re-point keeps id/data/outer end; port-outer same object; interior + port-inner dropped; promoted ports carry side/direction/inner; custom `mintPortId`; outermost-wins nesting; two opaque regions re-point both ends |
| `src/hosts/regionScene.test.ts` | E | `regionViewOf` default; `setRegionView` changes one field on one node, same edges array, same sibling objects, no-op on unknown/non-region/unchanged; toggle round trip; `projectHostScene` reads polarity off walls (`by: "polarity"`) |
| `src/stories/controlFlow.acceptance.ts` | A, B, C, D, E, G | the measured story assertions every lane's play functions must call (§3.2 DOM contract, bypass sampled along the real path, badges, control marks) |

---

## 8 · What Zach will see (for the report builder — capture these)

Storybook on `:5421` after merge. Sidebar → Components › Blocks › Region, or filter `lane:control-flow` (the `area:control-flow` tag this line used to name was retired 2026-09-22).

| Story (title → id) | Host | The state it shows |
|---|---|---|
| `Control Flow/Region` → `components-blocks-blockregion--empty-expanded` | DOM canvas | the P1 frame with a real corner block, nothing inside |
| `…--empty-opaque` | DOM | the P5 card, footer "nothing hidden" |
| `…--with-members`, `…--with-arms`, `…--active-arm`, `…--in-react-flow`, `…--layout-twin` | DOM / RF | members inside; three arms one folded; fade; RF; DOM rows equal `regionLayout` |
| `Control Flow/Loop` → `components-blocks-blockregion-loop--for-loop-carried` | DOM | `merge()`/`smooth()` inside `For Loop`, seed from outside, `Iter`→`other`, dotted z⁻¹ self-cable on the bottom lane |
| `…--for-loop-empty`, `…--while-loop-recheck`, `…--loop-with-turn`, `…--loop-with-break`, `…--for-loop-react-flow` | DOM / RF | empty; `Bool` header with a delayed re-check from inside; "iteration 3 of 7" chip; ⏹ break mark on `check()` |
| `Control Flow/Branch` → `components-blocks-blockregion-branch--one-input` | DOM | Zach's `if fast:` — `estimate()`/`fallback()` in two arms, cables straight in from outside, fan-in at `encode` |
| `…--many-inputs`, `…--match-case`, `…--folded-arm`, `…--active-arm`, `…--nested`, `…--one-input-react-flow` | DOM / RF | Selector with N conditions; `match`; a folded `elif`; active-arm fade; a branch inside arm 1 |
| `Control Flow/Wires` → `components-blocks-blockregion-wires--bypass-around-a-block`, `…--carried-value-self-loop`, `…--through-a-container`, `…--mut-effect-cable` | DOM | a cable going around a bystander; a self-loop on the bottom lane with z⁻¹; a cable allowed into its own container; a `mut` cable off a top port |
| `Control Flow/Host Edges` → `…--member-edge-react-flow`, `…--member-edge-tldraw` | RF / tldraw | a cable landing on a block INSIDE another block, in both engines |
| `Control Flow/Toggle` → `components-blocks-blockregion-toggle--dom-canvas`, `…--react-flow`, `…--tldraw`, `…--nested-opaque` | all three | click the chevron: frame ⇄ card, cables re-anchor, nothing moves |
| `Control Flow/Gallery` → `components-blocks-blockregion-gallery--branch-in-loop` (+ `…-react-flow`, `…-tldraw`) | all three | the whole language on one board: a loop containing a branch, a bypass cable going around both, a `mut` cable |

Hero video candidate: `components-blocks-blockregion-toggle--dom-canvas` (expand ⇄ collapse, 8 s). Stills: `one-input`, `for-loop-carried`, `bypass-around-a-block`, `nested`.

---

## 9 · What needs Zach — each with the recommendation and the default taken on silence

| # | Question | Recommendation | Default if silent |
|---|---|---|---|
| 1 | Corner block INSIDE the frame sharing its border (Labeled Group look, §3.2) — or ABOVE the frame as `Pasted image 20260918144504.png`/`144705.png` draw it? | Inside/integral: it is the reference he named ("I like how the label looks integral to the group") and the NEW GOOD sketch | inside |
| 2 | Opaque view as a projection (edges untouched) vs a document mutation | Projection (§2.B) | projection |
| 3 | Arms as `type: "arm"` nodes vs a marker on children | Nodes (§2.C) | nodes |
| 4 | Case view (`◀ ▶` one-arm selector)? | Not tonight — per-arm fold IS the donor's case view; a selector chip is a small follow-up | not built |
| 5 | Q1 — does the branch's corner block have an output? | No; arms fan in at the consumer (his V1 pick, twice) | no output |
| 6 | Q2 — `Branch` / `Selector` / `Switch`? | `Branch` as the default title; `data.name` is free text so a fixture may say `Selector` | `Branch` |
| 7 | Q7 — is the z⁻¹ pill always drawn inside a region? | Yes, derived in `sceneWires` for every `delayed` edge | always |
| 8 | Bypass in React Flow / tldraw (both paint their own bezier/arrow today) | Follow-up: route through `routeTraceRequest` with the hosts' own node rects; DOM canvas proves the rule tonight | DOM canvas only |
| 9 | Should the frame CLIP overflowing members? | Not tonight — the corner's wall dots must straddle the frame edge; clip the body/arm bodies only if he asks | no clip |
| 10 | Corner block width fixed at 160px (constant) vs per-node `data.cornerW`? | Constant tonight; a per-node override is a one-field follow-up | constant |

---

## 10 · What could not be verified

- **The Labeled Group Node source.** `https://reactflow.dev/ui/components/labeled-group-node` renders only install/usage; every registry URL tried 404'd (`ui.reactflow.dev/r/…`, `raw.githubusercontent.com/xyflow/react-flow-ui/…`). The screenshot Zach attached is the spec; nothing in this plan cites that component's code.
- **Whether `Trace` (the component) already forwards `obstacles`/`fromBox`/`toBox`/`onGeometry` as props** — `TraceRouteRequest` carries them (`trace.tsx:630-651`) and the header mentions `onGeometry`, but the component's prop list was not read line-by-line. Lane D verifies and, if missing, adds pass-through props (adds-only).
- **The pyblocks P1 lane is live** — `c45d8d1` was its tip when read; it may have moved. §12's mapping is against that commit.
- **tldraw overlay DOM for assertions** — lane G's story must find the existing pattern in `SceneHostsTldraw.stories.tsx` rather than assume `[data-wire-id]`.
- **The `!important` corner-radius mechanism** — `Block` spreads `style` after its own `borderRadius` (`block.tsx:294, 321`), so a `style` override works; whether a wrapper-class-with-`!` override also beats the inline value was not measured. The acceptance measures the computed radius, not the mechanism.
- **Elbow router cost with every box as a keep-out** on a 30-block board — SystemSketch did exactly this (`routingObstacles.ts`), so it is expected fine; not measured here.

---

## 11 · Follow-ups (need a design Zach has not seen, or are cheap-but-later)

1. Bypass routing in the React Flow and tldraw hosts (route through `routeTraceRequest` with elbow + host rects).
2. Cable fade for non-active arms (`Wire.opacity` derived from `armOf` + `activeArm`).
3. `◀ ▶` case-view selector chip (one arm open at a time as a command over `arm.open`).
4. Region auto-fit height (`useAutoFitHeight` already exists for blocks — wire it to the frame/arm bodies).
5. Drop-into-arm on the canvas hosts (`judgeContainment` + a measured arm-body target).
6. A `presets/` target rule in `docs/build_menu_registry_items.py` so `value`, `loop`, `branch` can be registry items.
7. The mutation derivation: `mutates` flag on an input → a top-wall `effect:<input>` port (~30 pure lines over the scene, REMAINING §2.5); `mut ①/②` numbering.
8. `continue` and `for … else` marks (DP - Break & Continue: "genuinely unexplored").
9. Region resize handles per host (`NodeResizer` on RF exists for blocks).
10. A "group selection → region" command using the existing `collapseToRegion` (the mutating path) from the editor kit.
11. Per-node corner width; explicit clipping policy.

---

## 12 · Contracts for stream 2 (new SystemSketch) and stream 3 (pyblocks `to_systemsketch`)

**C1 — Region scene shape** (owner A; consumers B, C, E, stream 2, stream 3): §3.1 verbatim. Rules: a region never carries `definitionId`; its ports are the corner block's; arms are `type: "arm"` children; a child's `position` is in its parent's (arm's / loop's) space; the expanded document has DIRECT crossing edges (no tunnels, no `__inner` twins); `data.region.view` is the only view state.

**C2 — `Region` props + DOM** (owner A; consumers E, stream 2): §3.2 verbatim. The root/frame carry `data-region-id`, never `data-block-id`.

**C3 — `projectOpaqueRegions` / `projectHostScene`** (owner E; consumers stream 2, F): §3.4. Promoted port id = `portKey(inner.nodeId, inner.portId)` unless a host mints otherwise.

**C4 — `Wire.through` / `Wire.badge` / `WireStyleData.badge` / `keepOutsFor`** (owner D; consumers E, stream 2): §3.5.

**C5 — pyblocks ↔ bbox-ui mapping** (owner stream 3; consumers stream 2). Divergences, listed so nothing is averaged:

| pyblocks P1 (`c45d8d1`, `b0130b1`) | bbox-ui trunk (this plan) | Mapping rule for `to_systemsketch` |
|---|---|---|
| region block owns ports; HEAD card (NW) renders west-wall ports, TAIL card (NE) east-wall ports | region node owns ports; ONE corner card renders all walls | drop the head/tail split — every pyblocks port becomes a `data.ports[side]` entry on the region node |
| `X__inner` twin ports (`in-bins` + `in-bins__inner`) so a container's inbound face can source an edge to a child | one port id with two faces; the edge end says which; in the EXPANDED document cables go straight to children (V1) | `X__inner` → the same id `X`; an edge `region/X__inner → child` becomes `region/X → child` ONLY for ports the region genuinely owns (`Iterable`/`Iter`/`Bool`/condition); a data value merely passing through (`in-bins__inner → bins.lookup`) becomes a DIRECT edge from the outer producer to the child and the twin pair is deleted |
| no arm nodes; If children sit directly under `region:if` (arm structure implied by `lines`) | `type: "arm"` nodes per arm | mint one arm node per If arm (`if`/`elif`/`else`, `case …`) with `data.name` = the arm's source header; re-parent each child by its line range |
| `describeHidden`: "3 blocks · 2 arms · lines 8–14 hidden" | `describeHidden`: "3 blocks · 2 arms · 4 edges hidden" (no source lines in a scene) | same word order; drop the lines clause |
| `role: "discriminant"` port on a collapsed region | the corner block's condition port (a plain port id) | `discriminant` → a `left` port on the region node named by the condition |
| `kind: "effect"` edge, `delay: 1` | `data.color` + `badge: "mut"` on a top-wall port edge; `data.variant: "delayed"` (+ derived `z⁻¹`) | `effect` → `{ color: <effect token>, badge: "mut" }` from `ports.top = ["effect:<input>"]`; `delay: 1` → `{ variant: "delayed", routing: "elbow" }` |
| viewer collapse state lives in workspaceState per node key | `data.region.view` on the node | `collapsed` → `region.view = "opaque"` |

---

## 13 · Status

*(Lane F appends here what landed, with the gate output.)*

### Lane F · 2026-09-18 — registry item, gallery, full gate

**Lanes landed on `claude/control-flow-integration-2026-09-18`** (this lane's
base is `837c1d1`, the cf:E merge):

| Lane | Tip | Merge |
|---|---|---|
| cf:A region kit | `c616d71` | `d09fbe2` |
| cf:B loop preset | `edf60d4` | `002cd58` |
| cf:C branch preset | `b1ec6c6` | `5edb8f7` |
| cf:D wires | `3b91b0a` | `88fbc0d` |
| cf:E opaque projection | `c52c96f` | `837c1d1` |
| cf:G member edges | `cf6fc98` | `07f86ec` |

**Gate — `apps/storybook-basics`, all green.**

```
pnpm typecheck        → exit 0
pnpm test             → 178 files / 1693 tests passed, exit 0
  project `unit`      →  76 files / 1211 tests
  project `storybook` → 102 files /  482 tests   (178−76, 1693−1211)
```

Run with `STORYBOOK_PORT=5620` so the suite compiled THIS worktree's source
rather than reusing Zach's `:5421` (the false-pass `vitest.config.ts`'s own
header warns about). No file red anywhere in either project.

**`apps/systemsketch` was not run and did not need to be:** this lane's diff
(`git diff --name-only`) contains zero files under `apps/`, other than the one
new story file in `apps/storybook-basics/src/stories/`. Nothing it consumes
changed.

**Registry.**

```
$ python3 docs/build_menu_registry_items.py
  region              9 files (5 components)  deps: @dnd-kit/core, @dnd-kit/sortable,
                                                    @dnd-kit/utilities, clsx, lucide-react,
                                                    tailwind-merge
$ python3 docs/build_menu_registry_items.py --check
registry.json is up to date                                                  → exit 0
$ npx shadcn@latest build
✔ Building registry.  (… "Building region…")                                 → exit 0
```

The nine files, and the sibling rule they satisfy — `components/` flattens
into `components/bbox/`, `lib/` lands BESIDE it at `components/lib/` so
`../lib/utils` still resolves after the move:

| Source | Target |
|---|---|
| `src/components/region.tsx` | `components/bbox/region.tsx` |
| `src/components/region.layout.ts` | `components/bbox/region.layout.ts` |
| `src/components/blockMembers.tsx` | `components/bbox/blockMembers.tsx` |
| `src/components/bar.tsx` | `components/bbox/bar.tsx` |
| `src/components/barSize.tsx` | `components/bbox/barSize.tsx` |
| `src/components/foldingChevron.tsx` | `components/bbox/foldingChevron.tsx` |
| `src/components/editableText.layout.ts` | `components/bbox/editableText.layout.ts` |
| `src/components/glyph.layout.ts` | `components/bbox/glyph.layout.ts` |
| `src/lib/utils.ts` | **`components/lib/utils.ts`** |

**Install proof** — `npx shadcn add` exiting 0 proves nothing (CLAUDE.md),
so the item was installed into a throwaway project and type-checked.
Verbatim, in `…/scratchpad/throwaway`:

```
$ npm install react@^19 react-dom@^19 @types/react@^19 @types/react-dom@^19 typescript@^5.6
                                                                             → exit 0
$ npx --yes shadcn@latest add /…/scratchpad/region.json
✔ Created 9 files:
  src/components/bbox/{bar,barSize,blockMembers,editableText.layout,foldingChevron,
                       glyph.layout,region.layout,region}.tsx|ts
  src/components/lib/utils.ts                                                → exit 0
$ npx tsc --noEmit                                                           → exit 0
```

The project carried `components.json` copied in shape from
`apps/storybook-basics/components.json` (same `@/` aliases), and a `tsconfig`
with `paths: {"@/*": ["./src/*"]}`. Nothing else — no Vite config was needed,
because the failure this gate exists to catch is a module-resolution one.

**The loop and branch presets are deliberately NOT registry items**, and this
is the plan's own §11 item 6 rather than an omission. Two reasons, the second
the real one:

1. `target_for` has rules only for `src/components/` and `src/lib/`; a preset
   at `src/presets/loop/loop.ts` raises `unexpected trunk location, no target
   rule` on the spot.
2. A preset is not a component. `forLoopNode` returns a
   `SceneNode<HostNodeData>` and `branchNode` an array of them — pure factories
   that import `hosts/hostScene` and `scene/region`, i.e. the scene+host
   lineage, which a `components/bbox/` install has no counterpart for.
   Shipping them under a component target would be a different distribution
   decision than this script makes. Until §11 item 6 lands, a consumer
   installs `region` and writes the three fields (`region.kind`, `ports`,
   arms) itself — which is all a preset ever was.

**Stories — every id §8 names exists.** 37 `control-flow-*` ids are indexed
(read off the running Storybook's own `index.json`, not derived from titles);
§8 names 33 of them and all 33 resolve. The four beyond the plan are
`components-blocks-blockregion--header-chip-and-marks`,
`components-blocks-blockregion-wires--badge-with-seed`,
`components-blocks-blockregion-host-edges--member-edge-survives-drag` (lanes A/D/G shipping
more than they promised) and this lane's own
`components-blocks-blockregion-gallery--collapsed-branch-in-loop`.

This lane's four:

| Story id | Host | Asserts |
|---|---|---|
| `components-blocks-blockregion-gallery--branch-in-loop` | DOM canvas | both frames expanded; arms `if`/`else` stacked; `merge`/`estimate`/`fallback` inside their containers; `e-bypass` clears BOTH frames (acceptance helper + the painted-line check); `mut` and `z⁻¹ = prior()` pills; no cable crosses arms |
| `…--branch-in-loop-react-flow` | React Flow | both frames expanded + two members inside, neither a host node |
| `…--branch-in-loop-tldraw` | tldraw | the same |
| `…--collapsed-branch-in-loop` | DOM canvas | the branch opaque INSIDE the open loop's body; no arm row, no member reaches the DOM |

Measured on the DOM board (`getBoundingClientRect`, headless Chromium,
1520×840): loop frame `216,126 → 1216,666`; branch frame `787,216 →
1187,631`, fully inside it; `e-bypass` samples every 4px along the real
`path[data-slot="trace-line"]` — **0 points inside either frame**, max y 690,
24px below the loop's bottom border; 13 wires painted,
`data-unresolved-wires` empty.

**Nothing is red, but two findings are worth the dispatcher's time.**

1. **`docs/build_menu_registry_items.py` (no `--check`) exits 1 on this base,
   and did so BEFORE this lane** — 50 sibling-rule violations across 11
   PRE-EXISTING items (`block-card`, `block-port`, `code-editor`,
   `editable-text`, `labeled-port`, `port-dot`, `port-edge`, `trace`,
   `trace-badge`, `trace-editor`, `wire-layer`), e.g. `wire-layer:
   components/bbox/wireLayer.tsx imports './traceBadge' -> no file lands at
   'components/bbox/traceBadge'`. Measured both ways on 2026-09-18: the base
   script against the base `registry.json` reports the same 50 across the same
   11 items, so this lane added zero. `region` is not among them. These are
   the sixteen hand-written trunk items CLAUDE.md calls "self-contained"; they
   are the exact "installs clean, then fails to compile" class the script was
   written to catch, and the fix is to generate them (add them to `ITEMS`)
   rather than to hand-patch `registry.json`. Out of this lane's brief, so
   reported rather than done. `--check` exits 0 because it returns before the
   assertion — that asymmetry is itself worth closing.
2. **`public/r/*.json` is tracked and stale.** `npx shadcn@latest build`
   rewrote 18 of them with current source content (they had drifted since the
   last build) and created `public/r/region.json`. `public/r/` is not in this
   lane's write set, so all 19 were reverted and the built `region.json` was
   used only for the install proof. Whoever owns the website surface should
   rebuild and commit it, or the served registry keeps shipping pre-reset
   component source.

**One cosmetic observation, not fixed** (`src/components/` is off-limits to
this lane): a `Block` with both a header and a TOP-wall port paints the port's
label over the header text — visible on `merge()` as `effect:pose` sitting on
`merge()`. Pre-existing and already shipped that way in lane D's
`components-blocks-blockregion-wires--mut-effect-cable`; it is a `Block`/rail band question,
not a fixture one.

**Captures:** `/home/bam/bbox-ui/reports/media/lanes-2026-09-18/cf-F/` —
`gallery-branch-in-loop-dom.png`, `…-reactflow.png`, `…-tldraw.png`,
`gallery-collapsed-branch-in-loop.png` (headless Chromium, DSR 2, looked at).

---

## Appendix — the builder briefs, verbatim (what each Opus builder receives)

Every brief assumes: you are in your own worktree cut from the integration branch AFTER this plan's commit; run `pnpm install --filter bbox-storybook-basics...` once; work only under `apps/storybook-basics/` unless the brief names another path; never `git add -A`; stage explicit pathspecs and read `git diff --cached --name-only` before committing; leave `WHY:` comments at the seams the brief names; the acceptance files listed in §7 are read-only for you — if one cannot pass, report FAIL with the reason instead of editing it.

### A · Region kit — scene queries, layout, component, host renderer (BARRIER, day-0)

**Read first (cite lines in your WHY comments):** `docs/CONTROL-FLOW-PLAN.md` §0–§3, §5; `src/scene/region.ts` (all — `regionOf`'s cycle-safe walk at `:165-180` is the pattern for `armOf`); `src/scene/boundary.ts:100-230` (`classifyBoundary`, `BoundaryClass`; you use it for `hiddenSummary`'s edge count); `src/scene/controlFlow.ts` and `src/components/region.layout.ts` (the stubs whose bodies you write — keep every exported name and type); `src/hosts/nodeViews.tsx` (all — `BlockNodeView` `:437-531` is the pattern; `SceneNodeView` `:538-573` is where your case goes); `src/hosts/hostScene.ts:25-90` (`HostNodeData.region/arm/badge/marks` are already typed — read-only); `src/hosts/regionScene.ts` (`regionViewOf`, `RegionData`, `ArmData` — real, import them; do not edit); `src/components/block.tsx:68-160, 282-330` (`style` spreads after `borderRadius` at `:321`), `blockPort.tsx:93-200, 328-360`, `blockMembers.tsx:55-200`, `bar.tsx:58-91`, `foldingChevron.tsx`, `badge.tsx:31-71`, `paintOrder.ts`; `src/hosts/memberDrag.ts:47-100`; `src/stories/SceneHosts.stories.tsx:1-82` and `FitToContentHosts.stories.tsx:1-60` (story shape, `required()`, tags); `src/stories/controlFlow.acceptance.ts` (all — the assertions your stories must call); the donor for the arm rows: `/home/bam/systemsketch/src/branch/branchModel.ts:161-230` and `BranchCanvas.tsx:1-120` (read-only). Open `/home/bam/zach_brain/Pasted image 20260918150916.png` (OLD BAD / NEW GOOD), `…192040.png` (the Labeled Group Node look), `…144504.png` (arm rows), `…143241.png` (a real branch).

**Write set:** `src/scene/controlFlow.ts`, `src/components/region.layout.ts`, `src/components/region.tsx` (new), `src/hosts/nodeViews.tsx`, `src/stories/ControlFlowRegion.stories.tsx` (new), repo-root `CLAUDE.md` (two edits: add `control-flow` to the closed `area:` vocabulary list in "Story tags"; add a short "## Control flow" section pointing at `docs/CONTROL-FLOW-PLAN.md` and stating the one rule: the region root/frame carry `data-region-id`, the corner card alone carries `data-block-id`).

**Do not touch:** the six acceptance files (§7); `hostScene.ts`, `regionScene.ts`, `regionView.ts`, `wiring.ts`, `wireLayer.tsx`, `sceneWires.ts`, `domCanvas.tsx`, `reactFlowHost.tsx`, `tldrawHost.tsx`, `portDotSightings.ts` (other lanes); `block.tsx`, `blockPort.tsx`, `blockMembers.tsx`, `scene/scene.ts`, `collapse.ts`, `boundary.ts`, `region.ts`, `elbow/*`.

**Build, in this order:**

> **2026-09-22 — the titles and tags in the lane steps below are superseded.** They record what those lanes were told. Control-flow stories now title under `Components/Blocks/BlockRegion/…` (Loop, Branch, Toggle, Wires, Host Edges, Gallery, Edge Defaults, Async, and the kit itself at `Components/Blocks/BlockRegion`) with `object:region`; `area:` tags are retired. The branch and loop presets moved from `src/presets/<kind>/` to `src/scene/region.<kind>.ts` (they build scene records, so they sit beside the region model), and there is no `presets/` folder any more. `CLAUDE.md` § Story titles is the rule and `src/storyOrganisation.test.ts` enforces it.
>
> **Also 2026-09-22:** `Region` is now `BlockRegion`, and its files are `components/blockRegion{,.layout,.layout.test,.acceptance,.labeledGroup}.{ts,tsx}`. The paths below say `region.*` because that is what the lanes were told. The corner card's radii moved off the exported `REGION_CORNER_BLOCK_STYLE` onto `Block`'s own `shape="region-corner"`.

1. `scene/controlFlow.ts` bodies. `armsOf` = `childrenOf(scene, id).filter(isArm)`; `bodyChildrenOf` = the complement; `armOf` = `regionOf`'s walk with `isArm`; `hiddenSummary`: `nodes` = `descendantsOf(scene, [id])` minus the region minus arms, `arms` = `armsOf().length`, `edges` = `classifyBoundary(scene, {containerId: id}).edges` with `kind` in `{"interior", "port-inner"}`; unknown id → all zeros. `describeHidden` per its doc. Gate: `pnpm exec vitest --project=unit run src/scene/controlFlow.test.ts` → all green.
2. `components/region.layout.ts`'s `regionLayout` exactly as `region.layout.test.ts` pins it (corner at origin; body under it; rows stack; folded = 0; hug vs explicit; min clamp; pure). Gate: that test file green.
3. `components/region.tsx` — `Region` per §3.2. Frame: `div[data-slot="region-frame"]` with `position: relative`, `width`, `height` from `regionLayout`, `border: 1px solid var(--border)`, `borderRadius: var(--bbox-skin-radius, var(--radius-lg))`, transparent background, `overflow: visible`, `isolation: isolate` on the ROOT only if you emit a paint tier (see `paintOrder.ts`; prefer not to). Corner: `div[data-slot="region-corner"]` absolutely at `top: -1px; left: -1px` wrapping `corner`; make the corner Block's top-right and bottom-left radii `0px` and its top-left the frame's (either a wrapper class with Tailwind's `!` important suffix on `[&_[data-slot=block]]`, or export `REGION_CORNER_BLOCK_STYLE` and apply it in `nodeViews` — the acceptance measures `getComputedStyle(...).borderTopRightRadius === "0px"`, not the mechanism; leave a WHY naming `block.tsx:321` if you use `style`). Measure the corner's size with a `ResizeObserver` in a `useLayoutEffect` (skip when `cornerSize` is given) and feed `regionLayout`; first paint may use `{w: REGION_CORNER_WIDTH_PX, h: 0}` and correct within a frame — say so in a WHY (same device as `tldrawHost.tsx`'s "first-frame guess"). Body: `div[data-slot="region-body"]` at `layout.body` rendering `<BlockMembers layout="free" members gap gutter insetBackground="none" showMembers showCards={false}/>`. Arms: one `div[data-slot="region-arm"][data-arm-id][data-open][data-active]` per arm at `layout.arms[i]` (absolute `top: rowTop`, `height: bottom - rowTop`, full width), header `div[data-slot="region-arm-header"]` = `<Bar size="sm" left={<><FoldingChevron open onClick={() => onOpenChange?.(!open)} /> {title}</>} />` with a 1px top divider for `index > 0`; body `div[data-slot="region-arm-body"]` rendered only when `open` (height `bodyHeight`), `BlockMembers layout="free"` inside; a non-active arm gets `style={{opacity: REGION_ARM_FADE_OPACITY}}` (WHY: donor `branchModel.ts:38-39`, "one token"). Opaque: the root renders `corner` alone. Never stamp `data-block-id` on the root or frame (WHY: `wireLayer.tsx:81`, first match wins).
4. `hosts/nodeViews.tsx`: add `case "region": return <RegionNodeView {...props}/>`. `RegionNodeView`: `region = node.data.region ?? {kind: "group"}`; `view = regionViewOf(node)`; the corner card = `<BlockPort id={node.id} view="port" edges={…from data.ports exactly as BlockNodeView builds them, withWiredState, onItemsChange via reorderNodePorts…}><Block header={header} width={REGION_CORNER_WIDTH_PX} /></BlockPort>` where `header` is the plain `node.data.name` string UNLESS `node.data.badge` is set, in which case `<Bar size="md" left={name} right={<Badge size="sm" variant="secondary">{badge}</Badge>} />` (WHY: zero DOM change for every existing story). Members: `bodyChildrenOf(scene, node.id)` → free `BlockMember`s with `useFreeMemberDrag`/`moveMember`/`POINTER_OWNED_CLASS` exactly like `BlockNodeView`'s free branch (extract a shared `freeMemberOf(kid, drag, …)` helper inside this file rather than copy-pasting). Arms: `armsOf(scene, node.id)` → `{ id, title: arm.data.name ?? arm.id, open: arm.data.arm?.open ?? true, onOpenChange: onSceneChange && ((open) => onSceneChange(writeNodeData(scene, arm.id, { arm: { ...arm.data.arm, open } }))), active: region.activeArm === undefined || region.activeArm === arm.id, bodyHeight: arm.data.arm?.h, members: childrenOf(scene, arm.id) → free members (their own drag) }`. Opaque (this lane): `<Region view="opaque" corner={cardWithOwnPorts + footer}/>` where the `Block` gets `width={REGION_CARD_WIDTH_PX}` and `footer={<span data-slot="region-hidden">{describeHidden(hiddenSummary(scene, node.id))}</span>}` — lane E adds the promoted ports and the chevron later; leave a `// lane E: promoted ports + toggle land here` marker. Control marks: in `BlockNodeView` (and the region corner), when `node.data.marks?.length`, the header becomes the Bar form with one `<Badge data-slot="control-mark" data-mark={mark} size="sm" variant="outline">` per mark (`break` = lucide `Square`/`OctagonX` glyph + "break"; `continue` = `RotateCw` + "continue"; `pass` = text) — WHY: DP - Break & Continue B5, "a mark, never a cable".
5. `stories/ControlFlowRegion.stories.tsx`: `title: "Control Flow/Region"`, `tags: ["area:control-flow", "lane:control-flow"]`. Stories with `play`: `EmptyExpanded` (DomCanvas, one group region 400×260, no children) → `expectRegionExpanded`; `EmptyOpaque` (same node with `region.view: "opaque"`) → `expectRegionOpaque` and footer text `"nothing hidden"`; `WithMembers` (two port-view blocks inside a loop-kind region with ports `{left:["Iterable"], right:["Iter"]}`) → `expectRegionExpanded`, `expectCornerPorts(root, id, {left:["Iterable"], right:["Iter"]})`, `expectMemberInside(root, '[data-slot="region-body"]', "merge")`; `WithArms` (branch kind, arms `if`/`elif`(folded)/`else`, a block in `if` and one in `else`) → `expectArmsStacked(root, id, ["if","elif","else"])`, `expectMemberInside(root, '[data-arm-id="if"] [data-slot="region-arm-body"]', "est")`; `ActiveArm` (`activeArm: "if"`) → the `else` row has `data-active="false"` and computed opacity `"0.18"`; `InReactFlow` (the WithMembers scene in `ReactFlowHost`, `defaultViewport {x:0,y:0,zoom:1}`) → `expectRegionExpanded`; `LayoutTwin` → for each arm, `arm.getBoundingClientRect().top - frame.top` equals `regionLayout(...).arms[i].rowTop` within 1px (paint and geometry cannot drift). First testing-library call in every play is `findBy*`/`waitFor` (CLAUDE.md rule).
6. `CLAUDE.md` edits (above). Gate: `pnpm typecheck`; `pnpm test` inside `apps/storybook-basics` — every pre-existing story green, `controlFlow.test.ts` + `region.layout.test.ts` green, your stories green; `regionView.test.ts`/`regionScene.test.ts`/`wiring.test.ts` stay red (other lanes) and you say so in your report. Commit with pathspecs; report the story ids.

**WHY comments to leave:** in `region.tsx`'s header (one node = corner + frame; A1 in §2.A; the `data-block-id` rule citing `wireLayer.tsx:81`); at the arm row (positions arm-relative — `scene.ts:60-72`; arms as nodes — C-1); at the fade (`branchModel.ts:38-39`); in `nodeViews.tsx` at the header-string-vs-Bar branch (zero DOM change), at the control-mark badge (B5).

### D · Wires — keep-outs (bypass), endpoint boxes, badges (day-0)

**Read first:** plan §3.5, §4 (the wire rows), §5; `src/components/wiring.ts` (all — `keepOutsFor`'s stub and the new `Wire.through`/`badge` fields are yours to implement, types frozen); `src/components/wireLayer.tsx` (all — `resolveDot :80-92`, `computeState :101-125`, the render `:196-232`); `src/components/trace.tsx:596-760` (`TraceRouteRequest.obstacles/fromBox/toBox :630-651`, `routeTraceRequest`) and the `Trace` component's props (find whether `obstacles`, `fromBox`, `toBox`, `onGeometry` are already props; the header says `onGeometry` exists — verify); `src/components/elbow/collisionRouting.ts:60-160` (what an obstacle does), `elbow/traceContract.ts:25-60`; `src/components/traceBadge.tsx:1-120` (props `points`, `t`, `value`, `variant`, `size`; DOM not SVG — `:190-200` of `traceMark.tsx` explains the coordinate space); `src/scene/sceneWires.ts` (all), `src/scene/region.ts:187-201` (`ancestorsOf`); `src/stories/TraceTidy.stories.tsx:60-140, 1080-1120` (how a story passes obstacles today); `src/stories/BlockWiring.stories.tsx` (a WireLayer bench pattern); `src/stories/controlFlow.acceptance.ts` (`expectWireAvoids`, `expectWirePainted`, `expectWireBadge`, `expectControlMark`). Donor rule for bypass (read-only): `/home/bam/zach_brain/Projects/bbox-ui/Components/DP - Trace.md` "T3" if present, and the ASK: "data cables that aren't flowing through the branch should actively avoid the branch — bypass by going above or below it."

**Write set:** `src/components/wiring.ts`, `src/components/wireLayer.tsx`, `src/scene/sceneWires.ts`, `src/components/trace.tsx` (ADDS-ONLY pass-through props, only if missing), `src/stories/ControlFlowWires.stories.tsx` (new).

**Do not touch:** `wiring.test.ts` and the other five acceptance files; `elbow/*` (verbatim port); `trace.routing.ts`, `trace.tidy.ts`; `domCanvas.tsx`, `nodeViews.tsx`, `reactFlowHost.tsx`, `tldrawHost.tsx`; anything under `src/scene/` other than `sceneWires.ts`.

**Build:**

1. `keepOutsFor` per its doc: exclude `from.blockId`, `to.blockId`, every id in `through`; map to `{x,y,w,h}`; input order; a new array. Gate: `pnpm exec vitest --project=unit run src/components/wiring.test.ts` green.
2. `sceneWires.ts`: `WireStyleData` gains `badge?: string`. `sceneWires(scene)` needs the NODES now to derive `through` — widen its parameter to `{ nodes: readonly SceneNode[]; edges: … }` (every caller passes a whole scene already: `domCanvas.tsx:260`, `tldrawHost.tsx:453`, the stories — check with `git grep sceneWires(`; a `{edges}`-only caller keeps working if you make `nodes` optional and default `through` to `[]`). `through` = unique `[...ancestorsOf(scene, source), ...ancestorsOf(scene, target)]`; `badge` = `edge.data?.badge ?? (edge.data?.variant === "delayed" ? "z⁻¹" : undefined)` — WHY: Q7's default, in code. Add a unit test of your own for it (new file `src/scene/sceneWires.test.ts`, yours).
3. `wireLayer.tsx`: in `computeState`, when `wire.routing === "elbow"`, build the keep-out list once per pass: every `[data-region-id]` frame (`[data-slot="region-frame"]`'s rect, keyed by the region id), every `[data-slot="region-arm"][data-arm-id]` rect, every `[data-block-id]` rect NOT already keyed as a region frame (a region's corner card shares the id — the frame is the keep-out); rects in container space (reuse `centreOf`'s math). Per wire: `obstacles = keepOutsFor(wire, rects)`, `fromBox`/`toBox` = the `[data-block-id]` rect of each endpoint (the corner card for a region end — WHY: a self-loop must leave and re-enter around its own block, and the router's `start.box`/`end.box` are what make the first/last legs perpendicular). Pass `obstacles`, `fromBox`, `toBox` to `Trace`. Non-elbow wires: byte-identical to today. Badges: collect each `Trace`'s polyline through `onGeometry` (store `points` per wire id in state; if `onGeometry` is not a `Trace` prop, add it adds-only mirroring `TraceRouteRequest`'s `points`), render `<div data-slot="wire-badges" style={{position:"absolute", inset:0, pointerEvents:"none"}}>` AFTER the `<svg>`, with `<div data-wire-id={id}><TraceBadge points value={wire.badge} t={0.5} size="sm" variant="outline"/></div>` for each wire that has `badge` and resolved points. WHY at the seam: badges are DOM, not SVG (`traceBadge.tsx`'s own header), so they live in a sibling layer keyed by wire id.
4. `ControlFlowWires.stories.tsx` (`title: "Control Flow/Wires"`, tags `area:control-flow`, `lane:control-flow`), all on `DomCanvas` with `HostScene` fixtures written inline: `BypassAroundABlock` — `src` (right port `out`) at x 0, `bystander` block at x 220 between, `enc` (left port `in`) at x 520; edge `e` with `data.routing: "elbow"`; play: `expectWirePainted(root,"e")`, `expectWireAvoids(root,"e",'[data-block-id="bystander"]')`. `CarriedValueSelfLoop` — one block `merge` with `left: ["pose","other"]`, `right: ["Pose"]`; edge `e-carry` `Pose→pose`, `data: {variant: "delayed", routing: "elbow"}`; play: `expectWireBadge(root,"e-carry","z⁻¹")`, `expectWireAvoids(root,"e-carry",'[data-block-id="merge"] [data-slot="block"]')`. `ThroughAContainer` — `proc` expanded with member `kid` (as `HOST_SCENE` does) and an outside `src` wired to `kid/in` with elbow routing, plus a second wire from `src` to a block on the far side that must avoid `proc`; play: the first is painted (it may enter `proc` — `through` includes it), the second `expectWireAvoids(...,'[data-block-id="proc"]')`. `MutEffectCable` — a block with `ports.top: ["effect:pose"]` wired to another block's left port, edge `data: { color: "var(--color-amber-600, #d97706)", badge: "mut", routing: "elbow" }`; play: `expectWireBadge(root, id, "mut")`. `BadgeWithSeed` — `data.badge: "z⁻¹ = estimate()"` renders verbatim (truthful rendering rule).
5. Gate: `pnpm typecheck`; `pnpm test` — every pre-existing story green (especially `BlockWiring`, `AsyncRegion`, `WireLayerOwnership`, `CollapseWireEndpoints`, all `Trace*`), `wiring.test.ts` green, your stories green; the A/E acceptance files remain red and you say so.

### G · Canvas-host member edges — React Flow + tldraw (day-0)

**Read first:** plan §1 (the two ⚠️ rows), §3.6; `src/hosts/portDotSightings.ts` (all); `src/hosts/reactFlowHost.tsx` (all — `measurePortDots :44-55`, `MeasuredPortHandles :80-130`, `NODE_TYPES :383`, `DRAG_HANDLE_FOR_TYPE :387-397`, `rfNodes/rfEdges :541-560`, `TraceEdge :400-470`); `src/hosts/tldrawHost.tsx` (all — anchors `:96-160`, the wire overlay `:406-500`, `endPoint :451-470`, shape sizing `:594-610`); `src/hosts/hostScene.ts:71-105` (the documented asymmetry); `src/scene/region.ts:187-201` (`ancestorsOf`), `src/scene/scene.ts:149-151` (`portKey`); `src/stories/SceneHosts.stories.tsx`, `SceneHostsTldraw.stories.tsx`, `FitToContentHosts.stories.tsx` (assertion patterns per host, `dragFrom`); `src/stories/controlFlow.acceptance.ts` (`expectMemberInside`).

**Write set:** `src/hosts/portDotSightings.ts`, `src/hosts/reactFlowHost.tsx`, `src/hosts/tldrawHost.tsx`, `src/stories/ControlFlowHostEdges.stories.tsx` (new).

**Do not touch:** the acceptance files; `nodeViews.tsx`, `domCanvas.tsx`, `hostScene.ts`, `regionScene.ts`; `wireLayer.tsx`, `wiring.ts`, `sceneWires.ts` (lane D); anything in `src/components/` or `src/scene/`.

**Build:**

1. `portDotSightings.ts`: additive. `PortDotSighting` gains `ownerId: string` (the nearest `data-block-id`) and `handleId: string` (`portId` when `ownerId === nodeId`, else `portKey(ownerId, portId)`). `sightPortDots(root, nodeId, options?: { members?: boolean })`: with `members` false/absent the result is BYTE-IDENTICAL to today (own dots only; add a test-free WHY); with `members: true` also returns dots whose owner is a nested `[data-block-id]` inside `root` (any depth), deduped by `handleId`, collapsed stand-ins included. WHY at the seam: the canvas hosts route to ANCHORS, and a member's dot is an anchor of the top-level node it lives in (`hostScene.ts:75-82` recorded the gap as a finding; this closes it).
2. `reactFlowHost.tsx`: `measurePortDots` calls `sightPortDots(root, nodeId, { members: true })` and mounts `<Handle id={h.handleId} …/>` pairs (own dots keep `id = portId`). `rfEdges`: for each edge end whose node has a `parentId`, re-point to its top-level ancestor (`ancestorsOf(scene, id).at(-1) ?? id`) with handle `portKey(memberId, portId)`; ends on top-level nodes unchanged. Add `region: BboxNode` to `NODE_TYPES` and `region: \`[${OWN_DRAG_HANDLE_ATTR}]\`` to `DRAG_HANDLE_FOR_TYPE` (WHY: a region's own header is the corner card's — `ownHeaderOf` already resolves `[data-block-id=<region id>]` to it once lane A lands; harmless before). Keep `useUpdateNodeInternals` semantics (call after member handles change).
3. `tldrawHost.tsx`: anchors are reported keyed by `handleId`; `endPoint(blockId, portId)`: `shapeNodeId = top-level ancestor of blockId` (from `scene`, via `ancestorsOf`), `handleId = blockId === shapeNodeId ? portId : portKey(blockId, portId)`, then the existing transform math against `shapeIdForNode(shapeNodeId)`. Members' anchors are measured by the same `sightPortDots(root, nodeId, { members: true })` call the shape component already makes.
4. `ControlFlowHostEdges.stories.tsx` (`title: "Control Flow/Host Edges"`, tags `area:control-flow`, `lane:control-flow`): a scene = `HOST_SCENE` plus `e-kid-in: src/out → kid/in` and `e-kid-out: kid/out → sink/cfg`-style edges (give `kid` a right port), rendered in `ReactFlowHost` and `TldrawHost`. Plays: `expectMemberInside(root, '[data-scene-node="proc"]', "kid")`; RF: the edge element for `e-kid-in` exists (`.react-flow__edge[data-id="e-kid-in"] path` — verify the attribute React Flow stamps) and the path's END point (`getPointAtLength(getTotalLength())`, screen space) is within 14px of `kid`'s `in` dot centre (`[data-block-id="kid"] [data-port-id="in"]`), measured; tldraw: the overlay's trace for `e-kid-in` exists (find how `SceneHostsTldraw.stories.tsx` locates a wire — reuse that selector) and its end is within 14px of the same dot. A third story `MemberEdgeSurvivesDrag` (RF): drag `proc` by its header with `dragFrom`, re-measure — still within 14px.
5. Gate: `pnpm typecheck`; `pnpm test` — every pre-existing host story green (`SceneHosts`, `SceneHostsTldraw`, `FitToContentHosts`, `DragPolicy`, `ValuePresetHosts`, `GlyphHosts`, `CodeEditorHosts`, `BlockPortHosts`, `ValidationHosts`), yours green; A/D/E acceptance unit files remain red and you say so.

### B · Loop preset — for / while factories, fixtures, stories (after A; D for two assertions)

**Read first:** plan §0–§3, §4 (loop rows), §5, §12; `src/hosts/hostScene.ts` (`HostNodeData.region/badge/marks`, `HOST_SCENE` as fixture style); `src/hosts/regionScene.ts` (`RegionData`, `LoopKind`); `src/presets/value/value.tsx:1-45` (the preset precedent); `src/hosts/nodeViews.tsx` after lane A (the region case); `src/stories/ControlFlowRegion.stories.tsx` (lane A's stories — copy their shape); `src/stories/controlFlow.acceptance.ts`. Vault (read-only): `/home/bam/zach_brain/Projects/bbox-ui/Components/DP - Loop.md` (the typed unnamed header contract, the z⁻¹ rule, "a loop is a region with one arm plus one cable that comes back"), `DP - Break & Continue.md` (B5). Images: `Pasted image 20260918145132.png`, `…145709.png` (the loop with `merge()`, `iteration 3 of 7`, the dotted z⁻¹ bottom lane), `…145125.png` (While Loop with condition inputs), `…20260903175205.png` (while + break). Donor (read-only): `/home/bam/systemsketch/src/loop/loopModel.ts:1-70`.

**Write set:** `src/presets/loop/loop.ts` (new), `src/presets/loop/loop.fixtures.ts` (new), `src/presets/loop/loop.test.ts` (new, yours), `src/stories/ControlFlowLoop.stories.tsx` (new).

**Do not touch:** the acceptance files; anything in `src/components/`, `src/scene/`, `src/hosts/`; `presets/value/*`; `presets/branch/*` (lane C); `docs/build_menu_registry_items.py`, `registry.json` (lane F).

**Build:**

1. `presets/loop/loop.ts` — pure factories, no React: `LOOP_PORT_IDS = { iterable: "Iterable", iter: "Iter", bool: "Bool" } as const` (typed, UNNAMED — the id IS the type label, DP - Loop); `forLoopNode({ id, name = "For Loop", position, w = 400, h = 300, view = "expanded", badge?, parentId? }): SceneNode<HostNodeData>` → `type: "region"`, `data.region = { kind: "loop", loop: "for", view }`, `data.ports = { left: ["Iterable"], right: ["Iter"] }`; `whileLoopNode(...)` → `loop: "while"`, `ports = { left: ["Bool"] }` (NO right wall — "no item outlet: the body owns the values it carries"); `carriedValueEdge({ id, nodeId, from, to, seed? })` → `{ source: nodeId, sourceHandle: from, target: nodeId, targetHandle: to, data: { variant: "delayed", routing: "elbow", ...(seed ? { badge: \`z⁻¹ = ${seed}\` } : {}) } }` (WHY: DP - Loop — the back cable is DATA, one turn late; the pill text names the seed; no `z⁻¹` when unset because `sceneWires` derives it — Q7). Unit-test the factories in `loop.test.ts` (shape, no `definitionId` ever, while has no right wall).
2. `loop.fixtures.ts` — `HostScene` literals: `FOR_LOOP_EMPTY`; `FOR_LOOP_CARRIED` (the sketch: `estimate` outside → `merge/pose` (seed), `run/others` → `loop/Iterable`, `loop/Iter` → `merge/other`, `merge/Pose` → `smooth/fused`, `smooth/Pose` → `encode/pose` outside, `e-carry` via `carriedValueEdge` with seed `"estimate()"`); `WHILE_LOOP_RECHECK` (`cond` outside → `loop/Bool`; inside: `step()` → `check()`; `check/ok → loop/Bool` as a delayed elbow edge — the visible re-check, DP - Loop); `LOOP_WITH_TURN` (`badge: "iteration 3 of 7"`); `LOOP_WITH_BREAK` (`check` carries `marks: ["break"]`). Every member has `view: "port"` and explicit `w`/`h`, positions inside the loop's space.
3. `ControlFlowLoop.stories.tsx` (`title: "Control Flow/Loop"`, tags `area:control-flow`, `lane:control-flow`), `DomCanvas` unless named: `ForLoopEmpty` → `expectRegionExpanded`, `expectCornerPorts(root, id, { left: ["Iterable"], right: ["Iter"] })`; `ForLoopCarried` → the above + `expectMemberInside(root, '[data-slot="region-body"]', "merge")`, `expectWirePainted` for `e-iter`, `e-seed`, `e-out`, `expectWireBadge(root, "e-carry", "z⁻¹ = estimate()")` and `expectWireAvoids(root, "e-carry", '[data-block-id="merge"] [data-slot="block"]')` (these two need lane D — if D is not merged in your base, keep the assertions and report FAIL for those two stories by name); `WhileLoopRecheck` → `expectCornerPorts(root, id, { left: ["Bool"] })` and assert NO `[data-slot="block-port-rail"][data-edge="right"]` inside the corner, `expectWirePainted("e-recheck")`; `LoopWithTurn` → the corner header contains a `[data-slot="badge"]` (check `badge.tsx`'s stamp) reading exactly `iteration 3 of 7`; `LoopWithBreak` → `expectControlMark(root, "check", "break")`; `ForLoopReactFlow` → `FOR_LOOP_CARRIED` in `ReactFlowHost` (`defaultViewport {x:0,y:0,zoom:1}`), `expectRegionExpanded` + `expectMemberInside`.
4. Gate: `pnpm typecheck`; `pnpm test` — all green except assertions you name as blocked on D. Report the story ids.

**WHY comments:** at `LOOP_PORT_IDS` (typed unnamed, `loopModel.ts:55-70`'s "a type and nothing else"); at `whileLoopNode`'s missing right wall; at `carriedValueEdge` (data, delayed; seed in the pill; elbow so it takes the bottom lane — DP - Loop "format, not semantics").

### C · Branch preset — if/elif/else, match/case, nested, fold, active (after A)

**Read first:** plan §0–§3, §4 (arm rows), §5, §12; `src/scene/controlFlow.ts` (`ARM_NODE_TYPE`, `armsOf`, `armOf`); `src/hosts/regionScene.ts` (`ArmData`, `activeArm`); `src/hosts/nodeViews.tsx` after lane A; `src/components/region.layout.ts` (constants); `src/stories/ControlFlowRegion.stories.tsx` (lane A's `WithArms`); `src/stories/controlFlow.acceptance.ts`. Vault (read-only): `DP - Branch.md` (V1 pick: no ports on the region, arms fan in at the consumer; "cables cannot cross rows is derived"), `C - Branch Region Asymmetry (Scopes See In, Only Yields Come Out).md`. Images: `Pasted image 20260918143241.png` (ONE input — copy this board), `…144504.png` (many inputs, Selector + arm stack), `…144705.png` (nested: Switch → arm 1 holds a Selector with its own arms), `…145419.png` (the shipped SystemSketch branch, `if mode == "fast":` / `elif` / `else` with a nested `Branch` in the `elif` arm). Donor (read-only): `/home/bam/systemsketch/src/branch/branchModel.ts:1-17, 383-420` (`getDefaultBranchProps`: arms `if`/`else`, `view: "expanded"`, `activeArmId: null`).

**Write set:** `src/presets/branch/branch.ts` (new), `src/presets/branch/branch.fixtures.ts` (new), `src/presets/branch/branch.test.ts` (new, yours), `src/stories/ControlFlowBranch.stories.tsx` (new).

**Do not touch:** the acceptance files; `src/components/`, `src/scene/`, `src/hosts/`; `presets/loop/*` (lane B); registry files (lane F).

**Build:**

1. `presets/branch/branch.ts` — pure factories: `branchNode({ id, name = "Branch", position, w = 520, h?, conditions = ["cond"], arms, view = "expanded", activeArm?, parentId? })` returns `SceneNode<HostNodeData>[]` — the region (`type: "region"`, `data.region = { kind: "branch", view, activeArm }`, `data.ports = { left: conditions }` and NO right wall — Q1, V1) FOLLOWED by one `armNode` per entry of `arms: { id, title, open?: boolean, h?: number }[]` (`type: "arm"`, `parentId: region id`, `position {0,0}`, `data: { name: title, arm: { open: open ?? true, h } }`). Helpers: `ifElifElseArms(["fast", 'mode == "safe"'])` → titles `if fast:`, `elif mode == "safe":`, `else:`; `matchCaseArms("cmd", ['"go"', '"stop"'])` → `match cmd:` goes in the region `name`'s subtitle? No — keep `name: "Branch"`; arms titled `case "go":`, `case "stop":`, `case _:`. Unit-test: no `definitionId`; no right wall; arms carry `parentId`; `armsOf` finds them in order.
2. `branch.fixtures.ts`: `BRANCH_ONE_INPUT` (Zach's 143241: outside `src` with right ports `fast`, `frame`, `gain`; region with `conditions: ["fast"]`; arm `if fast:` holds `estimate()` (`left: ["frame","gain"]`, `right: ["Pose"]`), arm `else:` holds `fallback()` (`left: ["frame"]`, `right: ["Pose"]`); outside `encode` (`left: ["pose"]`); edges: `src/fast → br/fast`, `src/frame → estimate/frame`, `src/frame → fallback/frame`, `src/gain → estimate/gain`, `estimate/Pose → encode/pose`, `fallback/Pose → encode/pose` — the two sibling cables landing on ONE port ARE the join, no yield port). `BRANCH_MANY_INPUTS` (`conditions: ["input_1","input_2","input_3"]`, arms `arm 1..3`, each with one block). `MATCH_CASE`. `BRANCH_FOLDED` (the `elif` arm `open: false`). `BRANCH_ACTIVE` (`activeArm: "if"`). `BRANCH_NESTED` (a second `branchNode` with `parentId: "if"` (the OUTER arm's id) and its own two arms with one block each — 144705).
3. `ControlFlowBranch.stories.tsx` (`title: "Control Flow/Branch"`, tags `area:control-flow`, `lane:control-flow`): `OneInput` → `expectRegionExpanded`, `expectCornerPorts(root, "br", { left: ["fast"] })`, assert NO right rail in the corner, `expectArmsStacked(root, "br", ["if","else"])`, `expectMemberInside(root, '[data-arm-id="if"] [data-slot="region-arm-body"]', "estimate")`, `expectWirePainted` for all six edges, and the fan-in: both `estimate/Pose→encode/pose` and `fallback/Pose→encode/pose` resolve to the SAME dot (`[data-block-id="encode"] [data-port-id="pose"]` is one element). `ManyInputs` → three left ports, three arms. `MatchCase` → arm titles read `case "go":` etc. verbatim. `FoldedArm` → `expectArmsStacked` with `elif` `data-open="false"`; then click its chevron (`userEvent.click` on `[data-arm-id="elif"] [data-slot="folding-chevron"]`) → `data-open="true"`, and the `else` arm's member's rect relative to ITS arm body top is unchanged before/after (positions arm-relative — measure, don't assume). `ActiveArm` → `else` row `data-active="false"`, opacity `0.18`. `Nested` → `expectRegionExpanded(root, "inner")` and `required(root, '[data-arm-id="if"] [data-slot="region"][data-region-id="inner"]')`. `OneInputReactFlow` → `BRANCH_ONE_INPUT` in `ReactFlowHost`, `expectRegionExpanded` + `expectArmsStacked`.
4. Gate: `pnpm typecheck`; `pnpm test` all green. Report the story ids.

**WHY comments:** at the missing right wall (Q1/V1, DP - Branch: "yields get messy — then you don't know which of those ports are firing"); at the arm factory (arms are nodes — plan §2.C; pyblocks divergence §12); at the nested fixture (`parentId` = the arm, never the region).

### E · Opaque projection, the toggle, hosts wired to the projection (after A, D, G)

**Read first:** plan §2.B, §3.4, §3.6, §4 (opaque/toggle rows), §12; `src/scene/regionView.ts` (stub — yours), `src/hosts/regionScene.ts` (stub bodies — yours; `projectHostScene` is already real), `src/scene/regionView.test.ts`, `src/hosts/regionScene.test.ts` (your acceptance — read every assertion); `src/scene/boundary.ts` (all — `classifyBoundary :171`, `crossingEdges :218`, `promoteBoundary :449`, `PromotedPort :390`, `promotedDirectionOf :522`); `src/scene/collapse.ts:197-283` (how a collapse consumes the same report — you mirror the re-pointing WITHOUT minting stubs); `src/scene/controlFlow.ts` (`hiddenSummary`); `docs/GROUPING-ALGEBRA.md` §1, §3; `docs/peps/0003-collapse-mutates-the-document.md`; `src/hosts/nodeViews.tsx` after lane A (the region case, the `// lane E` marker); `src/hosts/domCanvas.tsx`, `reactFlowHost.tsx:541-560`, `tldrawHost.tsx:440-470` after lanes D and G (the `sceneWires`/`wiredPortsOf`/`rfEdges` seams); `src/components/foldingChevron.tsx`; `src/stories/controlFlow.acceptance.ts`.

**Write set:** `src/scene/regionView.ts`, `src/hosts/regionScene.ts`, `src/hosts/nodeViews.tsx` (the region case only), `src/hosts/domCanvas.tsx`, `src/hosts/reactFlowHost.tsx`, `src/hosts/tldrawHost.tsx` (the edge/wired seams only), `src/stories/ControlFlowToggle.stories.tsx` (new).

**Do not touch:** the acceptance files; `collapse.ts`, `boundary.ts`, `region.ts`, `scene.ts`; `region.tsx`, `region.layout.ts`; `wireLayer.tsx`, `wiring.ts`, `sceneWires.ts` (D's — call them); `portDotSightings.ts` (G's).

**Build:**

1. `projectOpaqueRegions` per §3.4 and its test: find opaque regions (`options.isOpaque`), keep only the OUTERMOST (drop any whose `ancestorsOf` contains another opaque region); no opaque → return `{ nodes: scene.nodes, edges: scene.edges, regions: [] }` with the SAME arrays. Otherwise, per outermost R in scene order: `report = classifyBoundary(scene, { containerId: R })`, `{ ports } = promoteBoundary(report, { directionOf, typeOf, mintPortId: ({inner}) => mintPortId(inner) })`, `hidden = hiddenSummary(scene, R)`. Then ONE pass over `scene.edges` producing the output list: for each edge, for each end, find the outermost opaque region containing that end's node (a map from node id → owning R, built once via `descendantsOf`); an edge whose two ends resolve to the same R → dropped; an edge with one end being R itself and the other inside R → dropped (`port-inner`); an end inside some R → replaced by `{ R, portForInner.get(portKey(inner)) }` (the port map from `ports` exactly as `collapse.ts:235-240` builds it); an edge with no hidden end → the SAME object. WHY at the top of the function: §2.B in one paragraph (projection vs PEP 0003), naming `collapse.ts:242-262` as the mutating twin this deliberately does not call.
2. `regionScene.ts`: `setRegionView` (find the node; if not a region, or unknown, or `regionViewOf(node) === view` → return `scene` itself; else a new scene whose `nodes` is a new array with ONE replaced node `{ ...node, data: { ...node.data, region: { ...(node.data.region ?? { kind: "group" }), view } } }` and whose `edges` is `scene.edges` by reference); `toggleRegionView` = flip. Gate: `pnpm exec vitest --project=unit run src/scene/regionView.test.ts src/hosts/regionScene.test.ts` green.
3. Hosts: `domCanvas.tsx` — `const projected = projectHostScene(scene)`; `wired = wiredPortsOf(projected.scene)`; `sceneWires(projected.scene)`; pass `regionViews` (a `Map<regionId, OpaqueRegionView>`) into `SceneNodeView` via a new optional `SceneNodeViewProps.regionViews`. `reactFlowHost.tsx` — `rfEdges` from `projected.scene.edges` (then G's member re-pointing), `wired` from the projection, `regionViews` on the context. `tldrawHost.tsx` — the same three. WHY at each seam: one sentence — "hosts paint the projection; the document keeps its direct P1 cables".
4. `nodeViews.tsx` region case, opaque branch: card ports = own `data.ports` walls ∪ the projection's `ports` for this region placed on `port.side` with `id: port.id`, `label: port.inner.portId` (WHY: the reader sees the inner port's own name, the id stays the portKey so wires resolve); `withWiredState` against the projected `wired`; footer `[data-slot="region-hidden"]` = `describeHidden(view.hidden)`; header = `<Bar size="md" left={<FoldingChevron open={view === "expanded"} onClick={() => onSceneChange?.(toggleRegionView(scene, node.id))} aria-label={expanded ? "Collapse region" : "Expand region"} />} center={name} right={badge?} />` in BOTH views (the same slot expanded and collapsed — pyblocks RF§P1 toggle model, `RegionInterface.tsx:80`). The chevron must carry `POINTER_OWNED_CLASS` so a canvas host does not start a drag on the click.
5. `ControlFlowToggle.stories.tsx` (`title: "Control Flow/Toggle"`, tags `area:control-flow`, `lane:control-flow`); an inline `HostScene` fixture = the loop from `regionScene.test.ts` plus `smooth` and an outside `enc`, stateful wrapper per host (copy `StatefulDomCanvas`/`StatefulReactFlow` from `SceneHosts.stories.tsx`; add a tldraw one). Each story also renders a probe `<pre data-slot="positions">{JSON.stringify(scene.nodes.map(n => [n.id, n.position]))}</pre>`. `DomCanvas`, `ReactFlow`, `Tldraw` plays: `expectRegionExpanded(root, "loop")`; read positions; `userEvent.click` the corner chevron; `expectRegionOpaque(root, "loop")`; the card shows `[data-port-id="Iterable"]` (own) AND `[data-port-id="merge/pose"]` on a `data-edge="left"` rail and `[data-port-id="smooth/out"]` on a `data-edge="right"` rail; DOM canvas only: `expectWirePainted("e-seed")`, `expectWirePainted("e-out")`, `[data-wire-id="e-iter"]` absent; positions probe text unchanged; the region's host element `left/top` unchanged (`[data-scene-node="loop"]` style, or RF's transform); click again → `expectRegionExpanded`, every wire resolved again. `NestedOpaque`: a branch region inside the loop, loop opaque → only the loop's card, `hidden` footer counts the nested region's blocks and arms (`"N blocks · M arms · K edges hidden"`).
6. Gate: `pnpm typecheck`; `pnpm test` — everything green, including the two acceptance unit files and every earlier control-flow story (they must still pass with the projection in place: an all-expanded scene is the identity, and you prove it by not touching a byte of their fixtures).

### F · Registry item, gallery, full gate (after A, B, C, D, E, G)

**Read first:** repo `CLAUDE.md` "The registry is the product" (all), `docs/build_menu_registry_items.py` (all — `ITEMS :59`, `target_for :181`, the post-build sibling-rule assertion `:300-360`); `registry.json`; `README.md` (component list); every `src/stories/ControlFlow*.stories.tsx`; `src/presets/loop/loop.fixtures.ts`, `src/presets/branch/branch.fixtures.ts`; `src/stories/controlFlow.acceptance.ts`; plan §8 (what Zach will see) and §13.

**Write set:** `docs/build_menu_registry_items.py`, `registry.json`, `src/stories/ControlFlowGallery.stories.tsx` (new), `README.md`, `docs/CONTROL-FLOW-PLAN.md` (§13 "Status" — append only).

**Do not touch:** the acceptance files; any `src/components/`, `src/scene/`, `src/hosts/`, `src/presets/` file; `packages/*`; `apps/docs`.

**Build:**

1. Add `("region", "components/region.tsx", "Region", "A control-flow frame with a real Block integral to its top-left corner — the frame carries scope and no value ports; arms stack under the corner block with a fold chevron each. Loops and branches are data presets over it.")` to `ITEMS`. Run `python3 docs/build_menu_registry_items.py` (it walks the real imports: `region.layout.ts`, `blockMembers.tsx`, `bar.tsx`, `foldingChevron.tsx`, `lib/utils.ts`, … land as siblings by the trunk rule); then `--check` exits 0; then `npx shadcn@latest build`. Do NOT add the presets — `target_for` has no `presets/` rule (plan §11 item 6); say so in the status.
2. Prove the item installs: a throwaway project under your scratchpad (Vite React TS, `components.json` with the `@/` alias), `npx shadcn@latest add <path-to-built-json>/region.json`, `tsc --noEmit` exit 0 — the CLAUDE.md gate. Record the exact commands and exit codes in §13.
3. `ControlFlowGallery.stories.tsx` (`title: "Control Flow/Gallery"`, tags `area:control-flow`, `lane:control-flow`): `BranchInLoop` — compose `FOR_LOOP_CARRIED` and `BRANCH_ONE_INPUT` into one scene: the branch region's `parentId` is the loop; a bypass cable from an outside `cfg` block to an outside `report` block with `routing: "elbow"` that must avoid BOTH regions; a `mut` cable off a top port on `merge`. Play: `expectRegionExpanded("loop")`, `expectRegionExpanded("br")`, `expectArmsStacked`, `expectWireAvoids("e-bypass", '[data-region-id="loop"] [data-slot="region-frame"]')`, `expectWireBadge("e-mut", "mut")`, and that no cable is painted between the two arms (assert every wire's two ends resolve to nodes whose `armOf` is equal or one is undefined — compute from the fixture). `BranchInLoopReactFlow`, `BranchInLoopTldraw` — the same scene, `expectRegionExpanded` ×2 + `expectMemberInside`. `CollapsedBranchInLoop` — the same with the branch opaque: `expectRegionOpaque("br")` inside the loop's body, `expectRegionExpanded("loop")`.
4. `README.md`: one row for Region in the component list, in the file's existing style; no install line for presets.
5. Append §13 "Status": lanes landed (shas), `pnpm test` totals (files/tests), `--check` output, the throwaway install commands and `tsc` exit code, every story id from §8 that exists, and any assertion still red with its reason.
6. Gate: `pnpm typecheck`; `pnpm test` ALL green (both projects); `python3 docs/build_menu_registry_items.py --check` exit 0.
