// src/editor/controlPanel.tsx — ported from SystemSketch, read-only
// donor at /home/bam/systemsketch, revision
// `10748b8ccdb374e71714f3d351abc43947ecfb0e`:
//
//   • `src/contextualMenus/ContextualControls.tsx:251-401` — `ControlPanel`
//     (unrenamed), `OptionButton` (renamed `ControlOptionButton`).
//   • `src/contextualMenus/ContextualControls.tsx:455-500` — `CustomFontSizeCell`
//     (unrenamed).
//
// WHAT CHANGED in the port, exhaustively:
//
//   1. `useValue` (tldraw's reactive read) is gone — see `controlStrip.tsx`'s
//      own change (4) for the full rationale. `onPresetRungs` was
//      `customSize.onPresetRungs()`, a thunk re-invoked per render; it is
//      now the plain field `customSize.onPresetRungs`, read directly.
//   2. `CustomColorCell`/`CustomColorPicker` (donor :403-453) do not port —
//      out of scope by design (task brief: "Do NOT port CustomColorPicker").
//      `ControlPanel` takes a `customColorSlot?: ReactNode` prop instead:
//      when a control declares `custom: true`, this cell renders whatever
//      the host passes (a future real colour picker) or, absent a slot, a
//      purely decorative placeholder (`DefaultCustomColorSwatch` below) so
//      the layout still reads correctly with nothing wired up yet. The rule
//      that matters travels unchanged: the cell renders ONLY when
//      `control.custom` is true, exactly the same guard `CustomFontSizeCell`
//      below applies to `control.customSize`.
//   3. `formatFontPx` does not port (see `controlStrip.tsx`'s change 6); its
//      one rounding rule is the same local `formatPx` helper `controlStrip
//      .tsx` already defines — re-declared here rather than imported
//      because the two files must not import from each other (`ControlPanel`
//      is a leaf `ControlStrip` composes, never the reverse) and a
//      six-line pure function is cheaper duplicated than plumbed through a
//      new shared module outside this lane's write set.
//   4. THE PANEL PAINTS IN ITS SURFACE'S INK, NEVER IN A PAGE TOKEN
//      (2026-09-25). The port wrote its colours in shadcn's vocabulary —
//      `text-foreground`, `hover:bg-muted`, `bg-primary`, `border-border`,
//      `text-muted-foreground` — every one a PAGE token that flips with
//      `prefers-color-scheme`. But the panel is skinned by its host
//      (`ControlStrip`'s `panelClassName`; the pill passes `PILL_POPOVER`),
//      and the pill's surface is a FIXED #1e1e1e in both schemes. Measured in
//      the running app, light scheme, the Shape picker Zach photographed:
//      label #0a0a0a on #1e1e1e, 1.19:1; the list layout's check marks the
//      same 1.19:1; hover a near-white `oklch(0.97)` chip cut out of the dark
//      panel; the chosen chip `oklch(0.205)`, a shade darker than the panel
//      it sat on. Dark scheme read 15.97:1 throughout, which is why nobody
//      saw it until Zach opened the app in light mode.
//      The donor hit the identical bug one level up (its `.systemsketch-
//      appearance__trigger-px` and `__option:hover`, appearance.css:66-73 and
//      :180-186) and fixed it the same way this does: the panel's contents
//      INHERIT the surface's ink — `currentColor` — and derive every tint from
//      it (`color-mix` at 10% for hover, 60% for muted text, 15-20% for
//      rules), so a host that skins the surface gets readable contents for
//      free and a host that does not still gets the theme's, because the
//      unskinned popover's ink IS the theme's `popover-foreground`. The chosen
//      chip inverts — ink for its fill, the surface for its text, read off
//      `--bbox-pill-surface` (declared by `PILL_SURFACE`) with the theme's
//      `--popover` as the unskinned fallback — so its contrast is the panel's
//      own by construction. The tempting wrong fix was the host's: restate the
//      colours in `selectionClusters.tsx`'s `ON_PILL` and pass them down as
//      one more class string. That fixes one host's one skin and leaves the
//      next host to rediscover it (feedback.md, 2026-09-19: chrome fixes land
//      in the kit, the host only mounts and configures).
//
// Everything else — stacked-modes-outermost-last via `stackModes`
// (`controlRegistry.ts`), the beside-mode divider, the swatch ring styling,
// the list layout's check-mark-only selection, the automatic-option "A"
// badge, the custom px cell's Enter/blur commit and revert-on-invalid-input
// contract — is unchanged behaviour.
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check } from "lucide-react";

