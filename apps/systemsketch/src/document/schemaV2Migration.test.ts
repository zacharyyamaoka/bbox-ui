// src/document/schemaV2Migration.test.ts — B-SCHEMA's migration gate
// (docs/lanes/finish-B-SCHEMA.md; lanes.json B-SCHEMA acceptance lines 1 and
// 4): "a legacy .bbox saved before v2 (fixture committed first) opens,
// round-trips, and re-saves with only the new defaulted props added" and "WHY
// comment at each migration naming the P-028 empty-migration incident".
//
// ACCEPTANCE — committed by the acceptance author before any builder existed;
// off-limits to the builder. If a line here cannot pass, the builder reports
// FAIL with the reason and the dispatcher decides.
//
// WHY THIS FILE EXISTS AT ALL — the incident it is named against. P-028 added
// `props.pins` to `ss-wire` and left the migration sequence EMPTY. `T.arrayOf`
// rejects `undefined`, so every board saved before it failed validation and
// REFUSED TO OPEN — and P-028's own suite was green, because nothing in it
// opened an old file. An unrelated lane found it a wave later
// (`WireShapeUtil.tsx`'s `/1` step records the measurement). Schema v2 adds
// ~40 props across five shape kinds in one barrier; this file opens a REAL
// board the app saved before v2 and asserts on values, not on "did not throw".
//
// The fixture (`./fixtures/legacy-v1.bbox`) was written by this app's own
// `serializeBoard` at BASE (see `schemaV2Pixels.smoke.test.tsx`'s capture
// block, which also wrote `./fixtures/legacy-v1.png`). Both are pinned by
// SHA-256 below, so the ruler cannot be quietly re-cut after the build.
//
// The V2 defaults here are the SAME values `documentModel.test.ts` pins for a
// new shape — one contract, stated twice on purpose: there it is "what a new
// shape is born with", here it is "what an old board is migrated to", and the
// two may not drift apart (a migration default that differs from the new-shape
// default would make an old board and a fresh one paint differently).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import ts from "typescript";
import { createTLStore, defaultBindingUtils, defaultShapeUtils, parseTldrawJsonFile, type TLRecord } from "tldraw";
import { describe, expect, it } from "vitest";

import { BINDING_UTILS, SHAPE_UTILS } from "../shapes/registry";
import { BLOCK_SHAPE_TYPE, CODE_SHAPE_TYPE, PORT_SHAPE_TYPE, REGION_SHAPE_TYPE, WIRE_SHAPE_TYPE } from "../shapes/types";

const FIXTURE = new URL("./fixtures/legacy-v1.bbox", import.meta.url);
const BASELINE = new URL("./fixtures/legacy-v1.png", import.meta.url);

/** The committed ruler. Re-cutting either file is a NEW acceptance commit,
 *  never a builder's edit — see this file's header. */
const FIXTURE_SHA256 = "d6295f74b9df872848b9100739f053b3aacf9c6825d7a451b40d14b6d6161098";
const BASELINE_SHA256 = "2453b6bbdc5dbf667566d46ea2bb6be627bcae268eeb4a3dba355a7c5962ca0f";

const SEQUENCE = (type: string) => `com.tldraw.shape.${type}`;

/** What the fixture was saved at — the schema at BASE. */
const LEGACY_SEQUENCES: Record<string, number> = {
  [SEQUENCE(BLOCK_SHAPE_TYPE)]: 4,
  [SEQUENCE(PORT_SHAPE_TYPE)]: 2,
  [SEQUENCE(WIRE_SHAPE_TYPE)]: 2,
  [SEQUENCE(CODE_SHAPE_TYPE)]: 0,
  [SEQUENCE(REGION_SHAPE_TYPE)]: 0,
};

/** Schema v2: exactly ONE new step per kind ("every new prop in ONE
 *  migration" — lanes.json B-SCHEMA). */
const V2_SEQUENCES: Record<string, number> = {
  [SEQUENCE(BLOCK_SHAPE_TYPE)]: 5,
  [SEQUENCE(PORT_SHAPE_TYPE)]: 3,
  [SEQUENCE(WIRE_SHAPE_TYPE)]: 3,
  [SEQUENCE(CODE_SHAPE_TYPE)]: 1,
  [SEQUENCE(REGION_SHAPE_TYPE)]: 1,
};

