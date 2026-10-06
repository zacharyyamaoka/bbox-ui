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
//
// AMENDED 2026-10-06 by B-SCHEMA's acceptance author (docs/lanes/
// finish-B-SCHEMA.md), before its builder existed — "documentModel.test pins
// the new defaults exactly" is that barrier's own acceptance line. Schema v2
// adds every new persisted prop of the finish run in ONE migration per kind;
// each `B-SCHEMA` comment below names the item it serves, and
// docs/finish-2026-09-29/schema-inventory.md is the long form (type, default,
// item, owning lane). The `toEqual` on each WHOLE default bag stays the rule
// it always was: a persisted field cannot appear without someone stating its
// default HERE. After B-SCHEMA merges the schema is frozen — a lane that needs
// a prop stops and reports, and the dispatcher adds it here, alone.
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
      // ---- B-SCHEMA (schema v2). Every value paints today's pixels.
      // P-015/P-212: no view has a remembered size until the user leaves it.
      viewSizes: { simple: null, port: null, expanded: null, value: null },
      // P-141: the authored box (today's port/expanded behaviour); `hug` is
      // opt-in, and Fit-to-content is a COMMAND, never automatic (Q-P166).
      sizeMode: "fixed",
      // Cluster 14 P-255: `null` = the skin's own radius.
      cornerRadius: null,
      // P-133 — buildBlockMenu's four toggles. All shown: a block today has a
      // header and its divider; it has no footer yet, and `showFooter: true`
      // means "paint it once the face has one" (Q-P146's footer, and the
      // donor's own default, systemsketch blockModel.ts:619).
      showHeader: true,
      showHeaderDivider: true,
      showFooter: true,
      showFooterDivider: true,
      // P-130: the trunk's own default (portEdge.tsx:1614 `showCard = false`).
      showCard: false,
      // P-177 / cluster 15: `null` = today's face (BLOCK_TITLE_FONT_PX and
      // the inherited family). A number is px; the s/m/l/xl ladder labels it.
      titleSizePx: null,
      titleFont: null,
      // P-107: BlockPort's own default.
      portLayout: "inline",
      // P-134: off, the trunk's own default.
      functionPort: false,
      // P-118 + cluster 8 (P-356 enable/parking, P-269 spacing): every wall
      // live, laid out by the view's own rule, no custom offsets.
      rails: {
        left: { enabled: true, mode: "auto", spacing: null, freeOffsets: {} },
        right: { enabled: true, mode: "auto", spacing: null, freeOffsets: {} },
        top: { enabled: true, mode: "auto", spacing: null, freeOffsets: {} },
        bottom: { enabled: true, mode: "auto", spacing: null, freeOffsets: {} },
      },
      // P-119 + clusters 7/8 for RAIL ports (fill override, hidden, freeze
      // lock, slot origins), keyed by port id. Empty = every port as today.
      portOptions: {},
      // P-188 (+ P-161, P-226): the trunk's own member defaults
      // (block.tsx membersLayout/memberGap/memberGutter, blockMembers.tsx
      // inset/width/insetBackground).
      membersLayout: "free",
      memberInset: "inset",
      memberWidth: "fill",
      memberGap: 12,
      memberGutter: 12,
      insetBackground: "none",
      expandedWeights: {},
      blockType: "",
      // P-074/P-109: no identity until linking mints one; canonical, not a draft.
      definitionId: "",
      draftOrdinal: null,
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
        // ---- B-SCHEMA: every v2 prop, each at a NON-default value, so the
        // round trip proves a value survives and not just that a default does.
        viewSizes: { simple: { w: 180, h: 64 }, port: { w: 240, h: 120 }, expanded: null, value: { w: 168, h: 56 } },
        sizeMode: "hug",
        cornerRadius: 0,
        showHeader: false,
        showHeaderDivider: false,
        showFooter: false,
        showFooterDivider: false,
        showCard: true,
        titleSizePx: 24.5,
        titleFont: "mono",
        portLayout: "offset",
        functionPort: true,
        rails: {
          left: { enabled: true, mode: "custom", spacing: null, freeOffsets: { frame: 12.5, gain: 40 } },
          right: { enabled: true, mode: "auto", spacing: "space-evenly", freeOffsets: {} },
          top: { enabled: false, mode: "auto", spacing: null, freeOffsets: {} },
          bottom: { enabled: true, mode: "auto", spacing: "space-around", freeOffsets: {} },
        },
        portOptions: {
          frame: { fill: "filled", hidden: false, frozen: true, labelOrigin: "top", secondaryOrigin: "bottom" },
          gain: { fill: "empty", hidden: true, frozen: false, labelOrigin: null, secondaryOrigin: "left" },
        },
        membersLayout: "stack",
        memberInset: "edge-to-edge",
        memberWidth: "own",
        memberGap: 8,
        memberGutter: 0,
        insetBackground: "soft-gray",
        expandedWeights: { "g:frame": 0.25, "b:body": 0.75 },
        blockType: "model",
        definitionId: "def-estimate",
        draftOrdinal: 2,
      }),
    ]);
    roundTrip(s);
  });

  it("B-SCHEMA: the block's closed vocabularies take every value they name and refuse what they do not", () => {
    const s = store();
    const good = { ...defaultsOf(BLOCK_SHAPE_TYPE), view: "value" };
    // P-059: `value` is the fourth view. Accepted FIRST, so this case cannot
    // pass by refusing everything.
    s.put([shapeRecord(s, createShapeId("v2-value"), BLOCK_SHAPE_TYPE, good)]);
    expect((s.get(createShapeId("v2-value")) as unknown as { props: { view: string } }).props.view).toBe("value");
    const rail = { enabled: true, mode: "auto", spacing: null, freeOffsets: {} };
    const option = { fill: "auto", hidden: false, frozen: false, labelOrigin: null, secondaryOrigin: null };
    const bad: Record<string, unknown>[] = [
      { sizeMode: "auto" },
      { titleFont: "comic" },
      { titleSizePx: "xl" },
      { portLayout: "stacked" },
      { rails: { left: { ...rail, mode: "free" }, right: rail, top: rail, bottom: rail } },
      { rails: { left: { ...rail, spacing: "space-random" }, right: rail, top: rail, bottom: rail } },
      { rails: { left: rail, right: rail, top: rail } },
      { portOptions: { frame: { ...option, fill: "half" } } },
      { portOptions: { frame: { ...option, labelOrigin: "center" } } },
      { membersLayout: "grid" },
      { memberInset: "flush" },
      { memberWidth: "auto" },
      { insetBackground: "white" },
      { viewSizes: { simple: null, port: null, expanded: null } },
      { draftOrdinal: "1" },
    ];
    for (const [index, change] of bad.entries()) {
      expect(() => s.put([shapeRecord(s, createShapeId(`v2-bad-${index}`), BLOCK_SHAPE_TYPE, { ...good, ...change })]), JSON.stringify(change)).toThrow();
    }
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
    // B-SCHEMA (P-127): line numbers ON and 13px, exactly what CodeFace
    // hard-codes today (`lineNumbers`, CodeEditor's own `fontSizePx = 13`).
    expect(defaultsOf(CODE_SHAPE_TYPE)).toEqual({ w: 320, h: 120, code: "", language: "python", origin: null, lineNumbers: true, fontSizePx: 13 });
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
        // B-SCHEMA (P-127), non-default.
        lineNumbers: false,
        fontSizePx: 15.5,
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
    // B-SCHEMA: cluster 7 (P-399 fill derived unless overridden, P-408
    // hidden), P-119 (slot origins: `null` = the direction's own layout), and
    // P-201/P-208 (both slots are REAL member slots: the label slot holds the
    // declaration as painted today, the secondary slot the producers badge
    // P-250 paints). "Frozen" on a free port is tldraw's own `isLocked`; a
    // prop beside it would be two answers to one question.
    expect(defaultsOf(PORT_SHAPE_TYPE)).toEqual({
      w: 120,
      h: 32,
      declaration: "port",
      direction: "out",
      diff: "normal",
      anchors: [],
      fill: "auto",
      hidden: false,
      labelOrigin: null,
      secondaryOrigin: null,
      slots: { label: [{ kind: "builtin", id: "label" }], secondary: [{ kind: "builtin", id: "producers" }] },
    });
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
        // B-SCHEMA, non-default, including a DELETED default member (the
        // producers badge is gone from `secondary`) and a slot holding three
        // child shapes instead of its label (P-201/P-208: "it could be three
        // input boxes"). A deletion that did not survive this round trip would
        // be the bug P-201 names.
        fill: "filled",
        hidden: true,
        labelOrigin: "top",
        secondaryOrigin: "right",
        slots: {
          label: [
            { kind: "shape", id: "shape:input-a" },
            { kind: "shape", id: "shape:input-b" },
            { kind: "shape", id: "shape:input-c" },
          ],
          secondary: [],
        },
      }),
    ]);
    roundTrip(s);
  });

  it("B-SCHEMA: the port's closed vocabularies take what they name and refuse what they do not", () => {
    const s = store();
    const good = { ...defaultsOf(PORT_SHAPE_TYPE), fill: "empty", labelOrigin: "bottom" };
    s.put([shapeRecord(s, createShapeId("p-v2"), PORT_SHAPE_TYPE, good)]);
    const bad: Record<string, unknown>[] = [
      { fill: "half" },
      { hidden: "no" },
      { labelOrigin: "center" },
      { secondaryOrigin: "left-offset" },
      { slots: { label: [{ kind: "widget", id: "x" }], secondary: [] } },
      { slots: { label: [] } },
    ];
    for (const [index, change] of bad.entries()) {
      expect(() => s.put([shapeRecord(s, createShapeId(`p-v2-bad-${index}`), PORT_SHAPE_TYPE, { ...good, ...change })]), JSON.stringify(change)).toThrow();
    }
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
    // B-SCHEMA: P-156/P-171 (`label` "" = no badge; `labelFraction` 0.5 =
    // the trunk's LABEL_POSITION_DEFAULT, which the delayed z⁻¹ pill of P-137
    // rides too), P-096 (both ends `none`: 4b49cd4 made data traces
    // arrow-less), P-121/P-187 (`animated` off), cluster 11 P-364
    // (`strokeWidth` null = the variant's own weight), P-137/P-187
    // (`delayValue` "" = a bare z⁻¹), P-081 (`bend` null = no control point on
    // a straight/curved cable). A cable is born plain, the same rule as
    // `pins: []`.
    expect(defaultsOf(WIRE_SHAPE_TYPE)).toEqual({
      diff: "normal",
      variant: "data",
      routing: "elbow",
      color: "",
      start: { x: 0, y: 0 },
      end: { x: 120, y: 0 },
      pins: [],
      tunnel: false,
      layer: "",
      label: "",
      labelFraction: 0.5,
      startMarker: "none",
      endMarker: "none",
      animated: false,
      strokeWidth: null,
      delayValue: "",
      bend: null,
    });
  });

  it("B-SCHEMA: a fully-populated v2 cable validates and round-trips, and its closed vocabularies refuse what they do not name", () => {
    const s = store();
    s.put([
      shapeRecord(s, createShapeId("w-v2"), WIRE_SHAPE_TYPE, {
        diff: "modified",
        variant: "delayed",
        routing: "curved",
        color: "#e11d48",
        start: { x: 0, y: 0 },
        end: { x: 200, y: 40 },
        pins: [],
        tunnel: false,
        layer: "",
        label: "frames · 30 Hz",
        labelFraction: 0.375,
        startMarker: "arrow",
        endMarker: "arrow",
        animated: true,
        strokeWidth: 3.5,
        delayValue: "1.0",
        bend: { dx: 12.5, dy: -40 },
      }),
    ]);
    roundTrip(s);
    const good = { ...defaultsOf(WIRE_SHAPE_TYPE) };
    const bad: Record<string, unknown>[] = [
      { startMarker: "diamond" },
      { endMarker: "dot" },
      { animated: "yes" },
      { strokeWidth: "thick" },
      { bend: { x: 1, y: 2 } },
      { labelFraction: "middle" },
    ];
    for (const [index, change] of bad.entries()) {
      expect(() => s.put([shapeRecord(s, createShapeId(`w-v2-bad-${index}`), WIRE_SHAPE_TYPE, { ...good, ...change })]), JSON.stringify(change)).toThrow();
    }
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
    // B-SCHEMA (P-183): the blackbox toggle's state. `expanded` is the frame
    // RegionFace draws today, unconditionally (RegionFace.tsx `view="expanded"`).
    expect(defaultsOf(REGION_SHAPE_TYPE)).toEqual({ w: 480, h: 320, kind: "plain", name: "", cornerBlockId: "", arms: [], view: "expanded" });
  });

  it("a for-region with its corner block as a CHILD validates and round-trips (everything is a block)", () => {
    const s = store();
    const region = createShapeId("r");
    const corner = createShapeId("corner");
    s.put([
      shapeRecord(s, region, REGION_SHAPE_TYPE, { w: 480, h: 320, kind: "for", name: "For Loop", cornerBlockId: corner, arms: [], view: "opaque" }),
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
        view: "expanded",
      }),
    ]);
    expect(() => s.put([shapeRecord(s, createShapeId("bad"), REGION_SHAPE_TYPE, { ...defaultsOf(REGION_SHAPE_TYPE), kind: "switch" })])).toThrow();
    // B-SCHEMA (P-183): two views, closed.
    expect(() => s.put([shapeRecord(s, createShapeId("bad-view"), REGION_SHAPE_TYPE, { ...defaultsOf(REGION_SHAPE_TYPE), view: "collapsed" })])).toThrow();
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
