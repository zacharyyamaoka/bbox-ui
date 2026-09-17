"use client";

// src/components/traceBadge.tsx — NET-NEW (docs/TRACE-PLAN.md P4 · Lane D).
//
// Two halves with two different provenances, and that split is the whole
// reason this file is small:
//
//   - The MATH is ported, and already here. `fractionNearest` (project a
//     pointer onto the polyline, get its arc-length fraction),
//     `pointAtFraction` (the inverse) and `clampLabelPosition` (0.05..0.95)
//     live in `./trace.layout.ts`, ported by value from
//     `packages/bbox-ui/src/trace.layout.ts` (`b5b2778`), itself from
//     SystemSketch's `connectionPresentation.ts`. This file derives no
//     geometry of its own.
//   - The DOM is net-new, because there is nothing to port. SystemSketch has
//     no custom draggable edge label at all: its arrow labels are stock
//     tldraw `labelPosition` ("Stock, and draggable only by pointer",
//     `inspectorModel.ts:894-904`) and its custom connections carry only the
//     z-1 pill. What DOES exist there is the pill's drag MECHANISM —
//     `pillPosition: clampPillPosition(fractionNearest(points, handle))`
//     (`ConnectionShapeUtil.tsx:658`) — and this file is that one line, with
//     a real pointer gesture and a stock shadcn Badge around it.
//
// Zach's ask, verbatim: "we want the option to add a badge to the line (can
// use just the normal shadcn badge component we already have) and you should
// be able to drag the badge along the line to change its positioning... if
// you double click the line to add text, it will display inside of a badge."
// The double-click-to-CREATE half belongs to the host — that gesture lands on
// the trace's hit path (`trace.tsx`'s `interactive` prop), which this
// component knows nothing about. Everything from "a badge exists" onward is
// here.
//
// WHY DOM and not SVG: it renders the stock `Badge` (`./badge.tsx`) — Zach
// named it — which is a Tailwind-styled `<span>`. Wrapping it in a
// `<foreignObject>` to live inside the trace's `<svg>` would buy nothing and
// cost the badge its normal layout and text metrics. So the contract is: the
// badge is an absolutely-positioned sibling of the svg, and `points` are read
// in the coordinate space an absolutely-positioned child's `left`/`top`
// resolve against — its `offsetParent`'s padding box.

import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { cn } from "../lib/utils";
import { Badge, type BadgeProps } from "./badge";
import { EditableText } from "./editableText";
import {
  LABEL_POSITION_DEFAULT,
  clampLabelPosition,
  fractionNearest,
  pointAtFraction,
  type Point,
} from "./trace.layout";

/** Font size inside the pill, in px. Matches the stock Badge's own `md` rung
 * (`text-xs` = 0.75rem = 12px) so the text at rest and the editing control
 * are the same size, and the pill does not resize on entering edit. */
export const TRACE_BADGE_FONT_PX = 12;

// WHY `ref` is omitted rather than forwarded: this component needs its own
// root node for `setPointerCapture` and for the `offsetParent` lookup that
// turns client coordinates into `points` space. Dropping a caller's `ref`
// silently would be a lie; merging two refs onto one node is machinery
// nothing here has asked for. A compile error is the honest third option.
export interface TraceBadgeProps extends Omit<ComponentProps<"div">, "ref" | "onChange" | "children"> {
  /**
   * The polyline the badge rides, in the coordinate space described in this
   * file's header. Passed in, never derived — that is what keeps this file
   * independent of HOW the trace was routed (straight, slanted, a curve
   * sampled at N points, an elbow staircase). `Trace`'s own `points` prop
   * (`trace.tsx:96`) exists to be handed straight to this.
   */
  points: readonly Point[];
  /**
   * Normalised arc-length position, 0..1. Clamped to 0.05..0.95 for
   * rendering exactly as `TraceBody.labelPosition` is — a label sitting on a
   * terminal reads as part of the terminal rather than as a fact about the
   * trace. `data-t` reports the clamped value actually used.
   */
  t?: number;
  /** Controlled. Omit it and the badge is not draggable at all — that is the
   * gate, rather than a separate `draggable` prop that could disagree with
   * whether anyone is actually listening. */
  onTChange?: (t: number) => void;
  value: string;
  onValueChange?: (value: string) => void;
  /** Controlled, like `EditableText.editing`. Omit `onEditingChange` and
   * double-click-to-edit is off — the same gate as `onTChange`. */
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  /** Passed through to the stock `Badge` untouched. */
  variant?: BadgeProps["variant"];
  size?: BadgeProps["size"];
  placeholder?: string;
  /**
   * Escape hatch for a host whose `points` are NOT in its own CSS pixel
   * space — a zoomed/panned canvas, where a screen point has to go through
   * the camera before it means anything to the route. The default is the
   * `offsetParent` conversion below, which is right for a plain
   * `position: relative` container (every story here, and React Flow's own
   * `EdgeLabelRenderer`).
   */
  toLocal?: (client: Point) => Point;
}

