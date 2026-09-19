// src/components/label.tsx — copied verbatim from the stock shadcn
// `base-nova` registry, fetched
// https://ui.shadcn.com/r/styles/base-nova/label.json and snapshotted at
// docs/provenance/shadcn-base-nova/label.json (2026-09-19). Only the `cn`
// import path changed to match this app's own src/lib/utils.ts — the stock
// source has no registry-internal sibling import and no generic icon
// stand-in, so none of the other two copy-trap rewrites applied. No
// restyle, no dropped or renamed export.
"use client";

import * as React from "react";
import { cn } from "../lib/utils";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Label };
