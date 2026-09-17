// ============================================================================
// PORTED VERBATIM from SystemSketch, a read-only donor tree (copied 2026-09-17
// from `/home/bam/systemsketch/src/blocks/connections/collisionAwareRouting.ts`).
//
// TWO edits below this banner, both mechanical: the file is named
// `collisionRouting.ts` here (it lives INSIDE the elbow folder rather than
// beside it), and its one import moved from `'../elbow'` to `'./index'` to
// match. Not one line of logic changed.
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
 * Pure collision-routing phases used by Tidy edges.
 *
 * Keep these functions separate. Obstacle discovery belongs in
 * `routingObstacles.ts`; this file plans one edge, stabilizes that choice, and
 * guards the independent multi-edge nudger from reintroducing a collision.
 */
import {
	DEFAULT_ELBOW_OPTIONS,
	DEFAULT_NUDGE_OPTIONS,
	channelSpacingDefects,
	coincidentOverlap,
	ELBOW_SIDE_AXIS,
	ELBOW_SIDE_DELTA,
	nudgeRoutes,
	routeElbow,
	resolveElbowSoftClearanceOptions,
	softClearanceCost,
	type ElbowPoint,
	type ElbowRect,
	type ElbowRoutingObstacle,
	type ElbowRoute,
	type ElbowRouteInput,
	type NudgeOptions,
	type NudgeReport,
} from './index'

const EPSILON = 1e-6

export function routesHaveSamePoints(first: ElbowRoute, second: ElbowRoute): boolean {
	return first.points.length === second.points.length
		&& first.points.every((point, index) => {
			const other = second.points[index]
			return Math.abs(point.x - other.x) <= EPSILON && Math.abs(point.y - other.y) <= EPSILON
		})
}

export function routeIsOrthogonal(route: ElbowRoute): boolean {
	return route.points.every((point, index) => {
		if (index === 0) return Number.isFinite(point.x) && Number.isFinite(point.y)
		const previous = route.points[index - 1]
		return Number.isFinite(point.x) && Number.isFinite(point.y)
			&& (Math.abs(previous.x - point.x) <= EPSILON || Math.abs(previous.y - point.y) <= EPSILON)
	})
}

function expanded(rect: ElbowRect, amount: number): ElbowRect {
	return {
		x: rect.x - amount,
		y: rect.y - amount,
		w: rect.w + amount * 2,
		h: rect.h + amount * 2,
	}
}

/** Strict-interior collision: a route may run exactly on a keep-out boundary. */
function segmentHitsRect(from: ElbowPoint, to: ElbowPoint, rect: ElbowRect): boolean {
	const left = rect.x
	const right = rect.x + rect.w
	const top = rect.y
	const bottom = rect.y + rect.h
	if (Math.abs(from.x - to.x) <= EPSILON) {
		const x = from.x
		const low = Math.min(from.y, to.y)
		const high = Math.max(from.y, to.y)
		return x > left + EPSILON && x < right - EPSILON
			&& low < bottom - EPSILON && high > top + EPSILON
	}
	if (Math.abs(from.y - to.y) <= EPSILON) {
		const y = from.y
		const low = Math.min(from.x, to.x)
		const high = Math.max(from.x, to.x)
		return y > top + EPSILON && y < bottom - EPSILON
			&& low < right - EPSILON && high > left + EPSILON
	}
	return true
}

export function routeClearsObstacles(
	route: ElbowRoute,
	obstacles: readonly ElbowRoutingObstacle[],
	clearance = DEFAULT_ELBOW_OPTIONS.padding,
): boolean {
	if (!routeIsOrthogonal(route)) return false
	for (let index = 0; index + 1 < route.points.length; index += 1) {
		for (const obstacle of obstacles) {
			const obstacleClearance = Math.max(0, obstacle.clearance ?? clearance)
			if (segmentHitsRect(
				route.points[index],
				route.points[index + 1],
				expanded(obstacle, obstacleClearance),
			)) {
				return false
			}
		}
	}
	return true
}

function pointsMatch(first: ElbowPoint | undefined, second: ElbowPoint): boolean {
	return first !== undefined
		&& Math.abs(first.x - second.x) <= EPSILON
		&& Math.abs(first.y - second.y) <= EPSILON
}

function adjacentPointIsOnSide(endpoint: ElbowRouteInput['start'], adjacent: ElbowPoint): boolean {
	const axis = ELBOW_SIDE_AXIS[endpoint.side]
	const cross = axis === 'x' ? 'y' : 'x'
	const delta = ELBOW_SIDE_DELTA[endpoint.side]
	return Math.abs(adjacent[cross] - endpoint.point[cross]) <= EPSILON
		&& (adjacent[axis] - endpoint.point[axis]) * delta[axis] >= -EPSILON
}

