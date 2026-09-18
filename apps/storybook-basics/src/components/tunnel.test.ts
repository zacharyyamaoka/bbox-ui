// src/components/tunnel.test.ts
//
// The first two describes are SystemSketch's own
// `src/blocks/connections/tunnelEdge.test.ts:1-76` (revision `10748b8c`),
// ported with only the import path and `VecLike` -> `Point` changed. They
// are kept as one block, unmodified and unreordered, because they are this
// port's INDEPENDENT ORACLE: they were written against the donor before this
// repo existed, so they cannot have been shaped to fit the port. A change to
// any assertion in them is a change to the contract and should be argued,
// not edited.
//
// Everything below `/* ---- ADDED ---- */` is new coverage for the parts
// this repo added (`tunnelMouths`, the two predicates), plus the boundary
// cases the donor's suite left open.

import { describe, expect, it } from "vitest";

import {
  TUNNEL_MIN_PATH_LENGTH,
  TUNNEL_STUB_LENGTH,
  tunnelDisplayState,
  tunnelHidesRun,
  tunnelMouths,
  tunnelPathPresentation,
  tunnelShowsVias,
  tunnelVisualForPoints,
  type TunnelDisplayState,
} from "./tunnel";
import { polylineLength } from "./trace.layout";

/* ===================== PORTED DONOR SUITE — do not edit ===================== */

describe("tunnel display contract", () => {
  it("keeps an ordinary edge visible and an idle configured tunnel underground", () => {
    expect(tunnelDisplayState({
      enabled: false,
      layer: "",
      focusedLayer: null,
      contextFocused: false,
    })).toBe("off");
    expect(tunnelDisplayState({
      enabled: true,
      layer: "Diagnostics",
      focusedLayer: null,
      contextFocused: false,
    })).toBe("hidden");
  });

  it("previews the whole route on hover or selection without removing its mouths", () => {
    expect(tunnelDisplayState({
      enabled: true,
      layer: "Diagnostics",
      focusedLayer: null,
      contextFocused: true,
    })).toBe("preview");
  });

  it("reveals the active layer and tunnels every edge outside it", () => {
    expect(tunnelDisplayState({
      enabled: true,
      layer: "Diagnostics",
      focusedLayer: "Diagnostics",
      contextFocused: false,
    })).toBe("revealed");
    expect(tunnelDisplayState({
      enabled: false,
      layer: "",
      focusedLayer: "Diagnostics",
      contextFocused: false,
    })).toBe("hidden");
    expect(tunnelDisplayState({
      enabled: false,
      layer: "",
      focusedLayer: "Diagnostics",
      contextFocused: true,
    })).toBe("preview");
  });
});

describe("tunnel path presentation", () => {
  it("draws equal endpoint stubs and places one via at each inner end", () => {
    expect(tunnelPathPresentation(300, false)).toEqual({
      dashArray: `${TUNNEL_STUB_LENGTH} ${300 - TUNNEL_STUB_LENGTH * 2} ${TUNNEL_STUB_LENGTH} 0`,
      viaDistances: [TUNNEL_STUB_LENGTH, 300 - TUNNEL_STUB_LENGTH],
    });
    expect(tunnelVisualForPoints([{ x: 0, y: 0 }, { x: 300, y: 0 }], false)).toMatchObject({
      startVia: { x: 34, y: 0 },
      endVia: { x: 266, y: 0 },
    });
  });

  it("leaves focused, invalid, and short routes fully visible", () => {
    expect(tunnelPathPresentation(300, true)).toBeNull();
    expect(tunnelPathPresentation(Number.NaN, false)).toBeNull();
    expect(tunnelPathPresentation(TUNNEL_MIN_PATH_LENGTH, false)).toBeNull();
    expect(tunnelVisualForPoints([{ x: 0, y: 0 }], false)).toBeNull();
  });
});

/* ---- ADDED ---- */

const ALL_STATES: TunnelDisplayState[] = ["off", "hidden", "preview", "revealed"];

