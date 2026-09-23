"use client";

// src/components/blockRegion.tsx — BlockRegion: a thin scope FRAME with a
// real Block integral to its top-left corner, an optional free body, and an
// ordered list of arm rows. Props in, DOM out (docs/CONTROL-FLOW-PLAN.md
// §3.2); it imports no scene module and no canvas engine, so the same
// element renders under the DOM canvas, React Flow and tldraw unchanged.
//
// WHY "BlockRegion" and a composite rather than a frame with a slot (Zach,
// 2026-09-22: "Block Region is stanadlone component that composes the Block
// with a 'region'"): the corner IS a Block. Give it a `title` and this
// component draws that Block itself, `shape="region-corner"`, so the square
// junctions come with it. The Labeled Group is exactly that with nothing
// else (`blockRegion.labeledGroup.tsx`). A host that needs ports on the card
// still passes its own `BlockPort`-wrapped Block as `corner`, and gives that
// Block the same shape: the shape is the Block's, not the region's
// (block.tsx, `BlockShape`).
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
// ── THE VIEWS (Zach, 2026-09-22, `BlockRegionViews.stories.tsx`) ─────────
// "regions do not have a simple view. they just have port, expanded and
// expanded opaque view." So `view` is `port` | `expanded` | `opaque`, and
// there is deliberately no `simple`. `opaque` keeps its original meaning, the
// P5 card every host already draws, unless `opaqueFace="frame"` asks for
// Expanded Opaque: the frame at its expanded size, the members hidden, glyph +
// Title + Type centred. `onToggleView` draws the Blackbox toggle in the
// frame's top-right corner. Every one of these defaults to what this component
// drew before, so no host changes. The views are ported from the sibling
// branch's `region.tsx` (`view: "port"`, `opaqueFace: "frame"`,
// `RegionViewToggle`) and its `blockOpaqueTitle.tsx`, trimmed to the corner
// header this component already has.
//
// ── THE HEADER DRAWINGS (merge, 2026-09-22) ─────────────────────────────
// That trim said "no `headerStyle`, no `crossings`" — true while the two
// lineages were separate, and wrong the moment they merged, because both are
// Zach's own 2026-09-22 sketches and only this file survives to draw them.
// They are back, as two independent props that BOTH default to what this
// component already drew:
//   • `headerStyle` — how the expanded frame marks its top edge: today's
//     corner card (`corner-card`, the default), a small title tab
//     (`corner-tab` / `corner-tab-full`), or a header bar across the whole
//     top (`full-width`). The id rule survives every one: whichever element
//     owns the region's PORTS carries the ONE `data-block-id`; the root and
//     the frame carry only `data-region-id`; a tab owns no port and carries
//     neither.
//   • `crossings` — the small hollow circles where a cable crosses the
//     frame's wall, frame-local (`blockRegion.views.layout.ts`'s
//     `wallCrossings`, measured per host by `hosts/regionCrossings.ts`).
//     Decorative: no id, no pointer events, so nothing can bind to one. They
//     emit the `portDot` paint tier, which is why the expanded and opaque
//     roots spread `ISOLATED_ROOT_STYLE` (paintOrder.ts's invariant).
//
// WHY no region-level chevron anywhere in this file (Zach, 2026-09-22):
// "Please do not put chevron drop downs on the regions." The region's view
// changes through the Blackbox toggle and the host's view selector, never
// through a chevron on its corner. The chevrons that remain are the ARM
// rows' own fold controls (`ArmRow`), which fold one arm of a branch and
// never collapse the region itself.
//
// Pure: no React state beyond two measurements (the corner's box and the
// variant in force), no DOM outside its own subtree, no scene import (the
// `layering.test.ts` import wall).

import { useLayoutEffect, useState, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Square } from "lucide-react";

import { Bar } from "./bar";
import { Block, REGION_FRAME_RADIUS } from "./block";
import { BlockMembers, type BlockMember } from "./blockMembers";
import { BlockPort, type BlockEdgeSpec } from "./blockPort";
import { offsetEdgePaddingPx, RAIL_CROSS_PX, RAIL_GAP_PX, railAxisFor, railBoxFor, railPlanFor, type BlockBands } from "./blockPort.layout";
import { Button } from "./button";
import { FoldingChevron } from "./foldingChevron";
import { ControlMark, isControlMarkKind, type ControlMarkKind } from "./controlMark";
import { Badge } from "./badge";
import { Glyph } from "./glyph";
import type { Diagnostic } from "./highlighter";
import { LabeledPort } from "./labeledPort";
import { cn } from "../lib/utils";
import { ISOLATED_ROOT_STYLE, paintTier } from "./paintOrder";
import type { BlockSide } from "./port.layout";
import { PortEdge, type PortEdgeItem, type PortEdgeProps } from "./portEdge";
import {
  REGION_ARM_FADE_OPACITY,
  REGION_CARD_WIDTH_PX,
  REGION_CORNER_WIDTH_PX,
  REGION_MIN_WIDTH_PX,
  regionLayout,
  type RegionLayout,
} from "./blockRegion.layout";
import {
  REGION_CONTROL_BOX_WIDTH_PX,
  regionControlSplitPx,
  regionHeaderBandPx,
  regionRailBandPx,
  type RegionPoint,
} from "./blockRegion.views.layout";
import {
  DEFAULT_REGION_VARIANT,
  REGION_VARIANT_ATTR,
  REGION_VARIANTS,
  readRegionVariant,
  type RegionVariantId,
} from "../skin/regionVariants";

export type { RegionPoint } from "./blockRegion.views.layout";

export type RegionKind = "loop" | "branch" | "group";
/**
 * `port` is the region collapsed all the way to a block. There is
 * deliberately no `simple` (Zach, 2026-09-22: "regions do not have a simple
 * view").
 */
export type RegionView = "expanded" | "opaque" | "port";

/**
 * What `view="opaque"` draws. `card` is the P5 card (the host's own
 * `corner`, or the title card) and stays the default, so every host keeps
 * what it drew. `frame` is Zach's "Expanded Opaque": the frame keeps its
 * size, the members go, and glyph + Title + Type sit centred.
 */
export type RegionOpaqueFace = "card" | "frame";

/**
 * How the expanded frame marks its top edge (Zach, 2026-09-22).
 *  • `corner-card` — the Block in the corner (the default; `corner`,
 *    `cornerCard` or `title` supplies it, exactly as before this prop
 *    existed).
 *  • `corner-tab` — a small tab at the top-left with just the title.
 *  • `corner-tab-full` — the same tab with glyph + title + type.
 *  • `full-width` — a header bar across the frame's whole top; glyph + title
 *    + type centred, control ports (if any) stacked at its left end.
 *
 * WHY only `corner-card` reads `corner`/`cornerCard`: the other three are
 * drawings BlockRegion makes for itself out of `glyph`/`title`/`type` and
 * `controlPorts`, so a host that picks one is not also handing in a card.
 */
