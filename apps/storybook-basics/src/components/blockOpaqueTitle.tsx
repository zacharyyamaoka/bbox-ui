"use client";

/**
 * src/components/blockOpaqueTitle.tsx — `BlockOpaqueTitle`: the body of an
 * EXPANDED block shown OPAQUE — the same frame, the same ports, side
 * effects and mutation lines, but the members hidden and the block's glyph
 * and title centred where they were.
 *
 * Zach's sketch (2026-09-22), "Expanded View Opaque": the header row is
 * empty and "Title / Type" with its glyph sits in the middle of the body.
 *
 * WHAT THIS IS AND IS NOT: presentational only. The opaque face is a
 * `Block` given this as its `body`, NO `members`, an empty header, and the
 * same `width`/`height` the expanded face had — `Block`'s body already
 * centres its content (`flex items-center justify-center`), so nothing
 * about `Block` changes. There is no toggle, no gesture and no persisted
 * "opaque" field here: which face is showing is the host's call, exactly
 * as `codeCellFace.tsx`'s own `opaque | expanded` and `region.tsx`'s
 * `RegionView` are. Before this file the trunk had an opaque face for a
 * code cell and for a region, and none for an ordinary block.
 */
import type { ReactNode } from "react";

export interface BlockOpaqueTitleProps {
  /** Usually a `<Glyph>`. */
  glyph?: ReactNode;
  title: ReactNode;
  /** The secondary run under the title — the block's type. */
  type?: ReactNode;
}

export function BlockOpaqueTitle({ glyph, title, type }: BlockOpaqueTitleProps) {
  return (
    <div data-slot="block-opaque-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {glyph}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.2 }}>
        <span data-slot="block-opaque-title-name" style={{ fontWeight: 600 }}>
          {title}
        </span>
        {type !== undefined && (
          <span data-slot="block-opaque-title-type" className="text-muted-foreground" style={{ fontSize: 12 }}>
            {type}
          </span>
        )}
      </div>
    </div>
  );
}
