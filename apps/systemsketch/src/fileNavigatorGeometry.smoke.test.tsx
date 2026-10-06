// src/fileNavigatorGeometry.smoke.test.tsx — the file browser's GEOMETRY,
// against the real mounted app and the real temp-root file host.
//
// Zach, 2026-09-22, with a screenshot: "please start an agent to fix the built
// in fiel viewer it has many issues right now, first of all its just way to
// long goes off the screen".
//
// Every claim here is `getBoundingClientRect` or a scroll measurement, never a
// class name and never DOM presence — the whole defect class is "the markup is
// right and the painted box is wrong", which a presence assertion cannot see.
// Under `zoom` the rulers genuinely disagree (`offsetWidth` reports the
// UNZOOMED border box), so `offsetWidth`/`offsetHeight` are banned here for the
// same reason `interfaceScale.smoke.test.tsx` bans them.
//
// WHY this lives beside `files.smoke.test.tsx` rather than in it: that file is
// the planning lane's committed acceptance for what the navigator DOES, and is
// off-limits. This one only measures where it PAINTS.
import { userEvent } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, inject, it } from "vitest";

import { INTERFACE_SCALE_STORAGE_KEY } from "@trunk/editor/interfaceScale";

import { setInterfaceScalePercent } from "./chrome/ShareMenu";
import { memoryDocumentLocation, resetLaunchConfig, setDocumentLocation, setFileHostBaseUrl } from "./files/launchConfig";
import { mountApp, nextFrame, waitFor, type MountedApp } from "./testing/harness";
import { runFileCommand } from "./testing/menus";

const host = inject("fileHost");

const NAVIGATOR = '[data-testid="ss-file-navigator"]';
const RECENTS_KEY = "systemsketch.recentDocuments.v1";
const SETTINGS_KEY = "systemsketch.settings.v1";

/**
 * A name long enough that the Name column's min-content width, left
 * un-truncated, pushes the two fixed columns past the table's box. This is the
 * "Modifie" in Zach's screenshot: the header is not mis-styled, it is scrolled
 * out of a container that never shows a scrollbar.
 */
const LONG_NAME = "A very long board name that keeps going and going and going for quite a while.bbox";

/** The smallest thing the Python host accepts as a board — it validates the
 *  format version on write, so `{}` is refused with a 409. */
const EMPTY_BOARD = JSON.stringify({ tldrawFileFormatVersion: 1, schema: { schemaVersion: 2, sequences: {} }, records: [] });

let app: MountedApp | null = null;

async function seed(path: string): Promise<void> {
  const response = await fetch(`${host.url}/api/workspace/file`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, source: EMPTY_BOARD, baseDigest: null, force: true }),
  });
  const body = (await response.json()) as { error?: string };
  // A silently-refused seed makes every case below fail as "the seeded rows
  // timed out", which names the harness instead of the defect.
  if (!response.ok || body.error) throw new Error(`seeding ${path} failed (${response.status}): ${body.error ?? "no body"}`);
}

beforeEach(async () => {
  expect(host.error, `the temp-root file host must be running for these tests:\n${host.error}`).toBe("");
  setFileHostBaseUrl(host.url);
  setDocumentLocation(memoryDocumentLocation({ initialBoard: null }));
  for (const key of [RECENTS_KEY, SETTINGS_KEY]) window.localStorage.removeItem(key);
  // Enough rows that the list genuinely overflows its pane at every scale.
  await Promise.all([
    ...Array.from({ length: 24 }, (_unused, index) => seed(`${host.workspace}/Geometry board ${String(index).padStart(2, "0")}.bbox`)),
    seed(`${host.workspace}/${LONG_NAME}`),
  ]);
});

afterEach(() => {
  app?.unmount();
  app = null;
  setInterfaceScalePercent(100);
  try {
    window.localStorage.removeItem(INTERFACE_SCALE_STORAGE_KEY);
  } catch {
    // The same swallow the production adapter uses.
  }
  for (const key of [RECENTS_KEY, SETTINGS_KEY]) window.localStorage.removeItem(key);
  resetLaunchConfig();
});

/* ------------------------------------------------------------ helpers */

async function applyScale(percent: number): Promise<void> {
  setInterfaceScalePercent(percent);
  await waitFor(() => document.documentElement.style.getPropertyValue("--ss-interface-scale") === String(percent / 100), {
    what: `--ss-interface-scale to become ${percent / 100}`,
  });
  await nextFrame();
  await nextFrame();
}

/** The box once it has STOPPED moving — every Base UI popup opens through a
 *  real enter animation, so a rect read on the first frame is mid-flight.
 *  Copied in reasoning from `interfaceScale.smoke.test.tsx`'s `settledRect`. */
