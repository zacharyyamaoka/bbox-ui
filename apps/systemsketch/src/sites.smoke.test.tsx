// src/sites.smoke.test.tsx — the burger really carries the two doors out, in
// the real mounted app (src/chrome/sites.ts). The unit test beside that file
// pins the rule; this pins that the rule reached the rendered dropdown.
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";

import { BBOX_UI_SITE_URL, STORYBOOK_URL } from "./chrome/sites";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
const originalOpen = window.open;
let restoreFetch: (() => void) | null = null;

afterEach(() => {
  window.open = originalOpen;
  app?.unmount();
  app = null;
  restoreFetch?.();
  restoreFetch = null;
});

/**
 * No Storybook dev server is running on :5421 in this test — a real probe
 * against it eventually reports `dead` (correct: that IS what "nothing is
 * listening" should read as — see `sites.ts`'s `useSiteActionsWithStatus`),
 * but takes long enough to resolve that a test asserting the row while it
 * is still LIVE would be racing real network timing. Same idiom as
 * `backendUrlCommit.smoke.test.tsx`'s `stubBackendRoutes`: answer
 * `STORYBOOK_URL`'s `/api/health` locally, leave everything else (the
 * harness's own page assets, bbox-ui.com — which this hook never fetches at
 * all, see `probeSiteStatus`'s remote short-circuit) on the real network.
 */
function stubStorybookHealth(respond: () => Response | Promise<Response>) {
  const real = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith(new URL("/api/health", STORYBOOK_URL).toString())) return respond();
    return real(input as RequestInfo, init);
  }) as typeof window.fetch;
  restoreFetch = () => {
    window.fetch = real;
  };
}

function healthyStorybookResponse(): Response {
  return new Response(
    JSON.stringify({
      product: "bbox-ui-storybook",
      channel: "preview",
      commit: "a1b2c3d4e5f6",
      branch: "lane-x",
      dirty: false,
      projectRoot: "/home/bam/bbox-ui",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

// WHY this reads text nodes rather than `item.textContent` (2026-09-22, the
// regression this file exists to guard against): a row's name has to stay
// stable even once it carries a live channel badge
// (`[data-slot="site-channel-badge"]`, `chrome/sites.ts`'s
// `useSiteActionsWithStatus`) — a chip rendered as a REAL sibling element
// inside the row, which is exactly why `.textContent` can no longer be the
// row's name: it walks every descendant text node regardless of what put it
// there. Same idea as the committed acceptance harness's own `labelOf`
// (`./testing/menus.ts`, off-limits to builders) — that one only ever had a
// shortcut column to exclude; this one also excludes the badge.
function labelOf(row: HTMLElement): string {
  const badge = row.querySelector('[data-slot="site-channel-badge"]');
  const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
  let text = "";
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (badge?.contains(node)) continue;
    text += node.nodeValue ?? "";
  }
  return text.trim();
}

/** Open the burger and return its rows, keyed by NAME (badge excluded — see `labelOf`). */
async function openBurger(): Promise<Map<string, HTMLElement>> {
  const burger = await waitFor(() => app!.root.querySelector<HTMLElement>('[data-testid="ss-chrome-burger"]'), { what: "burger" });
  await userEvent.click(burger);
  return waitFor(() => {
    const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    if (!items.length) return null;
    return new Map(items.map((item) => [labelOf(item), item]));
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
    stubStorybookHealth(healthyStorybookResponse);
    app = await mountApp();
    const opened: [string, string][] = [];
    window.open = ((url?: string | URL, target?: string) => {
      opened.push([String(url), String(target)]);
      return null;
    }) as typeof window.open;

    const here = window.location.href;
    const rows = await openBurger();
    // The row must be immediately clickable — it does not have to wait for
    // its probe to resolve first (see the dedicated test below), but with a
    // healthy stub in place it should resolve to enabled either way.
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

  it("a row's name stays exactly what it was even once a live channel badge renders beside it", async () => {
    // The regression this guards: a channel badge folded into `label` text
    // renamed the row ("Open Storybook (preview)" is not "Open Storybook"),
    // breaking every consumer that keys or clicks a row by its name. This
    // mounts for real, waits for the badge to actually appear (never
    // asserting on a row that hasn't finished probing — see
    // feedback_verify_before_asserting), and then proves BOTH halves at
    // once: the raw DOM has MORE text than the name alone (a badge really
    // rendered, this isn't a vacuous pass against an empty row), and the
    // name computed with the badge excluded is still the exact original
    // string.
    stubStorybookHealth(healthyStorybookResponse);
    app = await mountApp();
    const rows = await openBurger();
    const storybookRow = rows.get("Open Storybook");
    expect(storybookRow).toBeDefined();

    const badge = await waitFor(
      () => storybookRow!.querySelector<HTMLElement>('[data-slot="site-channel-badge"]'),
      { what: "the Storybook row's channel badge" },
    );
    expect(badge.textContent?.trim()).not.toBe("");
    // The raw row carries strictly more text than its name — proof the
    // badge is a REAL rendered sibling, not absent.
    expect(storybookRow!.textContent?.trim().length).toBeGreaterThan(labelOf(storybookRow!).length);
    // And the name itself — badge excluded — is untouched.
    expect(labelOf(storybookRow!)).toBe("Open Storybook");

    const siteRow = rows.get("Open bbox-ui.com")!;
    await waitFor(() => siteRow.querySelector('[data-slot="site-channel-badge"]'), { what: "the bbox-ui.com row's channel badge" });
    expect(labelOf(siteRow)).toBe("Open bbox-ui.com");

    await userEvent.keyboard("{Escape}");
  });

  it("a row stays enabled while its probe is still in flight, and only disables once it positively reports dead", async () => {
    // A probe that never resolves must never make the row unclickable —
    // hold it open deliberately (rather than racing real timing) so the
    // "still probing" window is observed for real, not assumed from how
    // fast the assertion happened to run.
    let resolveProbe: (() => void) | null = null;
    stubStorybookHealth(
      () =>
        new Promise<Response>((resolve) => {
          resolveProbe = () => resolve(new Response("{}", { status: 503 }));
        }),
    );
    app = await mountApp();
    const rows = await openBurger();
    const storybookRow = rows.get("Open Storybook")!;

    // Give the effect a tick to actually start the probe, then confirm it
    // is genuinely in flight (not already settled) before asserting.
    await waitFor(() => resolveProbe !== null, { what: "the Storybook probe to start" });
    expect(storybookRow.hasAttribute("data-disabled")).toBe(false);
    expect(storybookRow.getAttribute("aria-disabled")).not.toBe("true");

    // Now let it resolve to a non-OK response (`probeSiteStatus` reads that
    // as `dead`) and confirm the row — and ONLY now — disables.
    resolveProbe!();
    await waitFor(() => storybookRow.hasAttribute("data-disabled"), { what: "the row to disable once the probe reports dead" });
    expect(storybookRow.getAttribute("aria-disabled")).toBe("true");

    await userEvent.keyboard("{Escape}");
  });
});
