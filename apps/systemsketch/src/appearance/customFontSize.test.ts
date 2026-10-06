// @vitest-environment jsdom
//
// src/appearance/customFontSize.test.ts — an exact px that moves the text and
// nothing else.
//
// The first block is the one that matters: reaching 47px moves the shape's
// `scale`, and `scale` multiplies stroke width, so without the pin the outline
// follows the text. The counterfactual is asserted first so the "unchanged"
// claim after it has something to be unchanged FROM.
import { createShapeId, DefaultSizeStyle, type Editor, type TLShapeId } from "tldraw";
import { beforeEach, describe, expect, it } from "vitest";

import {
  applyCustomFontPx,
  CUSTOM_FONT_PX_MAX,
  CUSTOM_FONT_PX_MIN,
  fontPxFor,
  resetCustomFontScale,
  rungPxByValue,
  selectionOnPresetRungs,
  sharedFontPx,
} from "./customFontSize";
import { strokeWidthPxFor } from "./strokeMeta";
import { makeTestEditor, paintedDisplayValues } from "./testEditor";

let editor: Editor;

beforeEach(() => {
  editor = makeTestEditor();
});

function geo(props: Record<string, unknown> = {}): TLShapeId {
  const id = createShapeId();
  editor.createShape({ id, type: "geo", x: 0, y: 0, props: { w: 400, h: 200, ...props } });
  editor.select(id);
  return id;
}

function text(): TLShapeId {
  const id = createShapeId();
  editor.createShape({ id, type: "text", x: 0, y: 0 });
  editor.select(id);
  return id;
}

function paintedWidth(id: TLShapeId): number | undefined {
  return strokeWidthPxFor(editor, editor.getShape(id)!);
}

describe("an exact px does not move the line width", () => {
  it("WITHOUT the pin, the residual scale drags the outline — the counterfactual", () => {
    const id = geo();
    const before = paintedWidth(id)!;
    // The same write applyCustomFontPx makes, minus the pin.
    editor.updateShape({ id, type: "geo", props: { size: "xl", scale: 47 / 32 } });
    expect(paintedWidth(id)).toBeGreaterThan(before);
  });

  it("WITH applyCustomFontPx, the painted width is untouched while the text reaches 47px", () => {
    const id = geo();
    const before = paintedWidth(id)!;

    applyCustomFontPx(editor, 47);

    expect(sharedFontPx(editor)).toBeCloseTo(47, 5);
    expect(fontPxFor(editor, editor.getShape(id)!)).toBeCloseTo(47, 5);
    expect(paintedWidth(id)).toBeCloseTo(before, 5);
    // ...and the canvas agrees: display x scale is still the original width.
    const dv = paintedDisplayValues(editor, id);
    const scale = (editor.getShape(id)!.props as { scale: number }).scale;
    expect((dv.strokeWidth as number) * scale).toBeCloseTo(before, 5);
  });

  it("the residual is a real scale, not a rounded rung", () => {
    const id = geo();
    applyCustomFontPx(editor, 47);
    const props = editor.getShape(id)!.props as { scale: number; size: string };
    expect(props.scale).not.toBe(1);
    expect(["s", "m", "l", "xl"]).toContain(props.size);
  });
});

describe("preset rungs and the custom size", () => {
  it("a fresh selection is on its rungs; a custom px takes it off them", () => {
    geo();
    expect(selectionOnPresetRungs(editor)).toBe(true);
    applyCustomFontPx(editor, 47);
    expect(selectionOnPresetRungs(editor)).toBe(false);
  });

  it("resetCustomFontScale puts it back on a rung, and the rung is what renders", () => {
    const id = geo();
    applyCustomFontPx(editor, 47);
    expect(selectionOnPresetRungs(editor)).toBe(false);

    resetCustomFontScale(editor);

    expect(selectionOnPresetRungs(editor)).toBe(true);
    expect((editor.getShape(id)!.props as { scale: number }).scale).toBe(1);
    const rung = (editor.getShape(id)!.props as { size: string }).size;
    expect(sharedFontPx(editor)).toBeCloseTo(rungPxByValue(editor)[rung]!, 5);
  });

  it("resetCustomFontScale does not move the outline either", () => {
    const id = geo();
    const before = paintedWidth(id)!;
    applyCustomFontPx(editor, 47);
    resetCustomFontScale(editor);
    expect(paintedWidth(id)).toBeCloseTo(before, 5);
  });

  it("the custom px leaves tldraw's next-shape memory on the rung it anchored to", () => {
    const id = geo();
    applyCustomFontPx(editor, 47);
    const rung = (editor.getShape(id)!.props as { size: string }).size;
    expect(editor.getInstanceState().stylesForNextShape[DefaultSizeStyle.id]).toBe(rung);
  });
});

describe("rungPxByValue tells the truth about a mixed selection", () => {
  it("reports each rung's px when the selection agrees on one type scale", () => {
    geo();
    const byRung = rungPxByValue(editor);
    expect(Object.keys(byRung)).toEqual(["s", "m", "l", "xl"]);
    for (const rung of ["s", "m", "l", "xl"]) expect(byRung[rung]).toBeGreaterThan(0);
    // The rungs are a ladder, whatever the theme's numbers happen to be.
    expect(byRung.xl!).toBeGreaterThan(byRung.s!);
  });

  it("reports null per rung when a Text shape and a geo label disagree about what it means", () => {
    const geoId = geo();
    const textId = text();
    editor.select(geoId, textId);
    const byRung = rungPxByValue(editor);
    expect(byRung.xl).toBe(null);
    expect(selectionOnPresetRungs(editor)).toBe(false);
    expect(sharedFontPx(editor)).toBe("mixed");
  });

  it("is all-null with nothing selected, and the row does not apply", () => {
    editor.selectNone();
    expect(rungPxByValue(editor)).toEqual({ s: null, m: null, l: null, xl: null });
    expect(sharedFontPx(editor)).toBe(null);
    expect(selectionOnPresetRungs(editor)).toBe(true);
  });
});

describe("bounds and non-participants", () => {
  it("clamps an absurd px instead of producing an unrecoverable shape", () => {
    geo();
    applyCustomFontPx(editor, 1600);
    expect(sharedFontPx(editor)).toBeCloseTo(CUSTOM_FONT_PX_MAX, 5);
    applyCustomFontPx(editor, 0.1);
    expect(sharedFontPx(editor)).toBeCloseTo(CUSTOM_FONT_PX_MIN, 5);
  });

  it("a drawing's resize scale is never steered from a font control", () => {
    const id = createShapeId();
    editor.createShape({ id, type: "line", x: 0, y: 0 });
    editor.select(id);
    expect(fontPxFor(editor, editor.getShape(id)!)).toBe(null);
    expect(sharedFontPx(editor)).toBe(null);
    applyCustomFontPx(editor, 47);
    expect(editor.getShape(id)!.props).toMatchObject({ scale: 1 });
  });
});
