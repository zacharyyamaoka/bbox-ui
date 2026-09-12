import type { ComponentProps, CSSProperties } from "react";

import { cn } from "./lib/utils";

/**
 * packages/bbox-ui/src/flex.tsx
 *
 * Flex = the thing that fills a slot. An ordered run of members laid out
 * by CSS flexbox in one direction, with the four knobs a person actually
 * reaches for (direction, justify, align, gap) and a padding. Paints
 * nothing of its own. It replaced RowContainer on 2026-09-11 (Zach: "flex
 * can do both column or row") — a RowContainer was a Flex with
 * `direction: "row"`.
 *
 * WHY the name is Flex and not "FlexBox" or "Slot" (Zach, 2026-09-11:
 * "instead of calling these slots, maybe we should just call them flex
 * boxes because that's what they really are"): the two words name two
 * different things. A SLOT is a named hole on a parent — Block's
 * `header.left` — the API role; it exists whether or not anything fills
 * it. A FLEX is the component that fills a slot and lays members out; it
 * can also be used on its own, nested in another Flex, or as a row in a
 * Block's body. CSS calls the concept a flex container, and every
 * library Zach copies calls the component `Flex` (Radix Themes, Chakra,
 * Mantine) — so the component is `Flex` and the holes stay `slots`.
 */

export const FLEX_DIRECTIONS = ["row", "column"] as const;
export type FlexDirection = (typeof FLEX_DIRECTIONS)[number];

export const FLEX_JUSTIFY_VALUES = ["start", "center", "end", "between", "around", "evenly"] as const;
export type FlexJustify = (typeof FLEX_JUSTIFY_VALUES)[number];

export const FLEX_ALIGN_VALUES = ["start", "center", "end", "stretch"] as const;
export type FlexAlign = (typeof FLEX_ALIGN_VALUES)[number];

const JUSTIFY_CONTENT: Record<FlexJustify, CSSProperties["justifyContent"]> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
  around: "space-around",
  evenly: "space-evenly",
};

const ALIGN_ITEMS: Record<FlexAlign, CSSProperties["alignItems"]> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
};

export interface FlexProps extends ComponentProps<"div"> {
  direction?: FlexDirection;
  justify?: FlexJustify;
  align?: FlexAlign;
  /** px between members. */
  gap?: number;
  /** px inset from the Flex's own edges. */
  padding?: number;
  /** Members wrap onto the next line/column instead of overflowing. */
  wrap?: boolean;
}

/**
 * Lays `children` (structural — composed by hand or by a host's member
 * list, never a `FieldSpec` row) along `direction`. Width fills the
 * parent; height hugs contents.
 */
export function Flex({
  direction = "row",
  justify = "start",
  align = "center",
  gap = 8,
  padding = 0,
  wrap = false,
  className,
  style,
  children,
  ...props
}: FlexProps) {
  return (
    <div
      data-slot="flex"
      data-direction={direction}
      data-justify={justify}
      data-align={align}
      className={cn("flex w-full min-w-0", className)}
      style={{
        flexDirection: direction,
        justifyContent: JUSTIFY_CONTENT[justify],
        alignItems: ALIGN_ITEMS[align],
        flexWrap: wrap ? "wrap" : "nowrap",
        gap,
        padding,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
