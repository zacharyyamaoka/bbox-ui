# Lane pb:trunk-loader-events — bbox-ui trunk: PyblocksScene loader + layout, SceneEvent derivation + seam, pyblocks client, backend setting, port labels, proof stories

_Stream plan: `docs/PYBLOCKS-BACKEND-PLAN.md` (read it) · repo: **bbox-ui** · dispatcher-resolved dependencies: ['cf:A'] · barrier: True_

## Write set (the ONLY paths you may create or edit)
- `apps/storybook-basics/src/scene/pyblocksScene.ts (fill the committed skeleton; keep every exported type/name)`
- `apps/storybook-basics/src/scene/sceneEvents.ts (fill the skeleton)`
- `apps/storybook-basics/src/backend/backendSetting.ts (fill the skeleton)`
- `apps/storybook-basics/src/backend/pyblocksClient.ts (fill the skeleton)`
- `apps/storybook-basics/src/hosts/hostScene.ts (ADDITIVE: `portLabels?: Record<string,string>; portTypes?: Record<string,string>;` on HostNodeData only)`
- `apps/storybook-basics/src/hosts/nodeViews.tsx (ONE line at ~:227: `label: node.data.portLabels?.[id] ?? id`)`
- `apps/storybook-basics/src/stories/PyblocksScene.stories.tsx (new)`

