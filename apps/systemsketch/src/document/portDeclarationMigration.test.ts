// src/document/portDeclarationMigration.test.ts — ruling 8's OTHER half.
//
// Collapsing `{name, type}` into one `declaration` changes what a saved
// `.tldr` means, and every board already on disk was written against the old
// shape. The migration is therefore the load-bearing part of the change and
// the only part with no interactive surface to catch it: a board that fails to
// migrate does not paint wrong, it refuses to open at all (a record that does
// not validate never enters the store — `shapes/shared/props.ts`).
//
// So this drives the real thing: a snapshot serialized as version 0 of both
// props sequences, through the app's own registry, and out the other side.
// Runs in plain node, the same harness idiom as `documentModel.test.ts`.
import { readFileSync } from "node:fs";

import { createShapeId, createTLStore, getSnapshot, loadSnapshot, parseTldrawJsonFile, type TLShapeId } from "tldraw";
import { describe, expect, it } from "vitest";

import { portTypeOfDeclaration } from "@trunk/scene/portDeclaration";

import { BINDING_UTILS, SHAPE_UTILS } from "../shapes/registry";
import { BLOCK_SHAPE_TYPE, PORT_SHAPE_TYPE } from "../shapes/types";

function store() {
  return createTLStore({ shapeUtils: SHAPE_UTILS, bindingUtils: BINDING_UTILS });
}

/**
 * A board saved BEFORE the collapse: `ss-port` with `name`/`type`, `ss-block`
 * with `{id, name, type}` port specs, and a schema that records version 0 for
 * both props sequences.
 *
 * WHY it is assembled by hand rather than by putting the old records into a
 * store first: the current validators would reject them, which is the whole
 * point — an old board is exactly a set of records this schema cannot accept
 * until the migration has run on them.
 */
function legacySnapshot(portId: TLShapeId, blockId: TLShapeId) {
  const fresh = store();
  (fresh as unknown as { ensureStoreIsUsable(): void }).ensureStoreIsUsable();
  const snapshot = getSnapshot(fresh).document as unknown as {
    store: Record<string, Record<string, unknown>>;
    schema: { schemaVersion: number; sequences: Record<string, number> };
  };
  const pageId = Object.values(snapshot.store).find((r) => r.typeName === "page")!.id;
  const base = { typeName: "shape", x: 0, y: 0, rotation: 0, index: "a1", parentId: pageId, isLocked: false, opacity: 1, meta: {} };

  snapshot.store[portId] = {
    ...base,
    id: portId,
    type: PORT_SHAPE_TYPE,
    // The exact pair `port.smoke.test.tsx` has asserted since L2 — trailing
    // spaces in the name included, so the fold is proved not to trim.
    props: { w: 120, h: 32, name: "gain_x  ", type: "float", direction: "in", anchors: [] },
  };
  snapshot.store[blockId] = {
    ...base,
    id: blockId,
    index: "a2",
    type: BLOCK_SHAPE_TYPE,
    props: {
      w: 160,
      h: 100,
      name: "estimate()",
      view: "port",
      ports: {
        left: [{ id: "frame", name: "frame", type: "Frame" }],
        // An empty type is the old model's "no type stated": it must become a
        // BARE name, never a dangling `pose: `.
        right: [{ id: "pose", name: "Pose", type: "" }],
        top: [],
        bottom: [],
      },
      anchors: [],
    },
  };

  // Version 0 of both sequences — what a board written before this lane
  // carries. `retroactive: true` (tldraw's own default for a props sequence,
  // recordsWithProps.ts:30-36) is what makes the `/1` migration run on it.
  snapshot.schema.sequences[`com.tldraw.shape.${PORT_SHAPE_TYPE}`] = 0;
  snapshot.schema.sequences[`com.tldraw.shape.${BLOCK_SHAPE_TYPE}`] = 0;
  return snapshot;
}

describe("ruling 8 — a board saved with a separate `type` still opens", () => {
  const portId = createShapeId("legacy-port");
  const blockId = createShapeId("legacy-block");

  it("folds `ss-port`'s name and type into one declaration, keeping every authored character", () => {
    const s = store();
    loadSnapshot(s, legacySnapshot(portId, blockId) as never);
    const props = s.get(portId)!.props as unknown as { declaration: string; name?: string; type?: string };

    expect(props.declaration).toBe("gain_x  : float");
    // The two old fields are GONE, not merely ignored — a leftover would keep
    // the second source of truth alive in every saved file.
    expect(props.name).toBeUndefined();
    expect(props.type).toBeUndefined();
    // And the type the rest of the app reads is the one the old board stated.
    expect(portTypeOfDeclaration(props.declaration)).toBe("float");
  });

  it("folds every port spec on `ss-block`, and an empty type folds to a BARE name", () => {
    const s = store();
    loadSnapshot(s, legacySnapshot(portId, blockId) as never);
    const ports = (s.get(blockId)!.props as unknown as { ports: Record<string, { id: string; declaration: string }[]> }).ports;

    expect(ports.left).toEqual([{ id: "frame", declaration: "frame: Frame" }]);
    // No trailing colon: "no type stated" is the absence of the annotation.
    expect(ports.right).toEqual([{ id: "pose", declaration: "Pose" }]);
    expect(portTypeOfDeclaration(ports.right[0].declaration)).toBeUndefined();
  });

  it("the REAL legacy fixture on disk opens through tldraw's own file parser", () => {
    // `src/review/__fixtures__/two-blocks.tldr` was written before this lane
    // and carries `"com.tldraw.shape.ss-block": 0` with `{id, name, type}`
    // port specs — an actual saved board, not a hand-built one. It is what
    // `review/boardParam.ts` feeds `parseTldrawJsonFile`, so this is the same
    // path a `?board=` link takes.
    const json = readFileSync(new URL("../review/__fixtures__/two-blocks.tldr", import.meta.url), "utf8");
    const s = store();
    const parsed = parseTldrawJsonFile({ json, schema: s.schema });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    loadSnapshot(s, parsed.value.getStoreSnapshot());
    const decode = s.get(createShapeId("decode") as TLShapeId)!.props as unknown as { ports: Record<string, { id: string; declaration: string }[]> };
    expect(decode.ports.right).toEqual([{ id: "out", declaration: "out: Pose" }]);
  });

  it("the migrated board is a valid document — it round-trips byte-stable", () => {
    const s = store();
    loadSnapshot(s, legacySnapshot(portId, blockId) as never);
    const saved = getSnapshot(s);
    const again = store();
    loadSnapshot(again, saved);
    expect(getSnapshot(again).document).toEqual(saved.document);
  });
});
