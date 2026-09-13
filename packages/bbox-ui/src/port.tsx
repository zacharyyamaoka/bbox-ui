import type { ComponentProps, CSSProperties } from "react";
import { resolveField } from "@bbox-ui/schema";

import { cn } from "./lib/utils";
import {
  STATE_TOKENS,
  TONE_TOKENS,
  type AppearanceState,
  type Lens,
  type Tone,
  paintVar,
} from "./appearance";
import { PORT_FIELDS } from "./port.fields";
import { PORT_PRESETS } from "./port.presets";
import {
  PORT_DIAMETERS,
  PORT_HIT_PX,
  PORT_STATE_RING_PX,
  PORT_SURFACE_RING_PX,
  PORT_TEXT_SIZES,
  inwardTextLayout,
  portBadgeSide,
  portFlexDirection,
  portLabelGap,
  type BlockSide,
  type PortDirection,
  type PortReveal,
  type PortSize,
  type PortSizeRung,
  type PortTextLayout,
  type PortTextSize,
} from "./port.layout";

/** The two fields `Port`'s own `size` rung governs — looked up once from
 * `PORT_FIELDS` (never re-typed) so `resolveField` runs the SAME
 * computation the product inspector's trace panel reads, exactly
 * `pill.tsx`'s own `PAINT_FIELD_BY_ID` pattern. */
const DIAMETER_FIELD = PORT_FIELDS.find((f) => f.id === "diameter")!;
const TEXT_SIZE_FIELD = PORT_FIELDS.find((f) => f.id === "textSize")!;

/**
 * packages/bbox-ui/src/port.tsx — the rebuilt Port (T1 Lane P).
 *
 * Anatomy (PORT-SPEC.md §2.1): `PortDot` and `PortLabel` (itself three
 * independently-typed spans, `PortName`/`PortType`/`PortDefaultChip`) are
 * SIBLINGS, never parent/child — the real app positions both absolutely
 * from the *container's* layout at a shared anchor, and needs the dot to
 * win z-order/hit-arbitration against its own label independently. `Port`
 * below is the flex-row PAIRING of those two siblings for a standalone
 * specimen; a host placing a real port on a real block wall instead uses
 * `PortDot`/`PortLabel` directly, positioned via `./port.layout.ts`'s
 * `portDotPlacement`/`portLabelPlacement` — never nested one inside the
 * other. This is T0's own anatomy bug (PORT-SPEC.md §0.2): a single flex
 * parent could not reproduce that independence.
 *
 * PORT COLOUR COMES FROM STATE, NOT TYPE (Zach, 2026-09-10 ruling — see
 * docs/T1-SPEC.md and PORT-SPEC.md's standing amendment). The declared
 * `type` string survives only as muted text beside the name; it tints
 * nothing. `portDotStyle` below reads colour from `STATE_TOKENS`/
 * `TONE_TOKENS` (./appearance.ts) — the SAME two lookups the cascade's
 * worked example (docs/T1-SPEC.md §1.4) illustrates — never from `type`.
 */

/* ------------------------------------------------------------------ */
/* The dot's paint — state (+ tone override, + the interaction axis)   */
/* ------------------------------------------------------------------ */

export interface PortDotPaintInput {
  state?: AppearanceState;
  tone?: Tone;
  dimmed?: boolean;
  hinting?: boolean;
}

/**
 * Static half of the dot's class — sizing/shape/transition only. Every
 * COLOUR fact (the two-layer box-shadow ring, the fill) is dynamic per
 * state/tone and lives in `portDotStyle` instead: two concentric rings of
 * DIFFERENT, per-state token colours cannot be expressed as a static
 * Tailwind border class the way T0's single `border-2` could. Exported —
 * same reason T0 exported it — "so host adapters can paint the same dot
 * on elements they own" (e.g. a React Flow `Handle`).
 *
 * `hover:scale-110` is a real CSS `:hover` pseudo-class, deliberately NOT
 * a `hover`/`hovering` prop (2026-09-12 port-props ruling, D2) — nothing
 * ever needs to SET hover from outside (a host doesn't drive it, a
 * document never persists it), so giving it a prop would be a control
 * that never does anything a real `:hover` doesn't already do on its own.
 * Preview it in Storybook via the pseudo-states addon, not a boolean arg.
 */
