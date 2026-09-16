/**
 * packages/bbox-ui/src/codeField.fields.ts
 *
 * `CodeField`'s controllable props as data, so it can be a real member of
 * a real slot rather than something a parent composes for itself.
 *
 * WHY this file exists (Zach, 2026-09-15): Port's label slot became a
 * genuine slot — "even the text is just a member in the label slot that
 * can be deleted". A Port's label is "one line of code"
 * (`get_aruco: ArucoSrv`), so the member that carries it is the real
 * `CodeField`, not a plain TextBox: the monospace face, the grammar hook
 * and the caret behaviour ARE the thing being demonstrated.
 *
 * WHY the text field is `value` and not `children`, breaking step with
 * TextBox: a FieldSpec `id` must equal the real prop name it describes —
 * `readFields`/`toArgTypes` key off the string directly (see
 * `packages/schema/src/field.ts`). `CodeField` has no `children`; its text
 * has always been `value` (docs/TEXTBOX-EDITING-SPEC.md §1 draws the same
 * distinction from the other direction). Declaring `children` here to
 * match a sibling's spelling would put a control on screen that writes a
 * prop the component never reads.
 *
 * DELIBERATELY NARROW. `CodeFieldProps` carries ~25 props, most of them
 * host wiring (`onViewReady`, `tooltipParent`, `cursorAt`, `selectRange`,
 * the mode pair) that no author sets and a panel cannot meaningfully
 * offer. Only the fields below are things a person choosing how this field
 * LOOKS would reach for; the rest stay props for a host to drive.
 */
import type { FieldSpec } from "@bbox-ui/schema";

export const CODE_FIELD_FIELDS: FieldSpec[] = [
  {
    id: "value",
    label: "Code",
    kind: "text",
    // CodeField is fully controlled — an empty string is its honest empty
    // state (a blank field showing `placeholder`), never a "fall through
    // to something else" sentinel.
    defaultValue: "",
    // Simple: this IS the field's content. Everything a person opens a
    // CodeField to change starts here (see `field.ts`'s `tier` docblock —
    // absent means Expert, Simple is hand-curated).
    tier: "simple",
  },
  {
    id: "placeholder",
    label: "Placeholder",
    kind: "text",
    defaultValue: "",
    hint: "Shown when Code is empty.",
  },
  {
    id: "align",
    label: "Align",
    kind: "segments",
    defaultValue: "left",
    options: [
      { value: "left", label: "Left" },
      { value: "right", label: "Right" },
    ],
    hint: "Which end the text hugs — a Port's label aligns toward its own dot.",
  },
  {
    id: "disabled",
    label: "Disabled",
    kind: "toggle",
    defaultValue: false,
    hint: "No caret, no edits — a read-only field.",
  },
];

/** No presets: `CodeField` has no governed paint ladder of its own — it
 *  inherits its font size from whatever wrapper it sits in (codeField.css
 *  reads it off the parent, see its own WHY), so there is nothing for a
 *  preset family to govern. */
export const CODE_FIELD_PRESETS = [];
