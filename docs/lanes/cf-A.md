# Lane cf:A — Region kit: scene queries, layout, component, host renderer

_Stream plan: `docs/CONTROL-FLOW-PLAN.md` (read it) · repo: **bbox-ui** · dispatcher-resolved dependencies: none (day-0) · barrier: True_

## Write set (the ONLY paths you may create or edit)
- `apps/storybook-basics/src/scene/controlFlow.ts`
- `apps/storybook-basics/src/components/region.layout.ts`
- `apps/storybook-basics/src/components/region.tsx`
- `apps/storybook-basics/src/hosts/nodeViews.tsx`
- `apps/storybook-basics/src/stories/ControlFlowRegion.stories.tsx`
- `CLAUDE.md`

## Do not touch
- apps/storybook-basics/src/scene/controlFlow.test.ts
- apps/storybook-basics/src/scene/regionView.test.ts
- apps/storybook-basics/src/components/region.layout.test.ts
- apps/storybook-basics/src/components/wiring.test.ts
- apps/storybook-basics/src/hosts/regionScene.test.ts
- apps/storybook-basics/src/stories/controlFlow.acceptance.ts
- apps/storybook-basics/src/hosts/hostScene.ts
- apps/storybook-basics/src/hosts/regionScene.ts
- apps/storybook-basics/src/scene/regionView.ts
- apps/storybook-basics/src/components/wiring.ts
- apps/storybook-basics/src/components/wireLayer.tsx
- apps/storybook-basics/src/scene/sceneWires.ts
- apps/storybook-basics/src/hosts/domCanvas.tsx
- apps/storybook-basics/src/hosts/reactFlowHost.tsx
- apps/storybook-basics/src/hosts/tldrawHost.tsx
- apps/storybook-basics/src/hosts/portDotSightings.ts
- apps/storybook-basics/src/components/block.tsx
- apps/storybook-basics/src/components/blockPort.tsx
- apps/storybook-basics/src/components/blockMembers.tsx
- apps/storybook-basics/src/scene/scene.ts
- apps/storybook-basics/src/scene/collapse.ts
- apps/storybook-basics/src/scene/boundary.ts
- apps/storybook-basics/src/scene/region.ts
- apps/storybook-basics/src/components/elbow/
- packages/
- apps/docs/
- /home/bam/systemsketch
- /home/bam/pyblocks
- /home/bam/zach_brain

## Acceptance (assertions you cannot edit)
- pnpm exec vitest --project=unit run src/scene/controlFlow.test.ts → all green (armsOf/bodyChildrenOf/armOf total + cycle-safe; hiddenSummary loop = {nodes:2, arms:0, edges:3}; describeHidden wording)
- pnpm exec vitest --project=unit run src/components/region.layout.test.ts → all green (donor constants 32/180/48; corner at origin; arms stack header→body→bottom; folded=0; hug vs explicit; min clamp; pure)
- ControlFlowRegion stories: EmptyExpanded/WithMembers/InReactFlow pass expectRegionExpanded (corner top-left within 2px of frame; corner Block borderTopRightRadius and borderBottomLeftRadius === '0px'; frame owns no port dot)
- EmptyOpaque passes expectRegionOpaque and footer reads exactly 'nothing hidden'
- WithArms passes expectArmsStacked(['if','elif','else']) with elif data-open='false' and expectMemberInside('[data-arm-id="if"] [data-slot="region-arm-body"]','est'); WithMembers passes expectCornerPorts({left:['Iterable'], right:['Iter']})
- ActiveArm: the non-active row has data-active='false' and computed opacity '0.18'; LayoutTwin: DOM arm rowTop equals regionLayout().arms[i].rowTop within 1px
- CLAUDE.md Story tags list contains control-flow; every story tagged ['area:control-flow','lane:control-flow']; first testing-library call in each play is findBy*/waitFor
- pnpm typecheck exit 0; pnpm test (both projects) — every pre-existing story green; only regionView.test.ts, regionScene.test.ts, wiring.test.ts remain red and are named as other lanes' in the report

Acceptance test files (committed before you existed; read them, never edit them):
- `apps/storybook-basics/src/scene/controlFlow.test.ts`
- `apps/storybook-basics/src/components/region.layout.test.ts`
- `apps/storybook-basics/src/stories/controlFlow.acceptance.ts`

## Builder brief (verbatim from the planner)

You are building lane A (the BARRIER lane — it lands first and alone) of docs/CONTROL-FLOW-PLAN.md in the bbox-ui monorepo, worktree cut from claude/control-flow-integration-2026-09-18 AFTER commit 062c2b5 (the plan + acceptance files). Run `pnpm install --filter bbox-storybook-basics...` once; work under apps/storybook-basics/src unless named; never `git add -A`; stage explicit pathspecs; read `git diff --cached --name-only` before committing. The six acceptance files (src/scene/controlFlow.test.ts, src/scene/regionView.test.ts, src/components/region.layout.test.ts, src/components/wiring.test.ts, src/hosts/regionScene.test.ts, src/stories/controlFlow.acceptance.ts) are READ-ONLY for you — if one cannot pass, report FAIL with the reason instead of editing it.

