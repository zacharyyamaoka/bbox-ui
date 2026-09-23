// src/components/scroll-area.tsx — based on
// apps/docs/src/registry/new-york-v4/ui/scroll-area.tsx (the stock shadcn
// `new-york` ScrollArea over Base UI's ScrollArea primitive), NOT copied
// verbatim: two documented fixes, exactly like `separator.tsx` and
// `slider.tsx` before it.
//
// 1. The `cn` import path is repointed at this app's own `src/lib/utils.ts` —
//    the routine copy-trap every primitive here fixes.
//
// 2. WHY the orientation selectors were rewritten: the donor styles the
//    scrollbar's SIZE behind `data-horizontal:` / `data-vertical:`, and those
//    are DEAD CODE against the library it is built on. Verified against the
//    pinned `@base-ui/react@1.8.0`: `scroll-area/root/stateAttributes.js`
//    exports `scrollAreaStateAttributesMapping` with keys `hasOverflowX`,
//    `hasOverflowY`, `overflowXStart`, `overflowXEnd`, `overflowYStart`,
//    `overflowYEnd` and `cornerHidden` — and NO `orientation` key. So
//    orientation falls through Base UI's generic state->attribute handling
//    and lands as `data-orientation="vertical"|"horizontal"`, while Tailwind
//    lowers `data-vertical:` to the attribute-PRESENCE selector
//    `[data-vertical]`, which can never match `[data-orientation=vertical]`.
//    The consequence is not cosmetic: `data-vertical:w-2.5` is the only rule
//    giving the scrollbar a width, so uncorrected this component ships a
//    scrollbar that is 0px wide — invisible, and unclickable.
//
//    `data-[orientation=…]:` is the selector that actually reads the DOM Base
//    UI produces. `separator.tsx`'s header makes this same argument against
//    the same trap, and `toolbar.tsx`'s `ToolbarSeparator` already uses the
//    corrected form.
//
// No restyle beyond that, no dropped or renamed export.
//
// WHY this lives in the trunk rather than being imported from apps/docs: the
// repo's one rule — apps/docs is a consumer, not a source. Every other
// primitive this app uses is a sibling in this folder.
"use client";

import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";

import { cn } from "../lib/utils";

function ScrollArea({
  className,
  children,
  ...props
}: ScrollAreaPrimitive.Root.Props) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "data-[orientation=horizontal]:h-2.5 data-[orientation=horizontal]:flex-col data-[orientation=horizontal]:border-t data-[orientation=horizontal]:border-t-transparent data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2.5 data-[orientation=vertical]:border-l data-[orientation=vertical]:border-l-transparent flex touch-none p-px transition-colors select-none",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="rounded-full relative flex-1 bg-border"
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
}

export { ScrollArea, ScrollBar };