const RAIL_DEFAULT = { enabled: true, mode: "auto", spacing: null, freeOffsets: {} };

/**
 * EXACTLY the props schema v2 adds, per kind, at the value the migration fills
 * — `docs/finish-2026-09-29/schema-inventory.md` is the long form (type, item,
 * owning lane). Every value here paints today's pixels; that claim is
 * measured by `schemaV2Pixels.smoke.test.tsx`, not asserted.
 */
const V2_DEFAULTS: Record<string, Record<string, unknown>> = {
  [BLOCK_SHAPE_TYPE]: {
    viewSizes: { simple: null, port: null, expanded: null, value: null },
    sizeMode: "fixed",
    cornerRadius: null,
    showHeader: true,
    showHeaderDivider: true,
    showFooter: true,
    showFooterDivider: true,
    showCard: false,
    titleSizePx: null,
    titleFont: null,
    portLayout: "inline",
    functionPort: false,
    rails: { left: RAIL_DEFAULT, right: RAIL_DEFAULT, top: RAIL_DEFAULT, bottom: RAIL_DEFAULT },
    portOptions: {},
    membersLayout: "free",
    memberInset: "inset",
    memberWidth: "fill",
    memberGap: 12,
    memberGutter: 12,
    insetBackground: "none",
    expandedWeights: {},
    blockType: "",
    definitionId: "",
    draftOrdinal: null,
  },
  [PORT_SHAPE_TYPE]: {
    fill: "auto",
    hidden: false,
    labelOrigin: null,
    secondaryOrigin: null,
    slots: { label: [{ kind: "builtin", id: "label" }], secondary: [{ kind: "builtin", id: "producers" }] },
  },
  [WIRE_SHAPE_TYPE]: {
    label: "",
    labelFraction: 0.5,
    startMarker: "none",
    endMarker: "none",
    animated: false,
    strokeWidth: null,
    delayValue: "",
    bend: null,
  },
  [CODE_SHAPE_TYPE]: { lineNumbers: true, fontSizePx: 13 },
  [REGION_SHAPE_TYPE]: { view: "expanded" },
};

const OUR_TYPES = Object.keys(V2_DEFAULTS);

interface FileShape {
  tldrawFileFormatVersion: number;
  schema: { schemaVersion: number; sequences: Record<string, number> };
  records: TLRecord[];
}

/**
 * The APP's schema, not just ours: `<Tldraw shapeUtils={SHAPE_UTILS}>` merges
 * tldraw's defaults with this app's utils, a util whose `type` matches a
 * default replacing it (documentModel.test.ts's registry note). The saved file
 * carries every one of those sequences, so a narrower store here would report
 * "the schema changed" about kinds schema v2 never touched.
 */
function store() {
  const ours = new Set(SHAPE_UTILS.map((util) => util.type));
  const oursBindings = new Set(BINDING_UTILS.map((util) => util.type));
  return createTLStore({
    shapeUtils: [...defaultShapeUtils.filter((util) => !ours.has(util.type)), ...SHAPE_UTILS],
    bindingUtils: [...defaultBindingUtils.filter((util) => !oursBindings.has(util.type)), ...BINDING_UTILS],
  });
}

function legacyText(): string {
  return readFileSync(FIXTURE, "utf8");
}

function legacyFile(): FileShape {
  return JSON.parse(legacyText()) as FileShape;
}

function sha256(url: URL): string {
  return createHash("sha256").update(readFileSync(url)).digest("hex");
}

/** Open the file exactly the way File ▸ Open does (`loadBoardText` →
 *  `parseTldrawJsonFile` against the live schema) and hand back the store. */
function openLegacy() {
  const parsed = parseTldrawJsonFile({ json: legacyText(), schema: store().schema });
  if (!parsed.ok) throw new Error(`the legacy .bbox did not open: ${parsed.error.type} ${JSON.stringify(parsed.error).slice(0, 400)}`);
  return parsed.value;
}

