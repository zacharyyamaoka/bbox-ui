// src/components/toggle.tsx — copied verbatim from
// packages/inspector/src/components/ui/toggle.tsx (the "blackbox toggle" —
// Zach's picked shadcn primitive, see CLAUDE.md's ai-comment thread: no
// label, no track-and-thumb, an icon-button with a pressed/unpressed
// visual state, which is exactly this shape). Only the `cn` import path
// changed — the source imports the `cn` npm package, this app has its own
// `src/lib/utils.ts`.
"use client";

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
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

const toggleVariants = cva(
  "group/toggle inline-flex items-center justify-center gap-1 rounded-lg text-sm font-medium whitespace-nowrap transition-all outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-pressed:bg-muted data-[state=on]:bg-muted dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border border-input bg-transparent hover:bg-muted",
      },
      size: {
        default:
          "h-8 min-w-8 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        sm: "h-7 min-w-7 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 min-w-9 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

// Same clamp Button's own CLAMPED_RADIUS_SIZES documents — `sm`'s
// `rounded-[min(var(--radius-md),12px)]` is a deliberate anti-balloon cap,
// not a plain `rounded-lg`, so the skin token does not reach it.
const CLAMPED_RADIUS_SIZES = new Set(["sm"]);

function Toggle({
  className,
  variant = "default",
  size,
  style,
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  const resolvedSize = size ?? "default";
  return (
    <TogglePrimitive
      data-slot="toggle"
      data-size={resolvedSize}
      className={cn(toggleVariants({ variant, size: resolvedSize, className }))}
      style={{
        // The skin seam (src/skin/skin.ts + skin.css) — see button.tsx's
        // identical note on why the clamped size is excluded.
        ...(CLAMPED_RADIUS_SIZES.has(resolvedSize ?? "default") ? null : { borderRadius: "var(--bbox-skin-radius, var(--radius-lg))" }),
        // `outline` is the one variant with a real border (`border-input`)
        // — `default` is `bg-transparent` with no border at all. Same
        // split Badge's own `outline` variant makes.
        ...(variant === "outline" ? { borderColor: "var(--bbox-skin-line-override, var(--color-input))" } : null),
        ...style,
      }}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
