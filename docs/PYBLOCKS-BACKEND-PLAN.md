# PYBLOCKS-BACKEND-PLAN — the optional pyblocks backend for the new SystemSketch

**Status:** implementation plan, 2026-09-18 evening (stream 3 of the ASK,
`docs/ASK-2026-09-18-CONTROL-FLOW-AND-SYSTEMSKETCH-REBUILD.md` item 3). Agent-readable:
every lane names its write set, its acceptance (committed, red, off-limits to builders), and
what it may not touch. Written for lanes in isolated worktrees that read this from a commit.

**Verified against disk 2026-09-18 21:00.** bbox-ui integration branch
`claude/control-flow-integration-2026-09-18` (f80ebbf); pyblocks `main` (6a64e0c); the live
P1 lane `/home/bam/pyblocks/.claude/worktrees/pyblocks-viewer-library-40c1f2` (c45d8d1);
notebook lab branch `claude/canvas-jupyter-execution-871b9c` (0312bb3); the archive
`/home/bam/systemsketch` (`src/workspace/`, `scripts/server.py`, `src/embed/sharedWithHost.ts`).
Anything not re-derivable at those refs is in §10 *Not verified*.

**The acceptance is already committed in this plan's commit and is RED on purpose:**

| Side | File | Runs with |
|---|---|---|
| bbox-ui trunk | `apps/storybook-basics/src/scene/pyblocksScene.test.ts`, `src/scene/sceneEvents.test.ts`, `src/backend/backendSetting.test.ts`, `src/backend/pyblocksClient.test.ts` | `cd apps/storybook-basics && pnpm exec vitest --project=unit run src/scene/pyblocksScene.test.ts src/scene/sceneEvents.test.ts src/backend` — 36 red / 4 green at planning time; `pnpm typecheck` GREEN (typed skeletons committed beside the tests) |
| pyblocks | `docs/fixtures/pyblocks-scene/test_systemsketch_scene_acceptance.py` | `cd <pyblocks lane> && python3 /home/bam/bbox-ui/.claude/worktrees/plan-pyblocks-backend-2026-09-18/docs/fixtures/pyblocks-scene/test_systemsketch_scene_acceptance.py -v` — 16 red / 1 green at planning time |
| both | `docs/fixtures/pyblocks-scene/*.json` — the frozen contract (README there) | never edited by a builder |

---

## 1 · One-page summary