/** Re-save the way `serializeBoard` does — `serializeTldrawJson`'s body minus
 *  asset inlining, which this vocabulary never needs (no `ss-*` carries an
 *  asset): the live schema plus every record. */
function resave(opened: ReturnType<typeof openLegacy>): FileShape {
  return JSON.parse(JSON.stringify({ tldrawFileFormatVersion: legacyFile().tldrawFileFormatVersion, schema: opened.schema.serialize(), records: opened.allRecords() })) as FileShape;
}

function isOurShape(record: TLRecord): record is TLRecord & { type: string; props: Record<string, unknown> } {
  return record.typeName === "shape" && OUR_TYPES.includes((record as { type: string }).type);
}

/**
 * The BOARD, as opposed to the window it was saved from. A `.bbox` carries
 * tldraw's session records too (`instance`, `camera`, `pointer`,
 * `instance_page_state`), and the file parser deliberately re-seeds them —
 * measured on this fixture: `instance` comes back with this machine's
 * `screenBounds`, `isFocused: false` and empty `stylesForNextShape`, with or
 * without schema v2. Those are not document data and schema v2 has nothing to
 * say about them, so the byte-identity claims below are made over
 * document-scope records only — every page, binding, shape and the document
 * record itself — which is the board a person saved.
 */
function isDocumentRecord(record: TLRecord): boolean {
  const type = (store().schema.types as Record<string, { scope?: string } | undefined>)[record.typeName];
  return type?.scope === "document";
}

describe("B-SCHEMA — the committed legacy board", () => {
  it("B-SCHEMA-fixture: is the committed one, byte for byte, saved at the pre-v2 schema with every ss-* kind in it", () => {
    expect(sha256(FIXTURE), "legacy-v1.bbox is the file the acceptance commit pinned").toBe(FIXTURE_SHA256);
    expect(sha256(BASELINE), "legacy-v1.png is the capture the acceptance commit pinned").toBe(BASELINE_SHA256);

    const file = legacyFile();
    const sequences = Object.fromEntries(Object.keys(LEGACY_SEQUENCES).map((key) => [key, file.schema.sequences[key]]));
    expect(sequences, "the fixture was saved BEFORE schema v2").toEqual(LEGACY_SEQUENCES);

    // Its census, asserted rather than assumed: if anyone re-saves it with
    // less in it, this says so instead of the migration test checking nothing.
    const shapes = file.records.filter(isOurShape);
    const kinds = new Set(shapes.map((shape) => shape.type));
    expect([...kinds].sort()).toEqual([...OUR_TYPES].sort());
    const views = new Set(shapes.filter((shape) => shape.type === BLOCK_SHAPE_TYPE).map((shape) => shape.props.view));
    expect([...views].sort(), "a block in every view today's schema has").toEqual(["expanded", "port", "simple"]);
    const variants = new Set(shapes.filter((shape) => shape.type === WIRE_SHAPE_TYPE).map((shape) => shape.props.variant));
    expect([...variants].sort(), "a cable in every variant").toEqual(["async", "data", "delayed"]);
    const wires = shapes.filter((shape) => shape.type === WIRE_SHAPE_TYPE);
    expect(wires.some((wire) => (wire.props.pins as unknown[]).length > 0), "an authored (pinned) cable").toBe(true);
    expect(wires.some((wire) => wire.props.tunnel === true && wire.props.layer !== ""), "a tunnelled cable on a layer").toBe(true);
    expect(shapes.some((shape) => shape.type === BLOCK_SHAPE_TYPE && String((shape as unknown as { parentId: string }).parentId).startsWith("shape:")), "a block that is a member of another shape").toBe(true);
    const regionKinds = new Set(shapes.filter((shape) => shape.type === REGION_SHAPE_TYPE).map((shape) => shape.props.kind));
    expect([...regionKinds].sort()).toEqual(["branch", "for"]);
  });
});

