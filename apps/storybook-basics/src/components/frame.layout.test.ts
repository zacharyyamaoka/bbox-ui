// src/components/frame.layout.test.ts — the wall ↔ rail conversion and the
// two insertion modes, against a frame whose numbers are readable by eye.

import { describe, expect, it } from "vitest";

import { PORT_EDGE_SLOT_MIN_PX, RAIL_END_MARGIN_PX, RAIL_MAIN_INSET_PX } from "./blockPort.layout";
import { fitBoxToMembers, frameRailBox, insertPortAtWall, wallSlotOffset, wallTOfSlot, wallTrack, type FrameBox } from "./frame.layout";
import { MIN_PORT_GAP_PX } from "./portSpacing.layout";

/** A 400 × 300 box whose top-left sits at (0, 20) in the root (a 20px
 *  title above it). */
const BOX: FrameBox = { left: 0, top: 20, width: 400, height: 300, headerPx: 0 };
const SLOT = PORT_EDGE_SLOT_MIN_PX;
const EVENLY = { mode: "distribute" as const, scheme: "space-evenly" as const };

describe("frameRailBox / wallTrack", () => {
  it("the left rail's content box spans the wall minus the corner clearance, and the track says so", () => {
    const rail = frameRailBox("left", BOX);
    expect(rail.top).toBe(20 + RAIL_END_MARGIN_PX - RAIL_MAIN_INSET_PX);
    expect(rail.height).toBe(300 - 2 * RAIL_END_MARGIN_PX + 2 * RAIL_MAIN_INSET_PX);
    const track = wallTrack("left", BOX);
    expect(track).toEqual({ contentStart: 20 + RAIL_END_MARGIN_PX, contentLength: 300 - 2 * RAIL_END_MARGIN_PX, wallStart: 20, wallLength: 300 });
  });

  it("a header bar pushes the column walls' rails into the body band; row walls span the box", () => {
    const withHeader: FrameBox = { ...BOX, headerPx: 32 };
    expect(wallTrack("left", withHeader).contentStart).toBe(20 + 32 + RAIL_END_MARGIN_PX);
    expect(wallTrack("top", withHeader).contentStart).toBe(RAIL_END_MARGIN_PX);
    expect(wallTrack("top", withHeader).wallLength).toBe(400);
  });
});

describe("wallSlotOffset ↔ wallTOfSlot", () => {
  const track = wallTrack("left", BOX);

  it("centres the slot on the wall point, and round-trips", () => {
    // t = 0.5 → wall y = 20 + 150 = 170 → content-relative 170 - 38 = 132 → leading 120.
    expect(wallSlotOffset(0.5, track)).toBe(170 - track.contentStart - SLOT / 2);
    expect(wallTOfSlot(wallSlotOffset(0.5, track), track)).toBeCloseTo(0.5, 10);
    expect(wallTOfSlot(wallSlotOffset(0.31, track), track)).toBeCloseTo(0.31, 10);
  });

  it("clamps a corner crossing to the end of the track instead of refusing it", () => {
    expect(wallSlotOffset(0, track)).toBe(0);
    expect(wallSlotOffset(1, track)).toBe(track.contentLength - SLOT);
  });
});

describe("insertPortAtWall — auto vs custom", () => {
  const track = wallTrack("left", BOX);

  it("AUTO: the new port takes the index its t implies, then the wall re-spaces every port evenly", () => {
    // Two existing ports, space-evenly: centres at 1/3 and 2/3 of the track.
    const result = insertPortAtWall({ order: ["a", "b"], mode: "auto", distribution: EVENLY, track, id: "new", t: 0.5 });
    expect(result.order).toEqual(["a", "new", "b"]);
    // Three ports evenly spaced: the middle one sits at the track's centre —
    // it MOVED from t = 0.5 on the wall to the evenly-spaced slot (which here
    // coincides, since the track is centred on the wall) and the outer two
    // moved outward.
    const gap = (track.contentLength - 3 * SLOT) / 4;
    expect(result.offsets.a).toBeCloseTo(gap, 6);
    expect(result.offsets.new).toBeCloseTo(2 * gap + SLOT, 6);
    expect(result.offsets.b).toBeCloseTo(3 * gap + 2 * SLOT, 6);
    // A port dropped near the top goes first; near the bottom, last.
    expect(insertPortAtWall({ order: ["a", "b"], mode: "auto", distribution: EVENLY, track, id: "top", t: 0.05 }).order).toEqual(["top", "a", "b"]);
    expect(insertPortAtWall({ order: ["a", "b"], mode: "auto", distribution: EVENLY, track, id: "end", t: 0.95 }).order).toEqual(["a", "b", "end"]);
  });

  it("CUSTOM: the new port stays at the intersection, and only its neighbours' order and the minimum gap can move it", () => {
    const offsets = { a: 10, b: 200 };
    const free = insertPortAtWall({ order: ["a", "b"], offsets, mode: "custom", distribution: EVENLY, track, id: "new", t: 0.5 });
    expect(free.order).toEqual(["a", "new", "b"]);
    expect(free.offsets.new).toBe(wallSlotOffset(0.5, track));
    expect(free.offsets.a).toBe(10);
    expect(free.offsets.b).toBe(200);
    expect(free.t).toBeCloseTo(0.5, 10);

    // Dropped ON `a`: order says after `a`, the gap says one MIN_PORT_GAP_PX below it.
    const tA = wallTOfSlot(10, track);
    const tight = insertPortAtWall({ order: ["a", "b"], offsets, mode: "custom", distribution: EVENLY, track, id: "new", t: tA + 0.001 });
    expect(tight.order).toEqual(["a", "new", "b"]);
    expect(tight.offsets.new).toBe(10 + MIN_PORT_GAP_PX);
    expect(tight.offsets.a).toBe(10);
  });

  it("an id already on the wall is a no-op on the order", () => {
    const result = insertPortAtWall({ order: ["a"], mode: "auto", distribution: EVENLY, track, id: "a", t: 0.9 });
    expect(result.order).toEqual(["a"]);
  });
});

describe("fitBoxToMembers", () => {
  it("hugs the members' union plus padding, never below the minimum", () => {
    expect(fitBoxToMembers([], 12, { width: 100, height: 80 })).toEqual({ width: 100, height: 80 });
    expect(
      fitBoxToMembers(
        [
          { x: 10, y: 10, w: 100, h: 40 },
          { x: 150, y: 60, w: 80, h: 30 },
        ],
        12,
        { width: 100, height: 80 },
      ),
    ).toEqual({ width: 230 + 12, height: 90 + 12 });
  });
});
