// src/components/settingsView.tsx — the Settings surface: a left nav of
// categories, the selected category's sections on the right, shown either as
// a centred dialog or as a full-window page.
//
// CONTRACT committed by the planning lane (docs/CHROME-FILES-SETTINGS-PLAN.md);
// `SettingsView` THROWS until lane `settings-kit` fills it in.
// `src/components/SettingsView.stories.tsx` is the acceptance and is off-limits
// to the builder.
//
// Donor (read on disk, ported as BEHAVIOUR, not markup):
// `/home/bam/systemsketch/src/settings/InterfaceSettings.tsx:164-222` — the
// `SystemSketchSettingsDialog` shell: header "Settings" with a gear, a
// category nav (`aria-current="page"` on the active one), one panel per
// category, `role="switch"` toggle rows. Its tldraw dialog chrome
// (`TldrawUiDialog*`) does NOT travel: this kit builds on stock shadcn
// `Dialog` (Base UI flavour, `./dialog`), `RadioGroup`, `Switch`, `Select`,
// `Label` — copied verbatim by lane `stock-primitives`.
//
// WHY settings are DATA here (categories → sections → one control each)
// rather than host JSX: Zach — "system sketch should just be kinda like
// importing these stock menus and doing a light bit of configuration". A host
// says which settings exist and what they are bound to; how a radio row looks,
// where the description sits and how the nav highlights are this file's, so
// the next host inherits them. `kind: "custom"` is the escape hatch for a
// section no stock control fits (an About block), not the default.
"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactElement, type ReactNode } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";

import { cn } from "../lib/utils";
import { Button } from "./button";
import { DialogClose, DialogOverlay, DialogPortal } from "./dialog";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "./field";
import { Input } from "./input";
import { RadioGroup, RadioGroupItem } from "./radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { Slider } from "./slider";
import { Switch } from "./switch";

/** Zach: "We want the option wether we see settings as a [dialog or a page]". */
export type SettingsPresentation = "dialog" | "page";

export interface SettingsOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  /** Shown beside a disabled option — why it cannot be chosen here (e.g.
   *  "This browser has no File System Access API"). Never a silent grey. */
  disabledReason?: string;
}

/**
 * A numeric setting with a range: interface scale, wheel-zoom sensitivity,
 * pan and zoom speed.
 *
 * WHY this is a first-class kind rather than `custom`: `custom`'s own WHY
 * below calls it "the escape hatch for a section no stock control fits (an
 * About block), not the default", and the archived app has FOUR percentage
 * settings, not one — interface scale
 * (`/home/bam/systemsketch/src/settings/InterfaceSettings.tsx:794-855`),
 * wheel zoom sensitivity (:1055-1089) and the two gesture speeds (:1153-1193,
 * via `GestureSpeedRow`). Four hand-built controls is four chances for the
 * readout, the preset row and the keyboard behaviour to drift apart, which
 * is the exact failure the data-driven shell exists to prevent.
 */
/**
 * WHEN a slider writes: on every value it passes through, or once at the end
 * of the gesture.
 *
 * The two names are `codeEditorGesture.ts`'s `FieldCommitMode`, deliberately —
 * that header already makes this argument for text fields ("`exit` — the value
 * is buffered and written once, at the end boundary, for a write that is
 * genuinely expensive"), and `BackendSettings.tsx` already runs a field in
 * `exit` mode for exactly that reason. One vocabulary for one idea; a reader
 * who knows what `exit` means on a field knows what it means here.
 *
 * WHY a second mechanism rather than reusing `FieldGesture` itself: that class
 * carries a `string` and gets its end boundary from React (blur, Enter,
 * unmount) because the browser will not tell it about an unmounted field. A
 * slider's end boundary is `pointerup`, and the stock primitive underneath
 * this control already reports it — `@base-ui/react`'s `Slider.Root` fires
 * `onValueCommitted` once per gesture, and never at all if the value did not
 * change. Hand-rolling a pointer state machine beside it would be a second,
 * worse copy of a stock part. So: same vocabulary, stock mechanism.
 *
 * `live` is the default, so the three percentage sliders that were correct
 * before this existed (wheel-zoom sensitivity, pan speed, zoom speed) keep
 * behaving exactly as they did.
 */
export type SettingsCommitMode = "live" | "exit";