describe("B-SCHEMA — schema v2 opens it, adds only defaulted props, and re-saves it", () => {
  it("B-SCHEMA-open: every ss-* shape comes out with EXACTLY its saved props plus the v2 defaults — nothing reset, nothing else added", () => {
    const opened = openLegacy();
    const saved = legacyFile().records.filter(isDocumentRecord);
    expect(saved.length, "the fixture has a board in it").toBeGreaterThan(20);
    for (const before of saved) {
      const after = opened.get(before.id as never) as TLRecord | undefined;
      expect(after, `${before.id} survived the open`).toBeTruthy();
      if (!isOurShape(before)) {
        // Pages, bindings, the document, the camera: schema v2 adds no prop
        // outside the five ss-* shapes, so these come out byte-identical.
        expect(after, `${before.id} (${before.typeName}) is untouched`).toEqual(before);
        continue;
      }
      const migrated = after as typeof before;
      const { props: savedProps, ...savedRest } = before;
      const { props: migratedProps, ...migratedRest } = migrated;
      expect(migratedRest, `${before.id}: only props may change`).toEqual(savedRest);
      expect(migratedProps, `${before.id} (${before.type}): saved props + the v2 defaults`).toEqual({ ...savedProps, ...V2_DEFAULTS[before.type] });
    }
    // Nothing appeared that was not saved.
    expect(opened.allRecords().filter(isDocumentRecord).map((record) => record.id).sort()).toEqual(saved.map((record) => record.id).sort());
  });

  it("B-SCHEMA-resave: re-saving writes the saved records plus only the defaulted props, at the v2 sequences, and that file re-opens byte-stable", () => {
    const legacy = legacyFile();
    const resaved = resave(openLegacy());

    // The schema the re-saved file declares: our five kinds at v2, every
    // other sequence (tldraw's own) exactly as it was.
    const expectedSequences = { ...legacy.schema.sequences, ...V2_SEQUENCES };
    expect(resaved.schema.sequences, "ss-* at v2, nothing else moved").toEqual(expectedSequences);

    const documentRecords = legacy.records.filter(isDocumentRecord);
    const byId = new Map(resaved.records.filter(isDocumentRecord).map((record) => [record.id, record]));
    expect([...byId.keys()].sort()).toEqual(documentRecords.map((record) => record.id).sort());
    for (const before of documentRecords) {
      const after = byId.get(before.id)!;
      if (!isOurShape(before)) {
        expect(after, `${before.id} re-saves byte-identical`).toEqual(before);
        continue;
      }
      expect(after, `${before.id} re-saves as itself plus the v2 defaults`).toEqual({ ...before, props: { ...before.props, ...V2_DEFAULTS[before.type] } });
      // "Only defaulted props added" — the key set grew by exactly the v2 list.
      const added = Object.keys((after as typeof before).props).filter((key) => !(key in before.props)).sort();
      expect(added, `${before.id}: the props v2 added`).toEqual(Object.keys(V2_DEFAULTS[before.type]).sort());
    }

    // And the re-saved file is itself a board this build opens, unchanged.
    const reopened = parseTldrawJsonFile({ json: JSON.stringify(resaved), schema: store().schema });
    expect(reopened.ok, "the re-saved file opens").toBe(true);
    if (!reopened.ok) return;
    const again = resave(reopened.value);
    expect(again.schema).toEqual(resaved.schema);
    expect(new Map(again.records.filter(isDocumentRecord).map((record) => [record.id, record]))).toEqual(byId);
  });

  it("B-SCHEMA-fill: the v2 step FILLS a gap and never resets a value already there (a writer that sent v2 props to a pre-v2 board keeps them)", () => {
    // pyblocks and future hosts write records directly. A board at a pre-v2
    // sequence that already carries one of the new props — written by a newer
    // writer against an older file — must keep it: `??=`, never `=`. The same
    // rule `diffMarkMigration.test.ts` states for `/4`.
    const file = legacyFile();
    const estimate = file.records.find((record) => record.id === "shape:legacy-estimate") as TLRecord & { props: Record<string, unknown> };
    const wire = file.records.find((record) => isOurShape(record) && record.type === WIRE_SHAPE_TYPE) as TLRecord & { props: Record<string, unknown> };
    const port = file.records.find((record) => record.id === "shape:legacy-gain") as TLRecord & { props: Record<string, unknown> };
    estimate.props.blockType = "model";
    estimate.props.sizeMode = "hug";
    wire.props.label = "frames";
    port.props.fill = "filled";
    const parsed = parseTldrawJsonFile({ json: JSON.stringify(file), schema: store().schema });
    expect(parsed.ok, "a pre-v2 board carrying v2 props still opens").toBe(true);
    if (!parsed.ok) return;
    const props = (id: string) => (parsed.value.get(id as never) as unknown as { props: Record<string, unknown> }).props;
    expect({ blockType: props(estimate.id).blockType, sizeMode: props(estimate.id).sizeMode }).toEqual({ blockType: "model", sizeMode: "hug" });
    expect(props(wire.id).label).toBe("frames");
    expect(props(port.id).fill).toBe("filled");
    // …and every prop the writer did NOT send still got its default.
    expect(props(estimate.id).viewSizes).toEqual(V2_DEFAULTS[BLOCK_SHAPE_TYPE].viewSizes);
    expect(props(wire.id).labelFraction).toBe(0.5);
  });
});

