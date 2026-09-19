// src/scene/sceneEvents.ts — SEMANTIC edit events derived from two scene
// states, and the one seam they leave through. SKELETON committed by the
// planning lane (docs/PYBLOCKS-BACKEND-PLAN.md, lane `trunk-loader-events`):
// the union below is the frozen contract; the functions throw until the
// builder lane fills them in. `sceneEvents.test.ts` is the acceptance and
// is off-limits to the builder.
//
// WHY events are derived from (before, after) scenes and not from tldraw's
// store: every host in this app already funnels each interaction through
// ONE seam, `onSceneChange(next)` (tldrawHost.tsx:523-528, domCanvas.tsx,
// reactFlowHost.tsx), writing the at-rest result into the scene as data.
// Diffing the two scene records at that seam is engine-free (this file
// imports no tldraw) and sees exactly the facts a consumer can act on;
// diffing tldraw records would see shape ids and props the app would then
// have to translate back into scene vocabulary anyway. If the rebuilt app
// ever makes tldraw's store the document instead of the scene, it projects
// store → scene first and calls the same function.
//
// WHY `sceneDiff.ts` is the donor and not a second walk: it already gives
// the three states (added/removed/modified) id-matched, per node, edge and
// port (`diffScene`), with `position` deliberately EXCLUDED (fieldDiff.ts's
// rule: geometry's mark is an outline). `node-moved` is the one thing this
// file adds on top, because for an EVENT a move is the most common fact.
//
// WHY there is no default consumer: Zach — "system sketch should kinda
// like emit UI edit events, that I guess normally have no consumer, but now
// pyblocks could consume it." `createSceneEventSeam()` hands out
// subscribe/publish and nothing else; with zero subscribers a publish is a
// no-op, and the app never knows who is listening.
//
// Pure: no React, no DOM, no canvas engine.

import type { HostScene, HostNodeData } from "../hosts/hostScene";
import type { BlockSide } from "../components/port.layout";
import type { BlockView } from "../components/blockPort.layout";
import type { SceneEdge, SceneEdgeEnds, SceneNode, ScenePosition } from "./scene";
import type { WireStyleData } from "./sceneWires";
import type { AuthorId } from "./history";

/* ------------------------------------------------------------------ */
/* The union — one member per fact a consumer could act on             */
/* ------------------------------------------------------------------ */

export type SceneEvent =
  | { type: "node-added"; nodeId: string; node: SceneNode<HostNodeData> }
  | { type: "node-removed"; nodeId: string; node: SceneNode<HostNodeData> }
  | { type: "node-moved"; nodeId: string; from: ScenePosition; to: ScenePosition }
  | { type: "node-resized"; nodeId: string; from: { w?: number; h?: number }; to: { w?: number; h?: number } }
  | { type: "node-reparented"; nodeId: string; from?: string; to?: string }
  | { type: "node-renamed"; nodeId: string; from?: string; to?: string }
  /** `data.view` changed — `expanded` → `port`/`simple` is a collapse,
   *  the reverse an expand. One event, the consumer names the verb. */
  | { type: "node-view-changed"; nodeId: string; from?: BlockView; to?: BlockView }
  | { type: "code-changed"; nodeId: string; from?: string; to?: string }
  | { type: "value-changed"; nodeId: string; from?: string; to?: string }
  /** Same id set on one wall, different order. */
  | { type: "ports-reordered"; nodeId: string; side: BlockSide; from: string[]; to: string[] }
  | { type: "port-added"; nodeId: string; portId: string; side?: BlockSide }
  | { type: "port-removed"; nodeId: string; portId: string; side?: BlockSide }
  /** `data.portLabels[portId]` changed. */
  | { type: "port-renamed"; nodeId: string; portId: string; from?: string; to?: string }
  | { type: "wire-connected"; edgeId: string; edge: SceneEdge<WireStyleData> }
  | { type: "wire-disconnected"; edgeId: string; edge: SceneEdge<WireStyleData> }
  /** `source`/`sourceHandle`/`target`/`targetHandle` changed. */
  | { type: "wire-rewired"; edgeId: string; from: SceneEdgeEnds; to: SceneEdgeEnds }
  /** Any node `data` key this union does not name — reported, never
   *  dropped, so a consumer can still see it. */
  | { type: "data-changed"; nodeId: string; key: string; from?: unknown; to?: unknown }
  /** Any edge `data` key change (variant, color, …). */
  | { type: "wire-data-changed"; edgeId: string; key: string; from?: unknown; to?: unknown };

export type SceneEventType = SceneEvent["type"];

/** One gesture's events, stamped the way `history.ts` stamps a batch —
 *  same `AuthorId`, so a consumer can self-skip through `shouldNotify`. */
export interface SceneEventBatch {
  id: string;
  author: AuthorId;
  label: string;
  /** ISO-8601, set by the publisher. */
  at: string;
  /** The document these events edit — `PyblocksSceneDocument.source.uri`
   *  when a pyblocks board is open, else the board's own path. */
  documentUri?: string;
  events: SceneEvent[];
}

/* ------------------------------------------------------------------ */
/* Deriving                                                            */
/* ------------------------------------------------------------------ */

/**
 * Every event that turns `before` into `after`. Ordering is the contract
 * (the fixture asserts it): nodes in `before` order then `after`-only
 * ids; per node, exactly this sequence — added|removed (exclusive) →
 * moved → resized → reparented → renamed → view-changed → code-changed →
 * value-changed → ports-reordered (left, right, top, bottom) → port-added
 * (after order) → port-removed (before order) → port-renamed (port id
 * order in `after`) → data-changed (sorted keys, excluding `name`, `view`,
 * `w`, `h`, `code`, `value`, `ports`, `portLabels`, `writers`, `readers`,
 * `content`). Then edges in the same union order: connected|disconnected
 * (exclusive) → rewired → wire-data-changed (sorted keys). A node that is
 * added or removed reports NO other event; its port vocabulary is read
 * with `hostPortsOf` (hostScene.ts) per side. Total: identical scenes
 * yield `[]`.
 */
export function deriveSceneEvents(_before: HostScene, _after: HostScene): SceneEvent[] {
  throw new Error("deriveSceneEvents: not implemented (lane trunk-loader-events)");
}

/* ------------------------------------------------------------------ */
/* The seam                                                            */
/* ------------------------------------------------------------------ */

export type SceneEventListener = (batch: SceneEventBatch) => void;

export interface SceneEventSeam {
  /** Deliver to every subscriber except the batch's own author
   *  (`history.ts`'s `shouldNotify`). No subscribers → no-op. */
  publish(batch: SceneEventBatch): void;
  /** Returns the unsubscribe. `subscriber` is the listener's own
   *  `AuthorId`, for the self-skip; omit it to hear everything. */
  subscribe(listener: SceneEventListener, subscriber?: AuthorId): () => void;
  /** How many listeners are attached — a story asserts `0` by default. */
  readonly size: number;
}

/** A fresh seam with zero subscribers. No module-level state: each app
 *  instance owns its own (history.ts's own rule). */
export function createSceneEventSeam(): SceneEventSeam {
  throw new Error("createSceneEventSeam: not implemented (lane trunk-loader-events)");
}
