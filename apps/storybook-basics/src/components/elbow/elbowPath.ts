// ============================================================================
// PORTED VERBATIM from SystemSketch, a read-only donor tree (copied 2026-09-17
// from `/home/bam/systemsketch/src/blocks/elbow/elbowPath.ts`).
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
 * Route → SVG path data. Kept separate from the router so the geometry can be
 * unit-tested without a string in sight, and so a renderer that wants
 * `Path2D`/canvas can reuse the same corner maths.
 */

import type { ElbowPoint } from './geometry'
import { pointsEqual } from './geometry'
import type { ElbowRoute } from './elbowRouter'
import { DEFAULT_ELBOW_OPTIONS } from './elbowRouter'

export interface ElbowPathOptions {
  /** Corner rounding in px. `0` draws hard corners. */
  radius: number
  /** Decimal places. Fewer digits keeps the persisted/serialised path small. */
  precision: number
}

const DEFAULT_PATH_OPTIONS: ElbowPathOptions = {
  radius: DEFAULT_ELBOW_OPTIONS.cornerRadius,
  precision: 2,
}

function round(value: number, precision: number): string {
  const factor = 10 ** precision
  const rounded = Math.round(value * factor) / factor
  // `-0` and `1e-7` both serialise badly; normalise them away.
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

function towards(from: ElbowPoint, to: ElbowPoint, distance: number): ElbowPoint {
  const deltaX = to.x - from.x
  const deltaY = to.y - from.y
  const length = Math.hypot(deltaX, deltaY)
  if (length <= 1e-9) return { ...from }
  const ratio = Math.min(distance, length) / length
  return { x: from.x + deltaX * ratio, y: from.y + deltaY * ratio }
}

/**
 * SVG path data for a route.
 *
 * Corner radius is clamped per corner to half of the shorter adjacent segment,
 * so a route with a 6px jog rounds it by 3px rather than overshooting into the
 * neighbouring segment — which is the artefact that makes naive rounded elbows
 * look melted at tight bends.
 */
export function elbowPath(route: ElbowRoute, options?: Partial<ElbowPathOptions>): string {
  const { radius, precision } = { ...DEFAULT_PATH_OPTIONS, ...options }
  const points = route.points.filter(
    (point, index) => index === 0 || !pointsEqual(point, route.points[index - 1], 1e-6),
  )
  if (points.length === 0) return ''
  const place = (point: ElbowPoint) => `${round(point.x, precision)} ${round(point.y, precision)}`
  if (points.length === 1) return `M ${place(points[0])}`

  const parts: string[] = [`M ${place(points[0])}`]
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]
    const corner = points[index]
    const next = points[index + 1]
    const inLength = Math.hypot(corner.x - previous.x, corner.y - previous.y)
    const outLength = Math.hypot(next.x - corner.x, next.y - corner.y)
    const cut = Math.min(radius, inLength / 2, outLength / 2)
    if (cut <= 1e-6) {
      parts.push(`L ${place(corner)}`)
      continue
    }
    parts.push(`L ${place(towards(corner, previous, cut))}`)
    parts.push(`Q ${place(corner)} ${place(towards(corner, next, cut))}`)
  }
  parts.push(`L ${place(points[points.length - 1])}`)
  return parts.join(' ')
}

/** Total drawn length — handy for dash animation and for label placement. */
export function elbowRouteLength(route: ElbowRoute): number {
  return route.segments.reduce((total, segment) => total + segment.length, 0)
}

/** The point at `ratio` along the polyline. `0.5` is the natural label anchor. */
export function elbowPointAt(route: ElbowRoute, ratio: number): ElbowPoint {
  const points = route.points
  if (points.length === 0) return { x: 0, y: 0 }
  if (points.length === 1) return { ...points[0] }
  const lengths = points.slice(0, -1).map((point, index) => (
    Math.hypot(points[index + 1].x - point.x, points[index + 1].y - point.y)
  ))
  const total = lengths.reduce((sum, length) => sum + length, 0)
  if (total <= 1e-9) return { ...points[0] }
  let remaining = total * Math.min(Math.max(ratio, 0), 1)
  for (let index = 0; index < lengths.length; index += 1) {
    if (remaining > lengths[index]) {
      remaining -= lengths[index]
      continue
    }
    const along = remaining / Math.max(lengths[index], 1e-9)
    return {
      x: points[index].x + (points[index + 1].x - points[index].x) * along,
      y: points[index].y + (points[index + 1].y - points[index].y) * along,
    }
  }
  return { ...points[points.length - 1] }
}
