"use client";

// src/components/port.tsx — ported by value from packages/bbox-ui/src/port.tsx
// (docs/PORT-EDGE-PLAN.md Phase 1). `Port` is the geometry alone: the disc,
// the 2px surface ring, the 3px state ring, the lit core, the 40px hit halo.
// It knows nothing about labels or slots — `./labeledPort.tsx` is the
// composite that adds those.
//
// What ported OVER verbatim (pure geometry/paint, no schema): `portDotClass`,
// the ring/halo/core layering.
//
// What's LEFT BEHIND (docs/PORT-EDGE-PLAN.md's own list — none of it is
// geometry): `resolveField`/`PORT_PRESETS`/the `size` cascade rung (D4 —
// `diameter` is a direct prop here), `tone`/`lens`/`reveal`/`producers` (D3 —
// the sketch's six states don't need them, each is re-addable later), and
// `anchored` (wall geometry for a real Block).

import type { ComponentProps, CSSProperties } from "react";

import { cn } from "../lib/utils";
import {
  DEFAULT_HIGHLIGHTER_KIND,
  DiagnosticTooltip,
  diagnosticColorVar,
  maxDiagnosticSeverity,
  type Diagnostic,
  type HighlighterKind,
} from "./highlighter";
import { HIT_REGION_FILL, HIT_REGION_OUTLINE } from "./hitRegion";
import { PORT_DIAMETERS, PORT_HIT_PX, PORT_STATE_RING_PX, PORT_SURFACE_RING_PX, type PortSize } from "./port.layout";
import { SketchOutline } from "../skin/sketchOutline";

/* ------------------------------------------------------------------ */
/* Colour — state -> token, inlined from packages/bbox-ui's appearance.ts */
/* (STATE_TOKENS/paintVar), tone channel removed (D3) so there is no      */
/* color-mix blend step: a token resolves straight to `var(--token)`.     */
/* ------------------------------------------------------------------ */

/**
 * The board's four-value axis — "what is in the port": empty, a default
 * value set, wired to something, or data has flowed through it just now.
 * `dimmed`/`hidden` are NOT rungs of this union (see `PortProps`'s own
 * docs) — neither is a fact about what the port IS.
 */
export type PortState = "empty" | "valueSet" | "wired" | "received";

export const PORT_STATES: PortState[] = ["empty", "valueSet", "wired", "received"];

export const PORT_STATE_LABELS: Record<PortState, string> = {
  empty: "Empty",
  valueSet: "Default Value",
  wired: "Wired",
  received: "Data Received",
};

interface StateTokenPair {
  ring: string | null;
  fill: string | null;
  core: string | null;
}

const STATE_TOKENS: Record<PortState, StateTokenPair> = {
  empty: { ring: "foreground", fill: null, core: null },
  valueSet: { ring: "muted-foreground", fill: "muted", core: null },
  wired: { ring: "primary", fill: null, core: "primary" },
  received: { ring: "bbox-received", fill: "bbox-received", core: "bbox-received" },
};

/**
 * `primary` resolves through the bbox accent (with a fallback to whatever
 * host `--primary` already means) so "wired" reads as the design system's
 * own orange rather than the host's button colour — same special case
 * `paintVar` makes in the donor package. `--bbox-primary`/`--bbox-received`
 * are the two tokens this phase appends to `src/globals.css`.
 */
export function paintVar(token: string): string {
  return token === "primary" ? "var(--bbox-primary, var(--primary))" : `var(--${token})`;
}

/* ------------------------------------------------------------------ */
/* The dot's paint                                                     */
/* ------------------------------------------------------------------ */

