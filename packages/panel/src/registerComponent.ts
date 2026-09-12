import type { ReactNode } from "react";
import type { FieldSpec, PresetSpec } from "@bbox-ui/schema";
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
}

export function registerComponent(entry: ComponentEntry): ComponentEntry {
  return entry;
}
