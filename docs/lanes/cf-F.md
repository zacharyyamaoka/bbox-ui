# Lane cf:F — Registry item, gallery stories, full gate

_Stream plan: `docs/CONTROL-FLOW-PLAN.md` (read it) · repo: **bbox-ui** · dispatcher-resolved dependencies: ['cf:A', 'cf:B', 'cf:C', 'cf:D', 'cf:E', 'cf:G'] · barrier: False_

## Write set (the ONLY paths you may create or edit)
- `docs/build_menu_registry_items.py`
- `registry.json`
- `apps/storybook-basics/src/stories/ControlFlowGallery.stories.tsx`
- `README.md`
- `docs/CONTROL-FLOW-PLAN.md`

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
- apps/storybook-basics/src/presets/
- packages/
- apps/docs/
- /home/bam/systemsketch
- /home/bam/pyblocks
- /home/bam/zach_brain

## Acceptance (assertions you cannot edit)
- python3 docs/build_menu_registry_items.py --check exits 0 after regeneration; registry.json contains a `region` item whose files land region.layout.ts, blockMembers.tsx, bar.tsx, foldingChevron.tsx, lib/utils.ts as siblings by the trunk rule; npx shadcn@latest build exits 0
- Throwaway install proof: npx shadcn@latest add <built>/region.json into a scratch Vite React TS project, then tsc --noEmit exit 0 — commands and exit codes recorded in plan §13
- ControlFlowGallery/BranchInLoop (DOM): expectRegionExpanded('loop') and ('br'); expectArmsStacked; expectWireAvoids('e-bypass','[data-region-id="loop"] [data-slot="region-frame"]'); expectWireBadge('e-mut','mut'); no painted wire connects two nodes in different arms of the same branch (computed from the fixture with armOf)
- ControlFlowGallery/BranchInLoopReactFlow and /BranchInLoopTldraw: expectRegionExpanded ×2 + expectMemberInside; CollapsedBranchInLoop: expectRegionOpaque('br') inside the loop's body and expectRegionExpanded('loop')
- README.md lists Region in the component list, no install line for presets
- pnpm typecheck exit 0; pnpm test ALL green (both projects — no red file anywhere); plan §13 'Status' appended with lane shas, totals, --check output, install proof, story ids

Acceptance test files (committed before you existed; read them, never edit them):
- `apps/storybook-basics/src/stories/controlFlow.acceptance.ts`

## Builder brief (verbatim from the planner)

You are building lane F (wave 2, after every other lane has merged) of docs/CONTROL-FLOW-PLAN.md in the bbox-ui monorepo, worktree cut from the integration branch AFTER lanes A, B, C, D, E, G have merged. `pnpm install --filter bbox-storybook-basics...`; never `git add -A`. The acceptance files in plan §7 are READ-ONLY.

WHAT THIS LANE IS: make the region a registry item the way every other trunk component is, put the whole visual language on one board Zach can look at in all three hosts, and run the FULL gate honestly (CLAUDE.md: `pnpm test-stories` is not the whole suite — `pnpm test` runs both projects; a green claim that skipped the unit project is what the menu-kit audit caught).

READ FIRST: repo CLAUDE.md "The registry is the product" (all — especially the sibling rule and the throwaway-install gate) and "Story tags"; docs/build_menu_registry_items.py (all — ITEMS :59, target_for :181-202 has rules only for components/ and lib/, the post-build sibling-rule assertion :300-360); registry.json; README.md (component list style); every apps/storybook-basics/src/stories/ControlFlow*.stories.tsx; src/presets/loop/loop.fixtures.ts, src/presets/branch/branch.fixtures.ts, src/presets/loop/loop.ts, src/presets/branch/branch.ts; src/scene/controlFlow.ts (armOf); src/stories/controlFlow.acceptance.ts; plan §8 (what Zach will see) and §13.

