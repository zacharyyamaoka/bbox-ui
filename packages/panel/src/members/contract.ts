import type { ReactNode } from "react";
import type { ComponentEntry } from "../registerComponent";
import type { Instance } from "../bench";

/**
 * What a component says about the children it can hold.
 *
 * WHY this is declared on the ComponentEntry and NOT as a FieldSpec row:
 * a member list is structural — an ordered run of other instances — and
 * `FieldValue` is a scalar on purpose (T1-SPEC §4.4: `children` is composed
 * by hand, never a panel row). Putting the list in `props` would make
 * Randomize, the Code view's prop printer and every one of the six panel
 * designs learn about arrays. Declaring it here instead means the inspector
 * can add ONE standard Members control automatically for any component
 * that says `members: { accepts: [...] }`, and the field engine never
 * changes. Zach, 2026-09-11: "to avoid making a custom UI for all of them
 * … a standard control we can automatically add to the right panel".
 */
export interface MembersSpec {
  /** Registered component names this parent can hold, in the order an
   *  "Add" menu should list them. Empty means "anything registered". */
  accepts: string[];
  /** Section caption. Defaults to "Members". */
  label?: string;
  /** Hard cap on how many, when the component has one (a PortEdge holds
   *  ports along one edge; a Block holds one body). Absent = unbounded. */
  max?: number;
}

/**
 * The information a control gets to show per child. Deliberately small:
 * Zach, 2026-09-11 — "there is likely a limited amount of information we
 * can actually show per each child member". A member's own fields are
 * edited by SELECTING it, never inline — the inspector then shows the child
 * (the "it acts like a frame" rule from the SystemSketch Members section).
 */
export interface MemberSummary {
  id: string;
  type: string;
  /** The child's `children` text prop when it is a string, else `Type n`. */
  title: string;
  /** True when the title fell back to `Type n`. */
  untitled: boolean;
  /** A one-word status chip, when the child has a `state`. */
  badge: string | null;
  /** Its own members, for a control that draws depth. */
  memberIds: string[];
}

export interface MembersControlProps {
  parent: Instance;
  entry: ComponentEntry;
  spec: MembersSpec;
  /** The direct members, in order. */
  members: MemberSummary[];
  /** Whole-bench lookups, for the controls that draw a tree or the path. */
  summaryOf: (id: string) => MemberSummary | undefined;
  entryFor: (type: string) => ComponentEntry;
  /** Every registered component, so Add can list what `accepts` names. */
  entries: ComponentEntry[];
  /** Renders a small preview of a member, for the controls that show one. */
  preview: (id: string) => ReactNode;
  onAdd: (type: string) => void;
  onRemove: (id: string) => void;
  /** Move the member at `from` so it sits at `to` (indexes into `members`). */
  onMove: (from: number, to: number) => void;
  /** Make this the inspector's subject. */
  onSelect: (id: string) => void;
  /** When the list belongs to a slot fill shown inside ITS parent's
   *  inspector: select the fill itself (to edit its Flex props). */
  onSelectParent?: () => void;
  /**
   * Folded away, with only its own header showing.
   *
   * WHY the fold lives on THIS control and not on the layout wrapping it:
   * Zach, 2026-09-12 — "I like how the folding option is hidden until you
   * actually have a member, however I don't like how you create another
   * header. Instead of that just put a folding chevron to the left of the
   * existing header." The wrapper that owned the fold had to draw a row to
   * put the chevron on, and that row WAS the second header. Moving the
   * state one level in deletes the row.
   *
   * Undefined means "this host does not offer folding" — the control then
   * draws no chevron at all, which is also what a list with no members
   * must do.
   */
  folded?: boolean;
  onToggleFold?: () => void;
}

export interface MembersControl {
  id: string;
  label: string;
  blurb: string;
  Control: (props: MembersControlProps) => ReactNode;
}

/**
 * What every Members control owes the user, restated as a checklist because
 * five are built independently and each would otherwise drop a different
 * one of these.
 *
 * 1. Every member is shown, in order, with its type and a title.
 * 2. Add is typed: only what the parent accepts, and never past `max`.
 * 3. Clicking a member selects it — the inspector switches to the child.
 * 4. Remove and reorder are reachable for every member.
 * 5. An empty list shows its + and nothing else — no sentence explaining
 *    what could go in it. (Zach, 2026-09-12, of "No members yet. Add a
 *    Port, Pill, Glyph, TextBox, Flex or Block.": "No need to put this
 *    text under the members list. it just add clutter." The Add menu
 *    already answers the question, on demand, without spending a line of
 *    every empty list to do it.)
 * 6. No nested editor: a member's own fields are edited by selecting it.
 */
export const MEMBERS_CONTRACT = [
  "every member shown in order, typed and titled",
  "add is typed and capped",
  "click selects the member",
  "remove and reorder reachable",
  "empty shows its + and no sentence",
  "no nested editor",
] as const;
