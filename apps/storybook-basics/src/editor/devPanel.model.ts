// src/editor/devPanel.model.ts — what a developer panel is MADE OF,
// with no idea what any of it means.
//
// Ported as a VOCABULARY, not as markup, from the archived app's dev panel:
// `/home/bam/systemsketch/src/SystemSketchUtilities.tsx:428-639` (every row
// hand-written JSX) and `/home/bam/systemsketch/src/developmentProfiles.ts`
// (`DEVELOPMENT_PRESETS` — the one part of the donor that was already data,
// and the shape this whole file generalizes). The donor's own row types,
// read off that JSX and off the screenshot Zach handed over
// (`/home/bam/zach_brain/Pasted image 20260919182230.png`), are the seven
// kinds below and nothing else.
//
// WHY: Zach, 2026-09-19, verbatim — "LIke the dev panel it self. should just
// use placeholders for things. it shouldn't it self kinda hold any of the
// actual things." So the panel owns NO domain knowledge: there is no `cable`
// row, no `behavior tree` row, no `preset` row and no `recording` row, and
// there is deliberately no way to add one. What the donor called "Cable
// presentation" is a SECTION TITLE a host passes as a string, and what it
// called `<RecorderControls />` is a `slot` row the host fills with its own
// element. That rejects the tempting alternative — a `kind: "recording"` row
// whose implementation lives here "because it's only a few lines" — because
// that is the move that made the donor a 211-line JSX wall that only
// SystemSketch could ever mount.
import type { ReactNode } from "react";

/** One choice in a `select` row. */
export interface DevPanelOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * How a `status` row's trailing badge reads. Deliberately four abstract
 * tones, never a domain word: the donor's own trailing marks were "Current"
 * (neutral state) and a release's health, and a host on a different product
 * will have its own. Each maps to a STOCK `Badge` variant in devPanel.tsx.
 */
export type DevPanelTone = "neutral" | "positive" | "warning" | "danger";

interface DevPanelRowBase {
  /** Unique across the whole panel. Stamped on the row's DOM as
   *  `data-row-id` and handed back to every callback, so a host can pass ONE
   *  handler for many rows and still know which one fired. */
  id: string;
  /** Rows a host wants to keep in its array but not show right now (the
   *  donor's `isPreview ? … : …` branches). See `visibleDevPanelSections` —
   *  hiding the last row of a section hides the section's header too. */
  hidden?: boolean;
}

/**
 * A fact, not an offer. Donor: the "Stable / Verified 0.1.0 · working
 * document / CURRENT" card. Not interactive on purpose — the donor's own
 * comment beside it reads "Where you already are is state, not an offer: no
 * call-out styling."
 */
export interface DevPanelStatusRow extends DevPanelRowBase {
  kind: "status";
  title: string;
  detail?: string;
  /** Trailing badge text, e.g. "CURRENT". */
  status?: string;
  tone?: DevPanelTone;
}

/** A bold title, a description under it, and a stock `Switch`. */
export interface DevPanelToggleRow extends DevPanelRowBase {
  kind: "toggle";
  title: string;
  description?: string;
  checked: boolean;
  onCheckedChange(checked: boolean, id: string): void;
  disabled?: boolean;
}

/**
 * The call-out card: an icon tile, a small-caps eyebrow, a title, a subtitle
 * and a trailing ↗. Donor: "NEW PREVIEW AVAILABLE / Open Latest Preview" and
 * "LIVE KNOBS · MEASURED SWAP COSTS / Drag Model Tuner".
 */
export interface DevPanelActionRow extends DevPanelRowBase {
  kind: "action";
  icon?: ReactNode;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  onSelect(id: string): void;
  disabled?: boolean;
  /** Replaces the trailing ↗ with an in-flight mark while the host works. */
  busy?: boolean;
  /** `"call-out"` (default) is the raised card; `"quiet"` is the same layout
   *  with no raise — the donor's "You are here" variant of the same row. */
  emphasis?: "call-out" | "quiet";
}

/** A lettered tile, a title, a subtitle and a trailing ↗. Donor: the two
 *  `DEVELOPMENT_PRESETS` rows ("B / Block Dev", "T / Stock tldraw"). */
export interface DevPanelAvatarRow extends DevPanelRowBase {
  kind: "avatar";
  /** One or two characters. The panel does not truncate it — see the
   *  truthful-rendering rule; a host that wants an initial passes an initial. */
  initial: string;
  title: string;
  subtitle?: string;
  onSelect(id: string): void;
  disabled?: boolean;
  busy?: boolean;
}

/** A label and a stock `Select`. Donor: the bottom-of-panel PROTOTYPE
 *  drop-down (`src/development/PrototypeSwitch.tsx`). */
export interface DevPanelSelectRow extends DevPanelRowBase {
  kind: "select";
  label: string;
  value: string;
  options: readonly DevPanelOption[];
  onValueChange(value: string, id: string): void;
  disabled?: boolean;
}

/**
 * A full-width row that leads somewhere: a title, a trailing detail and a
 * chevron. Donor: "Version & updates … 0.1.0 · Preview ready ›".
 *
 * WHY `expanded` is optional rather than the row owning a details pane:
 * undefined → a plain navigation row; a boolean → a disclosure (the chevron
 * turns and `aria-expanded` is set), and WHAT IT REVEALS is a `slot` row the
 * host puts after it. The panel must never learn what a release detail is.
 */
export interface DevPanelLinkRow extends DevPanelRowBase {
  kind: "link";
  title: string;
  detail?: string;
  onSelect(id: string): void;
  expanded?: boolean;
  disabled?: boolean;
}