## Do not touch
- apps/storybook-basics/src/scene/pyblocksScene.test.ts
- apps/storybook-basics/src/scene/sceneEvents.test.ts
- apps/storybook-basics/src/backend/backendSetting.test.ts
- apps/storybook-basics/src/backend/pyblocksClient.test.ts
- docs/fixtures/pyblocks-scene/**
- apps/storybook-basics/src/scene/scene.ts
- apps/storybook-basics/src/scene/sceneDiff.ts
- apps/storybook-basics/src/scene/history.ts
- apps/storybook-basics/src/scene/region.ts
- apps/storybook-basics/src/scene/collapse.ts
- apps/storybook-basics/src/scene/boundary.ts
- apps/storybook-basics/src/hosts/tldrawHost.tsx
- apps/storybook-basics/src/hosts/domCanvas.tsx
- apps/storybook-basics/src/hosts/reactFlowHost.tsx
- apps/storybook-basics/src/hosts/portDotSightings.ts
- apps/storybook-basics/.storybook/**
- packages/**
- apps/docs/**
- apps/storybook/**
- registry.json

## Acceptance (assertions you cannot edit)
- cd apps/storybook-basics && pnpm exec vitest --project=unit run src/scene/pyblocksScene.test.ts src/scene/sceneEvents.test.ts src/backend  → `Test Files 4 passed (4)` and `Tests 40 passed (40)`
- cd apps/storybook-basics && pnpm typecheck → exit 0
- cd apps/storybook-basics && pnpm test-unit → no pre-existing test red (1023 green at planning time)
- cd apps/storybook-basics && STORYBOOK_PORT=<free 54xx> pnpm test-stories → green, including every play function in src/stories/PyblocksScene.stories.tsx
- In the DOM Canvas story of linear_chain: `[data-slot="wire-layer"]` has `data-unresolved-wires=""`, `[data-port-id="in-raw"]` renders the text `raw` (not `in-raw`), and exactly one `[data-scene-node]` (the root region) exists with `[data-block-id]` for decode/scale inside it
- In the tldraw story of region_for_if: the play function READS `data-unresolved-wires` and records the count in a visible caption — it does not assert zero (known host gap, plan §10/F4)

Acceptance test files (committed before you existed; read them, never edit them):
- `apps/storybook-basics/src/scene/pyblocksScene.test.ts`
- `apps/storybook-basics/src/scene/sceneEvents.test.ts`
- `apps/storybook-basics/src/backend/backendSetting.test.ts`
- `apps/storybook-basics/src/backend/pyblocksClient.test.ts`
- `docs/fixtures/pyblocks-scene/linear_chain.scene.json`
- `docs/fixtures/pyblocks-scene/region_for_if.scene.json`
- `docs/fixtures/pyblocks-scene/events_edit_session.json`

## Builder brief (verbatim from the planner)

You are filling four committed TypeScript skeletons in the bbox-ui trunk (apps/storybook-basics) so that four committed acceptance files go green, adding two lines to the shared host contract, and writing one proof story. The skeletons' headers and doc comments ARE the spec; the tests are off-limits.

SET UP. Cut your worktree from commit d63ac62 on `claude/plan-pyblocks-backend-2026-09-18` (`.claude/settings.json` carries `worktree.baseRef: "head"`); then `pnpm install --filter bbox-storybook-basics...` (fresh worktrees have zero node_modules). Never touch :5421 (Zach's Storybook); use `STORYBOOK_PORT=54xx` for your own.

READ FIRST: `docs/PYBLOCKS-BACKEND-PLAN.md` §3.2–3.4 and §5; `docs/fixtures/pyblocks-scene/README.md` and the three `*.json` fixtures in full; the four skeletons `src/scene/pyblocksScene.ts`, `src/scene/sceneEvents.ts`, `src/backend/backendSetting.ts`, `src/backend/pyblocksClient.ts`; the four tests beside them. Donors to cite by line: `src/scene/scene.ts:145-151` (`portKey`), `:198-272` (`dependencyGraph`, `topologicalOrder`, `rank` — import `rank`, do not re-implement), `:424-446` (`findDanglingEdges` — reuse for parse validation with `hostPortsOf`); `src/scene/region.ts:60-66`; `src/scene/sceneDiff.ts:169-184` (identity fields), `:249-289` (the union-in-order idiom — private, re-express it), `:317-382` (`diffScene` — import it; it gives you added/removed/modified nodes, edges and port added/removed rows; it EXCLUDES position, which you add); `src/scene/history.ts:99-105` (`AuthorId`, `authorId`), `:197-199` (`shouldNotify` — import it for the seam's self-skip); `src/hosts/hostScene.ts:25-67` (`HostNodeData`), `:169-205` (`hostPortsOf`, `hostPolarityOf`); `src/hosts/nodeViews.tsx:220-236` (the port item mapping — your one-line edit); `src/hosts/domCanvas.tsx` and `src/stories/SceneHosts.stories.tsx:1-130` (story pattern: `required()`, `waitFor`, `data-unresolved-wires`); the notebook lab's client shape: `git show claude/canvas-jupyter-execution-871b9c:apps/notebook-lab/src/labClient.ts` (plain fetch + JSON; copy the shape, never import the branch).

IMPLEMENT. (1) `parsePyblocksScene(json)`: type-guard the document; throw `PyblocksSceneError` for wrong `schemaVersion`/`kind`, a non-object, a node missing `id`/`position`/`data.pyblocks`, a `parentId` naming no node, an edge end naming no node, any `scene.edges[].data.pyblocks.kind` not in {data, state}, any handle ending `__inner`; return the SAME object graph (the test compares `JSON.stringify` to the raw input). (2) `layoutUnplaced(scene, isUnplaced?)`: default predicate `data.pyblocks?.authoredPosition === false`; group nodes by `parentId` (top level = undefined); per group compute `rank({nodes: siblings, edges: edges with both ends in the group})`, place each unplaced sibling at `x = 40 + 320·rank`, `y = 40 + 160·i` where `i` counts unplaced siblings sharing that rank in scene order and blocked nodes get `rank = max finite + 1`; authored nodes untouched; return the same object when nothing is unplaced. (3) `loadPyblocksScene(json)`: parse → layout → `{scene, document, problems}` where `scene` is `{nodes, edges}` of the document (controlEdges never enter it) and `problems` lists any `findDanglingEdges(scene, hostPortsOf(scene))` hit as text. (4) `deriveSceneEvents(before, after)`: use `diffScene(before, after, {before: hostPortsOf(before), after: hostPortsOf(after)})`, then emit in EXACTLY the order the skeleton documents (nodes in before-order then after-only; per node added|removed → moved → resized → reparented → renamed → view-changed → code-changed → value-changed → ports-reordered per wall left,right,top,bottom (same id set, different order) → port-added (after order) → port-removed (before order) → port-renamed (portLabels diff, after key order) → data-changed for remaining keys sorted (exclude name, view, w, h, code, value, ports, portLabels, writers, readers, content); then edges connected|disconnected → rewired (source/sourceHandle/target/targetHandle) → wire-data-changed sorted keys). `node-moved` compares `position` yourself. `node-resized` carries both w and h from `data` on each side. An added/removed node emits nothing else about itself. The fixture `events_edit_session.json` pins 13 events; `toEqual` means undefined-vs-absent matters: emit `from: undefined` keys the way the fixture shows them (compare against the fixture's JSON, where absent means undefined). (5) `createSceneEventSeam()`: a `Set` of `{listener, subscriber?}` closures, `publish` iterates a copy and skips when `subscriber !== undefined && !shouldNotify(batch, subscriber)`, `size` is a getter; no module-level state. (6) `normalizePyblocksUrl`: `new URL(text.trim())`, protocol http:/https: only, return `url.origin`, else null. `parseBackendSetting`: total per its doc. (7) `createPyblocksClient(url, fetchImpl)`: `health()` GETs `${url}/api/health`, returns `{ok:false, reason}` on throw/non-2xx/non-JSON/missing `analyzer`, else `{ok:true, health, capabilities: {scene: systemsketch?.scene === 1, events: systemsketch?.events === 1}}`; `scene()` POSTs JSON `{source, filename, viewId}` with `Content-Type: application/json`, throws `PyblocksRequestError(body.error ?? statusText, status, route)` on non-2xx, returns `parsePyblocksScene(body)`; `events([])` resolves `{accepted:0, applied:0, classified:[]}` without fetching, else POSTs `{batches}` and returns the body. (8) `hostScene.ts`: add the two optional keys to `HostNodeData` with a doc comment; `nodeViews.tsx:227`: `label: node.data.portLabels?.[id] ?? id` — nothing else changes there.

STORY `src/stories/PyblocksScene.stories.tsx`, title `Blocks/Scene/Pyblocks`, tags `["area:blocks", "lane:pyblocks-backend"]`, import the fixtures with `import linear from "../../../../docs/fixtures/pyblocks-scene/linear_chain.scene.json"` (resolveJsonModule is on in tsconfig.base.json; if Vite refuses the path outside the app root, the fix is `server.fs.allow` in `.storybook/main.ts`'s `viteFinal` — that single key is the ONE exception to the .storybook do-not-touch). Four stories with play functions: `LinearChainDomCanvas` (asserts one `[data-scene-node]`, decode/scale `[data-block-id]` inside it, port label text `raw`, `data-unresolved-wires=""`), `RegionForIfDomCanvas` (caption: `${document.controlEdges.length} control edges kept aside, 0 drawn`; asserts 11 `[data-block-id]` and the caption text), `RegionForIfTldraw` (`TldrawHost` from `../hosts/tldrawHost`; play reads `data-unresolved-wires`, writes the count into a caption, asserts the caption exists — do NOT assert zero, the member-anchor gap is known), `EditSessionEvents` (renders before/after in two DomCanvases and the 13 derived events as a list; a seam counter reading `size: 0`; play asserts 13 rows and `0`).

WHY COMMENTS: at the parse refusals (control kind / `__inner` — never mix data and control); at layout (pyblocks never invents geometry; `rank()` reused, not ported); at `deriveSceneEvents` (scene diff at the onSceneChange seam, not the tldraw store — the header already says why, keep it); at the seam (zero default subscribers — Zach's "normally have no consumer"); at `portLabels` (truthful property rendering; ids stay semantic ids so events can name the block again); at `none` in the setting (a whiteboard with no backend renders nothing pyblocks).

VERIFY, in this order: `pnpm typecheck` (exit 0), `pnpm exec vitest --project=unit run src/scene/pyblocksScene.test.ts src/scene/sceneEvents.test.ts src/backend` (40/40), `pnpm test-unit` (no regressions), `STORYBOOK_PORT=54xx pnpm test-stories` (green; never trust `storyRenders` — repo CLAUDE.md). Take a screenshot of each new story and look at it. If an assertion cannot be met, report FAIL with the exact output; never edit a test or a fixture. Commit with explicit pathspecs on your lane branch; do not merge; report the `git diff --stat`.

## Contracts of this stream (for reference; the plan .md has the full context)

### PyblocksSceneDocument v1 (the document pyblocks emits and the app loads)
_owner: trunk-loader-events · consumers: pyblocks-scene-projection, app-backend-wiring, systemsketch-rebuild_

```
// Authoritative TS: apps/storybook-basics/src/scene/pyblocksScene.ts (committed skeleton). Frozen bytes: docs/fixtures/pyblocks-scene/{linear_chain,region_for_if}.scene.json
interface PyblocksSceneDocument {
  schemaVersion: 1;
  kind: "pyblocks-scene";
  source: { uri: string; sha256: string | null; selectedViewId: string | null; title: string | null };
  scene: {
    nodes: Array<{
      id: string;                      // BlockView block id, verbatim
      type: "region" | "block" | "value";
      position: { x: number; y: number };   // authored, or {0,0} when authoredPosition=false
      parentId?: string;
      data: {
        name: string;
        view?: "simple" | "port" | "expanded";  w?: number; h?: number;   // block/region
        ports?: { left?: string[]; right?: string[] };                     // block/region; NO __inner ids
        membersLayout?: "free"; autoFit?: true;                             // region
        control?: { kind: string; head: string };                            // region: for|while|if|try|...|function
        value?: string; writers?: string[]; readers?: string[];              // value
        portLabels?: Record<string, string>;   // only NAMED ports; face falls back to id
        portTypes?: Record<string, string>;
        description?: string;
        pyblocks: { blockId: string; semanticKind: string | null; role: string | null; effect: string | null;
                    certainty: string | null; sourceSpan: { startLine; startColumn; endLine; endColumn; columnEncoding } | null;
                    authoredPosition: boolean };
      };
    }>;
    edges: Array<{ id: string; source: string; sourceHandle: string; target: string; targetHandle: string;
      data: { variant: "data" | "delayed"; pyblocks: { edgeId: string; kind: "data" | "state"; label?: string;
              certainty?: string; innerSource?: true; innerTarget?: true } } }>;
  };
  controlEdges: Array<{ id: string; kind: string; source: { nodeId: string; portId: string }; target: { nodeId: string; portId: string }; label?: string }>; // raw ids, never drawn
  views: Array<{ id: string; title: string }>;
  diagnostics: Array<{ severity: "error" | "warning" | "info"; message: string }>;
}
```

### SceneEvent union + SceneEventBatch + SceneEventSeam
_owner: trunk-loader-events · consumers: pyblocks-scene-projection, app-backend-wiring_

```
// Authoritative TS: apps/storybook-basics/src/scene/sceneEvents.ts. Frozen order: docs/fixtures/pyblocks-scene/events_edit_session.json (13 events)
type SceneEvent =
  | { type: "node-added"; nodeId: string; node: SceneNode<HostNodeData> }
  | { type: "node-removed"; nodeId: string; node: SceneNode<HostNodeData> }
  | { type: "node-moved"; nodeId: string; from: { x: number; y: number }; to: { x: number; y: number } }
  | { type: "node-resized"; nodeId: string; from: { w?: number; h?: number }; to: { w?: number; h?: number } }
  | { type: "node-reparented"; nodeId: string; from?: string; to?: string }
  | { type: "node-renamed"; nodeId: string; from?: string; to?: string }
  | { type: "node-view-changed"; nodeId: string; from?: "simple"|"port"|"expanded"; to?: "simple"|"port"|"expanded" }
  | { type: "code-changed"; nodeId: string; from?: string; to?: string }
  | { type: "value-changed"; nodeId: string; from?: string; to?: string }
  | { type: "ports-reordered"; nodeId: string; side: "left"|"right"|"top"|"bottom"; from: string[]; to: string[] }
  | { type: "port-added"; nodeId: string; portId: string; side?: BlockSide }
  | { type: "port-removed"; nodeId: string; portId: string; side?: BlockSide }
  | { type: "port-renamed"; nodeId: string; portId: string; from?: string; to?: string }
  | { type: "wire-connected"; edgeId: string; edge: SceneEdge<WireStyleData> }
  | { type: "wire-disconnected"; edgeId: string; edge: SceneEdge<WireStyleData> }
  | { type: "wire-rewired"; edgeId: string; from: SceneEdgeEnds; to: SceneEdgeEnds }
  | { type: "data-changed"; nodeId: string; key: string; from?: unknown; to?: unknown }
  | { type: "wire-data-changed"; edgeId: string; key: string; from?: unknown; to?: unknown };
interface SceneEventBatch { id: string; author: AuthorId; label: string; at: string /*ISO*/; documentUri?: string; events: SceneEvent[] }
interface SceneEventSeam { publish(batch: SceneEventBatch): void; subscribe(listener: (b: SceneEventBatch) => void, subscriber?: AuthorId): () => void; readonly size: number }
// ORDER (contract): nodes in before-order then after-only ids; per node: added|removed (exclusive, nothing else for that node) → moved → resized → reparented → renamed → view-changed → code-changed → value-changed → ports-reordered (left,right,top,bottom) → port-added (after order) → port-removed (before order) → port-renamed (port id order in after) → data-changed (sorted keys, excluding name/view/w/h/code/value/ports/portLabels/writers/readers/content). Then edges in union order: connected|disconnected → rewired → wire-data-changed (sorted keys). Identical scenes → [].
// CLASSIFICATION (pyblocks classify_scene_events): semantic = node-added, node-removed, node-reparented, node-renamed, code-changed, value-changed, port-added, port-removed, port-renamed, wire-connected, wire-disconnected, wire-rewired; presentation = node-moved, node-resized, node-view-changed, ports-reordered; unknown = data-changed, wire-data-changed.
```

### pyblocks HTTP routes (server.py) + client (src/backend/pyblocksClient.ts) + setting (src/backend/backendSetting.ts)
_owner: pyblocks-scene-projection · consumers: trunk-loader-events, app-backend-wiring_

```
GET  /api/health            -> existing payload + "systemsketch": {"scene": 1, "events": 1}
POST /api/systemsketch/scene   body {source: string (required), filename?: string (default "untitled.py"), viewId?: string|null, flat?: boolean}
                              -> 200 PyblocksSceneDocument (views/diagnostics filled from AnalysisResult); 400 {"error": msg} on bad input; 500 {"error": msg} on analysis failure (same shape as /api/analyze, server.py:167-183)
