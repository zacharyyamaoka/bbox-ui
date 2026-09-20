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
import { PORT_DIAMETERS, PORT_HIT_PX, type PortSize } from "./port.layout";
// The visual-variant registry (lane `ports`, 2026-09-19 — see that file's
// header for what a variant decides and where every number was read from).
// `src/skin/` is not a canvas engine and not the scene kit, so this import
// passes both `engineFree.test.ts` and `layering.test.ts`.
import {
  DEFAULT_PORT_VARIANT_ID,
  PORT_VARIANTS,
  PORT_VARIANT_ATTR,
  portProducersOffsetPx,
  portTypePaint,
  portVariantRingExpansion,
  portVariantVars,
  usePortVariant,
  type PortVariant,
  type PortVariantId,
} from "../skin/portVariants";

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
  /**
   * The visual variant in force (src/skin/portVariants.ts). Decides the
   * ring widths and which paint grammar maps `state` onto ring, disc and
   * core (`portGrammarPaint`). Defaults to v1 so every pure call site
   * (`sketchAtEdge`'s ring colour, a story computing a paint) gets the
   * default look without resolving anything; `Port` passes its own.
   */
  variant?: PortVariant;
  /**
   * The port's declared TYPE name — read only by the two by-type grammars
   * (v2 SystemSketch-original, v3 langflow), each through its own source's
   * palette (`portTypePaint`). Every other grammar ignores it: colour
   * comes from STATE there (the 2026-09-10 ruling).
   */
  dataType?: string;
  /** An explicit CSS colour for the type, winning over either palette. */
  typeColor?: string;
}

const DEFAULT_VARIANT = PORT_VARIANTS[DEFAULT_PORT_VARIANT_ID];

/**
 * Static half of the dot's class — sizing/shape/transition only. Every
 * colour fact is dynamic per state and lives in `portDotStyle` instead.
 *
 * Hover is a real CSS `:hover` pseudo-class, deliberately NOT a `hover`
 * prop — nothing outside this component ever needs to SET hover. Since
 * 2026-09-19 the hover rule lives in `src/skin/portVariants.css` (it
 * reads the variant's own `--bbox-port-hover-scale`/`-ring`), so the old
 * `hover:scale-110` utility is gone from here; `transition-transform`
 * (Tailwind v4: `transform, translate, scale, rotate`) still animates it.
 */
export function portDotClass(): string {
  return "relative box-border inline-flex shrink-0 rounded-full transition-transform duration-[50ms] ease-in-out motion-reduce:transition-none";
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
 * One grammar's answer for one state: the ring's colour, the disc's colour
 * (`null` = the card, i.e. hollow) and the centre's (`null` = no core span).
 *
 * WHY one table per grammar, not per-channel enums: the five sources
 * disagree about what a port's colour MEANS — STATE in this trunk (the
 * 2026-09-10 ruling), TYPE in the original SystemSketch and in langflow —
 * and about which circle carries it. Independent knobs would let two
 * grammars combine into a look nobody proposed; a switch keeps each variant
 * exactly what its source draws. Gesture facts (`hinting`, `dimmed`,
 * `availability`) are NOT grammar: they override every variant the same
 * way in `portRingColor`/`portDotStyle`/`portCoreStyle` below.
 */
export interface PortGrammarPaint {
  ring: string | null;
  fill: string | null;
  core: string | null;
}

