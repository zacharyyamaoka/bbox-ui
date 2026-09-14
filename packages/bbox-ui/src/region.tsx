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
const REGION_DEFAULT_RADIUS = 8;

export interface RegionProps extends Omit<ComponentProps<"div">, "children"> {
  kind?: RegionKind;
  width?: number;
  height?: number;
  radius?: number;
  /** The corner Block — absolutely positioned so it visually rides the
   * region's top-left corner, the way the wireframe draws it. */
  corner?: ReactNode;
  children?: ReactNode;
}

export function Region({
  kind = "for",
  width = REGION_DEFAULT_WIDTH,
  height = REGION_DEFAULT_HEIGHT,
  radius = REGION_DEFAULT_RADIUS,
  corner,
  className,
  style,
  children,
  ...props
}: RegionProps) {
  return (
    <div
      data-slot="region"
      data-kind={kind}
      className={cn("relative border-2 border-foreground bg-transparent", className)}
      // `overflow: visible` (not `clip`, unlike Block): the corner Block
      // deliberately straddles this boundary — clipping would cut the
      // half that's meant to overhang clean off.
      style={{ width, height, borderRadius: radius, overflow: "visible", ...style }}
      {...props}
    >
      {corner && (
        <div
          data-slot="region-corner"
          className="absolute left-0 top-0"
          // WHY scale(0.5) with a slight negative offset, not the raw Block:
          // the corner holds a REAL Port-view Block (384×346 by preset) on a
          // 560×360 region — full size it eclipses most of the region and
          // spills past the canvas, which the first /create capture showed.
          // The wireframe draws the corner block at roughly a quarter of the
          // region's width, riding the corner. Scale is presentation-only
          // (the Block's own data, ports and box stay untouched), the same
          // kind of knob a host zoom already is.
          style={{
            transform: "translate(-10px, -10px) scale(0.5)",
            transformOrigin: "top left",
            zIndex: 1,
          }}
        >
          {corner}
        </div>
      )}
      <div
        data-slot="region-body"
        style={{
          padding: 16,
          // Clear the corner Block's scaled footprint (384×346 at 0.5 ≈
          // 192×173, minus the 10px overhang) so body content starts below
          // it instead of flowing underneath.
          paddingTop: corner ? 172 : 16,
          height: "100%",
          boxSizing: "border-box",
        }}
      >
        {children}
      </div>
    </div>
  );
}
