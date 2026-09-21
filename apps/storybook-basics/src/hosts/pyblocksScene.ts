// src/hosts/pyblocksScene.ts — the pyblocks → bbox studio document
// contract, TypeScript side. SKELETON committed by the planning lane
// (docs/PYBLOCKS-BACKEND-PLAN.md, lane `trunk-loader-events`): the TYPES
// below are the frozen contract both sides build against; the functions
// throw until the builder lane fills them in. `pyblocksScene.test.ts` is
// the acceptance and is off-limits to the builder.
//
// WHY a document of its own and not raw tldraw records: the trunk's
// `BlockScene` is engine-free (scene.ts imports nothing) and every host —
// DOM Canvas, React Flow, tldraw — already renders it. pyblocks emitting
// tldraw records would bind the Python side to one engine's schema and its
// migrations (`tldraw_store.py`'s own docstring refuses exactly that:
// "tldraw's migrations stay tldraw's problem"). So pyblocks emits a
// `BlockScene` whose `data` bags are this app's own `HostNodeData` plus a
// `pyblocks` namespace, and the app maps it to shapes the same way it maps
// any other scene. Decision record: docs/PYBLOCKS-BACKEND-PLAN.md §3.
//
// WHY `controlEdges` is a separate list and never enters `scene.edges`:
// Zach's ruling — "I didn't want to mix data lines and control lines…
// control is apparent from the structure itself." A BlockView edge whose
// `kind` is not `data`/`state` is kept here truthfully (nothing pyblocks
// said is dropped) but is NOT a wire; regions/nesting carry that fact.
//
// WHY THIS LIVES IN `hosts/` AND NOT `scene/` (moved 2026-09-21): it used
// to sit in `scene/` and import `hosts/hostScene`, which is the kit DAG
// backwards — `scene/` is `f(scene) -> data` and never reaches into a host
// (ARCHITECTURE.md). That import was not an implementation accident, it is
// what this module IS: the document's per-node bag is
// `PyblocksHostNodeData = HostNodeData & {pyblocks}` (this file's own
// header above — "a `BlockScene` whose `data` bags are this app's own
// `HostNodeData` plus a `pyblocks` namespace"), `loadPyblocksScene` hands
// back a `HostScene`, and the dangling-edge `problems` it reports are read
// with `hostPortsOf` — the host family's port vocabulary, `value`
// writers/readers asymmetry and all, which the scene kit is not allowed to
// know.
//
// Generifying it over the node-data bag, the way `scene/sceneEvents.ts` WAS
// generified in the same pass, is not available here: with
// `PyblocksSceneDocument<Data extends SceneData = SceneData>` the
// acceptance's own `const authored: HostScene = { nodes:
// doc.scene.nodes.map(...) }` (`pyblocksScene.test.ts`) stops compiling —
// TS2559, "has no properties in common with type 'HostNodeData'" — because
// a `SceneData` index signature hands every field back as `unknown`. The
// only way to keep the file in `scene/` was to edit an acceptance that is
// off-limits, so it moved to the kit it was always written against. Its
// stories (`PyblocksScene.stories.tsx`) and its acceptance already lived
// here.
//
// Still pure: no React, no DOM, no canvas engine. `hosts/` PERMITS an
// engine; this file simply has no use for one.

import { hostPortsOf, type HostNodeData, type HostScene } from "./hostScene";
import { findDanglingEdges, rank, type SceneEdge, type SceneNode, type ScenePosition } from "../scene/scene";
import type { WireStyleData } from "../scene/sceneWires";

export const PYBLOCKS_SCENE_SCHEMA_VERSION = 1 as const;
export const PYBLOCKS_SCENE_KIND = "pyblocks-scene" as const;

/** BlockView's `SourceSpan`, verbatim: 1-based lines, 0-based UTF-8 byte
 *  columns, half-open (`pyblocks/blockview.py:37-45`). Not re-encoded. */
export interface PyblocksSourceSpan {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  columnEncoding: string;
}

/** What a scene node remembers about the BlockView block it came from —
 *  enough for an edit event to name the semantic block again
 *  (`blockId`), and for the app to show source provenance. */
export interface PyblocksNodeData {
  blockId: string;
  semanticKind: string | null;
  role: string | null;
  effect: string | null;
  certainty: string | null;
  sourceSpan: PyblocksSourceSpan | null;
  /** `true` when BlockView carried an authored `style.blocks[id].position`;
   *  `false` means `position` is `{0,0}` and the LOADER lays it out
   *  (`layoutUnplaced`). pyblocks never invents geometry. */
  authoredPosition: boolean;
}