export function portGrammarPaint(
  state: PortState,
  variant: PortVariant = DEFAULT_VARIANT,
  dataType?: string,
  typeColor?: string,
): PortGrammarPaint {
  const tokens = STATE_TOKENS[state];
  const tok = (token: string | null) => (token ? paintVar(token) : null);
  switch (variant.dot.grammar) {
    case "trunk":
      // v1 — this trunk's own three circles, unchanged; only the scale moved.
      return { ring: tok(tokens.ring), fill: tok(tokens.fill), core: tok(tokens.core) };
    case "systemsketch": {
      // v2 — block-canvas.css:1103-1132: the ring is ALWAYS the type's
      // colour; the disc is the card (unwired), muted (`.Port_default`,
      // owns a default), the type colour (`.Port_connected`). `received`
      // has no original counterpart, so it borrows the trunk's own token.
      const type = portTypePaint("systemsketch", dataType, typeColor)!;
      const fill = state === "valueSet" ? paintVar("muted-foreground") : state === "wired" ? type.disc : state === "received" ? paintVar("bbox-received") : null;
      return { ring: type.disc, fill, core: null };
    }
    case "langflow": {
      // v3 — handleRenderComponent/index.tsx:110-131: the disc IS the type
      // colour and the 3px ring its pale `-foreground` pair, in EVERY
      // state. langflow lets the cable say "wired" (a connected handle only
      // swaps to the SOURCE's colour, :144-145) — faithfully, so here.
      const type = portTypePaint("langflow", dataType, typeColor)!;
      return { ring: type.tint, fill: type.disc, core: null };
    }
    case "pearl":
      // v4 — React Flow UI `BaseHandle`: `bg-slate-100` + `border-slate-300`
      // at rest (neutral token mixes, so dark mode follows), stock xyflow
      // ink once wired (`--xy-handle-background-color-default: #1a192b`,
      // this app's `--foreground`), the trunk's received token for data.
      switch (state) {
        case "empty":
          return { ring: "color-mix(in srgb, var(--foreground) 24%, var(--card))", fill: "color-mix(in srgb, var(--foreground) 5%, var(--card))", core: null };
        case "valueSet":
          return { ring: "color-mix(in srgb, var(--foreground) 45%, var(--card))", fill: "color-mix(in srgb, var(--foreground) 22%, var(--card))", core: null };
        case "wired":
          return { ring: paintVar("foreground"), fill: paintVar("foreground"), core: null };
        case "received":
          return { ring: paintVar("bbox-received"), fill: paintVar("bbox-received"), core: null };
      }
      break;
    case "reticle":
      // v5 — DP - Port's three circles literally: the outline takes the
      // state colour, the background stays the card, the CENTRE is always
      // drawn — muted until something attaches, lit when wired.
      return {
        ring: tok(tokens.ring),
        fill: null,
        core: tok(tokens.core) ?? (state === "valueSet" ? paintVar("muted-foreground") : "color-mix(in srgb, var(--foreground) 32%, var(--card))"),
      };
  }
  return { ring: tok(tokens.ring), fill: tok(tokens.fill), core: tok(tokens.core) };
}

/**
 * The dot's ring colour, as one exported derivation.
 *
 * WHY extracted rather than left inline (ported from packages/bbox-ui/src/
 * port.tsx's own `portRingColor`): the sketch skin draws the ring as a
 * path instead of as box-shadow layers, and it has to be the SAME colour.
 * A second copy of this precedence is exactly how a `hinting` port would
 * end up orange in one skin and grey in another. `null` means "this state
 * paints no ring at all". Precedence: see `resolveAvailabilityPaint`'s doc
 * — gesture facts first, then the variant's grammar.
 */
export function portRingColor({
  state = "empty",
  dimmed = false,
  hinting = false,
  availability,
  variant = DEFAULT_VARIANT,
  dataType,
  typeColor,
}: PortDotPaintInput): string | null {
  const effective = resolveAvailabilityPaint(availability, hinting, dimmed);
  if (effective.hinting) return paintVar("primary");
  if (effective.dimmed) return paintVar("muted-foreground");
  return portGrammarPaint(state, variant, dataType, typeColor).ring;
}

/**
 * The dot's ring/fill, per the variant's grammar (`portGrammarPaint`).
 * `dimmed` forces the ring to `muted-foreground` and
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
  variant = DEFAULT_VARIANT,
  dataType,
  typeColor,
}: PortDotPaintInput): CSSProperties {
  const effective = resolveAvailabilityPaint(availability, hinting, dimmed);
  const ringColor = portRingColor({ state, dimmed, hinting, availability, variant, dataType, typeColor });
  // `hinting` (or `availability: "available"`) renders hollow (no fill),
  // matching `wired`'s own shape on the default grammar.
  const fillColor = effective.hinting ? null : portGrammarPaint(state, variant, dataType, typeColor).fill;
  const gapPx = variant.dot.gap;
  // The drag preview rings a port one step heavier than its resting ring.
  const stateRingPx = effective.hinting ? variant.dot.ring + 1 : variant.dot.ring;

  const layers: string[] = [];
  if (ringColor != null) {
    // The card-coloured punch-out first (0 on the ring-only variants), then
    // the ring — the same two-layer recipe the fixed 2/3px rings used.
    if (gapPx > 0) layers.push(`0 0 0 ${gapPx}px var(--card)`);
    layers.push(`0 0 0 ${gapPx + stateRingPx}px ${ringColor}`);
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
      const gap = gapPx + stateRingPx + 2;
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
/** Below this box the 0.42 core is a 2px speck; a half-box core (3px in
 *  the 6px default) is the smallest pinhead that still reads as "lit". */
const PORT_CORE_RATIO_SMALL = 0.5;
const PORT_CORE_SMALL_BOX_PX = 8;

