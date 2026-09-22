// src/scene/portList.ts — what a block's PORT LIST becomes when the lines
// that describe it are edited: a line added is a port added, a line removed
// is a port removed, a line changed is that port re-declared. Pure: no React,
// no DOM, no canvas engine — the only import is this kit's own declaration
// splice, which is equally pure.
//
// P-056. Until this module existed the app could REORDER and RENAME the ports
// a block already had and nothing else: `shapes/block/railLabel.ts`'s
// `portsFromRailItems` mapped every reported item back through
// `byId.get(item.id)` and dropped anything unknown, so a port minted by the
// rail's own multi-line lane could not survive the trip into the document —
// and no surface anywhere could take one away. `grep -rn 'addPort\|removePort'`
// over both trees returned nothing, which is the honest measure of it.
//
// WHY THE PURE PART IS HERE AND NOT IN THE FACE THAT RENDERS THE LANE
// (README's placement rule: "pure, and reused across components → scene/,
// domain vocabulary and all"): "which ports does this list now hold, and which
// ones just stopped existing" is a fact about the DOCUMENT, and the host needs
// the second half of that answer — the ports that went — to do something no
// renderer can do for it: delete the cables that were plugged into them. A
// function that only returned the survivors would make every caller re-derive
// the difference, and a caller that got that derivation subtly wrong would
// leave a binding pointing at a port id nothing owns.
//
// WHAT IT DELIBERATELY DOES NOT DO: mint an id. Ids are opaque and
// host-owned (the same D9 rule `components/portLane.ts` already follows for
// the lane's own provisional items) — this module asks its caller for one and
// offers `uniquePortId` as a pure helper if the caller wants a readable one.
import { withPortDeclarationName } from "./portDeclaration";

/** The only thing this module needs a port to be: an opaque identity and the
 *  one declaration line it stores (ruling 8 — `frame`, or `frame: Frame`,
 *  with the type parsed from after the `:` and never stored beside it). A
 *  host's own port record is free to carry more; `P` flows through. */
export interface DeclaredPort {
  readonly id: string;
  readonly declaration: string;
}

/**
 * One line as an editing surface reports it back.
 *
 * TWO fields, because a host may paint a port's line in two places at once
 * and they are not the same string. SystemSketch's block rail paints only the
 * NAME HALF of `gain_x: float` — a measured ruling, not a shortcut: two
 * annotated labels flowing inward from opposite walls of a 160px card overlap
 * by 73px (`shapes/block/BlockFace.tsx`'s `labelOf`). So `label` is what the
 * rail shows and edits, and `laneLine` is the WHOLE declaration the
 * multi-line lane shows and edits. A host that paints one string everywhere
 * simply leaves `laneLine` undefined and nothing below changes.
 */
export interface PortLineItem {
  readonly id: string;
  /** What the rail label says — a NAME, spliced into the stored line. */
  readonly label: string;
  /** What the multi-line lane says — a WHOLE declaration, written as-is.
   *  Omitted when the surface reporting this edit has no lane. */
  readonly laneLine?: string;
}

export interface PortListEdit<P extends DeclaredPort> {
  /** The list the block should now hold, in the order the surface reports. */
  readonly ports: P[];
  /** The ports that just stopped existing — the caller's cue to delete
   *  whatever was attached to them. Empty on a pure reorder/rename. */
  readonly removed: P[];
}

/**
 * Fold a surface's reported lines back onto the ports a block stores.
 *
 * Three cases, in the order they are decided:
 *
 * 1. **An id the block does not own → a NEW port**, declared by the line that
 *    carried it (`laneLine` when the surface has a lane, else the label).
 *    This is the case P-056 exists for, and it is the exact behaviour
 *    `portsFromRailItems` used to forbid on purpose ("an item naming a port
 *    the block no longer has is dropped, never minted") — a correct rule for
 *    a surface that could only rename, and the wall that made adding a port
 *    impossible once a surface could do more.
 * 2. **A changed `laneLine` → the whole declaration, verbatim.** The lane
 *    shows the entire line, so what is typed there IS the declaration,
 *    annotation included. That is what makes "retype it" reachable at all:
 *    the rail can never offer it, because the rail never shows the `: float`.
 * 3. **Otherwise → the label spliced in as the NAME half**, annotation
 *    untouched (`withPortDeclarationName`, which returns the type segment
 *    byte for byte so an authored `:  Frame ` keeps its spacing). This is
 *    P-037's rule, unchanged, and it stays the default so a rail edit from a
 *    host that knows nothing about lanes behaves exactly as it did.
 *
 * WHY 2 IS TESTED AGAINST THE STORED DECLARATION RATHER THAN TRUSTED
 * BLINDLY: a host feeds `laneLine` on every item on every render, whether a
 * lane is open or not, so an unchanged `laneLine` means "the lane did not do
 * this" — and a rail rename arriving with a stale-but-equal `laneLine` must
 * still be read as a rename. Comparing is what keeps one callback able to
 * carry both kinds of edit, which is the shape `PortEdge` already reports in
 * (`onItemsChange`, one array, every change).
 *
 * Referentially stable: an item that changes nothing yields the SAME port
 * object, and a report that changes nothing at all yields the SAME `ports`
 * array — a live "one write per keystroke" host relies on that to not fire
 * on a no-op.
 */
export function portsFromLineItems<P extends DeclaredPort>(
  stored: readonly P[],
  items: readonly PortLineItem[],
  mint: (declaration: string) => P,
): PortListEdit<P> {
  const byId = new Map(stored.map((port) => [port.id, port] as const));
  const survived = new Set<string>();
  const ports = items.map((item) => {
    const port = byId.get(item.id);
    if (!port) return mint(item.laneLine ?? item.label);
    survived.add(port.id);
    const declaration =
      item.laneLine !== undefined && item.laneLine !== port.declaration
        ? item.laneLine
        : withPortDeclarationName(port.declaration, item.label);
    // Identity when nothing changed — a pure reorder must not mint new port
    // objects, or every drag would look like an edit to anything comparing
    // records.
    return declaration === port.declaration ? port : { ...port, declaration };
  });
  const removed = stored.filter((port) => !survived.has(port.id));
  const unchanged = removed.length === 0 && ports.length === stored.length && ports.every((port, i) => port === stored[i]);
  return { ports: unchanged ? (stored as P[]) : ports, removed };
}

/**
 * A readable, unused port id built from a declaration's NAME.
 *
 * WHY name-derived rather than opaque: this repo's own port ids already are
 * names — `edgeDropCatalog.ts` mints `{id: "in", declaration: "in: float"}`,
 * and pyblocks writes the same shape — so a `.tldr` stays readable and a
 * hand-written fixture stays writable. WHY it is minted ONCE and never
 * re-derived: the id is what a cable's binding names, so following a later
 * rename would move every wire on the block. A port called `speed` that is
 * renamed to `velocity` keeps the id `speed`, and that is correct — the id is
 * an identity, not a label.
 *
 * `taken` is every id already in use ON THE WHOLE BLOCK, not on one wall: a
 * wire binding stores a bare `portId` with no side, so two walls sharing an
 * id would make a cable ambiguous.
 */
export function uniquePortId(declaration: string, taken: ReadonlySet<string>): string {
  const base = declaration.split(":")[0].trim() || "port";
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
