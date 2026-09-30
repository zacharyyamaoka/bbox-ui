// src/editor/controlStrip.tsx — ported from SystemSketch, read-only
// donor at /home/bam/systemsketch, revision
// `10748b8ccdb374e71714f3d351abc43947ecfb0e`:
//
//   • `src/contextualMenus/ContextualControls.tsx:54-249` — `ContextualControls`
//     (renamed `ControlStrip`), `ContextualControlItem`, `ControlTrigger`,
//     `Chevron`. `stackedModes` (donor :241-249) does not live here — the
//     design promotes it to `controlRegistry.ts`'s `stackModes`, imported
//     from there instead of redefined.
//
// WHAT CHANGED in the port, exhaustively — so a future re-sync is a diff
// against this list, not a guess:
//
//   1. TRIGGER SHAPE BECOMES A LOOKUP, NEVER A PER-KIND CONDITIONAL (task
//      brief). The donor's `ContextualControlItem` already branches on
//      `control.trigger` rather than `control.kind` — that discipline
//      carries forward unchanged — but the branch itself was an if/else
//      chain; here it is `TRIGGER_SHAPES`, a `Record<ControlTrigger,
//      Component>`, so a future trigger shape is one table entry, not a new
//      `if`.
//   2. The toggle trigger's hardcoded `<strong>B</strong>` (donor :113,
//      correct only for the one toggle-trigger control that exists today —
//      `bold`) generalizes to: draw the control's own glyph family if it
//      declares one, else fall back to the first letter of its OWN label.
//      `bold`'s label is literally "Bold", so the fallback reproduces the
//      exact rendered "B" with no hardcoded string anywhere in this file.
//   3. The action trigger's icon: donor dispatched through
//      `FIGJAM_TRIGGER_ICON`, an app-owned table of FigJam's traced icons
//      keyed by `kind` (`ContextualControls.tsx:119-122`). The kit ships no
//      icon-by-kind registry of its own — every trigger face, whatever its
//      `trigger` shape, reads the SAME `glyphs` family table `ControlPanel`
//      reads for its options, keyed by the control's OWN `glyph` field. One
//      table for the whole control, not one per trigger shape, and not a
//      second one for triggers versus options.
//   4. `useValue` (tldraw's reactive read) is gone everywhere — the kit
//      takes plain data, recomputed by the host on every render (design's
//      "no signals" rule, `controlRegistry.ts`'s own header). `customSize
//      .sharedPx()` / `.onPresetRungs()` (donor thunks, re-invoked per
//      render) are now `CustomSizeBinding.sharedPx` / `.onPresetRungs`
//      (plain fields the binder computes once); `control.rungPx(value)` (a
//      thunk) is `control.rungPxByValue?.[value]` (a plain lookup object).
//   5. The dual Radix/tldraw popover (`ContextualPopover`/`EditingPopover`,
//      donor :514-575, chosen by a `popoverMode: 'selection' | 'editing'`
//      prop) collapses to the kit's OWN `Popover`/`PopoverContent`
//      (`popover.tsx`) — `popoverMode` becomes the `autoFocus` prop
//      `popover.tsx` already carries for exactly this purpose (a live text
//      editor that must keep its own focus while a control panel is open).
//   6. `formatFontPx` (donor `customFontSize.ts:231-234`) is not ported —
//      that whole file also owns live per-shape scale WRITES this kit has no
//      shape model for. Its one-decimal rounding RULE travels as a small
//      local `formatPx`, cited at its own definition below.
//   7. `CustomColorCell`/`CustomColorPicker` do not port — out of scope by
//      design (task brief). `ControlPanel` (`controlPanel.tsx`) takes a
//      `customColorSlot` prop where the picker lands later; `ControlStrip`
//      never reaches for it, and never knows the slot exists.
//
// Everything else — the "no popup engine picked per surface" shape, the
// value/icon-trigger mixed-state dimming, the A-badge guard, the Font size
// combobox's rung-px readout, "a group separator only between two non-empty
// groups" (already true because `composeControls` never emits an empty
// group; see `controlRegistry.ts`) — is unchanged behaviour.
"use client";