export interface SettingsSliderControl {
  kind: "slider";
  value: number;
  min: number;
  max: number;
  step: number;
  onValueChange(value: number): void;
  /**
   * `live` (default) calls `onValueChange` for every value the gesture passes
   * through. `exit` calls it ONCE, when the gesture ends — the thumb and the
   * readout still move live, so the drag has feedback, but the value is not
   * written until release.
   *
   * Zach, 2026-09-21, on the interface-scale slider: "it should only update
   * when I release my finger from the drag, but its updating as the slider
   * moves". That setting re-lays-out every pixel of chrome on write, INCLUDING
   * the dialog holding the slider — so a live write moves the control out from
   * under the pointer mid-drag. `exit` is for a write like that: disruptive,
   * not merely expensive.
   */
  commit?: SettingsCommitMode;
  /** The live readout and `aria-valuetext`; default is the bare number. */
  format?(value: number): string;
  /** End-of-track captions — the donor's "Slower"/"Faster" (:1064, :1078)
   *  and the small/large "A" of the interface-scale row (:809, :820). */
  minLabel?: ReactNode;
  maxLabel?: ReactNode;
  /** One-click jumps under the track. Donor: `INTERFACE_SCALE_PRESETS`
   *  rendered as `aria-pressed` buttons (:823-835). */
  presets?: readonly number[];
  /**
   * A text box for an exact value beside the track.
   *
   * WHY: Zach, after using the slider, asked to "set the scroll and zoom
   * sensitivity exactly to a value that I want" rather than only drag toward
   * one — the donor's `PercentInput.tsx` and the `GestureSpeedRow` comment at
   * `InterfaceSettings.tsx:1145-1152`. A drag cannot hit 137%.
   */
  exactEntry?: boolean;
  /** Restores `resetTo` and is disabled once `value` already equals it.
   *  Donor: "Reset to 100%" (:845-852), "Reset to standard" (:1080-1089). */
  resetTo?: number;
  resetLabel?: string;
}

export type SettingsControl =
  | { kind: "radio"; value: string; options: readonly SettingsOption[]; onValueChange(value: string): void }
  | { kind: "switch"; checked: boolean; onCheckedChange(checked: boolean): void; disabled?: boolean }
  | { kind: "select"; value: string; options: readonly SettingsOption[]; onValueChange(value: string): void }
  | SettingsSliderControl
  | { kind: "custom"; render: ReactNode };

export interface SettingsSection {
  id: string;
  title: string;
  description?: string;
  control: SettingsControl;
  /**
   * An optional sub-heading this section sits under. Consecutive sections
   * naming the same group render beneath one heading.
   *
   * WHY the shell owns grouping rather than the host slicing its own
   * `<h3>`s in through `custom`: Connections alone is nine permissions, and
   * the archived app teaches them in four named groups — Direction,
   * Boundaries, Data types, and how many cables meet at one port
   * (`/home/bam/systemsketch/src/settings/InterfaceSettings.tsx:658-768`).
   * A flat list of nine switches is the same information with the teaching
   * removed.
   */
  group?: string;
  /**
   * One line under the group's heading, read only from the section that
   * OPENS the group.
   *
   * The archive gives every one of those groups a `<p>` of its own —
   * "Where a paste or duplicate lands.", "Which way data is allowed to run,
   * and whether it may come back around." Without somewhere for it to live
   * it has to be pushed onto the first ROW's description, where it reads as
   * a statement about that one control instead of about the group (seen in
   * the first captures of this port: "What each wheel gesture does…" sitting
   * under "Scroll wheel down").
   */
  groupDescription?: string;
}

export interface SettingsCategory {
  id: string;
  label: string;
  icon?: ReactNode;
  sections: readonly SettingsSection[];
}

export interface SettingsViewProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  presentation: SettingsPresentation;
  categories: readonly SettingsCategory[];
  /** Controlled category id; omitted → uncontrolled, starting on the first. */
  category?: string;
  onCategoryChange?(id: string): void;
  /** Header text; default "Settings". */
  title?: string;
  /** Portal target inside the host's token scope (menu-kit host contract §4). */
  container?: HTMLElement | null;
  /** Host CSS on the popup — stacking only; the kit ships zero z-index. */
  popupClassName?: string;
  testIdPrefix?: string;
}

