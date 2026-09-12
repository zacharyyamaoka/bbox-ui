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
import { arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useState } from "react";

import { CardPreview, SortableCard } from "./Card";
import { Container } from "./Container";
import { SpacingControl } from "./SpacingControl";
import type { SpacingScheme } from "./types";

const INITIAL_ITEMS = ["B1", "B2", "B3", "B4"];

export function SortableColumn() {
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
        <h2>2. Single sortable column</h2>
        <p>Drag a card up or down. Same mechanism as the row, just the other axis.</p>
        <SpacingControl value={spacing} onChange={setSpacing} />
      </header>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <Container
          id="column"
          items={items}
          strategy={verticalListSortingStrategy}
          axis="column"
          spacing={spacing}
          size={{ width: 200, height: 460 }}
        >
          {items.map((id) => (
            <SortableCard key={id} id={id} label={id} orientation="landscape" />
          ))}
        </Container>
        <DragOverlay>
          {activeId ? <CardPreview label={activeId} orientation="landscape" /> : null}
        </DragOverlay>
      </DndContext>
    </section>
  );
}
