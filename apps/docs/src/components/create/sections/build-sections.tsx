"use client";

import type { ReactNode } from "react";
import type { FieldSpec, FieldValue, PresetSpec } from "@bbox-ui/schema";
import { governedFieldIds } from "@bbox-ui/schema";
import type { BoundField, ComponentEntry, InspectorSection, Instance, SectionAction, SectionRow, Subject } from "@bbox-ui/panel";
import {
  MEMBERS_CONTROLS,
  TIER_RANK,
  addableTypes,
  classifyField,
  groupRows,
  matchesFilter,
  memberSpecFor,
  summarize,
  TypedAddMenu,
  topLevel,
  type Tier,
} from "@bbox-ui/panel";
import { HOST_FIELDS, RENDER_LABEL, hostWriter } from "./host-fields";
import { defaultPosition, type CanvasPosition, type Render } from "../contract";

/**
 * The whole inspector for one subject, as SECTIONS.
 *
 * WHY this file exists — Zach, 2026-09-12: "Originally we want to split the
 * fields and the members but this is actually just very confusing… what
 * would make sense here is to see this panel split in between
 * properties/members related to the block, the header, footer, body, ports.
 * etc grouped together."
 *
 * The old split was fields-then-lists: one panel of every scalar, then the
 * lists underneath, and a Bar's `hidden` stranded between the two as a
 * hand-drawn caption row (`members-section.tsx`'s `RegionHeader`). The
 * split that carries meaning is ANATOMICAL — a Block's Header section holds
 * the Bar's own properties AND the three cell lists that live in it. One
 * piece of the Block, one run of the panel.
 *
 * Three kinds of section come out of this, and only one of them is
 * declared:
 *
 *  - DECLARED — `FieldSpec.section` groups a component's own fields under a
 *    sub-header (Block's Layout, the shared Appearance bundle). This is the
 *    "like group, but for sub-headers" declaration he asked for.
 *  - DERIVED — a slot is already a named piece of anatomy with a label and
 *    a region (`SlotSpec`), and a component's `members` spec already has a
 *    label. Those become sections mechanically; declaring them a second
 *    time would be two places to keep in sync for no new fact.
 *  - HOST-OWNED — the render surface's own X/Y. Same machinery, different
 *    subject; see `host-fields.ts` for why it needs no new mechanism.
 */

export interface BuildSectionsInput {
  entries: ComponentEntry[];
  instances: Instance[];
  /** The single selected instance, when there is exactly one. */
  subject: Instance | null;
  /** Resolution subjects for the selection (one per selected instance). */
  subjects: Subject[];
  componentName: string;
  /** The fields the panel is showing for the selection. */
  fields: FieldSpec[];
  presets: PresetSpec[];
  toSubject?: (props: Record<string, unknown>) => Record<string, unknown>;
  tier: Tier;
  filter: string;
  onChange: (fieldId: string, value: FieldValue) => void;
  onClearOverride: (fieldId: string) => void;
  onSetProp: (id: string, fieldId: string, value: FieldValue) => void;
  onClearProp: (id: string, fieldId: string) => void;
  onAddMember: (parentId: string, type: string) => void;
  onRemoveMember: (id: string) => void;
  onMoveMember: (parentId: string, from: number, to: number) => void;
  onSelectInstance: (id: string) => void;
  /** The host-owned stratum — only built when the chosen design asks for
   *  it (`SectionPanelVariant.renderer`). */
  renderer: boolean;
  render: Render;
  positions: Record<string, CanvasPosition>;
  onSetPosition: (id: string, next: CanvasPosition) => void;
}

/**
 * How much of a FOREIGN instance's field list surfaces in its parent's
 * section.
 *
 * WHY it is capped at Advanced and floored there too, ignoring the panel's
 * own tier: the Bar's `hidden` / `line` / `size` are in the Block's
 * inspector precisely because they are the region's everyday controls —
 * Zach, 2026-09-11: "a key control I then want is hide header, hide footer
 * … hide the line" — and `classifyField` calls a bare toggle Advanced, so
 * the panel's Simple tier would have hidden exactly the rows the section
 * exists to show. Capping at Advanced keeps the Bar's Expert paint tokens
 * out of the Block's panel, where they would be noise; they are one ⚙
 * click away in the Bar's own inspector, which is what ⚙ is for.
 */