// The dialog's own base-nova styling (components/dialog.tsx) is a fixed,
// non-conditional class string, so `presentation` is switched here at the
// className level rather than by fighting it with `data-[presentation=…]:`
// overrides of every dialog-mode utility. Both branches are stock Tailwind
// utilities only — no bespoke positioning math.
//
// WHY fade only, no `zoom-in-95` (unlike dialog.tsx's DialogContent): the
// scale keyframe lives on whichever position/size classes are ALSO the ones
// that change between presentations, so switching dialog<->page removes and
// re-adds the animation utility on an already-open popup — the browser
// restarts the transform mid-flight and `getBoundingClientRect` can catch it
// still scaled down (measured: a stray ~15px on a ~380px box, the tempting
// zoom kept from dialog.tsx). Keeping the animation entirely in `POPUP_BASE`
// (present at every presentation, never toggled) means a presentation swap
// can never retrigger it.
const POPUP_BASE =
  "fixed z-50 flex flex-col gap-4 bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0";

const POPUP_DIALOG =
  "top-1/2 left-1/2 w-full max-w-[calc(100%-2rem)] max-h-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl sm:max-w-lg";

const POPUP_PAGE = "inset-0 h-screen w-screen max-w-none max-h-none translate-x-0 translate-y-0 overflow-hidden rounded-none";

/**
 * The exact-value box beside a slider.
 *
 * Ported as BEHAVIOUR from `/home/bam/systemsketch/src/settings/PercentInput.tsx:1-89`
 * onto the stock `Input`: accept any text while editing, commit on Enter or
 * blur, abandon on Escape, and follow the outside value only while NOT
 * editing.
 *
 * WHY that last clause: the slider and this box are two views of one number,
 * so echoing every drag into the box would rewrite the digits under someone
 * mid-type. The donor's own `draftRef` exists for exactly that, and the
 * tempting `value={value}` controlled input is what it rejects.
 */
function SliderExactEntry({
  control,
  controlId,
  label,
}: {
  control: SettingsSliderControl;
  controlId: string;
  label: string;
}): ReactElement {
  const [draft, setDraft] = useState<string | null>(null);
  const committedRef = useRef(control.value);
  committedRef.current = control.value;

  // Donor `PercentInput.tsx:30-36` — follow the store only when idle.
  useEffect(() => {
    setDraft(null);
  }, [control.value]);

  function commit(raw: string) {
    const parsed = Number.parseFloat(raw);
    setDraft(null);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(control.max, Math.max(control.min, Math.round(parsed)));
    if (clamped !== committedRef.current) control.onValueChange(clamped);
  }

  return (
    <Input
      data-slot="settings-slider-input"
      id={`${controlId}-exact`}
      aria-label={`${label}, exact value`}
      inputMode="numeric"
      className="h-8 w-20 shrink-0 text-center tabular-nums"
      value={draft ?? String(control.value)}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={(event) => commit(event.currentTarget.value)}
      onKeyDown={(event) => {
        // The donor stops these reaching the canvas, where digits are tool
        // shortcuts (`PercentInput.tsx:52-58`). Same reason here: the kit is
        // mounted over a host that binds keys.
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          commit(event.currentTarget.value);
        } else if (event.key === "Escape") {
          event.preventDefault();
          setDraft(null);
        }
      }}
    />
  );
}

/**
 * The `slider` section: track, optional end captions, optional exact-entry
 * box, live readout, optional preset row, optional reset.
 *
 * WHY this is a COMPONENT and not the plain `renderSlider(...)` helper it used
 * to be: `commit: "exit"` needs a piece of state — the value the gesture is
 * currently showing but has not written — and a hook called from inside
 * `renderControl`'s `switch` would change hook order with the control kind.
 *
 * ── What `exit` does, and what it deliberately does not do ────────────────
 *
 * In `exit` mode `onValueChange` (which Base UI fires per pointermove) feeds
 * `preview` only. `onValueCommitted` — Base UI's own end-of-gesture callback,
 * fired from `pointerup` — is the single call to `control.onValueChange`.
 * So a drag across N values writes ONCE, not N times.
 *
 * The THUMB and the READOUT follow `preview`, so the drag has live feedback:
 * the person has to see that their finger is doing something, and the number
 * is the cheap half — it is the APP re-laying-out that is disruptive, not the
 * digits changing.
 *
 * The PRESET row and the RESET button keep following `control.value`, the
 * committed one, on purpose. They describe what is APPLIED, not where the
 * thumb is: `aria-pressed` on "125%" means the interface IS at 125%, and
 * Reset is DISABLED when there is nothing to undo. Driving Reset off a preview
 * would disable the only way back at the exact moment a drag happened to pass
 * over 100%.
 *
 * Presets and Reset are also, themselves, discrete: one click is a whole
 * gesture with no release to wait for, so they write immediately in both
 * modes. They call `control.onValueChange` directly, below, and never go near
 * `preview`.
 */
