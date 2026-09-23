// src/components/collapsible.tsx — copied verbatim from
// apps/docs/src/registry/new-york-v4/ui/collapsible.tsx (a thin Base UI
// wrapper, no cn/import-path changes needed at all). `FoldingChevron`
// (foldingChevron.tsx) builds the actual "hides body/footer on click"
// trigger on top of this.
"use client";

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger({ ...props }: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />
  );
}

function CollapsibleContent({ ...props }: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel data-slot="collapsible-content" {...props} />
  );
}

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
