import {
  Children,
  Fragment,
  isValidElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";

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
import { Pill, type PillProps } from "./pill";
import type { BlockOrientation } from "./block.fields";

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

// WHY a total lookup rather than `orientation === "vertical" && ...`: a
// boolean branch renders every unknown member as the horizontal default, so
// widening BLOCK_ORIENTATIONS shipped a panel segment that silently did
// nothing and typecheck stayed green (a judge proved it with "diagonal").
// Record<BlockOrientation, string> is total, so adding a member is a compile
// error until someone says what it paints.
const HEADER_ORIENTATION_CLASS: Record<BlockOrientation, string> = {
  horizontal: "",
  vertical: "flex-col gap-1",
};

/**
 * Is there a BlockChip anywhere in this header's children?
 *
 * WHY it recurses: `Children.toArray` flattens arrays but does NOT descend
 * into Fragments, so a chip wrapped in one went undetected, the header
 * skipped the space it reserves for it, and the chip painted over the
 * title's last letters — exactly the collision the reservation exists to
 * prevent. No shipped caller hits it today, but this is the last site of the
 * same class that made PortEdge's cascade land on a Fragment and reach no
 * Port at all.
 */
function containsChip(children: ReactNode): boolean {
  return Children.toArray(children).some((child) => {
    if (!isValidElement(child)) return false;
    if (child.type === BlockChip) return true;
    if (child.type === Fragment) {
      return containsChip((child as ReactElement<{ children?: ReactNode }>).props.children);
    }
    return false;
  });
}

export interface BlockHeaderProps extends ComponentProps<"header"> {
  orientation?: BlockOrientation;
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
  const hasChip = containsChip(children);
  return (
    <header
      data-slot="block-header"
      data-orientation={orientation}
      data-has-chip={hasChip || undefined}
      className={cn(
        "relative flex w-full items-center justify-center gap-2",
        HEADER_ORIENTATION_CLASS[orientation],
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

export interface BlockChipProps extends PillProps {}

/**
 * Chip — the oval tag ("Warning Tags go here to the right", e.g. `Draft 1`).
 * Out of flow, inset `CHIP_INSET_RIGHT` from the container's right edge.
 * Its region is reserved by `BlockHeader` (see there), so the title centres
 * in the space that remains instead of running underneath.
 *
 * T1-SPEC.md §4.8: a thin wrapper around the real `<Pill>` — the one
 * concrete reuse every per-component doc that touched `BlockChip`
 * independently recommended — so `state`/`tone` reach the chip through the
 * SAME cascade `Pill` already runs (`resolveField` against `PILL_PRESETS`)
 * rather than a second, parallel colour system living here. Geometry
 * (`CHIP`, `CHIP_RIGHT_IN_HEADER_PX`, `blockLayout.ts`'s box for it) is
 * untouched — only the painted shell changes. Defaulting to `state:
 * "empty"` reproduces the exact look this chip always had (a hollow
 * `foreground` outline, no fill), so every existing caller (the tldraw and
 * React Flow adapters, both of which render a bare `<BlockChip>{tag}</BlockChip>`
 * with no state/tone) is visually unchanged.
 */
export function BlockChip({
  state = "empty",
  tone = "neutral",
  className,
  style,
  children,
  ...props
}: BlockChipProps) {
  return (
    <Pill
      // WHY set explicitly (and BEFORE `...props`, so an explicit caller
      // override still wins): this chip is a real, external DOM contract
      // (`demos/drive.mjs` selects `[data-slot="block-chip"]`) — `Pill`'s
      // own default `data-slot="pill"` would silently break that selector.
      data-slot="block-chip"
      state={state}
      tone={tone}
      className={cn("absolute top-1/2 -translate-y-1/2", className)}
      style={{
        // The measured 28px container-edge inset, in the header's frame.
        right: CHIP_RIGHT_IN_HEADER_PX,
        minWidth: CHIP.minWidth,
        height: CHIP.height,
        fontSize: META_FONT_PX,
        ...style,
      }}
      {...props}
    >
      {children}
    </Pill>
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
