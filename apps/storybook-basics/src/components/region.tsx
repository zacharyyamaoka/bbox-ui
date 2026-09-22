"use client";

// src/components/region.tsx — the Region: a thin scope FRAME with a real
// Block integral to its top-left corner, an optional free body, and an
// ordered list of arm rows. Props in, DOM out (docs/CONTROL-FLOW-PLAN.md
// §3.2); it imports no scene module and no canvas engine, so the same
// element renders under the DOM canvas, React Flow and tldraw unchanged.
//
// ── ONE NODE, TWO PIECES OF PAINT (plan §2.A, Zach's "everything is a
//    block" made structural) ──────────────────────────────────────────
// A region is ONE scene node. The FRAME is how that node renders its
// SCOPE; the CORNER BLOCK is how it renders its INTERFACE. There is no
// second node, no head child, and the frame carries no value ports of its
// own — a loop's `Iterable`/`Iter` and a branch's conditions are ports on
// the corner card, resolved by exactly the same `[data-block-id]` ->
// `[data-port-id]` walk as any other block's.
//
// WHY the root and the frame carry `data-region-id` and NEVER
// `data-block-id`: `wireLayer.tsx`'s `resolveDot` takes the FIRST
// `[data-block-id="<id>"]` in document order (wireLayer.tsx:81). If the
// frame carried the region's id it would win that lookup, and every wire
// into the corner card would resolve against a box that owns no dot. The
// corner card owns the id; the frame owns the region id. The tempting
// alternative — stamping both and "letting the more specific one win" —
// cannot work, because document order, not specificity, is the rule.
//
// LOOK: React Flow UI's Labeled Group Node (`Pasted image 20260918192040.png`,
// the reference Zach named): a thin rounded frame with a transparent fill
// and a label chip INSIDE the frame at its top-left, sharing the frame's
// rounding there and square where it meets the frame. Ours is a whole
// Block rather than a text chip, which is the entire point.
//
// ── FIVE DRAWINGS, ONE COMPONENT (2026-09-19, `skin/regionVariants.ts`) ──
// Zach asked for five proposals for how a region could be drawn
// differently. They are NOT five components and not five props: every
// paint value below is a CSS custom property (`--bbox-region-*`) read with
// today's value as its `var()` fallback, and a variant is a block of those
// properties keyed on `data-bbox-region-variant` on any ancestor
// (`skin/regionVariants.css`, the skin.css mechanism). The two things CSS
// cannot drive — the arm header's height, which the pure layout twin must
// be told, and the fold chevron's `reveal`, which is a prop — come from
// the TS spec via `useRegionVariant`, keyed on the SAME attribute. So no
// variant is ever a fork of this file, and a consumer who never imports
// the CSS renders the pixels this component rendered before variants
// existed (`v1`).
//
// What every variant keeps, because Zach's ruling is not a variant axis:
// the corner block flush with the frame's top-left; its dots ON the frame
// edge and never clipped; arms stacked under it and folded by the chevron;
// the opaque card untouched.
//
// ── THE VIEWS (2026-09-22, `presets/RegionViews.stories.tsx`) ───────────
// Zach: "Please create stories that show region in different views. Simple:
// not support — but there is port and expanded, and expanded opaque." Those
// are PROPS here, not story drawings: `headerStyle` (corner card · title tab
// · full tab · full-width bar), `view="port"`, `opaqueFace="frame"`, the
// square `onToggleView` toggle and the wall-crossing `crossings` markers.
// Every one defaults to what this component drew before, so no existing
// host changes. The id rule survives all of them: whichever element owns
// the region's PORTS — the host's corner card, the full-width bar, the port
// card, the opaque face — is the ONE `[data-block-id]`; the root and the
// frame carry only `data-region-id`; a tab owns no port and carries neither.
//
// Pure: no React state beyond two measurements (the corner's box and the
// variant in force), no DOM outside its own subtree, no scene import (the
// `layering.test.ts` import wall).

import { useLayoutEffect, useState, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Square } from "lucide-react";

import { Bar } from "./bar";
import { Block } from "./block";
import { BlockMembers, type BlockMember } from "./blockMembers";
import { BlockOpaqueTitle } from "./blockOpaqueTitle";
import { BlockPort, type BlockEdgeSpec } from "./blockPort";
import { offsetEdgePaddingPx, RAIL_GAP_PX } from "./blockPort.layout";
import { Button } from "./button";
import { FoldingChevron } from "./foldingChevron";
import { Glyph } from "./glyph";
import { ISOLATED_ROOT_STYLE, paintTier } from "./paintOrder";
import type { BlockSide } from "./port.layout";
import type { PortEdgeItem } from "./portEdge";
import {
  REGION_ARM_FADE_OPACITY,
  REGION_CARD_WIDTH_PX,
  REGION_CORNER_WIDTH_PX,
  regionLayout,
  type RegionLayout,
} from "./region.layout";
import { regionControlSplitPx, regionHeaderBandPx, regionRailBandPx, type RegionPoint } from "./regionViews.layout";
import {
  DEFAULT_REGION_VARIANT,
  REGION_VARIANT_ATTR,
  REGION_VARIANTS,
  readRegionVariant,
  type RegionVariantId,
} from "../skin/regionVariants";

export type { RegionPoint } from "./regionViews.layout";

export type RegionKind = "loop" | "branch" | "group";
/**
 * `port` is the region collapsed all the way to a block (Zach's 2026-09-22
 * "Port" sketch). There is deliberately no `simple`: "Simple: not support"
 * — a region is never drawn as a bare dot-per-wall card.
 */
export type RegionView = "expanded" | "opaque" | "port";

/**
 * How the expanded frame marks its top edge (Zach, 2026-09-22).
 *  • `corner-card` — today's Block in the corner (the default; the host
 *    supplies it as `corner`).
 *  • `corner-tab` — a small tab at the top-left with just the title.
 *  • `corner-tab-full` — the same tab with glyph + title + type.
 *  • `full-width` — a header bar across the frame's whole top; glyph + title
 *    + type centred, control ports (if any) stacked at its left end.
 */
