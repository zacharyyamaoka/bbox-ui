"use client";

import type { ComponentProps } from "react";

import { cn } from "./lib/utils";
import { BADGE_SIZES, type BadgeSize } from "./badge.fields";

export interface BadgeProps extends Omit<ComponentProps<"span">, "children"> {
  /** The chip's text — a plain string, never rich content: this is a
   * count/tag chip (Port's secondary slot holding an "Event" text tag or
   * a "4" count side by side), not a generic slot. */
  children?: string;
  /** Size rung — `md` (the default) reproduces `PortCountBadge`'s
   * original measured look byte-for-byte; see `BADGE_SIZES`. */
  size?: BadgeSize;
  /** Author-set, persisted — same shape as `PortDot`/`PortLabel`'s own
   * `hidden`: painting nothing is a visibility fact, not a variant. */
  hidden?: boolean;
}

/**
 * Badge — a small rounded count/tag chip, pulled out of `port.tsx`'s
 * hardcoded `PortCountBadge` so Port's now-generic secondary slot can hold
 * more than one of them side by side (an "Event" text tag next to a "4"
 * count). `Badge` itself knows nothing about ports or producer counts —
 * it just renders whatever string it's given.
 *
 * DEVIATION: no `tone`/`state`. Wiring either through `./appearance`
 * properly means either `Port`'s ring/fill/core blend (`portDotStyle`,
 * `toneColor`) or `Pill`'s full preset/`resolveField` cascade
 * (`pillResolutionSubject`) — both model a shape (a ring, a line-vs-fill
 * duality) this flat, single-layer chip doesn't have. Half-wiring a `tone`
 * that only recolours text, with no preset behind it, is exactly the
 * "control that does nothing real" failure `appearance.fields.ts`'s own
 * `lensBefore` deviation warns about. Left out until a real donor shows
 * what a toned/stateful Badge looks like.
 */
export function Badge({
  // A REAL default, so the component's own output and `BADGE_FIELDS`'
  // declared default are the same fact rather than two that happen to
  // look alike. An omitted `children` used to read back `undefined`,
  // which no `FieldValue` can encode — so the field had to declare
  // something else, and did ("4"), and the inspector then disagreed with
  // the preview beside it.
  children = "",
  size = "md",
  hidden = false,
  className,
  style,
  ...props
}: BadgeProps) {
  if (hidden) return null;
  const { height, fontSize, radius, paddingX } = BADGE_SIZES[size];
  return (
    <span
      data-slot="badge"
      data-size={size}
      className={cn(
        "flex items-center justify-center bg-foreground/10 font-semibold text-foreground",
        className,
      )}
      style={{
        height,
        minWidth: height,
        borderRadius: radius,
        paddingLeft: paddingX,
        paddingRight: paddingX,
        fontSize,
        lineHeight: `${height}px`,
        ...style,
      }}
      {...props}
    >
      {children}
    </span>
  );
}
