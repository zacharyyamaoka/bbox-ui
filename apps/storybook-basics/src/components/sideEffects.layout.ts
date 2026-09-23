/**
 * src/components/sideEffects.layout.ts — the pure half of a Block's
 * SIDE-EFFECT ports: the model (what a side effect and a mutation link ARE)
 * and the two pieces of geometry `BlockPort` draws them with. No React, no
 * DOM, no canvas engine — every function here runs in plain Node.
 *
 * Zach, 2026-09-22: "add first class support for output and input side
 * effect ports." And for where they go: "Draw a little grey line on the
 * outside to split between input and output side effects. Splits down the
 * middle. If no inputs then just assume its output…. Well it's fine honestly
 * you can put it towards the back end… always its ok…"
 *
 * WHAT WAS HERE BEFORE: nothing. `elbow/boundaryCrossing.ts:25` names "a
 * side-effect port, which appears where an effect cable leaves its block" as
 * one future CALLER of its crossing maths — a DERIVED port that moves when
 * you drag the cable. This file is the other reading, the one Zach sketched
 * on 2026-09-22: a DECLARED port with a stable id and a fixed seat on the top
 * wall. The two do not conflict; nothing here imports or replaces that file.
 *
 * PROVENANCE (docs/ALGORITHM-PROVENANCE.md, row `sideEffects.layout.ts`):
 *  - `sideEffectWallLayout` is class (b): each half of the wall is CSS Box
 *    Alignment's `space-evenly`, computed by calling
 *    `portEdge.layout.ts`'s `mainAxisPositions` — the kit's existing,
 *    already-cited implementation (§1 of that doc) — not a second copy of
 *    it. The split at the midpoint is Zach's own sentence above.
 *  - `mutationRoute` is class (c), ours, ad hoc: a one-bend orthogonal L,
 *    horizontal first and then vertical, which is the route Zach drew. No
 *    prior art is claimed for a two-segment polyline.
 */
import { mainAxisPositions } from "./portEdge.layout";
import type { PortState } from "./port";

/* ------------------------------------------------------------------ */
/* The model                                                           */
/* ------------------------------------------------------------------ */

/**
 * Which way a side effect flows: state the block READS from outside its
 * dataflow (`input`), or state it WRITES to outside it (`output`).
 *
 * WHY its own two words and not `scene/model.ts`'s `PortDirection`
 * (`source | sink`): that vocabulary is a wire's orientation at a port, and
 * a side effect's wire runs the OTHER way round from its name — an input
 * side effect is a wire's SINK, an output side effect its SOURCE. Reusing
 * `source`/`sink` here would make every reader do that inversion in their
 * head. Zach's own words are "input and output side effects", so those are
 * the words.
 */
export type SideEffectDirection = "input" | "output";

/** One side-effect port. `id` is the identity — stamped as `data-port-id`,
 *  so a wire names it exactly as it names any rail port. */
export interface SideEffectPort {
  id: string;
  /** Painted above the wall beside the dot, character for character. Omit
   *  for a bare dot. */
  label?: string;
  /** The same four-value axis every rail port uses. `wired` fills the dot;
   *  omitted reads `empty` (hollow). */
  state?: PortState;
}

/**
 * A block's side effects, keyed by direction.
 *
 * WHY keyed and not a flat `{ id, direction }[]`: it is the exact shape
 * `BlockPortProps.edges` already uses for ordinary ports — `edges.left`,
 * `edges.right` — where the KEY is the placement fact and each list is in
 * authored order. Keyed, an effect cannot be listed as an input while also
 * claiming to be an output, and "every input sits left of the divider"
 * is one list, not a filter a renderer might get wrong.
 */
export interface BlockSideEffects {
  inputs?: readonly SideEffectPort[];
  outputs?: readonly SideEffectPort[];
}

/**
 * "This input is mutated, and leaves through that output side effect." A
 * typed relation between two ids on ONE block: `from` is an ordinary input
 * port (an item on the block's left wall), `to` an OUTPUT side effect.
 *
 * WHY a sibling list on the block and not a field on the input port: the
 * relation is many-to-many in principle (one input mutated into two
 * effects, two inputs into one), and a field on either end could hold only
 * one of those. It is the same reason a `Wire` lives beside its blocks
 * rather than on a port.
 */
export interface MutationLink {
  from: string;
  to: string;
}

/** The direction an effect id is declared with, or `undefined` if this
 *  block declares no such effect. */
export function sideEffectDirectionOf(effects: BlockSideEffects | undefined, id: string): SideEffectDirection | undefined {
  if (effects?.inputs?.some((effect) => effect.id === id)) return "input";
  if (effects?.outputs?.some((effect) => effect.id === id)) return "output";
  return undefined;
}

/** True when the block declares at least one side effect of either kind —
 *  the condition the divider tick is drawn on. */
