// src/shapes/block/railLabel.ts — what a rail edit MEANS, pure.
//
// P-037. `PortEdge` reports every rail change — a reorder AND a label edit —
// through one `onItemsChange(items)` callback (portEdge.tsx:1340,
// `handlePortLabelWrite` maps the written value onto `item.label` and hands
// the whole array back). Until now `BlockFace` read only the ORDER out of that
// array and mapped each item straight back to the port it already had, so a
// label the user typed on the card was thrown away on arrival: measured in a
// real browser, 2026-09-21 — double-clicking the rail label of a port storing
// `gain_x: float` opened a `CodeEditor` on the card, typing `gain_y` repainted
// the field, and `props.ports.left[0].declaration` was still `gain_x: float`
// afterwards, with the label snapping back to `gain_x`. An editing surface the
// board OFFERS and then discards is worse than no editing surface, so this is
// the function that reads both halves of what the rail reports.
//
// P-056 (2026-09-21) widened the first function below from "reorder and
// rename" to "add and remove too", and moved its semantics out to
// `@trunk/scene/portList` — see that module's header for why the pure part
// belongs in `scene/`. What stays here is the part that is genuinely this
// app's: a `BlockPortSpec` is the record, and a NEW one needs an id, which
// only the host can mint.
import { parsePortDeclaration } from "@trunk/scene/portDeclaration";
import { portsFromLineItems, uniquePortId, type PortListEdit } from "@trunk/scene/portList";

import type { BlockPortSpec } from "./BlockShapeUtil";

/** What `onItemsChange` hands back — `PortEdgeItem` narrowed to the fields a
 *  stored port actually takes anything from. */
export interface RailItem {
  id: string;
  label: string;
  /** P-056. The WHOLE declaration, as the multi-line lane shows it — the rail
   *  paints only the name half (`labelOf`), so this is the only field that
   *  can carry a re-typed annotation, and the only one a NEW port can be
   *  declared by. Absent on a report from a surface that has no lane. */
  laneLine?: string;
}

/**
 * The rail's ports after a change: reordered, renamed, re-declared, ADDED and
 * REMOVED — plus the ports that went, so the caller can delete the cables
 * that were plugged into them.
 *
 * Every rule about what a reported line MEANS lives in
 * `@trunk/scene/portList`'s `portsFromLineItems` and is tested there. The one
 * rule that lives HERE is the id, because minting one is the host's job:
 *
 * `taken` is every port id on the WHOLE BLOCK, not on this one wall, because
 * an `ss-wire-binding` stores a bare `portId` with no side — two walls
 * sharing an id would make a cable ambiguous about which dot it meets. And an
 * id is minted ONCE, from the name the line declared, and never re-derived
 * afterwards: it is what a binding names, so following a later rename would
 * silently move every wire on the block.
 */
export function portsFromRailItems(stored: readonly BlockPortSpec[], items: readonly RailItem[], taken: ReadonlySet<string>): PortListEdit<BlockPortSpec> {
  const used = new Set(taken);
  return portsFromLineItems(stored, items, (declaration) => {
    const id = uniquePortId(declaration, used);
    used.add(id);
    return { id, declaration };
  });
}

/**
 * P-014. WHICH GESTURE this `onItemsChange` belongs to, as a stable key — or
 * `null` when the change is its own discrete edit and deserves its own undo
 * entry.
 *
 * `PortEdge` reports a reorder and a label keystroke through the same
 * callback (this file's header), and the two want OPPOSITE things from the
 * undo stack: a drop is one edit and marks every time, while a run of
 * keystrokes on one port is one edit and must mark only once. Nothing in the
 * callback says which arrived, so this reads it off the change itself.
 *
 * `label:<portId>` is returned only for the one shape a keystroke can have:
 * the same ports, in the same order, with EXACTLY ONE of them changed.
 * Anything else — a reorder, a port added or gone, two ports at once, an id
 * the block does not have — is `null`, i.e. "mark now". WHY that direction on
 * the unknown case:
 * marking too often costs an extra Ctrl+Z, marking too rarely welds the edit
 * onto the action before it, and this app has already shipped the second (a
 * glyph pick that deleted the block it was picked on, measured 2026-09-21).
 * An unclassifiable change takes the recoverable error.
 *
 * BOTH TYPING SURFACES COUNT, and the second one is why this reads two fields
 * rather than one. The rail paints a port's NAME half and reports it as
 * `label`; P-056's multi-line lane shows the WHOLE declaration and reports it
 * as `laneLine`. Measured 2026-09-21, before this function looked at
 * `laneLine`: re-typing `gain_x: float` as `gain_y: float` in the lane cost
 * THIRTEEN Ctrl+Z, because every keystroke changed a field this function was
 * not reading, so every keystroke looked unclassifiable and took a mark of
 * its own. A port that changes on either field is the same port being typed
 * into, and it is counted ONCE however many of its fields moved.
 *
 * WHAT THIS CANNOT SEE, stated because it is a real residual: two SEPARATE
 * rename sessions on the same port, back to back with nothing in between,
 * share a key and therefore one undo entry. Closing it needs a real
 * begin/end signal from `PortEdge` — which publishes none today, and adding
 * one is a trunk change. The cost is one merged entry in a rare sequence;
 * what it replaces is SIX entries for every single rename.
 */
export function railGestureKey(stored: readonly BlockPortSpec[], items: readonly RailItem[]): string | null {
  if (items.length !== stored.length) return null;
  let renamed: string | null = null;
  for (let at = 0; at < items.length; at += 1) {
    const item = items[at];
    const port = stored[at];
    if (item.id !== port.id) return null; // the order moved: a reorder, not typing
    const nameMoved = item.label !== parsePortDeclaration(port.declaration).name;
    // `undefined` is "this surface has no lane", not "the lane is empty", so
    // an absent `laneLine` is never read as a cleared declaration.
    const lineMoved = item.laneLine !== undefined && item.laneLine !== port.declaration;
    if (!nameMoved && !lineMoved) continue;
    if (renamed !== null) return null; // two ports at once is not a keystroke
    renamed = item.id;
  }
  return renamed === null ? null : `label:${renamed}`;
}
