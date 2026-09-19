// src/components/popover.tsx — based on the stock shadcn `new-york` Popover
// (apps/docs/src/registry/new-york-v4/ui/popover.tsx, over Base UI's
// `@base-ui/react/popover`), NOT copied verbatim: that stock copy only ever
// positions against its own trigger, and this kit needs a popover that can
// hang off a point on the canvas that has no DOM element at all (the
// font-size popover in docs/menus/screenshots/03-font-size-popover.png opens
// off the selection, not off a button). `PopoverPositioner.Props` already
// accepts `anchor: Element | VirtualElement | ...` (verified against
// apps/storybook-basics/node_modules/@base-ui/react/internals/
// useAnchorPositioning.d.ts) — the stock copy's `Pick` just never asked for
// it. `container` and `collisionPadding` are exposed for the same reason:
// they're the two other host-contract knobs docs/menus/MENU-KIT-DESIGN.md
// §4 names ("container? — portal target inside the host's token scope",
// "collisionPadding" for the boundary a canvas-anchored popup must respect).
"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { cn } from "../lib/utils";

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

export interface PopoverContentProps
  extends PopoverPrimitive.Popup.Props,
    Pick<
      PopoverPrimitive.Positioner.Props,
      "align" | "alignOffset" | "side" | "sideOffset" | "anchor" | "collisionPadding"
    > {
  /** WHY: portal target inside the host's own token/theme scope (the kit's
      universal host contract, MENU-KIT-DESIGN.md §4) — `undefined` keeps
      Base UI's own default of `document.body`, which is fine for a host
      with no scoped root. */
  container?: PopoverPrimitive.Portal.Props["container"];
  /** WHY (ported concept, menuLabModel.ts's `popoverMode`): a live text
      editor open elsewhere on the surface (an inline rename field, a
      color-hex input) must keep its OWN focus while this popover is open —
      the default "move focus into the popup on open" would steal the caret
      mid-keystroke. Maps to Base UI Popup's `initialFocus`, narrowed to a
      boolean because the kit only ever needs "move focus" vs "leave it
      alone," never `initialFocus`'s ref/interaction-type callback forms.
      Default `true` (Base UI's own default); pill/editing surfaces pass
      `false`. */
  autoFocus?: boolean;
}

function PopoverContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  anchor,
  collisionPadding,
  container,
  autoFocus = true,
  ...props
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal container={container}>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        anchor={anchor}
        collisionPadding={collisionPadding}
        className="isolate z-50 outline-none"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          initialFocus={autoFocus}
          className={cn(
            "data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ring-foreground/10 bg-popover text-popover-foreground flex flex-col gap-2.5 rounded-lg p-2.5 text-sm shadow-md ring-1 duration-100 data-[side=inline-start]:slide-in-from-right-2 data-[side=inline-end]:slide-in-from-left-2 z-50 w-72 origin-(--transform-origin) outline-hidden",
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverContent, PopoverTrigger };
