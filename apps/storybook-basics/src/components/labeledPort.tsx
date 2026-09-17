"use client";

// src/components/labeledPort.tsx — ported by value from
// packages/bbox-ui/src/port.tsx's `LabeledPort` (docs/PORT-EDGE-PLAN.md
// Phase 2): the composite of `Port` (./port.tsx) plus its two independently
// positioned slots, both absolutely positioned off the dot's own box (see
// this file's B4 note below).
//
// What ported OVER verbatim (pure geometry, no schema): the `??`-fallback
// chain (`labelOrigin ?? TEXT_LAYOUT_AS_PLACEMENT[textLayout].origin`) — in
// plain props this chain alone IS the preset behaviour, no schema layer
// needed underneath it — and `slotPlacementStyle` itself (./port.layout.ts),
// now driving BOTH slots (originally just the secondary one; see B4 below).
//
// What's LEFT BEHIND (docs/PORT-EDGE-PLAN.md's own list — none of it is
// geometry): the `size` cascade rung (D4), `tone`/`lens`/`reveal`/
// `producers` (D3 — no `PortCountBadge` fallback; an unset secondary slot
// renders nothing), and `anchored` (wall geometry for a real Block — a
// Storybook specimen is exactly the standalone flex pairing this file keeps).
//
// What's REBUILT (D1, superseded 2026-09-16): the label slot's built-in
// fill is no longer a `CodeField` port — Zach: "I have another agent that is
// starting to port over the codefield... for now you can just use plain text
// as a placeholder... integrate correctly with the codefield once that work
// is done." `DefaultPortLabel` below wraps this app's own `EditableText`
// instead. The SLOT BOUNDARY (`labelSlot`, present-beats-absent) is what
// Phase 2 actually proves — swapping the fill for a real CodeField later is
// one import in this file, not a rewrite of the placement math below.

import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { cn } from "../lib/utils";
import { EditableText } from "./editableText";
import { Port, type PortState } from "./port";
import {
  PORT_DIAMETERS,
  PORT_LABEL_GAP,
  PORT_SECONDARY_SLOT_GAP_PX,
  slotPlacementStyle,
  SECONDARY_LAYOUT_AS_ORIGIN,
  TEXT_LAYOUT_AS_PLACEMENT,
  defaultSecondarySlotLayout,
  inwardTextLayout,
  type BlockSide,
  type PortDirection,
  type PortSize,
  type PortTextLayout,
  type PortTextSize,
  type SecondarySlotLayout,
  type SlotOrigin,
  type SlotAlign,
  type SlotPlacement,
} from "./port.layout";

/* ------------------------------------------------------------------ */
/* DefaultPortLabel — LabeledPort's built-in label fill (D1, 2026-09-16: */
/* plain text via EditableText, not CodeField). A host that wants a     */
/* different editor passes `labelSlot` instead — see LabeledPortProps.   */
/* ------------------------------------------------------------------ */

/**
 * Click-to-edit, same loop `EditableText.stories.tsx`'s own
 * `ControlledEditableText` demonstrates: local `value` mirrors `children`
 * whenever not mid-edit (so an unwired label simply reflects whatever the
 * host passes), and `onLabelWrite` fires live on every keystroke — the same
 * "fired on every keystroke" contract the donor's `CodeField`-backed
 * `PortLabel` documented for `onLabelWrite`. Escape reverts to the value
 * captured at the moment editing started.
 */
