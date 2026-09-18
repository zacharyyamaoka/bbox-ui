// src/skin/sketchAtEdge.ts — the sketch skin as a BOUNDARY transform.
//
// WHY: this file is the seam governed by docs/peps/0001-sketch-skin-at-the-boundary.md.
// Read that record BEFORE moving sketch geometry back into a component or
// replacing this pass with an SVG filter — both were weighed and rejected
// with measurements, and the record names exactly what would reopen the
// question. The two named limits (one-frame trail on in-flight geometry,
// crisp first paint under SSR) are the accepted price of the design, not
// bugs to fix here.
//
// PROVENANCE. Ours, deliberately, with two cited borrowings:
//
//   • The path/rect/ellipse math is NOT re-derived here. Every generator
//     is imported from `./sketchPath`, which carries its own full
//     provenance header (tldraw 5.3.2 `lib/shapes/shared/PathBuilder.mjs`
//     `toDrawD`, `lib/shapes/geo/GeoShapeBody.mjs`, and `@tldraw/utils`'s
//     `rng` ported verbatim). This file adds no math.
//   • The "hand-drawn look belongs to the host renderer, not to the
//     model" arrangement is the one /home/bam/systemsketch already ships:
//     it has ZERO custom sketch geometry and instead sets tldraw's own
//     `dash: "draw"` as a shape prop — `src/inspector/inspectorModel.ts:742`,
//     read 2026-09-17 (read-only). tldraw's engine does the drawing at
//     render time; SystemSketch's core never computes a wobble. This file
//     is that same split for a repo whose host is the DOM rather than
//     tldraw: the core states WHAT is there, the edge decides how it is
//     drawn.
//
// The DOM-walk, the twin/idempotency protocol and the measured-geometry
// seeding below are ours, ad hoc. No prior art was read for them.

import {
  sketchEllipsePath,
  sketchPathData,
  sketchRectPath,
  sketchWobbleFor,
} from "./sketchPath";

/**
 * WHY this file exists at all — Zach, 2026-09-17:
 *
 *   "I don't want the code base to be affected by the skin. Sketch
 *    skinning should be something very much done just like at the edges
 *    of the code base as a final rerender persay. nothing inside the code
 *    base should ever be driven [by it]."
 *
 * That is `CLAUDE.md`'s own governing rule ("the core is props in, DOM
 * out") applied to a concern the previous design had let leak inward. Six
 * components under `src/components/` import `../skin/*` and compute sketch
 * geometry during their own render; `trace.tsx` goes furthest and emits a
 * permanent hidden twin of every path, forever, so CSS can pick.
 *
 * The move this file makes: the core keeps emitting CRISP geometry and its
 * ordinary semantic `data-slot` attributes, and nothing else. The sketch
 * look is then re-derived from OUTSIDE, by reading that DOM contract back
 * and appending a drawn twin. The core loses every skin import; the skin
 * gains the one thing the core was never allowed to have — the ability to
 * MEASURE.
 *
 * WHY measurement is the whole argument, and not just a nicety. The core
 * cannot self-measure (that rule is what keeps it server-renderable), so
 * `sketchOutline.tsx` works around it with `stretch` +
 * `preserveAspectRatio="none"`: the path is generated at a NOMINAL size and
 * stretched to whatever the element turned out to be. The components say so
 * themselves — `badge.tsx:102-107` draws every chip at a nominal 40x20,
 * `block.tsx:198-203` draws an auto-height Block at a nominal 200. The
 * documented cost is anisotropic wobble (a wide chip wanders less
 * horizontally than vertically) and a wobble amplitude computed from a size
 * the element does not have. A boundary pass runs AFTER layout, where
 * `getBoundingClientRect()` is not just permitted but ordinary, so it draws
 * every shape at its true pixels. Moving this out of the core does not
 * trade correctness for purity — it removes a compromise the core was
 * forced into.
 */