export type RegionHeaderStyle = "corner-card" | "corner-tab" | "corner-tab-full" | "full-width";

/**
 * What `view="opaque"` draws. `card` is today's P5 card (the host's own
 * `corner`, wider, with a footer) and stays the default. `frame` is Zach's
 * 2026-09-22 "Expanded Opaque": the frame keeps its size, the members go,
 * the crossings become real ports on the walls, and glyph/Title/Type sit
 * centred.
 */
export type RegionOpaqueFace = "card" | "frame";

/** The words and glyph every non-`corner-card` drawing paints for itself. */
export interface RegionHeading {
  /** `@bbox-ui/glyph-content` grammar (`lucide:repeat`, `emoji:…`). The
   *  region picks the SIZE per view — small in a header row, large on the
   *  opaque face — so it takes content, not a sized element. */
  glyph?: string;
  title: ReactNode;
  type?: ReactNode;
}

export interface RegionArm {
  id: string;
  /** Free text, human readable — `if fast:`, `case "pet":`. Never code. */
  title: ReactNode;
  open: boolean;
  onOpenChange?(open: boolean): void;
  /** Absent is ACTIVE. Donor branchModel.ts:11-12 — "no active arm means
   *  every arm is active". */
  active?: boolean;
  /** Body height while open; remembered while folded (`regionLayout`). */
  bodyHeight?: number;
  members?: BlockMember[];
}

export interface RegionProps {
  /** Stamped as `data-region-id` on the root AND the frame — never
   *  `data-block-id`. See this file's header. */
  id: string;
  kind?: RegionKind;
  view?: RegionView;
  /** The REAL Block: a `BlockPort` whose `id` IS this region's id. Read by
   *  `headerStyle="corner-card"` (expanded) and `opaqueFace="card"`
   *  (opaque); every other drawing builds its own interface card. */
  corner?: ReactNode;
  /** Default `corner-card` — every caller that predates it renders exactly
   *  what it rendered before. */
  headerStyle?: RegionHeaderStyle;
  /** What the tab / full-width header / port card / opaque face say. Falls
   *  back to `{ title: id }` — the id is the one truthful name a region
   *  always has. */
  heading?: RegionHeading;
  /**
   * The region's CONTROL ports (a loop's `Iterable`, a branch's condition)
   * when the region draws its own interface card: stacked at the left end
   * of the `full-width` header, above the split line in the `port` view,
   * in the L-split corner box on the opaque `frame` face. Ignored by
   * `corner-card` (the host's `corner` already carries its ports).
   */
  controlPorts?: PortEdgeItem[];
  /**
   * The ORDINARY ports — the region's boundary, one per wall crossing
   * (`scene/regionView.ts`'s `projectOpaqueRegions` derives them as
   * `PromotedPort`s; a host maps each to an item on `port.side`). Drawn
   * under the split in the `port` view and on the walls of the opaque
   * `frame` face; the expanded view never draws them (there the cable
   * crosses the wall itself — see `crossings`).
   */
  boundaryPorts?: Partial<Record<"left" | "right", PortEdgeItem[]>>;
  /** Default `card`. */
  opaqueFace?: RegionOpaqueFace;
  /** Present = draw the square view toggle at the frame's top-right:
   *  hollow while expanded, filled while opaque. */
  onToggleView?(): void;
  /**
   * Where wires cross the frame's border, FRAME-LOCAL (border-box top-left
   * is 0,0) — `regionViews.layout.ts`'s `wallCrossings`. Each paints a small
   * hollow circle on the wall. Decorative only: not a port, no id, no
   * pointer events, so nothing can bind to one.
   */
  crossings?: readonly RegionPoint[];
  /** Skip the measurement when a host already knows the corner's box. */
  cornerSize?: { w: number; h: number };
  width?: number;
  /** Omitted = hug (`regionLayout`). */
  height?: number;
  /** The free body a loop/group drops into — `BlockMembers layout="free"`. */
  members?: BlockMember[];
  arms?: RegionArm[];
  className?: string;
  style?: CSSProperties;
}

/** The frame's own border, px — the number the corner is pulled back by so
 *  the two borders sit on ONE line rather than doubling into a 2px rule.
 *  Every variant keeps this 1px of GEOMETRY (a variant may paint it
 *  transparent, never widen it), which is what keeps every row, member and
 *  dot exactly where it was under `v1`. */
const FRAME_BORDER_PX = 1;

/** The frame's shared top-left radius — the corner card's too. `v1` is the
 *  skin radius, i.e. exactly what this component painted before variants. */
const FRAME_RADIUS = "var(--bbox-region-frame-radius, var(--bbox-skin-radius, var(--radius-lg)))";

