# Lane cf:G — Canvas-host member edges (React Flow + tldraw)

_Stream plan: `docs/CONTROL-FLOW-PLAN.md` (read it) · repo: **bbox-ui** · dispatcher-resolved dependencies: none (day-0) · barrier: False_

## Write set (the ONLY paths you may create or edit)
- `apps/storybook-basics/src/hosts/portDotSightings.ts`
- `apps/storybook-basics/src/hosts/reactFlowHost.tsx`
- `apps/storybook-basics/src/hosts/tldrawHost.tsx`
- `apps/storybook-basics/src/stories/ControlFlowHostEdges.stories.tsx`

## Do not touch
- apps/storybook-basics/src/scene/controlFlow.test.ts
- apps/storybook-basics/src/scene/regionView.test.ts
- apps/storybook-basics/src/components/region.layout.test.ts
- apps/storybook-basics/src/components/wiring.test.ts
- apps/storybook-basics/src/hosts/regionScene.test.ts
- apps/storybook-basics/src/stories/controlFlow.acceptance.ts
- apps/storybook-basics/src/hosts/nodeViews.tsx
- apps/storybook-basics/src/hosts/domCanvas.tsx
- apps/storybook-basics/src/hosts/hostScene.ts
- apps/storybook-basics/src/hosts/regionScene.ts
- apps/storybook-basics/src/components/
- apps/storybook-basics/src/scene/
- packages/
- apps/docs/
- /home/bam/systemsketch
- /home/bam/pyblocks
- /home/bam/zach_brain

## Acceptance (assertions you cannot edit)
- sightPortDots(root, nodeId) with no options returns exactly what it returns today (own dots only) — every existing host story (SceneHosts, SceneHostsTldraw, FitToContentHosts, DragPolicy, ValuePresetHosts, GlyphHosts, CodeEditorHosts, BlockPortHosts, ValidationHosts) stays green
- ControlFlowHostEdges/MemberEdgeReactFlow: expectMemberInside('[data-scene-node="proc"]','kid'); the React Flow edge element for e-kid-in exists and its path's END point (getPointAtLength(getTotalLength()), screen space) is within 14px of kid's `in` dot centre — measured
- ControlFlowHostEdges/MemberEdgeTldraw: the tldraw overlay trace for e-kid-in exists (selector reused from SceneHostsTldraw.stories.tsx) and its end is within 14px of the same dot
- ControlFlowHostEdges/MemberEdgeSurvivesDrag (RF): after dragFrom on proc's own header the re-measured end is still within 14px
- NODE_TYPES.region and DRAG_HANDLE_FOR_TYPE.region exist in reactFlowHost.tsx
- pnpm typecheck exit 0; pnpm test — every pre-existing story green, yours green; A/D/E acceptance unit files remain red and are named as such

Acceptance test files (committed before you existed; read them, never edit them):
- `apps/storybook-basics/src/stories/controlFlow.acceptance.ts`

## Builder brief (verbatim from the planner)

You are building lane G (day-0, parallel with A and D) of docs/CONTROL-FLOW-PLAN.md in the bbox-ui monorepo, worktree cut from claude/control-flow-integration-2026-09-18 AFTER commit 062c2b5. `pnpm install --filter bbox-storybook-basics...`; work under apps/storybook-basics/src/hosts and src/stories; never `git add -A`. The acceptance files in plan §7 are READ-ONLY.

WHAT THIS LANE IS: every interesting control-flow cable lands on a block INSIDE a region, and today neither canvas host can draw such a cable. Measured: src/hosts/portDotSightings.ts:54-56 dotOwnedBy sights only dots whose nearest [data-block-id] is the top-level node; src/hosts/hostScene.ts:75-82 records the gap ("an edge into a member … has no React Flow rendering — members are drawn INSIDE their parent by the view kit, so they are not React Flow nodes"); src/hosts/tldrawHost.tsx endPoint(blockId, portId) looks up anchors[blockId] and shapeIdForNode(blockId), and a member id has no shape. You close the gap in both hosts through the one shared sighting seam, additively.

