import { describe, expect, it } from "vitest";

import {
  CAMERA_EPSILON,
  camerasAgree,
  htmlLayerOffset,
  originShift,
  reactFlowToTldraw,
  tldrawToReactFlow,
  viewportsAgree,
} from "../src/cameraBridge";

// The zoom range the linked panes can actually reach — tldraw clamps its
// camera to its zoomSteps' extremes [0.05, 8], and the React Flow pane is
// pinned to the same bounds in App.tsx.
const ZOOMS = [0.05, 0.1, 0.25, 0.45, 0.5, 1, 1.5, 2, 4, 8];

describe("html layer offset (tldraw's zoom-dependent nudge)", () => {
  it("reproduces the two modulated segments and their clamps", () => {
    expect(htmlLayerOffset(0.1)).toBeCloseTo(-2, 12);
    expect(htmlLayerOffset(0.05)).toBeCloseTo(-2, 12); // clamped below 0.1
    expect(htmlLayerOffset(1)).toBeCloseTo(0.125, 12);
    expect(htmlLayerOffset(8)).toBeCloseTo(0.5, 12);
    expect(htmlLayerOffset(16)).toBeCloseTo(0.5, 12); // clamped above 8
    // Midpoints of each segment, straight-line interpolation.
    expect(htmlLayerOffset(0.55)).toBeCloseTo(-2 + 0.5 * 2.125, 12);
    expect(htmlLayerOffset(4.5)).toBeCloseTo(0.125 + 0.5 * 0.375, 12);
  });

  it("is continuous where the segments meet at z=1", () => {
    expect(htmlLayerOffset(1 - 1e-9)).toBeCloseTo(htmlLayerOffset(1), 6);
  });
});

describe("origin shift (the 1×1 layer scaling about its centre)", () => {
  it("vanishes at z=1 and equals 0.5·(1−z) elsewhere", () => {
    expect(originShift(1)).toBe(0);
    expect(originShift(0.45)).toBeCloseTo(0.275, 12);
    expect(originShift(2)).toBeCloseTo(-0.5, 12);
  });
});

describe("react flow viewport → tldraw camera", () => {
  it("keeps the zoom axis untouched in both directions", () => {
    for (const zoom of ZOOMS) {
      expect(reactFlowToTldraw({ x: 50, y: 90, zoom }).z).toBe(zoom);
      expect(tldrawToReactFlow({ x: 50, y: 90, z: zoom }).zoom).toBe(zoom);
    }
  });

  it("reproduces the calibration measured at the old pinned camera", () => {
    // The harness's original pinned framing — ORIGIN (50, 90) at zoom 0.45 —
    // is the configuration whose divergence was measured at 0.00px. The
    // bridge must keep emitting exactly the camera that measurement blessed.
    const camera = reactFlowToTldraw({ x: 50, y: 90, zoom: 0.45 });
    expect(camera.x).toBeCloseTo((50 - 0.275) / 0.45 + 1.1736111111111112, 10);
    expect(camera.y).toBeCloseTo((90 - 0.275) / 0.45 + 1.1736111111111112, 10);
    expect(camera.z).toBe(0.45);
  });

  it("degenerates to a plain divide at z=1 up to the constant nudge", () => {
    // At z=1 both hosts scale by 1, so the only disagreement left is the
    // constant 0.125 layer nudge — no zoom-dependent terms survive.
    const camera = reactFlowToTldraw({ x: 120, y: -40, zoom: 1 });
    expect(camera.x).toBeCloseTo(120 - 0.125, 12);
    expect(camera.y).toBeCloseTo(-40 - 0.125, 12);
  });
});

describe("round trips", () => {
  it("viewport → camera → viewport is identity within epsilon", () => {
    for (const zoom of ZOOMS) {
      for (const [x, y] of [
        [0, 0],
        [50, 90],
        [-333.25, 812.5],
        [1e5, -1e5],
      ]) {
        const viewport = { x, y, zoom };
        const roundTrip = tldrawToReactFlow(reactFlowToTldraw(viewport));
        expect(viewportsAgree(roundTrip, viewport)).toBe(true);
      }
    }
  });

  it("camera → viewport → camera is identity within epsilon", () => {
    for (const z of ZOOMS) {
      for (const [x, y] of [
        [0, 0],
        [110.5, 200.75],
        [-4096, 17.3],
      ]) {
        const camera = { x, y, z };
        const roundTrip = reactFlowToTldraw(tldrawToReactFlow(camera));
        expect(camerasAgree(roundTrip, camera)).toBe(true);
      }
    }
  });
});

describe("agreement predicates", () => {
  it("tolerate float noise but reject a real difference", () => {
    const camera = { x: 100, y: 100, z: 0.45 };
    expect(camerasAgree(camera, { ...camera, x: 100 + CAMERA_EPSILON / 2 })).toBe(true);
    expect(camerasAgree(camera, { ...camera, x: 100.001 })).toBe(false);
    const viewport = { x: 50, y: 90, zoom: 2 };
    expect(viewportsAgree(viewport, { ...viewport, y: 90 + CAMERA_EPSILON / 2 })).toBe(true);
    expect(viewportsAgree(viewport, { ...viewport, zoom: 2.001 })).toBe(false);
  });
});
