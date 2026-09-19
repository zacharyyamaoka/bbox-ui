# Lane cf:C — Branch preset: if/elif/else, match/case, nested, fold, active

_Stream plan: `docs/CONTROL-FLOW-PLAN.md` (read it) · repo: **bbox-ui** · dispatcher-resolved dependencies: ['cf:A'] · barrier: False_

## Write set (the ONLY paths you may create or edit)
- `apps/storybook-basics/src/presets/branch/branch.ts`
- `apps/storybook-basics/src/presets/branch/branch.fixtures.ts`
- `apps/storybook-basics/src/presets/branch/branch.test.ts`
- `apps/storybook-basics/src/stories/ControlFlowBranch.stories.tsx`

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
- apps/storybook-basics/src/presets/loop/
- docs/build_menu_registry_items.py
- registry.json
- packages/
- apps/docs/
- /home/bam/systemsketch
- /home/bam/pyblocks
- /home/bam/zach_brain

## Acceptance (assertions you cannot edit)
- branch.test.ts (builder's own) proves: branchNode returns the region (type 'region', region {kind:'branch'}, ports {left:<conditions>}, NO right wall, never a definitionId) followed by one type:'arm' node per arm with parentId = region and data.name = title; armsOf finds them in order
- ControlFlowBranch/OneInput: expectRegionExpanded; expectCornerPorts({left:['fast']}); no right rail in the corner; expectArmsStacked(['if','else']); expectMemberInside('[data-arm-id="if"] [data-slot="region-arm-body"]','estimate'); expectWirePainted for all six edges; the two fan-in wires resolve to ONE dot ([data-block-id="encode"] [data-port-id="pose"] is a single element)
- ControlFlowBranch/ManyInputs: three left ports and three arms; MatchCase: arm titles read 'case "go":' etc. verbatim
- ControlFlowBranch/FoldedArm: elif data-open='false'; after userEvent.click on its chevron data-open='true' and the else arm's member rect relative to its own arm body top is unchanged (measured before/after)
- ControlFlowBranch/ActiveArm: the else row has data-active='false' and computed opacity '0.18'
- ControlFlowBranch/Nested: expectRegionExpanded('inner') and the inner region sits inside [data-arm-id="if"]; OneInputReactFlow passes expectRegionExpanded + expectArmsStacked in ReactFlowHost
- pnpm typecheck exit 0; pnpm test all green

Acceptance test files (committed before you existed; read them, never edit them):
- `apps/storybook-basics/src/stories/controlFlow.acceptance.ts`

## Builder brief (verbatim from the planner)

You are building lane C (wave 1, after lane A has merged) of docs/CONTROL-FLOW-PLAN.md in the bbox-ui monorepo, worktree cut from the integration branch AFTER lane A's merge. `pnpm install --filter bbox-storybook-basics...`; never `git add -A`. The acceptance files in plan §7 are READ-ONLY; you write your OWN branch.test.ts.

WHAT THIS LANE IS: the branch preset — if/elif/else and match/case — as DATA over the generic Region (lane A): factories + fixtures + stories. There is no BranchRegion component. Rulings that bind: a branch is a region, not a block; its corner block carries the CONDITION input(s) ONLY and has NO output (Q1 — Zach picked V1 "wires always, no ports on the region" over the yield-dot variant that scored higher, because "yields get messy — then you don't know which of those ports are firing"); the arms' results fan in at the CONSUMER's ordinary port — two sibling-arm cables landing on one port ARE the join; arms are type:"arm" nodes (plan §2.C) with per-arm fold and at most one activeArm (non-active fade 0.18); cables between sibling arms are unrepresentable (armOf is total) — never author one; the title is "Branch" (Q2); match/case maps to the same shape with arms titled case …; case view is NOT built (per-arm fold is the donor's own definition of it).

READ FIRST: plan §0–§3, §4 (arm rows), §5, §12, Appendix C; src/scene/controlFlow.ts (ARM_NODE_TYPE, armsOf, armOf); src/hosts/regionScene.ts (ArmData, RegionData.activeArm); src/hosts/hostScene.ts (HostNodeData); src/hosts/nodeViews.tsx after lane A; src/components/region.layout.ts (constants); src/stories/ControlFlowRegion.stories.tsx (lane A's WithArms story — copy its shape); src/stories/controlFlow.acceptance.ts (all). Vault (read-only): /home/bam/zach_brain/Projects/bbox-ui/Components/DP - Branch.md; "/home/bam/zach_brain/World Model/Chunks & Concepts/C - Branch Region Asymmetry (Scopes See In, Only Yields Come Out).md". Images (Read tool): "/home/bam/zach_brain/Pasted image 20260918143241.png" (ONE input — copy this board exactly), "Pasted image 20260918144504.png" (many inputs: Selector + arm stack), "Pasted image 20260918144705.png" (nested: Switch → arm 1 holds a Selector with its own arms), "Pasted image 20260918145419.png" (the shipped SystemSketch branch with a nested Branch in the elif arm). Donor (read-only): /home/bam/systemsketch/src/branch/branchModel.ts:1-17 and :383-420 (getDefaultBranchProps: arms if/else, activeArmId null).

BUILD.
1. src/presets/branch/branch.ts — pure factories: branchNode({ id, name = "Branch", position, w = 520, h?, conditions = ["cond"], arms, view = "expanded", activeArm?, parentId? }): SceneNode<HostNodeData>[] — returns the region FIRST (type "region", data.region = { kind: "branch", view, ...(activeArm ? {activeArm} : {}) }, data.ports = { left: conditions } and NO right wall, data.name/w/h, parentId when given, NEVER definitionId) followed by one arm node per entry of arms: { id, title, open?, h? }[] → { id, type: "arm", parentId: <region id>, position: {x:0,y:0}, data: { name: title, arm: { open: open ?? true, ...(h ? {h} : {}) } } }. Helpers: ifElifElseArms(["fast", 'mode == "safe"']) → arms titled `if fast:`, `elif mode == "safe":`, `else:` with ids if/elif/else (elif-2… when several); matchCaseArms(['"go"', '"stop"']) → `case "go":`, `case "stop":`, `case _:`. Unit-test in branch.test.ts: no definitionId; no right wall; arms carry parentId; armsOf(scene, id) returns them in order.
2. src/presets/branch/branch.fixtures.ts — HostScene literals: BRANCH_ONE_INPUT (Zach's 143241: outside src with right ports fast, frame, gain; branchNode conditions ["fast"], arms if/else; arm if holds estimate() left ["frame","gain"] right ["Pose"]; arm else holds fallback() left ["frame"] right ["Pose"]; outside encode left ["pose"]; edges e-cond src/fast→br/fast, e-frame1 src/frame→estimate/frame, e-frame2 src/frame→fallback/frame, e-gain src/gain→estimate/gain, e-out1 estimate/Pose→encode/pose, e-out2 fallback/Pose→encode/pose — the two sibling cables landing on ONE port ARE the join; no yield port); BRANCH_MANY_INPUTS (conditions ["input_1","input_2","input_3"], arms arm-1..arm-3 each with one block); MATCH_CASE (matchCaseArms); BRANCH_FOLDED (elif open:false); BRANCH_ACTIVE (activeArm "if"); BRANCH_NESTED (a second branchNode with parentId "if" — the OUTER ARM's id, never the region — and its own two arms with one block each, per 144705). Every member: type "block", view "port", explicit w/h, positions in its arm's space.
3. src/stories/ControlFlowBranch.stories.tsx (title "Control Flow/Branch", tags ["area:control-flow","lane:control-flow"]), DomCanvas with a stateful wrapper unless named: OneInput → expectRegionExpanded(root,"br"), expectCornerPorts(root,"br",{ left: ["fast"] }), assert NO [data-slot="block-port-rail"][data-edge="right"] inside the corner, expectArmsStacked(root,"br",["if","else"]), expectMemberInside(root,'[data-arm-id="if"] [data-slot="region-arm-body"]',"estimate"), expectWirePainted for all six edges, and the fan-in: [data-block-id="encode"] [data-port-id="pose"] is exactly one element and both e-out1/e-out2 are painted; ManyInputs → three left ports, expectArmsStacked with three arms; MatchCase → arm header text reads `case "go":` etc. verbatim (truthful rendering); FoldedArm → expectArmsStacked with elif data-open="false"; then userEvent.click on [data-arm-id="elif"] [data-slot="folding-chevron"] → data-open="true", and the else arm's member rect.top minus its own [data-slot="region-arm-body"] rect.top is unchanged before/after (positions arm-relative — measure, don't assume); ActiveArm → the else row data-active="false" and computed opacity "0.18"; Nested → expectRegionExpanded(root,"inner") and required(root,'[data-arm-id="if"] [data-slot="region"][data-region-id="inner"]'); OneInputReactFlow → BRANCH_ONE_INPUT in ReactFlowHost (defaultViewport {x:0,y:0,zoom:1}) with expectRegionExpanded + expectArmsStacked. First testing-library call in each play is findBy*/waitFor.
4. GATE: pnpm typecheck; pnpm test all green. Commit with pathspecs; report story ids.

DO NOT TOUCH: src/components, src/scene, src/hosts; presets/loop (lane B); registry files (lane F).

WHY COMMENTS: at the missing right wall (Q1/V1 — DP - Branch's quote); at the arm factory (arms are nodes — plan §2.C; pyblocks has no arm nodes yet — plan §12); at BRANCH_NESTED (parentId = the arm, never the region); at the fan-in edges (the join lives at the consumer).

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