READ FIRST: plan §1 (the two ⚠️ rows), §3.6, Appendix G; src/hosts/portDotSightings.ts (all); src/hosts/reactFlowHost.tsx (all — measurePortDots :44-55, MeasuredPortHandles :80-130, NODE_TYPES :383, DRAG_HANDLE_FOR_TYPE :387-397, rfNodes/rfEdges :541-560, TraceEdge :400-470); src/hosts/tldrawHost.tsx (all — anchors :96-160, the wire overlay :406-500, endPoint :451-470, shape sizing :594-610); src/hosts/hostScene.ts:71-105; src/scene/region.ts:187-201 (ancestorsOf), src/scene/scene.ts:149-151 (portKey); src/stories/SceneHosts.stories.tsx, SceneHostsTldraw.stories.tsx, FitToContentHosts.stories.tsx (assertion patterns per host, dragFrom in hosts/hostGestures.ts); src/stories/controlFlow.acceptance.ts (expectMemberInside). Hosts may import src/scene (they already do); components may not.

BUILD.
1. src/hosts/portDotSightings.ts — additive. PortDotSighting gains ownerId: string (the nearest data-block-id) and handleId: string (portId when ownerId === nodeId, else portKey(ownerId, portId)). sightPortDots(root, nodeId, options?: { members?: boolean }): with members absent/false the result is BYTE-IDENTICAL to today (own dots only); with members: true also returns dots whose owner is a nested [data-block-id] inside root at any depth, deduped by handleId, collapsed stand-ins included. WHY at the seam: the canvas hosts route to ANCHORS, and a member's dot is an anchor of the top-level node it lives in; hostScene.ts:75-82 recorded the gap as a finding and this closes it.
2. src/hosts/reactFlowHost.tsx: measurePortDots calls sightPortDots(root, nodeId, { members: true }) and MeasuredPortHandles mounts <Handle id={h.handleId} …/> pairs (own dots keep id = portId, so nothing existing moves). rfEdges: for each edge end whose node has a parentId, re-point to its top-level ancestor (ancestorsOf(scene, id).at(-1) ?? id) with handle portKey(memberId, portId); ends on top-level nodes unchanged; keep the edge object's id/data. Add region: BboxNode to NODE_TYPES and region: `[${OWN_DRAG_HANDLE_ATTR}]` to DRAG_HANDLE_FOR_TYPE (WHY: a region's own header is its corner card's — ownHeaderOf already resolves [data-block-id=<region id>] to it once lane A lands; harmless before). Keep useUpdateNodeInternals semantics (call after member handles change).
3. src/hosts/tldrawHost.tsx: anchors are reported keyed by handleId; endPoint(blockId, portId): shapeNodeId = top-level ancestor of blockId (from scene via ancestorsOf), handleId = blockId === shapeNodeId ? portId : portKey(blockId, portId), then the existing transform math against shapeIdForNode(shapeNodeId). Members' anchors come from the same sightPortDots(root, nodeId, { members: true }) call the shape component already makes.
4. src/stories/ControlFlowHostEdges.stories.tsx (title "Control Flow/Host Edges", tags ["area:control-flow","lane:control-flow"]): a scene = HOST_SCENE plus a right port on kid and two edges e-kid-in: src/out → kid/in (add a small src block) and e-kid-out: kid/out → sink/cfg, rendered in ReactFlowHost (defaultViewport {x:0,y:0,zoom:1}) and TldrawHost. Plays: expectMemberInside(root,'[data-scene-node="proc"]',"kid"); RF: the edge element for e-kid-in exists (verify what attribute React Flow stamps — .react-flow__edge[data-id=…] or similar) and its path's END point (getPointAtLength(getTotalLength()), converted to screen space with getScreenCTM) is within 14px of kid's in dot centre ([data-block-id="kid"] [data-port-id="in"] getBoundingClientRect centre), measured; tldraw: the overlay's trace for e-kid-in exists (find how SceneHostsTldraw.stories.tsx locates a wire and reuse that selector) and its end is within 14px of the same dot. Third story MemberEdgeSurvivesDrag (RF): drag proc by ITS OWN header with dragFrom (see MemberHeaderDoesNotDragParent in SceneHosts.stories.tsx for the marker), re-measure — still within 14px. First testing-library call in each play is findBy*/waitFor.
5. GATE: pnpm typecheck; pnpm test — every pre-existing host story green (SceneHosts, SceneHostsTldraw, FitToContentHosts, DragPolicy, ValuePresetHosts, GlyphHosts, CodeEditorHosts, BlockPortHosts, ValidationHosts), yours green; A/D/E acceptance unit files remain red and you say so. Commit with pathspecs; report story ids.