export function hasSideEffects(effects: BlockSideEffects | undefined): boolean {
  return (effects?.inputs?.length ?? 0) + (effects?.outputs?.length ?? 0) > 0;
}

/**
 * Split `links` into the ones this block can draw and the ones it cannot.
 * A link resolves when `from` is one of `inputPortIds` and `to` is an
 * OUTPUT side effect of this block. Anything else — a typo, a link aimed at
 * an INPUT effect, a port that is not on the input wall — is returned in
 * `unresolved` and drawn nowhere, never guessed at (the same rule
 * `wireLayer.tsx` applies to a wire end it cannot find).
 */
export function partitionMutations(
  links: readonly MutationLink[] | undefined,
  effects: BlockSideEffects | undefined,
  inputPortIds: readonly string[],
): { resolved: MutationLink[]; unresolved: MutationLink[] } {
  const resolved: MutationLink[] = [];
  const unresolved: MutationLink[] = [];
  for (const link of links ?? []) {
    const ok = inputPortIds.includes(link.from) && sideEffectDirectionOf(effects, link.to) === "output";
    (ok ? resolved : unresolved).push(link);
  }
  return { resolved, unresolved };
}

/* ------------------------------------------------------------------ */
/* The top wall — where every dot and the divider sit                   */
/* ------------------------------------------------------------------ */

/** How far the divider tick sticks out ABOVE the top wall, px. */
export const SIDE_EFFECT_DIVIDER_PX = 10;

export interface SideEffectWallLayout {
  /** The divider tick's x — the wall's own horizontal centre. */
  dividerX: number;
  /** Dot-centre x of each input, in authored order. All `< dividerX`. */
  inputXs: number[];
  /** Dot-centre x of each output, in authored order. All `> dividerX`. */
  outputXs: number[];
}

/**
 * Where each side-effect dot centres along the top wall, in WALL-LOCAL px
 * (0 = the block's left border line). The wall splits down the middle:
 * inputs share the left half and outputs the right half, each half
 * `space-evenly`, so a lone input lands at the quarter point and a lone
 * output at the three-quarter point — with outputs only, they still sit
 * right of the centre, "towards the back end".
 *
 * WHY each half is spread rather than packed at a fixed pitch: a label sits
 * beside its dot, growing away from the divider (`blockPort.tsx`'s
 * `SideEffectDot`), so the room a label has is the distance to the next dot
 * out. Spreading over the half hands every label the most room the wall
 * has; a fixed pitch would crowd a short wall and strand a long one.
 */
export function sideEffectWallLayout(wallWidth: number, inputCount: number, outputCount: number): SideEffectWallLayout {
  const half = Math.max(wallWidth, 0) / 2;
  return {
    dividerX: half,
    inputXs: mainAxisPositions(inputCount, half, 0, "space-evenly"),
    outputXs: mainAxisPositions(outputCount, half, 0, "space-evenly").map((x) => half + x),
  };
}

/* ------------------------------------------------------------------ */
/* The mutation line — one bend, horizontal then vertical               */
/* ------------------------------------------------------------------ */

export interface MutationPoint {
  x: number;
  y: number;
}

/** The arrowhead's length along the line and its full width, px. */
export const MUTATION_ARROW_LENGTH_PX = 6;
export const MUTATION_ARROW_WIDTH_PX = 6;

export interface MutationRoute {
  /** The polyline: start, bend, end. */
  points: [MutationPoint, MutationPoint, MutationPoint];
  /** The arrowhead triangle, tip first; the tip IS `points[2]`. */
  arrowhead: [MutationPoint, MutationPoint, MutationPoint];
}

/**
 * The mutation line from an input port's dot to an output side effect's
 * dot: horizontal from the port, then vertical to the effect — the route
 * Zach drew ("runs from the 3rd LEFT-WALL port horizontally through the
 * body, then up to `out 1`").
 *
 * `fromRadiusPx`/`toRadiusPx` pull each end back to its dot's EDGE on the
 * side the line approaches from, so the line starts at the input dot's rim
 * and the arrowhead's tip touches the effect dot's rim rather than
 * disappearing under the dot that paints over it.
 */
export function mutationRoute(from: MutationPoint, to: MutationPoint, fromRadiusPx: number, toRadiusPx: number): MutationRoute {
  const towardX = Math.sign(to.x - from.x) || 1;
  const towardY = Math.sign(to.y - from.y) || -1;
  const start = { x: from.x + towardX * fromRadiusPx, y: from.y };
  const bend = { x: to.x, y: from.y };
  const tip = { x: to.x, y: to.y - towardY * toRadiusPx };
  const base = tip.y - towardY * MUTATION_ARROW_LENGTH_PX;
  const halfWidth = MUTATION_ARROW_WIDTH_PX / 2;
  return {
    points: [start, bend, tip],
    arrowhead: [tip, { x: tip.x - halfWidth, y: base }, { x: tip.x + halfWidth, y: base }],
  };
}
