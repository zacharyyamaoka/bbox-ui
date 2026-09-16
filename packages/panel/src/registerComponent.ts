import type { ReactNode } from "react";
import type { FieldSpec, PresetSpec } from "@bbox-ui/schema";
import type { Arrangement, Placements } from "@bbox-ui/core";
import type { MembersSpec } from "./members/contract";

export interface SlotSpec {
  /** Stable id, dotted by region: "header.left". */
  id: string;
  /** What the inspector and the navigator print: "Header · left". */
  label: string;
  /** Which of the parent's regions it sits in; the parent's render decides
   *  what a region looks like. */
  region: string;
  /** The component that fills it. Always registered; today always "Flex". */
  fill: string;
  /** Props the filling instance starts with (a footer-right Flex justifies
   *  end). */
  fillProps?: Record<string, unknown>;
  /** Narrows what the filling instance may hold, when the fill's own
   *  `members.accepts` is too wide for this slot (a body holds rows). */
  accepts?: string[];
  /**
   * Instances created INSIDE the fill when the slot is first made — the
   * slot's default content, as ordinary members.
   *
   * WHY members and not a `fillProps`-style baked-in node (Zach,
   * 2026-09-15: "yes the producer badge can be delted it just a member of
   * the slot", and "even the text is just a member in the label slot that
   * can be deleted"): content the component composes for itself can never
   * be removed, only overridden, so a Port would always carry its badge
   * and its label no matter what the author wanted. Seeding them as real
   * members makes "what a fresh Port looks like" and "what this Port
   * holds" the same kind of fact, editable and deletable through the one
   * members control every other slot already uses.
   */
  fillMembers?: { type: string; props?: Record<string, unknown> }[];
}

/** What a render may need beyond props and rendered children. */
export interface RenderContext {
  /** Rendered slot fills by slot id, for a component with `slots`. */
  slots?: Record<string, ReactNode>;
  /** When this instance itself fills a slot: the slot's label, so an empty
   *  Flex can say which hole it is. */
  slotLabel?: string;
  /** …and the slot's id, so a Bar knows whether it is the header (line at
   *  its bottom) or the footer (line at its top). */
  slotId?: string;
  /**
   * True when this instance is drawn INSIDE a parent (a member or a slot
   * fill), so a render can drop bench-only chrome such as a placeholder
   * frame. Absent (top-level, drawn straight onto a canvas) reads as
   * `false` — see docs/TEXTBOX-EDITING-SPEC.md §3.
   */
  nested?: boolean;
  /**
   * Whether a Flex slot should paint its red box-model overlay at all —
   * filled or empty. Absent reads as `true` (a members-list preview
   * thumbnail or a Storybook story that never sets this keeps the old
   * always-on look). The `/create` page is the one caller that sets this
   * explicitly, from a page-level toggle. Off by default (Zach,
   * 2026-09-14): a component renders exactly what ships. On (Zach,
   * 2026-09-15): every slot gets the overlay, not just empty ones — "the
   * whole point of this is just to help identify clearly where the slots
   * are" even once something is inside them — with the slot's name shown
   * as a label only when it's actually empty.
   */
  highlightSlots?: boolean;
  /**
   * Present for an entry that declares `inlineEdit`. The host (apps/docs's
   * workbench.tsx) owns `editingId` and the cancel snapshot; this bundle is
   * this ONE instance's slice of it, already bound to its id and its
   * `inlineEdit.field` so a component's render never sees an instance id.
   */
  edit?: {
    /** True when THIS instance is the one currently being edited. */
    editing: boolean;
    /** Write-through to `inlineEdit.field` — every keystroke. */
    onChange: (value: string) => void;
    /** Ends editing, keeping the value. */
    onCommit: (value: string) => void;
    /** Ends editing, restoring the value captured when editing began. */
    onCancel: () => void;
  };
  /**
   * Rendered members by id, for a component with `members` (Zach's
   * 2026-09-12 ruling: a Block holds Ports as members ALONGSIDE its
   * slots). A slot-having component's fills keep arriving via `slots` as
   * today; anything held that is NOT a slot fill arrives here instead —
   * never mixed into `children`, because a slotted `render` never reads
   * `children` at all (see `renderInstance`'s own `entry.slots` branch).
   */
  members?: Record<string, ReactNode>;
  /**
   * The active Arrangement and its per-port Placements, for a component
   * whose members carry placement data (a Block's Ports — see
   * `packages/bbox-ui/src/portPlacement.ts`). `render` asks the model's
   * own `laneOrder`/`drawnEdge` which of its PortEdge lanes each member
   * belongs in and reads `t` to place it there in custom mode — the model
   * owns that math, `render` only puts the answer on screen. Absent for
   * anything that isn't Block-shaped (no `arrangements` on the instance).
   */
  arrangement?: Arrangement;
  placements?: Placements;
  /** Member ids whose Port is `locked: true` (the function port, at most
   *  one per Block) — rendered once at the header's left corner, outside
   *  any lane, and excluded from every lane's order/spacing math, per
   *  `portPlacement.ts`'s own `refresh`/`movePort`. */
  lockedMemberIds?: string[];
  /** The instance id of the Block itself, set alongside `arrangement`/
   *  `placements` (Zach's 2026-09-12 model) — `renderLane`'s `PortLane`
   *  droppables need it to form their `blockId:edge` id (see
   *  `portDnd.ts`'s `portLaneId`), and it is what `renderInstance` passes
   *  to the `PortDndProvider` it mounts around this same render. */
  blockId?: string;
}

