// src/document/documentModel.test.ts — the document-model CONTRACT
// (docs/SYSTEMSKETCH-REBUILD-PLAN.md §3), executable. Committed with the
// plan, off-limits to builders. Streams 3 and 4 aim at exactly these records.
//
// Runs in plain node: `createTLStore` + the registry's utils validate every
// record through the same `T.*` validators the running app persists with,
// and `getSnapshot`/`loadSnapshot` prove a saved board round-trips
// byte-stable — which IS "usable with no backend".
//
// Each `describe` names the lane that turns it green (L0 block, L1 code,
// L2 port, L3 wire, L5 region). A lane may not edit this file; if a contract
// line here is wrong the lane reports it and the dispatcher decides.
import { createShapeId, createTLStore, getSnapshot, loadSnapshot, createBindingId, type TLShape, type TLShapeId } from "tldraw";
import { describe, expect, it } from "vitest";

import { BINDING_UTILS, SHAPE_UTILS } from "../shapes/registry";
import { BLOCK_SHAPE_TYPE, CODE_SHAPE_TYPE, FLOATING_PORT_ID, PORT_SHAPE_TYPE, REGION_SHAPE_TYPE, WIRE_BINDING_TYPE, WIRE_SHAPE_TYPE } from "../shapes/types";

function store() {
  return createTLStore({ shapeUtils: SHAPE_UTILS, bindingUtils: BINDING_UTILS });
}

/** The records a store needs before a shape can live on a page. */
function seedPage(s: ReturnType<typeof store>): { pageId: string } {
  // `ensureStoreIsUsable` exists at runtime but is `@internal` in tldraw's public
  // types; the cast keeps this harness on the same seed path the Editor uses.
  (s as unknown as { ensureStoreIsUsable(): void }).ensureStoreIsUsable();
  const pageId = s.allRecords().find((r) => r.typeName === "page")!.id;
  return { pageId };
}

function shapeRecord(s: ReturnType<typeof store>, id: TLShapeId, type: string, props: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const util = SHAPE_UTILS.find((u) => u.type === type);
  if (!util) throw new Error(`no ShapeUtil registered for ${type}`);
  const { pageId } = seedPage(s);
  return {
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
    props,
    ...extra,
  } as unknown as TLShape;
}

function defaultsOf(type: string): Record<string, unknown> {
  const util = SHAPE_UTILS.find((u) => u.type === type) as unknown as { new (editor: unknown): { getDefaultProps(): Record<string, unknown> } } | undefined;
  if (!util) throw new Error(`no ShapeUtil registered for ${type}`);
  // getDefaultProps never touches the editor in any util this plan specifies.
  return new util(null as never).getDefaultProps();
}

function roundTrip(s: ReturnType<typeof store>) {
  const snapshot = getSnapshot(s);
  const again = store();
  loadSnapshot(again, snapshot);
  expect(getSnapshot(again).document).toEqual(snapshot.document);
}

describe("registry", () => {
  // AMENDED 2026-09-24 by the dispatcher, on a lane's report rather than by
  // the lane itself, and the amendment SHARPENS the claim.
  //
  // `SHAPE_UTILS` gained four entries — tldraw's own `geo`/`draw`/`line`/
  // `arrow`, re-registered so the canvas reads `src/appearance`'s stroke-width
  // and edge-colour metadata. The old line counted the array, so it went red.
  //
  // What it was written to protect is not the COUNT: it is that this app
  // invents exactly five shape kinds and can persist no others. That property
  // is intact, because a util whose `type` matches a default REPLACES it
  // rather than joining it. Measured by exercising the helper `<Tldraw>` uses
  // (`Tldraw.mjs:108` -> `@tldraw/utils` `mergeArraysAndReplaceDefaults`)
  // against a three-default fixture: one `geo` entry survives, ours, and only
  // a genuinely new type lengthens the array.
  //
  // So the assertion now names both halves separately — ours must be exactly
  // the five, and everything else must be a type tldraw already ships. That is
  // strictly stronger than the count, which would have admitted a sixth kind
  // of our own as long as something else was removed.
  const STOCK_REPAINTED = ["arrow", "draw", "geo", "line"];

  it("publishes exactly the plan's shape and binding types, and re-registers only tldraw's own", () => {
    const shapeTypes = SHAPE_UTILS.map((u) => u.type).sort();
    const ours = shapeTypes.filter((type) => type.startsWith("ss-"));
    expect(ours).toEqual([BLOCK_SHAPE_TYPE, CODE_SHAPE_TYPE, PORT_SHAPE_TYPE, REGION_SHAPE_TYPE, WIRE_SHAPE_TYPE].sort());
    expect(shapeTypes.filter((type) => !type.startsWith("ss-")).sort()).toEqual(STOCK_REPAINTED);
    expect(BINDING_UTILS.map((u) => u.type)).toEqual([WIRE_BINDING_TYPE]);
  });

  it("registers each type once, so no re-registration can shadow another", () => {
    const types = SHAPE_UTILS.map((u) => u.type);
    expect(new Set(types).size, `duplicate shape util type in ${types.join(", ")}`).toBe(types.length);
  });
});

