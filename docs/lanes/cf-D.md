# Lane cf:D — Wires: keep-outs (bypass), endpoint boxes, badges

_Stream plan: `docs/CONTROL-FLOW-PLAN.md` (read it) · repo: **bbox-ui** · dispatcher-resolved dependencies: none (day-0) · barrier: False_

## Write set (the ONLY paths you may create or edit)
- `apps/storybook-basics/src/components/wiring.ts`
- `apps/storybook-basics/src/components/wireLayer.tsx`
- `apps/storybook-basics/src/scene/sceneWires.ts`
- `apps/storybook-basics/src/scene/sceneWires.test.ts`
- `apps/storybook-basics/src/components/trace.tsx`
- `apps/storybook-basics/src/stories/ControlFlowWires.stories.tsx`

## Do not touch
- apps/storybook-basics/src/components/wiring.test.ts
- apps/storybook-basics/src/scene/controlFlow.test.ts
- apps/storybook-basics/src/scene/regionView.test.ts
- apps/storybook-basics/src/components/region.layout.test.ts
- apps/storybook-basics/src/hosts/regionScene.test.ts
- apps/storybook-basics/src/stories/controlFlow.acceptance.ts
- apps/storybook-basics/src/components/elbow/
- apps/storybook-basics/src/components/trace.routing.ts
- apps/storybook-basics/src/components/trace.tidy.ts
- apps/storybook-basics/src/hosts/
- apps/storybook-basics/src/scene/ (everything except sceneWires.ts and your new sceneWires.test.ts)
- apps/storybook-basics/src/components/region.tsx
- packages/
- apps/docs/
- /home/bam/systemsketch
- /home/bam/pyblocks
- /home/bam/zach_brain

## Acceptance (assertions you cannot edit)
- pnpm exec vitest --project=unit run src/components/wiring.test.ts → all green (keepOutsFor excludes from/to/through ids, keeps order, strips ids, never returns the input array; fanWires unaffected)
- ControlFlowWires/BypassAroundABlock: expectWirePainted('e') and expectWireAvoids('e', '[data-block-id="bystander"]') — sampled every 4px along the REAL rendered path, zero points inside the box
- ControlFlowWires/CarriedValueSelfLoop: expectWireBadge('e-carry','z⁻¹') (derived, no badge authored) and expectWireAvoids('e-carry','[data-block-id="merge"] [data-slot="block"]')
- ControlFlowWires/ThroughAContainer: the wire into member kid is painted (through includes proc); a second wire to a far block avoids proc
- ControlFlowWires/MutEffectCable: expectWireBadge(id,'mut') on a wire off a top-wall port; BadgeWithSeed renders 'z⁻¹ = estimate()' verbatim
- Non-elbow wires are byte-identical to before: BlockWiring, AsyncRegion, WireLayerOwnership, CollapseWireEndpoints and every Trace* story stay green
- pnpm typecheck exit 0; pnpm test — all pre-existing stories green; wiring.test.ts green; A/E acceptance unit files remain red and are named as such in the report

Acceptance test files (committed before you existed; read them, never edit them):
- `apps/storybook-basics/src/components/wiring.test.ts`
- `apps/storybook-basics/src/stories/controlFlow.acceptance.ts`

## Builder brief (verbatim from the planner)

You are building lane D (day-0, runs in parallel with lanes A and G) of docs/CONTROL-FLOW-PLAN.md in the bbox-ui monorepo, worktree cut from claude/control-flow-integration-2026-09-18 AFTER commit 062c2b5. Run `pnpm install --filter bbox-storybook-basics...` once; work under apps/storybook-basics/src; never `git add -A`; stage explicit pathspecs. The acceptance files (src/components/wiring.test.ts and src/stories/controlFlow.acceptance.ts, plus the other four listed in the plan §7) are READ-ONLY — if one cannot pass, report FAIL with the reason.

WHAT THIS LANE IS: Zach's rule — "data cables that aren't flowing through the branch should actively avoid the branch — bypass by going above or below it." The elbow router already takes keep-outs (TraceRouteRequest.obstacles/fromBox/toBox at src/components/trace.tsx:630-651; elbow/collisionRouting.ts:101-115 routeClearsObstacles); what is missing is the ~60-line collector docs/REMAINING-2026-09-17.md §2.6 named, which was blocked on the wire layer that has since landed. You also mount the z⁻¹ / mut pill on wires. No region component is needed for this lane: the keep-out rule is generic and you prove it on plain blocks.

