// src/document/editEvents.ts — the UI-edit-event seam
// (docs/SYSTEMSKETCH-REBUILD-PLAN.md §3.2).
//
// This is the seam stream 3 hooks: Zach's "system sketch should kinda like
// emit UI edit events, that I guess normally have no consumer, but now
// pyblocks could consume it". Nothing in this plan consumes it — which is
// precisely why its shape is pinned by a contract
// (src/document/editEvents.test.ts, committed before this lane existed)
// rather than by its first caller.
//
// WHY a translation of tldraw's `RecordsDiff` rather than a second event log
// the app writes beside the store: the store is already the document
// (plan §1.1-B), and a parallel log is a second source of truth that can
// disagree with it. Deriving means a consumer can never see an event for
// something that did not actually land in the document, and no edit path can
// forget to emit.
//
// WHY `RecordsDiff` comes from "tldraw" and not "@tldraw/store": the app
// reaches the engine only through its public entry point, which
// src/document/stockBoundary.test.ts enforces by grepping every source file
// here for a deeper `@tldraw/*` specifier.
import type { RecordsDiff, TLBinding, TLRecord, TLShape, TLStore } from "tldraw";

import type { WireBinding } from "../shapes/wire/WireBindingUtil";
import { NODE_SHAPE_TYPES, WIRE_BINDING_TYPE, WIRE_SHAPE_TYPE, type NodeShapeType } from "../shapes/types";

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

/**
 * How `editEventsFromDiff` reads the REST of the document — the part a single
 * transaction does not carry.
 *
 * A plain `(id) => record` is the whole contract for everything that arrives
 * whole: a created shape, a move, a deletion. The optional
 * `bindingsOfWire` is what makes `wire.rebound` honest. Re-pointing ONE
 * binding puts only that binding in the diff, so the OTHER end of the cable
 * — unchanged, and therefore absent — has to be read from the store, and a
 * lookup keyed by id cannot find a record whose id nobody knows. Rather than
 * widen the signature to take a whole `TLStore` (which would make this
 * function un-testable without one, and is the dependency the contract
 * deliberately does not have), `subscribeEditEvents` hands over a lookup that
 * ALSO knows how to enumerate one wire's bindings. A caller with only the
 * diff passes a plain arrow and gets the ends the diff carries — which is
 * exactly what `editEvents.test.ts`'s purity case does.
 */
export interface RecordLookup {
  (id: string): TLRecord | undefined;
  bindingsOfWire?(wireId: string): readonly WireBinding[];
}

/** Props that are GEOMETRY or MEASUREMENT, never an edit somebody made.
 *  `w`/`h` get their own `node.resized`; `anchors` gets nothing at all — the
 *  host sights port dots on every layout settle (`shapes/shared/measure.ts`
 *  writes them with `history: "ignore"` for the same reason), and a consumer
 *  told about that would be told about a font loading. */
const NEVER_A_FIELD = new Set(["w", "h", "anchors"]);

function isShape(record: TLRecord): record is TLShape {
  return record.typeName === "shape";
}

function isWireBinding(record: TLRecord): record is WireBinding {
  return record.typeName === "binding" && (record as TLBinding).type === WIRE_BINDING_TYPE;
}

function isNodeShape(shape: TLShape): shape is TLShape & { type: NodeShapeType } {
  return (NODE_SHAPE_TYPES as readonly string[]).includes(shape.type);
}

/** `null` when the parent is the PAGE — "top-level", in the derived scene's
 *  own vocabulary (`SceneNode.parentId` absent = top level). A shape parent
 *  is a member of an expanded block or a region. */
function parentOf(shape: TLShape): string | null {
  const parentId = String(shape.parentId);
  return parentId.startsWith("shape:") ? parentId : null;
}

function propsOf(shape: TLShape): Record<string, unknown> {
  return shape.props as unknown as Record<string, unknown>;
}

