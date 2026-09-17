"use client";

import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";
import { BAR_SIZE_TO_BADGE_SIZE, useBarSize } from "./barSize";

/**
 * src/components/badge.tsx — a plain, stock shadcn Badge. Not vendored
 * anywhere else in this repo (checked apps/docs and packages/inspector —
 * absent from both), so this is written fresh rather than ported; it's a
 * small, extremely standard shadcn primitive with nothing repo-specific to
 * preserve. No `asChild`/Slot support — this app has no reason yet to
 * render a Badge as a link, and skipping it avoids a new dependency.
 *
 * WHY `size` was added here (stock shadcn's Badge has none): the Bar size
 * cascade (barSize.tsx) needs somewhere to land on Badge, and there was no
 * existing scale to hook into. Four rungs, matching `Bar`'s own directly.
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center overflow-hidden rounded-md border font-medium whitespace-nowrap transition-[color,box-shadow] [&>svg]:pointer-events-none",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-white dark:bg-destructive/60",
        outline: "text-foreground",
      },
      size: {
        sm: "gap-0.5 px-1.5 py-0 text-[0.65rem] [&>svg]:size-2.5",
        md: "gap-1 px-2 py-0.5 text-xs [&>svg]:size-3",
        lg: "gap-1 px-2.5 py-1 text-sm [&>svg]:size-3.5",
        xl: "gap-1.5 px-3 py-1 text-base [&>svg]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

export interface BadgeProps extends ComponentProps<"span">, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  // Explicit `size` wins; the ambient Bar cascade is only the fallback when
  // `size` itself is omitted, `"md"` (cva's own default) is the floor when
  // there is no Bar ancestor either.
  const barSize = useBarSize();
  const resolvedSize = size ?? (barSize && BAR_SIZE_TO_BADGE_SIZE[barSize]) ?? "md";
  return (
    <span
      data-slot="badge"
      data-size={resolvedSize}
      className={cn(badgeVariants({ variant, size: resolvedSize }), className)}
      {...props}
    />
  );
}

export { badgeVariants };
