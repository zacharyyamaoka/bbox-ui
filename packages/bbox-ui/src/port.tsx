import type { ComponentProps, CSSProperties } from "react";

import { cn } from "./lib/utils";
import {
  STATE_TOKENS,
  TONE_TOKENS,
  type AppearanceState,
  type Lens,
  type Tone,
} from "./appearance";
import {
  PORT_DIAMETERS,
  PORT_HIT_PX,
  PORT_ROLE_LABELS,
  PORT_STATE_RING_PX,
  PORT_SURFACE_RING_PX,
  PORT_TEXT_SIZES,
  inwardTextLayout,
  portFlexDirection,
  portLabelGap,
  type BlockSide,
  type PortDecoration,
  type PortDirection,
  type PortReveal,
  type PortRole,
  type PortSize,
  type PortTextLayout,
  type PortTextSize,
} from "./port.layout";

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
  eligible?: boolean;
  hinting?: boolean;
  dragging?: boolean;
}

/**
 * Static half of the dot's class — sizing/shape/transition only. Every
 * COLOUR fact (the two-layer box-shadow ring, the fill) is dynamic per
 * state/tone and lives in `portDotStyle` instead: two concentric rings of
 * DIFFERENT, per-state token colours cannot be expressed as a static
 * Tailwind border class the way T0's single `border-2` could. Exported —
 * same reason T0 exported it — "so host adapters can paint the same dot
 * on elements they own" (e.g. a React Flow `Handle`).
 */
export function portDotClass(): string {
  return "relative box-border inline-flex shrink-0 rounded-full transition-transform duration-[50ms] ease-in-out motion-reduce:transition-none";
}

/**
 * The dot's paint, resolved from the cascade's two token lookups. `tone`
 * reaches past `state` by substituting its token for BOTH ring and fill
 * before either is read — exactly what `toneOverride` (appearance.ts)
 * means by "sugar that writes the override layer": Port has no separate
 * settable paint field for an override to land on (see `port.presets.ts`
 * for why `PORT_PRESETS` is empty), so this function IS that override,
 * computed directly rather than through `resolveFields` against a
 * governed property that doesn't exist.
 *
 * The interaction axis composes OVER the resting paint (PORT-SPEC.md
 * §1.3.2), never replacing it, with one deliberate exception: `hinting`
 * OVERRIDES the ring/fill to `--primary` regardless of `state` — a hint
 * previews the port BECOMING `wired`, so it wears `wired`'s ink even at
 * rest on `empty` (filling an `empty` port with its own ink would read as
 * "this port is broken", PORT-SPEC.md §1.3.2). `eligible`/`dragging`
 * instead ADD a third, wider halo layer without touching the resting
 * ring/fill.
 */
