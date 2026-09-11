import type { FieldSpec, FieldValue, PresetSpec } from "@bbox-ui/schema";
import type { Subject } from "../FieldTraceRow";

/**
 * One panel design. Five of these render the SAME field array five ways.
 *
 * WHY a contract rather than five forks of the panel: Zach's complaint is
 * about density and ergonomics, not about the schema — "I basically want what
 * the control inspector panel looks like to be more ergonomic". So the thing
 * being compared is the RENDERER, and everything underneath it must be
 * identical or the comparison is worthless. A variant that quietly drops
 * multi-selection, the Mixed reading, or the cascade trace is not a cheaper
 * panel, it is a different and lesser product: "having that type of logic
 * built in is important".
 *
 * Every variant therefore gets exactly this and nothing else.
 */
export interface PanelVariantProps {
  /** The component being inspected, by name, for the panel header. */
  componentName: string;
  /** The whole schema. A variant may reorder or group it, never filter it
   *  silently — if a variant hides a field, it must give the user a way to
   *  reach it (a tier switch, a filter, a disclosure). */
  fields: FieldSpec[];
  /** This component's presets. The selector row is the primary path. */
  presets: PresetSpec[];
  /** Everything currently selected. Length 0, 1 or many — all three are real
   *  states a variant must render, and multi-selection is where Mixed lives. */
  subjects: Subject[];
  /** Raw props -> the subject the component actually resolves against. See
   *  ComponentEntry.toSubject. A variant MUST resolve through this for what
   *  it claims is painted, and MUST NOT use it for what it claims is stored. */
  toSubject?: (props: Record<string, unknown>) => Record<string, unknown>;
  onChange: (fieldId: string, value: FieldValue) => void;
  onClearOverride: (fieldId: string) => void;
}

export interface PanelVariant {
  id: string;
  /** Shown in the switcher. Short — it sits in a row of five. */
  label: string;
  /** One sentence on what this design is optimising for, shown under the
   *  switcher so a reader knows what they are looking at. */
  blurb: string;
  Panel: (props: PanelVariantProps) => React.ReactNode;
}

/**
 * The behaviour every variant owes the user, restated as a checklist because
 * five agents are building these independently and "it looked fine" is how
 * each of them would otherwise drop a different one of these.
 *
 * 1. Presets are the primary path and appear first.
 * 2. A field governed by a preset reads as inherited, not as an empty control.
 * 3. Multi-selection works, and a field whose STORED values disagree reads
 *    Mixed with a blanked control.
 * 4. A stored override is visibly distinguishable from an inherited value and
 *    can be cleared — including across a multi-selection.
 * 5. The cascade is reachable: for a single subject, the user can see which
 *    layer supplied the value and what the other layers held.
 * 6. When a transform paints something the stored layers do not explain, the
 *    panel says so rather than silently showing the painted value.
 * 7. Every field is reachable. Hiding is allowed; losing is not.
 */
export const VARIANT_CONTRACT = [
  "presets first",
  "governed reads as inherited",
  "multi-select + Mixed on stored values",
  "override visible and clearable, including multi",
  "cascade reachable for a single subject",
  "says when something else is painting",
  "every field reachable",
] as const;
