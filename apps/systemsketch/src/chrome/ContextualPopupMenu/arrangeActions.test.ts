// src/chrome/ContextualPopupMenu/arrangeActions.test.ts — the pure half of the selection pill's
// ARRANGE vocabulary. No editor, no DOM: everything here is a function of its
// arguments, which is the whole reason `arrangeActions.ts` keeps them separate
// from the React that renders them.
//
// THE STYLE HALF MOVED, 2026-09-24. This file also held `STYLE_ROWS` and
// `activeStyleRows` describes — the six per-tldraw-style rows the pill used to
// draw. That vocabulary was replaced by `appearanceModel.ts`'s four triggers
// (shape · inside · edge · text, plus the app's diff), so the claims moved with
// it, intact, to `./appearanceModel.test.ts`: options read off tldraw's own
// enums and never re-spelled, a selection that does not carry a style gets no
// control for it, a disagreeing selection reports mixed rather than picking a
// winner, and the recipe's order is stable. Nothing was dropped — look there,
// not in this file's history, for where each one went.
import { describe, expect, it } from "vitest";

import {
  ARRANGE_ALIGN_HORIZONTAL,
  ARRANGE_ALIGN_VERTICAL,
  ARRANGE_DISTRIBUTE,
  ARRANGE_Z_ORDER,
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
