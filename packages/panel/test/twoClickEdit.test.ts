import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  armEditOnRelease,
  claimInstancePointerDown,
  clearArmedEdit,
  isInstancePointerDownClaimed,
  isSecondPressToEdit,
} from "../src/twoClickEdit";

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

/**
 * `armEditOnRelease` / `clearArmedEdit` — the pointer-up resolution, the
 * 4px click/drag threshold, and the right-button guard, all pinned WITHOUT
 * jsdom: this package is dependency-free by design (its own doc comment,
 * above), and `armEditOnRelease` only ever calls `addEventListener` /
 * `removeEventListener` on `document` — a contract Node's OWN built-in
 * `EventTarget` (global since Node 15+) satisfies exactly, so a bare
 * `EventTarget` stands in for `document` here. This proves the function's
 * OWN state machine; the real DOM behavior it's wired into (autofocus,
 * `preventDefault()` actually stopping React Flow's drag, etc.) is the
 * browser journey's job (docs/TEXTBOX-EDITING-SPEC.md §4), not this file's.
 */
describe("armEditOnRelease / clearArmedEdit", () => {
  let doc: EventTarget;

  beforeEach(() => {
    doc = new EventTarget();
    // @ts-expect-error test-only stand-in — see this block's own doc comment.
    globalThis.document = doc;
  });

  afterEach(() => {
    // A test that forgot to resolve or cancel its own arm must not leak an
    // armed press (with a now-stale `doc` in its closures) into the next
    // test's fresh `document`.
    clearArmedEdit();
  });

  function pointerEvent(type: string, x: number, y: number, button = 0) {
    const e = new Event(type, { cancelable: true }) as unknown as PointerEvent & {
      clientX: number;
      clientY: number;
      button: number;
    };
    Object.assign(e, { clientX: x, clientY: y, button });
    return e;
  }

  it("fires onEdit on pointer-up with no movement", () => {
    const onEdit = vi.fn();
    armEditOnRelease(pointerEvent("pointerdown", 100, 100), onEdit);
    doc.dispatchEvent(pointerEvent("pointerup", 100, 100));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("still fires when movement stays within the 4px threshold", () => {
    const onEdit = vi.fn();
    armEditOnRelease(pointerEvent("pointerdown", 100, 100), onEdit);
    doc.dispatchEvent(pointerEvent("pointermove", 103, 100)); // 3px, under threshold
    doc.dispatchEvent(pointerEvent("pointerup", 103, 100));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("cancels on movement past the 4px threshold and never fires, even on the eventual pointer-up", () => {
    const onEdit = vi.fn();
    armEditOnRelease(pointerEvent("pointerdown", 100, 100), onEdit);
    doc.dispatchEvent(pointerEvent("pointermove", 106, 100)); // 6px, past threshold
    doc.dispatchEvent(pointerEvent("pointerup", 106, 100));
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("measures the threshold as a real 2D distance, not per-axis", () => {
    const onEdit = vi.fn();
    // 3-4-5 triangle: 3px x, 4px y = exactly 5px away, past the 4px threshold.
    armEditOnRelease(pointerEvent("pointerdown", 0, 0), onEdit);
    doc.dispatchEvent(pointerEvent("pointermove", 3, 4));
    doc.dispatchEvent(pointerEvent("pointerup", 3, 4));
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("clearArmedEdit cancels an armed press without firing it", () => {
    const onEdit = vi.fn();
    armEditOnRelease(pointerEvent("pointerdown", 100, 100), onEdit);
    clearArmedEdit();
    doc.dispatchEvent(pointerEvent("pointerup", 100, 100));
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("clearArmedEdit is safe to call when nothing is armed", () => {
    expect(() => clearArmedEdit()).not.toThrow();
  });

  it("arming a second press cancels the first without firing it", () => {
    const first = vi.fn();
    const second = vi.fn();
    armEditOnRelease(pointerEvent("pointerdown", 100, 100), first);
    armEditOnRelease(pointerEvent("pointerdown", 200, 200), second);
    doc.dispatchEvent(pointerEvent("pointerup", 200, 200));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  // A right-button press is a context-menu request, never a click — the
  // one thing docs/TEXTBOX-EDITING-SPEC.md's verify rounds kept finding a
  // gap in: it must never arm editing, in any of this function's own
  // vocabulary (button 1 middle-click included, since only button 0 is
  // "the" click).
  it("a right-button press (button 2) never arms editing", () => {
    const onEdit = vi.fn();
    armEditOnRelease(pointerEvent("pointerdown", 100, 100, 2), onEdit);
    doc.dispatchEvent(pointerEvent("pointerup", 100, 100, 2));
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("a right-button press does not disturb an already-armed left-button press", () => {
    const onEdit = vi.fn();
    armEditOnRelease(pointerEvent("pointerdown", 100, 100, 0), onEdit);
    // A stray right-button "arm" attempt (e.g. a second pointer) must be a
    // pure no-op — it must not call `clearArmedEdit()` on the legitimate arm.
    armEditOnRelease(pointerEvent("pointerdown", 100, 100, 2), vi.fn());
    doc.dispatchEvent(pointerEvent("pointerup", 100, 100, 0));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("a middle-button press (button 1) never arms editing either", () => {
    const onEdit = vi.fn();
    armEditOnRelease(pointerEvent("pointerdown", 100, 100, 1), onEdit);
    doc.dispatchEvent(pointerEvent("pointerup", 100, 100, 1));
    expect(onEdit).not.toHaveBeenCalled();
  });
});