export interface PortDotPaintInput {
  state?: PortState;
  dimmed?: boolean;
  hinting?: boolean;
  /**
   * Drag-time validity preview (docs/INVALID-STATES-PLAN.md D5, ruling 5)
   * — "on by default": whether THIS port is a legal target for the
   * connection currently being dragged. `undefined` means no gesture is
   * in flight (zero paint change — every pre-existing snapshot stays
   * byte-identical). Computed ONCE per gesture by the host
   * (`connectionAvailability`, scene kit) and handed down as paint; this
   * component never asks WHY a port is unavailable, only THAT it is —
   * ruling 2's layering rule, one prop over. Wins over `hinting`/`dimmed`
   * (see `portRingColor`'s own precedence doc) because it is the more
   * specific, more ephemeral, in-gesture fact.
   */
  availability?: "available" | "unavailable";
  /** The diagnostic axis (docs/INVALID-STATES-PLAN.md §5's Port row) — a
   *  judgement ABOUT the port, made by an external producer, never a fifth
   *  `state`. Only the worst severity present paints (`maxDiagnosticSeverity`,
   *  ./highlighter.tsx); the rest ride the flag's popover, not this mark. */
  diagnostics?: Diagnostic[];
  /** Which `HighlighterKind` draws the mark. Defaults to
   *  `DEFAULT_HIGHLIGHTER_KIND` ("stroke") — Zach's own lean from the
   *  report feedback; `"halo"` is the pre-existing treatment, kept as a
   *  sibling, not deleted. */
  highlighterKind?: HighlighterKind;
}

/**
 * Static half of the dot's class — sizing/shape/transition only. Every
 * colour fact is dynamic per state and lives in `portDotStyle` instead.
 *
 * `hover:scale-110` is a real CSS `:hover` pseudo-class, deliberately NOT a
 * `hover` prop — nothing outside this component ever needs to SET hover.
 */
export function portDotClass(): string {
  return "relative box-border inline-flex shrink-0 rounded-full transition-transform duration-[50ms] ease-in-out hover:scale-110 motion-reduce:transition-none motion-reduce:hover:scale-100";
}

/**
 * The single place `availability` is folded into the pre-existing
 * `hinting`/`dimmed` paint facts (docs/INVALID-STATES-PLAN.md D5, ruling
 * 5's precedence: `availability > hinting > dimmed > state`). `undefined`
 * (no gesture in flight) passes `hinting`/`dimmed` through untouched — the
 * zero-paint-change contract every existing snapshot depends on.
 * `"available"` reuses `hinting`'s own shape outright; `"unavailable"`
 * reuses `dimmed`'s — each OVERRIDING the caller's own `hinting`/`dimmed`
 * rather than composing with them, because a port cannot simultaneously be
 * "the drag target" and "faded for being off-focus".
 */
function resolveAvailabilityPaint(
  availability: PortDotPaintInput["availability"],
  hinting: boolean,
  dimmed: boolean,
): { hinting: boolean; dimmed: boolean } {
  if (availability === "available") return { hinting: true, dimmed: false };
  if (availability === "unavailable") return { hinting: false, dimmed: true };
  return { hinting, dimmed };
}

/**
 * The dot's ring colour, as one exported derivation.
 *
 * WHY extracted rather than left inline (ported from packages/bbox-ui/src/
 * port.tsx's own `portRingColor`): the sketch skin draws the ring as a
 * path instead of as box-shadow layers, and it has to be the SAME colour.
 * A second copy of this precedence is exactly how a `hinting` port would
 * end up orange in one skin and grey in another. `null` means "this state
 * paints no ring at all". Precedence: see `resolveAvailabilityPaint`'s doc.
 */
export function portRingColor({
  state = "empty",
  dimmed = false,
  hinting = false,
  availability,
}: PortDotPaintInput): string | null {
  const { ring } = STATE_TOKENS[state];
  const effective = resolveAvailabilityPaint(availability, hinting, dimmed);
  return effective.hinting
    ? paintVar("primary")
    : effective.dimmed
      ? paintVar("muted-foreground")
      : ring
        ? paintVar(ring)
        : null;
}

/**
 * The dot's ring/fill. `dimmed` forces the ring to `muted-foreground` and
 * fades the whole dot to ~45% opacity, leaving the resting fill/core colour
 * underneath untouched (a dimmed `wired` port still reads "wired, just not
 * focused right now"). `hinting` wears `wired`'s own shape (hollow ring, lit
 * core) in the accent colour regardless of `state` — previewing the port
 * BECOMING wired, with a wide halo. `availability` picks between these two
 * shapes outright — see `resolveAvailabilityPaint`'s doc.
 */