BUILD.
1. Add to ITEMS in docs/build_menu_registry_items.py: ("region", "components/region.tsx", "Region", "A control-flow frame with a real Block integral to its top-left corner — the frame carries scope and no value ports; arms stack under the corner block with a fold chevron each. Loops and branches are data presets over it."). Run `python3 docs/build_menu_registry_items.py` (it walks the real transitive relative imports — region.layout.ts, blockMembers.tsx, bar.tsx, foldingChevron.tsx, badge.tsx if imported, lib/utils.ts — and lands them as siblings by the trunk rule; the script's own assertion then checks every relative import resolves against the TARGET layout and that no @bbox-ui/* private package is depended on). Then `python3 docs/build_menu_registry_items.py --check` must exit 0. Then `npx shadcn@latest build` (repo root). Do NOT add the loop/branch presets: target_for has no presets/ rule and the presets are scene-node factories over hosts, not components (plan §11 item 6) — say so in §13.
2. Prove the item installs (CLAUDE.md's gate — `npx shadcn add` exiting 0 proves nothing): in your scratchpad directory create a throwaway Vite React TS project with a components.json declaring the @/ alias (copy apps/storybook-basics/components.json's shape), run `npx shadcn@latest add <absolute path to the built json>/region.json`, then `npx tsc --noEmit` → exit 0. Record every command and exit code verbatim in §13. If it fails, that is a real finding: fix the ITEMS entry or the script (both in your write set), never the component, and report.
3. apps/storybook-basics/src/stories/ControlFlowGallery.stories.tsx (title "Control Flow/Gallery", tags ["area:control-flow","lane:control-flow"]): BranchInLoop — compose FOR_LOOP_CARRIED and BRANCH_ONE_INPUT (import the fixtures; give the branch region parentId = the loop and place it in the loop's body beside merge/smooth; re-id anything that collides); add an outside cfg block and an outside report block with an edge e-bypass (data.routing "elbow") that must avoid BOTH regions; add a mut cable e-mut off a top port on merge (ports.top ["effect:pose"], data {color:"var(--color-amber-600, #d97706)", badge:"mut", routing:"elbow"}) to an outside block. Play: expectRegionExpanded(root,"loop"), expectRegionExpanded(root,"br"), expectArmsStacked(root,"br",[...]), expectWireAvoids(root,"e-bypass",'[data-region-id="loop"] [data-slot="region-frame"]'), expectWireBadge(root,"e-mut","mut"), and — computed from the fixture with armOf — assert that for every painted wire ([data-slot="wire-layer"] [data-wire-id]) the two endpoint nodes have equal armOf or at least one undefined (no cable crosses arms). BranchInLoopReactFlow and BranchInLoopTldraw — the same scene in ReactFlowHost / TldrawHost, expectRegionExpanded ×2 + expectMemberInside. CollapsedBranchInLoop — the same scene with the branch region.view "opaque": expectRegionOpaque(root,"br") inside the loop's [data-slot="region-body"] and expectRegionExpanded(root,"loop"). First testing-library call in each play is findBy*/waitFor.
4. README.md: one row for Region in the existing component list, in the file's style; no install line for presets.
5. Append to docs/CONTROL-FLOW-PLAN.md §13 "Status" (append only, never edit above it): lanes landed with shas; `pnpm test` totals (files/tests per project); the --check output; the throwaway install commands and tsc exit code; every story id from §8 that exists; any assertion still red with its reason.
6. GATE: pnpm typecheck; pnpm test ALL green (both projects — no red file anywhere); python3 docs/build_menu_registry_items.py --check exit 0. Commit with explicit pathspecs (registry.json is generated — commit it with the script change). Report.

DO NOT TOUCH: any file under src/components, src/scene, src/hosts, src/presets; packages/*; apps/docs.

WHY COMMENTS: at the ITEMS entry (why region and not the presets — target rule); in the gallery's fixture composition (the branch's parentId is the LOOP; the bypass must clear both frames; the mut cable is a fixture today — the derivation is plan §11 item 7).

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