describe("tunnel display state — the whole input space", () => {
  // U1: every one of the four states is REACHED, not merely spelled. The
  // donor's suite covers five of the eight input combinations; this covers
  // all eight and asserts the four states are exactly the image of that set.
  const combinations = [
    // enabled, layer, focusedLayer, contextFocused -> expected
    [false, "", null, false, "off"],
    [false, "", null, true, "off"],
    [true, "A", null, false, "hidden"],
    [true, "A", null, true, "preview"],
    [true, "A", "A", false, "revealed"],
    [true, "A", "A", true, "revealed"],
    [true, "A", "B", false, "hidden"],
    [true, "A", "B", true, "preview"],
  ] as const;

  it.each(combinations)(
    "enabled=%s layer=%s focused=%s context=%s -> %s",
    (enabled, layer, focusedLayer, contextFocused, expected) => {
      expect(tunnelDisplayState({ enabled, layer, focusedLayer, contextFocused })).toBe(expected);
    },
  );

  it("reaches all four states across that space", () => {
    const reached = new Set(
      combinations.map(([enabled, layer, focusedLayer, contextFocused]) =>
        tunnelDisplayState({ enabled, layer, focusedLayer, contextFocused }),
      ),
    );
    expect([...reached].sort()).toEqual([...ALL_STATES].sort());
  });

  it("a focused layer outranks `enabled` — that is what tunnels non-tunnel edges", () => {
    // The branch order is load-bearing (tunnel.ts says so). If `enabled`
    // were checked first, focusing a layer could never affect an edge that
    // was not already a tunnel, and "layer focus tunnels other edges" — the
    // headline behaviour — would not exist.
    expect(tunnelDisplayState({
      enabled: false, layer: "A", focusedLayer: "B", contextFocused: false,
    })).toBe("hidden");
  });

  it("layer focus is case- and identity-EXACT, unlike the picker", () => {
    // `canonicalSceneLayer` (scene/layers.ts) is what folds case; by the
    // time a layer name reaches here it is already canonical, so this
    // function compares exactly. Pinned so a future "helpful" fold here
    // cannot quietly make the two disagree.
    expect(tunnelDisplayState({
      enabled: true, layer: "diagnostics", focusedLayer: "Diagnostics", contextFocused: false,
    })).toBe("hidden");
  });
});

describe("tunnel state predicates", () => {
  it("only `hidden` hides the run", () => {
    expect(ALL_STATES.filter(tunnelHidesRun)).toEqual(["hidden"]);
  });

  it("`hidden` and `preview` both keep their mouths — the donor's whole point", () => {
    expect(ALL_STATES.filter(tunnelShowsVias)).toEqual(["hidden", "preview"]);
  });
});

describe("tunnel mouths", () => {
  const straight = [{ x: 0, y: 0 }, { x: 300, y: 0 }];

  it("draws two stubs of exactly one stub-length each", () => {
    const mouths = tunnelMouths(straight, false)!;
    expect(mouths).not.toBeNull();
    expect(polylineLength(mouths.start)).toBeCloseTo(TUNNEL_STUB_LENGTH, 6);
    expect(polylineLength(mouths.end)).toBeCloseTo(TUNNEL_STUB_LENGTH, 6);
  });

  it("the drawn total is shorter than the route it replaces", () => {
    const mouths = tunnelMouths(straight, false)!;
    const drawn = polylineLength(mouths.start) + polylineLength(mouths.end);
    expect(drawn).toBeLessThan(polylineLength(straight));
    expect(drawn).toBeCloseTo(TUNNEL_STUB_LENGTH * 2, 6);
  });

  it("keeps both real endpoints — a tunnel is not a detached cable", () => {
    const mouths = tunnelMouths(straight, false)!;
    expect(mouths.start[0]).toEqual({ x: 0, y: 0 });
    expect(mouths.end[mouths.end.length - 1]).toEqual({ x: 300, y: 0 });
  });

  it("the mouths end exactly where the vias sit — one derivation, not two", () => {
    const mouths = tunnelMouths(straight, false)!;
    const visual = tunnelVisualForPoints(straight, false)!;
    expect(mouths.start[mouths.start.length - 1]).toEqual(visual.startVia);
    expect(mouths.end[0]).toEqual(visual.endVia);
    expect(mouths.startVia).toEqual(visual.startVia);
    expect(mouths.endVia).toEqual(visual.endVia);
  });

  it("keeps interior vertices that fall inside a mouth, and drops the rest", () => {
    // An elbow whose first corner is 20px out: the corner is INSIDE the
    // 34px start stub, so the mouth must bend with it rather than cutting
    // the corner. The far corner is in the hidden middle and must go.
    const elbow = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 200 },
      { x: 300, y: 200 },
    ];
    const mouths = tunnelMouths(elbow, false)!;
    expect(mouths.start).toHaveLength(3);
    expect(mouths.start[0]).toEqual({ x: 0, y: 0 });
    expect(mouths.start[1]).toEqual({ x: 20, y: 0 });
    expect(mouths.start[2].x).toBeCloseTo(20, 6);
    expect(mouths.start[2].y).toBeCloseTo(14, 6);
    expect(polylineLength(mouths.start)).toBeCloseTo(TUNNEL_STUB_LENGTH, 6);
    expect(mouths.end[mouths.end.length - 1]).toEqual({ x: 300, y: 200 });
    expect(polylineLength(mouths.end)).toBeCloseTo(TUNNEL_STUB_LENGTH, 6);
  });

  it("returns null on exactly the conditions the donor's presentation does", () => {
    expect(tunnelMouths(straight, true)).toBeNull();
    expect(tunnelMouths([{ x: 0, y: 0 }], false)).toBeNull();
    // Exactly at the minimum is still too short — `<=`, the donor's own
    // boundary, kept.
    expect(tunnelMouths([{ x: 0, y: 0 }, { x: TUNNEL_MIN_PATH_LENGTH, y: 0 }], false)).toBeNull();
    expect(
      tunnelMouths([{ x: 0, y: 0 }, { x: TUNNEL_MIN_PATH_LENGTH + 1, y: 0 }], false),
    ).not.toBeNull();
  });
});
