/**
 * src/scene/fitToContent.ts — "fit to content" as pure arithmetic.
 *
 * Zach, 2026-09-18 (PROJECT - Black Box UI.md, "### Fit to content"): a
 * Block should grow with what is on it — with its PORT COUNT in port view,
 * with its MEMBERS' extents in expanded view — and "even in manual mode I
 * think it would make sense actually if it resizes.. I think we should
 * likely have a minimum height for blocks based on the number of ports
 * they have."
 *
 * ───────────────────────────────────────────────────────────────────────
 * WHY THIS IS A NEW MODULE AND NOT A `Block` PROP
 *
 * `Block` already takes `height?: number` ("Omit to hug the rendered
 * regions", block.tsx:73). Everything below computes the NUMBER a caller
 * passes to that existing prop. No component needs a new prop for the
 * three cases Zach named — the missing piece was never a component
 * capability, it was the arithmetic, and arithmetic is exactly what
 * CLAUDE.md's governing rule says is portable ("Layout geometry is
 * portable and lives in the core; interaction geometry ... is host-owned").
 *
 * That is also why this file imports no React and no engine: it is props
 * in, numbers out, unit-testable with no DOM.
 *
 * ───────────────────────────────────────────────────────────────────────
 * PROVENANCE — the RULES are SystemSketch's; the ARITHMETIC is ours
 *
 * `/home/bam/systemsketch/src/blocks/` was read (read-only) on 2026-09-18.
 * Not one line is copied: the donor computes over its own shape props and
 * its own constants (`NODE_ROW_HEIGHT_PX` = 44, a tldraw shape's `w`/`h`),
 * and this kit has neither. Each function below cites the donor line whose
 * BEHAVIOUR it reproduces, and derives the number from THIS kit's own
 * exported constants instead. Per `.claude/feedback.md`'s algorithm-
 * provenance rule, see `docs/ALGORITHM-PROVENANCE.md` for the row-by-row
 * classification.
 *
 *   • `railBandHeightForSlots` ← donor `layoutBlock.ts:495-517`
 *     (`blockPortViewHeightForSlots`) — the same "inverse of the clamp"
 *     idea, over our constants.
 *   • `portViewSlotCount`      ← donor `layoutBlock.ts:461` (`planBodySlots`,
 *     `outputStart = slot + inputs.length`) via `blockPortSlotCount` (:490).
 *   • `railPitchForBand`       ← donor `layoutBlock.ts:1434`
 *     (`pitch = Math.min(NODE_ROW_HEIGHT_PX, available / plan.slotCount)`)
 *     — reproduced as a DETECTOR, not as a layout step (see its own doc).
 *   • `fitBoxToMembers`        ← donor `blockAutoResize.ts:87-118`
 *     (`Box.FromPoints` + a uniform pad), with the uniform pad deliberately
 *     NOT ported — see that function's own WHY.
 *   • `resolveBlockHeight`     — ours, ad hoc. No prior art claimed; it is
 *     three lines of `Math.max` expressing Zach's "floored, not overridden".
 */
import {
  PORT_EDGE_SLOT_MIN_PX,
  RAIL_END_MARGIN_PX,
  RAIL_GAP_PX,
  RAIL_MAIN_INSET_PX,
  type BlockPortLayout,
} from "../components/blockPort.layout";
import { CONTAINER_BORDER, CONTAINER_PADDING, interSlotGapPx, type Distribution } from "../components/portEdge.layout";

/* ------------------------------------------------------------------ */
/* 1 · The band a rail needs — the inverse of the clamp                */
/* ------------------------------------------------------------------ */

