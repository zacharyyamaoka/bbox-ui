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
import { arrayMove, horizontalListSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState } from "react";
import type { CSSProperties } from "react";

import { buildColorMap, CARD_IDS, CARDS_BY_ID, computeSlots, GROUPING_SETS, type Slot } from "./grouping";

type Mode = "off" | "grouped" | "collapsed";

const MODES: { value: Mode; label: string; hint: string }[] = [
  { value: "off", label: "Off", hint: "Every card is its own slot — plain individual reordering." },
  {
    value: "grouped",
    label: "Grouped",
    hint: "Groups sit side by side and move as one rigid unit; every member still shows as its own card.",
  },
  {
    value: "collapsed",
    label: "Collapsed",
    hint: "Groups sit side by side, move as one unit, AND merge into a single representative card.",
  },
];

function GroupingSetControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="spacing-control">
      <span className="spacing-control__label">Grouping set</span>
      <div className="segmented">
        {GROUPING_SETS.map((set) => (
          <button
            key={set.id}
            type="button"
            className={`segmented__option${value === set.id ? " is-active" : ""}`}
            onClick={() => onChange(set.id)}
            title={set.description}
          >
            {set.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ModeControl({
  value,
  onChange,
  disabled,
}: {
  value: Mode;
  onChange: (mode: Mode) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`spacing-control${disabled ? " is-disabled" : ""}`}>
      <span className="spacing-control__label">Mode</span>
      <div className="segmented">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            className={`segmented__option${value === m.value ? " is-active" : ""}`}
            onClick={() => onChange(m.value)}
            disabled={disabled}
            title={m.hint}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Chip({ text, color }: { text: string; color: string }) {
  return (
    <span className="card__chip" style={{ background: color }}>
      {text}
    </span>
  );
}

function GroupSlotContent({
  slot,
  colorMap,
  collapsed,
}: {
  slot: Slot;
  colorMap: Map<string, string>;
  collapsed: boolean;
}) {
  const isGroup = slot.members.length > 1;
  const color = colorMap.get(slot.slotId);

  if (collapsed && isGroup) {
    return (
      <div className="card card--leaf card--collapsed" style={color ? { borderColor: color } : undefined}>
        {color ? <Chip text={slot.slotId} color={color} /> : null}
        <span className="card__label">×{slot.members.length}</span>
      </div>
    );
  }

  return (
    <>
      {slot.members.map((member) => (
        <div
          key={member.id}
          className="card card--leaf"
          style={isGroup && color ? { borderColor: color } : undefined}
        >
          {isGroup && color ? <Chip text={`${slot.slotId}·${member.order}`} color={color} /> : null}
          <span className="card__label">{CARDS_BY_ID[member.id].label}</span>
        </div>
      ))}
    </>
  );
}

function GroupSlot({
  slot,
  colorMap,
  collapsed,
}: {
  slot: Slot;
  colorMap: Map<string, string>;
  collapsed: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slot.slotId,
  });
  const isGroup = slot.members.length > 1;
  const color = colorMap.get(slot.slotId);

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    borderColor: isGroup && !collapsed ? color : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group-slot${isGroup && !collapsed ? " group-slot--cluster" : ""}${isDragging ? " is-dragging" : ""}`}
      {...attributes}
      {...listeners}
    >
      <GroupSlotContent slot={slot} colorMap={colorMap} collapsed={collapsed} />
    </div>
  );
}

export function GroupingBoard() {
  const [groupingSetId, setGroupingSetId] = useState("pairs");
  const [mode, setMode] = useState<Mode>("grouped");
  const [cardOrder, setCardOrder] = useState<string[]>(CARD_IDS);
  const [activeId, setActiveId] = useState<string | null>(null);

  const groupingSet = GROUPING_SETS.find((s) => s.id === groupingSetId) ?? GROUPING_SETS[0];
  const colorMap = useMemo(() => buildColorMap(groupingSet), [groupingSet]);
  const clustered = mode !== "off";
  const slots = useMemo(() => computeSlots(cardOrder, groupingSet, clustered), [cardOrder, groupingSet, clustered]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleGroupingSetChange(id: string) {
    setGroupingSetId(id);
    setMode(id === "none" ? "off" : "grouped");
    setCardOrder(CARD_IDS);
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = slots.findIndex((s) => s.slotId === active.id);
    const newIndex = slots.findIndex((s) => s.slotId === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(slots, oldIndex, newIndex);
    setCardOrder(reordered.flatMap((s) => s.members.map((m) => m.id)));
  }

  const activeSlot = activeId ? slots.find((s) => s.slotId === activeId) : undefined;

  return (
    <section className="stage">
      <header className="stage__header">
        <h2>4. Grouping ports</h2>
        <p>
          Every card gets a group id + an order within that group (a "grouping set" — a lens,
          since the same 8 ports can cluster differently depending on which one is active).
          Groups reorganize side by side, move together like a rigid body, and can collapse
          into one representative card.
        </p>
        <div className="controls-row">
          <GroupingSetControl value={groupingSetId} onChange={handleGroupingSetChange} />
          <ModeControl value={mode} onChange={setMode} disabled={groupingSetId === "none"} />
        </div>
        <p className="stage__note">{groupingSet.description}</p>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={slots.map((s) => s.slotId)} strategy={horizontalListSortingStrategy}>
          <div className="container container--row container--grouping">
            {slots.map((slot) => (
              <GroupSlot
                key={slot.slotId}
                slot={slot}
                colorMap={colorMap}
                collapsed={mode === "collapsed"}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeSlot ? (
            <div
              className={`group-slot${activeSlot.members.length > 1 && mode !== "collapsed" ? " group-slot--cluster" : ""}`}
              style={{ borderColor: activeSlot.members.length > 1 ? colorMap.get(activeSlot.slotId) : undefined }}
            >
              <GroupSlotContent
                slot={activeSlot}
                colorMap={colorMap}
                collapsed={mode === "collapsed"}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </section>
  );
}
