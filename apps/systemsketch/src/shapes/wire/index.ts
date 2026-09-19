// src/shapes/wire/index.ts — the Wire kit (lane L3).
//
// A wire is the ONE edge kind this document has, and it is always a DATA
// line: `variant` is `data | async | delayed`, never `control`. Control flow
// is containment and arms (Zach, the 2026-09-18 ASK: "when you read Python
// code, the control is apparent from the structure itself"), so there is
// nothing here for it to be a variant of.
//
// The kit has NO tool and NO dock row, and both absences are the design:
//
//   - no tool, because a wire is a press-drag from a port DOT
//     (`./wireGesture.ts`), never a mode you arm and then draw. `install` is
//     how that gesture reaches `onMount` without `src/App.tsx` learning this
//     kind's name;
//   - no dock row, because the dock arms tools, and the one gesture this kit
//     has is already armed by the thing it is about.
//
// `Overlay` is the other half of the same gesture: a cable that lands on
// nothing publishes a question, and `./dropMenu.tsx` renders it through
// `components.InFrontOfTheCanvas` (src/chrome/overlay.tsx fans the slot out
// to whichever kits brought something to paint there).
//
// WHY this file spells the empty fields out instead of spreading
// registry.ts's `EMPTY_KIT`: registry.ts imports THIS file, so a value import
// back would close a module cycle and the const would be read while still in
// its temporal dead zone — measured during L0 as "Cannot read properties of
// undefined (reading 'shapeUtils')". An `import type` is erased, so the cycle
// never exists at runtime.
import type { ShapeKit } from "../registry";
import { WireDropMenuOverlay } from "./dropMenu";
import { WireBindingUtil } from "./WireBindingUtil";
import { WireShapeUtil } from "./WireShapeUtil";
import { installWireGesture } from "./wireGesture";

export { WireShapeUtil, type WireShape, type WireShapeProps } from "./WireShapeUtil";
export { WireBindingUtil, type WireBinding, type WireBindingProps } from "./WireBindingUtil";
export { createWire, type CreateWireOptions } from "./createWire";
export { installWireGesture, pendingEdgeDrop, wireDrag, type PendingEdgeDrop, type WireDragState } from "./wireGesture";
export { InFlightWire, WireFace } from "./WireFace";
export {
  WIRE_TERMINAL_GAP,
  portTerminal,
  resolveWireEnds,
  wireRoutePoints,
  wireTerminals,
  type WireEnds,
} from "./wireGeometry";

export const wireKit: ShapeKit = {
  shapeUtils: [WireShapeUtil],
  bindingUtils: [WireBindingUtil],
  tools: [],
  familyItems: [],
  toolUi: (_editor, tools) => tools,
  install: installWireGesture,
  Overlay: WireDropMenuOverlay,
};
