// src/shapes/wire/createWire.ts — STUB. Lane L3 builds it.
//
// The one constructor for a data line: a wire shape plus its two bindings,
// created inside ONE `editor.run` so the whole cable is a single undo step and
// a single `wire.added` edit event (src/document/editEvents.ts's contract).
//
// There is no `variant: "control"` and there never will be: control flow is
// containment and arms, never a cable (plan §2).
import type { Editor } from "tldraw";

import type { WireEnd } from "../../document/editEvents";

export interface CreateWireOptions {
  from: WireEnd;
  to: WireEnd;
  variant?: "data" | "async" | "delayed";
}

export function createWire(_editor: Editor, _options: CreateWireOptions): void {
  throw new Error('not built — see docs/SYSTEMSKETCH-REBUILD-PLAN.md L3/L4');
}
