// src/components/settingsView.tsx — the Settings surface: a left nav of
// categories, the selected category's sections on the right, shown either as
// a centred dialog or as a full-window page.
//
// CONTRACT committed by the planning lane (docs/CHROME-FILES-SETTINGS-PLAN.md);
// `SettingsView` THROWS until lane `settings-kit` fills it in.
// `src/stories/SettingsView.stories.tsx` is the acceptance and is off-limits
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

import { useState, type ReactElement, type ReactNode } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";

import { cn } from "../lib/utils";
import { Button } from "./button";
import { DialogClose, DialogOverlay, DialogPortal } from "./dialog";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "./field";
import { RadioGroup, RadioGroupItem } from "./radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
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

export type SettingsControl =
  | { kind: "radio"; value: string; options: readonly SettingsOption[]; onValueChange(value: string): void }
  | { kind: "switch"; checked: boolean; onCheckedChange(checked: boolean): void; disabled?: boolean }
  | { kind: "select"; value: string; options: readonly SettingsOption[]; onValueChange(value: string): void }
  | { kind: "custom"; render: ReactNode };

export interface SettingsSection {
  id: string;
  title: string;
  description?: string;
  control: SettingsControl;
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

function renderControl(section: SettingsSection, controlId: string): ReactNode {
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
              {activeCategory?.sections.map((section) => {
                const controlId = `${testIdPrefix ?? "settings"}-${activeCategory.id}-${section.id}`;
                return (
                  <div key={section.id} data-slot="settings-section" data-section-id={section.id} className="flex flex-col gap-2">
                    <FieldTitle>{section.title}</FieldTitle>
                    {section.description ? <FieldDescription>{section.description}</FieldDescription> : null}
                    {renderControl(section, controlId)}
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
