// src/components/separator.tsx — based on apps/docs/src/registry/new-york-v4/
// ui/separator.tsx (the stock shadcn `new-york` Separator over Base UI's
// Separator primitive), NOT copied verbatim: that file's own
// `data-horizontal:`/`data-vertical:` classes are dead code. Verified against
// the real runtime (Separator.js sets a single `orientation` STATE key, and
// Base UI's generic state→attribute mapping — getStateAttributesProps.js —
// turns a non-boolean state value into `data-{key}="{value}"`, i.e.
// `data-orientation="horizontal"|"vertical"`, never a bare `data-horizontal`/
// `data-vertical` presence attribute) and against Tailwind's own compiler
// (`data-horizontal:` lowers to the attribute-presence selector
// `[data-horizontal]`, confirmed by compiling it — that selector can never
// match `[data-orientation=horizontal]`). `data-[orientation=…]:` is the
// selector that actually reads the DOM Base UI produces; `toolbar.tsx`'s
// `ToolbarSeparator` already uses this same corrected form, so this fixes
// the two files to agree rather than importing the stock copy's bug into a
// second place. `cn` import path also changed to match this app's own
// src/lib/utils.ts. This is the plain-CSS hairline used for bar dividers and
// grouped rows; a toolbar's own hairline is `toolbar.tsx`'s
// `ToolbarSeparator` instead — it wraps this same primitive but participates
// in the toolbar's roving-focus DOM structure, which a bare `Separator`
// doesn't.
"use client";

import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";

import { cn } from "../lib/utils";

function Separator({ className, orientation = "horizontal", ...props }: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:self-stretch",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
