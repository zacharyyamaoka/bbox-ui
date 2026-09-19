// PLACEHOLDER — replaced whole by lane L3 — Wires (shape + bindings + drag gesture)
// (docs/SYSTEMSKETCH-REBUILD-PLAN.md §5). L0 creates it so
// src/shapes/registry.ts can import every kind from day 0 and no later lane
// has to edit the registry or App.tsx to be seen.
//
// WHY this spells the empty kit out instead of importing registry.ts's own
// `EMPTY_KIT`: registry.ts imports THIS file, so a value import back would
// close a module cycle and the const would be read while still in its temporal
// dead zone — measured here as "Cannot read properties of undefined (reading
// 'shapeUtils')" the first time the registry was loaded. A `import type` is
// erased, so the cycle never exists at runtime.
import type { ShapeKit } from "../registry";

export const wireKit: ShapeKit = {
  shapeUtils: [],
  bindingUtils: [],
  tools: [],
  familyItems: [],
  toolUi: (_editor, tools) => tools,
};