export function portDotStyle({
  state = "empty",
  dimmed = false,
  hinting = false,
  availability,
  diagnostics,
  highlighterKind = DEFAULT_HIGHLIGHTER_KIND,
}: PortDotPaintInput): CSSProperties {
  const { fill } = STATE_TOKENS[state];
  const effective = resolveAvailabilityPaint(availability, hinting, dimmed);
  const ringColor = portRingColor({ state, dimmed, hinting, availability });
  // `hinting` (or `availability: "available"`) renders hollow (no fill),
  // matching `wired`'s own shape.
  const fillColor = effective.hinting ? null : fill ? paintVar(fill) : null;
  const stateRingPx = effective.hinting ? 4 : PORT_STATE_RING_PX;

  const layers: string[] = [];
  if (ringColor != null) {
    layers.push(`0 0 0 ${PORT_SURFACE_RING_PX}px var(--card)`);
    layers.push(`0 0 0 ${PORT_SURFACE_RING_PX + stateRingPx}px ${ringColor}`);
  }
  if (effective.hinting) {
    layers.push("0 0 0 9px color-mix(in srgb, var(--bbox-primary, var(--primary)) 38%, transparent)");
  }
  // WHY APPENDED, not prepended (docs/INVALID-STATES-PLAN.md §3: "state
  // ring/fill untouched"): CSS box-shadow layers paint front-to-back in
  // list order — the FIRST layer wins any overlap. The state ring's own
  // two layers above are already opaque out to their own radius; appending
  // this translucent wash puts it strictly BEHIND them, so it can only
  // ever show in the band beyond the state ring (identical geometry to
  // `hinting`'s own halo just above — same reuse §5's Port row calls for).
  // Prepending would alpha-blend it OVER the opaque state ring instead,
  // recolouring the very fact this axis must not touch.
  // `info` paints NOTHING on a Port (§5's own table) — only error/warning
  // earn a mark, in whichever `highlighterKind` the caller asked for.
  const diagnosticSeverity = maxDiagnosticSeverity(diagnostics);
  if (diagnosticSeverity && diagnosticSeverity !== "info") {
    const color = diagnosticColorVar(diagnosticSeverity);
    if (highlighterKind === "halo") {
      layers.push(`0 0 0 9px color-mix(in srgb, ${color} 38%, transparent)`);
    } else {
      // `stroke` and `mask` are the IDENTICAL geometry on a circle
      // (HighlighterKind's own doc: the equidistant offset of a circle is
      // trivially a larger circle — there is no corner for `mask` to get
      // more right than `stroke` does). A crisp two-layer ring — a card-
      // coloured gap, then a solid line — one step further out than the
      // state ring, the SAME two-layer recipe that ring itself already
      // uses one step in.
      const gap = PORT_SURFACE_RING_PX + stateRingPx + 2;
      layers.push(`0 0 0 ${gap}px var(--card)`);
      layers.push(`0 0 0 ${gap + 2}px ${color}`);
    }
  }

  const style: CSSProperties = {};
  // Behind a token so the sketch skin can blank the CSS rings and let the
  // drawn one (below, in `Port`) take their place. Undefined on every other
  // skin, so the `var()` fallback IS the layer list and nothing changes.
  if (layers.length > 0) style.boxShadow = `var(--bbox-skin-dot-rings, ${layers.join(", ")})`;
  // Opaque resting paint, never transparent — a wall-mounted dot straddles a
  // block's border, and a transparent interior would let it show through a
  // hollow (`empty`/`wired`) dot. `var(--card)` is the same token the 2px
  // surface ring already uses, so ring and disc read as one punch-out.
  style.background = fillColor ?? "var(--card)";
  if (effective.dimmed && !effective.hinting) style.opacity = 0.45;
  if (effective.hinting) style.transform = "scale(1.18)";
  return style;
}