DO NOT TOUCH: nodeViews.tsx, domCanvas.tsx, hostScene.ts, regionScene.ts (lanes A/E); wireLayer.tsx, wiring.ts, sceneWires.ts (lane D); anything in src/components or src/scene.

WHY COMMENTS: at the sighting option (own-dot behaviour byte-identical when off; ownership rule reused from wireLayer.tsx:80-92); at rfEdges' re-pointing (a member is a block whose dots the host now sights — it changes where a wire ANCHORS, never what it means); at endPoint's ancestor resolution.

## Contracts of this stream (for reference; the plan .md has the full context)

### C1 Region scene shape
_owner: bbox-ui control-flow (lane A) · consumers: lane B, lane C, lane E, stream 2 (apps/systemsketch), stream 3 (pyblocks to_systemsketch)_

```
// A region: ONE node. Its ports are the corner block's ports. Never a definitionId.
{ id: string, type: "region", position: {x,y}, parentId?: string,
  data: { name?: string,                                   // the corner block's header
          region: { kind: "loop"|"branch"|"group", view?: "expanded"|"opaque" /* default expanded */,
                    loop?: "for"|"while", activeArm?: string },
          ports?: Partial<Record<"left"|"right"|"top"|"bottom", string[]>>,  // for: {left:["Iterable"], right:["Iter"]}; while: {left:["Bool"]}; branch: {left:[<conditions>]} (NO right wall)
          w?: number, h?: number,                          // the FRAME; corner hugs at REGION_CORNER_WIDTH_PX=160
          badge?: string } }                               // header chip, e.g. "iteration 3 of 7"
// An arm: a node whose parent is the region; its own position is derived and never read.
{ id: string, type: "arm", parentId: <regionId>, position: {x:0,y:0}, data: { name?: string, arm?: { open?: boolean /* default true */, h?: number /* body px, default 180 */ } } }
// A block inside an arm or a loop body: position in the PARENT's (arm's / loop's) space — scene.ts:60-72 unchanged.
{ id, type: "block", parentId: <armId|regionId>, position, data: { ..., marks?: ("break"|"continue"|"pass")[] } }
// Edges are ordinary SceneEdges. The EXPANDED document has DIRECT crossing cables (V1): outside -> child.
// The region's own interface is wired like any port: src/others -> loop/Iterable ; loop/Iter -> merge/other (port-inner, private).
// Carried value: { source: n, sourceHandle: "Pose", target: n, targetHandle: "pose", data: { variant: "delayed", routing: "elbow", badge?: "z⁻¹ = seed" } }
// Pure queries (src/scene/controlFlow.ts): ARM_NODE_TYPE="arm", isArm, armsOf, bodyChildrenOf, armOf, hiddenSummary -> {nodes, arms, edges}, describeHidden -> "2 blocks · 2 arms · 3 edges hidden" | "nothing hidden"
// Host vocabulary (src/hosts/regionScene.ts): RegionData, ArmData, regionViewOf, isOpaqueRegion, setRegionView, toggleRegionView, projectHostScene
```

