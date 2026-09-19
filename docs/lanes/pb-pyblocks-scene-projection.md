# Lane pb:pyblocks-scene-projection — pyblocks: block_view_to_scene + to-systemsketch CLI + /api/systemsketch/{scene,events} routes

_Stream plan: `docs/PYBLOCKS-BACKEND-PLAN.md` (read it) · repo: **pyblocks** · dispatcher-resolved dependencies: none (day-0) · barrier: False_

## Write set (the ONLY paths you may create or edit)
- `pyblocks/systemsketch_scene.py (new)`
- `pyblocks/__main__.py (one subparser `to-systemsketch` + its dispatch branch)`
- `pyblocks/server.py (POST whitelist :123-130, dispatch :152-166, health :622-633 — surgical edits only)`
- `tests/test_systemsketch_scene.py (new, the lane's own unit tests)`

## Do not touch
- pyblocks/blockview.py
- pyblocks/analyzer.py
- pyblocks/python_adapter.py
- pyblocks/systemsketch_adapter.py
- pyblocks/systemsketch.py
- pyblocks/systemsketch_codec.py
- pyblocks/systemsketch_store.py
- pyblocks/tldraw_store.py
- pyblocks/sketch_store.py
- examples/**
- docs/**
- vscode-pyblocks/**
- vscode-systemsketch/**
- src/**
- /home/bam/pyblocks root checkout (a peer's staged changes — never commit there)
- /home/bam/pyblocks/.claude/worktrees/pyblocks-viewer-library-40c1f2 (live P1 lane)
- /home/bam/bbox-ui/**/docs/fixtures/pyblocks-scene/** (read-only contract)

## Acceptance (assertions you cannot edit)
- cd <pyblocks lane worktree> && python3 /home/bam/bbox-ui/.claude/worktrees/plan-pyblocks-backend-2026-09-18/docs/fixtures/pyblocks-scene/test_systemsketch_scene_acceptance.py -v  → last lines `Ran 17 tests` and `OK` (0 failures, 0 errors)
- block_view_to_scene(block_view_from_dict(linear_chain.blockview.json)) == json.load(linear_chain.scene.json) — dict equality, and likewise for region_for_if
- python3 -m pyblocks to-systemsketch examples/v1_showcase.py --view build_report  → exit 0, stdout is one JSON object with kind "pyblocks-scene", schemaVersion 1, non-empty scene.nodes and views, 64-hex source.sha256
- python3 -m unittest discover -s tests -v  → still OK (no pre-existing test goes red)
- GET /api/health includes {"systemsketch": {"scene": 1, "events": 1}} and Access-Control-Allow-Origin echoes a localhost origin
- POST /api/systemsketch/events with the fixture batch → 200 {accepted: 1, applied: 0, classified: [{batchId, events: 13 verdicts matching events_edit_session.json expectedClasses}]}; {batches: "nope"} → 400 {error}

Acceptance test files (committed before you existed; read them, never edit them):
- `docs/fixtures/pyblocks-scene/test_systemsketch_scene_acceptance.py (in the bbox-ui plan worktree; read-only to this lane)`
- `docs/fixtures/pyblocks-scene/linear_chain.blockview.json`
- `docs/fixtures/pyblocks-scene/linear_chain.scene.json`
- `docs/fixtures/pyblocks-scene/region_for_if.blockview.json`
- `docs/fixtures/pyblocks-scene/region_for_if.scene.json`
- `docs/fixtures/pyblocks-scene/events_edit_session.json`

## Builder brief (verbatim from the planner)

You are building the pyblocks side of the pyblocks → SystemSketch contract. Everything you need is on disk; the acceptance is already written and RED, and you may not edit it or the fixtures.

SET UP. `git -C /home/bam/pyblocks worktree add /home/bam/pyblocks/.claude/worktrees/systemsketch-scene -b claude/systemsketch-scene main` and work ONLY there (the root checkout holds a peer's staged changes; the P1 lane worktree `pyblocks-viewer-library-40c1f2` is live — read both, write neither). Python 3.12, stdlib only (the server is `http.server`; no new dependencies).

READ FIRST (cite file:line in your headers): the plan `/home/bam/bbox-ui/.claude/worktrees/plan-pyblocks-backend-2026-09-18/docs/PYBLOCKS-BACKEND-PLAN.md` §3.2 (the nine projection rules — they are the spec), §3.5 (routes), §5 (shapes); the fixture README beside the acceptance; `pyblocks/blockview.py:73-136` (`port_display_direction`, `port_role`, `port_display_role`, `BlockContent`, `EdgeContent` — reuse these readers, do not re-parse metadata); `pyblocks/systemsketch_adapter.py:122-142` (`_analysis_kind`/`_block_type` readers), `:176-212` (`_port_projection`'s display-direction handling), `:489-501` (validate-then-project stance — copy it: an invalid view raises, never a partial document), `:145-149` (the OLD fallback grid — you are NOT porting it; pyblocks never invents geometry); `pyblocks/python_adapter.py:41-66` (`AvailableView`, `AnalysisResult.views/diagnostics/selectedViewId/source`), `:1815-1860` (`analyze_python(source, filename, view_id)`); `pyblocks/server.py:111-183` (the POST whitelist, JSON/size checks, the `/api/analyze` handler — your two handlers mirror it), `:622-633` (health), `:660-680` (`_json`, CORS); `pyblocks/__main__.py:226-240` (the `analyze` subparser as your template), `:483-490` (dispatch). Then read the frozen outputs `linear_chain.scene.json` and `region_for_if.scene.json` in full — your projection must equal them as dicts, key order included.

CREATE `pyblocks/systemsketch_scene.py` with: `SCENE_SCHEMA_VERSION = 1`, `SCENE_KIND = "pyblocks-scene"`, `class SystemSketchSceneError(ValueError)`, `block_view_to_scene(view: BlockView, *, root_as_region: bool = True) -> dict` (pure; `validate_block_view` non-empty → raise), `scene_document(result: AnalysisResult, *, root_as_region=True) -> dict` (calls the pure function on `result.view`, then fills `views = [{id, title}]` from `result.views`, `diagnostics = [{severity, message}]` from `result.diagnostics`, and sets `source.sha256`/`selectedViewId` from `result.source["sha256"]`/`result.selectedViewId` when the view's `content.metadata["pyblocks.analysis"]` lacked them), and `classify_scene_events(batch: dict) -> list[dict]` returning one `{eventIndex, type, class, reason}` per event using the table in plan §5.3 (semantic / presentation / unknown; an unlisted type is `unknown` with reason naming it). Projection rules, exactly: node per block in content order; `type` = region for semanticKind region|boundary, value for data+literal, else block; with root_as_region the boundary block becomes the root region and every parentless non-boundary block gets `parentId = boundary id`; skip `__inner` twin ports (id suffix or `pyblocks.boundary.face == "inner"`); display-input ports → `data.ports.left`, display-output → `right`; `portLabels` only for ports whose `name` is not None; `portTypes` for ports with `dataType`; `data.view` from style.detail (simple→simple, ports→port, expanded→expanded; regions always expanded); `w/h` from style.size else block w {simple:200, port:240, expanded:520} and region w 520 h 340; regions add `membersLayout: "free"`, `autoFit: True`, `control: {kind: role or "function" for boundary, head: analysis signature or title}`; value nodes carry `value=title, writers=left ids, readers=right ids` instead of view/w/h/ports; `description` when present; `data.pyblocks = {blockId, semanticKind, role, effect, certainty, sourceSpan (first sourceRef with a span, else None), authoredPosition}` with every key present; `position` = authored style position or {0,0}; edges of kind data|state → scene edges with `__inner` stripped from handles, `data = {variant: "delayed" if state else "data", pyblocks: {edgeId, kind, label?, certainty?, innerSource?: True, innerTarget?: True}}` (optional keys only when present); every other kind → `controlEdges[]` with raw ids; `source.uri` = first block's first sourceRefs uri else "unknown"; `views`/`diagnostics` = [] from the pure function. Check the two frozen outputs for the exact key order of `data` (name, view, w, h, ports, membersLayout, autoFit, control, portLabels, portTypes, description, pyblocks) and of the document.

CLI: add `to-systemsketch <file.py> [--view ID] [--flat]` to `__main__.py`: read the file, `analyze_python(source, str(path), args.view)`, print `json.dumps(scene_document(result, root_as_region=not args.flat), ensure_ascii=False, indent=2)`.

ROUTES in `server.py`: add `/api/systemsketch/scene` and `/api/systemsketch/events` to the POST whitelist at :123-130 and dispatch them at :152-166 to two new methods modelled on the `/api/analyze` branch (:167-183): `_post_systemsketch_scene(length)` reads `{source (str, required), filename (default "untitled.py"), viewId (str|None), flat (bool)}`, validates like `/api/analyze`, answers `scene_document(...)` 200, `{"error": ...}` 400/500; `_post_systemsketch_events(length)` validates `{batches: list of dicts with str id and list events of dicts with str type}` (else 400 `{"error"}`), logs one `log_message` line per batch (`events batch %s author=%s n=%d semantic=%d`), answers `{"accepted": len(batches), "applied": 0, "classified": [{"batchId", "events": classify_scene_events(batch)}]}`. Extend the health payload at :622-633 with `"systemsketch": {"scene": 1, "events": 1}`. Do not touch any other route.

WHY COMMENTS to leave: (1) at the root-region rule — a `def` contains its body exactly as a `for` does; Zach's "everything is a block"; `--flat` is the reversible default; (2) at the `__inner` fold — the trunk's collapse.ts models one hierarchical pin with an edge on each side, so folding lets its dissolve/boundary/lint run unchanged; (3) at the controlEdges split — Zach: "I didn't want to mix data lines and control lines"; control is the nesting; nothing is dropped; (4) at `authoredPosition` — pyblocks never invents geometry, the app lays out; (5) at `applied: 0` — the write path is follow-up F1 in the plan; (6) at the classification table — derived from systemsketch_adapter.py's reverse path (titles, ports, port-bound arrows are semantic; geometry is not).

VERIFY: `cd <your worktree> && python3 /home/bam/bbox-ui/.claude/worktrees/plan-pyblocks-backend-2026-09-18/docs/fixtures/pyblocks-scene/test_systemsketch_scene_acceptance.py -v` must end `Ran 17 tests ... OK`; `python3 -m unittest discover -s tests -v` must stay OK; add your own `tests/test_systemsketch_scene.py` (house style: `tests/test_commands.py`) covering the flat mode, an unnamed port, a `while` region, and an `effect` edge. If an acceptance assertion cannot be met, report FAIL with the exact diff — never edit the acceptance or a fixture. Commit with explicit pathspecs (never `git add -A`; check `git diff --cached --name-only`), on your lane branch only; do not merge.

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
