import type { ComponentProps, ReactNode } from "react";

import { cn } from "./lib/utils";
import type { RegionKind } from "./region.fields";

/**
 * packages/bbox-ui/src/region.tsx
 *
 * Region = For / While / If: a bordered container with a real `Block`
 * (composed by the caller, in Port view) riding its top-left corner — see
 * `region.presets.ts` for why this is composition, not a second Block
 * preset. Kept deliberately austere (a border, a radius, a padded body):
 * core draws no edges of any kind (T1-SPEC.md §10), and nothing here
 * decides layout, connection, or containment rules for what a host places
 * inside it.
 */

const REGION_DEFAULT_WIDTH = 560;
const REGION_DEFAULT_HEIGHT = 360;
/** Kept as the documented default and as `RADIUS_FIELD`'s declared value;
 * `Region` itself no longer applies it, deferring to `--bbox-skin-radius`
 * (whose fallback is this same 8px) when the prop is unset. */
const REGION_DEFAULT_RADIUS = 8;

/** Region's own border stroke width — mirrors `layout.ts`'s
 * `BLOCK_BORDER_PX`: the corner Block's border must land exactly ON this
 * line for the shared corner to read as one continuous stroke. */
export const REGION_BORDER_PX = 2;
// WHY this is NOT `var(--bbox-skin-stroke-width)`: it is read as a LENGTH
// three lines below (`left: -REGION_BORDER_PX`) to position the corner
// Block, and `port.layout.ts`'s own `BLOCK_BORDER_PX` is read the same way
// to compute every wall-mounted port's anchor. Border width is geometry in
// this codebase, not paint — a skin that changed it would move ports out
// from under the host's edges. All three shipped skins therefore stroke at
// 2px; making that variable is real layout work, not a token. See the
// proposal's open decision D1.

/**
 * The corner Block's real, unscaled footprint — the SAME 192×173 the old
 * `scale(0.5)` hack produced (384×346 at half), kept as the default so
 * every existing caller sees an unchanged corner size. Exported so a
 * caller building the corner itself (bench.tsx's `REGION_SLOTS`) can size
 * that Block to match, honestly, rather than the region silently shrinking
 * whatever full-size Block it is handed.
 */
export const REGION_CORNER_SIZE = { width: 192, height: 173 };

export interface RegionProps extends Omit<ComponentProps<"div">, "children"> {
  kind?: RegionKind;
  width?: number;
  height?: number;
  radius?: number;
  /** The corner Block — absolutely positioned so it visually rides the
   * region's top-left corner, the way the wireframe draws it. Expected to
   * already be built at `cornerSize` (see `REGION_SLOTS`) — Region no
   * longer scales it down itself. */
  corner?: ReactNode;
  /** The corner's real footprint, for body clearance and flush alignment.
   * Defaults to `REGION_CORNER_SIZE`, the historical `scale(0.5)` size. */
  cornerSize?: { width: number; height: number };
  children?: ReactNode;
}

export function Region({
  kind = "for",
  width = REGION_DEFAULT_WIDTH,
  height = REGION_DEFAULT_HEIGHT,
  radius,
  corner,
  cornerSize = REGION_CORNER_SIZE,
  className,
  style,
  children,
  ...props
}: RegionProps) {
  return (
    <div
      data-slot="region"
      data-kind={kind}
      // Same skin seam as `Block` (skin.ts / skin.css), minus the surface:
      // a Region is deliberately unfilled, which is a fact about what a
      // Region IS, not a style choice a skin gets to make. The stroke width
      // is quoted from `REGION_BORDER_PX` rather than the skin token on
      // purpose — see that constant's own note.
      className={cn(
        "relative border-2 border-solid border-[color:var(--bbox-skin-stroke,var(--color-foreground))] bg-transparent",
        "font-[family-name:var(--bbox-skin-font,inherit)]",
        className,
      )}
      // `overflow: visible` (not `clip`, unlike Block): the corner Block
      // deliberately straddles this boundary — clipping would cut the
      // half that's meant to overhang clean off.
      style={{
        width,
        height,
        // Unset means "let the skin decide", exactly as on `Block`, and the
        // two must agree: an equal radius on both is what makes the corner
        // Block's rounded corner nest inside the Region's instead of
        // crossing it. One shared token is what keeps them equal.
        borderRadius: radius ?? "var(--bbox-skin-radius, 8px)",
        overflow: "visible",
        ...style,
      }}
      {...props}
    >
      {corner && (
        <div
          data-slot="region-corner"
          className="absolute"
          // WHY plain `left`/`top` at `-REGION_BORDER_PX`, no transform at
          // all (replacing the old `translate(-10px,-10px) scale(0.5)`
          // hack): (1) flush outer-corner alignment — the corner Block's
          // own 2px border lands exactly ON the Region's 2px border, so the
          // shared corner reads as one line, and equal default radii (8)
          // make the two rounded corners nest instead of a square corner
          // floating near a round one; (2) real size instead of scale(0.5)
          // — scaling halved the Block's border widths and text too (reads
          // as a mock, not a component). `cornerSize` is the SAME 192×173
          // footprint the old scale hack produced, now an honest Block box
          // the cascade actually resolves rather than a CSS illusion of one.
          style={{ left: -REGION_BORDER_PX, top: -REGION_BORDER_PX, zIndex: 1 }}
        >
          {corner}
        </div>
      )}
      <div
        data-slot="region-body"
        style={{
          padding: 16,
          // Clear the corner Block's real footprint so body content starts
          // below it instead of flowing underneath — the corner's own top
          // edge sits `REGION_BORDER_PX` above the region's padding box, so
          // its bottom edge is `cornerSize.height - REGION_BORDER_PX` down.
          paddingTop: corner ? cornerSize.height - REGION_BORDER_PX + 16 : 16,
          height: "100%",
          boxSizing: "border-box",
        }}
      >
        {children}
      </div>
    </div>
  );
}
