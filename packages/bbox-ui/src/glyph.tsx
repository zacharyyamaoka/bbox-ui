import type { ComponentProps } from "react";

import { cn } from "./lib/utils";
import { GLYPH_SIZES, type GlyphSize } from "./glyph.layout";

export interface GlyphProps extends ComponentProps<"span"> {
  size?: GlyphSize;
  /** Equal padding on all four sides, in px. See docs/T1-SPEC.md §4.1: the
   * rendered outer footprint (`sizePx + 2×padding`) is plain CSS box-model
   * arithmetic, not a fourth field. */
  padding?: number;
}

/**
 * A square icon **slot** — like `Port`'s `PortLabel`, it renders whatever
 * content its consumer hands it (an SVG icon, an emoji character, an
 * `<img>`, or nothing) and never itself resolves "a Lucide name" or "an
 * uploaded asset." Generalizes the already-shipped `BlockGlyph`
 * (`block.tsx`) without touching it — that component keeps its own
 * `TextSize`-derived `ICON_RATIO` sizing (22/32/40); this one has its own
 * standalone ladder (`./glyph.layout.ts`) for use outside a `Block` title
 * row. Ink colour is `currentColor`, inherited from the surrounding text
 * colour — never a `Glyph` field (docs/T1-SPEC.md §4.1).
 */
export function Glyph({
  size = "xl",
  padding = 0,
  className,
  style,
  children,
  ...props
}: GlyphProps) {
  const px = GLYPH_SIZES[size];
  return (
    <span
      data-slot="glyph"
      data-size={size}
      className={cn(
        "box-content inline-flex shrink-0 items-center justify-center leading-none [&>svg]:h-full [&>svg]:w-full",
        className,
      )}
      style={{ width: px, height: px, fontSize: px, padding, ...style }}
      {...props}
    >
      {children}
    </span>
  );
}