export type RegionHeaderStyle = "corner-card" | "corner-tab" | "corner-tab-full" | "full-width";

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
  /** This arm's OWN operand: the boolean it is selected by. `else` has none.
   *  Rendered as a port on the arm's header strip, left wall. */
  test?: { id: string; default?: string };
  /** Names this arm's PATTERN binds INTO its body (`case Point(x=0, y=y)`
   *  binds `y`) — a value the header PRODUCES, so it sits on the header's
   *  RIGHT edge, facing out of the tab. */
  captures?: readonly string[];
}

/** Text the measuring copy may render: a string or a number, never a node. */
export type RegionText = string | number;

/**
 * The chips a region corner's header carries on its right — a host's badge
 * ("iteration 3 of 7", `z⁻¹ = 0`) and control marks — as DATA, drawn by
 * BlockRegion itself (`Badge`, `ControlMark`). WHY data and not a node: see
 * `RegionCornerCard`.
 */
export interface RegionHeaderChips {
  badge?: RegionText;
  marks?: readonly ControlMarkKind[];
}

/**
 * The kit's own corner card, as DATA: BlockRegion renders it — a `BlockPort`
 * whose id is the region's, around a `Block` with `shape="region-corner"` —
 * so it can also render a measuring copy of it (see `RegionCornerProps`).
 *
 * `H` is what the header may hold: `RegionText` on the auto-measured path,
 * any node only where the caller gives `cornerSize` (`RegionCornerProps`).
 */
export interface RegionCornerCard<H extends ReactNode = RegionText> {
  header: H;
  chips?: RegionHeaderChips;
  /** Default `REGION_CORNER_WIDTH_PX`. */
  width?: number;
  /** The region's own ports, on the card's walls. */
  edges?: Partial<Record<BlockSide, BlockEdgeSpec>>;
  /** A body band under the header, px — room for a port-view rail. */
  bandHeight?: number;
  diagnostics?: Diagnostic[];
}

type CornerSize = { w: number; h: number };

/**
 * Where the corner comes from, and who sizes it.
 *
 * Expanded Opaque does not draw the corner, yet its box depends on the
 * corner's height (`regionLayout`). WHY the union and not an optional
 * `cornerSize` beside an optional `corner` (Codex audit + two re-judges,
 * 2026-09-22): the size either comes from content BlockRegion renders itself
 * — the `title` card or a `cornerCard` — which it can mount hidden and
 * measure, or it comes from the caller. What it must NEVER do is clone an
 * arbitrary `corner` ReactNode to measure it: a portal inside it (an open
 * Popover, a Tooltip) escapes every hiding ancestor and the copy shows up as
 * a second, visible, focusable widget. So an arbitrary `corner` whose region
 * can be opaque must carry `cornerSize` — enforced here by the types: with
 * `view` typed to allow `"opaque"`, the only branch that accepts a `corner`
 * requires `cornerSize`.
 */
export type RegionCornerProps =
  | {
      /** BlockRegion draws the corner itself: `cornerCard`, else `title` —
       *  PRIMITIVE text only, because this is the arm it measures by
       *  mounting a hidden copy (re-judge 3: a portal inside `title` or the
       *  header escapes every hiding ancestor, exactly as one inside
       *  `corner` did). */
      corner?: undefined;
      cornerCard?: RegionCornerCard<RegionText>;
      title?: RegionText;
      type?: RegionText;
      /** Skip the measurement when a host already knows the corner's box. */
      cornerSize?: CornerSize;
      view?: RegionView;
    }
  | {
      /** Rich title / type / header content: never copied, so the caller
       *  sizes the corner — whatever `view` says, because a view is runtime
       *  state a wrapper's default can flip to opaque (re-judge 4). */
      corner?: undefined;
      cornerCard?: RegionCornerCard<ReactNode>;
      title?: ReactNode;
      type?: ReactNode;
      cornerSize: CornerSize;
      view?: RegionView;
    }
  | {
      /** An arbitrary corner, supplied whole: never copied, so the caller
       *  sizes it — again regardless of `view`. */
      corner: ReactNode;
      cornerCard?: undefined;
      title?: ReactNode;
      type?: ReactNode;
      cornerSize: CornerSize;
      view?: RegionView;
    };

export type BlockRegionProps = BlockRegionBaseProps & RegionCornerProps;

