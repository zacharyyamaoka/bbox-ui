// src/recording/frameFallback.test.ts — ported verbatim from the archive:
// /home/bam/systemsketch/src/recorder/frameFallback.test.ts:1-18.
import { describe, expect, it } from 'vitest'
import { CANVAS_FRAME_MAX_PIXELS, canvasFrameScale } from './frameFallback'

describe('canvasFrameScale', () => {
  it('keeps a small board at the intended half scale', () => {
    expect(canvasFrameScale(800, 600)).toBe(0.5)
  })

  it('caps a sprawling page by raster pixels rather than by one dimension', () => {
    const scale = canvasFrameScale(4_785, 15_479)
    expect(scale).toBeLessThan(0.5)
    expect(4_785 * scale * 15_479 * scale).toBeLessThanOrEqual(CANVAS_FRAME_MAX_PIXELS)
  })

  it('declines an invalid export bound', () => {
    expect(canvasFrameScale(Number.POSITIVE_INFINITY, 200)).toBe(0)
  })
})