export interface RailBandMetrics {
  /** Main-axis size of one slot box. Default: the rail's own slot size. */
  slotMainPx?: number;
  /** The port-to-port gap the band must be able to afford. */
  gapPx?: number;
  /** `RailPlan.endMarginPx` — the inset applied at BOTH ends of the rail's
   *  content box. Zero for a body-band rail, `RAIL_END_MARGIN_PX` for a
   *  wall-spanning one. */
  endMarginPx?: number;
  /**
   * The rail's own `Distribution`. Omit for `aligned`, which is port
   * view's left/right-only default.
   *
   * WHY this is a parameter at all — a finding, not a guess: the required
   * band is NOT the same for every distribution, because the space-*
   * schemes spend some of the band on END gaps that `aligned` does not
   * have. Sizing a band for `aligned` and then rendering it
   * `space-around` drops the real pitch from 42px to 33px, a silent 21%
   * squeeze — measured by `fitToContent.test.ts`'s
   * "holds the full pitch in EVERY distribution", which failed exactly
   * this way on its first run and is the reason this field exists.
   */
  distribution?: Distribution;
}

/**
 * How many gap-widths a distribution spends across `slotCount` boxes.
 *
 * Straight from CSS Box Alignment Level 3's normative definitions, already
 * quoted in `portEdge.layout.ts`'s `mainAxisPositions` docblock (spec read
 * 2026-09-17 at https://www.w3.org/TR/css-align-3/) — read the gap count
 * off each definition rather than re-deriving it:
 *
 *   • `aligned`       — a real flexbox `gap`, only BETWEEN boxes → n-1.
 *   • `space-between` — flush at both ends, gaps only between     → n-1.
 *   • `space-around`  — a HALF gap at each end (two halves = one)  → n.
 *   • `space-evenly`  — a FULL gap at each end                     → n+1.
 */
function gapCountFor(slotCount: number, distribution?: Distribution): number {
  if (slotCount <= 0) return 0;
  if (distribution == null || distribution.mode === "aligned") return slotCount - 1;
  switch (distribution.scheme) {
    case "space-between":
      return slotCount - 1;
    case "space-around":
      return slotCount;
    case "space-evenly":
      return slotCount + 1;
  }
}

/**
 * The band height at which `slotCount` slots all keep their FULL pitch.
 *
 * ── The derivation, because it is the whole point of this function ──
 *
 * `blockPort.layout.ts`'s `railBoxFor` turns a band into a track box:
 *
 *     trackMain = (bandEnd - endMargin) - (bandStart + endMargin)
 *                 + 2 * RAIL_MAIN_INSET_PX
 *
 * and `portEdge.tsx`'s track then spends `CONTAINER_BORDER` +
 * `CONTAINER_PADDING` on each side before its first slot box. Since
 * `RAIL_MAIN_INSET_PX` is DEFINED as `CONTAINER_BORDER + CONTAINER_PADDING`
 * (blockPort.layout.ts:101), those two cancel exactly and the usable
 * content main is simply:
 *
 *     contentMain = band - 2 * endMargin
 *
 * `n` slot boxes at full pitch need `n*slot + (n-1)*gap`. Setting the two
 * equal and solving for the band gives the return value below.
 *
 * ── WHY: the coupling this docblock would otherwise only warn about ──
 *
 * The donor's own comment at `layoutBlock.ts:497-501` says it plainly:
 * "`layoutBlock` compresses `pitch` to whatever room is left, so adding a
 * port to a full box silently squeezes every existing row. This is the
 * exact inverse of that clamp and therefore lives beside it: any change to
 * the body's padding or to the footer has to move both numbers together or
 * neither."
 *
 * A comment cannot enforce that. So the cancellation above is pinned as a
 * ROUND-TRIP TEST instead (`fitToContent.test.ts`, "the RAIL_MAIN_INSET_PX
 * cancellation"): the test feeds this function's output through the REAL
 * `railBoxFor` and the REAL `CONTAINER_BORDER`/`CONTAINER_PADDING`, and
 * asserts the content main lands on exactly `n*slot + (n-1)*gap`. Change
 * `CONTAINER_PADDING` without `railBoxFor` following — or hardcode `16`
 * where `RAIL_MAIN_INSET_PX` belongs — and that test goes red instead of
 * this file quietly disagreeing with the renderer.
 *
 * Returns 0 for `slotCount <= 0`: an unpopulated edge imposes no floor at
 * all, which is what keeps `Block`'s "omit height to hug" contract intact
 * for every Block that has no ports (see `resolveBlockHeight`).
 */
