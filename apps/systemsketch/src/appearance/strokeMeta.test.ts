// @vitest-environment jsdom
//
// src/appearance/strokeMeta.test.ts — "text size must stop moving the line
// width", executable.
//
// The claim under test is about STOCK tldraw's behaviour, so the oracle is
// stock tldraw: a real `Editor` over the app's real `SHAPE_UTILS`, and every
// width read back as the number the engine is about to paint with. Each test
// that asserts "unchanged" carries its own counterfactual — the same write
// WITHOUT the pin — because an assertion that something stayed at 3.5 is
// worthless unless something else proves it would otherwise have moved.
//
// jsdom rather than the `smoke` project: tldraw's `Editor` needs a document to
// build its text-measurement element, and nothing here renders. The `unit`
// project's default node environment is overridden by the docblock above.
import { DefaultSizeStyle, createShapeId, defaultShapeUtils, type Editor, type TLShapeId } from "tldraw";
import { beforeEach, describe, expect, it } from "vitest";

import { SHAPE_UTILS } from "../shapes/registry";
import {
  BLOCK_SHAPE_TYPE,
  CODE_SHAPE_TYPE,
  PORT_SHAPE_TYPE,
  REGION_SHAPE_TYPE,
  WIRE_SHAPE_TYPE,
} from "../shapes/types";
import { makeTestEditor, MERGED_SHAPE_UTILS, paintedDisplayValues } from "./testEditor";
import {
  applyStrokeWidth,
  pinStrokeWidth,
  sharedStrokeWidth,
  STROKE_WIDTH_META_KEY,
  STROKE_WIDTH_PX,
  STROKE_WIDTH_RUNGS,
  STROKE_WIDTH_SHAPE_TYPES,
  strokeWidthDisplay,
  strokeWidthPxFor,
} from "./strokeMeta";

let editor: Editor;

beforeEach(() => {
  editor = makeTestEditor();
});

function geo(props: Record<string, unknown> = {}): TLShapeId {
  const id = createShapeId();
  editor.createShape({ id, type: "geo", x: 0, y: 0, props: { w: 200, h: 100, ...props } });
  return id;
}

function paintedWidth(id: TLShapeId): number | undefined {
  return strokeWidthPxFor(editor, editor.getShape(id)!);
}

function labelFontSize(id: TLShapeId): number {
  return paintedDisplayValues(editor, id).labelFontSize as number;
}

describe("the ladder is anchored on what boards already paint", () => {
  it("medium is exactly the width a stock, untouched shape is drawn at", () => {
    const id = geo();
    expect(editor.getShape(id)!.props).toMatchObject({ size: "m" });
    expect(paintedWidth(id)).toBeCloseTo(STROKE_WIDTH_PX.medium, 5);
    expect(sharedStrokeWidth(editor)).toBe(null); // nothing selected yet
    editor.select(id);
    expect(sharedStrokeWidth(editor)).toBe("medium");
  });

  it("the rungs and the shape-type set are the frozen contract", () => {
    expect(STROKE_WIDTH_RUNGS).toEqual(["thin", "medium", "thick"]);
    expect(STROKE_WIDTH_PX).toEqual({ thin: 2, medium: 3.5, thick: 7 });
    expect([...STROKE_WIDTH_SHAPE_TYPES].sort()).toEqual(["arrow", "draw", "geo", "line"]);
  });
});

describe("a size rung write no longer drags the outline", () => {
  it("WITHOUT the pin, stock tldraw moves the width from 3.5 to 10 — the counterfactual", () => {
    const id = geo();
    editor.select(id);
    expect(paintedWidth(id)).toBeCloseTo(3.5, 5);
    editor.setStyleForSelectedShapes(DefaultSizeStyle, "xl");
    expect(paintedWidth(id)).toBeCloseTo(10, 5);
  });

  it("WITH the pin, the painted width is unchanged while the label font size changes", () => {
    const id = geo();
    editor.select(id);
    const widthBefore = paintedWidth(id)!;
    const fontBefore = labelFontSize(id);

    pinStrokeWidth(editor);
    editor.setStyleForSelectedShapes(DefaultSizeStyle, "xl");

    expect(editor.getShape(id)!.props).toMatchObject({ size: "xl" });
    expect(paintedWidth(id)).toBeCloseTo(widthBefore, 5);
    expect(labelFontSize(id)).toBeGreaterThan(fontBefore);
  });

  it("and the canvas paints that pinned width, through the registered util", () => {
    const id = geo();
    editor.select(id);
    pinStrokeWidth(editor);
    editor.setStyleForSelectedShapes(DefaultSizeStyle, "xl");

    const dv = paintedDisplayValues(editor, id);
    expect(dv.strokeWidth).toBeCloseTo(3.5, 5);
    // strokeRoundness is defined as strokeWidth * 2 and has to ride with it.
    expect(dv.strokeRoundness).toBeCloseTo(7, 5);
  });
});

describe("a custom text scale does not move it either", () => {
  it("WITHOUT the pin, a scale of 2 doubles the painted width — the counterfactual", () => {
    const id = geo();
    editor.select(id);
    editor.updateShape({ id, type: "geo", props: { size: "xl", scale: 2 } });
    expect(paintedWidth(id)).toBeCloseTo(20, 5);
  });

  it("WITH the pin, the painted width survives both a rung change and a scale change", () => {
    const id = geo();
    editor.select(id);
    pinStrokeWidth(editor);
    editor.updateShape({ id, type: "geo", props: { size: "xl", scale: 2 } });

    expect(paintedWidth(id)).toBeCloseTo(3.5, 5);
    // The display value is the painted width divided by scale, because tldraw
    // multiplies by scale again when it draws.
    expect(strokeWidthDisplay(editor.getShape(id)!)).toEqual({ strokeWidth: 1.75 });
    expect(paintedDisplayValues(editor, id).strokeWidth).toBeCloseTo(1.75, 5);
  });
});