### C2 Region component props + DOM contract
_owner: bbox-ui control-flow (lane A) · consumers: lane E, stream 2 (apps/systemsketch), registry consumers (lane F item `region`)_

```
export interface RegionArm { id: string; title: ReactNode; open: boolean; onOpenChange?(open: boolean): void; active?: boolean; bodyHeight?: number; members?: BlockMember[] }
export interface RegionProps {
  id: string;                          // data-region-id on root AND frame — NEVER data-block-id
  kind?: "loop" | "branch" | "group";  // data-region-kind only
  view?: "expanded" | "opaque";        // default expanded
  corner: ReactNode;                   // the REAL Block: a BlockPort whose id === this region's id
  cornerSize?: { w: number; h: number };
  width?: number; height?: number;     // the frame; height omitted = hug via regionLayout
  members?: BlockMember[];             // BlockMembers layout="free"
  arms?: RegionArm[];
  className?: string; style?: CSSProperties;
}
// DOM:
// [data-slot="region"][data-region-id][data-region-kind][data-region-view]
//   expanded: [data-slot="region-frame"] (1px border, transparent fill, radius var(--bbox-skin-radius, var(--radius-lg)), overflow visible)
//     [data-slot="region-corner"] > BlockPort[data-block-id=<id>]  at the frame's top-left, borders coincident; Block top-right & bottom-left radii 0px
//     [data-slot="region-body"]
//     [data-slot="region-arm"][data-arm-id][data-open][data-active] > [data-slot="region-arm-header"] ([data-slot="folding-chevron"] + title) , [data-slot="region-arm-body"] (absent/0px when folded)
//   opaque: root wraps ONLY `corner` (a wider card, REGION_CARD_WIDTH_PX=220, own ports ∪ promoted ports, footer [data-slot="region-hidden"] = describeHidden)
// Constants (src/components/region.layout.ts): REGION_ARM_HEADER_PX=32, REGION_ARM_DEFAULT_BODY_PX=180, REGION_ARM_MIN_BODY_PX=48, REGION_BODY_MIN_PX=120, REGION_PAD_BOTTOM_PX=12, REGION_MIN_WIDTH_PX=240, REGION_ARM_FADE_OPACITY=0.18, REGION_CORNER_WIDTH_PX=160, REGION_CARD_WIDTH_PX=220
// regionLayout({width, height?, corner:{w,h}, arms?:[{id, open, bodyHeight?}]}) -> { width, height, corner:{x:0,y:0,w,h}, body:{x:0,y:corner.h,w,h}, arms:[{id,index,open,rowTop,headerTop,bodyTop,bodyHeight,bottom}] }
```

### C3 Opaque projection
_owner: bbox-ui control-flow (lane E) · consumers: lane F, stream 2 (apps/systemsketch paints projected edges)_

```
export interface ProjectOpaqueOptions<N> { isOpaque: (node: SceneNode<N>) => boolean; directionOf?: PortDirectionOf; typeOf?: PortTypeOf; mintPortId?: (inner: ScenePortRef) => string /* default portKey(inner.nodeId, inner.portId) */ }
export interface OpaqueRegionView { regionId: string; ports: PromotedPort[]; hidden: HiddenSummary }
export interface RegionProjection<N,E> { nodes: SceneNode<N>[] /* SAME array */; edges: SceneEdge<E>[] /* scene.edges itself when nothing is opaque */; regions: OpaqueRegionView[] /* outermost opaque only, scene order */ }
export function projectOpaqueRegions<N,E>(scene: BlockScene<N,E>, options: ProjectOpaqueOptions<N>): RegionProjection<N,E>
// Rules per OUTERMOST opaque region R: one end inside R -> that end becomes {R, mintPortId(inner)} (new edge object, same id/data/outer end); both ends inside R (interior) -> dropped; R itself <-> inside (port-inner) -> dropped; port-outer -> SAME object; ends in two different opaque regions -> both re-pointed. Nodes never touched.
// Host wrapper (src/hosts/regionScene.ts): projectHostScene(scene: HostScene): { scene: HostScene, regions: OpaqueRegionView[] } using isOpaqueRegion + hostPolarityOf(scene)
// setRegionView(scene, regionId, view): changes ONLY data.region.view on that node; same edges array; same sibling node objects; same scene object on unknown/non-region/unchanged.
```

