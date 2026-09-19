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

import { hostPortsOf, type HostScene, type HostNodeData } from "../hosts/hostScene";
import { BLOCK_SIDES, type BlockSide } from "../components/port.layout";
import type { BlockView } from "../components/blockPort.layout";
import type { SceneEdge, SceneEdgeEnds, SceneNode, ScenePosition } from "./scene";
import { diffScene } from "./sceneDiff";
import type { WireStyleData } from "./sceneWires";
import { shouldNotify, type AuthorId } from "./history";

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
/* ------------------------------------------------------------------ */
/* Reading two sides — the donor's rules, re-expressed (they are        */
/* private in `sceneDiff.ts`) rather than re-derived                    */
/* ------------------------------------------------------------------ */

/** Node `data` keys this union already names — everything else becomes a
 *  `data-changed`, so a key nobody planned for is still reported. */
const NAMED_NODE_DATA_KEYS: ReadonlySet<string> = new Set([
  "name",
  "view",
  "w",
  "h",
  "code",
  "value",
  "ports",
  "portLabels",
  "writers",
  "readers",
  "content",
]);

/** `sceneDiff.ts:158-163`'s `asText`, re-expressed because it is private
 *  there: two values are "the same field" exactly when that module's own
 *  field diff would say so, so an event never fires for a change
 *  `diffScene` calls no change (and vice versa). */
function asText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function sameValue(before: unknown, after: unknown): boolean {
  return asText(before) === asText(after);
}

/** `sceneDiff.ts:249-269`'s `unionIdsInOrder` — every id from `before` in
 *  its own order, then the ids only `after` introduces. Re-expressed for
 *  the same reason as `asText`; the ORDER is the contract this file's doc
 *  states, so it cannot quietly differ from the differ's. */
function unionIdsInOrder(before: readonly { id: string }[], after: readonly { id: string }[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of [...before, ...after]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    ids.push(item.id);
  }
  return ids;
}

function dataOf(node: SceneNode<HostNodeData>): Record<string, unknown> {
  return node.data as Record<string, unknown>;
}

/** Which wall a port sits on, or `undefined` when the node does not place
 *  it on one (a `value` node's writers/readers are lanes, not walls —
 *  `hostPortsOf`'s own asymmetry). */
function sideOf(node: SceneNode<HostNodeData>, portId: string): BlockSide | undefined {
  for (const side of BLOCK_SIDES) {
    if ((node.data.ports?.[side] ?? []).includes(portId)) return side;
  }
  return undefined;
}

function endsOf(edge: SceneEdge<WireStyleData>): SceneEdgeEnds {
  return { source: edge.source, sourceHandle: edge.sourceHandle, target: edge.target, targetHandle: edge.targetHandle };
}

function sameIdSet(before: readonly string[], after: readonly string[]): boolean {
  return before.length === after.length && [...before].sort().join("\u0000") === [...after].sort().join("\u0000");
}

