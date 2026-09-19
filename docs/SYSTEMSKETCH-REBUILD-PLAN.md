# SYSTEMSKETCH-REBUILD-PLAN — SystemSketch, from scratch, as bbox-ui + stock tldraw

Status: plan, 2026-09-18 (stream 2 of the ASK in `docs/ASK-2026-09-18-CONTROL-FLOW-AND-SYSTEMSKETCH-REBUILD.md`).
Author: Fable 5.1 planning lane. This `.md` is the lane-readable input; the
reviewed deliverable for Zach is the HTML report the dispatcher builds from real
captures AFTER implementation (§12 says what to capture).

Every path below is repo-relative to `/home/bam/bbox-ui` unless it starts with
`/home/bam/systemsketch` (the archive — read-only). "Trunk" means
`apps/storybook-basics/src`. `@trunk/*` is the one path alias the new app uses
for it.

---

## 0 · The one-paragraph answer

Build `apps/systemsketch` in this monorepo: a Vite + React 19 + tldraw 5.3.2
app whose only source of design is the trunk, reached through one alias
(`@trunk/*` → `apps/storybook-basics/src/*`), so there is no vendored copy to
drift. **The tldraw store IS the document** — every bbox thing is a tldraw shape
whose props are the persisted state (`ss-block`, `ss-code`, `ss-port`,
`ss-wire` + `ss-wire-binding`, `ss-region`), which is what makes
`persistenceKey` + stock `.tldr` open/save work with zero backend. The scene
kit runs over a **derived** projection of those records (`sceneFromRecords`),
never over a second state. The trunk's tldraw bench (`hosts/tldrawHost.tsx`) is
the donor for every ShapeUtil pattern (measured `{w,h}`, anchors as geometry
points, `markEventAsHandled` pointer ownership, wires painted from anchors ×
shape transforms) but is **not** imported as the engine — its scene-in-React-
state design cannot persist. Members and regions are **tldraw children**
(`parentId`, stock frame-like containment), which is exactly the scene kit's own
`position`-is-parent-relative contract (`scene/scene.ts:60-63`). ONE toolbar
slot for the system family, through `components.Toolbar` = the trunk's
`ToolDock`. Seven lanes; L0 is the barrier; L1/L2/L3/L6 run in parallel behind
it; L4 (menus) after L1–L3; L5 (regions) waits on stream 1.

---

## 1 · Criteria before options

Weighted for THIS situation — Zach away, builders are fresh Opus agents, the
trunk just absorbed the menu kit, streams 3/4 will target whatever document
model ships tonight:

| # | Criterion | Weight | Why this weight |
|---|---|---|---|
| C1 | **Zero vendoring drift** — the app renders the trunk's actual files | 30 | The ASK's whole reason for item 2: "we have kinda like continually extracted from system sketch and now we are basically going to reimport it." `ARCHITECTURE.md:44-81` measured the last vendor copy diverging within a day. |
| C2 | **tldraw stays stock** — every capability through `shapeUtils`/`tools`/`bindingUtils`/`components`/`overrides`/`onMount` | 20 | `/home/bam/systemsketch/CLAUDE.md:9-16`, asserted by `tests/test_stock_boundary.py`. Non-negotiable ruling. |
| C3 | **Whiteboard with no backend** — `persistenceKey` + `.tldr` round trip of OUR shapes | 20 | ASK item 3: "System sketch should be able to be used with no real backend, then its truly like a whiteboard." |
| C4 | **Buildable tonight in parallel** — statable write sets, day-0 lanes | 15 | Builders never saw this conversation; a lane whose write set collides is a lane that waits. |
| C5 | **Hookable by streams 3/4** — a named document model and a named edit-event seam | 15 | `to_systemsketch()` and `origin` need a contract to aim at; the ASK asks for both as `contracts`. |

### 1.1 Document model — where does the truth live?

| Option | C1 | C2 | C3 | C4 | C5 | Total /100 |
|---|---|---|---|---|---|---|
| **A. Import `TldrawHost` wholesale**: scene in React state, shapes are `{w,h,nodeId}` (`hosts/tldrawHost.tsx:9-17`) | 30 | 20 | **0** — a saved `.tldr` holds `w,h,nodeId` and nothing else; names, ports, code live outside the store | 12 | 8 — stream 3 would target a React state, not a file | 70 |
| **B. tldraw store is the document, scene derived** (this plan) | 27 — the app lifts ~150 lines of host glue from the donor with line-cited provenance; every face, kit and pure function is imported through the alias | 20 | 20 — props validated by `T.*`, persisted by `persistenceKey`, opened/saved by `parseAndLoadDocument`/`serializeTldrawJsonBlob` | 14 | 15 — shape types + validators ARE the contract; `store.listen` diffs ARE the event stream | **96** |
| C. Dual: scene persisted as a custom `records` type beside shapes | 25 | 12 — custom records are opt-in and the archive needed `createSystemSketchStore` + a second util list to make them work (`store/createSystemSketchStore.ts:56-61`) | 16 | 6 — two truths to reconcile on every edit | 10 | 69 |

