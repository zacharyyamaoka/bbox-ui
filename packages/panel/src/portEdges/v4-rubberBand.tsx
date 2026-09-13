/**
 * V4 · Rubber Band — the model moves on every pointer move.
 *
 * THESIS: there is no drag STATE, only a sequence of placements. Every
 * `onDragMove` computes where the pointer is along the nearest live edge and
 * calls `movePort` immediately, so the port literally slides along the wall
 * and — in auto mode — the whole lane re-evens live underneath it, the way a
 * rubber band redistributes when you pull one point of it. There is nothing
 * to preview, because what you are looking at is already the committed
 * state; releasing changes nothing.
 *
 * DECISIONS
 *  1. No ghost and no transform on the card. The element does not move
 *     because CSS moved it; it moves because its `t` changed. That is the
 *     most direct manipulation of the five and the only one where the thing
 *     under the cursor and the thing in the model are never out of step.
 *  2. Hysteresis, not throttling. A commit happens only when the computed
 *     (edge, index-or-t-bucket) differs from the last committed one.
 *     Without it, auto mode oscillates: re-evening moves the cards, which
 *     moves the centres `pointerToIndex` counts, which flips the index back.
 *     `t` is bucketed to 1/200 for the same reason in custom mode.
 *  3. `nearestLiveEdge` decides the edge, not dnd-kit's collision. Collision
 *     is a discrete "am I over it" question; a rubber band needs a
 *     continuous "which wall am I closest to" one, and the lanes it is
 *     choosing between are being re-laid-out on every frame.
 *  4. `autoScroll={false}`: a commit-per-move drag inside a scrollable well
 *     otherwise fights dnd-kit's own scroll intent.
 *
 * STOCK: DndContext, PointerSensor, useDraggable, onDragMove. No droppables,
 * no collision detection, no overlay, no sortable — the smallest dnd-kit
 * surface of the five, traded for the most hand-written control.
 */
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { PortEdgeId } from "@bbox-ui/core";

import {
  LaneBox,
  PortCard,
  PortEdgesModelProvider,
  laneSlots,
  moveSlot,
  findSlot,
  nearestLiveEdge,
  pointerToIndex,
  pointerToT,
  usePortEdgesModel,
  type LaneSlot,
  type PortEdgesImpl,
  type PortEdgesModel,
} from "./contract";

/** Custom mode's `t` is bucketed before it is compared, so a sub-pixel
 *  pointer jitter cannot produce a commit — and therefore cannot produce a
 *  re-render that moves the very card the pointer is holding. */
const T_BUCKETS = 200;

