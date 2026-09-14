import { describe, expect, it } from "vitest";

import { BLOCK_VIEW_DEFAULT_SIZES } from "@bbox-ui/core";

import { applyBlockShapeView, BBoxBlockShapeUtil, type BBoxBlockShape, type BBoxBlockShapeProps } from "../src/block-shape-util";

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

/**
 * `onResize` regression: tldraw's `resizeBox` returns a PARTIAL props bag
 * (`{ w, h }` only) even though its declared type says full props — reading
 * `view` off the RESIZED shape therefore sees `undefined`, skips the null
 * guard, and writes a literal "undefined" key into `views`, which the
 * shape validator rejects and the whole resize gesture dies. Caught live by
 * demos/capture-block-views-hosts.mjs; pinned here so a refactor cannot
 * reintroduce it. `onResize` never touches `this`, so calling it unbound is
 * safe and avoids constructing an Editor.
 */
describe("BBoxBlockShapeUtil.onResize", () => {
  const shapeWith = (props: BBoxBlockShapeProps): BBoxBlockShape =>
    ({ id: "shape:test", type: "bbox-block", x: 0, y: 0, rotation: 0, props } as unknown as BBoxBlockShape);
  const grow = { handle: "bottom_right", newPoint: { x: 0, y: 0 }, scaleX: 1.5, scaleY: 1.5 };

  it("parks the resized box under the ORIGINAL shape's view, never a stale partial", () => {
    const props = applyBlockShapeView(baseProps(), "expanded");
    const resized = BBoxBlockShapeUtil.prototype.onResize.call(
      undefined,
      shapeWith(props),
      grow as never,
    ) as { props: Partial<BBoxBlockShapeProps> };
    const views = resized.props.views!;
    expect(Object.keys(views).sort()).toEqual(["expanded", "port", "simple"]);
    expect(views.expanded).toEqual({ w: resized.props.w, h: resized.props.h });
  });

  it("leaves a legacy (view: null) shape's resize untouched — no views bag appears", () => {
    const resized = BBoxBlockShapeUtil.prototype.onResize.call(
      undefined,
      shapeWith(baseProps()),
      grow as never,
    ) as { props: Partial<BBoxBlockShapeProps> };
    expect("views" in resized.props).toBe(false);
  });
});
