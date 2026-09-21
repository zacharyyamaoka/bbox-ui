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
import { withPortDeclarationName } from "@trunk/scene/portDeclaration";

import type { BlockPortSpec } from "./BlockShapeUtil";

/** What `onItemsChange` hands back — `PortEdgeItem` narrowed to the two fields
 *  a stored port actually takes anything from. */
export interface RailItem {
  id: string;
  label: string;
}

/**
 * The rail's ports after a change, in the order the rail now shows them, with
 * any edited label folded back into the port's stored declaration.
 *
 * WHY the label is spliced in as the NAME HALF rather than written as the
 * whole declaration: the rail PAINTS the name half and nothing else
 * (`labelOf`, and the measured overlap ruling above it), so the string the
 * person edited is a name — the annotation was never on screen. Writing the
 * field's contents over the whole line would delete a `: float` the editor
 * never showed them, which is precisely what
 * `feedback_truthful_property_rendering` forbids. `withPortDeclarationName`
 * is the trunk's own splice for this and returns the type segment VERBATIM,
 * so an authored `:  Frame ` keeps its spacing through a rename.
 *
 * A consequence worth stating because it is a real edge and not an oversight:
 * a colon TYPED into the rail becomes part of the name
 * (`gain_x: float` + `a:b` -> `a:b: float`). It is odd, but it is lossless and
 * it round-trips; the alternative — treating a typed colon as a re-annotation
 * — would silently drop the stored annotation the field never displayed, and
 * that is the failure this function exists to avoid. Editing a rail port's
 * ANNOTATION has no surface on the card yet; see this file's NOT-DONE note in
 * the commit.
 *
 * An item naming a port the block no longer has is dropped rather than minted:
 * this function reorders and renames, it never creates a port.
 */
export function portsFromRailItems(stored: readonly BlockPortSpec[], items: readonly RailItem[]): BlockPortSpec[] {
  const byId = new Map(stored.map((port) => [port.id, port]));
  return items.flatMap((item) => {
    const port = byId.get(item.id);
    if (!port) return [];
    const declaration = withPortDeclarationName(port.declaration, item.label);
    // Identity when nothing changed — a pure reorder must not mint new port
    // objects, or every drag would look like an edit to anything comparing
    // records. `withPortDeclarationName(line, parse(line).name)` reassembles
    // `line` byte for byte, so this is exact, not approximate.
    return [declaration === port.declaration ? port : { ...port, declaration }];
  });
}