READ FIRST (cite lines in your WHY comments): docs/CONTROL-FLOW-PLAN.md §0–§3, §5 and Appendix A; src/scene/region.ts (all — regionOf's cycle-safe walk at :165-180 is the pattern for armOf); src/scene/boundary.ts:100-230 (classifyBoundary, BoundaryClass — you use it for hiddenSummary's edge count); src/scene/controlFlow.ts and src/components/region.layout.ts (the STUBS whose bodies you write — keep every exported name, type and constant); src/hosts/nodeViews.tsx (all — BlockNodeView :437-531 is the pattern; SceneNodeView :538-573 is where your case goes); src/hosts/hostScene.ts:25-90 (HostNodeData.region/arm/badge/marks already typed — read-only); src/hosts/regionScene.ts (regionViewOf, RegionData, ArmData are real — import them; do not edit); src/components/block.tsx:68-160 and :282-330 (style spreads AFTER its borderRadius at :321), blockPort.tsx:93-200 and :328-360, blockMembers.tsx:55-200, bar.tsx:58-91, foldingChevron.tsx, badge.tsx:31-71, paintOrder.ts; src/hosts/memberDrag.ts:47-100; src/stories/SceneHosts.stories.tsx:1-82 and FitToContentHosts.stories.tsx:1-60 (story shape, required(), tags); src/stories/controlFlow.acceptance.ts (ALL — the assertions your stories must call). Donor for arm rows (read-only): /home/bam/systemsketch/src/branch/branchModel.ts:161-230, BranchCanvas.tsx:1-120. Open with the Read tool: /home/bam/zach_brain/Pasted image 20260918150916.png (OLD BAD header ports / NEW GOOD a real block in the frame's corner), "Pasted image 20260918192040.png" (React Flow UI's Labeled Group Node: thin rounded frame, transparent fill, label chip INSIDE the frame at its top-left sharing the frame's rounding, square where it meets the frame — our chip is a whole Block), "Pasted image 20260918144504.png" (arm rows), "Pasted image 20260918143241.png" (a real branch).

RULINGS THAT BIND: a region is ONE node whose ports are its corner block's (plan §2.A); the frame carries scope and NO value ports; the region root and frame carry data-region-id and NEVER data-block-id (wireLayer.tsx:81 resolveDot takes the first [data-block-id] in document order — the corner card owns the id); arms are type:"arm" nodes and a child's position is in its arm's space (scene.ts:60-72); non-active arms fade to 0.18 (donor branchModel.ts:38-39, one token); break/continue are MARKS never cables (DP - Break & Continue B5); no z-index on a node root (CLAUDE.md z-order section).

BUILD IN THIS ORDER.
1. src/scene/controlFlow.ts bodies: armsOf = childrenOf(scene,id).filter(isArm); bodyChildrenOf = the complement; armOf = regionOf's walk with isArm; hiddenSummary: nodes = descendantsOf(scene,[id]) minus the region minus arms, arms = armsOf().length, edges = classifyBoundary(scene,{containerId:id}).edges with kind in {"interior","port-inner"}; unknown id → zeros; describeHidden per its doc ("2 blocks · 2 arms · 3 edges hidden", singular at 1, "nothing hidden"). Gate: pnpm exec vitest --project=unit run src/scene/controlFlow.test.ts green.
2. src/components/region.layout.ts regionLayout exactly as region.layout.test.ts pins it (corner at origin; body under it; rows stack rowTop→header→body(open?h:0)→bottom→next rowTop; folded=0; height = explicit if ≥ needed else last bottom + REGION_PAD_BOTTOM_PX, no arms → corner.h + REGION_BODY_MIN_PX; open body clamped to REGION_ARM_MIN_BODY_PX; pure). Gate: that test green.
3. src/components/region.tsx — export Region with the props in plan §3.2 (RegionArm {id,title,open,onOpenChange?,active?,bodyHeight?,members?}; RegionProps {id, kind?, view?, corner, cornerSize?, width?, height?, members?, arms?, className?, style?}). Frame: div[data-slot="region-frame"] position relative, width/height from regionLayout, border 1px solid var(--border), borderRadius var(--bbox-skin-radius, var(--radius-lg)), transparent background, overflow visible. Corner: div[data-slot="region-corner"] absolutely at top:-1px left:-1px wrapping `corner`; make the corner Block's top-right and bottom-left radii 0px and its top-left the frame's — either a wrapper class using Tailwind's `!` important suffix on [&_[data-slot=block]] or export REGION_CORNER_BLOCK_STYLE and apply it in nodeViews (the acceptance measures getComputedStyle(...).borderTopRightRadius === "0px", not the mechanism; leave a WHY naming block.tsx:321 if you use style). Measure the corner's size with a ResizeObserver in a useLayoutEffect (skip when cornerSize is given) and feed regionLayout; first paint may use {w: REGION_CORNER_WIDTH_PX, h: 0} and correct within a frame — say so in a WHY (the same device as tldrawHost.tsx's first-frame guess). Body: div[data-slot="region-body"] at layout.body rendering <BlockMembers layout="free" members gap gutter insetBackground="none" showMembers showCards={false}/>. Arms: one div[data-slot="region-arm"][data-arm-id][data-open][data-active] per arm at layout.arms[i] (absolute top:rowTop, height: bottom-rowTop, full width); header div[data-slot="region-arm-header"] = <Bar size="sm" left={<><FoldingChevron open onClick={() => onOpenChange?.(!open)}/> {title}</>}/> with a 1px top divider for index>0; body div[data-slot="region-arm-body"] rendered only when open (height bodyHeight) with BlockMembers layout="free"; a non-active arm gets style opacity REGION_ARM_FADE_OPACITY. Opaque: the root renders `corner` alone. Never stamp data-block-id on root or frame. No scene import (layering.test.ts import wall).
4. src/hosts/nodeViews.tsx: add case "region" → RegionNodeView. region = node.data.region ?? {kind:"group"}; view = regionViewOf(node). Corner card = <BlockPort id={node.id} view="port" edges={from data.ports exactly as BlockNodeView builds them, withWiredState, onItemsChange via reorderNodePorts}><Block header={header} width={REGION_CORNER_WIDTH_PX}/></BlockPort>, where header is the plain node.data.name string UNLESS node.data.badge is set, then <Bar size="md" left={name} right={<Badge size="sm" variant="secondary">{badge}</Badge>}/> (WHY: zero DOM change for every existing story). Members: bodyChildrenOf(scene,node.id) → free BlockMembers with useFreeMemberDrag/moveMember/POINTER_OWNED_CLASS exactly like BlockNodeView's free branch (extract a shared freeMemberOf helper inside this file, don't copy-paste). Arms: armsOf(scene,node.id) → {id, title: arm.data.name ?? arm.id, open: arm.data.arm?.open ?? true, onOpenChange: onSceneChange && (open => onSceneChange(writeNodeData(scene, arm.id, {arm:{...arm.data.arm, open}}))), active: region.activeArm === undefined || region.activeArm === arm.id, bodyHeight: arm.data.arm?.h, members: childrenOf(scene, arm.id) → free members with their own drag}. Opaque (this lane): <Region view="opaque" corner={card with own ports + footer}/> where Block gets width={REGION_CARD_WIDTH_PX} and footer={<span data-slot="region-hidden">{describeHidden(hiddenSummary(scene,node.id))}</span>}; leave a `// lane E: promoted ports + toggle land here` marker. Control marks: in BlockNodeView (and the corner), when node.data.marks?.length the header becomes the Bar form with one <Badge data-slot="control-mark" data-mark={mark} size="sm" variant="outline"> per mark (break = a lucide stop glyph + "break"; continue = RotateCw + "continue"; pass = text). WHY: B5, a mark never a cable.
5. src/stories/ControlFlowRegion.stories.tsx: title "Control Flow/Region", tags ["area:control-flow","lane:control-flow"]. Stories with play: EmptyExpanded (DomCanvas, one group region 400×260, no children) → expectRegionExpanded; EmptyOpaque (region.view "opaque") → expectRegionOpaque + footer text exactly "nothing hidden"; WithMembers (two port-view blocks inside a loop-kind region with ports {left:["Iterable"], right:["Iter"]}) → expectRegionExpanded, expectCornerPorts(root,id,{left:["Iterable"],right:["Iter"]}), expectMemberInside(root,'[data-slot="region-body"]',"merge"); WithArms (branch kind, arms if/elif(folded)/else, a block in if and one in else) → expectArmsStacked(root,id,["if","elif","else"]), expectMemberInside(root,'[data-arm-id="if"] [data-slot="region-arm-body"]',"est"); ActiveArm (activeArm "if") → the else row has data-active="false" and computed opacity "0.18"; InReactFlow (WithMembers scene in ReactFlowHost, defaultViewport {x:0,y:0,zoom:1}) → expectRegionExpanded; LayoutTwin → each arm's getBoundingClientRect().top - frame.top equals regionLayout(...).arms[i].rowTop within 1px. First testing-library call in every play is findBy*/waitFor.
6. CLAUDE.md: add `control-flow` to the closed area: vocabulary list in "Story tags"; add a short "## Control flow" section pointing at docs/CONTROL-FLOW-PLAN.md and stating the one rule (region root/frame carry data-region-id; the corner card alone carries data-block-id).

GATE: pnpm typecheck exit 0; pnpm test inside apps/storybook-basics — every pre-existing story green, controlFlow.test.ts + region.layout.test.ts green, your stories green; regionView.test.ts / regionScene.test.ts / wiring.test.ts stay red (lanes D and E) and you say so in your report. Commit with explicit pathspecs; report the story ids and the gate output.

WHY COMMENTS to leave: region.tsx header (one node = corner + frame, plan §2.A; the data-block-id rule citing wireLayer.tsx:81); at the arm row (positions arm-relative — scene.ts:60-72; arms as nodes — plan §2.C; donor branchArmFrames.ts:56-61); at the fade (branchModel.ts:38-39); in nodeViews.tsx at the header-string-vs-Bar branch (zero DOM change) and at the control-mark badge (B5).

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