**Recommendation.** pyblocks grows one pure projection, `pyblocks/systemsketch_scene.py`
`block_view_to_scene(view)`, that emits the trunk's **engine-free `BlockScene`** (scene.ts)
as a versioned JSON document — never tldraw records. The app (stream 2's
`apps/systemsketch`) loads it through a trunk loader that validates and lays out unplaced
nodes with the trunk's own `rank()`, and maps it to tldraw shapes exactly as it maps any
other scene. Edits leave the app through one seam — `deriveSceneEvents(before, after)` at
the existing `onSceneChange` boundary → a typed `SceneEvent` union → `createSceneEventSeam()`
with **zero subscribers by default**. When the `Backend: pyblocks @ url` setting is on and
`/api/health` says the server can, a consumer subscribes and POSTs batches; the server
classifies each event semantic / presentation / unknown (the table
`systemsketch_adapter.py`'s reverse path already implies), logs, and echoes. **Nothing writes
back to Python tonight** — the echo says `applied: 0` by contract; the libcst/`commands.py`
write path is the first follow-up.

**Zach's two load-bearing ideas, honored structurally (not by convention):**

- **Everything is a block.** Every BlockView block becomes a `SceneNode` — calls, literals,
  regions, *and the selected function itself*, which becomes the **root region** whose
  members are the function body (a `def` contains its body exactly as a `for` contains
  its). A region is a node of `type: "region"` carrying ports like any node (region.ts's
  ruling, "100% it's a node"), with `data.control = {kind, head}` for the presets to dress.
  No ports-on-header hack, no special boundary shape.
- **Never mix data and control lines.** Only BlockView edges of kind `data`/`state` become
  wires (`state` = the `delayed` z⁻¹ variant Zach drew). `control`/`effect` edges are kept
  whole in `controlEdges[]` — truthful, never drawn — and the loader *refuses* a document
  that smuggles one into `scene.edges`. Control flow is the nesting.

**Shape of the build:** three lanes, two day-0 in parallel (one per repo), one app-wiring
lane after stream 2's shell exists. ~1,900 lines total. Both day-0 lanes test against the
same committed fixture bytes, so neither waits on the other.

**Risks, stated up front:** (1) the tldraw host in the trunk today sights port dots for
top-level shapes only (`portDotSightings.ts:56-59`, `dotOwnedBy`), so wires *into members*
are unresolved in the tldraw host until stream 2's region face lands — the day-0 story
proves the document in the DOM host and *measures* the tldraw gap; (2) stream 2's app shell
does not exist yet, so lane 3's integration points are stated as an interface, not a file;
(3) the `portLabels` addition to `HostNodeData` is a 2-line additive edit to a shared
contract — small, but a barrier by this repo's rule.

---

## 2 · Settled rulings (do not re-open) and what they bind here

From the ASK doc's "Settled rulings" and the code that already implements them:

| Ruling | Where it lives | Consequence for this plan |
|---|---|---|
| A region is a node kind, isolated, never a `definitionId` | `apps/storybook-basics/src/scene/region.ts:4-26` | `type: "region"` nodes; the projection never emits `definitionId`; acceptance asserts it |
| Collapse splits a crossing edge into an outer half and an inner stub sharing ONE region port (hierarchical pin) | `scene/collapse.ts:9-45, 264-274` | BlockView's `__inner` twin ports **fold** onto that one pin (§3.2) so `dissolveRegion`, `classifyBoundary`, `findDanglingEdges` work unchanged on a pyblocks scene |
| P1 vocabulary: no control cables; branching is nesting + port role | P1 lane `tests/test_p1_migration_acceptance.py:63-75` (A7) | `controlEdges[]` kept aside, never wires |
| The history contract: one batch per gesture, author-stamped, self-skip | `scene/history.ts:17-31, 197-199` | `SceneEventBatch` carries `AuthorId`; the seam delivers through `shouldNotify` |
| Grain 1 / `origin` binding — whoever the binding points at owns the bytes | `docs/SOURCE-CODE-VIEW-PLAN.md §3` | Not built here; this plan's `source.uri`/`sha256` is the same fact one level up (a whole board bound to a file). Stream 4 builds on both. |
| The rebuilt app is `apps/systemsketch` in this monorepo importing the trunk through one alias | ASK doc, dispatcher's decision | Everything shareable lives in the trunk (`src/scene/`, `src/backend/`); the app owns React and wiring only |
| Old SystemSketch is the archive; `/home/bam/pyblocks` root is a peer's; the P1 lane is live | task brief | pyblocks work in a worktree cut from `main`; the projection is a pure function of `BlockView`, so it is correct on both `main` (collapsed regions) and the P1 lane (expanded regions) |

---

## 3 · Criteria first, then the four design questions

**Success criteria for THIS situation** (weights sum to 10):

| # | Criterion | Weight | Why this weight tonight |
|---|---|---|---|
| C1 | Buildable tonight by Opus lanes that never saw this chat, in parallel, against one frozen fixture | 3 | The ASK's whole shape; a design nobody can build by morning is worth nothing |
| C2 | Reuses what exists (stock parts: scene.ts, sceneDiff.ts, history.ts, `rank()`, server.py's CORS/routes, `labClient.ts`'s transport) over new machinery | 2 | Zach: off-the-shelf first; every reimplementation is a second thing to keep true |
| C3 | Whiteboard-with-no-backend stays byte-for-byte a whiteboard (`none` → nothing visible, nothing fetched) | 2 | Zach's first sentence of item 3 |
| C4 | Truthful: nothing pyblocks says is silently dropped; nothing the app can't draw is invented | 1.5 | `feedback_truthful_property_rendering`; the P1 contract's own "honest opaque" rule |
| C5 | Engine-neutral: pyblocks never learns tldraw; the same document renders in every trunk host | 1 | CLAUDE.md's one rule; a third host stays an afternoon |
| C6 | Reversible: each choice has a flag or a one-file swap | 0.5 | Zach is away; defaults must be cheap to veto |

### 3.1 Q1 — document contract: BlockScene JSON or tldraw records?

| Option | C1 | C2 | C3 | C4 | C5 | C6 | Total |
|---|---|---|---|---|---|---|---|
| **A. `BlockScene` JSON (`PyblocksSceneDocument` v1) — engine-free, app maps to shapes** | 3 | 2 | 2 | 1.5 | 1 | 0.5 | **10** |
| B. tldraw store records (`.tldr` envelope with `bbox-node` shapes) | 1 (needs stream 2's shape schema, which doesn't exist yet) | 1 | 2 | 1 | 0 | 0.25 | 5.25 |
| C. Keep `/api/analyze` (BlockView) and project client-side in TS | 2 (one side only) | 1.5 | 2 | 1.5 | 1 | 0.5 | 8.5 |

**Recommend A.** The trunk already renders `BlockScene` in three hosts (`hosts/domCanvas.tsx`,
`hosts/reactFlowHost.tsx`, `hosts/tldrawHost.tsx:557-657`); pyblocks' old adapter already
refused to become "a second schema authority" over tldraw records (`tldraw_store.py:9-15`);
and Zach's words were "implementing a `._to_systemsketch()` function" — a pyblocks-side
projection, which A is and C is not. B binds Python to a shape schema stream 2 is writing
tonight. **Reversible default:** A, with `--flat` / `root_as_region=False` (§3.2) as the one
projection switch; C remains possible later because the document carries `data.pyblocks.blockId`
per node — a TS projection would produce the same ids.

**The exact shape** is the TypeScript in `apps/storybook-basics/src/scene/pyblocksScene.ts`
(committed skeleton; the types ARE the contract) and is reproduced in §5. Two frozen fixture
pairs prove it: `docs/fixtures/pyblocks-scene/linear_chain.{blockview,scene}.json` and
`region_for_if.{blockview,scene}.json` (the P1 specimen, pyblocks `b3c0e12`).

### 3.2 The projection rules (what `block_view_to_scene` does, exactly)

Read `pyblocks/blockview.py:103-136` (`BlockContent`, `EdgeContent`) and
`pyblocks/systemsketch_adapter.py:122-142, 176-212, 233-236` (the existing kind/role/display-direction
readers — reuse `port_display_direction`, `port_role`, `port_display_role` from `blockview.py:73-100`).

1. **Node per block, in content order.** `id` = BlockView block id (opaque, position-based —
   `function:run@3:0/transform:call@4:12-4:23`). `type`:
   `semanticKind ∈ {region, boundary}` → `"region"`; `semanticKind == "data" ∧ role == "literal"`
   → `"value"`; else `"block"`.
2. **The selected function is the root region** (`root_as_region=True`, the default): the
   `boundary` block becomes a `region`; every block whose `parentId` is `None` and is not the
   boundary gets `parentId = <boundary id>`. `--flat` keeps BlockView's parents verbatim.
   WHY: a `def` contains its body exactly as a `for` contains its; one rule, one face, and
   P5's "honest port view" (collapse the root region to `view: "port"`) falls out for free.
3. **Ports → walls.** Skip every `__inner` twin (`port.id.endswith("__inner")` or
   `metadata["pyblocks.boundary"].face == "inner"`). Display-input ports (by
   `port_display_direction`) → `data.ports.left`, display-output → `data.ports.right`, in
   block order. Boundary ports therefore sit: params left (they are sources from inside —
   the hierarchical pin), returns right. Named ports → `data.portLabels[id] = name`
   (unnamed ports get NO entry; the face falls back to the id). `dataType` →
   `data.portTypes[id]`.
4. **Node data.** `data.name = title`; `data.view` = `style.detail` mapped
   `simple→"simple"`, `ports→"port"`, `expanded→"expanded"`, and always `"expanded"` for a
   region; `data.w/h` = `style.size` when authored, else block `w = {simple:200, port:240,
   expanded:520}` (`systemsketch_adapter.py:73-81`'s constants) and region `w:520, h:340`;
   regions add `membersLayout: "free"`, `autoFit: true`,
   `control: {kind: <analysis role, or "function" for the boundary>, head: <analysis
   signature, else title>}`; `description` when present; value nodes carry
   `value = title`, `writers = left ids`, `readers = right ids` instead of `view/w/h/ports`.
   `data.pyblocks = {blockId, semanticKind, role, effect, certainty, sourceSpan (first
   sourceRef with a span, else null), authoredPosition}` — every key present, `null` when
   unknown (the P1 contract's "absent data is null, never a missing key").
5. **Position.** `style.position` when authored → `position`, `authoredPosition: true`;
   else `{x:0, y:0}`, `authoredPosition: false`. **pyblocks never invents geometry** — the
   loader lays out (§3.4). BlockView positions of a nested block are read as
   parent-relative (scene.ts:60-63's rule; assumption recorded in §10).
6. **Edges.** `kind ∈ {data, state}` → `scene.edges[]` with `id` = edge id, `source/target`
   = block ids, handles = port ids **with `__inner` stripped**, `data = {variant: "delayed"
   if kind == "state" else "data", pyblocks: {edgeId, kind, label?, certainty?,
   innerSource?: true, innerTarget?: true}}` (`label`/`certainty` only when present;
   `certainty` from `metadata["pyblocks.analysis"].certainty`). Any other `kind` →
   `controlEdges[]` with RAW ids, never a wire.
7. **Document.** `source.uri` = the first block's first `sourceRefs[].uri` (else
   `"unknown"`); `sha256` / `selectedViewId` from `content.metadata["pyblocks.analysis"]`
   (else `null`); `title` = `content.title`. `views`/`diagnostics` are `[]` from the pure
   function; the route/CLI fill them from `AnalysisResult` (`python_adapter.py:55-66`).
8. An invalid BlockView (`validate_block_view` non-empty) raises
   `SystemSketchSceneError` — never a partial document (same stance as
   `systemsketch_adapter.py:498-501`).
9. **Deterministic**: same input → identical JSON; key order as listed in the fixtures.

### 3.3 Q2 — the backend toggle

| Option | Score (C1/C2/C3/C6) | Note |
|---|---|---|
| **A. Setting `Backend: none \| pyblocks @ url`, `none` default, health-gated; stored per viewer in `localStorage` (`systemsketch.backend.v1`); when `none` nothing pyblocks renders** | 3/2/2/0.5 = **7.5** of 7.5 | Zach's own words; `feedback_prototype_switch_in_app` (a switch in the app, never a URL flag) |
| B. URL flag `?backend=` | 3/2/1/0.5 | Zach rated URL-flag gating Bad on 2026-09-09 |
| C. Auto-detect by probing 4177 on launch | 2/2/0/0.25 | Probes from a whiteboard that promised no backend |

**Recommend A.** Default URL `http://127.0.0.1:4177` — the port pyblocks' own `npm run
backend` binds (`/home/bam/pyblocks/package.json` "backend"); `serve`'s CLI default is `0`
(`pyblocks/__main__.py:324`), so a fixed default in the app is the only way a fresh install
finds anything. Health = `GET /api/health` → `analyzer == "pyblocks-blockview-v1"`
(`server.py:622-633`) *and* the new `systemsketch: {scene: 1, events: 1}` capability keys.
"Open .py" = a browser file picker (`<input type=file accept=.py>`) → source text → `POST
/api/systemsketch/scene` → `loadPyblocksScene` → the board; title = the file's name; when
`views.length > 1` the app shows the view list and re-requests with `viewId`. **Reversible
default:** the picker (no server file access needed tonight); a `GET /api/python/file?path=`
route with path fencing and mtime polling is follow-up F3.

### 3.4 Q3 — edit events

| Option | C1 | C2 | C4 | C5 | Total (of 7.5) |
|---|---|---|---|---|---|
| **A. `deriveSceneEvents(before, after)` at the `onSceneChange` seam, built on `sceneDiff.ts`, typed union, seam with no default consumer** | 3 | 2 | 1.5 | 1 | **7.5** |
| B. `editor.store.listen` on tldraw's record diffs → translate shape props back to scene facts | 1.5 | 1 | 1 | 0 | 3.5 |
| C. Both (A for semantics, B for raw provenance) | 2 | 1 | 1.5 | 0.5 | 5 |

**Recommend A.** Every trunk host already writes each interaction's at-rest result into the
scene through one seam (`tldrawHost.tsx:523-528`, the `onSceneChange` prop; `onTranslateEnd`
/ `onResizeEnd` at `:357-393`); the scene diff is engine-free and is exactly the vocabulary a
consumer acts on. `sceneDiff.ts:317-382` already yields added/removed/modified per node, edge
and port; it deliberately excludes `position` (`fieldDiff.ts` rule cited at
`sceneDiff.ts:169-178`), so `node-moved` is the one fact this plan adds. The union, batch
envelope and seam are the committed skeleton `src/scene/sceneEvents.ts`. **The deviation
from the brief's "derived from tldraw store diffs" is deliberate and recorded in that file's
header**; if stream 2 makes tldraw's store the document, it projects store → scene and calls
the same function. Layout of unplaced nodes (§3.2 rule 5) also lives app-side, reusing
`rank()` (scene.ts:258-272) — `x = 40 + 320·rank`, `y = 40 + 160·i` per parent scope, blocked
nodes after the last finite rank; the acceptance asserts the *properties* (sources left of
targets, no two siblings coincide, authored geometry untouched, determinism), not magic
numbers, so a nicer layout later does not break the contract.

### 3.5 Q4 — routes, CORS, ports

Read `pyblocks/server.py:111-183` (POST whitelist at `:123-130`; `_origin_allowed` at
`:676-680` admits any `127.0.0.1`/`localhost`/`::1` origin — the new app on any local port
is already allowed; `Access-Control-Allow-Methods: POST, GET, OPTIONS` at `:117`).

| Route | Status | Contract |
|---|---|---|
| `GET /api/health` | **reused + extended** | existing payload (`:622-633`) gains `"systemsketch": {"scene": 1, "events": 1}` |
| `POST /api/analyze` | reused unchanged | the RF viewer keeps it; the app never calls it |
| `POST /api/systemsketch/scene` | **new** | `{source: str, filename?: str, viewId?: str\|null}` → `PyblocksSceneDocument` with `views` and `diagnostics` filled from `analyze_python` (`python_adapter.py:1815`); errors as `{"error": …}` 400/500 like `/api/analyze` (`:167-183`) |
| `POST /api/systemsketch/events` | **new** | `{batches: SceneEventBatch[]}` → `{accepted, applied: 0, classified: [{batchId, events: [{eventIndex, type, class, reason}]}]}`; logs one line per batch through `log_message`; malformed → 400 |
| everything under `/api/tldraw/*`, `/api/systemsketch/file\|fs\|stat\|release`, `/api/sketch*` | untouched | the old SystemSketch's file lanes; nothing here reads them |

Ports: pyblocks 4177 (default in the app), the acceptance binds port 0. Never bind 4321,
4325, 5421, 5193, 5199, 4599 (taken); `STORYBOOK_PORT=54xx` for a lane's own Storybook.

**Rejected transport:** a WebSocket. `labClient.ts:1-4` ("no websocket, no protocol") is the
right precedent for a local one-user tool, and pyblocks' server is `http.server` with no
WS support; adding one is a dependency for no capability tonight.

---

## 4 · Stock-part mapping table

| Element | Today | Off-the-shelf part (exact exported name) | Behaviour that must survive |
|---|---|---|---|
| The document the app renders | `BlockView` → old board dict (`systemsketch_adapter.block_view_to_systemsketch_board`) or RF nodes (`src/blockview/reactFlowAdapter.ts`) | `BlockScene` / `SceneNode` / `SceneEdge` (`src/scene/scene.ts:74-121`), `HostNodeData` (`src/hosts/hostScene.ts:25-67`) | id is identity, `data.name` is a label; `parentId` IS nesting; `position` parent-relative; edges name ports as `(nodeId, portId)` |
| Region node | old board `containment`, RF `region` node | `REGION_NODE_TYPE`, `isRegion`, `childrenOf`, `regionOf` (`src/scene/region.ts`) | regions isolated, never a `definitionId`; region ports are hierarchical pins (`collapse.ts`) |
| Layout of unplaced nodes | `_fallback_position` row-major grid (`systemsketch_adapter.py:145-149`) | `rank`, `topologicalOrder` (`src/scene/scene.ts:234-272`) | deterministic; dataflow reads left→right; authored positions never touched |
| Wire styling | old arrow style dict (`DEFAULT_ARROW_STYLE`) | `WireStyleData.variant` (`src/scene/sceneWires.ts:20-26`): `"data"` / `"delayed"` | the z⁻¹ carried-state look is the `delayed` variant, never a second wire kind |
| Edge diff | `board_diff.py` / `systemsketch_diff.py` over the old board | `diffScene`, `SceneDiff` (`src/scene/sceneDiff.ts:317-382`) | three states, id-matched; a port added is not a node modified |
| Gesture batching + self-skip | none in the app | `openBatch`/`record`/`closeBatch`/`shouldNotify`, `AuthorId`, `authorId` (`src/scene/history.ts`) | one batch per gesture; a writer never hears its own echo |
| HTTP transport | RF viewer's `requestAnalysis` (`src/blockview/model.ts:387-405`) | the shape of `apps/notebook-lab/src/labClient.ts` (`post<T>`, `health()`), copied not imported (that branch is a lab) | plain fetch + JSON; health never throws |
| Server routes | `server.py` `do_POST`/`do_GET` dispatch, `_json`, `_cors_headers` | the same handlers, extended | POST whitelist, JSON-only, body size caps, localhost-origin CORS |
| Semantic-vs-presentation table | implicit in `systemsketch_board_to_block_view` (`systemsketch_adapter.py:975-1118`: titles, ports, port-bound arrows are semantic; free arrows/notes ignored) | `classify_scene_events` — a table, one row per `SceneEvent.type` | the fixture's `expectedClasses` |
| **unchanged (stock seam)** | `BlockView` IR (`blockview.py`) and `validate_block_view` | — | renderer-neutral; gains NO `to_systemsketch` method (the projection is a sibling module like `systemsketch_adapter.py`, for the same reason that one is) |
| **unchanged (stock seam)** | `systemsketch_adapter.py`, `systemsketch.py`, `systemsketch_codec.py`, the `.systemsketch(.py)` formats, goldens harness | — | the OLD SystemSketch bridge keeps working; the new document is a *second* projection, not a replacement (goldens still evaluate through the old adapter tonight) |
| **unchanged (stock seam)** | `tldrawHost.tsx`, `domCanvas.tsx`, `reactFlowHost.tsx`, `nodeViews.tsx` render path | — | a pyblocks scene is just a scene; the only host edit is `label: portLabels?.[id] ?? id` |
| **unchanged (stock seam)** | `apps/storybook`, `packages/bbox-ui` (frozen v1), `apps/docs`, `registry.json` | — | not touched by any lane |

---

## 5 · Contracts (verbatim shapes both sides build against)

The authoritative TypeScript is the committed skeleton; JSON below is the same thing.

### 5.1 `PyblocksSceneDocument` v1 (`src/scene/pyblocksScene.ts`)

```ts
{
  schemaVersion: 1,
  kind: "pyblocks-scene",
  source: { uri: string; sha256: string|null; selectedViewId: string|null; title: string|null },
  scene: {
    nodes: Array<{
      id: string; type: "region"|"block"|"value"; position: {x:number; y:number}; parentId?: string;
      data: {
        name: string;
        // block/region only
        view?: "simple"|"port"|"expanded"; w?: number; h?: number;
        ports?: { left?: string[]; right?: string[] };
        membersLayout?: "free"; autoFit?: true;            // regions
        control?: { kind: string; head: string };          // regions
        // value only
        value?: string; writers?: string[]; readers?: string[];
        // any
        portLabels?: Record<string,string>; portTypes?: Record<string,string>; description?: string;
        pyblocks: { blockId: string; semanticKind: string|null; role: string|null; effect: string|null;
                    certainty: string|null; sourceSpan: SourceSpan|null; authoredPosition: boolean };
      };
    }>,
    edges: Array<{ id: string; source: string; sourceHandle: string; target: string; targetHandle: string;
      data: { variant: "data"|"delayed"; pyblocks: { edgeId: string; kind: "data"|"state"; label?: string;
              certainty?: string; innerSource?: true; innerTarget?: true } } }>
  },
  controlEdges: Array<{ id: string; kind: string; source: {nodeId,portId}; target: {nodeId,portId}; label?: string }>,
  views: Array<{ id: string; title: string }>,
  diagnostics: Array<{ severity: "error"|"warning"|"info"; message: string }>
}
```

### 5.2 `SceneEvent` union + `SceneEventBatch` (`src/scene/sceneEvents.ts`)

```ts
type SceneEvent =
  | { type:"node-added"; nodeId; node } | { type:"node-removed"; nodeId; node }
  | { type:"node-moved"; nodeId; from:{x,y}; to:{x,y} }
  | { type:"node-resized"; nodeId; from:{w?,h?}; to:{w?,h?} }
  | { type:"node-reparented"; nodeId; from?; to? } | { type:"node-renamed"; nodeId; from?; to? }
  | { type:"node-view-changed"; nodeId; from?; to? }          // expanded→port/simple = collapse
  | { type:"code-changed"; nodeId; from?; to? } | { type:"value-changed"; nodeId; from?; to? }
  | { type:"ports-reordered"; nodeId; side; from:string[]; to:string[] }
  | { type:"port-added"; nodeId; portId; side? } | { type:"port-removed"; nodeId; portId; side? }
  | { type:"port-renamed"; nodeId; portId; from?; to? }
  | { type:"wire-connected"; edgeId; edge } | { type:"wire-disconnected"; edgeId; edge }
  | { type:"wire-rewired"; edgeId; from:SceneEdgeEnds; to:SceneEdgeEnds }
  | { type:"data-changed"; nodeId; key; from?; to? } | { type:"wire-data-changed"; edgeId; key; from?; to? };
interface SceneEventBatch { id; author: AuthorId; label; at: ISO; documentUri?; events: SceneEvent[] }
```
Ordering is part of the contract (`sceneEvents.ts` `deriveSceneEvents` doc; the fixture
`events_edit_session.json` pins 13 events in order). Region creation is `node-added` with
`node.type === "region"` (plus `node-reparented` for each member) — no separate type.

### 5.3 Event classification (pyblocks, `classify_scene_events`)

| class | types | reason text (one per row, the builder's own words are fine) |
|---|---|---|
| `semantic` | node-added, node-removed, node-reparented, node-renamed, code-changed, value-changed, port-added, port-removed, port-renamed, wire-connected, wire-disconnected, wire-rewired | changes what the Python would say |
| `presentation` | node-moved, node-resized, node-view-changed, ports-reordered | geometry / detail only (`systemsketch_adapter.py:493-495`'s "fallback geometry is not semantic presentation data") |
| `unknown` | data-changed, wire-data-changed | a key this contract does not name |

### 5.4 Routes — §3.5. Client — `src/backend/pyblocksClient.ts` (`createPyblocksClient(url, fetch)`:
`health()`, `scene()`, `events()`). Setting — `src/backend/backendSetting.ts`.

---

## 6 · Lanes

Notation: **W** write set (exhaustive), **X** do not touch, **A** acceptance (committed,
off-limits), **D** depends on. Stream-2 ids are `systemsketch-rebuild:<id>`; the dispatcher
maps `<app-shell>` to that plan's lane that lands `apps/systemsketch` with a tldraw host
and a settings surface.

### L1 · `pyblocks-scene-projection` — pyblocks · day-0 · not a barrier · ~700 lines

- **Worktree:** `git -C /home/bam/pyblocks worktree add /home/bam/pyblocks/.claude/worktrees/systemsketch-scene -b claude/systemsketch-scene main`
- **W:** `pyblocks/systemsketch_scene.py` (new), `pyblocks/__main__.py` (one `to-systemsketch`
  subparser + dispatch), `pyblocks/server.py` (two routes + health keys; surgical edits at the
  POST whitelist `:123-130`, dispatch `:152-166`, health `:622-633`), `tests/test_systemsketch_scene.py`
  (the lane's OWN unit tests, beside the frozen acceptance).
- **X:** `pyblocks/blockview.py`, `pyblocks/analyzer.py`, `pyblocks/python_adapter.py`,
  `pyblocks/systemsketch_adapter.py`, `pyblocks/systemsketch*.py`, `examples/**`, `docs/**`,
  `vscode-*/**`, anything in the P1 lane worktree, the pyblocks root checkout.
- **A:** `docs/fixtures/pyblocks-scene/test_systemsketch_scene_acceptance.py` — all 17 green;
  `python3 -m unittest discover -s tests -v` stays green (no existing test may go red).
- **D:** none. Runs against the frozen fixtures with no app.
- **Honors:** everything-is-a-block (rules 1–2: boundary → root region, literal → value,
  region → region node); never-mix (rule 6: `controlEdges[]`, `SystemSketchSceneError` on
  an invalid view).

### L2 · `trunk-loader-events` — bbox-ui · day-0 · **BARRIER** (additive edit to `hostScene.ts`/`nodeViews.tsx`) · ~650 lines

- **Worktree:** cut from this plan's commit (`.claude/settings.json` carries `worktree.baseRef: "head"`); `pnpm install --filter bbox-storybook-basics...`.
- **W:** fill the four skeletons — `apps/storybook-basics/src/scene/pyblocksScene.ts`,
  `src/scene/sceneEvents.ts`, `src/backend/backendSetting.ts`, `src/backend/pyblocksClient.ts`;
  **two additive lines** — `src/hosts/hostScene.ts` (`portLabels?: Record<string,string>;
  portTypes?: Record<string,string>;` on `HostNodeData`) and `src/hosts/nodeViews.tsx:227`
  (`label: node.data.portLabels?.[id] ?? id`); one new story
  `src/stories/PyblocksScene.stories.tsx`.
- **X:** every `*.test.ts` named in §0; the fixtures; `src/scene/scene.ts`, `sceneDiff.ts`,
  `history.ts`, `region.ts`, `collapse.ts`, `boundary.ts` (import, never edit);
  `hosts/tldrawHost.tsx`, `domCanvas.tsx`, `reactFlowHost.tsx`; `.storybook/`; `packages/**`.
- **A:** `pnpm exec vitest --project=unit run src/scene/pyblocksScene.test.ts
  src/scene/sceneEvents.test.ts src/backend` — 40/40 green; `pnpm typecheck` green;
  `pnpm test-unit` no regressions (1023 green at planning time); `pnpm test-stories` green
  including the new story's play functions.
- **D:** none. Barrier only for L3 (which imports these modules and needs `portLabels`).
- **Honors:** never-mix (`parsePyblocksScene` refuses a control kind or an `__inner`
  handle in `scene.edges`); everything-is-a-block (the loader maps only `region|block|value`
  and treats a region as a node with ports — no special path).

### L3 · `app-backend-wiring` — bbox-ui `apps/systemsketch` · after stream 2 · not a barrier · ~500 lines

- **W:** `apps/systemsketch/src/backend/**` (new: `BackendSettings.tsx`, `OpenPython.tsx`,
  `useSceneEventBridge.ts`, `pyblocksConsumer.ts`, `backend.test.ts`), plus **exactly two
  integration lines** in the shell file stream 2's plan names (one import, one mount) and
  one menu item ("Open Python file…") registered the way that plan registers menu items;
  one smoke test `apps/systemsketch/tests/pyblocks_backend_smoke.mjs` in that app's own
  harness style.
- **X:** everything under `apps/storybook-basics/**` (L2 owns it); stream 2's own files
  beyond the two lines; `pyblocks/**`.
- **A (assertions the dispatcher commits into `apps/systemsketch` once its scaffold exists —
  not committable tonight, the directory does not exist on this branch):** (1) with
  `Backend: none` (default) the DOM contains no element whose text or `data-*` mentions
  pyblocks and `fetch` is never called; (2) switching to `pyblocks` with the server down
  shows the health reason and still no "Open Python file…" item; (3) with the acceptance
  server up (`python3 -m pyblocks serve --no-browser --port <free>`) the pill turns green,
  the menu item appears, opening `linear_chain.py` (the fixture's source, written to a temp
  file) yields a board titled `linear_chain.py` with 4 `bbox-node` shapes, the boundary
  region as the only top-level shape; (4) dragging a shape publishes ONE batch with ONE
  `node-moved` event and the server echo logs `class: "presentation"`; (5) renaming a block
  logs `class: "semantic"`; (6) `apps/systemsketch` unit tests green; nothing under
  `apps/storybook-basics` changes.
- **D:** `systemsketch-rebuild:<app-shell>`, L1 (routes), L2 (modules).
- **Honors:** never-mix (the bridge publishes only what `deriveSceneEvents` derives — a
  control edge can never appear in a `wire-*` event because it is never in the scene);
  everything-is-a-block (the app has no pyblocks-specific shape; a pyblocks scene renders
  through the same `bbox-node` shape as a hand-drawn one).

**Concurrency:** L1 ∥ L2 tonight, different repos, disjoint fixtures read-only. L3 after
L2 merges and stream 2's shell exists. No lane edits `packages/bbox-ui`, `apps/docs`,
`apps/storybook`, the pyblocks root checkout or the P1 lane. Never `git add -A`; explicit
pathspecs; `git diff --cached --name-only` before every commit.

---

## 7 · What Zach will see (for the report builder, after implementation)

1. **Storybook `Blocks/Scene/Pyblocks`** (L2's story, DOM Canvas host): the `linear_chain`
   fixture — `run()` as one expanded region with `decode()`, `scale()` and the `2.0` value
   capsule inside, four wires, every dot labelled `raw`/`frame`/`gain`/`scaled` (not
   `in-raw`); and the `region_for_if` fixture — `sort_frame()` ⊃ `for detection in
   detections:` ⊃ `if label == "unknown":`, the carried-state wire drawn `delayed`, and a
   caption reading "2 control edges kept aside, 0 drawn". A third story renders the same
   scene in the tldraw host and shows the measured `data-unresolved-wires` count for
   member-bound edges (the known gap, §10).
2. **Storybook `Blocks/Scene/Pyblocks/Events`**: the `before`/`after` pair side by side with
   the 13 derived events listed in order, and a seam with a counter proving zero
   subscribers by default.
3. **The app** (L3): Settings → *Backend* row, `none` by default and nothing else visible;
   set to `pyblocks @ http://127.0.0.1:4177`, health pill; File → *Open Python file…*;
   `sort_frame.py` opens as the region-nested board with the title `sort_frame.py`; the
   status line shows the last echo (`1 batch · 1 semantic · 0 applied`).
4. **Terminal:** `python3 -m pyblocks to-systemsketch examples/v1_showcase.py --view
   build_report | head`, and `python3 -m pyblocks serve --no-browser --port 4177` with the
   `[pyblocks] … POST /api/systemsketch/events` log lines while the board is dragged.

---

## 8 · Needs Zach (each with the default the build takes if he says nothing)

| Question | Recommendation | Reversible default |
|---|---|---|
| Should the selected function become the ROOT REGION (its body nested inside), or stay a sibling boundary block as BlockView has it? | Root region — one rule for `def`/`for`/`if`, P5's port-view collapse for free | `root_as_region=True`; `--flat` on the CLI and `root_as_region=False` on the function keep BlockView's shape |
| Fold `__inner` twin ports onto one hierarchical pin (the trunk's collapse shape) or keep the twins as distinct ports? | Fold — the trunk's own dissolve/boundary/lint code then works unchanged on a pyblocks scene | fold; `data.pyblocks.innerSource/innerTarget` preserves the fact, so un-folding is a one-pass transform |
| Where does layout of unplaced nodes run — app (trunk `rank()`) or pyblocks? | App — reuse, and pyblocks never invents geometry | app; a `--layout` CLI flag can port the same formula later |
| Open .py via browser file picker (no server file access) vs a fenced `GET /api/python/file?path=` route? | Picker tonight; the route is follow-up F3 (needed for external-edit refresh) | picker |
| Default backend URL 4177 (pyblocks' `npm run backend`) or the dev-loop 4192? | 4177 — the desktop icon's port | 4177, editable in the setting |
| Events over plain POST per gesture, or a WebSocket? | POST (labClient precedent; `http.server` has no WS) | POST |

None blocks a lane.

---

## 9 · Follow-ups (need a design Zach has not seen — NOT lanes tonight)

- **F1 · The write path.** `applied` stops being 0: semantic events → `pyblocks.commands.apply_command`
  (`commands.py:337`, the 8 dataclasses at `:43-112`) / libcst rebinding; needs the
  `origin`/anchor binding from `SOURCE-CODE-VIEW-PLAN.md §3` and a conflict story (drifted
  file). Own plan.
- **F2 · Region faces + typed header contract.** Map analyzer region ports onto stream 1's
  Loop/Branch presets (`Iterable`→`iter`, `Bool`) and render `data.control` as the
  "real block in the top-left corner". Depends on stream 1's preset data shape.
- **F3 · Server-side `.py` access + external-change refresh.** `GET /api/python/file?path=`
  fenced under `files_root` (the `tldraw_store.py` pattern, `:69-87`), `stat` polling,
  re-analyze on change, "drifted" state on the board.
- **F4 · tldraw host: member anchors.** `portDotSightings.ts` sights only the owning node's
  dots; wires into members are unresolved in the tldraw host. Stream 2's region face lane
  or a host lane fixes it; the day-0 story measures it.
- **F5 · Goldens through the new document.** A `to-systemsketch` case per golden series
  (`examples/systemsketch_goldens/README.md`) once the old adapter is retired; tonight the
  goldens still evaluate through `systemsketch_adapter.py`.
- **F6 · `views` picker UX** for files with many definitions (today: a list; a real picker
  with signatures is design).
- **F7 · Mutation / side-effect rendering** (Zach's "side effect, not an output port") —
  `effect` edges are kept aside in `controlEdges` until stream 1 designs the mark.

---

## 10 · Not verified

- **Stream 2's app shell** — `apps/systemsketch` does not exist on this branch; L3's
  integration points (settings surface, menu registration, the tldraw host it mounts, whether
  the scene or the tldraw store is the document) are stated as an interface. If the store is
  the document, L3 adds a store→scene projection before `deriveSceneEvents`.
- **BlockView positions for nested blocks** are assumed parent-relative (nothing in
  `blockview.py` says; the specimen has none). Only matters once pyblocks emits authored
  positions for members.
- **The analyzer on pyblocks `main`** emits collapsed regions (no `parentId`, no `__inner`);
  the P1 lane's `c45d8d1` emits expanded ones. The projection handles both by construction,
  but the CLI test only exercises `main`'s shape; the region fixture is hand-authored (the
  frozen P1 specimen), not produced by an analyzer run.
- **`autoFit` regions containing regions** — `useAutoFitHeight` was built for one level of
  free members; nested region growth is unmeasured. The story will show what happens.
- **Bundle/ports of stream 2's dev server** — L3's smoke test must take its ports from env.

---

## 11 · House rules every lane restates in its own report

1. **Provenance:** `systemsketch_scene.py` cites `systemsketch_adapter.py` line ranges it
   reuses readers from and `scene.ts:234-272` for any layout math; `pyblocksScene.ts` cites
   `rank()`; `sceneEvents.ts` cites `sceneDiff.ts` and `history.ts`. "Ours, ad hoc" for the
   classification table and the fold rule (`docs/ALGORITHM-PROVENANCE.md` classes).
2. **`WHY:` comments** at: the root-region rule; the `__inner` fold; the control-edge
   exclusion; `authoredPosition` (pyblocks never invents geometry); `none` means invisible;
   the `onSceneChange` diff seam instead of the tldraw store; zero default subscribers;
   `applied: 0` by contract.
3. **Concurrency:** no `git add -A`; explicit pathspecs; `ls --time-style=full-iso` before
   rewriting any file a peer may hold (pyblocks root has a peer's staged changes — never
   commit there); implementing is not integrating — land on the lane branch, report, stop.
4. **Verification:** the committed acceptance files are the bar; "cannot pass → report
   FAIL with the exact output" is a valid deliverable; never edit a `*.test.ts`, the Python
   acceptance, or a fixture to get green.
