// ============================================================================
// PORTED VERBATIM from SystemSketch, a read-only donor tree (copied 2026-09-17
// from `/home/bam/systemsketch/src/blocks/elbow/softClearance.ts`).
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
 * Optional, local preference for keeping automatic elbow cables legible.
 *
 * This is intentionally a *cost*, never another obstacle class. Structural
 * Blocks, Branch regions, and painted port text are still supplied to the
 * router as hard keep-outs. A cable may enter this soft zone when the board
 * leaves no better route, which is important for compact diagrams and for
 * preserving an author's node placement.
 */
import type { ElbowPoint } from './geometry'

const EPSILON = 1e-6

/** A painted orthogonal route that a new automatic cable may prefer to avoid. */
export interface ElbowSoftRoute {
	points: readonly ElbowPoint[]
}

/**
 * Fully zeroable weights for local cable separation.
 *
 * `clearance` is the desired gap in canvas pixels. The two weights are measured
 * in bend-equivalents: `nearMissWeight` is charged proportionally inside that
 * gap, while `crossingWeight` is charged for an interior perpendicular
 * intersection. Set either weight to zero to remove only that preference, or
 * set both to zero for byte-for-byte legacy route scoring.
 */
export interface ElbowSoftClearanceOptions {
	clearance: number
	nearMissWeight: number
	crossingWeight: number
}

export const DEFAULT_ELBOW_SOFT_CLEARANCE_OPTIONS: ElbowSoftClearanceOptions = {
	clearance: 32,
	nearMissWeight: 0.4,
	crossingWeight: 3,
}

export function resolveElbowSoftClearanceOptions(
	overrides: Partial<ElbowSoftClearanceOptions> | undefined,
): ElbowSoftClearanceOptions {
	const nonNegative = (value: number | undefined, fallback: number) => (
		Number.isFinite(value) ? Math.max(0, value!) : fallback
	)
	return {
		clearance: nonNegative(overrides?.clearance, DEFAULT_ELBOW_SOFT_CLEARANCE_OPTIONS.clearance),
		nearMissWeight: nonNegative(overrides?.nearMissWeight,
			DEFAULT_ELBOW_SOFT_CLEARANCE_OPTIONS.nearMissWeight),
		crossingWeight: nonNegative(overrides?.crossingWeight,
			DEFAULT_ELBOW_SOFT_CLEARANCE_OPTIONS.crossingWeight),
	}
}

export function hasElbowSoftClearancePreference(
	options: ElbowSoftClearanceOptions,
): boolean {
	return options.crossingWeight > 0
		|| (options.clearance > 0 && options.nearMissWeight > 0)
}

interface Segment {
	start: ElbowPoint
	end: ElbowPoint
	axis: 'x' | 'y'
}

function pointDistance(first: ElbowPoint, second: ElbowPoint): number {
	return Math.abs(first.x - second.x) + Math.abs(first.y - second.y)
}

function samePoint(first: ElbowPoint, second: ElbowPoint): boolean {
	return pointDistance(first, second) <= EPSILON
}

function intervalDistance(firstLow: number, firstHigh: number, secondLow: number, secondHigh: number): number {
	if (firstHigh < secondLow) return secondLow - firstHigh
	if (secondHigh < firstLow) return firstLow - secondHigh
	return 0
}

function segmentOf(start: ElbowPoint, end: ElbowPoint): Segment | null {
	if (Math.abs(start.y - end.y) <= EPSILON && Math.abs(start.x - end.x) > EPSILON) {
		return { start, end, axis: 'x' }
	}
	if (Math.abs(start.x - end.x) <= EPSILON && Math.abs(start.y - end.y) > EPSILON) {
		return { start, end, axis: 'y' }
	}
	return null
}

function routeSegments(points: readonly ElbowPoint[]): Segment[] {
	const segments: Segment[] = []
	for (let index = 0; index + 1 < points.length; index += 1) {
		const segment = segmentOf(points[index], points[index + 1])
		if (segment) segments.push(segment)
	}
	return segments
}