describe("ss-block (L0)", () => {
  it("defaults match the contract", () => {
    expect(defaultsOf(BLOCK_SHAPE_TYPE)).toEqual({
      w: 160,
      h: 100,
      name: "block",
      view: "port",
      // RULING 9: the description ships empty and its eye ships ON — the
      // frozen v1 field's own `defaultValue: true`
      // (packages/bbox-ui/src/block.fields.ts:120-124).
      description: "",
      showDescription: true,
      // P-036/P-043: a block ships with no icon. `""` is the "never chosen"
      // state (`decodeGlyphContent` -> `{kind:"none"}`), not a placeholder.
      glyph: "",
      // P-035: a block ships UNMARKED. `"normal"` is the value that means "not
      // part of any comparison", and it is also `DiffMarkStyle.defaultValue`,
      // which is what makes an unarmed board paint exactly as it did before
      // the prop existed.
      diff: "normal",
      ports: { left: [], right: [], top: [], bottom: [] },
      anchors: [],
    });
  });

  it("validates a fully-populated block and round-trips it", () => {
    const s = store();
    s.put([
      shapeRecord(s, createShapeId("b1"), BLOCK_SHAPE_TYPE, {
        w: 240,
        h: 120,
        name: "estimate()",
        view: "port",
        // RULING 9's pair — "fully-populated" means every prop the contract
        // has, so the description and its eye are enumerated here like the
        // rest. The double space is deliberate: the round trip must not trim.
        description: "Estimates  pose from a frame.",
        showDescription: false,
        // P-036/P-043 — "fully-populated" means every prop the contract has,
        // so the icon is enumerated here too. A `lucide:` name specifically,
        // because that is the kind whose ROUND TRIP could plausibly break:
        // an emoji or a `data:` URL is inert text, while a lucide name is the
        // one the picker mints and the resolver has to find again by the exact
        // kebab it stored.
        glyph: "lucide:rocket",
        // P-035 — "fully-populated" means every prop the contract has, so the
        // diff mark is enumerated here too, and `modified` specifically: it is
        // the value whose SPELLING could drift, because the pill shows it as
        // "Changed" (`DIFF_MARK_LABELS`) while the record must keep the
        // trunk's `DIFF_OPERATIONS` word.
        diff: "modified",
        ports: {
          left: [
            { id: "frame", declaration: "frame: Frame" },
            { id: "gain", declaration: "gain: Float" },
          ],
          right: [{ id: "pose", declaration: "Pose: Pose" }],
          top: [],
          bottom: [],
        },
        anchors: [
          { portId: "frame", x: 0, y: 40, side: "left" },
          { portId: "pose", x: 240, y: 40, side: "right" },
          { portId: "gain", x: 0, y: 64, side: null },
        ],
      }),
    ]);
    roundTrip(s);
  });

  it("rejects a port without the {id,name,type} triple and a view outside the enum", () => {
    const s = store();
    expect(() => s.put([shapeRecord(s, createShapeId("bad1"), BLOCK_SHAPE_TYPE, { ...defaultsOf(BLOCK_SHAPE_TYPE), ports: { left: ["in"], right: [], top: [], bottom: [] } })])).toThrow();
    expect(() => s.put([shapeRecord(s, createShapeId("bad2"), BLOCK_SHAPE_TYPE, { ...defaultsOf(BLOCK_SHAPE_TYPE), view: "collapsed" })])).toThrow();
  });

  it("an expanded block is frame-like; a port-view block is not", () => {
    const Util = SHAPE_UTILS.find((u) => u.type === BLOCK_SHAPE_TYPE) as unknown as { new (editor: unknown): { isFrameLike(shape: unknown): boolean } };
    const util = new Util(null as never);
    const base = shapeRecord(store(), createShapeId("f"), BLOCK_SHAPE_TYPE, defaultsOf(BLOCK_SHAPE_TYPE));
    expect(util.isFrameLike({ ...base, props: { ...base.props, view: "expanded" } })).toBe(true);
    expect(util.isFrameLike({ ...base, props: { ...base.props, view: "port" } })).toBe(false);
    expect(util.isFrameLike({ ...base, props: { ...base.props, view: "simple" } })).toBe(false);
  });
});