**Decision: B.** Reversible default: if Zach wants the React-state scene back,
L3's `sceneFromRecords` is the only file that knows how records become a scene.

### 1.2 Engine reuse — import the trunk host, or lift its pattern?

| Option | Verdict |
|---|---|
| Import `TldrawHost` as the engine | Fails C3 (1.1-A). Also fixed-size bench (`width=720`), creates shapes from a scene at mount, `selectNone` — a bench, not an app. |
| **Lift the ShapeUtil pattern into the app** (`src/shapes/shared/*`), import components + scene/editor kits through `@trunk` | Wins. The donor's two rules (`tldrawHost.tsx:9-31`) and gesture boundary (`:150-191`) travel as cited code; the trunk bench stays untouched for its stories. |
| Copy trunk files into the app | Fails C1 outright — this is the vendoring the ASK ends. |

### 1.3 Edges — how is a wire a record?

| Option | Verdict |
|---|---|
| **A wire is a shape + two bindings** (`ss-wire`, `ss-wire-binding`) | Wins. tldraw's own kits do exactly this (`docs/TLDRAW-STARTER-KITS.md:169-206`); the archive did (`blockConnectionShapeUtils` + `blockConnectionBindingUtils`, `App.tsx:130-170`). Selection, delete, undo, copy/paste, persistence all stock. |
| Overlay painted from a node prop (`data.edges`) | Edges become owned by one end; delete-node semantics and dangling detection get hand-rolled. Rejected. |
| Custom record type | 1.1-C's cost for no gain. Rejected. |

### 1.4 Members inside an expanded block — view-kit members or tldraw children?

The trunk hosts render members through the view kit (`hosts/nodeViews.tsx:167-261`,
`childrenOf` → `BlockMembers`); the archive made an expanded Block frame-like
with real child shapes. **Decision: tldraw children.** Interaction geometry
(drag-in/out, clipping, z-order) is host-owned by this repo's own rule
(`ARCHITECTURE.md:213-214`); regions (L5) need frame-like containment anyway;
`scene.parentId` ↔ `shape.parentId` with parent-relative coordinates is a
1:1 field map (`scene/scene.ts:60-63`). Cost accepted: expanded-block
fit-to-content over children is a follow-up (`blockAutoFit.ts` measures view-kit
members, not tldraw children); phase 1 expanded blocks are resized by hand.

### 1.5 The toolbar

| Option | Verdict |
|---|---|
| Stock `DefaultToolbar` + one `TldrawUiMenuItem` for the system family | Keeps tldraw's chrome; but Zach's screenshot (`Pasted image 20260918201649.png`) is the FigJam dock, and the family slot the archive built is now `components/toolDock.tsx` in the trunk. Two toolbars would exist again. |
| **`ToolDock` mounted as `components.Toolbar`** | Wins. One system slot (Zach: "lets just have the 1 icon"), the thesis made literal, the seam is the archive's own (`test_stock_boundary.py:38`, `Toolbar: SystemSketchFigmaToolbar`). Keyboard shortcuts still flow through `overrides.tools` (`useTools` is independent of which Toolbar component renders). |

### 1.6 Location (stated in the ASK, not re-litigated — the trade-off in one paragraph)

