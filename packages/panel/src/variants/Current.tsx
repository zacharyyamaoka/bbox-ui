import { ComponentInspector } from "../ComponentInspector";
import type { PanelVariant } from "./contract";

/**
 * The panel that shipped, wrapped in the variant contract so it sits in the
 * switcher beside the five proposals.
 *
 * WHY it is a variant and not just "what you see when the switcher is off":
 * Zach's complaint is comparative — "it's not as compact as I'd like". A
 * proposal you cannot A/B against the incumbent in one click is a claim, not
 * a comparison, and the number that matters (how much shorter) is only
 * legible when both panels render the same subjects side by side in the same
 * browser at the same zoom.
 *
 * It adapts rather than re-implements: `ComponentInspector` takes a
 * `ComponentEntry`, the variant contract takes loose fields/presets, so this
 * rebuilds the minimal entry shape. Nothing about the incumbent changes.
 */
export const CURRENT: PanelVariant = {
  id: "current",
  label: "Current",
  blurb:
    "The panel shipping today: one labelled row per field, cascade chain and provenance badge inline. The baseline the other five are measured against.",
  Panel: ({ componentName, fields, presets, subjects, toSubject, onChange, onClearOverride }) => (
    <ComponentInspector
      entry={{ name: componentName, fields, presets, toSubject, render: () => null }}
      subjects={subjects}
      onChange={onChange}
      onClearOverride={onClearOverride}
    />
  ),
};
