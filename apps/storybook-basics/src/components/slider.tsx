// src/components/slider.tsx — copied verbatim from the stock shadcn Slider
// over Base UI's Slider primitive (the same `@base-ui/react/slider`
// `apps/storybook-basics` already depends on), fetched from
// https://ui.shadcn.com/r/styles/base-nova/slider.json and snapshotted at
// docs/provenance/shadcn-base-nova/slider.json. Only the one documented
// copy-trap fix was applied: the registry's bare `cn` specifier was
// repointed at this app's own `src/lib/utils.ts` — the same routine
// `tooltip.tsx`/`popover.tsx` already document in their own headers, and
// the one `stockPrimitives.test.ts` checks for every primitive in its list.
//
// The header used to cite the `new-york` style and SystemSketch's own
// vendored copy at `/home/bam/systemsketch/src/components/ui/slider.tsx`.
// That was true — both are this same component — but a second-hand citation
// is not an oracle, so the file now names the registry URL it was fetched
// from and is checked against the snapshot beside it.
"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";

import { cn } from "../lib/utils";

function Slider({ className, defaultValue, value, min = 0, max = 100, ...props }: SliderPrimitive.Root.Props) {
  const _values = Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max];

  return (
    <SliderPrimitive.Root
      className={cn("data-horizontal:w-full data-vertical:h-full", className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative grow overflow-hidden rounded-full bg-muted select-none data-horizontal:h-1 data-horizontal:w-full data-vertical:h-full data-vertical:w-1"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="bg-primary select-none data-horizontal:h-full data-vertical:w-full"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            className="relative block size-3 shrink-0 rounded-full border border-ring bg-white ring-ring/50 transition-[color,box-shadow] select-none after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3 disabled:pointer-events-none disabled:opacity-50"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
