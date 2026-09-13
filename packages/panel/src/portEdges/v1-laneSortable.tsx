/**
 * V1 · Lane Sortable — the dnd-kit lab ported as-is.
 *
 * THESIS: the lab (demos/dndkit-lab, stages 3 and 4) already answers this
 * interaction, and it answers it almost entirely in dnd-kit's own sortable
 * machinery. Port it rather than re-derive it: one DndContext, one
 * SortableContext per edge with the matching list-sorting strategy, cross-
 * edge moves committed LIVE in onDragOver (the canonical dnd-kit multi-
 * container recipe), and a DragOverlay that re-renders the Port.
 *
 * DECISIONS
 *  1. `onDragOver` commits the cross-edge move mid-drag, not `onDragEnd`.
 *     That is what makes the lane you are dragging into re-even UNDER the
 *     pointer and the lane you left close its gap — the lab's whole feel.
 *     The cost is that a drag that ends outside every lane has already
 *     moved the port; dnd-kit's own multi-container examples accept this and
 *     so does the lab.
 *  2. A collapsed group is ONE sortable item (its slot id), not n. Rigid
 *     group movement is then not a feature at all — it is what sorting a
 *     slot already does. Lab stage 4's exact trick.
 *  3. Custom mode drops the SortableContext entirely and becomes a plain
 *     droppable lane whose cards are absolutely positioned at `t`. A sorting
 *     strategy has nothing to say about freely positioned cards, and forcing
 *     one on them is how you get cards that snap back.
 *  4. No `adjustScale` on the DragOverlay (see contract.tsx's PortGhost).
 *
 * STOCK: DndContext, PointerSensor, closestCenter, SortableContext,
 * useSortable, horizontalListSortingStrategy, verticalListSortingStrategy,
 * useDroppable, DragOverlay, CSS.Transform.
 */
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
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
  pointerToT,
  usePortEdgesModel,
  type LaneSlot,
  type PortEdgesImpl,
  type PortEdgesModel,
} from "./contract";

/** The head port of the slot a sortable id names — sortable ids are SLOT
 *  ids (a group id when collapsed), and `movePort` moves ports. */
function edgeOfOver(model: PortEdgesModel, overId: string): PortEdgeId | null {
  for (const edge of model.arrangement.edges) {
    if (laneDroppableId(model.ownerId, edge) === overId) return edge;
  }
  return findSlot(model, overId)?.edge ?? null;
}

function Provider({ model, children }: { model: PortEdgesModel; children: ReactNode }) {
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function onDragStart(event: DragStartEvent) {
    setActiveSlot(String(event.active.id));
  }

  // The lab's handleDragOver, unchanged in shape: a cross-container move is
  // committed the moment the pointer enters the other container.
  function onDragOver(event: DragOverEvent) {
    if (model.arrangement.mode === "custom") return;
    const { active, over } = event;
    if (!over) return;
    const found = findSlot(model, String(active.id));
    const to = edgeOfOver(model, String(over.id));
    if (!found || !to || found.edge === to) return;
    const target = laneSlots(model, to);
    const overIndex = target.findIndex((s) => s.group === String(over.id));
    moveSlot(model, found.slot, to, { index: overIndex >= 0 ? overIndex : target.length });
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveSlot(null);
    const { active, over, delta, activatorEvent } = event;
    const slotId = String(active.id);
    const found = findSlot(model, slotId);
    if (!found) return;

    if (model.arrangement.mode === "custom") {
      // Free positioning: the pointer is the truth, exactly as in the lab's
      // handleFreeDragEnd (which adds `delta` to the card's own position).
      const pointer = activatorEvent as PointerEvent;
      const x = pointer.clientX + delta.x;
      const y = pointer.clientY + delta.y;
      const edge = (over ? edgeOfOver(model, String(over.id)) : null) ?? found.edge;
      moveSlot(model, found.slot, edge, { t: pointerToT(model.ownerId, edge, x, y) });
      return;
    }

    if (!over) return;
    const edge = edgeOfOver(model, String(over.id));
    if (!edge) return;
    const slots = laneSlots(model, edge);
    const overIndex = slots.findIndex((s) => s.group === String(over.id));
    const activeIndex = slots.findIndex((s) => s.group === slotId);
    if (overIndex < 0) return;
    if (activeIndex === overIndex) return;
    moveSlot(model, found.slot, edge, { index: overIndex });
  }

  return (
    <PortEdgesModelProvider model={model}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveSlot(null)}
      >
        <div style={{ display: "contents" }}>{children}</div>
        <PortGhost portId={activeSlot ? (findSlot(model, activeSlot)?.slot.headId ?? null) : null} />
      </DndContext>
    </PortEdgesModelProvider>
  );
}

function SortableCard({ slot, edge }: { slot: LaneSlot; edge: PortEdgeId }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slot.group });
  return (
    <PortCard
      slot={slot}
      edge={edge}
      dragging={isDragging}
      cardRef={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      handleProps={{ ...attributes, ...listeners }}
    />
  );
}

function FreeCard({ slot, edge }: { slot: LaneSlot; edge: PortEdgeId }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: slot.group });
  return (
    <PortCard
      slot={slot}
      edge={edge}
      dragging={isDragging}
      cardRef={setNodeRef}
      handleProps={{ ...attributes, ...listeners }}
    />
  );
}

function Lane({ edge, style }: { edge: PortEdgeId; style?: CSSProperties }) {
  const model = usePortEdgesModel();
  const { setNodeRef, isOver } = useDroppable({ id: laneDroppableId(model.ownerId, edge) });
  const slots = laneSlots(model, edge);
  const custom = model.arrangement.mode === "custom";
  const body = custom
    ? slots.map((slot) => <FreeCard key={slot.group} slot={slot} edge={edge} />)
    : slots.map((slot) => <SortableCard key={slot.group} slot={slot} edge={edge} />);
  const box = (
    <LaneBox edge={edge} style={style} isOver={isOver} laneRef={setNodeRef}>
      {body}
    </LaneBox>
  );
  if (custom) return box;
  return (
    <SortableContext
      id={laneDroppableId(model.ownerId, edge)}
      items={slots.map((s) => s.group)}
      strategy={isHorizontal(edge) ? horizontalListSortingStrategy : verticalListSortingStrategy}
    >
      {box}
    </SortableContext>
  );
}

export const V1_LANE_SORTABLE: PortEdgesImpl = {
  id: "v1-lane-sortable",
  label: "V1 · Lane Sortable",
  thesis:
    "Port the dnd-kit lab as-is: a SortableContext per edge, list-sorting strategies, cross-edge moves committed live in onDragOver, a DragOverlay that re-renders the Port.",
  stock:
    "SortableContext · useSortable · horizontalListSortingStrategy · verticalListSortingStrategy · closestCenter · useDroppable · DragOverlay · CSS.Transform",
  Provider,
  Lane,
};