async function settledRect(el: Element): Promise<DOMRect> {
  let previous = el.getBoundingClientRect();
  for (let attempt = 0; attempt < 60; attempt++) {
    await nextFrame();
    const now = el.getBoundingClientRect();
    if (
      Math.abs(now.x - previous.x) < 0.05 &&
      Math.abs(now.y - previous.y) < 0.05 &&
      Math.abs(now.width - previous.width) < 0.05 &&
      Math.abs(now.height - previous.height) < 0.05
    ) {
      return now;
    }
    previous = now;
  }
  return previous;
}

async function openNavigator(mounted: MountedApp): Promise<HTMLElement> {
  await runFileCommand(mounted, "Open…");
  const dialog = await waitFor(() => document.querySelector<HTMLElement>(`${NAVIGATOR}[data-mode="open"]`), { what: "the app navigator in Open mode" });
  await waitFor(() => document.querySelectorAll(`${NAVIGATOR} [data-testid="ss-file-navigator-row"]`).length > 10, { what: "the seeded rows" });
  await settledRect(dialog);
  return dialog;
}

async function closeNavigator(): Promise<void> {
  await userEvent.keyboard("{Escape}");
  await waitFor(() => !document.querySelector(NAVIGATOR), { what: "Escape closes the navigator" });
}

const part = (dialog: HTMLElement, id: string) => dialog.querySelector<HTMLElement>(`[data-testid="ss-file-navigator-${id}"]`)!;

/**
 * Reachable by a real click: the element's own centre is inside the window AND
 * the topmost box at that point belongs to it.
 *
 * WHY hit-testing and not only a bounds check: a control pushed past the fold
 * has a rect a bounds check can be argued about, but `elementFromPoint` answers
 * the one question that matters — if Zach puts the pointer there, does he press
 * Open? Measured before the fix, at 160%: `null`, because the centre was off
 * the bottom of the window.
 */
function reachable(el: HTMLElement): boolean {
  const box = el.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
  const hit = document.elementFromPoint(x, y);
  return hit !== null && (el === hit || el.contains(hit) || hit.contains(el));
}

function expectOnScreen(box: DOMRect, what: string): void {
  expect(box.top, `${what}: top edge on screen`).toBeGreaterThanOrEqual(-1);
  expect(box.left, `${what}: left edge on screen`).toBeGreaterThanOrEqual(-1);
  expect(box.bottom, `${what}: bottom edge on screen`).toBeLessThanOrEqual(window.innerHeight + 1);
  expect(box.right, `${what}: right edge on screen`).toBeLessThanOrEqual(window.innerWidth + 1);
}

/* ------------------------------------------------------------ cases */

