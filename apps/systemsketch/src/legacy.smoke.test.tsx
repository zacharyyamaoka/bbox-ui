// src/legacy.smoke.test.tsx — the burger carries the door back to the
// archived SystemSketch, in its own group below the file rows.
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";

import { mountApp, type MountedApp } from "./testing/harness";
import { openBurger, rowsOf } from "./testing/menus";

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

describe("the switch to the old SystemSketch", () => {
  // AMENDED 2026-09-19 (docs/CHROME-FILES-SETTINGS-PLAN.md, by the planning
  // lane before any builder): with File as a submenu, "after the file rows"
  // could only pass vacuously — no Save row sits at the top level any more.
  // The honest reading of "in its own group below the file rows" is the one
  // asserted now: the LAST top-level row, behind its own separator.
  it("is the last row of the burger, in its own group", async () => {
    app = await mountApp();
    const root = await openBurger(app);
    const rows = rowsOf(root);
    expect(rows.at(-1)?.label).toBe("Switch to old SystemSketch");
    expect(rows[0]?.label).toBe("File");
    const lastSeparator = Array.from(root.querySelectorAll('[role="separator"]')).at(-1);
    expect(lastSeparator).toBeDefined();
    expect(lastSeparator!.compareDocumentPosition(rows.at(-1)!.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.keyboard("{Escape}");
  });
});