/**
 * The corner Block's radii: the frame's own at the shared top-left, square
 * at both corners where it MEETS the frame's edges, and — at its one free
 * corner (bottom-right) — the variant's `corner-radius`, the frame's again
 * by default. That is the Labeled Group Node look — the chip reads as part
 * of the frame, not as a card that happens to be parked in it. `v2` sets
 * the free corner square so its full-width header rule leaves the card
 * cleanly instead of departing from a curve.
 *
 * WHY top-right and bottom-left are SQUARE, and the other two are not:
 * those two are the JUNCTIONS — the card's own top edge continues as the
 * frame's top rule, and its own left edge continues as the frame's left
 * rule. A radius there retracts the card's edge from the frame's line, so
 * the border visibly kinks twice on its way around the corner. Zach,
 * 2026-09-19, annotating the tldraw app (`Pasted image 20260919180659.png`
 * — a square-cornered rectangle drawn over a card rounded at all four):
 * "I don't like how the edges where it meets the region are still curve.
 * they shuld be straight!", against the For Loop in `…115424.png` he had
 * already called done properly. WHAT THIS REJECTS: the stock all-round
 * `Block` (`--bbox-skin-radius` on four corners), which is the tempting
 * default because it is what every other Block on the board wears — and
 * which makes the corner read as a card PARKED in the frame rather than
 * part of it. Squaring all four was considered and rejected too: the
 * top-left is the frame's OWN corner (card and frame curve together, so
 * there is no junction to break) and the bottom-right touches no frame
 * edge at all — and the drawing he approved rounds both.
 *
 * WHY this object is the contract for EVERY host, not only one that
 * renders the card inside `Region`'s own subtree: a canvas host may mount
 * the corner card as an INDEPENDENT element. `apps/systemsketch` paints it
 * as a real `ss-block` child shape (its "everything is really a block"
 * ruling), so the card is not a React descendant of this component and no
 * CSS rule written here — not a wrapper class, not a
 * `[data-slot="region-corner"] >` descendant selector — can ever reach it.
 * Such a host has to spread THIS object onto its own card, exactly the way
 * `hosts/nodeViews.tsx` does. A host that skips it silently gets the stock
 * all-round card and the double kink above; that is the bug this paragraph
 * exists to stop coming back, and `RegionVariants.stories.tsx`'s
 * `CornerMeetsFrameSquare` is what measures it.
 *
 * WHY an inline style and not a Tailwind `[&_[data-slot=block]]:rounded-*!`
 * wrapper class: `Block` spreads its caller's `style` AFTER its own
 * `borderRadius` (block.tsx:321), so an inline value is the mechanism the
 * component already documents as winning. A `!important` class would also
 * win, but only by out-shouting a value Block deliberately publishes as
 * overridable — the quieter seam is the one Block itself points at.
 */
export const REGION_CORNER_BLOCK_STYLE: CSSProperties = {
  borderTopLeftRadius: FRAME_RADIUS,
  borderTopRightRadius: 0,
  borderBottomLeftRadius: 0,
  borderBottomRightRadius: `var(--bbox-region-corner-radius, ${FRAME_RADIUS})`,
  // WHY: `v10` (the 2026-09-20 sketch) centres the header card's title in a
  // band run the full width of the region; every other drawing leaves it
  // where the host put it. `text-align` is INHERITED, which is the whole
  // reason it can live on this one shared object: the corner card is a React
  // descendant of `Region` in the DOM host and a separate `ss-block` child
  // SHAPE in the app, and an inherited property is the only paint that
  // crosses that boundary without either host restating it.
  //
  // It cannot leak onto the port labels — `BlockPort` is the card's PARENT,
  // not its child — which is what keeps the sketch's `port 1` / `port 2` left
  // aligned beside their dots while the title centres. The tempting
  // alternative, a `[data-slot="block-header"]` rule in `regionVariants.css`,
  // is ruled out twice over: that file is custom-properties-only by its own
  // contract, and a descendant selector written in the trunk can never reach
  // the app's child shape at all (BlockFace.tsx's own note).
  textAlign: "var(--bbox-region-corner-title-align, initial)" as CSSProperties["textAlign"],
};

/**
 * The corner's measured box.
 *
 * WHY measured and not computed: the corner is a whole `Block` whose height
 * hugs its own header, ports and footer — there is no closed form for it
 * (the same reason `blockPort.tsx`'s `useBlockBands` measures rather than
 * derives). The first render has no box yet and falls back to
 * `{w: REGION_CORNER_WIDTH_PX, h: 0}`; `useLayoutEffect` corrects it BEFORE
 * the browser paints, so the guess is never on screen — the same
 * first-frame device `tldrawHost.tsx` uses, tightened one frame because
 * this measurement has no engine to wait for.
 */
