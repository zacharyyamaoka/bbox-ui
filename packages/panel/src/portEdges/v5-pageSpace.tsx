/**
 * V5 · Page Space — no flexbox anywhere, one arithmetic for every host.
 *
 * THESIS: flexbox is why this component behaves differently in three hosts.
 * Take it out. A lane is a measured line; a port sits at `t` along it, in
 * BOTH modes; a drop is `t` read back off the same line. The component then
 * computes every position itself instead of asking the browser where the
 * browser put things, which is exactly what makes it identical inside a
 * React Flow node at zoom 1.5 and a tldraw shape at zoom 2.5 — the only
 * thing the host contributes is a scale factor that cancels.
 *
 * DECISIONS
 *  1. AUTO MODE RENDERS FROM `t` TOO. `refresh()` already keeps `t` equal to
 *     the even-spacing closed form on every change (portPlacement.ts's own
 *     header), so `justify-evenly` is a second implementation of a number
 *     the model already holds. Deleting it is the load-bearing difference
 *     between this variant and the other four — and it is also the visible
 *     one: `evenT` spaces port CENTRES, flex spaces card BOXES, so a lane of
 *     unequal-width labels lays out differently here. That is a real
 *     decision to judge, not an implementation detail.
 *  2. A custom `collisionDetection` — nearest lane by page-space distance
 *     from the pointer — replaces `closestCenter`/`pointerWithin`. It is a
 *     documented dnd-kit extension point, and it is the one that matches
 *     "which wall is the cursor closest to" for four long thin bands.
 *  3. `useDndMonitor` inside the Lane, so a lane can highlight itself while
 *     it is the target without the Provider threading `isOver` down.
 *  4. No `adjustScale` on the DragOverlay (see contract.tsx's PortGhost).
 *
 * STOCK: DndContext, PointerSensor, useDraggable, useDroppable,
 * useDndMonitor, a custom CollisionDetection, DragOverlay.
 */
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDndMonitor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { PortEdgeId } from "@bbox-ui/core";

import {
  LaneBox,
  PortCard,
  PortEdgesModelProvider,
  PortGhost,
  isHorizontal,
  laneDroppableId,
  laneSlots,
  moveSlot,
  findSlot,
  nearestLiveEdge,
  pointerToT,
  usePortEdgesModel,
  type LaneSlot,
  type PortEdgesImpl,
  type PortEdgesModel,
} from "./contract";

/**
 * Nearest droppable to the live pointer by rect distance — 0 when the
 * pointer is inside, so it degrades exactly to `pointerWithin` there and
 * keeps answering outside it, which is the case four thin bands around a
 * Block spend most of a drag in.
 */
const nearestRect: CollisionDetection = ({ droppableRects, droppableContainers, pointerCoordinates }) => {
  if (!pointerCoordinates) return [];
  const scored = droppableContainers
    .map((container) => {
      const rect = droppableRects.get(container.id);
      if (!rect) return null;
      const dx = Math.max(rect.left - pointerCoordinates.x, 0, pointerCoordinates.x - (rect.left + rect.width));
      const dy = Math.max(rect.top - pointerCoordinates.y, 0, pointerCoordinates.y - (rect.top + rect.height));
      return { id: container.id, data: { droppableContainer: container, value: Math.hypot(dx, dy) } };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => a.data.value - b.data.value);
  return scored;
};

function Provider({ model, children }: { model: PortEdgesModel; children: ReactNode }) {
  const [active, setActive] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function resolve(event: DragEndEvent | DragMoveEvent): { slot: LaneSlot; edge: PortEdgeId; t: number } | null {
    const found = findSlot(model, String(event.active.id));
    if (!found) return null;
    const pointer = event.activatorEvent as PointerEvent;
    const x = pointer.clientX + event.delta.x;
    const y = pointer.clientY + event.delta.y;
    let edge: PortEdgeId | null = null;
    const overId = "over" in event && event.over ? String(event.over.id) : null;
    if (overId) {
      for (const candidate of model.arrangement.edges) {
        if (laneDroppableId(model.ownerId, candidate) === overId) edge = candidate;
      }
    }
    edge = edge ?? nearestLiveEdge(model, x, y) ?? found.edge;
    return { slot: found.slot, edge, t: pointerToT(model.ownerId, edge, x, y) };
  }

  function onDragEnd(event: DragEndEvent) {
    setActive(null);
    const hit = resolve(event);
    if (!hit) return;
    if (model.arrangement.mode === "custom") {
      moveSlot(model, hit.slot, hit.edge, { t: hit.t });
      return;
    }
    // Auto mode: `t` IS the position, so the insertion index is just how many
    // of the lane's other stored `t`s are already below it — no DOM read, and
    // therefore the same answer at any host zoom.
    const others = laneSlots(model, hit.edge).filter((s) => s.headId !== hit.slot.headId);
    const index = others.filter((s) => s.t < hit.t).length;
    moveSlot(model, hit.slot, hit.edge, { index });
  }

  return (
    <PortEdgesModelProvider model={model}>
      <DndContext
        sensors={sensors}
        collisionDetection={nearestRect}
        onDragStart={(event: DragStartEvent) => setActive(String(event.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActive(null)}
      >
        <div style={{ display: "contents" }}>{children}</div>
        <PortGhost portId={active ? (findSlot(model, active)?.slot.headId ?? null) : null} />
      </DndContext>
    </PortEdgesModelProvider>
  );
}

function PlacedCard({ slot, edge }: { slot: LaneSlot; edge: PortEdgeId }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: slot.group });
  const horizontal = isHorizontal(edge);
  return (
    <PortCard
      slot={slot}
      edge={edge}
      dragging={isDragging}
      cardRef={setNodeRef}
      // Both modes place from `t`. `position: absolute` + a percentage along
      // the track is the whole layout engine — no flex line, no free space to
      // distribute, nothing the browser decides.
      style={{
        position: "absolute",
        ...(horizontal
          ? { left: `${slot.t * 100}%`, top: "50%", transform: "translate(-50%, -50%)" }
          : { top: `${slot.t * 100}%`, left: "50%", transform: "translate(-50%, -50%)" }),
      }}
      handleProps={{ ...attributes, ...listeners }}
    />
  );
}

function Lane({ edge, style }: { edge: PortEdgeId; style?: CSSProperties }) {
  const model = usePortEdgesModel();
  const { setNodeRef } = useDroppable({ id: laneDroppableId(model.ownerId, edge) });
  const [over, setOver] = useState(false);
  useDndMonitor({
    onDragMove: (event) => setOver(event.over ? String(event.over.id) === laneDroppableId(model.ownerId, edge) : false),
    onDragEnd: () => setOver(false),
    onDragCancel: () => setOver(false),
  });
  return (
    <LaneBox edge={edge} style={style} isOver={over} laneRef={setNodeRef} trackStyle={{ display: "block" }}>
      {laneSlots(model, edge).map((slot) => (
        <PlacedCard key={slot.group} slot={slot} edge={edge} />
      ))}
    </LaneBox>
  );
}

export const V5_PAGE_SPACE: PortEdgesImpl = {
  id: "v5-page-space",
  label: "V5 · Page Space",
  thesis:
    "Delete flexbox. Every port is placed at `t` along a measured line in both modes, a custom nearest-rect collision picks the wall, and the same arithmetic runs unchanged in the DOM, a React Flow node and a tldraw shape.",
  stock: "DndContext · PointerSensor · useDraggable · useDroppable · useDndMonitor · custom CollisionDetection · DragOverlay",
  Provider,
  Lane,
};
