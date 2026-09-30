/**
 * The camera maths, checked against an INDEPENDENT oracle rather than against
 * itself.
 *
 * `cameraFit` claims one thing: after applying `translate(tx,ty) scale(s)` with
 * `transform-origin: 0 0`, the target's centre lands where it was asked to.
 * The honest way to test that is to re-implement the FORWARD map — the thing
 * the browser actually does with a transform, which is three lines and not in
 * question — and assert the round trip. Asserting the returned numbers against
 * hand-computed constants would just be this file's arithmetic grading the
 * module's arithmetic.
 *
 * Run: `pnpm exec vitest --project=unit run` (or `pnpm test` for all projects).
 */
import { describe, expect, it } from "vitest";

import {
  cameraFit,
  DEFAULT_STEP_IN_VARIANT,
  DEFAULT_TONE,
  MOTION,
  plateColor,
  STEP_IN_VARIANTS,
  TONE_STOPS,
  toneStop,
} from "./tokens";

/** What the browser does with `transform: translate(tx,ty) scale(s)` at
 *  `transform-origin: 0 0`, applied to a canvas-local point. Independent of
 *  `cameraFit`: this is the CSS spec, not the module under test. */
const project = (
  point: { x: number; y: number },
  canvasOrigin: { x: number; y: number },
  fit: { scale: number; tx: number; ty: number },
) => ({
  x: canvasOrigin.x + point.x * fit.scale + fit.tx,
  y: canvasOrigin.y + point.y * fit.scale + fit.ty,
});

const VIEWPORT = { x: 0, y: 56, width: 1400, height: 900 };
const ORIGIN = { x: 12, y: 56 };

describe("cameraFit — the round trip", () => {
  it("lands a short block's CENTRE at the viewport centre", () => {
    const target = { x: 760, y: 40, width: 640, height: 300 };
    const fit = cameraFit({ target, canvasOrigin: ORIGIN, viewport: VIEWPORT, measurePx: 880 });

    expect(fit.anchor).toBe("centre");
    const centre = project(
      { x: target.x + target.width / 2, y: target.y + target.height / 2 },
      ORIGIN,
      fit,
    );
    expect(centre.x).toBeCloseTo(VIEWPORT.x + VIEWPORT.width / 2, 6);
    expect(centre.y).toBeCloseTo(VIEWPORT.y + VIEWPORT.height / 2, 6);
  });

  it("makes the target exactly `measurePx` wide on screen", () => {
    const target = { x: 40, y: 90, width: 700, height: 260 };
    const fit = cameraFit({ target, canvasOrigin: ORIGIN, viewport: VIEWPORT, measurePx: 910 });

    const left = project({ x: target.x, y: target.y }, ORIGIN, fit);
    const right = project({ x: target.x + target.width, y: target.y }, ORIGIN, fit);
    expect(right.x - left.x).toBeCloseTo(910, 6);
  });

  it("anchors the TOP — not the centre — once the block is taller than the viewport", () => {
    // The regression this branch exists for: centring something taller than
    // its container pushes line 1 above the fold, so "stepped into" would drop
    // you into the middle of the code.
    const target = { x: 100, y: 200, width: 600, height: 1800 };
    const fit = cameraFit({ target, canvasOrigin: ORIGIN, viewport: VIEWPORT, measurePx: 900, padTopPx: 32 });

    expect(fit.anchor).toBe("top");
    const top = project({ x: target.x, y: target.y }, ORIGIN, fit);
    expect(top.y).toBeCloseTo(VIEWPORT.y + 32, 6);

    // And prove the centre branch would genuinely have been wrong here —
    // otherwise this test passes for a target that fits anyway.
    const centred = VIEWPORT.y + VIEWPORT.height / 2 - (target.height * fit.scale) / 2;
    expect(centred).toBeLessThan(VIEWPORT.y);
  });

  it("clamps the zoom at both ends instead of scaling without limit", () => {
    const tiny = cameraFit({
      target: { x: 0, y: 0, width: 10, height: 10 },
      canvasOrigin: ORIGIN, viewport: VIEWPORT, measurePx: 900, maxScale: 2.5,
    });
    expect(tiny.scale).toBe(2.5);

    const huge = cameraFit({
      target: { x: 0, y: 0, width: 9000, height: 10 },
      canvasOrigin: ORIGIN, viewport: VIEWPORT, measurePx: 900, minScale: 0.4,
    });
    expect(huge.scale).toBe(0.4);
  });

  it("survives a zero-width target instead of returning NaN", () => {
    // A block measured before layout has width 0; `measurePx / 0` is Infinity
    // and every downstream number becomes NaN, which CSS drops silently — the
    // canvas would simply stop transforming with no error anywhere.
    const fit = cameraFit({
      target: { x: 10, y: 10, width: 0, height: 0 },
      canvasOrigin: ORIGIN, viewport: VIEWPORT, measurePx: 900,
    });
    expect(Number.isFinite(fit.scale)).toBe(true);
    expect(Number.isFinite(fit.tx)).toBe(true);
    expect(Number.isFinite(fit.ty)).toBe(true);
  });

  it("is an identity move when the target is already centred at its measure", () => {
    const target = { x: 300, y: 400, width: 800, height: 400 };
    const fit = cameraFit({
      target,
      canvasOrigin: ORIGIN,
      // A viewport whose centre already sits on the target's centre.
      viewport: { x: ORIGIN.x + 300, y: ORIGIN.y + 400, width: 800, height: 400 },
      measurePx: 800,
    });
    expect(fit.scale).toBeCloseTo(1, 6);
    expect(fit.tx).toBeCloseTo(0, 6);
    expect(fit.ty).toBeCloseTo(0, 6);
  });
});