function Provider({ model, children }: { model: PortEdgesModel; children: ReactNode }) {
  const [active, setActive] = useState<string | null>(null);
  const lastCommit = useRef<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  /**
   * The live pointer, read from the browser rather than reconstructed.
   *
   * WHY not `activatorEvent.clientX + event.delta.x` — the idiom the other
   * four variants here use, correctly: dnd-kit publishes
   * `delta = translate - nodeRectDelta` (core.esm.js:2960, :3139), and
   * `nodeRectDelta = useRectDelta(usesDragOverlay ? null : activeNodeRect)`
   * (:2951) is how far the dragged node's OWN rect has travelled since the
   * press. dnd-kit subtracts it so that a node the layout relocates stays
   * pinned under the cursor — right for a transform, fatal for a pointer.
   * It is live only when no `<DragOverlay>` is mounted, and V4 is both the
   * one variant without an overlay and the one variant that relocates the
   * card mid-gesture, so those two facts meet nowhere else. The instant a
   * commit moved the card to another lane, `delta` compensated by the
   * opposite of that jump, the reconstructed point snapped back to the lane
   * it came from, `nearestLiveEdge` flipped, and the drag entered a 2-cycle
   * — measured before this fix as left(346,206) -> top(433,120) ->
   * left(264,206) -> top(433,120) -> … — landing on whichever phase the
   * release happened to catch. The hysteresis in `commit` cannot damp that,
   * because the alternating keys are real.
   *
   * `pointermove` on `window` in the CAPTURE phase is the primary source for
   * "where is the pointer", cannot be poisoned by a layout write, and runs
   * ahead of dnd-kit's own document listener — so the coordinate
   * `onDragMove` reads is this move's, never the previous one's.
   */
  const livePointer = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      livePointer.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
    return () => window.removeEventListener("pointermove", onPointerMove, { capture: true });
  }, []);

  function commit(found: NonNullable<ReturnType<typeof findSlot>>, edge: PortEdgeId, x: number, y: number) {
    if (model.arrangement.mode === "custom") {
      const t = pointerToT(model.ownerId, edge, x, y);
      const key = `${edge}:${Math.round(t * T_BUCKETS)}`;
      if (key === lastCommit.current) return;
      lastCommit.current = key;
      moveSlot(model, found.slot, edge, { t });
    } else {
      const index = pointerToIndex(model.ownerId, edge, found.slot.headId, x, y);
      const key = `${edge}:${index}`;
      if (key === lastCommit.current) return;
      lastCommit.current = key;
      moveSlot(model, found.slot, edge, { index });
    }
  }

  function onDragStart(event: DragStartEvent) {
    setActive(String(event.active.id));
    lastCommit.current = null;
  }

  function onDragMove(event: DragMoveEvent) {
    const found = findSlot(model, String(event.active.id));
    if (!found) return;
    // The browser's pointer if we have one; the reconstruction only as a
    // cold-start fallback, before any move has been seen. (Activation needs
    // 4px, so in practice the listener has always fired first.)
    const activator = event.activatorEvent as PointerEvent;
    const point = livePointer.current ?? {
      x: activator.clientX + event.delta.x,
      y: activator.clientY + event.delta.y,
    };
    const edge = nearestLiveEdge(model, point.x, point.y) ?? found.edge;
    commit(found, edge, point.x, point.y);
  }

  function onDragEnd(event: DragEndEvent) {
    // Nothing to do but drop the highlight: every intermediate move already
    // wrote the model, so the released state IS the last committed one.
    onDragMove(event as unknown as DragMoveEvent);
    setActive(null);
    lastCommit.current = null;
  }

  return (
    <PortEdgesModelProvider model={model}>
      <DndContext
        sensors={sensors}
        autoScroll={false}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActive(null);
          lastCommit.current = null;
        }}
      >
        <div style={{ display: "contents" }}>{children}</div>
      </DndContext>
    </PortEdgesModelProvider>
  );
}

function BandCard({ slot, edge }: { slot: LaneSlot; edge: PortEdgeId }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: slot.group });
  return (
    <PortCard
      slot={slot}
      edge={edge}
      cardRef={setNodeRef}
      style={{
        // No translate at all — the card is where the MODEL put it. The ring
        // is the only thing a drag adds, so "what you see" and "what is
        // stored" are the same object for the whole gesture.
        zIndex: isDragging ? 30 : undefined,
        outline: isDragging ? "2px solid var(--bbox-accent)" : undefined,
        outlineOffset: 2,
        borderRadius: 4,
        cursor: isDragging ? "grabbing" : "grab",
      }}
      handleProps={{ ...attributes, ...listeners }}
    />
  );
}

function Lane({ edge, style }: { edge: PortEdgeId; style?: CSSProperties }) {
  const model = usePortEdgesModel();
  return (
    <LaneBox edge={edge} style={style}>
      {laneSlots(model, edge).map((slot) => (
        <BandCard key={slot.group} slot={slot} edge={edge} />
      ))}
    </LaneBox>
  );
}

export const V4_RUBBER_BAND: PortEdgesImpl = {
  id: "v4-rubber-band",
  label: "V4 · Rubber Band",
  thesis:
    "Commit on every move: the port slides along the wall and the lane re-evens live under the pointer, because there is no drag state — only the placement model, written continuously.",
  stock: "DndContext · PointerSensor · useDraggable · onDragMove (no droppables, no collision, no overlay)",
  Provider,
  Lane,
};