export function railBandHeightForSlots(slotCount: number, metrics: RailBandMetrics = {}): number {
  const { slotMainPx = PORT_EDGE_SLOT_MIN_PX, gapPx = RAIL_GAP_PX, endMarginPx = 0, distribution } = metrics;
  if (slotCount <= 0) return 0;
  return slotCount * slotMainPx + gapCountFor(slotCount, distribution) * gapPx + 2 * endMarginPx;
}

/* ------------------------------------------------------------------ */
/* 2 · How many slots a port-view Block actually needs                 */
/* ------------------------------------------------------------------ */

export interface PortViewSlotInput {
  /** Ports on the left (input) wall. */
  leftCount: number;
  /** Ports on the right (output) wall. */
  rightCount: number;
  /** `blockPort.layout.ts`'s `BlockPortLayout`. */
  portLayout: BlockPortLayout;
}

/**
 * The number of slot positions a port-view Block's body band must hold.
 *
 * Donor `planBodySlots` (`layoutBlock.ts:461`): outputs start at slot
 * `inputs.length` under the offset layout, and share row `i` with input
 * `i` under the inline one. Restated over this kit's two rails:
 *
 *   • `inline` — the two rails are independent columns packed from the same
 *     band top, so the band only has to satisfy the LONGER one.
 *   • `offset` — the right rail is pushed down by
 *     `offsetEdgePaddingPx(leftCount) = leftCount * (slot + gap)`, so the
 *     two lanes stack end-to-end.
 *
 * WHY `offset` collapses to a plain sum rather than needing its own height
 * formula (this is a derivation, not an assumption — `fitToContent.test.ts`
 * pins it): the offset rail's required content is
 * `edgePadding + nR*slot + (nR-1)*gap`, and substituting
 * `edgePadding = nL*(slot + gap)` gives
 * `(nL+nR)*slot + (nL+nR-1)*gap` — algebraically identical to
 * `railBandHeightForSlots(nL + nR)`. So one band formula serves both
 * layouts, and `offset` is just a different slot COUNT. That is worth
 * knowing: it means a future third port layout only has to answer "how many
 * slots?", never "how tall?".
 */
export function portViewSlotCount({ leftCount, rightCount, portLayout }: PortViewSlotInput): number {
  const left = Math.max(0, leftCount);
  const right = Math.max(0, rightCount);
  return portLayout === "offset" ? left + right : Math.max(left, right);
}

/* ------------------------------------------------------------------ */
/* 3 · The minimum Block height a port count implies                   */
/* ------------------------------------------------------------------ */

export interface BlockPortViewMinHeightInput extends PortViewSlotInput, RailBandMetrics {
  /** Measured height of the Block's header region, px. 0 when headerless. */
  headerPx?: number;
  /** Measured height of the Block's footer region, px. 0 when footerless. */
  footerPx?: number;
}

/**
 * The smallest `Block` height at which every port on a port-view Block
 * keeps its full pitch — Zach's "a minimum height for blocks based on the
 * number of ports they have", in pixels.
 *
 * Donor analogue: `blockPortViewHeightForSlots` (`layoutBlock.ts:502-517`),
 * whose sum is `headerHeight + rowHeaderGap + rowHeight*n + rowBottomPad +
 * descriptionReserve + footer`. Three of those six terms are donor-only
 * chrome this kit does not render (`NODE_ROW_HEADER_GAP_PX`,
 * `NODE_ROW_BOTTOM_PADDING_PX`, `descriptionReserve`), so they are dropped
 * rather than invented — the honest port is header + band + footer, where
 * the band is this file's own `railBandHeightForSlots`.
 *
 * `headerPx`/`footerPx` are MEASURED, not derived: a Block hugs its
 * content, so any closed form over props lies the moment a header wraps —
 * the same reasoning `blockPort.layout.ts`'s `BlockBands` already rests on
 * (its own docblock, D-A5). A caller that has not measured yet passes 0 and
 * gets the band alone, which is a floor that is too LOW rather than one
 * that is wrong in an unbounded direction.
 */