/**
 * Validate a route against the complete one-edge input. Endpoint boxes are
 * special: the first/last segment may cross its own card while leaving through
 * the bound port, but no later segment may re-enter the card itself. Its outer
 * padding is intentionally soft so a nearby obstacle may shorten the dongle
 * and turn inside that aesthetic margin without drawing behind the Block.
 */
export function routeClearsInput(route: ElbowRoute, input: ElbowRouteInput): boolean {
	if (!routeIsOrthogonal(route) || route.points.length < 2) return false
	if (!pointsMatch(route.points[0], input.start.point)
		|| !pointsMatch(route.points.at(-1), input.end.point)) return false
	if (!adjacentPointIsOnSide(input.start, route.points[1])
		|| !adjacentPointIsOnSide(input.end, route.points.at(-2)!)) return false

	const padding = { ...DEFAULT_ELBOW_OPTIONS, ...input.options }.padding
	if (!routeClearsObstacles(route, input.obstacles ?? [], padding)) return false
	const lastSegment = route.points.length - 2
	for (let index = 0; index <= lastSegment; index += 1) {
		if (index > 0 && input.start.box
			&& segmentHitsRect(route.points[index], route.points[index + 1], input.start.box)) {
			return false
		}
		if (index < lastSegment && input.end.box
			&& segmentHitsRect(route.points[index], route.points[index + 1], input.end.box)) {
			return false
		}
	}
	return true
}

/** One edge in, one deterministic orthogonal candidate out. No editor access. */
export function planOrthogonalRoute(input: ElbowRouteInput): ElbowRoute {
	return routeElbow(input)
}

/**
 * Retain a still-valid automatic corridor. This makes a distant board change a
 * no-op for the edge while still replacing any route that now hits an obstacle.
 */
export function stabilizeOrthogonalRoute(
	previous: ElbowRoute,
	planned: ElbowRoute,
	input: ElbowRouteInput,
): ElbowRoute {
	const previousStartsAt = previous.points[0]
	const previousEndsAt = previous.points.at(-1)
	const plannedStartsAt = planned.points[0]
	const plannedEndsAt = planned.points.at(-1)
	const endpointsMatch = previousStartsAt && previousEndsAt && plannedStartsAt && plannedEndsAt
		&& Math.abs(previousStartsAt.x - plannedStartsAt.x) <= EPSILON
		&& Math.abs(previousStartsAt.y - plannedStartsAt.y) <= EPSILON
		&& Math.abs(previousEndsAt.x - plannedEndsAt.x) <= EPSILON
		&& Math.abs(previousEndsAt.y - plannedEndsAt.y) <= EPSILON
	if (!endpointsMatch || !routeClearsInput(previous, input)) return planned
	if (input.softClearance) {
		const softOptions = resolveElbowSoftClearanceOptions(input.softClearance.options)
		const previousCost = softClearanceCost(previous.points, input.softClearance.routes, softOptions)
		const plannedCost = softClearanceCost(planned.points, input.softClearance.routes, softOptions)
		// Preserve the old automatic corridor only when it is not visibly worse.
		// With both weights at zero these costs tie, preserving legacy stability.
		if (previousCost > plannedCost + EPSILON) return planned
	}
	return {
		...previous,
		points: previous.points.map((point) => ({ ...point })),
		segments: previous.segments.map((segment) => ({
			...segment,
			start: { ...segment.start },
			end: { ...segment.end },
			midpoint: { ...segment.midpoint },
		})),
	}
}

export interface CollisionSafeNudgeReport extends NudgeReport {
	/** Movable routes whose proposed channel shift would enter a keep-out. */
	reverted: number[]
}

/**
 * Run the existing bundle nudger, then reject only the channel shifts that
 * would violate their independently collected obstacle set.
 */
export function nudgeRoutesWithoutObstacleCollisions(
	routes: readonly ElbowRoute[],
	inputsByRoute: readonly (ElbowRouteInput | undefined)[],
	locked: readonly boolean[] = [],
	options: Partial<NudgeOptions> = {},
): CollisionSafeNudgeReport {
	const proposed = nudgeRoutes(routes, options, locked)
	const safe = proposed.routes.map((route, index) => {
		if (locked[index] || !inputsByRoute[index] || routeClearsInput(route, inputsByRoute[index])) return route
		return {
			...routes[index],
			points: routes[index].points.map((point) => ({ ...point })),
		}
	})
	const reverted = proposed.routes.flatMap((route, index) => (
		!locked[index] && !routesHaveSamePoints(route, safe[index]) ? [index] : []
	))
	const opts = { ...DEFAULT_NUDGE_OPTIONS, ...options }
	return {
		...proposed,
		routes: safe,
		reverted,
		overlapAfter: coincidentOverlap(safe, opts.tolerance),
		spacingDefects: channelSpacingDefects(routes, safe, locked, opts),
	}
}
