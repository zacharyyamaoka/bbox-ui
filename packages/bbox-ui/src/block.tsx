import { Children, isValidElement, type ComponentProps } from "react";

import { cn } from "./lib/utils";
import {
  CHIP,
  CHIP_RIGHT_IN_HEADER_PX,
  HEADER_CHIP_RESERVED_PX,
  META_FONT_PX,
  SIMPLE_BLOCK,
  TEXT_SIZES,
  glyphPx,
  type TextSize,
} from "./layout";

/**
 * Block anatomy (Zach's vocabulary — the component API uses these names):
 * Container, Header band, Glyph (icon), Text slot, Chip. (Disclosure, Dot,
 * Port and Region arrive with later views.)
 */

export interface BlockProps extends ComponentProps<"div"> {
  /** Container size. Defaults to the Simple View spec, 384 × 258. */
  width?: number;
  height?: number;
}

/**
 * Container — Simple View. Content is horizontally centered; the header
 * band and description center vertically while `BlockType` pins to the
 * bottom edge, matching the wireframe's five variants.
 */
export function Block({
  width = SIMPLE_BLOCK.width,
  height = SIMPLE_BLOCK.height,
  className,
  style,
  ...props
}: BlockProps) {
  return (
    <div
      data-slot="block"
      className={cn(
        "relative flex flex-col items-center justify-center gap-1 border-2 border-foreground bg-card px-4 text-center text-card-foreground",
        className,
      )}
      style={{ width, height, ...style }}
      {...props}
    />
  );
}

export interface BlockHeaderProps extends ComponentProps<"header"> {
  orientation?: "horizontal" | "vertical";
}

/**
 * Header band: Glyph + Title, with an optional Chip out of flow on the
 * right. `vertical` stacks the Glyph above the Title (the board's
 * icon-above-title variant).
 *
 * When a Chip is among the children, the header reserves the chip's region
 * (`HEADER_CHIP_RESERVED_PX` of right padding) and lets the title truncate
 * with a visible ellipsis inside what remains.
 * WHY: the chip used to be purely out of flow so a centred title never
 * shifted when a tag appeared — but that traded a shift for a collision
 * (the chip painted over the title's last letters), and a collision is
 * worse. The board's own geometry says the chip RESERVES its span: title
 * right edge 10px clear of the chip, chip 28px in from the container edge.
 */
export function BlockHeader({
  orientation = "horizontal",
  className,
  style,
  children,
  ...props
}: BlockHeaderProps) {
  // WHY detect the chip instead of taking a `hasChip` prop: adapters already
  // state "chip present" by rendering <BlockChip>; a flag would be the same
  // fact answered a second time in every adapter (the layout.ts rule: any
  // mapping that appears in both adapters is a bug).
  const hasChip = Children.toArray(children).some(
    (child) => isValidElement(child) && child.type === BlockChip,
  );
  return (
    <header
      data-slot="block-header"
      data-orientation={orientation}
      data-has-chip={hasChip || undefined}
      className={cn(
        "relative flex w-full items-center justify-center gap-2",
        orientation === "vertical" && "flex-col gap-1",
        // min-w-0 lets the flexed title actually shrink below its text;
        // truncate ellipsizes it — never a silent clip, never text under
        // the chip. Scoped to chip-bearing headers so a chipless block
        // renders exactly as before.
        hasChip &&
          "[&>[data-slot=block-title]]:min-w-0 [&>[data-slot=block-title]]:truncate",
        className,
      )}
      style={
        hasChip ? { paddingRight: HEADER_CHIP_RESERVED_PX, ...style } : style
      }
      {...props}
    >
      {children}
    </header>
  );
}

export interface BlockGlyphProps extends ComponentProps<"span"> {
  /** Title rung the glyph rides on — the glyph never sizes independently. */
  size?: TextSize;
}

/**
 * Glyph (icon). Sized at 0.9 × the title font size.
 * WHY: board rule, written by Zach — "The Icon and Title always go next to
 * each other. The icon should resize with the title text size." Sizing is
 * derived, not a free prop, so the two can never drift apart.
 */
export function BlockGlyph({
  size = "xl",
  className,
  style,
  ...props
}: BlockGlyphProps) {
  const px = glyphPx(size);
  return (
    <span
      data-slot="block-glyph"
      className={cn(
        "flex shrink-0 items-center justify-center leading-none [&>svg]:h-full [&>svg]:w-full",
        className,
      )}
      style={{ width: px, height: px, fontSize: px, ...style }}
      {...props}
    />
  );
}

export interface BlockTitleProps extends ComponentProps<"h3"> {
  size?: TextSize;
}

/** Text slot for the title. Three rungs: md 24 / lg 36 / xl 44. */
export function BlockTitle({
  size = "xl",
  className,
  style,
  title,
  children,
  ...props
}: BlockTitleProps) {
  return (
    <h3
      data-slot="block-title"
      data-size={size}
      className={cn("select-none font-medium leading-tight", className)}
      style={{ fontSize: TEXT_SIZES[size], ...style }}
      // WHY: constrained geometry (a chip-bearing header) may ellipsize the
      // rendered title; the title attribute keeps the complete authored
      // string immediately discoverable. Presentation only — the data is
      // never shortened.
      title={title ?? (typeof children === "string" ? children : undefined)}
      {...props}
    >
      {children}
    </h3>
  );
}

/**
 * Chip — the oval tag ("Warning Tags go here to the right", e.g. `Draft 1`).
 * Out of flow, inset `CHIP_INSET_RIGHT` from the container's right edge.
 * Its region is reserved by `BlockHeader` (see there), so the title centres
 * in the space that remains instead of running underneath.
 */
export function BlockChip({ className, style, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="block-chip"
      className={cn(
        "absolute top-1/2 flex -translate-y-1/2 items-center justify-center whitespace-nowrap rounded-full border-2 border-foreground px-3",
        className,
      )}
      style={{
        // The measured 28px container-edge inset, in the header's frame.
        right: CHIP_RIGHT_IN_HEADER_PX,
        minWidth: CHIP.minWidth,
        height: CHIP.height,
        fontSize: META_FONT_PX,
        ...style,
      }}
      {...props}
    />
  );
}

/** Text slot for the one-line description under the header band. */
export function BlockDescription({
  className,
  style,
  ...props
}: ComponentProps<"p">) {
  return (
    <p
      data-slot="block-description"
      className={cn("text-muted-foreground", className)}
      style={{ fontSize: META_FONT_PX, ...style }}
      {...props}
    />
  );
}

/** Text slot for the block's type, pinned to the bottom of the container. */
export function BlockType({ className, style, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="block-type"
      className={cn(
        "absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap text-muted-foreground",
        className,
      )}
      style={{ fontSize: META_FONT_PX, ...style }}
      {...props}
    />
  );
}