interface BlockRegionBaseProps {
  /** Stamped as `data-region-id` on the root AND the frame — never
   *  `data-block-id`. See this file's header. */
  id: string;
  kind?: RegionKind;
  // `title` and `type` live in `RegionCornerProps`, typed per arm: the
  // corner card's title (with no `corner`/`cornerCard`, BlockRegion draws the
  // card itself, a header-only `Block` hugging it, rendered as authored), and
  // the secondary run beside it, muted.
  width?: number;
  /** Omitted = hug (`regionLayout`). */
  height?: number;
  /** The free body a loop/group drops into — `BlockMembers layout="free"`. */
  members?: BlockMember[];
  arms?: RegionArm[];
  /** `@bbox-ui/glyph-content` grammar (`lucide:repeat`). Drawn on the
   *  port card's header and, large, on the Expanded Opaque face. */
  glyph?: string;
  /**
   * The region's CONTROL ports (a loop's `Iterable`) when BlockRegion draws
   * its own corner from `title`: on the corner card's left wall while
   * expanded, above the split line in the `port` view, boxed into the
   * corner of the Expanded Opaque face. Ignored when `corner` is given (a
   * host's card already carries its ports).
   */
  controlPorts?: PortEdgeItem[];
  /**
   * The ORDINARY ports — the region's boundary. Drawn under the split in the
   * `port` view and on the walls of the Expanded Opaque face; the expanded
   * view never draws them, because there the cable crosses the wall itself.
   */
  boundaryPorts?: Partial<Record<"left" | "right", PortEdgeItem[]>>;
  /** Default `card`. */
  opaqueFace?: RegionOpaqueFace;
  /** Default `corner-card` — every caller that predates it renders exactly
   *  what it rendered before. See `RegionHeaderStyle`. */
  headerStyle?: RegionHeaderStyle;
  /**
   * Where wires cross the frame's border, FRAME-LOCAL (border-box top-left
   * is 0,0) — `blockRegion.views.layout.ts`'s `wallCrossings`, measured per
   * host by `hosts/regionCrossings.ts`. Each paints a small hollow circle on
   * the wall. Decorative only: not a port, no id, no pointer events, so
   * nothing can bind to one. Drawn in the EXPANDED view only — once the
   * inside is hidden a crossing is a real promoted port on the wall
   * (`boundaryPorts`), not a mark.
   */
  crossings?: readonly RegionPoint[];
  /** Present = draw the Blackbox toggle at the frame's top-right, in the
   *  expanded view and on the Expanded Opaque face. The caller owns the
   *  view; this only asks for it to flip. */
  onToggleView?(): void;
  /**
   * Extra class on the Blackbox toggle — a canvas host's pointer-ownership
   * marker (`nodrag`), the same seam `FoldingChevron`'s `className` gives
   * the hosts. This component never names the marker itself: which string
   * a host's drag filter reads is the host's business.
   */
  toggleClassName?: string;
  /** The footer of every view that hides the inside — the Expanded Opaque
   *  face AND the Port card: a host states what is hidden (`nodeViews.tsx`'s
   *  `region-hidden`, P5's "a card whose footer states what it hides").
   *  Omitted = no footer. */
  hiddenFooter?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** The frame's own border, px — the number the corner is pulled back by so
 *  the two borders sit on ONE line rather than doubling into a 2px rule.
 *  Every variant keeps this 1px of GEOMETRY (a variant may paint it
 *  transparent, never widen it), which is what keeps every row, member and
 *  dot exactly where it was under `v1`. */
const FRAME_BORDER_PX = 1;

/** The frame's shared top-left radius — the corner card's too, which is why
 *  it lives beside `Block`'s `"region-corner"` shape and is read from there:
 *  the frame and the card curve together only while they read one string. */
const FRAME_RADIUS = REGION_FRAME_RADIUS;

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

/**
 * An arm's own header strip as `BlockBands`, NOT measured: `regionLayout`
 * already knows this geometry in closed form (`row.headerTop`/`row.bodyTop`),
 * the same reason `blockRegion.layout.ts` exists at all. `blockLeft`/
 * `headerTop` are 0, not `row.rowTop`, because this rail mounts INSIDE
 * `region-arm-header` itself (its own `position: relative` box, below) — an
 * absolutely positioned child's `left`/`top: 0` already land on that div's
 * own padding edge, so the bands are local to the header strip, not to the
 * frame. `bodyTop`/`bodyBottom` both equal the strip's own height: an arm
 * header has no body band of its own to distinguish, and `railBoxFor`'s
 * `band: "header"` case (blockPort.layout.ts) never reads `bodyBottom` for
 * a column-axis edge.
 */
export function armHeaderBands(headerHeightPx: number, widthPx: number): BlockBands {
  return {
    blockLeft: 0,
    blockTop: 0,
    blockWidth: widthPx,
    blockHeight: headerHeightPx,
    headerTop: 0,
    bodyTop: headerHeightPx,
    bodyBottom: headerHeightPx,
  };
}

/**
 * One wall's `RailPlan` for an arm header rail — `railPlanFor`'s own
 * "expanded, column axis" rule (`space-evenly`, which centres a LONE dot in
 * the band — see that function's own WHY), with `band` overridden to
 * `"header"` afterward: the same `RailBand` (`blockPort.layout.ts`) an
 * ordinary Block's function port sits on.
 */
export function armHeaderRailPlan(edge: BlockSide, itemIds: string[]) {
  return {
    ...railPlanFor({ view: "expanded", portLayout: "inline", edge, itemIds, leadCount: 0, collapsePorts: false }),
    band: "header" as const,
  };
}

/**
 * ONE wall's rendered rail on an arm's header strip: `railBoxFor` (this
 * file's own header, "one geometry, two mount points") positioned exactly
 * as `blockPort.tsx`'s `BlockPortRail` positions a Block's own wall rail —
 * SAME function, not a second copy of its arithmetic.
 *
 * WHY this is its OWN small renderer and not a call to `BlockPortRail`
 * itself (tried first, reverted): `blockPort.tsx`'s `renderItem` hardcodes
 * `labelSlot={plan.band === "header" ? null : undefined}` — deliberately
 * blank for an ordinary Block's function port, which never has room for a
 * name on a title bar it shares with the block's own header content. An
 * arm's header IS the port's only content, so that rule is exactly
 * backwards here: bullet 5 of this lane's own acceptance requires the
 * `valueSet` arm's default to show, verbatim, right where the dot sits —
 * measured red against `BlockPortRail` (`DEBUG` capture, 2026-09-22: the
 * rendered slot was `port-label-slot` — empty — not `DefaultPortLabel`'s
 * `port-label`). `blockPort.tsx`'s own comment names the sanctioned
 * reach-past for exactly this case: "a caller who genuinely needs labels IN
 * the header band can still get them — supply a `portEdgeProps.renderItem`
 * of their own" — except `BlockPortRail` places its OWN `renderItem` last in
 * the `<PortEdge>` spread, so `portEdgeProps.renderItem` can never reach
 * past it from outside. This function IS that reach-past, done the only way
 * left: skip `BlockPortRail`, keep `railBoxFor`.
 */
function ArmHeaderRail({ edge, items, bands }: { edge: BlockSide; items: PortEdgeItem[]; bands: BlockBands }) {
  const plan = armHeaderRailPlan(
    edge,
    items.map((item) => item.id),
  );
  const box = railBoxFor(edge, plan, bands);
  const axis = railAxisFor(edge);
  // A BARE DOT — no label. Corrected 2026-09-22 after looking at the
  // captures: this rail used to draw `item.label`, and the arm's own title
  // (`if:`) is drawn by `ArmRow`'s Bar starting at the SAME x, so the two
  // strings painted straight through each other — `mode == "fast"` over
  // `if:` rendered as `modif:e == "fast"` in all five region drawings, and
  // the fold chevron was overdrawn too. No measured assertion caught it;
  // they all check the DOT's box, never text collision.
  //
  // WHY a bare dot rather than insetting the title past the label: the
  // reading order has to be `if: mode == "fast"`, and the rail sits at the
  // frame's LEFT edge, so anything it draws necessarily comes first. The
  // expression therefore belongs to the arm's header TEXT (ArmRow composes
  // it after the title), and the dot goes back to being just a dot. That
  // also puts this rail back in line with the rule `blockPort.tsx` already
  // applies to every header-band rail — a header's own content is the
  // label — instead of standing as the one exception to it.
  const renderItem: PortEdgeProps["renderItem"] = (item, ctx) => (
    <span data-slot="block-port-item" data-port-id={item.id} style={{ display: "inline-flex" }}>
      {/* `disabled`: an arm's own operand/capture has no `onItemsChange` of
          its own yet — read-only, the same default `BlockPortRail` applies
          to an unwired rail (P-037's own WHY). */}
      <LabeledPort edge={edge} state={item.state ?? "empty"} textLayout={ctx.textLayout} disabled labelSlot={null} />
    </span>
  );
  return (
    <div
      data-slot="block-port-rail"
      data-edge={edge}
      data-rail-band={plan.band}
      style={{
        position: "absolute",
        left: box.left,
        top: box.top,
        zIndex: paintTier("portDot"),
        // `railBoxFor`'s own margin note (blockPort.tsx's identical style):
        // half this box sits outside the header strip by construction, so a
        // press there must fall through to whatever is underneath.
        pointerEvents: "none",
      }}
    >
      <PortEdge
        id={`${edge}-rail`}
        edge={edge}
        items={items}
        showContainer={false}
        showCenterLine={false}
        showCard={false}
        size={axis === "column" ? { width: RAIL_CROSS_PX, height: box.height } : { width: box.width, height: RAIL_CROSS_PX }}
        distribution={plan.distribution}
        groups={plan.groups}
        groupMode={plan.groupMode}
        renderItem={renderItem}
      />
    </div>
  );
}

function ArmRow({
  arm,
  row,
  index,
  chevron,
  frameWidth,
}: {
  arm: RegionArm;
  row: RegionLayout["arms"][number];
  index: number;
  chevron: "always" | "hover";
  /** `layout.width` — the FRAME's own width. Never measured: `region-arm`'s
   *  own `left:0; right:0` already hug the frame's padding edge, so the
   *  header strip's real width is this minus the frame's two borders
   *  (`FRAME_BORDER_PX` each side), computed once below. */
  frameWidth: number;
}) {
  const active = arm.active ?? true;
  const headerHeightPx = row.bodyTop - row.headerTop;
  // The header strip's own padding-edge width — see `frameWidth`'s own doc.
  const headerWidthPx = frameWidth - 2 * FRAME_BORDER_PX;
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
        // The ARM's own id, never the region's (this file's header, "the id
        // rule"): `wireLayer.tsx`'s `resolveDot` takes the FIRST
        // `[data-block-id="<id>"]` in document order, so a wire targeting
        // this arm's test/capture id has to find ITS dot inside ITS OWN
        // `[data-block-id]`, not the region's corner card.
        data-block-id={arm.id}
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
              {/* The arm's operand, inline, AFTER its keyword — so the row
                  reads `if: mode == "fast"` in source order. This is Zach's
                  "in the title … we can support default variables so you
                  don't need to pass in everything with a pill": the dot on
                  the left wall says a value is expected and what state it is
                  in, this says what is in force while nothing is wired.
                  Rendered VERBATIM — spaces and quotes intact
                  (`feedback_truthful_property_rendering`); a cable landing
                  on the dot flips it to `wired` and this text is what the
                  cable overrides, never a second source of truth. */}
              {arm.test?.default === undefined ? null : (
                <span
                  data-slot="region-arm-test"
                  className="truncate"
                  style={{
                    fontFamily: "var(--bbox-region-arm-title-font)",
                    fontSize: "var(--bbox-region-arm-title-size)",
                    color: "var(--bbox-region-arm-title-color)",
                    opacity: 0.85,
                    // `pre` so the expression's OWN leading/trailing spaces
                    // survive (truthful property rendering) — which is also
                    // why the gap after the keyword is a margin and not a
                    // space character: a space here would be indistinguishable
                    // from one the author typed.
                    whiteSpace: "pre",
                    marginLeft: "0.4em",
                  }}
                >
                  {arm.test.default}
                </span>
              )}
            </>
          }
        />
        {/* This arm's OWN operand — `if`/`elif` only, `else` carries none
            (region.branch.ts's split). `label` is the default expression
            VERBATIM (truthful rendering: no trimming, no reformatting) —
            "" when there is none, which is how a wired-but-defaultless
            test renders no inline text at all. */}
        {arm.test !== undefined && (
          <ArmHeaderRail
            edge="left"
            items={[
              {
                id: arm.test.id,
                label: arm.test.default ?? "",
                state: arm.test.default !== undefined ? "valueSet" : "empty",
              },
            ]}
            bands={armHeaderBands(headerHeightPx, headerWidthPx)}
          />
        )}
        {/* The names this arm's PATTERN binds into its body — `match` only,
            mutually exclusive with `test` (region.branch.ts's split). One
            dot per capture, its own name as its label. */}
        {arm.captures !== undefined && arm.captures.length > 0 && (
          <ArmHeaderRail
            edge="right"
            items={arm.captures.map((name) => ({ id: name, label: name, state: "empty" }))}
            bands={armHeaderBands(headerHeightPx, headerWidthPx)}
          />
        )}
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

/**
 * The corner card BlockRegion draws for itself when it is given a `title` and
 * no `corner`: a header-only Block that hugs its title.
 *
 * WHY no header divider: the header is the whole card, so its rule would sit
 * on the card's own bottom border and double it. WHY it hugs instead of taking
 * `REGION_CORNER_WIDTH_PX`: this is the Labeled Group's label, and React Flow's
 * reference label is as wide as its text. A region whose card carries ports
 * passes its own sized card as `corner`.
 */
function TitleCorner({
  id,
  title,
  type,
  controlPorts,
  opaque,
  measureOnly = false,
}: {
  id: string;
  title: ReactNode;
  type?: ReactNode;
  controlPorts: PortEdgeItem[];
  opaque: boolean;
  /** The measuring copy: the same Block with no `BlockPort` — so no id, no
   *  rail, no dot. Only ever used on content BlockRegion renders itself. */
  measureOnly?: boolean;
}) {
  // The copy renders primitive text only — `primitiveOnly`'s WHY.
  const titleText = measureOnly ? primitiveOnly(title) : title;
  const typeText = measureOnly && type !== undefined ? primitiveOnly(type) : type;
  const header =
    typeText === undefined ? (
      titleText
    ) : (
      <span data-slot="region-corner-heading" style={{ display: "inline-flex", gap: 6, whiteSpace: "nowrap" }}>
        <span>{titleText}</span>
        <span data-slot="region-corner-type" className="text-muted-foreground">
          {typeText}
        </span>
      </span>
    );
  if (controlPorts.length === 0) {
    return <Block header={header} showHeaderDivider={false} shape={opaque ? "card" : "region-corner"} style={{ width: "max-content" }} />;
  }
  // With control ports the card is the region's INTERFACE, so it carries the
  // region's id (this file's header: the element owning the ports owns the
  // id). WHY a body sized by the rail band: `BlockPort` places a port-view
  // rail against the Block's BODY band, so a header-only card would hang its
  // dots below itself, into the frame — the same reason `nodeViews.tsx` gives
  // its corner a `region-corner-band`.
  const card = (
    <Block
      header={header}
      width={REGION_CORNER_WIDTH_PX}
      body={<div data-slot="region-corner-band" style={{ height: regionRailBandPx(controlPorts.length) }} />}
      shape={opaque ? "card" : "region-corner"}
    />
  );
  if (measureOnly) return card;
  return (
    <BlockPort id={id} view="port" edges={{ left: { items: controlPorts } }}>
      {card}
    </BlockPort>
  );
}

/**
 * The measuring copy's content guard: a string or a number renders, anything
 * else renders NOTHING.
 *
 * WHY, when the types already limit the auto-measured arm to `RegionText`
 * (Codex re-judge 3, 2026-09-22): a cast or an `any` reaches past a type, and
 * the cost of a node reaching the copy is a portal (an open Popover, a
 * Tooltip) escaping `visibility: hidden`/`aria-hidden`/`inert` as a second,
 * visible, focusable widget. A wrong height is the lesser failure, so the copy
 * accepts it rather than ever rendering a node.
 */
function primitiveOnly(content: ReactNode): RegionText | null {
  return typeof content === "string" || typeof content === "number" ? content : null;
}

/** `RegionCornerCard` drawn. `measureOnly` is the same Block without the
 *  `BlockPort` — the id-free, dot-free measuring copy. */
function CornerCardView({
  id,
  card,
  opaque,
  measureOnly = false,
}: {
  id: string;
  card: RegionCornerCard<ReactNode>;
  opaque: boolean;
  measureOnly?: boolean;
}) {
  const text = measureOnly ? primitiveOnly(card.header) : card.header;
  // The copy's chips pass the same guard as its text: a badge that is not a
  // string/number, and any mark that is not a known `ControlMarkKind`, is
  // dropped from the copy — `primitiveOnly`'s WHY, for fields the types
  // already narrow but a cast, plain JS or a spread can still reach.
  const chips: RegionHeaderChips | undefined =
    measureOnly && card.chips !== undefined
      ? {
          badge: card.chips.badge === undefined ? undefined : (primitiveOnly(card.chips.badge) ?? undefined),
          marks: (Array.isArray(card.chips.marks) ? card.chips.marks : []).filter(isControlMarkKind),
        }
      : card.chips;
  const header =
    chips !== undefined && (chips.badge !== undefined || (chips.marks?.length ?? 0) > 0) ? (
      // The same Bar a block node's header takes when it has chips
      // (`nodeViews.tsx`'s `headerOf`): name left, chips right.
      <Bar
        size="md"
        left={text}
        right={
          <>
            {chips.badge !== undefined && (
              <Badge size="sm" variant="secondary">
                {chips.badge}
              </Badge>
            )}
            {(chips.marks ?? []).map((mark) => (
              <ControlMark key={mark} mark={mark} />
            ))}
          </>
        }
      />
    ) : (
      text
    );
  const block = (
    <Block
      header={header}
      width={card.width ?? REGION_CORNER_WIDTH_PX}
      body={card.bandHeight === undefined ? undefined : <div data-slot="region-corner-band" style={{ height: card.bandHeight }} />}
      shape={opaque ? "card" : "region-corner"}
      diagnostics={card.diagnostics}
    />
  );
  if (measureOnly) return block;
  return (
    <BlockPort id={id} view="port" edges={card.edges ?? {}}>
      {block}
    </BlockPort>
  );
}

/* ------------------------------------------------------------------ */
/* The views and the header drawings (Zach, 2026-09-22) — grown from    */
/* the sibling branch's `region.tsx`, which the 09-22 merge retired:    */
/* its RegionViewToggle is this file's BlockRegionBlackboxToggle, and   */
/* RegionPortCard / RegionOpaqueFrame / RegionTab / RegionHeaderCard /  */
/* RegionCrossingMarkers came across whole.                             */
/* ------------------------------------------------------------------ */

/** `block.tsx`'s body is `p-2`. The port card's section box cancels it with
 *  a negative margin so the split line is placed in the SAME coordinates
 *  the rail packs from (the body band's top), not 8px lower. */
const BLOCK_BODY_PADDING_PX = 8;

/** Inset of the Blackbox toggle from the frame's top-right corner. */
const REGION_TOGGLE_INSET_PX = 4;
/** `Button size="icon-xs"` is `size-6` — the toggle's own box, needed to
 *  centre it vertically in a full-width header band. */
const REGION_TOGGLE_PX = 24;

/** The wall-crossing marker's diameter and stroke — "a small HOLLOW CIRCLE
 *  sits on the wall". */
export const REGION_CROSSING_MARKER_PX = 10;
const REGION_CROSSING_STROKE_PX = 1.5;

const REGION_STROKE = "var(--bbox-region-frame-stroke, var(--border))";

/**
 * The Blackbox toggle: hollow square while expanded, FILLED while the
 * inside is hidden. The stock `Button`, so press and focus ring are
 * shadcn's.
 *
 * WHY no background behind the pressed state, only a hover ring (Zach,
 * 2026-09-22): "Once this toggle is toggled can you please not have the
 * background be a lighter grey? thats annoying. It should be more seamless."
 * The filled square alone says "pressed"; a grey plate behind it made the
 * toggle read as a button parked on the frame rather than part of it. So the
 * ghost variant's `hover:bg-muted` is replaced by a ring, at rest and pressed
 * alike. The tempting alternative, shadcn's `Toggle` with its
 * `data-pressed:bg-muted`, is exactly the lighter grey he rejected.
 *
 * WHY a square and not a `FoldingChevron`: a chevron reads "fold this row"
 * (the arms use it for exactly that), and Zach asked for no chevrons on
 * regions at all. The square is his mark for "show the inside / hide it".
 */
export function BlockRegionBlackboxToggle({
  pressed,
  onToggle,
  className,
  style,
}: {
  pressed: boolean;
  onToggle?(): void;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Button
      data-slot="region-blackbox-toggle"
      data-state={pressed ? "opaque" : "expanded"}
      variant="ghost"
      size="icon-xs"
      aria-label="Blackbox toggle"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cn("hover:bg-transparent hover:ring-1 hover:ring-ring/50 dark:hover:bg-transparent", className)}
      style={{ position: "absolute", top: REGION_TOGGLE_INSET_PX, right: REGION_TOGGLE_INSET_PX, ...style }}
    >
      <Square aria-hidden fill={pressed ? "currentColor" : "none"} />
    </Button>
  );
}

