/**
 * V3 · Slot Droppables — the drop target is a real, named DOM node.
 *
 * THESIS: every bug in the other four is a geometry bug, and geometry bugs
 * are invisible. Make the insertion point itself a droppable: a lane with n
 * cards renders n+1 gap droppables, `owner:gap:top:2`. dnd-kit's own
 * collision then answers "where does this land" with a STRING, so there is
 * no pointer arithmetic to get wrong, the hovered gap can open to preview
 * the insert, and a journey can assert the drop target by name instead of
 * by measuring pixels.
 *
 * DECISIONS
 *  1. Gaps are `flex: 1` boxes between the cards, so in auto mode they ARE
 *     the spacing — `justify-content` is switched off and the equal gaps
 *     come out of equal flex-grow. That keeps the even-spacing visual while
 *     making the space between two ports a thing you can hover.
 *  2. The hovered gap grows (flex-grow 2.6) and shows an insertion rule, so
 *     the lane parts where the port will land — the one live preview in the
 *     five that costs no model write.
 *  3. Custom mode has no insertion points, so gaps are not rendered at all
 *     and the drop falls back to the lane droppable + pointer -> t. Named
 *     targets and free positioning are different questions; pretending
 *     otherwise is how you get a card that snaps to a slot it was never
 *     dropped in.
 *  4. No `adjustScale` on the DragOverlay (see contract.tsx's PortGhost).
 *
 * STOCK: DndContext, PointerSensor, closestCenter, useDraggable,
 * useDroppable (x n+1 per lane), DragOverlay.
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
  type DragStartEvent,
} from "@dnd-kit/core";
import type { PortEdgeId } from "@bbox-ui/core";

import {
  LaneBox,
  PortCard,
  PortEdgesModelProvider,
  PortGhost,
  gapDroppableId,
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

/** `owner:gap:<edge>:<index>` -> { edge, index }, by membership test against
 *  the live edges rather than by slicing, so an ownerId containing ":" still
 *  round-trips. */
function parseGap(model: PortEdgesModel, overId: string): { edge: PortEdgeId; index: number } | null {
  for (const edge of model.arrangement.edges) {
    const prefix = gapDroppableId(model.ownerId, edge, 0).slice(0, -1);
    if (overId.startsWith(prefix)) {
      const index = Number(overId.slice(prefix.length));
      if (Number.isFinite(index)) return { edge, index };
    }
  }
  return null;
}

function parseLane(model: PortEdgesModel, overId: string): PortEdgeId | null {
  for (const edge of model.arrangement.edges) {
    if (laneDroppableId(model.ownerId, edge) === overId) return edge;
  }
  return null;
}

function Provider({ model, children }: { model: PortEdgesModel; children: ReactNode }) {
  const [active, setActive] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function onDragStart(event: DragStartEvent) {
    setActive(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActive(null);
    const { active: activeItem, over, delta, activatorEvent } = event;
    const found = findSlot(model, String(activeItem.id));
    if (!found || !over) return;
    const overId = String(over.id);

    const gap = parseGap(model, overId);
    if (gap && model.arrangement.mode === "auto") {
      // The index a gap names counts the lane's cards INCLUDING the one being
      // moved; `movePort` re-inserts into the lane without it, so a move
      // rightward inside its own lane has to shed the slot it vacated.
      const slots = laneSlots(model, gap.edge);
      const from = slots.findIndex((s) => s.group === String(activeItem.id));
      const index = from >= 0 && gap.index > from ? gap.index - 1 : gap.index;
      moveSlot(model, found.slot, gap.edge, { index });
      return;
    }

    const edge = parseLane(model, overId) ?? gap?.edge ?? found.edge;
    const pointer = activatorEvent as PointerEvent;
    if (model.arrangement.mode === "custom") {
      moveSlot(model, found.slot, edge, { t: pointerToT(model.ownerId, edge, pointer.clientX + delta.x, pointer.clientY + delta.y) });
    } else {
      moveSlot(model, found.slot, edge, { index: laneSlots(model, edge).length });
    }
  }

  return (
    <PortEdgesModelProvider model={model}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActive(null)}
      >
        <div style={{ display: "contents" }}>{children}</div>
        <PortGhost portId={active ? (findSlot(model, active)?.slot.headId ?? null) : null} />
      </DndContext>
    </PortEdgesModelProvider>
  );
}

function Gap({ edge, index }: { edge: PortEdgeId; index: number }) {
  const model = usePortEdgesModel();
  const { setNodeRef, isOver } = useDroppable({ id: gapDroppableId(model.ownerId, edge, index) });
  const horizontal = isHorizontal(edge);
  return (
    <span
      ref={setNodeRef}
      data-slot="port-gap"
      data-edge={edge}
      data-index={index}
      data-over={isOver || undefined}
      style={{
        flex: isOver ? "2.6 1 0%" : "1 1 0%",
        alignSelf: "stretch",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "flex-grow 90ms ease",
        minWidth: horizontal ? 2 : undefined,
        minHeight: horizontal ? undefined : 2,
      }}
    >
      {isOver ? (
        <span
          data-slot="port-gap-rule"
          style={{
            background: "var(--bbox-accent)",
            borderRadius: 2,
            ...(horizontal ? { width: 2, height: "70%" } : { height: 2, width: "70%" }),
          }}
        />
      ) : null}
    </span>
  );
}

function GapCard({ slot, edge }: { slot: LaneSlot; edge: PortEdgeId }) {
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
  return (
    <LaneBox
      edge={edge}
      style={style}
      isOver={isOver}
      laneRef={setNodeRef}
      // Auto mode's spacing comes from the gaps' own flex-grow here, not from
      // justify-content — that is the whole point of making the space between
      // two ports a droppable thing.
      trackStyle={custom ? undefined : { justifyContent: "flex-start" }}
    >
      {custom
        ? slots.map((slot) => <GapCard key={slot.group} slot={slot} edge={edge} />)
        : slots.flatMap((slot, i) => [
            <Gap key={`gap-${i}`} edge={edge} index={i} />,
            <GapCard key={slot.group} slot={slot} edge={edge} />,
          ]).concat(<Gap key={`gap-${slots.length}`} edge={edge} index={slots.length} />)}
    </LaneBox>
  );
}

export const V3_SLOT_DROPPABLES: PortEdgesImpl = {
  id: "v3-slot-droppables",
  label: "V3 · Slot Droppables",
  thesis:
    "Make the insertion point itself a droppable: n+1 named gaps per lane, so the drop target is a string dnd-kit resolves, the hovered gap previews the insert, and a test asserts a name instead of a pixel.",
  stock: "DndContext · PointerSensor · closestCenter · useDraggable · useDroppable (n+1 per lane) · DragOverlay",
  Provider,
  Lane,
};
