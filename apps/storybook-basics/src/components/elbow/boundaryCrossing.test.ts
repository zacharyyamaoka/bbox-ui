// ============================================================================
// PORTED VERBATIM from SystemSketch, a read-only donor tree (copied 2026-09-17
// from `/home/bam/systemsketch/src/blocks/elbow/boundaryCrossing.test.ts`).
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

import { describe, expect, it } from 'vitest'

import {
  boundaryCrossings,
  firstExit,
  firstExitPerBox,
  lastEntry,
  prefersSide,
} from './boundaryCrossing'
import type { ElbowPoint, ElbowRect } from './geometry'

const BLOCK: ElbowRect = { x: 100, y: 100, w: 200, h: 80 }
const FRAME: ElbowRect = { x: 40, y: 40, w: 400, h: 220 }

const p = (x: number, y: number): ElbowPoint => ({ x, y })

describe('boundaryCrossings', () => {
  it('reports the exit where a stub leaves the top edge it starts on', () => {
    // The case the effect port needs: the cable begins on the block's own top
    // edge and runs upward, so it leaves at its very first point.
    const crossings = boundaryCrossings([p(200, 100), p(200, 70)], BLOCK)
    expect(crossings).toHaveLength(1)
    expect(crossings[0].direction).toBe('exit')
    expect(crossings[0].side).toBe('top')
    expect(crossings[0].point).toEqual({ x: 200, y: 100 })
    expect(crossings[0].t).toBe(0)
  })

  it('places the crossing where the path actually meets the edge, not at a vertex', () => {
    const crossing = firstExit([p(200, 140), p(200, 60)], BLOCK)
    expect(crossing?.point).toEqual({ x: 200, y: 100 })
    expect(crossing?.side).toBe('top')
    expect(crossing?.distance).toBeCloseTo(40)
  })

  it('moves the crossing when the cable is rerouted — the port follows the cable', () => {
    const upAndRight = [p(200, 100), p(200, 70), p(380, 70), p(380, 40)]
    const upAndLeft = [p(200, 100), p(200, 70), p(90, 70), p(90, 40)]
    expect(firstExit(upAndRight, FRAME)?.point).toEqual({ x: 380, y: 40 })
    expect(firstExit(upAndLeft, FRAME)?.point).toEqual({ x: 90, y: 40 })
  })

  it('names the side a cable leaves a frame by, so a linter can have an opinion', () => {
    const outTheTop = firstExit([p(200, 100), p(200, 20)], FRAME)
    const outTheRight = firstExit([p(200, 100), p(500, 100)], FRAME)
    expect(outTheTop?.side).toBe('top')
    expect(outTheRight?.side).toBe('right')
    expect(prefersSide(outTheTop!, 'top')).toBe(true)
    expect(prefersSide(outTheRight!, 'top')).toBe(false)
  })

  it('reports every crossing when a path leaves and comes back', () => {
    const path = [p(200, 140), p(200, 60), p(260, 60), p(260, 140)]
    const crossings = boundaryCrossings(path, BLOCK)
    expect(crossings.map((crossing) => crossing.direction)).toEqual(['exit', 'enter'])
    expect(crossings[0].point).toEqual({ x: 200, y: 100 })
    expect(crossings[1].point).toEqual({ x: 260, y: 100 })
    expect(crossings[0].distance).toBeLessThan(crossings[1].distance)
  })

  it('records nothing for a segment that runs along an edge without leaving', () => {
    expect(boundaryCrossings([p(120, 100), p(280, 100)], BLOCK)).toEqual([])
  })

  it('records nothing for a path wholly inside or wholly outside', () => {
    expect(boundaryCrossings([p(150, 130), p(250, 150)], BLOCK)).toEqual([])
    expect(boundaryCrossings([p(0, 0), p(20, 20)], BLOCK)).toEqual([])
  })

  it('handles a diagonal segment, so a flattened curve works too', () => {
    const shallow = firstExit([p(200, 140), p(400, 150)], BLOCK)
    expect(shallow?.side).toBe('right')
    expect(shallow?.point.x).toBeCloseTo(300)
    expect(shallow?.point.y).toBeCloseTo(145)
    // A steeper one leaves by the top before it ever reaches the right edge.
    const steep = firstExit([p(200, 140), p(360, 60)], BLOCK)
    expect(steep?.side).toBe('top')
    expect(steep?.point.x).toBeCloseTo(280)
  })

  it('does not report the same vertex twice when a crossing lands on a corner point', () => {
    const path = [p(200, 140), p(200, 100), p(200, 60)]
    const crossings = boundaryCrossings(path, BLOCK)
    expect(crossings).toHaveLength(1)
    expect(crossings[0].point).toEqual({ x: 200, y: 100 })
  })

  it('honours an inset, for a port that should sit outside a frame stroke', () => {
    const path = [p(200, 100), p(200, 20)]
    expect(firstExit(path, FRAME)?.point.y).toBe(40)
    expect(firstExit(path, FRAME, { inset: 6 })?.point.y).toBe(34)
  })

  it('gives one crossing per container for a nested stack, in a single pass', () => {
    const inner: ElbowRect = { x: 120, y: 120, w: 120, h: 60 }
    const path = [p(180, 120), p(180, 90), p(320, 90), p(320, 40), p(320, 10)]
    const exits = firstExitPerBox(path, [
      { key: 'inner', box: inner },
      { key: 'block', box: BLOCK },
      { key: 'frame', box: FRAME },
    ])
    expect(exits.get('inner')?.side).toBe('top')
    expect(exits.get('inner')?.point).toEqual({ x: 180, y: 120 })
    expect(exits.get('block')?.point).toEqual({ x: 180, y: 100 })
    expect(exits.get('frame')?.point).toEqual({ x: 320, y: 40 })
  })

  it('omits a container the path never leaves', () => {
    const exits = firstExitPerBox([p(150, 130), p(250, 150)], [{ key: 'block', box: BLOCK }])
    expect(exits.has('block')).toBe(false)
  })

  it('finds the last re-entry, for a cable that comes back into a group', () => {
    const path = [p(200, 140), p(200, 60), p(260, 60), p(260, 140), p(260, 60)]
    expect(lastEntry(path, BLOCK)?.point).toEqual({ x: 260, y: 100 })
    expect(lastEntry([p(0, 0), p(20, 20)], BLOCK)).toBeNull()
  })
})
