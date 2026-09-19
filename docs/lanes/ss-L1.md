# Lane ss:L1 — Code shape: ss-code renders the trunk CodeEditor, focus ↔ editing, per-keystroke writes, grab ring moves it

_Stream plan: `docs/SYSTEMSKETCH-REBUILD-PLAN.md` (read it) · repo: **bbox-ui** · dispatcher-resolved dependencies: ['ss:L0'] · barrier: False_

## Write set (the ONLY paths you may create or edit)
- `apps/systemsketch/src/shapes/code/index.ts (replace placeholder)`
- `apps/systemsketch/src/shapes/code/CodeShapeUtil.tsx`
- `apps/systemsketch/src/shapes/code/CodeTool.ts`
- `apps/systemsketch/src/shapes/code/CodeFace.tsx`

## Do not touch
- apps/systemsketch/src/App.tsx
- apps/systemsketch/src/shapes/registry.ts
- apps/systemsketch/src/shapes/types.ts
- apps/systemsketch/src/shapes/shared/**
- apps/systemsketch/src/shapes/{block,port,wire,region}/**
- apps/systemsketch/src/chrome/**
- apps/systemsketch/src/document/**
- apps/systemsketch/src/**/*.test.ts
- apps/systemsketch/src/**/*.smoke.test.tsx
- apps/systemsketch/vitest.config.ts
- apps/storybook-basics/**
- /home/bam/systemsketch/**

## Acceptance (assertions you cannot edit)
- pnpm --filter systemsketch typecheck exits 0
- pnpm --filter systemsketch exec vitest --project=unit run src/document/documentModel.test.ts -t "ss-code|registry" → passes (registry now lists ss-code)
- pnpm --filter systemsketch exec vitest --project=smoke run src/code.smoke.test.tsx → 4/4 pass
- pnpm --filter systemsketch exec vitest --project=smoke run src/app.smoke.test.tsx still 4/4 (no regression)

Acceptance test files (committed before you existed; read them, never edit them):
- `apps/systemsketch/src/code.smoke.test.tsx`
- `apps/systemsketch/src/document/documentModel.test.ts`

## Builder brief (verbatim from the planner)

You are lane L1 of docs/SYSTEMSKETCH-REBUILD-PLAN.md (read §0–§4, then the ss-code row of §3). L0 has landed: apps/systemsketch exists, `@trunk/*` resolves apps/storybook-basics/src, src/shapes/registry.ts assembles KITS from one index.ts per kind, and src/shapes/code/index.ts is a one-line placeholder exporting EMPTY_KIT. You replace ONLY the contents of src/shapes/code/. First command: `pnpm install --filter systemsketch...` (a fresh worktree has no node_modules). Read before writing: src/shapes/block/* (L0's pattern — you mirror it), src/shapes/shared/{measure.ts,pointerOwnership.ts,nodeShapeComponent.tsx,props.ts}, src/shapes/registry.ts (ShapeKit), the committed src/code.smoke.test.tsx and the ss-code describe in src/document/documentModel.test.ts (your acceptance; off-limits), apps/storybook-basics/src/components/codeEditor.tsx:100-200 (CodeEditorProps: value, onWrite per keystroke, beginEdit, onEditEnd, language, multiline, lineNumbers, columns, className, onEscape, onEnter, onViewReady, autoFocus, disabled), apps/storybook-basics/src/hosts/nodeViews.tsx:272-285 (how the trunk mounts CodeEditor inside a host: multiline, columns = max line length ≥ 8, className POINTER_OWNED_CLASS — "the editor owns its pointer"), apps/storybook-basics/src/hosts/tldrawHost.tsx:310-320 (the 10px host-owned grab ring: "the code face is wall-to-wall editor and the editor owns its pointer — a 10px host-owned grab ring is what makes the shape repositionable at all"), and read-only donors in the archive /home/bam/systemsketch/src/code/codeClickToEdit.ts:23-29 ("the second click is an editing transaction, not a fresh text insertion") and src/code/codeModel.ts:1-60 (languages, size rungs — you keep only the 4-value enum §3 fixes).

What to build. src/shapes/code/CodeShapeUtil.tsx: `class CodeShapeUtil extends ShapeUtil<CodeShape>` with `declare module "@tldraw/tlschema"` for "ss-code"; static type CODE_SHAPE_TYPE; props exactly §3 (`origin: T.nullable(T.object({ uri: T.string, anchor: T.string, contentHash: T.string }))` — reserved verbatim from docs/SOURCE-CODE-VIEW-PLAN.md:103-115 so stream 4 needs no migration; a WHY comment saying its semantics are stream 4's, this lane only reserves the slot); migrations empty sequence; getDefaultProps { w: 320, h: 120, code: "", language: "python", origin: null } (asserted); getGeometry Rectangle2d(w,h,isFilled true); canResize true + onResize resizeBox (from "tldraw"); hideRotateHandle true; canEdit true; canBind → false with a WHY: a code shape speaks no ports (hosts/hostScene.ts:181 "an honest empty, not unknown") so a data line can never land on it; component → <CodeFace shape/>; getIndicatorPath roundRect. src/shapes/code/CodeFace.tsx: use L0's NodeShapeComponent wrapper; inside it a div with `data-slot="code-grab-ring"` (the smoke test queries it) and `style={{ padding: 10 }}` — the ring IS the wrapper's padding, exactly tldrawHost.tsx:315; then the trunk CodeEditor: value={props.code}, multiline, lineNumbers, columns=max(8, longest line), language from a tiny map { python: python(), javascript: javascript(), json: json(), plaintext: undefined } using @codemirror/lang-python / lang-javascript / lang-json (already in the trunk's node_modules; import them from the trunk's package names — they resolve through apps/storybook-basics/node_modules because the trunk file importing CodeEditor sits there; if your own file's import fails to resolve, import the LanguageSupport via a tiny re-export you add in src/shapes/code/languages.ts that imports from "@trunk/components/codeEditorHighlight"-adjacent modules — report which worked), className={POINTER_OWNED_CLASS} ("@trunk/hosts/nodeViews"), onWrite → editor.updateShape({ id, type, props: { code: next } }) — per keystroke, the trunk's one write policy; beginEdit → editor.markHistoryStoppingPoint("code edit") so a whole typing gesture is one Ctrl+Z; onViewReady → attach focus/blur listeners on view.contentDOM: focus → editor.setEditingShape(shape.id), blur → if editor.getEditingShapeId() === shape.id then editor.setEditingShape(null) (WHY: the face is ALWAYS live — no separate edit mode to relearn — and tldraw's notion of "editing" mirrors CodeMirror focus, which is what keeps stock behaviours like arrow keys not panning while typing); onEscape → view.contentDOM.blur() (leaves editing; the value is never discarded — Ctrl+Z is the retract). Measured size: call L0's useMeasuredShape with no port sighting (anchors stay []) so the shape's w/h follow the rendered editor when not resizing; when the user resizes, pass width to CodeEditor via style so it fills. src/shapes/code/CodeTool.ts: `class CodeTool extends BaseBoxShapeTool { static id = CODE_TOOL_ID; static initial = "idle"; shapeType = CODE_SHAPE_TYPE }`. src/shapes/code/index.ts: `export const codeKit: ShapeKit = { shapeUtils: [CodeShapeUtil], bindingUtils: [], tools: [CodeTool], familyItems: [{ id: CODE_TOOL_ID, label: "Code", icon: <Code2/> (lucide) }], toolUi: (editor, tools) => ({ ...tools, [CODE_TOOL_ID]: { id: CODE_TOOL_ID, label: "Code", icon: "tool-text", onSelect: () => editor.setCurrentTool(CODE_TOOL_ID) } }) }` — the row label must contain "Code" (the smoke test finds the popout row by /code/i).

How this lane honors the two ideas: everything is a block — Code is a block-shaped node in the same measured wrapper, one system slot, no second family; never mix data and control lines — canBind false, a code shape is never a wire endpoint. WHY comments at: the grab ring, the focus↔editing mirror, canBind false, the reserved origin. Verify: `pnpm --filter systemsketch typecheck`; `pnpm --filter systemsketch exec vitest --project=unit run src/document/documentModel.test.ts -t "ss-code|registry"`; `pnpm --filter systemsketch exec vitest --project=smoke run src/code.smoke.test.tsx src/app.smoke.test.tsx`. The test drives a real Chromium: dblclick on the face must focus CodeMirror, `{End}{Enter}y = 2` must produce props.code "x = 1\ny = 2", Escape must end editing, a drag on the face must NOT move the shape and a drag on the ring MUST. If a test cannot pass, report FAIL with the assertion text — never edit the test. Commit with explicit pathspecs; report files + command tails + owed items (e.g. a CodeEditor prop the trunk lacks).

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
