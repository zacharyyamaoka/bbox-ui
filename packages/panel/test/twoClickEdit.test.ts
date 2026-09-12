import { describe, expect, it } from "vitest";
import { isSecondPressToEdit } from "../src/twoClickEdit";

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