`apps/systemsketch` inside this monorepo, importing the trunk through `@trunk/*`.
What it buys: no copy step, the trunk's own `node_modules` resolve every bare
import a trunk file makes (Vite resolves packages relative to the importing
file, and `apps/storybook-basics/node_modules` is populated by the same
`pnpm install`), one `pnpm test` gate per app, and the app's typecheck sees
trunk edits the instant they land. What it costs: the app is coupled to a
Storybook app's `src/` layout (a trunk file moving breaks the alias target —
mitigated by `tsc` catching it), the two packages must resolve identical
`react`/`tldraw` versions or React duplicates (pinned identically; the L0 smoke
test would fail on "invalid hook call" if it ever drifted), and Tailwind must be
told to scan the sibling directory (`@source`, CLAUDE.md's own trap). The
archive at `/home/bam/systemsketch` stays runnable and untouched.

---

## 2 · The settled rulings this plan builds on (do not re-open)

- **tldraw stays stock, 5.3.2 pinned exactly.** `/home/bam/systemsketch/CLAUDE.md:11-16`. A stock-boundary test exists from day 0 (`apps/systemsketch/src/document/stockBoundary.test.ts`, committed with this plan).
- **The core imports no canvas engine.** `CLAUDE.md` "The one rule". `components/`, `scene/`, `editor/`, `presets/`, `layout/` never import `tldraw` or `@xyflow/react` — guarded by `apps/storybook-basics/src/engineFree.test.ts` (committed with this plan, green today). Only `apps/systemsketch/src/**` and `hosts/`/`detach/` may import tldraw.
- **Everything is a block.** Zach, ASK: "the key idea I think was shifting from ... ports on the headers to this idea of a region with a real block ... everything is really a block :)". A loop's header contract is the PORTS OF A REAL `ss-block` in the region's corner (`Pasted image 20260918150916.png`, NEW GOOD), never ports on the region.
- **Never mix data and control lines.** Zach, ASK: "I didn't want to mix data lines and control lines. Because when you read Python code, the control is apparent from the structure itself." Control = containment (`parentId`, regions, arms). Data = `ss-wire` only. Mechanically: `ss-wire-binding` refuses a region target (`RegionShapeUtil.canBind` → false), and `sceneFromRecords` never turns containment into an edge.
- **Region is a node kind, isolated** — `scene/region.ts:4-26`. `DP - Region`: composed using a block in the top-left corner. `DP - Loop`: header typed and unnamed (`for` = `Iterable` in / `Iter` out; `while` = `Bool` in). `DP - Branch`: V1 — no ports on the region, arms fan in at the consumer. `DP - Break & Continue`: break is a mark, not a cable.
- **Elbow is the datum** for data edges (`/home/bam/systemsketch/src/toolbar/toolbarModel.ts:38-46`). `ss-wire.routing` defaults to `"elbow"`.

---

## 3 · The document model (CONTRACT — streams 3 and 4 target this)

All type names live in `apps/systemsketch/src/shapes/types.ts` and are the
strings a saved `.tldr` carries. Validators use `tldraw`'s `T.*` exactly as
written; `getDefaultProps()` returns the defaults column.

```ts
// src/shapes/types.ts — the closed vocabulary
export const BLOCK_SHAPE_TYPE  = "ss-block"        as const;
export const CODE_SHAPE_TYPE   = "ss-code"         as const;
export const PORT_SHAPE_TYPE   = "ss-port"         as const;
export const WIRE_SHAPE_TYPE   = "ss-wire"         as const;
export const REGION_SHAPE_TYPE = "ss-region"       as const;
export const WIRE_BINDING_TYPE = "ss-wire-binding" as const;
export const NODE_SHAPE_TYPES  = ["ss-block","ss-code","ss-port","ss-region"] as const;
// tool ids (BaseBoxShapeTool.id); the wire has no tool — it is a press-drag from a port dot
export const BLOCK_TOOL_ID = "ss-block", CODE_TOOL_ID = "ss-code", PORT_TOOL_ID = "ss-port",
             LOOP_TOOL_ID = "ss-loop", BRANCH_TOOL_ID = "ss-branch";
export const FLOATING_PORT_ID = "port";   // the one portId an ss-port speaks
```

Shared validators (`src/shapes/shared/props.ts`):

```ts
export const PortSpecV   = T.object({ id: T.string, name: T.string, type: T.string });
export const PortAnchorV = T.object({ portId: T.string, x: T.number, y: T.number,
                                      side: T.nullable(T.literalEnum("top","right","bottom","left")) });
export const PointV      = T.object({ x: T.number, y: T.number });
```

| Shape type | props (validator) | default | Notes |
|---|---|---|---|
| `ss-block` | `w: T.number, h: T.number, name: T.string, view: T.literalEnum("simple","port","expanded"), ports: T.object({ left: T.arrayOf(PortSpecV), right: …, top: …, bottom: … }), anchors: T.arrayOf(PortAnchorV)` | `w:160 h:100 name:"block" view:"port" ports:{left:[],right:[],top:[],bottom:[]} anchors:[]` | `anchors` are MEASURED shape-local dot centres written back by the host (`ARCHITECTURE.md:200-209`: "the scene may CONTAIN measurements, it just never TAKES them"); a writer (pyblocks) leaves them `[]` and the first render fills them. `view:"expanded"` makes the shape frame-like; members are child shapes. |
| `ss-code` | `w, h, code: T.string, language: T.literalEnum("python","javascript","json","plaintext"), origin: T.nullable(T.object({ uri: T.string, anchor: T.string, contentHash: T.string }))` | `w:320 h:120 code:"" language:"python" origin:null` | `origin` is RESERVED verbatim from `docs/SOURCE-CODE-VIEW-PLAN.md:103-115` so stream 4 needs no migration; its semantics (`codeOriginState`) are stream 4's, not L1's. A code shape speaks no ports (`hosts/hostScene.ts:181`: "an honest empty"). |
| `ss-port` | `w, h, name: T.string, type: T.string, direction: T.literalEnum("in","out"), anchors: T.arrayOf(PortAnchorV)` | `w:120 h:32 name:"port" type:"" direction:"out" anchors:[]` | The free labeled port. Exactly one anchor, `portId === FLOATING_PORT_ID`. |
| `ss-wire` | `variant: T.literalEnum("data","async","delayed"), routing: T.literalEnum("straight","slanted","curved","elbow"), color: T.string, start: PointV, end: PointV` | `variant:"data" routing:"elbow" color:"" start:{0,0} end:{120,0}` | `start`/`end` are shape-local LOOSE terminal positions, read only for a terminal with no binding (tldraw's arrow pattern). A bound terminal's position is the target's anchor × its page transform. Data lines only — there is no `control` variant and there never will be. |
| `ss-region` | `w, h, kind: T.literalEnum("for","while","branch","plain"), name: T.string, cornerBlockId: T.string, arms: T.arrayOf(T.object({ id: T.string, title: T.string, open: T.boolean, h: T.number }))` | `w:480 h:320 kind:"plain" name:"" cornerBlockId:"" arms:[]` | Frame-like (`BaseFrameLikeShapeUtil`). `cornerBlockId` names the child `ss-block` that IS the header contract (`""` until L5's tool creates it). Never bindable. Never carries a definition. |
| binding `ss-wire-binding` | `terminal: T.literalEnum("start","end"), portId: T.string` | — | `fromId` = the wire, `toId` = an `ss-block` or `ss-port`. `start` = source (arrowhead points at `end`, `components/wiring.ts:39-42`). |

Nesting: a shape's `parentId` is another shape's id when it is a member of an
expanded block or a region; coordinates are parent-relative (tldraw's own rule =
`scene/scene.ts:60-63`). `meta` is free for consumers; stream 3 may stamp
`meta.pyblocks` and stream 4 may stamp nothing (origin is a prop).

### 3.1 The derived scene (`src/document/sceneFromStore.ts`, L3)

```ts
export type DocNodeData = {
  kind: "block" | "code" | "port" | "region";
  name: string;
  view?: "simple" | "port" | "expanded";
  ports?: Partial<Record<"top"|"right"|"bottom"|"left", string[]>>;   // ids only — the scene "only ever names ports; it never places them" (hostScene.ts:32-34)
  portTypes?: Record<string, string>;
  code?: string; language?: string;
  direction?: "in" | "out"; type?: string;
  regionKind?: "for" | "while" | "branch" | "plain"; cornerBlockId?: string;
};
export type DocumentScene = BlockScene<DocNodeData, WireStyleData>;       // scene/scene.ts + scene/sceneWires.ts
export function sceneFromRecords(records: Iterable<TLRecord>): DocumentScene; // pure, node-testable
export function useDocumentScene(editor: Editor): DocumentScene;            // useValue over editor.store
```
Node id = shape id string (`shape:…`). `node.type` = the `kind`. `parentId` =
`shape.parentId` when it is a shape id, absent when it is the page. Edges: one
per `ss-wire` that has BOTH bindings; a half-bound wire is omitted (honest,
never guessed). `edge.data` = `{ variant, routing, color }`. Containment is
never an edge.

### 3.2 The UI-edit-event seam (`src/document/editEvents.ts`, L3 — CONTRACT for stream 3)

```ts
export type EditEvent =
  | { kind: "node.added";   nodeId: string; type: NodeShapeType; parentId: string | null; x: number; y: number; props: Record<string, unknown> }
  | { kind: "node.removed"; nodeId: string; type: NodeShapeType }
  | { kind: "node.moved";   nodeId: string; x: number; y: number; parentId: string | null }
  | { kind: "node.resized"; nodeId: string; w: number; h: number }
  | { kind: "node.changed"; nodeId: string; type: NodeShapeType; fields: string[]; before: Record<string, unknown>; after: Record<string, unknown> }
  | { kind: "wire.added";   wireId: string; from: WireEnd | null; to: WireEnd | null; variant: string }
  | { kind: "wire.removed"; wireId: string }
  | { kind: "wire.rebound"; wireId: string; from: WireEnd | null; to: WireEnd | null };
export interface WireEnd { nodeId: string; portId: string }
export interface EditBatch { source: "user" | "remote"; events: EditEvent[] }
export function editEventsFromDiff(diff: RecordsDiff<TLRecord>, after: (id: string) => TLRecord | undefined): EditEvent[]; // pure
export function subscribeEditEvents(store: TLStore, listener: (batch: EditBatch) => void): () => void;
```
Backed by `store.listen(handler, { source: "all", scope: "document" })`
(`@tldraw/store` `StoreListenerFilters`, `ChangeSource = 'remote' | 'user'`,
`HistoryEntry.changes: RecordsDiff`). One batch per store transaction, so a
wire and its two bindings created in one `editor.run` arrive as ONE
`wire.added` with both ends resolved. `node.changed.fields` never lists `w`,
`h` or `anchors` (geometry/measurement noise) — those are `node.resized` or
nothing. Stream 3 calls `subscribeEditEvents(editor.store, …)` from the app's
`onMount`. Nothing consumes it in this plan (Zach: "UI edit events, that I guess
normally have no consumer").

---

## 4 · Stock-part mapping table

| Element | Today (archive `/home/bam/systemsketch`) | Off-the-shelf part (exact exported name) | Behaviour that must survive |
|---|---|---|---|
| Canvas engine, select/translate/resize/rotate/snap/z-order/camera/undo | stock `<Tldraw>` (`src/App.tsx:342-354`) | `Tldraw` (`tldraw`) with `shapeUtils`, `bindingUtils`, `tools`, `components`, `overrides`, `onMount`, `colorScheme="system"` | Drag from cold moves the shape (`interaction/dragPolicy.ts:6-19`); Ctrl+Z undoes one gesture. |
| Persistence with no backend | `LocalWorkspace` + Python host (`src/workspace/*`) | `persistenceKey` (IndexedDB, cross-tab) | Reload keeps the board. |
| Open / save a file | `.systemsketch` envelope (`src/workspace/systemSketchFile.ts`) | `parseAndLoadDocument`, `serializeTldrawJsonBlob`, `TLDRAW_FILE_EXTENSION` | A plain `.tldr` with our shapes as props round-trips byte-stable through `getSnapshot`/`loadSnapshot`. The envelope is NOT ported (follow-up; a `.tldr` is enough for a whiteboard). |
| Shape creation gesture | `BaseBoxShapeTool` subclasses (`src/bboxUi/adapter/tools.ts:34-38`) | `BaseBoxShapeTool` | Click drops the default size, drag sizes it; tool locking, cancel, history all stock. |
| Block face | `BlockShapeUtil` + vendored core (`src/bboxUi/core/*`) | `Block`, `BlockPort` (`@trunk/components/block`, `@trunk/components/blockPort`) | Header drag surface only (`hosts/tldrawHost.tsx:160-165`); rail reorder via dnd-kit stays the component's; ports collapse in simple view. |
| Code face + click-to-edit | `CodeShapeUtil` + `codeClickToEdit.ts` | `CodeEditor` (`@trunk/components/codeEditor`); `editor.setEditingShape`/`canEdit` | Second click / double-click enters the SAME document (`src/code/codeClickToEdit.ts:23-29`); per-keystroke `onWrite`; Escape leaves; the 10px grab ring moves it (`tldrawHost.tsx:310-315`). |
| Floating port | `FloatingPortShapeUtil` | `LabeledPort` (`@trunk/components/labeledPort`) | One wireable dot with a label; name edits inline. |
| Wire paint | `ConnectionShapeUtil` (custom SVG) | `Trace` (`@trunk/components/trace`), `fanWires` (`@trunk/components/wiring`), `OPPOSITE_DIR` (`trace.layout`) | Arrowhead points at the target; duplicates fan by `DUPLICATE_FAN_PX`; `variant` data/async/delayed paints solid/dashed/dotted; elbow default. |
| Where a dot is | `blockPorts.ts` closed-form + `createComputedCache` | `sightPortDots` (`@trunk/hosts/portDotSightings`) + `editor.screenToPage` + `editor.getPointInShapeSpace` | Anchors survive pan/zoom/rotation (`tldrawHost.tsx:19-31`). |
| Pointer ownership | per-surface clones + `markEventAsHandled` (`src/blocks/memberStackDnd.tsx:485`) | `POINTER_OWNED_CLASS` (`@trunk/hosts/nodeViews`) + `editor.markEventAsHandled` | CodeMirror caret drag never pans the canvas; a rail reorder never translates the block. |
| Tool dock (ONE system slot) | `SystemSketchFigmaToolbar` (two family slots) | `ToolDock`, `FamilyDeclaration`, `resolveCurrentTool` (`@trunk/components/toolDock`); `parseToolbarPreferences` (`@trunk/components/toolPreferences`) | Press arms the remembered member; chevron opens rows; exactly one cube icon. |
| Keyboard shortcuts for our tools | `withBboxTools` (`src/bboxUi/adapter/bboxToolUi.tsx:26-72`) | `TLUiOverrides.tools` entries with `kbd` | `B` = Block. A menu row with no `tools[id]` entry is the silent no-op `test_stock_boundary.py:146-148` warns about. |
| Chrome bar (burger · undo/redo · title) | `TitleBar.tsx` | `ChromeBar`, `MenuSpec` (`@trunk/components/chromeBar`) via `components.InFrontOfTheCanvas`; `components.MainMenu: null`, `MenuPanel: null`, `StylePanel: null`, `NavigationPanel: null` | File actions feed both dropdown and context menu from one list. |
| Floating toolbar over selection | `SelectionContextualMenu.tsx` | `FloatingToolbar`, `placeFloatingToolbar`, `isSelectionOnScreen`, `floatingToolbarMaxWidth` (`@trunk/components/floatingToolbar*`) | Hidden while translating/resizing/brushing; placed above the selection, flips below. |
| Frames / Problems panels + status strip | `BoardOverview.tsx`, `BoardDiagnosticsPanel.tsx` | `FramesPanel`, `ProblemsPanel`, `ProblemsBadge`, `StatusStrip`, `PanelShell` (`@trunk/components/*`); findings from `lintScene` (`@trunk/scene/lint`) | Problems are derived, never stored; clicking a row selects + zooms (`editor.zoomToBounds`). |
| Region container | `RegionShapeUtil` over `BaseFrameLikeShapeUtil` (`src/blocks/RegionShapeUtil.ts`) | `BaseFrameLikeShapeUtil` (`tldraw`): `isFrameLike`, `canReceiveNewChildrenOfType`, `onDragShapesIn`, `providesBackgroundForChildren` | Drag a block in → it becomes a child; region never adopts itself. |
| Scene queries (order, cycles, lint, focus) | `diagnosticsModel.ts` over a live editor | `topologicalOrder`, `findCycles`, `findDanglingEdges` (`@trunk/scene/scene`), `lintScene` (`@trunk/scene/lint`), `focusSnapshot` (`@trunk/scene/focus`), `regionOf` (`@trunk/scene/region`) | Pure over `sceneFromRecords`; identical answers on every host. |
| Applying a scene mutation | n/a | `diffScene` (`@trunk/scene/sceneDiff`) → `editor.run(() => createShapes/updateShapes/deleteShapes)` | One undo step per mutation. |
| Edge dropped on nothing | `OnCanvasBlockPicker.tsx` | `EdgeDropMenu`, `catalogFor` (`@trunk/editor/*`) | An entry the judge refuses is never rendered (`editor/README.md:66-75`). |
| **unchanged (stock seam)** | — | tldraw's own geo/arrow/draw/text/frame/note shapes, `DefaultContextMenu`, `DefaultKeyboardShortcutsDialog`, `DefaultHelpMenu`, pages, export SVG/PNG, `hand`/`eraser`/`laser` tools, the debug panel | Everything a whiteboard already does. We add beside them; we replace only the Toolbar and the four chrome slots listed above. |

---

## 5 · Lanes

Common to EVERY lane (the brief repeats what a builder must not forget):

- Worktree cut from the dispatcher's HEAD; first command
  `pnpm install --filter systemsketch... --filter bbox-storybook-basics...`
  (L0 adds the package; before L0 lands only the second filter exists).
- Gate: `pnpm --filter systemsketch typecheck && pnpm --filter systemsketch test`
  (both vitest projects: `unit` node + `smoke` browser). The acceptance files
  listed per lane are committed with this plan and are OFF-LIMITS to the lane;
  "cannot pass → report FAIL" is a valid deliverable.
- The trunk (`apps/storybook-basics/**`) is READ-ONLY for every lane except
  where a lane's write set names a trunk file. A trunk gap is reported as owed
  wiring, never patched from the app.
- `/home/bam/systemsketch`, `/home/bam/pyblocks`, `/home/bam/zach_brain`: read-only.
- Never `git add -A`; never touch `pnpm-lock.yaml` except L0; ports 4321 4322
  4323 4325 5421 5193 5199 4599 are taken — the app's port is **4340**, vitest
  picks its own.
- WHY comments at every seam named in the brief; provenance line ranges for
  anything lifted from the donor or the archive.
- How the lane honors the two load-bearing ideas is stated in each brief.

| id | title | barrier | day-0 | depends_on | est. lines |
|---|---|---|---|---|---|
| L0 | Scaffold + Block shape + ONE-slot dock + persistence + stock-boundary + smoke | **yes** | yes | — | 900 |
| L1 | Code shape + click-to-edit | no | no (after L0) | L0 | 350 |
| L2 | Floating port shape | no | no (after L0) | L0 | 300 |
| L3 | Wires (shape + bindings + drag gesture), derived scene, edit events | no | no (after L0) | L0 | 900 |
| L4 | Editor menus (chrome bar, floating toolbar, frames, problems, status strip) | no | no | L1, L2, L3 | 800 |
| L5 | Region shapes (Loop, Branch) consuming stream 1 | no | no | L3, `control-flow:region-loop-branch` | 600 |
| L6 | Archive note + banner text | no | yes | — | 120 |

Write sets are disjoint by construction: L0 creates `src/shapes/registry.ts`
and one placeholder `index.ts` per later kind (`code/`, `port/`, `wire/`,
`region/`), each exporting `EMPTY_KIT`; a later lane replaces only its own
directory's contents and never edits `registry.ts` or `App.tsx`.

### L0 — barrier: scaffold, Block, dock, persistence, stock boundary, smoke

**Write set (create):** `apps/systemsketch/{package.json,index.html,tsconfig.json,vite.config.ts,README.md}`, `apps/systemsketch/src/{main.tsx,App.tsx,app.css}`, `src/shapes/{types.ts,registry.ts}`, `src/shapes/shared/{props.ts,measure.ts,pointerOwnership.ts,nodeShapeUtil.tsx}`, `src/shapes/block/{index.ts,BlockShapeUtil.tsx,BlockTool.ts,BlockFace.tsx}`, `src/shapes/{code,port,wire,region}/index.ts` (placeholders), `src/chrome/{dock.tsx,families.tsx,preferences.ts}`, `src/document/testSeam.ts`. **Edit:** `pnpm-workspace.yaml` (add `apps/systemsketch`), `pnpm-lock.yaml` (via `pnpm install`), root `package.json` scripts (`"systemsketch": "pnpm --filter systemsketch run dev"`). **Must satisfy (committed, read-only):** `apps/systemsketch/vitest.config.ts`, `src/testing/harness.tsx`, `src/document/stockBoundary.test.ts`, `src/document/documentModel.test.ts` (the `ss-block` cases; the others stay red until their lanes), `src/app.smoke.test.tsx`.

### L1 — Code shape + click-to-edit

**Write set:** `apps/systemsketch/src/shapes/code/**` (replace the placeholder). **Must satisfy:** `src/code.smoke.test.tsx`, the `ss-code` cases of `documentModel.test.ts`.

### L2 — Floating port shape

**Write set:** `apps/systemsketch/src/shapes/port/**`. **Must satisfy:** `src/port.smoke.test.tsx`, the `ss-port` cases of `documentModel.test.ts`.

### L3 — Wires, derived scene, edit events

**Write set:** `apps/systemsketch/src/shapes/wire/**`, `apps/systemsketch/src/document/{sceneFromStore.ts,editEvents.ts,applySceneDiff.ts}`, `src/shapes/shared/wireGesture.ts`. **Must satisfy:** `src/wiring.smoke.test.tsx`, `src/document/editEvents.test.ts`, the `ss-wire`/binding cases of `documentModel.test.ts`.

### L4 — Editor menus

**Write set:** `apps/systemsketch/src/chrome/{chromeBar.tsx,fileActions.ts,floatingToolbar.tsx,selectionActions.ts,panels.tsx,statusStrip.tsx,problems.ts,frames.ts,overlay.tsx}`; ONE edit to `src/App.tsx` limited to the `COMPONENTS` object (adding `InFrontOfTheCanvas`, nulling `MainMenu`/`MenuPanel`/`StylePanel`/`NavigationPanel`/`HelpMenu`) — L4 is the only lane allowed to touch `App.tsx` after L0, and it runs alone after L1–L3 merge. **Must satisfy:** `src/menus.smoke.test.tsx`.

### L5 — Regions (Loop, Branch) — NOT day-0

**Write set:** `apps/systemsketch/src/shapes/region/**`. **depends_on:** L3 and `control-flow:region-loop-branch` (stream 1's lane that lands the region view components — expected contract in §7). **Must satisfy:** `src/region.smoke.test.tsx`, the `ss-region` cases of `documentModel.test.ts`.

### L6 — Archive note + banner text (docs only, adds-only)

**Write set:** `docs/SYSTEMSKETCH-ARCHIVE.md`. Day-0.

Full builder briefs are in the StructuredOutput (`lanes[].builder_brief`) so a
fresh builder receives them verbatim; this file is the plan the dispatcher and
Zach read.

---

## 6 · How each lane honors the two load-bearing ideas

| Lane | Everything is a block | Never mix data and control lines |
|---|---|---|
| L0 | `ss-block` is THE node primitive; the only face with ports; one system slot. | No lines yet; the `anchors` contract it defines is the only place a data line may attach. |
| L1 | Code is a block-shaped node in the same measured wrapper; speaks no ports (honest empty). | Code shapes are never wire targets (`canBind` false). |
| L2 | A floating port is a one-port node — the smallest block. | Its single anchor is a DATA endpoint only. |
| L3 | Wires attach only to block/port anchors (things that are blocks). | `ss-wire` is the ONLY edge kind; variants data/async/delayed; containment never becomes an edge in `sceneFromRecords`; `RegionShapeUtil.canBind` = false. |
| L4 | Menus mutate the same shapes; no new node kinds. | Problems panel derives from `lintScene` over the projection — a control-flow region can never appear as a dangling edge. |
| L5 | The region's header contract IS a real `ss-block` child in its top-left corner (`cornerBlockId`); the region itself has no ports. | Control flow = containment + arms; a `break` is a glyph mark (follow-up), never a cable; the binding util refuses the region. |
| L6 | documents the above for whoever opens the archive. | — |

---

## 7 · The contract L5 expects from stream 1 (assumption — stream 1's plan was not yet committed when this was written)

Checked: `git log claude/plan-control-flow-2026-09-18` at planning time carried
only a story-tag edit, no plan. L5 therefore assumes the following lands in the
trunk under stream 1's lane id `control-flow:region-loop-branch` (the dispatcher
substitutes the real id):

```ts
// @trunk/components/region.tsx  — the labeled-group look (Pasted image 20260918192040.png)
export interface RegionProps { width: number; height: number; kind: "for"|"while"|"branch"|"plain";
  label?: ReactNode; corner?: ReactNode /* the corner block, painted overlapping the top-left edge */;
  arms?: readonly { id: string; title: string; open: boolean; h: number }[]; children?: ReactNode; className?: string }
export function Region(props: RegionProps): ReactNode;   // props in, DOM out; root carries data-slot="region"
// @trunk/scene/region.ts — already exists (REGION_NODE_TYPE, isRegion, regionOf, boundsOfNodes)
// @trunk/presets/loop/*, @trunk/presets/branch/* — optional; L5 composes Region + BlockPort itself if absent
```
If stream 1 ships a different shape, L5's builder adapts `src/shapes/region/RegionFace.tsx`
only; the `ss-region` props contract (§3) does not move.

---

## 8 · What needs Zach (each with the recommendation and the reversible default)

1. **Shape type prefix `ss-`** (vs the archive's bare `block`/`code`/`loop`). Recommendation: keep `ss-` — avoids colliding with the trunk's `bbox-node` and the frozen adapter's `bbox-block`, and makes a saved file self-describing. Default if silent: `ss-`.
2. **Members are tldraw children, not view-kit `BlockMembers`** (§1.4). Recommendation: yes. Default: yes; the cost is expanded-block auto-fit becomes a follow-up.
3. **`.systemsketch` envelope not ported; plain `.tldr` is the file format.** Recommendation: keep `.tldr` until pyblocks needs a manifest. Default: `.tldr`.
4. **Old archive boards are not openable in the new app** (different shape vocabulary). Recommendation: a one-way importer as a follow-up lane once the vocabulary settles. Default: not built.
5. **Port label shows `name type` in one label** (the trunk's `PortEdgeItem` carries one `label`; the secondary slot is `LabeledPort`-level). Recommendation: accept for phase 1. Default: one label.
6. **Value/pill, glyph, async region, detach-to-primitives, definition linking, tables, behaviour trees, callouts, icons, excalidraw paste**: not in phase 1. Recommendation: value + linking next. Default: follow-ups (§11).

---

## 9 · Not verified

- The exact `vitest/browser` `userEvent` behaviour against tldraw's pointer capture in headless Chromium was not exercised (no app exists yet). The smoke tests use Playwright-backed `userEvent` (real CDP input); if a click at a canvas position does not reach the tool, the harness's fallback (`editor.dispatch` of a `pointer_down`/`pointer_up` pair) is documented in `src/testing/harness.tsx` and may be used by L0 ONLY with a comment saying why.
- That `@import "../../storybook-basics/src/globals.css"` inside the app's CSS resolves `@import "tailwindcss"` / `tw-animate-css` from the sibling's `node_modules` under Tailwind v4's Vite plugin. Expected (node resolution from the importing file); the fallback is declaring `tailwindcss` and `tw-animate-css` as app devDependencies.
- Stream 1's actual component names (§7).
- `Tldraw`'s `getShapeVisibility` prop is present (`@tldraw/editor` d.ts:8077) but its interaction with frame-like `ss-block` in simple view (hiding children) was not driven.

---

## 10 · What the plan deliberately did not do

- Did not port the archive's `installBlockMemberStack`, `installBlockAutoResize`, `installDefinitionLinking`, drafts, compare, workspace/Python host, release channels, VS Code extension. Phase 1 is the whiteboard.
- Did not build a Storybook for the app (CLAUDE.md: opt-in).
- Did not write an HTML report (the dispatcher builds it from captures after implementation, per the ASK).
- Did not touch `/home/bam/systemsketch` (L6 hands the banner text to the dispatcher).

---

## 11 · Follow-ups (need a design Zach has not seen)

- Value capsule shape (`presets/value`), glyph shape (needs `@bbox-ui/glyph-content` copied or aliased), async region.
- Expanded-block fit-to-content over tldraw children (port `installBlockAutoResize` as an `onMount` side-effect).
- Definition linking (`scene/linking.ts` → name commit reconciles occurrences) and the detach-to-primitives kit for the app's shapes.
- Archive-board importer (`.systemsketch` → `ss-*`).
- `break`/`continue` glyph marks (DP - Break & Continue, B5).
- `toSvg` per shape util for PNG/SVG export fidelity (stock export works today but paints HTML shapes via foreignObject).
- Secondary label slot for port types.

---

## 12 · What Zach will see (for the report builder)

Run: `pnpm --filter systemsketch dev` → `http://127.0.0.1:4340`. Capture:

1. The dock with ONE system slot (compare with `Pasted image 20260918201649.png`, which had two).
2. Place a Block; add ports via the floating toolbar (L4) — show anchors moving with pan/zoom.
3. A Code shape: double-click, type, Escape; drag by the ring.
4. Two blocks wired by press-dragging a dot; the elbow trace; a duplicate fanning; variant switch to async.
5. A loop region with its corner block (L5) beside the OLD/NEW image (`Pasted image 20260918150916.png`).
6. Reload the tab (persistence) and open/save `.tldr` from the burger.
7. `pnpm --filter systemsketch test` output: both projects green, the stock-boundary test named.
