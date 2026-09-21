/**
 * Unit cover for the press → click|drag sensing. Pure arithmetic, so it
 * runs in the `unit` project with no browser.
 *
 * The one assertion that matters most is `arms from cold` — Zach's
 * requirement is that a press on a never-selected thing becomes a move,
 * and a test that only checked "a selected thing moves" would pass while
 * the product felt like a form.
 */

import { describe, expect, it } from "vitest";

import {
  cancel,
  dragDelta,
  IDLE,
  move,
  press,
  release,
  thresholdFor,
  travelled,
} from "./dragIntent";
import { CANVAS_DRAG_INTENT_PX, DRAG_DECLARATIONS, INNER_CLAIM_PX, resolveGrab, type GrabResolution } from "./dragPolicy";

const at = (x: number, y: number) => ({ x, y });
const GRAB: GrabResolution = resolveGrab([{ slot: "block-header" }, { declares: "block:expanded" }]);
const INERT: GrabResolution = resolveGrab([{}, { declares: "block:expanded" }]);
const OWNED: GrabResolution = resolveGrab([{ slot: "code-editor" }, { declares: "block:expanded" }]);

describe("thresholdFor", () => {
  it("gives the canvas 4px and an inner owner 3px", () => {
    expect(thresholdFor({ owner: "canvas" })).toBe(CANVAS_DRAG_INTENT_PX);
    expect(thresholdFor({ owner: "inner" })).toBe(INNER_CLAIM_PX);
  });
  it("gives a coarse pointer the coarse threshold", () => {
    expect(thresholdFor({ coarse: true })).toBe(6);
  });
  it("defaults to the canvas threshold", () => {
    expect(thresholdFor()).toBe(CANVAS_DRAG_INTENT_PX);
  });
});

describe("press", () => {
  it("arms on a grab surface", () => {
    expect(press(at(10, 10), GRAB).phase).toBe("pressed");
  });
  it("does NOT arm on an inert surface", () => {
    expect(press(at(10, 10), INERT).phase).toBe("idle");
  });
  it("does NOT arm on a pointer-owning surface", () => {
    expect(press(at(10, 10), OWNED).phase).toBe("idle");
  });
  it("remembers the origin, so travel is measured from the finger's landing", () => {
    expect(press(at(7, 9), GRAB).origin).toEqual(at(7, 9));
  });
});

describe("move — the threshold", () => {
  const start = press(at(100, 100), GRAB);

  it("stays a click at exactly the threshold (strictly greater to commit)", () => {
    expect(move(start, at(104, 100)).phase).toBe("pressed");
  });
  it("becomes a drag one pixel past it", () => {
    expect(move(start, at(105, 100)).phase).toBe("dragging");
  });
  it("stays a click well inside it", () => {
    expect(move(start, at(102, 101)).phase).toBe("pressed");
  });
  it("measures diagonally, not per-axis", () => {
    // 3,3 -> 4.24px, past 4
    expect(move(start, at(103, 103)).phase).toBe("dragging");
    // 2,2 -> 2.83px, inside 4
    expect(move(start, at(102, 102)).phase).toBe("pressed");
  });
  it("never uncommits once it is a drag", () => {
    const dragging = move(start, at(140, 130));
    expect(dragging.phase).toBe("dragging");
    expect(move(dragging, at(100, 100)).phase).toBe("dragging");
  });
  it("ignores movement with no press in flight", () => {
    expect(move(IDLE, at(500, 500))).toBe(IDLE);
  });
  it("an inner owner commits 1px earlier than the canvas", () => {
    const inner = press(at(0, 0), GRAB, { owner: "inner" });
    const canvas = press(at(0, 0), GRAB, { owner: "canvas" });
    expect(move(inner, at(4, 0)).phase).toBe("dragging");
    expect(move(canvas, at(4, 0)).phase).toBe("pressed");
  });
});

describe("travelled", () => {
  it("is euclidean from the origin", () => {
    expect(travelled(press(at(0, 0), GRAB), at(3, 4))).toBe(5);
  });
  it("is zero with no press", () => {
    expect(travelled(IDLE, at(3, 4))).toBe(0);
  });
});

describe("dragDelta — the thing tracks the finger", () => {
  /**
   * Measured from the ORIGIN, deliberately unlike React Flow, which
   * measures from the threshold-crossing point
   * (`@xyflow/system:2255-2256`) and so lags the pointer by the first move
   * event's delta — measured in this lane at 34px for a 40px 6-step drag.
   */
  it("equals the full pointer travel, not travel-minus-threshold", () => {
    let s = press(at(100, 100), GRAB);
    s = move(s, at(106, 103));
    s = move(s, at(140, 125));
    expect(dragDelta(s)).toEqual(at(40, 25));
  });
  it("is zero while the gesture is still a click", () => {
    expect(dragDelta(move(press(at(0, 0), GRAB), at(2, 0)))).toEqual(at(0, 0));
  });
});

describe("release — Zach's requirement, and the two-click rule", () => {
  const expanded = DRAG_DECLARATIONS["block:expanded"];

  /** THE requirement. `PROJECT - Black Box UI.md:2504`. */
  it("moves a thing that was never selected, from one press-and-drag", () => {
    let s = press(at(0, 0), GRAB, {});
    s = move(s, at(60, 40));
    const out = release(s, { wasActive: false, declaration: expanded });
    expect(out).toEqual({ kind: "moved", delta: at(60, 40) });
  });

  /** The corollary that makes it feel right: a drag NEVER edits. Donor:
   *  blockClickToEdit.ts:131-135 + smoke test :261-270. */
  it("opens no editor when a press on an ACTIVE thing became a drag", () => {
    let s = press(at(0, 0), GRAB, {});
    s = move(s, at(60, 40));
    expect(release(s, { wasActive: true, declaration: expanded }).kind).toBe("moved");
  });

  it("a click on a cold thing activates it and nothing else", () => {
    const s = move(press(at(0, 0), GRAB), at(1, 1));
    expect(release(s, { wasActive: false, declaration: expanded })).toEqual({ kind: "clicked", outcome: { kind: "activate" } });
  });

  it("a click on an already-active thing edits the part under the pointer", () => {
    const s = move(press(at(0, 0), GRAB), at(1, 1));
    expect(release(s, { wasActive: true, declaration: expanded })).toEqual({ kind: "clicked", outcome: { kind: "edit", part: "block-header" } });
  });

  it("ignores a release that never armed", () => {
    expect(release(press(at(0, 0), OWNED), { wasActive: false }).kind).toBe("ignored");
  });
});

describe("cancel", () => {
  it("rolls the whole gesture back to idle", () => {
    expect(cancel()).toBe(IDLE);
  });
});
