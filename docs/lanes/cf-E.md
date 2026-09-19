# Lane cf:E — Opaque projection, the toggle, hosts wired to the projection

_Stream plan: `docs/CONTROL-FLOW-PLAN.md` (read it) · repo: **bbox-ui** · dispatcher-resolved dependencies: ['cf:A', 'cf:D', 'cf:G', 'pb:trunk-loader-events'] · barrier: False_

## Write set (the ONLY paths you may create or edit)
- `apps/storybook-basics/src/scene/regionView.ts`
- `apps/storybook-basics/src/hosts/regionScene.ts`
- `apps/storybook-basics/src/hosts/nodeViews.tsx`
- `apps/storybook-basics/src/hosts/domCanvas.tsx`
- `apps/storybook-basics/src/hosts/reactFlowHost.tsx`
- `apps/storybook-basics/src/hosts/tldrawHost.tsx`
- `apps/storybook-basics/src/stories/ControlFlowToggle.stories.tsx`

## Do not touch
- apps/storybook-basics/src/scene/controlFlow.test.ts
- apps/storybook-basics/src/scene/regionView.test.ts
- apps/storybook-basics/src/components/region.layout.test.ts
- apps/storybook-basics/src/components/wiring.test.ts
- apps/storybook-basics/src/hosts/regionScene.test.ts
- apps/storybook-basics/src/stories/controlFlow.acceptance.ts
- apps/storybook-basics/src/scene/collapse.ts
- apps/storybook-basics/src/scene/boundary.ts
- apps/storybook-basics/src/scene/region.ts
- apps/storybook-basics/src/scene/scene.ts
- apps/storybook-basics/src/components/region.tsx
- apps/storybook-basics/src/components/region.layout.ts
- apps/storybook-basics/src/components/wireLayer.tsx
- apps/storybook-basics/src/components/wiring.ts
- apps/storybook-basics/src/scene/sceneWires.ts
- apps/storybook-basics/src/hosts/portDotSightings.ts
- packages/
- apps/docs/
- /home/bam/systemsketch
- /home/bam/pyblocks
- /home/bam/zach_brain

## Acceptance (assertions you cannot edit)
- pnpm exec vitest --project=unit run src/scene/regionView.test.ts src/hosts/regionScene.test.ts → all green (expanded = identity by reference; re-point keeps id/data/outer end; port-outer same object; interior + port-inner dropped; promoted ports carry side/direction/inner; custom mintPortId; outermost opaque wins; two opaque regions re-point both ends; setRegionView changes ONE field on ONE node with same edges array and same sibling objects; no-op contract; toggle round trip; projectHostScene reads polarity off walls)
- ControlFlowToggle/DomCanvas, /ReactFlow, /Tldraw: expectRegionExpanded('loop') → click the corner chevron → expectRegionOpaque('loop'); the card shows [data-port-id="Iterable"] plus [data-port-id="merge/pose"] on a data-edge="left" rail and [data-port-id="smooth/out"] on a data-edge="right" rail
- DomCanvas: expectWirePainted('e-seed') and ('e-out') while opaque; [data-wire-id="e-iter"] absent; the positions probe text is unchanged and the region host element's left/top (or RF transform) is unchanged; click again → expectRegionExpanded and every wire resolved again
- ControlFlowToggle/NestedOpaque: only the loop's card renders; its [data-slot="region-hidden"] footer counts the nested branch's blocks and arms ('N blocks · M arms · K edges hidden')
- Every earlier control-flow story (Region, Loop, Branch, Wires, Host Edges) still passes with the projection in place — an all-expanded scene is the identity
- pnpm typecheck exit 0; pnpm test — everything green

Acceptance test files (committed before you existed; read them, never edit them):
- `apps/storybook-basics/src/scene/regionView.test.ts`
- `apps/storybook-basics/src/hosts/regionScene.test.ts`
- `apps/storybook-basics/src/stories/controlFlow.acceptance.ts`

## Builder brief (verbatim from the planner)

You are building lane E (wave 1, after lanes A, D and G have merged) of docs/CONTROL-FLOW-PLAN.md in the bbox-ui monorepo, worktree cut from the integration branch AFTER those merges. `pnpm install --filter bbox-storybook-basics...`; never `git add -A`. The acceptance files in plan §7 are READ-ONLY — two of them (src/scene/regionView.test.ts, src/hosts/regionScene.test.ts) are YOUR gate; read every assertion before writing a line.