/** glyph · Title · Type on one line, centred — the port card's header. */
function RegionHeadingRow({ glyph, title, type }: { glyph?: string; title: ReactNode; type?: ReactNode }) {
  return (
    <div data-slot="region-heading" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap" }}>
      {glyph !== undefined && <Glyph content={glyph} sizePreset="sm" />}
      <span data-slot="region-heading-title" style={{ fontWeight: 600 }}>
        {title}
      </span>
      {type !== undefined && (
        <span data-slot="region-heading-type" className="text-muted-foreground">
          {type}
        </span>
      )}
    </div>
  );
}

/**
 * The corner TAB — Zach's sketches 2(a) and 2(b). Shaped like the corner card
 * (shares the frame's top-left radius, square where it meets the frame's
 * edges, rounded at its one free corner) but it is a LABEL, not a Block.
 *
 * WHY it carries no `data-block-id`: it owns no port. The id rule (this
 * file's header) is that the element holding the region's PORTS carries the
 * id; a tab-drawn region has no interface card, so there is nothing for a
 * wire to resolve and nothing may claim the id. A region that needs ports
 * uses `corner-card` or `full-width`.
 *
 * WHY the radii are written out rather than taken from `Block`'s
 * `shape="region-corner"`: this is not a Block. Restating the four corners
 * here is the whole of the duplication, and they read from the SAME
 * `FRAME_RADIUS` string the frame and the shape both read, so a drawing that
 * changes the region's radius moves all three together.
 */