export function portDotClass(): string {
  return "relative box-border inline-flex shrink-0 rounded-full transition-transform duration-[50ms] ease-in-out hover:scale-110 motion-reduce:transition-none motion-reduce:hover:scale-100";
}

/**
 * Resolves ONE paint channel (ring, fill, or core) to a real CSS colour
 * value — or `null`, meaning "state says this channel does not paint at
 * all".
 *
 * `base` is the STATE_TOKENS token for this channel at the current state;
 * `null` there is authoritative and wins outright, before `tone` is even
 * consulted — this is "state owns the presence/fill bit" (Judge round 6,
 * finding R12). When `base` DOES paint and a non-neutral tone is set, the
 * tone's hue leads via `color-mix` but is blended WITH the state's own
 * base colour rather than replacing it outright: a flat substitution
 * (tried first, see the fix's git history) collapses every state that
 * shares a base token's "shape" — `empty`'s hollow `foreground` ring and
 * `valueSet`'s hollow `muted-foreground` ring, or `wired`'s lit `primary`
 * core and `received`'s solid `bbox-received` fill — into one identical
 * tone-coloured circle, re-breaking the same "State control goes inert"
 * bug one level down. Blending keeps the tone recognisably dominant while
 * the state's own hue still shows through enough that every persistable
 * state stays distinguishable under any single tone (verified by
 * `test/port.paint.test.ts`).
 */
function toneColor(base: string | null, toneToken: string | null): string | null {
  if (base == null) return null;
  if (toneToken == null) return paintVar(base);
  return `color-mix(in srgb, ${paintVar(toneToken)} 70%, ${paintVar(base)} 30%)`;
}

/**
 * The dot's ring/fill, resolved from the cascade's token lookups via
 * `toneColor` above. `tone` is sugar that writes the override layer
 * (`toneOverride`, appearance.ts) — Port has no separate settable paint
 * field for an override to land on (see `port.presets.ts` for why
 * `PORT_PRESETS` is empty), so this function IS that override, computed
 * directly rather than through `resolveFields` against a governed
 * property that doesn't exist.
 *
 * Two host-set, never-persisted modifiers compose OVER the resting paint,
 * never replacing `state`'s own reading (2026-09-12 port-props ruling —
 * `outOfFocus`/`eligible`/`dragging` used to be three overlapping ways of
 * saying "the host is doing something to this port"; now there are two):
 *
 * - `dimmed` — the port is out of focus, OR mid-drag and not a legal
 *   target ("not eligible ⇒ dimmed": one boolean covers both, since
 *   they're the identical grey-ring-and-faded read). Forces the ring to
 *   `muted-foreground` and fades the WHOLE dot to ~45% opacity, leaving
 *   the resting fill/core colour underneath untouched (so a `dimmed`
 *   `wired` port is still legible as "wired, just not focused right now"
 *   rather than becoming indistinguishable grey).
 * - `hinting` — the pointer is over this port mid-drag, previewing it
 *   BECOMING `wired`: it wears `wired`'s own shape (hollow ring, lit
 *   core) in `--primary` ink regardless of `state`, scaled up with a
 *   wide halo. Wearing `empty`'s own ink here would read as "this port is
 *   broken" rather than "drop here" — see `portCoreStyle` below for the
 *   matching core paint. `hinting` wins over `dimmed` when both are set
 *   (the one port under the pointer is by definition the eligible one).
 */
