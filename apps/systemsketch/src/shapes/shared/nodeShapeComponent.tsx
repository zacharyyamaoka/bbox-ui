// src/shapes/shared/nodeShapeComponent.tsx — the wrapper every node kind's
// `component()` renders its face inside. Lifted from
// apps/storybook-basics/src/hosts/tldrawHost.tsx:235-326
// (`BboxNodeShapeComponent`'s return statement and its pointer-down capture).
//
// One file so every kind gets the same three things without restating them:
// the overflow that lets dots straddle the wall, the measurement pass, and the
// gesture boundary.
import type { ReactNode, RefObject } from "react";
import { useRef } from "react";
import { HTMLContainer, useEditor, type TLShape, type TLShapeId } from "tldraw";

import { diffMarkPaint, type DiffMark } from "./diffMark";
import { useMeasuredShape } from "./measure";
import { contentOwnsPress } from "./pointerOwnership";

export interface NodeShapeFrameProps<Shape extends TLShape> {
  shapeId: TLShapeId;
  shapeType: Shape["type"];
  /** Painted box, from the shape's own measured props. */
  w: number;
  h: number;
  /** Host chrome, in px, around the face — the code face's 10px grab ring
   *  (donor :310-315). Zero for a face that is draggable by its own header. */
  padding?: number;
  /** P-035. The comparison mark this shape wears, or `"normal"` for none. */
  diff?: DiffMark;
  children: ReactNode;
}

/**
 * P-035. The diff mark, drawn INSIDE the face's own box.
 *
 * TWO RULES from `docs/INVALID-STATES-PLAN.md` §6, and both are load-bearing
 * rather than taste — they are what lets a shape be CHANGED AND BROKEN at once,
 * which is the whole reason this repo split the donor's single `state` enum
 * (see `./diffMark.ts`'s header):
 *
 *  1. CHANNELS. The diff lane keeps to "the fill/wash/chip/typography
 *     channels" and stays "off outer box-shadows, corner flags, wavy
 *     underlines and cable backdrops" — those belong to the diagnostic axis,
 *     "the diagnostic halo renders outside their outline". So this is an
 *     `inset` box-shadow and a translucent wash, never an `outline` and never
 *     an outward glow. An `outline` would also be wrong for a second, purely
 *     mechanical reason: tldraw already paints the SELECTION outline just
 *     outside this box, and a second ring there reads as a selection bug.
 *  2. THE CORNER. "the top-right corner belongs to `DiagnosticFlag`"
 *     (`docs/COMPARISON-NEXT-STEPS.md`), so the sign chip goes TOP-LEFT and
 *     leaves the diagnostic corner free for the axis that has not landed here
 *     yet. Claiming it now would have to be undone later, silently, by whoever
 *     builds it.
 *
 * `position: absolute` + `inset: 0`, and `pointerEvents: none`: the mark must
 * not add a grab surface, and — the measured reason — `NodeShapeFrame`'s
 * wrapper is `width: max-content` and `useMeasuredShape` reads that hug back
 * into `props.w/h`. An in-flow element here would widen the shape's own
 * recorded size the moment it was marked, i.e. marking a block would RESIZE
 * it. Out of flow contributes nothing to `max-content`, so a marked block
 * measures exactly as it did unmarked.
 */
function DiffMarkLayer({ mark }: { mark: DiffMark }) {
  const paint = diffMarkPaint(mark);
  if (!paint) return null;
  return (
    <div
      data-slot="ss-diff-mark"
      data-ss-diff={paint.mark}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        // The wash and the ring, both inside the box. `color-mix` rather than
        // an opacity on the layer: opacity would fade the FACE underneath it
        // too, and a diff mark must never make the thing it marks harder to
        // read.
        background: `color-mix(in srgb, ${paint.ink} 12%, transparent)`,
        boxShadow: `inset 0 0 0 2px ${paint.ink}`,
        borderRadius: 6,
      }}
    >
      <span
        data-slot="ss-diff-sign"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          minWidth: 14,
          height: 14,
          padding: "0 3px",
          borderRadius: "6px 0 6px 0",
          background: paint.ink,
          color: "white",
          font: "600 11px/14px ui-sans-serif, system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        {paint.sign}
      </span>
    </div>
  );
}

/**
 * WHY `width: max-content` on the inner wrapper rather than the shape's w/h
 * (donor :315): the face HUGS its content and the measurement above reads that
 * hug back into the shape. Pinning the wrapper to `props.w` instead would make
 * the measurement circular — it would only ever confirm the number it was
 * already given, and a block whose header grew would silently clip.
 */
export function NodeShapeFrame<Shape extends TLShape>({ shapeId, shapeType, w, h, padding = 0, diff = "normal", children }: NodeShapeFrameProps<Shape>) {
  const editor = useEditor();
  const wrapperRef: RefObject<HTMLDivElement | null> = useRef<HTMLDivElement | null>(null);
  useMeasuredShape<Shape>({ shapeId, shapeType, wrapperRef, nodeId: shapeId });

  return (
    <HTMLContainer
      style={{
        width: w,
        height: h,
        // Dots straddle the walls and labels hang outside them — the same
        // overflow the pre-reset adapter's shapes needed (donor :301-304).
        overflow: "visible",
        pointerEvents: "all",
      }}
    >
      <div
        ref={wrapperRef}
        data-ss-node={shapeId}
        style={{ position: "absolute", left: 0, top: 0, width: "max-content", padding }}
        onPointerDownCapture={(event) => {
          if (contentOwnsPress(shapeType, shapeId, event.target as Element)) {
            editor.markEventAsHandled(event);
          }
        }}
      >
        {children}
        {/* LAST, so the mark composites over the face rather than under it,
            and INSIDE the measured wrapper, so it covers exactly the box the
            user sees rather than the authored `w`/`h` (which the hug has
            usually already contradicted). */}
        <DiffMarkLayer mark={diff} />
      </div>
    </HTMLContainer>
  );
}