POST /api/systemsketch/events  body {batches: SceneEventBatch[]}
                              -> 200 {accepted: number, applied: 0, classified: [{batchId: string, events: [{eventIndex: number, type: string, class: "semantic"|"presentation"|"unknown", reason: string}]}]}; 400 {"error": msg} when batches is not a list of {id: string, events: {type: string}[]}
// Both POSTs join the whitelist at server.py:123-130; Content-Type must be application/json; body cap MAX_SOURCE_BYTES; CORS: any 127.0.0.1/localhost/::1 origin (server.py:59, 676-680). Never bind 4321/4325/5421/5193/5199/4599.

// TS client (skeleton committed): createPyblocksClient(url: string, fetchImpl = fetch): { url; health(): Promise<{ok:true; health; capabilities:{scene:boolean; events:boolean}} | {ok:false; reason:string}>; scene(req: {source; filename; viewId?}): Promise<PyblocksSceneDocument /* after parsePyblocksScene */>; events(batches: SceneEventBatch[]): Promise<PyblocksEventsEcho> }  — non-2xx throws PyblocksRequestError(message=server error text, status, route); health never throws; events([]) sends nothing.
// Setting (skeleton committed): type BackendSetting = {kind:"none"} | {kind:"pyblocks"; url:string}; BACKEND_SETTING_STORAGE_KEY = "systemsketch.backend.v1"; DEFAULT_PYBLOCKS_URL = "http://127.0.0.1:4177"; NO_BACKEND; normalizePyblocksUrl(text): string|null (http(s) origin only); parseBackendSetting(raw): total, garbage -> NO_BACKEND; serializeBackendSetting(s): string.
```
