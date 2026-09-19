# Lane ss:L3 — Wires as data lines: ss-wire shape + ss-wire-binding, press-drag from a dot, Trace paint between real anchors, derived scene, edit-event stream, edge-drop menu

_Stream plan: `docs/SYSTEMSKETCH-REBUILD-PLAN.md` (read it) · repo: **bbox-ui** · dispatcher-resolved dependencies: ['ss:L0'] · barrier: False_

## Write set (the ONLY paths you may create or edit)
- `apps/systemsketch/src/shapes/wire/index.ts (replace placeholder)`
- `apps/systemsketch/src/shapes/wire/WireShapeUtil.tsx`
- `apps/systemsketch/src/shapes/wire/WireBindingUtil.ts`
- `apps/systemsketch/src/shapes/wire/createWire.ts (replace stub)`
- `apps/systemsketch/src/shapes/wire/wireGeometry.ts`
- `apps/systemsketch/src/shapes/wire/WireFace.tsx`
- `apps/systemsketch/src/shapes/wire/wireGesture.ts`
- `apps/systemsketch/src/shapes/wire/dropMenu.tsx`
- `apps/systemsketch/src/document/sceneFromStore.ts (replace stub)`
- `apps/systemsketch/src/document/editEvents.ts (replace stub)`
- `apps/systemsketch/src/document/applySceneDiff.ts`