import { cn } from "../lib/utils";
import type { GlyphFamilies } from "./controlGlyphs";
import {
  MIXED_LABEL,
  stackModes,
  type BoundControl,
  type ContinuousBinding,
  type ControlLayout,
  type ControlOption,
  type CustomSizeBinding,
} from "./controlRegistry";

/**
 * Secondary text — a rung's px, the Custom cell's words, the slider's label
 * and readout — as the surface's ink at 60%, never `text-muted-foreground`
 * (change 4). The donor mutes its trigger px the same way, at 55%
 * (appearance.css:73); 60% is what keeps 11px tabular digits above 4.5:1 on
 * both the pill (#a5a5a5 on #1e1e1e, 7.0:1) and an unskinned light popover
 * (#666 on white, 5.7:1).
 */
const MUTED_INK = "text-current/60";

export interface ControlPanelProps<K extends string = string> {
  control: BoundControl<K>;
  glyphs: GlyphFamilies;
  /** Where a real colour picker lands later (out of scope here by design —
      see change 2 above). Ignored unless `control.custom` is true. */
  customColorSlot?: ReactNode;
  testIdPrefix?: string;
}

/** The popover body every popover-bearing trigger in `controlStrip.tsx`
    opens — one renderer for `swatches` / `row` / `chips` / `list` /
    `library`, chosen entirely by `data-layout`, never by `control.kind`. */
export function ControlPanel<K extends string>({
  control,
  glyphs,
  customColorSlot,
  testIdPrefix = "bbox",
}: ControlPanelProps<K>) {
  const beside = Boolean(control.modeControl) && control.modePlacement === "beside";
  const options = control.automaticOption ? [control.automaticOption, ...control.options] : control.options;
  const customSize = control.customSize;
  // A custom scale on any participant means no preset row is truthfully
  // "current" — see `ControlOptionButton`'s `forceUnchecked`.
  const onPresetRungs = customSize ? customSize.onPresetRungs : true;
  const sections = beside ? [control.modeControl!] : stackModes(control);

  return (
    <div
      data-slot="control-panel"
      role="menu"
      aria-label={control.label}
      data-layout={control.layout}
      data-mode={control.modeControl ? control.modePlacement : undefined}
      data-testid={testIdPrefix ? `${testIdPrefix}-control-panel-${control.id}` : undefined}
      className={cn("flex min-w-0 flex-col gap-2", beside && "flex-row items-center")}
    >
      {sections.map((section) => (
        <div
          key={section.id}
          role="group"
          aria-label={section.label}
          data-mode-control={section.id}
          data-mode-layout={section.layout}
          className={cn(
            "flex flex-wrap items-center gap-2",
            // The rule between a mode section and the options is the ink at
            // 15%, not `border-border` — see change 4: in light mode
            // `--border` is a bright `oklch(0.922)` line across a #1e1e1e
            // panel. Ink at 15% on the pill is #3a3a3a, FigJam's own traced
            // #383838 divider to within a shade.
            beside
              ? "min-h-7"
              : "-mx-2.5 border-b border-current/15 px-2.5 pb-2 first:-mt-0.5",
          )}
        >
          {section.options.map((option) => (
            <ControlOptionButton
              key={option.value}
              control={section}
              option={option}
              glyphs={glyphs}
              // The same rule the main option group uses below: a `row` is
              // icons only, anything else carries its name — what lets one
              // registered control render as labelled chips stacked on a
              // shape and as a bare icon row beside a connector's line
              // styles (ContextualControls.tsx:300-304, ported verbatim).
              withLabel={!beside && section.layout !== "row"}
            />
          ))}
        </div>
      ))}
      {beside ? <div aria-hidden="true" className="-my-2.5 w-px self-stretch bg-current/15" /> : null}
      <div
        role="group"
        aria-label={control.label}
        className={optionsGroupClass(control.layout)}
        style={
          control.columns ? { gridTemplateColumns: `repeat(${control.columns}, 1.5rem)` } : undefined
        }
      >
        {options.map((option) => (
          <ControlOptionButton
            key={option.value}
            control={control}
            option={option}
            glyphs={glyphs}
            withLabel={control.layout !== "row" && control.layout !== "swatches"}
            forceUnchecked={Boolean(customSize) && !onPresetRungs}
          />
        ))}
        {control.custom ? <CustomColorCell slot={customColorSlot} /> : null}
      </div>
      {/* Load-bearing (task brief): renders ONLY when the binding supplied a
          `customSize` — a surface bound to an explicit target (a block
          title) that never wires one gets presets-only, never a dead Custom
          cell. That bug already shipped once in the donor. */}
      {customSize ? <CustomFontSizeCell binding={customSize} /> : null}
      {/* Same rule as the Custom cell above: renders ONLY when the binding
          supplied one, so a control with no continuous channel never shows a
          dead slider. */}
      {control.continuous ? <ContinuousRow binding={control.continuous} /> : null}
    </div>
  );
}