export function portCoreRatio(diameterPx: number): number {
  return diameterPx <= PORT_CORE_SMALL_BOX_PX ? PORT_CORE_RATIO_SMALL : PORT_CORE_RATIO;
}

/**
 * The small inner "core" dot — the THIRD of DP - Port's three circles. On
 * the default grammar it is lit for `wired` (disc stays hollow, core lit
 * instead of a solid fill) and `received` (core matches the already-solid
 * fill, reading as "fully lit"); the reticle grammar draws it in every
 * state; the solid-disc grammars never do (the whole disc carries it).
 * `null` means no core layer at all, not a transparent one.
 * `availability: "available"` lights the core the same way `hinting` does
 * (see `resolveAvailabilityPaint`'s doc); `"unavailable"` has no core
 * treatment of its own, same as `dimmed`.
 */
export function portCoreStyle({
  state = "empty",
  hinting = false,
  availability,
  variant = DEFAULT_VARIANT,
  dataType,
  typeColor,
}: PortDotPaintInput): CSSProperties | null {
  const effectiveHinting = resolveAvailabilityPaint(availability, hinting, false).hinting;
  if (effectiveHinting) return { background: paintVar("primary") };
  const core = portGrammarPaint(state, variant, dataType, typeColor).core;
  return core == null ? null : { background: core };
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
  /**
   * The visual variant (src/skin/portVariants.ts). Omit — the normal case
   * — and the document-wide `<html data-bbox-port-variant>` decides,
   * defaulting to `v1`; set it to pin THIS port (a gallery showing all
   * five at once). When `diameter` is also omitted the variant's own dot
   * diameter is used, which is how "the small pair is the default" reaches
   * every port nobody sized explicitly.
   */
  variant?: PortVariantId;
  /**
   * Host-set, never persisted — the port is the current selection. Emits
   * `data-selected`; the outline is a CSS rule in portVariants.css sized
   * by the variant. Like `dimmed`, a modifier layered over the state, never
   * a fifth `state` (DP - Port: "Hover and out-of-focus are modifiers, not
   * states").
   */
  selected?: boolean;
  /**
   * How many cables meet this port (Zach, 2026-09-19: "The port only should
   * have 1 connection point in the center. Instead you should show the
   * producer circle that has the number for the number of arrows
   * intersecting at that port"). Rendered as a small count circle riding
   * the dot when 2 or more — a lone cable is the ordinary wired look and
   * a "1" on every wired port would be noise (the original SystemSketch's
   * own rule, `bboxUi/core/port.tsx:336`, `producers >= 2`). The number is
   * fed by the host (lane `producers-count` computes it from the scene);
   * this component only draws what it is handed.
   */
  producers?: number;
  /**
   * Which side of the dot the producers circle rides — the side AWAY from
   * the label, so it never sits on the text. `LabeledPort` derives it from
   * the label's origin; a bare `Port` defaults to `right`.
   */
  producersAt?: "left" | "right";
  /** See `PortDotPaintInput.dataType` — only the by-type variants read it. */
  dataType?: string;
  /** See `PortDotPaintInput.typeColor`. */
  typeColor?: string;
}

/**
 * The dot alone. `hidden` renders NOTHING — not a fifth visual state, a
 * visibility fact (see `PortProps.hidden`'s own doc, and Port.stories.tsx's
 * `Hidden` story, which asserts the DOM node is actually gone).
 */