## Do not touch
- apps/systemsketch/src/App.tsx
- apps/systemsketch/src/shapes/registry.ts
- apps/systemsketch/src/shapes/types.ts
- apps/systemsketch/src/shapes/shared/**
- apps/systemsketch/src/shapes/{block,code,port,region}/**
- apps/systemsketch/src/chrome/**
- apps/systemsketch/src/**/*.test.ts
- apps/systemsketch/src/**/*.smoke.test.tsx
- apps/systemsketch/vitest.config.ts
- apps/storybook-basics/**
- /home/bam/systemsketch/**
- /home/bam/pyblocks/**

## Acceptance (assertions you cannot edit)
- pnpm --filter systemsketch typecheck exits 0
- pnpm --filter systemsketch exec vitest --project=unit run src/document/editEvents.test.ts → 7/7 pass
- pnpm --filter systemsketch exec vitest --project=unit run src/document/documentModel.test.ts -t "ss-wire|registry" → passes (the canBind case for ss-region/ss-code stays red until L5/L1 only if those kits are still placeholders — say which)
- pnpm --filter systemsketch exec vitest --project=smoke run src/wiring.smoke.test.tsx → 5/5 pass
- src/app.smoke.test.tsx still 4/4

Acceptance test files (committed before you existed; read them, never edit them):
- `apps/systemsketch/src/wiring.smoke.test.tsx`
- `apps/systemsketch/src/document/editEvents.test.ts`
- `apps/systemsketch/src/document/documentModel.test.ts`

## Builder brief (verbatim from the planner)

You are lane L3 of docs/SYSTEMSKETCH-REBUILD-PLAN.md — read §0–§4 and §3.1/§3.2 verbatim; the contracts you implement are quoted there and in the committed tests. L0 has landed. You replace the contents of src/shapes/wire/ and the two stubs in src/document/ (sceneFromStore.ts, editEvents.ts); you never touch App.tsx or registry.ts (your kit's `install` and `Overlay` fields are how you reach onMount and InFrontOfTheCanvas — read src/shapes/registry.ts's ShapeKit). First: `pnpm install --filter systemsketch...`. Read: src/shapes/block/* and src/shapes/shared/* (anchors live in props.anchors as shape-local points; a dot is `[data-port-id]` inside `[data-block-id]`), the committed src/wiring.smoke.test.tsx, src/document/editEvents.test.ts and the ss-wire describe of src/document/documentModel.test.ts (your acceptance, off-limits), apps/storybook-basics/src/hosts/tldrawHost.tsx:408-516 (the WireOverlay: endpoints = anchor × editor.getShapePageTransform, side fallback, `<Trace id from to routing variant color markerEnd curve terminals={false}/>` at :497-510 — copy that JSX shape exactly, it compiles today), apps/storybook-basics/src/components/wiring.ts (Wire, fanWires, DUPLICATE_FAN_PX), apps/storybook-basics/src/components/trace.layout.ts:118-137 (TraceDir, OPPOSITE_DIR, TraceTerminalSpec, TraceRouting), apps/storybook-basics/src/scene/{scene.ts,sceneWires.ts,sceneDiff.ts,edgeValidation.ts}, apps/storybook-basics/src/editor/README.md:46-79 + editor/edgeDropMenu.tsx:165-186 + stories/EdgeDropMenu.stories.tsx (the edge-drop adapter pattern), docs/TLDRAW-STARTER-KITS.md:169-206 ("a connection is a custom shape AND two real bindings") and the installed tldraw 5.3.2 declarations for BindingUtil (onAfterChangeToShape, onBeforeDeleteToShape), Editor.createBinding/deleteBinding/getBindingsFromShape/getBindingsToShape, Polyline2d, editor.run, store.listen with { source, scope }, RecordsDiff/HistoryEntry (node_modules/tldraw/dist-cjs/index.d.ts and @tldraw/editor, @tldraw/store).

Build, in this order. (1) src/shapes/wire/WireBindingUtil.ts: `class WireBindingUtil extends BindingUtil<WireBinding>` type WIRE_BINDING_TYPE, props { terminal: T.literalEnum("start","end"), portId: T.string }, getDefaultProps { terminal: "start", portId: "" }; onBeforeDeleteToShape → delete the wire (a wire without an end is not a document fact; the smoke test deletes a block and expects its wire gone); onAfterChangeToShape → editor.updateShape(wire, {}) only if geometry does not already track reactively (prefer reactivity — see 2). (2) src/shapes/wire/wireGeometry.ts: pure `resolveWireEnds(editor, wire) → { from: TraceTerminalSpec | null, to: ... }`: for each terminal find its binding (editor.getBindingsFromShape(wire.id, WIRE_BINDING_TYPE)), the target's props.anchors entry for portId, project with editor.getShapePageTransform(toId).applyToPoint into page space and then into wire space via editor.getPointInShapeSpace(wire.id, page); dir = anchor.side ?? (x < target w/2 ? "left" : "right") for from, OPPOSITE_DIR for to (tldrawHost.tsx:456-478); an unbound terminal uses props.start/props.end; and `wireRoutePoints(from, to, routing)` giving the polyline used for hit geometry (straight: 2 points; elbow: the trunk's own elbow route if it exposes a pure function under components/elbow/ — read components/elbow/index.ts — else a 4-point orthogonal route with a WHY that paint and hit geometry are allowed to differ slightly). (3) src/shapes/wire/WireShapeUtil.tsx: `class WireShapeUtil extends ShapeUtil<WireShape>` type WIRE_SHAPE_TYPE, props exactly §3, defaults { variant: "data", routing: "elbow", color: "", start: {x:0,y:0}, end: {x:120,y:0} } (asserted; elbow is Zach's datum — cite /home/bam/systemsketch/src/toolbar/toolbarModel.ts:38-46); getGeometry → new Polyline2d({ points: wireRoutePoints(...), isFilled: false }) — reading bound shapes' records inside getGeometry is what makes tldraw's geometry cache recompute when a block moves (it is a computed); canResize false, hideResizeHandles/hideRotateHandle true, canBind false (a wire is never an endpoint), canEdit false; component → <WireFace/>: HTMLContainer with an `<svg style={{ overflow: "visible", pointerEvents: "none", position: "absolute", left: 0, top: 0, width: 1, height: 1 }}>` containing the trunk `<Trace>` exactly as tldrawHost.tsx:497-510, ends from useValue(resolveWireEnds) so a mid-drag block moves its wire live (the smoke test asserts the path endpoint moves >60px when the target block moves), curve from fanWires over every wire sharing this wire's unordered pair (duplicates fan ≥ 8px apart — asserted); getIndicatorPath along the route. Keep every wire at x=0,y=0 with a WHY (page space == shape space, so loose ends and anchors share a frame). (4) src/shapes/wire/createWire.ts: `createWire(editor, { from: {nodeId, portId}, to: {nodeId, portId}, variant? }) → wireId` — ONE editor.run creating the shape and both bindings (createShapeId/createBindingId) so the store emits one transaction (editEvents.test asserts one wire.added with both ends); validates with canBind and returns null if refused. (5) src/shapes/wire/wireGesture.ts: `installWireGesture(editor): () => void` (your kit's `install`): a capture-phase pointerdown listener on editor.getContainer(); if target.closest('[data-slot="port-dot"]') inside a `[data-block-id]` → editor.markEventAsHandled(event) (tldrawHost.tsx:33-46's WHY: marking hides the press from tldraw without breaking a child's pointer capture), resolve shape id + port id, create a provisional wire with the start binding and a loose end that follows pointermove (page → wire-local, written with history "ignore"), on pointerup: if over another dot on a bindable shape and validateConnection (@trunk/scene/edgeValidation) allows → create the end binding in one editor.run and markHistoryStoppingPoint; else delete the provisional wire and, if dropped on empty canvas, publish { anchor, want } into a per-editor atom read by (6). Also honour a plain click on a dot (no move) as nothing — never a dangling wire. (6) src/shapes/wire/dropMenu.tsx: your kit's `Overlay`: renders the trunk EdgeDropMenu (@trunk/editor/edgeDropMenu) wrapped in a div `data-slot="edge-drop-menu"` when the atom holds a pending drop; entries from a small catalog (a Block with one matching port), judge via validateConnection over sceneFromRecords, onPick creates a block at the drop point + createWire, onDismiss/Escape clears the atom (the smoke test expects the menu to appear and Escape to dismiss it with zero wires). (7) src/document/sceneFromStore.ts: `sceneFromRecords(records)` pure — nodes from NODE_SHAPE_TYPES shapes (id = shape id, type = kind, position = shape x/y, parentId only when shape.parentId starts with "shape:", data as §3.1), edges from ss-wire shapes with BOTH bindings (source = start.toId, sourceHandle = start.portId, target/targetHandle from end, data { variant, routing, color }); a half-bound wire is omitted; containment is NEVER an edge (the smoke test asserts a kid inside an expanded block yields parentId and no edge); `useDocumentScene(editor)` = useValue over editor.store.allRecords(). (8) src/document/editEvents.ts exactly as contract §3.2: editEventsFromDiff pure over RecordsDiff (added shapes → node.added/wire.added with ends resolved from bindings in the same diff or the store; updated → node.moved when x/y/parentId changed, node.resized when props.w/h changed, node.changed for other props (fields exclude w, h, anchors; an anchors-only update yields NO event); bindings updated/added/removed for an existing wire → wire.rebound; removed wire → wire.removed; removed node → node.removed); subscribeEditEvents(store, listener) = store.listen(entry => { const events = editEventsFromDiff(entry.changes, id => store.get(id)); if (events.length) listener({ source: entry.source, events }) }, { source: "all", scope: "document" }) — hmm, editEvents.test expects a batch even for an anchors-only update? Read the test: it asserts batches.length >= before and no semantic event — so deliver the batch with an empty events array is NOT required; either is accepted. (9) src/document/applySceneDiff.ts: `applyScene(editor, next: DocumentScene)` — diffScene(current, next) → createShapes/updateShapes/deleteShapes/createWire in one editor.run; no test covers it, keep it small, document it as the mutation seam L4/L5 may use. (10) src/shapes/wire/index.ts: wireKit { shapeUtils: [WireShapeUtil], bindingUtils: [WireBindingUtil], tools: [], familyItems: [], toolUi: identity, install: installWireGesture, Overlay: WireDropMenuOverlay } — a wire has no tool; it is a gesture from a dot.

Two ideas: everything is a block — wires attach only to anchors on block/port nodes; never mix data and control lines — ss-wire is the only edge kind, variants are data/async/delayed, the binding is refused by regions and code, and sceneFromRecords never turns containment into an edge. WHY comments at each of those seams and at page==shape space. Verify: typecheck; `vitest --project=unit run src/document/editEvents.test.ts src/document/documentModel.test.ts`; `vitest --project=smoke run src/wiring.smoke.test.tsx src/app.smoke.test.tsx`. Never edit a test; report FAIL with assertion text if one cannot pass. Commit with explicit pathspecs; report owed wiring (e.g. a trunk elbow function that is not exported).

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
