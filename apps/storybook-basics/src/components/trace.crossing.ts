// src/components/trace.crossing.ts — ported from **pyblocks**, read-only
// donor at /home/bam/pyblocks:
//
//   • `src/pipeline/connection/crossingMark.ts:1-111` — the whole file.
//     Its long WHY-THIS-IS-A-SEAM docstring, `CrossingMarkStyle`,
//     `CROSSING_MARK_STYLES`, `DEFAULT_CROSSING_MARK`,
//     `CROSSING_CASING_WIDTH`, `CROSSING_CASING_PORT_GAP`,
//     `CROSSING_CASING_MIN_LENGTH`, `isCrossingMarkStyle`.
//   • `src/pipeline/connection/ConnectionShapeUtil.tsx:895-950` — the
//      `0 lead middle lead` dash construction and the paint-order comment.
//      Restated here as the pure `casingDashArray`; the `useLayoutEffect`
//      that measured `getTotalLength()` is DROPPED (see change 3).
//   • `src/pipeline/index.css:557-562` — `.ConnectionShape-casing`'s
//      stroke/fill/linecap, which become this module's exported constants.
//
// THE DONOR IS NOT SYSTEMSKETCH, and that is a correction worth recording.
// The task that commissioned this port said to copy the halo from
// SystemSketch. It is not there: every "halo" in `systemsketch/src/blocks/`
// is a PORT HIT-TARGET halo (`ports/portAffordances.ts:39-42`,
// `connections/installConnections.ts:47,61,85`) or a label's routing
// obstacle (`connections/routingObstacles.ts:50`) — never a casing behind a
// cable. Checked twice, independently; `grep -ril "casing\|crossingmark"
// systemsketch/src/` returns four files, none of them a connection
// renderer, and SystemSketch's own `DataCablePath` emits a single stroked
// `<path>` with nothing under it. SystemSketch resolves cable overlap with
// tldraw z-order (`keepConnectionsAtBottom.ts`) instead.
//
// WHAT CHANGED in the port, exhaustively:
//
//   1. tldraw's `--tl-color-background` -> `var(--bbox-canvas,
//      var(--background))`. The casing IS the canvas colour — that is the
//      entire trick — so it has to name this app's canvas, and the
//      fallback chain lets a host that paints a non-default surface
//      (a story panel, a React Flow pane) override one variable rather
//      than thread a colour prop.
//   2. The style values moved out of CSS and into exported constants, for
//      the same reason `TUNNEL_VIA_RADIUS` did: a stylesheet fact cannot
//      be asserted by a unit test, and `CROSSING_CASING_WIDTH`'s value is
//      the load-bearing result of Zach's own measured sweep (see below).
//   3. `getTotalLength()` in a layout effect -> `casingDashArray(length)`,
//      a pure function of a length the caller already has. `TraceBody`
//      receives `length`/`points` as props and `Trace` already measures a
//      curve's real arc length for its own dash phase, so the donor's
//      extra DOM read has no job here. A caller with no length gets no
//      casing, which is the donor's own short-cable answer.
//   4. `hop` / `gap` remain UNIMPLEMENTED, deliberately, and the seam is
//      unchanged: `CrossingMarkStyle` is a string union, not a boolean,
//      exactly so adding them later is a literal plus a renderer branch.
//      (Zach, 2026-09-17: "Edge hops out of scope for now.")
//
// Zero React, zero DOM, zero canvas engine.

