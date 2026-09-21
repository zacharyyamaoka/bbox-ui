// src/compare.smoke.test.tsx — Ruling 10's acceptance: the Compare view is
// REACHABLE, and what it shows is the real diff of the real board.
//
// WHY every assertion ends on something read back out of the comparison and
// not on a label: the failure this lane exists to end is a mechanism nothing
// consumes — a module with a green test and zero callers. A test that clicked
// a menu row and checked a dialog appeared would reproduce that failure
// exactly one layer up. So each test below changes the BOARD and then reads
// what the surface says about that change.
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";

import { mountApp, waitFor, type MountedApp } from "./testing/harness";
import { closeMenus, openBurger, rowsOf } from "./testing/menus";
import { BLOCK_SHAPE_TYPE } from "./shapes/types";

let app: MountedApp | null = null;

afterEach(() => {
  app?.unmount();
  app = null;
});

const NO_PORTS = { left: [], right: [], top: [], bottom: [] };

function addBlock(id: string, name: string, x = 120, y = 120, ports: unknown = NO_PORTS) {
  app!.editor.createShape({ id, type: BLOCK_SHAPE_TYPE, x, y, props: { name, view: "port", ports } } as never);
}

const dialog = () => document.querySelector<HTMLElement>('[data-testid="ss-compare-dialog"]');

/**
 * The Compare row's label, read and then PUT AWAY.
 *
 * WHY the menu is closed again before this resolves: the burger is a toggle,
 * so a second `openBurger` over an already-open menu closes it and then waits
 * on a popup that is being torn down — measured here as a 30s
 * "element was detached from the DOM" timeout, not as a product bug. A reader
 * that leaves state behind is not a reader.
 *
 * The row is found by LABEL PREFIX, never by a test id: the label carries the
 * live change count, which is what half these tests are about.
 */
async function compareLabel(): Promise<string> {
  const popup = await openBurger(app!);
  const label = rowsOf(popup).find((row) => row.label.startsWith("Compare"))?.label ?? "";
  await closeMenus();
  return label;
}

/** Click the burger row whose label starts with `prefix`. */
async function runMenuRow(prefix: string): Promise<void> {
  const popup = await openBurger(app!);
  const row = await waitFor(() => rowsOf(popup).find((candidate) => candidate.label.startsWith(prefix))?.element, {
    what: `the "${prefix}…" row in the burger`,
  });
  await userEvent.click(row as HTMLElement);
}

async function openCompare(): Promise<HTMLElement> {
  await runMenuRow("Compare");
  return waitFor(() => dialog(), { what: "the Compare dialog" });
}

describe("Compare is in the menu, and it counts before it is opened", () => {
  it("reads 'Compare changes…' on an untouched board — no count, because there is nothing to count", async () => {
    app = await mountApp();
    await expect.poll(compareLabel).toBe("Compare changes…");
  });

  it("counts a block added since the window opened, without the dialog being opened at all", async () => {
    app = await mountApp();
    addBlock("shape:c1" as never, "reader");
    await expect.poll(compareLabel).toMatch(/^Compare [1-9]\d* changes…$/);
  });
});