const FOREIGN_TIER: Tier = "advanced";

function bind(
  field: FieldSpec,
  targetId: string,
  subjects: Subject[],
  presets: PresetSpec[],
  governed: Set<string>,
  toSubject: ((props: Record<string, unknown>) => Record<string, unknown>) | undefined,
  onChange: (fieldId: string, value: FieldValue) => void,
  onClearOverride: (fieldId: string) => void,
  extra?: Pick<BoundField, "disabled" | "note" | "provenance">,
): BoundField {
  return { field, targetId, subjects, presets, governed, toSubject, onChange, onClearOverride, ...extra };
}

/** Fields → rows, pairing anything that declares the same `group`. */
function rowsFor(fields: FieldSpec[], toBound: (field: FieldSpec) => BoundField): SectionRow[] {
  return groupRows(fields).map((row) =>
    Array.isArray(row)
      ? ({ kind: "pair", fields: [toBound(row[0]), toBound(row[1])] } as SectionRow)
      : ({ kind: "field", field: toBound(row) } as SectionRow),
  );
}

/**
 * A member list, headless.
 *
 * WHY `chrome: "none"` and why the verbs come back out as `actions`: the
 * section layer draws exactly one `FoldRow` for this list, and that row
 * carries the label, the count and these verbs. A control that also drew a
 * header put two on screen — the bug Zach screenshotted. There is now no
 * configuration in which both exist.
 */
function listRow(
  input: BuildSectionsInput,
  parent: Instance,
  entry: ComponentEntry,
  label: string,
  onSelectParent?: () => void,
  moveScope?: (from: number, to: number) => void,
): SectionRow | null {
  const spec = memberSpecFor(entry, parent);
  if (!spec) return null;
  const members = (parent.members ?? [])
    .map((id) => summarize(input.instances, id))
    .filter((m): m is NonNullable<typeof m> => !!m);
  const Control = MEMBERS_CONTROLS[0]!.Control;
  const types = addableTypes(spec, input.entries, members.length);
  const atMax = spec.max !== undefined && members.length >= spec.max;
  const node: ReactNode = (
    <div data-slot="members-section" data-parent-id={parent.id}>
      <Control
        parent={parent}
        entry={entry}
        spec={{ ...spec, label }}
        members={members}
        summaryOf={(id) => summarize(input.instances, id)}
        entryFor={(t) => input.entries.find((e) => e.name === t)!}
        entries={input.entries}
        preview={(id) => {
          const inst = input.instances.find((i) => i.id === id);
          const e = inst && input.entries.find((x) => x.name === inst.type);
          return e && inst ? e.render(inst.props) : null;
        }}
        onAdd={(type) => input.onAddMember(parent.id, type)}
        onRemove={input.onRemoveMember}
        onMove={(from, to) => (moveScope ? moveScope(from, to) : input.onMoveMember(parent.id, from, to))}
        onSelect={input.onSelectInstance}
        onSelectParent={onSelectParent}
        chrome="none"
      />
    </div>
  );
  const actions: SectionAction[] = [];
  if (onSelectParent) {
    actions.push({ id: "open-fill", glyph: "⚙", title: `Edit the ${parent.type} that fills ${label}`, onInvoke: onSelectParent });
  }
  actions.push({
    id: "add-member",
    title: atMax ? `At most ${spec.max} here` : types.length === 1 ? `Add ${types[0]}` : `Add to ${label}`,
    node: <TypedAddMenu types={types} atMax={atMax} max={spec.max} title={`Add to ${label}`} onAdd={(type) => input.onAddMember(parent.id, type)} />,
  });
  return { kind: "list", list: { id: parent.id, label, count: members.length, node, actions } };
}

