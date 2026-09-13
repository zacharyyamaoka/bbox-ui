import type { ComponentProps } from "react";

import { cn } from "./lib/utils";

/**
 * packages/bbox-ui/src/stack.tsx
 *
 * Stack = an ordered vertical run of block-shaped members inside a padded
 * "well": `gutter` insets the well from its own edges, `gap` spaces
 * members from each other, `memberWidth` chooses whether each member
 * fills the column or keeps its own intrinsic width. See docs/T1-SPEC.md
 * §4.5.
 */

export const STACK_MEMBER_WIDTHS = ["fill", "own"] as const;
export type StackMemberWidth = (typeof STACK_MEMBER_WIDTHS)[number];

/**
 * `"white"` is not a colour choice — it is the absence of an override
 * (no background class applied at all). `"soft-gray"` resolves to the
 * `bg-muted` token. WHY this stays a two-value structural toggle instead
 * of a general fill/colour control (docs/T1-SPEC.md §4.5): it is a
 * raised-vs-sunken CONTAINMENT fact, and routing it through a colour
 * picker would let someone pick an arbitrary, semantic-breaking colour
 * for what must stay binary.
 */
export const STACK_INSET_BACKGROUNDS = ["white", "soft-gray"] as const;
export type StackInsetBackground = (typeof STACK_INSET_BACKGROUNDS)[number];

const MEMBER_WIDTH_CLASS: Record<StackMemberWidth, string> = {
  fill: "",
  own: "items-start",
};

const INSET_BACKGROUND_CLASS: Record<StackInsetBackground, string> = {
  white: "",
  "soft-gray": "bg-muted",
};

export interface StackProps extends ComponentProps<"div"> {
  gap?: number;
  gutter?: number;
  memberWidth?: StackMemberWidth;
  insetBackground?: StackInsetBackground;
}

/**
 * Lays `children` (structural — an ordered run of stackable members,
 * almost always `<Block>`, top to bottom, array order = paint order; not
 * a `FieldSpec` row, same reasoning as `Flex`'s own `children` —
 * composed by hand in stories/hosts) down one column.
 */
export function Stack({
  gap = 12,
  gutter = 12,
  memberWidth = "fill",
  insetBackground = "white",
  className,
  style,
  children,
  ...props
}: StackProps) {
  return (
    <div
      data-slot="stack"
      data-member-width={memberWidth}
      data-inset-background={insetBackground}
      className={cn(
        "flex w-full flex-col",
        // WHY total lookups and not `=== "own" && …`: a boolean branch renders
        // every unknown member as the default, so widening either union ships
        // a live panel segment that silently does nothing, typecheck clean.
        // A Record is a compile error until someone says what the new member
        // paints. "fill" is flexbox's own default cross-axis stretch; "own"
        // opts a member back out to its intrinsic width.
        MEMBER_WIDTH_CLASS[memberWidth],
        INSET_BACKGROUND_CLASS[insetBackground],
        className,
      )}
      style={{ gap, padding: gutter, ...style }}
      {...props}
    >
      {children}
    </div>
  );
}
