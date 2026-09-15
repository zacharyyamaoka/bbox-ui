import type { ComponentProps, CSSProperties, ReactNode } from "react";
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
import { CodeField } from "./codeField";
import { PORT_FIELDS } from "./port.fields";
import { PORT_PRESETS } from "./port.presets";
import {
  PORT_DIAMETERS,
  PORT_HIT_PX,
  PORT_RING_OVERHANG_PX,
  PORT_SECONDARY_SLOT_GAP_PX,
  PORT_STATE_RING_PX,
  PORT_SURFACE_RING_PX,
  PORT_TEXT_SIZES,
  defaultSecondarySlotLayout,
  inwardTextLayout,
  portFlexDirection,
  portLabelGap,
  portLabelPlacement,
  type BlockSide,
  type PortDirection,
  type PortReveal,
  type PortSize,
  type PortSizeRung,
  type PortTextLayout,
  type PortTextSize,
  type SecondarySlotLayout,
} from "./port.layout";

/** The two fields `Port`'s own `size` rung governs — looked up once from
 * `PORT_FIELDS` (never re-typed) so `resolveField` runs the SAME
 * computation the product inspector's trace panel reads, exactly
 * `pill.tsx`'s own `PAINT_FIELD_BY_ID` pattern. */
const DIAMETER_FIELD = PORT_FIELDS.find((f) => f.id === "diameter")!;
const TEXT_SIZE_FIELD = PORT_FIELDS.find((f) => f.id === "textSize")!;

/**
 * packages/bbox-ui/src/port.tsx — the rebuilt Port (T1 Lane P), now with
 * TWO independently-positioned slots (the 2026-09-12 two-slot proposal).
 *
 * Anatomy (PORT-SPEC.md §2.1): `PortDot` and `PortLabel` are SIBLINGS,
 * never parent/child — the real app positions both absolutely from the
 * *container's* layout at a shared anchor, and needs the dot to win
 * z-order/hit-arbitration against its own label independently. `Port`
 * below is the flex-row PAIRING of those two siblings for a standalone
 * specimen; a host placing a real port on a real block wall instead uses
 * `PortDot`/`PortLabel` directly, positioned via `./port.layout.ts`'s
 * `portDotPlacement`/`portLabelPlacement` — never nested one inside the
 * other. This is T0's own anatomy bug (PORT-SPEC.md §0.2): a single flex
 * parent could not reproduce that independence. The SECOND slot (below)
 * does NOT reopen that bug: it hugs `PortDot`'s own box exactly the way
 * the old hardcoded count-badge overlay always did — a decoration OF the
 * dot, not a second independently-flowed sibling like the label.
 *
 * THE TWO SLOTS:
 * - The LABEL slot (`PortLabel`) — a real single-line `CodeField` (ported
 *   from `claude/code-field`, see `./codeField.tsx`'s own doc), positioned
 *   by `textLayout` (`./port.layout.ts`'s `PortTextLayout`, now six values:
 *   `top | bot | right | left | rightOffset | leftOffset`, auto-defaulting
 *   via `inwardTextLayout(edge)` when omitted — unchanged from before).
 *   REPLACES the old three-span `PortName`/`PortType`/`PortDefaultChip`
 *   rendering built from separate `name`/`type`/`defaultValue` props —
 *   those props are GONE; `children` (a plain string) is now the field's
 *   whole `value`, matching the "a port is one line of code" ruling
 *   (`get_aruco: ArucoSrv`) and every real caller already in this
 *   workspace (host adapters, docs examples, the port-inspector demo),
 *   which already passed a single composed string as `children` and never
 *   touched `name`/`type`/`defaultValue` at all.
 * - The SECONDARY slot (`PortDot`'s new `secondarySlot` prop) — generic
 *   `ReactNode`, positioned by `secondarySlotLayout` (`SecondarySlotLayout`,
 *   `./port.layout.ts`: `leftOffset | rightOffset | topOffset | botOffset`,
 *   auto-defaulting to the side opposite the label via
 *   `defaultSecondarySlotLayout`). REPLACES the hardcoded, producer-count-
 *   only `PortCountBadge` overlay — `Port` below still composes that same
 *   badge by default (>= 2 producers, unchanged threshold), but as content
 *   it HANDS to the now-generic slot rather than logic `PortDot` itself
 *   runs. A consumer can pass anything else instead (a role cue, a status
 *   dot) without `PortDot` knowing what it's rendering.
 *
 * PORT COLOUR COMES FROM STATE, NOT TYPE (Zach, 2026-09-10 ruling — see
 * docs/T1-SPEC.md and PORT-SPEC.md's standing amendment). `portDotStyle`
 * below reads colour from `STATE_TOKENS`/`TONE_TOKENS` (./appearance.ts) —
 * the SAME two lookups the cascade's worked example (docs/T1-SPEC.md §1.4)
 * illustrates.
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

  // WHY conditionally-built, never `key: cond ? … : undefined`: a caller
  // that spread-merges this bag over its own positioning style (the React
  // Flow adapter merges dot paint + `PORT_DOT_CENTER_TRANSFORM` into one
  // Handle style) had its centering transform DELETED by a literal
  // `transform: undefined` key winning the spread — React Flow's own
  // stylesheet (`.react-flow__handle-right { transform: translate(50%,-50%) }`)
  // then took over, measured live as +12px outward drift of every
  // right-wall handle at zoom 1. Only emit a key when it actually paints.
  const style: CSSProperties = {};
  if (layers.length > 0) style.boxShadow = layers.join(", ");
  // The disc's resting paint is OPAQUE, never "transparent": a wall-mounted
  // dot straddles the block's border, and a transparent interior let the
  // wall line show through the middle of a hollow (`empty`/`wired`) dot.
  // SystemSketch's reference circle is `fill={surface}` for exactly this
  // reason; `var(--card)` is the same token the 2px surface ring already
  // uses, so ring and disc read as one punch-out rather than a window.
  style.background = fillColor ?? "var(--card)";
  if (dimmed && !hinting) style.opacity = 0.45;
  if (hinting) style.transform = "scale(1.18)";
  return style;
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
/* The secondary slot — generic content hugging a corner of the dot's  */
/* own box (two-slot proposal, 2026-09-12). `role`/`decoration` (the   */
/* old semantic-role cue and mutates/variadic ring) were removed       */
/* 2026-09-12 (port.layout.ts's own WHY, above their old import site). */
/* ------------------------------------------------------------------ */

