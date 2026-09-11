/**
 * bbox-ui layout — the portable geometry of the kit.
 *
 * This module is deliberately free of React (and of any canvas engine).
 * WHY: layout geometry is portable and lives here; interaction geometry
 * (hit-testing, snapping, z-order, drag) is host-owned and never travels.
 * Both host adapters (React Flow, tldraw) and any future renderer consume
 * these numbers instead of re-measuring the wireframe. See ARCHITECTURE.md.
 *
 * Every constant below is measured from the authoritative wireframe,
 * `bbox-ui-v2.systemsketch` — not invented.
 */

/* ------------------------------------------------------------------ */
/* Text size rungs                                                     */
/* ------------------------------------------------------------------ */

/**
 * The three text rungs, named on the board as
 * `Medium (h3)` / `Large (h2)` / `Extra Large (h1)`.
 */
export const TEXT_SIZES = {
  md: 24,
  lg: 36,
  xl: 44,
} as const;

export type TextSize = keyof typeof TEXT_SIZES;

export const TEXT_SIZE_NAMES: Record<TextSize, string> = {
  md: "Medium (h3)",
  lg: "Large (h2)",
  xl: "Extra Large (h1)",
};

/** Small metadata text (description, type, chip) — the board's `s` rung. */
export const META_FONT_PX = 18;

/**
 * Glyph (icon) size is derived from the title size, never set independently.
 * WHY: board rule, written by Zach — "The Icon and Title always go next to
 * each other. The icon should resize with the title text size." 0.9 × 44 ≈ 40
 * reproduces the face he already approved; the rungs become 44→40, 36→32, 24→22.
 */
export const ICON_RATIO = 0.9;

export function glyphPx(size: TextSize): number {
  return Math.round(TEXT_SIZES[size] * ICON_RATIO);
}

/* ------------------------------------------------------------------ */
/* Block — Simple View                                                 */
/* ------------------------------------------------------------------ */

/** Simple View container, measured: 384 × 258, solid stroke, no fill. */
export const SIMPLE_BLOCK = {
  width: 384,
  height: 258,
} as const;

/** Tag chip (e.g. `Draft 1`): oval, measured 102 × 39. */
export const CHIP = {
  minWidth: 102,
  height: 39,
} as const;

/**
 * Stroke width of the Block container border (`border-2` on `Block`). CSS
 * absolute positioning resolves against a *padding* box, so this stroke
 * shifts a host's coordinate origin; placement math elsewhere compensates
 * so no adapter has to know.
 *
 * INTEGRATION (T1-SPEC.md §0): the port dot's own ring width used to live
 * here as `PORT_RING_PX`, alongside this constant — it is now
 * `PORT_SURFACE_RING_PX`/`PORT_STATE_RING_PX` in the rebuilt
 * `port.layout.ts`, deleted from here with the rest of the old Port
 * section. `BLOCK_BORDER_PX` itself stays — Block's own fact, not Port's.
 */
export const BLOCK_BORDER_PX = 2;

/* ------------------------------------------------------------------ */
/* Header + chip — the chip reserves a region, it is not just aligned  */
/* ------------------------------------------------------------------ */

/** Horizontal padding inside the Block container (`px-4` on `Block`). */
export const BLOCK_PADDING_X = 16;

/**
 * Chip inset from the container's right edge, measured: container right
 * 4915, chip oval right 4887 → 28.
 */
export const CHIP_INSET_RIGHT = 28;

/**
 * Clear gap between the title's right edge and the chip's left edge,
 * measured: chip left 4785, title right 4775 → 10.
 */
export const CHIP_TITLE_GAP = 10;

/**
 * Width available to the header's content (glyph + title).
 *
 * Without a chip: the normal padded width — container border and `px-4`
 * padding off both sides.
 *
 * With a chip: `containerWidth − CHIP_INSET_RIGHT − CHIP.minWidth −
 * CHIP_TITLE_GAP`. WHY: on the board the chip is not merely right-aligned —
 * it RESERVES its region, and the title's room ends before it. The earlier
 * out-of-flow chip kept a centred title from shifting when a tag appeared,
 * but traded a shift for a collision (the chip painted over the title's
 * last letters), and a collision is worse. A title that no longer fits
 * truncates with a visible ellipsis, never a silent clip.
 */
export function headerContentWidth(
  containerWidth: number = SIMPLE_BLOCK.width,
  hasChip: boolean = false,
): number {
  if (hasChip) {
    return containerWidth - CHIP_INSET_RIGHT - CHIP.minWidth - CHIP_TITLE_GAP;
  }
  return containerWidth - 2 * (BLOCK_BORDER_PX + BLOCK_PADDING_X);
}

/**
 * CSS `right` for the chip, absolutely positioned inside the header. The
 * header spans the Block's *padding* box (already `BLOCK_BORDER_PX +
 * BLOCK_PADDING_X` inside the container edge), so the container-edge inset
 * is re-expressed in that frame here, once.
 */
export const CHIP_RIGHT_IN_HEADER_PX =
  CHIP_INSET_RIGHT - BLOCK_BORDER_PX - BLOCK_PADDING_X;

/**
 * CSS `padding-right` the header takes on while it hosts a chip: the chip's
 * span plus both clearances, in the header's own frame. This is what makes
 * the chip a *reservation* — the flexed title can never extend into it, so
 * the title's box and the chip's box cannot intersect, whatever the title
 * says. For any container width, the header content's right limit under
 * this padding lands exactly `headerContentWidth(width, true)` from the
 * container's left edge.
 */
export const HEADER_CHIP_RESERVED_PX =
  CHIP_RIGHT_IN_HEADER_PX + CHIP.minWidth + CHIP_TITLE_GAP;

