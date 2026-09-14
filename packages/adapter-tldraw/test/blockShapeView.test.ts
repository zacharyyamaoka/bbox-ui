import { describe, expect, it } from "vitest";

import { BLOCK_VIEW_DEFAULT_SIZES } from "@bbox-ui/core";

import { applyBlockShapeView, type BBoxBlockShapeProps } from "../src/block-shape-util";

/**
 * `applyBlockShapeView` is the tldraw-adapter half of the P2 "views are
 * presets" lockstep rule (block-shape-util.tsx's own WHY): one shared
 * `parkViewSize` across every host adapter, so switching Simple → Port →
 * Expanded → back to Port always restores Port's own remembered box, never
 * whatever box happened to be live when the switch away from it fired.
 */
function baseProps(overrides: Partial<BBoxBlockShapeProps> = {}): BBoxBlockShapeProps {
  return {
    w: 384,
    h: 258,
    title: "Detect",
    titleSize: "xl",
    blockType: "dataflow",
    description: "",
    icon: "",
    tag: "",
    orientation: "horizontal",
    ports: [],
    view: null,
    views: null,
    ...overrides,
  };
}

describe("applyBlockShapeView", () => {
  it("engages a view from the legacy (view: null) shape at that view's default box", () => {
    const next = applyBlockShapeView(baseProps(), "port");
    expect(next.view).toBe("port");
    expect(next.w).toBe(BLOCK_VIEW_DEFAULT_SIZES.port.w);
    expect(next.h).toBe(BLOCK_VIEW_DEFAULT_SIZES.port.h);
    // The box the legacy shape was AT gets parked under "simple" — so
    // switching back to Simple returns exactly where it started, not
    // BLOCK_VIEW_DEFAULT_SIZES.simple.
    expect(next.views?.simple).toEqual({ w: 384, h: 258 });
  });

  it("parks the CURRENT (possibly resized) box under the view being left", () => {
    // A shape resized while on "port" — onResize's own lockstep would have
    // written this into props.views.port already; applyBlockShapeView must
    // park the LIVE w/h, not the stale remembered one.
    const resizedOnPort = baseProps({
      view: "port",
      views: { ...BLOCK_VIEW_DEFAULT_SIZES, port: { w: 500, h: 400 } },
      w: 500,
      h: 400,
    });
    const next = applyBlockShapeView(resizedOnPort, "expanded");
    expect(next.views?.port).toEqual({ w: 500, h: 400 });
    expect(next.w).toBe(BLOCK_VIEW_DEFAULT_SIZES.expanded.w);
    expect(next.h).toBe(BLOCK_VIEW_DEFAULT_SIZES.expanded.h);
  });

  it("round-trips: switch away and back restores the exact box", () => {
    const onSimple = baseProps({
      view: "simple",
      views: BLOCK_VIEW_DEFAULT_SIZES,
      w: 384,
      h: 258,
    });
    const onPort = applyBlockShapeView(onSimple, "port");
    // Simulate a live resize on "port", kept current the way onResize does.
    const resizedOnPort: BBoxBlockShapeProps = {
      ...onPort,
      w: 420,
      h: 360,
      views: { ...(onPort.views ?? BLOCK_VIEW_DEFAULT_SIZES), port: { w: 420, h: 360 } },
    };
    const toExpanded = applyBlockShapeView(resizedOnPort, "expanded");
    const backToPort = applyBlockShapeView(toExpanded, "port");
    expect(backToPort.w).toBe(420);
    expect(backToPort.h).toBe(360);
  });

  it("seeds views from BLOCK_VIEW_DEFAULT_SIZES when views is still null", () => {
    const next = applyBlockShapeView(baseProps({ views: null }), "expanded");
    expect(next.views).toEqual({
      ...BLOCK_VIEW_DEFAULT_SIZES,
      simple: { w: 384, h: 258 },
    });
  });
});