READ FIRST: plan §3.5, §4 (wire rows), §5, Appendix D; src/components/wiring.ts (all — keepOutsFor's stub and the new Wire.through / Wire.badge fields are yours to implement; types are frozen); src/components/wireLayer.tsx (all — resolveDot :80-92, computeState :101-125, render :196-232); src/components/trace.tsx:596-760 (TraceRouteRequest, routeTraceRequest) AND the Trace component's own props list — find whether obstacles, fromBox, toBox and onGeometry are already component props (the header says onGeometry exists; verify by reading); src/components/elbow/collisionRouting.ts:60-160 (what an obstacle does), elbow/traceContract.ts:25-60; src/components/traceBadge.tsx:1-120 (props points, t, value, variant, size — DOM not SVG; traceMark.tsx:190-200 explains the coordinate space: the trace's offsetParent padding box); src/scene/sceneWires.ts (all), src/scene/region.ts:187-201 (ancestorsOf); src/stories/TraceTidy.stories.tsx:60-140 and :1080-1120 (how a story passes obstacles today); src/stories/BlockWiring.stories.tsx (a WireLayer bench); src/stories/controlFlow.acceptance.ts (expectWireAvoids, expectWirePainted, expectWireBadge, expectControlMark — read what DOM they expect). Note wireLayer.tsx's own header on why the layer paints ABOVE blocks and why it never invents a point — keep both.

BUILD.
1. keepOutsFor per its doc: exclude wire.from.blockId, wire.to.blockId and every id in wire.through; map to {x,y,w,h}; input order; always a new array. Gate: pnpm exec vitest --project=unit run src/components/wiring.test.ts green.
2. src/scene/sceneWires.ts: WireStyleData gains `badge?: string`. sceneWires needs the NODES now to derive `through` — widen its parameter to {nodes?: readonly SceneNode[]; edges: …} (`git grep 'sceneWires('` to see every caller — domCanvas.tsx:260, tldrawHost.tsx:453, stories — all pass a whole scene; an edges-only caller keeps working with `through: []`). through = unique [...ancestorsOf(scene, source), ...ancestorsOf(scene, target)]; badge = edge.data?.badge ?? (edge.data?.variant === "delayed" ? "z⁻¹" : undefined) — WHY: Q7's default ("always draw the pill"), in code. Add your own unit test file src/scene/sceneWires.test.ts for through/badge derivation.
3. src/components/wireLayer.tsx: in computeState, when wire.routing === "elbow", build the keep-out list once per pass: every [data-region-id] element's frame rect ([data-slot="region-frame"] inside it, keyed by the region id), every [data-slot="region-arm"][data-arm-id] rect, and every [data-block-id] rect NOT already keyed as a region frame (a region's corner card shares the id — the frame is the keep-out); rects in container space (reuse centreOf's math). Per wire: obstacles = keepOutsFor(wire, rects); fromBox/toBox = the [data-block-id] rect of each endpoint (the corner card for a region end — WHY: a self-loop must leave and re-enter around its own block, and the router's start.box/end.box are what make the first/last legs perpendicular). Pass obstacles, fromBox, toBox to Trace. Non-elbow wires: byte-identical to today. Badges: collect each Trace's polyline through onGeometry (store points per wire id in state; if onGeometry is not a Trace prop, add it ADDS-ONLY in trace.tsx mirroring TraceGeometry.points and label the addition), render <div data-slot="wire-badges" style={{position:"absolute", inset:0, pointerEvents:"none"}}> AFTER the <svg>, containing <div data-wire-id={id}><TraceBadge points value={wire.badge} t={0.5} size="sm" variant="outline"/></div> for each wire that has a badge and resolved points. Also stamp data-wire-from={`${from.blockId}/${from.portId}`} on each wire's <g> (expectControlMark reads it). WHY at the seam: badges are DOM, not SVG (traceBadge.tsx's header), so they live in a sibling layer keyed by wire id.
4. src/stories/ControlFlowWires.stories.tsx (title "Control Flow/Wires", tags ["area:control-flow","lane:control-flow"]), all on DomCanvas with HostScene fixtures written inline (type:"block", view:"port", explicit w/h): BypassAroundABlock — src (right port out) at x 0, bystander block at x 220 between, enc (left port in) at x 520; edge e with data.routing "elbow"; play: expectWirePainted(root,"e"), expectWireAvoids(root,"e",'[data-block-id="bystander"]'). CarriedValueSelfLoop — one block merge with left ["pose","other"], right ["Pose"]; edge e-carry Pose→pose, data {variant:"delayed", routing:"elbow"} (no badge authored); play: expectWireBadge(root,"e-carry","z⁻¹"), expectWireAvoids(root,"e-carry",'[data-block-id="merge"] [data-slot="block"]'). ThroughAContainer — proc expanded with member kid (as HOST_SCENE does) plus an outside src wired to kid/in with elbow routing, plus a second elbow wire from src to a block on the far side of proc; play: the first is painted (through includes proc), the second expectWireAvoids(...,'[data-block-id="proc"]'). MutEffectCable — a block with ports.top ["effect:pose"] wired to another block's left port, edge data {color:"var(--color-amber-600, #d97706)", badge:"mut", routing:"elbow"}; play: expectWireBadge(root,id,"mut"). BadgeWithSeed — data.badge "z⁻¹ = estimate()" renders verbatim (truthful rendering rule).
5. GATE: pnpm typecheck; pnpm test — every pre-existing story green (BlockWiring, AsyncRegion, WireLayerOwnership, CollapseWireEndpoints, all Trace*), wiring.test.ts green, your stories green; the A/E acceptance unit files remain red and you say so. Commit with pathspecs; report story ids and whether you had to add props to trace.tsx.

DO NOT TOUCH: elbow/* (a verbatim port with provenance tests), trace.routing.ts, trace.tidy.ts, anything under src/hosts/ or src/components/region*, any scene file other than sceneWires.ts.

WHY COMMENTS: at keepOutsFor (bypass = avoid everything except my ends and what I flow through; the target arm and its region are in `through`, sibling arms are not — that is DRAKON's "enter an arm only from the shared area" made mechanical); at the frame-vs-card keep-out choice; at the badge sibling layer; at sceneWires' badge default (Q7).

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
