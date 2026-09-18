"use client";

import type { ComponentProps, CSSProperties } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";
import { BAR_SIZE_TO_BADGE_SIZE, useBarSize } from "./barSize";
import { SketchOutline } from "../skin/sketchOutline";

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
 *
 * WHY `shape` defaults to `"rounded"` rather than flipping to pill
 * (docs/FEEDBACK-2026-09-17b-PLAN.md A-1, Zach: "show some badges with a
 * more pill shape"): he asked to *see* the pill option, not replace the
 * landed look — every existing caller (in particular `Bar`'s title badge,
 * which reads as a chip on purpose) must render unchanged. `rounded-full`
 * is opt-in via `shape="pill"`, not the new floor.
 */
const badgeVariants = cva(
  "relative inline-flex w-fit shrink-0 items-center justify-center overflow-hidden border font-medium whitespace-nowrap transition-[color,box-shadow] [&>svg]:pointer-events-none",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-white dark:bg-destructive/60",
        // docs/INVALID-STATES-PLAN.md §5's Badge row: "amber bg, dark
        // text" — one cva row, no new component. `--bbox-warning` (ported
        // in src/globals.css) stays light enough in BOTH themes that black
        // text keeps its contrast; `destructive` above needs the opposite
        // (white-on-dark-red) for the same reason.
        warning: "border-transparent bg-[var(--bbox-warning)] text-black",
        // The one variant with a REAL (non-transparent) border, so it's
        // the one that gets `--bbox-skin-line-override`: default/secondary/
        // destructive are already `border-transparent` and need nothing —
        // suppressing an already-invisible border would be a no-op. See
        // block.tsx's own line-override note on why the colour a skin
        // suppresses has to be the one the STATE cascade already owns.
        outline: "border-[color:var(--bbox-skin-line-override,currentColor)] text-foreground",
      },
      size: {
        sm: "gap-0.5 px-1.5 py-0 text-[0.65rem] [&>svg]:size-2.5",
        md: "gap-1 px-2 py-0.5 text-xs [&>svg]:size-3",
        lg: "gap-1 px-2.5 py-1 text-sm [&>svg]:size-3.5",
        xl: "gap-1.5 px-3 py-1 text-base [&>svg]:size-4",
      },
      // WHY radius moved OFF these two classes and onto inline style
      // (see the component body): `rounded-md`/`rounded-full` bake a
      // fixed radius no skin token can reach. The literal each falls back
      // to below is unchanged from before this port — `rounded-md` here
      // resolves to `var(--radius-md)` = 8px on this app's `--radius:
      // 0.625rem` base, captured live off `basics-badge--variants` before
      // the edit.
      shape: {
        rounded: "",
        pill: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
      shape: "rounded",
    },
  },
);

export interface BadgeProps extends ComponentProps<"span">, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, shape, style, ...props }: BadgeProps) {
  // Explicit `size` wins; the ambient Bar cascade is only the fallback when
  // `size` itself is omitted, `"md"` (cva's own default) is the floor when
  // there is no Bar ancestor either.
  const barSize = useBarSize();
  const resolvedSize = size ?? (barSize && BAR_SIZE_TO_BADGE_SIZE[barSize]) ?? "md";
  const resolvedShape = shape ?? "rounded";
  return (
    <span
      data-slot="badge"
      data-size={resolvedSize}
      data-shape={resolvedShape}
      className={cn(badgeVariants({ variant, size: resolvedSize, shape: resolvedShape }), className)}
      style={{
        borderRadius:
          resolvedShape === "pill"
            ? "var(--bbox-skin-radius-pill, 9999px)"
            : "var(--bbox-skin-radius, var(--radius-md))",
        // WHY: docs/peps/0001-sketch-skin-at-the-boundary.md M6.
        // `currentColor` IS this variant's resolved line colour — every
        // variant above sets its own `text-*` class, and a real CSS border
        // (the `outline` variant) is already drawn in `currentColor`. A
        // boundary twin is appended as a CHILD of this span, so it inherits
        // the same `color` and lands on the same value without this
        // component importing the skin or hardcoding a token.
        ...({ "--bbox-ink-state": "currentColor" } as CSSProperties),
        ...style,
      }}
      {...props}
    >
      {/* A tinted chip has no border of its own to replace (default /
          secondary / destructive are `border-transparent`) — the sketch
          skin gives it one instead. `stretch` because a Badge is sized by
          its own content, and self-measurement is what the core does not
          do (sketchOutline.tsx's own WHY). Nominal 40x20 is a typical chip;
          `preserveAspectRatio="none"` stretches it to whatever this one
          actually renders at. */}
      <SketchOutline
        stretch
        width={40}
        height={20}
        borderWidth={1}
        radius={resolvedShape === "pill" ? 20 : 8}
        seed={`badge:${resolvedSize}:${resolvedShape}`}
      />
      {props.children}
    </span>
  );
}

export { badgeVariants };