function optionsGroupClass(layout: ControlLayout): string {
  switch (layout) {
    case "swatches":
      return "grid grid-cols-10 gap-2 self-start p-1";
    case "row":
      return "flex flex-wrap items-center gap-2";
    case "chips":
      return "flex flex-wrap items-center gap-1 p-1";
    case "list":
      return "flex flex-col";
    case "library":
      return "grid grid-cols-5 gap-0.5 max-h-64 overflow-y-auto overscroll-contain";
  }
}

function ControlOptionButton<K extends string>({
  control,
  option,
  glyphs,
  withLabel,
  forceUnchecked,
}: {
  control: BoundControl<K>;
  option: ControlOption;
  glyphs: GlyphFamilies;
  withLabel?: boolean;
  /** A custom scale is applied elsewhere on this target, so no preset row
      is truthfully "current" (donor's own name for the flag, kept). */
  forceUnchecked?: boolean;
}) {
  const isCurrent =
    !forceUnchecked && control.value?.type === "shared" && control.value.value === option.value;
  const automatic = control.automaticOption?.value === option.value;
  const rungPx = control.rungPxByValue?.[option.value];
  const list = control.layout === "list";
  const swatches = control.layout === "swatches";

  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={isCurrent}
      aria-label={option.label}
      title={option.label}
      data-control={control.id}
      data-kind={control.kind}
      data-value={option.value}
      onClick={() => control.onSelect(option.value)}
      className={cn(
        // `text-inherit`, and it is the whole of change 4 (file header): the
        // option paints in whatever ink the surface under it set, never in
        // the page's `text-foreground` — which is #0a0a0a in light mode and
        // put every label on the pill's #1e1e1e panel at 1.19:1. Written out
        // rather than left to preflight's `button { color: inherit }` so the
        // rule is visible at the seam it protects.
        "flex shrink-0 cursor-pointer items-center border-0 bg-transparent p-0 text-inherit",
        optionButtonClass(control.layout),
        isCurrent && selectedOptionClass(control.layout),
        // Hover is the ink at 10% — the donor's own rule (appearance.css:186),
        // and on the pill it lands on #353535, FigJam's traced #383838 to
        // within a shade. `hover:bg-muted` was `oklch(0.97)` in light mode: a
        // white chip cut out of the dark panel under the cursor.
        !isCurrent && "hover:bg-current/10",
      )}
    >
      {list ? (
        <Check
          aria-hidden="true"
          className={cn("size-4 shrink-0", isCurrent ? "opacity-100" : "opacity-0")}
        />
      ) : null}
      {automatic ? (
        <span
          aria-hidden="true"
          className={cn(
            "flex size-6 shrink-0 items-center justify-center font-mono text-xs font-extrabold",
            swatches && isCurrent && "rounded-full ring-2 ring-current",
          )}
        >
          A
        </span>
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            "flex shrink-0 items-center justify-center",
            swatches ? "size-6 rounded-full" : "size-6",
          )}
        >
          {control.glyph ? glyphs[control.glyph]?.(option.value) : null}
        </span>
      )}
      {withLabel ? <span className="min-w-0 flex-1 truncate text-left text-sm">{option.label}</span> : null}
      {withLabel && rungPx !== undefined && rungPx !== null ? (
        <span
          data-testid={`control-option-rung-px-${option.value}`}
          className={cn("ml-auto shrink-0 pl-2 text-xs tabular-nums", MUTED_INK)}
        >
          {formatPx(rungPx)}
        </span>
      ) : null}
    </button>
  );
}