function DefaultPortLabel({
  children = "",
  direction = "input",
  textSize = "sm",
  disabled = false,
  onLabelWrite,
  placeholder,
  className,
  style,
}: {
  children?: string;
  direction?: PortDirection;
  textSize?: PortTextSize;
  disabled?: boolean;
  onLabelWrite?(value: string): void;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(children);
  const snapshotRef = useRef(children);

  // Mirrors the host's `children` whenever this field isn't mid-edit — the
  // same "reverts to children" contract the donor's unwired PortLabel had.
  useEffect(() => {
    if (!editing) setValue(children);
  }, [children, editing]);

  return (
    // WHY `overflow-clip [overflow-clip-margin:4px]`, not `overflow-hidden`
    // (follow-up feedback item 4, same shape flagged in bar.tsx's own
    // `cellClass`): `EditableText`'s focus ring is a real CSS `outline`,
    // which paints OUTSIDE the input's border box — measured live, this
    // span's rect and the editing `<input>`'s rect are IDENTICAL on all
    // four sides, so a plain `overflow-hidden` here clips the ring away
    // entirely (confirmed: the resting `EditableLabel` story showed no
    // ring at all while editing). `overflow-clip-margin` is the CSS-spec
    // native fix — it lets painting spill a few px past the box while
    // still clipping genuine content overflow (a long label still
    // ellipsizes via `EditableText`'s own truncation, this margin doesn't
    // touch that).
    <span data-slot="port-label" data-direction={direction} className={cn("flex min-w-0 items-center overflow-clip [overflow-clip-margin:4px]", className)} style={style}>
      <EditableText
        size={textSize}
        editing={editing && !disabled}
        placeholder={placeholder}
        // Text hugs the dot on the side the label actually flows toward —
        // same intent `direction` carried on the donor's CodeField.
        justify={direction === "output" ? "right" : "left"}
        onChange={(next) => {
          setValue(next);
          onLabelWrite?.(next);
        }}
        onCommit={() => setEditing(false)}
        onCancel={() => {
          setValue(snapshotRef.current);
          onLabelWrite?.(snapshotRef.current);
          setEditing(false);
        }}
        onClick={() => {
          if (disabled) return;
          snapshotRef.current = value;
          setEditing(true);
        }}
      >
        {value}
      </EditableText>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* LabeledPort — Port + the label slot + the secondary slot, paired as */
/* flex siblings for a standalone specimen.                            */
/* ------------------------------------------------------------------ */

export interface LabeledPortProps extends ComponentProps<"div"> {
  /** The label slot's entire content, one line. */
  children?: string;
  direction?: PortDirection;
  edge?: BlockSide;
  diameter?: PortSize;
  /** Sensible default is `inwardTextLayout(edge)` when omitted. */
  textLayout?: PortTextLayout;
  textSize?: PortTextSize;
  state?: PortState;
  hidden?: boolean;
  dimmed?: boolean;
  hinting?: boolean;
  /**
   * The label slot's placement, reaching PAST `textLayout` (the preset over
   * exactly these three). Omit any of them and the preset decides; set one
   * and it wins. `offsetX` is + away from the dot along the origin's own
   * axis, `offsetY` is + DOWN, and both may be negative.
   */
  labelOrigin?: SlotOrigin;
  labelAlign?: SlotAlign;
  labelOffsetX?: number;
  labelOffsetY?: number;
  /** The secondary slot's placement — the same three controls over the
   *  same `SlotOrigin` type, with `secondarySlotLayout` as its preset. */
  secondaryOrigin?: SlotOrigin;
  secondaryAlign?: SlotAlign;
  secondaryOffsetX?: number;
  secondaryOffsetY?: number;
  /**
   * Content for the LABEL position. Present — INCLUDING empty — replaces
   * the built-in `DefaultPortLabel` entirely, same position, same lift.
   * Absent means the built-in field. This is the seam Phase 4's multi-line
   * lane editor (and, later, a real CodeField) attaches through: swap what
   * fills this slot without touching `LabeledPort`'s placement math at all.
   */
  labelSlot?: ReactNode;
  /** Content for the SECONDARY position, same present-beats-absent
   *  contract as `labelSlot`. There is no `producers`-count fallback here
   *  (D3) — an unset secondary slot renders nothing, full stop. */
  secondarySlot?: ReactNode;
  /** Where an explicit `secondarySlot` sits. Omit for the AUTO default —
   * the corner opposite wherever the label is actually flowing. */
  secondarySlotLayout?: SecondarySlotLayout;
  /** No caret, no edits on the label's built-in field. */
  disabled?: boolean;
  /** Fired on every keystroke of the built-in label field. */
  onLabelWrite?(value: string): void;
  /** Shown in the built-in label field when `children` is empty. */
  placeholder?: string;
}

/**
 * The flex-row pairing of `Port` + its two slots, for a standalone specimen
 * — a real host mounting a port on a real block wall would position the
 * dot and the label independently instead (the donor package's `anchored`
 * mode, deliberately not ported here — see this file's module doc).
 */
export function LabeledPort({
  direction = "input",
  edge = "left",
  diameter = "md",
  textLayout,
  textSize = "sm",
  state = "empty",
  hidden = false,
  dimmed = false,
  hinting = false,
  labelOrigin,
  labelAlign,
  labelOffsetX,
  labelOffsetY,
  secondaryOrigin,
  secondaryAlign,
  secondaryOffsetX,
  secondaryOffsetY,
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
  const diameterPx = typeof diameter === "number" ? diameter : PORT_DIAMETERS[diameter];
  const resolvedSecondaryLayout = secondarySlotLayout ?? defaultSecondarySlotLayout(resolvedTextLayout);

  // The named layout is the PRESET; an explicit origin/offset reaches past
  // it — the unified (origin, x, y) model every host and every saved shape
  // ultimately speaks (see port.layout.ts's own module doc).
  const textLayoutPreset = TEXT_LAYOUT_AS_PLACEMENT[resolvedTextLayout];
  const labelPlacement: SlotPlacement = {
    origin: labelOrigin ?? textLayoutPreset.origin,
    align: labelAlign ?? textLayoutPreset.align,
    offsetX: labelOffsetX ?? 0,
    offsetY: labelOffsetY ?? textLayoutPreset.offsetY,
  };
  const secondaryPlacement: SlotPlacement = {
    origin: secondaryOrigin ?? SECONDARY_LAYOUT_AS_ORIGIN[resolvedSecondaryLayout],
    align: secondaryAlign ?? "center",
    offsetX: secondaryOffsetX ?? 0,
    offsetY: secondaryOffsetY ?? 0,
  };

  // A host-given `secondarySlot` wins outright — INCLUDING when it is
  // empty (`<></>`), which is what makes an emptied slot stay empty rather
  // than reverting to some default. There is no `producers` fallback (D3).
  const resolvedSecondarySlot: ReactNode = secondarySlot !== undefined ? secondarySlot : undefined;

  // B4 fix: the ROOT box is exactly the dot's own box (diameterPx square),
  // never the label's. Both slots are absolutely positioned OFF that box
  // via `slotPlacementStyle` — the SAME function the secondary slot always
  // used — instead of the old flex-row pairing (`originFlexDirection` +
  // a `flexOffsetTransform` computed as a delta from the ROW's own centre).
  // That old approach silently assumed the row's cross-centre (what
  // `items-center` actually aligns) equals the DOT's centre — true only
  // when the label is exactly as tall as the dot. A host that centres this
  // component as a unit (a PortEdge rail's `alignItems: "center"`, in
  // particular) was therefore centring the COMBINED dot+label box, so the
  // dot itself drifted off the rail's centre line the instant a label was
  // taller than the dot (docs bug B4). Sizing the root to the dot alone
  // makes that impossible by construction: whatever centres THIS component
  // centres the dot, and the label — now an overlay, not a flow sibling —
  // extends outward from wherever it actually sits, at any height.
  const labelSlotStyle = slotPlacementStyle(labelPlacement, { w: diameterPx, h: diameterPx }, PORT_LABEL_GAP);

  return (
    <div
      data-slot="port"
      data-state={state}
      data-direction={direction}
      data-edge={edge}
      data-text-layout={resolvedTextLayout}
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: diameterPx, height: diameterPx, ...style }}
      {...props}
    >
      <Port state={state} diameter={diameter} dimmed={dimmed} hinting={hinting} />
      {labelSlot !== undefined ? (
        <span data-slot="port-label-slot" className="absolute" style={labelSlotStyle}>
          {labelSlot}
        </span>
      ) : (
        <DefaultPortLabel
          direction={direction}
          textSize={textSize}
          disabled={disabled}
          onLabelWrite={onLabelWrite}
          placeholder={placeholder}
          className="absolute"
          style={labelSlotStyle}
        >
          {children}
        </DefaultPortLabel>
      )}
      {resolvedSecondarySlot != null && (
        <span
          data-slot="port-secondary-slot"
          className="pointer-events-none absolute"
          style={slotPlacementStyle(secondaryPlacement, { w: diameterPx, h: diameterPx }, PORT_SECONDARY_SLOT_GAP_PX)}
        >
          {resolvedSecondarySlot}
        </span>
      )}
    </div>
  );
}