/**
 * demos/inspector/src/schema/registerComponent.ts
 *
 * T1-SPEC.md §7.1's Lane-D engine file: knows nothing about `Port`/`Pill`/
 * any component by name. `resolveFields`/`FieldSpec`/`PresetSpec` are
 * already fully generic, so there is no per-component rendering code to
 * write here — one `ComponentEntry` per component is the whole interface.
 */
export interface ComponentEntry {
  name: string;
  fields: FieldSpec[];
  presets: PresetSpec[];
  /**
   * Renders one subject for the live preview strip. Takes an already-
   * resolved plain prop bag (never a FieldTrace, never the FieldSpec
   * array) so this file never imports a specific component type.
   */
  render: (props: Record<string, unknown>, children?: ReactNode, ctx?: RenderContext) => ReactNode;
  /**
   * Named holes this component owns — Block's `header.left`, `body`,
   * `footer.right`. Each is filled at creation by ONE child instance (a
   * Flex) that carries `slot` and can never be removed or moved; what a
   * person adds goes INTO that child. A slot is the API role (where on the
   * parent); a Flex is the component that fills it (packages/bbox-ui/src/
   * flex.tsx has the naming argument). Absent means no slots.
   */
  slots?: SlotSpec[];
  /**
   * Declared when the component holds other instances. The inspector then
   * adds the standard Members control for it automatically, and every
   * render passes the members, rendered, as `children`. Absent means the
   * component is a leaf. See ./members/contract.ts for why this is not a
   * FieldSpec row.
   */
  members?: MembersSpec;
  /**
   * Turn a subject's raw stored props into the subject its component
   * actually resolves against, when those differ.
   *
   * WHY this exists: a component may fold sugar into the override layer
   * before resolving — Pill's `tone` does exactly that. The panel resolved
   * raw props instead, so with a tone set the trace claimed the state preset
   * had won while the pill painted the tone's colour, and Mixed read
   * "not mixed" for two pills that visibly differed. The component exports
   * the transform; this is where the panel picks it up. Defaults to identity.
   */
  toSubject?: (props: Record<string, unknown>) => Record<string, unknown>;
  /**
   * Declared by a component whose text IS one of its own props, so the
   * create page's two-click rule and in-place editor know which field a
   * typed value writes to. Only `TextBox` declares this today — the
   * FieldSpec system stays untouched (`editing`/`onChange`/`onCommit`/
   * `onCancel` are host wiring, never fields; docs/TEXTBOX-EDITING-SPEC.md
   * §1/§3).
   */
  inlineEdit?: { field: string };
}

export function registerComponent(entry: ComponentEntry): ComponentEntry {
  return entry;
}