/* ------------------------------------------------------------------ */
/* The DOM contract this pass reads                                    */
/* ------------------------------------------------------------------ */

/**
 * Marks a node THIS pass created. Load-bearing three times over: it makes
 * the pass idempotent, it keeps a twin from being re-sketched into a twin
 * of a twin, and it is what the crisp-suppression CSS selects against.
 */
export const SKETCH_TWIN_ATTR = "data-bbox-sketch-twin";

/**
 * The exact source geometry a twin was built from — its cache key, stored
 * on the twin itself.
 *
 * WHY on the DOM rather than in a `WeakMap`: a pass must be able to decide
 * "is this twin still valid?" from nothing but the document. That keeps the
 * transform a pure function of the DOM, so it survives being re-run by any
 * trigger (mutation, resize, a manual call from a test) without carrying
 * state that could disagree with what is on screen.
 */
export const SKETCH_SRC_ATTR = "data-bbox-sketch-src";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Crisp trace paths awaiting a twin.
 *
 * `:not([data-sketch])` skips the core's OWN legacy twin, which still ships
 * today — this pass has to be correct while both mechanisms coexist, since
 * the migration that deletes the core's half is a separate lane.
 * `:not([data-bbox-sketch-twin])` skips our own output.
 */
const CRISP_PATH_SELECTOR =
  `path[data-slot="trace-line"]:not([data-sketch]):not([${SKETCH_TWIN_ATTR}])`;

/**
 * Bordered boxes. Measured, not nominal.
 *
 * WHY these three slots: every one of the six leaking components reduces to
 * one of THREE shape classes — an arbitrary path (`trace.tsx`), a rounded
 * rect (`block.tsx`, `badge.tsx`, `portEdge.tsx`'s group box) or an ellipse
 * (`port.tsx`, `traceTerminal.tsx`). `portEdge.tsx`'s
 * `[data-slot="port-edge-group-outline"]` joined at migration M5 — the same
 * rounded-rect mechanism `block.tsx`/`badge.tsx` already prove, on a box
 * this component builds itself (its own `position: absolute` container) so
 * there is no new class to demonstrate.
 */
const BOX_SELECTOR = `[data-slot="block"], [data-slot="badge"], [data-slot="port-edge-group-outline"]`;

/** Round things: a Port dot. */
const DOT_SELECTOR = `[data-slot="port-dot"]`;

/**
 * A TraceTerminal's own drawn ring (migration M5b) — a fourth measured
 * shape class, handled separately from `BOX_SELECTOR`/`DOT_SELECTOR`
 * rather than folded into either.
 *
 * WHY its own selector and its own loop below, rather than adding
 * `[data-slot="trace-terminal-ring"]` to `DOT_SELECTOR` as the migration
 * plan's table literally says: `upsertBoxTwin` appends its twin as a CHILD
 * of the matched element (`createBoxTwinSvg`'s `el.appendChild(svg)`),
 * which works for an HTML `<span>` (`port-dot`) but not for an SVG shape
 * element — measured: appending a nested `<svg>` into a live `<circle>`
 * leaves it `isConnected` with a `getBoundingClientRect()` of `{width:0,
 * height:0}`. Matching the selector to `[data-slot="trace-terminal"]`
 * (the `<g>`) instead — which CAN host a child — was tried too and is
 * ALSO wrong: `measureBox` reads `getBoundingClientRect()` off the SAME
 * element the twin is appended into, so once a twin exists the next pass
 * measures a box that already includes its own prior output and grows
 * without bound (measured: a `<g>` around an 18×18 ring inflated to
 * 57×57 on the very first pass).
 *
 * The ring is a CIRCLE, not a box: `sketchEllipsePath` needs only its own
 * `r` (read directly off the SVG attribute, not `getBoundingClientRect`,
 * so there is nothing for a sibling twin to contaminate), and the plan's
 * own prose for this step — "it appends into the same `<g>`, which
 * inherits the transform" — describes a SIBLING inserted next to the
 * ring, which is exactly `upsertTwin`'s existing mechanism (the one
 * `trace-line` already uses): adjacency-based, self-contained, no
 * measurement feedback loop possible.
 */
