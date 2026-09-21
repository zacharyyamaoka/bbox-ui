// src/menuRows.smoke.test.tsx — the acceptance for P2-9 (independent Codex
// judge, VERDICT: FAIL, 2026-09-19).
//
// The finding: `src/chrome/FileMenu/stockMenus.ts` had suppressed the Edit ▸ Delete
// row's keyboard shortcut in the PRODUCT so that a BROKEN acceptance reader
// would go green. `src/testing/menus.ts`'s `rowsOf` recovered a row's label by
// subtracting the shortcut STRING from the row's full text, so "Delete" + "Del"
// read back as label "eteDel" — and the shipped menu lost a hint rather than
// the reader losing its bug.
//
// These two cases pin the repair from both ends, and they are NEW cases: no
// assertion anywhere else was weakened, skipped or re-scoped to let them pass.
//
//   1. the helper's own contract, against a synthetic popup built with the
//      exact markup `chromeBar.tsx`'s `BurgerMenuEntry` renders — no tldraw,
//      no app, so a failure here is unambiguously the reader's;
//   2. the real burger in the real app — Edit ▸ Delete must read back with
//      BOTH its full label and tldraw's own "Del" shortcut.
//
// Red-then-green, measured on this branch before the fix:
//   (1) expected [ 'Delete', 'Del' ] … actual [ 'eteDel', 'Del' ]
//   (2) expected [ 'Delete', 'Del' ] … actual [ 'Delete', '' ]
import { afterEach, describe, expect, it } from "vitest";

import { mountApp, type MountedApp } from "./testing/harness";
import { closeMenus, openBurger, openSubmenu, rowsOf } from "./testing/menus";

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

/**
 * One row exactly as `chromeBar.tsx`'s `BurgerMenuEntry` renders it: an
 * optional leading icon, the label in its own `<span class="truncate">`, then
 * the shortcut column in `[data-slot="dropdown-menu-shortcut"]`.
 *
 * Built node by node rather than from an HTML string on purpose — JSX emits no
 * whitespace text nodes between elements on separate lines, and a template
 * literal would, which would test a DOM the product never produces.
 */
function menuRow(options: { role?: string; icon?: boolean; label: string; shortcut?: string; checked?: boolean }): HTMLElement {
  const row = document.createElement("div");
  row.setAttribute("role", options.role ?? "menuitem");
  if (options.checked !== undefined) {
    // The stock checkbox row's tick, which sits BEFORE the children
    // (dropdown-menu.tsx's `DropdownMenuCheckboxItem`).
    const indicator = document.createElement("span");
    indicator.setAttribute("data-slot", "dropdown-menu-checkbox-item-indicator");
    indicator.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "svg"));
    row.appendChild(indicator);
    row.setAttribute("aria-checked", String(options.checked));
  }
  if (options.icon) row.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "svg"));
  const label = document.createElement("span");
  label.className = "truncate";
  label.textContent = options.label;
  row.appendChild(label);
  if (options.shortcut) {
    const shortcut = document.createElement("span");
    shortcut.setAttribute("data-slot", "dropdown-menu-shortcut");
    shortcut.textContent = options.shortcut;
    row.appendChild(shortcut);
  }
  return row;
}

describe("rowsOf reads a label from the row's own nodes, never by subtracting the shortcut", () => {
  it("a row whose label CONTAINS its shortcut still reads back with the whole label and the whole shortcut", () => {
    const popup = document.createElement("div");
    popup.setAttribute("data-slot", "dropdown-menu-content");
    // "Del" is a prefix of "Delete", and "Delete" is all of "Delete" — the two
    // collisions that string subtraction gets wrong ("eteDel" and "").
    popup.appendChild(menuRow({ label: "Delete", shortcut: "Del" }));
    popup.appendChild(menuRow({ label: "Delete", shortcut: "Delete" }));
    // Controls: a row with no collision, a row with a leading icon, a real
    // checkbox row with its tick, and a row with no shortcut column at all.
    popup.appendChild(menuRow({ label: "Save As…", shortcut: "Ctrl + ⇧ + S" }));
    popup.appendChild(menuRow({ icon: true, label: "New", shortcut: "Ctrl + N" }));
    popup.appendChild(menuRow({ role: "menuitemcheckbox", checked: false, label: "Always snap" }));
    popup.appendChild(menuRow({ label: "Copy Absolute Path" }));
    document.body.appendChild(popup);
    try {
      expect(rowsOf(popup).map((row) => [row.label, row.shortcut])).toEqual([
        ["Delete", "Del"],
        ["Delete", "Delete"],
        ["Save As…", "Ctrl + ⇧ + S"],
        ["New", "Ctrl + N"],
        ["Always snap", ""],
        ["Copy Absolute Path", ""],
      ]);
    } finally {
      popup.remove();
    }
  });

  it("Edit ▸ Delete ships tldraw's own Del shortcut, and the reader still sees the whole word", async () => {
    app = await mountApp();
    const edit = await openSubmenu(await openBurger(app), "Edit");
    const remove = rowsOf(edit).find((row) => row.label === "Delete");
    expect(remove, "an Edit ▸ row labelled exactly \"Delete\"").toBeDefined();
    // tldraw's action table spells it `kbd: '⌫,del'` (actions.tsx:1154) and the
    // trunk's `formatShortcut` prints every delete-ish token as "Del"
    // (appMenu.ts's `DELETE_KEYS`). The product must NOT drop that column to
    // keep a reader happy.
    expect([remove!.label, remove!.shortcut]).toEqual(["Delete", "Del"]);
    await closeMenus();
  });
});
