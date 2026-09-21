/**
 * src/scene/hitPolicy.ts — the zoom question, as one pure function.
 *
 * Every hit constant in `src/components` is SCENE-SPACE: a px value in the
 * component's own coordinate system, with no zoom compensation anywhere
 * (measured — grep the components for `zoom`; there is none). Under a
 * host's viewport transform the region therefore scales with zoom, exactly
 * like React Flow's `interactionWidth` and unlike tldraw's screen-space
 * `hitTestMargin` (which tldraw divides by zoom internally).
 *
 * That leaves two policies a host can want, and this module names them:
 *
 *   "scene"  — the region is a fixed size ON THE BOARD. Zooming in makes
 *              it bigger on screen; zooming out shrinks it (at 0.5× a
 *              12px trace band is 6 screen px — under most usable pointer
 *              targets).
 *   "screen" — the region is a fixed size ON THE SCREEN. The host divides
 *              the constant by its current zoom before passing it, so the
 *              scene-space value shrinks as you zoom in and the screen
 *              size holds.
 *
 * WHY the division lives here (host side of the seam) and not inside the
 * components: ARCHITECTURE.md's "Kits and consumers" — the HOST owns the
 * viewport transform, pan/zoom and spatial hit-testing. A component that
 * read the zoom itself would be self-measuring, which the core forbids.
 * The constant is ours; the current zoom is the host's input. This file is
 * the exact function a Phase-2 host (DOM / React Flow) reuses.
 */

/** The gallery's four zoom stops — same set as pyblocks'
 * hit-constants gallery (2026-08-27), which is the format this copies. */
export const ZOOM_LEVELS = [0.5, 1, 2, 4] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];

export type HitPolicy = "scene" | "screen";

export const HIT_POLICIES: HitPolicy[] = ["scene", "screen"];

export const HIT_POLICY_LABELS: Record<HitPolicy, string> = {
  scene: "Scene (scales with zoom)",
  screen: "Screen (constant px)",
};

/**
 * The scene-space value to hand the component so that, once the host's
 * transform applies `zoom`, the region lands where the policy says:
 *
 *   scene  → value            (on screen: value × zoom)
 *   screen → value / zoom     (on screen: value, at every zoom)
 */
export function effectiveHitValue(valuePx: number, zoom: number, policy: HitPolicy): number {
  if (!(zoom > 0)) throw new Error(`zoom must be > 0, got ${zoom}`);
  return policy === "screen" ? valuePx / zoom : valuePx;
}

/** What the region will measure ON SCREEN — the readout number, and the
 * assertion the stories make against `getBoundingClientRect`. */
export function screenHitValue(valuePx: number, zoom: number, policy: HitPolicy): number {
  return effectiveHitValue(valuePx, zoom, policy) * zoom;
}