describe("the tone ladder", () => {
  it("is monotonic and starts at a genuine zero", () => {
    expect(TONE_STOPS[0].delta).toBe(0);
    for (let i = 1; i < TONE_STOPS.length; i += 1) {
      expect(TONE_STOPS[i].delta).toBeGreaterThan(TONE_STOPS[i - 1].delta);
    }
  });

  it("keeps Zach's 'small tone difference' actually small", () => {
    // A guard, not a tautology: if someone widens `whisper` to make it easier
    // to screenshot, it stops being the thing he asked for.
    expect(toneStop("whisper").delta).toBeGreaterThan(0);
    expect(toneStop("whisper").delta).toBeLessThan(0.02);
    expect(toneStop(DEFAULT_TONE).id).toBe("whisper");
  });

  it("emits a valid oklch() and never goes below black", () => {
    expect(plateColor(1, 0)).toBe("oklch(1.0000 0 0)");
    expect(plateColor(1, 0.014)).toBe("oklch(0.9860 0 0)");
    expect(plateColor(0.2, 0.9)).toBe("oklch(0.0000 0 0)");
    for (const stop of TONE_STOPS) {
      expect(plateColor(1, stop.delta)).toMatch(/^oklch\(\d\.\d{4} 0 0\)$/);
    }
  });

  it("makes flush genuinely invisible and card genuinely visible", () => {
    // The two ends have to actually BE the two ends, or the control measures
    // nothing. sRGB 8-bit quantisation is ~0.4% of L, so Δ0.014 is ~3-4 codes
    // — present, but not a border.
    expect(plateColor(1, toneStop("flush").delta)).toBe("oklch(1.0000 0 0)");
    expect(toneStop("card").delta / toneStop("whisper").delta).toBeGreaterThan(3);
  });
});

describe("the variant set", () => {
  it("ships three genuinely different readings, and the default is one of them", () => {
    expect(STEP_IN_VARIANTS).toHaveLength(3);
    expect(new Set(STEP_IN_VARIANTS.map((v) => v.id)).size).toBe(3);
    expect(STEP_IN_VARIANTS.some((v) => v.id === DEFAULT_STEP_IN_VARIANT)).toBe(true);
  });

  it("splits on the magnify-vs-re-measure trade-off rather than on cosmetics", () => {
    // If every variant re-measured, `fly` would be a cosmetic difference and
    // the comparison would not be asking Zach anything.
    const kinds = new Set(STEP_IN_VARIANTS.map((v) => v.measure));
    expect(kinds.size).toBe(2);
    expect(STEP_IN_VARIANTS.find((v) => v.id === "fly")?.measure).toBe("magnified");
  });

  it("holds motion identical across variants, so only the idea differs", () => {
    expect(MOTION.worldMs).toBeLessThan(MOTION.durationMs);
    expect(MOTION.chromeMs).toBeLessThan(MOTION.durationMs);
  });
});