export function Port({
  state = "empty",
  diameter,
  hidden = false,
  dimmed = false,
  hinting = false,
  availability,
  diagnostics,
  highlighterKind = DEFAULT_HIGHLIGHTER_KIND,
  hitPx = PORT_HIT_PX,
  showHitRegion = false,
  variant: variantId,
  selected = false,
  producers,
  producersAt = "right",
  dataType,
  typeColor,
  className,
  style,
  ...props
}: PortProps) {
  // Hooks before the early return — `hidden` is a prop, not a hook order.
  const variant = usePortVariant(variantId);
  if (hidden) return null;
  const diameterPx = diameter === undefined ? variant.dot.diameter : typeof diameter === "number" ? diameter : PORT_DIAMETERS[diameter];
  // A fixed 40px hit target regardless of the painted diameter.
  const haloInset = (diameterPx - hitPx) / 2;
  const coreStyle = portCoreStyle({ state, hinting, availability, variant, dataType, typeColor });
  const ringColor = portRingColor({ state, dimmed, hinting, availability, variant, dataType, typeColor });
  const ringExpansion = portVariantRingExpansion(variant);
  const diagnosticSeverity = maxDiagnosticSeverity(diagnostics);
  const showProducers = producers != null && producers >= 2;
  const producersOffset = showProducers ? portProducersOffsetPx(variant, producersAt) : null;
  const typePaint = portTypePaint(variant.dot.grammar, dataType, typeColor);
  return (
    // Hover -> Tooltip (message + code, no actions) is §5's interaction
    // contract for "any marked text/dot"; absent/empty `diagnostics`
    // returns `children` untouched, so a Port with no marks pays zero DOM
    // cost (see ./diagnostic.tsx's own header).
    <DiagnosticTooltip diagnostics={diagnostics}>
    <span
      data-slot="port-dot"
      data-state={state}
      data-diameter={diameter ?? diameterPx}
      data-dimmed={dimmed || undefined}
      data-hinting={hinting || undefined}
      data-selected={selected || undefined}
      data-availability={availability}
      data-diagnostic={diagnosticSeverity}
      data-highlighter-kind={diagnosticSeverity ? highlighterKind : undefined}
      // The variant this dot resolved to — the same attribute a host stamps
      // on `<html>`, republished per port so a CSS-only reader (or a
      // screenshot diff) can tell which look painted without walking up.
      {...{ [PORT_VARIANT_ATTR]: variant.id }}
      // WHY these two: docs/peps/0001-sketch-skin-at-the-boundary.md M4.
      // The dot's state rings are `box-shadow` layers, entirely OUTSIDE
      // this element's own box, so a boundary pass needs to know how far
      // out its drawn ring has to land. Before this migration that lived
      // only in `sketchAtEdge.ts`'s `ringExpansion`, which parsed this
      // element's computed `box-shadow` spreads back out — "DOM
      // archaeology" by its own header, kept only because that lane could
      // not edit this file. Now that it can, these publish the SAME two
      // numbers directly (unchanged arithmetic: the ring's own centre-line
      // sits `GAP*2 + RING*3` beyond the dot's diameter, drawn with a
      // `RING`-wide pen — now over the VARIANT's rings, `portVariantRing-
      // Expansion`, rather than fixed constants) and the parser is deleted.
      data-bbox-ring-expand={ringExpansion.expand}
      data-bbox-ring-pen={ringExpansion.pen}
      // WHY: docs/peps/0001-sketch-skin-at-the-boundary.md M7. Same gap as
      // Badge's — the edge's default seed is geometry (`${w}x${h}`), this
      // component's own is semantic (`port:${state}:${diameter}`).
      // Publishing it makes the wobble pattern match what the deleted
      // in-core `SketchOutline` call used to draw, not just its amplitude.
      data-bbox-seed={`port:${state}:${diameter ?? diameterPx}`}
      className={cn(portDotClass(), className)}
      style={{
        width: diameterPx,
        height: diameterPx,
        // The variant's numbers, published as custom properties so the
        // hover/selected/producers rules in portVariants.css (and any
        // CSS-only consumer below this element) read THIS dot's variant.
        ...portVariantVars(variant),
        // The type colour the by-type variants painted with — what the
        // langflow hover glow in portVariants.css reads.
        ...(typePaint ? ({ "--bbox-port-type-color": typePaint.disc } as CSSProperties) : null),
        ...portDotStyle({ state, dimmed, hinting, availability, diagnostics, highlighterKind, variant, dataType, typeColor }),
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
          style={{ width: `${portCoreRatio(diameterPx) * 100}%`, height: `${portCoreRatio(diameterPx) * 100}%`, ...coreStyle }}
        />
      )}
      {showProducers && producersOffset && (
        // The producers count circle, riding the dot up-and-outward on the
        // side away from the label, overlapping the painted ring by 2px like
        // a notification badge (geometry + WHY: `portProducersOffsetPx`).
        // Inside this span on purpose: it scales with the dot on hover and
        // dims with it, and a wire host that resolves a port by
        // `[data-slot="port-dot"]` never mistakes it for a second attach
        // point (it is `pointer-events: none` and not a dot). Paint lives in
        // portVariants.css; `data-style` picks ink vs. the original's soft
        // chip.
        <span
          data-slot="port-producers"
          data-count={producers}
          data-style={variant.producers.style}
          aria-label={`${producers} producers`}
          style={{
            left: `calc(50% + ${producersOffset.dx}px)`,
            top: `calc(50% + ${producersOffset.dy}px)`,
            transform: "translate(-50%, -50%)",
          }}
        >
          {producers}
        </span>
      )}
    </span>
    </DiagnosticTooltip>
  );
}