const RING_SELECTOR = `circle[data-slot="trace-terminal-ring"]`;

/**
 * Wobble for a cable, copied from `trace.tsx:118` (`TRACE_WOBBLE_PX`).
 *
 * WHY duplicated rather than imported: importing it would make this file
 * depend on `src/components/`, and the direction of that arrow is the
 * entire point — the edge may read the core's DOM, never its modules. At
 * migration this constant is DELETED from `trace.tsx` and this becomes its
 * only home, which is why the two must agree exactly until then. The
 * byte-identity test in `sketchAtEdge.test.ts` fails the moment they drift.
 */
export const TRACE_WOBBLE_PX = 1.4;

/* ------------------------------------------------------------------ */
/* The transform, as pure functions                                    */
/* ------------------------------------------------------------------ */

const PATH_CACHE = new Map<string, string>();
const PATH_CACHE_MAX = 512;

/**
 * The sketched form of one trace `d`.
 *
 * WHY this is byte-identical to what `trace.tsx` computes today, and why
 * that is provable rather than hopeful: the seed IS the path string
 * (`seed: d`). `sketchPathData` is deterministic in (d, seed, wobble,
 * passes, spacing) and reads nothing else — no DOM, no React, no clock. So
 * the same `d` yields the same output no matter WHERE the call happens.
 * Relocating this call from inside the component to outside it therefore
 * cannot change a single character of the result. `sketchAtEdge.test.ts`
 * asserts that as string equality against the recipe `trace.tsx` uses, and
 * the `SkinAtTheEdges` story asserts it against the core's own live twin
 * read straight out of the rendered DOM.
 *
 * Bounded cache, same reason the donor gives at `trace.tsx:126-128`: a live
 * drag produces a new `d` every frame.
 */
export function sketchTraceD(d: string): string {
  const hit = PATH_CACHE.get(d);
  if (hit !== undefined) return hit;
  const out = sketchPathData(d, { seed: d, wobble: TRACE_WOBBLE_PX });
  if (PATH_CACHE.size >= PATH_CACHE_MAX) {
    const oldest = PATH_CACHE.keys().next().value;
    if (oldest !== undefined) PATH_CACHE.delete(oldest);
  }
  PATH_CACHE.set(d, out);
  return out;
}

/** Test seam — the cache is a performance device, never a correctness one. */
export function __clearSketchCache(): void {
  PATH_CACHE.clear();
}

export interface MeasuredBox {
  width: number;
  height: number;
  radius: number;
  borderWidth: number;
}

/**
 * What the boundary can know about a box that the core could not: its real
 * rendered size, its real resolved corner radius, and its real border
 * width.
 *
 * WHY `getComputedStyle` for the radius instead of a prop: the radius a
 * Block renders is `var(--bbox-skin-radius, var(--radius-lg))` — a value
 * the SKIN supplies. Reading it back off the element is how the drawn
 * corner lands on the same curve the CSS border would have taken, without
 * either side having to know the other's number.
 */
export function measureBox(el: Element): MeasuredBox {
  const rect = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    width: rect.width,
    height: rect.height,
    radius: parsePx(cs.borderTopLeftRadius),
    borderWidth: parsePx(cs.borderTopWidth) || 2,
  };
}

