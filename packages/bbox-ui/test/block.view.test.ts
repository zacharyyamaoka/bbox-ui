import { describe, expect, it } from "vitest";
import {
  BLOCK_VIEW_DEFAULT_SIZES,
  parkViewSize,
  type BlockViewSizes,
} from "../src/block.view";

describe("parkViewSize", () => {
  it("parks the current box under `from` and returns `to`'s remembered box", () => {
    const current = { w: 500, h: 400 };
    const result = parkViewSize(BLOCK_VIEW_DEFAULT_SIZES, "port", "expanded", current);
    expect(result.sizes.port).toEqual(current);
    expect(result.size).toEqual(BLOCK_VIEW_DEFAULT_SIZES.expanded);
  });

  it("does not mutate its input", () => {
    const sizes: BlockViewSizes = { ...BLOCK_VIEW_DEFAULT_SIZES };
    const snapshot = { ...sizes };
    parkViewSize(sizes, "port", "expanded", { w: 999, h: 999 });
    expect(sizes).toEqual(snapshot);
    expect(BLOCK_VIEW_DEFAULT_SIZES.port).toEqual(snapshot.port);
  });

  it("a resize-in-port → switch to expanded → switch back to port round trip returns the resized box", () => {
    const resizedPort = { w: 420, h: 380 };
    const toExpanded = parkViewSize(BLOCK_VIEW_DEFAULT_SIZES, "port", "expanded", resizedPort);
    // Expanded, never having been touched, still reads its own default box.
    expect(toExpanded.size).toEqual(BLOCK_VIEW_DEFAULT_SIZES.expanded);
    expect(toExpanded.sizes.port).toEqual(resizedPort);

    // Switching back without resizing Expanded first: its current box IS
    // its own remembered default, which just gets parked unchanged.
    const backToPort = parkViewSize(toExpanded.sizes, "expanded", "port", toExpanded.size);
    expect(backToPort.size).toEqual(resizedPort);
  });

  it("switching to a view whose box was never touched returns that view's entry from the input bag", () => {
    const result = parkViewSize(BLOCK_VIEW_DEFAULT_SIZES, "simple", "expanded", {
      w: BLOCK_VIEW_DEFAULT_SIZES.simple.w,
      h: BLOCK_VIEW_DEFAULT_SIZES.simple.h,
    });
    expect(result.size).toEqual(BLOCK_VIEW_DEFAULT_SIZES.expanded);
  });
});