/**
 * The escape hatch, and the reason the panel can stay ignorant: arbitrary
 * host content in a row-shaped box. This is how the donor's RECORDING
 * section (`<RecorderControls />`, a record button + a split menu) gets in
 * without this file ever hearing the word "recording".
 */
export interface DevPanelSlotRow extends DevPanelRowBase {
  kind: "slot";
  content: ReactNode;
}

export type DevPanelRow =
  | DevPanelStatusRow
  | DevPanelToggleRow
  | DevPanelActionRow
  | DevPanelAvatarRow
  | DevPanelSelectRow
  | DevPanelLinkRow
  | DevPanelSlotRow;

export type DevPanelRowKind = DevPanelRow["kind"];

/** Every kind the shell can render, in the order this file declares them.
 *  Exported so a story (and `devPanel.test.ts`) can prove the renderer
 *  handles all of them rather than a hand-kept subset. */
export const DEV_PANEL_ROW_KINDS = [
  "status",
  "toggle",
  "action",
  "avatar",
  "select",
  "link",
  "slot",
] as const satisfies readonly DevPanelRowKind[];

export interface DevPanelSection {
  id: string;
  /** Small-caps heading, e.g. "CABLE PRESENTATION". Optional: the donor's
   *  first two rows sit above any heading at all. */
  title?: string;
  /** Right-aligned scope caption beside the title, e.g. "THIS BROWSER,
   *  LIVE" — who and what a section's changes reach. A caption with no
   *  title renders nothing, because there is no header row to hang it on. */
  caption?: string;
  rows: readonly DevPanelRow[];
  hidden?: boolean;
}

/**
 * The sections actually worth painting: drops hidden sections, drops hidden
 * rows, then drops any section left with no rows.
 *
 * WHY the last clause: a host toggling rows off one at a time (the donor's
 * `isPreview ? … : …` branches, restated as data) otherwise ends up with a
 * "BEHAVIOR TREE" heading and a scope caption floating above nothing —
 * a header that promises content is a visible bug, and pushing the
 * bookkeeping onto every host is how one of them forgets. Pure: never
 * mutates its input, and the rows it returns are the same objects.
 */
export function visibleDevPanelSections(
  sections: readonly DevPanelSection[],
): DevPanelSection[] {
  const kept: DevPanelSection[] = [];
  for (const section of sections) {
    if (section.hidden) continue;
    const rows = section.rows.filter((row) => !row.hidden);
    if (rows.length === 0) continue;
    kept.push({ ...section, rows });
  }
  return kept;
}

/** Every visible row id, in paint order. */
export function devPanelRowIds(sections: readonly DevPanelSection[]): string[] {
  return visibleDevPanelSections(sections).flatMap((section) =>
    section.rows.map((row) => row.id),
  );
}

/**
 * Row ids that appear more than once among the visible rows, each reported
 * once, in first-seen order.
 *
 * WHY this is worth a function: the id is what every callback hands back, so
 * two rows sharing one makes the host's own handler ambiguous — and it is
 * silent, because both rows still render. `DevPanel` runs this in
 * development and warns; a host can run it over its own config in a test.
 */
export function duplicateDevPanelRowIds(
  sections: readonly DevPanelSection[],
): string[] {
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const id of devPanelRowIds(sections)) {
    if (seen.has(id)) duplicated.add(id);
    else seen.add(id);
  }
  return [...duplicated];
}

/**
 * The shadcn theme tokens the panel re-declares on its own root so its
 * surface is dark whatever the page around it is.
 *
 * WHY re-declare TOKENS instead of writing dark utility classes on each
 * element: this app has no `.dark` class variant — `src/globals.css:80-104`
 * flips the theme purely on `@media (prefers-color-scheme: dark)`, so
 * `dark:` utilities inside the stock primitives (`switch.tsx`'s
 * `dark:data-unchecked:bg-input/80`, `button.tsx`'s `dark:hover:bg-muted/50`)
 * are dead on a light page and no class this file writes could revive them.
 * Setting the variables on one root element makes every stock child resolve
 * dark automatically, through the seam shadcn already has, with zero
 * per-component overrides — and that is the whole reason the panel can be
 * dark while still being assembled entirely from stock parts.
 *
 * WHY dark at all: Zach's brief — "Keep the dark surface (it reads as a
 * developer tool, distinct from Settings)". SettingsView is the same stock
 * Dialog on the ambient theme; the colour is what tells them apart at a
 * glance.
 *
 * Values are copied verbatim from `src/globals.css`'s own dark block, and
 * `devPanel.test.ts` asserts they still match it character for character —
 * so a future theme edit cannot leave this panel painting last year's dark.
 */
export const DEV_PANEL_DARK_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  "--background": "oklch(0.145 0 0)",
  "--foreground": "oklch(0.985 0 0)",
  "--card": "oklch(0.205 0 0)",
  "--card-foreground": "oklch(0.985 0 0)",
  "--popover": "oklch(0.205 0 0)",
  "--popover-foreground": "oklch(0.985 0 0)",
  "--primary": "oklch(0.922 0 0)",
  "--primary-foreground": "oklch(0.205 0 0)",
  "--secondary": "oklch(0.269 0 0)",
  "--secondary-foreground": "oklch(0.985 0 0)",
  "--muted": "oklch(0.269 0 0)",
  "--muted-foreground": "oklch(0.708 0 0)",
  "--accent": "oklch(0.269 0 0)",
  "--accent-foreground": "oklch(0.985 0 0)",
  "--destructive": "oklch(0.704 0.191 22.216)",
  "--destructive-foreground": "oklch(0.145 0 0)",
  "--border": "oklch(1 0 0 / 10%)",
  "--input": "oklch(1 0 0 / 15%)",
  "--ring": "oklch(0.556 0 0)",
});
