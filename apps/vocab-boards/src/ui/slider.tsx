// src/components/slider.tsx — based on the stock shadcn Slider over Base UI's
// `@base-ui/react/slider`, fetched from
// https://ui.shadcn.com/r/styles/base-nova/slider.json and snapshotted at
// docs/provenance/shadcn-base-nova/slider.json. NOT copied verbatim: two
// documented fixes were applied, and `stockPrimitives.test.ts` pins BOTH of
// them so neither can silently widen.
//
// 1. The registry's bare `cn` specifier is repointed at this app's own
//    `src/lib/utils.ts` — the routine copy-trap every primitive here fixes.
//
// 2. WHY the orientation selectors were rewritten: the stock file styles the
//    track, indicator and vertical layout behind `data-horizontal:` /
//    `data-vertical:`, and those are DEAD CODE against the library it is
//    built on. Base UI maps a non-boolean state value to
//    `data-{key}="{value}"`, so a Slider emits `data-orientation="horizontal"`
//    — never a bare `data-horizontal` presence attribute. Tailwind lowers
//    `data-horizontal:` to the attribute-PRESENCE selector `[data-horizontal]`,
//    which can never match `[data-orientation=horizontal]`. Measured in the
//    running app before the fix: track height 0px, indicator height 0px — the
//    slider rendered as thumbs floating on nothing. `separator.tsx` documents
//    and fixes this same upstream bug, and `button-group.tsx`,
//    `toggle-group.tsx` and `settingsView.tsx` each carry the same note; this
//    file was the straggler. The bug is UPSTREAM's, not this copy's: the
//    registry source is faithfully reproduced everywhere else, which is why
//    the deviation is declared in the test rather than the file being dropped
//    from the verbatim set.
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
      className={cn("data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full", className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-40 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative grow overflow-hidden rounded-full bg-muted select-none data-[orientation=horizontal]:h-1 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="bg-primary select-none data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
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
