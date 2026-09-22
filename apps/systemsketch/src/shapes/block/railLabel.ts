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
 * P-014. WHICH GESTURE this `onItemsChange` belongs to.
 *
 * `PortEdge` reports a reorder, a label keystroke, a line ADDED and a line
 * REMOVED through the same callback (this file's header), and they want
 * different things from the undo stack: a drop is one edit and marks every
 * time, while a run of keystrokes on one port is one edit and must mark only
 * once. Nothing in the callback says which arrived, so this reads it off the
 * change itself and the caller (`BlockFace`) turns the answer into a mark.
 *
 * FOUR ANSWERS, and the two structural ones are what this grew for:
 *
 *   `typing`   the same ports, in the same order, with EXACTLY ONE of them
 *              changed — the one shape a keystroke can have.
 *   `add`      exactly one line appeared and NOTHING else moved. The port it
 *              mints is born nameless, so the keystrokes that name it are the
 *              rest of the SAME gesture; the caller claims their key here.
 *   `remove`   exactly one line vanished and NOTHING else moved. `emptied`
 *              says the line was already blank when it went, which is the
 *              signature of the two-keystroke delete (clear the line, then
 *              take the newline) and the caller's licence to join the run
 *              that cleared it.
 *   `discrete` everything else — a reorder, a paste, a split, two ports at
 *              once, an id the block does not have. WHY that direction on the
 *              unknown case: marking too often costs an extra Ctrl+Z, marking
 *              too rarely WELDS the edit onto the action before it, and this
 *              app has already shipped the second (a glyph pick that deleted
 *              the block it was picked on, measured 2026-09-21). An
 *              unclassifiable change takes the recoverable error.
 *
 * BOTH TYPING SURFACES COUNT, and the second one is why a changed port is
 * read off two fields rather than one. The rail paints a port's NAME half and
 * reports it as `label`; P-056's multi-line lane shows the WHOLE declaration
 * and reports it as `laneLine`. Measured 2026-09-21, before `laneLine` was
 * read: re-typing `gain_x: float` as `gain_y: float` in the lane cost THIRTEEN
 * Ctrl+Z, because every keystroke changed a field nothing was reading, so
 * every keystroke looked unclassifiable and took a mark of its own. A port
 * that changes on either field is the same port being typed into, and it is
 * counted ONCE however many of its fields moved.
 *
 * WHY `add` AND `remove` ARE NOT SIMPLY GIVEN A STABLE KEY, which is the
 * obvious fix and the wrong one: a key that survives a length change would
 * weld a new line onto whatever the person typed NEXT, so one Ctrl+Z would
 * take back two separate edits — and the second is data they cannot get back
 * in one press. The extra press this replaces is recoverable; that is not.
 * The shape here instead is directional: an `add` always OPENS an entry
 * (never joins one), a `remove` only ever CLOSES the one already open on the
 * port it takes away, and `emptied` is what keeps a stale latch from being
 * mistaken for a live typing run. Both directions are measured in
 * `src/undoGranularity.smoke.test.tsx`'s two `NOT WELDED` cases.
 *
 * WHAT THIS STILL CANNOT SEE, stated because it is a real residual: two
 * SEPARATE rename sessions on the same port, back to back with nothing in
 * between, share a key and therefore one undo entry. Closing it needs a real
 * begin/end signal from `PortEdge` — which publishes none today, and adding
 * one is a trunk change. The cost is one merged entry in a rare sequence;
 * what it replaces is SIX entries for every single rename.
 */
export type RailGesture =
  | { readonly kind: "typing"; readonly port: string }
  | { readonly kind: "add" }
  | { readonly kind: "remove"; readonly port: string; readonly emptied: boolean }
  | { readonly kind: "discrete" };

/** Did this report change the port it names? Two fields, either of which is
 *  a keystroke — see `RailGesture`'s doc. `undefined` is "this surface has no
 *  lane", not "the lane is empty", so an absent `laneLine` is never read as a
 *  cleared declaration. */
function portMoved(port: BlockPortSpec, item: RailItem): boolean {
  const nameMoved = item.label !== parsePortDeclaration(port.declaration).name;
  const lineMoved = item.laneLine !== undefined && item.laneLine !== port.declaration;
  return nameMoved || lineMoved;
}

/** Every reported item is the stored port at the same index, untouched. The
 *  "nothing else moved" half of both structural cases — a line added or taken
 *  while a neighbour ALSO changed (backspacing a non-empty line into the one
 *  above it, splitting a line in two) is not a clean structural edit and falls
 *  through to `discrete`. */
function restIsUnmoved(stored: readonly BlockPortSpec[], items: readonly RailItem[]): boolean {
  if (items.length !== stored.length) return false;
  return items.every((item, at) => item.id === stored[at].id && !portMoved(stored[at], item));
}

export function railGesture(stored: readonly BlockPortSpec[], items: readonly RailItem[]): RailGesture {
  if (items.length === stored.length) {
    let renamed: string | null = null;
    for (let at = 0; at < items.length; at += 1) {
      const item = items[at];
      const port = stored[at];
      if (item.id !== port.id) return { kind: "discrete" }; // the order moved: a reorder, not typing
      if (!portMoved(port, item)) continue;
      if (renamed !== null) return { kind: "discrete" }; // two ports at once is not a keystroke
      renamed = item.id;
    }
    return renamed === null ? { kind: "discrete" } : { kind: "typing", port: renamed };
  }

  if (items.length === stored.length + 1) {
    const known = new Set(stored.map((port) => port.id));
    const fresh = items.filter((item) => !known.has(item.id));
    if (fresh.length !== 1) return { kind: "discrete" };
    const rest = items.filter((item) => item !== fresh[0]);
    return restIsUnmoved(stored, rest) ? { kind: "add" } : { kind: "discrete" };
  }

  if (items.length === stored.length - 1) {
    const reported = new Set(items.map((item) => item.id));
    const gone = stored.filter((port) => !reported.has(port.id));
    if (gone.length !== 1) return { kind: "discrete" };
    const rest = stored.filter((port) => port !== gone[0]);
    if (!restIsUnmoved(rest, items)) return { kind: "discrete" };
    return { kind: "remove", port: gone[0].id, emptied: gone[0].declaration.trim() === "" };
  }

  return { kind: "discrete" };
}