/** A region's control-flow identity — what the control-flow presets
 *  (stream 1) key their face on. `kind` is the BlockView analysis role
 *  (`for`, `while`, `if`, `try`, …) or `function` for the selected
 *  function's own boundary; `head` is the header text (`for detection in
 *  detections:`, `run(raw: bytes) -> Frame`). */
export interface PyblocksControl {
  kind: string;
  head: string;
}

export type PyblocksHostNodeData = HostNodeData & {
  pyblocks: PyblocksNodeData;
  /** Port id → authored port NAME. Only NAMED ports appear; an absent
   *  entry means "no authored label", and the face falls back to the id
   *  (the trunk's own `label: id` default, nodeViews.tsx). Rendered
   *  literally — `feedback_truthful_property_rendering`. */
  portLabels?: Record<string, string>;
  /** Port id → declared type text, when BlockView had one. */
  portTypes?: Record<string, string>;
  description?: string;
  control?: PyblocksControl;
};

export interface PyblocksEdgeData {
  edgeId: string;
  /** Only `data` and `state` ever become wires — see the file header. */
  kind: "data" | "state";
  label?: string;
  certainty?: string;
  /** This end named an `__inner` twin port in BlockView and was folded
   *  onto the region's one hierarchical pin (plan §3.2). */
  innerSource?: true;
  innerTarget?: true;
}

export type PyblocksWireData = WireStyleData & { pyblocks: PyblocksEdgeData };

/** A BlockView edge of a non-data kind (`control`, `effect`, …), kept
 *  whole and never drawn. Endpoints are the RAW BlockView ids — `__inner`
 *  is not folded here, because nothing paints from this list. */
export interface PyblocksControlEdge {
  id: string;
  kind: string;
  source: { nodeId: string; portId: string };
  target: { nodeId: string; portId: string };
  label?: string;
}

export interface PyblocksSceneDocument {
  schemaVersion: typeof PYBLOCKS_SCENE_SCHEMA_VERSION;
  kind: typeof PYBLOCKS_SCENE_KIND;
  source: {
    uri: string;
    sha256: string | null;
    selectedViewId: string | null;
    title: string | null;
  };
  scene: {
    nodes: SceneNode<PyblocksHostNodeData>[];
    edges: SceneEdge<PyblocksWireData>[];
  };
  controlEdges: PyblocksControlEdge[];
  views: { id: string; title: string }[];
  diagnostics: { severity: "error" | "warning" | "info"; message: string }[];
}

export class PyblocksSceneError extends Error {
  override readonly name = "PyblocksSceneError";
}

export interface LoadedPyblocksScene {
  /** Ready for any host: every unplaced node laid out, every edge a data
   *  wire, `controlEdges` NOT in it. */
  scene: HostScene;
  document: PyblocksSceneDocument;
  /** Non-fatal findings (a dangling edge end, an unknown node type) —
   *  reported, never silently repaired. */
  problems: string[];
}

/* ------------------------------------------------------------------ */
/* Reading a document — total predicates, loud refusals                */
/* ------------------------------------------------------------------ */

/** Only `data` and `state` ever become wires (file header). A `Set` so the
 *  refusal below and a reader both see one list. */
const WIRE_EDGE_KINDS: ReadonlySet<string> = new Set(["data", "state"]);

/** BlockView's twin-port suffix (`pyblocks/blockview.py`'s
 *  `port.id.endswith("__inner")`). */
const INNER_PORT_SUFFIX = "__inner";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A value in a message, quoted the way JSON would write it — so a refusal
 *  naming a port id can be pasted straight back into the document. */
function text(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}

function refuse(what: string): never {
  throw new PyblocksSceneError(what);
}

/* ------------------------------------------------------------------ */
/* Layout — the ONE geometry the app adds, because pyblocks adds none  */
/* ------------------------------------------------------------------ */

/** Where the first column/row of a scope sits, in the PARENT's space.
 *  Never `{0,0}`: the origin is what an unplaced node already carries, and
 *  a laid-out node that still reads `{0,0}` is indistinguishable from one
 *  the layout never reached. */
const LAYOUT_ORIGIN_PX = { x: 40, y: 40 } as const;
/** One dependency step to the right — wider than the widest stock block
 *  (`expanded` = 520 is a region; a block is 240) plus a gutter. */
const LAYOUT_COLUMN_PX = 320;
/** One sibling down inside a column. */
const LAYOUT_ROW_PX = 160;

/** The default `isUnplaced`: pyblocks itself said it authored no position. */
function unplacedByPyblocks(node: SceneNode<HostNodeData>): boolean {
  const pyblocks = (node.data as { pyblocks?: { authoredPosition?: boolean } }).pyblocks;
  return pyblocks?.authoredPosition === false;
}