/**
 * A ring that is painted OUTSIDE the element's own box, expanded to where
 * the drawn line has to land.
 *
 * WHY this exists: a `Port` dot's state rings are `box-shadow` layers, not
 * a border, so they sit entirely outside the element — `getBoundingClientRect`
 * returns the 14px dot, while the ring the eye reads is several px larger.
 * Drawing on the element box puts the hand-drawn ring INSIDE the coloured
 * one and it reads as a bullseye rather than as one drawn ring. (Measured:
 * that is exactly what the first capture of this PoC showed.)
 *
 * WHY this reads two data attributes rather than parsing `box-shadow`
 * (docs/peps/0001-sketch-skin-at-the-boundary.md M4): before migration this
 * function parsed the element's computed `box-shadow` spreads back into
 * `expand`/`pen` — "DOM archaeology", by its own prior header, kept only
 * because the PoC lane could not edit `port.tsx`. `port.tsx` now publishes
 * `data-bbox-ring-expand`/`data-bbox-ring-pen` directly: the SAME two
 * numbers (`SURFACE*2 + STATE*3` and `STATE`, unchanged arithmetic — see
 * that file's own WHY), read as plain data rather than reverse-engineered
 * from a rendered style. `expand` is the OUTER box the twin is built at,
 * because `upsertBoxTwin` insets by one pen per side, landing the drawn
 * ellipse on the same annulus centre-line the box-shadow rings use.
 *
 * `null` for anything else, including a bare `[data-slot="port-dot"]` that
 * predates M4 — no ring room is granted rather than guessed.
 */
export function ringExpansion(el: Element): { expand: number; pen: number } | null {
  const data = (el as HTMLElement).dataset;
  const expand = data?.bboxRingExpand;
  const pen = data?.bboxRingPen;
  if (expand === undefined || pen === undefined) return null;
  const expandNum = Number(expand);
  const penNum = Number(pen);
  if (!Number.isFinite(expandNum) || !Number.isFinite(penNum)) return null;
  return { expand: expandNum, pen: penNum };
}

