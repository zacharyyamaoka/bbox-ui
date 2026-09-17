// ============================================================================
// PORTED VERBATIM from SystemSketch, a read-only donor tree (copied 2026-09-17
// from `/home/bam/systemsketch/src/blocks/elbow/index.ts`).
//
// Zero code edits below this banner — a byte-for-byte copy.
//
// WHY a copy and not a dependency, and WHY the comments travel: this folder is
// dependency-free by design — its own header says it "must stay importable from
// a plain node script" — so copying costs nothing and keeps bbox-ui's core rule
// intact (`CLAUDE.md`: the core imports no canvas engine). Zach's rule for the
// copy: "whenever possible just copy pasted code from those libraries. make
// sure to keep that documentation with the functions." Every `@ported
// Excalidraw` tag, PROVENANCE section and WHY comment below is the donor's,
// unedited. Keeping the directory shape file-for-file (docs/TRACE-PLAN.md D3)
// is what makes a future re-sync a plain `diff` rather than an archaeology dig.
// ============================================================================

/**
 * Multi-bend elbow cables — the pure core.
 *
 * ## The seam
 *
 * ```ts
 * const route = routeElbow({ start, end, obstacles, pins })   // pure
 * const d     = elbowPath(route)                              // SVG path data
 * ```
 *
 * Nothing in this folder imports tldraw, React or `@xyflow/react`. That is
 * deliberate: the router is the part that has to be provable, and the substrate
 * is the part that keeps changing. The integrator wires it up; see
 * `docs/elbow-arrows-2026-08-26.md` for the recommended shape (a custom `cable`
 * shape, not a subclass of `ArrowShapeUtil`) and the source citations behind it.
 *
 * ## Persisted form
 *
 * A cable persists `ElbowPin[]` and nothing else about its geometry — a pin is
 * `{ index, axis, t, offset }`, an offset in the frame spanned by the two
 * endpoints. Endpoints move, pins move with them. See `elbowPins.ts`.
 */

export type {
  ElbowAxis,
  ElbowBounds,
  ElbowPoint,
  ElbowRect,
  ElbowSide,
} from './geometry'
export {
  ELBOW_SIDE_AXIS,
  ELBOW_SIDE_DELTA,
  ELBOW_SIDE_OPPOSITE,
  boundsOfRect,
  nearestSide,
  rectOfBounds,
} from './geometry'

export type {
  BoundaryCrossing,
  BoundaryCrossingOptions,
  CrossingDirection,
} from './boundaryCrossing'
export {
  boundaryCrossings,
  firstExit,
  firstExitPerBox,
  lastEntry,
  prefersSide,
} from './boundaryCrossing'

export type { ElbowPin } from './elbowPins'
export {
  PIN_SPAN_FLOOR,
  PIN_T_LIMIT,
  createPin,
  mergePin,
  pinCross,
  pinsEqual,
  removePin,
  resolvePin,
} from './elbowPins'

export type {
  ElbowEndpoint,
	ElbowRouteSoftClearance,
  ElbowRoutingObstacle,
  ElbowRoute,
  ElbowRouteInput,
  ElbowRouteOptions,
  ElbowSegment,
} from './elbowRouter'
export { DEFAULT_ELBOW_OPTIONS, pinElbowSegment, routeElbow } from './elbowRouter'

export type { ElbowSoftClearanceOptions, ElbowSoftRoute } from './softClearance'
export {
  DEFAULT_ELBOW_SOFT_CLEARANCE_OPTIONS,
  hasElbowSoftClearancePreference,
  resolveElbowSoftClearanceOptions,
  softClearanceCost,
} from './softClearance'

export type { ElbowPathOptions } from './elbowPath'
export { elbowPath, elbowPointAt, elbowRouteLength } from './elbowPath'

export type { ChannelSpacingDefect, NudgeOptions, NudgeReport } from './nudge'
export {
  DEFAULT_NUDGE_OPTIONS,
  channelSpacingDefects,
  coincidentOverlap,
  countCrossings,
  nudgeRoutes,
  orderBundle,
} from './nudge'