/**
 * Validate a JSON value as a `PyblocksSceneDocument`. Throws
 * `PyblocksSceneError` on: wrong `schemaVersion`/`kind`; a node without
 * `id`/`position`/`data.pyblocks`; an edge whose `source`/`target` names
 * no node; a `parentId` naming no node; any scene edge whose
 * `data.pyblocks.kind` is not `data`/`state`; any handle ending in
 * `__inner`. Everything else passes through untouched.
 */
export function parsePyblocksScene(json: unknown): PyblocksSceneDocument {
  if (!isRecord(json)) refuse(`a pyblocks-scene document is an object, got ${json === null ? "null" : typeof json}`);
  if (json.schemaVersion !== PYBLOCKS_SCENE_SCHEMA_VERSION) {
    refuse(`schemaVersion ${text(json.schemaVersion)} is not ${PYBLOCKS_SCENE_SCHEMA_VERSION}`);
  }
  if (json.kind !== PYBLOCKS_SCENE_KIND) refuse(`kind ${text(json.kind)} is not ${text(PYBLOCKS_SCENE_KIND)}`);
  if (!isRecord(json.source)) refuse("source is missing");
  if (!isRecord(json.scene)) refuse("scene is missing");
  const nodes = json.scene.nodes;
  const edges = json.scene.edges;
  if (!Array.isArray(nodes)) refuse("scene.nodes is not an array");
  if (!Array.isArray(edges)) refuse("scene.edges is not an array");
  for (const key of ["controlEdges", "views", "diagnostics"] as const) {
    if (!Array.isArray(json[key])) refuse(`${key} is not an array`);
  }

  const ids = new Set<string>();
  for (const node of nodes) {
    if (!isRecord(node) || typeof node.id !== "string" || node.id === "") refuse("a node carries no id");
    const id = node.id as string;
    if (ids.has(id)) refuse(`two nodes share the id ${text(id)}`);
    const position = (node as Record<string, unknown>).position;
    if (!isRecord(position) || typeof position.x !== "number" || typeof position.y !== "number") {
      refuse(`node ${text(id)} carries no position`);
    }
    const data = (node as Record<string, unknown>).data;
    // `data.pyblocks` is what makes a node one of OURS — the blockId an edit
    // event names the semantic block with. A node without it came from
    // somewhere else and the loader will not guess a provenance for it.
    if (!isRecord(data) || !isRecord(data.pyblocks)) refuse(`node ${text(id)} carries no data.pyblocks`);
    ids.add(id);
  }
  for (const node of nodes as Record<string, unknown>[]) {
    const parentId = node.parentId;
    if (parentId === undefined) continue;
    if (typeof parentId !== "string" || !ids.has(parentId)) {
      refuse(`node ${text(node.id)} names a parent no node has: ${text(parentId)}`);
    }
  }

  for (const edge of edges) {
    if (!isRecord(edge) || typeof edge.id !== "string" || edge.id === "") refuse("an edge carries no id");
    const id = edge.id as string;
    for (const end of ["source", "target"] as const) {
      const nodeId = edge[end];
      if (typeof nodeId !== "string" || !ids.has(nodeId)) refuse(`edge ${text(id)}'s ${end} names no node: ${text(nodeId)}`);
    }
    for (const handle of ["sourceHandle", "targetHandle"] as const) {
      const portId = edge[handle];
      if (portId !== undefined && typeof portId !== "string") refuse(`edge ${text(id)}'s ${handle} is not a port id`);
      // WHY an `__inner` handle is a refusal and not something to strip
      // here: a region's twin ports are folded onto its ONE hierarchical
      // pin by the projection (plan §3.2 rule 3/6), so a document that
      // still names a twin was built by something that did not fold —
      // and a loader that quietly stripped the suffix would paint a wire
      // onto a pin the projection never meant to expose. `innerSource`/
      // `innerTarget` on the edge's own `pyblocks` bag is where "this end
      // was a twin" survives.
      if (typeof portId === "string" && portId.endsWith(INNER_PORT_SUFFIX)) {
        refuse(`edge ${text(id)}'s ${handle} still names an ${INNER_PORT_SUFFIX} twin: ${text(portId)}`);
      }
    }
    const data = isRecord(edge.data) ? edge.data : undefined;
    const pyblocks = data && isRecord(data.pyblocks) ? data.pyblocks : undefined;
    const kind = pyblocks?.kind;
    // WHY a non-wire kind is a refusal rather than a quiet move into
    // `controlEdges`: Zach's ruling — "I didn't want to mix data lines and
    // control lines… control is apparent from the structure itself."
    // `scene.edges` is the DRAWN set; the only honest place for a control
    // edge is `controlEdges`, and deciding that is the projection's job,
    // not the loader's. Repairing it here would let a producer keep
    // emitting the mixture and never hear about it.
    if (typeof kind !== "string" || !WIRE_EDGE_KINDS.has(kind)) {
      refuse(`edge ${text(id)} has data.pyblocks.kind ${text(kind)} — only data and state are wires`);
    }
  }

  // The SAME object graph, not a rebuild: the acceptance compares
  // `JSON.stringify(doc)` to the raw input, which is the mechanical way to
  // state "nothing pyblocks said was dropped, reordered or re-encoded".
  return json as unknown as PyblocksSceneDocument;
}

/**
 * Deterministic placement for every node whose `data.pyblocks.authoredPosition`
 * is `false` (or, when `isUnplaced` is given, for which it returns true).
 * Per PARENT SCOPE (siblings sharing one `parentId`, top level included):
 * rank = `rank()` from scene.ts over the edges between those siblings,
 * `x = 40 + 320 * rank`, `y = 40 + 160 * i` where `i` counts siblings of
 * that rank in scene order; blocked nodes (cycles) rank after the highest
 * finite rank. Authored positions are never touched. Pure; returns the
 * same object when nothing is unplaced.
 */
export function layoutUnplaced(scene: HostScene, isUnplaced: (node: SceneNode<HostNodeData>) => boolean = unplacedByPyblocks): HostScene {
  // Referentially honest no-op — the kit's own contract (`duplicateNode`,
  // `reconcilePortLane`): nothing to place, the SAME object back.
  if (!scene.nodes.some(isUnplaced)) return scene;

  const placed = new Map<string, ScenePosition>();
  for (const parentId of new Set(scene.nodes.map((node) => node.parentId))) {
    const siblings = scene.nodes.filter((node) => node.parentId === parentId);
    const inScope = new Set(siblings.map((node) => node.id));
    // WHY the rank is computed per PARENT SCOPE over only the edges whose
    // BOTH ends are siblings: `position` is parent-relative (scene.ts's own
    // rule), so a column index computed across scopes would be measured in
    // one space and applied in another. An edge leaving the scope says
    // nothing about where its inside end sits among its siblings.
    const ranks = rank({
      nodes: siblings,
      edges: scene.edges.filter((edge) => inScope.has(edge.source) && inScope.has(edge.target)),
    });
    // `rank()` leaves blocked nodes (on or behind a cycle) out of the map
    // rather than inventing a depth for them — so they get the column after
    // the deepest honest one, which is the only placement that does not
    // claim an order the graph does not have.
    const blockedColumn = Math.max(-1, ...ranks.values()) + 1;
    const rowsUsed = new Map<number, number>();
    for (const node of siblings) {
      if (!isUnplaced(node)) continue;
      const column = ranks.get(node.id) ?? blockedColumn;
      const row = rowsUsed.get(column) ?? 0;
      rowsUsed.set(column, row + 1);
      placed.set(node.id, {
        x: LAYOUT_ORIGIN_PX.x + LAYOUT_COLUMN_PX * column,
        y: LAYOUT_ORIGIN_PX.y + LAYOUT_ROW_PX * row,
      });
    }
  }

  return {
    nodes: scene.nodes.map((node) => {
      const position = placed.get(node.id);
      // WHY an authored node comes back as the SAME object: pyblocks never
      // invents geometry (`authoredPosition`), and the loader must not
      // either — a rewritten record would make a byte comparison against
      // what the author placed impossible.
      return position === undefined ? node : { ...node, position };
    }),
    edges: scene.edges,
  };
}

/** `parsePyblocksScene` then `layoutUnplaced`; the one call an app makes. */
export function loadPyblocksScene(json: unknown): LoadedPyblocksScene {
  const document = parsePyblocksScene(json);
  // `controlEdges` never enters the scene — see this file's header. The
  // document keeps them whole beside it, so nothing pyblocks said is lost.
  const scene = layoutUnplaced({ nodes: document.scene.nodes, edges: document.scene.edges });
  const problems = findDanglingEdges(scene, hostPortsOf(scene)).map((end) =>
    end.reason === "missing-node"
      ? `edge ${end.edgeId}: ${end.end} names no node (${end.nodeId})`
      : `edge ${end.edgeId}: ${end.end} node ${end.nodeId} does not speak port ${end.portId}`,
  );
  return { scene, document, problems };
}