WHAT THIS LANE IS: the opaque (P5) ⇄ expanded (P1) toggle. Ruling (plan §2.B): the opaque view is a PROJECTION over the scene, never a document edit. Flipping data.region.view changes ONE field; a pure projectOpaqueRegions reuses boundary.ts's classifyBoundary + promoteBoundary (the non-mutating QUERY half of collapse.ts) to re-point crossing edges at promoted ports on the card at paint time. Positions are preserved by construction and the acceptance asserts it as referential identity. This does NOT re-open docs/peps/0003 (collapseToRegion still mutates: it MINTS a node around a loose selection); the toggle is a different operation on a node that already exists, and Zach's V1 pick means the expanded document has DIRECT crossing cables — an opaque card can only ever be a lens over them. Promoted port ids default to portKey(inner.nodeId, inner.portId) — collapse.ts's own default — so a card and a collapse agree.

READ FIRST: plan §2.B, §3.4, §3.6, §4 (opaque/toggle rows), §12, Appendix E; src/scene/regionView.ts (the stub — yours; keep every exported name/type); src/hosts/regionScene.ts (stub bodies setRegionView/toggleRegionView — yours; projectHostScene is already real); src/scene/regionView.test.ts and src/hosts/regionScene.test.ts (ALL); src/scene/boundary.ts (all — classifyBoundary :171, crossingEdges :218, promoteBoundary :449, PromotedPort :390, promotedDirectionOf :522, dagPolarityPolicy :298); src/scene/collapse.ts:197-283 (how a collapse consumes the same report — you mirror the re-pointing WITHOUT minting stubs and WITHOUT touching nodes); src/scene/controlFlow.ts (hiddenSummary, describeHidden); src/scene/region.ts (descendantsOf, ancestorsOf); docs/GROUPING-ALGEBRA.md §1 and §3; docs/peps/0003-collapse-mutates-the-document.md; src/hosts/nodeViews.tsx after lane A (the region case and its `// lane E` marker); src/hosts/domCanvas.tsx, src/hosts/reactFlowHost.tsx (rfEdges/wired seams, lane G's member re-pointing), src/hosts/tldrawHost.tsx (sceneWires/wired seams) after lanes D and G; src/components/foldingChevron.tsx; src/stories/SceneHosts.stories.tsx (StatefulDomCanvas/StatefulReactFlow), SceneHostsTldraw.stories.tsx; src/stories/controlFlow.acceptance.ts (all). pyblocks reference (read-only): /home/bam/pyblocks/.claude/worktrees/pyblocks-viewer-library-40c1f2/vscode-pyblocks/src/viewer/nodes/RegionInterface.tsx:80 (the chevron sits in the SAME slot expanded and collapsed) and vscode-pyblocks/src/viewer/adapter/collapse.ts:29-49 (their pure collapse projection — the same idea).

BUILD.
1. src/scene/regionView.ts projectOpaqueRegions per §3.4 and its test: find opaque regions with options.isOpaque; keep only the OUTERMOST (drop any whose ancestorsOf contains another opaque region); no opaque → return { nodes: scene.nodes, edges: scene.edges, regions: [] } with the SAME arrays. Otherwise, per outermost R in scene order: report = classifyBoundary(scene, { containerId: R }); { ports } = promoteBoundary(report, { directionOf, typeOf, mintPortId: ({inner}) => mintPortId(inner) }) with mintPortId defaulting to portKey(inner.nodeId, inner.portId); hidden = hiddenSummary(scene, R). Build ONCE a map node id → owning outermost R (via descendantsOf). Then ONE pass over scene.edges: both ends owned by the same R → dropped (interior); one end is R itself and the other is owned by R → dropped (port-inner); an end owned by some R → replaced by { R, portForInner.get(portKey(inner.nodeId, inner.portId)).id } (the port map exactly as collapse.ts:235-240 builds it); an edge with no hidden end → the SAME object; a changed edge is a NEW object keeping id, data and the untouched end. Nodes are never touched. regions: one OpaqueRegionView per outermost R, scene order. WHY at the top: §2.B in one paragraph, naming collapse.ts:242-262 as the mutating twin this deliberately does not call.
2. src/hosts/regionScene.ts: setRegionView (find the node; if unknown, not a region, or regionViewOf(node) === view → return scene itself; else a new scene whose nodes is a new array with ONE replaced node { ...node, data: { ...node.data, region: { ...(node.data.region ?? { kind: "group" }), view } } } and whose edges is scene.edges by reference); toggleRegionView = flip between expanded/opaque. Gate: pnpm exec vitest --project=unit run src/scene/regionView.test.ts src/hosts/regionScene.test.ts green.
3. Hosts: domCanvas.tsx — const projected = projectHostScene(scene); wired = wiredPortsOf(projected.scene); sceneWires(projected.scene); pass regionViews (a Map<regionId, OpaqueRegionView> built from projected.regions) into SceneNodeView via a new optional SceneNodeViewProps.regionViews. reactFlowHost.tsx — rfEdges from projected.scene.edges (then lane G's member re-pointing runs on those), wired from the projection, regionViews on the host context. tldrawHost.tsx — the same three at its sceneWires/wired seams. One WHY sentence at each seam: "hosts paint the projection; the document keeps its direct P1 cables".
4. src/hosts/nodeViews.tsx region case, opaque branch (replace lane A's marker): card ports = own data.ports walls ∪ the projection's ports for this region, each placed on port.side with id: port.id and label: port.inner.portId (WHY: the reader sees the inner port's own name; the id stays the portKey so wires resolve); withWiredState against the projected wired set; footer <span data-slot="region-hidden">{describeHidden(view.hidden)}</span> (fall back to hiddenSummary(scene, id) when no projection entry); header = <Bar size="md" left={<FoldingChevron open={view === "expanded"} onClick={() => onSceneChange?.(toggleRegionView(scene, node.id))} aria-label={expanded ? "Collapse region" : "Expand region"} className={POINTER_OWNED_CLASS}/>} center={name} right={badge ? <Badge…/> : undefined}/> in BOTH views (same slot expanded and collapsed — pyblocks RegionInterface.tsx:80). The chevron carries POINTER_OWNED_CLASS so a canvas host never starts a drag on the click. Keep the expanded branch's existing behaviour otherwise.
5. src/stories/ControlFlowToggle.stories.tsx (title "Control Flow/Toggle", tags ["area:control-flow","lane:control-flow"]): an inline HostScene fixture = the loop from regionScene.test.ts plus smooth (left ["in"] right ["out"]) and an outside enc (left ["pose"]), edges e-seed src/pose→merge/pose, e-iter loop/Iter→merge/other, e-ms merge/Pose→smooth/in, e-out smooth/out→enc/pose, e-iterable src/others→loop/Iterable; stateful wrappers per host (copy StatefulDomCanvas/StatefulReactFlow from SceneHosts.stories.tsx; add a tldraw one from SceneHostsTldraw.stories.tsx). Each story also renders a probe <pre data-slot="positions">{JSON.stringify(scene.nodes.map(n => [n.id, n.position]))}</pre>. DomCanvas / ReactFlow / Tldraw plays: expectRegionExpanded(root,"loop"); read the probe text and the region host element's left/top (DOM: [data-scene-node="loop"] style; RF: the node's transform); userEvent.click the corner chevron; expectRegionOpaque(root,"loop"); the card shows [data-port-id="Iterable"] AND [data-port-id="merge/pose"] on a [data-slot="block-port-rail"][data-edge="left"] and [data-port-id="smooth/out"] on a data-edge="right" rail; DomCanvas only: expectWirePainted("e-seed"), expectWirePainted("e-out"), [data-wire-id="e-iter"] absent; probe text unchanged; host element position unchanged; click again → expectRegionExpanded and every wire resolved again. NestedOpaque: a branch region (with two arms and one block each) inside the loop's body, loop opaque → only the loop's card renders, its footer reads "N blocks · M arms · K edges hidden" with the measured numbers (compute expected from the fixture with hiddenSummary). First testing-library call in each play is findBy*/waitFor.
6. GATE: pnpm typecheck; pnpm test — everything green, including the two acceptance unit files AND every earlier control-flow story (Region, Loop, Branch, Wires, Host Edges) — they must still pass with the projection in place: an all-expanded scene is the identity, and you prove it by not touching a byte of their fixtures. Commit with pathspecs; report story ids.

DO NOT TOUCH: collapse.ts, boundary.ts, region.ts, scene.ts; region.tsx, region.layout.ts; wireLayer.tsx, wiring.ts, sceneWires.ts (lane D's — call them); portDotSightings.ts (lane G's).

WHY COMMENTS: regionView.ts top (projection vs mutation, §2.B); at the outermost-wins rule; at each host seam; at the card's promoted-port label; at the chevron's POINTER_OWNED_CLASS.

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
