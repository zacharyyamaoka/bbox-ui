# Lane cf:B — Loop preset: for / while factories, fixtures, stories

_Stream plan: `docs/CONTROL-FLOW-PLAN.md` (read it) · repo: **bbox-ui** · dispatcher-resolved dependencies: ['cf:A', 'cf:D'] · barrier: False_

## Write set (the ONLY paths you may create or edit)
- `apps/storybook-basics/src/presets/loop/loop.ts`
- `apps/storybook-basics/src/presets/loop/loop.fixtures.ts`
- `apps/storybook-basics/src/presets/loop/loop.test.ts`
- `apps/storybook-basics/src/stories/ControlFlowLoop.stories.tsx`

## Do not touch
- apps/storybook-basics/src/scene/controlFlow.test.ts
- apps/storybook-basics/src/scene/regionView.test.ts
- apps/storybook-basics/src/components/region.layout.test.ts
- apps/storybook-basics/src/components/wiring.test.ts
- apps/storybook-basics/src/hosts/regionScene.test.ts
- apps/storybook-basics/src/stories/controlFlow.acceptance.ts
- apps/storybook-basics/src/components/
- apps/storybook-basics/src/scene/
- apps/storybook-basics/src/hosts/
- apps/storybook-basics/src/presets/value/
- apps/storybook-basics/src/presets/branch/
- docs/build_menu_registry_items.py
- registry.json
- packages/
- apps/docs/
- /home/bam/systemsketch
- /home/bam/pyblocks
- /home/bam/zach_brain

