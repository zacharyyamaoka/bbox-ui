// src/recording/frameFallback.ts — PORTED VERBATIM from the archive:
// /home/bam/systemsketch/src/recorder/frameFallback.ts:1-21 (read on disk
// 2026-09-19). Pure arithmetic, no DOM: the pixel budget the canvas-only
// fallback frame is exported at.
/**
 * Pixel budget for the canvas-only recording fallback.
 *
 * The screencast normally captures the viewport. This fallback exports the
 * whole page, whose bounds can be far larger than the viewport, so its budget
 * must be deliberately modest. Four million pixels is enough to make a bug
 * report legible while keeping the raster backing store around 16 MiB.
 */
export const CANVAS_FRAME_MAX_PIXELS = 4_000_000
export const CANVAS_FRAME_MAX_SCALE = 0.5

/**
 * Pick an export scale that preserves small boards but bounds a large board's
 * raster allocation. `pixelRatio: 1` is paired with this scale at the call
 * site—otherwise tldraw's default DPR would silently double each dimension.
 */
export function canvasFrameScale(width: number, height: number): number {
  const area = Math.max(1, width) * Math.max(1, height)
  if (!Number.isFinite(area)) return 0
  return Math.min(CANVAS_FRAME_MAX_SCALE, Math.sqrt(CANVAS_FRAME_MAX_PIXELS / area))
}
