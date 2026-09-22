// src/editor/toolbar.tsx — shadcn has no toolbar item in any style
// (verified 404 twice against the shadcn/ui and base-nova registries), so
// this is a new wrapper, not a copy — over Base UI's `@base-ui/react/toolbar`
// (`Toolbar.Root/Group/Button/Separator/Link`, verified against the real
// package: apps/storybook-basics/node_modules/@base-ui/react/toolbar/
// index.parts.d.ts), styled in the same shadcn/Tailwind idiom as every other
// L1 part here (`cn` + shadcn CSS variables, no raw `style={{color}}`).
"use client";

import { Toolbar as ToolbarPrimitive } from "@base-ui/react/toolbar";

import { cn } from "../lib/utils";
import { BAR_SIZE_TO_BUTTON_SIZE, useBarSize, type ButtonToggleSize } from "../components/barSize";

/**
 * `Toolbar` is the roving-focus container underneath the floating pill
 * (screenshot 01), the bottom tool dock (04), the top-left chrome bar (05)
 * and the status strip — every one of those surfaces is "a row of buttons
 * where arrow keys move focus and only one stop is ever tab-reachable",
 * which is exactly Base UI's `Toolbar.Root` contract (roving tabindex +
 * arrow-key navigation + `loopFocus`) rather than a plain flex row of
 * `Button`s. Anything that composes a `Bar` with tool buttons in one of its
 * slots wants a `Toolbar` in that slot, not raw buttons.
 *
 * WHY it also publishes size via `useBarSize` (barSize.tsx), exactly like
 * `button.tsx`: a toolbar's buttons should size themselves off the ambient
 * Bar the toolbar sits inside (Zach's size-cascade ask, see bar.tsx) without
 * every call site re-passing `size` to every `ToolbarButton`. `size` here is
 * read-only plumbing for the caller's OWN buttons (see `ToolbarButton`
 * below) — the cascade travels through context already mounted by `Bar`,
 * this component does not re-provide it.
 */
function Toolbar({ className, ...props }: ToolbarPrimitive.Root.Props) {
  return (
    <ToolbarPrimitive.Root
      data-slot="toolbar"
      className={cn(
        "flex items-center gap-1 outline-none data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch",
        className,
      )}
      {...props}
    />
  );
}

function ToolbarGroup({ className, ...props }: ToolbarPrimitive.Group.Props) {
  return (
    <ToolbarPrimitive.Group
      data-slot="toolbar-group"
      className={cn("flex items-center gap-1", className)}
      {...props}
    />
  );
}

/**
 * Renders a `<button>` by default, styled to match `button.tsx`'s own
 * `ghost` "icon" look (toolbar buttons are near-always icon-only — the
 * fill/hatched/transparent cells in screenshot 01, the cursor/frame/shape
 * tools in 04). A consumer that wants the FULL `Button` (variants, the
 * `Bar` size cascade already resolved, `render`-based composition with a
 * `DropdownMenuTrigger`, etc.) passes `render={<Button .../>}` — same seam
 * `DropdownMenuTrigger`/`TooltipTrigger` already use — rather than this
 * component growing a second copy of `buttonVariants`.
 *
 * `size` is accepted only to resolve the ambient Bar cascade for THIS
 * button's own touch target (`h-7`/`h-8`/`h-9`) when the caller renders the
 * plain built-in button rather than composing `Button`; it is stripped
 * before reaching the DOM node.
 */
function ToolbarButton({
  className,
  size,
  ...props
}: ToolbarPrimitive.Button.Props & { size?: ButtonToggleSize }) {
  const barSize = useBarSize();
  const resolvedSize = size ?? (barSize && BAR_SIZE_TO_BUTTON_SIZE[barSize]) ?? "default";
  return (
    <ToolbarPrimitive.Button
      data-slot="toolbar-button"
      data-size={resolvedSize}
      className={cn(
        // WHY `aria-pressed:` rather than a `data-pressed` attribute: Base
        // UI's `Toolbar.Button` has no built-in pressed state of its own
        // (that's `toggle.tsx`'s job, and a toolbar tool button IS just an
        // `aria-pressed` button — screenshot 04's blue cursor tool) — the
        // consumer sets `aria-pressed` and the style follows for free,
        // matching `toggle.tsx`'s own `aria-pressed:bg-muted` convention.
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg text-sm font-medium whitespace-nowrap outline-none transition-all select-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-pressed:bg-primary aria-pressed:text-primary-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        resolvedSize === "sm" && "h-7 px-2",
        resolvedSize === "default" && "h-8 px-2.5",
        resolvedSize === "lg" && "h-9 px-2.5",
        className,
      )}
      {...props}
    />
  );
}

function ToolbarLink({ className, ...props }: ToolbarPrimitive.Link.Props) {
  return (
    <ToolbarPrimitive.Link
      data-slot="toolbar-link"
      className={cn(
        "text-primary text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    />
  );
}

/**
 * WHY a plain `bg-border` bar rather than reusing `separator.tsx`'s
 * `Separator`: Base UI's own `Toolbar.Separator` (this wraps it) already
 * carries the toolbar-specific default — vertical in a horizontal toolbar,
 * horizontal in a vertical one — and participates in the roving-focus
 * DOM structure the plain `Separator` primitive doesn't know about.
 * Screenshot 04's dock draws exactly this: a hairline between the tool
 * group and the trailing `+`.
 */
function ToolbarSeparator({ className, ...props }: ToolbarPrimitive.Separator.Props) {
  return (
    <ToolbarPrimitive.Separator
      data-slot="toolbar-separator"
      className={cn(
        "bg-border shrink-0 self-stretch data-[orientation=vertical]:mx-1 data-[orientation=vertical]:w-px data-[orientation=horizontal]:my-1 data-[orientation=horizontal]:h-px",
        className,
      )}
      {...props}
    />
  );
}

export { Toolbar, ToolbarButton, ToolbarGroup, ToolbarLink, ToolbarSeparator };
