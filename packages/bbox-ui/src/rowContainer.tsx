import type { ComponentProps, CSSProperties } from "react";

import { cn } from "./lib/utils";

/**
 * packages/bbox-ui/src/rowContainer.tsx
 *
 * RowContainer = a horizontal flex row laying out an ordered, arbitrary
 * list of children. Paints nothing of its own (T1-SPEC.md §4.4) — no
 * line, no fill, no `APPEARANCE_FIELDS`: the one primitive in this family
 * for which the shared bundle is inapplicable, not merely unused.
 */

export type ReadingDirection = "ltr" | "rtl";
export type RowJustify = "start" | "center" | "end" | "between";
export type RowAlign = "top" | "middle" | "bottom";

export const READING_DIRECTIONS: ReadingDirection[] = ["ltr", "rtl"];
export const ROW_JUSTIFY_VALUES: RowJustify[] = ["start", "center", "end", "between"];
export const ROW_ALIGN_VALUES: RowAlign[] = ["top", "middle", "bottom"];

/**
 * WHY `readingDirection` only flips CSS `flex-direction` and never
 * reorders the DOM (T1-SPEC.md §4.4): DOM order is paint order for `ltr`,
 * and the one thing a host (drag/drop, assistive-tech reading order) can
 * rely on regardless of which visual direction is active. Reordering the
 * array here would silently disagree with whatever order the consumer
 * authored their children in.
 */
const FLEX_DIRECTION: Record<ReadingDirection, CSSProperties["flexDirection"]> = {
  ltr: "row",
  rtl: "row-reverse",
};

const JUSTIFY_CONTENT: Record<RowJustify, CSSProperties["justifyContent"]> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
};

const ALIGN_ITEMS: Record<RowAlign, CSSProperties["alignItems"]> = {
  top: "flex-start",
  middle: "center",
  bottom: "flex-end",
};

export interface RowContainerProps extends ComponentProps<"div"> {
  readingDirection?: ReadingDirection;
  justify?: RowJustify;
  align?: RowAlign;
  /** px; `0` hugs contents (no explicit height style is set). */
  height?: number;
  /** px. */
  gap?: number;
}

/**
 * A horizontal flex row over an ordered, arbitrary list of children.
 * Width always fills the parent (T1-SPEC.md §4.4: "Not a prop: width").
 * Children are composed by hand (JSX), never a `FieldSpec` row — the same
 * contract `Port`'s own multi-instance galleries already use.
 */
export function RowContainer({
  readingDirection = "ltr",
  justify = "start",
  align = "middle",
  height = 0,
  gap = 8,
  className,
  style,
  children,
  ...props
}: RowContainerProps) {
  return (
    <div
      data-slot="row-container"
      data-reading-direction={readingDirection}
      data-justify={justify}
      data-align={align}
      className={cn("flex w-full", className)}
      style={{
        flexDirection: FLEX_DIRECTION[readingDirection],
        justifyContent: JUSTIFY_CONTENT[justify],
        alignItems: ALIGN_ITEMS[align],
        gap,
        height: height === 0 ? undefined : height,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
