// src/editor/breadcrumb.tsx — shadcn base-nova copy, ported from
// /home/bam/systemsketch/src/components/ui/breadcrumb.tsx:1-114 (itself a
// stock shadcn `new-york` Breadcrumb — plain semantic elements, no Base UI
// primitive backs a breadcrumb trail), `cn` repointed to this app's own
// `../lib/utils`.
import type * as React from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { ChevronRightIcon, MoreHorizontalIcon } from "lucide-react";

import { cn } from "../lib/utils";

function Breadcrumb({ className, ...props }: React.ComponentProps<"nav">) {
  return <nav aria-label="breadcrumb" data-slot="breadcrumb" className={cn(className)} {...props} />;
}

function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn("flex flex-wrap items-center gap-1.5 text-sm wrap-break-word text-muted-foreground", className)}
      {...props}
    />
  );
}

function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="breadcrumb-item" className={cn("inline-flex items-center gap-1", className)} {...props} />;
}

function BreadcrumbLink({ className, render, ...props }: useRender.ComponentProps<"a">) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        className: cn("transition-colors hover:text-foreground", className),
      },
      props,
    ),
    render,
    state: {
      slot: "breadcrumb-link",
    },
  });
}

function BreadcrumbPage({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-page"
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn("font-normal text-foreground", className)}
      {...props}
    />
  );
}

function BreadcrumbSeparator({ children, className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn("[&>svg]:size-3.5", className)}
      {...props}
    >
      {children ?? <ChevronRightIcon />}
    </li>
  );
}

// WHY this is a real menu, not decoration (docs/menus/MENU-KIT-DESIGN.md §5,
// "the `…` is a real menu of hidden levels"): `compactDepthBreadcrumbs`
// (ported into `breadcrumbCompact.ts` by another lane) elides middle path
// segments under a character budget, and the elided names still have to be
// reachable — this component only renders the glyph; the host wires a
// `DropdownMenu`/`ContextMenu` off it with the elided crumbs as items.
function BreadcrumbEllipsis({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      aria-hidden="true"
      className={cn("flex size-5 items-center justify-center [&>svg]:size-4", className)}
      {...props}
    >
      <MoreHorizontalIcon />
      <span className="sr-only">More</span>
    </span>
  );
}

export { Breadcrumb, BreadcrumbEllipsis, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator };
