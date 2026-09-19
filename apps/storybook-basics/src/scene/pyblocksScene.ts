// src/scene/pyblocksScene.ts — the pyblocks → SystemSketch document
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
// Pure: no React, no DOM, no canvas engine. Same rule as scene.ts.

import type { HostNodeData, HostScene } from "../hosts/hostScene";
import type { SceneEdge, SceneNode } from "./scene";
import type { WireStyleData } from "./sceneWires";

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

/**
 * Validate a JSON value as a `PyblocksSceneDocument`. Throws
 * `PyblocksSceneError` on: wrong `schemaVersion`/`kind`; a node without
 * `id`/`position`/`data.pyblocks`; an edge whose `source`/`target` names
 * no node; a `parentId` naming no node; any scene edge whose
 * `data.pyblocks.kind` is not `data`/`state`; any handle ending in
 * `__inner`. Everything else passes through untouched.
 */
export function parsePyblocksScene(_json: unknown): PyblocksSceneDocument {
  throw new PyblocksSceneError("parsePyblocksScene: not implemented (lane trunk-loader-events)");
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
export function layoutUnplaced(_scene: HostScene, _isUnplaced?: (node: SceneNode<HostNodeData>) => boolean): HostScene {
  throw new PyblocksSceneError("layoutUnplaced: not implemented (lane trunk-loader-events)");
}

/** `parsePyblocksScene` then `layoutUnplaced`; the one call an app makes. */
export function loadPyblocksScene(_json: unknown): LoadedPyblocksScene {
  throw new PyblocksSceneError("loadPyblocksScene: not implemented (lane trunk-loader-events)");
}
