# Lane pb:app-backend-wiring — apps/systemsketch: Backend setting (none | pyblocks @ url) with health, Open Python file…, scene-event bridge + pyblocks consumer stub

_Stream plan: `docs/PYBLOCKS-BACKEND-PLAN.md` (read it) · repo: **bbox-ui** · dispatcher-resolved dependencies: ['ss:L0', 'ss:L3', 'ss:L4', 'pb:trunk-loader-events', 'pb:pyblocks-scene-projection'] · barrier: False_

## Write set (the ONLY paths you may create or edit)
- `apps/systemsketch/src/backend/BackendSettings.tsx (new)`
- `apps/systemsketch/src/backend/OpenPython.tsx (new)`
- `apps/systemsketch/src/backend/useSceneEventBridge.ts (new)`
- `apps/systemsketch/src/backend/pyblocksConsumer.ts (new)`
- `apps/systemsketch/src/backend/backend.test.ts (new)`
- `apps/systemsketch/tests/pyblocks_backend_smoke.mjs (new, in the app's own harness style)`
- `EXACTLY two lines in the app shell file the systemsketch-rebuild plan names (one import, one mount) and one menu-item registration the way that plan registers items`

## Do not touch
- apps/storybook-basics/** (trunk-loader-events owns it; import through the app's alias only)
- every other apps/systemsketch file stream 2 owns, beyond the two lines + one registration
- pyblocks/**
- packages/**
- docs/fixtures/pyblocks-scene/**

## Acceptance (assertions you cannot edit)
- With the default setting (`none`) the rendered app contains no element whose text or data-* attribute mentions `pyblocks`, and a fetch spy records zero calls
- Setting `pyblocks` with no server running shows the health reason in the settings row and the `Open Python file…` menu item is absent
- With `python3 -m pyblocks serve --no-browser --port <free>` running and the setting pointed at it, the health pill reads ok, the menu item appears, opening a temp file holding the linear_chain source (a `run`/`decode`/`scale` def) produces a board titled after the file with the boundary region as the only top-level bbox-node shape and decode/scale/literal inside it
- Dragging a shape publishes exactly one SceneEventBatch containing one `node-moved` event; the server echo shows `class: "presentation"` and the app's status line shows `1 batch · 0 semantic · 0 applied`
- Renaming a block header publishes one `node-renamed` event echoed `semantic`
- Switching the setting back to `none` detaches the consumer (`seam.size === 0`) and removes every pyblocks element
- apps/systemsketch unit tests green; `git diff --stat` shows nothing under apps/storybook-basics

Acceptance test files (committed before you existed; read them, never edit them):
- `NOT COMMITTABLE TONIGHT: apps/systemsketch does not exist on this branch. The dispatcher commits `apps/systemsketch/src/backend/backend.test.ts` and `apps/systemsketch/tests/pyblocks_backend_smoke.mjs` with the assertions above BEFORE dispatching this lane, once stream 2's scaffold has landed; until then the assertions in `docs/PYBLOCKS-BACKEND-PLAN.md` §6 L3 are the bar.`

## Builder brief (verbatim from the planner)

You are wiring the optional pyblocks backend into the rebuilt SystemSketch app (`apps/systemsketch`, built tonight by the systemsketch-rebuild stream: bbox-ui trunk + stock tldraw). Everything shareable already exists in the trunk; you add React, a setting, a file picker and a consumer stub. No new contract: the document, the events and the client are frozen.

SET UP. Your worktree branches from the integration branch AFTER `trunk-loader-events` and stream 2's app shell have merged (the dispatcher tells you the ref). `pnpm install --filter <the app's package name>...`. Start a pyblocks server for yourself on a FREE port: `cd /home/bam/pyblocks/.claude/worktrees/systemsketch-scene && python3 -m pyblocks serve --no-browser --port 0` prints `serving … at http://127.0.0.1:<port>` — use that URL; never bind 4321/4325/5421/5193/5199/4599. Read stream 2's plan for: the app shell file, how menu items are registered, where settings rows live, and whether the app keeps a `HostScene` as its document with an `onSceneChange(next)` seam (the trunk's `tldrawHost.tsx:523-528` posture) or treats tldraw's store as the document. If the latter, add a store→scene projection inside `useSceneEventBridge.ts` first — `deriveSceneEvents` takes two `HostScene`s.

READ FIRST: `docs/PYBLOCKS-BACKEND-PLAN.md` §3.3 (the toggle), §3.4 (events), §6 L3, §7 item 3, §10; trunk modules you IMPORT through the app's alias and never copy: `src/backend/backendSetting.ts` (`BackendSetting`, `NO_BACKEND`, `DEFAULT_PYBLOCKS_URL`, `BACKEND_SETTING_STORAGE_KEY`, `parseBackendSetting`, `serializeBackendSetting`, `normalizePyblocksUrl`), `src/backend/pyblocksClient.ts` (`createPyblocksClient(url, fetch)`, `PyblocksRequestError`), `src/scene/pyblocksScene.ts` (`loadPyblocksScene`, `PyblocksSceneError`), `src/scene/sceneEvents.ts` (`deriveSceneEvents`, `createSceneEventSeam`, `SceneEventBatch`), `src/scene/history.ts` (`authorId`), `src/hosts/hostScene.ts` (`HostScene`). Also read the fixture `docs/fixtures/pyblocks-scene/linear_chain.blockview.json` to write the smoke test's `.py` source (a `run(raw)` calling `decode(raw)` then `scale(frame, 2.0)`).

BUILD. (1) `BackendSettings.tsx`: one settings row `Backend` with a select `none | pyblocks` and, when pyblocks, a URL input prefilled with `DEFAULT_PYBLOCKS_URL` and a health pill. State lives in the app (`useState` seeded from `localStorage[BACKEND_SETTING_STORAGE_KEY]` through `parseBackendSetting`, every localStorage read/write in try/catch; a stored value that fails to parse is `NO_BACKEND`). On change and every 15 s while `pyblocks`, call `client.health()`; the pill shows `ok · scene · events` or the `reason`. Expose `{setting, health}` to the rest of the app through whatever stream 2 uses for app state (a context is fine). (2) `OpenPython.tsx`: a menu item `Open Python file…` registered ONLY when `setting.kind === "pyblocks" && health.ok && health.capabilities.scene`; it triggers a hidden `<input type="file" accept=".py">`, reads the text, calls `client.scene({source, filename: file.name, viewId: null})`, and if `document.views.length > 1` shows a plain list of `views[].title` (first selected) and re-requests with the chosen `viewId`; then `loadPyblocksScene(document)` and hands `{scene, title: file.name, documentUri: document.source.uri, problems}` to the app's open-board path; `problems` and `document.diagnostics` render in the app's existing notice surface; a `PyblocksRequestError`/`PyblocksSceneError` shows its message, never a blank board. The board title shows the file name. (3) `useSceneEventBridge.ts`: wrap the app's `onSceneChange`; on each call compute `events = deriveSceneEvents(prev, next)`; if non-empty, `seam.publish({id: crypto.randomUUID(), author: authorId("tldraw"), label: events[0].type, at: new Date().toISOString(), documentUri, events})`. The seam is created once per app instance (`createSceneEventSeam()`), has zero subscribers unless (4) attaches, and is ALWAYS present — the whiteboard emits events with no consumer, exactly as Zach described. (4) `pyblocksConsumer.ts`: `attachPyblocksConsumer(seam, client, {onEcho}) => detach`; subscribes with `authorId("pyblocks")` (self-skip, so a future write-back cannot echo itself); coalesces batches arriving within 250 ms; `await client.events(batches)`; calls `onEcho(echo)`; on a request error keeps a small in-memory retry queue (max 20 batches, drop oldest) and surfaces the error text once. Attach when the setting becomes `pyblocks` with `capabilities.events`; detach (and `seam.size` returns to 0) when it becomes `none` or the URL changes. The status line shows the last echo as `N batch · K semantic · A applied` (count `class === "semantic"` from the echo; `applied` is 0 tonight by contract). (5) When the setting is `none`, NONE of (1)-(4)'s pyblocks UI renders and no fetch happens — assert this in `backend.test.ts` with a fetch spy. (6) Smoke `tests/pyblocks_backend_smoke.mjs` in the app's harness style (ports from env; start the pyblocks server yourself, parse its printed port): drive the six acceptance assertions from the plan §6 L3 end to end and take screenshots; look at them.

WHY COMMENTS: at the setting default (`none` = a whiteboard; nothing pyblocks visible or fetched); at the menu-item gate (capabilities from `/api/health`, never assumed); at the bridge (events derived at the onSceneChange seam, not from the tldraw store; the seam always exists, consumers are optional); at the consumer's author id (`pyblocks` self-skips so a future write-back never hears its own echo); at `applied: 0` in the status line (write path is follow-up F1).

DO NOT: edit anything under `apps/storybook-basics` (if a trunk module is missing an export you need, report it — do not vendor a copy); add a WebSocket; copy `labClient.ts`; touch `pyblocks/**`; commit with `git add -A`. VERIFY: the app's unit tests green, the smoke green with screenshots inspected, `git diff --stat` confined to your write set plus the two shell lines and one registration. Report the exact command that starts the app + server pair for Zach, one line each, and stop the servers you started.

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
