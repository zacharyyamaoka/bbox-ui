// src/components/textarea.tsx — copied verbatim from the stock shadcn
// `base-nova` registry, fetched
// https://ui.shadcn.com/r/styles/base-nova/textarea.json and snapshotted at
// docs/provenance/shadcn-base-nova/textarea.json (2026-09-19). Only the `cn`
// import path changed to match this app's own src/lib/utils.ts — the stock
// source has no registry-internal sibling import and no generic icon
// stand-in, so none of the other two copy-trap rewrites applied. No restyle,
// no dropped or renamed export.
//
// WHY it is here at all: nothing in this app renders a bare textarea. It is
// the sibling `input-group.tsx` needs — the stock InputGroup ships an
// `InputGroupTextarea` member, and dropping that member to avoid this file
// would make "verbatim" untrue for the one part the quick switcher's search
// field is built out of.
import * as React from "react";
import { cn } from "../lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
