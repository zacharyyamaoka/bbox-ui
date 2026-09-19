// src/components/input.tsx — copied verbatim from the stock shadcn
// `base-nova` registry (Base UI's Input primitive), fetched
// https://ui.shadcn.com/r/styles/base-nova/input.json and snapshotted at
// docs/provenance/shadcn-base-nova/input.json (2026-09-19). Only the `cn`
// import path changed to match this app's own src/lib/utils.ts — the stock
// source has no registry-internal sibling import and no generic icon
// stand-in, so none of the other two copy-trap rewrites applied. No
// restyle, no dropped or renamed export.
import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "../lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  );
}

export { Input };