/**
 * PORTED VERBATIM (`crossingMark.ts:1-49`), because the research it
 * summarises is the reason this file looks the way it does:
 *
 * How a cable shows that it passes *over* another cable where they cross.
 *
 * WHY THIS IS A SEAM AND NOT A HARD-CODED STYLE. The research behind this
 * (`file:///home/bam/pyblocks/docs/edge-overlap-2026-08-26.html`) ruled out
 * the obvious answer. Crossover hops are the *superseded* convention in
 * electrical CAD — a 26-tool survey of real schematics found zero that draw
 * them, Altium ships its arcs disabled, KiCad defaults to `None` — and no
 * study anywhere has ever measured hop versus no-hop. Worse, deciding
 * *which* line hops is NP-hard (the "casing" switch-minimisation problem),
 * every shipping tool substitutes an arbitrary local rule, and every
 * implementation requires straight or orthogonal geometry, so a hop cannot
 * be drawn on this app's default `curved` routing at all.
 *
 * So the decision was: ship the cheapest treatment that works everywhere,
 * and leave a slot for the others rather than closing the door on them.
 *
 * THE DEFAULT: `halo`. Each cable is stroked twice — once wide in the canvas
 * background colour, then normally in its own colour — and, crucially, the
 * pair is emitted *per cable*. Because connections paint in document order,
 * the cable drawn later lays its background casing across the one drawn
 * earlier, so the upper line reads as passing over the lower one.
 *
 * No intersection is computed, detected or stored. There is no all-pairs
 * pass on every edit, nothing to recompute when a node moves, and no "who
 * bridges" decision to get wrong — paint order answers it once,
 * consistently, for every crossing on the canvas at the same time. It also
 * works identically on curved, straight and elbow routing, which no hop or
 * gap implementation does.
 *
 * Measured on a zoom ladder (320/220/150/100 px): the halo stays readable
 * about one step further out than a hop does, and — more importantly — it
 * fails in the right direction. The break closes up into an ordinary
 * crossing, which asserts nothing, where a shrinking arc trends toward a
 * blob that reads as a junction.
 *
 * ADDING ANOTHER TREATMENT. A `hop` or `gap` mark needs geometry work the
 * halo does not: both must find the actual intersection points, and both
 * are only definable on orthogonal or straight routing. Add the literal to
 * {@link CrossingMark}, handle it in the renderer, and gate it on
 * `routing !== "curved"`. The seam is deliberately the *style name*, not a
 * boolean, so that stays a one-line change.
 */

/**
 * `none` — cables simply cross. `halo` — a background-coloured casing makes
 * the upper cable visibly pass over the lower one.
 *
 * PORTED (`crossingMark.ts:55`). RENAMED from `CrossingMarkStyle`: this
 * repo already spells its other enumerations without the `Style` suffix
 * (`TraceVariant`, `TraceRouting`, `TunnelDisplayState`), and `style` here
 * collides with React's `style` prop on the very component that takes it.
 */
export type CrossingMark = "none" | "halo";

/** PORTED (`crossingMark.ts:57`). Halo first — it is the recommended one. */
export const CROSSING_MARKS: readonly CrossingMark[] = ["halo", "none"];

/**
 * Halo, per the research. Zero cost, works on every routing kind, and the
 * only one of the four candidate treatments available while `curved` is the
 * default. PORTED (`crossingMark.ts:63`).
 *
 * DEVIATION IN USE, not in value: `TraceBody`'s `crossing` prop defaults to
 * `"none"`, not to this. A casing asserts knowledge of the canvas colour,
 * which a props-in/DOM-out component does not have and can only guess at
 * through a CSS variable — and switching it on by default would add a
 * `<path>` to every Trace already rendered in this app. So the recommended
 * default is exported here, unchanged, for hosts to reach for (the stories
 * do), while the component itself stays additive. If bbox-ui ever gains a
 * canvas component that owns the surface colour, that is the thing that
 * should flip the default, not the primitive.
 */
export const DEFAULT_CROSSING_MARK: CrossingMark = "halo";

