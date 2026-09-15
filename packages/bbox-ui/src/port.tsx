"use client";

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
import { LABELED_PORT_FIELDS } from "./port.fields";
import { PORT_PRESETS } from "./port.presets";
import {
  PORT_DIAMETERS,
  PORT_HIT_PX,
  PORT_LABEL_GAP,
  PORT_RING_OVERHANG_PX,
  PORT_SECONDARY_SLOT_GAP_PX,
  PORT_STATE_RING_PX,
  PORT_SURFACE_RING_PX,
  PORT_TEXT_SIZES,
  defaultPortLabelLift,
  defaultSecondarySlotLayout,
  inwardTextLayout,
  isOffsetTextLayout,
  portFlexDirection,
  portLabelLift,
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
const DIAMETER_FIELD = LABELED_PORT_FIELDS.find((f) => f.id === "diameter")!;
const TEXT_SIZE_FIELD = LABELED_PORT_FIELDS.find((f) => f.id === "textSize")!;

/**
 * Fills in `textLayout`/`secondarySlotLayout` with their real AUTO defaults
 * (`inwardTextLayout(edge)`, `defaultSecondarySlotLayout`) when a subject
 * omits them, so the inspector's own trace resolves against what actually
 * PAINTS rather than each field's own static `defaultValue` (port.fields.ts:
 * "leftOffset", correct only when textLayout happens to be "right"). Same
 * shape as `pill.tsx`'s own `pillResolutionSubject` — imported by
 * `packages/panel/src/bench.tsx`'s Port registration exactly the way
 * Pill's already is, not reimplemented. Fixes the Secondary Slot dropdown
 * showing a stale "Left Offset" no matter what Label Slot Location is
 * actually set to — the real rendered badge position was always correct
 * (`PortDot`'s own `secondarySlotLayout ?? defaultSecondarySlotLayout(...)`
 * fallback), only the panel's DISPLAY of the unset field's value was wrong.
 */
export function portResolutionSubject(props: Record<string, unknown>): Record<string, unknown> {
  const edge = (props.edge as BlockSide | undefined) ?? "left";
  const textLayout = (props.textLayout as PortTextLayout | undefined) ?? inwardTextLayout(edge);
  // `labelOffset`'s FieldSpec must declare a static `defaultValue` (19, the
  // computed lift at Port's default "md" dot), but the real default scales
  // with the dot — so a Port at `lg` genuinely lifts 22px while the panel
  // would keep printing 19. Resolving it here is what makes the Expert
  // control read the number actually on screen.
  //
  // WHY `resolveField` and not `props.diameter ?? "md"`: `diameter` is
  // GOVERNED by the `size` cascade (PORT_PRESETS), so a Port carrying
  // `size: "lg"` and no explicit `diameter` renders an 18px dot while its
  // raw prop is undefined. Reading the prop directly reported the `md`
  // lift (19) for a port that was really lifting 22 — the exact
  // panel-disagrees-with-the-pixels bug this function exists to prevent,
  // reintroduced one field over. Resolving through the SAME call `Port`
  // itself makes is what keeps them in step.
  const diameterResolved = resolveField(
    DIAMETER_FIELD,
    // `size` takes Port's OWN real default when absent — it is the
    // cascade's selector, and a selector must have a value to match on.
    { size: props.size ?? "md", diameter: props.diameter, textSize: props.textSize },
    PORT_PRESETS,
  ).resolved as PortSize;
  const diameterPx =
    typeof diameterResolved === "number" ? diameterResolved : PORT_DIAMETERS[diameterResolved];
  return {
    ...props,
    textLayout,
    secondarySlotLayout:
      (props.secondarySlotLayout as SecondarySlotLayout | undefined) ?? defaultSecondarySlotLayout(textLayout),
    labelOffset:
      (props.labelOffset as number | undefined) ?? defaultPortLabelLift({ w: diameterPx, h: diameterPx }),
  };
}

/**
 * packages/bbox-ui/src/port.tsx — TWO primitives, split 2026-09-15 on
 * Zach's ruling: "I want to split into two primatives now. Port and
 * Labeled Port. Port is just the actual like Port geometry its self in
 * isolation. Labeled Port is composite of the port + the primary and
 * secondary slots, that we will then put things into thoose slots".
 *
 * `Port` — the geometry, alone. The disc, the 2px surface ring, the 3px
 * state ring, the lit core, the 40px hit halo. It knows nothing about
 * labels, slots, producers or which wall it sits on. This is what used to
 * be called `PortDot`; the rename is the point of the split, so there is
 * no `PortDot` alias — one name per thing.
 *
 * `LabeledPort` — the composite: a `Port` plus its two slots. This is
 * what `Port` used to be.
 *   - The LABEL slot (the "primary" slot) — `PortLabel`, a real
 *     single-line `CodeField`, positioned by `textLayout`
 *     (`./port.layout.ts`'s six-member `PortTextLayout`, auto-defaulting
 *     via `inwardTextLayout(edge)`), lifted clear of a trace wire by
 *     `portLabelLift` when the layout is one of the two Offset members.
 *     A host owning its own slot model passes `labelSlot` instead and
 *     the built-in field steps aside entirely.
 *   - The SECONDARY slot — generic `ReactNode` hugging one corner of the
 *     dot's own box, positioned by `secondarySlotLayout`, auto-defaulting
 *     to the side opposite the label. `producers >= 2` composes a
 *     `PortCountBadge` as its fallback content for prop-only hosts.
 *
 * WHY the secondary slot moved OUT of the geometry and into the composite
 * (this split): it is not geometry. The dot is a shape; where a badge
 * hangs off it is an arrangement fact, and arrangement is exactly what
 * `LabeledPort` is for. The composite wraps the `Port` in a box of the
 * dot's own dimensions when — and only when — there is slot content to
 * carry, so the slot's offsets resolve against the same rectangle they
 * always did and the pixels do not move.
 *
 * ANATOMY (PORT-SPEC.md §2.1): `Port` and `PortLabel` are SIBLINGS, never
 * parent/child — a real host positions both absolutely from the
 * *container's* layout at a shared anchor, and needs the dot to win
 * z-order/hit-arbitration against its own label independently.
 * `LabeledPort` is the flex-row PAIRING of those two siblings for a
 * standalone specimen; a host placing a real port on a real block wall
 * instead uses `Port`/`PortLabel` directly, positioned via
 * `./port.layout.ts`'s `portDotPlacement`/`portLabelPlacement` — never
 * nested one inside the other. This is T0's own anatomy bug
 * (PORT-SPEC.md §0.2): a single flex parent could not reproduce that
 * independence.
 *
 * WHY the `portDot*` helpers keep their names (`portDotClass`,
 * `portDotStyle`, `PortDotPaintInput`, `PortDotBox`): "dot" now names the
 * disc INSIDE `Port` rather than a component of its own, and it is still
 * the right word for the thing they paint. Renaming them to `portClass`/
 * `portStyle` would have churned every adapter and test for a vaguer word.
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

export interface PortProps extends ComponentProps<"span"> {
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
export function Port({
  state = "empty",
  tone = "neutral",
  diameter = "md",
  hidden = false,
  dimmed = false,
  hinting = false,
  className,
  style,
  ...props
}: PortProps) {
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

export interface LabeledPortProps extends ComponentProps<"div"> {
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
   * The author's own tuned lift for a Right/Left Offset label, in px,
   * measured from the dot's centre line to the label's bottom edge — the
   * clearance a trace wire passes through. Omit for the computed default
   * (`defaultPortLabelLift`, port.layout.ts). Ignored by every non-offset
   * layout, which has no lift to tune.
   */
  labelOffset?: number;
  /**
   * Content for the LABEL position, supplied by a host that owns its own
   * slot model (the /create bench's `ctx.slots.label`). When present it
   * REPLACES the built-in `PortLabel`/`CodeField` — same position, same
   * lift — so the label's text can be an ordinary, deletable member of a
   * real slot rather than a string this component owns (Zach, 2026-09-15:
   * "even the text is just a member in the label slot that can be
   * deleted"). Absent means the built-in field, which is what every
   * prop-only host still uses: the tldraw/React Flow adapters, blockFace,
   * and Storybook all compose `Port` from flat props and have no instance
   * tree to build a slot out of.
   */
  labelSlot?: ReactNode;
  /**
   * Content for the SECONDARY position, same contract as `labelSlot`.
   * Present — INCLUDING empty — beats the built-in `producers >= 2` count
   * badge, which is the fallback for prop-only hosts only.
   */
  secondarySlot?: ReactNode;
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
export function LabeledPort({
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
  labelOffset,
  labelSlot,
  secondarySlot,
  secondarySlotLayout,
  disabled = false,
  onLabelWrite,
  placeholder,
  className,
  style,
  children = "",
  ...props
}: LabeledPortProps) {
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
  // The label's lift for an "Offset" layout, 0 otherwise — see
  // `portLabelLift`'s own WHY (port.layout.ts). Both branches below need
  // it, so it is resolved once against the SAME dot box either would use.
  const labelLift = portLabelLift(resolvedTextLayout, { w: diameterPx, h: diameterPx }, labelOffset);
  // WHY this gates on the LAYOUT and not on `labelLift > 0`: a tuned
  // `labelOffset: 0` is a legitimate lift — "put the label's bottom edge
  // exactly on the wire" — and the field's own `min: 0` allows it. Gating
  // on the VALUE made the two paths disagree at that one endpoint: the
  // anchored path emitted `bottom: calc(50% + 0px)` (bottom edge on the
  // centre line) while the flex path fell back to `items-center` and
  // centred the label ON the dot, roughly half a label-height lower.
  // `isOffsetTextLayout` is the honest question — does this layout HAVE a
  // lift — and it answers the same for both paths at every value.
  const lifted = isOffsetTextLayout(resolvedTextLayout);
  // A host-given `secondarySlot` WINS outright — INCLUDING when it is
  // empty, which is what makes the count badge deletable (Zach,
  // 2026-09-15: "yes the producer badge can be delted it just a member of
  // the slot"). The `producers >= 2` badge is only the fallback for a
  // prop-only host that never supplied a slot at all (the adapters,
  // blockFace, Storybook), so `undefined` and "the slot exists and is
  // empty" stay distinguishable — a `??` here would have resurrected the
  // badge the moment someone emptied it.
  //
  // WHY hoisted out of the JSX attribute it used to live in: written
  // inline it was a nested ternary whose middle arm is a self-closing
  // element, and SWC reads the `/>` that follows a `?` as the start of a
  // regex literal ("Unterminated regexp literal", whole page 500).
  // TypeScript's own parser accepts it, so `tsc` stayed green and only
  // running the real app caught it.
  // Which corner the secondary slot hugs — the AUTO default is the side
  // opposite wherever the label is flowing. Resolved HERE now that the
  // composite owns the slot; the geometry primitive has no idea a label
  // or a second slot exists.
  const resolvedSecondaryLayout = secondarySlotLayout ?? defaultSecondarySlotLayout(resolvedTextLayout);
  const resolvedSecondarySlot: ReactNode =
    secondarySlot !== undefined
      ? secondarySlot
      : producers >= 2
        ? <PortCountBadge count={producers} />
        : undefined;
  // The label POSITION's geometry, resolved once and worn by whichever
  // content occupies it — the built-in `PortLabel` or a host's own
  // `labelSlot`. Sharing the one object is what stops a slot from drifting
  // out of alignment with the CodeField it replaces.
  const labelSlotStyle: CSSProperties | undefined = anchored
    ? { ...portLabelPlacement(resolvedTextLayout, { w: diameterPx, h: diameterPx }, 0, labelOffset), whiteSpace: "nowrap" }
    : // The flex row's half of the lift. Both the dot and the label are
      // bottom-anchored (`alignItems: "flex-end"` below), so the dot's
      // centre line sits `diameterPx / 2` above the row's bottom and the
      // label's bottom sits `marginBottom` above it — making their
      // difference exactly `labelLift`, the same quantity
      // `portLabelPlacement` puts between them in the anchored path.
      // `undefined` (not 0) when unlifted, so an ordinary layout emits no
      // margin at all.
      lifted
      ? { marginBottom: diameterPx / 2 + labelLift }
      : undefined;
  const rootStyle: CSSProperties = anchored
    ? { position: "relative", width: diameterPx, height: diameterPx }
    : {
        flexDirection: portFlexDirection(resolvedTextLayout),
        // + PORT_RING_OVERHANG_PX: the gap is measured from the flex box's
        // edge, but the ring paints PAST it (box-shadow, not a border) — see
        // port.layout.ts's own WHY. Without this a flex-flowed specimen and
        // a wall-anchored label (which goes through `portLabelOut`) disagree
        // by the ring's overhang.
        gap: PORT_LABEL_GAP + PORT_RING_OVERHANG_PX,
        // WHY the whole row switches to `flex-end` for a lifted label
        // rather than the label alone taking an `alignSelf`: with the row
        // still centring, the dot would sit at the centre of a container
        // the taller label had already grown, so the gap between the dot's
        // centre line and the label's bottom would shrink as the label
        // grew — the one distance the lift exists to hold fixed. Anchoring
        // BOTH to the bottom edge makes the margin below the only thing
        // that sets it (see the label's own `marginBottom`).
        ...(lifted ? { alignItems: "flex-end" as const } : null),
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
      {/* The GEOMETRY, wrapped only when it has a secondary slot to carry.
          The wrapper is the dot's own box exactly (same width/height), so
          the slot's `right: 100%`-style offsets resolve against the same
          rectangle they did when `Port` still rendered the slot itself —
          the pixels do not move, only which component owns the concern.
          With no slot content there is no wrapper at all, so a bare
          LabeledPort's DOM is the dot and the label, nothing extra. */}
      {resolvedSecondarySlot != null ? (
        <span
          data-slot="port-geometry"
          className="relative inline-flex shrink-0"
          style={{ width: diameterPx, height: diameterPx }}
        >
          <Port
            state={state}
            tone={tone}
            diameter={diameterResolved}
            hidden={hidden}
            dimmed={dimmed}
            hinting={hinting}
          />
          <span
            data-slot="port-secondary-slot"
            className="pointer-events-none absolute"
            style={SECONDARY_SLOT_STYLE[resolvedSecondaryLayout]}
          >
            {resolvedSecondarySlot}
          </span>
        </span>
      ) : (
        <Port
          state={state}
          tone={tone}
          diameter={diameterResolved}
          hidden={hidden}
          dimmed={dimmed}
          hinting={hinting}
        />
      )}
      {labelSlot !== undefined ? (
        // A host-supplied label slot replaces the built-in CodeField
        // entirely, taking its position and its lift. Same
        // present-beats-absent rule as `secondarySlot` above, for the same
        // reason: an emptied label slot must stay empty.
        <span
          data-slot="port-label-slot"
          className={anchored ? "absolute" : undefined}
          style={labelSlotStyle}
        >
          {labelSlot}
        </span>
      ) : (
      <PortLabel
        direction={direction}
        textSize={textSizeResolved}
        hidden={hidden}
        className={anchored ? "absolute" : undefined}
        style={labelSlotStyle}
        disabled={disabled}
        onLabelWrite={onLabelWrite}
        placeholder={placeholder}
      >
        {children}
      </PortLabel>
      )}
    </div>
  );
}
