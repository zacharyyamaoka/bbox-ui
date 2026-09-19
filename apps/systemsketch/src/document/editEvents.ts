// src/document/editEvents.ts — STUB. Lane L3 builds it
// (docs/SYSTEMSKETCH-REBUILD-PLAN.md §3.2).
//
// This is the seam stream 3 hooks: Zach's "system sketch should kinda like
// emit UI edit events, that I guess normally have no consumer, but now
// pyblocks could consume it". Nothing in this plan consumes it — which is
// precisely why its shape has to be pinned by a contract rather than by its
// first caller.
//
// Same reason as sceneFromStore.ts for existing now: src/document/editEvents.test.ts
// is committed and `tsconfig.json` includes all of `src`.
// WHY `RecordsDiff` comes from "tldraw" and not "@tldraw/store": the app
// reaches the engine only through its public entry point, which
// src/document/stockBoundary.test.ts enforces by grepping every source file
// here for a deeper `@tldraw/*` specifier.
import type { RecordsDiff, TLRecord, TLStore } from "tldraw";

import type { NodeShapeType } from "../shapes/types";

export type { NodeShapeType };

export interface WireEnd {
  nodeId: string;
  portId: string;
}

export type EditEvent =
  | { kind: "node.added"; nodeId: string; type: NodeShapeType; parentId: string | null; x: number; y: number; props: Record<string, unknown> }
  | { kind: "node.removed"; nodeId: string; type: NodeShapeType }
  | { kind: "node.moved"; nodeId: string; x: number; y: number; parentId: string | null }
  | { kind: "node.resized"; nodeId: string; w: number; h: number }
  // `fields` never lists `w`, `h` or `anchors`: those are geometry and
  // measurement, not an edit anybody made.
  | { kind: "node.changed"; nodeId: string; type: NodeShapeType; fields: string[]; before: Record<string, unknown>; after: Record<string, unknown> }
  | { kind: "wire.added"; wireId: string; from: WireEnd | null; to: WireEnd | null; variant: string }
  | { kind: "wire.removed"; wireId: string }
  | { kind: "wire.rebound"; wireId: string; from: WireEnd | null; to: WireEnd | null };

export interface EditBatch {
  source: "user" | "remote";
  events: EditEvent[];
}

const NOT_BUILT = 'not built — see docs/SYSTEMSKETCH-REBUILD-PLAN.md L3/L4';

/** Pure — a diff in, events out, no store read beyond the `after` lookup. */
export function editEventsFromDiff(_diff: RecordsDiff<TLRecord>, _after: (id: string) => TLRecord | undefined): EditEvent[] {
  throw new Error(NOT_BUILT);
}

/** `store.listen(handler, { source: "all", scope: "document" })` — ONE batch
 *  per transaction, so a wire and its two bindings created in one
 *  `editor.run` arrive as a single `wire.added` with both ends resolved. */
export function subscribeEditEvents(_store: TLStore, _listener: (batch: EditBatch) => void): () => void {
  throw new Error(NOT_BUILT);
}