/**
 * Structural equality for one prop value.
 *
 * WHY `JSON.stringify` and not a reference check: `ports` and `anchors` are
 * nested objects, and a store update spreads props — so a field nobody
 * touched still arrives as a NEW object. A reference check would report every
 * rail as changed on every keystroke somewhere else in the shape. Key ORDER
 * is stable here because both sides come from the same shape's props, built
 * by the same spread.
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Both ends of a wire, as the document knows them right now. A terminal with
 *  no binding is `null` — "skipped, not guessed at", the same honesty
 *  `sceneFromRecords` applies when it omits a half-bound wire entirely. */
function endsOfWire(wireId: string, diff: RecordsDiff<TLRecord>, after: RecordLookup): { from: WireEnd | null; to: WireEnd | null } {
  const ends: { start: WireEnd | null; end: WireEnd | null } = { start: null, end: null };
  const take = (binding: WireBinding) => {
    ends[binding.props.terminal] = { nodeId: String(binding.toId), portId: binding.props.portId };
  };
  // The store first (it already reflects this transaction), then the diff on
  // top — so a caller with no store enumeration still resolves every end the
  // transaction itself carries.
  for (const binding of after.bindingsOfWire?.(wireId) ?? []) take(binding);
  for (const record of Object.values(diff.added)) {
    if (isWireBinding(record) && String(record.fromId) === wireId) take(record);
  }
  for (const [, to] of Object.values(diff.updated)) {
    if (isWireBinding(to) && String(to.fromId) === wireId) take(to);
  }
  for (const record of Object.values(diff.removed)) {
    if (isWireBinding(record) && String(record.fromId) === wireId) ends[record.props.terminal] = null;
  }
  return { from: ends.start, to: ends.end };
}

/** Pure — a diff in, events out, no store read beyond the `after` lookup. */
export function editEventsFromDiff(diff: RecordsDiff<TLRecord>, after: RecordLookup): EditEvent[] {
  const events: EditEvent[] = [];
  const addedShapeIds = new Set(Object.keys(diff.added));
  const removedShapeIds = new Set(Object.keys(diff.removed));

  for (const record of Object.values(diff.added)) {
    if (!isShape(record)) continue;
    if (record.type === WIRE_SHAPE_TYPE) {
      // ONE event for the whole cable. The bindings created beside it in this
      // same transaction resolve its ends below rather than emitting events
      // of their own — a cable arriving in pieces is a transaction artefact,
      // not something that happened to the document.
      events.push({
        kind: "wire.added",
        wireId: record.id,
        ...endsOfWire(record.id, diff, after),
        variant: String(propsOf(record).variant ?? "data"),
      });
      continue;
    }
    if (!isNodeShape(record)) continue;
    events.push({
      kind: "node.added",
      nodeId: record.id,
      type: record.type,
      parentId: parentOf(record),
      x: record.x,
      y: record.y,
      props: { ...propsOf(record) },
    });
  }

  for (const [before, current] of Object.values(diff.updated)) {
    if (!isShape(current) || !isShape(before)) continue;
    // A wire's own props (routing, colour, a loose terminal mid-drag) are
    // STYLE and in-flight geometry, not an edit event in this vocabulary
    // (plan §3.2 names eight kinds and none of them is "wire.styled").
    // Re-pointing a wire IS reported — as `wire.rebound`, from the binding.
    if (!isNodeShape(current)) continue;
    if (before.x !== current.x || before.y !== current.y || before.parentId !== current.parentId) {
      events.push({ kind: "node.moved", nodeId: current.id, x: current.x, y: current.y, parentId: parentOf(current) });
    }
    const beforeProps = propsOf(before);
    const currentProps = propsOf(current);
    if (!sameValue(beforeProps.w, currentProps.w) || !sameValue(beforeProps.h, currentProps.h)) {
      events.push({ kind: "node.resized", nodeId: current.id, w: Number(currentProps.w), h: Number(currentProps.h) });
    }
    const fields = Object.keys(currentProps).filter((key) => !NEVER_A_FIELD.has(key) && !sameValue(beforeProps[key], currentProps[key]));
    if (fields.length > 0) {
      events.push({
        kind: "node.changed",
        nodeId: current.id,
        type: current.type,
        fields,
        before: Object.fromEntries(fields.map((key) => [key, beforeProps[key]])),
        after: Object.fromEntries(fields.map((key) => [key, currentProps[key]])),
      });
    }
  }

  for (const record of Object.values(diff.removed)) {
    if (!isShape(record)) continue;
    if (record.type === WIRE_SHAPE_TYPE) {
      events.push({ kind: "wire.removed", wireId: record.id });
      continue;
    }
    if (!isNodeShape(record)) continue;
    events.push({ kind: "node.removed", nodeId: record.id, type: record.type });
  }

  // Bindings that moved on their own — a terminal dragged to a different port
  // or a different node. One event per WIRE, however many of its bindings the
  // transaction touched, because "this cable now runs from X to Y" is one
  // fact. A wire created or deleted in this same transaction is skipped: its
  // `wire.added` already carries both ends, and a `wire.removed` has no ends
  // left to report.
  const reboundWireIds = new Set<string>();
  for (const record of [
    ...Object.values(diff.added),
    ...Object.values(diff.updated).map(([, to]) => to),
    ...Object.values(diff.removed),
  ]) {
    if (!isWireBinding(record)) continue;
    const wireId = String(record.fromId);
    if (addedShapeIds.has(wireId) || removedShapeIds.has(wireId)) continue;
    if (!after(wireId)) continue;
    reboundWireIds.add(wireId);
  }
  for (const wireId of reboundWireIds) {
    events.push({ kind: "wire.rebound", wireId, ...endsOfWire(wireId, diff, after) });
  }

  return events;
}