export function deriveSceneEvents(before: HostScene, after: HostScene): SceneEvent[] {
  const portsBefore = hostPortsOf(before);
  const portsAfter = hostPortsOf(after);
  // The three states, id-matched, per node / edge / PORT — `diffScene` is
  // the donor and the port rows are the half a structural walk of
  // `{nodes, edges}` cannot see on its own (`sceneDiff.ts`'s "THE GAP").
  const diff = diffScene(before, after, { before: portsBefore, after: portsAfter });
  const operationOf = new Map(diff.nodes.map((row) => [row.id, row.operation]));
  const edgeOperationOf = new Map(diff.edges.map((row) => [row.id, row.operation]));
  const beforeNodes = new Map(before.nodes.map((node) => [node.id, node]));
  const afterNodes = new Map(after.nodes.map((node) => [node.id, node]));
  const beforeEdges = new Map(before.edges.map((edge) => [edge.id, edge]));
  const afterEdges = new Map(after.edges.map((edge) => [edge.id, edge]));

  const events: SceneEvent[] = [];

  for (const nodeId of unionIdsInOrder(before.nodes, after.nodes)) {
    // WHY an added or removed node reports nothing else about itself: the
    // whole record travels on the event, so every other fact about it is
    // already in there — `sceneDiff.ts`'s own "a whole-object insertion has
    // nothing on the other side to align against", said in events.
    if (operationOf.get(nodeId) === "added") {
      events.push({ type: "node-added", nodeId, node: afterNodes.get(nodeId)! });
      continue;
    }
    if (operationOf.get(nodeId) === "removed") {
      events.push({ type: "node-removed", nodeId, node: beforeNodes.get(nodeId)! });
      continue;
    }
    const was = beforeNodes.get(nodeId);
    const now = afterNodes.get(nodeId);
    if (!was || !now) continue;
    const wasData = dataOf(was);
    const nowData = dataOf(now);

    // The one fact `diffScene` deliberately excludes (`fieldDiff.ts`:
    // geometry's mark is an outline, not a word diff) — and the most
    // common thing a pointer does, so it leads.
    if (was.position.x !== now.position.x || was.position.y !== now.position.y) {
      events.push({
        type: "node-moved",
        nodeId,
        from: { x: was.position.x, y: was.position.y },
        to: { x: now.position.x, y: now.position.y },
      });
    }
    if (was.data.w !== now.data.w || was.data.h !== now.data.h) {
      // Both walls travel on both sides even when only one moved: a
      // consumer resizing a box needs the pair, not the delta.
      events.push({ type: "node-resized", nodeId, from: { w: was.data.w, h: was.data.h }, to: { w: now.data.w, h: now.data.h } });
    }
    if (was.parentId !== now.parentId) {
      events.push({ type: "node-reparented", nodeId, from: was.parentId, to: now.parentId });
    }
    if (was.data.name !== now.data.name) {
      events.push({ type: "node-renamed", nodeId, from: was.data.name, to: now.data.name });
    }
    if (was.data.view !== now.data.view) {
      events.push({ type: "node-view-changed", nodeId, from: was.data.view, to: now.data.view });
    }
    if (was.data.code !== now.data.code) {
      events.push({ type: "code-changed", nodeId, from: was.data.code, to: now.data.code });
    }
    if (was.data.value !== now.data.value) {
      events.push({ type: "value-changed", nodeId, from: was.data.value, to: now.data.value });
    }

    for (const side of BLOCK_SIDES) {
      const wall = was.data.ports?.[side] ?? [];
      const next = now.data.ports?.[side] ?? [];
      // Reorder means the SAME ids in a different order; a wall that gained
      // or lost one is reported by port-added/port-removed below, which is
      // the fact a consumer acts on.
      if (sameIdSet(wall, next) && wall.join("\u0000") !== next.join("\u0000")) {
        events.push({ type: "ports-reordered", nodeId, side, from: [...wall], to: [...next] });
      }
    }

    const portRows = diff.ports.filter((row) => row.nodeId === nodeId);
    const added = new Set(portRows.filter((row) => row.operation === "added").map((row) => row.portId));
    const removed = new Set(portRows.filter((row) => row.operation === "removed").map((row) => row.portId));
    for (const portId of portsAfter(nodeId) ?? []) {
      if (added.has(portId)) events.push({ type: "port-added", nodeId, portId, side: sideOf(now, portId) });
    }
    for (const portId of portsBefore(nodeId) ?? []) {
      if (removed.has(portId)) events.push({ type: "port-removed", nodeId, portId, side: sideOf(was, portId) });
    }

    const wasLabels = was.data.portLabels ?? {};
    const nowLabels = now.data.portLabels ?? {};
    for (const portId of unionIdsInOrder(
      Object.keys(nowLabels).map((id) => ({ id })),
      Object.keys(wasLabels).map((id) => ({ id })),
    )) {
      // A port that arrived or left this turn is not ALSO renamed — its own
      // row already carries everything about it, the same rule an added
      // node follows above.
      if (added.has(portId) || removed.has(portId)) continue;
      if (wasLabels[portId] === nowLabels[portId]) continue;
      events.push({ type: "port-renamed", nodeId, portId, from: wasLabels[portId], to: nowLabels[portId] });
    }

    for (const key of [...new Set([...Object.keys(wasData), ...Object.keys(nowData)])].sort()) {
      if (NAMED_NODE_DATA_KEYS.has(key)) continue;
      if (sameValue(wasData[key], nowData[key])) continue;
      // The raw values, never a rendering of them: `from` is `undefined`
      // exactly when the key was absent, which is what a JS object says and
      // what `from?: unknown` means. Substituting `null` for "absent" would
      // be a silent normalization, and it would make a legitimate stored
      // `null` unreadable.
      events.push({ type: "data-changed", nodeId, key, from: wasData[key], to: nowData[key] });
    }
  }

  for (const edgeId of unionIdsInOrder(before.edges, after.edges)) {
    if (edgeOperationOf.get(edgeId) === "added") {
      events.push({ type: "wire-connected", edgeId, edge: afterEdges.get(edgeId)! });
      continue;
    }
    if (edgeOperationOf.get(edgeId) === "removed") {
      events.push({ type: "wire-disconnected", edgeId, edge: beforeEdges.get(edgeId)! });
      continue;
    }
    const was = beforeEdges.get(edgeId);
    const now = afterEdges.get(edgeId);
    if (!was || !now) continue;
    if (
      was.source !== now.source ||
      was.sourceHandle !== now.sourceHandle ||
      was.target !== now.target ||
      was.targetHandle !== now.targetHandle
    ) {
      // A rewiring is an ordinary field change here, not a coordinate one —
      // `sceneDiff.ts`'s §1 note: this kit's edge ends are ids already.
      events.push({ type: "wire-rewired", edgeId, from: endsOf(was), to: endsOf(now) });
    }
    const wasData = (was.data ?? {}) as Record<string, unknown>;
    const nowData = (now.data ?? {}) as Record<string, unknown>;
    for (const key of [...new Set([...Object.keys(wasData), ...Object.keys(nowData)])].sort()) {
      if (sameValue(wasData[key], nowData[key])) continue;
      events.push({ type: "wire-data-changed", edgeId, key, from: wasData[key], to: nowData[key] });
    }
  }

  return events;
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
  // A `Set` of entries, not a `Map` keyed by listener: the same function may
  // subscribe twice (two panels, one render), and each subscription owns its
  // own unsubscribe.
  const entries = new Set<{ listener: SceneEventListener; subscriber?: AuthorId }>();
  return {
    publish(batch) {
      // Iterate a COPY: a listener that unsubscribes (or subscribes) while
      // being notified must not change who else hears THIS batch.
      for (const entry of [...entries]) {
        // WHY the self-skip runs through `history.ts`'s own `shouldNotify`
        // rather than an inline `!==`: it is the one line the history
        // contract is built around, and two spellings of "is this my own
        // write" is exactly how a host ends up fighting its own drag.
        // `shouldNotify` reads only the batch's author, so the envelope is
        // rebuilt as the `HistoryBatch` it expects.
        if (entry.subscriber !== undefined && !shouldNotify({ id: batch.id, author: batch.author, label: batch.label, writes: [], closed: true }, entry.subscriber)) {
          continue;
        }
        entry.listener(batch);
      }
    },
    subscribe(listener, subscriber) {
      const entry = { listener, subscriber };
      entries.add(entry);
      return () => {
        entries.delete(entry);
      };
    },
    // WHY a getter and not a snapshot number: a story reads `size: 0` to
    // show that the seam has no consumer by default (Zach: the app "should
    // kinda like emit UI edit events, that I guess normally have no
    // consumer"), and that claim has to stay true as subscribers come and go.
    get size() {
      return entries.size;
    },
  };
}
