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
  children: ReactNode;
}

/**
 * WHY `width: max-content` on the inner wrapper rather than the shape's w/h
 * (donor :315): the face HUGS its content and the measurement above reads that
 * hug back into the shape. Pinning the wrapper to `props.w` instead would make
 * the measurement circular — it would only ever confirm the number it was
 * already given, and a block whose header grew would silently clip.
 */
export function NodeShapeFrame<Shape extends TLShape>({ shapeId, shapeType, w, h, padding = 0, children }: NodeShapeFrameProps<Shape>) {
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
      </div>
    </HTMLContainer>
  );
}
