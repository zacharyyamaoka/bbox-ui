# Lane ss:L6 — Archive note: what moved where, and the two-line ARCHIVED banner for /home/bam/systemsketch/README.md (dispatcher applies it)

_Stream plan: `docs/SYSTEMSKETCH-REBUILD-PLAN.md` (read it) · repo: **bbox-ui** · dispatcher-resolved dependencies: none (day-0) · barrier: False_

## Write set (the ONLY paths you may create or edit)
- `docs/SYSTEMSKETCH-ARCHIVE.md`

## Do not touch
- apps/**
- packages/**
- /home/bam/systemsketch/** (you write the banner TEXT into the bbox-ui doc; you never write into the archive)
- docs/SYSTEMSKETCH-REBUILD-PLAN.md

## Acceptance (assertions you cannot edit)
- docs/SYSTEMSKETCH-ARCHIVE.md exists, ≤ 200 lines, and contains a fenced block titled exactly `Banner for /home/bam/systemsketch/README.md` holding two lines that begin with `> **ARCHIVED 2026-09-18**`
- every archive path cited in the doc exists on disk (`test -e` each one; a missing path is a FAIL)
- every bbox-ui path cited exists on the branch (`git ls-files` each one)
- the doc names the archive's run command verbatim from /home/bam/systemsketch/CLAUDE.md:25-27 and its ports table (4321/4322/4323)

Acceptance test files (committed before you existed; read them, never edit them):
- (none committed; the acceptance list above is the bar)

## Builder brief (verbatim from the planner)

You are lane L6 of docs/SYSTEMSKETCH-REBUILD-PLAN.md: a docs-only, adds-only lane. Write ONE file, docs/SYSTEMSKETCH-ARCHIVE.md, and nothing else. Read first: the plan (§0, §1.6, §4 stock-part table, §10–§11), /home/bam/systemsketch/CLAUDE.md (read-only; its run command at :25-27 and ports table at :29-33, the stock-boundary rule at :9-16, the IDE-plugin section), /home/bam/systemsketch/README.md (read-only — you draft a banner FOR it; the dispatcher applies it), and apps/storybook-basics/ARCHITECTURE.md:24-107 ("the trunk" and the measured divergence of the vendored copy — the reason this archive exists). Content, in this order: (1) a title and a three-sentence "why": Zach, ASK 2026-09-18 item 2, quoted verbatim from docs/ASK-2026-09-18-CONTROL-FLOW-AND-SYSTEMSKETCH-REBUILD.md:23-37 — "Honestly I actually don't consider this a refactor. Lets archive this old system sketch. still keep the source code there in case we want to run it, etc. but now lets start again from scratch." (2) "Running the archive": the exact `cd ~/systemsketch && npm run dev` line and the Stable/Preview/Preview-API ports (4321/4322/4323), the note that Zach usually has Stable + Preview running and `ss -ltnp | grep 432` before assuming a port. (3) "What moved where" — a table with one row per archive subsystem, columns Archive path | Status | Where it lives now (bbox-ui) | Notes. Rows at minimum: src/bboxUi/core → SUPERSEDED → apps/storybook-basics/src/components (the trunk); src/bboxUi/adapter/*-shape-util.tsx → SUPERSEDED → apps/systemsketch/src/shapes/{block,code,port}; src/toolbar/SystemSketchToolbar.tsx + toolbarModel.ts → PORTED → apps/storybook-basics/src/components/toolDock.tsx + toolPreferences.ts, wired in apps/systemsketch/src/chrome/dock.tsx; src/chrome/TitleBar.tsx → PORTED → components/chromeBar.tsx; src/chrome/SelectionContextualMenu.tsx → PORTED (shell + placement) → components/floatingToolbar.tsx + floatingToolbar.placement.ts; src/chrome/BoardOverview.tsx → components/framesPanel.tsx; src/diagnostics/BoardDiagnosticsPanel.tsx → components/problemsPanel.tsx; src/contextualMenus/* → components/controlRegistry.ts + controlStrip.tsx + controlPanel.tsx; src/blocks/connections (ConnectionShapeUtil + bindings) → REBUILT → apps/systemsketch/src/shapes/wire; src/blocks/ui/OnCanvasBlockPicker.tsx → editor/edgeDropMenu.tsx; src/blocks/definitions/definitionLinking.ts → scene/linking.ts (not yet wired in the app — follow-up); src/loop, src/branch → REBUILT as apps/systemsketch/src/shapes/region (corner-block design, per Pasted image 20260918150916.png); src/code (CodeShapeUtil, codeClickToEdit) → apps/systemsketch/src/shapes/code + components/codeEditor.tsx; src/workspace (.systemsketch envelope, Python host, autosave) → NOT PORTED (plain .tldr + persistenceKey; follow-up); src/drafts, src/compare, release channels, vscode-systemsketch, src/table, src/behaviorTree, src/callout, src/icon, src/asyncRegion, excalidrawInterop → ARCHIVE ONLY. Verify each archive path with `test -e` before citing it and each bbox-ui path with `git ls-files` (paths in lanes that have not merged yet may be cited as "planned — L<n>" but must be marked so). (4) "Behaviours the rebuild keeps and where each is asserted": tldraw stays stock → apps/systemsketch/src/document/stockBoundary.test.ts; engine-free kits → apps/storybook-basics/src/engineFree.test.ts; the document model → src/document/documentModel.test.ts. (5) the fenced block titled exactly `Banner for /home/bam/systemsketch/README.md` with these two lines and no more: `> **ARCHIVED 2026-09-18** — this app is frozen; it still runs (`cd ~/systemsketch && npm run dev`, Preview on :4322) but no new work lands here.` and `> The rebuild is \`/home/bam/bbox-ui/apps/systemsketch\` ("bbox-ui + stock tldraw"); the map of what moved where is \`/home/bam/bbox-ui/docs/SYSTEMSKETCH-ARCHIVE.md\`.` (6) a closing line saying the banner is applied by the dispatcher, never by an agent writing into the archive. Keep it under 200 lines, no HTML, no tables wider than four columns. Commit with `git add docs/SYSTEMSKETCH-ARCHIVE.md` only. Report the file path and the `test -e` / `git ls-files` results.

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
