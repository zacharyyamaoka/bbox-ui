// src/shapes/shared/measure.ts — the host's one measurement: how big is this
// node's rendered face, and where are its port dots?
//
// Lifted from apps/storybook-basics/src/hosts/tldrawHost.tsx:242-292 (the
// `measure` callback plus the two effects that drive it). The donor reported
// its readings into React state; here they are written back into the SHAPE's
// own persisted props, because in this app the tldraw store IS the document
// (docs/SYSTEMSKETCH-REBUILD-PLAN.md §1.1-B).
//
// The two rules that travel with it (donor :9-31):
//   1. props are persisted document state — `offsetWidth` is unscaled layout
//      px, which is exactly shape-local px, so the content box IS the shape's
//      geometry;
//   2. anchors are geometry points, not DOM elements — sighted once per layout
//      change through the engine-free seam and projected with the editor's own
//      camera math, so they survive pan, zoom AND rotation.
import { useCallback, useEffect, useLayoutEffect, type RefObject } from "react";
import { useEditor, type TLShape, type TLShapeId, type TLShapePartial } from "tldraw";

import { sightPortDots } from "@trunk/hosts/portDotSightings";

import type { PortSide } from "../types";

export interface MeasuredAnchor {
  portId: string;
  x: number;
  y: number;
  side: PortSide | null;
}

/** The prop shape this hook writes back into. Every node kind that carries a
 *  measured box and measured dots has exactly these three fields. */
interface MeasuredProps {
  w: number;
  h: number;
  anchors: MeasuredAnchor[];
}

const EPSILON_PX = 0.5;

/** Donor :227-233. The 0.5px floor is what stops a sub-pixel layout jitter
 *  from writing a new record on every frame. */
function sameAnchors(a: readonly MeasuredAnchor[], b: readonly MeasuredAnchor[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (anchor, i) =>
        anchor.portId === b[i].portId &&
        Math.abs(anchor.x - b[i].x) < EPSILON_PX &&
        Math.abs(anchor.y - b[i].y) < EPSILON_PX &&
        anchor.side === b[i].side,
    )
  );
}

export interface UseMeasuredShapeOptions<Shape extends TLShape> {
  shapeId: TLShapeId;
  /** WHY the hook is generic rather than taking a plain string: `updateShape`
   *  is a discriminated union over the shape type, so naming the shape here is
   *  what makes the write below checkable at all — a kind cannot be measured
   *  into props it does not have. */
  shapeType: Shape["type"];
  wrapperRef: RefObject<HTMLDivElement | null>;
  /** The id `BlockPort` stamped as `data-block-id`, i.e. which dots are ours
   *  rather than a member's. Always the shape id in this app. */
  nodeId: string;
}

/**
 * Measure this shape's face every render and write the readings back into its
 * props when they actually moved.
 */
export function useMeasuredShape<Shape extends TLShape>({ shapeId, shapeType, wrapperRef, nodeId }: UseMeasuredShapeOptions<Shape>): void {
  const editor = useEditor();

  const measure = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const live = editor.getShape(shapeId);
    if (!live) return;
    const props = live.props as Partial<MeasuredProps>;

    const w = wrapper.offsetWidth;
    const h = wrapper.offsetHeight;
    // Skipped mid-resize (donor :249-251): `resizeBox` owns w/h for the
    // duration of the gesture, and a measured write here would snap the box
    // back under the user's pointer.
    const boxMoved =
      w > 0 &&
      h > 0 &&
      !editor.isIn("select.resizing") &&
      (Math.abs((props.w ?? 0) - w) > EPSILON_PX || Math.abs((props.h ?? 0) - h) > EPSILON_PX);

    const anchors: MeasuredAnchor[] = sightPortDots(wrapper, nodeId).map((sighting) => {
      const local = editor.getPointInShapeSpace(shapeId, editor.screenToPage({ x: sighting.clientX, y: sighting.clientY }));
      return { portId: sighting.portId, x: local.x, y: local.y, side: sighting.side };
    });
    const anchorsMoved = !sameAnchors(props.anchors ?? [], anchors);

    if (!boxMoved && !anchorsMoved) return;

    // WHY `history: "ignore"`: measurement is NOT an edit. Without this a
    // Ctrl+Z after placing a block undoes the first measurement instead of the
    // placement, and every font settle or rail reflow leaves an undo step the
    // user never made. The archive learned the same thing about its own
    // auto-resize pass; the trunk bench never had to, because its readings
    // lived in React state rather than in the document.
    editor.run(
      () => {
        // The cast is on the WHOLE partial because `TLShapePartial` is a
        // discriminated union: with `Shape` still generic here, TypeScript
        // cannot pick the member, though every call site has a concrete shape.
        editor.updateShape<Shape>({
          id: shapeId,
          type: shapeType,
          props: { ...(boxMoved ? { w, h } : {}), ...(anchorsMoved ? { anchors } : {}) },
        } as TLShapePartial<Shape>);
      },
      { history: "ignore" },
    );
  }, [editor, nodeId, shapeId, shapeType, wrapperRef]);

  // Donor :275-277 — every render, equality-guarded above: a rail reorder
  // moves dots WITHOUT resizing the node, so a ResizeObserver alone would
  // sleep through it; the reorder re-renders this component and this effect
  // rides that render.
  useLayoutEffect(() => {
    measure();
  });

  // Donor :282-292 — rails land one layout pass after the Block they attach
  // to, and fonts settle later still: one deferred frame plus a
  // ResizeObserver covers both.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [measure, wrapperRef]);
}