/**
 * Client (viewport) coordinates -> the space `points` live in.
 *
 * `offsetParent` is not a guess: it is, by CSS definition, the element an
 * absolutely-positioned child's `left`/`top` are measured against — so it is
 * exactly the frame `pointAtFraction`'s output is already being written into.
 * Using it closes the round trip (point -> css -> pointer -> point) without
 * the caller having to hand over a container ref it would then have to keep
 * in sync.
 *
 * Three corrections, each for a real case: `clientLeft`/`clientTop` because
 * `getBoundingClientRect` measures the BORDER box while `left` resolves
 * against the padding box; `scrollLeft`/`scrollTop` because a scrolled
 * container moves its children without moving its own rect; and the
 * rect-to-offset ratio because a CSS-transformed ancestor scales the rect but
 * not the layout coordinates.
 */
function clientToLocal(root: HTMLElement, client: Point): Point {
  const parent = root.offsetParent as HTMLElement | null;
  if (!parent) return client;
  const rect = parent.getBoundingClientRect();
  const scaleX = parent.offsetWidth > 0 ? rect.width / parent.offsetWidth : 1;
  const scaleY = parent.offsetHeight > 0 ? rect.height / parent.offsetHeight : 1;
  return {
    x: (client.x - rect.left) / (scaleX || 1) - parent.clientLeft + parent.scrollLeft,
    y: (client.y - rect.top) / (scaleY || 1) - parent.clientTop + parent.scrollTop,
  };
}

