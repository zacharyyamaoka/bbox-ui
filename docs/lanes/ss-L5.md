# Lane ss:L5 — Regions: Loop and Branch as ss-region frame-like shapes whose header contract is a real corner ss-block; control flow is containment, never a line

_Stream plan: `docs/SYSTEMSKETCH-REBUILD-PLAN.md` (read it) · repo: **bbox-ui** · dispatcher-resolved dependencies: ['ss:L3', 'cf:A', 'cf:B', 'cf:C', 'cf:E'] · barrier: False_

## Write set (the ONLY paths you may create or edit)
- `apps/systemsketch/src/shapes/region/index.ts (replace placeholder)`
- `apps/systemsketch/src/shapes/region/RegionShapeUtil.tsx`
- `apps/systemsketch/src/shapes/region/LoopTool.ts`
- `apps/systemsketch/src/shapes/region/BranchTool.ts`
- `apps/systemsketch/src/shapes/region/RegionFace.tsx`
- `apps/systemsketch/src/shapes/region/cornerBlock.ts`

## Do not touch
- apps/systemsketch/src/App.tsx
- apps/systemsketch/src/shapes/registry.ts
- apps/systemsketch/src/shapes/types.ts
- apps/systemsketch/src/shapes/shared/**
- apps/systemsketch/src/shapes/{block,code,port,wire}/**
- apps/systemsketch/src/chrome/**
- apps/systemsketch/src/document/**
- apps/systemsketch/src/**/*.test.ts
- apps/systemsketch/src/**/*.smoke.test.tsx
- apps/systemsketch/vitest.config.ts
- apps/storybook-basics/**
- /home/bam/systemsketch/**

## Acceptance (assertions you cannot edit)
- pnpm --filter systemsketch typecheck exits 0
- pnpm --filter systemsketch exec vitest --project=unit run src/document/documentModel.test.ts → all describes pass (ss-region included)
- pnpm --filter systemsketch exec vitest --project=smoke run src/region.smoke.test.tsx → 5/5 pass
- pnpm --filter systemsketch test → all green

Acceptance test files (committed before you existed; read them, never edit them):
- `apps/systemsketch/src/region.smoke.test.tsx`
- `apps/systemsketch/src/document/documentModel.test.ts`

## Builder brief (verbatim from the planner)

You are lane L5 of docs/SYSTEMSKETCH-REBUILD-PLAN.md — read §0–§4, §3's ss-region row, §6's L5 line and §7 (the contract this lane expects from stream 1, which may have landed under a different name: check `git log` and `ls apps/storybook-basics/src/components/region*` / `presets/loop*` / `presets/branch*` first and adapt RegionFace.tsx only). L0–L4 have landed. You replace ONLY src/shapes/region/. First: `pnpm install --filter systemsketch...`. Rulings that bind (do not re-open): a region is a NODE KIND, isolated, never carries a definitionId (apps/storybook-basics/src/scene/region.ts:4-26, Zach: "100% its a node ... 100% region is isolated"); a region is composed USING a block with a block in its top-left corner (DP - Region; Pasted image 20260918150916.png NEW GOOD vs OLD BAD — ports on the region header are the rejected design); the loop header is typed and unnamed (`for` = Iterable in / iter out; `while` = Bool in, no item outlet — DP - Loop); Branch V1 = no ports on the region, arms fan in at the consumer (DP - Branch); break is a mark, not a cable (DP - Break & Continue) — not built here; never mix data and control lines: the region refuses every wire binding. Read: the committed src/region.smoke.test.tsx and the ss-region describe of src/document/documentModel.test.ts (acceptance, off-limits), src/shapes/block/* (the corner block IS an ss-block — reuse, never a second block), src/document/sceneFromStore.ts (regions project as type "region"), tldraw 5.3.2's BaseFrameLikeShapeUtil (isFrameLike, providesBackgroundForChildren, canReceiveNewChildrenOfType, onDragShapesIn/Out, getClipPath — @tldraw/editor d.ts:266-275) and tldraw's own frame source shipped in node_modules/tldraw/src/lib/shapes/frame/FrameShapeUtil.tsx (geometry isFilled false, label hit area — the model for a container that does not swallow clicks inside it), and the read-only archive donors /home/bam/systemsketch/src/blocks/RegionShapeUtil.ts (the frame-like base; refuse adopting itself :22-27), src/loop/LoopShapeUtil.tsx:60-120 and src/branch/BranchShapeUtil.tsx:60-130 (what the OLD regions did; you port the container behaviours — drop, carry, clip, floor sizes, arm reconcile — and NOT the header ports).

Build. src/shapes/region/RegionShapeUtil.tsx: `class RegionShapeUtil extends BaseFrameLikeShapeUtil<RegionShape>` type REGION_SHAPE_TYPE, props exactly §3 (kind: T.literalEnum("for","while","branch","plain"), name, cornerBlockId: T.string, arms: T.arrayOf(T.object({ id, title, open: T.boolean, h: T.number }))), defaults { w: 480, h: 320, kind: "plain", name: "", cornerBlockId: "", arms: [] } (asserted); isFrameLike true; providesBackgroundForChildren true; canReceiveNewChildrenOfType(shape, type) = type !== WIRE_SHAPE_TYPE (nested regions allowed — Pasted image 20260918144705.png nests a Selector in an arm); onDragShapesIn refuses a drag containing the region itself, else super; canBind → false always with the WHY "never mix data and control lines: a region is control flow, a wire is data; a cable cannot land on it" (documentModel.test asserts it); canResize true (resizeBox) with floors w ≥ 240, h ≥ 160 in onBeforeUpdate; hideRotateHandle true; getGeometry: Rectangle2d(w,h,isFilled:false) for the body plus filled rectangles for the label tab and each arm header row (Group2d) so a click inside the region reaches children/canvas (tldraw frame behaviour) while the chrome selects the region; onDoubleClick on the name → editor.setEditingShape for inline rename (optional); component → <RegionFace/>. src/shapes/region/RegionFace.tsx: if stream 1 shipped `Region` (@trunk/components/region) render it with kind/width/height/label/arms and children=null (tldraw paints the children itself); otherwise compose it locally from trunk parts with the React Flow labeled-group look Zach picked (Pasted image 20260918192040.png: a 1px border frame, the label as a tab integral to the top-left) — root MUST carry `data-slot="region"`; each branch arm row MUST carry `data-slot="region-arm" data-arm-id={arm.id}` in `arms` order with the title text visible and a divider (Pasted image 20260918143241.png / 20260918144504.png); the corner block is NOT painted here — it is a real child shape tldraw paints. src/shapes/region/cornerBlock.ts: `cornerBlockPropsFor(kind)` → for: { name: "For Loop", view: "port", ports: { left: [{ id: "iterable", name: "Iterable", type: "Iterable" }], right: [{ id: "iter", name: "iter", type: "" }], top: [], bottom: [] } } (the smoke test asserts left types ["Iterable"] and right ids ["iter"]); while: { name: "While Loop", left: [{ id: "condition", name: "condition", type: "Bool" }], right: [] }; branch: { name: "Branch", left: [{ id: "input_1", name: "input 1", type: "" }], right: [] } (Pasted image 20260918145125.png / 20260918144504.png); and `createCornerBlock(editor, regionId, kind)` → creates the ss-block as a CHILD (parentId = region) at (8, 0) — top-left, overlapping the frame edge like the NEW GOOD image; the test tolerates 24px — and writes cornerBlockId; `kind === "plain"` creates none. src/shapes/region/LoopTool.ts: `class LoopTool extends BaseBoxShapeTool { static id = LOOP_TOOL_ID; shapeType = REGION_SHAPE_TYPE; onCreate(shape) { if (!shape) return; editor.run(() => { updateShape kind "for", name "For Loop"; createCornerBlock(...) }) } }` (BaseBoxShapeTool.onCreate exists in 5.3.2 — @tldraw/editor d.ts:212); BranchTool likewise with kind "branch", name "Branch", arms [{ id: "if", title: "if", open: true, h: 160 }, { id: "else", title: "else", open: true, h: 160 }] and a corner block. A `while` variant is reached from the Loop's floating-toolbar view control (L4's file — report as owed wiring; do not edit chrome/). src/shapes/region/index.ts: regionKit { shapeUtils: [RegionShapeUtil], tools: [LoopTool, BranchTool], familyItems: [{ id: LOOP_TOOL_ID, label: "Loop", icon: <Repeat/> }, { id: BRANCH_TOOL_ID, label: "Branch", icon: <GitBranch/> }] (rows must contain "Loop" and "Branch" — the test matches /loop/i and /branch/i and asserts there is still ONE system face), toolUi adding both ids with onSelect → setCurrentTool }.

Two ideas, stated in code: everything is a block — the region's header contract IS an ss-block child named by cornerBlockId; the region itself has no ports; never mix data and control lines — control = containment + arms; canBind false; the derived scene reports a region node with children and never an edge (the smoke test re-parents a block by a real drag onto the region and checks sceneFromRecords). Verify: typecheck; `vitest --project=unit run src/document/documentModel.test.ts`; `vitest --project=smoke run src/region.smoke.test.tsx`; then `pnpm --filter systemsketch test` all green. Never edit a test. Commit with explicit pathspecs; report which stream-1 component you consumed (or that you composed locally) and what is owed.

## Contracts of this stream (for reference; the plan .md has the full context)

### Document model — persisted tldraw shape/binding props (what a saved .tldr contains)
_owner: systemsketch-rebuild (L0 defines types + block; L1 code; L2 port; L3 wire+binding; L5 region) · consumers: pyblocks to_systemsketch() (stream 3), source-code-view origin (stream 4), editor menus (L4), sceneFromRecords (L3)_

```
// apps/systemsketch/src/shapes/types.ts
export const BLOCK_SHAPE_TYPE = "ss-block" as const;
export const CODE_SHAPE_TYPE = "ss-code" as const;
export const PORT_SHAPE_TYPE = "ss-port" as const;
export const WIRE_SHAPE_TYPE = "ss-wire" as const;
export const REGION_SHAPE_TYPE = "ss-region" as const;
export const WIRE_BINDING_TYPE = "ss-wire-binding" as const;
export const NODE_SHAPE_TYPES = ["ss-block","ss-code","ss-port","ss-region"] as const;
export const BLOCK_TOOL_ID = "ss-block", CODE_TOOL_ID = "ss-code", PORT_TOOL_ID = "ss-port", LOOP_TOOL_ID = "ss-loop", BRANCH_TOOL_ID = "ss-branch";
export const FLOATING_PORT_ID = "port";

// apps/systemsketch/src/shapes/shared/props.ts (tldraw `T`)
export const PortSpecV   = T.object({ id: T.string, name: T.string, type: T.string });
export const PortAnchorV = T.object({ portId: T.string, x: T.number, y: T.number, side: T.nullable(T.literalEnum("top","right","bottom","left")) });
export const PointV      = T.object({ x: T.number, y: T.number });

// ss-block props (defaults: w 160, h 100, name "block", view "port", ports all [], anchors [])
{ w: T.number, h: T.number, name: T.string, view: T.literalEnum("simple","port","expanded"),
  ports: T.object({ left: T.arrayOf(PortSpecV), right: T.arrayOf(PortSpecV), top: T.arrayOf(PortSpecV), bottom: T.arrayOf(PortSpecV) }),
  anchors: T.arrayOf(PortAnchorV) }   // anchors = MEASURED shape-local dot centres, host-written; a writer leaves []
// ss-code props (defaults: w 320, h 120, code "", language "python", origin null)
{ w: T.number, h: T.number, code: T.string, language: T.literalEnum("python","javascript","json","plaintext"),
  origin: T.nullable(T.object({ uri: T.string, anchor: T.string, contentHash: T.string })) }  // reserved verbatim from docs/SOURCE-CODE-VIEW-PLAN.md:103-115; semantics are stream 4's
// ss-port props (defaults: w 120, h 32, name "port", type "", direction "out", anchors [])
{ w: T.number, h: T.number, name: T.string, type: T.string, direction: T.literalEnum("in","out"), anchors: T.arrayOf(PortAnchorV) }  // exactly one anchor, portId === FLOATING_PORT_ID
// ss-wire props (defaults: variant "data", routing "elbow", color "", start {0,0}, end {120,0})
{ variant: T.literalEnum("data","async","delayed"), routing: T.literalEnum("straight","slanted","curved","elbow"), color: T.string, start: PointV, end: PointV }  // start/end = shape-local LOOSE terminal positions, read only for an unbound terminal; NO control variant ever
// ss-wire-binding props: { terminal: T.literalEnum("start","end"), portId: T.string }  fromId = wire, toId = ss-block | ss-port; start = source, arrowhead at end. Refused by ss-region and ss-code (canBind false).
// ss-region props (defaults: w 480, h 320, kind "plain", name "", cornerBlockId "", arms [])
{ w: T.number, h: T.number, kind: T.literalEnum("for","while","branch","plain"), name: T.string, cornerBlockId: T.string,
  arms: T.arrayOf(T.object({ id: T.string, title: T.string, open: T.boolean, h: T.number })) }  // frame-like; cornerBlockId names the CHILD ss-block that IS the header contract
// Nesting: shape.parentId is another shape's id for members/region contents; coordinates parent-relative (= scene/scene.ts:60-63). `meta` is free for consumers (stream 3 may stamp meta.pyblocks).
```

### Derived scene — sceneFromRecords / useDocumentScene
_owner: systemsketch-rebuild (L3) · consumers: L4 problems panel (lintScene), L5 region tests, stream 3 (read side)_

```
// apps/systemsketch/src/document/sceneFromStore.ts
export type DocNodeData = {
  kind: "block" | "code" | "port" | "region";
  name: string;
  view?: "simple" | "port" | "expanded";
  ports?: Partial<Record<"top"|"right"|"bottom"|"left", string[]>>;  // ids only
  portTypes?: Record<string, string>;
  code?: string; language?: string;
  direction?: "in" | "out"; type?: string;
  regionKind?: "for" | "while" | "branch" | "plain"; cornerBlockId?: string;
};
export type DocumentScene = BlockScene<DocNodeData, WireStyleData>;   // @trunk/scene/scene, @trunk/scene/sceneWires
export function sceneFromRecords(records: Iterable<TLRecord>): DocumentScene;  // pure; node id = shape id; node.type = kind; parentId = shape.parentId when a shape; one edge per ss-wire with BOTH bindings (source=start, target=end); containment is never an edge
export function useDocumentScene(editor: Editor): DocumentScene;            // useValue over editor.store
```

### UI edit event stream — subscribeEditEvents (the point stream 3 hooks)
_owner: systemsketch-rebuild (L3) · consumers: pyblocks backend (stream 3)_

```
// apps/systemsketch/src/document/editEvents.ts
export type NodeShapeType = "ss-block" | "ss-code" | "ss-port" | "ss-region";
export interface WireEnd { nodeId: string; portId: string }
export type EditEvent =
  | { kind: "node.added";   nodeId: string; type: NodeShapeType; parentId: string | null; x: number; y: number; props: Record<string, unknown> }
  | { kind: "node.removed"; nodeId: string; type: NodeShapeType }
  | { kind: "node.moved";   nodeId: string; x: number; y: number; parentId: string | null }
  | { kind: "node.resized"; nodeId: string; w: number; h: number }
  | { kind: "node.changed"; nodeId: string; type: NodeShapeType; fields: string[]; before: Record<string, unknown>; after: Record<string, unknown> }  // fields never include w, h, anchors
  | { kind: "wire.added";   wireId: string; from: WireEnd | null; to: WireEnd | null; variant: string }
  | { kind: "wire.removed"; wireId: string }
  | { kind: "wire.rebound"; wireId: string; from: WireEnd | null; to: WireEnd | null };
export interface EditBatch { source: "user" | "remote"; events: EditEvent[] }
export function editEventsFromDiff(diff: RecordsDiff<TLRecord>, after: (id: string) => TLRecord | undefined): EditEvent[];  // pure
export function subscribeEditEvents(store: TLStore, listener: (batch: EditBatch) => void): () => void;  // store.listen(handler, { source: "all", scope: "document" }); one batch per transaction; a wire + its two bindings created in one editor.run arrive as ONE wire.added with both ends resolved; an anchors-only update emits no semantic event
// Consumer call site: subscribeEditEvents(editor.store, batch => …) from the app's onMount (App.tsx onEditorReady).
```

### App test contract and shape-kit registry
_owner: systemsketch-rebuild (L0) · consumers: every smoke test (committed harness), L1/L2/L3/L5 kits, L4 overlay_

```
// apps/systemsketch/src/App.tsx
export interface AppProps { persistenceKey?: string | null; onEditorReady?(editor: Editor): void }  // null = no persistence (tests); default "systemsketch"
export function App(props: AppProps): JSX.Element;  // root <main data-testid="systemsketch-app">; <Tldraw shapeUtils={SHAPE_UTILS} bindingUtils={BINDING_UTILS} tools={TOOLS} components={COMPONENTS} overrides={OVERRIDES} onMount={…} persistenceKey={…} colorScheme="system" assetUrls={…}/>

// apps/systemsketch/src/shapes/registry.ts
export interface ShapeKit {
  shapeUtils: readonly TLAnyShapeUtilConstructor[];
  bindingUtils: readonly TLAnyBindingUtilConstructor[];
  tools: readonly TLStateNodeConstructor[];
  familyItems: readonly ToolItem[];            // @trunk/components/toolDock — rows of the ONE system family, display order
  toolUi(editor: Editor, tools: TLUiToolsContextType): TLUiToolsContextType;  // TLUiOverrides.tools entries (kbd)
  install?(editor: Editor): () => void;        // onMount side-effect (L3's wire gesture)
  Overlay?: ComponentType;                     // rendered inside components.InFrontOfTheCanvas by src/chrome/overlay.tsx
}
export const EMPTY_KIT: ShapeKit;
export const KITS: readonly ShapeKit[];        // [blockKit, codeKit, portKit, wireKit, regionKit] — each from src/shapes/<kind>/index.ts
export const SHAPE_UTILS, BINDING_UTILS, TOOLS, SYSTEM_FAMILY_ITEMS;
export function withToolUi(editor: Editor, tools: TLUiToolsContextType): TLUiToolsContextType;
// Test ids the harness relies on: ToolDock testIdPrefix="ss-dock" (faces: ss-dock-family-system, cells: ss-dock-tool-select); ChromeBar testIdPrefix="ss-chrome" plus app buttons ss-chrome-undo / ss-chrome-redo; status items ss-status-frames / ss-status-problems; ProblemsPanel testIdPrefix="ss" (→ ss-problems-panel); selection actions ss-selection-view / ss-selection-delete; code grab ring data-slot="code-grab-ring"; edge-drop menu wrapper data-slot="edge-drop-menu"; region face data-slot="region", arms data-slot="region-arm" data-arm-id.
```
