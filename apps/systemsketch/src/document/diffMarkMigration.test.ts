// src/document/diffMarkMigration.test.ts — P-035's other half, and the one
// with no interactive surface to catch it.
//
// `DiffMarkStyle` is a validator like any other: it rejects `undefined`. So a
// board written before `props.diff` existed does not open unpainted — it
// REFUSES TO OPEN, because a record that does not validate never enters the
// store (`shapes/shared/props.ts`). That is exactly what P-028 shipped when it
// added `props.pins` to `ss-wire` with an empty migration sequence: the
// committed fixture `src/review/__fixtures__/two-blocks.tldr` stopped opening,
// nothing in P-028's own green suite noticed, and an unrelated lane found it a
// wave later (`WireShapeUtil.tsx`'s `/1` step records the measurement).
//
// This file is the standing refusal to repeat that. It opens the SAME real
// file, through the SAME parser `review/boardParam.ts` hands a `?board=` link,
// and it asserts on the value rather than on "did not throw" — a board that
// opened with a wrong mark would be a quieter bug than one that did not open.
import { readFileSync } from "node:fs";

import { createShapeId, createTLStore, getSnapshot, loadSnapshot, parseTldrawJsonFile, type TLShapeId } from "tldraw";
import { describe, expect, it } from "vitest";

import { BINDING_UTILS, SHAPE_UTILS } from "../shapes/registry";
import { DIFF_MARKS, DiffMarkStyle } from "../shapes/shared/diffMark";
import { BLOCK_SHAPE_TYPE, PORT_SHAPE_TYPE, WIRE_SHAPE_TYPE } from "../shapes/types";

function store() {
  return createTLStore({ shapeUtils: SHAPE_UTILS, bindingUtils: BINDING_UTILS });
}

/** Every `ss-*` shape in a store, with the mark it came out carrying. */
function marksIn(s: ReturnType<typeof store>): { type: string; diff: unknown }[] {
  return s
    .allRecords()
    .filter((record) => record.typeName === "shape" && String((record as { type: string }).type).startsWith("ss-"))
    .map((record) => ({ type: (record as { type: string }).type, diff: (record as { props: { diff?: unknown } }).props.diff }));
}

describe("P-035 — a board written before diff marks still opens", () => {
  it("the REAL legacy fixture on disk opens, and every shape in it comes out UNMARKED", () => {
    // The same file, the same parser and the same call as
    // `portDeclarationMigration.test.ts`'s legacy case — it carries
    // `"com.tldraw.shape.ss-block": 0` and `"…ss-wire": 0`, i.e. two blocks
    // and a cable saved before any of this lane's props existed.
    const json = readFileSync(new URL("../review/__fixtures__/two-blocks.tldr", import.meta.url), "utf8");
    const s = store();
    const parsed = parseTldrawJsonFile({ json, schema: s.schema });
    expect(parsed.ok, "the fixture parses — a failing migration shows up HERE, not as bad paint").toBe(true);
    if (!parsed.ok) return;
    loadSnapshot(s, parsed.value.getStoreSnapshot());

    const marks = marksIn(s);
    // The fixture's own census, asserted rather than assumed: if someone
    // re-saves it with different contents, this line says so instead of the
    // test quietly checking nothing.
    expect(marks.map((mark) => mark.type).sort()).toEqual([BLOCK_SHAPE_TYPE, BLOCK_SHAPE_TYPE, WIRE_SHAPE_TYPE].sort());
    for (const mark of marks) {
      expect(mark.diff, `${mark.type} migrated to the unmarked default`).toBe("normal");
    }
  });

  it("a hand-built version-0 `ss-port` migrates too — the kind the fixture does not contain", () => {
    // `two-blocks.tldr` has no `ss-port`, so the one shape kind the real file
    // cannot cover gets the `portDeclarationMigration.test.ts` treatment: a
    // snapshot assembled by hand at sequence 0, which is exactly the set of
    // records the current validators refuse until the migrations have run.
    const portId = createShapeId("legacy-port") as TLShapeId;
    const fresh = store();
    (fresh as unknown as { ensureStoreIsUsable(): void }).ensureStoreIsUsable();
    const snapshot = getSnapshot(fresh).document as unknown as {
      store: Record<string, Record<string, unknown>>;
      schema: { sequences: Record<string, number> };
    };
    const pageId = Object.values(snapshot.store).find((record) => record.typeName === "page")!.id;
    snapshot.store[portId] = {
      id: portId,
      typeName: "shape",
      type: PORT_SHAPE_TYPE,
      x: 0,
      y: 0,
      rotation: 0,
      index: "a1",
      parentId: pageId,
      isLocked: false,
      opacity: 1,
      meta: {},
      // Version 0 of `ss-port`: the pre-ruling-8 `name`/`type` pair AND no
      // `diff`. Both migrations have to run, in order, for this to land.
      props: { w: 120, h: 32, name: "gain_x", type: "float", direction: "in", anchors: [] },
    };
    snapshot.schema.sequences[`com.tldraw.shape.${PORT_SHAPE_TYPE}`] = 0;

    const s = store();
    loadSnapshot(s, snapshot as never);
    const props = s.get(portId)!.props as unknown as { diff: string; declaration: string };
    expect(props.diff).toBe("normal");
    // Ruling 8's migration still ran, and ran FIRST — proof the new step was
    // appended to the sequence rather than replacing it.
    expect(props.declaration).toBe("gain_x: float");
  });

  it("a board that already carries a mark keeps it — a migration fills a gap, it never resets", () => {
    // The `??=` in each `up()` is what makes this true, and it is the
    // difference between this step and `ss-block`'s `/2` and `/3`, which
    // ASSIGN unconditionally. Those two describe a version in which the field
    // could not exist at all; this one runs on boards at every version from 0
    // up, because a v0 board reaches the newest step by replaying all of them.
    const blockId = createShapeId("marked") as TLShapeId;
    const s = store();
    (s as unknown as { ensureStoreIsUsable(): void }).ensureStoreIsUsable();
    const pageId = s.allRecords().find((record) => record.typeName === "page")!.id;
    const util = SHAPE_UTILS.find((u) => u.type === BLOCK_SHAPE_TYPE) as unknown as { new (editor: unknown): { getDefaultProps(): Record<string, unknown> } };
    s.put([
      {
        id: blockId,
        typeName: "shape",
        type: BLOCK_SHAPE_TYPE,
        x: 0,
        y: 0,
        rotation: 0,
        index: "a1",
        parentId: pageId,
        isLocked: false,
        opacity: 1,
        meta: {},
        props: { ...new util(null as never).getDefaultProps(), diff: "added" },
      } as never,
    ]);
    const saved = getSnapshot(s);
    const again = store();
    loadSnapshot(again, saved);
    expect((again.get(blockId)!.props as unknown as { diff: string }).diff).toBe("added");
  });

  it("the style refuses a value outside the enum, which is what makes the migration necessary", () => {
    // Both halves of the claim this whole file rests on, stated against the
    // validator itself rather than inferred: `undefined` is rejected (so a
    // board without the prop cannot open), and so is a plausible-looking
    // wrong word — `"changed"` is the pill's LABEL for `modified`, and the
    // record must never carry it.
    expect(() => DiffMarkStyle.validate(undefined)).toThrow();
    expect(() => DiffMarkStyle.validate("changed")).toThrow();
    for (const mark of DIFF_MARKS) expect(DiffMarkStyle.validate(mark)).toBe(mark);
  });
});