/* ------------------------------------------------------------------ */
/* The WHY at every new step                                          */
/* ------------------------------------------------------------------ */

const UTIL_SOURCES: Record<string, URL> = {
  [BLOCK_SHAPE_TYPE]: new URL("../shapes/block/BlockShapeUtil.tsx", import.meta.url),
  [PORT_SHAPE_TYPE]: new URL("../shapes/port/PortShapeUtil.tsx", import.meta.url),
  [WIRE_SHAPE_TYPE]: new URL("../shapes/wire/WireShapeUtil.tsx", import.meta.url),
  [CODE_SHAPE_TYPE]: new URL("../shapes/code/CodeShapeUtil.tsx", import.meta.url),
  [REGION_SHAPE_TYPE]: new URL("../shapes/region/RegionShapeUtil.tsx", import.meta.url),
};

/**
 * The source text of every element of `static override migrations =
 * createShapePropsMigrationSequence({ sequence: [ … ] })`, INCLUDING the
 * comments around it (`getFullText` keeps leading trivia), in order. Parsed
 * with the TypeScript compiler rather than a regex, so a comment that sits
 * above the step and one that sits inside it both count, and a neighbouring
 * step's comment cannot answer for this one.
 */
function migrationStepTexts(source: string): string[] {
  const file = ts.createSourceFile("util.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const steps: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isPropertyDeclaration(node) && node.name.getText(file) === "migrations" && node.initializer && ts.isCallExpression(node.initializer)) {
      const options = node.initializer.arguments[0];
      if (options && ts.isObjectLiteralExpression(options)) {
        for (const property of options.properties) {
          if (ts.isPropertyAssignment(property) && property.name.getText(file) === "sequence" && ts.isArrayLiteralExpression(property.initializer)) {
            for (const element of property.initializer.elements) steps.push(element.getFullText(file));
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return steps;
}

describe("B-SCHEMA — every new migration step says why it exists", () => {
  it("B-SCHEMA-why: the v2 step of each of the five kinds is its LAST step and carries a WHY naming the P-028 empty-migration incident", () => {
    const missing: string[] = [];
    for (const type of OUR_TYPES) {
      const util = SHAPE_UTILS.find((candidate) => candidate.type === type) as unknown as { migrations: { sequence: { id: string }[] } };
      const runtime = util.migrations.sequence.map((step) => step.id);
      expect(runtime.at(-1), `${type}: the v2 step is the newest one`).toBe(`${SEQUENCE(type)}/${V2_SEQUENCES[SEQUENCE(type)]}`);
      const texts = migrationStepTexts(readFileSync(UTIL_SOURCES[type], "utf8"));
      expect(texts.length, `${type}: the source's sequence is the runtime's sequence`).toBe(runtime.length);
      if (!/P-028/.test(texts.at(-1) ?? "")) missing.push(type);
    }
    expect(missing, "kinds whose v2 step has no WHY naming P-028").toEqual([]);
  });
});
