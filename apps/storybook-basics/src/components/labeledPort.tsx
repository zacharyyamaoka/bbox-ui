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
// What's REBUILT (D1, superseded 2026-09-16, superseded AGAIN 2026-09-17
// (docs/FEEDBACK-2026-09-17c-PLAN.md F-1)): the label slot's built-in fill
// went CodeField -> plain-text-via-`EditableText` -> plain-text-at-rest,
// `CodeEditor` while editing. Zach's own diagnosis of the 2026-09-16 build:
// "I also think in multi line edit mode, for simplicity we should be using
// labeled ports that use the CodeEditor single line. Right now you may be
// having difficulties because you are using EditableText in the label
// slot." `DefaultPortLabel` below now conditionally renders ONE of a plain
// `<span>` (rest) or a single-line `CodeEditor` (editing) at the SAME
// position — never both at once, so entering edit mode REPLACES the display
// text rather than painting an editor over it (F-1 item 2), and the type
// size cannot drift between the two the way it could across two unrelated
// components: both branches read `fontSizePx` off the exact same
// `PORT_TEXT_SIZES[textSize]` number (F-1's own acceptance test — resting
// `getComputedStyle().fontSize` vs the editor's — passes BY CONSTRUCTION,
// not by two components happening to agree). The SLOT BOUNDARY (`labelSlot`,
// present-beats-absent) is unchanged — a host that wants something else
// entirely still swaps the fill with zero changes to the placement math
// below (`LabeledPort.stories.tsx`'s own `CodeLabel` story already does
// this).