/** The core's own diameter as a fraction of the dot's. */
const PORT_CORE_RATIO = 0.42;

/**
 * The small inner "core" dot: lit for `wired` (disc stays hollow, core lit
 * instead of a solid fill) and `received` (core matches the already-solid
 * fill, reading as "fully lit"). `null` means no core layer at all, not a
 * transparent one — `empty`/`valueSet` never mount the extra span.
 * `availability: "available"` lights the core the same way `hinting` does
 * (see `resolveAvailabilityPaint`'s doc); `"unavailable"` has no core
 * treatment of its own, same as `dimmed`.
 */
export function portCoreStyle({
  state = "empty",
  hinting = false,
  availability,
}: PortDotPaintInput): CSSProperties | null {
  const effectiveHinting = resolveAvailabilityPaint(availability, hinting, false).hinting;
  const core = effectiveHinting ? "primary" : STATE_TOKENS[state].core;
  if (core == null) return null;
  return { background: paintVar(core) };
}

/* ------------------------------------------------------------------ */
/* Port — the dot alone: the disc + both rings + the lit core + the    */
/* 40px hit halo. Knows nothing about labels or slots.                 */
/* ------------------------------------------------------------------ */

export interface PortProps extends ComponentProps<"span"> {
  state?: PortState;
  diameter?: PortSize;
  /** Author-set, persisted. Genuinely absent when true — `if (hidden)
   * return null`, no element, no 40px halo, no pointer events at all. Not
   * "opacity 0, still clickable" — Zach's own annotation on the sketch:
   * "Completely remove it, we don't want it to be selectable either." */
  hidden?: boolean;
  /** Host-set, never persisted — the port is out of focus, or mid-drag and
   * not a legal target. Composes OVER the resting paint (a dimmed `wired`
   * port stays legible as "wired, unfocused"), never a fifth `state`. */
  dimmed?: boolean;
  /** Host-set, never persisted — the pointer is over this port mid-drag,
   * previewing it becoming `wired`. */
  hinting?: boolean;
  /** See `PortDotPaintInput.availability`'s own doc — drag-time validity
   *  preview (ruling 5), on by default at the host level. `undefined`
   *  (no gesture) is a zero-paint-change no-op; wins over `hinting`/
   *  `dimmed` when set. Emits `data-availability`. */
  availability?: "available" | "unavailable";
  /** The diagnostic axis — see `PortDotPaintInput.diagnostics`'s own doc.
   *  Absent or `[]` paints no mark at all. Hovering the dot shows every
   *  message (`DiagnosticTooltip`, ./highlighter.tsx); there is no flag
   *  here — Port is the dot alone, and §5 puts the flag on the composites
   *  that HAVE a corner or a slot to anchor it (`LabeledPort`, `Block`). */
  diagnostics?: Diagnostic[];
  /** See `PortDotPaintInput.highlighterKind`'s own doc. */
  highlighterKind?: HighlighterKind;
  /**
   * The hit halo's diameter in the component's OWN px. Defaults to
   * `PORT_HIT_PX` (40). The constant is scene-space: under a host's
   * viewport transform it scales with zoom. A host that wants a
   * screen-constant target divides by its own zoom before passing —
   * per ARCHITECTURE.md the host owns the viewport transform, so the
   * current zoom is an input here, never something Port measures.
   */
  hitPx?: number;
  /**
   * Paint the hit halo (translucent wash + dashed outline) so the region
   * is visible. Pure paint on the EXISTING halo span — geometry and
   * hit-testing are identical with this on or off, same rule as
   * `PortEdge`'s `showCard` overlay.
   */
  showHitRegion?: boolean;
}

/**
 * The dot alone. `hidden` renders NOTHING — not a fifth visual state, a
 * visibility fact (see `PortProps.hidden`'s own doc, and Port.stories.tsx's
 * `Hidden` story, which asserts the DOM node is actually gone).
 */