import { Fragment, type PointerEventHandler, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "../lib/utils";
import { ControlPanel } from "./controlPanel";
import type { GlyphFamilies } from "./controlGlyphs";
import {
  MIXED_LABEL,
  controlTriggerLabel,
  isAutomaticSelection,
  selectedControlOption,
  type BoundControl,
  type ControlComposition,
  type ControlTrigger,
} from "./controlRegistry";
import { Popover, PopoverContent, PopoverTrigger } from "../components/popover";
import { Toolbar, ToolbarButton, ToolbarGroup, ToolbarSeparator } from "./toolbar";

export interface ControlStripProps<K extends string = string> {
  composition: ControlComposition<K>;
  glyphs: GlyphFamilies;
  /** Popover plumbing for every `ControlPanel` this strip opens — the
      kit's universal host contract (MENU-KIT-DESIGN.md §4): a portal target
      inside the host's own token scope. */
  container?: HTMLElement | null;
  /** `false` while a live text editor elsewhere on the surface must keep
      its own focus (a block-title rename field, a colour hex input) — see
      `popover.tsx`'s own header for why this is a boolean, not the donor's
      two-popover-implementations split. */
  autoFocus?: boolean;
  /** The "this pointer event is mine" seam (tldraw's own
      `editor.markEventAsHandled`, or nothing for a host with no such
      concept) — wired onto every panel's own pointer-down-capture. */
  onPanelPointerDownCapture?: PointerEventHandler;
  testIdPrefix?: string;
  /** Not in the design doc's props sketch, added here because this
      component wraps `Toolbar` (`toolbar.tsx`), which — like every Base UI
      roving-focus container — wants an accessible name. Every other kit
      surface with the same shape (`ChromeBar`, `ToolDock`) takes its own
      `"aria-label"`; this one was simply the first to be built. */
  "aria-label"?: string;
  /** The host's skin for every panel this strip opens.
   *
   * WHY a prop and not the host's problem: a panel portals OUT of the strip,
   * so a wrapper's classes cannot reach it and the panel lands in the app's
   * page theme rather than the bar's. The trunk already exports `PILL_POPOVER`
   * (`floatingToolbar.tsx`) for exactly this; this is where a host passes it. */
  panelClassName?: string;
  /** The host's skin for every TRIGGER in this strip.
   *
   * Same seam as `panelClassName`, one level up. The kit's `ToolbarButton`
   * offers `sm`/`default`/`lg` (h-7/h-8/h-9, `rounded-lg`), and a host whose
   * bar is traced from another product may need a cell no size value can
   * reach — this app's is 40x5, measured off FigJam. Without this the four
   * kit triggers rendered 32px tall with a 10px radius beside the app's own
   * 40/5 cells, on one bar. */
  triggerClassName?: string;
}

/** One renderer for every registered control, regardless of target surface
    (donor's own one-line summary, ContextualControls.tsx:54, still true). */
export function ControlStrip<K extends string>({
  composition,
  glyphs,
  container,
  autoFocus,
  onPanelPointerDownCapture,
  testIdPrefix = "bbox",
  panelClassName,
  triggerClassName,
  "aria-label": ariaLabel,
}: ControlStripProps<K>) {
  return (
    <Toolbar
      aria-label={ariaLabel}
      data-slot="control-strip"
      // WHY two names on the same value: MENU-KIT-DESIGN.md §3.3 names the
      // rename `data-contextual-recipe` → `data-control-recipe`; the task
      // brief handed to this lane says the ORIGINAL name "survives... tests
      // assert on which recipe rendered." Both cannot be half-honored by
      // guessing, so this ships both attributes rather than picking a
      // string a downstream test might be keyed to sight-unseen — a
      // decision for whoever wires the first real host, not a coin flip
      // here.
      data-contextual-recipe={composition.id}
      data-control-recipe={composition.id}
      data-testid={testIdPrefix ? `${testIdPrefix}-control-strip` : undefined}
      className="flex-wrap"
    >
      {composition.groups.map((group, index) => (
        <Fragment key={group.id}>
          {/* `composeControls` (controlRegistry.ts) never emits a group with
              zero controls, so this separator can never hang over an empty
              gap — the elision happens upstream, once, not here per-render. */}
          {index > 0 ? <ToolbarSeparator /> : null}
          <ToolbarGroup data-contextual-group={group.id}>
            {group.controls.map((control) => (
              <ControlTriggerItem
                key={control.id}
                control={control}
                glyphs={glyphs}
                container={container}
                autoFocus={autoFocus}
                onPanelPointerDownCapture={onPanelPointerDownCapture}
                testIdPrefix={testIdPrefix}
                panelClassName={panelClassName}
                triggerClassName={triggerClassName}
              />
            ))}
          </ToolbarGroup>
        </Fragment>
      ))}
    </Toolbar>
  );
}

interface TriggerShapeProps<K extends string> {
  control: BoundControl<K>;
  glyphs: GlyphFamilies;
  container?: HTMLElement | null;
  autoFocus?: boolean;
  onPanelPointerDownCapture?: PointerEventHandler;
  testIdPrefix: string;
  panelClassName?: string;
  triggerClassName?: string;
}

/**
 * The lookup itself (change 1 above). `TriggerShapeProps<K>`'s generic can't
 * survive being stored as a plain `Record` value (a mapped type can't carry
 * a distinct type parameter per key), so each entry is typed loosely and
 * re-pinned to the caller's own `K` with a cast at the one call site below —
 * documented here rather than silently `any`-ed.
 */
type TriggerShapeComponent = (props: TriggerShapeProps<string>) => ReactNode;

function ControlTriggerItem<K extends string>(props: TriggerShapeProps<K>) {
  const Shape = TRIGGER_SHAPES[props.control.trigger] as unknown as (
    props: TriggerShapeProps<K>,
  ) => ReactNode;
  return <Shape {...props} />;
}

function ToggleTrigger<K extends string>({ control, glyphs, testIdPrefix }: TriggerShapeProps<K>) {
  const pressed = control.value?.type === "shared" && control.value.value === "on";
  const face = control.glyph ? glyphs[control.glyph]?.(pressed ? "on" : "off") : undefined;
  return (
    <ToolbarButton
      aria-label={control.label}
      title={control.label}
      aria-pressed={pressed}
      data-control={control.id}
      data-kind={control.kind}
      data-testid={testIdPrefix ? `${testIdPrefix}-control-${control.id}` : undefined}
      onClick={() => control.onSelect(pressed ? "off" : "on")}
    >
      {/* See change 2 above: the label-initial fallback reproduces the
          donor's hardcoded "B" for `bold` with no hardcoded string here. */}
      {face ?? (
        <strong aria-hidden="true" className="font-sans text-base">
          {control.label.charAt(0).toUpperCase()}
        </strong>
      )}
    </ToolbarButton>
  );
}

function ActionTrigger<K extends string>({ control, glyphs, testIdPrefix }: TriggerShapeProps<K>) {
  const face = control.glyph ? glyphs[control.glyph]?.(undefined) : undefined;
  return (
    <ToolbarButton
      aria-label={control.label}
      title={control.label}
      data-control={control.id}
      data-kind={control.kind}
      data-testid={testIdPrefix ? `${testIdPrefix}-control-${control.id}` : undefined}
      onClick={() => control.onSelect()}
    >
      {face}
    </ToolbarButton>
  );
}

/** Shared by the three popover-bearing trigger shapes (`value`/`icon`/`text`)
    — the disclosure mechanics are identical; only the trigger's own FACE
    (drawn by `TriggerFace` below) varies by `control.trigger`. */
function PopoverTriggerShape<K extends string>({
  control,
  glyphs,
  container,
  autoFocus,
  onPanelPointerDownCapture,
  testIdPrefix,
  panelClassName,
  triggerClassName,
}: TriggerShapeProps<K>) {
  const current = selectedControlOption(control);
  return (
    <Popover>
      <ToolbarButton
        aria-label={controlTriggerLabel(control)}
        title={control.label}
        data-control={control.id}
        data-kind={control.kind}
        data-trigger={control.trigger}
        data-mixed={current ? undefined : true}
        data-testid={testIdPrefix ? `${testIdPrefix}-control-${control.id}` : undefined}
        className={cn(
          "gap-1.5",
          // The Font size combobox (screenshot 03): a fixed-width row with
          // its own name left-aligned and the chevron pinned to the end,
          // matching FigJam's own 144px trigger (figjamTokens.ts's
          // `TEXT_TRIGGER_WIDTH`) rather than the icon triggers' snug fit.
          control.trigger === "text" && "w-36 justify-between px-2.5",
          // Last, so a host's traced cell wins over the kit's defaults.
          triggerClassName,
        )}
        render={<PopoverTrigger />}
      >
        <TriggerFace control={control} glyphs={glyphs} current={current} />
        <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 opacity-70" />
      </ToolbarButton>
      <PopoverContent
        side="top"
        align="center"
        container={container}
        autoFocus={autoFocus}
        className={cn("w-auto", panelClassName)}
        // WHY no close-on-select handler: `closeOnSelect={false}` is
        // `ControlPanel`'s explicit documented default (MENU-KIT-DESIGN.md
        // §3.3 — "align-then-distribute is the normal two-step; staying
        // open is policy, not an accident of which library we wrapped").
        // Base UI's own `Popover` already stays open on an inner click with
        // zero extra wiring (it only closes on outside click, Escape, or
        // the trigger itself), so the policy is satisfied by NOT adding an
        // auto-close callback here — adding one would be the accident this
        // WHY warns against.
        onPointerDownCapture={onPanelPointerDownCapture}
      >
        <ControlPanel control={control} glyphs={glyphs} testIdPrefix={testIdPrefix} />
      </PopoverContent>
    </Popover>
  );
}

function TriggerFace<K extends string>({
  control,
  glyphs,
  current,
}: {
  control: BoundControl<K>;
  glyphs: GlyphFamilies;
  current: ReturnType<typeof selectedControlOption>;
}) {
  if (control.trigger === "text") {
    const customPx = readCustomPx(control);
    return (
      <>
        <span className="min-w-0 flex-1 truncate text-left text-sm">
          {customPx ?? current?.label ?? MIXED_LABEL}
        </span>
        {customPx === null ? (
          <RungPxReadout control={control} value={current?.value} />
        ) : null}
      </>
    );
  }
  if (isAutomaticSelection(control)) {
    return (
      <span aria-hidden="true" className="font-mono text-xs font-extrabold">
        A
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-6 items-center justify-center",
        // WHY only `trigger==='value'` dims: a value-preview trigger with no
        // shared value must not show one option's crisp glyph as if it were
        // chosen (appearance.css's own WHY, carried verbatim) — a fixed-icon
        // trigger (`trigger==='icon'`) stays solid because its icon NAMES
        // the control, it never previews a value in the first place.
        control.trigger === "value" && !current && "opacity-40",
      )}
    >
      {/* `triggerGlyph` wins here and ONLY here — an option cell always draws
          with `glyph`, so a trigger can show something the options are not. */}
      {(() => {
        const family = control.triggerGlyph ?? control.glyph;
        if (!family) return null;
        return glyphs[family]?.(control.trigger === "value" ? current?.value : undefined);
      })()}
    </span>
  );
}