function optionButtonClass(layout: ControlLayout): string {
  switch (layout) {
    case "swatches":
      return "size-6 justify-center rounded-full";
    case "row":
      return "size-6 justify-center rounded-md";
    case "chips":
      return "h-6 gap-1.5 rounded-md px-2";
    case "list":
      return "h-6 min-w-0 gap-1.5 rounded-md px-1.5";
    case "library":
      return "h-8 min-w-8 justify-start gap-2 rounded-lg px-1.5";
  }
}

/**
 * The chosen state per layout. `swatches` rings the disc rather than filling
 * its cell (FigJam draws the ring two pixels off the swatch's own edge —
 * appearance.css's own comment); every other layout fills, matching a
 * labelled chip's own selected state.
 *
 * WHY the fill is the ink INVERTED rather than `bg-primary` (change 4): on
 * the pill in light mode `--primary` is `oklch(0.205)`, one shade darker
 * than the #1e1e1e panel — the chosen chip was there and could not be seen.
 * Ink for the chip and the surface for its text gives the chip exactly the
 * panel's own contrast, whatever the skin, and on an unskinned popover it
 * resolves to the very pair `bg-primary text-primary-foreground` did
 * (near-black on white in light, near-white on `oklch(0.205)` in dark) — so
 * nothing moves where the tokens were right. Both colours are read off the
 * `--bbox-pill-ink` / `--bbox-pill-surface` pair `PILL_SURFACE` declares,
 * falling back to the theme's own popover pair for an unskinned panel.
 *
 * WHY not `bg-current` for the fill, which looks like the obvious "the ink"
 * spelling: `currentColor` is the element's OWN computed `color`, and this
 * same class list sets that to the surface — so the chip painted surface on
 * surface. Measured in the running app: chip `rgb(30,30,30)`, text
 * `rgb(30,30,30)`, 1:1. The ink has to be named from outside the element.
 *
 * WHY the swatch ring needs no `ring-offset`: the button is 24px and the
 * swatch inside it 20px, so the ring drawn at the button's own edge already
 * sits two pixels off the swatch — FigJam's gap — with the REAL surface
 * showing through. `ring-offset-popover` painted a light-mode-white gap
 * around the chosen swatch on the dark panel.
 */
function selectedOptionClass(layout: ControlLayout): string {
  if (layout === "swatches") return "ring-2 ring-current";
  // `list` marks a chosen row with the check mark alone (donor's own WHY,
  // carried forward): filling its background would put the row back on the
  // popover surface's own ink where a check has already said "selected."
  if (layout === "list") return "";
  return "bg-[var(--bbox-pill-ink,var(--popover-foreground))] text-[var(--bbox-pill-surface,var(--popover))]";
}

/**
 * Not part of the design's props sketch, added here to answer "what renders
 * in the 22nd cell before a host wires `customColorSlot`": a purely
 * decorative rainbow disc, the same shape the donor drew idle
 * (figjamTokens.ts's `CUSTOM_WHEEL`).
 */
function CustomColorCell({ slot }: { slot?: ReactNode }) {
  return (
    <span
      data-slot="control-custom-color"
      className="-m-1 flex size-8 shrink-0 items-center justify-center"
    >
      {slot ?? <DefaultCustomColorSwatch />}
    </span>
  );
}