export function portDotStyle({
  state = "empty",
  tone = "neutral",
  eligible = false,
  hinting = false,
  dragging = false,
}: PortDotPaintInput): CSSProperties {
  const toneToken = TONE_TOKENS[tone];
  const { ring, fill } = STATE_TOKENS[state];
  const ringToken = hinting ? "primary" : (toneToken ?? ring);
  const fillToken = hinting ? "primary" : (toneToken ?? fill);

  const layers: string[] = [];
  if (ringToken != null) {
    const stateRingPx = hinting ? 4 : PORT_STATE_RING_PX;
    layers.push(`0 0 0 ${PORT_SURFACE_RING_PX}px var(--card)`);
    layers.push(`0 0 0 ${PORT_SURFACE_RING_PX + stateRingPx}px var(--${ringToken})`);
  }
  if (hinting) {
    layers.push("0 0 0 9px color-mix(in srgb, var(--primary) 38%, transparent)");
  } else {
    if (eligible) {
      layers.push("0 0 0 7px color-mix(in srgb, var(--primary) 26%, transparent)");
    }
    if (dragging) {
      layers.push("0 0 0 7px color-mix(in srgb, var(--ring) 30%, transparent)");
    }
  }

  return {
    boxShadow: layers.length > 0 ? layers.join(", ") : undefined,
    background: fillToken ? `var(--${fillToken})` : "transparent",
    transform: hinting ? "scale(1.18)" : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* The decoration ring, the semantic-role cue, the count badge —       */
/* small parts painted ON the dot (PORT-SPEC.md §2.1's ::after/spans). */
/* Geometry approximated from PORT-SPEC.md §1.1 #37-41 — the donor's    */
/* own measured boxes, re-expressed as real DOM (see the module doc).  */
/* ------------------------------------------------------------------ */

function PortDecorationRing({
  decoration,
}: {
  decoration: Exclude<PortDecoration, "none">;
}) {
  if (decoration === "mutates") {
    return (
      <span
        data-slot="port-dot-decoration"
        aria-hidden
        className="pointer-events-none absolute rounded-full"
        style={{
          inset: -6,
          border: "2.2px solid var(--bbox-warning)",
          clipPath: "inset(0 0 50% 0)",
          transform: "rotate(-45deg)",
        }}
      />
    );
  }
  // `variadic-*`: one collar, mutually exclusive with `mutates` by
  // construction (PORT-SPEC.md §2.2 — the donor paints both through a
  // single pseudo-element for exactly this reason). Positional reads as
  // the plain collar; keyword swaps the ink to warning; bundled dots the
  // stroke and lifts the opacity — PORT-SPEC.md §3f's donor table.
  const ink = decoration === "variadic-keyword" ? "var(--bbox-warning)" : "var(--bbox-success)";
  const borderStyle = decoration === "variadic-bundled" ? "dotted" : "solid";
  const opacity = decoration === "variadic-bundled" ? 0.78 : 0.5;
  return (
    <span
      data-slot="port-dot-decoration"
      aria-hidden
      className="pointer-events-none absolute rounded-full"
      style={{ inset: -6, border: `1px ${borderStyle} ${ink}`, opacity }}
    />
  );
}

function PortRoleCue({ role }: { role: Exclude<PortRole, "data"> }) {
  return (
    <span
      data-slot="port-role-cue"
      className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[3px] px-[3px] text-[8px] font-semibold leading-[11px] tracking-[0.01em] text-bbox-accent"
      style={{ top: -13, background: "var(--card)" }}
    >
      {PORT_ROLE_LABELS[role]}
    </span>
  );
}

function PortCountBadge({ count }: { count: number }) {
  // `right`, not `left`: the default composition (edge "left", textLayout
  // "right") flows the label OUT of the dot's right side, so a `left`
  // offset landed the badge almost exactly where the label text starts
  // (both ~diameter+gap px from the dot). Anchoring outward, on the
  // opposite side from the label, clears it in the common case; a host
  // that mirrors the whole row for an output port mirrors this with it.
  return (
    <span
      data-slot="port-count"
      className="pointer-events-none absolute flex min-w-[16px] items-center justify-center rounded-[7px] bg-foreground/10 px-[5px] text-[10px] font-semibold leading-[16px] text-foreground"
      style={{ height: 16, right: "100%", marginRight: 6, top: -10 }}
    >
      {count}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* PortDot — the disc + both rings + the hit halo + the small parts    */
/* above. Independently positionable (see the module doc).             */
/* ------------------------------------------------------------------ */

export interface PortDotProps extends Omit<ComponentProps<"span">, "role"> {
  state?: AppearanceState;
  tone?: Tone;
  diameter?: PortSize;
  role?: PortRole;
  decoration?: PortDecoration;
  /** Host-computed many-to-one count — never persisted. */
  producers?: number;
  eligible?: boolean;
  hinting?: boolean;
  dragging?: boolean;
}

/**
 * The dot alone: the disc, the 2px surface-coloured gap ring, the 3px
 * state ring, a 40px invisible hit halo (always centred on the dot
 * regardless of `diameter` — PORT-SPEC.md §1.1 #8), an optional
 * decoration ring, an optional semantic-role cue, and an optional
 * many-to-one count badge.
 *
 * `state === "hidden"` renders NOTHING (PORT-SPEC.md §1.3.1: "not painted
 * at all; the container counts it into `+N more`") — see
 * `PortHiddenSummary` below for that container-owned summary.
 */
export function PortDot({
  state = "empty",
  tone = "neutral",
  diameter = "md",
  role = "data",
  decoration = "none",
  producers = 0,
  eligible = false,
  hinting = false,
  dragging = false,
  className,
  style,
  ...props
}: PortDotProps) {
  if (state === "hidden") return null;
  const diameterPx = typeof diameter === "number" ? diameter : PORT_DIAMETERS[diameter];
  // A fixed 40px hit target regardless of the painted diameter — the
  // donor's own `inset: -14px` is this formula evaluated at diameter=12.
  const haloInset = (diameterPx - PORT_HIT_PX) / 2;
  return (
    <span
      data-slot="port-dot"
      data-state={state}
      data-tone={tone}
      data-diameter={diameter}
      data-role={role}
      data-decoration={decoration}
      data-eligible={eligible || undefined}
      data-hinting={hinting || undefined}
      data-dragging={dragging || undefined}
      className={cn(portDotClass(), className)}
      style={{
        width: diameterPx,
        height: diameterPx,
        ...portDotStyle({ state, tone, eligible, hinting, dragging }),
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
      {decoration !== "none" && <PortDecorationRing decoration={decoration} />}
      {role !== "data" && <PortRoleCue role={role} />}
      {producers >= 2 && <PortCountBadge count={producers} />}
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
  className,
  style,
  children,
  ...props
}: PortLabelProps) {
  // "no dot, no slot" (PORT-SPEC.md §1.3.1) — a hidden port's label
  // disappears along with its dot, whether the two are rendered together
  // (`Port`, which never even calls this far) or a host positions them
  // independently and passes `state` through for the chip-dimming check.
  if (state === "hidden") return null;
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

export interface PortProps extends Omit<ComponentProps<"div">, "role"> {
  name?: string;
  type?: string;
  defaultValue?: string;
  direction?: PortDirection;
  edge?: BlockSide;
  diameter?: PortSize;
  role?: PortRole;
  decoration?: PortDecoration;
  /** Sensible default is `inwardTextLayout(edge)` when omitted. */
  textLayout?: PortTextLayout;
  textSize?: PortTextSize;
  state?: AppearanceState;
  tone?: Tone;
  lens?: Lens;
  lensBefore?: string;
  /** Host-computed drag-time states — never persisted (PORT-SPEC.md
   * §1.3.2/§3d). */
  eligible?: boolean;
  hinting?: boolean;
  dragging?: boolean;
  reveal?: PortReveal;
  /** Host-computed many-to-one count — never persisted. */
  producers?: number;
}

/**
 * Port = the dot, the label, paired as flex siblings for a standalone
 * specimen (Storybook, the product inspector, a detached copy) — a real
 * host instead positions `PortDot`/`PortLabel` independently, at a
 * shared anchor, per `./port.layout.ts`. `state === "hidden"` renders
 * nothing at all, same as its `PortDot`/`PortLabel` parts.
 *
 * `lens`/`lensBefore` (the diff/lint overlay, `./appearance.ts`) are
 * accepted and exposed as `data-lens` for a host to style, but T1 does
 * not itself define lens paint tokens (docs/T1-SPEC.md §3 covers only
 * `state`/`tone`) — wiring a concrete lens treatment is left to whichever
 * component's board evidence calls for it first, same status as every
 * other bundle field with no board-driven paint yet.
 */
export function Port({
  name = "",
  type = "",
  defaultValue = "",
  direction = "input",
  edge = "left",
  diameter = "md",
  role = "data",
  decoration = "none",
  textLayout,
  textSize = "sm",
  state = "empty",
  tone = "neutral",
  lens = "normal",
  lensBefore: _lensBefore = "",
  eligible = false,
  hinting = false,
  dragging = false,
  reveal = "always",
  producers = 0,
  className,
  style,
  children,
  ...props
}: PortProps) {
  if (state === "hidden") return null;
  const resolvedTextLayout = textLayout ?? inwardTextLayout(edge);
  const flexStyle: CSSProperties = {
    flexDirection: portFlexDirection(resolvedTextLayout),
    gap: portLabelGap(resolvedTextLayout),
  };
  return (
    <div
      data-slot="port"
      data-state={state}
      data-direction={direction}
      data-edge={edge}
      data-text-layout={resolvedTextLayout}
      data-lens={lens !== "normal" ? lens : undefined}
      className={cn(
        "flex w-fit items-center",
        // `reveal: "onHover"` composes opacity, not colour, over
        // whichever resting state is in force (PORT-SPEC.md §1.3.2) — a
        // visibility policy triggered by the CONTAINER's view, kept
        // deliberately apart from `outOfFocus` (painted-but-dimmed,
        // triggered by what the port IS). Standing in for "the container
        // is hovered" with self-hover, since a standalone specimen has
        // no outer container to key off.
        reveal === "onHover" && "opacity-0 transition-opacity hover:opacity-100 focus-within:opacity-100",
        className,
      )}
      style={{ ...flexStyle, ...style }}
      {...props}
    >
      <PortDot
        state={state}
        tone={tone}
        diameter={diameter}
        role={role}
        decoration={decoration}
        producers={producers}
        eligible={eligible}
        hinting={hinting}
        dragging={dragging}
      />
      <PortLabel
        name={name}
        type={type}
        defaultValue={defaultValue}
        direction={direction}
        textSize={textSize}
        state={state}
      >
        {children}
      </PortLabel>
    </div>
  );
}
