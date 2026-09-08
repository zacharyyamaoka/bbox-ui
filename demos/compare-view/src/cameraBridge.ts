/**
 * The tldraw camera ↔ React Flow viewport bridge.
 *
 * React Flow maps world→screen as `world * zoom + viewport.xy`; tldraw as
 * `(page + camera.xy) * z`. Equating the two for every world point gives
 * `camera.xy = viewport.xy / zoom` — except that tldraw's HTML shape layer
 * is not painted at exactly that transform.
 *
 * WHY the two correction terms: tldraw's `getHtmlLayerTransform` renders the
 * HTML shape layer as `scale(z) translate(x + offset, y + offset)` where
 * `offset` is a zoom-dependent nudge (modulated [0.1,1]→[-2,0.125] below
 * z=1, [1,8]→[0.125,0.5] above), and the 1×1 layer element scales about its
 * own centre, adding another 0.5·(1−z). Left uncompensated the two hosts
 * disagree by a constant whole-scene 0.25px at z=0.45 — measured before
 * this correction, 0.00px after. Both terms are deterministic in z, so the
 * bridge cancels them here rather than shipping a silently misaligned
 * overlay. Now that both panes are live, this runs on EVERY camera change:
 * the compensation is a function of z, so it must be recomputed each sync
 * or the overlay silently de-calibrates as the user zooms.
 */

export interface ReactFlowViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface TldrawCamera {
  x: number;
  y: number;
  z: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** tldraw's zoom-dependent HTML-layer nudge, reproduced exactly. */
export function htmlLayerOffset(zoom: number): number {
  return zoom >= 1
    ? 0.125 + clamp01((zoom - 1) / 7) * (0.5 - 0.125)
    : -2 + clamp01((zoom - 0.1) / 0.9) * (0.125 - -2);
}

/** The 1×1 layer element scaling about its own centre. */
export function originShift(zoom: number): number {
  return 0.5 * (1 - zoom);
}

/** The tldraw camera that paints world space where this viewport does. */
export function reactFlowToTldraw(viewport: ReactFlowViewport): TldrawCamera {
  const { zoom } = viewport;
  const layerOffset = htmlLayerOffset(zoom);
  const shift = originShift(zoom);
  return {
    x: (viewport.x - shift) / zoom - layerOffset,
    y: (viewport.y - shift) / zoom - layerOffset,
    z: zoom,
  };
}

/** The React Flow viewport that paints world space where this camera does. */
export function tldrawToReactFlow(camera: TldrawCamera): ReactFlowViewport {
  const { z } = camera;
  const layerOffset = htmlLayerOffset(z);
  const shift = originShift(z);
  return {
    x: (camera.x + layerOffset) * z + shift,
    y: (camera.y + layerOffset) * z + shift,
    zoom: z,
  };
}

/**
 * "Already in agreement" for the camera link's compare-before-write.
 *
 * WHY an epsilon and not `!==`: a round trip through the bridge divides and
 * re-multiplies by zoom, so an echo (A writes B, B's change event converts
 * back) lands within float noise of A's value, not exactly on it. Exact
 * comparison would let that noise ping-pong between the hosts forever.
 */
export const CAMERA_EPSILON = 1e-6;

export function camerasAgree(a: TldrawCamera, b: TldrawCamera): boolean {
  return (
    Math.abs(a.x - b.x) < CAMERA_EPSILON &&
    Math.abs(a.y - b.y) < CAMERA_EPSILON &&
    Math.abs(a.z - b.z) < CAMERA_EPSILON
  );
}

export function viewportsAgree(a: ReactFlowViewport, b: ReactFlowViewport): boolean {
  return (
    Math.abs(a.x - b.x) < CAMERA_EPSILON &&
    Math.abs(a.y - b.y) < CAMERA_EPSILON &&
    Math.abs(a.zoom - b.zoom) < CAMERA_EPSILON
  );
}
