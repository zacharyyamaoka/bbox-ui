# Lane ss:L2 — Floating port shape: ss-port renders the trunk LabeledPort with one measured anchor, inline name edit, direction decides the dot side

_Stream plan: `docs/SYSTEMSKETCH-REBUILD-PLAN.md` (read it) · repo: **bbox-ui** · dispatcher-resolved dependencies: ['ss:L0'] · barrier: False_

## Write set (the ONLY paths you may create or edit)
- `apps/systemsketch/src/shapes/port/index.ts (replace placeholder)`
- `apps/systemsketch/src/shapes/port/PortShapeUtil.tsx`
- `apps/systemsketch/src/shapes/port/PortTool.ts`
- `apps/systemsketch/src/shapes/port/PortFace.tsx`

## Do not touch
- apps/systemsketch/src/App.tsx
- apps/systemsketch/src/shapes/registry.ts
- apps/systemsketch/src/shapes/types.ts
- apps/systemsketch/src/shapes/shared/**
- apps/systemsketch/src/shapes/{block,code,wire,region}/**
- apps/systemsketch/src/chrome/**
- apps/systemsketch/src/document/**
- apps/systemsketch/src/**/*.test.ts
- apps/systemsketch/src/**/*.smoke.test.tsx
- apps/systemsketch/vitest.config.ts
- apps/storybook-basics/**
- /home/bam/systemsketch/**

## Acceptance (assertions you cannot edit)
- pnpm --filter systemsketch typecheck exits 0
- pnpm --filter systemsketch exec vitest --project=unit run src/document/documentModel.test.ts -t "ss-port|registry" → passes
- pnpm --filter systemsketch exec vitest --project=smoke run src/port.smoke.test.tsx → 4/4 pass
- src/app.smoke.test.tsx still 4/4

Acceptance test files (committed before you existed; read them, never edit them):
- `apps/systemsketch/src/port.smoke.test.tsx`
- `apps/systemsketch/src/document/documentModel.test.ts`

## Builder brief (verbatim from the planner)

You are lane L2 of docs/SYSTEMSKETCH-REBUILD-PLAN.md (read §0–§4 and the ss-port row of §3). L0 has landed; src/shapes/port/index.ts is a placeholder exporting EMPTY_KIT and you replace ONLY src/shapes/port/. First: `pnpm install --filter systemsketch...`. Read: src/shapes/block/* (mirror it), src/shapes/shared/*, src/shapes/registry.ts, the committed src/port.smoke.test.tsx and the ss-port describe of src/document/documentModel.test.ts (your acceptance, off-limits), apps/storybook-basics/src/components/labeledPort.tsx:1-60 (header: label slot is plain text at rest and a single-line CodeEditor while editing; the slot boundary) and :263-360 (LabeledPortProps: children = the label content, direction, textLayout, labelOrigin, state, editing-related props — read every prop), apps/storybook-basics/src/components/port.layout.ts (TEXT_LAYOUT_AS_PLACEMENT: which textLayout puts the label right of the dot vs left), apps/storybook-basics/src/hosts/portDotSightings.ts:28-34 (the DOM contract sightPortDots reads: `[data-port-id]` inside `[data-block-id]`, `[data-slot="port-dot"]`, rail `data-edge`), and the read-only archive donor /home/bam/systemsketch/src/floatingPort/FloatingPortShapeUtil.tsx:1-80 (the free Port: "a semantic, wireable endpoint with no enclosing Block"; its WHY at :47-52 about keeping the label hit-testable so one grab starts translating immediately).

Build. src/shapes/port/PortShapeUtil.tsx: `class PortShapeUtil extends ShapeUtil<PortShape>` (+ tlschema augmentation for "ss-port"); props exactly §3 (name, type, direction: T.literalEnum("in","out"), anchors: T.arrayOf(PortAnchorV) from src/shapes/shared/props.ts); getDefaultProps { w: 120, h: 32, name: "port", type: "", direction: "out", anchors: [] } (asserted); getGeometry Rectangle2d(w,h,isFilled true) — the whole face is a grab surface, the donor's rule; canResize false; hideRotateHandle true; hideResizeHandles true; canEdit true; canBind = bindingType === WIRE_BINDING_TYPE && fromShapeType === WIRE_SHAPE_TYPE (a floating port IS a wire endpoint — the smallest block); component → <PortFace/>. src/shapes/port/PortFace.tsx: L0's NodeShapeComponent wrapper; inside it a span `data-block-id={shape.id}` wrapping a span `data-port-id={FLOATING_PORT_ID}` wrapping the trunk LabeledPort — that nesting is what lets L0's useMeasuredShape (sightPortDots) find the dot and write exactly ONE anchor with portId "port" and side null (the smoke test asserts the anchor projects onto the dot within 3px, then re-checks after a camera zoom — anchors are shape-local, so nothing re-measures). LabeledPort: direction={props.direction}; textLayout chosen so `in` puts the dot LEFT of the label and `out` puts it RIGHT (the test measures centre x of [data-slot="port-dot"] vs [data-slot="port-label"]); label content renders name and type LITERALLY — `props.name` untouched (the test passes "gain_x  " with trailing spaces and expects them in textContent; wrap in a span with `white-space: pre`), then the type in a muted span — never trim, never normalise (about-me: truthful property rendering). Wired state: `state="wired"` when useValue(editor.getBindingsToShape(shape.id, WIRE_BINDING_TYPE)).length > 0 (stock API; L3 lights it without touching your file). Inline rename: a double-click on the label (tldraw's onDoubleClick on the util, or the LabeledPort's own editing seam if it exposes onEditingChange) → editor.setEditingShape(shape.id) and LabeledPort editing=true with a single-line CodeEditor whose onWrite writes props.name per keystroke and whose Enter/Escape call editor.setEditingShape(null); the test does dblClick → Ctrl+A → type "new_name" → Enter and expects props.name === "new_name". Pointer ownership: the label editor carries POINTER_OWNED_CLASS while editing only; at rest the whole face is a drag surface (contentOwnsPress in src/shapes/shared/pointerOwnership.ts returns false for a non-block face unless the target is .nodrag — confirm by reading it; if it wrongly treats the port face as content, report that as owed wiring in L0's file rather than editing it). src/shapes/port/PortTool.ts: `class PortTool extends BaseBoxShapeTool { static id = PORT_TOOL_ID; static initial = "idle"; shapeType = PORT_SHAPE_TYPE }` — a click drops a default-size port. src/shapes/port/index.ts: portKit { shapeUtils: [PortShapeUtil], tools: [PortTool], familyItems: [{ id: PORT_TOOL_ID, label: "Port", icon: <CircleDot/> }], toolUi adding [PORT_TOOL_ID] { label: "Port", icon: "geo-ellipse", onSelect → setCurrentTool } } — the popout row's text must be exactly "Port" (the test matches /^\s*port\s*$/i).

Two ideas: everything is a block — a floating port is a one-port node, in the same system slot; never mix data and control lines — its single anchor is a DATA endpoint only, and nothing here draws a line. WHY comments at: the data-block-id/data-port-id nesting ("this is the DOM contract sightPortDots reads"), literal name rendering, canBind. Verify: typecheck; `vitest --project=unit run src/document/documentModel.test.ts -t "ss-port|registry"`; `vitest --project=smoke run src/port.smoke.test.tsx src/app.smoke.test.tsx`. Never edit a test; a failing assertion is reported as FAIL with its text. Commit with explicit pathspecs.

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
