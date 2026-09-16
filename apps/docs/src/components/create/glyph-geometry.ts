import type { CanvasPosition } from "./contract";

/**
 * The two facts the create page has to know about tldraw's coordinate
 * conventions, kept in one pure module so the canvas that WRITES shapes and
 * the Code view that PRINTS them can never disagree.
 *
 * WHY: tldraw rotates a shape about its own origin (`shape.x,y`, the page
 * anchor of local (0,0)), while React Flow's `bboxGlyph` node and the DOM
 * wrapper rotate about the box's centre (`transform-origin: center`), and
 * `positions[id]` is that never-moving top-left. The audit measured a 13 px
 * divergence at 45° / size 18 when this was left unconverted, and a second
 * round found the Code view printing the unconverted `positions` value as
 * the shape's x/y — a record that would not reproduce the canvas.
 */
export function tldrawOriginFor(pos: CanvasPosition, rotationRad: number, size: number): CanvasPosition {
  const half = size / 2;
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  return {
    x: pos.x + half - (half * cos - half * sin),
    y: pos.y + half - (half * sin + half * cos),
  };
}

/** The inverse of `tldrawOriginFor` — recovers the centre-pivot top-left
 *  `positions` value from tldraw's own origin-pivot `shape.x,y`. */
export function centrePivotFor(origin: CanvasPosition, rotationRad: number, size: number): CanvasPosition {
  const half = size / 2;
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  return {
    x: origin.x + (half * cos - half * sin) - half,
    y: origin.y + (half * sin + half * cos) - half,
  };
}

/**
 * Wrap a degree value into (-180, 180] — the domain `HOST_FIELDS`' rotation
 * row declares (`min -180, max 180`), which the browser enforces on every
 * keystroke and spinner click. tldraw hands back [0, 360), so a handle
 * dragged past half a turn would otherwise arrive as 314° and be clamped to
 * 180 by the first scrub.
 *
 * WHY the half-open interval is closed at +180 and not -180: typing 180 into
 * the row must read back 180, not -180 (audit minor) — the two are the same
 * angle, but the row is a control and a control must echo what was typed.
 */
export function normalizeDeg(deg: number): number {
  const wrapped = ((deg % 360) + 360) % 360;
  return wrapped > 180 ? wrapped - 360 : wrapped;
}