describe("ss-code (L1)", () => {
  it("defaults match the contract, origin reserved as null (docs/SOURCE-CODE-VIEW-PLAN.md §3.1)", () => {
    expect(defaultsOf(CODE_SHAPE_TYPE)).toEqual({ w: 320, h: 120, code: "", language: "python", origin: null });
  });

  it("validates code with an origin and round-trips it", () => {
    const s = store();
    s.put([
      shapeRecord(s, createShapeId("c1"), CODE_SHAPE_TYPE, {
        w: 320,
        h: 120,
        code: "gain = clamp(x * k, 0, 1)\n",
        language: "python",
        origin: { uri: "stereo.py", anchor: "Pipeline.run", contentHash: "sha256:" + "0".repeat(64) },
      }),
    ]);
    roundTrip(s);
  });

  it("rejects an unknown language", () => {
    const s = store();
    expect(() => s.put([shapeRecord(s, createShapeId("c2"), CODE_SHAPE_TYPE, { ...defaultsOf(CODE_SHAPE_TYPE), language: "rust" })])).toThrow();
  });
});

describe("ss-port (L2)", () => {
  it("defaults match the contract", () => {
    // ONE stored string, not a name beside a type (ruling 8).
    // P-035 adds `diff` — a port is born unmarked, like a block and a cable.
    expect(defaultsOf(PORT_SHAPE_TYPE)).toEqual({ w: 120, h: 32, declaration: "port", direction: "out", diff: "normal", anchors: [] });
  });

  it("validates a measured floating port whose one anchor is FLOATING_PORT_ID", () => {
    const s = store();
    s.put([
      shapeRecord(s, createShapeId("p1"), PORT_SHAPE_TYPE, {
        w: 120,
        h: 32,
        declaration: "gain: float",
        direction: "in",
        // P-035 — every prop the contract has, and `added` here rather than
        // `normal` so the round trip below proves a MARK survives a save, not
        // just that the default does.
        diff: "added",
        anchors: [{ portId: FLOATING_PORT_ID, x: 6, y: 16, side: null }],
      }),
    ]);
    roundTrip(s);
  });
});

describe("ss-wire + ss-wire-binding (L3)", () => {
  it("defaults: data, elbow (Zach's datum), loose ends", () => {
    // P-028: `pins: []` is the AUTOMATIC route. A cable is never born
    // authored — `pins.length > 0` is the whole of the auto/authored mode,
    // so a non-empty default would mean "every new wire is hand-routed".
    // P-023: `tunnel: false`, `layer: ""` for the same reason — tunnelling is
    // something the user does to a cable, never a state it is born in, and a
    // cable is born on no layer.
    //
    // `toEqual` on the WHOLE bag is deliberate and stays that way: it is what
    // makes adding a prop to this shape an EDIT TO THIS LINE, so a new
    // persisted field cannot be introduced without someone stating its
    // default here.
    // P-035 adds `diff`, on the same rule as `pins`/`tunnel`/`layer` above: a
    // cable is born unmarked.
    expect(defaultsOf(WIRE_SHAPE_TYPE)).toEqual({ diff: "normal", variant: "data", routing: "elbow", color: "", start: { x: 0, y: 0 }, end: { x: 120, y: 0 }, pins: [], tunnel: false, layer: "" });
  });

  it("a wire bound at both ends to two blocks validates and round-trips with its bindings", () => {
    const s = store();
    const a = createShapeId("a");
    const b = createShapeId("b");
    const w = createShapeId("w");
    const block = (id: TLShapeId, name: string) =>
      shapeRecord(s, id, BLOCK_SHAPE_TYPE, {
        ...defaultsOf(BLOCK_SHAPE_TYPE),
        name,
        ports: { left: [{ id: "in", declaration: "in" }], right: [{ id: "out", declaration: "out" }], top: [], bottom: [] },
      });
    s.put([
      block(a, "a"),
      block(b, "b"),
      // P-028: an AUTHORED cable specifically, not the default one — a pin is
      // the prop whose round trip could plausibly break (a nested record
      // inside an array, judged by `ElbowPinV`), and `t`/`offset` are floats
      // that a lossy serializer would round.
      shapeRecord(s, w, WIRE_SHAPE_TYPE, { ...defaultsOf(WIRE_SHAPE_TYPE), pins: [{ index: 1, axis: "y" as const, t: 0.625, offset: -3.5 }] }),
      { id: createBindingId("wa"), typeName: "binding" as const, type: WIRE_BINDING_TYPE, fromId: w, toId: a, meta: {}, props: { terminal: "start", portId: "out" } },
      { id: createBindingId("wb"), typeName: "binding" as const, type: WIRE_BINDING_TYPE, fromId: w, toId: b, meta: {}, props: { terminal: "end", portId: "in" } },
    ]);
    roundTrip(s);
  });

  it("there is no control variant — data lines only", () => {
    const s = store();
    expect(() => s.put([shapeRecord(s, createShapeId("w2"), WIRE_SHAPE_TYPE, { ...defaultsOf(WIRE_SHAPE_TYPE), variant: "control" })])).toThrow();
  });

  it("a pin must name an axis the router knows (P-028)", () => {
    const s = store();
    expect(() => s.put([shapeRecord(s, createShapeId("w3"), WIRE_SHAPE_TYPE, { ...defaultsOf(WIRE_SHAPE_TYPE), pins: [{ index: 1, axis: "z", t: 0.5, offset: 0 }] })])).toThrow();
    expect(() => s.put([shapeRecord(s, createShapeId("w4"), WIRE_SHAPE_TYPE, { ...defaultsOf(WIRE_SHAPE_TYPE), pins: [{ index: 1, axis: "x", t: 0.5 }] })])).toThrow();
  });

  it("the wire binding refuses a region as a target and a code shape as a target (never mix data and control lines; code speaks no ports)", () => {
    const utilFor = (type: string) =>
      new (SHAPE_UTILS.find((u) => u.type === type) as unknown as { new (editor: unknown): { canBind(opts: { fromShapeType: string; toShapeType: string; bindingType: string }): boolean } })(null as never);
    const ask = (toShapeType: string) => utilFor(toShapeType).canBind({ fromShapeType: WIRE_SHAPE_TYPE, toShapeType, bindingType: WIRE_BINDING_TYPE });
    expect(ask(BLOCK_SHAPE_TYPE)).toBe(true);
    expect(ask(PORT_SHAPE_TYPE)).toBe(true);
    expect(ask(REGION_SHAPE_TYPE)).toBe(false);
    expect(ask(CODE_SHAPE_TYPE)).toBe(false);
  });
});