import type { LanguageSupport } from "@codemirror/language";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { cn } from "../lib/utils";
import { CodeEditor } from "./codeEditor";
import {
  DiagnosticTooltip,
  diagnosticUnderlineStyle,
  maxDiagnosticSeverity,
  type Diagnostic,
  type HighlighterKind,
} from "./highlighter";
import { HIT_REGION_FILL, HIT_REGION_OUTLINE } from "./hitRegion";
import { Port, type PortState } from "./port";
// The visual-variant registry (lane `ports`, 2026-09-19): the default dot
// diameter and text rung when a caller sets neither, the ring overhang the
// label clears, and the type→colour palette for the by-type variants.
import { PORT_VARIANT_ATTR, portVariantLabelFont, portVariantVars, usePortVariant, type PortVariantId } from "../skin/portVariants";
import {
  PORT_DIAMETERS,
  PORT_LABEL_GAP,
  PORT_SECONDARY_SLOT_GAP_PX,
  PORT_TEXT_SIZES,
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

/** Below this, the editor grows no narrower — a 1-2 char value still reads
 *  as a text field, not a single blinking-caret sliver. */
const MIN_LABEL_COLUMNS = 3;

/**
 * Click-to-edit. Two MUTUALLY EXCLUSIVE branches, never both mounted: at
 * rest a plain `<span>` (`port-label-display`), while editing a single-line
 * `CodeEditor` — swapping the element TYPE at the same tree position, so
 * React unmounts one and mounts the other rather than layering one over the
 * other (F-1 item 1/2: "the actual ports should basically look identical
 * ... when you are in multi line edit mode, the display text shouldn't show
 * any more"). Local `value` mirrors `children` whenever not mid-edit (so an
 * unwired label simply reflects whatever the host passes), and
 * `onLabelWrite` fires live on every keystroke — the same "fired on every
 * keystroke" contract the donor's `CodeField`-backed `PortLabel` documented.
 * Escape reverts to the value captured at the moment editing started.
 */
function DefaultPortLabel({
  children = "",
  direction = "input",
  textSize = "xs",
  type,
  fontFamily = "var(--bbox-skin-font-sans, inherit)",
  disabled = false,
  onLabelWrite,
  placeholder,
  language,
  showHitRegion = false,
  diagnostics,
  className,
  style,
}: {
  children?: string;
  direction?: PortDirection;
  textSize?: PortTextSize;
  /** The secondary run — the port's type — drawn after the name at the
   *  variant's `type.size`/`opacity` (portVariants.css). Rest only: the
   *  editor edits the NAME, and a type beside a caret reads as editable. */
  type?: string;
  /** The label face — the variant's (`portVariantLabelFont`); defaults to
   *  the skin's sans token, this label's behaviour before variants. */
  fontFamily?: string;
  disabled?: boolean;
  onLabelWrite?(value: string): void;
  placeholder?: string;
  language?: LanguageSupport;
  /** Paint this label's click-to-edit target (its own box). Paints
   * nothing while `disabled` — a disabled label has no click handler, so
   * there is no region to show; painting one would be a lie. */
  showHitRegion?: boolean;
  /** §5's LabeledPort row: "wavy underline under the label text" — applied
   *  to the REST span only (`port-label-display` below). The editing
   *  branch swaps in a `CodeEditor`, which carries its own positional
   *  `diagnostics` shape (ranges, not a per-element list) — out of scope
   *  here, same boundary §5's own table draws. */
  diagnostics?: Diagnostic[];
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

  // F-1's own acceptance test: `getComputedStyle().fontSize` on the resting
  // label and on the editor's own text must be EQUAL. Both branches below
  // read this SAME number — there is no second ladder to drift out of sync
  // with (the bug Zach saw was two DIFFERENT components each picking their
  // own size; one component reading one variable can't repeat that).
  const fontSizePx = PORT_TEXT_SIZES[textSize];
  // Text hugs the dot on the side the label actually flows toward — same
  // intent `direction` carried on the donor's CodeField.
  const align = direction === "output" ? "right" : "left";
  const exitEditing = () => setEditing(false);

  if (editing && !disabled) {
    return (
      <span data-slot="port-label" data-direction={direction} data-editing="true" className={cn("flex min-w-0 items-center", className)} style={style}>
        <CodeEditor
          value={value}
          onWrite={(next) => {
            setValue(next);
            onLabelWrite?.(next);
          }}
          // Loses focus (click elsewhere, tab away) commits and exits —
          // the ONE path `onEnter`/`onEscape` below don't already cover.
          onEditEnd={exitEditing}
          multiline={false}
          language={language}
          fontSizePx={fontSizePx}
          align={align}
          // An <input>-like port label: cut at the edge, no scrollbar —
          // same convention `LabeledPort.stories.tsx`'s `CodeLabel` story
          // already established for a CodeEditor filling this slot.
          overflow="clip"
          columns={Math.max(MIN_LABEL_COLUMNS, value.length)}
          autoFocus="select"
          onEnter={exitEditing}
          onEscape={() => {
            setValue(snapshotRef.current);
            onLabelWrite?.(snapshotRef.current);
            exitEditing();
          }}
        />
      </span>
    );
  }

  const isEmpty = value === "";
  const labelSeverity = maxDiagnosticSeverity(diagnostics);
  return (
    <span
      data-slot="port-label"
      data-direction={direction}
      data-editing="false"
      className={cn("flex min-w-0 items-center", className)}
      style={{
        ...style,
        // The label's hit region IS this span's own box (the onClick
        // below) — an implicit region with no named constant, painted on
        // the real target so it cannot drift. Nothing while `disabled`:
        // no handler, no region.
        ...(showHitRegion && !disabled
          ? { background: HIT_REGION_FILL, outline: HIT_REGION_OUTLINE, outlineOffset: -1 }
          : null),
      }}
      onClick={() => {
        if (disabled) return;
        snapshotRef.current = value;
        setEditing(true);
      }}
    >
      {/* Truthful rendering: a long value still ellipsizes visually, but
       *  the full string stays one hover away via `title` — the same
       *  recipe `editableText.tsx`'s own `editable-text-content` span
       *  uses, not reinvented here. */}
      <DiagnosticTooltip diagnostics={diagnostics}>
      <span
        data-slot="port-label-display"
        data-diagnostic={labelSeverity}
        title={!isEmpty ? value : undefined}
        data-placeholder={isEmpty && placeholder ? "" : undefined}
        style={{
          fontSize: fontSizePx,
          // The variant's weight (v2 SystemSketch-original is 500, the
          // rest 400) — read from the property the port root publishes,
          // falling back to the plain weight for a bare label.
          fontWeight: "var(--bbox-port-label-weight, 400)",
          // §5's wavy/dotted underline mark (./diagnostic.tsx's own
          // `diagnosticUnderlineStyle`) — `undefined` when there is
          // nothing to mark, so a plain label's `text-decoration` is
          // exactly what it was before this axis existed.
          ...(labelSeverity ? diagnosticUnderlineStyle(labelSeverity) : null),
          // The skin seam (src/skin/skin.ts + skin.css) — the ONE token
          // this resting display text needs. `--bbox-skin-font-sans` is
          // set INLINE (beating inheritance) rather than the plain
          // `--bbox-skin-font` Block/Badge/Port already inherit, because a
          // LabeledPort is not always mounted inside a Block's own
          // font-cascaded subtree — PortEdge.stories.tsx and
          // LabeledPort.stories.tsx both mount it as a bare specimen with
          // no ancestor that sets ANY font token. Fallback is `inherit`,
          // this label's exact behaviour today (no font-family of its own
          // at all), so a consumer who never imports skin.css is
          // byte-identical.
          // The variant's face (v2 SystemSketch-original is the mono
          // signature row) — still through the skin's font tokens, so the
          // sketch skin re-fonts every variant; see `portVariantLabelFont`.
          fontFamily,
          display: "block",
          minWidth: 0,
          maxWidth: "100%",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          textAlign: align,
          opacity: isEmpty ? 0.5 : undefined,
        }}
      >
        {isEmpty ? (placeholder ?? "") : value}
      </span>
      </DiagnosticTooltip>
      {type ? (
        // Reading order name → type on BOTH directions, never mirrored —
        // the app's own floating port made the same call and recorded why
        // (apps/systemsketch/src/shapes/port/PortFace.tsx `RestingLabel`:
        // mirroring rendered an output as "Image mask", a type-first
        // annotation language). `white-space: pre` keeps every authored
        // character (truthful rendering). Paint: portVariants.css.
        <span data-slot="port-label-type" style={{ marginLeft: 6, fontFamily }}>
          {type}
        </span>
      ) : null}
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
  /** Forwarded to `Port` untouched — see `PortDotPaintInput.availability`'s
   *  own doc (docs/INVALID-STATES-PLAN.md D5, ruling 5). */
  availability?: "available" | "unavailable";
  /**
   * The diagnostic axis (docs/INVALID-STATES-PLAN.md §5's LabeledPort
   * row) — forwarded to `Port` (the dot mark) and to the built-in label
   * (the wavy/dotted underline — a fixed treatment regardless of
   * `highlighterKind`; Zach's own approval on text marks: "no need to
   * reinvent the wheel there at all"). Ignored by the underline when
   * `labelSlot` overrides the built-in field — a host-supplied slot owns
   * its own typography. `DiagnosticFlag` (./highlighter.tsx) is NOT wired
   * here automatically; §5 says it "may ride the existing secondarySlot",
   * so a host composes `secondarySlot={<DiagnosticFlag diagnostics={...} />}`
   * itself rather than this component silently placing one.
   */
  diagnostics?: Diagnostic[];
  /** Forwarded to `Port` — see `PortDotPaintInput.highlighterKind`'s own
   *  doc. Has no effect on the label's own underline. */
  highlighterKind?: HighlighterKind;
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
  /** Forwarded to `Port` — the halo's diameter in px (default 40). */
  hitPx?: number;
  /**
   * The visual variant (src/skin/portVariants.ts). Omit and the
   * document-wide `<html data-bbox-port-variant>` decides (default `v1`);
   * set it to pin this port. Decides the default `diameter` and `textSize`
   * when those are omitted too. Its RING never moves the label: the label
   * clears the fixed `PORT_RING_OVERHANG_PX` allowance past the dot's box
   * on every variant, so only the box size itself shifts the text.
   */
  variant?: PortVariantId;
  /**
   * The port's TYPE, drawn as a muted secondary run after the name
   * (`[data-slot="port-label-type"]`) — "label small inside the row, type
   * secondary". Also handed to `Port` as `dataType`, where the two by-type
   * variants (v2, v3) colour the dot from it through their own source's
   * palette (`portTypePaint`); every other variant colours by state.
   * Ignored by a host-supplied `labelSlot`, which owns its own runs.
   */
  type?: string;
  /** An explicit CSS colour for the type — wins over either palette. */
  typeColor?: string;
  /** Forwarded to `Port` — the fan-in count circle riding the dot, on the
   *  side away from the label. See `PortProps.producers`. */
  producers?: number;
  /** Forwarded to `Port` — see `PortProps.selected`. */
  selected?: boolean;
  /**
   * Paint every pointer target this composite owns: the dot's halo (via
   * `Port`) and — when the built-in label is editable — the label's own
   * click-to-edit box. Pure paint; geometry is identical on or off. A
   * host-supplied `labelSlot` owns its own interactivity, so nothing is
   * painted over it.
   */
  showHitRegion?: boolean;
  /** Fired on every keystroke of the built-in label field. */
  onLabelWrite?(value: string): void;
  /** Shown in the built-in label field when `children` is empty. */
  placeholder?: string;
  /**
   * The built-in label field's syntax parser while editing (F-1/F-3), e.g.
   * `python()` from `@codemirror/lang-python` — the same prop `CodeEditor`
   * itself already exposes, forwarded straight through. Omit for plain
   * text. Ignored when `labelSlot` is set — that override owns its own
   * editor entirely, same as `CodeLabel` story's pattern below.
   */
  labelLanguage?: LanguageSupport;
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
  diameter,
  textLayout,
  textSize,
  state = "empty",
  hidden = false,
  dimmed = false,
  hinting = false,
  availability,
  diagnostics,
  highlighterKind,
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
  hitPx,
  showHitRegion = false,
  onLabelWrite,
  placeholder,
  labelLanguage,
  variant: variantId,
  type,
  typeColor,
  producers,
  selected = false,
  className,
  style,
  children = "",
  ...props
}: LabeledPortProps) {
  // Hooks before the early return — `hidden` is a prop, not a hook order.
  const variant = usePortVariant(variantId);
  if (hidden) return null;
  const resolvedTextLayout = textLayout ?? inwardTextLayout(edge);
  // Omitted `diameter`/`textSize` fall to the VARIANT, not to a constant —
  // that is the whole mechanism by which "the small pair is the default"
  // (Zach's ruling) reaches every port nobody sized explicitly, and by
  // which the `<html>` switch re-sizes them all.
  const diameterPx = diameter === undefined ? variant.dot.diameter : typeof diameter === "number" ? diameter : PORT_DIAMETERS[diameter];
  const resolvedTextSize: PortTextSize = textSize ?? variant.text;
  const labelFont = portVariantLabelFont(variant);
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
  // The label clears the RESERVED ring allowance (`PORT_RING_OVERHANG_PX`),
  // not this variant's painted ring — see port.layout.ts's WHY: a variant
  // switch moves text only by the box's own size change, and every layout
  // consumer that reads the same closed form keeps agreeing.
  const labelSlotStyle = slotPlacementStyle(labelPlacement, { w: diameterPx, h: diameterPx }, PORT_LABEL_GAP);

  // The producers circle rides the side AWAY from the label, so it never
  // sits on the text: a left-wall port (label flowing right, into the
  // block) wears it on the left, outside the block, where the cables it
  // counts actually arrive.
  const producersAt: "left" | "right" = labelPlacement.origin === "right" ? "left" : "right";

  return (
    <div
      data-slot="port"
      data-state={state}
      data-direction={direction}
      data-edge={edge}
      data-text-layout={resolvedTextLayout}
      {...{ [PORT_VARIANT_ATTR]: variant.id }}
      className={cn("relative inline-flex shrink-0", className)}
      // The variant's custom properties, published on THIS root so the label
      // and type runs (siblings of the dot, not its descendants) read the
      // same numbers the dot painted with — and so a consumer with only the
      // component source, no portVariants.css, still renders right.
      style={{ width: diameterPx, height: diameterPx, ...portVariantVars(variant), ...style }}
      {...props}
    >
      <Port
        state={state}
        diameter={diameter}
        variant={variant.id}
        dimmed={dimmed}
        hinting={hinting}
        availability={availability}
        diagnostics={diagnostics}
        highlighterKind={highlighterKind}
        hitPx={hitPx}
        showHitRegion={showHitRegion}
        selected={selected}
        producers={producers}
        producersAt={producersAt}
        dataType={type}
        typeColor={typeColor}
      />
      {labelSlot !== undefined ? (
        <span data-slot="port-label-slot" className="absolute" style={labelSlotStyle}>
          {labelSlot}
        </span>
      ) : (
        <DefaultPortLabel
          direction={direction}
          textSize={resolvedTextSize}
          type={type}
          fontFamily={labelFont}
          disabled={disabled}
          onLabelWrite={onLabelWrite}
          placeholder={placeholder}
          language={labelLanguage}
          showHitRegion={showHitRegion}
          diagnostics={diagnostics}
          className="absolute"
          style={labelSlotStyle}
        >
          {children}
        </DefaultPortLabel>
      )}
      {resolvedSecondarySlot != null && (
        // F-6: "the slot position may change but its always just a single
        // horizontal text line, similar to the primary label slot" —
        // `whiteSpace: nowrap` is the structural guarantee (Zach's
        // screenshot showed "Event 4" wrapping to two lines the instant a
        // host's own width constraint squeezed this slot; a shrink-to-fit
        // absolute box never needs to wrap ON ITS OWN, but nothing stopped
        // an ANCESTOR from imposing one — see `SecondarySlot` story's
        // `SingleLineContent` case). `display: inline-flex` + `alignItems:
        // center` keeps arbitrary content (a `<Pill>`, an icon+digit pair)
        // vertically centred on one line rather than stacking as block
        // children would.
        <span
          data-slot="port-secondary-slot"
          className="pointer-events-none absolute inline-flex items-center whitespace-nowrap"
          style={slotPlacementStyle(secondaryPlacement, { w: diameterPx, h: diameterPx }, PORT_SECONDARY_SLOT_GAP_PX)}
        >
          {resolvedSecondarySlot}
        </span>
      )}
    </div>
  );
}
