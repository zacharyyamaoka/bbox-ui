// src/chrome/arrangeActions.test.ts — the pure half of the selection pill's
// Arrange / opacity / style vocabulary. No editor, no DOM: everything here is
// a function of its arguments, which is the whole reason `arrangeActions.ts`
// keeps them separate from the React that renders them.
import { describe, expect, it } from "vitest";

import {
  ARRANGE_ALIGN_HORIZONTAL,
  ARRANGE_ALIGN_VERTICAL,
  ARRANGE_DISTRIBUTE,
  ARRANGE_Z_ORDER,
  STYLE_ROWS,
  activeStyleRows,
  arrangeGroupsFor,
} from "./arrangeActions";

describe("arrangeGroupsFor — which controls a selection may use", () => {
  it("offers nothing at all with an empty selection", () => {
    expect(arrangeGroupsFor(0)).toEqual([]);
  });

  it("offers z-order alone for ONE shape: it moves against the page, so it is meaningful, but there is nothing to align to", () => {
    const groups = arrangeGroupsFor(1);
    expect(groups.map((group) => group.id)).toEqual(["z-order"]);
    expect(groups[0]!.actions).toBe(ARRANGE_Z_ORDER);
  });

  it("adds both align families at TWO, and still no distribute — with two shapes the ends are already the ends, so distributing is a no-op that looks like a bug", () => {
    const groups = arrangeGroupsFor(2);
    expect(groups.map((group) => group.id)).toEqual(["z-order", "align-horizontal", "align-vertical"]);
    expect(groups.some((group) => group.id === "distribute")).toBe(false);
  });

  it("adds distribute at THREE, where there is finally a shape in the middle to move", () => {
    const groups = arrangeGroupsFor(3);
    expect(groups.map((group) => group.id)).toEqual(["z-order", "align-horizontal", "align-vertical", "distribute"]);
    expect(groups.at(-1)!.actions).toBe(ARRANGE_DISTRIBUTE);
  });

  it("never grows past three — 4, 10 and 100 shapes get the same four groups", () => {
    const at3 = arrangeGroupsFor(3).map((group) => group.id);
    for (const count of [4, 10, 100]) expect(arrangeGroupsFor(count).map((group) => group.id)).toEqual(at3);
  });

  it("every action id is unique across every group, so a click cannot be ambiguous", () => {
    const ids = arrangeGroupsFor(3).flatMap((group) => group.actions.map((action) => action.id));
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("every action carries a real label and a real icon component", () => {
    for (const action of [...ARRANGE_Z_ORDER, ...ARRANGE_ALIGN_HORIZONTAL, ...ARRANGE_ALIGN_VERTICAL, ...ARRANGE_DISTRIBUTE]) {
      expect(action.label.length, `${action.id} has a label`).toBeGreaterThan(0);
      expect(action.icon, `${action.id} has an icon`).toBeTruthy();
    }
  });
});

describe("STYLE_ROWS — read off tldraw's own enums, never re-spelled here", () => {
  // THIS IS THE LOAD-BEARING ONE. `valuesOf()` reaches for `StyleProp.values`,
  // which is a runtime field rather than a documented part of the type. If a
  // tldraw upgrade renames or drops it, every style row silently becomes an
  // empty option list and the panel renders as a row of empty popovers — a
  // failure that looks like a CSS bug, not a break. This test turns that into
  // a red line the day it happens.
  it("every row has a non-empty option list", () => {
    for (const row of STYLE_ROWS) {
      expect(row.values.length, `${row.id} has options (StyleProp.values still exists?)`).toBeGreaterThan(0);
    }
  });

  it("carries tldraw's real vocabulary, not a guess: colours include black and blue, dash includes solid and dashed, size includes s and xl", () => {
    const byId = Object.fromEntries(STYLE_ROWS.map((row) => [row.id, row.values]));
    expect(byId.color).toEqual(expect.arrayContaining(["black", "blue"]));
    expect(byId.dash).toEqual(expect.arrayContaining(["solid", "dashed"]));
    expect(byId.size).toEqual(expect.arrayContaining(["s", "xl"]));
    expect(byId.fill).toEqual(expect.arrayContaining(["none", "solid"]));
  });

  it("only the colour row paints swatches; the rest are named, because there is nothing to show", () => {
    expect(STYLE_ROWS.filter((row) => row.paint === "swatch").map((row) => row.id)).toEqual(["color"]);
  });
});

describe("activeStyleRows — the selection decides which rows exist", () => {
  /** A stand-in for tldraw's `ReadonlySharedStyleMap`: only `get` is read. */
  function sharedMap(entries: Map<unknown, { type: string; value?: string }>) {
    return { get: (style: unknown) => entries.get(style) } as never;
  }

  it("drops a style the selection does not have at all — an arrow has a colour but no fill", () => {
    const color = STYLE_ROWS.find((row) => row.id === "color")!;
    const rows = activeStyleRows(sharedMap(new Map([[color.style, { type: "shared", value: "blue" }]])));
    expect(rows.map((row) => row.id)).toEqual(["color"]);
    expect(rows[0]!.value).toBe("blue");
  });

  it("reports a DISAGREEING selection as null rather than picking a winner", () => {
    const color = STYLE_ROWS.find((row) => row.id === "color")!;
    const rows = activeStyleRows(sharedMap(new Map([[color.style, { type: "mixed" }]])));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.value, "mixed is null, not the first shape's colour").toBeNull();
  });

  it("keeps STYLE_ROWS' order regardless of what the map iterates in", () => {
    const entries = new Map(STYLE_ROWS.map((row) => [row.style, { type: "shared", value: row.values[0]! }] as const));
    expect(activeStyleRows(sharedMap(entries as never)).map((row) => row.id)).toEqual(STYLE_ROWS.map((row) => row.id));
  });

  it("returns nothing for a selection that shares no styles at all", () => {
    expect(activeStyleRows(sharedMap(new Map()))).toEqual([]);
  });
});