export function blockPortViewMinHeight(input: BlockPortViewMinHeightInput): number {
  const { headerPx = 0, footerPx = 0 } = input;
  const slots = portViewSlotCount(input);
  return headerPx + railBandHeightForSlots(slots, input) + footerPx;
}

/* ------------------------------------------------------------------ */
/* 4 · The compression detector                                        */
/* ------------------------------------------------------------------ */

/**
 * The centre-to-centre pitch a band ACTUALLY produces — the number that
 * silently shrinks when a Block is too short for its ports.
 *
 * This is deliberately a DETECTOR, not a layout step. Nothing in this kit
 * calls it to place anything; `portEdge.tsx` places slots with real
 * flexbox. It exists so a test can assert "every existing row kept its
 * pitch" as a NUMBER, and so a story can show the squeeze happening.
 *
 * ── What it reproduces, and the finding it encodes ──
 *
 * Donor `layoutBlock.ts:1434`:
 *     pitch = Math.min(NODE_ROW_HEIGHT_PX, available / plan.slotCount)
 *
 * i.e. donor pitch is `A/n` whenever the box is crowded — proportional
 * squeeze, capped at 44.
 *
 * This kit reaches the same `C/n` by a different road, and only on one of
 * its two distribution modes:
 *
 *   • `aligned` (port view, left/right walls only) — flexbox `gap` is a
 *     CONSTANT and `portEdge.tsx:490` sets `flexShrink: 0` on every slot
 *     box. Pitch therefore NEVER compresses; the slots OVERFLOW the band
 *     instead. Loud, not silent.
 *   • `distribute` (expanded view, and port view whenever a top/bottom
 *     wall is populated) — `interSlotGapPx` divides the free space by the
 *     slot count, so `pitch = slot + (C - n*slot)/n = C/n` exactly, down to
 *     a floor of `slot` once free space runs out. That IS the donor's
 *     `A/n`. Same bug, same shape, arrived at through CSS Box Alignment
 *     rather than through an explicit `Math.min`.
 *
 * Both are the same root cause: `C`, the band, is not a function of `n`.
 * That is what `railBandHeightForSlots` exists to fix, and why fixing it
 * fixes both modes at once.
 */
export function railPitchForBand(
  bandPx: number,
  slotCount: number,
  distribution: Distribution,
  metrics: RailBandMetrics = {},
): number {
  const { slotMainPx = PORT_EDGE_SLOT_MIN_PX, endMarginPx = 0 } = metrics;
  if (slotCount <= 0) return 0;
  // The same cancellation `railBandHeightForSlots` derives, applied forward.
  const contentMainPx = Math.max(0, bandPx - 2 * endMarginPx);
  return slotMainPx + interSlotGapPx(distribution, contentMainPx, slotCount, slotMainPx);
}

/**
 * True when `bandPx` is too small for `slotCount` slots at full pitch —
 * i.e. the band is in the regime where `aligned` overflows and
 * `distribute` squeezes. The one-line predicate a story or a host can
 * branch on without re-deriving the inequality.
 */
export function railBandIsCrowded(bandPx: number, slotCount: number, metrics: RailBandMetrics = {}): boolean {
  return bandPx < railBandHeightForSlots(slotCount, metrics);
}

/* ------------------------------------------------------------------ */
/* 5 · Fit a parent to its members                                     */
/* ------------------------------------------------------------------ */

