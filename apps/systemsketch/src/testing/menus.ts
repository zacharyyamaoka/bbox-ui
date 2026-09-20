// src/testing/menus.ts — how a smoke test reads and drives the burger.
// Part of the committed acceptance harness (docs/CHROME-FILES-SETTINGS-PLAN.md);
// off-limits to builders.
//
// Every query goes through the trunk's own `data-slot`s (dropdown-menu.tsx):
// the root popup is `dropdown-menu-content`, a submenu's popup is
// `dropdown-menu-sub-content`, a row's shortcut column is
// `dropdown-menu-shortcut`. A row is anything with a menu-item role —
// `menuitem` (plain rows AND submenu triggers) or `menuitemcheckbox`.
// No test id is derived from display text; labels are READ, never used to
// build a selector — and a label is read from the row's own nodes, never by
// subtracting the shortcut's text from the row's (see `labelOf`).
import { userEvent } from "vitest/browser";

import { waitFor, type MountedApp } from "./harness";

const ROW_SELECTOR = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';

export interface MenuRow {
  element: HTMLElement;
  /** The row's own text without its shortcut column. */
  label: string;
  /** The shortcut column's text, or "" when the row has none. */
  shortcut: string;
}

/**
 * The row's label: every text node in the row EXCEPT the ones inside its
 * shortcut column. The tick of a `menuitemcheckbox` and a leading icon are
 * `<svg>`, which carries no text, so they cost nothing here.
 *
 * WHY the shortcut is removed as a NODE and not as a substring of the row's
 * `textContent`: a row is allowed to be labelled with its own shortcut. Edit ▸
 * Delete renders the text "Delete" immediately followed by the text "Del"
 * (tldraw spells the chord `'⌫,del'`, and the trunk's `formatShortcut` prints
 * every delete-ish token as "Del"), so `"DeleteDel".replace("Del", "")` — the
 * reading this helper used to do — returned **"eteDel"**. That is not a
 * cosmetic wrinkle in a test: it cost the shipped product a feature. A lane
 * took the red as a product defect and suppressed the Delete row's whole
 * shortcut column in `src/chrome/stockMenus.ts` so this reader would go green,
 * which is the acceptance harness dictating the UI. Reading what is
 * structurally left cannot express that pressure — the label and the shortcut
 * are separate elements in `chromeBar.tsx`'s `BurgerMenuEntry`, and they are
 * read separately here. Acceptance: `src/menuRows.smoke.test.tsx`.
 *
 * (Full-string equality was silently wrong the same way and looked right:
 * `"DeleteDelete".replace("Delete", "")` is `"Delete"` — a pass by accident.)
 */
function labelOf(row: HTMLElement, shortcutElement: Element | null): string {
  const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
  let text = "";
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (shortcutElement?.contains(node)) continue;
    text += node.nodeValue ?? "";
  }
  return text.trim();
}

/** The label and shortcut of every row directly in `popup` (not in nested popups). */
export function rowsOf(popup: Element): MenuRow[] {
  return Array.from(popup.querySelectorAll<HTMLElement>(ROW_SELECTOR))
    .filter((element) => element.closest('[data-slot="dropdown-menu-content"], [data-slot="dropdown-menu-sub-content"]') === popup)
    .map((element) => {
      const shortcutElement = element.querySelector('[data-slot="dropdown-menu-shortcut"]');
      const shortcut = shortcutElement?.textContent?.trim() ?? "";
      return { element, label: labelOf(element, shortcutElement), shortcut };
    });
}

/** How many separators sit directly in `popup`. */
export function separatorsOf(popup: Element): number {
  return Array.from(popup.querySelectorAll('[role="separator"]')).filter(
    (element) => element.closest('[data-slot="dropdown-menu-content"], [data-slot="dropdown-menu-sub-content"]') === popup,
  ).length;
}

/** Open the burger and resolve its root popup (waits for at least one row). */
export async function openBurger(app: MountedApp): Promise<HTMLElement> {
  const burger = await waitFor(() => app.root.querySelector<HTMLElement>('[data-testid="ss-chrome-burger"]'), { what: "the burger" });
  await userEvent.click(burger);
  return waitFor(() => {
    const popup = document.querySelector<HTMLElement>('[data-slot="dropdown-menu-content"]');
    return popup && rowsOf(popup).length ? popup : null;
  }, { what: "the burger's rows" });
}

/** Open the submenu whose trigger reads `label` inside `popup`; resolves the submenu popup. */
export async function openSubmenu(popup: HTMLElement, label: string): Promise<HTMLElement> {
  const before = new Set(document.querySelectorAll('[data-slot="dropdown-menu-sub-content"]'));
  const trigger = await waitFor(() => rowsOf(popup).find((row) => row.label === label)?.element, { what: `the "${label}" row` });
  await userEvent.click(trigger);
  return waitFor(() => {
    const opened = Array.from(document.querySelectorAll<HTMLElement>('[data-slot="dropdown-menu-sub-content"]')).filter((candidate) => !before.has(candidate));
    const withRows = opened.find((candidate) => rowsOf(candidate).length > 0);
    return withRows ?? null;
  }, { what: `the "${label}" submenu` });
}

/** Click the row reading `label` in `popup`. */
export async function clickRow(popup: HTMLElement, label: string): Promise<void> {
  const row = await waitFor(() => rowsOf(popup).find((candidate) => candidate.label === label)?.element, { what: `the "${label}" row` });
  await userEvent.click(row);
}

/** Burger → File → `label`. */
export async function runFileCommand(app: MountedApp, label: string): Promise<void> {
  const root = await openBurger(app);
  const file = await openSubmenu(root, "File");
  await clickRow(file, label);
}

/** Close whatever menu is open. */
export async function closeMenus(): Promise<void> {
  await userEvent.keyboard("{Escape}");
  await waitFor(() => !document.querySelector('[data-slot="dropdown-menu-content"]'), { what: "menus closed" }).catch(() => undefined);
}
