import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { useState } from "react";

import { CardPreview, SortableCard } from "./Card";
import { Container } from "./Container";
import { SpacingControl } from "./SpacingControl";
import type { SpacingScheme } from "./types";

const INITIAL_ITEMS = ["A1", "A2", "A3", "A4", "A5"];

export function SortableRow() {
  const [items, setItems] = useState(INITIAL_ITEMS);
  const [spacing, setSpacing] = useState<SpacingScheme>("space-between");
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems((prev) => {
        const oldIndex = prev.indexOf(active.id as string);
        const newIndex = prev.indexOf(over.id as string);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
    setActiveId(null);
  }

  return (
    <section className="stage">
      <header className="stage__header">
        <h2>1. Single sortable row</h2>
        <p>
          Drag a card left or right — the others slide over to make room. The row keeps its
          size; only the cards move.
        </p>
        <SpacingControl value={spacing} onChange={setSpacing} />
      </header>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <Container
          id="row"
          items={items}
          strategy={horizontalListSortingStrategy}
          axis="row"
          spacing={spacing}
          size={{ width: 640, height: 160 }}
        >
          {items.map((id) => (
            <SortableCard key={id} id={id} label={id} orientation="portrait" />
          ))}
        </Container>
        <DragOverlay>
          {activeId ? <CardPreview label={activeId} orientation="portrait" /> : null}
        </DragOverlay>
      </DndContext>
    </section>
  );
}
