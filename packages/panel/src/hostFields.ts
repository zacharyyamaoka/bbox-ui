import type { FieldSpec } from "@bbox-ui/schema";

/**
 * packages/panel/src/hostFields.ts
 *
 * The render surface's own facts about an instance — position, rotation,
 * and the derived outer footprint — as the SAME `FieldSpec[]` shape every
 * component field array already is (docs/GLYPH-PLAN.md's "Renderer"
 * inspector section: "a second `FieldSpec[]`... read through the same
 * `readFieldRow`, so Mixed, clear and provenance come free").
 *
 * WHY these are `host: true` and not a component's own fields: `x`, `y`
 * and `rotation` are never a component prop — tldraw, React Flow and the
 * DOM each own and write them directly (a drag, a rotate handle), the same
 * reason position is already kept out of `positions` rather than a prop
 * bag (`@bbox-ui/panel`'s own `contract.ts` note). `w`/`h` are `readOnly`
 * for a different reason: they are not edited at all, anywhere — always
 * DERIVED from the component (`size + 2*padding` for Glyph) — a panel row
 * for them exists purely for provenance ("here is what actually painted"),
 * never as an editable control.
 */
export const HOST_FIELDS: FieldSpec[] = [
  { id: "x", label: "X", kind: "number", defaultValue: 0, step: 1, unit: "px", host: true },
  { id: "y", label: "Y", kind: "number", defaultValue: 0, step: 1, unit: "px", host: true },
  {
    id: "rotation",
    label: "Rotation",
    kind: "number",
    defaultValue: 0,
    min: -180,
    max: 180,
    step: 1,
    unit: "°",
    host: true,
  },
  {
    id: "w",
    label: "Width",
    kind: "number",
    defaultValue: 0,
    unit: "px",
    host: true,
    readOnly: true,
    hint: "Derived from the component; read-only here.",
  },
  {
    id: "h",
    label: "Height",
    kind: "number",
    defaultValue: 0,
    unit: "px",
    host: true,
    readOnly: true,
    hint: "Derived from the component; read-only here.",
  },
];