function RegionTab({ glyph, title, type, full }: { glyph?: string; title: ReactNode; type?: ReactNode; full: boolean }) {
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
      <RegionHeadingRow glyph={full ? glyph : undefined} title={title} type={full ? type : undefined} />
    </div>
  );
}

/**
 * The FULL-WIDTH header — Zach's sketches 2(c), 5 and 6. A real `BlockPort`
 * whose id IS the region's, stretched across the frame, its control ports on
 * its own left wall (which is the frame's left wall).
 *
 * WHY this bar, and not the frame or the root, carries `data-block-id`:
 * the id rule is "the element that owns the region's ports owns its id".
 * With a full-width header the control ports live INSIDE the bar ("ONE
 * control port at the left end INSIDE the header bar"), so the bar is the
 * interface card — the corner card, grown to the frame's width, exactly the
 * `v10` "band" reading ("its just the block is stretch accross the entire
 * width of the region", Zach 2026-09-20). A wire into a control port
 * therefore resolves through the same `[data-block-id]` → `[data-port-id]`
 * walk as ever, and `wireLayer.tsx`'s first-match lookup still finds a box
 * that owns the dot. Stamping the frame instead would win that lookup and
 * strand every control-port wire — the failure this file's header names.
 */
function RegionHeaderCard({
  id,
  glyph,
  title,
  type,
  controlPorts,
  width,
}: {
  id: string;
  glyph?: string;
  title: ReactNode;
  type?: ReactNode;
  controlPorts: PortEdgeItem[];
  width: number;
}) {
  return (
    <BlockPort id={id} view="port" edges={controlPorts.length > 0 ? { left: { items: controlPorts } } : {}}>
      <Block
        width={width}
        // One band formula for this bar AND the opaque face's band, so the
        // rule does not jump when the toggle flips (`regionHeaderBandPx`).
        height={regionHeaderBandPx(controlPorts.length)}
        body={<RegionHeadingRow glyph={glyph} title={title} type={type} />}
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
 * The wall-crossing markers (Zach's sketches 4 and 6): a small hollow circle
 * wherever a cable crosses the frame. Laid over the frame's BORDER box
 * (`inset: -1px` from the padding box the frame's children see), so a
 * frame-local point from `wallCrossings` is used as-is.
 *
 * Painted at `portDot` (paintOrder.ts): the marker sits where a port WOULD
 * be — on the wall, above the frame's own content — and the region root that
 * emits the tier is `isolation: isolate`, so it can never climb over
 * anything outside this region.
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

/**
 * The Expanded Opaque face's centre: a large glyph, then Title over Type.
 * Ported from the sibling branch's `blockOpaqueTitle.tsx` (`BlockOpaqueTitle`)
 * as a private piece, because this lineage has no such component and only
 * this face uses it.
 */
function RegionOpaqueTitle({ glyph, title, type }: { glyph?: string; title: ReactNode; type?: ReactNode }) {
  return (
    <div data-slot="region-opaque-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {glyph !== undefined && <Glyph content={glyph} sizePreset="lg" />}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.2 }}>
        <span data-slot="region-opaque-title-name" style={{ fontWeight: 600 }}>
          {title}
        </span>
        {type !== undefined && (
          <span data-slot="region-opaque-title-type" className="text-muted-foreground" style={{ fontSize: 12 }}>
            {type}
          </span>
        )}
      </div>
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
 * The PORT view: the region collapsed to a block. Header row glyph + Title
 * Type; the control ports first; a ruled line; then the ordinary (boundary)
 * ports — the left ones under the control ports, the right ones starting
 * BELOW the line, not beside a control port.
 *
 * WHY the right rail is pushed down rather than sharing rows: the line is a
 * statement about the whole card — "above it is how you drive the region,
 * below it is what flows through" — so no ordinary port may sit above it on
 * either wall. The push is `offsetEdgePaddingPx`, the device
 * `portLayout: "offset"` already uses to put one lane below another.
 */
function RegionPortCard({
  id,
  glyph,
  title,
  type,
  controlPorts,
  boundaryPorts,
  footer,
}: {
  id: string;
  glyph?: string;
  title: ReactNode;
  type?: ReactNode;
  controlPorts: PortEdgeItem[];
  boundaryPorts: Partial<Record<"left" | "right", PortEdgeItem[]>>;
  footer?: ReactNode;
}) {
  const nControl = controlPorts.length;
  const slots = Math.max(nControl + (boundaryPorts.left?.length ?? 0), nControl + (boundaryPorts.right?.length ?? 0));
  const split = regionControlSplitPx(nControl);
  return (
    <BlockPort id={id} view="port" edges={sectionEdges(controlPorts, boundaryPorts, nControl)}>
      <Block
        width={REGION_CARD_WIDTH_PX}
        header={<RegionHeadingRow glyph={glyph} title={title} type={type} />}
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
        footer={footer}
      />
    </BlockPort>
  );
}

/**
 * The frame's own box paint — widths, dash, colour, radii, fill — shared by
 * the expanded frame and the Expanded Opaque face.
 *
 * WHY one function and not the face imitating the frame with a restyled
 * Block (Codex audit, 2026-09-22): a Block carries its own border on all
 * four sides and one radius on every corner, so under `v4`'s open bracket
 * (`1px 0 0 1px`, asymmetric radii) pressing the toggle closed the bracket
 * into a full box, and under the default skin the border jumped 1px → 2px.
 * Every token the frame reads, the face now reads through this ONE object,
 * so the two cannot drift. (BlockRegion is to become a Block preset — this
 * is the minimal local fix, not that refactor.)
 */
function frameBoxStyle(width: number, height: number): CSSProperties {
  return {
    position: "relative",
    width,
    height,
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
  };
}

/**
 * The Expanded Opaque face: the frame at its expanded size, no members, the
 * boundary ports on its walls, the control ports boxed into the corner by an
 * L, and glyph / Title / Type centred.
 *
 * WHY ONE `BlockPort` + `Block` and not the frame div with ports stuck on:
 * the region's id must resolve to ONE box owning EVERY port the face shows,
 * because `wireLayer.tsx` takes the first `[data-block-id]` and looks only
 * inside it. Two id-carrying boxes would leave one set unresolvable.
 */
function RegionOpaqueFrame({
  id,
  glyph,
  title,
  type,
  fullWidth,
  controlPorts,
  boundaryPorts,
  width,
  height,
  toggle,
  footer,
}: {
  id: string;
  glyph?: string;
  title: ReactNode;
  type?: ReactNode;
  /** The expanded drawing was `headerStyle="full-width"`, so the face keeps
   *  its band instead of boxing the control ports into an L. */
  fullWidth: boolean;
  controlPorts: PortEdgeItem[];
  boundaryPorts: Partial<Record<"left" | "right", PortEdgeItem[]>>;
  width: number;
  height: number;
  toggle: ReactNode;
  footer?: ReactNode;
}) {
  // Full-width: the band is always there (it IS the header), so the ordinary
  // ports start under it even with no control ports at all.
  const ordinaryStart = fullWidth ? Math.max(controlPorts.length, 1) : controlPorts.length;
  const split = fullWidth ? regionHeaderBandPx(controlPorts.length) : regionControlSplitPx(controlPorts.length);
  return (
    // The paint is the FRAME's (`frameBoxStyle`) — the same box the expanded
    // view drew, only with its inside hidden, which is also why the pressed
    // toggle has no plate of its own to sit on.
    <div data-slot="region-opaque-face" style={frameBoxStyle(width, height)}>
      {/*
        The ports' owner: an INVISIBLE Block laid exactly over the frame's
        border box (pulled back by the top/left border every variant keeps at
        FRAME_BORDER_PX), so its rails put the dots ON the frame's walls. Its
        own border is transparent and keeps its width, so the box — and every
        dot — is where a visible one would be; what paints is the frame.
      */}
      <div style={{ position: "absolute", top: -FRAME_BORDER_PX, left: -FRAME_BORDER_PX }}>
        <BlockPort id={id} view="port" edges={sectionEdges(controlPorts, boundaryPorts, ordinaryStart)}>
          <Block
            width={width}
            height={height}
            // Full-width: the words live in the BAND below, not in the middle
            // of the face — the band is the header this drawing had while it
            // was expanded, so the toggle must not move them.
            body={fullWidth ? undefined : <RegionOpaqueTitle glyph={glyph} title={title} type={type} />}
            footer={footer}
            style={{ background: "transparent", boxShadow: "none", borderColor: "transparent", borderRadius: FRAME_RADIUS }}
          />
        </BlockPort>
      </div>
      {fullWidth ? (
        <>
          {/*
            WHY `split - 2 * FRAME_BORDER_PX` and not `split - ½px`: this line
            has to land on the exact pixel row the EXPANDED drawing's header
            card painted its own bottom border on, or the rule visibly jumps
            when the toggle is pressed. The band's box starts at
            `-FRAME_BORDER_PX` in this padding box (border-box y = 0) and is
            `split` tall, so its last border row is border-box
            `[split-1, split]` — which is `split - 2` here. It is the same
            expression `region-header-rule` uses against `layout.corner.h` in
            the expanded frame, for the same reason and against the same box
            (a full-width region's `corner.h` IS `regionHeaderBandPx`).
          */}
          <div
            data-slot="region-control-split"
            data-split="band"
            aria-hidden
            style={{
              position: "absolute",
              left: -FRAME_BORDER_PX,
              right: -FRAME_BORDER_PX,
              top: split! - 2 * FRAME_BORDER_PX,
              height: FRAME_BORDER_PX,
              background: REGION_STROKE,
              pointerEvents: "none",
            }}
          />
          <div
            data-slot="region-opaque-band"
            style={{
              position: "absolute",
              left: -FRAME_BORDER_PX,
              right: -FRAME_BORDER_PX,
              top: -FRAME_BORDER_PX,
              height: split!,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <RegionHeadingRow glyph={glyph} title={title} type={type} />
          </div>
        </>
      ) : (
        split !== null && (
          // An L — across under the control ports, then up to the top wall —
          // boxing them into the corner, split from the ordinary ports.
          <div
            data-slot="region-control-split"
            data-split="corner"
            aria-hidden
            style={{
              position: "absolute",
              left: -FRAME_BORDER_PX,
              top: -FRAME_BORDER_PX,
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

export function BlockRegion({
  id,
  kind = "group",
  view = "expanded",
  title,
  corner: givenCorner,
  cornerCard,
  cornerSize,
  width,
  height,
  members,
  arms,
  glyph,
  type,
  controlPorts,
  boundaryPorts,
  opaqueFace = "card",
  headerStyle = "corner-card",
  crossings,
  onToggleView,
  toggleClassName,
  hiddenFooter,
  className,
  style,
}: BlockRegionProps) {
  const corner =
    givenCorner ??
    (cornerCard !== undefined ? (
      <CornerCardView id={id} card={cornerCard} opaque={view === "opaque"} />
    ) : title === undefined ? null : (
      <TitleCorner id={id} title={title} type={type} controlPorts={controlPorts ?? []} opaque={view === "opaque"} />
    ));
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const variant = useRegionVariant(root);
  const spec = REGION_VARIANTS[variant];
  const fullWidthHeader = headerStyle === "full-width";
  // `regionLayout` applies exactly this clamp to `width`, so computing it
  // here cannot drift from `layout.width` — and the full-width header has to
  // know the frame's width BEFORE the layout runs, because it IS the corner
  // whose height the layout is waiting for.
  const frameWidth = Math.max(width ?? REGION_CORNER_WIDTH_PX, REGION_MIN_WIDTH_PX);
  // WHY a full-width header is never MEASURED: its height is a closed form
  // of the control-port count (`regionHeaderBandPx`), the same number the
  // Expanded Opaque band uses — so declaring it here keeps the two faces on
  // one formula AND removes the first-frame guess a measurement would need.
  // A tab and a corner card still measure: both hug their own content.
  const declaredCornerSize = fullWidthHeader ? { w: frameWidth, h: regionHeaderBandPx((controlPorts ?? []).length) } : cornerSize;
  const { ref: cornerRef, size } = useCornerSize(declaredCornerSize);
  const layout = regionLayout({
    width: frameWidth,
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

  // The words the port card, the tab, the full-width bar and the opaque face
  // paint for themselves. The id is the fallback because it is the one
  // truthful name a region always has.
  const words = { glyph, title: title ?? id, type };

  /** The toggle, placed: vertically centred in a full-width header band,
   *  else in the frame's top-right corner (the toggle's own default inset).
   *  The band's box starts at `-FRAME_BORDER_PX` in the padding box it is
   *  placed in, which is where the subtraction comes from — and because a
   *  full-width region's `corner.h` IS `regionHeaderBandPx`, the expanded
   *  frame and the Expanded Opaque face read the identical expression, so
   *  the square does not move when pressed. */
  const toggleNode = onToggleView ? (
    <BlockRegionBlackboxToggle
      pressed={view === "opaque"}
      onToggle={onToggleView}
      className={toggleClassName}
      {...(fullWidthHeader ? { style: { top: (layout.corner.h - REGION_TOGGLE_PX) / 2 - FRAME_BORDER_PX } } : null)}
    />
  ) : null;

  // Expanded Opaque does not draw the corner, yet its size depends on the
  // corner's height (`regionLayout`), and a region loaded straight into it
  // was sized off the fallback height (0) and grew when toggled open and
  // shut. So, unless the caller already gave `cornerSize`, it mounts a
  // hidden copy of the expanded-view corner purely to measure it — and ONLY
  // of content it renders itself (`cornerCard`, the `title` card), built
  // without a `BlockPort`, so the copy has no id, rail or dot for
  // `wireLayer` to resolve. An arbitrary `corner` is never copied (it could
  // hold a portal); `RegionCornerProps` makes its caller pass `cornerSize`.
  //
  // A TAB is BlockRegion's own drawing too, so it is copied under the same
  // guard: its words go through `primitiveOnly`, never a caller's node. A
  // FULL-WIDTH header is never copied at all — `declaredCornerSize` already
  // knows its height in closed form.
  const measureCorner =
    headerStyle === "corner-tab" || headerStyle === "corner-tab-full" ? (
      <RegionTab
        glyph={glyph}
        title={primitiveOnly(words.title) ?? ""}
        type={words.type === undefined ? undefined : (primitiveOnly(words.type) ?? undefined)}
        full={headerStyle === "corner-tab-full"}
      />
    ) : givenCorner !== undefined ? null : cornerCard !== undefined ? (
      <CornerCardView id={id} card={cornerCard} opaque={false} measureOnly />
    ) : title === undefined ? null : (
      <TitleCorner id={id} title={title} type={type} controlPorts={controlPorts ?? []} opaque={false} measureOnly />
    );
  const measureTwin = declaredCornerSize === undefined && view === "opaque" && opaqueFace === "frame" ? measureCorner : null;

  // Port: the region as a block. The root keeps the region id; the card
  // carries the block id (the one-owner rule, `RegionPortCard`). No toggle:
  // the Blackbox toggle flips Expanded ⇄ Expanded Opaque, and leaving Port
  // is the host's view selector's job.
  if (view === "port") {
    return (
      <div {...rootProps} ref={setRoot} className={className} style={{ width: "max-content", ...style }}>
        <RegionPortCard id={id} {...words} controlPorts={controlPorts ?? []} boundaryPorts={boundaryPorts ?? {}} footer={hiddenFooter} />
      </div>
    );
  }

  // Expanded Opaque: the frame's box with its inside hidden, at the size the
  // expanded view laid out.
  if (view === "opaque" && opaqueFace === "frame") {
    return (
      <div
        {...rootProps}
        data-region-opaque-face="frame"
        ref={setRoot}
        className={className}
        style={{
          position: "relative",
          width: "max-content",
          ...({ "--bbox-region-fill-here": "var(--bbox-region-frame-fill, transparent)" } as CSSProperties),
          // The isolation invariant (paintOrder.ts): this root's subtree can
          // emit the `portDot` tier, so it walls it off. Harmless when it
          // does not — `isolation: isolate` changes nothing a root without a
          // z-indexed descendant could observe.
          ...ISOLATED_ROOT_STYLE,
          ...style,
        }}
      >
        <RegionOpaqueFrame
          id={id}
          {...words}
          fullWidth={fullWidthHeader}
          controlPorts={controlPorts ?? []}
          boundaryPorts={boundaryPorts ?? {}}
          width={layout.width}
          height={layout.height}
          footer={hiddenFooter}
          // Placed in the face's padding box, exactly as the expanded frame
          // places it — the face IS the frame's box now, so the square does
          // not move by a pixel when pressed.
          toggle={toggleNode}
        />
        {measureTwin !== null && (
          <div
            ref={cornerRef}
            data-slot="region-corner-measure"
            aria-hidden
            inert
            style={{ position: "absolute", top: 0, left: 0, width: "max-content", visibility: "hidden", pointerEvents: "none" }}
          >
            {measureTwin}
          </div>
        )}
      </div>
    );
  }

  // P5, opaque: the root wraps ONLY the corner card — the host's, or with
  // `title` the one `TitleCorner` draws, which turns itself back into a plain
  // `card` here. No frame, no arms, no body — the whole point of the view is
  // that the inside is not drawn. The card's own ports and footer are the
  // host's business (`nodeViews.tsx`), which is why this branch renders
  // `corner` untouched — and why no variant token is read here: the opaque
  // card reads the same in every drawing by design.
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
        // The isolation invariant (paintOrder.ts): the crossing markers below
        // emit the `portDot` tier, so this root walls it off.
        ...ISOLATED_ROOT_STYLE,
        ...style,
      }}
    >
      <div
        data-slot="region-frame"
        data-region-id={id}
        style={{
          ...frameBoxStyle(layout.width, layout.height),
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
          ) : fullWidthHeader ? (
            <RegionHeaderCard id={id} {...words} controlPorts={controlPorts ?? []} width={layout.width} />
          ) : (
            <RegionTab {...words} full={headerStyle === "corner-tab-full"} />
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
          <ArmRow key={row.id} arm={(arms ?? [])[index]} row={row} index={index} chevron={spec.arms.chevron} frameWidth={layout.width} />
        ))}
        {/* Last in DOM order, so it paints over any member or arm row that
            reaches the top-right corner without needing a z-index. */}
        {toggleNode}
        <RegionCrossingMarkers points={crossings ?? []} />
      </div>
    </div>
  );
}