function DefaultCustomColorSwatch() {
  return (
    <span
      aria-hidden="true"
      className="block size-6 rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]"
      // WHY inline style despite the house "never raw style={{color}} for
      // theming" rule: a colour wheel is not a THEME colour, it is a fixed
      // physical fact (the visible spectrum) that is identical in every
      // skin — the donor never made its own equivalent constant
      // (figjamTokens.ts's `CUSTOM_WHEEL`) a CSS variable either. This is
      // only ever the placeholder for `customColorSlot`; the moment a host
      // wires a real picker in, this never renders again.
      style={{
        background:
          "conic-gradient(#f00,#ffa800 47.73deg,#ff0 79.56deg,#0f0 121.33deg,#0ff 180.99deg,#00f 238.67deg,#f0f 294.36deg,#f00 360deg)",
      }}
    />
  );
}

function CustomFontSizeCell({ binding }: { binding: CustomSizeBinding }) {
  const sharedText = typeof binding.sharedPx === "number" ? formatPx(binding.sharedPx) : "";
  const [draft, setDraft] = useState(sharedText);
  useEffect(() => setDraft(sharedText), [sharedText]);

  const commit = () => {
    const parsed = Number.parseFloat(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(sharedText);
      return;
    }
    binding.applyPx(parsed);
  };

  return (
    <label className="mx-1 mt-1 flex items-center gap-2 rounded-md border border-current/20 px-2 py-1 text-sm">
      <span className={MUTED_INK}>Custom</span>
      <input
        data-testid="control-custom-size-input"
        type="number"
        min={binding.minPx}
        max={binding.maxPx}
        step={1}
        value={draft}
        placeholder={binding.sharedPx === "mixed" ? MIXED_LABEL : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
        className="w-full min-w-0 flex-1 bg-transparent text-right outline-none"
      />
      <span className={MUTED_INK}>px</span>
    </label>
  );
}

/**
 * The continuous channel's row — a slider and its readout, under the
 * options.
 *
 * WHY it lives in the panel rather than on the strip: opacity is an
 * attribute OF a paint, not a peer of it (Zach, 2026-09-24). The archived
 * app put it on the pill, arguing its current state is what you need to see
 * while you drag — true, and the readout beside the slider is what answers
 * that, without spending a slot on the bar for something that only applies
 * once you have already opened the paint you are fading.
 *
 * WHY `continuous: true` on input and a settling call on release: a range
 * input fires `input` per pixel. Marking every one of those as its own undo
 * step would make one drag cost forty presses of ⌘Z.
 */
function ContinuousRow({ binding }: { binding: ContinuousBinding }) {
  const shared = typeof binding.value === "number" ? binding.value : null;
  const [draft, setDraft] = useState(shared);
  useEffect(() => setDraft(shared), [shared]);
  const shown = draft ?? shared;

  return (
    <label
      data-slot="control-continuous"
      className="mx-1 mt-1 flex items-center gap-2 px-1 py-1 text-sm"
    >
      <span className={cn("shrink-0", MUTED_INK)}>{binding.label}</span>
      <input
        data-testid="control-continuous-input"
        type="range"
        min={binding.min}
        max={binding.max}
        step={binding.step ?? 1}
        // A mixed target has no one value to park the thumb at; the readout
        // says so and the slider sits at the low end rather than inventing a
        // number the selection does not have.
        value={shown ?? binding.min}
        aria-label={binding.label}
        aria-valuetext={shown === null ? MIXED_LABEL : binding.format(shown)}
        onChange={(event) => {
          const next = Number(event.target.value);
          setDraft(next);
          binding.apply(next, { continuous: true });
        }}
        onPointerUp={(event) => binding.apply(Number(event.currentTarget.value))}
        onKeyUp={(event) => binding.apply(Number(event.currentTarget.value))}
        className="min-w-24 flex-1 accent-[var(--bbox-control-accent,currentColor)]"
      />
      <output className={cn("w-10 shrink-0 text-right tabular-nums", MUTED_INK)}>
        {shown === null ? MIXED_LABEL : binding.format(shown)}
      </output>
    </label>
  );
}

/** Ours, ad hoc — see `controlStrip.tsx`'s change 6 and this file's own
    change 3: the one rounding rule of the donor's `formatFontPx`, not that
    function's live-scale plumbing. */
function formatPx(px: number): string {
  const rounded = Math.round(px * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
