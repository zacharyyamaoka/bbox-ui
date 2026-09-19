# Lane ss:L4 — Editor menus through tldraw's component seams: chrome bar + undo/redo + file burger, floating selection toolbar, frames and problems panels, status strip

_Stream plan: `docs/SYSTEMSKETCH-REBUILD-PLAN.md` (read it) · repo: **bbox-ui** · dispatcher-resolved dependencies: ['ss:L1', 'ss:L2', 'ss:L3'] · barrier: False_

## Write set (the ONLY paths you may create or edit)
- `apps/systemsketch/src/chrome/overlay.tsx (extend L0's kit-overlay version)`
- `apps/systemsketch/src/chrome/chromeBar.tsx`
- `apps/systemsketch/src/chrome/fileActions.ts (replace stub)`
- `apps/systemsketch/src/chrome/floatingToolbar.tsx`
- `apps/systemsketch/src/chrome/selectionActions.ts`
- `apps/systemsketch/src/chrome/panels.tsx`
- `apps/systemsketch/src/chrome/statusStrip.tsx`
- `apps/systemsketch/src/chrome/problems.ts`
- `apps/systemsketch/src/chrome/frames.ts`
- `apps/systemsketch/src/App.tsx (ONLY the COMPONENTS object: MainMenu/MenuPanel/StylePanel/NavigationPanel/HelpMenu → null; InFrontOfTheCanvas stays Overlay)`