export function portDotStyle({
  state = "empty",
  tone = "neutral",
  dimmed = false,
  hinting = false,
}: PortDotPaintInput): CSSProperties {
  const toneToken = TONE_TOKENS[tone];
  const { ring, fill } = STATE_TOKENS[state];
  const ringColor = hinting
    ? paintVar("primary")
    : dimmed
      ? paintVar("muted-foreground")
      : toneColor(ring, toneToken);
  // `hinting` renders hollow (fill: null), matching `wired`'s own shape —
  // see the module doc above and `portCoreStyle`'s matching lit core.
  const fillColor = hinting ? null : toneColor(fill, toneToken);

  const layers: string[] = [];
  if (ringColor != null) {
    const stateRingPx = hinting ? 4 : PORT_STATE_RING_PX;
    layers.push(`0 0 0 ${PORT_SURFACE_RING_PX}px var(--card)`);
    layers.push(`0 0 0 ${PORT_SURFACE_RING_PX + stateRingPx}px ${ringColor}`);
  }
  if (hinting) {
    layers.push("0 0 0 9px color-mix(in srgb, var(--bbox-primary, var(--primary)) 38%, transparent)");
  }

  return {
    boxShadow: layers.length > 0 ? layers.join(", ") : undefined,
    background: fillColor ?? "transparent",
    opacity: dimmed && !hinting ? 0.45 : undefined,
    transform: hinting ? "scale(1.18)" : undefined,
  };
}

/** The core's own diameter as a fraction of the dot's — small enough to
 * read as "something lit inside the ring", never competing with the fill
 * for the disc's whole area. */
const PORT_CORE_RATIO = 0.42;

/**
 * The small inner "core" dot lit for `wired` (disc kept hollow, core lit
 * instead of the old solid fill) and `received` (core matches the already
 * -solid fill, so it reads as "fully lit" rather than losing the core in
 * its own fill colour) — 2026-09-12 port-props ruling, "the three circles
 * are one token-table row." A `null` return means "no core layer at all",
 * not a transparent one, so `empty`/`valueSet` never mount the extra span.
 */
export function portCoreStyle({ state = "empty", tone = "neutral", hinting = false }: PortDotPaintInput): CSSProperties | null {
  const toneToken = TONE_TOKENS[tone];
  const core = hinting ? "primary" : STATE_TOKENS[state].core;
  const color = hinting ? paintVar("primary") : toneColor(core, toneToken);
  if (color == null) return null;
  return { background: color };
}

/* ------------------------------------------------------------------ */
/* The count badge — a small part painted ON the dot. `role`/          */
/* `decoration` (the old semantic-role cue and mutates/variadic ring)  */
/* were removed 2026-09-12 (port.layout.ts's own WHY, above their old  */
/* import site) — this is the one small part `Port` still owns itself. */
/* ------------------------------------------------------------------ */

// WHY total lookups and not ternaries: a ternary has a fall-through, so
// widening either union ships a live panel segment that renders exactly like
// the default, typecheck clean and every test green. A Record over the real
// union is a compile error until someone says what the new member looks like.
const REVEAL_CLASS: Record<PortReveal, string> = {
  always: "",
  onHover: "opacity-0 transition-opacity hover:opacity-100 focus-within:opacity-100",
};

/** One offset per `PortTextLayout` side, matching `portLabelPlacement`'s
 * own `PORT_LABEL_GAP`-style clearance so the badge/cue never reads as
 * randomly placed relative to the label it's dodging. */
const OVERLAY_SIDE_STYLE: Record<PortTextLayout, CSSProperties> = {
  left: { right: "100%", marginRight: 6, top: "50%", transform: "translateY(-50%)" },
  right: { left: "100%", marginLeft: 6, top: "50%", transform: "translateY(-50%)" },
  top: { bottom: "100%", marginBottom: 6, left: "50%", transform: "translateX(-50%)" },
  bot: { top: "100%", marginTop: 6, left: "50%", transform: "translateX(-50%)" },
};