export function TraceBadge({
  points,
  t = LABEL_POSITION_DEFAULT,
  onTChange,
  value,
  onValueChange,
  editing = false,
  onEditingChange,
  variant = "secondary",
  size,
  placeholder,
  toLocal,
  className,
  style,
  onPointerDown,
  onDoubleClick,
  ...props
}: TraceBadgeProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [dragPointerId, setDragPointerId] = useState<number | null>(null);

  const effectiveT = clampLabelPosition(t);
  const anchor = pointAtFraction(points, effectiveT);
  const canDrag = Boolean(onTChange);
  const canEdit = Boolean(onEditingChange);
  const dragging = dragPointerId !== null;

  // WHY a per-render "latest" box instead of naming these in the effect's
  // deps: the drag listeners below must always read the CURRENT `points` and
  // `onTChange` (the host re-renders on every pointermove, so a closure
  // captured at pointerdown is stale one frame later), but putting them in a
  // dep array would tear down and re-add three window listeners on every
  // frame of the drag. One mutable box gives fresh reads with a subscription
  // that lives exactly as long as the gesture.
  const latest = useRef({ points, onTChange, toLocal });
  latest.current = { points, onTChange, toLocal };

  useEffect(() => {
    if (dragPointerId === null) return;
    const root = rootRef.current;
    if (!root) return;

    const handleMove = (event: PointerEvent) => {
      if (event.pointerId !== dragPointerId) return;
      const node = rootRef.current;
      if (!node) return;
      const client = { x: event.clientX, y: event.clientY };
      const { points: livePoints, onTChange: emit, toLocal: convert } = latest.current;
      const local = convert ? convert(client) : clientToLocal(node, client);
      // The donor's one line, unchanged in meaning:
      //   pillPosition = clampPillPosition(fractionNearest(points, handle))
      // Nearest-point PROJECTION, not a pointer delta — so the badge tracks
      // the path rather than the finger, and a pointer that wanders off the
      // line still puts the badge back ON it. Rejected alternative: keeping
      // the grab offset (where you grabbed the pill stays under the pointer).
      // It reads nicer for one frame and then drifts, because an offset that
      // is constant in screen space is not constant in arc length once the
      // route bends.
      emit?.(clampLabelPosition(fractionNearest(livePoints, local)));
    };
    const handleEnd = (event: PointerEvent) => {
      if (event.pointerId !== dragPointerId) return;
      setDragPointerId(null);
    };

    // WHY window listeners and not React's own `onPointerMove` on the root,
    // given `setPointerCapture` is already held: capture is best-effort here
    // (see the pointerdown handler), and a drag whose only move listener sits
    // on the badge would silently stop tracking the instant capture is
    // unavailable and the pointer leaves the pill. `window` is correct with
    // OR without capture — captured events still bubble there — so the
    // gesture has one code path instead of two that can disagree.
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd);
    window.addEventListener("pointercancel", handleEnd);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
      if (root.hasPointerCapture(dragPointerId)) root.releasePointerCapture(dragPointerId);
    };
  }, [dragPointerId]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    onPointerDown?.(event);
    if (event.defaultPrevented) return;
    // WHY a drag never starts while `editing`: pressing the pill would blur
    // the input, and EditableText commits on blur — so a nudge of the badge
    // would silently end text entry mid-word. Escape or Enter first, then
    // drag.
    if (!canDrag || editing || event.button !== 0) return;
    const root = rootRef.current;
    if (!root) return;
    // The badge sits ON TOP of the trace's hit path. Without this, a grab
    // also reads as a press on the line underneath, and the host's
    // double-click-to-create fires on a double-grab of an existing badge.
    event.stopPropagation();
    try {
      root.setPointerCapture(event.pointerId);
    } catch {
      // Best-effort. `setPointerCapture` throws NotFoundError for a
      // pointerId the browser has no ACTIVE pointer for — exactly the case
      // for a synthetic `PointerEvent` dispatched by a play function. The
      // gesture does not depend on it (see the window listeners above); it is
      // here so a REAL pointer leaving the pill keeps hover/`:active` on the
      // pill instead of flickering across whatever it passes over.
    }
    setDragPointerId(event.pointerId);
  };

  const handleDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    onDoubleClick?.(event);
    if (event.defaultPrevented || !canEdit) return;
    event.stopPropagation();
    onEditingChange?.(true);
  };

  return (
    <div
      data-slot="trace-badge"
      data-t={effectiveT}
      data-dragging={dragging || undefined}
      data-editing={editing || undefined}
      ref={rootRef}
      className={cn(className)}
      style={{
        // WHY `position` is inline and not Tailwind's `absolute`: this is
        // load-bearing GEOMETRY, not decoration. Tailwind v4 only generates
        // utilities it finds by scanning configured sources, and this repo
        // has already been bitten once by a utility used only from an
        // unscanned directory silently never being emitted (`CLAUDE.md`,
        // "Tailwind v4 only scans the app's own sources"). A badge that
        // quietly falls back to `position: static` would sit at the end of
        // the flow instead of on the line.
        position: "absolute",
        left: anchor.x,
        top: anchor.y,
        transform: "translate(-50%, -50%)",
        // `touch-action: none` is what makes a touch drag reach pointermove
        // at all rather than being consumed as a scroll; `user-select: none`
        // stops a drag across the pill painting a text selection.
        touchAction: "none",
        userSelect: "none",
        cursor: canDrag ? (dragging ? "grabbing" : "grab") : undefined,
        ...style,
      }}
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
      {...props}
    >
      {/* WHY neither of these gets a `data-slot` of its own, despite the
          house rule: both already emit one (`badge`, `editable-text`) and
          both spread caller props AFTER it, so passing one here would
          OVERWRITE the stock slot rather than add to it — erasing the very
          evidence that this is the stock shadcn Badge with the stock
          EditableText inside it. The wrapper above carries this component's
          slot; these two carry theirs. */}
      <Badge variant={variant} size={size}>
        <EditableText
          size="custom"
          sizePx={TRACE_BADGE_FONT_PX}
          lines="single"
          editing={editing}
          placeholder={placeholder}
          onChange={onValueChange}
          onCommit={(next) => {
            onValueChange?.(next);
            onEditingChange?.(false);
          }}
          onCancel={() => onEditingChange?.(false)}
          // Inherit the pill's own colour instead of EditableText's default,
          // so `variant` stays the single place the look is decided.
          style={{ color: "inherit" }}
        >
          {value}
        </EditableText>
      </Badge>
    </div>
  );
}