export function buildSections(input: BuildSectionsInput): InspectorSection[] {
  const governed = new Set(governedFieldIds(input.presets));
  const searching = input.filter.trim() !== "";
  const visible = (fields: FieldSpec[], presets: PresetSpec[], gov: Set<string>, cap?: Tier) =>
    fields
      .filter((f) => matchesFilter(f, input.filter))
      .filter((f) => {
        if (searching) return true;
        const t = classifyField(f, presets, gov);
        return TIER_RANK[t] <= TIER_RANK[cap ?? input.tier];
      });

  const sections: InspectorSection[] = [];

  /* ---- 1 · the subject's own fields, by declared `section` ---------- */
  const own = visible(input.fields, input.presets, governed);
  const bucketOrder: string[] = [];
  const buckets = new Map<string, FieldSpec[]>();
  for (const field of own) {
    const id = field.section ?? "__self__";
    if (!buckets.has(id)) {
      buckets.set(id, []);
      bucketOrder.push(id);
    }
    buckets.get(id)!.push(field);
  }
  const selectors = Array.from(new Set(input.presets.map((p) => p.selector)));
  // Fields a preset governs that some selected subject has overridden —
  // Figma's "modified instance" tell, and the one thing the separate PRESET
  // row used to carry that a plain field row does not.
  //
  // WHY there is no separate preset picker any more: a preset's selector IS
  // a field (`state`), with the same options and the same writer, so the
  // old panel drew the same control twice — a violet PRESET row and a State
  // row one line apart. "All controls should kinda be from a standard
  // control list" (Zach, 2026-09-12) settles it: the selector's own standard
  // row is the picker. Only the RESET had nowhere else to go, so it became
  // what it always was — an action on the section's title.
  const overriddenGoverned = Array.from(governed).filter((id) => input.subjects.some((s) => s.props[id] !== undefined));
  for (const id of bucketOrder) {
    const fields = buckets.get(id)!;
    const toBound = (field: FieldSpec) =>
      bind(field, input.subject?.id ?? "selection", input.subjects, input.presets, governed, input.toSubject, input.onChange, input.onClearOverride);
    const holdsSelector = fields.some((f) => selectors.includes(f.id));
    const actions: SectionAction[] =
      holdsSelector && overriddenGoverned.length > 0
        ? [
            {
              id: "reset-preset",
              glyph: "↺",
              title: `Clear ${overriddenGoverned.length} override${overriddenGoverned.length === 1 ? "" : "s"} the preset governs: ${overriddenGoverned.join(", ")}`,
              onInvoke: () => overriddenGoverned.forEach((fieldId) => input.onClearOverride(fieldId)),
            },
          ]
        : [];
    sections.push({
      id: id === "__self__" ? "self" : id,
      label: id === "__self__" ? input.componentName : titleCase(id),
      rows: rowsFor(fields, toBound),
      actions,
    });
  }

  const subject = input.subject;
  if (!subject) return sections;
  const entry = input.entries.find((e) => e.name === subject.type);
  if (!entry) return sections;
  const byId = new Map(input.instances.map((i) => [i.id, i]));

  /* ---- 2 · one section per SLOT, fields and lists together ---------- */
  for (const slot of entry.slots ?? []) {
    const fill = (subject.members ?? []).map((id) => byId.get(id)).find((i) => i?.slot?.id === slot.id);
    const fillEntry = fill && input.entries.find((e) => e.name === fill.type);
    if (!fill || !fillEntry) continue;
    const fillGoverned = new Set(governedFieldIds(fillEntry.presets));
    const fillSubjects: Subject[] = [{ id: fill.id, props: fill.props, inherited: fill.inherited }];
    // WHY only the fill's UNSECTIONED fields: a Bar declares `hidden`,
    // `line`, `size` and `padding` at its root and inherits the shared
    // Appearance bundle, which declares `section: "appearance"`. A region
    // section surfaces the fill's own root properties — the region's
    // everyday controls — and leaves its declared sub-sections to its own
    // inspector, one ⚙ away. Without this rule the Block's Header section
    // would carry the Bar's State, Tone and Lens too, which is the whole
    // Bar, not the region.
    const fillFields = visible(
      fillEntry.fields.filter((f) => f.section === undefined),
      fillEntry.presets,
      fillGoverned,
      FOREIGN_TIER,
    );
    const toBound = (field: FieldSpec) =>
      bind(
        field,
        fill.id,
        fillSubjects,
        fillEntry.presets,
        fillGoverned,
        fillEntry.toSubject,
        (fieldId, value) => input.onSetProp(fill.id, fieldId, value),
        (fieldId) => input.onClearProp(fill.id, fieldId),
      );
    const rows: SectionRow[] = rowsFor(fillFields, toBound);
    const hidden = fill.props.hidden === true;

    // A fill that has slots of its own (a Bar) contributes its cells' lists
    // to THIS section — Header · Left / Center / Right — rather than
    // spawning three sections of its own. One piece of anatomy, one run.
    if (fillEntry.slots) {
      for (const cell of fillEntry.slots) {
        const cellFill = (fill.members ?? []).map((id) => byId.get(id)).find((i) => i?.slot?.id === cell.id);
        const cellEntry = cellFill && input.entries.find((e) => e.name === cellFill.type);
        if (!cellFill || !cellEntry) continue;
        const row = listRow(input, cellFill, cellEntry, cell.label);
        if (row && !hidden) rows.push(row);
      }
    } else {
      const row = listRow(input, fill, fillEntry, slot.label);
      if (row && !hidden) rows.push(row);
    }

    sections.push({
      id: slot.region,
      label: slot.label,
      rows,
      // ⚙ opens the instance that fills the region, for everything the
      // section deliberately does not surface (its Appearance bundle).
      actions: [
        {
          id: "open-fill",
          glyph: "⚙",
          title: `Open the ${fill.type} that fills ${slot.label}`,
          onInvoke: () => input.onSelectInstance(fill.id),
        },
      ],
      summary: hidden ? "hidden" : undefined,
      muted: hidden,
    });
  }

  /* ---- 3 · the subject's OWN members ------------------------------- */
  if (entry.members && !entry.slots) {
    const spec = memberSpecFor(entry, subject);
    const row = spec ? listRow(input, subject, entry, spec.label ?? "Members") : null;
    if (row) sections.push({ id: "members", label: spec!.label ?? "Members", rows: [row], actions: [] });
  }

  /* ---- 4 · the HOST-owned stratum ---------------------------------- */
  if (input.renderer) {
    const roots = topLevel(input.instances);
    const isRoot = roots.some((i) => i.id === subject.id);
    if (isRoot) {
      const index = roots.findIndex((i) => i.id === subject.id);
      const position = input.positions[subject.id] ?? defaultPosition(index);
      const editable = input.render !== "dom";
      const hostSubjects: Subject[] = [{ id: subject.id, props: { x: position.x, y: position.y } }];
      const note = hostWriter(input.render);
      const rows = rowsFor(HOST_FIELDS, (field) =>
        bind(
          field,
          subject.id,
          hostSubjects,
          [],
          new Set(),
          undefined,
          (fieldId, value) => {
            const n = Number(value);
            if (!Number.isFinite(n)) return;
            input.onSetPosition(subject.id, { ...position, [fieldId]: n } as CanvasPosition);
          },
          // A host fact has no override layer to clear — the value IS the
          // canvas. The reset button never renders for it (no preset and no
          // inherited candidate), so this is unreachable rather than wrong.
          () => {},
          // A host fact has exactly one layer: the canvas. No preset, no
          // inheritance, no default it could be said to override — so the
          // provenance tag and the cascade disclosure have nothing to say,
          // and saying it anyway put a violet OVERRIDE on every X and Y.
          { disabled: !editable, note, provenance: "none" },
        ),
      );
      sections.push({
        id: "renderer",
        label: `Renderer · ${RENDER_LABEL[input.render]}`,
        rows,
        actions: [],
        hostOwned: true,
        // `RENDERS`' own `canMove: false` for the DOM render IS "this
        // region is switched off" — the same fact `muted` already carries
        // for a hidden Bar. No second concept.
        muted: !editable,
        summary: editable ? undefined : "no canvas",
      });
    }
  }

  return sections.filter((s) => s.rows.length > 0);
}

function titleCase(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/** Every list id a build produced, so the host can drop fold state for
 *  lists that no longer exist. */
export function listIdsIn(sections: InspectorSection[]): string[] {
  return sections.flatMap((s) => s.rows.filter((r) => r.kind === "list").map((r) => (r as { list: { id: string } }).list.id));
}
