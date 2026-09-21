/**
 * src/scene/interactions/dragIntent.ts — "sense the click and drag motion".
 *
 * Zach, `PROJECT - Black Box UI.md:2504`: *"generally where I just 1 click
 * and drag I want it to move, even if it hasn't been selected prior, you
 * need to sense the click and drag motion..."*
 *
 * This is that sensing, as a pure reducer: press → (click | drag), decided
 * by distance travelled in client px, with no timer anywhere. It has no
 * React and no DOM, so the rule is unit-testable without a browser — which
 * matters, because a gesture rule asserted by "the element exists" proves
 * nothing.
 *
 * WHY a reducer rather than a hook with the logic inside it: the two facts
 * worth testing are (a) at what travel does a press become a drag, and (b)
 * what does a release mean given the component's active state. Both are
 * arithmetic over a few numbers. Keeping them out of the React binding is
 * what lets the unit project cover them; the binding in `useDragIntent.ts`
 * then holds only listener plumbing.
 *
 * WHY there is no long-press branch: see the closing note in
 * `dragPolicy.ts` — the donor established in a PEP that a dwell timer
 * cannot separate gesture owners, because tldraw's own `long_press` is
 * cleared by the drag-threshold move branch.
 */

import {
  CANVAS_DRAG_INTENT_COARSE_PX,
  CANVAS_DRAG_INTENT_PX,
  INNER_CLAIM_PX,
  resolveClick,
  type ClickOutcome,
  type DragDeclaration,
  type GrabResolution,
} from "./dragPolicy";

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Which owner this press is being sensed for. Picks the threshold, and
 *  the ordering between the two is the load-bearing part — see
 *  `INNER_CLAIM_PX`'s WHY. */
export type IntentOwner = "canvas" | "inner";

export interface IntentOptions {
  readonly owner?: IntentOwner;
  /** A coarse pointer (touch) gets tldraw's coarse threshold. */
  readonly coarse?: boolean;
}

export function thresholdFor(options: IntentOptions = {}): number {
  if (options.owner === "inner") return INNER_CLAIM_PX;
  return options.coarse ? CANVAS_DRAG_INTENT_COARSE_PX : CANVAS_DRAG_INTENT_PX;
}

export type IntentPhase =
  /** No press in flight. */
  | "idle"
  /** Pressed, still under the threshold — could still be either. */
  | "pressed"
  /** Past the threshold. Committed to a move; a release here can never
   *  open an editor (donor: blockClickToEdit.ts:131-135). */
  | "dragging";

export interface IntentState {
  readonly phase: IntentPhase;
  /** Where the press landed, in client px. */
  readonly origin: Point | null;
  /** The latest pointer position, in client px. */
  readonly at: Point | null;
  /** What the policy said about the press target. */
  readonly resolution: GrabResolution | null;
  readonly threshold: number;
}

export const IDLE: IntentState = { phase: "idle", origin: null, at: null, resolution: null, threshold: CANVAS_DRAG_INTENT_PX };

/**
 * A press landed. Only a `grab` surface enters `pressed`: an `inert` or
 * `owns-pointer` press is not this owner's gesture at all, so it never
 * arms and can never be turned into a drag by later movement.
 */
export function press(at: Point, resolution: GrabResolution, options: IntentOptions = {}): IntentState {
  const threshold = thresholdFor(options);
  if (resolution.role !== "grab") return { ...IDLE, resolution, threshold };
  return { phase: "pressed", origin: at, at, resolution, threshold };
}

/** Euclidean travel in client px. Squared comparison, the way the donor
 *  asks it (`systemsketch/src/behaviorTree/treeDndDrag.tsx:507-518` —
 *  `dx*dx + dy*dy < claimDistance * claimDistance`, no `Math.sqrt`). */
export function travelled(state: IntentState, to: Point): number {
  if (!state.origin) return 0;
  const dx = to.x - state.origin.x;
  const dy = to.y - state.origin.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * The pointer moved. Crossing the threshold commits to a drag and never
 * uncommits — a gesture that wandered back inside the threshold is still a
 * drag, because the thing has already moved under the user's hand.
 */
export function move(state: IntentState, to: Point): IntentState {
  if (state.phase === "idle" || !state.origin) return state;
  if (state.phase === "dragging") return { ...state, at: to };
  const dx = to.x - state.origin.x;
  const dy = to.y - state.origin.y;
  return dx * dx + dy * dy > state.threshold * state.threshold
    ? { ...state, phase: "dragging", at: to }
    : { ...state, at: to };
}

/**
 * How far the thing being dragged should have moved, in client px.
 *
 * WHY measured from the ORIGIN and not from the threshold-crossing point:
 * React Flow does the latter, and it costs the grab point. Its `startDrag`
 * sets `lastPos` to the position at which the threshold was crossed
 * (`@xyflow/system@0.0.82/dist/esm/index.mjs:2255-2256`), so the node
 * lags the pointer permanently by the first move event's delta — measured
 * in this lane 2026-09-17: a 6-step 40px drag moved the node 34px, i.e.
 * 40 minus the 6.67px first step. With a real mouse the slip is only 1-2px
 * so it reads as slight stickiness rather than a bug, but a policy that
 * claims the thing tracks the pointer should actually track it.
 */
export function dragDelta(state: IntentState): Point {
  if (state.phase !== "dragging" || !state.origin || !state.at) return { x: 0, y: 0 };
  return { x: state.at.x - state.origin.x, y: state.at.y - state.origin.y };
}

export type ReleaseOutcome =
  /** The press became a drag. Commit the move; open no editor, ever. */
  | { kind: "moved"; delta: Point }
  /** The press stayed a click. What that means is the policy's call. */
  | { kind: "clicked"; outcome: ClickOutcome }
  /** Never ours. */
  | { kind: "ignored" };

export function release(
  state: IntentState,
  options: { readonly wasActive: boolean; readonly declaration?: DragDeclaration },
): ReleaseOutcome {
  if (state.phase === "dragging") return { kind: "moved", delta: dragDelta(state) };
  if (state.phase === "pressed" && state.resolution) {
    return { kind: "clicked", outcome: resolveClick(state.resolution, options) };
  }
  return { kind: "ignored" };
}

/**
 * Escape mid-gesture rolls the whole thing back — one undo step for one
 * gesture. Donor: `systemsketch/src/blocks/memberStackDnd.tsx` per
 * `Projects/bbox-ui/Components/DP - Block.md:429` — "Escape rolls
 * everything back, one undo reverts the whole gesture".
 */
export function cancel(): IntentState {
  return IDLE;
}