describe("the file browser stays on screen and shows all three columns", () => {
  it("is fully on screen, with Cancel and Open reachable, at 100%, 125% and 160%", async () => {
    app = await mountApp();
    for (const percent of [100, 125, 160]) {
      await applyScale(percent);
      const dialog = await openNavigator(app);
      expectOnScreen(await settledRect(dialog), `the frame at ${percent}%`);
      // The two the screenshot lost. `Open in new window` sits between them,
      // so proving all three proves the row.
      for (const id of ["cancel", "open-in-new-window", "confirm"]) {
        const button = part(dialog, id);
        expectOnScreen(button.getBoundingClientRect(), `${id} at ${percent}%`);
        expect(reachable(button), `${id} is reachable by a real click at ${percent}%`).toBe(true);
      }
      await closeNavigator();
    }
  });

  it("sizes its FRAME against the real window, not the scaled one — the frame is scale-invariant", async () => {
    // This is the assertion the bounds check above cannot make, and the one
    // that actually pins the fix. `interface-scale.css` zooms every portaled
    // `[data-slot="dialog-content"]`, and a viewport length written inside a
    // zoomed layer resolves against the UNZOOMED viewport and then paints
    // scaled — so `max-h-[85vh]` at 160% painted 1.36x the window's height. A
    // frame that is the SAME number of painted pixels at every scale cannot be
    // doing that, at any window size, rather than happening to fit at this one.
    // Same argument and same shape as `settings.smoke.test.tsx`'s "at 160%
    // interface scale, the popup stays inside the window".
    app = await mountApp();

    await applyScale(100);
    let dialog = await openNavigator(app);
    const base = await settledRect(dialog);
    await closeNavigator();

    await applyScale(160);
    dialog = await openNavigator(app);
    const scaled = await settledRect(dialog);

    expect(scaled.height, "the frame's painted height does not move with the scale").toBeCloseTo(base.height, 0);
    expect(scaled.width, "the frame's painted width does not move with the scale").toBeCloseTo(base.width, 0);
  });

  it("scales what is INSIDE the frame, so the setting still does something", async () => {
    // The other half of the frame fix, and the one that keeps it honest: a
    // frame pinned to the real viewport must not also pin its contents, or
    // "fix the overflow" would be indistinguishable from "switch the interface
    // scale off for this dialog". Measured on the footer's primary button.
    app = await mountApp();

    await applyScale(100);
    let dialog = await openNavigator(app);
    const base = part(dialog, "confirm").getBoundingClientRect().height;
    expect(base, "the Open button has a real painted height").toBeGreaterThan(10);
    await closeNavigator();

    await applyScale(160);
    dialog = await openNavigator(app);
    const scaled = part(dialog, "confirm").getBoundingClientRect().height;

    expect(scaled / base, "160% paints the dialog's own controls at 1.6x").toBeCloseTo(1.6, 1);
  });

  it("never scrolls the file table sideways — 'Modified' is a whole word, not 'Modifie'", async () => {
    // The clip in Zach's screenshot. An un-truncated Name column makes the
    // table's min-content width exceed its container; `Table`'s own container
    // is `overflow-x-auto`, so the tail of the last column is simply scrolled
    // out of view with no bar to bring it back.
    app = await mountApp();
    const dialog = await openNavigator(app);

    const longRow = await waitFor(
      () => Array.from(dialog.querySelectorAll<HTMLElement>('[data-testid="ss-file-navigator-row"]')).find((row) => row.getAttribute("data-path")?.endsWith(LONG_NAME)),
      { what: "the long-named row" },
    );
    expect(longRow, "the stress row is listed").toBeTruthy();

    const container = dialog.querySelector<HTMLElement>('[data-slot="table-container"]')!;
    expect(container.scrollWidth, "the file table never overflows its container sideways").toBeLessThanOrEqual(container.clientWidth + 1);

    // …and the header it was clipping is inside the frame it belongs to.
    const modified = part(dialog, "sort-modified");
    const frame = dialog.getBoundingClientRect();
    expect(modified.getBoundingClientRect().right, "the Modified header is inside the dialog, not scrolled out of it").toBeLessThanOrEqual(frame.right + 1);
    expect(modified.scrollWidth, "the Modified label is not clipped by its own box").toBeLessThanOrEqual(modified.clientWidth + 1);

    // Truthful property rendering: the name that had to be shortened is still
    // available in full, so the ellipsis hides nothing.
    const nameCell = longRow!.querySelector<HTMLElement>("[data-name]")!;
    expect(nameCell.getAttribute("title"), "the shortened name keeps its complete value discoverable").toBe(LONG_NAME);
  });

  it("closes on Escape — the autofocused Filter field may swallow the key only when it has text to abandon", async () => {
    // Found while writing the cases above, not from the screenshot: the Filter
    // input is `autoFocus` in open mode and swallowed Escape UNCONDITIONALLY
    // (`preventDefault` + `stopPropagation` before `setQuery("")`), so the very
    // first Escape after opening the dialog did nothing at all and the
    // navigator could not be dismissed from the keyboard. Measured: still in
    // the DOM 10s later. `settingsView.tsx`'s search box already draws this
    // line in the other place it matters.
    app = await mountApp();
    const dialog = await openNavigator(app);
    expect(document.activeElement, "the Filter field has the focus on open").toBe(part(dialog, "filter"));

    // With text in it, Escape belongs to the field: the search is abandoned
    // and the dialog survives.
    await userEvent.type(part(dialog, "filter"), "Geometry");
    await waitFor(() => (part(dialog, "filter") as HTMLInputElement).value === "Geometry", { what: "the typed filter" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => (part(dialog, "filter") as HTMLInputElement).value === "", { what: "Escape clears the filter" });
    expect(document.querySelector(NAVIGATOR), "…and does NOT close the dialog out from under the search").toBeTruthy();

    // Empty, it belongs to the Dialog.
    await closeNavigator();
  });

  it("scrolls the list with an integrated ScrollArea, not a classic inset bar that steals layout width", async () => {
    // Zach's screenshot shows the chunky inset bar over the content. The
    // sibling settings panel already answers this — `settingsView.tsx`'s own
    // WHY records his word for it ("obsidan") — so the navigator matches it
    // rather than inventing a second treatment.
    app = await mountApp();
    const dialog = await openNavigator(app);

    // The LIST's ScrollArea by name, not "the first one in the dialog" — the
    // rail is a ScrollArea too and comes first in document order, so the loose
    // selector measured the rail and passed/failed on the wrong element.
    const list = part(dialog, "list");
    expect(list.getAttribute("data-slot"), "the list scrolls through a stock ScrollArea").toBe("scroll-area");
    const viewport = list.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    expect(viewport, "…with the stock viewport inside it").toBeTruthy();
    expect(viewport!.scrollHeight, "and it has more rows than fit, so the bar is real").toBeGreaterThan(viewport!.clientHeight + 1);
    expect(viewport!.scrollWidth, "the list never scrolls sideways").toBeLessThanOrEqual(viewport!.clientWidth + 1);
    // A classic bar is laid out INSIDE the box and steals width from the rows.
    expect(viewport!.clientWidth, "the scrollbar is an overlay, so the rows keep the full width").toBeCloseTo(viewport!.getBoundingClientRect().width, 0);
  });
});
