import type { ReactNode } from "react";
import type { FieldSpec, PresetSpec } from "@bbox-ui/schema";

/**
 * demos/port-inspector/src/schema/registerComponent.ts
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
  render: (props: Record<string, unknown>) => ReactNode;
}

export function registerComponent(entry: ComponentEntry): ComponentEntry {
  return entry;
}