/**
 * Casing stroke width in page units, **calibrated in the real app, not
 * guessed**. PORTED VERBATIM including this measurement table
 * (`crossingMark.ts:66-86`) — the number is worth nothing without it.
 *
 * The first value was 7px, chosen by eye from an SVG gallery. Driving the
 * actual pipeline canvas showed that was wrong: a 7px casing on a 2px cable
 * clears only ~2.5px per side, and at a shallow crossing angle the break is
 * almost invisible. A sweep at the same crossing (cable pixels cleared in a
 * 36x36 box around the crossing):
 *
 *   7px  ->  11 px cleared   barely visible, the cables still look tangent
 *   10px ->  20 px cleared   reads clearly
 *   13px ->  28 px cleared   confident break
 *   16px ->  36 px cleared   starting to look gappy
 *
 * 11px sits in the readable band without opening a hole. It is also safely
 * compatible with the nudge channel spacing (14px): a casing half-width of
 * 5.5px never reaches a neighbouring cable's 1px stroke half-width, so
 * parallel channels do not erase each other — and where two casings do
 * overlap, both are the same background colour, so the overlap is invisible.
 */
export const CROSSING_CASING_WIDTH = 11;

/**
 * How much of the casing to suppress at each END of a cable, in page units.
 * PORTED VERBATIM (`crossingMark.ts:88-107`).
 *
 * The casing is what makes a crossing readable, but near a port it is doing
 * the opposite: cables fan out from a block within a few tens of pixels of
 * each other, so every cable's casing punches holes through its neighbours
 * right where they leave the block. Zach flagged exactly this (2026-08-27),
 * circling the port cluster as bad and a mid-canvas crossing as good:
 * "please make it so it only applies to crosses further away."
 *
 * So the casing is drawn only over the middle of each cable. The lead-in and
 * lead-out are left bare, which is the region where cables are close
 * together for structural reasons rather than because they genuinely cross.
 *
 * 34 px is a little under the block row pitch, so the whole fan-out zone in
 * front of a block's ports is covered. It is clamped so a very short cable
 * simply gets no casing at all rather than a negative-length dash.
 *
 * NOTE, and it is not a coincidence: this is the same 34 as
 * `TUNNEL_STUB_LENGTH`, and `CROSSING_CASING_MIN_LENGTH` is the same
 * `34*2 + 16` as `TUNNEL_MIN_PATH_LENGTH`. The two features are exact
 * complements over one arc-length decomposition — the casing paints ONLY
 * the middle (`0 lead middle lead`), the tunnel paints ONLY the two ends
 * (`stub hidden stub 0`). The constants are kept separate anyway, because
 * they answer different questions (how far does a port fan-out reach vs.
 * how long a stub still reads as a cable) and a future calibration of one
 * must not silently move the other.
 */
export const CROSSING_CASING_PORT_GAP = 34;

/** Below this length a cable is all lead-in and lead-out, so it gets no
 *  casing. PORTED (`crossingMark.ts:110`). */
export const CROSSING_CASING_MIN_LENGTH = CROSSING_CASING_PORT_GAP * 2 + 16;

/** PORTED (`crossingMark.ts:112-114`). */
export function isCrossingMark(value: unknown): value is CrossingMark {
  return value === "none" || value === "halo";
}

/**
 * The casing colour. PORTED BY VALUE from `.ConnectionShape-casing`'s
 * `stroke: var(--tl-color-background)` (`index.css:558`), retargeted at
 * this app's canvas — see this file's header, change 1.
 */
export const CROSSING_CASING_COLOR = "var(--bbox-canvas, var(--background))";

/**
 * `0 lead middle lead` — draws nothing for the first `lead`, the middle,
 * then nothing again.
 *
 * PORTED from the layout effect at `ConnectionShapeUtil.tsx:905-917`,
 * restated as a pure function of a length the caller already has (header,
 * change 3). `null` means "no casing at all", which is the donor's answer
 * for a cable too short to have a middle: "no casing at all beats a stub of
 * one" (its own comment, `ConnectionShapeUtil.tsx:911`).
 */
export function casingDashArray(pathLength: number): string | null {
  if (!Number.isFinite(pathLength) || pathLength <= CROSSING_CASING_MIN_LENGTH) return null;
  const lead = CROSSING_CASING_PORT_GAP;
  return `0 ${lead} ${pathLength - lead * 2} ${lead}`;
}