describe("applyStrokeWidth", () => {
  it("writes a rung the reader can name again", () => {
    const id = geo();
    editor.select(id);
    applyStrokeWidth(editor, "thick");
    expect(paintedWidth(id)).toBeCloseTo(7, 5);
    expect(sharedStrokeWidth(editor)).toBe("thick");
    expect(editor.getShape(id)!.meta[STROKE_WIDTH_META_KEY]).toBe(7);

    applyStrokeWidth(editor, "thin");
    expect(sharedStrokeWidth(editor)).toBe("thin");
  });

  it("takes one undo step, and the width goes back with it", () => {
    const id = geo();
    editor.select(id);
    applyStrokeWidth(editor, "thick");
    editor.undo();
    expect(paintedWidth(id)).toBeCloseTo(3.5, 5);
  });

  it("pinStrokeWidth converges — a shape that already chose a rung is left alone", () => {
    const id = geo();
    editor.select(id);
    applyStrokeWidth(editor, "thin");
    editor.setStyleForSelectedShapes(DefaultSizeStyle, "xl");
    pinStrokeWidth(editor);
    expect(editor.getShape(id)!.meta[STROKE_WIDTH_META_KEY]).toBe(2);
  });
});

describe("sharedStrokeWidth across a selection", () => {
  it("is null when nothing selected has a painted edge", () => {
    const id = createShapeId();
    editor.createShape({ id, type: "text", x: 0, y: 0 });
    editor.select(id);
    expect(sharedStrokeWidth(editor)).toBe(null);
  });

  it("is mixed when two shapes disagree", () => {
    const a = geo();
    const b = geo();
    editor.select(a, b);
    applyStrokeWidth(editor, "thin");
    editor.select(b);
    applyStrokeWidth(editor, "thick");
    editor.select(a, b);
    expect(sharedStrokeWidth(editor)).toBe("mixed");
  });

  it("is mixed — not null — for a single shape sitting off the ladder on tldraw's own rung", () => {
    const id = geo();
    editor.select(id);
    editor.setStyleForSelectedShapes(DefaultSizeStyle, "l"); // 5px: between medium and thick
    expect(paintedWidth(id)).toBeCloseTo(5, 5);
    expect(sharedStrokeWidth(editor)).toBe("mixed");
  });

  it("descends into groups, the way setStyleForSelectedShapes does", () => {
    const a = geo();
    const b = geo({ w: 50 });
    // `Editor.groupShapes` refuses outside `select.idle` (Editor.mjs:6476).
    editor.setCurrentTool("select");
    editor.select(a, b);
    const groupId = createShapeId();
    editor.groupShapes([a, b], { groupId, select: true });
    // The selection is the group, not the two rectangles.
    expect(editor.getSelectedShapes().map((shape) => shape.type)).toEqual(["group"]);
    applyStrokeWidth(editor, "thick");
    expect(paintedWidth(a)).toBeCloseTo(7, 5);
    expect(paintedWidth(b)).toBeCloseTo(7, 5);
    expect(sharedStrokeWidth(editor)).toBe("thick");
  });
});

describe("registering the paint seam adds no new shape KIND", () => {
  // src/document/documentModel.test.ts's "publishes exactly the plan's shape
  // and binding types" asserts `SHAPE_UTILS.map(u => u.type)` equals the five
  // ss-* kinds, and registering the four paint overrides makes that list nine.
  // Nothing about the DOCUMENT changed — geo/draw/line/arrow keep tldraw's own
  // schema, migrations and record shape, and no new type can be persisted — so
  // this pins the property that assertion was written to protect, from the
  // side of the code that broke its letter. See the handoff: that one line is
  // the dispatcher's call, not this lane's.
  it("every util beyond the app's own five kinds is one of tldraw's own", () => {
    const ours = new Set<string>([
      BLOCK_SHAPE_TYPE,
      CODE_SHAPE_TYPE,
      PORT_SHAPE_TYPE,
      REGION_SHAPE_TYPE,
      WIRE_SHAPE_TYPE,
    ]);
    const stock = new Set(defaultShapeUtils.map((util) => util.type));
    const added = SHAPE_UTILS.map((util) => util.type).filter((type) => !ours.has(type));
    expect(added.sort()).toEqual(["arrow", "draw", "geo", "line"]);
    for (const type of added) expect(stock.has(type), type).toBe(true);
  });

  it("they REPLACE the stock utils rather than sitting beside them", () => {
    for (const type of ["geo", "draw", "line", "arrow"]) {
      expect(MERGED_SHAPE_UTILS.filter((util) => util.type === type), type).toHaveLength(1);
    }
  });
});

describe("shapes without a painted edge are untouched", () => {
  it("strokeWidthPxFor reports nothing for a shape type outside the set", () => {
    const id = createShapeId();
    editor.createShape({ id, type: "note", x: 0, y: 0 });
    expect(strokeWidthPxFor(editor, editor.getShape(id)!)).toBeUndefined();
    editor.select(id);
    pinStrokeWidth(editor);
    expect(editor.getShape(id)!.meta[STROKE_WIDTH_META_KEY]).toBeUndefined();
  });

  it("an untouched shape emits no custom display value at all, so it paints exactly stock", () => {
    const id = geo();
    expect(strokeWidthDisplay(editor.getShape(id)!)).toBeUndefined();
    expect(editor.getShape(id)!.meta).toEqual({});
  });
});