function parsePx(v: string): number {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * A stable seed for a measured shape.
 *
 * WHY geometry-derived rather than prop-derived: at the edge there are no
 * props. The core's own default seeds are already geometry strings for the
 * common case (`block.tsx:203` falls back to `` `${width}x${height}` ``),
 * so this reproduces them; where a component hard-codes a semantic seed
 * (`badge:${size}:${shape}`, `port:${state}:${diameter}`) the wobble
 * PATTERN differs while its character and amplitude do not. Migration item
 * M7 closes that gap properly by having the component emit its seed as a
 * `data-bbox-seed` attribute — one added attribute, no skin import — at
 * which point this falls back only when the attribute is absent.
 */
export function seedForBox(el: Element, box: MeasuredBox): string {
  const declared = (el as HTMLElement).dataset?.bboxSeed;
  if (declared) return declared;
  return `${Math.round(box.width)}x${Math.round(box.height)}`;
}

export interface SketchPassStats {
  /** Twins created this pass. */
  created: number;
  /** Twins found already valid and left alone — the idempotency signal. */
  reused: number;
  /** Twins whose source geometry moved, so they were redrawn. */
  refreshed: number;
}

const EMPTY_STATS = (): SketchPassStats => ({ created: 0, reused: 0, refreshed: 0 });

/**
 * THE BOUNDARY PASS. Read the core's crisp DOM, append drawn twins.
 *
 * Runs after layout, mutates only nodes it created itself, and returns
 * what it did so a caller (or a test) can assert on it rather than trust
 * it.
 *
 * WHY it appends into the crisp element's OWN parent instead of an overlay
 * layer: an SVG child inherits its parent's `viewBox` and every enclosing
 * `transform`, so a twin placed beside its source is automatically in the
 * exact same coordinate space — no transform to replicate, nothing to keep
 * in sync when the host pans or zooms. An overlay would have to mirror the
 * host's entire camera, which is precisely the host-owned interaction
 * geometry `CLAUDE.md` says must never travel.
 *
 * WHY React tolerates this: React only reconciles nodes it created. A node
 * appended by foreign code is not in any fiber, so React never diffs it
 * away. The one real hazard is a parent whose children React REPLACES
 * wholesale — and that is exactly what the mutation trigger is for: the
 * twin vanishes with its parent and the next pass rebuilds it.
 */
export function applySketchAtEdge(root: ParentNode): SketchPassStats {
  const stats = EMPTY_STATS();

  for (const src of root.querySelectorAll(CRISP_PATH_SELECTOR)) {
    const d = src.getAttribute("d");
    if (!d) continue;
    upsertTwin(src, d, () => sketchTraceD(d), stats, (twin) => {
      // A cable's dash cadence belongs to `variant`/`animated`, which is a
      // different axis from the skin — so the twin wears whatever the crisp
      // path was already wearing rather than inventing its own.
      copyPresentation(src, twin);
    });
  }

  for (const el of root.querySelectorAll(BOX_SELECTOR)) {
    const box = measureBox(el);
    if (box.width <= 0 || box.height <= 0) continue;
    upsertBoxTwin(el, box, "rect", stats);
  }

  for (const el of root.querySelectorAll(DOT_SELECTOR)) {
    const box = measureBox(el);
    if (box.width <= 0 || box.height <= 0) continue;
    // Expand to the ring's own centre-line when the ring is painted outside
    // the element as box-shadow. See `ringExpansion`.
    const ring = ringExpansion(el);
    const expanded: MeasuredBox = ring
      ? {
          width: box.width + ring.expand,
          height: box.height + ring.expand,
          radius: box.radius,
          borderWidth: ring.pen,
        }
      : box;
    upsertBoxTwin(el, expanded, "ellipse", stats);
  }

  // A TraceTerminal's ring — see `RING_SELECTOR`'s own WHY for why this is
  // not folded into the `DOT_SELECTOR` loop above. Read straight off the
  // circle's own SVG attributes (`r`, `cx`, `cy`, `stroke-width`) rather
  // than `getBoundingClientRect()`: this glyph is positioned entirely by
  // its parent `<g>`'s `transform`, so the LOCAL radius is already exactly
  // what `sketchEllipsePath` needs, with no viewport pixels, no
  // containing-block percentage math, and nothing for a sibling twin to
  // feed back into.
  for (const el of root.querySelectorAll<SVGCircleElement>(RING_SELECTOR)) {
    const r = el.r.baseVal.value;
    if (r <= 0) continue;
    const cx = el.cx.baseVal.value;
    const cy = el.cy.baseVal.value;
    const penAttr = el.getAttribute("stroke-width");
    const pen = penAttr ? Number(penAttr) : 2;
    // Same fallback order as `seedForBox`: a published seed first, else a
    // geometry string — here the ring's own diameter, since a
    // TraceTerminal has no width/height pair to fall back to.
    const seed = el.dataset.bboxSeed || `${round(r * 2)}x${round(r * 2)}`;
    const amp = sketchWobbleFor(r * 2, r * 2);
    const srcKey = `ring:${seed}:r${round(r)}:p${round(pen)}`;
    upsertTwin(
      el,
      srcKey,
      () => sketchEllipsePath({ width: r * 2, height: r * 2, seed, wobble: amp }),
      stats,
      (twin) => {
        // `sketchEllipsePath` centres its output at (r, r) — the same
        // top-left-anchored convention `upsertBoxTwin` uses — so this
        // shifts it back to the circle's own (cx, cy), exactly the
        // `translate(-radius, -radius)` the deleted in-core twin used.
        twin.setAttribute("transform", `translate(${round(cx - r)} ${round(cy - r)})`);
        twin.setAttribute("stroke", "var(--bbox-ink-state, var(--bbox-skin-ink, var(--color-foreground)))");
        twin.setAttribute("stroke-width", String(pen));
      },
    );
  }

  return stats;
}

/** Attributes that describe PAINT, not geometry — the twin inherits these. */
const PRESENTATION_ATTRS = [
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "stroke-dashoffset",
  "vector-effect",
  "class",
  "marker-end",
  "fill",
];

function copyPresentation(src: Element, twin: Element): void {
  for (const name of PRESENTATION_ATTRS) {
    const v = src.getAttribute(name);
    if (v !== null) twin.setAttribute(name, v);
  }
}

function upsertTwin(
  src: Element,
  srcKey: string,
  compute: () => string,
  stats: SketchPassStats,
  decorate: (twin: Element) => void,
): Element {
  const parent = src.parentNode;
  const existing = findTwinFor(src);
  if (existing) {
    if (existing.getAttribute(SKETCH_SRC_ATTR) === srcKey) {
      stats.reused++;
      return existing;
    }
    existing.setAttribute("d", compute());
    existing.setAttribute(SKETCH_SRC_ATTR, srcKey);
    decorate(existing);
    stats.refreshed++;
    return existing;
  }
  const twin = document.createElementNS(SVG_NS, "path");
  twin.setAttribute(SKETCH_TWIN_ATTR, "path");
  twin.setAttribute(SKETCH_SRC_ATTR, srcKey);
  twin.setAttribute("d", compute());
  twin.setAttribute("aria-hidden", "true");
  decorate(twin);
  parent?.insertBefore(twin, src.nextSibling);
  stats.created++;
  return twin;
}

/**
 * A twin is identified by adjacency, not by id.
 *
 * WHY: the core emits no id we could key on, and inventing one would mean
 * editing the core — the thing this design exists to avoid. "The next
 * sibling, if it is one of ours" needs nothing from the core at all.
 */
function findTwinFor(src: Element): Element | null {
  const next = src.nextElementSibling;
  return next && next.hasAttribute(SKETCH_TWIN_ATTR) ? next : null;
}

function upsertBoxTwin(
  el: Element,
  box: MeasuredBox,
  shape: "rect" | "ellipse",
  stats: SketchPassStats,
): void {
  const seed = seedForBox(el, box);
  const pad = box.borderWidth;
  const innerW = Math.max(0, box.width - pad * 2);
  const innerH = Math.max(0, box.height - pad * 2);
  const amp = sketchWobbleFor(innerW, innerH);
  // The cache key has to carry everything the path depends on, or a resized
  // element keeps a stale outline.
  const srcKey = `${shape}:${seed}:${round(box.width)}x${round(box.height)}:r${round(box.radius)}:b${round(pad)}`;

  const existing = boxTwinIn(el);
  if (existing && existing.getAttribute(SKETCH_SRC_ATTR) === srcKey) {
    stats.reused++;
    return;
  }

  const d =
    shape === "ellipse"
      ? sketchEllipsePath({ width: innerW, height: innerH, seed, wobble: amp })
      : sketchRectPath({
          width: innerW,
          height: innerH,
          radius: Math.min(box.radius, Math.min(innerW, innerH) / 2),
          strokeWidth: pad,
          seed,
          wobble: amp,
          edgePoints: Math.min(innerW, innerH) < 60 ? 1 : undefined,
        });

  const svg = existing ?? createBoxTwinSvg(el, shape);
  svg.setAttribute(SKETCH_SRC_ATTR, srcKey);
  svg.setAttribute("viewBox", `0 0 ${round(box.width)} ${round(box.height)}`);
  svg.setAttribute("width", String(round(box.width)));
  svg.setAttribute("height", String(round(box.height)));
  // WHY the size is ALSO written as inline style, not just as attributes:
  // a boundary-injected node is subject to whatever descendant CSS the host
  // subtree already has, and an SVG's width/height ATTRIBUTES lose to any
  // rule that sets the property. Measured 2026-09-17: a `Badge` carries
  // shadcn's `[&>svg]:size-3` (there so an icon inside a chip is 12px), and
  // it collapsed this outline from its declared 121.2x22 to 12x12 — the
  // drawn capsule vanished and left one stray mark in the corner.
  //
  // `SketchOutline` never hit this only because its `stretch` mode happens
  // to set `width`/`height` in `style`. This is the genuine hazard class of
  // the boundary approach and it is worth knowing: the edge writes into
  // someone else's cascade, so anything it needs must be set at a
  // specificity the host cannot accidentally beat.
  svg.style.width = `${round(box.width)}px`;
  svg.style.height = `${round(box.height)}px`;
  const path = svg.firstElementChild!;
  path.setAttribute("d", d);
  path.setAttribute("transform", `translate(${round(pad)} ${round(pad)})`);
  path.setAttribute("stroke-width", String(round(pad)));
  if (existing) stats.refreshed++;
  else stats.created++;
}

function boxTwinIn(el: Element): SVGElement | null {
  for (const child of el.children) {
    if (child.getAttribute(SKETCH_TWIN_ATTR) === "box") return child as SVGElement;
  }
  return null;
}

function createBoxTwinSvg(el: Element, shape: "rect" | "ellipse"): SVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute(SKETCH_TWIN_ATTR, "box");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("data-bbox-sketch-shape", shape);
  // Positioned against the element's own box. An ellipse is drawn around a
  // CENTRE rather than along a border, so it centres — the same distinction
  // `sketchOutline.tsx` makes for a Port dot, whose state rings sit outside
  // the element entirely as box-shadow spread.
  Object.assign(svg.style, {
    position: "absolute",
    pointerEvents: "none",
    overflow: "visible",
    ...(shape === "ellipse"
      ? { left: "50%", top: "50%", transform: "translate(-50%, -50%)" }
      : { left: "0", top: "0" }),
  } as CSSStyleDeclaration);
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("fill", "none");
  // WHY a custom property and NOT `getComputedStyle(el).borderColor`:
  // measured 2026-09-17 on `styles--sketch`, a Block's computed
  // `border-color` under the sketch skin is `rgba(0, 0, 0, 0)` — the skin's
  // own mechanism is to make the crisp border TRANSPARENT while keeping its
  // 2px width, so nothing moves (`skin.test.ts` pins that width across every
  // skin). So the element's resolved colour is exactly the one thing the
  // skin has already destroyed by the time the edge looks at it.
  //
  // Where a state owns the colour (a Port's rings, a PortEdge group's
  // accent, a TraceTerminal ring, a semantic Badge), the component must
  // therefore PUBLISH it in a channel the skin does not touch. That is one
  // added custom property per component — not a skin import, just the
  // component naming its own colour in the DOM, which is strictly more
  // honest than today's arrangement of passing it as a React prop into a
  // skin component. See migration item M6.
  path.setAttribute(
    "stroke",
    "var(--bbox-ink-state, var(--bbox-skin-ink, var(--color-foreground)))",
  );
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);
  el.appendChild(svg);
  return svg;
}

