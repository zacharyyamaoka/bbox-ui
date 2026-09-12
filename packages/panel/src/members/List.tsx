import type { CSSProperties } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { MembersControl, MembersControlProps, MemberSummary } from "./contract";
import { AddMemberMenu, MemberBadge, SectionHeader, TypeGlyph, acceptsSentence, hintStyle, iconButtonStyle, sectionStyle } from "./shared";

/**
 * V1 · List — the SystemSketch Arms/Members section, as a bbox-ui control.
 *
 * One row per member in order: grip · type glyph · title · type · badge · ×.
 * Click the row to select the member; drag the grip to reorder (dnd-kit
 * owns the gesture, `onMove` owns where it lands); + in the header opens the
 * typed Add menu. This is the shape Zach pasted as "one simple idea" and the
 * one his own inspectors already use, so it is the default.
 */
function ListControl(p: MembersControlProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 3 } }));
  const ids = p.members.map((m) => m.id);
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    p.onMove(ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
  };
  return (
    <section data-slot="members-control" data-members-control="list" style={sectionStyle}>
      <SectionHeader
        label={p.parent.slot?.label ?? p.spec.label ?? "Members"}
        count={p.members.length}
        right={
          <>
            {p.onSelectParent && (
              <button type="button" data-slot="members-edit-parent" title={`Edit the ${p.parent.type} that fills this slot`} onClick={p.onSelectParent} style={iconButtonStyle}>
                ⚙
              </button>
            )}
            <AddMemberMenu p={p} />
          </>
        }
      />
      {p.members.length === 0 ? (
        <p data-slot="members-empty" style={hintStyle}>
          No members yet. {acceptsSentence(p)}
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ul data-slot="members-list" style={listStyle}>
              {p.members.map((m) => (
                <Row key={m.id} member={m} onSelect={() => p.onSelect(m.id)} onRemove={() => p.onRemove(m.id)} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      {p.members.length > 0 && (
        <p style={hintStyle}>One row per member, in order. Click a row to edit that member; drag ⋮⋮ to reorder.</p>
      )}
    </section>
  );
}

function Row({ member, onSelect, onRemove }: { member: MemberSummary; onSelect: () => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: member.id });
  const style: CSSProperties = { ...rowStyle, transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <li ref={setNodeRef} data-slot="member-row" data-member-id={member.id} data-member-type={member.type} style={style}>
      <button type="button" data-slot="member-grip" aria-label={`Reorder ${member.title}`} title="Drag to reorder" style={gripStyle} {...attributes} {...listeners}>
        ⋮⋮
      </button>
      <button type="button" data-slot="member-select" onClick={onSelect} title={`Edit ${member.title}`} style={bodyStyle}>
        <TypeGlyph type={member.type} />
        <span data-slot="member-title" style={{ ...titleStyle, ...(member.untitled ? untitledStyle : {}) }}>
          {member.title}
        </span>
        <span data-slot="member-type" style={typeStyle}>
          {member.type}
        </span>
        <MemberBadge member={member} />
      </button>
      <button type="button" data-slot="member-remove" aria-label={`Remove ${member.title}`} title="Remove" onClick={onRemove} style={iconButtonStyle}>
        ×
      </button>
    </li>
  );
}

export const LIST: MembersControl = {
  id: "list",
  label: "List",
  blurb: "One row per member: grip, type, title, remove. The Arms/Members section from SystemSketch's inspector, so nothing to relearn. Default.",
  Control: ListControl,
};

const listStyle: CSSProperties = { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 1 };
const rowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 2, minHeight: 24, borderRadius: 4, background: "var(--bbox-panel-surface, #fff)" };
const gripStyle: CSSProperties = { ...iconButtonStyle, cursor: "grab", letterSpacing: -2, fontSize: 10, touchAction: "none" };
const bodyStyle: CSSProperties = { flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, height: 24, padding: "0 6px", border: "1px solid var(--bbox-panel-border, #d6d6de)", borderRadius: 4, background: "transparent", color: "var(--bbox-panel-fg, #222)", cursor: "pointer", textAlign: "left", fontSize: 12 };
const titleStyle: CSSProperties = { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const untitledStyle: CSSProperties = { color: "var(--bbox-panel-fg-muted, #6a6a75)" };
const typeStyle: CSSProperties = { fontSize: 10, color: "var(--bbox-panel-fg-faint, #9a9aa5)", flexShrink: 0 };
