// keyboardReorder.test.ts — the chord table, exhaustively: every arrow key
// under every modifier combination, on both axes, for both chords. The
// spatial half (the item actually moves, the editor keeps focus) is the
// "Keyboard reorder" stories' job; this pins which keys are claimed at all.
import { describe, expect, it } from "vitest";

import { reorderDeltaForKey, reorderHintText, type ReorderAxis, type ReorderChord } from "./keyboardReorder";

const ARROWS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] as const;
const key = (k: string, mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>> = {}) => ({
  key: k,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

describe("reorderDeltaForKey", () => {
  const cases: [ReorderAxis, ReorderChord, Record<(typeof ARROWS)[number], -1 | 1 | null>][] = [
    ["column", "ctrl", { ArrowUp: -1, ArrowDown: 1, ArrowLeft: null, ArrowRight: null }],
    ["row", "ctrl", { ArrowUp: null, ArrowDown: null, ArrowLeft: -1, ArrowRight: 1 }],
    ["column", "alt", { ArrowUp: -1, ArrowDown: 1, ArrowLeft: null, ArrowRight: null }],
    ["row", "alt", { ArrowUp: null, ArrowDown: null, ArrowLeft: -1, ArrowRight: 1 }],
  ];
  for (const [axis, chord, expected] of cases) {
    it(`${axis} + ${chord}: only the axis-matched pair is claimed`, () => {
      const mod = chord === "ctrl" ? { ctrlKey: true } : { altKey: true };
      for (const arrow of ARROWS) expect(reorderDeltaForKey(key(arrow, mod), axis, chord)).toBe(expected[arrow]);
    });
    it(`${axis} + ${chord}: the other chord, extra modifiers and bare arrows fall through`, () => {
      const other = chord === "ctrl" ? { altKey: true } : { ctrlKey: true };
      const mod = chord === "ctrl" ? { ctrlKey: true } : { altKey: true };
      for (const arrow of ARROWS) {
        expect(reorderDeltaForKey(key(arrow), axis, chord)).toBeNull();
        expect(reorderDeltaForKey(key(arrow, other), axis, chord)).toBeNull();
        expect(reorderDeltaForKey(key(arrow, { ...mod, shiftKey: true }), axis, chord)).toBeNull();
        expect(reorderDeltaForKey(key(arrow, { ...mod, metaKey: true }), axis, chord)).toBeNull();
        expect(reorderDeltaForKey(key(arrow, { ctrlKey: true, altKey: true }), axis, chord)).toBeNull();
      }
    });
  }
  it("ignores non-arrow keys under the chord", () => {
    expect(reorderDeltaForKey(key("Home", { ctrlKey: true }), "column", "ctrl")).toBeNull();
    expect(reorderDeltaForKey(key("a", { altKey: true }), "row", "alt")).toBeNull();
  });
});

describe("reorderHintText", () => {
  it("names the chord and the axis's own arrows", () => {
    expect(reorderHintText("column", "ctrl")).toBe("Ctrl ↑↓ reorder");
    expect(reorderHintText("row", "ctrl")).toBe("Ctrl ←→ reorder");
    expect(reorderHintText("column", "alt")).toBe("Alt ↑↓ reorder");
    expect(reorderHintText("row", "alt")).toBe("Alt ←→ reorder");
  });
});
