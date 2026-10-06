// src/components/button-group.tsx — copied from
// apps/docs/src/registry/new-york-v4/ui/button-group.tsx (the stock shadcn
// `new-york` ButtonGroup over Base UI's `useRender`/`mergeProps`), `cn` and
// `Separator` import paths repointed to this app (components/ and lib/ are
// siblings here, not `@/registry/...`).
"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../lib/utils";
import { Separator } from "./separator";

const buttonGroupVariants = cva(
  // `isolate`: a focused child lifts to z-10, which escaped into the host's
  // stacking context and could paint over a host overlay at z-5 (judge
  // sweep, 2026-09-18). Containing it keeps the focus lift working and
  // stops it competing outside the group.
  "isolate has-[>[data-slot=button-group]]:gap-2 has-[select[aria-hidden=true]:last-child]:[&>[data-slot=select-trigger]:last-of-type]:rounded-r-lg flex w-fit items-stretch *:focus-visible:relative *:focus-visible:z-10 [&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1",
  {
    variants: {
      orientation: {
        horizontal:
          "[&>[data-slot]:not(:has(~[data-slot]))]:rounded-r-lg! *:data-slot:rounded-r-none [&>[data-slot]~[data-slot]]:rounded-l-none [&>[data-slot]~[data-slot]]:border-l-0",
        vertical:
          "[&>[data-slot]:not(:has(~[data-slot]))]:rounded-b-lg! flex-col *:data-slot:rounded-b-none [&>[data-slot]~[data-slot]]:rounded-t-none [&>[data-slot]~[data-slot]]:border-t-0",
      },
    },
    defaultVariants: {
      orientation: "horizontal",
    },
  },
);

function ButtonGroup({
  className,
  orientation,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof buttonGroupVariants>) {
  return (
    <div
      role="group"
      data-slot="button-group"
      data-orientation={orientation}
      className={cn(buttonGroupVariants({ orientation }), className)}
      {...props}
    />
  );
}

function ButtonGroupText({ className, render, ...props }: useRender.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(
          "bg-muted gap-2 rounded-lg border px-2.5 text-sm font-medium [&_svg:not([class*='size-'])]:size-4 flex items-center [&_svg]:pointer-events-none",
          className,
        ),
      },
      props,
    ),
    render,
    state: {
      slot: "button-group-text",
    },
  });
}

function ButtonGroupSeparator({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="button-group-separator"
      orientation={orientation}
      // WHY `data-[orientation=...]:` rather than the donor's bare
      // `data-horizontal:`/`data-vertical:` (measured bug, same root cause
      // documented in this app's own separator.tsx): Base UI's Separator
      // sets a single `orientation` STATE key, which its generic
      // state→attribute mapping renders as `data-orientation="vertical"` —
      // never a bare `data-horizontal`/`data-vertical` presence attribute.
      // The stock registry file's selectors target an attribute the DOM
      // never has, so they were dead CSS; this app's `separator.tsx` and
      // `toolbar.tsx`'s `ToolbarSeparator` already fixed the same bug at
      // their own sites, this is the third.
      className={cn(
        "bg-input relative self-stretch data-[orientation=horizontal]:mx-px data-[orientation=horizontal]:w-auto data-[orientation=vertical]:my-px data-[orientation=vertical]:h-auto",
        className,
      )}
      {...props}
    />
  );
}

export { ButtonGroup, ButtonGroupSeparator, ButtonGroupText, buttonGroupVariants };