function segmentsShareEndpoint(first: Segment, second: Segment): boolean {
	return samePoint(first.start, second.start)
		|| samePoint(first.start, second.end)
		|| samePoint(first.end, second.start)
		|| samePoint(first.end, second.end)
}

/** Manhattan gap between two axis-aligned cable strokes. */
function segmentDistance(first: Segment, second: Segment): number {
	if (first.axis === 'x' && second.axis === 'x') {
		return Math.abs(first.start.y - second.start.y) + intervalDistance(
			Math.min(first.start.x, first.end.x), Math.max(first.start.x, first.end.x),
			Math.min(second.start.x, second.end.x), Math.max(second.start.x, second.end.x),
		)
	}
	if (first.axis === 'y' && second.axis === 'y') {
		return Math.abs(first.start.x - second.start.x) + intervalDistance(
			Math.min(first.start.y, first.end.y), Math.max(first.start.y, first.end.y),
			Math.min(second.start.y, second.end.y), Math.max(second.start.y, second.end.y),
		)
	}
	const vertical = first.axis === 'y' ? first : second
	const horizontal = first.axis === 'x' ? first : second
	return intervalDistance(
		Math.min(vertical.start.x, vertical.end.x), Math.max(vertical.start.x, vertical.end.x),
		Math.min(horizontal.start.x, horizontal.end.x), Math.max(horizontal.start.x, horizontal.end.x),
	) + intervalDistance(
		Math.min(horizontal.start.y, horizontal.end.y), Math.max(horizontal.start.y, horizontal.end.y),
		Math.min(vertical.start.y, vertical.end.y), Math.max(vertical.start.y, vertical.end.y),
	)
}

/** A genuine crossing, not two cables merely sharing a terminal point. */
function crossesInterior(first: Segment, second: Segment): boolean {
	if (first.axis === second.axis || segmentsShareEndpoint(first, second)) return false
	const vertical = first.axis === 'y' ? first : second
	const horizontal = first.axis === 'x' ? first : second
	return vertical.start.x > Math.min(horizontal.start.x, horizontal.end.x) + EPSILON
		&& vertical.start.x < Math.max(horizontal.start.x, horizontal.end.x) - EPSILON
		&& horizontal.start.y > Math.min(vertical.start.y, vertical.end.y) + EPSILON
		&& horizontal.start.y < Math.max(vertical.start.y, vertical.end.y) - EPSILON
}

/**
 * Score the local legibility cost of one candidate route against fixed routes.
 * Lower is better. This deliberately has no routing side effects, which makes
 * each knob independently testable and lets a caller opt out with zero weights.
 */
export function softClearanceCost(
	points: readonly ElbowPoint[],
	references: readonly ElbowSoftRoute[],
	options: ElbowSoftClearanceOptions,
): number {
	if (!hasElbowSoftClearancePreference(options) || references.length === 0) return 0
	let total = 0
	for (const candidate of routeSegments(points)) {
		for (const referenceRoute of references) {
			for (const reference of routeSegments(referenceRoute.points)) {
				if (segmentsShareEndpoint(candidate, reference)) continue
				if (options.crossingWeight > 0 && crossesInterior(candidate, reference)) {
					total += options.crossingWeight
				}
				if (options.clearance > 0 && options.nearMissWeight > 0) {
					const gap = segmentDistance(candidate, reference)
					if (gap < options.clearance - EPSILON) {
						total += options.nearMissWeight * (options.clearance - gap) / options.clearance
					}
				}
			}
		}
	}
	return total
}

/**
 * Candidate rails around only the references already close to the unweighted
 * route. They are alternatives, not walls: A* may cross them if space demands.
 */
export function softClearanceGuideLines(
	references: readonly ElbowSoftRoute[],
	options: ElbowSoftClearanceOptions,
): { xs: number[]; ys: number[] } {
	if (!hasElbowSoftClearancePreference(options)) return { xs: [], ys: [] }
	const xs: number[] = []
	const ys: number[] = []
	const offset = options.clearance
	for (const route of references) {
		for (const point of route.points) {
			if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
			xs.push(point.x, point.x - offset, point.x + offset)
			ys.push(point.y, point.y - offset, point.y + offset)
		}
	}
	return { xs, ys }
}
