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
import type { ReactElement, ReactNode } from "react";

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
  void props;
  throw new Error("SettingsView: not implemented (lane settings-kit)");
}
