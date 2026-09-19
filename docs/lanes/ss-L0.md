# Lane ss:L0 — Scaffold apps/systemsketch: stock tldraw + @trunk alias + Block shape + ONE-slot ToolDock + persistence + stock-boundary + smoke

_Stream plan: `docs/SYSTEMSKETCH-REBUILD-PLAN.md` (read it) · repo: **bbox-ui** · dispatcher-resolved dependencies: none (day-0) · barrier: True_

## Write set (the ONLY paths you may create or edit)
- `apps/systemsketch/package.json`
- `apps/systemsketch/index.html`
- `apps/systemsketch/tsconfig.json`
- `apps/systemsketch/vite.config.ts`
- `apps/systemsketch/README.md`
- `apps/systemsketch/src/main.tsx`
- `apps/systemsketch/src/App.tsx`
- `apps/systemsketch/src/app.css`
- `apps/systemsketch/src/shapes/types.ts`
- `apps/systemsketch/src/shapes/registry.ts`
- `apps/systemsketch/src/shapes/shared/props.ts`
- `apps/systemsketch/src/shapes/shared/measure.ts`
- `apps/systemsketch/src/shapes/shared/pointerOwnership.ts`
- `apps/systemsketch/src/shapes/shared/nodeShapeComponent.tsx`
- `apps/systemsketch/src/shapes/block/index.ts`
- `apps/systemsketch/src/shapes/block/BlockShapeUtil.tsx`
- `apps/systemsketch/src/shapes/block/BlockTool.ts`
- `apps/systemsketch/src/shapes/block/BlockFace.tsx`
- `apps/systemsketch/src/shapes/code/index.ts (placeholder)`
- `apps/systemsketch/src/shapes/port/index.ts (placeholder)`
- `apps/systemsketch/src/shapes/wire/index.ts (placeholder)`
- `apps/systemsketch/src/shapes/wire/createWire.ts (stub)`
- `apps/systemsketch/src/shapes/region/index.ts (placeholder)`
- `apps/systemsketch/src/document/sceneFromStore.ts (stub)`
- `apps/systemsketch/src/document/editEvents.ts (stub)`
- `apps/systemsketch/src/chrome/dock.tsx`
- `apps/systemsketch/src/chrome/families.tsx`
- `apps/systemsketch/src/chrome/preferences.ts`
- `apps/systemsketch/src/chrome/overlay.tsx`
- `apps/systemsketch/src/chrome/fileActions.ts (stub)`
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml (via pnpm install only)`
- `package.json (root; one script line)`

## Do not touch
- apps/systemsketch/vitest.config.ts
- apps/systemsketch/src/testing/**
- apps/systemsketch/src/**/*.test.ts
- apps/systemsketch/src/**/*.smoke.test.tsx
- apps/storybook-basics/** (read-only trunk)
- packages/**
- /home/bam/systemsketch/**
- /home/bam/pyblocks/**
- /home/bam/zach_brain/**
- docs/**

## Acceptance (assertions you cannot edit)
- pnpm install (root) exits 0 and apps/systemsketch/node_modules + apps/storybook-basics/node_modules exist
- pnpm --filter systemsketch typecheck exits 0 (tsconfig includes src, so every committed test file must typecheck against your exports — stubs included)
- pnpm --filter systemsketch exec vitest --project=unit run src/document/stockBoundary.test.ts → all tests pass
- pnpm --filter systemsketch exec vitest --project=unit run src/document/documentModel.test.ts -t "registry|ss-block" → the registry and ss-block describes pass (other describes stay red: not yours)
- pnpm --filter systemsketch exec vitest --project=smoke run src/app.smoke.test.tsx → 4/4 pass in headless Chromium
- pnpm --filter systemsketch dev serves http://127.0.0.1:4340 with --strictPort; a manual placed block survives a reload (persistenceKey)
- apps/storybook-basics: pnpm test-unit still green (you never touched it)

Acceptance test files (committed before you existed; read them, never edit them):
- `apps/systemsketch/vitest.config.ts`
- `apps/systemsketch/src/testing/harness.tsx`
- `apps/systemsketch/src/document/stockBoundary.test.ts`
- `apps/systemsketch/src/document/documentModel.test.ts`
- `apps/systemsketch/src/app.smoke.test.tsx`

## Builder brief (verbatim from the planner)

You are building the barrier lane of docs/SYSTEMSKETCH-REBUILD-PLAN.md (read §0–§5 first, then §3 verbatim — it is the contract your validators must spell). The app is SystemSketch rebuilt as "bbox-ui + stock tldraw": a Vite + React 19 + tldraw 5.3.2 app at apps/systemsketch that imports the trunk (apps/storybook-basics/src) through ONE alias `@trunk/*` and never copies a trunk file. Rulings that bind: tldraw stays stock (5.3.2 exactly; everything through shapeUtils/bindingUtils/tools/components/overrides/onMount); the trunk kits stay engine-free (you only read them); everything is a block (ss-block is the node primitive, the ONE system-family slot is where every node kind will live); never mix data and control lines (no edges this lane — but the `anchors` prop you define is the only place a data line may ever attach). The acceptance harness is already committed and off-limits: apps/systemsketch/vitest.config.ts, src/testing/harness.tsx, src/document/stockBoundary.test.ts, src/document/documentModel.test.ts, src/app.smoke.test.tsx. Read all five before writing a line; they fix your file names, test ids and exports.

STEP 1 — workspace. Add `- apps/systemsketch` to pnpm-workspace.yaml. Add `"systemsketch": "pnpm --filter systemsketch run dev"` to the root package.json scripts (no other root edit). Write apps/systemsketch/package.json: name "systemsketch", private, type module; scripts dev `vite --port 4340 --strictPort`, preview `vite preview --port 4340 --strictPort`, typecheck `tsc -p tsconfig.json`, test `vitest run`, test-unit `vitest --project=unit run`, test-smoke `vitest --project=smoke run`; dependencies: react ^19.0.0, react-dom ^19.0.0, tldraw "5.3.2" (exact — stockBoundary.test asserts it), @tldraw/assets "5.3.2", lucide-react ^1.44.0, bbox-storybook-basics "workspace:*" (WHY, in README: the alias resolves trunk files by path, and every bare import a trunk file makes resolves from apps/storybook-basics/node_modules — declaring the workspace dep is what makes `pnpm install --filter systemsketch...` install the trunk too); devDependencies: @tailwindcss/vite ^4.0.0, tailwindcss ^4.0.0, tw-animate-css ^1.4.0, @types/react ^19, @types/react-dom ^19, @vitejs/plugin-react ^4.3.0, typescript ^5.6.0, vite ^6.0.0, vitest ^4.1.11, @vitest/browser-playwright ^4.1.11, playwright ^1.63.0 (same versions as apps/storybook-basics/package.json so the lockfile reuses them). Run `pnpm install` from the repo root. tsconfig.json: extends ../../tsconfig.base.json; compilerOptions.types ["vite/client"], baseUrl ".", paths { "@trunk/*": ["../storybook-basics/src/*"] }; include ["src", "vite.config.ts", "vitest.config.ts"]. vite.config.ts: plugins react(), tailwindcss(); resolve.alias { "@trunk": path.resolve(__dirname, "../storybook-basics/src") }; server { port: 4340, strictPort: true, fs: { allow: [path.resolve(__dirname, "../..")] } }; optimizeDeps { exclude: ["@tldraw/assets"], include: ["tldraw"] } — copy the WHY from apps/playground/vite.config.ts:7-15 (the ?url imports crash the prebundle scan). index.html: `<div id="root">`, module script /src/main.tsx, title SystemSketch. src/app.css: `@import "../../storybook-basics/src/globals.css"; @source "../../storybook-basics/src"; @source "./";` then `html, body, #root { height: 100%; margin: 0 }` — the @source lines are CLAUDE.md's Tailwind trap ("Tailwind v4 only scans the app's own sources"); if `tailwindcss`/`tw-animate-css` fail to resolve from the sibling CSS, the devDependencies above are the fallback and you say so in the README.

STEP 2 — the vocabulary. src/shapes/types.ts exactly as plan §3 (stockBoundary.test reads every constant). src/shapes/shared/props.ts: PortSpecV, PortAnchorV, PointV as §3 (import `T` from "tldraw"). src/shapes/registry.ts: the ShapeKit interface from the contracts (shapeUtils, bindingUtils, tools, familyItems, toolUi, install?, Overlay?), EMPTY_KIT, KITS = [blockKit, codeKit, portKit, wireKit, regionKit], SHAPE_UTILS/BINDING_UTILS/TOOLS (flatMaps), SYSTEM_FAMILY_ITEMS, withToolUi(editor, tools) folding every kit's toolUi. Placeholders you create and later lanes REPLACE (write the lane name in a one-line comment): src/shapes/code/index.ts `export const codeKit: ShapeKit = EMPTY_KIT;` and the same for port/wire/region. Typecheck stubs the committed later-lane tests import (throw `new Error("not built — see docs/SYSTEMSKETCH-REBUILD-PLAN.md L3/L4")` with the exact exported signatures from the contracts): src/document/sceneFromStore.ts (`sceneFromRecords`, `useDocumentScene`, the DocNodeData/DocumentScene types), src/document/editEvents.ts (`editEventsFromDiff`, `subscribeEditEvents`, EditEvent/EditBatch types), src/shapes/wire/createWire.ts (`createWire(editor, { from, to, variant? })`), src/chrome/fileActions.ts (`serializeBoard(editor): Promise<string>`).

STEP 3 — the Block shape. Donor: apps/storybook-basics/src/hosts/tldrawHost.tsx, READ IT WHOLE. Lift, with `// lifted from hosts/tldrawHost.tsx:L-L` provenance: rule 1 (props are persisted state, :9-17), rule 2 (anchors are geometry points measured once and projected via editor.screenToPage + editor.getPointInShapeSpace, :19-31, code :242-292), the gesture boundary contentOwnsPress (:150-191) into src/shapes/shared/pointerOwnership.ts (import POINTER_OWNED_CLASS from "@trunk/hosts/nodeViews"; block drags ONLY by its own header, resolved through the nearest [data-block-id]; rails and .nodrag are content), and the wrapper component (:235-326) into src/shapes/shared/nodeShapeComponent.tsx (HTMLContainer, overflow visible, pointerEvents all, wrapper div width max-content with onPointerDownCapture → editor.markEventAsHandled when contentOwnsPress). src/shapes/shared/measure.ts: `useMeasuredShape({ shapeId, wrapperRef, nodeId })` — useLayoutEffect every render + rAF + ResizeObserver exactly like :269-292; writes w/h when they differ by >0.5px and the editor is not in select.resizing; sights dots with `sightPortDots` from "@trunk/hosts/portDotSightings", projects to shape-local, equality-guards with the 0.5px rule, and writes `props.anchors`; every measurement write goes through `editor.run(() => editor.updateShape(...), { history: "ignore" })` with a WHY: measurement is not an edit and must never be an undo step. src/shapes/block/BlockShapeUtil.tsx: `class BlockShapeUtil extends BaseFrameLikeShapeUtil<BlockShape>` (import from "tldraw"; declare module "@tldraw/tlschema" TLGlobalShapePropsMap["ss-block"]); static type/props (§3)/migrations `createShapePropsMigrationSequence({ sequence: [] })`; getDefaultProps = §3 defaults (documentModel.test asserts them); isFrameLike = view === "expanded"; canReceiveNewChildrenOfType = view === "expanded" && type !== WIRE_SHAPE_TYPE; providesBackgroundForChildren true; onDragShapesIn refuses a drag containing itself (archive /home/bam/systemsketch/src/blocks/RegionShapeUtil.ts:22-27, read-only); canBind = bindingType === WIRE_BINDING_TYPE && fromShapeType === WIRE_SHAPE_TYPE; canResize true, onResize resizeBox, hideRotateHandle true; getGeometry Rectangle2d(w,h,isFilled true); getIndicatorPath rect; component → <BlockFace shape/>. BlockFace: BlockPort (@trunk/components/blockPort) id={shape.id} view={props.view} edges built from props.ports per side — items `{ id, label: type ? name + " " + type : name, state: wired ? "wired" : undefined }` where wired = useValue over `editor.getBindingsToShape(shape.id, WIRE_BINDING_TYPE)` port ids (stock API; this is how L3's wires light dots without touching this file); onItemsChange writes the new order into props.ports[side] via editor.updateShape (one undo step); inside it the trunk Block (@trunk/components/block) with header={props.name}, width={props.w}, height={view === "expanded" ? props.h : undefined} (hug in simple/port view; measure writes back). src/shapes/block/BlockTool.ts: `class BlockTool extends BaseBoxShapeTool { static id = BLOCK_TOOL_ID; static initial = "idle"; shapeType = BLOCK_SHAPE_TYPE }`. src/shapes/block/index.ts: blockKit with familyItems [{ id: BLOCK_TOOL_ID, label: "Block", icon: <Box/> (lucide), shortcutHint: "B" }] and toolUi adding `[BLOCK_TOOL_ID]: { id, label: "Block", icon: "geo-rectangle", kbd: "b", onSelect: () => editor.setCurrentTool(BLOCK_TOOL_ID) }` — the archive's WHY (/home/bam/systemsketch/src/bboxUi/adapter/bboxToolUi.tsx:15-25): a menu row with no tools[id] entry is a silent no-op.

STEP 4 — the dock and the app. src/chrome/families.tsx: FamilyDeclaration[] for @trunk/components/toolDock (read toolDock.tsx:51-190 for the full interface incl. variantOf/footer): system { id: "system", label: "System design", sections: [{ items: SYSTEM_FAMILY_ITEMS }], prefKey: "lastSystemTool", isMember: id ∈ SYSTEM_FAMILY_ITEMS }; shape { id: "shape", rows rectangle/ellipse/triangle/diamond (geo variants), line, arrow; prefKey "lastShapeTool"; isMember for line/arrow; variantOf: activeToolId === "geo" ? activeVariant : undefined }; draw { draw, highlight; prefKey "lastDrawTool" }. There is exactly ONE `id: "system"` and no `id: "bbox"` (stockBoundary.test greps for both — Zach: "lets just have the 1 icon", Pasted image 20260918201649.png). src/chrome/preferences.ts: load/save a Record<string,string> under localStorage key `systemsketch.dock-preferences.v1`, try/catch, defaults { lastSystemTool: BLOCK_TOOL_ID, lastShapeTool: "rectangle", lastDrawTool: "draw" }. src/chrome/dock.tsx: `SystemSketchDock` — useEditor/useValue: activeToolId = editor.getCurrentToolId(), activeVariant = editor.getStyleForNextShape(GeoShapeGeoStyle); simpleTools select/hand/frame/text (lucide icons, active flag, onSelect → editor.setCurrentTool); onArm/onSelectItem: a geo variant → editor.setStyleForNextShapes(GeoShapeGeoStyle, variant) then setCurrentTool("geo"); otherwise setCurrentTool(id); testIdPrefix "ss-dock". src/chrome/overlay.tsx: `Overlay` rendering `{KITS.map(k => k.Overlay ? <k.Overlay key/> : null)}` (L4 extends this file later). src/App.tsx: `AppProps { persistenceKey?: string | null; onEditorReady?(editor) }`, default key "systemsketch", null → prop omitted; `COMPONENTS: TLComponents = { Toolbar: SystemSketchDock, InFrontOfTheCanvas: Overlay }`; `OVERRIDES: TLUiOverrides = { tools: withToolUi }`; ASSET_URLS = getAssetUrlsByImport() from "@tldraw/assets/imports.vite" (self-hosted, offline — the archive's App.tsx:1,130); onMount runs every kit's install?(editor), then onEditorReady, returns a cleanup calling each stop; render `<main data-testid="systemsketch-app" style={{ position: "fixed", inset: 0 }}><Tldraw shapeUtils={SHAPE_UTILS} bindingUtils={BINDING_UTILS} tools={TOOLS} components={COMPONENTS} overrides={OVERRIDES} onMount={handleMount} persistenceKey={key} colorScheme="system" assetUrls={ASSET_URLS} /></main>` and `import "tldraw/tldraw.css"; import "./app.css"`. stockBoundary.test forbids `setPointerCapture`, `requestAnimationFrame`, `zIndex` and any ShapeUtil subclass in App.tsx — keep App.tsx a composition of seams. src/main.tsx: StrictMode + createRoot(App). README.md: the run line `pnpm --filter systemsketch dev` → http://127.0.0.1:4340, the alias, why the workspace dep, how to test, ports taken (4321-4323, 4325, 5421, 5193, 5199, 4599).

VERIFY, in order: `pnpm --filter systemsketch typecheck`; `pnpm --filter systemsketch exec vitest --project=unit run src/document/stockBoundary.test.ts`; `... run src/document/documentModel.test.ts -t "registry|ss-block"`; `pnpm --filter systemsketch exec vitest --project=smoke run src/app.smoke.test.tsx` (real Chromium — if a Playwright click at a canvas position never reaches the tool, the harness documents an editor.dispatch fallback; you may not edit the test, so report FAIL with the console output rather than patching around it). Then start the dev server on 4340, place a block by hand, reload, confirm it persisted, stop your server. Commit with explicit pathspecs (never git add -A); never touch apps/storybook-basics. Report: files, the four commands' tail output, anything owed.

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
