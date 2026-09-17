// ============================================================================
// PORTED VERBATIM from SystemSketch, a read-only donor tree (copied 2026-09-17
// from `/home/bam/systemsketch/src/blocks/connections/collisionAwareRouting.test.ts`).
//
// Two edits, both import specifiers: `'../elbow'` -> `'./index'` and
// `'./collisionAwareRouting'` -> `'./collisionRouting'`. No assertion was
// touched — a ported test whose assertions get "adjusted" to pass is not an
// oracle, it is a rubber stamp.
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

import { describe, expect, it } from 'vitest'

import type { ElbowPoint, ElbowRect, ElbowRoute } from './index'
import {
	nudgeRoutesWithoutObstacleCollisions,
	planOrthogonalRoute,
	routeClearsInput,
	routeClearsObstacles,
	stabilizeOrthogonalRoute,
} from './collisionRouting'

function route(points: ElbowPoint[]): ElbowRoute {
	return { points, segments: [], pins: [], droppedPins: [], fallback: false }
}

describe('single-edge collision planning — independent of nudging', () => {
	it('routes orthogonally around an intervening rectangle', () => {
		const obstacle: ElbowRect = { x: 150, y: -50, w: 100, h: 100 }
		const planned = planOrthogonalRoute({
			start: { point: { x: 0, y: 0 }, side: 'right' },
			end: { point: { x: 400, y: 0 }, side: 'left' },
			obstacles: [obstacle],
		})
		expect(routeClearsObstacles(planned, [obstacle])).toBe(true)
		expect(planned.points.length).toBeGreaterThan(2)
	})

	it('retains a still-clear previous corridor for route stability', () => {
		const previous = route([
			{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 },
			{ x: 350, y: 100 }, { x: 350, y: 0 }, { x: 400, y: 0 },
		])
		const planned = route([
			{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: -100 },
			{ x: 350, y: -100 }, { x: 350, y: 0 }, { x: 400, y: 0 },
		])
		const stable = stabilizeOrthogonalRoute(previous, planned, {
			start: { point: previous.points[0], side: 'right' },
			end: { point: previous.points.at(-1)!, side: 'left' },
		})
		expect(stable.points).toEqual(previous.points)
		expect(stable.points).not.toBe(previous.points)
	})

	it('replaces a previous corridor once an obstacle invalidates it', () => {
		const previous = route([
			{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 },
			{ x: 350, y: 100 }, { x: 350, y: 0 }, { x: 400, y: 0 },
		])
		const planned = route([
			{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: -100 },
			{ x: 350, y: -100 }, { x: 350, y: 0 }, { x: 400, y: 0 },
		])
		const obstacle = { x: 150, y: 80, w: 100, h: 40 }
		expect(stabilizeOrthogonalRoute(previous, planned, {
			start: { point: previous.points[0], side: 'right' },
			end: { point: previous.points.at(-1)!, side: 'left' },
			obstacles: [obstacle],
		}).points).toEqual(planned.points)
	})

	it('rejects a previous corridor that re-enters its own endpoint Block', () => {
		const previous = route([
			{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 40 }, { x: -50, y: 40 },
			{ x: -50, y: 100 }, { x: 350, y: 100 }, { x: 350, y: 0 }, { x: 400, y: 0 },
		])
		const planned = route([
			{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: -100 },
			{ x: 350, y: -100 }, { x: 350, y: 0 }, { x: 400, y: 0 },
		])
		const input = {
			start: { point: { x: 0, y: 0 }, side: 'right' as const, box: { x: -100, y: -50, w: 100, h: 100 } },
			end: { point: { x: 400, y: 0 }, side: 'left' as const },
		}
		expect(routeClearsInput(previous, input)).toBe(false)
		expect(stabilizeOrthogonalRoute(previous, planned, input).points).toEqual(planned.points)
	})

	it('allows a legal early turn inside the endpoint padding but outside the Block', () => {
		const input = {
			start: { point: { x: 120, y: 40 }, side: 'right' as const, box: { x: 0, y: 0, w: 120, h: 80 } },
			end: { point: { x: 800, y: 40 }, side: 'left' as const, box: { x: 800, y: 0, w: 120, h: 80 } },
			obstacles: [{ x: 165, y: -40, w: 130, h: 160 }],
		}
		const planned = planOrthogonalRoute(input)
		expect(planned.points[1].x).toBe(141)
		expect(routeClearsInput(planned, input)).toBe(true)
	})

	it('routes around obstacle padding instead of accepting a raw-boundary graze', () => {
		const input = {
			start: { point: { x: 120, y: 40 }, side: 'right' as const, box: { x: 0, y: 0, w: 120, h: 80 } },
			end: { point: { x: 800, y: 140 }, side: 'left' as const, box: { x: 800, y: 100, w: 120, h: 80 } },
			obstacles: [
				{ x: 650, y: -220, w: 90, h: 220 },
				{ x: 650, y: 140, w: 90, h: 220 },
			],
		}
		const planned = planOrthogonalRoute(input)
		expect(routeClearsInput(planned, input)).toBe(true)
		expect(planned.points).not.toEqual([
			{ x: 120, y: 40 }, { x: 460, y: 40 }, { x: 460, y: 140 }, { x: 800, y: 140 },
		])
	})

	it('uses a tight text clearance for an early turn, then plans multiple elbows around a Block', () => {
		const label = { x: 12, y: -12, w: 170, h: 24, clearance: 4 }
		const blocker = { x: 250, y: -170, w: 100, h: 100 }
		const input = {
			start: { point: { x: 0, y: 0 }, side: 'right' as const },
			end: { point: { x: 500, y: -120 }, side: 'left' as const },
			obstacles: [label, blocker],
		}
		const planned = planOrthogonalRoute(input)

		expect(planned.fallback).toBe(false)
		expect(routeClearsInput(planned, input)).toBe(true)
		expect(planned.points[1]).toEqual({ x: 8, y: 0 })
		expect(planned.segments.map((segment) => segment.axis)).toEqual(['x', 'y', 'x', 'y', 'x'])
	})

	it('prefers the shorter equal-bend channel between Blocks over the frame perimeter', () => {
		const planned = planOrthogonalRoute({
			start: { point: { x: 0, y: 315 }, side: 'right' },
			end: {
				point: { x: 930, y: 146 },
				side: 'left',
				box: { x: 930, y: 80, w: 260, h: 130 },
			},
			obstacles: [
				// This is the cable's own boundary-port label: its painted box is
				// forbidden, but the terminal-specific extra halo is zero.
				{ x: 12, y: 289, w: 170, h: 24, clearance: 0 },
				{ x: 100, y: 50, w: 250, h: 130 },
				{ x: 320, y: 80, w: 250, h: 150 },
				{ x: 500, y: 170, w: 300, h: 130 },
				{ x: 480, y: 390, w: 260, h: 120 },
			],
		})

		expect(planned.points).toEqual([
			{ x: 0, y: 315 },
			{ x: 476, y: 315 },
			{ x: 476, y: 324 },
			{ x: 906, y: 324 },
			{ x: 906, y: 146 },
			{ x: 930, y: 146 },
		])
	})
})

describe('collision-safe bundle nudging — independent of pathfinding', () => {
	it('reverts only a channel shift that would enter an obstacle keep-out', () => {
		const first = route([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 200, y: 200 }])
		const second = route([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 200, y: 200 }])
		const obstacle = { x: 124, y: 50, w: 20, h: 100 }
		const result = nudgeRoutesWithoutObstacleCollisions(
			[first, second],
			[first, second].map((candidate) => ({
				start: { point: candidate.points[0], side: 'right' as const },
				end: { point: candidate.points.at(-1)!, side: 'left' as const },
				obstacles: [obstacle],
			})),
		)
		expect(result.reverted).toHaveLength(1)
		expect(result.routes.some((candidate) => candidate.points[1].x === 100)).toBe(true)
		expect(result.routes.every((candidate) => routeClearsObstacles(candidate, [obstacle]))).toBe(true)
	})
})
