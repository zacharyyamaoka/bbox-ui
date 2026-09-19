// src/document/editEvents.test.ts — the UI-edit-event seam
// (docs/SYSTEMSKETCH-REBUILD-PLAN.md §3.2), executable. Committed with the
// plan, off-limits to builders; L3 turns it green. Stream 3 (pyblocks) will
// subscribe to exactly this.
//
// Plain node: `createTLStore` is the same store the editor mounts, and
// `store.listen` fires the same `HistoryEntry` the app's subscription reads
// — so what this proves in node is what the app emits in the browser.
import { createBindingId, createShapeId, createTLStore, type TLShape, type TLShapeId } from "tldraw";
import { describe, expect, it } from "vitest";

import { editEventsFromDiff, subscribeEditEvents, type EditBatch, type EditEvent } from "./editEvents";
import { BINDING_UTILS, SHAPE_UTILS } from "../shapes/registry";
import { BLOCK_SHAPE_TYPE, CODE_SHAPE_TYPE, WIRE_BINDING_TYPE, WIRE_SHAPE_TYPE } from "../shapes/types";

function makeStore() {
  const store = createTLStore({ shapeUtils: SHAPE_UTILS, bindingUtils: BINDING_UTILS });
  (store as unknown as { ensureStoreIsUsable(): void }).ensureStoreIsUsable(); // @internal in the public types, present at runtime
  const pageId = store.allRecords().find((r) => r.typeName === "page")!.id;
  const batches: EditBatch[] = [];
  const stop = subscribeEditEvents(store, (batch) => batches.push(batch));
  const defaults = (type: string) =>
    new (SHAPE_UTILS.find((u) => u.type === type) as unknown as { new (e: unknown): { getDefaultProps(): Record<string, unknown> } })(null as never).getDefaultProps();
  const shape = (id: TLShapeId, type: string, props: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
    id,
    typeName: "shape" as const,
    type,
    x: 0,
    y: 0,
    rotation: 0,
    index: "a1" as const,
    parentId: pageId as never,
    isLocked: false,
    opacity: 1,
    meta: {},
    props: { ...defaults(type), ...props },
    ...extra,
  }) as unknown as TLShape;
  const events = () => batches.flatMap((b) => b.events);
  const last = () => batches[batches.length - 1];
  return { store, pageId, batches, stop, shape, events, last };
}

