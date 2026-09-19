// src/legacy.smoke.test.tsx — the burger carries the door back to the
// archived SystemSketch, in its own group below the file rows.
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";

import { mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

describe("the switch to the old SystemSketch", () => {
  it("is a row in the burger, after the file rows", async () => {
    app = await mountApp();
    const burger = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-testid="ss-chrome-burger"]'), { what: "burger" });
    await userEvent.click(burger);
    const labels = await waitFor(() => {
      const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map((el) => el.textContent?.trim() ?? "");
      return items.length ? items : null;
    }, { what: "menu rows" });
    const legacy = labels.findIndex((label) => label === "Switch to old SystemSketch");
    const save = labels.findIndex((label) => /save/i.test(label));
    expect(legacy).toBeGreaterThan(-1);
    expect(legacy).toBeGreaterThan(save);
    await userEvent.keyboard("{Escape}");
  });
});