describe("ss-region (L5)", () => {
  it("defaults match the contract", () => {
    expect(defaultsOf(REGION_SHAPE_TYPE)).toEqual({ w: 480, h: 320, kind: "plain", name: "", cornerBlockId: "", arms: [] });
  });

  it("a for-region with its corner block as a CHILD validates and round-trips (everything is a block)", () => {
    const s = store();
    const region = createShapeId("r");
    const corner = createShapeId("corner");
    s.put([
      shapeRecord(s, region, REGION_SHAPE_TYPE, { w: 480, h: 320, kind: "for", name: "For Loop", cornerBlockId: corner, arms: [] }),
      shapeRecord(
        s,
        corner,
        BLOCK_SHAPE_TYPE,
        {
          ...defaultsOf(BLOCK_SHAPE_TYPE),
          name: "For Loop",
          ports: { left: [{ id: "iterable", declaration: "Iterable: Iterable" }], right: [{ id: "iter", declaration: "iter" }], top: [], bottom: [] },
        },
        { parentId: region },
      ),
    ]);
    roundTrip(s);
  });

  it("a branch carries arms; kind is closed", () => {
    const s = store();
    s.put([
      shapeRecord(s, createShapeId("br"), REGION_SHAPE_TYPE, {
        w: 480,
        h: 400,
        kind: "branch",
        name: "Branch",
        cornerBlockId: "",
        arms: [
          { id: "if", title: "if", open: true, h: 180 },
          { id: "else", title: "else", open: true, h: 180 },
        ],
      }),
    ]);
    expect(() => s.put([shapeRecord(s, createShapeId("bad"), REGION_SHAPE_TYPE, { ...defaultsOf(REGION_SHAPE_TYPE), kind: "switch" })])).toThrow();
  });

  it("a region is frame-like and is never a wire target", () => {
    const Util = SHAPE_UTILS.find((u) => u.type === REGION_SHAPE_TYPE) as unknown as {
      new (editor: unknown): { isFrameLike(shape: unknown): boolean; canBind(opts: { fromShapeType: string; toShapeType: string; bindingType: string }): boolean };
    };
    const util = new Util(null as never);
    const base = shapeRecord(store(), createShapeId("r2"), REGION_SHAPE_TYPE, defaultsOf(REGION_SHAPE_TYPE));
    expect(util.isFrameLike(base)).toBe(true);
    expect(util.canBind({ fromShapeType: WIRE_SHAPE_TYPE, toShapeType: REGION_SHAPE_TYPE, bindingType: WIRE_BINDING_TYPE })).toBe(false);
  });
});