export interface MemberRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FitBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MemberFitInsets {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

/**
 * The smallest box containing every member, grown by `insets`.
 *
 * Donor `blockAutoResize.ts:87-118` (`blockAutoResizePresentation`) is the
 * behaviour: collect the children's local-space points, `Box.FromPoints`
 * them, then expand by a padding on every side. The traversal there is
 * tldraw's (`getShapeLocalTransform`, `getShapeGeometry().vertices`) —
 * irrelevant here, where a member already carries a plain `{x, y}`
 * (`blockMembers.tsx`'s `BlockMember`) and renders at `width: max-content`.
 * So the ARITHMETIC below — min/max over rect corners — is ours, and it is
 * the ordinary axis-aligned bounding box; no prior art is claimed for it.
 *
 * ── WHY the donor's `BLOCK_AUTO_RESIZE_PADDING_PX = 56` is NOT ported ──
 *
 * That constant is a WORKAROUND, not a design value, and the donor says so
 * in its own words (`blockAutoResize.ts:21-27`): "`fitFrameToContent`
 * intentionally exposes one stock padding value, so this is the smallest
 * safe value for the 48px header rather than a hand-rolled asymmetric frame
 * algorithm." The 56 is 48px of header plus a little air, smeared onto all
 * four sides because tldraw's stock helper takes a single scalar.
 *
 * This kit has no such constraint: a `Block`'s header and footer are real
 * flow elements with their own measured heights, and the members region is
 * a sibling of both. Porting 56 would put 56px of dead space on the LEFT
 * and RIGHT of every fitted Block to pay for a header that is not there.
 * So insets are per-side and default to `BLOCK_MEMBER_INSET_PX` — the
 * gutter the members region already uses — and the header/footer are added
 * by `blockExpandedFitHeight` below, from measurement, exactly once, on the
 * one axis where they exist.
 *
 * Returns `null` for an empty member list, matching the donor's "stock
 * leaves an empty frame alone" rule (`blockAutoResize.ts:220-223`: "That
 * preserves the useful manual starting box until there is an actual child
 * to fit") — an empty container keeps whatever size it had rather than
 * collapsing to nothing.
 */
export function fitBoxToMembers(members: readonly MemberRect[], insets: MemberFitInsets = {}): FitBox | null {
  if (members.length === 0) return null;
  const { top = 0, right = 0, bottom = 0, left = 0 } = insets;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const m of members) {
    if (!Number.isFinite(m.x) || !Number.isFinite(m.y) || !Number.isFinite(m.width) || !Number.isFinite(m.height)) {
      // A non-finite member would poison the whole box. Skip it rather than
      // return NaN — the donor guards the same way at the other end
      // (`blockAutoResize.ts:110`, "every Number.isFinite" before commit).
      continue;
    }
    minX = Math.min(minX, m.x);
    minY = Math.min(minY, m.y);
    maxX = Math.max(maxX, m.x + m.width);
    maxY = Math.max(maxY, m.y + m.height);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;

  return {
    x: minX - left,
    y: minY - top,
    width: maxX - minX + left + right,
    height: maxY - minY + top + bottom,
  };
}

export interface BlockExpandedFitInput {
  members: readonly MemberRect[];
  headerPx?: number;
  footerPx?: number;
  /** Per-side inset around the members' bounds. Defaults to the members
   *  region's own gutter on all four sides. */
  insets?: MemberFitInsets;
}

/**
 * The `Block` height that exactly contains its free-layout members —
 * Zach's "in expanded view — dynamically resizes as you drag the members
 * children around".
 *
 * WHY this needs a computed number at all, when the members region is
 * already a flex child: `blockMembers.tsx:157-167` positions every
 * free-layout member `position: absolute`, and its own region comment
 * (`:308-312`) states the consequence outright — "A free region needs the
 * Block to carry an explicit height — absolutely positioned members
 * contribute none, same as a canvas." So CSS hugging, which handles header
 * and footer, is structurally incapable of seeing members. This function is
 * the number that closes that gap.
 *
 * Note the fit uses the members' bounds relative to the REGION's own
 * origin, and adds `y`'s own offset back in: a member dragged to `y = 400`
 * makes the block taller even if the topmost member is still at `y = 0`,
 * because the region starts at the region's top, not at the topmost member.
 * That is `maxY + bottom`, not `bounds.height`.
 */
export function blockExpandedFitHeight({ members, headerPx = 0, footerPx = 0, insets }: BlockExpandedFitInput): number | null {
  if (members.length === 0) return null;
  const resolved: MemberFitInsets = {
    top: insets?.top ?? DEFAULT_MEMBER_INSET_PX,
    right: insets?.right ?? DEFAULT_MEMBER_INSET_PX,
    bottom: insets?.bottom ?? DEFAULT_MEMBER_INSET_PX,
    left: insets?.left ?? DEFAULT_MEMBER_INSET_PX,
  };
  const box = fitBoxToMembers(members, resolved);
  if (!box) return null;
  // The region's own top is 0, so the band the region must be given is the
  // members' FARTHEST bottom edge plus the bottom inset — not the bounds'
  // height, which would ignore a gap above the topmost member.
  const regionHeight = box.y + box.height;
  return headerPx + Math.max(0, regionHeight) + footerPx;
}

/**
 * The members region's own gutter (`blockMembers.tsx:67`,
 * `BLOCK_MEMBER_INSET_PX`), re-declared rather than imported because
 * `blockMembers.tsx` is a React component module and this file imports no
 * React. A duplicated constant that must match is only safe when a
 * mismatch is loud, so `fitToContent.test.ts` asserts the two are equal by
 * reading the component module's own export.
 */
export const DEFAULT_MEMBER_INSET_PX = 12;

/* ------------------------------------------------------------------ */
/* 6 · The floor — "even in manual mode ... it resizes"                */
/* ------------------------------------------------------------------ */

export interface ResolveBlockHeightInput {
  /** The height a user set by dragging, or a scene stored. `undefined`
   *  means "no explicit height" — Block's existing hug-the-content mode. */
  manualHeightPx?: number;
  /** Whether auto-fit is ON for this Block. */
  autoFit: boolean;
  /** What auto-fit computed (`blockExpandedFitHeight`, or
   *  `blockPortViewMinHeight`). `null`/`undefined` when there is nothing to
   *  fit to — an empty container, say. */
  fitHeightPx?: number | null;
  /** The floor a port count imposes — `blockPortViewMinHeight`. */
  minHeightPx?: number;
}

/**
 * The single place that decides what goes into `Block`'s `height` prop.
 *
 * Zach, 2026-09-18: "even in manual mode I think it would make sense
 * actually if it resizes.. I think we should likely have a minimum height
 * for blocks based on the number of ports they have".
 *
 * ── WHY `Math.max` and never assignment ──
 *
 * The floor RAISES a too-short Block and leaves everything else alone.
 * Three properties fall out of that, and all three are pinned in
 * `fitToContent.test.ts`:
 *
 *   1. A manual height LARGER than the floor is returned untouched — a
 *      deliberate drag is never "corrected" out from under the user, which
 *      is the difference between a floor and auto-fit-always-on.
 *   2. A manual height SMALLER than the floor is raised to it — the ports
 *      can no longer be squeezed (`aligned`) or overflowed (`distribute`),
 *      which is the whole bug.
 *   3. With NO manual height and a floor of 0, this returns `undefined`,
 *      so `Block` keeps hugging exactly as it does today. The feature is
 *      strictly additive: a Block with no ports and no members is
 *      byte-identical to before this module existed.
 *
 * The tempting alternative this rejects: making auto-fit the default and
 * treating a manual height as a hint. That reads as "smart" and is exactly
 * what makes fit-to-content feel buggy — the box moves when the user did
 * not ask it to. Zach flagged the donor as "very buggy"; a floor cannot
 * produce that class of surprise because it only ever moves a box that was
 * already displaying its content wrongly.
 */
export function resolveBlockHeight({
  manualHeightPx,
  autoFit,
  fitHeightPx,
  minHeightPx = 0,
}: ResolveBlockHeightInput): number | undefined {
  const floor = Math.max(0, minHeightPx);

  if (autoFit) {
    const fit = fitHeightPx ?? manualHeightPx ?? 0;
    // Auto-fit still respects the floor: a container fitted to one tiny
    // member must not end up shorter than its own ports need.
    const height = Math.max(fit, floor);
    return height > 0 ? height : undefined;
  }

  if (manualHeightPx == null) {
    // No explicit height: keep Block hugging unless the floor actually
    // binds. `undefined` here is load-bearing — it is what preserves
    // block.tsx's "Omit to hug the rendered regions" contract.
    return floor > 0 ? floor : undefined;
  }

  return Math.max(manualHeightPx, floor);
}
