// src/hosts/blockNodeReactflow.layout.ts — pure, DOM-free helpers for
// `blockNodeReactflow.tsx`: the shape of a port a caller hands to
// `BlockNodeReactflow`, and the vocabulary translation between `BlockPort`'s
// walls (`BlockSide`) and React Flow's `Position`.
//
// WHY this file imports no `@xyflow/react` (not even for the `Position`
// type): every other trunk `*.layout.ts` (`blockPort.layout.ts`,
// `port.layout.ts`, `portEdge.layout.ts`) is React-free, DOM-free pure
// arithmetic — that split is what lets the component test this file with
// plain vitest, no mount, no browser. `Position`'s own runtime values
// ("left" | "right" | "top" | "bottom") are stable and re-derived here as
// `HandlePosition`; the one place that needs the real enum casts against it
// (`blockNodeReactflow.tsx`'s own note on that cast).
//
// PROVENANCE (lane L-REG, 2026-10-06): ported from donor 611d985:
// apps/storybook-basics/src/components/blockNodeReactflow.layout.ts; moved to
// `hosts/` beside its node (see that file's module doc — the engine wall).

import { BLOCK_SIDES, type BlockSide } from "../components/port.layout";
import type { PortState } from "../components/port";
import type { PortEdgeItem } from "../components/portEdge";

/**
 * One port on a `BlockNodeReactflow`. `edge` is the wall `BlockPort` mounts
 * it on; `direction` is what React Flow needs to know whether the port
 * becomes a `target` or a `source` handle. The two are independent props,
 * not derived from each other — nothing in `BlockPort` ties a wall to a
 * direction (Zach's "classic input/output dag" puts inputs on `left` and
 * outputs on `right`, but that is a caller convention, not a component
 * rule), so a caller states both rather than this file guessing one from
 * the other.
 */
export interface BlockNodePort {
  id: string;
  edge: BlockSide;
  direction: "input" | "output";
  /** Defaults to `id` — `PortEdgeItem.label` is required (rendered text:
   *  `LabeledPort`, and the collapsed rail's "+N ports" count), so a
   *  caller that only names an id gets it echoed back rather than a blank
   *  label. */
  label?: string;
  state?: PortState;
}

/** React Flow's four-way `Position` union, restated as a plain string
 *  union — see the module doc for why this file does not import the real
 *  enum. */
export type HandlePosition = "left" | "right" | "top" | "bottom";

/**
 * `BlockSide` and `Position` are the same four-way union in different
 * vocabularies, but the brief is explicit not to assume an ordering
 * between them — this is a named table, not a positional cast.
 */
export const BLOCK_SIDE_TO_HANDLE_POSITION: Record<BlockSide, HandlePosition> = {
  left: "left",
  right: "right",
  top: "top",
  bottom: "bottom",
};

export function reactFlowHandleType(direction: BlockNodePort["direction"]): "target" | "source" {
  return direction === "input" ? "target" : "source";
}

/**
 * Groups a flat port list by wall, preserving each wall's as-authored
 * order. That order is load-bearing, not cosmetic: `blockNodeReactflow.tsx`
 * zips a rail's measured, ordered dot centres back onto these ids
 * positionally (its own module doc explains why a zip and not a second
 * geometry computation), and the zip is only correct if this function's
 * order matches the order `BlockPort`/`PortEdge` render `items` in — which
 * is this same as-authored order, unmodified.
 */
export function groupPortsByEdge(ports: BlockNodePort[]): Partial<Record<BlockSide, BlockNodePort[]>> {
  const grouped: Partial<Record<BlockSide, BlockNodePort[]>> = {};
  for (const side of BLOCK_SIDES) {
    const members = ports.filter((p) => p.edge === side);
    if (members.length > 0) grouped[side] = members;
  }
  return grouped;
}

/** `BlockEdgeSpec.items` wants `PortEdgeItem[]` — this is the one-line
 *  reshape, kept here (not inlined in the component) so it stays testable
 *  without a mount. */
export function toPortEdgeItems(ports: BlockNodePort[]): PortEdgeItem[] {
  return ports.map((p) => ({ id: p.id, label: p.label ?? p.id, state: p.state }));
}

/**
 * A stable key that changes exactly when a re-measure is needed — the same
 * device `blockPort.tsx`'s own `useBlockBands` uses (`layoutKey`), extended
 * with this file's own ids/directions/states/labels so a port that changes
 * `state` (which can change a rail's `distribution`/wall length under
 * `BlockPort`'s own rules) also triggers a re-measure here.
 */
export function handleLayoutKey(
  view: string,
  portsByEdge: Partial<Record<BlockSide, BlockNodePort[]>>,
): string {
  return BLOCK_SIDES.map((side) => {
    const members = portsByEdge[side] ?? [];
    return `${side}:${members.map((p) => `${p.id}#${p.direction}#${p.state ?? ""}#${p.label ?? ""}`).join(",")}`;
  }).join("|") + `|view:${view}`;
}