// WHY total lookups and not ternaries: a ternary has a fall-through, so
// widening either union ships a live panel segment that renders exactly like
// the default, typecheck clean and every test green. A Record over the real
// union is a compile error until someone says what the new member looks like.
const REVEAL_CLASS: Record<PortReveal, string> = {
  always: "",
  onHover: "opacity-0 transition-opacity hover:opacity-100 focus-within:opacity-100",
};

/** One offset per `SecondarySlotLayout` corner, hugging the dot at
 * `PORT_SECONDARY_SLOT_GAP_PX` clearance — the exact geometry the old
 * hardcoded `PortCountBadge` overlay always used, now addressable by
 * `secondarySlotLayout` independently of the label's own flow side rather
 * than derived from it every time. The gap is measured from the dot's
 * PAINTED ring, not its layout box, same as `portLabelOut`/`BADGE_OFFSET_PX`
 * used to (see port.layout.ts's own WHY on `PORT_RING_OVERHANG_PX`) —
 * otherwise the badge sits `PORT_RING_OVERHANG_PX` closer to the ring than
 * the label does. */
const SECONDARY_SLOT_OFFSET_PX = PORT_RING_OVERHANG_PX + PORT_SECONDARY_SLOT_GAP_PX;
const SECONDARY_SLOT_STYLE: Record<SecondarySlotLayout, CSSProperties> = {
  leftOffset: {
    right: "100%",
    marginRight: SECONDARY_SLOT_OFFSET_PX,
    top: "50%",
    transform: "translateY(-50%)",
  },
  rightOffset: {
    left: "100%",
    marginLeft: SECONDARY_SLOT_OFFSET_PX,
    top: "50%",
    transform: "translateY(-50%)",
  },
  topOffset: {
    bottom: "100%",
    marginBottom: SECONDARY_SLOT_OFFSET_PX,
    left: "50%",
    transform: "translateX(-50%)",
  },
  botOffset: {
    top: "100%",
    marginTop: SECONDARY_SLOT_OFFSET_PX,
    left: "50%",
    transform: "translateX(-50%)",
  },
};

