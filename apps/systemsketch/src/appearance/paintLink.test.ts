// @vitest-environment jsdom
//
// src/appearance/paintLink.test.ts — "the edge colour follows the fill until
// you set it", executable.
//
// The load-bearing asymmetry is the last two tests of the first block: setting
// the FILL carries the edge along and keeps the link; setting the EDGE breaks
// it, and from then on the fill moves alone. Both directions are asserted,
// because either one alone passes for a model that is simply wrong the other
// way round.
import { DefaultColorStyle, createShapeId, getColorValue, type Editor, type TLShapeId } from "tldraw";
import { beforeEach, describe, expect, it } from "vitest";

import {
  applyEdgeColor,
  applyFillColor,
  edgeColorFor,
  edgeFollowsFill,
  EDGE_COLOR_META_KEY,
  EDGE_FOLLOWS_FILL_META_KEY,
  setEdgeFollowsFill,
  sharedEdgeColor,
  sharedEdgeFollowsFill,
} from "./paintLink";
import { makeTestEditor, paintedDisplayValues } from "./testEditor";

let editor: Editor;

beforeEach(() => {
  editor = makeTestEditor();
});

function geo(props: Record<string, unknown> = {}): TLShapeId {
  const id = createShapeId();
  editor.createShape({ id, type: "geo", x: 0, y: 0, props: { w: 200, h: 100, ...props } });
  editor.select(id);
  return id;
}

function fillOf(id: TLShapeId): string {
  return (editor.getShape(id)!.props as { color: string }).color;
}

function solid(name: string): string {
  return getColorValue(editor.getCurrentTheme().colors[editor.getColorMode()], name, "solid");
}

describe("the link, and the one thing that breaks it", () => {
  it("a shape that has never been touched follows its fill", () => {
    const id = geo();
    expect(editor.getShape(id)!.meta).toEqual({});
    expect(edgeFollowsFill(editor.getShape(id)!)).toBe(true);
    expect(sharedEdgeFollowsFill(editor)).toBe(true);
    expect(sharedEdgeColor(editor)).toBe(fillOf(id));
  });

  it("setting the FILL carries the edge along — 'make it green' stays one click", () => {
    const id = geo();
    applyFillColor(editor, "red");
    expect(fillOf(id)).toBe("red");
    expect(sharedEdgeColor(editor)).toBe("red");
    expect(sharedEdgeFollowsFill(editor)).toBe(true);
  });

  it("setting the EDGE breaks the link, and then the fill moves alone", () => {
    const id = geo();
    applyFillColor(editor, "red");

    applyEdgeColor(editor, "blue");
    expect(sharedEdgeFollowsFill(editor)).toBe(false);
    expect(sharedEdgeColor(editor)).toBe("blue");
    expect(fillOf(id)).toBe("red");

    applyFillColor(editor, "yellow");
    expect(fillOf(id)).toBe("yellow");
    expect(sharedEdgeColor(editor)).toBe("blue");
    expect(sharedEdgeFollowsFill(editor)).toBe(false);
  });

  it("relinking makes the edge the fill colour again, immediately", () => {
    const id = geo();
    applyEdgeColor(editor, "blue");
    applyFillColor(editor, "yellow");
    expect(sharedEdgeColor(editor)).toBe("blue");

    setEdgeFollowsFill(editor, true);
    expect(sharedEdgeFollowsFill(editor)).toBe(true);
    expect(sharedEdgeColor(editor)).toBe("yellow");
    expect(editor.getShape(id)!.meta[EDGE_COLOR_META_KEY]).toBe("yellow");
  });

  it("unlinking on its own freezes the colour the edge is wearing — not a flag with no effect", () => {
    const id = geo();
    applyFillColor(editor, "green");

    setEdgeFollowsFill(editor, false);
    expect(editor.getShape(id)!.meta[EDGE_FOLLOWS_FILL_META_KEY]).toBe(false);
    expect(sharedEdgeColor(editor)).toBe("green");

    applyFillColor(editor, "violet");
    expect(fillOf(id)).toBe("violet");
    expect(sharedEdgeColor(editor)).toBe("green");
  });
});

describe("what the canvas actually paints, through the registered util", () => {
  it("a linked shape emits NO custom stroke colour, so it stays byte-for-byte stock", () => {
    const id = geo();
    applyFillColor(editor, "red");
    expect(paintedDisplayValues(editor, id).strokeColor).toBe(solid("red"));
  });

  it("an unlinked shape paints the override, and the fill keeps its own colour", () => {
    // A control painted the same way but still linked: the ONLY display value
    // that may differ between the two is strokeColor.
    const control = geo({ fill: "solid" });
    applyFillColor(editor, "red");
    const stock = paintedDisplayValues(editor, control);

    const id = geo({ fill: "solid" });
    applyFillColor(editor, "red");
    applyEdgeColor(editor, "blue");

    const dv = paintedDisplayValues(editor, id);
    expect(dv.strokeColor).toBe(solid("blue"));
    expect(dv.strokeColor).not.toBe(stock.strokeColor);
    expect(dv.fillColor).toBe(stock.fillColor);
    expect(dv.strokeColor).not.toBe(dv.fillColor);
  });

  it("the override survives a fill change on the canvas, not just in the model", () => {
    const id = geo();
    applyEdgeColor(editor, "blue");
    applyFillColor(editor, "yellow");
    expect(paintedDisplayValues(editor, id).strokeColor).toBe(solid("blue"));
  });
});

describe("across a selection", () => {
  it("reports mixed when two shapes disagree, and null when nothing applies", () => {
    const a = geo();
    const b = geo();
    editor.select(b);
    applyEdgeColor(editor, "blue");
    editor.select(a, b);
    expect(sharedEdgeColor(editor)).toBe("mixed");
    expect(sharedEdgeFollowsFill(editor)).toBe("mixed");

    editor.selectNone();
    expect(sharedEdgeColor(editor)).toBe(null);
    expect(sharedEdgeFollowsFill(editor)).toBe(null);
  });

  it("a shape with no painted edge is not a participant", () => {
    const id = createShapeId();
    editor.createShape({ id, type: "note", x: 0, y: 0 });
    editor.select(id);
    expect(sharedEdgeColor(editor)).toBe(null);
    expect(edgeColorFor(editor.getShape(id)!)).toBeUndefined();
  });

  it("applyFillColor still writes the stock style for every selected shape", () => {
    const geoId = geo();
    const textId = createShapeId();
    editor.createShape({ id: textId, type: "text", x: 0, y: 0 });
    editor.select(geoId, textId);
    applyFillColor(editor, "orange");
    expect(fillOf(geoId)).toBe("orange");
    expect((editor.getShape(textId)!.props as { color: string }).color).toBe("orange");
    expect(editor.getInstanceState().stylesForNextShape[DefaultColorStyle.id]).toBe("orange");
  });
});