### C4 Wire.through / Wire.badge / keepOutsFor / WireStyleData.badge
_owner: bbox-ui control-flow (lane D) · consumers: lane E, lane B, lane F, stream 2 (apps/systemsketch)_

```
export interface Wire { id; from: WireEnd; to: WireEnd; variant?; routing?; markerEnd?; color?;
  through?: readonly string[];   // block/region/arm ids this wire may pass through — the ancestors of both ends (sceneWires derives via ancestorsOf)
  badge?: string }               // pill text riding the wire: "z⁻¹" | "z⁻¹ = seed" | "mut"
export interface KeepOutRect { id: string; x: number; y: number; w: number; h: number }
export function keepOutsFor(wire: Pick<Wire,"from"|"to"|"through">, rects: readonly KeepOutRect[]): {x,y,w,h}[]  // excludes from.blockId, to.blockId, every id in through; input order; new array
// WireStyleData (scene/sceneWires.ts) gains badge?: string; sceneWires derives through and badge (badge defaults to "z⁻¹" for variant "delayed" — Q7 in code)
// WireLayer, routing "elbow": keep-outs = every [data-region-id] frame rect + [data-arm-id] row rect + [data-block-id] rect not already a region frame; obstacles = keepOutsFor(wire, rects); fromBox/toBox = endpoint block rects (corner card for a region end); badges rendered in a DOM sibling [data-slot="wire-badges"] [data-wire-id] [data-slot="trace-badge"]
```

### C5 pyblocks P1 <-> bbox-ui mapping (divergences)
_owner: stream 3 (pyblocks to_systemsketch) · consumers: stream 2 (apps/systemsketch), pyblocks P1 lane (read-only peer, c45d8d1/b0130b1)_

```
| pyblocks P1 | bbox-ui trunk | to_systemsketch rule |
| region block owns ports; HEAD card (NW) = west-wall ports, TAIL card (NE) = east-wall ports | region node owns ports; ONE corner card renders all walls | drop head/tail split; every pyblocks port -> data.ports[side] on the region node |
| `X__inner` twin ports (in-bins + in-bins__inner) | one port id, two faces; expanded document has DIRECT outside->child cables (V1) | `X__inner` -> same id `X` for ports the region genuinely owns (Iterable/Iter/Bool/condition); a value merely passing through (in-bins__inner -> bins.lookup) becomes a DIRECT edge outer producer -> child and the twin pair is deleted |
| no arm nodes; If children directly under region:if (arm implied by lines) | type:"arm" nodes per arm | mint one arm node per If arm (if/elif/else, case …) with data.name = the arm's source header; re-parent each child by line range |
| describeHidden "3 blocks · 2 arms · lines 8–14 hidden" | "3 blocks · 2 arms · 4 edges hidden" | same word order; drop the lines clause |
| role:"discriminant" port | the corner block's condition port (plain id) | discriminant -> a left port on the region node named by the condition |
| kind:"effect" edge; delay:1 | data.color + badge:"mut" from ports.top=["effect:<input>"]; data.variant:"delayed" (+ derived z⁻¹) | effect -> {color:<effect token>, badge:"mut"}; delay:1 -> {variant:"delayed", routing:"elbow"} |
| collapsed state in workspaceState per node key | data.region.view on the node | collapsed -> region.view = "opaque" |
```
