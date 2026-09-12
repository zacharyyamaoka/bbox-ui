import { describe, expect, it } from "vitest";
import { claimInstancePointerDown, isInstancePointerDownClaimed, isSecondPressToEdit } from "../src/twoClickEdit";

describe("the two-click-to-edit rule", () => {
  it("selects a not-yet-selected inline-editable instance rather than editing it", () => {
    expect(
      isSecondPressToEdit({ id: "a", additive: false, selectedIds: [], inlineEditable: true }),
    ).toBe(false);
    expect(
      isSecondPressToEdit({ id: "a", additive: false, selectedIds: ["b"], inlineEditable: true }),
    ).toBe(false);
  });

  it("requests edit on the SECOND press of the already-sole-selected inline-editable instance", () => {
    expect(
      isSecondPressToEdit({ id: "a", additive: false, selectedIds: ["a"], inlineEditable: true }),
    ).toBe(true);
  });

  it("never requests edit for a component that has no inlineEdit", () => {
    expect(
      isSecondPressToEdit({ id: "a", additive: false, selectedIds: ["a"], inlineEditable: false }),
    ).toBe(false);
  });

  it("a shift/cmd/ctrl press always selects, even on the already-sole-selected instance", () => {
    expect(
      isSecondPressToEdit({ id: "a", additive: true, selectedIds: ["a"], inlineEditable: true }),
    ).toBe(false);
  });

  it("does not fire when the instance is one of several selected", () => {
    expect(
      isSecondPressToEdit({ id: "a", additive: false, selectedIds: ["a", "b"], inlineEditable: true }),
    ).toBe(false);
  });
});

/**
 * verify-round-1, F3: the claim flag that replaced `e.stopPropagation()` in
 * render-instance.tsx's member wrapper and dom-preview.tsx's root wrapper
 * (docs/TEXTBOX-EDITING-SPEC.md's DoD — a drag starting on a member's
 * resting content must still move the node in React Flow/tldraw, which a
 * native-level stopPropagation silently prevented from ever reaching
 * their own ancestor drag listeners). This only proves the FLAG's own
 * semantics — an innermost claim is visible to any wrapper checking the
 * SAME native event, and an unrelated event starts unclaimed; the actual
 * regression (a real drag moving a real node) is proved by the browser
 * journey, docs/TEXTBOX-EDITING-SPEC.md §4, which no unit test in this
 * dependency-free package can substitute for (no react-dom/jsdom here).
 */
describe("instance pointer-down claim (replaces stopPropagation for drag-through)", () => {
  it("is unclaimed until something claims it", () => {
    const e = { nativeEvent: new Event("pointerdown") };
    expect(isInstancePointerDownClaimed(e)).toBe(false);
  });

  it("is claimed for every reader of the SAME native event once claimed", () => {
    const e = { nativeEvent: new Event("pointerdown") };
    claimInstancePointerDown(e);
    expect(isInstancePointerDownClaimed(e)).toBe(true);
    // A second wrapper reading a DIFFERENT `e` object that WRAPS the same
    // native event (exactly what happens across nested onPointerDown
    // handlers on the same bubble) sees the same claim.
    expect(isInstancePointerDownClaimed({ nativeEvent: e.nativeEvent })).toBe(true);
  });

  it("does not leak a claim onto an unrelated event", () => {
    const claimed = { nativeEvent: new Event("pointerdown") };
    const other = { nativeEvent: new Event("pointerdown") };
    claimInstancePointerDown(claimed);
    expect(isInstancePointerDownClaimed(other)).toBe(false);
  });
});
