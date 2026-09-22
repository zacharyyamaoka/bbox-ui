// src/sites.smoke.test.tsx — the burger really carries the two doors out, in
// the real mounted app (src/chrome/sites.ts). The unit test beside that file
// pins the rule; this pins that the rule reached the rendered dropdown.
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";

import { BBOX_UI_SITE_URL, STORYBOOK_URL } from "./chrome/sites";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
const originalOpen = window.open;

afterEach(() => {
  window.open = originalOpen;
  app?.unmount();
  app = null;
});

/** Open the burger and return its rows, keyed by trimmed label. */
async function openBurger(): Promise<Map<string, HTMLElement>> {
  const burger = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-testid="ss-chrome-burger"]'), { what: "burger" });
  await userEvent.click(burger);
  return waitFor(() => {
    const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    if (!items.length) return null;
    return new Map(items.map((item) => [item.textContent?.trim() ?? "", item]));
  }, { what: "menu rows" });
}

describe("the burger's doors out to the other bbox-ui surfaces", () => {
  it("lists Open bbox-ui.com and Open Storybook beside the file actions", async () => {
    app = await mountApp();
    const rows = await openBurger();
    expect([...rows.keys()]).toEqual(expect.arrayContaining(["Open bbox-ui.com", "Open Storybook"]));
    // Still a file menu first — the new group is additive, not a replacement.
    //
    // PORTED 2026-09-21: this read `/^new/i` against the TOP level, which held
    // when the burger listed File's actions directly. It does not now — the
    // burger opens with submenu triggers (File, Settings, Edit, View, Export,
    // Preferences, Keyboard shortcuts, Compare…, Switch to old SystemSketch)
    // and New lives inside File. The CLAIM is unchanged — a file menu is still
    // there and these rows did not displace it — so only the probe moved.
    expect([...rows.keys()]).toEqual(expect.arrayContaining(["File"]));
    await userEvent.keyboard("{Escape}");
  });

  it("each row opens its own surface in a NEW window, leaving this board where it is", async () => {
    app = await mountApp();
    const opened: [string, string][] = [];
    window.open = ((url?: string | URL, target?: string) => {
      opened.push([String(url), String(target)]);
      return null;
    }) as typeof window.open;

    const here = window.location.href;
    const rows = await openBurger();
    await userEvent.click(rows.get("Open Storybook")!);
    await waitFor(() => opened.length === 1, { what: "Storybook opened" });
    expect(opened[0]).toEqual([STORYBOOK_URL, "_blank"]);

    const again = await openBurger();
    await userEvent.click(again.get("Open bbox-ui.com")!);
    await waitFor(() => opened.length === 2, { what: "the site opened" });
    expect(opened[1]).toEqual([BBOX_UI_SITE_URL, "_blank"]);

    // The board is still the thing on screen.
    expect(window.location.href).toBe(here);
    expect(app.root.querySelector(".tl-canvas")).not.toBeNull();
  });
});
