// src/components/trace.address.test.ts — new coverage for the D4 path-
// addressing seam added to ./trace.layout.ts (resolvePathAddress,
// tangentAtFraction, separateAlongPath) and the way ./traceBadge.tsx now
// speaks it via a widened `t?: PathAddress`.
//
// Every fixture below is a straight 100px (or 200px, where noted)
// horizontal polyline, so arc length equals x-displacement and the
// expected fractions can be checked by hand. Acceptance assertions R4a-c
// (this lane's brief) are reproduced verbatim as the three top-level
// describes.

import { describe, expect, it } from "vitest";

import {
  clampLabelPosition,
  polylineLength,
  resolvePathAddress,
  separateAlongPath,
  tangentAtFraction,
  type Point,
} from "./trace.layout";

const STRAIGHT_100: Point[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
];

describe("resolvePathAddress — R4a", () => {
  it("resolves a plain fraction unchanged", () => {
    expect(resolvePathAddress(STRAIGHT_100, 0.25)).toBeCloseTo(0.25);
  });

  it("resolves a negative fraction as 1 + f — OURS, not a JointJS port", () => {
    expect(resolvePathAddress(STRAIGHT_100, -0.25)).toBeCloseTo(0.75);
  });

  it("resolves {px} from the start", () => {
    expect(resolvePathAddress(STRAIGHT_100, { px: 30 })).toBeCloseTo(0.3);
  });

  it("resolves negative {px} from the END — behaviour-derived from JointJS Path.pointAtLength", () => {
    expect(resolvePathAddress(STRAIGHT_100, { px: -24 })).toBeCloseTo(0.76);
  });

  it("clamps an out-of-range positive fraction to 1", () => {
    expect(resolvePathAddress(STRAIGHT_100, 2)).toBe(1);
  });

  it("clamps an out-of-range negative fraction to 0", () => {
    expect(resolvePathAddress(STRAIGHT_100, -3)).toBe(0);
  });

  it("clamps an out-of-range positive {px} to 1", () => {
    expect(resolvePathAddress(STRAIGHT_100, { px: 250 })).toBe(1);
  });

  it("clamps an out-of-range negative {px} to 0", () => {
    expect(resolvePathAddress(STRAIGHT_100, { px: -250 })).toBe(0);
  });

  it("treats -0 as 0, not as the end (the documented -0 < 0 === false case)", () => {
    expect(resolvePathAddress(STRAIGHT_100, -0)).toBe(0);
  });

  it("resolves the literal end via a plain 1, not via a negative", () => {
    expect(resolvePathAddress(STRAIGHT_100, 1)).toBe(1);
  });

  it("degenerates to 0 on an empty polyline rather than dividing by zero", () => {
    expect(resolvePathAddress([], { px: 10 })).toBe(0);
    expect(resolvePathAddress([{ x: 5, y: 5 }], { px: -10 })).toBe(0);
  });
});

describe("tangentAtFraction", () => {
  it("is a unit vector along a horizontal segment", () => {
    const tangent = tangentAtFraction(STRAIGHT_100, 0.5);
    expect(tangent).toEqual({ x: 1, y: 0 });
  });

  it("is a unit vector on every segment of a bent polyline", () => {
    const bent: Point[] = [
      { x: 0, y: 0 },
      { x: 0, y: 50 },
      { x: 50, y: 50 },
    ];
    const onFirstLeg = tangentAtFraction(bent, 0.1);
    expect(Math.hypot(onFirstLeg.x, onFirstLeg.y)).toBeCloseTo(1);
    expect(onFirstLeg).toEqual({ x: 0, y: 1 });

    const onSecondLeg = tangentAtFraction(bent, 0.9);
    expect(Math.hypot(onSecondLeg.x, onSecondLeg.y)).toBeCloseTo(1);
    expect(onSecondLeg).toEqual({ x: 1, y: 0 });
  });

  it("falls back to a non-degenerate segment when the chosen one has zero length", () => {
    const repeated: Point[] = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const tangent = tangentAtFraction(repeated, 0);
    expect(Math.hypot(tangent.x, tangent.y)).toBeCloseTo(1);
  });

  it("never throws on fewer than two points", () => {
    expect(tangentAtFraction([], 0.5)).toEqual({ x: 1, y: 0 });
    expect(tangentAtFraction([{ x: 1, y: 1 }], 0.5)).toEqual({ x: 1, y: 0 });
  });
});

describe("separateAlongPath — R4b", () => {
  it("leaves a pinned pill unmoved and yields the colliding mark by at least gapPx", () => {
    const resolved = separateAlongPath(
      200,
      [
        { t: 0.5, widthPx: 40, pinned: true },
        { t: 0.5, widthPx: 16 },
      ],
      8,
    );
    expect(resolved[0]).toBeCloseTo(0.5);
    expect(resolved[1]).not.toBeCloseTo(0.5, 3);

    const pinnedEdges = { lo: 0.5 * 200 - 20, hi: 0.5 * 200 + 20 };
    const markCenterPx = resolved[1] * 200;
    const markEdges = { lo: markCenterPx - 8, hi: markCenterPx + 8 };
    const clearance = markEdges.lo >= pinnedEdges.hi ? markEdges.lo - pinnedEdges.hi : pinnedEdges.lo - markEdges.hi;
    expect(clearance).toBeGreaterThanOrEqual(8 - 1e-6);
  });

  it("does not move anything when nothing collides", () => {
    const resolved = separateAlongPath(200, [
      { t: 0.2, widthPx: 10 },
      { t: 0.8, widthPx: 10 },
    ]);
    expect(resolved[0]).toBeCloseTo(0.2);
    expect(resolved[1]).toBeCloseTo(0.8);
  });

  it("keeps every result clamped to [0, 1] even when pushed past an end", () => {
    const resolved = separateAlongPath(
      100,
      [
        { t: 1, widthPx: 20, pinned: true },
        { t: 1, widthPx: 20 },
      ],
      8,
    );
    expect(resolved[1]).toBeGreaterThanOrEqual(0);
    expect(resolved[1]).toBeLessThanOrEqual(1);
  });

  it("degrades to 0 for every placement on a zero-length path instead of dividing by zero", () => {
    const resolved = separateAlongPath(0, [{ t: 0.5, widthPx: 10 }]);
    expect(resolved).toEqual([0]);
  });
});

describe("TraceBadge's plain-number contract survives the widened type — R4c", () => {
  it("a plain number inside [0,1] resolves through resolvePathAddress unchanged, so composing it with clampLabelPosition (TraceBadge's own order) matches calling clampLabelPosition alone", () => {
    // TraceBadge now resolves `t` through resolvePathAddress and THEN
    // through clampLabelPosition (its pre-existing 0.05..0.95 band,
    // untouched) — never the reverse. For any number already in [0,1],
    // resolvePathAddress is the identity, so this composition is
    // byte-for-byte what every pre-existing traceBadge.tsx test already
    // exercised by calling clampLabelPosition on the raw prop.
    for (const t of [0, 0.05, 0.2, 0.5, 0.95, 1]) {
      expect(resolvePathAddress(STRAIGHT_100, t)).toBe(t);
      expect(clampLabelPosition(resolvePathAddress(STRAIGHT_100, t))).toBe(clampLabelPosition(t));
    }
  });
});

describe("polylineLength sanity (fixture check)", () => {
  it("the straight fixture really is 100px", () => {
    expect(polylineLength(STRAIGHT_100)).toBe(100);
  });
});