describe("subscribeEditEvents — one batch per store transaction", () => {
  it("a created block is node.added with its props; source is 'user'", () => {
    const t = makeStore();
    const id = createShapeId("b");
    t.store.put([t.shape(id, BLOCK_SHAPE_TYPE, { name: "decode()" })]);
    expect(t.batches).toHaveLength(1);
    expect(t.last().source).toBe("user");
    const [ev] = t.last().events;
    expect(ev.kind).toBe("node.added");
    if (ev.kind !== "node.added") throw new Error("narrowing");
    expect(ev.nodeId).toBe(id);
    expect(ev.type).toBe(BLOCK_SHAPE_TYPE);
    expect(ev.parentId).toBeNull();
    expect(ev.props.name).toBe("decode()");
  });

  it("moving is node.moved; changing w/h is node.resized; anchors alone emit NOTHING (measurement is not an edit)", () => {
    const t = makeStore();
    const id = createShapeId("b");
    t.store.put([t.shape(id, BLOCK_SHAPE_TYPE)]);
    const before = t.batches.length;

    t.store.update(id, (r) => ({ ...r, x: 40, y: 12 }));
    expect(t.last().events).toEqual([{ kind: "node.moved", nodeId: id, x: 40, y: 12, parentId: null }]);

    t.store.update(id, (r) => ({ ...r, props: { ...(r as { props: object }).props, w: 300, h: 140 } } as typeof r));
    expect(t.last().events).toEqual([{ kind: "node.resized", nodeId: id, w: 300, h: 140 }]);

    const batchesBeforeAnchors = t.batches.length;
    t.store.update(id, (r) => ({ ...r, props: { ...(r as { props: object }).props, anchors: [{ portId: "in", x: 0, y: 20, side: "left" }] } } as typeof r));
    // The store listener fires (a transaction happened), but it translates to no semantic event.
    expect(t.batches.length).toBeGreaterThanOrEqual(batchesBeforeAnchors);
    expect(t.events().filter((e) => e.kind !== "node.added" && e.kind !== "node.moved" && e.kind !== "node.resized")).toEqual([]);
    expect(t.batches.length).toBeGreaterThan(before);
  });

  it("a props edit is node.changed with the changed field names and before/after values, never listing w/h/anchors", () => {
    const t = makeStore();
    const id = createShapeId("c");
    t.store.put([t.shape(id, CODE_SHAPE_TYPE, { code: "x = 1" })]);
    t.store.update(id, (r) => ({ ...r, props: { ...(r as { props: object }).props, code: "x = 2", w: 400 } } as typeof r));
    const ev = t.last().events.find((e) => e.kind === "node.changed");
    expect(ev).toBeDefined();
    if (!ev || ev.kind !== "node.changed") throw new Error("narrowing");
    expect(ev.nodeId).toBe(id);
    expect(ev.type).toBe(CODE_SHAPE_TYPE);
    expect(ev.fields).toEqual(["code"]);
    expect(ev.before.code).toBe("x = 1");
    expect(ev.after.code).toBe("x = 2");
    // w changed in the same transaction → a separate node.resized in the same batch.
    expect(t.last().events.some((e) => e.kind === "node.resized")).toBe(true);
  });

  it("a wire created WITH its two bindings in one transaction is ONE wire.added with both ends resolved", () => {
    const t = makeStore();
    const a = createShapeId("a");
    const b = createShapeId("b");
    const w = createShapeId("w");
    const ports = { left: [{ id: "in", name: "in", type: "" }], right: [{ id: "out", name: "out", type: "" }], top: [], bottom: [] };
    t.store.put([t.shape(a, BLOCK_SHAPE_TYPE, { ports }), t.shape(b, BLOCK_SHAPE_TYPE, { ports })]);
    t.store.put([
      t.shape(w, WIRE_SHAPE_TYPE),
      { id: createBindingId("wa"), typeName: "binding" as const, type: WIRE_BINDING_TYPE, fromId: w, toId: a, meta: {}, props: { terminal: "start", portId: "out" } },
      { id: createBindingId("wb"), typeName: "binding" as const, type: WIRE_BINDING_TYPE, fromId: w, toId: b, meta: {}, props: { terminal: "end", portId: "in" } },
    ]);
    const wireEvents = t.last().events.filter((e) => e.kind.startsWith("wire."));
    expect(wireEvents).toEqual([{ kind: "wire.added", wireId: w, from: { nodeId: a, portId: "out" }, to: { nodeId: b, portId: "in" }, variant: "data" }]);
  });

  it("re-pointing a binding is wire.rebound; deleting the wire is wire.removed; a block deletion is node.removed", () => {
    const t = makeStore();
    const a = createShapeId("a");
    const b = createShapeId("b");
    const c = createShapeId("c");
    const w = createShapeId("w");
    const ports = { left: [{ id: "in", name: "in", type: "" }], right: [{ id: "out", name: "out", type: "" }], top: [], bottom: [] };
    t.store.put([t.shape(a, BLOCK_SHAPE_TYPE, { ports }), t.shape(b, BLOCK_SHAPE_TYPE, { ports }), t.shape(c, BLOCK_SHAPE_TYPE, { ports })]);
    const wb = createBindingId("wb");
    t.store.put([
      t.shape(w, WIRE_SHAPE_TYPE),
      { id: createBindingId("wa"), typeName: "binding" as const, type: WIRE_BINDING_TYPE, fromId: w, toId: a, meta: {}, props: { terminal: "start", portId: "out" } },
      { id: wb, typeName: "binding" as const, type: WIRE_BINDING_TYPE, fromId: w, toId: b, meta: {}, props: { terminal: "end", portId: "in" } },
    ]);
    t.store.update(wb, (r) => ({ ...r, toId: c }));
    expect(t.last().events).toEqual([{ kind: "wire.rebound", wireId: w, from: { nodeId: a, portId: "out" }, to: { nodeId: c, portId: "in" } }]);

    t.store.remove([w]);
    expect(t.last().events.filter((e) => e.kind.startsWith("wire."))).toEqual([{ kind: "wire.removed", wireId: w }]);

    t.store.remove([a]);
    expect(t.last().events).toEqual([{ kind: "node.removed", nodeId: a, type: BLOCK_SHAPE_TYPE }]);
  });

  it("re-parenting into a shape reports the parent; unsubscribe stops delivery", () => {
    const t = makeStore();
    const region = createShapeId("r");
    const kid = createShapeId("k");
    t.store.put([t.shape(region, BLOCK_SHAPE_TYPE, { view: "expanded" }), t.shape(kid, BLOCK_SHAPE_TYPE)]);
    t.store.update(kid, (r) => ({ ...r, parentId: region as never, x: 10, y: 10 }));
    expect(t.last().events).toEqual([{ kind: "node.moved", nodeId: kid, x: 10, y: 10, parentId: region }]);
    const count = t.batches.length;
    t.stop();
    t.store.update(kid, (r) => ({ ...r, x: 99 }));
    expect(t.batches.length).toBe(count);
  });

  it("editEventsFromDiff is pure: a hand-built diff of an added shape yields node.added", () => {
    const t = makeStore();
    const id = createShapeId("pure");
    const record = t.shape(id, BLOCK_SHAPE_TYPE, { name: "pure" });
    const events: EditEvent[] = editEventsFromDiff({ added: { [id]: record } as never, updated: {} as never, removed: {} as never }, () => record as never);
    expect(events.map((e) => e.kind)).toEqual(["node.added"]);
  });
});