## Do not touch
- apps/systemsketch/src/shapes/**
- apps/systemsketch/src/document/**
- apps/systemsketch/src/chrome/dock.tsx
- apps/systemsketch/src/chrome/families.tsx
- apps/systemsketch/src/chrome/preferences.ts
- apps/systemsketch/src/**/*.test.ts
- apps/systemsketch/src/**/*.smoke.test.tsx
- apps/systemsketch/vitest.config.ts
- apps/storybook-basics/**
- /home/bam/systemsketch/**

## Acceptance (assertions you cannot edit)
- pnpm --filter systemsketch typecheck exits 0
- pnpm --filter systemsketch exec vitest --project=smoke run src/menus.smoke.test.tsx → 6/6 pass
- pnpm --filter systemsketch test → every unit and smoke file green except src/region.smoke.test.tsx and the ss-region describe (L5)

Acceptance test files (committed before you existed; read them, never edit them):
- `apps/systemsketch/src/menus.smoke.test.tsx`

## Builder brief (verbatim from the planner)

You are lane L4 of docs/SYSTEMSKETCH-REBUILD-PLAN.md (read §0–§4; the stock-part table rows for chrome bar, floating toolbar, panels, status strip name your parts). L0–L3 have landed and merged; you run alone. You own src/chrome/* except dock.tsx/families.tsx/preferences.ts, and exactly one edit to src/App.tsx: the COMPONENTS object (add `MainMenu: null, MenuPanel: null, StylePanel: null, NavigationPanel: null, HelpMenu: null`; keep `Toolbar` and `InFrontOfTheCanvas: Overlay`). The stockBoundary test still greps App.tsx — keep it a composition of seams. First: `pnpm install --filter systemsketch...`. Read: the committed src/menus.smoke.test.tsx (your acceptance, off-limits — every test id below comes from it), docs/menus/MENU-KIT-DESIGN.md §4 "The host contract" (lines 656-740: what a host must supply per surface — this lane IS that host), apps/storybook-basics/src/components/chromeBar.tsx:75-176 (MenuSpec/MenuAction/Crumb/ChromeBarProps; testIdPrefix → `${prefix}` root, `${prefix}-burger`), floatingToolbar.tsx:48-167 (x/y/side/visible props; stamps data-slot="floating-toolbar" data-side data-visible) and floatingToolbar.placement.ts (placeFloatingToolbar, isSelectionOnScreen, floatingToolbarMaxWidth, SELECTION_OVERLAY_INSET), framesPanel.tsx:68-170 (FramesItem, FramesPanelProps; rows stamp data-slot="frames-panel-item"), problemsPanel.tsx:46-125 (Severity/Diagnostic/DiagnosticGroup/ProblemsPanelProps; root data-testid=`${testIdPrefix}-problems-panel`), statusStrip.tsx:31-124, panelShell.tsx, toolbar.tsx, apps/storybook-basics/src/scene/lint.ts (lintScene, LintFinding, PortsOf), src/document/sceneFromStore.ts (useDocumentScene — L3's), and tldraw 5.3.2 declarations: TLUiComponents keys, serializeTldrawJson(editor): Promise<string>, serializeTldrawJsonBlob, parseAndLoadDocument, TLDRAW_FILE_EXTENSION, getCanUndo/getCanRedo/undo/redo, getSelectionRotatedScreenBounds, getViewportScreenBounds, zoomToBounds, isIn("select.translating"|"select.resizing"|"select.brushing"), useDialogs/useToasts (node_modules/tldraw/dist-cjs/index.d.ts). Read-only donors in the archive for behaviour only: /home/bam/systemsketch/src/chrome/TitleBar.tsx (burger/file group), SelectionContextualMenu.tsx:107-224 (the placement loop the kit refuses to own), BoardOverview.tsx, diagnostics/BoardDiagnosticsPanel.tsx.

Build. src/chrome/overlay.tsx: keep L0's kit overlays and add, positioned with plain CSS inside tldraw's InFrontOfTheCanvas slot (absolute top-left / bottom-left / right dock — the kit ships zero z-index; you own stacking via a `.ss-chrome` class with the smallest z-index that beats .tl-html-layer, with a WHY), the ChromeBar cluster, the FloatingSelectionToolbar, the StatusStrip and the open panel. src/chrome/fileActions.ts: `serializeBoard(editor) = serializeTldrawJson(editor)`; `saveBoard(editor)` → serializeTldrawJsonBlob → `<a download="board" + TLDRAW_FILE_EXTENSION>`; `openBoard(editor)` → hidden `<input type=file accept=.tldr>` → text → parseAndLoadDocument(editor, text, msg, addToast); `newBoard(editor)` → editor.run(() => editor.deleteShapes(editor.getCurrentPageShapeIds())) after a confirm dialog when the page is non-empty; export `fileActionsFor(editor, helpers): MenuAction[]` with labels "New board", "Open .tldr…", "Save .tldr…" (the test matches /^new/i, /open.*tldr/i, /save.*tldr/i on menuitem text). src/chrome/chromeBar.tsx: `<ChromeBar testIdPrefix="ss-chrome" menu={{ id: "main", label: "SystemSketch", groups: [{ id: "file", items: fileActions }] }} history={{ canGoBack: false, canGoForward: false, onBack, onForward }} (there is no camera history — honest disabled arrows, WHY comment) identity={{ title, statusTone: persisted ? "ok" : "pending", statusLabel: persisted ? "Saved locally" : "Not persisted" }} rename={...state...} crumbs={[]} depth={0} onReturnToRoot={() => editor.zoomToFit()} onJumpToLevel={noop} fileActions={fileActions} />` plus, beside it in one kit `Toolbar`, two `ToolbarButton`s with lucide Undo2/Redo2, `data-testid="ss-chrome-undo"`/`"ss-chrome-redo"`, `disabled={!useValue(editor.getCanUndo())}` etc., onClick editor.undo()/redo() — WHY: the kit's ChromeBar history is depth navigation, not document history, so undo/redo are the app's own buttons, never a re-labelled back/forward. src/chrome/selectionActions.ts + floatingToolbar.tsx: run MENU-KIT-DESIGN §4's loop yourself — measure the rendered pill with a ref + ResizeObserver, read editor.getSelectionRotatedScreenBounds() and the container rect each camera change (useValue on editor.getCamera + selection ids), call placeFloatingToolbar({ selection, menu, viewport, overlayInset: SELECTION_OVERLAY_INSET }) guarded by a monotonic pass counter, gate visible=false while editor.isIn("select.translating"|"select.resizing"|"select.brushing") or nothing selected; render `<FloatingToolbar x y side visible>` with: for a single ss-block a view segmented control (data-testid="ss-selection-view", simple/port/expanded → editor.updateShape props.view), for ss-code a language dropdown, for any selection Duplicate and Delete (data-testid="ss-selection-delete" → editor.deleteShapes(editor.getSelectedShapeIds())). The test asserts the bar sits ABOVE the selected shape (bar bottom ≤ shape top + 2) with data-side="above" and disappears when nothing is selected. src/chrome/problems.ts: `useProblems(editor)` = lintScene over useDocumentScene with portsOf derived from props.ports/FLOATING_PORT_ID (a wire into a nonexistent port is a dangling-edge finding — the test creates one with createWire and expects "1 problem"), mapped to the kit's Diagnostic rows grouped under one DiagnosticGroup labelled "Board"; onReveal → editor.select + zoomToBounds. src/chrome/frames.ts: `useFrames(editor)` = every ss-region and every expanded ss-block on the page as FramesItem (title = props.name, preview from editor.getShapePageBounds), onSelect → editor.zoomToBounds(bounds, { animation: { duration: 0 } }); the test opens the panel, clicks the row whose text contains the block's name and expects the camera to move. src/chrome/statusStrip.tsx + panels.tsx: `<StatusStrip items=[{ id: "frames", label: "Frames", icon, active, onSelect, controlsId } (data-testid via testIdPrefix → the test wants `ss-status-frames` and `ss-status-problems`: pass ids the kit stamps, or wrap each item so the element clicked carries that test id — read statusStrip.tsx:31-60 for what it stamps), { id: "problems", icon: <ProblemsBadge count/>, ... }]>{zoom readout}</StatusStrip>`; a PanelShell hosting FramesPanel or ProblemsPanel (testIdPrefix="ss" → `ss-problems-panel`; empty copy must read "0 problems" or "No problems"), one open at a time, Escape closes.

Two ideas: everything is a block — no new node kinds, menus mutate the same shapes; never mix data and control lines — problems derive from lintScene over L3's projection, where containment is never an edge. WHY comments at: the stacking class, the undo/redo split, the placement loop's gate, the derived-not-stored problems. Verify: typecheck; `vitest --project=smoke run src/menus.smoke.test.tsx`; then the whole gate `pnpm --filter systemsketch test` (everything green except region). Never edit a test. Commit with explicit pathspecs; report what the kit lacked (owed upstream).

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