function useCornerSize(given: { w: number; h: number } | undefined): {
  ref: (node: HTMLDivElement | null) => void;
  size: { w: number; h: number };
} {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);
  const skip = given !== undefined;

  useLayoutEffect(() => {
    if (skip || !node) return;
    const read = () => {
      const rect = node.getBoundingClientRect();
      // Identity-preserving: a sub-pixel re-measure that says the same
      // thing must not re-render, or the observer feeds itself.
      setMeasured((previous) =>
        previous && Math.abs(previous.w - rect.width) < 0.5 && Math.abs(previous.h - rect.height) < 0.5
          ? previous
          : { w: rect.width, h: rect.height },
      );
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, [skip, node]);

  return { ref: setNode, size: given ?? measured ?? { w: REGION_CORNER_WIDTH_PX, h: 0 } };
}

/**
 * The variant in force for THIS region — the nearest ancestor carrying
 * `data-bbox-region-variant`, else `<html>`'s, else `v1`
 * (`readRegionVariant`).
 *
 * WHY it is measured off the DOM in a layout effect, like the corner, and
 * not passed as a prop or read from a context: the contract's switch is an
 * ATTRIBUTE (so the app's dropdown and Storybook's global are three lines
 * each, and CSS reads the same thing), and an attribute change re-renders
 * nothing here on its own. The CSS tokens follow it for free; the two
 * values that are not CSS — the header height the layout twin needs and
 * the chevron's `reveal` — follow it through the observer below, without
 * any React state outside this file. The first render assumes `v1` and the
 * layout effect corrects it before paint, the device `useCornerSize` uses.
 *
 * WHY the observer is shaped as it is — the failure it closes is a
 * HALF-SWITCHED region, CSS on the new drawing and layout/chevron on the
 * old (`RegionVariants.stories.tsx`'s `SwitchOnAncestor*` and
 * `SwitchNeverHalfPainted`, each red against the alternative named here):
 *   • It watches the WHOLE document (`subtree`), filtered to the one
 *     attribute — `<html>`'s dataset from an app dropdown, a wrapper
 *     written by hand, and a React-owned wrapper (the Storybook global)
 *     whether or not this region re-rendered with it. Observing only
 *     `<html>` (the first cut) left a nearer ancestor's switch unseen
 *     forever. The filter keeps it cheap: records exist only for this
 *     attribute, which changes when someone picks a drawing.
 *   • It applies the change with `flushSync`. Its callback is a microtask,
 *     and a plain `setState` from there is scheduled as a later TASK —
 *     after the browser has painted the new CSS over the old layout, one
 *     visible frame of jitter per switch. `flushSync` renders inside the
 *     same microtask checkpoint, before paint; when the resolved variant
 *     did not change (another subtree's switch) the same-value bail-out
 *     makes it a `closest()` walk and nothing else.
 */
function useRegionVariant(node: HTMLElement | null): RegionVariantId {
  const [variant, setVariant] = useState<RegionVariantId>(DEFAULT_REGION_VARIANT);
  useLayoutEffect(() => {
    if (!node) return;
    setVariant(readRegionVariant(node));
    const observer = new MutationObserver(() => {
      const next = readRegionVariant(node);
      flushSync(() => setVariant(next));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: [REGION_VARIANT_ATTR], subtree: true });
    return () => observer.disconnect();
  }, [node]);
  return variant;
}

function ArmRow({
  arm,
  row,
  index,
  chevron,
}: {
  arm: RegionArm;
  row: RegionLayout["arms"][number];
  index: number;
  chevron: "always" | "hover";
}) {
  const active = arm.active ?? true;
  return (
    <div
      data-slot="region-arm"
      data-arm-id={arm.id}
      data-open={String(row.open)}
      data-active={String(active)}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: row.rowTop,
        height: row.bottom - row.rowTop,
        // WHY a single opacity token on the ROW and not per-element
        // styling: the donor fades "non-active arms, their Blocks and
        // their cables" with ONE number (branchModel.ts:38-39,
        // BRANCH_FADE_OPACITY = 0.18), and a row-level opacity carries the
        // arm's members with it for free. Cable fade is a follow-up — the
        // wires live in a sibling layer, not inside this box.
        opacity: active ? undefined : REGION_ARM_FADE_OPACITY,
      }}
    >
      {/*
        The arm's DECOR box — `v5`'s inset card, `v4`'s indent guide, nothing
        at all by default (`display: none`). WHY a real element and not a
        `::before`: this component is props in, DOM out, and a box the
        acceptance can measure (`RegionVariants.stories.tsx` reads its rect)
        has to be in the DOM. It is absolutely positioned and comes FIRST,
        and the header and body are positioned after it, so it paints
        BEHIND both in DOM order — no z-index, which the paint-order
        invariant (paintOrder.ts) would otherwise have to account for. The
        row's own box never moves for it: `expectArmsStacked` and every
        member's authored position hold in all five drawings.
      */}
      <div
        data-slot="region-arm-decor"
        aria-hidden
        style={{
          display: "var(--bbox-region-arm-decor-display, none)",
          position: "absolute",
          inset: "var(--bbox-region-arm-decor-inset, 0px)",
          width: "var(--bbox-region-arm-decor-width, auto)",
          borderStyle: "solid",
          borderWidth: "var(--bbox-region-arm-decor-stroke-widths, 0px)",
          borderColor: "var(--bbox-region-arm-decor-stroke, var(--border))",
          borderRadius: "var(--bbox-region-arm-decor-radius, 0px)",
          background: "var(--bbox-region-arm-decor-fill, transparent)",
          pointerEvents: "none",
        }}
      />
      <div
        data-slot="region-arm-header"
        style={{
          // Positioned so it paints after the decor box above (DOM order
          // among positioned boxes), never under it.
          position: "relative",
          height: row.bodyTop - row.headerTop,
          paddingLeft: "var(--bbox-region-arm-header-inset, 0px)",
          // `v3`'s band; transparent otherwise.
          background: "var(--bbox-region-arm-header-fill, transparent)",
          // A divider between rows only, never above the first — the
          // donor's own `dividerY: index === 0 ? null : rowTop`
          // (branchModel.ts). `v3`/`v4`/`v5` set its width to 0.
          borderTop: index > 0 ? "var(--bbox-region-arm-divider-width, 1px) solid var(--bbox-region-arm-divider-stroke, var(--border))" : undefined,
          // `v2`'s rule under every header; 0 otherwise.
          borderBottom: "var(--bbox-region-arm-header-rule-width, 0px) solid var(--bbox-region-arm-header-rule-stroke, var(--border))",
        }}
      >
        <Bar
          size="sm"
          // WHY `100%` and not the rung's own 28px: the header row is the
          // variant's height (26 for the bracket, 32 for the ruled), and
          // the strip fills it so the chevron and title are centred in the
          // row rather than top-biased by whatever the difference is.
          style={{ height: "100%" }}
          left={
            <>
              <FoldingChevron open={row.open} onClick={() => arm.onOpenChange?.(!row.open)} reveal={chevron} />
              <span
                data-slot="region-arm-title"
                className="truncate"
                // No fallbacks on purpose: an UNSET token is invalid at
                // computed-value time, and for these four inherited
                // properties that means `inherit` — the Bar's own text.
                // That is how `v1` says "leave the title alone" without
                // this file naming a font it does not own
                // (regionVariants.ts's own note on `initial`).
                style={{
                  fontSize: "var(--bbox-region-arm-title-size)",
                  fontWeight: "var(--bbox-region-arm-title-weight)",
                  fontFamily: "var(--bbox-region-arm-title-font)",
                  color: "var(--bbox-region-arm-title-color)",
                }}
              >
                {arm.title}
              </span>
            </>
          }
        />
      </div>
      {row.open && (
        // WHY the body LEAVES THE DOM when folded rather than collapsing to
        // `height: 0`: `expectArmsStacked` measures a folded arm as "no
        // body", and a zero-height box that still contains members would
        // keep them hit-testable and focusable while invisible — a folded
        // arm has to be genuinely absent, not merely unpainted.
        <div
          data-slot="region-arm-body"
          style={{ position: "relative", height: row.bodyHeight }}
        >
          <BlockMembers
            layout="free"
            members={arm.members ?? []}
            gap={0}
            gutter={0}
            insetBackground="none"
            showMembers
            showCards={false}
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The region VIEWS (Zach, 2026-09-22) — the drawings a region paints   */
/* for itself when the host hands it words and ports, not a card        */
/* ------------------------------------------------------------------ */

/** `block.tsx`'s body is `p-2`. The port card's section box cancels it with
 *  a negative margin so the split line is placed in the SAME coordinates
 *  the rail packs from (the body band's top), not 8px lower. */
const BLOCK_BODY_PADDING_PX = 8;

/** How far into the frame the L-split corner box reaches — room for a
 *  `port Any` label beside its dot. A constant, not a measurement: a
 *  longer control-port label crosses the L's upright rather than moving it. */
export const REGION_CONTROL_BOX_WIDTH_PX = 112;

/** The wall-crossing marker's diameter and stroke — "a small HOLLOW CIRCLE
 *  sits on the wall". */
export const REGION_CROSSING_MARKER_PX = 10;
const REGION_CROSSING_STROKE_PX = 1.5;

/** Inset of the square toggle from the frame's top-right corner. */
const REGION_TOGGLE_INSET_PX = 4;
/** `Button size="icon-xs"` is `size-6`. */
const REGION_TOGGLE_PX = 24;

const REGION_STROKE = "var(--bbox-region-frame-stroke, var(--border))";

function headingOf(id: string, heading: RegionHeading | undefined): RegionHeading {
  return heading ?? { title: id };
}

/** glyph · Title · Type on one line, centred — every header ROW (the tab,
 *  the full-width bar, the port card's header). */
function RegionHeadingRow({ heading, withGlyph = true, withType = true }: { heading: RegionHeading; withGlyph?: boolean; withType?: boolean }) {
  return (
    <div data-slot="region-heading" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap" }}>
      {withGlyph && heading.glyph !== undefined && <Glyph content={heading.glyph} sizePreset="sm" />}
      <span data-slot="region-heading-title" style={{ fontWeight: 600 }}>
        {heading.title}
      </span>
      {withType && heading.type !== undefined && (
        <span data-slot="region-heading-type" className="text-muted-foreground">
          {heading.type}
        </span>
      )}
    </div>
  );
}

/**
 * The corner TAB — sketches 2(a) and 2(b). Shaped like the corner card
 * (shares the frame's top-left radius, square where it meets the frame's
 * edges, rounded at its one free corner) but it is a LABEL, not a Block.
 *
 * WHY it carries no `data-block-id`: it owns no port. The id rule (this
 * file's header) is that the element holding the region's PORTS carries the
 * id; a tab-drawn region has no interface card, so there is nothing for a
 * wire to resolve and nothing may claim the id. A region that needs ports
 * uses `corner-card` or `full-width`.
 */
function RegionTab({ heading, full }: { heading: RegionHeading; full: boolean }) {
  return (
    <div
      data-slot="region-tab"
      data-tab={full ? "full" : "title"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 10px",
        fontSize: 12,
        lineHeight: "18px",
        borderStyle: "solid",
        borderWidth: FRAME_BORDER_PX,
        borderColor: REGION_STROKE,
        borderTopLeftRadius: FRAME_RADIUS,
        borderTopRightRadius: 0,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: FRAME_RADIUS,
      }}
    >
      <RegionHeadingRow heading={heading} withGlyph={full} withType={full} />
    </div>
  );
}

/**
 * The FULL-WIDTH header — sketches 2(c), 5 and 6. A real `BlockPort` whose
 * id IS the region's, stretched across the frame, its control ports on its
 * own left wall (which is the frame's left wall).
 *
 * WHY this bar, and not the frame or the root, carries `data-block-id`:
 * the id rule is "the element that owns the region's ports owns its id".
 * With a full-width header the control ports live INSIDE the bar ("ONE
 * control port at the left end INSIDE the header bar"), so the bar is the
 * interface card — the corner card, grown to the frame's width, exactly
 * the `v10` "band" reading ("its just the block is stretch accross the
 * entire width of the region", Zach 2026-09-20). A wire into a control
 * port therefore resolves through the same `[data-block-id]` →
 * `[data-port-id]` walk as ever, and `wireLayer.tsx`'s first-match lookup
 * still finds a box that owns the dot. Stamping the frame instead would
 * win that lookup and strand every control-port wire — the failure the
 * header of this file already names.
 */
function RegionHeaderCard({ id, heading, controlPorts, width }: { id: string; heading: RegionHeading; controlPorts: PortEdgeItem[]; width: number }) {
  return (
    <BlockPort id={id} view="port" edges={controlPorts.length > 0 ? { left: { items: controlPorts } } : {}}>
      <Block
        width={width}
        // One band formula for this bar AND the opaque face's band, so the
        // rule does not jump when the toggle flips (regionHeaderBandPx).
        height={regionHeaderBandPx(controlPorts.length)}
        body={<RegionHeadingRow heading={heading} />}
        style={{
          borderTopLeftRadius: FRAME_RADIUS,
          borderTopRightRadius: FRAME_RADIUS,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          boxShadow: "none",
        }}
      />
    </BlockPort>
  );
}

/**
 * The square view toggle — hollow while expanded, FILLED while opaque
 * (Zach's sketches draw exactly those two). The stock `Button`, so the
 * press, focus ring and hover are shadcn's, not ours.
 *
 * WHY a square and not the corner card's `FoldingChevron`: a chevron reads
 * "fold this row" (the arms use it for exactly that); the square is Zach's
 * mark for "show the inside / hide the inside" — the opaque ⇄ expanded
 * switch — and the two must not be confused on a branch that shows both.
 */
export function RegionViewToggle({ opaque, onToggle, style }: { opaque: boolean; onToggle?(): void; style?: CSSProperties }) {
  return (
    <Button
      data-slot="region-view-toggle"
      data-state={opaque ? "opaque" : "expanded"}
      variant="ghost"
      size="icon-xs"
      aria-label={opaque ? "Expand region" : "Make region opaque"}
      aria-pressed={opaque}
      onClick={onToggle}
      style={{ position: "absolute", ...style }}
    >
      <Square aria-hidden fill={opaque ? "currentColor" : "none"} />
    </Button>
  );
}

/**
 * The wall-crossing markers (sketches 4 and 6): a small hollow circle
 * wherever a cable crosses the frame. Laid over the frame's BORDER box
 * (`inset: -1px` from the padding box the frame's children see), so a
 * frame-local point from `wallCrossings` is used as-is.
 *
 * Painted at `portDot` (paintOrder.ts): the marker sits where a port
 * WOULD be — on the wall, above the frame's own content — and the region
 * root that emits the tier is `isolation: isolate`, so it can never climb
 * over anything outside this region.
 */
function RegionCrossingMarkers({ points }: { points: readonly RegionPoint[] }) {
  if (points.length === 0) return null;
  const radius = REGION_CROSSING_MARKER_PX / 2;
  return (
    <div
      data-slot="region-crossings"
      aria-hidden
      style={{ position: "absolute", inset: -FRAME_BORDER_PX, pointerEvents: "none", zIndex: paintTier("portDot") }}
    >
      {points.map((point, index) => (
        <span
          key={index}
          data-slot="region-crossing"
          style={{
            position: "absolute",
            left: point.x - radius,
            top: point.y - radius,
            width: REGION_CROSSING_MARKER_PX,
            height: REGION_CROSSING_MARKER_PX,
            boxSizing: "border-box",
            borderRadius: "50%",
            border: `${REGION_CROSSING_STROKE_PX}px solid var(--foreground)`,
            background: "transparent",
          }}
        />
      ))}
    </div>
  );
}

/** The ordinary ports' rails: left after the control ports, right pushed
 *  down to start at slot `ordinaryStart`. */
function sectionEdges(
  controlPorts: PortEdgeItem[],
  boundaryPorts: Partial<Record<"left" | "right", PortEdgeItem[]>>,
  ordinaryStart: number,
): Partial<Record<BlockSide, BlockEdgeSpec>> {
  const left = [...controlPorts, ...(boundaryPorts.left ?? [])];
  const right = boundaryPorts.right ?? [];
  const aligned = (slots: number) => ({ mode: "aligned" as const, anchor: "start" as const, gap: RAIL_GAP_PX, edgePadding: offsetEdgePaddingPx(slots) });
  const edges: Partial<Record<BlockSide, BlockEdgeSpec>> = {};
  if (left.length > 0) edges.left = { items: left, distribution: aligned(ordinaryStart - controlPorts.length) };
  if (right.length > 0) edges.right = { items: right, distribution: aligned(ordinaryStart) };
  return edges;
}

/**
 * The PORT view (sketch 1): the region collapsed to a block. Header row
 * glyph + Title Type; the control ports first; a ruled line; then the
 * ordinary (boundary) ports — the left ones under the control ports, the
 * right ones starting BELOW the line, not beside a control port.
 *
 * WHY the right rail is pushed down rather than sharing rows (`inline`):
 * the line is a statement about the whole card — "above it is how you
 * drive the region, below it is what flows through" — so no ordinary port
 * may sit above it on either wall. The push is `offsetEdgePaddingPx`, the
 * same device `portLayout: "offset"` already uses to put one lane below
 * another.
 */
function RegionPortCard({
  id,
  heading,
  controlPorts,
  boundaryPorts,
}: {
  id: string;
  heading: RegionHeading;
  controlPorts: PortEdgeItem[];
  boundaryPorts: Partial<Record<"left" | "right", PortEdgeItem[]>>;
}) {
  const nControl = controlPorts.length;
  const slots = Math.max(nControl + (boundaryPorts.left?.length ?? 0), nControl + (boundaryPorts.right?.length ?? 0));
  const split = regionControlSplitPx(nControl);
  return (
    <BlockPort id={id} view="port" edges={sectionEdges(controlPorts, boundaryPorts, nControl)}>
      <Block
        width={REGION_CARD_WIDTH_PX}
        header={<RegionHeadingRow heading={heading} />}
        body={
          slots > 0 ? (
            <div
              data-slot="region-port-sections"
              // `flex: 1` (not `alignSelf: stretch`): the body is a flex ROW,
              // so stretch only reaches the height — the width has to grow
              // along the main axis, into the padding the margin gives back.
              style={{ position: "relative", flex: 1, margin: -BLOCK_BODY_PADDING_PX, height: regionRailBandPx(slots) }}
            >
              {split !== null && (
                <div
                  data-slot="region-control-split"
                  aria-hidden
                  style={{ position: "absolute", left: 0, right: 0, top: split - FRAME_BORDER_PX / 2, height: FRAME_BORDER_PX, background: REGION_STROKE }}
                />
              )}
            </div>
          ) : undefined
        }
      />
    </BlockPort>
  );
}

/**
 * The opaque FRAME face (sketches 3 and 4-right): the frame at its expanded
 * size, no members, the crossings now real ports on its walls, the control
 * ports split off (an L in the corner, or the full-width band), and the
 * glyph / Title / Type centred (`BlockOpaqueTitle`, the side-effect lane's
 * body for exactly this).
 *
 * WHY the face is ONE `BlockPort` + `Block` and not the frame div with
 * ports stuck on: the region's id must resolve to ONE box owning EVERY
 * port the opaque view shows — control ports and the promoted boundary
 * ports alike — because `wireLayer.tsx` takes the first `[data-block-id]`
 * and looks only inside it. Two id-carrying boxes (a header card and a
 * wall rail) would leave one set unresolvable. "The opaque card is the same
 * block with more ports" (docs/CONTROL-FLOW-PLAN.md §5), at the frame's size.
 */
function RegionOpaqueFrame({
  id,
  heading,
  fullWidth,
  controlPorts,
  boundaryPorts,
  width,
  height,
  toggle,
}: {
  id: string;
  heading: RegionHeading;
  fullWidth: boolean;
  controlPorts: PortEdgeItem[];
  boundaryPorts: Partial<Record<"left" | "right", PortEdgeItem[]>>;
  width: number;
  height: number;
  toggle: ReactNode;
}) {
  const nControl = controlPorts.length;
  // Full-width: the band is always there (it is the header), so ordinary
  // ports start under it even with no control ports at all.
  const ordinaryStart = fullWidth ? Math.max(nControl, 1) : nControl;
  const split = fullWidth ? regionHeaderBandPx(nControl) : regionControlSplitPx(nControl);
  return (
    <div data-slot="region-opaque-face" style={{ position: "relative", width, height }}>
      <BlockPort id={id} view="port" edges={sectionEdges(controlPorts, boundaryPorts, ordinaryStart)}>
        <Block
          width={width}
          height={height}
          body={
            fullWidth ? undefined : (
              <BlockOpaqueTitle
                glyph={heading.glyph !== undefined ? <Glyph content={heading.glyph} sizePreset="lg" /> : undefined}
                title={heading.title}
                type={heading.type}
              />
            )
          }
          // The FRAME's paint, not a card's: it is the same box the
          // expanded view drew, only with its inside hidden.
          style={{ background: "var(--bbox-region-fill-here, transparent)", boxShadow: "none", borderRadius: FRAME_RADIUS, borderColor: REGION_STROKE }}
        />
      </BlockPort>
      {fullWidth ? (
        <>
          <div
            data-slot="region-control-split"
            data-split="band"
            aria-hidden
            style={{ position: "absolute", left: 0, right: 0, top: split! - FRAME_BORDER_PX / 2, height: FRAME_BORDER_PX, background: REGION_STROKE, pointerEvents: "none" }}
          />
          <div
            data-slot="region-opaque-band"
            style={{ position: "absolute", left: 0, right: 0, top: 0, height: split!, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}
          >
            <RegionHeadingRow heading={heading} />
          </div>
        </>
      ) : (
        split !== null && (
          // "Line here shows visible split of control ports vs input ports"
          // (Zach's own annotation): an L — across under the control ports,
          // then up to the top wall — boxing them into the corner.
          <div
            data-slot="region-control-split"
            data-split="corner"
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: REGION_CONTROL_BOX_WIDTH_PX,
              height: split + FRAME_BORDER_PX / 2,
              borderRight: `${FRAME_BORDER_PX}px solid ${REGION_STROKE}`,
              borderBottom: `${FRAME_BORDER_PX}px solid ${REGION_STROKE}`,
              pointerEvents: "none",
            }}
          />
        )
      )}
      {toggle}
    </div>
  );
}

export function Region({
  id,
  kind = "group",
  view = "expanded",
  corner,
  cornerSize,
  width,
  height,
  members,
  arms,
  className,
  style,
  headerStyle = "corner-card",
  heading,
  controlPorts,
  boundaryPorts,
  opaqueFace = "card",
  onToggleView,
  crossings,
}: RegionProps) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const variant = useRegionVariant(root);
  const spec = REGION_VARIANTS[variant];
  const { ref: cornerRef, size } = useCornerSize(cornerSize);
  const layout = regionLayout({
    width: width ?? REGION_CORNER_WIDTH_PX,
    ...(height === undefined ? null : { height }),
    corner: size,
    armHeaderPx: spec.arms.headerPx,
    arms: (arms ?? []).map((arm) => ({
      id: arm.id,
      open: arm.open,
      ...(arm.bodyHeight === undefined ? null : { bodyHeight: arm.bodyHeight }),
    })),
  });

  /** Does THIS region paint the header rule at all? See the rule's own WHY
   *  below for the two halves. Computed here so the frame and any future
   *  reader agree on one answer. */
  const drawsHeaderRuleHere = kind !== "loop" && layout.arms.length > 0;

  const rootProps = {
    "data-slot": "region",
    "data-region-id": id,
    "data-region-kind": kind,
    "data-region-view": view,
    // Informational — which drawing this region resolved to. NOT the switch
    // attribute (`data-bbox-region-variant`), which stays the host's to
    // stamp: writing it here would shadow every ancestor's choice.
    "data-region-variant": variant,
    "data-region-header-style": headerStyle,
  } as const;

  const words = headingOf(id, heading);
  const toggleAt = (top: number): ReactNode =>
    onToggleView ? (
      <RegionViewToggle opaque={view !== "expanded"} onToggle={onToggleView} style={{ top, right: REGION_TOGGLE_INSET_PX }} />
    ) : null;

  // Sketch 1 — the region as a block. Root keeps the region id; the card
  // carries the block id (the one-owner rule, `RegionPortCard`).
  if (view === "port") {
    return (
      <div {...rootProps} ref={setRoot} className={className} style={{ width: "max-content", ...style }}>
        <RegionPortCard id={id} heading={words} controlPorts={controlPorts ?? []} boundaryPorts={boundaryPorts ?? {}} />
      </div>
    );
  }

  // Sketches 3 and 4-right — the opaque FRAME face, at the expanded size.
  if (view === "opaque" && opaqueFace === "frame") {
    const fullWidth = headerStyle === "full-width";
    return (
      <div
        {...rootProps}
        data-region-opaque-face="frame"
        ref={setRoot}
        className={className}
        style={{ position: "relative", width: "max-content", ...ISOLATED_ROOT_STYLE, ...style }}
      >
        <RegionOpaqueFrame
          id={id}
          heading={words}
          fullWidth={fullWidth}
          controlPorts={controlPorts ?? []}
          boundaryPorts={boundaryPorts ?? {}}
          width={layout.width}
          height={layout.height}
          toggle={toggleAt(fullWidth ? (regionHeaderBandPx((controlPorts ?? []).length) - REGION_TOGGLE_PX) / 2 : REGION_TOGGLE_INSET_PX)}
        />
      </div>
    );
  }

  // P5, opaque: the root wraps ONLY the card the host hands it. No frame,
  // no arms, no body — the whole point of the view is that the inside is
  // not drawn. The card's own ports and footer are the host's business
  // (`nodeViews.tsx`), which is why this branch renders `corner` untouched
  // — and why no variant token is read here: the opaque card is the host's
  // `Block`, and it reads the same in all five drawings by design.
  if (view === "opaque") {
    return (
      <div {...rootProps} ref={setRoot} className={className} style={{ width: "max-content", ...style }}>
        {corner}
      </div>
    );
  }

  return (
    <div
      {...rootProps}
      ref={setRoot}
      className={className}
      style={{
        position: "relative",
        width: "max-content",
        // The fill THIS frame paints, captured at the root: the token as
        // inherited from outside this region. The frame below re-declares
        // `--bbox-region-frame-fill` for its DESCENDANTS as the variant's
        // nested fill, so a region inside this one reads "one tone deeper"
        // while this frame itself still reads the outer value — the
        // capture on the root is what breaks the self-reference.
        ...({ "--bbox-region-fill-here": "var(--bbox-region-frame-fill, transparent)" } as CSSProperties),
        // The isolation invariant (paintOrder.ts): the crossing markers
        // below emit the `portDot` tier, so this root walls it off.
        ...ISOLATED_ROOT_STYLE,
        ...style,
      }}
    >
      <div
        data-slot="region-frame"
        data-region-id={id}
        style={{
          position: "relative",
          width: layout.width,
          height: layout.height,
          // Four widths so the bracket (`v4`) can open the right and the
          // bottom; every variant keeps the top and the left at
          // FRAME_BORDER_PX, the corner card's home.
          borderWidth: `var(--bbox-region-frame-stroke-widths, ${FRAME_BORDER_PX}px)`,
          borderStyle: "var(--bbox-region-frame-dash, solid)",
          borderColor: "var(--bbox-region-frame-stroke, var(--border))",
          borderRadius: `var(--bbox-region-frame-radii, ${FRAME_RADIUS})`,
          // Transparent by default, so a cable routed UNDER the frame still
          // reads, and `visible` so the corner card's wall dots may
          // straddle the frame's own edge instead of being clipped off at
          // it (plan §9's "no clip" default — and Zach's `115050`, where
          // the app's frame cut a port in half).
          background: "var(--bbox-region-fill-here)",
          overflow: "visible",
          // For descendants only (see the root's note): a nested frame
          // reads the variant's nested fill, or this frame's own fill when
          // the variant draws no nesting contrast.
          ...({ "--bbox-region-frame-fill": "var(--bbox-region-nested-fill, var(--bbox-region-fill-here))" } as CSSProperties),
        }}
      >
        {/*
          `v2`'s header RULE — the line Zach pointed at in `Pasted image
          20260919115353.png`: the corner card's bottom edge continued across
          the full width of the frame. Rendered BEFORE the corner so the
          card paints over its left run, and placed on the card's own bottom
          border row — the card is pulled back by FRAME_BORDER_PX, so its
          last pixel row is `corner.h - 2 * FRAME_BORDER_PX` in the frame's
          padding box — so the two are one line, not two a pixel apart.
          `display: none` unless the variant turns it on.

          WHY it is ALSO gated on having arms (Zach, 2026-09-20, on v9: "For
          loop and while loops like this no inside lines", against a Branch
          shown WITH them): this rule is the bottom edge of the HEADER BAND —
          it exists to divide the header from the titled arm rows underneath.
          A `for`/`while` region has no arms at all (`FOR_LOOP_PRESET.arms:
          []`; its body is the frame itself), so under v2/v9/v10 — the three
          variants that set `--bbox-region-header-rule-display: block` — it
          was drawing a full-width line across an empty body, dividing
          nothing from nothing.

          BOTH halves of the predicate are load-bearing. `arms.length > 0`
          is the honest test — the arm rows are what the line separates, so a
          branch that lost its arms loses the rule with them. `kind !== "loop"`
          is the belt: a loop must never draw it even holding malformed data,
          and that case is REAL, not hypothetical — `variants.smoke.test.tsx`'s
          own `regionOfKind` helper mints every kind with one `body` arm, so an
          arms-only gate would have kept painting the rule on the very for/while
          regions Zach is complaining about. A future arm-bearing kind (match /
          case) still keeps its rule, because only `"loop"` is excluded.

          The tempting alternative — scoping the token in `regionVariants.css`
          off the already-stamped `[data-region-kind]` — cannot work: this
          display is an INLINE style, so it outranks any stylesheet rule no
          matter how specific.
        */}
        <div
          data-slot="region-header-rule"
          aria-hidden
          style={{
            display: drawsHeaderRuleHere ? "var(--bbox-region-header-rule-display, none)" : "none",
            position: "absolute",
            left: 0,
            right: 0,
            top: layout.corner.h - 2 * FRAME_BORDER_PX,
            height: FRAME_BORDER_PX,
            background: "var(--bbox-region-header-rule-stroke, var(--border))",
            pointerEvents: "none",
          }}
        />
        <div
          ref={cornerRef}
          data-slot="region-corner"
          style={{
            position: "absolute",
            // Pulled back by the frame's border so the two borders land on
            // one line: the corner reads as PART of the frame, which is the
            // whole Labeled Group Node look.
            top: -FRAME_BORDER_PX,
            left: -FRAME_BORDER_PX,
            width: "max-content",
          }}
        >
          {headerStyle === "corner-card" ? (
            corner
          ) : headerStyle === "full-width" ? (
            <RegionHeaderCard id={id} heading={words} controlPorts={controlPorts ?? []} width={layout.width} />
          ) : (
            <RegionTab heading={words} full={headerStyle === "corner-tab-full"} />
          )}
        </div>
        <div
          data-slot="region-body"
          style={{ position: "absolute", left: 0, top: layout.body.y, width: "100%", height: layout.body.h }}
        >
          <BlockMembers
            layout="free"
            members={members ?? []}
            gap={0}
            gutter={0}
            insetBackground="none"
            showMembers
            showCards={false}
          />
        </div>
        {layout.arms.map((row, index) => (
          <ArmRow key={row.id} arm={(arms ?? [])[index]} row={row} index={index} chevron={spec.arms.chevron} />
        ))}
        {/* Last in DOM order: the toggle sits over a full-width header bar
            (vertically centred in it) or in the frame's top-right corner.
            The frame's children are laid out in its PADDING box, hence the
            border subtracted from the full-width centring. */}
        {toggleAt(
          headerStyle === "full-width"
            ? (layout.corner.h - REGION_TOGGLE_PX) / 2 - FRAME_BORDER_PX
            : REGION_TOGGLE_INSET_PX,
        )}
        <RegionCrossingMarkers points={crossings ?? []} />
      </div>
    </div>
  );
}
