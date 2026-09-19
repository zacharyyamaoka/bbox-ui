// src/hosts/memberDrag.ts — dragging free-layout members inside their
// parent's own members region: a gesture bounded by the parent Block's own
// box, never the canvas (ARCHITECTURE.md "Where an interaction belongs" —
// "bounded by one component's box → the component's own"). By that rule
// this hook belongs beside `blockMembers.tsx`, as free layout's own
// counterpart to `stack`'s dnd-kit `MemberDndBoundary` — it lives here only
// because `src/components/**` is fenced off this lane (a skin-migration
// lane owns it) and `BlockMembers`'s `free` layout ships with no drag
// mechanism at all today (verified: `slotStyle`'s `free` branch is a bare
// `position: absolute` at the member's authored x/y — nothing listens for a
// pointer). Recorded as owed wiring in this lane's report — the day
// `src/components/**` is free again, this hook's body is what
// `BlockMembers` should grow as `free`'s own `onMembersChange` counterpart,
// not a second implementation.
//
// Shaped like `blockMembers.tsx`'s own `MemberDndBoundary`: ONE boundary
// per members region, at most one member dragging at a time, identified by
// id — not one hook instance per member (which would call a hook a
// variable number of times, once per member, and break the rule that a
// component's hook calls never depend on data).
//
// WHY plain PointerEvent + setPointerCapture, not dnd-kit: dnd-kit's
// PointerSensor is already the rail/stack recipe (portEdge.tsx,
// blockMembers.tsx's own `SortableMemberSlot`), but it answers "which slot
// did this land closest to" (`closestCenter` + `arrayMove`) — an ORDERING
// question. Free placement is a continuous (x, y), not a reorder, so the
// primitive this needs is the browser's own pointer capture, not a sensor
// built for lists.
//
// WHY the write-back is split into a live, ephemeral value and a single
// settle callback: this repo's own established idiom for every other
// canvas gesture — reactFlowHost.tsx's `NodeResizer` (`onResizeEnd`, never
// per-move — its own comment: "writing per-move feeds back into XYResizer's
// gesture math and collapses the node") and tldrawHost.tsx's
// `onTranslateEnd`/`onResizeEnd` ("position writes back at rest; mid-drag
// [the engine] owns the moving copy"). A member drag is not an engine
// gesture — nothing here can feed back into React Flow's or tldraw's own
// math — but the SAME split still earns its keep: `onDragChange` drives a
// LOCAL re-render (the parent tracks the child continuously, which is
// Zach's literal ask), while the scene itself is written once, at release,
// so an aborted or jittery drag never leaves a half-finished position in
// the record a story or an undo stack would have to reconcile.

import { useCallback, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

export interface MemberDragPosition {
  x: number;
  y: number;
}

export interface UseFreeMemberDragOptions {
  /** Written ONCE, at release — see the file header's WHY. */
  onDragEnd(id: string, next: MemberDragPosition): void;
  /** Written on every move — ephemeral, never reaches the scene. Drives a
   *  continuous parent re-fit while the gesture is still in flight. */
  onDragChange?(id: string, next: MemberDragPosition): void;
  /** A member cannot be dragged above/left of its own members region — the
   *  region's origin is its own top-left, and `fitBoxToMembers` has no
   *  notion of negative space to grow into. Defaults to (0, 0). */
  min?: MemberDragPosition;
}

export interface UseFreeMemberDragResult {
  /** The member currently mid-gesture, or `null` at rest. */
  draggingId: string | null;
  /** `atRest` unless `id` is the one dragging, in which case the in-flight
   *  point. Call this for EVERY free member's `x`/`y` — it is a no-op for
   *  every id except `draggingId`. */
  liveFor(id: string, atRest: MemberDragPosition): MemberDragPosition;
  /** Attach to a member's own drag surface: `onPointerDown={beginDrag(id, atRestPosition)}`. */
  beginDrag(id: string, atRest: MemberDragPosition): (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove(event: ReactPointerEvent<HTMLElement>): void;
  onPointerUp(event: ReactPointerEvent<HTMLElement>): void;
  onPointerCancel(event: ReactPointerEvent<HTMLElement>): void;
}

export function useFreeMemberDrag({ onDragEnd, onDragChange, min = { x: 0, y: 0 } }: UseFreeMemberDragOptions): UseFreeMemberDragResult {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [live, setLive] = useState<MemberDragPosition | null>(null);
  // Read inside pointerup instead of `live` itself — `live` in that
  // closure is whatever it was when the LISTENER was attached
  // (pointerdown), not the latest move.
  const liveRef = useRef<MemberDragPosition | null>(null);
  const startRef = useRef({ pointerX: 0, pointerY: 0, memberX: 0, memberY: 0 });

  const liveFor = useCallback(
    (id: string, atRest: MemberDragPosition): MemberDragPosition => (id === draggingId && live ? live : atRest),
    [draggingId, live],
  );

  const beginDrag = useCallback(
    (id: string, atRest: MemberDragPosition) => (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      // Bounded to this member's own box — never the canvas underneath —
      // so the host's own drag/pan never starts from this pointerdown too.
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      startRef.current = { pointerX: event.clientX, pointerY: event.clientY, memberX: atRest.x, memberY: atRest.y };
      liveRef.current = atRest;
      setLive(atRest);
      setDraggingId(id);
    },
    [],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!draggingId) return;
      const dx = event.clientX - startRef.current.pointerX;
      const dy = event.clientY - startRef.current.pointerY;
      const next = { x: Math.max(min.x, startRef.current.memberX + dx), y: Math.max(min.y, startRef.current.memberY + dy) };
      liveRef.current = next;
      setLive(next);
      onDragChange?.(draggingId, next);
    },
    [draggingId, min.x, min.y, onDragChange],
  );

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!draggingId) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      const settled = liveRef.current;
      const id = draggingId;
      setDraggingId(null);
      setLive(null);
      liveRef.current = null;
      if (settled) onDragEnd(id, settled);
    },
    [draggingId, onDragEnd],
  );

  return { draggingId, liveFor, beginDrag, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag };
}
