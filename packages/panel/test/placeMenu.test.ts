import { describe, expect, it } from "vitest";
import { placeMenu } from "../src/variants/FigmaDense";

/**
 * The dropdown's placement arithmetic.
 *
 * WHY it is a pure function with its own test, rather than inline in the
 * component: the bug it exists to fix was invisible to every test this
 * package had, because it was geometry — Zach, 2026-09-12, on Port's State
 * row: "I did a drop down on the state property, and instead of showing me
 * the drop down menu, its cut off with a scroll wheel." A browser journey
 * catches the case it drives; this catches the cases it does not.
 */

const VIEWPORT = { width: 1400, height: 760 };
/** A trigger sitting comfortably in the middle of a tall column. */
function trigger(top: number, width = 200, height = 22) {
  return { left: 1000, right: 1000 + width, top, bottom: top + height, width };
}

describe("placeMenu", () => {
  it("hangs below the trigger when there is room", () => {
    const box = placeMenu(trigger(200), 6, VIEWPORT);
    expect(box.placement).toBe("below");
    expect(box.top).toBeGreaterThan(200);
    expect(box.top + box.maxHeight).toBeLessThanOrEqual(VIEWPORT.height);
  });

  it("flips above when below cannot hold it and above can", () => {
    // 30px of headroom under the trigger, 600 over it.
    const box = placeMenu(trigger(VIEWPORT.height - 52), 6, VIEWPORT);
    expect(box.placement).toBe("above");
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.top + box.maxHeight).toBeLessThanOrEqual(VIEWPORT.height - 52);
  });

  it("stays below when below is cramped but above is worse", () => {
    // A trigger near the TOP: flipping would make it smaller, not bigger, and
    // a menu that jumps away from the eye for no gain is worse than a short
    // one under the finger.
    const box = placeMenu(trigger(12), 8, VIEWPORT);
    expect(box.placement).toBe("below");
  });

  it("never leaves the viewport, whichever way it goes", () => {
    for (const top of [0, 40, 200, 400, 600, 730, 758]) {
      for (const rows of [1, 3, 6, 20]) {
        const box = placeMenu(trigger(top), rows, VIEWPORT);
        expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.top + box.maxHeight).toBeLessThanOrEqual(VIEWPORT.height);
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.left + box.width).toBeLessThanOrEqual(VIEWPORT.width);
      }
    }
  });

  it("caps a very long list rather than growing past the screen", () => {
    const box = placeMenu(trigger(100), 200, VIEWPORT);
    expect(box.maxHeight).toBeLessThanOrEqual(220);
  });

  it("pulls a trigger near the right edge back inside", () => {
    const wide = { left: 1330, right: 1530, top: 200, bottom: 222, width: 200 };
    const box = placeMenu(wide, 4, VIEWPORT);
    expect(box.left + box.width).toBeLessThanOrEqual(VIEWPORT.width);
  });

  it("matches the trigger's width, so the menu reads as that control's", () => {
    expect(placeMenu(trigger(200, 137), 4, VIEWPORT).width).toBe(137);
  });

  it("keeps a usable minimum even when squeezed from both sides", () => {
    const tiny = { width: 1400, height: 180 };
    const box = placeMenu({ left: 100, right: 300, top: 80, bottom: 102, width: 200 }, 6, tiny);
    expect(box.maxHeight).toBeGreaterThanOrEqual(96);
  });
});