export function Port({
  state = "empty",
  diameter = "md",
  hidden = false,
  dimmed = false,
  hinting = false,
  availability,
  diagnostics,
  highlighterKind = DEFAULT_HIGHLIGHTER_KIND,
  hitPx = PORT_HIT_PX,
  showHitRegion = false,
  className,
  style,
  ...props
}: PortProps) {
  if (hidden) return null;
  const diameterPx = typeof diameter === "number" ? diameter : PORT_DIAMETERS[diameter];
  // A fixed 40px hit target regardless of the painted diameter.
  const haloInset = (diameterPx - hitPx) / 2;
  const coreStyle = portCoreStyle({ state, hinting, availability });
  const ringColor = portRingColor({ state, dimmed, hinting, availability });
  const diagnosticSeverity = maxDiagnosticSeverity(diagnostics);
  return (
    // Hover -> Tooltip (message + code, no actions) is §5's interaction
    // contract for "any marked text/dot"; absent/empty `diagnostics`
    // returns `children` untouched, so a Port with no marks pays zero DOM
    // cost (see ./diagnostic.tsx's own header).
    <DiagnosticTooltip diagnostics={diagnostics}>
    <span
      data-slot="port-dot"
      data-state={state}
      data-diameter={diameter}
      data-dimmed={dimmed || undefined}
      data-hinting={hinting || undefined}
      data-availability={availability}
      data-diagnostic={diagnosticSeverity}
      data-highlighter-kind={diagnosticSeverity ? highlighterKind : undefined}
      className={cn(portDotClass(), className)}
      style={{
        width: diameterPx,
        height: diameterPx,
        ...portDotStyle({ state, dimmed, hinting, availability, diagnostics, highlighterKind }),
        // WHY: docs/peps/0001-sketch-skin-at-the-boundary.md M6. The ring's
        // colour is STATE-owned (computed above by `portRingColor`, not the
        // skin), so it is published in a channel the skin never writes,
        // rather than left for a boundary pass to read back off
        // `getComputedStyle(el).borderColor` — the sketch skin blanks that
        // to transparent on purpose (its mechanism for hiding a crisp line
        // while keeping its width), which would draw an invisible ring.
        // Naming a colour this component already computed is not a skin
        // import.
        ...({ "--bbox-ink-state": ringColor ?? undefined } as CSSProperties),
        ...style,
      }}
      {...props}
    >
      {/* The drawn ring (ported from packages/bbox-ui/src/port.tsx). Lands
          on the SAME centre-line the box-shadow rings use: those paint an
          annulus from `d/2 + SURFACE` out to `d/2 + SURFACE + STATE`, so
          its centre-line diameter is `d + 2*SURFACE + STATE`; SketchOutline
          insets the path by one border width per side, hence the extra
          `2*STATE`. Colour comes from `portRingColor` — the same
          derivation the box-shadow rings use — so `state` keeps sole
          ownership of it; the skin only supplies the shape. */}
      {ringColor != null && (
        <SketchOutline
          shape="ellipse"
          width={diameterPx + PORT_SURFACE_RING_PX * 2 + PORT_STATE_RING_PX * 3}
          height={diameterPx + PORT_SURFACE_RING_PX * 2 + PORT_STATE_RING_PX * 3}
          borderWidth={PORT_STATE_RING_PX}
          stroke={ringColor}
          seed={`port:${state}:${diameter}`}
        />
      )}
      <span
        data-slot="port-dot-halo"
        aria-hidden
        className="absolute rounded-full"
        style={{
          inset: haloInset,
          // Paint-only when shown: background/outline never move geometry,
          // and the halo is the REAL hit element either way — so the drawn
          // region cannot disagree with the target it visualises.
          ...(showHitRegion
            ? { background: HIT_REGION_FILL, outline: HIT_REGION_OUTLINE, outlineOffset: -1 }
            : null),
        }}
      />
      {coreStyle && (
        <span
          data-slot="port-dot-core"
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ width: `${PORT_CORE_RATIO * 100}%`, height: `${PORT_CORE_RATIO * 100}%`, ...coreStyle }}
        />
      )}
    </span>
    </DiagnosticTooltip>
  );
}