function PortCountBadge({ count, layout }: { count: number; layout: PortTextLayout }) {
  // Anchors on `portBadgeSide(layout)` — the side OPPOSITE whichever way
  // the label is actually flowing (port.layout.ts's own WHY) — never a
  // side hardcoded to the default composition, which is what let a
  // left-flowing label land directly under the badge (2026-09-12 D5 fix).
  return (
    <span
      data-slot="port-count"
      className="pointer-events-none absolute flex min-w-[16px] items-center justify-center rounded-[7px] bg-foreground/10 px-[5px] text-[10px] font-semibold leading-[16px] text-foreground"
      style={{ height: 16, ...OVERLAY_SIDE_STYLE[portBadgeSide(layout)] }}
    >
      {count}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* PortDot — the disc + both rings + the lit core + the hit halo + the */
/* count badge. Independently positionable (see the module doc).       */
/* ------------------------------------------------------------------ */

export interface PortDotProps extends ComponentProps<"span"> {
  state?: AppearanceState;
  tone?: Tone;
  diameter?: PortSize;
  /** Author-set, persisted — same shape as `bar.fields.ts`'s existing
   * `hidden`. Replaces the old `state: "hidden"` rung: painting nothing is
   * a visibility fact, not a seventh kind of content (appearance.ts's own
   * WHY). */
  hidden?: boolean;
  /** Host-set, never persisted — the port is out of focus, or mid-drag and
   * not a legal target. Replaces `outOfFocus` (a `state` rung) and
   * `eligible` (inverted): see `portDotStyle`'s own WHY. */
  dimmed?: boolean;
  /** Host-set, never persisted — the pointer is over this port mid-drag. */
  hinting?: boolean;
  /** Which way this dot's label flows — only consulted to keep the count
   * badge clear of it (`portBadgeSide`); purely presentational, never
   * persisted on the dot itself (a host's real layout owns this fact). */
  textLayout?: PortTextLayout;
  /** Host-computed many-to-one count — never persisted. */
  producers?: number;
}

/**
 * The dot alone: the disc, the 2px surface-coloured gap ring, the 3px
 * state ring, the small lit "core" some states paint on top
 * (`portCoreStyle`), a 40px invisible hit halo (always centred on the dot
 * regardless of `diameter`), and an optional many-to-one count badge.
 *
 * `hidden` renders NOTHING ("not painted at all; the container counts it
 * into `+N more`") — see `PortHiddenSummary` below for that
 * container-owned summary.
 */
export function PortDot({
  state = "empty",
  tone = "neutral",
  diameter = "md",
  hidden = false,
  dimmed = false,
  hinting = false,
  textLayout = "right",
  producers = 0,
  className,
  style,
  ...props
}: PortDotProps) {
  if (hidden) return null;
  const diameterPx = typeof diameter === "number" ? diameter : PORT_DIAMETERS[diameter];
  // A fixed 40px hit target regardless of the painted diameter — the
  // donor's own `inset: -14px` is this formula evaluated at diameter=12.
  const haloInset = (diameterPx - PORT_HIT_PX) / 2;
  const coreStyle = portCoreStyle({ state, tone, hinting });
  return (
    <span
      data-slot="port-dot"
      data-state={state}
      data-tone={tone}
      data-diameter={diameter}
      data-dimmed={dimmed || undefined}
      data-hinting={hinting || undefined}
      className={cn(portDotClass(), className)}
      style={{
        width: diameterPx,
        height: diameterPx,
        ...portDotStyle({ state, tone, dimmed, hinting }),
        ...style,
      }}
      {...props}
    >
      <span
        data-slot="port-dot-halo"
        aria-hidden
        className="absolute rounded-full"
        style={{ inset: haloInset }}
      />
      {coreStyle && (
        <span
          data-slot="port-dot-core"
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: `${PORT_CORE_RATIO * 100}%`,
            height: `${PORT_CORE_RATIO * 100}%`,
            ...coreStyle,
          }}
        />
      )}
      {producers >= 2 && <PortCountBadge count={producers} layout={textLayout} />}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* PortLabel — three typed, independently-clipped spans, mirrored by   */
/* direction, or the `children` escape hatch wholesale.                */
/* ------------------------------------------------------------------ */

export interface PortNameProps extends ComponentProps<"span"> {
  textSize?: PortTextSize;
}

/** 18px (default) mono ink — the port's own name. */
export function PortName({ textSize = "sm", className, style, ...props }: PortNameProps) {
  return (
    <span
      data-slot="port-name"
      className={cn(
        "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono leading-tight text-foreground",
        className,
      )}
      style={{ fontSize: PORT_TEXT_SIZES[textSize], ...style }}
      {...props}
    />
  );
}

export interface PortTypeProps extends ComponentProps<"span"> {
  textSize?: PortTextSize;
}

/**
 * The declared type — muted mono text beside the name, TINTING NOTHING.
 * This is the other half of the 2026-09-10 ruling: the type did not
 * disappear, it stopped owning the colour channel (see `portDotStyle`).
 */
export function PortType({ textSize = "sm", className, style, ...props }: PortTypeProps) {
  return (
    <span
      data-slot="port-type"
      className={cn(
        "shrink-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono leading-tight text-muted-foreground",
        className,
      )}
      style={{ fontSize: PORT_TEXT_SIZES[textSize], ...style }}
      {...props}
    />
  );
}

export interface PortDefaultChipProps extends ComponentProps<"span"> {
  /** Dims the chip to `opacity .5` without erasing it — PORT-SPEC.md §7
   * Q2's adopted answer to "defaulted AND wired, which wins": `wired`
   * wins the dot, the chip just dims. */
  overridden?: boolean;
}

/** The `= v` pill, capped at 88px with a visible (never silent) ellipsis. */
export function PortDefaultChip({
  overridden = false,
  className,
  style,
  children,
  ...props
}: PortDefaultChipProps) {
  return (
    <span
      data-slot="port-default-chip"
      data-overridden={overridden || undefined}
      className={cn(
        "shrink-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-border bg-muted font-mono text-muted-foreground",
        className,
      )}
      style={{
        maxWidth: 88,
        padding: "0 7px",
        fontSize: 13,
        lineHeight: "18px",
        opacity: overridden ? 0.5 : 1,
        ...style,
      }}
      {...props}
    >
      {children}
    </span>
  );
}

export interface PortLabelProps extends ComponentProps<"span"> {
  name?: string;
  type?: string;
  defaultValue?: string;
  direction?: PortDirection;
  textSize?: PortTextSize;
  /** Only consulted to dim the default chip when `state === "wired"` —
   * see `PortDefaultChip`'s `overridden`. */
  state?: AppearanceState;
  /** Same fact as `PortDot`'s own `hidden` — see its docblock. */
  hidden?: boolean;
}

/**
 * The label row: `PortName` + `PortType` + `PortDefaultChip`, in a
 * direction-mirrored order — input: name→type→chip; output:
 * type→name→chip (PORT-SPEC.md §2.1/§3f) — or `children`, when supplied,
 * REPLACING that three-span rendering wholesale (a CodeMirror mount, a
 * `name: Type = default` one-liner — PORT-SPEC.md §7 Q6's adopted
 * default). Independently positionable from `PortDot` — see the module
 * doc at the top of this file.
 */
export function PortLabel({
  name = "",
  type = "",
  defaultValue = "",
  direction = "input",
  textSize = "sm",
  state = "empty",
  hidden = false,
  className,
  style,
  children,
  ...props
}: PortLabelProps) {
  // "no dot, no slot" — a hidden port's label disappears along with its
  // dot, whether the two are rendered together (`Port`, which never even
  // calls this far) or a host positions them independently and passes
  // `hidden` through.
  if (hidden) return null;
  const nameSpan = name ? (
    <PortName key="name" textSize={textSize}>
      {name}
    </PortName>
  ) : null;
  const typeSpan = type ? (
    <PortType key="type" textSize={textSize}>
      {type}
    </PortType>
  ) : null;
  const chipSpan = defaultValue ? (
    <PortDefaultChip key="chip" overridden={state === "wired"}>
      = {defaultValue}
    </PortDefaultChip>
  ) : null;
  const ordered =
    direction === "output" ? [typeSpan, nameSpan, chipSpan] : [nameSpan, typeSpan, chipSpan];
  return (
    <span
      data-slot="port-label"
      data-direction={direction}
      className={cn("flex min-w-0 items-center gap-2 overflow-hidden", className)}
      style={style}
      {...props}
    >
      {/* `||`, not `??`: an explicitly empty string is the honest FieldSpec
          default for a "no override" text control (FieldValue has no
          `undefined`) and must behave IDENTICALLY to omitting `children`
          — both fall through to the three-span rendering. */}
      {children || ordered}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* PortHiddenSummary — the container's "+N more", never one Port's job */
/* ------------------------------------------------------------------ */

export interface PortHiddenSummaryProps extends ComponentProps<"span"> {
  count: number;
  direction?: PortDirection;
}

/**
 * A container's own roll-up over its `state: "hidden"` ports
 * (PORT-SPEC.md §2.1's `.BlockNode-hiddenPorts`, §4's "owned by the
 * host" table) — never rendered by one `Port` instance, which is why
 * `PortDot`/`PortLabel` simply return `null` for a hidden port instead
 * of rendering this themselves. Exported here because it shares Port's
 * own typography tokens.
 */
export function PortHiddenSummary({
  count,
  direction = "input",
  className,
  style,
  ...props
}: PortHiddenSummaryProps) {
  return (
    <span
      data-slot="port-hidden-summary"
      data-direction={direction}
      className={cn("italic font-semibold text-muted-foreground", className)}
      style={{ fontSize: 11, lineHeight: "16px", height: 16, ...style }}
      {...props}
    >
      +{count} more
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Port — the flex-row PAIRING of PortDot + PortLabel, for a standalone */
/* specimen. A host placing a real port on a real block wall uses       */
/* PortDot/PortLabel directly instead (see the module doc).             */
/* ------------------------------------------------------------------ */

export interface PortProps extends ComponentProps<"div"> {
  name?: string;
  type?: string;
  defaultValue?: string;
  direction?: PortDirection;
  edge?: BlockSide;
  /** The cascading rung a header (Bar/Flex) hands down — governs
   * `diameter`/`textSize` together via `PORT_PRESETS`. An explicit
   * `diameter`/`textSize` still wins (see `Port`'s own render). */
  size?: PortSizeRung;
  diameter?: PortSize;
  /** Sensible default is `inwardTextLayout(edge)` when omitted. */
  textLayout?: PortTextLayout;
  textSize?: PortTextSize;
  state?: AppearanceState;
  tone?: Tone;
  lens?: Lens;
  lensBefore?: string;
  /** Author-set, persisted — same shape as `bar.fields.ts`'s existing
   * `hidden`. See `PortDot`'s own docblock. */
  hidden?: boolean;
  /** Host-set, never persisted — see `portDotStyle`'s own WHY. */
  dimmed?: boolean;
  hinting?: boolean;
  reveal?: PortReveal;
  /** Host-computed many-to-one count — never persisted. */
  producers?: number;
}

/**
 * Port = the dot, the label, paired as flex siblings for a standalone
 * specimen (Storybook, the product inspector, a detached copy) — a real
 * host instead positions `PortDot`/`PortLabel` independently, at a
 * shared anchor, per `./port.layout.ts`. `hidden` renders nothing at all,
 * same as its `PortDot`/`PortLabel` parts.
 *
 * `lens`/`lensBefore` (the diff/lint overlay, `./appearance.ts`) are
 * accepted and exposed as `data-lens` for a host to style, but T1 does
 * not itself define lens paint tokens (docs/T1-SPEC.md §3 covers only
 * `state`/`tone`) — wiring a concrete lens treatment is left to whichever
 * component's board evidence calls for it first, same status as every
 * other bundle field with no board-driven paint yet.
 *
 * `size` (2026-09-11) is the cascading rung `diameter`/`textSize` resolve
 * through — see the `resolveField` calls in the body below and
 * `port.presets.ts`'s own `PORT_PRESETS`.
 */
export function Port({
  name = "",
  type = "",
  defaultValue = "",
  direction = "input",
  edge = "left",
  // `size` DOES take a real JS default ("md", matching `state`/`tone`
  // above) — it is the cascade's SELECTOR, and a selector must always
  // have a value for a preset to match against. `diameter`/`textSize`
  // deliberately do NOT (mirroring `pill.tsx`'s own paint fields): an
  // explicit value is exactly what makes their OVERRIDE candidate present
  // in `resolveField` below, so a caller reaching past `size` reads
  // honestly instead of every Port carrying a materialized diameter/
  // textSize that silently outranks the preset layer.
  size = "md",
  diameter,
  textLayout,
  textSize,
  state = "empty",
  tone = "neutral",
  lens = "normal",
  lensBefore: _lensBefore = "",
  hidden = false,
  dimmed = false,
  hinting = false,
  reveal = "always",
  producers = 0,
  className,
  style,
  children,
  ...props
}: PortProps) {
  if (hidden) return null;
  const resolvedTextLayout = textLayout ?? inwardTextLayout(edge);
  const flexStyle: CSSProperties = {
    flexDirection: portFlexDirection(resolvedTextLayout),
    gap: portLabelGap(resolvedTextLayout),
  };
  // `size` cascades `diameter`/`textSize` together through the SAME
  // cascade the product inspector's trace panel reads — never a
  // hand-written `size === "xl" ? ... : ...` beside it (`pill.tsx`'s own
  // `resolveField` calls are the precedent). The subject carries the
  // RAW `diameter`/`textSize` (undefined unless a caller passed one), so
  // an explicit prop reaches past `size` honestly instead of always
  // winning by construction.
  const sizeSubject = { size, diameter, textSize };
  const diameterResolved = resolveField(DIAMETER_FIELD, sizeSubject, PORT_PRESETS)
    .resolved as PortSize;
  const textSizeResolved = resolveField(TEXT_SIZE_FIELD, sizeSubject, PORT_PRESETS)
    .resolved as PortTextSize;
  return (
    <div
      data-slot="port"
      data-state={state}
      data-direction={direction}
      data-edge={edge}
      data-size={size}
      data-text-layout={resolvedTextLayout}
      data-lens={lens !== "normal" ? lens : undefined}
      className={cn(
        "flex w-fit items-center",
        // `reveal: "onHover"` composes opacity, not colour, over whichever
        // resting state is in force — a visibility policy triggered by the
        // CONTAINER's view, kept deliberately apart from `dimmed`
        // (painted-but-faded, triggered by what the HOST is doing to this
        // port). Standing in for "the container is hovered" with
        // self-hover, since a standalone specimen has no outer container
        // to key off.
        REVEAL_CLASS[reveal],
        className,
      )}
      style={{ ...flexStyle, ...style }}
      {...props}
    >
      <PortDot
        state={state}
        tone={tone}
        diameter={diameterResolved}
        hidden={hidden}
        dimmed={dimmed}
        hinting={hinting}
        textLayout={resolvedTextLayout}
        producers={producers}
      />
      <PortLabel
        name={name}
        type={type}
        defaultValue={defaultValue}
        direction={direction}
        textSize={textSizeResolved}
        state={state}
        hidden={hidden}
      >
        {children}
      </PortLabel>
    </div>
  );
}
