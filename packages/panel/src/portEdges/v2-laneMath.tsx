/**
 * V2 · Lane Math — no sortable, no overlay, no clone.
 *
 * THESIS: the smallest thing that can work. dnd-kit contributes exactly two
 * hooks (useDraggable, useDroppable) and a sensor; everything else is the
 * placement model's own lane math, resolved once, at drop, from the pointer.
 * The thing that moves under the cursor is the REAL port — translated by
 * dnd-kit's transform — so there is no second copy of it anywhere, and the
 * ghost-stretch class of bug is structurally unreachable rather than merely
 * fixed.
 *
 * DECISIONS
 *  1. No DragOverlay. The live card gets `transform: translate(dx/zoom,
 *     dy/zoom)` and a raised z-index. Division by zoom is the whole host-
 *     adaptation: dnd-kit's delta is client pixels, the card lives inside a
 *     `scale(zoom)` ancestor, so local pixels = client pixels / zoom.
 *  2. The model is written once, on drop. Nothing reflows mid-drag — the
 *     lane you are leaving keeps its gap until you release. That is the
 *     honest trade for (1): with no ghost, a live reflow would move the very
 *     element the pointer is holding.
 *  3. `pointerWithin`, not `closestCenter`: a lane is a long thin band whose
 *     geometric centre can sit far from a pointer that is solidly inside it,
 *     and closestCenter then picks a compact side lane over the wide one the
 *     cursor is actually on. `pointerWithin` asks the question that matches
 *     the gesture. `nearestLiveEdge` covers the gap between two lanes.
 *  4. Custom mode and auto mode differ only in which of `movePort`'s two
 *     targets is computed — `{t}` or `{index}`. One code path, two lines.
 *
 * STOCK: DndContext, PointerSensor, pointerWithin, useDraggable,
 * useDroppable, CSS.Translate. (No @dnd-kit/sortable at all.)
 */
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  DndContext,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { PortEdgeId } from "@bbox-ui/core";

import {
  LaneBox,
  PortCard,
  PortEdgesModelProvider,
  isHorizontal,
  laneDroppableId,
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

function Provider({ model, children }: { model: PortEdgesModel; children: ReactNode }) {
  const [, setActive] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function onDragStart(event: DragStartEvent) {
    setActive(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActive(null);
    const { active, over, delta, activatorEvent } = event;
    const found = findSlot(model, String(active.id));
    if (!found) return;
    const head = found.slot.headId;
    const pointer = activatorEvent as PointerEvent;
    const x = pointer.clientX + delta.x;
    const y = pointer.clientY + delta.y;

    // The lane the pointer is in, else the nearest live one — so a drop a
    // few pixels shy of the band still lands where the user aimed instead of
    // silently doing nothing.
    let edge: PortEdgeId | null = null;
    if (over) {
      for (const candidate of model.arrangement.edges) {
        if (laneDroppableId(model.ownerId, candidate) === String(over.id)) edge = candidate;
      }
    }
    edge = edge ?? nearestLiveEdge(model, x, y) ?? found.edge;

    if (model.arrangement.mode === "custom") {
      moveSlot(model, found.slot, edge, { t: pointerToT(model.ownerId, edge, x, y) });
    } else {
      moveSlot(model, found.slot, edge, { index: pointerToIndex(model.ownerId, edge, head, x, y) });
    }
  }

  return (
    <PortEdgesModelProvider model={model}>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActive(null)}
      >
        <div style={{ display: "contents" }}>{children}</div>
      </DndContext>
    </PortEdgesModelProvider>
  );
}

function LiveCard({ slot, edge }: { slot: LaneSlot; edge: PortEdgeId }) {
  const model = usePortEdgesModel();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: slot.group });
  const custom = model.arrangement.mode === "custom";
  const horizontal = isHorizontal(edge);
  // WHY the centering translate is re-stated here instead of inherited from
  // PortCard: `transform` is one CSS property. A drag translate written over
  // PortCard's own `translateX(-50%)` would silently un-centre every custom-
  // mode card the moment it was picked up, so the two are composed by hand,
  // drag first, centring second (right-to-left application order).
  const centring = custom ? (horizontal ? "translateX(-50%)" : "translateY(-50%)") : "";
  const dragging = transform
    ? `translate3d(${transform.x / model.zoom}px, ${transform.y / model.zoom}px, 0)`
    : "";
  const composed = [dragging, centring].filter(Boolean).join(" ");
  return (
    <PortCard
      slot={slot}
      edge={edge}
      cardRef={setNodeRef}
      style={{
        transform: composed || undefined,
        zIndex: isDragging ? 30 : undefined,
        // Deliberately NOT PortCard's own `opacity-30`: with no ghost, the
        // live card IS the ghost, so fading it would leave nothing to aim.
        opacity: 1,
        cursor: isDragging ? "grabbing" : "grab",
      }}
      handleProps={{ ...attributes, ...listeners }}
    />
  );
}

function Lane({ edge, style }: { edge: PortEdgeId; style?: CSSProperties }) {
  const model = usePortEdgesModel();
  const { setNodeRef, isOver } = useDroppable({ id: laneDroppableId(model.ownerId, edge) });
  return (
    <LaneBox edge={edge} style={style} isOver={isOver} laneRef={setNodeRef}>
      {laneSlots(model, edge).map((slot) => (
        <LiveCard key={slot.group} slot={slot} edge={edge} />
      ))}
    </LaneBox>
  );
}

export const V2_LANE_MATH: PortEdgesImpl = {
  id: "v2-lane-math",
  label: "V2 · Lane Math",
  thesis:
    "Two dnd-kit hooks and the model's own lane math. The real port translates under the cursor, there is no overlay and no clone, and the drop is resolved once from the pointer.",
  stock: "DndContext · PointerSensor · pointerWithin · useDraggable · useDroppable",
  Provider,
  Lane,
};