/**
 * The many-to-one producer count — `Port`'s own default secondary-slot
 * content (`producers >= 2`, the unchanged threshold from before this
 * change). Kept as an exported, documented EXAMPLE of what the now-generic
 * secondary slot can hold: `PortDot` itself does not know this component
 * exists, does no `producers` counting, and does not position it — a
 * consumer composes something else in its place (a role cue, a status
 * dot) the exact same way, by passing different `secondarySlot` content.
 */
export function PortCountBadge({ count }: { count: number }) {
  return (
    <span
      data-slot="port-count"
      className="flex min-w-[16px] items-center justify-center rounded-[7px] bg-foreground/10 px-[5px] text-[10px] font-semibold leading-[16px] text-foreground"
      style={{ height: 16 }}
    >
      {count}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* PortDot — the disc + both rings + the lit core + the hit halo +     */
/* the generic secondary slot. Independently positionable (module doc). */
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
  /** Which way the LABEL slot flows — only consulted to compute
   * `secondarySlotLayout`'s AUTO default (the free side opposite the
   * label, `defaultSecondarySlotLayout`); purely presentational, never
   * persisted on the dot itself (a host's real layout owns this fact). */
  textLayout?: PortTextLayout;
  /**
   * Generic content for the dot's SECOND slot — a decoration hugging one
   * corner of the dot's own box (the two-slot proposal's "Secondary Slot
   * Placement"). `null`/`undefined` renders nothing. REPLACES the old
   * hardcoded, producers-only `PortCountBadge` overlay — see this file's
   * module doc and `PortCountBadge`'s own doc for what still supplies it
   * by default (`Port`, below).
   */
  secondarySlot?: ReactNode;
  /** Where `secondarySlot` sits. Omit for the AUTO default — the corner
   * opposite wherever the label (`textLayout`) is flowing. */
  secondarySlotLayout?: SecondarySlotLayout;
}

/**
 * The dot alone: the disc, the 2px surface-coloured gap ring, the 3px
 * state ring, the small lit "core" some states paint on top
 * (`portCoreStyle`), a 40px invisible hit halo (always centred on the dot
 * regardless of `diameter`), and the optional generic secondary slot.
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
  secondarySlot,
  secondarySlotLayout,
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
  const resolvedSecondaryLayout = secondarySlotLayout ?? defaultSecondarySlotLayout(textLayout);
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
      {secondarySlot != null && (
        <span
          data-slot="port-secondary-slot"
          className="pointer-events-none absolute"
          style={SECONDARY_SLOT_STYLE[resolvedSecondaryLayout]}
        >
          {secondarySlot}
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* PortLabel — the label slot, now a real single-line CodeField.       */
/* `PortName`/`PortType`/`PortDefaultChip` (the old three-span layout)  */
/* are REMOVED here — confirmed zero usage outside this file before    */
/* removal (recon, 2026-09-12), same standard `role`/`decoration`'s     */
/* removal above was held to.                                          */
/* ------------------------------------------------------------------ */

/** Stable no-op so an unwired `PortLabel` (no `onLabelWrite`) doesn't
 * allocate a fresh throwaway function every render — `Port` is
 * presentational ("props in, DOM out"); a field with nowhere to write
 * still has to satisfy `CodeField`'s required `onWrite`. */
function noopWrite() {}

export interface PortLabelProps extends ComponentProps<"span"> {
  /**
   * The label's ENTIRE content, as one line — "a port is one line of
   * code" (`get_aruco: ArucoSrv`). REPLACES the old separate `name`/
   * `type`/`defaultValue` props, folded into this single string rather
   * than kept apart: no parser anywhere in this workspace splits a
   * composed `name: Type = default` line back into three fields on edit,
   * and every REAL caller already in this workspace (the tldraw/React
   * Flow adapters, the docs examples, the port-inspector demo) already
   * passed one composed string as `children` and never touched
   * `name`/`type`/`defaultValue` at all — this is that same shape, now
   * also the thing `CodeField` actually edits.
   */
  children?: string;
  direction?: PortDirection;
  textSize?: PortTextSize;
  /** Same fact as `PortDot`'s own `hidden` — see its docblock. */
  hidden?: boolean;
  /** No caret, no edits — a read-only port. */
  disabled?: boolean;
  /**
   * Fired on every keystroke (`CodeField`'s own live `onWrite`). Omit for
   * a label that shows `children` but never persists an edit anywhere —
   * `Port` does no editing state of its own (same category as `dimmed`/
   * `hinting`: host-set/host-observed, never internal). A host that wants
   * typed text to stick wires this to whatever updates its own store; one
   * left unwired simply reverts to `children` the moment the field blurs
   * (`CodeField`'s own controlled-value contract), same as an `<input>`
   * with no `onChange`.
   */
  onLabelWrite?(value: string): void;
  /** Shown when `children` is empty. */
  placeholder?: string;
}

/**
 * The label slot: a real single-line `CodeField` (`./codeField.tsx`,
 * ported from `claude/code-field`) bound to `children` as its whole
 * `value` — grammar-free (a plain code text box; wiring the Python
 * `name: Type = default` grammar/autocomplete is explicitly out of scope
 * for this change, see this file's module doc). Independently
 * positionable from `PortDot` — see the module doc at the top of this
 * file.
 *
 * `direction` no longer reorders the label's CONTENT — there is nothing
 * left TO reorder once it's one free-typed string, unlike the old
 * direction-mirrored name/type/chip span order. It still sets the
 * field's text alignment, so the caret-adjacent edge still visually hugs
 * the dot on whichever side the port sits, the same visual intent the
 * old mirroring served.
 */
export function PortLabel({
  children = "",
  direction = "input",
  textSize = "sm",
  hidden = false,
  disabled = false,
  onLabelWrite,
  placeholder,
  className,
  style,
  ...props
}: PortLabelProps) {
  // "no dot, no slot" — a hidden port's label disappears along with its
  // dot, whether the two are rendered together (`Port`, which never even
  // calls this far) or a host positions them independently and passes
  // `hidden` through.
  if (hidden) return null;
  return (
    <span
      data-slot="port-label"
      data-direction={direction}
      className={cn("flex min-w-0 items-center overflow-hidden", className)}
      style={style}
      {...props}
    >
      <CodeField
        value={children}
        onWrite={onLabelWrite ?? noopWrite}
        disabled={disabled}
        placeholder={placeholder}
        // Text hugs the dot on the side the label actually flows toward —
        // `right`/`rightOffset` grow away to the right (dot sits at the
        // field's LEFT, so left-align), `left`/`leftOffset` the mirror.
        // `direction` still carries this intent (see the docblock above)
        // now that content order itself has nothing left to mirror.
        align={direction === "output" ? "right" : "left"}
        // `textSize` scales the field's own font (codeField.css inherits
        // it from this wrapper — see its own WHY) so a Port at `lg`/`xl`
        // doesn't stay pinned to the field's compact default size.
        style={{ fontSize: PORT_TEXT_SIZES[textSize] }}
        testId="port-label-field"
      />
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
  /** The label slot's ENTIRE content, one line — see `PortLabelProps`'s
   * own doc for why `name`/`type`/`defaultValue` (removed here) folded
   * into this single string instead of staying apart. */
  children?: string;
  direction?: PortDirection;
  edge?: BlockSide;
  /** The cascading rung a header (Bar/Flex) hands down — governs
   * `diameter`/`textSize` together via `PORT_PRESETS`. An explicit
   * `diameter`/`textSize` still wins (see `Port`'s own render). */
  size?: PortSizeRung;
  diameter?: PortSize;
  /** Sensible default is `inwardTextLayout(edge)` when omitted. Six
   * values now (`PortTextLayout`, port.layout.ts) — the two-slot
   * proposal's "Label Slot Placement": `top | bot | right | left |
   * rightOffset | leftOffset`. */
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
  /** Host-computed many-to-one count — never persisted. `>= 2` composes
   * `PortCountBadge` as the secondary slot's default content, unchanged
   * threshold from before the two-slot proposal. */
  producers?: number;
  /**
   * Host layout fact, never persisted (same status as `dimmed`) — do NOT
   * add this to `port.fields.ts`. When true, `Port` renders the dot as its
   * OWN box with the label placed out of flow at the shared wall anchor,
   * instead of the flex dot+label pairing — see this file's own module doc:
   * a wall-mounted port positions `PortDot`/`PortLabel` independently, never
   * as one flex box, because the flex pairing made a card's centering
   * depend on its label's width (measured live on the /create bench: the
   * `in` dot sat 2.5px inside the wall, `cfg` 3px outside, `out` 25.3px
   * outside, all three on the SAME wall). Anchored mode makes the port's
   * box the dot, so centering the card centers the dot.
   */
  anchored?: boolean;
  /** Where that default `PortCountBadge` (or, with `producers < 2`,
   * nothing) sits. Omit for the AUTO default — the corner opposite
   * wherever the label is actually flowing (`defaultSecondarySlotLayout`,
   * port.layout.ts). */
  secondarySlotLayout?: SecondarySlotLayout;
  /** No caret, no edits on the label's `CodeField` — see `PortLabelProps`. */
  disabled?: boolean;
  /** Fired on every keystroke of the label's `CodeField` — see
   * `PortLabelProps.onLabelWrite`'s own doc for what an unwired field does. */
  onLabelWrite?(value: string): void;
  /** Shown in the label's `CodeField` when `children` is empty. */
  placeholder?: string;
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
  anchored = false,
  secondarySlotLayout,
  disabled = false,
  onLabelWrite,
  placeholder,
  className,
  style,
  children = "",
  ...props
}: PortProps) {
  if (hidden) return null;
  const resolvedTextLayout = textLayout ?? inwardTextLayout(edge);
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
  const diameterPx =
    typeof diameterResolved === "number" ? diameterResolved : PORT_DIAMETERS[diameterResolved];
  // `anchored`: the root box IS the dot (no flex pairing) — see PortProps's
  // own doc for why. The label goes out of flow, placed by the same
  // `portLabelPlacement` geometry every wall surface already uses.
  const rootStyle: CSSProperties = anchored
    ? { position: "relative", width: diameterPx, height: diameterPx }
    : {
        flexDirection: portFlexDirection(resolvedTextLayout),
        // + PORT_RING_OVERHANG_PX: the gap is measured from the flex box's
        // edge, but the ring paints PAST it (box-shadow, not a border) — see
        // port.layout.ts's own WHY. Without this a flex-flowed specimen and
        // a wall-anchored label (which goes through `portLabelOut`) disagree
        // by the ring's overhang.
        gap: portLabelGap(resolvedTextLayout) + PORT_RING_OVERHANG_PX,
      };
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
      style={{ ...rootStyle, ...style }}
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
        // The count badge is Port's own DEFAULT secondary-slot content
        // (unchanged >= 2 threshold) — PortDot itself no longer knows
        // what "producers" means, see this file's module doc.
        secondarySlot={producers >= 2 ? <PortCountBadge count={producers} /> : undefined}
        secondarySlotLayout={secondarySlotLayout}
      />
      <PortLabel
        direction={direction}
        textSize={textSizeResolved}
        hidden={hidden}
        className={anchored ? "absolute" : undefined}
        style={
          anchored
            ? { ...portLabelPlacement(resolvedTextLayout, { w: diameterPx, h: diameterPx }), whiteSpace: "nowrap" }
            : undefined
        }
        disabled={disabled}
        onLabelWrite={onLabelWrite}
        placeholder={placeholder}
      >
        {children}
      </PortLabel>
    </div>
  );
}