const round = (v: number) => Math.round(v * 100) / 100;

/**
 * The crisp-suppression rules, as a string so a host can inline them.
 *
 * WHY CSS rather than an imperative `style.display = "none"` on each crisp
 * node: those nodes are React-owned, and writing to a property React also
 * manages is a fight this pass would eventually lose. A stylesheet keyed on
 * the core's existing `data-slot` contract needs no cooperation from React
 * at all — and post-migration these three rules simply live in `skin.css`,
 * which is where the rest of the skin already is.
 */
export const SKETCH_AT_EDGE_CSS = `
/* Crisp suppression. Gated on a SEPARATE attribute from "the pass is
   active", so a comparison view can run the pass and still show both
   layers at once -- which is what proves they agree. */
[data-bbox-sketch-suppress] [data-slot="trace-line"]:not([${SKETCH_TWIN_ATTR}]) { display: none; }
[data-bbox-sketch-suppress] [data-slot="sketch-outline"] { display: none !important; }

/* A drawn twin is absolutely positioned against the element it outlines.
   Block and Port already carry \`relative\` for the core's own outline, so
   this is a safety net for anything that does not. */
[data-bbox-sketch-active] [data-slot="block"],
[data-bbox-sketch-active] [data-slot="badge"],
[data-bbox-sketch-active] [data-slot="port-dot"] { position: relative; }
`;