## Acceptance (assertions you cannot edit)
- loop.test.ts (builder's own) proves: forLoopNode → type 'region', region {kind:'loop', loop:'for'}, ports {left:['Iterable'], right:['Iter']}, never a definitionId; whileLoopNode → ports {left:['Bool']} and NO right wall; carriedValueEdge → same node both ends, variant 'delayed', routing 'elbow', badge 'z⁻¹ = <seed>' only when a seed is given
- ControlFlowLoop/ForLoopEmpty: expectRegionExpanded + expectCornerPorts({left:['Iterable'], right:['Iter']})
- ControlFlowLoop/ForLoopCarried: expectMemberInside('[data-slot="region-body"]','merge'); expectWirePainted for e-iter, e-seed, e-out; expectWireBadge('e-carry','z⁻¹ = estimate()'); expectWireAvoids('e-carry','[data-block-id="merge"] [data-slot="block"]') (the last two need lane D — if not merged, keep them and report FAIL by story name)
- ControlFlowLoop/WhileLoopRecheck: expectCornerPorts({left:['Bool']}); NO [data-slot="block-port-rail"][data-edge="right"] inside the corner; expectWirePainted('e-recheck')
- ControlFlowLoop/LoopWithTurn: the corner header's badge reads exactly 'iteration 3 of 7'; LoopWithBreak: expectControlMark('check','break')
- ControlFlowLoop/ForLoopReactFlow: FOR_LOOP_CARRIED in ReactFlowHost passes expectRegionExpanded + expectMemberInside
- pnpm typecheck exit 0; pnpm test all green except assertions explicitly named as blocked on D

Acceptance test files (committed before you existed; read them, never edit them):
- `apps/storybook-basics/src/stories/controlFlow.acceptance.ts`

## Builder brief (verbatim from the planner)

You are building lane B (wave 1, after lane A has merged; lane D's badge/bypass assertions are the only ones that also need D) of docs/CONTROL-FLOW-PLAN.md in the bbox-ui monorepo, worktree cut from the integration branch AFTER lane A's merge. `pnpm install --filter bbox-storybook-basics...`; never `git add -A`. The acceptance files in plan §7 are READ-ONLY; you write your OWN unit test file loop.test.ts.

WHAT THIS LANE IS: the for-loop and while-loop presets. A preset here is DATA over the generic Region: scene-node factories + HostScene fixtures + stories. There is no LoopRegion component — nodeViews' region case (lane A) draws the corner block from data.ports and the body from bodyChildrenOf. The design rulings: DP - Loop's header contract is typed and UNNAMED (for = Iterable in / Iter out; while = Bool in, NO item outlet — "the body owns the values it carries"); the carried value is a DATA cable that is merely delayed — dotted, with a z⁻¹ pill that names the seed — drawn on the bottom lane ("go to the end first, then loop back" is format, not semantics); break is a MARK beside the call (B5), never a cable; Q7: the pill is always drawn (sceneWires derives it).

READ FIRST: plan §0–§3, §4 (loop rows), §5, §12, Appendix B; src/hosts/hostScene.ts (HostNodeData.region/badge/marks; HOST_SCENE as fixture style); src/hosts/regionScene.ts (RegionData, LoopKind); src/presets/value/value.tsx:1-45 (the preset precedent — "a PRESET of components that already exist, not a component of its own"); src/hosts/nodeViews.tsx after lane A (the region case); src/stories/ControlFlowRegion.stories.tsx (lane A's stories — copy their shape, tags, findBy-first plays); src/stories/controlFlow.acceptance.ts (all). Vault (read-only): /home/bam/zach_brain/Projects/bbox-ui/Components/DP - Loop.md, DP - Break & Continue.md. Images (Read tool): /home/bam/zach_brain/Pasted image 20260918145132.png, "Pasted image 20260918145709.png" (the loop with merge(), 'iteration 3 of 7', the dotted z⁻¹ bottom lane, the seed from estimate() outside), "Pasted image 20260918145125.png" (While Loop with condition inputs on a real block), "Pasted image 20260903175205.png" (while + break). Donor (read-only): /home/bam/systemsketch/src/loop/loopModel.ts:1-70.

BUILD.
1. src/presets/loop/loop.ts — pure factories, no React: export const LOOP_PORT_IDS = { iterable: "Iterable", iter: "Iter", bool: "Bool" } as const (the id IS the type label — typed, unnamed). forLoopNode({ id, name = "For Loop", position, w = 400, h = 300, view = "expanded", badge?, parentId? }): SceneNode<HostNodeData> → type "region", data.region = { kind: "loop", loop: "for", view }, data.ports = { left: ["Iterable"], right: ["Iter"] }, data.w/h/name/badge, parentId when given, NEVER definitionId. whileLoopNode(...) → loop "while", ports = { left: ["Bool"] } (no right wall). carriedValueEdge({ id, nodeId, from, to, seed? }): SceneEdge<WireStyleData> → { source: nodeId, sourceHandle: from, target: nodeId, targetHandle: to, data: { variant: "delayed", routing: "elbow", ...(seed ? { badge: `z⁻¹ = ${seed}` } : {}) } }. Unit-test in loop.test.ts (shape; no definitionId; while has no right wall; carried edge shape with/without seed).
2. src/presets/loop/loop.fixtures.ts — HostScene literals (every member type "block", view "port", explicit w/h, positions in the loop's space; outside blocks top-level): FOR_LOOP_EMPTY; FOR_LOOP_CARRIED (the sketch: outside run() with right port others, outside estimate() with right port pose, outside encode() with left port pose; the loop; inside merge() left ["pose","other"] right ["Pose"] and smooth() left ["fused"] right ["Pose"]; edges e-iterable run/others→loop/Iterable, e-iter loop/Iter→merge/other, e-seed estimate/pose→merge/pose, e-ms merge/Pose→smooth/fused, e-out smooth/Pose→encode/pose, e-carry = carriedValueEdge({id:"e-carry", nodeId:"merge", from:"Pose", to:"pose", seed:"estimate()"})); WHILE_LOOP_RECHECK (outside cond with right port ok → loop/Bool as e-cond; inside step() → check(); check/ok → loop/Bool as e-recheck with data {variant:"delayed", routing:"elbow"} — the visible re-check); LOOP_WITH_TURN (badge "iteration 3 of 7"); LOOP_WITH_BREAK (check carries marks ["break"]).
3. src/stories/ControlFlowLoop.stories.tsx (title "Control Flow/Loop", tags ["area:control-flow","lane:control-flow"]), DomCanvas unless named, stateful wrapper as in SceneHosts.stories.tsx: ForLoopEmpty → expectRegionExpanded, expectCornerPorts(root, id, { left: ["Iterable"], right: ["Iter"] }); ForLoopCarried → the above + expectMemberInside(root,'[data-slot="region-body"]',"merge"), expectWirePainted for e-iter, e-seed, e-out, expectWireBadge(root,"e-carry","z⁻¹ = estimate()"), expectWireAvoids(root,"e-carry",'[data-block-id="merge"] [data-slot="block"]') (these two need lane D — if D is not in your base, keep the assertions and report FAIL for that story by name); WhileLoopRecheck → expectCornerPorts(root,id,{ left: ["Bool"] }) and assert NO [data-slot="block-port-rail"][data-edge="right"] inside the corner, expectWirePainted("e-recheck"); LoopWithTurn → the corner header contains a badge element (check badge.tsx's data-slot) reading exactly "iteration 3 of 7"; LoopWithBreak → expectControlMark(root,"check","break"); ForLoopReactFlow → FOR_LOOP_CARRIED in ReactFlowHost (defaultViewport {x:0,y:0,zoom:1}) with expectRegionExpanded + expectMemberInside. First testing-library call in each play is findBy*/waitFor.
4. GATE: pnpm typecheck; pnpm test — all green except assertions you name as blocked on D. Commit with pathspecs; report the story ids.

DO NOT TOUCH: anything in src/components, src/scene, src/hosts; presets/value; presets/branch (lane C); docs/build_menu_registry_items.py and registry.json (lane F).

WHY COMMENTS: at LOOP_PORT_IDS (typed unnamed — donor loopModel.ts:55-70 "a type and nothing else"); at whileLoopNode's missing right wall (DP - Loop); at carriedValueEdge (data, delayed, seed in the pill, elbow so it takes the bottom lane; no z⁻¹ when unset because sceneWires derives it — Q7).

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