function readCustomPx<K extends string>(control: BoundControl<K>): string | null {
  const customSize = control.customSize;
  if (!customSize || customSize.onPresetRungs) return null;
  return typeof customSize.sharedPx === "number" ? `${formatPx(customSize.sharedPx)} px` : MIXED_LABEL;
}

function RungPxReadout<K extends string>({ control, value }: { control: BoundControl<K>; value?: string }) {
  const px = value !== undefined ? control.rungPxByValue?.[value] : undefined;
  if (px === undefined || px === null) return null;
  return (
    <span
      data-testid="control-trigger-rung-px"
      // The trigger's ink at 60%, not `text-muted-foreground` — the same rule
      // as `controlPanel.tsx`'s change 4, one level up: the trigger sits on
      // the host's skinned bar, and a page token on a fixed surface is right
      // in one colour scheme and wrong in the other. The donor mutes this
      // exact readout the same way (appearance.css:73, 55% of the pill ink).
      className="shrink-0 pr-0.5 text-xs text-current/60 tabular-nums"
    >
      {formatPx(px)}
    </span>
  );
}

/** Ours, ad hoc — the one-decimal rounding rule of the donor's
    `formatFontPx` (customFontSize.ts:231-234), which does not itself port
    (see change 6 above); only this small formatting rule travels. */
function formatPx(px: number): string {
  const rounded = Math.round(px * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

const TRIGGER_SHAPES: Record<ControlTrigger, TriggerShapeComponent> = {
  toggle: ToggleTrigger,
  action: ActionTrigger,
  value: PopoverTriggerShape,
  icon: PopoverTriggerShape,
  text: PopoverTriggerShape,
};
