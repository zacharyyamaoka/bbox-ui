import type { CSSProperties } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { MembersControl, MembersControlProps, MemberSummary } from "./contract";
import { addableTypes } from "./model";
import { AddMemberMenu, SectionHeader, TypeGlyph, acceptsSentence, hintStyle, sectionStyle } from "./shared";

/**
 * V2 · Chips — the densest control: every member and every typed Add
 * option lives on one wrapping row, like a tag input. Moves the "density"
 * axis as far as it goes against List's one-row-per-member baseline.
 */
function ChipsControl(p: MembersControlProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 3 } }));
  const ids = p.members.map((m) => m.id);
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    p.onMove(ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
  };
  const types = addableTypes(p.spec, p.entries, p.members.length);
  const atMax = p.spec.max !== undefined && p.members.length >= p.spec.max;
  return (
    <section data-slot="members-control" data-members-control="chips" style={sectionStyle}>
      <SectionHeader label={p.spec.label ?? "Members"} count={p.members.length} />
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={rectSortingStrategy}>
          <div data-slot="members-chips" style={stripStyle}>
            {p.members.map((m) => (
              <Chip key={m.id} member={m} onSelect={() => p.onSelect(m.id)} onRemove={() => p.onRemove(m.id)} />
            ))}
            {types.length > 0 && types.length <= 3 ? (
              types.map((t) => (
                <button
                  key={t}
                  type="button"
                  data-slot="add-member-type"
                  data-type={t}
                  disabled={atMax}
                  title={atMax ? `At most ${p.spec.max} here` : `Add ${t}`}
                  onClick={() => p.onAdd(t)}
                  style={addChipStyle(atMax)}
                >
                  <TypeGlyph type={t} />+ {t}
                </button>
              ))
            ) : (
              <AddMemberMenu p={p} compact label="+ Add" />
            )}
          </div>
        </SortableContext>
      </DndContext>
      {p.members.length === 0 && (
        <p data-slot="members-empty" style={hintStyle}>
          {acceptsSentence(p)}
        </p>
      )}
      {p.members.length > 0 && <p style={hintStyle}>Click a chip to edit that member; drag to reorder.</p>}
    </section>
  );
}

function Chip({ member, onSelect, onRemove }: { member: MemberSummary; onSelect: () => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: member.id });
  const style: CSSProperties = { ...chipStyle, transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} data-slot="member-chip" data-member-id={member.id} data-member-type={member.type} style={style} {...attributes} {...listeners}>
      <button type="button" data-slot="member-select" onClick={onSelect} title={`Edit ${member.title}`} style={chipBodyStyle}>
        <TypeGlyph type={member.type} />
        <span style={member.untitled ? untitledStyle : undefined}>{member.title}</span>
      </button>
      <button
        type="button"
        data-slot="member-remove"
        aria-label={`Remove ${member.title}`}
        title="Remove"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        style={chipRemoveStyle}
      >
        ×
      </button>
    </div>
  );
}

export const CHIPS: MembersControl = {
  id: "chips",
  label: "Chips",
  blurb: "Every member and the typed Add options on one wrapping row, like a tag input.",
  Control: ChipsControl,
};

const stripStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 4 };
const chipStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 2,
  height: 22,
  borderRadius: 999,
  border: "1px solid var(--bbox-panel-border, #d6d6de)",
  background: "var(--bbox-panel-surface, #fff)",
  cursor: "grab",
  touchAction: "none",
};
const chipBodyStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  height: "100%",
  padding: "0 6px",
  border: "none",
  background: "transparent",
  color: "var(--bbox-panel-fg, #222)",
  cursor: "pointer",
  fontSize: 11,
  whiteSpace: "nowrap",
};
const untitledStyle: CSSProperties = { color: "var(--bbox-panel-fg-muted, #6a6a75)" };
const chipRemoveStyle: CSSProperties = {
  width: 16,
  height: 16,
  marginRight: 3,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "none",
  background: "transparent",
  color: "var(--bbox-panel-fg-muted, #5c5c66)",
  borderRadius: "50%",
  cursor: "pointer",
  fontSize: 11,
  flexShrink: 0,
  padding: 0,
};
function addChipStyle(disabled: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 2,
    height: 22,
    padding: "0 8px",
    border: "1px dashed var(--bbox-panel-border, #d6d6de)",
    borderRadius: 999,
    background: "transparent",
    color: "var(--bbox-panel-fg-muted, #5c5c66)",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 11,
    opacity: disabled ? 0.4 : 1,
  };
}
