import type { ReactNode } from "react";
import type { FieldSpec, PresetSpec } from "@bbox-ui/schema";
import type { MembersSpec } from "./members/contract";

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
  render: (props: Record<string, unknown>, children?: ReactNode) => ReactNode;
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