describe("The dialog shows the real diff of the real board", () => {
  it("opens on a block that was added, and names it in the change list", async () => {
    app = await mountApp();
    addBlock("shape:c1" as never, "reader");
    const modal = await openCompare();

    // The badge is `compareScenes`' tally, which is `diffScene`'s arithmetic —
    // a non-zero `added` badge is the engine having really walked two scenes.
    const added = modal.querySelector<HTMLElement>('[data-testid="ss-compare-badge-added"]');
    expect(added?.textContent ?? "", "the added badge").toMatch(/^[1-9]/);
    expect(modal.querySelector('[data-testid="ss-compare-summary"]')?.textContent ?? "").toMatch(/[1-9]/);

    // The block's NAME reaches the detail rail — an id would mean the bridge
    // never read the node's data.
    await waitFor(() => modal.textContent?.includes("reader"), { what: "the added block named in the review" });
  });

  it("marks the added block on the AFTER pane and nowhere on the before pane", async () => {
    app = await mountApp();
    addBlock("shape:c1" as never, "reader");
    const modal = await openCompare();

    const mark = await waitFor(() => modal.querySelector<HTMLElement>('[data-testid="ss-compare-mark-after-shape:c1"]'), {
      what: "the diff mark on the after pane",
    });
    expect(mark.getAttribute("data-operation")).toBe("added");
    // A block that did not exist in the baseline cannot be outlined there.
    expect(modal.querySelector('[data-testid="ss-compare-mark-before-shape:c1"]'), "no mark on the before pane").toBeNull();

    // SPATIAL, measured rather than asserted from the DOM's presence: the mark
    // is drawn over the pane that owns it, not at the origin of the dialog.
    const pane = modal.querySelector<HTMLElement>('[data-testid="ss-compare-pane-after"]')!;
    const paneBox = pane.getBoundingClientRect();
    const markBox = mark.getBoundingClientRect();
    expect(markBox.width, "the mark has a real box").toBeGreaterThan(0);
    expect(markBox.left).toBeGreaterThanOrEqual(paneBox.left - 1);
    expect(markBox.top).toBeGreaterThanOrEqual(paneBox.top - 1);
  });

  it("selecting a change in the detail rail lights that change's mark on the board", async () => {
    app = await mountApp();
    addBlock("shape:c1" as never, "reader");
    const modal = await openCompare();

    // The detail rail's default layout groups by ELEMENT, so the element is
    // opened first and its property row picked second — the same two clicks a
    // person makes.
    const element = await waitFor(() => modal.querySelector<HTMLElement>('[data-testid="compare-element-shape:c1"]'), {
      what: "the added block's row in the element list",
    });
    await userEvent.click(element);
    const row = await waitFor(() => modal.querySelector<HTMLElement>('[data-testid^="compare-row-node:shape:c1"]'), {
      what: "the block's property row",
    });
    await userEvent.click(row);

    // WHY this is the assertion and not "a row is highlighted": the point of
    // the surface is that picking a row in the list tells you WHERE on the
    // board it is. A selection that never reaches the pane is a list, not a
    // compare view.
    await waitFor(
      () => modal.querySelector('[data-testid="ss-compare-mark-after-shape:c1"]')?.getAttribute("data-selected") === "true",
      { what: "the mark to follow the selection" },
    );
  });

  it("says so plainly when nothing has changed, instead of showing an empty table", async () => {
    app = await mountApp();
    const modal = await openCompare();
    const problem = await waitFor(() => modal.querySelector<HTMLElement>('[data-testid="ss-compare-problem"]'), {
      what: "the empty-diff notice",
    });
    expect(problem.textContent ?? "").toMatch(/Nothing has changed since the baseline/);
  });

  it("closes from its own close control", async () => {
    app = await mountApp();
    const modal = await openCompare();
    await userEvent.click(modal.querySelector<HTMLElement>('[data-testid="ss-compare-close"]')!);
    await waitFor(() => !dialog(), { what: "the dialog to close" });
  });
});

describe("The baseline is re-settable, which is what makes it a compare and not a log", () => {
  it("re-baselining on the current board drops the count back to nothing", async () => {
    app = await mountApp();
    addBlock("shape:c1" as never, "reader");
    await expect.poll(compareLabel).toMatch(/^Compare [1-9]/);

    await runMenuRow("Set compare baseline");
    await closeMenus();

    await expect.poll(compareLabel).toBe("Compare changes…");

    // And the next edit is measured against the NEW baseline.
    addBlock("shape:c2" as never, "writer", 320, 120);
    await expect.poll(compareLabel).toMatch(/^Compare [1-9]/);
  });
});