function SettingsSlider({
  control,
  controlId,
  titleId,
  label,
}: {
  control: SettingsSliderControl;
  controlId: string;
  titleId: string;
  label: string;
}): ReactElement {
  const format = control.format ?? String;
  const deferred = control.commit === "exit";

  /** The value under the pointer, or `null` when nothing is uncommitted. */
  const [preview, setPreview] = useState<number | null>(null);
  /** Set by Escape; makes the rest of THIS gesture write nothing at all. */
  const abandonedRef = useRef(false);

  // Follow the store whenever it moves for any other reason — a preset, the
  // reset button, a second window writing the same preference. Same idiom and
  // same reason as `SliderExactEntry`'s draft above: a leftover preview must
  // never mask the real value.
  useEffect(() => {
    setPreview(null);
  }, [control.value]);

  const shown = preview ?? control.value;

  function valueOf(next: number | readonly number[]): number {
    return Array.isArray(next) ? (next[0] as number) : (next as number);
  }

  function handleValueChange(next: number | readonly number[]): void {
    const value = valueOf(next);
    if (!deferred) {
      control.onValueChange(value);
      return;
    }
    if (abandonedRef.current) return;
    setPreview(value);
  }

  function handleValueCommitted(next: number | readonly number[]): void {
    if (!deferred) return;
    if (abandonedRef.current) {
      // The gesture that Escape cancelled has finally ended. Nothing is
      // written; the next pointerdown starts a fresh, writable one.
      abandonedRef.current = false;
      setPreview(null);
      return;
    }
    const value = valueOf(next);
    setPreview(null);
    // Both state updates sit in one event handler, so React batches them and
    // the next render already sees the new `control.value` — no frame of the
    // old number between clearing the preview and the store catching up.
    if (value !== control.value) control.onValueChange(value);
  }

  /**
   * Escape mid-drag ABANDONS the gesture: the preview disappears, nothing is
   * written, and the rest of the drag is ignored even if the pointer keeps
   * moving.
   *
   * WHY this is written here rather than inherited: it is NOT stock. Checked
   * against the pinned `@base-ui/react@1.8.0` — `SliderThumb`'s `onKeyDown`
   * returns early for any key outside `ALL_KEYS` (arrows, Home/End, PageUp/Down)
   * and there is no `Escape` or `keydown` handler anywhere else in
   * `slider/`. So Escape mid-drag did nothing to the slider and bubbled
   * straight to the enclosing Dialog, which CLOSED — unmounting the control
   * with the pointer still captured, so `onValueCommitted` never arrived and
   * the value silently vanished. Accidental, and the worst of the three
   * possible behaviours.
   *
   * Abandon rather than commit, for two reasons: Escape means "take it back"
   * everywhere else in this app, and `SliderExactEntry` three functions up
   * already answers Escape by dropping its draft. One key, one meaning.
   *
   * Only consumed while a preview is actually pending. With nothing in
   * flight — no drag, or a second Escape after the first cancelled one —
   * Escape passes through and closes Settings exactly as it always has.
   */
  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "Escape" || !deferred || preview === null) return;
    event.preventDefault();
    event.stopPropagation();
    abandonedRef.current = true;
    setPreview(null);
  }

  return (
    <div
      data-slot="settings-slider"
      data-commit={control.commit ?? "live"}
      // The one honest signal that a value is shown but not yet applied —
      // for a test, and for a skin that wants to say so visually.
      data-pending={preview === null ? undefined : "true"}
      className="flex flex-col gap-2"
      onKeyDown={handleKeyDown}
      // A fresh gesture is always writable, whatever the last one did.
      onPointerDownCapture={() => {
        abandonedRef.current = false;
      }}
    >
      <div className="flex items-center gap-3">
        {control.minLabel ? <span aria-hidden="true" className="text-muted-foreground shrink-0 text-xs">{control.minLabel}</span> : null}
        <Slider
          // WHY this className exists at all — the stock Slider renders with
          // ZERO size on the Base UI this app pins, and it is not a copy
          // error. `slider.tsx` is verbatim from
          // https://ui.shadcn.com/r/styles/base-nova/slider.json and asks for
          // its horizontal geometry through `data-horizontal:` utilities
          // (root width, track height, indicator height). `@base-ui/react@1.8.0`
          // does not emit that attribute: its slider state mapping
          // (`slider/root/stateAttributesMapping.js`) leaves `orientation` to
          // the default string handling, so the DOM carries
          // `data-orientation="horizontal"` and nothing matches. Measured in a
          // real browser: root 0px wide, track 0px tall, and the thumb then
          // stays `visibility: hidden` forever because Base UI's inset
          // alignment divides by the control's width
          // (`slider/thumb/SliderThumb.js:160-180`) — which also takes the
          // control OUT of the accessibility tree, so `getByRole("slider")`
          // cannot find it.
          //
          // The compensation lives HERE, in the consumer, rather than in
          // `slider.tsx`: that file's whole value is being byte-checkable
          // against the snapshot (`stockPrimitives.test.ts`), and editing it
          // to fix an upstream version skew is how a vendored copy quietly
          // stops being stock. These utilities are what the dead ones would
          // have done; they become redundant, not wrong, if either side
          // catches up.
          className="min-w-0 flex-1 [&_[data-slot=slider-range]]:h-full [&_[data-slot=slider-track]]:h-1"
          // WHY the value is wrapped in an array for a SINGLE-value slider:
          // the stock component reads `Array.isArray(value) ? value :
          // Array.isArray(defaultValue) ? defaultValue : [min, max]`
          // (`slider.tsx`, verbatim from the registry), so a bare number
          // falls through to `[min, max]` and it renders TWO thumbs —
          // measured in a real browser, both stamped `data-index="0"`.
          // Passing `[value]` is the stock usage shadcn's own examples show.
          // `shown`, not `control.value`: in `exit` mode this is what makes
          // the thumb track the pointer while the store stays put.
          value={[shown]}
          min={control.min}
          max={control.max}
          step={control.step}
          // Base UI puts the accessible name on the THUMB's nested
          // `<input type="range">`, reading it from the root's
          // `aria-labelledby` through slider context (`SliderRoot.js:88-91`,
          // `SliderThumb.js:244-251`) — so naming the root is what names the
          // control a screen reader actually lands on.
          aria-labelledby={titleId}
          onValueChange={(next) => handleValueChange(next)}
          // The stock end-of-gesture callback: fired once from `pointerup`
          // (`slider/control/SliderControl.js:283-306`) and once per key press
          // for the keyboard (`slider/root/SliderRoot.js:182-195`). In `live`
          // mode this is a no-op — the value was already written on change.
          onValueCommitted={(next) => handleValueCommitted(next)}
        />
        {control.maxLabel ? <span aria-hidden="true" className="text-muted-foreground shrink-0 text-base">{control.maxLabel}</span> : null}
        {control.exactEntry ? <SliderExactEntry control={control} controlId={controlId} label={label} /> : null}
        {/* The donor's live readout (`InterfaceSettings.tsx:803`), kept as a
            real `<output>` so the number is announced as it changes rather
            than only living in the thumb's `aria-valuetext`. */}
        <output
          data-slot="settings-slider-value"
          htmlFor={controlId}
          aria-live="polite"
          className="w-14 shrink-0 text-right text-sm tabular-nums"
        >
          {format(shown)}
        </output>
      </div>
      {control.presets && control.presets.length > 0 ? (
        <div data-slot="settings-slider-presets" role="group" aria-label={`${label} presets`} className="flex flex-wrap gap-1">
          {control.presets.map((preset) => (
            <Button
              key={preset}
              type="button"
              size="sm"
              variant={preset === control.value ? "secondary" : "ghost"}
              // The donor's own semantics (:823-835): a preset is a pressed
              // state, not a second selected-radio vocabulary.
              aria-pressed={preset === control.value}
              data-slot="settings-slider-preset"
              data-preset-value={preset}
              className="h-7 px-2 font-normal tabular-nums"
              onClick={() => control.onValueChange(preset)}
            >
              {format(preset)}
            </Button>
          ))}
        </div>
      ) : null}
      {control.resetTo !== undefined ? (
        <div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-slot="settings-slider-reset"
            className="h-7 font-normal"
            disabled={control.value === control.resetTo}
            onClick={() => control.resetTo !== undefined && control.onValueChange(control.resetTo)}
          >
            {control.resetLabel ?? `Reset to ${format(control.resetTo)}`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function renderControl(section: SettingsSection, controlId: string, titleId: string): ReactNode {
  const control = section.control;
  switch (control.kind) {
    case "radio":
      return (
        <RadioGroup value={control.value} onValueChange={(value) => control.onValueChange(value as string)}>
          {control.options.map((option) => {
            const optionId = `${controlId}-${option.value}`;
            return (
              <FieldLabel key={option.value} htmlFor={optionId}>
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldTitle>{option.label}</FieldTitle>
                    {option.description ? <FieldDescription>{option.description}</FieldDescription> : null}
                    {option.disabled && option.disabledReason ? (
                      <FieldDescription>{option.disabledReason}</FieldDescription>
                    ) : null}
                  </FieldContent>
                  <RadioGroupItem
                    id={optionId}
                    value={option.value}
                    disabled={option.disabled}
                    data-option-value={option.value}
                  />
                </Field>
              </FieldLabel>
            );
          })}
        </RadioGroup>
      );
    case "switch":
      return (
        <Switch
          id={controlId}
          checked={control.checked}
          onCheckedChange={control.onCheckedChange}
          disabled={control.disabled}
          aria-label={section.title}
        />
      );
    case "select": {
      // Base UI's Select resolves the trigger's initial label from `items`
      // (its own documented API) — the popup's items are not in the DOM
      // until first opened, so without this map the trigger shows nothing
      // until a selection is made (see Select.stories.tsx).
      const items = Object.fromEntries(control.options.map((option) => [option.value, option.label]));
      return (
        <Select value={control.value} onValueChange={(value) => control.onValueChange(value as string)} items={items}>
          <SelectTrigger id={controlId} aria-label={section.title}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {control.options.map((option) => (
              <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    case "slider":
      return <SettingsSlider control={control} controlId={controlId} titleId={titleId} label={section.title} />;
    case "custom":
      return control.render;
  }
}

/**
 * DOM contract (what the acceptance story measures; the builder keeps it):
 *   - one element `[data-slot="settings-view"]` — the stock Dialog POPUP
 *     itself, `role="dialog"` — carrying `data-presentation="dialog" |
 *     "page"` (and `data-testid` = `testIdPrefix` when given);
 *   - `presentation="dialog"` → a modal centred popup NARROWER and SHORTER
 *     than the viewport, over a backdrop;
 *   - `presentation="page"` → the popup's `getBoundingClientRect()` equals the
 *     viewport (±1px) — the settings take the whole window, no backdrop
 *     showing around it;
 *   - both: Escape and the header's Close button call `onOpenChange(false)`;
 *     focus is trapped while open (stock Dialog behaviour, not re-implemented);
 *   - nav: `[data-slot="settings-nav"]` holding one button per category,
 *     `aria-current="page"` on the active one;
 *   - each rendered section: `[data-slot="settings-section"]
 *     [data-section-id=<id>]`, its title as visible text, its control a stock
 *     `RadioGroup` (`role="radiogroup"`, each option's `role="radio"`
 *     element carrying `data-option-value=<value>` and its visible label),
 *     `Switch` (`role="switch"`), or `Select`;
 *   - a `slider` section: `[data-slot="settings-slider"]` (carrying
 *     `data-commit="live" | "exit"`, and `data-pending="true"` only while an
 *     `exit` gesture is showing a value it has not written) holding a stock
 *     `Slider` (its thumb's nested `input[type="range"]`, named from the
 *     section title), a live `[data-slot="settings-slider-value"]` readout,
 *     and — when asked for — `[data-slot="settings-slider-input"]`,
 *     `[data-slot="settings-slider-preset"][data-preset-value=<n>]` with
 *     `aria-pressed`, and `[data-slot="settings-slider-reset"]` disabled once
 *     the value is already the reset target;
 *   - the first section of a run sharing a `group` emits
 *     `[data-slot="settings-group"][data-group=<name>]` above its title;
 *     later sections in the same run emit none;
 *   - changing `presentation` while open re-presents the SAME open settings
 *     (same category) in the other container — no close/reopen needed.
 */
export function SettingsView(props: SettingsViewProps): ReactElement | null {
  const {
    open,
    onOpenChange,
    presentation,
    categories,
    category,
    onCategoryChange,
    title = "Settings",
    container,
    popupClassName,
    testIdPrefix,
  } = props;

  // Uncontrolled fallback per the DOM contract's "omitted → uncontrolled,
  // starting on the first" — this state lives on SettingsView itself, not
  // the Dialog, so switching `presentation` re-renders the SAME element in
  // place and the open category survives it for free.
  const [uncontrolledCategoryId, setUncontrolledCategoryId] = useState<string | undefined>(undefined);
  const activeCategoryId = category ?? uncontrolledCategoryId ?? categories[0]?.id;
  const activeCategory = categories.find((candidate) => candidate.id === activeCategoryId) ?? categories[0];

  function selectCategory(id: string) {
    onCategoryChange?.(id);
    if (category === undefined) setUncontrolledCategoryId(id);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPortal container={container}>
        <DialogOverlay />
        <DialogPrimitive.Popup
          data-slot="settings-view"
          data-presentation={presentation}
          data-testid={testIdPrefix}
          className={cn(POPUP_BASE, presentation === "page" ? POPUP_PAGE : POPUP_DIALOG, popupClassName)}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border pb-3">
            <DialogPrimitive.Title className="cn-font-heading text-base leading-none font-medium">
              {title}
            </DialogPrimitive.Title>
            <DialogClose render={<Button variant="ghost" size="icon-sm" />}>
              <XIcon />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>
          <div className="flex min-h-0 flex-1 gap-4">
            {/* WHY the nav is stock `Button`s rather than the hand-styled rows
                this file shipped first: Zach, 2026-09-19 — "as always please be
                using stock shadcn as much as possible". The hand-rolled row had
                re-derived `hover:bg-muted`, the active tint and the icon sizing
                by hand, which is three chances to drift from every other
                control in the kit and no way for a consumer to `shadcn add` the
                same thing. `secondary` IS the stock active tint. */}
            <nav data-slot="settings-nav" aria-label="Settings categories" className="flex w-36 shrink-0 flex-col gap-0.5">
              {categories.map((cat) => {
                const active = cat.id === activeCategory?.id;
                return (
                  <Button
                    key={cat.id}
                    type="button"
                    variant={active ? "secondary" : "ghost"}
                    size="sm"
                    // The donor's own semantics (InterfaceSettings.tsx:164-222),
                    // kept: the open category is the current page, not just a
                    // differently-coloured button.
                    aria-current={active ? "page" : undefined}
                    onClick={() => selectCategory(cat.id)}
                    className={cn("justify-start gap-2 px-2 font-normal", !active && "text-muted-foreground")}
                  >
                    {cat.icon}
                    {cat.label}
                  </Button>
                );
              })}
            </nav>
            {/* WHY: the pane fills the window in `page` presentation, so without a
                reading measure every option row stretches the full viewport and strands
                its radio ~1,300px from its label — measured in a real 1400px window. The
                cap is on the CONTENT, never on the popup, because the presentation
                contract is that the page rect equals the viewport exactly. */}
            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto [&>*]:w-full [&>*]:max-w-2xl">
              {activeCategory?.sections.map((section, index) => {
                const controlId = `${testIdPrefix ?? "settings"}-${activeCategory.id}-${section.id}`;
                const titleId = `${controlId}-title`;
                // A heading opens a run of sections, so it renders only when
                // the group CHANGES — the donor's four `<h3>`-led blocks
                // (`InterfaceSettings.tsx:658-768`) without the host having to
                // hand-slice its own list into sub-lists.
                const previousGroup = index === 0 ? undefined : activeCategory.sections[index - 1].group;
                const opensGroup = section.group !== undefined && section.group !== previousGroup;
                return (
                  <div key={section.id} data-slot="settings-section" data-section-id={section.id} className="flex flex-col gap-2">
                    {opensGroup ? (
                      <>
                        <h3
                          data-slot="settings-group"
                          data-group={section.group}
                          className="cn-font-heading text-muted-foreground mt-2 text-xs font-medium tracking-wide uppercase first:mt-0"
                        >
                          {section.group}
                        </h3>
                        {section.groupDescription ? (
                          <FieldDescription data-slot="settings-group-description">
                            {section.groupDescription}
                          </FieldDescription>
                        ) : null}
                      </>
                    ) : null}
                    <FieldTitle id={titleId}>{section.title}</FieldTitle>
                    {section.description ? <FieldDescription>{section.description}</FieldDescription> : null}
                    {renderControl(section, controlId, titleId)}
                  </div>
                );
              })}
            </div>
          </div>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}
