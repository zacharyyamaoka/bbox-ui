"use client";

// src/components/button.tsx — copied verbatim from
// apps/docs/src/registry/new-york-v4/ui/button.tsx (the stock shadcn `new-york`
// Button over Base UI), only the `cn` import path changed to match this app.
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";
// WHY the Bar size cascade is dropped in THIS app's copy: the cascade
// (apps/storybook-basics/src/components/barSize.tsx) exists so a <Bar> can
// size the controls inside it, and it reaches `./bar`, `./glyph.layout` and
// `./editableText.layout` to spell each consumer's ladder. This app has no
// Bar and no reason to grow one — vendoring three more trunk files to feed
// a context that will never have a provider is the copy-trap, not a fix.
// The explicit `size` prop is unchanged; only the ambient fallback is gone,
// which is exactly what "no Bar ancestor" already resolved to upstream.

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

// Sizes whose radius is already a deliberate, non-skin CLAMP —
// `rounded-[min(var(--radius-md),10-12px)]`, tuned so a tiny icon button
// never balloons toward a circle. The skin seam below does not reach these:
// letting `--bbox-skin-radius` win here would fight that clamp every render
// (a skin's radius could easily exceed the clamp's own ceiling) and, worse,
// silently drop it back to nothing on a "default"-fallback skin. Only the
// UNCLAMPED sizes — the ones that fall through to `buttonVariants`' own
// plain `rounded-lg` — get the token.
const CLAMPED_RADIUS_SIZES = new Set(["xs", "sm", "icon-xs", "icon-sm"]);

function Button({
  className,
  variant = "default",
  size,
  style,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  const resolvedSize = size ?? "default";
  return (
    <ButtonPrimitive
      data-slot="button"
      data-size={resolvedSize}
      className={cn(buttonVariants({ variant, size: resolvedSize, className }))}
      style={{
        // The skin seam (src/skin/skin.ts + skin.css). `var(--radius-lg)`
        // is exactly what the base class's own `rounded-lg` resolves to,
        // so a consumer who never imports skin.css is byte-identical.
        ...(CLAMPED_RADIUS_SIZES.has(resolvedSize ?? "default") ? null : { borderRadius: "var(--bbox-skin-radius, var(--radius-lg))" }),
        // `outline` is the one variant with a REAL, visible border
        // (`border-border dark:border-input`) — every other variant is
        // `border-transparent` and has nothing for a skin to suppress.
        // Same split Badge's own `outline` variant makes for
        // `--bbox-skin-line-override`. Fallback is `--color-input`, not
        // `--color-border`, on purpose: this app's theme (`globals.css`)
        // gives `--input` the SAME value as `--border` in light mode and
        // the dark-mode-CORRECT value already (the exact value
        // `dark:border-input` supplied), so one literal is
        // byte-identical in both — an inline style can't express a media
        // query the way the two Tailwind classes did.
        ...(variant === "outline" ? { borderColor: "var(--bbox-skin-line-override, var(--color-input))" } : null),
        ...style,
      }}
      {...props}
    />
  );
}

export { Button, buttonVariants };