/** The lookup `subscribeEditEvents` hands to the translation above. Built
 *  fresh per transaction and its binding index computed lazily, so a batch
 *  that touches no wire never walks the store at all. */
function lookupInto(store: TLStore): RecordLookup {
  let index: Map<string, WireBinding[]> | null = null;
  const lookup = ((id: string) => store.get(id as Parameters<TLStore["get"]>[0])) as RecordLookup;
  lookup.bindingsOfWire = (wireId: string) => {
    if (!index) {
      index = new Map<string, WireBinding[]>();
      for (const record of store.allRecords()) {
        if (!isWireBinding(record)) continue;
        const key = String(record.fromId);
        const bucket = index.get(key);
        if (bucket) bucket.push(record);
        else index.set(key, [record]);
      }
    }
    return index.get(wireId) ?? [];
  };
  return lookup;
}

/**
 * `store.listen(handler, { source: "all", scope: "document" })` — ONE batch
 * per transaction, so a wire and its two bindings created in one
 * `editor.run` arrive as a single `wire.added` with both ends resolved.
 *
 * WHY a batch with no semantic events is not delivered: the store fires for
 * every transaction, and most of them are measurement — `shared/measure.ts`
 * writes `anchors` back on every layout settle and every font load. A
 * consumer handed `{ events: [] }` sixty times a second has to learn to
 * ignore it, and a consumer that forgets is a consumer that does work per
 * frame. The contract's own test allows either
 * (`expect(batches.length).toBeGreaterThanOrEqual(...)`), so this is the
 * lane's call, made here rather than left implicit.
 *
 * `scope: "document"` is what keeps session state — camera, selection, the
 * page the user is looking at — out of the stream: those are not edits to
 * anything a consumer could round-trip.
 */
export function subscribeEditEvents(store: TLStore, listener: (batch: EditBatch) => void): () => void {
  return store.listen(
    (entry) => {
      const events = editEventsFromDiff(entry.changes, lookupInto(store));
      if (events.length > 0) listener({ source: entry.source, events });
    },
    { source: "all", scope: "document" },
  );
}
