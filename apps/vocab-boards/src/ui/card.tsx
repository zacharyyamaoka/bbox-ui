"use client";

// src/ui/card.tsx — the stock shadcn `new-york` Card, written fresh. Absent
// from apps/docs/src/registry/new-york-v4/ui/ and from the trunk (the trunk's
// nearest thing is `block.tsx`, which is a SCENE component — a block drawn on
// a canvas — not page chrome). Only the parts this app uses are exported.
import type { ComponentProps } from "react";

import { cn } from "../lib/utils";

function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("grid auto-rows-min gap-1.5 px-6", className)} {...props} />;
}

function CardTitle({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-title" className={cn("leading-none font-semibold", className)} {...props} />;
}

function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-6", className)} {...props} />;
}

export { Card, CardContent, CardHeader, CardTitle };
